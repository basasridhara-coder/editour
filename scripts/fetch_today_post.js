const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://karnxbsmvnkydcfydrcf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_n90rXQfEukf2gdisKe_jGg_Cybk2r-m';

async function fetchPostWithRetry(id, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Attempt ${attempt}] Fetching ${id}...`);
      const start = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s timeout

      const res = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.${id}&select=id,created_at,data`, {
        signal: controller.signal,
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });
      clearTimeout(timeoutId);

      const elapsed = Date.now() - start;
      if (!res.ok) {
        console.warn(`Attempt ${attempt} returned status ${res.status} (${elapsed}ms)`);
        await new Promise(r => setTimeout(r, 4000));
        continue;
      }

      const rows = await res.json();
      if (rows && rows[0]) {
        console.log(`✅ Success in ${elapsed}ms for ${id}`);
        return rows[0];
      }
    } catch (e) {
      console.warn(`Attempt ${attempt} failed: ${e.message}`);
      await new Promise(r => setTimeout(r, 4000));
    }
  }
  return null;
}

function saveImage(base64Str, targetSubdir, filename) {
  try {
    let clean = base64Str;
    const commaIdx = clean.indexOf(',');
    if (commaIdx !== -1) clean = clean.substring(commaIdx + 1);
    
    // Fast clean without heavy regex
    const buf = Buffer.from(clean, 'base64');

    const dirs = [
      path.join(__dirname, '../public', targetSubdir),
      path.join(__dirname, '../web_feed', targetSubdir),
      path.join(__dirname, '../editour_web/public', targetSubdir)
    ];

    dirs.forEach(d => {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, filename), buf);
    });
    console.log(`Saved image ${filename} (${(buf.length / 1024).toFixed(1)} KB)`);
    return true;
  } catch (err) {
    console.error(`Error saving image ${filename}:`, err.message);
    return false;
  }
}

async function main() {
  const targetId = '2f001766-faca-4a3a-92c8-20ea3f444749'; // Today's post
  const row = await fetchPostWithRetry(targetId);
  if (!row || !row.data) {
    console.error('Could not fetch post data.');
    process.exit(1);
  }

  const d = row.data;
  const headline = d.adaptedHeadline || d.originalHeadline;
  console.log(`Retrieved post: "${headline}"`);

  if (d.illustrationBase64) {
    saveImage(d.illustrationBase64, 'illustrations', `${targetId}.jpg`);
    d.illustrationUrl = `/illustrations/${targetId}.jpg`;
    delete d.illustrationBase64;
  }

  if (d.originalPhotoBase64) {
    saveImage(d.originalPhotoBase64, 'clippings', `${targetId}.jpg`);
    d.originalPhotoUrl = `/clippings/${targetId}.jpg`;
    delete d.originalPhotoBase64;
  }

  if (!d.createdAt && row.created_at) {
    d.createdAt = row.created_at;
  }

  // Load existing slant_feed.json
  const feedPath = path.join(__dirname, '../public/slant_feed.json');
  const feed = JSON.parse(fs.readFileSync(feedPath, 'utf-8'));
  
  // Prepend today's post if not exists
  const existingIdx = feed.findIndex(p => p.id === targetId);
  if (existingIdx !== -1) {
    feed[existingIdx] = d;
  } else {
    feed.unshift(d);
  }

  // Sort by createdAt desc
  feed.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const targets = [
    path.join(__dirname, '../public/slant_feed.json'),
    path.join(__dirname, '../web_feed/slant_feed.json'),
    path.join(__dirname, '../editour_web/public/slant_feed.json')
  ];

  targets.forEach(t => {
    fs.writeFileSync(t, JSON.stringify(feed, null, 2), 'utf-8');
    console.log(`Updated ${t} (${feed.length} posts)`);
  });

  console.log('🎉 Done! Today post is now in slant_feed.json');
}

main();
