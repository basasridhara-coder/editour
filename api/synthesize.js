// Serverless Function: /api/synthesize
// Synthesizes raw inputs (Web links, Photos/Clippings, Inner Voice)
// into a complete 3-poster Slant carousel using Gemini 3.8 Flash.

const DEFAULT_KEY_B64 = 'QVEuQWI4Uk42STR5WnQzMEl6NGpLRkQ2SndaYVlSeThQYlVtWXpDYUNuMzU3alIyUU9KbFE=';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || Buffer.from(DEFAULT_KEY_B64, 'base64').toString('utf8');
const GEMINI_MODEL = 'gemini-3.8-flash';

const SUPABASE_URL = 'https://fxfklefnkpmhofncqhfh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4ZmtsZWZua3BtaG9mbmNxaGZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NzM4NzYsImV4cCI6MjEwODA0OTg3Nn0.0nw5ZDvlEsYal6EYXcqyaAPRHoxkXxZgDsNQDppEYgM';
const MASTER_ADMINS = ['shridharoct16@gmail.com', 'basasridhara@gmail.com'];

async function verifyEmailIsWhitelisted(email) {
  if (!email) return false;
  const clean = String(email).toLowerCase().trim();
  if (MASTER_ADMINS.includes(clean)) return true;
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.system_beta_whitelist&select=data`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    if (resp.ok) {
      const rows = await resp.json();
      const list = rows?.[0]?.data?.allowed_emails || [];
      const admins = rows?.[0]?.data?.admin_emails || [];
      return list.map(e => e.toLowerCase()).includes(clean) || admins.map(e => e.toLowerCase()).includes(clean);
    }
  } catch (err) {
    console.warn('Synthesize whitelist check notice:', err);
  }
  return false;
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

function resolveFamilyCastProfileId(userIdentifier) {
  const raw = String(userIdentifier || '').trim().toLowerCase();
  if (
    !raw ||
    raw === 'default' ||
    raw === '@shridhar reddy' ||
    raw === 'shridhar reddy' ||
    raw === '@shridhar' ||
    raw === 'shridhar' ||
    raw.includes('shridhar') ||
    raw.includes('shridharoct16')
  ) {
    return 'family_cast_shridharoct16_gmail_com';
  }
  return 'family_cast_' + raw.replace(/[^a-z0-9_-]/g, '_');
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

    // Direct Single-Purpose Endpoint: Generate artwork only in background (has dedicated full execution window)
    if (body && body.action === 'artwork_only') {
      let { prompt = '', imageBase64 = null, imageMimeType = 'image/jpeg', creatorEmail = '', familyCast = null, activeCast = null, countryContext = '' } = body;
      let userEmail = (creatorEmail || '').toLowerCase().trim();
      if (!userEmail) {
        userEmail = 'shridharoct16@gmail.com';
      }
      const isAllowed = await verifyEmailIsWhitelisted(userEmail);
      if (!isAllowed) {
        return res.status(403).json({ error: 'Slant Studio is currently in Private Preview by invitation only.' });
      }
      if (!prompt) {
        return res.status(400).json({ error: 'Missing prompt for artwork generation' });
      }

      if (!familyCast || !Array.isArray(familyCast.members) || familyCast.members.length === 0) {
        try {
          const castProfileId = resolveFamilyCastProfileId(creatorEmail || userEmail);
          const cResp = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(castProfileId)}&select=data`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
          });
          if (cResp.ok) {
            const cRows = await cResp.json();
            if (cRows && cRows[0] && cRows[0].data) {
              familyCast = cRows[0].data;
            }
          }
        } catch (_) {}
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
          countryContext
        });
        if (geminiArt) {
          const cleanB64 = geminiArt.replace(/^data:image\/[^;]+;base64,/, '');
          return res.status(200).json({
            success: true,
            illustrationBase64: cleanB64
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

      const userEmail = (creatorEmail || 'shridharoct16@gmail.com').toLowerCase().trim();
      const isAllowed = await verifyEmailIsWhitelisted(userEmail);
      if (!isAllowed) {
        return res.status(403).json({ error: 'Slant Studio is currently in Private Preview by invitation only.' });
      }

      if (!memberId) {
        return res.status(400).json({ error: 'Missing memberId' });
      }

      let sourcePhotoB64 = imageBase64;
      let sourcePhotoMime = imageMimeType;

      if (!sourcePhotoB64) {
        try {
          const castProfileId = resolveFamilyCastProfileId(userEmail);
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
      const fileName = `avatar_${memberId}.png`;

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

      try {
        const castProfileId = resolveFamilyCastProfileId(userEmail);
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

      return res.status(200).json({
        success: true,
        avatarUrl,
        avatarBase64: cleanAvatarB64
      });
    }

    // Endpoint: Get or Save Curator Style Profile & Longitudinal Observations
    if (body && body.action === 'get_curator_style') {
      const { userIdentifier = 'default' } = body;
      const profileId = 'curator_style_' + String(userIdentifier).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
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
      const { userIdentifier = 'default', profile } = body;
      const profileId = 'curator_style_' + String(userIdentifier).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
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

    // Endpoint: Get Family Cast Vault Profile
    if (body && body.action === 'get_family_cast') {
      const { userIdentifier = 'default' } = body;
      const profileId = resolveFamilyCastProfileId(userIdentifier);
      try {
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(profileId)}&select=data`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        if (resp.ok) {
          const rows = await resp.json();
          if (rows && rows[0] && rows[0].data) {
            return res.status(200).json({ success: true, cast: rows[0].data });
          }
        }
      } catch (err) {
        console.warn('Get family cast error:', err.message);
      }

      // Secondary fallback: check primary profile if custom ID missed
      if (profileId !== 'family_cast_shridharoct16_gmail_com') {
        try {
          const fbResp = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.family_cast_shridharoct16_gmail_com&select=data`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
          });
          if (fbResp.ok) {
            const fbRows = await fbResp.json();
            if (fbRows && fbRows[0] && fbRows[0].data) {
              return res.status(200).json({ success: true, cast: fbRows[0].data });
            }
          }
        } catch (_) {}
      }

      return res.status(200).json({
        success: true,
        cast: getDefaultFamilyCast(userIdentifier)
      });
    }

    // Endpoint: Save Family Cast Vault Profile
    if (body && body.action === 'save_family_cast') {
      const { userIdentifier = 'default', cast } = body;
      const profileId = resolveFamilyCastProfileId(userIdentifier);
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/posts`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify({ id: profileId, data: cast })
        });
        return res.status(200).json({ success: true, cast });
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

    // Direct Single-Purpose Endpoint: Polish & Review Take with Pedagogical Highlighters
    if (body && (body.action === 'polish_take' || body.action === 'review_take')) {
      const { text = '', slantTake = '' } = body;
      const rawText = String(text || slantTake || '').trim();
      if (!rawText || rawText.length < 5) {
        return res.status(400).json({ error: 'Please enter a take to polish.' });
      }

      // Fast baseline polish using rule-based formatter
      const baselinePolished = formatCuratorTakeApt(rawText);

      // Call Gemini for high-precision, categorized copy-editing and inline highlighting
      try {
        const copyEditPrompt = `You are a world-class literary copy-editor and writing coach.
The author has written their personal conviction / take on a topic.
Your job is to polish their text into grammatically correct, natural, and apt English while detailing every correction made:
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
  * "phrasing": Word choice, vocabulary improvements, smoother idioms, natural collocations, and eliminating awkward repetition (e.g. "these people" -> "these individuals", "will have" -> "will face", "supporting influentials" -> "supporting influencers", "washed away in" -> "swept away by").
  * "grammar": Verb tense, subject-verb agreement, singular/plural, missing articles or prepositions, pronoun cases (e.g. "it's" -> "its", "is kept" -> "are kept", "Govt" -> "The government").
  * "punctuation": Commas, periods, colons, quotation marks, fixing comma splices or run-ons.

Author's Raw Take:
"""${rawText}"""

Respond strictly with valid JSON with this exact structure:
{
  "polished": "full polished text string without any tags",
  "corrections": [
    {
      "original": "exact minimal word or short phrase from author raw text that was changed",
      "replacement": "exact replacement in the polished text",
      "type": "spelling | grammar | punctuation | phrasing",
      "reason": "concise explanation of why this specific correction was made"
    }
  ]
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
              temperature: 0.1,
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

            return res.status(200).json({
              success: true,
              original: rawText,
              polished: cleanPolished,
              highlightedHtml: highlightedHtml,
              corrections,
              counts
            });
          }
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
          counts: { spelling: 0, grammar: 0, punctuation: 0, phrasing: 0, total: 0 }
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
        counts: { spelling: 0, grammar: 0, punctuation: 0, phrasing: 0, total: 0 }
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
      perspectiveMode = 'hybrid', // 'curator' | 'hybrid' | 'source'
      sourceImageUrl = null,
      sourceImageBase64 = null,
      sourceImageMimeType = 'image/jpeg',
      sourceLedger = null,
      familyCast = null,
      activeCast = null,
      castStaging = null
    } = body || {};

    if (sourceImageUrl && typeof sourceImageUrl === 'string') {
      sourceImageUrl = decodeHtmlEntities(sourceImageUrl).replace(/&amp;/g, '&').trim();
    }

    const effectiveCatalystImage = (sourceType === 'inner_voice') ? (innerVoiceImageBase64 || imageBase64) : null;
    const effectiveCatalystMime = innerVoiceImageMimeType || imageMimeType || 'image/jpeg';

    const userEmail = (creatorEmail || '').toLowerCase().trim();
    if (!userEmail) {
      return res.status(401).json({ error: 'Slant Studio is currently in Private Preview. Please sign in with your invited Google account.' });
    }
    const isAllowed = await verifyEmailIsWhitelisted(userEmail);
    if (!isAllowed) {
      return res.status(403).json({ error: 'Slant Studio is currently in Private Preview by invitation only.' });
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

        if (!extractedTitle || extractedTitle.length < 5 || !sourceImageUrl || !sourceImageBase64) {
          const isYouTube = parsedUrl.hostname.includes('youtube.com') || parsedUrl.hostname.includes('youtu.be');
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
      ? `CRITICAL VISUAL FOCUS DIRECTIVE (POSTER 1 ARTWORK ONLY - CURATOR ANGLE METAPHOR):
- Visual Focus is set to CURATOR ANGLE. This controls the VISUAL ARTWORK only, NOT the text narrative.
- The illustrationPrompt for Poster 1 should translate the curator's conceptual thesis, metaphor, and critique into an evocative, high-aesthetic editorial composition (e.g. symbolic objects, dramatic tension, metaphorical craftsmanship).`
      : `CRITICAL VISUAL FOCUS DIRECTIVE (POSTER 1 ARTWORK ONLY - HYBRID BLEND):
- Visual Focus is set to HYBRID BLEND. This controls the VISUAL ARTWORK only, NOT the text narrative.
- The illustrationPrompt for Poster 1 should blend the concrete real-world news subject with the curator's symbolic tension and visual metaphor.`;

    let effectiveFamilyCast = familyCast;
    if (!effectiveFamilyCast || !Array.isArray(effectiveFamilyCast.members) || effectiveFamilyCast.members.length === 0) {
      try {
        const castProfileId = resolveFamilyCastProfileId(creatorEmail || userEmail);
        const cResp = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(castProfileId)}&select=data`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        if (cResp.ok) {
          const cRows = await cResp.json();
          if (cRows && cRows[0] && cRows[0].data) {
            effectiveFamilyCast = cRows[0].data;
          }
        }
      } catch (_) {}
    }

    const demographicInfo = detectAgeAndDemographics(userSlant, extractedTitle, extractedContent);
    const familyCastDirectives = buildFamilyCastDirectives({
      familyCast: effectiveFamilyCast,
      activeCast,
      castStaging,
      userSlant,
      spark,
      countryContext
    });

    const isCinematicPhoto = (characterRepresentation === 'cinematic' || characterRepresentation === 'cinematic_photo' || characterRepresentation === 'likeness' || (Boolean(effectiveCatalystImage || sourceImageBase64) && characterRepresentation !== 'painting' && characterRepresentation !== 'exact' && characterRepresentation !== 'silhouette' && characterRepresentation !== 'realistic'));
    const isArtisticPainting = (characterRepresentation === 'painting');

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
      : (characterRepresentation === 'silhouette'
        ? 'Minimalist silhouette / stark shadow figures (ONLY if explicitly demanded)'
        : 'Vivid Editorial Realism & Expressive People: Warm, realistic, expressive human beings with clearly visible faces, natural skin tones, clear clothing, and bright warm ambient lighting. STRICT BAN: NEVER pitch-black silhouettes, NEVER faceless shadows, NEVER dark doorway shadow figures, NEVER creepy ghost-like phantoms!')))}
${isCinematicPhoto && (effectiveCatalystImage || sourceImageBase64) ? `CRITICAL CINEMATIC EDITORIAL PHOTOGRAPHY DIRECTIVE (PICTURE-LIKE QUALITY, ZERO DIGITAL FOOTPRINT):
- An authentic real-world photograph is attached. The curator requested Cinematic Editorial Photo portrayal for Poster 1 (picture-like photographic quality).
- In "illustrationPrompt", perform an astute visual analysis of the key people and environment visible in the attached photo to produce an award-winning 35mm editorial documentary photograph / film still:
  1. CAMERA & PHOTOGRAPHIC MEDIUM: 35mm editorial documentary photography, sharp focal depth, natural skin pores and realistic skin textures, gentle natural optical bokeh, lifelike documentary photojournalism. STRICT BAN: NO painterly brushstrokes, NO canvas textures, NO gouache or oil painting effects, NO cartoon or illustration styles! Must look like a real, high-resolution magazine photo.
  2. FACIAL STRUCTURE & EXPRESSIONS: Describe the face shape (e.g. oval, soft round cheeks, structured jaw), warm skin tones, dark almond eyes, natural eye gaze, and authentic thoughtful or joyful expressions.
  3. HAIR & POSTURE: Describe haircut, texture, parting, and color (e.g. dark straight fringe, wavy side-parted hair), height difference, age group, and body posture (e.g. brotherly arm over shoulder).
  4. CLOTHING & SETTING: Describe clothing colors and styles (e.g. vibrant blue graphic t-shirt, light shorts, white tank top) set in the authentic physical environment (e.g. bright sunlit domestic veranda, wooden carved door, granite floor, stainless steel railing) with natural ambient midday sunlight.
  5. PRIVACY & SAFETY CONSTRAINT: DO NOT use real names, do not use words like "clone", "replica", or "deepfake". Describe them as archetypal human subjects so the photo captures their scene and presence with complete privacy.` : ''}
${isArtisticPainting && (effectiveCatalystImage || sourceImageBase64) ? `CRITICAL ARTISTIC BROADSHEET PAINTING DIRECTIVE (PAINTED ARTWORK):
- An authentic real-world photograph is attached. The curator requested Artistic Broadsheet Painting portrayal for Poster 1.
- In "illustrationPrompt", perform an astute visual analysis of the key people visible in the attached photo to describe their physical facial characteristics, hairstyle, age, stature, and clothing:
  1. FACIAL STRUCTURE & FEATURES: Describe the face shape, skin tone, eye shape, gaze, smile or expression.
  2. HAIR & HEAD: Describe haircut, hair texture, part, and color.
  3. RELATIVE STATURE & CLOTHING: Describe the age gap, height difference, clothing colors and styles.
  4. ENVIRONMENT & LIGHTING: Describe the setting bathed in natural midday sunlight.
  5. ARTISTIC MEDIUM: Frame the prompt as an expressive masterpiece editorial painting (e.g. "Warm cinematic editorial gouache and oil painting with rich textures, vivid color grading, lifelike human expression").
  6. PRIVACY & SAFETY CONSTRAINT: DO NOT use real names, do not use words like "clone", "replica", or "deepfake". Describe them as artistic archetypal protagonists so the artwork captures their recognizable essence and warmth while protecting their privacy.` : ''}
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
${sourceType === 'inner_voice' ? `CRITICAL INNER VOICE & LIVED EXPERIENCE DIRECTIVE:
- This is an INNER VOICE perspective rooted in the curator's personal life, emotional experience, philosophical stance, or daily human reality (e.g. travel anticipation, family moments, work-life balance, craft, relief).
- MATCH THE EMOTIONAL ENERGY OF THE USER'S CONTEXT:
  * If the user is excited about a vacation, Kerala trip, beach, hills, or time with family, MATCH THAT VIBRANT EXCITEMENT AND ANTICIPATION!
  * NEVER produce gloomy, melodramatic, depressing headlines like "The Heavy Art of Leaving Real Life Behind"!
  * Frame the friction as relatable, humorous, and heartwarming pre-trip scramble (packing, forgotten items, last emails, excitement of what lies ahead).
- IN POSTER 1 ("VISUAL HOOK"):
  * Headline MUST be vibrant, positive, memorable, and directly relevant to their story (e.g. "The Sweet Rush Before the Backwaters", "Trading Pending Tabs for Kerala Sun", "When Packing Chaos Meets Pure Anticipation", "The Art of Finally Switching Off").
  * The Hook sentence must capture the excitement and relatable rush of preparing for the journey.
- IN POSTER 2 ("THE CRITICAL PERSPECTIVE" / curatorTake):
  * Ground the conviction directly in their specific context (Kerala, the trip, the son's reminder, closing pending tasks, the relief of the break).
  * STRICT BAN: NEVER echo the user's raw input slant verbatim! You MUST synthesize an articulate, elevated 2-sentence editorial conviction (EXACTLY 2 complete sentences, 25-35 words total, ending definitively with a period) that refines their thoughts into an inspiring insight.
  * In "keyTakeaways", give 3 sharp, uplifting insights about breaking away, presence over perfection, and why the destination makes the frantic packing worth it.
- IN POSTER 3 ("THE RECEIPTS & CORE CONVICTION" / resolvedArticleExcerpts):
  * Deliver exactly 3 substantive, evocative broadsheet narrative paragraphs (each 60-75 words, 3-4 full sentences; 180-220 words total):
    1. Paragraph 1 (Scene & Catalyst): Ground the situation in sensory detail around the spark ("${spark}"): the open suitcases, packing lists, children holding forgotten travel items, and the rush to close remaining tasks.
    2. Paragraph 2 (The Turning Point): The joyful realization when you realize work will never be 100% finished, but vacation countdown waits for no one.
    3. Paragraph 3 (The Lasting Truth): A deep, warm closing reflection on Kerala's tranquil backwaters, green hills, and why presence with family is the greatest luxury.
  * STRICT BAN: NEVER prefix paragraphs with labels like "The spark:", "Curator stance:", "Paragraph 1:", or bullet points! Output pure, narrative broadsheet text.
- IN "originalHeadline":
  * Set to the spark statement or a refined 6–12 word hook of the spark (e.g. "When a forgotten packing item breaks the work trance and signals the escape"). NEVER set to the raw user slant.
- IN "illustrationPrompt":
  * Describe a warm, colorful, sunny scene of real people packing or getting ready, with smiling illuminated faces, colorful room, suitcase, tropical palms visible through window, warm golden light.
  * Explicitly instruct: "Realistic people with clearly visible smiling faces, warm daylight, vibrant colors, Kerala palm trees, cheerful atmosphere, highly detailed, no silhouettes, no dark shadows, no faceless figures, no text".` : (userSlant ? `CRITICAL POLISHED CURATOR INPUT DIRECTIVE:
- The curator provided their authentic stance: "${userSlant}".
- In "polishedCuratorTake": Polish the curator's exact input for grammar, spelling, punctuation, capitalization, and smooth phrasing flow.
- STRICT REQUIREMENTS FOR "polishedCuratorTake":
  * 100% PRESERVATION: Retain 100% of the curator's original thoughts, arguments, conviction, personal voice, style, and full length.
  * ZERO SUMMARIZATION: Do NOT summarize, cut short, or compress their take into 2 sentences.
  * ZERO ALTERATION: Do NOT change the curator's stance or introduce unsolicited opinions. It is purely gentle grammar and phrase correction.
  * ZERO EM-DASHES: NEVER use em-dashes ("—"), en-dashes ("–"), or double hyphens ("--"). They scream artificial AI generation. Connect clauses with natural commas, semicolons, or standard punctuation so it feels authentic and human.
CRITICAL POSTER 2 DIRECTIVE (PULL-QUOTE DERIVED DIRECTLY FROM CURATOR INPUT):
${refineCoreTake ? `- Poster 2 ("THE CRITICAL PERSPECTIVE" / curatorTake) is an authentic, high-impact PULL-QUOTE (EXACTLY 2 complete sentences, 25-35 words total, ending definitively with a period).
- EDITORIAL PULL-QUOTE METHOD (CULL & TIGHTEN, NEVER REINVENT):
  * DO NOT throw away the user's authentic words to invent stiff corporate or NGO rhetoric (e.g. NEVER write "Unprecedented deluges remind us that...", "natural systems pushed beyond capacity", or "cooperative sustainable living").
  * Identify the author's STRONGEST, MOST VIVID core lines from: "${userSlant}".
  * RETAIN their powerful metaphors, idioms, and contrasts (e.g. "bring the richest and strongest among us to their knees", "what humanity is truly worth in front of nature", "narrow perspective", "small mistakes", "live selflessly").
  * Polish the grammar, articles, and prepositions so their authentic voice rings with crisp, effortless, natural English.` : `- USE TAKE AS-IS (VERBATIM): The curator chose to keep their exact typed take as-is on Poster 2.
- In "curatorTake", you MUST output the curator's authentic take: "${userSlant}" verbatim without rephrasing or altering their sentence structure.`}` : '')}
${sourceType === 'video_audio' ? `CRITICAL VIDEO & AUDIO BROADCAST DIRECTIVE:
- This slant is rooted in a VIDEO or AUDIO broadcast (e.g. YouTube interview, podcast episode, keynote, or debate).
- Mental model: "I watched/listened to something that sparked a reaction."
- Frame the adapted headline with the immediacy, conversational tension, or contrarian takeaway of a spoken dialogue.
- Poster 2 ("THE CRITICAL PERSPECTIVE" / curatorTake): Capture the key realization, counter-slant, or pushback against what was said in the broadcast.` : ''}
${userSlant && sourceType !== 'inner_voice' ? `CRITICAL POSTER 3 DIRECTIVE (ELABORATED USER TAKE IN DIALOGUE WITH SOURCE):
- Poster 3 is the curator's broadsheet essay where the curator's stance/take is ELABORATED IN DIRECT CONNECTION WITH THE ATTACHED SOURCE.
- It must NOT be a dry, third-person summary or detached book report of the source piece (the objective source ledger is already accessible to the reader on tap from Posters 1 & 2).
- Poster 3 must synthesize the curator's perspective into a substantive 3-paragraph broadsheet editorial:
  * Paragraph 1 (The Catalyst & The Modern Friction): The curator's opening thesis connecting their personal conviction/angle to the core dilemma explored by the source author/speaker (exactly 50-60 words, 3 concise sentences with strong opening for dropcap).
  * Paragraph 2 (Engaging the Source in Depth): Directly engage with the author's/speaker's concrete concepts, arguments, or data points (e.g. citing specific teachings, findings, or claims), using them to substantiate and deepen the curator's stance (exactly 45-55 words, 2-3 sentences).
  * Paragraph 3 (The Human Stakes & Prescriptive Resolution): Detail the deeper personal, familial, or societal implications, offering an intentional boundary or forward-looking resolution (exactly 40-50 words, 2 sentences).
- STRICT BAN: Never echo the user's raw slant verbatim across paragraphs! Elaborate the thought with depth, narrative richness, and intellectual conviction. Output pure broadsheet paragraphs without labels like "Paragraph 1:".
- "keyTakeaways": Exactly 3 sharp, structured conviction principles formulated from the elaborated take in dialogue with the source (each exactly 10-13 words with bold title prefix, e.g. "Title: Core insight").
- "receiptHighlightQuote": A poignant, high-impact core conviction sentence (exactly 18-22 words) capturing the heart of the curator's stance in connection with the source.` : ''}

CRITICAL POSTER 3 "1-MINUTE READ" ESSAY DIRECTIVE:
Poster 3 ("SLANT MINUTE" / 60-SEC BROADSHEET) is a pure, substantive broadsheet essay in paragraphs.
It MUST strictly target 180 to 220 words total for the 3-paragraph essay itself in "summary" (and "resolvedArticleExcerpts"):
- Paragraph 1: 60-70 words (strong opening for broadsheet dropcap)
- Paragraph 2: 60-75 words (core elaboration and conceptual depth)
- Paragraph 3: 55-70 words (human stakes, lasting conviction, and forward-looking resolution)
TOTAL ESSAY: 180-220 words for an authentic 1-minute read.
The curator's intellectual perspective, conviction, and provided context must be deeply carried and elaborated throughout.
If a catalyst photo is attached, subtly ground the atmosphere where natural, but NEVER compromise the curator's perspective or intellectual depth for scene description filler.
${cues && cues.length > 0 ? `CRITICAL VISUAL RULE: The Hook poster artwork and cues MUST be anchored in #1 HERO: "${cues[0]}", incorporating #2 MOTIF: "${cues[1] || ''}" and #3 TENSION: "${cues[2] || ''}".` : ''}

Respond strictly with valid JSON with this exact structure:
{
  "adaptedHeadline": "5-10 word bold, memorable editorial headline",
  "originalHeadline": "Original title or subject (or spark hook if Inner Voice)",
  "publicationName": "${pubName || (sourceType === 'inner_voice' ? 'Inner Voice' : (sourceType === 'video_audio' ? 'Broadcast Slant' : 'Curated Press'))}",
  "categoryBadge": "UPPERCASE CATEGORY (e.g. DEEP TECH, CULTURE, OPINION, CLIMATE, ECONOMY, HEALTH)",
  "hook": "1-2 sentence gripping hook that stops the reader mid-scroll",
  "polishedCuratorTake": "${userSlant ? 'The curator\'s exact full-length input with gentle grammar, spelling, and phrase corrections applied (preserving 100% of their voice, thoughts, and length).' : ''}",
  "curatorTake": "EXACTLY 2 complete sentences (25-35 words total, ending with a period) capturing the author's strongest, most poignant lines from their input. Retain their vivid human phrasing and metaphors without inventing stiff academic summaries.",
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
  "illustrationPrompt": "${isCinematicPhoto ? 'Award-winning 35mm editorial news photograph in 4:5 vertical portrait format, sharp camera focus, natural skin textures, lifelike human expressions, realistic clothing and environment observed from the attached photo. Natural ambient lighting, cinematic color grading, strictly no painterly brushstrokes, no canvas textures, no oil paint, no text, no letters.' : (isArtisticPainting ? 'Masterpiece editorial broadsheet painted illustration describing the scene in vivid detail. Specifically incorporate the observed facial structures, hairstyles, expressions, clothing colors, and postures from the attached photo into a rich painterly composition. Clear, warmly lit faces, lifelike human expression, no text, no letters.' : (familyCastDirectives ? (familyCastDirectives.isSolo ? `Cinematic visual art prompt describing the scene with rich detail. Focus exclusively on the single protagonist: ${familyCastDirectives.soloName} (${familyCastDirectives.soloTraits}). Strictly do not draw any extra family members, parents, or background companions. Warm natural lighting, clear human form, no text, no letters, no typography.` : `Cinematic visual art prompt describing the scene with rich detail. MANDATORY HEADCOUNT: You MUST begin with the exact headcount of all ${familyCastDirectives.totalCount} family members visible side by side. All ${familyCastDirectives.totalCount} members must be individually visible with warm, fully illuminated faces. Preserve each character uncompromisable physical anatomy (face shape, natural hair length, real-world body build) strictly without morphing into western catalog models or salon blowouts. Do not draw detached foreground hands or extra people. No text, no letters, no typography.`) : 'Cinematic visual art prompt describing the scene with rich detail. People MUST have visible faces, warm natural lighting, and clear human form. Strictly avoid pitch-black silhouettes, faceless shadow figures, dark ghosts, or creepy silhouettes unless characterRepresentation is explicitly silhouette. Do not include any text, letters, watermarks, or typography.'))}"
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
    const hasExactPhoto = isExactPhoto && !!(imageBase64);

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
        sourceLedger
      });
    }

    let finalIllustrationUrl = '';
    let finalIllustrationBase64 = null;

    if (hasExactPhoto) {
      finalIllustrationUrl = imageBase64;
      finalIllustrationBase64 = imageBase64.startsWith('data:')
        ? imageBase64.split(',')[1]
        : imageBase64;
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

    // 2. Poster 2 Curated Take (2-sentence punchy visual pull-quote framed for Slide 2 card)
    let finalCuratorTake = (!refineCoreTake && userSlant && userSlant.trim().length > 0)
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

    const rawExcerpts = Array.isArray(parsed.resolvedArticleExcerpts) ? parsed.resolvedArticleExcerpts : [];
    const cleanedExcerpts = rawExcerpts.map(e => String(e).replace(/^(the spark|curator stance|paragraph \d+)\s*:\s*["']?/i, '').replace(/["']?$/i, '').trim());

    let effectiveIllustrationPrompt = parsed.illustrationPrompt || concisePrompt || '';
    if (countryContext && countryContext !== 'Global' && !effectiveIllustrationPrompt.toLowerCase().includes(countryContext.toLowerCase())) {
      effectiveIllustrationPrompt = `${countryContext} setting, ${effectiveIllustrationPrompt}`;
    }

    const id = 'slant-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const postItem = {
      id,
      createdAt: new Date().toISOString(),
      sourceType,
      digitalLink: url || '',
      publicationName: parsed.publicationName || pubName || (sourceType === 'inner_voice' ? 'Inner Voice' : 'Curated Press'),
      adaptedHeadline: parsed.adaptedHeadline || 'Perspectives in Flux',
      originalHeadline: (sourceType === 'inner_voice' && spark) ? (parsed.originalHeadline || spark) : (parsed.originalHeadline || extractedTitle || parsed.adaptedHeadline),
      categoryBadge: parsed.categoryBadge || (sourceType === 'inner_voice' ? 'OPINION' : 'DISCOVERY'),
      targetAudience: targetAudience || 'General',
      hook: parsed.hook || '',
      summary: parsed.summary || '',
      whyItMatters: parsed.whyItMatters || '',
      keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [],
      receiptHighlightQuote: parsed.receiptHighlightQuote || '',
      resolvedArticleExcerpts: cleanedExcerpts,
      keyMetric: parsed.keyMetric || '',
      pullQuote: parsed.receiptHighlightQuote || '',
      visualMood: parsed.visualMood || 'Editorial Chiaroscuro',
      heroCue: parsed.heroCue || (cues && cues[0]) || '',
      cues: cues || [],
      characterRepresentation,
      hookCues: `#1 [HERO]: ${parsed.heroCue || (cues && cues[0]) || 'Central subject'}\n#2 [MOTIF]: ${parsed.motifCue || (cues && cues[1]) || 'Metaphor'}\n#3 [TENSION]: ${parsed.tensionCue || (cues && cues[2]) || 'Conflict'}\n#4 [ATMOSPHERE]: ${parsed.atmosphereCue || (cues && cues[3]) || 'Setting'}\n#5 [LIGHTING]: ${parsed.lightingCue || (cues && cues[4]) || 'Atmospheric light'}\n#6 [STYLE]: ${parsed.styleCue || (cues && cues[5]) || 'Editorial illustration'}`,
      illustrationPrompt: effectiveIllustrationPrompt,
      artworkPending: (!hasExactPhoto && !finalIllustrationBase64),
      illustrationUrl: finalIllustrationBase64 ? '' : finalIllustrationUrl,
      illustrationBase64: finalIllustrationBase64,
      aiIllustrationUrl: finalIllustrationBase64 ? '' : finalIllustrationUrl,
      creatorHandle: creatorHandle || '@curator',
      slantTone: slantTone || 'mind',
      slantIcon: slantTone === 'heart' ? '❤️' : '🧠',
      creatorOpinion: finalCuratorTake,
      curatorTake: finalCuratorTake,
      polishedCuratorTake: finalPolishedCuratorTake || formatCuratorTakeApt(userSlant || finalCuratorTake),
      rawUserSlant: userSlant || '',
      refineCoreTake,
      vocabularyStyle: hasUserContext ? 'adaptive' : 'casual',
      perspectiveMode: perspectiveMode || 'hybrid',
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
      generationInputs: {
        slantTake: finalPolishedCuratorTake || userSlant || '',
        sourceUrl: url || '',
        sourceType: sourceType,
        perspectiveMode: perspectiveMode || 'hybrid',
        sourceImageUrl: sourceImageUrl || null,
        sourceImageBase64: sourceImageBase64 || null,
        referencePhotoUrl: sourceImageUrl || (sourceImageBase64 ? (sourceImageBase64.startsWith('data:') ? sourceImageBase64 : `data:${sourceImageMimeType || 'image/jpeg'};base64,${sourceImageBase64}`) : null),
        spark: spark || '',
        catalystPhoto: (sourceType === 'inner_voice' && effectiveCatalystImage) ? effectiveCatalystImage : null,
        catalystPhotoBase64: (sourceType === 'inner_voice' && effectiveCatalystImage) ? effectiveCatalystImage : null,
        innerVoiceImageBase64: effectiveCatalystImage || null,
        innerVoiceImageMimeType: effectiveCatalystImage ? effectiveCatalystMime : null,
        cues: cues || [],
        heroCue: parsed.heroCue || (cues && cues[0]) || '',
        characterRepresentation,
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
      post: postItem
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
  sourceLedger = null
}) {
  const isStrictlyInnerVoice = (sourceType === 'inner_voice');
  const combined = `${userSlant || ''} ${spark || ''} ${extractedTitle || ''} ${extractedContent || ''}`.toLowerCase();

  const hero = (cues && cues[0]) || 'Solitary Focal Figure';
  const motif = (cues && cues[1]) || 'Symbolic Editorial Metaphor';
  const tension = (cues && cues[2]) || 'Friction & Opposing Cast Shadows';
  const atmosphere = (cues && cues[3]) || 'Atmospheric Minimalist Setting';
  const lighting = (cues && cues[4]) || 'Dramatic Chiaroscuro Editorial Spotlight';
  const style = (cues && cues[5]) || 'Cinematic Warm Editorial Illustration';

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
    'huang', 'minister', 'president', 'judge', 'justice', 'officer', 'sweeper',
    'curator', 'citizen', 'woman', 'man', 'girl', 'boy', 'leader', 'doctor',
    'worker', 'protagonist', 'figure', 'person', 'individual', 'portrait', 'lookalike',
    'founder', 'engineer', 'entrepreneur', 'student', 'youth', 'actor', 'author', 'critic', 'analyst', 'politician',
    'brother', 'brothers', 'sister', 'sisters', 'child', 'children', 'family', 'son', 'sons', 'daughter', 'daughters',
    'parent', 'parents', 'kid', 'kids', 'toddler', 'baby'
  ];
  return personKeywords.some(w => lower.includes(w));
}

async function generateGeminiEditorialArtwork({ prompt, imageBase64, imageMimeType = 'image/jpeg', timeoutMs = 35000, familyCast = null, activeCast = null, stylizedAvatars = null, countryContext = '' }) {
  if (!GEMINI_API_KEY) return null;
  const imageModels = [
    'gemini-2.5-flash-image',
    'gemini-3.1-flash-image',
    'gemini-3.1-flash-lite-image'
  ];

  let enhancedPrompt = prompt || '';

  // Detect family context with 2 sons or family group
  const hasTwoSons = /\b(two sons|2 sons|both boys|two boys|elder son.*younger son|elder brother.*younger brother)\b/i.test(enhancedPrompt);
  const hasFamilyContext = hasTwoSons || /\b(family.*temple|family.*trip|father.*mother.*son|father.*wife.*son|me, wife and 2 sons|with family)\b/i.test(enhancedPrompt);
  const isIndianFamilyCast = (!countryContext || /india/i.test(countryContext));

  if ((hasTwoSons || hasFamilyContext) && isIndianFamilyCast) {
    const headcountAnchor = 'GROUP PORTRAIT OF EXACTLY FOUR (4) DISTINCT INDIVIDUAL PEOPLE VISIBLE SIDE BY SIDE (3 MALES, 1 FEMALE). STRICT COUNT = 4 PEOPLE: 1) Adult Father (man, mid 40s) with sturdy broad-shouldered build, 2) Adult Mother (woman, mid 30s) with natural healthy medium adult build (strictly not ultra-slim or runway model thin), 3) Elder Son (11-year-old pre-teen boy) reaching father chest level with healthy sturdy youth build and square shoulders (not skinny, not frail), 4) Younger Son (7-year-old young schoolboy) noticeably shorter reaching older brother shoulder with healthy solid child proportions. REALISTIC NATURAL HUMAN BUILDS, STRICT BAN ON SKINNY OR WAIF-LIKE BODIES. BOTH SONS ARE SEPARATE INDIVIDUAL PEOPLE. STRICT BAN ON MERGING: Do NOT draw only one child; both the 11yo boy and 7yo boy must be fully drawn side by side. ';
    if (!enhancedPrompt.includes('EXACTLY FOUR') && !enhancedPrompt.includes('STRICT COUNT = 4')) {
      enhancedPrompt = headcountAnchor + enhancedPrompt;
    }

    // Sanitize detached foreground hands, salon blowout hair, and remove skinny runway-model biases
    enhancedPrompt = enhancedPrompt
      .replace(/In the foreground,\s*(?:glowing\s*)?cupped hands receive drops of sacred theertha water/gi, 'The father and sons cup their hands to receive drops of sacred theertha water (no external detached arms)')
      .replace(/\b(lean|skinny|slender|frail)\s*(?:11-year-old|elder son|boy|adolescent)/gi, 'sturdy healthy 11-year-old')
      .replace(/\bgraceful mother\b/gi, 'mother with natural healthy medium build')
      .replace(/\b(lean|skinny|slender)\s*build/gi, 'healthy sturdy build')
      .replace(/\blong flowing (?:dark )?hair\b/gi, 'natural shoulder-length wavy dark hair')
      .replace(/\blong wavy (?:dark )?hair past (?:her )?chest\b/gi, 'natural shoulder-length wavy dark hair')
      .replace(/\bsalon blowout\b/gi, 'natural everyday hair')
      .replace(/\bcasual cotton attire\b/gi, 'comfortable cotton kurta or natural casual attire');

    // Enforce mother physical anchor only for family cast
    if (/\b(mother|wife|mom)\b/i.test(enhancedPrompt) && !enhancedPrompt.includes('shoulder-length wavy dark hair')) {
      enhancedPrompt += ', Mother physical anchor: authentic Indian woman, warm wheatish skin, soft round-to-oval face, no heavy makeup, natural shoulder-length wavy dark hair, healthy medium adult build with natural soft shoulders (strictly not ultra-slim or runway model)';
    }

    // If adult father is present with a child without mother, replace generic guardian with adult father
    if (/\b(father|dad|shridhar)\b/i.test(enhancedPrompt) && !/\b(mother|mom|wife|woman|female)\b/i.test(enhancedPrompt)) {
      enhancedPrompt = enhancedPrompt
        .replace(/\b(?:an attentive,?\s*smiling\s*)?guardian\b/gi, 'his adult father Shridhar (mid 40s man, trimmed beard)')
        .replace(/\ba parent\b/gi, 'his adult father Shridhar');
    }

    // Enforce father physical anchor if present
    if (/\b(father|dad|shridhar)\b/i.test(enhancedPrompt) && !enhancedPrompt.includes('salt-and-pepper')) {
      enhancedPrompt += ', Father physical anchor: adult Indian male, early 40s, medium-brown skin, oval face, neat salt-and-pepper trimmed beard, short textured dark hair, sturdy broad-shouldered build';
    }
  }

  // Country Setting Anchor for General Editorial Posters
  if (countryContext && countryContext !== 'Global' && !enhancedPrompt.toLowerCase().includes(countryContext.toLowerCase())) {
    enhancedPrompt = `${countryContext} regional setting and authentic cultural atmosphere, ${enhancedPrompt}`;
  }

  const isPhotoMedium = /photograph|film still|35mm|photojournalism|documentary|editorial portrait photograph/i.test(enhancedPrompt);
  const textureStyle = isPhotoMedium
    ? 'sharp focus, natural skin textures, 35mm film grain, authentic ambient lighting'
    : 'painterly texture, dramatic lighting';

  const parts = [];
  if (Array.isArray(stylizedAvatars) && stylizedAvatars.length > 0) {
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
  } else if (imageBase64) {
    const cleanData = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    parts.push({
      inlineData: {
        mimeType: imageMimeType,
        data: cleanData
      }
    });
    parts.push({
      text: `Transform this reference image into a high-aesthetic cinematic editorial magazine poster in 4:5 vertical portrait format: ${enhancedPrompt}. Imposing visual composition, ${textureStyle}, vivid color grading, masterwork, no typography, no letters, no text.`
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
        const inlinePart = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (inlinePart && inlinePart.inlineData && inlinePart.inlineData.data) {
          return `data:${inlinePart.inlineData.mimeType || 'image/png'};base64,${inlinePart.inlineData.data}`;
        }
      } else {
        const errText = await resp.text().catch(() => '');
        console.warn(`Gemini image generation with ${model} returned ${resp.status}:`, errText.slice(0, 160));
      }
    } catch (err) {
      console.warn(`Gemini image model ${model} skipped:`, err.message);
    }
  }

  // If image-conditioned attempt returned nothing (e.g. policy block / IMAGE_OTHER on real faces), fallback to text prompt
  if (imageBase64 || (stylizedAvatars && stylizedAvatars.length > 0)) {
    return generateGeminiEditorialArtwork({ prompt, imageBase64: null, timeoutMs, stylizedAvatars: null });
  }

  return null;
}

function getCuratedEditorialPhoto() {
  // Completely eliminated external stock photo fallbacks
  return '';
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

function getDefaultFamilyCast(userIdentifier) {
  return {
    userIdentifier: userIdentifier || '@Shridhar Reddy',
    updatedAt: new Date().toISOString(),
    members: [
      {
        id: 'member_father',
        relationship: 'self',
        roleLabel: 'Father / Self',
        name: 'Father (Shridhar)',
        aliases: ['dad', 'father', 'shridhar', 'myself', 'me', 'i', 'husband'],
        age: 40,
        ageBracket: 'Adult (Late 30s / Early 40s)',
        heightDesc: '5ft 10in (178cm), adult stature',
        uncompromisableAnchors: 'Adult Indian male, age 40, medium-brown skin, oval face, neat salt-and-pepper trimmed beard, short textured dark hair, sturdy broad-shouldered build with upright grounded posture.',
        visualTraits: 'Adult father in early 40s, neat short dark hair, warm confident expression, seasoned contemporary styling.',
        vehicleRole: 'driver_right',
        defaultClothing: 'Casual dark linen shirt or jacket',
        stylizedAvatarUrl: 'https://fxfklefnkpmhofncqhfh.supabase.co/storage/v1/object/public/posters/avatar_member_father.jpg'
      },
      {
        id: 'member_mother',
        relationship: 'spouse',
        roleLabel: 'Mother / Wife',
        name: 'Mother',
        aliases: ['wife', 'mother', 'mom'],
        age: 36,
        ageBracket: 'Adult (Mid 30s)',
        heightDesc: '5ft 4in (162cm), adult female stature',
        uncompromisableAnchors: 'Warm wheatish skin, soft round-to-oval maternal face, gentle dark eyes without heavy makeup, natural shoulder-length wavy dark hair with center/side parting (strictly no past-chest salon blowout curls), healthy medium adult build with natural soft shoulders. Everyday authentic South Indian presence.',
        visualTraits: 'Adult mother in her mid-30s, warm thoughtful smile, natural shoulder-length wavy dark hair, expressive eyes, elegant casual styling.',
        vehicleRole: 'passenger_front_left',
        defaultClothing: 'Vibrant comfortable travel attire',
        stylizedAvatarUrl: 'https://fxfklefnkpmhofncqhfh.supabase.co/storage/v1/object/public/posters/avatar_member_mother.jpg'
      },
      {
        id: 'member_elder_son',
        relationship: 'elder_son',
        roleLabel: 'Elder Son (Age 11)',
        name: 'Elder Son',
        aliases: ['elder son', 'older son', 'older boy', 'elder brother', 'big brother', 'first son', '11-year-old', '11yo'],
        age: 11,
        ageBracket: 'Pre-teen / Adolescent (11 Years Old)',
        heightDesc: '4ft 10in (147cm): Stands a full head taller than his younger brother',
        uncompromisableAnchors: 'Warm brown-skinned 11-year-old pre-teen Indian boy with neat short dark hair, square shoulders, sturdy healthy youth build (strictly not skinny, not frail), stands visibly a full head taller than his younger brother.',
        visualTraits: '11-year-old pre-teen boy, healthy sturdy build with square shoulders, distinct mature pre-teen facial structure, neat side-parted dark hair, visibly older and taller by a head than his younger brother.',
        vehicleRole: 'passenger_rear_right',
        defaultClothing: 'Navy blue or dark graphic tee / hoodie',
        stylizedAvatarUrl: 'https://fxfklefnkpmhofncqhfh.supabase.co/storage/v1/object/public/posters/avatar_member_elder_son.jpg'
      },
      {
        id: 'member_younger_son',
        relationship: 'younger_son',
        roleLabel: 'Younger Son (Age 7)',
        name: 'Younger Son',
        aliases: ['younger son', 'little son', 'younger boy', 'younger brother', 'little brother', 'second son', '7-year-old', '7yo'],
        age: 7,
        ageBracket: 'Young Child / Primary School (7 Years Old)',
        heightDesc: '3ft 11in (120cm): Head reaches only to older brother\'s shoulder',
        uncompromisableAnchors: 'Warm brown-skinned 7-year-old schoolboy with soft rounded cheeks, expressive playful eyes, wavy dark hair, healthy solid child proportions, head reaches only to his older brother shoulder.',
        visualTraits: '7-year-old young schoolboy, noticeably shorter by a full head, top of head reaches only to his older brother\'s shoulder, soft round youthful child cheeks, playful energetic expression, wavy dark hair, lively child proportions.',
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

function detectRelevantCastMembers(combined = '', cast = null) {
  const c = String(combined || '').toLowerCase();
  const members = (cast && Array.isArray(cast.members)) ? cast.members : [];

  const mentionsCollective = /\b(family|my family|kids|my kids|sons|my sons|both boys|boys|children|11 and 7|11,? 7|road trip with family|vacation with family)\b/i.test(c);
  if (mentionsCollective) {
    return new Set(members.map(m => m.id));
  }

  const detected = new Set();
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
      if (/\b(elder son|older son|older boy|first son|11-year-old|11yo|11 year old|gahan)\b/i.test(c) || (/\bson\b/i.test(c) && !/\byounger|little|7|rishu\b/i.test(c) && !detected.has('member_younger_son'))) {
        detected.add(m.id);
      }
    } else if (m.relationship === 'younger_son') {
      if (/\b(younger son|little son|younger boy|second son|7-year-old|7yo|7 year old|little boy|rishu)\b/i.test(c)) {
        detected.add(m.id);
      }
    } else if (m.relationship === 'spouse') {
      if (/\b(wife|mom|mother|spouse|aru)\b/i.test(c)) {
        detected.add(m.id);
      }
    } else if (m.relationship === 'self') {
      if (/\b(dad|father|husband|shridhar)\b/i.test(c)) {
        detected.add(m.id);
      }
    }
  });

  // 4. Guardian / Accompanying Parent Context:
  // If one of the children is in the scene (e.g. learning cycle, drawing, playing)
  // and the narrative is in first-person ("I remain by his side", "beside him", "support him", "with me", "holding my hand", "I watched him", "I stood"):
  // The accompanying adult is specifically Father / Self (Shridhar), NOT the mother!
  const hasChild = detected.has('member_elder_son') || detected.has('member_younger_son');
  const hasFirstPersonGuardian = /\b(i remain|i am|by my side|by his side|beside him|beside her|with me|holding my hand|teaching him|walked with him|support him|safe from|i watched|i stood|standing beside him|watching him|as i see|as i saw)\b/i.test(c);
  if (hasChild && hasFirstPersonGuardian) {
    detected.add('member_father');
  }

  return detected;
}

function buildFamilyCastDirectives({ familyCast, activeCast, castStaging, userSlant = '', spark = '', countryContext = '' }) {
  const combined = `${userSlant} ${spark}`.toLowerCase();
  const cast = familyCast || getDefaultFamilyCast();
  const detectedIds = detectRelevantCastMembers(combined, cast);

  const hasExplicitCast = activeCast && Array.isArray(activeCast.members) && activeCast.members.length > 0;
  const isFamilyContext = (detectedIds.size > 0);

  if (!isFamilyContext && !hasExplicitCast) {
    return null;
  }

  let activeMembers = [];
  if (hasExplicitCast) {
    activeMembers = activeCast.members;
    // If client sent all 4 members by default, refine to the detected members if detectedIds is non-empty
    if (activeMembers.length > 1 && detectedIds.size > 0 && detectedIds.size < activeMembers.length) {
      const refined = activeMembers.filter(m => detectedIds.has(m.id));
      if (refined.length > 0) activeMembers = refined;
    }
  } else {
    activeMembers = (cast.members || []).filter(m => detectedIds.has(m.id));
  }

  if (activeMembers.length === 0) {
    return null;
  }

  const hasElderBoy = activeMembers.some(m => m.relationship === 'elder_son' || m.age === 11);
  const hasYoungerBoy = activeMembers.some(m => m.relationship === 'younger_son' || m.age === 7);
  const hasFather = activeMembers.some(m => m.relationship === 'self');
  const hasMother = activeMembers.some(m => m.relationship === 'spouse');

  const directives = [];
  const promptSnippets = [];

  const totalCount = activeMembers.length;
  const isSoloProtagonist = (totalCount === 1);
  const soloMember = isSoloProtagonist ? activeMembers[0] : null;
  const maleCount = activeMembers.filter(m => m.relationship === 'self' || m.relationship === 'elder_son' || m.relationship === 'younger_son' || /father|dad|son|boy|brother|male/i.test(`${m.roleLabel} ${m.relationship}`)).length;
  const femaleCount = totalCount - maleCount;

  if (isSoloProtagonist) {
    directives.push(`SOLE PROTAGONIST DIRECTIVE:
- VISIBLE INDIVIDUALS: EXACTLY 1 PERSON (${soloMember.name || soloMember.roleLabel}).
- THE SCENE FOCUSES ENTIRELY ON THIS SINGLE PROTAGONIST.
- STRICT BAN ON EXTRA CHARACTERS: Strictly do NOT draw other family members, parents, or siblings. The scene is solely about ${soloMember.name || soloMember.roleLabel}.`);
    promptSnippets.push(`solo portrait of exactly 1 person: ${soloMember.name || soloMember.roleLabel} as the sole protagonist, strictly no other family members or extra people`);
  } else {
    // 0. Mandatory Exact Headcount & Enumeration
    directives.push(`MANDATORY EXACT HEADCOUNT & ANTI-MERGING DIRECTIVE:
- TOTAL VISIBLE INDIVIDUALS: EXACTLY ${totalCount} DISTINCT PEOPLE (${maleCount} MALES, ${femaleCount} FEMALES).
- ALL ${totalCount} FAMILY MEMBERS MUST BE SIMULTANEOUSLY VISIBLE AND FULLY DRAWN SIDE BY SIDE:
${activeMembers.map((m, i) => `  * Person #${i + 1}: ${m.name || m.roleLabel} (${m.roleLabel || m.relationship}, age ${m.age || 'N/A'})`).join('\n')}
- STRICT BAN ON MERGING / COMPRESSION: Image generation models frequently suffer from "two sons" semantic collapse, mistakenly merging the two boys into a single child and drawing only 3 family members. YOU MUST NEVER MERGE THE TWO SONS! Both sons must be drawn as two separate individual boys. All ${maleCount} male family members (Father, Elder Son, Younger Son) and the Mother must be fully and clearly depicted. Never drop any male member.
- ZERO UNATTACHED FOREGROUND PEOPLE/HANDS: If a ritual action is described (like receiving sacred water or praying), that action MUST be performed by one of the ${totalCount} family members themselves (e.g. the father and boys cupping their hands). Never draw cropped arms/hands of an external 5th person that consumes character slots.`);

    // If no females are in the cast (e.g. Father + Son)
    if (femaleCount === 0 && hasFather) {
      directives.push(`STRICT GUARDIAN GENDER & IDENTITY:
- The accompanying adult guardian in the scene is specifically the ADULT FATHER (Shridhar, mid-40s male with short dark hair and trimmed beard).
- STRICT BAN ON FEMALE GUARDIAN / MOTHER: There is NO mother or woman in this scene. Strictly do NOT draw a female guardian.`);
    }

    promptSnippets.push(`group portrait of exactly ${totalCount} distinct people (${maleCount} males, ${femaleCount} female: ${activeMembers.map(m => m.name || m.roleLabel).join(', ')})${femaleCount === 0 && hasFather ? ', adult father with son, strictly no mother in scene' : ''}`);
  }

  // 1. Strict Age & Height Differentiation
  if (hasElderBoy && hasYoungerBoy) {
    directives.push(`BIOLOGICAL AGE & HEIGHT CONTRAST:
- Unmistakable 4-year age gap between the two brothers:
  * ELDER BROTHER (Age 11): Pre-teen adolescent boy (around 147cm / 4ft 10in). Top of his head reaches only to the chest level of his adult father. Strictly NOT as tall as the father or mother; distinctly a pre-teen child with youthful rounded facial structure and sturdy youth build (not skinny, not frail).
  * YOUNGER BROTHER (Age 7): Young primary school child (around 120cm / 3ft 11in). Noticeably shorter, top of his head reaches only to his older brother shoulder, soft round youthful child cheeks, lively playful child proportions, wavy dark hair.
- STRICT BAN ON CLONING OR ADULT AGING: NEVER draw identical twins, NEVER uniform height! NEVER draw the 11-year-old elder son as tall as an adult or teenager; he must stand distinctly at father chest height with child/pre-teen proportions.`);
    promptSnippets.push('two brothers with distinct 4-year age gap: older 11-year-old pre-teen boy reaching father chest height standing a head taller than his younger 7-year-old brother whose head reaches only older brother shoulder, strictly not twins');
  }

  // 1b. Realistic Authentic Body Statures (Strict Ban on Skinny / Runway Model Bias)
  const statureGuidelines = [];
  activeMembers.forEach(m => {
    if (m.relationship === 'spouse') {
      statureGuidelines.push('- Mother: Draw with an authentic, healthy medium adult build with natural soft shoulders and realistic everyday proportions. STRICTLY NEVER draw an ultra-slim, skinny, or waif-like runway model.');
    } else if (m.relationship === 'elder_son') {
      statureGuidelines.push('- Elder Son (Age 11): Draw with a healthy, sturdy pre-teen build and square shoulders. STRICTLY NEVER draw a skinny, frail, or gaunt boy.');
    } else if (m.relationship === 'younger_son') {
      statureGuidelines.push('- Younger Son (Age 7): Draw with healthy, energetic solid child proportions with soft rounded cheeks.');
    } else if (m.relationship === 'self') {
      statureGuidelines.push('- Father: Draw with a sturdy, broad-shouldered adult build with upright posture.');
    }
  });
  if (statureGuidelines.length > 0) {
    directives.push(`AUTHENTIC REAL-WORLD BODY BUILDS (STRICT BAN ON SKINNY / ULTRA-SLIM BIAS):\n${statureGuidelines.join('\n')}\n- ALL PROTAGONISTS MUST REFLECT AUTHENTIC, HEALTHY, NATURAL REAL-WORLD PROPORTIONS.`);
    promptSnippets.push('authentic natural human proportions: strictly avoid ultra-slim runway models');
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
- DRIVER SEAT: Adult father is seated on the front-right seat with hands holding the steering wheel.
- FRONT PASSENGER SEAT: Adult mother is seated on the front-left seat.
- REAR PASSENGER SEATS: The two boys are seated separately in their own individual rear passenger seats wearing seatbelts (elder 11yo boy by right rear window, younger 7yo boy by left rear window).
- STRICT BAN ON SPATIAL HALLUCINATIONS: Children are NEVER in the driver seat, NEVER holding the steering wheel, NEVER sitting on laps, NEVER crammed multiple people in one seat! Vehicle drives on the left side of the road.`);
      promptSnippets.push('Right-Hand Drive Indian vehicle layout: adult father driving on front-right seat, adult mother in front-left passenger seat, two young boys seated separately in rear seats with seatbelts, no kids in driver seat');
    }
  } else if ((isOverlook || isVehicle) && totalCount > 1) {
    directives.push(`SCENIC ROAD TRIP OVERLOOK COMPOSITION:
- The family vehicle is parked safely on the scenic mountain shoulder or highway viewpoint.
- The family members stand naturally together taking in the landscape.
- Clear, brightly illuminated faces with natural human expressions.`);
    promptSnippets.push('family road trip scenic overlook by parked vehicle: family members standing naturally together admiring the vista');
  }

  // 3. Member-Specific Facial Traits & Visual Likeness Anchors (Face, Hair & Body Stature)
  const memberTraitDirectives = [];
  const anchorDirectives = [];

  activeMembers.forEach(m => {
    const anchors = m.uncompromisableAnchors && String(m.uncompromisableAnchors).trim();
    if (anchors) {
      anchorDirectives.push(`${m.name || m.roleLabel} (${m.roleLabel || m.relationship}): ${anchors}`);
      promptSnippets.push(`STRICT ANCHOR for ${m.name || m.roleLabel}: ${anchors}`);
    }

    const traitParts = [m.visualTraits, m.bodyBuild, m.heightDesc].filter(t => t && String(t).trim()).map(t => String(t).trim());
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

