import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../models/postcard_item.dart';
import '../../models/poster_style_config.dart';
import '../artistic_poster_visual.dart';
import '../book_cover_viewer_dialog.dart';
import '../photo_viewer_dialog.dart';

class AiInfographicPoster extends StatelessWidget {
  final PostCardItem item;
  final PosterStyleConfig config;

  const AiInfographicPoster({
    super.key,
    required this.item,
    required this.config,
  });

  Future<void> _launchUrl(BuildContext context, String url) async {
    try {
      final uri = Uri.parse(url);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    } catch (_) {}
  }

  String _cleanDomain(String? rawUrl) {
    if (rawUrl == null || rawUrl.isEmpty) return 'read source';
    try {
      final uri = Uri.parse(rawUrl);
      var host = uri.host.toLowerCase();
      if (host.startsWith('www.')) host = host.substring(4);
      if (host.isNotEmpty) return host;
    } catch (_) {}
    return 'read source';
  }

  @override
  Widget build(BuildContext context) {
    final hasAiImage = (item.illustrationBase64 != null && item.illustrationBase64!.isNotEmpty) ||
        (item.renderedPosterPath != null && !kIsWeb && File(item.renderedPosterPath!).existsSync());

    if (hasAiImage) {
      return Container(
        width: double.infinity,
        decoration: BoxDecoration(
          color: const Color(0xFF0D1117),
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.35),
              blurRadius: 20,
              offset: const Offset(0, 8),
            ),
          ],
          border: Border.all(
            color: const Color(0xFF38BDF8).withValues(alpha: 0.25),
            width: 1.5,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: AspectRatio(
          aspectRatio: 1.0,
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
            child: Stack(
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

                // Top Left: Publication & Category Pill / Book Cover Pill
                Positioned(
                  top: 12,
                  left: 12,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.72),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: Colors.white24, width: 0.8),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.auto_awesome, size: 11, color: Color(0xFF38BDF8)),
                            const SizedBox(width: 5),
                            Text(
                              item.publicationName ?? 'Print Article',
                              style: GoogleFonts.montserrat(
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (item.isBookExcerpt) ...[
                        const SizedBox(width: 8),
                        GestureDetector(
                          onTap: () => BookCoverViewerDialog.show(context, item: item),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: const Color(0xFF7C3AED).withValues(alpha: 0.9),
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(color: Colors.white70, width: 0.9),
                            ),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.menu_book_rounded, size: 11, color: Colors.white),
                                SizedBox(width: 4),
                                Text(
                                  'COVER',
                                  style: TextStyle(
                                    fontSize: 9.5,
                                    fontWeight: FontWeight.w800,
                                    color: Colors.white,
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

                // Top Right: Fullscreen Zoom Icon
                Positioned(
                  top: 12,
                  right: 12,
                  child: Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.65),
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white24, width: 0.8),
                    ),
                    child: const Icon(Icons.fullscreen, size: 16, color: Colors.white),
                  ),
                ),

                // Bottom Right: Subtle digital source link pill (only for digital web articles)
                if (item.isDigitalLinkSource && item.digitalLink != null && item.digitalLink!.isNotEmpty && !item.digitalLink!.contains('news.google.com'))
                  Positioned(
                    bottom: 12,
                    right: 12,
                    child: GestureDetector(
                      onTap: () => _launchUrl(context, item.digitalLink!),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.78),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: Colors.white30, width: 0.8),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.link, size: 12, color: Colors.white),
                            const SizedBox(width: 4),
                            Text(
                              _cleanDomain(item.digitalLink),
                              style: const TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                                color: Colors.white,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      );
    }

    // Fallback if no AI image exists yet (procedural visual infographic)
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: config.backgroundColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: config.secondaryColor.withValues(alpha: 0.4), width: 1.5),
      ),
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  'AI INFOGRAPHIC POSTER',
                  style: GoogleFonts.spaceGrotesk(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.5,
                    color: config.secondaryColor,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: config.secondaryColor,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  item.categoryBadge.toUpperCase(),
                  style: const TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
          if (item.isBookExcerpt) ...[
            const SizedBox(height: 8),
            GestureDetector(
              onTap: () => BookCoverViewerDialog.show(context, item: item),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: config.secondaryColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: config.secondaryColor.withValues(alpha: 0.4)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.menu_book_rounded, size: 12, color: config.secondaryColor),
                    const SizedBox(width: 5),
                    Text(
                      'BOOK: ${item.bookTitle ?? item.publicationName ?? "EXCERPT"}',
                      style: GoogleFonts.spaceGrotesk(
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                        color: config.secondaryColor,
                      ),
                    ),
                    const Spacer(),
                    Text(
                      'VIEW COVER ↗',
                      style: TextStyle(
                        fontSize: 8.5,
                        fontWeight: FontWeight.w800,
                        color: config.secondaryColor,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
          const SizedBox(height: 12),
          ArtisticPosterVisual(item: item, config: config, height: 240),
          const SizedBox(height: 14),
          Text(
            item.adaptedHeadline,
            style: GoogleFonts.spaceGrotesk(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: config.textColor,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            item.hook,
            style: TextStyle(
              fontSize: 12,
              height: 1.4,
              color: config.textColor.withValues(alpha: 0.8),
            ),
          ),
        ],
      ),
    );
  }
}
