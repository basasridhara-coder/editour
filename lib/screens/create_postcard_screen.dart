import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import 'package:uuid/uuid.dart';
import 'main_navigation_shell.dart';
import '../models/postcard_item.dart';
import '../models/poster_style_config.dart';
import '../models/sample_articles.dart';
import '../services/editour_cloud_service.dart';
import '../services/gallery_service.dart';
import '../services/gemini_service.dart';
import '../services/link_scraper_service.dart';
import '../services/share_service.dart';
import '../services/storage_service.dart';
import '../services/visual_cue_service.dart';
import 'dart:math' as math;
import 'dart:ui' as ui;
import '../widgets/carousel_slides/carousel_poster_studio.dart';
import '../widgets/photo_viewer_dialog.dart';
import '../widgets/visual_cue_pills_selector.dart';

enum InputSourceMode { physicalPhoto, digitalLink, bookExcerpt, mySlant, innerVoice }

enum SlantStep {
  sourceAndAngle,
  visualCues,
  resultPoster,
}

enum RegenerationTarget {
  all,
  hookPosterArt,
  headlineAndHook,
}

class CreatePostcardScreen extends StatefulWidget {
  final SampleArticle? preloadedSample;
  final InputSourceMode? initialSourceMode;

  const CreatePostcardScreen({
    super.key,
    this.preloadedSample,
    this.initialSourceMode,
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

  SlantStep _currentStep = SlantStep.sourceAndAngle;
  InputSourceMode _sourceMode = InputSourceMode.mySlant;
  bool get _isInnerVoiceMode => _sourceMode == InputSourceMode.mySlant || _sourceMode == InputSourceMode.innerVoice;

  // My Slant Fields (Direct personal thought from Mind or Heart)
  String _slantTone = 'mind'; // 'mind' | 'heart'
  bool _refineCoreTake = true;
  final TextEditingController _slantThoughtController = TextEditingController();
  final TextEditingController _slantSparkController = TextEditingController();
  final TextEditingController _slantVisualCuesController = TextEditingController();

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

  String _targetAudience = 'General Public';
  String _selectedTone = 'Balanced & Engaging';
  final TextEditingController _contextController = TextEditingController();
  final TextEditingController _hookCuesController = TextEditingController();
  List<String> _cueWordPills = [];
  bool _isAutoSuggestingCues = false;
  String? _lastSuggestedContextKey;

  // Character & Face Representation Fields
  bool _matchRealPersonLikeness = false;
  Uint8List? _referenceImageBytes;
  String? _referenceImageSourceLabel;

  final TextEditingController _opinionController = TextEditingController();
  final TextEditingController _linkController = TextEditingController();
  final TextEditingController _headlineController = TextEditingController();
  final TextEditingController _quoteController = TextEditingController();
  final TextEditingController _metricController = TextEditingController();
  final TextEditingController _creatorHandleController = TextEditingController();
  final TextEditingController _receiptQuoteController = TextEditingController();

  // Slide Specific Controllers for Editing Modal
  final TextEditingController _s1CategoryController = TextEditingController();
  final TextEditingController _s1PublicationController = TextEditingController();
  final TextEditingController _s1ActualNewsExcerptController = TextEditingController();

  final TextEditingController _s2TitleController = TextEditingController();
  final TextEditingController _s2WhyItMattersController = TextEditingController();

  final TextEditingController _s3PublicationController = TextEditingController();
  final TextEditingController _s3HeadlineController = TextEditingController();
  final TextEditingController _s3Excerpt1Controller = TextEditingController();
  final TextEditingController _s3Excerpt2Controller = TextEditingController();
  final TextEditingController _s3Excerpt3Controller = TextEditingController();

  final PageController _carouselStudioPageController = PageController();
  final GlobalKey<CarouselPosterStudioState> _carouselStudioKey = GlobalKey<CarouselPosterStudioState>();

  bool _isAnalyzing = false;
  bool _isExporting = false;
  bool _isSaved = false;
  bool _isDownloaded = false;
  String _analysisStatus = '';
  PostCardItem? _generatedItem;
  int _regenerationCount = 0;
  PosterStyleType _currentStyle = PosterStyleType.editorial;
  final double _visualArtRatio = 0.65;

  void _syncCuesController() {
    _hookCuesController.text = VisualCueService.formatOrderedPillsForPrompt(_cueWordPills);
  }

  Future<void> _autoSuggestCueKeywords([Set<int>? selectedIndices]) async {
    setState(() => _isAutoSuggestingCues = true);

    final angleParts = <String>[
      if (_contextController.text.trim().isNotEmpty) _contextController.text.trim(),
      if (_opinionController.text.trim().isNotEmpty) _opinionController.text.trim(),
    ];
    final angle = angleParts.join(' • ');

    final headlineParts = <String>[
      if (_digitalTitleController.text.trim().isNotEmpty) _digitalTitleController.text.trim(),
      if (_headlineController.text.trim().isNotEmpty) _headlineController.text.trim(),
      if (_activeSample?.title != null && _activeSample!.title.isNotEmpty) _activeSample!.title,
    ];
    String headline = headlineParts.isNotEmpty ? headlineParts.first : '';
    if (headline.isEmpty && _urlController.text.trim().isNotEmpty) {
      headline = VisualCueService.extractHeadlineFromUrl(_urlController.text.trim());
    }
    if (headline.isEmpty && _sourceMode == InputSourceMode.mySlant) {
      if (_slantVisualCuesController.text.trim().isNotEmpty) {
        headline = _slantVisualCuesController.text.trim();
      } else if (angle.isNotEmpty) {
        headline = angle.split(RegExp(r'[.\n!?]')).first.trim();
        if (headline.length > 60) headline = '${headline.substring(0, 57)}...';
      }
    }

    String body = '';
    if (_digitalContentController.text.trim().isNotEmpty) {
      body = _digitalContentController.text.trim();
    } else if (_activeSample?.rawArticleText != null) {
      body = _activeSample!.rawArticleText;
    }

    final hasSelection = selectedIndices != null && selectedIndices.isNotEmpty;

    if (hasSelection && _cueWordPills.isNotEmpty) {
      // Selective Re-Suggestion: Keep all unselected cues intact, regenerate only selected ones
      final keptCues = <String>[];
      for (int i = 0; i < _cueWordPills.length; i++) {
        if (!selectedIndices.contains(i)) {
          keptCues.add(_cueWordPills[i]);
        }
      }

      final countNeeded = selectedIndices.length;
      List<String>? newSuggestions;
      try {
        newSuggestions = await _geminiService.resuggestSelectedCuesWithAI(
          curatorAngle: angle,
          newsHeadline: headline,
          newsBody: body.isNotEmpty ? body : null,
          existingKeptCues: keptCues,
          countNeeded: countNeeded,
        );
      } catch (_) {}

      final fallbackAlternatives = VisualCueService.getAlternativeCues(
        existingKeptCues: keptCues,
        countNeeded: countNeeded,
        curatorAngle: angle,
        newsHeadline: headline,
      );

      final replacementPool = newSuggestions != null && newSuggestions.isNotEmpty
          ? [...newSuggestions, ...fallbackAlternatives]
          : fallbackAlternatives;

      final updatedPills = List<String>.from(_cueWordPills);
      final sortedIndices = selectedIndices.toList()..sort();
      for (int i = 0; i < sortedIndices.length; i++) {
        final targetIndex = sortedIndices[i];
        if (targetIndex < updatedPills.length && i < replacementPool.length) {
          updatedPills[targetIndex] = replacementPool[i];
        }
      }

      if (mounted) {
        setState(() {
          _cueWordPills = updatedPills;
          _syncCuesController();
          _isAutoSuggestingCues = false;
        });
      }
    } else {
      // Suggest All: Fresh full 6-dimension extraction for current article & angle
      List<String>? aiExtracted;
      try {
        aiExtracted = await _geminiService.extract6RankedCueDimensionsWithAI(
          curatorAngle: angle,
          newsHeadline: headline,
          newsBody: body.isNotEmpty ? body : null,
        );
      } catch (_) {}

      final suggested = aiExtracted ??
          VisualCueService.extract6RankedCueDimensions(
            curatorAngle: angle,
            newsHeadline: headline,
            newsBody: body.isNotEmpty ? body : null,
          );

      if (mounted) {
        setState(() {
          _cueWordPills = suggested;
          _syncCuesController();
          _isAutoSuggestingCues = false;
          _lastSuggestedContextKey = '$headline::$angle';
        });
      }
    }
  }

  @override
  void initState() {
    super.initState();
    if (widget.initialSourceMode != null) {
      _sourceMode = widget.initialSourceMode!;
    }
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
    _carouselStudioPageController.dispose();
    _s1CategoryController.dispose();
    _s1PublicationController.dispose();
    _s1ActualNewsExcerptController.dispose();
    _s2TitleController.dispose();
    _s2WhyItMattersController.dispose();
    _s3PublicationController.dispose();
    _s3HeadlineController.dispose();
    _s3Excerpt1Controller.dispose();
    _s3Excerpt2Controller.dispose();
    _s3Excerpt3Controller.dispose();

    _urlController.dispose();
    _digitalTitleController.dispose();
    _digitalContentController.dispose();
    _slantThoughtController.dispose();
    _slantSparkController.dispose();
    _slantVisualCuesController.dispose();
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
      _linkController.text = sample.webLink;
      _regenerationCount = 0;
    });
    _autoSuggestCueKeywords();
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
              content: Text('✂️ Article section cut out successfully!'),
              duration: Duration(seconds: 2),
              backgroundColor: Color(0xFF0F172A),
            ),
          );
        }
      }
    } catch (e) {
      debugPrint('Error cropping image: $e');
    }
  }

  Future<Uint8List> _rotateBytes90Degrees(Uint8List bytes) async {
    final codec = await ui.instantiateImageCodec(bytes);
    final frame = await codec.getNextFrame();
    final image = frame.image;

    final origW = image.width.toDouble();
    final origH = image.height.toDouble();
    final targetW = origH;
    final targetH = origW;

    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder, Rect.fromLTWH(0, 0, targetW, targetH));

    canvas.translate(targetW / 2, targetH / 2);
    canvas.rotate(math.pi / 2);
    canvas.translate(-origW / 2, -origH / 2);

    canvas.drawImage(image, Offset.zero, Paint());

    final picture = recorder.endRecording();
    final rotated = await picture.toImage(targetW.round(), targetH.round());
    final byteData = await rotated.toByteData(format: ui.ImageByteFormat.png);
    return byteData!.buffer.asUint8List();
  }

  Future<void> _rotateImage() async {
    if (_imageBytes == null && _selectedImage == null) return;
    try {
      final bytesToRotate = _imageBytes ?? await File(_selectedImage!.path).readAsBytes();
      final rotated = await _rotateBytes90Degrees(bytesToRotate);
      setState(() {
        _imageRotationTurns = (_imageRotationTurns + 1) % 4;
        _imageBytes = rotated;
        if (_referenceImageBytes != null && _referenceImageSourceLabel == 'Print Clipping Photo') {
          _referenceImageBytes = rotated;
        }
      });
      if (_selectedImage != null) {
        final f = File(_selectedImage!.path);
        if (await f.exists()) {
          await f.writeAsBytes(rotated);
        }
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('🔄 Rotated 90° clockwise'),
            duration: Duration(seconds: 1),
            backgroundColor: Color(0xFF0F172A),
          ),
        );
      }
    } catch (e) {
      debugPrint('Error rotating image: $e');
      setState(() {
        _imageRotationTurns = (_imageRotationTurns + 1) % 4;
      });
    }
  }

  Future<void> _fetchUrlArticle([String? overrideUrl]) async {
    final targetUrl = (overrideUrl ?? _urlController.text).trim();
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
          } else {
            final fallback = VisualCueService.extractHeadlineFromUrl(targetUrl);
            if (fallback.isNotEmpty) _digitalTitleController.text = fallback;
          }
          if (result.content.isNotEmpty) {
            _digitalContentController.text = result.content;
          }
        });
        _autoSuggestCueKeywords();
        if (result.imageUrl != null && result.imageUrl!.isNotEmpty) {
          _fetchReferenceImageBytes(result.imageUrl!);
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isFetchingUrl = false;
          if (_digitalTitleController.text.trim().isEmpty) {
            final fallback = VisualCueService.extractHeadlineFromUrl(targetUrl);
            if (fallback.isNotEmpty) _digitalTitleController.text = fallback;
          }
        });
        _autoSuggestCueKeywords();
      }
    }
  }

  Future<void> _fetchReferenceImageBytes(String url) async {
    try {
      final resp = await http.get(Uri.parse(url)).timeout(const Duration(seconds: 10));
      if (resp.statusCode == 200 && resp.bodyBytes.isNotEmpty) {
        if (mounted) {
          setState(() {
            _referenceImageBytes = resp.bodyBytes;
            _referenceImageSourceLabel = 'Article Web Photo';
          });
        }
      }
    } catch (e) {
      debugPrint('Failed to auto-fetch reference photo from url: $e');
    }
  }

  Future<void> _pickReferencePhoto(ImageSource source) async {
    try {
      final picked = await _picker.pickImage(
        source: source,
        maxWidth: 1200,
        maxHeight: 1200,
        imageQuality: 85,
      );
      if (picked != null) {
        final bytes = await picked.readAsBytes();
        if (mounted) {
          setState(() {
            _referenceImageBytes = bytes;
            _referenceImageSourceLabel = source == ImageSource.camera ? 'Captured Portrait' : 'Uploaded Photo';
            _matchRealPersonLikeness = true;
          });
        }
      }
    } catch (e) {
      debugPrint('Error picking reference photo: $e');
    }
  }

  void _showReferencePhotoPickerSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 36,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.grey.withValues(alpha: 0.4),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                const Text(
                  'Attach Person Reference Photo',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Select a clear portrait photo so AI can preserve their facial structure & likeness in the poster.',
                  style: TextStyle(fontSize: 12, color: Colors.grey),
                ),
                const SizedBox(height: 16),
                ListTile(
                  leading: const CircleAvatar(
                    backgroundColor: Color(0xFF6366F1),
                    child: Icon(Icons.camera_alt, color: Colors.white, size: 20),
                  ),
                  title: const Text('Take Photo with Camera', style: TextStyle(fontWeight: FontWeight.w600)),
                  onTap: () {
                    Navigator.pop(ctx);
                    _pickReferencePhoto(ImageSource.camera);
                  },
                ),
                ListTile(
                  leading: const CircleAvatar(
                    backgroundColor: Color(0xFF0284C7),
                    child: Icon(Icons.photo_library, color: Colors.white, size: 20),
                  ),
                  title: const Text('Choose from Photo Gallery', style: TextStyle(fontWeight: FontWeight.w600)),
                  onTap: () {
                    Navigator.pop(ctx);
                    _pickReferencePhoto(ImageSource.gallery);
                  },
                ),
                if (_sourceMode == InputSourceMode.physicalPhoto && _imageBytes != null)
                  ListTile(
                    leading: const CircleAvatar(
                      backgroundColor: Color(0xFF10B981),
                      child: Icon(Icons.newspaper, color: Colors.white, size: 20),
                    ),
                    title: const Text('Use Physical Clipping Photo', style: TextStyle(fontWeight: FontWeight.w600)),
                    onTap: () {
                      Navigator.pop(ctx);
                      setState(() {
                        _referenceImageBytes = _imageBytes;
                        _referenceImageSourceLabel = 'Print Clipping Photo';
                        _matchRealPersonLikeness = true;
                      });
                    },
                  ),
                if (_scrapedArticle?.imageUrl != null && _scrapedArticle!.imageUrl!.isNotEmpty)
                  ListTile(
                    leading: const CircleAvatar(
                      backgroundColor: Color(0xFFF59E0B),
                      child: Icon(Icons.link, color: Colors.white, size: 20),
                    ),
                    title: const Text('Reload Article Web Photo', style: TextStyle(fontWeight: FontWeight.w600)),
                    onTap: () {
                      Navigator.pop(ctx);
                      _fetchReferenceImageBytes(_scrapedArticle!.imageUrl!);
                    },
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _goToVisualCuesStep() {
    if (_isInnerVoiceMode) {
      final thought = _contextController.text.trim().isNotEmpty
          ? _contextController.text.trim()
          : _slantThoughtController.text.trim();
      if (thought.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Please write your slant or perspective above first'),
            backgroundColor: Colors.orange,
          ),
        );
        return;
      }
      _contextController.text = thought;
      _slantThoughtController.text = thought;
      if (_slantVisualCuesController.text.trim().isNotEmpty) {
        _hookCuesController.text = _slantVisualCuesController.text.trim();
      }
    } else if (_sourceMode == InputSourceMode.physicalPhoto) {
      if (_selectedImage == null && _activeSample == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Please snap or upload a magazine or print clipping photo first'),
            backgroundColor: Colors.orange,
          ),
        );
        return;
      }
      if (_referenceImageBytes == null && _imageBytes != null && _imageBytes!.isNotEmpty) {
        _referenceImageBytes = _imageBytes;
        _referenceImageSourceLabel = 'Print Clipping Photo';
      }
    } else {
      final url = _urlController.text.trim();
      if (url.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Please enter or paste a news article URL first'),
            backgroundColor: Colors.orange,
          ),
        );
        return;
      }
    }

    final headlineParts = <String>[
      if (_digitalTitleController.text.trim().isNotEmpty) _digitalTitleController.text.trim(),
      if (_headlineController.text.trim().isNotEmpty) _headlineController.text.trim(),
      if (_activeSample?.title != null && _activeSample!.title.isNotEmpty) _activeSample!.title,
    ];
    String headline = headlineParts.isNotEmpty ? headlineParts.first : '';
    if (headline.isEmpty && _urlController.text.trim().isNotEmpty) {
      headline = VisualCueService.extractHeadlineFromUrl(_urlController.text.trim());
    }
    if (headline.isEmpty && _sourceMode == InputSourceMode.mySlant) {
      if (_slantVisualCuesController.text.trim().isNotEmpty) {
        headline = _slantVisualCuesController.text.trim();
      } else if (_slantThoughtController.text.trim().isNotEmpty) {
        headline = _slantThoughtController.text.trim().split(RegExp(r'[.\n!?]')).first.trim();
        if (headline.length > 60) headline = '${headline.substring(0, 57)}...';
      }
    }
    final angle = _contextController.text.trim();
    final currentKey = '$headline::$angle';

    if (_cueWordPills.isEmpty || _lastSuggestedContextKey != currentKey) {
      _autoSuggestCueKeywords();
    }

    setState(() {
      _currentStep = SlantStep.visualCues;
    });
  }

  Future<void> _runAnalysis({RegenerationTarget target = RegenerationTarget.all}) async {
    final isRegenerating = _generatedItem != null;
    if (isRegenerating) {
      _regenerationCount++;
    }

    final isHeadlineOnly = target == RegenerationTarget.headlineAndHook;

    setState(() {
      _isAnalyzing = true;
      _analysisStatus = isHeadlineOnly
          ? 'Synthesizing bold headline & curated takes...'
          : (_sourceMode == InputSourceMode.mySlant
              ? 'Synthesizing personal opinion manifesto & art...'
              : (_sourceMode == InputSourceMode.physicalPhoto
                  ? 'Analyzing print photo typography & OCR...'
                  : 'Extracting digital news context & editorial cues...'));
    });

    try {
      GeminiAnalysisResult result;

      if (_isInnerVoiceMode) {
        result = await _geminiService.analyzeAndSummarizeMySlant(
          rawThought: _slantThoughtController.text.trim().isNotEmpty
              ? _slantThoughtController.text.trim()
              : (_contextController.text.trim().isNotEmpty
                  ? _contextController.text.trim()
                  : 'Direct personal perspective reflection.'),
          sparkCatalyst: _slantSparkController.text.trim().isNotEmpty
              ? _slantSparkController.text.trim()
              : null,
          slantTone: _slantTone,
          refineCoreTake: _refineCoreTake,
          visualCues: _hookCuesController.text.trim().isNotEmpty ? _hookCuesController.text.trim() : null,
          targetAudience: _targetAudience,
          tone: _selectedTone,
          visualArtRatio: _visualArtRatio,
        );
      } else if (_sourceMode == InputSourceMode.physicalPhoto) {
        Uint8List bytesToAnalyze;
        if (_imageBytes != null) {
          bytesToAnalyze = _imageBytes!;
        } else {
          bytesToAnalyze = Uint8List.fromList(List.generate(64, (i) => i));
        }

        final refBytes = _matchRealPersonLikeness
            ? (_referenceImageBytes ?? (_imageBytes != null && _imageBytes!.isNotEmpty ? _imageBytes : null))
            : null;

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
          referenceImageBytes: refBytes,
          matchRealPersonLikeness: _matchRealPersonLikeness,
          onProgressUpdate: (msg) {
            if (mounted) setState(() => _analysisStatus = msg);
          },
        );
      } else {
        String articleUrl = _urlController.text.trim();
        String articleTitle = _digitalTitleController.text.trim();
        String articleBody = _digitalContentController.text.trim();

        if (articleBody.isEmpty && articleUrl.isNotEmpty) {
          final scraped = await _linkScraperService.scrapeArticle(articleUrl);
          if (scraped.title.isNotEmpty && articleTitle.isEmpty) articleTitle = scraped.title;
          if (scraped.content.isNotEmpty) articleBody = scraped.content;
          _scrapedSiteName = scraped.siteName;
        }

        if (articleTitle.isEmpty && articleUrl.isNotEmpty) {
          articleTitle = VisualCueService.extractHeadlineFromUrl(articleUrl);
        }

        final refBytes = _matchRealPersonLikeness ? _referenceImageBytes : null;

        result = await _geminiService.analyzeAndSummarizeDigitalArticle(
          articleUrl: articleUrl.isNotEmpty ? articleUrl : 'https://news.google.com',
          articleTitle: articleTitle.isNotEmpty ? articleTitle : 'Digital News Story',
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
          referenceImageBytes: refBytes,
          matchRealPersonLikeness: _matchRealPersonLikeness,
        );
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

      final isMySlant = _isInnerVoiceMode;
      final isLink = _sourceMode == InputSourceMode.digitalLink;
      final digitalUrl = isMySlant
          ? null
          : (isLink
              ? (_urlController.text.trim().isNotEmpty ? _urlController.text.trim() : result.digitalLink)
              : (_linkController.text.trim().isNotEmpty ? _linkController.text.trim() : null));

      final newItem = PostCardItem(
        id: itemId,
        createdAt: DateTime.now(),
        originalPhotoPath: isMySlant
            ? ''
            : (isLink
                ? (_urlController.text.trim().isNotEmpty ? _urlController.text.trim() : 'digital_article_link')
                : (_selectedImage?.path ?? 'sample_asset_print')),
        renderedPosterPath: savedPosterPath,
        originalHeadline: result.originalHeadline,
        publicationName: isMySlant
            ? "Inner Voice"
            : (isLink
                ? (_scrapedSiteName ?? result.publicationName)
                : (_activeSample?.publication ?? result.publicationName)),
        targetAudience: _targetAudience,
        tone: _selectedTone,
        userContext: _contextController.text.trim().isNotEmpty ? _contextController.text.trim() : null,
        hookCues: _hookCuesController.text.trim().isNotEmpty ? _hookCuesController.text.trim() : null,
        adaptedHeadline: result.adaptedHeadline,
        hook: result.hook,
        summary: result.summary,
        whyItMatters: result.whyItMatters,
        keyTakeaways: result.keyTakeaways,
        pullQuote: isMySlant
            ? (_refineCoreTake
                ? PostCardItem.sanitizeCompleteSentence(
                    result.pullQuote.trim().isNotEmpty
                        ? result.pullQuote
                        : (result.creatorOpinion ?? _contextController.text.trim()))
                : PostCardItem.sanitizeCompleteSentence(_contextController.text.trim()))
            : (result.pullQuote.trim().isNotEmpty ? result.pullQuote : _activeSample?.pullQuote),
        keyMetric: result.keyMetric.trim().isNotEmpty ? result.keyMetric : _activeSample?.metric,
        categoryBadge: isMySlant
            ? 'INNER VOICE'
            : (result.categoryBadge.trim().isNotEmpty
                ? result.categoryBadge
                : (_activeSample?.category ?? 'CURATED DIGEST')),
        digitalLink: digitalUrl,
        creatorOpinion: isMySlant
            ? (_refineCoreTake
                ? PostCardItem.sanitizeCompleteSentence(
                    (result.creatorOpinion != null && result.creatorOpinion!.trim().isNotEmpty)
                        ? result.creatorOpinion!
                        : (result.pullQuote.trim().isNotEmpty ? result.pullQuote : _contextController.text.trim()))
                : PostCardItem.sanitizeCompleteSentence(_contextController.text.trim()))
            : result.creatorOpinion,
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
        sourceType: isMySlant ? 'inner_voice' : (isLink ? 'digital_link' : 'photo'),
        slantTone: isMySlant ? _slantTone : result.slantTone,
        slantIcon: isMySlant ? '💭' : result.slantIcon,
        postFormat: 'carousel_trio',
        receiptHighlightQuote: isMySlant
            ? (_refineCoreTake
                ? PostCardItem.sanitizeCompleteSentence(result.receiptHighlightQuote ?? result.pullQuote)
                : PostCardItem.sanitizeCompleteSentence(_contextController.text.trim()))
            : (result.receiptHighlightQuote ?? result.pullQuote),
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
        originalPhotoBase64: _imageBytes != null
            ? base64Encode(_imageBytes!)
            : (_selectedImage != null && File(_selectedImage!.path).existsSync()
                ? base64Encode(File(_selectedImage!.path).readAsBytesSync())
                : null),
      );

      _populateControllersFromItem(newItem, isRegenerating: isRegenerating);

      setState(() {
        _generatedItem = newItem;
        _currentStyle = newItem.posterStyle;
        _isAnalyzing = false;
        _currentStep = SlantStep.resultPoster;
      });

      // Instantly sync newly created slant to slant.today & editour.app
      EditourCloudService().publishPost(newItem);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✨ 3-Poster Social Carousel created successfully!'),
            backgroundColor: Color(0xFF10B981),
            duration: Duration(seconds: 3),
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

  void _populateControllersFromItem(PostCardItem item, {bool isRegenerating = false}) {
    _headlineController.text = item.adaptedHeadline;
    _quoteController.text = item.pullQuote ?? '';
    _receiptQuoteController.text = item.receiptHighlightQuote ?? '';
    _metricController.text = item.keyMetric ?? '';
    _linkController.text = item.digitalLink ?? '';
    _opinionController.text = item.creatorOpinion ?? '';

    _s1CategoryController.text = item.categoryBadge;
    _s1PublicationController.text = item.publicationName ?? '';
    _s1ActualNewsExcerptController.text = (item.originalHeadline != null && item.originalHeadline!.isNotEmpty)
        ? item.originalHeadline!
        : item.hook;

    _s2TitleController.text = item.keyTakeaways.isNotEmpty ? item.keyTakeaways.first : 'THE CRITICAL PERSPECTIVE';
    _s2WhyItMattersController.text = item.whyItMatters ?? '';

    final excerpts = item.resolvedArticleExcerpts;
    _s3PublicationController.text = item.publicationName ?? '';
    _s3HeadlineController.text = item.originalHeadline ?? item.adaptedHeadline;
    _s3Excerpt1Controller.text = excerpts.isNotEmpty ? excerpts[0] : '';
    _s3Excerpt2Controller.text = excerpts.length > 1 ? excerpts[1] : '';
    _s3Excerpt3Controller.text = excerpts.length > 2 ? excerpts[2] : '';

    if (item.hookCues != null && item.hookCues!.isNotEmpty) {
      final parsed = VisualCueService.parsePillsFromPrompt(item.hookCues!);
      if (parsed.isNotEmpty) {
        _cueWordPills = parsed;
        _syncCuesController();
      }
    }
  }

  void _syncEditedFields() {
    if (_generatedItem == null) return;

    final updatedTakeaways = List<String>.from(_generatedItem!.keyTakeaways);
    if (_s2TitleController.text.trim().isNotEmpty) {
      if (updatedTakeaways.isNotEmpty) {
        updatedTakeaways[0] = _s2TitleController.text.trim();
      } else {
        updatedTakeaways.add(_s2TitleController.text.trim());
      }
    }

    final bool isMySlant = _generatedItem!.isMySlant;
    final List<String> updatedExcerpts = [
      if (_s3Excerpt1Controller.text.trim().isNotEmpty)
        PostCardItem.sanitizeCompleteSentence(_s3Excerpt1Controller.text.trim()),
      if (_s3Excerpt2Controller.text.trim().isNotEmpty)
        PostCardItem.sanitizeCompleteSentence(_s3Excerpt2Controller.text.trim()),
      if (_s3Excerpt3Controller.text.trim().isNotEmpty)
        PostCardItem.sanitizeCompleteSentence(_s3Excerpt3Controller.text.trim()),
    ];

    setState(() {
      _generatedItem = _generatedItem!.copyWith(
        categoryBadge: _s1CategoryController.text.trim().isNotEmpty
            ? _s1CategoryController.text.trim()
            : _generatedItem!.categoryBadge,
        publicationName: _s1PublicationController.text.trim().isNotEmpty
            ? _s1PublicationController.text.trim()
            : _generatedItem!.publicationName,
        originalHeadline: _s1ActualNewsExcerptController.text.trim().isNotEmpty
            ? _s1ActualNewsExcerptController.text.trim()
            : _generatedItem!.originalHeadline,
        hook: _s1ActualNewsExcerptController.text.trim().isNotEmpty
            ? PostCardItem.sanitizeCompleteSentence(_s1ActualNewsExcerptController.text.trim())
            : _generatedItem!.hook,
        adaptedHeadline: _headlineController.text.trim().isNotEmpty
            ? _headlineController.text.trim()
            : _generatedItem!.adaptedHeadline,
        creatorOpinion: _opinionController.text.trim().isNotEmpty
            ? PostCardItem.sanitizeCompleteSentence(_opinionController.text.trim())
            : _generatedItem!.creatorOpinion,
        whyItMatters: _s2WhyItMattersController.text.trim().isNotEmpty
            ? PostCardItem.sanitizeCompleteSentence(_s2WhyItMattersController.text.trim())
            : _generatedItem!.whyItMatters,
        keyTakeaways: updatedTakeaways.isNotEmpty ? updatedTakeaways.map((t) => PostCardItem.sanitizeCompleteSentence(t)).toList() : _generatedItem!.keyTakeaways,
        pullQuote: _quoteController.text.trim().isNotEmpty ? PostCardItem.sanitizeCompleteSentence(_quoteController.text.trim()) : null,
        keyMetric: _metricController.text.trim().isNotEmpty ? _metricController.text.trim() : null,
        receiptHighlightQuote: isMySlant && _s3Excerpt2Controller.text.trim().isNotEmpty
            ? PostCardItem.sanitizeCompleteSentence(_s3Excerpt2Controller.text.trim())
            : _generatedItem!.receiptHighlightQuote,
        articleExcerpts: isMySlant && updatedExcerpts.isNotEmpty
            ? updatedExcerpts
            : _generatedItem!.articleExcerpts,
        slantTone: isMySlant ? _slantTone : _generatedItem!.slantTone,
        slantIcon: isMySlant ? (_slantTone == 'heart' ? '❤️' : '🧠') : _generatedItem!.slantIcon,
        creatorHandle: _creatorHandleController.text.trim().isNotEmpty
            ? _creatorHandleController.text.trim()
            : '@curator',
        isUserCreated: true,
      );
    });
  }

  // --- Step 3 Actions ---

  Future<void> _downloadCarouselToGallerySlant() async {
    if (_generatedItem == null || _isExporting) return;
    setState(() => _isExporting = true);

    try {
      final bytesList = await _carouselStudioKey.currentState?.captureAllSlides();
      if (bytesList != null && bytesList.isNotEmpty) {
        final paths = await GalleryService.downloadCarouselToSlantFolder(
          slideBytesList: bytesList,
          title: _generatedItem!.adaptedHeadline,
        );
        if (mounted) {
          setState(() => _isDownloaded = true);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Row(
                children: [
                  const Icon(Icons.check_circle, color: Colors.white, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text('Downloaded ${paths.length} posters to Gallery (Slant folder)!'),
                  ),
                ],
              ),
              backgroundColor: const Color(0xFF10B981),
              duration: const Duration(seconds: 4),
              action: SnackBarAction(
                label: 'Go Home',
                textColor: Colors.white,
                onPressed: () => _returnToHome(targetTabIndex: 0),
              ),
            ),
          );
        }
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not capture posters. Please try again.')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Download failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isExporting = false);
    }
  }

  void _returnToHome({int targetTabIndex = 0}) {
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(
        builder: (_) => MainNavigationShell(initialIndex: targetTabIndex),
      ),
      (route) => false,
    );
  }

  void _showSaveSuccessSheet() {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      backgroundColor: Theme.of(context).colorScheme.surface,
      builder: (ctx) {
        final theme = Theme.of(ctx);
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 36,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.grey.withValues(alpha: 0.4),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Center(
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFF10B981).withValues(alpha: 0.12),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.check_circle_rounded,
                      color: Color(0xFF10B981),
                      size: 36,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Saved to My Posts! 🎉',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                ),
                const SizedBox(height: 6),
                Text(
                  'Your 3-poster deck is stored safely in your app archive and published to the feed.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12.5, color: theme.colorScheme.onSurfaceVariant),
                ),
                const SizedBox(height: 20),
                FilledButton.icon(
                  onPressed: () {
                    Navigator.pop(ctx);
                    _returnToHome(targetTabIndex: 0);
                  },
                  icon: const Icon(Icons.home_rounded, size: 18),
                  label: const Text('Return to Home Feed', style: TextStyle(fontWeight: FontWeight.bold)),
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: () {
                    Navigator.pop(ctx);
                    _returnToHome(targetTabIndex: 1);
                  },
                  icon: const Icon(Icons.collections_bookmark_outlined, size: 18),
                  label: const Text('View in My Posts', style: TextStyle(fontWeight: FontWeight.bold)),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
                const SizedBox(height: 4),
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Stay on Poster Deck'),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showExitConfirmationDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Row(
          children: [
            Icon(Icons.home_rounded, color: Color(0xFF6366F1)),
            SizedBox(width: 8),
            Text('Finished with Poster?', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
          ],
        ),
        content: const Text(
          'Would you like to return to the Home Feed or go back to tweak visual cues and angle?',
          style: TextStyle(fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              setState(() => _currentStep = SlantStep.visualCues);
            },
            child: const Text('Tweak Cues'),
          ),
          FilledButton.icon(
            onPressed: () {
              Navigator.pop(ctx);
              _returnToHome(targetTabIndex: 0);
            },
            icon: const Icon(Icons.home_rounded, size: 16),
            label: const Text('Return to Home'),
          ),
        ],
      ),
    );
  }

  Future<void> _saveToMyPosts() async {
    if (_generatedItem == null) return;
    try {
      _syncEditedFields();
      await _storageService.savePostCard(_generatedItem!);
      await _storageService.setCreatorHandle(_creatorHandleController.text.trim());
      EditourCloudService().publishPost(_generatedItem!);
      if (mounted) {
        setState(() => _isSaved = true);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Row(
              children: [
                Icon(Icons.bookmark_added, color: Colors.greenAccent, size: 20),
                SizedBox(width: 8),
                Text('💾 Saved to My Posts in app!'),
              ],
            ),
            backgroundColor: const Color(0xFF0F172A),
            duration: const Duration(seconds: 4),
            action: SnackBarAction(
              label: 'Go Home',
              textColor: const Color(0xFF818CF8),
              onPressed: () => _returnToHome(targetTabIndex: 0),
            ),
          ),
        );
        _showSaveSuccessSheet();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to save: $e')),
        );
      }
    }
  }

  Future<void> _shareCarousel() async {
    if (_generatedItem == null || _isExporting) return;
    setState(() => _isExporting = true);
    try {
      final bytesList = await _carouselStudioKey.currentState?.captureAllSlides();
      if (bytesList != null && bytesList.isNotEmpty && mounted) {
        await _shareService.shareCarouselTrio(
          item: _generatedItem!,
          slideBytes: bytesList,
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Share failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isExporting = false);
    }
  }

  void _handleRegenerate() {
    setState(() {
      _isSaved = false;
      _isDownloaded = false;
      _currentStep = SlantStep.visualCues;
    });
  }

  void _showEditPosterModalBottomSheet(BuildContext context, {int initialTab = 0}) {
    int activeEditTab = initialTab;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (ctx, setSheetState) {
            final theme = Theme.of(ctx);
            final bottomInset = MediaQuery.of(ctx).viewInsets.bottom;
            final isSlantPost = (_generatedItem?.isMySlant == true) || (_sourceMode == InputSourceMode.mySlant);

            return Padding(
              padding: EdgeInsets.fromLTRB(16, 12, 16, 20 + bottomInset),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
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
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        const Icon(Icons.edit_note_rounded, size: 22),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Edit Carousel Slide Content',
                            style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close, size: 20),
                          onPressed: () => Navigator.of(sheetContext).pop(),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),

                    // 3-Slide Tabs
                    Container(
                      decoration: BoxDecoration(
                        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      padding: const EdgeInsets.all(3),
                      child: Row(
                        children: [
                          _buildModalTabButton(
                            title: 'Slide 1: Hook',
                            isSelected: activeEditTab == 0,
                            onTap: () => setSheetState(() => activeEditTab = 0),
                            theme: theme,
                          ),
                          _buildModalTabButton(
                            title: 'Slide 2: Take',
                            isSelected: activeEditTab == 1,
                            onTap: () => setSheetState(() => activeEditTab = 1),
                            theme: theme,
                          ),
                          _buildModalTabButton(
                            title: isSlantPost ? 'Slide 3: Inner Voice ✏️' : 'Slide 3: Receipts 🔒',
                            isSelected: activeEditTab == 2,
                            onTap: () => setSheetState(() => activeEditTab = 2),
                            theme: theme,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    if (activeEditTab == 0) ...[
                      // Slide 1 editable fields
                      TextField(
                        controller: _s1CategoryController,
                        decoration: const InputDecoration(
                          labelText: 'Topic Category Badge',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _s1PublicationController,
                        decoration: const InputDecoration(
                          labelText: 'Source Publication Outlet',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _headlineController,
                        decoration: InputDecoration(
                          labelText: isSlantPost ? 'Hook Headline (The Angle / Stance)' : 'Hook Headline (The Angle)',
                          border: const OutlineInputBorder(),
                          isDense: true,
                        ),
                        maxLines: 2,
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _s1ActualNewsExcerptController,
                        decoration: InputDecoration(
                          labelText: isSlantPost
                              ? '💭 The Spark (Clipping Excerpt)'
                              : 'Newsprint Fragment Excerpt',
                          border: const OutlineInputBorder(),
                          isDense: true,
                        ),
                        maxLines: 2,
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _creatorHandleController,
                        decoration: const InputDecoration(
                          labelText: 'Creator Handle',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                    ] else if (activeEditTab == 1) ...[
                      // Slide 2 editable fields
                      TextField(
                        controller: _s2TitleController,
                        decoration: const InputDecoration(
                          labelText: 'Stance Title / Kicker Tag',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _opinionController,
                        decoration: const InputDecoration(
                          labelText: 'Curator Opinion Take',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                        maxLines: 3,
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _s2WhyItMattersController,
                        decoration: const InputDecoration(
                          labelText: 'Why It Matters Callout',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                        maxLines: 2,
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _metricController,
                        decoration: const InputDecoration(
                          labelText: 'Key Metric / Stat (Optional)',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                    ] else ...[
                      // Slide 3: My Slant vs Locked Receipt
                      if (isSlantPost) ...[
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          margin: const EdgeInsets.only(bottom: 12),
                          decoration: BoxDecoration(
                            color: const Color(0xFF7C3AED).withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: const Color(0xFF7C3AED).withValues(alpha: 0.3)),
                          ),
                          child: Row(
                            children: [
                              Text(_slantTone == 'heart' ? '❤️' : '🧠', style: const TextStyle(fontSize: 16)),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  "Inner Voice (${_slantTone == 'heart' ? 'Out of Heart' : 'Out of Mind'})",
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Color(0xFF7C3AED)),
                                ),
                              ),
                              InkWell(
                                onTap: () {
                                  setSheetState(() {
                                    _slantTone = _slantTone == 'heart' ? 'mind' : 'heart';
                                  });
                                },
                                borderRadius: BorderRadius.circular(6),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF7C3AED).withValues(alpha: 0.2),
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    _slantTone == 'heart' ? 'Switch to 🧠 Mind' : 'Switch to ❤️ Heart',
                                    style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF7C3AED)),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        TextField(
                          controller: _s3HeadlineController,
                          decoration: const InputDecoration(
                            labelText: "Inner Voice Broadsheet Headline",
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                          maxLines: 2,
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: _s3Excerpt2Controller,
                          decoration: const InputDecoration(
                            labelText: 'Core Highlight Quote (Yellow Broadsheet Highlight)',
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                          maxLines: 3,
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: _s3Excerpt1Controller,
                          decoration: const InputDecoration(
                            labelText: 'Paragraph 1: Catalyzing Observation / Context',
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                          maxLines: 3,
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: _s3Excerpt3Controller,
                          decoration: const InputDecoration(
                            labelText: 'Paragraph 3: Concluding Reflection / Implication',
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                          maxLines: 3,
                        ),
                      ] else ...[
                        // Slide 3 LOCKED / IMMUTABLE for registered press, web commentary, book excerpts
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFEF3C7),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: const Color(0xFFF59E0B)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Row(
                                children: [
                                  Icon(Icons.lock_rounded, color: Color(0xFFB45309), size: 18),
                                  SizedBox(width: 8),
                                  Text(
                                    'Direct from source — immutable',
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 13,
                                      color: Color(0xFFB45309),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              const Text(
                                'Slide 3 contains verbatim primary source reporting and receipts. To maintain journalistic authenticity and reader trust, verbatim broadsheet excerpts cannot be edited.',
                                style: TextStyle(fontSize: 11.5, color: Color(0xFF78350F), height: 1.35),
                              ),
                              const Divider(height: 18, color: Color(0xFFFDE68A)),
                              Text('Masthead: ${_s3PublicationController.text}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 11.5, color: Colors.black87)),
                              const SizedBox(height: 4),
                              Text('Headline: ${_s3HeadlineController.text}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 11.5, color: Colors.black87)),
                              if (_s3Excerpt1Controller.text.isNotEmpty) ...[
                                const SizedBox(height: 6),
                                Text('• "${_s3Excerpt1Controller.text}"', style: const TextStyle(fontSize: 10.5, fontStyle: FontStyle.italic, color: Colors.black87)),
                              ],
                              if (_s3Excerpt2Controller.text.isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Text('• "${_s3Excerpt2Controller.text}"', style: const TextStyle(fontSize: 10.5, fontStyle: FontStyle.italic, color: Colors.black87)),
                              ],
                            ],
                          ),
                        ),
                      ],
                    ],

                    const SizedBox(height: 18),
                    FilledButton.icon(
                      onPressed: () {
                        _syncEditedFields();
                        Navigator.of(sheetContext).pop();
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('✏️ Poster updated with edits!'),
                            backgroundColor: Color(0xFF10B981),
                            duration: Duration(seconds: 2),
                          ),
                        );
                      },
                      icon: const Icon(Icons.check, size: 18),
                      label: const Text('Save Changes & Update Posters', style: TextStyle(fontWeight: FontWeight.bold)),
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 13),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildModalTabButton({
    required String title,
    required bool isSelected,
    required VoidCallback onTap,
    required ThemeData theme,
  }) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: isSelected ? theme.colorScheme.primary : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          alignment: Alignment.center,
          child: Text(
            title,
            style: TextStyle(
              fontSize: 11,
              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
              color: isSelected ? Colors.white : theme.colorScheme.onSurface,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ),
    );
  }

  // --- Step Indicator ---

  Widget _buildStepIndicator(ThemeData theme) {
    return Container(
      margin: const EdgeInsets.fromLTRB(14, 8, 14, 12),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          _buildStepPill(
            stepNumber: 1,
            label: 'Slant & Source',
            isActive: _currentStep == SlantStep.sourceAndAngle,
            isCompleted: _currentStep == SlantStep.visualCues || _currentStep == SlantStep.resultPoster,
            theme: theme,
            onTap: () {
              setState(() => _currentStep = SlantStep.sourceAndAngle);
            },
          ),
          Container(width: 14, height: 1.5, color: Colors.grey.withValues(alpha: 0.3)),
          _buildStepPill(
            stepNumber: 2,
            label: 'Visual Cues',
            isActive: _currentStep == SlantStep.visualCues,
            isCompleted: _currentStep == SlantStep.resultPoster,
            theme: theme,
            onTap: () {
              if (_selectedImage != null || _activeSample != null || _urlController.text.trim().isNotEmpty || _contextController.text.trim().isNotEmpty || _slantThoughtController.text.trim().isNotEmpty) {
                setState(() => _currentStep = SlantStep.visualCues);
              }
            },
          ),
          Container(width: 14, height: 1.5, color: Colors.grey.withValues(alpha: 0.3)),
          _buildStepPill(
            stepNumber: 3,
            label: '3 Posters',
            isActive: _currentStep == SlantStep.resultPoster,
            isCompleted: false,
            theme: theme,
            onTap: () {
              if (_generatedItem != null) {
                setState(() => _currentStep = SlantStep.resultPoster);
              }
            },
          ),
        ],
      ),
    );
  }

  Widget _buildStepPill({
    required int stepNumber,
    required String label,
    required bool isActive,
    required bool isCompleted,
    required ThemeData theme,
    required VoidCallback onTap,
  }) {
    final activeColor = theme.colorScheme.primary;
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 4),
          decoration: BoxDecoration(
            color: isActive ? activeColor.withValues(alpha: 0.15) : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
            border: isActive ? Border.all(color: activeColor.withValues(alpha: 0.5)) : null,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 18,
                height: 18,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: isCompleted
                      ? const Color(0xFF10B981)
                      : (isActive ? activeColor : Colors.grey.withValues(alpha: 0.3)),
                ),
                alignment: Alignment.center,
                child: isCompleted
                    ? const Icon(Icons.check, size: 12, color: Colors.white)
                    : Text(
                        '$stepNumber',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          color: isActive ? Colors.white : Colors.grey.shade700,
                        ),
                      ),
              ),
              const SizedBox(width: 5),
              Flexible(
                child: Text(
                  label,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: isActive ? FontWeight.bold : FontWeight.w500,
                    color: isActive ? activeColor : theme.colorScheme.onSurfaceVariant,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return PopScope(
      canPop: _currentStep == SlantStep.sourceAndAngle,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        if (_currentStep == SlantStep.resultPoster) {
          _showExitConfirmationDialog();
        } else if (_currentStep == SlantStep.visualCues) {
          setState(() => _currentStep = SlantStep.sourceAndAngle);
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(
            _currentStep == SlantStep.resultPoster
                ? 'Slant • 3-Poster Carousel'
                : (_currentStep == SlantStep.visualCues
                    ? 'Slant • Visual Cues'
                    : (_isInnerVoiceMode
                        ? 'Slant • Inner Voice'
                        : (_sourceMode == InputSourceMode.digitalLink ? 'Slant • Web Commentary' : 'Slant • Magazine'))),
          ),
          actions: [
            if (_generatedItem != null && _currentStep == SlantStep.resultPoster) ...[
              TextButton.icon(
                onPressed: () => _returnToHome(targetTabIndex: 0),
                icon: const Icon(Icons.check_circle_outline_rounded, size: 18),
                label: const Text('Done', style: TextStyle(fontWeight: FontWeight.bold)),
              ),
            ],
          ],
        ),
        body: _isAnalyzing
            ? _buildAnalyzingOverlay(theme)
            : Column(
                children: [
                  _buildStepIndicator(theme),
                  Expanded(
                    child: SingleChildScrollView(
                      padding: EdgeInsets.fromLTRB(
                        14,
                        0,
                        14,
                        _currentStep == SlantStep.resultPoster ? 36 : 24,
                      ),
                      child: SafeArea(
                        top: false,
                        child: _buildCurrentStepContent(theme),
                      ),
                    ),
                  ),
                ],
              ),
        bottomNavigationBar: _buildBottomBar(theme),
      ),
    );
  }

  Widget? _buildBottomBar(ThemeData theme) {
    if (_isAnalyzing) return null;

    if (_currentStep == SlantStep.sourceAndAngle) {
      return Container(
        decoration: BoxDecoration(
          color: theme.scaffoldBackgroundColor,
          border: Border(
            top: BorderSide(
              color: theme.colorScheme.outlineVariant.withValues(alpha: 0.35),
              width: 1,
            ),
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.06),
              blurRadius: 10,
              offset: const Offset(0, -4),
            ),
          ],
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
            child: SizedBox(
              width: double.infinity,
              height: 52,
              child: FilledButton.icon(
                onPressed: _goToVisualCuesStep,
                icon: const Icon(Icons.arrow_forward_rounded, size: 20),
                label: const Text(
                  'Next: Visual Cues →',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, letterSpacing: 0.3),
                ),
                style: FilledButton.styleFrom(
                  elevation: 2,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
              ),
            ),
          ),
        ),
      );
    } else if (_currentStep == SlantStep.visualCues) {
      return Container(
        decoration: BoxDecoration(
          color: theme.scaffoldBackgroundColor,
          border: Border(
            top: BorderSide(
              color: theme.colorScheme.outlineVariant.withValues(alpha: 0.35),
              width: 1,
            ),
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.06),
              blurRadius: 10,
              offset: const Offset(0, -4),
            ),
          ],
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
            child: SizedBox(
              width: double.infinity,
              height: 52,
              child: FilledButton.icon(
                onPressed: _isAnalyzing ? null : () => _runAnalysis(),
                icon: const Icon(Icons.auto_awesome, size: 20),
                label: Text(
                  _sourceMode == InputSourceMode.mySlant
                      ? 'Synthesize Inner Voice Carousel'
                      : 'Generate 3-Poster Social Carousel',
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, letterSpacing: 0.3),
                ),
                style: FilledButton.styleFrom(
                  elevation: 2,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
              ),
            ),
          ),
        ),
      );
    }

    return null;
  }

  Widget _buildCurrentStepContent(ThemeData theme) {
    switch (_currentStep) {
      case SlantStep.sourceAndAngle:
        return _buildStep1SourceAndAngle(theme);
      case SlantStep.visualCues:
        return _buildStep2VisualCues(theme);
      case SlantStep.resultPoster:
        return _buildStep3ResultPoster(theme);
    }
  }

  // ================= STEP 1: Source & Angle =================

  Widget _buildStep1SourceAndAngle(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // 1. Top Hero: The Slant / Angle Prompt Box
        _buildHeroSlantPromptCard(theme),

        const SizedBox(height: 16),

        // 2. Middle: The 3 Root Anchors (Magazine, Web Commentary, Inner Voice)
        _buildSourceAnchorSelector(theme),

        const SizedBox(height: 16),

        // 3. Dynamic Lower Panel (What sparked this / Source Input)
        _buildDynamicAnchorTriggerPanel(theme),

        const SizedBox(height: 24),
      ],
    );
  }

  Widget _buildHeroSlantPromptCard(ThemeData theme) {
    final isInnerVoice = _isInnerVoiceMode;
    final isDark = theme.brightness == Brightness.dark;

    final String cardTitle;
    final String cardSubtitle;
    final String hintText;
    final IconData titleIcon;
    final Color iconColor;
    final String tagLabel;
    final Color tagColor;

    if (isInnerVoice) {
      cardTitle = 'What is your Slant or Perspective?';
      cardSubtitle = 'Express your conviction or reflection freely. AI transforms this into your lead take.';
      hintText = 'What perspective demands to be shared? e.g. The real risk of AI isn’t superintelligence taking over, it’s that we surrender our curiosity and critical judgment to automated convenience...';
      titleIcon = Icons.record_voice_over_rounded;
      iconColor = const Color(0xFF8B5CF6);
      tagLabel = 'Required';
      tagColor = const Color(0xFF8B5CF6);
    } else if (_sourceMode == InputSourceMode.physicalPhoto) {
      cardTitle = 'Your Slant / Take (Optional)';
      cardSubtitle = 'Write your unique angle, stance, or critique on this story (or leave empty to let AI deduce it).';
      hintText = 'e.g. Beyond the raw numbers, this shifts the balance of power between legacy media and digital creators...';
      titleIcon = Icons.menu_book_rounded;
      iconColor = const Color(0xFF0D9488);
      tagLabel = 'Optional';
      tagColor = theme.colorScheme.onSurfaceVariant;
    } else {
      cardTitle = 'Your Slant / Take (Optional)';
      cardSubtitle = 'Write your unique angle, stance, or critique on this story (or leave empty to let AI deduce it).';
      hintText = 'e.g. The headline misses the real structural disruption happening behind the scenes...';
      titleIcon = Icons.language_rounded;
      iconColor = const Color(0xFF0284C7);
      tagLabel = 'Optional';
      tagColor = theme.colorScheme.onSurfaceVariant;
    }

    return Card(
      elevation: 0,
      color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: isDark ? 0.35 : 0.45),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: isInnerVoice
              ? const Color(0xFF8B5CF6).withValues(alpha: 0.35)
              : theme.colorScheme.outlineVariant.withValues(alpha: 0.4),
          width: isInnerVoice ? 1.5 : 1.0,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: iconColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(titleIcon, size: 18, color: iconColor),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    cardTitle,
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13.5),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2.5),
                  decoration: BoxDecoration(
                    color: tagColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    tagLabel,
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: tagColor,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 5),
            Text(
              cardSubtitle,
              style: TextStyle(fontSize: 11.5, color: theme.colorScheme.onSurfaceVariant, height: 1.3),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _contextController,
              decoration: InputDecoration(
                hintText: hintText,
                hintStyle: TextStyle(
                  fontSize: 12.5,
                  color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.7),
                  height: 1.35,
                ),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                filled: true,
                fillColor: theme.colorScheme.surface,
                alignLabelWithHint: true,
                contentPadding: const EdgeInsets.all(12),
              ),
              maxLines: 5,
              minLines: 4,
              onChanged: (val) {
                _slantThoughtController.text = val;
                if (_cueWordPills.isEmpty) {
                  _autoSuggestCueKeywords();
                }
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSourceAnchorSelector(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              'ROOT YOUR SLANT IN',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.8,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1.5),
              decoration: BoxDecoration(
                color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                'Source Anchor',
                style: TextStyle(
                  fontSize: 9.5,
                  fontWeight: FontWeight.w600,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            // 1. Magazine
            Expanded(
              child: _buildAnchorTabCard(
                theme: theme,
                title: 'Magazine',
                subtitle: 'Print clipping',
                icon: Icons.menu_book_rounded,
                mode: InputSourceMode.physicalPhoto,
                accentColor: const Color(0xFF0D9488),
              ),
            ),
            const SizedBox(width: 8),
            // 2. Web Commentary
            Expanded(
              child: _buildAnchorTabCard(
                theme: theme,
                title: 'Web',
                subtitle: 'Citation link',
                icon: Icons.language_rounded,
                mode: InputSourceMode.digitalLink,
                accentColor: const Color(0xFF0284C7),
              ),
            ),
            const SizedBox(width: 8),
            // 3. Inner Voice
            Expanded(
              child: _buildAnchorTabCard(
                theme: theme,
                title: 'Inner Voice',
                subtitle: 'Personal take',
                icon: Icons.record_voice_over_rounded,
                mode: InputSourceMode.mySlant,
                accentColor: const Color(0xFF8B5CF6),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildAnchorTabCard({
    required ThemeData theme,
    required String title,
    required String subtitle,
    required IconData icon,
    required InputSourceMode mode,
    required Color accentColor,
  }) {
    final isSelected = (mode == InputSourceMode.mySlant)
        ? _isInnerVoiceMode
        : (_sourceMode == mode);
    final isDark = theme.brightness == Brightness.dark;

    return InkWell(
      onTap: () {
        setState(() {
          _sourceMode = mode;
          if (_contextController.text.trim().isNotEmpty) {
            _slantThoughtController.text = _contextController.text.trim();
          } else if (_slantThoughtController.text.trim().isNotEmpty) {
            _contextController.text = _slantThoughtController.text.trim();
          }
        });
      },
      borderRadius: BorderRadius.circular(12),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
        decoration: BoxDecoration(
          color: isSelected
              ? accentColor.withValues(alpha: isDark ? 0.22 : 0.12)
              : theme.colorScheme.surfaceContainerHighest.withValues(alpha: isDark ? 0.3 : 0.4),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? accentColor : theme.colorScheme.outlineVariant.withValues(alpha: 0.3),
            width: isSelected ? 1.8 : 1.0,
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(7),
              decoration: BoxDecoration(
                color: isSelected ? accentColor.withValues(alpha: 0.25) : Colors.transparent,
                shape: BoxShape.circle,
              ),
              child: Icon(
                icon,
                size: 20,
                color: isSelected ? accentColor : theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              title,
              style: TextStyle(
                fontSize: 12,
                fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
                color: isSelected
                    ? (isDark ? Colors.white : accentColor)
                    : theme.colorScheme.onSurface,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 2),
            Text(
              subtitle,
              style: TextStyle(
                fontSize: 9.5,
                color: theme.colorScheme.onSurfaceVariant,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDynamicAnchorTriggerPanel(ThemeData theme) {
    if (_isInnerVoiceMode) {
      return _buildInnerVoiceAnchorTriggerSection(theme);
    } else if (_sourceMode == InputSourceMode.physicalPhoto) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.newspaper_rounded, size: 16, color: Color(0xFF0D9488)),
              const SizedBox(width: 6),
              const Text(
                'Source Clipping Photo',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
              ),
              const Spacer(),
              Text(
                'Camera or Gallery',
                style: TextStyle(fontSize: 10.5, color: theme.colorScheme.onSurfaceVariant),
              ),
            ],
          ),
          const SizedBox(height: 8),
          _buildSnapSourceSection(theme),
        ],
      );
    } else {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.link_rounded, size: 16, color: Color(0xFF0284C7)),
              const SizedBox(width: 6),
              const Text(
                'Source Web Link',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
              ),
              const Spacer(),
              Text(
                'Paste & Fetch',
                style: TextStyle(fontSize: 10.5, color: theme.colorScheme.onSurfaceVariant),
              ),
            ],
          ),
          const SizedBox(height: 8),
          _buildWeblinkSourceSection(theme),
        ],
      );
    }
  }

  Widget _buildInnerVoiceAnchorTriggerSection(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // The Spark (What stirred / provoked this?) - Optional Catalyst Card (Under 10-15 words)
        Card(
          elevation: 0,
          color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: BorderSide(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.4)),
          ),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(
                      Icons.bolt_rounded,
                      size: 16,
                      color: Color(0xFFF59E0B),
                    ),
                    const SizedBox(width: 6),
                    const Text(
                      'The Spark (What sparked this?)',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                    ),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(5),
                      ),
                      child: Text(
                        'Optional • Under 15 words',
                        style: TextStyle(
                          fontSize: 9.5,
                          fontWeight: FontWeight.w600,
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  'The real-world observation, memory, or moment that triggered this perspective.',
                  style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurfaceVariant),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _slantSparkController,
                  decoration: InputDecoration(
                    hintText: 'e.g. A conversation with an old colleague about vanishing craft...',
                    hintStyle: TextStyle(
                      fontSize: 12,
                      color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.7),
                    ),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                    filled: true,
                    fillColor: theme.colorScheme.surface,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  ),
                  maxLines: 2,
                  minLines: 1,
                ),
              ],
            ),
          ),
        ),

        const SizedBox(height: 12),

        // Core Take Representation Mode Card (Refined vs As-Is / Verbatim)
        Card(
          elevation: 0,
          color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.25),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: BorderSide(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.35)),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(7),
                  decoration: BoxDecoration(
                    color: _refineCoreTake
                        ? const Color(0xFFF59E0B).withValues(alpha: 0.15)
                        : Colors.grey.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    _refineCoreTake ? Icons.auto_awesome : Icons.format_quote_rounded,
                    size: 18,
                    color: _refineCoreTake ? const Color(0xFFD97706) : Colors.grey,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            _refineCoreTake ? 'Refine Core Take with AI' : 'Use Core Take As-Is',
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                          ),
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1.5),
                            decoration: BoxDecoration(
                              color: _refineCoreTake
                                  ? const Color(0xFFF59E0B).withValues(alpha: 0.15)
                                  : Colors.grey.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              _refineCoreTake ? 'Refined' : 'Verbatim',
                              style: TextStyle(
                                fontSize: 9.5,
                                fontWeight: FontWeight.w700,
                                color: _refineCoreTake ? const Color(0xFFD97706) : Colors.grey.shade700,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _refineCoreTake
                            ? 'AI polishes and sharpens your raw thought into a punchy poster quote.'
                            : 'Keeps your exact typed words verbatim on the poster slides without rephrasing.',
                        style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
                Switch.adaptive(
                  value: _refineCoreTake,
                  activeTrackColor: const Color(0xFFF59E0B),
                  onChanged: (val) {
                    setState(() {
                      _refineCoreTake = val;
                    });
                  },
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildSnapSourceSection(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_selectedImage != null || _activeSample != null) ...[
          Container(
            decoration: BoxDecoration(
              color: const Color(0xFF0F172A),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5)),
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Visual Photo Preview Container (Interactive: Tap to Zoom/Inspect)
                GestureDetector(
                  onTap: () {
                    PhotoViewerDialog.show(
                      context,
                      imageBytes: _imageBytes,
                      photoPath: _selectedImage?.path,
                      headline: _isCropped ? 'Cropped Article Cut-Out' : 'Your Snapped Newspaper Photo',
                    );
                  },
                  child: Stack(
                    children: [
                      Container(
                        height: 180,
                        width: double.infinity,
                        color: Colors.black,
                        child: _imageBytes != null
                            ? Image.memory(
                                _imageBytes!,
                                fit: BoxFit.contain,
                              )
                            : const Center(
                                child: Icon(Icons.newspaper, color: Colors.white60, size: 48),
                              ),
                      ),
                      // Top Left Badge
                      Positioned(
                        top: 8,
                        left: 8,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.75),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: _isCropped ? const Color(0xFF10B981) : Colors.white38,
                              width: 1.2,
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                _isCropped ? Icons.check_circle : Icons.camera_alt_outlined,
                                size: 12,
                                color: _isCropped ? const Color(0xFF10B981) : Colors.white70,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                _activeSample != null
                                    ? _activeSample!.publication
                                    : (_isCropped ? 'Article Cut-Out Ready' : 'Print Photo Ready'),
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      // Tap hint
                      Positioned(
                        top: 8,
                        right: 8,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.6),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.zoom_in, size: 12, color: Colors.white70),
                              SizedBox(width: 3),
                              Text(
                                'Tap to inspect',
                                style: TextStyle(color: Colors.white70, fontSize: 9.5),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

                // Control Toolbar (Rotate, Recut, Inspect, Retake)
                Container(
                  color: theme.colorScheme.surface,
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  child: Row(
                    children: [
                      // Rotate 90° Button
                      FilledButton.tonalIcon(
                        onPressed: _rotateImage,
                        icon: const Icon(Icons.rotate_right_rounded, size: 17),
                        label: const Text('Rotate 90°', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold)),
                        style: FilledButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                          visualDensity: VisualDensity.compact,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                      ),
                      const SizedBox(width: 6),

                      // Recut / Crop Button
                      OutlinedButton.icon(
                        onPressed: () => _cropImage(),
                        icon: const Icon(Icons.crop, size: 16),
                        label: const Text('Recut', style: TextStyle(fontSize: 11.5)),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                          visualDensity: VisualDensity.compact,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                      ),
                      const Spacer(),

                      // Zoom & Inspect Button
                      IconButton(
                        tooltip: 'Zoom & Inspect',
                        icon: const Icon(Icons.zoom_in, size: 21),
                        onPressed: () {
                          PhotoViewerDialog.show(
                            context,
                            imageBytes: _imageBytes,
                            photoPath: _selectedImage?.path,
                            headline: _isCropped ? 'Cropped Article Cut-Out' : 'Your Snapped Newspaper Photo',
                          );
                        },
                      ),

                      // Retake Button
                      IconButton(
                        tooltip: 'Retake Photo',
                        icon: const Icon(Icons.camera_alt_outlined, size: 20),
                        onPressed: () => _pickImage(ImageSource.camera),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ] else ...[
          Container(
            height: 96,
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: theme.colorScheme.outlineVariant.withValues(alpha: 0.6),
                width: 1.2,
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: InkWell(
                    onTap: () => _pickImage(ImageSource.camera),
                    borderRadius: const BorderRadius.horizontal(left: Radius.circular(14)),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(7),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primary.withValues(alpha: 0.12),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(Icons.camera_alt, size: 22, color: theme.colorScheme.primary),
                        ),
                        const SizedBox(height: 5),
                        const Text(
                          'Camera',
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                        ),
                        const SizedBox(height: 1),
                        Text(
                          'Snap print article',
                          style: TextStyle(fontSize: 9.5, color: theme.colorScheme.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                ),
                Container(
                  height: 44,
                  width: 1,
                  color: theme.colorScheme.outlineVariant.withValues(alpha: 0.4),
                ),
                Expanded(
                  child: InkWell(
                    onTap: () => _pickImage(ImageSource.gallery),
                    borderRadius: const BorderRadius.horizontal(right: Radius.circular(14)),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(7),
                          decoration: BoxDecoration(
                            color: const Color(0xFF0284C7).withValues(alpha: 0.12),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.photo_library, size: 22, color: Color(0xFF0284C7)),
                        ),
                        const SizedBox(height: 5),
                        const Text(
                          'Upload',
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                        ),
                        const SizedBox(height: 1),
                        Text(
                          'Pick from gallery',
                          style: TextStyle(fontSize: 9.5, color: theme.colorScheme.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildWeblinkSourceSection(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _urlController,
          decoration: InputDecoration(
            labelText: 'News Article URL',
            hintText: 'https://...',
            prefixIcon: const Icon(Icons.link),
            suffixIcon: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_isFetchingUrl)
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 10),
                    child: SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  )
                else if (_scrapedArticle != null)
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: Tooltip(
                      message: _scrapedArticle!.content.length > 200
                          ? 'Full article text fetched'
                          : 'Headline/slug fetched',
                      child: Icon(
                        Icons.check_circle,
                        color: _scrapedArticle!.content.length > 200
                            ? const Color(0xFF10B981)
                            : const Color(0xFFF59E0B),
                        size: 22,
                      ),
                    ),
                  ),
                IconButton(
                  tooltip: 'Paste from clipboard',
                  icon: const Icon(Icons.content_paste, size: 19),
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
          onChanged: (val) {
            if (val.trim().startsWith('http://') || val.trim().startsWith('https://')) {
              _fetchUrlArticle(val.trim());
            }
          },
        ),
        if (_scrapedArticle != null) ...[
          const SizedBox(height: 6),
          Row(
            children: [
              Icon(
                _scrapedArticle!.content.length > 200 ? Icons.check : Icons.info_outline,
                size: 14,
                color: _scrapedArticle!.content.length > 200
                    ? const Color(0xFF10B981)
                    : const Color(0xFFF59E0B),
              ),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  _scrapedArticle!.content.length > 200
                      ? 'Full article content retrieved (${_scrapedSiteName ?? "Web"})'
                      : 'Headline retrieved: "${_digitalTitleController.text}"',
                  style: TextStyle(
                    fontSize: 11,
                    color: _scrapedArticle!.content.length > 200
                        ? const Color(0xFF10B981)
                        : const Color(0xFFF59E0B),
                    fontWeight: FontWeight.w600,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }

  // ================= STEP 2: Dedicated Visual Cues Studio =================

  Widget _buildStep2VisualCues(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Icon(Icons.palette_outlined, size: 20, color: theme.colorScheme.primary),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'Visual Cues & Metaphor Studio',
                style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
        const SizedBox(height: 3),
        Text(
          'Visual cues guide your Hook Poster. The #1 Hero cue drives primary artwork.',
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: 10),

        VisualCuePillsSelector(
          pills: _cueWordPills,
          isAutoSuggesting: _isAutoSuggestingCues,
          onAutoSuggest: _autoSuggestCueKeywords,
          onPillsChanged: (updated) {
            setState(() {
              _cueWordPills = updated;
              _syncCuesController();
            });
          },
        ),

        const SizedBox(height: 12),

        _buildCharacterRepresentationCard(theme),

        const SizedBox(height: 12),

        Center(
          child: TextButton.icon(
            onPressed: () {
              setState(() => _currentStep = SlantStep.sourceAndAngle);
            },
            icon: const Icon(Icons.arrow_back_rounded, size: 16),
            label: Text(
              _isInnerVoiceMode ? 'Back to Inner Voice & Spark' : 'Back to Slant & Source',
            ),
          ),
        ),

        const SizedBox(height: 20),
      ],
    );
  }

  Widget _buildCharacterRepresentationCard(ThemeData theme) {
    final effectiveRefBytes = _referenceImageBytes ??
        (_sourceMode == InputSourceMode.physicalPhoto ? _imageBytes : null);

    return Card(
      elevation: 0,
      color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.person_pin_circle_outlined,
                  size: 20,
                  color: theme.colorScheme.primary,
                ),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'Character & Face Representation',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13.5),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              'Select how characters are portrayed in the generated editorial poster artwork.',
              style: TextStyle(fontSize: 11.5, color: theme.colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 12),

            // Option 1: Stylized Generic Figure (Default)
            InkWell(
              onTap: () {
                setState(() => _matchRealPersonLikeness = false);
              },
              borderRadius: BorderRadius.circular(12),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: !_matchRealPersonLikeness
                      ? theme.colorScheme.primary.withValues(alpha: 0.1)
                      : theme.colorScheme.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: !_matchRealPersonLikeness
                        ? theme.colorScheme.primary
                        : theme.colorScheme.outlineVariant.withValues(alpha: 0.5),
                    width: !_matchRealPersonLikeness ? 1.8 : 1.0,
                  ),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(
                        color: !_matchRealPersonLikeness
                            ? theme.colorScheme.primary
                            : theme.colorScheme.surfaceContainerHighest,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        Icons.style_outlined,
                        size: 16,
                        color: !_matchRealPersonLikeness
                            ? Colors.white
                            : theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Text(
                                'Stylized Generic Figure',
                                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                              ),
                              const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: theme.colorScheme.primary.withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  'Usual Style',
                                  style: TextStyle(
                                    fontSize: 9.5,
                                    fontWeight: FontWeight.bold,
                                    color: theme.colorScheme.primary,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 3),
                          Text(
                            'Editorial stylized figures with expressive generic faces in authentic attire matching story context (sanitation workwear, corporate suits, lab coats, etc.).',
                            style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurfaceVariant),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      width: 22,
                      height: 22,
                      margin: const EdgeInsets.only(top: 2),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: !_matchRealPersonLikeness
                              ? theme.colorScheme.primary
                              : theme.colorScheme.outlineVariant,
                          width: 2,
                        ),
                      ),
                      child: !_matchRealPersonLikeness
                          ? Center(
                              child: Container(
                                width: 12,
                                height: 12,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: theme.colorScheme.primary,
                                ),
                              ),
                            )
                          : null,
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 10),

            // Option 2: Match Real Person Face (Look-Alike)
            InkWell(
              onTap: () {
                setState(() {
                  _matchRealPersonLikeness = true;
                  if (_referenceImageBytes == null && _sourceMode == InputSourceMode.physicalPhoto && _imageBytes != null) {
                    _referenceImageBytes = _imageBytes;
                    _referenceImageSourceLabel = 'Print Clipping Photo';
                  }
                });
              },
              borderRadius: BorderRadius.circular(12),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: _matchRealPersonLikeness
                      ? const Color(0xFF6366F1).withValues(alpha: 0.1)
                      : theme.colorScheme.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: _matchRealPersonLikeness
                        ? const Color(0xFF6366F1)
                        : theme.colorScheme.outlineVariant.withValues(alpha: 0.5),
                    width: _matchRealPersonLikeness ? 1.8 : 1.0,
                  ),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(
                        color: _matchRealPersonLikeness
                            ? const Color(0xFF6366F1)
                            : theme.colorScheme.surfaceContainerHighest,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        Icons.face_retouching_natural,
                        size: 16,
                        color: _matchRealPersonLikeness
                            ? Colors.white
                            : theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Text(
                                'Match Real Person Face',
                                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                              ),
                              const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF6366F1).withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: const Text(
                                  'Look-Alike',
                                  style: TextStyle(
                                    fontSize: 9.5,
                                    fontWeight: FontWeight.bold,
                                    color: Color(0xFF6366F1),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 3),
                          Text(
                            'Multimodal photo conditioning preserves recognizable facial features, hair, and likeness of key people in the poster.',
                            style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurfaceVariant),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      width: 22,
                      height: 22,
                      margin: const EdgeInsets.only(top: 2),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: _matchRealPersonLikeness
                              ? const Color(0xFF6366F1)
                              : theme.colorScheme.outlineVariant,
                          width: 2,
                        ),
                      ),
                      child: _matchRealPersonLikeness
                          ? Center(
                              child: Container(
                                width: 12,
                                height: 12,
                                decoration: const BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: Color(0xFF6366F1),
                                ),
                              ),
                            )
                          : null,
                    ),
                  ],
                ),
              ),
            ),

            // Reference Photo Details when Match Real Person Face is selected
            if (_matchRealPersonLikeness) ...[
              const SizedBox(height: 12),
              if (effectiveRefBytes != null && effectiveRefBytes.isNotEmpty) ...[
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFF10B981).withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFF10B981).withValues(alpha: 0.3)),
                  ),
                  child: Row(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.memory(
                          effectiveRefBytes,
                          width: 48,
                          height: 48,
                          fit: BoxFit.cover,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                const Icon(Icons.check_circle, size: 14, color: Color(0xFF10B981)),
                                const SizedBox(width: 4),
                                Text(
                                  _referenceImageSourceLabel ?? 'Reference Photo Ready',
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                                ),
                              ],
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'Face structure will be captured and styled into poster art.',
                              style: TextStyle(fontSize: 10.5, color: theme.colorScheme.onSurfaceVariant),
                            ),
                          ],
                        ),
                      ),
                      OutlinedButton(
                        onPressed: () => _showReferencePhotoPickerSheet(context),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          visualDensity: VisualDensity.compact,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        child: const Text('Change', style: TextStyle(fontSize: 11)),
                      ),
                    ],
                  ),
                ),
              ] else ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.amber.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: Colors.amber.withValues(alpha: 0.4)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: const [
                          Icon(Icons.add_photo_alternate_outlined, size: 16, color: Colors.amber),
                          SizedBox(width: 6),
                          Text(
                            'Attach Reference Photo',
                            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Colors.amber),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Upload a portrait photo or snap the person\'s photo to preserve their facial likeness.',
                        style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurfaceVariant),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          FilledButton.icon(
                            onPressed: () => _pickReferencePhoto(ImageSource.camera),
                            icon: const Icon(Icons.camera_alt, size: 14),
                            label: const Text('Camera', style: TextStyle(fontSize: 11)),
                            style: FilledButton.styleFrom(
                              visualDensity: VisualDensity.compact,
                              padding: const EdgeInsets.symmetric(horizontal: 12),
                            ),
                          ),
                          const SizedBox(width: 8),
                          OutlinedButton.icon(
                            onPressed: () => _pickReferencePhoto(ImageSource.gallery),
                            icon: const Icon(Icons.photo_library, size: 14),
                            label: const Text('Gallery', style: TextStyle(fontSize: 11)),
                            style: OutlinedButton.styleFrom(
                              visualDensity: VisualDensity.compact,
                              padding: const EdgeInsets.symmetric(horizontal: 12),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }

  // ================= STEP 3: Streamlined Result Poster =================

  Widget _buildStep3ResultPoster(ThemeData theme) {
    if (_generatedItem == null) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        CarouselPosterStudio(
          key: _carouselStudioKey,
          item: _generatedItem!,
          config: PosterStyleConfig.getPreset(_currentStyle),
          showShareActions: false,
          pageController: _carouselStudioPageController,
        ),

        const SizedBox(height: 16),

        // 5 Focused Actions: Download, Save, Share, Edit, Regenerate
        _buildResultActionPanel(theme),
      ],
    );
  }

  Widget _buildActionIconButton({
    required IconData icon,
    required String label,
    required String tooltip,
    required Color color,
    required VoidCallback? onTap,
    bool isLoading = false,
    bool isActive = false,
  }) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: isActive
                        ? color.withValues(alpha: 0.24)
                        : color.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(13),
                    border: Border.all(
                      color: isActive
                          ? color.withValues(alpha: 0.85)
                          : color.withValues(alpha: 0.28),
                      width: isActive ? 1.4 : 1.0,
                    ),
                    boxShadow: isActive
                        ? [
                            BoxShadow(
                              color: color.withValues(alpha: 0.3),
                              blurRadius: 8,
                              offset: const Offset(0, 2),
                            ),
                          ]
                        : null,
                  ),
                  child: Center(
                    child: isLoading
                        ? SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(color),
                            ),
                          )
                        : Icon(
                            icon,
                            size: 21,
                            color: color,
                          ),
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: isActive ? FontWeight.w800 : FontWeight.w600,
                    color: isActive ? color : const Color(0xFFCBD5E1),
                    letterSpacing: 0.2,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildResultActionPanel(ThemeData theme) {
    final isDark = theme.brightness == Brightness.dark;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Sleek compact action toolbar with apt icons
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 10),
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF0F172A).withValues(alpha: 0.90) : const Color(0xFFF8FAFC),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: isDark
                  ? Colors.white.withValues(alpha: 0.12)
                  : theme.colorScheme.outlineVariant.withValues(alpha: 0.4),
              width: 1.0,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: isDark ? 0.35 : 0.06),
                blurRadius: 14,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              // 1. Regenerate
              _buildActionIconButton(
                icon: Icons.refresh_rounded,
                label: 'Regen',
                tooltip: 'Regenerate / Tweak Cues',
                color: const Color(0xFFA78BFA), // Lavender / Purple
                onTap: _handleRegenerate,
              ),

              // 2. Edit
              _buildActionIconButton(
                icon: Icons.tune_rounded,
                label: 'Edit',
                tooltip: 'Edit Content & Slant',
                color: const Color(0xFFFBBF24), // Amber
                onTap: () => _showEditPosterModalBottomSheet(context),
              ),

              // 3. Share
              _buildActionIconButton(
                icon: Icons.share_rounded,
                label: 'Share',
                tooltip: 'Share Carousel Trio',
                color: const Color(0xFF34D399), // Emerald
                isLoading: _isExporting,
                onTap: _isExporting ? null : _shareCarousel,
              ),

              // 4. Download
              _buildActionIconButton(
                icon: _isDownloaded ? Icons.download_done_rounded : Icons.download_rounded,
                label: _isDownloaded ? 'Downloaded' : 'Download',
                tooltip: _isDownloaded ? 'Downloaded to Gallery (Slant folder)' : 'Download 3 Posters to Gallery',
                color: const Color(0xFF38BDF8), // Sky Blue
                isActive: _isDownloaded,
                isLoading: _isExporting,
                onTap: _isExporting ? null : _downloadCarouselToGallerySlant,
              ),

              // 5. Save to My Posts
              _buildActionIconButton(
                icon: _isSaved ? Icons.bookmark_added_rounded : Icons.bookmark_add_outlined,
                label: _isSaved ? 'Saved' : 'Save',
                tooltip: _isSaved ? 'Saved in My Posts' : 'Save to My Posts in app',
                color: _isSaved ? const Color(0xFF10B981) : const Color(0xFFFB7185), // Rose / Emerald
                isActive: _isSaved,
                onTap: _saveToMyPosts,
              ),
            ],
          ),
        ),

        const SizedBox(height: 12),

        // Slim Done button
        SizedBox(
          height: 42,
          child: FilledButton.tonalIcon(
            onPressed: () => _returnToHome(targetTabIndex: 0),
            icon: const Icon(Icons.check_circle_outline_rounded, size: 18),
            label: const Text(
              'Done • Return to Home Feed',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
            ),
            style: FilledButton.styleFrom(
              padding: EdgeInsets.zero,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ),

        const SizedBox(height: 24),
      ],
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
              'Crafting Social Carousel',
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
                'Synthesizing 3-Poster Deck',
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
