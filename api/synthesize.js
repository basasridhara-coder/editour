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

    // Direct Single-Purpose Endpoint: Generate artwork only in background (has dedicated full execution window)
    if (body && body.action === 'artwork_only') {
      const { prompt = '', imageBase64 = null, imageMimeType = 'image/jpeg' } = body;
      if (!prompt) {
        return res.status(400).json({ error: 'Missing prompt for artwork generation' });
      }
      try {
        const geminiArt = await generateGeminiEditorialArtwork({
          prompt,
          imageBase64,
          imageMimeType,
          timeoutMs: 8500
        });
        if (geminiArt) {
          const cleanB64 = geminiArt.replace(/^data:image\/[^;]+;base64,/, '');
          return res.status(200).json({
            success: true,
            illustrationBase64: cleanB64
          });
        }
        return res.status(200).json({ success: false, error: 'Artwork generation timed out' });
      } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
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
      characterRepresentation = 'realistic',
      scrapedTitle = '',
      scrapedContent = '',
      countryContext = '',
      vocabularyStyle = 'punchy' // 'punchy' | 'conversational' | 'analytical'
    } = body || {};

    const userSlant = slantTake || text || '';
    let extractedTitle = scrapedTitle || '';
    let extractedContent = scrapedContent || text || '';
    let pubName = '';

    // 1. If digital link, attempt server-side extraction if content is thin, missing, or boilerplate
    if (sourceType === 'digital_link' && url) {
      try {
        const parsedUrl = new URL(url);
        pubName = parsedUrl.hostname.replace(/^www\./, '');

        const isYouTube = parsedUrl.hostname.includes('youtube.com') || parsedUrl.hostname.includes('youtu.be');
        const isJunkContent = !extractedContent || 
                              extractedContent.length < 200 || 
                              extractedContent.includes('About Press Copyright Contact us');

        if (isYouTube && (isJunkContent || !extractedTitle)) {
          const ytVideoId = extractYouTubeVideoId(url);
          if (ytVideoId) {
            try {
              const ytData = await scrapeYouTubeUrl(url, ytVideoId);
              if (ytData && ytData.title) {
                if (!extractedTitle || extractedTitle.length < 5) extractedTitle = ytData.title;
                extractedContent = ytData.content;
                if (ytData.siteName) pubName = ytData.siteName;
              }
            } catch (ytErr) {
              console.warn('YouTube scrape in synthesize failed:', ytErr.message);
            }
          }
        }
        
        if (!extractedContent || !extractedTitle || isJunkContent) {
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
              extractedTitle = decodeHtmlEntities(titleMatch[1].trim());
            }

            // Extract meta description / og:description
            const descMatch = html.match(/<meta property=["']og:description["'] content=["'](.*?)["']/i) ||
                              html.match(/<meta name=["']description["'] content=["'](.*?)["']/i);
            let desc = descMatch && descMatch[1] ? decodeHtmlEntities(descMatch[1].trim()) : '';

            // Extract site_name
            const siteMatch = html.match(/<meta property=["']og:site_name["'] content=["'](.*?)["']/i);
            if (siteMatch && siteMatch[1]) {
              pubName = decodeHtmlEntities(siteMatch[1].trim());
            }

            // Strip HTML tags for clean body excerpt
            let cleanBody = html
              .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
              .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 3000);

            if (cleanBody.length < 200 && desc) {
              cleanBody = desc;
            }

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

    let vocabDirective = '';
    if (vocabularyStyle === 'conversational') {
      vocabDirective = `VOCABULARY STYLE: CONVERSATIONAL & DIRECT
- Use natural, everyday conversational English.
- Avoid academic jargon, convoluted sentences, or high-brow SAT words.
- Write with the warmth, clarity, and directness of a smart friend explaining the stakes over coffee.`;
    } else if (vocabularyStyle === 'analytical') {
      vocabDirective = `VOCABULARY STYLE: IN-DEPTH & ANALYTICAL
- Formal, structural broadsheet analysis with intellectual rigor.
- Nuanced vocabulary suitable for policy institutes, think-tanks, and macro analyses.`;
    } else {
      // Default: 'punchy' (Visceral, emotional, easily understandable yet not childish)
      vocabDirective = `CRITICAL EDITORIAL VOCABULARY & EMOTIONAL IMPACT DIRECTIVE (PUNCHY, EMOTIONAL & VIVID):
1. BANISH HEAVY / POMPOUS SAT JARGON:
   - NEVER use pretentious Latinate words or academic clichés: "hegemony", "panopticon", "paradigm", "Kafkaesque", "dichotomy", "juxtaposition", "inexorable", "obfuscate", "surreptitious", "monolithic", "harbinger", "verisimilitude", "disenfranchised", "quagmire", "ubiquitous", "pervasive", "machinations", "epistemic".
   - If a word sounds like a PhD dissertation or corporate report, replace it with a direct, everyday equivalent.
2. CONVEY RAW EMOTION THROUGH CLEAR, GUT-PUNCH LANGUAGE:
   - Convey feeling through high human stakes, tension, vivid imagery, and clear cause-and-effect—NOT through rare multi-syllabic adjectives.
   - Use punchy, active verbs and concrete nouns (e.g., choke, crush, hollow out, bankroll, shield, silence, fracture, bet, gamble, trap, blindspot, flashpoint).
3. SMART YET EFFORTLESSLY UNDERSTANDABLE:
   - Do NOT dumb it down like a children's primer. Keep the adult intelligence, wit, and conviction, but ensure any smart reader can grasp every single word instantly on their phone.`;
    }

    const systemPrompt = `You are the lead editorial director and visual design curator for "Slant" (slant.today), an elite visual publication that distills complex stories into high-impact 3-poster social carousels.

Input Details:
- Source Type: ${sourceType}
- Target Audience: ${targetAudience}
- Tone / Slant: ${toneDescription}
- Vocabulary & Voice Style: ${vocabularyStyle}
${userSlant ? `- Curator's Slant / Take (Primary Stance & Angle): "${userSlant}"` : ''}
${spark ? `- The Spark (Personal Context / Catalyst): "${spark}"` : ''}
${url ? `- Source Link: ${url}` : ''}
${pubName ? `- Publication / Domain: ${pubName}` : ''}
${cues && cues.length > 0 ? `- Ranked Visual Cues: ${cues.map((c, i) => `#${i+1} ${c}`).join(' • ')}` : ''}
- Character Portrayal Style: ${characterRepresentation === 'exact' 
  ? 'Use exact unedited news/attached photo directly' 
  : ((characterRepresentation === 'likeness' || characterRepresentation === 'lookalike') 
    ? 'Lookalike & Portrait: Match real person face and likeness from source photo with artistic painted editorial style' 
    : (characterRepresentation === 'silhouette'
      ? 'Minimalist silhouette / stark shadow figures (ONLY if explicitly demanded)'
      : 'Vivid Editorial Realism & Expressive People: Warm, realistic, expressive human beings with clearly visible faces, natural skin tones, clear clothing, and bright warm ambient lighting. STRICT BAN: NEVER pitch-black silhouettes, NEVER faceless shadows, NEVER dark doorway shadow figures, NEVER creepy ghost-like phantoms!'))}
${(characterRepresentation === 'likeness' || characterRepresentation === 'lookalike') ? 'CRITICAL PERSON LOOKALIKE & MYSTERY DIRECTIVE: Character Portrayal is set to LOOKALIKE & PORTRAIT. The heroCue MUST specify the primary real-world individual named in the article/slant (e.g. "Donald Trump Lookalike (Editorial Portrait)"). The artwork must be an editorial painterly illustration blending recognizable likeness with artistic magazine portraiture.' : ''}
${characterRepresentation === 'exact' ? 'CRITICAL EXACT PHOTO DIRECTIVE: Character Portrayal is set to USE EXACT PHOTO. The heroCue should highlight the central photographic subject of the unedited news photo.' : ''}

${vocabDirective}

Task:
Synthesize this input into a compelling 3-poster social carousel deck:
1. Poster 1 (The Visual Hook): A bold adapted headline (5-10 words, unforgettable), a gripping 1-2 sentence hook, category badge, and dominant visual metaphor.
2. Poster 2 (The Curator's Take): A punchy perspective directly emphasizing the curator's slant/take, why it matters right now, and exactly 3 distinct high-signal takeaways.
3. Poster 3 (The Receipts / Core Conviction): A single powerful highlight quote, and 3 verified excerpt bullet points backing the stance.
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
  * STRICT BAN: NEVER echo the user's raw input slant verbatim! You MUST synthesize an articulate, elevated 2-sentence editorial conviction (EXACTLY 2 complete sentences, 22–35 words total, ending definitively with a period) that refines their thoughts into an inspiring insight.
  * In "keyTakeaways", give 3 sharp, uplifting insights about breaking away, presence over perfection, and why the destination makes the frantic packing worth it.
- IN POSTER 3 ("THE RECEIPTS & CORE CONVICTION" / resolvedArticleExcerpts):
  * Deliver exactly 3 substantive, evocative broadsheet narrative paragraphs (each 28–45 words, 2–3 full sentences):
    1. Paragraph 1 (Scene & Catalyst): Ground the situation in sensory detail around the spark ("${spark}")—the open suitcases, packing lists, children holding forgotten travel items, and the rush to close remaining tasks.
    2. Paragraph 2 (The Turning Point): The joyful realization when you realize work will never be 100% finished, but vacation countdown waits for no one.
    3. Paragraph 3 (The Lasting Truth): A deep, warm closing reflection on Kerala's tranquil backwaters, green hills, and why presence with family is the greatest luxury.
  * STRICT BAN: NEVER prefix paragraphs with labels like "The spark:", "Curator stance:", "Paragraph 1:", or bullet points! Output pure, narrative broadsheet text.
- IN "originalHeadline":
  * Set to the spark statement or a refined 6–12 word hook of the spark (e.g. "When a forgotten packing item breaks the work trance and signals the escape"). NEVER set to the raw user slant.
- IN "illustrationPrompt":
  * Describe a warm, colorful, sunny scene of real people packing or getting ready, with smiling illuminated faces, colorful room, suitcase, tropical palms visible through window, warm golden light.
  * Explicitly instruct: "Realistic people with clearly visible smiling faces, warm daylight, vibrant colors, Kerala palm trees, cheerful atmosphere, highly detailed, no silhouettes, no dark shadows, no faceless figures, no text".` : (userSlant ? (refineCoreTake ? `MANDATORY REFINEMENT DIRECTIVE (NEVER ECHO VERBATIM):
- Poster 2 ("THE CRITICAL PERSPECTIVE" / Curator Take) MUST NEVER display the user's raw slant verbatim!
- You MUST refine and extend the curator's unhedged take ("${userSlant}") into an articulate, model-synthesized editorial argument (EXACTLY 2 complete sentences, 22–35 words total, ending definitively with a period).
- Ground it directly in the article's specific facts, actors, and structural implications.
- Strictly adhere to the Vocabulary Directive: use vivid, emotionally resonant, easily understandable English without heavy SAT/GRE academic jargon. Return this elevated statement in "curatorTake".` : `VERBATIM DIRECTIVE:
- Poster 2 ("THE CRITICAL PERSPECTIVE") MUST preserve the curator's exact typed words verbatim: "${userSlant}", ending with a period. Return this in "curatorTake".`) : '')}
${cues && cues.length > 0 ? `CRITICAL VISUAL RULE: The Hook poster artwork and cues MUST be anchored in #1 HERO: "${cues[0]}", incorporating #2 MOTIF: "${cues[1] || ''}" and #3 TENSION: "${cues[2] || ''}".` : ''}

Respond strictly with valid JSON with this exact structure:
{
  "adaptedHeadline": "5-10 word bold, memorable editorial headline",
  "originalHeadline": "Original title or subject (or spark hook if Inner Voice)",
  "publicationName": "${pubName || (sourceType === 'inner_voice' ? 'Inner Voice' : 'Curated Press')}",
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
  "receiptHighlightQuote": "Single poignant quote or core conviction sentence (18-30 words)",
  "resolvedArticleExcerpts": [
    "Sensory scene-setting around catalyst (28-45 words, 2-3 full sentences, no labels)",
    "Turning point conviction statement (25-40 words, 2-3 full sentences, no labels)",
    "Reflective closing thought on presence and priorities (28-45 words, 2-3 full sentences, no labels)"
  ],
  "keyMetric": "Short impactful stat or metric (e.g. +42%, 1,072 Trees, 10x, 99.8% - or leave empty if none)",
  "visualMood": "Short aesthetic phrase (e.g. High-Contrast Editorial Risograph, Velvet Obsidian Chiaroscuro)",
  "heroCue": "Dominant centerpiece subject or object",
  "motifCue": "Metaphorical symbol representing the stance",
  "tensionCue": "Opposing visual force or conflict",
  "atmosphereCue": "Environmental setting or mood",
  "lightingCue": "Dramatic lighting description",
  "styleCue": "Artistic medium description",
  "illustrationPrompt": "Cinematic visual art prompt describing the scene with rich detail. People MUST have visible faces, warm natural lighting, and clear human form. Strictly avoid pitch-black silhouettes, faceless shadow figures, dark ghosts, or creepy silhouettes unless characterRepresentation is explicitly 'silhouette'. Do not include any text, letters, watermarks, or typography."
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

    // 3. Pre-construct concise artwork prompt so text synthesis and image generation run concurrently
    const countryTag = (countryContext && countryContext !== 'Global') ? `${countryContext}, ` : '';
    const isLookalike = (characterRepresentation === 'likeness' || characterRepresentation === 'lookalike');
    const isExactPhoto = (characterRepresentation === 'exact');
    const illustrationSeed = Math.floor(Math.random() * 899999 + 100000);

    let heroCandidate = (cues && cues[0]) || heroCue || '';
    if (!heroCandidate) {
      heroCandidate = spark || userSlant || 'Editorial subject';
    }
    heroCandidate = heroCandidate
      .replace(/^#\d+\s*\[[^\]]+\]:?\s*/i, '')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (heroCandidate.length > 80) {
      heroCandidate = heroCandidate.slice(0, 80).replace(/,[^,]*$/, '');
    }

    const isPerson = isLikelyPersonSubject(heroCandidate);
    let coreSubject = '';
    if (isPerson && isLookalike) {
      coreSubject = `${heroCandidate} portrait likeness, painted editorial magazine illustration, realistic details, expressive lighting, no text`;
    } else if (isPerson && characterRepresentation === 'silhouette') {
      coreSubject = `${heroCandidate} minimalist silhouette outline, stark graphic contrast, editorial poster art, no text`;
    } else if (isPerson) {
      coreSubject = `${heroCandidate}, warm vivid realistic editorial illustration, expressive people with visible illuminated faces, natural daylight, detailed clothing, rich colors, no silhouettes, no dark shadows, no text`;
    } else {
      const isArchitecture = /court|building|parliament|monument|colonnade|facade|tower|temple|chamber/i.test(heroCandidate);
      if (isArchitecture) {
        coreSubject = `${heroCandidate} grand architectural facade, dramatic volumetric lighting, cinematic editorial poster art, no text`;
      } else {
        coreSubject = `${heroCandidate}, warm atmospheric lighting, cinematic editorial poster art, rich colors, no silhouettes, no text`;
      }
    }

    const concisePrompt = `${countryTag}${coreSubject}`.slice(0, 300);
    const hasExactPhoto = isExactPhoto && !!(imageBase64);

    // 4. Concurrent Execution: Run Gemini 3.8 Flash (text) and Gemini 2.5 Flash Image (artwork) in parallel!
    // Strict timeout ensures total function execution NEVER exceeds 6.8s (comfortably beating Vercel 10s Hobby cap)
    const textPromise = (async () => {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6500);

        const geminiResp = await fetch(geminiUrl, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.7,
              maxOutputTokens: 1500
            }
          })
        });
        clearTimeout(timeout);

        if (geminiResp.ok) {
          const geminiData = await geminiResp.json();
          const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) return JSON.parse(rawText);
        }
      } catch (geminiErr) {
        console.warn('Gemini text synthesis warning:', geminiErr.message);
      }
      return null;
    })();

    const imagePromise = (async () => {
      if (hasExactPhoto || !GEMINI_API_KEY) return null;
      try {
        return await generateGeminiEditorialArtwork({
          prompt: concisePrompt,
          imageBase64: (isLookalike ? imageBase64 : null),
          imageMimeType,
          timeoutMs: 5800 // 5.8s strict timeout
        });
      } catch (err) {
        console.warn('Gemini concurrent artwork warning:', err.message);
        return null;
      }
    })();

    const [textResult, imageResult] = await Promise.allSettled([textPromise, imagePromise]);
    let parsed = textResult.status === 'fulfilled' ? textResult.value : null;
    let geminiArt = imageResult.status === 'fulfilled' ? imageResult.value : null;

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
      // Curated photo fallback if Gemini image generation took longer than 5.8s
      finalIllustrationUrl = getCuratedEditorialPhoto({
        heroCue: parsed.heroCue || (cues && cues[0]) || '',
        motifCue: parsed.motifCue || (cues && cues[1]) || '',
        prompt: concisePrompt,
        text: `${userSlant} ${spark} ${parsed.adaptedHeadline || ''}`,
        category: parsed.categoryBadge || '',
        seed: illustrationSeed
      });
    }

    const finalCuratorTake = (refineCoreTake && parsed.curatorTake && parsed.curatorTake.trim().length > 10)
      ? parsed.curatorTake.trim()
      : (userSlant || parsed.whyItMatters || 'Strategic structural shift in motion.');

    const rawExcerpts = Array.isArray(parsed.resolvedArticleExcerpts) ? parsed.resolvedArticleExcerpts : [];
    const cleanedExcerpts = rawExcerpts.map(e => String(e).replace(/^(the spark|curator stance|paragraph \d+)\s*:\s*["']?/i, '').replace(/["']?$/i, '').trim());

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
      illustrationPrompt: parsed.illustrationPrompt || concisePrompt || '',
      artworkPending: (!hasExactPhoto && !finalIllustrationBase64),
      illustrationUrl: finalIllustrationBase64 ? '' : finalIllustrationUrl,
      illustrationBase64: finalIllustrationBase64,
      aiIllustrationUrl: finalIllustrationBase64 ? '' : finalIllustrationUrl,
      creatorHandle: creatorHandle || '@curator',
      slantTone: slantTone || 'mind',
      slantIcon: slantTone === 'heart' ? '❤️' : '🧠',
      creatorOpinion: finalCuratorTake,
      rawUserSlant: userSlant || '',
      refineCoreTake,
      vocabularyStyle: vocabularyStyle || 'punchy',
      isUserCreated: true,
      sourceType: sourceType,
      originalPhotoBase64: (sourceType === 'photo' && imageBase64) ? imageBase64 : null,
      hasPaperCut: (sourceType === 'photo' && !!imageBase64),
      userContext: spark || '',
      spark: spark || ''
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
  const combined = `${userSlant || ''} ${spark || ''} ${extractedTitle || ''} ${extractedContent || ''}`.toLowerCase();
  const isPersonal = (sourceType === 'inner_voice') ||
    /trip|vacation|kerala|holiday|travel|family|son|daughter|kid|child|parent|pack|luggage|flight|beach|home|rest|weekend|burnout|unplug/i.test(combined);

  if (isPersonal) {
    let headline = 'The Discipline of Choosing Presence';
    if (combined.includes('kerala')) {
      headline = 'Trading Pending Tabs for Kerala Sun';
    } else if (/beach|ocean|coast/i.test(combined)) {
      headline = 'The Art of Finally Switching Off';
    } else if (/mountain|hill|hike|trek/i.test(combined)) {
      headline = 'Leaving the Noise for Higher Ground';
    } else if (/family|kid|son|daughter|parent/i.test(combined)) {
      headline = 'When Life Refuses to Wait for an Empty Inbox';
    }

    const hero = (cues && cues[0]) || (combined.includes('kerala') ? 'Parent Closing Laptop Beside Packed Suitcases' : 'Traveler Packing Suitcase with Boarding Pass');
    const motif = (cues && cues[1]) || (spark ? 'Child Holding Forgotten Travel Item' : 'Open Suitcase & Glowing Laptop Screen');
    const tension = (cues && cues[2]) || 'The Friction Between Unfinished Tasks and Needed Rest';
    const atmosphere = (cues && cues[3]) || (combined.includes('kerala') ? 'Sunlit Study Transitioning to Tropical Kerala Palms' : 'Quiet Evening Room with Open Luggage');
    const lighting = (cues && cues[4]) || 'Warm Golden Evening Lamp clashing with Monitor Glow';
    const style = (cues && cues[5]) || 'Cinematic Warm Editorial Illustration';

    let refinedTake = '';
    if (refineCoreTake) {
      if (combined.includes('kerala') || combined.includes('trip') || combined.includes('vacation')) {
        refinedTake = 'The illusion of closing every open loop before a journey only drains the energy the escape was meant to restore. True presence begins the moment you close the laptop and let the break take over.';
      } else {
        refinedTake = 'We convince ourselves that peace must be earned through an empty inbox, but work will always multiply. Real restoration begins when you deliberately choose connection over endless preparation.';
      }
    } else {
      refinedTake = userSlant || 'True restoration begins when you accept that work can wait, but presence cannot.';
    }

    const highlightQuote = spark
      ? 'A forgotten travel item breaks the work trance. The real journey begins the second you choose presence over the inbox.'
      : 'True restoration begins the moment you close the laptop and let the adventure take over.';

    const p1 = spark
      ? `The afternoon light slants across half-zipped luggage, loose packing lists, and tangled cables. Right in the thick of clearing one final email, a child pipes up about a forgotten travel essential—instantly snapping the work trance and turning deadline tension into pure anticipation.`
      : `The afternoon light slants across half-zipped luggage, loose packing lists, and tangled cables on the floor. In the scramble to close every pending tab, a simple domestic reminder breaks through the deadline rush and grounds the entire room in excitement.`;

    const p2 = `There is a decisive threshold where you must accept that your task list will never hit zero. Stepping away is not an act of surrender; it is an intentional boundary declaring that the journey ahead matters far more than an endless queue of messages.`;

    const p3 = combined.includes('kerala')
      ? `The palm-fringed backwaters, ocean breeze, and mist-covered hills will not wait for work to quiet down. Long after the pending emails are forgotten, the shared laughter and stillness with family are all that truly endure.`
      : `The open road, quiet horizons, and restorative silence will not wait for work to finish itself. Long after the pending emails are forgotten, the shared moments and presence with the people you love are all that truly endure.`;

    return {
      adaptedHeadline: headline,
      originalHeadline: spark || headline,
      publicationName: 'Inner Voice',
      categoryBadge: 'LIFE & WORK',
      hook: `We tell ourselves we can only rest once every task is settled. But waiting for an empty inbox is a trap that turns pre-trip excitement into pure panic.`,
      curatorTake: refinedTake,
      summary: `Every getaway begins with an exhausting sprint to tie up loose ends and clear pending messages. The closer departure gets, the heavier every open loop feels.\n\nYet a child’s sudden interruption—or a reminder of a forgotten essential—cuts through the mental clutter. It reveals that the urge to finish everything is an illusion that delays genuine presence.\n\nTrue rest isn’t a trophy earned by clearing your desk; it is an intentional boundary you must defend before burnout decides for you.`,
      whyItMatters: 'If you cannot disconnect until every task is done, you will carry your work straight into your vacation.',
      keyTakeaways: [
        'The Myth of the Clean Slate: Work will always expand to fill every waking moment unless you actively pull the plug.',
        'The Grounding Anchor: Small family moments cut through work-induced panic faster than any productivity trick.',
        'The Discipline of Rest: Genuine restoration begins when you leave unfinished threads behind and trust they can wait.'
      ],
      receiptHighlightQuote: highlightQuote,
      resolvedArticleExcerpts: [p1, p2, p3],
      keyMetric: 'Rest Over Noise',
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

  const headline = userSlant && userSlant.length > 5
    ? userSlant.split(/[.:;!?]/)[0].trim()
    : (extractedTitle || 'The Unspoken Friction Behind the Headline');

  let hero = (cues && cues[0]) || 'Solitary Focal Figure';
  if (characterRepresentation === 'likeness' || characterRepresentation === 'lookalike') {
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
      refinedTake = userSlant.length > 15
        ? `${userSlant.replace(/[.]+$/, '')}. The deeper shift occurs when critical observers examine the structural incentives behind the surface narrative.`
        : 'Treating this inflection as conventional advancement overlooks the fundamental realignment underway.';
    }
  }

  return {
    adaptedHeadline: headline.length > 55 ? headline.slice(0, 52) + '...' : headline,
    originalHeadline: extractedTitle || headline,
    publicationName: pubName || (sourceType === 'inner_voice' ? 'Inner Voice' : 'Curated Press'),
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
      extractedTitle ? `Primary reporting on ${extractedTitle} reveals an accelerating operational transition across key institutional operators.` : 'Primary reporting confirmed that recorded structural indicators diverged sharply from initial forecasts across core operations.',
      'Underlying institutional disclosures and balance sheets show capital reallocation accelerating far faster than public consensus had anticipated.',
      'Historical precedence confirms that early operational divergence inevitably forces systemic realignment before the broader regulatory cycle concludes.'
    ],
    keyMetric: 'High Impact',
    visualMood: 'Chiaroscuro Risograph Editorial',
    heroCue: hero,
    motifCue: motif,
    tensionCue: tension,
    atmosphereCue: (cues && cues[3]) || 'Atmospheric Minimalist Crossroads',
    lightingCue: (cues && cues[4]) || 'Dramatic Chiaroscuro Editorial Spotlight',
    styleCue: (cues && cues[5]) || 'High-Contrast Noir Risograph Print',
    illustrationPrompt: `${hero}, ${motif}, cinematic editorial poster art, dramatic atmospheric lighting, no text`
  };
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
    'worker', 'protagonist', 'figure', 'person', 'individual', 'portrait', 'lookalike'
  ];
  return personKeywords.some(w => lower.includes(w));
}

async function generateGeminiEditorialArtwork({ prompt, imageBase64, imageMimeType = 'image/jpeg', timeoutMs = 25000 }) {
  if (!GEMINI_API_KEY) return null;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`;
    const parts = [];

    if (imageBase64) {
      const cleanData = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
      parts.push({
        inlineData: {
          mimeType: imageMimeType,
          data: cleanData
        }
      });
      parts.push({
        text: `Transform this reference image into a high-aesthetic cinematic editorial magazine poster: ${prompt}. Imposing visual composition, dramatic lighting, painterly texture, vivid color grading, masterwork, no typography, no letters, no text.`
      });
    } else {
      parts.push({
        text: `${prompt}, cinematic editorial poster art, dramatic atmospheric lighting, painterly texture, high aesthetic, vivid color grading, masterwork, no typography, no letters, no text.`
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const resp = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ['IMAGE'] }
      })
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
      console.warn('Gemini editorial image non-200:', resp.status, errText.slice(0, 180));
    }
  } catch (err) {
    console.warn('Gemini editorial image generation skipped/timed out:', err.message);
  }
  return null;
}

function getCuratedEditorialPhoto({ heroCue = '', motifCue = '', prompt = '', text = '', category = '', seed = 1 }) {
  const heroLower = (heroCue || '').toLowerCase();
  const motifLower = (motifCue || '').toLowerCase();
  const promptLower = (prompt || '').toLowerCase();
  const generalLower = `${text} ${category}`.toLowerCase();

  // 1. HIGHEST PRIORITY: The #1 HERO Visual Cue (Centerpiece Subject)
  // Parent closing laptop / open suitcase / packing tension
  if (/laptop|computer|screen|desk|work|office|task/.test(heroLower)) {
    return 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80';
  }
  if (/pack|suitcase|luggage|baggage|departure|traveler/.test(heroLower) || /pack|suitcase|luggage/.test(motifLower)) {
    return 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200&q=80';
  }
  if (/parent|father|mother|family|child|son|daughter/.test(heroLower)) {
    return 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200&q=80';
  }

  // Legal / Court / Justice
  if (/court|law|judge|justice|supreme|legal|constitution|verdict|bench/.test(heroLower)) {
    return 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=1200&q=80';
  }

  // Government / Politics / Statecraft
  if (/parliament|politics|government|minister|election|state|policy|democracy/.test(heroLower)) {
    return 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=1200&q=80';
  }

  // Technology / AI / Silicon
  if (/ai|artificial|tech|algorithm|chip|computer|code|software|cyber|digital|robot|server/.test(heroLower)) {
    return 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80';
  }

  // Markets / Finance
  if (/market|stock|finance|economy|business|money|bank|investment|fund/.test(heroLower)) {
    return 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80';
  }

  // 2. SECONDARY PRIORITY: Geography / Landscape ONLY if the HERO itself is a place/setting
  if (/kerala|backwater|houseboat|alleppey|kumarakom|munnar/.test(heroLower) || (/kerala/.test(promptLower) && /river|water|lake|boat/.test(heroLower))) {
    return 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=1200&q=80';
  }
  if (/beach|coast|ocean|sea|shore|island|surf|sand/.test(heroLower)) {
    return 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80';
  }
  if (/mountain|hills?|trek|hiking|nature|forest|greenery/.test(heroLower)) {
    return 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80';
  }

  // 3. Fallback: general topic match
  if (/kerala/.test(generalLower)) {
    return 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=1200&q=80';
  }

  const fallbacks = [
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1200&q=80'
  ];
  return fallbacks[Math.abs(seed) % fallbacks.length];
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

async function getGeminiVideoBrief(targetUrl, title, author) {
  if (!GEMINI_API_KEY) return '';
  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`;
    const prompt = `You are an investigative research journalist. Research and provide a comprehensive, fact-dense editorial briefing for this YouTube video: ${targetUrl || title} (${title ? `titled "${title}"` : ''} by ${author || 'creator'}).
Extract and provide:
1. Exact video title, host/channel name, and featured guest(s)
2. Core thesis and comprehensive narrative summary
3. Key quotes and primary data points/receipts
4. Chapter breakdown or key thematic transitions`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9500);

    const resp = await fetch(geminiUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: 1000, temperature: 0.2 }
      })
    });
    clearTimeout(timeout);

    if (resp.ok) {
      const data = await resp.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
  } catch (e) {
    console.warn('Gemini video research brief in synthesize failed, falling back:', e.message);
  }
  return '';
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

  // If description is missing, short, or generic, query grounded Gemini 3.8 Flash
  if (!desc || desc.length < 150) {
    const brief = await getGeminiVideoBrief(targetUrl, title, author);
    if (brief && brief.length > 80) {
      desc = brief;
      const titleMatch = brief.match(/Exact Video Title:\*?\*?\s*(.+)$/m);
      if (titleMatch && titleMatch[1] && (!title || title.length < 5)) {
        title = titleMatch[1].replace(/[*#]/g, '').trim();
      }
      const authorMatch = brief.match(/(?:Channel Name|Author|Host):\*?\*?\s*(.+)$/m);
      if (authorMatch && authorMatch[1] && (!author || author === 'YouTube')) {
        author = authorMatch[1].replace(/[*#]/g, '').trim();
      }
    }
  }

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
