const http = require('http');
const fs = require('fs');
const path = require('path');
const postsHandler = require('./api/posts');
let synthesizeHandler;
let scrapeHandler;
let cuesHandler;
try {
  synthesizeHandler = require('./api/synthesize');
} catch (e) {
  console.warn('Could not load synthesizeHandler:', e.message);
}
try {
  scrapeHandler = require('./api/scrape');
} catch (e) {
  console.warn('Could not load scrapeHandler:', e.message);
}
try {
  cuesHandler = require('./api/cues');
} catch (e) {
  console.warn('Could not load cuesHandler:', e.message);
}

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // API Route: Posts
  if (url.pathname.startsWith('/api/posts')) {
    const handle = async () => {
      res.status = (code) => {
        res.statusCode = code;
        return {
          json: (data) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
          },
          end: () => res.end()
        };
      };
      await postsHandler(req, res);
    };

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        req.body = body;
        await handle();
      });
      return;
    } else {
      await handle();
      return;
    }
  }

  // API Route: Synthesize
  if (url.pathname.startsWith('/api/synthesize') && synthesizeHandler) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      req.body = body;
      res.status = (code) => {
        res.statusCode = code;
        return {
          json: (data) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
          },
          end: () => res.end()
        };
      };
      await synthesizeHandler(req, res);
    });
    return;
  }

  // API Route: Scrape
  if (url.pathname.startsWith('/api/scrape') && scrapeHandler) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      req.body = body;
      res.status = (code) => {
        res.statusCode = code;
        return {
          json: (data) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
          },
          end: () => res.end()
        };
      };
      await scrapeHandler(req, res);
    });
    return;
  }

  // API Route: Cues
  if (url.pathname.startsWith('/api/cues') && cuesHandler) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      req.body = body;
      res.status = (code) => {
        res.statusCode = code;
        return {
          json: (data) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
          },
          end: () => res.end()
        };
      };
      await cuesHandler(req, res);
    });
    return;
  }

  // Static files
  let subPath = url.pathname === '/' ? 'index.html' : (url.pathname === '/login' ? 'login.html' : url.pathname);
  let filePath = path.join(PUBLIC_DIR, subPath);
  const ext = path.extname(filePath).toLowerCase();

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e, html) => {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(html);
        });
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`✨ Editour local server running at http://localhost:${PORT}`);
});
