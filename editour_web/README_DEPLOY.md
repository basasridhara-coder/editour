# Deploying Editour to editour.app (100% Free)

This folder contains the complete, ready-to-deploy web application and serverless API for **editour.app**.

---

## Quick 2-Minute Deployment on Vercel (Free Forever)

### Step 1: Deploy to Vercel
1. Go to [https://vercel.com](https://vercel.com) and sign in (free account, no credit card required).
2. Click **"Add New..."** -> **"Project"**.
3. Either:
   - **Drag and drop** this `editour_web` folder directly into Vercel, OR
   - Push your code to GitHub and select the repository.
4. Click **Deploy**. Within 30 seconds, your site will be live at a `.vercel.app` URL!

---

### Step 2: Connect your domain `editour.app`
1. In your Vercel Project Dashboard, go to **Settings** -> **Domains**.
2. Type `editour.app` and click **Add**.
3. Also add `www.editour.app` (it will offer to redirect to `editour.app`).
4. Vercel will show you the exact DNS records to add:
   - **Type**: `A`
   - **Name**: `@`
   - **Value**: `76.76.21.21`
   - (For www): **Type**: `CNAME`, **Name**: `www`, **Value**: `cname.vercel-dns.com`

---

### Step 3: Add DNS Record where you bought `editour.app`
1. Go to your domain registrar (where you purchased `editour.app`, e.g. GoDaddy, Namecheap, Google Domains / Squarespace, Cloudflare, etc.).
2. Open **DNS Management** / **DNS Records**.
3. Add the `A` record (`@` -> `76.76.21.21`).
4. Save! Within a few minutes, **https://editour.app** will be live with free automatic SSL!

---

## How Posts Sync from the PostCard App
1. Every time you create a post in PostCard (from a physical paper cut, digital link, or book excerpt), the app automatically pushes the post to:
   `https://editour.app/api/posts`
2. The web feed updates in real time!
3. You can also tap the **`[ 🌐 ]`** button in the app and select **"Sync All Posts to editour.app"** at any time.
