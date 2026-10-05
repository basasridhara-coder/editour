// Serverless Function: /api/scrape
// Fetches and parses article title, site name, description, and readable body text

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let targetUrl = '';
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (_) {}
    }
    targetUrl = (body && body.url) ? body.url.trim() : '';
  } else {
    const parsed = new URL(req.url, 'http://localhost');
    targetUrl = parsed.searchParams.get('url') || '';
  }

  if (!targetUrl) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  let domain = 'Web Source';
  try {
    const parsedUri = new URL(targetUrl);
    domain = parsedUri.hostname.replace(/^www\./, '');
  } catch (_) {}

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const pageResp = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    clearTimeout(timeout);

    if (!pageResp.ok) {
      throw new Error(`HTTP ${pageResp.status}`);
    }

    const html = await pageResp.text();

    // 1. Title Extraction
    const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i) ||
                    html.match(/<meta\s+content=["'](.*?)["']\s+property=["']og:title["']/i) ||
                    html.match(/<meta\s+name=["']twitter:title["']\s+content=["'](.*?)["']/i) ||
                    html.match(/<title[^>]*>(.*?)<\/title>/i);
    let title = ogTitle && ogTitle[1] ? decodeHtmlEntities(ogTitle[1].trim()) : '';

    // 2. Site Name
    const ogSite = html.match(/<meta\s+property=["']og:site_name["']\s+content=["'](.*?)["']/i) ||
                   html.match(/<meta\s+content=["'](.*?)["']\s+property=["']og:site_name["']/i);
    if (ogSite && ogSite[1]) {
      domain = decodeHtmlEntities(ogSite[1].trim());
    }

    // 3. Description
    const ogDesc = html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i) ||
                   html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
    const description = ogDesc && ogDesc[1] ? decodeHtmlEntities(ogDesc[1].trim()) : '';

    // 4. Image
    const ogImage = html.match(/<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i) ||
                    html.match(/<meta\s+content=["'](.*?)["']\s+property=["']og:image["']/i) ||
                    html.match(/<meta\s+name=["']twitter:image["']\s+content=["'](.*?)["']/i) ||
                    html.match(/<meta\s+content=["'](.*?)["']\s+name=["']twitter:image["']/i) ||
                    html.match(/<link\s+rel=["']image_src["']\s+href=["'](.*?)["']/i);
    let imageUrl = ogImage && ogImage[1] ? ogImage[1].trim() : '';

    let imageBase64 = null;
    let imageMimeType = 'image/jpeg';
    if (imageUrl && imageUrl.startsWith('http')) {
      try {
        const imgCtrl = new AbortController();
        const imgTimer = setTimeout(() => imgCtrl.abort(), 3500);
        const imgResp = await fetch(imageUrl, {
          signal: imgCtrl.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        clearTimeout(imgTimer);
        if (imgResp.ok) {
          const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
          if (contentType.startsWith('image/')) {
            imageMimeType = contentType.split(';')[0];
            const buffer = await imgResp.arrayBuffer();
            if (buffer.byteLength > 1000 && buffer.byteLength < 3 * 1024 * 1024) {
              imageBase64 = `data:${imageMimeType};base64,` + Buffer.from(buffer).toString('base64');
            }
          }
        }
      } catch (err) {
        console.warn('Could not pre-fetch article lead photo buffer:', err.message);
      }
    }

    // 5. Clean Article Body Excerpt
    const cleanText = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3500);

    // Fallback title from slug if title is empty
    if (!title) {
      title = extractSlugHeadline(targetUrl);
    }

    return res.status(200).json({
      success: true,
      url: targetUrl,
      title: title || 'Curated Web Article',
      siteName: domain,
      description,
      content: cleanText,
      imageUrl: imageUrl.startsWith('http') ? imageUrl : null,
      imageBase64,
      imageMimeType
    });

  } catch (err) {
    const slugHeadline = extractSlugHeadline(targetUrl);
    return res.status(200).json({
      success: true,
      url: targetUrl,
      title: slugHeadline || 'Curated Web Article',
      siteName: domain,
      description: '',
      content: '',
      imageUrl: null,
      fallback: true,
      notice: 'Lightweight slug extraction used'
    });
  }
};

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');
}

function extractSlugHeadline(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (!segments.length) return '';

    let bestSlug = '';
    for (const seg of segments) {
      const clean = seg.replace(/\.(html|ece|htm|php|cms|amp|asp)$/i, '');
      if (clean.length > bestSlug.length && (clean.includes('-') || clean.includes('_'))) {
        bestSlug = clean;
      }
    }
    if (!bestSlug && segments.length) bestSlug = segments[segments.length - 1];

    const words = bestSlug
      .split(/[-_]/)
      .filter(w => w.length > 2 && !/^\d+$/.test(w))
      .map(w => w.charAt(0).toUpperCase() + w.slice(1));

    return words.join(' ');
  } catch (_) {
    return '';
  }
}
