const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://karnxbsmvnkydcfydrcf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_n90rXQfEukf2gdisKe_jGg_Cybk2r-m';

const missingIds = [
  '2f001766-faca-4a3a-92c8-20ea3f444749', // Today Oct 3
  '206f70a9-e094-45e3-a82e-8e84fc854192', // Oct 2
  'efa226c5-a93b-43b6-b716-e57afa77bfa5', // Oct 2
  '088483d5-cd8f-4a82-a74b-7dcb9a22f6ee', // Oct 2
  'bb5114c8-da15-4af9-afaf-70a577cc6e4a', // Oct 2
  'b517687b-095c-4e34-b849-d04c6c5d7b80', // Oct 2
  '9b55d7ea-8a78-4ef1-a068-cec226e200fd', // Oct 2
  '633f2f1d-b5fe-4240-a376-fb3b6dbe8588', // Oct 2
  '7fce811a-751b-4cbd-a815-804b578b8191', // Oct 2
  '48e54342-0175-4bdd-b979-002dd32bd074', // Oct 1
  'e8901eb8-e444-4875-8c0d-e0b90cc83bad', // Oct 1
  '0a7be723-1875-475e-916c-37e3a9d6a15a', // Oct 1
  'e8b31be9-19d3-4b44-bf40-0072197827b9',
  '2f3eccdf-650e-430d-804d-5b3c1f34abd2',
  '5b40eebc-ba26-4007-b673-fb5f0882c51a',
  'e6425378-50d6-45c1-9c77-ec185bb0f8b9',
  '0fcf8f1b-7748-4983-97aa-3d7203088019',
  'd77400b5-8cbc-44da-b7d6-436633838113',
  '19ef5597-d880-4c53-96db-847dfe3df1e9',
  '980340f5-676d-4542-939c-011f051ffa0e',
  '7724065c-4a14-483a-a46c-ca2c1834c1ca',
  '747321b4-99c9-4543-bdde-258e210a7ec5'
];

async function fetchPost(id) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/posts?id=eq.${id}&select=id,created_at,data`;
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    if (!res.ok) {
      console.warn(`Failed to fetch ${id}: ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data && data[0] ? data[0] : null;
  } catch (err) {
    console.error(`Error fetching ${id}:`, err.message);
    return null;
  }
}

function saveImage(base64Str, targetSubdir, filename) {
  try {
    let clean = base64Str;
    if (clean.includes(',')) clean = clean.split(',')[1];
    clean = clean.replace(/[\r\n\s]+/g, '');
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
    return true;
  } catch (err) {
    console.error(`Error saving image ${filename}:`, err.message);
    return false;
  }
}

async function main() {
  console.log(`Starting sync for ${missingIds.length} candidate posts from Supabase...`);

  const existingFeedPath = path.join(__dirname, '../public/slant_feed.json');
  const existingPosts = JSON.parse(fs.readFileSync(existingFeedPath, 'utf-8'));
  const existingMap = new Map();
  existingPosts.forEach(p => existingMap.set(p.id, p));

  let addedCount = 0;

  for (let i = 0; i < missingIds.length; i++) {
    const id = missingIds[i];
    console.log(`[${i + 1}/${missingIds.length}] Fetching ${id}...`);
    const start = Date.now();
    const row = await fetchPost(id);
    const elapsed = Date.now() - start;

    if (!row || !row.data) {
      console.log(`  -> Skipped (${elapsed}ms): No data`);
      continue;
    }

    const d = row.data;
    if (d.deleted || d.isDeleted) {
      console.log(`  -> Skipped (${elapsed}ms): Marked as deleted`);
      continue;
    }

    const headline = d.adaptedHeadline || d.originalHeadline || d.headline;
    if (!headline && !d.summary) {
      console.log(`  -> Skipped (${elapsed}ms): Empty headline & summary`);
      continue;
    }

    console.log(`  -> Found active post (${elapsed}ms): "${headline}"`);

    // Process illustration
    if (d.illustrationBase64 && d.illustrationBase64.length > 50) {
      const ok = saveImage(d.illustrationBase64, 'illustrations', `${id}.jpg`);
      if (ok) {
        d.illustrationUrl = `/illustrations/${id}.jpg`;
        delete d.illustrationBase64;
      }
    }

    // Process photo clipping
    if (d.originalPhotoBase64 && d.originalPhotoBase64.length > 50) {
      const ok = saveImage(d.originalPhotoBase64, 'clippings', `${id}.jpg`);
      if (ok) {
        d.originalPhotoUrl = `/clippings/${id}.jpg`;
        delete d.originalPhotoBase64;
      }
    }

    // Ensure createdAt
    if (!d.createdAt && row.created_at) {
      d.createdAt = row.created_at;
    }

    existingMap.set(id, d);
    addedCount++;
  }

  // Combine and sort
  const allMerged = Array.from(existingMap.values());
  allMerged.sort((a, b) => {
    const da = new Date(a.createdAt || a.timestamp || 0).getTime();
    const db = new Date(b.createdAt || b.timestamp || 0).getTime();
    return db - da;
  });

  console.log(`\nSync complete! Added/Updated ${addedCount} posts. Total active posts: ${allMerged.length}`);

  const targets = [
    path.join(__dirname, '../public/slant_feed.json'),
    path.join(__dirname, '../web_feed/slant_feed.json'),
    path.join(__dirname, '../editour_web/public/slant_feed.json')
  ];

  targets.forEach(t => {
    fs.writeFileSync(t, JSON.stringify(allMerged, null, 2), 'utf-8');
    console.log(`Saved to ${t} (${(fs.statSync(t).size / 1024).toFixed(1)} KB)`);
  });
}

main();
