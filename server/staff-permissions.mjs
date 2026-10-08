export const staffCapabilities = {
 productSales:'Product sales', oilSales:'Oil sales', payments:'Payments & receipts', counter:'Order counter', restaurant:'Tables & tabs', register:'Cash register', customers:'Customer accounts', inventory:'Inventory and product changes', purchasing:'Purchasing and suppliers', stocktake:'Stock counts', movements:'Stock movements', sales:'Sales history', refunds:'Refunds and returns', serviceJobs:'Jobs and invoices', production:'Preparation and production', church:'Church collections', reports:'Reports and profit', activity:'Staff activity', configuration:'Workspace and device configuration'
}
export function parsePermissions(value) { if(value==null||value==='null'||value==='')return null; const input=typeof value==='string'?JSON.parse(value):value; if(!input||Array.isArray(input)||typeof input!=='object')throw new Error('Choose staff access using the checkboxes.'); const result={};for(const key of Object.keys(input)){if(!Object.hasOwn(staffCapabilities,key)||typeof input[key]!=='boolean')throw new Error('Invalid staff permission.');result[key]=input[key]}return result }
export function effectivePermissions(user) {
 const explicit=parsePermissions(user?.permissions);if(explicit)return explicit
 const all=user?.role==='owner'||user?.role==='admin'; const operational=all||user?.operationalAccess; const selling=['productSales','oilSales','payments','counter','restaurant','register'];return Object.fromEntries(Object.keys(staffCapabilities).map(key=>[key,Boolean(all||selling.includes(key)||(operational&&!['reports','activity','configuration'].includes(key)))]))
}
export function hasPermission(user,key){return Boolean(user&&(user.role==='owner'||effectivePermissions(user)[key]))}
export function screenPermission(screen){return {POS:'productSales',RetailOrders:'productSales',Oil:'oilSales',Payments:'payments',Counter:'counter',Restaurant:'restaurant',Register:'register',Wallet:'customers',Inventory:'inventory',Stocktake:'stocktake',Movements:'movements',Sales:'sales',Reports:'reports',Activity:'activity',Settings:'configuration',Device:'configuration',Sync:'configuration',Owner:'reports',Display:'productSales'}[screen]}
export function routePermission(path,method='GET',input={}){
 path=path.split('?')[0]
 if(path==='/api/integrations/support/requests')return null
 if(path.startsWith('/api/integrations/receipts/send'))return 'checkoutRead'
 if(path.startsWith('/api/integrations/paystack/')&& !path.endsWith('/config'))return 'checkoutRead'
 if(path.startsWith('/api/backups')||path.startsWith('/api/till-recovery'))return 'owner'
 if(path==='/api/branch-transfers')return 'inventory'
 if(['/api/sync/now','/api/sync/pull','/api/sync/status'].includes(path))return null
 if(path.startsWith('/api/preparation-print'))return 'production'
 if(path.startsWith('/api/customer-display'))return 'productSales'
 if(path.startsWith('/api/users')||path==='/api/account/delete'||path.startsWith('/api/business-backup'))return 'owner'
 if(path.startsWith('/api/auth')||path==='/api/health'||path==='/api/settings'&&method==='GET'||path==='/api/branches'&&method==='GET'||path==='/api/subscriptions/access')return null
 if(path==='/api/pos')return 'posRead'
 if(path==='/api/pos/receipt-settings'&&method==='GET')return null
 if(path.startsWith('/api/pos/returns'))return 'refunds'
 if(path.startsWith('/api/pos/service-jobs'))return 'serviceJobs'
 if(path.startsWith('/api/pos/stock-work'))return 'production'
 if(path.startsWith('/api/pos/church'))return 'church'
 if(path.endsWith('/counter/status')&&input.deliveryAction)return path.startsWith('/api/pos/restaurant')?'restaurant':'counter'
 if(path.endsWith('/counter/status')&&['preparing','ready'].includes(input.status))return 'production'
 if(path.startsWith('/api/pos/restaurant/counter/menu')||path.startsWith('/api/pos/counter/menu')||path==='/api/pos/restaurant/layout'||path.startsWith('/api/pos/settings')||path==='/api/pos/receipt-settings')return 'configuration'
 if(path.startsWith('/api/pos/retail-orders'))return 'retailSelling'
 if(path.startsWith('/api/pos/restaurant'))return 'restaurant'
 if(path.startsWith('/api/pos/counter'))return 'counter'
 if(path.startsWith('/api/pos/registers'))return 'register'
 if(path.startsWith('/api/pos/products')||path==='/api/pos/oil-pricing')return 'inventory'
 if(path.startsWith('/api/pos/baskets'))return input.workspace==='oil'?'oilSales':'productSales'
 if(path.startsWith('/api/retail'))return 'purchasing'
 if(path.startsWith('/api/stocktakes'))return 'stocktake'
 if(path.startsWith('/api/movements'))return 'movements'
 if(path.startsWith('/api/reports')||path.startsWith('/api/owner')||path.startsWith('/api/expenses'))return 'reports'
 if(path.startsWith('/api/staff/activity'))return 'activity'
 if(path.startsWith('/api/customers'))return method==='GET'?'catalogueRead':'customers'
 if(path==='/api/sales'&&method==='POST'&&input.paymentDetails?.counterOrder)return input.paymentDetails.counterOrder.retailOrder?(input.paymentDetails.pos?.workspace==='oil'?'oilSales':'productSales'):input.paymentDetails.counterOrder.tableService?'restaurant':'counter'
 if(path==='/api/sales'&&method==='POST')return input.paymentDetails?.pos?.workspace==='oil'?'oilSales':input.items?.every(row=>String(row.productId).startsWith('service:'))?'payments':'productSales'
 if(path.startsWith('/api/sales'))return method==='GET'?'salesRead':'sales'
 if(path.startsWith('/api/products'))return method==='GET'?'catalogueRead':'inventory'
 if(path.startsWith('/api/settings')||path.startsWith('/api/sync')||path.startsWith('/api/branches'))return 'configuration'
 return 'configuration'
}
export function canRequest(user,path,method='GET',input={}){
 if(!user)return false;if(user.role==='owner')return true
 const key=routePermission(path,method,input);if(key==='owner')return false
 if(!parsePermissions(user.permissions))return true
 if(key==='retailSelling')return hasPermission(user,'productSales')||hasPermission(user,'oilSales')
 if(key==='posRead')return Object.values(effectivePermissions(user)).some(Boolean)
 if(key==='checkoutRead')return ['productSales','oilSales','payments','counter','restaurant','serviceJobs','sales','refunds'].some(key=>hasPermission(user,key))
 if(key==='salesRead')return hasPermission(user,'sales')||hasPermission(user,'refunds')
 if(key==='catalogueRead')return ['inventory','purchasing','stocktake','customers','productSales','oilSales','payments','counter','restaurant','serviceJobs','production'].some(key=>hasPermission(user,key))
 return !key||hasPermission(user,key)
}

export function operationPermission(operation){
 const p=operation.payload||{},kind=p.kind||''
 if(operation.entityType==='sale')return routePermission('/api/sales','POST',p)
 if(operation.entityType==='pos_record'){
  if(kind==='service-job')return 'serviceJobs'
  if(kind==='return')return 'refunds'
  if(kind==='register')return 'register'
  if(kind==='product')return 'inventory'
  if(kind.includes('menu')||kind==='settings'||kind==='receipt-settings')return 'configuration'
  if(kind.startsWith('church-'))return 'church'
  if(kind==='counter-order'&&p.retailOrder)return p.pos?.workspace==='oil'?'oilSales':'productSales'
  if(kind==='counter-order')return p.restaurantOrder?'restaurant':'counter'
  if(kind.startsWith('restaurant-'))return 'restaurant'
  if(kind==='service-materials'||kind.includes('production')||kind.includes('consumption')||kind.startsWith('stock-'))return 'production'
  if(kind==='basket')return p.workspace==='oil'?'oilSales':'productSales'
 }
 return {product:'inventory',inventory:'inventory',stocktake:'stocktake',movement:'movements',wallet:'customers',customer:'customers',expense:'reports',retail_record:'purchasing',settings:'configuration',branch:'configuration',staff_removal:'owner'}[operation.entityType]||null
}
