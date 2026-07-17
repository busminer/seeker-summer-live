const http = require('http');
const fs = require('fs');
const path = require('path');
const { getState } = require('./api/state');
const root = __dirname;
const port = Number(process.env.PORT || 4173);
const mime = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg' };
http.createServer(async (req,res)=>{
  if(req.url.startsWith('/api/state')){
    try{const body=await getState();res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify(body))}
    catch(error){res.writeHead(502,{'content-type':'application/json'});return res.end(JSON.stringify({error:error.message}))}
  }
  if(req.url.startsWith('/api/health')){res.writeHead(200,{'content-type':'application/json'});return res.end('{"ok":true}')}
  const clean=decodeURIComponent(req.url.split('?')[0]);const relative=clean==='/'?'index.html':clean.replace(/^\/+/, '');const file=path.resolve(root,relative);
  if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end('Not found')}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
}).listen(port,'127.0.0.1',()=>console.log(`Seeker Summer live at http://127.0.0.1:${port}`));
