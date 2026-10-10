// Serverless Function for editour.app
// Supports GET (fetch live feed from Supabase) and POST (publish post from PostCard app)

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://fsuukgpizuipxxwatkbo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzdXVrZ3BpenVpcHh4d2F0a2JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMzE4NjEsImV4cCI6MjEwNjcwNzg2MX0.NPnTDhGyiigPZIvror8JGqjCMVKuJ8OZaDN2pGuVfM8';

let fallbackPosts = [];
try {
  const slantPath = path.join(__dirname, '../public/slant_feed.json');
  const dataPath = path.join(__dirname, '../public/postcards_data.json');
  if (fs.existsSync(slantPath)) {
    fallbackPosts = JSON.parse(fs.readFileSync(slantPath, 'utf8'));
  } else if (fs.existsSync(dataPath)) {
    fallbackPosts = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  }
} catch (e) {
  console.warn('Could not read slant_feed.json:', e);
}

module.exports = async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Parse limit and offset parameters (default 12 for clean batched feed)
    let limit = 12;
    let baseOffset = 0;
    try {
      const parsedUrl = new URL(req.url, 'http://localhost');
      const qLimit = parseInt(parsedUrl.searchParams.get('limit'), 10);
      if (!isNaN(qLimit) && qLimit > 0) {
        limit = Math.min(qLimit, 24);
      }
      const qOffset = parseInt(parsedUrl.searchParams.get('offset'), 10);
      if (!isNaN(qOffset) && qOffset >= 0) {
        baseOffset = qOffset;
      }
    } catch (_) {}

    // 1. Primary: Direct Supabase query using resilient small chunks to avoid statement timeouts
    try {
      const fetchBatch = async (offset, count) => {
        try {
          const resp = await fetch(`${SUPABASE_URL}/rest/v1/posts?select=id,created_at,data&order=created_at.desc&offset=${offset}&limit=${count}`, {
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`
            }
          });
          if (!resp.ok) return [];
          return await resp.json();
        } catch (_) {
          return [];
        }
      };

      let rows = [];
      if (limit <= 6) {
        rows = await fetchBatch(baseOffset, limit);
      } else {
        const half = Math.ceil(limit / 2);
        const [c1, c2] = await Promise.all([
          fetchBatch(baseOffset, half),
          fetchBatch(baseOffset + half, limit - half)
        ]);
        rows = [...(Array.isArray(c1) ? c1 : []), ...(Array.isArray(c2) ? c2 : [])];
      }

      if (Array.isArray(rows) && rows.length > 0) {
        const posts = rows.map(r => {
          const p = r.data || r;
          p.id = p.id || r.id;
          p.createdAt = p.createdAt || r.created_at || new Date().toISOString();

          // If static poster image exists in /posters/, serve ultra-fast static URL and strip 2.5MB base64 bloat
          const posterFile = path.join(__dirname, '../public/posters', p.id + '.png');
          if (fs.existsSync(posterFile) || (p.illustrationUrl && p.illustrationUrl.startsWith('/posters/'))) {
            p.illustrationUrl = '/posters/' + p.id + '.png?v=2';
            p.aiIllustrationUrl = '/posters/' + p.id + '.png?v=2';
            delete p.illustrationBase64;
            delete p.originalPhotoBase64;
          } else if (p.illustrationBase64) {
            p.illustrationUrl = '';
            p.aiIllustrationUrl = '';
          }

          // Clean up any motherboard, palette, or unrelated sea photo fallback URLs
          const isActuallyBeach = /beach|coast|ocean|sea|shore|sand|surf/i.test((p.heroCue || '') + ' ' + (p.adaptedHeadline || ''));
          if (p.illustrationUrl && (p.illustrationUrl.includes('photo-1518770660439') || p.illustrationUrl.includes('photo-1541872703') || (!isActuallyBeach && p.illustrationUrl.includes('photo-1507525428034')))) {
            p.illustrationUrl = '';
          }
          if (p.aiIllustrationUrl && (p.aiIllustrationUrl.includes('photo-1518770660439') || p.aiIllustrationUrl.includes('photo-1541872703') || (!isActuallyBeach && p.aiIllustrationUrl.includes('photo-1507525428034')))) {
            p.aiIllustrationUrl = '';
          }

          // Sanitize any legacy pollinations URLs
          if (p.illustrationUrl && p.illustrationUrl.includes('pollinations.ai')) {
            p.illustrationUrl = '/posters/' + p.id + '.png';
            p.aiIllustrationUrl = p.illustrationUrl;
          }
          if (p.aiIllustrationUrl && p.aiIllustrationUrl.includes('pollinations.ai')) {
            p.aiIllustrationUrl = p.illustrationUrl || ('/posters/' + p.id + '.png');
          }

          // Strict guarantee: Never return a post with an empty poster image or third-party placeholder
          if (!p.illustrationUrl && !p.illustrationBase64) {
            p.illustrationUrl = '/posters/' + p.id + '.png';
            p.aiIllustrationUrl = p.illustrationUrl;
          }

          return p;
        }).filter(p => p && !p.deleted && !p.isDeleted && (p.adaptedHeadline || p.originalHeadline || p.summary));
        if (posts.length > 0) {
          return res.status(200).json({ status: 'ok', count: posts.length, posts });
        }
      }
    } catch (err) {
      console.error('Supabase GET error:', err);
    }

    // 2. Return fallback posts (synced with actual app posts)
    const slicedFallback = fallbackPosts.slice(0, limit);
    return res.status(200).json({
      status: 'ok',
      count: slicedFallback.length,
      posts: slicedFallback
    });
  }

  if (req.method === 'POST') {
    try {
      let postData = req.body;
      if (typeof postData === 'string') {
        postData = JSON.parse(postData);
      }

      if (!postData || (!postData.adaptedHeadline && !postData.originalHeadline)) {
        return res.status(400).json({ error: 'Invalid post data: missing headline' });
      }

      // Ensure post has ID and timestamp
      if (!postData.id) {
        postData.id = 'post-' + Date.now();
      }
      if (!postData.createdAt) {
        postData.createdAt = new Date().toISOString();
      }

      // Automatically persist poster to static files if illustrationBase64 is provided
      if (postData.illustrationBase64) {
        try {
          const cleanB64 = postData.illustrationBase64.replace(/^data:image\/[^;]+;base64,/, '');
          const buf = Buffer.from(cleanB64, 'base64');
          const targetDirs = [
            path.join(__dirname, '../public/posters'),
            path.join(__dirname, '../web_feed/posters')
          ];
          targetDirs.forEach(dir => {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, postData.id + '.png'), buf);
          });
          postData.illustrationUrl = '/posters/' + postData.id + '.png';
          postData.aiIllustrationUrl = '/posters/' + postData.id + '.png';
        } catch (_) {}

        if (postData.illustrationUrl && postData.illustrationUrl.startsWith('data:')) {
          postData.illustrationUrl = '';
        }
        if (postData.aiIllustrationUrl && postData.aiIllustrationUrl.startsWith('data:')) {
          postData.aiIllustrationUrl = '';
        }
      }

      // Upsert into Supabase
      try {
        const supaResp = await fetch(`${SUPABASE_URL}/rest/v1/posts`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify({ id: postData.id, data: postData })
        });
        if (!supaResp.ok) {
          console.warn('Supabase upsert status:', supaResp.status);
        }
      } catch (err) {
        console.error('Supabase write error:', err);
      }

      // Insert at the front of fallback list
      const existingIdx = fallbackPosts.findIndex(p => p.id === postData.id);
      if (existingIdx >= 0) {
        fallbackPosts[existingIdx] = postData;
      } else {
        fallbackPosts.unshift(postData);
      }

      return res.status(200).json({
        success: true,
        message: 'Post successfully published to slant.today!',
        id: postData.id,
        webUrl: `https://www.slant.today/?p=${postData.id}`
      });
    } catch (e) {
      console.error('Error handling post creation:', e);
      return res.status(500).json({ error: 'Server error processing post: ' + e.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const id = url.searchParams.get('id') || (req.body && req.body.id);
      if (!id) {
        return res.status(400).json({ error: 'Missing post id parameter' });
      }

      // 1. Soft-delete via PATCH (Supabase RLS permits UPDATE with anon key)
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            data: { id, deleted: true, isDeleted: true, deletedAt: new Date().toISOString() }
          })
        });
      } catch (_) {}

      // 2. Also attempt direct DELETE
      try {
        const supaResp = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
          }
        });
        if (!supaResp.ok) {
          console.warn('Supabase delete status:', supaResp.status);
        }
      } catch (err) {
        console.error('Supabase delete error:', err);
      }

      // Remove from fallback list if present
      fallbackPosts = fallbackPosts.filter(p => p.id !== id);

      return res.status(200).json({ success: true, message: `Post ${id} deleted` });
    } catch (e) {
      return res.status(500).json({ error: 'Error deleting post: ' + e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
