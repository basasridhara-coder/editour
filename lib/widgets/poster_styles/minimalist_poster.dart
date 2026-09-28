import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../models/postcard_item.dart';
import '../../models/poster_style_config.dart';
import '../artistic_poster_visual.dart';
import '../book_cover_viewer_dialog.dart';

class MinimalistPoster extends StatelessWidget {
  final PostCardItem item;
  final PosterStyleConfig config;

  const MinimalistPoster({
    super.key,
    required this.item,
    required this.config,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: const Color(0xFFE4E4E7), width: 1.5),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 26),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Index & category
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: 14,
                height: 3,
                color: const Color(0xFF2563EB), // Electric blue accent
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'POSTCARD / ${item.categoryBadge.toUpperCase()}',
                  style: GoogleFonts.inter(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.8,
                    color: const Color(0xFF18181B),
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                item.targetAudience.toUpperCase(),
                style: GoogleFonts.inter(
                  fontSize: 9,
                  fontWeight: FontWeight.w600,
                  color: const Color(0xFF71717A),
                  letterSpacing: 0.8,
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
                  color: const Color(0xFFF1F5F9),
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: const Color(0xFFCBD5E1)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.menu_book_rounded, size: 13, color: Color(0xFF334155)),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'BOOK: ${item.bookTitle ?? item.publicationName ?? "READING EXCERPT"}${item.bookAuthor != null ? " / ${item.bookAuthor}" : ""}',
                        style: GoogleFonts.inter(
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          color: const Color(0xFF334155),
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
                        color: const Color(0xFF2563EB),
                        borderRadius: BorderRadius.circular(2),
                      ),
                      child: Text(
                        'COVER',
                        style: GoogleFonts.inter(
                          fontSize: 8,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
          const SizedBox(height: 16),

          // Picture Art & Infographics Section
          ArtisticPosterVisual(
            item: item,
            config: config,
            height: 110.0 + (item.visualArtRatio.clamp(0.2, 0.9) * 160.0),
          ),
          const SizedBox(height: 16),

          // Main Headline
          Text(
            item.adaptedHeadline,
            style: GoogleFonts.outfit(
              fontSize: 22,
              fontWeight: FontWeight.w700,
              height: 1.25,
              color: const Color(0xFF09090B),
            ),
          ),
          const SizedBox(height: 10),

          // Hook
          Text(
            item.hook,
            style: GoogleFonts.inter(
              fontSize: 12,
              height: 1.45,
              fontWeight: FontWeight.w400,
              color: const Color(0xFF52525B),
            ),
          ),
          const SizedBox(height: 14),

          // Why It Matters Box
          if (item.whyItMatters != null && item.whyItMatters!.isNotEmpty) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(4),
                border: const Border(
                  left: BorderSide(color: Color(0xFF2563EB), width: 3),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'STRATEGIC IMPACT FOR ${item.targetAudience.toUpperCase()}',
                    style: GoogleFonts.inter(
                      fontSize: 8.5,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.0,
                      color: const Color(0xFF2563EB),
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    item.whyItMatters!,
                    style: GoogleFonts.inter(
                      fontSize: 11,
                      color: const Color(0xFF334155),
                      height: 1.35,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
          ],

          // Divider
          Container(height: 1, color: const Color(0xFFE4E4E7)),
          const SizedBox(height: 16),

          // Metric + Pullquote combo
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (item.keyMetric != null && item.keyMetric!.isNotEmpty) ...[
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.keyMetric!,
                      style: GoogleFonts.outfit(
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                        color: const Color(0xFF2563EB),
                        height: 1.0,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'KEY STAT',
                      style: GoogleFonts.inter(
                        fontSize: 8.5,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.0,
                        color: const Color(0xFFA1A1AA),
                      ),
                    ),
                  ],
                ),
                const SizedBox(width: 16),
                Container(
                  width: 1,
                  height: 38,
                  color: const Color(0xFFE4E4E7),
                ),
                const SizedBox(width: 16),
              ],
              Expanded(
                child: Text(
                  item.pullQuote ?? 'Essential intelligence recorded from physical press.',
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    fontStyle: FontStyle.italic,
                    fontWeight: FontWeight.w500,
                    color: const Color(0xFF27272A),
                    height: 1.35,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Container(height: 1, color: const Color(0xFFF4F4F5)),
          const SizedBox(height: 14),

          // Takeaways
          ...item.keyTakeaways.take(4).map((takeaway) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(top: 4, right: 8),
                      child: Container(
                        width: 4,
                        height: 4,
                        decoration: const BoxDecoration(
                          color: Color(0xFF2563EB),
                          shape: BoxShape.circle,
                        ),
                      ),
                    ),
                    Expanded(
                      child: Text(
                        takeaway,
                        style: GoogleFonts.inter(
                          fontSize: 11,
                          fontWeight: FontWeight.w400,
                          color: const Color(0xFF3F3F46),
                          height: 1.35,
                        ),
                      ),
                    ),
                  ],
                ),
              )),

          const SizedBox(height: 16),
          // Footer
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Source: ${item.publicationName ?? "Print Media"}',
                style: GoogleFonts.inter(
                  fontSize: 8.5,
                  color: const Color(0xFFA1A1AA),
                ),
              ),
              Text(
                item.creatorHandle ?? '@curator',
                style: GoogleFonts.inter(
                  fontSize: 8.5,
                  fontWeight: FontWeight.w700,
                  color: const Color(0xFF18181B),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
