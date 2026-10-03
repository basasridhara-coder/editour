import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';

class GalleryService {
  static const MethodChannel _channel = MethodChannel('com.postcard.app/gallery');

  /// Saves a list of PNG image bytes into the device Gallery under "Slant" folder
  static Future<List<String>> downloadCarouselToSlantFolder({
    required List<Uint8List> slideBytesList,
    required String title,
  }) async {
    Directory slantDir;
    if (!kIsWeb && Platform.isAndroid) {
      slantDir = Directory('/storage/emulated/0/Pictures/Slant');
    } else {
      final docDir = await getApplicationDocumentsDirectory();
      slantDir = Directory('${docDir.path}/Pictures/Slant');
    }

    if (!await slantDir.exists()) {
      await slantDir.create(recursive: true);
    }

    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final sanitizedTitle = title
        .replaceAll(RegExp(r'[^\w\s-]'), '')
        .trim()
        .replaceAll(RegExp(r'\s+'), '_');
    final prefix = sanitizedTitle.isNotEmpty
        ? (sanitizedTitle.length > 25 ? sanitizedTitle.substring(0, 25) : sanitizedTitle)
        : 'slant';

    final List<String> savedPaths = [];
    for (int i = 0; i < slideBytesList.length; i++) {
      final fileName = '${prefix}_${timestamp}_slide${i + 1}.png';
      final file = File('${slantDir.path}/$fileName');
      await file.writeAsBytes(slideBytesList[i], flush: true);
      savedPaths.add(file.path);

      // Trigger MediaScanner on Android so Samsung Gallery / Google Photos immediately shows it
      if (!kIsWeb && Platform.isAndroid) {
        try {
          await _channel.invokeMethod('scanFile', {'path': file.path});
        } catch (e) {
          debugPrint('Error triggering media scanner: $e');
        }
      }
    }

    return savedPaths;
  }
}
