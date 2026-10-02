const http = require('http');

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('TENGEN BOT is alive ✅');
}).listen(PORT, () => {
    console.log(`🌐 السيرفر يعمل على المنفذ ${PORT}`);
});