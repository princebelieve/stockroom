import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { serviceJobBalance, createHostedServiceJobPayment } from '../server/service-jobs.mjs'

const cents=value=>Math.round(Number(value)*100)
const expiration=()=>new Date(Date.now()+365*24*60*60*1000)
function readRaw(request,limit=32768){return new Promise((resolve,reject)=>{const chunks=[];let size=0;request.on('data',chunk=>{size+=chunk.length;if(size>limit){reject(Object.assign(new Error('Payment webhook request is too large.'),{statusCode:413}));request.destroy();return}chunks.push(chunk)});request.on('end',()=>resolve(Buffer.concat(chunks)));request.on('error',reject)})}

export function createHospitalityPayments({database,entityHeads,operations,businessSettings,accounts,customerPortalAccounts,verifyToken,readJson,send,serialize,configFor,env=process.env,fetcher=fetch,ObjectId}){
  const sessions=database.collection('hospitality_payment_sessions')
  const initializing=new Set()
  const rateLimits=new Map()
  const ensure=async()=>{
    await sessions.createIndex({businessId:1,customerId:1,requestId:1},{unique:true})
    await sessions.createIndex({state:1},{unique:true})
    await sessions.createIndex({reference:1},{unique:true,sparse:true})
    await sessions.createIndex({expiresAt:1},{expireAfterSeconds:0})
  }
  const paystack=async(config,reference)=>{
    const response=await fetcher(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,{headers:{Authorization:`Bearer ${config.secretKey}`},signal:AbortSignal.timeout(20000)})
    const result=await response.json().catch(()=>({}))
    if(!response.ok||result.status!==true||!result.data)throw new Error(`Paystack verification failed (${response.status}).`)
    return result.data
  }
  const redirect=(response,session,status)=>{
    const origin=env.SUBSCRIPTION_PUBLIC_URL||env.VITE_PUBLIC_APP_URL||'https://stockroom.globalcreest.com/'
    const target=new URL('/',origin);target.searchParams.set('customer',session.businessId);target.searchParams.set('catalog',session.mode);target.searchParams.set('hospitalityPayment',status)
    response.writeHead(303,{Location:target.toString(),'Cache-Control':'no-store'});response.end()
  }
  const accountClaims=async request=>{
    const claims=verifyToken(request)
    if(claims?.kind!=='customer')return null
    if(claims.guest)return claims.customerId&&claims.businessId?claims:null
    if(!ObjectId.isValid(claims.sub))return null
    const account=await customerPortalAccounts.findOne({_id:new ObjectId(claims.sub),businessId:claims.businessId,customerId:claims.customerId,active:true})
    if(!account||claims.authVersion!==new Date(account.updatedAt||account.createdAt).getTime())return null
    return claims
  }
  const invoiceForCustomer=async(businessId,customerId,invoiceId)=>{
    const head=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:invoiceId})
    const job=head?.payload
    if(!job||job.kind!=='service-job'||!job.hospitality||(job.customerId!==customerId&&job.customerPortalId!==customerId)||job.status==='cancelled'||job.status==='estimate')throw new Error('This active hospitality invoice is not linked to your customer account.')
    const booking=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:job.hospitality.recordId})
    if(!booking||(booking.payload.customerId!==customerId&&booking.payload.customerPortalId!==customerId)||!['hotel-stay','nightclub-entry','nightclub-inquiry'].includes(booking.payload.kind))throw new Error('This hospitality booking is not linked to your customer account.')
    const saleIds=(job.payments||[]).map(entry=>entry.sale.id),refundRows=saleIds.length?await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'return','payload.saleId':{$in:saleIds}}).toArray():[]
    return {head,job,balance:serviceJobBalance(job,refundRows.map(row=>row.payload)),booking}
  }
  const finalize=async(session,transaction)=>{
    const metadata=typeof transaction.metadata==='string'?(()=>{try{return JSON.parse(transaction.metadata)}catch{return {}}})():transaction.metadata||{}
    if(transaction.status!=='success'||String(transaction.reference)!==session.reference||Number(transaction.amount)!==session.amount||String(transaction.currency).toUpperCase()!==session.currency||metadata.paymentState!==session.state||metadata.businessId!==session.businessId||metadata.invoiceId!==session.invoiceId)throw new Error('Paystack payment details do not match the hospitality invoice.')
    return serialize(session.businessId,async()=>{
      const currentSession=await sessions.findOne({businessId:session.businessId,state:session.state})
      if(currentSession?.status==='paid')return 'paid'
      if(!currentSession||!['initializing','initialized','uncertain','needs-review'].includes(currentSession.status)||currentSession.reference!==transaction.reference)throw new Error('This payment session has expired or was already resolved.')
      const {head,job,balance,booking}=await invoiceForCustomer(session.businessId,session.customerId,session.invoiceId)
      const prior=job.payments?.find(entry=>entry.sale.paymentReference===session.reference&&entry.sale.terminalProvider==='Paystack')
      if(prior){const operationId=`hospitality-paystack:${session.reference}`;await operations.updateOne({businessId:session.businessId,operationId},{$setOnInsert:{businessId:session.businessId,operationId,deviceId:'paystack-online',entityType:'pos_record',entityId:session.invoiceId,action:'upsert',payload:job,createdAt:job.updatedAt,receivedAt:new Date()}},{upsert:true});await sessions.updateOne({businessId:session.businessId,state:session.state,status:{$in:['initializing','initialized','uncertain','needs-review']}},{$set:{status:'paid',paidAt:prior.sale.createdAt,paystackTransactionId:String(transaction.id)}});return 'paid'}
      if(booking.id!==session.bookingId||cents(balance.due)!==session.amount)throw new Error('The invoice balance changed after checkout began. Contact the business to reconcile this payment.')
      const createdAt=new Date().toISOString(),payment=createHostedServiceJobPayment(job,{amount:session.amount/100,reference:session.reference,transactionId:String(transaction.id),createdAt})
      const operationId=`hospitality-paystack:${session.reference}`,updated=await entityHeads.updateOne({businessId:session.businessId,entityType:'pos_record',entityId:session.invoiceId,operationId:head.operationId},{$set:{payload:payment.job,updatedAt:createdAt,operationId,deviceId:'paystack-online'}})
      if(!updated.modifiedCount)throw new Error('The invoice changed while payment was being recorded. Contact the business with your Paystack reference.')
      await operations.updateOne({businessId:session.businessId,operationId},{$setOnInsert:{businessId:session.businessId,operationId,deviceId:'paystack-online',entityType:'pos_record',entityId:session.invoiceId,action:'upsert',payload:payment.job,createdAt,receivedAt:new Date()}},{upsert:true})
      await sessions.updateOne({businessId:session.businessId,state:session.state,status:{$in:['initializing','initialized','uncertain','needs-review']}},{$set:{status:'paid',paidAt:createdAt,paystackTransactionId:String(transaction.id)}})
      return 'paid'
    })
  }
  async function handle(request,response,url){
    const path=url.pathname
    if(path==='/v1/customer-portal/hospitality/payments/start'&&request.method==='POST'){
      const claims=await accountClaims(request);if(!claims)return send(response,401,{error:'Sign in to the linked customer account to pay this invoice.'})
      const rateKey=`${String(request.socket.remoteAddress||'')}:${claims.businessId}:${claims.customerId}`,rateNow=Date.now(),priorRate=rateLimits.get(rateKey),window=priorRate?.until>rateNow?priorRate:{count:0,until:rateNow+15*60*1000};if(window.count>=20)return send(response,429,{error:'Too many checkout requests. Wait fifteen minutes before trying again.'});rateLimits.set(rateKey,{...window,count:window.count+1});if(rateLimits.size>10000)for(const [key,value] of rateLimits)if(value.until<=rateNow)rateLimits.delete(key)
      const input=await readJson(request,4096),requestId=String(input.requestId||''),invoiceId=String(input.invoiceId||''),email=String(input.email||'').trim().toLowerCase()
      if(!/^[a-zA-Z0-9_-]{12,100}$/.test(requestId)||!invoiceId||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return send(response,400,{error:'Enter a valid invoice, checkout request ID and email address.'})
      const config=await configFor(claims.businessId);if(!config)return send(response,503,{error:'Online Paystack collection is not configured for this business.'})
      try{
        const saved=await businessSettings.findOne({businessId:claims.businessId}),sessionFilter={businessId:claims.businessId,customerId:claims.customerId,requestId}
        let session=await sessions.findOne(sessionFilter)
        if(session){if(session.invoiceId!==invoiceId||session.email!==email)return send(response,409,{error:'This checkout request is already linked to different payment details.'});if(session.status==='initialized')return send(response,200,{authorizationUrl:session.authorizationUrl});return send(response,409,{error:'This payment request is already being processed. Refresh the invoice and check its payment status before retrying.'})}
        const {job,balance,booking}=await serialize(claims.businessId,()=>invoiceForCustomer(claims.businessId,claims.customerId,invoiceId))
        if(!saved||await database.collection('account_deletion_requests').findOne({type:'business',businessId:claims.businessId,status:{$in:['pending','processing']}}))return send(response,403,{error:'This business is not accepting online payments.'})
        if(balance.due<=0)return send(response,409,{error:'This invoice has no remaining balance.'})
        const amount=cents(balance.due),state=randomBytes(32).toString('base64url'),reference=`SR-${randomBytes(15).toString('hex')}`,mode=booking.kind==='hotel-stay'?'hotel':'nightlife',cloudOrigin=(env.RENDER_EXTERNAL_URL||'https://stockroom-0vm5.onrender.com').replace(/\/$/,'')
        session={...sessionFilter,state,reference,invoiceId,bookingId:booking.id,amount,currency:job.currency,mode,email,status:'initializing',expiresAt:expiration(),createdAt:new Date()}
        const reserved=await serialize(claims.businessId,async()=>{const sameRequest=await sessions.findOne(sessionFilter);if(sameRequest)return sameRequest;const active=await sessions.findOne({businessId:claims.businessId,invoiceId,status:{$in:['initializing','initialized','uncertain','needs-review']}});if(active)return active;await sessions.insertOne(session);return session})
        if(reserved.state!==state){if(reserved.requestId===requestId&&reserved.invoiceId===invoiceId&&reserved.email===email&&reserved.status==='initialized')return send(response,200,{authorizationUrl:reserved.authorizationUrl});return send(response,409,{error:'Another checkout for this invoice is already being processed. Refresh the invoice before starting a new one.'})}
        session=reserved
        if(initializing.has(state))return send(response,409,{error:'This payment request is already being initialized.'})
        initializing.add(state)
        try{
          const callbackUrl=`${cloudOrigin}/v1/customer-portal/hospitality/paystack-return?state=${encodeURIComponent(state)}`
          const responseFromPaystack=await fetcher('https://api.paystack.co/transaction/initialize',{method:'POST',headers:{Authorization:`Bearer ${config.secretKey}`,'Content-Type':'application/json'},body:JSON.stringify({email,amount:String(amount),currency:job.currency,reference,callback_url:callbackUrl,metadata:JSON.stringify({paymentState:state,businessId:claims.businessId,invoiceId,customerId:claims.customerId,bookingId:booking.id})}),signal:AbortSignal.timeout(20000)})
          const result=await responseFromPaystack.json().catch(()=>({})),data=result.data
          if(!responseFromPaystack.ok||result.status!==true||data?.reference!==reference||!/^https:\/\/checkout\.paystack\.com\//.test(data?.authorization_url||''))throw new Error(`Paystack could not start checkout (${responseFromPaystack.status}).`)
          await sessions.updateOne({businessId:claims.businessId,state,status:'initializing'},{$set:{status:'initialized',authorizationUrl:data.authorization_url,accessCode:data.access_code||''}})
          return send(response,200,{authorizationUrl:data.authorization_url})
        }catch(error){await sessions.updateOne({businessId:claims.businessId,state,status:'initializing'},{$set:{status:'uncertain',initializationError:String(error.message||'').slice(0,250)}});return send(response,502,{error:'Paystack checkout could not be confirmed as started. Check the provider dashboard before retrying this invoice.'})}
        finally{initializing.delete(state)}
      }catch(error){return send(response,error.statusCode||400,{error:error.message||'Could not start hospitality invoice payment.'})}
    }
    if(path==='/v1/customer-portal/hospitality/paystack-return'&&request.method==='GET'){
      const state=String(url.searchParams.get('state')||''),session=state?await sessions.findOne({state}):null
      if(!session)return send(response,400,{error:'This payment return link is invalid or expired.'})
      if(session.status==='paid'){redirect(response,session,'success');return true}
      const config=await configFor(session.businessId)
      try{const transaction=await paystack(config,session.reference);if(transaction.status!=='success'){const failed=['failed','abandoned','reversed'].includes(transaction.status);if(failed)await sessions.updateOne({state,status:'initialized'},{$set:{status:'failed',failureReason:transaction.status}});redirect(response,session,failed?'failed':'pending')}else{try{await finalize(session,transaction);redirect(response,session,'success')}catch(error){await sessions.updateOne({state,status:'initialized'},{$set:{status:'needs-review',failureReason:String(error.message||'').slice(0,250)}});redirect(response,session,'pending')}}}
      catch{redirect(response,session,'pending')}
      return true
    }
    if(path==='/v1/customer-portal/hospitality/paystack-webhook'&&request.method==='POST'){
      const raw=await readRaw(request),signature=String(request.headers['x-paystack-signature']||'')
      let body;try{body=JSON.parse(raw.toString('utf8'))}catch{return send(response,400,{error:'Invalid Paystack webhook payload.'})}
      const reference=String(body?.data?.reference||''),session=reference?await sessions.findOne({reference}):null
      if(!session)return send(response,200,{received:true})
      const config=await configFor(session.businessId);if(!config)return send(response,503,{error:'Paystack account configuration is unavailable.'})
      const expected=createHmac('sha512',config.secretKey).update(raw).digest('hex')
      if(Buffer.byteLength(signature)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return send(response,401,{error:'Invalid Paystack webhook signature.'})
      if(body.event==='charge.success')try{await finalize(session,await paystack(config,reference))}catch{return send(response,409,{error:'Payment is verified but could not yet be applied to the invoice.'})}
      return send(response,200,{received:true})
    }
    return false
  }
  return {ensure,handle}
}
