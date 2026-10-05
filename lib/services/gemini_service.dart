import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../models/poster_style_config.dart';
import '../models/postcard_item.dart';
import 'storage_service.dart';

class GeminiAnalysisResult {
  final String originalHeadline;
  final String publicationName;
  final String adaptedHeadline;
  final String hook;
  final String summary;
  final String? whyItMatters;
  final List<String> keyTakeaways;
  final String pullQuote;
  final String keyMetric;
  final String categoryBadge;
  final String digitalLink;
  final PosterStyleType suggestedStyle;
  final String? illustrationPrompt;
  final Uint8List? generatedIllustrationBytes;
  final String? curatorIllustrationPrompt;
  final Uint8List? generatedCuratorIllustrationBytes;
  final double visualArtRatio;
  final String? infographicType;
  final List<String> infographicStats;
  final String? visualMood;
  final bool isDemoMode;
  final String? errorMessage;
  final String? rawGeminiResponse;
  final String? receiptHighlightQuote;
  final List<String> articleExcerpts;
  final String? creatorOpinion;
  final String? slantTone;
  final String? slantIcon;

  GeminiAnalysisResult({
    required this.originalHeadline,
    required this.publicationName,
    required this.adaptedHeadline,
    required this.hook,
    required this.summary,
    this.whyItMatters,
    required this.keyTakeaways,
    required this.pullQuote,
    required this.keyMetric,
    required this.categoryBadge,
    required this.digitalLink,
    required this.suggestedStyle,
    this.illustrationPrompt,
    this.generatedIllustrationBytes,
    this.curatorIllustrationPrompt,
    this.generatedCuratorIllustrationBytes,
    this.creatorOpinion,
    this.visualArtRatio = 0.6,
    this.infographicType,
    this.infographicStats = const [],
    this.visualMood,
    this.isDemoMode = false,
    this.errorMessage,
    this.rawGeminiResponse,
    this.receiptHighlightQuote,
    this.articleExcerpts = const [],
    this.slantTone,
    this.slantIcon,
  });
}

class GeminiService {
  final StorageService _storageService = StorageService();

  static const List<String> _candidateModels = [
    'gemini-3.8-flash',
    'gemini-flash-latest',
    'gemini-3.7-flash',
    'gemini-3.5-flash',
    'gemini-3.1-pro-preview',
    'gemini-pro-latest',
  ];

  static bool _isValidGenerationModel(String m) {
    final lower = m.toLowerCase();
    if (lower.contains('image') ||
        lower.contains('tts') ||
        lower.contains('lyria') ||
        lower.contains('embedding') ||
        lower.contains('deep-research') ||
        lower.contains('robotics') ||
        lower.contains('computer-use') ||
        lower.contains('transcribe') ||
        lower.contains('banana') ||
        lower.contains('2.5-flash') ||
        lower.contains('2.5-pro') ||
        lower.contains('1.5-') ||
        lower.contains('aqa')) {
      return false;
    }
    return lower.contains('flash') || lower.contains('pro');
  }

  static int _modelPriorityScore(String name) {
    if (name == 'gemini-3.8-flash') return 100;
    if (name == 'gemini-flash-latest') return 95;
    if (name == 'gemini-3.7-flash') return 90;
    if (name == 'gemini-3.5-flash') return 80;
    if (name == 'gemini-3.1-pro-preview') return 70;
    if (name == 'gemini-pro-latest') return 60;
    if (name.contains('flash')) return 50;
    if (name.contains('pro')) return 40;
    return 10;
  }

  static bool _isNetworkError(dynamic e) {
    final s = e.toString().toLowerCase();
    return s.contains('socketexception') ||
        s.contains('failed host lookup') ||
        s.contains('no address associated with hostname') ||
        s.contains('network is unreachable') ||
        s.contains('connection refused') ||
        s.contains('clientexception') ||
        s.contains('handshakeexception');
  }

  static String _formatUserFriendlyError(String rawError) {
    if (rawError.isEmpty) return 'Analysis could not be completed. Please try again.';
    final lower = rawError.toLowerCase();
    if (lower.contains('socketexception') ||
        lower.contains('failed host lookup') ||
        lower.contains('no address associated with hostname') ||
        lower.contains('network is unreachable') ||
        lower.contains('clientexception')) {
      return 'Network connection error: Unable to reach Google AI servers. Please check your phone\'s Wi-Fi or mobile data.';
    }
    if (lower.contains('timeoutexception') || lower.contains('timed out')) {
      return 'Request timed out while connecting to Google AI. Please try again.';
    }
    if (lower.contains('429') || lower.contains('resource_exhausted')) {
      return 'Google Gemini rate limit reached. Please wait a moment and try again.';
    }
    if (lower.contains('401') || lower.contains('403') || lower.contains('api_key_invalid')) {
      return 'Invalid Gemini API key. Please check your key in Settings.';
    }
    // Remove internal secrets, URLs, and exception brackets for privacy and readability
    String cleaned = rawError.replaceAll(RegExp(r'key=[A-Za-z0-9_\-\.]+'), 'key=[REDACTED]');
    cleaned = cleaned.replaceAll(RegExp(r'https?://[^\s]+'), '');
    cleaned = cleaned.replaceAll(RegExp(r'\[.*?exception\]:?'), '').trim();
    cleaned = cleaned.replaceAll(RegExp(r'ClientException with '), '').trim();
    return cleaned.isNotEmpty ? cleaned : 'Unable to complete analysis. Please try again.';
  }

  Future<http.Response> _postWithRetry(
    Uri uri, {
    required Map<String, String> headers,
    required String body,
    Duration timeout = const Duration(seconds: 40),
    int maxRetries = 1,
  }) async {
    int attempts = 0;
    while (true) {
      attempts++;
      try {
        return await http.post(uri, headers: headers, body: body).timeout(timeout);
      } catch (e) {
        if (_isNetworkError(e) && attempts <= maxRetries) {
          debugPrint('Network hiccup encountered, waiting 1.5s before retry (attempt $attempts/$maxRetries)...');
          await Future.delayed(const Duration(milliseconds: 1500));
          continue;
        }
        rethrow;
      }
    }
  }

  Future<List<String>> _getAvailableModels(String apiKey) async {
    try {
      final uri = Uri.parse(
        'https://generativelanguage.googleapis.com/v1beta/models?key=$apiKey',
      );
      final response = await http.get(uri).timeout(const Duration(seconds: 8));
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        final models = (data['models'] as List?)
                ?.map((m) => m['name']?.toString().replaceFirst('models/', ''))
                .whereType<String>()
                .where(_isValidGenerationModel)
                .toList() ??
            [];
        if (models.isNotEmpty) {
          models.sort((a, b) {
            final scoreA = _modelPriorityScore(a);
            final scoreB = _modelPriorityScore(b);
            return scoreB.compareTo(scoreA);
          });
          // Pick top 3 verified generation models
          final topModels = models.take(3).toList();
          debugPrint('Discovered verified models for API key: $topModels');
          return topModels;
        }
      }
    } catch (e) {
      debugPrint('Dynamic model listing error: $e');
    }
    return _candidateModels.take(3).toList();
  }

  /// Validates the API key by listing available models
  Future<Map<String, dynamic>> testApiKey(String apiKey) async {
    final key = apiKey.trim();
    if (key.isEmpty) {
      return {'success': false, 'error': 'API key cannot be empty'};
    }

    try {
      final uri = Uri.parse(
        'https://generativelanguage.googleapis.com/v1beta/models?key=$key',
      );
      final response = await http.get(uri).timeout(const Duration(seconds: 12));

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        final models = (data['models'] as List?)
                ?.map((m) => m['name']?.toString().replaceFirst('models/', ''))
                .whereType<String>()
                .toList() ??
            [];
        return {
          'success': true,
          'message': 'Connected to Google Gemini! Found ${models.length} available models.',
          'models': models,
        };
      } else {
        final err = _extractErrorMessage(response.body);
        return {
          'success': false,
          'error': 'Google API Error (${response.statusCode}): $err',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'error': 'Network connection failed: $e',
      };
    }
  }

  /// Extracts the 6 ranked visual cue dimensions (Hero, Motif, Tension, Atmosphere, Lighting, Style) using Gemini AI
  Future<List<String>?> extract6RankedCueDimensionsWithAI({
    required String curatorAngle,
    required String newsHeadline,
    String? newsBody,
  }) async {
    final apiKey = await _storageService.getApiKey();
    if (apiKey == null || apiKey.trim().isEmpty) return null;

    final prompt = '''
You are an elite editorial art director for a high-signal social publication.
Given the following news headline, excerpt, and curator angle, extract exactly 6 prioritized visual cues representing the 6 core storytelling dimensions for an editorial poster:

NEWS HEADLINE: "$newsHeadline"
CURATOR'S ANGLE / STANCE: "$curatorAngle"
${newsBody != null && newsBody.trim().isNotEmpty ? 'ARTICLE EXCERPT: "${newsBody.length > 500 ? newsBody.substring(0, 500) : newsBody}"' : ''}

Extract 6 concise, concrete, evocative visual cues (2-5 words each):
1. HERO: The single undisputed central subject / figure / focal anchor.
2. MOTIF: The core symbolic metaphor representing the curator's deeper philosophical angle/critique.
3. TENSION: The opposing friction, conflict, or threat pushing against the hero.
4. ATMOSPHERE: The environmental setting, backdrop, and physical scale.
5. LIGHTING: The chiaroscuro lighting and dramatic shadow mood.
6. STYLE: The graphic art movement or print medium (e.g. High-Contrast Noir Risograph, Minimalist Bauhaus, Pop Graphic Vector).

Return strictly a valid JSON object with these 6 exact keys:
{
  "hero": "...",
  "motif": "...",
  "tension": "...",
  "atmosphere": "...",
  "lighting": "...",
  "style": "..."
}
''';

    final candidateModels = await _getAvailableModels(apiKey);
    for (final model in candidateModels) {
      try {
        final uri = Uri.parse(
          'https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=$apiKey',
        );
        final requestBody = {
          "contents": [
            {
              "parts": [{"text": prompt}],
            }
          ],
          "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.3,
          }
        };

        final response = await _postWithRetry(
          uri,
          headers: {'Content-Type': 'application/json'},
          body: json.encode(requestBody),
          timeout: const Duration(seconds: 12),
        );

        if (response.statusCode == 200) {
          final decoded = json.decode(response.body);
          final candidates = decoded['candidates'] as List?;
          if (candidates != null && candidates.isNotEmpty) {
            final content = candidates[0]['content'];
            final parts = content['parts'] as List?;
            if (parts != null && parts.isNotEmpty) {
              final rawText = parts[0]['text'] as String;
              final cleanJson = _cleanJsonString(rawText);
              final Map<String, dynamic> data = json.decode(cleanJson);

              final hero = data['hero']?.toString().trim();
              final motif = data['motif']?.toString().trim();
              final tension = data['tension']?.toString().trim();
              final atmosphere = data['atmosphere']?.toString().trim();
              final lighting = data['lighting']?.toString().trim();
              final style = data['style']?.toString().trim();

              final result = <String>[];
              if (hero != null && hero.isNotEmpty) result.add(hero);
              if (motif != null && motif.isNotEmpty) result.add(motif);
              if (tension != null && tension.isNotEmpty) result.add(tension);
              if (atmosphere != null && atmosphere.isNotEmpty) result.add(atmosphere);
              if (lighting != null && lighting.isNotEmpty) result.add(lighting);
              if (style != null && style.isNotEmpty) result.add(style);

              if (result.length >= 4) {
                return result;
              }
            }
          }
        }
      } catch (e) {
        debugPrint('Gemini 6-dimension extraction exception on $model: $e');
      }
    }
    return null;
  }

  /// Generates fresh replacement visual cues specifically for selected cues,
  /// harmonizing with existing kept cues.
  Future<List<String>?> resuggestSelectedCuesWithAI({
    required String curatorAngle,
    required String newsHeadline,
    String? newsBody,
    required List<String> existingKeptCues,
    required int countNeeded,
  }) async {
    final apiKey = await _storageService.getApiKey();
    if (apiKey == null || apiKey.trim().isEmpty) return null;

    final keptPrompt = existingKeptCues.isNotEmpty
        ? 'The user already likes and is KEEPING these visual cues:\n${existingKeptCues.map((c) => "- $c").join("\n")}\n'
        : '';

    final prompt = '''
You are an elite editorial art director for a high-signal social publication.
Given the following news headline, excerpt, and curator angle:

NEWS HEADLINE: "$newsHeadline"
CURATOR'S ANGLE / STANCE: "$curatorAngle"
${newsBody != null && newsBody.trim().isNotEmpty ? 'ARTICLE EXCERPT: "${newsBody.length > 500 ? newsBody.substring(0, 500) : newsBody}"' : ''}
$keptPrompt
Provide exactly $countNeeded fresh, distinct, concrete, evocative visual cues (2-5 words each) representing powerful storytelling metaphors or scene elements for an editorial poster.
Do NOT repeat the kept cues. Harmonize with the theme.

Return strictly a valid JSON array of strings, for example:
["cue 1", "cue 2"]
''';

    final candidateModels = await _getAvailableModels(apiKey);
    for (final model in candidateModels) {
      try {
        final uri = Uri.parse(
          'https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=$apiKey',
        );
        final requestBody = {
          "contents": [
            {
              "parts": [{"text": prompt}],
            }
          ],
          "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.5,
          }
        };

        final response = await _postWithRetry(
          uri,
          headers: {'Content-Type': 'application/json'},
          body: json.encode(requestBody),
          timeout: const Duration(seconds: 12),
        );

        if (response.statusCode == 200) {
          final decoded = json.decode(response.body);
          final candidates = decoded['candidates'] as List?;
          if (candidates != null && candidates.isNotEmpty) {
            final content = candidates[0]['content'];
            final parts = content['parts'] as List?;
            if (parts != null && parts.isNotEmpty) {
              final rawText = parts[0]['text'] as String;
              final cleanJson = _cleanJsonString(rawText);
              final decodedList = json.decode(cleanJson);
              if (decodedList is List) {
                final result = decodedList
                    .map((e) => e.toString().trim())
                    .where((e) => e.isNotEmpty && !existingKeptCues.contains(e))
                    .toList();
                if (result.isNotEmpty) {
                  return result;
                }
              }
            }
          }
        }
      } catch (e) {
        debugPrint('Gemini selective cue suggestion exception on $model: $e');
      }
    }
    return null;
  }

  /// Web Match First pipeline for physical paper clippings:
  /// Stage 1: Quick vision scan for headline & publication name
  /// Stage 2: Live Google Search to discover matching active online news article
  /// Stage 3A: If matched -> synthesize from clean digital text + active URL
  /// Stage 3B: If not found -> fallback to deep multimodal OCR on physical print
  Future<GeminiAnalysisResult> analyzeAndSummarizeArticleWithWebMatchFirst({
    required Uint8List imageBytes,
    required String targetAudience,
    required String tone,
    String? userContext,
    String? hookCues,
    String? fallbackTitle,
    String? fallbackBody,
    double visualArtRatio = 0.6,
    PostCardItem? existingItem,
    int regenerationIteration = 0,
    bool skipImageGeneration = false,
    Uint8List? referenceImageBytes,
    bool matchRealPersonLikeness = false,
    void Function(String message)? onProgressUpdate,
  }) async {
    final apiKey = await _storageService.getApiKey();

    if (apiKey == null || apiKey.trim().isEmpty) {
      debugPrint('No API Key configured, using Smart Demo mode.');
      return await _generateSmartDemoResult(
        targetAudience: targetAudience,
        tone: tone,
        userContext: userContext,
        hookCues: hookCues,
        fallbackTitle: fallbackTitle,
        fallbackBody: fallbackBody,
        visualArtRatio: visualArtRatio,
        existingItem: existingItem,
        regenerationIteration: regenerationIteration,
        skipImageGeneration: skipImageGeneration,
        errorMessage: 'No Gemini API Key provided. Enter your free API key in Settings.',
      );
    }

    // Step 1: Fast Vision scan for Headline & Publication
    onProgressUpdate?.call('🔍 Step 1/3: Reading printed headline & publication...');
    String? detectedHeadline;
    String? detectedPublication;
    String? detectedKeywords;

    try {
      final base64Image = base64Encode(imageBytes);
      final scanPrompt = '''
Analyze this physical newspaper or magazine clipping. The photo may be photographed at an angle, rotated sideways (90°/270°), or upside down (180°); automatically detect the text orientation and reading direction.
Extract ONLY:
1. "headline": The main printed article headline in large bold type.
2. "publication": The newspaper or magazine title if visible (e.g. "The Hindu", "The New York Times", "Financial Times", "Times of India", or "").
3. "keywords": 2-3 prominent key names, terms, or phrases from the opening paragraph.

Return ONLY a valid JSON object matching:
{
  "headline": "Exact headline text",
  "publication": "Publication name or empty",
  "keywords": "Key terms"
}
''';

      final uri = Uri.parse(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=$apiKey',
      );
      final scanBody = {
        "contents": [
          {
            "parts": [
              {
                "inlineData": {
                  "mimeType": "image/jpeg",
                  "data": base64Image,
                }
              },
              {"text": scanPrompt}
            ]
          }
        ],
        "generationConfig": {
          "responseMimeType": "application/json",
          "temperature": 0.2,
        }
      };

      final scanResp = await _postWithRetry(
        uri,
        headers: {'Content-Type': 'application/json'},
        body: json.encode(scanBody),
        timeout: const Duration(seconds: 25),
      );

      if (scanResp.statusCode == 200) {
        final decoded = json.decode(scanResp.body);
        final rawText = decoded['candidates']?[0]?['content']?['parts']?[0]?['text'] as String?;
        if (rawText != null) {
          final clean = _cleanJsonString(rawText);
          final data = json.decode(clean) as Map<String, dynamic>;
          detectedHeadline = data['headline']?.toString().trim();
          detectedPublication = data['publication']?.toString().trim();
          detectedKeywords = data['keywords']?.toString().trim();
          debugPrint('Vision detected headline: "$detectedHeadline", pub: "$detectedPublication"');
        }
      }
    } catch (e) {
      debugPrint('Quick headline scan exception: $e');
    }

    // Step 2: If headline detected, search Google for matching live digital article
    if (detectedHeadline != null && detectedHeadline.length >= 8) {
      final pubLabel = (detectedPublication != null && detectedPublication.isNotEmpty)
          ? ' ($detectedPublication)'
          : '';
      onProgressUpdate?.call('🌐 Step 2/3: Searching web for: "$detectedHeadline"$pubLabel...');

      try {
        final searchPrompt = '''
The user photographed a physical newspaper clipping with this headline:
"$detectedHeadline"
Publication: "${detectedPublication ?? 'News Media'}"
Keywords: "${detectedKeywords ?? ''}"

Search Google for the full active online news article matching this exact newspaper story.
If you find the active matching online news article:
Return JSON:
{
  "web_match_found": true,
  "active_url": "The exact active URL to the article on the web",
  "publisher": "The publisher/website name",
  "verified_headline": "The online headline",
  "digital_article_text": "The full verified body text of the article from the publisher"
}

If no active matching article exists online (e.g. print-only local brief, obscure clipping, archive):
Return JSON:
{
  "web_match_found": false
}
''';

        final uri = Uri.parse(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=$apiKey',
        );
        final searchBody = {
          "contents": [
            {
              "parts": [
                {"text": searchPrompt}
              ]
            }
          ],
          "tools": [
            {"googleSearch": {}}
          ],
          "generationConfig": {
            "temperature": 0.2,
          }
        };

        final searchResp = await _postWithRetry(
          uri,
          headers: {'Content-Type': 'application/json'},
          body: json.encode(searchBody),
          timeout: const Duration(seconds: 35),
        );

        if (searchResp.statusCode == 200) {
          final decoded = json.decode(searchResp.body);
          final rawText = decoded['candidates']?[0]?['content']?['parts']?[0]?['text'] as String?;
          if (rawText != null) {
            final clean = _cleanJsonString(rawText);
            final searchData = json.decode(clean) as Map<String, dynamic>;
            final matchFound = searchData['web_match_found'] == true;
            final activeUrl = searchData['active_url']?.toString().trim();
            final publisher = searchData['publisher']?.toString().trim() ?? detectedPublication ?? 'Web News';
            final verifiedTitle = searchData['verified_headline']?.toString().trim() ?? detectedHeadline;
            final digitalText = searchData['digital_article_text']?.toString().trim();

            if (matchFound && activeUrl != null && activeUrl.startsWith('http') && digitalText != null && digitalText.length > 80) {
              onProgressUpdate?.call('✨ Step 3/3: Matched online story on $publisher! Synthesizing poster with digital link...');

              final result = await analyzeAndSummarizeDigitalArticle(
                articleUrl: activeUrl,
                articleTitle: verifiedTitle,
                articleBody: digitalText,
                publicationName: publisher,
                targetAudience: targetAudience,
                tone: tone,
                userContext: userContext,
                hookCues: hookCues,
                visualArtRatio: visualArtRatio,
                existingItem: existingItem,
                regenerationIteration: regenerationIteration,
                skipImageGeneration: skipImageGeneration,
                referenceImageBytes: referenceImageBytes,
                matchRealPersonLikeness: matchRealPersonLikeness,
              );

              return result;
            }
          }
        }
      } catch (e) {
        debugPrint('Web match query exception: $e');
      }
    }

    // Step 3B: Fallback to full multimodal OCR on the physical clipping
    onProgressUpdate?.call('📰 Step 3/3: Print-only story — Running deep column OCR on physical print...');
    return analyzeAndSummarizeArticle(
      imageBytes: imageBytes,
      targetAudience: targetAudience,
      tone: tone,
      userContext: userContext,
      hookCues: hookCues,
      fallbackTitle: detectedHeadline ?? fallbackTitle,
      fallbackBody: fallbackBody,
      visualArtRatio: visualArtRatio,
      existingItem: existingItem,
      regenerationIteration: regenerationIteration,
      skipImageGeneration: skipImageGeneration,
      referenceImageBytes: referenceImageBytes,
      matchRealPersonLikeness: matchRealPersonLikeness,
    );
  }

  /// Builds the Elite Editorial "Fact vs. Angle" prompt for Gemini
  String _buildEditorialPrompt({
    required String sourceDescription,
    required String targetAudience,
    required String tone,
    String? userContext,
    String? hookCues,
    PostCardItem? existingItem,
    int regenerationIteration = 0,
    required int artPct,
    required int textPct,
  }) {
    return '''
You are an elite editorial art director and publication curator for a high-signal social publication studio.

Your task is to take:
1. Source Content (article text, OCR capture from newsprint/book, or web article transcript):
$sourceDescription

2. Curator's Unhedged Take (user's raw opinion, stance, or critique in plain words):
${userContext != null && userContext.trim().isNotEmpty ? '"${userContext.trim()}"\nThis is the user\'s raw seed perspective. In Slide 2, you MUST articulate, refine, and extend this stance into a cohesive, model-synthesized editorial argument connecting the stance to the article\'s verified facts and context. DO NOT copy or output this raw text verbatim.' : 'Distill the most provocative, high-signal angle for the audience.'}

3. Target Audience: "$targetAudience" (Tone: "$tone")

And generate the creative direction, editorial copy, and visual art prompts for a 3-Slide Social Poster Series (4:5 vertical portrait format, 1080x1350) following the "Fact vs. Angle" architecture.

EDITORIAL & COPYWRITING DIRECTIVES:

SLIDE 1 — THE ANCHOR HOOK ("Fact vs. Angle"):
- TOP PILL BADGE: Explicitly state the subject/conflict and source.
  Format: "[SPECIFIC ENTITY/TOPIC] • [SOURCE OUTLET]"
  (e.g., "ECI ROW • Hindustan Times", never generic tags like "SYSTEM GOVERNANCE • Hindustan Times").
- CONTEXT ANCHOR (The Fact): Exactly 1 plainspoken sentence or actual news excerpt (≤ 14 words) establishing the real-world event and explicitly naming the primary people, parties, or institutions. If longer, keep it concise so it can sit on a small ripped newspaper clipping fragment.
- MAIN HOOK (The Angle): 1 punchy, provocative headline (≤ 10 words) expressing the curator's core tension or critique.
- ANTI-JARGON RULE: Strictly avoid abstract, over-intellectualized filler (e.g., "institutional nodes", "legacy operators", "systemic vectors", "epistemic paradigms", "structural dialectic"). Write with the clarity and bite of an elite editorial columnist.
- FOOTER HINT: "SWIPE FOR TAKE →"

ART DIRECTOR ENGINE: BACKGROUND VISUAL GENERATION (SLIDE 1)
The user does not provide artistic instructions. You must automatically invent the scene:
1. VISUAL METAPHOR:
   - Identify the tension between the news reality and the curator's angle.
   - Translate it into a concrete, symbolic composition (e.g., strings of power, opaque black boxes, scales of justice, sorting sieves, labyrinths, fractured mirrors).
2. COUNTRY & CULTURAL CUES:
   - Detect the country/jurisdiction of the news.
   - Weave in 1–2 authentic architectural or regional cues (e.g., for India: classical circular stone colonnades, EVM control console silhouettes, indelible ink bottle marks, red-tape government dossiers; for Wall Street: ticker tape, bank vaults, marble steps; for Silicon Valley: server racks, silicon wafers, glass atriums).
3. VOCATIONAL & OCCUPATIONAL PROPS:
   - Incorporate the tactile tools and silhouettes of the actors' professions (e.g., political bandhgala/suit silhouettes, diplomatic roundtable microphones, judicial gavels, server racks, ledgers, ballot boxes).
4. RENDERING & NEGATIVE CONSTRAINTS:
   - Style: Graphic editorial illustration / noir chiaroscuro / high-contrast dramatic cinematic lighting.
   - Composition: Keep the main visual action in the upper/center area, leaving the bottom 35% dark, clean, and low-contrast for typography overlay.
   - STRICT TEXT BAN: Strictly "no text, no letters, no words, no typos, no watermark, clean negative space".

SLIDE 2 ARCHITECTURE ("CURATOR'S TAKE"):
- MANDATORY REFINEMENT DIRECTIVE (NEVER ECHO VERBATIM):
  * Slide 2 must NEVER display the user's raw input verbatim!
  * You MUST refine and extend the curator's unhedged take into an articulate, model-synthesized editorial argument (EXACTLY 2 complete sentences, 22–32 words total, ending definitively with a period).
  * Ground the take directly in the article's specific facts, actors, and structural implications.
  * Express it with the bite and precision of an elite columnist championing the curator's unhedged perspective for "$targetAudience".
- SLIDE TITLE: "[THE CORE VERDICT / THESIS]" (≤ 7 words).
  EDITORIAL TONE GUARDRAIL: Use incisive, thoughtful critique rather than cheap sensationalism or juvenile name-calling (avoid overly abrasive words like "shameless", "frauds", "clowns"; use sharp, analytical phrasing like "Wealth As Political Currency", "The Normalization of Political Fortunes", "The Institutional Cost of Opulence").
- CURATOR OPINION BODY (take_body): The model-refined and extended editorial take synthesizing the user's unhedged stance against article context.
  POSTER BOUNDARY CONSTRAINT: Must be EXACTLY 2 tight, self-contained sentences (total 22–32 words, ~140–180 characters) ending with a definitive period (.). The poster displays this exact text, so it MUST NEVER cut off mid-thought or trail into ellipses (...). Detailed background context will live in the web application (editour.app), but this poster version must end cleanly and feel 100% complete within the poster boundaries.
- "WHY IT MATTERS" CALLOUT: Exactly 1 punchy takeaway line (≤ 12 words) ending with a period (.), framing the practical implication for the reader.

SLIDE 3 ARCHITECTURE ("THE RECEIPT / SOURCE PROOF"):
- MASTHEAD: Source Publication Name (e.g., "The Economist", "Hindustan Times", "Bloomberg") + Volume / Date / Edition.
- ORIGINAL ARTICLE HEADLINE: Verbatim or clean journalistic headline from source.
- ARTICLE EXCERPTS (MANDATORY EXACTLY 3 SUBSTANTIAL PARAGRAPHS, 30–50 WORDS EACH, STRICTLY JOURNALISTIC SOURCE TEXT, ZERO CURATOR COMMENTARY):
  1. Opening Lead: 30–50 words establishing the authentic news story and baseline facts.
  2. Pivotal Key Section Quote / Evidence: 30–50 words containing the core evidence or crucial revelation.
  3. Corroborating Findings / Reactions: 30–50 words of official quotes, context, or data.
- KEY EXCERPT HIGHLIGHT: The single most pivotal sentence or quote from paragraph 2 (highlighted callout).
- FOOTER: "VERIFIED SOURCE EVIDENCE • READ FULL ARTICLE"

${hookCues != null && hookCues.trim().isNotEmpty ? '''
CURATOR'S ORDERED VISUAL CUES & METAPHOR PRIORITIZATION:
"${hookCues.trim()}"

MANDATORY ART DIRECTION RULE (STRICT ORDER PRIORITY):
- Consider ALL cues listed above, but strictly prioritize the visual impression, focal point, and art composition based on the numerical order of these keywords.
- Priority #1 is the DOMINANT HERO METAPHOR and central focal subject of Slide 1. It MUST be the most prominent, unmistakably dominant element in the upper 65% visual art area.
- Priority #2 is the SECONDARY SUPPORTING MOTIF or contextual backdrop.
- Subsequent cues provide subtle tactile atmospheric props, lighting, or institutional textures.
- The editorial hook headline and the visual art prompt MUST prominently reflect Priority #1 first and foremost.
''' : ''}

${(existingItem != null || regenerationIteration > 0) ? '''
🔄 REGENERATION DIRECTIVE (Attempt #${regenerationIteration + 1}):
MANDATORY: DO NOT repeat previous headline ("${existingItem?.adaptedHeadline ?? ''}"), previous hook ("${existingItem?.hook ?? ''}"), or previous visual metaphor.
Explore a fresh unexamined facet or deeper implication while fiercely preserving the curator's stance.
''' : ''}

JSON OUTPUT SCHEMA:
Return ONLY valid JSON matching this exact structure:
{
  "editorial_metadata": {
    "primary_entity": "Specific entity/topic (e.g., 'ECI ROW', 'NVIDIA CHIPS')",
    "source_outlet": "Source publication name (e.g., 'Hindustan Times', 'Bloomberg')",
    "theme_palette": {
      "accent_color": "#HEX",
      "background_tone": "dark | light | warm_parchment",
      "style_name": "editorial | modernCyber | boldSocial | minimalist"
    }
  },
  "slide_1_anchor_hook": {
    "pill_badge": "[SPECIFIC TOPIC/ENTITY] • [SOURCE NAME]",
    "context_anchor": "Plainspoken 1-sentence real-world fact naming people/institutions (<= 14 words)",
    "hook_headline": "Punchy provocative headline expressing curator's core tension/critique (<= 10 words)",
    "footer_hint": "SWIPE FOR TAKE →",
    "image_prompt": "Editorial illustration with concrete visual metaphor, authentic country/regional cues, vocational silhouettes, dramatic noir chiaroscuro lighting. Main visual in upper/center, bottom 35% dark and clean. Strictly no text, no letters, no words, no typos, no watermark."
  },
  "slide_2_curator_take": {
    "take_headline": "Core verdict headline (<= 7 words, sharp & analytical, avoiding cheap slurs/offensive words)",
    "take_body": "Model-refined and extended editorial take (NOT raw user text verbatim). Exactly 2 tight, self-contained analytical sentences (22-32 words total) synthesizing the curator's unhedged stance against article facts, ending definitively with a period (.), zero fluff, perfectly fitted for poster boundaries",
    "why_it_matters_callout": "Stakes or practical implication ending with a period (<= 12 words)"
  },
  "slide_3_source_proof": {
    "masthead_title": "Source publication name",
    "article_headline": "Original print or digital headline",
    "key_excerpt_highlight": "Most pivotal verbatim sentence or quote from source text",
    "article_excerpts": [
      "1st authentic verbatim excerpt paragraph from source (30-50 words): lead reporting or factual context.",
      "2nd authentic verbatim excerpt or central quote (30-50 words): core evidence or crucial statement.",
      "3rd authentic verbatim excerpt paragraph from source (30-50 words): corroborating facts, figures, or official reaction."
    ],
    "surrounding_context": "1-2 authentic context sentences from the source article",
    "publication_date_or_volume": "Date, Edition, or Section (e.g., 'Vol. CLXXIV • City Edition' or 'October 2026')"
  }
}
''';
  }

  /// Cleans and formats structured cue pills into natural descriptive prose for AI image models
  static String _cleanCuesForImagePrompt(String cues) {
    return cues
        .replaceAll(RegExp(r'#1\s*\[HERO[^\]]*\]:?', caseSensitive: false), 'Hero subject:')
        .replaceAll(RegExp(r'#2\s*\[MOTIF[^\]]*\]:?', caseSensitive: false), 'Symbolic motif:')
        .replaceAll(RegExp(r'#3\s*\[TENSION[^\]]*\]:?', caseSensitive: false), 'Visual tension:')
        .replaceAll(RegExp(r'#4\s*\[ATMOSPHERE[^\]]*\]:?', caseSensitive: false), 'Atmospheric setting:')
        .replaceAll(RegExp(r'#5\s*\[LIGHTING[^\]]*\]:?', caseSensitive: false), 'Lighting:')
        .replaceAll(RegExp(r'#6\s*\[STYLE[^\]]*\]:?', caseSensitive: false), 'Art style:')
        .replaceAll(RegExp(r'\[[^\]]*\]'), '')
        .replaceAll('•', ',')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
  }

  /// Formats the final illustration prompt by synthesizing Cues, Curator Angle, and News Headline
  static String _buildPrioritizedIllustrationPrompt({
    String? hookCues,
    String? generatedPrompt,
    String? fallbackContext,
    String? fallbackHeadline,
  }) {
    final buffer = StringBuffer();

    // 1. Core Visual Cues (Hero subject, motif, tension, lighting)
    if (hookCues != null && hookCues.trim().isNotEmpty) {
      buffer.write(_cleanCuesForImagePrompt(hookCues));
      buffer.write('. ');
    }

    // 2. Curator's Angle & Editorial Narrative (Vital thematic metaphor!)
    if (fallbackContext != null && fallbackContext.trim().isNotEmpty) {
      buffer.write('Curator angle and editorial perspective: ');
      buffer.write(fallbackContext.trim());
      buffer.write('. ');
    }

    // 3. Scene context / Generated prompt or Headline
    if (generatedPrompt != null && generatedPrompt.trim().isNotEmpty) {
      buffer.write('Scene context: ');
      buffer.write(generatedPrompt.trim());
      buffer.write('. ');
    } else if (fallbackHeadline != null && fallbackHeadline.trim().isNotEmpty) {
      buffer.write('News story headline: ');
      buffer.write(fallbackHeadline.trim());
      buffer.write('. ');
    }

    buffer.write(
      'Modern cinematic editorial artwork poster, 4:5 vertical format, volumetric rim lighting, '
      'dramatic chiaroscuro lighting, rich textural depth, clean negative space in bottom 30% for badge placement, '
      'strictly no typography, no letters, no words anywhere in the image.',
    );

    return buffer.toString();
  }

  /// Robust Dual-Schema Parser: handles both the new nested "Fact vs. Angle"
  /// architecture and the legacy flat format seamlessly.
  static GeminiAnalysisResult _parseAnalysisResult({
    required Map<String, dynamic> data,
    required String rawText,
    required String targetAudience,
    required String tone,
    String? userContext,
    String? fallbackTitle,
    String? fallbackPub,
    String? fallbackBody,
    String? digitalLink,
    Uint8List? generatedIllustrationBytes,
    double visualArtRatio = 0.6,
  }) {
    final bool isNested = data.containsKey('slide_1_anchor_hook');

    final s1 = isNested && data['slide_1_anchor_hook'] is Map<String, dynamic>
        ? data['slide_1_anchor_hook'] as Map<String, dynamic>
        : <String, dynamic>{};
    final s2 = isNested && data['slide_2_curator_take'] is Map<String, dynamic>
        ? data['slide_2_curator_take'] as Map<String, dynamic>
        : <String, dynamic>{};
    final s3 = isNested && data['slide_3_source_proof'] is Map<String, dynamic>
        ? data['slide_3_source_proof'] as Map<String, dynamic>
        : <String, dynamic>{};
    final meta = isNested && data['editorial_metadata'] is Map<String, dynamic>
        ? data['editorial_metadata'] as Map<String, dynamic>
        : <String, dynamic>{};
    final theme = meta['theme_palette'] is Map<String, dynamic>
        ? meta['theme_palette'] as Map<String, dynamic>
        : <String, dynamic>{};

    final pub = meta['source_outlet']?.toString().trim() ??
        s3['masthead_title']?.toString().trim() ??
        data['publication_name']?.toString().trim() ??
        fallbackPub ??
        'Press Wire';

    String entity = meta['primary_entity']?.toString().trim() ??
        data['category_badge']?.toString().trim() ??
        '';
    if (entity.isEmpty && s1['pill_badge'] != null) {
      final pill = s1['pill_badge'].toString();
      if (pill.contains('•')) {
        entity = pill.split('•').first.trim().replaceAll(RegExp(r'^\[|\]$'), '');
      } else {
        entity = pill.replaceAll(RegExp(r'^\[|\]$'), '').trim();
      }
    }
    if (entity.isEmpty) entity = 'EDITORIAL';

    final origHeadline = s3['article_headline']?.toString().trim() ??
        data['original_headline']?.toString().trim() ??
        fallbackTitle ??
        'Original Report';

    final adaptedHeadline = s1['hook_headline']?.toString().trim() ??
        data['adapted_headline']?.toString().trim() ??
        origHeadline;

    final contextAnchor = s1['context_anchor']?.toString().trim() ??
        data['hook']?.toString().trim() ??
        'Verified real-world event.';

    String takeBody = s2['take_body']?.toString().trim() ??
        data['creator_opinion']?.toString().trim() ??
        data['summary']?.toString().trim() ??
        '';

    // GUARANTEE: Slide 2 must NEVER display the raw user take verbatim!
    // If the model echoed the raw userContext verbatim or returned an empty takeBody,
    // synthesize an articulate, context-grounded editorial argument.
    if (userContext != null && userContext.trim().isNotEmpty) {
      final rawUser = userContext.trim();
      final isVerbatim = takeBody.toLowerCase() == rawUser.toLowerCase() ||
          takeBody.toLowerCase() == '"${rawUser.toLowerCase()}"' ||
          takeBody.isEmpty;
      if (isVerbatim) {
        final topic = entity.isNotEmpty ? entity : 'this development';
        takeBody = 'Beyond surface reporting, $rawUser. This exposes a systemic inflection point regarding $topic that institutional observers and the mainstream feed routinely underestimate.';
      }
    } else if (takeBody.isEmpty) {
      takeBody = 'Surface reporting treats this as an isolated milestone, but the structural implications reveal a far more decisive shift. Navigating these underlying currents requires looking well beyond official soundbites.';
    }

    final whyItMatters = s2['why_it_matters_callout']?.toString().trim() ??
        data['why_it_matters']?.toString().trim();

    List<String> excerpts = [];
    if (s3['article_excerpts'] is List) {
      excerpts = (s3['article_excerpts'] as List)
          .map((e) => e.toString().trim())
          .where((e) => e.isNotEmpty)
          .take(3)
          .toList();
    }
    if (excerpts.isEmpty && data['article_excerpts'] is List) {
      excerpts = (data['article_excerpts'] as List)
          .map((e) => e.toString().trim())
          .where((e) => e.isNotEmpty)
          .take(3)
          .toList();
    }
    if (excerpts.length < 3) {
      if (s3['key_excerpt_highlight'] != null && s3['key_excerpt_highlight'].toString().trim().isNotEmpty) {
        final q = s3['key_excerpt_highlight'].toString().trim();
        if (!excerpts.contains(q)) excerpts.insert(excerpts.length > 1 ? 1 : 0, q);
      }
      if (s3['surrounding_context'] != null && s3['surrounding_context'].toString().trim().isNotEmpty) {
        final ctx = s3['surrounding_context'].toString().trim();
        if (!excerpts.contains(ctx)) excerpts.add(ctx);
      }
    }
    if (excerpts.length < 3 && fallbackBody != null && fallbackBody.trim().isNotEmpty) {
      final paras = fallbackBody
          .split(RegExp(r'\n\s*\n'))
          .map((p) => p.trim())
          .where((p) => p.length > 25 && !excerpts.contains(p))
          .toList();
      for (final p in paras) {
        if (excerpts.length >= 3) break;
        excerpts.add(p);
      }
    }
    if (excerpts.length < 3) {
      final defaults = [
        'Primary journalistic reporting documented verifiable operational developments across core sectors, noting structural shifts from initial projections.',
        'Official records and agency representatives corroborated the reported sequence, highlighting key data points observed across field assessments.',
        'Industry analysts and administrative observers underscored the broader systemic impact, noting strategic adjustments taking effect across monitored channels.'
      ];
      for (final d in defaults) {
        if (excerpts.length >= 3) break;
        if (!excerpts.contains(d)) excerpts.add(d);
      }
    }

    final highlightQuote = s3['key_excerpt_highlight']?.toString().trim() ??
        data['receipt_highlight_quote']?.toString().trim() ??
        data['pull_quote']?.toString().trim() ??
        (excerpts.length > 1 ? excerpts[1] : (excerpts.isNotEmpty ? excerpts[0] : 'Pivotal verified source excerpt.'));

    List<String> takeaways = [];
    if (s2['take_headline'] != null && s2['take_headline'].toString().trim().isNotEmpty) {
      takeaways.add(s2['take_headline'].toString().trim());
    }
    if (whyItMatters != null && whyItMatters.isNotEmpty && !takeaways.contains(whyItMatters)) {
      takeaways.add(whyItMatters);
    }
    if (data['key_takeaways'] is List) {
      for (final t in data['key_takeaways'] as List) {
        final str = t.toString().trim();
        if (str.isNotEmpty && !takeaways.contains(str)) {
          takeaways.add(str);
        }
      }
    }
    if (takeaways.isEmpty) {
      takeaways.add(adaptedHeadline);
    }

    PosterStyleType style = PosterStyleType.editorial;
    final styleStr = (theme['style_name'] ?? data['suggested_style'])?.toString().toLowerCase();
    if (styleStr == 'moderncyber' || styleStr == 'modern_cyber') {
      style = PosterStyleType.modernCyber;
    } else if (styleStr == 'boldsocial' || styleStr == 'bold_social') {
      style = PosterStyleType.boldSocial;
    } else if (styleStr == 'minimalist') {
      style = PosterStyleType.minimalist;
    }

    final illPrompt = s1['image_prompt']?.toString().trim() ??
        data['illustration_prompt']?.toString().trim();

    final summaryText = isNested
        ? '$contextAnchor\n\n$takeBody'.trim()
        : (data['summary']?.toString() ?? '$contextAnchor\n\n$takeBody'.trim());

    final metric = s3['publication_date_or_volume']?.toString().trim() ??
        data['key_metric']?.toString().trim() ??
        'Verified';

    final link = digitalLink ??
        data['digital_link']?.toString() ??
        'https://news.google.com/search?q=${Uri.encodeComponent(adaptedHeadline)}';

    return GeminiAnalysisResult(
      originalHeadline: origHeadline,
      publicationName: pub,
      adaptedHeadline: adaptedHeadline,
      hook: contextAnchor,
      summary: summaryText,
      whyItMatters: whyItMatters,
      keyTakeaways: takeaways,
      pullQuote: highlightQuote,
      receiptHighlightQuote: highlightQuote,
      articleExcerpts: excerpts,
      keyMetric: metric,
      categoryBadge: entity.toUpperCase(),
      digitalLink: link,
      suggestedStyle: style,
      illustrationPrompt: illPrompt,
      generatedIllustrationBytes: generatedIllustrationBytes,
      curatorIllustrationPrompt: takeBody,
      creatorOpinion: takeBody,
      visualArtRatio: visualArtRatio,
      infographicType: data['infographic_type']?.toString() ?? 'metric_spotlight',
      infographicStats: (data['infographic_stats'] as List?)
              ?.map((e) => e.toString())
              .toList() ??
          [entity, pub, metric],
      visualMood: data['visual_mood']?.toString() ?? theme['background_tone']?.toString() ?? 'Editorial Fine Art',
      isDemoMode: false,
      rawGeminiResponse: rawText,
    );
  }

  /// Multimodal analysis of physical newspaper / magazine photos
  Future<GeminiAnalysisResult> analyzeAndSummarizeArticle({
    required Uint8List imageBytes,
    required String targetAudience,
    required String tone,
    String? userContext,
    String? hookCues,
    String? fallbackTitle,
    String? fallbackBody,
    double visualArtRatio = 0.6,
    PostCardItem? existingItem,
    int regenerationIteration = 0,
    bool skipImageGeneration = false,
    Uint8List? referenceImageBytes,
    bool matchRealPersonLikeness = false,
  }) async {
    final apiKey = await _storageService.getApiKey();

    if (apiKey == null || apiKey.trim().isEmpty) {
      debugPrint('No API Key configured, using Smart Demo mode.');
      return await _generateSmartDemoResult(
        targetAudience: targetAudience,
        tone: tone,
        userContext: userContext,
        hookCues: hookCues,
        fallbackTitle: fallbackTitle,
        fallbackBody: fallbackBody,
        visualArtRatio: visualArtRatio,
        existingItem: existingItem,
        regenerationIteration: regenerationIteration,
        skipImageGeneration: skipImageGeneration,
        errorMessage: 'No Gemini API Key provided. Enter your free API key in Settings.',
      );
    }

    final base64Image = base64Encode(imageBytes);
    final int artPct = (visualArtRatio * 100).round();
    final int textPct = 100 - artPct;

    final prompt = _buildEditorialPrompt(
      sourceDescription: "Optical Character Recognition (OCR) on attached photo of physical newspaper or magazine clipping. Note: The photo may be photographed at an angle, rotated sideways (90°/270°), or upside down (180°); automatically detect the text orientation and read in the natural reading direction. Read all headlines, subheadings, bylines, date, and column body text.",
      targetAudience: targetAudience,
      tone: tone,
      userContext: userContext,
      hookCues: hookCues,
      existingItem: existingItem,
      regenerationIteration: regenerationIteration,
      artPct: artPct,
      textPct: textPct,
    );

    // Step 1: Text LLM extraction & synthesis with vision OCR
    final candidateModels = await _getAvailableModels(apiKey);
    String lastError = '';
    for (final model in candidateModels) {
      try {
        debugPrint('Attempting Gemini Text API with model: $model');

        final uri = Uri.parse(
          'https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=$apiKey',
        );

        final requestBody = {
          "contents": [
            {
              "parts": [
                {
                  "inlineData": {
                    "mimeType": "image/jpeg",
                    "data": base64Image,
                  }
                },
                {
                  "text": prompt,
                }
              ]
            }
          ],
          "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": (existingItem != null || regenerationIteration > 0) ? 0.85 : 0.35,
          }
        };

        final response = await _postWithRetry(
          uri,
          headers: {'Content-Type': 'application/json'},
          body: json.encode(requestBody),
          timeout: const Duration(seconds: 40),
        );

        debugPrint('Gemini [$model] response code: ${response.statusCode}');

        if (response.statusCode == 200) {
          final decoded = json.decode(response.body);
          final candidates = decoded['candidates'] as List?;
          if (candidates != null && candidates.isNotEmpty) {
            final content = candidates[0]['content'];
            final parts = content['parts'] as List?;
            if (parts != null && parts.isNotEmpty) {
              final rawText = parts[0]['text'] as String;
              final cleanJson = _cleanJsonString(rawText);
              final Map<String, dynamic> data = json.decode(cleanJson);

              // Pre-generate visual AI artwork illustration representing curated angle
              Uint8List? illustrationBytes;
              final illPrompt = (data['slide_1_anchor_hook'] is Map
                      ? data['slide_1_anchor_hook']['image_prompt']
                      : data['illustration_prompt'])
                  ?.toString();
              final effectiveIllustrationPrompt = _buildPrioritizedIllustrationPrompt(
                hookCues: hookCues,
                generatedPrompt: illPrompt,
                fallbackContext: userContext,
                fallbackHeadline: data['slide_1_anchor_hook']?['hook_headline'] ?? data['adapted_headline'],
              );

              if (!skipImageGeneration) {
                try {
                  illustrationBytes = await generatePosterIllustration(
                    apiKey: apiKey,
                    prompt: effectiveIllustrationPrompt,
                    seed: (existingItem != null || regenerationIteration > 0)
                        ? (DateTime.now().millisecondsSinceEpoch + regenerationIteration * 7919)
                        : 0,
                    styleIndex: regenerationIteration,
                    referenceImageBytes: referenceImageBytes,
                    matchRealPersonLikeness: matchRealPersonLikeness,
                  );
                } catch (e) {
                  debugPrint('Poster illustration generation exception: $e');
                }
              }

              return _parseAnalysisResult(
                data: data,
                rawText: rawText,
                targetAudience: targetAudience,
                tone: tone,
                userContext: userContext,
                fallbackTitle: fallbackTitle,
                fallbackBody: fallbackBody,
                generatedIllustrationBytes: illustrationBytes,
                visualArtRatio: visualArtRatio,
              );
            }
          }
        } else {
          lastError = '[$model error ${response.statusCode}]: ${_extractErrorMessage(response.body)}';
          debugPrint('Gemini model $model failed: $lastError');
        }
      } catch (e) {
        lastError = '[$model exception]: $e';
        debugPrint('Gemini model $model exception: $e');
        if (_isNetworkError(e)) {
          debugPrint('Network offline detected, halting model loop');
          break;
        }
      }
    }

    // If all models failed, return Smart Demo with a clean user-friendly message
    debugPrint('All Gemini models failed. Last error: $lastError');
    return await _generateSmartDemoResult(
      targetAudience: targetAudience,
      tone: tone,
      userContext: userContext,
      hookCues: hookCues,
      fallbackTitle: fallbackTitle,
      fallbackBody: fallbackBody,
      visualArtRatio: visualArtRatio,
      existingItem: existingItem,
      regenerationIteration: regenerationIteration,
      errorMessage: _formatUserFriendlyError(lastError),
    );
  }

  /// Synthesizes and analyzes a digital news article from a web link
  Future<GeminiAnalysisResult> analyzeAndSummarizeDigitalArticle({
    required String articleUrl,
    required String articleTitle,
    required String articleBody,
    String? publicationName,
    required String targetAudience,
    required String tone,
    String? userContext,
    String? hookCues,
    double visualArtRatio = 0.6,
    PostCardItem? existingItem,
    int regenerationIteration = 0,
    bool skipImageGeneration = false,
    Uint8List? referenceImageBytes,
    bool matchRealPersonLikeness = false,
  }) async {
    final apiKey = await _storageService.getApiKey();

    if (apiKey == null || apiKey.trim().isEmpty) {
      debugPrint('No API Key configured, using Smart Demo mode for digital article.');
      return await _generateSmartDemoResult(
        targetAudience: targetAudience,
        tone: tone,
        userContext: userContext,
        hookCues: hookCues,
        fallbackTitle: articleTitle.isNotEmpty ? articleTitle : 'Digital News Discovery',
        fallbackBody: articleBody.isNotEmpty ? articleBody : 'Digital news article summary.',
        visualArtRatio: visualArtRatio,
        existingItem: existingItem,
        regenerationIteration: regenerationIteration,
        skipImageGeneration: skipImageGeneration,
        errorMessage: 'No Gemini API Key provided. Enter your free API key in Settings.',
      );
    }

    final int artPct = (visualArtRatio * 100).round();
    final int textPct = 100 - artPct;
    final pubName = (publicationName != null && publicationName.isNotEmpty)
        ? publicationName
        : _extractDomainFromUrl(articleUrl);

    final prompt = _buildEditorialPrompt(
      sourceDescription: '''
ONLINE DIGITAL ARTICLE from "$pubName" ($articleUrl):
HEADLINE: $articleTitle
BODY TEXT:
${articleBody.length > 3500 ? articleBody.substring(0, 3500) : articleBody}
''',
      targetAudience: targetAudience,
      tone: tone,
      userContext: userContext,
      hookCues: hookCues,
      existingItem: existingItem,
      regenerationIteration: regenerationIteration,
      artPct: artPct,
      textPct: textPct,
    );

    final candidateModels = await _getAvailableModels(apiKey);
    String lastError = '';

    for (final model in candidateModels) {
      try {
        debugPrint('Attempting Gemini Text API for digital article with model: $model');
        final uri = Uri.parse(
          'https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=$apiKey',
        );

        final requestBody = {
          "contents": [
            {
              "parts": [
                {
                  "text": prompt,
                }
              ]
            }
          ],
          "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": (existingItem != null || regenerationIteration > 0) ? 0.85 : 0.35,
          }
        };

        final response = await _postWithRetry(
          uri,
          headers: {'Content-Type': 'application/json'},
          body: json.encode(requestBody),
          timeout: const Duration(seconds: 40),
        );

        if (response.statusCode == 200) {
          final decoded = json.decode(response.body);
          final candidates = decoded['candidates'] as List?;
          if (candidates != null && candidates.isNotEmpty) {
            final content = candidates[0]['content'];
            final parts = content['parts'] as List?;
            if (parts != null && parts.isNotEmpty) {
              final rawText = parts[0]['text'] as String?;
              if (rawText != null) {
                final cleanedJson = _cleanJsonString(rawText);
                final parsed = json.decode(cleanedJson) as Map<String, dynamic>;

                Uint8List? illustrationBytes;
                final illPrompt = (parsed['slide_1_anchor_hook'] is Map
                        ? parsed['slide_1_anchor_hook']['image_prompt']
                        : parsed['illustration_prompt'])
                    ?.toString();
                final effectiveDigitalPrompt = _buildPrioritizedIllustrationPrompt(
                  hookCues: hookCues,
                  generatedPrompt: illPrompt,
                  fallbackContext: userContext,
                  fallbackHeadline: parsed['slide_1_anchor_hook']?['hook_headline'] ?? parsed['adapted_headline'] ?? articleTitle,
                );

                if (!skipImageGeneration && effectiveDigitalPrompt.isNotEmpty && visualArtRatio >= 0.3) {
                  try {
                    illustrationBytes = await generatePosterIllustration(
                      apiKey: apiKey,
                      prompt: effectiveDigitalPrompt,
                      seed: (existingItem != null || regenerationIteration > 0)
                          ? (DateTime.now().millisecondsSinceEpoch + regenerationIteration * 7919)
                          : 0,
                      styleIndex: regenerationIteration,
                      referenceImageBytes: referenceImageBytes,
                      matchRealPersonLikeness: matchRealPersonLikeness,
                    );
                  } catch (e) {
                    debugPrint('Digital article illustration generation failed: $e');
                  }
                }

                return _parseAnalysisResult(
                  data: parsed,
                  rawText: rawText,
                  targetAudience: targetAudience,
                  tone: tone,
                  userContext: userContext,
                  fallbackTitle: articleTitle,
                  fallbackPub: pubName,
                  fallbackBody: articleBody,
                  digitalLink: articleUrl,
                  generatedIllustrationBytes: illustrationBytes,
                  visualArtRatio: visualArtRatio,
                );
              }
            }
          }
        } else {
          lastError = '[$model error ${response.statusCode}]: ${_extractErrorMessage(response.body)}';
        }
      } catch (e) {
        lastError = '[$model exception]: $e';
        debugPrint('Gemini digital article model $model exception: $e');
        if (_isNetworkError(e)) {
          debugPrint('Network offline detected, halting model loop');
          break;
        }
      }
    }

    return await _generateSmartDemoResult(
      targetAudience: targetAudience,
      tone: tone,
      userContext: userContext,
      hookCues: hookCues,
      fallbackTitle: articleTitle.isNotEmpty ? articleTitle : 'Digital News Story',
      fallbackBody: articleBody,
      visualArtRatio: visualArtRatio,
      existingItem: existingItem,
      regenerationIteration: regenerationIteration,
      errorMessage: _formatUserFriendlyError(lastError),
    );
  }

  /// Synthesizes and analyzes a book excerpt (single or multiple pages) with identified cover and curator angle
  Future<GeminiAnalysisResult> analyzeAndSummarizeBookExcerpt({
    required List<Uint8List> excerptPageImages,
    Uint8List? bookCoverImage,
    required String bookTitle,
    required String bookAuthor,
    required String curatorAngle,
    String? userExcerptText,
    required String targetAudience,
    required String tone,
    double visualArtRatio = 0.65,
  }) async {
    final apiKey = await _storageService.getApiKey();

    if (apiKey == null || apiKey.trim().isEmpty) {
      debugPrint('No API Key configured, using Smart Demo mode for book excerpt.');
      return _generateSmartBookDemoResult(
        bookTitle: bookTitle,
        bookAuthor: bookAuthor,
        curatorAngle: curatorAngle,
        userExcerptText: userExcerptText,
        targetAudience: targetAudience,
        tone: tone,
        visualArtRatio: visualArtRatio,
        errorMessage: 'No Gemini API Key provided. Enter your free API key in Settings.',
      );
    }

    final int artPct = (visualArtRatio * 100).round();
    final int textPct = 100 - artPct;

    final prompt = '''
You are the ghostwriter and museum-grade visual poster designer for the CURATOR of PostCard.
The Curator is sharing an excerpt from the book "$bookTitle" by $bookAuthor.

⚠️ ABSOLUTE EDITORIAL DIRECTIVE: FULL CURATOR OWNERSHIP
The Curator is NOT asking for a neutral, detached book review or textbook summary.
The Curator has staked an explicit personal thesis / emotional verdict on this reading:
CURATOR'S STATED ANGLE & OPINION:
"$curatorAngle"

Your duty is to REPRESENT AND AMPLIFY THE CURATOR'S OWNED PERSPECTIVE—whether it is celebratory, deeply critical, skeptical, heartbroken, contrarian, or personal.
- DO NOT try to "balance" things or provide a safe middle ground.
- DO NOT hedge with "while some might argue" or "on the other hand".
- DO NOT retreat into passive third-person Wikipedia-style summaries of the book.
- The Curator is the AUTHOR and OWNER of this post; the entire poster must boldly champion their verdict.

${userExcerptText != null && userExcerptText.trim().isNotEmpty ? 'EXCERPT PASSAGE TRANSCRIPTION / NOTES:\n"$userExcerptText"' : 'Please carefully read the text in the attached book excerpt page photo(s).'}

AUDIENCE & EDITORIAL GOALS:
- Curator's Owned Stance: "$curatorAngle"
- Target Audience: "$targetAudience"
- Tone: "$tone"
- Visual Composition: $artPct% Picture Art & Infographics, $textPct% Editorial Text.

TARGET AUDIENCE TRANSLATION PROTOCOL:
- Translate the Curator's literary and intellectual reflection into the mental models, vocabulary, and stakes of "$targetAudience".
- Adapt the headline, hook, takeaways, and "Why It Matters" so someone in "$targetAudience" recognizes immediately why this reflection matters to their journey, craft, decisions, or worldview.

SPECIFIC CONTENT REQUIREMENTS:
1. Adapted Headline (Curator's Thesis): A bold, punchy headline that directly declares the Curator's stance/angle on this reading tailored for $targetAudience. It must feel like an opinion headline written BY the Curator, not a generic book title.
2. Hook: 1-2 sentence opening hook declaring the Curator's conviction ("I", "We", or a powerful editorial assertion) that grabs $targetAudience.
3. The Quintessential Passage (Pull Quote): Extract the exact 1-2 sentence quote from the reading that triggered or best anchors the Curator's angle.
4. Summary & Reflection (⚡️ STRICT 1-MINUTE READ): 1-2 punchy paragraphs (maximum 100-140 words). Written in the Curator's voice, directly exploring or critiquing the excerpt through their angle for $targetAudience. High-voltage reflection, zero rambling or academic filler.
5. Why It Matters: 2 sentences explaining why the Curator's stance is vital for $targetAudience.
6. Curator Takeaways: 3-4 bullet points representing the Curator's distinct arguments, insights, or warnings.
7. Anchor Metric: Chapter, section, or page anchor (e.g. 'Book IV, §3', 'Chapter 12', 'Page 142').
8. Poster Visual Concept: An evocative illustration prompt whose mood, color palette, and visual metaphors directly embody the emotional polarity of the Curator's angle (e.g., if cynical, stark and satirical; if serene, warm and luminous; if defiant, bold and dramatic).

Return ONLY a valid JSON object matching this schema:
{
  "original_headline": "$bookTitle: $curatorAngle",
  "publication_name": "$bookTitle • $bookAuthor",
  "adapted_headline": "Curator's bold thesis headline championing their angle for $targetAudience",
  "hook": "1-2 sentence hook declaring the Curator's perspective with conviction",
  "summary": "STRICT 1-MINUTE READ (maximum 100-140 words across 1-2 tight paragraphs). A razor-sharp, high-voltage reflection in the Curator's voice that takes 60 seconds or less to read.",
  "why_it_matters": "Why this specific curator angle matters to $targetAudience",
  "key_takeaways": [
    "Curator argument / takeaway 1",
    "Curator argument / takeaway 2",
    "Curator argument / takeaway 3"
  ],
  "pull_quote": "The exact quote from the excerpt supporting this stance",
  "receipt_highlight_quote": "The exact verbatim excerpt or sentence from the book text that best encapsulates the curator's thesis",
  "article_excerpts": [
    "First authentic verbatim passage or excerpt paragraph directly from the book text (MANDATORY: Must be genuine book text, NOT curator commentary)",
    "Second authentic verbatim passage or excerpt paragraph directly from the book text (MANDATORY: Must be genuine book text, NOT curator commentary)",
    "Optional third authentic verbatim passage or excerpt paragraph directly from the book text"
  ],
  "key_metric": "Chapter / Page / Literary Anchor",
  "category_badge": "LITERARY CURATION",
  "digital_link": "https://books.google.com/books?q=${Uri.encodeComponent('$bookTitle $bookAuthor')}",
  "suggested_style": "editorial | modernCyber | boldSocial | minimalist",
  "illustration_prompt": "Artistic visual prompt embodying the emotional polarity of the curator's angle",
  "visual_mood": "Mood description matching the curator's stance",
  "infographic_type": "metric_spotlight",
  "infographic_stats": [
    "Book Title",
    "Curator Angle",
    "Key Insight"
  ]
}
''';

    final candidateModels = await _getAvailableModels(apiKey);
    String lastError = '';

    for (final model in candidateModels) {
      try {
        debugPrint('Attempting Gemini API for book excerpt with model: $model');
        final uri = Uri.parse(
          'https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=$apiKey',
        );

        final List<Map<String, dynamic>> parts = [];

        // Attach book cover if provided
        if (bookCoverImage != null && bookCoverImage.isNotEmpty) {
          parts.add({
            "inline_data": {
              "mime_type": "image/jpeg",
              "data": base64Encode(bookCoverImage),
            }
          });
        }

        // Attach all excerpt page images (supports multiple photos!)
        for (final pageBytes in excerptPageImages) {
          if (pageBytes.isNotEmpty) {
            parts.add({
              "inline_data": {
                "mime_type": "image/jpeg",
                "data": base64Encode(pageBytes),
              }
            });
          }
        }

        // Attach text prompt
        parts.add({"text": prompt});

        final requestBody = {
          "contents": [
            {
              "parts": parts,
            }
          ],
          "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.35,
          }
        };

        final response = await _postWithRetry(
          uri,
          headers: {'Content-Type': 'application/json'},
          body: json.encode(requestBody),
          timeout: const Duration(seconds: 40),
        );

        if (response.statusCode == 200) {
          final decoded = json.decode(response.body);
          final candidates = decoded['candidates'] as List?;
          if (candidates != null && candidates.isNotEmpty) {
            final content = candidates[0]['content'];
            final candidateParts = content['parts'] as List?;
            if (candidateParts != null && candidateParts.isNotEmpty) {
              final rawText = candidateParts[0]['text'] as String?;
              if (rawText != null) {
                final cleanedJson = _cleanJsonString(rawText);
                final parsed = json.decode(cleanedJson) as Map<String, dynamic>;

                PosterStyleType style = PosterStyleType.editorial;
                final styleStr = parsed['suggested_style']?.toString().toLowerCase();
                if (styleStr == 'moderncyber' || styleStr == 'modern_cyber') {
                  style = PosterStyleType.modernCyber;
                } else if (styleStr == 'boldsocial' || styleStr == 'bold_social') {
                  style = PosterStyleType.boldSocial;
                } else if (styleStr == 'minimalist') {
                  style = PosterStyleType.minimalist;
                }

                Uint8List? illustrationBytes;
                final illustPrompt = parsed['illustration_prompt'] as String?;
                if (illustPrompt != null && illustPrompt.isNotEmpty) {
                  illustrationBytes = await generatePosterIllustration(
                    apiKey: apiKey,
                    prompt: illustPrompt,
                  );
                }

                final parsedBookExcerpts = (parsed['article_excerpts'] as List?)
                        ?.map((e) => e.toString().trim())
                        .where((e) => e.isNotEmpty)
                        .take(3)
                        .toList() ??
                    [];

                final refinedBookTake = (parsed['creator_opinion'] != null && parsed['creator_opinion'].toString().trim().isNotEmpty)
                    ? parsed['creator_opinion'].toString().trim()
                    : ((parsed['take_body'] != null && parsed['take_body'].toString().trim().isNotEmpty)
                        ? parsed['take_body'].toString().trim()
                        : (curatorAngle.isNotEmpty && curatorAngle != 'The beauty of stillness and human reflection'
                            ? 'Reading through this lens reveals how $curatorAngle. The author cuts through contemporary distraction to illuminate timeless truths that modern discourse urgently needs.'
                            : (parsed['why_it_matters'] ?? parsed['hook'] ?? 'A timeless literary reflection.')));

                return GeminiAnalysisResult(
                  originalHeadline: parsed['original_headline'] ?? '$bookTitle Excerpt',
                  publicationName: parsed['publication_name'] ?? '$bookTitle • $bookAuthor',
                  adaptedHeadline: parsed['adapted_headline'] ?? bookTitle,
                  hook: parsed['hook'] ?? 'An unforgettable literary excerpt.',
                  summary: parsed['summary'] ?? '',
                  creatorOpinion: refinedBookTake,
                  whyItMatters: parsed['whyItMatters'] ?? parsed['why_it_matters'],
                  keyTakeaways: List<String>.from(parsed['key_takeaways'] ?? []),
                  pullQuote: parsed['pull_quote'] ?? '',
                  receiptHighlightQuote: (parsed['receipt_highlight_quote'] != null && parsed['receipt_highlight_quote'].toString().trim().isNotEmpty)
                      ? parsed['receipt_highlight_quote'].toString().trim()
                      : (parsed['pull_quote']?.toString() ?? 'Literary source excerpt.'),
                  articleExcerpts: parsedBookExcerpts,
                  keyMetric: parsed['key_metric'] ?? 'Curator Pick',
                  categoryBadge: (parsed['category_badge'] ?? 'LITERARY EXCERPT').toString().toUpperCase(),
                  digitalLink: parsed['digital_link'] ?? 'https://books.google.com',
                  suggestedStyle: style,
                  illustrationPrompt: illustPrompt,
                  generatedIllustrationBytes: illustrationBytes,
                  visualArtRatio: visualArtRatio,
                  infographicType: parsed['infographic_type'] ?? 'metric_spotlight',
                  infographicStats: List<String>.from(parsed['infographic_stats'] ?? []),
                  visualMood: parsed['visual_mood'] ?? 'Literary Evocative Art',
                  isDemoMode: false,
                  rawGeminiResponse: rawText,
                );
              }
            }
          }
        } else {
          lastError = '[$model error ${response.statusCode}]: ${_extractErrorMessage(response.body)}';
        }
      } catch (e) {
        lastError = '[$model exception]: $e';
        debugPrint('Gemini book excerpt model $model exception: $e');
        if (_isNetworkError(e)) {
          debugPrint('Network offline detected, halting model loop');
          break;
        }
      }
    }

    return _generateSmartBookDemoResult(
      bookTitle: bookTitle,
      bookAuthor: bookAuthor,
      curatorAngle: curatorAngle,
      userExcerptText: userExcerptText,
      targetAudience: targetAudience,
      tone: tone,
      visualArtRatio: visualArtRatio,
      errorMessage: _formatUserFriendlyError(lastError),
    );
  }

  /// Synthesizes a high-impact 3-poster carousel for direct personal thought/opinion/feeling ("My Slant").
  /// Zero-burden: user expresses freely from Mind (🧠) or Heart (❤️), AI generates headline, hook, manifesto, and art.
  /// Synthesizes a high-impact 3-poster carousel for direct personal thought/opinion/feeling ("My Slant").
  /// Zero-burden: user expresses freely from Mind (🧠) or Heart (❤️), AI generates headline, hook, manifesto, and art.
  Future<GeminiAnalysisResult> analyzeAndSummarizeMySlant({
    required String rawThought,
    String? sparkCatalyst,
    required String slantTone, // 'mind' or 'heart'
    bool refineCoreTake = true,
    String? visualCues,
    required String targetAudience,
    required String tone,
    double visualArtRatio = 0.65,
  }) async {
    final apiKey = await _storageService.getApiKey();

    if (apiKey == null || apiKey.trim().isEmpty) {
      debugPrint('No API Key configured, using Smart Demo mode for My Slant.');
      return _generateSmartMySlantDemoResult(
        rawThought: rawThought,
        sparkCatalyst: sparkCatalyst,
        slantTone: slantTone,
        refineCoreTake: refineCoreTake,
        visualCues: visualCues,
        targetAudience: targetAudience,
        tone: tone,
        visualArtRatio: visualArtRatio,
        errorMessage: 'No Gemini API Key provided. Enter your free API key in Settings.',
      );
    }

    final String vibeName = slantTone == 'heart'
        ? 'Heart (Emotional, Humanist, Empathy, Intuitive, Deep Feeling)'
        : 'Mind (Intellectual, Systems, Critique, Logic, Conviction)';
    final String toneIcon = slantTone == 'heart' ? '❤️' : '🧠';

    final prompt = '''
You are the master ghostwriter, editorial op-ed director, and visual artist for the CURATOR of PostCard.
The Curator has shared a personal opinion or feeling directly from their $vibeName ($toneIcon).
There is NO external newspaper link or book source attached—this is the Curator's own direct expression, conviction, or reflection.

⚠️ CURATOR'S RAW PERSPECTIVE / EXPRESSION:
"$rawThought"

${sparkCatalyst != null && sparkCatalyst.trim().isNotEmpty ? '⚡ THE SPARK / CATALYST (WHAT PROVOKED OR STIRRED THIS):\n"$sparkCatalyst"\n' : ''}
${visualCues != null && visualCues.trim().isNotEmpty ? 'CURATOR\'S VISUAL CUES / METAPHORS:\n"$visualCues"\n' : ''}

🎯 YOUR MISSION (ZERO BURDEN ON THE CURATOR):
The Curator expressed directly from their $slantTone.
Your job is to elevate this raw thought into a world-class 3-Poster Carousel:
1. Synthesize **The Spark / Catalyst Anchor ("catalyst_spark")**:
   - The concise (6-14 words) real-world moment, event, or observation that ignited this thought.
   - If the curator provided a spark catalyst above, polish it into a crisp, evocative broadsheet clipping anchor.
   - If they did not provide one, infer and articulate the specific real-world observation or moment implied by the thought.
   - ⚠️ CRITICAL: "catalyst_spark" MUST BE COMPLETELY DIFFERENT from "adapted_headline". It represents the TRIGGER/CONTEXT (e.g. "Observing how AI tools replace critical thinking in schools"), NOT the conclusion.
2. Synthesize a powerful, unforgettable **Adapted Headline ("adapted_headline")** (6-10 words, bold, evocative, declares the core premise without trailing ellipses).
   - Example: If the spark is "When metrics prioritize speed over craftsmanship", the headline is "Speed Is The Enemy of Mastery".
3. Write a captivating 1-2 sentence **Hook** that draws in $targetAudience immediately.
4. ${refineCoreTake ? '''**Refine Core Conviction Take (Canary Yellow Highlighter & Slide 2 Take)**:
   - REFINE and ELEVATE the raw thought into a razor-sharp, unforgettable aphorism or editorial statement (1-2 tight sentences, total 20-35 words).
   - Make it punchy, articulate, and memorable—worthy of being highlighted in yellow ink on the front page of a broadsheet.
   - It MUST end with a definitive period (.).
''' : '''**Core Conviction Take (Verbatim)**:
   - Preserve the Curator's exact words faithfully as their core take. Ensure it forms a complete, grammatically finished statement ending with a period (.).
'''}
5. Craft an articulate, punchy **Summary & Reflection (1-minute read)** (90-130 words, 3-5 complete sentences) in the Curator's authentic first-person voice. Zero fluff.
6. Create **3 Consecutive Broadsheet Op-Ed Passages** (for Slide 3's tactile newspaper broadsheet layout):
   - Paragraph 1 (30-45 words): The real-world observation or tension that sparked this reflection. Must end with a full stop (.).
   - Paragraph 2 (25-40 words): The core conviction statement (matches or elaborates on the refined core take). Must end with a full stop (.).
   - Paragraph 3 (30-45 words): The enduring lesson, call to reflection, or forward-looking perspective. Must end with a full stop (.).
   ⚠️ CRITICAL FORMAT CONSTRAINT: Each broadsheet passage MUST be a complete, grammatically finished paragraph that fits inside the broadsheet layout without getting cut off or clipped.
7. Provide visual illustration prompts for Slide 1 and Slide 2:
   - Embody the $slantTone tone: ${slantTone == 'heart' ? 'warm humanist, impressionistic, deep textural gouache, poetic cinematic editorial portraiture/landscape' : 'metaphorical, conceptual editorial, sleek architectural surrealism, high-contrast woodcut or lithograph'}.
   - Seamlessly weave in any visual cues: "${visualCues ?? ''}".

⛔ CRITICAL VOCABULARY & EMOTIONAL IMPACT MANDATE:
- ZERO HEAVY/POMPOUS SAT JARGON: NEVER use words like "hegemony", "panopticon", "paradigm", "Kafkaesque", "dichotomy", "juxtaposition", "inexorable", "obfuscate", "surreptitious", "monolithic", "harbinger", "disenfranchised", "quagmire", "ubiquitous".
- CONVEY EMOTION THROUGH CLEAR, GUT-PUNCH LANGUAGE: Use concrete human stakes, strong active verbs (choke, crush, stall, hollow out, bankroll, shield, silence, fracture), and clear conflict.
- ACCESSIBLE YET SHARP: Do NOT write like a children's book. Write like an articulate, world-class columnist speaking with raw conviction and utmost clarity.

⛔ CRITICAL SENTENCE COMPLETION MANDATE:
- NEVER cut off any sentence mid-way.
- NEVER end any sentence or paragraph with trailing ellipses (...).
- Every single property in the JSON output MUST end with a proper terminating punctuation mark (. ! ?).

Return ONLY valid JSON with this exact structure:
{
  "catalyst_spark": "Concise 6-14 word real-world trigger or spark that ignited this reflection",
  "adapted_headline": "Bold 6-10 word headline declaring the core conviction",
  "hook": "1-2 sentence hook declaring the Curator's premise to the reader.",
  "refined_core_take": "The elevated, razor-sharp 1-2 sentence core conviction.",
  "pull_quote": "The single most unforgettable, quotable line of the entire piece.",
  "receipt_highlight_quote": "The core manifesto conviction for the broadsheet yellow highlighter.",
  "summary": "Full 1-minute read (90-130 words) in the Curator's authentic voice.",
  "why_it_matters": "2 complete sentences explaining why this perspective matters to $targetAudience.",
  "key_takeaways": [
    "Core conviction point 1.",
    "Underlying insight or reflection point 2.",
    "Perspective shift or practical takeaway point 3."
  ],
  "article_excerpts": [
    "First broadsheet passage: Complete 30-45 word observation or premise.",
    "Second broadsheet passage: Complete 25-40 word core conviction.",
    "Third broadsheet passage: Complete 30-45 word enduring reflection."
  ],
  "key_metric": "${slantTone == 'heart' ? 'Heartfelt Stance' : 'Core Thesis'}",
  "category_badge": "OPINION",
  "digital_link": "",
  "suggested_style": "editorial",
  "illustration_prompt": "Editorial poster visual prompt embodying the essence of this thought with ${slantTone == 'heart' ? 'warm humanist emotional textures' : 'metaphorical surrealist intellectual depth'}",
  "curator_illustration_prompt": "Editorial critique visual prompt for the second slide emphasizing reflection",
  "visual_mood": "${slantTone == 'heart' ? 'Emotional Humanist' : 'Intellectual Metaphor'}",
  "infographic_type": "metric_spotlight",
  "infographic_stats": [
    "My Slant",
    "${slantTone == 'heart' ? 'Heart' : 'Mind'}",
    "Personal Take"
  ]
}
''';

    final candidateModels = await _getAvailableModels(apiKey);
    String lastError = '';

    for (final model in candidateModels) {
      try {
        debugPrint('Attempting Gemini API for My Slant with model: $model');
        final uri = Uri.parse(
          'https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=$apiKey',
        );

        final requestBody = {
          "contents": [
            {
              "parts": [
                {"text": prompt}
              ],
            }
          ],
          "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.4,
          }
        };

        final response = await _postWithRetry(
          uri,
          headers: {'Content-Type': 'application/json'},
          body: json.encode(requestBody),
          timeout: const Duration(seconds: 40),
        );

        if (response.statusCode == 200) {
          final decoded = json.decode(response.body);
          final candidates = decoded['candidates'] as List?;
          if (candidates != null && candidates.isNotEmpty) {
            final content = candidates[0]['content'];
            final candidateParts = content['parts'] as List?;
            if (candidateParts != null && candidateParts.isNotEmpty) {
              final rawText = candidateParts[0]['text'] as String?;
              if (rawText != null && rawText.isNotEmpty) {
                final cleanedJson = _cleanJsonString(rawText);
                final parsed = json.decode(cleanedJson) as Map<String, dynamic>;

                PosterStyleType style = PosterStyleType.editorial;
                final styleStr = parsed['suggested_style']?.toString().toLowerCase();
                if (styleStr == 'moderncyber' || styleStr == 'modern_cyber') {
                  style = PosterStyleType.modernCyber;
                } else if (styleStr == 'boldsocial' || styleStr == 'bold_social') {
                  style = PosterStyleType.boldSocial;
                } else if (styleStr == 'minimalist') {
                  style = PosterStyleType.minimalist;
                }

                final illustPrompt = parsed['illustration_prompt'] as String?;
                Uint8List? illustrationBytes;
                if (illustPrompt != null && illustPrompt.isNotEmpty) {
                  try {
                    illustrationBytes = await generatePosterIllustration(
                      apiKey: apiKey,
                      prompt: illustPrompt,
                      styleIndex: style.index,
                    );
                  } catch (e) {
                    debugPrint('Could not generate illustration for My Slant: $e');
                  }
                }

                final rawRefinedTake = parsed['refined_core_take']?.toString();
                final rawPullQuote = parsed['pull_quote']?.toString();
                final rawReceiptHighlight = parsed['receipt_highlight_quote']?.toString();

                final String pullQuote = _ensureCompleteSentence(
                  rawPullQuote ?? (rawRefinedTake ?? rawThought),
                );
                final String receiptHighlight = _ensureCompleteSentence(
                  rawReceiptHighlight ?? pullQuote,
                );
                final String coreOpinion = _ensureCompleteSentence(
                  refineCoreTake
                      ? (rawRefinedTake ?? pullQuote)
                      : rawThought,
                );

                final excerptsList = (parsed['article_excerpts'] as List?)
                        ?.map((e) => _ensureCompleteSentence(e.toString()))
                        .where((e) => e.isNotEmpty)
                        .take(3)
                        .toList() ??
                    [];

                final excerpts = excerptsList.length >= 3
                    ? excerptsList
                    : [
                        _ensureCompleteSentence('The initial observation that sparked this perspective: $rawThought'),
                        receiptHighlight,
                        _ensureCompleteSentence(slantTone == 'heart'
                            ? 'An enduring personal conviction preserved as a reminder of what remains true when everything else shifts.'
                            : 'A rigorous intellectual foundation that stands independent of fleeting trends and external consensus.'),
                      ];

                final rawCatalyst = parsed['catalyst_spark']?.toString();
                final catalystSpark = (rawCatalyst != null && rawCatalyst.trim().isNotEmpty)
                    ? _ensureCleanHeadline(rawCatalyst)
                    : (sparkCatalyst != null && sparkCatalyst.trim().isNotEmpty
                        ? _ensureCleanHeadline(sparkCatalyst)
                        : (slantTone == 'heart'
                            ? 'A quiet moment of lived reflection'
                            : 'Observing the pace of modern consensus'));
                final adaptedHeadline = _ensureCleanHeadline(parsed['adapted_headline'] ?? 'My Slant');

                return GeminiAnalysisResult(
                  originalHeadline: catalystSpark,
                  publicationName: "My Slant",
                  adaptedHeadline: adaptedHeadline,
                  hook: _ensureCompleteSentence(parsed['hook'] ?? rawThought),
                  summary: _ensureCompleteSentence(parsed['summary'] ?? rawThought),
                  whyItMatters: parsed['why_it_matters'] != null ? _ensureCompleteSentence(parsed['why_it_matters']) : null,
                  keyTakeaways: (parsed['key_takeaways'] as List?)
                          ?.map((e) => _ensureCompleteSentence(e.toString()))
                          .where((e) => e.isNotEmpty)
                          .toList() ??
                      [],
                  pullQuote: pullQuote,
                  receiptHighlightQuote: receiptHighlight,
                  articleExcerpts: excerpts,
                  keyMetric: parsed['key_metric'] ?? (slantTone == 'heart' ? 'Heartfelt Stance' : 'Core Thesis'),
                  categoryBadge: 'OPINION',
                  digitalLink: '',
                  creatorOpinion: coreOpinion,
                  suggestedStyle: style,
                  illustrationPrompt: illustPrompt,
                  curatorIllustrationPrompt: parsed['curator_illustration_prompt'],
                  generatedIllustrationBytes: illustrationBytes,
                  visualArtRatio: visualArtRatio,
                  infographicType: parsed['infographic_type'] ?? 'metric_spotlight',
                  infographicStats: List<String>.from(parsed['infographic_stats'] ?? ['My Slant', slantTone == 'heart' ? 'Heart' : 'Mind', 'Personal Take']),
                  visualMood: parsed['visual_mood'] ?? (slantTone == 'heart' ? 'Emotional Humanist' : 'Intellectual Metaphor'),
                  slantTone: slantTone,
                  slantIcon: toneIcon,
                  isDemoMode: false,
                  rawGeminiResponse: rawText,
                );
              }
            }
          }
        } else {
          lastError = '[$model error ${response.statusCode}]: ${_extractErrorMessage(response.body)}';
        }
      } catch (e) {
        lastError = '[$model exception]: $e';
        debugPrint('Gemini My Slant model $model exception: $e');
        if (_isNetworkError(e)) {
          debugPrint('Network offline detected, halting model loop');
          break;
        }
      }
    }

    return _generateSmartMySlantDemoResult(
      rawThought: rawThought,
      sparkCatalyst: sparkCatalyst,
      slantTone: slantTone,
      refineCoreTake: refineCoreTake,
      visualCues: visualCues,
      targetAudience: targetAudience,
      tone: tone,
      visualArtRatio: visualArtRatio,
      errorMessage: _formatUserFriendlyError(lastError),
    );
  }

  static String _extractDomainFromUrl(String rawUrl) {
    try {
      final uri = Uri.parse(rawUrl);
      var host = uri.host.toLowerCase();
      if (host.startsWith('www.')) host = host.substring(4);
      return host.isNotEmpty ? host : 'Web Article';
    } catch (_) {
      return 'Web Article';
    }
  }



  /// Generates visual AI illustration using native Google Gemini Image models with face conditioning
  Future<Uint8List?> generatePosterIllustration({
    String? apiKey,
    required String prompt,
    int seed = 0,
    int styleIndex = 0,
    Uint8List? referenceImageBytes,
    bool matchRealPersonLikeness = false,
  }) async {
    final cleanPrompt = prompt.trim();
    if (cleanPrompt.isEmpty) return null;

    final effectiveApiKey = (apiKey != null && apiKey.trim().isNotEmpty)
        ? apiKey.trim()
        : await _storageService.getApiKey();

    final stylePrefixes = [
      "Modern cinematic editorial artwork illustration, 4:5 vertical poster format, volumetric rim lighting, high aesthetic, vivid color grading, bold visual metaphor, no text, no letters",
      "Bold pop-graphic vector art, 4:5 vertical poster format, high dynamic contrast, striking visual metaphor, ultra-clean silhouettes, vibrant palette, no text, no letters",
      "Surrealist editorial oil painting masterpiece, 4:5 vertical poster format, richly textured canvas, dramatic chiaroscuro lighting, powerful symbolic centerpiece, no text, no letters",
      "Neo-cyber geometric editorial illustration, 4:5 vertical poster format, futuristic depth, glowing isometric contours, deep dark background with neon accents, no text, no letters",
      "Bauhaus modernist conceptual graphic art, 4:5 vertical poster format, asymmetrical balance, bold geometric shapes, expressive color blocking, no text, no letters",
      "Expressive textured impasto palette-knife painting, 4:5 vertical poster format, rich oil impasto, museum gallery masterpiece, no text, no letters",
      "Dramatic cinematic documentary photography, 4:5 vertical poster format, evocative storytelling composition, atmospheric natural lighting, award-winning visual journalism, no text, no letters",
      "Handcrafted risograph screenprint poster, 4:5 vertical poster format, tactile halftone textures, iconic conceptual visual, no text, no letters",
    ];
    final selectedStylePrefix = stylePrefixes[styleIndex % stylePrefixes.length];
    final effectiveSeed = (seed != 0 ? seed.abs() : (DateTime.now().millisecondsSinceEpoch + styleIndex * 7919).abs()) % 1000000;

    // --- Primary: Native Google Gemini Image Generation Models ---
    if (effectiveApiKey != null && effectiveApiKey.isNotEmpty) {
      final googleImageModels = [
        'gemini-2.5-flash-image',
        'gemini-3.1-flash-image',
        'gemini-3-pro-image',
      ];

      for (final modelName in googleImageModels) {
        try {
          debugPrint('🎨 [Gemini Image API] Generating artwork with $modelName (likeness: $matchRealPersonLikeness)...');
          final geminiUri = Uri.parse(
            'https://generativelanguage.googleapis.com/v1beta/models/$modelName:generateContent?key=$effectiveApiKey',
          );

          final List<Map<String, dynamic>> parts = [];
          if (matchRealPersonLikeness && referenceImageBytes != null && referenceImageBytes.isNotEmpty) {
            parts.add({
              "inlineData": {
                "mimeType": "image/jpeg",
                "data": base64Encode(referenceImageBytes),
              }
            });
            parts.add({
              "text": "PORTRAIT LOOKALIKE & MYSTERY DIRECTIVE: The attached image is a reference photograph. "
                  "Create an artistic stylized editorial illustration that echoes their recognizable likeness and facial characteristics, "
                  "blended with dramatic chiaroscuro noir shadow, painterly texture, and atmospheric mystery (looks like the person, but an artistic creation, not a flat photographic copy).\n\n"
                  "EDITORIAL POSTER ARTWORK:\n"
                  "$selectedStylePrefix. $cleanPrompt.\n\n"
                  "CRITICAL CONSTRAINT: Masterpiece vertical 4:5 editorial artwork poster, dramatic chiaroscuro, rich textural depth, "
                  "strictly no typography, no letters, no words anywhere in the image.",
            });
          } else {
            parts.add({
              "text": "EDITORIAL POSTER ARTWORK:\n"
                  "$selectedStylePrefix. $cleanPrompt.\n\n"
                  "CRITICAL CONSTRAINT: Masterpiece vertical 4:5 editorial artwork poster, dramatic chiaroscuro lighting, rich textural depth, "
                  "strictly no typography, no letters, no words anywhere in the image.",
            });
          }

          final response = await http
              .post(
                geminiUri,
                headers: {'Content-Type': 'application/json'},
                body: json.encode({
                  "contents": [
                    {"parts": parts}
                  ]
                }),
              )
              .timeout(const Duration(seconds: 30));

          if (response.statusCode == 200) {
            final data = json.decode(response.body);
            final candidates = data['candidates'] as List?;
            if (candidates != null && candidates.isNotEmpty) {
              final resParts = candidates[0]['content']?['parts'] as List?;
              if (resParts != null) {
                for (final p in resParts) {
                  if (p is Map && p.containsKey('inlineData')) {
                    final b64 = p['inlineData']?['data'] as String?;
                    if (b64 != null && b64.isNotEmpty) {
                      debugPrint('✅ [Gemini Image API] Successfully generated illustration via $modelName (${b64.length} chars)!');
                      return base64Decode(b64);
                    }
                  }
                }
              }
            }
          } else {
            debugPrint('Gemini Image API ($modelName) returned ${response.statusCode}: ${response.body}');
          }
        } catch (e) {
          debugPrint('Gemini Image API ($modelName) exception: $e');
        }
      }
    }

    // --- Fallback: Pollinations AI (FLUX) for offline / network resilience ---
    try {
      debugPrint('🎨 [Fallback] Generating artwork via Pollinations FLUX (seed: $effectiveSeed)...');
      final sanitizedArtPrompt = cleanPrompt
          .replaceAll(RegExp(r'#\d+\s*\[[^\]]+\]:?'), '')
          .replaceAll('•', ',')
          .replaceAll(RegExp(r'\s+'), ' ')
          .trim();
      final artKeywords = sanitizedArtPrompt.length > 350
          ? sanitizedArtPrompt.substring(0, 350)
          : sanitizedArtPrompt;

      final fullPrompt = '$selectedStylePrefix. $artKeywords';
      final encodedPrompt = Uri.encodeComponent(fullPrompt);

      final pollUri = Uri.parse(
        'https://image.pollinations.ai/prompt/$encodedPrompt?width=720&height=900&nologo=true&seed=$effectiveSeed&model=flux',
      );

      final pollResponse = await http.get(pollUri).timeout(const Duration(seconds: 15));
      if (pollResponse.statusCode == 200 && pollResponse.bodyBytes.length > 5000) {
        debugPrint('✅ [Fallback] Successfully generated illustration via Pollinations FLUX (${pollResponse.bodyBytes.length} bytes)!');
        return pollResponse.bodyBytes;
      }
    } catch (e) {
      debugPrint('Pollinations AI fallback exception: $e');
    }

    return null;
  }

  /// Specifically re-generates only the Hook Poster Artwork (Slide 1 Visual)
  /// considering the Curate Angle, Hook Cues, and Headline with non-repeating artistic metaphors.
  Future<Map<String, dynamic>> regenerateHookPosterArt({
    String? apiKey,
    required String headline,
    String? userContext,
    String? hookCues,
    required String targetAudience,
    required String tone,
    int iteration = 0,
    PosterStyleType? currentStyle,
    Uint8List? referenceImageBytes,
    bool matchRealPersonLikeness = false,
  }) async {
    final effectiveApiKey = (apiKey != null && apiKey.trim().isNotEmpty)
        ? apiKey.trim()
        : await _storageService.getApiKey();

    final cueClean = (hookCues != null && hookCues.trim().isNotEmpty) ? _cleanCuesForImagePrompt(hookCues) : null;
    final context = (userContext != null && userContext.trim().isNotEmpty) ? userContext.trim() : null;
    final parts = <String>[
      ?cueClean,
      if (context != null) 'Curator angle and theme: $context',
      'Story context: $headline',
    ];
    final subject = parts.join('. ');

    // 8 radically distinct creative directions so re-rolling is highly dynamic and never repetitive
    final distinctMetaphors = [
      'Cinematic 35mm wide-angle visual concept: $subject. Volumetric golden hour side-lighting, deep shadow contrast, award-winning visual journalism, atmospheric editorial fine art',
      'Surrealist conceptual dreamscape: $subject. Symbolic architectural fragments suspended in space, painterly canvas textures, René Magritte and Salvador Dalí editorial fine art',
      'Striking minimalist pop-graphic art: $subject. Bold geometric silhouettes, high-contrast duotone palette, iconic graphic emblem, modern editorial graphic design',
      'Futuristic isometric perspective: $subject. Deep dark obsidian textures, luminous neon accents, translucent holographic data layers, architectural precision',
      'Bauhaus modernist editorial composition: $subject. Asymmetrical graphic balance, rich matte color blocking, diagonal tension lines, avant-garde poster aesthetic',
      'Textured impasto palette-knife oil painting: $subject. Rich buttery brushstrokes, dramatic chiaroscuro highlights, visceral emotional depth, contemporary museum gallery artwork',
      'Evocative atmospheric visual journalism: $subject. Deep depth of field, dramatic moody haze, single beam of light piercing through darkness, powerful storytelling frame',
      'Handcrafted risograph print: $subject. Subtle tactile grain, overlaid analog color separations, classic newspaper editorial woodcut lithography, evocative timeless art',
    ];

    // Guarantee that consecutive re-rolls never repeat the same metaphor
    final styleIndex = (iteration + Random().nextInt(100)) % distinctMetaphors.length;
    final selectedMetaphor = distinctMetaphors[styleIndex];
    final seed = (DateTime.now().millisecondsSinceEpoch + iteration * 9743 + Random().nextInt(9999)).abs() % 1000000;

    // Cycle through vibrant poster styles so the accent color and typography shift too
    final availableStyles = [
      PosterStyleType.editorial,
      PosterStyleType.modernCyber,
      PosterStyleType.boldSocial,
      PosterStyleType.aiInfographic,
    ];
    final nextStyle = availableStyles[(iteration + 1) % availableStyles.length];

    final bytes = await generatePosterIllustration(
      apiKey: effectiveApiKey,
      prompt: selectedMetaphor,
      seed: seed,
      styleIndex: styleIndex,
      referenceImageBytes: referenceImageBytes,
      matchRealPersonLikeness: matchRealPersonLikeness,
    );

    return {
      'bytes': bytes,
      'prompt': selectedMetaphor,
      'suggestedStyle': nextStyle,
      'seed': seed,
    };
  }

  String _extractErrorMessage(String responseBody) {
    try {
      final parsed = json.decode(responseBody);
      if (parsed['error'] != null) {
        if (parsed['error']['message'] != null) {
          return parsed['error']['message'].toString();
        }
        return parsed['error'].toString();
      }
    } catch (_) {}
    return responseBody.length > 200 ? responseBody.substring(0, 200) : responseBody;
  }

  String _cleanJsonString(String raw) {
    var text = raw.trim();
    if (text.startsWith('```json')) {
      text = text.substring(7);
    } else if (text.startsWith('```')) {
      text = text.substring(3);
    }
    if (text.endsWith('```')) {
      text = text.substring(0, text.length - 3);
    }
    text = text.trim();
    final firstBrace = text.indexOf('{');
    final lastBrace = text.lastIndexOf('}');
    if (firstBrace != -1 && lastBrace != -1 && lastBrace > firstBrace) {
      return text.substring(firstBrace, lastBrace + 1);
    }
    return text;
  }

  Future<GeminiAnalysisResult> _generateSmartDemoResult({
    required String targetAudience,
    required String tone,
    String? userContext,
    String? hookCues,
    String? fallbackTitle,
    String? fallbackBody,
    double visualArtRatio = 0.6,
    PostCardItem? existingItem,
    int regenerationIteration = 0,
    bool skipImageGeneration = false,
    String? errorMessage,
  }) async {
    final title = fallbackTitle ?? 'Physical Newspaper Discovery';
    final hasContext = userContext != null && userContext.trim().isNotEmpty;
    final int variant = (regenerationIteration > 0)
        ? (regenerationIteration % 3)
        : (existingItem != null ? 1 : 0);

    final styleCycle = [
      PosterStyleType.editorial,
      PosterStyleType.modernCyber,
      PosterStyleType.boldSocial,
      PosterStyleType.aiInfographic,
    ];
    final PosterStyleType style = styleCycle[(regenerationIteration + (targetAudience.contains('Tech') ? 1 : (targetAudience.contains('Gen-Z') ? 2 : 0))) % styleCycle.length];

    String adaptedHeadline;
    String hook;
    String summary;
    String whyItMatters;
    List<String> takeaways;
    String pullQuote;
    String metric;
    String category = 'ANALYSIS';

    if (targetAudience.contains('Tech')) {
      category = 'DEEP TECH';
      if (variant == 1) {
        adaptedHeadline = hasContext ? '$userContext: Systems & Latency Reality in $title' : 'Systems & Infrastructure Reality: $title';
        hook = hasContext
            ? 'Look past the surface announcement: the real engineering friction point is $userContext.'
            : 'Underneath the press release lies an urgent systems recalculation and infrastructure shift.';
        summary = hasContext
            ? 'My technical verdict on this development: $userContext.\n\nWhile mainstream reports focus on high-level headlines, systems architects must look beneath the surface. The underlying infrastructure trade-offs and scaling paradigms are what truly dictate long-term advantage.'
            : 'Physical news analysis shows a structural shift underway. The fundamental mechanisms point to rapid transition cycles that demand technical agility and proactive infrastructure planning.\n\nEngineering teams and systems architects should note how underlying constraints are dissolving in favor of scalable paradigms.';
        whyItMatters = 'Directly impacts distributed latency, compute budgets, and failover redundancy schedules.';
        takeaways = [
          if (hasContext) 'Curator\'s engineering stance: $userContext',
          'Decoupling monolithic dependencies is the primary hedge against architectural lock-in',
          'Benchmark metrics confirm throughput bottlenecks shifting toward edge compute',
          'First-mover advantage belongs to teams testing modular integration today',
        ];
        pullQuote = hasContext
            ? 'Decoupling early is the only hedge against architectural lock-in: $userContext.'
            : 'When scaling limits collide with legacy pipelines, modular design wins.';
        metric = '99.9% Uptime';
      } else if (variant == 2) {
        adaptedHeadline = hasContext ? '$userContext: The Contrarian Engineering Angle on $title' : 'The Contrarian Tech Playbook: $title';
        hook = hasContext
            ? 'Here is the hard trade-off industry consensus is avoiding: $userContext.'
            : 'Why orthodox engineering teams will struggle with this shift while agile builders scale.';
        summary = hasContext
            ? 'My contrarian technical thesis: $userContext.\n\nDo not optimize the old bottleneck when the entire paradigm shifted. The teams that win this next cycle will rethink their baseline architectural assumptions from first principles.'
            : 'Print reporting captures an unmistakable architectural inflection. Incremental refactoring of legacy stacks is no longer sufficient when external constraints have completely dissolved.\n\nEngineering leaders should stress-test data schemas and pipeline throughput immediately.';
        whyItMatters = 'Separates scalable high-throughput platforms from technical-debt heavy incumbents.';
        takeaways = [
          if (hasContext) 'Curator\'s contrarian view: $userContext',
          'The fastest compute is the computation you design away with modern paradigms',
          'Legacy API boundaries are dissolving in favor of real-time stream orchestration',
          'Immediate architectural audit recommended before next deployment cycle',
        ];
        pullQuote = hasContext
            ? 'Do not optimize the old bottleneck when the entire paradigm shifted: $userContext.'
            : 'The fastest compute is the computation you design away.';
        metric = '<5ms Latency';
      } else {
        adaptedHeadline = hasContext ? '$userContext: Technical Reality Behind $title' : 'Architecture Breakdown: $title';
        hook = hasContext
            ? 'Beyond the press release: the real architecture shift is $userContext.'
            : 'The technical breakthroughs and systems implications driving this headline.';
        summary = hasContext
            ? 'My technical verdict on this development: $userContext.\n\nWhile mainstream reports focus on high-level headlines, systems architects must look beneath the surface. The underlying infrastructure trade-offs and scaling paradigms are what truly dictate long-term advantage.'
            : 'Physical news analysis shows a structural shift underway. The fundamental mechanisms point to rapid transition cycles that demand technical agility and proactive infrastructure planning.\n\nEngineering teams and systems architects should note how underlying constraints are dissolving in favor of scalable paradigms.';
        whyItMatters = 'Directly impacts systems scaling, security protocols, and next-generation architecture deployment schedules.';
        takeaways = [
          if (hasContext) 'Curator\'s stance: $userContext',
          'Underlying infrastructure bottlenecks are clearing faster than projections',
          'Direct architecture impact across computing, networks, and data integrity',
          'Strategic adoption window open for teams building next-generation tooling',
        ];
        pullQuote = hasContext
            ? 'The real takeaway is not the headline, but the structural shift: $userContext.'
            : 'The technical frontier moves forward when physical constraints yield to engineered precision.';
        metric = '10x Scale';
      }
    } else if (targetAudience.contains('Gen-Z') || targetAudience.contains('Social')) {
      category = 'TRENDING';
      if (variant == 1) {
        adaptedHeadline = hasContext ? '$userContext: Behind the Scenes of $title' : 'The Unfiltered Backstory of $title You Missed';
        hook = hasContext
            ? 'Stop scrolling the PR soundbites. Here is what actually matters: $userContext.'
            : 'The headlines are loud, but this specific detail is what actually changes everything.';
        summary = hasContext
            ? 'My unfiltered breakdown: $userContext.\n\nEveryone is talking about the surface story, but the real ripple effect is how it fundamentally changes our habits, feeds, and culture. No sugarcoating or corporate spin.'
            : 'Spotted in physical print today: an absolute game-changer. Instead of doomscrolling endless commentary, here is the raw tea that matters.\n\nThe old playbook is officially out of style. The ripple effects are already hitting social culture and daily habits.';
        whyItMatters = 'Because this is already quietly reshaping creator feeds and IRL conversations this week.';
        takeaways = [
          if (hasContext) 'Curator\'s angle: $userContext',
          'The morning print brought major receipts while timelines were still speculating',
          'Cultural momentum is shifting faster than corporate marketing teams realize',
          'Why this changes the vibe for the coming season',
        ];
        pullQuote = hasContext ? 'The vibe check everyone needed: $userContext.' : 'Culture shifts in physical reality first while online feeds play catch up.';
        metric = 'Viral Peak';
      } else if (variant == 2) {
        adaptedHeadline = hasContext ? '$userContext: The Honest Breakdown of $title' : 'Look Past the Headline: The True Shift in $title';
        hook = hasContext
            ? 'No corporate spin, no sugarcoating: $userContext.'
            : 'Why this morning story is quietly rewriting tomorrow\'s conversations.';
        summary = hasContext
            ? 'My direct take: $userContext.\n\nLook past the clickbait. The actual shift here is wild, and the downstream cultural impact is already happening in real-time.'
            : 'A headline you definitely did not see coming. The deeper context reveals an entirely new playbook for how culture and media interact.\n\nKeep your eyes on the downstream ripple effects over the next 48 hours.';
        whyItMatters = 'Because algorithmic feeds will be dissecting this exact angle by the weekend.';
        takeaways = [
          if (hasContext) 'The raw tea: $userContext',
          'Print journalism delivered the definitive proof before social media discovered it',
          'Real community signals outlasting fleeting 24-hour hype cycles',
          'What smart creators are bookmarking right now',
        ];
        pullQuote = hasContext ? 'Saying what everyone else was thinking: $userContext.' : 'Print receipts hit different when the proof is undeniably real.';
        metric = '100% Raw Tea';
      } else {
        adaptedHeadline = hasContext ? '$userContext: The Real Take on $title' : 'Why Everyone Is Talking About: $title';
        hook = hasContext
            ? 'Here is the unfiltered truth they left out of the headline: $userContext.'
            : 'Here is the unhinged TL;DR of what the morning papers just dropped.';
        summary = hasContext
            ? 'My honest take on this: $userContext.\n\nEveryone is talking about the surface story, but the real ripple effect is how it fundamentally changes our habits, feeds, and culture. No sugarcoating or corporate spin.'
            : 'Spotted in physical print today: an absolute game-changer. Instead of doomscrolling endless commentary, here is the raw tea that matters.\n\nThe old playbook is officially out of style. The ripple effects are already hitting social culture and daily habits.';
        whyItMatters = 'Because this is moving from offline newspapers directly into everyone\'s feed this week.';
        takeaways = [
          if (hasContext) 'Curator\'s take: $userContext',
          'The morning paper actually brought major receipts today',
          'Culture shifts are happening IRL while timelines are still catching up',
          'Why this changes the vibe for the coming season',
        ];
        pullQuote = hasContext ? 'My verdict: $userContext' : 'Spotted in morning print before it even trended on your feed.';
        metric = '+88% Hype';
      }
    } else if (targetAudience.contains('Exec') || targetAudience.contains('Business')) {
      category = 'EXECUTIVE BRIEF';
      if (variant == 1) {
        adaptedHeadline = hasContext ? '$userContext: Capital Allocation & Moat Strategy on $title' : 'Capital Allocation Under $title: The Competitive Moat';
        hook = hasContext
            ? 'The market is pricing the wrong risks—the true operational leverage is $userContext.'
            : 'Why first-mover capital deployment will outpace traditional 5-year forecasts.';
        summary = hasContext
            ? 'Strategic investment thesis: $userContext.\n\nLeadership teams that act before quarterly repricing will secure lasting margins and market power while cautious incumbents wait for full consensus.'
            : 'Physical press coverage reveals critical macro headwinds and capital reallocation opportunities. Leadership teams should stress-test operating assumptions against these evolving signals.\n\nThe competitive moat belongs to organizations that convert early print intelligence into proactive execution before mainstream market repricing.';
        whyItMatters = 'Dictates enterprise margin expansion, asset allocation, and competitive positioning across the next 3 quarters.';
        takeaways = [
          if (hasContext) 'Executive conviction: $userContext',
          'Market pricing lag creates asymmetric entry leverage for proactive capital deployment',
          'Legacy cost structures face structural margin compression if unaddressed',
          'Clear strategic mandate for swift capital reallocation',
        ];
        pullQuote = hasContext ? 'Moats are defended before consensus crystallizes: $userContext.' : 'Margin expansion favors organizations that price structural change early.';
        metric = '\$4.2B Capital';
      } else if (variant == 2) {
        adaptedHeadline = hasContext ? 'Executive Risk Assessment: $userContext' : 'Macro Headwinds & Tactical Upside: $title';
        hook = hasContext
            ? 'Direct bottom-line imperative: $userContext.'
            : 'Identifying asymmetric upside while competitors navigate bureaucratic delay.';
        summary = hasContext
            ? 'Executive risk appraisal: $userContext.\n\nExecution speed beats passive risk models. The leadership teams that reconfigure operations today will capture the lion\'s share of the reallocated market.'
            : 'Strategic intelligence from physical press indicates structural market recalibration. Board-level decisions should prioritize operational agility over rigid multi-year forecasting.\n\nOrganizations converting early print intelligence into decisive action establish defensible moats before broader market comprehension.';
        whyItMatters = 'Directly impacts executive risk posture, board-level capital decisions, and operating margins.';
        takeaways = [
          if (hasContext) 'Boardroom imperative: $userContext',
          'Execution agility consistently outperforms defensive bureaucracy during transition cycles',
          'Strategic decoupling of legacy overhead accelerates EBITDA growth',
          'Proactive leadership stance verified by primary sector data',
        ];
        pullQuote = hasContext ? 'Execution speed beats passive risk models: $userContext.' : 'Agility in capital reallocation separates industry leaders from legacy incumbents.';
        metric = '3.4x Multiple';
      } else {
        adaptedHeadline = hasContext ? 'Strategic Thesis: $userContext' : 'Strategic Briefing: Capitalizing on $title';
        hook = hasContext
            ? 'Executive judgment: $userContext.'
            : 'Key market dynamics, cost implications, and high-yield strategic moves.';
        summary = hasContext
            ? 'Strategic verdict on this briefing: $userContext.\n\nLeadership teams should not treat this as background noise. The competitive moat belongs to organizations that act decisively on this specific angle before mainstream market consensus.'
            : 'Physical press coverage reveals critical macro headwinds and capital reallocation opportunities. Leadership teams should stress-test operating assumptions against these evolving signals.\n\nThe competitive moat belongs to organizations that convert early print intelligence into proactive execution before mainstream market repricing.';
        whyItMatters = 'Determines quarterly capital allocation, risk mitigation, and competitive positioning across sector leaders.';
        takeaways = [
          if (hasContext) 'Strategic imperative: $userContext',
          'Macro market realignment opening capital efficiency opportunities',
          'Operational agility prioritized over rigid traditional forecasts',
          'Clear first-mover advantage for proactive risk mitigation',
        ];
        pullQuote = hasContext ? 'The bottom-line conviction: $userContext.' : 'We did not lose productivity; we eliminated bureaucratic overhead.';
        metric = '+18.4% ROI';
      }
    } else {
      category = targetAudience.length <= 16 ? targetAudience.toUpperCase() : 'CURATION';
      if (variant == 1) {
        adaptedHeadline = hasContext ? '$userContext: Unexamined Facet for $targetAudience' : '$targetAudience Deep Dive: $title';
        hook = hasContext
            ? 'A fresh lens on this headline for $targetAudience: $userContext.'
            : 'An essential, distilled reading curated specifically for $targetAudience.';
        summary = hasContext
            ? 'My updated perspective for $targetAudience: $userContext.\n\nSurface-level coverage misses the core implications that directly touch our field. This development requires clear-eyed evaluation and proactive positioning rather than passive observation.'
            : 'A critical development with deep resonance for $targetAudience.\n\nTaking time to unpack these developments offers depth and strategic perspective that outlasts fleeting 24-hour news cycles.';
        whyItMatters = hasContext
            ? 'Directly impacts how $targetAudience navigates strategic decisions and responds to emerging shifts.'
            : 'Essential context and strategic grounding for $targetAudience.';
        takeaways = [
          if (hasContext) 'Curator\'s conviction: $userContext',
          'Direct relevance and strategic implications for $targetAudience',
          'Key structural signals spotlighted in the underlying coverage',
          'Proactive vantage point beyond mainstream commentary',
        ];
        pullQuote = hasContext ? 'Curator\'s perspective: "$userContext"' : 'Deep reading reveals the signal that fleeting feeds miss.';
        metric = 'High Signal';
      } else if (variant == 2) {
        adaptedHeadline = hasContext ? 'The Broader Picture on $title: $userContext' : '$targetAudience Thesis: Rethinking $title';
        hook = hasContext
            ? 'Examining the foundation behind the headline: $userContext.'
            : 'Moving beyond reactionary soundbites to explore the real substance.';
        summary = hasContext
            ? 'My focused analysis: $userContext.\n\nWhen we look past sensationalism, the lasting value becomes strikingly evident. Curating this angle brings clarity to our ongoing conversations.'
            : 'Taking a step back to examine the wider implications. Meaningful discernment begins by identifying the core structural changes before they become mainstream consensus.\n\nA foundational story curated for lasting perspective.';
        whyItMatters = 'Provides durable strategic context that outlives short-term news cycles.';
        takeaways = [
          if (hasContext) 'Core insight: $userContext',
          'Foundational signals that remain relevant long after the headlines fade',
          'Actionable perspective curated specifically for $targetAudience',
          'Clear vantage point connecting physical print reporting to digital impact',
        ];
        pullQuote = hasContext ? 'The lasting takeaway: "$userContext"' : 'Discernment begins when you step back from the reactionary feed.';
        metric = 'Top Thesis';
      } else {
        adaptedHeadline = hasContext ? '$userContext: Angle for $targetAudience' : '$targetAudience Briefing: $title';
        hook = hasContext
            ? 'An unfiltered perspective for $targetAudience: $userContext.'
            : 'An essential, distilled reading curated specifically for $targetAudience.';
        summary = hasContext
            ? 'My direct perspective for $targetAudience: $userContext.\n\nSurface-level coverage misses the core implications that directly touch our field. This development requires clear-eyed evaluation and proactive positioning rather than passive observation.'
            : 'A critical development with deep resonance for $targetAudience.\n\nTaking time to unpack these developments offers depth and strategic perspective that outlasts fleeting 24-hour news cycles.';
        whyItMatters = hasContext
            ? 'Directly impacts how $targetAudience navigates strategic decisions and responds to emerging shifts.'
            : 'Essential context and strategic grounding for $targetAudience.';
        takeaways = [
          if (hasContext) 'Curator\'s conviction: $userContext',
          'Direct relevance and strategic implications for $targetAudience',
          'Key structural signals spotlighted in the underlying coverage',
          'Proactive vantage point beyond mainstream commentary',
        ];
        pullQuote = hasContext ? 'Curator\'s verdict: "$userContext"' : 'Clarity begins when you filter the signal from the noise.';
        metric = 'Top Signal';
      }
    }

    List<String> demoExcerpts = [];
    if (fallbackBody != null && fallbackBody.trim().isNotEmpty) {
      final allParas = fallbackBody
          .split(RegExp(r'\n\s*\n'))
          .map((p) => p.trim())
          .where((p) => p.length > 25)
          .toList();
      if (allParas.length >= 2) {
        final skipCount = variant % (allParas.length > 2 ? 2 : 1);
        demoExcerpts = allParas.skip(skipCount).take(3).toList();
      } else {
        demoExcerpts = allParas;
      }
    }
    if (demoExcerpts.length < 2) {
      final sampleExcerpts = [
        [
          'Initial reporting confirmed that primary field observations diverged significantly from earlier seasonal projections, establishing an unprecedented baseline across monitored channels.',
          'Official representatives and industry observers noted that operational realignments initiated during the previous cycle produced measurable structural adaptations.',
        ],
        [
          'Field documentation revealed sustained divergence across primary operational indices, challenging earlier institutional consensus.',
          'Subsequent forensic reviews verified that frontline adjustments created tangible advantages across core operations.',
        ],
        [
          'Archived records corroborated the unprecedented shift across monitored sectors, underscoring the durability of the reported indicators.',
          'Independent observers emphasized that strategic realignments established early resilience ahead of broader market repricing.',
        ],
      ];
      demoExcerpts = sampleExcerpts[variant % sampleExcerpts.length];
    }

    // Generate AI illustration for Slide 1 based on curated cues & angle, with fresh seed and style per iteration
    final illPrompt = (hookCues != null && hookCues.trim().isNotEmpty)
        ? hookCues.trim()
        : (hasContext ? userContext : adaptedHeadline);

    Uint8List? demoIllustrationBytes;
    if (!skipImageGeneration) {
      try {
        demoIllustrationBytes = await generatePosterIllustration(
          apiKey: '',
          prompt: '$illPrompt, artistic modern editorial illustration, dramatic lighting',
          seed: (regenerationIteration > 0 || existingItem != null) ? (DateTime.now().millisecondsSinceEpoch + regenerationIteration * 7919) : 0,
          styleIndex: regenerationIteration,
        );
      } catch (e) {
        debugPrint('Demo illustration generation failed: $e');
      }
    }

    return GeminiAnalysisResult(
      originalHeadline: title,
      publicationName: 'The Morning Press Gazette',
      adaptedHeadline: adaptedHeadline,
      hook: hook,
      summary: summary,
      creatorOpinion: hasContext
          ? 'While conventional reporting fixates on the headline announcements, ${userContext.trim()}. This development exposes a structural recalibration that $targetAudience cannot afford to ignore.'
          : (whyItMatters.isNotEmpty ? '$hook $whyItMatters' : summary),
      whyItMatters: whyItMatters,
      keyTakeaways: takeaways,
      pullQuote: pullQuote,
      receiptHighlightQuote: pullQuote,
      articleExcerpts: demoExcerpts,
      keyMetric: metric,
      categoryBadge: category,
      digitalLink: 'https://news.google.com/search?q=${Uri.encodeComponent(title)}',
      suggestedStyle: style,
      illustrationPrompt: '$illPrompt, artistic modern editorial illustration, dramatic lighting',
      generatedIllustrationBytes: demoIllustrationBytes,
      visualArtRatio: visualArtRatio,
      infographicType: 'metric_spotlight',
      infographicStats: [metric, 'Verified Print', category],
      visualMood: style == PosterStyleType.modernCyber
          ? 'Cyberpunk Neon Vector Art'
          : style == PosterStyleType.boldSocial
              ? 'Vibrant Pop Graphic'
              : 'Vintage Editorial Lithograph',
      isDemoMode: true,
      errorMessage: errorMessage,
    );
  }

  GeminiAnalysisResult _generateSmartBookDemoResult({
    required String bookTitle,
    required String bookAuthor,
    required String curatorAngle,
    String? userExcerptText,
    required String targetAudience,
    required String tone,
    required double visualArtRatio,
    String? errorMessage,
  }) {
    final title = bookTitle.isNotEmpty ? bookTitle : 'Curated Book Reading';
    final author = bookAuthor.isNotEmpty ? bookAuthor : 'Philosophical Classic';
    final angle = curatorAngle.isNotEmpty
        ? curatorAngle
        : 'The beauty of stillness and human reflection';

    String pullQuote;
    String adaptedHeadline;
    String hook;
    String summary;
    String whyItMatters;
    List<String> takeaways;
    String metric;

    final bool hasCustomAngle = curatorAngle.trim().isNotEmpty &&
        curatorAngle != 'The beauty of stillness and human reflection' &&
        curatorAngle != 'Profound literary reflection' &&
        curatorAngle != 'Curator Reflection';

    final lowerAngle = angle.toLowerCase();
    final bool isCritical = lowerAngle.contains('toxic') ||
        lowerAngle.contains('bad') ||
        lowerAngle.contains('trap') ||
        lowerAngle.contains('flaw') ||
        lowerAngle.contains('critique') ||
        lowerAngle.contains('cynic') ||
        lowerAngle.contains('disagree') ||
        lowerAngle.contains('privilege') ||
        lowerAngle.contains('problem') ||
        lowerAngle.contains('danger') ||
        lowerAngle.contains('overrated') ||
        lowerAngle.contains('harsh') ||
        lowerAngle.contains('harm') ||
        lowerAngle.contains('unrealistic') ||
        lowerAngle.contains('cold') ||
        lowerAngle.contains('passive') ||
        lowerAngle.contains('burden') ||
        lowerAngle.contains('waste') ||
        lowerAngle.contains('fail') ||
        lowerAngle.contains('myth') ||
        lowerAngle.contains('gaslight') ||
        lowerAngle.contains('wrong') ||
        lowerAngle.contains('doubt') ||
        lowerAngle.contains('suppress') ||
        lowerAngle.contains('apathy') ||
        lowerAngle.contains('hate') ||
        lowerAngle.contains('lie');

    final bool isDeeplyEmotional = lowerAngle.contains('grief') ||
        lowerAngle.contains('loss') ||
        lowerAngle.contains('heal') ||
        lowerAngle.contains('tear') ||
        lowerAngle.contains('cry') ||
        lowerAngle.contains('heart') ||
        lowerAngle.contains('breakup') ||
        lowerAngle.contains('mourn') ||
        lowerAngle.contains('father') ||
        lowerAngle.contains('mother') ||
        lowerAngle.contains('death') ||
        lowerAngle.contains('pain') ||
        lowerAngle.contains('wound') ||
        lowerAngle.contains('comfort') ||
        lowerAngle.contains('solace');

    if (hasCustomAngle) {
      if (isCritical) {
        adaptedHeadline = 'The Flaw in $title: Why $angle';
        hook = 'I read this passage not to romanticize $author, but to take ownership of a hard truth: $angle.';
        summary = 'Revisiting $title with an unflinching eye dismantles the conventional reverence.\n\n'
            'My clear verdict on this reading: $angle. Far from offering a universally healthy philosophy, the text risks endorsing emotional detachment and passive submission. We must have the courage to interrogate classic literature rather than accepting it blindly.';
        whyItMatters = 'Challenging revered classics from this critical angle empowers $targetAudience to spot dogma and think independently.';
        takeaways = [
          'Exposing how $author\'s perspective oversimplifies real-world human suffering',
          'Curator\'s critique: $angle',
          'Rejecting emotional suppression in favor of authentic presence',
          'A necessary counter-narrative for $targetAudience',
        ];
        pullQuote = userExcerptText != null && userExcerptText.trim().isNotEmpty
            ? (userExcerptText.length > 120 ? '${userExcerptText.substring(0, 120)}...' : userExcerptText)
            : 'The words that triggered this critique and made me question the author\'s premise.';
        metric = 'Curator Critique';
      } else if (isDeeplyEmotional) {
        adaptedHeadline = '$title & the Heart: $angle';
        hook = 'Some pages don\'t merely offer ideas; they articulate our deepest unspoken grief and healing.';
        summary = 'Encountering this excerpt from $title cuts straight through intellectual detachment.\n\n'
            'My emotional truth on this reading: $angle. Words written across time become an intimate life raft, articulating the exact ache and solace I needed today. Reading becomes an act of emotional survival.';
        whyItMatters = 'In a rushed, transactional culture, taking ownership of our emotional resonance reminds $targetAudience of our shared vulnerability.';
        takeaways = [
          'How literature provides language when our own vocabulary fails',
          'Curator\'s emotional lens: $angle',
          'Grief and healing require patience, not rushed intellectual fixes',
          'Finding profound kinship in honest, vulnerable prose',
        ];
        pullQuote = userExcerptText != null && userExcerptText.trim().isNotEmpty
            ? (userExcerptText.length > 120 ? '${userExcerptText.substring(0, 120)}...' : userExcerptText)
            : 'A passage that paused my breath and stirred what words rarely reach.';
        metric = 'Curator Reflection';
      } else {
        adaptedHeadline = '$title Reconsidered: $angle';
        hook = 'A transformative passage from $author that cuts straight through modern noise: $angle.';
        summary = 'Reading $title by $author demands that we stop skimming and take full ownership of what this text means for us.\n\n'
            'My primary thesis on this reading: $angle. This passage is not just historical literature—it is an urgent lens through which we must examine our choices, attention, and values.';
        whyItMatters = 'Championing this specific angle gives $targetAudience a grounding compass against daily superficial distraction.';
        takeaways = [
          'Curator\'s thesis: $angle',
          'Why $author\'s insight speaks directly to modern dilemmas',
          'Moving from passive reading to active, owned personal philosophy',
          'A vital touchstone for $targetAudience',
        ];
        pullQuote = userExcerptText != null && userExcerptText.trim().isNotEmpty
            ? (userExcerptText.length > 120 ? '${userExcerptText.substring(0, 120)}...' : userExcerptText)
            : 'Words that anchor the mind and reshape how we experience reality.';
        metric = 'Curator Pick';
      }
    } else if (title.toLowerCase().contains('meditations') || author.toLowerCase().contains('marcus')) {
      pullQuote = 'You have power over your mind—not outside events. Realize this, and you will find strength.';
      adaptedHeadline = 'The Citadel Within: How Ancient Stoicism Anchors the Modern Soul';
      hook = 'Marcus Aurelius wrote these private notes during wartime plagues and betrayed alliances—not for an audience, but to keep himself humane.';
      summary = 'In this passage from Meditations, Roman Emperor Marcus Aurelius reminds himself that outer turbulence has zero claim over inner composure unless granted permission.\n\n'
          'Through the Curator\'s angle ("$angle"), this reading transforms from ancient theory into a life raft: serenity is not the absence of external storms, but the presence of an unbreakable fortress within oneself.';
      whyItMatters = 'When algorithms and notifications bombard our consciousness, claiming sovereignty over our internal thoughts is the ultimate act of modern rebellion.';
      takeaways = [
        'Distinguish clearly between what you control (attitudes, choices) and what you cannot',
        'Outer events are neutral until colored by your internal judgments',
        'Peace is an hourly practice, built moment by quiet moment',
        'Returning to oneself is the most reliable anchor amidst global chaos',
      ];
      metric = 'Book IV';
    } else if (title.toLowerCase().contains('midnight library') || author.toLowerCase().contains('matt haig')) {
      pullQuote = 'You don’t have to understand life. You just have to live it.';
      adaptedHeadline = 'Untangling Regret: What the Multiverse Teaches Us About Loving Our One Life';
      hook = 'Between life and death stands a boundless library where every book is another life you could have lived.';
      summary = 'In this moving passage from The Midnight Library, Nora Seed discovers that grief often mourns lives we never actually wanted, but merely romanticized in regret.\n\n'
          'Viewed through the Curator\'s emotional lens ("$angle"), the excerpt gently dissolves the paralysis of comparison. The only life that holds meaning is the raw, flawed one we are breathing in today.';
      whyItMatters = 'We live in the most regret-amplifying era in human history, constantly fed parallel lives through social feeds.';
      takeaways = [
        'Romanticizing unchosen paths steals joy from the life currently in front of you',
        'Every alternate life brings its own unforeseen heartaches and compromises',
        'Gratitude is the antidote to the ghost ache of "what if"',
        'You are not behind in life; you are simply living your singular story',
      ];
      metric = 'Chapter 28';
    } else if (title.toLowerCase().contains('letters to a young poet') || author.toLowerCase().contains('rilke')) {
      pullQuote = 'Be patient toward all that is unsolved in your heart and try to love the questions themselves.';
      adaptedHeadline = 'Loving the Questions: Rilke on Solitude, Patience, and Growing Into Truth';
      hook = 'Rilke did not urge the young poet to find fast answers, but to let the mystery of living unfold at its own deliberate pace.';
      summary = 'Rainer Maria Rilke\'s words in Letters to a Young Poet speak directly to anyone standing at the precipice of uncertainty.\n\n'
          'Seen through the Curator\'s perspective ("$angle"), the excerpt celebrates patience as a sacred virtue. We cannot force clarity before its season; some truths can only be lived into over years.';
      whyItMatters = 'In a culture obsessed with immediate optimization and instant answers, Rilke offers permission to be comfortably incomplete.';
      takeaways = [
        'Answers cannot be given until you have lived enough to hold them',
        'Solitude is fertile ground where genuine identity takes root',
        'Treat your doubts as companions on the path rather than obstacles',
        'Trust the quiet incubation of time over rushed resolutions',
      ];
      metric = 'Letter IV';
    } else {
      pullQuote = userExcerptText != null && userExcerptText.trim().isNotEmpty
          ? (userExcerptText.length > 120 ? '${userExcerptText.substring(0, 120)}...' : userExcerptText)
          : 'Words that pause time and stir the deepest corners of the mind.';
      adaptedHeadline = '$title: Reflections on $angle';
      hook = 'A poignant book excerpt reminding us that deep reading reshapes how we experience reality.';
      summary = 'Reading $title by $author provides a mirror into our own unspoken yearnings and reflections.\n\n'
          'Through the Curator\'s angle ("$angle"), this passage invites us to slow down, absorb the cadence of thoughtful prose, and let literary depth quiet the noise of daily routine.';
      whyItMatters = 'Books offer intimate conversations with great minds across centuries, grounding $targetAudience in timeless perspective.';
      takeaways = [
        'An unforgettable emotional resonance that lingers long after closing the page',
        'Curator\'s perspective: "$angle"',
        'Deep reading cultivates empathy and philosophical resilience',
        'A vital literary reminder for $targetAudience in a hurried world',
      ];
      metric = 'Curator Pick';
    }

    List<String> bookExcerpts = [];
    if (userExcerptText != null && userExcerptText.trim().isNotEmpty) {
      bookExcerpts = userExcerptText
          .split(RegExp(r'\n\s*\n'))
          .map((p) => p.trim())
          .where((p) => p.length > 25)
          .take(3)
          .toList();
    }
    if (bookExcerpts.length < 2) {
      bookExcerpts = [
        pullQuote,
        'The passage continues to resonate as a testament to the enduring weight of quiet contemplation, offering an authentic testament unmediated by contemporary hurry.',
      ];
    }

    return GeminiAnalysisResult(
      originalHeadline: '$title: $angle',
      publicationName: '$title • $author',
      adaptedHeadline: adaptedHeadline,
      hook: hook,
      summary: summary,
      creatorOpinion: hasCustomAngle
          ? 'Reading through this lens reveals how $angle. The author cuts through contemporary distraction to illuminate timeless truths that modern discourse urgently needs.'
          : 'This quintessential passage cuts through the noise of modern distraction. Absorbing its cadence reminds us that clarity is forged through patient contemplation, not immediate reaction.',
      whyItMatters: whyItMatters,
      keyTakeaways: takeaways,
      pullQuote: pullQuote,
      receiptHighlightQuote: pullQuote,
      articleExcerpts: bookExcerpts,
      keyMetric: metric,
      categoryBadge: 'LITERARY EXCERPT',
      digitalLink: 'https://books.google.com/books?q=${Uri.encodeComponent('$title $author')}',
      suggestedStyle: PosterStyleType.editorial,
      visualArtRatio: visualArtRatio,
      infographicType: 'metric_spotlight',
      infographicStats: [title, author, metric],
      visualMood: 'Literary Evocative Art',
      isDemoMode: true,
      errorMessage: errorMessage,
    );
  }

  static String _ensureCompleteSentence(String text) {
    String clean = text.trim();
    if (clean.isEmpty) return clean;
    while (clean.endsWith('...') || clean.endsWith('…') || clean.endsWith('.')) {
      if (clean.endsWith('...')) {
        clean = clean.substring(0, clean.length - 3).trim();
      } else if (clean.endsWith('…')) {
        clean = clean.substring(0, clean.length - 1).trim();
      } else if (clean.endsWith('.')) {
        clean = clean.substring(0, clean.length - 1).trim();
      } else {
        break;
      }
    }
    if (!clean.endsWith('.') && !clean.endsWith('!') && !clean.endsWith('?')) {
      clean = '$clean.';
    }
    return clean;
  }

  static String _ensureCleanHeadline(String text) {
    String clean = text.trim();
    while (clean.endsWith('...') || clean.endsWith('…')) {
      if (clean.endsWith('...')) {
        clean = clean.substring(0, clean.length - 3).trim();
      } else if (clean.endsWith('…')) {
        clean = clean.substring(0, clean.length - 1).trim();
      } else {
        break;
      }
    }
    return clean;
  }

  GeminiAnalysisResult _generateSmartMySlantDemoResult({
    required String rawThought,
    String? sparkCatalyst,
    required String slantTone,
    bool refineCoreTake = true,
    String? visualCues,
    required String targetAudience,
    required String tone,
    double visualArtRatio = 0.65,
    String? errorMessage,
  }) {
    final bool isHeart = slantTone == 'heart';
    final String toneIcon = isHeart ? '❤️' : '🧠';

    final cleanThought = _ensureCompleteSentence(rawThought);
    final String catalyst = (sparkCatalyst != null && sparkCatalyst.trim().isNotEmpty)
        ? _ensureCleanHeadline(sparkCatalyst.trim())
        : (isHeart
            ? 'A quiet moment of lived reflection'
            : 'Observing the pace of modern consensus');

    String headline = 'Reflections on Life & Perspective';
    final sentences = cleanThought.split(RegExp(r'(?<=[.!?])\s+'));
    if (sentences.isNotEmpty && sentences.first.isNotEmpty) {
      final first = sentences.first.replaceAll(RegExp(r'[.!?]$'), '').trim();
      final words = first.split(RegExp(r'\s+'));
      if (words.length <= 9) {
        headline = first;
      } else {
        headline = words.take(8).join(' ');
      }
    }
    headline = _ensureCleanHeadline(headline);

    final String hook = isHeart
        ? _ensureCompleteSentence('A personal, heartfelt reflection from lived experience: "$cleanThought"')
        : _ensureCompleteSentence('An unfiltered, sharp intellectual conviction: "$cleanThought"');

    String coreTake;
    if (refineCoreTake) {
      if (sentences.isNotEmpty && sentences.first.length > 15) {
        coreTake = _ensureCompleteSentence(sentences.first);
      } else {
        coreTake = isHeart
            ? 'Our deepest human instincts and heartfelt experiences carry an innate authority that no algorithm or consensus can replicate.'
            : 'Independent critical reasoning and direct observation are the only real antidote to borrowed opinions and algorithmic conformity.';
      }
    } else {
      coreTake = cleanThought;
    }

    final String pullQuote = coreTake;
    final String receiptHighlight = coreTake;

    final String summary = isHeart
        ? 'Direct from the heart: $cleanThought\n\nSometimes we carry convictions that require no external validation or news peg. This reflection touches on the fundamental human need for connection, meaning, and staying true to our inner compass.'
        : 'Direct intellectual conviction: $cleanThought\n\nBeyond conventional wisdom and second-hand opinions, genuine clarity begins when you reason from direct observation. This stance challenges prevailing assumptions and demands clear-eyed examination.';

    final String whyItMatters = isHeart
        ? 'Because genuine vulnerability and heartfelt perspective are the truest counterweight to noisy online feeds.'
        : 'Because independent critical reasoning separates genuine insight from herd consensus.';

    final List<String> takeaways = isHeart
        ? [
            'Lived emotional truth holds its own authority without citation.',
            'Staying grounded in our core human values amidst relentless pace.',
            'A quiet invitation to listen inward and honor what truly matters.',
          ]
        : [
            'First-principles reasoning cuts through reactionary noise.',
            'Direct personal conviction over borrowed opinions.',
            'A strategic perspective shift that unlocks deeper clarity.',
          ];

    final List<String> excerpts = [
      _ensureCompleteSentence('The initial observation that stirred this conviction: $cleanThought'),
      pullQuote,
      isHeart
          ? 'An enduring personal conviction preserved as a reminder of what remains true when everything else shifts.'
          : 'A rigorous intellectual foundation that stands independent of fleeting trends and external consensus.',
    ];

    return GeminiAnalysisResult(
      originalHeadline: catalyst,
      publicationName: "My Slant",
      adaptedHeadline: headline,
      hook: hook,
      summary: summary,
      creatorOpinion: coreTake,
      whyItMatters: whyItMatters,
      keyTakeaways: takeaways,
      pullQuote: pullQuote,
      receiptHighlightQuote: receiptHighlight,
      articleExcerpts: excerpts,
      keyMetric: isHeart ? 'Heartfelt Stance' : 'Core Thesis',
      categoryBadge: 'OPINION',
      digitalLink: '',
      suggestedStyle: PosterStyleType.editorial,
      visualArtRatio: visualArtRatio,
      infographicType: 'metric_spotlight',
      infographicStats: ['My Slant', isHeart ? 'Heart' : 'Mind', 'Personal Take'],
      visualMood: isHeart ? 'Emotional Humanist' : 'Intellectual Metaphor',
      slantTone: slantTone,
      slantIcon: toneIcon,
      isDemoMode: true,
      errorMessage: errorMessage,
    );
  }
}
