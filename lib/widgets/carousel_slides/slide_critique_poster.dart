import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import '../../models/postcard_item.dart';
import '../../models/poster_style_config.dart';

class SlideCritiquePoster extends StatelessWidget {
  final PostCardItem item;
  final PosterStyleConfig config;
  final BorderRadius? borderRadius;
  final bool showOverlays;

  const SlideCritiquePoster({
    super.key,
    required this.item,
    required this.config,
    this.borderRadius,
    this.showOverlays = true,
  });

  static String _ensureCleanEnding(String text) {
    String clean = text.trim();
    if (clean.isEmpty) return clean;
    while (clean.endsWith('.') || clean.endsWith('…')) {
      if (clean.endsWith('...')) {
        clean = clean.substring(0, clean.length - 3).trim();
      } else if (clean.endsWith('…')) {
        clean = clean.substring(0, clean.length - 1).trim();
      } else {
        break;
      }
    }
    if (!clean.endsWith('.') && !clean.endsWith('!') && !clean.endsWith('?')) {
      clean = '$clean.';
    }
    return clean;
  }

  @override
  Widget build(BuildContext context) {
    final pubName = item.publicationName ?? 'Press Wire';
    final handle = item.creatorHandle ?? '@curator';
    final rawOpinion = (item.creatorOpinion != null && item.creatorOpinion!.trim().isNotEmpty)
        ? item.creatorOpinion!
        : (item.whyItMatters != null && item.whyItMatters!.trim().isNotEmpty
            ? item.whyItMatters!
            : item.hook);

    final opinionText = _ensureCleanEnding(rawOpinion);

    final rawRationale = (item.whyItMatters != null && item.whyItMatters!.trim().isNotEmpty && item.whyItMatters != rawOpinion)
        ? item.whyItMatters!
        : '';

    final rationaleText = _ensureCleanEnding(rawRationale);

    final String slideTitle = (item.keyTakeaways.isNotEmpty &&
            item.keyTakeaways.first.trim().split(' ').length <= 12 &&
            !item.keyTakeaways.first.toLowerCase().contains('http'))
        ? item.keyTakeaways.first.trim().toUpperCase()
        : 'THE CRITICAL PERSPECTIVE';

    // Dynamic responsive font sizing and line wrapping based on opinion text length so statements complete without truncation
    final int opinionMaxLines = opinionText.length > 210 ? 8 : (opinionText.length > 140 ? 6 : 5);
    final double opinionSize = opinionText.length > 210
        ? 11.2
        : (opinionText.length > 150
            ? 12.2
            : (opinionText.length > 90 ? 13.4 : 14.5));

    final double rationaleSize = rationaleText.length > 80 ? 9.8 : 10.5;

    final effectiveRadius = borderRadius ?? BorderRadius.circular(16);
    final isFlush = borderRadius == BorderRadius.zero;

    final posterWidget = AspectRatio(
      aspectRatio: 4 / 5,
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF070B12),
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
              // 1. Full-Bleed Thematic AI Art Backdrop
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
                      // 2a. Multi-Stop Vignette: First half (top 46%) is transparent so artwork is clearly relatable to Slide 1
                      Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    stops: const [0.0, 0.12, 0.46, 0.70, 1.0],
                    colors: [
                      Colors.black.withValues(alpha: 0.55), // Subtle header shadow for top pill readability
                      Colors.transparent,                  // Unobstructed hero artwork matching Slide 1!
                      Colors.transparent,
                      const Color(0xFF070B12).withValues(alpha: 0.85),
                      const Color(0xFF070B12).withValues(alpha: 0.98), // High-contrast anchor for curator's take
                    ],
                  ),
                ),
              ),

              // 3. Top Header Bar (High-Contrast Curator's Take Pill)
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
                        border: Border.all(color: const Color(0xFFF59E0B).withValues(alpha: 0.4)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.bolt_rounded, size: 12, color: Color(0xFFF59E0B)),
                          const SizedBox(width: 5),
                          const Text(
                            "CURATOR'S TAKE",
                            style: TextStyle(
                              fontSize: 9.5,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFFF59E0B),
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
                        '02 / 03',
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

              // 4. Main Editorial Content Area: Compact Bottom Anchoring (Top Half Shows Hero Art!)
              Positioned(
                bottom: 14,
                left: 18,
                right: 18,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Kicker / Section Tag
                    Row(
                      children: [
                        Container(
                          width: 6,
                          height: 6,
                          decoration: const BoxDecoration(
                            color: Color(0xFFF59E0B),
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            slideTitle,
                            style: const TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFFF59E0B),
                              letterSpacing: 1.1,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 7),

                    // Paragraph: The Core Curator Stance & Elaboration (Complete Statement, Never Truncated)
                    Text(
                      opinionText,
                      style: TextStyle(
                        fontSize: opinionSize,
                        fontWeight: FontWeight.w600,
                        color: const Color(0xFFF8FAFC),
                        height: 1.40,
                        letterSpacing: -0.2,
                        shadows: const [
                          Shadow(
                            color: Colors.black87,
                            blurRadius: 8,
                            offset: Offset(0, 2),
                          ),
                        ],
                      ),
                      maxLines: opinionMaxLines,
                      overflow: TextOverflow.ellipsis,
                    ),

                    if (rationaleText.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      // Paragraph 2: Contextual Why It Matters (Compact Callout)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF59E0B).withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(
                            color: const Color(0xFFF59E0B).withValues(alpha: 0.35),
                            width: 0.8,
                          ),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'WHY IT MATTERS: ',
                              style: TextStyle(
                                fontSize: 9.5,
                                fontWeight: FontWeight.w800,
                                color: Color(0xFFF59E0B),
                                letterSpacing: 0.6,
                              ),
                            ),
                            Expanded(
                              child: Text(
                                rationaleText,
                                style: TextStyle(
                                  fontSize: rationaleSize,
                                  fontWeight: FontWeight.w600,
                                  color: const Color(0xFFE2E8F0),
                                  height: 1.25,
                                ),
                                maxLines: 3,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],

                    const SizedBox(height: 12),

                    // High-Contrast Footer (Creator Attribution + Next Slide Trigger)
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
                            color: const Color(0xFFDC2626).withValues(alpha: 0.28),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: const Color(0xFFEF4444), width: 1.2),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                'THE RECEIPTS',
                                style: TextStyle(
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w900,
                                  color: Color(0xFFFCA5A5),
                                  letterSpacing: 0.8,
                                ),
                              ),
                              SizedBox(width: 5),
                              Icon(Icons.arrow_forward_rounded, size: 13, color: Color(0xFFFCA5A5)),
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
                          Icon(Icons.visibility_off_rounded, size: 12, color: Color(0xFFF59E0B)),
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
    // 1. Primary illustration bytes (highest freshness priority on re-rolls)
    if (item.illustrationBase64 != null && item.illustrationBase64!.isNotEmpty) {
      try {
        return Image.memory(
          base64Decode(item.illustrationBase64!),
          key: ValueKey('critique_mem_${item.id}_${item.illustrationBase64.hashCode}'),
          fit: BoxFit.cover,
          gaplessPlayback: true,
        );
      } catch (_) {}
    }
    // 2. Primary rendered poster image file (shares exact hero art with Slide 1)
    if (item.renderedPosterPath != null && item.renderedPosterPath!.isNotEmpty) {
      final file = File(item.renderedPosterPath!);
      if (file.existsSync()) {
        return Image.file(
          file,
          key: ValueKey('critique_file_${item.renderedPosterPath}_${item.illustrationBase64.hashCode}'),
          fit: BoxFit.cover,
          gaplessPlayback: true,
        );
      }
    }
    // 3. Dedicated curator illustration if generated
    if (item.curatorIllustrationBase64 != null && item.curatorIllustrationBase64!.isNotEmpty) {
      try {
        return Image.memory(
          base64Decode(item.curatorIllustrationBase64!),
          key: ValueKey('critique_cur_${item.id}_${item.curatorIllustrationBase64.hashCode}'),
          fit: BoxFit.cover,
          gaplessPlayback: true,
        );
      } catch (_) {}
    }
    return _buildFallbackArtisticGraphic();
  }

  Widget _buildFallbackArtisticGraphic() {
    return Container(
      decoration: BoxDecoration(
        gradient: RadialGradient(
          center: const Alignment(-0.2, 0.2),
          radius: 1.2,
          colors: [
            const Color(0xFFF59E0B).withValues(alpha: 0.25),
            const Color(0xFF0F172A),
            const Color(0xFF070B12),
          ],
        ),
      ),
      child: Center(
        child: Icon(
          Icons.lightbulb_outline_rounded,
          size: 72,
          color: Colors.white.withValues(alpha: 0.2),
        ),
      ),
    );
  }
}
