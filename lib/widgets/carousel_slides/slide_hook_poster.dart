import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import '../../models/postcard_item.dart';
import '../../models/poster_style_config.dart';

class SlideHookPoster extends StatelessWidget {
  final PostCardItem item;
  final PosterStyleConfig config;
  final BorderRadius? borderRadius;
  final bool showOverlays;

  const SlideHookPoster({
    super.key,
    required this.item,
    required this.config,
    this.borderRadius,
    this.showOverlays = true,
  });

  @override
  Widget build(BuildContext context) {
    final headline = item.adaptedHeadline.isNotEmpty ? item.adaptedHeadline : (item.originalHeadline ?? 'Story Overview');
    final pubName = item.publicationName ?? 'Press Wire';
    final category = item.categoryBadge.isNotEmpty ? item.categoryBadge.toUpperCase() : 'EDITORIAL';
    final handle = item.creatorHandle ?? '@curator';

    String displayCategory = category;
    String displayPub = pubName;
    if (category.contains('•')) {
      final parts = category.split('•');
      displayCategory = parts[0].trim();
      if (parts.length > 1 && parts[1].trim().isNotEmpty) {
        displayPub = parts[1].trim();
      }
    }

    // Dynamic responsive font sizing for the bold display headline
    final double headlineSize = headline.length > 80
        ? 21.0
        : (headline.length > 50
            ? 23.5
            : (headline.length > 30 ? 25.5 : 27.5));

    final effectiveRadius = borderRadius ?? BorderRadius.circular(16);
    final isFlush = borderRadius == BorderRadius.zero;

    final posterWidget = AspectRatio(
      aspectRatio: 4 / 5,
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF060911),
          borderRadius: effectiveRadius,
          border: isFlush
              ? Border.symmetric(
                  horizontal: BorderSide(
                    color: Colors.white.withValues(alpha: 0.1),
                    width: 0.8,
                  ),
                )
              : Border.all(color: Colors.white.withValues(alpha: 0.16), width: 1.5),
          boxShadow: isFlush
              ? null
              : [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.6),
                    blurRadius: 24,
                    offset: const Offset(0, 10),
                  ),
                ],
        ),
        child: ClipRRect(
          borderRadius: isFlush ? BorderRadius.zero : BorderRadius.circular(15),
          child: Stack(
            fit: StackFit.expand,
            children: [
              // 1. Full-Bleed Background Visual Art (100% Canvas Coverage)
              _buildVisualArt(),

              // 2. Overlays Layer (Animated fade for clean unobstructed art viewing)
              AnimatedOpacity(
                duration: const Duration(milliseconds: 240),
                curve: Curves.easeInOut,
                opacity: showOverlays ? 1.0 : 0.0,
                child: IgnorePointer(
                  ignoring: !showOverlays,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      // 2a. Cinematic Multi-Stop Dark Vignette Overlay
                      // Leaves 70%+ of the poster completely clear so the main artwork subject is pristine!
                      Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    stops: const [0.0, 0.12, 0.65, 0.82, 1.0],
                    colors: [
                      Colors.black.withValues(alpha: 0.60), // Header shadow
                      Colors.transparent,                  // Visual subject is completely unobstructed!
                      Colors.transparent,
                      const Color(0xFF060911).withValues(alpha: 0.82),
                      const Color(0xFF060911).withValues(alpha: 0.98), // High-contrast anchor for bold headline
                    ],
                  ),
                ),
              ),

              // 3. Top Minimal Header Pill (High-Contrast White & Accent)
              Positioned(
                top: 14,
                left: 16,
                right: 16,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.75),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 6,
                            height: 6,
                            decoration: BoxDecoration(
                              color: config.primaryColor,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            displayCategory,
                            style: TextStyle(
                              fontSize: 9.5,
                              fontWeight: FontWeight.w800,
                              color: config.primaryColor,
                              letterSpacing: 0.8,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            '•  $displayPub',
                            style: const TextStyle(
                              fontSize: 9.5,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.75),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
                      ),
                      child: const Text(
                        '01 / 03',
                        style: TextStyle(
                          fontSize: 9.5,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              // 4. Lower Content Section: Context Anchor (The Fact) + Bold Headline (The Angle)
              Positioned(
                bottom: 16,
                left: 18,
                right: 18,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Tactile Ripped Newspaper Clipping Fragment (Actual News Excerpt / Headline)
                    () {
                      final rawNews = (item.originalHeadline != null &&
                              item.originalHeadline!.trim().isNotEmpty &&
                              item.originalHeadline!.trim() != headline.trim())
                          ? item.originalHeadline!.trim()
                          : (item.hook.trim().isNotEmpty && item.hook.trim() != headline.trim()
                              ? item.hook.trim()
                              : '');

                      if (rawNews.isEmpty) return const SizedBox.shrink();

                      // Word limit with ellipsis if too long so it stays compact and doesn't spoil hook impression
                      final words = rawNews.split(RegExp(r'\s+'));
                      final formattedNews = words.length > 13
                          ? '${words.take(13).join(' ')}...'
                          : rawNews;

                      return Container(
                        margin: const EdgeInsets.only(bottom: 9),
                        decoration: BoxDecoration(
                          // Tactile aged vintage broadsheet newsprint paper
                          gradient: const LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [
                              Color(0xFFFAF7EE),
                              Color(0xFFF3ECE0),
                              Color(0xFFEBE2D2),
                            ],
                          ),
                          borderRadius: BorderRadius.circular(4),
                          border: Border.all(
                            color: const Color(0xFFDCD2BE).withValues(alpha: 0.95),
                            width: 0.9,
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.70),
                              blurRadius: 10,
                              offset: const Offset(0, 3.5),
                            ),
                          ],
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(3.5),
                          child: Stack(
                            children: [
                              // Subtle sub-column ink traces on the ragged edge
                              Positioned(
                                bottom: 0,
                                left: 0,
                                right: 0,
                                child: Container(
                                  height: 2,
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFD6CDBF).withValues(alpha: 0.8),
                                  ),
                                ),
                              ),
                              Padding(
                                padding: const EdgeInsets.fromLTRB(9, 5, 9, 6),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    // Micro archival paper header
                                    Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        const Icon(
                                          Icons.newspaper_rounded,
                                          size: 9.5,
                                          color: Color(0xFF786F5E),
                                        ),
                                        const SizedBox(width: 4.5),
                                        Text(
                                          'NEWS CLIPPING • ${displayPub.toUpperCase()}',
                                          style: const TextStyle(
                                            fontSize: 7.8,
                                            fontWeight: FontWeight.w800,
                                            color: Color(0xFF786F5E),
                                            letterSpacing: 0.6,
                                          ),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 3),
                                    // Sharp black editorial newspaper headline typography
                                    Text(
                                      formattedNews,
                                      style: const TextStyle(
                                        fontFamily: 'serif',
                                        fontSize: 11.2,
                                        fontWeight: FontWeight.w900,
                                        color: Color(0xFF141414),
                                        height: 1.20,
                                        letterSpacing: -0.2,
                                      ),
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    }(),

                    // Massive, Punchy Display Headline (The Angle)
                    Text(
                      headline,
                      style: TextStyle(
                        fontSize: headlineSize,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                        height: 1.15,
                        letterSpacing: -0.6,
                        shadows: const [
                          Shadow(
                            color: Colors.black,
                            blurRadius: 16,
                            offset: Offset(0, 3),
                          ),
                          Shadow(
                            color: Colors.black87,
                            blurRadius: 8,
                            offset: Offset(0, 1),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 14),

                    // High-Contrast Footer (Creator Handle + Glowing Swipe Trigger)
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 20,
                              height: 20,
                              decoration: BoxDecoration(
                                color: config.primaryColor,
                                shape: BoxShape.circle,
                              ),
                              child: Center(
                                child: Text(
                                  handle.replaceFirst('@', '').substring(0, 1).toUpperCase(),
                                  style: const TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 7),
                            Text(
                              handle,
                              style: const TextStyle(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w600,
                                color: Color(0xFFCBD5E1),
                              ),
                            ),
                          ],
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 5),
                          decoration: BoxDecoration(
                            color: config.primaryColor.withValues(alpha: 0.3),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: config.primaryColor.withValues(alpha: 0.8), width: 1.2),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Text(
                                'SWIPE',
                                style: TextStyle(
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w900,
                                  color: Colors.white,
                                  letterSpacing: 0.8,
                                ),
                              ),
                              const SizedBox(width: 5),
                              Icon(Icons.arrow_forward_rounded, size: 13, color: config.primaryColor),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
                    ],
                  ),
                ),
              ),

              // 3. Clean View Subtle Indicator Pill (visible only when overlays are hidden)
              Positioned(
                top: 14,
                right: 16,
                child: AnimatedOpacity(
                  duration: const Duration(milliseconds: 240),
                  opacity: showOverlays ? 0.0 : 1.0,
                  child: IgnorePointer(
                    ignoring: showOverlays,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.75),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.5),
                            blurRadius: 10,
                          ),
                        ],
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.visibility_off_rounded, size: 12, color: Color(0xFF38BDF8)),
                          SizedBox(width: 5),
                          Text(
                            'Clean View',
                            style: TextStyle(
                              fontSize: 9.5,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                              letterSpacing: 0.3,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );

    return posterWidget;
  }

  Widget _buildVisualArt() {
    // 1. In-memory decoded AI illustration bytes (highest freshness priority on re-rolls)
    if (item.illustrationBase64 != null && item.illustrationBase64!.isNotEmpty) {
      try {
        return Image.memory(
          base64Decode(item.illustrationBase64!),
          key: ValueKey('hook_mem_${item.id}_${item.illustrationBase64.hashCode}'),
          fit: BoxFit.cover,
          gaplessPlayback: true,
        );
      } catch (_) {}
    }
    // 2. High-resolution rendered AI illustration file
    if (item.renderedPosterPath != null && item.renderedPosterPath!.isNotEmpty) {
      final file = File(item.renderedPosterPath!);
      if (file.existsSync()) {
        return Image.file(
          file,
          key: ValueKey('hook_file_${item.renderedPosterPath}_${item.illustrationBase64.hashCode}'),
          fit: BoxFit.cover,
          gaplessPlayback: true,
        );
      }
    }
    // NOTE: We NEVER display the raw paper cut camera photo on Slide 1!
    // Slide 1 is the conceptual visual hook. The raw newspaper clipping belongs exclusively to Slide 3.
    return _buildStylizedConceptArt();
  }

  Widget _buildStylizedConceptArt() {
    final heroIcon = _resolveHeroIcon();
    final primary = config.primaryColor;
    final isCyber = item.posterStyle == PosterStyleType.modernCyber;
    final isBold = item.posterStyle == PosterStyleType.boldSocial;

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: isCyber
              ? [
                  const Color(0xFF030712),
                  const Color(0xFF0A1528),
                  const Color(0xFF021B3A),
                  const Color(0xFF020617),
                ]
              : (isBold
                  ? [
                      const Color(0xFF180A2E),
                      const Color(0xFF2E1065),
                      const Color(0xFF0F172A),
                      const Color(0xFF020617),
                    ]
                  : [
                      const Color(0xFF0F172A),
                      const Color(0xFF1E293B),
                      const Color(0xFF090D16),
                      const Color(0xFF020617),
                    ]),
          stops: const [0.0, 0.35, 0.70, 1.0],
        ),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          // 1. Dynamic Ambient Diagonal Light Flares
          Positioned(
            top: -40,
            right: -30,
            child: Container(
              width: 240,
              height: 240,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    primary.withValues(alpha: 0.45),
                    primary.withValues(alpha: 0.10),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            bottom: 80,
            left: -50,
            child: Container(
              width: 260,
              height: 260,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    (isCyber ? const Color(0xFF06B6D4) : (isBold ? const Color(0xFFF43F5E) : primary))
                        .withValues(alpha: 0.30),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),

          // 2. Architectural Grid / Technical Geometry
          Positioned.fill(
            child: CustomPaint(
              painter: _EditorialGridPainter(
                accentColor: primary.withValues(alpha: 0.14),
                isCyber: isCyber,
              ),
            ),
          ),

          // 3. Central Multi-layered Editorial Hero Feature
          Center(
            child: Padding(
              padding: const EdgeInsets.only(top: 20, bottom: 90, left: 24, right: 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Illuminated Emblem with Dimensional Shadow
                  Container(
                    width: 104,
                    height: 104,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(28),
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [
                          primary.withValues(alpha: 0.95),
                          primary.withValues(alpha: 0.40),
                        ],
                      ),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.45),
                        width: 1.8,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: primary.withValues(alpha: 0.55),
                          blurRadius: 36,
                          spreadRadius: 4,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    child: Center(
                      child: Icon(
                        heroIcon,
                        size: 52,
                        color: Colors.white,
                      ),
                    ),
                  ),

                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  IconData _resolveHeroIcon() {
    final text = '${item.hookCues ?? ""} ${item.categoryBadge} ${item.adaptedHeadline}'.toLowerCase();
    if (text.contains('clock') || text.contains('time') || text.contains('hour') || text.contains('watch')) {
      return Icons.access_time_filled_rounded;
    }
    if (text.contains('light') || text.contains('spotlight') || text.contains('sun') || text.contains('fire')) {
      return Icons.light_mode_rounded;
    }
    if (text.contains('tech') || text.contains('ai') || text.contains('chip') || text.contains('quantum') || text.contains('code') || text.contains('computer')) {
      return Icons.memory_rounded;
    }
    if (text.contains('money') || text.contains('market') || text.contains('dollar') || text.contains('economy') || text.contains('cost') || text.contains('trade')) {
      return Icons.trending_up_rounded;
    }
    if (text.contains('climate') || text.contains('earth') || text.contains('green') || text.contains('nature') || text.contains('planet') || text.contains('energy')) {
      return Icons.eco_rounded;
    }
    if (text.contains('health') || text.contains('doctor') || text.contains('bio') || text.contains('medical') || text.contains('cure')) {
      return Icons.biotech_rounded;
    }
    if (text.contains('whistleblower') || text.contains('secret') || text.contains('crime') || text.contains('law') || text.contains('court') || text.contains('justice')) {
      return Icons.gavel_rounded;
    }
    return Icons.auto_awesome_rounded;
  }
}

class _EditorialGridPainter extends CustomPainter {
  final Color accentColor;
  final bool isCyber;

  const _EditorialGridPainter({
    required this.accentColor,
    required this.isCyber,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = accentColor
      ..strokeWidth = 0.8
      ..style = PaintingStyle.stroke;

    // Subtle technical framing crosshairs and grid lines
    const spacing = 48.0;
    for (double x = spacing; x < size.width; x += spacing) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (double y = spacing; y < size.height; y += spacing) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }

    // Corner brackets
    final cornerPaint = Paint()
      ..color = accentColor.withValues(alpha: 0.35)
      ..strokeWidth = 1.8
      ..style = PaintingStyle.stroke;

    const cLen = 14.0;
    // Top-left
    canvas.drawLine(const Offset(16, 16), const Offset(16 + cLen, 16), cornerPaint);
    canvas.drawLine(const Offset(16, 16), const Offset(16, 16 + cLen), cornerPaint);
    // Top-right
    canvas.drawLine(Offset(size.width - 16, 16), Offset(size.width - 16 - cLen, 16), cornerPaint);
    canvas.drawLine(Offset(size.width - 16, 16), Offset(size.width - 16, 16 + cLen), cornerPaint);
  }

  @override
  bool shouldRepaint(covariant _EditorialGridPainter oldDelegate) =>
      oldDelegate.accentColor != accentColor || oldDelegate.isCyber != isCyber;
}
