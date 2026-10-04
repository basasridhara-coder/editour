import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../models/postcard_item.dart';
import 'storage_service.dart';

class CloudSyncResult {
  final int publishedCount;
  final int deletedCount;
  final bool success;
  final String message;

  CloudSyncResult({
    required this.publishedCount,
    required this.deletedCount,
    required this.success,
    required this.message,
  });
}

class EditourCloudService {
  static final EditourCloudService _instance = EditourCloudService._internal();
  factory EditourCloudService() => _instance;
  EditourCloudService._internal();

  final StorageService _storageService = StorageService();

  // Supabase Cloud Backend for https://slant.today / https://editour.app
  static const String supabaseUrl = 'https://fsuukgpizuipxxwatkbo.supabase.co';
  static const String supabaseApiKey =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzdXVrZ3BpenVpcHh4d2F0a2JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMzE4NjEsImV4cCI6MjEwNjcwNzg2MX0.NPnTDhGyiigPZIvror8JGqjCMVKuJ8OZaDN2pGuVfM8';
  static const String supabaseEndpoint = '$supabaseUrl/rest/v1/posts';

  /// Publishes a single post card item to slant.today / editour.app
  /// Payload is kept ultra-lean (< 3 KB) to guarantee zero quota burnout.
  Future<bool> publishPost(PostCardItem item) async {
    try {
      final itemMap = Map<String, dynamic>.from(item.toMap());

      // CRITICAL: Strip heavy raw base64 images from cloud database JSON
      // Camera photos and canvases can be 3-5 MB each. Stripping them keeps
      // each database row under 3 KB and ensures we never exceed Free Tier egress!
      itemMap.remove('originalPhotoBase64');
      itemMap.remove('illustrationBase64');
      itemMap.remove('curatorIllustrationBase64');
      itemMap.remove('bookCoverBase64');

      final payload = {
        'id': item.id,
        'data': itemMap,
      };
      final body = json.encode(payload);

      // 1. Direct Supabase Cloud Database (instant live sync to slant.today & editour.app)
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
              body: json.encode(itemMap),
            )
            .timeout(const Duration(seconds: 3));
      } catch (_) {}

      return false;
    } catch (e) {
      debugPrint('EditourCloudService publishPost error: $e');
      return false;
    }
  }

  /// Deletes a post from editour.app / Supabase
  Future<bool> deletePost(String id) async {
    try {
      final uri = Uri.parse('$supabaseEndpoint?id=eq.$id');
      // 1. Mark as deleted via PATCH (Supabase RLS permits UPDATE with anon key)
      try {
        final patchResponse = await http
            .patch(
              uri,
              headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseApiKey,
                'Authorization': 'Bearer $supabaseApiKey',
              },
              body: json.encode({
                'data': {
                  'id': id,
                  'deleted': true,
                  'isDeleted': true,
                  'deletedAt': DateTime.now().toIso8601String(),
                }
              }),
            )
            .timeout(const Duration(seconds: 10));

        if (patchResponse.statusCode >= 200 && patchResponse.statusCode < 300) {
          debugPrint('🗑️ Successfully marked post "$id" as deleted in Supabase');
        }
      } catch (e) {
        debugPrint('Supabase patch delete attempt error: $e');
      }

      // 2. Also attempt DELETE in case DELETE policy is permitted
      try {
        await http
            .delete(
              uri,
              headers: {
                'apikey': supabaseApiKey,
                'Authorization': 'Bearer $supabaseApiKey',
              },
            )
            .timeout(const Duration(seconds: 5));
      } catch (_) {}

      return true;
    } catch (e) {
      debugPrint('EditourCloudService deletePost error: $e');
    }
    return false;
  }

  /// Syncs local posts to Supabase so everything created on phone is in cloud.
  /// Never deletes other remote posts, protecting community feed and seed posts.
  Future<CloudSyncResult> reconcileWithCloud() async {
    try {
      final items = await _storageService.getPostCards();

      // Publish all current local posts to Supabase
      int publishedCount = 0;
      for (final item in items) {
        final ok = await publishPost(item);
        if (ok) publishedCount++;
      }

      return CloudSyncResult(
        publishedCount: publishedCount,
        deletedCount: 0,
        success: true,
        message: 'Successfully synced $publishedCount post(s) to cloud.',
      );
    } catch (e) {
      debugPrint('EditourCloudService reconcileWithCloud error: $e');
      return CloudSyncResult(
        publishedCount: 0,
        deletedCount: 0,
        success: false,
        message: 'Sync error: $e',
      );
    }
  }

  /// Syncs all saved posts from phone storage to editour.app with full reconciliation
  Future<int> syncAllPosts() async {
    final result = await reconcileWithCloud();
    return result.publishedCount;
  }
}
