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
  let logoOnly = false;
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (_) {}
    }
    targetUrl = (body && body.url) ? body.url.trim() : '';
    logoOnly = Boolean(body && body.logoOnly);
  } else {
    const parsed = new URL(req.url, 'http://localhost');
    targetUrl = parsed.searchParams.get('url') || '';
    logoOnly = parsed.searchParams.get('logoOnly') === '1' || parsed.searchParams.get('logoOnly') === 'true';
  }

  if (!targetUrl) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  let domain = 'Web Source';
  let hostname = '';
  try {
    const parsedUri = new URL(targetUrl);
    hostname = parsedUri.hostname.replace(/^www\./, '');
    domain = hostname;
  } catch (_) {}

  const ytVideoId = extractYouTubeVideoId(targetUrl);

  // Fast Logo-Only Mode (for hydrating YouTube channel avatars or site logos on existing feed posts)
  if (logoOnly) {
    if (ytVideoId) {
      const ytLogoInfo = await fetchYouTubeChannelLogoFast(targetUrl);
      return res.status(200).json({
        success: true,
        url: targetUrl,
        sourceLogoUrl: ytLogoInfo.sourceLogoUrl || null,
        author: ytLogoInfo.author || 'YouTube',
        isVideo: true
      });
    }
    const fallbackFavicon = hostname
      ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`
      : null;
    return res.status(200).json({
      success: true,
      url: targetUrl,
      sourceLogoUrl: fallbackFavicon,
      isVideo: isVideoAudioUrl(targetUrl)
    });
  }

  // 1. Specialized YouTube Video Extractor: extracts full interview description, chapters, and high-res thumbnail
  if (ytVideoId) {
    try {
      const ytResult = await scrapeYouTubeUrl(targetUrl, ytVideoId);
      if (ytResult && ytResult.title) {
        let ledger = null;
        try {
          const ledgerModule = require('./ledger');
          if (ledgerModule && typeof ledgerModule.generateLedger === 'function') {
            ledger = await ledgerModule.generateLedger(ytResult.title, ytResult.content, ytResult.url, ytResult.siteName);
          }
        } catch (lErr) {
          console.warn('YouTube scrape ledger generation error:', lErr.message);
        }
        return res.status(200).json({
          ...ytResult,
          ledger
        });
      }
    } catch (ytErr) {
      console.warn('Specialized YouTube scrape failed, falling back to standard scrape:', ytErr.message);
    }
  }

  // 2. Authentic Article Reader: Try Jina Reader API first for clean, JavaScript-rendered markdown
  let jinaData = null;
  try {
    jinaData = await scrapeWithJinaReader(targetUrl);
  } catch (jinaErr) {
    console.warn('Jina reader attempt failed, falling back:', jinaErr.message);
  }

  let title = jinaData ? jinaData.title : '';
  let description = jinaData ? jinaData.description : '';
  let cleanText = jinaData ? jinaData.content : '';
  let imageUrl = null;
  let imageBase64 = null;
  let imageMimeType = 'image/jpeg';
  let sourceLogoUrl = hostname
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`
    : null;

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

    if (pageResp.ok) {
      const html = await pageResp.text();

      // Title Extraction (if Jina didn't provide one)
      if (!title) {
        const titleFromMeta = getMetaTagContent(html, 'og:title') || getMetaTagContent(html, 'twitter:title');
        const rawTitleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const titleFromTag = rawTitleMatch && rawTitleMatch[1] ? decodeHtmlEntities(rawTitleMatch[1].trim()) : '';
        title = titleFromMeta || titleFromTag;
      }

      // Site Name
      const ogSite = getMetaTagContent(html, 'og:site_name');
      if (ogSite) {
        domain = ogSite;
      }

      // Description (if Jina didn't provide one)
      if (!description) {
        description = getMetaTagContent(html, 'og:description') || getMetaTagContent(html, 'description');
      }

      // Lead Image Extraction
      imageUrl = extractMetaImage(html, targetUrl);

      // Site Logo / Favicon Extraction (with automatic Google 64px Favicon fallback)
      const extractedIcon = extractSiteLogoFromHtml(html, targetUrl);
      if (extractedIcon) {
        sourceLogoUrl = extractedIcon;
      }

      // Fallback cleanText if Jina was empty or blocked
      if (!cleanText || cleanText.length < 200) {
        let fallbackText = html
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
          .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
          .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 3500);

        if (fallbackText.length < 250 && description) {
          fallbackText = `${title}\n\n${description}`.trim();
        }
        cleanText = fallbackText;
      }
    }
  } catch (directErr) {
    console.warn('Direct HTML scrape failed (may already have Jina data):', directErr.message);
  }

  // Fallback title from slug if title is still empty
  if (!title) {
    title = extractSlugHeadline(targetUrl);
  }

  // Pre-fetch Lead Image Buffer if image URL exists
  if (imageUrl && imageUrl.startsWith('http')) {
    imageUrl = imageUrl.replace(/&amp;/g, '&');
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

  if (title || cleanText) {
    let ledger = null;
    try {
      const ledgerModule = require('./ledger');
      if (ledgerModule && typeof ledgerModule.generateLedger === 'function') {
        ledger = await ledgerModule.generateLedger(title, cleanText, targetUrl, domain);
      }
    } catch (lErr) {
      console.warn('Article scrape ledger generation error:', lErr.message);
    }

    return res.status(200).json({
      success: true,
      url: targetUrl,
      title: title || 'Curated Web Article',
      siteName: domain,
      description: description || '',
      content: cleanText || '',
      imageUrl: imageUrl && imageUrl.startsWith('http') ? imageUrl : null,
      imageBase64,
      imageMimeType,
      sourceLogoUrl,
      ledger,
      isVideo: isVideoAudioUrl(targetUrl)
    });
  }

  const slugHeadline = extractSlugHeadline(targetUrl);
  return res.status(200).json({
    success: true,
    url: targetUrl,
    title: slugHeadline || 'Curated Web Article',
    siteName: domain,
    description: '',
    content: '',
    imageUrl: null,
    sourceLogoUrl,
    fallback: true,
    notice: 'Lightweight slug extraction used',
    isVideo: isVideoAudioUrl(targetUrl)
  });
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

  if (img) {
    img = decodeHtmlEntities(img).replace(/&amp;/g, '&').trim();
    if (baseUrl) {
      try {
        img = new URL(img, baseUrl).href;
      } catch (_) {}
    }
  }
  return img || '';
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

function isVideoAudioUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (
      host.includes('youtube.com') ||
      host.includes('youtu.be') ||
      host.includes('vimeo.com') ||
      host.includes('spotify.com') ||
      host.includes('podcasts.apple.com') ||
      host.includes('soundcloud.com') ||
      host.includes('tiktok.com') ||
      host.includes('twitch.tv') ||
      host.includes('ted.com')
    ) {
      return true;
    }
    const path = parsed.pathname.toLowerCase();
    return /\.(mp4|mp3|m4a|webm|mov|ogg)$/i.test(path);
  } catch (_) {
    return false;
  }
}

const DEFAULT_KEY_B64 = 'QVEuQWI4Uk42STR5WnQzMEl6NGpLRkQ2SndaYVlSeThQYlVtWXpDYUNuMzU3alIyUU9KbFE=';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || Buffer.from(DEFAULT_KEY_B64, 'base64').toString('utf8');

async function scrapeWithJinaReader(targetUrl) {
  try {
    const lowerUrl = (targetUrl || '').toLowerCase();
    if (lowerUrl.includes('linkedin.com') || lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const jinaResp = await fetch(`https://r.jina.ai/${targetUrl}`, {
      signal: controller.signal,
      headers: {
        'Accept': 'text/plain',
        'X-No-Cache': 'true',
        'User-Agent': 'PostCard-Editorial/2.0'
      }
    });
    clearTimeout(timeout);

    if (!jinaResp.ok) return null;

    const rawText = await jinaResp.text();
    if (!rawText || rawText.length < 150) return null;

    // Parse Title
    let title = '';
    const titleMatch = rawText.match(/^Title:\s*(.+)$/m);
    if (titleMatch && titleMatch[1]) {
      title = decodeHtmlEntities(titleMatch[1].trim());
    }

    // Parse Description if present
    let description = '';
    const descMatch = rawText.match(/^Description:\s*(.+)$/m);
    if (descMatch && descMatch[1]) {
      description = decodeHtmlEntities(descMatch[1].trim());
    }

    // Extract Markdown Content
    let content = rawText;
    const mdMarker = 'Markdown Content:';
    const mdIndex = rawText.indexOf(mdMarker);
    if (mdIndex !== -1) {
      content = rawText.slice(mdIndex + mdMarker.length).trim();
    }

    // Clean boilerplate
    content = content
      .replace(/^URL Source:.*$/gm, '')
      .replace(/^Published Time:.*$/gm, '')
      .replace(/\[(?:Image \d+|Sign in|Cookie|Privacy Policy|Terms of Service)\]\(.*?\)/gi, '')
      .trim();

    if (!description && content.length > 50) {
      description = content.slice(0, 250).replace(/\s+/g, ' ').trim() + '...';
    }

    return {
      title,
      description,
      content: content.slice(0, 4500)
    };
  } catch (err) {
    console.warn('Jina reader error, falling back to direct parser:', err.message);
    return null;
  }
}

let YoutubeTranscript = null;
try {
  YoutubeTranscript = require('youtube-transcript').YoutubeTranscript;
} catch (_) {}

async function fetchPrimaryYouTubeTranscript(videoId) {
  if (!videoId || !YoutubeTranscript) return '';
  try {
    const chunks = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' })
      .catch(() => YoutubeTranscript.fetchTranscript(videoId));

    if (!chunks || chunks.length === 0) return '';

    let formatted = '';
    let lastSec = -999;
    for (const chunk of chunks) {
      const sec = Math.floor((chunk.offset || 0) / 1000);
      if (sec - lastSec >= 60) {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        const stamp = '[' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + ']';
        formatted += '\n\n' + stamp + ' ';
        lastSec = sec;
      }
      formatted += (chunk.text || '').replace(/\n+/g, ' ') + ' ';
    }
    const clean = formatted.trim();
    // Return up to 35,000 characters (~7,000 words, covering ~45-60 min speech comfortably)
    return clean.slice(0, 35000);
  } catch (err) {
    console.warn(`Primary YouTube transcript fetch unavailable for ${videoId}:`, err.message);
    return '';
  }
}

function extractSiteLogoFromHtml(html, baseUrl) {
  if (!html) return '';
  const iconRegexes = [
    /<link\b[^>]*?\brel=["'](?:apple-touch-icon|apple-touch-icon-precomposed)["'][^>]*?\bhref=["']([^"']+)["']/i,
    /<link\b[^>]*?\bhref=["']([^"']+)["'][^>]*?\brel=["'](?:apple-touch-icon|apple-touch-icon-precomposed)["']/i,
    /<link\b[^>]*?\brel=["'](?:icon|shortcut icon)["'][^>]*?\bhref=["']([^"']+)["']/i,
    /<link\b[^>]*?\bhref=["']([^"']+)["'][^>]*?\brel=["'](?:icon|shortcut icon)["']/i
  ];
  for (const r of iconRegexes) {
    const m = html.match(r);
    if (m && m[1]) {
      let href = decodeHtmlEntities(m[1].trim());
      if (href && !href.startsWith('data:')) {
        try {
          return new URL(href, baseUrl).href;
        } catch (_) {}
      }
    }
  }
  return '';
}

function normalizeYouTubeAvatarUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let clean = rawUrl.replace(/\\u0026/g, '&').replace(/&amp;/g, '&').trim();
  if (clean.startsWith('//')) clean = 'https:' + clean;
  clean = clean.replace(/=s\d+-c/, '=s176-c');
  return clean;
}

async function fetchYouTubeChannelLogoFast(targetUrl, existingOembed = null, existingPageHtml = '') {
  let oembed = existingOembed || {};
  if (!oembed.author_url && !oembed.author_name) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const oembedResp = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      clearTimeout(timer);
      if (oembedResp.ok) {
        oembed = await oembedResp.json();
      }
    } catch (_) {}
  }

  // 1. Check watch page HTML if already fetched
  if (existingPageHtml) {
    const avatarMatch = existingPageHtml.match(/"(?:videoOwnerRenderer|channelMetadataRenderer)"[\s\S]{1,1200}?"(?:thumbnail|avatar)"\s*:\s*\{\s*"thumbnails"\s*:\s*\[\s*\{\s*"url"\s*:\s*"(https?:\/\/yt3\.(?:ggpht|googleusercontent)\.com\/[^"]+)"/i)
      || existingPageHtml.match(/"(https?:\/\/yt3\.(?:ggpht|googleusercontent)\.com\/(?:ytc\/)?[A-Za-z0-9_-]{16,}[^"]*)"/i);
    if (avatarMatch && avatarMatch[1]) {
      return {
        sourceLogoUrl: normalizeYouTubeAvatarUrl(avatarMatch[1]),
        author: decodeHtmlEntities(oembed.author_name || 'YouTube').trim()
      };
    }
  }

  // 2. Fetch channel page og:image from oembed.author_url
  if (oembed && oembed.author_url) {
    try {
      const chCtrl = new AbortController();
      const chTimer = setTimeout(() => chCtrl.abort(), 2800);
      const chResp = await fetch(oembed.author_url, {
        signal: chCtrl.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+478;'
        }
      });
      clearTimeout(chTimer);
      if (chResp.ok) {
        const chHtml = await chResp.text();
        const ogImg = getMetaTagContent(chHtml, 'og:image') || getMetaTagContent(chHtml, 'twitter:image');
        if (ogImg && ogImg.startsWith('http')) {
          return {
            sourceLogoUrl: normalizeYouTubeAvatarUrl(ogImg),
            author: decodeHtmlEntities(oembed.author_name || 'YouTube').trim()
          };
        }
      }
    } catch (_) {}
  }

  return {
    sourceLogoUrl: 'https://www.google.com/s2/favicons?domain=youtube.com&sz=64',
    author: decodeHtmlEntities(oembed.author_name || 'YouTube').trim()
  };
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
  let watchPageHtml = '';
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
      watchPageHtml = await pageResp.text();
      const match = watchPageHtml.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});(?:var|<\/script>)/s) ||
                    watchPageHtml.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/);
      if (match) {
        try { playerObj = JSON.parse(match[1]); } catch (_) {}
      }
    }
  } catch (_) {}

  // Extract YouTube Channel Avatar Logo
  let sourceLogoUrl = null;
  try {
    const ytLogoInfo = await fetchYouTubeChannelLogoFast(targetUrl, oembed, watchPageHtml);
    sourceLogoUrl = ytLogoInfo.sourceLogoUrl || null;
  } catch (_) {}

  let title = decodeHtmlEntities(playerObj?.videoDetails?.title || oembed.title || '').trim();
  let author = decodeHtmlEntities(playerObj?.videoDetails?.author || oembed.author_name || 'YouTube').trim();
  const rawDesc = playerObj?.videoDetails?.shortDescription || '';
  let desc = decodeHtmlEntities(rawDesc).trim();

  const lengthSeconds = parseInt(playerObj?.videoDetails?.lengthSeconds || '0', 10);
  let durationStr = '';
  if (lengthSeconds > 0) {
    const mins = Math.floor(lengthSeconds / 60);
    durationStr = mins >= 60
      ? `${Math.floor(mins / 60)}h ${mins % 60}m`
      : `${mins} min${mins === 1 ? '' : 's'}`;
  }

  // Primary Source: Fetch direct verbatim transcript from YouTube (100% unbiased primary words)
  let transcript = '';
  if (videoId) {
    transcript = await fetchPrimaryYouTubeTranscript(videoId);
  }

  // Candidate Thumbnails
  const candidateThumbs = [
    videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : null,
    videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null,
    oembed.thumbnail_url
  ].filter(Boolean);

  let imageUrl = candidateThumbs[0] || null;
  let imageBase64 = null;
  let imageMimeType = 'image/jpeg';

  for (const thumbUrl of candidateThumbs) {
    try {
      const imgCtrl = new AbortController();
      const imgTimer = setTimeout(() => imgCtrl.abort(), 3500);
      const imgResp = await fetch(thumbUrl, {
        signal: imgCtrl.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.youtube.com/'
        }
      });
      clearTimeout(imgTimer);
      if (imgResp.ok) {
        const ct = imgResp.headers.get('content-type') || 'image/jpeg';
        const buf = await imgResp.arrayBuffer();
        if (buf.byteLength > 2000 && buf.byteLength < 5 * 1024 * 1024) {
          imageUrl = thumbUrl;
          imageMimeType = ct.split(';')[0];
          imageBase64 = `data:${imageMimeType};base64,` + Buffer.from(buf).toString('base64');
          break;
        }
      }
    } catch (_) {}
  }

  const structuredContent = [
    `Title: ${title}`,
    `Channel / Speaker: ${author}`,
    `Platform: YouTube Video`,
    durationStr ? `Video Duration: ${durationStr}` : '',
    desc ? `\nCreator Published Description & Notes:\n${desc}` : '',
    transcript ? `\n\n=== VERBATIM PRIMARY VIDEO TRANSCRIPT (FROM SPEAKER) ===\n${transcript}` : ''
  ].filter(Boolean).join('\n').trim();

  const shortDesc = desc ? (desc.slice(0, 450).replace(/\s+/g, ' ') + (desc.length > 450 ? '...' : '')) : '';

  return {
    success: true,
    url: targetUrl,
    title: title || 'YouTube Video',
    siteName: `${author} • YouTube`,
    description: shortDesc,
    content: structuredContent,
    imageUrl,
    imageBase64,
    imageMimeType,
    sourceLogoUrl,
    isVideo: true
  };
}

