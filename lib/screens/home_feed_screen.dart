import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/postcard_item.dart';
import '../models/sample_articles.dart';
import '../services/editour_cloud_service.dart';
import '../services/share_service.dart';
import '../services/storage_service.dart';
import '../services/web_feed_server.dart';
import '../widgets/instagram_post_card_widget.dart';
import 'create_postcard_screen.dart';
import 'postcard_detail_screen.dart';
import 'settings_screen.dart';

class HomeFeedScreen extends StatefulWidget {
  const HomeFeedScreen({super.key});

  @override
  State<HomeFeedScreen> createState() => _HomeFeedScreenState();
}

class _HomeFeedScreenState extends State<HomeFeedScreen> {
  final StorageService _storageService = StorageService();
  final ShareService _shareService = ShareService();

  List<PostCardItem> _items = [];
  bool _isLoading = true;
  String _searchQuery = '';
  String _selectedCategory = 'ALL';

  @override
  void initState() {
    super.initState();
    _loadItems();
  }

  Future<void> _loadItems() async {
    setState(() => _isLoading = true);
    final items = await _storageService.getPostCards();
    setState(() {
      _items = items;
      _isLoading = false;
    });

    // Seamlessly ensure any local physical clippings are synced with photo bytes to editour.app
    Future.microtask(() async {
      try {
        await EditourCloudService().reconcileWithCloud();
      } catch (_) {}
    });
  }

  List<PostCardItem> get _filteredItems {
    return _items.where((item) {
      final matchesSearch = _searchQuery.isEmpty ||
          item.adaptedHeadline.toLowerCase().contains(_searchQuery.toLowerCase()) ||
          item.summary.toLowerCase().contains(_searchQuery.toLowerCase()) ||
          (item.publicationName != null &&
              item.publicationName!.toLowerCase().contains(_searchQuery.toLowerCase())) ||
          item.targetAudience.toLowerCase().contains(_searchQuery.toLowerCase());

      final matchesCategory = _selectedCategory == 'ALL' ||
          item.categoryBadge.toUpperCase() == _selectedCategory.toUpperCase();

      return matchesSearch && matchesCategory;
    }).toList();
  }

  Set<String> get _categories {
    final set = {'ALL'};
    for (final item in _items) {
      if (item.categoryBadge.isNotEmpty) {
        set.add(item.categoryBadge.toUpperCase());
      }
    }
    return set;
  }

  void _openCreateScreen({SampleArticle? preloadedSample}) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (ctx) => CreatePostcardScreen(preloadedSample: preloadedSample),
      ),
    );
    _loadItems();
  }

  void _openDetailScreen(PostCardItem item) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (ctx) => PostcardDetailScreen(initialItem: item),
      ),
    );
    _loadItems();
  }

  Future<void> _handleShare(PostCardItem item) async {
    await _shareService.sharePostCard(item: item);
  }

  Future<void> _handleDelete(PostCardItem item) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete PostCard?'),
        content: Text('Are you sure you want to delete "${item.adaptedHeadline}"? This will also remove it from editour.app.'),
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

  void _showWebFeedSheet() async {
    final server = WebFeedServer();
    final networkUrl = await server.getNetworkUrl();
    final localUrl = server.localUrl;
    final isRunning = server.isRunning;

    if (!mounted) return;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0F172A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setSheetState) {
            return SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Center(
                      child: Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: Colors.white24,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              colors: [Color(0xFF4338CA), Color(0xFF6366F1), Color(0xFF06B6D4)],
                            ),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(Icons.language_rounded, color: Colors.white, size: 24),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'PostCard Web Feed',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 18,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              Row(
                                children: [
                                  Container(
                                    width: 8,
                                    height: 8,
                                    decoration: BoxDecoration(
                                      color: isRunning ? const Color(0xFF10B981) : Colors.orange,
                                      shape: BoxShape.circle,
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    isRunning ? 'Live Server Active' : 'Server Idle',
                                    style: TextStyle(
                                      color: isRunning ? const Color(0xFF34D399) : Colors.orange,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        if (!isRunning)
                          FilledButton.tonal(
                            onPressed: () async {
                              await server.start();
                              setSheetState(() {});
                            },
                            child: const Text('Start'),
                          ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E293B),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: Colors.white12),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'WEB BROWSER URL',
                            style: TextStyle(
                              color: Color(0xFF94A3B8),
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 1,
                            ),
                          ),
                          const SizedBox(height: 6),
                          SelectableText(
                            networkUrl,
                            style: const TextStyle(
                              color: Color(0xFF38BDF8),
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              fontFamily: 'monospace',
                            ),
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                child: OutlinedButton.icon(
                                  icon: const Icon(Icons.copy_rounded, size: 16),
                                  label: const Text('Copy Link'),
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: Colors.white,
                                    side: const BorderSide(color: Colors.white24),
                                  ),
                                  onPressed: () {
                                    Clipboard.setData(ClipboardData(text: networkUrl));
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(
                                        content: Text('📋 Web link copied to clipboard!'),
                                        duration: Duration(seconds: 2),
                                      ),
                                    );
                                  },
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: FilledButton.icon(
                                  icon: const Icon(Icons.open_in_browser_rounded, size: 16),
                                  label: const Text('Open Local'),
                                  style: FilledButton.styleFrom(
                                    backgroundColor: const Color(0xFF6366F1),
                                  ),
                                  onPressed: () async {
                                    final uri = Uri.parse(localUrl);
                                    await launchUrl(uri, mode: LaunchMode.externalApplication);
                                  },
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    // Public Cloud Domain: editour.app
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [
                            Color(0x334338CA),
                            Color(0xFF0F172A),
                          ],
                        ),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: const Color(0x666366F1)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Row(
                            children: [
                              Text(
                                'PUBLIC DOMAIN (editour.app)',
                                style: TextStyle(
                                  color: Color(0xFFA5B4FC),
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 1,
                                ),
                              ),
                              Spacer(),
                              Text(
                                '☁️ Cloud Sync',
                                style: TextStyle(
                                  color: Color(0xFF38BDF8),
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          const SelectableText(
                            'https://editour.app',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 12),
                          SizedBox(
                            width: double.infinity,
                            child: FilledButton.icon(
                              icon: const Icon(Icons.cloud_sync_rounded, size: 16),
                              label: const Text('Sync & Reconcile with editour.app'),
                              style: FilledButton.styleFrom(
                                backgroundColor: const Color(0xFF4F46E5),
                              ),
                              onPressed: () async {
                                Navigator.pop(ctx);
                                final messenger = ScaffoldMessenger.of(context);
                                messenger.showSnackBar(
                                  const SnackBar(
                                    content: Text('☁️ Reconciling feed with editour.app...'),
                                    duration: Duration(seconds: 3),
                                  ),
                                );
                                final result = await EditourCloudService().reconcileWithCloud();
                                if (mounted) {
                                  String msg = '🚀 Synced ${result.publishedCount} post(s) to editour.app!';
                                  if (result.deletedCount > 0) {
                                    msg = '🚀 Reconciled: ${result.publishedCount} synced, ${result.deletedCount} deleted post(s) removed!';
                                  }
                                  messenger.showSnackBar(
                                    SnackBar(
                                      content: Text(msg),
                                      backgroundColor: const Color(0xFF0F172A),
                                    ),
                                  );
                                }
                              },
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0x0AFFFFFF),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(Icons.usb_rounded, color: Color(0xFF38BDF8), size: 18),
                              SizedBox(width: 6),
                              Text(
                                'Computer / USB Connection Tip',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                          SizedBox(height: 4),
                          Text(
                            'Run "./run_web_feed.sh" or "adb reverse tcp:8080 tcp:8080" in terminal to browse your live feeds on your computer at http://localhost:8080!',
                            style: TextStyle(
                              color: Color(0xFF94A3B8),
                              fontSize: 11.5,
                              height: 1.4,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final displayedList = _filteredItems;

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: theme.colorScheme.primary,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.newspaper, color: Colors.white, size: 20),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Editour',
                    style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    'Visual Editorial & Social Feeds • editour.app',
                    style: TextStyle(fontSize: 10, color: theme.colorScheme.onSurfaceVariant),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.language_rounded),
            tooltip: 'Web Feed Server',
            onPressed: _showWebFeedSheet,
          ),
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            tooltip: 'Settings',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (ctx) => const SettingsScreen()),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openCreateScreen(),
        icon: const Icon(Icons.camera_alt),
        label: const Text('Snap & Summarize', style: TextStyle(fontWeight: FontWeight.bold)),
      ),
      body: RefreshIndicator(
        onRefresh: _loadItems,
        child: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : CustomScrollView(
                slivers: [
                  // Search & Quick Filter bar
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                      child: SearchBar(
                        hintText: 'Search headlines, publications, audience...',
                        leading: const Icon(Icons.search, size: 20),
                        elevation: const WidgetStatePropertyAll(1),
                        onChanged: (val) => setState(() => _searchQuery = val),
                      ),
                    ),
                  ),

                  // Categories Filter Chips
                  if (_categories.length > 1)
                    SliverToBoxAdapter(
                      child: SizedBox(
                        height: 48,
                        child: ListView(
                          scrollDirection: Axis.horizontal,
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          children: _categories.map((cat) {
                            final isSelected = _selectedCategory == cat;
                            return Padding(
                              padding: const EdgeInsets.only(right: 8),
                              child: ChoiceChip(
                                label: Text(cat),
                                selected: isSelected,
                                onSelected: (val) {
                                  if (val) setState(() => _selectedCategory = cat);
                                },
                              ),
                            );
                          }).toList(),
                        ),
                      ),
                    ),

                  // Quick Sample Newspaper Banner
                  SliverToBoxAdapter(
                    child: Container(
                      margin: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [
                            theme.colorScheme.primaryContainer.withValues(alpha: 0.5),
                            theme.colorScheme.secondaryContainer.withValues(alpha: 0.5),
                          ],
                        ),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.4)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.auto_awesome, color: Colors.amber),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'Reading a physical newspaper right now?',
                                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                                ),
                                Text(
                                  'Snap a photo to summarize into an audience-adapted poster!',
                                  style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurfaceVariant),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          FilledButton.tonal(
                            onPressed: () => _openCreateScreen(),
                            style: FilledButton.styleFrom(
                              visualDensity: VisualDensity.compact,
                              padding: const EdgeInsets.symmetric(horizontal: 10),
                            ),
                            child: const Text('Snap', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                          ),
                        ],
                      ),
                    ),
                  ),

                  // Empty State
                  if (displayedList.isEmpty)
                    SliverFillRemaining(
                      hasScrollBody: false,
                      child: Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.newspaper_outlined, size: 64, color: theme.colorScheme.outline),
                            const SizedBox(height: 16),
                            Text(
                              _searchQuery.isNotEmpty
                                  ? 'No matching PostCards found'
                                  : 'No PostCards yet',
                              style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'Snap your first physical article or try a sample',
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: theme.colorScheme.onSurfaceVariant,
                              ),
                            ),
                            const SizedBox(height: 16),
                            FilledButton.icon(
                              onPressed: () => _openCreateScreen(
                                preloadedSample: SampleArticle.samples.first,
                              ),
                              icon: const Icon(Icons.play_arrow),
                              label: const Text('Try Sample Newspaper Story'),
                            ),
                          ],
                        ),
                      ),
                    )
                  else
                    // Postcard List (Always Instagram Infographic Feed)
                    SliverList(
                      delegate: SliverChildBuilderDelegate(
                        (context, index) {
                          final item = displayedList[index];
                          return InstagramPostCardWidget(
                            item: item,
                            onTap: () => _openDetailScreen(item),
                            onShare: () => _handleShare(item),
                            onDelete: () => _handleDelete(item),
                          );
                        },
                        childCount: displayedList.length,
                      ),
                    ),

                  const SliverToBoxAdapter(
                    child: SizedBox(height: 100),
                  ),
                ],
              ),
      ),
    );
  }
}
