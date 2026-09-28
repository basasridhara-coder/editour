import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../models/poster_style_config.dart';
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
    this.visualArtRatio = 0.6,
    this.infographicType,
    this.infographicStats = const [],
    this.visualMood,
    this.isDemoMode = false,
    this.errorMessage,
    this.rawGeminiResponse,
    this.receiptHighlightQuote,
  });
}

class GeminiService {
  final StorageService _storageService = StorageService();

  static const List<String> _candidateImageModels = [
    'gemini-3.1-flash-image',
    'gemini-3-pro-image',
    'gemini-3.1-flash-lite-image',
    'gemini-2.5-flash-image',
  ];

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
    String? fallbackTitle,
    String? fallbackBody,
    double visualArtRatio = 0.6,
    void Function(String message)? onProgressUpdate,
  }) async {
    final apiKey = await _storageService.getApiKey();

    if (apiKey == null || apiKey.trim().isEmpty) {
      debugPrint('No API Key configured, using Smart Demo mode.');
      return _generateSmartDemoResult(
        targetAudience: targetAudience,
        tone: tone,
        userContext: userContext,
        fallbackTitle: fallbackTitle,
        fallbackBody: fallbackBody,
        visualArtRatio: visualArtRatio,
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
Analyze this physical newspaper or magazine clipping.
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
                visualArtRatio: visualArtRatio,
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
      fallbackTitle: detectedHeadline ?? fallbackTitle,
      fallbackBody: fallbackBody,
      visualArtRatio: visualArtRatio,
    );
  }

  /// Multimodal analysis of physical newspaper / magazine photos
  Future<GeminiAnalysisResult> analyzeAndSummarizeArticle({
    required Uint8List imageBytes,
    required String targetAudience,
    required String tone,
    String? userContext,
    String? fallbackTitle,
    String? fallbackBody,
    double visualArtRatio = 0.6,
  }) async {
    final apiKey = await _storageService.getApiKey();

    if (apiKey == null || apiKey.trim().isEmpty) {
      debugPrint('No API Key configured, using Smart Demo mode.');
      return _generateSmartDemoResult(
        targetAudience: targetAudience,
        tone: tone,
        userContext: userContext,
        fallbackTitle: fallbackTitle,
        fallbackBody: fallbackBody,
        visualArtRatio: visualArtRatio,
        errorMessage: 'No Gemini API Key provided. Enter your free API key in Settings.',
      );
    }

    final base64Image = base64Encode(imageBytes);
    final int artPct = (visualArtRatio * 100).round();
    final int textPct = 100 - artPct;

    final prompt = '''
You are the ghostwriter and museum-grade visual poster designer for the CURATOR of PostCard.
Analyze this photo of a physical newspaper or magazine article in extreme detail.

${userContext != null && userContext.trim().isNotEmpty ? '''
⚠️ ABSOLUTE DIRECTIVE ON CURATOR OWNERSHIP & TARGET AUDIENCE TRANSLATION:
CURATOR'S OWNED ANGLE & TARGET AUDIENCE TRANSLATION PROTOCOL:
- Curator's Owned Stance: "$userContext"
- Target Audience: "$targetAudience" (Tone: "$tone")

The Curator is NOT asking for a neutral, detached press summary. The Curator is TAKING FULL PERSONAL OWNERSHIP of this post.
HOW TO TRANSLATE THE CURATOR'S VOICE FOR THIS AUDIENCE:
1. UNCOMPROMISING CONVICTION: Represent and amplify the Curator's angle—good or bad, critical, contrarian, skeptical, or enthusiastic. DO NOT soften or balance it out with "while some argue" or "on the other hand".
2. AUDIENCE RESONANCE & MENTAL MODELS: Translate the Curator's stance into the specific stakes, daily realities, and native vocabulary of "$targetAudience". Address what matters to them (risks, rewards, leverage, efficiency, or foundational truths).
3. ADAPTED HEADLINE: Frame the Curator's thesis so it commands immediate attention from "$targetAudience".
4. HOOK: A bold opening sentence connecting the Curator's angle directly to "$targetAudience"'s immediate world.
5. WHY IT MATTERS: A dedicated 2-sentence callout answering: "Why should someone in $targetAudience care about this specific Curator angle right now?"
''' : '''
CURATOR'S EDITORIAL GOAL:
Distill the print story with sharp high-signal takeaways specifically for "$targetAudience" in a "$tone" tone.
- Frame the headline, hook, and takeaways around what matters to "$targetAudience" and their unique stakes.
'''}

VISUAL ARTWORK & INFOGRAPHIC RATIO:
The user selected a visual ratio of $artPct% Picture Art & Infographics and $textPct% Editorial Text.
- Because $artPct% is dedicated to Visual Art and Infographics:
  - If $artPct >= 70%: Design a picture-art dominant poster. The visual illustration and infographic data should take primary focus. Keep headlines punchy and bold.
  - If $artPct between 40% and 69%: Balanced magazine poster layout (50/50 hero art/infographic + structured takeaways).
  - If $artPct <= 39%: Text-heavy editorial analysis with a visual art header banner and metric badges.

Your task:
1. Optical Character Recognition (OCR): Read all visible printed headlines, subheadings, bylines, publication name, dates, and column body text.
2. Audience Adaptation & Curator Voice: Synthesize the story for $targetAudience in the $tone tone, boldly championing the Curator's angle.
3. ⚡️ STRICT 1-MINUTE READ CONSTRAINT (MANDATORY): The summary MUST be strictly readable in 60 seconds or less. Word count: 100 to 140 words maximum. Do NOT write long, elaborated essays or multi-paragraph dissertations. Cut straight to the core: high signal, zero filler, immediate punch across 1-2 tight paragraphs.
4. Visual Art & Poster Composition: Design a compelling visual poster layout formatted for high-engagement social feeds (Instagram 4:5 portrait format).

Return ONLY a valid JSON object matching this schema:
{
  "original_headline": "The exact original headline detected in the physical print",
  "publication_name": "The newspaper or magazine name (e.g. The New York Times, Financial Times, The Guardian, Time, or Physical Press)",
  "adapted_headline": "${userContext != null && userContext.trim().isNotEmpty ? "The Curator's bold headline/verdict championing their angle for $targetAudience" : "A bold, punchy headline rewritten specifically to resonate with $targetAudience"}",
  "hook": "An irresistible 1-2 sentence hook highlighting the core insight through the Curator's lens",
  "summary": "STRICT 1-MINUTE READ (maximum 100-140 words total across 1-2 tight, razor-sharp paragraphs). High-voltage, punchy synthesis in the Curator's voice that takes 60 seconds or less to read.",
  "why_it_matters": "A dedicated 2-sentence explanation of why this story matters specifically to $targetAudience",
  "key_takeaways": [
    "Takeaway 1 (strong, high-signal bullet point supporting the angle)",
    "Takeaway 2 (strong, high-signal bullet point supporting the angle)",
    "Takeaway 3 (strong, high-signal bullet point supporting the angle)",
    "Takeaway 4 (strong, high-signal bullet point supporting the angle)"
  ],
  "pull_quote": "A memorable, powerful statement from the physical article suitable for a large poster callout",
  "receipt_highlight_quote": "A 1-2 sentence verbatim excerpt or smoking-gun quote directly from the physical text that provides undeniable proof for the stance",
  "key_metric": "A key number, stat, or metric from the article (e.g. '+34%', '\$1.2B', 'Year 2030', '4-Day Week')",
  "category_badge": "Category in 1-2 uppercase words (e.g. DEEP TECH, CULTURE, GLOBAL ECONOMY, CLIMATE, SCIENCE)",
  "digital_link": "A valid online article link or an accurate Google search URL (https://news.google.com/search?q=...) for this topic",
  "suggested_style": "editorial | modernCyber | boldSocial | minimalist",
  "illustration_prompt": "A vivid, artistic prompt describing modern editorial artwork whose mood and metaphors embody the story and the Curator's angle",
  "visual_mood": "Short aesthetic style description matching the tone of the stance",
  "infographic_type": "metric_spotlight | comparison_bars | flow_steps | stat_donut",
  "infographic_stats": [
    "Visual stat 1 with metric and label",
    "Visual stat 2 with metric and label",
    "Visual stat 3 with metric and label"
  ]
}
''';

    // 1. First attempt: Generate full visual Infographic Poster Image directly using Gemini Image Model
    try {
      final imageResult = await _generatePosterWithImageModel(
        apiKey: apiKey,
        base64Image: base64Image,
        targetAudience: targetAudience,
        tone: tone,
        userContext: userContext,
        visualArtRatio: visualArtRatio,
      );
      if (imageResult != null) {
        debugPrint('Successfully generated AI Infographic Poster with image model!');
        return imageResult;
      }
    } catch (e) {
      debugPrint('AI image model attempt failed, falling back to text models: $e');
    }

    // 2. Second attempt: Fallback to Text LLMs for extraction
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
            "temperature": 0.35,
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

              PosterStyleType style = PosterStyleType.editorial;
              final styleStr = data['suggested_style']?.toString().toLowerCase();
              if (styleStr == 'moderncyber' || styleStr == 'modern_cyber') {
                style = PosterStyleType.modernCyber;
              } else if (styleStr == 'boldsocial' || styleStr == 'bold_social') {
                style = PosterStyleType.boldSocial;
              } else if (styleStr == 'minimalist') {
                style = PosterStyleType.minimalist;
              }

              final illustrationPrompt = data['illustration_prompt'] as String?;
              final visualMood = data['visual_mood']?.toString();
              final infographicType = data['infographic_type']?.toString();
              final infographicStats = (data['infographic_stats'] as List?)
                      ?.map((e) => e.toString())
                      .toList() ??
                  [];

              // Attempt to generate visual AI artwork illustration via Gemini Image model
              Uint8List? illustrationBytes;
              if (illustrationPrompt != null && illustrationPrompt.isNotEmpty) {
                illustrationBytes = await generatePosterIllustration(
                  apiKey: apiKey,
                  prompt: illustrationPrompt,
                );
              }

              return GeminiAnalysisResult(
                originalHeadline: data['original_headline'] ?? 'Physical Print Article',
                publicationName: data['publication_name'] ?? 'Print Publication',
                adaptedHeadline: data['adapted_headline'] ?? 'Key Insights from Print',
                hook: data['hook'] ?? 'A physical print story digitized and distilled.',
                summary: data['summary'] ?? 'Summary generated from physical newspaper clipping.',
                whyItMatters: data['why_it_matters'],
                keyTakeaways: (data['key_takeaways'] as List?)
                        ?.map((e) => e.toString())
                        .toList() ??
                    ['Key insight distilled from print story'],
                pullQuote: data['pull_quote'] ?? 'A memorable story from print.',
                receiptHighlightQuote: (data['receipt_highlight_quote'] != null && data['receipt_highlight_quote'].toString().trim().isNotEmpty)
                    ? data['receipt_highlight_quote'].toString().trim()
                    : (data['pull_quote']?.toString() ?? 'Source evidence excerpt.'),
                keyMetric: data['key_metric'] ?? 'Report',
                categoryBadge: data['category_badge'] ?? 'DISCOVERY',
                digitalLink: data['digital_link'] ??
                    'https://news.google.com/search?q=${Uri.encodeComponent(data['adapted_headline'] ?? 'News')}',
                suggestedStyle: style,
                illustrationPrompt: illustrationPrompt,
                generatedIllustrationBytes: illustrationBytes,
                visualArtRatio: visualArtRatio,
                infographicType: infographicType,
                infographicStats: infographicStats,
                visualMood: visualMood,
                isDemoMode: false,
                rawGeminiResponse: rawText,
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
    return _generateSmartDemoResult(
      targetAudience: targetAudience,
      tone: tone,
      userContext: userContext,
      fallbackTitle: fallbackTitle,
      fallbackBody: fallbackBody,
      visualArtRatio: visualArtRatio,
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
    double visualArtRatio = 0.6,
  }) async {
    final apiKey = await _storageService.getApiKey();

    if (apiKey == null || apiKey.trim().isEmpty) {
      debugPrint('No API Key configured, using Smart Demo mode for digital article.');
      return _generateSmartDemoResult(
        targetAudience: targetAudience,
        tone: tone,
        userContext: userContext,
        fallbackTitle: articleTitle.isNotEmpty ? articleTitle : 'Digital News Discovery',
        fallbackBody: articleBody.isNotEmpty ? articleBody : 'Digital news article summary.',
        visualArtRatio: visualArtRatio,
        errorMessage: 'No Gemini API Key provided. Enter your free API key in Settings.',
      );
    }

    final int artPct = (visualArtRatio * 100).round();
    final int textPct = 100 - artPct;
    final pubName = (publicationName != null && publicationName.isNotEmpty)
        ? publicationName
        : _extractDomainFromUrl(articleUrl);

    final prompt = '''
You are the ghostwriter and museum-grade visual poster designer for the CURATOR of PostCard.
The user read a digital article from "$pubName" ($articleUrl) and is curating it.

${userContext != null && userContext.trim().isNotEmpty ? '''
⚠️ ABSOLUTE DIRECTIVE ON CURATOR OWNERSHIP & TARGET AUDIENCE TRANSLATION:
CURATOR'S OWNED ANGLE & TARGET AUDIENCE TRANSLATION PROTOCOL:
- Curator's Owned Stance: "$userContext"
- Target Audience: "$targetAudience" (Tone: "$tone")

The Curator is NOT asking for a neutral, detached press recap. The Curator is TAKING FULL PERSONAL OWNERSHIP of this post.
HOW TO TRANSLATE THE CURATOR'S VOICE FOR THIS AUDIENCE:
1. UNCOMPROMISING CONVICTION: Represent and amplify the Curator's angle—good or bad, critical, contrarian, skeptical, or enthusiastic. DO NOT soften or balance it out with "while some argue" or "on the other hand".
2. AUDIENCE RESONANCE & MENTAL MODELS: Translate the Curator's stance into the specific stakes, daily realities, and native vocabulary of "$targetAudience". Address what matters to them (risks, rewards, leverage, efficiency, or foundational truths).
3. ADAPTED HEADLINE: Frame the Curator's thesis so it commands immediate attention from "$targetAudience".
4. HOOK: A bold opening sentence connecting the Curator's angle directly to "$targetAudience"'s immediate world.
5. WHY IT MATTERS: A dedicated 2-sentence callout answering: "Why should someone in $targetAudience care about this specific Curator angle right now?"
''' : '''
CURATOR'S EDITORIAL GOAL:
Distill the digital story with sharp high-signal takeaways specifically for "$targetAudience" in a "$tone" tone.
- Frame the headline, hook, and takeaways around what matters to "$targetAudience" and their unique stakes.
'''}

ARTICLE TITLE: $articleTitle
ARTICLE CONTENT / EXCERPT:
${articleBody.length > 3500 ? articleBody.substring(0, 3500) : articleBody}

AUDIENCE & EDITORIAL GOALS:
- Target Audience: "$targetAudience"
- Tone & Vibe: "$tone"
- Visual Ratio: $artPct% Picture Art & Infographics, $textPct% Editorial Text.

YOUR TASK:
1. Editorial Synthesis (⚡️ STRICT 1-MINUTE READ): Synthesize this story specifically for $targetAudience in the $tone tone, championing the Curator's angle. The summary MUST be strictly readable in 60 seconds or less. Word count: 100 to 140 words MAXIMUM across 1-2 punchy paragraphs. Do NOT write an elaborated or sprawling essay.
2. Headline & Hook: Create a bold headline declaring the Curator's stance and an opening hook tailored to trigger curiosity.
3. Key Takeaways: Produce 3-4 clear, high-impact bullet points and a memorable pull quote supporting the Curator's angle.
4. Key Metric: Extract or synthesize a bold numeric stat (e.g. "\$2.6B", "+34%", "1,024 Qubits").
5. Poster Visual Concept: Create a vivid illustration prompt whose metaphors and color mood embody the story through the Curator's angle.

Return ONLY a valid JSON object matching this schema:
{
  "original_headline": "${articleTitle.isNotEmpty ? articleTitle : "Digital News Article"}",
  "publication_name": "$pubName",
  "adapted_headline": "${userContext != null && userContext.trim().isNotEmpty ? "The Curator's bold headline/verdict championing their angle for $targetAudience" : "Bold, punchy headline rewritten specifically for $targetAudience"}",
  "hook": "1-2 sentence compelling hook highlighting the core insight through the Curator's lens",
  "summary": "STRICT 1-MINUTE READ (maximum 100-140 words, 1-2 punchy paragraphs). A razor-sharp, high-voltage distillation in the Curator's voice that takes 60 seconds or less to read without filler or unnecessary elaboration.",
  "why_it_matters": "A dedicated 2-sentence explanation of why this story matters specifically to $targetAudience",
  "key_takeaways": [
    "Takeaway 1 (strong, high-signal bullet point supporting the angle)",
    "Takeaway 2 (strong, high-signal bullet point supporting the angle)",
    "Takeaway 3 (strong, high-signal bullet point supporting the angle)"
  ],
  "pull_quote": "A memorable statement from the article supporting this stance",
  "receipt_highlight_quote": "A 1-2 sentence verbatim excerpt directly from the article body that serves as clear evidence/receipt for the curator stance",
  "key_metric": "A key stat or number (e.g. '\$2.6B', '30%', '4 Min')",
  "category_badge": "1-2 uppercase words (e.g. HEALTHCARE, DEEP TECH, CLIMATE, ECONOMY)",
  "digital_link": "$articleUrl",
  "suggested_style": "editorial | modernCyber | boldSocial | minimalist",
  "illustration_prompt": "A vivid, artistic prompt describing a modern editorial illustration embodying the mood of the Curator's angle",
  "visual_mood": "Short aesthetic style description matching the tone of the stance",
  "infographic_type": "metric_spotlight | comparison_bars | flow_steps | stat_donut",
  "infographic_stats": [
    "Stat 1 with metric and label",
    "Stat 2 with metric and label",
    "Stat 3 with metric and label"
  ]
}
''';

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
            final parts = content['parts'] as List?;
            if (parts != null && parts.isNotEmpty) {
              final rawText = parts[0]['text'] as String?;
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
                final illPrompt = parsed['illustration_prompt']?.toString();
                if (illPrompt != null && illPrompt.isNotEmpty && visualArtRatio >= 0.3) {
                  try {
                    illustrationBytes = await generatePosterIllustration(
                      apiKey: apiKey,
                      prompt: illPrompt,
                    );
                  } catch (e) {
                    debugPrint('Digital article illustration generation failed: $e');
                  }
                }

                return GeminiAnalysisResult(
                  originalHeadline: parsed['original_headline'] ?? articleTitle,
                  publicationName: parsed['publication_name'] ?? pubName,
                  adaptedHeadline: parsed['adapted_headline'] ?? articleTitle,
                  hook: parsed['hook'] ?? 'A digital story curated into visual poster art.',
                  summary: parsed['summary'] ?? articleBody,
                  whyItMatters: parsed['why_it_matters'],
                  keyTakeaways: (parsed['key_takeaways'] as List?)
                          ?.map((e) => e.toString())
                          .toList() ??
                      ['Key insight from digital news coverage'],
                  pullQuote: parsed['pull_quote'] ?? 'A memorable observation from the story.',
                  receiptHighlightQuote: (parsed['receipt_highlight_quote'] != null && parsed['receipt_highlight_quote'].toString().trim().isNotEmpty)
                      ? parsed['receipt_highlight_quote'].toString().trim()
                      : (parsed['pull_quote']?.toString() ?? 'Key quote evidence.'),
                  keyMetric: parsed['key_metric'] ?? 'Trending',
                  categoryBadge: parsed['category_badge'] ?? 'DIGITAL NEWS',
                  digitalLink: parsed['digital_link'] ?? articleUrl,
                  suggestedStyle: style,
                  illustrationPrompt: illPrompt,
                  generatedIllustrationBytes: illustrationBytes,
                  visualArtRatio: visualArtRatio,
                  infographicType: parsed['infographic_type']?.toString() ?? 'metric_spotlight',
                  infographicStats: (parsed['infographic_stats'] as List?)
                          ?.map((e) => e.toString())
                          .toList() ??
                      [],
                  visualMood: parsed['visual_mood']?.toString() ?? 'Digital Editorial Art',
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
        debugPrint('Gemini digital article model $model exception: $e');
        if (_isNetworkError(e)) {
          debugPrint('Network offline detected, halting model loop');
          break;
        }
      }
    }

    return _generateSmartDemoResult(
      targetAudience: targetAudience,
      tone: tone,
      userContext: userContext,
      fallbackTitle: articleTitle.isNotEmpty ? articleTitle : 'Digital News Story',
      fallbackBody: articleBody,
      visualArtRatio: visualArtRatio,
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

                return GeminiAnalysisResult(
                  originalHeadline: parsed['original_headline'] ?? '$bookTitle Excerpt',
                  publicationName: parsed['publication_name'] ?? '$bookTitle • $bookAuthor',
                  adaptedHeadline: parsed['adapted_headline'] ?? bookTitle,
                  hook: parsed['hook'] ?? 'An unforgettable literary excerpt.',
                  summary: parsed['summary'] ?? '',
                  whyItMatters: parsed['whyItMatters'] ?? parsed['why_it_matters'],
                  keyTakeaways: List<String>.from(parsed['key_takeaways'] ?? []),
                  pullQuote: parsed['pull_quote'] ?? '',
                  receiptHighlightQuote: (parsed['receipt_highlight_quote'] != null && parsed['receipt_highlight_quote'].toString().trim().isNotEmpty)
                      ? parsed['receipt_highlight_quote'].toString().trim()
                      : (parsed['pull_quote']?.toString() ?? 'Literary source excerpt.'),
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

  /// Generates a full visual Infographic Poster Image directly using Gemini Image Generation
  Future<GeminiAnalysisResult?> _generatePosterWithImageModel({
    required String apiKey,
    required String base64Image,
    required String targetAudience,
    required String tone,
    String? userContext,
    required double visualArtRatio,
  }) async {
    final int artPct = (visualArtRatio * 100).round();
    final prompt = '''
You are an expert graphic designer and infographic poster artist.
The user took a photo of a physical newspaper or magazine article and wants a shareable infographic poster summarizing it.

AUDIENCE & FOCUS:
- Target Audience: "$targetAudience"
- Tone: "$tone"
- Angle / Creator Focus: "${userContext ?? 'Thought-provoking discovery'}"
- Visual Composition: $artPct% Picture Art & Infographics.

CRITICAL TYPOGRAPHY & TEXT RESTRICTION:
- DO NOT generate small paragraphs, fake body sentences, or tiny bullet points in the image. Diffusion/image generation models create garbled pseudo-words when attempting paragraphs.
- Keep ANY text inside the image strictly minimal, bold, and punchy: maximum 3 to 5 large bold words total (e.g. a bold title or 1 key statistic like "\$2.6B COST" or "PATIENTS vs PROFIT").
- Focus 95% of the visual on the central metaphor, illustrations, icons, characters, clean visual hierarchy, and atmospheric colors.
- All detailed body paragraphs, summary sentences, and bullet points will be rendered separately by the app. Do not draw fake illegible text lines!

YOUR INSTRUCTIONS:
1. Generate an illustrated, high-impact poster artwork or infographic visual representing the core metaphor and themes of this article for $targetAudience.
2. In the text portion of your response, also provide a clean JSON block in ```json ... ``` with:
{
  "original_headline": "Detected original headline",
  "publication_name": "Publication name if visible (e.g. The Times of India, The Speaking Tree, Lokmat Times)",
  "adapted_headline": "Punchy rewritten headline for $targetAudience",
  "hook": "1-2 sentence compelling hook",
  "summary": "2 short sentences summarizing the story",
  "why_it_matters": "Why this story matters specifically to $targetAudience",
  "key_takeaways": [
    "Takeaway point 1",
    "Takeaway point 2",
    "Takeaway point 3"
  ],
  "pull_quote": "A memorable quote from the article",
  "key_metric": "Key stat or metric (e.g. 13.8B Years)",
  "category_badge": "1-2 uppercase words (e.g. SCIENCE, COSMOLOGY, PHILOSOPHY)",
  "suggested_style": "editorial | modernCyber | boldSocial | minimalist",
  "visual_mood": "Visual aesthetic description (e.g. Cosmic Tree of Life Infographic)",
  "infographic_type": "metric_spotlight",
  "infographic_stats": ["Stat 1", "Stat 2", "Stat 3"],
  "digital_link_query": "Search query to find this article online"
}
''';

    for (final model in _candidateImageModels) {
      try {
        debugPrint('Attempting Gemini Image Model: $model');
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
          ]
        };

        final response = await http
            .post(
              uri,
              headers: {'Content-Type': 'application/json'},
              body: json.encode(requestBody),
            )
            .timeout(const Duration(seconds: 45));

        if (response.statusCode == 200) {
          final decoded = json.decode(response.body);
          final candidates = decoded['candidates'] as List?;
          if (candidates != null && candidates.isNotEmpty) {
            final parts = candidates[0]['content']?['parts'] as List?;
            if (parts != null && parts.isNotEmpty) {
              Uint8List? illustrationBytes;
              String combinedText = '';

              for (final p in parts) {
                if (p is Map) {
                  if (p.containsKey('inlineData')) {
                    final b64 = p['inlineData']?['data'] as String?;
                    if (b64 != null && b64.isNotEmpty) {
                      try {
                        illustrationBytes = base64Decode(b64);
                      } catch (e) {
                        debugPrint('Failed to decode inlineData: $e');
                      }
                    }
                  }
                  if (p.containsKey('text')) {
                    combinedText += '${p['text']}\n';
                  }
                }
              }

              // Parse JSON metadata from text
              Map<String, dynamic> data = {};
              final jsonMatch = RegExp(r'```(?:json)?\s*(\{.*?\})\s*```', dotAll: true).firstMatch(combinedText);
              if (jsonMatch != null) {
                try {
                  data = json.decode(jsonMatch.group(1)!);
                } catch (e) {
                  debugPrint('JSON decode from image model text failed: $e');
                }
              } else {
                try {
                  final clean = _cleanJsonString(combinedText);
                  if (clean.startsWith('{') && clean.endsWith('}')) {
                    data = json.decode(clean);
                  }
                } catch (_) {}
              }

              PosterStyleType style = PosterStyleType.editorial;
              final styleStr = data['suggested_style']?.toString().toLowerCase();
              if (styleStr == 'moderncyber' || styleStr == 'modern_cyber') {
                style = PosterStyleType.modernCyber;
              } else if (styleStr == 'boldsocial' || styleStr == 'bold_social') {
                style = PosterStyleType.boldSocial;
              } else if (styleStr == 'minimalist') {
                style = PosterStyleType.minimalist;
              }

              final headline = data['adapted_headline'] ?? data['original_headline'] ?? 'Visual Infographic Poster';
              final searchQ = data['digital_link_query'] ?? headline;

              return GeminiAnalysisResult(
                originalHeadline: data['original_headline'] ?? 'Physical Print Article',
                publicationName: data['publication_name'] ?? 'Print Publication',
                adaptedHeadline: headline,
                hook: data['hook'] ?? 'A physical print story distilled into visual poster art.',
                summary: data['summary'] ?? 'Summary synthesized from physical print clipping.',
                whyItMatters: data['why_it_matters'],
                keyTakeaways: (data['key_takeaways'] as List?)
                        ?.map((e) => e.toString())
                        .toList() ??
                    ['High-signal insight from physical print'],
                pullQuote: data['pull_quote'] ?? 'A memorable story from print.',
                keyMetric: data['key_metric'] ?? 'Report',
                categoryBadge: data['category_badge'] ?? 'DISCOVERY',
                digitalLink: data['digital_link'] ??
                    'https://news.google.com/search?q=${Uri.encodeComponent(searchQ)}',
                suggestedStyle: style,
                illustrationPrompt: prompt,
                generatedIllustrationBytes: illustrationBytes,
                visualArtRatio: visualArtRatio,
                infographicType: data['infographic_type']?.toString() ?? 'metric_spotlight',
                infographicStats: (data['infographic_stats'] as List?)
                        ?.map((e) => e.toString())
                        .toList() ??
                    [],
                visualMood: data['visual_mood']?.toString() ?? 'Infographic Poster Art',
                isDemoMode: false,
                rawGeminiResponse: combinedText,
              );
            }
          }
        }
      } catch (e) {
        debugPrint('Gemini image model $model error: $e');
      }
    }
    return null;
  }

  /// Generates visual AI illustration using Google Gemini Image API
  Future<Uint8List?> generatePosterIllustration({
    required String apiKey,
    required String prompt,
  }) async {
    for (final model in _candidateImageModels) {
      try {
        final uri = Uri.parse(
          'https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=$apiKey',
        );

        final requestBody = {
          "contents": [
            {
              "parts": [
                {
                  "text": "Generate a shareable, high-definition graphic design poster illustration: $prompt. Crisp visual metaphor, vibrant conceptual art, bold graphic icons, stunning color palette. Do NOT include small body paragraphs or fake text blocks."
                }
              ]
            }
          ]
        };

        final response = await http
            .post(
              uri,
              headers: {'Content-Type': 'application/json'},
              body: json.encode(requestBody),
            )
            .timeout(const Duration(seconds: 30));

        if (response.statusCode == 200) {
          final data = json.decode(response.body);
          final candidates = data['candidates'] as List?;
          if (candidates != null && candidates.isNotEmpty) {
            final parts = candidates[0]['content']?['parts'] as List?;
            if (parts != null) {
              for (final p in parts) {
                if (p is Map && p.containsKey('inlineData')) {
                  final b64 = p['inlineData']?['data'] as String?;
                  if (b64 != null && b64.isNotEmpty) {
                    return base64Decode(b64);
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        debugPrint('Image illustration generation attempt with $model failed: $e');
      }
    }
    return null;
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

  GeminiAnalysisResult _generateSmartDemoResult({
    required String targetAudience,
    required String tone,
    String? userContext,
    String? fallbackTitle,
    String? fallbackBody,
    double visualArtRatio = 0.6,
    String? errorMessage,
  }) {
    final title = fallbackTitle ?? 'Physical Newspaper Discovery';
    final hasContext = userContext != null && userContext.trim().isNotEmpty;

    String adaptedHeadline;
    String hook;
    String summary;
    String whyItMatters;
    List<String> takeaways;
    String pullQuote;
    String metric;
    String category = 'ANALYSIS';
    PosterStyleType style = PosterStyleType.editorial;

    if (targetAudience.contains('Tech')) {
      style = PosterStyleType.modernCyber;
      category = 'DEEP TECH';
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
    } else if (targetAudience.contains('Gen-Z') || targetAudience.contains('Social')) {
      style = PosterStyleType.boldSocial;
      category = 'TRENDING';
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
    } else if (targetAudience.contains('Exec') || targetAudience.contains('Business')) {
      style = PosterStyleType.minimalist;
      category = 'EXECUTIVE BRIEF';
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
    } else {
      style = PosterStyleType.editorial;
      category = targetAudience.length <= 16 ? targetAudience.toUpperCase() : 'CURATION';
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

    return GeminiAnalysisResult(
      originalHeadline: title,
      publicationName: 'The Morning Press Gazette',
      adaptedHeadline: adaptedHeadline,
      hook: hook,
      summary: summary,
      whyItMatters: whyItMatters,
      keyTakeaways: takeaways,
      pullQuote: pullQuote,
      receiptHighlightQuote: pullQuote,
      keyMetric: metric,
      categoryBadge: category,
      digitalLink: 'https://news.google.com/search?q=${Uri.encodeComponent(title)}',
      suggestedStyle: style,
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

    return GeminiAnalysisResult(
      originalHeadline: '$title: $angle',
      publicationName: '$title • $author',
      adaptedHeadline: adaptedHeadline,
      hook: hook,
      summary: summary,
      whyItMatters: whyItMatters,
      keyTakeaways: takeaways,
      pullQuote: pullQuote,
      receiptHighlightQuote: pullQuote,
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
}
