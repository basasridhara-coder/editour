// Serverless Function for editour.app
// Supports GET (fetch live feed from Supabase) and POST (publish post from PostCard app)

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://karnxbsmvnkydcfydrcf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_n90rXQfEukf2gdisKe_jGg_Cybk2r-m';

let fallbackPosts = [];
try {
  const dataPath = path.join(__dirname, '../public/postcards_data.json');
  if (fs.existsSync(dataPath)) {
    fallbackPosts = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  }
} catch (e) {
  console.warn('Could not read postcards_data.json:', e);
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
    // 1. Primary: Direct Supabase query with limit
    try {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/posts?select=*&data->>deleted=is.null&order=created_at.desc&limit=35`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });
      if (resp.ok) {
        const rows = await resp.json();
        if (rows && rows.length > 0) {
          const posts = rows.map(r => r.data || r).filter(p => p && !p.deleted && !p.isDeleted && (p.adaptedHeadline || p.originalHeadline || p.summary));
          return res.status(200).json({ status: 'ok', count: posts.length, posts });
        }
      }
    } catch (err) {
      console.error('Supabase GET error:', err);
    }

    // 2. Return fallback posts (synced with actual app posts)
    return res.status(200).json({
      status: 'ok',
      count: fallbackPosts.length,
      posts: fallbackPosts
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
        message: 'Post successfully published to editour.app!',
        id: postData.id,
        webUrl: `https://editour.app/?p=${postData.id}`
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
