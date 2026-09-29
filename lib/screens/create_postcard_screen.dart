import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import 'package:uuid/uuid.dart';
import '../models/postcard_item.dart';
import '../models/poster_style_config.dart';
import '../models/sample_articles.dart';
import '../services/editour_cloud_service.dart';
import '../services/gemini_service.dart';
import '../services/link_scraper_service.dart';
import '../services/share_service.dart';
import '../services/storage_service.dart';
import '../widgets/audience_chip_selector.dart';
import '../widgets/book_cover_viewer_dialog.dart';
import '../widgets/photo_viewer_dialog.dart';
import '../widgets/poster_canvas.dart';
import '../widgets/carousel_slides/carousel_poster_studio.dart';
import 'postcard_detail_screen.dart';

enum InputSourceMode { physicalPhoto, digitalLink, bookExcerpt }

enum RegenerationTarget {
  all,
  hookPosterArt,
  headlineAndHook,
}

class CreatePostcardScreen extends StatefulWidget {
  final SampleArticle? preloadedSample;

  const CreatePostcardScreen({
    super.key,
    this.preloadedSample,
  });

  @override
  State<CreatePostcardScreen> createState() => _CreatePostcardScreenState();
}

class _CreatePostcardScreenState extends State<CreatePostcardScreen> {
  final ImagePicker _picker = ImagePicker();
  final GeminiService _geminiService = GeminiService();
  final StorageService _storageService = StorageService();
  final ShareService _shareService = ShareService();
  final LinkScraperService _linkScraperService = LinkScraperService();
  final GlobalKey _posterBoundaryKey = GlobalKey();

  InputSourceMode _sourceMode = InputSourceMode.physicalPhoto;

  // Digital Link Fields
  final TextEditingController _urlController = TextEditingController();
  final TextEditingController _digitalTitleController = TextEditingController();
  final TextEditingController _digitalContentController = TextEditingController();
  String? _scrapedSiteName;
  bool _isFetchingUrl = false;
  ScrapedArticle? _scrapedArticle;

  // Physical Photo Fields
  XFile? _selectedImage;
  String? _originalImagePath;
  bool _isCropped = false;
  Uint8List? _imageBytes;
  int _imageRotationTurns = 0;
  SampleArticle? _activeSample;

  // Book Reading & Excerpt Fields
  final TextEditingController _bookTitleController = TextEditingController();
  final TextEditingController _bookAuthorController = TextEditingController();
  final TextEditingController _curatorAngleController = TextEditingController();
  final TextEditingController _bookExcerptTextController = TextEditingController();
  XFile? _bookCoverImage;
  Uint8List? _bookCoverBytes;
  String? _bookCoverPath;
  final List<XFile> _bookExcerptImages = [];
  final List<Uint8List> _bookExcerptBytes = [];

  static const List<Map<String, String>> sampleBooks = [
    {
      'id': 'meditations',
      'title': 'Meditations',
      'author': 'Marcus Aurelius',
      'angle': 'The unshakeable citadel within; outer chaos cannot touch inner peace without consent',
      'excerpt': 'You have power over your mind—not outside events. Realize this, and you will find strength. Never let the future disturb you; you will meet it with the same weapons of reason that arm you against the present.',
      'audience': 'General Public',
      'tone': 'Thought-provoking & Story-driven',
    },
    {
      'id': 'midnight_library',
      'title': 'The Midnight Library',
      'author': 'Matt Haig',
      'angle': 'Dissolving the phantom ache of unlived lives; loving our singular messy existence',
      'excerpt': 'Between life and death there is a library, and within that library, the shelves go on forever. Every book provides a chance to try another life you could have lived... to realize the only life that matters is the one you are living now.',
      'audience': 'Young Adults / Gen-Z',
      'tone': 'Emotional & Poetic',
    },
    {
      'id': 'letters_rilke',
      'title': 'Letters to a Young Poet',
      'author': 'Rainer Maria Rilke',
      'angle': 'Loving the unanswered questions; trusting the slow ripening of the soul',
      'excerpt': 'Be patient toward all that is unsolved in your heart and try to love the questions themselves, like locked rooms and like books that are now written in a very foreign tongue. Live the questions now. Perhaps then, someday far in the future, you will gradually, without even noticing it, live along some distant day into the answer.',
      'audience': 'Creative Minds',
      'tone': 'Contemplative & Elegant',
    },
  ];

  String _targetAudience = 'Tech Enthusiasts';
  String _selectedTone = 'Deep-dive & Analytical';
  final TextEditingController _contextController = TextEditingController();
  final TextEditingController _hookCuesController = TextEditingController();
  final TextEditingController _opinionController = TextEditingController();
  final TextEditingController _linkController = TextEditingController();
  final TextEditingController _headlineController = TextEditingController();
  final TextEditingController _quoteController = TextEditingController();
  final TextEditingController _metricController = TextEditingController();
  final TextEditingController _creatorHandleController = TextEditingController();
  final TextEditingController _receiptQuoteController = TextEditingController();
  String _selectedPostFormat = 'editorial_briefing'; // 'editorial_briefing' | 'carousel_trio'

  bool _isAnalyzing = false;
  String _analysisStatus = '';
  PostCardItem? _generatedItem;
  int _regenerationCount = 0;
  PosterStyleType _currentStyle = PosterStyleType.editorial;
  double _visualArtRatio = 0.65;

  String _getArtRatioDescription(double ratio) {
    final pct = (ratio * 100).round();
    if (pct >= 75) {
      return '🎨 $pct% Art Focus: Hero picture artwork & visual infographics with punchy typography overlays.';
    } else if (pct >= 45) {
      return '📊 $pct% Balanced: 50/50 split between visual art/infographics and curated editorial takeaways.';
    } else {
      return '📰 $pct% Editorial: Comprehensive text breakdown with an artistic masthead and metric callouts.';
    }
  }

  @override
  void initState() {
    super.initState();
    if (_sourceMode == InputSourceMode.bookExcerpt) {
      _sourceMode = InputSourceMode.physicalPhoto;
    }
    _loadCreatorHandle();
    if (widget.preloadedSample != null) {
      _applySample(widget.preloadedSample!);
    }
  }

  @override
  void dispose() {
    _urlController.dispose();
    _digitalTitleController.dispose();
    _digitalContentController.dispose();
    _bookTitleController.dispose();
    _bookAuthorController.dispose();
    _curatorAngleController.dispose();
    _bookExcerptTextController.dispose();
    _contextController.dispose();
    _hookCuesController.dispose();
    _opinionController.dispose();
    _linkController.dispose();
    _headlineController.dispose();
    _quoteController.dispose();
    _metricController.dispose();
    _creatorHandleController.dispose();
    _receiptQuoteController.dispose();
    super.dispose();
  }

  Future<void> _loadCreatorHandle() async {
    final handle = await _storageService.getCreatorHandle();
    _creatorHandleController.text = handle;
  }

  void _applySample(SampleArticle sample) {
    setState(() {
      _activeSample = sample;
      _selectedImage = null;
      _originalImagePath = null;
      _isCropped = false;
      _targetAudience = sample.suggestedAudience;
      _selectedTone = sample.suggestedTone;
      _contextController.text = sample.defaultContext;
      _hookCuesController.clear();
      _linkController.text = sample.webLink;
      _regenerationCount = 0;
    });
  }

  Future<void> _pickImage(ImageSource source) async {
    try {
      final picked = await _picker.pickImage(
        source: source,
        maxWidth: 2400,
        maxHeight: 2400,
        imageQuality: 92,
      );
      if (picked != null) {
        _originalImagePath = picked.path;
        final bytes = await picked.readAsBytes();
        setState(() {
          _selectedImage = picked;
          _imageBytes = bytes;
          _imageRotationTurns = 0;
          _activeSample = null;
          _isCropped = false;
          _regenerationCount = 0;
        });

        // Launch cropping tool to cut out the exact article section
        await _cropImage(sourcePath: picked.path);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to pick photo: $e')),
        );
      }
    }
  }

  Future<void> _cropImage({String? sourcePath}) async {
    final pathToCrop = sourcePath ?? _originalImagePath ?? _selectedImage?.path;
    if (pathToCrop == null) return;

    try {
      final croppedFile = await ImageCropper().cropImage(
        sourcePath: pathToCrop,
        compressFormat: ImageCompressFormat.jpg,
        compressQuality: 92,
        uiSettings: [
          AndroidUiSettings(
            toolbarTitle: 'Cut Out Article Section',
            toolbarColor: const Color(0xFF0F172A),
            toolbarWidgetColor: Colors.white,
            activeControlsWidgetColor: const Color(0xFF6366F1),
            initAspectRatio: CropAspectRatioPreset.original,
            lockAspectRatio: false,
            showCropGrid: true,
            cropFrameColor: const Color(0xFF6366F1),
            cropGridColor: Colors.white70,
            aspectRatioPresets: const [
              CropAspectRatioPreset.original,
              CropAspectRatioPreset.square,
              CropAspectRatioPreset.ratio3x2,
              CropAspectRatioPreset.ratio4x3,
              CropAspectRatioPreset.ratio16x9,
            ],
          ),
          IOSUiSettings(
            title: 'Cut Out Article Section',
            aspectRatioLockEnabled: false,
            resetAspectRatioEnabled: true,
          ),
        ],
      );

      if (croppedFile != null) {
        final bytes = await croppedFile.readAsBytes();
        if (mounted) {
          setState(() {
            _selectedImage = XFile(croppedFile.path);
            _imageBytes = bytes;
            _imageRotationTurns = 0;
            _isCropped = true;
          });
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('✂️ Article section cut out successfully! Ready to summarize.'),
              duration: Duration(seconds: 3),
              backgroundColor: Color(0xFF0F172A),
            ),
          );
        }
      }
    } catch (e) {
      debugPrint('Error cropping image: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Cropping error: $e')),
        );
      }
    }
  }

  Future<void> _resetToOriginalImage() async {
    if (_originalImagePath == null) return;
    try {
      final file = File(_originalImagePath!);
      if (await file.exists()) {
        final bytes = await file.readAsBytes();
        if (mounted) {
          setState(() {
            _selectedImage = XFile(_originalImagePath!);
            _imageBytes = bytes;
            _imageRotationTurns = 0;
            _isCropped = false;
          });
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Restored full uncropped photo'),
              duration: Duration(seconds: 2),
            ),
          );
        }
      }
    } catch (e) {
      debugPrint('Error restoring original photo: $e');
    }
  }

  Future<void> _fetchUrlArticle([String? overrideUrl]) async {
    final targetUrl = overrideUrl ?? _urlController.text.trim();
    if (targetUrl.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter or paste a valid web article link')),
      );
      return;
    }

    setState(() {
      _isFetchingUrl = true;
    });

    try {
      final result = await _linkScraperService.scrapeArticle(targetUrl);
      if (mounted) {
        setState(() {
          _isFetchingUrl = false;
          _scrapedArticle = result;
          _urlController.text = result.url;
          _scrapedSiteName = result.siteName;
          if (result.title.isNotEmpty) {
            _digitalTitleController.text = result.title;
          }
          if (result.content.isNotEmpty) {
            _digitalContentController.text = result.content;
          }
        });

        if (result.isSuccess) {
          final isNotice = result.errorMessage != null && result.errorMessage!.contains('Notice:');
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(isNotice ? 'ℹ️ ${result.errorMessage}' : '✅ Fetched article from ${result.siteName}!'),
              backgroundColor: isNotice ? const Color(0xFF0284C7) : const Color(0xFF0F172A),
              duration: Duration(seconds: isNotice ? 4 : 2),
            ),
          );
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('⚠️ ${result.errorMessage ?? "Could not fully fetch article. You can type or edit the headline below."}'),
              backgroundColor: Colors.orange.shade800,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isFetchingUrl = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to fetch link: $e')),
        );
      }
    }
  }

  Future<void> _pickBookCoverImage(ImageSource source) async {
    try {
      final XFile? image = await _picker.pickImage(
        source: source,
        imageQuality: 88,
      );
      if (image != null) {
        final bytes = await image.readAsBytes();
        setState(() {
          _bookCoverImage = image;
          _bookCoverBytes = bytes;
          _bookCoverPath = image.path;
        });
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('📖 Book cover page identified successfully!'),
              backgroundColor: Color(0xFF1E293B),
              duration: Duration(seconds: 2),
            ),
          );
        }
      }
    } catch (e) {
      debugPrint('Error picking book cover: $e');
    }
  }

  Future<void> _addBookExcerptPage(ImageSource source) async {
    try {
      if (source == ImageSource.gallery) {
        final List<XFile> images = await _picker.pickMultiImage(
          imageQuality: 88,
        );
        if (images.isNotEmpty) {
          final List<Uint8List> newBytes = [];
          for (final img in images) {
            newBytes.add(await img.readAsBytes());
          }
          setState(() {
            _bookExcerptImages.addAll(images);
            _bookExcerptBytes.addAll(newBytes);
          });
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('📄 Added ${images.length} excerpt page photo(s)!'),
                backgroundColor: const Color(0xFF1E293B),
                duration: const Duration(seconds: 2),
              ),
            );
          }
        }
      } else {
        final XFile? image = await _picker.pickImage(
          source: ImageSource.camera,
          imageQuality: 88,
        );
        if (image != null) {
          final bytes = await image.readAsBytes();
          setState(() {
            _bookExcerptImages.add(image);
            _bookExcerptBytes.add(bytes);
          });
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('📄 Added Excerpt Page #${_bookExcerptImages.length}!'),
                backgroundColor: const Color(0xFF1E293B),
                duration: const Duration(seconds: 2),
              ),
            );
          }
        }
      }
    } catch (e) {
      debugPrint('Error picking excerpt page: $e');
    }
  }

  void _removeBookExcerptPage(int index) {
    if (index >= 0 && index < _bookExcerptImages.length) {
      setState(() {
        _bookExcerptImages.removeAt(index);
        if (index < _bookExcerptBytes.length) {
          _bookExcerptBytes.removeAt(index);
        }
      });
    }
  }

  void _applySampleBook(Map<String, String> sample) {
    setState(() {
      _bookTitleController.text = sample['title'] ?? '';
      _bookAuthorController.text = sample['author'] ?? '';
      _curatorAngleController.text = sample['angle'] ?? '';
      _bookExcerptTextController.text = sample['excerpt'] ?? '';
      _targetAudience = sample['audience'] ?? _targetAudience;
      _selectedTone = sample['tone'] ?? _selectedTone;
      _bookCoverPath = 'sample_book_cover_${sample['id']}';
      _bookCoverImage = null;
      _bookCoverBytes = null;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Loaded book excerpt: ${sample['title']} by ${sample['author']}'),
        duration: const Duration(seconds: 2),
        backgroundColor: Colors.amber.shade900,
      ),
    );
  }

  void _applySampleDigitalLink(Map<String, String> sample) {
    setState(() {
      _urlController.text = sample['url'] ?? '';
      _digitalTitleController.text = sample['title'] ?? '';
      _digitalContentController.text = sample['content'] ?? '';
      _scrapedSiteName = sample['site'] ?? 'Web Source';
      _targetAudience = sample['audience'] ?? _targetAudience;
      _selectedTone = sample['tone'] ?? _selectedTone;
      _scrapedArticle = ScrapedArticle(
        url: sample['url'] ?? '',
        title: sample['title'] ?? '',
        siteName: sample['site'] ?? 'Web Source',
        description: sample['description'] ?? '',
        content: sample['content'] ?? '',
      );
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Loaded sample: ${sample['title']}'),
        duration: const Duration(seconds: 2),
        backgroundColor: const Color(0xFF0284C7),
      ),
    );
  }

  Future<void> _runAnalysis({RegenerationTarget target = RegenerationTarget.all}) async {
    if (target == RegenerationTarget.hookPosterArt) {
      await _regenerateHookPosterOnly();
      return;
    }

    if (_sourceMode == InputSourceMode.physicalPhoto) {
      if (_selectedImage == null && _activeSample == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Please snap or select a physical newspaper/magazine photo first'),
            backgroundColor: Colors.orange,
          ),
        );
        return;
      }
    } else if (_sourceMode == InputSourceMode.digitalLink) {
      final url = _urlController.text.trim();
      final title = _digitalTitleController.text.trim();
      final content = _digitalContentController.text.trim();
      if (url.isEmpty && title.isEmpty && content.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Please paste a news link or article headline to summarize'),
            backgroundColor: Colors.orange,
          ),
        );
        return;
      }
    } else {
      // Book Excerpt mode validation
      final bTitle = _bookTitleController.text.trim();
      final bAuthor = _bookAuthorController.text.trim();
      final excerptNotes = _bookExcerptTextController.text.trim();
      if (bTitle.isEmpty &&
          bAuthor.isEmpty &&
          excerptNotes.isEmpty &&
          _bookExcerptImages.isEmpty &&
          _bookCoverImage == null &&
          _bookCoverPath == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Please attach excerpt page photos or select a sample book reading'),
            backgroundColor: Colors.orange,
          ),
        );
        return;
      }
    }

    final isRegenerating = _generatedItem != null;
    if (isRegenerating) {
      _regenerationCount++;
    }

    final isHeadlineOnly = target == RegenerationTarget.headlineAndHook;

    setState(() {
      _isAnalyzing = true;
      _analysisStatus = isHeadlineOnly
          ? 'Synthesizing fresh bold headline & curated takes (Attempt #$_regenerationCount)...'
          : (isRegenerating
              ? 'Exploring new creative angle & fresh visual artwork (Attempt #$_regenerationCount)...'
              : (_sourceMode == InputSourceMode.physicalPhoto
                  ? 'Scanning physical print typography & OCR...'
                  : (_sourceMode == InputSourceMode.digitalLink
                      ? 'Extracting digital article context & key themes...'
                      : 'Reading excerpt pages & synthesizing Curator\'s emotional angle...')));
    });

    try {
      GeminiAnalysisResult result;

      if (_sourceMode == InputSourceMode.physicalPhoto) {
        Uint8List bytesToAnalyze;
        if (_imageBytes != null) {
          bytesToAnalyze = _imageBytes!;
        } else {
          // Mock bytes for sample article
          bytesToAnalyze = Uint8List.fromList(List.generate(64, (i) => i));
        }

        await Future.delayed(const Duration(milliseconds: 600));
        if (mounted) {
          setState(() {
            _analysisStatus = 'Distilling core story for "$_targetAudience"...';
          });
        }

        result = await _geminiService.analyzeAndSummarizeArticleWithWebMatchFirst(
          imageBytes: bytesToAnalyze,
          targetAudience: _targetAudience,
          tone: _selectedTone,
          userContext: _contextController.text.trim().isNotEmpty
              ? _contextController.text.trim()
              : null,
          hookCues: _hookCuesController.text.trim().isNotEmpty
              ? _hookCuesController.text.trim()
              : null,
          fallbackTitle: _activeSample?.title,
          fallbackBody: _activeSample?.rawArticleText,
          visualArtRatio: _visualArtRatio,
          existingItem: _generatedItem,
          regenerationIteration: _regenerationCount,
          skipImageGeneration: isHeadlineOnly,
          onProgressUpdate: (msg) {
            if (mounted) {
              setState(() {
                _analysisStatus = msg;
              });
            }
          },
        );
      } else if (_sourceMode == InputSourceMode.digitalLink) {
        // Digital Link pipeline
        String articleUrl = _urlController.text.trim();
        String articleTitle = _digitalTitleController.text.trim();
        String articleBody = _digitalContentController.text.trim();

        if (articleBody.isEmpty && articleUrl.isNotEmpty) {
          if (mounted) {
            setState(() {
              _analysisStatus = 'Fetching full web article from $articleUrl...';
            });
          }
          final scraped = await _linkScraperService.scrapeArticle(articleUrl);
          if (scraped.title.isNotEmpty && articleTitle.isEmpty) {
            articleTitle = scraped.title;
          }
          if (scraped.content.isNotEmpty) {
            articleBody = scraped.content;
          }
          _scrapedSiteName = scraped.siteName;
        }

        if (articleTitle.isEmpty && articleUrl.isNotEmpty) {
          articleTitle = 'Digital News Story';
        }

        if (mounted) {
          setState(() {
            _analysisStatus = 'Synthesizing story & insights for "$_targetAudience"...';
          });
        }

        result = await _geminiService.analyzeAndSummarizeDigitalArticle(
          articleUrl: articleUrl.isNotEmpty ? articleUrl : 'https://news.google.com',
          articleTitle: articleTitle,
          articleBody: articleBody.isNotEmpty ? articleBody : articleTitle,
          publicationName: _scrapedSiteName,
          targetAudience: _targetAudience,
          tone: _selectedTone,
          userContext: _contextController.text.trim().isNotEmpty
              ? _contextController.text.trim()
              : null,
          hookCues: _hookCuesController.text.trim().isNotEmpty
              ? _hookCuesController.text.trim()
              : null,
          visualArtRatio: _visualArtRatio,
          existingItem: _generatedItem,
          regenerationIteration: _regenerationCount,
          skipImageGeneration: isHeadlineOnly,
        );
      } else {
        // Book Excerpt pipeline
        final bTitle = _bookTitleController.text.trim();
        final bAuthor = _bookAuthorController.text.trim();
        final cAngle = _curatorAngleController.text.trim();
        final excerptNotes = _bookExcerptTextController.text.trim();

        if (mounted) {
          setState(() {
            _analysisStatus = 'Distilling excerpt emotion & reflections for "$_targetAudience"...';
          });
        }

        result = await _geminiService.analyzeAndSummarizeBookExcerpt(
          excerptPageImages: _bookExcerptBytes,
          bookCoverImage: _bookCoverBytes,
          bookTitle: bTitle.isNotEmpty ? bTitle : 'Book Reading',
          bookAuthor: bAuthor.isNotEmpty ? bAuthor : 'Curated Author',
          curatorAngle: cAngle.isNotEmpty ? cAngle : 'Profound literary reflection',
          userExcerptText: excerptNotes.isNotEmpty ? excerptNotes : null,
          targetAudience: _targetAudience,
          tone: _selectedTone,
          visualArtRatio: _visualArtRatio,
        );
      }

      if (mounted) {
        setState(() {
          _analysisStatus = 'Composing high-impact visual poster card...';
        });
      }

      String? illustrationB64 = isHeadlineOnly ? _generatedItem?.illustrationBase64 : null;
      String? savedPosterPath = isHeadlineOnly ? _generatedItem?.renderedPosterPath : null;
      final itemId = const Uuid().v4();
      if (!isHeadlineOnly && result.generatedIllustrationBytes != null) {
        illustrationB64 = base64Encode(result.generatedIllustrationBytes!);
        savedPosterPath = await _shareService.savePosterToFile(
          result.generatedIllustrationBytes!,
          itemId,
        );
      }

      final isLink = _sourceMode == InputSourceMode.digitalLink;
      final isBook = _sourceMode == InputSourceMode.bookExcerpt;
      final digitalUrl = isBook
          ? null
          : (isLink
              ? (_urlController.text.trim().isNotEmpty ? _urlController.text.trim() : result.digitalLink)
              : (_linkController.text.trim().isNotEmpty ? _linkController.text.trim() : null));

      final newItem = PostCardItem(
        id: itemId,
        createdAt: DateTime.now(),
        originalPhotoPath: isBook
            ? (_bookCoverPath ?? _bookCoverImage?.path ?? (_bookExcerptImages.isNotEmpty ? _bookExcerptImages.first.path : 'sample_book_reading'))
            : (isLink
                ? (_urlController.text.trim().isNotEmpty ? _urlController.text.trim() : 'digital_article_link')
                : (_selectedImage?.path ?? 'sample_asset_print')),
        renderedPosterPath: savedPosterPath,
        originalHeadline: isBook
            ? (_bookTitleController.text.trim().isNotEmpty ? _bookTitleController.text.trim() : result.originalHeadline)
            : result.originalHeadline,
        publicationName: isBook
            ? '${_bookTitleController.text.trim().isNotEmpty ? _bookTitleController.text.trim() : "Book"} • ${_bookAuthorController.text.trim().isNotEmpty ? _bookAuthorController.text.trim() : "Author"}'
            : (isLink
                ? (_scrapedSiteName ?? result.publicationName)
                : (_activeSample?.publication ?? result.publicationName)),
        targetAudience: _targetAudience,
        tone: _selectedTone,
        userContext: isBook
            ? (_curatorAngleController.text.trim().isNotEmpty ? _curatorAngleController.text.trim() : 'Curator Reflection')
            : (_contextController.text.trim().isNotEmpty ? _contextController.text.trim() : null),
        hookCues: _hookCuesController.text.trim().isNotEmpty
            ? _hookCuesController.text.trim()
            : null,
        adaptedHeadline: result.adaptedHeadline,
        hook: result.hook,
        summary: result.summary,
        whyItMatters: result.whyItMatters,
        keyTakeaways: result.keyTakeaways,
        pullQuote: result.pullQuote.trim().isNotEmpty
            ? result.pullQuote
            : _activeSample?.pullQuote,
        keyMetric: result.keyMetric.trim().isNotEmpty
            ? result.keyMetric
            : _activeSample?.metric,
        categoryBadge: isBook
            ? 'LITERARY EXCERPT'
            : (result.categoryBadge.trim().isNotEmpty
                ? result.categoryBadge
                : (_activeSample?.category ?? 'CURATED DIGEST')),
        digitalLink: digitalUrl,
        creatorOpinion: _opinionController.text.trim().isNotEmpty
            ? _opinionController.text.trim()
            : (_curatorAngleController.text.trim().isNotEmpty
                ? _curatorAngleController.text.trim()
                : null),
        creatorHandle: _creatorHandleController.text.trim().isNotEmpty
            ? _creatorHandleController.text.trim()
            : '@curator',
        posterStyle: isHeadlineOnly ? (_generatedItem?.posterStyle ?? result.suggestedStyle) : result.suggestedStyle,
        illustrationPrompt: isHeadlineOnly ? _generatedItem?.illustrationPrompt : result.illustrationPrompt,
        illustrationBase64: illustrationB64,
        visualArtRatio: _visualArtRatio,
        infographicType: result.infographicType,
        infographicStats: result.infographicStats,
        visualMood: result.visualMood,
        isUserCreated: true,
        sourceType: isBook ? 'book_excerpt' : (isLink ? 'digital_link' : 'photo'),
        bookCoverPhotoPath: _bookCoverPath ?? _bookCoverImage?.path,
        bookExcerptPhotoPaths: _bookExcerptImages.map((f) => f.path).toList(),
        bookTitle: _bookTitleController.text.trim().isNotEmpty ? _bookTitleController.text.trim() : result.originalHeadline,
        bookAuthor: _bookAuthorController.text.trim().isNotEmpty ? _bookAuthorController.text.trim() : 'Curated Author',
        postFormat: _selectedPostFormat,
        receiptHighlightQuote: result.receiptHighlightQuote ?? result.pullQuote,
        articleExcerpts: result.articleExcerpts.isNotEmpty
            ? result.articleExcerpts
            : ((_activeSample != null && _activeSample!.rawArticleText.trim().isNotEmpty)
                ? _activeSample!.rawArticleText
                    .trim()
                    .split(RegExp(r'\n\s*\n'))
                    .map((p) => p.trim())
                    .where((p) => p.length > 25)
                    .take(3)
                    .toList()
                : result.articleExcerpts),
        curatorIllustrationPrompt: result.curatorIllustrationPrompt,
        curatorIllustrationBase64: result.generatedCuratorIllustrationBytes != null
            ? base64Encode(result.generatedCuratorIllustrationBytes!)
            : null,
      );

      _headlineController.text = newItem.adaptedHeadline;
      _quoteController.text = newItem.pullQuote ?? '';
      _receiptQuoteController.text = newItem.receiptHighlightQuote ?? '';
      _metricController.text = newItem.keyMetric ?? '';
      _linkController.text = newItem.digitalLink ?? '';
      if ((isRegenerating || _opinionController.text.trim().isEmpty) &&
          newItem.creatorOpinion != null &&
          newItem.creatorOpinion!.isNotEmpty) {
        _opinionController.text = newItem.creatorOpinion!;
      }

      setState(() {
        _generatedItem = newItem;
        _currentStyle = newItem.posterStyle;
        _isAnalyzing = false;
      });

      if (result.isDemoMode && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              result.errorMessage != null
                  ? '⚠️ Demo Mode: ${result.errorMessage}'
                  : '✨ PostCard generated using Smart Demo. Add your Gemini API Key in Settings for live extraction!',
            ),
            backgroundColor: Colors.orange.shade800,
            duration: const Duration(seconds: 5),
            action: SnackBarAction(
              label: 'OK',
              textColor: Colors.white,
              onPressed: () {},
            ),
          ),
        );
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              isHeadlineOnly
                  ? '✍️ New bold headline & editorial hook synthesized!'
                  : '✨ Gemini Multimodal AI successfully analyzed print & crafted poster!',
            ),
            backgroundColor: Colors.green,
            duration: const Duration(seconds: 4),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isAnalyzing = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Generation failed: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  Future<void> _regenerateHookPosterOnly() async {
    if (_generatedItem == null || _isAnalyzing) return;

    setState(() {
      _isAnalyzing = true;
      _regenerationCount++;
      _analysisStatus =
          'Generating diverse visual artwork (Attempt #$_regenerationCount)...';
    });

    try {
      final artResult = await _geminiService.regenerateHookPosterArt(
        headline: _headlineController.text.trim().isNotEmpty
            ? _headlineController.text.trim()
            : _generatedItem!.adaptedHeadline,
        userContext: _contextController.text.trim().isNotEmpty
            ? _contextController.text.trim()
            : _generatedItem!.userContext,
        hookCues: _hookCuesController.text.trim().isNotEmpty
            ? _hookCuesController.text.trim()
            : _generatedItem!.hookCues,
        targetAudience: _targetAudience,
        tone: _selectedTone,
        iteration: _regenerationCount,
        currentStyle: _currentStyle,
      );

      final Uint8List? newArtBytes = artResult['bytes'] as Uint8List?;
      final String? newPrompt = artResult['prompt'] as String?;
      final PosterStyleType? nextStyle = artResult['suggestedStyle'] as PosterStyleType?;

      if (newArtBytes != null) {
        final b64 = base64Encode(newArtBytes);
        final itemId = _generatedItem!.id;
        final savedPath = await _shareService.savePosterToFile(newArtBytes, itemId);

        final updatedItem = _generatedItem!.copyWith(
          illustrationBase64: b64,
          renderedPosterPath: savedPath,
          illustrationPrompt: newPrompt ?? _generatedItem!.illustrationPrompt,
          posterStyle: nextStyle ?? _generatedItem!.posterStyle,
        );
        await _storageService.savePostCard(updatedItem);
        EditourCloudService().publishPost(updatedItem);

        if (mounted) {
          setState(() {
            _generatedItem = updatedItem;
            if (nextStyle != null) {
              _currentStyle = nextStyle;
            }
            _isAnalyzing = false;
          });

          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('🎨 Fresh Curated Hook Poster artwork generated & saved!'),
              backgroundColor: Colors.green,
              duration: Duration(seconds: 3),
            ),
          );
        }
      } else {
        if (mounted) {
          setState(() {
            _isAnalyzing = false;
          });
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('⚠️ Could not generate alternate artwork right now. Please try again.'),
              backgroundColor: Colors.orange,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isAnalyzing = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Art generation error: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  void _showRegenerationOptionsSheet() {
    if (_isAnalyzing) return;
    final isCarousel = _selectedPostFormat == 'carousel_trio';

    showModalBottomSheet(
      context: context,
      backgroundColor: Theme.of(context).colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.grey.withValues(alpha: 0.4),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.primaryContainer,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(
                        Icons.auto_awesome,
                        size: 20,
                        color: Theme.of(context).colorScheme.onPrimaryContainer,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'What would you like to re-generate?',
                            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.bold,
                                ),
                          ),
                          Text(
                            'Select which part of your curation to refresh',
                            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                                ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                _buildRegenChoiceCard(
                  context: ctx,
                  icon: Icons.palette_rounded,
                  iconColor: Colors.deepPurple,
                  title: isCarousel ? 'Hook Poster Artwork (Slide 1)' : 'Poster Visual Artwork',
                  description:
                      'Generates a new conceptual visual considering your curated angle while keeping current headline & text intact.',
                  badge: 'Visual Only',
                  onTap: () {
                    Navigator.pop(ctx);
                    _regenerateHookPosterOnly();
                  },
                ),
                const SizedBox(height: 10),
                _buildRegenChoiceCard(
                  context: ctx,
                  icon: Icons.edit_note_rounded,
                  iconColor: Colors.blueAccent,
                  title: isCarousel ? 'Headline & Editorial Copy' : 'Headline & Summary Copy',
                  description:
                      'Re-crafts the adapted headline, hook, and curated takes while preserving the current artwork.',
                  badge: 'Copy Only',
                  onTap: () {
                    Navigator.pop(ctx);
                    _runAnalysis(target: RegenerationTarget.headlineAndHook);
                  },
                ),
                const SizedBox(height: 10),
                _buildRegenChoiceCard(
                  context: ctx,
                  icon: Icons.refresh_rounded,
                  iconColor: Colors.amber.shade800,
                  title: isCarousel ? 'Entire Carousel Trio' : 'Entire Poster & Synthesis',
                  description:
                      'Re-analyzes and regenerates fresh visuals, a new headline, and all takes from scratch.',
                  badge: 'Full Refresh',
                  onTap: () {
                    Navigator.pop(ctx);
                    _runAnalysis(target: RegenerationTarget.all);
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildRegenChoiceCard({
    required BuildContext context,
    required IconData icon,
    required Color iconColor,
    required String title,
    required String description,
    required String badge,
    required VoidCallback onTap,
  }) {
    final theme = Theme.of(context);
    return Material(
      color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                margin: const EdgeInsets.only(top: 2),
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: iconColor.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, size: 18, color: iconColor),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                          decoration: BoxDecoration(
                            color: iconColor.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            badge,
                            style: TextStyle(
                              color: iconColor,
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      description,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                        fontSize: 11.5,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              const Icon(Icons.chevron_right, size: 18, color: Colors.grey),
            ],
          ),
        ),
      ),
    );
  }

  void _syncEditedFields() {
    if (_generatedItem == null) return;
    setState(() {
      _generatedItem = _generatedItem!.copyWith(
        adaptedHeadline: _headlineController.text.trim(),
        pullQuote: _quoteController.text.trim().isNotEmpty
            ? _quoteController.text.trim()
            : null,
        keyMetric: _metricController.text.trim().isNotEmpty
            ? _metricController.text.trim()
            : null,
        digitalLink: _linkController.text.trim().isNotEmpty
            ? _linkController.text.trim()
            : null,
        creatorOpinion: _opinionController.text.trim().isNotEmpty
            ? _opinionController.text.trim()
            : (_curatorAngleController.text.trim().isNotEmpty
                ? _curatorAngleController.text.trim()
                : _generatedItem?.creatorOpinion),
        creatorHandle: _creatorHandleController.text.trim().isNotEmpty
            ? _creatorHandleController.text.trim()
            : '@curator',
        posterStyle: _currentStyle,
        visualArtRatio: _visualArtRatio,
        isUserCreated: true,
        bookTitle: _bookTitleController.text.trim().isNotEmpty ? _bookTitleController.text.trim() : _generatedItem!.bookTitle,
        bookAuthor: _bookAuthorController.text.trim().isNotEmpty ? _bookAuthorController.text.trim() : _generatedItem!.bookAuthor,
        curatorAngle: _curatorAngleController.text.trim().isNotEmpty ? _curatorAngleController.text.trim() : _generatedItem!.curatorAngle,
        bookCoverPhotoPath: _bookCoverPath ?? _bookCoverImage?.path ?? _generatedItem!.bookCoverPhotoPath,
        bookExcerptPhotoPaths: _bookExcerptImages.isNotEmpty ? _bookExcerptImages.map((f) => f.path).toList() : _generatedItem!.bookExcerptPhotoPaths,
        postFormat: _selectedPostFormat,
        receiptHighlightQuote: _receiptQuoteController.text.trim().isNotEmpty
            ? _receiptQuoteController.text.trim()
            : _generatedItem?.receiptHighlightQuote,
      );
    });
  }

  Future<void> _saveAndFinish() async {
    _syncEditedFields();
    if (_generatedItem == null) return;

    // Render poster to PNG bytes and save path
    try {
      final pngBytes = await _shareService.captureWidgetToPng(_posterBoundaryKey);
      String? savedPath;
      if (pngBytes != null) {
        savedPath = await _shareService.savePosterToFile(pngBytes, _generatedItem!.id);
      }

      final finalItem = _generatedItem!.copyWith(renderedPosterPath: savedPath);
      await _storageService.savePostCard(finalItem);
      await _storageService.setCreatorHandle(_creatorHandleController.text.trim());

      // Auto-publish live to editour.app
      EditourCloudService().publishPost(finalItem);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✅ PostCard saved & published live to editour.app!'),
            backgroundColor: Color(0xFF0F172A),
            duration: Duration(seconds: 3),
          ),
        );
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (ctx) => PostcardDetailScreen(initialItem: finalItem),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to save: $e')),
        );
      }
    }
  }

  Future<void> _shareDirectly() async {
    _syncEditedFields();
    if (_generatedItem == null) return;

    final pngBytes = await _shareService.captureWidgetToPng(_posterBoundaryKey);
    await _shareService.sharePostCard(
      item: _generatedItem!,
      posterBytes: pngBytes,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Create New PostCard'),
        actions: [
          if (_generatedItem != null)
            TextButton.icon(
              onPressed: _saveAndFinish,
              icon: const Icon(Icons.check, color: Colors.green),
              label: const Text('Save', style: TextStyle(fontWeight: FontWeight.bold)),
            ),
        ],
      ),
      body: _isAnalyzing
          ? _buildAnalyzingOverlay(theme)
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Step 1: Input Source Selector (Physical Paper Cut vs Digital News Link)
                  _buildSourceTypeSelector(theme),
                  const SizedBox(height: 16),
                  if (_sourceMode == InputSourceMode.physicalPhoto)
                    _buildPhotoSection(theme)
                  else if (_sourceMode == InputSourceMode.digitalLink)
                    _buildDigitalLinkSection(theme)
                  else if (_sourceMode == InputSourceMode.bookExcerpt)
                    _buildBookExcerptSection(theme)
                  else
                    _buildPhotoSection(theme),
                  const SizedBox(height: 20),

                  // Step 2: Audience & Tone configuration
                  Card(
                    elevation: 0,
                    color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                      side: BorderSide(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.4)),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                        AudienceChipSelector(
                          selectedAudience: _targetAudience,
                          selectedTone: _selectedTone,
                          onAudienceSelected: (aud) => setState(() => _targetAudience = aud),
                          onToneSelected: (tone) => setState(() => _selectedTone = tone),
                        ),
                        const SizedBox(height: 16),
                        TextField(
                          controller: _contextController,
                          decoration: InputDecoration(
                            labelText: 'Specific Angle or Context (Optional)',
                            hintText: 'e.g. Focus on climate impact, or explain for kids',
                            prefixIcon: const Icon(Icons.lightbulb_outline),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                            filled: true,
                            fillColor: theme.colorScheme.surface,
                          ),
                          maxLines: 2,
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: _hookCuesController,
                          decoration: InputDecoration(
                            labelText: 'Hints or Cues for Hook Poster (Optional)',
                            hintText: 'e.g. Dramatic spotlight on an old clock, surrealist style, focus on the whistleblower',
                            prefixIcon: const Icon(Icons.auto_awesome_outlined),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                            filled: true,
                            fillColor: theme.colorScheme.surface,
                          ),
                          maxLines: 2,
                        ),
                      ],
                    ),
                  ),
                ),
                  const SizedBox(height: 16),

                  // Step 3: Visual Art & Infographics Ratio Slider
                  Card(
                    elevation: 0,
                    color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                      side: BorderSide(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.4)),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(Icons.palette_outlined, size: 20, color: theme.colorScheme.primary),
                              const SizedBox(width: 8),
                              const Expanded(
                                child: Text(
                                  'Visual Art & Infographics Ratio',
                                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13.5),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                                decoration: BoxDecoration(
                                  color: theme.colorScheme.primary,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(
                                  '${(_visualArtRatio * 100).round()}% Art',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.bold,
                                    fontSize: 11.5,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(
                            _getArtRatioDescription(_visualArtRatio),
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                              fontSize: 11.5,
                            ),
                          ),
                          const SizedBox(height: 10),
                          SliderTheme(
                            data: SliderTheme.of(context).copyWith(
                              activeTrackColor: theme.colorScheme.primary,
                              thumbColor: theme.colorScheme.primary,
                              trackHeight: 6,
                            ),
                            child: Slider(
                              value: _visualArtRatio,
                              min: 0.20,
                              max: 0.90,
                              divisions: 7,
                              onChanged: (val) {
                                setState(() {
                                  _visualArtRatio = val;
                                  if (_generatedItem != null) {
                                    _generatedItem = _generatedItem!.copyWith(visualArtRatio: val);
                                  }
                                });
                              },
                            ),
                          ),
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  '20% (More Text)',
                                  style: TextStyle(fontSize: 10, color: theme.colorScheme.outline),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              Expanded(
                                child: Text(
                                  '50% (Balanced)',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(fontSize: 10, color: theme.colorScheme.outline),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              Expanded(
                                child: Text(
                                  '90% (Hero Art)',
                                  textAlign: TextAlign.right,
                                  style: TextStyle(fontSize: 10, color: theme.colorScheme.outline),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Format Selector (Curator Briefing vs Social Carousel Trio)
                  _buildFormatSelector(theme),
                  const SizedBox(height: 16),

                  // Generate Button
                  FilledButton.icon(
                    onPressed: _isAnalyzing
                        ? null
                        : (_generatedItem != null
                            ? _showRegenerationOptionsSheet
                            : _runAnalysis),
                    icon: Icon(_selectedPostFormat == 'carousel_trio' ? Icons.view_carousel_rounded : Icons.auto_awesome),
                    label: Text(
                      _generatedItem == null
                          ? (_selectedPostFormat == 'carousel_trio'
                              ? 'Generate 3-Poster Social Carousel'
                              : 'Summarize into Social Poster')
                          : (_selectedPostFormat == 'carousel_trio'
                              ? 'Re-generate 3-Poster Carousel'
                              : 'Re-generate Poster with AI'),
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                    ),
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),

                  // Step 3: Poster & PostCard Customization (Appears after generation)
                  if (_generatedItem != null) ...[
                    const SizedBox(height: 28),
                    _buildGeneratedPosterSection(theme),
                    const SizedBox(height: 20),
                    _buildCreatorInputsSection(theme),
                    const SizedBox(height: 24),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _shareDirectly,
                            icon: const Icon(Icons.share_outlined),
                            label: const Text('Share Poster Now'),
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: FilledButton.icon(
                            onPressed: _saveAndFinish,
                            icon: const Icon(Icons.bookmark_added_outlined),
                            label: const Text('Save PostCard'),
                            style: FilledButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 32),
                  ],
                ],
              ),
            ),
    );
  }

  Widget _buildSourceTypeSelector(ThemeData theme) {
    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5)),
      ),
      padding: const EdgeInsets.all(4),
      child: Row(
        children: [
          Expanded(
            child: InkWell(
              onTap: () {
                if (_sourceMode != InputSourceMode.physicalPhoto) {
                  setState(() => _sourceMode = InputSourceMode.physicalPhoto);
                }
              },
              borderRadius: BorderRadius.circular(10),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.symmetric(vertical: 9),
                decoration: BoxDecoration(
                  color: _sourceMode == InputSourceMode.physicalPhoto
                      ? theme.colorScheme.primary
                      : Colors.transparent,
                  borderRadius: BorderRadius.circular(10),
                  boxShadow: _sourceMode == InputSourceMode.physicalPhoto
                      ? [
                          BoxShadow(
                            color: theme.colorScheme.primary.withValues(alpha: 0.3),
                            blurRadius: 8,
                            offset: const Offset(0, 2),
                          )
                        ]
                      : null,
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.camera_alt_outlined,
                      size: 15,
                      color: _sourceMode == InputSourceMode.physicalPhoto
                          ? Colors.white
                          : theme.colorScheme.onSurface,
                    ),
                    const SizedBox(width: 5),
                    Flexible(
                      child: Text(
                        'Physical Print',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                          color: _sourceMode == InputSourceMode.physicalPhoto
                              ? Colors.white
                              : theme.colorScheme.onSurface,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: InkWell(
              onTap: () {
                if (_sourceMode != InputSourceMode.digitalLink) {
                  setState(() => _sourceMode = InputSourceMode.digitalLink);
                }
              },
              borderRadius: BorderRadius.circular(10),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.symmetric(vertical: 9),
                decoration: BoxDecoration(
                  color: _sourceMode == InputSourceMode.digitalLink
                      ? const Color(0xFF0284C7)
                      : Colors.transparent,
                  borderRadius: BorderRadius.circular(10),
                  boxShadow: _sourceMode == InputSourceMode.digitalLink
                      ? [
                          BoxShadow(
                            color: const Color(0xFF0284C7).withValues(alpha: 0.3),
                            blurRadius: 8,
                            offset: const Offset(0, 2),
                          )
                        ]
                      : null,
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.language,
                      size: 15,
                      color: _sourceMode == InputSourceMode.digitalLink
                          ? Colors.white
                          : theme.colorScheme.onSurface,
                    ),
                    const SizedBox(width: 5),
                    Flexible(
                      child: Text(
                        'Web Link',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                          color: _sourceMode == InputSourceMode.digitalLink
                              ? Colors.white
                              : theme.colorScheme.onSurface,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDigitalLinkSection(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.language, color: Color(0xFF0284C7), size: 20),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                '1. Paste News Article Link',
                style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          'Summarize any online article (BBC, Reuters, TechCrunch, The Hindu, etc.) into an infographic poster.',
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: 12),

        // URL Input Card
        Container(
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.6)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.04),
                blurRadius: 10,
                offset: const Offset(0, 3),
              ),
            ],
          ),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                controller: _urlController,
                decoration: InputDecoration(
                  labelText: 'News Article URL / Web Link',
                  hintText: 'https://www.reuters.com/...',
                  prefixIcon: const Icon(Icons.link, color: Color(0xFF0284C7)),
                  suffixIcon: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        tooltip: 'Paste from Clipboard',
                        icon: const Icon(Icons.content_paste, size: 20),
                        onPressed: () async {
                          final data = await Clipboard.getData(Clipboard.kTextPlain);
                          if (data?.text != null && data!.text!.trim().isNotEmpty) {
                            _urlController.text = data.text!.trim();
                            _fetchUrlArticle(data.text!.trim());
                          }
                        },
                      ),
                      if (_urlController.text.isNotEmpty)
                        IconButton(
                          tooltip: 'Clear',
                          icon: const Icon(Icons.clear, size: 18),
                          onPressed: () {
                            setState(() {
                              _urlController.clear();
                              _digitalTitleController.clear();
                              _digitalContentController.clear();
                              _scrapedArticle = null;
                              _scrapedSiteName = null;
                            });
                          },
                        ),
                    ],
                  ),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  filled: true,
                  fillColor: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.2),
                ),
                keyboardType: TextInputType.url,
                onSubmitted: (val) => _fetchUrlArticle(val),
              ),
              const SizedBox(height: 12),

              FilledButton.tonalIcon(
                onPressed: _isFetchingUrl ? null : () => _fetchUrlArticle(),
                icon: _isFetchingUrl
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.cloud_download_outlined, size: 18),
                label: Text(
                  _isFetchingUrl
                      ? 'Fetching Article Text...'
                      : (_scrapedArticle != null ? 'Re-fetch Web Article' : 'Fetch & Preview Article'),
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              ),

              // Preview of fetched article
              if (_scrapedArticle != null || _digitalTitleController.text.isNotEmpty) ...[
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0284C7).withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFF0284C7).withValues(alpha: 0.25)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: const Color(0xFF0284C7),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              _scrapedSiteName?.toUpperCase() ?? 'WEB SOURCE',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                letterSpacing: 0.8,
                              ),
                            ),
                          ),
                          const Spacer(),
                          const Icon(Icons.check_circle, color: Color(0xFF10B981), size: 16),
                          const SizedBox(width: 4),
                          const Text(
                            'Article Ready',
                            style: TextStyle(
                              color: Color(0xFF10B981),
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _digitalTitleController,
                        decoration: const InputDecoration(
                          labelText: 'Article Headline',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                        maxLines: 2,
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _digitalContentController,
                        decoration: const InputDecoration(
                          labelText: 'Article Content / Key Excerpt',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                        style: const TextStyle(fontSize: 12),
                        maxLines: 3,
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),

        const SizedBox(height: 12),
        // Sample digital news links
        Text(
          'Or try sample digital stories:',
          style: theme.textTheme.labelMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          runSpacing: 6,
          children: LinkScraperService.sampleDigitalLinks.map((sample) {
            return ActionChip(
              avatar: const Icon(Icons.public, size: 14, color: Color(0xFF0284C7)),
              label: Text(
                '${sample['site']}: ${sample['title']!.split(':').first}',
                style: const TextStyle(fontSize: 11),
              ),
              onPressed: () => _applySampleDigitalLink(sample),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildBookExcerptSection(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.auto_stories, color: Colors.amber.shade800, size: 20),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'Step 1: Book Cover & Excerpt Reading',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          'Attach book excerpt pages (single or multiple photos) and a separate identified Book Cover Page to create an evocative literary poster.',
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 14),

        // Quick Curated Book Samples
        Text(
          'Or try classic curated book readings:',
          style: theme.textTheme.labelMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 6),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: sampleBooks.map((sample) {
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ActionChip(
                  avatar: Icon(Icons.auto_stories, size: 14, color: Colors.amber.shade900),
                  label: Text(
                    '${sample['title']} (${sample['author']})',
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
                  ),
                  backgroundColor: Colors.amber.shade900.withValues(alpha: 0.08),
                  side: BorderSide(color: Colors.amber.shade800.withValues(alpha: 0.3)),
                  onPressed: () => _applySampleBook(sample),
                ),
              );
            }).toList(),
          ),
        ),
        const SizedBox(height: 16),

        // Card 1: Identified Book Cover Page
        Card(
          elevation: 0,
          color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: Colors.amber.shade800.withValues(alpha: 0.3)),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.menu_book, size: 18, color: Colors.amber.shade800),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        'Identified Book Cover Page',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                      decoration: BoxDecoration(
                        color: _bookCoverImage != null || _bookCoverPath != null
                            ? Colors.green.shade800
                            : Colors.amber.shade800,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        _bookCoverImage != null || _bookCoverPath != null
                            ? 'COVER READY'
                            : 'SEPARATE PHOTO',
                        style: const TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  'The book cover will be linked to the poster with a book icon so readers can tap to inspect the cover page.',
                  style: TextStyle(fontSize: 11.5, color: theme.colorScheme.onSurfaceVariant),
                ),
                const SizedBox(height: 12),

                // Cover display if selected
                if (_bookCoverImage != null || _bookCoverPath != null) ...[
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.05),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.amber.shade800.withValues(alpha: 0.4)),
                    ),
                    child: Row(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Container(
                            width: 65,
                            height: 90,
                            color: const Color(0xFF1E293B),
                            child: _bookCoverBytes != null
                                ? Image.memory(_bookCoverBytes!, fit: BoxFit.cover)
                                : (_bookCoverImage != null && !kIsWeb && File(_bookCoverImage!.path).existsSync()
                                    ? Image.file(File(_bookCoverImage!.path), fit: BoxFit.cover)
                                    : const Center(child: Icon(Icons.auto_stories, color: Colors.amber, size: 30))),
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Cover Page Photo Attached',
                                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                _bookTitleController.text.isNotEmpty
                                    ? _bookTitleController.text
                                    : 'Identified edition cover',
                                style: TextStyle(fontSize: 11.5, color: theme.colorScheme.onSurfaceVariant),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 8),
                              Wrap(
                                spacing: 8,
                                children: [
                                  OutlinedButton.icon(
                                    style: OutlinedButton.styleFrom(
                                      visualDensity: VisualDensity.compact,
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                    ),
                                    onPressed: () => BookCoverViewerDialog.show(
                                      context,
                                      coverBytes: _bookCoverBytes,
                                      coverPhotoPath: _bookCoverPath ?? _bookCoverImage?.path,
                                      bookTitle: _bookTitleController.text,
                                      bookAuthor: _bookAuthorController.text,
                                      curatorAngle: _curatorAngleController.text,
                                    ),
                                    icon: const Icon(Icons.zoom_in, size: 14),
                                    label: const Text('Inspect', style: TextStyle(fontSize: 11)),
                                  ),
                                  TextButton.icon(
                                    style: TextButton.styleFrom(
                                      visualDensity: VisualDensity.compact,
                                      foregroundColor: Colors.red,
                                    ),
                                    onPressed: () => setState(() {
                                      _bookCoverImage = null;
                                      _bookCoverBytes = null;
                                      _bookCoverPath = null;
                                    }),
                                    icon: const Icon(Icons.close, size: 14),
                                    label: const Text('Remove', style: TextStyle(fontSize: 11)),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ] else ...[
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => _pickBookCoverImage(ImageSource.camera),
                          icon: const Icon(Icons.camera_alt_outlined, size: 16),
                          label: const Text('Snap Cover Photo', style: TextStyle(fontSize: 12)),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => _pickBookCoverImage(ImageSource.gallery),
                          icon: const Icon(Icons.photo_library_outlined, size: 16),
                          label: const Text('Pick Cover Photo', style: TextStyle(fontSize: 12)),
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),

        // Card 2: Book Excerpt Pages (Single or Multiple Photos)
        Card(
          elevation: 0,
          color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.4)),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.collections_bookmark_outlined, size: 18),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        'Excerpt Pages (Multiple Photos)',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (_bookExcerptImages.isNotEmpty) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                        decoration: BoxDecoration(
                          color: const Color(0xFF0F172A),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          '${_bookExcerptImages.length} PAGE(S)',
                          style: const TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  'Photograph a section of a book page or multiple consecutive pages to capture the full reading passage.',
                  style: TextStyle(fontSize: 11.5, color: theme.colorScheme.onSurfaceVariant),
                ),
                const SizedBox(height: 12),

                // Thumbnails strip of excerpt pages if present
                if (_bookExcerptImages.isNotEmpty) ...[
                  SizedBox(
                    height: 110,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: _bookExcerptImages.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 10),
                      itemBuilder: (ctx, idx) {
                        final img = _bookExcerptImages[idx];
                        return Stack(
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(10),
                              child: Container(
                                width: 85,
                                height: 110,
                                color: Colors.black12,
                                child: !kIsWeb && File(img.path).existsSync()
                                    ? Image.file(File(img.path), fit: BoxFit.cover)
                                    : const Center(child: Icon(Icons.description, size: 28)),
                              ),
                            ),
                            Positioned(
                              top: 4,
                              left: 4,
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                                decoration: BoxDecoration(
                                  color: Colors.black87,
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  'Page ${idx + 1}',
                                  style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold),
                                ),
                              ),
                            ),
                            Positioned(
                              top: 2,
                              right: 2,
                              child: InkWell(
                                onTap: () => _removeBookExcerptPage(idx),
                                child: Container(
                                  padding: const EdgeInsets.all(3),
                                  decoration: const BoxDecoration(
                                    color: Colors.red,
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(Icons.close, size: 12, color: Colors.white),
                                ),
                              ),
                            ),
                          ],
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 10),
                ],

                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => _addBookExcerptPage(ImageSource.camera),
                        icon: const Icon(Icons.camera_alt_outlined, size: 16),
                        label: Text(_bookExcerptImages.isEmpty ? 'Snap Excerpt Page' : '+ Another Page'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => _addBookExcerptPage(ImageSource.gallery),
                        icon: const Icon(Icons.photo_library_outlined, size: 16),
                        label: const Text('Add Pages (Gallery)'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),

        // Card 3: Curator Angle & Emotion
        Card(
          elevation: 0,
          color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.4)),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.lightbulb_outline, size: 18, color: Colors.amber.shade800),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        'Curator\'s Emotional Angle & Resonance',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  'Express how this excerpt made you feel. The poster will represent the reading\'s emotion through your Curator lens.',
                  style: TextStyle(fontSize: 11.5, color: theme.colorScheme.onSurfaceVariant),
                ),
                const SizedBox(height: 10),

                // Quick Emotion Presets
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    'Stoic Calm & Inner Citadel',
                    'Quiet Solace & Gratitude',
                    'Liberation from Regret',
                    'Loving the Questions',
                    'Existential Wonder',
                    'Intellectual Epiphany',
                  ].map((preset) {
                    final isSelected = _curatorAngleController.text == preset;
                    return ChoiceChip(
                      label: Text(preset),
                      selected: isSelected,
                      selectedColor: Colors.amber.shade800,
                      labelStyle: TextStyle(
                        fontSize: 10.5,
                        color: isSelected ? Colors.white : theme.colorScheme.onSurface,
                        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                      ),
                      visualDensity: VisualDensity.compact,
                      onSelected: (val) {
                        if (val) {
                          setState(() {
                            _curatorAngleController.text = preset;
                          });
                        }
                      },
                    );
                  }).toList(),
                ),
                const SizedBox(height: 10),

                TextField(
                  controller: _curatorAngleController,
                  decoration: InputDecoration(
                    labelText: 'Curator\'s Angle / Feeling',
                    hintText: 'e.g. Finding peace amidst chaos; living into the answers with grace...',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                    prefixIcon: const Icon(Icons.edit_note, size: 18),
                    isDense: true,
                  ),
                  maxLines: 2,
                ),
                const SizedBox(height: 12),

                // Book Title & Author row
                Row(
                  children: [
                    Expanded(
                      flex: 3,
                      child: TextField(
                        controller: _bookTitleController,
                        decoration: InputDecoration(
                          labelText: 'Book Title',
                          hintText: 'e.g. Meditations',
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                          isDense: true,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      flex: 2,
                      child: TextField(
                        controller: _bookAuthorController,
                        decoration: InputDecoration(
                          labelText: 'Author',
                          hintText: 'e.g. Marcus Aurelius',
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                          isDense: true,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                TextField(
                  controller: _bookExcerptTextController,
                  decoration: InputDecoration(
                    labelText: 'Key Excerpt Passage (Optional text transcription)',
                    hintText: 'Paste or type memorable sentences from the pages...',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                    isDense: true,
                  ),
                  maxLines: 3,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildPhotoSection(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.camera_alt_outlined, color: theme.colorScheme.primary, size: 20),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                '1. Snap Newspaper / Magazine Photo',
                style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          'Capture physical broadsheet, magazine clipping, or test with sample print clips.',
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: 12),

        // Photo Preview or Selection Area
        if (_selectedImage != null) ...[
          Stack(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: Container(
                  height: 220,
                  width: double.infinity,
                  color: Colors.black,
                  child: RotatedBox(
                    quarterTurns: _imageRotationTurns,
                    child: kIsWeb
                        ? Image.network(_selectedImage!.path, fit: BoxFit.contain)
                        : Image.file(File(_selectedImage!.path), fit: BoxFit.contain),
                  ),
                ),
              ),
              if (_isCropped)
                Positioned(
                  top: 10,
                  left: 10,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.78),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: const Color(0xFF10B981), width: 1.2),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.content_cut, size: 12, color: Color(0xFF10B981)),
                        SizedBox(width: 5),
                        Text(
                          'Article Cropped',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              Positioned(
                bottom: 10,
                right: 10,
                child: Row(
                  children: [
                    FloatingActionButton.small(
                      heroTag: 'crop_photo',
                      backgroundColor: const Color(0xFF6366F1),
                      foregroundColor: Colors.white,
                      onPressed: () => _cropImage(),
                      tooltip: _isCropped ? 'Re-crop Section' : 'Crop Article Section',
                      child: const Icon(Icons.crop),
                    ),
                    const SizedBox(width: 8),
                    FloatingActionButton.small(
                      heroTag: 'rotate_photo',
                      onPressed: () => setState(() => _imageRotationTurns = (_imageRotationTurns + 1) % 4),
                      tooltip: 'Rotate 90°',
                      child: const Icon(Icons.rotate_right),
                    ),
                    const SizedBox(width: 8),
                    FloatingActionButton.small(
                      heroTag: 'inspect_photo',
                      onPressed: () => PhotoViewerDialog.show(
                        context,
                        photoPath: _selectedImage!.path,
                        headline: _isCropped ? 'Cropped Article Cut-Out' : 'Your Snapped Newspaper Photo',
                        quarterTurns: _imageRotationTurns,
                      ),
                      tooltip: 'Zoom & Inspect',
                      child: const Icon(Icons.zoom_in),
                    ),
                    const SizedBox(width: 8),
                    FloatingActionButton.small(
                      heroTag: 'retake_photo',
                      onPressed: () => _pickImage(ImageSource.camera),
                      tooltip: 'Retake',
                      child: const Icon(Icons.refresh),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: _isCropped
                  ? const Color(0xFF0F172A)
                  : theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: _isCropped
                    ? const Color(0xFF10B981).withValues(alpha: 0.6)
                    : theme.colorScheme.outlineVariant.withValues(alpha: 0.4),
              ),
            ),
            child: Row(
              children: [
                Icon(
                  _isCropped ? Icons.check_circle : Icons.content_cut,
                  size: 16,
                  color: _isCropped ? const Color(0xFF10B981) : theme.colorScheme.primary,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _isCropped
                        ? 'Clean article cutout ready for AI OCR'
                        : 'Cut out just the article section before summarizing',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: _isCropped ? Colors.white : theme.colorScheme.onSurface,
                    ),
                  ),
                ),
                TextButton.icon(
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  onPressed: () => _cropImage(),
                  icon: Icon(
                    _isCropped ? Icons.tune : Icons.crop,
                    size: 14,
                    color: _isCropped ? const Color(0xFF38BDF8) : theme.colorScheme.primary,
                  ),
                  label: Text(
                    _isCropped ? 'Re-crop' : 'Crop Section',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: _isCropped ? const Color(0xFF38BDF8) : theme.colorScheme.primary,
                    ),
                  ),
                ),
                if (_isCropped && _originalImagePath != null) ...[
                  const SizedBox(width: 4),
                  IconButton(
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    icon: const Icon(Icons.undo, size: 16, color: Colors.white70),
                    tooltip: 'Restore Full Photo',
                    onPressed: _resetToOriginalImage,
                  ),
                ],
              ],
            ),
          ),
        ] else if (_activeSample != null) ...[
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFFFBF8F2),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFD6CEBE), width: 1.5),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.newspaper, size: 18, color: Color(0xFF8C7A6B)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _activeSample!.publication.toUpperCase(),
                        style: const TextStyle(
                          fontFamily: 'serif',
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 1.2,
                          color: Color(0xFF5A4D41),
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: const Color(0xFF8C7A6B),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        _activeSample!.category,
                        style: const TextStyle(fontSize: 9, color: Colors.white, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  _activeSample!.title,
                  style: const TextStyle(
                    fontFamily: 'serif',
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF2B241E),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  _activeSample!.rawArticleText.trim(),
                  style: const TextStyle(fontFamily: 'serif', fontSize: 11, color: Colors.black87),
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ] else ...[
          Container(
            height: 140,
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: theme.colorScheme.outlineVariant,
                style: BorderStyle.solid,
                width: 1.5,
              ),
            ),
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.add_a_photo_outlined, size: 36, color: theme.colorScheme.primary),
                  const SizedBox(height: 6),
                  const Text('Snap or Select Physical Article', style: TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  const Text('Use phone camera or pick from gallery', style: TextStyle(fontSize: 11, color: Colors.grey)),
                ],
              ),
            ),
          ),
        ],

        const SizedBox(height: 12),
        // Action buttons row: Camera, Gallery, and Sample presets
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 10),
                  visualDensity: VisualDensity.compact,
                ),
                onPressed: () => _pickImage(ImageSource.camera),
                icon: const Icon(Icons.camera_alt, size: 16),
                label: const FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text('Camera', maxLines: 1),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 10),
                  visualDensity: VisualDensity.compact,
                ),
                onPressed: () => _pickImage(ImageSource.gallery),
                icon: const Icon(Icons.photo_library, size: 16),
                label: const FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text('Gallery', maxLines: 1),
                ),
              ),
            ),
            const SizedBox(width: 8),
            PopupMenuButton<SampleArticle>(
              onSelected: _applySample,
              tooltip: 'Choose Sample Article',
              itemBuilder: (ctx) => SampleArticle.samples.map((s) {
                return PopupMenuItem(
                  value: s,
                  child: Row(
                    children: [
                      const Icon(Icons.article_outlined, size: 16),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          s.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                decoration: BoxDecoration(
                  border: Border.all(color: theme.colorScheme.outlineVariant),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.library_books_outlined, size: 16),
                    SizedBox(width: 4),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text('Samples', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold), maxLines: 1),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildFormatSelector(ThemeData theme) {
    final isBriefing = _selectedPostFormat == 'editorial_briefing';
    final isCarousel = _selectedPostFormat == 'carousel_trio';

    return Card(
      elevation: 0,
      color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.style_outlined, color: theme.colorScheme.primary, size: 18),
                const SizedBox(width: 8),
                Text(
                  'Choose Post Format',
                  style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                // Option 1: Curator Briefing
                Expanded(
                  child: InkWell(
                    onTap: () {
                      setState(() {
                        _selectedPostFormat = 'editorial_briefing';
                        if (_generatedItem != null) {
                          _generatedItem = _generatedItem!.copyWith(postFormat: 'editorial_briefing');
                        }
                      });
                    },
                    borderRadius: BorderRadius.circular(12),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: isBriefing
                            ? theme.colorScheme.primary.withValues(alpha: 0.12)
                            : theme.colorScheme.surface,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: isBriefing
                              ? theme.colorScheme.primary
                              : theme.colorScheme.outlineVariant.withValues(alpha: 0.5),
                          width: isBriefing ? 2 : 1,
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(
                                Icons.article_rounded,
                                size: 18,
                                color: isBriefing ? theme.colorScheme.primary : theme.colorScheme.outline,
                              ),
                              const Spacer(),
                              if (isBriefing)
                                Icon(Icons.check_circle_rounded, size: 16, color: theme.colorScheme.primary),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Curator Briefing',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w800,
                              color: isBriefing ? theme.colorScheme.primary : theme.colorScheme.onSurface,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Hero Poster + 1-Min Read',
                            style: TextStyle(
                              fontSize: 10.5,
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),

                // Option 2: Social Carousel Trio
                Expanded(
                  child: InkWell(
                    onTap: () {
                      setState(() {
                        _selectedPostFormat = 'carousel_trio';
                        if (_generatedItem != null) {
                          _generatedItem = _generatedItem!.copyWith(postFormat: 'carousel_trio');
                        }
                      });
                    },
                    borderRadius: BorderRadius.circular(12),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: isCarousel
                            ? theme.colorScheme.primary.withValues(alpha: 0.12)
                            : theme.colorScheme.surface,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: isCarousel
                              ? theme.colorScheme.primary
                              : theme.colorScheme.outlineVariant.withValues(alpha: 0.5),
                          width: isCarousel ? 2 : 1,
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(
                                Icons.view_carousel_rounded,
                                size: 18,
                                color: isCarousel ? theme.colorScheme.primary : theme.colorScheme.outline,
                              ),
                              const Spacer(),
                              if (isCarousel)
                                Icon(Icons.check_circle_rounded, size: 16, color: theme.colorScheme.primary),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Social Carousel Trio',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w800,
                              color: isCarousel ? theme.colorScheme.primary : theme.colorScheme.onSurface,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '3 Posters • WhatsApp/Insta',
                            style: TextStyle(
                              fontSize: 10.5,
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGeneratedPosterSection(ThemeData theme) {
    if (_generatedItem == null) return const SizedBox.shrink();

    final isCarousel = _generatedItem!.isCarouselTrio;

    if (isCarousel) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.view_carousel_rounded, color: theme.colorScheme.primary, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '2. Generated Social Carousel Trio (3 Posters)',
                  style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              OutlinedButton.icon(
                onPressed: _isAnalyzing ? null : _showRegenerationOptionsSheet,
                icon: const Icon(Icons.autorenew_rounded, size: 16),
                label: const Text('Try Another', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  visualDensity: VisualDensity.compact,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'Slide 1: Hook & Headline • Slide 2: Curator Take • Slide 3: The "Receipt". WhatsApp & Instagram ready.',
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: 14),

          // Live Carousel Studio
          CarouselPosterStudio(
            item: _generatedItem!,
            config: PosterStyleConfig.getPreset(_currentStyle),
            showShareActions: true,
            onRegeneratePosterArt: _regenerateHookPosterOnly,
            onRegenerateHeadline: () => _runAnalysis(target: RegenerationTarget.headlineAndHook),
            onRegenerateAll: () => _runAnalysis(target: RegenerationTarget.all),
          ),

          const SizedBox(height: 12),

          // Live Art Ratio Adjuster for generated poster
          Padding(
            padding: const EdgeInsets.only(top: 4, bottom: 4),
            child: Row(
              children: [
                const Icon(Icons.tune, size: 16, color: Colors.grey),
                const SizedBox(width: 6),
                Text(
                  'Art Ratio: ${(_visualArtRatio * 100).round()}%',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                ),
                Expanded(
                  child: Slider(
                    value: _visualArtRatio,
                    min: 0.20,
                    max: 0.90,
                    divisions: 7,
                    onChanged: (val) {
                      setState(() {
                        _visualArtRatio = val;
                        _generatedItem = _generatedItem!.copyWith(visualArtRatio: val);
                      });
                    },
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.palette_outlined, color: theme.colorScheme.primary, size: 20),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                '2. Generated Visual Poster Card',
                style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            OutlinedButton.icon(
              onPressed: _isAnalyzing ? null : _showRegenerationOptionsSheet,
              icon: const Icon(Icons.autorenew_rounded, size: 16),
              label: const Text('Try Another', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                visualDensity: VisualDensity.compact,
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          'Live interactive poster adapted to your audience. Switch styles with one tap.',
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: 14),

        // Live Poster Canvas
        PosterCanvas(
          item: _generatedItem!,
          boundaryKey: _posterBoundaryKey,
          showStyleSelector: true,
          onStyleChanged: (newStyle) {
            setState(() {
              _currentStyle = newStyle;
              _generatedItem = _generatedItem!.copyWith(posterStyle: newStyle);
            });
          },
        ),

        // Live Art Ratio Adjuster for generated poster
        Padding(
          padding: const EdgeInsets.only(top: 8, bottom: 4),
          child: Row(
            children: [
              const Icon(Icons.tune, size: 16, color: Colors.grey),
              const SizedBox(width: 6),
              Text(
                'Art Ratio: ${(_visualArtRatio * 100).round()}%',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
              ),
              Expanded(
                child: Slider(
                  value: _visualArtRatio,
                  min: 0.20,
                  max: 0.90,
                  divisions: 7,
                  onChanged: (val) {
                    setState(() {
                      _visualArtRatio = val;
                      _generatedItem = _generatedItem!.copyWith(visualArtRatio: val);
                    });
                  },
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildCreatorInputsSection(ThemeData theme) {
    final isCarousel = _generatedItem?.isCarouselTrio == true;

    return Card(
      elevation: 0,
      color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.edit_note_outlined, color: theme.colorScheme.primary, size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    isCarousel ? '3. Edit 3-Poster Content & Data' : '3. Creator Perspective & Links',
                    style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Headline
            TextField(
              controller: _headlineController,
              onChanged: (_) => _syncEditedFields(),
              decoration: InputDecoration(
                labelText: isCarousel ? 'Slide 1: Poster Headline' : 'Adapted Headline',
                prefixIcon: const Icon(Icons.title),
                suffixIcon: IconButton(
                  icon: const Icon(Icons.auto_awesome, color: Colors.blueAccent, size: 20),
                  tooltip: 'Re-craft Headline & Hook with AI',
                  onPressed: _isAnalyzing
                      ? null
                      : () => _runAnalysis(target: RegenerationTarget.headlineAndHook),
                ),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                filled: true,
                fillColor: theme.colorScheme.surface,
              ),
            ),
            const SizedBox(height: 14),

            // Creator Opinion / Slide 2 Critique
            TextField(
              controller: _opinionController,
              onChanged: (_) => _syncEditedFields(),
              decoration: InputDecoration(
                labelText: isCarousel ? 'Slide 2: Curator Take & Critique' : 'Your Opinion / Personal Take',
                hintText: isCarousel
                    ? 'State your direct verdict / stance for Slide 2...'
                    : 'Share your perspective on why this physical article matters...',
                prefixIcon: const Icon(Icons.bolt_outlined),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                filled: true,
                fillColor: theme.colorScheme.surface,
              ),
              maxLines: 2,
            ),
            const SizedBox(height: 14),

            // Slide 3: Receipt Quote (if Carousel) or Pull Quote
            if (isCarousel) ...[
              TextField(
                controller: _receiptQuoteController,
                onChanged: (_) => _syncEditedFields(),
                decoration: InputDecoration(
                  labelText: 'Slide 3: Verbatim Source Receipt Highlight',
                  hintText: 'Exact evidentiary quote highlighted on the newsprint clipping...',
                  prefixIcon: const Icon(Icons.format_quote_rounded),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  filled: true,
                  fillColor: theme.colorScheme.surface,
                ),
                maxLines: 2,
              ),
              const SizedBox(height: 14),
            ],

            // Digital Link
            TextField(
              controller: _linkController,
              onChanged: (_) => _syncEditedFields(),
              decoration: InputDecoration(
                labelText: 'Digital Link (Web URL if exists)',
                hintText: 'https://...',
                prefixIcon: const Icon(Icons.link),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                filled: true,
                fillColor: theme.colorScheme.surface,
              ),
            ),
            const SizedBox(height: 14),

            // Creator Handle & Standout Metric
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _creatorHandleController,
                    onChanged: (_) => _syncEditedFields(),
                    decoration: InputDecoration(
                      labelText: 'Creator Byline',
                      hintText: '@yourhandle',
                      prefixIcon: const Icon(Icons.alternate_email),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      filled: true,
                      fillColor: theme.colorScheme.surface,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextField(
                    controller: _metricController,
                    onChanged: (_) => _syncEditedFields(),
                    decoration: InputDecoration(
                      labelText: isCarousel ? 'Slide 2: Key Metric' : 'Key Stat / Metric',
                      hintText: 'e.g. +42%, \$10B',
                      prefixIcon: const Icon(Icons.query_stats),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      filled: true,
                      fillColor: theme.colorScheme.surface,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAnalyzingOverlay(ThemeData theme) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Stack(
              alignment: Alignment.center,
              children: [
                SizedBox(
                  width: 90,
                  height: 90,
                  child: CircularProgressIndicator(
                    strokeWidth: 4,
                    valueColor: AlwaysStoppedAnimation<Color>(theme.colorScheme.primary),
                  ),
                ),
                Icon(
                  Icons.auto_awesome,
                  size: 40,
                  color: theme.colorScheme.primary,
                ),
              ],
            ),
            const SizedBox(height: 28),
            Text(
              'Creating Your PostCard',
              style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            Text(
              _analysisStatus,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 24),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: theme.colorScheme.primaryContainer,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                'Adapting for: $_targetAudience',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  color: theme.colorScheme.onPrimaryContainer,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
