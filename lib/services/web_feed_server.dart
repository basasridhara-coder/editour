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

  /// Builds a self-contained, responsive Instagram-like Web Page
  static String buildWebFeedHtml(List<PostCardItem> items, {int serverPort = 8080}) {
    final postsJson = json.encode(items.map((e) => e.toMap()).toList());

    return '''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>PostCard • Visual Editorial & Infographic Feed</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Playfair+Display:ital,wght@0,600;0,700;1,400;1,600&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-base: #07090E;
      --bg-surface: #0F141F;
      --bg-card: #141A29;
      --bg-card-hover: #192133;
      --border-subtle: rgba(255, 255, 255, 0.08);
      --border-focus: rgba(99, 102, 241, 0.4);
      --primary: #6366F1;
      --primary-gradient: linear-gradient(135deg, #6366F1 0%, #4F46E5 100%);
      --accent-cyan: #06B6D4;
      --accent-emerald: #10B981;
      --accent-rose: #F43F5E;
      --accent-amber: #F59E0B;
      --text-primary: #F8FAFC;
      --text-secondary: #94A3B8;
      --text-muted: #64748B;
      --shadow-card: 0 10px 30px -10px rgba(0, 0, 0, 0.6);
      --radius-card: 20px;
      --radius-sm: 8px;
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
        radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.06) 0%, transparent 40%),
        radial-gradient(circle at 90% 80%, rgba(6, 182, 212, 0.05) 0%, transparent 40%);
      background-attachment: fixed;
    }

    /* Top Sticky Navigation Bar */
    header {
      position: sticky;
      top: 0;
      width: 100%;
      background: rgba(7, 9, 14, 0.88);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--border-subtle);
      z-index: 100;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .nav-inner {
      width: 100%;
      max-width: 640px;
      padding: 14px 18px;
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
      background: linear-gradient(135deg, #4338CA, #6366F1, #06B6D4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      color: #fff;
      font-size: 18px;
      box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
    }

    .brand-title {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #FFF;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .brand-subtitle {
      font-size: 10px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--accent-cyan);
      font-weight: 700;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .badge-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 11px;
      border-radius: var(--radius-pill);
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.25);
      color: #34D399;
      font-size: 11px;
      font-weight: 600;
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
      max-width: 640px;
      padding: 0 16px 12px;
      display: flex;
      gap: 8px;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .filter-bar::-webkit-scrollbar { display: none; }

    .filter-pill {
      white-space: nowrap;
      padding: 6px 14px;
      border-radius: var(--radius-pill);
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .filter-pill:hover, .filter-pill.active {
      background: rgba(99, 102, 241, 0.15);
      border-color: var(--primary);
      color: #FFF;
    }

    /* Main Feed Layout (Instagram Proportions) */
    .feed-container {
      width: 100%;
      max-width: 600px;
      display: flex;
      flex-direction: column;
      gap: 24px;
      padding: 20px 14px;
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
      border-color: rgba(255, 255, 255, 0.14);
    }

    /* Card Top Header */
    .post-header {
      padding: 14px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .creator-info {
      display: flex;
      align-items: center;
      gap: 11px;
    }

    .creator-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: linear-gradient(135deg, #EC4899, #8B5CF6, #3B82F6);
      padding: 2px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .avatar-inner {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: #0F172A;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      color: #FFF;
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
      font-weight: 700;
      font-size: 13.5px;
      color: #FFF;
    }

    .post-time {
      font-size: 12px;
      color: var(--text-muted);
    }

    .pub-source-badge {
      font-size: 11px;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 1px;
    }

    .category-tag {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      padding: 3px 8px;
      border-radius: 6px;
      background: rgba(99, 102, 241, 0.15);
      color: #A5B4FC;
      border: 1px solid rgba(99, 102, 241, 0.25);
    }

    /* Hero Poster / Infographic Canvas (Instagram 4:5 or 1:1) */
    .poster-canvas {
      position: relative;
      width: 100%;
      aspect-ratio: 4 / 4.75;
      background: #0B0E17;
      overflow: hidden;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .poster-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: transform 0.4s ease;
    }
    .post-card:hover .poster-img {
      transform: scale(1.02);
    }

    /* High-contrast Graphic Infographic Overlay */
    .infographic-banner {
      width: 100%;
      height: 100%;
      padding: 24px 20px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      background: linear-gradient(170deg, #111827 0%, #0F172A 50%, #090D16 100%);
    }

    .banner-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      z-index: 2;
    }

    .audience-pill {
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(8px);
      padding: 5px 10px;
      border-radius: var(--radius-pill);
      font-size: 11px;
      font-weight: 600;
      color: #E2E8F0;
      border: 1px solid rgba(255, 255, 255, 0.15);
    }

    .style-pill {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--accent-cyan);
    }

    .banner-center {
      z-index: 2;
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: auto 0;
    }

    .metric-badge {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
      background: rgba(99, 102, 241, 0.18);
      border: 1px solid rgba(99, 102, 241, 0.4);
      padding: 8px 14px;
      border-radius: 12px;
      max-width: fit-content;
    }

    .metric-val {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 26px;
      font-weight: 800;
      color: #FFF;
      line-height: 1;
    }

    .metric-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #A5B4FC;
    }

    .canvas-headline {
      font-size: 24px;
      font-weight: 800;
      line-height: 1.25;
      letter-spacing: -0.5px;
      color: #FFFFFF;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
    }

    .canvas-quote {
      font-family: 'Playfair Display', serif;
      font-style: italic;
      font-size: 14.5px;
      line-height: 1.4;
      color: rgba(255, 255, 255, 0.85);
      border-left: 2px solid var(--accent-cyan);
      padding-left: 10px;
    }

    .banner-bottom {
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 2;
    }

    .mood-text {
      font-size: 11px;
      color: var(--text-muted);
      letter-spacing: 0.5px;
    }

    /* Action Toolbar (Like, Comment, Paper Cut, Web Link, Share) */
    .action-bar {
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .action-group-left {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .action-btn {
      background: none;
      border: none;
      color: var(--text-secondary);
      font-size: 13px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
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

    .tag-action-btn {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border-subtle);
      color: #E2E8F0;
      border-radius: var(--radius-pill);
      padding: 5px 11px;
      font-size: 11.5px;
      font-weight: 600;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .tag-action-btn:hover {
      background: rgba(99, 102, 241, 0.2);
      border-color: var(--primary);
      color: #FFF;
    }

    /* Post Content Details */
    .post-content {
      padding: 14px 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .post-headline {
      font-size: 16.5px;
      font-weight: 800;
      color: #FFF;
      line-height: 1.35;
      letter-spacing: -0.3px;
    }

    .post-hook {
      font-family: 'Playfair Display', serif;
      font-style: italic;
      font-size: 14px;
      color: #CBD5E1;
      line-height: 1.45;
    }

    .post-summary-snippet {
      font-size: 13.5px;
      line-height: 1.55;
      color: var(--text-secondary);
      margin-top: 2px;
    }

    .read-more-btn {
      color: var(--primary);
      background: none;
      border: none;
      font-size: 13px;
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
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(8px);
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
      max-width: 620px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 18px;
      position: relative;
    }

    .modal-close {
      position: absolute;
      top: 18px;
      right: 18px;
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
      padding: 5px 12px;
      border-radius: var(--radius-pill);
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.3);
      color: #A5B4FC;
      font-size: 12px;
      font-weight: 700;
      max-width: fit-content;
    }

    .modal-title {
      font-size: 22px;
      font-weight: 800;
      line-height: 1.3;
      color: #FFF;
    }

    .modal-why-box {
      background: rgba(6, 182, 212, 0.08);
      border-left: 3px solid var(--accent-cyan);
      padding: 12px 16px;
      border-radius: 4px 12px 12px 4px;
      font-size: 13.5px;
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
      font-size: 13.5px;
      color: #CBD5E1;
      line-height: 1.5;
    }
    .modal-takeaways-list li span.bullet-icon {
      color: var(--accent-emerald);
      font-weight: 800;
      font-size: 15px;
      line-height: 1.2;
    }

    .modal-full-summary {
      font-size: 14px;
      line-height: 1.7;
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
        <div class="brand-logo">P</div>
        <div class="brand-text">
          <div class="brand-title">PostCard</div>
          <div class="brand-subtitle">Editorial Poster Feed</div>
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

      <div style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted);">
        Key Takeaways
      </div>
      <ul class="modal-takeaways-list" id="modalTakeawaysList"></ul>

      <div style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted); margin-top:8px;">
        Curator's Full Analysis
      </div>
      <div class="modal-full-summary" id="modalSummary"></div>

      <div style="margin-top:12px; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:12px; color:var(--text-muted);" id="modalPubSource">Source: Reuters</span>
        <a id="modalExternalLink" href="#" target="_blank" class="tag-action-btn">
          🌐 View Original Web Article &nearr;
        </a>
      </div>
    </div>
  </div>

  <!-- Paper Cut Lightbox Modal -->
  <div class="modal-overlay" id="paperCutModal">
    <div class="modal-card" style="max-width: 700px; padding: 18px;">
      <button class="modal-close" onclick="closePaperCutModal()">&times;</button>
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
        <span style="font-size:16px;">📰</span>
        <strong style="font-size:15px; color:#FFF;">Original Physical Newspaper Clipping</strong>
      </div>
      <div class="lightbox-img-wrap">
        <img id="paperCutImg" class="lightbox-img" src="" alt="Physical Newspaper Clipping">
      </div>
      <div style="font-size:12px; color:var(--text-muted); margin-top:10px; text-align:center;">
        Captured & digitized via PostCard Computer Vision OCR
      </div>
    </div>
  </div>

  <!-- Embedded Posts Data & Interactive Logic -->
  <script>
    window.__POSTCARD_INITIAL_FEED__ = $postsJson;

    let allPosts = window.__POSTCARD_INITIAL_FEED__ || [];
    let currentFilter = 'all';

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
            <div style="font-size:13px; margin-top:4px;">Snap a newspaper clipping or paste a news link in the PostCard app!</div>
          </div>
        `;
        return;
      }

      filtered.forEach((post, index) => {
        const card = createPostCardElement(post, index);
        container.appendChild(card);
      });
    }

    function createPostCardElement(post, index) {
      const card = document.createElement('article');
      card.className = 'post-card';

      const handle = post.creatorHandle || '@curator';
      const initial = handle.replace('@', '').charAt(0).toUpperCase() || 'C';
      const pubName = post.publicationName || 'Press Wire';
      const catBadge = post.categoryBadge || 'DISCOVERY';
      const audience = post.targetAudience || 'General Audience';
      const headline = post.adaptedHeadline || post.originalHeadline || 'Untitled Story';
      const hook = post.hook || '';
      const summary = post.summary || '';
      const metric = post.keyMetric || '';
      const quote = post.pullQuote || '';
      const isBook = post.sourceType === 'book_excerpt';
      const hasPaperCut = post.originalPhotoPath && !post.originalPhotoPath.startsWith('http') && post.originalPhotoPath !== 'digital_article_link' && post.originalPhotoPath !== 'book_excerpt_reading';
      const digitalUrl = post.digitalLink || '';

      // Check if image illustration exists
      let heroVisualHtml = '';
      if (post.illustrationBase64) {
        heroVisualHtml = `
          <div class="poster-canvas" onclick="openDetailModal(\${index})">
            <img class="poster-img" src="data:image/jpeg;base64,\${post.illustrationBase64}" alt="\${headline}">
          </div>
        `;
      } else {
        // Render High-impact Infographic Typography Canvas
        heroVisualHtml = `
          <div class="poster-canvas" onclick="openDetailModal(\${index})">
            <div class="infographic-banner">
              <div class="banner-top">
                <span class="audience-pill">🎯 \${audience}</span>
                <span class="style-pill">\${post.posterStyle || 'EDITORIAL'}</span>
              </div>
              <div class="banner-center">
                \${metric ? `
                  <div class="metric-badge">
                    <span class="metric-val">\${metric}</span>
                    <span class="metric-label">Key Signal</span>
                  </div>
                ` : ''}
                <h3 class="canvas-headline">\${headline}</h3>
                \${quote ? `<p class="canvas-quote">"\${quote}"</p>` : ''}
              </div>
              <div class="banner-bottom">
                <span class="mood-text">✦ \${post.visualMood || 'Visual Editorial Poster'}</span>
                <span style="font-size:11px; font-weight:700; color:#A5B4FC;">POSTCARD AI</span>
              </div>
            </div>
          </div>
        `;
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
                <span class="post-time">• Today</span>
              </div>
              <div class="pub-source-badge">
                <span>\${isBook ? '📖' : '📰'}</span>
                <span>\${pubName}</span>
              </div>
            </div>
          </div>
          <span class="category-tag">\${catBadge}</span>
        </div>

        \${heroVisualHtml}

        <div class="action-bar">
          <div class="action-group-left">
            <button class="action-btn" onclick="toggleLike(this)">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
              <span class="like-count">42</span>
            </button>
            <button class="action-btn" onclick="openDetailModal(\${index})">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              <span>Distill</span>
            </button>
            \${hasPaperCut ? `
              <button class="tag-action-btn" onclick="openPaperCutModal(\${index})">
                📰 Paper Cut
              </button>
            ` : ''}
          </div>
          <div>
            \${digitalUrl ? `
              <a href="\${digitalUrl}" target="_blank" class="tag-action-btn" title="Open verified web article">
                🌐 Article &nearr;
              </a>
            ` : ''}
          </div>
        </div>

        <div class="post-content">
          <div class="post-headline">\${headline}</div>
          \${hook ? `<div class="post-hook">\${hook}</div>` : ''}
          <div class="post-summary-snippet">
            \${summary.substring(0, 150)}...
            <button class="read-more-btn" onclick="openDetailModal(\${index})">more</button>
          </div>
        </div>
      `;

      return card;
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

      document.getElementById('modalAudienceBadge').textContent = '🎯 Target: ' + (post.targetAudience || 'General');
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
