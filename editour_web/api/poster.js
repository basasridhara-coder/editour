const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://fsuukgpizuipxxwatkbo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzdXVrZ3BpenVpcHh4d2F0a2JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMzE4NjEsImV4cCI6MjEwNjcwNzg2MX0.NPnTDhGyiigPZIvror8JGqjCMVKuJ8OZaDN2pGuVfM8';

function sendImageBuffer(res, buf, mimeType = 'image/png') {
  if (buf && buf.length > 4) {
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) {
      mimeType = 'image/jpeg';
    } else if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
      mimeType = 'image/png';
    } else if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
      mimeType = 'image/webp';
    }
  }
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
  if (typeof res.send === 'function') {
    return res.status ? res.status(200).send(buf) : res.send(buf);
  }
  res.statusCode = 200;
  return res.end(buf);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status ? res.status(200).end() : res.end();
  }

  try {
    let id = '';
    if (req.query && req.query.id) {
      id = req.query.id;
    } else {
      const url = new URL(req.url, 'http://localhost');
      id = url.searchParams.get('id') || '';
    }

    if (!id) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      if (res.status) return res.status(400).send('Missing poster id');
      res.statusCode = 400;
      return res.end('Missing poster id');
    }

    id = String(id).replace(/\.png$/i, '').trim();

    // 1. Check if the static poster file exists on disk
    const candidateDirs = [
      path.join(__dirname, '../public/posters'),
      path.join(__dirname, '../web_feed/posters'),
      path.join(__dirname, 'public/posters')
    ];

    for (const dir of candidateDirs) {
      const filePath = path.join(dir, `${id}.png`);
      if (fs.existsSync(filePath)) {
        const buf = fs.readFileSync(filePath);
        return sendImageBuffer(res, buf);
      }
    }

    // 2. Fetch poster directly from Supabase by post ID
    const supaResp = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(id)}&select=data`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    if (supaResp.ok) {
      const rows = await supaResp.json();
      const row = rows && rows[0];
      const post = (row && (row.data || row)) || null;

      if (post) {
        const rawB64 = post.posterBase64 || post.illustrationBase64 || post.originalPhotoBase64;
        if (rawB64) {
          const cleanB64 = rawB64.replace(/^data:image\/[^;]+;base64,/, '');
          const buf = Buffer.from(cleanB64, 'base64');
          return sendImageBuffer(res, buf);
        }
      }
    }

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    if (res.status) return res.status(404).send('Poster image not found');
    res.statusCode = 404;
    return res.end('Poster image not found');
  } catch (err) {
    console.error('Poster endpoint error:', err);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    if (res.status) return res.status(500).send('Error serving poster');
    res.statusCode = 500;
    return res.end('Error serving poster');
  }
};
