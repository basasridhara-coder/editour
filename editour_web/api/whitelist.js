// Serverless Function: /api/whitelist
// Manages the Private Preview Whitelist for Slant (Invite-Only Access)
// Backed by the system_beta_whitelist record in Supabase

const SUPABASE_URL = 'https://fsuukgpizuipxxwatkbo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzdXVrZ3BpenVpcHh4d2F0a2JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMzE4NjEsImV4cCI6MjEwNjcwNzg2MX0.NPnTDhGyiigPZIvror8JGqjCMVKuJ8OZaDN2pGuVfM8';

const MASTER_ADMINS = ['shridharoct16@gmail.com', 'basasridhara@gmail.com'];

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
          admin_emails: Array.isArray(d.admin_emails) ? d.admin_emails : MASTER_ADMINS,
          allowed_emails: Array.isArray(d.allowed_emails) ? d.allowed_emails : MASTER_ADMINS,
          pending_requests: Array.isArray(d.pending_requests) ? d.pending_requests : [],
          access_logs: Array.isArray(d.access_logs) ? d.access_logs : []
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
    access_logs: []
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

    // If admin is requesting, return full roster and pending requests
    if (isAdmin) {
      const responsePayload = {
        allowed: true,
        isAdmin: true,
        adminEmails: whitelist.admin_emails,
        allowedEmails: whitelist.allowed_emails,
        pendingRequests: whitelist.pending_requests,
        accessLogs: whitelist.access_logs
      };
      if (res.status) return res.status(200).json ? res.status(200).json(responsePayload) : res.status(200).end(JSON.stringify(responsePayload));
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(responsePayload));
    }

    const responsePayload = {
      allowed: Boolean(isAllowed),
      isAdmin: false
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

    // ACTION: User attempted login and requests access
    if (action === 'request_access') {
      if (!cleanEmail) {
        const err = { error: 'Missing email' };
        if (res.status) return res.status(400).json ? res.status(400).json(err) : res.status(400).end(JSON.stringify(err));
        return res.end(JSON.stringify(err));
      }

      // Check if already in pending
      const existingIdx = whitelist.pending_requests.findIndex(p => p.email?.toLowerCase() === cleanEmail);
      if (existingIdx === -1) {
        whitelist.pending_requests.unshift({
          email: cleanEmail,
          name: name || cleanEmail.split('@')[0],
          avatar: avatar || null,
          requestedAt: new Date().toISOString()
        });
        await saveWhitelistData(whitelist);
      }

      const out = { success: true, message: 'Access request queued for curator approval' };
      if (res.status) return res.status(200).json ? res.status(200).json(out) : res.status(200).end(JSON.stringify(out));
      return res.end(JSON.stringify(out));
    }

    // ACTION: Log successful user access
    if (action === 'log_access') {
      if (cleanEmail) {
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

    // ACTION: Approve pending request
    if (action === 'approve_request') {
      if (!cleanEmail) {
        const err = { error: 'Missing email' };
        if (res.status) return res.status(400).json ? res.status(400).json(err) : res.status(400).end(JSON.stringify(err));
        return res.end(JSON.stringify(err));
      }

      if (!whitelist.allowed_emails.map(e => e.toLowerCase()).includes(cleanEmail)) {
        whitelist.allowed_emails.push(cleanEmail);
      }
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

    const err = { error: 'Unknown action' };
    if (res.status) return res.status(400).json ? res.status(400).json(err) : res.status(400).end(JSON.stringify(err));
    return res.end(JSON.stringify(err));
  }

  if (res.status) return res.status(405).json ? res.status(405).json({ error: 'Method not allowed' }) : res.status(405).end('Method not allowed');
  res.statusCode = 405;
  return res.end('Method not allowed');
};
