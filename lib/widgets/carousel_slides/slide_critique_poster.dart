import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import '../../models/postcard_item.dart';
import '../../models/poster_style_config.dart';

class SlideCritiquePoster extends StatelessWidget {
  final PostCardItem item;
  final PosterStyleConfig config;
  final BorderRadius? borderRadius;

  const SlideCritiquePoster({
    super.key,
    required this.item,
    required this.config,
    this.borderRadius,
  });

  @override
  Widget build(BuildContext context) {
    final pubName = item.publicationName ?? 'Press Wire';
    final handle = item.creatorHandle ?? '@curator';
    final opinionText = (item.creatorOpinion != null && item.creatorOpinion!.trim().isNotEmpty)
        ? item.creatorOpinion!
        : (item.whyItMatters != null && item.whyItMatters!.trim().isNotEmpty
            ? item.whyItMatters!
            : item.hook);

    final pullQuote = (item.pullQuote != null && item.pullQuote!.trim().isNotEmpty)
        ? item.pullQuote!
        : (item.keyTakeaways.isNotEmpty ? item.keyTakeaways.first : 'A structural shift the mainstream missed.');

    final rationaleText = (item.whyItMatters != null && item.whyItMatters!.trim().isNotEmpty && item.whyItMatters != opinionText)
        ? item.whyItMatters!
        : '';

    // Dynamic responsive font sizing based on opinion text length so statements complete without truncation
    final double opinionSize = opinionText.length > 220
        ? 13.0
        : (opinionText.length > 150
            ? 14.0
            : (opinionText.length > 80 ? 15.0 : 16.0));

    final double pullQuoteSize = pullQuote.length > 120 ? 11.0 : 12.0;

    final effectiveRadius = borderRadius ?? BorderRadius.circular(16);
    final isFlush = borderRadius == BorderRadius.zero;

    return AspectRatio(
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

              // 2. Dark Atmospheric Scrim / Glassmorphic Backdrop
              Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    stops: const [0.0, 0.22, 0.55, 1.0],
                    colors: [
                      Colors.black.withValues(alpha: 0.75),
                      const Color(0xFF090D16).withValues(alpha: 0.80),
                      const Color(0xFF070B12).withValues(alpha: 0.92),
                      const Color(0xFF070B12).withValues(alpha: 0.98),
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

              // 4. Main Editorial Content Area (Complete Paragraph-Style Writing)
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
                        const Text(
                          'THE CRITICAL PERSPECTIVE',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            color: Color(0xFFF59E0B),
                            letterSpacing: 1.1,
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 10),

                    // Paragraph: The Core Curator Stance & Elaboration (Complete Statement, Never Truncated)
                    Text(
                      opinionText,
                      style: TextStyle(
                        fontSize: opinionSize,
                        fontWeight: FontWeight.w600,
                        color: const Color(0xFFF8FAFC),
                        height: 1.45,
                        letterSpacing: -0.2,
                        shadows: const [
                          Shadow(
                            color: Colors.black87,
                            blurRadius: 8,
                            offset: Offset(0, 2),
                          ),
                        ],
                      ),
                    ),

                    if (rationaleText.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      // Paragraph 2: Contextual Why It Matters (Complete Statement)
                      Text(
                        rationaleText,
                        style: const TextStyle(
                          fontSize: 12.0,
                          fontWeight: FontWeight.w400,
                          color: Color(0xFFCBD5E1),
                          height: 1.38,
                          fontStyle: FontStyle.italic,
                          shadows: [
                            Shadow(
                              color: Colors.black87,
                              blurRadius: 6,
                              offset: Offset(0, 1),
                            ),
                          ],
                        ),
                      ),
                    ],

                    const SizedBox(height: 12),

                    // Subtle Frosted Pull Quote Strip (Complete Thought)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.5),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
                      ),
                      child: Row(
                        children: [
                          Text(
                            '“',
                            style: TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w900,
                              height: 0.8,
                              color: config.accentColor,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              pullQuote,
                              style: TextStyle(
                                fontSize: pullQuoteSize,
                                fontWeight: FontWeight.w600,
                                color: const Color(0xFFE2E8F0),
                                fontStyle: FontStyle.italic,
                                height: 1.3,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 14),

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
    );
  }

  Widget _buildVisualArt() {
    // 1. Check if dedicated curator illustration exists
    if (item.curatorIllustrationBase64 != null && item.curatorIllustrationBase64!.isNotEmpty) {
      try {
        return Image.memory(base64Decode(item.curatorIllustrationBase64!), fit: BoxFit.cover);
      } catch (_) {}
    }
    // 2. Check if primary rendered poster path exists
    if (item.renderedPosterPath != null && item.renderedPosterPath!.isNotEmpty) {
      final file = File(item.renderedPosterPath!);
      if (file.existsSync()) {
        return Image.file(file, fit: BoxFit.cover);
      }
    }
    // 3. Check if primary illustration exists
    if (item.illustrationBase64 != null && item.illustrationBase64!.isNotEmpty) {
      try {
        return Image.memory(base64Decode(item.illustrationBase64!), fit: BoxFit.cover);
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
