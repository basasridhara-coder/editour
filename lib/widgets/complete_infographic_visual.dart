import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/postcard_item.dart';
import '../models/poster_style_config.dart';
import 'artistic_poster_visual.dart';
import 'photo_viewer_dialog.dart';

/// Renders a complete, standalone Infographic Art Image for any post and audience.
/// If an AI-generated image exists, it displays the high-res PNG.
/// If not, it procedurally renders a complete graphic design infographic poster
/// with provocative trigger text, diagrams, and data badges.
class CompleteInfographicVisual extends StatelessWidget {
  final PostCardItem item;
  final PosterStyleConfig config;
  final VoidCallback? onOpenDetail;

  const CompleteInfographicVisual({
    super.key,
    required this.item,
    required this.config,
    this.onOpenDetail,
  });

  @override
  Widget build(BuildContext context) {
    final hasAiImage = (item.illustrationBase64 != null && item.illustrationBase64!.isNotEmpty) ||
        (item.renderedPosterPath != null && !kIsWeb && File(item.renderedPosterPath!).existsSync());

    return AspectRatio(
      aspectRatio: 1.0, // High-impact square Instagram poster format
      child: GestureDetector(
        onTap: () {
          PhotoViewerDialog.show(
            context,
            photoPath: item.renderedPosterPath,
            imageBytes: item.illustrationBase64 != null
                ? base64Decode(item.illustrationBase64!)
                : null,
            headline: item.adaptedHeadline,
          );
        },
        child: Container(
          decoration: BoxDecoration(
            color: const Color(0xFF090D16),
            border: Border.symmetric(
              horizontal: BorderSide(
                color: Colors.white.withValues(alpha: 0.08),
                width: 1,
              ),
            ),
          ),
          clipBehavior: Clip.antiAlias,
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (hasAiImage)
                _buildAiImagePoster()
              else
                _buildProceduralInfographicPoster(context),

              // Fullscreen zoom indicator in top right
              Positioned(
                top: 10,
                right: 10,
                child: Container(
                  padding: const EdgeInsets.all(5),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.6),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white24, width: 0.8),
                  ),
                  child: const Icon(Icons.fullscreen, size: 16, color: Colors.white),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAiImagePoster() {
    return Stack(
      fit: StackFit.expand,
      children: [
        if (item.illustrationBase64 != null)
          Image.memory(
            base64Decode(item.illustrationBase64!),
            fit: BoxFit.contain,
          )
        else if (item.renderedPosterPath != null)
          Image.file(
            File(item.renderedPosterPath!),
            fit: BoxFit.contain,
          ),

        // Subtle publication tag overlay on top left
        Positioned(
          top: 10,
          left: 10,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3.5),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.7),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.white24, width: 0.8),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.auto_awesome, size: 10, color: Color(0xFF38BDF8)),
                const SizedBox(width: 4),
                Text(
                  item.publicationName ?? 'Print Article',
                  style: GoogleFonts.montserrat(
                    fontSize: 9.5,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  /// Builds a complete, visually rich procedural infographic poster
  /// with triggering text, visual diagrams, and data badges.
  Widget _buildProceduralInfographicPoster(BuildContext context) {
    final stats = item.infographicStats.isNotEmpty
        ? item.infographicStats
        : (item.keyMetric != null
            ? [item.keyMetric!, item.categoryBadge]
            : ['Front Page', 'Insight']);

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            const Color(0xFF0F172A),
            config.primaryColor.withValues(alpha: 0.85),
            const Color(0xFF050811),
          ],
        ),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Background visual art layer
          Opacity(
            opacity: 0.35,
            child: ArtisticPosterVisual(
              item: item,
              config: config,
              height: double.infinity,
            ),
          ),

          // High-contrast dark vignette gradient
          Container(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: Alignment.center,
                radius: 1.1,
                colors: [
                  Colors.black.withValues(alpha: 0.15),
                  Colors.black.withValues(alpha: 0.8),
                ],
              ),
            ),
          ),

          // Complete Poster Graphic Content
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // 1. Top Bar: Category Pill & Audience Target
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Flexible(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3.5),
                        decoration: BoxDecoration(
                          color: config.secondaryColor,
                          borderRadius: BorderRadius.circular(4),
                          boxShadow: [
                            BoxShadow(
                              color: config.secondaryColor.withValues(alpha: 0.4),
                              blurRadius: 8,
                            ),
                          ],
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.auto_awesome, size: 10, color: Colors.white),
                            const SizedBox(width: 4),
                            Flexible(
                              child: Text(
                                item.categoryBadge.toUpperCase(),
                                style: GoogleFonts.montserrat(
                                  fontSize: 9,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: 1.0,
                                  color: Colors.white,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.6),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.white24, width: 0.8),
                        ),
                        child: Text(
                          '🎯 ${item.targetAudience.toUpperCase()}',
                          style: GoogleFonts.montserrat(
                            fontSize: 8.5,
                            fontWeight: FontWeight.bold,
                            color: Colors.white70,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ),
                  ],
                ),

                // 2. Center: Bold Trigger Headline & Provocation Text
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Trigger Headline
                    Text(
                      item.adaptedHeadline,
                      style: GoogleFonts.spaceGrotesk(
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                        height: 1.2,
                        letterSpacing: -0.2,
                        shadows: [
                          const Shadow(
                            color: Colors.black,
                            blurRadius: 10,
                          ),
                        ],
                      ),
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 10),

                    // Triggering Quote / Hook
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.55),
                        borderRadius: BorderRadius.circular(6),
                        border: Border(
                          left: BorderSide(color: config.secondaryColor, width: 3),
                        ),
                      ),
                      child: Text(
                        item.pullQuote != null && item.pullQuote!.isNotEmpty
                            ? '"${item.pullQuote!}"'
                            : item.hook,
                        style: GoogleFonts.merriweather(
                          fontSize: 11,
                          fontStyle: FontStyle.italic,
                          color: const Color(0xFFE2E8F0),
                          height: 1.35,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),

                // 3. Bottom: Infographic Metrics & Publication Byline
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Infographic Stat Badges
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: stats.take(3).map((stat) {
                        return Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: const Color(0xFF0F172A).withValues(alpha: 0.85),
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(
                              color: config.secondaryColor.withValues(alpha: 0.7),
                              width: 1,
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.trending_up,
                                size: 11,
                                color: config.secondaryColor,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                stat,
                                style: GoogleFonts.montserrat(
                                  color: Colors.white,
                                  fontSize: 9.5,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 8),

                    // Byline & Print Source Watermark
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            '📰 ${item.publicationName ?? "Physical Print Archive"}',
                            style: TextStyle(
                              fontSize: 9.5,
                              color: Colors.white.withValues(alpha: 0.7),
                              fontWeight: FontWeight.w600,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          '${item.creatorHandle ?? "@curator"} • PostCard',
                          style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.bold,
                            color: Colors.white.withValues(alpha: 0.5),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
