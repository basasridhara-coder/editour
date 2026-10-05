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
    characterRepresentation = 'silhouette',
    selectedIndices = [],
    countryContext = '',
    countryCode = ''
  } = body || {};

  const isLikeness = (characterRepresentation === 'likeness');

  const countryDirective = countryContext && countryContext !== 'Global'
    ? `CRITICAL GEOGRAPHIC & CULTURAL CONTEXT DIRECTIVE:
The story and curator are situated in ${countryContext}.
All 6 visual cues MUST authentically reflect the geographic, cultural, and institutional reality of ${countryContext} rather than defaulting to generic American or Western European tropes:
- #1 HERO: Must use culturally and institutionally authentic subjects for ${countryContext} (e.g. for India: Indian Supreme Court architecture, Ashoka lion capital emblems, Indian legal dockets, South Asian protagonist archetypes; for Japan: Tokyo corridors, Shinto / Japanese brutalist architecture; for US: neoclassical federal porticos, etc.).
- #2 MOTIF: Culturally resonant symbolism relevant to ${countryContext} and the editorial issue.
- #4 ATMOSPHERE: Authentic regional landscape, urban environment, weather, and architecture of ${countryContext} (e.g. "Monsoon-Drenched New Delhi Rajpath", "Dusk over Old Delhi Red Sandstone", "Tokyo Neon Shinjuku Alleyway").`
    : `GEOGRAPHIC & CULTURAL DIRECTIVE: If the story mentions or is set in a specific country or region, anchor all visual cues (#1 HERO, #2 MOTIF, #4 ATMOSPHERE) in the authentic regional and architectural motifs of that country.`;

  const prompt = `You are the lead visual art director for "Slant" (slant.today), an elite editorial publication.
Your job is to define the 6 ranked storytelling visual cue dimensions for Poster 1 (The Hook Poster).

Curator's Slant / Perspective: "${curatorAngle || 'No specific angle specified'}"
Article Title: "${newsHeadline || ''}"
Article Excerpt / Context: "${newsBody ? newsBody.slice(0, 1500) : ''}"
Source Type: ${sourceType}
Regional & Cultural Setting: ${countryContext || 'Global / Contextually Detected'}
Character Portrayal Style: ${isLikeness ? 'REAL PERSON FACE & LIKENESS' : 'Stylized Metaphor / Silhouette'}

${countryDirective}

${isLikeness ? 'CRITICAL PERSON LIKENESS DIRECTIVE: The curator has explicitly requested REAL PERSON LIKENESS. The #1 HERO cue MUST be the central real-world individual named in the headline or context (e.g., "Donald Trump (Editorial Portrait)", "Elon Musk (Editorial Portrait)") styled for a high-contrast editorial magazine cover. Do NOT substitute with an abstract object or inanimate building!' : ''}

STRICT VISUAL CUE REQUIREMENTS (Must be short, punchy 3-6 word phrases):
1. HERO: Central focal figure, subject, or architectural centerpiece. ${isLikeness ? 'Must be the real person identified in the story (e.g. "Donald Trump (Editorial Portrait)").' : 'Must reflect the actual story subject or curator protagonist (e.g. "Monolithic Obsidian Server Tower", "Lone Sweeper with Traditional Broom", "Silhouetted Wall Street Bull").'} Never output a URL, protocol, or punctuation!
2. MOTIF: Secondary symbolic metaphorical object capturing the curator's philosophical stance or critique (e.g. "Tangled Marionette Puppet Strings", "Sculptor Chisel against Marble", "Tipping Balance Scales").
3. TENSION: Opposing visual friction, conflict, shadow, crisis, or counter-force (e.g. "Relentless Tidal Wave of Noise", "Cracking Stone Foundation", "Looming Corporate Shadow").
4. ATMOSPHERE: Setting, environmental scale, weather, or time of day (e.g. "Damp Rain-Slicked City Boulevard", "Smoke-Filled High-Rise Boardroom", "Brutalist Concrete Server Canyon").
5. LIGHTING: Dramatic chiaroscuro, cinematic spotlight, or ambient illumination mood (e.g. "Dramatic Chiaroscuro Editorial Spotlight", "Single Harsh Streetlamp Spotlight", "Volumetric Neon Cyan Glow").
6. STYLE: Specific high-aesthetic visual medium (e.g. "High-Contrast Noir Risograph Print", "Bauhaus Geometric Vector Art", "Vintage Woodcut Broadsheet Engraving").

CRITICAL RULE: Under no circumstances output URLs, web links, "https", or technical domain strings. Every cue must be evocative visual imagery.
VOCABULARY DIRECTIVE: Use crisp, vivid, easily understood visual English. NEVER use pretentious academic jargon or obscure Latinate words (e.g. avoid "panopticon", "hegemony", "Kafkaesque", "dichotomy", "inexorable", "epistemic"). Ground every cue in tangible, emotional, concrete reality.

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
    const fallbacks = generateSmartFallbackCues(curatorAngle, newsHeadline, newsBody, characterRepresentation, countryContext);
    return res.status(200).json({
      success: true,
      cues: fallbacks,
      fallback: true
    });
  }
};

function generateSmartFallbackCues(curatorAngle, newsHeadline, newsBody, characterRepresentation = 'silhouette', countryContext = '') {
  const combined = `${curatorAngle || ''} ${newsHeadline || ''} ${newsBody || ''}`.toLowerCase();
  const isLikeness = (characterRepresentation === 'likeness');
  const isIndia = (countryContext === 'India') || combined.includes('india') || combined.includes('delhi') || combined.includes('thehindu');
  const isUK = (countryContext === 'United Kingdom') || combined.includes('london') || combined.includes('westminster');
  const isJapan = (countryContext === 'Japan') || combined.includes('japan') || combined.includes('tokyo');

  let hero = '';

  // 1. Prominent public figure detection (prioritize when likeness requested or mentioned)
  if (combined.includes('trump')) {
    hero = 'Donald Trump (Editorial Portrait)';
  } else if (combined.includes('musk')) {
    hero = 'Elon Musk (Editorial Portrait)';
  } else if (combined.includes('altman')) {
    hero = 'Sam Altman (Editorial Portrait)';
  } else if (combined.includes('nadella')) {
    hero = 'Satya Nadella (Editorial Portrait)';
  } else if (combined.includes('pichai')) {
    hero = 'Sundar Pichai (Editorial Portrait)';
  } else if (combined.includes('cook') && (combined.includes('apple') || combined.includes('tim'))) {
    hero = 'Tim Cook (Editorial Portrait)';
  } else if (combined.includes('huang') || combined.includes('jensen')) {
    hero = 'Jensen Huang (Editorial Portrait)';
  } else if (combined.includes('biden')) {
    hero = 'Joe Biden (Editorial Portrait)';
  } else if (combined.includes('harris') && (combined.includes('kamala') || combined.includes('vice'))) {
    hero = 'Kamala Harris (Editorial Portrait)';
  } else if (combined.includes('modi')) {
    hero = 'Narendra Modi (Editorial Portrait)';
  } else if (combined.includes('zuckerberg')) {
    hero = 'Mark Zuckerberg (Editorial Portrait)';
  } else if (combined.includes('bezos')) {
    hero = 'Jeff Bezos (Editorial Portrait)';
  }

  // 2. If likeness requested and headline has a proper name
  if (!hero && isLikeness && newsHeadline) {
    const nameMatch = newsHeadline.match(/\b([A-Z][a-z]+ [A-Z][a-z]+)\b/);
    if (nameMatch && nameMatch[1]) {
      hero = `${nameMatch[1]} (Editorial Portrait)`;
    }
  }

  // 3. Thematic topic fallbacks grounded in country/regional context
  if (!hero) {
    if (combined.includes('court') || combined.includes('judge') || combined.includes('law') || combined.includes('legal') || combined.includes('crime') || combined.includes('goon')) {
      if (isIndia) {
        hero = 'Supreme Court of India Pillared Portico';
      } else if (isUK) {
        hero = 'Old Bailey Gilded Scales of Justice';
      } else {
        hero = 'Monolithic Neoclassical Courthouse Columns';
      }
    } else if (combined.includes('garbage') || combined.includes('trash') || combined.includes('waste')) {
      hero = isIndia ? 'Municipal Sweeper with Traditional Reed Broom' : 'Lone Sweeper with Traditional Broom';
    } else if (combined.includes('ai') || combined.includes('tech') || combined.includes('silicon') || combined.includes('compute') || combined.includes('model')) {
      hero = 'Monolithic Obsidian Server Tower';
    } else if (combined.includes('market') || combined.includes('invest') || combined.includes('wealth') || combined.includes('stock')) {
      hero = isIndia ? 'Dalal Street Bull Monument Silhouette' : 'Silhouetted Wall Street Bull';
    } else if (combined.includes('polit') || combined.includes('elect') || combined.includes('minister') || combined.includes('vote')) {
      hero = isIndia ? 'Indian Parliament Sandstone Colonnade' : 'Solitary Figure at Microphone';
    } else if (newsHeadline && newsHeadline.length > 3 && !newsHeadline.startsWith('http')) {
      hero = newsHeadline.split(/[:–—\-]/)[0].trim().slice(0, 35);
    } else {
      hero = 'Solitary Focal Figure';
    }
  }

  let motif = '';
  if (combined.includes('court') || combined.includes('judge') || combined.includes('law') || combined.includes('crime') || combined.includes('justice')) {
    motif = isIndia ? 'Ashoka Lion Capital & Brass Balance Scales' : 'Tipping Brass Balance Scales';
  } else if (combined.includes('taste') || combined.includes('craft') || combined.includes('design')) {
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
    tension = 'Looming Corporate Shadow';
  } else if (combined.includes('court') || combined.includes('crime')) {
    tension = 'Swarm of Shadows around Court Gates';
  }

  let atmosphere = 'Damp Rain-Slicked City Boulevard';
  if (isIndia) {
    atmosphere = combined.includes('court') || combined.includes('delhi')
      ? 'Dusk over New Delhi Red Sandstone Corridor'
      : 'Monsoon-Drenched Indian City Boulevard';
  } else if (isUK) {
    atmosphere = 'Rain-Mist Westminster Stone Embankment';
  } else if (isJapan) {
    atmosphere = 'Shinjuku Neon Alleyway in Evening Rain';
  }

  const lighting = 'Dramatic Chiaroscuro Editorial Spotlight';
  const style = isIndia
    ? 'Editorial Sandstone & Indigo Broadsheet Woodcut'
    : 'High-Contrast Noir Risograph Print';

  return [hero, motif, tension, atmosphere, lighting, style];
}
