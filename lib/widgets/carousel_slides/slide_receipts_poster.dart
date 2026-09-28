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

    final leadText = item.hook.isNotEmpty
        ? item.hook
        : 'According to primary reporting and official correspondence released during the latest coverage cycle, analytical observers established direct confirmation of the recorded developments.';

    final corroboratingLeft = (item.whyItMatters != null && item.whyItMatters!.trim().isNotEmpty)
        ? item.whyItMatters!
        : (item.keyTakeaways.isNotEmpty
            ? item.keyTakeaways.first
            : 'Observers emphasized that documented structural impacts were corroborated across primary administrative channels.');

    final corroboratingRight = item.keyTakeaways.length > 1
        ? item.keyTakeaways[1]
        : (item.keyMetric != null && item.keyMetric!.isNotEmpty
            ? 'Official records validated a signal metric of ${item.keyMetric}, confirming persistent trendlines diverging from initial forecasts.'
            : 'Subsequent disclosures maintained that recorded indicators diverged sharply from initial forecasts, establishing a decisive historical baseline.');

    final hasPhysicalPhoto = item.originalPhotoPath.isNotEmpty &&
        !item.originalPhotoPath.startsWith('http') &&
        item.originalPhotoPath != 'digital_article_link' &&
        File(item.originalPhotoPath).existsSync();

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
              // Main Broadsheet Newspaper Content (Fills the entire 4:5 Poster!)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    // 1. Classic Broadsheet Masthead Header
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Container(height: 2.2, color: const Color(0xFF0F172A)),
                        const SizedBox(height: 2),
                        Container(height: 0.7, color: const Color(0xFF475569)),
                        const SizedBox(height: 6),
                        Center(
                          child: Text(
                            pubName.toUpperCase(),
                            style: const TextStyle(
                              fontFamily: 'serif',
                              fontSize: 20,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 2.5,
                              color: Color(0xFF0F172A),
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(height: 4),
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

                    const SizedBox(height: 8),

                    // 2. Original Article Headline & Wire Byline
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          headline,
                          style: const TextStyle(
                            fontFamily: 'serif',
                            fontSize: 16,
                            fontWeight: FontWeight.w900,
                            color: Color(0xFF0F172A),
                            height: 1.22,
                          ),
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
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
                        const SizedBox(height: 6),
                        Container(height: 0.6, color: const Color(0xFF94A3B8)),
                      ],
                    ),

                    const SizedBox(height: 6),

                    // 3. Broadsheet Columns with Yellow Highlighter Focus
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: [
                          // Lead-in news reporting text
                          Text(
                            leadText,
                            style: TextStyle(
                              fontFamily: 'serif',
                              fontSize: 9.5,
                              color: Colors.grey.shade800,
                              height: 1.35,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),

                          // The Vibrant Yellow Highlighter "Receipt" Box (The Smoking Gun Evidence)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                            decoration: BoxDecoration(
                              color: const Color(0xFFFEF08A), // Vibrant Canary Yellow Highlighter
                              borderRadius: BorderRadius.circular(4),
                              border: const Border(
                                left: BorderSide(color: Color(0xFFCA8A04), width: 5), // Marker edge
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
                                const SizedBox(height: 4),
                                Text(
                                  '“$receiptQuote”',
                                  style: const TextStyle(
                                    fontFamily: 'serif',
                                    fontSize: 13.5,
                                    fontWeight: FontWeight.w900,
                                    color: Color(0xFF0F172A),
                                    height: 1.35,
                                  ),
                                  maxLines: 4,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),

                          // Corroborating Evidence Columns
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: Text(
                                  corroboratingLeft,
                                  style: TextStyle(
                                    fontFamily: 'serif',
                                    fontSize: 8.5,
                                    color: Colors.grey.shade800,
                                    height: 1.3,
                                  ),
                                  maxLines: 3,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(
                                  corroboratingRight,
                                  style: TextStyle(
                                    fontFamily: 'serif',
                                    fontSize: 8.5,
                                    color: Colors.grey.shade800,
                                    height: 1.3,
                                  ),
                                  maxLines: 3,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 6),

                    // 4. Broadsheet Archival Bottom Folio
                    Column(
                      children: [
                        Container(height: 0.8, color: const Color(0xFF0F172A)),
                        const SizedBox(height: 4),
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
                  bottom: 24,
                  right: 18,
                  child: Transform.rotate(
                    angle: 0.08,
                    child: Container(
                      width: 82,
                      height: 82,
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
                top: 10,
                right: 14,
                child: Transform.rotate(
                  angle: -0.18, // Tilted authentic rubber stamp
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      border: Border.all(color: const Color(0xFFDC2626), width: 2),
                      borderRadius: BorderRadius.circular(6),
                      color: const Color(0xFFDC2626).withValues(alpha: 0.07),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text(
                          '★ VERIFIED ★',
                          style: TextStyle(
                            fontSize: 7,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.0,
                            color: Color(0xFFDC2626),
                          ),
                        ),
                        Text(
                          'PRESS EVIDENCE',
                          style: TextStyle(
                            fontSize: 8.5,
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
