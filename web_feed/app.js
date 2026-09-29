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
  // 1. Primary: Direct Supabase Cloud Database with limit for high performance
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
        allPosts = rows.map(r => r.data || r).filter(p => p && !p.deleted && !p.isDeleted && (p.adaptedHeadline || p.originalHeadline || p.summary));
        updateBadge(true, `Live Feed (${allPosts.length} posts)`);
        renderFeed();
        return;
      }
    }
  } catch (e) {
    console.warn('Supabase fetch error, checking local fallback:', e);
  }

  // 2. Secondary fallback: local postcards_data.json (synced with actual app posts)
  try {
    const localResp = await fetch('postcards_data.json');
    if (localResp.ok) {
      allPosts = await localResp.json();
      updateBadge(true, `Local Feed (${allPosts.length} posts)`);
      renderFeed();
      return;
    }
  } catch (_) {}

  // 3. Tertiary fallback: /api/posts
  try {
    const resp = await fetch('/api/posts');
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.posts && data.posts.length > 0) {
        allPosts = data.posts;
        updateBadge(true, `Live Feed (${allPosts.length} posts)`);
        renderFeed();
      }
    }
  } catch (e) {
    console.warn('Could not fetch from /api/posts:', e);
  }
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
      if (currentFilter === 'economy' && !(cat.includes('economy') || cat.includes('global') || cat.includes('market') || cat.includes('capital') || cat.includes('finance'))) return false;
      if (currentFilter === 'literary' && !(type === 'book_excerpt' || cat.includes('literary') || cat.includes('book') || cat.includes('literature'))) return false;
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
    if (post.postFormat === 'carousel_trio' || (post.articleExcerpts && post.articleExcerpts.length > 0)) {
      setupCarouselGestures(index);
    }
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ============================================================
   SLIDE BUILDERS (SLIDE 1, SLIDE 2, SLIDE 3)
   ============================================================ */

function buildSlide1Html(post, index) {
  const headline = escapeHtml(post.adaptedHeadline || post.originalHeadline || 'Untitled Story');
  const hook = escapeHtml(post.hook || '');
  const audience = escapeHtml(post.targetAudience || 'General');
  let catBadge = escapeHtml(post.categoryBadge || 'CURATED DIGEST');
  let pubName = escapeHtml(post.publicationName || 'Press Wire');

  if (catBadge.includes('•')) {
    const parts = catBadge.split('•');
    catBadge = parts[0].trim();
    if (parts[1] && parts[1].trim()) {
      pubName = parts[1].trim();
    }
  }

  let bgHtml = '';
  if (post.illustrationBase64) {
    bgHtml = `<img class="slide-hook-bg" src="data:image/jpeg;base64,${post.illustrationBase64}" alt="${headline}" loading="lazy">`;
  } else {
    // Rich geometric editorial cover matching mobile SlideHookPoster
    bgHtml = `
      <div class="slide-hook-bg" style="background: radial-gradient(circle at 50% 28%, #1e1b4b 0%, #0f172a 60%, #030712 100%);">
        <div style="position:absolute; inset:0; opacity:0.18; background-image: radial-gradient(#818cf8 1px, transparent 1px); background-size: 20px 20px;"></div>
        <div style="position:absolute; top:28%; left:50%; transform:translate(-50%,-50%); width:170px; height:170px; border-radius:50%; border:1px dashed rgba(129,140,248,0.35); display:flex; align-items:center; justify-content:center;">
          <div style="width:115px; height:115px; border-radius:50%; background:linear-gradient(135deg, rgba(99,102,241,0.22), rgba(168,85,247,0.12)); border:1px solid rgba(168,85,247,0.45); display:flex; align-items:center; justify-content:center; font-size:42px; box-shadow:0 0 30px rgba(99,102,241,0.25);">🎨</div>
        </div>
      </div>
    `;
  }

  const hasContextAnchor = hook && hook !== headline;

  return `
    ${bgHtml}
    <div class="slide-hook-top-scrim"></div>
    <div class="slide-hook-bottom-scrim"></div>
    <div class="slide-hook-content">
      <div class="slide-hook-top">
        <span class="audience-pill">🎯 ${audience}</span>
        <span class="category-tag">${catBadge} • ${pubName}</span>
      </div>
      <div class="slide-hook-bottom">
        ${hasContextAnchor ? `
          <div class="slide-context-anchor">
            <span class="anchor-dot"></span>
            <span class="anchor-text">${hook}</span>
          </div>
        ` : ''}
        <h3 class="slide-hook-headline">${headline}</h3>
      </div>
    </div>
  `;
}

function buildSlide2Html(post, index) {
  const handle = escapeHtml(post.creatorHandle || '@curator');
  const initial = handle.replace('@', '').charAt(0).toUpperCase() || 'C';
  const audience = escapeHtml(post.targetAudience || 'General');
  const opinion = escapeHtml(post.creatorOpinion || post.whyItMatters || post.hook || 'Strategic structural shift in motion.');
  const whyItMatters = post.whyItMatters ? escapeHtml(post.whyItMatters) : '';
  const takeaways = post.keyTakeaways || [];

  let takeawaysHtml = '';
  if (takeaways && takeaways.length > 0) {
    takeawaysHtml = `
      <ul class="critique-takeaways">
        ${takeaways.slice(0, 3).map(t => `<li><span class="check">✓</span> <span>${escapeHtml(t)}</span></li>`).join('')}
      </ul>
    `;
  }

  return `
    <div class="slide-critique-glow"></div>
    <div class="critique-badge-row">
      <span class="critique-verdict-badge">⚡ CURATOR'S VERDICT & TAKE</span>
      <span class="audience-pill" style="font-size:10px; padding:3px 8px;">🎯 ${audience}</span>
    </div>
    <div class="critique-body">
      <div class="critique-quote-mark">“</div>
      <p class="critique-opinion-text">${opinion}</p>
      ${whyItMatters && whyItMatters !== opinion ? `
        <div class="critique-why-box">
          <div class="critique-why-title">💡 Why This Matters</div>
          <p class="critique-why-content">${whyItMatters}</p>
        </div>
      ` : ''}
      ${takeawaysHtml}
    </div>
    <div class="critique-footer">
      <div class="critique-creator">
        <div class="avatar-inner" style="width:24px; height:24px; font-size:11px; border-radius:50%; background:#1E293B;">${initial}</div>
        <span>${handle}</span>
        <span style="color:#38BDF8; font-size:11px;" title="Verified Curator">✓</span>
      </div>
      <span style="font-size:10.5px; color:#94A3B8; font-weight:600;">⏱️ 45s read</span>
    </div>
  `;
}

function buildSlide3Html(post, index) {
  const pubName = escapeHtml(post.publicationName || 'THE FINANCIAL CHRONICLE');
  const headline = escapeHtml(post.originalHeadline || post.adaptedHeadline || 'Original News Source');
  const quote = escapeHtml(post.receiptHighlightQuote || post.pullQuote || 'Primary reporting confirmed that recorded structural indicators diverged sharply from initial forecasts across core operations.');
  const digitalUrl = post.digitalLink || '';

  // Extract 2 to 3 section excerpt statements
  let paragraphs = post.articleExcerpts || [];
  if (!paragraphs || paragraphs.length === 0) {
    if (post.summary) {
      paragraphs = post.summary.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 20).slice(0, 3);
    }
  }

  let excerptsHtml = '';
  if (paragraphs.length > 0) {
    excerptsHtml = `
      <div class="receipt-paragraphs">
        ${paragraphs.slice(0, 3).map(p => `<p>${escapeHtml(p)}</p>`).join('')}
      </div>
    `;
  }

  return `
    <div class="receipt-header">
      <div class="receipt-stamp">🗞️ THE "RECEIPT" • SOURCE CLIPPING</div>
      <div class="receipt-pub-title">${pubName}</div>
      <div class="receipt-rules">
        <span>VERIFIED EDITION</span>
        <span>NEWSROOM EXCERPTS</span>
        <span>PAGE 01</span>
      </div>
      <h4 class="receipt-headline">"${headline}"</h4>
    </div>
    
    <div class="receipt-highlight">
      “${quote}”
    </div>

    ${excerptsHtml}

    <div class="receipt-footer">
      <span class="receipt-verified-badge">
        <span>✓</span> <span>Evidence Record</span>
      </span>
      ${digitalUrl ? `
        <a href="${digitalUrl}" target="_blank" class="receipt-source-link" onclick="event.stopPropagation()">
          🌐 Read Full Story &nearr;
        </a>
      ` : `
        <span style="font-size:9.5px; color:#64748B; font-style:italic;">Archived Newspaper Print</span>
      `}
    </div>
  `;
}

/* ============================================================
   POST CARD GENERATOR
   ============================================================ */

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
  const isCarousel = post.postFormat === 'carousel_trio' || (post.articleExcerpts && post.articleExcerpts.length > 0);
  const hasPaperCut = post.originalPhotoPath && 
                      !post.originalPhotoPath.startsWith('http') && 
                      post.originalPhotoPath !== 'digital_article_link' && 
                      post.originalPhotoPath !== 'book_excerpt_reading' &&
                      post.originalPhotoPath !== 'sample_asset_print';
  const digitalUrl = post.digitalLink || '';

  let visualSectionHtml = '';

  if (isCarousel) {
    // 3-Poster Carousel Trio Frame with Interactive Tabs & Arrows
    visualSectionHtml = `
      <div class="carousel-slide-tabs" id="tabs-${index}">
        <button class="carousel-tab-btn active" onclick="goToSlide(event, ${index}, 0)">1. Hook Poster</button>
        <button class="carousel-tab-btn" onclick="goToSlide(event, ${index}, 1)">2. Curator Take</button>
        <button class="carousel-tab-btn" onclick="goToSlide(event, ${index}, 2)">3. The Receipt</button>
      </div>

      <div class="carousel-view" id="carousel-${index}" data-post-index="${index}" data-current-slide="0">
        <div class="carousel-track" id="track-${index}">
          <div class="carousel-slide slide-hook" onclick="openDetailModal(${index})">
            ${buildSlide1Html(post, index)}
          </div>
          <div class="carousel-slide slide-critique" onclick="openDetailModal(${index})">
            ${buildSlide2Html(post, index)}
          </div>
          <div class="carousel-slide slide-receipt" onclick="openDetailModal(${index})">
            ${buildSlide3Html(post, index)}
          </div>
        </div>

        <!-- Navigation Buttons -->
        <button class="carousel-nav-btn prev-btn" onclick="changeSlide(event, ${index}, -1)" title="Previous Slide">&#x2039;</button>
        <button class="carousel-nav-btn next-btn" onclick="changeSlide(event, ${index}, 1)" title="Next Slide">&#x203A;</button>

        <!-- Top Right Slide Counter -->
        <div class="slide-counter-badge" id="badge-${index}">
          <span>📑</span> <span class="counter-num">1 / 3 • Hook</span>
        </div>

        <!-- Bottom Dot Indicators -->
        <div class="carousel-dots" id="dots-${index}">
          <span class="carousel-dot active" onclick="goToSlide(event, ${index}, 0)"></span>
          <span class="carousel-dot" onclick="goToSlide(event, ${index}, 1)"></span>
          <span class="carousel-dot" onclick="goToSlide(event, ${index}, 2)"></span>
        </div>
      </div>
    `;
  } else {
    // Single Poster Card
    let heroVisualHtml = '';
    if (post.illustrationBase64) {
      heroVisualHtml = `
        <div class="poster-canvas" onclick="openDetailModal(${index})">
          <img class="poster-img" src="data:image/jpeg;base64,${post.illustrationBase64}" alt="${escapeHtml(headline)}" loading="lazy">
        </div>
      `;
    } else {
      heroVisualHtml = `
        <div class="poster-canvas" onclick="openDetailModal(${index})">
          <div class="infographic-banner">
            <div class="banner-top">
              <span class="audience-pill">🎯 ${escapeHtml(audience)}</span>
              <span class="style-pill">${escapeHtml(post.posterStyle || 'EDITORIAL')}</span>
            </div>
            <div class="banner-center">
              ${metric ? `
                <div class="metric-badge">
                  <span class="metric-val">${escapeHtml(metric)}</span>
                  <span class="metric-label">Key Signal</span>
                </div>
              ` : ''}
              <h3 class="canvas-headline">${escapeHtml(headline)}</h3>
              ${quote ? `<p class="canvas-quote">"${escapeHtml(quote)}"</p>` : ''}
            </div>
            <div class="banner-bottom">
              <span class="mood-text">✦ ${escapeHtml(post.visualMood || 'Visual Editorial Poster')}</span>
              <span style="font-size:11px; font-weight:700; color:#A5B4FC;">EDITOUR.APP</span>
            </div>
          </div>
        </div>
      `;
    }
    visualSectionHtml = heroVisualHtml;
  }

  card.innerHTML = `
    <div class="post-header">
      <div class="creator-info">
        <div class="creator-avatar">
          <div class="avatar-inner">${initial}</div>
        </div>
        <div class="creator-names">
          <div class="creator-handle-row">
            <span class="creator-handle">${escapeHtml(handle)}</span>
            <span class="post-time">• Today</span>
          </div>
          <div class="pub-source-badge">
            <span>${isBook ? '📖' : '📰'}</span>
            <span>${escapeHtml(pubName)}</span>
          </div>
        </div>
      </div>
      <span class="category-tag" ${isCarousel ? 'style="background:rgba(16,185,129,0.15); color:#10B981; border:1px solid rgba(16,185,129,0.35); font-weight:800;"' : ''}>
        ${isCarousel ? '🎨 3-POSTER CAROUSEL' : escapeHtml(catBadge)}
      </span>
    </div>

    ${visualSectionHtml}

    <div class="action-bar">
      <div class="action-group-left">
        <button class="action-btn" onclick="toggleLike(this)">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
          </svg>
          <span class="like-count">64</span>
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
      <div class="post-headline">${escapeHtml(headline)}</div>
      ${hook ? `<div class="post-hook">${escapeHtml(hook)}</div>` : ''}
      ${isCarousel ? `
        <div style="margin: 8px 0; padding: 7px 11px; background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.22); border-radius: 8px; font-size: 11.5px; color: #E2E8F0; display:flex; justify-content:space-between; align-items:center;">
          <span>🎨 <b>3-Poster Carousel:</b> Slide 1: Hook • Slide 2: Verdict • Slide 3: Receipt</span>
          <button class="read-more-btn" onclick="openDetailModal(${index})">Open Briefing &nearr;</button>
        </div>
      ` : `
        <div class="post-summary-snippet">
          ${escapeHtml(summary.substring(0, 160))}...
          <button class="read-more-btn" onclick="openDetailModal(${index})">⏱️ 1-min read</button>
        </div>
      `}
    </div>
  `;

  return card;
}

/* ============================================================
   CAROUSEL NAVIGATION LOGIC
   ============================================================ */

function changeSlide(event, postIndex, direction) {
  if (event) event.stopPropagation();
  const carousel = document.getElementById(`carousel-${postIndex}`);
  if (!carousel) return;
  let cur = parseInt(carousel.getAttribute('data-current-slide') || '0', 10);
  let next = cur + direction;
  if (next < 0) next = 2;
  if (next > 2) next = 0;
  goToSlide(event, postIndex, next);
}

function goToSlide(event, postIndex, slideIndex) {
  if (event) event.stopPropagation();
  const carousel = document.getElementById(`carousel-${postIndex}`);
  const track = document.getElementById(`track-${postIndex}`);
  const badge = document.getElementById(`badge-${postIndex}`);
  const tabs = document.getElementById(`tabs-${postIndex}`);
  const dots = document.getElementById(`dots-${postIndex}`);
  if (!carousel || !track) return;

  carousel.setAttribute('data-current-slide', slideIndex);
  track.style.transform = `translateX(-${slideIndex * 33.333333}%)`;

  if (badge) {
    const titles = ['1 / 3 • Hook', '2 / 3 • Curator Take', '3 / 3 • The Receipt'];
    badge.innerHTML = `<span>📑</span> <span class="counter-num">${titles[slideIndex]}</span>`;
  }

  if (tabs) {
    tabs.querySelectorAll('.carousel-tab-btn').forEach((btn, i) => {
      btn.classList.toggle('active', i === slideIndex);
    });
  }

  if (dots) {
    dots.querySelectorAll('.carousel-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === slideIndex);
    });
  }
}

function setupCarouselGestures(postIndex) {
  const carousel = document.getElementById(`carousel-${postIndex}`);
  if (!carousel) return;

  let startX = 0;
  let startY = 0;
  let isSwiping = false;

  carousel.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isSwiping = true;
    }
  }, { passive: true });

  carousel.addEventListener('touchend', (e) => {
    if (!isSwiping || e.changedTouches.length === 0) return;
    isSwiping = false;
    const diffX = e.changedTouches[0].clientX - startX;
    const diffY = e.changedTouches[0].clientY - startY;
    if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
      if (diffX < 0) {
        changeSlide(null, postIndex, 1);
      } else {
        changeSlide(null, postIndex, -1);
      }
    }
  }, { passive: true });
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

/* ============================================================
   MODALS & ACTIONS
   ============================================================ */

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
    li.innerHTML = `<span class="bullet-icon">✓</span> <span>${escapeHtml(item)}</span>`;
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
  updateBadge(true, 'Refreshing feed...');
  await loadPosts();
}

function setupAutoRefresh() {
  setInterval(async () => {
    try {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/posts?select=*&data->>deleted=is.null&order=created_at.desc&limit=35`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });
      if (resp.ok) {
        const rows = await resp.json();
        const activePosts = rows.map(r => r.data || r).filter(p => p && !p.deleted && !p.isDeleted && (p.adaptedHeadline || p.originalHeadline || p.summary));
        if (rows && activePosts.length !== allPosts.length) {
          allPosts = activePosts;
          renderFeed();
          updateBadge(true, `Live Feed (${allPosts.length} posts)`);
        }
      }
    } catch (_) {}
  }, 10000);
}

document.addEventListener('DOMContentLoaded', init);
