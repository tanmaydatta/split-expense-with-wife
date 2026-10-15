// Local synthetic UI preview only. API requests are intercepted by the Playwright spec.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../build");
const mime = {".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json", ".png":"image/png", ".svg":"image/svg+xml", ".ico":"image/x-icon"};
http.createServer((request,response)=>{
 const pathname=new URL(request.url,"http://localhost").pathname;
 let file=path.resolve(root,`.${pathname}`);
 if(!file.startsWith(`${root}${path.sep}`)&&file!==root){response.writeHead(404);response.end();return;}
 if(!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(root,"index.html");
 if(!fs.existsSync(file)){response.writeHead(503);response.end("Build the UI first");return;}
 response.writeHead(200,{"Content-Type":mime[path.extname(file)]??"application/octet-stream"});fs.createReadStream(file).pipe(response);
}).listen(4326,"127.0.0.1");
