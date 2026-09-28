import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../models/postcard_item.dart';
import 'storage_service.dart';

class EditourCloudService {
  static final EditourCloudService _instance = EditourCloudService._internal();
  factory EditourCloudService() => _instance;
  EditourCloudService._internal();

  final StorageService _storageService = StorageService();

  // Supabase Cloud Backend for https://editour.app
  static const String supabaseUrl = 'https://karnxbsmvnkydcfydrcf.supabase.co';
  static const String supabaseApiKey = 'sb_publishable_n90rXQfEukf2gdisKe_jGg_Cybk2r-m';
  static const String supabaseEndpoint = '$supabaseUrl/rest/v1/posts';

  /// Publishes a single post card item to editour.app / Supabase
  Future<bool> publishPost(PostCardItem item) async {
    try {
      final payload = {
        'id': item.id,
        'data': item.toMap(),
      };
      final body = json.encode(payload);

      // 1. Direct Supabase Cloud Database (instant live sync to editour.app)
      try {
        final uri = Uri.parse(supabaseEndpoint);
        final response = await http
            .post(
              uri,
              headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseApiKey,
                'Authorization': 'Bearer $supabaseApiKey',
                'Prefer': 'resolution=merge-duplicates',
              },
              body: body,
            )
            .timeout(const Duration(seconds: 10));

        if (response.statusCode >= 200 && response.statusCode < 300) {
          debugPrint('✅ Successfully published post "${item.id}" to Supabase & editour.app');
          return true;
        } else {
          debugPrint('Supabase publish status: ${response.statusCode} - ${response.body}');
        }
      } catch (e) {
        debugPrint('Supabase publish attempt error: $e');
      }

      // 2. Also attempt local loopback / ADB reverse bridge if running in dev
      try {
        final localUri = Uri.parse('http://127.0.0.1:8080/api/feed');
        await http
            .post(
              localUri,
              headers: {'Content-Type': 'application/json'},
              body: json.encode(item.toMap()),
            )
            .timeout(const Duration(seconds: 3));
      } catch (_) {}

      return false;
    } catch (e) {
      debugPrint('EditourCloudService publishPost error: $e');
      return false;
    }
  }

  /// Syncs all saved posts from phone storage to editour.app
  Future<int> syncAllPosts() async {
    final items = await _storageService.getPostCards();
    int successCount = 0;

    for (final item in items) {
      final ok = await publishPost(item);
      if (ok) successCount++;
    }

    return successCount;
  }
}
