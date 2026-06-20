const http = require('http'), fs = require('fs'), path = require('path');
http.createServer((req, res) => {
  const f = path.join(__dirname, 'public', decodeURIComponent(req.url === '/' ? 'index.html' : req.url.slice(1)));
  try { res.end(fs.readFileSync(f)); } catch (e) { res.statusCode = 404; res.end('not found'); }
}).listen(5173);
