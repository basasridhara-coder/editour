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
    spark = '',
    newsHeadline = '',
    newsBody = '',
    sourceType = 'digital_link',
    characterRepresentation = 'silhouette',
    selectedIndices = [],
    countryContext = '',
    countryCode = '',
    vocabularyStyle = 'punchy'
  } = body || {};

  const isLikeness = (characterRepresentation === 'likeness' || characterRepresentation === 'lookalike');
  const isExact = (characterRepresentation === 'exact');
  const hasPersonFocus = isLikeness || isExact;

  const combinedTopic = `${curatorAngle || ''} ${spark || ''} ${newsHeadline || ''} ${newsBody || ''}`.toLowerCase();
  const isPersonalStory = (sourceType === 'inner_voice') ||
    /trip|vacation|kerala|holiday|travel|family|son|daughter|kid|child|parent|pack|luggage|flight|beach|home|rest|weekend|burnout|unplug/i.test(combinedTopic);

  const countryDirective = countryContext && countryContext !== 'Global'
    ? (isPersonalStory
        ? `GEOGRAPHIC & CULTURAL CONTEXT:
The setting is situated in ${countryContext}. Reflect authentic local environment, landscape, and cultural textures of ${countryContext} (e.g. for Kerala/India: lush tropical coconut palms, serene backwaters, domestic warmth, monsoon skies; for Japan: quiet domestic tatami spaces, Tokyo twilight) rather than generic Western tropes.`
        : `CRITICAL GEOGRAPHIC & CULTURAL CONTEXT DIRECTIVE:
The story and curator are situated in ${countryContext}.
All 6 visual cues MUST authentically reflect the geographic, cultural, and institutional reality of ${countryContext} rather than defaulting to generic American or Western European tropes:
- #1 HERO: Must use culturally and institutionally authentic subjects for ${countryContext} (e.g. for India: Indian Supreme Court architecture, Ashoka lion capital emblems, Indian legal dockets, South Asian protagonist archetypes; for Japan: Tokyo corridors, Shinto / Japanese brutalist architecture; for US: neoclassical federal porticos, etc.).
- #2 MOTIF: Culturally resonant symbolism relevant to ${countryContext} and the editorial issue.
- #4 ATMOSPHERE: Authentic regional landscape, urban environment, weather, and architecture of ${countryContext} (e.g. "Monsoon-Drenched New Delhi Rajpath", "Dusk over Old Delhi Red Sandstone", "Tokyo Neon Shinjuku Alleyway").`)
    : `GEOGRAPHIC & CULTURAL DIRECTIVE: If the story mentions or is set in a specific country or region, anchor visual cues in authentic regional and environmental motifs of that country.`;

  const personalDirective = isPersonalStory
    ? `CRITICAL PERSONAL & LIVED EXPERIENCE DIRECTIVE:
This slant is a personal reflection, lived moment, family story, or lifestyle experience (NOT a geopolitical or corporate event).
The visual cues MUST authentically capture the human situation, intimate setting, and specific objects from their slant and spark (e.g. travel bags, packing lists, children holding items, home office desks with glowing screens, sunset horizons, tropical palms, departure doorways) rather than forcing abstract courtrooms or government monuments!`
    : '';

  const personDirective = isLikeness
    ? 'CRITICAL PERSON LOOKALIKE & MYSTERY DIRECTIVE: The curator requested LOOKALIKE & MYSTERY portrayal. The #1 HERO cue MUST specify the central real-world individual named in the headline or context (e.g. "Donald Trump Lookalike Editorial Portrait", "Elon Musk Lookalike Editorial Portrait") styled as an artistic editorial magazine portrait blending recognizable likeness with noir shadow and atmospheric mystery. Do NOT substitute with an abstract building!'
    : (isExact
      ? 'CRITICAL EXACT PHOTO DIRECTIVE: The curator requested to USE THE EXACT PHOTO. The #1 HERO cue should specify the primary photographic subject (e.g. "Donald Trump (Lead Photo Focus)").'
      : '');

  const prompt = `You are the lead visual art director for "Slant" (slant.today), an elite editorial publication.
Your job is to define the 6 ranked storytelling visual cue dimensions for Poster 1 (The Hook Poster).

Curator's Slant / Perspective: "${curatorAngle || 'No specific angle specified'}"
The Spark (Catalyst / Personal Context): "${spark || ''}"
Article Title: "${newsHeadline || ''}"
Article Excerpt / Context: "${newsBody ? newsBody.slice(0, 1500) : ''}"
Source Type: ${sourceType}
Regional & Cultural Setting: ${countryContext || 'Global / Contextually Detected'}
Character Portrayal Style: ${isExact ? 'EXACT PHOTO FOCUS' : (isLikeness ? 'LOOKALIKE & MYSTERY (ARTISTIC EDITORIAL PORTRAIT)' : 'Stylized Metaphor / Silhouette')}

${personalDirective}

${countryDirective}

${personDirective}

STRICT VISUAL CUE REQUIREMENTS (Must be short, punchy 3-6 word phrases):
1. HERO: Central focal figure, subject, or architectural centerpiece. ${hasPersonFocus ? 'Must be the central individual identified in the story (e.g. "Donald Trump Lookalike Editorial Portrait").' : 'Must reflect the actual story subject or curator protagonist (e.g. "Parent Closing Laptop While Packing", "Monolithic Obsidian Server Tower", "Lone Sweeper with Traditional Broom").'} Never output a URL, protocol, or punctuation!
2. MOTIF: Secondary symbolic metaphorical object capturing the curator's philosophical stance or critique (e.g. "Child Holding Forgotten Travel Item", "Tangled Marionette Puppet Strings", "Sculptor Chisel against Marble", "Tipping Balance Scales").
3. TENSION: Opposing visual friction, conflict, shadow, crisis, or counter-force (e.g. "Work Deadlines Clashing with Escape", "Relentless Tidal Wave of Noise", "Cracking Stone Foundation", "Looming Corporate Shadow").
4. ATMOSPHERE: Setting, environmental scale, weather, or time of day (e.g. "Cluttered Study with Kerala Palms", "Damp Rain-Slicked City Boulevard", "Smoke-Filled High-Rise Boardroom").
5. LIGHTING: Dramatic chiaroscuro, cinematic spotlight, or ambient illumination mood (e.g. "Golden Twilight Clashing with Screen Glow", "Dramatic Chiaroscuro Editorial Spotlight", "Single Harsh Streetlamp Spotlight").
6. STYLE: Specific high-aesthetic visual medium (e.g. "Cinematic Warm Editorial Illustration", "High-Contrast Noir Risograph Print", "Bauhaus Geometric Vector Art").

CRITICAL RULE: Under no circumstances output URLs, web links, "https", or technical domain strings. Every cue must be evocative visual imagery.
VOCABULARY DIRECTIVE: Use crisp, vivid, easily understood visual English. NEVER use pretentious academic jargon or obscure Latinate words. Ground every cue in tangible, emotional, concrete reality.

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
    const timeout = setTimeout(() => controller.abort(), 25000);

    const apiResp = await fetch(geminiUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 }
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
    const fallbacks = generateSmartFallbackCues(curatorAngle, spark, newsHeadline, newsBody, characterRepresentation, countryContext, sourceType);
    return res.status(200).json({
      success: true,
      cues: fallbacks,
      fallback: true
    });
  }
};

function generateSmartFallbackCues(curatorAngle = '', spark = '', newsHeadline = '', newsBody = '', characterRepresentation = 'silhouette', countryContext = '', sourceType = 'digital_link') {
  const combined = `${curatorAngle || ''} ${spark || ''} ${newsHeadline || ''} ${newsBody || ''}`.toLowerCase();
  const isLikeness = (characterRepresentation === 'likeness');
  const isIndia = (countryContext === 'India') || combined.includes('india') || combined.includes('delhi') || combined.includes('kerala') || combined.includes('thehindu');
  const isUK = (countryContext === 'United Kingdom') || combined.includes('london') || combined.includes('westminster');
  const isJapan = (countryContext === 'Japan') || combined.includes('japan') || combined.includes('tokyo');

  const isTravel = combined.includes('trip') || combined.includes('kerala') || combined.includes('vacation') || combined.includes('travel') || combined.includes('flight') || combined.includes('pack') || combined.includes('holiday') || combined.includes('beach') || combined.includes('hotel');
  const isFamily = combined.includes('son') || combined.includes('daughter') || combined.includes('child') || combined.includes('parent') || combined.includes('family') || combined.includes('father') || combined.includes('mother');
  const isWorkLife = combined.includes('burnout') || combined.includes('break') || combined.includes('unplug') || combined.includes('deadline') || combined.includes('email') || combined.includes('laptop') || combined.includes('office');
  const isInnerVoice = (sourceType === 'inner_voice') || (!newsHeadline && curatorAngle.length > 5);

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

  // 3. Personal, Travel & Inner Voice fallbacks
  if (!hero && (isTravel || isFamily || isWorkLife || isInnerVoice)) {
    if (isTravel && isFamily) {
      hero = 'Parent Closing Laptop While Packing Suitcase';
    } else if (isTravel) {
      hero = combined.includes('kerala')
        ? 'Traveler with Suitcase Gazing toward Kerala Palms'
        : 'Traveler Packing Luggage at Dusk';
    } else if (isWorkLife) {
      hero = 'Solitary Worker Shutting Laptop at Midnight';
    } else if (curatorAngle && curatorAngle.length > 5) {
      const firstPhrase = curatorAngle.split(/[.:;!?,\n]/)[0].trim();
      hero = firstPhrase.length > 4 ? firstPhrase.slice(0, 40) : 'Reflective Storyteller at Crossroads';
    } else {
      hero = 'Reflective Storyteller at Crossroads';
    }
  }

  // 4. Thematic topic fallbacks grounded in country/regional context
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
      hero = 'Reflective Storyteller at Crossroads';
    }
  }

  let motif = '';
  if (isTravel || isFamily) {
    motif = spark ? 'Child Holding Forgotten Travel Item' : 'Open Suitcase with Boarding Pass';
  } else if (isWorkLife) {
    motif = 'Unread Notification Ping on Screen';
  } else if (combined.includes('court') || combined.includes('judge') || combined.includes('law') || combined.includes('crime') || combined.includes('justice')) {
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
    motif = spark ? spark.slice(0, 35) : 'Quiet Moment of Realization';
  }

  let tension = '';
  if (isTravel || isWorkLife) {
    tension = 'Work Deadlines Clashing with Vacation';
  } else if (combined.includes('storm') || combined.includes('threat')) {
    tension = 'Approaching Storm Wall on Horizon';
  } else if (combined.includes('crack') || combined.includes('collapse')) {
    tension = 'Cracking Stone Foundation Beneath';
  } else if (combined.includes('shadow') || combined.includes('monopoly')) {
    tension = 'Looming Corporate Shadow';
  } else if (combined.includes('court') || combined.includes('crime')) {
    tension = 'Swarm of Shadows around Court Gates';
  } else {
    tension = 'Friction Between Duty and Presence';
  }

  let atmosphere = '';
  if (isTravel) {
    atmosphere = combined.includes('kerala')
      ? 'Cluttered Home Study with Glimpse of Kerala Palms'
      : 'Cluttered Luggage in Evening Room';
  } else if (isWorkLife || isInnerVoice) {
    atmosphere = 'Quiet Home Study at Twilight';
  } else if (isIndia) {
    atmosphere = combined.includes('court') || combined.includes('delhi')
      ? 'Dusk over New Delhi Red Sandstone Corridor'
      : 'Monsoon-Drenched Indian City Boulevard';
  } else if (isUK) {
    atmosphere = 'Rain-Mist Westminster Stone Embankment';
  } else if (isJapan) {
    atmosphere = 'Shinjuku Neon Alleyway in Evening Rain';
  } else {
    atmosphere = 'Quiet City Street at Dusk';
  }

  let lighting = '';
  if (isTravel || isWorkLife || isInnerVoice) {
    lighting = 'Golden Twilight Clashing with Screen Glow';
  } else {
    lighting = 'Dramatic Chiaroscuro Editorial Spotlight';
  }

  let style = '';
  if (isTravel || isFamily || isInnerVoice) {
    style = 'Cinematic Warm Editorial Illustration';
  } else if (isIndia) {
    style = 'Editorial Sandstone & Indigo Broadsheet Woodcut';
  } else {
    style = 'High-Contrast Noir Risograph Print';
  }

  return [hero, motif, tension, atmosphere, lighting, style];
}
