import 'dart:convert';
import 'dart:typed_data';

/// High-performance memory cache for base64-decoded image bytes.
/// Prevents expensive synchronous base64Decode() execution on the UI thread
/// during build/scroll passes.
class ImageCacheService {
  static final Map<String, Uint8List> _memCache = {};
  static const int _maxCachedEntries = 40;

  /// Retrieves cached Uint8List bytes or decodes base64 string once and memoizes it
  static Uint8List? getBytes(String key, String? base64Str) {
    if (base64Str == null || base64Str.isEmpty) return null;
    final cached = _memCache[key];
    if (cached != null) return cached;

    try {
      final bytes = base64Decode(base64Str);
      if (_memCache.length >= _maxCachedEntries) {
        _memCache.remove(_memCache.keys.first);
      }
      _memCache[key] = bytes;
      return bytes;
    } catch (_) {
      return null;
    }
  }

  /// Removes cached entry
  static void evict(String key) {
    _memCache.remove(key);
  }

  /// Clears all cached image bytes
  static void clear() {
    _memCache.clear();
  }
}
