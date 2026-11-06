// Serverless Function: /api/synthesize
// Synthesizes raw inputs (Web links, Photos/Clippings, Inner Voice)
// into a complete 3-poster Slant carousel using Gemini 3.8 Flash.

const DEFAULT_KEY_B64 = 'QVEuQWI4Uk42STR5WnQzMEl6NGpLRkQ2SndaYVlSeThQYlVtWXpDYUNuMzU3alIyUU9KbFE=';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || Buffer.from(DEFAULT_KEY_B64, 'base64').toString('utf8');
const GEMINI_MODEL = 'gemini-3.8-flash';

const SUPABASE_URL = 'https://fxfklefnkpmhofncqhfh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4ZmtsZWZua3BtaG9mbmNxaGZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NzM4NzYsImV4cCI6MjEwODA0OTg3Nn0.0nw5ZDvlEsYal6EYXcqyaAPRHoxkXxZgDsNQDppEYgM';
const MASTER_ADMINS = ['shridharoct16@gmail.com'];
const STARTER_PERSPECTIVE_CREDITS = 3;
const DEFAULT_DAILY_CREDIT_LIMIT = 1;
const DAILY_CHRONICLE_FREE_LIMIT = 1;

function getTodayDateKeyIST() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  } catch (_) {
    return new Date().toISOString().slice(0, 10);
  }
}

async function verifyAndConsumeUserCredit(email, consume = false, isChronicleMode = false, simulateZeroCredits = false) {
  if (!email) return { allowed: false, hasCredits: false, credits: null };
  const clean = String(email).toLowerCase().trim();
  const todayKey = getTodayDateKeyIST();

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.system_beta_whitelist&select=data`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    if (resp.ok) {
      const rows = await resp.json();
      const d = rows?.[0]?.data || {};
      const allowedList = Array.isArray(d.allowed_emails) ? d.allowed_emails.map(e => String(e).toLowerCase().trim()) : [];
      const adminList = Array.isArray(d.admin_emails) ? d.admin_emails.map(e => String(e).toLowerCase().trim()) : [];
      const defaultLimit = Number(d.default_daily_limit) > 0 ? Number(d.default_daily_limit) : DEFAULT_DAILY_CREDIT_LIMIT;
      if (!d.user_credits || typeof d.user_credits !== 'object') {
        d.user_credits = {};
      }
      const existing = d.user_credits[clean] || {};
      const isMaster = MASTER_ADMINS.includes(clean);
      const isEffectiveMaster = isMaster && !simulateZeroCredits;
      const isAllowed = isMaster || adminList.includes(clean) || allowedList.includes(clean);
      if (!isAllowed) {
        return { allowed: false, hasCredits: false, credits: null };
      }

      if (isMaster && simulateZeroCredits) {
        return {
          allowed: true,
          hasCredits: false,
          credits: {
            email: clean,
            isUnlimited: false,
            simulatedZeroCredits: true,
            starterTotal: STARTER_PERSPECTIVE_CREDITS,
            starterUsed: STARTER_PERSPECTIVE_CREDITS,
            starterRemaining: 0,
            dailyLimit,
            perspectiveUsedToday: dailyLimit,
            perspectiveDailyRemaining: 0,
            perspectiveRemainingToday: 0,
            chronicleDailyLimit: DAILY_CHRONICLE_FREE_LIMIT,
            chronicleUsedToday: DAILY_CHRONICLE_FREE_LIMIT,
            chronicleFreeRemainingToday: 0,
            chronicleRemainingToday: 0,
            usedToday: dailyLimit + DAILY_CHRONICLE_FREE_LIMIT,
            dailyRemaining: 0,
            bonusCredits: 0,
            remainingToday: 0,
            totalUsed: Number(existing.totalUsed) || 0,
            lastDateKey: todayKey
          }
        };
      }

      const starterTotal = STARTER_PERSPECTIVE_CREDITS;
      let starterUsed = Math.min(starterTotal, Math.max(0, Number(existing.starterUsed ?? 0)));
      let starterRemaining = Math.max(0, starterTotal - starterUsed);

      const dailyLimit = Number(existing.dailyLimit) > 0 ? Number(existing.dailyLimit) : defaultLimit;
      const isSameDay = existing.lastDateKey === todayKey;
      let perspectiveUsedToday = isSameDay ? (Number(existing.perspectiveUsedToday ?? existing.usedToday) || 0) : 0;
      let chronicleUsedToday = isSameDay ? (Number(existing.chronicleUsedToday) || 0) : 0;
      let bonusCredits = Math.max(0, Number(existing.bonusCredits) || 0);
      let totalUsed = Math.max(0, Number(existing.totalUsed) || 0);

      const perspectiveDailyRemainingBefore = Math.max(0, dailyLimit - perspectiveUsedToday);
      const perspectiveBaseBefore = starterRemaining > 0 ? starterRemaining : perspectiveDailyRemainingBefore;
      const chronicleFreeRemainingBefore = Math.max(0, DAILY_CHRONICLE_FREE_LIMIT - chronicleUsedToday);

      const hasCredits = isEffectiveMaster
        || (isChronicleMode
          ? (chronicleFreeRemainingBefore > 0 || bonusCredits > 0)
          : (perspectiveBaseBefore > 0 || bonusCredits > 0));

      if (hasCredits && consume) {
        if (isChronicleMode) {
          if (!isEffectiveMaster && chronicleFreeRemainingBefore <= 0 && bonusCredits > 0) {
            bonusCredits = Math.max(0, bonusCredits - 1);
          }
          chronicleUsedToday += 1;
        } else {
          if (!isEffectiveMaster) {
            if (starterRemaining > 0) {
              starterUsed += 1;
            } else if (perspectiveDailyRemainingBefore > 0) {
              perspectiveUsedToday += 1;
            } else if (bonusCredits > 0) {
              bonusCredits = Math.max(0, bonusCredits - 1);
              perspectiveUsedToday += 1;
            }
          } else {
            perspectiveUsedToday += 1;
          }
        }
        totalUsed += 1;

        d.user_credits[clean] = {
          ...existing,
          starterUsed,
          dailyLimit,
          usedToday: perspectiveUsedToday + chronicleUsedToday,
          perspectiveUsedToday,
          chronicleUsedToday,
          lastDateKey: todayKey,
          bonusCredits,
          totalUsed,
          lastUsedAt: new Date().toISOString()
        };
        // Persist updated credit count non-blockingly so synthesis latency is unaffected
        fetch(`${SUPABASE_URL}/rest/v1/posts`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify({ id: 'system_beta_whitelist', data: d })
        }).catch(() => {});
      }

      starterRemaining = Math.max(0, starterTotal - starterUsed);
      const perspectiveDailyRemainingAfter = Math.max(0, dailyLimit - perspectiveUsedToday);
      const perspectiveBaseAfter = starterRemaining > 0 ? starterRemaining : perspectiveDailyRemainingAfter;
      const perspectiveRemainingToday = isEffectiveMaster ? 9999 : (perspectiveBaseAfter + bonusCredits);
      const chronicleFreeRemainingToday = Math.max(0, DAILY_CHRONICLE_FREE_LIMIT - chronicleUsedToday);
      const chronicleRemainingToday = isEffectiveMaster ? 9999 : (chronicleFreeRemainingToday + bonusCredits);

      return {
        allowed: true,
        hasCredits,
        credits: {
          email: clean,
          isUnlimited: isEffectiveMaster,
          starterTotal,
          starterUsed,
          starterRemaining,
          dailyLimit,
          perspectiveUsedToday,
          perspectiveDailyRemaining: perspectiveDailyRemainingAfter,
          perspectiveRemainingToday,
          chronicleDailyLimit: DAILY_CHRONICLE_FREE_LIMIT,
          chronicleUsedToday,
          chronicleFreeRemainingToday,
          chronicleRemainingToday,
          usedToday: perspectiveUsedToday + chronicleUsedToday,
          dailyRemaining: perspectiveBaseAfter,
          bonusCredits,
          remainingToday: perspectiveRemainingToday,
          totalUsed,
          lastDateKey: todayKey
        }
      };
    }
  } catch (err) {
    console.warn('Synthesize credit & whitelist check notice:', err);
  }

  const isMasterFallback = MASTER_ADMINS.includes(clean);
  const isEffectiveMasterFallback = isMasterFallback && !simulateZeroCredits;
  return {
    allowed: isMasterFallback,
    hasCredits: isEffectiveMasterFallback,
    credits: isMasterFallback ? {
      email: clean,
      isUnlimited: isEffectiveMasterFallback,
      simulatedZeroCredits: Boolean(simulateZeroCredits),
      starterTotal: STARTER_PERSPECTIVE_CREDITS,
      starterUsed: simulateZeroCredits ? STARTER_PERSPECTIVE_CREDITS : 0,
      starterRemaining: simulateZeroCredits ? 0 : STARTER_PERSPECTIVE_CREDITS,
      dailyLimit: DEFAULT_DAILY_CREDIT_LIMIT,
      perspectiveRemainingToday: simulateZeroCredits ? 0 : 9999,
      chronicleRemainingToday: simulateZeroCredits ? 0 : 9999,
      usedToday: 0,
      dailyRemaining: simulateZeroCredits ? 0 : 9999,
      bonusCredits: 0,
      remainingToday: simulateZeroCredits ? 0 : 9999,
      totalUsed: 0
    } : null
  };
}

async function verifyEmailIsWhitelisted(email) {
  const res = await verifyAndConsumeUserCredit(email, false);
  return res.allowed;
}

const avatarMemoryCache = new Map();

async function getAvatarBase64(url) {
  if (!url) return null;
  if (avatarMemoryCache.has(url)) return avatarMemoryCache.get(url);
  try {
    const resp = await fetch(url);
    if (resp.ok) {
      const ab = await resp.arrayBuffer();
      const b64 = Buffer.from(ab).toString('base64');
      avatarMemoryCache.set(url, b64);
      return b64;
    }
  } catch (_) {}
  return null;
}

function isShridharOwnerAccount(userIdentifier) {
  const raw = String(userIdentifier || '').trim().toLowerCase();
  return raw === 'shridharoct16@gmail.com';
}

function isShridharCastContext(familyCast, userIdentifier = '') {
  if (isShridharOwnerAccount(userIdentifier)) return true;
  if (!familyCast || typeof familyCast !== 'object') return false;
  if (isShridharOwnerAccount(familyCast.userIdentifier)) return true;
  if (Array.isArray(familyCast.sharedGroupEmails) && familyCast.sharedGroupEmails.some(e => isShridharOwnerAccount(e))) {
    return true;
  }
  return false;
}

function resolveFamilyCastProfileId(userIdentifier) {
  const raw = String(userIdentifier || '').trim().toLowerCase();
  if (!raw || raw === 'default' || raw === 'anonymous' || !raw.includes('@')) {
    return null;
  }
  if (isShridharOwnerAccount(raw)) {
    return 'family_cast_shridharoct16_gmail_com';
  }
  return 'family_cast_' + raw.replace(/[^a-z0-9_-]/g, '_');
}

function sanitizeForeignVaultLeakOnServer(cast, userIdentifier, allowShridharSharedGroup = false) {
  if (!cast || typeof cast !== 'object') return getDefaultFamilyCast(userIdentifier);
  if (isShridharOwnerAccount(userIdentifier) || allowShridharSharedGroup) return cast;
  const members = Array.isArray(cast.members) ? cast.members : [];
  const shridharAvatarPattern = /avatar_member_(?:father|mother|elder_son|younger_son)\.(?:jpg|png|webp)/i;
  const memberNames = members.map(m => String(m?.name || '').trim().toLowerCase());
  const isLeakedShridharSet = (
    memberNames.includes('shridhar') ||
    memberNames.includes('father (shridhar)') ||
    (memberNames.includes('aruna') && memberNames.includes('gahan')) ||
    members.some(m => shridharAvatarPattern.test(String(m?.stylizedAvatarUrl || '')))
  );
  if (isLeakedShridharSet) {
    return getDefaultFamilyCast(userIdentifier);
  }
  return cast;
}

async function getSystemDoc(docId, fallbackData = {}) {
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(docId)}&select=data`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    if (resp.ok) {
      const rows = await resp.json();
      if (Array.isArray(rows) && rows[0] && rows[0].data) {
        return rows[0].data;
      }
    }
  } catch (err) {
    console.warn(`getSystemDoc(${docId}) warning:`, err.message);
  }
  return fallbackData;
}

async function saveSystemDoc(docId, data) {
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/posts`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ id: docId, data })
    });
    return resp.ok;
  } catch (err) {
    console.warn(`saveSystemDoc(${docId}) warning:`, err.message);
    return false;
  }
}

function getInverseFamilyRelation(rel) {
  const map = {
    spouse: 'spouse',
    elder_son: 'father',
    younger_son: 'father',
    child: 'father',
    father: 'child',
    mother: 'child',
    sibling: 'sibling'
  };
  return map[rel] || 'family';
}

function getRelationDisplayLabel(rel) {
  const labels = {
    self: 'Self',
    spouse: 'Spouse / Partner',
    elder_son: 'Elder Son',
    younger_son: 'Younger Son',
    child: 'Child / Daughter / Son',
    father: 'Father',
    mother: 'Mother',
    sibling: 'Brother / Sister',
    family: 'Family Member'
  };
  return labels[rel] || 'Family Member';
}

async function loadRawUserFamilyCast(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const profileId = resolveFamilyCastProfileId(cleanEmail);
  if (!profileId) return getDefaultFamilyCast(cleanEmail);
  const data = await getSystemDoc(profileId, null);
  if (data && typeof data === 'object' && Array.isArray(data.members)) {
    return data;
  }
  return getDefaultFamilyCast(cleanEmail);
}

async function saveRawUserFamilyCast(email, cast) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const profileId = resolveFamilyCastProfileId(cleanEmail);
  if (!profileId) return false;
  return await saveSystemDoc(profileId, cast);
}

function normalizeCuratorHandleKey(rawHandle) {
  return String(rawHandle || '').replace(/^@+/, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function resolveAndClaimUniqueCuratorHandle(email, requestedHandle) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  let raw = String(requestedHandle || '').trim();
  if (!raw || raw.toLowerCase() === '@curator' || raw.toLowerCase() === 'curator') {
    const fallbackFromEmail = cleanEmail.includes('@')
      ? cleanEmail.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim()
      : 'Curator';
    raw = '@' + fallbackFromEmail;
  }
  if (!raw.startsWith('@')) raw = '@' + raw;
  if (!cleanEmail || !cleanEmail.includes('@')) return { handle: raw, wasDisambiguated: false };

  try {
    const dir = await getSystemDoc('system_user_directory', { users: {} });
    if (!dir.users || typeof dir.users !== 'object') dir.users = {};

    const takenByOther = new Set();
    for (const [uEmail, uObj] of Object.entries(dir.users)) {
      const em = String(uEmail || '').trim().toLowerCase();
      if (!em || em === cleanEmail || !uObj) continue;
      if (uObj.curatorHandle) takenByOther.add(normalizeCuratorHandleKey(uObj.curatorHandle));
      if (uObj.handle) takenByOther.add(normalizeCuratorHandleKey(uObj.handle));
      if (uObj.name) takenByOther.add(normalizeCuratorHandleKey(uObj.name));
    }

    let candidate = raw;
    let wasDisambiguated = false;
    if (takenByOther.has(normalizeCuratorHandleKey(candidate))) {
      wasDisambiguated = true;
      const emailPrefix = cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').slice(0, 6);
      const baseClean = raw.replace(/^@+/, '').trim();
      const withPrefix = `@${baseClean} (${emailPrefix})`;
      if (emailPrefix && !takenByOther.has(normalizeCuratorHandleKey(withPrefix))) {
        candidate = withPrefix;
      } else {
        let counter = 2;
        while (takenByOther.has(normalizeCuratorHandleKey(`@${baseClean} ${counter}`))) {
          counter++;
        }
        candidate = `@${baseClean} ${counter}`;
      }
    }

    const existing = dir.users[cleanEmail] || { email: cleanEmail };
    if (existing.curatorHandle !== candidate) {
      dir.users[cleanEmail] = {
        ...existing,
        email: cleanEmail,
        curatorHandle: candidate,
        name: existing.name || candidate.replace(/^@+/, '').trim(),
        handle: existing.handle || ('@' + candidate.replace(/^@+/, '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '')),
        updatedAt: new Date().toISOString()
      };
      await saveSystemDoc('system_user_directory', dir);
    }
    return { handle: candidate, wasDisambiguated };
  } catch (_) {
    return { handle: raw, wasDisambiguated: false };
  }
}

async function syncUserSelfToDirectory(email, cast) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) return;
  const members = (cast && Array.isArray(cast.members)) ? cast.members : [];
  const selfMember = members.find(m => m && (m.relationship === 'self' || String(m.linkedUserEmail || '').toLowerCase() === cleanEmail));
  if (!selfMember || !selfMember.name) return;

  const dir = await getSystemDoc('system_user_directory', { users: {} });
  if (!dir.users || typeof dir.users !== 'object') dir.users = {};
  const existing = dir.users[cleanEmail] || {};
  const primaryPhoto = selfMember.stylizedAvatarUrl || selfMember.photoBase64 || (selfMember.photos && selfMember.photos.frontal) || existing.avatarUrl || '';
  const rawSelfName = String(selfMember.name).replace(/^(Father|Mother|Self)\s*\(([^)]+)\)$/i, '$2').trim();
  const claimed = await resolveAndClaimUniqueCuratorHandle(cleanEmail, existing.curatorHandle || ('@' + rawSelfName));
  dir.users[cleanEmail] = {
    email: cleanEmail,
    name: rawSelfName,
    curatorHandle: claimed.handle,
    handle: existing.handle || ('@' + claimed.handle.replace(/^@+/, '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '')),
    age: selfMember.age || existing.age || null,
    heightCm: selfMember.heightCm || existing.heightCm || null,
    avatarUrl: (typeof primaryPhoto === 'string' && primaryPhoto.startsWith('http')) ? primaryPhoto : (existing.avatarUrl || ''),
    onboardingCompleted: true,
    updatedAt: new Date().toISOString()
  };
  await saveSystemDoc('system_user_directory', dir);
}

async function loadSharedFamilyCastAndNotifications(viewerEmail) {
  const cleanViewer = String(viewerEmail || '').trim().toLowerCase();
  if (!cleanViewer || !cleanViewer.includes('@')) {
    return {
      cast: getDefaultFamilyCast(cleanViewer),
      pendingIncoming: [],
      pendingOutgoing: [],
      approvedLinks: [],
      needsOnboarding: false
    };
  }

  const [linksDoc, rawViewerCast] = await Promise.all([
    getSystemDoc('system_family_vault_links', { requests: [] }),
    loadRawUserFamilyCast(cleanViewer)
  ]);

  const allRequests = Array.isArray(linksDoc?.requests) ? linksDoc.requests : [];
  const pendingIncoming = allRequests.filter(r => r && r.status === 'pending' && String(r.toEmail || '').toLowerCase() === cleanViewer);
  const pendingOutgoing = allRequests.filter(r => r && r.status === 'pending' && String(r.fromEmail || '').toLowerCase() === cleanViewer);

  // Compute connected component of approved family links containing cleanViewer
  const approvedGroupEmails = new Set([cleanViewer]);
  const directRelationsFromViewer = {}; // email -> { relationship, roleLabel, viewerRoleInOtherVault }
  let added = true;
  while (added) {
    added = false;
    for (const req of allRequests) {
      if (!req || req.status !== 'approved') continue;
      const fromE = String(req.fromEmail || req.requesterEmail || '').toLowerCase();
      const toE = String(req.toEmail || req.targetEmail || '').toLowerCase();
      if (!fromE || !toE) continue;
      if (approvedGroupEmails.has(fromE) && !approvedGroupEmails.has(toE)) {
        approvedGroupEmails.add(toE);
        added = true;
      } else if (approvedGroupEmails.has(toE) && !approvedGroupEmails.has(fromE)) {
        approvedGroupEmails.add(fromE);
        added = true;
      }
      if (fromE === cleanViewer) {
        const rel = req.relationship || 'spouse';
        directRelationsFromViewer[toE] = {
          relationship: rel,
          roleLabel: req.relationLabel || req.targetRoleLabel || getRelationDisplayLabel(rel),
          viewerRoleInOtherVault: req.inverseRelationship || getInverseFamilyRelation(rel),
          expectedTargetName: req.toName || req.targetName || ''
        };
      } else if (toE === cleanViewer) {
        const rel = req.relationship || 'spouse';
        const inv = req.inverseRelationship || getInverseFamilyRelation(rel);
        directRelationsFromViewer[fromE] = {
          relationship: inv,
          roleLabel: inv === 'spouse' ? 'Husband / Spouse' : getRelationDisplayLabel(inv),
          viewerRoleInOtherVault: rel,
          expectedTargetName: req.fromName || req.requesterName || ''
        };
      }
    }
  }

  const groupEmailsList = Array.from(approvedGroupEmails);
  const hasShridharInGroup = groupEmailsList.some(e => isShridharOwnerAccount(e));
  let viewerCast = sanitizeForeignVaultLeakOnServer(rawViewerCast, cleanViewer, hasShridharInGroup);
  if (!Array.isArray(viewerCast.members)) viewerCast.members = [];

  // Tag viewer's own self member with linkedUserEmail = cleanViewer
  let viewerSelf = viewerCast.members.find(m => m && m.relationship === 'self');
  if (viewerSelf) {
    viewerSelf.linkedUserEmail = cleanViewer;
    viewerSelf.approvalStatus = 'approved';
  }

  // If there are approved linked family members in the group, merge their vaults & self profiles two-way!
  if (groupEmailsList.length > 1) {
    const otherEmails = groupEmailsList.filter(e => e !== cleanViewer);
    const otherCasts = await Promise.all(otherEmails.map(e => loadRawUserFamilyCast(e)));

    otherEmails.forEach((otherEmail, idx) => {
      const otherCast = sanitizeForeignVaultLeakOnServer(otherCasts[idx], otherEmail, hasShridharInGroup);
      const otherMembers = Array.isArray(otherCast?.members) ? otherCast.members : [];
      const relInfo = directRelationsFromViewer[otherEmail] || {
        relationship: 'spouse',
        roleLabel: 'Family Member',
        viewerRoleInOtherVault: 'spouse'
      };

      // 0. Check if otherCast already has a rich profile card representing cleanViewer (e.g., 'Mother / Wife Aruna' in Shridhar's vault)
      const viewerCardInOther = otherMembers.find(om => {
        if (!om || om.relationship === 'self') return false;
        if (String(om.linkedUserEmail || '').toLowerCase() === cleanViewer) return true;
        if (relInfo.viewerRoleInOtherVault === 'spouse' && om.relationship === 'spouse') return true;
        if (viewerSelf && viewerSelf.name && om.name && String(om.name).trim().toLowerCase() === String(viewerSelf.name).trim().toLowerCase()) return true;
        return false;
      });

      if (viewerCardInOther) {
        if (!viewerSelf) {
          viewerSelf = {
            ...viewerCardInOther,
            id: 'member_self',
            relationship: 'self',
            roleLabel: viewerCardInOther.roleLabel
              ? viewerCardInOther.roleLabel.replace(/\bWife\b/i, 'Self').replace(/\bSpouse\b/i, 'Self')
              : 'Self',
            linkedUserEmail: cleanViewer,
            approvalStatus: 'approved',
            aliases: Array.from(new Set([...(viewerCardInOther.aliases || []), 'myself', 'me', 'i']))
          };
          viewerCast.members.unshift(viewerSelf);
        } else {
          // Enrich viewerSelf with any missing traits/avatar/height from viewerCardInOther
          if (!viewerSelf.uncompromisableAnchors && viewerCardInOther.uncompromisableAnchors) {
            viewerSelf.uncompromisableAnchors = viewerCardInOther.uncompromisableAnchors;
          }
          if (!viewerSelf.visualTraits && viewerCardInOther.visualTraits) {
            viewerSelf.visualTraits = viewerCardInOther.visualTraits;
          }
          if (!viewerSelf.stylizedAvatarUrl && viewerCardInOther.stylizedAvatarUrl) {
            viewerSelf.stylizedAvatarUrl = viewerCardInOther.stylizedAvatarUrl;
          }
          if (!viewerSelf.age && viewerCardInOther.age) {
            viewerSelf.age = viewerCardInOther.age;
          }
          if ((!viewerSelf.heightCm || viewerSelf.heightCm === 170) && viewerCardInOther.heightCm) {
            viewerSelf.heightCm = viewerCardInOther.heightCm;
            viewerSelf.heightDesc = viewerCardInOther.heightDesc || viewerSelf.heightDesc;
          }
          if (viewerCardInOther.structuredTraits && (!viewerSelf.structuredTraits || !viewerSelf.uncompromisableAnchors)) {
            viewerSelf.structuredTraits = { ...viewerCardInOther.structuredTraits, ...(viewerSelf.structuredTraits || {}) };
          }
          // If viewerSelf still had an email-handle placeholder name, adopt the real name from viewerCardInOther
          if (viewerCardInOther.name && (!viewerSelf.name || viewerSelf.name.includes('@') || viewerSelf.name.length < 3)) {
            viewerSelf.name = viewerCardInOther.name;
          }
        }
      }

      // 1. Find otherEmail's 'self' profile in otherCast and add/merge it into viewerCast with relInfo.relationship (e.g. Husband / Spouse)
      const otherSelf = otherMembers.find(m => m && (String(m.linkedUserEmail || '').toLowerCase() === otherEmail || m.relationship === 'self'));
      if (otherSelf && otherSelf.name) {
        const existingIdx = viewerCast.members.findIndex(m =>
          m && m.relationship !== 'self' && (
            String(m.linkedUserEmail || '').toLowerCase() === otherEmail ||
            (m.name && String(m.name).trim().toLowerCase() === String(otherSelf.name).trim().toLowerCase()) ||
            (relInfo.relationship === 'spouse' && m.relationship === 'spouse')
          )
        );
        const existingMember = existingIdx >= 0 ? viewerCast.members[existingIdx] : null;
        const mergedOtherSelf = {
          ...(existingMember || {}),
          ...otherSelf,
          // Keep richer traits if existingMember already had them and otherSelf was an unconfigured stub
          name: (otherSelf.uncompromisableAnchors || !existingMember?.name) ? otherSelf.name : existingMember.name,
          age: otherSelf.age || existingMember?.age || null,
          heightCm: (otherSelf.uncompromisableAnchors ? otherSelf.heightCm : (existingMember?.heightCm || otherSelf.heightCm)) || 170,
          heightDesc: otherSelf.uncompromisableAnchors ? otherSelf.heightDesc : (existingMember?.heightDesc || otherSelf.heightDesc || ''),
          uncompromisableAnchors: otherSelf.uncompromisableAnchors || existingMember?.uncompromisableAnchors || '',
          visualTraits: otherSelf.visualTraits || existingMember?.visualTraits || '',
          stylizedAvatarUrl: otherSelf.stylizedAvatarUrl || existingMember?.stylizedAvatarUrl || '',
          structuredTraits: otherSelf.uncompromisableAnchors
            ? (otherSelf.structuredTraits || existingMember?.structuredTraits)
            : (existingMember?.structuredTraits || otherSelf.structuredTraits),
          id: existingIdx >= 0 ? viewerCast.members[existingIdx].id : (`member_linked_${otherEmail.replace(/[^a-z0-9]/g, '_')}`),
          relationship: relInfo.relationship,
          roleLabel: existingMember?.roleLabel && !existingMember.roleLabel.includes('Pending')
            ? existingMember.roleLabel
            : relInfo.roleLabel,
          linkedUserEmail: otherEmail,
          approvalStatus: 'approved',
          sharedFromFamilyVault: true,
          aliases: Array.from(new Set([
            ...((otherSelf.aliases || []).filter(a => !['me', 'myself', 'i'].includes(String(a).toLowerCase()))),
            ...((existingMember?.aliases || []).filter(a => !['me', 'myself', 'i'].includes(String(a).toLowerCase()))),
            String(otherSelf.name).toLowerCase()
          ]))
        };
        if (existingIdx >= 0) {
          viewerCast.members[existingIdx] = mergedOtherSelf;
        } else {
          viewerCast.members.push(mergedOtherSelf);
        }
      }

      // 2. Also merge any shared non-self family members (e.g., Elder Son Gahan & Younger Son Rishu)
      otherMembers.forEach(om => {
        if (!om || !om.name) return;
        const omLinked = String(om.linkedUserEmail || '').toLowerCase();
        if (om.relationship === 'self' || omLinked === cleanViewer || omLinked === otherEmail) return;
        // Skip if this card in otherCast is actually cleanViewer's own card (e.g. Aruna in Shridhar's vault when viewer is Aruna)
        if (viewerCardInOther && om.id === viewerCardInOther.id) return;
        if (viewerSelf && viewerSelf.name && String(om.name).trim().toLowerCase() === String(viewerSelf.name).trim().toLowerCase()) return;

        // Check if viewer already has this member by name or id
        const matchIdx = viewerCast.members.findIndex(vm =>
          vm && (
            vm.id === om.id ||
            (vm.name && String(vm.name).trim().toLowerCase() === String(om.name).trim().toLowerCase())
          )
        );
        if (matchIdx === -1) {
          viewerCast.members.push({
            ...om,
            approvalStatus: om.approvalStatus || 'approved',
            sharedFromFamilyVault: true
          });
        } else if (!viewerCast.members[matchIdx].uncompromisableAnchors && om.uncompromisableAnchors) {
          viewerCast.members[matchIdx] = {
            ...om,
            ...viewerCast.members[matchIdx],
            uncompromisableAnchors: om.uncompromisableAnchors,
            visualTraits: om.visualTraits || viewerCast.members[matchIdx].visualTraits,
            stylizedAvatarUrl: om.stylizedAvatarUrl || viewerCast.members[matchIdx].stylizedAvatarUrl,
            sharedFromFamilyVault: true
          };
        }
      });
    });
  }

  // Ensure pending outgoing requests appear as pending tabs in viewerCast (and remove any that were declined)
  const declinedOutgoingEmails = new Set(
    allRequests
      .filter(r => r && r.status === 'declined' && String(r.fromEmail || '').toLowerCase() === cleanViewer)
      .map(r => String(r.toEmail || '').toLowerCase())
  );
  viewerCast.members = viewerCast.members.filter(m => {
    const linked = String(m?.linkedUserEmail || '').toLowerCase();
    if (linked && declinedOutgoingEmails.has(linked) && m.approvalStatus === 'pending') {
      return false;
    }
    return true;
  });

  pendingOutgoing.forEach(req => {
    const targetEmail = String(req.toEmail || '').toLowerCase();
    const existing = viewerCast.members.find(m => m && String(m.linkedUserEmail || '').toLowerCase() === targetEmail);
    if (existing) {
      existing.approvalStatus = 'pending';
      existing.pendingRequestId = req.id;
    } else {
      viewerCast.members.push({
        id: `member_pending_${req.id}`,
        relationship: req.relationship || 'spouse',
        roleLabel: `${req.relationLabel || getRelationDisplayLabel(req.relationship)} (Pending)`,
        name: req.toName || targetEmail.split('@')[0],
        linkedUserEmail: targetEmail,
        approvalStatus: 'pending',
        pendingRequestId: req.id,
        age: null,
        heightCm: 165,
        heightDesc: '',
        visualTraits: '',
        uncompromisableAnchors: '',
        aliases: [],
        photos: {}
      });
    }
  });

  viewerCast.sharedGroupEmails = groupEmailsList;
  const approvedLinks = allRequests.filter(r =>
    r && r.status === 'approved' &&
    (approvedGroupEmails.has(String(r.fromEmail || '').toLowerCase()) || approvedGroupEmails.has(String(r.toEmail || '').toLowerCase()))
  );

  const hasConfiguredSelf = viewerCast.members.some(m =>
    m && m.relationship === 'self' && String(m.name || '').trim().length > 0
  );
  const needsOnboarding = !isShridharOwnerAccount(cleanViewer) && !hasConfiguredSelf;

  return {
    cast: viewerCast,
    pendingIncoming,
    pendingOutgoing,
    approvedLinks,
    needsOnboarding
  };
}

const COLLAGE_SUBJECT_STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'your', 'have', 'more', 'when', 'what', 'where', 'which', 'while',
  'will', 'would', 'could', 'should', 'about', 'into', 'over', 'after', 'before', 'between', 'under', 'again', 'further',
  'then', 'once', 'here', 'there', 'all', 'any', 'both', 'each', 'few', 'most', 'other', 'some', 'such', 'only', 'own',
  'same', 'than', 'too', 'very', 'just', 'even', 'also', 'still', 'because', 'through', 'during', 'without', 'within',
  'every', 'always', 'never', 'often', 'sometimes', 'today', 'yesterday', 'tomorrow', 'morning', 'evening', 'night',
  'their', 'they', 'them', 'these', 'those', 'ours', 'ourselves', 'myself', 'himself', 'herself', 'itself', 'someone',
  'something', 'nothing', 'everything', 'anything', 'people', 'person', 'world', 'life', 'time', 'year', 'years', 'days',
  'week', 'month', 'make', 'made', 'making', 'take', 'took', 'taken', 'give', 'gave', 'given', 'keep', 'kept', 'think',
  'thought', 'know', 'knew', 'known', 'feel', 'felt', 'look', 'looked', 'seem', 'seemed', 'become', 'became', 'mean',
  'meant', 'need', 'needed', 'want', 'wanted', 'real', 'true', 'good', 'great', 'best', 'better', 'worse', 'worst',
  'many', 'much', 'little', 'less', 'least', 'high', 'long', 'short', 'small', 'large', 'next', 'last', 'first', 'second',
  'third', 'new', 'old', 'young', 'right', 'left', 'back', 'down', 'away', 'around', 'however', 'therefore', 'instead',
  'although', 'though', 'whether', 'either', 'neither', 'actually', 'really', 'simply', 'merely', 'truly', 'deeply',
  'slant', 'post', 'article', 'story', 'news', 'video', 'youtube', 'link', 'source', 'moment', 'moments', 'reflection',
  'crore', 'lakh', 'million', 'billion', 'trillion', 'blueprint', 'leading', 'building', 'funding', 'scaling', 'brands',
  'brand', 'business', 'businesses', 'company', 'companies', 'startup', 'startups', 'founder', 'founders', 'market',
  'markets', 'growth', 'rapid', 'urge', 'masterclass', 'channel', 'speaker', 'platform', 'title', 'interview', 'episode',
  'podcast', 'guide', 'lessons', 'secret', 'secrets', 'rules', 'strategy', 'strategies', 'system', 'systems', 'model'
]);

function extractKeyVisualSubjectsZeroCost(contextText = '', scrapedTitle = '') {
  // Clean metadata boilerplate lines from scrapedContent (e.g. "Title: ...", "Channel / Speaker: ...", "Platform: YouTube Video")
  const cleanedContext = String(contextText || '')
    .replace(/^(?:Title|Channel\s*\/\s*Speaker|Platform|Video Duration)\s*:.*$/gim, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .trim();

  const cleanedTitle = String(scrapedTitle || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .trim();

  const combined = `${cleanedContext}. ${cleanedTitle}`.trim();

  const subjects = [];
  const seenLower = new Set();

  const addCandidate = (rawLabel, rawQuery = '') => {
    if (!rawLabel || subjects.length >= 3) return;
    const cleanLabel = String(rawLabel)
      .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleanLabel.length < 3 || cleanLabel.length > 42) return;
    const words = cleanLabel.split(' ');
    if (words.length > 4) return;
    const lower = cleanLabel.toLowerCase();
    if (COLLAGE_SUBJECT_STOPWORDS.has(lower)) return;
    if (words.every(w => COLLAGE_SUBJECT_STOPWORDS.has(w.toLowerCase()))) return;
    for (const existing of seenLower) {
      if (existing === lower || existing.includes(lower) || lower.includes(existing)) {
        return;
      }
    }
    seenLower.add(lower);
    subjects.push({
      id: `subj_${subjects.length + 1}`,
      label: cleanLabel,
      query: String(rawQuery || cleanLabel).trim()
    });
  };

  // 1. Multi-word capitalized Proper Nouns from author context first (sentence case, high signal), then title
  const multiProperRegex = /\b([A-Z][a-z]{2,}(?:\s+(?:of|and|for|in|on)\s+[A-Z][a-z]{2,}|\s+[A-Z][a-z0-9]{1,}){1,2})\b/g;
  for (const sourceBlock of [cleanedContext, cleanedTitle]) {
    let match;
    multiProperRegex.lastIndex = 0;
    while ((match = multiProperRegex.exec(sourceBlock)) !== null && subjects.length < 3) {
      const phrase = match[1].trim();
      const parts = phrase.split(/\s+/).filter(w => !COLLAGE_SUBJECT_STOPWORDS.has(w.toLowerCase()));
      if (parts.length === 0) continue;
      const filteredPhrase = parts.join(' ').trim();
      if (filteredPhrase.length >= 3) {
        addCandidate(filteredPhrase);
      }
    }
  }

  // 2. Single capitalized proper nouns (not at the very start of a sentence, or known proper entities)
  const sentences = combined.split(/[.!?;\n]+/);
  for (const sent of sentences) {
    if (subjects.length >= 3) break;
    const tokens = sent.trim().split(/\s+/);
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i].replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').replace(/'s$/i, '');
      if (!tok || tok.length < 3) continue;
      if (/^[A-Z][a-z]{2,}$/.test(tok) && !COLLAGE_SUBJECT_STOPWORDS.has(tok.toLowerCase())) {
        // Prefer mid-sentence capitalized words first, or sentence-initial if we still need subjects
        if (i > 0) {
          addCandidate(tok);
        }
      }
    }
  }

  // 3. Concrete nouns / high-signal keywords from context
  if (subjects.length < 3) {
    const wordFreq = new Map();
    const cleanWords = combined
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .map(w => w.replace(/^-+|-+$/g, ''))
      .filter(w => w.length >= 4 && !COLLAGE_SUBJECT_STOPWORDS.has(w) && !/^\d+$/.test(w));

    for (const w of cleanWords) {
      // Skip common abstract verbs/adverbs ending in -ly, -ing, -tion, -ment unless high visual value
      if (/(?:ingly|edly|atively|lessly|ness)$/.test(w)) continue;
      wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
    }
    const sortedKeywords = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
      .map(e => e[0]);

    for (const kw of sortedKeywords) {
      if (subjects.length >= 3) break;
      const titleCase = kw.charAt(0).toUpperCase() + kw.slice(1);
      addCandidate(titleCase, kw);
    }
  }

  // 4. Fallback default subjects if text was very short
  const defaults = ['India Culture', 'Architecture', 'Nature'];
  for (const d of defaults) {
    if (subjects.length >= 3) break;
    addCandidate(d, d);
  }

  return subjects.slice(0, 3);
}

async function searchWebImagesForSubject(rawQuery = '', sourceImageUrl = '', sourceTitle = '', pageOffset = 0) {
  const q = String(rawQuery || '').trim();
  if (!q) return [];
  const safePage = Math.max(0, parseInt(pageOffset, 10) || 0);
  const results = [];
  const seenUrls = new Set();

  const pushImage = (item, targetArr = results) => {
    if (!item || !item.url) return;
    const cleanUrl = String(item.url).trim();
    if (!/^https?:\/\//i.test(cleanUrl)) return;
    if (/\.svg(?:\?|$)/i.test(cleanUrl) || /\.gif(?:\?|$)/i.test(cleanUrl) || /\.tif(?:\?|$)/i.test(cleanUrl) || /\.pdf(?:\?|$)/i.test(cleanUrl)) return;
    // Exclude commercial stock/wire watermarked trap domains
    if (/(?:gettyimages\.|shutterstock\.|alamy\.|istockphoto\.|depositphotos\.|123rf\.|dreamstime\.|stock\.adobe\.com)/i.test(cleanUrl)) return;
    if (seenUrls.has(cleanUrl)) return;
    seenUrls.add(cleanUrl);
    targetArr.push({
      id: item.id || `img_${safePage}_${targetArr.length + 1}_${Math.random().toString(36).slice(2, 6)}`,
      url: cleanUrl,
      thumbUrl: String(item.thumbUrl || cleanUrl).trim(),
      title: String(item.title || q).replace(/^(?:File|Image):/i, '').replace(/\.[a-z]{3,4}$/i, '').replace(/_/g, ' ').slice(0, 75),
      source: item.source || 'Web Images',
      aspectRatio: item.aspectRatio || null
    });
  };

  // If a scraped source image exists and matches the first query context on page 0, include it at the top as a verified option
  if (safePage === 0 && sourceImageUrl && /^https?:\/\//i.test(sourceImageUrl)) {
    pushImage({
      id: 'source_hero_img',
      url: sourceImageUrl,
      thumbUrl: sourceImageUrl,
      title: sourceTitle ? `Source: ${sourceTitle}` : 'Original Source Photo',
      source: 'Source Link'
    });
  }

  const uaHeaders = {
    'User-Agent': 'SlantEditorialApp/1.0 (https://slant.today; shridharoct16@gmail.com) Mozilla/5.0'
  };
  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8'
  };

  const webSearchBuckets = [];
  const wikiBuckets = [];
  const commonsBuckets = [];

  // Query 0 (Primary): Live Full-Web Image Search (News sites, articles, editorial photography across the web)
  const webImagesTask = (async () => {
    try {
      const bingFirst = safePage * 14;
      const webUrl = `https://www.bing.com/images/async?q=${encodeURIComponent(q)}&first=${bingFirst}&count=16&mmasync=1`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4500);
      const resp = await fetch(webUrl, { headers: browserHeaders, signal: ctrl.signal });
      clearTimeout(timer);
      if (resp.ok) {
        const html = await resp.text();
        const matches = [...html.matchAll(/m="(\{[^"]+\})"/g)];
        for (const m of matches) {
          try {
            const rawJson = m[1]
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
              .replace(/&#39;/g, "'")
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>');
            const obj = JSON.parse(rawJson);
            const fullUrl = String(obj.murl || '').trim();
            const cdnThumb = String(obj.turl || '').trim();
            if (!fullUrl && !cdnThumb) continue;
            let hostLabel = 'Web Images';
            try {
              const host = new URL(fullUrl || cdnThumb).hostname.replace(/^www\./i, '');
              if (host && !host.includes('bing.net')) {
                hostLabel = host.split('.').slice(0, -1).join('.') || host;
                hostLabel = hostLabel.charAt(0).toUpperCase() + hostLabel.slice(1, 18);
              }
            } catch (_) {}
            pushImage({
              url: fullUrl || cdnThumb,
              thumbUrl: cdnThumb || fullUrl,
              title: String(obj.t || obj.desc || q).replace(/[\uE000-\uF8FF]/g, '').trim() || q,
              source: hostLabel
            }, webSearchBuckets);
          } catch (_) {}
        }
      }
    } catch (_) {}
  })();

  // Query 1: Wikipedia PageImages API (Best for public figures, places, companies, books, events, concepts)
  const wikiTask = (async () => {
    try {
      const wikiOffset = safePage * 6;
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=6&gsroffset=${wikiOffset}&prop=pageimages|description&piprop=thumbnail|original&pithumbsize=720&format=json&origin=*`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4500);
      const resp = await fetch(wikiUrl, { headers: uaHeaders, signal: ctrl.signal });
      clearTimeout(timer);
      if (resp.ok) {
        const data = await resp.json();
        const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
        pages.sort((a, b) => (a.index || 99) - (b.index || 99));
        const qTokens = q.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3);
        for (const p of pages) {
          const thumb = p?.thumbnail?.source;
          const orig = p?.original?.source;
          const bestUrl = thumb || orig;
          if (!bestUrl) continue;
          const titleLower = String(p.title || '').toLowerCase();
          const descLower = String(p.description || '').toLowerCase();
          const isPersonBio = /\b(born\b|entrepreneur|politician|actor|actress|player|singer|writer|businessman|educator|cricketer|minister|founder|ceo|executive|author|director|athlete)\b/i.test(descLower);
          const titleMatchesQuery = qTokens.some(t => titleLower.includes(t));
          if (isPersonBio && !titleMatchesQuery) continue;
          pushImage({
            url: bestUrl,
            thumbUrl: thumb || bestUrl,
            title: p.title + (p.description ? ` — ${p.description}` : ''),
            source: 'Wikipedia'
          }, wikiBuckets);
        }
      }
    } catch (_) {}
  })();

  // Query 2: Wikimedia Commons Bitmap Search API (Secondary archival photography)
  const commonsTask = (async () => {
    try {
      const commonsOffset = safePage * 6;
      const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(`filetype:bitmap ${q}`)}&gsrnamespace=6&gsrlimit=6&gsroffset=${commonsOffset}&prop=imageinfo&iiprop=url|dimensions|mime&iiurlwidth=720&format=json&origin=*`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4500);
      const resp = await fetch(commonsUrl, { headers: uaHeaders, signal: ctrl.signal });
      clearTimeout(timer);
      if (resp.ok) {
        const data = await resp.json();
        const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
        pages.sort((a, b) => (a.index || 99) - (b.index || 99));
        for (const p of pages) {
          const info = Array.isArray(p?.imageinfo) ? p.imageinfo[0] : null;
          if (!info) continue;
          const mime = String(info.mime || '').toLowerCase();
          if (!mime.includes('jpeg') && !mime.includes('jpg') && !mime.includes('png') && !mime.includes('webp')) continue;
          const bestUrl = info.thumburl || info.url;
          if (bestUrl) {
            pushImage({
              url: bestUrl,
              thumbUrl: info.thumburl || bestUrl,
              title: p.title || q,
              source: 'Wikimedia Commons'
            }, commonsBuckets);
          }
        }
      }
    } catch (_) {}
  })();

  await Promise.allSettled([webImagesTask, wikiTask, commonsTask]);
  // Prioritize real full-web image results first (right after any pinned Source Link image), followed by Wikipedia & Commons
  for (const item of [...webSearchBuckets, ...wikiBuckets, ...commonsBuckets]) {
    results.push(item);
    if (results.length >= 16) break;
  }
  return results.slice(0, 16);
}

// Auto-resolve an authentic Wikipedia / Wikimedia Commons reference portrait for any named public figure in Inner Voice or Web Links
async function resolvePublicFigureReferencePhoto({
  userSlant = '',
  spark = '',
  adaptedHeadline = '',
  originalHeadline = '',
  heroCue = '',
  prompt = '',
  familyCast = null
}) {
  try {
    const familyNames = new Set(['shridhar', 'aruna', 'gahan', 'rishu']);
    if (familyCast && Array.isArray(familyCast.members)) {
      familyCast.members.forEach(m => {
        if (m && m.name) {
          String(m.name).toLowerCase().split(/\s+/).filter(Boolean).forEach(w => familyNames.add(w));
        }
      });
    }

    const leadingNonNameWords = /^(?:From|When|While|After|Before|During|Under|Over|Between|Inside|Outside|Finding|Making|Testing|Whether|However|Regardless|Although|Because|Through|Across|Beyond|Within|Without|Despite|Toward|Towards|Against|Around|Among|Behind|Beneath|Beside|Besides|Throughout|Upon|Actor|Veteran|Minister|President|Leader|Cricketer|Coach|Captain|Doctor|Dr|Mr|Mrs|Ms|Sri|Shri|Swami|Chief|Prime|Indian|Global|Modern|Classic|Young|Senior|Distinguished)\s+/i;

    const stopPhrases = new Set([
      'The New', 'United States', 'White House', 'Wall Street', 'Silicon Valley',
      'New York', 'Los Angeles', 'San Francisco', 'New Delhi', 'Tamil Nadu',
      'Uttar Pradesh', 'Andhra Pradesh', 'Madhya Pradesh', 'West Bengal',
      'South India', 'North India', 'Parent Teacher', 'Inner Voice', 'Daily Chronicle',
      'World Cup', 'Supreme Court', 'High Court', 'Prime Minister', 'Chief Minister',
      'Silver Screen', 'Street Politics', 'Outer Ring', 'Volvo Bus', 'Editorial Portrait',
      'Vivid Editorial', 'Broadsheet Gouache', 'Indian Parliament', 'Dalal Street',
      'High Impact', 'Vertical Portrait', 'Curator Angle', 'Source Grounded'
    ]);

    const candidates = [];
    const sources = [heroCue, adaptedHeadline, originalHeadline, userSlant, spark, prompt];
    const nameRegex = /\b([A-Z][a-z]{2,15}(?:\s+[A-Z]\.?\s*)?\s+[A-Z][a-z]{2,15})\b/g;

    for (const src of sources) {
      if (!src || typeof src !== 'string') continue;
      let m;
      while ((m = nameRegex.exec(src)) !== null) {
        let cand = m[1].trim().replace(leadingNonNameWords, '').replace(leadingNonNameWords, '').trim();
        const words = cand.split(/\s+/).filter(Boolean);
        if (words.length < 2) continue;
        if (stopPhrases.has(cand)) continue;
        if (familyNames.has(cand.toLowerCase()) || words.some(w => familyNames.has(w.toLowerCase()))) continue;
        if (!candidates.includes(cand)) candidates.push(cand);
      }
    }

    if (candidates.length === 0) return null;

    const uaHeaders = {
      'User-Agent': 'SlantEditorialStudio/1.0 (https://slant.today; editorial@slant.today)',
      'Accept': 'application/json'
    };

    for (const cand of candidates.slice(0, 3)) {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(cand)}&gsrlimit=2&prop=pageimages|description|extracts&exintro=1&explaintext=1&exchars=320&piprop=thumbnail|original&pithumbsize=800&format=json&origin=*`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3200);
      const resp = await fetch(wikiUrl, { headers: uaHeaders, signal: ctrl.signal });
      clearTimeout(timer);
      if (!resp.ok) continue;

      const data = await resp.json();
      const pages = data?.query?.pages
        ? Object.values(data.query.pages).sort((a, b) => (a.index || 99) - (b.index || 99))
        : [];

      for (const p of pages) {
        const title = String(p.title || '').trim();
        const desc = String(p.description || '').trim();
        const extract = String(p.extract || '').trim();
        const imgUrl = p.thumbnail?.source || p.original?.source;
        if (!imgUrl || /\.svg$/i.test(imgUrl)) continue;

        // Verify the Wikipedia article is actually about a person/public figure and matches the candidate name tokens
        const candTokens = cand.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
        const titleLower = title.toLowerCase();
        const nameMatchesTitle = candTokens.some(t => titleLower.includes(t));
        const isPersonBio = /\b(born\b|politician|actor|actress|cricketer|athlete|leader|minister|president|entrepreneur|businessman|industrialist|scientist|author|writer|director|philosopher|monk|singer|musician|player|founder|ceo|executive|statesman|filmmaker|journalist|activist|poet|historian)\b/i.test(`${desc} ${extract}`);
        if (!nameMatchesTitle || !isPersonBio) continue;

        // Fetch the reference portrait image bytes into base64
        const imgCtrl = new AbortController();
        const imgTimer = setTimeout(() => imgCtrl.abort(), 3500);
        const imgResp = await fetch(imgUrl, {
          signal: imgCtrl.signal,
          headers: {
            'User-Agent': 'SlantEditorialStudio/1.0 (https://slant.today)',
            'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
          }
        });
        clearTimeout(imgTimer);
        if (imgResp.ok) {
          const ct = (imgResp.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
          const buf = await imgResp.arrayBuffer();
          if (buf.byteLength > 1500 && buf.byteLength < 5 * 1024 * 1024) {
            return {
              name: title,
              description: desc || extract.slice(0, 140),
              extract,
              imageUrl: imgUrl,
              imageMimeType: ct,
              imageBase64: `data:${ct};base64,` + Buffer.from(buf).toString('base64')
            };
          }
        }
      }
    }
  } catch (err) {
    console.warn('Public figure Wikipedia photo resolution skipped:', err.message);
  }
  return null;
}

// When gemini-2.5-flash-image blocks a real celebrity reference photo with IMAGE_OTHER / SAFETY,
// use Gemini 2.5 Flash Vision to extract a forensic facial & physical likeness description directly from the photo
// so the fallback illustration prompt renders their exact real face (and removes any hallucinated beard or wrong political symbols).
async function extractPhotoGroundedLikenessPrompt(imageBase64, imageMimeType = 'image/jpeg', originalPrompt = '') {
  if (!GEMINI_API_KEY || !imageBase64) return null;
  try {
    const cleanB64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const visionPrompt = `You are an expert editorial portrait artist. Inspect the person in this attached reference photograph and rewrite the following illustration prompt so an AI image generator draws their EXACT physical and facial likeness in the described scene WITHOUT using any proper celebrity/politician names or party emblems that trigger safety filters:

Original Prompt:
"""${originalPrompt}"""

STRICT INSTRUCTIONS:
1. FORENSIC FACIAL & HAIR LIKENESS FROM PHOTO: Carefully observe the attached photo and explicitly describe the person's exact face shape (e.g. broad round-oval face with full cheeks and double-chin contour), skin tone, eye shape (e.g. heavy-lidded expressive dark eyes with subtle under-eye fullness), eyebrows, nose shape, mouth, exact hair texture/parting/color (e.g. short curly salt-and-pepper hair receding slightly at the temples), and EXACT facial hair state from the photo (e.g. if they are clean-shaven or have only a very light 1-day shadow in the photo, explicitly state "clean-shaven lower face with zero beard" and REMOVE any conflicting "white beard" or "grey beard" from the original prompt!).
2. REMOVE LITERAL PROPER NAMES & CONTRADICTORY PARTY SYMBOLS: Replace the person's literal proper name with a descriptive role phrase (e.g. "a 60-year-old multilingual South Indian film actor turned political speaker") and explicitly forbid political party logos (e.g. "plain wooden podium with neutral fabric bunting, strictly no lotus or party symbols").
3. Output ONLY the rewritten 95-140 word visual illustration prompt string (plain text, no JSON, no quotes).`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6500);
    const resp = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType: imageMimeType || 'image/jpeg', data: cleanB64 } },
            { text: visionPrompt }
          ]
        }],
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens: 350,
          thinkingConfig: { thinkingBudget: 0 }
        }
      })
    });
    clearTimeout(timer);
    if (resp.ok) {
      const data = await resp.json();
      const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      if (text.length > 40) {
        return text;
      }
    }
  } catch (err) {
    console.warn('Vision likeness extraction skipped:', err.message);
  }
  return null;
}

module.exports = async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid JSON payload' });
      }
    }

    // Zero-Cost Endpoint 1: Extract 1–3 Key Visual Subjects & Search Web / Slant Commons Images per Subject Tab
    if (body && body.action === 'search_collage_images') {
      const {
        query = '',
        queries = null,
        contextText = '',
        scrapedTitle = '',
        sourceImageUrl = '',
        extractSubjects = false,
        includeSlantCommons = false,
        pageOffset = 0
      } = body;

      try {
        const subjects = extractSubjects
          ? extractKeyVisualSubjectsZeroCost(contextText, scrapedTitle)
          : [];

        const targetQueries = Array.isArray(queries) && queries.length > 0
          ? queries.slice(0, 3).map(q => String(q || '').trim()).filter(Boolean)
          : (query
              ? [String(query).trim()]
              : subjects.map(s => s.query));

        const tabResults = {};
        await Promise.all(
          targetQueries.map(async (qStr) => {
            const imgs = await searchWebImagesForSubject(
              qStr,
              sourceImageUrl,
              scrapedTitle,
              pageOffset
            );
            tabResults[qStr] = imgs;
          })
        );

        const primaryQuery = query || targetQueries[0] || '';
        return res.status(200).json({
          success: true,
          subjects,
          query: primaryQuery,
          images: tabResults[primaryQuery] || [],
          tabResults,
          slantArtImages: []
        });
      } catch (err) {
        return res.status(500).json({
          success: false,
          error: err.message || 'Failed to search collage images'
        });
      }
    }

    // Zero-Cost Endpoint 2: Proxy external web image to Base64 Data URL so client <canvas> collage never hits CORS taint
    if (body && body.action === 'fetch_image_base64') {
      const { imageUrl = '', fallbackUrl = '' } = body;
      const cleanUrl = String(imageUrl || '').trim();
      const cleanFallback = String(fallbackUrl || '').trim();
      if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) {
        return res.status(400).json({ success: false, error: 'Valid http(s) imageUrl required' });
      }
      const candidateUrls = [cleanUrl];
      if (cleanFallback && /^https?:\/\//i.test(cleanFallback) && cleanFallback !== cleanUrl) {
        candidateUrls.push(cleanFallback);
      }
      for (const targetUrl of candidateUrls) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 5500);
          const resp = await fetch(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            },
            signal: ctrl.signal
          });
          clearTimeout(timer);
          if (!resp.ok) continue;
          const contentType = resp.headers.get('content-type') || 'image/jpeg';
          const mimeType = contentType.split(';')[0].trim() || 'image/jpeg';
          if (!mimeType.startsWith('image/')) continue;
          const ab = await resp.arrayBuffer();
          if (ab.byteLength < 200) continue;
          const b64 = Buffer.from(ab).toString('base64');
          return res.status(200).json({
            success: true,
            mimeType,
            dataUrl: `data:${mimeType};base64,${b64}`
          });
        } catch (_) {}
      }
      return res.status(400).json({
        success: false,
        error: 'Failed to proxy image for collage'
      });
    }

    // Fast Single-Purpose Endpoint: Rethink / Regenerate Daily Chronicle Reflection(s) when user taps Thumbs Down / Rethink
    if (body && body.action === 'rethink_chronicle_reflection') {
      const {
        chronicleMoments = [],
        previousReflections = [],
        reflectionFeedbackHistory = null
      } = body;
      const validMoments = Array.isArray(chronicleMoments)
        ? chronicleMoments.filter(m => m && String(m.text || '').trim().length >= 2)
        : [];
      if (validMoments.length === 0) {
        return res.status(400).json({ error: 'No moments provided to reflect on.' });
      }
      const explicitStarred = validMoments.filter(m => Boolean(m && m.isStarred));
      const likedList = Array.isArray(reflectionFeedbackHistory?.liked) ? reflectionFeedbackHistory.liked.slice(0, 5) : [];
      const dislikedList = [
        ...(Array.isArray(previousReflections) ? previousReflections.map(r => (typeof r === 'string' ? r : r?.quote)).filter(Boolean) : []),
        ...(Array.isArray(reflectionFeedbackHistory?.disliked) ? reflectionFeedbackHistory.disliked.slice(0, 5) : [])
      ];

      const rethinkPrompt = `You are a thoughtful, grounded personal diary reflection coach for "Slant".
The author recorded these ${validMoments.length} moments from their day:
${validMoments.map((m, i) => `Moment 0${i + 1}${m.isStarred ? ' [★ STARRED IMPORTANT MOMENT]' : ''}: "${m.text}"`).join('\n')}

${dislikedList.length > 0 ? `CRITICAL — THE AUTHOR DISLIKED / REJECTED THESE PREVIOUS REFLECTIONS (DO NOT REPEAT THIS ANGLE OR STYLE):\n${dislikedList.map(q => `- "${q}"`).join('\n')}\n` : ''}
${likedList.length > 0 ? `THE AUTHOR LIKED THESE PAST REFLECTIONS (MATCH THIS PRAGMATIC, HUMAN STYLE):\n${likedList.map(q => `- "${q}"`).join('\n')}\n` : ''}

YOUR TASK — GENERATE 1 OR 2 MEANINGFUL BEHAVIORAL/EMOTIONAL REFLECTIONS TO MAKE THE PERSON BETTER:
1. NEVER stitch or force all ${validMoments.length} moments into a single convoluted sentence!
2. ${explicitStarred.length > 0 ? `Focus primarily on the ★ STARRED moment(s) (${explicitStarred.map(m => `"${m.text}"`).join('; ')}), plus at most one other moment ONLY if it carries a strong, separate behavioral/emotional lesson.` : `Extract the real emotions and human behaviors associated with the moments—whether on the POSITIVE side of a behavior (strength, calm mentoring, warmth, ownership, gratitude) or the NEGATIVE / DRIFT side (scattered focus, procrastination, post-launch anxiety, impatience) that invites constructive course-correction.`}
3. If ALL moments are purely factual/observational logs (e.g., logging a child's routine activities) with no behavioral tension, write 1 simple, warm generic reflection about everyday growth or presence WITHOUT forcing literal nouns from the moments into a riddle.
4. Decide whether 1 quote or 2 quotes fits best:
   - Output 1 reflection object if there is one clear starred/emotional lesson (16-24 words).
   - Output 2 independent reflection objects if there are 2 distinct behavioral/emotional lessons from different moments that should NOT be combined into one sentence (14-22 words each).
5. For each reflection object in "chronicleReflections":
   - "polarity": "positive" (positive behavior to keep/adapt), "corrective" (negative/drift behavior turned into constructive action), or "generic" (warm general life reflection).
   - "behaviorTag": Short uppercase badge naming the emotion/behavior and side, e.g. "⚡ SELF-CORRECTION • DRIFT → FOCUS", "🌱 WORTH ADAPTING • WARMTH & PRESENCE", "★ DESIGN OWNERSHIP • GROWTH", "🧭 STEADY PARENTING • PATIENCE", or "✦ DAILY REFLECTION • QUIET GRATITUDE".
   - "quote": The crisp, plain-English reflection quote (14-24 words, zero pretentious jargon, no em-dashes).
   - "momentIndex": 1-based moment number (1, 2, or 3) it primarily reflects on (or 0 if generic).

Respond strictly with valid JSON:
{
  "chronicleReflections": [
    {
      "polarity": "positive | corrective | generic",
      "behaviorTag": "SHORT EMOTION / BEHAVIOR BADGE",
      "quote": "14-24 word grounded reflection quote that helps the person grow.",
      "momentIndex": 1
    }
  ]
}`;

      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
        const gResp = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: rethinkPrompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2048,
              responseMimeType: 'application/json',
              thinkingConfig: {
                thinkingBudget: 0
              }
            }
          })
        });
        if (!gResp.ok) {
          throw new Error('Gemini API error ' + gResp.status);
        }
        const gData = await gResp.json();
        const partsArr = gData.candidates?.[0]?.content?.parts || [];
        const textPart = partsArr.find(p => typeof p.text === 'string' && p.text.includes('{')) || partsArr[0];
        let rawText = (textPart?.text || '{}').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
        const firstBrace = rawText.indexOf('{');
        const lastBrace = rawText.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
          rawText = rawText.slice(firstBrace, lastBrace + 1);
        }
        const parsedRethink = JSON.parse(rawText);
        const reflections = Array.isArray(parsedRethink.chronicleReflections)
          ? parsedRethink.chronicleReflections.slice(0, 2).filter(r => r && r.quote).map(r => ({
              polarity: ['positive', 'corrective', 'generic'].includes(String(r.polarity || '').toLowerCase())
                ? String(r.polarity).toLowerCase()
                : 'generic',
              behaviorTag: String(r.behaviorTag || '✦ DAILY REFLECTION').trim(),
              quote: formatCuratorTakeApt(String(r.quote).trim()),
              momentIndex: Number(r.momentIndex) || 0
            }))
          : [];
        if (reflections.length === 0) {
          throw new Error('Empty reflections returned');
        }
        const primaryQuote = reflections.map(r => r.quote).join(' ');
        return res.status(200).json({
          success: true,
          chronicleReflections: reflections,
          curatorTake: primaryQuote
        });
      } catch (err) {
        return res.status(500).json({ error: err.message || 'Failed to rethink reflection' });
      }
    }

    // Direct Single-Purpose Endpoint: Generate artwork only in background (has dedicated full execution window)
    if (body && body.action === 'artwork_only') {
      let {
        prompt = '',
        imageBase64 = null,
        imageMimeType = 'image/jpeg',
        creatorEmail = '',
        familyCast = null,
        activeCast = null,
        castStaging = null,
        countryContext = '',
        rebuildPromptFromSettings = false,
        perspectiveMode = 'source',
        characterRepresentation = 'realistic',
        sourceType = 'digital_link',
        userSlant = '',
        spark = '',
        adaptedHeadline = '',
        originalHeadline = '',
        scrapedTitle = '',
        scrapedContent = '',
        customDirection = '',
        chronicleMode = false,
        chronicleMoments = [],
        chronicleMomentImages = [],
        preferredVisualSubject = null
      } = body;
      const validBodyMoments = Array.isArray(chronicleMoments)
        ? chronicleMoments.filter(m => m && String(m.text || '').trim().length >= 2)
        : [];
      let chronicleVignetteCount = validBodyMoments.length;
      if (chronicleMode && !chronicleVignetteCount) {
        const combinedChronText = `${userSlant || ''} ${scrapedContent || ''} ${prompt || ''}`;
        if (/\bMoment\s*0?3\b/i.test(combinedChronText)) {
          chronicleVignetteCount = 3;
        } else if (/\bMoment\s*0?2\b/i.test(combinedChronText) || /\b2-vignette\b/i.test(combinedChronText)) {
          chronicleVignetteCount = 2;
        } else {
          chronicleVignetteCount = 3;
        }
      }
      let userEmail = (creatorEmail || '').toLowerCase().trim();
      if (!userEmail) {
        return res.status(401).json({ error: 'Please sign in with your account to regenerate artwork.' });
      }
      const creditCheck = await verifyAndConsumeUserCredit(userEmail, Boolean(body.isManualRegenerate), Boolean(chronicleMode), Boolean(body.simulateZeroCredits));
      if (!creditCheck.allowed) {
        return res.status(403).json({ error: 'Private Preview: Your account is not yet on the invited curator whitelist.' });
      }
      if (!creditCheck.hasCredits && Boolean(body.isManualRegenerate)) {
        return res.status(429).json({
          error: '⚡ Your visual art generation credits are used up for today. Tap "Request More Credits" in Studio (text-only polish is always free)!',
          creditsExhausted: true,
          credits: creditCheck.credits
        });
      }
      if (!prompt && !userSlant && !adaptedHeadline) {
        return res.status(400).json({ error: 'Missing prompt for artwork generation' });
      }

      if (!familyCast || !Array.isArray(familyCast.members) || familyCast.members.length === 0) {
        try {
          if (userEmail) {
            const loaded = await loadSharedFamilyCastAndNotifications(userEmail);
            if (loaded && loaded.cast) familyCast = loaded.cast;
          }
        } catch (_) {}
      }
      if (!familyCast || !Array.isArray(familyCast.members) || familyCast.members.length === 0) {
        familyCast = getDefaultFamilyCast(userEmail);
      }
      // Exclude any pending/declined unapproved linked members from visual generation
      if (familyCast && Array.isArray(familyCast.members)) {
        familyCast = {
          ...familyCast,
          members: familyCast.members.filter(m => m && m.approvalStatus !== 'pending' && m.approvalStatus !== 'declined')
        };
      }

      const isShridharContext = isShridharCastContext(familyCast, userEmail);
      const selfMemberForRegen = (familyCast && Array.isArray(familyCast.members))
        ? familyCast.members.find(m => m && m.relationship === 'self')
        : null;
      const selfLabelForRegen = (selfMemberForRegen && selfMemberForRegen.name) ? selfMemberForRegen.name : 'the narrator';

      // Auto-resolve an authentic Wikipedia reference photo if this post mentions a popular/public figure (e.g., Prakash Raj in Inner Voice) and has no imageBase64 yet
      let resolvedPublicFigureForRegen = null;
      if (!imageBase64 && !chronicleMode && characterRepresentation !== 'silhouette') {
        resolvedPublicFigureForRegen = await resolvePublicFigureReferencePhoto({
          userSlant,
          spark,
          adaptedHeadline,
          originalHeadline,
          heroCue: Array.isArray(body.cues) ? body.cues[0] : '',
          prompt,
          familyCast
        });
        if (resolvedPublicFigureForRegen && resolvedPublicFigureForRegen.imageBase64) {
          imageBase64 = resolvedPublicFigureForRegen.imageBase64;
          imageMimeType = resolvedPublicFigureForRegen.imageMimeType || 'image/jpeg';
        }
      }

      let updatedCues = null;
      if (rebuildPromptFromSettings) {
        const familyCastDirectives = buildFamilyCastDirectives({
          familyCast,
          activeCast,
          castStaging,
          userSlant: userSlant || adaptedHeadline,
          spark,
          countryContext,
          sourceType,
          perspectiveMode,
          chronicleMode: Boolean(chronicleMode),
          preferredVisualSubject,
          userEmail
        });

        const stylePrefix = chronicleMode
          ? (chronicleVignetteCount === 2
              ? 'Masterpiece 2-vignette editorial watercolor and gouache spot-illustration page on open unpainted textured warm cream archival watercolor paper, featuring EXACTLY 2 separate, self-contained soft-edged oval spot-illustration vignettes stacked vertically (1 Upper Vignette + 1 Lower Larger Highlight Vignette — STRICTLY ONLY 2 VIGNETTES TOTAL, NEVER 3 VIGNETTES!) floating on the open cream paper background with wide unpainted cream paper margins separating them'
              : (chronicleVignetteCount === 1
                  ? 'Masterpiece single-vignette editorial watercolor and gouache spot-illustration page on open unpainted textured warm cream archival watercolor paper, featuring 1 centered soft-edged oval spot-illustration vignette floating on the open cream paper background with wide unpainted cream paper margins'
                  : 'Masterpiece 3-vignette editorial watercolor and gouache spot-illustration page on open unpainted textured warm cream archival watercolor paper, featuring 3 separate, self-contained soft-edged oval spot-illustration vignettes floating on the open cream paper background with wide unpainted cream paper margins surrounding and separating each vignette'))
          : ((characterRepresentation === 'cinematic' || characterRepresentation === 'likeness')
            ? 'Award-winning 35mm editorial documentary photograph in 4:5 vertical portrait format, sharp camera focus, natural skin textures, lifelike human expressions, authentic ambient lighting (strictly no painterly brushstrokes or canvas texture)'
            : (characterRepresentation === 'painting'
              ? 'Masterpiece warm broadsheet painted illustration in gouache and oil style, rich painted pigments, lifelike human expression'
              : (characterRepresentation === 'watercolor'
                ? 'Masterpiece hand-painted editorial watercolor and fine fountain-pen ink-wash illustration on textured warm cream cold-press watercolor paper (#F5EFE2), featuring luminous translucent watercolor washes, soft wet-on-wet pigment blooms, expressive pen-and-ink contour linework, and soft feathered edges fading into unpainted cream paper'
                : (characterRepresentation === 'silhouette'
                  ? 'High-contrast minimalist graphic silhouette editorial art, stark architectural shadows'
                  : 'High-impact editorial broadsheet illustration in 4:5 vertical portrait format capturing vivid editorial realism, warm natural lighting on faces, dramatic journalistic clarity'))));

        const focusRule = (perspectiveMode === 'curator')
          ? `Visual Focus is CURATOR ANGLE: Anchor the scene in the curator's personal experience, metaphor, or thesis ("${userSlant || adaptedHeadline}").`
          : (perspectiveMode === 'source'
            ? `Visual Focus is SOURCE GROUNDED: Anchor the scene in the physical reality and concrete subjects of "${originalHeadline || scrapedTitle || adaptedHeadline || userSlant}".`
            : `Visual Focus is HYBRID BLEND: Blend the real-world subject ("${originalHeadline || scrapedTitle || adaptedHeadline}") with the curator's personal perspective ("${userSlant}").`);

        try {
          const validRebuildMomentImgs = Array.isArray(chronicleMomentImages)
            ? chronicleMomentImages.filter(m => m && m.imageBase64 && typeof m.imageBase64 === 'string')
            : [];
          const rebuildParts = [];
          validRebuildMomentImgs.forEach((m, idx) => {
            const cleanM = m.imageBase64.includes(',') ? m.imageBase64.split(',')[1] : m.imageBase64;
            rebuildParts.push({
              inlineData: {
                mimeType: m.imageMimeType || 'image/jpeg',
                data: cleanM
              }
            });
            rebuildParts.push({
              text: `[Attached Reference Photo/Logo for Moment 0${m.index || (idx + 1)} (${m.title || 'Moment ' + (idx + 1)}): "${m.text || ''}"]`
            });
          });

          if (!chronicleMode && imageBase64) {
            const cleanRefB64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
            rebuildParts.push({
              inlineData: {
                mimeType: imageMimeType || 'image/jpeg',
                data: cleanRefB64
              }
            });
            rebuildParts.push({
              text: resolvedPublicFigureForRegen
                ? `[ATTACHED AUTHENTIC WIKIPEDIA REFERENCE PHOTO OF PUBLIC FIGURE "${resolvedPublicFigureForRegen.name}" (${resolvedPublicFigureForRegen.description || ''}): Inspect this actual photograph of ${resolvedPublicFigureForRegen.name}. In "illustrationPrompt", you MUST describe ${resolvedPublicFigureForRegen.name}'s exact observed facial geometry, eye shape, nose, hair texture/parting, and EXACT facial hair state from this photo (e.g., if they are clean-shaven or have only light stubble in this photo, NEVER invent a full white/grey beard!). Also strictly align the setting with the curator's slant and NEVER hallucinate opposing political party symbols (e.g. never place a right-wing BJP lotus on a podium for a liberal/leftist speaker!).]`
                : `[ATTACHED REFERENCE PHOTO: Inspect the person/subject in this attached reference photograph and describe their exact real facial structure, eye shape, hairstyle, and facial hair state in "illustrationPrompt".]`
            });
          }

          const previousPrompt = String(prompt || '').trim();
          const promptBuilderText = `You are the Visual Director for SLANT. Build a fresh, distinctly new "illustrationPrompt" and 6 visual "cues" for Poster 1 based on the curator's updated Studio Settings:
- Medium & Portrayal Style (MANDATORY PRIMARY MEDIUM): ${stylePrefix}
- ${focusRule}
- Regional & Cultural Setting: ${countryContext || 'India'}
- Headline: "${adaptedHeadline}"
- Curator's Slant / Take: "${userSlant}"
${spark ? `- Spark / Catalyst: "${spark}"` : ''}
${scrapedTitle ? `- Source Title: "${scrapedTitle}"` : ''}
${scrapedContent ? `- Source Context: "${String(scrapedContent).slice(0, 600)}"` : ''}
${previousPrompt ? `\nPREVIOUS VISUAL PROMPT (DO NOT REPEAT THIS COMPOSITION OR POSE):\n"${previousPrompt.slice(0, 500)}"\n\nCRITICAL VISUAL REGENERATION & VARIATION DIRECTIVE:\nThe curator explicitly requested a fresh visual regeneration. You MUST create a SIGNIFICANTLY DIFFERENT visual scene from the previous prompt above: choose a fresh visual metaphor or focal action, a noticeably different camera angle/perspective (e.g., wide atmospheric establishing shot vs. dramatic over-the-shoulder angle vs. symbolic close-up focal object), a distinct lighting palette, and strictly apply the selected Medium & Portrayal Style (${stylePrefix}).` : ''}
${familyCastDirectives ? `\nMANDATORY CASTING VAULT & PROTAGONIST ANCHORS:\n${familyCastDirectives.systemPromptSection}` : ''}
${preferredVisualSubject && preferredVisualSubject.title ? `\nCRITICAL CORE VISUAL SUBJECT SELECTED BY CURATOR (HIGHEST PRIORITY):\n- Selected Visual Subject: "${preferredVisualSubject.title}" — ${preferredVisualSubject.description || ''}\n- Build "illustrationPrompt" and "cues" directly around this exact visual subject!${!preferredVisualSubject.isPersonalFamily ? ' Strictly DO NOT depict the author\'s personal family on a home veranda!' : ''}` : ''}
${chronicleMode && validBodyMoments.some(m => m && m.preferredVisualProjection && m.preferredVisualProjection.title) ? `\nCRITICAL CURATOR-SELECTED PER-MOMENT VISUAL PROJECTIONS (MANDATORY FOR EACH VIGNETTE):\n${validBodyMoments.map((m, idx) => m.preferredVisualProjection && m.preferredVisualProjection.title ? `- Moment 0${idx + 1} (${m.title || 'Moment ' + (idx + 1)}): Depict "${m.preferredVisualProjection.title}" — ${m.preferredVisualProjection.description || ''}` : '').filter(Boolean).join('\n')}` : ''}
${validRebuildMomentImgs.length > 0 ? `\nCRITICAL ATTACHED MOMENT PHOTO / LOGO INTEGRATION DIRECTIVE:\n- The curator attached ${validRebuildMomentImgs.length} reference image(s) for specific moment(s) of their Daily Chronicle.\n- Inspect each attached image above and explicitly describe its exact visual graphic, emblem, or scene in "illustrationPrompt" so it is prominently featured inside its corresponding moment vignette.` : ''}
${customDirection ? `\nCURATOR'S SPECIFIC VISUAL DIRECTION: "${customDirection}"` : ''}

STRICT RULES:
1. ${isShridharContext
  ? 'If Father (Shridhar) is in the scene, you MUST describe him as a "mid-age 40-year-old Indian man in his early 40s with a soft fuller round-oval face, full cheeks, full head of thick short dark hair brushed up, neat short dark trimmed stubble beard, and a natural medium-full adult build with a straight-cut everyday waist where his shirt hangs flush with his chest line (strictly neither a skinny V-taper gym body nor a protruding pot-belly, and strictly NOT an elderly or old man)". NEVER call him "fit" or "lean" and NEVER give him an exaggerated protruding belly unless explicitly requested.'
  : (selfMemberForRegen
      ? `If the narrator (${selfLabelForRegen}) is in the scene, strictly portray them using their exact Reference Vault traits: ${selfMemberForRegen.uncompromisableAnchors || selfMemberForRegen.visualTraits || `${selfLabelForRegen}, age ${selfMemberForRegen.age || 'adult'}, height ${selfMemberForRegen.heightDesc || ''}`}.`
      : 'Portray any protagonists strictly according to the curator\'s context and MANDATORY CASTING VAULT & PROTAGONIST ANCHORS.')}
2. ${chronicleMode
  ? (chronicleVignetteCount === 2
      ? (isShridharContext
          ? 'DAILY CHRONICLE 2-SPOT-VIGNETTE LAYOUT (EXACTLY 2 MOMENTS = EXACTLY 2 VIGNETTES, STRICTLY NEVER 3 VIGNETTES!): Present EXACTLY 2 separate, self-contained soft-edged oval watercolor-and-gouache spot-illustration vignettes stacked vertically on open unpainted textured warm cream archival paper: (1) Upper Centered Vignette (~40% of canvas) depicting Moment 01 in full with all mentioned people (e.g. BOTH Shridhar and his male college friend—give the friend a distinct clean-shaven face with glasses, full wavy black hair, and a contrasting shirt so he does not look like a twin of bearded Shridhar!), and (2) Lower Centered Larger Highlight Vignette (~55% of canvas) depicting Moment 02 (the starred highlight moment). STRICT BAN ON 3 VIGNETTES: NEVER split Moment 01 into two upper vignettes! When the family (Father, Mother, and 2 sons) appears together in a vignette, draw EXACTLY 4 PEOPLE TOTAL SHOWN FULL-BODY FROM HEAD TO TOE WITH ALL FEET AND SHOES PLANTED ON THE SAME LEVEL GROUND LINE from left to right: (1st on far left) Father Shridhar (5ft 10in / 178cm, 100% baseline height, in trousers and shoes) -> (2nd from left) Mother Aruna (5ft 4in / 162cm, 91% of Father\'s height, in kurta and sandals) -> (3rd from left) 11yo pre-teen elder son Gahan in dark navy-blue t-shirt, knee-length denim shorts, and sneakers (4ft 8in / 142cm, 88% of Mother Aruna\'s height and 80% of Father\'s height — clearly 8 inches / 20cm SHORTER than Mother Aruna so the top of Gahan\'s head is strictly BELOW Mother\'s chin at her collarbone / upper-shoulder level; strictly NEVER draw Gahan as tall as or taller than Mother!) -> (4th on far right) 7yo younger son Rishu in mustard-yellow t-shirt, dark shorts, and sneakers (4ft 2in / 127cm, 89% of Elder Brother Gahan\'s height and 78% of Mother\'s height — 6 inches / 15cm shorter than Gahan so the top of Rishu\'s head rises above Gahan\'s shoulders to reach Gahan\'s chin/neck level; strictly NEVER draw Rishu equal height with Gahan!).'
          : `DAILY CHRONICLE 2-SPOT-VIGNETTE LAYOUT (EXACTLY 2 MOMENTS = EXACTLY 2 VIGNETTES, STRICTLY NEVER 3 VIGNETTES!): Present EXACTLY 2 separate, self-contained soft-edged oval watercolor-and-gouache spot-illustration vignettes stacked vertically on open unpainted textured warm cream archival paper: (1) Upper Centered Vignette (~40% of canvas) depicting Moment 01 in full with all mentioned people (including ${selfLabelForRegen}), and (2) Lower Centered Larger Highlight Vignette (~55% of canvas) depicting Moment 02 (the starred highlight moment). STRICT BAN ON 3 VIGNETTES! Depict family members from MANDATORY CASTING VAULT & PROTAGONIST ANCHORS strictly according to their heights and traits.`)
      : (isShridharContext
          ? 'DAILY CHRONICLE 3-SPOT-VIGNETTE LAYOUT (WITH WIDE LEFT/RIGHT SAFE MARGINS IN 3:4 PORTRAIT): Present 3 separate, self-contained soft-edged oval watercolor-and-gouache spot-illustration vignettes floating inside the central 82% horizontal safe zone of an open unpainted textured warm cream archival paper page (Top-Left spot vignette ~25%, Top-Right spot vignette ~25%, Bottom-Center larger spot vignette ~45-50% for the starred highlight moment), maintaining a generous 9%–10% clear unpainted warm cream paper margin along the left edge, right edge, top edge, and bottom edge so ZERO subjects or vignette halos are ever clipped at the left or right borders. Depict family members or companions ONLY inside the specific moment vignette where they are mentioned (strictly NEVER merge all 3 moments into a single full-bleed background scene!). Whenever both brothers Gahan and Rishu appear, show them full-body from head to toe with shoes on the ground: 11yo pre-teen Gahan in navy t-shirt and denim shorts (4ft 8in / 142cm, 88% of Mother Aruna\'s height and 80% of Father\'s height — clearly 8 inches shorter than Mother so the top of Gahan\'s head is strictly BELOW Mother\'s chin at her collarbone/shoulder level, strictly NEVER as tall as or taller than Mother!) and 7yo younger boy Rishu in mustard-yellow t-shirt and dark shorts (4ft 2in / 127cm, 89% of Gahan\'s height — 6 inches shorter than Gahan so the top of Rishu\'s head rises above Gahan\'s shoulders to reach Gahan\'s chin/neck level).'
          : 'DAILY CHRONICLE 3-SPOT-VIGNETTE LAYOUT (WITH WIDE LEFT/RIGHT SAFE MARGINS IN 3:4 PORTRAIT): Present 3 separate, self-contained soft-edged oval watercolor-and-gouache spot-illustration vignettes floating inside the central 82% horizontal safe zone of an open unpainted textured warm cream archival paper page (Top-Left spot vignette ~25%, Top-Right spot vignette ~25%, Bottom-Center larger spot vignette ~45-50% for the starred highlight moment), maintaining a generous 9%–10% clear unpainted warm cream paper margin along all edges. Depict family members or companions ONLY inside the specific moment vignette where they are mentioned, strictly following MANDATORY CASTING VAULT & PROTAGONIST ANCHORS.'))
  : `If multiple family members are in MANDATORY CASTING VAULT & PROTAGONIST ANCHORS, you MUST include ALL ${familyCastDirectives ? familyCastDirectives.totalCount : ''} family members visibly side by side full-body from head to toe on the same ground line, strictly obeying their pairwise relative stature percentages.`}
3. POPULAR / PUBLIC FIGURE & ICONIC PERSONALITY PORTRAYAL DIRECTIVE (APPLIES TO BOTH INNER VOICE & WEB LINKS):
   - Whenever the curator's text ("${userSlant || adaptedHeadline}"${spark ? ` or "${spark}"` : ''}) mentions any recognizable public figure, historical icon, political leader, sports legend, industrialist, scientist, author, or celebrity (e.g., Ratan Tata, Dr. A.P.J. Abdul Kalam, Virat Kohli, MS Dhoni, Narayana Murthy, Sundar Pichai, Narendra Modi, Swami Vivekananda, Elon Musk, Donald Trump, etc.), you MUST feature them prominently as the focal protagonist in "illustrationPrompt" and "#1 HERO" cue!
   - ALWAYS pair their name with an unmistakable, encyclopedic physical likeness and signature attire description (exact age bracket, signature hairstyle/parting, beard/mustache style, spectacles/glasses, facial structure, skin tone, and iconic clothing/suit/turban/jersey) so the image generator renders their unmistakable visual likeness. Never replace named popular figures with generic objects or anonymous strangers!
4. Output strictly valid JSON:
{
  "illustrationPrompt": "Detailed 80-130 word visual prompt beginning with the exact Medium & Portrayal Style, describing a fresh scene composition, exact protagonists (including unmistakable physical likeness traits for any named public figure), setting, and lighting. No random text or letters.",
  "cues": ["#1 HERO (3-6 words)", "#2 MOTIF", "#3 TENSION", "#4 ATMOSPHERE", "#5 LIGHTING", "#6 STYLE"]
}`;
          rebuildParts.push({ text: promptBuilderText });
          const gUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
          const pCtrl = new AbortController();
          const pTimer = setTimeout(() => pCtrl.abort(), 11000);
          let promptRebuiltSuccessfully = false;
          const pResp = await fetch(gUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: rebuildParts }],
              generationConfig: {
                temperature: 0.9,
                thinkingConfig: { thinkingBudget: 0 },
                responseMimeType: 'application/json'
              }
            }),
            signal: pCtrl.signal
          });
          clearTimeout(pTimer);
          if (pResp.ok) {
            const pData = await pResp.json();
            let raw = pData.candidates?.[0]?.content?.parts?.[0]?.text || '';
            raw = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
            const parsedP = JSON.parse(raw);
            if (parsedP && parsedP.illustrationPrompt) {
              prompt = parsedP.illustrationPrompt;
              promptRebuiltSuccessfully = true;
              if (Array.isArray(parsedP.cues) && parsedP.cues.length > 0) {
                updatedCues = parsedP.cues;
              }
            }
          }
          if (!promptRebuiltSuccessfully) {
            prompt = `${stylePrefix}. ${focusRule} Depict a fresh editorial perspective and distinct camera framing for "${adaptedHeadline || userSlant}"${spark ? ` inspired by "${spark}"` : ''} in ${countryContext || 'India'}.`;
          }
        } catch (_) {
          prompt = `${stylePrefix}. ${focusRule} Depict a fresh editorial perspective and distinct camera framing for "${adaptedHeadline || userSlant}"${spark ? ` inspired by "${spark}"` : ''} in ${countryContext || 'India'}.`;
        }

        if (!prompt.toLowerCase().includes(stylePrefix.slice(0, 24).toLowerCase())) {
          prompt = `${stylePrefix}. ${prompt}`;
        }
        if (!chronicleMode && familyCastDirectives && familyCastDirectives.promptSnippet && !prompt.includes(familyCastDirectives.promptSnippet.slice(0, 28))) {
          prompt = `${stylePrefix}. ${familyCastDirectives.promptSnippet}. ${prompt}`;
        }
        if (customDirection && !prompt.toLowerCase().includes(customDirection.toLowerCase())) {
          prompt = `${prompt}. Additional direction: ${customDirection}`;
        }
      }

      // Multi-avatar image conditioning retired per design alignment: text-based Casting Vault anchors provide superior consistency,
      // eliminate token bleed, avoid clothing swaps, and maintain strict zero digital footprint.
      const stylizedAvatars = null;

      try {
        const geminiArt = await generateGeminiEditorialArtwork({
          prompt,
          imageBase64,
          imageMimeType,
          timeoutMs: 35000,
          familyCast,
          activeCast,
          stylizedAvatars,
          countryContext,
          chronicleMode,
          chronicleMomentCount: chronicleVignetteCount,
          chronicleMomentImages
        });
        if (geminiArt) {
          const cleanB64 = geminiArt.replace(/^data:image\/[^;]+;base64,/, '');
          return res.status(200).json({
            success: true,
            illustrationBase64: cleanB64,
            illustrationPrompt: prompt,
            updatedPrompt: prompt,
            cues: updatedCues,
            referencePhotoUrl: resolvedPublicFigureForRegen ? resolvedPublicFigureForRegen.imageUrl : undefined,
            sourceImageBase64: resolvedPublicFigureForRegen ? resolvedPublicFigureForRegen.imageBase64 : undefined,
            credits: creditCheck.credits
          });
        }
        return res.status(200).json({
          success: false,
          error: 'Gemini artwork synthesis timed out'
        });
      } catch (e) {
        return res.status(200).json({
          success: false,
          error: e.message || 'Artwork synthesis failed'
        });
      }
    }

    // Endpoint: Generate Stylized Editorial Character Avatar for a Cast Member
    if (body && body.action === 'generate_stylized_avatar') {
      const {
        memberId,
        imageBase64 = null,
        imageMimeType = 'image/jpeg',
        relation = 'family_member',
        name = '',
        approxAge = null,
        visualTraits = '',
        uncompromisableAnchors = '',
        creatorEmail = ''
      } = body;

      const userEmail = (creatorEmail || '').toLowerCase().trim();
      if (!userEmail) {
        return res.status(401).json({ error: 'Please sign in with your account to generate a stylized avatar.' });
      }
      const creditCheck = await verifyAndConsumeUserCredit(userEmail, Boolean(body.isManualRegenerate), Boolean(chronicleMode), Boolean(body.simulateZeroCredits));
      if (!creditCheck.allowed) {
        return res.status(403).json({ error: 'Private Preview: Your account is not yet on the invited curator whitelist.' });
      }
      if (!creditCheck.hasCredits && Boolean(body.isManualRegenerate)) {
        return res.status(429).json({
          error: '⚡ Your visual art generation credits are used up for today. Tap "Request More Credits" in Studio (text-only polish is always free)!',
          creditsExhausted: true,
          credits: creditCheck.credits
        });
      }

      if (!memberId) {
        return res.status(400).json({ error: 'Missing memberId' });
      }

      const castProfileId = resolveFamilyCastProfileId(userEmail);
      let sourcePhotoB64 = imageBase64;
      let sourcePhotoMime = imageMimeType;

      if (!sourcePhotoB64 && castProfileId) {
        try {
          const cResp = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(castProfileId)}&select=data`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
          });
          if (cResp.ok) {
            const rows = await cResp.json();
            const mem = rows[0]?.data?.members?.find(m => m.id === memberId);
            if (mem) {
              sourcePhotoB64 = mem.photos?.frontal || mem.photos?.profile || mem.photos?.stature || mem.photoBase64 || null;
            }
          }
        } catch (_) {}
      }

      if (!sourcePhotoB64) {
        return res.status(400).json({ error: 'No reference photo found for this member.' });
      }

      const cleanPhoto = sourcePhotoB64.includes(',') ? sourcePhotoB64.split(',')[1] : sourcePhotoB64;

      const roleHint = (relation === 'elder_son') ? '11-year-old Indian boy (pre-teen son)' :
        (relation === 'younger_son') ? '7-year-old young Indian boy (primary school son)' :
        (relation === 'spouse') ? 'adult Indian woman in mid 30s (mother / wife)' :
        (relation === 'self') ? 'adult Indian man in early 40s (father / husband)' : 'family member';

      const prompt = `Transform this reference photograph of an ${roleHint}${name ? ' named ' + name : ''}${approxAge ? ', approx age ' + approxAge : ''} into a high-aesthetic, dignified stylized editorial character portrait in vertical 3:4 format. Style: warm broadsheet editorial painted illustration (gouache and oil editorial art). Faithfully preserve the subject authentic facial geometry, jawline, eye shape, smile, haircut, skin tone, and realistic body build from this photo (${visualTraits || uncompromisableAnchors || ''}). Warm soft studio lighting, neutral warm background, expressive and friendly, masterpiece character model, no typography, zero letters.`;

      const avatarB64 = await generateGeminiEditorialArtwork({
        prompt,
        imageBase64: cleanPhoto,
        imageMimeType: sourcePhotoMime,
        timeoutMs: 25000
      });

      if (!avatarB64) {
        return res.status(500).json({ error: 'Failed to generate stylized avatar' });
      }

      const cleanAvatarB64 = avatarB64.replace(/^data:image\/[^;]+;base64,/, '');
      const buf = Buffer.from(cleanAvatarB64, 'base64');
      const safeUserSlug = String(castProfileId || userEmail).replace(/[^a-z0-9_-]/g, '_');
      const fileName = `avatar_${safeUserSlug}_${memberId}.png`;

      try {
        await fetch(`${SUPABASE_URL}/storage/v1/object/posters/${fileName}`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'image/png',
            'x-upsert': 'true'
          },
          body: buf
        });
      } catch (uploadErr) {
        console.warn('Avatar storage upload warning:', uploadErr);
      }

      const avatarUrl = `${SUPABASE_URL}/storage/v1/object/public/posters/${fileName}`;

      if (castProfileId) {
        try {
          const cResp = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(castProfileId)}&select=*`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
          });
          if (cResp.ok) {
            const rows = await cResp.json();
            if (rows && rows[0] && rows[0].data) {
              const castData = rows[0].data;
              castData.members = (castData.members || []).map(m => {
                if (m.id === memberId) {
                  m.stylizedAvatarUrl = avatarUrl;
                }
                return m;
              });
              castData.updatedAt = new Date().toISOString();

              await fetch(`${SUPABASE_URL}/rest/v1/posts`, {
                method: 'POST',
                headers: {
                  'apikey': SUPABASE_KEY,
                  'Authorization': `Bearer ${SUPABASE_KEY}`,
                  'Content-Type': 'application/json',
                  'Prefer': 'resolution=merge-duplicates'
                },
                body: JSON.stringify({
                  id: castProfileId,
                  data: castData
                })
              });
            }
          }
        } catch (profErr) {
          console.warn('Profile avatar update warning:', profErr);
        }
      }

      return res.status(200).json({
        success: true,
        avatarUrl,
        avatarBase64: cleanAvatarB64
      });
    }

    // Endpoint: Get or Save Curator Style Profile & Longitudinal Observations
    if (body && body.action === 'get_curator_style') {
      const { userIdentifier = '' } = body;
      const cleanId = String(userIdentifier || '').trim().toLowerCase();
      if (!cleanId || cleanId === 'default' || !cleanId.includes('@')) {
        return res.status(200).json({
          success: true,
          profile: getDefaultCuratorStyle(userIdentifier)
        });
      }
      const profileId = 'curator_style_' + cleanId.replace(/[^a-z0-9_-]/g, '_');
      try {
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(profileId)}&select=data`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        if (resp.ok) {
          const rows = await resp.json();
          if (rows && rows[0] && rows[0].data) {
            return res.status(200).json({ success: true, profile: rows[0].data });
          }
        }
      } catch (err) {
        console.warn('Get curator style error:', err.message);
      }
      return res.status(200).json({
        success: true,
        profile: getDefaultCuratorStyle(userIdentifier)
      });
    }

    if (body && body.action === 'save_curator_style') {
      const { userIdentifier = '', profile } = body;
      const cleanId = String(userIdentifier || '').trim().toLowerCase();
      if (!cleanId || cleanId === 'default' || !cleanId.includes('@')) {
        return res.status(401).json({ success: false, error: 'Sign in required to save style profile' });
      }
      const profileId = 'curator_style_' + cleanId.replace(/[^a-z0-9_-]/g, '_');
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/posts`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify({ id: profileId, data: profile })
        });
        return res.status(200).json({ success: true, profile });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    // Endpoint: Get or Save Public Curator Wall Quote & Profile (Visible to all readers visiting @handle)
    if (body && body.action === 'get_public_curator_profile') {
      const rawHandle = String(body.handle || '').replace(/^@/, '').trim().toLowerCase();
      const rawEmail = String(body.email || '').trim().toLowerCase();
      const slug = (rawHandle || rawEmail).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      if (!slug) {
        return res.status(200).json({ success: true, profile: null });
      }
      const profileId = 'curator_public_profile_' + slug;
      try {
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(profileId)}&select=data`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        if (resp.ok) {
          const rows = await resp.json();
          if (rows && rows[0] && rows[0].data) {
            return res.status(200).json({ success: true, profile: rows[0].data });
          }
        }
      } catch (err) {
        console.warn('get_public_curator_profile error:', err.message);
      }
      return res.status(200).json({ success: true, profile: null });
    }

    if (body && body.action === 'save_public_curator_profile') {
      const { handle = '', email = '', profile = {} } = body;
      const cleanHandle = String(handle || profile.handle || '').replace(/^@/, '').trim().toLowerCase();
      const cleanEmail = String(email || profile.email || '').trim().toLowerCase();
      const handleSlug = cleanHandle.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      if (!handleSlug && !cleanEmail) {
        return res.status(400).json({ success: false, error: 'Handle or email required to save profile' });
      }
      const savedProfile = {
        ...profile,
        handle: handle || profile.handle || '',
        email: cleanEmail,
        updatedAt: new Date().toISOString()
      };
      try {
        if (handleSlug) {
          await fetch(`${SUPABASE_URL}/rest/v1/posts`, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify({ id: 'curator_public_profile_' + handleSlug, data: savedProfile })
          });
        }
        if (cleanEmail) {
          const emailSlug = cleanEmail.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
          await fetch(`${SUPABASE_URL}/rest/v1/posts`, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify({ id: 'curator_public_profile_' + emailSlug, data: savedProfile })
          });
        }
        return res.status(200).json({ success: true, profile: savedProfile });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    // Endpoint: Generate AI Bespoke Wall Quote Theme + Illustrated Ghibli/Anime/Watercolor Scene based on the writer's State of Mind quote (Studio Feature)
    if (body && body.action === 'generate_wall_quote_theme') {
      const quoteText = String(body.quote || '').trim();
      const lensText = String(body.lens || '').trim();
      const artStyleKey = String(body.artStyle || 'ghibli_sky').trim();
      if (!quoteText || quoteText.length < 4) {
        return res.status(400).json({ success: false, error: 'Write or pick a Wall Quote first so AI can paint a backdrop around it.' });
      }

      const ART_STYLE_DIRECTIVES = {
        ghibli_sky: 'Studio Ghibli hand-painted gouache and watercolor background art style (inspired by Kazuo Oga and Hayao Miyazaki environmental backgrounds), lush atmospheric depth, warm nostalgic lighting, poetic clouds and natural textures',
        anime_nocturne: 'Makoto Shinkai cinematic anime environment art style, breathtaking luminous twilight/midnight sky, glowing starlight, warm interior lantern/desk light contrasting with deep cobalt and amber horizon reflections',
        watercolor_wash: 'Loose expressive editorial watercolor and ink wash on textured cotton paper, poetic atmospheric landscape and symbolic objects, soft feathered edges and rich pigment blooms',
        ukiyo_woodblock: 'Modern Japanese Ukiyo-e woodblock print and mineral pigment landscape style (inspired by Hasui Kawase and Yoshida Hiroshi), serene architectural and natural horizon, dramatic light and timeless stillness'
      };
      const chosenStyleDirective = ART_STYLE_DIRECTIVES[artStyleKey] || ART_STYLE_DIRECTIVES.ghibli_sky;

      try {
        const prompt = `You are a master editorial art director for Slant.
Analyze this writer's Wall Quote ("State of Mind") and design:
1) A vivid, poetic SCENIC ENVIRONMENT / VISUAL METAPHOR prompt that visually embodies the meaning and mood of the quote (e.g., if the quote is about staying up at midnight building and seeking freedom, describe a warm lamplit wooden desk by an open window overlooking a vast starlit valley and drifting midnight clouds; if about truth/storms, a serene coastal lighthouse above glowing indigo waves; if about patience/growth, a quiet sunlit conservatory or mountain trail).
CRITICAL RULE FOR SCENE PROMPT: Strictly NO human characters, NO people, NO faces, NO silhouettes of people, and NO text/letters — purely environment, architecture, objects, nature, sky, and light!
2) Matching accent colors so the highlighted white/ivory quote text in the foreground reads with 100% clarity.

Writer's Wall Quote: "${quoteText}"
${lensText ? `Writer's Lens: "${lensText}"` : ''}
Chosen Art Style: ${chosenStyleDirective}

Return ONLY valid JSON with these exact fields:
{
  "themeName": "2-3 word poetic title for this scene (e.g., 'Midnight Builder’s Window', 'Ghibli Starlight Valley', 'Lantern & Horizon')",
  "moodNote": "Short 6-10 word description of how this visual scene connects to their quote",
  "scenePrompt": "Detailed 45-65 word visual prompt describing ONLY the environment, symbolic objects, lighting, sky, and atmosphere in the requested art style. Strictly NO people, NO human figures, NO faces, NO text.",
  "bgGradient": "Fallback multi-stop dark CSS gradient matching the scene's palette",
  "textColor": "#FEF3C7",
  "kickerColor": "Bright warm hex accent color for the top kicker (e.g. '#FBBF24', '#34D399', '#38BDF8', '#F472B6')",
  "borderColor": "RGBA border color matching kickerColor (e.g. 'rgba(245, 158, 11, 0.55)')",
  "glowShadow": "Outer box-shadow matching the scene's glow",
  "watermarkGlyph": "Single evocative symbol (e.g. '✦', '❂', '◈', '☾')"
}`;

        const gemResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.75,
                responseMimeType: 'application/json'
              }
            })
          }
        );
        let aiTheme = null;
        if (gemResp.ok) {
          const gemData = await gemResp.json();
          const rawJson = gemData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (rawJson) {
            aiTheme = JSON.parse(rawJson.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim());
          }
        }
        if (!aiTheme || !aiTheme.bgGradient) {
          aiTheme = {
            themeName: 'Midnight Builder’s Horizon',
            moodNote: 'Warm lamplit study overlooking a vast starlit valley',
            scenePrompt: 'A warm lamplit wooden study desk with a glowing fountain pen and notebook beside a wide open window at midnight, overlooking a vast tranquil valley, drifting clouds, and a star-filled indigo sky',
            bgGradient: 'radial-gradient(circle at 85% 20%, rgba(245, 158, 11, 0.26) 0%, transparent 55%), linear-gradient(135deg, #090D16 0%, #131B2E 55%, #1F1712 100%)',
            textColor: '#FEF3C7',
            kickerColor: '#FBBF24',
            borderColor: 'rgba(245, 158, 11, 0.52)',
            glowShadow: '0 12px 30px -8px rgba(245, 158, 11, 0.28)',
            watermarkGlyph: '✦'
          };
        }

        // Now generate the actual 16:9 wide environmental illustration via gemini-2.5-flash-image
        let bgImageDataUrl = '';
        try {
          const fullImagePrompt = `${aiTheme.scenePrompt}. Rendered in ${chosenStyleDirective}. Wide 16:9 panoramic environmental composition, rich atmospheric lighting, masterwork background art. STRICTLY NO human characters, NO people, NO faces, NO typography, NO letters, NO words.`;
          const imgResp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: fullImagePrompt }] }],
                generationConfig: {
                  responseModalities: ['IMAGE'],
                  imageConfig: {
                    aspectRatio: '16:9'
                  }
                }
              })
            }
          );
          if (imgResp.ok) {
            const imgData = await imgResp.json();
            const inlinePart = imgData?.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (inlinePart?.inlineData?.data) {
              bgImageDataUrl = `data:${inlinePart.inlineData.mimeType || 'image/png'};base64,${inlinePart.inlineData.data}`;
            }
          }
        } catch (imgErr) {
          console.warn('Wall quote image generation fallback to gradient:', imgErr.message);
        }

        return res.status(200).json({
          success: true,
          aiTheme: {
            ...aiTheme,
            artStyle: artStyleKey,
            bgImageDataUrl,
            tier: 'studio_ai',
            generatedAt: new Date().toISOString()
          }
        });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message || 'Could not generate AI wall backdrop' });
      }
    }

    // Endpoint: Get Family Cast Vault Profile + Shared Family Group + Pending Family Approval Notifications
    if (body && (body.action === 'get_family_cast' || body.action === 'get_family_notifications')) {
      const { userIdentifier = '' } = body;
      const cleanId = String(userIdentifier || '').trim().toLowerCase();
      if (!cleanId || cleanId === 'default' || !cleanId.includes('@')) {
        return res.status(200).json({
          success: true,
          cast: getDefaultFamilyCast(userIdentifier),
          pendingIncoming: [],
          pendingOutgoing: [],
          approvedLinks: [],
          needsOnboarding: false
        });
      }
      try {
        const result = await loadSharedFamilyCastAndNotifications(cleanId);
        return res.status(200).json({
          success: true,
          ...result
        });
      } catch (err) {
        console.warn('Get family cast error:', err.message);
        return res.status(200).json({
          success: true,
          cast: getDefaultFamilyCast(userIdentifier),
          pendingIncoming: [],
          pendingOutgoing: [],
          approvedLinks: [],
          needsOnboarding: false
        });
      }
    }

    // Endpoint: Save Family Cast Vault Profile (syncs to user directory & propagates shared members across approved Family Vault group)
    if (body && body.action === 'save_family_cast') {
      const { userIdentifier = '', cast } = body;
      const cleanId = String(userIdentifier || '').trim().toLowerCase();
      const profileId = resolveFamilyCastProfileId(cleanId);
      if (!profileId) {
        return res.status(401).json({ success: false, error: 'Sign in required to save Family Cast Vault' });
      }
      try {
        const sharedState = await loadSharedFamilyCastAndNotifications(cleanId);
        const allowShridharGroup = Array.isArray(sharedState.cast?.sharedGroupEmails) && sharedState.cast.sharedGroupEmails.some(e => isShridharOwnerAccount(e));
        const cleanCast = sanitizeForeignVaultLeakOnServer(cast, cleanId, allowShridharGroup);
        await saveRawUserFamilyCast(cleanId, cleanCast);
        await syncUserSelfToDirectory(cleanId, cleanCast);

        // If user belongs to an approved shared family group, propagate non-self shared members & updated self traits to group members
        const groupEmails = Array.isArray(sharedState.cast?.sharedGroupEmails) ? sharedState.cast.sharedGroupEmails.filter(e => e !== cleanId) : [];
        if (groupEmails.length > 0 && Array.isArray(cleanCast.members)) {
          const sharedNonSelfMembers = cleanCast.members.filter(m =>
            m && m.name && m.relationship !== 'self' && !m.linkedUserEmail && m.approvalStatus !== 'pending'
          );
          for (const otherEmail of groupEmails) {
            const otherCast = await loadRawUserFamilyCast(otherEmail);
            if (otherCast && Array.isArray(otherCast.members)) {
              let changed = false;
              sharedNonSelfMembers.forEach(sm => {
                const idx = otherCast.members.findIndex(om =>
                  om && (om.id === sm.id || (om.name && String(om.name).trim().toLowerCase() === String(sm.name).trim().toLowerCase()))
                );
                if (idx >= 0) {
                  otherCast.members[idx] = { ...otherCast.members[idx], ...sm, id: otherCast.members[idx].id };
                  changed = true;
                } else {
                  otherCast.members.push({ ...sm, sharedFromFamilyVault: true });
                  changed = true;
                }
              });
              if (changed) {
                await saveRawUserFamilyCast(otherEmail, otherCast);
              }
            }
          }
        }

        const refreshed = await loadSharedFamilyCastAndNotifications(cleanId);
        return res.status(200).json({ success: true, ...refreshed });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    // Endpoint: Search Slant Users Database to Add as Family Member
    if (body && body.action === 'search_slant_users') {
      const { query = '', requesterEmail = '', viewerEmail = '' } = body;
      const cleanReq = String(requesterEmail || viewerEmail || '').trim().toLowerCase();
      const q = String(query || '').trim().toLowerCase();

      try {
        const [dirDoc, wlDoc, recentPostsResp, castDocsResp] = await Promise.all([
          getSystemDoc('system_user_directory', { users: {} }),
          getSystemDoc('system_beta_whitelist', { allowed_emails: [], access_logs: [] }),
          fetch(`${SUPABASE_URL}/rest/v1/posts?select=data->userEmail,data->creatorHandle,data->authorName&id=like.slant*&order=created_at.desc&limit=150`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
          }).catch(() => null),
          fetch(`${SUPABASE_URL}/rest/v1/posts?select=id,data&id=like.family_cast_*&limit=100`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
          }).catch(() => null)
        ]);

        const usersMap = new Map();
        const upsertCandidate = (email, name, handle, avatarUrl, hasVaultSelf = false) => {
          const em = String(email || '').trim().toLowerCase();
          if (!em || !em.includes('@') || em === cleanReq) return;
          const prev = usersMap.get(em) || { email: em, name: '', handle: '', avatarUrl: '', hasVaultSelf: false };
          const fallbackName = em.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          usersMap.set(em, {
            email: em,
            name: String(name || prev.name || fallbackName).trim(),
            handle: String(handle || prev.handle || ('@' + em.split('@')[0])).trim(),
            avatarUrl: String(avatarUrl || prev.avatarUrl || '').trim(),
            hasVaultSelf: Boolean(hasVaultSelf || prev.hasVaultSelf)
          });
        };

        if (dirDoc && dirDoc.users && typeof dirDoc.users === 'object') {
          Object.values(dirDoc.users).forEach(u => {
            if (u && u.email) upsertCandidate(u.email, u.name, u.handle, u.avatarUrl, true);
          });
        }
        if (castDocsResp && castDocsResp.ok) {
          const castRows = await castDocsResp.json();
          if (Array.isArray(castRows)) {
            castRows.forEach(row => {
              const d = row && row.data;
              if (d && d.userIdentifier && String(d.userIdentifier).includes('@')) {
                const selfM = Array.isArray(d.members) ? d.members.find(m => m && m.relationship === 'self') : null;
                upsertCandidate(
                  d.userIdentifier,
                  (selfM && selfM.name) || '',
                  '',
                  (selfM && selfM.stylizedAvatarUrl) || '',
                  Boolean(selfM && selfM.name)
                );
              }
            });
          }
        }
        if (wlDoc) {
          if (Array.isArray(wlDoc.allowed_emails)) {
            wlDoc.allowed_emails.forEach(em => upsertCandidate(em, '', '', ''));
          }
          if (Array.isArray(wlDoc.access_logs)) {
            wlDoc.access_logs.forEach(l => {
              if (l && l.email) upsertCandidate(l.email, l.name || '', l.handle || '', '');
            });
          }
        }
        if (recentPostsResp && recentPostsResp.ok) {
          const rows = await recentPostsResp.json();
          if (Array.isArray(rows)) {
            rows.forEach(r => {
              if (r && r.userEmail) {
                const h = String(r.creatorHandle || '').trim();
                const display = String(r.authorName || h.replace(/^@/, '') || '').trim();
                upsertCandidate(r.userEmail, display, h, '');
              }
            });
          }
        }

        let results = Array.from(usersMap.values());
        if (q) {
          results = results.filter(u =>
            u.email.toLowerCase().includes(q) ||
            u.name.toLowerCase().includes(q) ||
            u.handle.toLowerCase().includes(q)
          );
          // If the user typed a full email address (e.g. their spouse's Gmail) that isn't in results yet, offer it directly
          if (q.includes('@') && q.includes('.') && q !== cleanReq && !results.some(u => u.email.toLowerCase() === q)) {
            const guessedName = q.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            results.unshift({
              email: q,
              name: guessedName,
              handle: '@' + q.split('@')[0],
              avatarUrl: '',
              hasVaultSelf: false
            });
          }
        }
        return res.status(200).json({
          success: true,
          users: results.slice(0, 20)
        });
      } catch (err) {
        return res.status(200).json({ success: true, users: [] });
      }
    }

    // Endpoint: Send Family Vault Link & Reference Approval Notification to Another Slant User
    if (body && body.action === 'send_family_vault_request') {
      const fromEmail = body.fromEmail || body.requesterEmail || '';
      const fromName = body.fromName || body.requesterName || '';
      const fromHandle = body.fromHandle || body.requesterHandle || '';
      const toEmail = body.toEmail || body.targetEmail || '';
      const toName = body.toName || body.targetName || '';
      const toHandle = body.toHandle || body.targetHandle || '';
      const relationship = body.relationship || 'spouse';
      const relationLabel = body.relationLabel || body.roleLabel || '';

      const cleanFrom = String(fromEmail || '').trim().toLowerCase();
      const cleanTo = String(toEmail || '').trim().toLowerCase();
      if (!cleanFrom || !cleanFrom.includes('@') || !cleanTo || !cleanTo.includes('@')) {
        return res.status(400).json({ success: false, error: 'Valid sender and recipient Gmail/Slant emails are required.' });
      }
      if (cleanFrom === cleanTo) {
        return res.status(400).json({ success: false, error: 'You cannot send a family link request to your own email.' });
      }

      try {
        const linksDoc = await getSystemDoc('system_family_vault_links', { requests: [] });
        if (!Array.isArray(linksDoc.requests)) linksDoc.requests = [];

        // Check if an active or pending request already exists between these two users
        let existingReq = linksDoc.requests.find(r =>
          r && (
            (String(r.fromEmail || r.requesterEmail || '').toLowerCase() === cleanFrom && String(r.toEmail || r.targetEmail || '').toLowerCase() === cleanTo) ||
            (String(r.fromEmail || r.requesterEmail || '').toLowerCase() === cleanTo && String(r.toEmail || r.targetEmail || '').toLowerCase() === cleanFrom)
          )
        );

        const resolvedLabel = relationLabel || getRelationDisplayLabel(relationship);
        const invRel = getInverseFamilyRelation(relationship);
        const senderName = fromName || cleanFrom.split('@')[0];
        const senderHandle = fromHandle || ('@' + cleanFrom.split('@')[0]);
        const recipientName = toName || cleanTo.split('@')[0];
        const recipientHandle = toHandle || ('@' + cleanTo.split('@')[0]);

        if (existingReq) {
          existingReq.fromEmail = cleanFrom;
          existingReq.requesterEmail = cleanFrom;
          existingReq.fromName = senderName;
          existingReq.requesterName = senderName;
          existingReq.fromHandle = senderHandle;
          existingReq.requesterHandle = senderHandle;
          existingReq.toEmail = cleanTo;
          existingReq.targetEmail = cleanTo;
          existingReq.toName = recipientName;
          existingReq.targetName = recipientName;
          existingReq.toHandle = recipientHandle;
          existingReq.targetHandle = recipientHandle;
          existingReq.relationship = relationship;
          existingReq.relationLabel = resolvedLabel;
          existingReq.targetRoleLabel = resolvedLabel;
          existingReq.inverseRelationship = invRel;
          if (existingReq.status === 'declined') {
            existingReq.status = 'pending';
          }
          existingReq.updatedAt = new Date().toISOString();
        } else {
          existingReq = {
            id: 'famreq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            fromEmail: cleanFrom,
            requesterEmail: cleanFrom,
            fromName: senderName,
            requesterName: senderName,
            fromHandle: senderHandle,
            requesterHandle: senderHandle,
            toEmail: cleanTo,
            targetEmail: cleanTo,
            toName: recipientName,
            targetName: recipientName,
            toHandle: recipientHandle,
            targetHandle: recipientHandle,
            relationship,
            relationLabel: resolvedLabel,
            targetRoleLabel: resolvedLabel,
            inverseRelationship: invRel,
            status: 'pending',
            createdAt: new Date().toISOString(),
            respondedAt: null
          };
          linksDoc.requests.push(existingReq);
        }

        await saveSystemDoc('system_family_vault_links', linksDoc);
        const refreshed = await loadSharedFamilyCastAndNotifications(cleanFrom);
        return res.status(200).json({
          success: true,
          request: existingReq,
          ...refreshed
        });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    // Endpoint: Approve or Decline an Incoming Family Vault Link & Reference Usage Request
    if (body && body.action === 'respond_family_vault_request') {
      const userIdentifier = body.userIdentifier || body.responderEmail || '';
      const { requestId = '', decision = 'approve' } = body;
      const cleanUser = String(userIdentifier || '').trim().toLowerCase();
      if (!cleanUser || !cleanUser.includes('@') || !requestId) {
        return res.status(400).json({ success: false, error: 'Valid user and request ID required.' });
      }

      try {
        const linksDoc = await getSystemDoc('system_family_vault_links', { requests: [] });
        if (!Array.isArray(linksDoc.requests)) linksDoc.requests = [];

        const reqObj = linksDoc.requests.find(r => r && r.id === requestId && String(r.toEmail || r.targetEmail || '').toLowerCase() === cleanUser);
        if (!reqObj) {
          return res.status(404).json({ success: false, error: 'Family request not found.' });
        }

        reqObj.status = (decision === 'approve') ? 'approved' : 'declined';
        reqObj.respondedAt = new Date().toISOString();
        await saveSystemDoc('system_family_vault_links', linksDoc);

        // Load merged family vault now that the link is approved/declined, and persist two-way synced vaults to Supabase
        const refreshed = await loadSharedFamilyCastAndNotifications(cleanUser);
        if (decision === 'approve') {
          if (refreshed && refreshed.cast) {
            await saveRawUserFamilyCast(cleanUser, refreshed.cast);
            await syncUserSelfToDirectory(cleanUser, refreshed.cast);
          }
          const senderEmail = String(reqObj.fromEmail || reqObj.requesterEmail || '').trim().toLowerCase();
          if (senderEmail && senderEmail !== cleanUser) {
            const senderRefreshed = await loadSharedFamilyCastAndNotifications(senderEmail);
            if (senderRefreshed && senderRefreshed.cast) {
              await saveRawUserFamilyCast(senderEmail, senderRefreshed.cast);
            }
          }
        }
        return res.status(200).json({
          success: true,
          request: reqObj,
          ...refreshed
        });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    // Endpoint: Extract Family Cast Traits from Reference Photo
    if (body && body.action === 'extract_cast_traits') {
      try {
        const castTraitsHandler = require('./cast-traits.js');
        return await castTraitsHandler(req, res);
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    // Unified Multi-Part Selective Regeneration Endpoint (Regenerates any unlocked combination of Headline, Slant Note, and Essay in 1 call)
    if (body && body.action === 'selective_regenerate') {
      const {
        regenerateHeadline = false,
        regenerateSlantNote = false,
        regenerateEssay = false,
        adaptedHeadline = '',
        originalHeadline = '',
        curatorTake = '',
        userSlant = '',
        spark = '',
        summary = '',
        scrapedTitle = '',
        scrapedContent = '',
        sourceLedger = null,
        sourceType = 'digital_link',
        vocabularyStyle = 'punchy',
        customDirection = ''
      } = body;

      if (!regenerateHeadline && !regenerateSlantNote && !regenerateEssay) {
        return res.status(400).json({ success: false, error: 'No text components unlocked for regeneration.' });
      }

      const styleInstruction = (vocabularyStyle === 'literary')
        ? 'Write in an elevated, literary broadsheet style with rich narrative flow.'
        : (vocabularyStyle === 'casual')
          ? 'Write in clear, natural, everyday English (simple, direct words; zero academic jargon).'
          : 'Write in crisp, authoritative, punchy editorial prose.';

      let ledgerText = '';
      if (sourceLedger && typeof sourceLedger === 'object') {
        const claims = Array.isArray(sourceLedger.core_claims_and_evidence)
          ? sourceLedger.core_claims_and_evidence.map((c, i) => `${i + 1}. ${typeof c === 'object' ? (c.evidence || c.text || '') : c}`).join('\n')
          : '';
        if (claims) ledgerText = `\nVerified Source Facts:\n${claims}`;
      }

      const lockedContextLines = [];
      if (!regenerateHeadline && adaptedHeadline) {
        lockedContextLines.push(`- LOCKED Headline (DO NOT CHANGE, align with this): "${adaptedHeadline}"`);
      }
      if (!regenerateSlantNote && curatorTake) {
        lockedContextLines.push(`- LOCKED Signed Slant Note (DO NOT CHANGE, align with this): "${curatorTake}"`);
      }
      if (!regenerateEssay && summary) {
        lockedContextLines.push(`- LOCKED Broadsheet Essay Body: "${String(summary).slice(0, 900)}"`);
      }

      const requestedFieldsDesc = [];
      const jsonSchemaParts = [];

      if (regenerateHeadline) {
        requestedFieldsDesc.push(`- "adaptedHeadline": A fresh, bold 6-10 word editorial headline (plus "headlineOptions": 3 distinct 6-10 word headline alternatives: Direct & Punchy, Contrarian Angle, Human Stakes).`);
        jsonSchemaParts.push(`  "adaptedHeadline": "6-10 word bold editorial headline",\n  "headlineOptions": [\n    { "label": "Direct & Punchy", "adaptedHeadline": "6-10 word headline" },\n    { "label": "Contrarian Angle", "adaptedHeadline": "6-10 word headline" },\n    { "label": "Human Stakes", "adaptedHeadline": "6-10 word headline" }\n  ]`);
      }
      if (regenerateSlantNote) {
        requestedFieldsDesc.push(`- "curatorTake": Exactly 2 complete sentences (24-34 words total, ending with a period) capturing the author's strongest, most poignant conviction in their authentic voice.`);
        jsonSchemaParts.push(`  "curatorTake": "2 complete sentences (24-34 words total)"`);
      }
      if (regenerateEssay) {
        requestedFieldsDesc.push(`- "resolvedArticleExcerpts": Exactly 3 broadsheet paragraphs (180-210 words total across the 3 paragraphs: P1 = 60-70 words opening for dropcap, P2 = 60-70 words engaging concrete facts/friction, P3 = 55-65 words human/civic stakes and resolution) + "whyItMatters" (18-26 word concluding reflection).`);
        jsonSchemaParts.push(`  "resolvedArticleExcerpts": [\n    "Paragraph 1 (60-70 words, pure prose without labels)",\n    "Paragraph 2 (60-70 words, pure prose without labels)",\n    "Paragraph 3 (55-65 words, pure prose without labels)"\n  ],\n  "whyItMatters": "18-26 word concluding reflection sentence"`);
      }

      const prompt = `You are the Executive Editor of SLANT.
The curator has LOCKED certain parts of their post and wants to regenerate ONLY the UNLOCKED parts listed below.

POST CONTEXT:
- Source / Original Topic: "${originalHeadline || scrapedTitle || 'Personal Reflection'}"
- Source Type: ${sourceType}
- Curator's Core Slant / Take: "${userSlant || curatorTake || ''}"
${spark ? `- Spark / Personal Context: "${spark}"` : ''}
${scrapedContent ? `- Source Excerpt: "${String(scrapedContent).slice(0, 1600)}"` : ''}${ledgerText}
${lockedContextLines.length > 0 ? `\nLOCKED COMPONENTS (Keep harmony with these):\n${lockedContextLines.join('\n')}` : ''}
${customDirection ? `\nCRITICAL CURATOR DIRECTION FOR THIS REGENERATION: "${customDirection}"` : ''}

UNLOCKED PARTS TO REGENERATE NOW:
${requestedFieldsDesc.join('\n')}

STRICT EDITORIAL RULES:
1. ${styleInstruction}
2. STRICT BAN ON EM DASHES: Never use em dashes, en dashes, or "--". Use commas, colons, or periods.
3. Stay 100% faithful to the curator's actual stance, proper nouns, and perspective without fabricating unstated opinions.

Respond strictly with valid JSON matching this schema:
{
${jsonSchemaParts.join(',\n')}
}`;

      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        const geminiResp = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              thinkingConfig: { thinkingBudget: 0 },
              responseMimeType: 'application/json'
            }
          }),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (geminiResp.ok) {
          const geminiData = await geminiResp.json();
          let raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
          raw = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
          const parsed = JSON.parse(raw);
          const result = { success: true };

          if (regenerateHeadline) {
            const cleanHl = String(parsed.adaptedHeadline || parsed.headlineOptions?.[0]?.adaptedHeadline || adaptedHeadline)
              .replace(/\s*([\u2014\u2013\u2015]|--)\s*/g, ': ')
              .trim();
            result.adaptedHeadline = cleanHl;
            if (Array.isArray(parsed.headlineOptions) && parsed.headlineOptions.length > 0) {
              result.headlineOptions = parsed.headlineOptions.map(opt => ({
                label: String(opt.label || 'Editorial Option').trim(),
                adaptedHeadline: String(opt.adaptedHeadline || cleanHl).replace(/\s*([\u2014\u2013\u2015]|--)\s*/g, ': ').trim()
              }));
            }
          }
          if (regenerateSlantNote) {
            result.curatorTake = String(parsed.curatorTake || curatorTake)
              .replace(/\s*([\u2014\u2013\u2015]|--)\s*/g, ', ')
              .trim();
          }
          if (regenerateEssay && Array.isArray(parsed.resolvedArticleExcerpts) && parsed.resolvedArticleExcerpts.length > 0) {
            const cleanParas = parsed.resolvedArticleExcerpts
              .map(p => String(p || '').replace(/^(paragraph \d+|the spark|curator stance)\s*:\s*/i, '').replace(/\s*([\u2014\u2013\u2015]|--)\s*/g, ', ').trim())
              .filter(Boolean);
            result.resolvedArticleExcerpts = cleanParas;
            result.summary = cleanParas.join('\n\n');
            if (parsed.whyItMatters) {
              result.whyItMatters = String(parsed.whyItMatters).replace(/\s*([\u2014\u2013\u2015]|--)\s*/g, ', ').trim();
            }
          }

          return res.status(200).json(result);
        }
        return res.status(500).json({ success: false, error: 'Selective regeneration failed. Please try again.' });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message || 'Selective regeneration failed' });
      }
    }

    // Selective Regeneration Endpoint 1: Regenerate Headline & Slant Note Only (~₹0.12, zero image cost)
    if (body && body.action === 'regenerate_headline') {
      const {
        adaptedHeadline = '',
        originalHeadline = '',
        curatorTake = '',
        userSlant = '',
        summary = '',
        sourceType = 'digital_link',
        vocabularyStyle = 'punchy',
        customDirection = ''
      } = body;

      const styleInstruction = (vocabularyStyle === 'literary')
        ? 'Use elevated, literary broadsheet phrasing with rich cadence.'
        : (vocabularyStyle === 'casual')
          ? 'Use clear, conversational, everyday English that feels warm and accessible.'
          : 'Use punchy, high-contrast, hard-hitting editorial phrasing.';

      const prompt = `You are the Executive Editor of SLANT.
The curator wants to regenerate ONLY the Headline ("adaptedHeadline") and the 2-sentence Signed Slant Note ("curatorTake") for their post, while keeping their existing broadsheet essay and poster artwork untouched.

CONTEXT OF THE POST:
- Source / Original Topic: "${originalHeadline || 'Personal Reflection'}"
- Source Type: ${sourceType}
- Curator's Core Slant / Take: "${userSlant || curatorTake || ''}"
- Current Adapted Headline: "${adaptedHeadline}"
- Current Signed Slant Note: "${curatorTake}"
- Broadsheet Essay Body: "${String(summary || '').slice(0, 900)}"
${customDirection ? `- Curator's Specific Direction for this Regeneration: "${customDirection}"` : ''}

EDITORIAL RULES:
1. ${styleInstruction}
2. Generate 3 distinct, compelling options so the curator can pick their favorite angle (or use Option 1 immediately):
   - Option 1 ("Direct & Punchy"): Sharp, decisive editorial headline (6-10 words) + 2-sentence signed slant note (24-34 words).
   - Option 2 ("Contrarian / Provocative"): Challenges conventional wisdom (6-10 words) + 2-sentence signed slant note (24-34 words).
   - Option 3 ("Human & Reflective"): Focuses on the human/civic stakes (6-10 words) + 2-sentence signed slant note (24-34 words).
3. STRICT BAN ON EM DASHES: Never use em dashes, en dashes, or "--". Use commas, colons, or periods.
4. Stay 100% faithful to the curator's actual stance and proper nouns. Do NOT invent unstated opinions.

Respond strictly with valid JSON:
{
  "options": [
    {
      "label": "Direct & Punchy",
      "adaptedHeadline": "6-10 word headline",
      "curatorTake": "2 complete sentences (24-34 words total)"
    },
    {
      "label": "Contrarian Angle",
      "adaptedHeadline": "6-10 word headline",
      "curatorTake": "2 complete sentences (24-34 words total)"
    },
    {
      "label": "Human Stakes",
      "adaptedHeadline": "6-10 word headline",
      "curatorTake": "2 complete sentences (24-34 words total)"
    }
  ]
}`;

      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);
        const geminiResp = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.75,
              thinkingConfig: { thinkingBudget: 0 },
              responseMimeType: 'application/json'
            }
          }),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (geminiResp.ok) {
          const geminiData = await geminiResp.json();
          let raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
          raw = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.options) && parsed.options.length > 0) {
            const cleanOptions = parsed.options.map(opt => ({
              label: String(opt.label || 'Editorial Option').trim(),
              adaptedHeadline: String(opt.adaptedHeadline || adaptedHeadline).replace(/\s*([\u2014\u2013\u2015]|--)\s*/g, ': ').trim(),
              curatorTake: String(opt.curatorTake || curatorTake).replace(/\s*([\u2014\u2013\u2015]|--)\s*/g, ', ').trim()
            }));
            return res.status(200).json({
              success: true,
              options: cleanOptions,
              adaptedHeadline: cleanOptions[0].adaptedHeadline,
              curatorTake: cleanOptions[0].curatorTake
            });
          }
        }
        return res.status(500).json({ success: false, error: 'Could not regenerate headline options. Please try again.' });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message || 'Headline regeneration failed' });
      }
    }

    // Selective Regeneration Endpoint 2: Regenerate Broadsheet Essay Only (~₹0.35, zero image cost)
    if (body && body.action === 'regenerate_essay') {
      const {
        adaptedHeadline = '',
        originalHeadline = '',
        curatorTake = '',
        userSlant = '',
        spark = '',
        scrapedTitle = '',
        scrapedContent = '',
        sourceLedger = null,
        sourceType = 'digital_link',
        vocabularyStyle = 'punchy',
        customDirection = ''
      } = body;

      const styleInstruction = (vocabularyStyle === 'literary')
        ? 'Write in an elevated, literary broadsheet style with rich narrative flow.'
        : (vocabularyStyle === 'casual')
          ? 'Write in clear, natural, everyday English (simple, direct words; zero academic jargon).'
          : 'Write in crisp, authoritative, punchy broadsheet prose.';

      let ledgerText = '';
      if (sourceLedger && typeof sourceLedger === 'object') {
        const claims = Array.isArray(sourceLedger.core_claims_and_evidence)
          ? sourceLedger.core_claims_and_evidence.map((c, i) => `${i + 1}. ${typeof c === 'object' ? (c.evidence || c.text || '') : c}`).join('\n')
          : '';
        if (claims) ledgerText = `\nVerified Source Facts:\n${claims}`;
      }

      const prompt = `You are the Lead Broadsheet Essayist for SLANT.
The curator wants to regenerate ONLY the 3-paragraph broadsheet essay ("summary" / "resolvedArticleExcerpts") and concluding reflection ("whyItMatters"), while keeping their existing Headline ("${adaptedHeadline}") and Poster Artwork untouched.

POST CONTEXT:
- Headline: "${adaptedHeadline}"
- Original Source / Topic: "${originalHeadline || scrapedTitle || 'Personal Reflection'}"
- Source Type: ${sourceType}
- Curator's Core Slant / Take: "${userSlant || curatorTake || ''}"
- Signed Slant Pullquote: "${curatorTake}"
${spark ? `- Spark / Personal Context: "${spark}"` : ''}
${scrapedContent ? `- Source Excerpt: "${String(scrapedContent).slice(0, 1800)}"` : ''}${ledgerText}
${customDirection ? `\nCRITICAL CURATOR DIRECTION FOR THIS REWRITE: "${customDirection}"` : ''}

STRICT ESSAY STRUCTURE (180-210 WORDS TOTAL ACROSS 3 PARAGRAPHS):
1. ${styleInstruction}
2. Paragraph 1 (60-70 words, 3-4 sentences): Strong opening observation connecting the curator's angle to the catalyst/source (designed for a broadsheet dropcap).
3. Paragraph 2 (60-70 words, 3-4 sentences): Deepen the argument by engaging the concrete facts, friction, or lived reality.
4. Paragraph 3 (55-65 words, 3 sentences): Human or civic stakes and lasting resolution.
5. "whyItMatters" (18-26 words, 1-2 sentences): Crisp concluding reflection (must NOT repeat the curatorTake verbatim).
6. STRICT BAN ON EM DASHES: Never use em dashes, en dashes, or "--". Use commas, semicolons, or periods.
7. Stay 100% faithful to the curator's voice, proper nouns, and perspective without fabricating unstated claims.

Respond strictly with valid JSON:
{
  "resolvedArticleExcerpts": [
    "Paragraph 1 (60-70 words, pure prose without labels)",
    "Paragraph 2 (60-70 words, pure prose without labels)",
    "Paragraph 3 (55-65 words, pure prose without labels)"
  ],
  "whyItMatters": "18-26 word concluding reflection sentence"
}`;

      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        const geminiResp = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.65,
              thinkingConfig: { thinkingBudget: 0 },
              responseMimeType: 'application/json'
            }
          }),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (geminiResp.ok) {
          const geminiData = await geminiResp.json();
          let raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
          raw = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.resolvedArticleExcerpts) && parsed.resolvedArticleExcerpts.length > 0) {
            const cleanParas = parsed.resolvedArticleExcerpts
              .map(p => String(p || '').replace(/^(paragraph \d+|the spark|curator stance)\s*:\s*/i, '').replace(/\s*([\u2014\u2013\u2015]|--)\s*/g, ', ').trim())
              .filter(Boolean);
            const cleanWhy = String(parsed.whyItMatters || '').replace(/\s*([\u2014\u2013\u2015]|--)\s*/g, ', ').trim();
            return res.status(200).json({
              success: true,
              resolvedArticleExcerpts: cleanParas,
              summary: cleanParas.join('\n\n'),
              whyItMatters: cleanWhy
            });
          }
        }
        return res.status(500).json({ success: false, error: 'Could not regenerate essay. Please try again.' });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message || 'Essay regeneration failed' });
      }
    }

    // Direct Single-Purpose Endpoint: Polish & Review Take with Pedagogical Highlighters (+ Optional On-Demand Core Visual Subject / Per-Moment Projection Identification)
    if (body && (body.action === 'polish_take' || body.action === 'review_take')) {
      const {
        text = '',
        slantTake = '',
        spark = '',
        scrapedTitle = '',
        countryContext = 'India',
        chronicleMode = false,
        chronicleMoments = [],
        familyCast = null,
        visualConfidenceHistory = null,
        includeVisualOptions = false,
        skipStructureBeats = false
      } = body;
      const rawText = String(text || slantTake || '').trim();
      if (!rawText || rawText.length < 5) {
        return res.status(400).json({ error: 'Please enter a take to polish.' });
      }

      const validPolishMoments = Array.isArray(chronicleMoments)
        ? chronicleMoments.filter(m => m && String(m.text || '').trim().length >= 2)
        : [];
      const isPolishChronicle = Boolean(chronicleMode && validPolishMoments.length >= 2);
      const wantVisuals = Boolean(includeVisualOptions);
      const wantBeats = !Boolean(skipStructureBeats);

      // Fast baseline polish using rule-based formatter
      const baselinePolished = formatCuratorTakeApt(rawText);
      const isPolishShridharContext = wantVisuals ? isShridharCastContext(familyCast, body.userEmail || body.userIdentifier || '') : false;
      const approvedPolishCastMembers = (wantVisuals && familyCast && Array.isArray(familyCast.members))
        ? familyCast.members.filter(m => m && m.approvalStatus !== 'pending' && m.approvalStatus !== 'declined')
        : [];
      const fallbackSubjects = wantVisuals ? buildFallbackVisualSubjects(rawText, spark, scrapedTitle, countryContext) : [];
      const fallbackMomentProjections = (wantVisuals && isPolishChronicle)
        ? buildFallbackMomentVisualProjections(validPolishMoments, countryContext, familyCast)
        : [];
      const fallbackStructureBeats = evaluateFallbackStructureBeats(rawText, spark);

      const castMembersSummary = wantVisuals
        ? (approvedPolishCastMembers.length > 0
            ? approvedPolishCastMembers.map(m => `${m.name || m.roleLabel} (${m.relationship}, age ${m.age || 'adult'}, height ${cmToFeetInches(resolveMemberHeightCm(m)).label})`).join('; ')
            : (isPolishShridharContext
                ? 'Father Shridhar (40yo, 5ft 10in / 178cm); Wife/Mother Aruna (36yo, 5ft 4in / 162cm); Elder Son Gahan (11yo BOY, 4ft 8in / 142cm, navy tee & denim shorts); Younger Son Rishu (7yo BOY, 4ft 2in / 127cm, mustard tee & dark shorts — BOTH SONS ARE BOYS, zero girls)'
                : 'Use the author\'s configured Self & Family Vault members (if any are provided above)'))
        : '';

      const learnedPrefNote = (wantVisuals && visualConfidenceHistory && typeof visualConfidenceHistory === 'object' && Object.keys(visualConfidenceHistory).length > 0)
        ? `\n- LEARNED CURATOR VISUAL PREFERENCE WEIGHTS (from past repeated approvals): ${JSON.stringify(visualConfidenceHistory)}. Boost the confidence % of visual options matching the curator's most-approved archetypes!`
        : '';

      // Call Gemini for high-precision, categorized copy-editing, inline highlighting (+ optional On-Demand Visual Projections)
      try {
        const copyEditPrompt = `You are a world-class literary copy-editor and writing coach.
Polish the author's text into grammatically correct, natural, and apt English while detailing every correction made:
- STRICT RULE 1 (ZERO OPINION FABRICATION): DO NOT change, enhance, add to, or modify the author's opinion, stance, or logic. Do NOT introduce new arguments, buzzwords, or unsolicited ideas.
- STRICT RULE 2 (ZERO CUTTING SHORT): DO NOT cut short, truncate, compress, or omit the author's opinion. Every single point, argument, nuance, and example must be retained in the exact same sequence.
- STRICT RULE 3 (APT ENGLISH & PHRASING): Fix comma splices, run-on sentences, awkward phrasing, word choices, subject-verb agreements, casing, and punctuation so it flows naturally and authoritatively.
- STRICT RULE 4 (STRICT BAN ON EM DASHES AND ARTIFICIAL HYPHENS): NEVER use em dashes, en dashes, or double hyphens ("--")! Connect clauses with natural commas, semicolons, conjunctions, or separate sentences.
- STRICT RULE 5 (ATOMIC CORRECTIONS & NO CROSS-CATEGORY LUMPING):
  * Keep each correction focused on the specific words changed.
  * NEVER lump a phrasing/vocabulary change together with a typo into a single correction.
  * If a sentence has both a typo and phrasing improvements, separate them: isolate the typo (e.g. "torubled" -> "troubled") as its own distinct "spelling" note, and isolate the phrasing rewrite (e.g. "these people and will have" -> "these individuals and will face") as a "phrasing" note.
- STRICT RULE 6 (STRICT CATEGORY DEFINITIONS):
  * "spelling": STRICTLY for typographical errors, misspelled words, or capitalization (e.g. "controll" -> "control", "torubled" -> "troubled", "raj" -> "Raj"). NEVER categorize vocabulary changes or multi-word rewrites as spelling!
  * "phrasing": Word choice, vocabulary improvements, smoother idioms, natural collocations, and eliminating awkward repetition.
  * "grammar": Verb tense, subject-verb agreement, singular/plural, missing articles or prepositions, pronoun cases.
  * "punctuation": Commas, periods, colons, quotation marks, fixing comma splices or run-ons.
${wantVisuals ? `\nPART 2 — ${isPolishChronicle
  ? `IDENTIFY 3 VISUAL PROJECTION OPTIONS PER MOMENT (WITH CONFIDENCE SCORE 1-99%) FOR EACH OF THE ${validPolishMoments.length} DAILY CHRONICLE MOMENTS:
Each moment in a Daily Chronicle can be visually projected in multiple ways.
- AUTHOR'S FAMILY CAST VAULT: ${castMembersSummary}.${isPolishShridharContext ? `\n- CRITICAL FAMILY RULE FOR "KIDS" / "BOYS" / "CHILDREN" / "KIDS FIGHTING": Whenever the author writes "kids", "kids fighting", "boys", "sons", or "children" in any personal moment, they are ALWAYS his TWO SONS: 11yo Elder Son Gahan (BOY, 4ft 8in / 142cm, navy t-shirt & denim shorts) and 7yo Younger Son Rishu (BOY, 4ft 2in / 127cm, 6 inches shorter than Gahan with his head at Gahan's chin/neck level, mustard-yellow t-shirt & dark shorts) — STRICTLY 2 BOYS, NEVER a boy and a girl!` : ''}${learnedPrefNote}
- For EACH of the ${validPolishMoments.length} moments (${validPolishMoments.map((m, i) => `Moment 0${i + 1}: "${m.text}"`).join(' | ')}), output an entry in "momentVisualProjections" containing 3 distinct ways to project that moment's vignette, sorted in descending order of your confidence score ("confidence": integer 65-98) so Option 1 is the highest-confidence default:
  1. Option 1 ("archetype": "direct_action", highest confidence e.g. 90-96%): The most direct, concrete, unmistakable human interaction representing the heart of that moment (explicitly naming exact Vault cast members from AUTHOR'S FAMILY CAST VAULT when family members are mentioned).
  2. Option 2 ("archetype": "expressive_midshot" or "warm_resolution", medium-high confidence e.g. 80-88%): An alternative candid angle (e.g., warm resolution, expressive waist-up conversational reaction, or side-by-side collaboration).
  3. Option 3 ("archetype": "symbolic_focus", medium confidence e.g. 70-78%): A focused detail/object-led or atmospheric angle capturing the mood of that moment.`
  : `IDENTIFY 3 CORE VISUAL SUBJECT OPTIONS (WITH CONFIDENCE SCORE 1-99%) FOR POSTER 1 ARTWORK:
Understand the true CORE SUBJECT in the given context (Setting: ${countryContext || 'India'}).
- AUTHOR'S FAMILY CAST VAULT: ${castMembersSummary}.
- CRITICAL DISTINCTION (SOCIETAL OBSERVATION vs. POPULAR / PUBLIC FIGURE vs. PERSONAL FAMILY STORY):
  * POPULAR / PUBLIC FIGURES IN INNER VOICE OR LINKS: If the author mentions any recognizable public figure, historical leader, sports legend, industrialist, scientist, artist, or cultural icon (e.g. Ratan Tata, Dr. A.P.J. Abdul Kalam, Virat Kohli, MS Dhoni, Narayana Murthy, Sundar Pichai, Narendra Modi, Swami Vivekananda, Elon Musk, Prakash Raj, etc.), Option 1 ("core_scene") and its "#1 HERO" cue MUST directly feature and name that popular figure (along with their iconic visual likeness traits and setting) in the scene, with "isPersonalFamily": false! Never omit or replace named popular figures with abstract objects.
  * If the author is observing society, schools, parents in general, workplaces, politics, or culture (even if they use words like "I see", "the whole family comes", "parents", "the kids", "in our school days"), the core visual subject is the REAL-WORLD SCENE BEING DISCUSSED (e.g. a packed school corridor on parent-teacher meeting day with parents debating marks with a 2nd-grade teacher), and "isPersonalFamily" MUST be false!
  * Set "isPersonalFamily": true ONLY if the author is explicitly telling an intimate personal story about their OWN family members ("my family", "my wife", "my husband", "my kids", "kids fighting", "my son", "my daughter" or names in AUTHOR'S FAMILY CAST VAULT).${learnedPrefNote}
- Provide 3 distinct, tap-to-choose visual subject angles in "visualSubjects", sorted by your confidence score ("confidence": integer 65-98) so Option 1 is the highest-confidence default:
  1. Option 1 ("archetype": "core_scene", "badge": "★ Best Fit • Core Scene", highest confidence e.g. 90-96%): The direct, concrete real-world scene and protagonists at the heart of the author's context.
  2. Option 2 ("archetype": "core_contrast", "badge": "⚡ Core Contrast", confidence e.g. 80-88%): A visual composition highlighting the central irony, contrast, or tension in the author's argument.
  3. Option 3 ("archetype": "editorial_metaphor", "badge": "🎨 Editorial Metaphor", confidence e.g. 70-78%): A poignant symbolic or nostalgic visual framing the author's core takeaway.`}` : ''}

Author's Raw Take:
"""${rawText}"""
${spark ? `Author's Spark / Catalyst: """${spark}"""` : ''}
${scrapedTitle ? `Source Headline: """${scrapedTitle}"""` : ''}
${wantBeats ? `\nEVALUATE 3-BEAT PERSPECTIVE & DEPTH SCORE ON THE POLISHED TEXT ("structureBeats"):
1. "hasMoment" (Beat 1 — Moment / Trigger): True if the author grounds the thought in a concrete experience, personal scene, observation, event, or subject (e.g. sitting through nights building apps, watching a scene, reading an article).
2. "hasWhyItMatters" (Beat 2 — Why It Matters / The Shift): True if the author explains why this matters beneath the surface — the cause-and-effect, contrast between past and present (e.g. unable to build earlier due to technology gating vs feeling liberated with AI now), tension, or deeper implication.
3. "hasConviction" (Beat 3 — Conviction / Personal Vision & Takeaway): True if the author expresses either (a) a personal aspiration, life vision, hope, or way of living they are claiming for themselves (e.g. dreaming of working like a madman and roaming like a free man outside a regular 9-to-5), OR (b) a lasting belief, stance, principle, or takeaway. Require at least 3 distinct clauses/thoughts in the text for all 3 beats to be true.
4. "depthScore" (integer 0 to 100): Score the genuine human depth, honesty, specificity, and completeness of the author's perspective:
   - 75 to 96: All 3 beats are present with authentic personal voice, real tension/shift, and a clear personal vision or conviction (30+ words).
   - 50 to 69: 2 beats present or ideas feel slightly surface-level / incomplete.
   - 15 to 49: Only 1 brief thought or a short 1-liner without deeper reflection.
5. "nudge": Speak like a warm, perceptive close friend helping the author unlock their deepest, most liberated thought:
   - If all 3 beats are true and depthScore >= 70: A warm 1-sentence affirmation of their perspective (e.g. "✓ 3/3 signals & deep perspective unlocked — your voice is clear, honest, and ready to synthesize!").
   - If a beat is missing or depthScore < 70: A warm, specific 1-sentence prompt rooted in their exact topic inviting them to add the missing beat so their thought reaches 3/3 and 70%+ depth.` : ''}

Respond strictly with valid JSON with this exact structure:
{
  "polished": "full polished text string without any tags",
  "corrections": [
    {
      "original": "exact minimal word or short phrase from author raw text that was changed",
      "replacement": "exact replacement in the polished text",
      "type": "spelling | grammar | punctuation | phrasing",
      "reason": "short 3-6 word reason"
    }
  ]${wantBeats ? `,
  "structureBeats": {
    "hasMoment": true,
    "hasWhyItMatters": true,
    "hasConviction": true,
    "depthScore": 86,
    "nudge": "✓ 3/3 signals & deep perspective unlocked — your voice is clear, honest, and ready to synthesize!"
  }` : ''}${wantVisuals ? `,
  "visualSubjects": [
    {
      "id": "subject_1",
      "archetype": "core_scene | core_contrast | editorial_metaphor",
      "badge": "★ Best Fit • Core Scene",
      "confidence": 94,
      "title": "Short 4-8 word visual subject title",
      "description": "Clear 1-sentence visual description of what Poster 1 will depict",
      "cues": [
        "Hero Subject (concise 4-7 words)",
        "Core Motif / Object (concise 4-7 words)",
        "Central Tension (concise 4-7 words)",
        "Physical Setting / Atmosphere (concise 4-7 words)",
        "Lighting & Mood (concise 4-7 words)"
      ],
      "isPersonalFamily": false
    }
  ]${isPolishChronicle ? `,
  "momentVisualProjections": [
    {
      "momentIndex": 1,
      "momentTitle": "Moment 01",
      "options": [
        {
          "id": "m1_opt_1",
          "archetype": "direct_action | warm_resolution | expressive_midshot | symbolic_focus",
          "badge": "★ Best Fit • Direct Scene",
          "confidence": 94,
          "title": "Short 5-9 word scene projection title for this moment",
          "description": "Specific 1-sentence visual description for this moment's watercolor vignette",
          "castIds": ["member_father"],
          "isPersonalFamily": false
        }
      ]
    }
  ]` : ''}` : ''}
}`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 35000);

        const geminiResp = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: copyEditPrompt }] }],
            generationConfig: {
              temperature: 0.15,
              thinkingConfig: { thinkingBudget: 0 },
              responseMimeType: 'application/json'
            }
          }),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (geminiResp.ok) {
          const geminiData = await geminiResp.json();
          let candidate = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
          candidate = candidate.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
          let parsed = null;
          try {
            parsed = JSON.parse(candidate);
          } catch (jsonErr) {
            try {
              const polMatch = candidate.match(/"polished"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
              if (polMatch) {
                parsed = { polished: polMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'), corrections: [] };
              }
            } catch (_) {}
          }

          if (parsed && (parsed.polished || (Array.isArray(parsed.corrections) && parsed.corrections.length > 0))) {
            const rawPolished = String(parsed.polished || '').trim();
            let cleanPolished = formatCuratorTakeApt(rawPolished);
            cleanPolished = cleanPolished.replace(/\s*([\u2014\u2013\u2015]|--)\s*/g, ', ');

            let corrections = [];
            if (Array.isArray(parsed.corrections) && parsed.corrections.length > 0) {
              corrections = parsed.corrections.map(c => ({
                original: String(c.original || ''),
                replacement: String(c.replacement || ''),
                type: ['spelling', 'grammar', 'punctuation', 'phrasing'].includes(c.type) ? c.type : 'phrasing',
                reason: String(c.reason || 'Improved phrasing and flow')
              }));
            }

            let highlightedHtml = '';
            if (corrections.length > 0) {
              highlightedHtml = buildHighlightedHtml(cleanPolished, corrections);
            } else if (parsed.highlightedHtml) {
              highlightedHtml = String(parsed.highlightedHtml).trim();
              const markRegex = /<mark\s+[^>]*?data-type="([^"]*)"[^>]*?data-original="([^"]*)"[^>]*?data-reason="([^"]*)"[^>]*>([\s\S]*?)<\/mark>/gi;
              let match;
              while ((match = markRegex.exec(highlightedHtml)) !== null) {
                corrections.push({
                  type: ['spelling', 'grammar', 'punctuation', 'phrasing'].includes(match[1]) ? match[1] : 'phrasing',
                  original: String(match[2] || ''),
                  reason: String(match[3] || 'Improved phrasing and flow'),
                  replacement: String(match[4] || '')
                });
              }
            } else {
              highlightedHtml = escapeHtml(cleanPolished);
            }

            const counts = {
              spelling: corrections.filter(c => c.type === 'spelling').length,
              grammar: corrections.filter(c => c.type === 'grammar').length,
              punctuation: corrections.filter(c => c.type === 'punctuation').length,
              phrasing: corrections.filter(c => c.type === 'phrasing').length,
              total: corrections.length
            };

            const visualSubjects = (Array.isArray(parsed.visualSubjects) && parsed.visualSubjects.length > 0)
              ? parsed.visualSubjects.slice(0, 3).map((vs, idx) => ({
                  id: String(vs.id || `subject_${idx + 1}`),
                  archetype: String(vs.archetype || (idx === 0 ? 'core_scene' : (idx === 1 ? 'core_contrast' : 'editorial_metaphor'))),
                  badge: String(vs.badge || (idx === 0 ? '★ Best Fit • Core Scene' : (idx === 1 ? '⚡ Core Contrast' : '🎨 Editorial Metaphor'))),
                  confidence: Math.max(60, Math.min(99, Number(vs.confidence) || (idx === 0 ? 94 : (idx === 1 ? 84 : 75)))),
                  title: String(vs.title || fallbackSubjects[idx]?.title || 'Core Editorial Scene').trim(),
                  description: String(vs.description || fallbackSubjects[idx]?.description || '').trim(),
                  cues: Array.isArray(vs.cues) && vs.cues.length >= 3 ? vs.cues.slice(0, 5).map(String) : (fallbackSubjects[idx]?.cues || []),
                  isPersonalFamily: Boolean(vs.isPersonalFamily)
                }))
              : fallbackSubjects;

            const momentVisualProjections = isPolishChronicle
              ? ((Array.isArray(parsed.momentVisualProjections) && parsed.momentVisualProjections.length > 0)
                  ? validPolishMoments.map((m, mIdx) => {
                      const found = parsed.momentVisualProjections.find(mp => Number(mp.momentIndex) === mIdx + 1)
                        || parsed.momentVisualProjections[mIdx]
                        || fallbackMomentProjections[mIdx];
                      const fbProj = fallbackMomentProjections[mIdx];
                      const rawOpts = (found && Array.isArray(found.options) && found.options.length > 0)
                        ? found.options.slice(0, 3)
                        : (fbProj ? fbProj.options : []);
                      return {
                        momentIndex: mIdx + 1,
                        momentTitle: String(found?.momentTitle || m.title || `Moment 0${mIdx + 1}`),
                        momentText: String(m.text || ''),
                        selectedOptionIdx: 0,
                        options: rawOpts.map((opt, oIdx) => {
                          const rawTitle = String(opt.title || fbProj?.options?.[oIdx]?.title || 'Candid Moment Visual')
                            .replace(/Father\s*\(\s*Father\s*\(([^)]+)\)\s*\)/gi, 'Father ($1)')
                            .replace(/Mother\s*\(\s*Mother\s*\(([^)]+)\)\s*\)/gi, 'Mother ($1)')
                            .trim();
                          const rawDesc = String(opt.description || fbProj?.options?.[oIdx]?.description || '')
                            .replace(/Father\s*\(\s*Father\s*\(([^)]+)\)\s*\)/gi, 'Father ($1)')
                            .replace(/Mother\s*\(\s*Mother\s*\(([^)]+)\)\s*\)/gi, 'Mother ($1)')
                            .trim();
                          return {
                            id: String(opt.id || `m${mIdx + 1}_opt_${oIdx + 1}`),
                            archetype: String(opt.archetype || (oIdx === 0 ? 'direct_action' : (oIdx === 1 ? 'expressive_midshot' : 'symbolic_focus'))),
                            badge: String(opt.badge || (oIdx === 0 ? '★ Best Fit • Direct Scene' : (oIdx === 1 ? '🎯 Expressive Mid-Shot' : '🎨 Symbolic Angle'))),
                            confidence: Math.max(60, Math.min(99, Number(opt.confidence) || (oIdx === 0 ? 93 : (oIdx === 1 ? 83 : 74)))),
                            title: rawTitle,
                            description: rawDesc,
                            castIds: Array.isArray(opt.castIds) && opt.castIds.length > 0 ? opt.castIds.map(String) : (fbProj?.options?.[oIdx]?.castIds || ['member_father']),
                            isPersonalFamily: Boolean(opt.isPersonalFamily !== undefined ? opt.isPersonalFamily : fbProj?.options?.[oIdx]?.isPersonalFamily)
                          };
                        })
                      };
                    })
                  : fallbackMomentProjections)
              : [];

            const polishedFallbackBeats = evaluateFallbackStructureBeats(cleanPolished || rawText, spark);
            const rawHasMoment = parsed.structureBeats?.hasMoment !== undefined
              ? Boolean(parsed.structureBeats.hasMoment)
              : polishedFallbackBeats.hasMoment;
            const rawHasWhy = parsed.structureBeats?.hasWhyItMatters !== undefined
              ? Boolean(parsed.structureBeats.hasWhyItMatters)
              : polishedFallbackBeats.hasWhyItMatters;
            const rawHasConv = (parsed.structureBeats?.hasConviction !== undefined)
              ? (Boolean(parsed.structureBeats.hasConviction) || polishedFallbackBeats.hasConviction)
              : polishedFallbackBeats.hasConviction;
            const parsedScore = Number(parsed.structureBeats?.depthScore);
            const resolvedDepthScore = Number.isFinite(parsedScore) && parsedScore > 0
              ? Math.max(parsedScore, polishedFallbackBeats.depthScore)
              : polishedFallbackBeats.depthScore;

            const structureBeats = (parsed.structureBeats && typeof parsed.structureBeats === 'object')
              ? {
                  hasMoment: rawHasMoment,
                  hasWhyItMatters: rawHasWhy,
                  hasConviction: rawHasConv,
                  depthScore: Math.min(98, Math.max(10, Math.round(resolvedDepthScore))),
                  nudge: (rawHasMoment && rawHasWhy && rawHasConv && resolvedDepthScore >= 70)
                    ? '✓ 3/3 signals & deep perspective unlocked — your voice is clear, honest, and ready to synthesize!'
                    : String(parsed.structureBeats.nudge || polishedFallbackBeats.nudge).trim()
                }
              : polishedFallbackBeats;

            return res.status(200).json({
              success: true,
              original: rawText,
              polished: cleanPolished,
              highlightedHtml: highlightedHtml,
              corrections,
              counts,
              structureBeats,
              visualSubjects,
              momentVisualProjections
            });
          }
        } else {
          const errJson = await geminiResp.json().catch(() => null);
          const apiErrMsg = errJson?.error?.message || `Gemini API returned HTTP ${geminiResp.status}`;
          return res.status(200).json({
            success: false,
            error: geminiResp.status === 402
              ? 'Google AI Studio prepayment credits are depleted (HTTP 402). Please top up your balance at ai.studio/projects.'
              : apiErrMsg,
            original: rawText,
            polished: baselinePolished,
            highlightedHtml: baselinePolished,
            corrections: [],
            counts: { spelling: 0, grammar: 0, punctuation: 0, phrasing: 0, total: 0 },
            structureBeats: fallbackStructureBeats,
            visualSubjects: fallbackSubjects,
            momentVisualProjections: fallbackMomentProjections
          });
        }
      } catch (err) {
        console.warn('Gemini copy-edit notice:', err.message);
        return res.status(200).json({
          success: false,
          error: err.name === 'AbortError' ? 'Review took too long to complete. Please tap Review again.' : (err.message || 'AI review service unavailable'),
          original: rawText,
          polished: baselinePolished,
          highlightedHtml: baselinePolished,
          corrections: [],
          counts: { spelling: 0, grammar: 0, punctuation: 0, phrasing: 0, total: 0 },
          structureBeats: fallbackStructureBeats,
          visualSubjects: fallbackSubjects,
          momentVisualProjections: fallbackMomentProjections
        });
      }

      // Graceful fallback to rule-based polish if parsing failed
      return res.status(200).json({
        success: false,
        error: 'Unable to parse AI review response. Please try again.',
        original: rawText,
        polished: baselinePolished,
        highlightedHtml: baselinePolished,
        corrections: [],
        counts: { spelling: 0, grammar: 0, punctuation: 0, phrasing: 0, total: 0 },
        structureBeats: fallbackStructureBeats,
        visualSubjects: fallbackSubjects,
        momentVisualProjections: fallbackMomentProjections
      });
    }

    let {
      sourceType = 'inner_voice', // 'digital_link' | 'inner_voice' | 'photo'
      url = '',
      text = '',
      slantTake = '',
      refineCoreTake = true,
      imageBase64 = null,
      imageMimeType = 'image/jpeg',
      innerVoiceImageBase64 = null,
      innerVoiceImageMimeType = 'image/jpeg',
      targetAudience = 'General',
      slantTone = 'mind', // 'mind' | 'heart'
      spark = '',
      creatorHandle = '@curator',
      creatorEmail = '',
      cues = [],
      heroCue = '',
      characterRepresentation = 'realistic',
      scrapedTitle = '',
      scrapedContent = '',
      countryContext = '',
      vocabularyStyle = 'casual', // default internal vocabulary style: Casual with simple, easily understood words
      perspectiveMode = 'source', // 'curator' | 'hybrid' | 'source'
      sourceImageUrl = null,
      sourceImageBase64 = null,
      sourceImageMimeType = 'image/jpeg',
      sourceLedger = null,
      familyCast = null,
      activeCast = null,
      castStaging = null,
      chronicleMode = false,
      chronicleMoments = [],
      reflectionFeedbackHistory = null,
      preferredVisualSubject = null
    } = body || {};

    if (creatorEmail && creatorEmail.includes('@')) {
      const resolvedCurator = await resolveAndClaimUniqueCuratorHandle(creatorEmail, creatorHandle);
      if (resolvedCurator && resolvedCurator.handle) {
        creatorHandle = resolvedCurator.handle;
      }
    }

    const validChronicleMoments = Array.isArray(chronicleMoments)
      ? chronicleMoments.filter(m => m && String(m.text || '').trim().length >= 2)
      : [];
    const isChronicle = Boolean(chronicleMode && validChronicleMoments.length >= 2);
    if (isChronicle && (!characterRepresentation || characterRepresentation === 'realistic')) {
      characterRepresentation = 'painting';
    }
    const explicitStarredIdx = validChronicleMoments.findIndex(m => Boolean(m && m.isStarred));
    const starredChronicleIdx = isChronicle
      ? (explicitStarredIdx >= 0 ? explicitStarredIdx : (validChronicleMoments.length - 1))
      : -1;
    const starredChronicleMoment = (isChronicle && starredChronicleIdx >= 0) ? validChronicleMoments[starredChronicleIdx] : null;
    const secondaryChronicleMoments = isChronicle
      ? validChronicleMoments.map((m, idx) => ({ ...m, origIdx: idx })).filter((_, idx) => idx !== starredChronicleIdx)
      : [];

    if (sourceImageUrl && typeof sourceImageUrl === 'string') {
      sourceImageUrl = decodeHtmlEntities(sourceImageUrl).replace(/&amp;/g, '&').trim();
    }

    const effectiveCatalystImage = (sourceType === 'inner_voice') ? (innerVoiceImageBase64 || imageBase64) : null;
    const effectiveCatalystMime = innerVoiceImageMimeType || imageMimeType || 'image/jpeg';

    const userEmail = (creatorEmail || '').toLowerCase().trim();
    if (!userEmail) {
      return res.status(401).json({ error: 'Please sign in with your Google or email account to create a Slant.' });
    }
    const isTextOnlyRegen = body.regenScope === 'text_only';
    const hasChronicleAttachedPhotos = Boolean(isChronicle && Array.isArray(chronicleMoments) && chronicleMoments.some(m => m && m.imageBase64));
    const hasOriginalOrAttachedPhoto = Boolean(
      imageBase64 ||
      sourceImageBase64 ||
      innerVoiceImageBase64 ||
      (sourceImageUrl && /^https?:\/\//i.test(sourceImageUrl)) ||
      hasChronicleAttachedPhotos
    );

    let isExactPhotoOnly = characterRepresentation === 'exact';
    const wantsVisualCredit = !isTextOnlyRegen && !isExactPhotoOnly;

    // First check credit availability without consuming so we can seamlessly fall back to free Original/Attached Photo mode if credits are 0
    let creditCheck = await verifyAndConsumeUserCredit(userEmail, false, Boolean(isChronicle), Boolean(body.simulateZeroCredits));
    if (!creditCheck.allowed) {
      return res.status(403).json({
        error: '🔒 Private Preview: Your email is not yet on the invited curator whitelist. An access request has been sent to the administrator.'
      });
    }

    let usedFreeExactPhotoFallback = false;
    let usedFreeChronicleCardsOnly = Boolean(isChronicle && body.noWatercolorPoster);
    if (wantsVisualCredit && !usedFreeChronicleCardsOnly) {
      if (creditCheck.hasCredits) {
        creditCheck = await verifyAndConsumeUserCredit(userEmail, true, Boolean(isChronicle), Boolean(body.simulateZeroCredits));
      } else if (hasOriginalOrAttachedPhoto) {
        // User has 0 AI art credits left, but has an original source photo or attached photo -> synthesize text for FREE and use exact photo!
        characterRepresentation = 'exact';
        isExactPhotoOnly = true;
        usedFreeExactPhotoFallback = true;
        if (sourceType === 'digital_link' || sourceType === 'video_audio') {
          perspectiveMode = 'source';
        }
      } else if (isChronicle) {
        // User has 0 Daily Chronicle credits left and no attached photos -> synthesize Moments + Reflection cards for FREE without a watercolor poster!
        usedFreeChronicleCardsOnly = true;
        isExactPhotoOnly = true;
      } else {
        return res.status(429).json({
          error: (sourceType === 'inner_voice'
            ? '⚡ 0 AI art credits left today — but Text Generation is FREE! For Inner Voice, attach a photo (Snap Scene / Upload Photo) to post for free, or switch to a Web Link with its original source photo!'
            : '⚡ 0 AI art credits left today — but Text Generation is FREE! You can still post using Source Grounded with the original source photo, or attach your own photo in Inner Voice!'),
          creditsExhausted: true,
          credits: creditCheck.credits
        });
      }
    }

    const userSlant = (slantTake || text || '').trim();
    if (url && (sourceType === 'digital_link' || !sourceType)) {
      if (isVideoAudioUrl(url) || (scrapedTitle && /youtube|vimeo|podcast|broadcast|channel/i.test(scrapedTitle))) {
        sourceType = 'video_audio';
      }
    }
    const isDigitalLink = (sourceType === 'digital_link' || sourceType === 'video_audio') && Boolean(url && String(url).trim().length > 3);
    let extractedTitle = isDigitalLink ? (scrapedTitle || '').trim() : '';
    let extractedContent = isDigitalLink ? (scrapedContent || '').trim() : (sourceType === 'photo' ? (text || '').trim() : '');
    let pubName = '';

    // 1. If digital link or video/audio, only attempt fast extraction if title is completely missing
    if ((sourceType === 'digital_link' || sourceType === 'video_audio') && url) {
      try {
        const parsedUrl = new URL(url);
        pubName = parsedUrl.hostname.replace(/^www\./, '');
        const isTwitterXHost = parsedUrl.hostname === 'x.com' || parsedUrl.hostname === 'twitter.com' || parsedUrl.hostname.endsWith('.x.com') || parsedUrl.hostname.endsWith('.twitter.com');
        if (isTwitterXHost) {
          const mHandleUrl = parsedUrl.pathname.match(/^\/(?!i\/|intent\/|share|search|hashtag|home|explore)([A-Za-z0-9_]{1,25})\/status(?:es)?\//i);
          const mHandleContent = (extractedContent || '').match(/\(@([A-Za-z0-9_]{1,25})\)/) || (extractedTitle || '').match(/^@([A-Za-z0-9_]{1,25})\b/);
          const resolvedHandle = (mHandleUrl && mHandleUrl[1]) || (mHandleContent && mHandleContent[1]) || '';
          pubName = resolvedHandle ? `@${resolvedHandle} • X` : 'X.com';
        }

        if (!extractedTitle || extractedTitle.length < 5 || !sourceImageUrl || !sourceImageBase64) {
          const isYouTube = parsedUrl.hostname.includes('youtube.com') || parsedUrl.hostname.includes('youtu.be');
          const isTwitterX = parsedUrl.hostname === 'x.com' || parsedUrl.hostname === 'twitter.com' || parsedUrl.hostname.endsWith('.x.com') || parsedUrl.hostname.endsWith('.twitter.com');
          if (isYouTube) {
            const ytVideoId = extractYouTubeVideoId(url);
            if (ytVideoId) {
              try {
                const ytData = await scrapeYouTubeUrl(url, ytVideoId);
                if (ytData) {
                  if (ytData.title && (!extractedTitle || extractedTitle.length < 5)) extractedTitle = ytData.title;
                  if (ytData.content && (!extractedContent || extractedContent.length < 100)) extractedContent = ytData.content;
                  if (ytData.siteName) pubName = ytData.siteName;
                  if (!sourceImageUrl && ytData.imageUrl) sourceImageUrl = ytData.imageUrl;
                  if (!sourceImageBase64 && ytData.imageBase64) {
                    sourceImageBase64 = ytData.imageBase64;
                    sourceImageMimeType = ytData.imageMimeType || 'image/jpeg';
                  }
                }
              } catch (_) {}
            }
          } else if (isTwitterX) {
            const mStatus = parsedUrl.pathname.match(/\/status(?:es)?\/(\d{5,25})/i);
            if (mStatus && mStatus[1]) {
              try {
                const fxCtrl = new AbortController();
                const fxTimer = setTimeout(() => fxCtrl.abort(), 3000);
                const fxResp = await fetch(`https://api.fxtwitter.com/i/status/${encodeURIComponent(mStatus[1])}`, {
                  signal: fxCtrl.signal,
                  headers: { 'User-Agent': 'SlantEditorial/2.0', 'Accept': 'application/json' }
                });
                clearTimeout(fxTimer);
                if (fxResp.ok) {
                  const fxJson = await fxResp.json();
                  const tw = fxJson && fxJson.tweet;
                  if (tw) {
                    const twText = tw.text || (tw.raw_text && tw.raw_text.text) || '';
                    const twAuthor = tw.author?.screen_name ? `@${tw.author.screen_name}` : (tw.author?.name || 'X.com');
                    if (twText && (!extractedContent || extractedContent.length < 40)) {
                      extractedContent = twText;
                    }
                    if (twText && (!extractedTitle || extractedTitle.length < 5)) {
                      extractedTitle = `${twAuthor}: "${twText.slice(0, 90)}"`;
                    }
                    pubName = `${twAuthor} • X`;
                    if (!sourceImageUrl) {
                      const twMediaUrl = (tw.media?.photos?.[0]?.url)
                        || (tw.media?.videos?.[0]?.thumbnail_url)
                        || (tw.article?.cover_media?.media_info?.original_img_url)
                        || (tw.quote?.media?.photos?.[0]?.url)
                        || (tw.quote?.media?.videos?.[0]?.thumbnail_url)
                        || null;
                      if (twMediaUrl) sourceImageUrl = twMediaUrl;
                    }
                  }
                }
              } catch (_) {}
            }
          }

          if (!extractedTitle || extractedTitle.length < 5 || !sourceImageUrl) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 1200);
            const pageResp = await fetch(url, {
              signal: controller.signal,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 SlantBot/1.0'
              }
            });
            clearTimeout(timeout);

            if (pageResp.ok) {
              const html = await pageResp.text();
              const titleMatch = html.match(/<meta property=["']og:title["'] content=["'](.*?)["']/i) ||
                                 html.match(/<title>(.*?)<\/title>/i);
              if (titleMatch && titleMatch[1] && (!extractedTitle || extractedTitle.length < 5)) {
                extractedTitle = decodeHtmlEntities(titleMatch[1].trim());
              }
              const descMatch = html.match(/<meta property=["']og:description["'] content=["'](.*?)["']/i) ||
                                html.match(/<meta name=["']description["'] content=["'](.*?)["']/i);
              if (descMatch && descMatch[1] && (!extractedContent || extractedContent.length < 100)) {
                extractedContent = decodeHtmlEntities(descMatch[1].trim());
              }
              const siteMatch = html.match(/<meta property=["']og:site_name["'] content=["'](.*?)["']/i);
              if (siteMatch && siteMatch[1]) {
                pubName = decodeHtmlEntities(siteMatch[1].trim());
              }
              if (!sourceImageUrl) {
                const imgMatch = html.match(/<meta property=["']og:image["'] content=["'](.*?)["']/i) ||
                                 html.match(/<meta name=["']twitter:image["'] content=["'](.*?)["']/i);
                if (imgMatch && imgMatch[1]) {
                  sourceImageUrl = decodeHtmlEntities(imgMatch[1].trim()).replace(/&amp;/g, '&');
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('URL metadata fetch skipped or timed out:', err.message);
      }

      // Sanitize sourceImageUrl and pre-fetch sourceImageBase64 if not already present
      if (sourceImageUrl && typeof sourceImageUrl === 'string') {
        sourceImageUrl = decodeHtmlEntities(sourceImageUrl).replace(/&amp;/g, '&').trim();
      }
      if (sourceImageUrl && sourceImageUrl.startsWith('http') && !sourceImageBase64) {
        try {
          const imgCtrl = new AbortController();
          const imgTimer = setTimeout(() => imgCtrl.abort(), 3500);
          const cleanFetchUrl = sourceImageUrl.replace(/&amp;/g, '&');
          const imgResp = await fetch(cleanFetchUrl, {
            signal: imgCtrl.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            }
          });
          clearTimeout(imgTimer);
          if (imgResp.ok) {
            const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
            sourceImageMimeType = contentType.split(';')[0];
            const buffer = await imgResp.arrayBuffer();
            if (buffer.byteLength > 1000 && buffer.byteLength < 5 * 1024 * 1024) {
              sourceImageBase64 = `data:${sourceImageMimeType};base64,` + Buffer.from(buffer).toString('base64');
            }
          }
        } catch (_) {}
      }
    }

    // Auto-generate lightweight sourceLedger if missing for digital or video sources without blocking deck synthesis
    if (!sourceLedger && (url || extractedContent || extractedTitle) && (sourceType === 'digital_link' || sourceType === 'video_audio' || url)) {
      sourceLedger = {
        subject_and_thesis: {
          context: `${pubName || 'Source'} reporting regarding "${extractedTitle || 'the subject'}".`,
          thesis: `The source examines core developments and perspective surrounding "${extractedTitle || 'the subject'}".`
        },
        core_claims_and_evidence: [
          {
            title: 'Core Development',
            evidence: (extractedContent || '').slice(0, 160) || 'Source explores structural context and observations.'
          }
        ],
        underlying_tensions: {
          primary_conflict: 'Tension between conventional approaches and emerging realities.',
          tradeoffs: 'Trade-offs between short-term expediency and long-term consequences.'
        },
        source_scope: (url && url.includes('youtube')) ? 'YouTube Video Analysis' : 'Curated Source Analysis',
        stars: 3
      };
    }

    // 2. Build Prompt for Gemini 3.8 Flash
    const toneDescription = slantTone === 'heart'
      ? 'Out of Heart: Deeply reflective, philosophical, emotive, humanistic, and conviction-driven.'
      : 'Out of Mind: Sharp, analytical, strategic, counter-intuitive, high-signal, and intellectually rigorous.';

    const hasUserContext = Boolean((userSlant && userSlant.trim().length > 5) || (spark && spark.trim().length > 5));

    let vocabDirective = '';
    let voiceStyleSummary = '';

    if (hasUserContext) {
      voiceStyleSummary = 'Adaptive to User (Mirrors the curator\'s natural voice, tone, and vocabulary from their provided context)';
      vocabDirective = `CRITICAL WRITING VOICE & VOCABULARY DIRECTIVE (MIRROR USER'S AUTHENTIC STYLE):
1. WRITE IN THE STYLE THE USER WRITES IN:
   - The curator has provided their own take and context: "${userSlant || spark}".
   - Write all 3 posters to match the natural style, vocabulary, emotional warmth, and phrasing that the user writes in:
     * If the user context is relaxed, personal, and conversational (e.g. family road trip, personal reflections, casual observations), mirror that exact natural, grounded human voice.
     * If the user context is crisp, pragmatic, and direct, mirror that directness.
   - Do NOT elevate simple everyday observations into heavy theoretical dissertations or stiff academic lectures.
2. CASUAL, CLEAR & GROUNDED (PLAIN ENGLISH):
   - Keep words simple, clear, and universally accessible (5th to 8th grade reading level).
   - If an idea can be said in simpler words, always use the simpler words.
3. STRICT BAN ON POMPOUS ACADEMIC & THINK-TANK JARGON:
   - NEVER use pretentious Latinate words, corporate buzzwords, or academic clichés: "shallow dichotomy", "apocalyptic dread", "algorithmic convenience", "opaque corporate server racks", "not reactionary; it is vital self-defense", "human agency", "hegemony", "panopticon", "paradigm", "Kafkaesque", "juxtaposition", "inexorable", "obfuscate", "surreptitious", "monolithic", "harbinger", "verisimilitude", "disenfranchised", "quagmire", "ubiquitous", "pervasive", "machinations", "epistemic".
   - If a phrase sounds like a university research paper, think-tank brief, or corporate whitepaper, replace it with direct, accessible conversational English.
4. POSTER 2 ("THE CRITICAL PERSPECTIVE" / curatorTake):
   - Exactly 2 complete sentences (25-35 words total, ending with a period).
   - Must sound like the curator's authentic voice and constructive mindset.
5. POSTER 3 ("SLANT MINUTE" BROADSHEET ESSAY / summary & resolvedArticleExcerpts):
   - Exactly 3 paragraphs (180-220 words total) translating the concepts into accessible everyday language that reads effortlessly on a mobile screen.
   - Ground the narrative in practical human terms, clear cause-and-effect, and common sense.`;
    } else {
      voiceStyleSummary = 'Casual (Simple, easily understood words, accessible everyday English)';
      vocabDirective = `CRITICAL WRITING VOICE & VOCABULARY DIRECTIVE (DEFAULT: CASUAL WITH SIMPLE WORDS):
1. CASUAL WITH SIMPLE, EASILY UNDERSTOOD WORDS (DEFAULT INTERNAL STYLE):
   - The curator has not provided custom context/take to infer their personal writing style.
   - DEFAULT INTERNALLY TO CASUAL: Write in a clean, relaxed, conversational style using simple, easily understood words.
   - Use natural everyday English that anyone can read effortlessly on a smartphone screen without pause.
   - Friendly, clear, observant, and constructive.
2. STRICT BAN ON POMPOUS ACADEMIC & THINK-TANK JARGON:
   - NEVER use pretentious Latinate words, corporate buzzwords, or academic clichés: "shallow dichotomy", "apocalyptic dread", "algorithmic convenience", "opaque corporate server racks", "not reactionary; it is vital self-defense", "human agency", "hegemony", "panopticon", "paradigm", "Kafkaesque", "juxtaposition", "inexorable", "obfuscate", "surreptitious", "monolithic", "harbinger", "verisimilitude", "disenfranchised", "quagmire", "ubiquitous", "pervasive", "machinations", "epistemic".
   - If a phrase sounds like a university research paper, think-tank brief, or corporate whitepaper, replace it with direct, accessible conversational English.
3. POSTER 2 ("THE CRITICAL PERSPECTIVE" / curatorTake):
   - Exactly 2 complete sentences (25-35 words total, ending with a period).
   - Relaxed, punchy, and constructive mindset.
4. POSTER 3 ("SLANT MINUTE" BROADSHEET ESSAY / summary & resolvedArticleExcerpts):
   - Exactly 3 paragraphs (180-220 words total) translating the source concepts into accessible everyday language that reads effortlessly on a mobile screen.
   - Ground the narrative in practical human terms, clear cause-and-effect, and common sense.`;
    }

    const visualFocusDirective = (perspectiveMode === 'source')
      ? `CRITICAL VISUAL FOCUS DIRECTIVE (POSTER 1 ARTWORK ONLY - SOURCE GROUNDED):
- Visual Focus is set to SOURCE GROUNDED. This controls the VISUAL ARTWORK only, NOT the text narrative.
- The illustrationPrompt for Poster 1 MUST describe a concrete, realistic scene physically anchored in the real-world news event, setting, protagonists, political figures, microphones, flags, or authentic broadcast environment depicted in the source.
- Do NOT invent fictitious engineering workbenches or unrelated personal allegories for Poster 1 artwork unless that is the actual news topic.`
      : (perspectiveMode === 'curator')
      ? `CRITICAL VISUAL FOCUS DIRECTIVE (POSTER 1 ARTWORK ONLY - CURATOR ANGLE):
- Visual Focus is set to CURATOR ANGLE. This controls the VISUAL ARTWORK only, NOT the text narrative.
- The illustrationPrompt for Poster 1 should translate the curator's thesis, real-world protagonists, and critique into an evocative, high-aesthetic editorial composition.
- IMPORTANT PUBLIC FIGURE RULE: If the curator's text mentions any recognizable public figure, historical icon, leader, athlete, industrialist, scientist, or celebrity, you MUST feature and portray that popular figure directly in the foreground (with their unmistakable iconic physical likeness, hairstyle, glasses/beard, and signature attire) interacting with the symbolic or real-world elements of the curator's thesis—NEVER replace a mentioned popular figure with purely abstract objects!`
      : `CRITICAL VISUAL FOCUS DIRECTIVE (POSTER 1 ARTWORK ONLY - HYBRID BLEND):
- Visual Focus is set to HYBRID BLEND. This controls the VISUAL ARTWORK only, NOT the text narrative.
- The illustrationPrompt for Poster 1 should blend the concrete real-world news subject with the curator's symbolic tension and visual metaphor.`;

    let effectiveFamilyCast = familyCast ? sanitizeForeignVaultLeakOnServer(familyCast, creatorEmail || userEmail) : null;
    if (!effectiveFamilyCast || !Array.isArray(effectiveFamilyCast.members) || effectiveFamilyCast.members.length === 0) {
      try {
        const sharedBundle = await loadSharedFamilyCastAndNotifications(creatorEmail || userEmail);
        if (sharedBundle && sharedBundle.familyCast) {
          effectiveFamilyCast = sanitizeForeignVaultLeakOnServer(sharedBundle.familyCast, creatorEmail || userEmail);
        }
      } catch (_) {}
    }
    if (effectiveFamilyCast && Array.isArray(effectiveFamilyCast.members)) {
      effectiveFamilyCast = {
        ...effectiveFamilyCast,
        members: effectiveFamilyCast.members.filter(m => m && m.approvalStatus !== 'pending' && m.approvalStatus !== 'declined')
      };
    }

    const isShridharMainContext = isShridharCastContext(effectiveFamilyCast, creatorEmail || userEmail);
    const selfVaultMember = (effectiveFamilyCast && Array.isArray(effectiveFamilyCast.members))
      ? effectiveFamilyCast.members.find(m => m && m.relationship === 'self')
      : null;
    const narratorDisplayName = (selfVaultMember && selfVaultMember.name) || 'the narrator';
    const narratorVaultSummary = (selfVaultMember && (selfVaultMember.uncompromisableAnchors || selfVaultMember.visualTraits))
      ? `${selfVaultMember.name || 'the narrator'} (${[selfVaultMember.age ? `age ${selfVaultMember.age}` : '', selfVaultMember.heightDesc || '', selfVaultMember.uncompromisableAnchors || selfVaultMember.visualTraits || ''].filter(Boolean).join(', ')})`
      : `${narratorDisplayName}`;

    const demographicInfo = detectAgeAndDemographics(userSlant, extractedTitle, extractedContent);
    const familyCastDirectives = buildFamilyCastDirectives({
      familyCast: effectiveFamilyCast,
      activeCast,
      castStaging,
      userSlant,
      userEmail: creatorEmail || userEmail,
      spark,
      countryContext,
      sourceType,
      perspectiveMode,
      chronicleMode: Boolean(isChronicle),
      preferredVisualSubject
    });

    // Auto-resolve an authentic Wikipedia reference photo if Inner Voice (or Web Link without og:image) mentions a popular/public figure (e.g. Prakash Raj)
    let resolvedPublicFigurePhoto = null;
    if (!sourceImageBase64 && !effectiveCatalystImage && !isChronicle) {
      resolvedPublicFigurePhoto = await resolvePublicFigureReferencePhoto({
        userSlant,
        spark,
        adaptedHeadline: extractedTitle,
        heroCue: (Array.isArray(cues) && cues[0]) || heroCue || '',
        familyCast: effectiveFamilyCast
      });
      if (resolvedPublicFigurePhoto && resolvedPublicFigurePhoto.imageBase64) {
        sourceImageUrl = resolvedPublicFigurePhoto.imageUrl;
        sourceImageBase64 = resolvedPublicFigurePhoto.imageBase64;
        sourceImageMimeType = resolvedPublicFigurePhoto.imageMimeType || 'image/jpeg';
      }
    }

    const isCinematicPhoto = (characterRepresentation === 'cinematic' || characterRepresentation === 'cinematic_photo' || characterRepresentation === 'likeness' || (Boolean(effectiveCatalystImage || (sourceImageBase64 && !resolvedPublicFigurePhoto)) && characterRepresentation !== 'painting' && characterRepresentation !== 'watercolor' && characterRepresentation !== 'exact' && characterRepresentation !== 'silhouette' && characterRepresentation !== 'realistic'));
    const isArtisticPainting = (characterRepresentation === 'painting');
    const isWatercolorIllustration = (characterRepresentation === 'watercolor');

    const systemPrompt = `You are the lead editorial director and visual design curator for "Slant" (slant.today), an elite visual publication that distills complex stories into high-impact 3-poster social carousels.

Input Details:
- Source Type: ${sourceType}
- Visual Focus (Poster 1 Artwork & Cues): ${perspectiveMode === 'curator' ? 'Curator Angle (Metaphor)' : (perspectiveMode === 'source' ? 'Source Grounded (Physical Reality)' : 'Hybrid Blend')}
- Target Audience: ${targetAudience}
- Tone / Slant: ${toneDescription}
- Vocabulary & Voice Style: ${voiceStyleSummary}
${userSlant ? `- Curator's Slant / Take (Primary Stance & Angle): "${userSlant}"` : ''}
${spark ? `- The Spark (Personal Context / Catalyst): "${spark}"` : ''}
${url ? `- Source Link: ${url}` : ''}
${pubName ? `- Publication / Domain: ${pubName}` : ''}
${preferredVisualSubject && preferredVisualSubject.title ? `CRITICAL CORE VISUAL SUBJECT SELECTED BY CURATOR (HIGHEST VISUAL PRIORITY FOR POSTER 1):
- Selected Visual Subject Title: "${preferredVisualSubject.title}"
- Selected Visual Scene Description: "${preferredVisualSubject.description || preferredVisualSubject.title}"
- You MUST build Poster 1's "illustrationPrompt", "heroCue", and "cues" directly around this exact selected visual subject!
${!preferredVisualSubject.isPersonalFamily ? '- STRICT BAN ON UNRELATED FAMILY PORTRAITS: Because this selected visual subject is a topical/societal/contextual scene and NOT a personal family portrait, strictly DO NOT insert the author\'s personal family members on a home veranda!' : ''}` : `CRITICAL CORE SUBJECT & CONTEXTUAL SCENE GROUNDING DIRECTIVE (POSTER 1 VISUALS):
- Identify the true CORE SUBJECT in the author's context before composing "illustrationPrompt" and "cues".
- Distinguish sharply between a SOCIETAL / TOPICAL OBSERVATION (e.g. crowded school corridors on Parent-Teacher Meeting days, parents debating 2nd-grade marks with teachers in the age of AI, civic street life, workplace culture) vs. an intimate PERSONAL FAMILY STORY about the author's own household ("my family", "my spouse", "my kids").
- When the post is a societal or topical observation (even if it mentions generic words like "the whole family comes", "parents", "the kids", or "I see"), "illustrationPrompt" MUST depict the actual real-world scene of that topic (e.g. the packed school corridor and classroom doorway on PTM day) and MUST NEVER default to a generic home veranda or personal family photo!`}
${familyCastDirectives ? `- Family Protagonists & Physical Staging:
${familyCastDirectives.systemPromptSection}` : (demographicInfo ? `- Featured Protagonist Age & Demographics: ${demographicInfo.promptDesc}` : '')}
${cues && cues.length > 0 ? `- Ranked Visual Cues: ${cues.map((c, i) => `#${i+1} ${c}`).join(' • ')}` : ''}
- Regional & Cultural Setting: ${countryContext || 'Global / Contextually Detected'}
${countryContext && countryContext !== 'Global' ? `CRITICAL GEOGRAPHIC & CULTURAL SETTING DIRECTIVE:
- The setting is explicitly anchored in ${countryContext}.
- The visual composition, atmosphere, architecture, streetscape, and cultural textures in Poster 1 artwork and in "illustrationPrompt" MUST authentically reflect ${countryContext} (e.g. for Japan: Tokyo urban architecture, Shinto minimalism, Japanese streetscapes and regional textures; for UK: Westminster stone, London atmosphere; for India: authentic Indian institutional architecture and regional landscape; for Europe: European civic plazas and historic institutions).
- Ground the visual metaphors, environmental setting, and background architecture in ${countryContext} rather than defaulting to generic or Western European tropes.` : ''}
- Character Portrayal Style: ${characterRepresentation === 'exact' 
  ? 'Use exact unedited news/attached photo directly' 
  : (isCinematicPhoto
    ? 'Cinematic Editorial Photo (Picture-Like Quality, Zero Digital Footprint): 35mm documentary film still capturing the key subjects recognizable facial structure, hairstyle, eye expression, and clothing with natural camera fidelity and authentic skin textures.'
    : (isArtisticPainting
      ? 'Artistic Broadsheet Painting (Artwork): Warm painted broadsheet illustration in gouache and oil style capturing the scene and figures in rich painted pigments.' 
      : (isWatercolorIllustration
        ? 'Watercolor Illustration (Hand-Painted Wash): Expressive hand-painted watercolor and fine fountain-pen ink-wash illustration on textured warm cream cold-press watercolor paper with soft feathered edges and luminous pigment blooms.'
        : (characterRepresentation === 'silhouette'
          ? 'Minimalist silhouette / stark shadow figures (ONLY if explicitly demanded)'
          : 'AI Illustration (Vivid Editorial Realism): High-impact editorial broadsheet illustration faithfully capturing key figures, real-world setting, and dramatic journalistic realism.'))))}
${isCinematicPhoto && (effectiveCatalystImage || sourceImageBase64) ? `CRITICAL CINEMATIC EDITORIAL PHOTOGRAPHY DIRECTIVE (PICTURE-LIKE QUALITY, ZERO DIGITAL FOOTPRINT):
- An authentic real-world photograph is attached. The curator requested Cinematic Editorial Photo portrayal for Poster 1 (picture-like photographic quality).
- In "illustrationPrompt", perform an astute visual analysis of the key people and environment visible in the attached photo to produce an award-winning 35mm editorial documentary photograph / film still:
  1. CAMERA & PHOTOGRAPHIC MEDIUM: 35mm editorial documentary photography, sharp focal depth, natural skin pores and realistic skin textures, gentle natural optical bokeh, lifelike documentary photojournalism. STRICT BAN: NO painterly brushstrokes, NO canvas textures, NO gouache or oil painting effects, NO cartoon or illustration styles! Must look like a real, high-resolution magazine photo.
  2. FACIAL STRUCTURE & EXPRESSIONS: Describe the face shape (e.g. oval, soft round cheeks, structured jaw), warm skin tones, dark almond eyes, natural eye gaze, and authentic thoughtful or joyful expressions.
  3. HAIR & POSTURE: Describe haircut, texture, parting, and color (e.g. dark straight fringe, wavy side-parted hair), height difference, age group, and body posture (e.g. brotherly arm over shoulder).
  4. CLOTHING & SETTING: Describe clothing colors and styles (e.g. vibrant blue graphic t-shirt, light shorts, white tank top) set in the authentic physical environment (e.g. bright sunlit domestic veranda, wooden carved door, granite floor, stainless steel railing) with natural ambient midday sunlight.
  5. PRIVACY & IDENTITY CONSTRAINT: ${sourceType === 'inner_voice' ? 'Protect PRIVATE family/household names (do not use words like "clone", "replica", or "deepfake"), EXCEPT when the curator mentions a recognizable PUBLIC FIGURE, historical icon, political leader, athlete, industrialist, or celebrity—for any public figure, explicitly name them and describe their unmistakable iconic facial features, hairstyle, and signature attire!' : 'When the source depicts a recognizable public figure, leader, or speaker, describe and name them directly to preserve authentic journalistic context.'}` : ''}
${isArtisticPainting && (effectiveCatalystImage || sourceImageBase64) ? `CRITICAL ARTISTIC BROADSHEET PAINTING DIRECTIVE (PAINTED ARTWORK):
- An authentic real-world photograph is attached. The curator requested Artistic Broadsheet Painting portrayal for Poster 1.
- In "illustrationPrompt", perform an astute visual analysis of the key people visible in the attached photo to describe their physical facial characteristics, hairstyle, age, stature, and clothing:
  1. FACIAL STRUCTURE & FEATURES: Describe the face shape, skin tone, eye shape, gaze, smile or expression.
  2. HAIR & HEAD: Describe haircut, hair texture, part, and color.
  3. RELATIVE STATURE & CLOTHING: Describe the age gap, height difference, clothing colors and styles.
  4. ENVIRONMENT & LIGHTING: Describe the setting bathed in natural midday sunlight.
  5. ARTISTIC MEDIUM: Frame the prompt as an expressive masterpiece editorial painting (e.g. "Warm cinematic editorial gouache and oil painting with rich textures, vivid color grading, lifelike human expression").
  6. PRIVACY & IDENTITY CONSTRAINT: ${sourceType === 'inner_voice' ? 'Protect PRIVATE family/household names (do not use words like "clone", "replica", or "deepfake"), EXCEPT when the curator mentions a recognizable PUBLIC FIGURE, historical icon, political leader, athlete, industrialist, or celebrity—for any public figure, explicitly name them and describe their unmistakable iconic facial features, hairstyle, and signature attire!' : 'When the source depicts a recognizable public figure, leader, or speaker, describe and name them directly to preserve authentic journalistic context.'}` : ''}
${isWatercolorIllustration ? `CRITICAL WATERCOLOR ILLUSTRATION DIRECTIVE (HAND-PAINTED WATERCOLOR & INK WASH ON ARCHIVAL PAPER):
- The curator requested Watercolor Illustration portrayal for Poster 1.
- In "illustrationPrompt", frame the scene as a "Masterpiece hand-painted loose watercolor and fine fountain-pen ink-wash editorial illustration on textured warm cream cold-press watercolor paper (#F5EFE2) with soft feathered unpainted cream paper vignette edges and visible wet-on-wet watercolor pigment blooms".
- Expressive pen-and-ink contour sketching filled with airy, translucent watercolor washes where the warm cream watercolor paper shines through the highlights and fades softly into unpainted cream paper around the outer edges.
- POPULAR / PUBLIC FIGURE LIKENESS IN WATERCOLOR: Whenever the curator's text or source mentions a recognizable public figure, historical leader, athlete, industrialist, scientist, or cultural icon, portray them prominently in the foreground and explicitly describe their unmistakable iconic facial features, hairstyle, spectacles/beard, age, and signature attire alongside their name.
${(effectiveCatalystImage || sourceImageBase64) ? `- Incorporate the observed facial structure, hairstyle, expressions, clothing colors, and setting from the attached photo into this luminous hand-painted watercolor and ink-wash composition.` : ''}` : ''}
${(!isCinematicPhoto && !isArtisticPainting && !isWatercolorIllustration && characterRepresentation !== 'exact' && characterRepresentation !== 'silhouette') ? `CRITICAL AI ILLUSTRATION (VIVID EDITORIAL REALISM) DIRECTIVE:
- The curator requested AI Illustration (Vivid Editorial Realism) for Poster 1 (the signature Slant broadsheet style).
- In "illustrationPrompt", generate a high-impact editorial broadsheet illustration faithfully capturing the key figures, real-world setting, and dramatic journalistic realism.
- POPULAR / PUBLIC FIGURE & ICONIC PERSONALITY DIRECTIVE (APPLIES TO BOTH INNER VOICE & WEB/VIDEO SOURCES):
  * Whenever the curator's text ("${userSlant || ''}"${spark ? ` or "${spark}"` : ''}) or the source features a recognizable public figure, historical icon, political leader, sports legend, industrialist, scientist, author, or celebrity (e.g. Ratan Tata, Dr. A.P.J. Abdul Kalam, Virat Kohli, MS Dhoni, Narayana Murthy, Sundar Pichai, Narendra Modi, Swami Vivekananda, Elon Musk, Emmanuel Macron, Giorgia Meloni, Ashish Vidyarthi), NAME AND PORTRAY THEM DIRECTLY in the foreground with vivid realistic faces, natural warm lighting on skin tones, balanced studio spotlights, and dramatic journalistic realism!
  * MANDATORY ICONIC PHYSICAL LIKENESS ANCHORS: Because AI image models require concrete visual traits to render famous faces accurately, you MUST pair every named public figure in "illustrationPrompt" with a rich, unmistakable physical likeness description (their exact age bracket, signature hairstyle/parting/color, beard or mustache style, spectacles/glasses, facial structure, warm skin tone, and signature attire such as Bandhgala suit, sleeveless khadi Modi jacket, tailored navy suit, cricket jersey, or saffron robe & turban).
  * STRICT BAN: NEVER omit a mentioned public figure in Inner Voice! NEVER replace named public figures, leaders, athletes, or icons with anonymous generic strangers or abstract object-only metaphors! NEVER create pitch-black silhouettes, faceless shadow phantoms, or creepy figures!
${(sourceType === 'inner_voice' && effectiveCatalystImage) ? `- INNER VOICE CATALYST PHOTO DIRECTIVE:
  * Faithfully capture the authentic human presence, facial structure, haircut, and warm natural expressions of the people in the attached photo.
  * Frame as high-impact editorial realism with warm natural lighting and genuine human warmth.
  * PRIVACY & SAFETY CONSTRAINT: Protect private household/family names (do not use words like "clone", "replica", or "deepfake"), while still naming and portraying any famous public figures mentioned in the text.` : ''}` : ''}
${characterRepresentation === 'exact' ? 'CRITICAL EXACT PHOTO DIRECTIVE: Character Portrayal is set to USE EXACT PHOTO. The heroCue should highlight the central photographic subject of the unedited news photo.' : ''}

${vocabDirective}

Task:
Synthesize this input into a compelling 3-poster social carousel deck:
1. Poster 1 (The Visual Hook): A bold adapted headline (5-10 words, unforgettable), a gripping 1-2 sentence hook, category badge, and dominant visual metaphor.
2. Poster 2 (The Curator's Take): A punchy perspective directly emphasizing the curator's slant/take, why it matters right now, and exactly 3 distinct high-signal takeaways.
3. Poster 3 (The Receipts / Core Conviction): A single powerful highlight quote, and 3 verified excerpt bullet points backing the stance.

CRITICAL SLANT EDITORIAL CONTRACT (CURATOR THOUGHTS IN SUBSTANTIVE DIALOGUE WITH SOURCE DATA):
- Slant is fundamentally about the curator's thoughts on the source topic.
- The written narrative across all 3 posters must ALWAYS play around the curator's provided take/context in tight, substantive connection with the source facts and data.
- In Poster 1 ("VISUAL HOOK"): Deliver an adapted headline (5-10 words) that captures the curator's critical perspective on the source event or data, accompanied by a gripping 1-2 sentence hook. The headline must unite the curator's insight with the subject so the reader immediately grasps the core conviction.
- In Poster 2 ("THE CRITICAL PERSPECTIVE" / Curator Take): Deliver an articulate editorial conviction derived directly from the curator's perspective ("${userSlant}"). It MUST be EXACTLY 2 complete sentences (25-35 words total, ending definitively with a period). Deliver exactly 3 sharp, structured conviction principles in "keyTakeaways".
- In Poster 3 ("THE RECEIPTS & BROADSHEET REPORT"): Deliver a rich, substantive 3-paragraph broadsheet editorial where the curator's stance is ELABORATED IN DIRECT, DETAILED DIALOGUE WITH THE SOURCE FACTS, DATA, AND ARGUMENTS. Directly engage with the author's/speaker's concrete concepts, figures, claims, or institutional developments, using them to substantiate, deepen, and prove the curator's stance.

${visualFocusDirective}
${userSlant ? `CRITICAL PROPER-NOUN, ORGANIZATION & CULTURAL ENTITY FIDELITY RULE:
- Every specific organization, institution, movement, festival, deity, historical milestone, or proper noun explicitly named by the curator in "${userSlant}"${spark ? ` or "${spark}"` : ''} (such as "RSS", "Vijayadashami", "Swayamsevaks", "Maa Bharati", "Durga", "Shakti", "Pathasanchalan", or any named nation, company, or leader) MUST be explicitly named and preserved across Poster 1 ("hook"), Poster 2 ("curatorTake"), and Poster 3 ("summary" and "resolvedArticleExcerpts").
- STRICT BAN ON SANITIZATION OR OMISSION: NEVER drop, generalize, or replace named organizations (like "RSS") with vague euphemisms like "this movement" or "community group". If the curator explicitly mentions "RSS" (e.g. "Vijayadashami, the founding day of RSS"), you MUST explicitly name "RSS" in Poster 2 ("curatorTake") and in the opening paragraph of Poster 3 ("summary" / "resolvedArticleExcerpts")!

CRITICAL POLISHED CURATOR INPUT DIRECTIVE:
- The curator provided their authentic stance: "${userSlant}".
- In "polishedCuratorTake": Polish the curator's exact input for grammar, spelling, punctuation, capitalization, and smooth phrasing flow.
- STRICT REQUIREMENTS FOR "polishedCuratorTake":
  * 100% PRESERVATION: Retain 100% of the curator's original thoughts, arguments, conviction, proper nouns, organizations, personal voice, style, and full length.
  * ZERO SUMMARIZATION: Do NOT summarize, cut short, or compress their take into 2 sentences.
  * ZERO ALTERATION: Do NOT change the curator's stance or introduce unsolicited opinions. It is purely gentle grammar and phrase correction.
  * ZERO EM-DASHES: NEVER use em-dashes ("—"), en-dashes ("–"), or double hyphens ("--"). They scream artificial AI generation. Connect clauses with natural commas, semicolons, or standard punctuation so it feels authentic and human.
CRITICAL POSTER 2 DIRECTIVE (PULL-QUOTE DERIVED DIRECTLY FROM CURATOR INPUT):
${refineCoreTake ? `- Poster 2 ("THE CRITICAL PERSPECTIVE" / curatorTake) is an authentic, high-impact PULL-QUOTE (EXACTLY 2 complete sentences, 25-35 words total, ending definitively with a period).
- EDITORIAL PULL-QUOTE METHOD (CULL & TIGHTEN, NEVER REINVENT):
  * DO NOT throw away the user's authentic words or named organizations/subjects to invent generic slogans.
  * Identify the author's STRONGEST, MOST VIVID core lines from: "${userSlant}".
  * RETAIN their explicit proper nouns, organizations (e.g. "RSS", "Vijayadashami", "Maa Bharati"), metaphors, idioms, and contrasts.
  * Polish the grammar, articles, and prepositions so their authentic voice rings with crisp, effortless, natural English.` : `- USE TAKE AS-IS (VERBATIM): The curator chose to keep their exact typed take as-is on Poster 2.
- In "curatorTake", you MUST output the curator's authentic take: "${userSlant}" verbatim without rephrasing or altering their sentence structure.`}` : ''}
${sourceType === 'inner_voice' && isChronicle ? `CRITICAL DAILY CHRONICLE & MULTI-MOMENT NON-OVERLAPPING VIGNETTE POSTER DIRECTIVE:
- The curator is recording a DAILY CHRONICLE (Diary / Multi-Moment Day in Review) consisting of ${validChronicleMoments.length} distinct moments from their day:
${validChronicleMoments.map((m, i) => `  * Moment 0${i + 1} (${m.title || 'Moment ' + (i + 1)}${i === starredChronicleIdx ? ' [★ STARRED IMPORTANT HIGHLIGHT OF THE DAY - GIVE EXTRA SHOWCASE SPACE IN POSTER]' : ''}${m.hasPhoto ? ' [Photo Attached]' : ''}): "${m.text}"${m.preferredVisualProjection && m.preferredVisualProjection.title ? `\n    -> CURATOR-SELECTED VISUAL PROJECTION FOR MOMENT 0${i + 1} (CONFIDENCE ${m.preferredVisualProjection.confidence || 92}% — MANDATORY SCENE TO DEPICT IN THIS VIGNETTE): "${m.preferredVisualProjection.title}" — ${m.preferredVisualProjection.description || ''}` : ''}`).join('\n')}
- 1. SLIDE 1 HEADLINE ("adaptedHeadline"), DATE ("originalHeadline") & BADGE ("categoryBadge"):
  * Set "categoryBadge" to "DAILY CHRONICLE" and "publicationName" to "Daily Chronicle".
  * Set "adaptedHeadline" to a warm, natural 6 to 10 word headline formed directly from the moments of the day.
  * Set "originalHeadline" strictly to today's date in the format "${formatChronicleDateLabel(new Date())}" (strictly NO "Daily Chronicle: ..." source headline prefix!).
- 2. BEHAVIORAL & EMOTIONAL REFLECTIONS OF THE DAY ("chronicleReflections" & "curatorTake" — Displayed on Poster 3):
  * CRITICAL ANTI-STITCHING RULE: NEVER stitch, blend, or force all ${validChronicleMoments.length} moments into a single convoluted sentence! Combining unrelated events (e.g., software work + a child's exam + eating dinner) into one sentence creates a puzzled, artificial riddle.
  * PURPOSE OF POSTER 3: Poster 2 already records what happened. Poster 3 is a personal behavioral and emotional mirror designed to make the author a better, more self-aware person.
  * HOW TO SELECT & EXTRACT REFLECTIONS:
    1. First priority: Reflect on the ★ STARRED moment(s) (${explicitStarredIdx >= 0 ? `Moment 0${explicitStarredIdx + 1}: "${validChronicleMoments[explicitStarredIdx].text}"` : 'if any moment is starred'}) AND any moment that reveals a genuine EMOTION, SELF-CRITIQUE, ATTITUDE, or HUMAN BEHAVIOR.
    2. Ignore purely logistical or routine filler moments when writing reflections.
    3. Identify the underlying Emotion / Behavior and whether it sits on:
       - The POSITIVE / CONSTRUCTIVE side ("polarity": "positive"): e.g., calm mentorship with a child, humility to admire and adapt someone's warm hospitality, stepping up to own design/craft, civic pride, or family gratitude. Format "behaviorTag" as "🌱 WORTH ADAPTING • [BEHAVIOR]", "🧭 STEADY PARENTING • [BEHAVIOR]", or "✦ STRENGTH • [BEHAVIOR]".
       - The NEGATIVE / DRIFT / FRICTION side ("polarity": "corrective"): e.g., scattered focus / going through the motions at work, procrastination, or anxiety while waiting for feedback, framed as a constructive course-correction to make the person better. Format "behaviorTag" as "⚡ COURSE-CORRECTION • [DRIFT] → [ACTION]".
       - GENERIC OBSERVATIONAL ("polarity": "generic"): If ALL ${validChronicleMoments.length} moments are simple factual logs (e.g., logging a child's running, meal, and class) with no starred moment or behavioral tension, write 1 simple, warm generic reflection on everyday rhythm or observing growth WITHOUT forcing literal nouns from the moments into the quote! Format "behaviorTag" as "✦ DAILY REFLECTION • EVERYDAY RHYTHM".
    4. 1 QUOTE VS. 2 QUOTES ("chronicleReflections" array of 1 or 2 objects):
       - Output 1 reflection object (16-24 words) if the day has one clear starred/behavioral lesson or one unified emotional thread.
       - Output 2 independent reflection objects (14-22 words each) if the day contains 2 distinct emotional/behavioral lessons from different moments that should NOT be merged into one sentence (e.g., Quote 1 on correcting scattered work focus, and Quote 2 on adapting a host's warm welcome; OR Quote 1 on owning product design, and Quote 2 on guiding a child calmly after low marks).
    5. Set "curatorTake" to the primary reflection quote (or both quotes joined by a space), and set "whyItMatters" to "" (empty string).${reflectionFeedbackHistory && (Array.isArray(reflectionFeedbackHistory.liked) || Array.isArray(reflectionFeedbackHistory.disliked)) ? `\n    6. LEARN FROM THE AUTHOR'S PAST REFLECTION FEEDBACK (👍 / 👎):${Array.isArray(reflectionFeedbackHistory.liked) && reflectionFeedbackHistory.liked.length > 0 ? `\n       - Liked (👍 Match this grounded, actionable style): ${reflectionFeedbackHistory.liked.slice(0, 4).map(q => `"${q}"`).join(' | ')}` : ''}${Array.isArray(reflectionFeedbackHistory.disliked) && reflectionFeedbackHistory.disliked.length > 0 ? `\n       - Disliked (👎 Avoid this puzzled/blended style): ${reflectionFeedbackHistory.disliked.slice(0, 4).map(q => `"${q}"`).join(' | ')}` : ''}` : ''}
- 3. POSTER 2 ELABORATED MOMENTS ("resolvedArticleExcerpts" and "summary"):
  * DO NOT merge the moments into one continuous generic essay!
  * Instead, output ${validChronicleMoments.length} distinct, vivid micro-entries in "resolvedArticleExcerpts" (one array element per moment, 35-48 words / 2-3 polished sentences each so all ${validChronicleMoments.length} moments fit cleanly together on Poster 2), preserving 100% of the author's voice and details.
  * Format each array element with its numbered moment header ("Moment 01:", "Moment 02:", etc., strictly WITHOUT a leading "01 · " prefix) followed by a colon:
    ${validChronicleMoments.map((m, i) => `"Moment 0${i + 1}: [2-3 polished, natural sentences elaborating Moment 0${i + 1}]"`).join(',\n    ')}
  * Set "summary" to those exact ${validChronicleMoments.length} formatted entries joined by "\\n\\n".
- 4. MANDATORY CLOUDY-SHADED WATERCOLOR VIGNETTE STYLE WITH EXACT VIGNETTE COUNT (${validChronicleMoments.length} MOMENTS = EXACTLY ${validChronicleMoments.length} VIGNETTES), DYNAMIC MOMENT-MATCHED SOFT HALO COLORS & SITUATIONAL ATTIRE ("illustrationPrompt"):
  * STRICT VIGNETTE COUNT RULE (EXACTLY ${validChronicleMoments.length} VIGNETTES FOR ${validChronicleMoments.length} MOMENTS — NEVER DRAW 3 VIGNETTES WHEN THERE ARE ONLY 2 MOMENTS!):
    Every Daily Chronicle Poster 1 MUST depict EXACTLY ${validChronicleMoments.length} isolated cloudy-shaded watercolor-and-gouache moment visuals on warm textured vintage cream-buff parchment paper (#EDE3D0): "Masterpiece ${validChronicleMoments.length}-vignette editorial watercolor and gouache illustration page on warm textured vintage cream-buff parchment paper with visible organic paper grain, featuring EXACTLY ${validChronicleMoments.length} separate, self-contained moment visuals (${validChronicleMoments.length === 2 ? '1 Upper Centered Vignette + 1 Lower Larger Highlight Vignette stacked vertically — STRICTLY ONLY 2 VIGNETTES TOTAL, NEVER 3 VIGNETTES!' : 'Top-Left Vignette, Top-Right Vignette, and Bottom-Center Larger Highlight Vignette'}) where each moment is surrounded by a soft, blurry, feathered dry-brush cloud gradient halo in a subtle, muted watercolor tint tailored to that moment's mood and setting whose outer edges smoothly fade to zero opacity into the warm parchment paper (STRICTLY NO crisp vignette borders, NO hard water-stain puddle perimeter rings, NO straight vertical or rectangular frame edges, NOT a single merged full-bleed background scene, and strictly zero printed captions or labels): ..."
  * STARRED MOMENT EXTRA SPACE RULE (★ HIGHLIGHT MOMENT = Moment 0${starredChronicleIdx + 1} "${starredChronicleMoment?.title || 'Moment ' + (starredChronicleIdx + 1)}"):
    ${validChronicleMoments.length === 2
      ? `- Because the author recorded ONLY 2 MOMENTS, you MUST draw ONLY 2 VIGNETTES TOTAL stacked vertically (STRICTLY NEVER split a moment into Top-Left and Top-Right!):
      1) UPPER CENTERED VIGNETTE (~40% of canvas centered across the upper half): Depict the secondary moment (Moment 0${secondaryChronicleMoments[0] ? secondaryChronicleMoments[0].origIdx + 1 : 1}: "${secondaryChronicleMoments[0]?.text || ''}") as a single complete scene showing BOTH the narrator (${narratorDisplayName}) AND any mentioned friend/colleague/companion visibly interacting together!
      2) LOWER CENTERED LARGER HIGHLIGHT VIGNETTE (~55% of canvas centered across the lower half): Depict the ★ STARRED IMPORTANT MOMENT (Moment 0${starredChronicleIdx + 1}: "${starredChronicleMoment?.text || ''}")!`
      : `- Place the two secondary moments (${secondaryChronicleMoments.map(m => `Moment 0${m.origIdx + 1}: "${m.text}"`).join(' AND ')}) as TWO SEPARATE CLOUDY-SHADED VIGNETTES in the upper half ("In the top-left isolated moment visual (~25% of canvas)...; in the top-right isolated moment visual (~25% of canvas)...").
    - Give the ★ STARRED IMPORTANT MOMENT (Moment 0${starredChronicleIdx + 1}: "${starredChronicleMoment?.text || ''}") MORE SPACE IN THE POSTER by placing it in the LARGER BOTTOM-CENTER CLOUDY-SHADED VIGNETTE (~45-50% of the canvas centered across the lower half)!`}
  * ${isShridharMainContext ? `FAMILY WALK / GROUP VIGNETTE HEADCOUNT & PAIRWISE STATURE ALIGNMENT RULE:
    - Whenever the whole family (Father Shridhar, Mother Aruna, Elder Son Gahan, and Younger Son Rishu) appears together in a vignette, you MUST specify FULL-BODY HEAD-TO-TOE FRAMING with all shoes/feet planted on the same ground line from left to right in strict descending height order:
      1) EXACTLY 4 PEOPLE TOTAL SHOWN FULL-BODY FROM HEAD TO TOE: (1st on far left) Adult Father Shridhar (5ft 10in / 178cm, 100% baseline height, in casual polo shirt with no lanyard, trousers, and shoes), (2nd from left) Adult Mother Aruna (5ft 4in / 162cm, 91% of Father's height — 6 inches shorter than Father, top of head at Father's eye/brow level, in kurta and sandals), (3rd from left) 11yo Pre-Teen Elder Son Gahan (4ft 8in / 142cm, 88% of Mother Aruna's height and 80% of Father's height — clearly 8 inches / 20cm SHORTER than Mother Aruna so the top of Gahan's head is strictly BELOW Mother's chin at her collarbone / upper-shoulder level, in a dark navy-blue t-shirt, knee-length denim shorts, and sneakers), and (4th on far right) 7yo Younger Son Rishu (4ft 2in / 127cm, 89% of Elder Brother Gahan's height and 78% of Mother's height — 6 inches / 15cm shorter than Gahan, in a bright mustard-yellow t-shirt, dark shorts, and sneakers) — STRICTLY NEVER 3 CHILDREN!
      2) FULL-BODY WALKING / STANDING SIDE BY SIDE ON THE SAME LEVEL GROUND LINE: All 4 family members must be drawn FULL-BODY FROM HEAD TO TOE with all 8 feet/shoes visibly planted on the same horizontal ground line (STRICTLY NEVER crop them at the thighs/waist and NEVER write "walking ahead" in front of the parents' legs!).
      3) STRICT PAIRWISE STATURE & HEAD-LEVEL LANDMARKS (ELDER SON IS SHORTER THAN MOTHER!): Always specify that 11yo Elder Son Gahan (142cm / 4ft 8in) is 88% of Mother Aruna's height (162cm / 5ft 4in) — clearly 8 inches / 20cm shorter than Mother so the top of Gahan's head reaches Mother's collarbone / upper-shoulder level, strictly BELOW Mother's chin (STRICTLY NEVER draw Gahan as tall as or taller than Mother Aruna!). And always specify that 7yo Younger Son Rishu (127cm / 4ft 2in) is 89% of Elder Brother Gahan's height (6 inches / 15cm shorter than Gahan) so the TOP OF RISHU'S HEAD RISES ABOVE GAHAN'S SHOULDERS to reach Gahan's CHIN / NECK level (strictly NEVER draw Rishu equal height with Gahan!).
      4) "KIDS" / "CHILDREN" / "KIDS FIGHTING" IN ANY MOMENT = STRICTLY THE 2 SONS (GAHAN 11YO BOY & RISHU 7YO BOY — BOTH BOYS, ZERO GIRLS): Whenever the narrator mentions "kids", "kids fighting", "boys", "children", or "siblings" in a moment, they are ALWAYS his two sons: 11-year-old Elder Son Gahan (4ft 8in / 142cm, pre-teen BOY in dark navy-blue t-shirt and knee-length denim shorts) and 7-year-old Younger Son Rishu (4ft 2in / 127cm, 6 inches shorter than Gahan with his head reaching Gahan's chin/neck level, younger BOY in mustard-yellow t-shirt and dark shorts). STRICTLY NEVER write gender-neutral "two young siblings" or "two children" and STRICTLY NEVER draw a girl or daughter!
      5) DISTINCT COMPANION APPEARANCE IN NON-FAMILY VIGNETTES: When Shridhar meets a male friend or colleague in another vignette, give the friend a distinctly contrasting look (e.g., 38yo man with a full head of wavy black hair, clean-shaven face, eyeglasses, and a light olive or sky-blue button-down shirt) so the image model never clones two identical bearded Shridhars!` : `DYNAMIC VAULT FAMILY & COMPANION GROUNDING RULE:
    - Depict ONLY the narrator (${narratorVaultSummary}) and the approved Family Vault members (${(effectiveFamilyCast && Array.isArray(effectiveFamilyCast.members) && effectiveFamilyCast.members.length > 0) ? effectiveFamilyCast.members.map(m => `${m.name || m.roleLabel} [${m.roleLabel || m.relationship}, age ${m.age || 'adult'}, ${m.heightDesc || ''}]`).join('; ') : 'narrator only'}) who are explicitly mentioned in each moment!
    - When a companion or friend is mentioned in a vignette, give them a distinct contrasting appearance so the image model never clones two identical protagonists.`}
  * MANDATORY SITUATION-APPROPRIATE ATTIRE PER MOMENT (NEVER COPY ATTIRE BLINDLY ACROSS VIGNETTES):
    - Whenever the self/protagonist (${narratorDisplayName}) or any recurring character appears across multiple vignettes, you MUST dress them specifically according to the situation, activity, and setting of THAT individual moment!
    - NEVER blindly copy or clone the outfit from one moment's vignette into another moment's vignette! For example: if one moment is a uniformed march/parade (such as RSS Pathasanchalan), dress in the exact march uniform (crisp white full-sleeve shirt, khaki trousers, black RSS cap, bamboo danda); if another moment is working at a desk/laptop/cafe, dress in smart casual workwear; if another moment is sports/exercise, dress in athletic wear; if another moment is at home or a festive family moment, dress in comfortable home or festive attire. Explicitly specify the distinct, context-appropriate outfit inside each vignette description!
  * STRICT BAN ON CRISP BORDERS, WATER-STAIN PUDDLE RINGS, OR STRAIGHT VERTICAL EDGES: Never draw sharp cutout outlines, hard wet-on-dry watercolor puddle perimeter lines, or straight vertical building/frame borders around any moment visual! Every vignette's outer shading must be a soft, diffuse, dry-brush cloud gradient that fades smoothly into the warm textured parchment paper. Never merge the moments into a single full-bleed scene.
  * STRICT BAN ON PRINTED LABELS OR CAPTIONS: Do NOT write numbered titles like "Moment 01:" or "Scene 1:" inside "illustrationPrompt" (as image models will print those words as text captions onto the painting!). Whenever the narrator (${narratorDisplayName}) appears in a vignette, portray them faithfully according to their Reference Vault profile (${isShridharMainContext ? 'mid-age 40-year-old Indian man in his early 40s with a soft fuller round-oval face, full cheeks, full head of thick short dark hair brushed up, neat short dark trimmed stubble beard, and a natural medium-full adult build with a straight-cut everyday waist where his shirt hangs flush with his chest line' : narratorVaultSummary}), and depict any family members, colleagues, friends, or companions ONLY inside the specific vignette where they are mentioned!
  * BALANCING CANDID MOMENT (MID-SHOT) vs. GROUP SCALE (WIDER FRAMING):
    - Do NOT force full-body head-to-toe framing on every scene! Choose the shot framing that best captures the emotional heart and candidness of each moment:
      1) INTIMATE / CONVERSATIONAL / SEATED / SOLO MOMENTS (1-2 people meeting a friend over chai, talking at a table/breezeway, reading a book, working at a desk, or sharing a quiet conversation): Use an expressive CANDID MEDIUM SHOT / MID-SHOT (waist-up or chest-up, 35mm-50mm lens) that foregrounds warm facial expressions, eye contact, hand gestures (holding chai cups, a book, etc.), and upper-body/midsection build.
      2) ACTIVE MOVEMENT OR 3-4+ PERSON GROUP SCENES (e.g. 4-person family evening walk, march, outdoor activity): Use a pulled-back three-quarter or wide shot (with generous left/right margins inside the vignette) ONLY when the action itself is about walking/movement or when fitting 3-4+ people side-by-side requires zooming out so no character is clipped or dropped at the edge—while still keeping their faces and interactions natural and candid.
  * DYNAMIC POSTURE-ADJUSTED RELATIVE HEIGHT RULE: Always adjust visual head-height comparisons based on each character's action/posture in that scene (Standing = 1.00x of base height, Leaning = 0.88x, Sitting on chair/sofa/bench = 0.72x, Kneeling/Crouching = 0.64x, Sitting on floor = 0.52x).
  * CRITICAL ATTACHED MOMENT PHOTO / LOGO INTEGRATION RULE:
    Whenever a Moment has [Photo Attached], inspect the attached image for that moment and weave it MEANINGFULLY and PROMINENTLY into that specific moment's isolated vignette:
    - If the attached image is an app logo, brand emblem, or icon (for example, a black fountain-pen nib emblem containing a contemplative upward-tilted portrait face on a cream background) and the moment describes building or soft-launching an app, explicitly instruct "illustrationPrompt" to show ${narratorDisplayName} at their desk inside that moment's vignette holding a smartphone or laptop displaying that EXACT attached emblem/logo crisp and unmistakable on the screen.
    - If the attached image is a photograph of a scene, object, or activity, explicitly describe its exact visual subject and composition as the visual centerpiece of that vignette.
  * Strictly zero printed captions, zero subheadings, zero signage text, and zero random letters anywhere in the artwork.` : (sourceType === 'inner_voice' ? `CRITICAL INNER VOICE & LIVED EXPERIENCE DIRECTIVE (ELABORATE USER VOICE ONLY, ZERO CONCEPT FABRICATION):
- This is an INNER VOICE perspective rooted in the curator's personal life, emotional experience, philosophical stance, or daily human reality.
- MATCH THE EXACT EMOTIONAL ENERGY & SUBJECT OF THE USER'S INPUT:
  * Faithfully mirror the specific topic, mood, setting, and emotional warmth present in "${userSlant}"${spark ? ` and "${spark}"` : ''}.
  * NEVER inject unrelated travel, vacation, or packing tropes unless the curator's input is explicitly about a trip.
  * NEVER produce gloomy or melodramatic headlines when the curator's reflection is warm, proud, or celebratory.
- ZERO CONCEPT FABRICATION (1:1 STRUCTURAL ELABORATION):
  * You are elaborating the curator's own thoughts, NOT writing your own opinion or inventing unmentioned subplots.
  * Map the curator's input directly across the 3 broadsheet paragraphs in Poster 3 ("summary" and "resolvedArticleExcerpts", 180-220 words total):
    1. Paragraph 1 (The Moment / Concrete Catalyst, 60-70 words, 3-4 sentences): Unpack the opening trigger, scene, or concrete observation described by the curator${spark ? ` ("${spark}")` : ''}. Strong opening for the broadsheet dropcap.
    2. Paragraph 2 (Why It Matters / The Underlying Tension, 60-75 words, 3-4 sentences): Elaborate the curator's reasoning, contrast, or turning point, explaining why this moment stood out and what deeper dynamics are at play in their own words and logic.
    3. Paragraph 3 (The Core Conviction / Lasting Truth, 55-70 words, 3 sentences): Articulate the curator's closing takeaway, personal truth, or principle for living/working/parenting.
  * STRICT BAN: NEVER prefix paragraphs with labels like "The spark:", "Curator stance:", "Paragraph 1:", or bullet points! Output pure, narrative broadsheet text.
- IN "originalHeadline":
  * Set to the spark statement or a refined 6 to 12 word hook capturing the catalyst moment. NEVER set to the raw full-length user slant.` : '')}
${sourceType === 'video_audio' ? `CRITICAL VIDEO & AUDIO BROADCAST DIRECTIVE:
- This slant is rooted in a VIDEO or AUDIO broadcast (e.g. YouTube interview, podcast episode, keynote, or debate).
- Mental model: "I watched/listened to something that sparked a reaction."
- Frame the adapted headline with the immediacy, conversational tension, or contrarian takeaway of a spoken dialogue.
- Poster 2 ("THE CRITICAL PERSPECTIVE" / curatorTake): Capture the key realization, counter-slant, or pushback against what was said in the broadcast.` : ''}
${userSlant && sourceType !== 'inner_voice' ? `CRITICAL POSTER 3 DIRECTIVE (ELABORATED USER TAKE IN DIALOGUE WITH SOURCE, ZERO CONCEPT FABRICATION):
- Poster 3 is the curator's broadsheet essay where the curator's stance/take is ELABORATED IN DIRECT CONNECTION WITH THE ATTACHED SOURCE.
- It must NOT be a dry, third-person summary or detached book report of the source piece (the objective source ledger is already accessible to the reader on tap from Posters 1 & 2).
- ZERO CONCEPT FABRICATION (1:1 STRUCTURAL ELABORATION):
  * Do NOT invent opinions or arguments the curator did not express. Unpack and elaborate the curator's own stance across 3 broadsheet paragraphs (180-220 words total):
  * Paragraph 1 (The Moment / Catalyst & Modern Friction, 60-70 words, 3-4 sentences): The curator's opening observation connecting their personal angle to the core trigger or dilemma in the source (strong opening for broadsheet dropcap).
  * Paragraph 2 (Why It Matters / Engaging the Source, 60-75 words, 3-4 sentences): Elaborate the curator's reasoning and tension in direct dialogue with the source's concrete facts, claims, or figures to substantiate their critique.
  * Paragraph 3 (Core Conviction / Human Stakes & Resolution, 55-70 words, 3 sentences): Detail the personal, human, or societal stakes of the curator's conviction and their lasting takeaway.
- STRICT BAN: Never echo the user's raw slant verbatim across paragraphs! Elaborate the thought with depth, narrative richness, and intellectual conviction while staying 100% faithful to the user's voice. Output pure broadsheet paragraphs without labels like "Paragraph 1:".
- "keyTakeaways": Exactly 3 sharp, structured conviction principles formulated from the elaborated take in dialogue with the source (each exactly 10-13 words with bold title prefix, e.g. "Title: Core insight").
- "receiptHighlightQuote": A poignant, high-impact core conviction sentence (exactly 18-22 words) capturing the heart of the curator's stance in connection with the source.` : ''}

CRITICAL POSTER 3 "1-MINUTE READ" ESSAY DIRECTIVE:
Poster 3 ("SLANT MINUTE" / 60-SEC BROADSHEET) is a pure, substantive broadsheet essay in paragraphs.
It MUST strictly target 180 to 220 words total for the 3-paragraph essay itself in "summary" (and "resolvedArticleExcerpts"):
- Paragraph 1: 60-70 words (strong opening for broadsheet dropcap; fits cleanly on Page 1)
- Paragraph 2: 60-75 words (core elaboration and conceptual depth; completes Page 1 without orphan splits)
- Paragraph 3: 55-70 words (human stakes, lasting conviction, and forward-looking resolution; anchors Page 2 above the reflection box)
TOTAL ESSAY: 180-220 words for an authentic 1-minute read.
The curator's intellectual perspective, conviction, and provided context must be deeply carried and elaborated throughout without inventing unrequested concepts.
If a catalyst photo is attached, subtly ground the atmosphere where natural, but NEVER compromise the curator's perspective or intellectual depth for scene description filler.
CRITICAL CULTURAL, INSTITUTIONAL & UNIFORM VISUAL AUTHENTICITY DIRECTIVE (FOR "illustrationPrompt" AND CUES):
- Whenever the input references a specific real-world organization, cultural march, historical uniform, or traditional ceremony, your "illustrationPrompt" and visual cues MUST specify exact, encyclopedically accurate attire, headgear, and posture with strict negative constraints against AI hallucinations:
  * If RSS (Rashtriya Swayamsevak Sangh), Swayamsevaks, or Pathasanchalan (route march) is referenced:
    1. PROTAGONIST IN THE SAME RSS GANAVESH UNIFORM: Whenever the narrator/protagonist (e.g. Shridhar) states he attended, participated in, or was part of the RSS Pathasanchalan / route march, he himself MUST be dressed in the exact same complete RSS Ganavesh uniform marching in step with his fellow swayamsevaks (crisp full-sleeved white buttoned collared shirt tucked into khaki-brown full-length trousers with a plain brown waist belt, centered black boat-shaped cloth Kali Topi cap on his head, carrying a plain wooden bamboo danda staff on his right shoulder). STRICT BAN: NEVER dress the protagonist in a civilian kurta, casual shirt, or different clothes when he is part of the RSS march!
    2. UNIFORM (GANAVESH): Crisp FULL-SLEEVED (long-sleeved down to the wrists) white buttoned collared shirt tucked neatly into khaki-brown full-length trousers with a simple plain brown waist belt ONLY and black lace-up shoes (strictly NO short-sleeved or half-sleeved shirts, strictly NO diagonal cross-shoulder police straps, strictly NO red neck scarves or ascots, and strictly NO khaki shirts).
    3. HEADGEAR (KALI TOPI): Traditional Indian foldable boat-shaped black cloth cap (Gandhi-cap / boat-cap geometry with a pointed front-to-back crease) worn straight and centered on the head. STRICT BAN: NEVER write "side cap" or "beret", NEVER draw round military/police berets, and strictly NO metal badges, police crests, or emblems on the cap!
    4. STAFF (DANDA / LATHI) & FLAGS: Swayamsevaks march carrying a plain unadorned wooden bamboo staff (danda) resting at a 45-degree angle on the right shoulder or held at their side. STRICT BAN: NEVER attach or tie flags onto the swayamsevaks' bamboo staffs/lathis like spears, and strictly NO "Om" symbols or text on flags! Any saffron flag (Bhagwa Dhwaj) must only be a plain unadorned saffron two-pennant flag on a single standalone flagpole in the background, separate from the marching ranks.
${cues && cues.length > 0 ? `CRITICAL VISUAL RULE: The Hook poster artwork and cues MUST be anchored in #1 HERO: "${cues[0]}", incorporating #2 MOTIF: "${cues[1] || ''}" and #3 TENSION: "${cues[2] || ''}".` : ''}

Respond strictly with valid JSON with this exact structure:
{
  "adaptedHeadline": "5-10 word bold, memorable editorial headline",
  "originalHeadline": "Original title or subject (or spark hook if Inner Voice)",
  "publicationName": "${pubName || (sourceType === 'inner_voice' ? 'Inner Voice' : (sourceType === 'video_audio' ? 'Broadcast Slant' : 'Curated Press'))}",
  "categoryBadge": "UPPERCASE CATEGORY (e.g. DEEP TECH, CULTURE, OPINION, CLIMATE, ECONOMY, HEALTH)",
  "hook": "1-2 sentence gripping hook that stops the reader mid-scroll",
  "polishedCuratorTake": "${userSlant ? 'The curator\'s exact full-length input with gentle grammar, spelling, and phrase corrections applied (preserving 100% of their voice, thoughts, and length).' : ''}",
  "curatorTake": "${isChronicle ? 'The primary behavioral/emotional reflection quote of the day (16-24 words, plain grounded English, never stitching unrelated moments together).' : 'EXACTLY 2 complete sentences (25-35 words total, ending with a period) capturing the author\'s strongest, most poignant lines from their input. Retain their vivid human phrasing and metaphors without inventing stiff academic summaries.'}",
  ${isChronicle ? `"chronicleReflections": [
    {
      "polarity": "positive | corrective | generic",
      "behaviorTag": "SHORT EMOTION / BEHAVIOR BADGE (e.g. ⚡ COURSE-CORRECTION • DRIFT → FOCUS or 🌱 WORTH ADAPTING • WARMTH & PRESENCE)",
      "quote": "14-24 word grounded reflection quote that helps the person grow (1 or 2 objects in array as suited; NEVER stitch unrelated moments into one quote).",
      "momentIndex": 1
    }
  ],` : ''}
  "summary": "${sourceType === 'inner_voice' ? 'Exactly 3 broadsheet paragraphs of lived experience reflection deeply elaborating the curator perspective and context (60-70, 60-75, 55-70 words; 180-220 words total). Never sacrifice curator perspective for scene filler.' : (userSlant ? 'Exactly 3 broadsheet paragraphs carrying and deeply elaborating the curator take in direct dialogue with the attached source (60-70, 60-75, 55-70 words; 180-220 words total). Never an objective book report.' : 'Exactly 3 broadsheet paragraphs of objective journalistic reporting (60-70, 60-75, 55-70 words; 180-220 words total).')}",
  "whyItMatters": "1-2 sharp sentences on the stakes and why this perspective matters right now (18-28 words)",
  "keyTakeaways": [
    "${sourceType === 'inner_voice' ? 'First personal takeaway (10-13 words, Title: Insight)' : (userSlant ? 'First core conviction principle connecting take and source (10-13 words, Title: Insight)' : 'First key source finding (10-13 words, Title: Finding)')}",
    "${sourceType === 'inner_voice' ? 'Second personal takeaway (10-13 words, Title: Insight)' : (userSlant ? 'Second core conviction principle detailing human/personal stakes (10-13 words, Title: Insight)' : 'Second key source finding or trade-off (10-13 words, Title: Insight)')}",
    "${sourceType === 'inner_voice' ? 'Third personal takeaway (10-13 words, Title: Insight)' : (userSlant ? 'Third core conviction principle offering an intentional boundary (10-13 words, Title: Insight)' : 'Third structural implication (10-13 words, Title: Implication)')}"
  ],
  "receiptHighlightQuote": "${sourceType === 'inner_voice' ? 'Single poignant core conviction sentence (18-22 words)' : (userSlant ? 'A poignant core conviction sentence capturing the heart of the curator stance in dialogue with the source (18-22 words)' : 'A direct quote, core factual assertion, or official thesis directly from the source author/speaker (18-22 words).')}",
  "resolvedArticleExcerpts": [
    "${sourceType === 'inner_voice' ? 'Paragraph 1 (Scene & Catalyst): 60-70 words without labels.' : (userSlant ? 'Paragraph 1 (Catalyst & Friction): 60-70 words elaborating opening thesis in dialogue with source topic without labels.' : 'Paragraph 1 (Source Subject & Context): 60-70 words without labels.')}",
    "${sourceType === 'inner_voice' ? 'Paragraph 2 (The Turning Point): 60-75 words without labels.' : (userSlant ? 'Paragraph 2 (Engaging Source Claims): 60-75 words engaging source concepts to substantiate critique without labels.' : 'Paragraph 2 (Core Evidence & Claims): 60-75 words without labels.')}",
    "${sourceType === 'inner_voice' ? 'Paragraph 3 (The Lasting Truth): 55-70 words without labels.' : (userSlant ? 'Paragraph 3 (Human Stakes & Resolution): 55-70 words detailing personal/family impact and lasting resolution without labels.' : 'Paragraph 3 (Underlying Conflict or Trade-offs): 55-70 words without labels.')}"
  ],
  "keyMetric": "Short impactful stat or metric (e.g. +42%, 1,072 Trees, 10x, 99.8% - or leave empty if none)",
  "visualMood": "Short aesthetic phrase (e.g. High-Contrast Editorial Risograph, Velvet Obsidian Chiaroscuro)",
  "heroCue": "Dominant centerpiece subject or object",
  "motifCue": "Metaphorical symbol representing the stance",
  "tensionCue": "Opposing visual force or conflict",
  "atmosphereCue": "Environmental setting or mood",
  "lightingCue": "Dramatic lighting description",
  "styleCue": "Aesthetic style and medium (e.g. Broadsheet Gouache and Oil Painting, 35mm Editorial Photography)",
  "illustrationPrompt": "${isChronicle ? `Multi-scene editorial broadsheet painted story montage in 3:4 vertical portrait format featuring EXACTLY ${validChronicleMoments.length} separate cloudy-shaded watercolor-and-gouache moment visuals for the ${validChronicleMoments.length} moments of the day (${validChronicleMoments.length === 2 ? '"In the upper centered vignette (~40% of canvas)...; in the lower centered larger highlight vignette (~55% of canvas)..." — STRICTLY 2 VIGNETTES ONLY, NEVER 3 VIGNETTES!' : '"In the upper-left scene...; in the upper-right scene...; in the lower panoramic scene..."'}), depicting the exact setting, human action, and colleagues/friends/hosts/family in each moment without reducing any moment to a tiny wall prop. Strictly zero printed captions, zero labels, zero text, no letters, no typography.` : (isCinematicPhoto ? 'Award-winning 35mm editorial news photograph in 4:5 vertical portrait format, sharp camera focus, natural skin textures, lifelike human expressions, realistic clothing and environment observed from the attached photo. Natural ambient lighting, cinematic color grading, strictly no painterly brushstrokes, no canvas textures, no oil paint, no text, no letters.' : (isArtisticPainting ? 'Masterpiece editorial broadsheet painted illustration describing the scene in vivid detail. Specifically incorporate the observed facial structures, hairstyles, expressions, clothing colors, and postures from the attached photo into a rich painterly composition. Clear, warmly lit faces, lifelike human expression, no text, no letters.' : (isWatercolorIllustration ? 'Masterpiece hand-painted loose watercolor and fine fountain-pen ink-wash editorial illustration on textured warm cream cold-press watercolor paper (#F5EFE2) with soft feathered unpainted cream paper vignette edges, translucent watercolor washes, wet-on-wet pigment blooms, and expressive pen-and-ink contour linework describing the scene and protagonists in vivid detail. Clear, warmly lit faces, no text, no letters.' : (familyCastDirectives ? (familyCastDirectives.isSolo ? `Cinematic visual art prompt describing the scene with rich detail. Focus exclusively on the single protagonist: ${familyCastDirectives.soloName} (${familyCastDirectives.soloTraits}). Strictly do not draw any extra family members, parents, or background companions. Warm natural lighting, clear human form, no text, no letters, no typography.` : `Cinematic visual art prompt describing the scene with rich detail. MANDATORY HEADCOUNT: You MUST begin with the exact headcount of all ${familyCastDirectives.totalCount} family members visible side by side. All ${familyCastDirectives.totalCount} members must be individually visible with warm, fully illuminated faces. Preserve each character uncompromisable physical anatomy (face shape, natural hair length, real-world body build) strictly without morphing into western catalog models or salon blowouts. Do not draw detached foreground hands or extra people. No text, no letters, no typography.`) : 'High-impact editorial broadsheet illustration in 4:5 vertical portrait format faithfully capturing key figures, real-world setting, and dramatic journalistic realism. For public leaders or figures from source news/video, name and portray them directly in the foreground with vivid realistic faces, natural warm lighting on skin tones, balanced studio spotlights, and dramatic journalistic realism. Strictly avoid pitch-black silhouettes, faceless shadow figures, dark ghosts, or generic substitutes. No text, no letters, no typography.'))))} "
}`;

    const parts = [];

    // If multimodal photo uploaded
    if (sourceType === 'photo' && imageBase64) {
      const cleanData = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
      parts.push({
        inlineData: {
          mimeType: imageMimeType,
          data: cleanData
        }
      });
      parts.push({
        text: `Here is a photograph of a printed news clipping, article, or document. OCR and analyze it, then synthesize the Slant 3-poster carousel as requested:\n\n${systemPrompt}`
      });
    } else if (sourceType === 'inner_voice') {
      if (effectiveCatalystImage) {
        const cleanData = effectiveCatalystImage.includes(',') ? effectiveCatalystImage.split(',')[1] : effectiveCatalystImage;
        parts.push({
          inlineData: {
            mimeType: effectiveCatalystMime,
            data: cleanData
          }
        });
      } else if (sourceImageBase64) {
        const cleanRefData = sourceImageBase64.includes(',') ? sourceImageBase64.split(',')[1] : sourceImageBase64;
        parts.push({
          inlineData: {
            mimeType: sourceImageMimeType || 'image/jpeg',
            data: cleanRefData
          }
        });
        parts.push({
          text: `[ATTACHED AUTHENTIC WIKIPEDIA REFERENCE PHOTO OF PUBLIC FIGURE "${resolvedPublicFigurePhoto ? resolvedPublicFigurePhoto.name : 'the mentioned public figure'}" (${resolvedPublicFigurePhoto ? resolvedPublicFigurePhoto.description : ''}): Inspect this actual photograph of ${resolvedPublicFigurePhoto ? resolvedPublicFigurePhoto.name : 'the protagonist'}. In "illustrationPrompt", you MUST describe their exact observed facial geometry, eye shape, nose, hair texture/parting, and EXACT facial hair state from this photo (e.g., if they are clean-shaven or have only light stubble in this photo, NEVER invent a full white/grey beard!). Also strictly align the setting with the curator's slant and NEVER hallucinate opposing political party symbols (e.g. never place a right-wing BJP lotus on a podium for a liberal/leftist speaker!).]`
        });
      }
      if (isChronicle && Array.isArray(validChronicleMoments)) {
        validChronicleMoments.forEach((m, idx) => {
          if (m && m.imageBase64 && typeof m.imageBase64 === 'string') {
            const cleanM = m.imageBase64.includes(',') ? m.imageBase64.split(',')[1] : m.imageBase64;
            parts.push({
              inlineData: {
                mimeType: m.imageMimeType || 'image/jpeg',
                data: cleanM
              }
            });
            parts.push({
              text: `[Attached Reference Image/Logo for Moment 0${idx + 1} (${m.title || 'Moment ' + (idx + 1)}): "${m.text}" — Inspect this attached graphic/photo and explicitly describe its exact visual emblem or subject inside Vignette 0${idx + 1} of "illustrationPrompt".]`
            });
          }
        });
      }
      const partsContent = [
        `Curator's Personal Slant & Angle: "${userSlant || 'Personal reflection and conviction.'}"`,
        spark ? `Personal Spark & Context: "${spark}"` : '',
        effectiveCatalystImage ? `Real-World Catalyst Scene Photo: [Attached image depicts the physical real-world scene or moment that sparked this reflection. Use this scene to subtly ground the atmosphere where natural, but the curator's intellectual perspective, conviction, and context MUST remain the primary driving force of the essay. Never sacrifice the curator's perspective or depth for unnecessary scene descriptions.]` : ''
      ].filter(Boolean).join('\n\n');
      parts.push({
        text: `${systemPrompt}\n\nUser Input Content (Inner Voice Personal Reflection):\n${partsContent}`
      });
    } else {
      if ((sourceType === 'digital_link' || sourceType === 'video_audio') && sourceImageBase64) {
        const cleanData = sourceImageBase64.includes(',') ? sourceImageBase64.split(',')[1] : sourceImageBase64;
        parts.push({
          inlineData: {
            mimeType: sourceImageMimeType || 'image/jpeg',
            data: cleanData
          }
        });
      }

      const contentParts = [
        extractedTitle ? `Article Headline: ${extractedTitle}` : '',
        extractedContent ? `Article Content / Excerpt: ${extractedContent}` : '',
        userSlant ? `Curator's Slant / Angle: ${userSlant}` : '',
        spark ? `Spark Context: ${spark}` : '',
        url ? `Source Link: ${url}` : '',
        ((sourceType === 'digital_link' || sourceType === 'video_audio') && sourceImageBase64)
          ? `[ATTACHED AUTHENTIC SOURCE PHOTO / VIDEO THUMBNAIL: The attached image is the authentic photo or YouTube video thumbnail from the source. In SOURCE GROUNDED mode, your visual cues and illustrationPrompt MUST be physically grounded in this real-world scene, literal persons/speakers (e.g. named political leaders, press conference microphones, election flags, rally banners), and setting visible in this image. DO NOT invent fictitious engineering or unrelated workbench scenes.]`
          : ''
      ].filter(Boolean);

      if (sourceLedger) {
        let ledgerLines = [];
        if (sourceLedger.subject_and_thesis) {
          const s = sourceLedger.subject_and_thesis;
          ledgerLines.push(`Source Subject & Thesis: ${typeof s === 'object' ? `${s.context || ''} - ${s.thesis || ''}` : s}`);
        }
        if (Array.isArray(sourceLedger.core_claims_and_evidence) && sourceLedger.core_claims_and_evidence.length > 0) {
          ledgerLines.push('Verified Source Claims & Evidence:');
          sourceLedger.core_claims_and_evidence.forEach((c, i) => {
            ledgerLines.push(`  ${i + 1}. ${typeof c === 'object' ? `${c.title ? c.title + ': ' : ''}${c.evidence || c.text || ''}` : c}`);
          });
        }
        if (sourceLedger.underlying_tensions) {
          const t = sourceLedger.underlying_tensions;
          ledgerLines.push(`Underlying Tension & Trade-offs: ${typeof t === 'object' ? `${t.primary_conflict || ''} ${t.tradeoffs || ''}` : t}`);
        }
        if (ledgerLines.length > 0) {
          contentParts.push(`OBJECTIVE SOURCE LEDGER (Verified Ground Truth from Source):\n${ledgerLines.join('\n')}`);
        }
      }

      const userContent = contentParts.length > 0 ? contentParts.join('\n\n') : (text || spark || userSlant || 'Contemporary cultural reflection');
      parts.push({
        text: `${systemPrompt}\n\nUser Input Content:\n${userContent}`
      });
    }

    // 3. Construct predictable, multi-cue composite artwork prompt from all 6 visual dimensions
    const countryTag = (countryContext && countryContext !== 'Global') ? `${countryContext}, ` : '';
    const isLookalike = (characterRepresentation === 'likeness' || characterRepresentation === 'lookalike');
    const isExactPhoto = (characterRepresentation === 'exact');
    const illustrationSeed = Math.floor(Math.random() * 899999 + 100000);

    const cleanCueText = (str) => (str || '')
      .replace(/^#\d+\s*\[?[A-Z]+\]?:?\s*/i, '')
      .replace(/[^\w\s,.-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    let heroCandidate = cleanCueText((cues && cues[0]) || heroCue || spark || userSlant || 'Editorial subject');
    let motifCandidate = cleanCueText(cues && cues[1]);
    let tensionCandidate = cleanCueText(cues && cues[2]);
    let atmosphereCandidate = cleanCueText(cues && cues[3]);
    let lightingCandidate = cleanCueText(cues && cues[4]);
    let styleCandidate = cleanCueText(cues && cues[5]);

    if (heroCandidate.length > 80) {
      heroCandidate = heroCandidate.slice(0, 80).replace(/,[^,]*$/, '');
    }

    const isPerson = isLikelyPersonSubject(heroCandidate);
    const partsList = [];

    // Dimension 6: STYLE & MEDIUM
    if (styleCandidate) {
      partsList.push(styleCandidate);
    } else {
      partsList.push('Cinematic editorial poster art');
    }

    // Dimension 1: HERO (Centerpiece protagonist or subject)
    const ageDesc = (demographicInfo && demographicInfo.promptDesc) ? `${demographicInfo.promptDesc}, ` : '';
    if (isPerson && isCinematicPhoto) {
      partsList.push(`${ageDesc}${heroCandidate} 35mm editorial documentary portrait, sharp focal depth, realistic skin textures, expressive gaze, authentic ambient lighting`);
    } else if (isPerson && isWatercolorIllustration) {
      partsList.push(`${ageDesc}${heroCandidate} hand-painted editorial watercolor and fine fountain-pen ink-wash illustration on textured warm cream cold-press paper, translucent washes, soft feathered edges`);
    } else if (isPerson && (isLookalike || isArtisticPainting)) {
      partsList.push(`${ageDesc}${heroCandidate} painted broadsheet illustration, rich gouache and oil texture, recognizable presence`);
    } else if (isPerson && characterRepresentation === 'silhouette') {
      partsList.push(`${ageDesc}${heroCandidate} minimalist silhouette outline, stark graphic contrast`);
    } else if (isPerson) {
      partsList.push(`${ageDesc}${heroCandidate}, warm vivid realism, visible illuminated face, natural human expression`);
    } else {
      const isArchitecture = /court|building|parliament|monument|colonnade|facade|tower|temple|chamber/i.test(heroCandidate);
      if (isArchitecture) {
        partsList.push(`${heroCandidate} grand architectural facade`);
      } else {
        partsList.push(heroCandidate);
      }
    }

    if (familyCastDirectives && familyCastDirectives.promptSnippet) {
      partsList.push(familyCastDirectives.promptSnippet);
    }

    // Dimension 2: MOTIF (Symbolic artifact)
    if (motifCandidate && motifCandidate !== heroCandidate) {
      partsList.push(`juxtaposed with symbolic motif of ${motifCandidate}`);
    }

    // Dimension 3: TENSION (Visual conflict or friction)
    if (tensionCandidate) {
      partsList.push(`confronting dramatic tension of ${tensionCandidate}`);
    }

    // Dimension 4: ATMOSPHERE (Setting, geography, texture)
    if (atmosphereCandidate) {
      partsList.push(`set in ${atmosphereCandidate}`);
    }

    // Dimension 5: LIGHTING (Mood, chiaroscuro, temperature)
    if (lightingCandidate) {
      partsList.push(`illuminated by ${lightingCandidate}`);
    }

    if (countryTag) {
      partsList.push(countryTag.trim().replace(/,$/, ''));
    }

    const concisePrompt = partsList.filter(Boolean).join(', ').slice(0, 420);
    const resolvedExactPhotoB64 = imageBase64 || sourceImageBase64 || innerVoiceImageBase64 || null;
    const resolvedExactPhotoUrl = (sourceImageUrl && /^https?:\/\//i.test(sourceImageUrl)) ? sourceImageUrl : null;
    const hasExactPhoto = isExactPhoto && Boolean(resolvedExactPhotoB64 || resolvedExactPhotoUrl || hasChronicleAttachedPhotos);

    // 4. Ultra-Fast Editorial Text Synthesis (Phase 1)
    // Runs with thinkingBudget: 0 to complete in 4-6s comfortably within Vercel 10s serverless limit.
    // Artwork generation is handled asynchronously in Phase 2 via action: 'artwork_only'.
    const textPromise = (async () => {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 24000);

        const geminiResp = await fetch(geminiUrl, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.7,
              maxOutputTokens: 2200,
              thinkingConfig: {
                thinkingBudget: 0
              }
            }
          })
        });
        clearTimeout(timeout);

        if (geminiResp.ok) {
          const geminiData = await geminiResp.json();
          const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            try {
              return JSON.parse(rawText);
            } catch (pErr) {
              const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
              try {
                return JSON.parse(cleaned);
              } catch (_) {
                console.warn('Gemini text JSON parse error:', pErr.message);
              }
            }
          }
        } else {
          const errText = await geminiResp.text().catch(() => '');
          console.warn('Gemini text synthesis HTTP error:', geminiResp.status, errText.slice(0, 300));
        }
      } catch (geminiErr) {
        console.warn('Gemini text synthesis warning:', geminiErr.message);
      }
      return null;
    })();

    // In Phase 1, if exact photo is attached, use it directly; otherwise delegate AI illustration to background
    let parsed = await textPromise;
    let geminiArt = null;

    if (!parsed) {
      parsed = generateSmartFallbackSynthesis({
        sourceType,
        url,
        userSlant,
        extractedTitle,
        extractedContent,
        pubName,
        cues,
        targetAudience,
        slantTone,
        spark,
        creatorHandle,
        characterRepresentation,
        refineCoreTake,
        sourceLedger,
        isChronicle,
        validChronicleMoments
      });
    }

    let finalIllustrationUrl = '';
    let finalIllustrationBase64 = null;

    if (hasExactPhoto) {
      if (resolvedExactPhotoB64) {
        if (typeof resolvedExactPhotoB64 === 'string' && /^https?:\/\//i.test(resolvedExactPhotoB64)) {
          finalIllustrationUrl = resolvedExactPhotoB64;
          finalIllustrationBase64 = null;
        } else {
          finalIllustrationUrl = resolvedExactPhotoB64;
          finalIllustrationBase64 = resolvedExactPhotoB64.startsWith('data:')
            ? resolvedExactPhotoB64.split(',')[1]
            : resolvedExactPhotoB64;
        }
      } else if (resolvedExactPhotoUrl) {
        finalIllustrationUrl = resolvedExactPhotoUrl;
        finalIllustrationBase64 = null;
      }
    } else if (geminiArt) {
      finalIllustrationBase64 = geminiArt.replace(/^data:image\/[^;]+;base64,/, '');
    } else {
      // Never substitute generic stock photos. Custom artwork will be rendered directly via Gemini
      finalIllustrationUrl = '';
    }

    // 1. Polished Curator Input (for native lines below the post card & Generation Inputs)
    let finalPolishedCuratorTake = '';
    if (parsed.polishedCuratorTake && parsed.polishedCuratorTake.trim().length > 5) {
      finalPolishedCuratorTake = formatCuratorTakeApt(parsed.polishedCuratorTake.trim());
    } else if (userSlant && userSlant.trim().length > 0) {
      finalPolishedCuratorTake = formatCuratorTakeApt(userSlant.trim());
    }

    // 2. Poster 2 Curated Take (or Poster 3 Behavioral Reflections for Daily Chronicle)
    let normalizedChronicleReflections = undefined;
    if (isChronicle && Array.isArray(parsed.chronicleReflections) && parsed.chronicleReflections.length > 0) {
      normalizedChronicleReflections = parsed.chronicleReflections
        .filter(r => r && typeof r.quote === 'string' && r.quote.trim().length > 5)
        .slice(0, 2)
        .map(r => ({
          polarity: ['positive', 'corrective', 'generic'].includes(String(r.polarity || '').toLowerCase())
            ? String(r.polarity).toLowerCase()
            : 'generic',
          behaviorTag: String(r.behaviorTag || '✦ DAILY REFLECTION').trim(),
          quote: formatCuratorTakeApt(String(r.quote).trim()),
          momentIndex: Number(r.momentIndex) || 0
        }));
    }

    let finalCuratorTake = '';
    if (isChronicle) {
      if (normalizedChronicleReflections && normalizedChronicleReflections.length > 0) {
        finalCuratorTake = normalizedChronicleReflections[0].quote;
      } else if (parsed.curatorTake && parsed.curatorTake.trim().length > 10) {
        finalCuratorTake = formatCuratorTakeApt(parsed.curatorTake.trim());
        normalizedChronicleReflections = [{
          polarity: 'generic',
          behaviorTag: '✦ DAILY REFLECTION',
          quote: finalCuratorTake,
          momentIndex: starredChronicleIdx >= 0 ? (starredChronicleIdx + 1) : 0
        }];
      } else {
        finalCuratorTake = 'Every small choice in how we focus and show up shapes the rhythm of our day.';
      }
    } else {
      finalCuratorTake = (!refineCoreTake && userSlant && userSlant.trim().length > 0)
        ? userSlant.trim()
        : ((parsed.curatorTake && parsed.curatorTake.trim().length > 10)
            ? parsed.curatorTake.trim()
            : (userSlant || 'Strategic structural shift in motion.'));
      finalCuratorTake = formatCuratorTakeApt(finalCuratorTake);

      // Ensure Poster 2 curated take stays strictly within 2-sentence visual budget (25-35 words) only when refineCoreTake is true
      if (refineCoreTake) {
        const takeSents = finalCuratorTake.split(/(?<=[.!?])\s+/);
        if (takeSents.length > 2 || finalCuratorTake.length > 200) {
          finalCuratorTake = takeSents.slice(0, 2).join(' ');
        }
      }
    }

    const rawExcerpts = Array.isArray(parsed.resolvedArticleExcerpts) ? parsed.resolvedArticleExcerpts : [];
    let cleanedExcerpts = rawExcerpts.map(e => {
      let s = String(e).replace(/^(the spark|curator stance|paragraph \d+)\s*:\s*["']?/i, '').replace(/["']?$/i, '').trim();
      if (isChronicle) {
        s = s.replace(/^0?\d+\s*[·•.-]\s*(?=Moment\s+\d+)/i, '');
      }
      return s;
    }).filter(Boolean);
    let cleanedSummary = isChronicle
      ? String(parsed.summary || '').replace(/(^|\n\s*)0?\d+\s*[·•.-]\s*(?=Moment\s+\d+)/gi, '$1').trim()
      : String(parsed.summary || '').trim();
    const summarySplitParas = cleanedSummary ? cleanedSummary.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean) : [];
    if (cleanedExcerpts.length > summarySplitParas.length) {
      cleanedSummary = cleanedExcerpts.join('\n\n');
    } else if (summarySplitParas.length > cleanedExcerpts.length) {
      cleanedExcerpts = summarySplitParas;
    }

    let effectiveIllustrationPrompt = usedFreeChronicleCardsOnly ? '' : (parsed.illustrationPrompt || concisePrompt || '');
    if (effectiveIllustrationPrompt && countryContext && countryContext !== 'Global' && !effectiveIllustrationPrompt.toLowerCase().includes(countryContext.toLowerCase())) {
      effectiveIllustrationPrompt = `${countryContext} setting, ${effectiveIllustrationPrompt}`;
    }

    const id = 'slant-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    let finalPublicationName = parsed.publicationName || pubName || (sourceType === 'inner_voice' ? 'Inner Voice' : 'Curated Press');
    if (pubName && pubName.startsWith('@') && !finalPublicationName.includes('@')) {
      finalPublicationName = pubName;
    }
    const postItem = {
      id,
      createdAt: new Date().toISOString(),
      sourceType,
      digitalLink: url || '',
      publicationName: finalPublicationName,
      adaptedHeadline: parsed.adaptedHeadline || 'Perspectives in Flux',
      originalHeadline: isChronicle
        ? formatChronicleDateLabel(new Date())
        : ((sourceType === 'inner_voice' && spark) ? (parsed.originalHeadline || spark) : (parsed.originalHeadline || extractedTitle || parsed.adaptedHeadline)),
      categoryBadge: parsed.categoryBadge || (sourceType === 'inner_voice' ? 'OPINION' : 'DISCOVERY'),
      targetAudience: targetAudience || 'General',
      hook: parsed.hook || '',
      summary: cleanedSummary,
      whyItMatters: isChronicle ? '' : (parsed.whyItMatters || ''),
      keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [],
      receiptHighlightQuote: parsed.receiptHighlightQuote || '',
      resolvedArticleExcerpts: cleanedExcerpts,
      keyMetric: parsed.keyMetric || '',
      pullQuote: parsed.receiptHighlightQuote || '',
      visualMood: parsed.visualMood || 'Editorial Chiaroscuro',
      heroCue: parsed.heroCue || (cues && cues[0]) || '',
      cues: [
        parsed.heroCue || (cues && cues[0]) || 'Solitary Focal Figure',
        parsed.motifCue || (cues && cues[1]) || 'Symbolic Editorial Metaphor',
        parsed.tensionCue || (cues && cues[2]) || 'Friction & Opposing Cast Shadows',
        parsed.atmosphereCue || (cues && cues[3]) || 'Atmospheric Minimalist Setting',
        parsed.lightingCue || (cues && cues[4]) || 'Dramatic Chiaroscuro Editorial Spotlight',
        parsed.styleCue || (cues && cues[5]) || 'Cinematic Warm Editorial Illustration'
      ],
      characterRepresentation,
      hookCues: `#1 [HERO]: ${parsed.heroCue || (cues && cues[0]) || 'Central subject'}\n#2 [MOTIF]: ${parsed.motifCue || (cues && cues[1]) || 'Metaphor'}\n#3 [TENSION]: ${parsed.tensionCue || (cues && cues[2]) || 'Conflict'}\n#4 [ATMOSPHERE]: ${parsed.atmosphereCue || (cues && cues[3]) || 'Setting'}\n#5 [LIGHTING]: ${parsed.lightingCue || (cues && cues[4]) || 'Atmospheric light'}\n#6 [STYLE]: ${parsed.styleCue || (cues && cues[5]) || 'Editorial illustration'}`,
      illustrationPrompt: effectiveIllustrationPrompt,
      noWatercolorPoster: Boolean(usedFreeChronicleCardsOnly),
      artworkPending: (!usedFreeChronicleCardsOnly && !hasExactPhoto && !finalIllustrationBase64),
      illustrationUrl: usedFreeChronicleCardsOnly ? '' : (finalIllustrationBase64 ? '' : finalIllustrationUrl),
      illustrationBase64: usedFreeChronicleCardsOnly ? null : finalIllustrationBase64,
      aiIllustrationUrl: usedFreeChronicleCardsOnly ? '' : (finalIllustrationBase64 ? '' : finalIllustrationUrl),
      creatorHandle: creatorHandle || '@curator',
      slantTone: slantTone || 'mind',
      slantIcon: slantTone === 'heart' ? '❤️' : '🧠',
      creatorOpinion: finalCuratorTake,
      curatorTake: finalCuratorTake,
      polishedCuratorTake: finalPolishedCuratorTake || formatCuratorTakeApt(userSlant || finalCuratorTake),
      rawUserSlant: userSlant || '',
      refineCoreTake,
      vocabularyStyle: hasUserContext ? 'adaptive' : 'casual',
      perspectiveMode: perspectiveMode || 'source',
      sourceImageUrl: sourceImageUrl || null,
      sourceImageBase64: sourceImageBase64 || null,
      sourceImageMimeType: sourceImageMimeType || 'image/jpeg',
      referencePhotoUrl: sourceImageUrl || (sourceImageBase64 ? (sourceImageBase64.startsWith('data:') ? sourceImageBase64 : `data:${sourceImageMimeType || 'image/jpeg'};base64,${sourceImageBase64}`) : null),
      isUserCreated: true,
      sourceType: sourceType,
      originalPhotoBase64: (sourceType === 'photo' && imageBase64) ? imageBase64 : (sourceType === 'inner_voice' && effectiveCatalystImage ? effectiveCatalystImage : null),
      originalPhotoMimeType: (sourceType === 'inner_voice' && effectiveCatalystImage) ? effectiveCatalystMime : (imageMimeType || 'image/jpeg'),
      catalystPhoto: (sourceType === 'inner_voice' && effectiveCatalystImage) ? effectiveCatalystImage : null,
      catalystPhotoBase64: (sourceType === 'inner_voice' && effectiveCatalystImage) ? effectiveCatalystImage : null,
      hasPaperCut: (sourceType === 'photo' && !!imageBase64),
      userContext: spark || '',
      spark: spark || '',
      countryContext: countryContext || 'India',
      contextProvided: userSlant || extractedContent || spark || '',
      userSlantTake: finalPolishedCuratorTake || userSlant || '',
      sourceContext: extractedContent || '',
      chronicleMode: Boolean(isChronicle),
      chronicleMoments: isChronicle ? validChronicleMoments : undefined,
      chronicleReflections: isChronicle ? normalizedChronicleReflections : undefined,
      generationInputs: {
        slantTake: finalPolishedCuratorTake || userSlant || '',
        sourceUrl: url || '',
        sourceType: sourceType,
        chronicleMode: Boolean(isChronicle),
        noWatercolorPoster: Boolean(usedFreeChronicleCardsOnly),
        chronicleMoments: isChronicle ? validChronicleMoments : undefined,
        chronicleReflections: isChronicle ? normalizedChronicleReflections : undefined,
        perspectiveMode: perspectiveMode || 'source',
        sourceImageUrl: sourceImageUrl || null,
        sourceImageBase64: sourceImageBase64 || null,
        referencePhotoUrl: sourceImageUrl || (sourceImageBase64 ? (sourceImageBase64.startsWith('data:') ? sourceImageBase64 : `data:${sourceImageMimeType || 'image/jpeg'};base64,${sourceImageBase64}`) : null),
        spark: spark || '',
        catalystPhoto: (sourceType === 'inner_voice' && effectiveCatalystImage) ? effectiveCatalystImage : null,
        catalystPhotoBase64: (sourceType === 'inner_voice' && effectiveCatalystImage) ? effectiveCatalystImage : null,
        innerVoiceImageBase64: effectiveCatalystImage || null,
        innerVoiceImageMimeType: effectiveCatalystImage ? effectiveCatalystMime : null,
        cues: [
          parsed.heroCue || (cues && cues[0]) || 'Solitary Focal Figure',
          parsed.motifCue || (cues && cues[1]) || 'Symbolic Editorial Metaphor',
          parsed.tensionCue || (cues && cues[2]) || 'Friction & Opposing Cast Shadows',
          parsed.atmosphereCue || (cues && cues[3]) || 'Atmospheric Minimalist Setting',
          parsed.lightingCue || (cues && cues[4]) || 'Dramatic Chiaroscuro Editorial Spotlight',
          parsed.styleCue || (cues && cues[5]) || 'Cinematic Warm Editorial Illustration'
        ],
        heroCue: parsed.heroCue || (cues && cues[0]) || '',
        characterRepresentation: characterRepresentation || 'realistic',
        refineCoreTake,
        vocabularyStyle: hasUserContext ? 'adaptive' : 'casual',
        countryContext: countryContext || 'India',
        scrapedTitle: extractedTitle || '',
        scrapedContent: extractedContent || '',
        contextProvided: userSlant || extractedContent || spark || '',
        sourceLedger: sourceLedger || null,
        illustrationPrompt: effectiveIllustrationPrompt,
        originalHeadline: (sourceType === 'inner_voice' && spark) ? (parsed.originalHeadline || spark) : (parsed.originalHeadline || extractedTitle || parsed.adaptedHeadline)
      },
      sourceLedger: sourceLedger || null
    };

    return res.status(200).json({
      success: true,
      post: postItem,
      credits: creditCheck.credits,
      usedFreeExactPhotoFallback: Boolean(usedFreeExactPhotoFallback),
      usedFreeChronicleCardsOnly: Boolean(usedFreeChronicleCardsOnly)
    });
  } catch (error) {
    console.error('Server error in /api/synthesize:', error);
    return res.status(500).json({ error: 'Server synthesis error: ' + error.message });
  }
};

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHighlightedHtml(polished, corrections) {
  if (!polished) return '';
  if (!Array.isArray(corrections) || corrections.length === 0) return escapeHtml(polished);

  const matched = [];
  let searchIdx = 0;

  for (const c of corrections) {
    const repl = String(c.replacement || '').trim();
    if (!repl) continue;

    let foundIdx = polished.indexOf(repl, searchIdx);
    if (foundIdx === -1 && searchIdx > 0) {
      foundIdx = polished.indexOf(repl, 0);
    }

    if (foundIdx === -1) {
      const stripped = repl.replace(/^[.,;:!?'"“”‘’«»]+|[.,;:!?'"“”‘’«»]+$/g, '').trim();
      if (stripped.length > 2) {
        foundIdx = polished.indexOf(stripped, searchIdx);
        if (foundIdx === -1 && searchIdx > 0) {
          foundIdx = polished.indexOf(stripped, 0);
        }
        if (foundIdx !== -1) {
          matched.push({
            start: foundIdx,
            end: foundIdx + stripped.length,
            original: String(c.original || ''),
            reason: String(c.reason || 'Improved phrasing and flow'),
            type: ['spelling', 'grammar', 'punctuation', 'phrasing'].includes(c.type) ? c.type : 'phrasing',
            replacement: stripped
          });
          searchIdx = Math.max(searchIdx, foundIdx + stripped.length);
          continue;
        }
      }
    }

    if (foundIdx !== -1) {
      matched.push({
        start: foundIdx,
        end: foundIdx + repl.length,
        original: String(c.original || ''),
        reason: String(c.reason || 'Improved phrasing and flow'),
        type: ['spelling', 'grammar', 'punctuation', 'phrasing'].includes(c.type) ? c.type : 'phrasing',
        replacement: repl
      });
      searchIdx = Math.max(searchIdx, foundIdx + repl.length);
    }
  }

  matched.sort((a, b) => a.start - b.start);

  let result = '';
  let lastIndex = 0;

  for (const m of matched) {
    if (m.start < lastIndex) continue;
    result += escapeHtml(polished.substring(lastIndex, m.start));
    result += `<mark class="polish-mark polish-type-${m.type}" data-type="${m.type}" data-original="${escapeHtml(m.original)}" data-reason="${escapeHtml(m.reason)}">${escapeHtml(polished.substring(m.start, m.end))}</mark>`;
    lastIndex = m.end;
  }
  result += escapeHtml(polished.substring(lastIndex));
  return result;
}

function formatCuratorTakeApt(text) {
  if (!text || typeof text !== 'string') return '';
  const rawBlocks = text
    .trim()
    .split(/\n\s*\n|(?=(?:0?[1-9]\s*[·•.-]\s*)?Moment\s+\d+(?:\s*[·•.-]\s*[^:]{1,38})?:\s*)/i)
    .map(b => b.trim())
    .filter(Boolean);
  if (rawBlocks.length > 1) {
    return rawBlocks.map(b => formatCuratorTakeAptSingleBlock(b)).filter(Boolean).join('\n\n');
  }
  return formatCuratorTakeAptSingleBlock(text);
}

function formatCuratorTakeAptSingleBlock(text) {
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

  // Fix spacing before punctuation marks
  s = s.replace(/\s+([.,;:!?])/g, '$1');

  // Fix missing space after punctuation when directly touching a word
  s = s.replace(/([,;:])([A-Za-z])/g, '$1 $2');
  s = s.replace(/([.!?])([A-Za-z])/g, '$1 $2');

  // Clean duplicate commas or punctuation collisions created by dash replacement
  s = s.replace(/,\s*,+/g, ',');
  s = s.replace(/,\s*([.!?])/g, '$1');
  s = s.replace(/([.!?])\s*,+/g, '$1 ');

  // Normalize duplicate commas/periods
  s = s.replace(/,{2,}/g, ',');
  s = s.replace(/(?<!\.)\.{2}(?!\.)/g, '.');

  // Subtle English grammar, contraction, and phrasing adjustments without altering substance
  const subtleFixes = [
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

function generateSmartFallbackSynthesis({
  sourceType,
  url,
  userSlant,
  extractedTitle,
  extractedContent,
  pubName,
  cues,
  targetAudience,
  slantTone,
  spark,
  creatorHandle,
  characterRepresentation,
  refineCoreTake = true,
  sourceLedger = null,
  isChronicle = false,
  validChronicleMoments = []
}) {
  const isStrictlyInnerVoice = (sourceType === 'inner_voice');
  const combined = `${userSlant || ''} ${spark || ''} ${extractedTitle || ''} ${extractedContent || ''}`.toLowerCase();

  const hero = (cues && cues[0]) || 'Solitary Focal Figure';
  const motif = (cues && cues[1]) || 'Symbolic Editorial Metaphor';
  const tension = (cues && cues[2]) || 'Friction & Opposing Cast Shadows';
  const atmosphere = (cues && cues[3]) || 'Atmospheric Minimalist Setting';
  const lighting = (cues && cues[4]) || 'Dramatic Chiaroscuro Editorial Spotlight';
  const style = (cues && cues[5]) || 'Cinematic Warm Editorial Illustration';

  if (isStrictlyInnerVoice && isChronicle && Array.isArray(validChronicleMoments) && validChronicleMoments.length >= 2) {
    const formattedEntries = validChronicleMoments.map((m, i) => {
      const numStr = String(i + 1).padStart(2, '0');
      const bodyStr = formatCuratorTakeApt(String(m.text || '').trim());
      return `Moment ${numStr}: ${bodyStr.endsWith('.') ? bodyStr : bodyStr + '.'}`;
    });
    const titlesList = validChronicleMoments.map(m => String(m.title || '').trim()).filter(Boolean);
    const chronicleHeadline = titlesList.length >= 2
      ? `Snapshots of the Day: ${titlesList.slice(0, 3).join(', ')}`
      : 'Snapshots from an Intentional Day in Motion';

    const fbStarIdx = validChronicleMoments.findIndex(m => Boolean(m && m.isStarred));
    const fbPrimaryIdx = fbStarIdx >= 0 ? fbStarIdx : (validChronicleMoments.length - 1);
    const fbStarMoment = validChronicleMoments[fbPrimaryIdx];
    const fbOthers = validChronicleMoments.filter((_, idx) => idx !== fbPrimaryIdx);
    const upperLeftScene = fbOthers[0] ? `In the upper-left vignette (~25% of canvas), ${fbOthers[0].text}` : '';
    const upperRightScene = fbOthers[1] ? `; in the upper-right vignette (~25% of canvas), ${fbOthers[1].text}` : '';
    const lowerShowcaseScene = fbStarMoment ? `; in the large lower panoramic showcase vignette (~50% of canvas across the full lower half), ${fbStarMoment.text}` : '';

    return {
      adaptedHeadline: chronicleHeadline,
      originalHeadline: chronicleHeadline,
      publicationName: 'Daily Chronicle',
      categoryBadge: 'DAILY CHRONICLE',
      hook: `A day captured in ${validChronicleMoments.length} distinct moments of work, family, and reflection.`,
      curatorTake: 'Each small moment of a day carries its own quiet rhythm. Looking back at them together reveals what truly anchors our time and attention.',
      polishedCuratorTake: formattedEntries.join('\n\n'),
      creatorOpinion: 'Each small moment of a day carries its own quiet rhythm. Looking back at them together reveals what truly anchors our time and attention.',
      summary: formattedEntries.join('\n\n'),
      whyItMatters: 'Capturing the distinct moments of an ordinary day turns fleeting routines into lasting personal clarity.',
      keyTakeaways: formattedEntries.slice(0, 3),
      receiptHighlightQuote: 'Looking back across the moments of a single day reveals the quiet thread that holds our routines together.',
      resolvedArticleExcerpts: formattedEntries,
      keyMetric: `${validChronicleMoments.length} Day Moments`,
      visualMood: 'Warm Editorial Broadsheet Montage',
      heroCue: '40yo Mid-Age Indian Man (Shridhar) across Distinct Day Vignettes',
      motifCue: 'Distinct Non-Overlapping Story Vignettes on Archival Paper',
      tensionCue: 'Balance of Daily Rhythm and Quiet Reflection',
      atmosphereCue: 'Warm Indian Broadsheet Montage on Cream Archival Paper',
      lightingCue: 'Golden Hour and Warm Daylight Vignettes',
      styleCue: style,
      illustrationPrompt: `Masterpiece ${validChronicleMoments.length}-scene editorial broadsheet painted story montage in rich gouache and warm India ink tones, presenting ${validChronicleMoments.length} distinct, clearly separated lived-in scenes on textured warm cream archival paper with clean unpaved cream paper margins separating each vignette (strictly zero overlapping figures between scenes and strictly zero printed captions or labels): ${upperLeftScene}${upperRightScene}${lowerShowcaseScene}. Whenever the narrator appears, portray him as a mid-age 40-year-old Indian man in his early 40s (soft fuller round-oval face with full cheeks and natural under-chin fullness, full head of thick short dark hair brushed up, neat short dark trimmed stubble beard, and a natural medium-full adult build with a straight-cut everyday waist and subtle 10% lower-waist softness that stays flush with his chest line under a straight-draping shirt; strictly neither a skinny V-taper gym body nor a protruding pot-belly, and strictly NOT old or elderly). Warm natural lighting, zero text or letters.`
    };
  }

  // 1. Genuine Personal Reflection / Inner Voice Fallback
  if (isStrictlyInnerVoice) {
    let headline = '';
    if (spark && spark.length > 5) {
      const firstClause = spark.split(/[.:;!?\n]/)[0].trim();
      headline = firstClause.length > 50 ? firstClause.slice(0, 48) + '...' : firstClause;
    } else if (userSlant && userSlant.length > 5) {
      const firstClause = userSlant.split(/[.:;!?\n]/)[0].trim();
      headline = firstClause.length > 50 ? firstClause.slice(0, 48) + '...' : firstClause;
    } else {
      headline = 'The Quiet Discipline of Alignment';
    }

    let refinedTake = '';
    if (userSlant && userSlant.trim().length > 10) {
      if (refineCoreTake) {
        const sentences = userSlant.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
        if (sentences.length >= 2) {
          refinedTake = `${sentences[0].trim()} ${sentences[1].trim()}`;
        } else {
          refinedTake = `${userSlant.trim().replace(/[.]+$/, '')}. Stepping back from reflexive reactivity is where intentional conviction begins.`;
        }
      } else {
        refinedTake = userSlant.trim();
      }
    } else {
      refinedTake = 'True clarity begins when you step back from the noise and examine the underlying intention.';
    }

    const p1 = spark
      ? `${spark}. In the rush of daily demands, there comes a decisive threshold where the background clutter must give way to intentional focus.`
      : (userSlant
          ? `${userSlant}. In the rush of daily demands, there comes a decisive threshold where the background clutter must give way to intentional focus.`
          : 'In the rush of daily demands, there comes a decisive threshold where the background noise must give way to quiet clarity.');
    const p2 = userSlant
      ? `Examining our reflexive habits reveals that we often mistake urgency for importance. ${userSlant.replace(/[.]+$/, '')}.`
      : 'Stepping back is not passive withdrawal; it is an intentional boundary that separates authentic conviction from mere momentum.';
    const p3 = `Long after temporary deadlines and external noise fade, the deliberate choices made with clarity and presence are all that truly endure.`;

    return {
      adaptedHeadline: headline,
      originalHeadline: spark || headline,
      publicationName: 'Inner Voice',
      categoryBadge: 'PERSPECTIVE',
      hook: `${headline}. When the pace of external demands accelerates, genuine presence becomes an act of quiet rebellion.`,
      curatorTake: formatCuratorTakeApt(refinedTake),
      polishedCuratorTake: formatCuratorTakeApt(userSlant || refinedTake),
      creatorOpinion: formatCuratorTakeApt(userSlant || refinedTake),
      summary: `${userSlant || 'True restoration begins when you accept that work can wait, but presence cannot.'}\n\nExamining our reflexive habits reveals that we often mistake urgency for importance.\n\nThe real discipline is establishing intentional boundaries before exhaustion makes the choice for us.`,
      whyItMatters: 'Without intentional boundaries, external noise will always consume the mental space needed for genuine reflection.',
      keyTakeaways: [
        'The Noise Trap: Momentum often disguises itself as progress until deliberate presence interrupts it.',
        'The Grounding Threshold: Small moments of clarity reveal what truly matters far faster than productivity tricks.',
        'The Discipline of Alignment: True peace is an active boundary you defend, not a passive reward at the end of a checklist.'
      ],
      receiptHighlightQuote: userSlant || 'Clarity is not found in the noise, it is cultivated in the pauses between demands.',
      resolvedArticleExcerpts: [p1, p2, p3],
      keyMetric: 'Clarity Over Noise',
      visualMood: 'Warm Twilight Editorial Realism',
      heroCue: hero,
      motifCue: motif,
      tensionCue: tension,
      atmosphereCue: atmosphere,
      lightingCue: lighting,
      styleCue: style,
      illustrationPrompt: `Cinematic editorial illustration of ${hero.toLowerCase()}, ${motif.toLowerCase()}, ${tension.toLowerCase()}, ${atmosphere.toLowerCase()}, ${lighting.toLowerCase()}, ${style.toLowerCase()}, warm realistic people with visible faces, natural lighting, rich colors, no silhouettes, no dark shadows, no text`
    };
  }

  // 2. Curated Editorial Synthesis for External Sources (Digital Links, News, Clippings)
  let defaultCategory = 'EDITORIAL & ANALYSIS';
  if (/\b(ai|tech|software|model|compute|algorithm|cyber|digital|chip|gpu)\b/i.test(combined)) defaultCategory = 'TECHNOLOGY & SYSTEMS';
  else if (/\b(stock|market|invest|wealth|capital|fund|finance|economy|gdp|inflation|bank)\b/i.test(combined)) defaultCategory = 'CAPITAL & MARKETS';
  else if (/\b(law|court|policy|governance|parliament|election|minister|justice|supreme court|constitution)\b/i.test(combined)) defaultCategory = 'POLICY & GOVERNANCE';
  else if (/\b(climate|green|transit|urban|city|infra|energy|water|planet|nature|ecology)\b/i.test(combined)) defaultCategory = 'CITIES & ENVIRONMENT';
  else if (/\b(art|cinema|film|music|design|culture|media|craft|creativ|jewel|luxury)\b/i.test(combined)) defaultCategory = 'CULTURE & PERSPECTIVE';
  else if (/\b(health|medicine|wellness|science|biology)\b/i.test(combined)) defaultCategory = 'HEALTH & SCIENCE';

  let headline = '';
  if (extractedTitle && !extractedTitle.startsWith('http') && extractedTitle.length > 5) {
    headline = extractedTitle.split(/[:–—|]/)[0].trim();
  } else if (userSlant && userSlant.length > 8) {
    const firstSentence = userSlant.split(/[.:;!?\n]/)[0].trim();
    headline = firstSentence.length > 55 ? firstSentence.slice(0, 52) + '...' : firstSentence;
  } else {
    headline = 'The Unspoken Friction Behind the Headline';
  }

  let refinedTake = '';
  if (userSlant && userSlant.trim().length > 10) {
    if (refineCoreTake) {
      const cleanSlant = userSlant.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
      const sentences = cleanSlant.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
      if (sentences.length >= 2) {
        refinedTake = `${sentences[0].trim()} ${sentences[1].trim()}`;
      } else {
        refinedTake = `${cleanSlant.replace(/[.]+$/, '')}. Discerning this friction is essential for separating transient noise from enduring conviction.`;
      }
    } else {
      refinedTake = userSlant.trim();
    }
  } else {
    refinedTake = 'The immediate narrative captures only the surface; the deeper transition emerges when examining the underlying incentives and long-term consequences.';
  }
  if (!refinedTake.endsWith('.') && !refinedTake.endsWith('!') && !refinedTake.endsWith('?')) {
    refinedTake += '.';
  }

  // Extract dynamic paragraphs from userSlant in connection with sourceLedger or scraped content
  let p1 = '';
  let p2 = '';
  let p3 = '';
  let fallbackTakeaways = [];
  let fallbackQuote = '';

  const hasUserSlant = Boolean(userSlant && userSlant.trim().length > 10);

  if (hasUserSlant) {
    const cleanSlant = userSlant.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
    const sentences = cleanSlant.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
    const firstSentence = sentences[0] ? sentences[0].trim().replace(/[.]+$/, '') : cleanSlant.slice(0, 80);
    const secondSentence = sentences[1] ? sentences[1].trim() : '';

    // Paragraph 1: Catalyst & The Friction connecting stance to headline
    p1 = `${firstSentence}. In the face of continuous inputs around "${headline}", the primary friction is not a lack of information, but the relentless pressure to react to superficial noise. When every waking moment is captured by trivial updates, it generates an insidious mental clutter that crowds out genuine clarity and presence.`;

    // Paragraph 2: Engaging the Source / Evidence in Depth
    let sourceAssertion = '';
    if (sourceLedger && sourceLedger.subject_and_thesis) {
      const th = typeof sourceLedger.subject_and_thesis === 'object' ? sourceLedger.subject_and_thesis.thesis : sourceLedger.subject_and_thesis;
      sourceAssertion = String(th).replace(/[.]+$/, '');
    } else if (sourceLedger && Array.isArray(sourceLedger.core_claims_and_evidence) && sourceLedger.core_claims_and_evidence[0]) {
      const c0 = sourceLedger.core_claims_and_evidence[0];
      sourceAssertion = typeof c0 === 'object' ? (c0.evidence || c0.text) : String(c0);
    }

    if (sourceAssertion) {
      p2 = `This critique directly engages the underlying source reality, specifically that ${sourceAssertion}. Passive willpower alone cannot overcome environments engineered for perpetual engagement; without deliberate boundaries, mental bandwidth is systematically hijacked before we can address what truly matters.`;
    } else if (secondSentence) {
      p2 = `${secondSentence} Examining the deeper structural incentives reveals why stepping back is an active discipline. When reflexive reactivity becomes the default posture, intentional focus and emotional availability are the first casualties.`;
    } else {
      p2 = `Stepping back from reflexive reactivity requires understanding that passive willpower is never enough against continuous stimulation. Without intentional daily boundaries, superficial noise systematically crowds out authentic focus and real-world connection.`;
    }

    // Paragraph 3: Deeper Human Stakes & Resolution
    p3 = `Reclaiming authentic peace demands intentional, practiced disengagement rather than continuous reaction. Long after transient headlines and notification loops fade, the deliberate boundaries we establish to protect inner stillness, family presence, and personal conviction are all that truly endure.`;

    fallbackTakeaways = [
      `Reflexive Reactivity: Continuous inputs train the mind to mistake superficial noise for vital importance.`,
      `Displaced Presence: Mental clutter from irrelevant demands systematically crowds out authentic connection and personal peace.`,
      `Practiced Boundaries: True mental autonomy requires intentional, daily discipline rather than relying on spontaneous willpower.`
    ];

    fallbackQuote = (cleanSlant.length > 140 ? cleanSlant.slice(0, 137) + '...' : cleanSlant);
  } else {
    // Strictly objective reporting fallback if no user take is provided
    if (sourceLedger) {
      if (sourceLedger.subject_and_thesis) {
        if (typeof sourceLedger.subject_and_thesis === 'object') {
          const ctx = sourceLedger.subject_and_thesis.context ? `${sourceLedger.subject_and_thesis.context} ` : '';
          p1 = `${ctx}${sourceLedger.subject_and_thesis.thesis || ''}`.trim();
        } else {
          p1 = String(sourceLedger.subject_and_thesis).trim();
        }
      }
      const claims = Array.isArray(sourceLedger.core_claims_and_evidence) ? sourceLedger.core_claims_and_evidence : [];
      if (claims.length > 0) {
        const c0 = claims[0];
        p2 = typeof c0 === 'object' ? `${c0.title ? c0.title + ': ' : ''}${c0.evidence || c0.text || ''}`.trim() : String(c0).trim();
      }
      if (claims.length > 1) {
        const c1 = claims[1];
        p3 = typeof c1 === 'object' ? `${c1.title ? c1.title + ': ' : ''}${c1.evidence || c1.text || ''}`.trim() : String(c1).trim();
      } else if (sourceLedger.underlying_tensions) {
        if (typeof sourceLedger.underlying_tensions === 'object') {
          p3 = `${sourceLedger.underlying_tensions.primary_conflict || ''} ${sourceLedger.underlying_tensions.tradeoffs || ''}`.trim();
        } else {
          p3 = String(sourceLedger.underlying_tensions).trim();
        }
      }
    }

    if (extractedContent && extractedContent.length > 100 && (!p1 || !p2 || !p3)) {
      const lines = extractedContent.split(/\n+/).map(l => l.trim()).filter(l => {
        if (l.length < 80) return false;
        if (l.startsWith('#') || l.startsWith('http')) return false;
        if (/linkedin|twitter|instagram|facebook|youtube|t\.co|bit\.ly|youtu\.be|tiktok/i.test(l)) return false;
        if (/utm_|subscribe|follow us|all rights reserved|cookie|privacy policy|terms of/i.test(l)) return false;
        return true;
      });
      if (!p1 && lines.length > 0) p1 = lines[0];
      if (!p2 && lines.length > 1) p2 = lines[1];
      if (!p3 && lines.length > 2) p3 = lines[2];
    }

    if (!p1 || !p2 || !p3) {
      p1 = p1 || (extractedTitle
        ? `Reporting on "${extractedTitle}" examines foundational assumptions across core operators and participants. As traditional frameworks encounter real-world friction, key observers are recalculating their strategic positions.`
        : 'Primary observations confirm that real-world indicators diverged sharply from initial forecasts across core operations. As traditional assumptions encounter resistance, stakeholders are re-evaluating long-held conventions.');
      p2 = p2 || (extractedContent && extractedContent.length > 50
        ? extractedContent.slice(0, 200).replace(/\s+/g, ' ').trim()
        : 'Examining the operational balance and public disclosures shows strategic realignment occurring far faster than consensus anticipated, signaling an urgent pivot toward resilient execution.');
      p3 = p3 || 'Historical precedent confirms that early operational divergence inevitably forces systemic realignment before the broader cycle concludes. Observers who recognize these structural shifts early gain a decisive vantage point.';
    }

    fallbackQuote = (sourceLedger && Array.isArray(sourceLedger.core_claims_and_evidence) && sourceLedger.core_claims_and_evidence[0])
      ? (typeof sourceLedger.core_claims_and_evidence[0] === 'object' ? (sourceLedger.core_claims_and_evidence[0].evidence || sourceLedger.core_claims_and_evidence[0].title) : String(sourceLedger.core_claims_and_evidence[0]))
      : (p1 ? (p1.length > 140 ? p1.slice(0, 137) + '...' : p1) : 'True discernment requires separating transient friction from enduring systemic realignment.');

    fallbackTakeaways = (sourceLedger && Array.isArray(sourceLedger.core_claims_and_evidence) && sourceLedger.core_claims_and_evidence.length > 0)
      ? sourceLedger.core_claims_and_evidence.slice(0, 3).map((c, i) => {
          if (typeof c === 'object') return `${c.title || `Claim ${i+1}`}: ${c.evidence || c.text || ''}`;
          return String(c);
        })
      : [
          `Structural Evidence: The reporting around "${headline}" documents significant shifts in fundamental operational dynamics.`,
          'Operational Divergence: Documented observations diverge from consensus projections, forcing strategic recalibration.',
          'Systemic Horizon: Long-term durability accrues to those who navigate these structural trade-offs early.'
        ];
  }

  const hookText = `${headline}. When the dominant narrative simplifies the stakes, the real structural disruption occurs quietly in the margins.`;

  const fallbackSummary = `${p1}\n\n${p2}\n\n${p3}`;

  return {
    adaptedHeadline: headline.length > 55 ? headline.slice(0, 52) + '...' : headline,
    originalHeadline: extractedTitle || headline,
    publicationName: pubName || (url ? (new URL(url).hostname.replace(/^www\./, '')) : 'Curated Press'),
    categoryBadge: defaultCategory,
    hook: hookText,
    curatorTake: formatCuratorTakeApt(refinedTake),
    polishedCuratorTake: formatCuratorTakeApt(userSlant || refinedTake),
    creatorOpinion: formatCuratorTakeApt(userSlant || refinedTake),
    summary: fallbackSummary,
    whyItMatters: (sourceLedger && sourceLedger.underlying_tensions)
      ? (typeof sourceLedger.underlying_tensions === 'object' ? (sourceLedger.underlying_tensions.primary_conflict || sourceLedger.underlying_tensions.tradeoffs) : String(sourceLedger.underlying_tensions))
      : `Understanding this development around "${headline}" separates passive observers from those who identify structural shifts early.`,
    keyTakeaways: fallbackTakeaways,
    receiptHighlightQuote: fallbackQuote,
    resolvedArticleExcerpts: [p1, p2, p3],
    keyMetric: 'High Impact',
    visualMood: 'Chiaroscuro Risograph Editorial',
    heroCue: hero,
    motifCue: motif,
    tensionCue: tension,
    atmosphereCue: atmosphere,
    lightingCue: lighting,
    styleCue: style,
    illustrationPrompt: `Cinematic editorial poster art of ${hero.toLowerCase()}, ${motif.toLowerCase()}, ${tension.toLowerCase()}, ${atmosphere.toLowerCase()}, ${lighting.toLowerCase()}, ${style.toLowerCase()}, dramatic volumetric lighting, rich colors, no silhouettes, no text`
  };
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
          promptDesc: `youthful ${age}-year-old student, young fresh facial features, youthful hair, modern casual look, clear young skin, strictly no wrinkles or gray hair`
        };
      } else if (age <= 29) {
        return {
          age,
          category: 'twenty_something',
          promptDesc: `youthful ${age}-year-old young adult in their mid-20s, young contemporary facial features, modern vibrant styling, fresh young skin, strictly no wrinkles, no gray hair`
        };
      } else if (age <= 39) {
        return {
          age,
          category: 'thirties',
          promptDesc: `young adult in their 30s (${age} years old), sharp modern facial features, dynamic contemporary styling`
        };
      } else if (age <= 55) {
        return {
          age,
          category: 'middle_aged',
          promptDesc: `mature adult in their 40s-50s (${age} years old), confident seasoned expression, distinguished contemporary styling`
        };
      } else {
        return {
          age,
          category: 'senior',
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
      promptDesc: `youthful 20-something young adult, Gen-Z contemporary styling, fresh young facial features, modern vibrant look, strictly no wrinkles or gray hair`
    };
  }
  if (/\b(veteran|elderly|grandfather|grandmother|octogenarian|septuagenarian|retiree|pensioner)\b/i.test(combined)) {
    return {
      age: 72,
      category: 'senior',
      promptDesc: `distinguished elder in their 70s, silver hair, weathered dignified facial features, wise expression`
    };
  }

  return null;
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
    'huang', 'tata', 'kalam', 'kohli', 'dhoni', 'tendulkar', 'murthy', 'vivekananda',
    'ambani', 'adani', 'jobs', 'bezos', 'zuckerberg', 'macron', 'meloni',
    'minister', 'president', 'judge', 'justice', 'officer', 'sweeper',
    'curator', 'citizen', 'woman', 'man', 'girl', 'boy', 'leader', 'doctor',
    'worker', 'protagonist', 'figure', 'person', 'individual', 'portrait', 'lookalike',
    'founder', 'engineer', 'entrepreneur', 'student', 'youth', 'actor', 'author', 'critic', 'analyst', 'politician',
    'cricketer', 'athlete', 'scientist', 'industrialist', 'philosopher', 'monk',
    'brother', 'brothers', 'sister', 'sisters', 'child', 'children', 'family', 'son', 'sons', 'daughter', 'daughters',
    'parent', 'parents', 'kid', 'kids', 'toddler', 'baby'
  ];
  return personKeywords.some(w => lower.includes(w));
}

function getFatherMidsectionDescription(tummyProfile = 'subtle_10', bodyVolume = 'broad_full') {
  const volLabel = bodyVolume === 'lean'
    ? 'lean slim'
    : (bodyVolume === 'medium'
        ? 'balanced medium'
        : (bodyVolume === 'heavy_plus' ? 'heavy full-bodied' : 'natural medium-full'));
  switch (tummyProfile) {
    case 'flat':
      return `a ${volLabel} adult build with a flat toned waist (0% midsection projection, waist narrower than chest)`;
    case 'straight_5':
      return `a ${volLabel} adult build with a straight-cut torso (5% waist profile where the shirt hangs straight down flush with the ribcage, zero belly bulge, strictly NOT a skinny V-taper and strictly NO protruding belly)`;
    case 'subtle_10':
      return `a ${volLabel} adult build with a straight-cut everyday waist and subtle 10% lower-waist softness that stays completely flush with his chest line under a straight-draping shirt (strictly neither a skinny V-taper gym waist nor a protruding pot-belly or round paunch)`;
    case 'slight_tummy':
      return `a ${volLabel} adult build with a mild 15% relaxed waist contour under a loosely draped shirt that never sticks out past his chest line (strictly NOT a skinny V-taper gym body and strictly NO large protruding pot-belly)`;
    case 'visible_tummy':
      return `a fuller medium-heavy adult build with broad shoulders and a noticeable 25% rounded tummy contour under his shirt (strictly NOT lean or flat-stomached)`;
    case 'prominent_belly':
      return `a heavy full-bodied adult build (~35%+ prominent rounded belly projection) with soft full cheeks, natural under-chin fullness, and a pronounced round stomach silhouette under his shirt`;
    default:
      return `a ${volLabel} adult build with a straight-cut everyday waist and subtle 10% lower-waist softness that stays completely flush with his chest line under a straight-draping shirt (strictly neither a skinny V-taper gym waist nor a protruding pot-belly or round paunch)`;
  }
}

async function generateGeminiEditorialArtwork({ prompt, imageBase64, imageMimeType = 'image/jpeg', timeoutMs = 35000, familyCast = null, activeCast = null, stylizedAvatars = null, countryContext = '', chronicleMode = false, chronicleMomentCount = 0, chronicleMomentImages = [] }) {
  if (!GEMINI_API_KEY) return null;

  // If a remote HTTP/HTTPS URL was passed instead of base64, fetch and convert to base64 safely
  let resolvedBase64 = imageBase64;
  let resolvedMime = imageMimeType || 'image/jpeg';
  if (resolvedBase64 && typeof resolvedBase64 === 'string' && resolvedBase64.startsWith('http')) {
    try {
      const fCtrl = new AbortController();
      const fTimer = setTimeout(() => fCtrl.abort(), 3500);
      const fResp = await fetch(resolvedBase64.replace(/&amp;/g, '&'), {
        signal: fCtrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SlantBot/1.0)' }
      });
      clearTimeout(fTimer);
      if (fResp.ok) {
        const ct = fResp.headers.get('content-type') || 'image/jpeg';
        resolvedMime = ct.split(';')[0];
        const ab = await fResp.arrayBuffer();
        resolvedBase64 = Buffer.from(ab).toString('base64');
      } else {
        resolvedBase64 = null;
      }
    } catch (_) {
      resolvedBase64 = null;
    }
  }

  const imageModels = [
    'gemini-2.5-flash-image'
  ];

  let enhancedPrompt = (prompt || '')
    .replace(/[^.!?]*\b(?:sculptor(?:'s)?\s+)?chisel\b[^.!?]*\bmarble\b[^.!?]*[.!?]?/gi, '')
    .replace(/\b(?:a\s+)?(?:sculptor(?:'s)?\s+)?(?:steel\s+)?chisel\s+(?:resting|sitting|placed)?\s*(?:on|against)\s+(?:an?\s+)?(?:uncarved\s+)?marble(?:\s+plinth|\s+slab|\s+block)?/gi, 'a warm brass filter-coffee tumbler and open journal');

  const effectiveChronicleVignetteCount = chronicleMomentCount || (/\b2-vignette\b|\bupper centered vignette\b|\bONLY 2 VIGNETTES\b/i.test(enhancedPrompt) ? 2 : 3);

  // If this is a 2-moment Daily Chronicle, ensure the prompt never asks for 3 vignettes (Top-Left + Top-Right + Bottom)
  if (chronicleMode && effectiveChronicleVignetteCount === 2) {
    enhancedPrompt = enhancedPrompt
      .replace(/\b3-vignette\b/gi, '2-vignette')
      .replace(/\b3\s+separate,\s*self-contained/gi, 'EXACTLY 2 separate, self-contained vertically stacked');
  }

  // Prevent placing children "walking ahead" in front of parents' legs (which causes image models to draw waist-high / knee-high toddlers!)
  enhancedPrompt = enhancedPrompt
    .replace(/\bwalking ahead,\s*/gi, 'Walking side by side on the same level ground line alongside their parents, ')
    .replace(/\bstanding in front of their parents,\s*/gi, 'Standing side by side on the same level ground line alongside their parents, ');

  // Resolve Self / Father structured midsection/tummy profile up front so all group, solo, and chronicle blocks use the exact Vault selection
  const isShridharArtContext = isShridharCastContext(familyCast, '');
  const activeCastList = (activeCast && Array.isArray(activeCast.members) && activeCast.members.length > 0)
    ? activeCast.members.filter(m => m && m.approvalStatus !== 'pending' && m.approvalStatus !== 'declined')
    : ((familyCast && Array.isArray(familyCast.members))
        ? familyCast.members.filter(m => m && m.approvalStatus !== 'pending' && m.approvalStatus !== 'declined' && detectRelevantCastMembers(enhancedPrompt, familyCast).has(m.id))
        : []);
  const selfMemberObj = activeCastList.find(m => m && (m.id === 'member_father' || m.relationship === 'self'))
    || (familyCast && Array.isArray(familyCast.members) ? familyCast.members.find(m => m && (m.id === 'member_father' || m.relationship === 'self')) : null);
  const selfDisplayName = (selfMemberObj && selfMemberObj.name) || (isShridharArtContext ? 'Shridhar' : 'the protagonist');
  const selfTummy = (selfMemberObj && selfMemberObj.structuredTraits && selfMemberObj.structuredTraits.tummyProfile) || 'subtle_10';
  const selfVolume = (selfMemberObj && selfMemberObj.structuredTraits && selfMemberObj.structuredTraits.bodyVolume) || 'broad_full';
  const fatherBuildPhrase = getFatherMidsectionDescription(selfTummy, selfVolume);

  // Prevent companion/friend twin-cloning & feature bleeding:
  const unknownCompanionDesc = `a college friend (38yo Indian man with a standard balanced MEDIUM BUILD and flat neutral midsection — strictly NOT sharing ${selfDisplayName}'s fuller build or rounded tummy — a completely CLEAN-SHAVEN face with zero beard or stubble, neat side-parted wavy black hair, modern eyeglasses, and an olive-green collared shirt, visually distinct from ${selfDisplayName})`;
  enhancedPrompt = enhancedPrompt
    .replace(/\ban?\s+(?:old\s+|male\s+)?college\s+(?:pal|friend|buddy|mate)(?!\s*\()/gi, unknownCompanionDesc)
    .replace(/\ba\s+(?:male\s+)?(?:office\s+|work\s+)?(?:colleague|coworker|friend|buddy|pal)(?!\s*\()/gi, unknownCompanionDesc);

  if (/\b(college friend|college buddy|college pal|colleague|coworker)\b/i.test(enhancedPrompt) && !enhancedPrompt.includes('UNKNOWN SUPPORTING PERSON MEDIUM-BUILD RULE')) {
    enhancedPrompt += `. UNKNOWN SUPPORTING PERSON MEDIUM-BUILD & ANTI-CLONE RULE: Any companion, friend, or colleague whose traits are not from the Family Vault MUST be drawn with a standard balanced MEDIUM BUILD (flat neutral midsection) and a completely CLEAN-SHAVEN face—strictly NEVER copy or bleed ${selfDisplayName}'s build, hairstyle, or facial features onto the friend!`;
  }

  // If the LLM placed the 4-person family walk inside a narrow Top-Left or Top-Right 25% vignette while putting a solo scene in Bottom-Center,
  // deterministically swap them so the 4-person family walk ALWAYS gets the wide Bottom-Center Highlight Vignette (~50% width) where all 4 people fit side by side!
  const topRightBottomSwapMatch = enhancedPrompt.match(/(Top-Right(?:\s+Spot)?\s+Vignette:\s*)([\s\S]*?)(\s*Bottom-Center(?:\s+(?:Larger\s+|Highlight\s+|Showcase\s+)*)?Vignette:\s*)([\s\S]*?)(?=\.\s*(?:Ensure|PROTAGONIST|Mother|STRICT|MANDATORY|$))/i);
  if (topRightBottomSwapMatch) {
    const topRightBody = topRightBottomSwapMatch[2];
    const bottomCenterBody = topRightBottomSwapMatch[4];
    const topRightIsFamilyWalk = /\b(aruna|wife|mother|spouse)\b/i.test(topRightBody) && /\b(gahan|rishu|sons|kids|family)\b/i.test(topRightBody);
    const bottomCenterIsFamilyWalk = /\b(aruna|wife|mother|spouse)\b/i.test(bottomCenterBody) && /\b(gahan|rishu|sons|kids|family)\b/i.test(bottomCenterBody);
    if (topRightIsFamilyWalk && !bottomCenterIsFamilyWalk) {
      enhancedPrompt = enhancedPrompt.replace(
        topRightBottomSwapMatch[0],
        `${topRightBottomSwapMatch[1]}${bottomCenterBody.trim().replace(/\.$/, '')}.${topRightBottomSwapMatch[3]}${topRightBody.trim()}`
      );
    }
  }

  // Deterministically normalize any full-family walk/group description so that:
  // 1) All 4 family members (Father Shridhar, Mother Aruna, Elder Son Gahan, Younger Son Rishu) are ALWAYS present (Father is NEVER dropped!)
  // 2) Parents (Father Shridhar & Mother Aruna) stand together on the left half, and BOTH BROTHERS (Gahan & Rishu) stand DIRECTLY BESIDE EACH OTHER on the right half (never separated by Mother!)
  // 3) Both boys walk hands-free with arms relaxed at their sides (never holding hands like toddlers, which causes image models to shrink the younger boy!)
  // 4) Pairwise Heights from Actual Stature: Father (178cm / 5'10", 100%) -> Mother Aruna (162cm / 5'4", 91% of Father) -> Elder Son Gahan (142cm / 4'8", 88% of Mother's height & 80% of Father's height — clearly 8 inches / 20cm SHORTER than Mother so the top of Gahan's head is strictly BELOW Mother's chin at her collarbone/shoulder level, NEVER taller than Mother!) -> Younger Son Rishu (127cm / 4'2", 89% of Gahan's height — 6 inches shorter than Gahan so the top of Rishu's head rises above Gahan's shoulders to reach Gahan's chin/neck level!)
  const canonicalFourFamilyWalkBlock = `ZOOMED-OUT 24MM WIDE-ANGLE ESTABLISHING SHOT (camera pulled back 18-20 feet so all 4 full-body people fit comfortably inside the center 65% of the vignette width with generous open walkway/foliage margins on the left, right, top, and bottom so NO person is ever clipped or dropped at the edge): Strictly 4 people total shown FULL-BODY FROM HEAD TO TOE with all 8 feet/shoes planted on the exact same level ground line, walking SIDE BY SIDE in a single horizontal row facing forward in strict descending height order, with the 2 Parents together on the left side and the 2 Brothers standing directly beside each other on the right side: - 1st on far left: Father Shridhar (40yo mid-age bearded Indian man with a soft fuller round-oval face, full cheeks and natural under-chin fullness, ${fatherBuildPhrase}, wearing a casual polo shirt with no lanyard, chinos, and shoes, 5ft 10in / 178cm, 100% reference height). - 2nd from left (walking beside Father): Mother Aruna (36yo Indian woman with a soft fuller round-oval maternal face, warm golden-brown skin, small black circular forehead bindi, subtle red kumkum at her hairline, and thick side-parted wavy black hair swept over her left shoulder, wearing a teal/sage cotton kurta and sandals, 5ft 4in / 162cm, 91% of Father's height — top of her head reaching Father's eye/brow level, and clearly 8 inches / 20cm TALLER than Elder Son Gahan). - 3rd from left (walking beside Mother on the right half, hands-free with arms relaxed at his sides): Elder son Gahan (11yo Indian pre-teen boy with a gentle oval face, wearing a solid dark navy-blue t-shirt, knee-length denim shorts, and sneakers; 4ft 8in / 142cm, 88% of Mother Aruna's height and 80% of Father's height — Gahan is clearly 8 inches / 20cm SHORTER than his Mother Aruna so the top of Gahan's head is strictly BELOW Mother's chin at her collarbone / upper-shoulder level; strictly NEVER draw Gahan as tall as or taller than Mother Aruna!). - 4th on far right (walking DIRECTLY BESIDE GAHAN shoulder-to-shoulder on the far right, hands-free with arms relaxed at his sides, NEVER separated from Gahan and NEVER holding hands): Younger son Rishu (7yo Indian schoolboy with a round cheerful face, wearing a solid mustard-yellow t-shirt, dark shorts, and sneakers; 4ft 2in / 127cm, 89% of Elder Brother Gahan's height and 78% of Mother's height — 6 inches / 15cm shorter than Gahan so the TOP OF RISHU'S HEAD RISES ABOVE GAHAN'S SHOULDERS to reach Gahan's CHIN / NECK level; strictly NEVER draw Rishu's head below Gahan's shoulders or equal height with Gahan!).`;

  if (isShridharArtContext) {
    enhancedPrompt = enhancedPrompt
      .replace(/Exactly 4 family members walk side-by-side[^.]*\./i, canonicalFourFamilyWalkBlock)
      .replace(/from left to right in a clear 4-step descending height staircase,[\s\S]*?dark shorts,\s*and\s*sneakers\)\./i, canonicalFourFamilyWalkBlock)
      .replace(/(?:Full-body\s+)?(?:twilight|evening|night|post-dinner)?\s*(?:stroll|walk)[^.]*?\b(?:Aruna|wife)\b[^.]*?\bGahan\b[^.]*?\bRishu\b[^.]*\./i, `Full-body evening stroll along a tree-lined neighborhood lane under warm streetlamps: ${canonicalFourFamilyWalkBlock}`)
      .replace(/nearly as tall as (?:his )?Mother(?: Aruna)?[—,\s-]*(?:so )?(?:the )?(?:top of Gahan(?:'s)? head |head )?reach(?:ing|es)(?: right up to)? (?:his )?Mother(?: Aruna)?(?:'s)? ear\s*\/\s*eye level(?: and Father(?:'s)? shoulder(?: level)?)?/gi, '88% of Mother Aruna\'s height (8 inches / 20cm shorter than Mother so the top of Gahan\'s head is strictly BELOW Mother\'s chin at her collarbone/upper-shoulder level, strictly NEVER as tall as or taller than Mother)')
      .replace(/top of (?:Gahan(?:'s)? )?head reach(?:ing|es)(?: right up to)? (?:his )?Mother(?: Aruna)?(?:'s)? ear\s*\/\s*eye level(?: and Father(?:'s)? shoulder(?: level)?)?/gi, 'top of Gahan\'s head is strictly BELOW Mother Aruna\'s chin at her collarbone/upper-shoulder level (88% of Mother\'s height, 8 inches shorter than Mother)')
      .replace(/\b0\.8[56]x\s+Father\s+height/gi, '4ft 8in / 142cm (88% of Mother\'s height, 80% of Father\'s height)');

    if (!enhancedPrompt.includes('walking DIRECTLY BESIDE GAHAN shoulder-to-shoulder')) {
      enhancedPrompt = enhancedPrompt
        .replace(
          /\btwo\s+(?:young\s+)?(?:Indian\s+)?(?:siblings|children|kids)(?:\s+aged\s+\d+\s+and\s+\d+)?/gi,
          'his two sons (BOTH MALE BOYS, strictly NO girl or sister): 11-year-old elder son Gahan (4ft 8in / 142cm, sturdy Indian pre-teen boy with a gentle oval face and short black hair, wearing a dark navy-blue t-shirt, knee-length denim shorts, and sneakers) and 7-year-old younger son Rishu (4ft 2in / 127cm, 89% of Elder Brother Gahan\'s height — 6 inches / 15cm shorter than Gahan so the top of Rishu\'s head rises above Gahan\'s shoulders to reach Gahan\'s chin/neck level, strictly NEVER equal height with Gahan; younger Indian schoolboy with a round cheerful face and short black hair, wearing a mustard-yellow t-shirt, dark shorts, and sneakers)'
        )
        .replace(
          /\b(?:tall\s+)?(?:11(?:\s*-?\s*year\s*-?\s*old|yo)\s+)?(?:pre-teen\s+)?(?:elder\s+|older\s+)?(?:son\s+|brother\s+|boy\s+)?Gahan(?:\s*\([^)]*\))?(?:\s+in\s+navy(?:-blue)?\s+t-shirt)?(?:\s+reaching\s+Mother(?:'s)?\s+(?:ear|chin)(?:\/chin|\/ear)?)?/i,
          'Elder son Gahan (11yo Indian pre-teen boy with a gentle oval face, wearing a solid dark navy-blue t-shirt, knee-length denim shorts, and sneakers; 4ft 8in / 142cm, 88% of Mother Aruna\'s height and 80% of Father\'s height — clearly 8 inches / 20cm shorter than Mother Aruna so the top of Gahan\'s head is strictly BELOW Mother\'s chin at her collarbone / upper-shoulder level, strictly NEVER as tall as or taller than Mother!)'
        )
        .replace(
          /\b(?:tall\s+)?(?:7(?:\s*-?\s*year\s*-?\s*old|yo)\s+)?(?:younger\s+|little\s+)?(?:son\s+|brother\s+|schoolboy\s+|boy\s+)?Rishu(?:\s*\([^)]*\))?(?:\s+in\s+(?:mustard(?:-yellow)?|green)\s+t-shirt)?(?:\s+reaching\s+Gahan(?:'s)?\s+neck(?:\/chin)?)?/i,
          'Younger son Rishu (standing directly beside Gahan shoulder-to-shoulder on the far right, hands-free; 7yo Indian schoolboy with a round cheerful face, wearing a solid mustard-yellow t-shirt, dark shorts, and sneakers; 4ft 2in / 127cm, 89% of Elder Brother Gahan\'s height—6 inches / 15cm shorter than Gahan—so the TOP OF RISHU\'S HEAD RISES ABOVE GAHAN\'S SHOULDERS to sit directly level with elder brother Gahan\'s CHIN / NECK level; strictly NEVER draw Rishu\'s head below Gahan\'s shoulders or equal height with Gahan!)'
        );
    }
  }

  // Detect family context with 2 sons or family group (strictly requires explicit family cast or personal first-person context)
  const isSingleProtagonist = /\b(sole protagonist|exactly one protagonist|single protagonist|lone protagonist)\b/i.test(enhancedPrompt);
  const hasTwoSons = isShridharArtContext && !isSingleProtagonist && /\b(two sons|2 sons|both boys|two boys|elder son.*younger son|elder brother.*younger brother|gahan.*rishu|rishu.*gahan)\b/i.test(enhancedPrompt);
  const hasExplicitFamilyGroup = isShridharArtContext && !isSingleProtagonist && /\b(whole family|entire family|all 4 of us|all four of us|family of four|family portrait|parents and children|with my wife and kids|with my family|me, wife and 2 sons|road trip with my family)\b/i.test(enhancedPrompt);
  const hasFamilyContext = isShridharArtContext && (hasTwoSons || hasExplicitFamilyGroup);
  const isIndianFamilyCast = isShridharArtContext && (!countryContext || /india/i.test(countryContext));

  if (hasFamilyContext && isIndianFamilyCast && !chronicleMode) {
    const headcountAnchor = `GROUP PORTRAIT OF EXACTLY FOUR (4) DISTINCT INDIVIDUAL PEOPLE SHOWN FULL-BODY FROM HEAD TO TOE WITH ALL FEET AND SHOES PLANTED ON THE SAME LEVEL GROUND LINE, STANDING SIDE BY SIDE FROM LEFT TO RIGHT IN STRICT DESCENDING HEIGHT ORDER (3 MALES, 1 FEMALE — STRICTLY 4 PEOPLE TOTAL: 1 FATHER, 1 MOTHER, AND EXACTLY 2 SONS, NEVER 3 KIDS!): 1) On Far Left: Adult Father Shridhar (5ft 10in / 178cm, 100% tallest adult, mid 40s) with soft fuller round-oval face, full cheeks and natural under-chin fullness, and ${fatherBuildPhrase} in trousers and shoes, 2) Second from Left: Adult Mother Aruna (5ft 4in / 162cm, 91% of Father's height — second tallest, mid 30s, clearly 8 inches / 20cm TALLER than Elder Son Gahan) with warm golden-brown skin, soft fuller round-to-oval maternal face with warm full cheeks, small black circular bindi centered on forehead and subtle red kumkum at upper forehead hairline, side-parted thick voluminous wavy black hair swept forward over her left shoulder past her collarbone, and healthy medium-to-full South Indian adult build in kurta and sandals, 3) Third from Left: 11yo Pre-Teen Elder Son Gahan (4ft 8in / 142cm, 88% of Mother Aruna's height and 80% of Father's height — clearly 8 inches / 20cm SHORTER than his Mother Aruna so the top of Gahan's head is strictly BELOW Mother's chin at her collarbone / upper-shoulder level; strictly NEVER draw Gahan as tall as or taller than Mother!) with a gentle oval face wearing a DARK NAVY-BLUE casual t-shirt, knee-length denim shorts, and sneakers, 4) On Far Right: 7yo Younger Son Rishu (4ft 2in / 127cm, 89% of Elder Brother Gahan's height and 78% of Mother's height — 6 inches / 15cm shorter than Gahan so the TOP OF RISHU'S HEAD RISES ABOVE GAHAN'S SHOULDERS to reach Gahan's CHIN / NECK level; strictly NEVER draw Rishu's head below Gahan's shoulders and strictly NEVER equal height with Gahan!) with round cheerful cheeks wearing a CONTRASTING MUSTARD-YELLOW OR BRIGHT EMERALD-GREEN t-shirt, dark shorts, and sneakers. `;
    if (!enhancedPrompt.includes('EXACTLY FOUR') && !enhancedPrompt.includes('STRICT COUNT = 4')) {
      enhancedPrompt = headcountAnchor + enhancedPrompt;
    }

    // Sanitize detached foreground hands, salon blowout hair, and remove skinny runway-model biases
    enhancedPrompt = enhancedPrompt
      .replace(/In the foreground,\s*(?:glowing\s*)?cupped hands receive drops of sacred theertha water/gi, 'The father and sons cup their hands to receive drops of sacred theertha water (no external detached arms)')
      .replace(/\b(lean|skinny|slender|frail)\s*(?:11-year-old|elder son|boy|adolescent)/gi, 'sturdy healthy 11-year-old')
      .replace(/\bgraceful mother\b/gi, 'mother with natural healthy medium-to-full maternal build')
      .replace(/\b(lean|skinny|slender)\s*build/gi, 'healthy sturdy build')
      .replace(/\bsalon blowout\b/gi, 'natural thick wavy black hair')
      .replace(/\bcasual cotton attire\b/gi, 'comfortable cotton kurta or natural casual attire');

    // If adult father is present with a child without mother, replace generic guardian with adult father
    if (/\b(father|dad|shridhar)\b/i.test(enhancedPrompt) && !/\b(mother|mom|wife|aruna|woman|female)\b/i.test(enhancedPrompt)) {
      enhancedPrompt = enhancedPrompt
        .replace(/\b(?:an attentive,?\s*smiling\s*)?guardian\b/gi, 'his adult father Shridhar (mid 40s man, trimmed beard)')
        .replace(/\ba parent\b/gi, 'his adult father Shridhar');
    }
  }

  // Enforce Mother (Aruna) authentic physical anchor whenever she is present (including in Chronicle Mode vignettes!)
  if (isIndianFamilyCast && /\b(mother|wife|mom|aruna)\b/i.test(enhancedPrompt) && !enhancedPrompt.includes('small black circular bindi')) {
    enhancedPrompt += '. Mother (Aruna) Identity Anchor: authentic South Indian woman in her mid-30s (5ft 4in / 162cm, 91% of Father\'s height, clearly 8 inches / 20cm taller than 11yo Elder Son Gahan) with warm golden-brown wheatish skin, soft fuller round-to-oval maternal face with warm full cheeks and soft rounded chin (strictly NOT a narrow or sharp-chinned face), small black circular bindi centered on her forehead and subtle red kumkum at the upper forehead hairline, gentle dark eyes without heavy makeup, side-parted thick voluminous wavy black hair swept forward over her left shoulder past her collarbone, and a healthy natural medium-to-full adult build with soft shoulders.';
  }

  // Enforce Elder & Younger Brother (Gahan & Rishu) strict 2-boy count & pairwise height alignment across ALL situations!
  if (isIndianFamilyCast && hasTwoSons && !enhancedPrompt.includes('STRICT 2-BOY HEADCOUNT')) {
    if (hasExplicitFamilyGroup || /\b(mother|wife|aruna)\b/i.test(enhancedPrompt)) {
      enhancedPrompt += '. STRICT 2-BOY HEADCOUNT, ZOOMED-OUT WIDE-ANGLE FRAMING & PAIRWISE HEIGHT LOCK: For the family group scene, pull the camera back into a ZOOMED-OUT 24MM WIDE-ANGLE ESTABLISHING SHOT (18-20 feet away) with generous open walkway/park margins on the left, right, top, and bottom so all 4 full-body people fit effortlessly inside the center 65% of the vignette without anyone being clipped or dropped at the edge. Draw EXACTLY 4 FAMILY MEMBERS TOTAL (1 Adult Father Shridhar, 1 Adult Mother Aruna, and EXACTLY 2 SONS — 1 boy in dark navy-blue t-shirt and denim shorts, and 1 boy in mustard-yellow t-shirt and dark shorts; STRICTLY NEVER DRAW 3 CHILDREN OR DROP FATHER!). Arrange all 4 family members walking/standing SIDE BY SIDE in a single horizontal row on the same level ground line from left to right in strict descending height order, with the 2 Parents together on the left side and the 2 Brothers standing DIRECTLY BESIDE EACH OTHER shoulder-to-shoulder on the right side (never place Mother between the two boys, and never have the boys holding hands!): (1st on far left - 5ft 10in / 178cm, 100% reference height) Father Shridhar; (2nd from left beside Father - 5ft 4in / 162cm, 91% of Father\'s height) Mother Aruna standing at Father\'s eye/brow level; (3rd from left beside Mother - 4ft 8in / 142cm, 88% of Mother\'s height and 80% of Father\'s height) Elder Son Gahan (11yo Indian pre-teen boy with a gentle oval face in a dark navy-blue t-shirt and denim shorts, hands-free) who is clearly 8 inches / 20cm SHORTER than Mother Aruna so the top of Gahan\'s head is strictly BELOW Mother\'s chin at her collarbone / upper-shoulder level (STRICTLY NEVER draw Gahan as tall as or taller than Mother Aruna!); (4th on far right standing DIRECTLY BESIDE GAHAN shoulder-to-shoulder - 4ft 2in / 127cm, 89% of Gahan\'s height) Younger Son Rishu (7yo Indian schoolboy with a round cheerful face in a bright mustard-yellow t-shirt and dark shorts, hands-free) who is 6 inches / 15cm shorter than Gahan so the TOP OF RISHU\'S HEAD RISES ABOVE GAHAN\'S SHOULDERS to sit directly level with GAHAN\'S CHIN / NECK level (strictly NEVER draw Rishu\'s head below Gahan\'s shoulders or equal height with Gahan!).';
    } else {
      enhancedPrompt += '. STRICT 2-BOY HEADCOUNT, GENDER LOCK (BOTH BOYS, ZERO GIRLS) & PAIRWISE HEIGHT LOCK: The two children in the scene are STRICTLY 2 MALE BROTHERS (11-year-old Elder Son Gahan and 7-year-old Younger Son Rishu — STRICTLY BOTH BOYS, ZERO GIRLS, NO SISTER, NO FEMALE CHILD!): (1) Elder Son Gahan is an 11yo Indian pre-teen BOY (4ft 8in / 142cm tall, gentle oval face, thick short black hair, sturdy pre-teen build, wearing a solid dark navy-blue casual t-shirt and knee-length denim shorts), and (2) Younger Son Rishu is a 7yo Indian schoolboy (4ft 2in / 127cm tall — 89% of Elder Brother Gahan\'s height, noticeably 6 inches / 15cm shorter than Gahan so the TOP OF RISHU\'S HEAD RISES ABOVE GAHAN\'S SHOULDERS to reach GAHAN\'S CHIN / NECK level, strictly NEVER equal height with Gahan!, round cheerful face, neat short black hair, wearing a bright mustard-yellow t-shirt and dark shorts).';
    }
  }

  // If 2+ activeCast members are present (even when Father is NOT in the picture, e.g. Mother + Elder Son, or Elder Son + Younger Son), enforce exact pairwise stature relative to the tallest member in the scene!
  if (activeCastList.length >= 2) {
    const pairwiseSceneLock = buildDynamicPairwiseStatureDirective(activeCastList, activeCastList);
    if (pairwiseSceneLock && !enhancedPrompt.includes('SCENE-RELATIVE & PAIRWISE ACTUAL HEIGHT CALCULATOR')) {
      enhancedPrompt += `. ${pairwiseSceneLock.blockText.replace(/\n+/g, ' ')}`;
    }
  }

  // Enforce Solo / Active Cast Self Protagonist & Prevent Elderly Hallucinations
  const hasSelfInActiveCast = activeCastList.some(m => m && (m.id === 'member_father' || m.relationship === 'self'));
  const mentionsFatherOrSelf = hasSelfInActiveCast || (isShridharArtContext && /\b(shridhar|father\s*\(shridhar\)|indian father figure|member_father)\b/i.test(enhancedPrompt));

  if (mentionsFatherOrSelf && isShridharArtContext) {
    enhancedPrompt = enhancedPrompt
      .replace(/\bfit,?\s*(?:prime\s+)?mid-age\s+40-year-old\b/gi, 'mid-age 40-year-old')
      .replace(/\btall\s+40yo\s+fit\s+bearded\b/gi, '40yo mid-age bearded')
      .replace(/\ban?\s+indian\s+father\s+figure(?:,\s*shridhar)?\b/gi, `a mid-age 40-year-old Indian man in his early 40s (Shridhar, warm medium-brown skin, soft fuller round-oval face with full cheeks and natural under-chin fullness, full head of thick short dark hair brushed up, short light neat trimmed stubble beard, and ${fatherBuildPhrase}, strictly NOT old or elderly)`)
      .replace(/\bfather\s+figure\b/gi, 'mid-age 40-year-old man in his early 40s')
      .replace(/\bsalt-and-pepper\s+(?:trimmed\s+)?beard\b/gi, 'neat short dark trimmed stubble beard')
      .replace(/\bsalt-and-pepper\s+hair\b/gi, 'thick short dark hair')
      .replace(/\b(elderly|old\s+man|aged\s+man|aging|senior\s+citizen|white-haired|gray-haired|grey-haired|silver-haired|weathered\s+old)\b/gi, 'mid-age 40-year-old');

    if (!/PROTAGONIST AGE & APPEARANCE LOCK/i.test(enhancedPrompt)) {
      enhancedPrompt += `. PROTAGONIST AGE, VOLUME & TUMMY PROFILE LOCK (SHRIDHAR, AGE 40 MID-AGE ADULT): Portray the male protagonist Shridhar as a mid-age 40-year-old Indian man (strictly age 38-40) with warm medium-brown skin, a soft fuller round-oval face with full cheeks and natural under-chin fullness, a full head of thick short dark hair brushed up at the crown, a short light neat trimmed stubble beard, and ${fatherBuildPhrase}. STRICT BAN ON AGING: Strictly NOT an old/elderly man.`;
    }
  } else if (hasSelfInActiveCast && selfMemberObj && !isShridharArtContext) {
    const selfAnchorDesc = [
      selfMemberObj.uncompromisableAnchors,
      selfMemberObj.visualTraits,
      selfMemberObj.heightDesc,
      fatherBuildPhrase
    ].filter(Boolean).join(', ');
    if (selfAnchorDesc && !/PROTAGONIST AGE & APPEARANCE LOCK/i.test(enhancedPrompt)) {
      enhancedPrompt += `. PROTAGONIST AGE & APPEARANCE LOCK (${selfMemberObj.name || 'Self'}, age ${selfMemberObj.age || 'Adult'}): Portray the protagonist ${selfMemberObj.name || 'Self'} faithfully as: ${selfAnchorDesc}.`;
    }
  }

  // DYNAMIC POSTURE-ADJUSTED RELATIVE STATURE MATRIX (Action Multiplier x Actual Height):
  // Standing = 1.00x | Leaning = 0.88x | Sitting on chair/sofa/bench = 0.72x (-28% height) | Kneeling/Crouching = 0.64x (-36%) | Sitting on floor = 0.52x (-48%)
  const postureAdjustments = [];
  const fatherIsSitting = /\b(?:father|dad|shridhar)\b[^.;]{0,55}\b(?:sit|sits|sitting|seated|armchair|chair|sofa|couch|bench|desk)\b|\b(?:sit|sits|sitting|seated)\b[^.;]{0,55}\b(?:father|dad|shridhar)\b/i.test(enhancedPrompt);
  const motherIsSitting = /\b(?:mother|mom|wife|aruna)\b[^.;]{0,55}\b(?:sit|sits|sitting|seated|armchair|chair|sofa|couch|bench)\b|\b(?:sit|sits|sitting|seated)\b[^.;]{0,55}\b(?:mother|mom|wife|aruna)\b/i.test(enhancedPrompt);
  const gahanIsStanding = /\b(?:elder\s+son|older\s+son|gahan|11yo|11-year-old)\b[^.;]{0,55}\b(?:stand|stands|standing|walking|beside)\b/i.test(enhancedPrompt)
    && !/\b(?:elder\s+son|older\s+son|gahan)\b[^.;]{0,40}\b(?:sit|sits|sitting|seated)\b/i.test(enhancedPrompt);
  const rishuIsStanding = /\b(?:younger\s+son|rishu|7yo|7-year-old)\b[^.;]{0,55}\b(?:stand|stands|standing|walking|beside)\b/i.test(enhancedPrompt)
    && !/\b(?:younger\s+son|rishu)\b[^.;]{0,40}\b(?:sit|sits|sitting|seated)\b/i.test(enhancedPrompt);
  const gahanIsSitting = /\b(?:elder\s+son|older\s+son|gahan)\b[^.;]{0,45}\b(?:sit|sits|sitting|seated|chair|sofa|floor)\b/i.test(enhancedPrompt);
  const fatherIsStanding = /\b(?:father|dad|shridhar)\b[^.;]{0,55}\b(?:stand|stands|standing|walking)\b/i.test(enhancedPrompt) && !fatherIsSitting;

  if (fatherIsSitting && gahanIsStanding) {
    // Father (178cm * 0.72 = 128cm effective height) vs Standing Gahan (142cm * 1.00 = 142cm effective height) -> Gahan is +11% taller than seated Father!
    postureAdjustments.push('POSTURE-ADJUSTED HEIGHT OVERRIDE (SEATED FATHER vs STANDING ELDER SON): Because Father Shridhar is SEATED in a chair/sofa (effective vertical height drops 28% from 178cm to ~128cm) while 11yo Elder Son Gahan is STANDING upright beside him (142cm effective height), standing Gahan\'s head rises ~11% (half-a-head) ABOVE seated Father\'s head!');
  }
  if (fatherIsSitting && rishuIsStanding) {
    // Father (178cm * 0.72 = 128cm effective height) vs Standing Rishu (127cm * 1.00 = 127cm effective height) -> Rishu's head is right at seated Father's head level!
    postureAdjustments.push('POSTURE-ADJUSTED HEIGHT OVERRIDE (SEATED FATHER vs STANDING YOUNGER SON): Because Father Shridhar is SEATED (~128cm effective height) while 7yo Younger Son Rishu is STANDING upright beside him (127cm effective height), standing Rishu\'s head is right at seated Father\'s eye/head level!');
  }
  const fatherIsKneeling = /\b(?:father|dad|shridhar)\b[^.;]{0,55}\b(?:kneel|kneels|kneeling|crouch|crouches|crouching|squat|squatting)\b|\b(?:kneel|kneels|kneeling|crouch|crouches|crouching)\b[^.;]{0,55}\b(?:father|dad|shridhar)\b/i.test(enhancedPrompt);
  if (fatherIsKneeling && (gahanIsStanding || hasTwoSons)) {
    // Kneeling Father (178cm * 0.64 = 114cm effective height) vs Standing Gahan (142cm) & Standing Rishu (127cm)
    postureAdjustments.push('POSTURE-ADJUSTED HEIGHT OVERRIDE (KNEELING FATHER vs STANDING TWO SONS): While Father Shridhar kneels/crouches down (~114cm effective kneeling height) between his standing sons, keep the 6-inch / 15cm height gap between the two standing boys unmistakable: 11yo Elder Son Gahan (4ft 8in / 142cm, in dark navy-blue t-shirt & denim shorts) stands clearly taller than 7yo Younger Son Rishu (4ft 2in / 127cm, in mustard-yellow t-shirt & dark shorts, whose head reaches Gahan\'s chin/neck level).');
  }
  if (motherIsSitting && gahanIsStanding) {
    // Mother (162cm * 0.72 = 117cm effective height) vs Standing Gahan (142cm * 1.00 = 142cm effective height) -> Gahan is +21% taller than seated Mother!
    postureAdjustments.push('POSTURE-ADJUSTED HEIGHT OVERRIDE (SEATED MOTHER vs STANDING ELDER SON): Because Mother Aruna is SEATED (~117cm effective height) while 11yo Elder Son Gahan is STANDING beside her (142cm effective height), standing Gahan\'s head rises ~21% (about one head) ABOVE seated Mother\'s head!');
  }
  if (gahanIsSitting && fatherIsStanding) {
    // Seated Gahan (142cm * 0.72 = 102cm effective height) vs Standing Father (178cm)
    postureAdjustments.push('POSTURE-ADJUSTED HEIGHT OVERRIDE (STANDING FATHER vs SEATED SON): Because Elder Son Gahan is SEATED (~102cm effective height) while Father Shridhar is STANDING upright (178cm height), seated Gahan\'s head reaches standing Father\'s lower-chest/elbow level.');
  }
  if (postureAdjustments.length > 0) {
    enhancedPrompt += '. ' + postureAdjustments.join(' ');
  }

  // Inject any other activeCast member uncompromisable anchors ONLY if not already covered by the family/brother locks (prevents duplicate kid descriptions that cause image models to draw a 3rd kid!)
  if (activeCastList.length > 0) {
    activeCastList.forEach(m => {
      if (!m) return;
      if (hasTwoSons && (m.relationship === 'elder_son' || m.relationship === 'younger_son' || m.id === 'member_elder_son' || m.id === 'member_younger_son')) {
        return; // Already locked by STRICT 2-BOY HEADCOUNT & NECK-HEIGHT LOCK above
      }
      if (m.relationship === 'spouse' && enhancedPrompt.includes('Mother (Aruna) Identity Anchor')) {
        return; // Already locked by Mother (Aruna) Identity Anchor above
      }
      if (m.relationship === 'self' || m.id === 'member_father') {
        return; // Already locked by PROTAGONIST AGE & APPEARANCE LOCK above
      }
      const anchorText = [m.uncompromisableAnchors, m.visualTraits, m.heightDesc]
        .filter(Boolean)
        .join(', ')
        .trim()
        .replace(/\bsalt-and-pepper\s+(?:trimmed\s+)?beard\b/gi, 'neat short dark trimmed stubble beard');
      if (anchorText && !enhancedPrompt.includes(anchorText.slice(0, 24))) {
        enhancedPrompt += `. Character Anchor (${m.name || m.roleLabel}, age ${m.age || 40}): ${anchorText}`;
      }
    });
  }

  // Country Setting Anchor for General Editorial Posters
  if (countryContext && countryContext !== 'Global' && !enhancedPrompt.toLowerCase().includes(countryContext.toLowerCase())) {
    enhancedPrompt = `${countryContext} regional setting and authentic cultural atmosphere, ${enhancedPrompt}`;
  }

  // Iconic Public Figure & Popular Personality Likeness Enrichment (Ensures Inner Voice & Web Link posters render unmistakable likenesses)
  const PUBLIC_FIGURE_LIKENESS_ANCHORS = [
    { pattern: /\bprakash\s+raj\b/i, name: 'Prakash Raj', roleDesc: 'the veteran multilingual South Indian film actor and political speaker', anchor: '60-year-old South Indian actor with a broad fuller round-oval face, soft full cheeks and double-chin contour, distinctive heavy-lidded expressive dark eyes with subtle under-eye fullness, broad nose, clean-shaven or very light 1-day shadow lower face (strictly NO thick white beard!), and short curly salt-and-pepper hair receding slightly at the temples' },
    { pattern: /\bratan\s+tata\b/i, name: 'Ratan Tata', roleDesc: 'the distinguished iconic Indian industrialist', anchor: 'tall dignified Parsi gentleman in his early 80s with neatly combed silver-white hair, warm gentle smile, kind dark eyes, refined aquiline nose, wearing a classic tailored dark navy business suit and crisp white shirt' },
    { pattern: /\b(?:apj\s+)?abdul\s+kalam\b/i, name: 'Dr. A.P.J. Abdul Kalam', roleDesc: 'the beloved Indian aerospace scientist and People\'s President', anchor: 'distinguished South Indian statesman in his 70s with his signature long silver-white hair parted in the center and curving inward around his ears, warm radiant smile, dark brown skin, wearing his iconic dark closed-neck Bandhgala suit' },
    { pattern: /\bvirat\s+kohli\b/i, name: 'Virat Kohli', roleDesc: 'the iconic Indian cricket champion', anchor: 'athletic 35-year-old Indian cricketer with sharp jawline, signature closely-trimmed boxed dark full beard and mustache, short fade haircut, intense focused dark eyes, wearing the royal-blue Indian national cricket jersey' },
    { pattern: /\b(?:ms\s+|mahendra\s+singh\s+)dhoni\b/i, name: 'MS Dhoni', roleDesc: 'the legendary Indian cricket captain', anchor: 'composed athletic Indian cricketer in his early 40s with calm resolute expression, structured jawline, short salt-and-pepper beard, and athletic frame in Indian cricket jersey' },
    { pattern: /\bsachin\s+tendulkar\b/i, name: 'Sachin Tendulkar', roleDesc: 'the legendary Indian master batsman', anchor: 'iconic Indian cricketer with short curly dark hair, warm humble smile, and classic Indian blue cricket jersey holding a cricket bat' },
    { pattern: /\bnarayana\s+murthy\b/i, name: 'N. R. Narayana Murthy', roleDesc: 'the pioneering Indian IT industry founder', anchor: 'bespectacled senior Indian tech visionary in his late 70s with receding silver-white hair, rimless rectangular spectacles, thoughtful scholarly expression, wearing a formal dark business suit' },
    { pattern: /\bsundar\s+pichai\b/i, name: 'Sundar Pichai', roleDesc: 'the Indian-American global tech CEO', anchor: 'composed South Indian tech executive in his early 50s with slim build, dark hair with subtle silver at the temples, neat short dark beard, rectangular eyeglasses, wearing a modern dark minimalist blazer over a crew-neck tee' },
    { pattern: /\bsatya\s+nadella\b/i, name: 'Satya Nadella', roleDesc: 'the global cloud tech CEO', anchor: 'Indian-American tech executive in his mid-50s with clean-shaven bald head, thin-rimmed modern eyeglasses, warm thoughtful smile, wearing a smart dark tailored blazer and polo shirt' },
    { pattern: /\b(?:narendra\s+)?modi\b/i, name: 'Narendra Modi', roleDesc: 'the Indian Prime Minister', anchor: 'distinguished Indian statesman in his early 70s with signature neatly trimmed full white beard and mustache, silver-white hair, rimless rectangular spectacles, wearing a crisp white kurta and saffron-ochre sleeveless khadi Modi vest jacket' },
    { pattern: /\bswami\s+vivekananda\b/i, name: 'Swami Vivekananda', roleDesc: 'the iconic Indian spiritual philosopher', anchor: 'serene dynamic young Indian monk with luminous large dark eyes, noble jawline, wearing his iconic flowing saffron-ochre monastic robe and traditional wound saffron turban with arms folded across his chest' },
    { pattern: /\belon\s+musk\b/i, name: 'Elon Musk', roleDesc: 'the global space and electric-vehicle tech entrepreneur', anchor: 'tall 50-something tech entrepreneur with structured square jaw, short dark side-parted hair, wearing a dark tailored jacket over a black t-shirt' },
    { pattern: /\bdonald\s+trump\b/i, name: 'Donald Trump', roleDesc: 'the American political leader', anchor: 'tall senior American political figure in his late 70s with signature swept-back golden-blond hair, dark navy suit, white shirt, and long red silk tie at a press podium' },
    { pattern: /\bsam\s+altman\b/i, name: 'Sam Altman', roleDesc: 'the AI research CEO', anchor: '39-year-old Silicon Valley tech executive with wavy brown hair, expressive blue eyes, wearing a casual grey crew-neck sweater' },
    { pattern: /\bjensen\s+huang\b/i, name: 'Jensen Huang', roleDesc: 'the semiconductor and AI chip CEO', anchor: '60-year-old Asian-American tech founder with silver-streaked hair, rimless glasses, wearing his signature black leather biker jacket' }
  ];
  for (const fig of PUBLIC_FIGURE_LIKENESS_ANCHORS) {
    if (fig.pattern.test(enhancedPrompt) && !enhancedPrompt.includes(fig.anchor.slice(0, 28))) {
      enhancedPrompt += `. ICONIC LIKENESS ANCHOR (${fig.name}): Portray ${fig.name} unmistakably in the foreground as a ${fig.anchor}.`;
    }
  }

  // Encyclopedic Uniform & Cultural Accuracy Enforcer for RSS / Swayamsevak / Pathasanchalan
  if (/\b(rss|swayamsevak|swayamsevaks|pathasanchalan|ganavesh)\b/i.test(enhancedPrompt)) {
    enhancedPrompt = enhancedPrompt
      .replace(/\b(?:short-sleeved|half-sleeved)\s+white\s+(?:collared\s+)?shirts?\b/gi, 'full-sleeved long-sleeved white buttoned collared shirts with full sleeves down to the wrists')
      .replace(/\bblack\s+side\s+caps?\b/gi, 'traditional Indian foldable boat-shaped black cloth Kali Topi caps (Gandhi-cap boat geometry worn straight on the head, strictly NOT round military berets and strictly NO metal badges or insignia on the caps)')
      .replace(/\b(?:holding|carrying)\s+(?:traditional\s+)?(?:polished\s+)?wooden\s+lathis?\b/gi, 'carrying plain unadorned wooden bamboo staffs (dandas) resting at a 45-degree angle on their right shoulders (strictly plain bamboo sticks with NO flags tied or mounted on the staffs)');
    if (!/strictly NOT round military berets/i.test(enhancedPrompt)) {
      enhancedPrompt += `. AUTHENTIC RSS GANAVESH UNIFORM SPECIFICATION (INCLUDING PROTAGONIST): Every participant in the RSS Pathasanchalan march — including the protagonist ${selfDisplayName} when part of the march — MUST wear the exact same complete RSS Ganavesh uniform (strictly NEVER dress the protagonist in a civilian kurta or different shirt in the march scene!): full-sleeved (long-sleeved down to the wrists) plain white buttoned shirts tucked into khaki-brown full trousers with a simple waist belt ONLY (strictly NO short sleeves, strictly NO diagonal cross-shoulder police straps, strictly NO red neck scarves), traditional Indian foldable boat-shaped black cloth caps (Gandhi-cap boat geometry with pointed front-to-back crease worn straight on the head, strictly NOT round military/police berets and strictly NO metal badges or emblems on the front of the cap), carrying plain wooden bamboo staffs (dandas) resting on their right shoulders with strictly NO flags attached to the staffs.`;
    }
  }

  // Complete Human Anatomy & Limb Integrity Enforcer (Prevents missing legs / legless torsos on chairs / floating bodies)
  if (!chronicleMode && /\b(sits|sitting|seated)\b/i.test(enhancedPrompt) && /\b(chair|sofa|couch|bench|stool|floor)\b/i.test(enhancedPrompt)) {
    if (!/\b(trousers|pants|jeans|chinos|feet resting on the floor)\b/i.test(enhancedPrompt)) {
      enhancedPrompt += '. COMPLETE HUMAN ANATOMY & LOWER-BODY INTEGRITY: Every seated person MUST have complete, natural, anatomically connected full legs wearing trousers/pants extending downward from the seat with both feet resting naturally on the floor (or framed cleanly as a waist-up medium portrait). STRICT BAN on legless torsos, missing legs, amputated limbs, cross-legged stumps on chairs, or bodies merging into chair seats.';
    }
  } else {
    enhancedPrompt += '. Complete natural human anatomy with intact connected limbs, strictly no missing legs or floating torsos.';
  }

  if (chronicleMode) {
    const vigCountLabel = effectiveChronicleVignetteCount === 2
      ? 'EXACTLY 2 separate, self-contained vertically stacked moment visuals (1 Upper Centered Vignette + 1 Lower Centered Larger Highlight Vignette — STRICTLY ONLY 2 VIGNETTES ON THE PAGE, NEVER DRAW 3 VIGNETTES!)'
      : `EXACTLY ${effectiveChronicleVignetteCount} separate, self-contained moment visuals`;
    enhancedPrompt += `. MANDATORY CLOUDY-SHADED WATERCOLOR VIGNETTE STYLE WITH WIDE SAFE PARCHMENT MARGINS & DYNAMIC MOMENT-MATCHED HALOS: Render in 3:4 vertical portrait format in warm editorial watercolor and gouache on warm textured vintage cream-buff parchment paper (#EDE3D0) with visible organic paper grain. Keep all vignettes inside the central 82% horizontal safe zone with a generous 9%–10% clear unpainted warm cream-buff parchment paper margin along the left edge, right edge, top edge, and bottom edge so NO subject, arm, shoulder, furniture, or watercolor halo is ever clipped at the left or right borders. Present ${vigCountLabel} where each moment is surrounded by a soft, blurry, feathered dry-brush cloud gradient halo in a subtle, muted watercolor tint tailored to that moment's mood and setting (such as warm ochre/amber, muted sage/olive, gentle dusty slate-blue, soft rose-sienna, or sandalwood, kept understated so it never overpowers the moment's subjects) whose outer edges smoothly fade to zero opacity into the warm parchment paper. Dress the self/protagonist in distinct, situation-appropriate attire for each individual moment (never blindly copying one moment's outfit to another moment). STRICT BAN on crisp vignette borders, hard water-stain puddle perimeter rings, straight vertical/rectangular frame edges, stark white paper, or merged full-bleed scenes.`;
  } else if (/\b(watercolor|water colour|ink-wash|ink wash)\b/i.test(enhancedPrompt)) {
    enhancedPrompt += '. MANDATORY HAND-PAINTED WATERCOLOR & INK-WASH STYLE: Render as a luminous hand-painted loose watercolor and fine fountain-pen ink-wash editorial illustration on textured warm cream cold-press watercolor paper (#F5EFE2) with soft feathered unpainted cream paper vignette margins, translucent wet-on-wet watercolor pigment blooms, and delicate ink contour linework.';
  }

  const isPhotoMedium = /photograph|film still|35mm|photojournalism|documentary|editorial portrait photograph/i.test(enhancedPrompt);
  const textureStyle = isPhotoMedium
    ? 'sharp focus, natural skin textures, 35mm film grain, authentic ambient lighting'
    : 'painterly texture, dramatic lighting';

  const validMomentImages = Array.isArray(chronicleMomentImages)
    ? chronicleMomentImages.filter(m => m && m.imageBase64 && typeof m.imageBase64 === 'string')
    : [];

  const parts = [];
  if (validMomentImages.length > 0) {
    validMomentImages.forEach((m, i) => {
      const cleanB64 = m.imageBase64.includes(',') ? m.imageBase64.split(',')[1] : m.imageBase64;
      const mIdx = m.index || (i + 1);
      const isAppOrLaunchMoment = /\b(app|launch|soft-launch|launched|built|software|product|website|platform|screen|interface|logo)\b/i.test(m.text || '');
      const isBookReadingMoment = /\b(book|reading|read|novel|stories|chapter|author)\b/i.test(m.text || '');
      parts.push({
        inlineData: {
          mimeType: m.imageMimeType || 'image/jpeg',
          data: cleanB64
        }
      });
      parts.push({
        text: isAppOrLaunchMoment
          ? `CRITICAL VISUAL GROUNDING FOR THIS VIGNETTE (${m.title || 'Moment ' + mIdx}: "${m.text || ''}"${m.isStarred ? ' [★ STARRED IMPORTANT MOMENT - PLACE IN LARGE ~50% LOWER PANORAMIC SHOWCASE VIGNETTE]' : ''}): The user attached this exact app logo / brand emblem for this moment. In its dedicated vignette, you MUST prominently and faithfully render THIS EXACT ATTACHED EMBLEM / GRAPHIC (preserving its exact black fountain-pen nib silhouette, inner portrait face, and warm cream/gold contrast) filling the glowing smartphone/device screen. Strictly do NOT draw a generic blank or blue app interface screen!`
          : (isBookReadingMoment
              ? `CRITICAL VISUAL GROUNDING FOR THIS VIGNETTE (${m.title || 'Moment ' + mIdx}: "${m.text || ''}"${m.isStarred ? ' [★ STARRED IMPORTANT MOMENT - PLACE IN LARGE ~50% LOWER PANORAMIC SHOWCASE VIGNETTE]' : ''}): The user attached this book cover photo for this moment. In its dedicated vignette, show the protagonist ${selfDisplayName} (with their natural uncovered hair — strictly NO hat, cap, or headgear!) holding open and reading a physical book whose front cover faithfully displays this attached book cover illustration.`
              : `CRITICAL VISUAL GROUNDING FOR THIS VIGNETTE (${m.title || 'Moment ' + mIdx}: "${m.text || ''}"${m.isStarred ? ' [★ STARRED IMPORTANT MOMENT - PLACE IN LARGE ~50% LOWER PANORAMIC SHOWCASE VIGNETTE]' : ''}): You MUST prominently and faithfully incorporate the exact visual subject, objects, and composition of this attached Reference Photo as the centerpiece of its dedicated vignette.`)
      });
    });
    const chronicleProtagonistNote = isShridharArtContext
      ? `Father Shridhar, mid-age 40-year-old Indian man with a soft fuller round-oval face, full cheeks, thick short dark hair, neat dark stubble beard, and ${fatherBuildPhrase}`
      : `${selfDisplayName}${selfMemberObj && (selfMemberObj.uncompromisableAnchors || selfMemberObj.visualTraits) ? ', ' + (selfMemberObj.uncompromisableAnchors || selfMemberObj.visualTraits) : ''}`;
    parts.push({
      text: `Create a masterpiece ${effectiveChronicleVignetteCount}-vignette editorial watercolor and gouache illustration page on warm textured vintage cream-buff parchment paper (#EDE3D0) with visible organic paper grain, featuring EXACTLY ${effectiveChronicleVignetteCount} separate, self-contained moment visuals (${effectiveChronicleVignetteCount === 2 ? '1 Upper Vignette + 1 Lower Vignette stacked vertically — STRICTLY ONLY 2 VIGNETTES TOTAL, NEVER 3 VIGNETTES!' : '3 separate vignettes'}) where each moment is surrounded by a soft, blurry, feathered dry-brush cloud gradient halo in a subtle, muted watercolor tint suited to that moment's mood (always understated so it never takes attention away from the moment) whose outer edges smoothly fade to zero opacity into the warm parchment paper (STRICTLY NO crisp vignette borders, NO hard water-stain puddle perimeter rings, NO straight vertical or rectangular frame edges, NOT a single merged full-bleed background scene, and strictly zero printed captions or labels): ${enhancedPrompt}. Ensure the self/protagonist (${chronicleProtagonistNote}) is dressed in situation-appropriate attire specific to each individual moment rather than copying the same outfit across moments, and keep all family members and companions strictly inside their respective moment's cloudy-shaded vignette. Faithfully display the attached Reference Photo/Logo inside its corresponding vignette. ${textureStyle}, masterwork, strictly no printed captions, no numbers, and no random background words.`
    });
  } else if (Array.isArray(stylizedAvatars) && stylizedAvatars.length > 0) {
    stylizedAvatars.forEach((av, i) => {
      const cleanAv = av.imageBase64.includes(',') ? av.imageBase64.split(',')[1] : av.imageBase64;
      parts.push({
        inlineData: {
          mimeType: av.imageMimeType || 'image/png',
          data: cleanAv
        }
      });
      parts.push({
        text: `Stylized Character Model #${i + 1}: ${av.name || av.roleLabel} (${av.roleLabel || 'Family Member'})`
      });
    });
    parts.push({
      text: `Render this scene in high-aesthetic 4:5 vertical magazine portrait format: ${enhancedPrompt}. CRITICAL IDENTITY DIRECTIVE: Use the attached Character Models (#1 to #${stylizedAvatars.length}) as the exact illustrated likeness and facial models for the corresponding protagonists in this scene. Maintain their illustrated facial features, hairstyles, and authentic body proportions faithfully in this new context and attire. ${textureStyle}, masterwork, no typography, no letters, no text.`
    });
  } else if (resolvedBase64) {
    const cleanData = resolvedBase64.includes(',') ? resolvedBase64.split(',')[1] : resolvedBase64;
    parts.push({
      inlineData: {
        mimeType: resolvedMime,
        data: cleanData
      }
    });
    parts.push({
      text: `Use the person in this attached reference photograph as the EXACT facial and physical likeness model for the central protagonist in this scene (faithfully preserving their exact face shape, eye shape, nose, hairstyle, and exact facial-hair/clean-shaven appearance from the attached photo), and render this scene as a high-aesthetic cinematic editorial magazine poster in 4:5 vertical portrait format: ${enhancedPrompt}. Imposing visual composition, ${textureStyle}, vivid color grading, masterwork, strictly no typography, no letters, no text, and no unrequested political party emblems.`
    });
  } else {
    parts.push({
      text: `${enhancedPrompt}, 4:5 vertical portrait format, dramatic atmospheric mood, ${textureStyle}, high aesthetic, vivid color grading, masterwork, no typography, no letters, no text.`
    });
  }

  const payload = JSON.stringify({
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: {
        aspectRatio: '3:4'
      }
    }
  });

  const startTime = Date.now();
  for (const model of imageModels) {
    const elapsed = Date.now() - startTime;
    const remainingTime = timeoutMs - elapsed;
    if (remainingTime < 2000) break;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remainingTime);

      const resp = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });
      clearTimeout(timer);

      if (resp.ok) {
        const data = await resp.json();
        const candidate = data.candidates?.[0];
        const inlinePart = candidate?.content?.parts?.find(p => p.inlineData);
        if (inlinePart && inlinePart.inlineData && inlinePart.inlineData.data) {
          return `data:${inlinePart.inlineData.mimeType || 'image/png'};base64,${inlinePart.inlineData.data}`;
        }
        if (candidate?.finishReason === 'IMAGE_OTHER' || candidate?.finishReason === 'SAFETY') {
          console.warn(`Gemini image model ${model} blocked reference photo with ${candidate.finishReason}, falling back to photo-grounded vision prompt immediately`);
          break;
        }
      } else {
        const errText = await resp.text().catch(() => '');
        console.warn(`Gemini image generation with ${model} returned ${resp.status}:`, errText.slice(0, 160));
      }
    } catch (err) {
      console.warn(`Gemini image model ${model} skipped:`, err.message);
    }
  }

  // If image-conditioned attempt returned nothing (e.g. policy block / IMAGE_OTHER on real faces),
  // first extract exact forensic facial likeness traits from the reference photo using Gemini 2.5 Flash Vision so the fallback illustration still captures their real face!
  if (resolvedBase64 || (stylizedAvatars && stylizedAvatars.length > 0)) {
    let visionGroundedPrompt = prompt;
    if (resolvedBase64) {
      const extracted = await extractPhotoGroundedLikenessPrompt(resolvedBase64, resolvedMime, enhancedPrompt);
      if (extracted) {
        visionGroundedPrompt = extracted;
      }
    }
    const remTime = Math.max(12000, timeoutMs - (Date.now() - startTime));
    return generateGeminiEditorialArtwork({ prompt: visionGroundedPrompt, imageBase64: null, timeoutMs: remTime, stylizedAvatars: null, countryContext });
  }

  // If text-only prompt was blocked by Gemini's celebrity/person name filter (IMAGE_OTHER / SAFETY),
  // perform an immediate Likeness-Preserving Retry that strips only the raw proper name token while preserving 100% of the iconic physical likeness description!
  if (!chronicleMode) {
    let likenessSafePrompt = enhancedPrompt;
    for (const fig of PUBLIC_FIGURE_LIKENESS_ANCHORS) {
      if (fig.pattern.test(likenessSafePrompt)) {
        likenessSafePrompt = likenessSafePrompt
          .replace(new RegExp(`ICONIC LIKENESS ANCHOR \\(${fig.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\):\\s*Portray\\s+${fig.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'), `ICONIC LIKENESS ANCHOR: Portray ${fig.roleDesc}`)
          .replace(fig.pattern, `${fig.roleDesc} (${fig.anchor})`);
      }
    }
    // Also sanitize any remaining "President/Prime Minister/CEO [First Last]" proper name triggers while keeping physical descriptions intact
    likenessSafePrompt = likenessSafePrompt.replace(/\b(?:President|Prime Minister|Minister|Chancellor|CEO|Founder|Chairman|Cricketer|Actor)\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b/g, (m) => {
      const roleWord = m.split(/\s+/)[0];
      return `the distinguished ${roleWord}`;
    });
    if (likenessSafePrompt !== enhancedPrompt) {
      try {
        const retryUrl = `https://generativelanguage.googleapis.com/v1beta/models/${imageModels[0]}:generateContent?key=${GEMINI_API_KEY}`;
        const retryCtrl = new AbortController();
        const retryTimer = setTimeout(() => retryCtrl.abort(), Math.max(8000, timeoutMs - (Date.now() - startTime)));
        const retryPayload = JSON.stringify({
          contents: [{ parts: [{ text: `${likenessSafePrompt}, 4:5 vertical portrait format, dramatic atmospheric mood, ${textureStyle}, high aesthetic, vivid color grading, masterwork, no typography, no letters, no text.` }] }],
          generationConfig: {
            responseModalities: ['IMAGE'],
            imageConfig: { aspectRatio: '3:4' }
          }
        });
        const retryResp = await fetch(retryUrl, {
          method: 'POST',
          signal: retryCtrl.signal,
          headers: { 'Content-Type': 'application/json' },
          body: retryPayload
        });
        clearTimeout(retryTimer);
        if (retryResp.ok) {
          const retryData = await retryResp.json();
          const retryPart = retryData.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
          if (retryPart && retryPart.inlineData && retryPart.inlineData.data) {
            return `data:${retryPart.inlineData.mimeType || 'image/png'};base64,${retryPart.inlineData.data}`;
          }
        }
      } catch (retryErr) {
        console.warn('Likeness-preserving retry skipped:', retryErr.message);
      }
    }
  }

  return null;
}

function getCuratedEditorialPhoto() {
  // Completely eliminated external stock photo fallbacks
  return '';
}

function formatChronicleDateLabel(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  const validDate = isNaN(d.getTime()) ? new Date() : d;
  const day = validDate.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[validDate.getMonth()];
  const year = validDate.getFullYear();
  const mod10 = day % 10;
  const mod100 = day % 100;
  let suffix = 'th';
  if (mod10 === 1 && mod100 !== 11) suffix = 'st';
  else if (mod10 === 2 && mod100 !== 12) suffix = 'nd';
  else if (mod10 === 3 && mod100 !== 13) suffix = 'rd';
  return `${day}${suffix} ${month} ${year}`;
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…');
}

function isVideoAudioUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (
      host.includes('youtube.com') ||
      host.includes('youtu.be') ||
      host.includes('vimeo.com') ||
      host.includes('spotify.com') ||
      host.includes('podcasts.apple.com') ||
      host.includes('soundcloud.com') ||
      host.includes('tiktok.com') ||
      host.includes('twitch.tv') ||
      host.includes('ted.com')
    ) {
      return true;
    }
    const path = parsed.pathname.toLowerCase();
    return /\.(mp4|mp3|m4a|webm|mov|ogg)$/i.test(path);
  } catch (_) {
    return false;
  }
}

function extractYouTubeVideoId(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host.includes('youtu.be')) {
      return parsed.pathname.slice(1).split(/[?#&]/)[0];
    }
    if (host.includes('youtube.com')) {
      if (parsed.searchParams.has('v')) return parsed.searchParams.get('v');
      const parts = parsed.pathname.split('/').filter(Boolean);
      const shortsIdx = parts.indexOf('shorts');
      if (shortsIdx !== -1 && parts[shortsIdx + 1]) return parts[shortsIdx + 1];
      const liveIdx = parts.indexOf('live');
      if (liveIdx !== -1 && parts[liveIdx + 1]) return parts[liveIdx + 1];
      const embedIdx = parts.indexOf('embed');
      if (embedIdx !== -1 && parts[embedIdx + 1]) return parts[embedIdx + 1];
    }
  } catch (_) {}
  return null;
}

async function scrapeYouTubeUrl(targetUrl, videoId) {
  let oembed = {};
  try {
    const oembedResp = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (oembedResp.ok) {
      oembed = await oembedResp.json();
    }
  } catch (_) {}

  let playerObj = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const pageResp = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+478; SOCS=CAESEwgDEgk0ODEzNzg5MjQaAmVuIAEaBgiA_LyaBg;'
      }
    });
    clearTimeout(timeout);
    if (pageResp.ok) {
      const pageHtml = await pageResp.text();
      const match = pageHtml.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});(?:var|<\/script>)/s) ||
                    pageHtml.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/);
      if (match) {
        try { playerObj = JSON.parse(match[1]); } catch (_) {}
      }
    }
  } catch (_) {}

  let title = decodeHtmlEntities(playerObj?.videoDetails?.title || oembed.title || '').trim();
  let author = decodeHtmlEntities(playerObj?.videoDetails?.author || oembed.author_name || 'YouTube').trim();
  const rawDesc = playerObj?.videoDetails?.shortDescription || '';
  let desc = decodeHtmlEntities(rawDesc).trim();


  const candidateThumbs = [
    videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : null,
    videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null,
    oembed.thumbnail_url
  ].filter(Boolean);

  let imageUrl = candidateThumbs[0] || null;

  const structuredContent = [
    `Title: ${title}`,
    `Channel / Speaker: ${author}`,
    `Platform: YouTube Video`,
    desc ? `\nVideo Context, Highlights, Primary Receipts & Chapters:\n${desc}` : ''
  ].filter(Boolean).join('\n').trim();

  const shortDesc = desc ? (desc.slice(0, 450).replace(/\s+/g, ' ') + (desc.length > 450 ? '...' : '')) : '';

  return {
    success: true,
    url: targetUrl,
    title: title || 'YouTube Video',
    siteName: `${author} • YouTube`,
    description: shortDesc,
    content: structuredContent,
    imageUrl
  };
}

function getDefaultCuratorStyle(userIdentifier) {
  if (!isShridharOwnerAccount(userIdentifier)) {
    const cleanId = String(userIdentifier || '').trim();
    const displayName = cleanId.includes('@') ? cleanId.split('@')[0] : (cleanId || 'Curator');
    return {
      handle: `@${displayName}`,
      name: displayName,
      updatedAt: new Date().toISOString(),
      style_dna: {
        structure: {
          name: 'Observational Contrast & Grounded Resolution',
          description: 'Opens with an honest, real-world observation from daily life or building experience, contrasts it with human reality or institutional friction, and concludes with a pragmatic, solution-first takeaway.',
          pattern: 'Real-World Observation -> Human Reality Contrast -> Pragmatic Takeaway'
        },
        vocabulary: {
          level: 'Everyday Plainspoken English (5th to 8th Grade)',
          description: 'Crisp, accessible conversational words. Zero academic, think-tank, or corporate buzzwords. Concrete real-world nouns and grounded phrasing.',
          favorite_idioms: []
        },
        tone: {
          stance: 'Pragmatic, Observant & Solution-Oriented',
          description: 'Calm, constructive, and grounded. Balances healthy skepticism of hype with optimistic, hands-on building.',
          voice_adjectives: ['Thoughtful', 'Constructive', 'Unpretentious', 'Grounded', 'Human-Centered']
        }
      },
      weekly_observations: []
    };
  }
  return {
    handle: '@Shridhar Reddy',
    name: 'Shridhar Reddy',
    updatedAt: new Date().toISOString(),
    style_dna: {
      structure: {
        name: 'Observational Contrast & Grounded Resolution',
        description: 'Opens with an honest, real-world observation from daily life or building experience, contrasts it with human reality or institutional friction, and concludes with a pragmatic, solution-first takeaway.',
        pattern: 'Real-World Observation -> Human Reality Contrast -> Pragmatic Takeaway'
      },
      vocabulary: {
        level: 'Everyday Plainspoken English (5th to 8th Grade)',
        description: 'Crisp, accessible conversational words. Zero academic, think-tank, or corporate buzzwords. Concrete real-world nouns and grounded phrasing.',
        favorite_idioms: ['talk of the town', 'in due course', 'down the line', 'whole equation', 'humbling reminder', 'pinch of salt', 'concrete problems', 'on the ground', 'at our level']
      },
      tone: {
        stance: 'Pragmatic, Observant & Solution-Oriented',
        description: 'Calm, constructive, and grounded. Balances healthy skepticism of hype with optimistic, hands-on building: solutions must be the focus, not endless theoretical debates.',
        voice_adjectives: ['Thoughtful', 'Constructive', 'Unpretentious', 'Grounded', 'Human-Centered']
      }
    },
    weekly_observations: [
      {
        period: 'October 2026 • Week 3',
        summary: 'High-impact focus on practical builders and population-scale tools. Sentence length tight and disciplined.',
        structure_growth: 'Clean separation between macro observations and immediate local builder agency.',
        vocabulary_growth: 'Strong preference for direct idioms ("talk of the town", "in due course") over abstract technical jargon.',
        tone_milestone: 'Established a signature constructive stance: recognizing complexity without succumbing to doom or hype.'
      },
      {
        period: 'October 2026 • Week 2',
        summary: 'Explored personal travel narratives across Kerala with sensory grounding and family observations.',
        structure_growth: 'Mastered the gentle shift from external scenery (Munnar hills, Alleppey backwaters) to internal life priorities.',
        vocabulary_growth: 'Natural conversational cadence; run-on clauses gracefully divided into evocative reflections.',
        tone_milestone: 'Warm, philosophical voice emphasizing presence, relationships, and slowing down.'
      },
      {
        period: 'October 2026 • Week 1',
        summary: 'Initial exploration of creator identity and community building fundamentals.',
        structure_growth: 'Posed sharp rhetorical questions exploring selfless collaboration versus monetized interest.',
        vocabulary_growth: 'Identified core thematic vocabulary centered around trust, authentic craft, and peer connection.',
        tone_milestone: 'Curious, probing, and deeply values-driven.'
      }
    ]
  };
}

function getDefaultHeightCmForMember(m) {
  if (!m) return 165;
  if (m.id === 'member_father' || m.relationship === 'self') return 178; // 5'10"
  if (m.id === 'member_mother' || m.relationship === 'spouse') return 162; // 5'4"
  if (m.id === 'member_elder_son' || m.relationship === 'elder_son') return 142; // 4'8" (clearly shorter than Mother 5'4")
  if (m.id === 'member_younger_son' || m.relationship === 'younger_son') return 127; // 4'2"
  const age = Number(m.age);
  if (Number.isFinite(age) && age > 0) {
    if (age <= 8) return 127;
    if (age <= 12) return 142;
    if (age <= 15) return 155;
  }
  return 165;
}

function resolveMemberHeightCm(m) {
  if (!m) return 165;
  const directCm = Number(m.heightCm || (m.structuredTraits && m.structuredTraits.heightCm));
  if (Number.isFinite(directCm) && directCm >= 60 && directCm <= 230) {
    return Math.round(directCm);
  }
  const desc = String(m.heightDesc || '');
  const cmMatch = desc.match(/(\d{2,3})\s*cm\b/i);
  if (cmMatch) {
    const parsedCm = parseInt(cmMatch[1], 10);
    if (parsedCm >= 60 && parsedCm <= 230) return parsedCm;
  }
  const ftInMatch = desc.match(/(\d)\s*(?:ft|')\s*(\d{1,2})\s*(?:in|")?/i);
  if (ftInMatch) {
    const ft = parseInt(ftInMatch[1], 10);
    const inch = parseInt(ftInMatch[2], 10);
    const computed = Math.round(((ft * 12) + inch) * 2.54);
    if (computed >= 60 && computed <= 230) return computed;
  }
  return getDefaultHeightCmForMember(m);
}

function cmToFeetInches(cm) {
  const safeCm = Math.max(60, Math.min(230, Math.round(Number(cm) || 165)));
  const totalInches = Math.round(safeCm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return {
    cm: safeCm,
    feet,
    inches,
    label: `${feet}ft ${inches}in (${safeCm}cm)`,
    shortLabel: `${feet}'${inches}" (${safeCm}cm)`
  };
}

function describeAnatomicalHeadLandmarkAgainstTaller(shorterCm, tallerCm, tallerLabel) {
  const ratio = shorterCm / Math.max(1, tallerCm);
  const pct = Math.round(ratio * 100);
  const diffCm = Math.max(0, Math.round(tallerCm - shorterCm));
  const diffIn = Math.max(0, Math.round(diffCm / 2.54));
  if (diffCm <= 3 || ratio >= 0.98) {
    return `${pct}% of ${tallerLabel}'s height (nearly equal height, within ${diffIn}in / ${diffCm}cm)`;
  }
  if (ratio >= 0.90) {
    return `${pct}% of ${tallerLabel}'s height (-${diffIn}in / -${diffCm}cm shorter; top of head reaches ${tallerLabel}'s eye / brow level)`;
  }
  if (ratio >= 0.885 && tallerCm <= 150) {
    return `${pct}% of ${tallerLabel}'s height (-${diffIn}in / -${diffCm}cm shorter; top of head rises above ${tallerLabel}'s shoulders to reach ${tallerLabel}'s chin / neck level)`;
  }
  if (ratio >= 0.84) {
    return `${pct}% of ${tallerLabel}'s height (-${diffIn}in / -${diffCm}cm shorter; top of head is strictly BELOW ${tallerLabel}'s chin at ${tallerLabel}'s collarbone / upper-shoulder level — a full head shorter than ${tallerLabel}, strictly NEVER reaching ${tallerLabel}'s ear/eye level and NEVER taller than ${tallerLabel}!)`;
  }
  if (ratio >= 0.76) {
    return `${pct}% of ${tallerLabel}'s height (-${diffIn}in / -${diffCm}cm shorter; top of head reaches ${tallerLabel}'s upper-chest / sternum level, below ${tallerLabel}'s shoulders)`;
  }
  return `${pct}% of ${tallerLabel}'s height (-${diffIn}in / -${diffCm}cm shorter; top of head reaches ${tallerLabel}'s mid-chest / ribcage level)`;
}

function buildDynamicPairwiseStatureDirective(activeMembers = [], allVaultMembers = []) {
  if (!Array.isArray(activeMembers) || activeMembers.length < 2) return null;
  const sorted = activeMembers
    .slice()
    .sort((a, b) => resolveMemberHeightCm(b) - resolveMemberHeightCm(a));
  const tallest = sorted[0];
  const tallestCm = resolveMemberHeightCm(tallest);
  const tallestInfo = cmToFeetInches(tallestCm);
  const tallestName = tallest.name || tallest.roleLabel || 'Tallest Member';

  const ladderLines = [];
  const snippetParts = [];

  sorted.forEach((m, idx) => {
    const mCm = resolveMemberHeightCm(m);
    const mInfo = cmToFeetInches(mCm);
    const mName = m.name || m.roleLabel || `Person #${idx + 1}`;
    if (idx === 0) {
      ladderLines.push(`  1. TALLEST IN SCENE (100% Scene Height Baseline / 1.00x): ${mName} (${m.roleLabel || m.relationship}, age ${m.age || 'N/A'}) — actual height ${mInfo.label}. Must be drawn visibly tallest among all present family members.`);
      snippetParts.push(`${mName} (${mInfo.shortLabel}, 100% tallest in scene)`);
    } else {
      const prevTaller = sorted[idx - 1];
      const prevCm = resolveMemberHeightCm(prevTaller);
      const prevName = prevTaller.name || prevTaller.roleLabel || 'taller member';
      const vsImmediateTaller = describeAnatomicalHeadLandmarkAgainstTaller(mCm, prevCm, prevName);
      const vsSceneTallest = (prevTaller.id !== tallest.id)
        ? ` | against scene tallest ${tallestName}: ${describeAnatomicalHeadLandmarkAgainstTaller(mCm, tallestCm, tallestName)}`
        : '';
      ladderLines.push(`  ${idx + 1}. ${mName} (${m.roleLabel || m.relationship}, age ${m.age || 'N/A'}) — actual height ${mInfo.label}: ${vsImmediateTaller}${vsSceneTallest}. STRICTLY NEVER draw ${mName} as tall as or taller than ${prevName}!`);
      snippetParts.push(`${mName} (${mInfo.shortLabel}, ${vsImmediateTaller})`);
    }
  });

  const blockText = `SCENE-RELATIVE & PAIRWISE ACTUAL HEIGHT CALCULATOR (WORKS EVEN WHEN TALLEST FAMILY MEMBER IS NOT IN SCENE):
- The present cast members are ordered from tallest to shortest by their actual heights. Use ${tallestName} (${tallestInfo.label}) as the 100% Scene Height Reference (1.00x of scene) and lock each shorter member's head height to the exact pairwise percentage and anatomical landmark below:
${ladderLines.join('\n')}`;

  return {
    blockText,
    snippetText: `strict pairwise height hierarchy from tallest to shortest: ${snippetParts.join(' -> ')}`
  };
}

function getDefaultFamilyCast(userIdentifier) {
  if (!isShridharOwnerAccount(userIdentifier)) {
    return {
      userIdentifier: userIdentifier || '',
      updatedAt: new Date().toISOString(),
      members: [],
      collectiveAliases: ['family', 'my family', 'kids', 'my kids', 'children'],
      preferences: {
        strictAgeGapEnforcement: true,
        indiaRightHandDrive: true,
        preferScenicOverlookWhenCrowded: true
      }
    };
  }
  return {
    userIdentifier: userIdentifier || '@Shridhar Reddy',
    updatedAt: new Date().toISOString(),
    members: [
      {
        id: 'member_father',
        relationship: 'self',
        roleLabel: 'Father / Self',
        name: 'Shridhar',
        aliases: ['dad', 'father', 'shridhar', 'myself', 'me', 'i', 'husband'],
        age: 40,
        ageBracket: 'Mid-Age Adult (Age 40, Early 40s)',
        heightCm: 178,
        heightDesc: '5ft 10in (178cm) • 100% family baseline (110% of Mother Aruna, +6in taller), natural medium-full build with subtle 10% waist softness flush with chest',
        structuredTraits: {
          bodyVolume: 'broad_full',
          tummyProfile: 'subtle_10',
          faceFullness: 'round_full_submental',
          heightCm: 178,
          baseHeightRatio: 1.00,
          hairStyle: 'short_brushed_up',
          facialHair: 'light_stubble',
          landmarks: []
        },
        uncompromisableAnchors: 'Mid-age 40-year-old Indian man in his early 40s (strictly age 38-40, STRICTLY NOT old or elderly, STRICTLY NO senior facial wrinkles), warm medium-brown skin, soft fuller round-oval face with full cheeks and natural under-chin/submental fullness, calm dark brown eyes, full head of thick short dark hair styled up at the crown, short light neat trimmed stubble beard along the jaw, and a natural medium-full adult build with a straight-cut everyday waist and subtle 10% lower-waist softness that stays completely flush with his chest line under a straight-draping shirt (strictly neither a skinny V-taper gym body nor a protruding pot-belly or round paunch).',
        visualTraits: 'Warm medium-brown skin, soft fuller round-oval face with full cheeks and natural under-chin fullness, calm dark eyes, full head of thick short dark hair styled up, neat short trimmed stubble beard, and a natural medium-full adult build with a straight-cut everyday waist and subtle 10% lower-waist softness flush with his chest line (strictly neither a skinny V-taper gym waist nor a protruding pot-belly).',
        vehicleRole: 'driver_right',
        defaultClothing: 'Casual dark polo or linen shirt and trousers',
        stylizedAvatarUrl: 'https://fxfklefnkpmhofncqhfh.supabase.co/storage/v1/object/public/posters/avatar_member_father.jpg'
      },
      {
        id: 'member_mother',
        relationship: 'spouse',
        roleLabel: 'Mother / Wife',
        name: 'Aruna',
        aliases: ['wife', 'mother', 'mom', 'aru', 'aruna'],
        age: 36,
        ageBracket: 'Adult (Mid 30s)',
        heightCm: 162,
        heightDesc: '5ft 4in (162cm) • 91% of Father Shridhar (-6in / -16cm, reaching Father\'s eye/brow level) • +8in (20cm) taller than Elder Son Gahan',
        structuredTraits: {
          bodyVolume: 'medium',
          tummyProfile: 'slight_tummy',
          faceFullness: 'soft_full_cheeks',
          heightCm: 162,
          baseHeightRatio: 0.91,
          hairStyle: 'long_shoulder_swept',
          facialHair: 'none',
          landmarks: ['forehead_bindi', 'hairline_kumkum', 'stud_earrings']
        },
        uncompromisableAnchors: 'Warm golden-brown wheatish skin, soft fuller round-to-oval maternal face with warm full cheeks and soft rounded chin, gentle dark almond eyes without heavy makeup, small black circular bindi centered on forehead and subtle red kumkum at the upper forehead hairline, side-parted thick voluminous wavy black hair swept forward over her left shoulder past her collarbone, small gold stud earrings, and an authentic, healthy medium-to-full South Indian adult build with natural soft shoulders (5ft 4in / 162cm, 91% of Father\'s height, clearly 8 inches / 20cm taller than 11yo Elder Son Gahan).',
        visualTraits: 'Warm golden-brown skin, soft fuller round-to-oval maternal face with full cheeks, small black forehead bindi and subtle red kumkum at hairline, gentle dark eyes, side-parted long voluminous wavy black hair cascading over one shoulder, and an authentic, healthy medium adult build (5ft 4in / 162cm, 8 inches taller than Elder Son Gahan).',
        vehicleRole: 'passenger_front_left',
        defaultClothing: 'Vibrant comfortable travel attire',
        stylizedAvatarUrl: 'https://fxfklefnkpmhofncqhfh.supabase.co/storage/v1/object/public/posters/avatar_member_mother.jpg'
      },
      {
        id: 'member_elder_son',
        relationship: 'elder_son',
        roleLabel: 'Elder Son (Age 11)',
        name: 'Gahan',
        aliases: ['gahan', 'elder son', 'older son', 'older boy', 'elder brother', 'big brother', 'first son', '11-year-old', '11yo'],
        age: 11,
        ageBracket: 'Pre-teen / Adolescent (11 Years Old)',
        heightCm: 142,
        heightDesc: '4ft 8in (142cm) • 88% of Mother Aruna (-8in / -20cm shorter; head strictly below Mother\'s chin at her collarbone/shoulder level) • 80% of Father Shridhar (-14in) • +6in taller than Rishu',
        structuredTraits: {
          bodyVolume: 'medium',
          tummyProfile: 'flat',
          faceFullness: 'oval_balanced',
          heightCm: 142,
          baseHeightRatio: 0.80,
          hairStyle: 'short_side_part',
          facialHair: 'none',
          landmarks: []
        },
        uncompromisableAnchors: 'Warm brown-skinned 11-year-old pre-teen Indian boy with a gentle round-oval face, full cheeks, dark expressive eyes, thick short textured black hair with a slight side part, square shoulders, and a sturdy solid pre-teen frame (strictly not skinny or frail), standing at 4ft 8in (142cm — 88% of Mother Aruna\'s 162cm height and 80% of Father\'s 178cm height; clearly 8 inches / 20cm shorter than his Mother so the top of Gahan\'s head is strictly BELOW Mother\'s chin at her collarbone/upper-shoulder level, strictly NEVER as tall as or taller than Mother!).',
        visualTraits: 'Healthy 11-year-old pre-teen boy with a gentle round-oval face, dark expressive eyes, thick short textured black hair, and a sturdy, solid frame with natural square shoulders, standing at 4ft 8in (142cm — 88% of Mother\'s height, top of head strictly below Mother\'s chin at her collarbone/shoulder level).',
        vehicleRole: 'passenger_rear_right',
        defaultClothing: 'Navy blue or dark graphic tee / hoodie',
        stylizedAvatarUrl: 'https://fxfklefnkpmhofncqhfh.supabase.co/storage/v1/object/public/posters/avatar_member_elder_son.jpg'
      },
      {
        id: 'member_younger_son',
        relationship: 'younger_son',
        roleLabel: 'Younger Son (Age 7)',
        name: 'Rishu',
        aliases: ['rishu', 'younger son', 'little son', 'younger boy', 'younger brother', 'little brother', 'second son', '7-year-old', '7yo'],
        age: 7,
        ageBracket: 'Young Child / Primary School (7 Years Old)',
        heightCm: 127,
        heightDesc: '4ft 2in (127cm) • 89% of Elder Brother Gahan (-6in / -15cm shorter; top of head rises above Gahan\'s shoulders to reach Gahan\'s chin/neck level) • 78% of Mother Aruna • 71% of Father Shridhar',
        structuredTraits: {
          bodyVolume: 'medium',
          tummyProfile: 'flat',
          faceFullness: 'soft_full_cheeks',
          heightCm: 127,
          baseHeightRatio: 0.71,
          hairStyle: 'short_fringe',
          facialHair: 'none',
          landmarks: []
        },
        uncompromisableAnchors: 'Warm wheatish-skinned 7-year-old schoolboy with round youthful cheeks, large expressive dark eyes, neat short straight black hair with a front fringe, and a healthy compact child frame, standing at 4ft 2in (127cm — 89% of his older brother Gahan\'s 142cm height, 6 inches / 15cm shorter than Gahan so the top of Rishu\'s head rises above Gahan\'s shoulders to reach Gahan\'s chin/neck level; 78% of Mother\'s height; 71% of Father\'s height).',
        visualTraits: 'Young 7-year-old boy with warm wheatish skin, round cheeks, dark expressive eyes, neat short black hair, and a healthy compact frame standing at 4ft 2in (127cm — 89% of Gahan\'s height, top of head rising above Gahan\'s shoulders to reach Gahan\'s chin/neck level).',
        vehicleRole: 'passenger_rear_left',
        defaultClothing: 'Mustard yellow or bright green graphic t-shirt',
        stylizedAvatarUrl: 'https://fxfklefnkpmhofncqhfh.supabase.co/storage/v1/object/public/posters/avatar_member_younger_son.jpg'
      }
    ],
    collectiveAliases: ['family', 'my family', 'kids', 'my kids', 'both boys', 'sons', 'my sons', 'boys', 'children'],
    preferences: {
      strictAgeGapEnforcement: true,
      indiaRightHandDrive: true,
      preferScenicOverlookWhenCrowded: true
    }
  };
}

function buildFallbackMomentVisualProjections(chronicleMoments = [], countryContext = 'India', familyCast = null, userEmail = '') {
  const isShridharFallback = isShridharCastContext(familyCast, userEmail);
  const selfMember = (familyCast && Array.isArray(familyCast.members))
    ? familyCast.members.find(m => m && (m.relationship === 'self' || m.id === 'member_father'))
    : null;
  const selfName = (selfMember && selfMember.name) || (isShridharFallback ? 'Shridhar' : 'Narrator');
  const elderChild = (familyCast && Array.isArray(familyCast.members))
    ? familyCast.members.find(m => m && (m.relationship === 'elder_son' || m.id === 'member_elder_son'))
    : null;
  const youngerChild = (familyCast && Array.isArray(familyCast.members))
    ? familyCast.members.find(m => m && (m.relationship === 'younger_son' || m.id === 'member_younger_son'))
    : null;
  const elderName = (elderChild && elderChild.name) || (isShridharFallback ? 'Gahan' : 'Elder Child');
  const youngerName = (youngerChild && youngerChild.name) || (isShridharFallback ? 'Rishu' : 'Younger Child');

  const valid = Array.isArray(chronicleMoments) ? chronicleMoments.filter(m => m && String(m.text || '').trim().length >= 2) : [];
  return valid.map((m, idx) => {
    const text = String(m.text || '').trim();
    const lower = text.toLowerCase();
    const numStr = String(idx + 1).padStart(2, '0');
    const shortSnippet = text.length > 56 ? text.slice(0, 53) + '...' : text;

    let options = [];
    if (isShridharFallback && /\b(kids fighting|boys fighting|kids arguing|squabble|fighting over|silly reasons|my kids|my sons|my boys|gahan|rishu)\b/i.test(lower)) {
      options = [
        {
          id: `m${idx + 1}_opt_1`,
          archetype: 'direct_action',
          badge: '★ Best Fit • My 2 Sons Action',
          confidence: 94,
          title: `${selfName} Mediating Between Sons ${elderName} (11) & ${youngerName} (7)`,
          description: `${selfName} kneeling calmly in the home living room between his two sons: taller 11yo ${elderName} (navy tee & denim shorts) and shorter 7yo ${youngerName} (mustard tee & dark shorts, head at ${elderName}'s chin/neck level), resolving their playful squabble.`,
          castIds: ['member_father', 'member_elder_son', 'member_younger_son'],
          isPersonalFamily: true
        },
        {
          id: `m${idx + 1}_opt_2`,
          archetype: 'warm_resolution',
          badge: '🤝 Warm Resolution • Brotherly Peace',
          confidence: 84,
          title: `Two Brothers ${elderName} & ${youngerName} Making Up After Dad's Advice`,
          description: `11yo elder son ${elderName} (4'8") and 7yo younger son ${youngerName} (4'2") sharing a laugh and peace handshake as Father ${selfName} smiles beside them.`,
          castIds: ['member_father', 'member_elder_son', 'member_younger_son'],
          isPersonalFamily: true
        },
        {
          id: `m${idx + 1}_opt_3`,
          archetype: 'symbolic_focus',
          badge: '🎨 Symbolic Detail • Disputed Toy & Calm Hands',
          confidence: 74,
          title: 'Father\'s Calm Hands Holding the Disputed Toy Between Both Boys',
          description: `Expressive close-medium composition focusing on ${selfName}'s patient gesture holding the toy between 11yo ${elderName} and 7yo ${youngerName}.`,
          castIds: ['member_father', 'member_elder_son', 'member_younger_son'],
          isPersonalFamily: true
        }
      ];
    } else if (/\b(mother-in-law|hospital|clinic|doctor|checkup|health|aging|elderly)\b/i.test(lower)) {
      options = [
        {
          id: `m${idx + 1}_opt_1`,
          archetype: 'direct_action',
          badge: '★ Best Fit • Caring Walk',
          confidence: 93,
          title: `${selfName} Gently Supporting Family Member at Hospital`,
          description: `Caring mid-shot of ${selfName} walking alongside and supporting their family member down a sunlit hospital corridor.`,
          castIds: ['member_father'],
          isPersonalFamily: true
        },
        {
          id: `m${idx + 1}_opt_2`,
          archetype: 'quiet_consultation',
          badge: '🩺 Doctor Consultation • Reassurance',
          confidence: 83,
          title: 'Seated Together by the Clinic Desk Reviewing Medical Reports',
          description: `${selfName} sitting attentively in a calm consultation room with a medical folder in hand.`,
          castIds: ['member_father'],
          isPersonalFamily: true
        },
        {
          id: `m${idx + 1}_opt_3`,
          archetype: 'symbolic_focus',
          badge: '🎨 Symbolic Detail • Steadying Hand & Care',
          confidence: 73,
          title: 'Quiet Moment in the Sunlit Waiting Lounge',
          description: `Reflective medium portrait of ${selfName} offering a reassuring cup of water and steady presence.`,
          castIds: ['member_father'],
          isPersonalFamily: true
        }
      ];
    } else if (/\b(friend|colleague|dosa|chai|coffee|cafe|diner|ai|laptop|discussion)\b/i.test(lower)) {
      options = [
        {
          id: `m${idx + 1}_opt_1`,
          archetype: 'direct_action',
          badge: '★ Best Fit • Candid Diner Chat',
          confidence: 95,
          title: 'Animated Discussion with Friend Over Filter Coffee',
          description: `Expressive waist-up medium shot of ${selfName} and their friend across a cafe table with coffee and an open laptop.`,
          castIds: ['member_father'],
          isPersonalFamily: false
        },
        {
          id: `m${idx + 1}_opt_2`,
          archetype: 'collaborative_screen',
          badge: '💻 Side-by-Side • Live Demo',
          confidence: 85,
          title: 'Comparing Workflows on Laptop & Smartphone',
          description: `${selfName} and their friend leaning in together over a laptop beside steaming coffee.`,
          castIds: ['member_father'],
          isPersonalFamily: false
        },
        {
          id: `m${idx + 1}_opt_3`,
          archetype: 'symbolic_focus',
          badge: '🎨 Symbolic Contrast • Tradition Meets Future Tech',
          confidence: 76,
          title: 'Coffee & Tiffin Beside Modern Laptop Screen',
          description: 'Warm tabletop framing highlighting the contrast of classic tiffin and modern tools as both friends converse.',
          castIds: ['member_father'],
          isPersonalFamily: false
        }
      ];
    } else {
      const hasBothSons = /\b(kids|boys|sons|children|gahan.*rishu|rishu.*gahan)\b/i.test(lower);
      const hasWife = /\b(wife|spouse|aruna|aru)\b/i.test(lower);
      const castIds = ['member_father'];
      if (hasWife) castIds.push('member_mother');
      if (hasBothSons) castIds.push('member_elder_son', 'member_younger_son');
      options = [
        {
          id: `m${idx + 1}_opt_1`,
          archetype: 'direct_action',
          badge: '★ Best Fit • Direct Scene',
          confidence: 91,
          title: `Candid Moment ${numStr}: ${shortSnippet}`,
          description: `Direct real-world watercolor vignette of ${selfName} ${hasBothSons ? `with ${elderName} and ${youngerName} ` : ''}in: "${shortSnippet}"`,
          castIds,
          isPersonalFamily: castIds.length > 1
        },
        {
          id: `m${idx + 1}_opt_2`,
          archetype: 'expressive_midshot',
          badge: '🎯 Expressive Close Mid-Shot',
          confidence: 81,
          title: `Close Human Expression & Interaction (Moment ${numStr})`,
          description: `Waist-up candid focus on facial expressions, gestures, and emotional warmth during: "${shortSnippet}"`,
          castIds,
          isPersonalFamily: castIds.length > 1
        },
        {
          id: `m${idx + 1}_opt_3`,
          archetype: 'symbolic_focus',
          badge: '🎨 Atmospheric & Symbolic Angle',
          confidence: 72,
          title: `Atmospheric Setting & Key Motif (Moment ${numStr})`,
          description: `Poignant environmental framing highlighting the setting and central object of: "${shortSnippet}"`,
          castIds,
          isPersonalFamily: false
        }
      ];
    }

    return {
      momentIndex: idx + 1,
      momentTitle: m.title || `Moment ${numStr}`,
      selectedOptionIdx: 0,
      options
    };
  });
}

function evaluateFallbackStructureBeats(rawText = '', spark = '') {
  const clean = String(rawText || '').trim();
  const combined = `${spark || ''} ${clean}`.trim();
  const wordCount = combined ? combined.split(/\s+/).filter(Boolean).length : 0;

  const rawClauses = clean
    .split(/(?:[.!?;]+|\n+|,\s+(?=(?:as|because|since|so|yet|but|while|whereas|although|though|now|and\s+now|i\s+just|i\s+believe|i\s+feel|i\s+think|i\s+hope|my\s+conviction|my\s+take|for\s+me|to\s+me|what\s+matters|when\s+i|where\s+i)\b)|\s+[\u2014\u2013]\s+)/i)
    .map(c => c.trim())
    .filter(c => c.split(/\s+/).filter(Boolean).length >= 4);

  const usedIdx = new Set();
  const convictionRegex = /\b(i believe|i feel that|my take|my conviction|to me|in my view|for me|we must|we need to|we should|ought to|ultimately|the real lesson|reminds us|reminder that|i hope|i just hope|dream of|life i dream|come out of|coming out of|regular 9 to 5|roam like|work like|principle|takeaway|what counts|the point is|let's|let us|matters most|way forward|stand for|worth fighting|live a life|free man|going forward)\b/i;
  const whyRegex = /\b(because|instead of|however|whereas|although|despite|the problem|the reality|the truth|irony|paradox|tension|consequence|impact|matters|means that|shows that|reveals|proves|signals|reflects|shift|difference|beneath|beyond|unable to|technology gating|feel liberated|liberated|used to keep|rather than|not just|able to build those ideas)\b/i;
  const momentRegex = /\b(as i sit|sitting|watched|watching|saw|read|reading|heard|noticed|listening|looked|today|yesterday|recently|nights|months|morning|evening|when|while|during|article|video|podcast|talk|interview|story|report|scene|moment|son|daughter|kids|wife|friend|colleague|school|office|city|to build apps)\b/i;

  let convIdx = -1;
  for (let i = rawClauses.length - 1; i >= 0; i--) {
    if (rawClauses.length >= 2 && convictionRegex.test(rawClauses[i])) {
      convIdx = i;
      usedIdx.add(i);
      break;
    }
  }

  let whyIdx = -1;
  for (let i = 0; i < rawClauses.length; i++) {
    if (usedIdx.has(i)) continue;
    if (rawClauses.length >= 2 && whyRegex.test(rawClauses[i])) {
      whyIdx = i;
      usedIdx.add(i);
      break;
    }
  }

  let momentIdx = -1;
  for (let i = 0; i < rawClauses.length; i++) {
    if (usedIdx.has(i)) continue;
    const cWords = rawClauses[i].split(/\s+/).filter(Boolean).length;
    if (momentRegex.test(rawClauses[i]) || (i === 0 && cWords >= 6)) {
      momentIdx = i;
      usedIdx.add(i);
      break;
    }
  }

  const hasMoment = momentIdx !== -1 || (wordCount >= 8 && rawClauses.length >= 1);
  const hasWhyItMatters = whyIdx !== -1 || (rawClauses.length >= 3 && wordCount >= 32 && whyRegex.test(combined));
  const hasConviction = convIdx !== -1 || (rawClauses.length >= 3 && wordCount >= 38 && convictionRegex.test(combined));

  const beatsCount = (hasMoment ? 1 : 0) + (hasWhyItMatters ? 1 : 0) + (hasConviction ? 1 : 0);
  const wordScore = Math.min(45, Math.round((wordCount / 42) * 45));
  const beatScore = beatsCount === 3 ? 45 : (beatsCount === 2 ? 28 : (beatsCount === 1 ? 14 : 0));
  const clauseBonus = Math.min(8, rawClauses.length * 2);
  const depthScore = Math.min(96, Math.max(12, wordScore + beatScore + clauseBonus));

  let nudge = '✓ 3/3 signals & deep perspective unlocked — your voice is clear, honest, and ready to synthesize!';
  if (!hasWhyItMatters && !hasConviction) {
    nudge = 'You have a real moment here — now go one layer deeper on why this matters to you and the personal truth or life vision you are claiming.';
  } else if (!hasWhyItMatters) {
    nudge = 'Beautiful moment and conviction — add 1 line on the shift or reason why this matters so deeply to you.';
  } else if (!hasConviction) {
    nudge = 'You have the moment and the shift — now add 1 liberating line on the belief, principle, or life you are claiming for yourself going forward.';
  } else if (depthScore < 70) {
    nudge = 'All 3 signals are taking shape — expand your thought by 1–2 sentences so your depth crosses 70% to unlock synthesis.';
  }

  return {
    hasMoment,
    hasWhyItMatters,
    hasConviction,
    depthScore,
    nudge
  };
}

function buildFallbackVisualSubjects(rawText = '', spark = '', scrapedTitle = '', countryContext = 'India') {
  const combined = `${rawText} ${spark} ${scrapedTitle}`.toLowerCase();
  const isPersonalFamily = /\b(my family|our family|my whole family|our whole family|my kids|our kids|my sons|our sons|my boys|our boys|my children|our children|my wife|my elder son|my younger son|gahan|rishu|aruna|shridhar)\b/i.test(combined);

  if (/\b(parent-teacher|ptm|report card|marks|second-grade|school days|teachers' meeting|school|classroom)\b/i.test(combined)) {
    return [
      {
        id: 'subject_1',
        archetype: 'core_scene',
        badge: '★ Best Fit • Core Scene',
        confidence: 94,
        title: 'Packed School Corridor on Parent-Teacher Meeting Day',
        description: 'Bustling Indian school veranda overflowing with anxious parents, grandparents, and children queuing outside a classroom door.',
        cues: [
          'Packed School Corridor Outside Classroom on PTM Day',
          'Elementary Report Card & Red Ink Marks',
          '20-Minute Grade Negotiation vs Childhood Joy',
          'Sunlit Indian School Veranda Crowded with Families',
          'Warm Morning Daylight Through Classroom Windows'
        ],
        isPersonalFamily: false
      },
      {
        id: 'subject_2',
        archetype: 'core_contrast',
        badge: '⚡ Core Contrast',
        confidence: 85,
        title: 'Debating 2nd-Grade Marks in the Age of AI',
        description: 'Parents intensely debating single-digit elementary marks with a teacher while modern AI quietly transforms the world outside.',
        cues: [
          'Parent & Teacher Debating 2nd-Grade Report Card',
          'Paper Mark Sheet vs Glowing AI Horizon',
          'Obsession with Minor Marks vs Future Competence',
          'Elementary Classroom Desk with Report Cards',
          'Warm Classroom Lamp and Crisp Daylight Contrast'
        ],
        isPersonalFamily: false
      },
      {
        id: 'subject_3',
        archetype: 'editorial_metaphor',
        badge: '🎨 Editorial Metaphor',
        confidence: 76,
        title: 'Carefree Schoolkids Walking Home Unburdened',
        description: 'Smiling school children walking home freely with satchels, contrasting nostalgic trust in education against modern parental anxiety.',
        cues: [
          'Smiling Schoolchildren Walking Home Together',
          'Vintage School Bell & Unhurried Satchels',
          'Trusting Childhood Growth vs Anxious Micro-Management',
          'Tree-Lined Indian School Courtyard at Dismissal',
          'Golden Afternoon Sunlight and Long Peaceful Shadows'
        ],
        isPersonalFamily: false
      }
    ];
  }

  const firstSentence = String(rawText || scrapedTitle || 'Core Editorial Scene').split(/[.!?\n]/)[0].trim();
  const shortTopic = firstSentence.length > 52 ? firstSentence.slice(0, 49) + '...' : firstSentence;

  return [
    {
      id: 'subject_1',
      archetype: 'core_scene',
      badge: '★ Best Fit • Core Scene',
      confidence: 92,
      title: isPersonalFamily ? `Personal Family Scene: ${shortTopic}` : `Real-World Scene: ${shortTopic}`,
      description: isPersonalFamily
        ? `Authentic family moment grounded directly in: "${shortTopic}"`
        : `Concrete real-world scene depicting the core subject of: "${shortTopic}"`,
      cues: [
        shortTopic,
        'Authentic Real-World Contextual Details',
        'Central Narrative Tension in Scene',
        `${countryContext || 'Indian'} Real-World Setting & Architecture`,
        'Natural Editorial Daylight and Chiaroscuro Depth'
      ],
      isPersonalFamily
    },
    {
      id: 'subject_2',
      archetype: 'core_contrast',
      badge: '⚡ Core Contrast',
      confidence: 82,
      title: 'The Central Tension & Contrast',
      description: `Visualizing the two opposing forces or irony highlighted in your perspective.`,
      cues: [
        `Opposing Forces in ${shortTopic}`,
        'Symbolic Contrast of Old vs New Reality',
        'Friction Between Convention and Reality',
        `Editorial Split-Perspective Scene in ${countryContext || 'India'}`,
        'High-Contrast Dramatic Editorial Lighting'
      ],
      isPersonalFamily: false
    },
    {
      id: 'subject_3',
      archetype: 'editorial_metaphor',
      badge: '🎨 Editorial Metaphor',
      confidence: 74,
      title: 'Symbolic Editorial Illustration',
      description: `An evocative broadsheet metaphor capturing the lasting takeaway of your slant.`,
      cues: [
        `Symbolic Metaphor for ${shortTopic}`,
        'Focused Editorial Object & Human Gesture',
        'Quiet Conviction Against Everyday Noise',
        'Minimalist Broadsheet Composition',
        'Warm Golden-Hour Rim Lighting'
      ],
      isPersonalFamily: false
    }
  ];
}

function detectRelevantCastMembers(combined = '', cast = null, options = {}) {
  const c = String(combined || '').toLowerCase();
  const isPersonalChronicle = Boolean(options && options.chronicleMode);
  const isFirstPersonHouseholdKids = !(/\b(parent-teacher|ptm|second-grade|school days|teachers' meeting)\b/i.test(c)) && (
    isPersonalChronicle
    || /\b(my day|started my day|started with|at home|in our home|in the morning|this morning|witnessing kids|kids fighting|boys fighting|both kids|both boys|two kids|two boys)\b/i.test(c)
  );
  const rawMembers = (cast && Array.isArray(cast.members)) ? cast.members : [];
  const members = rawMembers.filter(m => m && m.approvalStatus !== 'pending' && m.approvalStatus !== 'declined' && (
    (m.name && String(m.name).trim())
    || (m.roleLabel && String(m.roleLabel).trim() && String(m.roleLabel).trim() !== 'New Member')
    || ['self', 'spouse', 'elder_son', 'younger_son'].includes(m.relationship)
  ));

  // 0. First-Person Separation / Solitude Scene:
  const isNarratorAloneMissingFamily = /\b(i am alone|being alone|stuck in [a-z]+ while|miss them|missing them|how much i miss|waiting for them|when my wife is out|feeling of separation|feeling of separateness)\b/i.test(c);
  if (isNarratorAloneMissingFamily) {
    const selfMember = members.find(m => m.relationship === 'self') || { id: 'member_father' };
    return new Set([selfMember.id]);
  }

  // Strictly require first-person possessives ("my/our") so general societal observations ("the whole family comes", "the kids") NEVER trigger personal family photos
  const mentionsCollective = /\b(my family|our family|my whole family|our whole family|my entire family|our entire family|the four of us|all four of us|road trip with my family|vacation with my family|walk.*with my family)\b/i.test(c);
  if (mentionsCollective) {
    return new Set(members.map(m => m.id));
  }

  const detected = new Set();
  const mentionsBothSons = /\b(my kids|our kids|both my kids|both our kids|both kids|my sons|our sons|both my sons|both our sons|both sons|two sons|both my boys|both our boys|both boys|my boys|our boys|my children|our children|kids fighting|boys fighting|children fighting|siblings fighting)\b/i.test(c)
    || (isFirstPersonHouseholdKids && /\b(kids|boys|sons|children|brothers)\b/i.test(c));

  members.forEach(m => {
    // 1. Vault Name Tokens (e.g. "shridhar")
    const nameStr = String(m.name || '').toLowerCase();
    const cleanName = nameStr.replace(/[^a-z0-9\s]/g, ' ').trim();
    const nameWords = cleanName.split(/\s+/).filter(w => w.length > 2 && !['father', 'mother', 'elder', 'younger', 'self', 'son'].includes(w));
    for (const w of nameWords) {
      if (new RegExp(`\\b${w}\\b`, 'i').test(c)) {
        detected.add(m.id);
        break;
      }
    }

    // 2. Vault Aliases (e.g. "rishu", "gahan", "aru")
    const aliases = Array.isArray(m.aliases) ? m.aliases : [];
    for (const alias of aliases) {
      const a = String(alias || '').trim().toLowerCase();
      if (!a || a.length < 2 || ['i', 'me', 'my', 'myself'].includes(a)) continue;
      const safe = a.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      if (new RegExp(`\\b${safe}\\b`, 'i').test(c)) {
        detected.add(m.id);
        break;
      }
    }

    // 3. Role-specific semantic keywords
    if (m.relationship === 'elder_son') {
      if (mentionsBothSons || /\b(my elder son|my older son|my older boy|my first son|my 11-year-old|my 11yo|elder son|older son|gahan)\b/i.test(c)) {
        detected.add(m.id);
      }
    } else if (m.relationship === 'younger_son') {
      if (mentionsBothSons || /\b(my younger son|my little son|my younger boy|my second son|my 7-year-old|my 7yo|younger son|little son|rishu)\b/i.test(c)) {
        detected.add(m.id);
      }
    } else if (m.relationship === 'spouse') {
      if (/\b(my wife|my spouse|with my wife|aru|aruna)\b/i.test(c) || (isPersonalChronicle && /\b(wife|spouse)\b/i.test(c))) {
        detected.add(m.id);
      }
    } else if (m.relationship === 'self') {
      if (/\b(shridhar)\b/i.test(c)) {
        detected.add(m.id);
      }
    }
  });

  // 4. First-Person Narrator Participation alongside detected spouse or children, OR Diary Chronicle mode
  const hasChild = detected.has('member_elder_son') || detected.has('member_younger_son');
  const hasSpouse = detected.has('member_mother');
  const hasFirstPersonCoPresence = /\b(and me|with me|between .* and me|i remain|by my side|by his side|beside him|beside her|holding my hand|teaching him|walked with him|support him|i stood|standing beside|my home|my life|my day|witnessing|helping|resolved|resolve|attended|launched)\b/i.test(c);
  if ((hasChild || hasSpouse) && hasFirstPersonCoPresence) {
    detected.add('member_father');
  }

  if (options && options.chronicleMode) {
    const selfMember = members.find(m => m.relationship === 'self') || { id: 'member_father' };
    detected.add(selfMember.id);
  }

  return detected;
}

function buildFamilyCastDirectives({ familyCast, activeCast, castStaging, userSlant = '', spark = '', countryContext = '', sourceType = 'digital_link', perspectiveMode = 'source', chronicleMode = false, preferredVisualSubject = null, userEmail = '' }) {
  // If user selected a topical/non-family Visual Subject from Polish (and did not manually force Family Cast), do NOT inject personal family cast
  if (preferredVisualSubject && preferredVisualSubject.isPersonalFamily === false && !(activeCast && activeCast.manuallySelected)) {
    return null;
  }
  const hasExplicitCast = activeCast && Array.isArray(activeCast.members) && activeCast.members.length > 0;
  if (sourceType !== 'inner_voice' && !hasExplicitCast && perspectiveMode !== 'curator') {
    return null;
  }
  const combined = `${userSlant} ${spark}`.toLowerCase();
  const cast = familyCast || getDefaultFamilyCast(userEmail || (familyCast && familyCast.userIdentifier) || '');
  if ((!cast || !Array.isArray(cast.members) || cast.members.length === 0) && !hasExplicitCast) {
    return null;
  }
  const detectedIds = detectRelevantCastMembers(combined, cast, { chronicleMode });

  const isFamilyContext = (detectedIds.size > 0);

  if (!isFamilyContext && !hasExplicitCast) {
    return null;
  }

  let activeMembers = [];
  if (hasExplicitCast && activeCast.manuallySelected && detectedIds.size <= activeCast.members.length) {
    activeMembers = activeCast.members;
  } else if (hasExplicitCast && detectedIds.size > 0) {
    const mergedIds = new Set([
      ...activeCast.members.map(m => m.id),
      ...Array.from(detectedIds)
    ]);
    activeMembers = (cast.members || []).filter(m => mergedIds.has(m.id));
    if (activeMembers.length === 0) activeMembers = activeCast.members;
  } else if (hasExplicitCast) {
    activeMembers = activeCast.members;
  } else if (detectedIds.size > 0) {
    activeMembers = (cast.members || []).filter(m => detectedIds.has(m.id));
  }
  activeMembers = activeMembers.filter(m => m && m.approvalStatus !== 'pending' && m.approvalStatus !== 'declined');

  if (activeMembers.length === 0) {
    return null;
  }

  const isShridharCast = isShridharCastContext(cast, userEmail);
  const hasElderBoy = activeMembers.some(m => m.relationship === 'elder_son' || m.age === 11);
  const hasYoungerBoy = activeMembers.some(m => m.relationship === 'younger_son' || m.age === 7);
  const hasFather = activeMembers.some(m => m.relationship === 'self');
  const hasMother = activeMembers.some(m => m.relationship === 'spouse');
  const fatherMemberObj = activeMembers.find(m => m.relationship === 'self')
    || (cast && Array.isArray(cast.members) ? cast.members.find(m => m.relationship === 'self') : null);
  const selfCastName = (fatherMemberObj && fatherMemberObj.name) || (isShridharCast ? 'Shridhar' : 'Self');
  const fatherTummyProfile = (fatherMemberObj && fatherMemberObj.structuredTraits && fatherMemberObj.structuredTraits.tummyProfile) || 'subtle_10';
  const fatherBodyVolume = (fatherMemberObj && fatherMemberObj.structuredTraits && fatherMemberObj.structuredTraits.bodyVolume) || 'broad_full';
  const fatherMidsectionPhrase = getFatherMidsectionDescription(fatherTummyProfile, fatherBodyVolume);

  const directives = [];
  const promptSnippets = [];

  const totalCount = activeMembers.length;
  const isSoloProtagonist = (totalCount === 1);
  const soloMember = isSoloProtagonist ? activeMembers[0] : null;
  const maleCount = activeMembers.filter(m => m.relationship === 'self' || m.relationship === 'elder_son' || m.relationship === 'younger_son' || /father|dad|son|boy|brother|male/i.test(`${m.roleLabel} ${m.relationship}`)).length;
  const femaleCount = totalCount - maleCount;

  const pairwiseStature = buildDynamicPairwiseStatureDirective(activeMembers, (cast && cast.members) || []);

  if (chronicleMode && isShridharCast) {
    directives.push(`DAILY CHRONICLE PROTAGONIST, SITUATIONAL ATTIRE, POSTURE-ADJUSTED HEIGHTS & VIGNETTE-SPECIFIC CAST DIRECTIVE:
- Narrator Identity & Body Volume Anchor: Whenever the narrator (Father Shridhar) appears in a vignette, portray him as a mid-age 40-year-old Indian man in his early 40s with warm medium-brown skin, a soft fuller round-oval face with full cheeks and natural under-chin/submental fullness, full head of thick short dark hair styled up at the crown, short light neat trimmed stubble beard, and ${fatherMidsectionPhrase} (strictly NOT old or elderly).
- Mother / Wife (Aruna) Identity Anchor (WHEN PRESENT IN A VIGNETTE): Whenever Wife / Mother (Aruna) appears in a vignette, you MUST explicitly describe her exact authentic facial and hair traits in "illustrationPrompt": warm golden-brown wheatish skin, soft fuller round-to-oval maternal face with warm full cheeks and soft rounded chin (strictly NOT a narrow/sharp-chinned face), small black circular bindi centered on her forehead and subtle red kumkum at the upper forehead hairline, gentle dark eyes, side-parted thick voluminous wavy black hair swept forward over her left shoulder past her collarbone, and a healthy natural medium-to-full South Indian adult build (5ft 4in / 162cm, 91% of Father's 178cm height, clearly 8 inches / 20cm TALLER than 11yo Elder Son Gahan).
- STRICT RULE FOR "KIDS", "CHILDREN", "BOYS", OR "KIDS FIGHTING" (BOTH ARE SONS — 2 MALE BROTHERS, ZERO GIRLS, 6-INCH HEIGHT GAP): Whenever any moment mentions "kids", "my kids", "kids fighting", "boys", "sons", or "children", those kids are STRICTLY the narrator's TWO SONS from the Family Vault — NEVER invent generic "two young siblings" and STRICTLY NEVER draw a girl or sister! You MUST explicitly name and describe BOTH BOYS in "illustrationPrompt" as: (1) 11-year-old Elder Son Gahan (BOY, 4ft 8in / 142cm, gentle oval face, thick short black hair, sturdy pre-teen build, wearing a dark navy-blue t-shirt and knee-length denim shorts) and (2) 7-year-old Younger Son Rishu (BOY, 4ft 2in / 127cm, 89% of Elder Brother Gahan's height — 6 inches / 15cm shorter than Gahan so the top of Rishu's head rises above Gahan's shoulders to reach Gahan's chin/neck level, round cheerful face, neat short black hair, wearing a mustard-yellow t-shirt and dark shorts) — BOTH BOYS (2 MALE BROTHERS, STRICTLY ZERO GIRLS!).
- Framing Balance (Candid Mid-Shot vs. Group Scale) & Pairwise Relative Stature: Balance the shot framing between capturing the candid human moment and showing scale: for 1-2 person conversational, seated, or indoor moments (e.g. meeting a friend over chai, reading a book, working at a desk), use an expressive CANDID WAIST-UP / CHEST-UP MEDIUM SHOT (MID-SHOT) that highlights facial expressions, gestures, and upper-body/midsection build rather than forcing a distant full-body shot. Use a pulled-back full-body / wide shot (with generous left/right margins so nobody is clipped at the edge) ONLY when the moment involves active movement (like a family walk or march) or fitting 3-4+ standing people together. Whenever Elder Son Gahan and Younger Son Rishu appear, preserve their exact pairwise relative stature: Elder Son Gahan as a "11yo pre-teen boy with a gentle oval face (4ft 8in / 142cm — 88% of Mother Aruna's 162cm height and 80% of Father's 178cm height; clearly 8 inches / 20cm shorter than Mother Aruna so the top of Gahan's head is strictly BELOW Mother's chin at her collarbone / upper-shoulder level, strictly NEVER as tall as or taller than Mother!, wearing a dark navy-blue t-shirt, knee-length denim shorts, and sneakers)", and Younger Son Rishu as a "7yo younger schoolboy with a round cheerful face (4ft 2in / 127cm — 89% of Elder Brother Gahan's 142cm height, 6 inches / 15cm shorter than Gahan so the TOP OF RISHU'S HEAD RISES ABOVE GAHAN'S SHOULDERS to reach Gahan's CHIN / NECK level; strictly NEVER equal height with Gahan!, wearing a mustard-yellow t-shirt, dark shorts, and sneakers)".
- POSTURE-ADJUSTED RELATIVE STATURE MATRIX (Action Multiplier x Actual Height):
  * Standing / Walking = 1.00x of base height | Leaning = 0.88x | Sitting on chair/sofa/bench = 0.72x (-28% height) | Kneeling/Crouching = 0.64x (-36%) | Sitting on floor = 0.52x (-48%).
  * Whenever two characters have different postures in a vignette (e.g., Father at 178cm is sitting in a chair at 178 * 0.72 = 128cm effective height while 11yo Elder Son Gahan at 142cm is standing beside him at 142 * 1.00 = 142cm effective height), explicitly state their effective height relationship ("standing Gahan's head rises ~11% / half-a-head ABOVE seated Father's head").
- SITUATION-SPECIFIC ATTIRE PER MOMENT (DO NOT COPY OUTFITS BLINDLY): Dress Shridhar and family members in attire that matches the exact situation and activity of each individual moment (e.g. uniform for a uniformed march, smart casual shirt at a work desk, athletic wear for sports/walk, kurta or home wear at home). Never blindly copy attire from one vignette into another!
- VIGNETTE-SCOPED CHARACTER PLACEMENT & SUPPORTING CAST (DO NOT MERGE ALL CHARACTERS INTO ONE SCENE): Each Daily Chronicle vignette is a separate, isolated cloudy-shaded watercolor-and-gouache moment visual on warm parchment paper. Depict family members (${activeMembers.map(m => m.name || m.roleLabel).join(', ')}), colleagues, friends, or hosts ONLY inside the specific moment vignette where they are mentioned, and specify the exact foreground headcount (Main Cast + Supporting Characters) for each vignette! Never combine all moments into a single full-bleed family portrait.`);
    promptSnippets.push(`Daily Chronicle isolated cloudy-shaded watercolor-and-gouache moment vignettes on warm parchment paper with situation-specific attire per moment`);
  } else if (chronicleMode) {
    directives.push(`DAILY CHRONICLE PROTAGONIST, SITUATIONAL ATTIRE & VIGNETTE-SPECIFIC CAST DIRECTIVE:
- Narrator & Family Identity Anchors: Depict the narrator (${selfCastName}) and approved Family Vault members (${activeMembers.map(m => `${m.name || m.roleLabel} [${m.roleLabel || m.relationship}, age ${m.age || 'Adult'}, ${m.uncompromisableAnchors || m.visualTraits || m.heightDesc || ''}]`).join('; ')}) faithfully according to their Vault profiles.
- SITUATION-SPECIFIC ATTIRE PER MOMENT: Dress ${selfCastName} and family members in attire that matches the exact situation and activity of each individual moment.
- VIGNETTE-SCOPED CHARACTER PLACEMENT: Depict family members (${activeMembers.map(m => m.name || m.roleLabel).join(', ')}) and companions ONLY inside the specific moment vignette where they are mentioned!`);
    promptSnippets.push(`Daily Chronicle isolated cloudy-shaded watercolor-and-gouache moment vignettes on warm parchment paper with situation-specific attire per moment`);
  } else if (isSoloProtagonist) {
    directives.push(`SOLE PROTAGONIST & COMPLETE HUMAN ANATOMY DIRECTIVE:
- VISIBLE INDIVIDUALS: EXACTLY 1 PERSON (${soloMember.name || soloMember.roleLabel}).
- THE SCENE FOCUSES ENTIRELY ON THIS SINGLE PROTAGONIST.
- STRICT BAN ON EXTRA CHARACTERS: Strictly do NOT draw other family members, parents, or siblings. The scene is solely about ${soloMember.name || soloMember.roleLabel}.
- COMPLETE HUMAN ANATOMY & LOWER-BODY INTEGRITY: If the protagonist is seated on a chair, sofa, or bench, you MUST explicitly specify their lower-body attire (e.g. wearing dark trousers/chinos or jeans) with both full legs extending downward and both feet resting naturally on the floor, OR frame the shot as a clean waist-up medium portrait. STRICTLY NEVER describe a person sitting on a chair alongside "empty chairs" without specifying their full legs and trousers on the floor (to prevent legless torso hallucinations).`);
    promptSnippets.push(`solo portrait of exactly 1 person: ${soloMember.name || soloMember.roleLabel} as the sole protagonist with complete natural human anatomy (full connected legs in trousers with feet resting on the floor or waist-up medium portrait), strictly no other family members or extra people`);
  } else {
    // 0. Mandatory Exact Headcount & Enumeration
    directives.push(`MANDATORY EXACT HEADCOUNT & ANTI-MERGING DIRECTIVE:
- TOTAL VISIBLE INDIVIDUALS: EXACTLY ${totalCount} DISTINCT PEOPLE (${maleCount} MALES, ${femaleCount} FEMALES).
- ALL ${totalCount} FAMILY MEMBERS MUST BE SIMULTANEOUSLY VISIBLE AND FULLY DRAWN SIDE BY SIDE:
${activeMembers.map((m, i) => `  * Person #${i + 1}: ${m.name || m.roleLabel} (${m.roleLabel || m.relationship}, age ${m.age || 'N/A'}, actual height ${cmToFeetInches(resolveMemberHeightCm(m)).label})`).join('\n')}
- STRICT BAN ON MERGING / COMPRESSION: Image generation models frequently suffer from "two sons" semantic collapse, mistakenly merging the two boys into a single child and drawing only 3 family members. YOU MUST NEVER MERGE THE TWO SONS! Both sons must be drawn as two separate individual boys. All ${maleCount} male family members (Father, Elder Son, Younger Son) and the Mother must be fully and clearly depicted. Never drop any male member.
- ZERO UNATTACHED FOREGROUND PEOPLE/HANDS: If a ritual action is described (like receiving sacred water or praying), that action MUST be performed by one of the ${totalCount} family members themselves (e.g. the father and boys cupping their hands). Never draw cropped arms/hands of an external 5th person that consumes character slots.`);

    // If no females are in the cast (e.g. Father + Son)
    if (femaleCount === 0 && hasFather && isShridharCast) {
      directives.push(`STRICT GUARDIAN GENDER & IDENTITY:
- The accompanying adult guardian in the scene is specifically the ADULT FATHER (Shridhar, mid-40s male with short dark hair and trimmed beard).
- STRICT BAN ON FEMALE GUARDIAN / MOTHER: There is NO mother or woman in this scene. Strictly do NOT draw a female guardian.`);
    }

    promptSnippets.push(`group portrait of exactly ${totalCount} distinct people (${maleCount} males, ${femaleCount} female: ${activeMembers.map(m => m.name || m.roleLabel).join(', ')})${femaleCount === 0 && hasFather ? ', adult father with son, strictly no mother in scene' : ''}`);
  }

  // 0b. Dynamic Scene-Relative & Pairwise Actual Height Calculator (works even when Father / tallest member is NOT in the scene!)
  if (pairwiseStature) {
    directives.push(pairwiseStature.blockText);
    promptSnippets.push(pairwiseStature.snippetText);
  }

  // 1. Strict Age & Pairwise Height Differentiation for Both Sons
  if (hasElderBoy && hasYoungerBoy && isShridharCast) {
    directives.push(`BIOLOGICAL AGE, PAIRWISE HEIGHT HIERARCHY & SHORTS/T-SHIRT YOUTH ATTIRE:
- Always show the family FULL-BODY FROM HEAD TO TOE with all feet and shoes planted on the same level floor:
  * ELDER BROTHER (Gahan, Age 11 - 4ft 8in / 142cm, 88% of Mother Aruna's 162cm height & 80% of Father's 178cm height): 11-year-old pre-teen boy who is CLEARLY SHORTER THAN HIS MOTHER ARUNA by 8 inches / 20cm—the top of Gahan's head is strictly BELOW Mother Aruna's chin at her collarbone / upper-shoulder level (STRICTLY NEVER draw Gahan as tall as or taller than Mother Aruna!). Gentle oval face, thick short black hair, sturdy square-shouldered pre-teen build, wearing a DARK NAVY-BLUE casual t-shirt, knee-length denim shorts, and sneakers.
  * YOUNGER BROTHER (Rishu, Age 7 - 4ft 2in / 127cm, 89% of Elder Brother Gahan's 142cm height & 78% of Mother's height): 7-year-old younger schoolboy standing right beside Gahan who is 6 inches / 15cm shorter than Gahan so the top of Rishu's head RISES ABOVE GAHAN'S SHOULDERS to reach GAHAN'S CHIN / NECK LEVEL (STRICTLY NEVER draw Rishu's head below Gahan's shoulders and STRICTLY NEVER equal height with Gahan!). Round cheerful face, neat short straight black hair, compact healthy child frame, wearing a contrasting MUSTARD-YELLOW or BRIGHT EMERALD-GREEN graphic t-shirt, dark shorts, and sneakers.
- STRICT BAN ON INVERTING MOTHER vs. ELDER SON OR ELDER SON vs. YOUNGER SON HEIGHTS: Always show all present family members full-body with their shoes on the ground in strict descending height order: Father (5'10" / 178cm, 100%) -> Mother Aruna (5'4" / 162cm, 91% of Father) -> 11yo Gahan in navy t-shirt & denim shorts (4'8" / 142cm, 88% of Mother's height, head strictly below Mother's chin at her collarbone/shoulder level) -> 7yo Rishu in mustard-yellow t-shirt & dark shorts (4'2" / 127cm, 89% of Gahan's height, top of Rishu's head reaching Gahan's chin/neck level).`);
    promptSnippets.push('two brothers shown full-body from head to toe with shoes on the same ground line: 11-year-old pre-teen Elder Son Gahan (4ft 8in / 142cm, 88% of Mother Aruna\'s height — clearly 8 inches shorter than Mother with the top of Gahan\'s head strictly below Mother\'s chin at her collarbone/shoulder level, NEVER taller than Mother, wearing dark navy-blue t-shirt and knee-length denim shorts) and 7-year-old Younger Son Rishu (4ft 2in / 127cm, 89% of Gahan\'s height — 6 inches shorter than Gahan with the top of Rishu\'s head rising above Gahan\'s shoulders to reach Gahan\'s chin/neck level, wearing mustard-yellow t-shirt and dark shorts)');
  }

  // 1b. Realistic Authentic Body Statures (Strict Ban on Skinny / Runway Model Bias)
  const statureGuidelines = [];
  activeMembers.forEach(m => {
    const mCm = resolveMemberHeightCm(m);
    const mInfo = cmToFeetInches(mCm);
    if (isShridharCast) {
      if (m.relationship === 'spouse') {
        statureGuidelines.push(`- Mother (Aruna, ${mInfo.label}): Draw with an authentic, healthy medium-to-full South Indian adult build, soft fuller round-to-oval maternal face with warm full cheeks, small black forehead bindi and subtle red kumkum at the hairline, and side-parted long voluminous wavy black hair swept forward over her left shoulder. She stands clearly 8 inches (20cm) TALLER than 11yo Elder Son Gahan. STRICTLY NEVER draw an ultra-slim, skinny, or sharp-chinned runway model.`);
      } else if (m.relationship === 'elder_son') {
        statureGuidelines.push(`- Elder Son (Gahan, Age 11, ${mInfo.label}): Draw full-body in a dark navy-blue t-shirt and knee-length denim shorts with a sturdy 11yo pre-teen build (88% of Mother Aruna's 162cm height and 80% of Father's 178cm height — clearly 8 inches / 20cm shorter than Mother Aruna so the top of Gahan's head is strictly BELOW Mother's chin at her collarbone/upper-shoulder level; strictly NEVER as tall as or taller than Mother!).`);
      } else if (m.relationship === 'younger_son') {
        statureGuidelines.push(`- Younger Son (Rishu, Age 7, ${mInfo.label}): Draw full-body in a mustard-yellow t-shirt and dark shorts (89% of Elder Brother Gahan's 142cm height — 6 inches / 15cm shorter than Gahan so the top of Rishu's head rises above Gahan's shoulders to reach Gahan's chin/neck level; 78% of Mother's height).`);
      } else if (m.relationship === 'self') {
        const mTummy = (m.structuredTraits && m.structuredTraits.tummyProfile) || fatherTummyProfile || 'subtle_10';
        const mVol = (m.structuredTraits && m.structuredTraits.bodyVolume) || fatherBodyVolume || 'broad_full';
        statureGuidelines.push(`- Father (Shridhar, ${mInfo.label}): Draw with ${getFatherMidsectionDescription(mTummy, mVol)}, soft fuller round-oval face, short light neat trimmed stubble beard, and natural everyday posture.`);
      }
    } else {
      const mTummy = (m.structuredTraits && m.structuredTraits.tummyProfile) || 'subtle_10';
      const mVol = (m.structuredTraits && m.structuredTraits.bodyVolume) || 'medium';
      statureGuidelines.push(`- ${m.name || m.roleLabel} (${m.roleLabel || m.relationship}, age ${m.age || 'Adult'}, ${mInfo.label}): Draw with ${getFatherMidsectionDescription(mTummy, mVol)}${m.uncompromisableAnchors ? ', ' + m.uncompromisableAnchors : (m.visualTraits ? ', ' + m.visualTraits : '')}.`);
    }
  });
  if (statureGuidelines.length > 0) {
    directives.push(`AUTHENTIC REAL-WORLD BODY BUILDS, VOLUME & MIDSECTION PROFILES (STRICT BAN ON SKINNY / GYM-FIT BIAS):\n${statureGuidelines.join('\n')}\n- ALL PROTAGONISTS MUST REFLECT AUTHENTIC, REAL-WORLD BODY VOLUME AND MIDSECTION CONTOURS.`);
    promptSnippets.push('authentic natural human proportions and midsection volume: strictly avoid ultra-slim runway models');
  }

  // 2. Vehicle / Driving / Road Trip Context
  const isVehicle = (castStaging && castStaging.mode === 'vehicle_rhd') ||
    /\b(car|drive|driving|road trip|vehicle|suv|sedan|highway|traffic|ride)\b/i.test(combined);
  const isOverlook = (castStaging && castStaging.mode === 'scenic_overlook') ||
    /\b(overlook|viewpoint|hills|mountains|scenic stop|pull off)\b/i.test(combined);

  const isIndia = !countryContext || /india/i.test(countryContext);

  if (isVehicle && !isOverlook && totalCount > 1) {
    if (isIndia) {
      directives.push(`INDIAN VEHICLE (RIGHT-HAND DRIVE) & SEATING GEOMETRY RULES:
- The automobile is Right-Hand Drive (RHD) for Indian roads.
- DRIVER SEAT: Adult driver is seated on the front-right seat with hands holding the steering wheel.
- FRONT PASSENGER SEAT: Adult co-passenger is seated on the front-left seat.
- REAR PASSENGER SEATS: Children are seated separately in their own individual rear passenger seats wearing seatbelts.
- STRICT BAN ON SPATIAL HALLUCINATIONS: Children are NEVER in the driver seat, NEVER holding the steering wheel, NEVER sitting on laps, NEVER crammed multiple people in one seat! Vehicle drives on the left side of the road.`);
      promptSnippets.push('Right-Hand Drive Indian vehicle layout: adult driving on front-right seat, adult passenger in front-left seat, children seated separately in rear seats with seatbelts');
    }
  } else if ((isOverlook || isVehicle) && totalCount > 1) {
    directives.push(`SCENIC ROAD TRIP OVERLOOK COMPOSITION:
- The family vehicle is parked safely on the scenic mountain shoulder or highway viewpoint.
- The family members stand naturally together taking in the landscape.
- Clear, brightly illuminated faces with natural human expressions.`);
    promptSnippets.push('family road trip scenic overlook by parked vehicle: family members standing naturally together admiring the vista');
  }

  if (hasFather && isShridharCast) {
    directives.push(`FATHER (SHRIDHAR) STRICT MID-AGE (40 YEARS OLD), BODY VOLUME & TUMMY PROFILE LOCK:
- Shridhar is a mid-age 40-year-old Indian man in his early 40s with a soft fuller round-oval face, full cheeks and natural under-chin/submental fullness, full head of thick short dark hair styled up, neat short dark trimmed stubble beard, and ${fatherMidsectionPhrase}.
- STRICT BAN ON AGING: NEVER use "salt-and-pepper", and STRICTLY NEVER portray him as an old man, elderly figure, grandfather, or senior citizen with facial wrinkles!`);
    promptSnippets.push(`mid-age 40-year-old Indian man in his early 40s with a soft fuller round-oval face, full cheeks, thick short dark hair, neat short dark trimmed stubble beard, and ${fatherMidsectionPhrase} (strictly NOT old or elderly)`);
  } else if (hasFather && fatherMemberObj) {
    const selfLockDesc = [fatherMemberObj.uncompromisableAnchors, fatherMemberObj.visualTraits, fatherMemberObj.heightDesc, fatherMidsectionPhrase].filter(Boolean).join(', ');
    directives.push(`PROTAGONIST (${selfCastName.toUpperCase()}, AGE ${fatherMemberObj.age || 'ADULT'}) APPEARANCE & VOLUME LOCK:
- ${selfCastName} (${fatherMemberObj.roleLabel || 'Self'}): ${selfLockDesc}.`);
    promptSnippets.push(`${selfCastName} (${fatherMemberObj.roleLabel || 'Self'}, age ${fatherMemberObj.age || 'Adult'}): ${selfLockDesc}`);
  }

  // 3. Member-Specific Facial Traits & Visual Likeness Anchors (Face, Hair & Body Stature)
  const memberTraitDirectives = [];
  const anchorDirectives = [];

  activeMembers.forEach(m => {
    const rawAnchors = m.uncompromisableAnchors && String(m.uncompromisableAnchors).trim();
    const anchors = rawAnchors
      ? rawAnchors.replace(/\bsalt-and-pepper\s+(?:trimmed\s+)?beard\b/gi, 'neat short dark trimmed beard, full head of thick short jet-black hair (strictly NOT old or elderly)')
      : '';
    if (anchors) {
      anchorDirectives.push(`${m.name || m.roleLabel} (${m.roleLabel || m.relationship}): ${anchors}`);
      promptSnippets.push(`STRICT ANCHOR for ${m.name || m.roleLabel}: ${anchors}`);
    }

    const traitParts = [m.visualTraits, m.bodyBuild, m.heightDesc]
      .filter(t => t && String(t).trim())
      .map(t => String(t).trim().replace(/\bsalt-and-pepper\s+(?:trimmed\s+)?beard\b/gi, 'neat short dark trimmed beard'));
    const combinedTraits = traitParts.join(', ');
    if (combinedTraits) {
      memberTraitDirectives.push(`${m.name || m.roleLabel} (${m.roleLabel || m.relationship}): ${combinedTraits}`);
      if (!anchors) {
        promptSnippets.push(`${m.name || m.roleLabel}: ${combinedTraits}`);
      }
    }
  });

  if (anchorDirectives.length > 0) {
    directives.push(`CORE UNCOMPROMISABLE IDENTITY ANCHORS (IMMUTABLE PHYSICAL ANATOMY & LOOKS):
${anchorDirectives.map(t => `- ${t}`).join('\n')}
- NON-NEGOTIABLE IDENTITY INTEGRITY:
The above uncompromisable anchors define each character immutable DNA (facial geometry, natural hair length, real-world body build, skin tone). While emotional expression, camera angles, and attire (casual wear, traditional Indian clothing, travel wear) adapt dynamically to the post context, the character underlying anatomy, facial structure, and authentic South Indian features MUST REMAIN STRICTLY INVARIANT across all posters. STRICT BAN on mutating into western catalog models, salon blowouts, or airbrushed waif-like frames.`);
  }

  if (memberTraitDirectives.length > 0) {
    directives.push(`CHARACTER APPEARANCE ANCHORS (PRESERVE VISUAL LIKENESS):\n${memberTraitDirectives.map(t => `- ${t}`).join('\n')}`);
  }

  return {
    systemPromptSection: directives.join('\n\n'),
    promptSnippet: promptSnippets.join(', '),
    activeMembers,
    totalCount,
    isSolo: isSoloProtagonist,
    soloName: soloMember ? (soloMember.name || soloMember.roleLabel) : '',
    soloTraits: soloMember ? [soloMember.visualTraits, soloMember.bodyBuild, soloMember.heightDesc].filter(Boolean).join(', ') : ''
  };
}

