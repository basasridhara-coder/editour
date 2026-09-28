import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

class PhotoViewerDialog extends StatefulWidget {
  final String? photoPath;
  final Uint8List? imageBytes;
  final String? headline;
  final int initialQuarterTurns;

  const PhotoViewerDialog({
    super.key,
    this.photoPath,
    this.imageBytes,
    this.headline,
    this.initialQuarterTurns = 0,
  });

  static void show(
    BuildContext context, {
    String? photoPath,
    Uint8List? imageBytes,
    String? headline,
    int quarterTurns = 0,
  }) {
    showDialog(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.9),
      builder: (ctx) => PhotoViewerDialog(
        photoPath: photoPath,
        imageBytes: imageBytes,
        headline: headline,
        initialQuarterTurns: quarterTurns,
      ),
    );
  }

  @override
  State<PhotoViewerDialog> createState() => _PhotoViewerDialogState();
}

class _PhotoViewerDialogState extends State<PhotoViewerDialog> {
  late int _turns;

  @override
  void initState() {
    super.initState();
    _turns = widget.initialQuarterTurns;
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  widget.headline ?? 'Original Magazine / Newspaper Photo',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              IconButton(
                icon: const Icon(Icons.rotate_right, color: Colors.white),
                tooltip: 'Rotate 90°',
                onPressed: () => setState(() => _turns = (_turns + 1) % 4),
              ),
              IconButton(
                icon: const Icon(Icons.close, color: Colors.white),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Flexible(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Container(
                color: Colors.black26,
                child: InteractiveViewer(
                  panEnabled: true,
                  boundaryMargin: const EdgeInsets.all(20),
                  minScale: 0.8,
                  maxScale: 4.0,
                  child: RotatedBox(
                    quarterTurns: _turns,
                    child: _buildImageWidget(),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'Pinch to zoom • Tap rotate to re-orient physical print',
            style: TextStyle(color: Colors.white54, fontSize: 11),
          ),
        ],
      ),
    );
  }

  Widget _buildImageWidget() {
    if (widget.imageBytes != null) {
      return Image.memory(
        widget.imageBytes!,
        fit: BoxFit.contain,
        errorBuilder: (context, error, stackTrace) => _buildPlaceholder(),
      );
    }

    final photoPath = widget.photoPath ?? '';
    final headline = widget.headline;
    if (photoPath == 'sample_asset_print' || photoPath.isEmpty) {
      return Container(
        height: 380,
        width: double.infinity,
        color: const Color(0xFFF3ECE0),
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.newspaper_outlined, size: 72, color: Color(0xFF8C7A6B)),
            const SizedBox(height: 16),
            const Text(
              'PHYSICAL PRINT CLIP',
              style: TextStyle(
                fontFamily: 'serif',
                fontSize: 16,
                fontWeight: FontWeight.bold,
                letterSpacing: 2.0,
                color: Color(0xFF3E342B),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              headline ?? 'Archived physical newspaper snapshot',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontFamily: 'serif',
                fontSize: 13,
                fontStyle: FontStyle.italic,
                color: Color(0xFF6B5C4D),
              ),
            ),
          ],
        ),
      );
    }

    if (!kIsWeb && File(photoPath).existsSync()) {
      return Image.file(
        File(photoPath),
        fit: BoxFit.contain,
        errorBuilder: (context, error, stackTrace) => _buildPlaceholder(),
      );
    }

    return _buildPlaceholder();
  }

  Widget _buildPlaceholder() {
    return Container(
      height: 300,
      width: double.infinity,
      color: Colors.grey[900],
      child: const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.broken_image_outlined, size: 48, color: Colors.white38),
            SizedBox(height: 8),
            Text('Photo not found on this device', style: TextStyle(color: Colors.white54)),
          ],
        ),
      ),
    );
  }
}
