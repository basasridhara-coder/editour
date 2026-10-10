import os
import json
import base64
import time
import urllib.request
import urllib.parse

# 1. Load Gemini API Key
GEMINI_API_KEY = None
with open('.env') as f:
    for line in f:
        if line.startswith('GEMINI_API_KEY='):
            GEMINI_API_KEY = line.strip().split('=', 1)[1].strip()

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY not found in .env")

SUPABASE_URL = 'https://fsuukgpizuipxxwatkbo.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzdXVrZ3BpenVpcHh4d2F0a2JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMzE4NjEsImV4cCI6MjEwNjcwNzg2MX0.NPnTDhGyiigPZIvror8JGqjCMVKuJ8OZaDN2pGuVfM8'

POSTS_TO_FIX = [
    {
        "id": "slant-1791312893953-unmyu",
        "prompt": "Cinematic warm editorial oil painting of an expressive parent kneeling beside an open colorful suitcase in a sunlit living room, smiling as their young son happily holds up a straw travel sunhat. A glowing laptop sits nearby on a low coffee table with scattered packing lists. Warm golden daylight streams through tall windows revealing vibrant green tropical palm trees outside. Realistic people with clearly visible smiling faces, warm natural skin tones, bright casual clothing, cheerful anticipation atmosphere, highly detailed, no silhouettes, no dark shadows, no faceless figures, strictly no text or letters."
    },
    {
        "id": "slant-1791307948121-yx98t",
        "prompt": "A stylized metaphorical silhouette of a person packing an open suitcase beside a brightly glowing laptop in an evening room. Outside the window, silhouettes of tropical palm trees sway against a warm twilight sky. An unchecked checklist flutters near the luggage, illuminated by the dual clash of cool screen light and amber dusk. Highly atmospheric, emotional editorial illustration, bold shapes, rich textures, strictly no text or letters."
    },
    {
        "id": "slant-1791221454374-vv4w1",
        "prompt": "An editorial painterly illustration blending recognizable likeness with artistic chiaroscuro mystery, featuring a Supreme Court Judge lookalike in judicial robes with a focused, solemn gaze. Overhead, harsh white surveillance spotlight beams cut through the heavy smog of a midnight New Delhi street. Looming in the background, a tangled geometric web of glowing legal codices and procedural red tape traps the light, while shadowy figures slip through the gaps into darkness. High-contrast noir screenprint aesthetic, rich deep indigos, charcoal shadows, and electric amber light accents, stark and cinematic, strictly no text or letters."
    },
    {
        "id": "slant-1791219517061-jba0n",
        "prompt": "Cinematic visual art in high-contrast editorial graphic style. In the center, a towering monolithic Indian Supreme Court portico stands veiled in dense New Delhi night smog. Coiling around the colossal sandstone columns are labyrinthine legal loopholes, represented as twisting iron bands and thorny razor wire that entangle balanced scales of justice. Below, sharp predatory silhouettes slip through the gaps of barbed security perimeters, evading harsh cold police searchlight cones cutting through the dark atmosphere. Stylized metaphorical silhouettes, midnight charcoal tones accented with stark amber and cold institutional blue, strictly no text or letters."
    },
    {
        "id": "slant-1791219388728-bf7er",
        "prompt": "A powerful editorial linocut illustration in dramatic high-contrast noir. In the background looms the monolithic silhouette of the Indian Supreme Court dome against a dense, fog-choked midnight New Delhi sky. In the foreground, cracked sandstone scales of justice stand precariously, while sharp predatory shadows slip effortlessly through literal open structural loopholes in stone barriers. A piercing crimson red emergency siren glare slices diagonally through the heavy charcoal and indigo mist, illuminating sharp edges and textured woodblock gouges. Striking, symbolic, and devoid of any text, letters, or watermarks."
    },
    {
        "id": "slant-1791213122163-i9vil",
        "prompt": "Editorial linocut woodblock illustration of a towering silhouetted Lady Justice statue looming over an ominous midnight metropolis boulevard. Her cracked balance scales are tangled in barbed legal vines and loop-like ribbons. Sinister, predatory silhouettes slink between towering classical marble pillars, escaping into the darkness. Lit by a harsh crimson chiaroscuro editorial spotlight contrasting against deep obsidian shadows, textured graphic printmaking aesthetic, sharp angular cuts, dramatic scale, strictly no text or letters."
    },
    {
        "id": "slant-1791210913847-5kgqr",
        "prompt": "High-contrast noir linocut editorial illustration showing an imposing neoclassical supreme court building looming in dark obsidian silhouette. Below, a desolate rain-slicked midnight city street is bathed in the stark chiaroscuro beam of a single streetlamp. Towering, labyrinthine parchment scrolls and legal documents twist into defensive barricades, through which menacing shadowy predator silhouettes slip past broken iron chains and empty restraints, vanishing into the deep urban fog, strictly no text or typography."
    },
    {
        "id": "slant-1791171890995-e6uud",
        "prompt": "A towering golden Dharma wheel monument stands resplendent and majestic in the center of a vast windswept geopolitical proving ground. At its base lies a fractured nuclear warhead relic, cracked open and crumbling into obsolete dust. The looming jagged shadow of an arms race stretches across the stark terrain, while a fierce blinding atomic horizon flare cuts through the background sky with dramatic charcoal, gold, and vermilion tones, executed in a bold constructivist high-contrast screenprint aesthetic with textured linocut grains and sharp architectural silhouettes, strictly no text or letters."
    }
]

def generate_image(prompt_text):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key={GEMINI_API_KEY}"
    
    body = {
        "contents": [
            {
                "parts": [
                    {
                        "text": f"{prompt_text}, cinematic editorial poster art, 4:5 vertical portrait format, dramatic atmospheric lighting, painterly texture, high aesthetic, vivid color grading, masterwork, no typography, no letters, no text."
                    }
                ]
            }
        ],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            "imageConfig": {
                "aspectRatio": "4:5"
            }
        }
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    
    with urllib.request.urlopen(req, timeout=30) as resp:
        res_data = json.loads(resp.read().decode('utf-8'))
        candidates = res_data.get('candidates', [])
        if not candidates:
            raise Exception("No candidates returned")
        parts = candidates[0].get('content', {}).get('parts', [])
        for part in parts:
            if 'inlineData' in part:
                return part['inlineData']['data']
    raise Exception("No inlineData image in response")

def update_supabase(post_id, b64_data):
    # Fetch existing post data from Supabase
    fetch_req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/posts?id=eq.{post_id}&select=id,data",
        headers={'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}'}
    )
    with urllib.request.urlopen(fetch_req) as resp:
        rows = json.loads(resp.read().decode('utf-8'))
    
    if not rows:
        print(f"  Warning: Post {post_id} not found in Supabase")
        return
        
    post_data = rows[0].get('data', {})
    post_data['illustrationUrl'] = f"/posters/{post_id}.png"
    post_data['aiIllustrationUrl'] = f"/posters/{post_id}.png"
    post_data['illustrationBase64'] = b64_data
    
    # Update Supabase
    patch_req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/posts?id=eq.{post_id}",
        data=json.dumps({'data': post_data}).encode('utf-8'),
        headers={
            'apikey': SUPABASE_KEY,
            'Authorization': f'Bearer {SUPABASE_KEY}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        },
        method='PATCH'
    )
    with urllib.request.urlopen(patch_req) as resp:
        print(f"  Supabase updated for {post_id}: HTTP {resp.status}")

def save_to_disk(post_id, raw_bytes):
    target_dirs = [
        'public/posters',
        'web_feed/posters',
        'editour_web/public/posters'
    ]
    for d in target_dirs:
        os.makedirs(d, exist_ok=True)
        target_path = os.path.join(d, f"{post_id}.png")
        with open(target_path, 'wb') as f:
            f.write(raw_bytes)
        print(f"  Saved {target_path} ({len(raw_bytes)} bytes)")

def update_feeds(post_id):
    feed_paths = [
        'public/slant_feed.json',
        'web_feed/slant_feed.json',
        'editour_web/public/slant_feed.json'
    ]
    for p in feed_paths:
        if not os.path.exists(p):
            continue
        with open(p, 'r') as f:
            feed = json.load(f)
        modified = False
        for item in feed:
            if item.get('id') == post_id:
                item['illustrationUrl'] = f"/posters/{post_id}.png"
                item['aiIllustrationUrl'] = f"/posters/{post_id}.png"
                if 'illustrationBase64' in item:
                    del item['illustrationBase64']
                modified = True
                break
        if modified:
            with open(p, 'w') as f:
                json.dump(feed, f, indent=2)
            print(f"  Updated {p}")

def main():
    print(f"Starting Gemini generation for {len(POSTS_TO_FIX)} posts...")
    for idx, item in enumerate(POSTS_TO_FIX, 1):
        pid = item['id']
        prompt = item['prompt']
        print(f"\n[{idx}/{len(POSTS_TO_FIX)}] Generating artwork for {pid}...")
        try:
            t0 = time.time()
            b64_img = generate_image(prompt)
            duration = round(time.time() - t0, 2)
            raw_bytes = base64.b64decode(b64_img)
            print(f"  Success in {duration}s! Size: {len(raw_bytes)} bytes")
            
            save_to_disk(pid, raw_bytes)
            update_supabase(pid, b64_img)
            update_feeds(pid)
        except Exception as e:
            print(f"  FAILED for {pid}: {e}")
        time.sleep(1)

    print("\nAll tasks completed!")

if __name__ == '__main__':
    main()
