// Most frequent background shade, robust against isolated text pixels.
export function dominantColor(samples) {
  const buckets=new Map();
  for(const pixel of samples){
    if(pixel.length<3||pixel.some(v=>!Number.isFinite(v)))continue;
    const rgb=pixel.slice(0,3).map(v=>Math.max(0,Math.min(255,Math.round(v))));
    const key=rgb.map(v=>Math.floor(v/16)).join(',');
    const group=buckets.get(key)||[];group.push(rgb);buckets.set(key,group);
  }
  const group=[...buckets.values()].sort((a,b)=>b.length-a.length)[0];
  if(!group)return '#ffffff';
  return '#'+[0,1,2].map(i=>Math.round(group.reduce((sum,p)=>sum+p[i],0)/group.length).toString(16).padStart(2,'0')).join('');
}
