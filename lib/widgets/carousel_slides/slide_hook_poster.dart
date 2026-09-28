import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import '../../models/postcard_item.dart';
import '../../models/poster_style_config.dart';

class SlideHookPoster extends StatelessWidget {
  final PostCardItem item;
  final PosterStyleConfig config;
  final BorderRadius? borderRadius;

  const SlideHookPoster({
    super.key,
    required this.item,
    required this.config,
    this.borderRadius,
  });

  @override
  Widget build(BuildContext context) {
    final headline = item.adaptedHeadline.isNotEmpty ? item.adaptedHeadline : (item.originalHeadline ?? 'Story Overview');
    final pubName = item.publicationName ?? 'Press Wire';
    final category = item.categoryBadge.isNotEmpty ? item.categoryBadge.toUpperCase() : 'EDITORIAL';
    final handle = item.creatorHandle ?? '@curator';

    // Dynamic responsive font sizing for the bold display headline
    final double headlineSize = headline.length > 80
        ? 21.0
        : (headline.length > 50
            ? 23.5
            : (headline.length > 30 ? 25.5 : 27.5));

    final effectiveRadius = borderRadius ?? BorderRadius.circular(16);
    final isFlush = borderRadius == BorderRadius.zero;

    return AspectRatio(
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

              // 2. Cinematic Multi-Stop Dark Vignette Overlay
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

              // 4. Lower Content Section: Bold Headline Only (No sub-hook)
              // Anchored cleanly at the bottom without covering the visual art subject
              Positioned(
                bottom: 16,
                left: 18,
                right: 18,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Massive, Punchy Display Headline
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
    );
  }

  Widget _buildVisualArt() {
    // 1. High-resolution rendered AI illustration file
    if (item.renderedPosterPath != null && item.renderedPosterPath!.isNotEmpty) {
      final file = File(item.renderedPosterPath!);
      if (file.existsSync()) {
        return Image.file(file, fit: BoxFit.cover);
      }
    }
    // 2. In-memory decoded AI illustration bytes
    if (item.illustrationBase64 != null && item.illustrationBase64!.isNotEmpty) {
      try {
        return Image.memory(base64Decode(item.illustrationBase64!), fit: BoxFit.cover);
      } catch (_) {}
    }
    // NOTE: We NEVER display the raw paper cut camera photo on Slide 1!
    // Slide 1 is the conceptual visual hook. The raw newspaper clipping belongs exclusively to Slide 3.
    return _buildStylizedConceptArt();
  }

  Widget _buildStylizedConceptArt() {
    final heroIcon = _resolveHeroIcon();
    final hasCues = item.hookCues != null && item.hookCues!.trim().isNotEmpty;

    return Container(
      decoration: BoxDecoration(
        gradient: RadialGradient(
          center: const Alignment(0.0, -0.25),
          radius: 1.35,
          colors: [
            config.primaryColor.withValues(alpha: 0.50),
            const Color(0xFF1E293B),
            const Color(0xFF090D16),
            const Color(0xFF030712),
          ],
          stops: const [0.0, 0.45, 0.78, 1.0],
        ),
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Background ambient grid & ring motifs
          Positioned(
            top: 60,
            child: Container(
              width: 260,
              height: 260,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: config.primaryColor.withValues(alpha: 0.12),
                  width: 1.0,
                ),
              ),
            ),
          ),
          Positioned(
            top: 85,
            child: Container(
              width: 210,
              height: 210,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: config.primaryColor.withValues(alpha: 0.20),
                  width: 1.2,
                ),
              ),
            ),
          ),

          // Central Glowing Hero Emblem
          Positioned(
            top: 110,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 100,
                  height: 100,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [
                        config.primaryColor.withValues(alpha: 0.85),
                        config.primaryColor.withValues(alpha: 0.35),
                      ],
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: config.primaryColor.withValues(alpha: 0.55),
                        blurRadius: 40,
                        spreadRadius: 4,
                      ),
                    ],
                  ),
                  child: Center(
                    child: Icon(
                      heroIcon,
                      size: 46,
                      color: Colors.white,
                    ),
                  ),
                ),
                if (hasCues) ...[
                  const SizedBox(height: 16),
                  Container(
                    margin: const EdgeInsets.symmetric(horizontal: 24),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.70),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: config.primaryColor.withValues(alpha: 0.75),
                        width: 1.2,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: config.primaryColor.withValues(alpha: 0.30),
                          blurRadius: 18,
                          offset: const Offset(0, 3),
                        ),
                      ],
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.auto_awesome, size: 13, color: config.primaryColor),
                        const SizedBox(width: 7),
                        Flexible(
                          child: Text(
                            item.hookCues!.trim(),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11.5,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.2,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
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
