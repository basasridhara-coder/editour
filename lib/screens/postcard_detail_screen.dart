import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/postcard_item.dart';
import '../models/poster_style_config.dart';
import '../services/share_service.dart';
import '../services/storage_service.dart';
import '../widgets/book_cover_viewer_dialog.dart';
import '../widgets/photo_viewer_dialog.dart';
import '../widgets/poster_canvas.dart';
import '../widgets/carousel_slides/carousel_poster_studio.dart';

class PostcardDetailScreen extends StatefulWidget {
  final PostCardItem initialItem;

  const PostcardDetailScreen({
    super.key,
    required this.initialItem,
  });

  @override
  State<PostcardDetailScreen> createState() => _PostcardDetailScreenState();
}

class _PostcardDetailScreenState extends State<PostcardDetailScreen>
    with SingleTickerProviderStateMixin {
  late PostCardItem _item;
  final ShareService _shareService = ShareService();
  final StorageService _storageService = StorageService();
  final GlobalKey _posterBoundaryKey = GlobalKey();

  late TabController _tabController;
  bool _isSharing = false;

  @override
  void initState() {
    super.initState();
    _item = widget.initialItem;
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _updateStyle(PosterStyleType newStyle) async {
    setState(() {
      _item = _item.copyWith(posterStyle: newStyle);
    });
    await _storageService.savePostCard(_item);
  }

  Future<void> _sharePostCard() async {
    setState(() => _isSharing = true);
    try {
      final pngBytes = await _shareService.captureWidgetToPng(_posterBoundaryKey);
      await _shareService.sharePostCard(
        item: _item,
        posterBytes: pngBytes,
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Share failed: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSharing = false);
      }
    }
  }

  Future<void> _copySummaryToClipboard() async {
    final text = _shareService.generateShareText(_item);
    await Clipboard.setData(ClipboardData(text: text));
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('📋 PostCard content copied to clipboard!'),
          backgroundColor: Colors.green,
        ),
      );
    }
  }

  Future<void> _openDigitalLink() async {
    if (_item.digitalLink == null || _item.digitalLink!.isEmpty) return;
    try {
      final uri = Uri.parse(_item.digitalLink!);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Could not open digital link')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error opening link: $e')),
        );
      }
    }
  }

  Future<void> _confirmDelete() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete PostCard?'),
        content: const Text('Are you sure you want to remove this PostCard? It will also be deleted from editour.app.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      await _storageService.deletePostCard(_item.id);
      if (mounted) {
        Navigator.of(context).pop();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dateStr = DateFormat('MMMM d, yyyy').format(_item.createdAt);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          _item.publicationName ?? 'PostCard Story',
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
        ),
        actions: [
          if (_item.isBookExcerpt)
            IconButton(
              icon: const Icon(Icons.auto_stories),
              tooltip: 'View Book Cover',
              onPressed: () => BookCoverViewerDialog.show(context, item: _item),
            ),
          IconButton(
            icon: const Icon(Icons.copy_all_outlined),
            tooltip: 'Copy Text',
            onPressed: _copySummaryToClipboard,
          ),
          IconButton(
            icon: const Icon(Icons.delete_outline),
            tooltip: 'Delete',
            onPressed: _confirmDelete,
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: _isSharing ? null : _sharePostCard,
                  icon: _isSharing
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.share),
                  label: Text(_isSharing ? 'Preparing Poster...' : 'Share PostCard'),
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Segmented Tab for Visual Poster vs Snapped Physical Photo
            Container(
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
                borderRadius: BorderRadius.circular(12),
              ),
              padding: const EdgeInsets.all(4),
              child: TabBar(
                controller: _tabController,
                indicator: BoxDecoration(
                  color: theme.colorScheme.surface,
                  borderRadius: BorderRadius.circular(8),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.06),
                      blurRadius: 4,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                labelColor: theme.colorScheme.primary,
                unselectedLabelColor: theme.colorScheme.onSurfaceVariant,
                labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                tabs: [
                  Tab(
                    icon: Icon(
                      _item.isCarouselTrio ? Icons.view_carousel_rounded : Icons.palette_outlined,
                      size: 18,
                    ),
                    text: _item.isCarouselTrio ? '3-Poster Carousel' : 'Poster Made',
                  ),
                  Tab(
                    icon: Icon(
                      _item.isBookExcerpt
                          ? Icons.auto_stories
                          : (_item.isDigitalLinkSource ? Icons.language : Icons.camera_alt_outlined),
                      size: 18,
                    ),
                    text: _item.isBookExcerpt
                        ? 'Book Cover & Pages'
                        : (_item.isDigitalLinkSource ? 'Web Article' : 'Magazine Photo'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Tab Content
            AnimatedBuilder(
              animation: _tabController,
              builder: (context, _) {
                if (_tabController.index == 0) {
                  return _buildPosterTab();
                } else {
                  return _buildOriginalPhotoTab(theme);
                }
              },
            ),
            const SizedBox(height: 24),

            // Metadata Row: Category, Audience, Tone, Date
            Row(
              children: [
                Flexible(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.primary.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      _item.categoryBadge.toUpperCase(),
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: theme.colorScheme.primary,
                        letterSpacing: 0.8,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.secondaryContainer,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      'For ${_item.targetAudience}',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: theme.colorScheme.onSecondaryContainer,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  dateStr,
                  style: theme.textTheme.bodySmall?.copyWith(color: Colors.grey),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Adapted Headline & Hook
            Text(
              _item.adaptedHeadline,
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
                height: 1.25,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _item.hook,
              style: theme.textTheme.bodyLarge?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 16),

            // Why It Matters Callout
            if (_item.whyItMatters != null && _item.whyItMatters!.isNotEmpty) ...[
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: theme.colorScheme.primaryContainer.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: theme.colorScheme.primary.withValues(alpha: 0.2)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.bolt, size: 20, color: theme.colorScheme.primary),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'WHY THIS MATTERS TO ${_item.targetAudience.toUpperCase()}',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 1.0,
                              color: theme.colorScheme.primary,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            _item.whyItMatters!,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              height: 1.35,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],

            // Creator Opinion Section (Highlights creator's voice)
            if (_item.creatorOpinion != null && _item.creatorOpinion!.isNotEmpty) ...[
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.amber.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: Colors.amber.withValues(alpha: 0.4)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.mode_comment_outlined, size: 16, color: Colors.amber),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            'CREATOR OPINION & PERSPECTIVE',
                            style: TextStyle(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 1.2,
                              color: Colors.amber.shade900,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          _item.creatorHandle ?? '@curator',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: Colors.amber.shade900,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '“${_item.creatorOpinion}”',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontStyle: FontStyle.italic,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
            ],

            // If Carousel Trio: Show 3-Poster Social Overview Card instead of the long text essay!
            if (_item.isCarouselTrio) ...[
              Card(
                elevation: 0,
                color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: BorderSide(color: const Color(0xFF10B981).withValues(alpha: 0.3)),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.view_carousel_rounded, size: 20, color: Color(0xFF10B981)),
                          const SizedBox(width: 8),
                          const Expanded(
                            child: Text(
                              'Social Carousel Trio Format',
                              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: const Color(0xFF10B981).withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Text(
                              'Zero Text Wall',
                              style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold, color: Color(0xFF10B981)),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'This post was crafted as 3 standalone visual posters ready for Instagram and WhatsApp carousels:',
                        style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurfaceVariant),
                      ),
                      const SizedBox(height: 10),
                      _buildCarouselSlidePreviewRow('Slide 1: Visual Hook', _item.adaptedHeadline, Icons.image_outlined),
                      const SizedBox(height: 8),
                      _buildCarouselSlidePreviewRow('Slide 2: Curator Critique', _item.creatorOpinion ?? _item.hook, Icons.bolt_outlined),
                      const SizedBox(height: 8),
                      _buildCarouselSlidePreviewRow(
                        'Slide 3: The "Receipt"',
                        _item.receiptHighlightQuote ?? _item.pullQuote ?? 'Primary source evidence.',
                        Icons.verified_outlined,
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ] else ...[
              // Summarized Content Section (1-Minute Briefing)
              Card(
                elevation: 0,
                color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
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
                        Icon(Icons.timer_outlined, size: 18, color: theme.colorScheme.primary),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            '1-Minute Briefing',
                            style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primaryContainer.withValues(alpha: 0.5),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.bolt_rounded, size: 13, color: theme.colorScheme.primary),
                              const SizedBox(width: 4),
                              Text(
                                '1-Min Read',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: theme.colorScheme.primary,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      _item.summary,
                      style: theme.textTheme.bodyMedium?.copyWith(height: 1.5),
                    ),
                    const SizedBox(height: 16),
                    const Divider(),
                    const SizedBox(height: 8),
                    Text(
                      'Key Takeaways',
                      style: theme.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    ..._item.keyTakeaways.map((takeaway) => Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Padding(
                                padding: const EdgeInsets.only(top: 4, right: 8),
                                child: Container(
                                  width: 5,
                                  height: 5,
                                  decoration: BoxDecoration(
                                    color: theme.colorScheme.primary,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                              ),
                              Expanded(
                                child: Text(
                                  takeaway,
                                  style: theme.textTheme.bodyMedium?.copyWith(height: 1.35),
                                ),
                              ),
                            ],
                          ),
                        )),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
          ],

            // Digital Link Section (only for digital web articles)
            if (_item.isDigitalLinkSource && _item.digitalLink != null && _item.digitalLink!.isNotEmpty && !_item.digitalLink!.contains('news.google.com')) ...[
              Card(
                elevation: 0,
                color: theme.colorScheme.primaryContainer.withValues(alpha: 0.4),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                  side: BorderSide(color: theme.colorScheme.primary.withValues(alpha: 0.2)),
                ),
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: theme.colorScheme.primary,
                    child: const Icon(Icons.public, color: Colors.white, size: 20),
                  ),
                  title: const Text('Digital Article Source', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                  subtitle: Text(
                    _item.digitalLink!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11),
                  ),
                  trailing: const Icon(Icons.open_in_new, size: 18),
                  onTap: _openDigitalLink,
                ),
              ),
              const SizedBox(height: 20),
            ],

            // Context info
            if (_item.userContext != null && _item.userContext!.isNotEmpty) ...[
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Text(
                  'Curator Angle: "${_item.userContext}"',
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontStyle: FontStyle.italic,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
              const SizedBox(height: 24),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildPosterTab() {
    if (_item.isCarouselTrio) {
      return Column(
        children: [
          CarouselPosterStudio(
            item: _item,
            showShareActions: true,
          ),
          const SizedBox(height: 12),
        ],
      );
    }

    return Column(
      children: [
        PosterCanvas(
          item: _item,
          boundaryKey: _posterBoundaryKey,
          showStyleSelector: true,
          onStyleChanged: _updateStyle,
        ),
        // Live Art Ratio Adjuster in Detail view
        Padding(
          padding: const EdgeInsets.only(top: 8, bottom: 4),
          child: Row(
            children: [
              const Icon(Icons.tune, size: 16, color: Colors.grey),
              const SizedBox(width: 6),
              Text(
                'Art Ratio: ${(_item.visualArtRatio * 100).round()}%',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
              ),
              Expanded(
                child: Slider(
                  value: _item.visualArtRatio,
                  min: 0.20,
                  max: 0.90,
                  divisions: 7,
                  onChanged: (val) async {
                    setState(() {
                      _item = _item.copyWith(visualArtRatio: val);
                    });
                    await _storageService.savePostCard(_item);
                  },
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildOriginalPhotoTab(ThemeData theme) {
    if (_item.isBookExcerpt) {
      return _buildBookExcerptTab(theme);
    }

    if (_item.isDigitalLinkSource) {
      return Container(
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.4)),
        ),
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0284C7).withValues(alpha: 0.15),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.language, color: Color(0xFF0284C7), size: 24),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _item.publicationName ?? 'Digital Web Article',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                      ),
                      Text(
                        _item.digitalLink ?? 'Online Article Source',
                        style: TextStyle(fontSize: 12, color: theme.colorScheme.primary),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              _item.originalHeadline ?? 'Original Online Article',
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF0284C7),
                foregroundColor: Colors.white,
                minimumSize: const Size.fromHeight(48),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: () {
                if (_item.digitalLink != null && _item.digitalLink!.isNotEmpty) {
                  launchUrl(Uri.parse(_item.digitalLink!), mode: LaunchMode.externalApplication);
                }
              },
              icon: const Icon(Icons.open_in_new, size: 18),
              label: const Text('Read Full Article on Web', style: TextStyle(fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      );
    }

    return Column(
      children: [
        Stack(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Container(
                height: 340,
                width: double.infinity,
                color: Colors.black12,
                child: _buildOriginalPhotoImage(),
              ),
            ),
            Positioned(
              bottom: 12,
              right: 12,
              child: FloatingActionButton.extended(
                heroTag: 'zoom_photo_detail',
                onPressed: () => PhotoViewerDialog.show(
                  context,
                  photoPath: _item.originalPhotoPath,
                  headline: _item.originalHeadline ?? _item.publicationName,
                ),
                icon: const Icon(Icons.zoom_in),
                label: const Text('Inspect Print'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: Text(
                'Publication: ${_item.publicationName ?? "Physical Print"}',
                style: theme.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.bold),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 8),
            const Text(
              'Pinch to zoom in detail view',
              style: TextStyle(fontSize: 11, color: Colors.grey),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildOriginalPhotoImage() {
    if (_item.originalPhotoPath == 'sample_asset_print' || _item.originalPhotoPath.isEmpty) {
      return Container(
        color: const Color(0xFFF3ECE0),
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.newspaper, size: 64, color: Color(0xFF8C7A6B)),
            const SizedBox(height: 12),
            const Text(
              'PHYSICAL PRINT CLIP',
              style: TextStyle(
                fontFamily: 'serif',
                fontSize: 14,
                fontWeight: FontWeight.bold,
                letterSpacing: 2.0,
                color: Color(0xFF3E342B),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              _item.originalHeadline ?? 'Archived physical newspaper clipping',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontFamily: 'serif',
                fontSize: 12,
                fontStyle: FontStyle.italic,
                color: Color(0xFF6B5C4D),
              ),
            ),
          ],
        ),
      );
    }

    if (!kIsWeb && File(_item.originalPhotoPath).existsSync()) {
      return Image.file(
        File(_item.originalPhotoPath),
        fit: BoxFit.cover,
      );
    }

    return Container(
      color: Colors.grey[200],
      child: const Center(
        child: Icon(Icons.image_outlined, size: 48, color: Colors.grey),
      ),
    );
  }

  Widget _buildBookExcerptTab(ThemeData theme) {
    final title = _item.bookTitle ?? _item.publicationName ?? 'Book Reading';
    final author = _item.bookAuthor ?? 'Curated Edition';

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.4)),
      ),
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header with Book Icon & identified title
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.amber.shade900.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.auto_stories, color: Colors.amber, size: 24),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                    ),
                    Text(
                      'by $author',
                      style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Identified Book Cover Page Card
          InkWell(
            onTap: () => BookCoverViewerDialog.show(context, item: _item),
            borderRadius: BorderRadius.circular(12),
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.amber.shade800.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      width: 60,
                      height: 85,
                      color: const Color(0xFF1E293B),
                      child: _item.bookCoverPhotoPath != null &&
                              !kIsWeb &&
                              File(_item.bookCoverPhotoPath!).existsSync()
                          ? Image.file(File(_item.bookCoverPhotoPath!), fit: BoxFit.cover)
                          : const Center(
                              child: Icon(Icons.auto_stories, color: Colors.amber, size: 28),
                            ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.amber.shade800,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: const Text(
                                'BOOK COVER IDENTIFIED',
                                style: TextStyle(
                                  fontSize: 9,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(
                          title,
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${_item.bookExcerptPhotoPaths.length} excerpt page(s) attached • Tap to view full cover',
                          style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right, color: Colors.grey),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),

          // Curator Emotion Angle Callout
          if (_item.curatorAngle != null && _item.curatorAngle!.isNotEmpty) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.amber.shade900.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.amber.shade700.withValues(alpha: 0.25)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.lightbulb_outline, size: 16, color: Colors.amber),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'CURATOR\'S EMOTION & ANGLE',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: Colors.amber,
                            letterSpacing: 0.8,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '“${_item.curatorAngle}”',
                          style: const TextStyle(fontSize: 12, fontStyle: FontStyle.italic),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
          ],

          // Excerpt pages thumbnails strip if present
          if (_item.bookExcerptPhotoPaths.isNotEmpty) ...[
            Text(
              'Attached Excerpt Pages (${_item.bookExcerptPhotoPaths.length}):',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 90,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _item.bookExcerptPhotoPaths.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (ctx, idx) {
                  final pPath = _item.bookExcerptPhotoPaths[idx];
                  return InkWell(
                    onTap: () => BookCoverViewerDialog.show(context, item: _item),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Container(
                        width: 70,
                        color: Colors.black12,
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            if (!kIsWeb && File(pPath).existsSync())
                              Image.file(File(pPath), fit: BoxFit.cover)
                            else
                              const Center(child: Icon(Icons.description, size: 24, color: Colors.grey)),
                            Positioned(
                              bottom: 0,
                              left: 0,
                              right: 0,
                              child: Container(
                                color: Colors.black54,
                                padding: const EdgeInsets.symmetric(vertical: 2),
                                child: Text(
                                  'P.${idx + 1}',
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 14),
          ],

          // Action Button: View Book Cover Page
          FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: Colors.amber.shade800,
              foregroundColor: Colors.white,
              minimumSize: const Size.fromHeight(48),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: () => BookCoverViewerDialog.show(context, item: _item),
            icon: const Icon(Icons.auto_stories, size: 18),
            label: const Text('Open Identified Book Cover Page', style: TextStyle(fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  Widget _buildCarouselSlidePreviewRow(String title, String text, IconData icon) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.4)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: theme.colorScheme.primary),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: theme.colorScheme.primary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  text,
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

