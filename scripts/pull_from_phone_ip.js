const fs = require('fs');
const path = require('path');

const PHONE_URL = process.argv[2] || 'http://localhost:9090';

async function main() {
  console.log(`Connecting to phone at ${PHONE_URL}/api/feed...`);
  try {
    const res = await fetch(`${PHONE_URL}/api/feed`);
    if (!res.ok) {
      console.error(`Failed to reach phone: HTTP ${res.status}`);
      process.exit(1);
    }
    const data = await res.json();
    const posts = data.posts || [];
    console.log(`🎉 Successfully retrieved ${posts.length} posts directly from phone!`);

    const existingFeedPath = path.join(__dirname, '../public/slant_feed.json');
    const existingPosts = JSON.parse(fs.readFileSync(existingFeedPath, 'utf-8'));
    const existingMap = new Map();
    existingPosts.forEach(p => existingMap.set(p.id, p));

    let newCount = 0;
    for (const post of posts) {
      if (post.deleted || post.isDeleted) continue;
      const id = post.id;

      // Extract illustration
      if (post.illustrationBase64 && post.illustrationBase64.length > 50) {
        let clean = post.illustrationBase64;
        const commaIdx = clean.indexOf(',');
        if (commaIdx !== -1) clean = clean.substring(commaIdx + 1);
        const buf = Buffer.from(clean, 'base64');
        const dirs = [
          path.join(__dirname, '../public/illustrations'),
          path.join(__dirname, '../web_feed/illustrations'),
          path.join(__dirname, '../editour_web/public/illustrations')
        ];
        dirs.forEach(d => {
          if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
          fs.writeFileSync(path.join(d, `${id}.jpg`), buf);
        });
        post.illustrationUrl = `/illustrations/${id}.jpg`;
        delete post.illustrationBase64;
      }

      // Extract clipping
      if (post.originalPhotoBase64 && post.originalPhotoBase64.length > 50) {
        let clean = post.originalPhotoBase64;
        const commaIdx = clean.indexOf(',');
        if (commaIdx !== -1) clean = clean.substring(commaIdx + 1);
        const buf = Buffer.from(clean, 'base64');
        const dirs = [
          path.join(__dirname, '../public/clippings'),
          path.join(__dirname, '../web_feed/clippings'),
          path.join(__dirname, '../editour_web/public/clippings')
        ];
        dirs.forEach(d => {
          if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
          fs.writeFileSync(path.join(d, `${id}.jpg`), buf);
        });
        post.originalPhotoUrl = `/clippings/${id}.jpg`;
        delete post.originalPhotoBase64;
      }

      existingMap.set(id, post);
      newCount++;
    }

    const merged = Array.from(existingMap.values());
    merged.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    const targets = [
      path.join(__dirname, '../public/slant_feed.json'),
      path.join(__dirname, '../web_feed/slant_feed.json'),
      path.join(__dirname, '../editour_web/public/slant_feed.json')
    ];

    targets.forEach(t => {
      fs.writeFileSync(t, JSON.stringify(merged, null, 2), 'utf-8');
      console.log(`Saved ${merged.length} posts to ${t}`);
    });

    console.log(`\n✅ COMPLETE! Synced ${newCount} posts. Total active in feed: ${merged.length}`);
  } catch (err) {
    console.error('Error connecting to phone:', err.message);
  }
}

main();
