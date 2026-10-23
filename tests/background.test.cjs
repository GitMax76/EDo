const {test}=require('node:test');
const assert=require('node:assert/strict');
test('background sampling preserves cream and ignores text pixels',async()=>{
 const {dominantColor}=await import('../docs/background.mjs');
 assert.equal(dominantColor([[248,242,225],[248,242,225],[0,0,0]]),'#f8f2e1');
 assert.equal(dominantColor([[255,255,255],[255,255,255],[30,30,30]]),'#ffffff');
 assert.equal(dominantColor([]),'#ffffff');
});
