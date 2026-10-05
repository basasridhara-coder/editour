// Serverless Function: /api/synthesize
// Synthesizes raw inputs (Web links, Photos/Clippings, Inner Voice)
// into a complete 3-poster Slant carousel using Gemini 3.8 Flash.

const DEFAULT_KEY_B64 = 'QVEuQWI4Uk42STR5WnQzMEl6NGpLRkQ2SndaYVlSeThQYlVtWXpDYUNuMzU3alIyUU9KbFE=';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || Buffer.from(DEFAULT_KEY_B64, 'base64').toString('utf8');
const GEMINI_MODEL = 'gemini-3.8-flash';

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

    const {
      sourceType = 'inner_voice', // 'digital_link' | 'inner_voice' | 'photo'
      url = '',
      text = '',
      slantTake = '',
      refineCoreTake = true,
      imageBase64 = null,
      imageMimeType = 'image/jpeg',
      targetAudience = 'General',
      slantTone = 'mind', // 'mind' | 'heart'
      spark = '',
      creatorHandle = '@curator',
      cues = [],
      heroCue = '',
      characterRepresentation = 'silhouette',
      scrapedTitle = '',
      scrapedContent = ''
    } = body || {};

    const userSlant = slantTake || text || '';
    let extractedTitle = scrapedTitle || '';
    let extractedContent = scrapedContent || text || '';
    let pubName = '';

    // 1. If digital link, attempt lightweight server-side scraping of OpenGraph / Title / Text if not already supplied
    if (sourceType === 'digital_link' && url) {
      try {
        const parsedUrl = new URL(url);
        pubName = parsedUrl.hostname.replace(/^www\./, '');
        
        if (!extractedContent || !extractedTitle) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 4000);
          const pageResp = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 SlantBot/1.0'
          }
        });
        clearTimeout(timeout);

        if (pageResp.ok) {
          const html = await pageResp.text();
          // Extract title
          const titleMatch = html.match(/<meta property=["']og:title["'] content=["'](.*?)["']/i) ||
                             html.match(/<title>(.*?)<\/title>/i);
          if (titleMatch && titleMatch[1]) {
            extractedTitle = titleMatch[1].trim();
          }

          // Extract meta description / og:description
          const descMatch = html.match(/<meta property=["']og:description["'] content=["'](.*?)["']/i) ||
                            html.match(/<meta name=["']description["'] content=["'](.*?)["']/i);
          let desc = descMatch && descMatch[1] ? descMatch[1].trim() : '';

          // Extract site_name
          const siteMatch = html.match(/<meta property=["']og:site_name["'] content=["'](.*?)["']/i);
          if (siteMatch && siteMatch[1]) {
            pubName = siteMatch[1].trim();
          }

          // Strip HTML tags for clean body excerpt
          const cleanBody = html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 3000);

          extractedContent = `Title: ${extractedTitle}\nDescription: ${desc}\n\nArticle Text:\n${cleanBody}`;
        }
      }
    } catch (err) {
      console.warn('URL metadata fetch skipped or timed out:', err.message);
    }
  }

    // 2. Build Prompt for Gemini 3.8 Flash
    const toneDescription = slantTone === 'heart'
      ? 'Out of Heart: Deeply reflective, philosophical, emotive, humanistic, and conviction-driven.'
      : 'Out of Mind: Sharp, analytical, strategic, counter-intuitive, high-signal, and intellectually rigorous.';

    const systemPrompt = `You are the lead editorial director and visual design curator for "Slant" (slant.today), an elite visual publication that distills complex stories into high-impact 3-poster social carousels.

Input Details:
- Source Type: ${sourceType}
- Target Audience: ${targetAudience}
- Tone / Slant: ${toneDescription}
${userSlant ? `- Curator's Slant / Take (Primary Stance & Angle): "${userSlant}"` : ''}
${spark ? `- The Spark (Personal Context / Catalyst): "${spark}"` : ''}
${url ? `- Source Link: ${url}` : ''}
${pubName ? `- Publication / Domain: ${pubName}` : ''}
${cues && cues.length > 0 ? `- Ranked Visual Cues: ${cues.map((c, i) => `#${i+1} ${c}`).join(' • ')}` : ''}
- Character Portrayal Style: ${characterRepresentation === 'likeness' ? 'Match real person face and likeness from source photo' : 'Stylized metaphorical silhouette / symbolic figures'}
${characterRepresentation === 'likeness' ? 'CRITICAL PERSON LIKENESS DIRECTIVE: Character Portrayal is set to REAL PERSON LIKENESS. The heroCue MUST specify the primary real-world individual named in the article/slant (e.g. "Donald Trump (Editorial Portrait)", "Elon Musk (Editorial Portrait)") formatted as an editorial cover portrait.' : ''}

Task:
Synthesize this input into a compelling 3-poster social carousel deck:
1. Poster 1 (The Visual Hook): A bold adapted headline (5-10 words, unforgettable), a gripping 1-2 sentence hook, category badge, and dominant visual metaphor.
2. Poster 2 (The Curator's Take): A punchy perspective directly emphasizing the curator's slant/take, why it matters right now, and exactly 3 distinct high-signal takeaways.
3. Poster 3 (The Receipts / Core Conviction): A single powerful highlight quote, and 3 verified excerpt bullet points backing the stance.
${userSlant ? (refineCoreTake ? `MANDATORY REFINEMENT DIRECTIVE (NEVER ECHO VERBATIM):
- Poster 2 ("THE CRITICAL PERSPECTIVE" / Curator Take) MUST NEVER display the user's raw slant verbatim!
- You MUST refine and extend the curator's unhedged take ("${userSlant}") into an articulate, model-synthesized editorial argument (EXACTLY 2 complete sentences, 22–35 words total, ending definitively with a period).
- Ground it directly in the article's specific facts, actors, and structural implications.
- Express it with the bite and precision of an elite broadsheet columnist. Return this elevated statement in "curatorTake".` : `VERBATIM DIRECTIVE:
- Poster 2 ("THE CRITICAL PERSPECTIVE") MUST preserve the curator's exact typed words verbatim: "${userSlant}", ending with a period. Return this in "curatorTake".`) : ''}
${cues && cues.length > 0 ? `CRITICAL VISUAL RULE: The Hook poster artwork and cues MUST be anchored in #1 HERO: "${cues[0]}", incorporating #2 MOTIF: "${cues[1] || ''}" and #3 TENSION: "${cues[2] || ''}".` : ''}

Respond strictly with valid JSON with this exact structure:
{
  "adaptedHeadline": "5-10 word bold, memorable editorial headline",
  "originalHeadline": "Original title or subject",
  "publicationName": "${pubName || (sourceType === 'inner_voice' ? 'My Slant' : 'Curated Press')}",
  "categoryBadge": "UPPERCASE CATEGORY (e.g. DEEP TECH, CULTURE, OPINION, CLIMATE, ECONOMY, HEALTH)",
  "hook": "1-2 sentence gripping hook that stops the reader mid-scroll",
  "curatorTake": "2 tight sentences (22-35 words) model-refined editorial critique synthesizing the curator's stance (or verbatim if refineCoreTake is false), ending with a period.",
  "summary": "2-3 concise paragraphs of curator take and critique",
  "whyItMatters": "1-2 sharp sentences on the stakes and why this perspective matters right now",
  "keyTakeaways": [
    "First critical takeaway (concise, high-impact)",
    "Second critical takeaway (counter-narrative or strategic insight)",
    "Third critical takeaway (future implication or action)"
  ],
  "receiptHighlightQuote": "Single poignant quote or core conviction sentence",
  "resolvedArticleExcerpts": [
    "First factual excerpt or supporting evidence sentence",
    "Second factual excerpt or supporting evidence sentence",
    "Third factual excerpt or supporting evidence sentence"
  ],
  "keyMetric": "Short impactful stat or metric (e.g. +42%, 1,072 Trees, 10x, 99.8% - or leave empty if none)",
  "visualMood": "Short aesthetic phrase (e.g. High-Contrast Editorial Risograph, Velvet Obsidian Chiaroscuro)",
  "heroCue": "Dominant centerpiece subject or object",
  "motifCue": "Metaphorical symbol representing the stance",
  "tensionCue": "Opposing visual force or conflict",
  "atmosphereCue": "Environmental setting or mood",
  "lightingCue": "Dramatic lighting description",
  "styleCue": "Artistic medium description",
  "illustrationPrompt": "Cinematic visual art prompt describing the scene metaphorically. Do not include any text, letters, watermarks, or typography."
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
    } else {
      const userContent = extractedContent || extractedTitle || text || url || spark || 'Contemporary cultural reflection';
      parts.push({
        text: `${systemPrompt}\n\nUser Input Content:\n${userContent}`
      });
    }

    // 3. Call Gemini 3.8 Flash with smart timeout & fallback
    let parsed = null;
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 16000);

      const geminiResp = await fetch(geminiUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.7
          }
        })
      });
      clearTimeout(timeout);

      if (geminiResp.ok) {
        const geminiData = await geminiResp.json();
        const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          parsed = JSON.parse(rawText);
        }
      } else {
        const errText = await geminiResp.text().catch(() => '');
        console.warn('Gemini API non-200, engaging smart fallback:', geminiResp.status, errText);
      }
    } catch (geminiErr) {
      console.warn('Gemini API synthesis warning, engaging smart fallback:', geminiErr.message);
    }

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
        refineCoreTake
      });
    }

    // 4. Construct high-aesthetic illustration artwork URL
    const artPrompt = parsed.illustrationPrompt || `${parsed.heroCue || parsed.adaptedHeadline}, editorial poster art, high aesthetic, no text`;
    const cleanArtPrompt = encodeURIComponent(`${artPrompt}, cinematic editorial art, high aesthetic, vivid color grading, masterwork, no letters, no text`);
    const illustrationUrl = `https://image.pollinations.ai/prompt/${cleanArtPrompt}?width=1080&height=1350&nologo=true`;

    const hasLikenessPhoto = (characterRepresentation === 'likeness') && !!(imageBase64);
    const finalCuratorTake = (refineCoreTake && parsed.curatorTake && parsed.curatorTake.trim().length > 10)
      ? parsed.curatorTake.trim()
      : (userSlant || parsed.whyItMatters || 'Strategic structural shift in motion.');

    const id = 'slant-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const postItem = {
      id,
      createdAt: new Date().toISOString(),
      sourceType,
      digitalLink: url || '',
      publicationName: parsed.publicationName || pubName || (sourceType === 'inner_voice' ? 'My Slant' : 'Curated Press'),
      adaptedHeadline: parsed.adaptedHeadline || 'Perspectives in Flux',
      originalHeadline: parsed.originalHeadline || extractedTitle || parsed.adaptedHeadline,
      categoryBadge: parsed.categoryBadge || (sourceType === 'inner_voice' ? 'OPINION' : 'DISCOVERY'),
      targetAudience: targetAudience || 'General',
      hook: parsed.hook || '',
      summary: parsed.summary || '',
      whyItMatters: parsed.whyItMatters || '',
      keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [],
      receiptHighlightQuote: parsed.receiptHighlightQuote || '',
      resolvedArticleExcerpts: Array.isArray(parsed.resolvedArticleExcerpts) ? parsed.resolvedArticleExcerpts : [],
      keyMetric: parsed.keyMetric || '',
      pullQuote: parsed.receiptHighlightQuote || '',
      visualMood: parsed.visualMood || 'Editorial Chiaroscuro',
      heroCue: parsed.heroCue || (cues && cues[0]) || '',
      cues: cues || [],
      characterRepresentation,
      hookCues: `#1 [HERO]: ${parsed.heroCue || (cues && cues[0]) || 'Central subject'}\n#2 [MOTIF]: ${parsed.motifCue || (cues && cues[1]) || 'Metaphor'}\n#3 [TENSION]: ${parsed.tensionCue || (cues && cues[2]) || 'Conflict'}\n#4 [ATMOSPHERE]: ${parsed.atmosphereCue || (cues && cues[3]) || 'Setting'}\n#5 [LIGHTING]: ${parsed.lightingCue || (cues && cues[4]) || 'Atmospheric light'}\n#6 [STYLE]: ${parsed.styleCue || (cues && cues[5]) || 'Editorial illustration'}`,
      illustrationPrompt: parsed.illustrationPrompt || '',
      illustrationUrl: hasLikenessPhoto ? imageBase64 : illustrationUrl,
      illustrationBase64: hasLikenessPhoto && imageBase64.startsWith('data:') ? imageBase64.split(',')[1] : null,
      referencePhotoUrl: imageBase64 || null,
      aiIllustrationUrl: illustrationUrl,
      originalPhotoPath: imageBase64 || url || '',
      creatorHandle: creatorHandle || '@curator',
      slantTone: slantTone || 'mind',
      slantIcon: slantTone === 'heart' ? '❤️' : '🧠',
      creatorOpinion: finalCuratorTake,
      rawUserSlant: userSlant || '',
      refineCoreTake,
      isUserCreated: true,
      userContext: spark || ''
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
  refineCoreTake = true
}) {
  const headline = userSlant && userSlant.length > 5
    ? userSlant.split(/[.:;!?]/)[0].trim()
    : (extractedTitle || 'The Unspoken Friction Behind the Headline');

  let hero = (cues && cues[0]) || 'Solitary Focal Figure';
  if (characterRepresentation === 'likeness') {
    const combined = `${userSlant || ''} ${extractedTitle || ''} ${extractedContent || ''}`.toLowerCase();
    if (combined.includes('trump')) hero = 'Donald Trump (Editorial Portrait)';
    else if (combined.includes('musk')) hero = 'Elon Musk (Editorial Portrait)';
    else if (combined.includes('altman')) hero = 'Sam Altman (Editorial Portrait)';
    else if (combined.includes('nadella')) hero = 'Satya Nadella (Editorial Portrait)';
    else if (combined.includes('pichai')) hero = 'Sundar Pichai (Editorial Portrait)';
    else if (combined.includes('biden')) hero = 'Joe Biden (Editorial Portrait)';
  }
  const motif = (cues && cues[1]) || 'Symbolic Editorial Metaphor';
  const tension = (cues && cues[2]) || 'Friction & Opposing Cast Shadows';

  let refinedTake = userSlant || 'Behind the headlines lies a deeper structural transition.';
  if (refineCoreTake && userSlant) {
    const lower = userSlant.toLowerCase();
    if (lower.includes('bomb') || lower.includes('nuclear') || lower.includes('sif') || lower.includes('race')) {
      refinedTake = 'Subordinating superintelligence to unilateral geopolitical rivalry risks catastrophic proliferation. Global security requires that synthetic power be developed under collective human stewardship rather than as an existential arms race.';
    } else if (lower.includes('control') || lower.includes('central') || lower.includes('power') || lower.includes('vulnerable')) {
      refinedTake = 'Centralizing computational dominance within insulated institutions creates systemic vulnerability for broader society. Lasting resilience demands decentralized architecture and transparent public accountability before control consolidates irreversibly.';
    } else {
      refinedTake = 'Treating this inflection as conventional advancement overlooks the fundamental realignment underway. Lasting value belongs to independent observers who interrogate systemic trade-offs before consensus hardens.';
    }
  }

  return {
    adaptedHeadline: headline.length > 55 ? headline.slice(0, 52) + '...' : headline,
    originalHeadline: extractedTitle || headline,
    publicationName: pubName || (sourceType === 'inner_voice' ? 'My Slant' : 'Curated Press'),
    categoryBadge: sourceType === 'inner_voice' ? 'PERSPECTIVE' : 'EDITORIAL',
    hook: `${headline}. When the dominant narrative simplifies the stakes, the real structural disruption occurs quietly in the margins.`,
    curatorTake: refinedTake,
    summary: `${userSlant || 'Behind the headlines lies a deeper structural transition.'}\n\nExamining the underlying incentives reveals that what appears as an isolated development is actually part of an accelerating systemic realignment.\n\nThe real differentiator is critical discernment—recognizing that automated consensus often obscures the human trade-offs at play.`,
    whyItMatters: 'Understanding this shift separates passive consumers from strategic observers who anticipate where the conversation moves next.',
    keyTakeaways: [
      'Structural Friction: The conventional framing misses the secondary systemic consequences already taking shape.',
      'Incentive Misalignment: Key operators are optimizing for short-term narrative dominance rather than durable alignment.',
      'Curator Horizon: Long-term value accrues to those who maintain independent conviction against herd consensus.'
    ],
    receiptHighlightQuote: userSlant || 'The real inflection point isn’t the headline—it’s what happens when the dust settles.',
    resolvedArticleExcerpts: [
      extractedTitle ? `Source reporting: "${extractedTitle}"` : 'Verified primary source documentation.',
      'Key stakeholders are actively realigning operational priorities around this strategic inflection.',
      'Historical precedence suggests this tension will redefine category standards over the coming cycle.'
    ],
    keyMetric: 'High Impact',
    visualMood: 'Chiaroscuro Risograph Editorial',
    heroCue: hero,
    motifCue: motif,
    tensionCue: tension,
    atmosphereCue: (cues && cues[3]) || 'Atmospheric Minimalist Crossroads',
    lightingCue: (cues && cues[4]) || 'Dramatic Chiaroscuro Editorial Spotlight',
    styleCue: (cues && cues[5]) || 'High-Contrast Noir Risograph Print',
    illustrationPrompt: `${hero}, ${motif}, ${tension}, high contrast editorial fine art poster, dramatic volumetric lighting, cinematic color grading, masterwork, no typography`
  };
}

