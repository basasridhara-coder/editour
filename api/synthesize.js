// Serverless Function: /api/synthesize
// Synthesizes raw inputs (Web links, Photos/Clippings, Inner Voice)
// into a complete 3-poster Slant carousel using Gemini 3.8 Flash.

const DEFAULT_KEY_B64 = 'QVEuQWI4Uk42STR5WnQzMEl6NGpLRkQ2SndaYVlSeThQYlVtWXpDYUNuMzU3alIyUU9KbFE=';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || Buffer.from(DEFAULT_KEY_B64, 'base64').toString('utf8');
const GEMINI_MODEL = 'gemini-3.8-flash';

const SUPABASE_URL = 'https://fxfklefnkpmhofncqhfh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4ZmtsZWZua3BtaG9mbmNxaGZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NzM4NzYsImV4cCI6MjEwODA0OTg3Nn0.0nw5ZDvlEsYal6EYXcqyaAPRHoxkXxZgDsNQDppEYgM';
const MASTER_ADMINS = ['shridharoct16@gmail.com', 'basasridhara@gmail.com'];
const STARTER_PERSPECTIVE_CREDITS = 5;
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

async function verifyAndConsumeUserCredit(email, consume = false, isChronicleMode = false) {
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
      const isMaster = MASTER_ADMINS.includes(clean) || Boolean(existing.isUnlimited);
      const isAllowed = isMaster || adminList.includes(clean) || allowedList.includes(clean);
      if (!isAllowed) {
        return { allowed: false, hasCredits: false, credits: null };
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

      const hasCredits = isMaster
        || (isChronicleMode
          ? (chronicleFreeRemainingBefore > 0 || bonusCredits > 0)
          : (perspectiveBaseBefore > 0 || bonusCredits > 0));

      if (hasCredits && consume) {
        if (isChronicleMode) {
          if (!isMaster && chronicleFreeRemainingBefore <= 0 && bonusCredits > 0) {
            bonusCredits = Math.max(0, bonusCredits - 1);
          }
          chronicleUsedToday += 1;
        } else {
          if (!isMaster) {
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
      const perspectiveRemainingToday = isMaster ? 9999 : (perspectiveBaseAfter + bonusCredits);
      const chronicleFreeRemainingToday = Math.max(0, DAILY_CHRONICLE_FREE_LIMIT - chronicleUsedToday);
      const chronicleRemainingToday = isMaster ? 9999 : (chronicleFreeRemainingToday + bonusCredits);

      return {
        allowed: true,
        hasCredits,
        credits: {
          email: clean,
          isUnlimited: isMaster,
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
  return {
    allowed: isMasterFallback,
    hasCredits: isMasterFallback,
    credits: isMasterFallback ? {
      email: clean,
      isUnlimited: true,
      starterTotal: STARTER_PERSPECTIVE_CREDITS,
      starterUsed: 0,
      starterRemaining: STARTER_PERSPECTIVE_CREDITS,
      dailyLimit: DEFAULT_DAILY_CREDIT_LIMIT,
      perspectiveRemainingToday: 9999,
      chronicleRemainingToday: 9999,
      usedToday: 0,
      dailyRemaining: 9999,
      bonusCredits: 0,
      remainingToday: 9999,
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
  return raw === 'shridharoct16@gmail.com' || raw === 'basasridhara@gmail.com';
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

function sanitizeForeignVaultLeakOnServer(cast, userIdentifier) {
  if (!cast || typeof cast !== 'object') return getDefaultFamilyCast(userIdentifier);
  if (isShridharOwnerAccount(userIdentifier)) return cast;
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
      const creditCheck = await verifyAndConsumeUserCredit(userEmail, Boolean(body.isManualRegenerate), Boolean(chronicleMode));
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
          const castProfileId = resolveFamilyCastProfileId(userEmail);
          if (castProfileId) {
            const cResp = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(castProfileId)}&select=data`, {
              headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
            });
            if (cResp.ok) {
              const cRows = await cResp.json();
              if (cRows && cRows[0] && cRows[0].data) {
                familyCast = sanitizeForeignVaultLeakOnServer(cRows[0].data, userEmail);
              }
            }
          }
        } catch (_) {}
      }
      if (!familyCast || !Array.isArray(familyCast.members) || familyCast.members.length === 0) {
        familyCast = getDefaultFamilyCast(userEmail);
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
          preferredVisualSubject
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
${preferredVisualSubject && preferredVisualSubject.title ? `\nCRITICAL CORE VISUAL SUBJECT SELECTED BY CURATOR (HIGHEST PRIORITY):\n- Selected Visual Subject: "${preferredVisualSubject.title}" — ${preferredVisualSubject.description || ''}\n- Build "illustrationPrompt" and "cues" directly around this exact visual subject!${!preferredVisualSubject.isPersonalFamily ? ' Strictly DO NOT depict the author\'s personal family (Shridhar, Aruna, Gahan, Rishu) on a home veranda!' : ''}` : ''}
${validRebuildMomentImgs.length > 0 ? `\nCRITICAL ATTACHED MOMENT PHOTO / LOGO INTEGRATION DIRECTIVE:\n- The curator attached ${validRebuildMomentImgs.length} reference image(s) for specific moment(s) of their Daily Chronicle.\n- Inspect each attached image above and explicitly describe its exact visual graphic, emblem, or scene in "illustrationPrompt" so it is prominently featured inside its corresponding moment vignette (for example, if an attached image is a black fountain-pen nib emblem containing a contemplative upward-tilted portrait face on a cream background for an app-launch moment, explicitly instruct "illustrationPrompt" to display that exact black fountain-pen nib portrait emblem large and crisp on the glowing smartphone screen in that vignette rather than a generic blank screen).` : ''}
${customDirection ? `\nCURATOR'S SPECIFIC VISUAL DIRECTION: "${customDirection}"` : ''}

STRICT RULES:
1. If Father (Shridhar) is in the scene, you MUST describe him as a "mid-age 40-year-old Indian man in his early 40s with a soft fuller round-oval face, full cheeks, full head of thick short dark hair brushed up, neat short dark trimmed stubble beard, and a natural medium-full adult build with a straight-cut everyday waist where his shirt hangs flush with his chest line (strictly neither a skinny V-taper gym body nor a protruding pot-belly, and strictly NOT an elderly or old man)". NEVER call him "fit" or "lean" and NEVER give him an exaggerated protruding belly unless explicitly requested.
2. ${chronicleMode
  ? (chronicleVignetteCount === 2
      ? 'DAILY CHRONICLE 2-SPOT-VIGNETTE LAYOUT (EXACTLY 2 MOMENTS = EXACTLY 2 VIGNETTES, STRICTLY NEVER 3 VIGNETTES!): Present EXACTLY 2 separate, self-contained soft-edged oval watercolor-and-gouache spot-illustration vignettes stacked vertically on open unpainted textured warm cream archival paper: (1) Upper Centered Vignette (~40% of canvas) depicting Moment 01 in full with all mentioned people (e.g. BOTH Shridhar and his male college friend—give the friend a distinct clean-shaven face with glasses, full wavy black hair, and a contrasting shirt so he does not look like a twin of bearded Shridhar!), and (2) Lower Centered Larger Highlight Vignette (~55% of canvas) depicting Moment 02 (the starred highlight moment). STRICT BAN ON 3 VIGNETTES: NEVER split Moment 01 into two upper vignettes! When the family (Father, Mother, and 2 sons) appears together in a vignette, draw EXACTLY 4 PEOPLE TOTAL SHOWN FULL-BODY FROM HEAD TO TOE WITH ALL FEET AND SHOES PLANTED ON THE SAME LEVEL GROUND LINE from left to right: (1st on far left) Father Shridhar (5ft 10in / 178cm, 100% baseline height, in trousers and shoes) -> (2nd from left) Mother Aruna (5ft 4in / 162cm, 91% of Father\'s height, in kurta and sandals) -> (3rd from left) 11yo pre-teen elder son Gahan in dark navy-blue t-shirt, knee-length denim shorts, and sneakers (4ft 8in / 142cm, 88% of Mother Aruna\'s height and 80% of Father\'s height — clearly 8 inches / 20cm SHORTER than Mother Aruna so the top of Gahan\'s head is strictly BELOW Mother\'s chin at her collarbone / upper-shoulder level; strictly NEVER draw Gahan as tall as or taller than Mother!) -> (4th on far right) 7yo younger son Rishu in mustard-yellow t-shirt, dark shorts, and sneakers (4ft 2in / 127cm, 89% of Elder Brother Gahan\'s height and 78% of Mother\'s height — 6 inches / 15cm shorter than Gahan so the top of Rishu\'s head rises above Gahan\'s shoulders to reach Gahan\'s chin/neck level; strictly NEVER draw Rishu equal height with Gahan!).'
      : 'DAILY CHRONICLE 3-SPOT-VIGNETTE LAYOUT: Present 3 separate, self-contained soft-edged oval watercolor-and-gouache spot-illustration vignettes floating on open unpainted textured warm cream archival paper (Top-Left spot vignette ~25%, Top-Right spot vignette ~25%, Bottom-Center larger spot vignette ~45-50% for the starred highlight moment), with wide unpainted cream paper margins separating them. Depict family members or companions ONLY inside the specific moment vignette where they are mentioned (strictly NEVER merge all 3 moments into a single full-bleed background scene!). Whenever both brothers Gahan and Rishu appear, show them full-body from head to toe with shoes on the ground: 11yo pre-teen Gahan in navy t-shirt and denim shorts (4ft 8in / 142cm, 88% of Mother Aruna\'s height and 80% of Father\'s height — clearly 8 inches shorter than Mother so the top of Gahan\'s head is strictly BELOW Mother\'s chin at her collarbone/shoulder level, strictly NEVER as tall as or taller than Mother!) and 7yo younger boy Rishu in mustard-yellow t-shirt and dark shorts (4ft 2in / 127cm, 89% of Gahan\'s height — 6 inches shorter than Gahan so the top of Rishu\'s head rises above Gahan\'s shoulders to reach Gahan\'s chin/neck level).')
  : `If multiple family members are in MANDATORY CASTING VAULT & PROTAGONIST ANCHORS, you MUST include ALL ${familyCastDirectives ? familyCastDirectives.totalCount : ''} family members visibly side by side full-body from head to toe on the same ground line, strictly obeying their pairwise relative stature percentages (11yo Elder Son Gahan at 142cm is 88% of Mother Aruna's 162cm height — 8 inches shorter than Mother with his head strictly below Mother's chin at her collarbone/shoulder level, NEVER taller than Mother; 7yo Younger Son Rishu at 127cm is 89% of Gahan's height with his head reaching Gahan's chin/neck level).`}
3. Output strictly valid JSON:
{
  "illustrationPrompt": "Detailed 80-130 word visual prompt beginning with the exact Medium & Portrayal Style, describing a fresh scene composition, exact protagonists, setting, and lighting. No random text or letters.",
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
      const creditCheck = await verifyAndConsumeUserCredit(userEmail, Boolean(body.isManualRegenerate), Boolean(chronicleMode));
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

    // Endpoint: Get Family Cast Vault Profile (strictly isolated per signed-in user email — zero cross-user fallback!)
    if (body && body.action === 'get_family_cast') {
      const { userIdentifier = '' } = body;
      const profileId = resolveFamilyCastProfileId(userIdentifier);
      if (!profileId) {
        return res.status(200).json({
          success: true,
          cast: getDefaultFamilyCast(userIdentifier)
        });
      }
      try {
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(profileId)}&select=data`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        if (resp.ok) {
          const rows = await resp.json();
          if (rows && rows[0] && rows[0].data) {
            const cleanCast = sanitizeForeignVaultLeakOnServer(rows[0].data, userIdentifier);
            return res.status(200).json({ success: true, cast: cleanCast });
          }
        }
      } catch (err) {
        console.warn('Get family cast error:', err.message);
      }

      return res.status(200).json({
        success: true,
        cast: getDefaultFamilyCast(userIdentifier)
      });
    }

    // Endpoint: Save Family Cast Vault Profile (strictly isolated per signed-in user email)
    if (body && body.action === 'save_family_cast') {
      const { userIdentifier = '', cast } = body;
      const profileId = resolveFamilyCastProfileId(userIdentifier);
      if (!profileId) {
        return res.status(401).json({ success: false, error: 'Sign in required to save Family Cast Vault' });
      }
      const cleanCast = sanitizeForeignVaultLeakOnServer(cast, userIdentifier);
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/posts`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify({ id: profileId, data: cleanCast })
        });
        return res.status(200).json({ success: true, cast: cleanCast });
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

    // Direct Single-Purpose Endpoint: Polish & Review Take with Pedagogical Highlighters + Core Visual Subject Identification
    if (body && (body.action === 'polish_take' || body.action === 'review_take')) {
      const { text = '', slantTake = '', spark = '', scrapedTitle = '', countryContext = 'India' } = body;
      const rawText = String(text || slantTake || '').trim();
      if (!rawText || rawText.length < 5) {
        return res.status(400).json({ error: 'Please enter a take to polish.' });
      }

      // Fast baseline polish using rule-based formatter
      const baselinePolished = formatCuratorTakeApt(rawText);
      const fallbackSubjects = buildFallbackVisualSubjects(rawText, spark, scrapedTitle, countryContext);

      // Call Gemini for high-precision, categorized copy-editing, inline highlighting, and 3 Core Visual Subject options
      try {
        const copyEditPrompt = `You are a world-class literary copy-editor, writing coach, and editorial visual director.
The author has written their personal conviction / take on a topic.
Your job has TWO parts:

PART 1 — COPY-EDIT & POLISH:
Polish their text into grammatically correct, natural, and apt English while detailing every correction made:
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

PART 2 — IDENTIFY 3 CORE VISUAL SUBJECT OPTIONS FOR POSTER 1 ARTWORK:
Understand the true CORE SUBJECT in the given context (Setting: ${countryContext || 'India'}).
- CRITICAL DISTINCTION (SOCIETAL OBSERVATION vs. PERSONAL FAMILY STORY):
  * If the author is observing society, schools, parents in general, workplaces, politics, or culture (even if they use words like "I see", "the whole family comes", "parents", "the kids", "in our school days"), the core visual subject is the REAL-WORLD SCENE BEING DISCUSSED (e.g. a packed school corridor on parent-teacher meeting day with parents debating marks with a 2nd-grade teacher), and "isPersonalFamily" MUST be false!
  * Set "isPersonalFamily": true ONLY if the author is explicitly telling an intimate personal story about their OWN family members ("my family", "my wife", "my kids", "my son", "Gahan", "Rishu", "Aruna").
- Provide 3 distinct, tap-to-choose visual subject angles in "visualSubjects":
  1. Option 1 ("badge": "★ Best Fit • Core Scene"): The direct, concrete real-world scene and protagonists at the heart of the author's context.
  2. Option 2 ("badge": "⚡ Core Contrast"): A visual composition highlighting the central irony, contrast, or tension in the author's argument (e.g. 20-minute debate over 2nd-grade marks vs. the modern AI era).
  3. Option 3 ("badge": "🎨 Editorial Metaphor"): A poignant symbolic or nostalgic visual framing the author's core takeaway.

Author's Raw Take:
"""${rawText}"""
${spark ? `Author's Spark / Catalyst: """${spark}"""` : ''}
${scrapedTitle ? `Source Headline: """${scrapedTitle}"""` : ''}

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
  ],
  "visualSubjects": [
    {
      "id": "subject_1",
      "badge": "★ Best Fit • Core Scene",
      "title": "Short 4-7 word visual subject title",
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
                  badge: String(vs.badge || (idx === 0 ? '★ Best Fit • Core Scene' : (idx === 1 ? '⚡ Core Contrast' : '🎨 Editorial Metaphor'))),
                  title: String(vs.title || fallbackSubjects[idx]?.title || 'Core Editorial Scene').trim(),
                  description: String(vs.description || fallbackSubjects[idx]?.description || '').trim(),
                  cues: Array.isArray(vs.cues) && vs.cues.length >= 3 ? vs.cues.slice(0, 5).map(String) : (fallbackSubjects[idx]?.cues || []),
                  isPersonalFamily: Boolean(vs.isPersonalFamily)
                }))
              : fallbackSubjects;

            return res.status(200).json({
              success: true,
              original: rawText,
              polished: cleanPolished,
              highlightedHtml: highlightedHtml,
              corrections,
              counts,
              visualSubjects
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
            visualSubjects: fallbackSubjects
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
          visualSubjects: fallbackSubjects
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
        visualSubjects: fallbackSubjects
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
    const isExactPhotoOnly = characterRepresentation === 'exact';
    const shouldConsumeVisualCredit = !isTextOnlyRegen && !isExactPhotoOnly;
    const creditCheck = await verifyAndConsumeUserCredit(userEmail, shouldConsumeVisualCredit, Boolean(isChronicle));
    if (!creditCheck.allowed) {
      return res.status(403).json({
        error: '🔒 Private Preview: Your email is not yet on the invited curator whitelist. An access request has been sent to the administrator.'
      });
    }
    if (shouldConsumeVisualCredit && !creditCheck.hasCredits) {
      return res.status(429).json({
        error: isChronicle
          ? '⚡ You have used your 1 free Daily Chronicle visual illustration for today. Tap "Request More Credits" in Studio or switch to Exact Photo!'
          : '⚡ Your Perspective visual illustration credits are used up for today. Tap "Request More Credits" in Studio (text-only generation is always free)!',
        creditsExhausted: true,
        credits: creditCheck.credits
      });
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

    let effectiveFamilyCast = familyCast ? sanitizeForeignVaultLeakOnServer(familyCast, creatorEmail || userEmail) : null;
    if (!effectiveFamilyCast || !Array.isArray(effectiveFamilyCast.members) || effectiveFamilyCast.members.length === 0) {
      try {
        const castProfileId = resolveFamilyCastProfileId(creatorEmail || userEmail);
        if (castProfileId) {
          const cResp = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(castProfileId)}&select=data`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
          });
          if (cResp.ok) {
            const cRows = await cResp.json();
            if (cRows && cRows[0] && cRows[0].data) {
              effectiveFamilyCast = sanitizeForeignVaultLeakOnServer(cRows[0].data, creatorEmail || userEmail);
            }
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
      userEmail: creatorEmail || userEmail,
      spark,
      countryContext,
      sourceType,
      perspectiveMode,
      chronicleMode: Boolean(isChronicle),
      preferredVisualSubject
    });

    const isCinematicPhoto = (characterRepresentation === 'cinematic' || characterRepresentation === 'cinematic_photo' || characterRepresentation === 'likeness' || (Boolean(effectiveCatalystImage || sourceImageBase64) && characterRepresentation !== 'painting' && characterRepresentation !== 'watercolor' && characterRepresentation !== 'exact' && characterRepresentation !== 'silhouette' && characterRepresentation !== 'realistic'));
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
${!preferredVisualSubject.isPersonalFamily ? '- STRICT BAN ON UNRELATED FAMILY PORTRAITS: Because this selected visual subject is a topical/societal/contextual scene and NOT a personal family portrait, strictly DO NOT insert the author\'s personal family members (Shridhar, Aruna, Gahan, Rishu) on a home veranda!' : ''}` : `CRITICAL CORE SUBJECT & CONTEXTUAL SCENE GROUNDING DIRECTIVE (POSTER 1 VISUALS):
- Identify the true CORE SUBJECT in the author's context before composing "illustrationPrompt" and "cues".
- Distinguish sharply between a SOCIETAL / TOPICAL OBSERVATION (e.g. crowded school corridors on Parent-Teacher Meeting days, parents debating 2nd-grade marks with teachers in the age of AI, civic street life, workplace culture) vs. an intimate PERSONAL FAMILY STORY about the author's own household ("my family", "my wife", "my sons Gahan & Rishu").
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
  5. PRIVACY & IDENTITY CONSTRAINT: ${sourceType === 'inner_voice' ? 'DO NOT use real private names, do not use words like "clone", "replica", or "deepfake". Describe them as archetypal human subjects so the photo captures their scene and presence with complete privacy.' : 'When the source is an authentic news article or YouTube video depicting a recognizable public figure, leader, or speaker, describe and name them directly to preserve authentic journalistic context.'}` : ''}
${isArtisticPainting && (effectiveCatalystImage || sourceImageBase64) ? `CRITICAL ARTISTIC BROADSHEET PAINTING DIRECTIVE (PAINTED ARTWORK):
- An authentic real-world photograph is attached. The curator requested Artistic Broadsheet Painting portrayal for Poster 1.
- In "illustrationPrompt", perform an astute visual analysis of the key people visible in the attached photo to describe their physical facial characteristics, hairstyle, age, stature, and clothing:
  1. FACIAL STRUCTURE & FEATURES: Describe the face shape, skin tone, eye shape, gaze, smile or expression.
  2. HAIR & HEAD: Describe haircut, hair texture, part, and color.
  3. RELATIVE STATURE & CLOTHING: Describe the age gap, height difference, clothing colors and styles.
  4. ENVIRONMENT & LIGHTING: Describe the setting bathed in natural midday sunlight.
  5. ARTISTIC MEDIUM: Frame the prompt as an expressive masterpiece editorial painting (e.g. "Warm cinematic editorial gouache and oil painting with rich textures, vivid color grading, lifelike human expression").
  6. PRIVACY & IDENTITY CONSTRAINT: ${sourceType === 'inner_voice' ? 'DO NOT use real private names, do not use words like "clone", "replica", or "deepfake". Describe them as artistic archetypal protagonists so the artwork captures their recognizable essence and warmth while protecting their privacy.' : 'When the source is an authentic news article or YouTube video depicting a recognizable public figure, leader, or speaker, describe and name them directly to preserve authentic journalistic context.'}` : ''}
${isWatercolorIllustration ? `CRITICAL WATERCOLOR ILLUSTRATION DIRECTIVE (HAND-PAINTED WATERCOLOR & INK WASH ON ARCHIVAL PAPER):
- The curator requested Watercolor Illustration portrayal for Poster 1.
- In "illustrationPrompt", frame the scene as a "Masterpiece hand-painted loose watercolor and fine fountain-pen ink-wash editorial illustration on textured warm cream cold-press watercolor paper (#F5EFE2) with soft feathered unpainted cream paper vignette edges and visible wet-on-wet watercolor pigment blooms".
- Expressive pen-and-ink contour sketching filled with airy, translucent watercolor washes where the warm cream watercolor paper shines through the highlights and fades softly into unpainted cream paper around the outer edges.
${(effectiveCatalystImage || sourceImageBase64) ? `- Incorporate the observed facial structure, hairstyle, expressions, clothing colors, and setting from the attached photo into this luminous hand-painted watercolor and ink-wash composition.` : ''}` : ''}
${(!isCinematicPhoto && !isArtisticPainting && !isWatercolorIllustration && characterRepresentation !== 'exact' && characterRepresentation !== 'silhouette') ? `CRITICAL AI ILLUSTRATION (VIVID EDITORIAL REALISM) DIRECTIVE:
- The curator requested AI Illustration (Vivid Editorial Realism) for Poster 1 (the signature Slant broadsheet style).
- In "illustrationPrompt", generate a high-impact editorial broadsheet illustration faithfully capturing the key figures, real-world setting, and dramatic journalistic realism.
${((sourceType === 'digital_link' || sourceType === 'video_audio') && (sourceImageBase64 || sourceImageUrl || scrapedTitle)) ? `- SOURCE GROUNDED PUBLIC FIGURE & NEWS DIRECTIVE:
  * When the source features a recognizable public figure, political leader, speaker, or subject in the thumbnail, headline, or article (e.g. French President Emmanuel Macron, Italian Prime Minister Giorgia Meloni, Actor Ashish Vidyarthi), NAME AND PORTRAY THEM DIRECTLY in the foreground with vivid realistic faces, natural warm lighting on skin tones, balanced studio spotlights, and dramatic journalistic realism.
  * Faithfully ground the background and composition in the real-world scene visible in the source thumbnail or news context (e.g. official press podium, microphones, broadcast studio, civic architecture, armed guard, street protest).
  * STRICT BAN: NEVER replace named public leaders or speakers with anonymous generic strangers! NEVER create pitch-black silhouettes, faceless shadow phantoms, or creepy figures!` : ''}
${(sourceType === 'inner_voice' && effectiveCatalystImage) ? `- INNER VOICE CATALYST PHOTO DIRECTIVE:
  * Faithfully capture the authentic human presence, facial structure, haircut, and warm natural expressions of the people in the attached photo.
  * Frame as high-impact editorial realism with warm natural lighting and genuine human warmth.
  * PRIVACY & SAFETY CONSTRAINT: DO NOT use real private family names, do not use words like "clone", "replica", or "deepfake". Describe them with vivid descriptive attributes protecting private identity.` : ''}` : ''}
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
${validChronicleMoments.map((m, i) => `  * Moment 0${i + 1} (${m.title || 'Moment ' + (i + 1)}${i === starredChronicleIdx ? ' [★ STARRED IMPORTANT HIGHLIGHT OF THE DAY - GIVE EXTRA SHOWCASE SPACE IN POSTER]' : ''}${m.hasPhoto ? ' [Photo Attached]' : ''}): "${m.text}"`).join('\n')}
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
      1) UPPER CENTERED VIGNETTE (~40% of canvas centered across the upper half): Depict the secondary moment (Moment 0${secondaryChronicleMoments[0] ? secondaryChronicleMoments[0].origIdx + 1 : 1}: "${secondaryChronicleMoments[0]?.text || ''}") as a single complete scene showing BOTH the narrator (Shridhar) AND any mentioned friend/colleague/companion visibly interacting together!
      2) LOWER CENTERED LARGER HIGHLIGHT VIGNETTE (~55% of canvas centered across the lower half): Depict the ★ STARRED IMPORTANT MOMENT (Moment 0${starredChronicleIdx + 1}: "${starredChronicleMoment?.text || ''}")!`
      : `- Place the two secondary moments (${secondaryChronicleMoments.map(m => `Moment 0${m.origIdx + 1}: "${m.text}"`).join(' AND ')}) as TWO SEPARATE CLOUDY-SHADED VIGNETTES in the upper half ("In the top-left isolated moment visual (~25% of canvas)...; in the top-right isolated moment visual (~25% of canvas)...").
    - Give the ★ STARRED IMPORTANT MOMENT (Moment 0${starredChronicleIdx + 1}: "${starredChronicleMoment?.text || ''}") MORE SPACE IN THE POSTER by placing it in the LARGER BOTTOM-CENTER CLOUDY-SHADED VIGNETTE (~45-50% of the canvas centered across the lower half)!`}
  * FAMILY WALK / GROUP VIGNETTE HEADCOUNT & PAIRWISE STATURE ALIGNMENT RULE:
    - Whenever the whole family (Father Shridhar, Mother Aruna, Elder Son Gahan, and Younger Son Rishu) appears together in a vignette, you MUST specify FULL-BODY HEAD-TO-TOE FRAMING with all shoes/feet planted on the same ground line from left to right in strict descending height order:
      1) EXACTLY 4 PEOPLE TOTAL SHOWN FULL-BODY FROM HEAD TO TOE: (1st on far left) Adult Father Shridhar (5ft 10in / 178cm, 100% baseline height, in casual polo shirt with no lanyard, trousers, and shoes), (2nd from left) Adult Mother Aruna (5ft 4in / 162cm, 91% of Father's height — 6 inches shorter than Father, top of head at Father's eye/brow level, in kurta and sandals), (3rd from left) 11yo Pre-Teen Elder Son Gahan (4ft 8in / 142cm, 88% of Mother Aruna's height and 80% of Father's height — clearly 8 inches / 20cm SHORTER than Mother Aruna so the top of Gahan's head is strictly BELOW Mother's chin at her collarbone / upper-shoulder level, in a dark navy-blue t-shirt, knee-length denim shorts, and sneakers), and (4th on far right) 7yo Younger Son Rishu (4ft 2in / 127cm, 89% of Elder Brother Gahan's height and 78% of Mother's height — 6 inches / 15cm shorter than Gahan, in a bright mustard-yellow t-shirt, dark shorts, and sneakers) — STRICTLY NEVER 3 CHILDREN!
      2) FULL-BODY WALKING / STANDING SIDE BY SIDE ON THE SAME LEVEL GROUND LINE: All 4 family members must be drawn FULL-BODY FROM HEAD TO TOE with all 8 feet/shoes visibly planted on the same horizontal ground line (STRICTLY NEVER crop them at the thighs/waist and NEVER write "walking ahead" in front of the parents' legs!).
      3) STRICT PAIRWISE STATURE & HEAD-LEVEL LANDMARKS (ELDER SON IS SHORTER THAN MOTHER!): Always specify that 11yo Elder Son Gahan (142cm / 4ft 8in) is 88% of Mother Aruna's height (162cm / 5ft 4in) — clearly 8 inches / 20cm shorter than Mother so the top of Gahan's head reaches Mother's collarbone / upper-shoulder level, strictly BELOW Mother's chin (STRICTLY NEVER draw Gahan as tall as or taller than Mother Aruna!). And always specify that 7yo Younger Son Rishu (127cm / 4ft 2in) is 89% of Elder Brother Gahan's height (6 inches / 15cm shorter than Gahan) so the TOP OF RISHU'S HEAD RISES ABOVE GAHAN'S SHOULDERS to reach Gahan's CHIN / NECK level (strictly NEVER draw Rishu equal height with Gahan!).
      4) DISTINCT COMPANION APPEARANCE IN NON-FAMILY VIGNETTES: When Shridhar meets a male friend or colleague in another vignette, give the friend a distinctly contrasting look (e.g., 38yo man with a full head of wavy black hair, clean-shaven face, eyeglasses, and a light olive or sky-blue button-down shirt) so the image model never clones two identical bearded Shridhars!
  * MANDATORY SITUATION-APPROPRIATE ATTIRE PER MOMENT (NEVER COPY ATTIRE BLINDLY ACROSS VIGNETTES):
    - Whenever the self/protagonist (Shridhar) or any recurring character appears across multiple vignettes, you MUST dress him/them specifically according to the situation, activity, and setting of THAT individual moment!
    - NEVER blindly copy or clone the outfit from one moment's vignette into another moment's vignette! For example: if one moment is a uniformed march/parade (such as RSS Pathasanchalan), dress him in the exact march uniform (crisp white full-sleeve shirt, khaki trousers, black RSS cap, bamboo danda); if another moment is working at a desk/laptop/cafe, dress him in smart casual workwear (such as a rolled-sleeve button-down shirt); if another moment is sports/exercise, dress him in athletic wear; if another moment is at home or a festive family moment, dress him in comfortable home or festive attire (such as a kurta or casual home shirt). Explicitly specify his distinct, context-appropriate outfit inside each vignette description!
  * STRICT BAN ON CRISP BORDERS, WATER-STAIN PUDDLE RINGS, OR STRAIGHT VERTICAL EDGES: Never draw sharp cutout outlines, hard wet-on-dry watercolor puddle perimeter lines, or straight vertical building/frame borders around any moment visual! Every vignette's outer shading must be a soft, diffuse, dry-brush cloud gradient that fades smoothly into the warm textured parchment paper. Never merge the moments into a single full-bleed scene.
  * STRICT BAN ON PRINTED LABELS OR CAPTIONS: Do NOT write numbered titles like "Moment 01:" or "Scene 1:" inside "illustrationPrompt" (as image models will print those words as text captions onto the painting!). Whenever the narrator (Shridhar) appears in a vignette, portray him as a mid-age 40-year-old Indian man in his early 40s with a soft fuller round-oval face, full cheeks, full head of thick short dark hair brushed up, neat short dark trimmed stubble beard, and a natural medium-full adult build with a straight-cut everyday waist where his shirt hangs flush with his chest line (strictly neither a skinny V-taper gym body nor an exaggerated protruding pot-belly, and strictly NOT old or elderly), and depict any family members, colleagues, friends, or companions ONLY inside the specific vignette where they are mentioned!
  * BALANCING CANDID MOMENT (MID-SHOT) vs. GROUP SCALE (WIDER FRAMING):
    - Do NOT force full-body head-to-toe framing on every scene! Choose the shot framing that best captures the emotional heart and candidness of each moment:
      1) INTIMATE / CONVERSATIONAL / SEATED / SOLO MOMENTS (1-2 people meeting a friend over chai, talking at a table/breezeway, reading a book, working at a desk, or sharing a quiet conversation): Use an expressive CANDID MEDIUM SHOT / MID-SHOT (waist-up or chest-up, 35mm-50mm lens) that foregrounds warm facial expressions, eye contact, hand gestures (holding chai cups, a book, etc.), and upper-body/midsection build.
      2) ACTIVE MOVEMENT OR 3-4+ PERSON GROUP SCENES (e.g. 4-person family evening walk, march, outdoor activity): Use a pulled-back three-quarter or wide shot (with generous left/right margins inside the vignette) ONLY when the action itself is about walking/movement or when fitting 3-4+ people side-by-side requires zooming out so no character is clipped or dropped at the edge—while still keeping their faces and interactions natural and candid.
  * DYNAMIC POSTURE-ADJUSTED RELATIVE HEIGHT RULE: Always adjust visual head-height comparisons based on each character's action/posture in that scene (Standing = 1.00x of base height, Leaning = 0.88x, Sitting on chair/sofa/bench = 0.72x, Kneeling/Crouching = 0.64x, Sitting on floor = 0.52x). For example, if Father (178cm / 1.00x base) is sitting in a chair (0.72x effective height = ~128cm) while 11yo Elder Son Gahan (142cm / 0.80x base) is standing beside him (0.80x effective height = 142cm), explicitly state that standing Gahan's head rises ~11% ABOVE seated Father's head!
  * CRITICAL ATTACHED MOMENT PHOTO / LOGO INTEGRATION RULE:
    Whenever a Moment has [Photo Attached], inspect the attached image for that moment and weave it MEANINGFULLY and PROMINENTLY into that specific moment's isolated vignette:
    - If the attached image is an app logo, brand emblem, or icon (for example, a black fountain-pen nib emblem containing a contemplative upward-tilted portrait face on a cream background) and the moment describes building or soft-launching an app, explicitly instruct "illustrationPrompt" to show Shridhar at his desk inside that moment's vignette holding a smartphone or laptop displaying that EXACT attached emblem/logo crisp and unmistakable on the screen.
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
        sourceLedger,
        isChronicle,
        validChronicleMoments
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
    const cleanedExcerpts = rawExcerpts.map(e => {
      let s = String(e).replace(/^(the spark|curator stance|paragraph \d+)\s*:\s*["']?/i, '').replace(/["']?$/i, '').trim();
      if (isChronicle) {
        s = s.replace(/^0?\d+\s*[·•.-]\s*(?=Moment\s+\d+)/i, '');
      }
      return s;
    });
    const cleanedSummary = isChronicle
      ? String(parsed.summary || '').replace(/(^|\n\s*)0?\d+\s*[·•.-]\s*(?=Moment\s+\d+)/gi, '$1')
      : (parsed.summary || '');

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
      credits: creditCheck.credits
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
    'huang', 'minister', 'president', 'judge', 'justice', 'officer', 'sweeper',
    'curator', 'citizen', 'woman', 'man', 'girl', 'boy', 'leader', 'doctor',
    'worker', 'protagonist', 'figure', 'person', 'individual', 'portrait', 'lookalike',
    'founder', 'engineer', 'entrepreneur', 'student', 'youth', 'actor', 'author', 'critic', 'analyst', 'politician',
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

  // Prevent companion/friend twin-cloning & feature bleeding:
  // For any unknown supporting person (college friend/buddy/pal/colleague) whose visual traits are not in the Vault,
  // keep them at a standard MEDIUM BUILD with a flat/neutral midsection and clean-shaven contrasting face so they NEVER inherit Shridhar's fuller build, tummy, or beard!
  const unknownCompanionDesc = 'a college friend (38yo Indian man with a standard balanced MEDIUM BUILD and flat neutral midsection — strictly NOT sharing Shridhar\'s fuller build or rounded tummy — a completely CLEAN-SHAVEN face with zero beard or stubble, neat side-parted wavy black hair, modern eyeglasses, and an olive-green collared shirt, visually distinct from bearded fuller-built Shridhar)';
  enhancedPrompt = enhancedPrompt
    .replace(/\ban?\s+(?:old\s+|male\s+)?college\s+(?:pal|friend|buddy|mate)(?!\s*\()/gi, unknownCompanionDesc)
    .replace(/\ba\s+(?:male\s+)?(?:office\s+|work\s+)?(?:colleague|coworker|friend|buddy|pal)(?!\s*\()/gi, unknownCompanionDesc);

  if (/\b(college friend|college buddy|college pal|colleague|coworker)\b/i.test(enhancedPrompt) && !enhancedPrompt.includes('UNKNOWN SUPPORTING PERSON MEDIUM-BUILD RULE')) {
    enhancedPrompt += '. UNKNOWN SUPPORTING PERSON MEDIUM-BUILD & ANTI-CLONE RULE: Any companion, friend, or colleague whose traits are not from the Family Vault MUST be drawn with a standard balanced MEDIUM BUILD (flat neutral midsection) and a completely CLEAN-SHAVEN face—strictly NEVER copy or bleed Shridhar\'s fuller build, rounded tummy, hairstyle, or stubble beard onto the friend!';
  }

  // If the LLM placed the 4-person family walk inside a narrow Top-Left or Top-Right 25% vignette while putting a solo scene in Bottom-Center,
  // deterministically swap them so the 4-person family walk ALWAYS gets the wide Bottom-Center Highlight Vignette (~50% width) where all 4 people (including Father Shridhar!) fit side by side!
  const topRightBottomSwapMatch = enhancedPrompt.match(/(Top-Right(?:\s+Spot)?\s+Vignette:\s*)([\s\S]*?)(\s*Bottom-Center(?:\s+(?:Larger\s+|Highlight\s+|Showcase\s+)*)?Vignette:\s*)([\s\S]*?)(?=\.\s*(?:Ensure|PROTAGONIST|Mother|STRICT|MANDATORY|$))/i);
  if (topRightBottomSwapMatch) {
    const topRightBody = topRightBottomSwapMatch[2];
    const bottomCenterBody = topRightBottomSwapMatch[4];
    const topRightIsFamilyWalk = /\b(aruna|wife|mother)\b/i.test(topRightBody) && /\b(gahan|rishu|sons|kids|family)\b/i.test(topRightBody);
    const bottomCenterIsFamilyWalk = /\b(aruna|wife|mother)\b/i.test(bottomCenterBody) && /\b(gahan|rishu|sons|kids|family)\b/i.test(bottomCenterBody);
    if (topRightIsFamilyWalk && !bottomCenterIsFamilyWalk) {
      enhancedPrompt = enhancedPrompt.replace(
        topRightBottomSwapMatch[0],
        `${topRightBottomSwapMatch[1]}${bottomCenterBody.trim().replace(/\.$/, '')}.${topRightBottomSwapMatch[3]}${topRightBody.trim()}`
      );
    }
  }

  // Resolve Father (Shridhar) structured midsection/tummy profile up front so all group, solo, and chronicle blocks use the exact Vault selection
  const activeCastList = (activeCast && Array.isArray(activeCast.members) && activeCast.members.length > 0)
    ? activeCast.members
    : ((familyCast && Array.isArray(familyCast.members))
        ? familyCast.members.filter(m => m && detectRelevantCastMembers(enhancedPrompt, familyCast).has(m.id))
        : []);
  const selfMemberObj = activeCastList.find(m => m && (m.id === 'member_father' || m.relationship === 'self'))
    || (familyCast && Array.isArray(familyCast.members) ? familyCast.members.find(m => m && (m.id === 'member_father' || m.relationship === 'self')) : null);
  const selfTummy = (selfMemberObj && selfMemberObj.structuredTraits && selfMemberObj.structuredTraits.tummyProfile) || 'subtle_10';
  const selfVolume = (selfMemberObj && selfMemberObj.structuredTraits && selfMemberObj.structuredTraits.bodyVolume) || 'broad_full';
  const fatherBuildPhrase = getFatherMidsectionDescription(selfTummy, selfVolume);

  // Deterministically normalize any full-family walk/group description so that:
  // 1) All 4 family members (Father Shridhar, Mother Aruna, Elder Son Gahan, Younger Son Rishu) are ALWAYS present (Father is NEVER dropped!)
  // 2) Parents (Father Shridhar & Mother Aruna) stand together on the left half, and BOTH BROTHERS (Gahan & Rishu) stand DIRECTLY BESIDE EACH OTHER on the right half (never separated by Mother!)
  // 3) Both boys walk hands-free with arms relaxed at their sides (never holding hands like toddlers, which causes image models to shrink the younger boy!)
  // 4) Pairwise Heights from Actual Stature: Father (178cm / 5'10", 100%) -> Mother Aruna (162cm / 5'4", 91% of Father) -> Elder Son Gahan (142cm / 4'8", 88% of Mother's height & 80% of Father's height — clearly 8 inches / 20cm SHORTER than Mother so the top of Gahan's head is strictly BELOW Mother's chin at her collarbone/shoulder level, NEVER taller than Mother!) -> Younger Son Rishu (127cm / 4'2", 89% of Gahan's height — 6 inches shorter than Gahan so the top of Rishu's head rises above Gahan's shoulders to reach Gahan's chin/neck level!)
  const canonicalFourFamilyWalkBlock = `ZOOMED-OUT 24MM WIDE-ANGLE ESTABLISHING SHOT (camera pulled back 18-20 feet so all 4 full-body people fit comfortably inside the center 65% of the vignette width with generous open walkway/foliage margins on the left, right, top, and bottom so NO person is ever clipped or dropped at the edge): Strictly 4 people total shown FULL-BODY FROM HEAD TO TOE with all 8 feet/shoes planted on the exact same level ground line, walking SIDE BY SIDE in a single horizontal row facing forward in strict descending height order, with the 2 Parents together on the left side and the 2 Brothers standing directly beside each other on the right side: - 1st on far left: Father Shridhar (40yo mid-age bearded Indian man with a soft fuller round-oval face, full cheeks and natural under-chin fullness, ${fatherBuildPhrase}, wearing a casual polo shirt with no lanyard, chinos, and shoes, 5ft 10in / 178cm, 100% reference height). - 2nd from left (walking beside Father): Mother Aruna (36yo Indian woman with a soft fuller round-oval maternal face, warm golden-brown skin, small black circular forehead bindi, subtle red kumkum at her hairline, and thick side-parted wavy black hair swept over her left shoulder, wearing a teal/sage cotton kurta and sandals, 5ft 4in / 162cm, 91% of Father's height — top of her head reaching Father's eye/brow level, and clearly 8 inches / 20cm TALLER than Elder Son Gahan). - 3rd from left (walking beside Mother on the right half, hands-free with arms relaxed at his sides): Elder son Gahan (11yo Indian pre-teen boy with a gentle oval face, wearing a solid dark navy-blue t-shirt, knee-length denim shorts, and sneakers; 4ft 8in / 142cm, 88% of Mother Aruna's height and 80% of Father's height — Gahan is clearly 8 inches / 20cm SHORTER than his Mother Aruna so the top of Gahan's head is strictly BELOW Mother's chin at her collarbone / upper-shoulder level; strictly NEVER draw Gahan as tall as or taller than Mother Aruna!). - 4th on far right (walking DIRECTLY BESIDE GAHAN shoulder-to-shoulder on the far right, hands-free with arms relaxed at his sides, NEVER separated from Gahan and NEVER holding hands): Younger son Rishu (7yo Indian schoolboy with a round cheerful face, wearing a solid mustard-yellow t-shirt, dark shorts, and sneakers; 4ft 2in / 127cm, 89% of Elder Brother Gahan's height and 78% of Mother's height — 6 inches / 15cm shorter than Gahan so the TOP OF RISHU'S HEAD RISES ABOVE GAHAN'S SHOULDERS to reach Gahan's CHIN / NECK level; strictly NEVER draw Rishu's head below Gahan's shoulders or equal height with Gahan!).`;

  enhancedPrompt = enhancedPrompt
    .replace(/Exactly 4 family members walk side-by-side[^.]*\./i, canonicalFourFamilyWalkBlock)
    .replace(/from left to right in a clear 4-step descending height staircase,[\s\S]*?dark shorts,\s*and\s*sneakers\)\./i, canonicalFourFamilyWalkBlock)
    .replace(/(?:Full-body\s+)?(?:twilight|evening|night|post-dinner)?\s*(?:stroll|walk)[^.]*?\b(?:Aruna|wife)\b[^.]*?\bGahan\b[^.]*?\bRishu\b[^.]*\./i, `Full-body evening stroll along a tree-lined neighborhood lane under warm streetlamps: ${canonicalFourFamilyWalkBlock}`)
    .replace(/nearly as tall as (?:his )?Mother(?: Aruna)?[—,\s-]*(?:so )?(?:the )?(?:top of Gahan(?:'s)? head |head )?reach(?:ing|es)(?: right up to)? (?:his )?Mother(?: Aruna)?(?:'s)? ear\s*\/\s*eye level(?: and Father(?:'s)? shoulder(?: level)?)?/gi, '88% of Mother Aruna\'s height (8 inches / 20cm shorter than Mother so the top of Gahan\'s head is strictly BELOW Mother\'s chin at her collarbone/upper-shoulder level, strictly NEVER as tall as or taller than Mother)')
    .replace(/top of (?:Gahan(?:'s)? )?head reach(?:ing|es)(?: right up to)? (?:his )?Mother(?: Aruna)?(?:'s)? ear\s*\/\s*eye level(?: and Father(?:'s)? shoulder(?: level)?)?/gi, 'top of Gahan\'s head is strictly BELOW Mother Aruna\'s chin at her collarbone/upper-shoulder level (88% of Mother\'s height, 8 inches shorter than Mother)')
    .replace(/\b0\.8[56]x\s+Father\s+height/gi, '4ft 8in / 142cm (88% of Mother\'s height, 80% of Father\'s height)');

  // If Gahan and Rishu were written with shorthand (without canonical block), expand ONLY their first subject occurrence (non-global /i so "Gahan's neck" is never corrupted!)
  if (!enhancedPrompt.includes('walking DIRECTLY BESIDE GAHAN shoulder-to-shoulder')) {
    enhancedPrompt = enhancedPrompt
      .replace(
        /\b(?:tall\s+)?(?:11(?:\s*-?\s*year\s*-?\s*old|yo)\s+)?(?:pre-teen\s+)?(?:elder\s+|older\s+)?(?:son\s+|brother\s+|boy\s+)?Gahan(?:\s*\([^)]*\))?(?:\s+in\s+navy(?:-blue)?\s+t-shirt)?(?:\s+reaching\s+Mother(?:'s)?\s+(?:ear|chin)(?:\/chin|\/ear)?)?/i,
        'Elder son Gahan (11yo Indian pre-teen boy with a gentle oval face, wearing a solid dark navy-blue t-shirt, knee-length denim shorts, and sneakers; 4ft 8in / 142cm, 88% of Mother Aruna\'s height and 80% of Father\'s height — clearly 8 inches / 20cm shorter than Mother Aruna so the top of Gahan\'s head is strictly BELOW Mother\'s chin at her collarbone / upper-shoulder level, strictly NEVER as tall as or taller than Mother!)'
      )
      .replace(
        /\b(?:tall\s+)?(?:7(?:\s*-?\s*year\s*-?\s*old|yo)\s+)?(?:younger\s+|little\s+)?(?:son\s+|brother\s+|schoolboy\s+|boy\s+)?Rishu(?:\s*\([^)]*\))?(?:\s+in\s+(?:mustard(?:-yellow)?|green)\s+t-shirt)?(?:\s+reaching\s+Gahan(?:'s)?\s+neck(?:\/chin)?)?/i,
        'Younger son Rishu (standing directly beside Gahan shoulder-to-shoulder on the far right, hands-free; 7yo Indian schoolboy with a round cheerful face, wearing a solid mustard-yellow t-shirt, dark shorts, and sneakers; 4ft 2in / 127cm, 89% of Elder Brother Gahan\'s height—6 inches / 15cm shorter than Gahan—so the TOP OF RISHU\'S HEAD RISES ABOVE GAHAN\'S SHOULDERS to sit directly level with elder brother Gahan\'s CHIN / NECK level; strictly NEVER draw Rishu\'s head below Gahan\'s shoulders or equal height with Gahan!)'
      );
  }

  // Detect family context with 2 sons or family group (strictly requires explicit family cast or personal first-person context)
  const isSingleProtagonist = /\b(sole protagonist|exactly one protagonist|single protagonist|lone protagonist)\b/i.test(enhancedPrompt);
  const hasTwoSons = !isSingleProtagonist && /\b(two sons|2 sons|both boys|two boys|elder son.*younger son|elder brother.*younger brother|gahan.*rishu|rishu.*gahan)\b/i.test(enhancedPrompt);
  const hasExplicitFamilyGroup = !isSingleProtagonist && /\b(whole family|entire family|all 4 of us|all four of us|family of four|family portrait|parents and children|with my wife and kids|with my family|me, wife and 2 sons|road trip with my family)\b/i.test(enhancedPrompt);
  const hasFamilyContext = hasTwoSons || hasExplicitFamilyGroup;
  const isIndianFamilyCast = (!countryContext || /india/i.test(countryContext));

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
  if (isIndianFamilyCast && hasTwoSons && !enhancedPrompt.includes('STRICT 2-BOY HEADCOUNT & NECK-HEIGHT LOCK')) {
    enhancedPrompt += '. STRICT 2-BOY HEADCOUNT, ZOOMED-OUT WIDE-ANGLE FRAMING & PAIRWISE HEIGHT LOCK: For the family group scene, pull the camera back into a ZOOMED-OUT 24MM WIDE-ANGLE ESTABLISHING SHOT (18-20 feet away) with generous open walkway/park margins on the left, right, top, and bottom so all 4 full-body people fit effortlessly inside the center 65% of the vignette without anyone being clipped or dropped at the edge. Draw EXACTLY 4 FAMILY MEMBERS TOTAL (1 Adult Father Shridhar, 1 Adult Mother Aruna, and EXACTLY 2 SONS — 1 boy in dark navy-blue t-shirt and denim shorts, and 1 boy in mustard-yellow t-shirt and dark shorts; STRICTLY NEVER DRAW 3 CHILDREN OR DROP FATHER!). Arrange all 4 family members walking/standing SIDE BY SIDE in a single horizontal row on the same level ground line from left to right in strict descending height order, with the 2 Parents together on the left side and the 2 Brothers standing DIRECTLY BESIDE EACH OTHER shoulder-to-shoulder on the right side (never place Mother between the two boys, and never have the boys holding hands!): (1st on far left - 5ft 10in / 178cm, 100% reference height) Father Shridhar; (2nd from left beside Father - 5ft 4in / 162cm, 91% of Father\'s height) Mother Aruna standing at Father\'s eye/brow level; (3rd from left beside Mother - 4ft 8in / 142cm, 88% of Mother\'s height and 80% of Father\'s height) Elder Son Gahan (11yo Indian pre-teen boy with a gentle oval face in a dark navy-blue t-shirt and denim shorts, hands-free) who is clearly 8 inches / 20cm SHORTER than Mother Aruna so the top of Gahan\'s head is strictly BELOW Mother\'s chin at her collarbone / upper-shoulder level (STRICTLY NEVER draw Gahan as tall as or taller than Mother Aruna!); (4th on far right standing DIRECTLY BESIDE GAHAN shoulder-to-shoulder - 4ft 2in / 127cm, 89% of Gahan\'s height) Younger Son Rishu (7yo Indian schoolboy with a round cheerful face in a bright mustard-yellow t-shirt and dark shorts, hands-free) who is 6 inches / 15cm shorter than Gahan so the TOP OF RISHU\'S HEAD RISES ABOVE GAHAN\'S SHOULDERS to sit directly level with GAHAN\'S CHIN / NECK level (strictly NEVER draw Rishu\'s head below Gahan\'s shoulders or equal height with Gahan!).';
  }

  // If 2+ activeCast members are present (even when Father is NOT in the picture, e.g. Mother + Elder Son, or Elder Son + Younger Son), enforce exact pairwise stature relative to the tallest member in the scene!
  if (activeCastList.length >= 2) {
    const pairwiseSceneLock = buildDynamicPairwiseStatureDirective(activeCastList, activeCastList);
    if (pairwiseSceneLock && !enhancedPrompt.includes('SCENE-RELATIVE & PAIRWISE ACTUAL HEIGHT CALCULATOR')) {
      enhancedPrompt += `. ${pairwiseSceneLock.blockText.replace(/\n+/g, ' ')}`;
    }
  }

  // Enforce Solo / Active Cast Father (Shridhar, Age 40 Mid-Age) & Prevent Elderly Hallucinations
  const hasSelfInActiveCast = activeCastList.some(m => m && (m.id === 'member_father' || m.relationship === 'self'));
  const mentionsFatherOrSelf = hasSelfInActiveCast || /\b(shridhar|father\s*\(shridhar\)|indian father figure|member_father)\b/i.test(enhancedPrompt);

  if (mentionsFatherOrSelf) {
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

  // Encyclopedic Uniform & Cultural Accuracy Enforcer for RSS / Swayamsevak / Pathasanchalan
  if (/\b(rss|swayamsevak|swayamsevaks|pathasanchalan|ganavesh)\b/i.test(enhancedPrompt)) {
    enhancedPrompt = enhancedPrompt
      .replace(/\b(?:short-sleeved|half-sleeved)\s+white\s+(?:collared\s+)?shirts?\b/gi, 'full-sleeved long-sleeved white buttoned collared shirts with full sleeves down to the wrists')
      .replace(/\bblack\s+side\s+caps?\b/gi, 'traditional Indian foldable boat-shaped black cloth Kali Topi caps (Gandhi-cap boat geometry worn straight on the head, strictly NOT round military berets and strictly NO metal badges or insignia on the caps)')
      .replace(/\b(?:holding|carrying)\s+(?:traditional\s+)?(?:polished\s+)?wooden\s+lathis?\b/gi, 'carrying plain unadorned wooden bamboo staffs (dandas) resting at a 45-degree angle on their right shoulders (strictly plain bamboo sticks with NO flags tied or mounted on the staffs)');
    if (!/strictly NOT round military berets/i.test(enhancedPrompt)) {
      enhancedPrompt += '. AUTHENTIC RSS GANAVESH UNIFORM SPECIFICATION (INCLUDING PROTAGONIST): Every participant in the RSS Pathasanchalan march — including the protagonist Shridhar himself when he is part of the march — MUST wear the exact same complete RSS Ganavesh uniform (strictly NEVER dress the protagonist in a civilian kurta or different shirt in the march scene!): full-sleeved (long-sleeved down to the wrists) plain white buttoned shirts tucked into khaki-brown full trousers with a simple waist belt ONLY (strictly NO short sleeves, strictly NO diagonal cross-shoulder police straps, strictly NO red neck scarves), traditional Indian foldable boat-shaped black cloth caps (Gandhi-cap boat geometry with pointed front-to-back crease worn straight on the head, strictly NOT round military/police berets and strictly NO metal badges or emblems on the front of the cap), carrying plain wooden bamboo staffs (dandas) resting on their right shoulders with strictly NO flags attached to the staffs.';
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
    enhancedPrompt += `. MANDATORY CLOUDY-SHADED WATERCOLOR VIGNETTE STYLE WITH DYNAMIC MOMENT-MATCHED HALOS & SITUATIONAL ATTIRE: Render in warm editorial watercolor and gouache on warm textured vintage cream-buff parchment paper (#EDE3D0) with visible organic paper grain. Present ${vigCountLabel} where each moment is surrounded by a soft, blurry, feathered dry-brush cloud gradient halo in a subtle, muted watercolor tint tailored to that moment's mood and setting (such as warm ochre/amber, muted sage/olive, gentle dusty slate-blue, soft rose-sienna, or sandalwood, kept understated so it never overpowers the moment's subjects) whose outer edges smoothly fade to zero opacity into the warm parchment paper. Dress the self/protagonist in distinct, situation-appropriate attire for each individual moment (never blindly copying one moment's outfit to another moment). STRICT BAN on crisp vignette borders, hard water-stain puddle perimeter rings, straight vertical/rectangular frame edges, stark white paper, or merged full-bleed scenes.`;
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
              ? `CRITICAL VISUAL GROUNDING FOR THIS VIGNETTE (${m.title || 'Moment ' + mIdx}: "${m.text || ''}"${m.isStarred ? ' [★ STARRED IMPORTANT MOMENT - PLACE IN LARGE ~50% LOWER PANORAMIC SHOWCASE VIGNETTE]' : ''}): The user attached this book cover photo for this moment. In its dedicated vignette, show the protagonist Shridhar (with his uncovered full head of thick short jet-black hair — strictly NO hat, cap, or headgear on Shridhar's head!) holding open and reading a physical book whose front cover faithfully displays this attached yellow book cover illustration.`
              : `CRITICAL VISUAL GROUNDING FOR THIS VIGNETTE (${m.title || 'Moment ' + mIdx}: "${m.text || ''}"${m.isStarred ? ' [★ STARRED IMPORTANT MOMENT - PLACE IN LARGE ~50% LOWER PANORAMIC SHOWCASE VIGNETTE]' : ''}): You MUST prominently and faithfully incorporate the exact visual subject, objects, and composition of this attached Reference Photo as the centerpiece of its dedicated vignette.`)
      });
    });
    parts.push({
      text: `Create a masterpiece ${effectiveChronicleVignetteCount}-vignette editorial watercolor and gouache illustration page on warm textured vintage cream-buff parchment paper (#EDE3D0) with visible organic paper grain, featuring EXACTLY ${effectiveChronicleVignetteCount} separate, self-contained moment visuals (${effectiveChronicleVignetteCount === 2 ? '1 Upper Vignette + 1 Lower Vignette stacked vertically — STRICTLY ONLY 2 VIGNETTES TOTAL, NEVER 3 VIGNETTES!' : '3 separate vignettes'}) where each moment is surrounded by a soft, blurry, feathered dry-brush cloud gradient halo in a subtle, muted watercolor tint suited to that moment's mood (always understated so it never takes attention away from the moment) whose outer edges smoothly fade to zero opacity into the warm parchment paper (STRICTLY NO crisp vignette borders, NO hard water-stain puddle perimeter rings, NO straight vertical or rectangular frame edges, NOT a single merged full-bleed background scene, and strictly zero printed captions or labels): ${enhancedPrompt}. Ensure the self/protagonist (Father Shridhar, mid-age 40-year-old Indian man with a soft fuller round-oval face, full cheeks, thick short dark hair, neat dark stubble beard, and ${fatherBuildPhrase}) is dressed in situation-appropriate attire specific to each individual moment rather than copying the same outfit across moments, and keep all family members and companions strictly inside their respective moment's cloudy-shaded vignette. Faithfully display the attached Reference Photo/Logo inside its corresponding vignette. ${textureStyle}, masterwork, strictly no printed captions, no numbers, and no random background words.`
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
        const candidate = data.candidates?.[0];
        const inlinePart = candidate?.content?.parts?.find(p => p.inlineData);
        if (inlinePart && inlinePart.inlineData && inlinePart.inlineData.data) {
          return `data:${inlinePart.inlineData.mimeType || 'image/png'};base64,${inlinePart.inlineData.data}`;
        }
        if (candidate?.finishReason === 'IMAGE_OTHER' || candidate?.finishReason === 'SAFETY') {
          console.warn(`Gemini image model ${model} blocked reference photo with ${candidate.finishReason}, falling back to text prompt immediately`);
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

  // If image-conditioned attempt returned nothing (e.g. policy block / IMAGE_OTHER on real faces), fallback to text prompt
  if (resolvedBase64 || (stylizedAvatars && stylizedAvatars.length > 0)) {
    return generateGeminiEditorialArtwork({ prompt, imageBase64: null, timeoutMs, stylizedAvatars: null, countryContext });
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

function buildFallbackVisualSubjects(rawText = '', spark = '', scrapedTitle = '', countryContext = 'India') {
  const combined = `${rawText} ${spark} ${scrapedTitle}`.toLowerCase();
  const isPersonalFamily = /\b(my family|our family|my whole family|our whole family|my kids|our kids|my sons|our sons|my boys|our boys|my children|our children|my wife|my elder son|my younger son|gahan|rishu|aruna|shridhar)\b/i.test(combined);

  if (/\b(parent-teacher|ptm|report card|marks|second-grade|school days|teachers' meeting|school|classroom)\b/i.test(combined)) {
    return [
      {
        id: 'subject_1',
        badge: '★ Best Fit • Core Scene',
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
        badge: '⚡ Core Contrast',
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
        badge: '🎨 Editorial Metaphor',
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
      badge: '★ Best Fit • Core Scene',
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
      badge: '⚡ Core Contrast',
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
      badge: '🎨 Editorial Metaphor',
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
  const rawMembers = (cast && Array.isArray(cast.members)) ? cast.members : [];
  const members = rawMembers.filter(m => m && (
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
  const mentionsCollective = /\b(my family|our family|my whole family|our whole family|my entire family|our entire family|the four of us|all four of us|my kids|our kids|both my kids|both our kids|my sons|our sons|both my sons|both our sons|both my boys|both our boys|my boys|our boys|my children|our children|road trip with my family|vacation with my family|walk.*with my family)\b/i.test(c);
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

    // 3. Role-specific semantic keywords (STRICTLY first-person personal possessives or explicit family names)
    if (m.relationship === 'elder_son') {
      if (/\b(my elder son|my older son|my older boy|my first son|my 11-year-old|my 11yo|gahan|my kids|our kids|my boys|our boys|my sons|our sons|my children|our children)\b/i.test(c)) {
        detected.add(m.id);
      }
    } else if (m.relationship === 'younger_son') {
      if (/\b(my younger son|my little son|my younger boy|my second son|my 7-year-old|my 7yo|rishu|my kids|our kids|my boys|our boys|my sons|our sons|my children|our children)\b/i.test(c)) {
        detected.add(m.id);
      }
    } else if (m.relationship === 'spouse') {
      if (/\b(my wife|my spouse|with my wife|aru|aruna)\b/i.test(c)) {
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
  const hasFirstPersonCoPresence = /\b(and me|with me|between .* and me|i remain|by my side|by his side|beside him|beside her|holding my hand|teaching him|walked with him|support him|i stood|standing beside|my home|my life|attended|launched)\b/i.test(c);
  if ((hasChild || hasSpouse) && hasFirstPersonCoPresence) {
    detected.add('member_father');
  }

  if (options && options.chronicleMode && detected.size === 0) {
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

  if (activeMembers.length === 0) {
    return null;
  }

  const hasElderBoy = activeMembers.some(m => m.relationship === 'elder_son' || m.age === 11);
  const hasYoungerBoy = activeMembers.some(m => m.relationship === 'younger_son' || m.age === 7);
  const hasFather = activeMembers.some(m => m.relationship === 'self');
  const hasMother = activeMembers.some(m => m.relationship === 'spouse');
  const fatherMemberObj = activeMembers.find(m => m.relationship === 'self')
    || (cast && Array.isArray(cast.members) ? cast.members.find(m => m.relationship === 'self') : null);
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

  if (chronicleMode) {
    directives.push(`DAILY CHRONICLE PROTAGONIST, SITUATIONAL ATTIRE, POSTURE-ADJUSTED HEIGHTS & VIGNETTE-SPECIFIC CAST DIRECTIVE:
- Narrator Identity & Body Volume Anchor: Whenever the narrator (Father Shridhar) appears in a vignette, portray him as a mid-age 40-year-old Indian man in his early 40s with warm medium-brown skin, a soft fuller round-oval face with full cheeks and natural under-chin/submental fullness, full head of thick short dark hair styled up at the crown, short light neat trimmed stubble beard, and ${fatherMidsectionPhrase} (strictly NOT old or elderly).
- Mother / Wife (Aruna) Identity Anchor (WHEN PRESENT IN A VIGNETTE): Whenever Wife / Mother (Aruna) appears in a vignette, you MUST explicitly describe her exact authentic facial and hair traits in "illustrationPrompt": warm golden-brown wheatish skin, soft fuller round-to-oval maternal face with warm full cheeks and soft rounded chin (strictly NOT a narrow/sharp-chinned face), small black circular bindi centered on her forehead and subtle red kumkum at the upper forehead hairline, gentle dark eyes, side-parted thick voluminous wavy black hair swept forward over her left shoulder past her collarbone, and a healthy natural medium-to-full South Indian adult build (5ft 4in / 162cm, 91% of Father's 178cm height, clearly 8 inches / 20cm TALLER than 11yo Elder Son Gahan).
- Framing Balance (Candid Mid-Shot vs. Group Scale) & Pairwise Relative Stature: Balance the shot framing between capturing the candid human moment and showing scale: for 1-2 person conversational, seated, or indoor moments (e.g. meeting a friend over chai, reading a book, working at a desk), use an expressive CANDID WAIST-UP / CHEST-UP MEDIUM SHOT (MID-SHOT) that highlights facial expressions, gestures, and upper-body/midsection build rather than forcing a distant full-body shot. Use a pulled-back full-body / wide shot (with generous left/right margins so nobody is clipped at the edge) ONLY when the moment involves active movement (like a family walk or march) or fitting 3-4+ standing people together. Whenever Elder Son Gahan and Younger Son Rishu appear, preserve their exact pairwise relative stature: Elder Son Gahan as a "11yo pre-teen boy with a gentle oval face (4ft 8in / 142cm — 88% of Mother Aruna's 162cm height and 80% of Father's 178cm height; clearly 8 inches / 20cm shorter than Mother Aruna so the top of Gahan's head is strictly BELOW Mother's chin at her collarbone / upper-shoulder level, strictly NEVER as tall as or taller than Mother!, wearing a dark navy-blue t-shirt, knee-length denim shorts, and sneakers)", and Younger Son Rishu as a "7yo younger schoolboy with a round cheerful face (4ft 2in / 127cm — 89% of Elder Brother Gahan's 142cm height, 6 inches / 15cm shorter than Gahan so the TOP OF RISHU'S HEAD RISES ABOVE GAHAN'S SHOULDERS to reach Gahan's CHIN / NECK level; strictly NEVER equal height with Gahan!, wearing a mustard-yellow t-shirt, dark shorts, and sneakers)".
- POSTURE-ADJUSTED RELATIVE STATURE MATRIX (Action Multiplier x Actual Height):
  * Standing / Walking = 1.00x of base height | Leaning = 0.88x | Sitting on chair/sofa/bench = 0.72x (-28% height) | Kneeling/Crouching = 0.64x (-36%) | Sitting on floor = 0.52x (-48%).
  * Whenever two characters have different postures in a vignette (e.g., Father at 178cm is sitting in a chair at 178 * 0.72 = 128cm effective height while 11yo Elder Son Gahan at 142cm is standing beside him at 142 * 1.00 = 142cm effective height), explicitly state their effective height relationship ("standing Gahan's head rises ~11% / half-a-head ABOVE seated Father's head").
- SITUATION-SPECIFIC ATTIRE PER MOMENT (DO NOT COPY OUTFITS BLINDLY): Dress Shridhar and family members in attire that matches the exact situation and activity of each individual moment (e.g. uniform for a uniformed march, smart casual shirt at a work desk, athletic wear for sports/walk, kurta or home wear at home). Never blindly copy attire from one vignette into another!
- VIGNETTE-SCOPED CHARACTER PLACEMENT & SUPPORTING CAST (DO NOT MERGE ALL CHARACTERS INTO ONE SCENE): Each Daily Chronicle vignette is a separate, isolated cloudy-shaded watercolor-and-gouache moment visual on warm parchment paper. Depict family members (${activeMembers.map(m => m.name || m.roleLabel).join(', ')}), colleagues, friends, or hosts ONLY inside the specific moment vignette where they are mentioned, and specify the exact foreground headcount (Main Cast + Supporting Characters) for each vignette! Never combine all moments into a single full-bleed family portrait.`);
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
    if (femaleCount === 0 && hasFather) {
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
  if (hasElderBoy && hasYoungerBoy) {
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

  if (hasFather) {
    directives.push(`FATHER (SHRIDHAR) STRICT MID-AGE (40 YEARS OLD), BODY VOLUME & TUMMY PROFILE LOCK:
- Shridhar is a mid-age 40-year-old Indian man in his early 40s with a soft fuller round-oval face, full cheeks and natural under-chin/submental fullness, full head of thick short dark hair styled up, neat short dark trimmed stubble beard, and ${fatherMidsectionPhrase}.
- STRICT BAN ON AGING: NEVER use "salt-and-pepper", and STRICTLY NEVER portray him as an old man, elderly figure, grandfather, or senior citizen with facial wrinkles!`);
    promptSnippets.push(`mid-age 40-year-old Indian man in his early 40s with a soft fuller round-oval face, full cheeks, thick short dark hair, neat short dark trimmed stubble beard, and ${fatherMidsectionPhrase} (strictly NOT old or elderly)`);
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

