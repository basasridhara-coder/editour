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
                  widget.item.isDigitalLinkSource
                      ? '🌐 Web: ${widget.item.publicationName ?? _cleanDomain(widget.item.digitalLink)}'
                      : 'Physical: ${widget.item.publicationName ?? "Press Clipping"}',
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
  /// - ITEM 3: Dedicated "Paper Cut" icon to view physical newspaper snap OR "Web Article" for digital links
  /// - ITEM 4: Small active digital link chip
  Widget _buildActionBar(BuildContext context, ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
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
          const SizedBox(width: 8),

          // Share to Instagram & Apps
          IconButton(
            icon: const Icon(Icons.share_outlined, size: 21),
            tooltip: 'Share Poster to Instagram & Apps',
            visualDensity: VisualDensity.compact,
            padding: const EdgeInsets.all(6),
            constraints: const BoxConstraints(),
            onPressed: widget.onShare,
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
          const SizedBox(width: 8),

          // Trailing action chips auto-adjusting without overflow
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              reverse: true, // keeps the badge pinned neatly towards the right edge
              physics: const BouncingScrollPhysics(),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (widget.item.isBookExcerpt) ...[
                    // Book Cover quick-view chip
                    InkWell(
                      onTap: () => BookCoverViewerDialog.show(context, item: widget.item),
                      borderRadius: BorderRadius.circular(20),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: const Color(0xFF8B5CF6).withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: const Color(0xFF8B5CF6).withValues(alpha: 0.4),
                            width: 1,
                          ),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.menu_book_rounded, size: 13, color: Color(0xFF8B5CF6)),
                            SizedBox(width: 5),
                            Text(
                              'Book Cover 📖',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFF8B5CF6),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ] else if (widget.item.isDigitalLinkSource) ...[
                    // Unified Web Article link badge showing the domain directly
                    InkWell(
                      onTap: () {
                        if (widget.item.digitalLink != null && widget.item.digitalLink!.isNotEmpty) {
                          _launchDigitalLink(context, widget.item.digitalLink!);
                        }
                      },
                      borderRadius: BorderRadius.circular(20),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: const Color(0xFF0284C7).withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: const Color(0xFF0284C7).withValues(alpha: 0.4),
                            width: 1,
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.language, size: 14, color: Color(0xFF0284C7)),
                            const SizedBox(width: 5),
                            ConstrainedBox(
                              constraints: const BoxConstraints(maxWidth: 160),
                              child: Text(
                                _cleanDomain(widget.item.digitalLink),
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                  color: Color(0xFF0284C7),
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            const SizedBox(width: 3),
                            const Icon(Icons.open_in_new, size: 11, color: Color(0xFF0284C7)),
                          ],
                        ),
                      ),
                    ),
                  ] else ...[
                    // Physical Newspaper Paper Cut
                    InkWell(
                      onTap: () {
                        PhotoViewerDialog.show(
                          context,
                          photoPath: widget.item.originalPhotoPath,
                          headline: 'Physical Paper Cut: ${widget.item.originalHeadline ?? widget.item.publicationName}',
                        );
                      },
                      borderRadius: BorderRadius.circular(20),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.secondaryContainer.withValues(alpha: 0.65),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: theme.colorScheme.secondary.withValues(alpha: 0.35),
                            width: 1,
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.newspaper_outlined, size: 14),
                            const SizedBox(width: 5),
                            Text(
                              'Paper Cut',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: theme.colorScheme.onSecondaryContainer,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
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
          // Headline (tappable to view full story)
          GestureDetector(
            onTap: widget.onTap,
            child: Text(
              widget.item.adaptedHeadline,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w900,
                fontSize: 15.5,
                height: 1.25,
              ),
            ),
          ),
          const SizedBox(height: 6),

          // ITEM 2: FEW STARTING LINES OF SUMMARY WITH "..."
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

          // Creator Opinion if present
          if (widget.item.creatorOpinion != null && widget.item.creatorOpinion!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.amber.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(8),
                border: Border(
                  left: BorderSide(color: Colors.amber.shade700, width: 2.5),
                ),
              ),
              child: Text(
                'My Take: "${widget.item.creatorOpinion}"',
                style: TextStyle(
                  fontSize: 11.5,
                  fontStyle: FontStyle.italic,
                  color: theme.colorScheme.onSurface,
                ),
                maxLines: 4,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
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
