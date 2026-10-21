// Serverless Function for editour.app
// Supports GET (fetch live feed from Supabase) and POST (publish post from PostCard app)

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://fxfklefnkpmhofncqhfh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4ZmtsZWZua3BtaG9mbmNxaGZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NzM4NzYsImV4cCI6MjEwODA0OTg3Nn0.0nw5ZDvlEsYal6EYXcqyaAPRHoxkXxZgDsNQDppEYgM';

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

function formatPostRow(r) {
  if (!r) return null;
  const p = r.data || r;
  p.id = p.id || r.id;
  p.createdAt = p.createdAt || r.created_at || new Date().toISOString();

  // Strip any Unsplash or placeholder fallback URLs completely
  if (p.illustrationUrl && p.illustrationUrl.includes('unsplash.com')) {
    p.illustrationUrl = '';
  }
  if (p.aiIllustrationUrl && p.aiIllustrationUrl.includes('unsplash.com')) {
    p.aiIllustrationUrl = '';
  }

  // If static poster image exists in /posters/, serve high-speed CDN asset; otherwise serve storage URL or posterBase64
  const posterFile = path.join(__dirname, '../public/posters', p.id + '.png');
  const hasStaticPosterOnDisk = fs.existsSync(posterFile);

  if (hasStaticPosterOnDisk) {
    p.illustrationUrl = '/posters/' + p.id + '.png';
    p.aiIllustrationUrl = '/posters/' + p.id + '.png';
    delete p.posterBase64;
  } else if (p.illustrationUrl && (p.illustrationUrl.startsWith('http://') || p.illustrationUrl.startsWith('https://'))) {
    p.aiIllustrationUrl = p.illustrationUrl;
  } else if (p.posterBase64 && p.posterBase64.length > 50) {
    p.illustrationUrl = p.posterBase64;
    p.aiIllustrationUrl = p.posterBase64;
  } else if (p.illustrationUrl && p.illustrationUrl.startsWith('/posters/')) {
    p.aiIllustrationUrl = p.illustrationUrl;
  } else if (p.id) {
    p.illustrationUrl = `${SUPABASE_URL}/storage/v1/object/public/posters/${p.id}.webp`;
    p.aiIllustrationUrl = p.illustrationUrl;
  }

  delete p.illustrationBase64;
  delete p.originalPhotoBase64;

  return p;
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

    // Parse parameters
    let limit = 12;
    let baseOffset = 0;
    let singleId = null;
    let multiIds = null;
    try {
      const parsedUrl = new URL(req.url || '/', 'http://localhost');
      singleId = (req.query && req.query.id) || parsedUrl.searchParams.get('id');
      multiIds = (req.query && req.query.ids) || parsedUrl.searchParams.get('ids');
      const qLimit = parseInt((req.query && req.query.limit) || parsedUrl.searchParams.get('limit'), 10);
      if (!isNaN(qLimit) && qLimit > 0) {
        limit = Math.min(qLimit, 24);
      }
      const qOffset = parseInt((req.query && req.query.offset) || parsedUrl.searchParams.get('offset'), 10);
      if (!isNaN(qOffset) && qOffset >= 0) {
        baseOffset = qOffset;
      }
    } catch (_) {}

    // Direct single-ID point query (supports drafts & direct deep link verification)
    if (singleId) {
      try {
        const sResp = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(singleId)}&select=*`, {
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
          }
        });
        if (sResp.ok) {
          const sRows = await sResp.json();
          if (Array.isArray(sRows) && sRows.length > 0) {
            const formatted = formatPostRow(sRows[0]);
            return res.status(200).json({ status: 'ok', count: 1, post: formatted, posts: [formatted] });
          }
        }
        return res.status(404).json({ status: 'error', error: 'Post not found' });
      } catch (sErr) {
        console.error('Point lookup error:', sErr);
        return res.status(500).json({ status: 'error', error: sErr.message });
      }
    }

    // Direct multi-ID query (supports refreshing author's drafts)
    if (multiIds) {
      try {
        const idList = multiIds.split(',').map(s => s.trim()).filter(Boolean).slice(0, 30);
        if (idList.length > 0) {
          const inFilter = idList.map(id => '%22' + encodeURIComponent(id) + '%22').join(',');
          const mResp = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=in.(${inFilter})&select=*`, {
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`
            }
          });
          if (mResp.ok) {
            const mRows = await mResp.json();
            const posts = (mRows || []).map(formatPostRow).filter(Boolean);
            return res.status(200).json({ status: 'ok', count: posts.length, posts });
          }
        }
      } catch (mErr) {
        console.error('Multi-ID lookup error:', mErr);
      }
    }

    // 1. Primary: Fast 2-step retrieval (fetch lightweight IDs first, then point lookups)
    // This avoids Postgres statement timeout (57014) caused by ordering huge 2.5MB JSONB toast rows
    try {
      const idResp = await fetch(`${SUPABASE_URL}/rest/v1/posts?select=id,created_at&order=created_at.desc&offset=${baseOffset}&limit=${limit}`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });

      if (idResp.ok) {
        const idRows = await idResp.json();
        if (Array.isArray(idRows) && idRows.length > 0) {
          const orderedIds = idRows.map(r => r.id).filter(id => id && !id.startsWith('system_'));

          // Single indexed primary-key query for all ordered IDs (fast & zero dropped rows)
          const inFilter = orderedIds.map(id => '%22' + encodeURIComponent(id) + '%22').join(',');
          const pResp = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=in.(${inFilter})`, {
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`
            }
          });

          let rows = [];
          if (pResp.ok) {
            const pRows = await pResp.json();
            const rowsMap = new Map();
            pRows.forEach(r => rowsMap.set(r.id, r));
            rows = orderedIds.map(id => rowsMap.get(id)).filter(Boolean);
          }

      if (Array.isArray(rows) && rows.length > 0) {
        const posts = rows.map(formatPostRow).filter(p => p && !p.deleted && !p.isDeleted && !p.isDraft && !p.isPrivate && p.status !== 'draft' && (p.adaptedHeadline || p.originalHeadline || p.summary));
        if (posts.length > 0) {
          return res.status(200).json({ status: 'ok', count: posts.length, posts });
        }
          }
        }
      }
    } catch (err) {
      console.error('Supabase GET error:', err);
    }

    // 2. Return fallback posts (synced with actual app posts)
    const slicedFallback = fallbackPosts.filter(p => p && !p.deleted && !p.isDeleted && !p.isDraft && !p.isPrivate && p.status !== 'draft').slice(0, limit);
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

      // Automatically persist poster to Supabase Storage if illustrationBase64 or posterBase64 is provided
      let rawPoster = postData.illustrationBase64 || postData.posterBase64;
      if (rawPoster && typeof rawPoster === 'string' && rawPoster.length > 50) {
        if (!rawPoster.startsWith('data:image/')) {
          const isPng = rawPoster.startsWith('iVBORw');
          rawPoster = `data:image/${isPng ? 'png' : 'jpeg'};base64,${rawPoster}`;
        }
        try {
          const match = rawPoster.match(/^data:(image\/[^;]+);base64,/);
          const mime = match ? match[1] : 'image/webp';
          const ext = mime.includes('png') ? 'png' : (mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'webp');
          const cleanB64 = match ? rawPoster.slice(match[0].length) : rawPoster.replace(/^data:image\/[^;]+;base64,/, '');
          const buf = Buffer.from(cleanB64, 'base64');
          const fileName = `${postData.id}.${ext}`;

          for (const uploadExt of [ext, 'webp', 'png']) {
            try {
              await fetch(`${SUPABASE_URL}/storage/v1/object/posters/${postData.id}.${uploadExt}`, {
                method: 'POST',
                headers: {
                  'apikey': SUPABASE_KEY,
                  'Authorization': `Bearer ${SUPABASE_KEY}`,
                  'Content-Type': mime,
                  'x-upsert': 'true'
                },
                body: buf
              });
            } catch (_) {}
          }

          postData.illustrationUrl = `${SUPABASE_URL}/storage/v1/object/public/posters/${fileName}`;
          postData.aiIllustrationUrl = postData.illustrationUrl;

          const targetDirs = [
            path.join(__dirname, '../public/posters'),
            path.join(__dirname, '../web_feed/posters')
          ];
          targetDirs.forEach(dir => {
            try {
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(path.join(dir, fileName), buf);
            } catch (_) {}
          });
        } catch (uploadErr) {
          console.warn('Storage upload error:', uploadErr);
        }
      }

      if (!postData.illustrationUrl) {
        postData.illustrationUrl = `${SUPABASE_URL}/storage/v1/object/public/posters/${postData.id}.webp`;
        postData.aiIllustrationUrl = postData.illustrationUrl;
      }

      // Always strip giant uncompressed base64 strings so Supabase never exceeds statement timeout or quota
      delete postData.posterBase64;
      delete postData.illustrationBase64;
      delete postData.originalPhotoBase64;
      delete postData.sourceImageBase64;
      delete postData.catalystPhotoBase64;
      if (typeof postData.catalystPhoto === 'string' && postData.catalystPhoto.startsWith('data:image/')) {
        delete postData.catalystPhoto;
      }
      if (postData.generationInputs) {
        delete postData.generationInputs.sourceImageBase64;
        delete postData.generationInputs.catalystPhotoBase64;
        delete postData.generationInputs.innerVoiceImageBase64;
        if (typeof postData.generationInputs.catalystPhoto === 'string' && postData.generationInputs.catalystPhoto.startsWith('data:image/')) {
          delete postData.generationInputs.catalystPhoto;
        }
        if (typeof postData.generationInputs.referencePhotoUrl === 'string' && postData.generationInputs.referencePhotoUrl.startsWith('data:image/')) {
          delete postData.generationInputs.referencePhotoUrl;
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
