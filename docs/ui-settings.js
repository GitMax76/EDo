
if(location.protocol==='file:'){document.getElementById('file-help').hidden=false;}
function edofaLargeUI(big){document.body.classList.toggle('extra-large',big);const button=document.getElementById('large-ui');button.setAttribute('aria-pressed',big);button.textContent=big?'Dimensione normale':'Testo più grande';button.title=big?'Torna alla dimensione normale':'Ingrandisci il testo dei pulsanti e delle istruzioni';}
try{edofaLargeUI(localStorage.getItem('edofa-large-ui')==='true');}catch(e){}
document.getElementById('large-ui').addEventListener('click',function(){const big=!document.body.classList.contains('extra-large');edofaLargeUI(big);try{localStorage.setItem('edofa-large-ui',String(big));}catch(e){}window.dispatchEvent(new Event('resize'));});
