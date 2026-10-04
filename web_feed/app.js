let allPosts = [];
let currentFilter = 'all';
let searchQuery = '';
let activePostIndex = null;

// ============================================================
// READING ATMOSPHERE CONTROLLER (Daylight Paper / Obsidian / Auto)
// ============================================================
let currentAtmospherePref = localStorage.getItem('slant_atmosphere_mode') || localStorage.getItem('editour_atmosphere_mode') || 'auto';

function getEffectiveAtmosphere(pref) {
  if (pref === 'daylight') return 'daylight';
  if (pref === 'obsidian') return 'obsidian';
  // Auto: Daylight between 6 AM and 6 PM, Obsidian at night
  const hour = new Date().getHours();
  return (hour >= 6 && hour < 18) ? 'daylight' : 'obsidian';
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
      iconEl.title = 'Daylight Paper Mode (Click to change)';
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

const SUPABASE_URL = 'https://karnxbsmvnkydcfydrcf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_n90rXQfEukf2gdisKe_jGg_Cybk2r-m';

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
      renderFeed();
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
  if (currentUser && Array.isArray(allPosts)) {
    const userEmail = (currentUser.email || '').toLowerCase();
    const userHandle = (currentUser.user_metadata?.user_name || currentUser.user_metadata?.name || userEmail.split('@')[0] || '').toLowerCase().replace('@', '');
    myPostsCount = allPosts.filter(p => {
      const postAuthor = (p.creatorHandle || '').toLowerCase().replace('@', '');
      const postUserId = p.user_id || p.userId;
      return (postUserId && postUserId === currentUser.id) || (userHandle && postAuthor && postAuthor === userHandle);
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
    if (pillMyStories) pillMyStories.style.display = 'none';

    // Update Drawer Account UI for guest
    const drawerAuthGuest = document.getElementById('drawerAuthGuest');
    const drawerAuthUser = document.getElementById('drawerAuthUser');
    if (drawerAuthGuest) drawerAuthGuest.style.display = 'flex';
    if (drawerAuthUser) drawerAuthUser.style.display = 'none';
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
      submitBtn.innerHTML = '<span>Send Magic Link &rarr;</span>';
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

async function loadPosts() {
  // 1. Instant Cache-First: Load pre-built lightweight slant_feed.json (140 KB, renders in ~20ms!)
  let loadedFromCache = false;
  try {
    const fastResp = await fetch('slant_feed.json');
    if (fastResp.ok) {
      const posts = await fastResp.json();
      if (Array.isArray(posts) && posts.length > 0) {
        allPosts = posts.filter(p => p && !p.deleted && !p.isDeleted && (p.adaptedHeadline || p.originalHeadline || p.summary));
        updateBadge(true, `Live Feed (${allPosts.length} posts)`);
        updateAuthUI();
        renderFeed();
        loadedFromCache = true;
      }
    }
  } catch (e) {
    console.warn('Could not load slant_feed.json, trying live Supabase:', e);
  }

  // 2. Asynchronously check Supabase in background for any new posts published from mobile/web
  checkLiveSupabaseUpdates(!loadedFromCache);
}

async function checkLiveSupabaseUpdates(forceRender = false) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500); // 4.5s safe timeout so it never hangs

    const resp = await fetch(`${SUPABASE_URL}/rest/v1/posts?select=*&order=created_at.desc&limit=15`, {
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
        const livePosts = rows.map(r => r.data || r).filter(p => p && !p.deleted && !p.isDeleted && (p.adaptedHeadline || p.originalHeadline || p.summary));
        const existingIds = new Set(allPosts.map(p => p.id));
        let newCount = 0;
        for (const lp of livePosts) {
          if (!existingIds.has(lp.id)) {
            allPosts.unshift(lp);
            existingIds.add(lp.id);
            newCount++;
          }
        }
        if (newCount > 0 || forceRender) {
          updateBadge(true, `Live Feed (${allPosts.length} posts)`);
          updateAuthUI();
          renderFeed();
        }
        return;
      }
    }
  } catch (err) {
    console.info('Supabase background sync completed or timed out.');
  }

  // 3. Fallback to /api/posts if nothing loaded yet
  if (!allPosts || allPosts.length === 0) {
    try {
      const resp = await fetch('/api/posts');
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.posts && data.posts.length > 0) {
          allPosts = data.posts;
          updateBadge(true, `Live Feed (${allPosts.length} posts)`);
          updateAuthUI();
          renderFeed();
        }
      }
    } catch (_) {}
  }
}

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
    }
  }
}

function renderFeed() {
  const container = document.getElementById('feedContainer');
  container.innerHTML = '';

  const filtered = allPosts.filter(post => {
    if (currentFilter === 'saved') {
      return savedPostIds.has(post.id);
    }

    if (currentFilter === 'my_stories') {
      if (!currentUser) return false;
      const userEmail = (currentUser.email || '').toLowerCase();
      const userHandle = (currentUser.user_metadata?.user_name || currentUser.user_metadata?.name || userEmail.split('@')[0] || '').toLowerCase().replace('@', '');
      const postAuthor = (post.creatorHandle || '').toLowerCase().replace('@', '');
      const postUserId = post.user_id || post.userId;
      return (postUserId && postUserId === currentUser.id) || (userHandle && postAuthor && postAuthor === userHandle);
    }

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
  // Tier 3: My Slant / Personal Opinion
  if (post.sourceType === 'my_slant' || post.sourceType === 'opinion' || post.categoryBadge === 'OPINION' || post.categoryBadge === 'MY SLANT') {
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
  const slantIcon = post.slantIcon || (post.slantTone === 'heart' ? '❤️' : '💭');

  let sourceLabel = pubName;
  if (tier === 'tier2_web') {
    sourceLabel = cleanHost || 'Web Commentary';
  } else if (tier === 'tier3_opinion') {
    sourceLabel = 'Personal Slant';
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

  let bgHtml = '';
  if (post.illustrationUrl) {
    bgHtml = `<img class="slide-hook-bg" src="${escapeHtml(post.illustrationUrl)}" alt="${headline}" loading="lazy">`;
  } else if (post.illustrationBase64) {
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

  // Tactile Ripped Newspaper Clipping Fragment (Actual News Excerpt / Headline)
  const rawNews = (post.originalHeadline && post.originalHeadline.trim().length > 0 && post.originalHeadline.trim() !== (post.adaptedHeadline || '').trim())
    ? post.originalHeadline.trim()
    : ((post.hook && post.hook.trim().length > 0 && post.hook.trim() !== headline)
        ? post.hook.trim()
        : '');

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

  return `
    ${bgHtml}
    <div class="slide-hook-top-scrim"></div>
    <div class="slide-hook-bottom-scrim"></div>
    <div class="slide-hook-content">
      <div class="slide-hook-top" style="justify-content: space-between; width: 100%;">
        <div style="padding: 4px 10px; background: rgba(0,0,0,0.75); border: 1px solid rgba(255,255,255,0.25); border-radius: 20px; display: inline-flex; align-items: center; gap: 6px;">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: #6366F1; display: inline-block;"></span>
          <span style="font-size: 9.5px; font-weight: 800; color: #818CF8; letter-spacing: 0.8px;">${catBadge}</span>
          <span style="font-size: 9.5px; font-weight: 700; color: #FFF;">• ${sourceLabel}</span>
        </div>
        <span class="slide-page-badge" style="background:rgba(0,0,0,0.75); border:1px solid rgba(255,255,255,0.25); border-radius:20px; padding:3px 9px; font-size:9.5px; color:#FFF; font-weight:800; letter-spacing:0.5px;">01 / 03</span>
      </div>
      <div class="slide-hook-bottom">
        ${newsFragmentHtml}
        <h3 class="slide-hook-headline">${headline}</h3>
      </div>
    </div>
  `;
}

function buildSlide2Html(post, index) {
  const handle = escapeHtml(post.creatorHandle || '@curator');
  const initial = handle.replace('@', '').charAt(0).toUpperCase() || 'C';
  const pubName = escapeHtml(post.publicationName || 'Press Wire');
  const tier = getSourceTier(post);
  const slantIcon = post.slantIcon || (post.slantTone === 'heart' ? '❤️' : '💭');

  let verdictBadgeLabel = `⚡ CURATOR'S TAKE • ${pubName}`;
  let nextSlideLabel = 'THE RECEIPTS &rarr;';

  if (tier === 'tier2_web') {
    verdictBadgeLabel = `⚡ CURATOR'S TAKE • WEB COMMENTARY`;
    nextSlideLabel = 'WEB SOURCE &rarr;';
  } else if (tier === 'tier3_opinion') {
    verdictBadgeLabel = `${slantIcon} THE CORE TAKE • PERSONAL PERSPECTIVE`;
    nextSlideLabel = 'MY SLANT &rarr;';
  } else if (tier === 'tier_book') {
    verdictBadgeLabel = `📖 LITERARY REFLECTION`;
    nextSlideLabel = 'EXCERPT &rarr;';
  }

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

  let rawRationale = (post.whyItMatters && post.whyItMatters.trim() && post.whyItMatters.trim() !== rawOpinion.trim())
    ? post.whyItMatters.trim()
    : '';
  if (rawRationale && !rawRationale.endsWith('.') && !rawRationale.endsWith('!') && !rawRationale.endsWith('?')) {
    rawRationale += '.';
  }
  const whyItMatters = rawRationale ? escapeHtml(rawRationale) : '';

  const slideTitle = post.keyTakeaways && post.keyTakeaways.length > 0 && post.keyTakeaways[0].split(' ').length <= 12
    ? escapeHtml(post.keyTakeaways[0].toUpperCase())
    : "THE CRITICAL PERSPECTIVE";

  let bgHtml = '';
  if (post.illustrationUrl) {
    bgHtml = `<img class="slide-hook-bg" src="${escapeHtml(post.illustrationUrl)}" alt="${slideTitle}" loading="lazy">`;
  } else if (post.illustrationBase64) {
    bgHtml = `<img class="slide-hook-bg" src="data:image/jpeg;base64,${post.illustrationBase64}" alt="${slideTitle}" loading="lazy">`;
  } else {
    bgHtml = `
      <div class="slide-hook-bg" style="background: radial-gradient(circle at 50% 28%, #1e1b4b 0%, #0f172a 60%, #030712 100%);">
        <div style="position:absolute; inset:0; opacity:0.18; background-image: radial-gradient(#818cf8 1px, transparent 1px); background-size: 20px 20px;"></div>
      </div>
    `;
  }

  return `
    ${bgHtml}
    <div class="slide-hook-top-scrim"></div>
    <div class="slide-hook-bottom-scrim" style="height: 54%; background: linear-gradient(to bottom, transparent 0%, rgba(7,11,18,0.85) 35%, rgba(7,11,18,0.98) 100%);"></div>
    <div class="slide-hook-content" style="justify-content: space-between;">
      <div class="slide-hook-top" style="justify-content: space-between; width: 100%;">
        <span class="critique-verdict-badge" style="font-size:9.5px; padding:4px 10px; background:rgba(0,0,0,0.75); border:1px solid rgba(245,158,11,0.4); border-radius:20px; color:#F59E0B; font-weight:800;">${verdictBadgeLabel}</span>
        <span class="slide-page-badge" style="background:rgba(0,0,0,0.75); border:1px solid rgba(255,255,255,0.25); border-radius:20px; padding:3px 9px; font-size:9.5px; color:#FFF; font-weight:800;">02 / 03</span>
      </div>
      <div class="slide-hook-bottom" style="gap:6px;">
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="width:6px; height:6px; border-radius:50%; background:#F59E0B; display:inline-block;"></span>
          <span style="font-size:10px; font-weight:800; color:#F59E0B; letter-spacing:0.8px;">${slideTitle}</span>
        </div>
        <p class="critique-opinion-text" style="font-size:13px; font-weight:700; color:#F8FAFC; line-height:1.35; margin:0;">${opinion}</p>
        ${whyItMatters ? `
          <div style="padding:6px 9px; background:rgba(245,158,11,0.12); border-radius:6px; border:0.8px solid rgba(245,158,11,0.35); font-size:10.5px; color:#E2E8F0; line-height:1.3;">
            <strong style="color:#F59E0B; font-size:9px; letter-spacing:0.5px;">WHY IT MATTERS: </strong>${whyItMatters}
          </div>
        ` : ''}
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:3px; padding-top:5px; border-top:1px solid rgba(255,255,255,0.1);">
          <div style="display:flex; align-items:center; gap:6px;">
            <div style="width:20px; height:20px; border-radius:50%; background:#F59E0B; color:#000; font-size:10px; font-weight:bold; display:flex; align-items:center; justify-content:center;">${initial}</div>
            <span style="font-size:11px; font-weight:600; color:#CBD5E1;">${handle}</span>
          </div>
          <span style="font-size:9.5px; font-weight:800; color:#FCA5A5; background:rgba(220,38,38,0.25); border:1px solid rgba(239,68,68,0.8); border-radius:14px; padding:3px 8px;">${nextSlideLabel}</span>
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

  const headline = escapeHtml(post.originalHeadline || post.adaptedHeadline || 'Original News Source');
  const quote = escapeHtml(post.receiptHighlightQuote || post.pullQuote || 'Primary reporting confirmed that recorded structural indicators diverged sharply from initial forecasts across core operations.');

  // Extract 3 section excerpt statements
  let excerpts = post.resolvedArticleExcerpts || post.articleExcerpts || [];
  if (!Array.isArray(excerpts) || excerpts.length === 0) {
    if (post.summary) {
      const extra = post.summary.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 20);
      excerpts = [...extra];
    }
  }
  const p1 = escapeHtml((excerpts.length > 0 && excerpts[0]) ? excerpts[0] : quote);
  const p2 = escapeHtml((excerpts.length > 1 && excerpts[1]) ? excerpts[1] : ((post.receiptHighlightQuote && post.receiptHighlightQuote !== p1) ? post.receiptHighlightQuote : quote));
  const p3 = escapeHtml((excerpts.length > 2 && excerpts[2]) ? excerpts[2] : (post.summary && post.summary !== p1 && post.summary !== p2 ? post.summary : 'Corroborating records confirmed key indicators aligned with official administrative filings.'));

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
        <div>${slantIcon} OPINION</div>
        <div>MY SLANT</div>
      </div>
    `;
    mastheadTitle = `READER'S OP-ED`;
    rulesCenter = 'COMMUNITY OP-ED & ESSAY';
    rulesLeft = 'FIRST-PERSON PERSPECTIVE';
    bylineLeft = `CONTRIBUTED BY ${handle}`;
    bylineTag = '<span class="receipts-opinion-tag">PERSONAL SLANT</span>';
    highlightIcon = slantIcon;
    highlightTitle = 'THE CORE CONVICTION';
    folioSource = 'FIRST-PERSON REFLECTION • UNVERIFIED OPINION';
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

  return `
    ${stampHtml}

    <!-- 1. Classic Broadsheet Masthead Header -->
    <div class="receipt-header">
      <div class="receipt-masthead-thick"></div>
      <div class="receipt-masthead-thin"></div>
      <div class="receipt-pub-title">${mastheadTitle}</div>
      <div class="receipt-rules">
        <span>${rulesLeft}</span>
        <span class="receipt-rules-center">${rulesCenter}</span>
        <span>SLIDE 03 / 03</span>
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

    <!-- 3. Continuous Actual Newspaper Excerpts (1:2:2:1 Spacer Distribution Matching App) -->
    <div class="receipt-paragraphs">
      <div class="receipt-spacer-top"></div>
      <p class="receipt-p1">${p1}</p>
      <div class="receipt-spacer-mid"></div>
      <div class="receipt-highlight">
        <div class="highlighter-label">
          <span>${highlightIcon}</span> ${highlightTitle}
        </div>
        <div class="highlighter-text">“${p2}”</div>
      </div>
      <div class="receipt-spacer-mid"></div>
      <p class="receipt-p3">${p3}</p>
      <div class="receipt-spacer-bottom"></div>
    </div>

    <!-- 4. Broadsheet Archival Bottom Folio -->
    <div class="receipt-footer">
      <div class="receipt-folio-rule"></div>
      <div class="receipt-folio-text">
        <span class="receipt-folio-source">${folioSource}</span>
        <span class="receipt-folio-author">${folioAuthor}</span>
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
  const slantIcon = post.slantIcon || (post.slantTone === 'heart' ? '❤️' : '💭');

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
    tab3Label = 'My Slant';
    tab3Title = 'Slide 3: My Slant (Personal Perspective)';
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
      <button class="carousel-tab-btn active" onclick="goToSlide(event, ${index}, 0)" title="Slide 1: Visual Hook">
        <span class="tab-icon">🎨</span>
        <span class="tab-text">Hook</span>
      </button>
      <button class="carousel-tab-btn" onclick="goToSlide(event, ${index}, 1)" title="Slide 2: Curator Take">
        <span class="tab-icon">⚖️</span>
        <span class="tab-text">Take</span>
      </button>
      <button class="carousel-tab-btn" onclick="goToSlide(event, ${index}, 2)" title="${escapeHtml(tab3Title)}">
        <span class="tab-icon">${tab3Icon}</span>
        <span class="tab-text">${escapeHtml(tab3Label)}</span>
      </button>
    </div>

    <div class="carousel-view ${isClean ? 'clean-view' : ''}" id="carousel-${index}" data-post-index="${index}" data-current-slide="0">
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

      <!-- Bottom Dot Indicators -->
      <div class="carousel-dots" id="dots-${index}">
        <span class="carousel-dot active" onclick="goToSlide(event, ${index}, 0)"></span>
        <span class="carousel-dot" onclick="goToSlide(event, ${index}, 1)"></span>
        <span class="carousel-dot" onclick="goToSlide(event, ${index}, 2)"></span>
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
          <div class="pub-source-badge">
            <span>${sourceBadgeIcon}</span>
            <span>${escapeHtml(sourceBadgeText)}</span>
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

        <!-- Share Poster -->
        <button class="icon-action-btn" onclick="copyCardShareLink('${post.id}')" title="Share story link">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="18" cy="5" r="3"></circle>
            <circle cx="6" cy="12" r="3"></circle>
            <circle cx="18" cy="19" r="3"></circle>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
          </svg>
        </button>

        <!-- Clean Art Toggle (Show/Hide text overlays directly on feed) -->
        <button class="icon-action-btn clean-view-btn ${isClean ? 'active' : ''}" id="clean-btn-${index}" onclick="toggleCleanView(event, ${index})" title="${isClean ? 'Show text overlays' : 'Clean artwork (hide text)'}">
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
          <span class="carousel-dot active" onclick="goToSlide(event, ${index}, 0)"></span>
          <span class="carousel-dot" onclick="goToSlide(event, ${index}, 1)"></span>
          <span class="carousel-dot" onclick="goToSlide(event, ${index}, 2)"></span>
        </div>
      </div>

      <!-- Minimalist Action Icons: Book Cover, World Web Link, Newspaper Paper Cut -->
      <div class="action-group-right">
        ${isBook ? `
          <button class="icon-action-btn" onclick="openDetailModal(${index})" title="View Book Cover & Source">
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
          <button class="icon-action-btn" onclick="openPaperCutModal(${index})" title="View Paper Cut (${escapeHtml(pubName)})">
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
      <div class="post-summary-snippet" onclick="openDetailModal(${index})" style="cursor:pointer;">
        <span class="post-creator-handle"><strong>${escapeHtml(handle)}</strong></span>
        <span class="post-caption-text">${escapeHtml(getStartingLines(summary))}</span>
        <button class="read-more-btn" onclick="event.stopPropagation(); openDetailModal(${index})">... more</button>
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
  if (!post) return;

  const imgEl = document.getElementById('paperCutImg');
  const imgWrap = document.getElementById('paperCutImgWrap');
  const archivalCard = document.getElementById('paperCutArchivalCard');

  let imgSrc = '';
  if (post.originalPhotoUrl) {
    imgSrc = post.originalPhotoUrl;
  } else if (post.originalPhotoBase64 && post.originalPhotoBase64.length > 50) {
    imgSrc = post.originalPhotoBase64.startsWith('data:') 
      ? post.originalPhotoBase64 
      : 'data:image/jpeg;base64,' + post.originalPhotoBase64;
  } else if (post.originalPhotoPath && (post.originalPhotoPath.startsWith('http') || post.originalPhotoPath.startsWith('data:'))) {
    imgSrc = post.originalPhotoPath;
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
    imgEl.onerror = () => {
      showArchivalFallback();
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
    let offset = 12;
    const batchSize = 12;
    let keepFetching = true;

    while (keepFetching) {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/posts?select=*&order=created_at.desc&limit=${batchSize}&offset=${offset}`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });
      if (!resp.ok) break;
      const rows = await resp.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        keepFetching = false;
        break;
      }

      const newPosts = rows.map(r => r.data || r).filter(p => p && !p.deleted && !p.isDeleted && (p.adaptedHeadline || p.originalHeadline || p.summary));
      if (newPosts.length === 0) {
        if (rows.length < batchSize) keepFetching = false;
        offset += batchSize;
        continue;
      }

      const existingIds = new Set(allPosts.map(p => p.id));
      let added = 0;
      for (const p of newPosts) {
        if (!existingIds.has(p.id)) {
          allPosts.push(p);
          existingIds.add(p.id);
          added++;
        }
      }

      if (added > 0) {
        updateBadge(true, `Live Feed (${allPosts.length} posts)`);
        renderFeed();
      }

      if (rows.length < batchSize) {
        keepFetching = false;
      } else {
        offset += batchSize;
      }
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
          if (payload && payload.new && payload.new.data) {
            const p = payload.new.data;
            if (!p.deleted && !p.isDeleted && (p.adaptedHeadline || p.originalHeadline || p.summary)) {
              const existingIds = new Set(allPosts.map(x => x.id));
              if (!existingIds.has(p.id)) {
                allPosts.unshift(p);
                renderFeed();
                updateBadge(true, `Live Feed (${allPosts.length} posts)`);
              }
            }
          }
        })
        .subscribe();
    } catch (e) {
      console.warn('Realtime subscription error:', e);
    }
  }

  // Refresh feed gently when user returns to tab (only if at least 2 minutes have passed)
  let lastRefreshTime = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastRefreshTime > 120000) {
      lastRefreshTime = Date.now();
      checkLiveSupabaseUpdates(false);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
