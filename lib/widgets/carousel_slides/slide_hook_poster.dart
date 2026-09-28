import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import '../../models/postcard_item.dart';
import '../../models/poster_style_config.dart';

class SlideHookPoster extends StatelessWidget {
  final PostCardItem item;
  final PosterStyleConfig config;

  const SlideHookPoster({
    super.key,
    required this.item,
    required this.config,
  });

  @override
  Widget build(BuildContext context) {
    final headline = item.adaptedHeadline.isNotEmpty ? item.adaptedHeadline : (item.originalHeadline ?? 'Story Overview');
    final pubName = item.publicationName ?? 'Press Wire';
    final category = item.categoryBadge.isNotEmpty ? item.categoryBadge.toUpperCase() : 'EDITORIAL';
    final handle = item.creatorHandle ?? '@curator';

    // Dynamic responsive font sizing for headline
    final double headlineSize = headline.length > 90
        ? 19.0
        : (headline.length > 60
            ? 21.0
            : (headline.length > 40 ? 22.5 : 24.0));

    // Dynamic responsive font sizing for the Hook Paragraph (Bigger font encouraging reading!)
    final double hookParagraphSize = item.hook.length > 160
        ? 14.0
        : (item.hook.length > 100 ? 15.0 : 16.0);

    return AspectRatio(
      aspectRatio: 4 / 5,
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF060911),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withValues(alpha: 0.16), width: 1.5),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.6),
              blurRadius: 24,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(15),
          child: Stack(
            fit: StackFit.expand,
            children: [
              // 1. Full-Bleed Background Visual Art (100% Canvas Coverage)
              _buildVisualArt(),

              // 2. Cinematic Multi-Stop Dark Vignette Overlay
              // Leaves the upper 55% completely clear so the main subject is NEVER covered!
              Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    stops: const [0.0, 0.14, 0.50, 0.72, 1.0],
                    colors: [
                      Colors.black.withValues(alpha: 0.65), // Header shadow
                      Colors.transparent,                  // Upper visual subject is completely unobstructed!
                      Colors.transparent,
                      const Color(0xFF060911).withValues(alpha: 0.88),
                      const Color(0xFF060911).withValues(alpha: 0.98), // Solid contrast for readable paragraph
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
                            category,
                            style: TextStyle(
                              fontSize: 9.5,
                              fontWeight: FontWeight.w800,
                              color: config.primaryColor,
                              letterSpacing: 0.8,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            '•  $pubName',
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

              // 4. Lower Content Section: Bold Headline + Bigger Readable Paragraph
              // Anchored strictly to the lower 38% so it never covers the subject!
              Positioned(
                bottom: 14,
                left: 18,
                right: 18,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Headline Hook (Clear and bold)
                    Text(
                      headline,
                      style: TextStyle(
                        fontSize: headlineSize,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                        height: 1.18,
                        letterSpacing: -0.5,
                        shadows: const [
                          Shadow(
                            color: Colors.black87,
                            blurRadius: 12,
                            offset: Offset(0, 3),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 8),

                    // Small Paragraph with Complete Statement in BIGGER, highly readable font!
                    Text(
                      item.hook,
                      style: TextStyle(
                        fontSize: hookParagraphSize,
                        color: const Color(0xFFF1F5F9),
                        height: 1.38,
                        fontWeight: FontWeight.w600,
                        shadows: const [
                          Shadow(
                            color: Colors.black87,
                            blurRadius: 8,
                            offset: Offset(0, 2),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 12),

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
    );
  }

  Widget _buildVisualArt() {
    if (item.renderedPosterPath != null && item.renderedPosterPath!.isNotEmpty) {
      final file = File(item.renderedPosterPath!);
      if (file.existsSync()) {
        return Image.file(file, fit: BoxFit.cover);
      }
    }
    if (item.illustrationBase64 != null && item.illustrationBase64!.isNotEmpty) {
      try {
        return Image.memory(base64Decode(item.illustrationBase64!), fit: BoxFit.cover);
      } catch (_) {}
    }
    return _buildFallbackAtmosphericGraphic();
  }

  Widget _buildFallbackAtmosphericGraphic() {
    return Container(
      decoration: BoxDecoration(
        gradient: RadialGradient(
          center: const Alignment(0.2, -0.3),
          radius: 1.2,
          colors: [
            config.primaryColor.withValues(alpha: 0.45),
            const Color(0xFF0F172A),
            const Color(0xFF020617),
          ],
        ),
      ),
      child: Center(
        child: Icon(
          Icons.auto_awesome,
          size: 72,
          color: Colors.white.withValues(alpha: 0.25),
        ),
      ),
    );
  }
}
