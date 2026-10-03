import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'storage_service.dart';
import '../models/postcard_item.dart';

class WebFeedServer {
  static final WebFeedServer _instance = WebFeedServer._internal();
  factory WebFeedServer() => _instance;
  WebFeedServer._internal();

  HttpServer? _server;
  int _port = 8080;
  bool _isRunning = false;
  final StorageService _storageService = StorageService();

  bool get isRunning => _isRunning;
  int get port => _port;
  String get localUrl => 'http://localhost:$_port';

  /// Starts the embedded HTTP server on any available IPv4 interface
  Future<int?> start({int initialPort = 8080}) async {
    if (_isRunning && _server != null) {
      return _port;
    }

    int attemptPort = initialPort;
    for (int i = 0; i < 5; i++) {
      try {
        _server = await HttpServer.bind(
          InternetAddress.anyIPv4,
          attemptPort,
        );
        _port = attemptPort;
        _isRunning = true;
        debugPrint('🌐 WebFeedServer running on http://0.0.0.0:$_port (localhost:$_port)');

        _server!.listen(_handleRequest, onError: (e) {
          debugPrint('WebFeedServer error: $e');
        });

        return _port;
      } catch (e) {
        debugPrint('WebFeedServer failed on port $attemptPort with anyIPv4: $e, trying loopback...');
        try {
          _server = await HttpServer.bind(
            InternetAddress.loopbackIPv4,
            attemptPort,
          );
          _port = attemptPort;
          _isRunning = true;
          debugPrint('🌐 WebFeedServer running on http://127.0.0.1:$_port');
          _server!.listen(_handleRequest, onError: (e) {
            debugPrint('WebFeedServer error: $e');
          });
          return _port;
        } catch (e2) {
          debugPrint('WebFeedServer loopback failed on port $attemptPort: $e2');
          attemptPort++;
        }
      }
    }

    _isRunning = false;
    return null;
  }

  /// Stops the server
  Future<void> stop() async {
    if (_server != null) {
      await _server!.close(force: true);
      _server = null;
      _isRunning = false;
      debugPrint('🌐 WebFeedServer stopped');
    }
  }

  /// Finds the local device Wi-Fi IPv4 address
  Future<String?> getLocalIpAddress() async {
    try {
      final interfaces = await NetworkInterface.list(
        type: InternetAddressType.IPv4,
        includeLinkLocal: false,
      );
      for (final interface in interfaces) {
        for (final addr in interface.addresses) {
          if (!addr.isLoopback && addr.address.contains('.')) {
            return addr.address;
          }
        }
      }
    } catch (e) {
      debugPrint('Error getting local IP: $e');
    }
    return null;
  }

  /// Generates the full URL for external network access
  Future<String> getNetworkUrl() async {
    final ip = await getLocalIpAddress();
    if (ip != null && ip.isNotEmpty) {
      return 'http://$ip:$_port';
    }
    return 'http://localhost:$_port';
  }

  Future<void> _handleRequest(HttpRequest request) async {
    final response = request.response;

    // Standard CORS headers for cross-origin browsing
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Origin, Content-Type, Accept');

    if (request.method == 'OPTIONS') {
      response.statusCode = HttpStatus.ok;
      await response.close();
      return;
    }

    final path = request.uri.path;

    try {
      if (path == '/api/feed') {
        // Return JSON feed of all posts
        final items = await _storageService.getPostCards();
        final jsonList = items.map((e) => e.toMap()).toList();
        final body = json.encode({
          'status': 'ok',
          'app': 'PostCard',
          'count': jsonList.length,
          'posts': jsonList,
        });

        response.headers.contentType = ContentType.json;
        response.statusCode = HttpStatus.ok;
        response.write(body);
        await response.close();
      } else if (path == '/api/status') {
        final ip = await getLocalIpAddress();
        final body = json.encode({
          'status': 'online',
          'app': 'PostCard Web Feed Server',
          'port': _port,
          'localIp': ip,
          'timestamp': DateTime.now().toIso8601String(),
        });
        response.headers.contentType = ContentType.json;
        response.statusCode = HttpStatus.ok;
        response.write(body);
        await response.close();
      } else if (path.startsWith('/image/')) {
        // Serve local image file
        final relativePath = Uri.decodeComponent(path.substring('/image/'.length));
        final file = File(relativePath);
        if (await file.exists()) {
          final bytes = await file.readAsBytes();
          if (relativePath.endsWith('.png')) {
            response.headers.contentType = ContentType('image', 'png');
          } else {
            response.headers.contentType = ContentType('image', 'jpeg');
          }
          response.statusCode = HttpStatus.ok;
          response.add(bytes);
          await response.close();
        } else {
          response.statusCode = HttpStatus.notFound;
          response.write('Image not found');
          await response.close();
        }
      } else {
        // Serve the dynamic single-page web app with embedded live posts
        final items = await _storageService.getPostCards();
        final html = buildWebFeedHtml(items, serverPort: _port);
        response.headers.contentType = ContentType.html;
        response.statusCode = HttpStatus.ok;
        response.write(html);
        await response.close();
      }
    } catch (e) {
      debugPrint('Error handling request $path: $e');
      response.statusCode = HttpStatus.internalServerError;
      response.write('Internal server error: $e');
      await response.close();
    }
  }

  /// Builds a self-contained, responsive Instagram-like Web Page matching the Mobile App 1:1
  static String buildWebFeedHtml(List<PostCardItem> items, {int serverPort = 8080}) {
    final postsJson = json.encode(items.map((e) => e.toMap()).toList());

    return '''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Editour • 3-Poster Carousel Feed</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Playfair+Display:ital,wght@0,600;0,700;0,900;1,400;1,600&family=Space+Grotesk:wght@500;700;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-base: #060911;
      --bg-surface: #0E131F;
      --bg-card: #131A29;
      --border-subtle: rgba(255, 255, 255, 0.08);
      --primary: #38BDF8;
      --primary-gradient: linear-gradient(135deg, #0284C7 0%, #38BDF8 100%);
      --accent-cyan: #38BDF8;
      --accent-emerald: #10B981;
      --accent-rose: #F43F5E;
      --text-primary: #F8FAFC;
      --text-secondary: #94A3B8;
      --text-muted: #64748B;
      --shadow-card: 0 12px 36px -10px rgba(0, 0, 0, 0.75);
      --radius-card: 20px;
      --radius-pill: 9999px;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
    }

    body {
      background-color: var(--bg-base);
      color: var(--text-primary);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-bottom: 80px;
      background-image: 
        radial-gradient(circle at 10% 20%, rgba(56, 189, 248, 0.05) 0%, transparent 40%),
        radial-gradient(circle at 90% 80%, rgba(139, 92, 246, 0.05) 0%, transparent 40%);
      background-attachment: fixed;
    }

    /* Top Sticky Navigation Bar */
    header {
      position: sticky;
      top: 0;
      width: 100%;
      background: rgba(6, 9, 17, 0.92);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border-bottom: 1px solid var(--border-subtle);
      z-index: 100;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .nav-inner {
      width: 100%;
      max-width: 600px;
      padding: 12px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
    }

    .brand-logo {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      background: linear-gradient(135deg, #0284C7, #38BDF8, #818CF8);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      color: #060911;
      font-size: 18px;
      box-shadow: 0 4px 14px rgba(56, 189, 248, 0.35);
    }

    .brand-title {
      font-size: 19px;
      font-weight: 900;
      letter-spacing: -0.5px;
      color: #FFF;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .brand-subtitle {
      font-size: 9.5px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--accent-cyan);
      font-weight: 800;
    }

    .badge-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 11px;
      border-radius: var(--radius-pill);
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.25);
      color: #34D399;
      font-size: 11px;
      font-weight: 700;
    }

    .pulse-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #10B981;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
      70% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
      100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }

    /* Filter Bar */
    .filter-bar {
      width: 100%;
      max-width: 600px;
      padding: 0 16px 10px;
      display: flex;
      gap: 8px;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .filter-bar::-webkit-scrollbar { display: none; }

    .filter-pill {
      white-space: nowrap;
      padding: 5px 13px;
      border-radius: var(--radius-pill);
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-subtle);
      color: var(--text-secondary);
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .filter-pill:hover, .filter-pill.active {
      background: rgba(56, 189, 248, 0.18);
      border-color: var(--primary);
      color: #FFF;
    }

    /* Main Feed Layout */
    .feed-container {
      width: 100%;
      max-width: 480px;
      display: flex;
      flex-direction: column;
      gap: 22px;
      padding: 16px 14px;
    }

    /* Post Card */
    .post-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      overflow: hidden;
      box-shadow: var(--shadow-card);
      transition: transform 0.2s ease, border-color 0.2s ease;
    }
    .post-card:hover {
      border-color: rgba(255, 255, 255, 0.15);
    }

    /* Card Top Header */
    .post-header {
      padding: 12px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .creator-info {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .creator-avatar {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: linear-gradient(135deg, #F58529, #DD2A7B, #8134AF);
      padding: 2px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .avatar-inner {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: #0E131F;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 13.5px;
      color: #38BDF8;
    }

    .creator-names {
      display: flex;
      flex-direction: column;
    }

    .creator-handle-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .creator-handle {
      font-weight: 800;
      font-size: 13px;
      color: #FFF;
    }

    .audience-tag {
      font-size: 9.5px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 4px;
      background: rgba(56, 189, 248, 0.16);
      color: #7DD3FC;
    }

    .pub-source-badge {
      font-size: 11px;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 1px;
    }

    /* 4:5 Poster Carousel Viewport */
    .carousel-viewport {
      position: relative;
      width: 100%;
      aspect-ratio: 4 / 5;
      overflow: hidden;
      background: #060911;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      user-select: none;
    }

    .carousel-track {
      display: flex;
      width: 100%;
      height: 100%;
      transition: transform 0.35s cubic-bezier(0.2, 0.9, 0.4, 1);
    }

    .carousel-slide {
      flex: 0 0 100%;
      width: 100%;
      height: 100%;
      position: relative;
      overflow: hidden;
      cursor: pointer;
    }

    /* Floating navigation arrows */
    .carousel-nav-btn {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.65);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #FFF;
      font-size: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 20;
      opacity: 0;
      transition: opacity 0.2s ease, background 0.2s ease;
      backdrop-filter: blur(8px);
    }
    .carousel-viewport:hover .carousel-nav-btn {
      opacity: 1;
    }
    .carousel-nav-btn:hover {
      background: rgba(0, 0, 0, 0.9);
      border-color: rgba(255, 255, 255, 0.4);
    }
    .carousel-nav-btn.prev { left: 10px; }
    .carousel-nav-btn.next { right: 10px; }

    /* Top pill row on all slides */
    .slide-top-bar {
      position: absolute;
      top: 14px;
      left: 14px;
      right: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 10;
    }

    .pill-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 20px;
      background: rgba(0, 0, 0, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.25);
      font-size: 9.5px;
      font-weight: 700;
      color: #FFF;
      letter-spacing: 0.5px;
      backdrop-filter: blur(8px);
      max-width: 80%;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .pill-badge .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #38BDF8;
      flex-shrink: 0;
    }
    .pill-counter {
      padding: 4px 9px;
      border-radius: 20px;
      background: rgba(0, 0, 0, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.25);
      font-size: 9.5px;
      font-weight: 800;
      color: #FFF;
      letter-spacing: 0.5px;
      backdrop-filter: blur(8px);
    }

    /* SLIDE 1: Hook Poster */
    .slide-hook {
      background: #060911;
    }
    .slide-hook .slide-art {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .slide-fallback-bg {
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 50% 30%, #1E293B 0%, #060911 100%);
    }
    .slide-hook .slide-vignette {
      position: absolute;
      inset: 0;
      background: linear-gradient(to bottom, rgba(0,0,0,0.60) 0%, transparent 12%, transparent 65%, rgba(6,9,17,0.85) 82%, rgba(6,9,17,0.98) 100%);
      pointer-events: none;
    }
    .slide-hook .slide-bottom-content {
      position: absolute;
      bottom: 16px;
      left: 18px;
      right: 18px;
      z-index: 10;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .slide-hook .slide-headline {
      font-size: 21px;
      font-weight: 900;
      line-height: 1.16;
      letter-spacing: -0.6px;
      color: #FFF;
      text-shadow: 0 3px 16px rgba(0, 0, 0, 0.95), 0 1px 8px rgba(0, 0, 0, 0.9);
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .slide-hook .slide-footer-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .slide-hook .creator-tag {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .slide-hook .creator-avatar-sm {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #38BDF8;
      color: #000;
      font-weight: 800;
      font-size: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .slide-hook .creator-name-sm {
      font-size: 11px;
      font-weight: 700;
      color: #CBD5E1;
    }
    .swipe-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 11px;
      border-radius: 20px;
      background: rgba(56, 189, 248, 0.25);
      border: 1px solid rgba(56, 189, 248, 0.7);
      font-size: 10px;
      font-weight: 900;
      color: #FFF;
      cursor: pointer;
      transition: background 0.2s ease;
    }
    .swipe-pill:hover {
      background: rgba(56, 189, 248, 0.4);
    }

    /* SLIDE 2: Curator Critique Poster */
    .slide-critique {
      background: #070B12;
      position: relative;
    }
    .slide-critique .critique-bg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      filter: blur(14px) brightness(0.25);
      transform: scale(1.1);
    }
    .slide-critique .critique-container {
      position: relative;
      z-index: 5;
      width: 100%;
      height: 100%;
      padding: 52px 18px 16px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .critique-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 8.5px;
      font-weight: 900;
      letter-spacing: 1.2px;
      color: #38BDF8;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .critique-opinion {
      font-size: 13.5px;
      font-weight: 500;
      line-height: 1.48;
      color: #F8FAFC;
      display: -webkit-box;
      -webkit-line-clamp: 5;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .critique-quote-box {
      background: rgba(56, 189, 248, 0.08);
      border-left: 4px solid #38BDF8;
      padding: 10px 14px;
      border-radius: 4px 8px 8px 4px;
      margin: 10px 0;
    }
    .critique-quote-label {
      font-size: 8px;
      font-weight: 900;
      letter-spacing: 1px;
      color: #38BDF8;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .critique-quote-text {
      font-family: 'Playfair Display', Georgia, serif;
      font-style: italic;
      font-size: 12.5px;
      color: #E2E8F0;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .critique-why-note {
      font-size: 11px;
      color: #94A3B8;
      line-height: 1.42;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding-top: 8px;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .critique-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      font-weight: 700;
      color: #94A3B8;
      letter-spacing: 0.5px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      padding-top: 10px;
    }

    /* SLIDE 3: Broadsheet Authentic Newspaper Excerpts Poster */
    .slide-receipts {
      background: #F7F5EE;
      color: #0F172A;
      font-family: 'Playfair Display', Georgia, serif;
      padding: 14px 16px 12px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
    }
    .stamp-verified {
      position: absolute;
      top: 10px;
      right: 12px;
      transform: rotate(-10deg);
      border: 1.8px solid #DC2626;
      color: #DC2626;
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 7.5px;
      font-weight: 900;
      letter-spacing: 0.8px;
      text-align: center;
      line-height: 1.1;
      background: rgba(220, 38, 38, 0.06);
      z-index: 10;
    }
    .masthead-rule-thick { height: 2.2px; background: #0F172A; }
    .masthead-rule-thin { height: 0.7px; background: #475569; margin-top: 2px; }
    .masthead-title {
      font-size: 17px;
      font-weight: 900;
      letter-spacing: 2px;
      text-transform: uppercase;
      text-align: center;
      color: #0F172A;
      font-family: Georgia, serif;
      margin: 4px 0 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .masthead-sub {
      display: flex;
      justify-content: space-between;
      font-size: 7.5px;
      font-weight: 700;
      color: #475569;
      letter-spacing: 0.6px;
      margin-bottom: 3px;
    }
    .masthead-sub-bold {
      font-weight: 900;
      color: #0F172A;
      letter-spacing: 0.8px;
    }
    .masthead-rule-bottom { height: 1.2px; background: #0F172A; }

    .receipts-headline-box {
      margin: 6px 0 4px;
    }
    .receipts-headline {
      font-size: 14.5px;
      font-weight: 900;
      line-height: 1.2;
      color: #0F172A;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .receipts-byline {
      display: flex;
      justify-content: space-between;
      font-size: 7.5px;
      font-weight: 700;
      color: #475569;
      letter-spacing: 0.5px;
      margin-top: 2px;
    }
    .receipts-archive-tag {
      font-weight: 800;
      color: #991B1B;
    }
    .receipts-hairline { height: 0.6px; background: #CBD5E1; margin-top: 3px; }

    .receipts-article-flow {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 12px;
      margin: 4px 0;
    }
    .receipts-p1 {
      font-size: 10.5px;
      color: #1E293B;
      line-height: 1.36;
      margin: 0;
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .receipts-highlighter-box {
      background: #FEF08A;
      border: 1px solid #FDE047;
      border-left: 5px solid #CA8A04;
      padding: 6px 10px;
      border-radius: 3px;
      box-shadow: 0 2px 8px rgba(234, 179, 8, 0.3);
    }
    .highlighter-label {
      font-size: 7.5px;
      font-weight: 900;
      letter-spacing: 0.8px;
      color: #854D0E;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .highlighter-text {
      font-size: 11.5px;
      font-weight: 900;
      color: #0F172A;
      line-height: 1.32;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .receipts-p3 {
      font-size: 10px;
      color: #334155;
      line-height: 1.36;
      margin: 0;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .receipts-folio-rule { height: 0.8px; background: #0F172A; }
    .receipts-folio-text {
      display: flex;
      justify-content: space-between;
      font-size: 7.5px;
      font-weight: 800;
      color: #475569;
      letter-spacing: 0.5px;
      margin-top: 3px;
    }

    /* Action Toolbar (Like, Inspect, Paper Cut, Dots, Web Link) */
    .action-bar {
      padding: 10px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .action-group-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .action-btn {
      background: none;
      border: none;
      color: var(--text-secondary);
      font-size: 12.5px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      padding: 5px 8px;
      border-radius: 8px;
      transition: all 0.15s ease;
    }
    .action-btn:hover {
      background: rgba(255, 255, 255, 0.06);
      color: #FFF;
    }
    .action-btn.liked {
      color: var(--accent-rose);
    }
    .action-btn.liked svg {
      fill: var(--accent-rose);
      stroke: var(--accent-rose);
    }

    /* Carousel Dots in Action Bar */
    .carousel-dots-container {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .dot-indicator {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.25);
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .dot-indicator.active {
      width: 6.5px;
      height: 6.5px;
      background: #38BDF8;
    }

    .action-group-right {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* Minimalist Action Icon Buttons (Parity with Mobile Feed) */
    .icon-action-btn {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      cursor: pointer;
      padding: 0;
      transition: all 0.18s ease;
      text-decoration: none;
    }
    .icon-action-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #FFF;
    }
    .icon-action-btn.active,
    .icon-action-btn.clean-view-btn.active {
      color: var(--accent-cyan);
      background: rgba(56, 189, 248, 0.14);
    }
    .icon-action-btn.clean-view-btn.active svg {
      stroke: var(--accent-cyan);
    }

    /* Clean View: Smoothly fade out text overlays and scrims to reveal pure artwork */
    .carousel-viewport.clean-view .slide-top-bar,
    .carousel-viewport.clean-view .slide-bottom-content,
    .carousel-viewport.clean-view .slide-vignette,
    .carousel-viewport.clean-view .critique-container,
    .carousel-viewport.clean-view .stamp-verified {
      opacity: 0 !important;
      pointer-events: none !important;
    }

    .slide-top-bar,
    .slide-bottom-content,
    .slide-vignette,
    .critique-container {
      transition: opacity 0.24s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .tag-action-btn {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border-subtle);
      color: #E2E8F0;
      border-radius: var(--radius-pill);
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .tag-action-btn:hover {
      background: rgba(56, 189, 248, 0.2);
      border-color: var(--primary);
      color: #FFF;
    }

    /* Post Content Details (Caption Style) */
    .post-content {
      padding: 10px 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .post-caption-headline {
      font-size: 15px;
      font-weight: 800;
      color: #FFF;
      line-height: 1.3;
      cursor: pointer;
    }
    .post-caption-headline:hover {
      color: #38BDF8;
    }

    .post-summary-snippet {
      font-size: 13px;
      line-height: 1.46;
      color: var(--text-secondary);
    }
    .post-summary-snippet strong {
      color: #FFF;
      margin-right: 4px;
    }

    .read-more-btn {
      color: var(--primary);
      background: none;
      border: none;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      margin-left: 4px;
    }
    .read-more-btn:hover {
      text-decoration: underline;
    }

    /* Full Detail Modal */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.88);
      backdrop-filter: blur(10px);
      z-index: 1000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
      opacity: 0;
      transition: opacity 0.25s ease;
    }
    .modal-overlay.open {
      display: flex;
      opacity: 1;
    }

    .modal-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 22px;
      width: 100%;
      max-width: 600px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
      padding: 22px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      position: relative;
    }

    .modal-close {
      position: absolute;
      top: 16px;
      right: 16px;
      background: rgba(255, 255, 255, 0.08);
      border: none;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      color: #FFF;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .modal-audience-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 11px;
      border-radius: var(--radius-pill);
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid rgba(56, 189, 248, 0.3);
      color: #7DD3FC;
      font-size: 11px;
      font-weight: 700;
      max-width: fit-content;
    }

    .modal-title {
      font-size: 20px;
      font-weight: 800;
      line-height: 1.3;
      color: #FFF;
    }

    .modal-why-box {
      background: rgba(56, 189, 248, 0.08);
      border-left: 3px solid var(--accent-cyan);
      padding: 12px 14px;
      border-radius: 4px 10px 10px 4px;
      font-size: 13px;
      color: #E2E8F0;
      line-height: 1.5;
    }

    .modal-takeaways-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .modal-takeaways-list li {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 13px;
      color: #CBD5E1;
      line-height: 1.5;
    }
    .modal-takeaways-list li span.bullet-icon {
      color: var(--accent-emerald);
      font-weight: 800;
      font-size: 14px;
      line-height: 1.2;
    }

    .modal-full-summary {
      font-size: 13.5px;
      line-height: 1.65;
      color: var(--text-secondary);
      white-space: pre-line;
    }

    /* Paper Cut Lightbox */
    .lightbox-img-wrap {
      width: 100%;
      max-height: 70vh;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 14px;
      background: #000;
    }
    .lightbox-img {
      max-width: 100%;
      max-height: 70vh;
      object-fit: contain;
    }
  </style>
</head>
<body>

  <!-- Sticky Header -->
  <header>
    <div class="nav-inner">
      <div class="brand">
        <div class="brand-logo">E</div>
        <div class="brand-text">
          <div class="brand-title">Editour</div>
          <div class="brand-subtitle">3-Poster Carousel Feed</div>
        </div>
      </div>
      <div class="header-actions">
        <div class="badge-status">
          <span class="pulse-dot"></span>
          <span>Live Sync</span>
        </div>
      </div>
    </div>

    <!-- Category Filter Bar -->
    <div class="filter-bar" id="categoryFilterBar">
      <div class="filter-pill active" data-cat="all">All Stories</div>
      <div class="filter-pill" data-cat="tech">Deep Tech</div>
      <div class="filter-pill" data-cat="health">Health & Bio</div>
      <div class="filter-pill" data-cat="climate">Climate & Energy</div>
      <div class="filter-pill" data-cat="economy">Economy</div>
      <div class="filter-pill" data-cat="literary">Literary Excerpt</div>
    </div>
  </header>

  <!-- Feed Container -->
  <main class="feed-container" id="feedContainer">
    <!-- Rendered dynamically via JavaScript -->
  </main>

  <!-- Detail Modal -->
  <div class="modal-overlay" id="detailModal">
    <div class="modal-card">
      <button class="modal-close" onclick="closeDetailModal()">&times;</button>
      <div class="modal-audience-badge" id="modalAudienceBadge">🎯 High School Students</div>
      <h2 class="modal-title" id="modalTitle">Story Headline</h2>
      
      <div class="modal-why-box" id="modalWhyBox">
        <strong>Why It Matters:</strong> <span id="modalWhyText">Explanation</span>
      </div>

      <div style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted);">
        Key Takeaways
      </div>
      <ul class="modal-takeaways-list" id="modalTakeawaysList"></ul>

      <div style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted); margin-top:8px;">
        Curator's Analysis
      </div>
      <div class="modal-full-summary" id="modalSummary"></div>

      <div style="margin-top:12px; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:11.5px; color:var(--text-muted);" id="modalPubSource">Source: Reuters</span>
        <a id="modalExternalLink" href="#" target="_blank" class="tag-action-btn">
          🌐 View Original Web Article &nearr;
        </a>
      </div>
    </div>
  </div>

  <!-- Paper Cut Lightbox Modal -->
  <div class="modal-overlay" id="paperCutModal">
    <div class="modal-card" style="max-width: 650px; padding: 18px;">
      <button class="modal-close" onclick="closePaperCutModal()">&times;</button>
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
        <span style="font-size:16px;">📰</span>
        <strong style="font-size:14px; color:#FFF;">Original Physical Newspaper Clipping</strong>
      </div>
      <div class="lightbox-img-wrap">
        <img id="paperCutImg" class="lightbox-img" src="" alt="Physical Newspaper Clipping">
      </div>
      <div style="font-size:11.5px; color:var(--text-muted); margin-top:10px; text-align:center;">
        Digitized via Editour Computer Vision & AI Extraction
      </div>
    </div>
  </div>

  <!-- Embedded Posts Data & Interactive Logic -->
  <script>
    window.__POSTCARD_INITIAL_FEED__ = $postsJson;

    let allPosts = window.__POSTCARD_INITIAL_FEED__ || [];
    let currentFilter = 'all';
    const postSlideState = {};

    function renderFeed() {
      const container = document.getElementById('feedContainer');
      container.innerHTML = '';

      const filtered = allPosts.filter(post => {
        if (currentFilter === 'all') return true;
        const cat = (post.categoryBadge || '').toLowerCase();
        const type = (post.sourceType || '').toLowerCase();
        if (currentFilter === 'tech') return cat.includes('tech') || cat.includes('quantum') || cat.includes('ai') || cat.includes('astro');
        if (currentFilter === 'health') return cat.includes('health') || cat.includes('cures') || cat.includes('bio');
        if (currentFilter === 'climate') return cat.includes('climate') || cat.includes('energy') || cat.includes('renewable');
        if (currentFilter === 'economy') return cat.includes('economy') || cat.includes('global') || cat.includes('market');
        if (currentFilter === 'literary') return type === 'book_excerpt' || cat.includes('literary') || cat.includes('book');
        return true;
      });

      if (filtered.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; padding: 48px 16px; color: var(--text-muted);">
            <div style="font-size:36px; margin-bottom:12px;">📰</div>
            <div style="font-weight:700; font-size:16px; color:#FFF;">No stories in this category yet</div>
            <div style="font-size:13px; margin-top:4px;">Snap a clipping or paste a news link in the Editour mobile app!</div>
          </div>
        `;
        return;
      }

      filtered.forEach((post, index) => {
        const card = createPostCardElement(post, index);
        container.appendChild(card);
        initTouchSwipe(card.querySelector('.carousel-viewport'), index);
      });
    }

    const cleanViewState = {};

    function toggleCleanView(event, index) {
      if (event) {
        event.stopPropagation();
        event.preventDefault();
      }
      cleanViewState[index] = !cleanViewState[index];
      const isClean = cleanViewState[index];

      const viewport = document.getElementById('viewport-' + index);
      if (viewport) {
        viewport.classList.toggle('clean-view', isClean);
      }

      const btn = document.getElementById('clean-btn-' + index);
      if (btn) {
        btn.classList.toggle('active', isClean);
        btn.setAttribute('title', isClean ? 'Show text overlays' : 'Clean artwork (hide text)');
        btn.innerHTML = isClean
          ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
               <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
               <line x1="1" y1="1" x2="23" y2="23"></line>
             </svg>`
          : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
               <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
               <circle cx="12" cy="12" r="3"></circle>
             </svg>`;
      }
    }

    function cleanDomain(url) {
      if (!url) return '';
      try {
        const parsed = new URL(url);
        return parsed.hostname.replace(/^www\\./, '');
      } catch {
        return url;
      }
    }

    function getStartingLines(fullText) {
      if (!fullText) return 'No summary available.';
      if (fullText.length <= 130) return fullText;
      const cutoff = fullText.indexOf(' ', 110);
      if (cutoff !== -1 && cutoff <= 145) {
        return fullText.substring(0, cutoff);
      }
      return fullText.substring(0, 120);
    }

    function copyCardShareLink(postId) {
      const shareUrl = window.location.origin + '/?p=' + postId;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl).then(() => {
          alert('📋 Shareable link copied: ' + shareUrl);
        }).catch(() => {
          prompt('Copy this link:', shareUrl);
        });
      } else {
        prompt('Copy this link:', shareUrl);
      }
    }

    function createPostCardElement(post, index) {
      const card = document.createElement('article');
      card.className = 'post-card';
      card.setAttribute('data-post-index', index);

      const handle = post.creatorHandle || '@curator';
      const initial = handle.replace('@', '').charAt(0).toUpperCase() || 'C';
      let pubName = (post.publicationName && post.publicationName.trim()) ? post.publicationName.trim() : 'THE FINANCIAL CHRONICLE';
      if (pubName.includes('•')) {
        const parts = pubName.split('•');
        pubName = parts[parts.length - 1].trim();
      }
      pubName = pubName.replace(/^(NEWSPAPER|ARTICLE|BOOK|MAGAZINE|PRESS):\\s*/i, '').trim();

      const catBadge = (post.categoryBadge || 'EDITORIAL').toUpperCase();
      const audience = post.targetAudience || 'General Audience';
      const headline = post.adaptedHeadline || post.originalHeadline || 'Story Overview';
      const origHeadline = post.originalHeadline || headline;
      const hook = post.hook || '';
      const summary = post.summary || '';
      const opinion = (post.creatorOpinion && post.creatorOpinion.trim()) ? post.creatorOpinion.trim() : (post.whyItMatters || hook || 'A structural shift the mainstream missed.');
      const pullQuote = post.pullQuote || (post.keyTakeaways && post.keyTakeaways[0]) || 'A structural shift the mainstream missed.';
      const whyItMatters = post.whyItMatters || '';
      const isBook = post.sourceType === 'book_excerpt';
      const isClean = !!cleanViewState[index];
      const hasPaperCut = post.originalPhotoPath && !post.originalPhotoPath.startsWith('http') && post.originalPhotoPath !== 'digital_article_link' && post.originalPhotoPath !== 'book_excerpt_reading';
      const digitalUrl = post.digitalLink || '';

      // Resolve pure article section excerpts (min 2, max 3 paragraphs, ZERO curator remarks)
      let excerpts = post.resolvedArticleExcerpts || post.articleExcerpts || [];
      if (!Array.isArray(excerpts) || excerpts.length === 0) {
        if (post.receiptHighlightQuote) {
          excerpts = [post.receiptHighlightQuote];
        } else if (post.pullQuote) {
          excerpts = [post.pullQuote];
        }
      }
      const p1 = (excerpts.length > 0 && excerpts[0]) ? excerpts[0] : (post.receiptHighlightQuote || 'Primary reporting confirmed that recorded structural indicators diverged sharply from initial forecasts across core operations.');
      const p2 = (excerpts.length > 1 && excerpts[1]) ? excerpts[1] : (post.receiptHighlightQuote && post.receiptHighlightQuote !== p1 ? post.receiptHighlightQuote : 'Official records corroborated the recorded developments across primary administrative and field channels.');
      const p3 = (excerpts.length > 2 && excerpts[2]) ? excerpts[2] : null;

      // Slide 1 Background Artwork (AI Generated Curated Angle Photo)
      let slide1ArtSrc = '';
      if (post.illustrationBase64) {
        slide1ArtSrc = 'data:image/jpeg;base64,' + post.illustrationBase64;
      } else if (post.renderedPosterPath && !post.renderedPosterPath.startsWith('http')) {
        slide1ArtSrc = '/image/' + encodeURIComponent(post.renderedPosterPath);
      }
      // NOTE: We NEVER display the raw paper cut clipping (originalPhotoPath) on Slide 1!

      // Slide 2 Background Artwork (Curator illustration or blurred main art)
      let slide2ArtSrc = '';
      if (post.curatorIllustrationBase64) {
        slide2ArtSrc = 'data:image/jpeg;base64,' + post.curatorIllustrationBase64;
      } else if (slide1ArtSrc) {
        slide2ArtSrc = slide1ArtSrc;
      }

      card.innerHTML = `
        <div class="post-header">
          <div class="creator-info">
            <div class="creator-avatar">
              <div class="avatar-inner">\${initial}</div>
            </div>
            <div class="creator-names">
              <div class="creator-handle-row">
                <span class="creator-handle">\${handle}</span>
                <span class="audience-tag">🎯 \${audience}</span>
              </div>
              <div class="pub-source-badge">
                <span>\${isBook ? '📖' : '📰'}</span>
                <span>\${pubName}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 4:5 Poster Carousel Viewport (1:1 with Mobile App) -->
        <div class="carousel-viewport \${isClean ? 'clean-view' : ''}" id="viewport-\${index}">
          <div class="carousel-track" id="track-\${index}">
            <!-- SLIDE 1: Bold Headline Hook Poster -->
            <div class="carousel-slide slide-hook" onclick="openDetailModal(\${index})">
              \${slide1ArtSrc ? `<img class="slide-art" src="\${slide1ArtSrc}" alt="\${headline}">` : `<div class="slide-fallback-bg"></div>`}
              <div class="slide-vignette"></div>

              <div class="slide-top-bar">
                <div class="pill-badge">
                  <span class="dot"></span>
                  <span>\${catBadge} • \${pubName}</span>
                </div>
                <div class="pill-counter">01 / 03</div>
              </div>

              <div class="slide-bottom-content">
                <h2 class="slide-headline">\${headline}</h2>
                <div class="slide-footer-row">
                  <div class="creator-tag">
                    <div class="creator-avatar-sm">\${initial}</div>
                    <span class="creator-name-sm">\${handle}</span>
                  </div>
                  <div class="swipe-pill" onclick="event.stopPropagation(); nextSlide(\${index})">
                    <span>SWIPE</span>
                    <span style="font-size:12px;">➔</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- SLIDE 2: Curator Critique Poster -->
            <div class="carousel-slide slide-critique" onclick="openDetailModal(\${index})">
              \${slide2ArtSrc ? `<img class="critique-bg" src="\${slide2ArtSrc}" alt="Critique">` : `<div class="slide-fallback-bg"></div>`}
              
              <div class="slide-top-bar">
                <div class="pill-badge">
                  <span class="dot" style="background:#A855F7;"></span>
                  <span>CURATOR ANGLE • \${pubName}</span>
                </div>
                <div class="pill-counter">02 / 03</div>
              </div>

              <div class="critique-container">
                <div>
                  <div class="critique-badge">⚡ EDITORIAL CRITIQUE & SYNTHESIS</div>
                  <div class="critique-opinion">"\${opinion}"</div>
                  
                  <div class="critique-quote-box">
                    <div class="critique-quote-label">KEY TAKEAWAY SIGNAL</div>
                    <div class="critique-quote-text">"\${pullQuote}"</div>
                  </div>

                  \${whyItMatters && whyItMatters !== opinion ? `
                    <div class="critique-why-note">
                      <strong style="color:#7DD3FC;">IMPACT:</strong> \${whyItMatters}
                    </div>
                  ` : ''}
                </div>

                <div class="critique-footer">
                  <span>CURATED BY \${handle}</span>
                  <div class="swipe-pill" onclick="event.stopPropagation(); nextSlide(\${index})">
                    <span>NEXT</span>
                    <span style="font-size:12px;">➔</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- SLIDE 3: Broadsheet Authentic Newspaper Excerpts Poster -->
            <div class="carousel-slide slide-receipts" onclick="openDetailModal(\${index})">
              <div class="stamp-verified">
                <div>★ VERIFIED ★</div>
                <div>PRESS EVIDENCE</div>
              </div>

              <div class="masthead">
                <div class="masthead-rule-thick"></div>
                <div class="masthead-rule-thin"></div>
                <div class="masthead-title">\${pubName.toUpperCase()}</div>
                <div class="masthead-sub">
                  <span>VOL. CLXXIV • NO. 48,210</span>
                  <span class="masthead-sub-bold">ACTUAL NEWSPAPER EXCERPTS</span>
                  <span>SLIDE 03 / 03</span>
                </div>
                <div class="masthead-rule-bottom"></div>
              </div>

              <div class="receipts-headline-box">
                <div class="receipts-headline">\${origHeadline}</div>
                <div class="receipts-byline">
                  <span>BY SPECIAL CORRESPONDENT & WIRE BUREAU</span>
                  <span class="receipts-archive-tag">VERIFIED ARCHIVE</span>
                </div>
                <div class="receipts-hairline"></div>
              </div>

              <div class="receipts-article-flow">
                <div style="flex: 1; min-height: 6px; max-height: 16px;"></div>
                <p class="receipts-p1">\${p1}</p>
                <div style="flex: 2; min-height: 12px; max-height: 24px;"></div>
                <div class="receipts-highlighter-box">
                  <div class="highlighter-label">
                    <span>✏️</span> KEY SECTION EXCERPT
                  </div>
                  <div class="highlighter-text">“\${p2}”</div>
                </div>
                <div style="flex: 2; min-height: 12px; max-height: 24px;"></div>
                \${p3 ? `<p class="receipts-p3">\${p3}</p>` : ''}
                <div style="flex: 1; min-height: 6px; max-height: 16px;"></div>
              </div>

              <div class="receipts-folio">
                <div class="receipts-folio-rule"></div>
                <div class="receipts-folio-text">
                  <span>AUTHENTIC ARTICLE EXCERPTS • PRIMARY SOURCE</span>
                  <span>ARCHIVED BY \${handle} • EDITOUR.APP</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Carousel Navigation Arrows -->
          <button class="carousel-nav-btn prev" onclick="event.stopPropagation(); prevSlide(\${index})" aria-label="Previous Slide">‹</button>
          <button class="carousel-nav-btn next" onclick="event.stopPropagation(); nextSlide(\${index})" aria-label="Next Slide">›</button>
        </div>

        <!-- Instagram Action Bar -->
        <div class="action-bar">
          <div class="action-group-left">
            <button class="action-btn" onclick="toggleLike(this)" title="Like Poster">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
              <span class="like-count">42</span>
            </button>
            <button class="icon-action-btn" onclick="copyCardShareLink('\${post.id || index}')" title="Share story link">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
              </svg>
            </button>
            <!-- Clean Art Toggle (Show/Hide text overlays directly on feed) -->
            <button class="icon-action-btn clean-view-btn \${isClean ? 'active' : ''}" id="clean-btn-\${index}" onclick="toggleCleanView(event, \${index})" title="\${isClean ? 'Show text overlays' : 'Clean artwork (hide text)'}">
              \${isClean
                ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                     <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                     <line x1="1" y1="1" x2="23" y2="23"></line>
                   </svg>`
                : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                     <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                     <circle cx="12" cy="12" r="3"></circle>
                   </svg>`}
            </button>
            <div class="carousel-dots-container" id="dots-\${index}">
              <span class="dot-indicator active" onclick="goToSlide(\${index}, 0)"></span>
              <span class="dot-indicator" onclick="goToSlide(\${index}, 1)"></span>
              <span class="dot-indicator" onclick="goToSlide(\${index}, 2)"></span>
            </div>
          </div>

          <!-- Minimalist Action Icons: Book Cover, World Web Link, Newspaper Paper Cut -->
          <div class="action-group-right">
            \${isBook ? `
              <button class="icon-action-btn" onclick="openDetailModal(\${index})" title="View Book Cover & Source">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                </svg>
              </button>
            ` : ''}
            \${digitalUrl ? `
              <a href="\${digitalUrl}" target="_blank" rel="noopener noreferrer" class="icon-action-btn" title="Open Web Article (\${cleanDomain(digitalUrl)})">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#0284C7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="2" y1="12" x2="22" y2="12"></line>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                </svg>
              </a>
            ` : ''}
            \${hasPaperCut ? `
              <button class="icon-action-btn" onclick="openPaperCutModal(\${index})" title="View Paper Cut (\${pubName})">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"></path>
                  <path d="M18 14h-8"></path>
                  <path d="M15 18h-5"></path>
                  <path d="M10 6h8v4h-8V6Z"></path>
                </svg>
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Post Content Details (Caption Style matching mobile 1:1) -->
        <div class="post-content">
          <div class="post-summary-snippet" onclick="openDetailModal(\${index})" style="cursor:pointer;">
            <span class="post-creator-handle"><strong>\${handle}</strong></span>
            <span class="post-caption-text">\${getStartingLines(summary)}</span>
            <button class="read-more-btn" onclick="event.stopPropagation(); openDetailModal(\${index})">... more</button>
          </div>
        </div>
      `;

      return card;
    }

    function goToSlide(postIndex, slideIndex) {
      if (slideIndex < 0 || slideIndex > 2) return;
      postSlideState[postIndex] = slideIndex;
      const track = document.getElementById('track-' + postIndex);
      if (track) {
        track.style.transform = `translateX(-\${slideIndex * 100}%)`;
      }
      const dotsContainer = document.getElementById('dots-' + postIndex);
      if (dotsContainer) {
        const dots = dotsContainer.querySelectorAll('.dot-indicator');
        dots.forEach((dot, idx) => {
          dot.classList.toggle('active', idx === slideIndex);
        });
      }
    }

    function nextSlide(postIndex) {
      const cur = postSlideState[postIndex] || 0;
      goToSlide(postIndex, (cur + 1) % 3);
    }

    function prevSlide(postIndex) {
      const cur = postSlideState[postIndex] || 0;
      goToSlide(postIndex, (cur + 2) % 3);
    }

    function initTouchSwipe(viewport, postIndex) {
      if (!viewport) return;
      let startX = 0;
      let startY = 0;
      viewport.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      }, { passive: true });

      viewport.addEventListener('touchend', e => {
        const diffX = e.changedTouches[0].clientX - startX;
        const diffY = e.changedTouches[0].clientY - startY;
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
          if (diffX < 0) {
            nextSlide(postIndex);
          } else {
            prevSlide(postIndex);
          }
        }
      }, { passive: true });
    }

    function toggleLike(btn) {
      btn.classList.toggle('liked');
      const countSpan = btn.querySelector('.like-count');
      let val = parseInt(countSpan.textContent, 10);
      if (btn.classList.contains('liked')) {
        countSpan.textContent = val + 1;
      } else {
        countSpan.textContent = Math.max(0, val - 1);
      }
    }

    function openDetailModal(index) {
      const post = allPosts[index];
      if (!post) return;

      document.getElementById('modalAudienceBadge').textContent = '🎯 Target: ' + (post.targetAudience || 'General Audience');
      document.getElementById('modalTitle').textContent = post.adaptedHeadline || post.originalHeadline || 'Story Overview';
      document.getElementById('modalWhyText').textContent = post.whyItMatters || 'Essential high-signal insight for ' + (post.targetAudience || 'readers') + '.';
      
      const listEl = document.getElementById('modalTakeawaysList');
      listEl.innerHTML = '';
      const takeaways = post.keyTakeaways || [];
      takeaways.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="bullet-icon">✓</span> <span>\${item}</span>`;
        listEl.appendChild(li);
      });

      document.getElementById('modalSummary').textContent = post.summary || 'Summary unavailable.';
      document.getElementById('modalPubSource').textContent = 'Publication: ' + (post.publicationName || 'Press Wire');

      const extLink = document.getElementById('modalExternalLink');
      if (post.digitalLink) {
        extLink.href = post.digitalLink;
        extLink.style.display = 'inline-flex';
      } else {
        extLink.style.display = 'none';
      }

      const modal = document.getElementById('detailModal');
      modal.classList.add('open');
    }

    function closeDetailModal() {
      document.getElementById('detailModal').classList.remove('open');
    }

    function openPaperCutModal(index) {
      const post = allPosts[index];
      if (!post || !post.originalPhotoPath) return;

      const imgEl = document.getElementById('paperCutImg');
      if (post.originalPhotoPath.startsWith('http') || post.originalPhotoPath.startsWith('data:')) {
        imgEl.src = post.originalPhotoPath;
      } else {
        // Request from embedded image endpoint
        imgEl.src = '/image/' + encodeURIComponent(post.originalPhotoPath);
      }
      document.getElementById('paperCutModal').classList.add('open');
    }

    function closePaperCutModal() {
      document.getElementById('paperCutModal').classList.remove('open');
    }

    // Filter pill click listeners
    document.querySelectorAll('.filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        currentFilter = pill.getAttribute('data-cat');
        renderFeed();
      });
    });

    // Auto-refresh feed from local server API every 10 seconds
    setInterval(async () => {
      try {
        const resp = await fetch('/api/feed');
        if (resp.ok) {
          const data = await resp.json();
          if (data && data.posts && data.posts.length !== allPosts.length) {
            allPosts = data.posts;
            renderFeed();
          }
        }
      } catch (_) {}
    }, 10000);

    // Initial render
    renderFeed();
  </script>
</body>
</html>
''';
  }
}
