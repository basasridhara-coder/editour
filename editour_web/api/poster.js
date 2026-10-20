const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://fxfklefnkpmhofncqhfh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4ZmtsZWZua3BtaG9mbmNxaGZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NzM4NzYsImV4cCI6MjEwODA0OTg3Nn0.0nw5ZDvlEsYal6EYXcqyaAPRHoxkXxZgDsNQDppEYgM';

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

    id = String(id).replace(/\.png$/i, '').replace(/\.webp$/i, '').trim();

    // 1. Check if the static poster file exists on disk
    const candidateDirs = [
      path.join(__dirname, '../public/posters'),
      path.join(__dirname, '../web_feed/posters'),
      path.join(__dirname, 'public/posters')
    ];

    for (const dir of candidateDirs) {
      for (const ext of ['webp', 'png', 'jpg']) {
        const filePath = path.join(dir, `${id}.${ext}`);
        if (fs.existsSync(filePath)) {
          const buf = fs.readFileSync(filePath);
          return sendImageBuffer(res, buf);
        }
      }
    }

    // 2. Direct edge redirect to Supabase Public Storage CDN
    // This avoids database roundtrips and serves through Cloudflare edge caching
    try {
      const webpUrl = `${SUPABASE_URL}/storage/v1/object/public/posters/${id}.webp`;
      const headResp = await fetch(webpUrl, { method: 'HEAD' });
      const targetUrl = headResp.ok ? webpUrl : `${SUPABASE_URL}/storage/v1/object/public/posters/${id}.png`;

      res.setHeader('Location', targetUrl);
      res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
      return res.status(307).end();
    } catch (_) {
      const fallbackUrl = `${SUPABASE_URL}/storage/v1/object/public/posters/${id}.webp`;
      res.setHeader('Location', fallbackUrl);
      res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
      return res.status(307).end();
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
