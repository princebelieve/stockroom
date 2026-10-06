import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
const source=stripTypeScriptTypes(readFileSync(new URL('../src/lib/qrCode.ts',import.meta.url),'utf8'))
const {qrMatrix}=await import(`data:text/javascript,${encodeURIComponent(source)}`)

// Read a version 1 byte-mode symbol independently of the encoder, using its
// function-pattern geometry and the declared mask. Also check ECC syndromes.
function readVersionOne(matrix) {
 const n=21,reserved=Array.from({length:n},()=>Array(n).fill(false))
 function mark(x,y){if(x>=0&&y>=0&&x<n&&y<n)reserved[y][x]=true}
 for(const [x,y] of [[0,0],[14,0],[0,14]])for(let dx=0;dx<7;dx++)for(let dy=0;dy<7;dy++)mark(x+dx,y+dy)
 for(let i=0;i<9;i++){mark(i,7);mark(7,i);mark(13+i,7);mark(13,i);mark(i,13);mark(7,13+i)}
 for(let i=0;i<n;i++){mark(6,i);mark(i,6)}
 const primary=[[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]]
 const secondary=[...Array.from({length:8},(_,i)=>[20-i,8]),...Array.from({length:7},(_,i)=>[8,14+i])]
 const format=positions=>positions.reduce((bits,[x,y],i)=>bits|(Number(matrix[y][x])<<i),0)
 assert.equal(format(primary),0x77c4);assert.equal(format(secondary),0x77c4)
 for(const [x,y] of [...primary,...secondary,[8,13]])mark(x,y)
 const bits=[]
 for(let x=n-1,up=true;x>0;x-=2,up=!up){if(x===6)x--;for(let step=0;step<n;step++){const y=up?n-1-step:step;for(const col of [x,x-1])if(!reserved[y][col])bits.push(Number(matrix[y][col])^Number((y+col)%2===0))}}
 assert.equal(bits.length,208)
 const words=Array.from({length:26},(_,i)=>bits.slice(i*8,i*8+8).reduce((v,b)=>v*2+b,0))
 const gf=(a,b)=>{let v=0;while(b){if(b&1)v^=a;a=(a<<1)^((a&128)?0x11d:0);b>>=1}return v}
 for(let root=1,i=0;i<7;i++,root=gf(root,2))assert.equal(words.reduce((v,b)=>gf(v,root)^b,0),0,'invalid error correction')
 const integer=(start,count)=>bits.slice(start,start+count).reduce((v,b)=>v*2+b,0)
 assert.equal(integer(0,4),4)
 return new TextDecoder().decode(Uint8Array.from({length:integer(4,8)},(_,i)=>integer(12+i*8,8)))
}
test('QR symbols preserve byte data, format information and error correction',()=>{
 for(const value of ['hello','https://x.co/a','café'])assert.equal(readVersionOne(qrMatrix(value)),value)
})
test('QR capacities use the declared number of data blocks',()=>{
 for(const [bytes,size] of [[17,21],[18,25],[32,25],[33,29],[53,29],[54,33],[78,33],[79,37],[106,37],[107,41],[134,41],[135,45],[154,45],[155,49],[192,49]])assert.equal(qrMatrix('x'.repeat(bytes)).length,size)
 assert.throws(()=>qrMatrix('x'.repeat(193)),/too long/)
})

test('real customer links and multi-block symbols round-trip with valid ECC', () => {
 const specs = [[1,19,7],[1,34,10],[1,55,15],[1,80,20],[1,108,26],[2,68,18],[2,78,20],[2,97,24]]
 const align = [[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42]]
 const gf = (a,b) => { let result=0; while(b){if(b&1)result^=a;a=(a<<1)^((a&128)?0x11d:0);b>>=1}return result }
 for (const value of ['https://stockroom.globalcreest.com/?customer=business-1234567890', ...[17,32,53,78,106,134,154,192].map(n=>'x'.repeat(n))]) {
  const matrix=qrMatrix(value), n=matrix.length, version=(n-17)/4
  const reserved=Array.from({length:n},()=>Array(n).fill(false))
  const mark=(x,y)=>{if(x>=0&&y>=0&&x<n&&y<n)reserved[y][x]=true}
  for(const [x,y] of [[0,0],[n-7,0],[0,n-7]])for(let dx=-1;dx<=7;dx++)for(let dy=-1;dy<=7;dy++)mark(x+dx,y+dy)
  for(const x of align[version-1])for(const y of align[version-1]) {
   if((x===6&&y===6)||(x===6&&y===n-7)||(y===6&&x===n-7))continue
   for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++)mark(x+dx,y+dy)
  }
  for(let i=8;i<n-8;i++){mark(6,i);mark(i,6)}
  for(let i=0;i<9;i++){mark(8,i);mark(i,8)}
  for(let i=0;i<8;i++){mark(n-1-i,8);mark(8,n-1-i)}
  if(version>=7)for(let i=0;i<6;i++)for(let j=n-11;j<n-8;j++){mark(i,j);mark(j,i)}
  const bits=[]
  for(let x=n-1,up=true;x>0;x-=2,up=!up){if(x===6)x--;for(let step=0;step<n;step++){const y=up?n-1-step:step;for(const col of [x,x-1])if(!reserved[y][col])bits.push(Number(matrix[y][col])^Number((y+col)%2===0))}}
  const [count,dataLength,eccLength]=specs[version-1]
  const words=Array.from({length:count*(dataLength+eccLength)},(_,i)=>bits.slice(i*8,i*8+8).reduce((v,b)=>v*2+b,0))
  const blocks=Array.from({length:count},()=>[])
  words.forEach((word,i)=>blocks[i%count].push(word))
  for(const block of blocks)for(let root=1,i=0;i<eccLength;i++,root=gf(root,2))assert.equal(block.reduce((v,b)=>gf(v,root)^b,0),0,`ECC in version ${version}`)
  const data=blocks.flatMap(block=>block.slice(0,dataLength)).flatMap(word=>Array.from({length:8},(_,i)=>(word>>(7-i))&1))
  const integer=(start,length)=>data.slice(start,start+length).reduce((v,b)=>v*2+b,0)
  assert.equal(integer(0,4),4)
  assert.equal(new TextDecoder().decode(Uint8Array.from({length:integer(4,8)},(_,i)=>integer(12+i*8,8))),value)
 }
})
