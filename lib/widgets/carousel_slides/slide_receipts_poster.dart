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
        : 'PRIMARY SOURCE PRESS';
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
          color: const Color(0xFF080C14),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withValues(alpha: 0.12), width: 1.5),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.5),
              blurRadius: 22,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(15),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Top Header Bar
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.04),
                  border: Border(bottom: BorderSide(color: Colors.white.withValues(alpha: 0.08))),
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFFDC2626).withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(color: const Color(0xFFEF4444).withValues(alpha: 0.6)),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.verified_rounded, size: 12, color: Color(0xFFF87171)),
                          SizedBox(width: 4),
                          Text(
                            'THE "RECEIPT"',
                            style: TextStyle(
                              fontSize: 9.5,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFFF87171),
                              letterSpacing: 0.8,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        pubName,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF94A3B8),
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Text(
                        'SLIDE 03 / 03',
                        style: TextStyle(
                          fontSize: 9.5,
                          fontWeight: FontWeight.w800,
                          color: Colors.white70,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              // Middle: Dense Broadsheet Newspaper Evidence Dossier
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 8, 14, 8),
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      // Main Physical Broadsheet Paper Card (Fills entire available space!)
                      Container(
                        width: double.infinity,
                        height: double.infinity,
                        decoration: BoxDecoration(
                          color: const Color(0xFFF7F5EE), // Authentic aged newsprint paper
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: const Color(0xFFD6CEBE), width: 1.5),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.4),
                              blurRadius: 14,
                              offset: const Offset(0, 5),
                            ),
                          ],
                        ),
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              // 1. Newspaper Masthead Header
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  Container(height: 1.8, color: const Color(0xFF1E293B)),
                                  const SizedBox(height: 1.5),
                                  Container(height: 0.6, color: const Color(0xFF64748B)),
                                  const SizedBox(height: 4),
                                  Center(
                                    child: Text(
                                      pubName.toUpperCase(),
                                      style: const TextStyle(
                                        fontFamily: 'serif',
                                        fontSize: 16,
                                        fontWeight: FontWeight.w900,
                                        letterSpacing: 2.2,
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
                                        'VOL. CLXXIV • NO. 482',
                                        style: TextStyle(
                                          fontFamily: 'serif',
                                          fontSize: 7.5,
                                          fontWeight: FontWeight.bold,
                                          letterSpacing: 0.6,
                                          color: Colors.grey.shade700,
                                        ),
                                      ),
                                      Text(
                                        'ORIGINAL REPORTING ARCHIVE',
                                        style: TextStyle(
                                          fontFamily: 'serif',
                                          fontSize: 7.5,
                                          fontWeight: FontWeight.w800,
                                          letterSpacing: 0.8,
                                          color: Colors.grey.shade800,
                                        ),
                                      ),
                                      Text(
                                        'EVIDENCE CLIPPING',
                                        style: TextStyle(
                                          fontFamily: 'serif',
                                          fontSize: 7.5,
                                          fontWeight: FontWeight.bold,
                                          letterSpacing: 0.6,
                                          color: Colors.grey.shade700,
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 3),
                                  Container(height: 0.8, color: const Color(0xFF1E293B)),
                                ],
                              ),

                              const SizedBox(height: 6),

                              // 2. Headline & Wire Byline
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    headline,
                                    style: const TextStyle(
                                      fontFamily: 'serif',
                                      fontSize: 13.5,
                                      fontWeight: FontWeight.w900,
                                      color: Color(0xFF0F172A),
                                      height: 1.25,
                                    ),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  const SizedBox(height: 3),
                                  Text(
                                    'PRESS WIRE BUREAU • SPECIAL CORRESPONDENT • VERIFIED RECORD',
                                    style: TextStyle(
                                      fontFamily: 'serif',
                                      fontSize: 7.5,
                                      fontWeight: FontWeight.w700,
                                      letterSpacing: 0.5,
                                      color: Colors.grey.shade600,
                                    ),
                                  ),
                                  const SizedBox(height: 5),
                                  Container(height: 0.5, color: const Color(0xFFCBD5E1)),
                                ],
                              ),

                              const SizedBox(height: 4),

                              // 3. Broadsheet Body Content with Yellow Highlighter Focus
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.stretch,
                                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                                  children: [
                                    // Lead-in paragraph
                                    Text(
                                      leadText,
                                      style: TextStyle(
                                        fontFamily: 'serif',
                                        fontSize: 8.5,
                                        color: Colors.grey.shade800,
                                        height: 1.3,
                                      ),
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                    ),

                                    // The Vibrant Highlighter "Receipt" Box (The Smoking Gun)
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFFFEF08A), // Fluorescent Highlighter Yellow
                                        borderRadius: BorderRadius.circular(4),
                                        border: const Border(
                                          left: BorderSide(color: Color(0xFFCA8A04), width: 4), // Highlighter pen edge
                                          top: BorderSide(color: Color(0xFFFDE047)),
                                          right: BorderSide(color: Color(0xFFFDE047)),
                                          bottom: BorderSide(color: Color(0xFFFDE047)),
                                        ),
                                        boxShadow: [
                                          BoxShadow(
                                            color: const Color(0xFFEAB308).withValues(alpha: 0.35),
                                            blurRadius: 6,
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
                                              const Icon(Icons.border_color_rounded, size: 11, color: Color(0xFF854D0E)),
                                              const SizedBox(width: 4),
                                              Text(
                                                'PRIMARY VERBATIM EVIDENCE',
                                                style: TextStyle(
                                                  fontFamily: 'serif',
                                                  fontSize: 7.5,
                                                  fontWeight: FontWeight.w900,
                                                  letterSpacing: 0.8,
                                                  color: Colors.yellow.shade900,
                                                ),
                                              ),
                                            ],
                                          ),
                                          const SizedBox(height: 3),
                                          Text(
                                            '“$receiptQuote”',
                                            style: const TextStyle(
                                              fontFamily: 'serif',
                                              fontSize: 12,
                                              fontWeight: FontWeight.w800,
                                              color: Color(0xFF0F172A),
                                              height: 1.3,
                                            ),
                                            maxLines: 3,
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
                                              fontSize: 8,
                                              color: Colors.grey.shade800,
                                              height: 1.25,
                                            ),
                                            maxLines: 3,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ),
                                        const SizedBox(width: 10),
                                        Expanded(
                                          child: Text(
                                            corroboratingRight,
                                            style: TextStyle(
                                              fontFamily: 'serif',
                                              fontSize: 8,
                                              color: Colors.grey.shade800,
                                              height: 1.25,
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

                              const SizedBox(height: 4),

                              // 4. Broadsheet Archival Bottom Row
                              Column(
                                children: [
                                  Container(height: 0.6, color: const Color(0xFF94A3B8)),
                                  const SizedBox(height: 3),
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text(
                                        'COLLECTED ARCHIVE • CERTIFIED EXHIBIT',
                                        style: TextStyle(
                                          fontFamily: 'serif',
                                          fontSize: 7,
                                          fontWeight: FontWeight.w800,
                                          color: Colors.grey.shade700,
                                          letterSpacing: 0.5,
                                        ),
                                      ),
                                      Text(
                                        'EDITOUR ARCHIVE • PAGE 1 / C2',
                                        style: TextStyle(
                                          fontFamily: 'serif',
                                          fontSize: 7,
                                          fontWeight: FontWeight.w800,
                                          color: Colors.grey.shade700,
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
                      ),

                      // If physical camera photo exists, show a taped photographic evidence snap in corner
                      if (hasPhysicalPhoto)
                        Positioned(
                          bottom: 12,
                          right: 12,
                          child: Transform.rotate(
                            angle: 0.08,
                            child: Container(
                              width: 78,
                              height: 78,
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
                        top: 6,
                        right: 8,
                        child: Transform.rotate(
                          angle: -0.20, // Authentic tilted rubber stamp
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                            decoration: BoxDecoration(
                              border: Border.all(color: const Color(0xFFDC2626), width: 1.8),
                              borderRadius: BorderRadius.circular(5),
                              color: const Color(0xFFDC2626).withValues(alpha: 0.08),
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

              // Bottom Curation Seal & Handle
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.4),
                  border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.08))),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 22,
                          height: 22,
                          decoration: BoxDecoration(
                            color: config.primaryColor,
                            shape: BoxShape.circle,
                          ),
                          child: Center(
                            child: Text(
                              handle.replaceFirst('@', '').substring(0, 1).toUpperCase(),
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              handle,
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                              ),
                            ),
                            const Text(
                              'Primary Source Verification',
                              style: TextStyle(
                                fontSize: 8.5,
                                color: Color(0xFF94A3B8),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: const Text(
                        'editour.app',
                        style: TextStyle(
                          fontSize: 9.5,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF38BDF8),
                          letterSpacing: 0.5,
                        ),
                      ),
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
}
