// Serverless Function for editour.app
// Supports GET (fetch feed) and POST (publish post from PostCard app)

const defaultPosts = [
  {
    "id": "post-health-1",
    "createdAt": "2026-09-28T09:30:00.000Z",
    "sourceType": "digital_link",
    "originalPhotoPath": "digital_article_link",
    "originalHeadline": "The Cost of Cures: Why Are Life-Saving Drugs So Expensive?",
    "publicationName": "Reuters Health",
    "targetAudience": "High School Students",
    "tone": "Thought-provoking & Story-driven",
    "adaptedHeadline": "Why A Single Vial Costs As Much As A New Sports Car",
    "hook": "Developing a breakthrough medicine costs $2.6 billion and a decade of failure. Who really pays the bill?",
    "summary": "Developing a new drug now averages $2.6 billion according to the Tufts Center for the Study of Drug Development. While pharmaceutical giants argue that exclusivity protects clinical trial investments, patient advocates highlight that taxpayer funding seeds early research.\n\nIn emerging markets like India, patent challenges have paved the way for affordable generic medicines, creating a stark global contrast in healthcare affordability and access.",
    "whyItMatters": "Understanding drug pricing reveals how patent laws, taxpayer research, and private capital collide to determine who gets to live.",
    "keyTakeaways": [
      "$2.6 billion average price tag to bring one FDA-approved drug to market",
      "Over 90% of clinical candidates fail during Phase 1-3 trials",
      "Public NIH funding contributed to the foundational science behind almost every recent blockbuster therapy",
      "Generic drug competition slashes retail prices by up to 85% once patent monopolies expire"
    ],
    "pullQuote": "Taxpayers fund the scientific discovery, while patients mortgage their homes to buy the medicine back.",
    "keyMetric": "$2.6B R&D Cost",
    "categoryBadge": "HEALTH ECONOMICS",
    "digitalLink": "https://www.reuters.com/business/healthcare-pharmaceuticals/",
    "creatorHandle": "@curator",
    "creatorOpinion": "We need a transparent patent buy-out model that rewards genuine medical breakthroughs while ensuring generic manufacturing from day one.",
    "posterStyle": "editorial",
    "visualArtRatio": 0.65,
    "infographicStats": ["$2.6B Drug Cost", "90% Trial Failures", "-85% Generic Price Drop"],
    "visualMood": "Healthcare Economics Infographic Art"
  },
  {
    "id": "post-tech-1",
    "createdAt": "2026-09-28T08:15:00.000Z",
    "sourceType": "photo",
    "originalPhotoPath": "sample_asset_print",
    "originalHeadline": "Commercial Quantum Computing Hits Milestone with Fault-Tolerant Qubits",
    "publicationName": "The Global Science Monitor",
    "targetAudience": "Tech Enthusiasts",
    "tone": "Deep-dive & Analytical",
    "adaptedHeadline": "The 1,000-Qubit Breakthrough: Decoherence Conquered",
    "hook": "Researchers demonstrate 1,024 fault-tolerant qubits solving 8,000-year problems in 4 minutes.",
    "summary": "A consortium of physicists has breached the elusive fault-tolerance barrier with a 1,024-qubit array that actively corrects quantum drift.\n\nBy running pharmaceutical enzyme simulations in 240 seconds—work requiring millennia on top supercomputers—the timeline for practical molecular engineering just compressed exponentially.",
    "whyItMatters": "Fault-tolerant qubits mark the transition from laboratory physics toys to commercial engineering reality.",
    "keyTakeaways": [
      "1,024 logical fault-tolerant qubits operating below decoherence threshold",
      "Four-minute solve time for classical 8,000-year algorithmic calculations",
      "Direct early application targets antibiotic-resistant enzyme synthesis"
    ],
    "pullQuote": "Calculations that once demanded 8,000 supercomputer years resolved in under 240 seconds.",
    "keyMetric": "1,024 Qubits",
    "categoryBadge": "DEEP TECH",
    "digitalLink": "https://news.google.com/search?q=fault+tolerant+quantum+computing",
    "creatorHandle": "@curator",
    "creatorOpinion": "When quantum simulation hits commercial scale, molecular design shifts from wet-lab trial and error to pure code simulation.",
    "posterStyle": "modernCyber",
    "visualArtRatio": 0.75,
    "infographicStats": ["1,024 Logical Qubits", "240s Molecular Solve", "8,000 Yr Speedup"],
    "visualMood": "Cyberpunk Neon Quantum Vector Art"
  }
];

// In-memory cache for warm serverless instances
let inMemoryPosts = [...defaultPosts];

module.exports = async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Check for KV / Redis environment
  const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (req.method === 'GET') {
    // 1. If KV configured, read from Cloud KV
    if (kvUrl && kvToken) {
      try {
        const resp = await fetch(`${kvUrl}/get/editour_posts`, {
          headers: { Authorization: `Bearer ${kvToken}` }
        });
        const data = await resp.json();
        if (data && data.result) {
          const parsed = JSON.parse(data.result);
          return res.status(200).json({ status: 'ok', count: parsed.length, posts: parsed });
        }
      } catch (err) {
        console.error('KV read error:', err);
      }
    }

    // 2. Return cached / default posts
    return res.status(200).json({
      status: 'ok',
      count: inMemoryPosts.length,
      posts: inMemoryPosts
    });
  }

  if (req.method === 'POST') {
    try {
      let postData = req.body;
      if (typeof postData === 'string') {
        postData = JSON.parse(postData);
      }

      if (!postData || (!postData.adaptedHeadline && !postData.originalHeadline)) {
        return res.status(400).json({ error: 'Invalid post data: missing headline' });
      }

      // Ensure post has ID and timestamp
      if (!postData.id) {
        postData.id = 'post-' + Date.now();
      }
      if (!postData.createdAt) {
        postData.createdAt = new Date().toISOString();
      }

      // Insert at the front of in-memory list
      const existingIdx = inMemoryPosts.findIndex(p => p.id === postData.id);
      if (existingIdx >= 0) {
        inMemoryPosts[existingIdx] = postData;
      } else {
        inMemoryPosts.unshift(postData);
      }

      // If KV configured, persist to Cloud KV
      if (kvUrl && kvToken) {
        try {
          await fetch(`${kvUrl}/set/editour_posts`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${kvToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(inMemoryPosts)
          });
        } catch (err) {
          console.error('KV write error:', err);
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Post successfully published to editour.app!',
        id: postData.id,
        webUrl: `https://editour.app/?p=${postData.id}`
      });
    } catch (e) {
      console.error('Error handling post creation:', e);
      return res.status(500).json({ error: 'Server error processing post: ' + e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
