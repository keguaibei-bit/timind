// 简易静态文件服务器（零依赖，用 Node.js 运行）
// 用法: node server.js
// 手机访问: http://<电脑IP>:8000/
var http = require('http');
var fs = require('fs');
var path = require('path');

var PORT = 8000;
var ROOT = __dirname;

var MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json'
};

var server = http.createServer(function (req, res) {
    var urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';

    var filePath = path.join(ROOT, urlPath);

    // 防止目录穿越
    if (filePath.indexOf(ROOT) !== 0) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, function (err, data) {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found: ' + urlPath);
            return;
        }
        var ext = path.extname(filePath).toLowerCase();
        var mime = MIME[ext] || 'application/octet-stream';
        // 不缓存，方便调试
        res.writeHead(200, {
            'Content-Type': mime,
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(data);
    });
});

server.listen(PORT, '0.0.0.0', function () {
    console.log('[Timind] 服务器已启动:');
    console.log('  本机访问: http://localhost:' + PORT + '/');
    console.log('  手机访问: http://<本机IP>:' + PORT + '/');
    console.log('  按 Ctrl+C 停止');
});
