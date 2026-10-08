let allPosts = [];
let currentFilter = 'all';
let searchQuery = '';
let activePostIndex = null;

// ============================================================
// READING ATMOSPHERE CONTROLLER (Daylight Paper / Obsidian / Auto)
// Default Theme: Daylight Paper (warm newsprint ivory)
// ============================================================
let currentAtmospherePref = localStorage.getItem('slant_atmosphere_mode');
if (!currentAtmospherePref || currentAtmospherePref === 'auto' || localStorage.getItem('slant_theme_v3') !== 'daylight_default') {
  currentAtmospherePref = 'daylight';
  localStorage.setItem('slant_atmosphere_mode', 'daylight');
  localStorage.setItem('slant_theme_v3', 'daylight_default');
}

function getEffectiveAtmosphere(pref) {
  if (pref === 'obsidian') return 'obsidian';
  if (pref === 'auto') {
    // Auto: Daylight between 6 AM and 6 PM, Obsidian at night
    const hour = new Date().getHours();
    return (hour >= 6 && hour < 18) ? 'daylight' : 'obsidian';
  }
  return 'daylight';
}

function applyAtmosphere(pref) {
  currentAtmospherePref = pref || currentAtmospherePref;
  const effective = getEffectiveAtmosphere(currentAtmospherePref);
  document.documentElement.setAttribute('data-theme', effective);
  if (document.body) {
    document.body.setAttribute('data-theme', effective);
  }
  
  // Update navbar icon
  const iconEl = document.getElementById('themeToggleIcon');
  if (iconEl) {
    if (currentAtmospherePref === 'auto') {
      iconEl.textContent = '⏰';
      iconEl.title = `Auto (Time of Day: currently ${effective === 'daylight' ? 'Daylight ☀️' : 'Obsidian 🌙'})`;
    } else if (currentAtmospherePref === 'daylight') {
      iconEl.textContent = '☀️';
      iconEl.title = 'Daylight Paper Mode (Default • Click to change)';
    } else {
      iconEl.textContent = '🌙';
      iconEl.title = 'Obsidian Press Mode (Click to change)';
    }
  }

  // Update checkmarks in drawer and dropdowns
  ['daylight', 'obsidian', 'auto'].forEach(mode => {
    const checkEl = document.getElementById(`check-${mode}`);
    if (checkEl) checkEl.textContent = currentAtmospherePref === mode ? '✓' : '';
    const drawerCheck = document.getElementById(`drawer-check-${mode}`);
    if (drawerCheck) drawerCheck.textContent = currentAtmospherePref === mode ? '✓' : '';
    const drawerBtn = document.getElementById(`themeBtn-${mode}`);
    if (drawerBtn) drawerBtn.classList.toggle('active', currentAtmospherePref === mode);
  });

  localStorage.setItem('slant_atmosphere_mode', currentAtmospherePref);
}

function openDrawer() {
  const drawer = document.getElementById('optionsDrawer');
  const overlay = document.getElementById('optionsDrawerOverlay');
  if (drawer && overlay) {
    drawer.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closeDrawer() {
  const drawer = document.getElementById('optionsDrawer');
  const overlay = document.getElementById('optionsDrawerOverlay');
  if (drawer && overlay) {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }
}

function toggleDrawer(e) {
  if (e) e.stopPropagation();
  const drawer = document.getElementById('optionsDrawer');
  if (drawer && drawer.classList.contains('open')) {
    closeDrawer();
  } else {
    openDrawer();
  }
}

function toggleThemeMenu(e) {
  toggleDrawer(e);
}

function setAtmospherePreference(pref) {
  applyAtmosphere(pref);
}

async function syncFeedFromDrawer() {
  const btn = document.querySelector('.drawer-refresh-btn');
  if (btn) btn.classList.add('spinning');
  try {
    await syncFeed();
  } finally {
    setTimeout(() => {
      if (btn) btn.classList.remove('spinning');
    }, 600);
  }
}

// Close drawer on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDrawer();
});

// Apply atmosphere immediately before render
applyAtmosphere(currentAtmospherePref);

async function init() {
  applyAtmosphere(currentAtmospherePref);
  // Auto-check time of day every 60s if mode is 'auto'
  setInterval(() => {
    if (currentAtmospherePref === 'auto') {
      applyAtmosphere('auto');
    }
  }, 60000);

  initAuth();
  await loadPosts();
  setupEventListeners();
  setupPullToRefresh();
  checkDeepLink();
  setupRealtimeSubscription();
}

const SUPABASE_URL = 'https://fsuukgpizuipxxwatkbo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzdXVrZ3BpenVpcHh4d2F0a2JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMzE4NjEsImV4cCI6MjEwNjcwNzg2MX0.NPnTDhGyiigPZIvror8JGqjCMVKuJ8OZaDN2pGuVfM8';

// Supabase Auth & DB Client
let supabaseClient = null;
if (window.supabase && typeof window.supabase.createClient === 'function') {
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  } catch (e) {
    console.warn('Could not init Supabase client:', e);
  }
}

// User session state & saved bookmarks
let currentUser = null;
let savedPostIds = new Set(JSON.parse(localStorage.getItem('slant_saved_posts') || localStorage.getItem('editour_saved_posts') || '[]'));
let myCreatedPostIds = new Set(JSON.parse(localStorage.getItem('slant_my_posts') || '[]'));

// ============================================================
// AUTHENTICATION & USER PROFILE CONTROLLER
// ============================================================

async function initAuth() {
  if (!supabaseClient) {
    updateAuthUI();
    return;
  }

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    currentUser = session?.user || null;
    updateAuthUI();
  } catch (err) {
    console.warn('Error fetching initial session:', err);
  }

  supabaseClient.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;
    updateAuthUI();
    if (event === 'SIGNED_IN') {
      closeAuthModal();
      showTemporaryToast(`Welcome, ${escapeHtml(getUserDisplayName())}! ✨`);
      // Restore cloud-saved bookmarks and authored stories from user metadata
      if (currentUser?.user_metadata) {
        const cloudSaved = currentUser.user_metadata.saved_posts;
        if (Array.isArray(cloudSaved) && cloudSaved.length > 0) {
          cloudSaved.forEach(id => savedPostIds.add(id));
          localStorage.setItem('slant_saved_posts', JSON.stringify(Array.from(savedPostIds)));
        }
        const cloudMy = currentUser.user_metadata.my_posts;
        if (Array.isArray(cloudMy) && cloudMy.length > 0) {
          cloudMy.forEach(id => myCreatedPostIds.add(id));
          localStorage.setItem('slant_my_posts', JSON.stringify(Array.from(myCreatedPostIds)));
        }
      }
      checkLiveSupabaseUpdates(true);
    } else if (event === 'SIGNED_OUT') {
      closeAuthModal();
      showTemporaryToast('Signed out successfully.');
      if (currentFilter === 'my_stories') {
        selectCategory('all');
      } else {
        renderFeed();
      }
    }
  });
}

function syncUserMetadataToCloud() {
  if (currentUser && supabaseClient && typeof supabaseClient.auth?.updateUser === 'function') {
    try {
      supabaseClient.auth.updateUser({
        data: {
          saved_posts: Array.from(savedPostIds),
          my_posts: Array.from(myCreatedPostIds)
        }
      }).catch(err => console.warn('Could not sync user metadata:', err));
    } catch (e) {}
  }
}

function getUserDisplayName() {
  if (!currentUser) return 'Reader';
  const meta = currentUser.user_metadata || {};
  return meta.full_name || meta.name || currentUser.email?.split('@')[0] || 'Reader';
}

function getUserAvatarUrl() {
  if (!currentUser) return null;
  const meta = currentUser.user_metadata || {};
  return meta.avatar_url || meta.picture || null;
}

function updateAuthUI() {
  const signInBtn = document.getElementById('headerAuthBtn');
  const userMenuWrap = document.getElementById('userMenuWrap');
  const userDropdownName = document.getElementById('userMenuName');
  const userDropdownEmail = document.getElementById('userMenuEmail');
  const userAvatarImg = document.getElementById('userAvatarImg');
  const userAvatarLetter = document.getElementById('userAvatarLetter');
  const userMenuSavedCount = document.getElementById('userMenuSavedCount');
  const badgeSavedCount = document.getElementById('badgeSavedCount');
  const userMenuMyCount = document.getElementById('userMenuMyCount');
  const badgeMyCount = document.getElementById('badgeMyCount');
  const pillSaved = document.getElementById('pillSaved');
  const pillMyStories = document.getElementById('pillMyStories');

  const savedCount = savedPostIds.size;
  if (userMenuSavedCount) userMenuSavedCount.textContent = savedCount;
  if (badgeSavedCount) badgeSavedCount.textContent = savedCount;

  // Compute how many posts belong to this user
  let myPostsCount = 0;
  if (Array.isArray(allPosts)) {
    const userEmail = currentUser ? (currentUser.email || '').toLowerCase() : '';
    const userHandle = currentUser ? (currentUser.user_metadata?.user_name || currentUser.user_metadata?.name || userEmail.split('@')[0] || '').toLowerCase().replace('@', '') : '';
    myPostsCount = allPosts.filter(p => {
      if (myCreatedPostIds.has(p.id)) return true;
      if (!currentUser) return false;
      const postAuthor = (p.creatorHandle || '').toLowerCase().replace('@', '');
      const postUserId = p.user_id || p.userId;
      return (postUserId && postUserId === currentUser.id) || (userHandle && postAuthor && postAuthor === userHandle) || (userEmail && (p.userEmail || '').toLowerCase() === userEmail);
    }).length;
  }
  if (userMenuMyCount) userMenuMyCount.textContent = myPostsCount;
  if (badgeMyCount) badgeMyCount.textContent = myPostsCount;

  if (currentUser) {
    if (signInBtn) signInBtn.style.display = 'none';
    if (userMenuWrap) userMenuWrap.style.display = 'block';

    const displayName = getUserDisplayName();
    if (userDropdownName) userDropdownName.textContent = displayName;
    if (userDropdownEmail) userDropdownEmail.textContent = currentUser.email || '';

    const avatarUrl = getUserAvatarUrl();
    if (avatarUrl && userAvatarImg && userAvatarLetter) {
      userAvatarImg.src = avatarUrl;
      userAvatarImg.style.display = 'block';
      userAvatarLetter.style.display = 'none';
    } else if (userAvatarLetter) {
      userAvatarLetter.textContent = (displayName[0] || 'U').toUpperCase();
      if (userAvatarImg) userAvatarImg.style.display = 'none';
      userAvatarLetter.style.display = 'flex';
    }

    if (pillSaved) pillSaved.style.display = '';
    if (pillMyStories) pillMyStories.style.display = '';

    // Update Drawer Account UI
    const drawerAuthGuest = document.getElementById('drawerAuthGuest');
    const drawerAuthUser = document.getElementById('drawerAuthUser');
    const drawerUserName = document.getElementById('drawerUserName');
    const drawerUserEmail = document.getElementById('drawerUserEmail');
    const drawerUserAvatar = document.getElementById('drawerUserAvatar');
    const drawerSavedCount = document.getElementById('drawerSavedCount');
    const drawerMyCount = document.getElementById('drawerMyCount');

    if (drawerAuthGuest) drawerAuthGuest.style.display = 'none';
    if (drawerAuthUser) drawerAuthUser.style.display = 'flex';
    if (drawerUserName) drawerUserName.textContent = displayName;
    if (drawerUserEmail) drawerUserEmail.textContent = currentUser.email || '';
    if (drawerUserAvatar) drawerUserAvatar.textContent = (displayName[0] || 'U').toUpperCase();
    if (drawerSavedCount) drawerSavedCount.textContent = savedCount;
    if (drawerMyCount) drawerMyCount.textContent = myPostsCount;
  } else {
    if (signInBtn) signInBtn.style.display = 'inline-flex';
    if (userMenuWrap) userMenuWrap.style.display = 'none';

    // Show saved pill if reader saved cards locally
    if (pillSaved) pillSaved.style.display = savedCount > 0 ? '' : 'none';
    if (pillMyStories) pillMyStories.style.display = myPostsCount > 0 ? '' : 'none';

    // Update Drawer Account UI for guest
    const drawerAuthGuest = document.getElementById('drawerAuthGuest');
    const drawerAuthUser = document.getElementById('drawerAuthUser');
    if (drawerAuthGuest) drawerAuthGuest.style.display = 'flex';
    if (drawerAuthUser) drawerAuthUser.style.display = 'none';
  }
}

let isAuthPasswordMode = false;

function togglePasswordMode(isPassword) {
  isAuthPasswordMode = (isPassword === true);
  const wrap = document.getElementById('loginPasswordWrap');
  const helper = document.getElementById('authHelperText');
  const submitBtn = document.getElementById('emailAuthBtn');
  const altRow = document.getElementById('authAltRow');
  const passwordInput = document.getElementById('loginPasswordInput');

  if (isAuthPasswordMode) {
    if (wrap) wrap.style.display = 'block';
    if (helper) helper.textContent = 'Enter your email & password to sign into your Slant account.';
    if (submitBtn) submitBtn.innerHTML = '<span>Sign In with Password &rarr;</span>';
    if (altRow) {
      altRow.innerHTML = `
        <button type="button" class="auth-toggle-btn" onclick="togglePasswordMode(false)">
          Prefer passwordless? Send Magic Link instead
        </button>
      `;
    }
    if (passwordInput) passwordInput.focus();
  } else {
    if (wrap) wrap.style.display = 'none';
    if (helper) helper.textContent = "We'll send an instant passwordless magic link to your email.";
    if (submitBtn) submitBtn.innerHTML = '<span>Send Magic Link &rarr;</span>';
    if (altRow) {
      altRow.innerHTML = `
        <button type="button" class="auth-toggle-btn" id="togglePasswordModeBtn" onclick="togglePasswordMode(true)">
          Have a password? Sign in with password
        </button>
      `;
    }
  }
}

const FEATURED_COLORFUL_POST_CONFIGS = [
  {
    id: '9a9a239d-3865-4f6c-9aa8-db0bf8771588',
    icon: '🛕',
    shortName: 'Ayodhya Temple'
  },
  {
    id: '83940fae-4ad7-43f6-9329-91cd17752f78',
    icon: '🥇',
    shortName: 'Asian Games Gold'
  },
  {
    id: 'bb5114c8-da15-4af9-afaf-70a577cc6e4a',
    icon: '📈',
    shortName: 'GST Divergence'
  },
  {
    id: '2f001766-faca-4a3a-92c8-20ea3f444749',
    icon: '🌳',
    shortName: 'Hebbal Canopy'
  },
  {
    id: '692d99fc-d140-4d1c-9275-3263a7c187b7',
    icon: '🚨',
    shortName: 'Karnataka Drought'
  }
];

function renderLoginPostsPreview() {
  const track = document.getElementById('loginPostsScrollTrack');
  const switcher = document.getElementById('loginStoriesSwitcher');
  if (!track) return;

  // Don't re-render if already populated
  if (track.children.length > 0 && track.dataset.populated === 'true') {
    return;
  }

  // Load feed if not loaded yet
  if (!Array.isArray(allPosts) || allPosts.length === 0) {
    fetch('slant_feed.json')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          allPosts = data.filter(p => p && !p.deleted && (p.adaptedHeadline || p.hook || p.summary));
          renderLoginPostsPreview();
        }
      })
      .catch(e => console.warn('Could not load slant_feed for login preview:', e));
    return;
  }

  // Find the selected colourful posts
  const selectedPosts = [];
  FEATURED_COLORFUL_POST_CONFIGS.forEach(cfg => {
    const post = allPosts.find(p => p && p.id === cfg.id);
    if (post) {
      selectedPosts.push({ post, cfg });
    }
  });

  // Fallback if some IDs are missing
  if (selectedPosts.length === 0) {
    allPosts.slice(0, 4).forEach((post, i) => {
      selectedPosts.push({
        post,
        cfg: { id: post.id, icon: '📰', shortName: post.categoryBadge || `Story ${i+1}` }
      });
    });
  }

  track.innerHTML = '';
  track.dataset.populated = 'true';
  if (switcher) switcher.innerHTML = '';

  // 1. Build Story Switcher Pills
  selectedPosts.forEach(({ post, cfg }, idx) => {
    if (switcher) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `story-switch-pill ${idx === 0 ? 'active' : ''}`;
      pill.id = `storyPill-${post.id}`;
      pill.innerHTML = `<span>${cfg.icon}</span> <span>${escapeHtml(cfg.shortName)}</span>`;
      pill.onclick = () => {
        document.querySelectorAll('.story-switch-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const targetRow = document.getElementById(`login-row-${post.id}`);
        if (targetRow) {
          targetRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      };
      switcher.appendChild(pill);
    }
  });

  // 2. Build 3 Posters of Single Post in a Row for each colourful story
  selectedPosts.forEach(({ post, cfg }, idx) => {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'login-post-row';
    rowDiv.id = `login-row-${post.id}`;

    const catBadge = post.categoryBadge || 'CURATED';
    const pubName = post.publicationName || 'Slant Press';
    const author = post.creatorHandle || '@curator';
    const headline = post.adaptedHeadline || post.originalHeadline || 'Visual Editorial';

    // Slide 1 (Hook), Slide 2 (Critique / Slant), Slide 3 (Receipts)
    const slide1Content = buildSlide1Html(post, `login-${idx}`);
    const slide2Content = buildSlide2Html(post, `login-${idx}`);
    const slide3Content = buildSlide3Html(post, `login-${idx}`);

    rowDiv.innerHTML = `
      <!-- Single Post Row Header -->
      <div class="login-row-header">
        <div class="login-row-meta-left">
          <span class="login-row-cat-pill">${cfg.icon} ${escapeHtml(catBadge)}</span>
          <span class="login-row-headline" title="${escapeHtml(headline)}">${escapeHtml(headline)}</span>
        </div>
        <div class="login-row-meta-right">
          <span class="login-row-source">${escapeHtml(pubName)}</span>
          <span class="login-row-author">${escapeHtml(author)}</span>
        </div>
      </div>

      <!-- 3 Posters in a Row: Hook, Slant, Receipts -->
      <div class="login-row-posters">
        <!-- Poster 1: The Visual Hook -->
        <div class="login-poster-col poster-hook" onclick="previewPostFromLogin('${post.id}')" title="Poster 1: Visual Hook • Click to read in feed">
          <span class="login-poster-label">01 • HOOK</span>
          <div class="carousel-slide slide-hook">
            ${slide1Content}
          </div>
        </div>

        <!-- Poster 2: The Slant & Conviction -->
        <div class="login-poster-col poster-slant" onclick="previewPostFromLogin('${post.id}')" title="Poster 2: The Slant • Click to read in feed">
          <span class="login-poster-label">02 • THE SLANT</span>
          <div class="carousel-slide slide-critique">
            ${slide2Content}
          </div>
        </div>

        <!-- Poster 3: The Primary Receipts -->
        <div class="login-poster-col poster-receipts" onclick="previewPostFromLogin('${post.id}')" title="Poster 3: The Receipts • Click to read in feed">
          <span class="login-poster-label">03 • RECEIPTS</span>
          <div class="carousel-slide slide-receipt">
            ${slide3Content}
          </div>
        </div>
      </div>

      ${idx < selectedPosts.length - 1 ? '<div class="login-row-divider">✦ NEXT EDITORIAL TRIO ✦</div>' : ''}
    `;

    track.appendChild(rowDiv);
  });

  // Track scroll position to update active switcher pill
  if (switcher && typeof IntersectionObserver !== 'undefined') {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id.replace('login-row-', '');
          document.querySelectorAll('.story-switch-pill').forEach(p => p.classList.remove('active'));
          const activePill = document.getElementById(`storyPill-${id}`);
          if (activePill) activePill.classList.add('active');
        }
      });
    }, { root: track, threshold: 0.35 });

    selectedPosts.forEach(({ post }) => {
      const el = document.getElementById(`login-row-${post.id}`);
      if (el) observer.observe(el);
    });
  }

  // Start continuous vertical oscillation drift for the showcase track
  startLoginTrackVerticalOscillation(track);
}

// Step-by-Step Smooth Vertical Auto-Scroll Controller (every 5 seconds)
let loginAutoScrollTimer = null;
let loginScrollRowIndex = 0;
let loginScrollDirection = 1; // 1 = scrolling downwards, -1 = scrolling upwards
let isLoginTrackHovered = false;

function startLoginTrackVerticalOscillation(track) {
  if (!track || track.dataset.oscillatorStarted === 'true') return;
  track.dataset.oscillatorStarted = 'true';

  function doScrollStep() {
    if (isLoginTrackHovered) return;
    const rows = track.querySelectorAll('.login-post-row');
    if (!rows || rows.length <= 1) return;

    // Advance to next row
    loginScrollRowIndex += loginScrollDirection;

    // Check boundaries and reverse direction at the ends
    if (loginScrollRowIndex >= rows.length - 1) {
      loginScrollRowIndex = rows.length - 1;
      loginScrollDirection = -1; // Reached bottom, next time scroll up!
    } else if (loginScrollRowIndex <= 0) {
      loginScrollRowIndex = 0;
      loginScrollDirection = 1; // Reached top, next time scroll down!
    }

    const targetRow = rows[loginScrollRowIndex];
    if (targetRow) {
      const targetTop = targetRow.offsetTop - track.offsetTop;
      track.scrollTo({ top: Math.max(0, targetTop - 8), behavior: 'smooth' });
    }
  }

  function resetTimer() {
    if (loginAutoScrollTimer) clearInterval(loginAutoScrollTimer);
    loginAutoScrollTimer = setInterval(doScrollStep, 5000);
  }

  // Hover detection: pause firmly when user brings mouse pointer on them
  track.addEventListener('mouseenter', () => {
    isLoginTrackHovered = true;
    if (loginAutoScrollTimer) clearInterval(loginAutoScrollTimer);
  });

  track.addEventListener('mouseleave', () => {
    isLoginTrackHovered = false;
    resetTimer();
  });

  // Touch detection for mobile devices
  track.addEventListener('touchstart', () => {
    isLoginTrackHovered = true;
    if (loginAutoScrollTimer) clearInterval(loginAutoScrollTimer);
  }, { passive: true });

  track.addEventListener('touchend', () => {
    isLoginTrackHovered = false;
    resetTimer();
  }, { passive: true });

  // When user wheels or scrolls manually, sync current row index
  track.addEventListener('wheel', () => {
    isLoginTrackHovered = true;
    if (loginAutoScrollTimer) clearInterval(loginAutoScrollTimer);
    clearTimeout(track._wheelTimeout);
    track._wheelTimeout = setTimeout(() => {
      isLoginTrackHovered = false;
      const rows = track.querySelectorAll('.login-post-row');
      let nearestIdx = 0;
      let minDiff = Infinity;
      rows.forEach((r, i) => {
        const diff = Math.abs(r.offsetTop - track.offsetTop - track.scrollTop);
        if (diff < minDiff) {
          minDiff = diff;
          nearestIdx = i;
        }
      });
      loginScrollRowIndex = nearestIdx;
      resetTimer();
    }, 4000);
  }, { passive: true });

  // Start the 5-second interval
  resetTimer();
}

function scrollLoginPosts(direction) {
  const track = document.getElementById('loginPostsScrollTrack');
  if (!track) return;
  isLoginTrackHovered = true;
  clearTimeout(track._manualTimeout);
  track._manualTimeout = setTimeout(() => { isLoginTrackHovered = false; }, 4000);

  const rows = track.querySelectorAll('.login-post-row');
  if (rows && rows.length > 0) {
    loginScrollRowIndex = Math.max(0, Math.min(rows.length - 1, loginScrollRowIndex + direction));
    const targetRow = rows[loginScrollRowIndex];
    if (targetRow) {
      const targetTop = targetRow.offsetTop - track.offsetTop;
      track.scrollTo({ top: Math.max(0, targetTop - 8), behavior: 'smooth' });
    }
  } else {
    track.scrollBy({ top: 380 * direction, behavior: 'smooth' });
  }
}

function previewPostFromLogin(postId) {
  if (!postId) return;

  // If on standalone login.html, navigate to home with the post deep-link
  if (window.location.pathname.includes('login') || !document.getElementById('feedStream')) {
    sessionStorage.setItem('slant_guest_explored', 'true');
    window.location.href = `/?p=${encodeURIComponent(postId)}`;
    return;
  }

  closeAuthModal();
  const idx = allPosts.findIndex(p => p.id === postId);
  if (idx >= 0) {
    setTimeout(() => {
      openDetailModal(idx);
    }, 250);
  } else {
    showTemporaryToast('Navigating to story...');
  }
}

function openAuthModal(customDesc) {
  const modal = document.getElementById('authModal');
  const descEl = document.getElementById('authModalDesc');
  const statusEl = document.getElementById('authStatusMsg');
  if (statusEl) {
    statusEl.style.display = 'none';
    statusEl.textContent = '';
  }
  if (descEl && customDesc) {
    descEl.textContent = customDesc;
  } else if (descEl) {
    descEl.textContent = 'Sign in to save your favorite visual stories, customize your reading atmosphere, and publish your own editorials.';
  }
  if (modal) {
    modal.classList.add('open');
    modal.classList.add('active');
    const card = modal.querySelector('.slant-login-page-card');
    if (card) card.scrollTop = 0;
  }

  // Populate dynamic post preview cards in the login showcase
  renderLoginPostsPreview();

  // Push #login to URL hash if not already present
  if (window.location.hash !== '#login') {
    try {
      history.replaceState(null, '', '#login');
    } catch (e) {}
  }

  const themeMenu = document.getElementById('themeDropdownMenu');
  if (themeMenu) themeMenu.classList.remove('open');
  const userMenu = document.getElementById('userDropdownMenu');
  if (userMenu) userMenu.classList.remove('open');
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.classList.remove('open');
    modal.classList.remove('active');
  }

  try {
    sessionStorage.setItem('slant_guest_explored', 'true');
  } catch (e) {}

  // Remove #login from URL hash if present
  if (window.location.hash === '#login') {
    try {
      const cleanUrl = window.location.pathname + window.location.search;
      history.replaceState(null, '', cleanUrl);
    } catch (e) {}
  }
}

function handleAuthOverlayClick(e) {
  if (e && e.target && e.target.id === 'authModal') {
    closeAuthModal();
  }
}

function showAuthStatus(msg, type = 'normal') {
  const el = document.getElementById('authStatusMsg');
  if (!el) return;
  el.textContent = msg;
  el.className = `auth-status-msg ${type}`;
  el.style.display = 'block';
}

async function signInWithGoogle() {
  if (!supabaseClient) {
    showAuthStatus('Supabase client is initializing. Please try again in a moment.', 'error');
    return;
  }
  const btn = document.getElementById('googleLoginBtn');
  if (btn) btn.style.opacity = '0.6';
  showAuthStatus('Connecting to Google...', 'normal');
  try {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) throw error;
  } catch (err) {
    console.error('Google OAuth error:', err);
    showAuthStatus(err.message || 'Google sign in failed. Please try magic link email.', 'error');
    if (btn) btn.style.opacity = '1';
  }
}

async function handleEmailAuth(e) {
  if (e) e.preventDefault();
  if (!supabaseClient) {
    showAuthStatus('Supabase client is initializing. Please try again in a moment.', 'error');
    return;
  }

  const emailInput = document.getElementById('authEmailInput');
  const email = emailInput?.value?.trim();
  if (!email) return;

  const submitBtn = document.getElementById('emailAuthBtn');
  const origBtnHtml = submitBtn ? submitBtn.innerHTML : '';

  if (isAuthPasswordMode) {
    const passwordInput = document.getElementById('loginPasswordInput');
    const password = passwordInput?.value;
    if (!password) {
      showAuthStatus('Please enter your password.', 'error');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Signing in...';
    }

    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });
      if (error) {
        if (error.message && error.message.toLowerCase().includes('invalid login credentials')) {
          showAuthStatus('Invalid email or password. You can also sign in via Magic Link.', 'error');
        } else {
          showAuthStatus(error.message || 'Authentication failed.', 'error');
        }
        return;
      }
      showAuthStatus('Signed in successfully!', 'success');
      setTimeout(() => {
        closeAuthModal();
      }, 600);
    } catch (err) {
      console.error('Password auth error:', err);
      showAuthStatus(err.message || 'Authentication error. Please try again.', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origBtnHtml || '<span>Sign In with Password &rarr;</span>';
      }
    }
  } else {
    // Magic Link
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Sending magic link...';
    }

    try {
      const { error } = await supabaseClient.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin
        }
      });
      if (error) throw error;
      showAuthStatus(`Magic link sent! Check your inbox at ${email} to sign in.`, 'success');
      if (emailInput) emailInput.value = '';
    } catch (err) {
      console.error('Email OTP error:', err);
      showAuthStatus(err.message || 'Could not send magic link. Please check the email and try again.', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origBtnHtml || '<span>Send Magic Link &rarr;</span>';
      }
    }
  }
}

async function handleSignOut() {
  if (supabaseClient) {
    try {
      await supabaseClient.auth.signOut();
    } catch (e) {
      console.warn('Sign out error:', e);
    }
  }
  currentUser = null;
  const menu = document.getElementById('userDropdownMenu');
  if (menu) menu.classList.remove('open');
  updateAuthUI();
  if (currentFilter === 'my_stories') {
    selectCategory('all');
  } else {
    renderFeed();
  }
}

function toggleUserMenu(e) {
  if (e) e.stopPropagation();
  const themeMenu = document.getElementById('themeDropdownMenu');
  if (themeMenu) themeMenu.classList.remove('open');
  const menu = document.getElementById('userDropdownMenu');
  if (menu) menu.classList.toggle('open');
}

// Close user menu on outside click
document.addEventListener('click', (e) => {
  const menu = document.getElementById('userDropdownMenu');
  const btn = document.getElementById('userAvatarBtn');
  if (menu && menu.classList.contains('open') && !menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
    menu.classList.remove('open');
  }
});

function selectUserFilter(filterKey) {
  const menu = document.getElementById('userDropdownMenu');
  if (menu) menu.classList.remove('open');
  selectCategory(filterKey);
}

function selectCategory(categoryKey) {
  currentFilter = categoryKey;
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.classList.toggle('active', pill.getAttribute('data-cat') === categoryKey);
  });
  renderFeed();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleBookmark(event, postId) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }

  const isCurrentlySaved = savedPostIds.has(postId);
  if (isCurrentlySaved) {
    savedPostIds.delete(postId);
    showTemporaryToast('Removed from Saved Stories');
  } else {
    savedPostIds.add(postId);
    if (!currentUser) {
      showTemporaryToast('Saved! Sign in to sync your bookmarks across devices 🔖');
    } else {
      showTemporaryToast('Saved to your reading library 🔖');
    }
  }

  localStorage.setItem('slant_saved_posts', JSON.stringify(Array.from(savedPostIds)));
  localStorage.setItem('editour_saved_posts', JSON.stringify(Array.from(savedPostIds)));
  syncUserMetadataToCloud();

  // Update button in place
  const btn = document.getElementById(`bookmark-btn-${postId}`);
  if (btn) {
    btn.classList.toggle('is-saved', !isCurrentlySaved);
    btn.setAttribute('title', !isCurrentlySaved ? 'Remove from Saved' : 'Save Story');
    const svg = btn.querySelector('svg');
    if (svg) {
      svg.setAttribute('fill', !isCurrentlySaved ? '#F59E0B' : 'none');
      svg.setAttribute('stroke', !isCurrentlySaved ? '#F59E0B' : 'currentColor');
    }
  }

  updateAuthUI();

  // If in saved filter, re-render feed immediately
  if (currentFilter === 'saved') {
    renderFeed();
  }
}

function showTemporaryToast(message) {
  let toast = document.getElementById('slantToast') || document.getElementById('editourToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'slantToast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: var(--bg-surface);
      color: var(--text-primary);
      border: 1px solid var(--border-subtle);
      box-shadow: 0 10px 30px rgba(0,0,0,0.4);
      padding: 10px 18px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      z-index: 9999;
      opacity: 0;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: none;
      display: flex;
      align-items: center;
      gap: 8px;
      white-space: nowrap;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = '1';
  toast.style.transform = 'translateX(-50%) translateY(0)';
  
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
  }, 2800);
}

function mergeAndSortPosts(newPosts) {
  if (!Array.isArray(newPosts) || newPosts.length === 0) return false;

  const existingMap = new Map();
  // 1. Keep track of all current posts
  for (const post of allPosts) {
    if (post && post.id) {
      existingMap.set(post.id, post);
    }
  }

  let addedCount = 0;
  for (const raw of newPosts) {
    if (!raw) continue;
    const p = raw.data || raw;
    const postId = p.id || raw.id;
    if (!postId || p.deleted || p.isDeleted || raw.deleted || raw.isDeleted) continue;
    if (!p.adaptedHeadline && !p.originalHeadline && !p.summary) continue;

    // Normalize IDs and timestamps
    p.id = postId;
    p.createdAt = p.createdAt || raw.created_at || raw.createdAt || new Date().toISOString();

    if (!existingMap.has(postId)) {
      existingMap.set(postId, p);
      addedCount++;
    } else {
      // Merge with existing ensuring fresh server/cloud fields overwrite stale local fields
      const existing = existingMap.get(postId);
      const merged = { ...existing, ...p };
      merged.illustrationUrl = p.illustrationUrl || existing.illustrationUrl || '';
      merged.aiIllustrationUrl = p.aiIllustrationUrl || existing.aiIllustrationUrl || '';
      if (!merged.illustrationBase64 && existing.illustrationBase64) {
        merged.illustrationBase64 = existing.illustrationBase64;
      }
      existingMap.set(postId, merged);
    }
  }

  // Convert back to array and sort strictly chronologically (newest first)
  allPosts = Array.from(existingMap.values()).sort((a, b) => {
    const timeA = new Date(a.createdAt || a.created_at || 0).getTime();
    const timeB = new Date(b.createdAt || b.created_at || 0).getTime();
    return timeB - timeA; // Descending: newest stories stay at the top!
  });

  return addedCount > 0;
}

async function loadPosts() {
  // 1. Instant Cache-First: Load pre-built lightweight slant_feed.json (renders in ~20ms!)
  let loadedFromCache = false;
  try {
    const fastResp = await fetch(`slant_feed.json?ts=${Date.now()}`, { cache: 'no-cache' });
    if (fastResp.ok) {
      const posts = await fastResp.json();
      if (Array.isArray(posts) && posts.length > 0) {
        mergeAndSortPosts(posts);
        loadedFromCache = true;
      }
    }
  } catch (e) {
    console.warn('Could not load slant_feed.json, trying live cloud:', e);
  }

  // 2. Merge locally cached user-created stories so they NEVER vanish across sign-ins/reloads
  try {
    const localCache = JSON.parse(localStorage.getItem('slant_user_posts_cache') || '[]');
    if (Array.isArray(localCache) && localCache.length > 0) {
      mergeAndSortPosts(localCache);
    }
  } catch (e) {
    console.warn('Error merging local user posts cache:', e);
  }

  if (allPosts.length > 0) {
    updateBadge(true, `Live Feed (${allPosts.length} posts)`);
    updateAuthUI();
    renderFeed();
  }

  // 3. Immediately sync latest live posts from the cloud API so all devices (mobile, laptop) see new posts immediately!
  await syncLiveCloudPosts(!loadedFromCache);
}

async function syncLiveCloudPosts(forceRender = false) {
  let fetchedPosts = null;

  // 1. Primary: Fetch from /api/posts with timestamp and no-store to bypass any proxy/browser cache
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const apiResp = await fetch(`/api/posts?limit=6&ts=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (apiResp.ok) {
      const data = await apiResp.json();
      if (data && Array.isArray(data.posts) && data.posts.length > 0) {
        fetchedPosts = data.posts;
      }
    }
  } catch (apiErr) {
    console.warn('/api/posts live sync error, trying direct Supabase fallback:', apiErr);
  }

  // 2. Resilient Fallback: If /api/posts failed or was unreachable, query Supabase directly
  if (!fetchedPosts || fetchedPosts.length === 0) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/posts?select=id,created_at,data&order=created_at.desc&limit=6`, {
        signal: controller.signal,
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const rows = await resp.json();
        if (Array.isArray(rows) && rows.length > 0) {
          fetchedPosts = rows.map(r => {
            const p = r.data || r;
            p.id = p.id || r.id;
            p.createdAt = p.createdAt || r.created_at || new Date().toISOString();
            return p;
          });
        }
      }
    } catch (supaErr) {
      console.warn('Direct Supabase live sync completed or timed out:', supaErr);
    }
  }

  if (Array.isArray(fetchedPosts) && fetchedPosts.length > 0) {
    const validPosts = fetchedPosts.filter(p => p && !p.deleted && !p.isDeleted && (p.adaptedHeadline || p.originalHeadline || p.summary));
    const hasNew = mergeAndSortPosts(validPosts);

    // Persist synced user-created stories into local cache so they persist offline & across sessions
    try {
      const userStories = validPosts.filter(p => p.isUserCreated || myCreatedPostIds.has(p.id));
      if (userStories.length > 0) {
        const existingLocal = JSON.parse(localStorage.getItem('slant_user_posts_cache') || '[]');
        const map = new Map();
        userStories.forEach(p => map.set(p.id, p));
        existingLocal.forEach(p => { if (!map.has(p.id)) map.set(p.id, p); });
        localStorage.setItem('slant_user_posts_cache', JSON.stringify(Array.from(map.values()).slice(0, 30)));
      }
    } catch (_) {}

    if (hasNew || forceRender) {
      updateBadge(true, `Live Feed (${allPosts.length} posts)`);
      updateAuthUI();
      renderFeed();
    }
  }
}

// Backward-compatible alias
const checkLiveSupabaseUpdates = syncLiveCloudPosts;

function updateBadge(connected, textOrCount) {
  const badge = document.getElementById('connectionBadge');
  const label = document.getElementById('connectionText');
  if (!badge || !label) return;

  if (!connected) {
    label.innerHTML = '<span class="badge-unit">Offline</span>';
    return;
  }

  let count = Array.isArray(allPosts) ? allPosts.length : 30;
  if (typeof textOrCount === 'number') {
    count = textOrCount;
  } else if (typeof textOrCount === 'string') {
    const m = textOrCount.match(/\d+/);
    if (m) count = parseInt(m[0], 10);
  }

  label.innerHTML = `<strong>${count}</strong> <span class="badge-unit">stories</span>`;
  badge.setAttribute('title', `${count} Active Editorial Stories`);
}

function setupEventListeners() {
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const cat = pill.getAttribute('data-cat');
      selectCategory(cat);
    });
  });
}

function setupPullToRefresh() {
  const ptr = document.getElementById('ptrIndicator');
  const ptrIcon = document.getElementById('ptrIcon');
  const ptrLabel = document.getElementById('ptrLabel');
  if (!ptr) return;

  let startY = 0;
  let isPulling = false;
  let isRefreshing = false;
  const THRESHOLD = 60; // Distance in px to trigger refresh

  function getScrollTop() {
    return window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
  }

  function handleTouchStart(e) {
    if (isRefreshing) return;
    if (getScrollTop() <= 2) {
      startY = e.touches ? e.touches[0].clientY : e.clientY;
      isPulling = true;
    }
  }

  function handleTouchMove(e) {
    if (!isPulling || isRefreshing) return;
    const currentY = e.touches ? e.touches[0].clientY : e.clientY;
    const dy = currentY - startY;

    if (dy > 0 && getScrollTop() <= 2) {
      // Gentle dampening curve
      const pullDist = Math.min(80, dy * 0.45);
      if (pullDist > 8) {
        if (e.cancelable && e.preventDefault) e.preventDefault();
        ptr.style.height = `${pullDist}px`;
        ptr.classList.add('visible');

        if (pullDist >= THRESHOLD) {
          ptr.classList.add('ready');
          if (ptrLabel) ptrLabel.textContent = 'Release to refresh';
        } else {
          ptr.classList.remove('ready');
          if (ptrLabel) ptrLabel.textContent = 'Pull down to refresh';
        }
      }
    } else {
      ptr.style.height = '0px';
      ptr.classList.remove('visible', 'ready');
    }
  }

  async function handleTouchEnd() {
    if (!isPulling) return;
    isPulling = false;

    if (ptr.classList.contains('ready') && !isRefreshing) {
      isRefreshing = true;
      ptr.classList.remove('ready');
      ptr.classList.add('refreshing');
      ptr.style.height = '48px';
      if (ptrLabel) ptrLabel.textContent = 'Updating feed...';

      try {
        await syncFeed();
        if (ptrLabel) ptrLabel.textContent = 'Stories updated!';
      } catch (err) {
        console.error('Pull-to-refresh error:', err);
        if (ptrLabel) ptrLabel.textContent = 'Refresh complete';
      }

      setTimeout(() => {
        ptr.style.height = '0px';
        setTimeout(() => {
          ptr.classList.remove('refreshing', 'visible');
          if (ptrLabel) ptrLabel.textContent = 'Pull down to refresh';
          isRefreshing = false;
        }, 260);
      }, 500);
    } else {
      ptr.style.height = '0px';
      setTimeout(() => {
        ptr.classList.remove('visible', 'ready');
      }, 200);
    }
  }

  window.addEventListener('touchstart', handleTouchStart, { passive: true });
  window.addEventListener('touchmove', handleTouchMove, { passive: false });
  window.addEventListener('touchend', handleTouchEnd, { passive: true });
  window.addEventListener('touchcancel', handleTouchEnd, { passive: true });
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
      return;
    }
  }

  // Check login deep link / direct route or first-time visitor gateway
  const isExplicitLogin = params.get('auth') === 'login' ||
    params.get('login') === 'true' ||
    window.location.hash === '#login' ||
    (window.location.pathname && window.location.pathname.endsWith('/login'));

  let hasExplored = false;
  try {
    hasExplored = sessionStorage.getItem('slant_guest_explored') === 'true';
  } catch (e) {}

  if (isExplicitLogin || (!currentUser && !hasExplored && !postId)) {
    setTimeout(() => openAuthModal(), 200);
  }
}

// Listen for browser navigation / hashchange for #login
window.addEventListener('hashchange', () => {
  if (window.location.hash === '#login') {
    openAuthModal();
  } else {
    const modal = document.getElementById('authModal');
    if (modal && (modal.classList.contains('open') || modal.classList.contains('active'))) {
      closeAuthModal();
    }
  }
});

function renderFeed() {
  const container = document.getElementById('feedContainer');
  container.innerHTML = '';

  const filtered = allPosts.filter(post => {
    if (currentFilter === 'saved') {
      return savedPostIds.has(post.id);
    }

    if (currentFilter === 'my_stories') {
      if (myCreatedPostIds.has(post.id)) return true;
      if (!currentUser) return false;
      const userEmail = (currentUser.email || '').toLowerCase();
      const userHandle = (currentUser.user_metadata?.user_name || currentUser.user_metadata?.name || userEmail.split('@')[0] || '').toLowerCase().replace('@', '');
      const postAuthor = (post.creatorHandle || '').toLowerCase().replace('@', '');
      const postUserId = post.user_id || post.userId;
      return (postUserId && postUserId === currentUser.id) || (userHandle && postAuthor && postAuthor === userHandle) || (userEmail && (post.userEmail || '').toLowerCase() === userEmail);
    }

    if (currentFilter !== 'all') {
      const cat = (post.categoryBadge || '').toLowerCase();
      const type = (post.sourceType || '').toLowerCase();
      const isMySlant = post.isMySlant === true || type === 'my_slant' || type === 'inner_voice' || (post.publicationName || '').toLowerCase().includes('my slant') || (post.publicationName || '').toLowerCase().includes('inner voice');
      if (currentFilter === 'opinion' && !(isMySlant || cat.includes('opinion') || cat.includes('slant') || cat.includes('op-ed') || cat.includes('editorial') || cat.includes('perspective'))) return false;
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
    if (currentFilter === 'saved') {
      container.innerHTML = `
        <div style="text-align:center; padding: 56px 16px; color: var(--text-muted);">
          <div style="font-size:42px; margin-bottom:12px;">🔖</div>
          <div style="font-weight:700; font-size:17px; color:var(--text-primary); letter-spacing:-0.3px;">No saved stories yet</div>
          <div style="font-size:13px; margin-top:6px; max-width:320px; margin-left:auto; margin-right:auto; line-height:1.5;">
            Tap the bookmark icon on any visual editorial postcard to save it here for later reading.
          </div>
        </div>
      `;
      return;
    }

    if (currentFilter === 'my_stories') {
      container.innerHTML = `
        <div style="text-align:center; padding: 56px 16px; color: var(--text-muted);">
          <div style="font-size:42px; margin-bottom:12px;">✍️</div>
          <div style="font-weight:700; font-size:17px; color:var(--text-primary); letter-spacing:-0.3px;">No published stories yet</div>
          <div style="font-size:13px; margin-top:6px; max-width:320px; margin-left:auto; margin-right:auto; line-height:1.5;">
            Visual postcards you publish from the PostCard app or creator tools under this account will appear here.
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="text-align:center; padding: 48px 16px; color: var(--text-muted);">
        <div style="font-size:36px; margin-bottom:12px;">📰</div>
        <div style="font-weight:700; font-size:16px; color:var(--text-primary);">No stories found in this category</div>
        <div style="font-size:13px; margin-top:4px;">Snap a newspaper clipping or paste a news link in the PostCard app to publish here!</div>
      </div>
    `;
    return;
  }

  filtered.forEach((post, index) => {
    const card = createPostCardElement(post, index);
    container.appendChild(card);
    setupCarouselGestures(index);
  });

  // Pre-render top feed posters in background during idle time
  if (typeof queueBackgroundPosterPreRender === 'function') {
    queueBackgroundPosterPreRender(filtered);
  }
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
   CLEAN VIEW & HELPERS
   ============================================================ */

const cleanViewState = {};

function toggleCleanView(event, index) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  cleanViewState[index] = !cleanViewState[index];
  const isClean = cleanViewState[index];

  const carousel = document.getElementById(`carousel-${index}`);
  if (carousel) {
    carousel.classList.toggle('clean-view', isClean);
  }

  const btn = document.getElementById(`clean-btn-${index}`);
  if (btn) {
    btn.classList.toggle('active', isClean);
    btn.setAttribute('title', isClean ? 'Show text overlays' : 'Clean artwork (hide text)');
    btn.innerHTML = isClean
      ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
           <line x1="1" y1="1" x2="23" y2="23"></line>
         </svg>`
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
           <circle cx="12" cy="12" r="3"></circle>
         </svg>`;
  }
}

function cleanDomain(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function getStartingLines(fullText) {
  if (!fullText) return 'No summary available.';
  if (fullText.length <= 130) return fullText;
  const cutoff = fullText.indexOf(' ', 110);
  if (cutoff !== -1 && cutoff <= 145) {
    return fullText.substring(0, cutoff);
  }
  return fullText.substring(0, 120);
}

/* ============================================================
   SOURCE VERIFICATION & AUTHENTICATION CLASSIFICATION
   ============================================================ */

const REGISTERED_PRESS_KEYWORDS = [
  'indian express', 'new indian express', 'the hindu', 'times of india',
  'deccan herald', 'hindustan times', 'economic times', 'livemint', 'mint',
  'business standard', 'reuters', 'ap news', 'associated press', 'bbc',
  'the guardian', 'new york times', 'washington post', 'wall street journal',
  'wsj', 'financial times', 'bloomberg', 'the atlantic', 'economist',
  'al jazeera', 'bangalore mirror', 'sunday herald', 'the telegraph',
  'daily telegraph', 'tribune', 'statesman', 'frontline'
];

const REGISTERED_PRESS_DOMAINS = [
  'indianexpress.com', 'newindianexpress.com', 'thehindu.com', 'timesofindia.indiatimes.com',
  'deccanherald.com', 'hindustantimes.com', 'economictimes.indiatimes.com', 'livemint.com',
  'business-standard.com', 'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk',
  'theguardian.com', 'nytimes.com', 'washingtonpost.com', 'wsj.com', 'ft.com',
  'bloomberg.com', 'theatlantic.com', 'economist.com', 'aljazeera.com', 'bangaloremirror.indiatimes.com',
  'telegraphindia.com', 'tribuneindia.com'
];

function getCleanDomain(link) {
  if (!link) return '';
  try {
    const url = new URL(link);
    return url.hostname.replace(/^www\./, '');
  } catch (_) {
    return link.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  }
}

function getSourceTier(post) {
  // Tier 3: My Slant / Inner Voice / Personal Opinion
  if (post.sourceType === 'inner_voice' || post.sourceType === 'my_slant' || post.sourceType === 'opinion' || post.categoryBadge === 'OPINION' || post.categoryBadge === 'MY SLANT' || post.categoryBadge === 'INNER VOICE' || post.categoryBadge === 'PERSPECTIVE' || (post.publicationName && post.publicationName.toLowerCase() === 'my slant') || (post.publicationName && post.publicationName.toLowerCase() === 'inner voice')) {
    return 'tier3_opinion';
  }
  // Book Excerpt
  if (post.sourceType === 'book_excerpt') {
    return 'tier_book';
  }

  const pub = (post.publicationName || '').toLowerCase();
  const link = (post.digitalLink || '').toLowerCase();

  const isPressPub = REGISTERED_PRESS_KEYWORDS.some(k => pub.includes(k));
  let isPressDomain = false;
  if (link) {
    try {
      const url = new URL(link);
      const host = url.hostname.replace(/^www\./, '');
      isPressDomain = REGISTERED_PRESS_DOMAINS.some(d => host === d || host.endsWith('.' + d));
    } catch (_) {
      isPressDomain = REGISTERED_PRESS_DOMAINS.some(d => link.includes(d));
    }
  }

  // Accredited news organization
  if (isPressPub || isPressDomain) {
    return 'tier1_press';
  }

  // Web article, commentary, or independent link
  if (post.digitalLink || post.sourceType === 'digital_link' || (pub && pub !== 'Press Wire' && pub !== 'Physical Press')) {
    return 'tier2_web';
  }

  // Fallback: reader perspective
  return 'tier3_opinion';
}

window.handlePosterImageError = function(imgEl, category) {
  if (!imgEl) return;
  imgEl.style.opacity = '0';
  imgEl.style.display = 'none';
  imgEl.removeAttribute('alt');
};

/* ============================================================
   SLIDE BUILDERS (SLIDE 1, SLIDE 2, SLIDE 3)
   ============================================================ */

function buildSlide1Html(post, index) {
  const headline = escapeHtml(post.adaptedHeadline || post.originalHeadline || 'Untitled Story');
  const audience = escapeHtml(post.targetAudience || 'General');
  let catBadge = escapeHtml(post.categoryBadge || 'CURATED DIGEST');
  let pubName = escapeHtml(post.publicationName || 'Press Wire');
  const tier = getSourceTier(post);
  const cleanHost = getCleanDomain(post.digitalLink);
  const slantIcon = (post.slantIcon && post.slantIcon !== '💭') ? post.slantIcon : (post.slantTone === 'heart' ? '❤️' : '🧠');

  let sourceLabel = pubName;
  if (tier === 'tier2_web') {
    sourceLabel = cleanHost || 'Web Commentary';
  } else if (tier === 'tier3_opinion') {
    sourceLabel = 'Inner Voice';
    catBadge = `${slantIcon} OPINION`;
  } else if (tier === 'tier_book') {
    sourceLabel = post.bookTitle || 'Book Excerpt';
  }

  if (catBadge.includes('•') && tier !== 'tier3_opinion') {
    const parts = catBadge.split('•');
    catBadge = parts[0].trim();
    if (parts[1] && parts[1].trim()) {
      pubName = parts[1].trim();
    }
  }

  const fallbackCoverHtml = `
    <div class="slide-hook-fallback-bg" style="background: radial-gradient(circle at 50% 28%, #1e1b4b 0%, #0f172a 60%, #030712 100%);">
      <div style="position:absolute; inset:0; opacity:0.18; background-image: radial-gradient(#818cf8 1px, transparent 1px); background-size: 20px 20px;"></div>
    </div>
  `;

  let bgImgSrc = '';
  if (post.illustrationBase64) {
    bgImgSrc = post.illustrationBase64.startsWith('data:')
      ? post.illustrationBase64
      : `data:image/png;base64,${post.illustrationBase64}`;
  } else if (post.illustrationUrl) {
    bgImgSrc = post.illustrationUrl;
  }

  const imgHtml = bgImgSrc
    ? `<img class="slide-hook-bg" src="${escapeHtml(bgImgSrc)}" alt="" loading="eager" referrerpolicy="no-referrer" crossorigin="anonymous" onerror="handlePosterImageError(this, '${escapeHtml(post.categoryBadge || '')}')">`
    : `<img class="slide-hook-bg" src="" alt="" style="display:none;" loading="eager" referrerpolicy="no-referrer" crossorigin="anonymous" onerror="handlePosterImageError(this, '${escapeHtml(post.categoryBadge || '')}')">`;

  const bgHtml = `${fallbackCoverHtml}${imgHtml}`;

  // Tactile Ripped Newspaper Clipping Fragment (Actual News Excerpt / Headline)
  let rawNews = '';
  if (tier === 'tier3_opinion') {
    rawNews = (post.spark && post.spark.trim())
      ? post.spark.trim()
      : ((post.userContext && post.userContext.trim())
          ? post.userContext.trim()
          : ((post.originalHeadline && post.originalHeadline.trim() !== (post.adaptedHeadline || '').trim())
              ? post.originalHeadline.trim()
              : (post.hook || '')));
  } else {
    rawNews = (post.originalHeadline && post.originalHeadline.trim().length > 0 && post.originalHeadline.trim() !== (post.adaptedHeadline || '').trim())
      ? post.originalHeadline.trim()
      : ((post.hook && post.hook.trim().length > 0 && post.hook.trim() !== headline)
          ? post.hook.trim()
          : '');
  }
  if (rawNews) {
    rawNews = rawNews.replace(/^the spark\s*:\s*["']?/i, '').replace(/["']?$/i, '').trim();
  }

  let newsFragmentHtml = '';
  if (rawNews) {
    const words = rawNews.split(/\s+/);
    const formattedNews = words.length > 13 ? words.slice(0, 13).join(' ') + '...' : rawNews;
    
    let fragIcon = '🗞️';
    let fragTitle = `NEWS CLIPPING • ${pubName.toUpperCase()}`;
    if (tier === 'tier2_web') {
      fragIcon = '🌐';
      fragTitle = `WEB COMMENTARY • ${(cleanHost || 'ONLINE').toUpperCase()}`;
    } else if (tier === 'tier3_opinion') {
      fragIcon = slantIcon;
      fragTitle = `PERSPECTIVE • THE SPARK`;
    } else if (tier === 'tier_book') {
      fragIcon = '📖';
      fragTitle = `LITERARY EXCERPT • CLASSICAL TEXT`;
    }

    newsFragmentHtml = `
      <div class="tactile-news-fragment">
        <div class="tactile-news-inner">
          <div class="tactile-news-header">
            <span>${fragIcon}</span>
            <span>${fragTitle}</span>
          </div>
          <div class="tactile-news-headline">${escapeHtml(formattedNews)}</div>
        </div>
      </div>
    `;
  }

  const handle = escapeHtml(post.creatorHandle || '@curator');

  return `
    ${bgHtml}
    <div class="slide-hook-top-scrim"></div>
    <div class="slide-hook-bottom-scrim"></div>
    <div class="slide-hook-content">
      <div class="slide-hook-top" style="justify-content: space-between; width: 100%;">
        <!-- Top-Left (The Brand Identity): <logo> -->
        <div class="poster-brand-corner top-left">
          <img src="/logo.png" class="poster-corner-logo" alt="Slant">
          <span class="poster-corner-cat">${catBadge}</span>
        </div>
        <!-- Top-Right (The Creator): @<curatorname> -->
        <div class="poster-brand-corner top-right">
          <span class="poster-corner-creator">${handle}</span>
          <span class="poster-corner-slide-num">01 / 03</span>
        </div>
      </div>
      <div class="slide-hook-bottom">
        ${newsFragmentHtml}
        <h3 class="slide-hook-headline">${headline}</h3>
        <!-- Bottom-Left: slant.today | Bottom-Right: Your conviction in 3 frames -->
        <div class="poster-brand-footer">
          <span class="poster-footer-domain">slant.today</span>
          <span class="poster-footer-punchline">Your conviction in 3 frames</span>
        </div>
      </div>
    </div>
  `;
}

function buildSlide2Html(post, index) {
  const handle = escapeHtml(post.creatorHandle || '@curator');
  const initial = handle.replace('@', '').charAt(0).toUpperCase() || 'C';
  const pubName = escapeHtml(post.publicationName || 'Press Wire');
  const tier = getSourceTier(post);
  const slantIcon = (post.slantIcon && post.slantIcon !== '💭') ? post.slantIcon : (post.slantTone === 'heart' ? '❤️' : '🧠');

  let verdictBadgeLabel = `⚡ CURATOR'S TAKE • ${pubName}`;
  let nextSlideLabel = 'THE RECEIPTS &rarr;';

  if (tier === 'tier2_web') {
    verdictBadgeLabel = `⚡ CURATOR'S TAKE • WEB COMMENTARY`;
    nextSlideLabel = 'WEB SOURCE &rarr;';
  } else if (tier === 'tier3_opinion') {
    verdictBadgeLabel = `${slantIcon} FIRST-PERSON REFLECTION • INNER VOICE`;
    nextSlideLabel = 'INNER VOICE &rarr;';
  } else if (tier === 'tier_book') {
    verdictBadgeLabel = `📖 LITERARY REFLECTION`;
    nextSlideLabel = 'EXCERPT &rarr;';
  }

  // Combine into a single, punchy, elegant paragraph (no redundant WHY IT MATTERS box)
  let rawOpinion = (post.creatorOpinion && post.creatorOpinion.trim())
    ? post.creatorOpinion.trim()
    : ((post.whyItMatters && post.whyItMatters.trim())
        ? post.whyItMatters.trim()
        : (post.hook || 'Strategic structural shift in motion.'));
  while (rawOpinion.endsWith('.') || rawOpinion.endsWith('…')) {
    if (rawOpinion.endsWith('...')) rawOpinion = rawOpinion.slice(0, -3).trim();
    else if (rawOpinion.endsWith('…')) rawOpinion = rawOpinion.slice(0, -1).trim();
    else break;
  }
  if (!rawOpinion.endsWith('.') && !rawOpinion.endsWith('!') && !rawOpinion.endsWith('?')) {
    rawOpinion += '.';
  }
  const opinion = escapeHtml(rawOpinion);

  const slideTitle = post.keyTakeaways && post.keyTakeaways.length > 0 && post.keyTakeaways[0].split(' ').length <= 12
    ? escapeHtml(post.keyTakeaways[0].toUpperCase())
    : (tier === 'tier3_opinion' ? (post.slantTone === 'heart' ? 'PERSONAL REFLECTION' : 'CORE CONVICTION') : "THE CRITICAL PERSPECTIVE");

  const fallbackCritiqueCoverHtml = `
    <div class="slide-hook-fallback-bg" style="background: radial-gradient(circle at 50% 28%, #1e1b4b 0%, #0f172a 60%, #030712 100%);">
      <div style="position:absolute; inset:0; opacity:0.18; background-image: radial-gradient(#818cf8 1px, transparent 1px); background-size: 20px 20px;"></div>
    </div>
  `;

  let bgCritiqueImgSrc = '';
  if (post.illustrationBase64) {
    bgCritiqueImgSrc = post.illustrationBase64.startsWith('data:')
      ? post.illustrationBase64
      : `data:image/png;base64,${post.illustrationBase64}`;
  } else if (post.illustrationUrl) {
    bgCritiqueImgSrc = post.illustrationUrl;
  }

  const critiqueImgHtml = bgCritiqueImgSrc
    ? `<img class="slide-hook-bg" src="${escapeHtml(bgCritiqueImgSrc)}" alt="" loading="eager" referrerpolicy="no-referrer" crossorigin="anonymous" onerror="handlePosterImageError(this, '${escapeHtml(post.categoryBadge || '')}')">`
    : `<img class="slide-hook-bg" src="" alt="" style="display:none;" loading="eager" referrerpolicy="no-referrer" crossorigin="anonymous" onerror="handlePosterImageError(this, '${escapeHtml(post.categoryBadge || '')}')">`;

  const bgHtml = `${fallbackCritiqueCoverHtml}${critiqueImgHtml}`;

  return `
    ${bgHtml}
    <div class="slide-hook-top-scrim"></div>
    <div class="slide-hook-bottom-scrim" style="height: 42%; background: linear-gradient(to bottom, transparent 0%, rgba(7,11,18,0.52) 22%, rgba(7,11,18,0.95) 100%);"></div>
    <div class="slide-hook-content" style="justify-content: space-between;">
      <div class="slide-hook-top" style="justify-content: space-between; width: 100%;">
        <!-- Top-Left (The Brand Identity): <logo> -->
        <div class="poster-brand-corner top-left">
          <img src="/logo.png" class="poster-corner-logo" alt="Slant">
          <span class="poster-corner-cat" style="color: #F59E0B;">${verdictBadgeLabel}</span>
        </div>
        <!-- Top-Right (The Creator): @<curatorname> -->
        <div class="poster-brand-corner top-right">
          <span class="poster-corner-creator">${handle}</span>
          <span class="poster-corner-slide-num">02 / 03</span>
        </div>
      </div>
      <div class="slide-hook-bottom" style="gap:6px; z-index:2;">
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="width:6px; height:6px; border-radius:50%; background:#F59E0B; display:inline-block;"></span>
          <span style="font-size:10px; font-weight:800; color:#F59E0B; letter-spacing:0.8px;">${slideTitle}</span>
        </div>
        <p class="critique-opinion-text" style="font-size:13.5px; font-weight:700; color:#F8FAFC; line-height:1.42; margin:0;">${opinion}</p>
        <!-- Bottom-Left: slant.today | Bottom-Right: Your conviction in 3 frames -->
        <div class="poster-brand-footer">
          <span class="poster-footer-domain">slant.today</span>
          <span class="poster-footer-punchline">Your conviction in 3 frames</span>
        </div>
      </div>
    </div>
  `;
}

function buildSlide3Html(post, index) {
  const tier = getSourceTier(post);
  const cleanHost = getCleanDomain(post.digitalLink);
  const handle = escapeHtml(post.creatorHandle || '@curator');
  const slantIcon = post.slantIcon || (post.slantTone === 'heart' ? '❤️' : '💭');

  let pubName = post.publicationName || 'THE FINANCIAL CHRONICLE';
  if (pubName.includes('•')) {
    const parts = pubName.split('•');
    pubName = parts[parts.length - 1].trim();
  }
  pubName = pubName.replace(/^(NEWSPAPER|ARTICLE|BOOK|MAGAZINE|PRESS):\s*/i, '').trim();
  if (!pubName) pubName = 'THE NEW INDIAN EXPRESS';
  pubName = escapeHtml(pubName.toUpperCase());

  const headline = escapeHtml(
    (tier === 'tier3_opinion'
      ? (post.adaptedHeadline || post.originalHeadline)
      : (post.originalHeadline || post.adaptedHeadline)) || 'Original News Source'
  );
  const quote = escapeHtml(post.receiptHighlightQuote || post.pullQuote || 'Primary reporting confirmed that recorded structural indicators diverged sharply from initial forecasts across core operations.');

  // Clean any residual label prefixes like "The spark:", "Curator stance:"
  const cleanExcerpt = (txt) => {
    if (!txt) return '';
    return String(txt)
      .replace(/^(the spark|curator stance|paragraph \d+)\s*:\s*["']?/i, '')
      .replace(/["']?$/i, '')
      .trim();
  };

  // Extract 3 section excerpt statements
  let excerpts = post.resolvedArticleExcerpts || post.articleExcerpts || [];
  if (!Array.isArray(excerpts) || excerpts.length === 0) {
    if (post.summary) {
      const extra = post.summary.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 20);
      excerpts = [...extra];
    }
  }
  const p1 = escapeHtml(cleanExcerpt((excerpts.length > 0 && excerpts[0]) ? excerpts[0] : quote));
  const p2 = escapeHtml(cleanExcerpt((excerpts.length > 1 && excerpts[1]) ? excerpts[1] : ((post.receiptHighlightQuote && post.receiptHighlightQuote !== p1) ? post.receiptHighlightQuote : quote)));
  const p3 = escapeHtml(cleanExcerpt((excerpts.length > 2 && excerpts[2]) ? excerpts[2] : (post.summary && post.summary !== p1 && post.summary !== p2 ? post.summary : 'Corroborating records confirmed key indicators aligned with official administrative filings.')));

  // Tier-specific broadsheet configurations:
  let stampHtml = '';
  let mastheadTitle = pubName;
  let rulesCenter = 'ACTUAL NEWSPAPER EXCERPTS';
  let rulesLeft = 'VOL. CLXXIV • NO. 48,210';
  let bylineLeft = 'BY SPECIAL CORRESPONDENT & WIRE BUREAU';
  let bylineTag = '<span class="receipts-archive-tag">VERIFIED ARCHIVE</span>';
  let highlightIcon = '✏️';
  let highlightTitle = 'KEY SECTION EXCERPT';
  let folioSource = 'AUTHENTIC ARTICLE EXCERPTS • PRIMARY SOURCE';
  let folioAuthor = `ARCHIVED BY ${handle}`;

  if (tier === 'tier1_press') {
    stampHtml = `
      <div class="stamp-verified">
        <div>★ VERIFIED ★</div>
        <div>PRESS ARCHIVE</div>
      </div>
    `;
    mastheadTitle = pubName;
    rulesCenter = 'ACTUAL NEWSPAPER EXCERPTS';
    rulesLeft = 'VOL. CLXXIV • NO. 48,210';
    bylineLeft = 'BY SPECIAL CORRESPONDENT & WIRE BUREAU';
    bylineTag = '<span class="receipts-archive-tag">VERIFIED ARCHIVE</span>';
    highlightTitle = 'KEY SECTION EXCERPT';
    folioSource = 'AUTHENTIC ARTICLE EXCERPTS • PRIMARY SOURCE';
    folioAuthor = `ARCHIVED BY ${handle}`;
  } else if (tier === 'tier2_web') {
    stampHtml = `
      <div class="stamp-web-citation">
        <div>🌐 WEB</div>
        <div>COMMENTARY</div>
      </div>
    `;
    mastheadTitle = cleanHost ? `${escapeHtml(cleanHost.toUpperCase())} • WEB COMMENTARY` : 'WEB COMMENTARY';
    rulesCenter = 'WEB COMMENTARY & CITATION';
    rulesLeft = 'ONLINE CITATION';
    bylineLeft = `SOURCED FROM ${escapeHtml(cleanHost || 'ONLINE PUBLICATION')}`;
    bylineTag = '<span class="receipts-web-tag">WEB COMMENTARY</span>';
    highlightTitle = 'KEY ARTICLE EXCERPT';
    folioSource = 'DIGITAL COMMENTARY CITATION • EXTERNAL LINK';
    folioAuthor = `CURATED BY ${handle}`;
  } else if (tier === 'tier3_opinion') {
    stampHtml = `
      <div class="stamp-opinion">
        <div>${slantIcon} PERSONAL TAKE</div>
        <div>INNER VOICE</div>
      </div>
    `;
    mastheadTitle = `INNER VOICE`;
    rulesCenter = post.slantTone === 'heart' ? 'OUT OF HEART • PERSONAL ESSAY' : 'OUT OF MIND • PERSONAL ESSAY';
    rulesLeft = 'FIRST-PERSON REFLECTION';
    bylineLeft = `AUTHORED BY ${handle}`;
    bylineTag = '<span class="receipts-opinion-tag">PERSONAL PERSPECTIVE</span>';
    highlightIcon = slantIcon;
    highlightTitle = 'THE CORE CONVICTION';
    folioSource = 'FIRST-PERSON REFLECTION';
    folioAuthor = `BY ${handle}`;
  } else if (tier === 'tier_book') {
    stampHtml = `
      <div class="stamp-book">
        <div>📖 LITERARY</div>
        <div>EXCERPT</div>
      </div>
    `;
    mastheadTitle = 'CLASSIC LITERATURE ARCHIVE';
    rulesCenter = escapeHtml((post.bookTitle || 'LITERARY EXCERPT').toUpperCase());
    rulesLeft = 'CANONICAL FOLIO';
    bylineLeft = `WRITTEN BY ${escapeHtml((post.bookAuthor || 'MARCUS AURELIUS').toUpperCase())}`;
    bylineTag = '<span class="receipts-book-tag">BOOK EXCERPT</span>';
    highlightIcon = '📖';
    highlightTitle = 'CORE PASSAGE';
    folioSource = 'LITERARY EXCERPT • CLASSICAL ARCHIVE';
    folioAuthor = `EXCERPTED BY ${handle}`;
  }

  // Evidentiary metric badge
  let metricHtml = '';
  if (post.keyMetric && String(post.keyMetric).trim()) {
    metricHtml = `
      <div class="receipt-metric-row">
        <span class="receipt-metric-badge">KEY METRIC</span>
        <span class="receipt-metric-val">${escapeHtml(String(post.keyMetric).trim())}</span>
      </div>
    `;
  }

  // Evidentiary takeaways / structured findings card
  let takeawaysHtml = '';
  const takeaways = Array.isArray(post.keyTakeaways) ? post.keyTakeaways.filter(Boolean) : [];
  if (takeaways.length > 0) {
    const topTakeaways = takeaways.slice(0, 2);
    takeawaysHtml = `
      <div class="receipt-takeaways-card">
        <div class="takeaways-header">
          <span class="takeaways-icon">⚖️</span>
          <span class="takeaways-title">${tier === 'tier3_opinion' ? 'CURATOR CONVICTIONS' : 'EVIDENTIARY TAKEAWAYS'}</span>
        </div>
        <div class="takeaways-list">
          ${topTakeaways.map(t => {
            const str = String(t).trim();
            const colonIdx = str.indexOf(':');
            if (colonIdx > 0 && colonIdx < 35) {
              const prefix = escapeHtml(str.slice(0, colonIdx).trim());
              const rest = escapeHtml(str.slice(colonIdx + 1).trim());
              return `<div class="takeaway-item"><span class="takeaway-dot">▪</span><span class="takeaway-text"><strong>${prefix}:</strong> ${rest}</span></div>`;
            }
            return `<div class="takeaway-item"><span class="takeaway-dot">▪</span><span class="takeaway-text">${escapeHtml(str)}</span></div>`;
          }).join('')}
        </div>
      </div>
    `;
  } else if (post.whyItMatters && String(post.whyItMatters).trim()) {
    takeawaysHtml = `
      <div class="receipt-takeaways-card">
        <div class="takeaways-header">
          <span class="takeaways-icon">🔍</span>
          <span class="takeaways-title">WHY THIS MATTERS</span>
        </div>
        <p class="takeaway-why-text">${escapeHtml(String(post.whyItMatters).trim())}</p>
      </div>
    `;
  }

  return `
    ${stampHtml}

    <!-- 4-Corner Branding Top Row: Top-Left Logo + Brand, Top-Right Creator + Slide -->
    <div class="receipt-brand-corner-bar">
      <div class="receipt-corner-brand">
        <img src="/logo.png" class="receipt-corner-logo" alt="Slant">
        <span class="receipt-brand-text">SLANT</span>
      </div>
      <div class="receipt-corner-creator">
        <span class="receipt-creator-name">${handle}</span>
        <span class="receipt-corner-slide-num">03 / 03</span>
      </div>
    </div>

    <!-- 1. Classic Broadsheet Masthead Header -->
    <div class="receipt-header">
      <div class="receipt-masthead-thick"></div>
      <div class="receipt-masthead-thin"></div>
      <div class="receipt-pub-title">${mastheadTitle}</div>
      <div class="receipt-rules">
        <span>${rulesLeft}</span>
        <span class="receipt-rules-center">${rulesCenter}</span>
        <span>VERIFIED ARCHIVE</span>
      </div>
      <div class="receipt-masthead-bottom"></div>
    </div>
    
    <!-- 2. Original Article Headline & Wire Byline -->
    <div class="receipts-headline-box">
      <h4 class="receipt-headline">${headline}</h4>
      <div class="receipts-byline">
        <span>${bylineLeft}</span>
        ${bylineTag}
      </div>
      <div class="receipts-hairline"></div>
    </div>

    <!-- 3. Continuous Actual Newspaper Excerpts & Evidentiary Findings -->
    <div class="receipt-paragraphs">
      ${metricHtml}
      <p class="receipt-p1">${p1}</p>
      <div class="receipt-highlight">
        <div class="highlighter-label">
          <span>${highlightIcon}</span> ${highlightTitle}
        </div>
        <div class="highlighter-text">“${p2}”</div>
      </div>
      ${(p3 && p3 !== p1 && p3 !== p2) ? `<p class="receipt-p3">${p3}</p>` : ''}
      ${takeawaysHtml}
    </div>

    <!-- 4. Broadsheet Archival Bottom Folio (Bottom-Left: slant.today | Bottom-Right: Your conviction in 3 frames) -->
    <div class="receipt-footer">
      <div class="receipt-folio-rule"></div>
      <div class="receipt-folio-text" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
        <span class="receipt-folio-source" style="font-weight: 800; letter-spacing: 0.8px; color: #0F172A;">slant.today</span>
        <span class="receipt-folio-author" style="font-style: italic; letter-spacing: 0.4px; color: #475569;">Your conviction in 3 frames</span>
      </div>
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
  let pubName = post.publicationName || 'Press Wire';
  if (pubName.includes('•')) {
    const parts = pubName.split('•');
    pubName = parts[parts.length - 1].trim();
  }
  pubName = pubName.replace(/^(NEWSPAPER|ARTICLE|BOOK|MAGAZINE|PRESS):\s*/i, '').trim();

  const tier = getSourceTier(post);
  const digitalUrl = post.digitalLink || '';
  const cleanHost = getCleanDomain(digitalUrl);
  const slantIcon = (post.slantIcon && post.slantIcon !== '💭') ? post.slantIcon : (post.slantTone === 'heart' ? '❤️' : '🧠');

  let catBadge = post.categoryBadge || 'DISCOVERY';
  if (tier === 'tier3_opinion') {
    catBadge = `${slantIcon} OPINION`;
  }
  const audience = post.targetAudience || 'General';
  const headline = post.adaptedHeadline || post.originalHeadline || 'Untitled Story';
  const hook = post.hook || '';
  const summary = post.summary || '';
  const metric = post.keyMetric || '';
  const quote = post.pullQuote || '';
  const isBook = post.sourceType === 'book_excerpt';
  const isCarousel = true;
  const isClean = !!cleanViewState[index];
  const isSaved = savedPostIds.has(post.id);
  const hasPaperCut = post.sourceType === 'photo' 
    || !!post.paperCutImage 
    || !!post.hasPaperCut
    || (post.originalPhotoUrl && (post.originalPhotoUrl.includes('clipping') || post.sourceType === 'photo'))
    || (post.originalPhotoBase64 && post.originalPhotoBase64.length > 50)
    || (post.originalPhotoPath && !post.originalPhotoPath.startsWith('http') && post.originalPhotoPath !== post.digitalLink)
    || (tier === 'tier1_press' && (post.originalPhotoUrl || post.originalPhotoBase64 || post.originalPhotoPath));

  // Determine Tab 3 label and icon based on tier
  let tab3Icon = '📰';
  let tab3Label = 'Receipt';
  let tab3Title = 'Slide 3: Newspaper Receipt';

  let sourceBadgeIcon = '📰';
  let sourceBadgeText = pubName;

  if (tier === 'tier1_press') {
    tab3Icon = '📰';
    tab3Label = 'Receipt';
    tab3Title = 'Slide 3: Verified Newspaper Receipt';
    sourceBadgeIcon = '🏛️';
    sourceBadgeText = pubName;
  } else if (tier === 'tier2_web') {
    tab3Icon = '🌐';
    tab3Label = 'Web Source';
    tab3Title = 'Slide 3: Web Commentary Source';
    sourceBadgeIcon = '🌐';
    sourceBadgeText = cleanHost || pubName || 'Web Commentary';
  } else if (tier === 'tier3_opinion') {
    tab3Icon = slantIcon;
    tab3Label = 'Inner Voice';
    tab3Title = 'Slide 3: Inner Voice (Personal Perspective)';
    sourceBadgeIcon = slantIcon;
    sourceBadgeText = 'Personal Perspective';
  } else if (tier === 'tier_book') {
    tab3Icon = '📖';
    tab3Label = 'Excerpt';
    tab3Title = 'Slide 3: Classical Book Excerpt';
    sourceBadgeIcon = '📖';
    sourceBadgeText = post.bookTitle || pubName || 'Classical Literature';
  }

  // 3-Poster Carousel Trio Frame with Interactive Tabs & Arrows (Universal 3-Slide Social Poster Series)
  const visualSectionHtml = `
    <div class="carousel-slide-tabs" id="tabs-${index}">
      <button class="carousel-tab-btn active" onclick="goToSlide(event, '${index}', 0)" title="Slide 1: Visual Hook">
        <span class="tab-icon">🎨</span>
        <span class="tab-text">Hook</span>
      </button>
      <button class="carousel-tab-btn" onclick="goToSlide(event, '${index}', 1)" title="Slide 2: Curator Take">
        <span class="tab-icon">⚖️</span>
        <span class="tab-text">Take</span>
      </button>
      <button class="carousel-tab-btn" onclick="goToSlide(event, '${index}', 2)" title="${escapeHtml(tab3Title)}">
        <span class="tab-icon">${tab3Icon}</span>
        <span class="tab-text">${escapeHtml(tab3Label)}</span>
      </button>
    </div>

    <div class="carousel-view ${isClean ? 'clean-view' : ''}" id="carousel-${index}" data-post-index="${index}" data-current-slide="0">
      <div class="carousel-track" id="track-${index}">
        <div class="carousel-slide slide-hook" onclick="openDetailModal('${index}')">
          ${buildSlide1Html(post, index)}
        </div>
        <div class="carousel-slide slide-critique" onclick="openDetailModal('${index}')">
          ${buildSlide2Html(post, index)}
        </div>
        <div class="carousel-slide slide-receipt" onclick="openDetailModal('${index}')">
          ${buildSlide3Html(post, index)}
        </div>
      </div>

      <!-- Navigation Buttons -->
      <button class="carousel-nav-btn prev-btn" onclick="changeSlide(event, '${index}', -1)" title="Previous Slide">&#x2039;</button>
      <button class="carousel-nav-btn next-btn" onclick="changeSlide(event, '${index}', 1)" title="Next Slide">&#x203A;</button>

      <!-- Bottom Dot Indicators -->
      <div class="carousel-dots" id="dots-${index}">
        <span class="carousel-dot active" onclick="goToSlide(event, '${index}', 0)"></span>
        <span class="carousel-dot" onclick="goToSlide(event, '${index}', 1)"></span>
        <span class="carousel-dot" onclick="goToSlide(event, '${index}', 2)"></span>
      </div>
    </div>
  `;

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
          <div class="pub-source-badge ${hasPaperCut ? 'source-badge-clickable' : ''}" ${hasPaperCut ? `onclick="openPaperCutModal('${index}')" title="Click to view original newspaper clipping"` : ''}>
            <span>${hasPaperCut ? '📰' : sourceBadgeIcon}</span>
            <span>${escapeHtml(sourceBadgeText)}</span>
            ${hasPaperCut ? `<span class="source-view-pill">View Paper ↗</span>` : ''}
          </div>
        </div>
      </div>
      <span class="category-tag">
        ${escapeHtml(catBadge || 'Visual Story')}
      </span>
    </div>

    ${visualSectionHtml}

    <div class="action-bar">
      <div class="action-group-left">
        <!-- Heart / Like button -->
        <button class="action-btn" onclick="toggleLike(this)" title="Like Poster">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
          </svg>
          <span class="like-count">64</span>
        </button>

        <!-- Share 3 Slide Posters (Native Web Share API with 3 image files) -->
        <button class="icon-action-btn" onclick="sharePosters('${index}')" title="Share 3 Slide Posters">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="18" cy="5" r="3"></circle>
            <circle cx="6" cy="12" r="3"></circle>
            <circle cx="18" cy="19" r="3"></circle>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
          </svg>
        </button>

        <!-- Clean Art Toggle (Show/Hide text overlays directly on feed) -->
        <button class="icon-action-btn clean-view-btn ${isClean ? 'active' : ''}" id="clean-btn-${index}" onclick="toggleCleanView(event, '${index}')" title="${isClean ? 'Show text overlays' : 'Clean artwork (hide text)'}">
          ${isClean
            ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                 <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                 <line x1="1" y1="1" x2="23" y2="23"></line>
               </svg>`
            : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                 <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                 <circle cx="12" cy="12" r="3"></circle>
               </svg>`}
        </button>

        <!-- Native Instagram-style pagination dots for carousel posts -->
        <div class="carousel-dots-inline" id="dots-bar-${index}">
          <span class="carousel-dot active" onclick="goToSlide(event, '${index}', 0)"></span>
          <span class="carousel-dot" onclick="goToSlide(event, '${index}', 1)"></span>
          <span class="carousel-dot" onclick="goToSlide(event, '${index}', 2)"></span>
        </div>
      </div>

      <!-- Minimalist Action Icons: Book Cover, World Web Link, Newspaper Paper Cut -->
      <div class="action-group-right">
        ${isBook ? `
          <button class="icon-action-btn" onclick="openDetailModal('${index}')" title="View Book Cover & Source">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
          </button>
        ` : ''}

        ${digitalUrl ? `
          <a href="${escapeHtml(digitalUrl)}" target="_blank" rel="noopener noreferrer" class="icon-action-btn" title="Open Web Article (${escapeHtml(cleanDomain(digitalUrl))})">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#0284C7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
          </a>
        ` : ''}

        ${hasPaperCut ? `
          <button class="icon-action-btn papercut-action-btn" onclick="openPaperCutModal('${index}')" title="View Paper Cut (${escapeHtml(pubName)})">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"></path>
              <path d="M18 14h-8"></path>
              <path d="M15 18h-5"></path>
              <path d="M10 6h8v4h-8V6Z"></path>
            </svg>
          </button>
        ` : ''}

        <!-- Bookmark / Save Story -->
        <button class="icon-action-btn bookmark-btn ${isSaved ? 'is-saved' : ''}" id="bookmark-btn-${post.id}" onclick="toggleBookmark(event, '${post.id}')" title="${isSaved ? 'Remove from Saved' : 'Save Story'}">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="${isSaved ? '#F59E0B' : 'none'}" stroke="${isSaved ? '#F59E0B' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
          </svg>
        </button>
      </div>
    </div>

    <!-- Instagram-style Caption Area: Creator Handle + Summary Starting Lines + '... more' -->
    <div class="post-content">
      <div class="post-summary-snippet" onclick="openDetailModal('${index}')" style="cursor:pointer;">
        <span class="post-creator-handle"><strong>${escapeHtml(handle)}</strong></span>
        <span class="post-caption-text">${escapeHtml(getStartingLines(summary))}</span>
        <button class="read-more-btn" onclick="event.stopPropagation(); openDetailModal('${index}')">... more</button>
      </div>
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
  const dotsBar = document.getElementById(`dots-bar-${postIndex}`);
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

  if (dotsBar) {
    dotsBar.querySelectorAll('.carousel-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === slideIndex);
    });
  }

  // Keep top creator modal preview tabs synchronized with the current slide
  if (postIndex === 'preview') {
    currentPreviewSlide = slideIndex;
    document.querySelectorAll('.preview-tab').forEach((tab, i) => {
      tab.classList.toggle('active', i === slideIndex);
    });
  } else if (typeof triggerPostPreRender === 'function') {
    triggerPostPreRender(postIndex);
  }
}

function setupCarouselGestures(postIndex) {
  const carousel = document.getElementById(`carousel-${postIndex}`);
  if (!carousel || carousel.dataset.gesturesAttached) return;
  carousel.dataset.gesturesAttached = 'true';

  let startX = 0;
  let startY = 0;
  let isSwiping = false;

  // Touch Swipe for Mobile
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
    if (Math.abs(diffX) > 35 && Math.abs(diffX) > Math.abs(diffY)) {
      if (diffX < 0) {
        changeSlide(null, postIndex, 1);
      } else {
        changeSlide(null, postIndex, -1);
      }
    }
  }, { passive: true });

  // Mouse Drag Swipe for Desktop / Laptop
  let isMouseDown = false;
  carousel.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.target.closest('button') || e.target.closest('.carousel-tab-btn') || e.target.closest('.read-more-btn')) return;
    isMouseDown = true;
    startX = e.clientX;
    startY = e.clientY;
  });

  const handleMouseEnd = (e) => {
    if (!isMouseDown) return;
    isMouseDown = false;
    const diffX = e.clientX - startX;
    const diffY = e.clientY - startY;
    if (Math.abs(diffX) > 35 && Math.abs(diffX) > Math.abs(diffY)) {
      if (diffX < 0) {
        changeSlide(null, postIndex, 1);
      } else {
        changeSlide(null, postIndex, -1);
      }
    }
  };

  carousel.addEventListener('mouseup', handleMouseEnd);
  carousel.addEventListener('mouseleave', () => { isMouseDown = false; });
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
  if (index === 'preview') return;
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

  const paperCutBtn = document.getElementById('modalPaperCutBtn');
  if (paperCutBtn) {
    const hasPaper = post.sourceType === 'photo' 
      || !!post.paperCutImage 
      || !!post.hasPaperCut
      || (post.originalPhotoUrl && (post.originalPhotoUrl.includes('clipping') || post.sourceType === 'photo'))
      || (post.originalPhotoBase64 && post.originalPhotoBase64.length > 50)
      || (post.originalPhotoPath && !post.originalPhotoPath.startsWith('http') && post.originalPhotoPath !== post.digitalLink)
      || (post.id && ['692d99fc-d140-4d1c-9275-3263a7c187b7', '79cb4873-7c1b-402c-aebb-71fcebbefa5d', '83940fae-4ad7-43f6-9329-91cd17752f78', '9b55d7ea-8a78-4ef1-a068-cec226e200fd'].includes(post.id));
    paperCutBtn.style.display = hasPaper ? 'inline-flex' : 'none';
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

/* ============================================================
   3-POSTER EXPORT & NATIVE 3-IMAGE SOCIAL SHARING
   Strict Requirement: Share set of 3 slide posters, no extra text details.
   - Background pre-rendering keeps user gesture active for instant native share (<5ms)
   - Parallel generation via Promise.all across 3 offscreen sandboxes
   - Dedicated modal with fresh gesture if gesture window timed out or desktop
   ============================================================ */

const posterFilesCache = new Map();
const posterRenderPromises = new Map();
let preRenderQueue = [];
let isPreRendering = false;
let currentSharePost = null;
let currentShareFiles = null;

async function capturePostSlidesAsFiles(post, index) {
  if (typeof html2canvas === 'undefined') {
    throw new Error('html2canvas library is not loaded');
  }

  // Exact 4:5 social ratio (440x550) matching the web app feed card dimensions
  const exportWidth = 440;
  const exportHeight = 550;

  const slideConfigs = [
    { num: 1, class: 'slide-hook', bg: '#0B0F17', html: buildSlide1Html(post, index) },
    { num: 2, class: 'slide-critique', bg: '#0B0F17', html: buildSlide2Html(post, index) },
    { num: 3, class: 'slide-receipt', bg: '#F7F5EE', html: buildSlide3Html(post, index) }
  ];

  const rawHeadline = post.adaptedHeadline || post.originalHeadline || post.hook || 'slant';
  const slug = rawHeadline.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'slant-story';

  // Render all 3 slides in PARALLEL with dedicated offscreen sandboxes
  const renderSlide = async (cfg) => {
    const container = document.createElement('div');
    container.className = 'poster-export-sandbox';
    container.style.cssText = `
      position: fixed !important;
      left: -9999px !important;
      top: 0 !important;
      width: ${exportWidth}px !important;
      height: ${exportHeight}px !important;
      overflow: hidden !important;
      z-index: -9999 !important;
      background: ${cfg.bg} !important;
      padding: 0 !important;
      margin: 0 !important;
      border: none !important;
    `;
    document.body.appendChild(container);

    try {
      container.innerHTML = `
        <div class="carousel-slide ${cfg.class}" style="width: ${exportWidth}px !important; height: ${exportHeight}px !important; position: relative !important; left: 0 !important; top: 0 !important; transform: none !important; flex: none !important; display: flex !important;">
          ${cfg.html}
        </div>
      `;

      // Wait for images inside to load
      const imgs = Array.from(container.querySelectorAll('img'));
      await Promise.all(imgs.map(img => {
        if (!img.src) return Promise.resolve();
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise(res => {
          img.onload = res;
          img.onerror = res;
          setTimeout(res, 600);
        });
      }));

      // CRITICAL: html2canvas does not support CSS object-fit: cover, which causes human faces
      // and backgrounds to be vertically stretched/squashed! We calculate the exact un-stretched
      // dimensions and offsets based on natural aspect ratio to guarantee 100% natural proportions.
      const bgImgs = container.querySelectorAll('.slide-hook-bg');
      bgImgs.forEach(img => {
        const natW = img.naturalWidth || img.width;
        const natH = img.naturalHeight || img.height;
        if (natW > 0 && natH > 0) {
          const rImg = natW / natH;
          const rBox = exportWidth / exportHeight; // 440 / 550 = 0.8
          if (rImg >= rBox) {
            // Image is wider than 4:5 (e.g. 1:1 square or 16:9 landscape)
            const rw = Math.round(exportHeight * rImg);
            const rh = exportHeight;
            const left = Math.round((exportWidth - rw) / 2);
            img.style.setProperty('position', 'absolute', 'important');
            img.style.setProperty('width', rw + 'px', 'important');
            img.style.setProperty('height', rh + 'px', 'important');
            img.style.setProperty('left', left + 'px', 'important');
            img.style.setProperty('top', '0px', 'important');
            img.style.setProperty('max-width', 'none', 'important');
            img.style.setProperty('max-height', 'none', 'important');
            img.style.setProperty('object-fit', 'fill', 'important');
          } else {
            // Image is taller than 4:5 (e.g. 9:16 portrait)
            const rw = exportWidth;
            const rh = Math.round(exportWidth / rImg);
            const top = Math.round((exportHeight - rh) / 2);
            img.style.setProperty('position', 'absolute', 'important');
            img.style.setProperty('width', rw + 'px', 'important');
            img.style.setProperty('height', rh + 'px', 'important');
            img.style.setProperty('left', '0px', 'important');
            img.style.setProperty('top', top + 'px', 'important');
            img.style.setProperty('max-width', 'none', 'important');
            img.style.setProperty('max-height', 'none', 'important');
            img.style.setProperty('object-fit', 'fill', 'important');
          }
        }
      });

      // Micro-delay for fonts and styles to paint
      await new Promise(r => setTimeout(r, 60));

      let canvas;
      try {
        canvas = await html2canvas(container, {
          scale: 2.4545, // 440 * 2.4545 = 1080, 550 * 2.4545 = 1350 (Ultra HD 1080x1350)
          useCORS: true,
          allowTaint: true,
          backgroundColor: cfg.bg,
          logging: false,
          width: exportWidth,
          height: exportHeight
        });
      } catch (renderErr) {
        console.warn('html2canvas primary render failed, retrying without taint:', renderErr);
        canvas = await html2canvas(container, {
          scale: 2.4545,
          useCORS: true,
          allowTaint: false,
          backgroundColor: cfg.bg,
          logging: false,
          width: exportWidth,
          height: exportHeight
        });
      }

      let blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.95));
      if (!blob) {
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
          const parts = dataUrl.split(',');
          const mime = parts[0].match(/:(.*?);/)[1];
          const bstr = atob(parts[1]);
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          blob = new Blob([u8arr], { type: mime });
        } catch (blobErr) {
          console.warn('Canvas to blob fallback failed:', blobErr);
        }
      }

      if (blob) {
        const fileName = `${slug}-slide-0${cfg.num}.jpg`;
        return new File([blob], fileName, { type: 'image/jpeg' });
      }
      return null;
    } finally {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    }
  };

  const files = (await Promise.all(slideConfigs.map(renderSlide))).filter(Boolean);
  return files;
}

async function getPostSlidesFiles(post, index) {
  const cacheKey = post.id || `idx-${index}`;
  if (posterFilesCache.has(cacheKey)) {
    return posterFilesCache.get(cacheKey);
  }
  if (posterRenderPromises.has(cacheKey)) {
    return await posterRenderPromises.get(cacheKey);
  }

  const renderPromise = (async () => {
    try {
      const files = await capturePostSlidesAsFiles(post, index);
      if (files && files.length > 0) {
        // Enforce cache limit to prevent memory bloat on mobile browsers
        if (posterFilesCache.size >= 25) {
          const oldestKey = posterFilesCache.keys().next().value;
          posterFilesCache.delete(oldestKey);
        }
        posterFilesCache.set(cacheKey, files);
      }
      return files;
    } finally {
      posterRenderPromises.delete(cacheKey);
    }
  })();

  posterRenderPromises.set(cacheKey, renderPromise);
  return await renderPromise;
}

function queueBackgroundPosterPreRender(posts) {
  if (!posts || posts.length === 0) return;
  // Queue top 4 posts on initial feed load
  const toQueue = posts.slice(0, 4);
  toQueue.forEach((post, i) => {
    const key = post.id || `idx-${i}`;
    if (!posterFilesCache.has(key) && !posterRenderPromises.has(key) && !preRenderQueue.some(item => item.key === key)) {
      preRenderQueue.push({ post, index: i, key });
    }
  });
  scheduleNextPreRender();
}

function triggerPostPreRender(postIndex) {
  const post = (typeof postIndex === 'number' || (typeof postIndex === 'string' && /^\d+$/.test(postIndex)))
    ? allPosts[parseInt(postIndex, 10)]
    : allPosts.find(p => p && p.id === postIndex);
  if (!post) return;
  const key = post.id || `idx-${postIndex}`;
  if (posterFilesCache.has(key) || posterRenderPromises.has(key)) return;
  preRenderQueue.unshift({ post, index: postIndex, key });
  scheduleNextPreRender();
}

function scheduleNextPreRender() {
  if (isPreRendering || preRenderQueue.length === 0) return;

  const runNext = async () => {
    if (preRenderQueue.length === 0) {
      isPreRendering = false;
      return;
    }
    isPreRendering = true;
    const item = preRenderQueue.shift();
    try {
      if (!posterFilesCache.has(item.key)) {
        await getPostSlidesFiles(item.post, item.index);
      }
    } catch (e) {
      console.warn('Background poster pre-render idle task error:', e);
    } finally {
      setTimeout(() => {
        isPreRendering = false;
        scheduleNextPreRender();
      }, 400);
    }
  };

  if (window.requestIdleCallback) {
    requestIdleCallback(runNext, { timeout: 3000 });
  } else {
    setTimeout(runNext, 600);
  }
}

async function sharePosters(indexOrId) {
  const post = (typeof indexOrId === 'number' || (typeof indexOrId === 'string' && /^\d+$/.test(indexOrId)))
    ? allPosts[parseInt(indexOrId, 10)]
    : allPosts.find(p => p && p.id === indexOrId);

  if (!post) {
    showTemporaryToast('Post not found to share');
    return;
  }

  const cacheKey = post.id || `idx-${indexOrId}`;

  // INSTANT-FIRE: If already pre-rendered, navigator.share fires synchronously with 0ms delay!
  // This preserves the active user gesture on iOS Safari & Android Chrome 100% of the time.
  if (posterFilesCache.has(cacheKey)) {
    const cachedFiles = posterFilesCache.get(cacheKey);
    if (navigator.canShare && navigator.canShare({ files: cachedFiles })) {
      try {
        await navigator.share({
          files: cachedFiles
        });
        showTemporaryToast('✨ 3 Slide Posters shared!');
        return;
      } catch (err) {
        if (err.name === 'AbortError') {
          return; // User dismissed share sheet
        }
        console.warn('Instant native share failed, falling back to share modal:', err);
      }
    }
    openSharePostersModal(post, cachedFiles);
    return;
  }

  // ON-DEMAND PARALLEL GENERATION: If not cached yet, generate now (<800ms)
  showTemporaryToast('📸 Preparing 3 slide posters...');
  try {
    const files = await getPostSlidesFiles(post, indexOrId);
    if (!files || files.length === 0) {
      throw new Error('Failed to generate poster images');
    }

    // Try direct native share
    if (navigator.canShare && navigator.canShare({ files })) {
      try {
        await navigator.share({ files });
        showTemporaryToast('✨ 3 Slide Posters shared!');
        return;
      } catch (err) {
        if (err.name === 'AbortError') {
          return;
        }
        console.warn('Direct share after render failed (gesture token expired or OS blocked), opening share modal:', err);
      }
    }

    // Dedicated modal gives the user a guaranteed fresh gesture to share or save
    openSharePostersModal(post, files);
  } catch (err) {
    console.error('Error generating posters:', err);
    showTemporaryToast('Could not prepare posters. Please try again.');
  }
}

function openSharePostersModal(post, files) {
  currentSharePost = post;
  currentShareFiles = files;

  const modal = document.getElementById('posterShareModal');
  const thumbsRow = document.getElementById('sharePostersThumbsRow');
  const nativeBtn = document.getElementById('modalNativeShareBtn');
  const saveBtn = document.getElementById('modalSavePhotosBtn');

  if (!modal) return;

  if (thumbsRow && files && files.length > 0) {
    thumbsRow.innerHTML = '';
    files.forEach((file, i) => {
      const url = URL.createObjectURL(file);
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative; width:92px; height:115px; border-radius:8px; overflow:hidden; border:1px solid rgba(255,255,255,0.15); background:#111; box-shadow:0 4px 12px rgba(0,0,0,0.4);';
      wrap.innerHTML = `
        <img src="${url}" style="width:100%; height:100%; object-fit:cover; display:block;" alt="Slide ${i+1}">
        <span style="position:absolute; bottom:4px; right:4px; font-size:9px; font-weight:800; background:rgba(0,0,0,0.75); color:#fff; padding:1px 5px; border-radius:4px; backdrop-filter:blur(2px);">0${i+1}/03</span>
      `;
      thumbsRow.appendChild(wrap);
    });
  }

  // Setup Share button (User clicking this button generates a guaranteed fresh user gesture!)
  if (nativeBtn) {
    if (navigator.canShare && navigator.canShare({ files })) {
      nativeBtn.style.display = 'flex';
      nativeBtn.innerHTML = '<span>📤</span> <span>Share to Instagram & Apps</span>';
      nativeBtn.onclick = async () => {
        try {
          await navigator.share({ files });
          closeSharePostersModal();
          showTemporaryToast('✨ 3 Slide Posters shared!');
        } catch (err) {
          if (err.name !== 'AbortError') {
            downloadShareFiles(files);
          }
        }
      };
    } else {
      // If desktop browser doesn't support file sharing, label it as Download Posters for Instagram
      nativeBtn.style.display = 'flex';
      nativeBtn.innerHTML = '<span>📥</span> <span>Download 3 Posters for Instagram</span>';
      nativeBtn.onclick = () => {
        downloadShareFiles(files);
        closeSharePostersModal();
      };
    }
  }

  // Setup Save / Download button
  if (saveBtn) {
    saveBtn.onclick = () => {
      downloadShareFiles(files);
      closeSharePostersModal();
    };
  }

  modal.classList.add('open');
  modal.classList.add('active');
}

function closeSharePostersModal() {
  const modal = document.getElementById('posterShareModal');
  if (modal) {
    modal.classList.remove('open');
    modal.classList.remove('active');
  }
}

function downloadShareFiles(files) {
  if (!files || files.length === 0) return;
  showTemporaryToast('📥 Saving 3 slide posters...');
  files.forEach((file, idx) => {
    setTimeout(() => {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, idx * 250);
  });
}

// Global exposure for inline onclick handlers
window.sharePosters = sharePosters;
window.openSharePostersModal = openSharePostersModal;
window.closeSharePostersModal = closeSharePostersModal;
window.downloadShareFiles = downloadShareFiles;

function openPaperCutModal(indexOrId) {
  const post = (typeof indexOrId === 'number' || (typeof indexOrId === 'string' && /^\d+$/.test(indexOrId)))
    ? allPosts[parseInt(indexOrId, 10)]
    : allPosts.find(p => p && p.id === indexOrId);
  if (!post) return;

  const imgEl = document.getElementById('paperCutImg');
  const imgWrap = document.getElementById('paperCutImgWrap');
  const archivalCard = document.getElementById('paperCutArchivalCard');

  let imgSrc = '';
  if (post.originalPhotoBase64 && post.originalPhotoBase64.length > 50) {
    imgSrc = post.originalPhotoBase64.startsWith('data:') 
      ? post.originalPhotoBase64 
      : 'data:image/jpeg;base64,' + post.originalPhotoBase64;
  } else if (post.originalPhotoUrl) {
    imgSrc = post.originalPhotoUrl.startsWith('/') || post.originalPhotoUrl.startsWith('http')
      ? post.originalPhotoUrl
      : `/${post.originalPhotoUrl}`;
  } else if (post.paperCutImage) {
    imgSrc = post.paperCutImage;
  } else if (post.originalPhotoPath && (post.originalPhotoPath.startsWith('http') || post.originalPhotoPath.startsWith('data:'))) {
    imgSrc = post.originalPhotoPath;
  } else if (post.id) {
    imgSrc = `/clippings/${post.id}.jpg`;
  }

  function showArchivalFallback() {
    if (imgWrap) imgWrap.style.display = 'none';
    if (imgEl) {
      imgEl.src = '';
      imgEl.style.display = 'none';
    }
    if (archivalCard) {
      const pub = post.publicationName || 'Print Daily Broadsheet';
      const headline = post.originalHeadline || post.adaptedHeadline || 'Original Newsprint Article';
      const quote = post.receiptHighlightQuote || (post.resolvedArticleExcerpts && post.resolvedArticleExcerpts[0]) || post.summary || '';
      
      archivalCard.innerHTML = `
        <div class="paper-cut-archival-inner">
          <div class="paper-cut-header-row">
            <span class="paper-cut-pub-title">${escapeHtml(pub.toUpperCase())}</span>
            <span class="paper-cut-verified-stamp">VERIFIED PHYSICAL ARCHIVE</span>
          </div>
          <div class="paper-cut-rule"></div>
          <h2 class="paper-cut-headline">${escapeHtml(headline)}</h2>
          <div class="paper-cut-rule subtle"></div>
          ${quote ? `
            <div class="paper-cut-quote-box">
              <span class="paper-cut-quote-label">SCANNED CLIPPING EXCERPT:</span>
              <p class="paper-cut-quote-text">"${escapeHtml(quote)}"</p>
            </div>
          ` : ''}
          <div class="paper-cut-footer-meta">
            <span>📷 High-resolution camera scan captured on mobile device via PostCard Scanner.</span>
          </div>
        </div>
      `;
      archivalCard.style.display = 'block';
    }
  }

  if (imgEl) {
    imgEl.onload = () => {
      if (imgWrap) imgWrap.style.display = 'flex';
      if (imgEl) imgEl.style.display = 'block';
      if (archivalCard) archivalCard.style.display = 'none';
    };
    imgEl.onerror = () => {
      // If primary path failed, try /clippings/${post.id}.jpg if not already tried
      if (post.id && imgSrc && !imgSrc.includes(`/clippings/${post.id}.jpg`)) {
        imgSrc = `/clippings/${post.id}.jpg`;
        imgEl.src = imgSrc;
      } else {
        showArchivalFallback();
      }
    };
  }

  if (imgSrc) {
    if (archivalCard) archivalCard.style.display = 'none';
    if (imgWrap) imgWrap.style.display = 'flex';
    if (imgEl) {
      imgEl.style.display = 'block';
      imgEl.src = imgSrc;
    }
  } else {
    showArchivalFallback();
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

async function loadRemainingPosts() {
  try {
    // Ultra-lean fetch: fetch up to 20 posts, no while loop, never blow egress
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/posts?select=id,created_at,data&order=created_at.desc&limit=20`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    if (!resp.ok) return;
    const rows = await resp.json();
    if (!Array.isArray(rows) || rows.length === 0) return;

    const newPosts = rows.map(r => {
      const p = r.data || r;
      p.id = p.id || r.id;
      p.createdAt = p.createdAt || r.created_at || new Date().toISOString();
      return p;
    }).filter(p => p && !p.deleted && !p.isDeleted && (p.adaptedHeadline || p.originalHeadline || p.summary));

    const hasNew = mergeAndSortPosts(newPosts);
    if (hasNew) {
      updateBadge(true, `Live Feed (${allPosts.length} posts)`);
      renderFeed();
    }
  } catch (err) {
    console.warn('Progressive loading background error:', err);
  }
}

function setupRealtimeSubscription() {
  if (supabaseClient && typeof supabaseClient.channel === 'function') {
    try {
      supabaseClient
        .channel('public:posts')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, payload => {
          if (payload && payload.new) {
            const p = payload.new.data || payload.new;
            p.id = p.id || payload.new.id;
            p.createdAt = p.createdAt || payload.new.created_at || new Date().toISOString();
            if (!p.deleted && !p.isDeleted && (p.adaptedHeadline || p.originalHeadline || p.summary)) {
              mergeAndSortPosts([p]);
              updateBadge(true, `Live Feed (${allPosts.length} posts)`);
              renderFeed();
            }
          }
        })
        .subscribe();
    } catch (e) {
      console.warn('Realtime subscription error:', e);
    }
  }

  // Refresh feed gently when user returns to tab (only if at least 15 seconds have passed)
  let lastRefreshTime = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastRefreshTime > 15000) {
      lastRefreshTime = Date.now();
      syncLiveCloudPosts(false);
    }
  });
}

/* ============================================================
   CREATOR STUDIO: ADAPTIVE 3-POSTER GENERATOR (WEB & MOBILE)
   ============================================================ */

let creatorSelectedSource = 'digital_link'; // 'digital_link' | 'photo' | 'inner_voice'
let creatorSelectedImageBase64 = null;
let creatorSelectedImageMimeType = 'image/jpeg';
let creatorSlantTone = 'mind'; // 'mind' | 'heart'
let creatorAudience = 'General Public';
let currentSynthesizedPost = null;
let currentPreviewSlide = 0;
let creatorRefineCoreTake = true;

function toggleRefineCoreTake(val) {
  if (typeof val === 'boolean') {
    creatorRefineCoreTake = val;
  } else {
    creatorRefineCoreTake = !creatorRefineCoreTake;
  }

  const card = document.getElementById('slantRefineToggleCard');
  const sw = document.getElementById('refineCoreTakeSwitch');
  const icon = document.getElementById('slantRefineIcon');
  const title = document.getElementById('slantRefineTitle');
  const badge = document.getElementById('slantRefineBadge');
  const sub = document.getElementById('slantRefineSubtitle');

  if (sw) sw.checked = creatorRefineCoreTake;
  if (card) card.classList.toggle('refined', creatorRefineCoreTake);

  if (creatorRefineCoreTake) {
    if (icon) icon.textContent = '✨';
    if (title) title.textContent = 'Refine with AI';
    if (badge) {
      badge.textContent = 'Refined';
      badge.className = 'slant-refine-badge';
    }
    if (sub) sub.textContent = 'AI polishes and sharpens your raw thought into a punchy poster quote.';
  } else {
    if (icon) icon.textContent = '❝';
    if (title) title.textContent = 'Use Take As-Is';
    if (badge) {
      badge.textContent = 'Verbatim';
      badge.className = 'slant-refine-badge verbatim';
    }
    if (sub) sub.textContent = 'Keeps your exact typed words verbatim on the poster slides without rephrasing.';
  }
}

let creatorVocabularyStyle = 'punchy'; // 'punchy' | 'conversational' | 'analytical'

function setVocabularyStyle(style) {
  creatorVocabularyStyle = style;
  const badge = document.getElementById('slantVocabBadge');
  const sub = document.getElementById('slantVocabSubtitle');

  document.querySelectorAll('.slant-vocab-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.vocab === style);
  });

  if (style === 'conversational') {
    if (badge) badge.textContent = '💬 Casual';
    if (sub) sub.textContent = 'Natural everyday English. Clean, grounded, and universally easy to read.';
  } else if (style === 'analytical') {
    if (badge) badge.textContent = '🏛 Analytical';
    if (sub) sub.textContent = 'Formal editorial broadsheet vocabulary for deep policy or structural critique.';
  } else {
    // punchy
    if (badge) badge.textContent = '⚡ Punchy';
    if (sub) sub.textContent = 'Emotional, vivid & clear. Strong verbs, zero academic jargon. Reads effortlessly.';
  }
}

function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints && navigator.maxTouchPoints > 1 && window.innerWidth <= 820);
}

function openCreatorModal() {
  const modal = document.getElementById('creatorModal');
  if (!modal) return;

  const isMobile = isMobileDevice();
  const mobileCameraPrompt = document.getElementById('mobileCameraPrompt');
  const dropzoneText = document.getElementById('dropzoneText');
  const anchorPhotoTitle = document.getElementById('anchorPhotoTitle');
  const anchorPhotoSub = document.getElementById('anchorPhotoSub');
  const photoTriggerSub = document.getElementById('photoTriggerSub');
  const anchorPhotoIcon = document.getElementById('anchorPhotoIcon');

  // Device-adaptive adjustments:
  // Mobile gets camera snap prompt & camera icon
  // Laptop/desktop gets upload / drag-and-drop file zone
  if (isMobile) {
    if (anchorPhotoTitle) anchorPhotoTitle.textContent = 'Magazine';
    if (anchorPhotoSub) anchorPhotoSub.textContent = 'Camera / Print';
    if (photoTriggerSub) photoTriggerSub.textContent = 'Camera or Gallery';
    if (anchorPhotoIcon) anchorPhotoIcon.textContent = '📸';
    if (mobileCameraPrompt) mobileCameraPrompt.style.display = 'block';
    if (dropzoneText) dropzoneText.innerHTML = 'Or choose an image from your library';
  } else {
    if (anchorPhotoTitle) anchorPhotoTitle.textContent = 'Magazine / Photo';
    if (anchorPhotoSub) anchorPhotoSub.textContent = 'Print clipping';
    if (photoTriggerSub) photoTriggerSub.textContent = 'Upload / Drop Image';
    if (anchorPhotoIcon) anchorPhotoIcon.textContent = '📰';
    if (mobileCameraPrompt) mobileCameraPrompt.style.display = 'none';
    if (dropzoneText) dropzoneText.innerHTML = 'Drag and drop clipping photo or screenshot, or <span class="dropzone-link">browse</span>';
  }

  // Sync anchor selection
  setAnchorMode(creatorSelectedSource || 'digital_link');

  // Reset to Step 1
  backToStep1();

  // Show modal
  modal.classList.add('open');
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  // Attach drag-drop & url scrape listeners
  setupCreatorDropzone();
  setupCreatorUrlListener();
}

function closeCreatorModal() {
  const modal = document.getElementById('creatorModal');
  if (modal) {
    modal.classList.remove('open');
    modal.classList.remove('active');
  }
  document.body.style.overflow = '';
}

function handleCreatorOverlayClick(e) {
  if (e && e.target && e.target.id === 'creatorModal') {
    closeCreatorModal();
  }
}

function setAnchorMode(mode) {
  creatorSelectedSource = mode;

  // 1. Highlight selected anchor card
  document.querySelectorAll('.anchor-card').forEach(card => {
    card.classList.toggle('active', card.getAttribute('data-mode') === mode);
  });

  // 2. Toggle trigger sections
  const secLink = document.getElementById('triggerWebSection');
  const secPhoto = document.getElementById('triggerPhotoSection');
  const secVoice = document.getElementById('triggerVoiceSection');

  if (secLink) secLink.style.display = mode === 'digital_link' ? 'flex' : 'none';
  if (secPhoto) secPhoto.style.display = mode === 'photo' ? 'flex' : 'none';
  if (secVoice) secVoice.style.display = mode === 'inner_voice' ? 'flex' : 'none';

  // 3. Update Hero Card prompts matching Flutter mobile app exactly:
  const label = document.getElementById('slantTakeLabel');
  const badge = document.getElementById('slantTakeBadge');
  const sub = document.getElementById('slantTakeSubtitle');
  const input = document.getElementById('creatorSlantTakeInput');
  const heroIcon = document.getElementById('slantHeroIcon');
  const heroBox = document.getElementById('slantIconBox');

  if (mode === 'inner_voice') {
    if (label) label.textContent = 'What is your Slant or Perspective?';
    if (badge) {
      badge.textContent = 'Required';
      badge.className = 'creator-tag-badge badge-required';
    }
    if (sub) sub.textContent = 'Express your conviction or reflection freely. AI transforms this into your lead take.';
    if (input) input.placeholder = 'What perspective demands to be shared? e.g. The real risk of AI isn’t superintelligence taking over, it’s that we surrender our curiosity and critical judgment to automated convenience...';
    if (heroIcon) heroIcon.textContent = '💭';
    if (heroBox) heroBox.style.color = '#8B5CF6';
  } else if (mode === 'photo') {
    if (label) label.textContent = 'Your Slant / Take';
    if (badge) {
      badge.textContent = 'Optional';
      badge.className = 'creator-tag-badge';
    }
    if (sub) sub.textContent = 'A few sentences framing your angle, critique, or why this clipping matters.';
    if (input) input.placeholder = 'e.g. Beyond the raw numbers, this shifts the balance of power between legacy media and digital creators...';
    if (heroIcon) heroIcon.textContent = '💡';
    if (heroBox) heroBox.style.color = '#0D9488';
  } else {
    // digital_link
    if (label) label.textContent = 'Your Slant / Take';
    if (badge) {
      badge.textContent = 'Optional';
      badge.className = 'creator-tag-badge';
    }
    if (sub) sub.textContent = 'A few sentences framing your angle, critique, or why this article matters.';
    if (input) input.placeholder = 'e.g. The headline misses the real structural disruption happening behind the scenes...';
    if (heroIcon) heroIcon.textContent = '🌐';
    if (heroBox) heroBox.style.color = '#0284C7';
  }
}

// Backward compatibility alias
function selectCreatorSource(sourceType) {
  setAnchorMode(sourceType);
}

// Client-side downscaling and compression via HTML5 canvas
function compressImage(file, maxDimension, quality, callback) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      let width = img.width;
      let height = img.height;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const compressedData = canvas.toDataURL('image/jpeg', quality);
      callback(compressedData, 'image/jpeg');
    };
    img.onerror = function() {
      alert('Could not process this image file. Please try another image.');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function handleImageSelection(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  // Compress down to max 1200px / 82% quality (< 100 KB)
  compressImage(file, 1200, 0.82, function(base64Data, mimeType) {
    creatorSelectedImageBase64 = base64Data;
    creatorSelectedImageMimeType = mimeType;
    if (!creatorReferenceImageBase64) {
      creatorReferenceImageBase64 = base64Data;
      creatorReferenceImageMimeType = mimeType;
      creatorReferenceImageSourceLabel = 'Print Clipping Photo';
    }

    const thumb = document.getElementById('creatorImageThumb');
    const emptyBox = document.getElementById('dropzoneEmpty');
    const previewBox = document.getElementById('dropzonePreview');

    if (thumb) thumb.src = base64Data;
    if (emptyBox) emptyBox.style.display = 'none';
    if (previewBox) previewBox.style.display = 'flex';
  });
}

function removeSelectedImage(event) {
  if (event) event.stopPropagation();
  creatorSelectedImageBase64 = null;

  const fileInput = document.getElementById('creatorFileInput');
  const camInput = document.getElementById('creatorCameraInput');
  const emptyBox = document.getElementById('dropzoneEmpty');
  const previewBox = document.getElementById('dropzonePreview');
  const thumb = document.getElementById('creatorImageThumb');

  if (fileInput) fileInput.value = '';
  if (camInput) camInput.value = '';
  if (thumb) thumb.src = '';
  if (emptyBox) emptyBox.style.display = 'block';
  if (previewBox) previewBox.style.display = 'none';
}

let dropzoneInitialized = false;
function setupCreatorDropzone() {
  if (dropzoneInitialized) return;
  const dropzone = document.getElementById('creatorDropzone');
  if (!dropzone) return;

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });

  dropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageSelection({ target: { files: e.dataTransfer.files } });
    }
  });

  dropzoneInitialized = true;
}

function backToStep1() {
  const s1 = document.getElementById('creatorStep1');
  const s2 = document.getElementById('creatorStep2');
  const s3 = document.getElementById('creatorStep3');
  const d1 = document.getElementById('stepDot1');
  const d2 = document.getElementById('stepDot2');
  const d3 = document.getElementById('stepDot3');

  if (s1) s1.style.display = 'block';
  if (s2) s2.style.display = 'none';
  if (s3) s3.style.display = 'none';

  if (d1) { d1.className = 'creator-step-dot active'; }
  if (d2) { d2.className = 'creator-step-dot'; }
  if (d3) { d3.className = 'creator-step-dot'; }
}

// Visual Cues Studio State
let creatorCuePills = [];
let creatorSelectedCueIndices = new Set();
let creatorCharacterRepresentation = 'realistic'; // 'realistic' | 'likeness' | 'exact' | 'silhouette'
let creatorLastSuggestedContextKey = '';
let draggedCueIndex = null;
let creatorActiveInspectedCueIndex = 0;

// Geographic & Cultural Context State
let creatorCountryContext = null;

function detectGeographicContext(url = '', headline = '', body = '', userAngle = '') {
  const combined = `${url} ${headline} ${body} ${userAngle}`.toLowerCase();

  // 1. India Detection
  if (
    url.includes('.in') || url.includes('thehindu') || url.includes('timesofindia') ||
    url.includes('ndtv') || url.includes('hindustantimes') || url.includes('indianexpress') ||
    url.includes('livemint') || url.includes('scroll.in') || url.includes('thewire.in') ||
    combined.includes('delhi') || combined.includes('mumbai') || combined.includes('bengaluru') ||
    combined.includes('india') || combined.includes('supreme court of india') || combined.includes('lok sabha') ||
    combined.includes('rajya sabha') || combined.includes('rupee') || combined.includes('ncr') ||
    combined.includes('hyderabad') || combined.includes('chennai') || combined.includes('kolkata')
  ) {
    return {
      code: 'IN',
      name: 'India',
      flag: '🇮🇳',
      source: 'Auto-detected from Article & Source',
      desc: 'Grounds visual cues, architecture, and lighting in authentic Indian institutional and environmental motifs.'
    };
  }

  // 2. UK Detection
  if (
    url.includes('.uk') || url.includes('bbc.co.uk') || url.includes('theguardian.com') ||
    url.includes('telegraph.co.uk') || url.includes('ft.com') ||
    combined.includes('london') || combined.includes('westminster') || combined.includes('downing street') ||
    combined.includes('parliament') || combined.includes('pound sterling') || combined.includes('united kingdom') ||
    combined.includes('britain')
  ) {
    return {
      code: 'GB',
      name: 'United Kingdom',
      flag: '🇬🇧',
      source: 'Auto-detected from Article & Source',
      desc: 'Grounds visual cues in authentic British institutional architecture, Westminster stone, and London atmosphere.'
    };
  }

  // 3. Japan Detection
  if (
    url.includes('.jp') || url.includes('japantimes') || url.includes('nhk.or.jp') || url.includes('nikkei') ||
    combined.includes('japan') || combined.includes('tokyo') || combined.includes('yen') || combined.includes('osaka')
  ) {
    return {
      code: 'JP',
      name: 'Japan',
      flag: '🇯🇵',
      source: 'Auto-detected from Article & Source',
      desc: 'Grounds visual cues in Japanese architecture, Tokyo urban scale, and cultural minimalism.'
    };
  }

  // 4. US Detection
  if (
    combined.includes('white house') || combined.includes('capitol hill') || combined.includes('wall street') ||
    combined.includes('pentagon') || combined.includes('biden') || combined.includes('trump') ||
    combined.includes('california') || combined.includes('washington dc')
  ) {
    return {
      code: 'US',
      name: 'United States',
      flag: '🇺🇸',
      source: 'Auto-detected from Article & Source',
      desc: 'Grounds visual cues in American federal architecture, metropolitan high-rises, and institutional settings.'
    };
  }

  // 5. Fall back to user's device timezone / locale
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz.includes('Kolkata') || tz.includes('Calcutta') || tz.includes('India')) {
      return {
        code: 'IN',
        name: 'India',
        flag: '🇮🇳',
        source: 'User Country (Locale)',
        desc: 'Grounds visual cues, architecture, and lighting in authentic Indian institutional and environmental motifs.'
      };
    }
    if (tz.includes('New_York') || tz.includes('Los_Angeles') || tz.includes('Chicago') || tz.includes('Denver')) {
      return {
        code: 'US',
        name: 'United States',
        flag: '🇺🇸',
        source: 'User Country (Locale)',
        desc: 'Grounds visual cues in American federal architecture, metropolitan high-rises, and institutional settings.'
      };
    }
    if (tz.includes('London')) {
      return {
        code: 'GB',
        name: 'United Kingdom',
        flag: '🇬🇧',
        source: 'User Country (Locale)',
        desc: 'Grounds visual cues in authentic British institutional architecture, Westminster stone, and London atmosphere.'
      };
    }
    if (tz.includes('Tokyo')) {
      return {
        code: 'JP',
        name: 'Japan',
        flag: '🇯🇵',
        source: 'User Country (Locale)',
        desc: 'Grounds visual cues in Japanese architecture, Tokyo urban scale, and cultural minimalism.'
      };
    }
  } catch (_) {}

  return {
    code: 'GLOBAL',
    name: 'Global',
    flag: '🌐',
    source: 'Universal Setting',
    desc: 'Uses universal, cross-cultural metaphorical archetypes and neutral editorial lighting.'
  };
}

function updateCountryContextUI() {
  if (!creatorCountryContext) {
    creatorCountryContext = detectGeographicContext();
  }
  const flagEl = document.getElementById('countryContextFlag');
  const nameEl = document.getElementById('countryContextName');
  const badgeEl = document.getElementById('countryContextBadge');
  const descEl = document.getElementById('countryContextDesc');
  const selectEl = document.getElementById('countryContextSelect');

  if (flagEl) flagEl.textContent = creatorCountryContext.flag || '🌐';
  if (nameEl) nameEl.textContent = creatorCountryContext.name || 'Global';
  if (badgeEl) badgeEl.textContent = creatorCountryContext.source || 'Auto-detected';
  if (descEl) descEl.textContent = creatorCountryContext.desc || '';
  if (selectEl) selectEl.value = creatorCountryContext.code || 'GLOBAL';
}

function changeCountryContext(code) {
  const options = {
    'IN': {
      code: 'IN',
      name: 'India',
      flag: '🇮🇳',
      source: 'User Selected',
      desc: 'Grounds visual cues, architecture, and lighting in authentic Indian institutional and environmental motifs.'
    },
    'US': {
      code: 'US',
      name: 'United States',
      flag: '🇺🇸',
      source: 'User Selected',
      desc: 'Grounds visual cues in American federal architecture, metropolitan high-rises, and institutional settings.'
    },
    'GB': {
      code: 'GB',
      name: 'United Kingdom',
      flag: '🇬🇧',
      source: 'User Selected',
      desc: 'Grounds visual cues in authentic British institutional architecture, Westminster stone, and London atmosphere.'
    },
    'JP': {
      code: 'JP',
      name: 'Japan',
      flag: '🇯🇵',
      source: 'User Selected',
      desc: 'Grounds visual cues in Japanese architecture, Tokyo urban scale, and cultural minimalism.'
    },
    'EU': {
      code: 'EU',
      name: 'Europe',
      flag: '🇪🇺',
      source: 'User Selected',
      desc: 'Grounds visual cues in European continental architecture, civic plazas, and historic institutions.'
    },
    'GLOBAL': {
      code: 'GLOBAL',
      name: 'Global',
      flag: '🌐',
      source: 'Universal',
      desc: 'Uses universal, cross-cultural metaphorical archetypes and neutral editorial lighting.'
    }
  };

  creatorCountryContext = options[code] || options['GLOBAL'];
  updateCountryContextUI();
  triggerCueSuggest();
}

// Reference Photo Likeness State
let creatorReferenceImageBase64 = null;
let creatorReferenceImageMimeType = 'image/jpeg';
let creatorReferenceImageSourceLabel = null;

// Live Scraped Article State
let currentScrapedArticle = null;
let scrapeDebounceTimer = null;
let isScrapingUrl = false;

function extractHeadlineFromUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    let clean = url.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    const parsed = new URL(clean);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (!segments.length) {
      return parsed.hostname.replace(/^www\./, '');
    }

    let bestSlug = '';
    for (const seg of segments) {
      const c = seg.replace(/\.(html|ece|htm|php|cms|amp|asp)$/i, '');
      if (c.length > bestSlug.length && (c.includes('-') || c.includes('_'))) {
        bestSlug = c;
      }
    }
    if (!bestSlug && segments.length) bestSlug = segments[segments.length - 1];

    const words = bestSlug
      .split(/[-_]/)
      .filter(w => w.length > 2 && !/^\d+$/.test(w))
      .map(w => w.charAt(0).toUpperCase() + w.slice(1));

    return words.length ? words.join(' ') : parsed.hostname.replace(/^www\./, '');
  } catch (_) {
    return '';
  }
}

function setupCreatorUrlListener() {
  const urlInput = document.getElementById('creatorUrlInput');
  if (!urlInput || urlInput.dataset.listenerAttached) return;
  urlInput.dataset.listenerAttached = 'true';

  urlInput.addEventListener('input', (e) => {
    clearTimeout(scrapeDebounceTimer);
    const val = e.target.value.trim();
    if (val.startsWith('http://') || val.startsWith('https://') || val.includes('.')) {
      scrapeDebounceTimer = setTimeout(() => {
        handleUrlInput(val);
      }, 500);
    } else {
      const indicator = document.getElementById('urlScrapeIndicator');
      if (indicator) indicator.style.display = 'none';
      currentScrapedArticle = null;
    }
  });

  urlInput.addEventListener('paste', () => {
    setTimeout(() => {
      const val = urlInput.value.trim();
      if (val) handleUrlInput(val);
    }, 100);
  });
}

async function handleUrlInput(val) {
  const clean = (val || '').trim();
  const indicator = document.getElementById('urlScrapeIndicator');
  if (!clean || (!clean.startsWith('http://') && !clean.startsWith('https://') && !clean.includes('.'))) {
    if (indicator) indicator.style.display = 'none';
    currentScrapedArticle = null;
    return;
  }

  isScrapingUrl = true;
  if (indicator) {
    indicator.className = 'url-scrape-indicator loading';
    indicator.innerHTML = '<span class="scrape-icon">⏳</span><span class="scrape-text">Fetching & verifying article source...</span>';
    indicator.style.display = 'flex';
  }

  try {
    const resp = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: clean })
    });

    if (!resp.ok) throw new Error('Scrape request failed');
    const data = await resp.json();

    if (data && data.success) {
      currentScrapedArticle = data;
      const scrapedImg = data.imageBase64 || data.imageUrl;
      if (scrapedImg && (!creatorReferenceImageBase64 || creatorReferenceImageSourceLabel?.startsWith('Article Lead Photo'))) {
        creatorReferenceImageBase64 = scrapedImg;
        creatorReferenceImageMimeType = data.imageMimeType || 'image/jpeg';
        creatorReferenceImageSourceLabel = `Article Lead Photo (${data.siteName || 'Web'})`;
        updateReferencePhotoUI();
      }
      const isFull = (data.content && data.content.length > 200) || (!data.fallback);
      if (indicator) {
        indicator.className = isFull ? 'url-scrape-indicator success' : 'url-scrape-indicator info';
        indicator.innerHTML = `
          <span class="scrape-icon">${isFull ? '✓' : 'ℹ'}</span>
          <div class="scrape-text-wrap">
            <span class="scrape-title">${isFull ? 'Full article retrieved' : 'Headline extracted'} (${escapeHtml(data.siteName || 'Web')})</span>
            <span class="scrape-sub">${escapeHtml(data.title || clean)}</span>
          </div>
        `;
        indicator.style.display = 'flex';
      }
    }
  } catch (err) {
    console.warn('URL scrape error:', err.message);
    const slugTitle = extractHeadlineFromUrl(clean);
    currentScrapedArticle = { url: clean, title: slugTitle, siteName: getCleanDomain(clean), content: '' };
    if (indicator) {
      indicator.className = 'url-scrape-indicator info';
      indicator.innerHTML = `
        <span class="scrape-icon">ℹ</span>
        <div class="scrape-text-wrap">
          <span class="scrape-title">Citation link saved (${escapeHtml(currentScrapedArticle.siteName)})</span>
          <span class="scrape-sub">${escapeHtml(slugTitle || clean)}</span>
        </div>
      `;
      indicator.style.display = 'flex';
    }
  } finally {
    isScrapingUrl = false;
  }
}

function isLikelyPersonSubject(name) {
  if (!name) return false;
  const lower = name.toLowerCase();
  const nonPersonKeywords = [
    'court', 'building', 'parliament', 'cctv', 'camera', 'surveillance', 'rig',
    'tower', 'monument', 'bull', 'colonnade', 'street', 'office', 'temple',
    'facility', 'center', 'centre', 'network', 'grid', 'machine', 'car', 'drone',
    'chip', 'server', 'satellite', 'statue', 'facade', 'institution', 'cell',
    'system', 'law', 'act', 'code', 'bill', 'treaty', 'policy', 'economy', 'budget'
  ];
  if (nonPersonKeywords.some(w => lower.includes(w))) return false;
  const personKeywords = [
    'trump', 'musk', 'altman', 'biden', 'modi', 'pichai', 'nadella', 'cook',
    'huang', 'minister', 'president', 'judge', 'justice', 'officer', 'sweeper',
    'curator', 'citizen', 'woman', 'man', 'girl', 'boy', 'leader', 'doctor',
    'worker', 'protagonist', 'figure', 'person', 'individual', 'portrait', 'lookalike',
    'founder', 'engineer', 'entrepreneur', 'student', 'youth', 'author', 'critic',
    'analyst', 'politician', 'actor', 'young'
  ];
  return personKeywords.some(w => lower.includes(w));
}

function detectPersonNameInContext(title, slant, content) {
  const combined = `${title || ''} ${slant || ''} ${content ? content.slice(0, 500) : ''}`;
  const lower = combined.toLowerCase();

  if (lower.includes('trump')) return 'Donald Trump';
  if (lower.includes('musk')) return 'Elon Musk';
  if (lower.includes('altman')) return 'Sam Altman';
  if (lower.includes('nadella')) return 'Satya Nadella';
  if (lower.includes('pichai')) return 'Sundar Pichai';
  if (lower.includes('tim cook') || (lower.includes('cook') && lower.includes('apple'))) return 'Tim Cook';
  if (lower.includes('huang') || lower.includes('jensen')) return 'Jensen Huang';
  if (lower.includes('biden')) return 'Joe Biden';
  if (lower.includes('harris') && (lower.includes('kamala') || lower.includes('vice'))) return 'Kamala Harris';
  if (lower.includes('zuckerberg')) return 'Mark Zuckerberg';
  if (lower.includes('bezos')) return 'Jeff Bezos';
  if (lower.includes('modi')) return 'Narendra Modi';

  // Capitalized full name in title e.g. "John Smith"
  if (title) {
    const match = title.match(/\b([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,})\b/);
    if (match && !/^(The New|United States|White House|Wall Street|Silicon Valley|New York|Los Angeles|San Francisco)/i.test(match[1])) {
      return match[1];
    }
  }

  return null;
}

function detectAgeAndDemographics(text = '', headline = '', content = '') {
  const combined = `${headline || ''} ${text || ''} ${content ? content.slice(0, 1000) : ''}`.toLowerCase();

  // 1. Explicit age patterns: "25-year-old", "25 years old", "aged 25", "age 25", "25yo"
  const ageMatch = combined.match(/\b(\d{1,2})\s*[-–—]?\s*(?:years?[- ]old|year[- ]old|yo\b)/i) ||
                   combined.match(/\b(?:aged|age)\s+(\d{1,2})\b/i);
  if (ageMatch) {
    const age = parseInt(ageMatch[1], 10);
    if (age >= 10 && age <= 105) {
      if (age <= 21) {
        return {
          age,
          category: 'youth',
          label: `${age}-Year-Old Youth`,
          shortDesc: `Youthful ${age}-Year-Old Protagonist`,
          promptDesc: `youthful ${age}-year-old student, young fresh facial features, youthful hair, modern casual look, clear young skin, strictly no wrinkles or gray hair`
        };
      } else if (age <= 29) {
        return {
          age,
          category: 'twenty_something',
          label: `${age}-Year-Old`,
          shortDesc: `Youthful ${age}-Year-Old Protagonist`,
          promptDesc: `youthful ${age}-year-old young adult in their mid-20s, young contemporary facial features, modern vibrant styling, fresh young skin, strictly no wrinkles, no gray hair`
        };
      } else if (age <= 39) {
        return {
          age,
          category: 'thirties',
          label: `${age}-Year-Old`,
          shortDesc: `${age}-Year-Old Professional`,
          promptDesc: `young adult in their 30s (${age} years old), sharp modern facial features, dynamic contemporary styling`
        };
      } else if (age <= 55) {
        return {
          age,
          category: 'middle_aged',
          label: `${age}-Year-Old`,
          shortDesc: `${age}-Year-Old Leader`,
          promptDesc: `mature adult in their 40s-50s (${age} years old), confident seasoned expression, distinguished contemporary styling`
        };
      } else {
        return {
          age,
          category: 'senior',
          label: `${age}-Year-Old Senior`,
          shortDesc: `Distinguished ${age}-Year-Old Elder`,
          promptDesc: `distinguished ${age}-year-old senior with silver gray hair, dignified weathered facial features, wise expression`
        };
      }
    }
  }

  // 2. Life-stage and demographic keywords
  if (/\b(gen[- ]?z|college student|undergraduate|teenager|youth|young founder|young entrepreneur|young girl|young boy)\b/i.test(combined)) {
    return {
      age: 23,
      category: 'twenty_something',
      label: 'Gen-Z / Youth',
      shortDesc: 'Youthful Gen-Z Protagonist',
      promptDesc: `youthful 20-something young adult, Gen-Z contemporary styling, fresh young facial features, modern vibrant look, strictly no wrinkles or gray hair`
    };
  }
  if (/\b(veteran|elderly|grandfather|grandmother|octogenarian|septuagenarian|retiree|pensioner)\b/i.test(combined)) {
    return {
      age: 72,
      category: 'senior',
      label: 'Senior Elder',
      shortDesc: 'Distinguished Elder Protagonist',
      promptDesc: `distinguished elder in their 70s, silver hair, weathered dignified facial features, wise expression`
    };
  }

  return null;
}

// Fallback heuristic 6-dimension extractor matching VisualCueService.dart
function extract6RankedCueDimensions(curatorAngle, newsHeadline, newsBody) {
  let cleanHeadline = (newsHeadline || '').trim();
  if (cleanHeadline.startsWith('http://') || cleanHeadline.startsWith('https://')) {
    cleanHeadline = extractHeadlineFromUrl(cleanHeadline);
  }

  const combined = `${curatorAngle || ''} ${cleanHeadline} ${newsBody || ''}`.toLowerCase();
  const isIndia = (creatorCountryContext?.code === 'IN') || combined.includes('india') || combined.includes('delhi') || combined.includes('thehindu');
  const isUK = (creatorCountryContext?.code === 'GB') || combined.includes('london') || combined.includes('westminster');
  const isJapan = (creatorCountryContext?.code === 'JP') || combined.includes('japan') || combined.includes('tokyo');

  // 1. HERO (Subject from headline or angle - never a URL!)
  let hero = '';
  const detectedPerson = detectPersonNameInContext(cleanHeadline, curatorAngle, newsBody);
  const demographic = detectAgeAndDemographics(curatorAngle, cleanHeadline, newsBody);

  if (detectedPerson) {
    hero = demographic ? `${detectedPerson} (${demographic.label}, Editorial Portrait)` : `${detectedPerson} (Editorial Portrait)`;
  } else if (demographic) {
    hero = `${demographic.shortDesc} (Editorial Portrait)`;
  } else if (combined.includes('garbage') || combined.includes('trash') || combined.includes('waste') || combined.includes('clean')) {
    hero = isIndia ? 'Municipal Sweeper with Traditional Reed Broom' : 'Lone Sweeper with Traditional Broom';
  } else if (combined.includes('ai') || combined.includes('tech') || combined.includes('silicon') || combined.includes('data center') || combined.includes('model') || combined.includes('compute') || combined.includes('apple') || combined.includes('phone') || combined.includes('ipad')) {
    hero = 'Monolithic Obsidian Server Tower';
  } else if (combined.includes('market') || combined.includes('invest') || combined.includes('wealth') || combined.includes('billion') || combined.includes('stock')) {
    hero = isIndia ? 'Dalal Street Bull Bronze Monument' : 'Charging Wall Street Bronze Bull';
  } else if (combined.includes('polit') || combined.includes('elect') || combined.includes('minister') || combined.includes('leader') || combined.includes('vote')) {
    hero = isIndia ? 'Indian Parliament Sandstone Colonnade' : 'Solitary Figure at Microphone';
  } else if (combined.includes('court') || combined.includes('judge') || combined.includes('law') || combined.includes('case') || combined.includes('crime') || combined.includes('goon')) {
    hero = isIndia ? 'Supreme Court of India Pillared Portico' : (isUK ? 'Old Bailey Gilded Scales of Justice' : 'Gavel & Broken Stone Pillar');
  } else if (cleanHeadline && cleanHeadline.length > 3 && !cleanHeadline.startsWith('http')) {
    hero = cleanHeadline.split(/[:–—\-]/)[0].trim();
    if (hero.length > 38) hero = hero.substring(0, 35) + '...';
  } else if (curatorAngle && curatorAngle.trim().length > 0) {
    hero = curatorAngle.trim().split(/[.\n!?]/)[0].trim();
    if (hero.length > 38) hero = hero.substring(0, 35) + '...';
  } else {
    hero = 'Solitary Focal Figure';
  }

  // 2. MOTIF (Core Metaphor from Curator Angle)
  let motif = '';
  if (combined.includes('court') || combined.includes('judge') || combined.includes('law') || combined.includes('crime') || combined.includes('scale') || combined.includes('justice') || combined.includes('balance') || combined.includes('fair')) {
    motif = isIndia ? 'Ashoka Lion Capital & Scales of Justice' : 'Tipping Brass Balance Scales';
  } else if (combined.includes('taste') || combined.includes('craft') || combined.includes('art') || combined.includes('design')) {
    motif = 'Sculptor Chisel against Uncarved Marble';
  } else if (combined.includes('puppet') || combined.includes('control') || combined.includes('manipulat')) {
    motif = 'Tangled Marionette Puppet Strings';
  } else if (combined.includes('hourglass') || combined.includes('time') || combined.includes('delay') || combined.includes('wait')) {
    motif = 'Crumbling Glass Hourglass';
  } else if (combined.includes('power') || combined.includes('grid') || combined.includes('cable') || combined.includes('energy')) {
    motif = 'Tangled High-Voltage Transmission Cables';
  } else if (curatorAngle && curatorAngle.trim().length > 0) {
    const parts = curatorAngle.trim().split(/[;,–—]/);
    motif = (parts[1] || parts[0]).trim();
    if (motif.length > 38) motif = motif.substring(0, 35) + '...';
  } else {
    motif = 'Symbolic Editorial Metaphor';
  }

  // 3. TENSION (Conflict / Friction / Obstacle)
  let tension = '';
  if (combined.includes('court') || combined.includes('crime')) {
    tension = 'Swarm of Shadows around Court Gates';
  } else if (combined.includes('storm') || combined.includes('threat') || combined.includes('crisis')) {
    tension = 'Approaching Storm Wall on Horizon';
  } else if (combined.includes('crack') || combined.includes('fall') || combined.includes('collaps')) {
    tension = 'Cracking Stone Foundation Beneath';
  } else if (combined.includes('surveil') || combined.includes('monitor') || combined.includes('watch')) {
    tension = 'Unblinking Mechanical Ocular Eye';
  } else if (combined.includes('speed') || combined.includes('flood') || combined.includes('infinite') || combined.includes('mediocrity')) {
    tension = 'Relentless Tidal Wave of Noise';
  } else if (combined.includes('greed') || combined.includes('inequal') || combined.includes('shadow')) {
    tension = 'Looming Corporate Glass Shadow';
  } else {
    tension = 'Friction & Opposing Cast Shadows';
  }

  // 4. ATMOSPHERE (Setting / Environment)
  let atmosphere = '';
  if (combined.includes('street') || combined.includes('city') || combined.includes('road') || combined.includes('urban')) {
    atmosphere = isIndia ? 'Dusk over New Delhi Red Sandstone Corridor' : 'Damp Rain-Slicked City Boulevard';
  } else if (combined.includes('board') || combined.includes('exec') || combined.includes('corp')) {
    atmosphere = 'Smoke-Filled High-Rise Boardroom';
  } else if (combined.includes('cyber') || combined.includes('digital') || combined.includes('data') || combined.includes('tech')) {
    atmosphere = 'Brutalist Concrete Server Canyon';
  } else if (combined.includes('trade') || combined.includes('stock') || combined.includes('wall street')) {
    atmosphere = isIndia ? 'Dalal Street Trading Floor at Dusk' : 'Empty Trading Floor at Dusk';
  } else {
    atmosphere = isIndia ? 'Monsoon-Drenched New Delhi Court Corridor' : (isUK ? 'Rain-Mist Westminster Stone Embankment' : (isJapan ? 'Shinjuku Neon Alleyway in Dusk Rain' : 'Atmospheric Minimalist Crossroads'));
  }

  // 5. LIGHTING (Chiaroscuro & Mood)
  let lighting = '';
  if (combined.includes('neon') || combined.includes('cyber') || combined.includes('future') || combined.includes('tech') || combined.includes('ai')) {
    lighting = 'Cyan Terminal Glare and Charcoal Shadows';
  } else if (combined.includes('dark') || combined.includes('noir') || combined.includes('secret') || combined.includes('investig') || combined.includes('court') || combined.includes('crime')) {
    lighting = 'Stark High-Contrast Noir Rim Light';
  } else if (combined.includes('dawn') || combined.includes('morning') || combined.includes('hope') || combined.includes('trip') || combined.includes('family') || combined.includes('travel')) {
    lighting = 'Soft Fog-Diffused Morning Light';
  } else if (combined.includes('market') || combined.includes('stock') || combined.includes('trade') || combined.includes('finance')) {
    lighting = 'Cold Steel-Blue Architectural Daylight';
  } else {
    lighting = 'Dramatic Chiaroscuro Beam from Above';
  }

  // 6. STYLE (Print Medium & Movement)
  let style = '';
  if (isIndia) {
    style = 'Editorial Sandstone & Indigo Broadsheet Woodcut';
  } else if (combined.includes('tech') || combined.includes('modern') || combined.includes('future')) {
    style = 'Bauhaus Geometric Vector Poster';
  } else if (combined.includes('historic') || combined.includes('classic') || combined.includes('book') || combined.includes('paper')) {
    style = 'Vintage Woodcut Broadsheet Engraving';
  } else {
    style = 'Vivid Cinematic Editorial Illustration';
  }

  return [hero, motif, tension, atmosphere, lighting, style];
}

const CUE_RANK_CONFIGS = [
  { badge: '★ #1 HERO', badgeClass: 'badge-rank-0', rowClass: 'cue-rank-0' },
  { badge: '★ #2 MOTIF', badgeClass: 'badge-rank-1', rowClass: 'cue-rank-1' },
  { badge: '⚡ #3 TENSION', badgeClass: 'badge-rank-2', rowClass: 'cue-rank-2' },
  { badge: '🏛 #4 ATMOSPHERE', badgeClass: 'badge-rank-3', rowClass: 'cue-rank-3' },
  { badge: '💡 #5 LIGHTING', badgeClass: 'badge-rank-4', rowClass: 'cue-rank-4' },
  { badge: '🎨 #6 STYLE', badgeClass: 'badge-rank-5', rowClass: 'cue-rank-5' },
];

const CUE_DIMENSION_EXPLAINERS = [
  {
    dimension: 'HERO',
    name: 'Focal Subject & Protagonist',
    badge: '★ #1 HERO',
    shortBadge: '#1 HERO',
    badgeClass: 'badge-rank-0',
    color: '#F59E0B',
    tagline: 'Centerpiece of Poster 1 (The Hook)',
    whatItMeans: 'The central protagonist, focal figure, key persona, or physical centerpiece commanding the visual frame.',
    howItModulates: 'Dictates the dominant subject rendered in Poster 1 (The Hook). All composition lines, eye-tracking paths, and the primary visual metaphor anchor directly onto this figure or object.',
    placeholder: 'e.g. Parent Packing Suitcase in Rush, Solo Whistleblower at Podium, Cluttered Airport Gate'
  },
  {
    dimension: 'MOTIF',
    name: 'Symbolic Metaphor & Catalyst',
    badge: '★ #2 MOTIF',
    shortBadge: '#2 MOTIF',
    badgeClass: 'badge-rank-1',
    color: '#0284C7',
    tagline: 'Emotional & Narrative Catalyst',
    whatItMeans: 'A tangible symbolic object, emblem, or artifact that embodies the core dilemma, spark, or philosophy of your slant.',
    howItModulates: 'Acts as the secondary storytelling element juxtaposed against the Hero. Visually anchors the deeper thematic argument expressed in Poster 2, turning an abstract idea into concrete visual poetry.',
    placeholder: 'e.g. Child Holding Forgotten Travel Item, Tipping Balance Scales, Severed Corporate Cable'
  },
  {
    dimension: 'TENSION',
    name: 'Opposing Friction & Conflict',
    badge: '⚡ #3 TENSION',
    shortBadge: '#3 TENSION',
    badgeClass: 'badge-rank-2',
    color: '#E11D48',
    tagline: 'Dramatic Stakes & Dynamic Energy',
    whatItMeans: 'The opposing friction, psychological resistance, looming deadline, or obstacle clashing against the protagonist.',
    howItModulates: 'Drives the dramatic contrast, diagonal composition angles, cast shadows, and emotional stakes of the visual narrative.',
    placeholder: 'e.g. Work Deadlines Clashing with Vacation Departure, Relentless Wave of Digital Pings'
  },
  {
    dimension: 'ATMOSPHERE',
    name: 'Environmental Setting & Scale',
    badge: '🏛 #4 ATMOSPHERE',
    shortBadge: '#4 ATMOSPHERE',
    badgeClass: 'badge-rank-3',
    color: '#8B5CF6',
    tagline: 'World, Geography & Texture',
    whatItMeans: 'The physical space, weather, geographical scale, architectural environment, or cultural landscape enclosing the scene.',
    howItModulates: 'Establishes authentic regional environment and background world (e.g. Kerala tropical backwaters vs corporate boardroom), rooting your slant in real life.',
    placeholder: 'e.g. Cluttered Study Transitioning to Kerala Palms, Rain-Slicked Dusk Boulevard'
  },
  {
    dimension: 'LIGHTING',
    name: 'Illumination & Chiaroscuro',
    badge: '💡 #5 LIGHTING',
    shortBadge: '#5 LIGHTING',
    badgeClass: 'badge-rank-4',
    color: '#059669',
    tagline: 'Visual Tone & Mood Contrast',
    whatItMeans: 'The light source, color temperature, atmospheric haze, and chiaroscuro contrast illuminating the scene.',
    howItModulates: 'Controls shadow depth, color temperature harmony, and cinematic mood (e.g. warm golden sunset lamp clashing with cool laptop monitor glow), ensuring an editorial, artistic poster feel.',
    placeholder: 'e.g. Warm Sunset Amber Light Meeting Cool Screen Glow, Harsh Noir Overhead Spotlight'
  },
  {
    dimension: 'STYLE',
    name: 'Visual Art Medium & Texture',
    badge: '🎨 #6 STYLE',
    shortBadge: '#6 STYLE',
    badgeClass: 'badge-rank-5',
    color: '#475569',
    tagline: 'Aesthetic Grammar & Print Medium',
    whatItMeans: 'The specific visual art medium, print technique, surface texture, and editorial aesthetic grammar.',
    howItModulates: 'Instructs the image generation engine on artistic texture—determining whether it renders as painterly editorial realism, noir risograph, vintage woodcut, or Bauhaus vector.',
    placeholder: 'e.g. Cinematic Warm Editorial Illustration, High-Contrast Noir Risograph Print, Vintage Woodcut'
  }
];

function getCueExplainer(index) {
  if (index >= 0 && index < CUE_DIMENSION_EXPLAINERS.length) {
    return CUE_DIMENSION_EXPLAINERS[index];
  }
  return {
    dimension: `CUE #${index + 1}`,
    name: 'Custom Visual Dimension',
    badge: `🏷️ #${index + 1} CUE`,
    shortBadge: `#${index + 1} CUE`,
    badgeClass: 'badge-rank-other',
    color: '#64748B',
    tagline: 'User-Defined Storytelling Element',
    whatItMeans: 'A custom visual motif, metaphor, or specific element defined directly by you.',
    howItModulates: 'Injected into the artwork generation prompt to enrich the visual depth and contextual nuance of the Hook poster.',
    placeholder: 'Type your custom visual element or metaphor...'
  };
}

async function goToVisualCuesStep() {
  const urlInput = document.getElementById('creatorUrlInput');
  const slantTakeInput = document.getElementById('creatorSlantTakeInput');

  const url = urlInput ? urlInput.value.trim() : '';
  const slantTake = slantTakeInput ? slantTakeInput.value.trim() : '';

  // Validation matching Flutter mobile app exactly
  if (creatorSelectedSource === 'inner_voice') {
    if (!slantTake) {
      alert('Please write your slant or perspective above first');
      if (slantTakeInput) slantTakeInput.focus();
      return;
    }
  } else if (creatorSelectedSource === 'photo') {
    if (!creatorSelectedImageBase64) {
      alert('Please snap or upload a magazine or print clipping photo first');
      return;
    }
  } else if (creatorSelectedSource === 'digital_link') {
    if (!url) {
      alert('Please enter or paste a news article URL first');
      if (urlInput) urlInput.focus();
      return;
    }
    // If not scraped yet, scrape now!
    if (!currentScrapedArticle) {
      await handleUrlInput(url);
    }
  }

  // Switch step indicators
  const s1 = document.getElementById('creatorStep1');
  const s2 = document.getElementById('creatorStep2');
  const s3 = document.getElementById('creatorStep3');
  const d1 = document.getElementById('stepDot1');
  const d2 = document.getElementById('stepDot2');
  const d3 = document.getElementById('stepDot3');
  const cuesContent = document.getElementById('cuesStudioContent');
  const synthLoading = document.getElementById('synthesisLoadingState');

  if (s1) s1.style.display = 'none';
  if (s2) s2.style.display = 'block';
  if (s3) s3.style.display = 'none';
  if (cuesContent) cuesContent.style.display = 'flex';
  if (synthLoading) synthLoading.style.display = 'none';

  if (d1) d1.className = 'creator-step-dot completed';
  if (d2) d2.className = 'creator-step-dot active';
  if (d3) d3.className = 'creator-step-dot';

  if (currentScrapedArticle && (currentScrapedArticle.imageBase64 || currentScrapedArticle.imageUrl)) {
    if (!creatorReferenceImageBase64 || creatorReferenceImageSourceLabel?.startsWith('Article Lead Photo')) {
      creatorReferenceImageBase64 = currentScrapedArticle.imageBase64 || currentScrapedArticle.imageUrl;
      creatorReferenceImageMimeType = currentScrapedArticle.imageMimeType || 'image/jpeg';
      creatorReferenceImageSourceLabel = `Article Lead Photo (${currentScrapedArticle.siteName || 'Web'})`;
    }
  }

  updateReferencePhotoUI();

  const step2Right = document.getElementById('step2NavRightBtn');
  if (step2Right) {
    step2Right.title = currentSynthesizedPost ? 'View Generated Posters →' : 'Generate Posters →';
  }

  // Auto-detect and set geographic & cultural context
  const articleTitle = currentScrapedArticle?.title || extractHeadlineFromUrl(url);
  const articleBody = currentScrapedArticle?.content || '';
  if (!creatorCountryContext) {
    creatorCountryContext = detectGeographicContext(url, articleTitle, articleBody, slantTake);
  }
  updateCountryContextUI();

  // AI-suggest cues if context changed or empty
  const contextKey = `${creatorSelectedSource}::${articleTitle}::${slantTake}::${creatorCharacterRepresentation}::${creatorCountryContext?.code}`;

  if (creatorCuePills.length === 0 || creatorLastSuggestedContextKey !== contextKey) {
    creatorLastSuggestedContextKey = contextKey;
    renderCuesDeck(); // initial render
    await triggerCueSuggest(); // call Gemini AI model for rich cues!
  } else {
    if (creatorCharacterRepresentation === 'likeness') {
      const detected = detectPersonNameInContext(articleTitle, slantTake, currentScrapedArticle?.content);
      if (detected && creatorCuePills.length > 0 && !creatorCuePills[0].toLowerCase().includes(detected.toLowerCase())) {
        creatorCuePills[0] = `${detected} (Editorial Portrait)`;
      }
    }
    renderCuesDeck();
  }
}

function renderCuesDeck() {
  const container = document.getElementById('cuesDeckContainer');
  if (!container) return;

  container.innerHTML = '';

  // Ensure inspected index is valid
  if (creatorCuePills.length > 0) {
    if (creatorActiveInspectedCueIndex < 0 || creatorActiveInspectedCueIndex >= creatorCuePills.length) {
      creatorActiveInspectedCueIndex = 0;
    }
  }

  creatorCuePills.forEach((cueText, index) => {
    const isSelected = creatorSelectedCueIndices.has(index);
    const isInspected = (creatorActiveInspectedCueIndex === index);
    const rankConfig = CUE_RANK_CONFIGS[index] || {
      badge: `#${index + 1} CUE`,
      badgeClass: 'badge-rank-other',
      rowClass: ''
    };

    const row = document.createElement('div');
    row.className = `cue-card-row ${rankConfig.rowClass} ${isSelected ? 'selected' : ''} ${isInspected ? 'inspected-active' : ''}`;
    row.setAttribute('data-index', index);
    row.setAttribute('draggable', 'true');

    row.innerHTML = `
      <div class="cue-drag-handle" title="Hold & drag to prioritize (#1 is Hero)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="5" r="2"></circle>
          <circle cx="15" cy="5" r="2"></circle>
          <circle cx="9" cy="12" r="2"></circle>
          <circle cx="15" cy="12" r="2"></circle>
          <circle cx="9" cy="19" r="2"></circle>
          <circle cx="15" cy="19" r="2"></circle>
        </svg>
      </div>
      <div class="cue-checkbox-wrap" onclick="event.stopPropagation(); toggleCueSelection(${index})" title="Select for targeted AI suggest">
        <input type="checkbox" class="cue-checkbox" ${isSelected ? 'checked' : ''} onchange="event.stopPropagation(); toggleCueSelection(${index})">
      </div>
      <span class="cue-badge ${rankConfig.badgeClass}">${rankConfig.badge}</span>
      <input type="text" class="cue-input-text" id="cueRowInput_${index}" value="${escapeHtml(cueText)}" onfocus="onCueRowFocus(${index})" oninput="updateCueTextFromRow(${index}, this.value)">
      <div class="cue-row-inspect-action" onclick="event.stopPropagation(); selectActiveInspectedCue(${index}, true)" title="Inspect meaning & edit below">
        ${isInspected ? '<span class="cue-row-inspect-badge active">Editing Below ▾</span>' : '<span class="cue-row-inspect-badge">Inspect ❯</span>'}
      </div>
      <button type="button" class="cue-delete-btn" onclick="event.stopPropagation(); deleteCue(${index})" title="Remove cue">✕</button>
    `;

    // Clicking row selects it for inspector
    row.addEventListener('click', (e) => {
      if (e.target.closest('.cue-drag-handle') || e.target.closest('.cue-checkbox-wrap') || e.target.closest('.cue-delete-btn') || e.target.closest('.cue-input-text')) {
        return;
      }
      selectActiveInspectedCue(index, true);
    });

    // HTML5 Drag and Drop events
    row.addEventListener('dragstart', (e) => {
      draggedCueIndex = index;
      row.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
      }
    });

    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      const rect = row.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      if (e.clientY < midpoint) {
        row.classList.add('drag-over-top');
        row.classList.remove('drag-over-bottom');
      } else {
        row.classList.add('drag-over-bottom');
        row.classList.remove('drag-over-top');
      }
    });

    row.addEventListener('dragleave', () => {
      row.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('drag-over-top', 'drag-over-bottom');
      if (draggedCueIndex !== null && draggedCueIndex !== index) {
        reorderCues(draggedCueIndex, index);
      }
      draggedCueIndex = null;
    });

    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      document.querySelectorAll('.cue-card-row').forEach(r => r.classList.remove('drag-over-top', 'drag-over-bottom'));
      draggedCueIndex = null;
    });

    // Touch support for mobile hold-and-drag
    const dragHandle = row.querySelector('.cue-drag-handle');
    if (dragHandle) {
      let isTouchDragging = false;

      dragHandle.addEventListener('touchstart', (e) => {
        draggedCueIndex = index;
        isTouchDragging = true;
        row.classList.add('dragging');
      }, { passive: true });

      dragHandle.addEventListener('touchmove', (e) => {
        if (!isTouchDragging) return;
        const touch = e.touches[0];
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        const targetRow = el ? el.closest('.cue-card-row') : null;
        document.querySelectorAll('.cue-card-row').forEach(r => {
          if (r !== row) r.classList.remove('drag-over-top', 'drag-over-bottom');
        });
        if (targetRow && targetRow !== row) {
          const rect = targetRow.getBoundingClientRect();
          if (touch.clientY < rect.top + rect.height / 2) {
            targetRow.classList.add('drag-over-top');
          } else {
            targetRow.classList.add('drag-over-bottom');
          }
        }
      }, { passive: false });

      dragHandle.addEventListener('touchend', (e) => {
        if (!isTouchDragging) return;
        isTouchDragging = false;
        row.classList.remove('dragging');
        const touch = e.changedTouches[0];
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        const targetRow = el ? el.closest('.cue-card-row') : null;
        document.querySelectorAll('.cue-card-row').forEach(r => r.classList.remove('drag-over-top', 'drag-over-bottom'));
        if (targetRow && targetRow !== row) {
          const targetIdx = parseInt(targetRow.getAttribute('data-index'), 10);
          if (!isNaN(targetIdx) && targetIdx !== index) {
            reorderCues(index, targetIdx);
          }
        }
        draggedCueIndex = null;
      });
    }

    container.appendChild(row);
  });

  // Update Action Bar info & suggest button
  const infoText = document.getElementById('cuesInfoText');
  const suggestLabel = document.getElementById('cuesSuggestLabel');
  const suggestIcon = document.getElementById('cuesSuggestIcon');

  if (creatorSelectedCueIndices.size > 0) {
    if (infoText) {
      infoText.innerHTML = `
        <span style="color:var(--primary);font-weight:700;">${creatorSelectedCueIndices.size} selected</span>
        <span>•</span>
        <a href="javascript:void(0)" onclick="clearCueSelection()" style="color:var(--text-muted);text-decoration:underline;">Clear</a>
      `;
    }
    if (suggestLabel) suggestLabel.textContent = `Suggest (${creatorSelectedCueIndices.size})`;
    if (suggestIcon) suggestIcon.textContent = '🔄';
  } else {
    if (infoText) {
      infoText.innerHTML = `
        <span class="cues-info-icon">👁️</span>
        <span>Tap any cue to inspect meaning & edit below • Hold & drag ⠿ to re-rank</span>
      `;
    }
    if (suggestLabel) suggestLabel.textContent = 'Suggest All';
    if (suggestIcon) suggestIcon.textContent = '✨';
  }

  // Always update the active cue inspector & meaning panel
  renderCueInspector();
}

function renderCueInspector() {
  const container = document.getElementById('cueInspectorCard');
  if (!container) return;

  if (creatorCuePills.length === 0) {
    container.innerHTML = `
      <div class="cue-inspector-empty">
        <span class="cue-inspector-empty-icon">🎨</span>
        <span>No visual cues yet. Click <strong>✨ Suggest All</strong> above to generate editorial cues.</span>
      </div>
    `;
    return;
  }

  // Ensure index in bounds
  if (creatorActiveInspectedCueIndex < 0 || creatorActiveInspectedCueIndex >= creatorCuePills.length) {
    creatorActiveInspectedCueIndex = 0;
  }

  const index = creatorActiveInspectedCueIndex;
  const explainer = getCueExplainer(index);
  const currentVal = creatorCuePills[index] || '';

  // Generate top navigation pills
  const navPillsHtml = creatorCuePills.map((_, i) => {
    const exp = getCueExplainer(i);
    const isActive = (i === index);
    return `
      <button type="button" 
        class="cue-nav-pill ${isActive ? 'active ' + exp.badgeClass : ''}" 
        onclick="selectActiveInspectedCue(${i}, false)"
        title="Inspect and edit ${exp.badge}">
        ${exp.shortBadge || exp.badge}
      </button>
    `;
  }).join('');

  container.innerHTML = `
    <!-- 1. Top Quick Dimension Navigator -->
    <div class="cue-inspector-nav-strip">
      <span class="cue-nav-strip-label">Select Cue to Inspect & Edit:</span>
      <div class="cue-nav-pills-row">
        ${navPillsHtml}
      </div>
    </div>

    <!-- 2. Active Cue Header & Uneditable Badge -->
    <div class="cue-inspector-header">
      <div class="cue-inspector-title-wrap">
        <span class="cue-badge ${explainer.badgeClass}">${explainer.badge}</span>
        <span class="cue-inspector-title">${explainer.name}</span>
        <span class="cue-inspector-tagline">• ${explainer.tagline}</span>
      </div>
      <div class="cue-uneditable-badge" title="This editorial definition guides your post synthesis">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C9.243 2 7 4.243 7 7v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7c0-2.757-2.243-5-5-5zm-3 5c0-1.654 1.346-3 3-3s3 1.346 3 3v3H9V7z"/>
        </svg>
        <span>Editorial Guide (Uneditable)</span>
      </div>
    </div>

    <!-- 3. Uneditable Informative Details Card -->
    <div class="cue-explainer-box" style="border-left: 3.5px solid ${explainer.color};">
      <div class="cue-explainer-row">
        <div class="cue-explainer-tag"><span class="cue-explainer-icon">📌</span> WHAT THIS MEANS</div>
        <div class="cue-explainer-desc">${explainer.whatItMeans}</div>
      </div>
      <div class="cue-explainer-divider"></div>
      <div class="cue-explainer-row">
        <div class="cue-explainer-tag"><span class="cue-explainer-icon">🎨</span> HOW IT MODULATES YOUR POST</div>
        <div class="cue-explainer-desc">${explainer.howItModulates}</div>
      </div>
    </div>

    <!-- 4. Editable Content Field -->
    <div class="cue-editor-section">
      <div class="cue-editor-header">
        <label for="cueInspectorInput" class="cue-editor-label">
          <span>✏️ Current Content for ${explainer.shortBadge || explainer.badge} (Editable):</span>
        </label>
        <span class="cue-editor-hint">Edits live-sync with the cue deck and guide final artwork</span>
      </div>
      <div class="cue-editor-input-wrap">
        <textarea id="cueInspectorInput" class="cue-inspector-textarea" rows="2" 
          placeholder="${explainer.placeholder}" 
          oninput="updateActiveCueFromInspector(this.value)">${escapeHtml(currentVal)}</textarea>
      </div>
      <div class="cue-editor-footer">
        <span class="cue-sync-pill">
          <span class="cue-sync-dot"></span> Live synced with cues deck above
        </span>
        <div class="cue-editor-nav-btns">
          <button type="button" class="cue-action-btn cue-action-clear" onclick="clearActiveCueContent()">Clear</button>
          <button type="button" class="cue-action-btn cue-action-prev" onclick="goToPrevCue()" ${index === 0 ? 'disabled' : ''}>❮ Prev</button>
          <button type="button" class="cue-action-btn cue-action-next" onclick="goToNextCue()" ${index >= creatorCuePills.length - 1 ? 'disabled' : ''}>Next ❯</button>
        </div>
      </div>
    </div>
  `;
}

function selectActiveInspectedCue(index, focusField = false) {
  if (index < 0 || index >= creatorCuePills.length) return;
  creatorActiveInspectedCueIndex = index;

  // Highlight rows in deck without doing expensive DOM destroy
  const rows = document.querySelectorAll('.cue-card-row');
  rows.forEach((r, idx) => {
    r.classList.toggle('inspected-active', idx === index);
    const inspectBadge = r.querySelector('.cue-row-inspect-action');
    if (inspectBadge) {
      inspectBadge.innerHTML = (idx === index)
        ? '<span class="cue-row-inspect-badge active">Editing Below ▾</span>'
        : '<span class="cue-row-inspect-badge">Inspect ❯</span>';
    }
  });

  renderCueInspector();

  if (focusField) {
    const input = document.getElementById('cueInspectorInput');
    if (input) {
      input.focus();
      const len = input.value.length;
      input.setSelectionRange(len, len);
    }
  }
}

function onCueRowFocus(index) {
  if (creatorActiveInspectedCueIndex !== index) {
    creatorActiveInspectedCueIndex = index;
    const rows = document.querySelectorAll('.cue-card-row');
    rows.forEach((r, idx) => {
      r.classList.toggle('inspected-active', idx === index);
      const inspectBadge = r.querySelector('.cue-row-inspect-action');
      if (inspectBadge) {
        inspectBadge.innerHTML = (idx === index)
          ? '<span class="cue-row-inspect-badge active">Editing Below ▾</span>'
          : '<span class="cue-row-inspect-badge">Inspect ❯</span>';
      }
    });
    renderCueInspector();
  }
}

function updateCueTextFromRow(index, val) {
  if (index >= 0 && index < creatorCuePills.length) {
    creatorCuePills[index] = val;
    if (creatorActiveInspectedCueIndex === index) {
      const inspectorInput = document.getElementById('cueInspectorInput');
      if (inspectorInput && inspectorInput.value !== val) {
        inspectorInput.value = val;
      }
    }
  }
}

function updateActiveCueFromInspector(val) {
  const index = creatorActiveInspectedCueIndex;
  if (index >= 0 && index < creatorCuePills.length) {
    creatorCuePills[index] = val;
    const rowInput = document.getElementById(`cueRowInput_${index}`);
    if (rowInput && rowInput.value !== val) {
      rowInput.value = val;
    }
  }
}

function clearActiveCueContent() {
  const index = creatorActiveInspectedCueIndex;
  if (index >= 0 && index < creatorCuePills.length) {
    creatorCuePills[index] = '';
    const rowInput = document.getElementById(`cueRowInput_${index}`);
    if (rowInput) rowInput.value = '';
    const inspectorInput = document.getElementById('cueInspectorInput');
    if (inspectorInput) {
      inspectorInput.value = '';
      inspectorInput.focus();
    }
  }
}

function goToNextCue() {
  if (creatorCuePills.length === 0) return;
  const next = (creatorActiveInspectedCueIndex + 1) % creatorCuePills.length;
  selectActiveInspectedCue(next, true);
}

function goToPrevCue() {
  if (creatorCuePills.length === 0) return;
  const prev = (creatorActiveInspectedCueIndex - 1 + creatorCuePills.length) % creatorCuePills.length;
  selectActiveInspectedCue(prev, true);
}

function reorderCues(oldIndex, newIndex) {
  if (oldIndex < 0 || oldIndex >= creatorCuePills.length) return;
  if (newIndex < 0 || newIndex >= creatorCuePills.length) return;
  if (oldIndex === newIndex) return;

  const item = creatorCuePills.splice(oldIndex, 1)[0];
  creatorCuePills.splice(newIndex, 0, item);

  // Remap selections cleanly (matching Flutter ReorderableListView logic)
  const wasSelected = creatorSelectedCueIndices.has(oldIndex);
  const newSelected = new Set();
  creatorSelectedCueIndices.forEach(s => {
    if (s === oldIndex) return;
    let mapped = s;
    if (oldIndex < newIndex) {
      if (s > oldIndex && s <= newIndex) mapped = s - 1;
    } else {
      if (s >= newIndex && s < oldIndex) mapped = s + 1;
    }
    newSelected.add(mapped);
  });
  if (wasSelected) newSelected.add(newIndex);
  creatorSelectedCueIndices = newSelected;

  // Remap active inspected cue index
  if (creatorActiveInspectedCueIndex === oldIndex) {
    creatorActiveInspectedCueIndex = newIndex;
  } else if (oldIndex < newIndex && creatorActiveInspectedCueIndex > oldIndex && creatorActiveInspectedCueIndex <= newIndex) {
    creatorActiveInspectedCueIndex--;
  } else if (oldIndex > newIndex && creatorActiveInspectedCueIndex >= newIndex && creatorActiveInspectedCueIndex < oldIndex) {
    creatorActiveInspectedCueIndex++;
  }

  renderCuesDeck();
}

function toggleCueSelection(index) {
  if (creatorSelectedCueIndices.has(index)) {
    creatorSelectedCueIndices.delete(index);
  } else {
    creatorSelectedCueIndices.add(index);
  }
  renderCuesDeck();
}

function clearCueSelection() {
  creatorSelectedCueIndices.clear();
  renderCuesDeck();
}

function deleteCue(index) {
  if (index >= 0 && index < creatorCuePills.length) {
    creatorCuePills.splice(index, 1);
    creatorSelectedCueIndices.delete(index);
    if (creatorActiveInspectedCueIndex >= creatorCuePills.length) {
      creatorActiveInspectedCueIndex = Math.max(0, creatorCuePills.length - 1);
    }
    renderCuesDeck();
  }
}

function updateCueText(index, val) {
  updateCueTextFromRow(index, val);
}

function addCustomCue() {
  const input = document.getElementById('customCueInput');
  const val = input ? input.value.trim() : '';
  if (!val) return;

  creatorCuePills.push(val);
  creatorActiveInspectedCueIndex = creatorCuePills.length - 1;
  if (input) input.value = '';
  renderCuesDeck();
  const inspectorInput = document.getElementById('cueInspectorInput');
  if (inspectorInput) {
    inspectorInput.focus();
  }
}

async function triggerCueSuggest() {
  const urlInput = document.getElementById('creatorUrlInput');
  const slantTakeInput = document.getElementById('creatorSlantTakeInput');
  const sparkInput = document.getElementById('creatorSparkInput');
  const url = urlInput ? urlInput.value.trim() : '';
  const slantTake = slantTakeInput ? slantTakeInput.value.trim() : '';
  const spark = sparkInput ? sparkInput.value.trim() : '';

  const articleTitle = currentScrapedArticle?.title || extractHeadlineFromUrl(url);
  const articleBody = currentScrapedArticle?.content || '';

  const suggestBtn = document.getElementById('cuesSuggestBtn');
  const suggestLabel = document.getElementById('cuesSuggestLabel');
  const suggestIcon = document.getElementById('cuesSuggestIcon');

  if (suggestBtn) suggestBtn.disabled = true;
  if (suggestLabel) suggestLabel.textContent = 'Thinking with Gemini...';
  if (suggestIcon) suggestIcon.textContent = '⏳';

  try {
    const resp = await fetch('/api/cues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        curatorAngle: slantTake,
        spark: spark,
        newsHeadline: articleTitle,
        newsBody: articleBody,
        sourceType: creatorSelectedSource,
        characterRepresentation: creatorCharacterRepresentation,
        selectedIndices: Array.from(creatorSelectedCueIndices),
        existingCues: creatorCuePills,
        countryContext: creatorCountryContext?.name || 'India',
        countryCode: creatorCountryContext?.code || 'IN',
        vocabularyStyle: creatorVocabularyStyle || 'punchy',
        slantTone: (creatorSelectedSource === 'inner_voice' || /\b(family|child|love|heart|trip|vacation|weekend|pack|burnout|unplug|memoir|personal)\b/i.test(`${slantTake} ${spark}`)) ? 'heart' : 'mind'
      })
    });

    if (!resp.ok) throw new Error('AI cues request failed');
    const data = await resp.json();

    if (data && data.success && Array.isArray(data.cues) && data.cues.length > 0) {
      if (creatorSelectedCueIndices.size > 0 && creatorCuePills.length > 0) {
        // Selective replacement: Map each selected cue index directly to its corresponding dimension from response
        const updated = [...creatorCuePills];
        creatorSelectedCueIndices.forEach(targetIdx => {
          if (data.cues && data.cues[targetIdx] !== undefined && data.cues[targetIdx]) {
            updated[targetIdx] = data.cues[targetIdx];
          }
        });
        creatorCuePills = updated;
        creatorSelectedCueIndices.clear();
      } else {
        creatorCuePills = data.cues;
      }

      // If likeness is selected, enforce detected person in #1 HERO
      if (creatorCharacterRepresentation === 'likeness') {
        const detected = detectPersonNameInContext(articleTitle, slantTake, articleBody);
        const demographic = detectAgeAndDemographics(slantTake, articleTitle, articleBody);
        if (detected && creatorCuePills.length > 0 && !creatorCuePills[0].toLowerCase().includes(detected.toLowerCase())) {
          creatorCuePills[0] = demographic ? `${detected} (${demographic.label}, Editorial Portrait)` : `${detected} (Editorial Portrait)`;
        }
      }
    } else {
      throw new Error('Invalid cues response');
    }
  } catch (err) {
    console.warn('AI cue suggestion fallback:', err.message);
    const fallbacks = extract6RankedCueDimensions(slantTake, articleTitle, articleBody);
    if (creatorSelectedCueIndices.size > 0 && creatorCuePills.length > 0) {
      creatorSelectedCueIndices.forEach(idx => {
        if (fallbacks[idx]) creatorCuePills[idx] = fallbacks[idx];
      });
      creatorSelectedCueIndices.clear();
    } else {
      creatorCuePills = fallbacks;
    }
  } finally {
    if (suggestBtn) suggestBtn.disabled = false;
    renderCuesDeck();
  }
}

function triggerReferencePhotoUpload() {
  const input = document.getElementById('faceLikenessFileInput');
  if (input) input.click();
}

function triggerReferencePhotoCamera() {
  const input = document.getElementById('faceLikenessCameraInput');
  if (input) input.click();
}

function handleReferenceImageSelection(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  compressImage(file, 1200, 0.82, function(base64Data, mimeType) {
    creatorReferenceImageBase64 = base64Data;
    creatorReferenceImageMimeType = mimeType || 'image/jpeg';
    creatorReferenceImageSourceLabel = 'Custom Portrait Photo';
    updateReferencePhotoUI();
  });
}

function updateReferencePhotoUI() {
  const section = document.getElementById('characterRefPhotoSection');
  const activeCard = document.getElementById('refPhotoActiveCard');
  const emptyCard = document.getElementById('refPhotoEmptyCard');
  const thumb = document.getElementById('refPhotoThumb');
  const title = document.getElementById('refPhotoTitle');
  const cameraBtn = document.getElementById('refCameraBtn');

  if (!section) return;

  if (creatorCharacterRepresentation !== 'likeness' && creatorCharacterRepresentation !== 'exact') {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  const desc = document.getElementById('refPhotoDesc');
  if (desc) {
    const firstCue = creatorCuePills[0] || '';
    const isPerson = isLikelyPersonSubject(firstCue);
    if (creatorCharacterRepresentation === 'exact') {
      desc.textContent = 'Exact unedited photo will be used directly as the primary poster image.';
    } else if (isPerson) {
      desc.textContent = 'Face features will guide AI to generate an artistic lookalike portrait with mystery.';
    } else {
      desc.textContent = 'Subject will guide AI to generate a cinematic architectural/editorial poster illustration.';
    }
  }

  if (creatorReferenceImageBase64) {
    if (activeCard) activeCard.style.display = 'flex';
    if (emptyCard) emptyCard.style.display = 'none';
    if (thumb) thumb.src = creatorReferenceImageBase64;
    if (title) title.textContent = creatorReferenceImageSourceLabel || (creatorCharacterRepresentation === 'exact' ? 'Exact Photo Attached' : 'Reference Photo Ready');
  } else {
    if (activeCard) activeCard.style.display = 'none';
    if (emptyCard) emptyCard.style.display = 'block';
    if (cameraBtn) cameraBtn.style.display = isMobileDevice() ? 'inline-flex' : 'none';
  }
}

function selectCharacterRepresentation(type) {
  creatorCharacterRepresentation = type;
  const optReal = document.getElementById('repOptionRealistic');
  const optSil = document.getElementById('repOptionSilhouette');
  const optLik = document.getElementById('repOptionLikeness');
  const optExact = document.getElementById('repOptionExact');

  if (optReal) optReal.classList.toggle('active', type === 'realistic');
  if (optSil) optSil.classList.toggle('active', type === 'silhouette');
  if (optLik) optLik.classList.toggle('active', type === 'likeness');
  if (optExact) optExact.classList.toggle('active', type === 'exact');

  if (type === 'likeness' || type === 'exact') {
    // If no reference photo is explicitly set yet, auto-extract from sources:
    if (!creatorReferenceImageBase64 && creatorSelectedImageBase64) {
      creatorReferenceImageBase64 = creatorSelectedImageBase64;
      creatorReferenceImageMimeType = creatorSelectedImageMimeType || 'image/jpeg';
      creatorReferenceImageSourceLabel = 'Print Clipping Photo';
    } else if (currentScrapedArticle && (currentScrapedArticle.imageBase64 || currentScrapedArticle.imageUrl)) {
      if (!creatorReferenceImageBase64 || creatorReferenceImageSourceLabel?.startsWith('Article Lead Photo')) {
        creatorReferenceImageBase64 = currentScrapedArticle.imageBase64 || currentScrapedArticle.imageUrl;
        creatorReferenceImageMimeType = currentScrapedArticle.imageMimeType || 'image/jpeg';
        creatorReferenceImageSourceLabel = 'Article Lead Photo (' + (currentScrapedArticle.siteName || 'Web') + ')';
      }
    }

    // Immediately condition #1 HERO cue to detected person from story/slant
    const urlInput = document.getElementById('creatorUrlInput');
    const slantTakeInput = document.getElementById('creatorSlantTakeInput');
    const url = urlInput ? urlInput.value.trim() : '';
    const slantTake = slantTakeInput ? slantTakeInput.value.trim() : '';
    const articleTitle = currentScrapedArticle?.title || extractHeadlineFromUrl(url);
    const detectedPerson = detectPersonNameInContext(articleTitle, slantTake, currentScrapedArticle?.content);

    if (detectedPerson && creatorCuePills.length > 0) {
      creatorCuePills[0] = (type === 'likeness')
        ? `${detectedPerson} Lookalike (Editorial Portrait)`
        : `${detectedPerson} (Lead Photo Focus)`;
      renderCuesDeck();
    }
  }

  updateReferencePhotoUI();
}

function handleStep2NavRight() {
  if (currentSynthesizedPost) {
    showStep3Preview();
  } else {
    startAiSynthesis();
  }
}

async function startAiSynthesis() {
  const urlInput = document.getElementById('creatorUrlInput');
  const slantTakeInput = document.getElementById('creatorSlantTakeInput');
  const sparkInput = document.getElementById('creatorSparkInput');

  const url = urlInput ? urlInput.value.trim() : '';
  const slantTake = slantTakeInput ? slantTakeInput.value.trim() : '';
  const spark = sparkInput ? sparkInput.value.trim() : '';

  // Switch to Synthesis Loading State inside Step 2
  const cuesContent = document.getElementById('cuesStudioContent');
  const synthLoading = document.getElementById('synthesisLoadingState');
  const stepText = document.getElementById('synthesisStepText');
  const fill = document.getElementById('synthesisProgressFill');

  if (cuesContent) cuesContent.style.display = 'none';
  if (synthLoading) synthLoading.style.display = 'flex';

  if (stepText) stepText.textContent = 'Reading source and extracting core tension...';
  if (fill) fill.style.width = '25%';

  const ticker1 = setTimeout(() => {
    if (stepText) stepText.textContent = 'Synthesizing 3-poster narrative (Hook → Take → Receipts)...';
    if (fill) fill.style.width = '45%';
  }, 1200);

  const ticker2 = setTimeout(() => {
    if (stepText) stepText.textContent = 'Drafting visual metaphors & editorial composition...';
    if (fill) fill.style.width = '70%';
  }, 2600);

  const ticker3 = setTimeout(() => {
    if (stepText) stepText.textContent = 'Polishing broadsheet copy, typography & color grade...';
    if (fill) fill.style.width = '88%';
  }, 4200);

  // Author handle
  let userHandle = '@curator';
  if (currentUser) {
    userHandle = '@' + (currentUser.user_metadata?.user_name || currentUser.user_metadata?.name || currentUser.email.split('@')[0]);
  }

  const isPhotoPortrayal = (creatorCharacterRepresentation === 'likeness' || creatorCharacterRepresentation === 'exact' || creatorCharacterRepresentation === 'lookalike');
  const shouldSendImage = (creatorSelectedSource === 'photo' && (creatorSelectedImageBase64 || creatorReferenceImageBase64)) ||
                          (isPhotoPortrayal && creatorReferenceImageBase64);
  const effectiveImageBase64 = shouldSendImage
    ? (creatorReferenceImageBase64 || creatorSelectedImageBase64 || null)
    : null;
  const effectiveImageMime = shouldSendImage
    ? (creatorReferenceImageMimeType || creatorSelectedImageMimeType || 'image/jpeg')
    : 'image/jpeg';

  const payload = {
    sourceType: creatorSelectedSource,
    url,
    text: slantTake,
    slantTake: slantTake,
    imageBase64: effectiveImageBase64,
    imageMimeType: effectiveImageMime,
    targetAudience: 'General Public',
    slantTone: (creatorSelectedSource === 'inner_voice' || /\b(family|child|love|heart|trip|vacation|weekend|pack|burnout|unplug|memoir|personal)\b/i.test(`${slantTake} ${spark}`)) ? 'heart' : 'mind',
    spark,
    creatorHandle: userHandle,
    cues: creatorCuePills,
    heroCue: creatorCuePills[0] || '',
    characterRepresentation: creatorCharacterRepresentation,
    refineCoreTake: creatorRefineCoreTake,
    vocabularyStyle: creatorVocabularyStyle || 'punchy',
    countryContext: creatorCountryContext?.name || 'India',
    scrapedTitle: currentScrapedArticle?.title || '',
    scrapedContent: (currentScrapedArticle?.content || '').slice(0, 3000)
  };

  const synthController = new AbortController();
  const synthTimer = setTimeout(() => synthController.abort(), 48000);

  try {
    const resp = await fetch('/api/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: synthController.signal
    });
    clearTimeout(synthTimer);

    clearTimeout(ticker1);
    clearTimeout(ticker2);
    clearTimeout(ticker3);
    clearTimeout(ticker4);

    const contentType = resp.headers.get('content-type') || '';
    if (!resp.ok) {
      let errMsg = 'AI synthesis failed';
      if (contentType.includes('application/json')) {
        const errJson = await resp.json().catch(() => null);
        if (errJson && errJson.error) errMsg = errJson.error;
      } else {
        const text = await resp.text().catch(() => '');
        if (resp.status === 504 || text.includes('504')) {
          errMsg = 'AI synthesis timed out. Please tap Synthesize again.';
        } else {
          errMsg = `Server error (${resp.status}). Please try again.`;
        }
      }
      throw new Error(errMsg);
    }

    if (!contentType.includes('application/json')) {
      const text = await resp.text().catch(() => '');
      throw new Error('Server returned an unexpected response. Please refresh and try again.');
    }

    const data = await resp.json();
    if (!data || !data.post) {
      throw new Error('Received invalid post payload from AI model');
    }

    currentSynthesizedPost = data.post;
    if (creatorSelectedSource === 'photo' && (creatorSelectedImageBase64 || creatorReferenceImageBase64)) {
      currentSynthesizedPost.sourceType = 'photo';
      currentSynthesizedPost.originalPhotoBase64 = creatorSelectedImageBase64 || creatorReferenceImageBase64;
      currentSynthesizedPost.hasPaperCut = true;
    }
    if (fill) fill.style.width = '100%';

    setTimeout(() => {
      showStep3Preview();
    }, 400);

  } catch (err) {
    clearTimeout(synthTimer);
    clearTimeout(ticker1);
    clearTimeout(ticker2);
    clearTimeout(ticker3);
    clearTimeout(ticker4);
    const isTimeout = (err.name === 'AbortError' || err.message === 'Failed to fetch' || (err.message && (err.message.includes('fetch') || err.message.includes('timed out') || err.message.includes('timeout'))));
    const friendlyMsg = isTimeout
      ? 'The synthesis connection timed out. Tap Synthesize again to complete your posters.'
      : err.message;
    alert('AI Synthesis: ' + friendlyMsg);
    if (cuesContent) cuesContent.style.display = 'flex';
    if (synthLoading) synthLoading.style.display = 'none';
    const synthBtn = document.getElementById('step2SynthBtn');
    if (synthBtn) synthBtn.disabled = false;
  }
}

let isArtworkEnhancing = false;
async function enhancePosterArtworkInBackground(post) {
  if (!post || post.illustrationBase64 || !post.illustrationPrompt || isArtworkEnhancing) return;
  isArtworkEnhancing = true;

  try {
    const resp = await fetch('/api/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'artwork_only',
        prompt: post.illustrationPrompt,
        imageBase64: (creatorCharacterRepresentation === 'likeness' || creatorCharacterRepresentation === 'lookalike') ? (creatorReferenceImageBase64 || null) : null,
        imageMimeType: creatorReferenceImageMimeType || 'image/jpeg'
      })
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data && data.success && data.illustrationBase64) {
        post.illustrationBase64 = data.illustrationBase64;
        post.artworkPending = false;
        if (currentSynthesizedPost && currentSynthesizedPost.id === post.id) {
          currentSynthesizedPost.illustrationBase64 = data.illustrationBase64;
          currentSynthesizedPost.artworkPending = false;
          renderCreatorPreview();
          showTemporaryToast('✨ AI Editorial Artwork successfully rendered!');
        }
      }
    }
  } catch (err) {
    console.info('Background artwork enhancement complete or skipped:', err.message);
  } finally {
    isArtworkEnhancing = false;
  }
}

function showStep3Preview() {
  const s2 = document.getElementById('creatorStep2');
  const s3 = document.getElementById('creatorStep3');
  const d2 = document.getElementById('stepDot2');
  const d3 = document.getElementById('stepDot3');

  if (s2) s2.style.display = 'none';
  if (s3) s3.style.display = 'flex';
  if (d2) { d2.className = 'creator-step-dot completed'; }
  if (d3) { d3.className = 'creator-step-dot active'; }

  // Reset action toolbar states
  const dlBtn = document.getElementById('step3DownloadBtn');
  const dlLbl = document.getElementById('step3DownloadLabel');
  if (dlBtn) dlBtn.classList.remove('active');
  if (dlLbl) dlLbl.textContent = 'Download';

  const saveBtn = document.getElementById('step3SaveBtn');
  const saveLbl = document.getElementById('step3SaveLabel');
  if (saveBtn) saveBtn.classList.remove('active');
  if (saveLbl) saveLbl.textContent = 'Save';

  // Update Tab 3 text and icon dynamically based on source anchor
  const prevTab2 = document.getElementById('prevTab2');
  if (prevTab2) {
    if (creatorSelectedSource === 'inner_voice') {
      prevTab2.innerHTML = '<span>💭</span> Poster 3: Inner Voice';
    } else if (creatorSelectedSource === 'photo') {
      prevTab2.innerHTML = '<span>📰</span> Poster 3: Receipts';
    } else {
      prevTab2.innerHTML = '<span>🌐</span> Poster 3: Web Receipts';
    }
  }

  // Render preview
  renderCreatorPreview();

  // If AI artwork was not included in first phase, upgrade in background without blocking user
  if (currentSynthesizedPost && !currentSynthesizedPost.illustrationBase64 && currentSynthesizedPost.illustrationPrompt) {
    enhancePosterArtworkInBackground(currentSynthesizedPost);
  }
}

function renderCreatorPreview() {
  const wrapper = document.getElementById('creatorCardPreviewWrapper');
  if (!wrapper || !currentSynthesizedPost) return;

  wrapper.innerHTML = '';
  // Pass index as 'preview'
  const card = createPostCardElement(currentSynthesizedPost, 'preview');
  wrapper.appendChild(card);

  // Set to current slide
  switchPreviewSlide(0);

  // Enable gesture swiping and mouse drag on preview card
  setupCarouselGestures('preview');
}

function setPreviewArtworkSource(source) {
  if (!currentSynthesizedPost) return;
  const pillExact = document.getElementById('editArtPillExact');
  const pillLik = document.getElementById('editArtPillLikeness');
  const pillMet = document.getElementById('editArtPillMetaphor');

  if (source === 'exact' && currentSynthesizedPost.referencePhotoUrl) {
    currentSynthesizedPost.illustrationUrl = currentSynthesizedPost.referencePhotoUrl;
    if (pillExact) pillExact.classList.add('active');
    if (pillLik) pillLik.classList.remove('active');
    if (pillMet) pillMet.classList.remove('active');
  } else if (source === 'likeness') {
    currentSynthesizedPost.illustrationUrl = currentSynthesizedPost.aiIllustrationUrl || currentSynthesizedPost.illustrationUrl;
    if (pillExact) pillExact.classList.remove('active');
    if (pillLik) pillLik.classList.add('active');
    if (pillMet) pillMet.classList.remove('active');
  } else if (source === 'metaphor' && currentSynthesizedPost.aiIllustrationUrl) {
    currentSynthesizedPost.illustrationUrl = currentSynthesizedPost.aiIllustrationUrl;
    if (pillExact) pillExact.classList.remove('active');
    if (pillLik) pillLik.classList.remove('active');
    if (pillMet) pillMet.classList.add('active');
  }

  // Update image in preview card DOM
  const bgImgs = document.querySelectorAll('#carousel-preview img.slide-hook-bg');
  bgImgs.forEach(bgImg => {
    if (currentSynthesizedPost.illustrationUrl) {
      bgImg.style.display = 'block';
      bgImg.style.opacity = '1';
      bgImg.src = currentSynthesizedPost.illustrationUrl;
    }
  });
}

function switchPreviewSlide(slideIdx) {
  currentPreviewSlide = slideIdx;
  goToSlide(null, 'preview', slideIdx);

  document.querySelectorAll('.preview-tab').forEach((tab, idx) => {
    tab.classList.toggle('active', idx === slideIdx);
  });
}

// --- Step 3 Toolbar Actions (Matches Flutter create_postcard_screen.dart:3417-3490) ---

function handleStep3Regenerate() {
  // 1. Regenerate: Return to Step 2 Visual Cues Studio to tweak cues and regenerate
  goToVisualCuesStep();
}

function openEditPosterModal(initialTab = null) {
  if (!currentSynthesizedPost) return;

  const tabToOpen = (typeof initialTab === 'number') ? initialTab : (currentPreviewSlide || 0);
  switchEditModalTab(tabToOpen);

  const catInput = document.getElementById('editModalCategory');
  const pubInput = document.getElementById('editModalPublication');
  const headInput = document.getElementById('editModalHeadline');
  const excerptInput = document.getElementById('editModalNewsExcerpt');
  const handleInput = document.getElementById('editModalHandle');
  const s2TitleInput = document.getElementById('editModalS2Title');
  const opinionInput = document.getElementById('editModalOpinion');
  const whyInput = document.getElementById('editModalWhyItMatters');
  const metricInput = document.getElementById('editModalMetric');

  if (catInput) catInput.value = currentSynthesizedPost.categoryBadge || 'OPINION';
  if (pubInput) pubInput.value = currentSynthesizedPost.publicationName || currentSynthesizedPost.sourcePublication || currentSynthesizedPost.sourceDomain || '';
  if (headInput) headInput.value = currentSynthesizedPost.adaptedHeadline || '';
  if (excerptInput) excerptInput.value = currentSynthesizedPost.originalHeadline || currentSynthesizedPost.newsprintExcerpt || currentSynthesizedPost.hook || '';
  if (handleInput) handleInput.value = currentSynthesizedPost.creatorHandle || '@curator';
  if (s2TitleInput) s2TitleInput.value = currentSynthesizedPost.critiqueBadge || (currentSynthesizedPost.keyTakeaways && currentSynthesizedPost.keyTakeaways[0] ? currentSynthesizedPost.keyTakeaways[0].toUpperCase() : 'THE CRITICAL PERSPECTIVE');
  if (opinionInput) opinionInput.value = currentSynthesizedPost.creatorOpinion || currentSynthesizedPost.curatorTake || '';
  if (whyInput) whyInput.value = currentSynthesizedPost.whyItMatters || '';
  if (metricInput) metricInput.value = currentSynthesizedPost.keyMetric || '';

  // Poster 1 Artwork source toggle
  const artRow = document.getElementById('editModalArtworkToggleRow');
  if (artRow) {
    const hasPhoto = !!(currentSynthesizedPost.referencePhotoUrl);
    artRow.style.display = hasPhoto ? 'block' : 'none';
    const isUsingExact = (currentSynthesizedPost.illustrationUrl === currentSynthesizedPost.referencePhotoUrl);
    const pillExact = document.getElementById('editArtPillExact');
    const pillLik = document.getElementById('editArtPillLikeness');
    const pillMet = document.getElementById('editArtPillMetaphor');
    if (pillExact) pillExact.classList.toggle('active', isUsingExact);
    if (pillLik) pillLik.classList.toggle('active', !isUsingExact && currentSynthesizedPost.characterRepresentation === 'likeness');
    if (pillMet) pillMet.classList.toggle('active', !isUsingExact && currentSynthesizedPost.characterRepresentation !== 'likeness');
  }

  // Tab 2 (Slide 3) Setup
  const editTab2 = document.getElementById('editTab2');
  const isInnerVoice = (creatorSelectedSource === 'inner_voice');
  if (editTab2) {
    editTab2.textContent = isInnerVoice ? 'Slide 3: Inner Voice ✏️' : 'Slide 3: Receipts 🔒';
  }

  const receiptsCard = document.getElementById('editReceiptsImmutableCard');
  const innerVoiceBlock = document.getElementById('editInnerVoiceBlock');

  if (isInnerVoice) {
    if (receiptsCard) receiptsCard.style.display = 'none';
    if (innerVoiceBlock) innerVoiceBlock.style.display = 'block';

    const s3Head = document.getElementById('editModalS3Headline');
    const s3Quote = document.getElementById('editModalS3Quote');
    const s3Obs = document.getElementById('editModalS3Observation');
    const s3Ref = document.getElementById('editModalS3Reflection');

    if (s3Head) s3Head.value = currentSynthesizedPost.broadsheetHeadline || currentSynthesizedPost.adaptedHeadline || '';
    if (s3Quote) s3Quote.value = currentSynthesizedPost.broadsheetHighlight || currentSynthesizedPost.creatorOpinion || '';
    if (s3Obs) s3Obs.value = currentSynthesizedPost.broadsheetObservation || '';
    if (s3Ref) s3Ref.value = currentSynthesizedPost.broadsheetReflection || '';
  } else {
    if (receiptsCard) receiptsCard.style.display = 'block';
    if (innerVoiceBlock) innerVoiceBlock.style.display = 'none';

    const mastEl = document.getElementById('editReceiptsMasthead');
    const headEl = document.getElementById('editReceiptsHeadline');
    const quoteEl = document.getElementById('editReceiptsQuotes');

    if (mastEl) mastEl.textContent = `Masthead: ${currentSynthesizedPost.publicationName || currentSynthesizedPost.sourcePublication || currentSynthesizedPost.sourceDomain || 'Source Outlet'}`;
    if (headEl) headEl.textContent = `Headline: ${currentSynthesizedPost.originalHeadline || currentSynthesizedPost.originalTitle || currentSynthesizedPost.adaptedHeadline || ''}`;
    if (quoteEl) quoteEl.textContent = currentSynthesizedPost.receiptHighlightQuote ? `• "${currentSynthesizedPost.receiptHighlightQuote}"` : (currentSynthesizedPost.newsprintExcerpt ? `• "${currentSynthesizedPost.newsprintExcerpt}"` : '');
  }

  const modal = document.getElementById('editPosterModal');
  if (modal) {
    modal.classList.add('open');
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
}

function closeEditPosterModal() {
  const modal = document.getElementById('editPosterModal');
  if (modal) {
    modal.classList.remove('open');
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
}

function switchEditModalTab(tabIdx) {
  for (let i = 0; i < 3; i++) {
    const tabBtn = document.getElementById(`editTab${i}`);
    const tabPane = document.getElementById(`editTabPane${i}`);
    if (tabBtn) tabBtn.classList.toggle('active', i === tabIdx);
    if (tabPane) tabPane.style.display = (i === tabIdx) ? 'flex' : 'none';
  }
}

function saveEditedSlideContent() {
  if (!currentSynthesizedPost) return;

  const catInput = document.getElementById('editModalCategory');
  const pubInput = document.getElementById('editModalPublication');
  const headInput = document.getElementById('editModalHeadline');
  const excerptInput = document.getElementById('editModalNewsExcerpt');
  const handleInput = document.getElementById('editModalHandle');
  const s2TitleInput = document.getElementById('editModalS2Title');
  const opinionInput = document.getElementById('editModalOpinion');
  const whyInput = document.getElementById('editModalWhyItMatters');
  const metricInput = document.getElementById('editModalMetric');

  if (catInput && catInput.value.trim()) currentSynthesizedPost.categoryBadge = catInput.value.trim().toUpperCase();
  if (pubInput && pubInput.value.trim()) {
    currentSynthesizedPost.publicationName = pubInput.value.trim();
    currentSynthesizedPost.sourcePublication = pubInput.value.trim();
  }
  if (headInput && headInput.value.trim()) currentSynthesizedPost.adaptedHeadline = headInput.value.trim();
  if (excerptInput && excerptInput.value.trim()) {
    currentSynthesizedPost.originalHeadline = excerptInput.value.trim();
    currentSynthesizedPost.newsprintExcerpt = excerptInput.value.trim();
    currentSynthesizedPost.hook = excerptInput.value.trim();
  }
  if (handleInput && handleInput.value.trim()) currentSynthesizedPost.creatorHandle = handleInput.value.trim();
  if (s2TitleInput && s2TitleInput.value.trim()) {
    currentSynthesizedPost.critiqueBadge = s2TitleInput.value.trim();
    currentSynthesizedPost.keyTakeaways = currentSynthesizedPost.keyTakeaways || [];
    currentSynthesizedPost.keyTakeaways[0] = s2TitleInput.value.trim();
  }
  if (opinionInput && opinionInput.value.trim()) {
    currentSynthesizedPost.creatorOpinion = opinionInput.value.trim();
    currentSynthesizedPost.curatorTake = opinionInput.value.trim();
  }
  if (whyInput && whyInput.value.trim()) currentSynthesizedPost.whyItMatters = whyInput.value.trim();
  if (metricInput && metricInput.value.trim()) currentSynthesizedPost.keyMetric = metricInput.value.trim();

  if (creatorSelectedSource === 'inner_voice') {
    const s3Head = document.getElementById('editModalS3Headline');
    const s3Quote = document.getElementById('editModalS3Quote');
    const s3Obs = document.getElementById('editModalS3Observation');
    const s3Ref = document.getElementById('editModalS3Reflection');
    if (s3Head && s3Head.value.trim()) currentSynthesizedPost.broadsheetHeadline = s3Head.value.trim();
    if (s3Quote && s3Quote.value.trim()) currentSynthesizedPost.broadsheetHighlight = s3Quote.value.trim();
    if (s3Obs && s3Obs.value.trim()) currentSynthesizedPost.broadsheetObservation = s3Obs.value.trim();
    if (s3Ref && s3Ref.value.trim()) currentSynthesizedPost.broadsheetReflection = s3Ref.value.trim();
  }

  // Re-render preview with edited values
  renderCreatorPreview();
  // Return to preview slide that matches what was edited or current
  switchPreviewSlide(currentPreviewSlide);

  closeEditPosterModal();
  showTemporaryToast('✏️ Poster updated with edits!');
}

async function handleStep3Share() {
  if (!currentSynthesizedPost) return;
  const shareData = {
    title: currentSynthesizedPost.adaptedHeadline || 'Slant Editorial Carousel',
    text: `${currentSynthesizedPost.creatorHandle || '@curator'}: "${currentSynthesizedPost.creatorOpinion || currentSynthesizedPost.adaptedHeadline}"`,
    url: window.location.origin
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch (err) {
      if (err.name !== 'AbortError') {
        copyShareUrlFallback();
      }
    }
  } else {
    copyShareUrlFallback();
  }
}

function copyShareUrlFallback() {
  if (navigator.clipboard && window.location.origin) {
    navigator.clipboard.writeText(window.location.origin).then(() => {
      showTemporaryToast('📋 Share link copied to clipboard!');
    }).catch(() => {
      showTemporaryToast('📋 Link: ' + window.location.origin);
    });
  } else {
    showTemporaryToast('📋 Link: ' + window.location.origin);
  }
}

function handleStep3Download() {
  if (!currentSynthesizedPost) return;
  const dlBtn = document.getElementById('step3DownloadBtn');
  const dlLbl = document.getElementById('step3DownloadLabel');

  const imgUrl = currentSynthesizedPost.illustrationUrl || currentSynthesizedPost.imageUrl;
  if (imgUrl) {
    const a = document.createElement('a');
    a.href = imgUrl;
    const slug = (currentSynthesizedPost.categoryBadge || 'slant').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    a.download = `${slug}-poster-slide${currentPreviewSlide + 1}.png`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    if (dlBtn) dlBtn.classList.add('active');
    if (dlLbl) dlLbl.textContent = 'Downloaded';
    showTemporaryToast('📥 Poster downloaded to your device!');
  } else {
    showTemporaryToast('📥 Poster ready for export!');
  }
}

async function publishSynthesizedPost() {
  if (!currentSynthesizedPost) return;

  const publishBtn = document.getElementById('publishBtn');
  if (publishBtn) {
    publishBtn.disabled = true;
    publishBtn.innerHTML = '<span>Publishing to Live Feed... ⏳</span>';
  }

  // Final values from inputs or currentSynthesizedPost
  const headline = document.getElementById('editModalHeadline')?.value?.trim() || currentSynthesizedPost.adaptedHeadline;
  const category = document.getElementById('editModalCategory')?.value?.trim() || currentSynthesizedPost.categoryBadge;
  const handle = document.getElementById('editModalHandle')?.value?.trim() || currentSynthesizedPost.creatorHandle;
  const opinion = document.getElementById('editModalOpinion')?.value?.trim() || currentSynthesizedPost.creatorOpinion;

  if (headline) currentSynthesizedPost.adaptedHeadline = headline;
  if (category) currentSynthesizedPost.categoryBadge = category.toUpperCase();
  if (handle) currentSynthesizedPost.creatorHandle = handle;
  if (opinion) currentSynthesizedPost.creatorOpinion = opinion;

  if (currentUser) {
    currentSynthesizedPost.user_id = currentUser.id;
    currentSynthesizedPost.userEmail = currentUser.email;
  }
  currentSynthesizedPost.createdAt = new Date().toISOString();
  currentSynthesizedPost.isUserCreated = true;

  // 1. Clean payload: remove redundant duplicate multi-megabyte image strings
  const postToSave = { ...currentSynthesizedPost };
  if (currentSynthesizedPost.originalPhotoBase64) {
    postToSave.originalPhotoBase64 = currentSynthesizedPost.originalPhotoBase64;
    postToSave.hasPaperCut = true;
  }
  if (currentSynthesizedPost.sourceType === 'photo') {
    postToSave.sourceType = 'photo';
    postToSave.hasPaperCut = true;
  }
  if (postToSave.illustrationBase64) {
    if (postToSave.illustrationUrl && postToSave.illustrationUrl.startsWith('data:')) {
      postToSave.illustrationUrl = '';
    }
    if (postToSave.aiIllustrationUrl && postToSave.aiIllustrationUrl.startsWith('data:')) {
      postToSave.aiIllustrationUrl = '';
    }
  }

  // 2. Primary cloud save: POST to /api/posts
  let savedToCloud = false;
  try {
    const resp = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postToSave)
    });

    if (resp.ok) {
      savedToCloud = true;
    } else {
      console.warn('Backend /api/posts returned status:', resp.status);
    }
  } catch (err) {
    console.warn('Backend publish call error:', err);
  }

  // 3. Resilient fallback: Direct Supabase write if /api/posts failed or was bypassed
  if (!savedToCloud) {
    try {
      const supaResp = await fetch(`${SUPABASE_URL}/rest/v1/posts`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({ id: postToSave.id, data: postToSave })
      });
      if (supaResp.ok) {
        savedToCloud = true;
      } else {
        console.warn('Direct Supabase write status:', supaResp.status);
      }
    } catch (supaErr) {
      console.error('Direct Supabase write error:', supaErr);
    }
  }

  // 4. Local storage persistent backup: Save full post objects so stories NEVER vanish across reloads/sign-ins
  try {
    const localPosts = JSON.parse(localStorage.getItem('slant_user_posts_cache') || '[]');
    const filtered = localPosts.filter(p => p && p.id !== currentSynthesizedPost.id);
    filtered.unshift(currentSynthesizedPost);
    try {
      localStorage.setItem('slant_user_posts_cache', JSON.stringify(filtered.slice(0, 25)));
    } catch (quotaErr) {
      // If quota exceeded due to large base64 strings, save lightweight copies
      const lightweight = filtered.map(p => {
        if (p.illustrationBase64 && p.illustrationBase64.length > 50000) {
          const { illustrationBase64, ...rest } = p;
          return rest;
        }
        return p;
      });
      localStorage.setItem('slant_user_posts_cache', JSON.stringify(lightweight.slice(0, 25)));
    }
  } catch (lsErr) {
    console.warn('Could not cache user post to localStorage:', lsErr);
  }

  // 5. Track in local storage ID set & sync with cloud profile
  myCreatedPostIds.add(currentSynthesizedPost.id);
  localStorage.setItem('slant_my_posts', JSON.stringify(Array.from(myCreatedPostIds)));
  syncUserMetadataToCloud();

  // Update Step 3 Save button state
  const saveBtn = document.getElementById('step3SaveBtn');
  const saveLbl = document.getElementById('step3SaveLabel');
  if (saveBtn) saveBtn.classList.add('active');
  if (saveLbl) saveLbl.textContent = 'Saved';

  // 6. Merge & sort chronologically, then render feed
  mergeAndSortPosts([currentSynthesizedPost]);
  updateBadge(true, `Live Feed (${allPosts.length} posts)`);
  updateAuthUI();
  renderFeed();

  // 7. Close modal & show toast
  closeCreatorModal();
  showTemporaryToast('✨ Published! Your 3-poster Slant is live on slant.today');

  // Scroll smoothly to top so user sees their new post
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (publishBtn) {
    publishBtn.disabled = false;
    publishBtn.innerHTML = '<span>Publish to slant.today 🚀</span>';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
