import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../models/postcard_item.dart';
import '../../models/poster_style_config.dart';
import '../artistic_poster_visual.dart';
import '../book_cover_viewer_dialog.dart';

class ModernCyberPoster extends StatelessWidget {
  final PostCardItem item;
  final PosterStyleConfig config;

  const ModernCyberPoster({
    super.key,
    required this.item,
    required this.config,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: const Color(0xFF070B14),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: const Color(0xFF06B6D4).withValues(alpha: 0.35),
          width: 1.5,
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF06B6D4).withValues(alpha: 0.12),
            blurRadius: 24,
            spreadRadius: 2,
          ),
        ],
      ),
      padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Header Bar
          Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: const BoxDecoration(
                  color: Color(0xFF10B981),
                  shape: BoxShape.circle,
                ),
              ),
              Expanded(
                child: Text(
                  'INTEL // ${item.categoryBadge.toUpperCase()}',
                  style: GoogleFonts.spaceMono(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.5,
                    color: const Color(0xFF06B6D4),
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(
                    color: const Color(0xFF818CF8).withValues(alpha: 0.4),
                  ),
                ),
                child: Text(
                  item.targetAudience.toUpperCase(),
                  style: GoogleFonts.spaceMono(
                    fontSize: 8.5,
                    color: const Color(0xFFC7D2FE),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          if (item.isBookExcerpt) ...[
            const SizedBox(height: 10),
            GestureDetector(
              onTap: () => BookCoverViewerDialog.show(context, item: item),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: const Color(0xFF06B6D4).withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(
                    color: const Color(0xFF06B6D4).withValues(alpha: 0.4),
                  ),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.menu_book_rounded, size: 14, color: Color(0xFF06B6D4)),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'BOOK: ${item.bookTitle ?? item.publicationName ?? "READING EXCERPT"}${item.bookAuthor != null ? " // BY ${item.bookAuthor}" : ""}',
                        style: GoogleFonts.spaceMono(
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          color: const Color(0xFF06B6D4),
                          letterSpacing: 0.5,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: const Color(0xFF06B6D4),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        'VIEW COVER',
                        style: GoogleFonts.spaceMono(
                          fontSize: 8,
                          fontWeight: FontWeight.w800,
                          color: Colors.black,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
          const SizedBox(height: 14),

          // Cyber Artwork / Banner
          _buildCyberArtworkHeader(),
          const SizedBox(height: 14),

          // Main Headline
          Text(
            item.adaptedHeadline,
            style: GoogleFonts.spaceGrotesk(
              fontSize: 21,
              fontWeight: FontWeight.w800,
              height: 1.25,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 10),

          // Hook
          Text(
            item.hook,
            style: GoogleFonts.inter(
              fontSize: 12,
              height: 1.45,
              color: const Color(0xFF94A3B8),
            ),
          ),
          const SizedBox(height: 14),

          // Why It Matters
          if (item.whyItMatters != null && item.whyItMatters!.isNotEmpty) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF0F172A),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFF06B6D4).withValues(alpha: 0.3)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.flash_on, size: 16, color: Color(0xFF06B6D4)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'IMPACT ON ${item.targetAudience.toUpperCase()}',
                          style: GoogleFonts.spaceMono(
                            fontSize: 8.5,
                            fontWeight: FontWeight.bold,
                            color: const Color(0xFF38BDF8),
                            letterSpacing: 1.0,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          item.whyItMatters!,
                          style: GoogleFonts.inter(
                            fontSize: 11,
                            color: const Color(0xFFCBD5E1),
                            height: 1.35,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
          ],

          // Metric & Telemetry Box
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  const Color(0xFF0F172A),
                  const Color(0xFF1E1B4B).withValues(alpha: 0.6),
                ],
              ),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: const Color(0xFF6366F1).withValues(alpha: 0.3),
              ),
            ),
            child: Row(
              children: [
                if (item.keyMetric != null && item.keyMetric!.isNotEmpty) ...[
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'METRIC TARGET',
                        style: GoogleFonts.spaceMono(
                          fontSize: 8.5,
                          color: const Color(0xFF818CF8),
                          letterSpacing: 1.2,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        item.keyMetric!,
                        style: GoogleFonts.spaceGrotesk(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: const Color(0xFF38BDF8),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(width: 14),
                  Container(
                    width: 1,
                    height: 34,
                    color: Colors.white.withValues(alpha: 0.15),
                  ),
                  const SizedBox(width: 14),
                ],
                Expanded(
                  child: Text(
                    item.pullQuote ?? 'Extracted directly from physical media telemetry.',
                    style: GoogleFonts.inter(
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
          ),
          const SizedBox(height: 18),

          // Takeaways
          Text(
            'KEY PROTOCOLS & SIGNALS',
            style: GoogleFonts.spaceMono(
              fontSize: 9.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.2,
              color: const Color(0xFF38BDF8),
            ),
          ),
          const SizedBox(height: 8),
          ...item.keyTakeaways.take(4).map((takeaway) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Padding(
                      padding: EdgeInsets.only(top: 3),
                      child: Icon(
                        Icons.bolt,
                        size: 13,
                        color: Color(0xFF06B6D4),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        takeaway,
                        style: GoogleFonts.inter(
                          fontSize: 11,
                          height: 1.35,
                          color: const Color(0xFFCBD5E1),
                        ),
                      ),
                    ),
                  ],
                ),
              )),

          const SizedBox(height: 16),
          // Footer
          Container(
            padding: const EdgeInsets.only(top: 10),
            decoration: BoxDecoration(
              border: Border(
                top: BorderSide(
                  color: Colors.white.withValues(alpha: 0.1),
                ),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'SRC: ${item.publicationName ?? "PHYSICAL PRESS"}',
                  style: GoogleFonts.spaceMono(
                    fontSize: 8.5,
                    color: const Color(0xFF64748B),
                  ),
                ),
                Text(
                  item.creatorHandle?.toUpperCase() ?? '@CURATOR',
                  style: GoogleFonts.spaceMono(
                    fontSize: 8.5,
                    fontWeight: FontWeight.w700,
                    color: const Color(0xFF06B6D4),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCyberArtworkHeader() {
    final double artHeight = 110.0 + (item.visualArtRatio.clamp(0.2, 0.9) * 160.0);
    return ArtisticPosterVisual(
      item: item,
      config: config,
      height: artHeight,
    );
  }
}
