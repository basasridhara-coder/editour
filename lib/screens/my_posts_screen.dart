import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/postcard_item.dart';
import '../models/poster_style_config.dart';
import '../services/share_service.dart';
import '../services/storage_service.dart';
import '../widgets/photo_viewer_dialog.dart';
import '../widgets/slant_source_sheet.dart';
import 'postcard_detail_screen.dart';

class MyPostsScreen extends StatefulWidget {
  const MyPostsScreen({super.key});

  @override
  State<MyPostsScreen> createState() => _MyPostsScreenState();
}

class _MyPostsScreenState extends State<MyPostsScreen> with SingleTickerProviderStateMixin {
  final StorageService _storageService = StorageService();
  final ShareService _shareService = ShareService();
  late TabController _tabController;

  List<PostCardItem> _items = [];
  bool _isLoading = true;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadItems();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadItems() async {
    setState(() => _isLoading = true);
    final items = await _storageService.getPostCards();
    setState(() {
      _items = items;
      _isLoading = false;
    });
  }

  List<PostCardItem> get _filteredItems {
    if (_searchQuery.isEmpty) return _items;
    final q = _searchQuery.toLowerCase();
    return _items.where((i) {
      return i.adaptedHeadline.toLowerCase().contains(q) ||
          i.summary.toLowerCase().contains(q) ||
          (i.publicationName != null && i.publicationName!.toLowerCase().contains(q)) ||
          i.targetAudience.toLowerCase().contains(q);
    }).toList();
  }

  List<PostCardItem> get _itemsWithRealPhotos {
    return _filteredItems.where((i) {
      return i.originalPhotoPath.isNotEmpty && i.originalPhotoPath != 'sample_asset_print';
    }).toList();
  }

  Future<void> _handleDelete(PostCardItem item) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Post?'),
        content: Text('Delete "${item.adaptedHeadline}"? This will remove the poster, saved snap, and delete it from editour.app.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      await _storageService.deletePostCard(item.id);
      _loadItems();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('🗑️ Post deleted from device and editour.app'),
            backgroundColor: Color(0xFF0F172A),
            duration: Duration(seconds: 2),
          ),
        );
      }
    }
  }

  void _openDetail(PostCardItem item) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (ctx) => PostcardDetailScreen(initialItem: item),
      ),
    );
    _loadItems();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'My Posts & Snaps',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(48),
          child: Container(
            color: theme.colorScheme.surface,
            child: TabBar(
              controller: _tabController,
              indicatorColor: theme.colorScheme.primary,
              labelColor: theme.colorScheme.primary,
              unselectedLabelColor: theme.colorScheme.onSurfaceVariant,
              tabs: [
                Tab(
                  icon: const Icon(Icons.grid_view_outlined, size: 16),
                  text: 'All Posts (${_filteredItems.length})',
                ),
                Tab(
                  icon: const Icon(Icons.photo_camera_outlined, size: 16),
                  text: 'My Snaps (${_itemsWithRealPhotos.length})',
                ),
                Tab(
                  icon: const Icon(Icons.auto_awesome_mosaic_outlined, size: 16),
                  text: 'Poster Art',
                ),
              ],
            ),
          ),
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                // Top Search Bar
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                  child: TextField(
                    decoration: InputDecoration(
                      hintText: 'Search my posts by headline, publication...',
                      prefixIcon: const Icon(Icons.search, size: 18),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      filled: true,
                      fillColor: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
                    ),
                    onChanged: (val) => setState(() => _searchQuery = val.trim()),
                  ),
                ),

                // Main Tab Content
                Expanded(
                  child: TabBarView(
                    controller: _tabController,
                    children: [
                      // Tab 1: All Posts (Snap + Poster paired timeline)
                      _buildAllPostsList(theme),

                      // Tab 2: Snaps Gallery (Original newspaper photos)
                      _buildSnapsGallery(theme),

                      // Tab 3: Poster Art Grid (Instagram cards)
                      _buildPostersGrid(theme),
                    ],
                  ),
                ),
              ],
            ),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'my_posts_create_fab',
        onPressed: () => SlantSourceSheet.show(context, onFinish: _loadItems),
        icon: const Icon(Icons.bolt_rounded, color: Colors.white, size: 22),
        label: const Text('Slant', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Colors.white)),
        backgroundColor: Theme.of(context).colorScheme.primary,
      ),
    );
  }

  Widget _buildAllPostsList(ThemeData theme) {
    if (_filteredItems.isEmpty) {
      return _buildEmptyState(
        icon: Icons.newspaper_outlined,
        title: 'No Posts Found',
        subtitle: 'Snap a physical newspaper or magazine article to create your first visual poster.',
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      itemCount: _filteredItems.length,
      itemBuilder: (context, index) {
        final item = _filteredItems[index];
        final timeStr = DateFormat('MMM d, yyyy • h:mm a').format(item.createdAt);
        final styleConfig = PosterStyleConfig.getPreset(item.posterStyle);

        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          elevation: 1,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: () => _openDetail(item),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Header Row: Publication + Date + Delete
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                        decoration: BoxDecoration(
                          color: styleConfig.primaryColor.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          item.categoryBadge.toUpperCase(),
                          style: TextStyle(
                            fontSize: 9.5,
                            fontWeight: FontWeight.w800,
                            color: styleConfig.primaryColor,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          item.publicationName ?? 'Physical Press',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      Text(
                        timeStr,
                        style: TextStyle(fontSize: 10, color: theme.colorScheme.outline),
                      ),
                      IconButton(
                        icon: const Icon(Icons.delete_outline, size: 18, color: Colors.grey),
                        onPressed: () => _handleDelete(item),
                        tooltip: 'Delete',
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),

                  // Dual Thumbnail: Newspaper Snap & Generated Art
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Newspaper Snap or Digital Link Thumbnail
                      GestureDetector(
                        onTap: () {
                          if (item.isDigitalLinkSource) {
                            if (item.digitalLink != null && item.digitalLink!.isNotEmpty) {
                              launchUrl(Uri.parse(item.digitalLink!), mode: LaunchMode.externalApplication);
                            }
                          } else {
                            PhotoViewerDialog.show(
                              context,
                              photoPath: item.originalPhotoPath,
                              headline: 'Physical Snap: ${item.originalHeadline ?? item.publicationName}',
                            );
                          }
                        },
                        child: Stack(
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(10),
                              child: Container(
                                width: 85,
                                height: 85,
                                color: Colors.grey.shade300,
                                child: _buildSnapThumbnail(item.originalPhotoPath),
                              ),
                            ),
                            Positioned(
                              bottom: 4,
                              right: 4,
                              child: Container(
                                padding: const EdgeInsets.all(3),
                                decoration: BoxDecoration(
                                  color: Colors.black.withValues(alpha: 0.65),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Icon(
                                  item.isDigitalLinkSource ? Icons.open_in_new : Icons.zoom_in,
                                  size: 12,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),

                      // Headline + Hook Info
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item.adaptedHeadline,
                              style: const TextStyle(
                                fontSize: 13.5,
                                fontWeight: FontWeight.bold,
                                height: 1.25,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 4),
                            Text(
                              item.hook,
                              style: TextStyle(
                                fontSize: 11,
                                height: 1.3,
                                color: theme.colorScheme.onSurfaceVariant,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 6),
                            Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: theme.colorScheme.surfaceContainerHighest,
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(
                                    '${(item.visualArtRatio * 100).round()}% Art',
                                    style: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold),
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    '• ${item.targetAudience}',
                                    style: TextStyle(
                                      fontSize: 10,
                                      color: theme.colorScheme.onSurfaceVariant,
                                    ),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),

                  // Bottom Action Strip
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          visualDensity: VisualDensity.compact,
                          padding: const EdgeInsets.symmetric(horizontal: 10),
                        ),
                        onPressed: () => _shareService.sharePostCard(item: item),
                        icon: const Icon(Icons.share, size: 14),
                        label: const Text('Share', style: TextStyle(fontSize: 11)),
                      ),
                      const SizedBox(width: 8),
                      FilledButton.tonalIcon(
                        style: FilledButton.styleFrom(
                          visualDensity: VisualDensity.compact,
                          padding: const EdgeInsets.symmetric(horizontal: 10),
                        ),
                        onPressed: () => _openDetail(item),
                        icon: const Icon(Icons.arrow_forward, size: 14),
                        label: const Text('View Poster', style: TextStyle(fontSize: 11)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildSnapsGallery(ThemeData theme) {
    final snaps = _itemsWithRealPhotos;
    if (snaps.isEmpty) {
      return _buildEmptyState(
        icon: Icons.camera_alt_outlined,
        title: 'No Physical Snaps Yet',
        subtitle: 'Camera snapshots of newspapers and magazines you take will be saved here in your physical archive.',
      );
    }

    return GridView.builder(
      padding: const EdgeInsets.all(12),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 10,
        mainAxisSpacing: 10,
        childAspectRatio: 0.85,
      ),
      itemCount: snaps.length,
      itemBuilder: (context, index) {
        final item = snaps[index];
        return GestureDetector(
          onTap: () {
            PhotoViewerDialog.show(
              context,
              photoPath: item.originalPhotoPath,
              headline: item.originalHeadline ?? item.publicationName,
            );
          },
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: Colors.black12,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.08),
                  blurRadius: 6,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: Stack(
              fit: StackFit.expand,
              children: [
                _buildSnapThumbnail(item.originalPhotoPath),
                Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.black.withValues(alpha: 0.1),
                        Colors.transparent,
                        Colors.black.withValues(alpha: 0.8),
                      ],
                      stops: const [0.0, 0.5, 1.0],
                    ),
                  ),
                ),
                Positioned(
                  bottom: 8,
                  left: 8,
                  right: 8,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        item.publicationName ?? 'Newspaper Snap',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        DateFormat('MMM d').format(item.createdAt),
                        style: const TextStyle(color: Colors.white70, fontSize: 9.5),
                      ),
                    ],
                  ),
                ),
                Positioned(
                  top: 6,
                  right: 6,
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.6),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Icon(Icons.zoom_in, size: 14, color: Colors.white),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildPostersGrid(ThemeData theme) {
    if (_filteredItems.isEmpty) {
      return _buildEmptyState(
        icon: Icons.auto_awesome,
        title: 'No Posters Yet',
        subtitle: 'Posters you generate will appear here in your visual poster gallery.',
      );
    }

    return GridView.builder(
      padding: const EdgeInsets.all(12),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 10,
        mainAxisSpacing: 10,
        childAspectRatio: 0.72,
      ),
      itemCount: _filteredItems.length,
      itemBuilder: (context, index) {
        final item = _filteredItems[index];
        final styleConfig = PosterStyleConfig.getPreset(item.posterStyle);

        return GestureDetector(
          onTap: () => _openDetail(item),
          child: Container(
            decoration: BoxDecoration(
              color: styleConfig.backgroundColor,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5),
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.08),
                  blurRadius: 8,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            padding: const EdgeInsets.all(10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Flexible(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                        decoration: BoxDecoration(
                          color: styleConfig.primaryColor,
                          borderRadius: BorderRadius.circular(3),
                        ),
                        child: Text(
                          item.categoryBadge.toUpperCase(),
                          style: const TextStyle(fontSize: 7.5, color: Colors.white, fontWeight: FontWeight.bold),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '${(item.visualArtRatio * 100).round()}% Art',
                      style: TextStyle(
                        fontSize: 8,
                        fontWeight: FontWeight.bold,
                        color: styleConfig.primaryColor,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),

                // Poster Art Preview Box
                Expanded(
                  child: Container(
                    width: double.infinity,
                    decoration: BoxDecoration(
                      color: Colors.black12,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: _buildPosterGridVisual(item, styleConfig),
                  ),
                ),
                const SizedBox(height: 8),

                Text(
                  item.adaptedHeadline,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: styleConfig.textColor,
                    height: 1.2,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Text(
                  item.targetAudience,
                  style: TextStyle(
                    fontSize: 9,
                    color: styleConfig.textColor.withValues(alpha: 0.6),
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildSnapThumbnail(String path) {
    if (path.startsWith('http') || path == 'digital_article_link') {
      return Container(
        color: const Color(0xFFE0F2FE),
        child: const Center(
          child: Icon(Icons.language, size: 36, color: Color(0xFF0284C7)),
        ),
      );
    }
    if (path == 'sample_asset_print' || path.isEmpty) {
      return Container(
        color: const Color(0xFFE8DFD0),
        child: const Center(
          child: Icon(Icons.newspaper, size: 36, color: Color(0xFF7A6B5C)),
        ),
      );
    }
    if (!kIsWeb && File(path).existsSync()) {
      return Image.file(File(path), fit: BoxFit.cover);
    }
    return Container(
      color: Colors.grey.shade300,
      child: const Center(child: Icon(Icons.broken_image, size: 28, color: Colors.grey)),
    );
  }

  Widget _buildPosterGridVisual(PostCardItem item, PosterStyleConfig config) {
    if (item.illustrationBase64 != null && item.illustrationBase64!.isNotEmpty) {
      try {
        return Image.memory(base64Decode(item.illustrationBase64!), fit: BoxFit.cover);
      } catch (_) {}
    }
    if (item.renderedPosterPath != null && File(item.renderedPosterPath!).existsSync()) {
      return Image.file(File(item.renderedPosterPath!), fit: BoxFit.cover);
    }
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            config.primaryColor.withValues(alpha: 0.8),
            config.secondaryColor.withValues(alpha: 0.8),
          ],
        ),
      ),
      child: Center(
        child: Icon(
          Icons.auto_awesome,
          size: 28,
          color: Colors.white.withValues(alpha: 0.85),
        ),
      ),
    );
  }

  Widget _buildEmptyState({
    required IconData icon,
    required String title,
    required String subtitle,
  }) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 64, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text(
              title,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
            ),
          ],
        ),
      ),
    );
  }
}
