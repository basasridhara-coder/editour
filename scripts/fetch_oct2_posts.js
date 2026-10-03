const https = require('https');
const fs = require('fs');
const path = require('path');

const key = 'sb_publishable_n90rXQfEukf2gdisKe_jGg_Cybk2r-m';

const oct2Posts = [
  '206f70a9-e094-45e3-a82e-8e84fc854192',
  'bb5114c8-da15-4af9-afaf-70a577cc6e4a',
  '088483d5-cd8f-4a82-a74b-7dcb9a22f6ee',
  '9b55d7ea-8a78-4ef1-a068-cec226e200fd',
  'b517687b-095c-4e34-b849-d04c6c5d7b80',
  '633f2f1d-b5fe-4240-a376-fb3b6dbe8588',
  '7fce811a-751b-4cbd-a815-804b578b8191',
  '48e54342-0175-4bdd-b979-002dd32bd074',
  'e8901eb8-e444-4875-8c0d-e0b90cc83bad',
  '0a7be723-1875-475e-916c-37e3a9d6a15a'
];

function fetchSinglePost(id) {
  return new Promise((resolve) => {
    console.log(`\n[${id}] Requesting...`);
    const start = Date.now();
    const options = {
      hostname: 'karnxbsmvnkydcfydrcf.supabase.co',
      path: `/rest/v1/posts?id=eq.${id}&select=id,created_at,data`,
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        console.warn(`[${id}] Status: ${res.statusCode} (${Date.now() - start}ms)`);
        return resolve(null);
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed && parsed[0]) {
            console.log(`[${id}] ✅ Success in ${Date.now() - start}ms (${(body.length / 1024).toFixed(1)} KB)`);
            return resolve(parsed[0]);
          }
        } catch (_) {}
        resolve(null);
      });
    });

    req.on('error', (err) => {
      console.warn(`[${id}] Error: ${err.message}`);
      resolve(null);
    });

    req.setTimeout(60000, () => {
      console.warn(`[${id}] Request timeout (60s)`);
      req.destroy();
      resolve(null);
    });

    req.end();
  });
}

function saveImage(base64Str, targetSubdir, filename) {
  try {
    let clean = base64Str;
    const commaIdx = clean.indexOf(',');
    if (commaIdx !== -1) clean = clean.substring(commaIdx + 1);
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
    console.log(`  -> Saved ${filename} (${(buf.length / 1024).toFixed(1)} KB)`);
    return true;
  } catch (err) {
    console.error(`  -> Error saving ${filename}:`, err.message);
    return false;
  }
}

async function main() {
  const feedTargets = [
    path.join(__dirname, '../public/slant_feed.json'),
    path.join(__dirname, '../web_feed/slant_feed.json'),
    path.join(__dirname, '../editour_web/public/slant_feed.json')
  ];

  let feed = JSON.parse(fs.readFileSync(feedTargets[0], 'utf-8'));
  const existingIds = new Set(feed.map(p => p.id));
  let addedCount = 0;

  for (const id of oct2Posts) {
    if (existingIds.has(id)) {
      console.log(`[${id}] Already in feed, skipping.`);
      continue;
    }

    const row = await fetchSinglePost(id);
    if (!row || !row.data) continue;

    const post = row.data;
    if (post.deleted || post.isDeleted) {
      console.log(`[${id}] Deleted, skipping.`);
      continue;
    }

    const headline = post.adaptedHeadline || post.originalHeadline;
    if (!headline && !post.summary) {
      console.log(`[${id}] Empty headline/summary, skipping.`);
      continue;
    }

    console.log(`[${id}] Processing: "${headline}"`);

    if (post.illustrationBase64 && post.illustrationBase64.length > 50) {
      saveImage(post.illustrationBase64, 'illustrations', `${id}.jpg`);
      post.illustrationUrl = `/illustrations/${id}.jpg`;
      delete post.illustrationBase64;
    }

    if (post.originalPhotoBase64 && post.originalPhotoBase64.length > 50) {
      saveImage(post.originalPhotoBase64, 'clippings', `${id}.jpg`);
      post.originalPhotoUrl = `/clippings/${id}.jpg`;
      delete post.originalPhotoBase64;
    }

    post.createdAt = row.created_at || post.createdAt || new Date().toISOString();
    feed.push(post);
    existingIds.add(id);
    addedCount++;

    // Save incrementally
    feed.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    feedTargets.forEach(t => fs.writeFileSync(t, JSON.stringify(feed, null, 2), 'utf-8'));
  }

  console.log(`\n🎉 Processed all! Added ${addedCount} posts. Total in feed: ${feed.length}`);
}

main();
