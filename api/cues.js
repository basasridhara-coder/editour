// Serverless Function: /api/cues
// Uses Gemini 3.8 Flash to extract 6 ranked storytelling visual cues
// (#1 HERO, #2 MOTIF, #3 TENSION, #4 ATMOSPHERE, #5 LIGHTING, #6 STYLE)
// conditioned on the curator's slant and the source article.

const DEFAULT_KEY_B64 = 'QVEuQWI4Uk42STR5WnQzMEl6NGpLRkQ2SndaYVlSeThQYlVtWXpDYUNuMzU3alIyUU9KbFE=';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || Buffer.from(DEFAULT_KEY_B64, 'base64').toString('utf8');
const GEMINI_MODEL = 'gemini-3.8-flash';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

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
    curatorAngle = '',
    newsHeadline = '',
    newsBody = '',
    sourceType = 'digital_link',
    selectedIndices = []
  } = body || {};

  const prompt = `You are the lead visual art director for "Slant" (slant.today), an elite editorial publication.
Your job is to define the 6 ranked storytelling visual cue dimensions for Poster 1 (The Hook Poster).

Curator's Slant / Perspective: "${curatorAngle || 'No specific angle specified'}"
Article Title: "${newsHeadline || ''}"
Article Excerpt / Context: "${newsBody ? newsBody.slice(0, 1500) : ''}"
Source Type: ${sourceType}

STRICT VISUAL CUE REQUIREMENTS (Must be short, punchy 3-6 word phrases):
1. HERO: Central focal figure, subject, or architectural centerpiece. Must reflect the actual story subject or curator's protagonist (e.g. "Monolithic Obsidian Server Tower", "Lone Sweeper with Traditional Broom", "Silhouetted Wall Street Bull"). Never output a URL, protocol, or punctuation!
2. MOTIF: Secondary symbolic metaphorical object capturing the curator's philosophical stance or critique (e.g. "Tangled Marionette Puppet Strings", "Sculptor Chisel against Marble", "Tipping Balance Scales").
3. TENSION: Opposing visual friction, conflict, shadow, crisis, or counter-force (e.g. "Relentless Tidal Wave of Noise", "Cracking Stone Foundation", "Looming Corporate Shadow").
4. ATMOSPHERE: Setting, environmental scale, weather, or time of day (e.g. "Damp Rain-Slicked City Boulevard", "Smoke-Filled High-Rise Boardroom", "Brutalist Concrete Server Canyon").
5. LIGHTING: Dramatic chiaroscuro, cinematic spotlight, or ambient illumination mood (e.g. "Dramatic Chiaroscuro Editorial Spotlight", "Single Harsh Streetlamp Spotlight", "Volumetric Neon Cyan Glow").
6. STYLE: Specific high-aesthetic visual medium (e.g. "High-Contrast Noir Risograph Print", "Bauhaus Geometric Vector Art", "Vintage Woodcut Broadsheet Engraving").

CRITICAL RULE: Under no circumstances output URLs, web links, "https", or technical domain strings. Every cue must be evocative visual imagery.

Respond strictly with valid JSON with this exact schema:
{
  "cues": [
    "3-6 words for #1 HERO",
    "3-6 words for #2 MOTIF",
    "3-6 words for #3 TENSION",
    "3-6 words for #4 ATMOSPHERE",
    "3-6 words for #5 LIGHTING",
    "3-6 words for #6 STYLE"
  ]
}`;

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const apiResp = await fetch(geminiUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json'
        }
      })
    });
    clearTimeout(timeout);

    if (!apiResp.ok) {
      throw new Error(`Gemini status ${apiResp.status}`);
    }

    const data = await apiResp.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('Empty AI response');

    const parsed = JSON.parse(rawText);
    if (!parsed || !Array.isArray(parsed.cues) || parsed.cues.length === 0) {
      throw new Error('Invalid cues array from AI');
    }

    // Clean cues
    const cleanCues = parsed.cues.map(c => String(c).replace(/^#\d+\s*\[?[A-Z]+\]?:?\s*/i, '').trim());

    return res.status(200).json({
      success: true,
      cues: cleanCues
    });

  } catch (err) {
    console.warn('Gemini cues generation error, using smart fallback:', err.message);
    const fallbacks = generateSmartFallbackCues(curatorAngle, newsHeadline, newsBody);
    return res.status(200).json({
      success: true,
      cues: fallbacks,
      fallback: true
    });
  }
};

function generateSmartFallbackCues(curatorAngle, newsHeadline, newsBody) {
  const combined = `${curatorAngle || ''} ${newsHeadline || ''} ${newsBody || ''}`.toLowerCase();

  let hero = '';
  if (combined.includes('garbage') || combined.includes('trash') || combined.includes('waste')) {
    hero = 'Lone Sweeper with Traditional Broom';
  } else if (combined.includes('ai') || combined.includes('tech') || combined.includes('silicon') || combined.includes('compute') || combined.includes('apple') || combined.includes('model')) {
    hero = 'Monolithic Obsidian Server Tower';
  } else if (combined.includes('market') || combined.includes('invest') || combined.includes('wealth') || combined.includes('stock')) {
    hero = 'Silhouetted Wall Street Bull';
  } else if (combined.includes('polit') || combined.includes('elect') || combined.includes('minister') || combined.includes('vote')) {
    hero = 'Solitary Figure at Microphone';
  } else if (newsHeadline && newsHeadline.length > 3 && !newsHeadline.startsWith('http')) {
    hero = newsHeadline.split(/[:–—\-]/)[0].trim().slice(0, 35);
  } else {
    hero = 'Solitary Focal Figure';
  }

  let motif = '';
  if (combined.includes('taste') || combined.includes('craft') || combined.includes('design')) {
    motif = 'Sculptor Chisel against Uncarved Marble';
  } else if (combined.includes('puppet') || combined.includes('control')) {
    motif = 'Tangled Marionette Puppet Strings';
  } else if (combined.includes('scale') || combined.includes('balance') || combined.includes('fair')) {
    motif = 'Tipping Brass Balance Scales';
  } else if (combined.includes('hourglass') || combined.includes('time') || combined.includes('delay')) {
    motif = 'Crumbling Glass Hourglass';
  } else {
    motif = 'Symbolic Editorial Metaphor';
  }

  let tension = 'Relentless Tidal Wave of Noise';
  if (combined.includes('storm') || combined.includes('threat')) {
    tension = 'Approaching Storm Wall on Horizon';
  } else if (combined.includes('crack') || combined.includes('collapse')) {
    tension = 'Cracking Stone Foundation Beneath';
  } else if (combined.includes('shadow') || combined.includes('monopoly')) {
    tension = 'Looming Corporate Glass Shadow';
  }

  let atmosphere = 'Damp Rain-Slicked City Boulevard';
  if (combined.includes('tech') || combined.includes('digital')) {
    atmosphere = 'Brutalist Concrete Server Canyon';
  } else if (combined.includes('exec') || combined.includes('corp') || combined.includes('board')) {
    atmosphere = 'Smoke-Filled High-Rise Boardroom';
  }

  let lighting = 'Dramatic Chiaroscuro Editorial Spotlight';
  if (combined.includes('cyber') || combined.includes('neon') || combined.includes('future')) {
    lighting = 'Eerie Volumetric Neon Cyan Glow';
  } else if (combined.includes('dark') || combined.includes('noir') || combined.includes('secret')) {
    lighting = 'Deep Chiaroscuro High-Contrast Silhouette';
  }

  let style = 'High-Contrast Noir Risograph Print';
  if (combined.includes('tech') || combined.includes('vector')) {
    style = 'Bauhaus Geometric Vector Poster';
  } else if (combined.includes('book') || combined.includes('classic') || combined.includes('history')) {
    style = 'Vintage Woodcut Broadsheet Engraving';
  }

  return [hero, motif, tension, atmosphere, lighting, style];
}
