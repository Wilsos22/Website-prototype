const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = '/Users/steelewilson/Documents/Website prototype/number-blaster';
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css'};
http.createServer((req,res)=>{
  let p = decodeURIComponent(req.url.split('?')[0]);
  if(p==='/') p='/index.html';
  const fp = path.join(ROOT, p);
  if(!fp.startsWith(ROOT)){ res.writeHead(403); return res.end('no'); }
  fs.readFile(fp,(e,data)=>{
    if(e){ res.writeHead(404); return res.end('not found'); }
    res.writeHead(200,{'Content-Type':types[path.extname(fp)]||'application/octet-stream'});
    res.end(data);
  });
}).listen(8731, ()=>console.log('listening on 8731'));
