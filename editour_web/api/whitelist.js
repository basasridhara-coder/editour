// Serverless Function: /api/whitelist
// Manages the Private Preview Whitelist for Slant (Invite-Only Access)
// Backed by the system_beta_whitelist record in Supabase

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

function computeUserCreditSummary(whitelist, rawEmail) {
  const email = String(rawEmail || '').trim().toLowerCase();
  const todayKey = getTodayDateKeyIST();
  const defaultLimit = Number(whitelist?.default_daily_limit) > 0 ? Number(whitelist.default_daily_limit) : DEFAULT_DAILY_CREDIT_LIMIT;
  const rawEntry = (whitelist?.user_credits && whitelist.user_credits[email]) ? whitelist.user_credits[email] : {};
  const isMaster = MASTER_ADMINS.includes(email);

  const starterTotal = STARTER_PERSPECTIVE_CREDITS;
  const starterUsed = Math.min(starterTotal, Math.max(0, Number(rawEntry.starterUsed ?? 0)));
  const starterRemaining = Math.max(0, starterTotal - starterUsed);

  const dailyLimit = Number(rawEntry.dailyLimit) > 0 ? Number(rawEntry.dailyLimit) : defaultLimit;
  const isSameDay = rawEntry.lastDateKey === todayKey;
  const perspectiveUsedToday = isSameDay ? (Number(rawEntry.perspectiveUsedToday ?? rawEntry.usedToday) || 0) : 0;
  const chronicleUsedToday = isSameDay ? (Number(rawEntry.chronicleUsedToday) || 0) : 0;
  const usedToday = perspectiveUsedToday + chronicleUsedToday;

  const bonusCredits = Math.max(0, Number(rawEntry.bonusCredits) || 0);
  const totalUsed = Math.max(0, Number(rawEntry.totalUsed) || 0);

  // Perspective credits: First 5 are free (starterRemaining), once done default 1/day + bonusCredits
  const perspectiveDailyRemaining = Math.max(0, dailyLimit - perspectiveUsedToday);
  const perspectiveBaseRemaining = starterRemaining > 0 ? starterRemaining : perspectiveDailyRemaining;
  const perspectiveRemainingToday = isMaster ? 9999 : (perspectiveBaseRemaining + bonusCredits);

  // Daily Chronicle visual credits: 1 per day always free + bonusCredits
  const chronicleFreeRemainingToday = Math.max(0, DAILY_CHRONICLE_FREE_LIMIT - chronicleUsedToday);
  const chronicleRemainingToday = isMaster ? 9999 : (chronicleFreeRemainingToday + bonusCredits);

  return {
    email,
    isUnlimited: isMaster,
    starterTotal,
    starterUsed,
    starterRemaining,
    dailyLimit,
    perspectiveUsedToday,
    perspectiveDailyRemaining,
    perspectiveRemainingToday,
    chronicleDailyLimit: DAILY_CHRONICLE_FREE_LIMIT,
    chronicleUsedToday,
    chronicleFreeRemainingToday,
    chronicleRemainingToday,
    usedToday,
    dailyRemaining: perspectiveBaseRemaining,
    bonusCredits,
    remainingToday: perspectiveRemainingToday,
    totalUsed,
    lastDateKey: todayKey,
    lastUsedAt: rawEntry.lastUsedAt || null
  };
}

async function getWhitelistData() {
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.system_beta_whitelist&select=data`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    if (resp.ok) {
      const rows = await resp.json();
      if (Array.isArray(rows) && rows.length > 0 && rows[0].data) {
        const d = rows[0].data;
        return {
          admin_emails: MASTER_ADMINS,
          allowed_emails: Array.isArray(d.allowed_emails) ? d.allowed_emails : MASTER_ADMINS,
          pending_requests: Array.isArray(d.pending_requests) ? d.pending_requests : [],
          access_logs: Array.isArray(d.access_logs) ? d.access_logs : [],
          user_credits: (d.user_credits && typeof d.user_credits === 'object') ? d.user_credits : {},
          default_daily_limit: Number(d.default_daily_limit) > 0 ? Number(d.default_daily_limit) : DEFAULT_DAILY_CREDIT_LIMIT
        };
      }
    }
  } catch (err) {
    console.error('Error fetching whitelist:', err);
  }

  return {
    admin_emails: MASTER_ADMINS,
    allowed_emails: MASTER_ADMINS,
    pending_requests: [],
    access_logs: [],
    user_credits: {},
    default_daily_limit: DEFAULT_DAILY_CREDIT_LIMIT
  };
}

async function saveWhitelistData(data) {
  try {
    const payload = {
      id: 'system_beta_whitelist',
      data: data
    };
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/posts`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(payload)
    });
    return resp.ok;
  } catch (err) {
    console.error('Error saving whitelist:', err);
    return false;
  }
}

async function getFeedbackAndTelemetryData() {
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.system_feedback_telemetry&select=data`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    if (resp.ok) {
      const rows = await resp.json();
      if (Array.isArray(rows) && rows.length > 0 && rows[0].data) {
        const d = rows[0].data;
        return {
          feedback_items: Array.isArray(d.feedback_items) ? d.feedback_items : [],
          telemetry_events: Array.isArray(d.telemetry_events) ? d.telemetry_events : [],
          daily_metrics: (d.daily_metrics && typeof d.daily_metrics === 'object') ? d.daily_metrics : {},
          alert_webhook_url: String(d.alert_webhook_url || '').trim(),
          last_webhook_sent_by_type: (d.last_webhook_sent_by_type && typeof d.last_webhook_sent_by_type === 'object') ? d.last_webhook_sent_by_type : {}
        };
      }
    }
  } catch (err) {
    console.warn('Error fetching feedback/telemetry:', err.message);
  }
  return {
    feedback_items: [],
    telemetry_events: [],
    daily_metrics: {},
    alert_webhook_url: '',
    last_webhook_sent_by_type: {}
  };
}

async function saveFeedbackAndTelemetryData(data) {
  try {
    const payload = {
      id: 'system_feedback_telemetry',
      data: data
    };
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/posts`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(payload)
    });
    return resp.ok;
  } catch (err) {
    console.warn('Error saving feedback/telemetry:', err.message);
    return false;
  }
}

async function sendFounderWebhookAlert(webhookUrl, title, summaryLines = []) {
  const cleanUrl = String(webhookUrl || '').trim();
  if (!cleanUrl || !cleanUrl.startsWith('http')) return false;
  try {
    const textBody = `🚨 *${title}*\n${summaryLines.join('\n')}`;
    // Compatible with Slack (`text`), Discord (`content`), and generic webhook receivers
    const payload = {
      text: textBody,
      content: textBody,
      title,
      details: summaryLines,
      source: 'slant.today',
      timestamp: new Date().toISOString()
    };
    const resp = await fetch(cleanUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return resp.ok;
  } catch (err) {
    console.warn('Webhook alert dispatch failed:', err.message);
    return false;
  }
}

function buildSystemHealthSummary(ftData, supabaseLatencyMs = 0, totalDbPostsCount = 0) {
  const nowMs = Date.now();
  const dayAgoMs = nowMs - 24 * 60 * 60 * 1000;
  const events = Array.isArray(ftData?.telemetry_events) ? ftData.telemetry_events : [];
  const feedback = Array.isArray(ftData?.feedback_items) ? ftData.feedback_items : [];

  const recent24h = events.filter(e => {
    const t = Date.parse(e?.createdAt || '');
    if (!Number.isFinite(t) || t < dayAgoMs) return false;
    // Ignore client-side network abort / page unload / tab-sleep artifacts (statusCode 0 or >65s wall-clock sleep)
    if (Number(e.statusCode) === 0 && /failed to fetch|networkerror|load failed/i.test(String(e.message || ''))) return false;
    if (e.type === 'slow_response' && Number(e.durationMs) > 65000) return false;
    return true;
  });

  const quota429Count24h = recent24h.filter(e => e.type === 'gemini_quota_429' || Number(e.statusCode) === 429).length;
  const timeout504Count24h = recent24h.filter(e => e.type === 'vercel_timeout' || Number(e.statusCode) === 504 || Number(e.statusCode) === 502).length;
  const supabaseErrorCount24h = recent24h.filter(e => e.type === 'supabase_error' && Number(e.statusCode) >= 500).length;
  const slowRequestCount24h = recent24h.filter(e => e.type === 'slow_response').length;
  const unreadFeedbackCount = feedback.filter(f => f.status !== 'resolved').length;

  let status = 'healthy';
  let statusLabel = '🟢 All Systems Nominal';
  const recommendations = [];

  if (quota429Count24h >= 3 || timeout504Count24h >= 2 || supabaseErrorCount24h >= 2) {
    status = 'critical';
    statusLabel = '🔴 Action Needed — Quota / Timeout Spikes Detected';
  } else if (quota429Count24h > 0 || timeout504Count24h > 0 || supabaseErrorCount24h > 0 || slowRequestCount24h >= 3 || supabaseLatencyMs > 1400 || totalDbPostsCount > 450) {
    status = 'warning';
    statusLabel = '🟡 Watch Closely — Approaching Tier Thresholds';
  }

  if (quota429Count24h > 0) {
    recommendations.push(`Gemini API / Vercel hit ${quota429Count24h} rate-limit (429) error(s) in the last 24h. Consider raising your Google AI Studio RPM tier if active creators grow.`);
  }
  if (timeout504Count24h > 0) {
    recommendations.push(`Vercel Serverless Functions hit ${timeout504Count24h} timeout(s) (504/502) in 24h. Upgrading Vercel Hobby → Pro increases function concurrency & maxDuration.`);
  }
  if (supabaseErrorCount24h > 0 || supabaseLatencyMs > 1400) {
    recommendations.push(`Supabase DB latency is ${supabaseLatencyMs}ms (${supabaseErrorCount24h} DB errors in 24h). Check Supabase Disk IO / Free Tier bandwidth if latency stays >1200ms.`);
  }
  if (totalDbPostsCount > 420) {
    recommendations.push(`Supabase has ${totalDbPostsCount}+ post rows loaded per admin query. Consider archiving old base64 images or upgrading Supabase when passing 500 MB DB size.`);
  }
  if (recommendations.length === 0) {
    recommendations.push('Vercel functions, Supabase database latency, and Gemini API quotas are running smoothly within current tier limits.');
  }

  return {
    status,
    statusLabel,
    supabaseLatencyMs,
    totalDbPostsCount,
    unreadFeedbackCount,
    errors24hCount: recent24h.length,
    quota429Count24h,
    timeout504Count24h,
    supabaseErrorCount24h,
    slowRequestCount24h,
    recommendations
  };
}

module.exports = async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status ? res.status(200).end() : res.end();
  }

  // 1. GET: Check email status or fetch admin data
  if (req.method === 'GET') {
    let email = '';
    let adminCheck = '';
    if (req.query && typeof req.query === 'object') {
      email = (req.query.email || '').trim().toLowerCase();
      adminCheck = (req.query.admin || '').trim().toLowerCase();
    }
    if (!email && req.url) {
      try {
        const parsedUrl = new URL(req.url, 'http://localhost');
        email = (parsedUrl.searchParams.get('email') || '').trim().toLowerCase();
        if (!adminCheck) adminCheck = (parsedUrl.searchParams.get('admin') || '').trim().toLowerCase();
      } catch (_) {}
    }

    const whitelist = await getWhitelistData();
    const isMasterAdmin = MASTER_ADMINS.includes(email) || MASTER_ADMINS.includes(adminCheck);
    const isAdmin = isMasterAdmin || (whitelist.admin_emails && (whitelist.admin_emails.includes(email) || whitelist.admin_emails.includes(adminCheck)));
    const isAllowed = isAdmin || (whitelist.allowed_emails && whitelist.allowed_emails.map(e => e.toLowerCase()).includes(email));

    // If admin is requesting, return full roster and pending requests + live post usage statistics
    if (isAdmin) {
      let userStats = {};
      let supabaseLatencyMs = 0;
      let totalDbPostsCount = 0;
      try {
        const t0 = Date.now();
        const statsResp = await fetch(
          `${SUPABASE_URL}/rest/v1/posts?select=id,created_at,data->userEmail,data->creatorHandle,data->adaptedHeadline&id=like.slant*&order=created_at.desc&limit=500`,
          {
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`
            }
          }
        );
        supabaseLatencyMs = Math.max(1, Date.now() - t0);
        if (statsResp.ok) {
          const postRows = await statsResp.json();
          if (Array.isArray(postRows)) {
            totalDbPostsCount = postRows.length;
            postRows.forEach(p => {
              const uEmail = String(p.userEmail || '').toLowerCase().trim();
              if (!uEmail) return;
              if (!userStats[uEmail]) {
                userStats[uEmail] = {
                  postCount: 0,
                  latestPostAt: p.created_at,
                  latestHeadline: p.adaptedHeadline || '',
                  handle: p.creatorHandle || ''
                };
              }
              userStats[uEmail].postCount++;
            });
          }
        }
      } catch (err) {
        console.warn('Error aggregating user stats:', err.message);
      }

      const ftData = await getFeedbackAndTelemetryData();
      const systemHealthSummary = buildSystemHealthSummary(ftData, supabaseLatencyMs, totalDbPostsCount);

      const userCreditsMap = {};
      const allTrackedEmails = new Set([
        ...(whitelist.allowed_emails || []).map(e => String(e).toLowerCase().trim()),
        ...(whitelist.access_logs || []).map(l => String(l.email || '').toLowerCase().trim()),
        ...Object.keys(userStats || {}),
        ...Object.keys(whitelist.user_credits || {})
      ]);
      allTrackedEmails.forEach(em => {
        if (em) userCreditsMap[em] = computeUserCreditSummary(whitelist, em);
      });

      const explicitAllowedEmails = (whitelist.allowed_emails || [])
        .map(e => String(e).toLowerCase().trim())
        .filter(Boolean);
      const requesterEmail = email || adminCheck;
      const responsePayload = {
        allowed: true,
        isAdmin: true,
        adminEmails: whitelist.admin_emails,
        allowedEmails: explicitAllowedEmails,
        pendingRequests: whitelist.pending_requests,
        accessLogs: whitelist.access_logs,
        userStats: userStats,
        userCreditsMap,
        defaultDailyLimit: whitelist.default_daily_limit || DEFAULT_DAILY_CREDIT_LIMIT,
        credits: requesterEmail ? computeUserCreditSummary(whitelist, requesterEmail) : null,
        userFeedback: ftData.feedback_items.slice(0, 100),
        systemTelemetry: ftData.telemetry_events.slice(0, 100),
        dailyMetrics: ftData.daily_metrics || {},
        alertWebhookUrl: ftData.alert_webhook_url || '',
        systemHealthSummary
      };
      if (res.status) return res.status(200).json ? res.status(200).json(responsePayload) : res.status(200).end(JSON.stringify(responsePayload));
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(responsePayload));
    }

    // Enforce Private Preview Whitelist: Only Master Admins, Admin Emails, and Whitelisted Emails are allowed
    const responsePayload = {
      allowed: Boolean(isAllowed),
      isAdmin: Boolean(isAdmin),
      credits: (isAllowed && email) ? computeUserCreditSummary(whitelist, email) : null
    };
    if (res.status) return res.status(200).json ? res.status(200).json(responsePayload) : res.status(200).end(JSON.stringify(responsePayload));
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(responsePayload));
  }

  // 2. POST: Actions (request_access, log_access, add_email, remove_email, approve_request, deny_request)
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (_) { body = {}; }
    }
    if (!body && typeof req.on === 'function') {
      body = await new Promise((resolve) => {
        let raw = '';
        req.on('data', chunk => raw += chunk);
        req.on('end', () => {
          try { resolve(JSON.parse(raw)); } catch (_) { resolve({}); }
        });
      });
    }

    const { action = '', email = '', targetEmail = '', adminEmail = '', name = '', avatar = '' } = body || {};
    const cleanEmail = String(email || targetEmail || '').trim().toLowerCase();
    const cleanAdmin = String(adminEmail || '').trim().toLowerCase();

    const whitelist = await getWhitelistData();
    const isMasterAdmin = MASTER_ADMINS.includes(cleanAdmin);
    const isAdmin = isMasterAdmin || (whitelist.admin_emails && whitelist.admin_emails.includes(cleanAdmin));

    // ACTION: User requests access or more visual credits
    if (action === 'request_access' || action === 'request_credits') {
      if (!cleanEmail) {
        const err = { error: 'Missing email' };
        if (res.status) return res.status(400).json ? res.status(400).json(err) : res.status(400).end(JSON.stringify(err));
        return res.end(JSON.stringify(err));
      }

      const reason = String(body.reason || body.note || '').trim().slice(0, 240);
      const isAlreadyWhitelisted = whitelist.allowed_emails.map(e => e.toLowerCase()).includes(cleanEmail);
      const existingIdx = whitelist.pending_requests.findIndex(p => p.email?.toLowerCase() === cleanEmail);
      const reqEntry = {
        email: cleanEmail,
        name: name || cleanEmail.split('@')[0],
        avatar: avatar || null,
        reason: reason || (action === 'request_access' && !isAlreadyWhitelisted
          ? 'Requested Private Preview curator access'
          : 'Requested additional Perspective visual credits'),
        type: (action === 'request_access' && !isAlreadyWhitelisted) ? 'access_request' : 'credit_request',
        requestedAt: new Date().toISOString()
      };
      if (existingIdx >= 0) {
        whitelist.pending_requests[existingIdx] = reqEntry;
      } else {
        whitelist.pending_requests.unshift(reqEntry);
      }
      await saveWhitelistData(whitelist);

      const out = {
        success: true,
        message: reqEntry.type === 'access_request'
          ? 'Access request queued for curator approval'
          : 'Credit request sent to admin for review'
      };
      if (res.status) return res.status(200).json ? res.status(200).json(out) : res.status(200).end(JSON.stringify(out));
      return res.end(JSON.stringify(out));
    }

    // ACTION: Log successful user access (only for whitelisted curators)
    if (action === 'log_access') {
      const isAllowedEmail = MASTER_ADMINS.includes(cleanEmail)
        || (whitelist.admin_emails && whitelist.admin_emails.map(e => e.toLowerCase()).includes(cleanEmail))
        || (whitelist.allowed_emails && whitelist.allowed_emails.map(e => e.toLowerCase()).includes(cleanEmail));
      if (cleanEmail && isAllowedEmail) {
        const logIdx = whitelist.access_logs.findIndex(l => l.email?.toLowerCase() === cleanEmail);
        const logEntry = {
          email: cleanEmail,
          name: name || cleanEmail.split('@')[0],
          avatar: avatar || null,
          lastLogin: new Date().toISOString()
        };
        if (logIdx >= 0) {
          whitelist.access_logs[logIdx] = logEntry;
        } else {
          whitelist.access_logs.unshift(logEntry);
        }
        await saveWhitelistData(whitelist);
      }
      const out = { success: true, allowed: isAllowedEmail, credits: (cleanEmail && isAllowedEmail) ? computeUserCreditSummary(whitelist, cleanEmail) : null };
      if (res.status) return res.status(200).json ? res.status(200).json(out) : res.status(200).end(JSON.stringify(out));
      return res.end(JSON.stringify(out));
    }

    // ACTION: User submits feedback, bug report, feature idea, or post-publish micro-pulse
    if (action === 'submit_feedback') {
      const ftData = await getFeedbackAndTelemetryData();
      const category = String(body.category || 'general').trim().slice(0, 40);
      const rating = String(body.rating || '').trim().slice(0, 40);
      const message = String(body.message || '').trim().slice(0, 1200);
      const handle = String(body.handle || name || cleanEmail.split('@')[0] || 'guest').trim().slice(0, 60);
      const contextObj = (body.context && typeof body.context === 'object') ? {
        screen: String(body.context.screen || '').slice(0, 80),
        postTitle: String(body.context.postTitle || '').slice(0, 140),
        sparkType: String(body.context.sparkType || '').slice(0, 40),
        viewport: String(body.context.viewport || '').slice(0, 40),
        userAgent: String(body.context.userAgent || '').slice(0, 160),
        lastError: String(body.context.lastError || '').slice(0, 240)
      } : {};

      const item = {
        id: 'fb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        email: cleanEmail || 'guest@slant.today',
        handle,
        category,
        rating,
        message,
        context: contextObj,
        status: 'new',
        createdAt: new Date().toISOString()
      };

      ftData.feedback_items.unshift(item);
      if (ftData.feedback_items.length > 150) {
        ftData.feedback_items = ftData.feedback_items.slice(0, 150);
      }
      await saveFeedbackAndTelemetryData(ftData);

      if (ftData.alert_webhook_url && (message.length > 0 || rating === 'needed_tweaks' || rating === 'missed_point' || category === 'bug_report')) {
        await sendFounderWebhookAlert(
          ftData.alert_webhook_url,
          `New Slant User Feedback (${category.toUpperCase()})`,
          [
            `• From: ${handle} (${item.email})`,
            rating ? `• Pulse Rating: ${rating}` : null,
            message ? `• Message: "${message}"` : null,
            contextObj.postTitle ? `• Post: ${contextObj.postTitle}` : null
          ].filter(Boolean)
        );
      }

      const out = { success: true, item };
      if (res.status) return res.status(200).json ? res.status(200).json(out) : res.status(200).end(JSON.stringify(out));
      return res.end(JSON.stringify(out));
    }

    // ACTION: Client or API logs a telemetry event (429 rate limit, 504 timeout, Supabase error, or slow >25s call)
    if (action === 'log_telemetry') {
      const eventType = String(body.type || 'api_error').trim().slice(0, 50);
      const statusCode = Number(body.statusCode) || 0;
      const durationMs = Math.max(0, Math.round(Number(body.durationMs) || 0));
      const endpoint = String(body.endpoint || '/api/synthesize').trim().slice(0, 80);
      const errMessage = String(body.message || '').trim().slice(0, 320);

      // Ignore client-side network abort / page unload / tab-sleep artifacts
      if ((statusCode === 0 && /failed to fetch|networkerror|load failed/i.test(errMessage)) || (eventType === 'slow_response' && durationMs > 65000)) {
        const out = { success: true, ignoredClientArtifact: true };
        if (res.status) return res.status(200).json ? res.status(200).json(out) : res.status(200).end(JSON.stringify(out));
        return res.end(JSON.stringify(out));
      }

      const ftData = await getFeedbackAndTelemetryData();
      const todayKey = getTodayDateKeyIST();
      const severity = (statusCode === 429 || statusCode === 504 || statusCode === 502 || eventType === 'gemini_quota_429' || eventType === 'vercel_timeout' || (eventType === 'supabase_error' && statusCode >= 500))
        ? 'critical'
        : 'warning';

      const telEntry = {
        id: 'tel_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        type: eventType,
        severity,
        endpoint,
        statusCode,
        durationMs,
        message: errMessage,
        userEmail: cleanEmail || 'anonymous',
        createdAt: new Date().toISOString()
      };

      ftData.telemetry_events.unshift(telEntry);
      if (ftData.telemetry_events.length > 150) {
        ftData.telemetry_events = ftData.telemetry_events.slice(0, 150);
      }

      if (!ftData.daily_metrics || typeof ftData.daily_metrics !== 'object') {
        ftData.daily_metrics = {};
      }
      const dayBucket = ftData.daily_metrics[todayKey] || {
        errorsCount: 0,
        quota429Count: 0,
        timeouts504Count: 0,
        supabaseErrorsCount: 0,
        slowCount: 0
      };
      dayBucket.errorsCount = (dayBucket.errorsCount || 0) + 1;
      if (statusCode === 429 || eventType === 'gemini_quota_429') dayBucket.quota429Count = (dayBucket.quota429Count || 0) + 1;
      if (statusCode === 504 || statusCode === 502 || eventType === 'vercel_timeout') dayBucket.timeouts504Count = (dayBucket.timeouts504Count || 0) + 1;
      if (eventType === 'supabase_error') dayBucket.supabaseErrorsCount = (dayBucket.supabaseErrorsCount || 0) + 1;
      if (eventType === 'slow_response') dayBucket.slowCount = (dayBucket.slowCount || 0) + 1;
      ftData.daily_metrics[todayKey] = dayBucket;

      // Dispatch instant webhook alert on critical errors with a 10-min cooldown per eventType
      if (severity === 'critical' && ftData.alert_webhook_url) {
        const lastSentMs = Number(ftData.last_webhook_sent_by_type?.[eventType]) || 0;
        if (Date.now() - lastSentMs > 10 * 60 * 1000) {
          ftData.last_webhook_sent_by_type = ftData.last_webhook_sent_by_type || {};
          ftData.last_webhook_sent_by_type[eventType] = Date.now();
          await sendFounderWebhookAlert(
            ftData.alert_webhook_url,
            `Slant Infrastructure Alert: ${eventType.toUpperCase()} (HTTP ${statusCode || 'ERR'})`,
            [
              `• Endpoint: ${endpoint} (${durationMs}ms)`,
              `• User: ${telEntry.userEmail}`,
              `• Detail: ${errMessage || 'Quota or timeout threshold reached'}`,
              `• Today's Totals: 429s=${dayBucket.quota429Count || 0}, 504s=${dayBucket.timeouts504Count || 0}, DB=${dayBucket.supabaseErrorsCount || 0}`
            ]
          );
        }
      }

      await saveFeedbackAndTelemetryData(ftData);
      const out = { success: true };
      if (res.status) return res.status(200).json ? res.status(200).json(out) : res.status(200).end(JSON.stringify(out));
      return res.end(JSON.stringify(out));
    }

    // --- ADMIN ACTIONS (Strictly Requires Admin Authorization) ---
    if (!isAdmin) {
      const err = { error: 'Unauthorized. Admin credentials required.' };
      if (res.status) return res.status(403).json ? res.status(403).json(err) : res.status(403).end(JSON.stringify(err));
      return res.end(JSON.stringify(err));
    }

    // ACTION: Admin resolves or deletes a feedback item
    if (action === 'resolve_feedback' || action === 'delete_feedback') {
      const fbId = String(body.feedbackId || '').trim();
      const ftData = await getFeedbackAndTelemetryData();
      if (action === 'delete_feedback') {
        ftData.feedback_items = ftData.feedback_items.filter(f => f.id !== fbId);
      } else {
        ftData.feedback_items = ftData.feedback_items.map(f => f.id === fbId ? { ...f, status: 'resolved' } : f);
      }
      await saveFeedbackAndTelemetryData(ftData);
      const out = { success: true, userFeedback: ftData.feedback_items.slice(0, 100) };
      if (res.status) return res.status(200).json ? res.status(200).json(out) : res.status(200).end(JSON.stringify(out));
      return res.end(JSON.stringify(out));
    }

    // ACTION: Admin clears telemetry log
    if (action === 'clear_telemetry') {
      const ftData = await getFeedbackAndTelemetryData();
      ftData.telemetry_events = [];
      await saveFeedbackAndTelemetryData(ftData);
      const out = { success: true, systemTelemetry: [] };
      if (res.status) return res.status(200).json ? res.status(200).json(out) : res.status(200).end(JSON.stringify(out));
      return res.end(JSON.stringify(out));
    }

    // ACTION: Admin saves or tests the instant alert webhook URL
    if (action === 'save_alert_webhook') {
      const webhookUrl = String(body.webhookUrl || '').trim();
      const testPing = Boolean(body.testPing);
      const ftData = await getFeedbackAndTelemetryData();
      ftData.alert_webhook_url = webhookUrl;
      await saveFeedbackAndTelemetryData(ftData);
      let pingOk = false;
      if (testPing && webhookUrl) {
        pingOk = await sendFounderWebhookAlert(
          webhookUrl,
          'Slant Founder Alert Webhook Connected ✓',
          [
            '• Your Vercel, Supabase & Gemini quota monitor is active.',
            '• You will receive instant alerts here on 429 rate limits, 504 timeouts, DB errors, or user bug reports.'
          ]
        );
      }
      const out = { success: true, alertWebhookUrl: webhookUrl, pingOk };
      if (res.status) return res.status(200).json ? res.status(200).json(out) : res.status(200).end(JSON.stringify(out));
      return res.end(JSON.stringify(out));
    }

    // ACTION: Add an email directly to the allowed whitelist
    if (action === 'add_email') {
      if (!cleanEmail || !cleanEmail.includes('@')) {
        const err = { error: 'Invalid email address' };
        if (res.status) return res.status(400).json ? res.status(400).json(err) : res.status(400).end(JSON.stringify(err));
        return res.end(JSON.stringify(err));
      }

      if (!whitelist.allowed_emails.map(e => e.toLowerCase()).includes(cleanEmail)) {
        whitelist.allowed_emails.push(cleanEmail);
      }
      // Remove from pending if it was pending
      whitelist.pending_requests = whitelist.pending_requests.filter(p => p.email?.toLowerCase() !== cleanEmail);
      await saveWhitelistData(whitelist);

      const out = {
        success: true,
        allowedEmails: whitelist.allowed_emails,
        pendingRequests: whitelist.pending_requests
      };
      if (res.status) return res.status(200).json ? res.status(200).json(out) : res.status(200).end(JSON.stringify(out));
      return res.end(JSON.stringify(out));
    }

    // ACTION: Remove an email from whitelist
    if (action === 'remove_email') {
      if (MASTER_ADMINS.includes(cleanEmail)) {
        const err = { error: 'Cannot remove Master Admin account.' };
        if (res.status) return res.status(400).json ? res.status(400).json(err) : res.status(400).end(JSON.stringify(err));
        return res.end(JSON.stringify(err));
      }

      whitelist.allowed_emails = whitelist.allowed_emails.filter(e => e.toLowerCase() !== cleanEmail);
      await saveWhitelistData(whitelist);

      const out = {
        success: true,
        allowedEmails: whitelist.allowed_emails
      };
      if (res.status) return res.status(200).json ? res.status(200).json(out) : res.status(200).end(JSON.stringify(out));
      return res.end(JSON.stringify(out));
    }

    // ACTION: Approve pending access or credit request
    if (action === 'approve_request') {
      if (!cleanEmail) {
        const err = { error: 'Missing email' };
        if (res.status) return res.status(400).json ? res.status(400).json(err) : res.status(400).end(JSON.stringify(err));
        return res.end(JSON.stringify(err));
      }

      const pendingItem = (whitelist.pending_requests || []).find(p => p.email?.toLowerCase() === cleanEmail);
      const wasAlreadyWhitelisted = whitelist.allowed_emails.map(e => e.toLowerCase()).includes(cleanEmail);
      const isAccessOnlyApproval = (pendingItem && pendingItem.type === 'access_request') || !wasAlreadyWhitelisted || Number(body.amount) === 0;

      if (!wasAlreadyWhitelisted) {
        whitelist.allowed_emails.push(cleanEmail);
      }
      const grantAmount = isAccessOnlyApproval ? 0 : Math.max(1, Math.min(100, Number(body.amount) || 5));
      if (!whitelist.user_credits || typeof whitelist.user_credits !== 'object') {
        whitelist.user_credits = {};
      }
      const todayKey = getTodayDateKeyIST();
      const existing = whitelist.user_credits[cleanEmail] || {};
      const currentBonus = Math.max(0, Number(existing.bonusCredits) || 0);
      whitelist.user_credits[cleanEmail] = {
        ...existing,
        dailyLimit: Number(existing.dailyLimit) > 0 ? Number(existing.dailyLimit) : (whitelist.default_daily_limit || DEFAULT_DAILY_CREDIT_LIMIT),
        lastDateKey: existing.lastDateKey || todayKey,
        bonusCredits: currentBonus + grantAmount,
        updatedAt: new Date().toISOString()
      };
      whitelist.pending_requests = whitelist.pending_requests.filter(p => p.email?.toLowerCase() !== cleanEmail);
      await saveWhitelistData(whitelist);

      const out = {
        success: true,
        granted: grantAmount,
        allowedEmails: whitelist.allowed_emails,
        pendingRequests: whitelist.pending_requests,
        credits: computeUserCreditSummary(whitelist, cleanEmail)
      };
      if (res.status) return res.status(200).json ? res.status(200).json(out) : res.status(200).end(JSON.stringify(out));
      return res.end(JSON.stringify(out));
    }

    // ACTION: Deny pending request
    if (action === 'deny_request') {
      whitelist.pending_requests = whitelist.pending_requests.filter(p => p.email?.toLowerCase() !== cleanEmail);
      await saveWhitelistData(whitelist);

      const out = {
        success: true,
        pendingRequests: whitelist.pending_requests
      };
      if (res.status) return res.status(200).json ? res.status(200).json(out) : res.status(200).end(JSON.stringify(out));
      return res.end(JSON.stringify(out));
    }

    // ACTION: Add bonus / top-up credits for a user (and ensure they are on the allowed whitelist)
    if (action === 'add_credits') {
      if (!cleanEmail) {
        const err = { error: 'Missing target email' };
        if (res.status) return res.status(400).json ? res.status(400).json(err) : res.status(400).end(JSON.stringify(err));
        return res.end(JSON.stringify(err));
      }
      if (!whitelist.allowed_emails.map(e => e.toLowerCase()).includes(cleanEmail)) {
        whitelist.allowed_emails.push(cleanEmail);
      }
      whitelist.pending_requests = whitelist.pending_requests.filter(p => p.email?.toLowerCase() !== cleanEmail);
      const addAmount = Math.max(1, Math.min(100, Number(body.amount) || 5));
      if (!whitelist.user_credits || typeof whitelist.user_credits !== 'object') {
        whitelist.user_credits = {};
      }
      const todayKey = getTodayDateKeyIST();
      const existing = whitelist.user_credits[cleanEmail] || {};
      const currentBonus = Math.max(0, Number(existing.bonusCredits) || 0);
      const usedToday = (existing.lastDateKey === todayKey) ? (Number(existing.usedToday) || 0) : 0;

      whitelist.user_credits[cleanEmail] = {
        ...existing,
        dailyLimit: Number(existing.dailyLimit) > 0 ? Number(existing.dailyLimit) : (whitelist.default_daily_limit || DEFAULT_DAILY_CREDIT_LIMIT),
        usedToday,
        lastDateKey: todayKey,
        bonusCredits: currentBonus + addAmount,
        totalUsed: Math.max(0, Number(existing.totalUsed) || 0),
        updatedAt: new Date().toISOString()
      };
      await saveWhitelistData(whitelist);

      const out = {
        success: true,
        email: cleanEmail,
        added: addAmount,
        credits: computeUserCreditSummary(whitelist, cleanEmail)
      };
      if (res.status) return res.status(200).json ? res.status(200).json(out) : res.status(200).end(JSON.stringify(out));
      return res.end(JSON.stringify(out));
    }

    // ACTION: Reset today's used credits back to 0 for a user
    if (action === 'reset_daily_credits') {
      if (!cleanEmail) {
        const err = { error: 'Missing target email' };
        if (res.status) return res.status(400).json ? res.status(400).json(err) : res.status(400).end(JSON.stringify(err));
        return res.end(JSON.stringify(err));
      }
      if (!whitelist.user_credits || typeof whitelist.user_credits !== 'object') {
        whitelist.user_credits = {};
      }
      const todayKey = getTodayDateKeyIST();
      const existing = whitelist.user_credits[cleanEmail] || {};
      whitelist.user_credits[cleanEmail] = {
        ...existing,
        dailyLimit: Number(existing.dailyLimit) > 0 ? Number(existing.dailyLimit) : (whitelist.default_daily_limit || DEFAULT_DAILY_CREDIT_LIMIT),
        usedToday: 0,
        perspectiveUsedToday: 0,
        chronicleUsedToday: 0,
        lastDateKey: todayKey,
        bonusCredits: Math.max(0, Number(existing.bonusCredits) || 0),
        totalUsed: Math.max(0, Number(existing.totalUsed) || 0),
        updatedAt: new Date().toISOString()
      };
      await saveWhitelistData(whitelist);

      const out = {
        success: true,
        email: cleanEmail,
        credits: computeUserCreditSummary(whitelist, cleanEmail)
      };
      if (res.status) return res.status(200).json ? res.status(200).json(out) : res.status(200).end(JSON.stringify(out));
      return res.end(JSON.stringify(out));
    }

    // ACTION: Set default daily credit limit (or per-user daily credit limit)
    if (action === 'set_daily_limit') {
      const newLimit = Math.max(1, Math.min(100, Number(body.dailyLimit) || DEFAULT_DAILY_CREDIT_LIMIT));
      if (cleanEmail) {
        if (!whitelist.user_credits || typeof whitelist.user_credits !== 'object') {
          whitelist.user_credits = {};
        }
        const existing = whitelist.user_credits[cleanEmail] || {};
        whitelist.user_credits[cleanEmail] = {
          ...existing,
          dailyLimit: newLimit,
          updatedAt: new Date().toISOString()
        };
      } else {
        whitelist.default_daily_limit = newLimit;
      }
      await saveWhitelistData(whitelist);

      const out = {
        success: true,
        defaultDailyLimit: whitelist.default_daily_limit || DEFAULT_DAILY_CREDIT_LIMIT,
        credits: cleanEmail ? computeUserCreditSummary(whitelist, cleanEmail) : null
      };
      if (res.status) return res.status(200).json ? res.status(200).json(out) : res.status(200).end(JSON.stringify(out));
      return res.end(JSON.stringify(out));
    }

    const err = { error: 'Unknown action' };
    if (res.status) return res.status(400).json ? res.status(400).json(err) : res.status(400).end(JSON.stringify(err));
    return res.end(JSON.stringify(err));
  }

  if (res.status) return res.status(405).json ? res.status(405).json({ error: 'Method not allowed' }) : res.status(405).end('Method not allowed');
  res.statusCode = 405;
  return res.end('Method not allowed');
};
