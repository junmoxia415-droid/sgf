// Proceso ficticio de laboratorio; no lee archivos ni credenciales de SGF.
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const estado = process.argv[2], puerto = Number(process.argv[3]);
const servidor = http.createServer((req,res) => {
  if (req.url !== '/prueba') {res.writeHead(404);res.end();return;}
  res.writeHead(200, {'content-type':'application/json'});
  res.end(JSON.stringify({servicio:'sgf-laboratorio', pid:process.pid, usuario:os.userInfo().username}));
});
servidor.listen(puerto,'0.0.0.0',()=>fs.writeFileSync(estado,JSON.stringify({pid:process.pid,usuario:os.userInfo().username})));
