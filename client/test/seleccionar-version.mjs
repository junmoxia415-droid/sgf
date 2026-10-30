import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const script=fs.readFileSync(fileURLToPath(new URL('../seleccionar-version.js',import.meta.url)),'utf8');
function destino(ua, capacidades=true) {
  let url;
  const css=capacidades ? {supports:()=>true,registerProperty:()=>{}} : {supports:()=>false};
  vm.runInNewContext(script,{navigator:{userAgent:ua},window:{CSS:css,location:{search:'?prueba=1',hash:'#ok',replace:v=>{url=v;}}}});
  return url;
}
const esperado=(ua,moderna,capacidades=true)=>assert.equal(destino(ua,capacidades),`/${moderna?'moderna':'compat'}/index.html?prueba=1#ok`,ua);
esperado('Mozilla/5.0 Firefox/80.0',false);
esperado('Mozilla/5.0 Firefox/127.0',false);
esperado('Mozilla/5.0 Firefox/128.0',true);
esperado('Mozilla/5.0 Chrome/110.0.0.0 Safari/537.36',false);
esperado('Mozilla/5.0 Chrome/111.0.0.0 Safari/537.36',true);
esperado('Mozilla/5.0 Version/16.3 Safari/605.1',false);
esperado('Mozilla/5.0 Version/16.4 Safari/605.1',true);
esperado('Mozilla/5.0 Firefox/140.0',false,false);
esperado('navegador desconocido',false);
console.log('OK: selección conservadora, límites de versión, capacidades y URL.');
