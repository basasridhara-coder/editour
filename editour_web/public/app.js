let allPosts = [];
let currentFilter = 'all';
let searchQuery = '';
let activePostIndex = null;

async function init() {
  await loadPosts();
  setupEventListeners();
  checkDeepLink();
  setupAutoRefresh();
}

const SUPABASE_URL = 'https://karnxbsmvnkydcfydrcf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_n90rXQfEukf2gdisKe_jGg_Cybk2r-m';

async function loadPosts() {
  // 1. Primary: Direct Supabase Cloud Database (Live real-time feed)
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/posts?select=*&order=created_at.desc`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    if (resp.ok) {
      const rows = await resp.json();
      if (rows && rows.length > 0) {
        allPosts = rows.map(r => r.data || r).filter(p => p && (p.adaptedHeadline || p.originalHeadline || p.summary));
        updateBadge(true, `Live Feed (${allPosts.length} posts)`);
        renderFeed();
        return;
      }
    }
  } catch (e) {
    console.warn('Supabase fetch error, checking fallback:', e);
  }

  // 2. Secondary fallback: local /api/posts
  try {
    const resp = await fetch('/api/posts');
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.posts && data.posts.length > 0) {
        allPosts = data.posts;
        updateBadge(true, `Live Feed (${allPosts.length} posts)`);
        renderFeed();
        return;
      }
    }
  } catch (e) {
    console.warn('Could not fetch from /api/posts, checking fallback:', e);
  }

  // 3. Fallback to static data if running offline
  try {
    const localResp = await fetch('postcards_data.json');
    if (localResp.ok) {
      allPosts = await localResp.json();
      updateBadge(true, `Local Feed (${allPosts.length} posts)`);
      renderFeed();
    }
  } catch (_) {}
}

function updateBadge(connected, text) {
  const badge = document.getElementById('connectionBadge');
  const label = document.getElementById('connectionText');
  if (badge && label) {
    label.textContent = text || (connected ? 'Live Feed' : 'Offline');
  }
}

function setupEventListeners() {
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.getAttribute('data-cat');
      renderFeed();
    });
  });
}

function handleSearch(query) {
  searchQuery = (query || '').toLowerCase().trim();
  renderFeed();
}

function checkDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const postId = params.get('p');
  if (postId && allPosts.length > 0) {
    const idx = allPosts.findIndex(p => p.id === postId);
    if (idx >= 0) {
      setTimeout(() => openDetailModal(idx), 300);
    }
  }
}

function renderFeed() {
  const container = document.getElementById('feedContainer');
  container.innerHTML = '';

  const filtered = allPosts.filter(post => {
    if (currentFilter !== 'all') {
      const cat = (post.categoryBadge || '').toLowerCase();
      const type = (post.sourceType || '').toLowerCase();
      if (currentFilter === 'tech' && !(cat.includes('tech') || cat.includes('quantum') || cat.includes('ai') || cat.includes('astro'))) return false;
      if (currentFilter === 'health' && !(cat.includes('health') || cat.includes('cures') || cat.includes('bio'))) return false;
      if (currentFilter === 'climate' && !(cat.includes('climate') || cat.includes('energy') || cat.includes('renewable'))) return false;
      if (currentFilter === 'economy' && !(cat.includes('economy') || cat.includes('global') || cat.includes('market'))) return false;
      if (currentFilter === 'literary' && !(type === 'book_excerpt' || cat.includes('literary') || cat.includes('book'))) return false;
    }

    if (searchQuery) {
      const title = (post.adaptedHeadline || post.originalHeadline || '').toLowerCase();
      const pub = (post.publicationName || '').toLowerCase();
      const summary = (post.summary || '').toLowerCase();
      const hook = (post.hook || '').toLowerCase();
      const cat = (post.categoryBadge || '').toLowerCase();
      if (!title.includes(searchQuery) && !pub.includes(searchQuery) && !summary.includes(searchQuery) && !hook.includes(searchQuery) && !cat.includes(searchQuery)) {
        return false;
      }
    }

    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 48px 16px; color: var(--text-muted);">
        <div style="font-size:36px; margin-bottom:12px;">📰</div>
        <div style="font-weight:700; font-size:16px; color:#FFF;">No stories found in this category</div>
        <div style="font-size:13px; margin-top:4px;">Snap a newspaper clipping or paste a news link in the PostCard app to publish here!</div>
      </div>
    `;
    return;
  }

  filtered.forEach((post, index) => {
    const card = createPostCardElement(post, index);
    container.appendChild(card);
  });
}

function createPostCardElement(post, index) {
  const card = document.createElement('article');
  card.className = 'post-card';

  const handle = post.creatorHandle || '@curator';
  const initial = handle.replace('@', '').charAt(0).toUpperCase() || 'C';
  const pubName = post.publicationName || 'Press Wire';
  const catBadge = post.categoryBadge || 'DISCOVERY';
  const audience = post.targetAudience || 'General';
  const headline = post.adaptedHeadline || post.originalHeadline || 'Untitled Story';
  const hook = post.hook || '';
  const summary = post.summary || '';
  const metric = post.keyMetric || '';
  const quote = post.pullQuote || '';
  const isBook = post.sourceType === 'book_excerpt';
  const hasPaperCut = post.originalPhotoPath && 
                      !post.originalPhotoPath.startsWith('http') && 
                      post.originalPhotoPath !== 'digital_article_link' && 
                      post.originalPhotoPath !== 'book_excerpt_reading' &&
                      post.originalPhotoPath !== 'sample_asset_print';
  const digitalUrl = post.digitalLink || '';

  let heroVisualHtml = '';
  if (post.illustrationBase64) {
    heroVisualHtml = `
      <div class="poster-canvas" onclick="openDetailModal(${index})">
        <img class="poster-img" src="data:image/jpeg;base64,${post.illustrationBase64}" alt="${headline}">
      </div>
    `;
  } else {
    heroVisualHtml = `
      <div class="poster-canvas" onclick="openDetailModal(${index})">
        <div class="infographic-banner">
          <div class="banner-top">
            <span class="audience-pill">🎯 ${audience}</span>
            <span class="style-pill">${post.posterStyle || 'EDITORIAL'}</span>
          </div>
          <div class="banner-center">
            ${metric ? `
              <div class="metric-badge">
                <span class="metric-val">${metric}</span>
                <span class="metric-label">Key Signal</span>
              </div>
            ` : ''}
            <h3 class="canvas-headline">${headline}</h3>
            ${quote ? `<p class="canvas-quote">"${quote}"</p>` : ''}
          </div>
          <div class="banner-bottom">
            <span class="mood-text">✦ ${post.visualMood || 'Visual Editorial Poster'}</span>
            <span style="font-size:11px; font-weight:700; color:#A5B4FC;">EDITOUR.APP</span>
          </div>
        </div>
      </div>
    `;
  }

  const isCarousel = post.postFormat === 'carousel_trio';

  card.innerHTML = `
    <div class="post-header">
      <div class="creator-info">
        <div class="creator-avatar">
          <div class="avatar-inner">${initial}</div>
        </div>
        <div class="creator-names">
          <div class="creator-handle-row">
            <span class="creator-handle">${handle}</span>
            <span class="post-time">• Today</span>
          </div>
          <div class="pub-source-badge">
            <span>${isBook ? '📖' : '📰'}</span>
            <span>${pubName}</span>
          </div>
        </div>
      </div>
      <span class="category-tag" ${isCarousel ? 'style="background:rgba(16,185,129,0.15); color:#10B981; border:1px solid rgba(16,185,129,0.3);"' : ''}>
        ${isCarousel ? '🎨 3-POSTER CAROUSEL' : catBadge}
      </span>
    </div>

    ${heroVisualHtml}

    <div class="action-bar">
      <div class="action-group-left">
        <button class="action-btn" onclick="toggleLike(this)">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
          </svg>
          <span class="like-count">56</span>
        </button>
        <button class="action-btn" onclick="openDetailModal(${index})">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${isCarousel ? '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line>' : '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>'}
          </svg>
          <span>${isCarousel ? '3 Posters' : '1-Min Read'}</span>
        </button>
        ${hasPaperCut ? `
          <button class="tag-action-btn" onclick="openPaperCutModal(${index})">
            📰 Paper Cut
          </button>
        ` : ''}
      </div>
      <div style="display:flex; gap:6px;">
        <button class="tag-action-btn" onclick="copyCardShareLink('${post.id}')" title="Copy shareable link">
          🔗 Share
        </button>
        ${digitalUrl ? `
          <a href="${digitalUrl}" target="_blank" class="tag-action-btn" title="Open verified online article">
            🌐 Article &nearr;
          </a>
        ` : ''}
      </div>
    </div>

    <div class="post-content">
      <div class="post-headline">${headline}</div>
      ${hook ? `<div class="post-hook">${hook}</div>` : ''}
      ${isCarousel ? `
        <div style="margin: 8px 0; padding: 8px 12px; background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.25); border-radius: 8px; font-size: 11.5px; color: #E2E8F0;">
          🎨 <b>3-Poster Carousel:</b> Slide 1: Hook • Slide 2: Curator Take • Slide 3: The "Receipt"
        </div>
      ` : `
        <div class="post-summary-snippet">
          ${summary.substring(0, 160)}...
          <button class="read-more-btn" onclick="openDetailModal(${index})">⏱️ 1-min read</button>
        </div>
      `}
    </div>
  `;

  return card;
}

function toggleLike(btn) {
  btn.classList.toggle('liked');
  const countSpan = btn.querySelector('.like-count');
  let val = parseInt(countSpan.textContent, 10);
  if (btn.classList.contains('liked')) {
    countSpan.textContent = val + 1;
  } else {
    countSpan.textContent = Math.max(0, val - 1);
  }
}

function openDetailModal(index) {
  activePostIndex = index;
  const post = allPosts[index];
  if (!post) return;

  document.getElementById('modalAudienceBadge').textContent = '🎯 Target: ' + (post.targetAudience || 'General');
  document.getElementById('modalTitle').textContent = post.adaptedHeadline || post.originalHeadline || 'Story Overview';
  document.getElementById('modalWhyText').textContent = post.whyItMatters || 'Essential high-signal insight for ' + (post.targetAudience || 'readers') + '.';
  
  const listEl = document.getElementById('modalTakeawaysList');
  listEl.innerHTML = '';
  const takeaways = post.keyTakeaways || [];
  takeaways.forEach(item => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="bullet-icon">✓</span> <span>${item}</span>`;
    listEl.appendChild(li);
  });

  document.getElementById('modalSummary').textContent = post.summary || 'Summary unavailable.';
  document.getElementById('modalPubSource').textContent = 'Publication: ' + (post.publicationName || 'Press Wire');

  const extLink = document.getElementById('modalExternalLink');
  if (post.digitalLink) {
    extLink.href = post.digitalLink;
    extLink.style.display = 'inline-flex';
  } else {
    extLink.style.display = 'none';
  }

  // Update browser URL query without reload
  history.pushState(null, '', `?p=${post.id}`);

  document.getElementById('detailModal').classList.add('open');
}

function closeDetailModal() {
  document.getElementById('detailModal').classList.remove('open');
  history.pushState(null, '', window.location.pathname);
  activePostIndex = null;
}

function copyShareLink() {
  if (activePostIndex !== null && allPosts[activePostIndex]) {
    copyCardShareLink(allPosts[activePostIndex].id);
  }
}

function copyCardShareLink(postId) {
  const shareUrl = `${window.location.origin}/?p=${postId}`;
  navigator.clipboard.writeText(shareUrl).then(() => {
    alert(`📋 Shareable link copied: ${shareUrl}`);
  }).catch(() => {
    prompt('Copy this link:', shareUrl);
  });
}

function openPaperCutModal(index) {
  const post = allPosts[index];
  if (!post || !post.originalPhotoPath) return;

  const imgEl = document.getElementById('paperCutImg');
  if (post.originalPhotoPath.startsWith('http') || post.originalPhotoPath.startsWith('data:')) {
    imgEl.src = post.originalPhotoPath;
  } else {
    imgEl.src = '/image/' + encodeURIComponent(post.originalPhotoPath);
  }
  document.getElementById('paperCutModal').classList.add('open');
}

function closePaperCutModal() {
  document.getElementById('paperCutModal').classList.remove('open');
}

async function syncFeed() {
  updateBadge(true, 'Refreshing...');
  await loadPosts();
}

function setupAutoRefresh() {
  setInterval(async () => {
    try {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/posts?select=*&order=created_at.desc`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });
      if (resp.ok) {
        const rows = await resp.json();
        if (rows && rows.length !== allPosts.length) {
          allPosts = rows.map(r => r.data || r).filter(p => p && (p.adaptedHeadline || p.originalHeadline || p.summary));
          renderFeed();
          updateBadge(true, `Live Feed (${allPosts.length} posts)`);
        }
      }
    } catch (_) {}
  }, 10000);
}

document.addEventListener('DOMContentLoaded', init);
