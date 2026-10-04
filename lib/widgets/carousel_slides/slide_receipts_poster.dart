import 'dart:io';
import 'package:flutter/material.dart';
import '../../models/postcard_item.dart';
import '../../models/poster_style_config.dart';

class SlideReceiptsPoster extends StatelessWidget {
  final PostCardItem item;
  final PosterStyleConfig config;
  final BorderRadius? borderRadius;

  const SlideReceiptsPoster({
    super.key,
    required this.item,
    required this.config,
    this.borderRadius,
  });

  static String _ensureCleanEnding(String text) {
    String clean = text.trim();
    if (clean.isEmpty) return clean;
    while (clean.endsWith('...') || clean.endsWith('…') || clean.endsWith('.')) {
      if (clean.endsWith('...')) {
        clean = clean.substring(0, clean.length - 3).trim();
      } else if (clean.endsWith('…')) {
        clean = clean.substring(0, clean.length - 1).trim();
      } else if (clean.endsWith('.')) {
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

  static String _ensureCleanHeadline(String text) {
    String clean = text.trim();
    while (clean.endsWith('...') || clean.endsWith('…')) {
      if (clean.endsWith('...')) {
        clean = clean.substring(0, clean.length - 3).trim();
      } else if (clean.endsWith('…')) {
        clean = clean.substring(0, clean.length - 1).trim();
      } else {
        break;
      }
    }
    return clean;
  }

  @override
  Widget build(BuildContext context) {
    final pubName = (item.publicationName != null && item.publicationName!.trim().isNotEmpty)
        ? item.publicationName!.trim()
        : 'THE FINANCIAL CHRONICLE';
    final handle = item.creatorHandle ?? '@curator';
    final rawHeadline = (item.originalHeadline != null && item.originalHeadline!.trim().isNotEmpty)
        ? item.originalHeadline!
        : item.adaptedHeadline;
    final headline = _ensureCleanHeadline(rawHeadline);

    final List<String> excerpts = item.resolvedArticleExcerpts;

    // Guarantee 3 authentic broadsheet excerpt paragraphs for dense newspaper layout
    final String p1 = _ensureCleanEnding(excerpts.isNotEmpty
        ? excerpts[0]
        : (item.receiptHighlightQuote ??
            'Primary reporting confirmed that recorded structural indicators diverged sharply from initial forecasts across core operations.'));

    final String p2 = _ensureCleanEnding(excerpts.length > 1
        ? excerpts[1]
        : (item.receiptHighlightQuote != null && item.receiptHighlightQuote != p1
            ? item.receiptHighlightQuote!
            : ((item.pullQuote != null && item.pullQuote != p1)
                ? item.pullQuote!
                : 'Official records corroborated the recorded developments across primary administrative and field channels.')));

    final String p3 = _ensureCleanEnding(excerpts.length >= 3
        ? excerpts[2]
        : (item.summary.isNotEmpty && item.summary != p1 && item.summary != p2
            ? item.summary
            : 'Detailed analysis across verified reporting channels confirmed the ongoing broader strategic implications.'));

    final hasPhysicalPhoto = item.originalPhotoPath.isNotEmpty &&
        !item.originalPhotoPath.startsWith('http') &&
        item.originalPhotoPath != 'digital_article_link' &&
        File(item.originalPhotoPath).existsSync();

    String cleanHost = '';
    if (item.digitalLink != null && item.digitalLink!.isNotEmpty) {
      try {
        final uri = Uri.parse(item.digitalLink!);
        cleanHost = uri.host.replaceFirst(RegExp(r'^www\.'), '');
      } catch (_) {}
    }

    final String mastheadTitle;
    final String rulesLeft;
    final String rulesCenter;
    final String bylineLeft;
    final String bylineTag;
    final Color bylineTagColor;
    final String highlightTitle;
    final IconData highlightIcon;
    final String folioSource;
    final String folioAuthor;
    final Widget rubberStamp;

    if (item.isVerifiedPress) {
      mastheadTitle = pubName.toUpperCase();
      rulesLeft = 'VOL. CLXXIV • NO. 48,210';
      rulesCenter = 'ACTUAL NEWSPAPER EXCERPTS';
      bylineLeft = 'BY SPECIAL CORRESPONDENT & WIRE BUREAU';
      bylineTag = 'VERIFIED ARCHIVE';
      bylineTagColor = const Color(0xFFB91C1C);
      highlightTitle = 'KEY SECTION EXCERPT';
      highlightIcon = Icons.border_color_rounded;
      folioSource = 'AUTHENTIC ARTICLE EXCERPTS • PRIMARY SOURCE';
      folioAuthor = 'ARCHIVED BY $handle';
      rubberStamp = Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
        decoration: BoxDecoration(
          border: Border.all(color: const Color(0xFFDC2626), width: 1.8),
          borderRadius: BorderRadius.circular(5),
          color: const Color(0xFFDC2626).withValues(alpha: 0.07),
        ),
        child: const Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '★ VERIFIED ★',
              style: TextStyle(
                fontSize: 6.5,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.0,
                color: Color(0xFFDC2626),
              ),
            ),
            Text(
              'PRESS ARCHIVE',
              style: TextStyle(
                fontSize: 8,
                fontWeight: FontWeight.w900,
                letterSpacing: 0.8,
                color: Color(0xFFDC2626),
              ),
            ),
          ],
        ),
      );
    } else if (item.isMySlant) {
      final slantIcon = item.resolvedSlantIcon;
      mastheadTitle = "READER'S OP-ED";
      rulesLeft = 'FIRST-PERSON PERSPECTIVE';
      rulesCenter = 'COMMUNITY OP-ED & ESSAY';
      bylineLeft = 'CONTRIBUTED BY $handle';
      bylineTag = 'PERSONAL SLANT';
      bylineTagColor = const Color(0xFF7C3AED);
      highlightTitle = 'THE CORE CONVICTION';
      highlightIcon = slantIcon == '❤️' ? Icons.favorite_rounded : Icons.psychology_rounded;
      folioSource = 'FIRST-PERSON REFLECTION • UNVERIFIED OPINION';
      folioAuthor = 'BY $handle';
      rubberStamp = Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
        decoration: BoxDecoration(
          border: Border.all(color: const Color(0xFF7C3AED), width: 1.8),
          borderRadius: BorderRadius.circular(5),
          color: const Color(0xFF7C3AED).withValues(alpha: 0.07),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '$slantIcon OPINION',
              style: const TextStyle(
                fontSize: 6.5,
                fontWeight: FontWeight.w900,
                letterSpacing: 0.8,
                color: Color(0xFF7C3AED),
              ),
            ),
            const Text(
              'MY SLANT',
              style: TextStyle(
                fontSize: 8,
                fontWeight: FontWeight.w900,
                letterSpacing: 0.8,
                color: Color(0xFF7C3AED),
              ),
            ),
          ],
        ),
      );
    } else if (item.isBookExcerpt) {
      final bookTitle = (item.bookTitle != null && item.bookTitle!.trim().isNotEmpty)
          ? item.bookTitle!.trim().toUpperCase()
          : 'CLASSIC LITERATURE ARCHIVE';
      final author = (item.bookAuthor != null && item.bookAuthor!.trim().isNotEmpty)
          ? item.bookAuthor!.trim().toUpperCase()
          : 'CANONICAL AUTHOR';
      mastheadTitle = bookTitle;
      rulesLeft = 'CANONICAL FOLIO';
      rulesCenter = 'LITERARY EXCERPT';
      bylineLeft = 'WRITTEN BY $author';
      bylineTag = 'BOOK EXCERPT';
      bylineTagColor = const Color(0xFF0F766E);
      highlightTitle = 'CORE PASSAGE';
      highlightIcon = Icons.auto_stories_rounded;
      folioSource = 'LITERARY EXCERPT • CLASSICAL ARCHIVE';
      folioAuthor = 'EXCERPTED BY $handle';
      rubberStamp = Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
        decoration: BoxDecoration(
          border: Border.all(color: const Color(0xFF0F766E), width: 1.8),
          borderRadius: BorderRadius.circular(5),
          color: const Color(0xFF0F766E).withValues(alpha: 0.07),
        ),
        child: const Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '📖 LITERARY',
              style: TextStyle(
                fontSize: 6.5,
                fontWeight: FontWeight.w900,
                letterSpacing: 0.8,
                color: Color(0xFF0F766E),
              ),
            ),
            Text(
              'EXCERPT',
              style: TextStyle(
                fontSize: 8,
                fontWeight: FontWeight.w900,
                letterSpacing: 0.8,
                color: Color(0xFF0F766E),
              ),
            ),
          ],
        ),
      );
    } else {
      final hostDisplay = cleanHost.isNotEmpty ? cleanHost.toUpperCase() : 'ONLINE PUBLICATION';
      mastheadTitle = cleanHost.isNotEmpty ? '$hostDisplay • WEB COMMENTARY' : 'WEB COMMENTARY';
      rulesLeft = 'ONLINE CITATION';
      rulesCenter = 'WEB COMMENTARY & CITATION';
      bylineLeft = 'SOURCED FROM $hostDisplay';
      bylineTag = 'WEB COMMENTARY';
      bylineTagColor = const Color(0xFF475569);
      highlightTitle = 'KEY ARTICLE EXCERPT';
      highlightIcon = Icons.public_rounded;
      folioSource = 'DIGITAL COMMENTARY CITATION • EXTERNAL LINK';
      folioAuthor = 'CURATED BY $handle';
      rubberStamp = Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
        decoration: BoxDecoration(
          border: Border.all(color: const Color(0xFF475569), width: 1.8),
          borderRadius: BorderRadius.circular(5),
          color: const Color(0xFF475569).withValues(alpha: 0.07),
        ),
        child: const Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '🌐 WEB SOURCE',
              style: TextStyle(
                fontSize: 6.5,
                fontWeight: FontWeight.w900,
                letterSpacing: 0.8,
                color: Color(0xFF475569),
              ),
            ),
            Text(
              'WEB COMMENTARY',
              style: TextStyle(
                fontSize: 8,
                fontWeight: FontWeight.w900,
                letterSpacing: 0.8,
                color: Color(0xFF475569),
              ),
            ),
          ],
        ),
      );
    }

    // Responsive font sizes to ensure complete statements and elegant newspaper layout
    final double headlineSize = headline.length > 70
        ? 15.0
        : (headline.length > 45 ? 16.5 : 18.0);

    final double p1FontSize = p1.length > 200 ? 9.0 : (p1.length > 140 ? 9.8 : (p1.length > 90 ? 10.6 : 11.2));
    final int p1MaxLines = p1.length > 180 ? 6 : (p1.length > 120 ? 5 : 4);

    final double p2FontSize = p2.length > 160 ? 9.4 : (p2.length > 110 ? 10.2 : (p2.length > 70 ? 11.0 : 11.8));
    final int p2MaxLines = p2.length > 150 ? 6 : (p2.length > 90 ? 5 : 4);

    final double p3FontSize = p3.length > 200 ? 8.8 : (p3.length > 140 ? 9.6 : (p3.length > 90 ? 10.2 : 10.8));
    final int p3MaxLines = p3.length > 180 ? 6 : (p3.length > 120 ? 5 : 4);

    final effectiveRadius = borderRadius ?? BorderRadius.circular(16);
    final isFlush = borderRadius == BorderRadius.zero;

    return AspectRatio(
      aspectRatio: 4 / 5,
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFFF7F5EE), // Authentic vintage newsprint broadsheet paper
          borderRadius: effectiveRadius,
          border: isFlush
              ? Border.symmetric(
                  horizontal: BorderSide(
                    color: const Color(0xFFD6CEBE),
                    width: 1.2,
                  ),
                )
              : Border.all(color: const Color(0xFFD6CEBE), width: 2),
          boxShadow: isFlush
              ? null
              : [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.5),
                    blurRadius: 22,
                    offset: const Offset(0, 10),
                  ),
                ],
        ),
        child: ClipRRect(
          borderRadius: isFlush ? BorderRadius.zero : BorderRadius.circular(14),
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
                            mastheadTitle,
                            style: const TextStyle(
                              fontFamily: 'serif',
                              fontSize: 18,
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
                            Flexible(
                              child: Text(
                                rulesLeft,
                                style: TextStyle(
                                  fontFamily: 'serif',
                                  fontSize: 7.2,
                                  fontWeight: FontWeight.bold,
                                  letterSpacing: 0.5,
                                  color: Colors.grey.shade800,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            const SizedBox(width: 4),
                            Flexible(
                              child: Text(
                                rulesCenter,
                                style: TextStyle(
                                  fontFamily: 'serif',
                                  fontSize: 7.2,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: 0.8,
                                  color: Colors.grey.shade900,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            const SizedBox(width: 4),
                            Text(
                              'SLIDE 03 / 03',
                              style: TextStyle(
                                fontFamily: 'serif',
                                fontSize: 7.2,
                                fontWeight: FontWeight.bold,
                                letterSpacing: 0.5,
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
                              bylineLeft,
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
                              bylineTag,
                              style: TextStyle(
                                fontFamily: 'serif',
                                fontSize: 7.5,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.5,
                                color: bylineTagColor,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 5),
                        Container(height: 0.6, color: const Color(0xFF94A3B8)),
                      ],
                    ),

                    const SizedBox(height: 8),

                    // 3. The Continuous Actual Newspaper Excerpts (2 to 3 pure section statements, ZERO curator voice!)
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Spacer(flex: 1),

                          // Paragraph 1: First authentic section excerpt from the newspaper
                          Text(
                            p1,
                            style: TextStyle(
                              fontFamily: 'serif',
                              fontSize: p1FontSize,
                              color: const Color(0xFF1E293B),
                              height: 1.34,
                            ),
                            maxLines: p1MaxLines,
                            overflow: TextOverflow.ellipsis,
                          ),

                          const Spacer(flex: 2),

                          // Paragraph 2: Core highlighted section excerpt inside the broadsheet highlighter
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
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
                                    Icon(highlightIcon, size: 12, color: const Color(0xFF854D0E)),
                                    const SizedBox(width: 5),
                                    Text(
                                      highlightTitle,
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
                                  '“$p2”',
                                  style: TextStyle(
                                    fontFamily: 'serif',
                                    fontSize: p2FontSize,
                                    fontWeight: FontWeight.w900,
                                    color: const Color(0xFF0F172A),
                                    height: 1.30,
                                  ),
                                  maxLines: p2MaxLines,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),

                          const Spacer(flex: 2),

                          // Paragraph 3: Corroborating section excerpt from the newspaper
                          Text(
                            p3,
                            style: TextStyle(
                              fontFamily: 'serif',
                              fontSize: p3FontSize,
                              color: const Color(0xFF334155),
                              height: 1.34,
                            ),
                            maxLines: p3MaxLines,
                            overflow: TextOverflow.ellipsis,
                          ),

                          const Spacer(flex: 1),
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
                            Expanded(
                              child: Text(
                                folioSource,
                                style: TextStyle(
                                  fontFamily: 'serif',
                                  fontSize: 7.2,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.grey.shade800,
                                  letterSpacing: 0.4,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              folioAuthor,
                              style: TextStyle(
                                fontFamily: 'serif',
                                fontSize: 7.2,
                                fontWeight: FontWeight.w800,
                                color: Colors.grey.shade800,
                                letterSpacing: 0.4,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
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

              // Forensic Weathered Rubber Stamp
              Positioned(
                top: 8,
                right: 12,
                child: Transform.rotate(
                  angle: -0.18, // Tilted authentic rubber stamp
                  child: rubberStamp,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
