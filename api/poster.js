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
    // Check webp and png in Supabase storage CDN
    try {
      const webpUrl = `${SUPABASE_URL}/storage/v1/object/public/posters/${id}.webp`;
      const pngUrl = `${SUPABASE_URL}/storage/v1/object/public/posters/${id}.png`;

      const headWebp = await fetch(webpUrl, { method: 'HEAD' });
      if (headWebp.ok) {
        res.setHeader('Location', webpUrl);
        res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
        if (typeof res.redirect === 'function') return res.redirect(307, webpUrl);
        res.statusCode = 307;
        return res.end();
      }

      const headPng = await fetch(pngUrl, { method: 'HEAD' });
      if (headPng.ok) {
        res.setHeader('Location', pngUrl);
        res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
        if (typeof res.redirect === 'function') return res.redirect(307, pngUrl);
        res.statusCode = 307;
        return res.end();
      }
    } catch (_) {}

    // 3. Self-Healing on demand: If neither exists, generate from post prompt in Supabase
    try {
      let geminiKey = process.env.GEMINI_API_KEY || '';
      if (!geminiKey) {
        try {
          const envContent = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
          const m = envContent.match(/GEMINI_API_KEY=([^\r\n]+)/);
          if (m) geminiKey = m[1].trim();
        } catch (_) {}
      }

      if (geminiKey) {
        const pResp = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(id)}&select=data`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        if (pResp.ok) {
          const pRows = await pResp.json();
          const postData = pRows?.[0]?.data;
          const prompt = postData?.illustrationPrompt || postData?.adaptedHeadline;
          if (prompt) {
            const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${geminiKey}`;
            const gResp = await fetch(modelUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: `${prompt}, 4:5 vertical portrait format, dramatic atmospheric mood, painterly texture, dramatic lighting, high aesthetic, vivid color grading, masterwork, no typography, no letters, no text.` }] }],
                generationConfig: {
                  responseModalities: ['IMAGE'],
                  imageConfig: { aspectRatio: '3:4' }
                }
              })
            });
            if (gResp.ok) {
              const gData = await gResp.json();
              const inlinePart = gData.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
              if (inlinePart && inlinePart.inlineData?.data) {
                const cleanB64 = inlinePart.inlineData.data;
                const buf = Buffer.from(cleanB64, 'base64');

                // Persist to Supabase Storage in background
                for (const uploadExt of ['webp', 'png']) {
                  try {
                    await fetch(`${SUPABASE_URL}/storage/v1/object/posters/${id}.${uploadExt}`, {
                      method: 'POST',
                      headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'image/webp',
                        'x-upsert': 'true'
                      },
                      body: buf
                    });
                  } catch (_) {}
                }

                // Update post data so artworkPending is cleared
                try {
                  postData.illustrationUrl = `${SUPABASE_URL}/storage/v1/object/public/posters/${id}.webp`;
                  postData.aiIllustrationUrl = postData.illustrationUrl;
                  postData.artworkPending = false;
                  await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(id)}`, {
                    method: 'PATCH',
                    headers: {
                      'apikey': SUPABASE_KEY,
                      'Authorization': `Bearer ${SUPABASE_KEY}`,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ data: postData })
                  });
                } catch (_) {}

                return sendImageBuffer(res, buf, 'image/webp');
              }
            }
          }
        }
      }
    } catch (healErr) {
      console.warn('Poster self-healing error:', healErr.message);
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
