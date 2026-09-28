# 📰 PostCard: Physical Press to Social Posters

**PostCard** is a Flutter-based mobile app designed for physical newspaper and magazine readers. It empowers users to snap a photo of any printed article they read, extracts and analyzes the story using **Google Gemini Multimodal AI**, and automatically transforms it into an **audience-adapted summary poster** ready for social sharing on Instagram, WhatsApp, Twitter/X, and LinkedIn.

---

## ✨ Key Features

1. **📸 Physical Print Snapshot & Zoom**:
   - Capture physical broadsheets, magazines, journals, or newspaper clippings directly using the phone's camera or photo library.
   - Interactive zoom/pinch viewer to inspect small print text, dates, and column details.
   - Comes preloaded with realistic sample newspaper clips (Deep Tech, Culture, Business) for instant testing.

2. **🎯 Audience & Tone Adaptation**:
   - Tailor the summary for specific readers:
     - **General Public** (Clear, balanced, engaging)
     - **Tech Enthusiasts** (Specs, architectural implications, deep-dive)
     - **Busy Executives** (Bottom-line ROI, strategic briefing)
     - **Gen-Z / Social Media** (High-energy, punchy, TL;DR)
     - **Students / ELI5** (Analogies, simple English)
     - **Seniors / In-Depth** (Contextual, historical perspective)
   - Customize tone: *Balanced, Catchy, Deep-dive, Actionable, Witty, or Investigative*.
   - Add custom creator angles (e.g. *"Focus on climate impacts"* or *"Relate to small business owners"*).

3. **🎨 Hybrid Graphic Poster Engine**:
   - Renders 4 distinct, publication-grade poster cards:
     - **The Editorial Digest**: Classic serif typography (Playfair / Merriweather), rich paper background, elegant pull-quote styling.
     - **The Modern Cyber**: Dark obsidian background, glowing cyan & purple telemetry, futuristic monospace data points.
     - **The Bold Pop**: Vibrant high-contrast gradient, sticker badges, dynamic cards engineered for viral feeds.
     - **The Swiss Minimalist**: Architectural grid discipline, crisp monochrome lines, electric blue accent.
   - High-definition export (pixel ratio 3.0) directly saved to image or shared via native Android share sheet.

4. **💭 Creator's Voice & Digital Linking**:
   - Creator opinion block with personal handle/byline (*"Why I found this physical story important..."*).
   - Digital link lookup and verification: links directly to the online source or search query if the reader wants to dive deeper.

5. **⚡ Smart Offline & Gemini AI Modes**:
   - Powered by Google Gemini 1.5 Flash multimodal vision API.
   - **Smart Demo Mode**: If no API key is provided, the app intelligently generates realistic audience-adapted posters and summaries so you can test all features offline out-of-the-box!
   - Easy API Key configuration in Settings with direct link to Google AI Studio.

---

## 🏗️ Project Architecture

```
lib/
├── main.dart                          # App entry point, Material 3 theme & initialization
├── models/
│   ├── postcard_item.dart             # Full PostCard data model with JSON serialization
│   ├── audience_preset.dart           # Audience profiles, default tones, and icons
│   ├── poster_style_config.dart       # Color schemes & configs for all poster styles
│   └── sample_articles.dart           # Preloaded physical news stories for demo
├── services/
│   ├── gemini_service.dart            # Multimodal Gemini API client & Smart Demo generator
│   ├── storage_service.dart           # Local persistence via SharedPreferences
│   └── share_service.dart             # RepaintBoundary capture to PNG & social share sheet
├── widgets/
│   ├── poster_canvas.dart             # Master poster renderer & live theme switcher
│   ├── poster_styles/
│   │   ├── editorial_poster.dart      # Classic broadsheet newspaper design
│   │   ├── modern_cyber_poster.dart   # Dark mode tech/cyber design
│   │   ├── bold_social_poster.dart    # High-energy vibrant social card
│   │   └── minimalist_poster.dart     # Swiss architectural grid design
│   ├── postcard_card.dart             # Home feed card component
│   ├── photo_viewer_dialog.dart       # Full-screen pinch-to-zoom photo viewer
│   └── audience_chip_selector.dart    # Audience & tone chip selector
└── screens/
    ├── home_feed_screen.dart          # Saved PostCards feed, search, and category filter
    ├── create_postcard_screen.dart    # Core flow: Camera -> Audience -> AI -> Poster Editor
    ├── postcard_detail_screen.dart    # Detailed view with photo/poster tab, summary & links
    └── settings_screen.dart           # Gemini API key setup, creator handle, and guide
```

---

## 🚀 Getting Started

### Prerequisites
- [Flutter SDK](https://docs.flutter.dev/) (3.13+)
- [Android Studio](https://developer.android.com/studio) or Android SDK (API 21+)
- Android device or emulator with Camera support

### Running the App
1. Clone or open the workspace:
   ```bash
   cd /Users/shridharreddy/Documents/postcard
   ```
2. Fetch dependencies:
   ```bash
   flutter pub get
   ```
3. Run on your connected device or emulator:
   ```bash
   flutter run
   ```

---

## 🔑 Setting up Google Gemini AI

1. Get a free API key at [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Open **PostCard** on your phone.
3. Tap the **Settings** gear icon in the top right.
4. Paste your key in the **Gemini API Key** field and tap **Save Preferences**.
5. You're ready to snap any physical newspaper or magazine article!
