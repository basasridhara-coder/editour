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
      const isMySlant = post.isMySlant === true || type === 'my_slant' || (post.publicationName || '').toLowerCase().includes('my slant');
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
  const slantIcon = (post.slantIcon && post.slantIcon !== '💭') ? post.slantIcon : (post.slantTone === 'heart' ? '❤️' : '🧠');

  let sourceLabel = pubName;
  if (tier === 'tier2_web') {
    sourceLabel = cleanHost || 'Web Commentary';
  } else if (tier === 'tier3_opinion') {
    sourceLabel = 'My Slant';
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
  const slantIcon = (post.slantIcon && post.slantIcon !== '💭') ? post.slantIcon : (post.slantTone === 'heart' ? '❤️' : '🧠');

  let verdictBadgeLabel = `⚡ CURATOR'S TAKE • ${pubName}`;
  let nextSlideLabel = 'THE RECEIPTS &rarr;';

  if (tier === 'tier2_web') {
    verdictBadgeLabel = `⚡ CURATOR'S TAKE • WEB COMMENTARY`;
    nextSlideLabel = 'WEB SOURCE &rarr;';
  } else if (tier === 'tier3_opinion') {
    verdictBadgeLabel = `${slantIcon} FIRST-PERSON REFLECTION • MY SLANT`;
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
    : (tier === 'tier3_opinion' ? (post.slantTone === 'heart' ? 'PERSONAL REFLECTION' : 'MY CORE TAKE') : "THE CRITICAL PERSPECTIVE");

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
        <div>${slantIcon} PERSONAL TAKE</div>
        <div>MY SLANT</div>
      </div>
    `;
    mastheadTitle = `MY SLANT`;
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
  const hasPaperCut = post.sourceType === 'photo' && !!(post.originalPhotoUrl || (post.originalPhotoBase64 && post.originalPhotoBase64.length > 50) || (post.originalPhotoPath && !post.originalPhotoPath.startsWith('http') && post.originalPhotoPath !== post.digitalLink) || (post.originalPhotoPath && /\.(png|jpe?g|webp|gif)$/i.test(post.originalPhotoPath)) || post.bookCoverBase64);

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

    const newPosts = rows.map(r => r.data || r).filter(p => p && !p.deleted && !p.isDeleted && (p.adaptedHeadline || p.originalHeadline || p.summary));
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
    if (label) label.textContent = 'Your Slant / Take (Optional)';
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
    if (label) label.textContent = 'Your Slant / Take (Optional)';
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
let creatorCharacterRepresentation = 'silhouette'; // 'silhouette' | 'likeness'
let creatorLastSuggestedContextKey = '';
let draggedCueIndex = null;

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

// Fallback heuristic 6-dimension extractor matching VisualCueService.dart
function extract6RankedCueDimensions(curatorAngle, newsHeadline, newsBody) {
  let cleanHeadline = (newsHeadline || '').trim();
  if (cleanHeadline.startsWith('http://') || cleanHeadline.startsWith('https://')) {
    cleanHeadline = extractHeadlineFromUrl(cleanHeadline);
  }

  const combined = `${curatorAngle || ''} ${cleanHeadline} ${newsBody || ''}`.toLowerCase();

  // 1. HERO (Subject from headline or angle - never a URL!)
  let hero = '';
  if (combined.includes('garbage') || combined.includes('trash') || combined.includes('waste') || combined.includes('clean')) {
    hero = 'Lone Sweeper with Traditional Broom';
  } else if (combined.includes('ai') || combined.includes('tech') || combined.includes('silicon') || combined.includes('data center') || combined.includes('model') || combined.includes('compute') || combined.includes('apple') || combined.includes('phone') || combined.includes('ipad')) {
    hero = 'Monolithic Obsidian Server Tower';
  } else if (combined.includes('market') || combined.includes('invest') || combined.includes('wealth') || combined.includes('billion') || combined.includes('stock')) {
    hero = 'Silhouetted Wall Street Bull';
  } else if (combined.includes('polit') || combined.includes('elect') || combined.includes('minister') || combined.includes('leader') || combined.includes('vote')) {
    hero = 'Solitary Figure at Microphone';
  } else if (combined.includes('court') || combined.includes('judge') || combined.includes('law') || combined.includes('case')) {
    hero = 'Gavel & Broken Stone Pillar';
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
  if (combined.includes('taste') || combined.includes('craft') || combined.includes('art') || combined.includes('design')) {
    motif = 'Sculptor Chisel against Uncarved Marble';
  } else if (combined.includes('puppet') || combined.includes('control') || combined.includes('manipulat')) {
    motif = 'Tangled Marionette Puppet Strings';
  } else if (combined.includes('scale') || combined.includes('justice') || combined.includes('balance') || combined.includes('fair')) {
    motif = 'Tipping Brass Balance Scales';
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
  if (combined.includes('storm') || combined.includes('threat') || combined.includes('crisis')) {
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
    atmosphere = 'Damp Rain-Slicked City Boulevard';
  } else if (combined.includes('board') || combined.includes('exec') || combined.includes('corp')) {
    atmosphere = 'Smoke-Filled High-Rise Boardroom';
  } else if (combined.includes('cyber') || combined.includes('digital') || combined.includes('data') || combined.includes('tech')) {
    atmosphere = 'Brutalist Concrete Server Canyon';
  } else if (combined.includes('trade') || combined.includes('stock') || combined.includes('wall street')) {
    atmosphere = 'Empty Trading Floor at Dusk';
  } else {
    atmosphere = 'Atmospheric Minimalist Crossroads';
  }

  // 5. LIGHTING (Chiaroscuro & Mood)
  let lighting = '';
  if (combined.includes('neon') || combined.includes('cyber') || combined.includes('future')) {
    lighting = 'Eerie Volumetric Neon Cyan Glow';
  } else if (combined.includes('dark') || combined.includes('noir') || combined.includes('secret') || combined.includes('investig')) {
    lighting = 'Deep Chiaroscuro High-Contrast Silhouette';
  } else if (combined.includes('dawn') || combined.includes('morning') || combined.includes('hope')) {
    lighting = 'Cold Blue Twilight with Amber Rim Light';
  } else {
    lighting = 'Dramatic Chiaroscuro Editorial Spotlight';
  }

  // 6. STYLE (Print Medium & Movement)
  let style = '';
  if (combined.includes('tech') || combined.includes('modern') || combined.includes('future')) {
    style = 'Bauhaus Geometric Vector Poster';
  } else if (combined.includes('historic') || combined.includes('classic') || combined.includes('book') || combined.includes('paper')) {
    style = 'Vintage Woodcut Broadsheet Engraving';
  } else {
    style = 'High-Contrast Noir Risograph Print';
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

  // AI-suggest cues if context changed or empty
  const articleTitle = currentScrapedArticle?.title || extractHeadlineFromUrl(url);
  const contextKey = `${creatorSelectedSource}::${articleTitle}::${slantTake}`;

  if (creatorCuePills.length === 0 || creatorLastSuggestedContextKey !== contextKey) {
    creatorLastSuggestedContextKey = contextKey;
    renderCuesDeck(); // initial render
    await triggerCueSuggest(); // call Gemini AI model for rich cues!
  } else {
    renderCuesDeck();
  }
}

function renderCuesDeck() {
  const container = document.getElementById('cuesDeckContainer');
  if (!container) return;

  container.innerHTML = '';

  creatorCuePills.forEach((cueText, index) => {
    const isSelected = creatorSelectedCueIndices.has(index);
    const rankConfig = CUE_RANK_CONFIGS[index] || {
      badge: `#${index + 1} CUE`,
      badgeClass: 'badge-rank-other',
      rowClass: ''
    };

    const row = document.createElement('div');
    row.className = `cue-card-row ${rankConfig.rowClass} ${isSelected ? 'selected' : ''}`;
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
      <div class="cue-checkbox-wrap" onclick="toggleCueSelection(${index})">
        <input type="checkbox" class="cue-checkbox" ${isSelected ? 'checked' : ''} onchange="toggleCueSelection(${index})">
      </div>
      <span class="cue-badge ${rankConfig.badgeClass}">${rankConfig.badge}</span>
      <input type="text" class="cue-input-text" value="${escapeHtml(cueText)}" oninput="updateCueText(${index}, this.value)">
      <button type="button" class="cue-delete-btn" onclick="deleteCue(${index})" title="Remove cue">✕</button>
    `;

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
        <span class="cues-info-icon">⇅</span>
        <span>Tap to select • Hold & drag ⠿ to prioritize (#1 is Hero)</span>
      `;
    }
    if (suggestLabel) suggestLabel.textContent = 'Suggest All';
    if (suggestIcon) suggestIcon.textContent = '✨';
  }
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
    renderCuesDeck();
  }
}

function updateCueText(index, val) {
  if (index >= 0 && index < creatorCuePills.length) {
    creatorCuePills[index] = val;
  }
}

function addCustomCue() {
  const input = document.getElementById('customCueInput');
  const val = input ? input.value.trim() : '';
  if (!val) return;

  creatorCuePills.push(val);
  if (input) input.value = '';
  renderCuesDeck();
}

async function triggerCueSuggest() {
  const urlInput = document.getElementById('creatorUrlInput');
  const slantTakeInput = document.getElementById('creatorSlantTakeInput');
  const url = urlInput ? urlInput.value.trim() : '';
  const slantTake = slantTakeInput ? slantTakeInput.value.trim() : '';

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
        newsHeadline: articleTitle,
        newsBody: articleBody,
        sourceType: creatorSelectedSource,
        selectedIndices: Array.from(creatorSelectedCueIndices)
      })
    });

    if (!resp.ok) throw new Error('AI cues request failed');
    const data = await resp.json();

    if (data && data.success && Array.isArray(data.cues) && data.cues.length > 0) {
      if (creatorSelectedCueIndices.size > 0 && creatorCuePills.length > 0) {
        // Selective replacement
        const updated = [...creatorCuePills];
        const selectedArr = Array.from(creatorSelectedCueIndices).sort((a,b)=>a-b);
        selectedArr.forEach((targetIdx, i) => {
          if (data.cues[i] && targetIdx < updated.length) {
            updated[targetIdx] = data.cues[i];
          }
        });
        creatorCuePills = updated;
        creatorSelectedCueIndices.clear();
      } else {
        creatorCuePills = data.cues;
      }
    } else {
      throw new Error('Invalid cues response');
    }
  } catch (err) {
    console.warn('AI cue suggestion fallback:', err.message);
    const fallbacks = extract6RankedCueDimensions(slantTake, articleTitle, articleBody);
    if (creatorSelectedCueIndices.size > 0 && creatorCuePills.length > 0) {
      creatorSelectedCueIndices.forEach(idx => {
        if (idx < fallbacks.length) creatorCuePills[idx] = fallbacks[idx];
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

  if (creatorCharacterRepresentation !== 'likeness') {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  if (creatorReferenceImageBase64) {
    if (activeCard) activeCard.style.display = 'flex';
    if (emptyCard) emptyCard.style.display = 'none';
    if (thumb) thumb.src = creatorReferenceImageBase64;
    if (title) title.textContent = creatorReferenceImageSourceLabel || 'Reference Photo Ready';
  } else {
    if (activeCard) activeCard.style.display = 'none';
    if (emptyCard) emptyCard.style.display = 'block';
    if (cameraBtn) cameraBtn.style.display = isMobileDevice() ? 'inline-flex' : 'none';
  }
}

function selectCharacterRepresentation(type) {
  creatorCharacterRepresentation = type;
  const optSil = document.getElementById('repOptionSilhouette');
  const optLik = document.getElementById('repOptionLikeness');

  if (optSil) optSil.classList.toggle('active', type === 'silhouette');
  if (optLik) optLik.classList.toggle('active', type === 'likeness');

  if (type === 'likeness') {
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
    if (fill) fill.style.width = '60%';
  }, 1400);

  const ticker2 = setTimeout(() => {
    if (stepText) stepText.textContent = 'Generating visual metaphors & editorial poster art...';
    if (fill) fill.style.width = '85%';
  }, 2800);

  // Author handle
  let userHandle = '@curator';
  if (currentUser) {
    userHandle = '@' + (currentUser.user_metadata?.user_name || currentUser.user_metadata?.name || currentUser.email.split('@')[0]);
  }

  const effectiveImageBase64 = (creatorCharacterRepresentation === 'likeness' && creatorReferenceImageBase64)
    ? creatorReferenceImageBase64
    : creatorSelectedImageBase64;
  const effectiveImageMime = (creatorCharacterRepresentation === 'likeness' && creatorReferenceImageBase64)
    ? creatorReferenceImageMimeType
    : creatorSelectedImageMimeType;

  const payload = {
    sourceType: creatorSelectedSource,
    url,
    text: slantTake,
    slantTake: slantTake,
    imageBase64: effectiveImageBase64,
    imageMimeType: effectiveImageMime,
    targetAudience: 'General Public',
    slantTone: 'mind',
    spark,
    creatorHandle: userHandle,
    cues: creatorCuePills,
    heroCue: creatorCuePills[0] || '',
    characterRepresentation: creatorCharacterRepresentation,
    scrapedTitle: currentScrapedArticle?.title || '',
    scrapedContent: currentScrapedArticle?.content || ''
  };

  try {
    const resp = await fetch('/api/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    clearTimeout(ticker1);
    clearTimeout(ticker2);

    const contentType = resp.headers.get('content-type') || '';
    if (!resp.ok) {
      let errMsg = 'AI synthesis failed';
      if (contentType.includes('application/json')) {
        const errJson = await resp.json().catch(() => null);
        if (errJson && errJson.error) errMsg = errJson.error;
      } else {
        const text = await resp.text().catch(() => '');
        if (resp.status === 504 || text.includes('504')) {
          errMsg = 'AI synthesis timed out. Please try again in a few moments.';
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
    if (fill) fill.style.width = '100%';

    setTimeout(() => {
      showStep3Preview();
    }, 400);

  } catch (err) {
    clearTimeout(ticker1);
    clearTimeout(ticker2);
    console.error('Synthesis error:', err);
    alert('AI Synthesis Error: ' + err.message + '\n\nPlease check your input and try again.');
    if (cuesContent) cuesContent.style.display = 'flex';
    if (synthLoading) synthLoading.style.display = 'none';
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

  // Fill refine inputs
  const headlineInput = document.getElementById('refineHeadlineInput');
  const categoryInput = document.getElementById('refineCategoryInput');
  const handleInput = document.getElementById('refineHandleInput');

  if (headlineInput) headlineInput.value = currentSynthesizedPost.adaptedHeadline || '';
  if (categoryInput) categoryInput.value = currentSynthesizedPost.categoryBadge || 'OPINION';
  if (handleInput) handleInput.value = currentSynthesizedPost.creatorHandle || '@curator';

  // Update Tab 3 text and icon dynamically based on source anchor
  const prevTab2 = document.getElementById('prevTab2');
  if (prevTab2) {
    if (creatorSelectedSource === 'inner_voice') {
      prevTab2.innerHTML = '<span>💭</span> Poster 3: Conviction';
    } else if (creatorSelectedSource === 'photo') {
      prevTab2.innerHTML = '<span>📰</span> Poster 3: Receipts';
    } else {
      prevTab2.innerHTML = '<span>🌐</span> Poster 3: Web Receipts';
    }
  }

  // Render preview
  renderCreatorPreview();
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
}

function switchPreviewSlide(slideIdx) {
  currentPreviewSlide = slideIdx;
  goToSlide(null, 'preview', slideIdx);

  document.querySelectorAll('.preview-tab').forEach((tab, idx) => {
    tab.classList.toggle('active', idx === slideIdx);
  });
}

function updatePreviewHeadline(val) {
  if (!currentSynthesizedPost) return;
  currentSynthesizedPost.adaptedHeadline = val;
  // Update in preview card directly
  const h1 = document.querySelector('#carousel-preview .headline-overlay');
  if (h1) h1.textContent = val;
}

function updatePreviewCategory(val) {
  if (!currentSynthesizedPost) return;
  const upper = val.toUpperCase();
  currentSynthesizedPost.categoryBadge = upper;
  const badge = document.querySelector('#carousel-preview .category-badge');
  if (badge) badge.textContent = upper;
}

function updatePreviewHandle(val) {
  if (!currentSynthesizedPost) return;
  currentSynthesizedPost.creatorHandle = val;
  const handleEl = document.querySelector('#creatorCardPreviewWrapper .creator-handle');
  if (handleEl) handleEl.textContent = val;
}

async function publishSynthesizedPost() {
  if (!currentSynthesizedPost) return;

  const publishBtn = document.getElementById('publishBtn');
  if (publishBtn) {
    publishBtn.disabled = true;
    publishBtn.innerHTML = '<span>Publishing to Live Feed... ⏳</span>';
  }

  // Final values from inputs
  const headline = document.getElementById('refineHeadlineInput')?.value?.trim();
  const category = document.getElementById('refineCategoryInput')?.value?.trim();
  const handle = document.getElementById('refineHandleInput')?.value?.trim();

  if (headline) currentSynthesizedPost.adaptedHeadline = headline;
  if (category) currentSynthesizedPost.categoryBadge = category.toUpperCase();
  if (handle) currentSynthesizedPost.creatorHandle = handle;

  if (currentUser) {
    currentSynthesizedPost.user_id = currentUser.id;
    currentSynthesizedPost.userEmail = currentUser.email;
  }
  currentSynthesizedPost.createdAt = new Date().toISOString();
  currentSynthesizedPost.isUserCreated = true;

  try {
    // 1. Post to backend API
    const resp = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentSynthesizedPost)
    });

    if (!resp.ok) {
      console.warn('Backend /api/posts returned status:', resp.status);
    }
  } catch (err) {
    console.warn('Backend publish call error:', err);
  }

  // 2. Track in local storage
  myCreatedPostIds.add(currentSynthesizedPost.id);
  localStorage.setItem('slant_my_posts', JSON.stringify(Array.from(myCreatedPostIds)));

  // 3. Unshift into allPosts and render feed
  allPosts.unshift(currentSynthesizedPost);
  updateBadge(true, `Live Feed (${allPosts.length} posts)`);
  updateAuthUI();
  renderFeed();

  // 4. Close modal & show toast
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
