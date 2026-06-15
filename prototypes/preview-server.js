const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = 8173;
const host = "127.0.0.1";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${host}:${port}`);
  const relativePath = url.pathname === "/" ? "exam-structure-practice-demo.html" : url.pathname.slice(1);
  const fullPath = path.resolve(root, relativePath);

  if (!fullPath.startsWith(root)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(fullPath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const contentType = contentTypes[path.extname(fullPath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

server.listen(port, host, () => {
  console.log(`Preview running at http://${host}:${port}/`);
});
