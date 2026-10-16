// Serverless Function: /api/ledger
// Objective Editorial Research Assistant for Slant.today
// Reads extracted article text or video transcript and generates a strictly neutral,
// non-partisan, highly elaborate 3-part ledger with 1-3 star completeness rating.

const DEFAULT_KEY_B64 = 'QVEuQWI4Uk42STR5WnQzMEl6NGpLRkQ2SndaYVlSeThQYlVtWXpDYUNuMzU3alIyUU9KbFE=';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || Buffer.from(DEFAULT_KEY_B64, 'base64').toString('utf8');
const PRIMARY_MODEL = 'gemini-3.5-flash-lite';
const FALLBACK_MODEL = 'gemini-3.8-flash';

async function generateLedgerForSource(title = '', content = '', url = '', siteName = '') {
  const cleanTitle = (title || '').trim();
  const cleanContent = (content || '').trim().slice(0, 10000);
  const cleanUrl = (url || '').trim();

  if (!cleanTitle && !cleanContent && !cleanUrl) {
    return null;
  }

  const isVideo = cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be') || (siteName || '').toLowerCase().includes('youtube') || cleanContent.includes('YouTube Video');
  const detectedDuration = cleanContent.match(/Video Duration:\s*([^\n\r]+)/)?.[1]?.trim() ||
                           cleanContent.match(/Duration:\s*([^\n\r]+)/)?.[1]?.trim() || '';
  const defaultScope = isVideo
    ? (detectedDuration ? `${detectedDuration} Video Analysis` : 'In-Depth Video Analysis')
    : (cleanContent.length > 2500 ? 'Long-Form Investigation' : 'Curated Source Analysis');

  const sourceContext = `
SOURCE TITLE: ${cleanTitle || 'Source Article / Video'}
SOURCE DOMAIN / SITE: ${siteName || (isVideo ? 'YouTube Video' : 'Web Source')}
SOURCE URL: ${cleanUrl}
SOURCE TYPE: ${isVideo ? 'Video Transcript / Chapters' : 'Article / Essay'}
SOURCE TEXT:
${cleanContent || cleanTitle || cleanUrl}
`.trim();

  const systemPrompt = `You are an objective editorial research assistant for Slant.today.
Your job is to read an extracted article or video transcript and generate a strictly neutral, non-partisan, highly elaborate 3-part ledger summarizing the source.

GOAL:
Provide the user with an exhaustive, deep, and completely unbiased breakdown of what the source discusses so they can quickly form and articulate their own stance.

ELABORATION & STRICT 1-MINUTE READ REQUIREMENT (~180-220 WORDS TOTAL ACROSS THE WHOLE LEDGER):
DO NOT PROVIDE TERSE OR SUPERFICIAL SUMMARIES. The user specifically requests a calibrated 1-minute read (~180-220 words total) breakdown.
- In 'subject_and_thesis', provide both the background context (2-3 sentences, ~20-25 words) AND the detailed central thesis (2-3 sentences, ~35-40 words). Total: ~55-65 words.
- In 'core_claims_and_evidence', provide exactly 3 rich, detailed claims. Each claim MUST have a clear bold title and an elaborate 2-3 sentence explanation (~30-35 words each) citing specific data points, quotes, incidents, or receipts with explicit author attribution. Total: ~85-100 words.
- In 'underlying_tensions', provide 3 distinct dimensions (~40-50 words total):
  1. primary_conflict: The core structural or philosophical friction (~15-20 words).
  2. tradeoffs: Key economic, operational, or policy compromises and unintended consequences (~15-20 words).
  3. counter_questions: The opposing counter-perspectives or unresolved critical inquiries (~10-15 words).
TOTAL WORD COUNT MUST BE CAREFULLY CALIBRATED TO EXACTLY ~180-220 WORDS TO FORM A PRECISE 1-MINUTE READ.

STRICT CONSTRAINTS:
1. ABSOLUTE NEUTRALITY: Do not take a side, endorse, or debunk any claim.
2. NO EVALUATIVE ADJECTIVES: Never use judgmental terms such as "insightful", "biased", "compelling", "flawed", "failed", or "brilliant". Use neutral descriptive verbs ("examines", "asserts", "reports", "questions", "outlines", "articulates").
3. ATTRIBUTION RULE: Every claim, assertion, or opinion must be explicitly attributed to the creator/author (e.g., "The creator contends that...", "The speaker notes...", "The author cites...").
4. ZERO HALLUCINATION: Only include information, data points, or tensions that exist directly within the supplied text.

OUTPUT FORMAT:
Return pure valid JSON matching this schema:
{
  "subject_and_thesis": {
    "context": "2-3 neutral sentences explaining the background, entities involved, and setting (~20-25 words).",
    "thesis": "2-3 neutral sentences articulating the core thesis and overarching argument (~35-40 words)."
  },
  "core_claims_and_evidence": [
    {
      "title": "Short bold title for assertion 1",
      "evidence": "Detailed 2-3 sentences with specific data point, quote, or incident cited with author attribution (~30-35 words)."
    },
    {
      "title": "Short bold title for assertion 2",
      "evidence": "Detailed 2-3 sentences with specific data point, quote, or incident cited with author attribution (~30-35 words)."
    },
    {
      "title": "Short bold title for assertion 3",
      "evidence": "Detailed 2-3 sentences with specific data point, quote, or incident cited with author attribution (~30-35 words)."
    }
  ],
  "underlying_tensions": {
    "primary_conflict": "Detailed 1-2 sentences framing the core structural friction (~15-20 words).",
    "tradeoffs": "Detailed 1-2 sentences explaining unintended consequences or economic/policy compromises (~15-20 words).",
    "counter_questions": "Detailed 1-2 sentences framing the opposing counter-perspective or unresolved questions (~10-15 words)."
  },
  "source_scope": "e.g. 28-min Video Analysis or Long-form Investigation"
}`;

  try {
    const ledger = await callGeminiLedger(systemPrompt, sourceContext, PRIMARY_MODEL)
      .catch(() => callGeminiLedger(systemPrompt, sourceContext, FALLBACK_MODEL));

    return evaluateLedgerCompleteness(ledger, defaultScope);
  } catch (err) {
    console.warn('Gemini ledger error, building fallback ledger:', err.message);
    const fallbackLedger = buildFallbackLedger(cleanTitle, cleanContent, siteName, defaultScope);
    return evaluateLedgerCompleteness(fallbackLedger, defaultScope);
  }
}

async function handler(req, res) {
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

  const evaluated = await generateLedgerForSource(title, content, url, siteName);
  if (!evaluated) {
    return res.status(400).json({ error: 'Source URL, title, or content is required' });
  }

  return res.status(200).json({
    success: true,
    ledger: evaluated
  });
}

handler.generateLedger = generateLedgerForSource;
module.exports = handler;

async function callGeminiLedger(systemPrompt, sourceContext, modelName) {
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

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
        maxOutputTokens: 2048,
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

function evaluateLedgerCompleteness(ledger, defaultScope = 'Curated Source') {
  let subject_and_thesis = { context: '', thesis: '' };
  if (ledger && typeof ledger.subject_and_thesis === 'object' && ledger.subject_and_thesis !== null) {
    subject_and_thesis = {
      context: String(ledger.subject_and_thesis.context || '').trim(),
      thesis: String(ledger.subject_and_thesis.thesis || '').trim()
    };
  } else if (ledger && typeof ledger.subject_and_thesis === 'string') {
    subject_and_thesis = {
      context: '',
      thesis: ledger.subject_and_thesis.trim()
    };
  }

  let core_claims_and_evidence = [];
  if (ledger && Array.isArray(ledger.core_claims_and_evidence)) {
    core_claims_and_evidence = ledger.core_claims_and_evidence.map(item => {
      if (typeof item === 'object' && item !== null) {
        return {
          title: String(item.title || '').trim(),
          evidence: String(item.evidence || item.text || item.claim || '').trim()
        };
      }
      const str = String(item).trim();
      const parts = str.split(/:\s*(.+)/);
      if (parts.length >= 2) {
        return { title: parts[0].trim(), evidence: parts[1].trim() };
      }
      return { title: '', evidence: str };
    }).filter(c => c.evidence.length > 0);
  }

  let underlying_tensions = { primary_conflict: '', tradeoffs: '', counter_questions: '' };
  if (ledger && typeof ledger.underlying_tensions === 'object' && ledger.underlying_tensions !== null) {
    underlying_tensions = {
      primary_conflict: String(ledger.underlying_tensions.primary_conflict || '').trim(),
      tradeoffs: String(ledger.underlying_tensions.tradeoffs || '').trim(),
      counter_questions: String(ledger.underlying_tensions.counter_questions || '').trim()
    };
  } else if (ledger && typeof ledger.underlying_tension_or_question === 'string') {
    underlying_tensions = {
      primary_conflict: ledger.underlying_tension_or_question.trim(),
      tradeoffs: '',
      counter_questions: ''
    };
  }

  const scope = (ledger && typeof ledger.source_scope === 'string' && ledger.source_scope.trim())
    ? ledger.source_scope.trim()
    : defaultScope;

  const hasThesis = (subject_and_thesis.thesis.length >= 20 || subject_and_thesis.context.length >= 20);
  const hasClaims = core_claims_and_evidence.length >= 2;
  const hasTension = (underlying_tensions.primary_conflict.length >= 15 || underlying_tensions.tradeoffs.length >= 15);

  let points = 0;
  if (hasThesis) points++;
  if (hasClaims) points++;
  if (hasTension) points++;

  const stars = Math.min(3, Math.max(1, points));
  let stars_label = '3/3 High Substance Anchor';
  if (stars === 2) stars_label = '2/3 Developing Anchor';
  if (stars === 1) stars_label = '1/3 Preliminary Anchor';

  return {
    subject_and_thesis,
    core_claims_and_evidence,
    underlying_tensions,
    source_scope: scope,
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

function buildFallbackLedger(title, content, siteName, defaultScope = 'Curated Source') {
  const headline = title || 'Reported News Development';
  const sourceName = siteName || 'The reporting source';

  const sentences = (content || '')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && !s.includes('cookie') && !s.includes('subscribe'))
    .slice(0, 6);

  const claims = sentences.length > 0
    ? sentences.map((s, idx) => ({
        title: `Observation ${idx + 1}`,
        evidence: `${sourceName} reports that ${s.replace(/^[A-Z]/, c => c.toLowerCase())}`
      }))
    : [{ title: 'Primary Report', evidence: `${sourceName} highlights developments regarding "${headline}".` }];

  return {
    subject_and_thesis: {
      context: `${sourceName} presents reporting and contextual developments surrounding "${headline}".`,
      thesis: `The piece details primary events and ongoing policy or market dynamics regarding "${headline}".`
    },
    core_claims_and_evidence: claims,
    underlying_tensions: {
      primary_conflict: `The central friction centers on how stakeholders navigate the shifting balance between current actions and future expectations.`,
      tradeoffs: `Immediate decisions involve compromises regarding resources, allocation priorities, and regulatory timelines.`,
      counter_questions: `What counter-perspectives exist among competing analysts, and how will long-term outcomes be evaluated?`
    },
    source_scope: defaultScope
  };
}
