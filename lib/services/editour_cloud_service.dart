import 'dart:convert';
import 'dart:io';
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

  // Supabase Cloud Backend for https://editour.app
  static const String supabaseUrl = 'https://karnxbsmvnkydcfydrcf.supabase.co';
  static const String supabaseApiKey = 'sb_publishable_n90rXQfEukf2gdisKe_jGg_Cybk2r-m';
  static const String supabaseEndpoint = '$supabaseUrl/rest/v1/posts';

  /// Publishes a single post card item to editour.app / Supabase
  Future<bool> publishPost(PostCardItem item) async {
    try {
      final itemMap = Map<String, dynamic>.from(item.toMap());

      // Ensure original physical paper clipping bytes are populated for web viewers
      if ((item.originalPhotoBase64 == null || item.originalPhotoBase64!.isEmpty) &&
          item.originalPhotoPath.isNotEmpty &&
          !item.originalPhotoPath.startsWith('http') &&
          !item.originalPhotoPath.startsWith('data:') &&
          !item.originalPhotoPath.startsWith('sample_') &&
          !item.originalPhotoPath.startsWith('digital_')) {
        try {
          if (!kIsWeb) {
            final file = File(item.originalPhotoPath);
            if (file.existsSync()) {
              final bytes = file.readAsBytesSync();
              final b64 = base64Encode(bytes);
              itemMap['originalPhotoBase64'] = b64;
              // Also update in local storage so subsequent reads have it
              try {
                final updatedItem = item.copyWith(originalPhotoBase64: b64);
                _storageService.savePostCard(updatedItem);
              } catch (_) {}
            }
          }
        } catch (e) {
          debugPrint('EditourCloudService reading photo bytes error: $e');
        }
      }

      final payload = {
        'id': item.id,
        'data': itemMap,
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

  /// Authoritative reconciliation between phone local storage and Supabase:
  /// 1. Finds posts in Supabase that are NOT in local phone storage, and deletes them from Supabase.
  /// 2. Ensures all local posts are uploaded to Supabase.
  Future<CloudSyncResult> reconcileWithCloud() async {
    try {
      final items = await _storageService.getPostCards();
      final localIds = items.map((e) => e.id).toSet();

      int deletedCount = 0;
      // 1. Fetch remote posts to find orphaned ones
      try {
        final uri = Uri.parse('$supabaseEndpoint?select=id,data->deleted');
        final response = await http
            .get(
              uri,
              headers: {
                'apikey': supabaseApiKey,
                'Authorization': 'Bearer $supabaseApiKey',
              },
            )
            .timeout(const Duration(seconds: 10));

        if (response.statusCode == 200) {
          final List<dynamic> remoteRows = json.decode(response.body);
          for (final row in remoteRows) {
            final remoteId = row['id']?.toString();
            final isDeleted = row['deleted'] == true || (row['data'] is Map && row['data']['deleted'] == true);
            if (isDeleted) continue; // Already marked as deleted
            if (remoteId != null && !localIds.contains(remoteId)) {
              final ok = await deletePost(remoteId);
              if (ok) deletedCount++;
            }
          }
        }
      } catch (e) {
        debugPrint('EditourCloudService reconcile remote query error: $e');
      }

      // 2. Publish all current local posts to Supabase
      int publishedCount = 0;
      for (final item in items) {
        final ok = await publishPost(item);
        if (ok) publishedCount++;
      }

      return CloudSyncResult(
        publishedCount: publishedCount,
        deletedCount: deletedCount,
        success: true,
        message: 'Synced $publishedCount post(s), removed $deletedCount deleted post(s).',
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
