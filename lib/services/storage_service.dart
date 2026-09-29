import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/postcard_item.dart';
import '../models/poster_style_config.dart';
import 'editour_cloud_service.dart';

class StorageService {
  static const String _keyPostcards = 'postcard_items_v1';
  static const String _keyApiKey = 'gemini_api_key';
  static const String _keyCreatorHandle = 'creator_handle';
  static const String _keyInitialized = 'postcard_has_initialized_seed_v2';

  static final StorageService _instance = StorageService._internal();
  factory StorageService() => _instance;
  StorageService._internal();

  SharedPreferences? _prefs;
  File? _dataFile;

  Future<SharedPreferences> get prefs async {
    _prefs ??= await SharedPreferences.getInstance();
    return _prefs!;
  }

  Future<File> _getDataFile() async {
    if (_dataFile != null) return _dataFile!;
    final dir = await getApplicationDocumentsDirectory();
    _dataFile = File('${dir.path}/postcards_v2.json');
    return _dataFile!;
  }

  Future<void> init() async {
    try {
      final p = await prefs;
      // Clean up legacy heavy key from SharedPreferences if it exists
      if (p.containsKey(_keyPostcards)) {
        try {
          final legacyJson = p.getString(_keyPostcards);
          if (legacyJson != null && legacyJson.isNotEmpty) {
            final List<dynamic> list = json.decode(legacyJson);
            final items = list.map((item) => PostCardItem.fromMap(item as Map<String, dynamic>)).toList();
            await _saveItemsToFile(items);
          }
        } catch (_) {}
        await p.remove(_keyPostcards);
      }

      final hasInit = p.getBool(_keyInitialized) ?? false;
      final file = await _getDataFile();
      if (!hasInit || !await file.exists()) {
        await _seedDefaultPostCards();
        await p.setBool(_keyInitialized, true);
      }
    } catch (e) {
      debugPrint('StorageService init error: $e');
    }
  }

  Future<String?> getApiKey() async {
    try {
      final p = await prefs;
      final stored = p.getString(_keyApiKey);
      if (stored != null && stored.trim().isNotEmpty) {
        return stored.trim();
      }
    } catch (_) {}
    const envKey = String.fromEnvironment('GEMINI_API_KEY');
    if (envKey.isNotEmpty) return envKey;
    return null;
  }

  Future<void> setApiKey(String apiKey) async {
    try {
      final p = await prefs;
      await p.setString(_keyApiKey, apiKey.trim());
    } catch (_) {}
  }

  Future<String> getCreatorHandle() async {
    try {
      final p = await prefs;
      return p.getString(_keyCreatorHandle) ?? '@curator';
    } catch (_) {}
    return '@curator';
  }

  Future<void> setCreatorHandle(String handle) async {
    try {
      final p = await prefs;
      await p.setString(_keyCreatorHandle, handle.trim());
    } catch (_) {}
  }

  Future<List<PostCardItem>> getPostCards() async {
    try {
      final file = await _getDataFile();
      if (await file.exists()) {
        final content = await file.readAsString();
        if (content.trim().isNotEmpty) {
          final List<dynamic> list = json.decode(content);
          return list.map((item) => PostCardItem.fromMap(item as Map<String, dynamic>)).toList();
        }
      }
    } catch (e) {
      debugPrint('Error reading postcards data: $e');
    }
    return [];
  }

  Future<void> _saveItemsToFile(List<PostCardItem> items) async {
    try {
      final file = await _getDataFile();
      final encoded = json.encode(items.map((e) => e.toMap()).toList());
      await file.writeAsString(encoded, flush: true);
    } catch (e) {
      debugPrint('Error saving postcards to file: $e');
    }
  }

  Future<void> savePostCard(PostCardItem item) async {
    PostCardItem itemToPersist = item;

    // Offload heavy base64 strings to local disk files to keep JSON lean
    try {
      final dir = await getApplicationDocumentsDirectory();
      final mediaDir = Directory('${dir.path}/postcard_media');
      if (!await mediaDir.exists()) {
        await mediaDir.create(recursive: true);
      }

      if (item.illustrationBase64 != null && item.illustrationBase64!.length > 500) {
        final filePath = '${mediaDir.path}/illus_${item.id}.png';
        final file = File(filePath);
        await file.writeAsBytes(base64Decode(item.illustrationBase64!));
        itemToPersist = itemToPersist.copyWith(
          renderedPosterPath: filePath,
          illustrationBase64: null,
        );
      }

      if (item.bookCoverBase64 != null && item.bookCoverBase64!.length > 500) {
        final filePath = '${mediaDir.path}/cover_${item.id}.png';
        final file = File(filePath);
        await file.writeAsBytes(base64Decode(item.bookCoverBase64!));
        itemToPersist = itemToPersist.copyWith(
          bookCoverPhotoPath: filePath,
          bookCoverBase64: null,
        );
      }
    } catch (e) {
      debugPrint('Error offloading postcard media to disk: $e');
    }

    final current = await getPostCards();
    final index = current.indexWhere((element) => element.id == itemToPersist.id);
    if (index >= 0) {
      current[index] = itemToPersist;
    } else {
      current.insert(0, itemToPersist);
    }
    await _saveItemsToFile(current);
  }

  Future<void> deletePostCard(String id) async {
    final current = await getPostCards();
    current.removeWhere((item) => item.id == id);
    await _saveItemsToFile(current);

    // Clean up offloaded local media files if any
    try {
      final dir = await getApplicationDocumentsDirectory();
      final illusFile = File('${dir.path}/postcard_media/illus_$id.png');
      if (await illusFile.exists()) await illusFile.delete();
      final coverFile = File('${dir.path}/postcard_media/cover_$id.png');
      if (await coverFile.exists()) await coverFile.delete();
    } catch (_) {}

    // Immediately propagate deletion to Supabase / editour.app
    try {
      await EditourCloudService().deletePost(id);
    } catch (e) {
      debugPrint('Error deleting post from cloud in StorageService: $e');
    }
  }

  Future<void> _seedDefaultPostCards() async {
    final sampleItem1 = PostCardItem(
      id: 'sample-1',
      createdAt: DateTime.now().subtract(const Duration(hours: 3)),
      originalPhotoPath: 'sample_asset_print',
      originalHeadline: 'Commercial Quantum Computing Hits Milestone with Fault-Tolerant Qubits',
      publicationName: 'The Global Science Monitor',
      targetAudience: 'Tech Enthusiasts',
      tone: 'Deep-dive & Analytical',
      userContext: 'Explain computational implications for cryptography and materials discovery',
      adaptedHeadline: 'The 1,000-Qubit Breakthrough: Quantum Decoherence Conquered',
      hook: 'Researchers demonstrate 1,024 fault-tolerant qubits solving 8,000-year problems in 4 minutes.',
      summary: 'A consortium of physicists has breached the elusive fault-tolerance barrier with a 1,024-qubit array that actively corrects quantum drift. \n\nBy running pharmaceutical enzyme simulations in 240 seconds—work requiring millennia on top supercomputers—the timeline for practical molecular engineering just compressed exponentially.',
      keyTakeaways: [
        '1,024 logical fault-tolerant qubits operating below decoherence threshold',
        'Four-minute solve time for classical 8,000-year algorithmic calculations',
        'Direct early application targets antibiotic-resistant enzyme synthesis',
      ],
      pullQuote: 'Calculations that once demanded 8,000 supercomputer years resolved in under 240 seconds.',
      keyMetric: '1,024 Qubits',
      categoryBadge: 'DEEP TECH',
      digitalLink: 'https://news.google.com/search?q=fault+tolerant+quantum+computing',
      creatorOpinion: 'This is the inflection point we have been waiting for. When quantum simulation becomes commercial, drug discovery and battery materials will advance at software speeds.',
      creatorHandle: '@curator',
      posterStyle: PosterStyleType.modernCyber,
      visualArtRatio: 0.75,
      infographicStats: const ['1,024 Logical Qubits', '240s Molecular Solve', '8,000 Yr Classical Speedup'],
    );

    final sampleItem2 = PostCardItem(
      id: 'sample-2',
      createdAt: DateTime.now().subtract(const Duration(days: 1)),
      originalPhotoPath: 'sample_asset_print',
      originalHeadline: 'The Great Paper Revival: Why Print Subscriptions Surge Among Gen-Z Readers',
      publicationName: 'Sunday Herald Cultural Review',
      targetAudience: 'Gen-Z / Social',
      tone: 'Catchy & Punchy',
      userContext: 'Screen fatigue pushing tactile rituals',
      adaptedHeadline: 'Why the Dopamine-Tired Generation is Buying Physical Broadsheets Again',
      hook: 'Print newsstand sales jumped 34% as youth ditch endless algorithmic doomscrolling for ink on paper.',
      summary: 'In an ironic twist of digital culture, readers under 27 are snapping up physical newspapers on Sunday mornings. \n\nThe tactile crinkle of broadsheets and the feeling of having a finite edition that actually ends provides psychological calm that algorithmic feeds systematically destroy.',
      keyTakeaways: [
        'Print sales up 34% year-over-year in major metropolitan newsstands',
        'Gen-Z cites intentional reading & freedom from notifications as primary appeal',
        'Publishers responding with collectible formats and premium long-form typography',
      ],
      pullQuote: 'When you open a broadsheet with coffee, you regain control over your attention.',
      keyMetric: '+34% Sales',
      categoryBadge: 'CULTURE',
      digitalLink: 'https://news.google.com/search?q=newspaper+revival+among+young+readers',
      creatorOpinion: 'Reading physical paper changes your brain chemistry. There are no hyperlinks, no blue light, and no comment sections to argue in. Highly recommend turning your weekend paper read into a ritual.',
      creatorHandle: '@curator',
      posterStyle: PosterStyleType.editorial,
      visualArtRatio: 0.70,
      infographicStats: const ['+34% Print Growth', '18-27 Demographic', 'Finite Curated Edition'],
    );

    final sampleItem3 = PostCardItem(
      id: 'sample-book-1',
      createdAt: DateTime.now().subtract(const Duration(hours: 10)),
      originalPhotoPath: 'sample_asset_print',
      originalHeadline: 'Meditations: The Inner Citadel and Tranquility of Mind',
      publicationName: 'Meditations (Book IV)',
      sourceType: 'book_excerpt',
      bookTitle: 'Meditations',
      bookAuthor: 'Marcus Aurelius',
      curatorAngle: 'Stoic equanimity as an antidote to algorithmic anxiety',
      targetAudience: 'Reflective Readers',
      tone: 'Philosophical & Grounding',
      userContext: 'Stoic philosophy on maintaining inner fortress during chaotic days',
      adaptedHeadline: 'The Inner Citadel: Marcus Aurelius on Reclaiming Your Mind from Modern Noise',
      hook: 'Nowhere can man find a quieter or more untroubled retreat than in his own soul.',
      summary: 'Written in private military tents along the northern frontier of the Roman Empire, Marcus Aurelius penned reminders not for an audience, but to steady his own mind.\n\nHis timeless insight: You have power over your mind, not outside events. Realize this, and you will find strength. The sanctuary you seek is not in a distant vacation or unplugging for an hour—it is the deliberate cultivation of internal equanimity.',
      keyTakeaways: [
        'Tranquility is nothing else than the good ordering of the mind.',
        'External events cannot touch the soul without your consent or assent.',
        'Retreat into your inner citadel whenever the external world feels chaotic.',
      ],
      pullQuote: 'Dwell on the beauty of life. Watch the stars, and see yourself running with them.',
      keyMetric: 'Book IV, §3',
      categoryBadge: 'LITERATURE',
      whyItMatters: 'In an era of hyper-connected alert fatigue, ancient Stoic journaling reminds us that peace is an active practice of judgment filtering, not a passive escape.',
      creatorOpinion: 'Reading Marcus Aurelius feels like a conversation with someone who had the weight of the entire known world on his shoulders, yet chose calm reason every morning.',
      creatorHandle: '@bookcurator',
      posterStyle: PosterStyleType.editorial,
      visualArtRatio: 0.70,
      infographicStats: const ['Roman Stoicism', 'Private Journals', 'Inner Fortress'],
    );

    await _saveItemsToFile([sampleItem1, sampleItem2, sampleItem3]);
  }
}
