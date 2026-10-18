// Serverless Function: /api/synthesize
// Synthesizes raw inputs (Web links, Photos/Clippings, Inner Voice)
// into a complete 3-poster Slant carousel using Gemini 3.8 Flash.

const DEFAULT_KEY_B64 = 'QVEuQWI4Uk42STR5WnQzMEl6NGpLRkQ2SndaYVlSeThQYlVtWXpDYUNuMzU3alIyUU9KbFE=';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || Buffer.from(DEFAULT_KEY_B64, 'base64').toString('utf8');
const GEMINI_MODEL = 'gemini-3.8-flash';

const SUPABASE_URL = 'https://fsuukgpizuipxxwatkbo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzdXVrZ3BpenVpcHh4d2F0a2JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMzE4NjEsImV4cCI6MjEwNjcwNzg2MX0.NPnTDhGyiigPZIvror8JGqjCMVKuJ8OZaDN2pGuVfM8';
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
      const { prompt = '', imageBase64 = null, imageMimeType = 'image/jpeg', creatorEmail = '' } = body;
      const userEmail = (creatorEmail || '').toLowerCase().trim();
      if (!userEmail) {
        return res.status(401).json({ error: 'Slant Studio is currently in Private Preview. Please sign in with your invited Google account.' });
      }
      const isAllowed = await verifyEmailIsWhitelisted(userEmail);
      if (!isAllowed) {
        return res.status(403).json({ error: 'Slant Studio is currently in Private Preview by invitation only.' });
      }
      if (!prompt) {
        return res.status(400).json({ error: 'Missing prompt for artwork generation' });
      }
      try {
        const geminiArt = await generateGeminiEditorialArtwork({
          prompt,
          imageBase64,
          imageMimeType,
          timeoutMs: 16000
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

    // Direct Single-Purpose Endpoint: Polish & Review Take (Strict Copy-Editing, No Opinion Alteration)
    if (body && (body.action === 'polish_take' || body.action === 'review_take')) {
      const { text = '', slantTake = '' } = body;
      const rawText = String(text || slantTake || '').trim();
      if (!rawText || rawText.length < 5) {
        return res.status(400).json({ error: 'Please enter a take to polish.' });
      }

      // Fast baseline polish using rule-based formatter
      const baselinePolished = formatCuratorTakeApt(rawText);

      // Call Gemini for high-precision, nuanced English copy-editing with thinkingBudget: 0 for speed (<2s)
      try {
        const copyEditPrompt = `You are a world-class literary copy-editor and phrasing specialist.
The author has written their personal conviction / take on a topic.
Your sole job is to polish their exact text into grammatically correct, natural, and apt English:
- STRICT RULE 1 (ZERO OPINION FABRICATION): DO NOT change, enhance, add to, or modify the author's opinion, stance, or logic. Do NOT introduce new arguments, buzzwords, or unsolicited ideas.
- STRICT RULE 2 (ZERO CUTTING SHORT): DO NOT cut short, truncate, compress, or omit the author's opinion. Every single point, argument, nuance, and example must be retained in the exact same sequence.
- STRICT RULE 3 (APT ENGLISH & PHRASING): Fix comma splices, run-on sentences, awkward phrasing, word choices, subject-verb agreements, casing, and punctuation so it flows naturally and authoritatively.
- STRICT RULE 4 (STRICT BAN ON EM-DASHES & ARTIFICIAL HYPHENS): NEVER use em-dashes ("—"), en-dashes ("–"), or double hyphens ("--")! LLM hyphens make human text look artificially AI-generated. Connect clauses with natural commas, semicolons, conjunctions, or separate sentences.
- STRICT RULE 5 (PURE OUTPUT): Return ONLY the polished take text. Do NOT add quotation marks, do NOT add introductory conversational words, and do NOT wrap in markdown or backticks.

Author's Raw Take:
"""${rawText}"""`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const geminiResp = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: copyEditPrompt }] }],
            generationConfig: {
              temperature: 0.1,
              thinkingConfig: { thinkingBudget: 0 },
              maxOutputTokens: 1024
            }
          }),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (geminiResp.ok) {
          const geminiData = await geminiResp.json();
          let candidate = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
          candidate = candidate.trim().replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, '').trim();
          if (candidate.length > 10) {
            return res.status(200).json({
              success: true,
              original: rawText,
              polished: formatCuratorTakeApt(candidate)
            });
          }
        }
      } catch (err) {
        console.warn('Gemini copy-edit notice, falling back to rule-based polish:', err.message);
      }

      // Graceful fallback to rule-based polish
      return res.status(200).json({
        success: true,
        original: rawText,
        polished: baselinePolished
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
      vocabularyStyle = 'punchy', // 'punchy' | 'conversational' | 'analytical'
      perspectiveMode = 'hybrid', // 'curator' | 'hybrid' | 'source'
      sourceImageUrl = null,
      sourceImageBase64 = null,
      sourceImageMimeType = 'image/jpeg',
      sourceLedger = null
    } = body || {};

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
                  sourceImageUrl = imgMatch[1].trim();
                }
              }
            }
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

    const perspectiveDirective = (perspectiveMode === 'curator')
      ? `CRITICAL PERSPECTIVE DIRECTIVE (CURATOR ANGLE):
- The curator selected CURATOR ANGLE mode.
- In Poster 1 ("VISUAL HOOK"): The adapted headline and hook must be driven 100% by the curator's unique, provocative perspective ("${userSlant}").
- In Poster 2 ("THE CRITICAL PERSPECTIVE"): Elevate and highlight the curator's personal thesis as the centerpiece.
- In Poster 3 ("THE RECEIPTS"): Use the source facts and observations to substantiate and prove the curator's stance.`
      : (perspectiveMode === 'source')
      ? `CRITICAL PERSPECTIVE DIRECTIVE (SOURCE GROUNDED):
- The curator selected SOURCE GROUNDED mode.
- In Poster 1 ("VISUAL HOOK"): The adapted headline and hook must strictly report the primary development, event, or facts of the source article/video.
- In Poster 2 ("KEY DEVELOPMENTS / TAKEAWAYS"): Synthesize the core findings, developments, and implications of the reportage.
- In Poster 3 ("THE RECEIPTS / BROADSHEET REPORT"): Deliver verified broadsheet excerpts and quotes directly faithful to the source material.`
      : `CRITICAL PERSPECTIVE DIRECTIVE (HYBRID CONTRAST - THE SLANT SIGNATURE):
- In Poster 1 ("VISUAL HOOK"): Present a high-tension blend of the core news subject and the curator's critical angle.
- In Poster 2 ("THE CRITICAL PERSPECTIVE"): Deliver the curator's elevated conviction in counterpoint to the news.
- In Poster 3 ("BROADSHEET IN DIALOGUE"): Put the curator's voice in deep, thoughtful dialogue with the source's findings.`;

    const demographicInfo = detectAgeAndDemographics(userSlant, extractedTitle, extractedContent);

    const systemPrompt = `You are the lead editorial director and visual design curator for "Slant" (slant.today), an elite visual publication that distills complex stories into high-impact 3-poster social carousels.

Input Details:
- Source Type: ${sourceType}
- Perspective Focus: ${perspectiveMode === 'curator' ? 'Curator Angle' : (perspectiveMode === 'source' ? 'Source Grounded' : 'Hybrid Contrast')}
- Target Audience: ${targetAudience}
- Tone / Slant: ${toneDescription}
- Vocabulary & Voice Style: ${vocabularyStyle}
${userSlant ? `- Curator's Slant / Take (Primary Stance & Angle): "${userSlant}"` : ''}
${spark ? `- The Spark (Personal Context / Catalyst): "${spark}"` : ''}
${url ? `- Source Link: ${url}` : ''}
${pubName ? `- Publication / Domain: ${pubName}` : ''}
${demographicInfo ? `- Featured Protagonist Age & Demographics: ${demographicInfo.promptDesc}` : ''}
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

${perspectiveDirective}
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
  * STRICT BAN: NEVER echo the user's raw input slant verbatim! You MUST synthesize an articulate, elevated 2-sentence editorial conviction (EXACTLY 2 complete sentences, 25–35 words total, ending definitively with a period) that refines their thoughts into an inspiring insight.
  * In "keyTakeaways", give 3 sharp, uplifting insights about breaking away, presence over perfection, and why the destination makes the frantic packing worth it.
- IN POSTER 3 ("THE RECEIPTS & CORE CONVICTION" / resolvedArticleExcerpts):
  * Deliver exactly 3 substantive, evocative broadsheet narrative paragraphs (each 50–75 words, 3–4 full sentences):
    1. Paragraph 1 (Scene & Catalyst): Ground the situation in sensory detail around the spark ("${spark}")—the open suitcases, packing lists, children holding forgotten travel items, and the rush to close remaining tasks.
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
CRITICAL POSTER 2 DIRECTIVE (CURATED TAKE DERIVED FROM INPUT):
- Poster 2 ("THE CRITICAL PERSPECTIVE" / Curator Take) MUST be an articulate, model-synthesized editorial conviction derived directly from the curator's perspective ("${userSlant}").
- It MUST be EXACTLY 2 complete sentences (25–35 words total, ending definitively with a period).
- Elevate and synthesize the core thesis of the curator's stance into a high-impact, punchy pull-quote that fits an editorial poster frame without filling the entire poster. Return this in "curatorTake".` : '')}
${sourceType === 'video_audio' ? `CRITICAL VIDEO & AUDIO BROADCAST DIRECTIVE:
- This slant is rooted in a VIDEO or AUDIO broadcast (e.g. YouTube interview, podcast episode, keynote, or debate).
- Mental model: "I watched/listened to something that sparked a reaction."
- Frame the adapted headline with the immediacy, conversational tension, or contrarian takeaway of a spoken dialogue.
- Poster 2 ("THE CRITICAL PERSPECTIVE" / curatorTake): Capture the key realization, counter-slant, or pushback against what was said in the broadcast.` : ''}
${userSlant && sourceType !== 'inner_voice' ? `CRITICAL POSTER 3 DIRECTIVE (ELABORATED USER TAKE IN DIALOGUE WITH SOURCE):
- Poster 3 is the curator's broadsheet essay where the curator's stance/take is ELABORATED IN DIRECT CONNECTION WITH THE ATTACHED SOURCE.
- It must NOT be a dry, third-person summary or detached book report of the source piece (the objective source ledger is already accessible to the reader on tap from Posters 1 & 2).
- Poster 3 must synthesize the curator's perspective into a substantive 3-paragraph broadsheet editorial:
  * Paragraph 1 (The Catalyst & The Modern Friction): The curator's opening thesis connecting their personal conviction/angle to the core dilemma explored by the source author/speaker (exactly 50–60 words, 3 concise sentences with strong opening for dropcap).
  * Paragraph 2 (Engaging the Source in Depth): Directly engage with the author's/speaker's concrete concepts, arguments, or data points (e.g. citing specific teachings, findings, or claims), using them to substantiate and deepen the curator's stance (exactly 45–55 words, 2–3 sentences).
  * Paragraph 3 (The Human Stakes & Prescriptive Resolution): Detail the deeper personal, familial, or societal implications, offering an intentional boundary or forward-looking resolution (exactly 40–50 words, 2 sentences).
- STRICT BAN: Never echo the user's raw slant verbatim across paragraphs! Elaborate the thought with depth, narrative richness, and intellectual conviction. Output pure broadsheet paragraphs without labels like "Paragraph 1:".
- "keyTakeaways": Exactly 3 sharp, structured conviction principles formulated from the elaborated take in dialogue with the source (each exactly 10–13 words with bold title prefix, e.g. "Title: Core insight").
- "receiptHighlightQuote": A poignant, high-impact core conviction sentence (exactly 18–22 words) capturing the heart of the curator's stance in connection with the source.` : ''}

CRITICAL POSTER 3 "1-MINUTE READ" WORD BUDGET DIRECTIVE:
Poster 3 ("SLANT MINUTE" / 60-SEC BROADSHEET) MUST strictly target 180 to 220 words total across all elements:
- Paragraph 1: exactly 50–60 words
- Paragraph 2: exactly 45–55 words
- Paragraph 3: exactly 40–50 words
- Total 3-paragraph essay: 135–165 words
- Highlight Quote: exactly 18–22 words
- 3 Key Takeaways: exactly 30–40 words total (~10–13 words each)
GRAND TOTAL: 180–220 words for an authentic 60-second read. Never exceed 60 words in any single paragraph.
${cues && cues.length > 0 ? `CRITICAL VISUAL RULE: The Hook poster artwork and cues MUST be anchored in #1 HERO: "${cues[0]}", incorporating #2 MOTIF: "${cues[1] || ''}" and #3 TENSION: "${cues[2] || ''}".` : ''}

Respond strictly with valid JSON with this exact structure:
{
  "adaptedHeadline": "5-10 word bold, memorable editorial headline",
  "originalHeadline": "Original title or subject (or spark hook if Inner Voice)",
  "publicationName": "${pubName || (sourceType === 'inner_voice' ? 'Inner Voice' : (sourceType === 'video_audio' ? 'Broadcast Slant' : 'Curated Press'))}",
  "categoryBadge": "UPPERCASE CATEGORY (e.g. DEEP TECH, CULTURE, OPINION, CLIMATE, ECONOMY, HEALTH)",
  "hook": "1-2 sentence gripping hook that stops the reader mid-scroll",
  "polishedCuratorTake": "${userSlant ? 'The curator\'s exact full-length input with gentle grammar, spelling, and phrase corrections applied (preserving 100% of their voice, thoughts, and length).' : ''}",
  "curatorTake": "EXACTLY 2 complete sentences (25-35 words total, ending with a period) of elevated, punchy editorial conviction derived directly from the curator's perspective (do NOT dump long raw text here).",
  "summary": "${sourceType === 'inner_voice' ? 'Exactly 3 broadsheet paragraphs of lived experience reflection (50-60, 45-55, 40-50 words; 135-165 words total).' : (userSlant ? 'Exactly 3 broadsheet paragraphs elaborating the curator\'s take in direct connection with the attached source (50-60, 45-55, 40-50 words; 135-165 words total). Never an objective book report.' : 'Exactly 3 broadsheet paragraphs of objective journalistic reporting (50-60, 45-55, 40-50 words; 135-165 words total).')}",
  "whyItMatters": "1-2 sharp sentences on the stakes and why this perspective matters right now (18-28 words)",
  "keyTakeaways": [
    "${sourceType === 'inner_voice' ? 'First personal takeaway (10-13 words, Title: Insight)' : (userSlant ? 'First core conviction principle connecting take and source (10-13 words, Title: Insight)' : 'First key source finding (10-13 words, Title: Finding)')}",
    "${sourceType === 'inner_voice' ? 'Second personal takeaway (10-13 words, Title: Insight)' : (userSlant ? 'Second core conviction principle detailing human/personal stakes (10-13 words, Title: Insight)' : 'Second key source finding or trade-off (10-13 words, Title: Insight)')}",
    "${sourceType === 'inner_voice' ? 'Third personal takeaway (10-13 words, Title: Insight)' : (userSlant ? 'Third core conviction principle offering an intentional boundary (10-13 words, Title: Insight)' : 'Third structural implication (10-13 words, Title: Implication)')}"
  ],
  "receiptHighlightQuote": "${sourceType === 'inner_voice' ? 'Single poignant core conviction sentence (18-22 words)' : (userSlant ? 'A poignant core conviction sentence capturing the heart of the curator stance in dialogue with the source (18-22 words)' : 'A direct quote, core factual assertion, or official thesis directly from the source author/speaker (18-22 words).')}",
  "resolvedArticleExcerpts": [
    "${sourceType === 'inner_voice' ? 'Paragraph 1 (Scene & Catalyst): exactly 50-60 words without labels.' : (userSlant ? 'Paragraph 1 (Catalyst & Friction): exactly 50-60 words elaborating opening thesis in dialogue with source topic without labels.' : 'Paragraph 1 (Source Subject & Context): exactly 50-60 words without labels.')}",
    "${sourceType === 'inner_voice' ? 'Paragraph 2 (The Turning Point): exactly 45-55 words without labels.' : (userSlant ? 'Paragraph 2 (Engaging Source Claims): exactly 45-55 words engaging source concepts to substantiate critique without labels.' : 'Paragraph 2 (Core Evidence & Claims): exactly 45-55 words without labels.')}",
    "${sourceType === 'inner_voice' ? 'Paragraph 3 (The Lasting Truth): exactly 40-50 words without labels.' : (userSlant ? 'Paragraph 3 (Human Stakes & Resolution): exactly 40-50 words detailing personal/family impact and lasting resolution without labels.' : 'Paragraph 3 (Underlying Conflict or Trade-offs): exactly 40-50 words without labels.')}"
  ],
  "keyMetric": "Short impactful stat or metric (e.g. +42%, 1,072 Trees, 10x, 99.8% - or leave empty if none)",
  "visualMood": "Short aesthetic phrase (e.g. High-Contrast Editorial Risograph, Velvet Obsidian Chiaroscuro)",
  "heroCue": "Dominant centerpiece subject or object",
  "motifCue": "Metaphorical symbol representing the stance",
  "tensionCue": "Opposing visual force or conflict",
  "atmosphereCue": "Environmental setting or mood",
  "lightingCue": "Dramatic lighting description",
  "styleCue": "Artistic medium description",
  "illustrationPrompt": "Cinematic visual art prompt describing the scene with rich detail.${demographicInfo ? ` The central subject MUST be depicted accurately as ${demographicInfo.promptDesc}.` : ''} People MUST have visible faces, warm natural lighting, and clear human form. Strictly avoid pitch-black silhouettes, faceless shadow figures, dark ghosts, or creepy silhouettes unless characterRepresentation is explicitly 'silhouette'. Do not include any text, letters, watermarks, or typography."
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
        effectiveCatalystImage ? `Real-World Catalyst Scene Photo: [Attached image depicts the physical real-world scene, moment, or subject that sparked this inner voice reflection. Visually identify what is in this scene and weave its tangible elements, lighting, and environmental contrast into the headline, hook, takeaways, and illustrationPrompt.]` : ''
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
    if (isPerson && isLookalike) {
      partsList.push(`${ageDesc}${heroCandidate} portrait likeness, painted magazine cover illustration, realistic recognizable features, expressive gaze`);
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
        const timeout = setTimeout(() => controller.abort(), 12000);

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
    let finalCuratorTake = (parsed.curatorTake && parsed.curatorTake.trim().length > 10)
      ? parsed.curatorTake.trim()
      : (userSlant || 'Strategic structural shift in motion.');

    finalCuratorTake = formatCuratorTakeApt(finalCuratorTake);

    // Ensure Poster 2 curated take stays strictly within 2-sentence visual budget (25-35 words)
    const takeSents = finalCuratorTake.split(/(?<=[.!?])\s+/);
    if (takeSents.length > 2 && finalCuratorTake.length > 220) {
      finalCuratorTake = takeSents.slice(0, 2).join(' ');
    }

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
      creatorOpinion: finalPolishedCuratorTake || finalCuratorTake,
      curatorTake: finalCuratorTake,
      polishedCuratorTake: finalPolishedCuratorTake || formatCuratorTakeApt(userSlant || finalCuratorTake),
      rawUserSlant: userSlant || '',
      refineCoreTake,
      vocabularyStyle: vocabularyStyle || 'punchy',
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
        vocabularyStyle: vocabularyStyle || 'punchy',
        countryContext: countryContext || 'India',
        scrapedTitle: extractedTitle || '',
        scrapedContent: extractedContent || '',
        contextProvided: userSlant || extractedContent || spark || '',
        sourceLedger: sourceLedger || null,
        illustrationPrompt: parsed.illustrationPrompt || concisePrompt || '',
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
      receiptHighlightQuote: userSlant || 'Clarity is not found in the noise—it is cultivated in the pauses between demands.',
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
      p2 = `This critique directly engages the underlying source reality—specifically that ${sourceAssertion}. Passive willpower alone cannot overcome environments engineered for perpetual engagement; without deliberate boundaries, mental bandwidth is systematically hijacked before we can address what truly matters.`;
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
    'founder', 'engineer', 'entrepreneur', 'student', 'youth', 'actor', 'author', 'critic', 'analyst', 'politician'
  ];
  return personKeywords.some(w => lower.includes(w));
}

async function generateGeminiEditorialArtwork({ prompt, imageBase64, imageMimeType = 'image/jpeg', timeoutMs = 16000 }) {
  if (!GEMINI_API_KEY) return null;
  const imageModels = [
    'gemini-2.5-flash-image',
    'gemini-3.1-flash-image',
    'gemini-3.1-flash-lite-image'
  ];

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
      text: `Transform this reference image into a high-aesthetic cinematic editorial magazine poster in 4:5 vertical portrait format: ${prompt}. Imposing visual composition, dramatic lighting, painterly texture, vivid color grading, masterwork, no typography, no letters, no text.`
    });
  } else {
    parts.push({
      text: `${prompt}, cinematic editorial poster art, 4:5 vertical portrait format, dramatic atmospheric lighting, painterly texture, high aesthetic, vivid color grading, masterwork, no typography, no letters, no text.`
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
  if (imageBase64) {
    return generateGeminiEditorialArtwork({ prompt, imageBase64: null, timeoutMs });
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
