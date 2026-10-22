// Serverless Function: /api/cues
// Uses Gemini 3.8 Flash to extract 6 ranked storytelling visual cues
// (#1 HERO, #2 MOTIF, #3 TENSION, #4 ATMOSPHERE, #5 LIGHTING, #6 STYLE)
// conditioned on the curator's slant and the source article.

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
    console.warn('Cues whitelist check notice:', err);
  }
  return false;
}

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
    characterRepresentation = 'realistic',
    selectedIndices = [],
    existingCues = [],
    familyCast = null,
    activeCast = null,
    castStaging = null,
    countryContext = '',
    countryCode = '',
    vocabularyStyle = 'casual',
    slantTone = 'mind',
    perspectiveMode = 'hybrid',
    creatorEmail = '',
    imageBase64 = null,
    imageMimeType = 'image/jpeg',
    innerVoiceImageBase64 = null,
    innerVoiceImageMimeType = 'image/jpeg'
  } = body || {};

  const effectivePhoto = innerVoiceImageBase64 || imageBase64 || null;
  const effectivePhotoMime = innerVoiceImageMimeType || imageMimeType || 'image/jpeg';

  const userEmail = (creatorEmail || '').toLowerCase().trim();
  if (!userEmail) {
    return res.status(401).json({ error: 'Slant Studio is currently in Private Preview. Please sign in with your invited Google account.' });
  }
  const isAllowed = await verifyEmailIsWhitelisted(userEmail);
  if (!isAllowed) {
    return res.status(403).json({ error: 'Slant Studio is currently in Private Preview by invitation only.' });
  }

  const effectiveNewsHeadline = (sourceType === 'digital_link' || sourceType === 'video_audio') ? (newsHeadline || '').trim() : '';
  const effectiveNewsBody = (sourceType === 'digital_link' || sourceType === 'video_audio') ? (newsBody || '').trim() : '';

  const isCinematic = (characterRepresentation === 'cinematic' || characterRepresentation === 'cinematic_photo' || characterRepresentation === 'likeness' || characterRepresentation === 'lookalike' || (effectivePhoto && characterRepresentation !== 'painting' && characterRepresentation !== 'exact' && characterRepresentation !== 'silhouette' && characterRepresentation !== 'realistic'));
  const isPainting = (characterRepresentation === 'painting');
  const isExact = (characterRepresentation === 'exact');
  const isSilhouette = (characterRepresentation === 'silhouette');
  const hasPersonFocus = isCinematic || isPainting || isExact;

  const combinedTopic = `${curatorAngle || ''} ${spark || ''} ${effectiveNewsHeadline} ${effectiveNewsBody}`.toLowerCase();
  const isPersonalStory = (sourceType === 'inner_voice') ||
    /\b(trip|vacation|kerala|holiday|travel|family|son|daughter|kid|child|parent|pack|luggage|flight|beach|home|rest|weekend|burnout|unplug)\b/i.test(combinedTopic);

  const isHeart = (slantTone === 'heart' || isPersonalStory);
  const lightingDirective = isHeart
    ? `CRITICAL LIGHTING DIRECTIVE (ATMOSPHERIC, EMOTIVE & CONTEXT-DRIVEN):
This is a personal, emotive, or philosophical reflection (Out of Heart).
STRICT RULE: Do NOT lazily default to generic "Golden Hour"!
Derive the lighting directly from the real setting and emotional atmosphere:
- Morning / Fresh beginnings: "Soft Fog-Diffused Morning Light", "Pale Morning Window Light"
- Twilight / Intimate reflection: "Moody Twilight Indigo with Warm Lantern", "Muted Amber Domestic Desk Glow"
- Outdoor nature / Travel: "Dappled Tree Canopy Sunlight", "Misty Monsoon Diffused Light"
- Tension / Burnout: "Cold Screen Glare Against Shadowy Room"`
    : `CRITICAL LIGHTING DIRECTIVE (STARK, INTELLECTUAL & FORENSIC):
This is an analytical, strategic, systemic, or investigative slant (Out of Mind).
STRICT RULE: NEVER default to generic "Golden Hour", "Sunset Glow", or romantic evening light! That completely clashes with analytical journalism.
Derive the lighting from the tension, power dynamics, and architectural setting:
- Governance / Law / Courts: "Stark Chiaroscuro Beam from Above", "High-Contrast Noir Rim Light"
- Tech / Silicon / AI: "Cyan Terminal Glare and Charcoal Shadows", "Eerie Volumetric Server Neon"
- Markets / Finance: "Cold Blue Architectural Daylight", "Forensic Overhead Halogen Grid"
- Crisis / Scandal: "Harsh Razor Chiaroscuro Slit Lamp", "Damp Streetlamp in Midnight Rain"`;

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

  const personDirective = isCinematic
    ? (isPersonalStory && effectivePhoto
        ? 'CRITICAL CINEMATIC EDITORIAL PHOTO DIRECTIVE (PICTURE-LIKE QUALITY, ZERO DIGITAL FOOTPRINT): The curator requested CINEMATIC EDITORIAL PHOTO portrayal from the attached photo. The #1 HERO cue MUST specify the key subjects from the photo with their relationship, age group, and realistic photographic framing (e.g. "Two Young Brothers on Sunlit Veranda", "Father and Daughter in Studio Portrait"). #6 STYLE MUST be "Cinematic 35mm Editorial Photography" or "35mm Documentary Film Still". Strictly NO painterly brushstrokes or canvas.'
        : 'CRITICAL PERSON LOOKALIKE & PORTRAIT DIRECTIVE: The curator requested LOOKALIKE & PORTRAIT portrayal. The #1 HERO cue MUST specify the central real-world individual named in the headline or context (e.g. "Donald Trump Lookalike Editorial Portrait", "Elon Musk Lookalike Editorial Portrait") styled as a crisp editorial magazine photograph.')
    : (isPainting
      ? (isPersonalStory && effectivePhoto
        ? 'CRITICAL ARTISTIC BROADSHEET PAINTING DIRECTIVE (PAINTED ARTWORK): The curator requested ARTISTIC BROADSHEET PAINTING portrayal from the attached photo. The #1 HERO cue MUST specify the key subjects from the photo. #6 STYLE MUST be "Warm Cinematic Editorial Gouache Painting" or "Editorial Oil and Gouache Broadsheet Art".'
        : 'CRITICAL ARTISTIC PAINTING DIRECTIVE: The #1 HERO cue should portray the subject in broadsheet painted editorial art style.')
      : (isExact
        ? 'CRITICAL EXACT PHOTO DIRECTIVE: The curator requested to USE THE EXACT PHOTO. The #1 HERO cue should specify the primary photographic subject (e.g. "Donald Trump (Lead Photo Focus)").'
        : (isSilhouette
          ? 'MINIMALIST SILHOUETTE DIRECTIVE: The curator explicitly requested silhouette portrayal. #1 HERO should use minimalist shadow outlines.'
          : 'VIVID EDITORIAL REALISM DIRECTIVE: All human subjects MUST be depicted as warm, realistic, expressive people with visible faces, natural lighting, and tangible environments. NEVER suggest pitch-black silhouettes, faceless shadow phantoms, or creepy dark figures!')));

  const dimensionNames = ['#1 HERO', '#2 MOTIF', '#3 TENSION', '#4 ATMOSPHERE', '#5 LIGHTING', '#6 STYLE'];
  let variationDirective = '';
  if (Array.isArray(selectedIndices) && selectedIndices.length > 0 && Array.isArray(existingCues) && existingCues.length > 0) {
    const selectedLabels = selectedIndices.map(idx => dimensionNames[idx] || `#${idx + 1}`).join(', ');
    variationDirective = `CRITICAL TARGETED REGENERATION INSTRUCTION:
The curator is selectively regenerating ONLY the following dimension(s): ${selectedLabels}.
Current visual cues:
${existingCues.map((c, i) => `${dimensionNames[i] || `#${i + 1}`}: "${c}"`).join('\n')}

RULES FOR THIS REGENERATION:
1. For the selected dimension(s) (${selectedLabels}), you MUST provide completely FRESH, DISTINCT alternative phrases that offer a new angle or visual metaphor.
2. For unselected dimensions, maintain the current cue text from above so the post stays cohesive.
3. Every cue must remain 3-6 words, evocative and tangible.`;
  } else if (Array.isArray(existingCues) && existingCues.length > 0) {
    variationDirective = `FRESH SUGGESTION VARIATION INSTRUCTION:
The curator requested a NEW alternative set of visual cues. Previous cues were:
${existingCues.map((c, i) => `${dimensionNames[i] || `#${i + 1}`}: "${c}"`).join('\n')}

Explore a fresh artistic perspective, novel symbolic motifs, or alternative lighting/atmosphere. Do NOT repeat identical phrases.`;
  }

  const combinedCuratorText = `${curatorAngle} ${spark}`.toLowerCase();
  const hasFamilyContext = (activeCast && activeCast.members && activeCast.members.length > 0) ||
    /\b(family|my family|kids|my kids|sons|my sons|both boys|boys|children|wife|mom|mother|dad|father|11 and 7|road trip)\b/i.test(combinedCuratorText);

  let familyDirective = '';
  if (hasFamilyContext) {
    familyDirective = `CRITICAL FAMILY CAST & BIOLOGICAL CONTRAST DIRECTIVE:
The curator is reflecting on their family.
1. HERO: The central focal subjects should be all four family members: "Family of four (Father, Mother, 11yo Elder Son and 7yo Younger Son - 3 males, 1 female)", "Two Brothers with 4-Year Age Gap", or "Father and Sons Preparing Luggage". Always specify all 4 members so image models never omit any person.
2. AGE CONTRAST: The two boys must have an unmistakable 4-year age gap: older 11yo pre-teen boy (visibly taller by a head, leaner) alongside younger 7yo boy (shorter, shoulder height, round child cheeks). STRICTLY NEVER identical twins!
3. REGIONAL VEHICLE RULES: If a road trip / car is portrayed in India, enforce Indian Right-Hand Drive (adult father driving on right, mother passenger on left, boys separately in rear seats).
4. EXACT HEADCOUNT & ANTI-MERGING: Family consists of 4 members (3 males, 1 female: Father, Mother, 11yo Elder Son, 7yo Younger Son). Never use ambiguous phrases like "a family with kids" that lead image generators to draw only 1 child. Both sons must be individually enumerated.`;
  }

  const perspectiveDirective = (perspectiveMode === 'curator')
    ? `CRITICAL PERSPECTIVE DIRECTIVE (CURATOR ANGLE):
The curator selected CURATOR ANGLE mode. The visual storytelling must be 100% anchored in the curator's personal thesis, philosophical critique, and evocative metaphor ("${curatorAngle}").
- #1 HERO: Must directly embody the curator's core insight, thesis, or central metaphor (e.g. an elderly farmer planting a sapling, an artisan at a workbench, an individual standing against an algorithm). Do NOT default to dry newspaper buildings unless that is the curator's metaphor.
- #2 MOTIF & #3 TENSION: Expand the curator's conceptual tension, friction, and critique.`
    : (perspectiveMode === 'source')
    ? `CRITICAL PERSPECTIVE DIRECTIVE (SOURCE GROUNDED - STRICT PHYSICAL REALITY):
The curator selected SOURCE GROUNDED mode.
STRICT RULE: The visual storytelling and all 6 visual cues MUST stay 100% faithful to the authentic news event, literal physical subjects, concrete persons, real locations, and primary reportage in the source ("${effectiveNewsHeadline}").
- If the curator's written take mentions unrelated concepts or personal commentary (e.g. technical college degrees, engineering studies, philosophical commentary), DO NOT let that override the actual real-world news protagonist, institutional setting, or event!
- #1 HERO: Must strictly depict the primary physical subject, named public figure/politician, institution, or protagonist of the source piece (e.g. "Indian politician addressing news microphones", "Election rally leader at podium"). Do NOT substitute fictitious students, engineers, or abstract allegories!
- #2 MOTIF & #3 TENSION: Grounded directly in the observed real-world conflict, physical symbols, or banners reported in the source (e.g. "Orange flags fluttering in wind", "Political banners overshadowing academic halls").
- #4 ATMOSPHERE & #5 LIGHTING: Derived strictly from the real-world news setting (e.g. "Crowded university press conference setting", "Harsh outdoor news camera flash").`
    : `CRITICAL PERSPECTIVE DIRECTIVE (HYBRID CONTRAST - THE SLANT SIGNATURE):
The curator selected HYBRID CONTRAST mode.
- #1 HERO: Anchored in the concrete real-world news subject or primary event.
- #2 MOTIF & #3 TENSION: Infused with the curator's counter-slant, conceptual metaphor, and critical friction ("${curatorAngle}").`;

  const photoDirective = effectivePhoto
    ? `CRITICAL REAL-WORLD SCENE MULTIMODAL GROUNDING DIRECTIVE:
The curator has provided an authentic real-world photograph / news video thumbnail of the primary source event or spark.
1. Visually analyze the photograph: recognize the focal physical subjects (e.g. specific politicians, public figures, news microphones, flags, banners, crowds), real-world setting, and lighting mood.
${perspectiveMode === 'source' ? `2. STRICT SOURCE GROUNDING: Ground the 6 visual cue dimensions directly in the physical reality visible in this photograph and the source news headline:
   - #1 HERO: Must elevate the key physical protagonist or centerpiece seen in the photograph (e.g. the specific public figure, speaker, or institution captured in the image).
   - #2 MOTIF: The physical objects or symbols visible in the scene (e.g. campaign flags, press microphones, podium banners).
   - #3 TENSION: The real-world political or societal friction visible or reported in the event.
   - #4 ATMOSPHERE: The authentic physical environment, textures, and setting derived directly from the photograph.
   - #5 LIGHTING: The real-world lighting mood, camera flashes, or daylight visible in the snapshot.` : `2. Relate this physical reality directly with the curator's written perspective ("${curatorAngle}") and spark ("${spark}").
3. Fuse BOTH the real scene and the written stance into the 6 visual cue dimensions:
   - #1 HERO: Must elevate the key physical subject or centerpiece seen in the photograph (e.g. the specific object, person, or architecture captured in the snapshot).
   - #2 MOTIF: The symbolic metaphor connecting this physical reality to the curator's deeper philosophical stance.
   - #3 TENSION: The conceptual or structural friction embodied in this captured moment.
   - #4 ATMOSPHERE: The authentic physical environment, textures, and setting derived directly from the photograph.
   - #5 LIGHTING: The real-world lighting mood, shadows, or color temperature visible in the snapshot.`}`
    : '';

  const prompt = `You are the lead visual art director for "Slant" (slant.today), an elite editorial publication.
Your job is to define the 6 ranked storytelling visual cue dimensions for Poster 1 (The Hook Poster).

Curator's Slant / Perspective: "${curatorAngle || 'No specific angle specified'}"
The Spark (Catalyst / Personal Context): "${spark || ''}"
${effectiveNewsHeadline ? `Article Title: "${effectiveNewsHeadline}"` : ''}
${effectiveNewsBody ? `Article Excerpt / Context: "${effectiveNewsBody.slice(0, 1500)}"` : ''}
Source Type: ${sourceType}
Visual Focus: ${perspectiveMode === 'curator' ? 'Curator Angle (Metaphor)' : (perspectiveMode === 'source' ? 'Source Grounded (Physical Reality)' : 'Hybrid Blend')}
Slant Tone: ${slantTone === 'heart' ? 'Out of Heart (Emotive, Humanistic, Personal Reflection)' : 'Out of Mind (Analytical, Strategic, Systemic Broadsheet)'}
Regional & Cultural Setting: ${countryContext || 'Global / Contextually Detected'}
Character Portrayal Style: ${isExact ? 'EXACT PHOTO FOCUS' : (isCinematic ? 'CINEMATIC EDITORIAL PHOTO (35MM CAMERA FIDELITY)' : (isPainting ? 'ARTISTIC BROADSHEET PAINTING (GOUACHE & OIL)' : (isSilhouette ? 'Stylized Minimalist Silhouette' : 'Vivid Editorial Realism (Realistic & Expressive Human Subjects)')))}

${perspectiveDirective}

${photoDirective}

${personalDirective}

${countryDirective}

${personDirective}

${familyDirective}

${lightingDirective}

${variationDirective}

STRICT VISUAL CUE REQUIREMENTS (Must be short, punchy 3-6 word phrases):
1. HERO: Central focal figure, subject, or architectural centerpiece. ${hasPersonFocus ? 'Must be the central individual identified in the story (e.g. "Donald Trump Lookalike Editorial Portrait").' : (isSilhouette ? 'Minimalist silhouette or outline.' : 'Warm, realistic protagonist or subject with visible human expression (e.g. "Parent and Child Packing Suitcase", "Monolithic Obsidian Server Tower", "Lone Sweeper with Traditional Broom"). NEVER pitch-black silhouettes, NEVER ghost figures!')} Never output a URL, protocol, or punctuation!
2. MOTIF: Secondary symbolic metaphorical object capturing the curator's philosophical stance or critique (e.g. "Child Holding Forgotten Travel Item", "Tangled Marionette Puppet Strings", "Sculptor Chisel against Marble", "Tipping Balance Scales").
3. TENSION: Opposing visual friction, conflict, shadow, crisis, or counter-force (e.g. "Work Deadlines Clashing with Escape", "Relentless Tidal Wave of Noise", "Cracking Stone Foundation", "Looming Corporate Shadow").
4. ATMOSPHERE: Setting, environmental scale, weather, or time of day (e.g. "Cluttered Study with Kerala Palms", "Damp Rain-Slicked City Boulevard", "Smoke-Filled High-Rise Boardroom").
5. LIGHTING: Evocative 3-6 word lighting mood strictly reflecting the topic and emotional stance (e.g. "Cold Steel-Blue Chiaroscuro Rim", "Forensic Overhead Halogen Grid", "Soft Fog-Diffused Morning Light", "Dramatic Low-Angle Razor Spotlight"). STRICTLY AVOID generic "Golden Hour" or "Warm Sunset" cliches unless an outdoor sunset is explicitly central to the narrative!
6. STYLE: Specific high-aesthetic visual medium (e.g. ${isCinematic ? '"Cinematic 35mm Editorial Photography"' : (isPainting ? '"Warm Cinematic Editorial Gouache Painting"' : '"Cinematic Warm Editorial Illustration"')}, "High-Contrast Noir Risograph Print", "Bauhaus Geometric Vector Art").

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

    const parts = [];
    if (effectivePhoto) {
      const cleanData = effectivePhoto.includes(',') ? effectivePhoto.split(',')[1] : effectivePhoto;
      parts.push({
        inlineData: {
          mimeType: effectivePhotoMime,
          data: cleanData
        }
      });
    }
    parts.push({ text: prompt });

    const apiResp = await fetch(geminiUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.75,
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

    // If targeted selective indices were provided and unselected cues need fallback preservation
    if (Array.isArray(selectedIndices) && selectedIndices.length > 0 && Array.isArray(existingCues) && existingCues.length > 0) {
      const finalCues = [...existingCues];
      selectedIndices.forEach(idx => {
        if (cleanCues[idx]) {
          finalCues[idx] = cleanCues[idx];
        }
      });
      return res.status(200).json({
        success: true,
        cues: finalCues
      });
    }

    return res.status(200).json({
      success: true,
      cues: cleanCues
    });

  } catch (err) {
    console.warn('Gemini cues generation error, using smart fallback:', err.message);
    const fallbacks = generateSmartFallbackCues(curatorAngle, spark, effectiveNewsHeadline, effectiveNewsBody, characterRepresentation, countryContext, sourceType, selectedIndices, existingCues);
    return res.status(200).json({
      success: true,
      cues: fallbacks,
      fallback: true
    });
  }
};

function generateSmartFallbackCues(curatorAngle = '', spark = '', newsHeadline = '', newsBody = '', characterRepresentation = 'realistic', countryContext = '', sourceType = 'digital_link', selectedIndices = [], existingCues = []) {
  const combined = `${curatorAngle || ''} ${spark || ''} ${newsHeadline || ''} ${newsBody || ''}`.toLowerCase();
  const isLikeness = (characterRepresentation === 'likeness');
  const isIndia = (countryContext === 'India') || combined.includes('india') || combined.includes('delhi') || combined.includes('kerala') || combined.includes('thehindu');
  const isUK = (countryContext === 'United Kingdom') || combined.includes('london') || combined.includes('westminster');
  const isJapan = (countryContext === 'Japan') || combined.includes('japan') || combined.includes('tokyo');

  const isTravel = /\b(trip|vacation|kerala|holiday|travel|flight|pack|luggage|beach|hotel)\b/i.test(combined);
  const isFamily = /\b(son|daughter|child|children|parent|family|father|mother|kid|kids)\b/i.test(combined);
  const isWorkLife = /\b(burnout|break|unplug|deadline|deadlines|inbox|laptop|office)\b/i.test(combined);
  const isInnerVoice = (sourceType === 'inner_voice') || (!newsHeadline && curatorAngle.length > 5);

  let hero = '';

  // 1. Prominent public figure detection
  if (combined.includes('sitharaman') || combined.includes('finance minister')) {
    hero = 'Nirmala Sitharaman (Editorial Portrait)';
  } else if (combined.includes('ranganathan')) {
    hero = 'Anand Ranganathan (Editorial Portrait)';
  } else if (combined.includes('trump')) {
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

  // 3. Personal, Travel & Inner Voice fallbacks (strictly whole words)
  if (!hero && (isTravel || isFamily || (isWorkLife && isInnerVoice) || isInnerVoice)) {
    if (isTravel && isFamily) {
      hero = 'Parent Closing Laptop Beside Packed Suitcase';
    } else if (isTravel) {
      hero = combined.includes('kerala')
        ? 'Traveler Gazing toward Tropical Palms'
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
    if (combined.includes('court') || combined.includes('judge') || combined.includes('law') || combined.includes('legal') || combined.includes('crime')) {
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
      hero = isIndia ? 'Dalal Street Bull Bronze Monument' : 'Charging Wall Street Bronze Bull';
    } else if (combined.includes('polit') || combined.includes('elect') || combined.includes('minister') || combined.includes('vote') || combined.includes('parliament')) {
      hero = isIndia ? 'Indian Parliament Sandstone Colonnade' : 'Solitary Figure at Microphone';
    } else if (newsHeadline && newsHeadline.length > 3 && !newsHeadline.startsWith('http')) {
      hero = newsHeadline.split(/[:–—\-]/)[0].trim().slice(0, 35);
    } else {
      hero = 'Expressive Protagonist in Discussion';
    }
  }

  // Alternative pools to ensure variation when regenerating
  const motifPool = (combined.includes('minister') || combined.includes('polic') || combined.includes('econom') || isIndia)
    ? ['Ashoka Lion Capital & Policy Dockets', 'Gilded Scales of Fiscal Governance', 'Microphone at Press Podium', 'Unfurled Economic Blueprint']
    : ['Tipping Brass Balance Scales', 'Sculptor Chisel against Uncarved Marble', 'Tangled Marionette Puppet Strings', 'Hourglass with Flowing Sand'];

  const tensionPool = (combined.includes('minister') || combined.includes('polic') || combined.includes('econom'))
    ? ['Hard Public Questions Met with Conviction', 'Fiscal Discipline Clashing with Populist Demands', 'Structural Reform vs Bureaucratic Inertia', 'Sharp Media Inquiries under Stage Lights']
    : ['Friction Between Duty and Presence', 'Approaching Storm Wall on Horizon', 'Cracking Stone Foundation Beneath', 'Looming Corporate Shadow'];

  const atmospherePool = isIndia
    ? ['New Delhi Auditorium Stage Under Lights', 'Dusk over New Delhi Red Sandstone Corridor', 'Historic Colonnaded Assembly Hall', 'Monsoon-Drenched Civic Square']
    : ['Quiet Study at Twilight', 'Rain-Slicked City Boulevard at Dusk', 'High-Ceilinged Conference Hall', 'Smoke-Filled High-Rise Boardroom'];

  const lightingPool = isHeart
    ? [
        'Soft Fog-Diffused Morning Light',
        'Pale Morning Window Light with Subtle Falloff',
        'Moody Twilight Indigo with Warm Lantern',
        'Muted Amber Domestic Desk Glow'
      ]
    : [
        'Stark High-Contrast Noir Rim Light',
        'Cold Steel-Blue Architectural Daylight',
        'Dramatic Chiaroscuro Beam from Above',
        'Cyan Terminal Glare and Charcoal Shadows'
      ];

  const stylePool = isIndia
    ? ['Cinematic Warm Editorial Photography', 'Editorial Sandstone & Indigo Broadsheet Woodcut', 'Warm Fine-Art Editorial Illustration', 'High-Contrast Risograph Print']
    : ['Cinematic Warm Editorial Illustration', 'High-Contrast Noir Risograph Print', 'Bauhaus Graphic Vector Style', 'Editorial Portrait Oil Texture'];

  // Select item from pool that does not duplicate current cue
  function pickFresh(pool, currentCue) {
    if (!currentCue) return pool[0];
    const candidate = pool.find(item => item.toLowerCase() !== currentCue.toLowerCase());
    return candidate || pool[0];
  }

  const existingHero = existingCues[0] || '';
  const existingMotif = existingCues[1] || '';
  const existingTension = existingCues[2] || '';
  const existingAtmosphere = existingCues[3] || '';
  const existingLighting = existingCues[4] || '';
  const existingStyle = existingCues[5] || '';

  const motif = pickFresh(motifPool, existingMotif);
  const tension = pickFresh(tensionPool, existingTension);
  const atmosphere = pickFresh(atmospherePool, existingAtmosphere);
  const lighting = pickFresh(lightingPool, existingLighting);
  const style = pickFresh(stylePool, existingStyle);

  const freshList = [hero, motif, tension, atmosphere, lighting, style];

  // If specific indices were selected, preserve unselected existing cues!
  if (Array.isArray(selectedIndices) && selectedIndices.length > 0 && Array.isArray(existingCues) && existingCues.length === 6) {
    const merged = [...existingCues];
    selectedIndices.forEach(idx => {
      if (idx >= 0 && idx < 6) {
        merged[idx] = freshList[idx];
      }
    });
    return merged;
  }

  return freshList;
}
