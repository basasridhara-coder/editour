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
    const titleFromMeta = getMetaTagContent(html, 'og:title') ||
                          getMetaTagContent(html, 'twitter:title');
    const rawTitleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const titleFromTag = rawTitleMatch && rawTitleMatch[1] ? decodeHtmlEntities(rawTitleMatch[1].trim()) : '';
    let title = titleFromMeta || titleFromTag;

    // 2. Site Name
    const ogSite = getMetaTagContent(html, 'og:site_name');
    if (ogSite) {
      domain = ogSite;
    }

    // 3. Description
    const description = getMetaTagContent(html, 'og:description') ||
                        getMetaTagContent(html, 'description');

    // 4. Lead Image Extraction
    let imageUrl = extractMetaImage(html, targetUrl);

    let imageBase64 = null;
    let imageMimeType = 'image/jpeg';
    if (imageUrl && imageUrl.startsWith('http')) {
      try {
        const imgCtrl = new AbortController();
        const imgTimer = setTimeout(() => imgCtrl.abort(), 4500);
        const imgResp = await fetch(imageUrl, {
          signal: imgCtrl.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': targetUrl,
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
          }
        });
        clearTimeout(imgTimer);
        if (imgResp.ok) {
          const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
          imageMimeType = contentType.split(';')[0];
          const buffer = await imgResp.arrayBuffer();
          if (buffer.byteLength > 1000 && buffer.byteLength < 5 * 1024 * 1024) {
            imageBase64 = `data:${imageMimeType};base64,` + Buffer.from(buffer).toString('base64');
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
    .replace(/&hellip;/g, '…')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function getMetaTagContent(html, propertyOrName) {
  if (!html || !propertyOrName) return '';
  const r1 = new RegExp(`<meta\\b[^>]*?\\b(?:property|name)=["']${propertyOrName}["'][^>]*?\\bcontent=["']([^"']+)["']`, 'i');
  const r2 = new RegExp(`<meta\\b[^>]*?\\bcontent=["']([^"']+)["'][^>]*?\\b(?:property|name)=["']${propertyOrName}["']`, 'i');
  const m = html.match(r1) || html.match(r2);
  return m && m[1] ? decodeHtmlEntities(m[1].trim()) : '';
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

function extractMetaImage(html, baseUrl) {
  if (!html) return '';
  const metaRegexes = [
    /<meta\b[^>]*?\b(?:property|name)=["'](?:og:image|og:image:url|twitter:image|twitter:image:src|image)["'][^>]*?\bcontent=["']([^"']+)["']/i,
    /<meta\b[^>]*?\bcontent=["']([^"']+)["'][^>]*?\b(?:property|name)=["'](?:og:image|og:image:url|twitter:image|twitter:image:src|image)["']/i,
    /<link\b[^>]*?\brel=["']image_src["'][^>]*?\bhref=["']([^"']+)["']/i,
    /<meta\b[^>]*?\bitemprop=["']image["'][^>]*?\bcontent=["']([^"']+)["']/i
  ];
  let img = '';
  for (const r of metaRegexes) {
    const m = html.match(r);
    if (m && m[1]) {
      img = decodeHtmlEntities(m[1].trim());
      break;
    }
  }

  // JSON-LD fallback if meta tag not found
  if (!img) {
    try {
      const jsonLdMatches = html.matchAll(/<script\b[^>]*?type=["']application\/ld\+json["'][^>]*?>([\s\S]*?)<\/script>/gi);
      for (const match of jsonLdMatches) {
        const parsed = JSON.parse(match[1]);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (typeof item.image === 'string') { img = item.image; break; }
          if (Array.isArray(item.image) && typeof item.image[0] === 'string') { img = item.image[0]; break; }
          if (item.image && typeof item.image.url === 'string') { img = item.image.url; break; }
        }
        if (img) break;
      }
    } catch (_) {}
  }

  if (img && baseUrl) {
    try {
      img = new URL(img, baseUrl).href;
    } catch (_) {}
  }
  return img || '';
}

