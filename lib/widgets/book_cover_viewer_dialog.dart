import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../models/postcard_item.dart';

class BookCoverViewerDialog extends StatefulWidget {
  final PostCardItem? item;
  final String? coverPhotoPath;
  final Uint8List? coverBytes;
  final String? bookTitle;
  final String? bookAuthor;
  final String? curatorAngle;
  final List<String> excerptPhotoPaths;
  final List<Uint8List> excerptBytesList;

  const BookCoverViewerDialog({
    super.key,
    this.item,
    this.coverPhotoPath,
    this.coverBytes,
    this.bookTitle,
    this.bookAuthor,
    this.curatorAngle,
    this.excerptPhotoPaths = const [],
    this.excerptBytesList = const [],
  });

  static void show(
    BuildContext context, {
    PostCardItem? item,
    String? coverPhotoPath,
    Uint8List? coverBytes,
    String? bookTitle,
    String? bookAuthor,
    String? curatorAngle,
    List<String> excerptPhotoPaths = const [],
    List<Uint8List> excerptBytesList = const [],
  }) {
    showDialog(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.92),
      builder: (ctx) => BookCoverViewerDialog(
        item: item,
        coverPhotoPath: coverPhotoPath ?? item?.bookCoverPhotoPath,
        coverBytes: coverBytes,
        bookTitle: bookTitle ?? item?.bookTitle ?? item?.publicationName,
        bookAuthor: bookAuthor ?? item?.bookAuthor,
        curatorAngle: curatorAngle ?? item?.curatorAngle ?? item?.userContext,
        excerptPhotoPaths: excerptPhotoPaths.isNotEmpty
            ? excerptPhotoPaths
            : (item?.bookExcerptPhotoPaths ?? []),
        excerptBytesList: excerptBytesList,
      ),
    );
  }

  @override
  State<BookCoverViewerDialog> createState() => _BookCoverViewerDialogState();
}

class _BookCoverViewerDialogState extends State<BookCoverViewerDialog> {
  int _turns = 0;
  int _selectedPageIndex = 0; // 0 = Cover, 1+ = Excerpt Pages

  @override
  Widget build(BuildContext context) {
    final title = widget.bookTitle?.isNotEmpty == true
        ? widget.bookTitle!
        : 'Book Cover';
    final author = widget.bookAuthor?.isNotEmpty == true
        ? widget.bookAuthor!
        : 'Curated Edition';
    final angle = widget.curatorAngle?.isNotEmpty == true
        ? widget.curatorAngle!
        : 'Curator\'s literary reflection';

    final totalExcerpts = widget.excerptBytesList.isNotEmpty
        ? widget.excerptBytesList.length
        : widget.excerptPhotoPaths.length;

    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 500),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Top Bar with Book Icon, Title, and Actions
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFF1E293B),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
                border: Border.all(color: Colors.white12),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: Colors.amber.shade900.withValues(alpha: 0.25),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(Icons.auto_stories, color: Colors.amber, size: 20),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.amber.shade800,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: const Text(
                                'BOOK COVER IDENTIFIED',
                                style: TextStyle(
                                  fontSize: 8.5,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white,
                                  letterSpacing: 0.8,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 3),
                        Text(
                          title,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          'by $author',
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 11,
                            fontStyle: FontStyle.italic,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.rotate_right, color: Colors.white70, size: 20),
                    tooltip: 'Rotate 90°',
                    onPressed: () => setState(() => _turns = (_turns + 1) % 4),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.white, size: 22),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),

            // Tab / Page Selector if multiple excerpt pages exist
            if (totalExcerpts > 0)
              Container(
                color: const Color(0xFF0F172A),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _buildPageSelectorChip(0, '📖 Book Cover'),
                      ...List.generate(totalExcerpts, (i) {
                        return _buildPageSelectorChip(i + 1, '📄 Excerpt Page ${i + 1}');
                      }),
                    ],
                  ),
                ),
              ),

            // Main Photo Display with Pinch-to-zoom
            Flexible(
              child: Container(
                color: Colors.black.withValues(alpha: 0.8),
                constraints: const BoxConstraints(maxHeight: 460),
                child: InteractiveViewer(
                  panEnabled: true,
                  boundaryMargin: const EdgeInsets.all(20),
                  minScale: 0.8,
                  maxScale: 4.0,
                  child: Center(
                    child: RotatedBox(
                      quarterTurns: _turns,
                      child: _buildCurrentPhotoWidget(),
                    ),
                  ),
                ),
              ),
            ),

            // Bottom Curator Emotion Footer
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFF1E293B),
                borderRadius: const BorderRadius.vertical(bottom: Radius.circular(16)),
                border: Border.all(color: Colors.white12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.lightbulb_outline, size: 14, color: Colors.amber),
                      const SizedBox(width: 6),
                      const Expanded(
                        child: Text(
                          'CURATOR\'S EMOTION & ANGLE',
                          style: TextStyle(
                            color: Colors.amber,
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            letterSpacing: 1.0,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 5),
                  Text(
                    '“$angle”',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontStyle: FontStyle.italic,
                      height: 1.35,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Pinch to zoom • Tap rotate to orient book photo',
                    style: TextStyle(color: Colors.white38, fontSize: 10),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPageSelectorChip(int index, String label) {
    final isSelected = _selectedPageIndex == index;
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: ChoiceChip(
        label: Text(label),
        selected: isSelected,
        selectedColor: Colors.amber.shade800,
        backgroundColor: Colors.white10,
        labelStyle: TextStyle(
          fontSize: 11,
          fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
          color: isSelected ? Colors.white : Colors.white70,
        ),
        visualDensity: VisualDensity.compact,
        onSelected: (val) {
          if (val) setState(() => _selectedPageIndex = index);
        },
      ),
    );
  }

  Widget _buildCurrentPhotoWidget() {
    if (_selectedPageIndex == 0) {
      // Show Cover Page
      if (widget.coverBytes != null) {
        return Image.memory(
          widget.coverBytes!,
          fit: BoxFit.contain,
          errorBuilder: (_, _, _) => _buildBookCoverCard(),
        );
      }

      final path = widget.coverPhotoPath ?? '';
      if (widget.item?.bookCoverBase64 != null && widget.item!.bookCoverBase64!.isNotEmpty) {
        try {
          final bytes = base64Decode(widget.item!.bookCoverBase64!);
          return Image.memory(bytes, fit: BoxFit.contain);
        } catch (_) {}
      }

      if (!kIsWeb && path.isNotEmpty && File(path).existsSync()) {
        return Image.file(
          File(path),
          fit: BoxFit.contain,
          errorBuilder: (_, _, _) => _buildBookCoverCard(),
        );
      }

      return _buildBookCoverCard();
    } else {
      // Show Excerpt Page
      final excerptIdx = _selectedPageIndex - 1;
      if (widget.excerptBytesList.length > excerptIdx) {
        return Image.memory(
          widget.excerptBytesList[excerptIdx],
          fit: BoxFit.contain,
          errorBuilder: (_, _, _) => _buildExcerptPlaceholder(excerptIdx + 1),
        );
      }

      if (widget.excerptPhotoPaths.length > excerptIdx) {
        final path = widget.excerptPhotoPaths[excerptIdx];
        if (!kIsWeb && File(path).existsSync()) {
          return Image.file(
            File(path),
            fit: BoxFit.contain,
            errorBuilder: (_, _, _) => _buildExcerptPlaceholder(excerptIdx + 1),
          );
        }
      }

      return _buildExcerptPlaceholder(excerptIdx + 1);
    }
  }

  Widget _buildBookCoverCard() {
    final title = widget.bookTitle?.isNotEmpty == true
        ? widget.bookTitle!
        : 'CURATED BOOK';
    final author = widget.bookAuthor?.isNotEmpty == true
        ? widget.bookAuthor!
        : 'CLASSIC EDITION';

    return Container(
      width: 260,
      height: 380,
      margin: const EdgeInsets.symmetric(vertical: 16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF2C1810), Color(0xFF1A0F0A), Color(0xFF0F0805)],
        ),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFD4AF37), width: 3),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.6),
            blurRadius: 20,
            offset: const Offset(4, 8),
          ),
          BoxShadow(
            color: const Color(0xFFD4AF37).withValues(alpha: 0.2),
            blurRadius: 10,
          ),
        ],
      ),
      padding: const EdgeInsets.all(22),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: const Color(0xFFD4AF37), width: 1.5),
            ),
            child: const Icon(Icons.auto_stories, size: 36, color: Color(0xFFD4AF37)),
          ),
          const SizedBox(height: 18),
          Text(
            title.toUpperCase(),
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Color(0xFFF3ECE0),
              fontSize: 17,
              fontWeight: FontWeight.w900,
              fontFamily: 'serif',
              letterSpacing: 2.0,
            ),
          ),
          const SizedBox(height: 8),
          Container(
            width: 40,
            height: 1.5,
            color: const Color(0xFFD4AF37),
          ),
          const SizedBox(height: 10),
          Text(
            author.toUpperCase(),
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Color(0xFFD4AF37),
              fontSize: 12,
              fontWeight: FontWeight.w600,
              letterSpacing: 1.8,
            ),
          ),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: Colors.white10,
              borderRadius: BorderRadius.circular(4),
              border: Border.all(color: Colors.white24),
            ),
            child: const Text(
              'CURATED READING EDITION',
              style: TextStyle(
                color: Colors.white70,
                fontSize: 9,
                fontWeight: FontWeight.bold,
                letterSpacing: 1.2,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildExcerptPlaceholder(int pageNum) {
    return Container(
      width: 280,
      height: 380,
      margin: const EdgeInsets.symmetric(vertical: 16),
      color: const Color(0xFFFDFBF7),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'BOOK EXCERPT',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 1.5,
                  color: Colors.grey.shade700,
                ),
              ),
              Text(
                'Page $pageNum',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  color: Colors.grey.shade600,
                ),
              ),
            ],
          ),
          const Divider(),
          const Spacer(),
          Center(
            child: Column(
              children: [
                Icon(Icons.menu_book, size: 48, color: Colors.grey.shade400),
                const SizedBox(height: 8),
                Text(
                  'Book Excerpt Page $pageNum',
                  style: TextStyle(
                    fontFamily: 'serif',
                    fontSize: 14,
                    color: Colors.grey.shade800,
                  ),
                ),
              ],
            ),
          ),
          const Spacer(),
        ],
      ),
    );
  }
}
