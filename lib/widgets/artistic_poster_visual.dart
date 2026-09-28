import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/postcard_item.dart';
import '../models/poster_style_config.dart';

/// Renders the visual picture artwork and infographic component of a PostCard poster.
/// Adapts dynamically to [visualArtRatio] (20% to 90%).
class ArtisticPosterVisual extends StatelessWidget {
  final PostCardItem item;
  final PosterStyleConfig config;
  final double height;

  const ArtisticPosterVisual({
    super.key,
    required this.item,
    required this.config,
    required this.height,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      width: double.infinity,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.15),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Base Artwork layer: AI Illustration OR Procedural Generative Art
          _buildBaseArtwork(),

          // Artistic Vignette & Gradient Mesh overlay
          _buildArtisticGradientOverlay(),

          // Infographic Layer (Meters, Stats, Badges)
          _buildInfographicOverlay(),

          // Artistic Watermark / Badge
          Positioned(
            top: 10,
            left: 12,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.55),
                borderRadius: BorderRadius.circular(4),
                border: Border.all(
                  color: Colors.white.withValues(alpha: 0.25),
                  width: 0.8,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.auto_awesome,
                    size: 11,
                    color: config.secondaryColor,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    item.visualMood?.toUpperCase() ?? 'PICTURE ART',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 8.5,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 1.0,
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Art Ratio Indicator Pill
          Positioned(
            top: 10,
            right: 12,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: config.primaryColor.withValues(alpha: 0.85),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                '${(item.visualArtRatio * 100).round()}% ART',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 8,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.8,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBaseArtwork() {
    // If local rendered poster/illustration file exists on disk, display it
    if (item.renderedPosterPath != null && item.renderedPosterPath!.isNotEmpty) {
      final f = File(item.renderedPosterPath!);
      if (f.existsSync()) {
        return Image.file(
          f,
          fit: BoxFit.cover,
          width: double.infinity,
          height: double.infinity,
        );
      }
    }

    // If AI Generated Illustration exists, display it
    if (item.illustrationBase64 != null && item.illustrationBase64!.isNotEmpty) {
      try {
        final bytes = base64Decode(item.illustrationBase64!);
        return Image.memory(
          bytes,
          fit: BoxFit.cover,
          width: double.infinity,
          height: double.infinity,
        );
      } catch (e) {
        debugPrint('Failed to decode illustrationBase64: $e');
      }
    }

    // Otherwise render style-specific generative picture art
    switch (item.posterStyle) {
      case PosterStyleType.aiInfographic:
      case PosterStyleType.modernCyber:
        return CustomPaint(
          painter: _CyberArtPainter(
            primaryColor: config.primaryColor,
            secondaryColor: config.secondaryColor,
            accentColor: config.accentColor,
          ),
        );
      case PosterStyleType.boldSocial:
        return CustomPaint(
          painter: _PopSocialArtPainter(
            primaryColor: config.primaryColor,
            secondaryColor: config.secondaryColor,
            accentColor: config.accentColor,
          ),
        );
      case PosterStyleType.minimalist:
        return CustomPaint(
          painter: _BauhausArtPainter(
            primaryColor: config.primaryColor,
            secondaryColor: config.secondaryColor,
            accentColor: config.accentColor,
          ),
        );
      case PosterStyleType.editorial:
        return CustomPaint(
          painter: _EditorialLithographPainter(
            primaryColor: config.primaryColor,
            secondaryColor: config.secondaryColor,
            accentColor: config.accentColor,
          ),
        );
    }
  }

  Widget _buildArtisticGradientOverlay() {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Colors.black.withValues(alpha: 0.2),
            Colors.transparent,
            Colors.black.withValues(alpha: 0.75),
          ],
          stops: const [0.0, 0.45, 1.0],
        ),
      ),
    );
  }

  Widget _buildInfographicOverlay() {
    final stats = item.infographicStats.isNotEmpty
        ? item.infographicStats
        : (item.keyMetric != null ? [item.keyMetric!, item.categoryBadge] : ['Front Page', 'Insight']);

    return Positioned(
      bottom: 12,
      left: 12,
      right: 12,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Infographic Stat Callout Strip
          Wrap(
            spacing: 6,
            runSpacing: 4,
            children: stats.take(3).map((stat) {
              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.65),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(
                    color: config.secondaryColor.withValues(alpha: 0.6),
                    width: 1,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: config.secondaryColor.withValues(alpha: 0.15),
                      blurRadius: 4,
                      offset: const Offset(0, 2),
                    ),
                  ],
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
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.4,
                      ),
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// GENERATIVE PICTURE ART PAINTERS
// ---------------------------------------------------------------------------

/// Generative Cyberpunk Neon Art Painter
class _CyberArtPainter extends CustomPainter {
  final Color primaryColor;
  final Color secondaryColor;
  final Color accentColor;

  _CyberArtPainter({
    required this.primaryColor,
    required this.secondaryColor,
    required this.accentColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final bgPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [
          const Color(0xFF070B19),
          const Color(0xFF0F172A),
          const Color(0xFF1E1035),
        ],
      ).createShader(rect);
    canvas.drawRect(rect, bgPaint);

    // Glowing isometric grid lines
    final gridPaint = Paint()
      ..color = secondaryColor.withValues(alpha: 0.12)
      ..strokeWidth = 1.0;
    const double step = 28.0;
    for (double x = 0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), gridPaint);
    }
    for (double y = 0; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }

    // Glowing Neon Concentric Rings & Hexagons
    final center = Offset(size.width * 0.5, size.height * 0.45);
    final ringPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.8
      ..shader = RadialGradient(
        colors: [
          secondaryColor.withValues(alpha: 0.8),
          accentColor.withValues(alpha: 0.2),
        ],
      ).createShader(Rect.fromCircle(center: center, radius: 90));

    canvas.drawCircle(center, 70, ringPaint);
    canvas.drawCircle(center, 40, ringPaint..strokeWidth = 1.2);

    // Dynamic Circuit Rays
    final rayPaint = Paint()
      ..color = secondaryColor.withValues(alpha: 0.4)
      ..strokeWidth = 1.5;
    for (int i = 0; i < 8; i++) {
      final angle = (i * math.pi / 4);
      final p1 = center + Offset(math.cos(angle) * 75, math.sin(angle) * 75);
      final p2 = center + Offset(math.cos(angle) * 115, math.sin(angle) * 115);
      canvas.drawLine(p1, p2, rayPaint);
      canvas.drawCircle(p2, 2.5, Paint()..color = accentColor);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Generative Pop Art & Vibrant Social Painter
class _PopSocialArtPainter extends CustomPainter {
  final Color primaryColor;
  final Color secondaryColor;
  final Color accentColor;

  _PopSocialArtPainter({
    required this.primaryColor,
    required this.secondaryColor,
    required this.accentColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final bgPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [
          const Color(0xFFFF5252),
          const Color(0xFFFF7A00),
          const Color(0xFFFFD600),
        ],
      ).createShader(rect);
    canvas.drawRect(rect, bgPaint);

    // Diagonal dynamic stripes
    final stripePaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.12)
      ..strokeWidth = 14;
    for (double i = -size.height; i < size.width * 2; i += 34) {
      canvas.drawLine(Offset(i, 0), Offset(i + size.height, size.height), stripePaint);
    }

    // Bold Pop Geometric Shapes
    final shapePaint = Paint()
      ..color = Colors.black.withValues(alpha: 0.25)
      ..style = PaintingStyle.fill;
    canvas.drawCircle(Offset(size.width * 0.75, size.height * 0.4), 60, shapePaint);

    final pillPaint = Paint()..color = Colors.white.withValues(alpha: 0.9);
    final rrect = RRect.fromRectAndRadius(
      Rect.fromCenter(
        center: Offset(size.width * 0.4, size.height * 0.45),
        width: 140,
        height: 60,
      ),
      const Radius.circular(30),
    );
    canvas.drawRRect(rrect, pillPaint);

    final innerPillPaint = Paint()..color = primaryColor;
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(
          center: Offset(size.width * 0.4, size.height * 0.45),
          width: 130,
          height: 50,
        ),
        const Radius.circular(25),
      ),
      innerPillPaint,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Generative Swiss Bauhaus Painter
class _BauhausArtPainter extends CustomPainter {
  final Color primaryColor;
  final Color secondaryColor;
  final Color accentColor;

  _BauhausArtPainter({
    required this.primaryColor,
    required this.secondaryColor,
    required this.accentColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    canvas.drawRect(rect, Paint()..color = const Color(0xFFF1EDE6));

    // Bauhaus Red, Blue, Yellow minimal geometry
    final circlePaint = Paint()..color = const Color(0xFFD63031);
    canvas.drawCircle(Offset(size.width * 0.35, size.height * 0.4), 65, circlePaint);

    final rectPaint = Paint()..color = const Color(0xFF0984E3).withValues(alpha: 0.85);
    canvas.drawRect(
      Rect.fromLTWH(size.width * 0.45, size.height * 0.2, 90, 90),
      rectPaint,
    );

    final yellowPaint = Paint()..color = const Color(0xFFFDCB6E);
    final path = Path()
      ..moveTo(size.width * 0.2, size.height * 0.75)
      ..lineTo(size.width * 0.6, size.height * 0.75)
      ..lineTo(size.width * 0.4, size.height * 0.35)
      ..close();
    canvas.drawPath(path, yellowPaint);

    // Grid rule lines
    final linePaint = Paint()
      ..color = const Color(0xFF2D3436)
      ..strokeWidth = 2.0;
    canvas.drawLine(Offset(0, size.height * 0.65), Offset(size.width, size.height * 0.65), linePaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Generative Vintage Editorial Lithograph Painter
class _EditorialLithographPainter extends CustomPainter {
  final Color primaryColor;
  final Color secondaryColor;
  final Color accentColor;

  _EditorialLithographPainter({
    required this.primaryColor,
    required this.secondaryColor,
    required this.accentColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final bgPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [
          const Color(0xFF2B2118),
          const Color(0xFF1E1711),
          const Color(0xFF382C22),
        ],
      ).createShader(rect);
    canvas.drawRect(rect, bgPaint);

    // Engraving Hatch lines
    final hatchPaint = Paint()
      ..color = const Color(0xFFD4AF37).withValues(alpha: 0.12)
      ..strokeWidth = 1.0;
    for (double i = -size.height; i < size.width + size.height; i += 12) {
      canvas.drawLine(Offset(i, 0), Offset(i + 50, size.height), hatchPaint);
    }

    // Classic Double Oval Lithograph Frame
    final center = Offset(size.width * 0.5, size.height * 0.45);
    final ovalPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0
      ..color = const Color(0xFFD4AF37).withValues(alpha: 0.6);
    canvas.drawOval(Rect.fromCenter(center: center, width: 170, height: 120), ovalPaint);
    canvas.drawOval(
      Rect.fromCenter(center: center, width: 156, height: 106),
      ovalPaint..strokeWidth = 0.8,
    );

    // Center Emblem Star
    final starPaint = Paint()..color = const Color(0xFFD4AF37).withValues(alpha: 0.7);
    canvas.drawCircle(center, 6, starPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
