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
  const gateEmail = sessionStorage.getItem('slant_gate_active_email');
  if (gateEmail) {
    openPrivatePreviewGateModal(gateEmail);
  }
  await loadPosts();
  setupEventListeners();
  setupPullToRefresh();
  checkDeepLink();
  setupRealtimeSubscription();
}

const SUPABASE_URL = 'https://fxfklefnkpmhofncqhfh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4ZmtsZWZua3BtaG9mbmNxaGZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NzM4NzYsImV4cCI6MjEwODA0OTg3Nn0.0nw5ZDvlEsYal6EYXcqyaAPRHoxkXxZgDsNQDppEYgM';

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
let isCurrentUserAdmin = false;
let isUserWhitelistAllowed = false;
let savedPostIds = new Set(JSON.parse(localStorage.getItem('slant_saved_posts') || localStorage.getItem('editour_saved_posts') || '[]'));
let myCreatedPostIds = new Set(JSON.parse(localStorage.getItem('slant_my_posts') || '[]'));

// ============================================================
// AUTHENTICATION & USER PROFILE CONTROLLER
// ============================================================

async function verifyUserWhitelist(user) {
  if (!user || !user.email) return { allowed: false, isAdmin: false };
  const email = user.email.toLowerCase().trim();

  // Fast-track Master Admin: never blocked even if offline
  if (email === 'shridharoct16@gmail.com' || email === 'basasridhara@gmail.com') {
    return { allowed: true, isAdmin: true };
  }

  try {
    const resp = await fetch(`/api/whitelist?email=${encodeURIComponent(email)}`);
    if (resp.ok) {
      const data = await resp.json();
      return { allowed: Boolean(data.allowed), isAdmin: Boolean(data.isAdmin) };
    }
  } catch (err) {
    console.warn('Whitelist API check notice, falling back to direct Supabase:', err);
  }

  // Resilient fallback: direct Supabase point lookup
  try {
    const supaResp = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.system_beta_whitelist&select=data`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    if (supaResp.ok) {
      const rows = await supaResp.json();
      const list = rows?.[0]?.data?.allowed_emails || [];
      const admins = rows?.[0]?.data?.admin_emails || [];
      const isAllowed = list.map(e => e.toLowerCase()).includes(email) || admins.map(e => e.toLowerCase()).includes(email);
      return { allowed: isAllowed, isAdmin: admins.map(e => e.toLowerCase()).includes(email) };
    }
  } catch (_) {}

  return { allowed: false, isAdmin: false };
}

let suppressSignOutNotice = false;
let isUninvitedGateActive = false;

async function handleUninvitedUser(user) {
  if (!user) return;
  const uninvitedEmail = (user.email || '').toLowerCase().trim();
  const uninvitedName = getUserDisplayName(user);
  const uninvitedAvatar = getUserAvatarUrl(user);

  isUninvitedGateActive = true;
  try {
    sessionStorage.setItem('slant_gate_active_email', uninvitedEmail);
  } catch (_) {}

  // 1. Immediately dismiss any full-screen loading video / splash overlay
  if (typeof dismissInitialFeedLoader === 'function') {
    dismissInitialFeedLoader(true);
  }

  // 2. Submit access request to server
  try {
    fetch('/api/whitelist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'request_access',
        email: uninvitedEmail,
        name: uninvitedName,
        avatar: uninvitedAvatar
      })
    });
  } catch (_) {}

  // 3. Clear URL hash so checkDeepLink doesn't trigger auth modal
  try {
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname);
    }
  } catch (_) {}

  // 4. Prevent confusing "Signed out successfully" toast from overwriting gate message
  suppressSignOutNotice = true;
  try {
    await supabaseClient.auth.signOut();
  } catch (_) {}

  currentUser = null;
  isCurrentUserAdmin = false;
  isUserWhitelistAllowed = false;

  closeAuthModal();
  updateAuthUI();

  // 5. Open the locked Private Preview Gate modal with requester's email (z-index 10000000)
  openPrivatePreviewGateModal(uninvitedEmail);
  setTimeout(() => {
    openPrivatePreviewGateModal(uninvitedEmail);
  }, 120);

  showTemporaryToast(`🔒 Access Restricted: ${uninvitedEmail} is not on the invited curator list.`, 6000);
}

async function initAuth() {
  if (!supabaseClient) {
    updateAuthUI();
    return;
  }

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session?.user) {
      const check = await verifyUserWhitelist(session.user);
      if (check.allowed) {
        currentUser = session.user;
        isCurrentUserAdmin = check.isAdmin;
        isUserWhitelistAllowed = true;
      } else {
        await handleUninvitedUser(session.user);
        return;
      }
    } else {
      currentUser = null;
      isCurrentUserAdmin = false;
      isUserWhitelistAllowed = false;
    }
    updateAuthUI();
    if (isCurrentUserAdmin) {
      loadAdminBetaPendingCount();
    }
  } catch (err) {
    console.warn('Error fetching initial session:', err);
  }

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN') {
      if (session?.user) {
        const check = await verifyUserWhitelist(session.user);
        if (check.allowed) {
          currentUser = session.user;
          isCurrentUserAdmin = check.isAdmin;
          isUserWhitelistAllowed = true;
          closeAuthModal();
          showTemporaryToast(`Welcome to Slant, ${escapeHtml(getUserDisplayName())}! ✨`);

          // Log access timestamp
          try {
            fetch('/api/whitelist', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'log_access',
                email: session.user.email,
                name: getUserDisplayName(),
                avatar: getUserAvatarUrl()
              })
            });
          } catch (_) {}

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
          updateAuthUI();
          if (isCurrentUserAdmin) {
            loadAdminBetaPendingCount();
          }
        } else {
          await handleUninvitedUser(session.user);
        }
      }
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      isCurrentUserAdmin = false;
      isUserWhitelistAllowed = false;
      closeAuthModal();
      updateAuthUI();
      if (!suppressSignOutNotice) {
        showTemporaryToast('Signed out successfully.');
      }
      suppressSignOutNotice = false;
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

    const drawerAdminBetaRow = document.getElementById('drawerAdminBetaRow');
    if (drawerAdminBetaRow) {
      drawerAdminBetaRow.style.display = isCurrentUserAdmin ? 'flex' : 'none';
    }

    const headerAdminBetaBtn = document.getElementById('headerAdminBetaBtn');
    if (headerAdminBetaBtn) {
      headerAdminBetaBtn.style.display = isCurrentUserAdmin ? 'inline-flex' : 'none';
    }
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

    const drawerAdminBetaRow = document.getElementById('drawerAdminBetaRow');
    if (drawerAdminBetaRow) drawerAdminBetaRow.style.display = 'none';

    const headerAdminBetaBtn = document.getElementById('headerAdminBetaBtn');
    if (headerAdminBetaBtn) headerAdminBetaBtn.style.display = 'none';
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
        if (targetRow && track) {
          const targetTop = targetRow.offsetTop - track.offsetTop;
          track.scrollTo({ top: Math.max(0, targetTop - 8), behavior: 'smooth' });
        } else if (targetRow) {
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

        <!-- Poster 3: Slant Minute (1-Min Read) -->
        <div class="login-poster-col poster-receipts" onclick="previewPostFromLogin('${post.id}')" title="Poster 3: Slant Minute (1-Min Read) • Click to read in feed">
          <span class="login-poster-label">03 • SLANT MINUTE</span>
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

  // Intercept uninvited email logins before requesting OTP or password
  const check = await verifyUserWhitelist({ email });
  if (!check.allowed) {
    closeAuthModal();
    await handleUninvitedUser({ email });
    return;
  }

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

/* ============================================================
   BETA ACCESS & INVITES CONTROLLER (ADMIN ONLY)
   ============================================================ */

function openPrivatePreviewGateModal(email = '') {
  isUninvitedGateActive = true;
  if (typeof dismissInitialFeedLoader === 'function') {
    dismissInitialFeedLoader(true);
  }
  const modal = document.getElementById('privatePreviewGateModal');
  const emailEl = document.getElementById('gateModalEmailText');
  if (emailEl) emailEl.textContent = email || 'your account';
  if (!modal) return;
  modal.style.zIndex = '10000000';
  modal.style.display = 'flex';
  modal.style.opacity = '1';
  modal.style.visibility = 'visible';
  modal.style.pointerEvents = 'auto';
  modal.classList.add('open');
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closePrivatePreviewGateModal() {
  isUninvitedGateActive = false;
  try {
    sessionStorage.removeItem('slant_gate_active_email');
    sessionStorage.setItem('slant_guest_explored', 'true');
  } catch (e) {}
  const modal = document.getElementById('privatePreviewGateModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.classList.remove('active');
  modal.style.display = 'none';
  modal.style.opacity = '';
  modal.style.visibility = '';
  modal.style.pointerEvents = '';
  document.body.style.overflow = '';
}

function openAdminBetaModal() {
  if (typeof closeDrawer === 'function') closeDrawer();
  const modal = document.getElementById('adminBetaModal');
  if (!modal) {
    console.error('adminBetaModal element not found in DOM');
    return;
  }
  modal.style.display = 'flex';
  modal.style.opacity = '1';
  modal.style.visibility = 'visible';
  modal.style.pointerEvents = 'auto';
  modal.classList.add('open');
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  loadAdminBetaData(true);
}

function closeAdminBetaModal() {
  const modal = document.getElementById('adminBetaModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.classList.remove('active');
  modal.style.display = 'none';
  modal.style.opacity = '';
  modal.style.visibility = '';
  modal.style.pointerEvents = '';
  document.body.style.overflow = '';
}

async function loadAdminBetaPendingCount() {
  const headerBtn = document.getElementById('headerAdminBetaBtn');
  if (!isCurrentUserAdmin) {
    if (headerBtn) headerBtn.style.display = 'none';
    return;
  }
  if (headerBtn) headerBtn.style.display = 'inline-flex';

  try {
    const adminEmail = currentUser?.email || 'shridharoct16@gmail.com';
    const resp = await fetch(`/api/whitelist?admin=${encodeURIComponent(adminEmail)}`);
    if (resp.ok) {
      const data = await resp.json();
      const pending = Array.isArray(data.pendingRequests) ? data.pendingRequests : [];
      const pendingCount = pending.length;

      // 1. Update Drawer badge
      const drawerBadge = document.getElementById('drawerPendingBadge');
      if (drawerBadge) {
        if (pendingCount > 0) {
          drawerBadge.textContent = pendingCount;
          drawerBadge.style.display = 'inline-block';
        } else {
          drawerBadge.style.display = 'none';
        }
      }

      // 2. Update Header badge
      const headerBadge = document.getElementById('headerPendingBadge');
      if (headerBadge) {
        if (pendingCount > 0) {
          headerBadge.textContent = pendingCount;
          headerBadge.style.display = 'inline-flex';
          headerBadge.classList.add('pulse');
        } else {
          headerBadge.style.display = 'none';
          headerBadge.classList.remove('pulse');
        }
      }

      // 3. If pending requests exist, alert the admin with an interactive banner toast
      if (pendingCount > 0 && !sessionStorage.getItem('admin_notified_' + pendingCount)) {
        sessionStorage.setItem('admin_notified_' + pendingCount, 'true');
        const latestRequester = pending[0]?.email || 'A user';
        const alertMsg = pendingCount === 1
          ? `🔔 <strong>1 access request pending</strong> from <span style="color:#818CF8;">${escapeHtml(latestRequester)}</span>. Tap to review.`
          : `🔔 <strong>${pendingCount} access requests pending</strong> (including <span style="color:#818CF8;">${escapeHtml(latestRequester)}</span>). Tap to review.`;
        showTemporaryToast(alertMsg, 8000, true, () => {
          openAdminBetaModal();
        });
      }
    }
  } catch (_) {}
}

// Periodic live poll for admin so new friend requests appear in real time
if (!window._adminBetaPollInterval) {
  window._adminBetaPollInterval = setInterval(() => {
    if (isCurrentUserAdmin) {
      loadAdminBetaPendingCount();
    }
  }, 25000);
}

async function loadAdminBetaData(forceRefresh = false) {
  const adminEmail = currentUser?.email || 'shridharoct16@gmail.com';
  const allowedList = document.getElementById('adminAllowedList');
  const allowedCount = document.getElementById('adminAllowedCountText');
  const pendingSection = document.getElementById('adminPendingSection');
  const pendingList = document.getElementById('adminPendingList');
  const pendingCount = document.getElementById('adminPendingCountText');

  if (allowedList && forceRefresh) {
    allowedList.innerHTML = '<div style="font-size:12px; color:var(--text-secondary); padding:8px;">Loading member roster...</div>';
  }

  try {
    const resp = await fetch(`/api/whitelist?admin=${encodeURIComponent(adminEmail)}`);
    if (!resp.ok) throw new Error('Could not load whitelist roster');
    const data = await resp.json();

    const allowedEmails = Array.isArray(data.allowedEmails) ? data.allowedEmails : ['shridharoct16@gmail.com', 'basasridhara@gmail.com'];
    const pending = Array.isArray(data.pendingRequests) ? data.pendingRequests : [];
    const accessLogs = Array.isArray(data.accessLogs) ? data.accessLogs : [];
    const logsMap = new Map();
    accessLogs.forEach(l => logsMap.set(l.email?.toLowerCase(), l));

    if (allowedCount) allowedCount.textContent = allowedEmails.length;
    if (allowedList) {
      allowedList.innerHTML = '';
      allowedEmails.forEach(email => {
        const isMaster = email.toLowerCase() === 'shridharoct16@gmail.com' || email.toLowerCase() === 'basasridhara@gmail.com';
        const log = logsMap.get(email.toLowerCase());
        const lastSeen = log?.lastLogin ? new Date(log.lastLogin).toLocaleDateString(undefined, { month:'short', day:'numeric' }) : 'Invited';

        const row = document.createElement('div');
        row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:var(--bg-card, rgba(255,255,255,0.05)); border:1px solid var(--border-subtle, rgba(255,255,255,0.1)); border-radius:10px; font-size:13px;';
        row.innerHTML = `
          <div style="display:flex; align-items:center; gap:8px; overflow:hidden;">
            <span style="font-size:14px;">${isMaster ? '👑' : '👤'}</span>
            <div style="overflow:hidden;">
              <strong style="color:var(--text-primary); display:block; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${escapeHtml(email)}</strong>
              <span style="font-size:10.5px; color:var(--text-secondary);">${isMaster ? 'Master Curator' : (log?.name ? `${escapeHtml(log.name)} • Active ${lastSeen}` : 'Pending first sign-in')}</span>
            </div>
          </div>
          <div>
            ${isMaster ? '<span style="font-size:11px; font-weight:700; color:#818CF8; background:rgba(99,102,241,0.1); padding:2px 6px; border-radius:4px;">Owner</span>' : `<button type="button" onclick="handleAdminRemoveEmail('${escapeHtml(email)}')" style="background:none; border:none; color:#EF4444; font-size:12px; font-weight:700; cursor:pointer; padding:4px 6px;">Revoke</button>`}
          </div>
        `;
        allowedList.appendChild(row);
      });
    }

    // Pending Section
    if (pendingSection && pendingList && pendingCount) {
      if (pending.length > 0) {
        pendingCount.textContent = pending.length;
        pendingSection.style.display = 'block';
        pendingList.innerHTML = '';
        pending.forEach(item => {
          const pRow = document.createElement('div');
          pRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:var(--bg-card, #fff); border:1px solid rgba(239,68,68,0.25); border-radius:8px; font-size:12.5px;';
          pRow.innerHTML = `
            <div>
              <strong style="color:var(--text-primary); display:block;">${escapeHtml(item.name || item.email)}</strong>
              <span style="font-size:11px; color:#818CF8;">${escapeHtml(item.email)}</span>
            </div>
            <div style="display:flex; gap:6px;">
              <button type="button" onclick="handleAdminApproveRequest('${escapeHtml(item.email)}')" style="background:#10B981; color:#fff; border:none; padding:4px 10px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">Approve ✓</button>
              <button type="button" onclick="handleAdminDenyRequest('${escapeHtml(item.email)}')" style="background:rgba(239,68,68,0.1); color:#EF4444; border:none; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">✕</button>
            </div>
          `;
          pendingList.appendChild(pRow);
        });
      } else {
        pendingSection.style.display = 'none';
      }
    }

    loadAdminBetaPendingCount();
  } catch (err) {
    console.error('Error loading admin beta data:', err);
    if (allowedList) allowedList.innerHTML = '<div style="font-size:12px; color:#EF4444; padding:8px;">Error loading roster. Tap refresh.</div>';
  }
}

async function handleAdminAddEmail() {
  const input = document.getElementById('adminNewInviteEmail');
  const email = (input?.value || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    alert('Please enter a valid Gmail address.');
    return;
  }
  const adminEmail = currentUser?.email || 'shridharoct16@gmail.com';
  try {
    const resp = await fetch('/api/whitelist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add_email', adminEmail, email })
    });
    if (resp.ok) {
      if (input) input.value = '';
      showTemporaryToast(`✨ Added ${email} to whitelist!`);
      loadAdminBetaData(false);
    } else {
      const err = await resp.json().catch(() => ({}));
      alert(err.error || 'Failed to add email');
    }
  } catch (e) {
    alert('Network error while adding email');
  }
}

async function handleAdminRemoveEmail(email) {
  if (!confirm(`Are you sure you want to revoke access for ${email}?`)) return;
  const adminEmail = currentUser?.email || 'shridharoct16@gmail.com';
  try {
    const resp = await fetch('/api/whitelist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove_email', adminEmail, email })
    });
    if (resp.ok) {
      showTemporaryToast(`Revoked access for ${email}`);
      loadAdminBetaData(false);
    }
  } catch (e) {
    alert('Error revoking email');
  }
}

async function handleAdminApproveRequest(email) {
  const adminEmail = currentUser?.email || 'shridharoct16@gmail.com';
  try {
    const resp = await fetch('/api/whitelist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve_request', adminEmail, email })
    });
    if (resp.ok) {
      showTemporaryToast(`✨ Approved access for ${email}!`);
      loadAdminBetaData(false);
    }
  } catch (e) {
    alert('Error approving request');
  }
}

async function handleAdminDenyRequest(email) {
  const adminEmail = currentUser?.email || 'shridharoct16@gmail.com';
  try {
    const resp = await fetch('/api/whitelist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deny_request', adminEmail, email })
    });
    if (resp.ok) {
      showTemporaryToast(`Dismissed request from ${email}`);
      loadAdminBetaData(false);
    }
  } catch (e) {
    alert('Error denying request');
  }
}

function copyPersonalInviteMessage() {
  const text = `Hey! I've been building Slant (a visual editorial journal for ideas & perspectives). I've added your Gmail to our Private Preview whitelist so you can test it. Try it out here: https://www.slant.today`;
  navigator.clipboard.writeText(text).then(() => {
    showTemporaryToast('📋 Invite message copied to clipboard!');
  }).catch(() => {
    prompt('Copy your invite message:', text);
  });
}

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

function showTemporaryToast(message, duration = 2800, isHtml = false, onClickHandler = null) {
  let toast = document.getElementById('slantToast') || document.getElementById('editourToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'slantToast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: var(--bg-surface, #1E293B);
      color: var(--text-primary, #F8FAFC);
      border: 1px solid var(--border-subtle, rgba(255,255,255,0.12));
      box-shadow: 0 10px 30px rgba(0,0,0,0.4);
      padding: 10px 18px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      z-index: 9999;
      opacity: 0;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      align-items: center;
      gap: 8px;
      white-space: nowrap;
      max-width: 90vw;
      box-sizing: border-box;
    `;
    document.body.appendChild(toast);
  }

  if (isHtml) {
    toast.innerHTML = message;
  } else {
    toast.textContent = message;
  }

  if (typeof onClickHandler === 'function') {
    toast.style.pointerEvents = 'auto';
    toast.style.cursor = 'pointer';
    toast.onclick = () => {
      onClickHandler();
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(20px)';
    };
  } else {
    toast.style.pointerEvents = 'none';
    toast.style.cursor = 'default';
    toast.onclick = null;
  }

  toast.style.opacity = '1';
  toast.style.transform = 'translateX(-50%) translateY(0)';
  
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    toast.onclick = null;
  }, duration);
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

async function fetchDirectSupabasePosts(limit = 12) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const idResp = await fetch(`${SUPABASE_URL}/rest/v1/posts?select=id,created_at&order=created_at.desc&limit=${limit}`, {
      signal: controller.signal,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    clearTimeout(timeoutId);
    if (!idResp.ok) return [];
    const idRows = await idResp.json();
    if (!Array.isArray(idRows) || idRows.length === 0) return [];
    const orderedIds = idRows.map(r => r.id).filter(id => id && !id.startsWith('system_'));

    // Fetch posts via single indexed primary-key query (fast & resilient)
    const inFilter = orderedIds.map(id => '%22' + encodeURIComponent(id) + '%22').join(',');
    const pResp = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=in.(${inFilter})`, {
      signal: controller.signal,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    let orderedRows = [];
    if (pResp.ok) {
      const pRows = await pResp.json();
      const rowsMap = new Map();
      pRows.forEach(r => rowsMap.set(r.id, r));
      orderedRows = orderedIds.map(id => rowsMap.get(id)).filter(Boolean);
    }
    return orderedRows.map(r => {
      const p = r.data || r;
      p.id = p.id || r.id;
      p.createdAt = p.createdAt || r.created_at || new Date().toISOString();
      if (p.illustrationUrl && (p.illustrationUrl.includes('unsplash.com') || p.illustrationUrl.includes('pollinations.ai'))) {
        p.illustrationUrl = '';
      }
      if (p.aiIllustrationUrl && (p.aiIllustrationUrl.includes('unsplash.com') || p.aiIllustrationUrl.includes('pollinations.ai'))) {
        p.aiIllustrationUrl = '';
      }
      if (!p.illustrationUrl && !p.illustrationBase64) {
        p.illustrationUrl = `/posters/${p.id}.png`;
        p.aiIllustrationUrl = p.illustrationUrl;
      }
      return p;
    });
  } catch (err) {
    console.warn('fetchDirectSupabasePosts notice:', err);
    return [];
  }
}

// ============================================================
// DEEP LINKING & DIRECT POST NAVIGATION
// ============================================================
function getDeepLinkedPostId() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('p') || params.get('post') || params.get('id');
    if (fromQuery && fromQuery.trim()) {
      return fromQuery.trim();
    }

    // Check path: /post/:id or /p/:id
    const pathMatch = window.location.pathname.match(/^\/(?:post|p)\/([^/?#]+)/i);
    if (pathMatch && pathMatch[1]) {
      return decodeURIComponent(pathMatch[1]).trim();
    }

    // Check hash: #post-... or #p=... or #...
    if (window.location.hash) {
      const hash = window.location.hash;
      const hashPost = hash.match(/#(?:post[-_]|p=)?([a-f0-9-]{8,})/i);
      if (hashPost && hashPost[1]) {
        return hashPost[1].trim();
      }
    }
  } catch (err) {
    console.warn('Error reading deep link post ID:', err);
  }
  return null;
}

function scrollToPostElement(targetCard) {
  if (!targetCard) return;
  const header = document.querySelector('header');
  const headerHeight = header ? header.offsetHeight : 60;
  const rect = targetCard.getBoundingClientRect();
  const screenHeight = window.innerHeight;

  let targetY;
  if (rect.height + headerHeight + 40 < screenHeight) {
    targetY = window.pageYOffset + rect.top - ((screenHeight - rect.height) / 2);
  } else {
    targetY = window.pageYOffset + rect.top - headerHeight - 16;
  }
  window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
}

async function loadPosts() {
  // 1. Start seamless jerk-free logo video loop in initial loader
  if (!window._feedVideoLoop) {
    window._feedVideoLoop = setupSeamlessVideoLoop('feedLoaderVideoWrap', 'feedInitialVideoA', 'feedInitialVideoB', 0.45);
  }
  if (window._feedVideoLoop) {
    window._feedVideoLoop.start();
  } else {
    const initVid = document.getElementById('feedInitialVideoA') || document.getElementById('feedInitialVideo');
    if (initVid) {
      try {
        initVid.currentTime = 0;
        const playP = initVid.play();
        if (playP !== undefined) playP.catch(() => {});
      } catch (_) {}
    }
  }

  // 2. Fetch authoritative batch of 12 posts from /api/posts?limit=12 (with resilient fallback to direct Supabase)
  let fetchedLiveBatch = null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const apiResp = await fetch(`/api/posts?limit=${FEED_BATCH_SIZE}&ts=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (apiResp.ok) {
      const data = await apiResp.json();
      if (data && Array.isArray(data.posts) && data.posts.length > 0) {
        fetchedLiveBatch = data.posts;
      }
    }
  } catch (e) {
    console.warn('Fast /api/posts fetch notice, falling back:', e);
  }

  // If /api/posts didn't return, fetch direct from Supabase via fast point lookups
  if (!fetchedLiveBatch || fetchedLiveBatch.length === 0) {
    try {
      const supaPosts = await fetchDirectSupabasePosts(FEED_BATCH_SIZE);
      if (Array.isArray(supaPosts) && supaPosts.length > 0) {
        fetchedLiveBatch = supaPosts;
      }
    } catch (_) {}
  }

  if (fetchedLiveBatch && fetchedLiveBatch.length > 0) {
    mergeAndSortPosts(fetchedLiveBatch);
  } else {
    try {
      const fastResp = await fetch(`slant_feed.json?ts=${Date.now()}`, { cache: 'no-cache' });
      if (fastResp.ok) {
        const posts = await fastResp.json();
        if (Array.isArray(posts) && posts.length > 0) {
          mergeAndSortPosts(posts);
        }
      }
    } catch (e) {
      console.warn('Could not load slant_feed.json:', e);
    }
  }

  // Merge locally cached user stories so they never vanish
  try {
    const localCache = JSON.parse(localStorage.getItem('slant_user_posts_cache') || '[]');
    if (Array.isArray(localCache) && localCache.length > 0) {
      mergeAndSortPosts(localCache);
    }
  } catch (e) {
    console.warn('Error merging local user posts cache:', e);
  }

  // Pre-fetch deep-linked post from cloud if not yet in memory
  const deepPostId = getDeepLinkedPostId();
  if (deepPostId) {
    currentFilter = 'all';
    const exists = allPosts.some(p => p && p.id === deepPostId);
    if (!exists) {
      try {
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(deepPostId)}&select=*`, {
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
          }
        });
        if (resp.ok) {
          const rows = await resp.json();
          if (Array.isArray(rows) && rows.length > 0) {
            const p = rows[0].data || rows[0];
            p.id = p.id || rows[0].id;
            p.createdAt = p.createdAt || rows[0].created_at || new Date().toISOString();
            if (!p.illustrationUrl && !p.illustrationBase64) {
              p.illustrationUrl = `/posters/${p.id}.png`;
              p.aiIllustrationUrl = p.illustrationUrl;
            }
            mergeAndSortPosts([p]);
          }
        }
      } catch (e) {
        console.warn('Error pre-fetching deep-linked post before initial render:', e);
      }
    }
  }

  // 3. Render Batch 1 of 12 posts and WAIT for all 12 posters + video loop before dismissing loader
  if (allPosts.length > 0) {
    updateBadge(true, `Live Feed (${allPosts.length} posts)`);
    updateAuthUI();
    await renderFeed(true);
  } else {
    dismissInitialFeedLoader(true);
  }

  // 4. In background, silently sync remaining posts from cloud
  syncLiveCloudPosts(false);
}

async function syncLiveCloudPosts(forceRender = false) {
  let fetchedPosts = null;

  // 1. Primary: Fetch from /api/posts with timestamp and no-store to bypass any proxy/browser cache
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const apiResp = await fetch(`/api/posts?limit=15&ts=${Date.now()}`, {
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

  // 2. Resilient Fallback: If /api/posts failed or was unreachable, query Supabase directly via fast point lookups
  if (!fetchedPosts || fetchedPosts.length === 0) {
    try {
      const supaPosts = await fetchDirectSupabasePosts(15);
      if (Array.isArray(supaPosts) && supaPosts.length > 0) {
        fetchedPosts = supaPosts;
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
        const sanitizeForCache = (p) => {
          if (!p) return null;
          const copy = { ...p };
          delete copy.originalPhotoBase64;
          if (copy.illustrationBase64 && copy.illustrationBase64.length > 50000) {
            delete copy.illustrationBase64;
          }
          if (!copy.illustrationUrl) {
            copy.illustrationUrl = '/posters/' + copy.id + '.png';
            copy.aiIllustrationUrl = copy.illustrationUrl;
          }
          return copy;
        };
        const existingLocal = JSON.parse(localStorage.getItem('slant_user_posts_cache') || '[]');
        const map = new Map();
        userStories.map(sanitizeForCache).filter(Boolean).forEach(p => map.set(p.id, p));
        existingLocal.map(sanitizeForCache).filter(Boolean).forEach(p => { if (!map.has(p.id)) map.set(p.id, p); });
        localStorage.setItem('slant_user_posts_cache', JSON.stringify(Array.from(map.values()).slice(0, 30)));
      }
    } catch (_) {}

    if (forceRender) {
      updateBadge(true, `Live Feed (${allPosts.length} posts)`);
      updateAuthUI();
      renderFeed();
    } else {
      updateBadge(true, `Live Feed (${allPosts.length} posts)`);
      updateAuthUI();
    }
  }

  // 3. Always refresh author's created stories & private drafts directly from Supabase
  if (myCreatedPostIds && myCreatedPostIds.size > 0) {
    try {
      const myIdsArray = Array.from(myCreatedPostIds).slice(0, 30);
      const inFilter = myIdsArray.map(id => '%22' + encodeURIComponent(id) + '%22').join(',');
      const myResp = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=in.(${inFilter})`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });
      if (myResp.ok) {
        const myRows = await myResp.json();
        if (Array.isArray(myRows) && myRows.length > 0) {
          const freshUserPosts = myRows.map(r => {
            const p = r.data || r;
            p.id = p.id || r.id;
            p.createdAt = p.createdAt || r.created_at || new Date().toISOString();
            return p;
          });
          const hasDraftUpdates = mergeAndSortPosts(freshUserPosts);
          // Overwrite localStorage cache with fresh copies from Supabase
          const sanitizeForCache = (p) => {
            if (!p) return null;
            const copy = { ...p };
            delete copy.originalPhotoBase64;
            if (copy.illustrationBase64 && copy.illustrationBase64.length > 50000) {
              delete copy.illustrationBase64;
            }
            if (!copy.illustrationUrl) {
              copy.illustrationUrl = '/posters/' + copy.id + '.png';
              copy.aiIllustrationUrl = copy.illustrationUrl;
            }
            return copy;
          };
          const existingLocal = JSON.parse(localStorage.getItem('slant_user_posts_cache') || '[]');
          const map = new Map();
          existingLocal.map(sanitizeForCache).filter(Boolean).forEach(p => map.set(p.id, p));
          freshUserPosts.map(sanitizeForCache).filter(Boolean).forEach(p => map.set(p.id, p));
          localStorage.setItem('slant_user_posts_cache', JSON.stringify(Array.from(map.values()).slice(0, 30)));
          if (hasDraftUpdates || currentFilter === 'my_stories') {
            renderFeed();
          }
        }
      }
    } catch (err) {
      console.warn('Sync user drafts error:', err);
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

async function checkDeepLink() {
  const deepPostId = getDeepLinkedPostId();
  if (deepPostId) {
    function tryFocusDeepLinkedPost(attempts = 10) {
      const targetCard = document.getElementById('post-' + deepPostId) || document.querySelector(`[data-post-id="${deepPostId}"]`);
      if (targetCard) {
        dismissInitialFeedLoader(true);
        setTimeout(() => {
          scrollToPostElement(targetCard);
          targetCard.classList.add('deep-link-highlight');
          showTemporaryToast('📍 Viewing shared post');

          const targetPost = allPosts.find(p => p && p.id === deepPostId);
          if (targetPost) {
            const headline = targetPost.adaptedHeadline || targetPost.originalHeadline;
            if (headline) {
              document.title = `${headline} • Slant`;
            }
          }

          // Check if caller explicitly requested source proof modal open (?proof=true)
          const params = new URLSearchParams(window.location.search);
          if (params.get('proof') === 'true' || params.get('source') === 'proof') {
            const idx = allPosts.findIndex(p => p && p.id === deepPostId);
            if (idx >= 0) setTimeout(() => openDetailModal(idx), 400);
          }

          setTimeout(() => {
            targetCard.classList.remove('deep-link-highlight');
          }, 3500);
        }, 300);
        return;
      }

      if (attempts > 0) {
        setTimeout(() => tryFocusDeepLinkedPost(attempts - 1), 250);
      }
    }

    tryFocusDeepLinkedPost(10);
    return;
  }

  // Check login deep link / direct route or first-time visitor gateway
  if (isUninvitedGateActive || sessionStorage.getItem('slant_gate_active_email')) {
    return;
  }

  const isExplicitLogin = params.get('auth') === 'login' ||
    params.get('login') === 'true' ||
    window.location.hash === '#login' ||
    (window.location.pathname && window.location.pathname.endsWith('/login'));

  let hasExplored = false;
  try {
    hasExplored = sessionStorage.getItem('slant_guest_explored') === 'true';
  } catch (e) {}

  if (isExplicitLogin || (!currentUser && !hasExplored && !deepPostId)) {
    setTimeout(() => openAuthModal(), 200);
  }
}

// Listen for browser navigation / hashchange for #login or deep-linked post
window.addEventListener('hashchange', () => {
  if (window.location.hash === '#login') {
    openAuthModal();
  } else {
    const modal = document.getElementById('authModal');
    if (modal && (modal.classList.contains('open') || modal.classList.contains('active'))) {
      closeAuthModal();
    }
    const deepId = getDeepLinkedPostId();
    if (deepId) {
      const card = document.getElementById('post-' + deepId) || document.querySelector(`[data-post-id="${deepId}"]`);
      if (card) {
        scrollToPostElement(card);
        card.classList.add('deep-link-highlight');
        setTimeout(() => card.classList.remove('deep-link-highlight'), 3500);
      }
    }
  }
});
/* ============================================================
   BATCHED 12-POST FEED ENGINE & PRE-CACHE LOADER
   - Feed is presented in strict, verified batches of 12
   - While batch 1 is downloading/decoding, slantlogovideo.mp4 loops
   - Next batch of 12 is silently pre-cached in background
   - Bottom logo loader seamlessly displays if user scrolls before ready
   ============================================================ */

const FEED_BATCH_SIZE = 12;
let currentRenderedBatch = 0;
let currentBatchFilteredPosts = [];
let isBatchLoading = false;
let nextBatchPreloadPromise = null;
let feedInfiniteScrollInitialized = false;

function getPostCardImageUrl(post) {
  if (!post) return '';
  if (post.illustrationBase64) {
    return post.illustrationBase64.startsWith('data:')
      ? post.illustrationBase64
      : `data:image/png;base64,${post.illustrationBase64}`;
  }
  let url = post.illustrationUrl || post.aiIllustrationUrl || '';
  if (url.includes('unsplash.com') || url.includes('pollinations.ai')) {
    url = `/posters/${post.id}.png`;
  }
  if (!url && post.id) {
    url = `/posters/${post.id}.png`;
  }
  return url;
}

function preloadSingleImage(url) {
  if (!url) return Promise.resolve(false);
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const onDone = () => {
      if (settled) return;
      settled = true;
      if (typeof img.decode === 'function') {
        img.decode()
          .then(() => resolve(img.naturalWidth > 0))
          .catch(() => resolve(img.naturalWidth > 0));
      } else {
        resolve(img.naturalWidth > 0);
      }
    };
    img.onload = onDone;
    img.onerror = () => {
      if (settled) return;
      settled = true;
      console.warn('Preload notice: could not load', url);
      resolve(false);
    };
    img.src = url;
    if (img.complete && img.naturalWidth > 0) {
      onDone();
    }
  });
}

function waitForCardImageDecode(cardElement) {
  if (!cardElement) return Promise.resolve(true);
  const img = cardElement.querySelector('.slide-hook-bg');
  if (!img || !img.src) return Promise.resolve(true);

  return new Promise((resolve) => {
    if (img.complete && img.naturalWidth > 0) {
      if (typeof img.decode === 'function') {
        img.decode().then(() => resolve(true)).catch(() => resolve(true));
      } else {
        resolve(true);
      }
      return;
    }

    let settled = false;
    const onDone = () => {
      if (settled) return;
      settled = true;
      if (typeof img.decode === 'function') {
        img.decode().then(() => resolve(true)).catch(() => resolve(true));
      } else {
        resolve(true);
      }
    };

    img.addEventListener('load', onDone, { once: true });
    img.addEventListener('error', () => {
      if (settled) return;
      settled = true;
      resolve(false);
    }, { once: true });
  });
}

async function preloadBatchImages(posts, timeoutMs = 8000) {
  if (!posts || posts.length === 0) return;
  const urls = posts.map(getPostCardImageUrl).filter(Boolean);
  if (urls.length === 0) return;
  const preloadPromises = urls.map(preloadSingleImage);
  const timeoutPromise = new Promise(resolve => setTimeout(resolve, timeoutMs));
  await Promise.race([
    Promise.all(preloadPromises),
    timeoutPromise
  ]);
}

function renderBatchCards(posts, offset = 0) {
  const container = document.getElementById('feedContainer');
  if (!container || !posts) return;
  posts.forEach((post, i) => {
    const cardIndex = offset + i;
    const card = createPostCardElement(post, cardIndex);
    container.appendChild(card);
    setupCarouselGestures(cardIndex);
  });
}

let isNextBatchReady = false;
let swipeBlockedListenerAttached = false;

function appendBatchEndBarrier(batchIndex, currentCount, totalCount) {
  const container = document.getElementById('feedContainer');
  if (!container) return;

  const existing = document.getElementById('feedBatchEndBarrier');
  if (existing) existing.remove();

  const barrier = document.createElement('div');
  barrier.className = 'feed-batch-end-barrier';
  barrier.id = 'feedBatchEndBarrier';

  if (currentCount >= totalCount) {
    barrier.innerHTML = `
      <div class="batch-barrier-card">
        <div class="batch-barrier-pill">✦ ALL STORIES CAUGHT UP ✦</div>
        <h4 class="batch-barrier-title">You've reached the end of the feed</h4>
        <p class="batch-barrier-sub">All ${totalCount} original editorial stories have been read. Check back soon for new slants!</p>
      </div>
    `;
  } else {
    barrier.innerHTML = `
      <div class="batch-barrier-card">
        <div class="batch-barrier-pill">✦ BATCH ${batchIndex + 1} COMPLETE (${currentCount} OF ${totalCount} STORIES) ✦</div>
        <h4 class="batch-barrier-title">Swipe up to load next 12 stories</h4>
        <p class="batch-barrier-sub">The next set of 12 original editorial postcards is ready.</p>
        <button class="batch-barrier-action-btn" id="loadNextBatchBtn" onclick="triggerNextFeedBatch()">
          <span>Load Next 12 Stories</span>
          <span class="batch-barrier-arrow">➔</span>
        </button>
      </div>
    `;
  }
  container.appendChild(barrier);
}

async function triggerNextFeedBatch() {
  if (isBatchLoading) return;
  if (!currentBatchFilteredPosts || currentBatchFilteredPosts.length === 0) return;

  const nextStartIdx = (currentRenderedBatch + 1) * FEED_BATCH_SIZE;
  if (nextStartIdx >= currentBatchFilteredPosts.length) {
    showTemporaryToast('You are all caught up! ✨');
    return;
  }

  isBatchLoading = true;
  const nextBatch = currentBatchFilteredPosts.slice(nextStartIdx, nextStartIdx + FEED_BATCH_SIZE);
  const wasAlreadyReady = isNextBatchReady;

  // Show bottom logo video batch loader
  const batchLoader = document.getElementById('feedBatchLoader');
  if (batchLoader) {
    batchLoader.style.display = 'flex';
    const bVid = batchLoader.querySelector('video');
    if (bVid) {
      try {
        bVid.currentTime = 0;
        const p = bVid.play();
        if (p !== undefined) p.catch(() => {});
      } catch (_) {}
    }
  }

  // If next batch was NOT ready, logo video keeps looping until ALL 12 are loaded!
  try {
    if (nextBatchPreloadPromise) {
      await nextBatchPreloadPromise;
    } else {
      await preloadBatchImages(nextBatch, 15000);
    }
    // If it had to wait on network, give smooth 1.2s minimum loop transition so it doesn't jerk
    if (!wasAlreadyReady) {
      await new Promise(r => setTimeout(r, 1200));
    }
  } catch (err) {
    console.warn('Batch preload warning:', err);
  }

  // Remove old barrier
  const oldBarrier = document.getElementById('feedBatchEndBarrier');
  if (oldBarrier) oldBarrier.remove();

  // Hide batch video loader
  if (batchLoader) {
    batchLoader.style.display = 'none';
    const bVid = batchLoader.querySelector('video');
    if (bVid) {
      try { bVid.pause(); } catch (_) {}
    }
  }

  // Render the next 12 cards
  renderBatchCards(nextBatch, nextStartIdx);
  currentRenderedBatch++;

  // Place the new barrier at the end of this batch
  appendBatchEndBarrier(currentRenderedBatch, Math.min((currentRenderedBatch + 1) * FEED_BATCH_SIZE, currentBatchFilteredPosts.length), currentBatchFilteredPosts.length);

  isBatchLoading = false;
  isNextBatchReady = false;

  // Smoothly scroll to the first card of the new batch
  const firstNewCard = document.getElementById(`post-card-${nextStartIdx}`);
  if (firstNewCard) {
    firstNewCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Silently pre-cache upcoming batch in background
  const upcomingStartIdx = (currentRenderedBatch + 1) * FEED_BATCH_SIZE;
  const upcomingBatch = currentBatchFilteredPosts.slice(upcomingStartIdx, upcomingStartIdx + FEED_BATCH_SIZE);
  if (upcomingBatch.length > 0) {
    nextBatchPreloadPromise = preloadBatchImages(upcomingBatch, 15000).then(() => {
      isNextBatchReady = true;
    });
  } else {
    nextBatchPreloadPromise = null;
  }
}

// Global alias for compatibility
const loadNextFeedBatch = triggerNextFeedBatch;

function setupSwipeBlockedListener() {
  if (swipeBlockedListenerAttached) return;
  swipeBlockedListenerAttached = true;

  let touchStartY = 0;
  let isTriggering = false;

  window.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches[0]) {
      touchStartY = e.touches[0].clientY;
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (isBatchLoading || isTriggering) return;
    const barrier = document.getElementById('feedBatchEndBarrier');
    if (!barrier) return;

    const scrollY = window.scrollY || window.pageYOffset;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const isAtBottom = (scrollY + windowHeight >= documentHeight - 50);

    if (isAtBottom && e.touches && e.touches[0]) {
      const currentY = e.touches[0].clientY;
      const diff = touchStartY - currentY; // positive = dragged up against bottom block
      if (diff > 50) {
        isTriggering = true;
        triggerNextFeedBatch();
        setTimeout(() => { isTriggering = false; }, 1500);
      }
    }
  }, { passive: true });

  // On desktop / trackpad: wheel scroll past bottom
  window.addEventListener('wheel', (e) => {
    if (isBatchLoading || isTriggering || e.deltaY <= 25) return;
    const barrier = document.getElementById('feedBatchEndBarrier');
    if (!barrier) return;

    const scrollY = window.scrollY || window.pageYOffset;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    if (scrollY + windowHeight >= documentHeight - 30) {
      isTriggering = true;
      triggerNextFeedBatch();
      setTimeout(() => { isTriggering = false; }, 1500);
    }
  }, { passive: true });
}

function getPostFromIndexOrId(indexOrId) {
  if (indexOrId === 'preview') return (typeof currentSynthesizedPost !== 'undefined' ? currentSynthesizedPost : null);
  if (typeof indexOrId === 'number' || (typeof indexOrId === 'string' && /^\d+$/.test(indexOrId))) {
    const idx = parseInt(indexOrId, 10);
    return (typeof currentBatchFilteredPosts !== 'undefined' && currentBatchFilteredPosts[idx]) || (typeof allPosts !== 'undefined' && allPosts[idx]) || null;
  }
  return (typeof allPosts !== 'undefined' && allPosts.find(p => p && p.id === indexOrId)) || null;
}

async function renderFeed(isInitial = false) {
  const container = document.getElementById('feedContainer');
  if (!container) return;
  container.innerHTML = '';
  currentRenderedBatch = 0;
  nextBatchPreloadPromise = null;

  const filtered = allPosts.filter(post => {
    // If a post is a private draft, it must ONLY be visible to its author in 'my_stories'
    const isPrivateDraft = post.isDraft === true || post.isPrivate === true || post.status === 'draft';
    if (isPrivateDraft && currentFilter !== 'my_stories') {
      return false;
    }

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

  currentBatchFilteredPosts = filtered;

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
      initialFeedBatchReady = true;
      dismissInitialFeedLoader(true);
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
      initialFeedBatchReady = true;
      dismissInitialFeedLoader(true);
      return;
    }

    container.innerHTML = `
      <div style="text-align:center; padding: 48px 16px; color: var(--text-muted);">
        <div style="font-size:36px; margin-bottom:12px;">📰</div>
        <div style="font-weight:700; font-size:16px; color:var(--text-primary);">No stories found in this category</div>
        <div style="font-size:13px; margin-top:4px;">Snap a newspaper clipping or paste a news link in the PostCard app to publish here!</div>
      </div>
    `;
    initialFeedBatchReady = true;
    dismissInitialFeedLoader(true);
    return;
  }

  // BATCH 1: Slice first 12 posts (or expand to include deep-linked post)
  const deepPostId = getDeepLinkedPostId();
  let initialRenderCount = FEED_BATCH_SIZE;
  if (deepPostId) {
    const targetIdx = filtered.findIndex(p => p && p.id === deepPostId);
    if (targetIdx >= FEED_BATCH_SIZE) {
      initialRenderCount = Math.min(filtered.length, targetIdx + 2);
    }
  }
  const batch1 = filtered.slice(0, initialRenderCount);

  // Guarantee loop video is playing while preloading Batch 1
  const initVid = document.getElementById('feedInitialVideo') || document.getElementById('feedInitialVideoA');
  if (initVid) {
    try { initVid.play().catch(() => {}); } catch (_) {}
  }

  // 1. Render Batch 1 cards (strictly 12 posts) into DOM immediately behind the video loader
  renderBatchCards(batch1, 0);

  // Strictly append Batch End Barrier directly below the 12th card (posts end at 12!)
  appendBatchEndBarrier(0, batch1.length, filtered.length);

  // Attach swipe blocked trigger listener
  setupSwipeBlockedListener();

  if (isInitial) {
    // Deliberate UX Flow: Keep logo video looping for at least 1 full cycle (~2.2s)
    // AND strictly wait until Card 1 (and the priority swipe cards) are 100% downloaded & decoded in the DOM
    const minVideoCycle = new Promise(resolve => setTimeout(resolve, 2200));

    const cards = container.querySelectorAll('.postcard');
    const priorityCards = Array.from(cards).slice(0, 3); // Cards 1, 2, 3
    const priorityPromises = priorityCards.map(waitForCardImageDecode);

    // Wait until Card 1 (and priority cards) + minVideoCycle are completely finished!
    // The logo video will keep looping seamlessly until the actual DOM image of Card 1 is fully ready!
    try {
      await Promise.all([
        minVideoCycle,
        Promise.race([
          Promise.all(priorityPromises),
          new Promise(resolve => setTimeout(resolve, 18000)) // 18s safety threshold
        ])
      ]);
    } catch (e) {
      console.warn('Initial card decode notice:', e);
    }

    // Pre-decode remaining batch cards in background
    const remainingCards = Array.from(cards).slice(3);
    if (remainingCards.length > 0) {
      try {
        await Promise.race([
          Promise.all(remainingCards.map(waitForCardImageDecode)),
          new Promise(resolve => setTimeout(resolve, 3000))
        ]);
      } catch (_) {}
    }

    initialFeedBatchReady = true;
  } else {
    // Non-initial render (e.g. category switch or refresh): ensure Card 1 is decoded
    const cards = container.querySelectorAll('.postcard');
    const priorityCards = Array.from(cards).slice(0, 2);
    try {
      await Promise.race([
        Promise.all(priorityCards.map(waitForCardImageDecode)),
        new Promise(resolve => setTimeout(resolve, 3000))
      ]);
    } catch (_) {}
  }

  // Smoothly fade out initial logo video loader now that all posters are ready and physically painted in DOM
  dismissInitialFeedLoader();

  // In background, pre-cache Batch 2 (cards 12 to 23)
  const batch2 = filtered.slice(FEED_BATCH_SIZE, FEED_BATCH_SIZE * 2);
  if (batch2.length > 0) {
    isNextBatchReady = false;
    nextBatchPreloadPromise = preloadBatchImages(batch2, 15000).then(() => {
      isNextBatchReady = true;
    });
  } else {
    nextBatchPreloadPromise = null;
  }
}

function setupSeamlessVideoLoop(containerId, videoAId, videoBId, crossfadeLeadSec = 0.48) {
  const container = document.getElementById(containerId);
  const vA = document.getElementById(videoAId);
  const vB = document.getElementById(videoBId);
  if (!container || !vA || !vB) return null;

  let activeVideo = vA;
  let nextVideo = vB;
  let isTransitioning = false;
  let isRunning = false;
  let rafId = null;

  function tick() {
    if (!isRunning) return;

    if (activeVideo && !activeVideo.paused && !activeVideo.ended) {
      const duration = activeVideo.duration;
      const currentTime = activeVideo.currentTime;

      // Solid-Underlay Ping-Pong Dissolve:
      // activeVideo stays 100% solid (opacity 1) at z-index 1 (.behind)
      // nextVideo dissolves smoothly IN ON TOP at z-index 2 (.active)
      if (duration > 2 && (duration - currentTime) <= crossfadeLeadSec && !isTransitioning) {
        isTransitioning = true;

        // Keep activeVideo solid at z-index 1 underneath
        activeVideo.classList.remove('active');
        activeVideo.classList.add('behind');

        // Rewind and start nextVideo
        nextVideo.currentTime = 0;
        const playPromise = nextVideo.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {});
        }

        // Dissolve nextVideo in on top (z-index 2)
        nextVideo.classList.remove('behind');
        nextVideo.classList.add('active');

        // After nextVideo has completely faded in (380ms > 360ms transition)
        setTimeout(() => {
          try {
            activeVideo.pause();
            activeVideo.currentTime = 0;
            activeVideo.classList.remove('behind', 'active');
          } catch (_) {}

          // Swap active and next references
          const temp = activeVideo;
          activeVideo = nextVideo;
          nextVideo = temp;
          isTransitioning = false;
        }, 380);
      }
    }

    rafId = requestAnimationFrame(tick);
  }

  function start() {
    isRunning = true;
    isTransitioning = false;
    vA.classList.remove('behind');
    vA.classList.add('active');
    vB.classList.remove('behind', 'active');
    vA.currentTime = 0;
    vB.currentTime = 0;
    activeVideo = vA;
    nextVideo = vB;

    [vA, vB].forEach(v => {
      try {
        v.muted = true;
        v.defaultMuted = true;
        v.playsInline = true;
        v.setAttribute('playsinline', '');
        v.setAttribute('webkit-playsinline', '');
      } catch (_) {}
    });

    requestAnimationFrame(() => {
      try {
        const p = vA.play();
        if (p !== undefined) p.catch(() => {});
      } catch (_) {}

      // Pre-warm Video B on mobile so frame 0 is decoded in GPU memory before transition
      try {
        const pB = vB.play();
        if (pB !== undefined) {
          pB.then(() => {
            if (!isTransitioning && activeVideo !== vB) {
              vB.pause();
              vB.currentTime = 0;
            }
          }).catch(() => {});
        }
      } catch (_) {}
    });

    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    isRunning = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    try { vA.pause(); } catch (_) {}
    try { vB.pause(); } catch (_) {}
  }

  return { start, stop };
}

let initialFeedBatchReady = false;

function dismissInitialFeedLoader(force = false) {
  if (!force && !initialFeedBatchReady) {
    return;
  }
  if (window._feedVideoLoop) {
    try { window._feedVideoLoop.stop(); } catch (_) {}
    window._feedVideoLoop = null;
  }
  const loader = document.getElementById('feedInitialLoader');
  if (loader && !loader.classList.contains('fade-out')) {
    loader.classList.add('fade-out');
    setTimeout(() => {
      if (loader && loader.parentNode) loader.remove();
      const initVid = document.getElementById('feedInitialVideo') || document.getElementById('feedInitialVideoA');
      if (initVid) {
        try { initVid.pause(); } catch (_) {}
      }
    }, 500);
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

function formatCuratorTakeApt(text) {
  if (!text || typeof text !== 'string') return '';
  let s = text.trim();

  // Strip wrapping quotes, markdown brackets, or label prefixes
  s = s.replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, '');
  s = s.replace(/^(my take|curator take|curator conviction|editorial conviction|take|slant|curator stance|opinion|perspective|spark)\s*:\s*/i, '');

  // Strip leading dashes
  s = s.replace(/^[—–―\s-]+/, '');

  // Strip em-dashes (—), en-dashes (–), horizontal bars (―), double hyphens (--), and spaced hyphens ( - )
  // These give an artificial, robotic "AI-generated" impression. Replace with natural commas so the writing flows organically.
  s = s.replace(/\s*([—–―]|--)\s*/g, ', ');
  s = s.replace(/\s+-\s+/g, ', ');

  // Normalize all whitespaces and linebreaks into clean single spaces
  s = s.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

  // Fix spacing before punctuation marks (e.g. 'crisis , and' -> 'crisis, and')
  s = s.replace(/\s+([.,;:!?])/g, '$1');

  // Fix missing space after punctuation when directly touching a word (e.g. 'today,but' -> 'today, but')
  s = s.replace(/([,;:])([A-Za-z])/g, '$1 $2');
  s = s.replace(/([.!?])([A-Za-z])/g, '$1 $2');

  // Clean duplicate commas or punctuation collisions created by dash replacement
  s = s.replace(/,\s*,+/g, ',');
  s = s.replace(/,\s*([.!?])/g, '$1');
  s = s.replace(/([.!?])\s*,+/g, '$1 ');

  // Normalize duplicate commas/periods (e.g. ',,' -> ',', '..' -> '.')
  s = s.replace(/,{2,}/g, ',');
  s = s.replace(/(?<!\.)\.{2}(?!\.)/g, '.');

  // Subtle English grammar, contraction, and phrasing adjustments without changing substance
  const subtleFixes = [
    // Standard Contractions
    [/\bdont\b/gi, "don't"],
    [/\bcant\b/gi, "can't"],
    [/\bwont\b/gi, "won't"],
    [/\bdidnt\b/gi, "didn't"],
    [/\bdoesnt\b/gi, "doesn't"],
    [/\bisnt\b/gi, "isn't"],
    [/\barent\b/gi, "aren't"],
    [/\bwasnt\b/gi, "wasn't"],
    [/\bwerent\b/gi, "weren't"],
    [/\bhasnt\b/gi, "hasn't"],
    [/\bhavent\b/gi, "haven't"],
    [/\bcouldnt\b/gi, "couldn't"],
    [/\bwouldnt\b/gi, "wouldn't"],
    [/\bshouldnt\b/gi, "shouldn't"],
    [/\byoure\b/gi, "you're"],
    [/\btheyre\b/gi, "they're"],
    [/\bweve\b/gi, "we've"],
    [/\bive\b/gi, "I've"],
    [/\bim\b/g, "I'm"],
    [/\bIm\b/g, "I'm"],
    [/\bi\b/g, 'I'],
    // Subject-verb agreement & common phrasing fixes
    [/\bdoesn't realizes\b/gi, "doesn't realize"],
    [/\bdoes not realizes\b/gi, "does not realize"],
    [/\bdidn't got\b/gi, "didn't get"],
    [/\bdid not got\b/gi, "did not get"],
    [/\bdidn't lived\b/gi, "didn't live"],
    [/\bdid not lived\b/gi, "did not live"],
    [/\bspend it's time\b/gi, 'spend its time'],
    [/\bhumanly nature\b/gi, 'human nature'],
    [/\bquiet a natural\b/gi, 'quite a natural'],
    [/\bcausing the earth inhabitable\b/gi, 'making the Earth uninhabitable'],
    [/\bcausing the earth to be inhabitable\b/gi, 'making the Earth uninhabitable'],
    [/\bunsecured future feeling\b/gi, 'a feeling of an insecure future'],
    [/\bbehavioural change of people\b/gi, 'behavioural changes of people'],
    [/\bHigh time all work\b/gi, 'It is high time we all work'],
    [/\bhigh time all work\b/gi, 'it is high time we all work'],
    [/\ba act\b/gi, 'an act'],
    [/\ba expected\b/gi, 'an expected'],
    [/\ba insecure\b/gi, 'an insecure'],
    [/\bpurpose less\b/gi, 'purposeless'],
    [/\binspite of\b/gi, 'in spite of'],
    [/\bacross world\b/gi, 'across the world'],
    [/\baddeessal\b/gi, 'addressal'],
    [/\bthis projects turns out\b/gi, 'this project turns out'],
    [/\bneed to be take ownership\b/gi, 'need to take ownership'],
    [/\bother can't escape\b/gi, "others can't escape"],
    [/\bother cannot escape\b/gi, 'others cannot escape']
  ];

  for (const [pattern, replacement] of subtleFixes) {
    s = s.replace(pattern, replacement);
  }

  // Break run-on comma splices where a new sentence clearly starts
  s = s.replace(/,\s*(All of these are|Every living being|It is high time|High time|Rather|This is|There must be|True elegance|True sanctity)\b/g, (match, p1) => '. ' + p1);

  // Capitalize proper nouns
  s = s.replace(/\bthe earth\b/g, 'the Earth');
  s = s.replace(/\bthe earth's\b/g, "the Earth's");

  // Capitalize first letter of every sentence
  s = s.replace(/(^|[.!?]\s+)([a-z])/g, (match, prefix, char) => prefix + char.toUpperCase());

  // Clean trailing punctuation: remove dangling commas, colons, semicolons, hyphens, and em-dashes
  s = s.replace(/[,;:\-\s—–―]+$/, '');

  // Ensure apt sentence completion
  if (!/[.!?]$/.test(s)) {
    s += '.';
  }

  return s;
}

function getCuratorTakeText(post) {
  if (!post) return '';
  // Strictly prioritize the polished curator input (full length, original voice & thoughts with gentle grammar/phrase correction)
  let text = (post.polishedCuratorTake && post.polishedCuratorTake.trim())
    || (post.userSlantTake && post.userSlantTake.trim())
    || (post.generationInputs?.slantTake && post.generationInputs.slantTake.trim())
    || (post.rawUserSlant && post.rawUserSlant.trim());

  // Fallback to elevated curator take / hook / summary ONLY when no curator slant exists
  if (!text) {
    text = (post.curatorTake && post.curatorTake.trim())
      || (post.creatorOpinion && post.creatorOpinion.trim());
  }
  if (!text && (post.sourceType === 'inner_voice' || post.publicationName === 'Inner Voice')) {
    text = (post.summary && post.summary.trim()) || (post.hook && post.hook.trim()) || '';
  }
  if (!text) {
    text = (post.hook && post.hook.trim()) || (post.summary && post.summary.trim()) || '';
  }
  return formatCuratorTakeApt(text);
}

function getCaptionSnippet(text, maxLen = 140) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  const cutoff = text.lastIndexOf(' ', maxLen);
  let s = (cutoff !== -1 && cutoff >= 80) ? text.substring(0, cutoff) : text.substring(0, maxLen);
  s = s.replace(/[,;:\-\s]+$/, '');
  // Trim dangling prepositions or conjunctions before ellipsis
  s = s.replace(/\s+(of|to|in|for|with|a|an|the|and|but|or|as|by|on|at|that|which)$/i, '');
  return s.replace(/[,;:\-\s]+$/, '');
}

window.expandedCaptionsState = window.expandedCaptionsState || {};

function toggleCaptionExpand(index, shouldExpand) {
  if (typeof shouldExpand !== 'boolean') {
    shouldExpand = !window.expandedCaptionsState[index];
  }
  window.expandedCaptionsState[index] = shouldExpand;

  const snippetEl = document.getElementById(`caption-snippet-${index}`);
  if (!snippetEl) return;

  const post = getPostFromIndexOrId(index);
  if (!post) return;

  const handle = post.creatorHandle || '@curator';
  const fullText = getCuratorTakeText(post);
  const isLong = fullText.length > 160;

  if (!isLong) {
    snippetEl.classList.remove('is-expanded');
    snippetEl.onclick = null;
    snippetEl.style.cursor = 'default';
    snippetEl.innerHTML = `
      <span class="post-creator-handle"><strong>${escapeHtml(handle)}</strong></span>
      <span class="post-caption-text" id="caption-text-${index}">${escapeHtml(fullText)}</span>
    `;
    return;
  }

  if (shouldExpand) {
    snippetEl.classList.add('is-expanded');
    snippetEl.onclick = null;
    snippetEl.style.cursor = 'default';
    snippetEl.innerHTML = `
      <span class="post-creator-handle"><strong>${escapeHtml(handle)}</strong></span>
      <span class="post-caption-text" id="caption-text-${index}">${escapeHtml(fullText)}</span>
      <button type="button" class="read-more-btn" onclick="event.stopPropagation(); toggleCaptionExpand('${index}', false)">less</button>
    `;
  } else {
    snippetEl.classList.remove('is-expanded');
    snippetEl.onclick = () => toggleCaptionExpand(index, true);
    snippetEl.style.cursor = 'pointer';
    const collapsedSnippet = getCaptionSnippet(fullText, 140);
    snippetEl.innerHTML = `
      <span class="post-creator-handle"><strong>${escapeHtml(handle)}</strong></span>
      <span class="post-caption-text" id="caption-text-${index}">${escapeHtml(collapsedSnippet)}</span>
      <button type="button" class="read-more-btn" onclick="event.stopPropagation(); toggleCaptionExpand('${index}', true)">... more</button>
    `;
  }
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

function getYouTubeEmbedUrl(url) {
  if (!url) return null;
  const str = String(url).trim();
  // Matches youtube.com/shorts/ID, youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID, etc.
  const m = str.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i);
  return (m && m[1]) ? `https://www.youtube.com/embed/${m[1]}` : null;
}

function getVimeoEmbedUrl(url) {
  if (!url) return null;
  const str = String(url).trim();
  const m = str.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  return (m && m[1]) ? `https://player.vimeo.com/video/${m[1]}` : null;
}

function isInnerVoicePost(post) {
  if (!post) return false;
  // If it has an external link, video, or physical paper cut, it HAS an external source!
  if (post.digitalLink || post.videoUrl || post.paperCutImage || post.hasPaperCut || post.sourceType === 'photo' || post.sourceType === 'youtube' || post.sourceType === 'digital_link') {
    return false;
  }
  if (post.sourceType === 'inner_voice' || post.sourceType === 'my_slant') return true;
  if (post.isMySlant === true) return true;
  const pub = (post.publicationName || '').toLowerCase().trim();
  if (pub === 'inner voice' || pub === 'my slant' || pub === 'personal reflection' || pub === 'first-person essay') return true;
  return post.categoryBadge === 'OPINION' || post.sourceType === 'opinion';
}

function getSourceTier(post) {
  // Book Excerpt
  if (post.sourceType === 'book_excerpt') {
    return 'tier_book';
  }

  // Pure Inner Voice / Personal Reflection (no external source)
  if (isInnerVoicePost(post)) {
    return 'tier3_opinion';
  }

  // Physical newspaper cut
  const hasPaper = post.sourceType === 'photo' 
    || !!post.paperCutImage 
    || !!post.hasPaperCut
    || (post.originalPhotoUrl && (post.originalPhotoUrl.includes('clipping') || post.sourceType === 'photo'))
    || (post.originalPhotoBase64 && post.originalPhotoBase64.length > 50 && post.sourceType !== 'inner_voice')
    || (post.originalPhotoPath && !post.originalPhotoPath.startsWith('http') && post.originalPhotoPath !== post.digitalLink)
    || (post.id && ['692d99fc-d140-4d1c-9275-3263a7c187b7', '79cb4873-7c1b-402c-aebb-71fcebbefa5d', '83940fae-4ad7-43f6-9329-91cd17752f78', '9b55d7ea-8a78-4ef1-a068-cec226e200fd'].includes(post.id));

  if (hasPaper) {
    return 'tier1_press';
  }

  // Video source (YouTube, Vimeo, broadcast)
  const videoUrl = post.videoUrl || post.digitalLink || '';
  if (post.sourceType === 'youtube' || post.sourceType === 'video' || !!post.videoUrl || !!post.isVideo || !!getYouTubeEmbedUrl(videoUrl) || !!getVimeoEmbedUrl(videoUrl)) {
    return 'tier_video';
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
  } else if (post.posterBase64) {
    bgImgSrc = post.posterBase64.startsWith('data:')
      ? post.posterBase64
      : `data:image/png;base64,${post.posterBase64}`;
  } else if (post.illustrationUrl) {
    let cleanUrl = post.illustrationUrl;
    if (cleanUrl.includes('pollinations.ai') || cleanUrl.includes('unsplash.com')) {
      cleanUrl = `/posters/${post.id}.png`;
    }
    const isSeaPhoto = cleanUrl.includes('photo-1507525428034');
    const isActuallyBeach = /beach|coast|ocean|sea|shore|sand|surf/i.test((post.heroCue || '') + ' ' + (post.adaptedHeadline || '') + ' ' + (post.originalHeadline || ''));
    if (!isSeaPhoto || isActuallyBeach) {
      bgImgSrc = cleanUrl;
    } else {
      bgImgSrc = `/posters/${post.id}.png`;
    }
  } else if (post.id) {
    bgImgSrc = `/posters/${post.id}.png`;
  }

  const imgHtml = bgImgSrc
    ? `<img class="slide-hook-bg" src="${escapeHtml(bgImgSrc)}" alt="" loading="eager" referrerpolicy="no-referrer" onerror="handlePosterImageError(this, '${escapeHtml(post.categoryBadge || '')}')">`
    : `<img class="slide-hook-bg" src="" alt="" style="display:none;" loading="eager" referrerpolicy="no-referrer" onerror="handlePosterImageError(this, '${escapeHtml(post.categoryBadge || '')}')">`;

  const bgHtml = `${fallbackCoverHtml}${imgHtml}`;

  // 1. The Headline Excerpt of Source (Original Article / News Wire / Spark Excerpt)
  let rawNews = '';
  if (tier === 'tier3_opinion') {
    rawNews = (post.spark && post.spark.trim())
      ? post.spark.trim()
      : ((post.originalHeadline && post.originalHeadline.trim())
          ? post.originalHeadline.trim()
          : ((post.userContext && post.userContext.trim())
              ? post.userContext.trim()
              : (post.receiptHighlightQuote || post.pullQuote || post.hook || '')));
  } else {
    // For news & web sources: pick authentic original source headline or high-signal excerpt
    if (post.originalHeadline && post.originalHeadline.trim() && post.originalHeadline.trim() !== (post.adaptedHeadline || '').trim()) {
      rawNews = post.originalHeadline.trim();
    } else if (post.receiptHighlightQuote && post.receiptHighlightQuote.trim() && post.receiptHighlightQuote.trim() !== (post.adaptedHeadline || '').trim()) {
      rawNews = post.receiptHighlightQuote.trim();
    } else if (post.pullQuote && post.pullQuote.trim() && post.pullQuote.trim() !== (post.adaptedHeadline || '').trim()) {
      rawNews = post.pullQuote.trim();
    } else if (post.originalHeadline && post.originalHeadline.trim()) {
      rawNews = post.originalHeadline.trim();
    } else if (post.hook && post.hook.trim()) {
      rawNews = post.hook.trim();
    }
  }
  if (rawNews) {
    rawNews = rawNews.replace(/^(the spark|curator stance|source headline)\s*:\s*["']?/i, '').replace(/["']?$/i, '').trim();
  }

  let newsFragmentHtml = '';
  if (rawNews) {
    const words = rawNews.split(/\s+/);
    const formattedNews = words.length > 14 ? words.slice(0, 14).join(' ') + '...' : rawNews;
    
    let fragIcon = '🗞️';
    let fragTitle = `SOURCE HEADLINE • ${pubName.toUpperCase()}`;
    if (tier === 'tier2_web') {
      fragIcon = '🌐';
      fragTitle = `SOURCE HEADLINE • ${(cleanHost || 'ONLINE').toUpperCase()}`;
    } else if (tier === 'tier3_opinion') {
      fragIcon = slantIcon;
      fragTitle = `SOURCE INSPIRATION • THE SPARK`;
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
        <!-- Bottom-Left: slant.today disabled for now | Bottom-Right: Every thought deserves a frame -->
        <div class="poster-brand-footer">
          <span class="poster-footer-punchline" style="margin-left: auto;">Every thought deserves a frame</span>
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
  let rawOpinion = (post.curatorTake && post.curatorTake.trim())
    ? post.curatorTake.trim()
    : ((post.creatorOpinion && post.creatorOpinion.trim())
        ? post.creatorOpinion.trim()
        : ((post.whyItMatters && post.whyItMatters.trim())
            ? post.whyItMatters.trim()
            : (post.hook || 'Strategic structural shift in motion.')));
  while (rawOpinion.endsWith('.') || rawOpinion.endsWith('…')) {
    if (rawOpinion.endsWith('...')) rawOpinion = rawOpinion.slice(0, -3).trim();
    else if (rawOpinion.endsWith('…')) rawOpinion = rawOpinion.slice(0, -1).trim();
    else break;
  }
  if (!rawOpinion.endsWith('.') && !rawOpinion.endsWith('!') && !rawOpinion.endsWith('?')) {
    rawOpinion += '.';
  }
  const opinion = escapeHtml(rawOpinion);

  let rawSlideTitle = (post.critiqueBadge && post.critiqueBadge.trim()) ? post.critiqueBadge.trim() : '';
  if (!rawSlideTitle && post.keyTakeaways && post.keyTakeaways.length > 0) {
    const firstTakeaway = String(post.keyTakeaways[0]).trim();
    if (firstTakeaway.includes(':')) {
      const prefix = firstTakeaway.split(':')[0].trim();
      if (prefix.length >= 3 && prefix.length <= 40) {
        rawSlideTitle = prefix;
      }
    } else if (firstTakeaway.split(/\s+/).length <= 6) {
      rawSlideTitle = firstTakeaway;
    }
  }
  if (!rawSlideTitle) {
    rawSlideTitle = (tier === 'tier3_opinion')
      ? (post.slantTone === 'heart' ? 'PERSONAL REFLECTION' : 'CORE CONVICTION')
      : 'THE CRITICAL PERSPECTIVE';
  }
  const slideTitle = escapeHtml(rawSlideTitle.toUpperCase());

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
  } else if (post.posterBase64) {
    bgCritiqueImgSrc = post.posterBase64.startsWith('data:')
      ? post.posterBase64
      : `data:image/png;base64,${post.posterBase64}`;
  } else if (post.illustrationUrl) {
    let cleanUrl = post.illustrationUrl;
    if (cleanUrl.includes('pollinations.ai')) {
      cleanUrl = `/posters/${post.id}.png`;
    }
    const isSeaPhoto = cleanUrl.includes('photo-1507525428034');
    const isActuallyBeach = /beach|coast|ocean|sea|shore|sand|surf/i.test((post.heroCue || '') + ' ' + (post.adaptedHeadline || '') + ' ' + (post.originalHeadline || ''));
    if (!isSeaPhoto || isActuallyBeach) {
      bgCritiqueImgSrc = cleanUrl;
    } else {
      bgCritiqueImgSrc = `/posters/${post.id}.png`;
    }
  }

  const critiqueImgHtml = bgCritiqueImgSrc
    ? `<img class="slide-hook-bg" src="${escapeHtml(bgCritiqueImgSrc)}" alt="" loading="eager" referrerpolicy="no-referrer" onerror="handlePosterImageError(this, '${escapeHtml(post.categoryBadge || '')}')">`
    : `<img class="slide-hook-bg" src="" alt="" style="display:none;" loading="eager" referrerpolicy="no-referrer" onerror="handlePosterImageError(this, '${escapeHtml(post.categoryBadge || '')}')">`;

  const bgHtml = `${fallbackCritiqueCoverHtml}${critiqueImgHtml}`;

  return `
    ${bgHtml}
    <div class="slide-hook-top-scrim"></div>
    <div class="slide-hook-bottom-scrim" style="height: 32%; background: linear-gradient(to bottom, transparent 0%, rgba(7,11,18,0.6) 28%, rgba(7,11,18,0.96) 100%);"></div>
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
        <!-- Bottom-Left: slant.today disabled for now | Bottom-Right: Every thought deserves a frame -->
        <div class="poster-brand-footer">
          <span class="poster-footer-punchline" style="margin-left: auto;">Every thought deserves a frame</span>
        </div>
      </div>
    </div>
  `;
}

function isDuplicateOfUserTake(candidateText, post) {
  if (!candidateText || !post) return false;
  const clean = (t) => String(t || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const cleanCand = clean(candidateText);
  if (cleanCand.length < 15) return false;

  const userTakeCandidates = [
    post.polishedCuratorTake,
    post.curatorTake,
    post.creatorOpinion,
    post.rawUserSlant,
    post.userSlantTake,
    post.generationInputs?.slantTake
  ].filter(Boolean);

  for (const take of userTakeCandidates) {
    const cleanTake = clean(take);
    if (cleanTake.length < 15) continue;
    if (cleanCand === cleanTake) return true;
    if (cleanCand.length <= cleanTake.length + 10 && cleanTake.includes(cleanCand)) return true;
    if (cleanTake.length <= cleanCand.length + 10 && cleanCand.includes(cleanTake)) return true;
  }
  return false;
}

function buildSlide3Html(post, index) {
  const tier = getSourceTier(post);
  const cleanHost = getCleanDomain(post.digitalLink);
  const handle = escapeHtml(post.creatorHandle || '@curator');
  const slantIcon = (post.slantIcon && post.slantIcon !== '💭') ? post.slantIcon : (post.slantTone === 'heart' ? '❤️' : '🧠');

  let pubName = post.publicationName || 'THE FINANCIAL CHRONICLE';
  if (pubName.includes('•')) {
    const parts = pubName.split('•');
    pubName = parts[parts.length - 1].trim();
  }
  pubName = pubName.replace(/^(NEWSPAPER|ARTICLE|BOOK|MAGAZINE|PRESS):\s*/i, '').trim();
  if (!pubName) pubName = 'THE NEW INDIAN EXPRESS';
  const cleanPubUpper = escapeHtml(pubName.toUpperCase());

  const headline = escapeHtml(
    (tier === 'tier3_opinion'
      ? (post.adaptedHeadline || post.originalHeadline)
      : (post.originalHeadline || post.adaptedHeadline)) || 'Curated Editorial'
  );

  const cleanExcerpt = (txt) => {
    if (!txt) return '';
    return String(txt)
      .replace(/^(the spark|curator stance|paragraph \d+)\s*:\s*["']?/i, '')
      .replace(/["']?$/i, '')
      .trim();
  };

  const isInnerVoice = isInnerVoicePost(post);

  // Extract synthesis paragraphs from summary or spark
  let summaryParas = [];
  if (post.summary && typeof post.summary === 'string') {
    summaryParas = post.summary.split(/\n\s*\n/).map(p => cleanExcerpt(p)).filter(p => p.length > 20);
  }
  if (summaryParas.length === 0 && post.summary) {
    summaryParas = [cleanExcerpt(post.summary)];
  }

  // De-duplicate summary paragraphs against user's short stance on Poster 2
  summaryParas = summaryParas.filter(p => !isDuplicateOfUserTake(p, post));

  // Source context & reporting excerpts
  let excerpts = post.resolvedArticleExcerpts || post.articleExcerpts || [];
  if (Array.isArray(excerpts)) {
    excerpts = excerpts.map(e => cleanExcerpt(e)).filter(Boolean);
    excerpts = excerpts.filter(e => !isDuplicateOfUserTake(e, post));
  } else {
    excerpts = [];
  }

  // Consolidate broadsheet essay paragraphs
  let essayParas = [];
  if (summaryParas.length > 0) {
    essayParas = [...summaryParas];
  } else if (excerpts.length > 0) {
    essayParas = [...excerpts];
  } else if (post.spark) {
    essayParas = [cleanExcerpt(post.spark)];
  }

  if (essayParas.length === 0) {
    essayParas = [`Reporting on "${headline}" examines key structural developments and observed outcomes.`];
  }

  // Catalyst Scene Photo on Poster 3 for Inner Voice
  let scenePhotoHtml = '';
  if (isInnerVoice) {
    const rawPhoto = post.catalystPhoto || post.catalystPhotoBase64 || post.originalPhotoBase64 || post.originalPhotoUrl || post.generationInputs?.catalystPhoto || post.generationInputs?.catalystPhotoBase64 || post.generationInputs?.innerVoiceImageBase64;
    if (rawPhoto && typeof rawPhoto === 'string' && rawPhoto.length > 20) {
      let imgSrc = rawPhoto;
      if (!rawPhoto.startsWith('data:') && !rawPhoto.startsWith('http') && !rawPhoto.startsWith('/')) {
        imgSrc = `data:${post.originalPhotoMimeType || post.catalystPhotoMimeType || 'image/jpeg'};base64,` + rawPhoto;
      }
      scenePhotoHtml = `
        <div class="receipt-scene-box">
          <img src="${imgSrc}" class="receipt-scene-photo" alt="Catalyst Scene">
          <div class="receipt-scene-caption">
            <span class="scene-caption-icon">📸</span>
            <span class="scene-caption-text">ARCHIVAL CATALYST SNAPSHOT</span>
          </div>
        </div>
      `;
    }
  }

  const leadRaw = essayParas[0];
  const firstChar = leadRaw.charAt(0).toUpperCase();
  const restLead = leadRaw.slice(1);
  const leadHtml = `<p class="receipt-p1"><span class="broadsheet-dropcap">${escapeHtml(firstChar)}</span>${escapeHtml(restLead)}</p>`;

  let essayBodyHtml = '';
  if (essayParas.length > 1) {
    essayParas.slice(1).forEach(p => {
      if (p && p !== leadRaw) {
        essayBodyHtml += `<p class="receipt-p3">${escapeHtml(p)}</p>`;
      }
    });
  } else if (excerpts.length > 1) {
    excerpts.slice(1).forEach(p => {
      if (p && p !== leadRaw) {
        essayBodyHtml += `<p class="receipt-p3">${escapeHtml(p)}</p>`;
      }
    });
  }

  // Highlight Quote
  let quoteHtml = '';
  const quoteText = cleanExcerpt(post.receiptHighlightQuote || post.pullQuote);
  if (quoteText && !isDuplicateOfUserTake(quoteText, post) && !leadRaw.includes(quoteText.slice(0, 30))) {
    quoteHtml = `
      <div class="receipt-highlight" style="margin-top: 6px; margin-bottom: 6px;">
        <div class="highlighter-label">
          <span>✨</span>
          <span>CORE CONVICTION</span>
        </div>
        <div class="highlighter-text" style="font-size: 10.5px; font-weight: 600; line-height: 1.4;">
          “${escapeHtml(quoteText)}”
        </div>
      </div>
    `;
  }

  // Evidentiary metric badge
  let metricHtml = '';
  if (post.keyMetric && String(post.keyMetric).trim()) {
    metricHtml = `
      <div class="receipt-metric-row">
        <span class="receipt-metric-badge">RECORDED METRIC</span>
        <span class="receipt-metric-val">${escapeHtml(String(post.keyMetric).trim())}</span>
      </div>
    `;
  }

  // Structured takeaways card
  let takeawaysHtml = '';
  const takeaways = Array.isArray(post.keyTakeaways) ? post.keyTakeaways.filter(Boolean) : [];
  if (takeaways.length > 0) {
    const topTakeaways = takeaways.slice(0, 3);
    takeawaysHtml = `
      <div class="receipt-takeaways-card" style="margin-top: 6px;">
        <div class="takeaways-header">
          <span class="takeaways-icon">⚖️</span>
          <span class="takeaways-title">KEY PRINCIPLES</span>
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
      <div class="receipt-takeaways-card" style="margin-top: 6px;">
        <div class="takeaways-header">
          <span class="takeaways-icon">🔍</span>
          <span class="takeaways-title">WHY THIS MATTERS</span>
        </div>
        <p class="takeaway-why-text">${escapeHtml(String(post.whyItMatters).trim())}</p>
      </div>
    `;
  }

  return `
    <div class="slant-minute-scroll-viewport" onscroll="window._lastSlantMinuteScroll = Date.now()">
      <!-- 4-Corner Branding Top Row: Top-Left Logo + Brand, Top-Right Creator + Slide -->
      <div class="receipt-brand-corner-bar">
        <div class="receipt-corner-brand">
          <img src="/logo.png" class="receipt-corner-logo" alt="Slant">
          <span class="receipt-brand-text">SLANT MINUTE</span>
        </div>
        <div class="receipt-corner-creator">
          <span class="receipt-creator-name">${handle}</span>
          <span class="receipt-corner-slide-num">⏱️ 1-MIN • 03 / 03</span>
        </div>
      </div>

      <!-- 1. Classic Broadsheet Masthead Header -->
      <div class="receipt-header">
        <div class="receipt-masthead-thick"></div>
        <div class="receipt-masthead-thin"></div>
        <div class="receipt-pub-title">SLANT MINUTE</div>
        <div class="receipt-rules">
          <span>VOL. I • NO. 1</span>
          <span class="receipt-rules-center">${isInnerVoice ? 'FIRST-PERSON REFLECTION' : (tier === 'tier_video' ? 'BROADCAST EDITORIAL ESSAY' : 'BROADSHEET EDITORIAL ESSAY')}</span>
          <span>60-SEC BROADSHEET</span>
        </div>
        <div class="receipt-masthead-bottom"></div>
      </div>
      
      <!-- 2. Story Headline & Editorial Byline -->
      <div class="receipts-headline-box">
        <h4 class="receipt-headline">${headline}</h4>
        <div class="receipts-byline">
          ${isInnerVoice 
            ? `<span>BY ${handle}</span><span class="receipts-opinion-tag">${slantIcon} INNER VOICE</span>` 
            : `<span>BY ${handle} • IN DIALOGUE WITH: ${cleanPubUpper}</span><span class="receipts-archive-tag">EDITORIAL ESSAY</span>`}
        </div>
        <div class="receipts-hairline"></div>
      </div>

      <!-- 3. Synthesized Editorial Content: Receipts Broadsheet -->
      <div class="receipt-paragraphs" style="flex: none; min-height: auto; height: auto; overflow: visible;">
        ${scenePhotoHtml}
        ${metricHtml}
        ${leadHtml}
        ${essayBodyHtml}
        ${quoteHtml}
        ${takeawaysHtml}
      </div>

      <!-- 4. Broadsheet Archival Bottom Folio -->
      <div class="receipt-footer" style="flex-shrink: 0; margin-top: auto; padding-top: 18px; padding-bottom: 6px; width: 100%; clear: both;">
        <div class="receipt-folio-rule" style="width: 100%; height: 1px; background: #0F172A; margin: 0 0 6px 0;"></div>
        <div class="receipt-folio-text" style="display: flex; justify-content: flex-end; align-items: center; width: 100%; margin-top: 0; line-height: 1.3;">
          <span class="receipt-folio-author" style="font-style: italic; letter-spacing: 0.4px; color: #475569; margin-left: auto;">Every thought deserves a frame • Scroll broadsheet ↕</span>
        </div>
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
  if (post && post.id) {
    card.id = `post-${post.id}`;
    card.setAttribute('data-post-id', post.id);
  }

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
  const canDelete = canDeletePost(post);
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

  const isInnerVoice = isInnerVoicePost(post);

  // 3-Poster Carousel Trio Frame in 3:4 Aspect Ratio (Clean, Unobstructed Editorial Artwork)
  const visualSectionHtml = `
    <div class="carousel-view ${isClean ? 'clean-view' : ''}" id="carousel-${index}" data-post-index="${index}" data-current-slide="0">
      ${index === 'preview' ? `
        <button type="button" class="preview-poster-eye-btn" onclick="event.stopPropagation(); openWholePosterModal(currentPreviewSlide || 0)" title="View whole poster in high definition before publishing">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          <span>Whole Poster</span>
        </button>
      ` : ''}
      <div class="carousel-track" id="track-${index}">
        <div class="carousel-slide slide-hook" ${isInnerVoice ? 'style="cursor: default;"' : (index === 'preview' ? `onclick="openWholePosterModal(0)" style="cursor: pointer;" title="Click to view whole poster"` : `onclick="openDetailModal('${index}')" style="cursor: pointer;"`)}>
          ${buildSlide1Html(post, index)}
        </div>
        <div class="carousel-slide slide-critique" ${isInnerVoice ? 'style="cursor: default;"' : (index === 'preview' ? `onclick="openWholePosterModal(1)" style="cursor: pointer;" title="Click to view whole poster"` : `onclick="openDetailModal('${index}')" style="cursor: pointer;"`)}>
          ${buildSlide2Html(post, index)}
        </div>
        <div class="carousel-slide slide-receipt" ${index === 'preview' ? `onclick="openWholePosterModal(2)" style="cursor: pointer;" title="Click to view whole poster"` : 'style="cursor: default;"'}>
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

  // Instagram-style Caption Area: Creator Handle + Curator Take + Native Inline Expand
  const curatorTakeClean = getCuratorTakeText(post);
  const isCaptionExpanded = !!(window.expandedCaptionsState && window.expandedCaptionsState[index]);
  const isLongCaption = curatorTakeClean.length > 160;

  let captionSnippetHtml = '';
  if (!isLongCaption) {
    // Concise take (1-2 sentences): display fully with zero ellipsis or truncation
    captionSnippetHtml = `
      <span class="post-creator-handle"><strong>${escapeHtml(handle)}</strong></span>
      <span class="post-caption-text" id="caption-text-${index}">${escapeHtml(curatorTakeClean)}</span>
    `;
  } else if (isCaptionExpanded) {
    // Expanded inline state: show complete text with subtle 'less' toggle
    captionSnippetHtml = `
      <span class="post-creator-handle"><strong>${escapeHtml(handle)}</strong></span>
      <span class="post-caption-text" id="caption-text-${index}">${escapeHtml(curatorTakeClean)}</span>
      <button type="button" class="read-more-btn" onclick="event.stopPropagation(); toggleCaptionExpand('${index}', false)">less</button>
    `;
  } else {
    // Collapsed state: neat word-aligned snippet with '... more' button
    const collapsedSnippet = getCaptionSnippet(curatorTakeClean, 140);
    captionSnippetHtml = `
      <span class="post-creator-handle"><strong>${escapeHtml(handle)}</strong></span>
      <span class="post-caption-text" id="caption-text-${index}">${escapeHtml(collapsedSnippet)}</span>
      <button type="button" class="read-more-btn" onclick="event.stopPropagation(); toggleCaptionExpand('${index}', true)">... more</button>
    `;
  }

  card.innerHTML = `
    <div class="post-header">
      <div class="creator-info">
        <div class="creator-avatar">
          <div class="avatar-inner">${initial}</div>
        </div>
        <span class="creator-handle">${escapeHtml(handle)}</span>
        ${index === 'preview' ? `
          <button type="button" class="preview-card-eye-btn" onclick="event.stopPropagation(); openWholePosterModal(currentPreviewSlide || 0)" title="View whole poster in high definition before publishing">👁️ Whole Poster</button>
          <button type="button" class="preview-card-edit-btn" onclick="event.stopPropagation(); openEditPosterModal(currentPreviewSlide || 0)" title="Edit poster headlines, takes, and receipts">✏️ Edit Content</button>
        ` : ''}
        ${(post.isDraft || post.status === 'draft' || post.isPrivate) && index !== 'preview' ? '<span class="post-draft-badge" style="display:inline-flex; align-items:center; gap:4px; font-size:10px; font-weight:700; background:rgba(245, 158, 11, 0.16); color:#F59E0B; border:1px solid rgba(245, 158, 11, 0.4); padding:2px 7px; border-radius:8px; margin-left:8px; letter-spacing:0.3px;">🔖 PRIVATE DRAFT</span>' : ''}
      </div>
      <div class="post-menu-container">
        <button type="button" class="post-menu-btn" onclick="event.stopPropagation(); togglePostMenu('${index}')" title="More options" aria-label="More options">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="1.5"></circle>
            <circle cx="19" cy="12" r="1.5"></circle>
            <circle cx="5" cy="12" r="1.5"></circle>
          </svg>
        </button>
        <div class="post-menu-dropdown" id="post-menu-${index}">
          ${canDelete ? `
            <button type="button" class="post-menu-item text-primary-action" onclick="event.stopPropagation(); closeAllPostMenus(); openGenerationContextModal('${post.id}')" title="Inspect generation inputs and regenerate">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              <span>Generation Inputs</span>
            </button>
            <button type="button" class="post-menu-item text-danger" onclick="event.stopPropagation(); closeAllPostMenus(); confirmDeletePost('${post.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
              <span>Delete Slant</span>
            </button>
          ` : ''}
          <button type="button" class="post-menu-item" onclick="event.stopPropagation(); closeAllPostMenus(); sharePosters('${index}')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="18" cy="5" r="3"></circle>
              <circle cx="6" cy="12" r="3"></circle>
              <circle cx="18" cy="19" r="3"></circle>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
            <span>Share Slant</span>
          </button>
          <button type="button" class="post-menu-item" onclick="event.stopPropagation(); closeAllPostMenus(); copyCardShareLink('${post.id}')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
            <span>Copy Link</span>
          </button>
        </div>
      </div>
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
      </div>

      <!-- Minimalist Action Icons: Book Cover, Source Summary, Newspaper Paper Cut -->
      <div class="action-group-right">
        ${isBook ? `
          <button class="icon-action-btn" onclick="openDetailModal('${index}')" title="View Book Cover & Source">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
          </button>
        ` : ''}

        ${(!isInnerVoice && !isBook) ? `
          <button type="button" class="icon-action-btn source-summary-action-btn" onclick="openDetailModal('${index}')" title="View Source Summary & Facts" aria-label="View Source Summary & Facts">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#0284C7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </button>
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

    <!-- Instagram-style Caption Area: Creator Handle + Curator Take + Native Inline Expand -->
    <div class="post-content">
      <div class="post-summary-snippet ${isCaptionExpanded ? 'is-expanded' : ''}" id="caption-snippet-${index}" ${isLongCaption && !isCaptionExpanded ? `onclick="toggleCaptionExpand('${index}', true)" style="cursor: pointer;"` : ''}>
        ${captionSnippetHtml}
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
    if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
      window._justSwipedCarousel = Date.now();
    }
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
    if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
      window._justSwipedCarousel = Date.now();
    }
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

function togglePostMenu(index) {
  const menu = document.getElementById(`post-menu-${index}`);
  if (!menu) return;
  const isShowing = menu.classList.contains('show');
  closeAllPostMenus();
  if (!isShowing) {
    menu.classList.add('show');
  }
}

function closeAllPostMenus() {
  document.querySelectorAll('.post-menu-dropdown.show').forEach(m => m.classList.remove('show'));
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.post-menu-container')) {
    closeAllPostMenus();
  }
});

/* ============================================================
   MODALS & ACTIONS
   ============================================================ */

function openDetailModal(index) {
  if (index === 'preview') return;
  // Guard against accidental opening while scrolling the Slant Minute broadsheet or swiping
  if (window._justSwipedCarousel && (Date.now() - window._justSwipedCarousel < 300)) {
    return;
  }
  if (window._lastSlantMinuteScroll && (Date.now() - window._lastSlantMinuteScroll < 300)) {
    return;
  }
  activePostIndex = index;
  const post = getPostFromIndexOrId(index) || (typeof allPosts !== 'undefined' && allPosts.find(p => p && p.id === index));
  if (!post) return;

  // Let there not be source proof reporting for inner voice posts
  if (isInnerVoicePost(post)) {
    return;
  }

  const cleanHost = getCleanDomain(post.digitalLink || post.videoUrl || '');
  const handle = escapeHtml(post.creatorHandle || '@curator');
  const ledger = post.sourceLedger || post.generationInputs?.sourceLedger;

  // 1. Stars Badge (Top Banner)
  const starsBadge = document.getElementById('proofStarsBadge');
  if (starsBadge) {
    if (ledger) {
      const starsCount = Math.min(3, Math.max(1, Number(ledger.stars || ledger.completeness_score || 3)));
      const starsHtml = '★'.repeat(starsCount) + '☆'.repeat(3 - starsCount);
      const label = ledger.stars_label || (starsCount === 3 ? '3/3 High Substance Anchor' : `${starsCount}/3 Anchor`);
      starsBadge.innerHTML = `<span>${starsHtml}</span> <span>${escapeHtml(label)}</span>`;
      starsBadge.style.display = 'inline-flex';
    } else {
      starsBadge.style.display = 'none';
    }
  }

  // 2. Publication & Source Attribution
  let pubName = post.publicationName || 'THE FINANCIAL CHRONICLE';
  if (pubName.includes('•')) {
    const parts = pubName.split('•');
    pubName = parts[parts.length - 1].trim();
  }
  pubName = pubName.replace(/^(NEWSPAPER|ARTICLE|BOOK|MAGAZINE|PRESS):\s*/i, '').trim();
  if (!pubName) pubName = 'PRIMARY SOURCE RECORD';

  let speakerOrAuthor = '';
  if (post.publicationName && post.publicationName.includes('•')) {
    speakerOrAuthor = post.publicationName.split('•')[0].trim();
  } else if (post.bookAuthor) {
    speakerOrAuthor = post.bookAuthor.trim();
  } else if (ledger && ledger.source_scope && !ledger.source_scope.toLowerCase().includes('analysis')) {
    speakerOrAuthor = ledger.source_scope.trim();
  }

  const pubTitleEl = document.getElementById('proofPubTitle');
  if (pubTitleEl) {
    const channelOrDomain = (cleanHost && cleanHost.includes('youtube')) ? (speakerOrAuthor ? `${speakerOrAuthor.toUpperCase()} • YOUTUBE` : 'YOUTUBE RECORD') : (cleanHost || pubName).toUpperCase();
    pubTitleEl.textContent = channelOrDomain;
  }

  const headlineEl = document.getElementById('proofHeadline');
  if (headlineEl) {
    headlineEl.textContent = post.originalHeadline || post.spark || post.adaptedHeadline || 'Original News Source';
  }

  const bylineEl = document.getElementById('proofByline');
  if (bylineEl) {
    if (speakerOrAuthor) {
      bylineEl.textContent = `Attributed to ${speakerOrAuthor} • Strictly Non-Partisan Record`;
    } else if (cleanHost) {
      bylineEl.textContent = `Attributed to ${cleanHost} • Strictly Non-Partisan Record`;
    } else {
      bylineEl.textContent = `Attributed to Primary Source • Strictly Non-Partisan Record`;
    }
  }

  // Hidden legacy elements for safety
  const ruleVolEl = document.getElementById('proofRuleVol');
  if (ruleVolEl) ruleVolEl.textContent = '';
  const ruleCenterEl = document.getElementById('proofRuleCenter');
  if (ruleCenterEl) ruleCenterEl.textContent = '';
  const ruleArchiveEl = document.getElementById('proofRuleArchive');
  if (ruleArchiveEl) ruleArchiveEl.textContent = '';
  const stampContainer = document.getElementById('proofStampContainer');
  if (stampContainer) stampContainer.innerHTML = '';

  // 3. Video Embed & Paper Cut Sections
  const videoUrl = post.videoUrl || post.digitalLink || '';
  const ytEmbed = getYouTubeEmbedUrl(videoUrl);
  const vimeoEmbed = getVimeoEmbedUrl(videoUrl);
  const isVideo = !!ytEmbed || !!vimeoEmbed || post.sourceType === 'youtube' || post.sourceType === 'video' || !!post.videoUrl || (videoUrl && /\.(mp4|webm|mov)(\?.*)?$/i.test(videoUrl));

  const hasPaper = !isVideo && (post.sourceType === 'photo' 
    || !!post.paperCutImage 
    || !!post.hasPaperCut
    || (post.originalPhotoUrl && (post.originalPhotoUrl.includes('clipping') || post.sourceType === 'photo'))
    || (post.originalPhotoBase64 && post.originalPhotoBase64.length > 50)
    || (post.originalPhotoPath && !post.originalPhotoPath.startsWith('http') && post.originalPhotoPath !== post.digitalLink)
    || (post.id && ['692d99fc-d140-4d1c-9275-3263a7c187b7', '79cb4873-7c1b-402c-aebb-71fcebbefa5d', '83940fae-4ad7-43f6-9329-91cd17752f78', '9b55d7ea-8a78-4ef1-a068-cec226e200fd'].includes(post.id)));

  const videoSection = document.getElementById('proofVideoSection');
  const videoEmbedWrap = document.getElementById('proofVideoEmbedWrap');
  if (videoSection) {
    if (isVideo) {
      videoSection.style.display = 'block';
      if (ytEmbed && videoEmbedWrap) {
        videoEmbedWrap.innerHTML = `
          <iframe 
            src="${ytEmbed}?autoplay=0&rel=0&modestbranding=1" 
            title="Source Video" 
            style="width:100%; height:100%; border:none;" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
            allowfullscreen>
          </iframe>
        `;
      } else if (vimeoEmbed && videoEmbedWrap) {
        videoEmbedWrap.innerHTML = `
          <iframe 
            src="${vimeoEmbed}" 
            title="Source Video" 
            style="width:100%; height:100%; border:none;" 
            allow="autoplay; fullscreen; picture-in-picture" 
            allowfullscreen>
          </iframe>
        `;
      } else if (videoUrl && /\.(mp4|webm|mov)(\?.*)?$/i.test(videoUrl) && videoEmbedWrap) {
        videoEmbedWrap.innerHTML = `
          <video src="${escapeHtml(videoUrl)}" controls playsinline style="width:100%; height:100%; max-height:480px; background:#000; border-radius:6px;"></video>
        `;
      } else if (videoEmbedWrap) {
        videoEmbedWrap.innerHTML = `
          <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:160px; color:#CBD5E1; text-align:center; padding:16px;">
            <span style="font-size:30px; margin-bottom:6px;">▶</span>
            <span style="font-weight:700;">Broadcast / Video Source</span>
            <a href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener noreferrer" style="margin-top:6px; color:#818CF8; text-decoration:underline; font-size:12px;">Watch on host platform &nearr;</a>
          </div>
        `;
      }
    } else {
      videoSection.style.display = 'none';
      if (videoEmbedWrap) videoEmbedWrap.innerHTML = '';
    }
  }

  const paperCutSection = document.getElementById('proofPaperCutSection');
  const paperCutImg = document.getElementById('proofPaperCutImg');
  if (paperCutSection) {
    if (hasPaper && !isVideo) {
      paperCutSection.style.display = 'block';
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
      if (paperCutImg) {
        paperCutImg.src = imgSrc || '';
        paperCutImg.onerror = () => {
          paperCutSection.style.display = 'none';
        };
      }
    } else {
      paperCutSection.style.display = 'none';
      if (paperCutImg) paperCutImg.src = '';
    }
  }

  // 4. Primary Unbiased 1-Minute Read Sections
  const cleanExcerpt = (txt) => {
    if (!txt) return '';
    return String(txt)
      .replace(/^(the spark|curator stance|paragraph \d+)\s*:\s*["']?/i, '')
      .replace(/["']?$/i, '')
      .trim();
  };

  let excerpts = post.resolvedArticleExcerpts || post.articleExcerpts || [];
  if (!Array.isArray(excerpts) || excerpts.length === 0) {
    if (post.summary) {
      excerpts = post.summary.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 20);
    }
  }
  if (excerpts.length === 0 && post.spark) {
    excerpts = [post.spark];
  }

  const proofParagraphsEl = document.getElementById('proofParagraphs');
  if (proofParagraphsEl) {
    let paragraphsHtml = '';

    if (ledger) {
      // Section 1: Subject & Central Thesis
      let thesisText = '';
      let contextText = '';
      if (ledger.subject_and_thesis && typeof ledger.subject_and_thesis === 'object') {
        contextText = cleanExcerpt(ledger.subject_and_thesis.context || '');
        thesisText = cleanExcerpt(ledger.subject_and_thesis.thesis || '');
      } else if (ledger.subject_and_thesis) {
        thesisText = cleanExcerpt(String(ledger.subject_and_thesis));
      }

      if (thesisText || contextText) {
        paragraphsHtml += `
          <div class="unbiased-summary-section">
            <div class="unbiased-section-label">
              <span>🎯</span> § 1 • SUBJECT & CENTRAL THESIS
            </div>
            <p class="unbiased-text">
              ${contextText ? `<strong>${escapeHtml(contextText)}</strong> ` : ''}${escapeHtml(thesisText)}
            </p>
          </div>
        `;
      }

      // Section 2: Core Claims & Verified Evidence
      const ledgerClaims = Array.isArray(ledger.core_claims_and_evidence) ? ledger.core_claims_and_evidence : [];
      if (ledgerClaims.length > 0) {
        paragraphsHtml += `
          <div class="unbiased-summary-section">
            <div class="unbiased-section-label">
              <span>📊</span> § 2 • CORE CLAIMS & EVIDENCE
            </div>
            <div class="unbiased-claims-list">
              ${ledgerClaims.map((claim, idx) => {
                let title = '';
                let evidence = '';
                if (claim && typeof claim === 'object') {
                  title = claim.title || '';
                  evidence = claim.evidence || claim.text || '';
                } else {
                  const str = String(claim || '');
                  const colonIdx = str.indexOf(':');
                  if (colonIdx > 0 && colonIdx < 45) {
                    title = str.slice(0, colonIdx).trim();
                    evidence = str.slice(colonIdx + 1).trim();
                  } else {
                    evidence = str;
                  }
                }
                return `
                  <div class="unbiased-claim-item">
                    <span class="claim-bullet">▪</span>
                    <div class="claim-content">
                      ${title ? `<strong>${escapeHtml(title)}:</strong> ` : ''}${escapeHtml(evidence)}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      // Section 3: Central Conflict & Trade-offs
      let tensionText = '';
      let counterQuestions = '';
      if (ledger.underlying_tensions && typeof ledger.underlying_tensions === 'object') {
        tensionText = cleanExcerpt([ledger.underlying_tensions.primary_conflict, ledger.underlying_tensions.tradeoffs].filter(Boolean).join(' '));
        counterQuestions = cleanExcerpt(ledger.underlying_tensions.counter_questions || '');
      } else if (ledger.underlying_tensions) {
        tensionText = cleanExcerpt(String(ledger.underlying_tensions));
      }

      if (tensionText || counterQuestions) {
        paragraphsHtml += `
          <div class="unbiased-summary-section">
            <div class="unbiased-section-label">
              <span>⚖️</span> § 3 • CENTRAL CONFLICT & TRADE-OFFS
            </div>
            ${tensionText ? `<p class="unbiased-text">${escapeHtml(tensionText)}</p>` : ''}
            ${counterQuestions ? `
              <div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(203, 213, 225, 0.6); font-family: 'Merriweather', Georgia, serif; font-size: 11.5px; color: #475569; font-style: italic;">
                ❓ ${escapeHtml(counterQuestions)}
              </div>
            ` : ''}
          </div>
        `;
      }
    } else {
      // Clean fallback for older posts
      if (excerpts.length > 0) {
        paragraphsHtml += `
          <div class="unbiased-summary-section">
            <div class="unbiased-section-label">
              <span>📰</span> PRIMARY REPORTING RECORD
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${excerpts.map((exc, pIdx) => `<p class="unbiased-text">${escapeHtml(cleanExcerpt(exc))}</p>`).join('')}
            </div>
          </div>
        `;
      }

      const quote = post.receiptHighlightQuote || post.pullQuote;
      if (quote && cleanExcerpt(quote)) {
        paragraphsHtml += `
          <div class="unbiased-summary-section" style="border-left: 3px solid #B45309;">
            <div class="unbiased-section-label"><span>✏️</span> PRIMARY QUOTE</div>
            <p class="unbiased-text" style="font-style: italic;">“${escapeHtml(cleanExcerpt(quote))}”</p>
          </div>
        `;
      }

      if (post.whyItMatters && String(post.whyItMatters).trim()) {
        paragraphsHtml += `
          <div class="unbiased-summary-section">
            <div class="unbiased-section-label"><span>🔍</span> CORROBORATING CONTEXT</div>
            <p class="unbiased-text">${escapeHtml(String(post.whyItMatters).trim())}</p>
          </div>
        `;
      }
    }

    proofParagraphsEl.innerHTML = paragraphsHtml || '<div class="unbiased-summary-section"><p class="unbiased-text">Original source text confirmed by archival records.</p></div>';

    // Word count & read time indicator
    const rawText = proofParagraphsEl.innerText || proofParagraphsEl.textContent || '';
    const wordCount = rawText.trim().split(/\s+/).filter(Boolean).length;
    const readTimeEl = document.getElementById('proofReadTime');
    if (readTimeEl) {
      readTimeEl.textContent = `⏱️ 1-MIN READ (${wordCount} words)`;
    }
  }

  // 5. Recorded Metric (Optional)
  const metricRow = document.getElementById('proofMetricRow');
  const metricVal = document.getElementById('proofMetricVal');
  if (metricRow && metricVal) {
    if (post.keyMetric && String(post.keyMetric).trim()) {
      metricRow.style.display = 'flex';
      metricVal.textContent = String(post.keyMetric).trim();
    } else {
      metricRow.style.display = 'none';
    }
  }

  // 6. Actions & Footer
  const archivedByEl = document.getElementById('proofArchivedBy');
  if (archivedByEl) {
    archivedByEl.textContent = `Archived by ${handle}`;
  }

  const extLink = document.getElementById('proofExternalLink');
  if (extLink) {
    const rawLink = post.digitalLink || post.videoUrl || '';
    if (rawLink && !rawLink.startsWith('blob:') && !rawLink.startsWith('data:')) {
      extLink.href = rawLink;
      extLink.innerHTML = '<span>🌐 Open Original Source &nearr;</span>';
      extLink.style.display = 'inline-flex';
    } else {
      extLink.style.display = 'none';
    }
  }

  // Update browser URL query without reload
  history.pushState(null, '', `?p=${post.id}`);

  document.getElementById('detailModal').classList.add('open');
}

function closeDetailModal() {
  document.getElementById('detailModal').classList.remove('open');
  const videoEmbed = document.getElementById('proofVideoEmbedWrap');
  if (videoEmbed) videoEmbed.innerHTML = '';
  history.pushState(null, '', window.location.pathname);
  activePostIndex = null;
}

function copyShareLink() {
  if (activePostIndex !== null && allPosts[activePostIndex]) {
    copyCardShareLink(allPosts[activePostIndex].id);
  }
}

function copyCardShareLink(postId) {
  if (!postId) return;
  const shareUrl = `${window.location.origin}/?p=${encodeURIComponent(postId)}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareUrl).then(() => {
      showTemporaryToast('🔗 Direct link to post copied!');
    }).catch(() => {
      fallbackCopyText(shareUrl);
    });
  } else {
    fallbackCopyText(shareUrl);
  }
}

function copyModalShareLink() {
  if (currentSharePost && currentSharePost.id) {
    copyCardShareLink(currentSharePost.id);
  } else if (activePostIndex !== null && allPosts[activePostIndex]) {
    copyCardShareLink(allPosts[activePostIndex].id);
  } else {
    showTemporaryToast('Post link unavailable');
  }
}

function fallbackCopyText(text) {
  try {
    const input = document.createElement('textarea');
    input.value = text;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.focus();
    input.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(input);
    if (successful) {
      showTemporaryToast('🔗 Direct link to post copied!');
      return;
    }
  } catch (_) {}
  window.prompt('Copy direct link to this post:', text);
}

function canDeletePost(post) {
  if (!post || !post.id) return false;
  // 1. Authored in this browser session or saved in local myCreatedPostIds
  if (myCreatedPostIds && myCreatedPostIds.has(post.id)) return true;
  // 2. User account match
  if (currentUser) {
    if (post.user_id && post.user_id === currentUser.id) return true;
    if (post.userId && post.userId === currentUser.id) return true;
    if (post.userEmail && currentUser.email && post.userEmail.toLowerCase() === currentUser.email.toLowerCase()) return true;
    const userHandle = (currentUser.user_metadata?.user_name || currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || '').toLowerCase().replace('@', '').trim();
    const postAuthor = (post.creatorHandle || '').toLowerCase().replace('@', '').trim();
    if (userHandle && postAuthor && userHandle === postAuthor) return true;
  }
  // 3. In "My Stories" tab, all listed items belong to this creator
  if (currentFilter === 'my_stories') return true;
  return false;
}

// ============================================================
// GENERATION INPUTS & CONTEXT DRAWER CONTROLLER (AUTHOR ONLY)
// ============================================================
window._activeGenContextPostId = null;
window._activeGenContextText = '';

function getPostGenerationInputs(post) {
  if (!post) return null;
  const raw = post.generationInputs || {};
  const slantTake = raw.slantTake || post.polishedCuratorTake || post.userSlantTake || post.rawUserSlant || post.curatorTake || post.creatorOpinion || '';
  const sourceUrl = raw.sourceUrl || post.digitalLink || post.webUrl || post.sourceUrl || '';
  let sourceType = raw.sourceType || post.sourceType;
  if (!sourceType) {
    if (sourceUrl) sourceType = 'digital_link';
    else if (post.originalPhotoUrl || post.originalPhotoBase64 || post.hasPaperCut) sourceType = 'photo';
    else sourceType = 'inner_voice';
  }
  const spark = raw.spark || post.spark || post.userContext || '';
  const cues = (raw.cues && Array.isArray(raw.cues) && raw.cues.length) ? raw.cues : (post.cues && Array.isArray(post.cues) && post.cues.length ? post.cues : (post.keyTakeaways || []));
  const heroCue = raw.heroCue || cues[0] || post.heroCue || '';
  const characterRepresentation = raw.characterRepresentation || post.characterRepresentation || 'realistic';
  const refineCoreTake = (typeof raw.refineCoreTake === 'boolean') ? raw.refineCoreTake : (typeof post.refineCoreTake === 'boolean' ? post.refineCoreTake : true);
  const vocabularyStyle = raw.vocabularyStyle || post.vocabularyStyle || 'punchy';
  const countryContext = raw.countryContext || post.countryContext || 'India';
  const scrapedTitle = raw.scrapedTitle || post.publicationName || post.originalHeadline || '';
  const scrapedContent = raw.scrapedContent || post.sourceContext || post.newsExcerpt || post.summary || '';
  const contextProvided = raw.contextProvided || post.contextProvided || slantTake || scrapedContent || spark || '';
  const illustrationPrompt = raw.illustrationPrompt || post.illustrationPrompt || '';
  const originalHeadline = raw.originalHeadline || post.originalHeadline || post.adaptedHeadline || '';

  return {
    slantTake,
    sourceUrl,
    sourceType,
    spark,
    cues,
    heroCue,
    characterRepresentation,
    refineCoreTake,
    vocabularyStyle,
    countryContext,
    scrapedTitle,
    scrapedContent,
    contextProvided,
    illustrationPrompt,
    originalHeadline
  };
}

function openGenerationContextModal(postId) {
  if (!postId) return;
  const post = allPosts.find(p => p && p.id === postId);
  if (!post) {
    showTemporaryToast('Post not found');
    return;
  }

  window._activeGenContextPostId = postId;
  const inputs = getPostGenerationInputs(post);
  const container = document.getElementById('genContextBody');
  if (!container) return;

  // Build copyable summary text
  const copyLines = [];
  copyLines.push('=== SLANT GENERATION INPUTS & CONTEXT ===');
  copyLines.push(`Post ID: ${post.id}`);
  copyLines.push(`Headline: ${post.adaptedHeadline || post.originalHeadline || 'Untitled'}`);
  copyLines.push(`Source Anchor: ${inputs.sourceType}`);
  if (inputs.slantTake) copyLines.push(`\n[CURATOR'S SLANT / TAKE]:\n${inputs.slantTake}`);
  if (inputs.spark) copyLines.push(`\n[THE SPARK]:\n${inputs.spark}`);
  if (inputs.sourceUrl) copyLines.push(`\n[SOURCE URL]:\n${inputs.sourceUrl}`);
  if (inputs.scrapedTitle) copyLines.push(`[SOURCE TITLE]: ${inputs.scrapedTitle}`);
  if (inputs.scrapedContent) copyLines.push(`\n[SOURCE CONTENT EXCERPT]:\n${inputs.scrapedContent.slice(0, 1000)}...`);
  if (inputs.cues && inputs.cues.length) {
    copyLines.push(`\n[VISUAL CUES & METAPHORS]:`);
    inputs.cues.forEach((c, idx) => copyLines.push(`  ${idx + 1}. ${c}${idx === 0 ? ' (HERO)' : ''}`));
  }
  if (inputs.illustrationPrompt) copyLines.push(`\n[ART DIRECTION PROMPT]:\n${inputs.illustrationPrompt}`);
  copyLines.push(`\n[STUDIO PARAMETERS]:`);
  copyLines.push(`  - Core Take: ${inputs.refineCoreTake ? 'Refined with AI' : 'Use As-Is (Verbatim)'}`);
  copyLines.push(`  - Vocabulary: ${inputs.vocabularyStyle}`);
  copyLines.push(`  - Setting / Region: ${inputs.countryContext}`);
  copyLines.push(`  - Portrayal: ${inputs.characterRepresentation}`);
  window._activeGenContextText = copyLines.join('\n');

  // Human-readable labels
  let sourceLabel = '🌐 Web Citation Link';
  if (inputs.sourceType === 'photo') sourceLabel = '📰 Press Clipping / Magazine';
  else if (inputs.sourceType === 'inner_voice') sourceLabel = '💭 Inner Voice & Personal Take';

  let vocabLabel = '⚡ Punchy Voice';
  if (inputs.vocabularyStyle === 'conversational') vocabLabel = '💬 Casual Voice';
  else if (inputs.vocabularyStyle === 'analytical') vocabLabel = '🏛 Analytical Voice';

  let portrayalLabel = '🎨 Editorial Realism';
  if (inputs.characterRepresentation === 'likeness' || inputs.characterRepresentation === 'lookalike') portrayalLabel = '👤 Portrait / Likeness';
  else if (inputs.characterRepresentation === 'exact') portrayalLabel = '📷 Direct Photo';
  else if (inputs.characterRepresentation === 'silhouette') portrayalLabel = '👥 Minimalist Silhouette';

  let html = `
    <!-- Top Headline & Meta -->
    <div class="gen-section-card" style="background: rgba(99, 102, 241, 0.05); border-color: rgba(99, 102, 241, 0.2);">
      <div class="gen-section-header">
        <div class="gen-section-title-wrap">
          <span class="gen-section-icon">📌</span>
          <span class="gen-section-label">PUBLISHED POST</span>
        </div>
        <span class="gen-cue-tag" style="font-size: 11px;">${escapeHtml(post.id)}</span>
      </div>
      <div style="font-family: 'Newsreader', serif; font-size: 17px; font-weight: 700; line-height: 1.35; color: var(--text-primary, #F8FAFC);">
        "${escapeHtml(post.adaptedHeadline || post.originalHeadline || 'Untitled')}"
      </div>
    </div>
  `;

  // 1. Curator's Slant / Angle (The core input)
  if (inputs.slantTake) {
    html += `
      <div class="gen-section-card">
        <div class="gen-section-header">
          <div class="gen-section-title-wrap">
            <span class="gen-section-icon">💭</span>
            <span class="gen-section-label">CURATOR'S SLANT / TAKE</span>
          </div>
          <button type="button" class="gen-copy-btn" onclick="copyGenerationContextToClipboard(${JSON.stringify(inputs.slantTake)})" title="Copy slant take">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span>Copy</span>
          </button>
        </div>
        <div class="gen-take-box">
          ${escapeHtml(inputs.slantTake)}
        </div>
      </div>
    `;
  }

  // 2. The Spark
  if (inputs.spark) {
    html += `
      <div class="gen-section-card">
        <div class="gen-section-header">
          <div class="gen-section-title-wrap">
            <span class="gen-section-icon">⚡</span>
            <span class="gen-section-label">THE SPARK (TRIGGERING OBSERVATION)</span>
          </div>
          <button type="button" class="gen-copy-btn" onclick="copyGenerationContextToClipboard(${JSON.stringify(inputs.spark)})" title="Copy spark">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span>Copy</span>
          </button>
        </div>
        <div style="font-size: 13.5px; color: var(--text-primary, #F1F5F9); line-height: 1.5; font-style: italic;">
          "${escapeHtml(inputs.spark)}"
        </div>
      </div>
    `;
  }

  // 3. Source Anchor & Scraped Content
  if (inputs.sourceUrl || inputs.scrapedContent || inputs.scrapedTitle) {
    html += `
      <div class="gen-section-card">
        <div class="gen-section-header">
          <div class="gen-section-title-wrap">
            <span class="gen-section-icon">🔗</span>
            <span class="gen-section-label">ROOT SOURCE CONTEXT</span>
          </div>
          ${inputs.sourceUrl ? `
            <a href="${escapeHtml(inputs.sourceUrl)}" target="_blank" rel="noopener noreferrer" class="gen-copy-btn" style="text-decoration:none;">
              <span>Visit Link ↗</span>
            </a>
          ` : ''}
        </div>
        ${inputs.sourceUrl ? `
          <div class="gen-source-row">
            <span>🌐</span>
            <a href="${escapeHtml(inputs.sourceUrl)}" target="_blank" rel="noopener noreferrer" class="gen-source-link">${escapeHtml(inputs.sourceUrl)}</a>
          </div>
        ` : ''}
        ${inputs.scrapedTitle ? `
          <div style="font-size: 13px; font-weight: 600; color: var(--text-primary, #F8FAFC); margin-top: 4px;">
            ${escapeHtml(inputs.scrapedTitle)}
          </div>
        ` : ''}
        ${inputs.scrapedContent ? `
          <div class="gen-context-text" title="Scraped article / Source excerpt">${escapeHtml(inputs.scrapedContent)}</div>
        ` : ''}
      </div>
    `;
  }

  // 4. Visual Cues & Metaphors
  if (inputs.cues && inputs.cues.length > 0) {
    html += `
      <div class="gen-section-card">
        <div class="gen-section-header">
          <div class="gen-section-title-wrap">
            <span class="gen-section-icon">🎨</span>
            <span class="gen-section-label">VISUAL CUES & METAPHORS (${inputs.cues.length})</span>
          </div>
        </div>
        <div class="gen-cues-list">
          ${inputs.cues.map((cue, i) => `
            <div class="gen-cue-row">
              <span class="gen-cue-tag" style="${i === 0 ? 'background: rgba(245, 158, 11, 0.2); color: #FBBF24; font-weight: 900;' : ''}">${i === 0 ? '⭐ HERO' : '#' + (i + 1)}</span>
              <span class="gen-cue-val">${escapeHtml(cue)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // 5. Illustration Prompt (if available)
  if (inputs.illustrationPrompt) {
    html += `
      <div class="gen-section-card">
        <div class="gen-section-header">
          <div class="gen-section-title-wrap">
            <span class="gen-section-icon">✨</span>
            <span class="gen-section-label">AI ART DIRECTION PROMPT</span>
          </div>
          <button type="button" class="gen-copy-btn" onclick="copyGenerationContextToClipboard(${JSON.stringify(inputs.illustrationPrompt)})" title="Copy prompt">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span>Copy</span>
          </button>
        </div>
        <div class="gen-context-text" style="font-family: monospace; font-size: 12px; max-height: 120px;">
          ${escapeHtml(inputs.illustrationPrompt)}
        </div>
      </div>
    `;
  }

  // 6. Studio Parameters Grid
  html += `
    <div class="gen-section-card">
      <div class="gen-section-header">
        <div class="gen-section-title-wrap">
          <span class="gen-section-icon">⚙️</span>
          <span class="gen-section-label">STUDIO SYNTHESIS PARAMETERS</span>
        </div>
      </div>
      <div class="gen-params-grid">
        <div class="gen-param-item">
          <span class="gen-param-label">Source Mode</span>
          <span class="gen-param-value">${escapeHtml(sourceLabel)}</span>
        </div>
        <div class="gen-param-item">
          <span class="gen-param-label">Core Take Mode</span>
          <span class="gen-param-value">${inputs.refineCoreTake ? '✨ Refine with AI' : '❝ Use As-Is'}</span>
        </div>
        <div class="gen-param-item">
          <span class="gen-param-label">Voice / Tone</span>
          <span class="gen-param-value">${escapeHtml(vocabLabel)}</span>
        </div>
        <div class="gen-param-item">
          <span class="gen-param-label">Setting / Region</span>
          <span class="gen-param-value">📍 ${escapeHtml(inputs.countryContext)}</span>
        </div>
        <div class="gen-param-item">
          <span class="gen-param-label">Character Portrayal</span>
          <span class="gen-param-value">${escapeHtml(portrayalLabel)}</span>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  const modal = document.getElementById('generationContextModal');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('open');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeGenerationContextModal() {
  const modal = document.getElementById('generationContextModal');
  if (modal) {
    modal.classList.remove('open');
    modal.classList.remove('active');
    setTimeout(() => {
      if (!modal.classList.contains('open')) {
        modal.style.display = 'none';
      }
    }, 220);
  }
  document.body.style.overflow = '';
}

function copyGenerationContextToClipboard(customText) {
  const textToCopy = (typeof customText === 'string' && customText.length)
    ? customText
    : (window._activeGenContextText || '');
  if (!textToCopy) {
    showTemporaryToast('Nothing to copy');
    return;
  }
  if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(textToCopy).then(() => {
      showTemporaryToast('📋 Copied to clipboard!');
    }).catch(() => {
      fallbackCopyText(textToCopy);
    });
  } else {
    fallbackCopyText(textToCopy);
  }
}

function fallbackCopyText(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showTemporaryToast('📋 Copied to clipboard!');
  } catch (_) {
    prompt('Copy context text:', text);
  }
}

function loadPostIntoStudioToRegenerate(postId) {
  const targetId = postId || window._activeGenContextPostId;
  if (!targetId) return;
  const post = allPosts.find(p => p && p.id === targetId);
  if (!post) {
    showTemporaryToast('Post not found');
    return;
  }

  const inputs = getPostGenerationInputs(post);

  // Close context drawer
  closeGenerationContextModal();

  // Open Creator Studio
  openCreatorModal();

  // 1. Set source mode
  setAnchorMode(inputs.sourceType || 'digital_link');

  // 2. Populate Slant Take
  const slantInput = document.getElementById('creatorSlantTakeInput');
  if (slantInput) {
    slantInput.value = inputs.slantTake || '';
  }

  // 3. Populate Spark
  const sparkInput = document.getElementById('creatorSparkInput');
  if (sparkInput) {
    sparkInput.value = inputs.spark || '';
  }

  // 4. Populate Source URL
  const urlInput = document.getElementById('creatorUrlInput');
  if (urlInput) {
    urlInput.value = inputs.sourceUrl || '';
  }

  // 5. Vocabulary style
  setVocabularyStyle(inputs.vocabularyStyle || 'punchy');

  // 6. Refine switch
  toggleRefineCoreTake(inputs.refineCoreTake !== false);

  // 7. Regional Setting
  const countryCodeMap = {
    'India': 'IN',
    'United States': 'US',
    'United Kingdom': 'GB',
    'Japan': 'JP',
    'Europe': 'EU',
    'Global': 'GLOBAL'
  };
  const cCode = countryCodeMap[inputs.countryContext] || (inputs.countryContext && inputs.countryContext.length === 2 ? inputs.countryContext : 'GLOBAL');
  const sel = document.getElementById('countryContextSelect');
  if (sel) sel.value = cCode;
  if (typeof changeCountryContext === 'function') {
    changeCountryContext(cCode);
  }

  // 8. Character Representation
  selectCharacterRepresentation(inputs.characterRepresentation || 'realistic');

  // 9. Cues Deck
  if (inputs.cues && Array.isArray(inputs.cues) && inputs.cues.length > 0) {
    creatorCuePills = [...inputs.cues];
    renderCuesDeck();
  }

  // 10. Scraped article state
  if (inputs.scrapedContent || inputs.scrapedTitle) {
    currentScrapedArticle = {
      title: inputs.scrapedTitle || '',
      content: inputs.scrapedContent || '',
      url: inputs.sourceUrl || ''
    };
  }
  if (inputs.sourceLedger) {
    renderSourceLedger(inputs.sourceLedger);
  }

  showTemporaryToast('✨ Loaded inputs into Creator Studio! Tweak or regenerate 🚀');
}

function handleDetailModalDelete() {
  if (activePostIndex === null || !allPosts[activePostIndex]) return;
  const post = allPosts[activePostIndex];
  confirmDeletePost(post.id);
}

async function confirmDeletePost(postId) {
  if (!postId) return;
  const post = allPosts.find(p => p && p.id === postId);
  const title = post ? (post.adaptedHeadline || post.originalHeadline || 'this Slant') : 'this Slant';

  const confirmed = window.confirm(`Are you sure you want to delete this Slant?\n\n"${title.slice(0, 50)}..."\n\nThis will permanently remove it from the live feed.`);
  if (!confirmed) return;

  await executeDeletePost(postId);
}

async function executeDeletePost(postId) {
  showTemporaryToast('🗑️ Deleting Slant...');

  // 1. Immediately remove from local memory & UI for instant responsiveness
  allPosts = allPosts.filter(p => p && p.id !== postId);
  if (myCreatedPostIds) myCreatedPostIds.delete(postId);
  if (savedPostIds) savedPostIds.delete(postId);

  try {
    localStorage.setItem('slant_my_posts', JSON.stringify(Array.from(myCreatedPostIds)));
    localStorage.setItem('slant_saved_posts', JSON.stringify(Array.from(savedPostIds)));
    const cachedPosts = JSON.parse(localStorage.getItem('slant_user_posts_cache') || '[]');
    localStorage.setItem('slant_user_posts_cache', JSON.stringify(cachedPosts.filter(p => p && p.id !== postId)));
  } catch (_) {}

  closeDetailModal();
  updateBadge(true, `Live Feed (${allPosts.length} posts)`);
  renderFeed();

  // 2. Call backend DELETE endpoint
  try {
    const resp = await fetch(`/api/posts?id=${encodeURIComponent(postId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: postId })
    });
    if (!resp.ok) {
      console.warn('Backend DELETE returned status:', resp.status);
    }
  } catch (err) {
    console.warn('Backend DELETE error:', err);
  }

  // 3. Resilient Direct Supabase delete / soft-delete
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(postId)}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        data: { id: postId, deleted: true, isDeleted: true, deletedAt: new Date().toISOString() }
      })
    });
  } catch (_) {}

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(postId)}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
  } catch (_) {}

  showTemporaryToast('🗑️ Slant deleted successfully');
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

async function fetchAsBlobUrl(url) {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return url;
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch (e) {
    return url;
  }
}

async function capturePostSlidesAsFiles(post, index) {
  if (typeof html2canvas === 'undefined') {
    throw new Error('html2canvas library is not loaded');
  }

  // Exact 3:4 social ratio (480x640 canvas with framed 450x600 card inside)
  // Outer canvas has background #F8F5EE (the signature default light theme color)
  // The inner card has rounded corners (16px), subtle border, and shadow matching the in-app post card!
  const canvasWidth = 480;
  const canvasHeight = 640;
  const cardWidth = 450;
  const cardHeight = 600;
  const padX = 15; // (480 - 450) / 2 = 15px
  const padY = 20; // (640 - 600) / 2 = 20px

  // Convert poster image to local blob URL to bypass any CORS taint or delay in html2canvas
  let exportPost = { ...post };
  const rawPosterUrl = post.illustrationUrl || post.aiIllustrationUrl || '';
  let createdBlobUrl = null;
  if (!post.illustrationBase64 && rawPosterUrl) {
    try {
      const bUrl = await fetchAsBlobUrl(rawPosterUrl);
      if (bUrl && bUrl !== rawPosterUrl) {
        createdBlobUrl = bUrl;
        exportPost.illustrationUrl = bUrl;
      }
    } catch (_) {}
  }

  const slideConfigs = [
    { num: 1, class: 'slide-hook', bg: '#0B0F17', html: buildSlide1Html(exportPost, index) },
    { num: 2, class: 'slide-critique', bg: '#0B0F17', html: buildSlide2Html(exportPost, index) },
    { num: 3, class: 'slide-receipt', bg: '#F7F5EE', html: buildSlide3Html(exportPost, index) }
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
      width: ${canvasWidth}px !important;
      height: ${canvasHeight}px !important;
      overflow: hidden !important;
      z-index: -9999 !important;
      background: #F8F5EE !important;
      padding: ${padY}px ${padX}px !important;
      margin: 0 !important;
      border: none !important;
      box-sizing: border-box !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    `;
    document.body.appendChild(container);

    try {
      container.innerHTML = `
        <div class="share-card-frame" style="width: ${cardWidth}px !important; height: ${cardHeight}px !important; border-radius: 16px !important; overflow: hidden !important; border: 1px solid rgba(15, 23, 42, 0.12) !important; box-shadow: 0 10px 28px -4px rgba(0, 0, 0, 0.18), 0 2px 6px rgba(0, 0, 0, 0.06) !important; position: relative !important; background: ${cfg.bg} !important; display: flex !important; box-sizing: border-box !important;">
          <div class="carousel-slide ${cfg.class}" style="width: ${cardWidth}px !important; height: ${cardHeight}px !important; position: relative !important; left: 0 !important; top: 0 !important; transform: none !important; flex: none !important; display: flex !important; border-radius: 15px !important; overflow: hidden !important;">
            ${cfg.html}
          </div>
        </div>
      `;

      // Wait for images inside to load with 4.5s safe timeout
      const imgs = Array.from(container.querySelectorAll('img'));
      await Promise.all(imgs.map(img => {
        if (!img.src) return Promise.resolve(true);
        if (img.complete && img.naturalWidth > 0) return Promise.resolve(true);
        return new Promise(res => {
          img.onload = () => res(true);
          img.onerror = () => res(false);
          setTimeout(() => res(false), 4500);
        });
      }));

      // Calculate un-stretched dimensions
      const bgImgs = container.querySelectorAll('.slide-hook-bg');
      bgImgs.forEach(img => {
        const natW = img.naturalWidth || img.width;
        const natH = img.naturalHeight || img.height;
        if (natW > 0 && natH > 0) {
          const rImg = natW / natH;
          const rBox = cardWidth / cardHeight; // 450 / 600 = 0.75
          if (rImg >= rBox) {
            const rw = Math.round(cardHeight * rImg);
            const rh = cardHeight;
            const left = Math.round((cardWidth - rw) / 2);
            img.style.setProperty('position', 'absolute', 'important');
            img.style.setProperty('width', rw + 'px', 'important');
            img.style.setProperty('height', rh + 'px', 'important');
            img.style.setProperty('left', left + 'px', 'important');
            img.style.setProperty('top', '0px', 'important');
            img.style.setProperty('max-width', 'none', 'important');
            img.style.setProperty('max-height', 'none', 'important');
            img.style.setProperty('object-fit', 'fill', 'important');
          } else {
            const rw = cardWidth;
            const rh = Math.round(cardWidth / rImg);
            const top = Math.round((cardHeight - rh) / 2);
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
          scale: 2.25, // 480 * 2.25 = 1080, 640 * 2.25 = 1440 (Ultra HD 1080x1440, perfect 3:4 Instagram portrait)
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#F8F5EE',
          logging: false,
          width: canvasWidth,
          height: canvasHeight
        });
      } catch (renderErr) {
        console.warn('html2canvas primary render failed, retrying without taint:', renderErr);
        canvas = await html2canvas(container, {
          scale: 2.25,
          useCORS: true,
          allowTaint: false,
          backgroundColor: '#F8F5EE',
          logging: false,
          width: canvasWidth,
          height: canvasHeight
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
  if (createdBlobUrl) {
    try { URL.revokeObjectURL(createdBlobUrl); } catch (_) {}
  }
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
      // STRICT REQUIREMENT: Only cache if all 3 files generated successfully
      if (files && files.length === 3) {
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
  // Disabled premature on-mount pre-render to avoid resource contention with feed image decoding
  return;
}

function triggerPostPreRender(postIndex) {
  const post = getPostFromIndexOrId(postIndex);
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
  const post = getPostFromIndexOrId(indexOrId);

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
      wrap.style.cssText = 'position:relative; width:90px; height:120px; border-radius:8px; overflow:hidden; border:1px solid rgba(255,255,255,0.15); background:#111; box-shadow:0 4px 12px rgba(0,0,0,0.4);';
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
  const post = getPostFromIndexOrId(indexOrId);
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
let lastPolishedTake = '';
let creatorRefineCoreTake = true;

async function polishUserTake() {
  const input = document.getElementById('creatorSlantTakeInput');
  const btn = document.getElementById('slantPolishActionBtn');
  const reviewCard = document.getElementById('slantPolishReviewCard');
  const display = document.getElementById('slantPolishedTextDisplay');

  if (!input) return;
  const rawText = input.value.trim();
  if (!rawText || rawText.length < 10) {
    showTemporaryToast('⚠️ Please write your take first before reviewing.');
    input.focus();
    return;
  }

  // Set loading state on button
  const originalBtnHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-spark-icon spinning">⏳</span> Polishing phrasing & grammar...`;
  }

  try {
    const resp = await fetch('/api/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'polish_take',
        text: rawText
      })
    });

    let polished = '';
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.polished) {
        polished = data.polished;
      }
    }

    // Fallback if API returned empty
    if (!polished) {
      polished = formatCuratorTakeApt(rawText);
    }

    lastPolishedTake = polished;

    if (display) {
      display.textContent = polished;
    }
    if (reviewCard) {
      reviewCard.style.display = 'flex';
      reviewCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    showTemporaryToast('✨ Take polished for review. Check below!');
  } catch (err) {
    console.warn('Polish take error, using client-side formatting:', err);
    const polished = formatCuratorTakeApt(rawText);
    lastPolishedTake = polished;
    if (display) display.textContent = polished;
    if (reviewCard) {
      reviewCard.style.display = 'flex';
      reviewCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalBtnHtml;
    }
  }
}

function acceptPolishedTake() {
  const input = document.getElementById('creatorSlantTakeInput');
  const reviewCard = document.getElementById('slantPolishReviewCard');
  if (input && lastPolishedTake) {
    input.value = lastPolishedTake;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (reviewCard) {
    reviewCard.style.display = 'none';
  }
  showTemporaryToast('✓ Polished take applied to your slant!');
}

function rejectPolishedTake() {
  const reviewCard = document.getElementById('slantPolishReviewCard');
  if (reviewCard) {
    reviewCard.style.display = 'none';
  }
  showTemporaryToast('Original take kept.');
}

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
  if (!currentUser || !isUserWhitelistAllowed) {
    if (typeof openAuthModal === 'function') {
      openAuthModal('🔒 Slant Studio is currently in Private Preview by invitation only. Please sign in with your invited Google account.');
    }
    if (typeof showTemporaryToast === 'function') {
      showTemporaryToast('🔒 Slant Studio is in Private Preview. Please sign in with your invited Google account.');
    }
    return;
  }

  const modal = document.getElementById('creatorModal');
  if (!modal) return;

  // Clean creator state on opening fresh
  resetCreatorState();

  // Sync anchor selection (default to digital_link or active mode)
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

  const slantInput = document.getElementById('creatorSlantTakeInput');
  if (slantInput && !slantInput.dataset.errorCleanAttached) {
    slantInput.dataset.errorCleanAttached = 'true';
    slantInput.addEventListener('input', () => {
      if (typeof clearMandatoryError === 'function') clearMandatoryError(slantInput);
    });
  }
}

function closeCreatorModal() {
  if (typeof clearMandatoryFieldPrompts === 'function') {
    clearMandatoryFieldPrompts();
  }
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
  if (typeof clearMandatoryFieldPrompts === 'function') {
    clearMandatoryFieldPrompts();
  }
  if (creatorSelectedSource !== mode) {
    currentScrapedArticle = null;
    currentSourceLedger = null;
    renderSourceLedger(null);
    removeInnerVoicePhoto();
    creatorCuePills = [];
    if (creatorSelectedCueIndices && creatorSelectedCueIndices.clear) {
      creatorSelectedCueIndices.clear();
    }
    creatorLastSuggestedContextKey = '';
    const urlInput = document.getElementById('creatorUrlInput');
    if (urlInput) urlInput.value = '';
    const urlPreview = document.getElementById('creatorUrlPreview');
    if (urlPreview) { urlPreview.style.display = 'none'; urlPreview.innerHTML = ''; }
    const urlIndicator = document.getElementById('urlScrapeIndicator');
    if (urlIndicator) urlIndicator.style.display = 'none';
  }
  creatorSelectedSource = mode;

  // 1. Highlight selected anchor card
  document.querySelectorAll('.anchor-card').forEach(card => {
    card.classList.toggle('active', card.getAttribute('data-mode') === mode);
  });

  // 2. Update Mental Model Banner
  const mentalPill = document.getElementById('anchorMentalModelPill');
  const mentalText = document.getElementById('anchorMentalModelText');
  const mentalBadge = document.getElementById('anchorMentalModelBadge');
  const mentalCard = document.getElementById('anchorMentalModelCard');

  if (mode === 'video_audio') {
    if (mentalPill) {
      mentalPill.textContent = 'Video / Audio Link';
      mentalPill.style.background = 'rgba(239, 68, 68, 0.12)';
      mentalPill.style.color = '#EF4444';
    }
    if (mentalText) mentalText.textContent = '"I watched/listened to something that sparked a reaction."';
    if (mentalBadge) mentalBadge.style.color = '#EF4444';
    if (mentalCard) {
      mentalCard.style.background = 'rgba(239, 68, 68, 0.05)';
      mentalCard.style.borderColor = 'rgba(239, 68, 68, 0.18)';
    }
  } else if (mode === 'digital_link') {
    if (mentalPill) {
      mentalPill.textContent = 'Read / Web Link';
      mentalPill.style.background = 'rgba(2, 132, 199, 0.12)';
      mentalPill.style.color = '#0284C7';
    }
    if (mentalText) mentalText.textContent = '"I read an analysis or news story and have a counter-slant."';
    if (mentalBadge) mentalBadge.style.color = '#0284C7';
    if (mentalCard) {
      mentalCard.style.background = 'rgba(2, 132, 199, 0.05)';
      mentalCard.style.borderColor = 'rgba(2, 132, 199, 0.18)';
    }
  } else if (mode === 'inner_voice') {
    renderSourceLedger(null);
    if (mentalPill) {
      mentalPill.textContent = 'Inner Voice';
      mentalPill.style.background = 'rgba(139, 92, 246, 0.12)';
      mentalPill.style.color = '#8B5CF6';
    }
    if (mentalText) mentalText.textContent = '"This came from my own head/life; no link needed."';
    if (mentalBadge) mentalBadge.style.color = '#8B5CF6';
    if (mentalCard) {
      mentalCard.style.background = 'rgba(139, 92, 246, 0.05)';
      mentalCard.style.borderColor = 'rgba(139, 92, 246, 0.18)';
    }
  }

  // 3. Toggle trigger sections
  const secLink = document.getElementById('triggerWebSection');
  const secVoice = document.getElementById('triggerVoiceSection');
  const linkIcon = document.getElementById('triggerLinkIcon');
  const linkTitle = document.getElementById('triggerLinkTitle');
  const linkSub = document.getElementById('triggerLinkSub');
  const linkBadge = document.getElementById('triggerLinkBadge');
  const urlInput = document.getElementById('creatorUrlInput');

  if (mode === 'inner_voice') {
    if (secLink) secLink.style.display = 'none';
    if (secVoice) secVoice.style.display = 'flex';
    if (linkBadge) linkBadge.style.display = 'none';
  } else {
    // Both video_audio and digital_link use link input
    if (secLink) secLink.style.display = 'flex';
    if (secVoice) secVoice.style.display = 'none';
    if (linkBadge) {
      linkBadge.style.display = 'inline-block';
      linkBadge.textContent = 'Required';
      linkBadge.className = 'creator-tag-badge badge-required';
    }

    if (mode === 'video_audio') {
      if (linkIcon) linkIcon.textContent = '🎬';
      if (linkTitle) linkTitle.textContent = 'Video / Audio Link';
      if (linkSub) linkSub.textContent = 'YouTube, Podcast Timestamps';
      if (urlInput) urlInput.placeholder = 'Paste YouTube (e.g. https://youtu.be/... or podcast link)';
    } else {
      // digital_link
      if (linkIcon) linkIcon.textContent = '📰';
      if (linkTitle) linkTitle.textContent = 'Source Article / Newsletter Link';
      if (linkSub) linkSub.textContent = 'Articles, Newsletters, Op-Eds';
      if (urlInput) urlInput.placeholder = 'https://www.nytimes.com/... or Substack, Op-Ed URL';
    }
  }

  // 4. Update Hero Card prompts:
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
  } else if (mode === 'video_audio') {
    if (label) label.textContent = 'Your Slant / Reaction';
    if (badge) {
      badge.textContent = 'Optional';
      badge.className = 'creator-tag-badge';
    }
    if (sub) sub.textContent = 'Framing your angle, counter-slant, or reaction to what you watched/listened to.';
    if (input) input.placeholder = 'e.g. The speaker makes a compelling case for centralization, but completely overlooks how open protocols protect user autonomy...';
    if (heroIcon) heroIcon.textContent = '🎬';
    if (heroBox) heroBox.style.color = '#EF4444';
  } else {
    // digital_link
    if (label) label.textContent = 'Your Slant / Take';
    if (badge) {
      badge.textContent = 'Optional';
      badge.className = 'creator-tag-badge';
    }
    if (sub) sub.textContent = 'A few sentences framing your angle, critique, or why this article matters.';
    if (input) input.placeholder = 'e.g. The headline misses the real structural disruption happening behind the scenes...';
    if (heroIcon) heroIcon.textContent = '📰';
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

function triggerInnerVoiceCamera() {
  const cam = document.getElementById('innerVoiceCameraInput');
  if (cam) cam.click();
}

function triggerInnerVoiceUpload() {
  const file = document.getElementById('innerVoiceFileInput');
  if (file) file.click();
}

function handleInnerVoicePhotoSelect(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  compressImage(file, 1200, 0.82, function(base64Data, mimeType) {
    innerVoicePhotoBase64 = base64Data;
    innerVoicePhotoMimeType = mimeType || 'image/jpeg';

    if (!creatorReferenceImageBase64 || creatorReferenceImageSourceLabel === 'Catalyst Scene Photo') {
      creatorReferenceImageBase64 = base64Data;
      creatorReferenceImageMimeType = mimeType || 'image/jpeg';
      creatorReferenceImageSourceLabel = 'Catalyst Scene Photo';
      updateReferencePhotoUI();
    }

    const thumb = document.getElementById('innerVoicePhotoThumb');
    if (thumb) thumb.src = base64Data;
    const preview = document.getElementById('innerVoicePhotoPreview');
    if (preview) preview.style.display = 'flex';
    const emptyBox = document.getElementById('innerVoicePhotoEmpty');
    if (emptyBox) emptyBox.style.display = 'none';
  });
}

function removeInnerVoicePhoto(event) {
  if (event) event.stopPropagation();
  innerVoicePhotoBase64 = null;
  innerVoicePhotoMimeType = 'image/jpeg';

  const cam = document.getElementById('innerVoiceCameraInput');
  if (cam) cam.value = '';
  const file = document.getElementById('innerVoiceFileInput');
  if (file) file.value = '';

  const thumb = document.getElementById('innerVoicePhotoThumb');
  if (thumb) thumb.src = '';
  const preview = document.getElementById('innerVoicePhotoPreview');
  if (preview) preview.style.display = 'none';
  const emptyBox = document.getElementById('innerVoicePhotoEmpty');
  if (emptyBox) emptyBox.style.display = 'flex';

  if (creatorReferenceImageSourceLabel === 'Catalyst Scene Photo') {
    creatorReferenceImageBase64 = null;
    creatorReferenceImageSourceLabel = null;
    updateReferencePhotoUI();
  }
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
  if (typeof clearMandatoryFieldPrompts === 'function') {
    clearMandatoryFieldPrompts();
  }
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
  if (d3) { d3.className = currentSynthesizedPost ? 'creator-step-dot completed' : 'creator-step-dot'; }
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
  // Visual cues must NOT auto change unless user explicitly clicks "Suggest"
}

// Reference Photo Likeness State
let creatorReferenceImageBase64 = null;
let creatorReferenceImageMimeType = 'image/jpeg';
let creatorReferenceImageSourceLabel = null;

// Inner Voice Scene Photo State
let innerVoicePhotoBase64 = null;
let innerVoicePhotoMimeType = 'image/jpeg';

// Live Scraped Article State
let currentScrapedArticle = null;
let currentSourceLedger = null;
let isGeneratingLedger = false;
let scrapeDebounceTimer = null;
let isScrapingUrl = false;

function resetCreatorState() {
  if (typeof clearMandatoryFieldPrompts === 'function') {
    clearMandatoryFieldPrompts();
  }
  currentScrapedArticle = null;
  currentSourceLedger = null;
  renderSourceLedger(null);
  removeInnerVoicePhoto();
  currentSynthesizedPost = null;
  creatorCuePills = [];
  if (creatorSelectedCueIndices && creatorSelectedCueIndices.clear) {
    creatorSelectedCueIndices.clear();
  }
  creatorSelectedImageBase64 = null;
  creatorSelectedImageMimeType = 'image/jpeg';
  creatorReferenceImageBase64 = null;
  creatorReferenceImageMimeType = 'image/jpeg';
  creatorReferenceImageSourceLabel = null;
  creatorLastSuggestedContextKey = '';
  creatorActiveInspectedCueIndex = 0;
  creatorCountryContext = null;
  currentPreviewSlide = 0;

  // Clear inputs in Step 1
  const slantInput = document.getElementById('creatorSlantTakeInput');
  if (slantInput) slantInput.value = '';
  const reviewCard = document.getElementById('slantPolishReviewCard');
  if (reviewCard) reviewCard.style.display = 'none';
  lastPolishedTake = '';
  const sparkInput = document.getElementById('creatorSparkInput');
  if (sparkInput) sparkInput.value = '';
  const urlInput = document.getElementById('creatorUrlInput');
  if (urlInput) urlInput.value = '';
  const fileInput = document.getElementById('creatorFileInput');
  if (fileInput) fileInput.value = '';
  const cameraInput = document.getElementById('creatorCameraInput');
  if (cameraInput) cameraInput.value = '';

  // Clear previews
  const thumb = document.getElementById('creatorImageThumb');
  if (thumb) { thumb.src = ''; }
  const dropPreview = document.getElementById('creatorDropzonePreview');
  if (dropPreview) dropPreview.style.display = 'none';
  const dropDefault = document.getElementById('creatorDropzoneDefault');
  if (dropDefault) dropDefault.style.display = 'flex';
  const urlPreview = document.getElementById('creatorUrlPreview');
  if (urlPreview) { urlPreview.style.display = 'none'; urlPreview.innerHTML = ''; }

  // Clear edit modal inputs
  const editFieldIds = [
    'editModalCategory', 'editModalPublication', 'editModalHeadline',
    'editModalNewsExcerpt', 'editModalHandle', 'editModalS2Title',
    'editModalOpinion', 'editModalWhyItMatters', 'editModalMetric',
    'editModalS3Headline', 'editModalS3Quote', 'editModalS3Observation',
    'editModalS3Reflection'
  ];
  editFieldIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // Reset to Step 1 UI
  backToStep1();
}

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
    if (typeof clearMandatoryError === 'function') {
      clearMandatoryError(urlInput);
    }
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
      currentSourceLedger = null;
      renderSourceLedger(null);
    }
  });

  urlInput.addEventListener('paste', () => {
    if (typeof clearMandatoryError === 'function') {
      clearMandatoryError(urlInput);
    }
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
    currentSourceLedger = null;
    renderSourceLedger(null);
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
      // Trigger Objective Editorial Research Assistant Ledger
      if (data && data.ledger) {
        renderSourceLedger(data.ledger);
      } else {
        triggerSourceLedgerGeneration(data);
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
    // Trigger Objective Editorial Research Assistant Ledger even with minimal data
    triggerSourceLedgerGeneration(currentScrapedArticle);
  } finally {
    isScrapingUrl = false;
  }
}

let currentLedgerActiveTab = 'thesis';
let currentLedgerViewMode = 'summary'; // 'summary' | 'detailed'

function switchLedgerViewMode(mode) {
  currentLedgerViewMode = (mode === 'detailed') ? 'detailed' : 'summary';
  if (currentSourceLedger) {
    renderSourceLedger(currentSourceLedger, currentLedgerActiveTab || 'thesis');
  }
}

function switchLedgerTab(tabName) {
  currentLedgerActiveTab = tabName;
  const card = document.getElementById('sourceLedgerCard');
  if (!card) return;

  card.querySelectorAll('.ledger-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-ledger-tab') === tabName);
  });

  const panels = ['thesis', 'claims', 'tension'];
  panels.forEach(p => {
    const el = document.getElementById(`ledgerPanel_${p}`);
    if (el) {
      if (p === tabName) {
        el.style.display = 'block';
        el.classList.add('active');
      } else {
        el.style.display = 'none';
        el.classList.remove('active');
      }
    }
  });
}

function renderSourceLedgerLoading() {
  const card = document.getElementById('sourceLedgerCard');
  if (!card) return;
  card.style.display = 'block';
  card.className = 'source-ledger-card ledger-loading';
  card.innerHTML = `
    <div class="ledger-loading-inner">
      <div class="ledger-loading-spinner"></div>
      <div class="ledger-loading-text">
        <span class="ledger-loading-title">⚖️ Analyzing Source Ledger</span>
        <span class="ledger-loading-sub">Extracting verified thesis, core claims, and key tensions...</span>
      </div>
    </div>
  `;
}

function renderSourceLedger(ledger, activeTabOverride) {
  const card = document.getElementById('sourceLedgerCard');
  if (!card) return;
  if (!ledger) {
    card.style.display = 'none';
    card.innerHTML = '';
    currentLedgerActiveTab = 'thesis';
    currentLedgerViewMode = 'summary';
    return;
  }

  currentSourceLedger = ledger;
  currentLedgerActiveTab = activeTabOverride || 'thesis';
  const isDetailed = (currentLedgerViewMode === 'detailed');
  card.style.display = 'block';
  card.className = 'source-ledger-card';

  const starsCount = Math.min(3, Math.max(1, Number(ledger.stars || ledger.completeness_score || 3)));
  const starsHtml = '★'.repeat(starsCount) + '☆'.repeat(3 - starsCount);
  const starsLabel = ledger.stars_label || (starsCount === 3 ? '3/3 High Substance Anchor' : `${starsCount}/3 Anchor`);
  const rawScope = ledger.source_scope || 'Curated Source';
  let scopeClean = rawScope;
  if (/youtube/i.test(scopeClean)) {
    scopeClean = 'YouTube Video';
  } else if (/investigation/i.test(scopeClean)) {
    scopeClean = 'Investigation';
  } else if (/analysis/i.test(scopeClean)) {
    scopeClean = 'Analysis';
  } else if (scopeClean.length > 20) {
    scopeClean = scopeClean.slice(0, 18) + '…';
  }

  // Detailed facts and claims extraction
  const detailedData = ledger.detailed || null;
  const keyFactsList = (detailedData && Array.isArray(detailedData.key_facts)) ? detailedData.key_facts : [];
  const detailedClaimsList = (detailedData && Array.isArray(detailedData.detailed_claims)) ? detailedData.detailed_claims : [];

  // Mode Switcher Bar HTML (⚡ Summary vs 🔍 Detailed Facts)
  const switcherBarHtml = `
    <div class="ledger-mode-switcher-bar">
      <div class="ledger-mode-toggle-group" role="group" aria-label="Summary granularity">
        <button type="button" class="ledger-mode-toggle-btn ${!isDetailed ? 'active' : ''}" onclick="switchLedgerViewMode('summary')">
          <span>⚡ Summary</span>
        </button>
        <button type="button" class="ledger-mode-toggle-btn ${isDetailed ? 'active' : ''}" onclick="switchLedgerViewMode('detailed')">
          <span>🔍 Detailed Facts</span>
          ${keyFactsList.length > 0 ? `<span class="mode-btn-pill">${keyFactsList.length}</span>` : ''}
        </button>
      </div>
      <span class="ledger-mode-hint">${isDetailed ? 'Deep-dive with key figures, quotes & legal facts' : 'Calibrated ~1-min fast read'}</span>
    </div>
  `;

  // 1. Thesis extraction (support both object and legacy string)
  let contextText = '';
  let thesisText = '';
  if (ledger.subject_and_thesis && typeof ledger.subject_and_thesis === 'object') {
    contextText = ledger.subject_and_thesis.context || '';
    thesisText = ledger.subject_and_thesis.thesis || '';
  } else if (typeof ledger.subject_and_thesis === 'string') {
    thesisText = ledger.subject_and_thesis;
  }

  // Key Facts HTML (shown in Detailed mode)
  let keyFactsHtml = '';
  if (isDetailed && keyFactsList.length > 0) {
    keyFactsHtml = `
      <div class="ledger-detailed-facts-box">
        <div class="detailed-facts-header">
          <span>📌</span>
          <span>Key Facts, Entities & Disclosures</span>
        </div>
        <div class="detailed-facts-grid">
          ${keyFactsList.map(fact => `
            <div class="detailed-fact-item">
              <span class="fact-bullet">▪</span>
              <span>${escapeHtml(fact)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  let thesisHtml = '';
  if (contextText || thesisText || keyFactsHtml) {
    thesisHtml = `
      <div class="ledger-thesis-unified">
        ${contextText ? `
          <div class="ledger-sub-card">
            <div class="ledger-sub-card-header">
              <span class="ledger-sub-card-icon">📌</span>
              <span class="ledger-sub-card-title">Context</span>
            </div>
            <p class="ledger-sub-card-text">${escapeHtml(contextText)}</p>
          </div>
        ` : ''}
        ${thesisText ? `
          <div class="ledger-sub-card highlight">
            <div class="ledger-sub-card-header">
              <span class="ledger-sub-card-icon">🎯</span>
              <span class="ledger-sub-card-title">Central Thesis</span>
            </div>
            <p class="ledger-sub-card-text">${escapeHtml(thesisText)}</p>
          </div>
        ` : ''}
        ${keyFactsHtml}
      </div>
    `;
  } else {
    thesisHtml = `
      <div class="ledger-sub-card">
        <p class="ledger-sub-card-text">No central thesis extracted from source.</p>
      </div>
    `;
  }

  // 2. Claims & Evidence extraction (switch between detailed deep-dive claims with quotes and summary claims)
  const claimsList = Array.isArray(ledger.core_claims_and_evidence) ? ledger.core_claims_and_evidence : [];
  const activeClaimsList = (isDetailed && detailedClaimsList.length > 0) ? detailedClaimsList : claimsList;
  const claimsCount = activeClaimsList.length;

  const claimsCardsHtml = activeClaimsList.length > 0
    ? activeClaimsList.map((claim, idx) => {
        let title = '';
        let evidence = '';
        let quote = '';
        if (claim && typeof claim === 'object') {
          title = claim.title || '';
          evidence = claim.evidence || claim.text || '';
          quote = claim.quote || '';
        } else {
          const str = String(claim || '');
          const colonIdx = str.indexOf(':');
          if (colonIdx > 0 && colonIdx < 60) {
            title = str.slice(0, colonIdx).trim();
            evidence = str.slice(colonIdx + 1).trim();
          } else {
            evidence = str;
          }
        }
        return `
          <div class="ledger-claim-card ${isDetailed ? 'detailed-claim' : ''}">
            <div class="ledger-claim-badge">${idx + 1}</div>
            <div class="ledger-claim-content">
              ${title ? `<div class="ledger-claim-title">${escapeHtml(title)}</div>` : ''}
              <p class="ledger-claim-text">${escapeHtml(evidence)}</p>
              ${quote ? `
                <div class="ledger-claim-quote">
                  <span class="quote-mark">“</span>
                  <span>${escapeHtml(quote)}</span>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }).join('')
    : `
        <div class="ledger-claim-card">
          <div class="ledger-claim-badge">ℹ</div>
          <div class="ledger-claim-content">
            <p class="ledger-claim-text">Source does not provide detailed empirical evidence or cited data.</p>
          </div>
        </div>
      `;

  // 3. Tension & Tradeoffs extraction
  let primaryConflict = '';
  let tradeoffs = '';
  let counterQuestions = '';

  if (ledger.underlying_tensions && typeof ledger.underlying_tensions === 'object') {
    primaryConflict = ledger.underlying_tensions.primary_conflict || '';
    tradeoffs = ledger.underlying_tensions.tradeoffs || '';
    counterQuestions = ledger.underlying_tensions.counter_questions || '';
  } else if (typeof ledger.underlying_tension_or_question === 'string') {
    primaryConflict = ledger.underlying_tension_or_question;
  }

  let tensionHtml = '';
  if (primaryConflict || tradeoffs || counterQuestions) {
    tensionHtml = `
      <div class="ledger-tension-stack">
        ${primaryConflict ? `
          <div class="ledger-tension-card">
            <div class="ledger-tension-card-header">
              <span class="ledger-tension-badge badge-conflict">⚡ Friction</span>
            </div>
            <p class="ledger-tension-text">${escapeHtml(primaryConflict)}</p>
          </div>
        ` : ''}
        ${tradeoffs ? `
          <div class="ledger-tension-card">
            <div class="ledger-tension-card-header">
              <span class="ledger-tension-badge badge-tradeoffs">⚖️ Tradeoffs</span>
            </div>
            <p class="ledger-tension-text">${escapeHtml(tradeoffs)}</p>
          </div>
        ` : ''}
        ${counterQuestions ? `
          <div class="ledger-tension-card">
            <div class="ledger-tension-card-header">
              <span class="ledger-tension-badge badge-questions">❓ Counter-Perspective</span>
            </div>
            <p class="ledger-tension-text">${escapeHtml(counterQuestions)}</p>
          </div>
        ` : ''}
      </div>
    `;
  } else {
    tensionHtml = `
      <div class="ledger-tension-card">
        <p class="ledger-tension-text">No explicit tension or counter-perspective highlighted.</p>
      </div>
    `;
  }

  const activeTab = currentLedgerActiveTab || 'thesis';

  card.innerHTML = `
    <div class="ledger-header">
      <div class="ledger-header-left">
        <span class="ledger-header-icon">⚖️</span>
        <div class="ledger-header-meta">
          <div class="ledger-title-line">
            <span class="ledger-title">Source Summary</span>
            <span class="ledger-scope-pill">${escapeHtml(scopeClean)}</span>
          </div>
          <span class="ledger-sub-meta">Neutral Editorial Ledger</span>
        </div>
      </div>
      <div class="ledger-substance-badge" title="${escapeHtml(starsLabel)}">
        <span class="ledger-stars">${starsHtml}</span>
        <span class="ledger-stars-label">${starsCount}/3 Anchor</span>
      </div>
    </div>

    <!-- Mode Switcher (⚡ Summary vs 🔍 Detailed Facts) -->
    ${switcherBarHtml}

    <!-- 3-Category Tabs Bar -->
    <div class="ledger-tabs-bar" role="tablist">
      <button type="button" class="ledger-tab-btn ${activeTab === 'thesis' ? 'active' : ''}" data-ledger-tab="thesis" onclick="switchLedgerTab('thesis')">
        <span class="ledger-tab-icon">🎯</span>
        <span class="ledger-tab-label">Thesis</span>
      </button>
      <button type="button" class="ledger-tab-btn ${activeTab === 'claims' ? 'active' : ''}" data-ledger-tab="claims" onclick="switchLedgerTab('claims')">
        <span class="ledger-tab-icon">📊</span>
        <span class="ledger-tab-label">Claims</span>
        <span class="ledger-tab-count">${claimsCount}</span>
      </button>
      <button type="button" class="ledger-tab-btn ${activeTab === 'tension' ? 'active' : ''}" data-ledger-tab="tension" onclick="switchLedgerTab('tension')">
        <span class="ledger-tab-icon">⚖️</span>
        <span class="ledger-tab-label">Tensions</span>
      </button>
    </div>

    <!-- Tab 1: Subject & Thesis -->
    <div class="ledger-tab-panel ${activeTab === 'thesis' ? 'active' : ''}" id="ledgerPanel_thesis" style="display:${activeTab === 'thesis' ? 'block' : 'none'};">
      ${thesisHtml}
      <div class="ledger-panel-nav">
        <span></span>
        <button type="button" class="ledger-tab-nav-btn" onclick="switchLedgerTab('claims')">
          <span>Claims (${claimsCount}) →</span>
        </button>
      </div>
    </div>

    <!-- Tab 2: Core Claims & Evidence -->
    <div class="ledger-tab-panel ${activeTab === 'claims' ? 'active' : ''}" id="ledgerPanel_claims" style="display:${activeTab === 'claims' ? 'block' : 'none'};">
      <div class="ledger-claims-container">
        ${claimsCardsHtml}
      </div>
      <div class="ledger-panel-nav">
        <button type="button" class="ledger-tab-nav-btn" onclick="switchLedgerTab('thesis')">
          <span>← Thesis</span>
        </button>
        <button type="button" class="ledger-tab-nav-btn" onclick="switchLedgerTab('tension')">
          <span>Tensions →</span>
        </button>
      </div>
    </div>

    <!-- Tab 3: Underlying Tension or Question -->
    <div class="ledger-tab-panel ${activeTab === 'tension' ? 'active' : ''}" id="ledgerPanel_tension" style="display:${activeTab === 'tension' ? 'block' : 'none'};">
      ${tensionHtml}
      <div class="ledger-panel-nav">
        <button type="button" class="ledger-tab-nav-btn" onclick="switchLedgerTab('claims')">
          <span>← Claims</span>
        </button>
        <button type="button" class="ledger-tab-nav-btn" onclick="switchLedgerTab('thesis')">
          <span>Thesis ↺</span>
        </button>
      </div>
    </div>

    <div class="ledger-footer-tip">
      <span class="tip-icon">💡</span>
      <span class="tip-text">Ground your unique slant below using this factual breakdown ↓</span>
    </div>
  `;
  switchLedgerTab(activeTab);
}

async function triggerSourceLedgerGeneration(articleData) {
  if (!articleData) return;
  const url = articleData.url || '';
  const title = articleData.title || '';
  const content = articleData.content || '';
  const siteName = articleData.siteName || '';

  if (!url && !title && !content) return;

  renderSourceLedgerLoading();
  isGeneratingLedger = true;

  try {
    const resp = await fetch('/api/ledger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, title, content, siteName })
    });

    if (!resp.ok) throw new Error('Ledger endpoint returned ' + resp.status);
    const data = await resp.json();

    if (data && data.success && data.ledger) {
      currentLedgerViewMode = 'summary';
      renderSourceLedger(data.ledger, 'thesis');
    } else {
      throw new Error('Ledger data invalid');
    }
  } catch (err) {
    console.warn('Objective ledger generation error, using fallback:', err.message);
    const fallbackLedger = buildClientFallbackLedger(title, content, siteName);
    currentLedgerViewMode = 'summary';
    renderSourceLedger(fallbackLedger, 'thesis');
  } finally {
    isGeneratingLedger = false;
  }
}

function buildClientFallbackLedger(title, content, siteName) {
  const headline = title || 'Source Material';
  const name = siteName || 'The reporting source';
  return {
    subject_and_thesis: {
      context: `${name} presents reporting and ongoing context regarding "${headline}".`,
      thesis: `The piece examines principal announcements and policy implications concerning "${headline}".`
    },
    core_claims_and_evidence: [
      {
        title: 'Core Reporting',
        evidence: `${name} details the foundational timeline and primary stakeholder statements.`
      },
      {
        title: 'Market & Public Impact',
        evidence: `The source outlines practical ramifications and observable real-world shifts.`
      }
    ],
    underlying_tensions: {
      primary_conflict: `Balancing immediate policy implementation with broader long-term structural impacts.`,
      tradeoffs: `Allocating resources toward this initiative may limit alternative strategic priorities.`,
      counter_questions: `How will competing analysts evaluate the sustainability of these outcomes over time?`
    },
    detailed: {
      key_facts: [
        `Reporting originated by ${name}.`,
        `Subject focus: "${headline}".`
      ],
      detailed_claims: [
        {
          title: 'Core Reporting Breakdown',
          evidence: `${name} details the foundational timeline and primary stakeholder statements.`,
          quote: ''
        },
        {
          title: 'Market & Public Impact',
          evidence: `The source outlines practical ramifications and observable real-world shifts.`,
          quote: ''
        }
      ]
    },
    completeness_score: 2,
    stars: 2,
    stars_label: '2/3 Developing Anchor',
    source_scope: 'Curated Source'
  };
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
    howItModulates: 'Instructs the image generation engine on artistic texture: determining whether it renders as painterly editorial realism, noir risograph, vintage woodcut, or Bauhaus vector.',
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

// --- Mandatory Field Validation & Interactive Guidance Helpers ---

function clearMandatoryFieldPrompts() {
  document.querySelectorAll('.input-mandatory-error, .btn-mandatory-error').forEach(item => {
    item.classList.remove('input-mandatory-error', 'btn-mandatory-error');
  });
  document.querySelectorAll('.field-mandatory-prompt-callout').forEach(item => item.remove());
}

function clearMandatoryError(el) {
  if (!el) return;
  el.classList.remove('input-mandatory-error', 'btn-mandatory-error');
  const parent = el.closest('.trigger-section') || el.closest('.creator-hero-slant-card') || el.closest('.cues-action-bar') || el.parentElement;
  if (parent) {
    const existingCallouts = parent.querySelectorAll('.field-mandatory-prompt-callout');
    existingCallouts.forEach(c => c.remove());
  }
}

function promptMandatoryField(el, message) {
  if (!el) return;

  clearMandatoryFieldPrompts();

  const isButton = (el.tagName === 'BUTTON' || el.classList.contains('cues-suggest-btn'));
  if (isButton) {
    el.classList.add('btn-mandatory-error');
  } else {
    el.classList.add('input-mandatory-error');
  }

  const callout = document.createElement('div');
  callout.className = 'field-mandatory-prompt-callout';
  callout.innerHTML = `<span class="prompt-icon">⚠️</span><span>${escapeHtml(message)}</span>`;

  if (el.nextSibling) {
    el.parentNode.insertBefore(callout, el.nextSibling);
  } else {
    el.parentNode.appendChild(callout);
  }

  // Smooth scroll directly to the missing mandatory input
  try {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (_) {
    el.scrollIntoView();
  }

  // Focus if input or textarea
  if (!isButton && typeof el.focus === 'function') {
    setTimeout(() => {
      try { el.focus(); } catch (_) {}
    }, 150);
  }

  // Toast notification
  showTemporaryToast(`⚠️ ${message}`, 3500);

  // Auto-cleanup on interaction
  const cleanupHandler = () => {
    clearMandatoryError(el);
    el.removeEventListener('input', cleanupHandler);
    el.removeEventListener('change', cleanupHandler);
    el.removeEventListener('click', cleanupHandler);
  };
  el.addEventListener('input', cleanupHandler);
  el.addEventListener('change', cleanupHandler);
  el.addEventListener('click', cleanupHandler);
}

function isValidWebUrl(str) {
  if (!str) return false;
  const s = str.trim();
  if (/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(s)) return true;
  if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/.*)?$/i.test(s)) return true;
  return false;
}

function validateCreatorStage1(showPrompt = true) {
  const urlInput = document.getElementById('creatorUrlInput');
  const slantTakeInput = document.getElementById('creatorSlantTakeInput');
  const url = urlInput ? urlInput.value.trim() : '';
  const slantTake = slantTakeInput ? slantTakeInput.value.trim() : '';

  if (creatorSelectedSource === 'inner_voice') {
    if (!slantTake) {
      if (showPrompt) {
        promptMandatoryField(slantTakeInput, 'Please share your slant or perspective to continue.');
      }
      return false;
    }
  } else if (creatorSelectedSource === 'video_audio') {
    if (!url) {
      if (showPrompt) {
        promptMandatoryField(urlInput, 'Please provide a YouTube or podcast link to anchor your slant.');
      }
      return false;
    }
    if (!isValidWebUrl(url)) {
      if (showPrompt) {
        promptMandatoryField(urlInput, 'Please enter a valid video or audio URL (e.g. https://youtu.be/... or podcast link).');
      }
      return false;
    }
  } else {
    // digital_link
    if (!url) {
      if (showPrompt) {
        promptMandatoryField(urlInput, 'Please provide an article or newsletter link to anchor your slant.');
      }
      return false;
    }
    if (!isValidWebUrl(url)) {
      if (showPrompt) {
        promptMandatoryField(urlInput, 'Please enter a valid article URL (e.g. https://www.nytimes.com/... or substack link).');
      }
      return false;
    }
  }

  clearMandatoryFieldPrompts();
  return true;
}

function validateCreatorStage2(showPrompt = true) {
  const hasCues = Array.isArray(creatorCuePills) && creatorCuePills.length > 0;
  if (!hasCues) {
    if (showPrompt) {
      const suggestBtn = document.getElementById('cuesSuggestBtn') || document.getElementById('cuesDeckContainer');
      promptMandatoryField(suggestBtn, 'Visual cues are mandatory. Click "Generate Visual Cues" or add custom cues below before proceeding.');
    }
    return false;
  }
  clearMandatoryFieldPrompts();
  return true;
}

function goToPostersStep() {
  // 1. Stage 1 validation
  if (!validateCreatorStage1(false)) {
    backToStep1();
    validateCreatorStage1(true);
    return;
  }

  // 2. Stage 2 validation
  if (!validateCreatorStage2(false)) {
    const s2 = document.getElementById('creatorStep2');
    if (!s2 || s2.style.display === 'none') {
      goToVisualCuesStep();
    }
    validateCreatorStage2(true);
    return;
  }

  // 3. Stage 3
  if (currentSynthesizedPost) {
    showStep3Preview();
  } else {
    startAiSynthesis();
  }
}

async function goToVisualCuesStep() {
  // Validate Stage 1 mandatory inputs
  if (!validateCreatorStage1(true)) {
    return;
  }

  const urlInput = document.getElementById('creatorUrlInput');
  const slantTakeInput = document.getElementById('creatorSlantTakeInput');

  const url = urlInput ? urlInput.value.trim() : '';
  const slantTake = slantTakeInput ? slantTakeInput.value.trim() : '';

  // If URL is provided and not scraped yet, scrape now!
  if (creatorSelectedSource !== 'inner_voice' && url && !currentScrapedArticle) {
    await handleUrlInput(url);
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
  if (d3) d3.className = currentSynthesizedPost ? 'creator-step-dot completed' : 'creator-step-dot';

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
  const isLink = (creatorSelectedSource === 'digital_link');
  const articleTitle = isLink ? (currentScrapedArticle?.title || extractHeadlineFromUrl(url)) : '';
  const articleBody = isLink ? (currentScrapedArticle?.content || '') : '';
  if (!creatorCountryContext) {
    creatorCountryContext = detectGeographicContext(isLink ? url : '', articleTitle, articleBody, slantTake);
  }
  updateCountryContextUI();

  // STRICT USER DIRECTIVE: Visual cues NEVER auto-generate on page entry in any case.
  // Visual cues are generated ONLY when the user explicitly clicks the "Generate Visual Cues" / "Suggest All" button.
  if (creatorCuePills.length > 0 && creatorCharacterRepresentation === 'likeness') {
    const detected = detectPersonNameInContext(articleTitle, slantTake, currentScrapedArticle?.content);
    if (detected && !creatorCuePills[0].toLowerCase().includes(detected.toLowerCase())) {
      creatorCuePills[0] = `${detected} (Editorial Portrait)`;
    }
  }
  renderCuesDeck();
}

function renderCuesDeck() {
  const container = document.getElementById('cuesDeckContainer');
  if (!container) return;

  container.innerHTML = '';

  if (creatorCuePills.length === 0) {
    container.innerHTML = `
      <div class="cues-empty-deck-prompt" style="text-align:center; padding:32px 18px; background:rgba(15,23,42,0.6); border:1.5px dashed rgba(167,139,250,0.35); border-radius:16px; margin:6px 0 14px 0;">
        <div style="font-size:36px; margin-bottom:10px;">🎨</div>
        <div style="font-size:15px; font-weight:700; color:#F1F5F9; margin-bottom:6px;">Visual Cues Not Generated Yet</div>
        <p style="font-size:12.5px; color:#94A3B8; max-width:380px; margin:0 auto 16px auto; line-height:1.5;">
          Click the button below to generate 6 layered visual cues tailored to your slant, or add custom visual cues manually below.
        </p>
        <button type="button" class="primary-creator-btn" style="width:auto; margin:0 auto; padding:9px 22px; font-size:13px; font-weight:700; display:inline-flex; align-items:center; gap:8px;" onclick="triggerCueSuggest()">
          <span>✨</span> <span>Generate Visual Cues</span>
        </button>
      </div>
    `;
  } else {
    // Ensure inspected index is valid
    if (creatorActiveInspectedCueIndex < 0 || creatorActiveInspectedCueIndex >= creatorCuePills.length) {
      creatorActiveInspectedCueIndex = 0;
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
  }

  // Update Action Bar info & suggest button
  const infoText = document.getElementById('cuesInfoText');
  const suggestLabel = document.getElementById('cuesSuggestLabel');
  const suggestIcon = document.getElementById('cuesSuggestIcon');

  if (creatorCuePills.length === 0) {
    if (infoText) {
      infoText.innerHTML = `
        <span class="cues-info-icon">💡</span>
        <span>Click <strong>Generate Visual Cues</strong> or add your own cues below</span>
      `;
    }
    if (suggestLabel) suggestLabel.textContent = 'Generate Visual Cues';
    if (suggestIcon) suggestIcon.textContent = '✨';
  } else if (creatorSelectedCueIndices.size > 0) {
    if (infoText) {
      infoText.innerHTML = `
        <span style="color:var(--primary);font-weight:700;">${creatorSelectedCueIndices.size} selected</span>
        <span>•</span>
        <a href="javascript:void(0)" onclick="clearCueSelection()" style="color:var(--text-muted);text-decoration:underline;">Clear</a>
      `;
    }
    if (suggestLabel) suggestLabel.textContent = `Generate Selected (${creatorSelectedCueIndices.size})`;
    if (suggestIcon) suggestIcon.textContent = '🔄';
  } else {
    if (infoText) {
      infoText.innerHTML = `
        <span class="cues-info-icon">👁️</span>
        <span>Tap any cue to inspect meaning & edit below • Hold & drag ⠿ to re-rank</span>
      `;
    }
    if (suggestLabel) suggestLabel.textContent = 'Generate Visual Cues';
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
      <div class="cue-inspector-empty" style="text-align:center; padding:18px; color:var(--text-muted); font-size:12px;">
        <span class="cue-inspector-empty-icon" style="font-size:22px; display:block; margin-bottom:4px;">✨</span>
        <span>No cues to inspect yet. Click <strong>Generate Visual Cues</strong> above to generate editorial cues.</span>
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

  if (typeof clearMandatoryFieldPrompts === 'function') {
    clearMandatoryFieldPrompts();
  }

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
  if (typeof clearMandatoryFieldPrompts === 'function') {
    clearMandatoryFieldPrompts();
  }
  const urlInput = document.getElementById('creatorUrlInput');
  const slantTakeInput = document.getElementById('creatorSlantTakeInput');
  const sparkInput = document.getElementById('creatorSparkInput');
  const url = urlInput ? urlInput.value.trim() : '';
  const slantTake = slantTakeInput ? slantTakeInput.value.trim() : '';
  const spark = sparkInput ? sparkInput.value.trim() : '';

  const isLink = (creatorSelectedSource === 'digital_link');
  const articleTitle = isLink ? (currentScrapedArticle?.title || extractHeadlineFromUrl(url)) : '';
  const articleBody = isLink ? (currentScrapedArticle?.content || '') : '';

  const suggestBtn = document.getElementById('cuesSuggestBtn');
  const suggestLabel = document.getElementById('cuesSuggestLabel');
  const suggestIcon = document.getElementById('cuesSuggestIcon');

  if (suggestBtn) suggestBtn.disabled = true;
  if (suggestLabel) suggestLabel.textContent = 'Generating Visual Cues...';
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
        creatorEmail: currentUser?.email || '',
        vocabularyStyle: creatorVocabularyStyle || 'punchy',
        slantTone: (creatorSelectedSource === 'inner_voice' || /\b(family|child|love|heart|trip|vacation|weekend|pack|burnout|unplug|memoir|personal)\b/i.test(`${slantTake} ${spark}`)) ? 'heart' : 'mind',
        imageBase64: (creatorSelectedSource === 'inner_voice') ? innerVoicePhotoBase64 : null,
        imageMimeType: innerVoicePhotoMimeType || 'image/jpeg',
        innerVoiceImageBase64: (creatorSelectedSource === 'inner_voice') ? innerVoicePhotoBase64 : null,
        innerVoiceImageMimeType: innerVoicePhotoMimeType || 'image/jpeg'
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
    if (suggestLabel) suggestLabel.textContent = 'Generate Visual Cues';
    if (suggestIcon) suggestIcon.textContent = '✨';
    const finalUrl = urlInput ? urlInput.value.trim() : '';
    const finalSlant = slantTakeInput ? slantTakeInput.value.trim() : '';
    creatorLastSuggestedContextKey = `${creatorSelectedSource}::${finalUrl}::${finalSlant}`;
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
  if (type !== 'realistic' && type !== 'silhouette') {
    type = 'realistic';
  }
  creatorCharacterRepresentation = type;
  const optReal = document.getElementById('repOptionRealistic');
  const optSil = document.getElementById('repOptionSilhouette');

  if (optReal) optReal.classList.toggle('active', type === 'realistic');
  if (optSil) optSil.classList.toggle('active', type === 'silhouette');

  updateReferencePhotoUI();
}

function handleStep2NavRight() {
  if (!validateCreatorStage2(true)) {
    return;
  }
  if (currentSynthesizedPost) {
    showStep3Preview();
  } else {
    startAiSynthesis();
  }
}

async function startAiSynthesis() {
  if (!validateCreatorStage1(false)) {
    backToStep1();
    validateCreatorStage1(true);
    return;
  }
  if (!validateCreatorStage2(true)) {
    return;
  }

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
  if (synthLoading) {
    synthLoading.style.display = 'flex';
    if (!window._synthVideoLoop) {
      window._synthVideoLoop = setupSeamlessVideoLoop('synthesisVideoWrap', 'synthesisLogoVideoA', 'synthesisLogoVideoB', 0.45);
    }
    if (window._synthVideoLoop) {
      window._synthVideoLoop.start();
    } else {
      const sVid = document.getElementById('synthesisLogoVideoA') || document.getElementById('synthesisLogoVideo');
      if (sVid) {
        try {
          sVid.currentTime = 0;
          sVid.play().catch(() => {});
        } catch (_) {}
      }
    }
  }

  if (stepText) stepText.textContent = 'Reading source and extracting core tension...';
  if (fill) fill.style.width = '25%';

  const tickers = [];
  tickers.push(setTimeout(() => {
    if (stepText) stepText.textContent = 'Synthesizing 3-poster narrative (Hook → Take → Receipts)...';
    if (fill) fill.style.width = '45%';
  }, 1200));

  tickers.push(setTimeout(() => {
    if (stepText) stepText.textContent = 'Drafting visual metaphors & editorial composition...';
    if (fill) fill.style.width = '70%';
  }, 2600));

  tickers.push(setTimeout(() => {
    if (stepText) stepText.textContent = 'Polishing broadsheet copy, typography & color grade...';
    if (fill) fill.style.width = '88%';
  }, 4200));

  // Author handle
  let userHandle = '@curator';
  if (currentUser) {
    userHandle = '@' + (currentUser.user_metadata?.user_name || currentUser.user_metadata?.name || currentUser.email.split('@')[0]);
  }

  const isPhotoPortrayal = (creatorCharacterRepresentation === 'likeness' || creatorCharacterRepresentation === 'exact' || creatorCharacterRepresentation === 'lookalike');
  const shouldSendImage = isPhotoPortrayal && Boolean(creatorReferenceImageBase64);
  const effectiveImageBase64 = shouldSendImage ? (creatorReferenceImageBase64 || null) : null;
  const effectiveImageMime = shouldSendImage ? (creatorReferenceImageMimeType || 'image/jpeg') : 'image/jpeg';

  const isLink = (creatorSelectedSource === 'digital_link' || creatorSelectedSource === 'video_audio');
  const payload = {
    sourceType: creatorSelectedSource,
    url: isLink ? url : '',
    text: slantTake,
    slantTake: slantTake,
    imageBase64: effectiveImageBase64 || (creatorSelectedSource === 'inner_voice' ? innerVoicePhotoBase64 : null),
    imageMimeType: effectiveImageMime || innerVoicePhotoMimeType || 'image/jpeg',
    innerVoiceImageBase64: (creatorSelectedSource === 'inner_voice') ? innerVoicePhotoBase64 : null,
    innerVoiceImageMimeType: innerVoicePhotoMimeType || 'image/jpeg',
    targetAudience: 'General Public',
    slantTone: (creatorSelectedSource === 'inner_voice' || /\b(family|child|love|heart|trip|vacation|weekend|pack|burnout|unplug|memoir|personal)\b/i.test(`${slantTake} ${spark}`)) ? 'heart' : 'mind',
    spark,
    creatorHandle: userHandle,
    creatorEmail: currentUser?.email || '',
    cues: creatorCuePills,
    heroCue: creatorCuePills[0] || '',
    characterRepresentation: creatorCharacterRepresentation,
    refineCoreTake: creatorRefineCoreTake,
    vocabularyStyle: creatorVocabularyStyle || 'punchy',
    countryContext: creatorCountryContext?.name || 'India',
    sourceLedger: currentSourceLedger || null,
    scrapedTitle: (isLink && url) ? (currentScrapedArticle?.title || '') : '',
    scrapedContent: (isLink && url) ? (currentScrapedArticle?.content || '').slice(0, 3000) : ''
  };

  const synthController = new AbortController();
  const synthTimer = setTimeout(() => synthController.abort(), 48000);

  const clearAllTimers = () => {
    try {
      tickers.forEach(t => clearTimeout(t));
      if (synthTimer) clearTimeout(synthTimer);
    } catch (_) {}
  };

  try {
    const resp = await fetch('/api/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: synthController.signal
    });
    clearAllTimers();

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
    if (creatorSelectedSource === 'inner_voice' && innerVoicePhotoBase64) {
      currentSynthesizedPost.catalystPhoto = innerVoicePhotoBase64;
      currentSynthesizedPost.catalystPhotoBase64 = innerVoicePhotoBase64;
      currentSynthesizedPost.originalPhotoBase64 = innerVoicePhotoBase64;
      currentSynthesizedPost.originalPhotoMimeType = innerVoicePhotoMimeType || 'image/jpeg';
    }
    const effectiveSlantTake = currentSynthesizedPost.polishedCuratorTake || slantTake || '';

    if (!currentSynthesizedPost.generationInputs) {
      currentSynthesizedPost.generationInputs = {
        slantTake: effectiveSlantTake,
        sourceUrl: isLink ? url : '',
        sourceType: creatorSelectedSource,
        spark: spark || '',
        cues: [...creatorCuePills],
        heroCue: creatorCuePills[0] || '',
        characterRepresentation: creatorCharacterRepresentation,
        refineCoreTake: creatorRefineCoreTake,
        vocabularyStyle: creatorVocabularyStyle || 'punchy',
        countryContext: creatorCountryContext?.name || 'India',
        sourceLedger: currentSourceLedger || null,
        scrapedTitle: (isLink && url) ? (currentScrapedArticle?.title || '') : '',
        scrapedContent: (isLink && url) ? (currentScrapedArticle?.content || '').slice(0, 3000) : '',
        contextProvided: effectiveSlantTake || (currentScrapedArticle?.content || '').slice(0, 3000) || spark || '',
        illustrationPrompt: currentSynthesizedPost.illustrationPrompt || '',
        originalHeadline: currentSynthesizedPost.originalHeadline || currentSynthesizedPost.adaptedHeadline || ''
      };
    } else {
      currentSynthesizedPost.generationInputs.slantTake = effectiveSlantTake;
    }
    currentSynthesizedPost.contextProvided = currentSynthesizedPost.generationInputs.contextProvided || effectiveSlantTake || (currentScrapedArticle?.content || '').slice(0, 3000) || spark || '';
    currentSynthesizedPost.userSlantTake = effectiveSlantTake;
    currentSynthesizedPost.polishedCuratorTake = effectiveSlantTake;
    currentSynthesizedPost.sourceContext = (isLink && url) ? (currentScrapedArticle?.content || '').slice(0, 3000) : '';

    // Immediately synchronize edit modal fields with this fresh post to ensure zero stale DOM values
    const headInput = document.getElementById('editModalHeadline');
    if (headInput) headInput.value = currentSynthesizedPost.adaptedHeadline || '';
    const catInput = document.getElementById('editModalCategory');
    if (catInput) catInput.value = currentSynthesizedPost.categoryBadge || 'OPINION';
    const pubInput = document.getElementById('editModalPublication');
    if (pubInput) pubInput.value = currentSynthesizedPost.publicationName || '';
    const handleInput = document.getElementById('editModalHandle');
    if (handleInput) handleInput.value = currentSynthesizedPost.creatorHandle || '@curator';
    const opinionInput = document.getElementById('editModalOpinion');
    if (opinionInput) opinionInput.value = currentSynthesizedPost.creatorOpinion || currentSynthesizedPost.curatorTake || '';
    const whyInput = document.getElementById('editModalWhyItMatters');
    if (whyInput) whyInput.value = currentSynthesizedPost.whyItMatters || '';
    const metricInput = document.getElementById('editModalMetric');
    if (metricInput) metricInput.value = currentSynthesizedPost.keyMetric || '';
    const s2TitleInput = document.getElementById('editModalS2Title');
    if (s2TitleInput) s2TitleInput.value = currentSynthesizedPost.critiqueBadge || (currentSynthesizedPost.keyTakeaways && currentSynthesizedPost.keyTakeaways[0] ? currentSynthesizedPost.keyTakeaways[0].toUpperCase() : 'THE CRITICAL PERSPECTIVE');

    // Wait for custom editorial illustration so the user lands directly on the finished artwork
    if (currentSynthesizedPost && !currentSynthesizedPost.illustrationBase64 && currentSynthesizedPost.illustrationPrompt) {
      if (stepText) stepText.textContent = 'Rendering custom editorial artwork & visual metaphors...';
      if (fill) fill.style.width = '88%';

      try {
        const artController = new AbortController();
        const artTimeout = setTimeout(() => artController.abort(), 19000);

        const artResp = await fetch('/api/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'artwork_only',
            creatorEmail: currentUser?.email || '',
            prompt: currentSynthesizedPost.illustrationPrompt,
            imageBase64: (creatorCharacterRepresentation === 'likeness' || creatorCharacterRepresentation === 'lookalike') ? (creatorReferenceImageBase64 || null) : null,
            imageMimeType: creatorReferenceImageMimeType || 'image/jpeg'
          }),
          signal: artController.signal
        });
        clearTimeout(artTimeout);

        if (artResp.ok) {
          const artData = await artResp.json();
          if (artData && artData.success) {
            if (artData.illustrationBase64) {
              currentSynthesizedPost.illustrationBase64 = artData.illustrationBase64;
              currentSynthesizedPost.artworkPending = false;
            }
            if (artData.illustrationUrl) {
              currentSynthesizedPost.illustrationUrl = artData.illustrationUrl;
              currentSynthesizedPost.aiIllustrationUrl = artData.illustrationUrl;
            }
          }
        }
      } catch (artErr) {
        console.info('Artwork generation inline skipped or timed out, using curated fallback:', artErr.message);
      }
    }

    if (stepText) stepText.textContent = 'Editorial deck finalized!';
    if (fill) fill.style.width = '100%';

    setTimeout(() => {
      try {
        if (window._synthVideoLoop) {
          try { window._synthVideoLoop.stop(); } catch (_) {}
          window._synthVideoLoop = null;
        }
        const sVid = document.getElementById('synthesisLogoVideoA') || document.getElementById('synthesisLogoVideo');
        if (sVid) {
          try { sVid.pause(); } catch (_) {}
        }
        if (synthLoading) synthLoading.style.display = 'none';
        showStep3Preview();
      } catch (renderErr) {
        console.error('Error in showStep3Preview:', renderErr);
        if (cuesContent) cuesContent.style.display = 'flex';
        if (synthLoading) synthLoading.style.display = 'none';
        alert('Could not render posters: ' + renderErr.message);
      }
    }, 350);

  } catch (err) {
    clearAllTimers();
    if (window._synthVideoLoop) {
      try { window._synthVideoLoop.stop(); } catch (_) {}
      window._synthVideoLoop = null;
    }
    const sVid = document.getElementById('synthesisLogoVideoA') || document.getElementById('synthesisLogoVideo');
    if (sVid) {
      try { sVid.pause(); } catch (_) {}
    }
    console.error('AI Synthesis error:', err);
    const isTimeout = (err.name === 'AbortError' || err.message === 'Failed to fetch' || (err.message && (err.message.includes('fetch') || err.message.includes('timed out') || err.message.includes('timeout'))));
    const friendlyMsg = isTimeout
      ? 'The synthesis connection timed out. Tap Synthesize again to complete your posters.'
      : (err.message || 'An error occurred during synthesis. Please try again.');
    showTemporaryToast('⚠️ ' + friendlyMsg);
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
        creatorEmail: currentUser?.email || '',
        prompt: post.illustrationPrompt,
        imageBase64: (creatorCharacterRepresentation === 'likeness' || creatorCharacterRepresentation === 'lookalike') ? (creatorReferenceImageBase64 || null) : null,
        imageMimeType: creatorReferenceImageMimeType || 'image/jpeg'
      })
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data && data.success) {
        if (data.illustrationBase64) post.illustrationBase64 = data.illustrationBase64;
        if (data.illustrationUrl) {
          post.illustrationUrl = data.illustrationUrl;
          post.aiIllustrationUrl = data.illustrationUrl;
        }
        post.artworkPending = false;
        if (currentSynthesizedPost && currentSynthesizedPost.id === post.id) {
          if (data.illustrationBase64) currentSynthesizedPost.illustrationBase64 = data.illustrationBase64;
          if (data.illustrationUrl) {
            currentSynthesizedPost.illustrationUrl = data.illustrationUrl;
            currentSynthesizedPost.aiIllustrationUrl = data.illustrationUrl;
          }
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
    } else if (creatorSelectedSource === 'video_audio') {
      prevTab2.innerHTML = '<span>🎬</span> Poster 3: Broadcast Receipts';
    } else {
      prevTab2.innerHTML = '<span>📰</span> Poster 3: Web Receipts';
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

// --- Whole Poster High-Definition Preview Modal ---
let currentWholePosterSlide = 0;
let isWholePosterClean = false;

function openWholePosterModal(slideIdx) {
  if (!currentSynthesizedPost) return;

  const modal = document.getElementById('wholePosterModal');
  const frame = document.getElementById('wholePosterCardFrame');
  if (!modal || !frame) return;

  if (typeof slideIdx === 'number' && slideIdx >= 0 && slideIdx <= 2) {
    currentWholePosterSlide = slideIdx;
  } else if (typeof currentPreviewSlide === 'number') {
    currentWholePosterSlide = currentPreviewSlide;
  } else {
    currentWholePosterSlide = 0;
  }

  isWholePosterClean = false;

  // Build the complete 3-slide carousel inside the whole poster frame
  frame.innerHTML = `
    <div class="carousel-view ${isWholePosterClean ? 'clean-view' : ''}" id="carousel-whole" data-post-index="whole" data-current-slide="${currentWholePosterSlide}">
      <div class="carousel-track" id="track-whole">
        <div class="carousel-slide slide-hook">
          ${buildSlide1Html(currentSynthesizedPost, 'whole')}
        </div>
        <div class="carousel-slide slide-critique">
          ${buildSlide2Html(currentSynthesizedPost, 'whole')}
        </div>
        <div class="carousel-slide slide-receipt">
          ${buildSlide3Html(currentSynthesizedPost, 'whole')}
        </div>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
  void modal.offsetWidth;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');

  // Navigate to target slide
  switchWholePosterSlide(currentWholePosterSlide);

  // Setup touch swipe gestures on whole poster frame
  setupWholePosterGestures();

  // Update clean button UI
  updateWholePosterCleanBtnUI();

  // Listen for keyboard ESC / Left / Right arrows
  window.addEventListener('keydown', handleWholePosterKeydown);
}

function closeWholePosterModal() {
  const modal = document.getElementById('wholePosterModal');
  if (!modal) return;

  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  setTimeout(() => {
    modal.style.display = 'none';
  }, 200);

  window.removeEventListener('keydown', handleWholePosterKeydown);

  // Sync current slide back to editor deck preview
  if (typeof switchPreviewSlide === 'function') {
    switchPreviewSlide(currentWholePosterSlide);
  }
}

function handleWholePosterKeydown(e) {
  if (e.key === 'Escape') {
    closeWholePosterModal();
  } else if (e.key === 'ArrowLeft') {
    changeWholePosterSlide(-1);
  } else if (e.key === 'ArrowRight') {
    changeWholePosterSlide(1);
  }
}

function switchWholePosterSlide(slideIdx) {
  currentWholePosterSlide = Math.max(0, Math.min(2, slideIdx));

  goToSlide(null, 'whole', currentWholePosterSlide);

  [0, 1, 2].forEach(i => {
    const pill = document.getElementById(`wholePill${i}`);
    if (pill) pill.classList.toggle('active', i === currentWholePosterSlide);
  });

  const titleEl = document.getElementById('wholePosterSlideTitle');
  if (titleEl) {
    const titles = [
      'Poster 1: The Visual Hook',
      'Poster 2: The Slant & Take',
      'Poster 3: Slant Minute Receipts'
    ];
    titleEl.textContent = titles[currentWholePosterSlide] || 'Whole Poster';
  }
}

function changeWholePosterSlide(delta) {
  const nextSlide = (currentWholePosterSlide + delta + 3) % 3;
  switchWholePosterSlide(nextSlide);
}

function toggleWholePosterCleanView() {
  isWholePosterClean = !isWholePosterClean;
  const carousel = document.getElementById('carousel-whole');
  if (carousel) {
    carousel.classList.toggle('clean-view', isWholePosterClean);
  }
  updateWholePosterCleanBtnUI();
}

function updateWholePosterCleanBtnUI() {
  const btn = document.getElementById('wholePosterCleanBtn');
  const label = document.getElementById('wholePosterCleanLabel');
  if (!btn || !label) return;
  btn.classList.toggle('active', isWholePosterClean);
  label.textContent = isWholePosterClean ? 'Show Text' : 'Clean Artwork';
}

function setupWholePosterGestures() {
  const track = document.getElementById('track-whole');
  if (!track) return;

  let startX = 0;
  let startY = 0;
  let isSwiping = false;

  track.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isSwiping = true;
    }
  }, { passive: true });

  track.addEventListener('touchend', (e) => {
    if (!isSwiping) return;
    isSwiping = false;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const diffX = endX - startX;
    const diffY = endY - startY;

    if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
      if (diffX < 0) {
        changeWholePosterSlide(1);
      } else {
        changeWholePosterSlide(-1);
      }
    }
  }, { passive: true });
}

// --- Step 3 Toolbar Actions (Matches Flutter create_postcard_screen.dart:3417-3490) ---

function handleStep3Regenerate() {
  // Reopen the editor deck from the beginning (Step 1) without changing visual cues
  backToStep1();
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

  try {
    showTemporaryToast('📸 Preparing posters to share...');
    const files = await capturePostSlidesAsFiles(currentSynthesizedPost, 0);
    if (files && files.length > 0) {
      if (navigator.canShare && navigator.canShare({ files })) {
        try {
          await navigator.share({
            files,
            title: currentSynthesizedPost.adaptedHeadline || 'Slant Editorial Carousel',
            text: `${currentSynthesizedPost.creatorHandle || '@curator'}: "${currentSynthesizedPost.creatorOpinion || currentSynthesizedPost.adaptedHeadline}"`
          });
          showTemporaryToast('✨ 3 Slide Posters shared!');
          return;
        } catch (err) {
          if (err.name === 'AbortError') return; // User closed share sheet
        }
      }
      openSharePostersModal(currentSynthesizedPost, files);
      return;
    }
  } catch (err) {
    console.warn('capturePostSlidesAsFiles error during share:', err);
  }

  // Fallback to text/URL share sheet
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

async function handleStep3Download() {
  if (!currentSynthesizedPost) return;
  const dlBtn = document.getElementById('step3DownloadBtn');
  const dlLbl = document.getElementById('step3DownloadLabel');

  try {
    showTemporaryToast('📥 Rendering 3 high-res posters for your gallery...');
    if (dlLbl) dlLbl.textContent = 'Saving...';

    const files = await capturePostSlidesAsFiles(currentSynthesizedPost, 0);
    if (files && files.length > 0) {
      downloadShareFiles(files);
      if (dlBtn) dlBtn.classList.add('active');
      if (dlLbl) dlLbl.textContent = 'Downloaded';
      showTemporaryToast('✅ 3 posters saved to your gallery / downloads!');
      return;
    }
  } catch (err) {
    console.warn('High-res trio render failed, falling back to direct poster download:', err);
  }

  // Resilient fallback: direct image download
  const imgUrl = currentSynthesizedPost.illustrationUrl || currentSynthesizedPost.posterBase64 || currentSynthesizedPost.imageUrl;
  if (imgUrl) {
    const a = document.createElement('a');
    a.href = imgUrl;
    const slug = (currentSynthesizedPost.categoryBadge || 'slant').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    a.download = `${slug}-poster-slide${(currentPreviewSlide || 0) + 1}.png`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    if (dlBtn) dlBtn.classList.add('active');
    if (dlLbl) dlLbl.textContent = 'Downloaded';
    showTemporaryToast('📥 Poster saved to your gallery / downloads!');
  } else {
    showTemporaryToast('📥 Poster ready for export!');
  }
}

async function compressImageForCloud(base64Data, maxWidth = 900, quality = 0.82) {
  if (!base64Data || typeof base64Data !== 'string') {
    return base64Data;
  }
  let src = base64Data;
  if (!src.startsWith('data:image')) {
    const isPng = src.startsWith('iVBORw');
    src = `data:image/${isPng ? 'png' : 'jpeg'};base64,${src}`;
  }
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          let w = img.width;
          let h = img.height;
          if (w > maxWidth) {
            h = Math.round((h * maxWidth) / w);
            w = maxWidth;
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          let result = canvas.toDataURL('image/webp', quality);
          if (!result || !result.startsWith('data:image/webp')) {
            result = canvas.toDataURL('image/jpeg', quality);
          }
          resolve(result);
        } catch (_) {
          resolve(base64Data);
        }
      };
      img.onerror = () => resolve(base64Data);
      img.src = src;
    } catch (_) {
      resolve(base64Data);
    }
  });
}

async function saveSynthesizedPost() {
  if (!currentSynthesizedPost) return;

  const saveBtn = document.getElementById('step3SaveBtn');
  const saveLbl = document.getElementById('step3SaveLabel');
  if (saveBtn) saveBtn.disabled = true;
  if (saveLbl) saveLbl.textContent = 'Saving...';

  if (currentUser) {
    currentSynthesizedPost.user_id = currentUser.id;
    currentSynthesizedPost.userEmail = currentUser.email;
  }
  currentSynthesizedPost.createdAt = new Date().toISOString();
  currentSynthesizedPost.isUserCreated = true;
  currentSynthesizedPost.isDraft = true;
  currentSynthesizedPost.isPrivate = true;
  currentSynthesizedPost.status = 'draft';

  // 1. Clean & compress payload: store crisp ~60KB WebP so Supabase rows never trigger timeout
  const postToSave = { ...currentSynthesizedPost };
  const savedSlantTake = currentSynthesizedPost.polishedCuratorTake || currentSynthesizedPost.generationInputs?.slantTake || currentSynthesizedPost.userSlantTake || '';
  if (savedSlantTake) {
    postToSave.polishedCuratorTake = savedSlantTake;
    postToSave.userSlantTake = savedSlantTake;
    if (!postToSave.generationInputs) postToSave.generationInputs = {};
    postToSave.generationInputs.slantTake = savedSlantTake;
  }
  if (currentSynthesizedPost.generationInputs) {
    postToSave.generationInputs = currentSynthesizedPost.generationInputs;
  }
  if (currentSynthesizedPost.contextProvided) {
    postToSave.contextProvided = currentSynthesizedPost.contextProvided;
  }
  if (currentSynthesizedPost.userSlantTake) {
    postToSave.userSlantTake = currentSynthesizedPost.userSlantTake;
  }
  if (currentSynthesizedPost.sourceContext) {
    postToSave.sourceContext = currentSynthesizedPost.sourceContext;
  }
  postToSave.isDraft = true;
  postToSave.isPrivate = true;
  postToSave.status = 'draft';

  const rawPoster = currentSynthesizedPost.illustrationBase64 || currentSynthesizedPost.originalPhotoBase64;
  if (rawPoster) {
    try {
      const compressed = await compressImageForCloud(rawPoster, 900, 0.82);
      postToSave.posterBase64 = compressed;
    } catch (_) {}
  }
  if (currentSynthesizedPost.catalystPhoto || currentSynthesizedPost.catalystPhotoBase64) {
    const rawCat = currentSynthesizedPost.catalystPhoto || currentSynthesizedPost.catalystPhotoBase64;
    try {
      postToSave.catalystPhoto = await compressImageForCloud(rawCat, 600, 0.75);
    } catch (_) {
      postToSave.catalystPhoto = rawCat;
    }
  }
  delete postToSave.illustrationBase64;
  delete postToSave.originalPhotoBase64;
  postToSave.illustrationUrl = '/posters/' + postToSave.id + '.png';
  postToSave.aiIllustrationUrl = '/posters/' + postToSave.id + '.png';

  // 2. Cloud save: POST to /api/posts
  let savedToCloud = false;
  try {
    const resp = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postToSave)
    });
    if (resp.ok) savedToCloud = true;
  } catch (err) {
    console.warn('Backend save call error:', err);
  }

  // 3. Fallback: Direct Supabase write
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
      if (supaResp.ok) savedToCloud = true;
    } catch (supaErr) {
      console.warn('Direct Supabase save error:', supaErr);
    }
  }

  // 4. Local storage persistent cache for user profile
  try {
    const sanitizeForCache = (p) => {
      if (!p) return null;
      const copy = { ...p };
      delete copy.originalPhotoBase64;
      if (copy.illustrationBase64 && copy.illustrationBase64.length > 50000) {
        delete copy.illustrationBase64;
      }
      if (!copy.illustrationUrl) {
        copy.illustrationUrl = '/posters/' + copy.id + '.png';
        copy.aiIllustrationUrl = copy.illustrationUrl;
      }
      return copy;
    };

    const localPosts = JSON.parse(localStorage.getItem('slant_user_posts_cache') || '[]');
    const filtered = localPosts.filter(p => p && p.id !== currentSynthesizedPost.id).map(sanitizeForCache).filter(Boolean);
    const sanitizedCurrent = sanitizeForCache(currentSynthesizedPost);
    if (sanitizedCurrent) filtered.unshift(sanitizedCurrent);
    localStorage.setItem('slant_user_posts_cache', JSON.stringify(filtered.slice(0, 30)));
  } catch (lsErr) {
    console.warn('Could not cache user draft to localStorage:', lsErr);
  }

  // 5. Track in local storage ID set & sync with cloud profile
  myCreatedPostIds.add(currentSynthesizedPost.id);
  localStorage.setItem('slant_my_posts', JSON.stringify(Array.from(myCreatedPostIds)));
  syncUserMetadataToCloud();

  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.classList.add('active');
  }
  if (saveLbl) saveLbl.textContent = 'Saved';

  // 6. Merge & sort chronologically into allPosts
  mergeAndSortPosts([currentSynthesizedPost]);
  updateAuthUI();
  renderFeed();

  // 7. Close modal & reset state & notify user
  closeCreatorModal();
  resetCreatorState();
  showTemporaryToast('🔖 Saved to your profile! Only you can see this in "My Stories".');
}

async function publishSynthesizedPost() {
  if (!currentSynthesizedPost) return;

  const publishBtn = document.getElementById('publishBtn');
  const actionPublishBtn = document.getElementById('step3PublishActionBtn');
  const actionPublishLbl = document.getElementById('step3PublishActionLabel');
  if (publishBtn) {
    publishBtn.disabled = true;
    publishBtn.innerHTML = '<span>Publishing to Live Feed... ⏳</span>';
  }
  if (actionPublishBtn) actionPublishBtn.disabled = true;
  if (actionPublishLbl) actionPublishLbl.textContent = 'Publishing...';

  if (currentUser) {
    currentSynthesizedPost.user_id = currentUser.id;
    currentSynthesizedPost.userEmail = currentUser.email;
  }
  currentSynthesizedPost.createdAt = new Date().toISOString();
  currentSynthesizedPost.isUserCreated = true;
  currentSynthesizedPost.isDraft = false;
  currentSynthesizedPost.isPrivate = false;
  currentSynthesizedPost.status = 'published';

  // 1. Clean & compress payload: store crisp ~60KB WebP so Supabase rows never trigger timeout
  const postToSave = { ...currentSynthesizedPost };
  const savedSlantTake = currentSynthesizedPost.polishedCuratorTake || currentSynthesizedPost.generationInputs?.slantTake || currentSynthesizedPost.userSlantTake || '';
  if (savedSlantTake) {
    postToSave.polishedCuratorTake = savedSlantTake;
    postToSave.userSlantTake = savedSlantTake;
    if (!postToSave.generationInputs) postToSave.generationInputs = {};
    postToSave.generationInputs.slantTake = savedSlantTake;
  }
  if (currentSynthesizedPost.generationInputs) {
    postToSave.generationInputs = currentSynthesizedPost.generationInputs;
  }
  if (currentSynthesizedPost.contextProvided) {
    postToSave.contextProvided = currentSynthesizedPost.contextProvided;
  }
  if (currentSynthesizedPost.userSlantTake) {
    postToSave.userSlantTake = currentSynthesizedPost.userSlantTake;
  }
  if (currentSynthesizedPost.sourceContext) {
    postToSave.sourceContext = currentSynthesizedPost.sourceContext;
  }
  postToSave.isDraft = false;
  postToSave.isPrivate = false;
  postToSave.status = 'published';

  const rawPoster = currentSynthesizedPost.illustrationBase64 || currentSynthesizedPost.originalPhotoBase64;
  if (rawPoster) {
    try {
      const compressed = await compressImageForCloud(rawPoster, 900, 0.82);
      postToSave.posterBase64 = compressed;
    } catch (_) {}
  }
  if (currentSynthesizedPost.catalystPhoto || currentSynthesizedPost.catalystPhotoBase64) {
    const rawCat = currentSynthesizedPost.catalystPhoto || currentSynthesizedPost.catalystPhotoBase64;
    try {
      postToSave.catalystPhoto = await compressImageForCloud(rawCat, 600, 0.75);
    } catch (_) {
      postToSave.catalystPhoto = rawCat;
    }
  }
  delete postToSave.illustrationBase64;
  delete postToSave.originalPhotoBase64;
  postToSave.illustrationUrl = '/posters/' + postToSave.id + '.png';
  postToSave.aiIllustrationUrl = '/posters/' + postToSave.id + '.png';

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

  // 4. Local storage persistent backup: Save post so stories NEVER vanish across reloads/sign-ins
  try {
    const sanitizeForCache = (p) => {
      if (!p) return null;
      const copy = { ...p };
      delete copy.originalPhotoBase64;
      if (copy.illustrationBase64 && copy.illustrationBase64.length > 50000) {
        delete copy.illustrationBase64;
      }
      if (!copy.illustrationUrl) {
        copy.illustrationUrl = '/posters/' + copy.id + '.png';
        copy.aiIllustrationUrl = copy.illustrationUrl;
      }
      return copy;
    };

    const localPosts = JSON.parse(localStorage.getItem('slant_user_posts_cache') || '[]');
    const filtered = localPosts.filter(p => p && p.id !== currentSynthesizedPost.id).map(sanitizeForCache).filter(Boolean);
    const sanitizedCurrent = sanitizeForCache(currentSynthesizedPost);
    if (sanitizedCurrent) filtered.unshift(sanitizedCurrent);
    localStorage.setItem('slant_user_posts_cache', JSON.stringify(filtered.slice(0, 30)));
  } catch (lsErr) {
    console.warn('Could not cache user post to localStorage:', lsErr);
  }

  // 5. Track in local storage ID set & sync with cloud profile
  myCreatedPostIds.add(currentSynthesizedPost.id);
  localStorage.setItem('slant_my_posts', JSON.stringify(Array.from(myCreatedPostIds)));
  syncUserMetadataToCloud();

  // Update Step 3 Publish button state
  if (actionPublishBtn) {
    actionPublishBtn.disabled = false;
    actionPublishBtn.classList.add('active');
  }
  if (actionPublishLbl) actionPublishLbl.textContent = 'Published';

  // 6. Merge & sort chronologically, then render feed
  mergeAndSortPosts([currentSynthesizedPost]);
  updateBadge(true, `Live Feed (${allPosts.length} posts)`);
  updateAuthUI();
  renderFeed();

  // 7. Close modal & reset state & show toast
  closeCreatorModal();
  resetCreatorState();
  showTemporaryToast('✨ Published! Your 3-poster Slant is live on slant.today');

  // Scroll smoothly to top so user sees their new post
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (publishBtn) {
    publishBtn.disabled = false;
    publishBtn.innerHTML = '<span>Publish to slant.today 🚀</span>';
  }
}

window._feedLoaderStartTime = Date.now();
try {
  if (!window._feedVideoLoop) {
    window._feedVideoLoop = setupSeamlessVideoLoop('feedLoaderVideoWrap', 'feedInitialVideoA', 'feedInitialVideoB', 0.45);
  }
  if (window._feedVideoLoop) {
    window._feedVideoLoop.start();
  } else {
    const initVid = document.getElementById('feedInitialVideoA') || document.getElementById('feedInitialVideo');
    if (initVid) {
      initVid.currentTime = 0;
      const playPromise = initVid.play();
      if (playPromise !== undefined) playPromise.catch(() => {});
    }
  }
} catch (_) {}
setTimeout(() => dismissInitialFeedLoader(true), 25000); // 25s absolute safety fallback

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
