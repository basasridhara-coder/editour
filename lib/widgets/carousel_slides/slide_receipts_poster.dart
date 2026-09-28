import 'dart:io';
import 'package:flutter/material.dart';
import '../../models/postcard_item.dart';
import '../../models/poster_style_config.dart';

class SlideReceiptsPoster extends StatelessWidget {
  final PostCardItem item;
  final PosterStyleConfig config;

  const SlideReceiptsPoster({
    super.key,
    required this.item,
    required this.config,
  });

  @override
  Widget build(BuildContext context) {
    final pubName = (item.publicationName != null && item.publicationName!.trim().isNotEmpty)
        ? item.publicationName!.trim()
        : 'THE FINANCIAL CHRONICLE';
    final handle = item.creatorHandle ?? '@curator';
    final headline = (item.originalHeadline != null && item.originalHeadline!.trim().isNotEmpty)
        ? item.originalHeadline!
        : item.adaptedHeadline;

    final receiptQuote = (item.receiptHighlightQuote != null && item.receiptHighlightQuote!.trim().isNotEmpty)
        ? item.receiptHighlightQuote!
        : ((item.pullQuote != null && item.pullQuote!.trim().isNotEmpty)
            ? item.pullQuote!
            : (item.keyTakeaways.isNotEmpty ? item.keyTakeaways.first : 'Verbatim evidentiary highlight from the source text.'));

    // Construct a single, cohesive, summarized broadsheet article that flows without gaps or collisions
    final leadText = item.hook.isNotEmpty
        ? item.hook
        : (item.summary.isNotEmpty
            ? item.summary
            : 'According to primary reporting and official correspondence released during the latest coverage cycle, analytical observers established direct confirmation of the recorded developments.');

    // Concluding summary synthesis (clean single paragraph that completes properly)
    final summaryConclusion = (item.whyItMatters != null && item.whyItMatters!.trim().isNotEmpty)
        ? item.whyItMatters!
        : (item.summary.isNotEmpty && item.summary != leadText
            ? item.summary
            : (item.keyTakeaways.isNotEmpty
                ? item.keyTakeaways.join(' ')
                : 'Observers emphasized that documented structural impacts were corroborated across primary administrative channels, establishing a decisive historical baseline.'));

    final hasPhysicalPhoto = item.originalPhotoPath.isNotEmpty &&
        !item.originalPhotoPath.startsWith('http') &&
        item.originalPhotoPath != 'digital_article_link' &&
        File(item.originalPhotoPath).existsSync();

    // Responsive font sizes to ensure complete statements and elegant newspaper layout
    final double headlineSize = headline.length > 70
        ? 15.0
        : (headline.length > 45 ? 16.5 : 18.0);

    final double leadFontSize = leadText.length > 150 ? 10.5 : 11.5;
    final double quoteFontSize = receiptQuote.length > 180 ? 11.5 : (receiptQuote.length > 110 ? 12.5 : 13.5);
    final double conclusionFontSize = summaryConclusion.length > 180 ? 10.0 : 11.0;

    return AspectRatio(
      aspectRatio: 4 / 5,
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFFF7F5EE), // Authentic vintage newsprint broadsheet paper
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFD6CEBE), width: 2),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.5),
              blurRadius: 22,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: Stack(
            fit: StackFit.expand,
            children: [
              // Main Broadsheet Newspaper Article (Continuous Story Flow with ZERO Gaps & NO Overlap)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // 1. Classic Broadsheet Masthead Header
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Container(height: 2.2, color: const Color(0xFF0F172A)),
                        const SizedBox(height: 2),
                        Container(height: 0.7, color: const Color(0xFF475569)),
                        const SizedBox(height: 5),
                        Center(
                          child: Text(
                            pubName.toUpperCase(),
                            style: const TextStyle(
                              fontFamily: 'serif',
                              fontSize: 19,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 2.5,
                              color: Color(0xFF0F172A),
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'VOL. CLXXIV • NO. 48,210',
                              style: TextStyle(
                                fontFamily: 'serif',
                                fontSize: 7.5,
                                fontWeight: FontWeight.bold,
                                letterSpacing: 0.6,
                                color: Colors.grey.shade800,
                              ),
                            ),
                            Text(
                              'PRIMARY SOURCE DOSSIER',
                              style: TextStyle(
                                fontFamily: 'serif',
                                fontSize: 7.5,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 1.0,
                                color: Colors.grey.shade900,
                              ),
                            ),
                            Text(
                              'SLIDE 03 / 03',
                              style: TextStyle(
                                fontFamily: 'serif',
                                fontSize: 7.5,
                                fontWeight: FontWeight.bold,
                                letterSpacing: 0.6,
                                color: Colors.grey.shade800,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Container(height: 1.2, color: const Color(0xFF0F172A)),
                      ],
                    ),

                    const SizedBox(height: 7),

                    // 2. Original Article Headline & Wire Byline (Complete, Bold Headline)
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          headline,
                          style: TextStyle(
                            fontFamily: 'serif',
                            fontSize: headlineSize,
                            fontWeight: FontWeight.w900,
                            color: const Color(0xFF0F172A),
                            height: 1.2,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Row(
                          children: [
                            Text(
                              'BY SPECIAL CORRESPONDENT & WIRE BUREAU',
                              style: TextStyle(
                                fontFamily: 'serif',
                                fontSize: 7.5,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.5,
                                color: Colors.grey.shade700,
                              ),
                            ),
                            const Spacer(),
                            Text(
                              'VERIFIED ARCHIVE',
                              style: TextStyle(
                                fontFamily: 'serif',
                                fontSize: 7.5,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.5,
                                color: Colors.red.shade900,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 5),
                        Container(height: 0.6, color: const Color(0xFF94A3B8)),
                      ],
                    ),

                    const SizedBox(height: 8),

                    // 3. The Continuous Summarized Newspaper Article (Zero Empty Spaces & Zero Overlap!)
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: [
                          // Lead Paragraph of the Story (Full statement, completed thought)
                          Text(
                            leadText,
                            style: TextStyle(
                              fontFamily: 'serif',
                              fontSize: leadFontSize,
                              color: const Color(0xFF1E293B),
                              height: 1.38,
                            ),
                          ),

                          // The Yellow Highlighter "Receipt" Box (The Core In-Line Evidence)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
                            decoration: BoxDecoration(
                              color: const Color(0xFFFEF08A), // Vibrant Canary Yellow Highlighter
                              borderRadius: BorderRadius.circular(4),
                              border: const Border(
                                left: BorderSide(color: Color(0xFFCA8A04), width: 5), // Marker pen edge
                                top: BorderSide(color: Color(0xFFFDE047)),
                                right: BorderSide(color: Color(0xFFFDE047)),
                                bottom: BorderSide(color: Color(0xFFFDE047)),
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: const Color(0xFFEAB308).withValues(alpha: 0.35),
                                  blurRadius: 8,
                                  offset: const Offset(0, 2),
                                ),
                              ],
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Row(
                                  children: [
                                    const Icon(Icons.border_color_rounded, size: 12, color: Color(0xFF854D0E)),
                                    const SizedBox(width: 5),
                                    Text(
                                      'PRIMARY VERBATIM EVIDENCE',
                                      style: TextStyle(
                                        fontFamily: 'serif',
                                        fontSize: 8,
                                        fontWeight: FontWeight.w900,
                                        letterSpacing: 0.9,
                                        color: Colors.yellow.shade900,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  '“$receiptQuote”',
                                  style: TextStyle(
                                    fontFamily: 'serif',
                                    fontSize: quoteFontSize,
                                    fontWeight: FontWeight.w900,
                                    color: const Color(0xFF0F172A),
                                    height: 1.32,
                                  ),
                                ),
                              ],
                            ),
                          ),

                          // Concluding Summary & Impact Paragraph (Complete, flows naturally, NO overlap!)
                          Text(
                            summaryConclusion,
                            style: TextStyle(
                              fontFamily: 'serif',
                              fontSize: conclusionFontSize,
                              color: const Color(0xFF334155),
                              height: 1.36,
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 6),

                    // 4. Broadsheet Archival Bottom Folio (Cleanly separated from article text!)
                    Column(
                      children: [
                        Container(height: 0.8, color: const Color(0xFF0F172A)),
                        const SizedBox(height: 3),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'COLLECTED ARCHIVE • CERTIFIED EXHIBIT',
                              style: TextStyle(
                                fontFamily: 'serif',
                                fontSize: 7.5,
                                fontWeight: FontWeight.w800,
                                color: Colors.grey.shade800,
                                letterSpacing: 0.5,
                              ),
                            ),
                            Text(
                              'CURATED BY $handle • EDITOUR.APP',
                              style: TextStyle(
                                fontFamily: 'serif',
                                fontSize: 7.5,
                                fontWeight: FontWeight.w800,
                                color: Colors.grey.shade800,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              // Photographic Paper Snap (if physical photo exists)
              if (hasPhysicalPhoto)
                Positioned(
                  bottom: 22,
                  right: 16,
                  child: Transform.rotate(
                    angle: 0.08,
                    child: Container(
                      width: 76,
                      height: 76,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(4),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.45),
                            blurRadius: 8,
                            offset: const Offset(2, 4),
                          ),
                        ],
                        border: Border.all(color: Colors.white, width: 3),
                      ),
                      child: Image.file(
                        File(item.originalPhotoPath),
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) => const SizedBox.shrink(),
                      ),
                    ),
                  ),
                ),

              // Forensic "VERIFIED PRESS EVIDENCE" Weathered Red Rubber Stamp
              Positioned(
                top: 8,
                right: 12,
                child: Transform.rotate(
                  angle: -0.18, // Tilted authentic rubber stamp
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                    decoration: BoxDecoration(
                      border: Border.all(color: const Color(0xFFDC2626), width: 1.8),
                      borderRadius: BorderRadius.circular(5),
                      color: const Color(0xFFDC2626).withValues(alpha: 0.07),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text(
                          '★ VERIFIED ★',
                          style: TextStyle(
                            fontSize: 6.5,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.0,
                            color: Color(0xFFDC2626),
                          ),
                        ),
                        Text(
                          'PRESS EVIDENCE',
                          style: TextStyle(
                            fontSize: 8,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 0.8,
                            color: const Color(0xFFDC2626).withValues(alpha: 0.95),
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
}
