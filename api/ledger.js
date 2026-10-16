// Serverless Function: /api/ledger
// Objective Editorial Research Assistant for Slant.today
// Reads extracted article text or video transcript and generates a strictly neutral,
// non-partisan, 3-part ledger summarizing the source with 1-3 star completeness rating.

const DEFAULT_KEY_B64 = 'QVEuQWI4Uk42STR5WnQzMEl6NGpLRkQ2SndaYVlSeThQYlVtWXpDYUNuMzU3alIyUU9KbFE=';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || Buffer.from(DEFAULT_KEY_B64, 'base64').toString('utf8');
const PRIMARY_MODEL = 'gemini-3.5-flash-lite';
const FALLBACK_MODEL = 'gemini-3.8-flash';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) {}
  }

  const {
    url = '',
    title = '',
    content = '',
    siteName = ''
  } = body || {};

  const cleanTitle = (title || '').trim();
  const cleanContent = (content || '').trim().slice(0, 7000);
  const cleanUrl = (url || '').trim();

  if (!cleanTitle && !cleanContent && !cleanUrl) {
    return res.status(400).json({ error: 'Source URL, title, or content is required' });
  }

  const sourceContext = `
SOURCE TITLE: ${cleanTitle || 'Source Article / Video'}
SOURCE DOMAIN / SITE: ${siteName || 'Web Source'}
SOURCE URL: ${cleanUrl}
SOURCE TEXT:
${cleanContent || cleanTitle || cleanUrl}
`.trim();

  const systemPrompt = `You are an objective editorial research assistant for Slant.today.
Your job is to read an extracted article or video transcript and generate a strictly neutral, non-partisan, 3-part ledger summarizing the source.

GOAL:
Provide the user with an accurate, completely unbiased breakdown of what the source discusses so they can quickly form and articulate their own stance.

STRICT CONSTRAINTS:
1. ABSOLUTE NEUTRALITY: Do not take a side, endorse, or debunk any claim.
2. NO EVALUATIVE ADJECTIVES: Never use judgmental terms such as "insightful", "biased", "compelling", "flawed", "failed", or "brilliant". Use neutral descriptive verbs ("examines", "asserts", "reports", "questions").
3. ATTRIBUTION RULE: Every claim, assertion, or opinion must be explicitly attributed to the creator/author (e.g., "The creator contends that...", "The author cites...").
4. ZERO HALLUCINATION: Only include information, data points, or tensions that exist directly within the supplied text.

OUTPUT FORMAT:
Return pure valid JSON matching this schema:
{
  "subject_and_thesis": "1-2 neutral sentences stating the topic, context, and the central claim or focus of the source.",
  "core_claims_and_evidence": [
    "Direct assertion with the specific data point, quote, or incident cited by the author.",
    "Direct assertion with the specific data point, quote, or incident cited by the author.",
    "Direct assertion with the specific data point, quote, or incident cited by the author."
  ],
  "underlying_tension_or_question": "1 concise sentence framing the central conflict, unresolved tradeoff, or counter-perspective highlighted by or arising from the piece."
}`;

  try {
    const ledger = await callGeminiLedger(systemPrompt, sourceContext, PRIMARY_MODEL)
      .catch(() => callGeminiLedger(systemPrompt, sourceContext, FALLBACK_MODEL));

    const evaluated = evaluateLedgerCompleteness(ledger);
    return res.status(200).json({
      success: true,
      ledger: evaluated
    });

  } catch (err) {
    console.warn('Gemini ledger error, building fallback ledger:', err.message);
    const fallbackLedger = buildFallbackLedger(cleanTitle, cleanContent, siteName);
    const evaluated = evaluateLedgerCompleteness(fallbackLedger);
    return res.status(200).json({
      success: true,
      ledger: evaluated,
      fallback: true
    });
  }
};

async function callGeminiLedger(systemPrompt, sourceContext, modelName) {
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  const resp = await fetch(geminiUrl, {
    method: 'POST',
    signal: controller.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\nEVALUATE THIS SOURCE CONTENT:\n${sourceContext}` }]
        }
      ],
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json'
      }
    })
  });
  clearTimeout(timeout);

  if (!resp.ok) {
    throw new Error(`Gemini status ${resp.status} on ${modelName}`);
  }

  const data = await resp.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Empty AI response from ledger model');

  const parsed = JSON.parse(rawText);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid JSON structure from ledger model');
  }

  return parsed;
}

function evaluateLedgerCompleteness(ledger) {
  const cleanLedger = {
    subject_and_thesis: (ledger && typeof ledger.subject_and_thesis === 'string') ? ledger.subject_and_thesis.trim() : '',
    core_claims_and_evidence: (ledger && Array.isArray(ledger.core_claims_and_evidence))
      ? ledger.core_claims_and_evidence.map(c => String(c).trim()).filter(Boolean)
      : [],
    underlying_tension_or_question: (ledger && typeof ledger.underlying_tension_or_question === 'string')
      ? ledger.underlying_tension_or_question.trim()
      : ''
  };

  // Evaluate star points:
  // Point 1: Has substantiated subject & thesis (> 15 chars)
  const hasThesis = cleanLedger.subject_and_thesis.length >= 15;
  // Point 2: Has core claims & evidence (at least 2 evidence points, or 1 substantial point > 25 chars)
  const hasClaims = cleanLedger.core_claims_and_evidence.length >= 2 ||
    (cleanLedger.core_claims_and_evidence.length === 1 && cleanLedger.core_claims_and_evidence[0].length >= 25);
  // Point 3: Has underlying tension or tradeoff framing (> 15 chars)
  const hasTension = cleanLedger.underlying_tension_or_question.length >= 15;

  let points = 0;
  if (hasThesis) points++;
  if (hasClaims) points++;
  if (hasTension) points++;

  const stars = Math.min(3, Math.max(1, points));

  let stars_label = '3/3 High Substance Anchor';
  if (stars === 2) {
    stars_label = '2/3 Developing Anchor';
  } else if (stars === 1) {
    stars_label = '1/3 Preliminary Anchor';
  }

  return {
    ...cleanLedger,
    completeness_score: stars,
    stars,
    stars_label,
    criteria: {
      has_thesis: hasThesis,
      has_claims: hasClaims,
      has_tension: hasTension
    }
  };
}

function buildFallbackLedger(title, content, siteName) {
  const headline = title || 'Reported News Development';
  const sourceName = siteName || 'The reporting source';

  const sentences = (content || '')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && !s.includes('cookie') && !s.includes('subscribe'))
    .slice(0, 4);

  const claims = sentences.length > 0
    ? sentences.slice(0, 3).map(s => `${sourceName} reports that ${s.replace(/^[A-Z]/, c => c.toLowerCase())}`)
    : [`${sourceName} highlights developments regarding "${headline}".`];

  return {
    subject_and_thesis: `${sourceName} examines "${headline}", presenting current facts and contextual background.`,
    core_claims_and_evidence: claims,
    underlying_tension_or_question: `What are the broader long-term implications and tradeoffs emerging from "${headline}"?`
  };
}
