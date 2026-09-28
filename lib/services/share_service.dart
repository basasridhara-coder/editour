import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../models/postcard_item.dart';

class ShareService {
  static final ShareService _instance = ShareService._internal();
  factory ShareService() => _instance;
  ShareService._internal();

  /// Captures a widget wrapped in RepaintBoundary to PNG bytes
  Future<Uint8List?> captureWidgetToPng(GlobalKey boundaryKey) async {
    try {
      final boundary = boundaryKey.currentContext?.findRenderObject()
          as RenderRepaintBoundary?;
      if (boundary == null) return null;

      // 3.0 pixel ratio generates crisp, high-definition poster graphics
      final image = await boundary.toImage(pixelRatio: 3.0);
      final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
      return byteData?.buffer.asUint8List();
    } catch (e) {
      debugPrint('Error capturing widget: $e');
      return null;
    }
  }

  /// Saves PNG bytes to the application directory and returns the absolute path
  Future<String?> savePosterToFile(Uint8List bytes, String id) async {
    try {
      if (kIsWeb) return null;
      final dir = await getApplicationDocumentsDirectory();
      final filePath = '${dir.path}/poster_$id.png';
      final file = File(filePath);
      await file.writeAsBytes(bytes);
      return filePath;
    } catch (e) {
      debugPrint('Error saving poster to file: $e');
      return null;
    }
  }

  /// Generates clean, attractive social share text
  String generateShareText(PostCardItem item) {
    final buffer = StringBuffer();
    buffer.writeln('📰 ${item.adaptedHeadline.toUpperCase()}');
    if (item.publicationName != null && item.publicationName!.isNotEmpty) {
      buffer.writeln('Spotted in physical print: ${item.publicationName}');
    }
    buffer.writeln('');
    buffer.writeln('💡 ${item.hook}');
    buffer.writeln('');
    buffer.writeln('📌 Key Takeaways:');
    for (final t in item.keyTakeaways) {
      buffer.writeln('• $t');
    }
    buffer.writeln('');
    if (item.pullQuote != null && item.pullQuote!.isNotEmpty) {
      buffer.writeln('💬 "${item.pullQuote}"');
      buffer.writeln('');
    }
    if (item.creatorOpinion != null && item.creatorOpinion!.isNotEmpty) {
      buffer.writeln('✍️ Curator Take (${item.creatorHandle ?? 'Curator'}):');
      buffer.writeln('${item.creatorOpinion}');
      buffer.writeln('');
    }
    if (item.digitalLink != null && item.digitalLink!.isNotEmpty) {
      buffer.writeln('🔗 Read more / Digital Source: ${item.digitalLink}');
      buffer.writeln('');
    }
    buffer.writeln('— Generated with PostCard: Physical Press to Social Poster');
    return buffer.toString();
  }

  /// Shares the postcard poster image and formatted text summary
  Future<void> sharePostCard({
    required PostCardItem item,
    Uint8List? posterBytes,
    Rect? sharePositionOrigin,
  }) async {
    final shareText = generateShareText(item);

    Uint8List? bytesToShare = posterBytes;
    if (bytesToShare == null && item.illustrationBase64 != null && item.illustrationBase64!.isNotEmpty) {
      try {
        bytesToShare = base64Decode(item.illustrationBase64!);
      } catch (_) {}
    }

    if (bytesToShare != null && !kIsWeb) {
      try {
        final tempDir = await getTemporaryDirectory();
        final imagePath = '${tempDir.path}/postcard_${item.id}.png';
        final file = File(imagePath);
        await file.writeAsBytes(bytesToShare);

        await SharePlus.instance.share(
          ShareParams(
            text: shareText,
            subject: item.adaptedHeadline,
            files: [XFile(imagePath, mimeType: 'image/png')],
            sharePositionOrigin: sharePositionOrigin,
          ),
        );
        return;
      } catch (e) {
        debugPrint('Failed to share image file, falling back to text: $e');
      }
    } else if (!kIsWeb && item.renderedPosterPath != null && File(item.renderedPosterPath!).existsSync()) {
      try {
        await SharePlus.instance.share(
          ShareParams(
            text: shareText,
            subject: item.adaptedHeadline,
            files: [XFile(item.renderedPosterPath!, mimeType: 'image/png')],
            sharePositionOrigin: sharePositionOrigin,
          ),
        );
        return;
      } catch (e) {
        debugPrint('Failed to share rendered poster file: $e');
      }
    }

    // Fallback to text share
    await SharePlus.instance.share(
      ShareParams(
        text: shareText,
        subject: item.adaptedHeadline,
        sharePositionOrigin: sharePositionOrigin,
      ),
    );
  }

  /// Shares 3 carousel poster images to WhatsApp / Instagram / Socials
  Future<void> shareCarouselTrio({
    required PostCardItem item,
    required List<Uint8List> slideBytes,
    Rect? sharePositionOrigin,
  }) async {
    if (slideBytes.isEmpty) return;
    if (kIsWeb) {
      await SharePlus.instance.share(
        ShareParams(
          text: 'Opinion curated in editour.app',
          subject: 'Opinion curated in editour.app',
        ),
      );
      return;
    }

    try {
      final tempDir = await getTemporaryDirectory();
      final List<XFile> xFiles = [];
      for (int i = 0; i < slideBytes.length; i++) {
        final filePath = '${tempDir.path}/editour_carousel_${item.id}_slide_${i + 1}.png';
        final file = File(filePath);
        await file.writeAsBytes(slideBytes[i]);
        xFiles.add(XFile(filePath, mimeType: 'image/png'));
      }

      const shareText = 'Opinion curated in editour.app';

      await SharePlus.instance.share(
        ShareParams(
          text: shareText,
          subject: 'Opinion curated in editour.app',
          files: xFiles,
          sharePositionOrigin: sharePositionOrigin,
        ),
      );
    } catch (e) {
      debugPrint('Error sharing carousel trio: $e');
    }
  }

  /// Saves the 3 carousel posters to documents directory
  Future<List<String>> saveCarouselTrio({
    required PostCardItem item,
    required List<Uint8List> slideBytes,
  }) async {
    final savedPaths = <String>[];
    if (kIsWeb || slideBytes.isEmpty) return savedPaths;

    try {
      final dir = await getApplicationDocumentsDirectory();
      for (int i = 0; i < slideBytes.length; i++) {
        final filePath = '${dir.path}/editour_poster_${item.id}_slide_${i + 1}.png';
        final file = File(filePath);
        await file.writeAsBytes(slideBytes[i]);
        savedPaths.add(filePath);
      }
    } catch (e) {
      debugPrint('Error saving carousel trio to files: $e');
    }
    return savedPaths;
  }
}
