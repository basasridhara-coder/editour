import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/postcard_item.dart';
import '../models/poster_style_config.dart';
import 'book_cover_viewer_dialog.dart';
import 'complete_infographic_visual.dart';
import 'photo_viewer_dialog.dart';

/// An Instagram-style feed post card with:
/// 1. Complete Infographic Art Image with triggering text
/// 2. Few starting lines of summary with "..." (tapping navigates to complete summary)
/// 3. Dedicated icon/button to see the physical "Paper Cut"
/// 4. Small active digital link chip
class InstagramPostCardWidget extends StatefulWidget {
  final PostCardItem item;
  final VoidCallback onTap;
  final VoidCallback onShare;
  final VoidCallback onDelete;
  final GlobalKey? posterKey;

  const InstagramPostCardWidget({
    super.key,
    required this.item,
    required this.onTap,
    required this.onShare,
    required this.onDelete,
    this.posterKey,
  });

  @override
  State<InstagramPostCardWidget> createState() => _InstagramPostCardWidgetState();
}

class _InstagramPostCardWidgetState extends State<InstagramPostCardWidget> {
  bool _isLiked = false;
  bool _isCleanView = false;
  int _carouselIndex = 0;

  Future<void> _launchDigitalLink(BuildContext context, String url) async {
    try {
      final uri = Uri.parse(url);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not open link: $e')),
        );
      }
    }
  }

  String _cleanDomain(String? rawUrl) {
    if (rawUrl == null || rawUrl.isEmpty) return 'Source';
    try {
      final uri = Uri.parse(rawUrl);
      var host = uri.host.toLowerCase();
      if (host.startsWith('www.')) host = host.substring(4);
      if (host.isNotEmpty) return host;
    } catch (_) {}
    return 'Source';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final styleConfig = PosterStyleConfig.getPreset(widget.item.posterStyle);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5),
          width: 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // 1. Post Header: Creator Info + Audience + Options Menu
          _buildPostHeader(context, theme, styleConfig),

          // 2. ITEM 1: COMPLETE 4:5 POSTER VISUAL (ZERO PILLARBOXING GAPS)
          RepaintBoundary(
            key: widget.posterKey,
            child: CompleteInfographicVisual(
              item: widget.item,
              config: styleConfig,
              showOverlays: !_isCleanView,
              onOpenDetail: widget.onTap,
              onPageChanged: (idx) {
                setState(() => _carouselIndex = idx);
              },
            ),
          ),

          // 3. Instagram Action Bar (Like, Share, ITEM 3: Paper Cut, ITEM 4: Digital Link)
          _buildActionBar(context, theme),

          // 4. ITEM 2: Summary Preview with "..." (tapping navigates to complete summary)
          _buildPreviewWriteUp(context, theme, styleConfig),
        ],
      ),
    );
  }

  Widget _buildPostHeader(
    BuildContext context,
    ThemeData theme,
    PosterStyleConfig styleConfig,
  ) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      child: Row(
        children: [
          // Creator Avatar with Instagram gradient ring
          Container(
            padding: const EdgeInsets.all(2),
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                colors: [Color(0xFFF58529), Color(0xFFDD2A7B), Color(0xFF8134AF)],
              ),
            ),
            child: CircleAvatar(
              radius: 17,
              backgroundColor: theme.colorScheme.surface,
              child: Text(
                (widget.item.creatorHandle?.isNotEmpty == true && widget.item.creatorHandle!.length > 1)
                    ? widget.item.creatorHandle![1].toUpperCase()
                    : 'P',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                  color: styleConfig.primaryColor,
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: GestureDetector(
              onTap: widget.onTap,
              behavior: HitTestBehavior.opaque,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          widget.item.creatorHandle ?? '@curator',
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Flexible(
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1.5),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primaryContainer.withValues(alpha: 0.6),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            '🎯 ${widget.item.targetAudience}',
                            style: TextStyle(
                              fontSize: 9.5,
                              fontWeight: FontWeight.w700,
                              color: theme.colorScheme.onPrimaryContainer,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                    ],
                  ),
                  Text(
                    widget.item.publicationName ??
                        (widget.item.isDigitalLinkSource
                            ? _cleanDomain(widget.item.digitalLink)
                            : 'Press Clipping'),
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontSize: 11,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ),
          PopupMenuButton<String>(
            icon: Icon(Icons.more_horiz, size: 20, color: theme.colorScheme.onSurfaceVariant),
            onSelected: (val) {
              if (val == 'inspect') {
                widget.onTap();
              } else if (val == 'share') {
                widget.onShare();
              } else if (val == 'delete') {
                widget.onDelete();
              }
            },
            itemBuilder: (ctx) => [
              const PopupMenuItem(value: 'inspect', child: Text('Open Full PostCard')),
              const PopupMenuItem(value: 'share', child: Text('Share Poster')),
              const PopupMenuItem(
                value: 'delete',
                child: Text('Delete Post', style: TextStyle(color: Colors.red)),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// Action bar featuring:
  /// - Like & Share
  /// - Clean Art Toggle (Show/Hide text overlay directly on feed)
  /// - Native Carousel Pagination Dots
  /// - Minimalist Action Icons: Newspaper Paper Cut, World Web Article, Book Cover
  Widget _buildActionBar(BuildContext context, ThemeData theme) {
    final hasDigitalLink = widget.item.isDigitalLinkSource ||
        (widget.item.digitalLink != null && widget.item.digitalLink!.isNotEmpty);
    final hasPaperCut = !widget.item.isDigitalLinkSource &&
        widget.item.originalPhotoPath.isNotEmpty &&
        !widget.item.originalPhotoPath.startsWith('http') &&
        widget.item.originalPhotoPath != 'digital_article_link';

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      child: Row(
        children: [
          // Heart / Like button
          IconButton(
            icon: Icon(
              _isLiked ? Icons.favorite : Icons.favorite_border,
              color: _isLiked ? Colors.red : theme.colorScheme.onSurfaceVariant,
              size: 22,
            ),
            tooltip: 'Like Poster',
            visualDensity: VisualDensity.compact,
            padding: const EdgeInsets.all(6),
            constraints: const BoxConstraints(),
            onPressed: () => setState(() => _isLiked = !_isLiked),
          ),
          const SizedBox(width: 4),

          // Share to Instagram & Apps
          IconButton(
            icon: const Icon(Icons.share_outlined, size: 21),
            tooltip: 'Share Poster to Instagram & Apps',
            visualDensity: VisualDensity.compact,
            padding: const EdgeInsets.all(6),
            constraints: const BoxConstraints(),
            onPressed: widget.onShare,
          ),
          const SizedBox(width: 4),

          // Clean Art Toggle (Show/Hide text overlays directly on feed)
          IconButton(
            icon: Icon(
              _isCleanView ? Icons.visibility_off_rounded : Icons.visibility_outlined,
              size: 22,
              color: _isCleanView ? const Color(0xFF38BDF8) : theme.colorScheme.onSurfaceVariant,
            ),
            tooltip: _isCleanView ? 'Show text overlays' : 'Clean artwork (hide text)',
            visualDensity: VisualDensity.compact,
            padding: const EdgeInsets.all(6),
            constraints: const BoxConstraints(),
            onPressed: () => setState(() => _isCleanView = !_isCleanView),
          ),

          // Native Instagram-style pagination dots for carousel posts
          if (widget.item.isCarouselTrio) ...[
            const SizedBox(width: 8),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: List.generate(3, (idx) {
                final isSelected = _carouselIndex == idx;
                return AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.symmetric(horizontal: 2.5),
                  width: isSelected ? 6.5 : 4.5,
                  height: isSelected ? 6.5 : 4.5,
                  decoration: BoxDecoration(
                    color: isSelected
                        ? const Color(0xFF38BDF8)
                        : theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.35),
                    shape: BoxShape.circle,
                  ),
                );
              }),
            ),
          ],

          const Spacer(),

          // Minimalist Action Icons: Book Cover, World Web Link, Newspaper Paper Cut
          if (widget.item.isBookExcerpt) ...[
            IconButton(
              icon: const Icon(Icons.auto_stories_rounded, size: 21, color: Color(0xFF8B5CF6)),
              tooltip: 'View Book Cover',
              visualDensity: VisualDensity.compact,
              padding: const EdgeInsets.all(6),
              constraints: const BoxConstraints(),
              onPressed: () => BookCoverViewerDialog.show(context, item: widget.item),
            ),
            const SizedBox(width: 2),
          ],

          if (hasDigitalLink) ...[
            IconButton(
              icon: const Icon(Icons.language_rounded, size: 21, color: Color(0xFF0284C7)),
              tooltip: 'Open Web Article (${_cleanDomain(widget.item.digitalLink)})',
              visualDensity: VisualDensity.compact,
              padding: const EdgeInsets.all(6),
              constraints: const BoxConstraints(),
              onPressed: () {
                if (widget.item.digitalLink != null && widget.item.digitalLink!.isNotEmpty) {
                  _launchDigitalLink(context, widget.item.digitalLink!);
                }
              },
            ),
            const SizedBox(width: 2),
          ],

          if (hasPaperCut)
            IconButton(
              icon: Icon(Icons.newspaper_rounded, size: 21, color: theme.colorScheme.onSurfaceVariant),
              tooltip: 'View Paper Cut (${widget.item.publicationName ?? "Press Clipping"})',
              visualDensity: VisualDensity.compact,
              padding: const EdgeInsets.all(6),
              constraints: const BoxConstraints(),
              onPressed: () {
                PhotoViewerDialog.show(
                  context,
                  photoPath: widget.item.originalPhotoPath,
                  headline: 'Physical Paper Cut: ${widget.item.originalHeadline ?? widget.item.publicationName}',
                );
              },
            ),
        ],
      ),
    );
  }

  /// ITEM 2: Few starting lines of summary with "..."
  /// Upon clicking navigates directly to complete summary with infographic art & full content
  Widget _buildPreviewWriteUp(
    BuildContext context,
    ThemeData theme,
    PosterStyleConfig styleConfig,
  ) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 2, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Starting lines of summary with "..."
          GestureDetector(
            onTap: widget.onTap,
            child: RichText(
              text: TextSpan(
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontSize: 13,
                  height: 1.42,
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.88),
                ),
                children: [
                  TextSpan(
                    text: '${widget.item.creatorHandle ?? "@curator"} ',
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  TextSpan(
                    text: _getStartingLines(widget.item.summary),
                  ),
                  TextSpan(
                    text: ' ... more',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                ],
              ),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  String _getStartingLines(String fullText) {
    if (fullText.isEmpty) return 'No summary available.';
    // Grab first ~130 characters cleanly without cutting mid-word if possible
    if (fullText.length <= 130) return fullText;
    final cutoff = fullText.indexOf(' ', 110);
    if (cutoff != -1 && cutoff <= 145) {
      return fullText.substring(0, cutoff);
    }
    return fullText.substring(0, 120);
  }
}
