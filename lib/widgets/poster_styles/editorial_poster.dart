import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../models/postcard_item.dart';
import '../../models/poster_style_config.dart';
import '../artistic_poster_visual.dart';
import '../book_cover_viewer_dialog.dart';

class EditorialPoster extends StatelessWidget {
  final PostCardItem item;
  final PosterStyleConfig config;

  const EditorialPoster({
    super.key,
    required this.item,
    required this.config,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: config.backgroundColor,
        border: Border.all(color: const Color(0xFFD6CEBE), width: 1.5),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 16,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 26),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Top Masthead Bar
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  item.isBookExcerpt ? 'THE CURATED READING' : 'THE POSTCARD CHRONICLE',
                  style: GoogleFonts.cinzel(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 2.2,
                    color: config.primaryColor,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: config.secondaryColor,
                  borderRadius: BorderRadius.circular(2),
                ),
                child: Text(
                  item.categoryBadge.toUpperCase(),
                  style: GoogleFonts.montserrat(
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.2,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          // Sub bar with source and audience (or Book citation + clickable book icon)
          Row(
            children: [
              Expanded(
                child: Text(
                  item.isBookExcerpt
                      ? 'BOOK: ${(item.bookTitle ?? item.publicationName ?? "LITERARY READING").toUpperCase()} • BY ${(item.bookAuthor ?? "AUTHOR").toUpperCase()}'
                      : 'SOURCE: ${item.publicationName ?? "PHYSICAL PRESS"} • AUDIENCE: ${item.targetAudience.toUpperCase()}',
                  style: GoogleFonts.merriweather(
                    fontSize: 8.5,
                    fontStyle: FontStyle.italic,
                    color: Colors.black54,
                    letterSpacing: 0.5,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (item.isBookExcerpt) ...[
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: () => BookCoverViewerDialog.show(context, item: item),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                    decoration: BoxDecoration(
                      color: config.accentColor.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(color: config.accentColor.withValues(alpha: 0.5)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.auto_stories, size: 11, color: config.primaryColor),
                        const SizedBox(width: 4),
                        Text(
                          '📖 COVER',
                          style: GoogleFonts.montserrat(
                            fontSize: 8,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.8,
                            color: config.primaryColor,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 8),
          // Decorative Double Rule
          Container(height: 2, color: config.primaryColor),
          const SizedBox(height: 2),
          Container(height: 0.8, color: config.primaryColor.withValues(alpha: 0.4)),
          const SizedBox(height: 16),

          // Visual Poster Artwork / Illustration Header
          _buildPosterArtworkHeader(),
          const SizedBox(height: 16),

          // Main Headline
          Text(
            item.adaptedHeadline,
            style: GoogleFonts.playfairDisplay(
              fontSize: 22,
              fontWeight: FontWeight.w900,
              height: 1.2,
              color: config.textColor,
            ),
          ),
          const SizedBox(height: 10),

          // Hook
          Text(
            item.hook,
            style: GoogleFonts.merriweather(
              fontSize: 12.5,
              height: 1.45,
              fontWeight: FontWeight.w400,
              color: const Color(0xFF4A4A52),
            ),
          ),
          const SizedBox(height: 16),

          // "Why It Matters" Audience Callout Box
          if (item.whyItMatters != null && item.whyItMatters!.isNotEmpty) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: config.secondaryColor.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(4),
                border: Border(
                  left: BorderSide(color: config.secondaryColor, width: 3),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.bolt, size: 14, color: config.secondaryColor),
                      const SizedBox(width: 4),
                      Text(
                        'WHY THIS MATTERS TO ${item.targetAudience.toUpperCase()}',
                        style: GoogleFonts.montserrat(
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.0,
                          color: config.secondaryColor,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    item.whyItMatters!,
                    style: GoogleFonts.merriweather(
                      fontSize: 11,
                      height: 1.35,
                      color: config.textColor,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],

          // Pull Quote Box
          if (item.pullQuote != null && item.pullQuote!.isNotEmpty) ...[
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFFF2ECE1),
                border: Border(
                  left: BorderSide(color: config.secondaryColor, width: 3.5),
                ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '“',
                    style: GoogleFonts.playfairDisplay(
                      fontSize: 32,
                      height: 0.8,
                      color: config.secondaryColor,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      item.pullQuote!,
                      style: GoogleFonts.merriweather(
                        fontSize: 11.5,
                        fontStyle: FontStyle.italic,
                        fontWeight: FontWeight.w600,
                        color: config.textColor,
                        height: 1.35,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],

          // Key Metric Banner
          if (item.keyMetric != null && item.keyMetric!.isNotEmpty) ...[
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: config.primaryColor,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    item.keyMetric!,
                    style: GoogleFonts.montserrat(
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Key highlighted metric from physical reporting',
                    style: GoogleFonts.merriweather(
                      fontSize: 9.5,
                      color: Colors.black54,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
          ],

          // Key Takeaways Section
          Text(
            'ESSENTIAL TAKEAWAYS',
            style: GoogleFonts.cinzel(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.5,
              color: config.secondaryColor,
            ),
          ),
          const SizedBox(height: 8),
          ...item.keyTakeaways.take(4).map((takeaway) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '◆ ',
                      style: TextStyle(
                        fontSize: 9,
                        color: config.secondaryColor,
                        height: 1.4,
                      ),
                    ),
                    Expanded(
                      child: Text(
                        takeaway,
                        style: GoogleFonts.merriweather(
                          fontSize: 10.5,
                          height: 1.35,
                          color: config.textColor,
                        ),
                      ),
                    ),
                  ],
                ),
              )),

          // Curator Verdict / Opinion callout
          if (item.creatorOpinion != null && item.creatorOpinion!.isNotEmpty) ...[
            Container(
              margin: const EdgeInsets.only(top: 8),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(4),
                border: const Border(
                  left: BorderSide(color: Color(0xFF0F172A), width: 3),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.verified_user_outlined, size: 11, color: Color(0xFF0F172A)),
                      const SizedBox(width: 5),
                      Text(
                        'CURATOR VERDICT // ${item.creatorHandle?.toUpperCase() ?? "@CURATOR"}',
                        style: GoogleFonts.cinzel(
                          fontSize: 8.5,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.0,
                          color: const Color(0xFF0F172A),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text(
                    '“${item.creatorOpinion}”',
                    style: GoogleFonts.merriweather(
                      fontSize: 10,
                      fontStyle: FontStyle.italic,
                      height: 1.35,
                      color: const Color(0xFF1E293B),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
          ],

          const SizedBox(height: 16),
          // Bottom Rule
          Container(height: 0.8, color: config.primaryColor.withValues(alpha: 0.4)),
          const SizedBox(height: 10),

          // Footer Byline
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  item.isBookExcerpt
                      ? 'BOOK READING • ${item.curatorAngle != null && item.curatorAngle!.isNotEmpty ? "CURATOR ANGLE: ${item.curatorAngle!.toUpperCase()}" : "CURATED EDITION"}'
                      : 'PHYSICAL PRINT ARCHIVE',
                  style: GoogleFonts.cinzel(
                    fontSize: 8.5,
                    letterSpacing: 1.2,
                    color: Colors.black45,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'CURATED BY ${item.creatorHandle?.toUpperCase() ?? "@CURATOR"}',
                style: GoogleFonts.montserrat(
                  fontSize: 8.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.8,
                  color: config.primaryColor,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildPosterArtworkHeader() {
    final double artHeight = 110.0 + (item.visualArtRatio.clamp(0.2, 0.9) * 160.0);
    return ArtisticPosterVisual(
      item: item,
      config: config,
      height: artHeight,
    );
  }
}
