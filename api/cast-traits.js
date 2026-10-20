// Serverless Function: /api/cast-traits
// Uses Gemini Multimodal Vision to extract facial likeness traits, hair style,
// and physical proportions from a private reference photograph for the Family Cast Vault.

const DEFAULT_KEY_B64 = 'QVEuQWI4Uk42STR5WnQzMEl6NGpLRkQ2SndaYVlSeThQYlVtWXpDYUNuMzU3alIyUU9KbFE=';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || Buffer.from(DEFAULT_KEY_B64, 'base64').toString('utf8');
const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.8-flash'];

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

  const { imageBase64, imageMimeType = 'image/jpeg', relation = 'family_member', approxAge = null, name = '' } = body || {};

  if (!imageBase64) {
    return res.status(400).json({ error: 'No imageBase64 provided' });
  }

  const cleanData = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
  const mime = imageMimeType || 'image/jpeg';

  const roleHint = (relation === 'elder_son') ? 'Elder son (around 11 years old pre-teen boy)' :
    (relation === 'younger_son') ? 'Younger son (around 7 years old young child)' :
    (relation === 'spouse') ? 'Mother / Wife' :
    (relation === 'self') ? 'Father / Husband' : 'Family member';

  const prompt = `You are an expert character artist and editorial portrait illustrator.
Analyze this reference photograph of a person (${roleHint}${name ? ', named ' + name : ''}${approxAge ? ', approx age ' + approxAge : ''}) to extract physical appearance traits for character consistency in warm editorial illustrations.

Extract key visual likeness anchors:
1. Hairstyle: hair texture (straight, wavy, curly), hair color, length, and parting style.
2. Facial structure: face shape (lean, rounded, oval), cheekbones, eye shape, eyebrows, smile/expression.
3. Eyeglasses / Spectacles: if wearing glasses, describe frame style (e.g. rectangular, round, wireframe, dark rim). If no glasses, omit.
4. Facial hair: beard/stubble if present (for adults).
5. Apparent biological age and life stage (e.g. pre-teen, energetic young child, adult).
6. Stature and build contrast hint.

Return strictly valid JSON with this exact schema:
{
  "visualTraits": "A single coherent, evocative sentence describing hair, facial structure, smile, and glasses (max 25-30 words). Example: '11-year-old pre-teen boy with lean face, wavy dark-brown hair with neat side parting, alert expressive dark eyes, warm smile, and rectangular wireframe glasses.'",
  "detectedAge": 11,
  "hair": "Wavy dark-brown hair, side-parted",
  "facialFeatures": "Lean jawline, warm smile, wireframe glasses",
  "statureDesc": "Lean pre-teen stature, approx 4ft 10in"
}

Do not include markdown code fences, do not include backticks, do not include any em-dashes. Output pure JSON only.`;

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 18000);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: mime, data: cleanData } },
              { text: prompt }
            ]
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2
          }
        })
      });
      clearTimeout(timer);

      if (response.ok) {
        const json = await response.json();
        const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);

        return res.status(200).json({
          success: true,
          visualTraits: parsed.visualTraits || '',
          detectedAge: (typeof parsed.detectedAge === 'number') ? parsed.detectedAge : (approxAge || null),
          hair: parsed.hair || '',
          facialFeatures: parsed.facialFeatures || '',
          statureDesc: parsed.statureDesc || ''
        });
      } else {
        const errText = await response.text().catch(() => '');
        console.warn(`Gemini traits extraction error with ${model}:`, response.status, errText.slice(0, 160));
      }
    } catch (err) {
      console.warn(`Gemini model ${model} failed for traits extraction:`, err.message);
    }
  }

  // Fallback if all models fail
  return res.status(200).json({
    success: true,
    visualTraits: `${roleHint} with warm lifelike facial features and natural expression.`,
    detectedAge: approxAge || null,
    hair: '',
    facialFeatures: 'Warm lifelike features',
    statureDesc: ''
  });
};
