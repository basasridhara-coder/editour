import 'dart:typed_data';
import 'package:flutter/material.dart';
import '../../models/postcard_item.dart';
import '../../models/poster_style_config.dart';
import '../../services/share_service.dart';
import 'slide_hook_poster.dart';
import 'slide_critique_poster.dart';
import 'slide_receipts_poster.dart';

class CarouselPosterStudio extends StatefulWidget {
  final PostCardItem item;
  final PosterStyleConfig? config;
  final bool showShareActions;
  final VoidCallback? onRegeneratePosterArt;
  final VoidCallback? onRegenerateHeadline;
  final VoidCallback? onRegenerateAll;

  const CarouselPosterStudio({
    super.key,
    required this.item,
    this.config,
    this.showShareActions = true,
    this.onRegeneratePosterArt,
    this.onRegenerateHeadline,
    this.onRegenerateAll,
  });

  @override
  State<CarouselPosterStudio> createState() => _CarouselPosterStudioState();
}

class _CarouselPosterStudioState extends State<CarouselPosterStudio> {
  final PageController _pageController = PageController();
  int _currentPage = 0;
  bool _isExporting = false;

  final GlobalKey _captureKey1 = GlobalKey();
  final GlobalKey _captureKey2 = GlobalKey();
  final GlobalKey _captureKey3 = GlobalKey();

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  PosterStyleConfig get _resolvedConfig =>
      widget.config ?? PosterStyleConfig.getPreset(widget.item.posterStyle);

  Future<void> _shareAllSlides() async {
    if (_isExporting) return;
    setState(() => _isExporting = true);

    try {
      final shareService = ShareService();

      // Ensure layout and paint are complete
      await Future.delayed(const Duration(milliseconds: 100));

      final bytes1 = await shareService.captureWidgetToPng(_captureKey1);
      final bytes2 = await shareService.captureWidgetToPng(_captureKey2);
      final bytes3 = await shareService.captureWidgetToPng(_captureKey3);

      final validBytes = <Uint8List>[];
      if (bytes1 != null) validBytes.add(bytes1);
      if (bytes2 != null) validBytes.add(bytes2);
      if (bytes3 != null) validBytes.add(bytes3);

      if (validBytes.isNotEmpty && mounted) {
        await shareService.shareCarouselTrio(
          item: widget.item,
          slideBytes: validBytes,
        );
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not render carousel posters. Please try again.')),
        );
      }
    } catch (e) {
      debugPrint('Error capturing carousel slides: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error preparing posters: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isExporting = false);
      }
    }
  }

  Future<void> _saveAllSlides() async {
    if (_isExporting) return;
    setState(() => _isExporting = true);

    try {
      final shareService = ShareService();
      await Future.delayed(const Duration(milliseconds: 100));

      final bytes1 = await shareService.captureWidgetToPng(_captureKey1);
      final bytes2 = await shareService.captureWidgetToPng(_captureKey2);
      final bytes3 = await shareService.captureWidgetToPng(_captureKey3);

      final validBytes = <Uint8List>[];
      if (bytes1 != null) validBytes.add(bytes1);
      if (bytes2 != null) validBytes.add(bytes2);
      if (bytes3 != null) validBytes.add(bytes3);

      if (validBytes.isNotEmpty) {
        final savedPaths = await shareService.saveCarouselTrio(
          item: widget.item,
          slideBytes: validBytes,
        );
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Saved ${savedPaths.length} posters to device storage!'),
              backgroundColor: const Color(0xFF10B981),
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Save failed: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isExporting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final config = _resolvedConfig;

    return Stack(
      children: [
        // Hidden Offscreen Capture Rack (rendered at 720x900 for ultra-sharp 4:5 capture)
        Positioned(
          left: -99999,
          top: -99999,
          child: IgnorePointer(
            child: Column(
              children: [
                SizedBox(
                  width: 360,
                  height: 450,
                  child: RepaintBoundary(
                    key: _captureKey1,
                    child: SlideHookPoster(item: widget.item, config: config),
                  ),
                ),
                SizedBox(
                  width: 360,
                  height: 450,
                  child: RepaintBoundary(
                    key: _captureKey2,
                    child: SlideCritiquePoster(item: widget.item, config: config),
                  ),
                ),
                SizedBox(
                  width: 360,
                  height: 450,
                  child: RepaintBoundary(
                    key: _captureKey3,
                    child: SlideReceiptsPoster(item: widget.item, config: config),
                  ),
                ),
              ],
            ),
          ),
        ),

        // Main Visible Interactive Studio
        Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Studio Header Badge
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                color: const Color(0xFF1E293B).withValues(alpha: 0.6),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: config.primaryColor.withValues(alpha: 0.25),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Icon(Icons.auto_awesome, size: 14, color: Color(0xFF38BDF8)),
                  ),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      '3-POSTER CAROUSEL TRIO • WHATSAPP & INSTA',
                      style: TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.6,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '${_currentPage + 1} / 3',
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: Colors.white70,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Swipeable 4:5 Poster Deck
            AspectRatio(
              aspectRatio: 4 / 5,
              child: PageView(
                controller: _pageController,
                physics: const BouncingScrollPhysics(),
                onPageChanged: (idx) {
                  setState(() => _currentPage = idx);
                },
                children: [
                  SlideHookPoster(item: widget.item, config: config),
                  SlideCritiquePoster(item: widget.item, config: config),
                  SlideReceiptsPoster(item: widget.item, config: config),
                ],
              ),
            ),

            const SizedBox(height: 12),

            // Interactive Navigation Tabs / Indicators
            Row(
              children: [
                _buildSlideTab(0, '01 Visual Hook', Icons.image_outlined),
                const SizedBox(width: 6),
                _buildSlideTab(1, '02 Curator Take', Icons.bolt_outlined),
                const SizedBox(width: 6),
                _buildSlideTab(2, '03 Paper Excerpts', Icons.newspaper_rounded),
              ],
            ),

            // Specific Re-generation Quick Bar (Hook Art vs Headline Copy)
            if (widget.onRegeneratePosterArt != null || widget.onRegenerateHeadline != null) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B).withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                ),
                child: Row(
                  children: [
                    if (widget.onRegeneratePosterArt != null)
                      Expanded(
                        child: TextButton.icon(
                          onPressed: widget.onRegeneratePosterArt,
                          icon: const Icon(Icons.palette_outlined, size: 15, color: Color(0xFF38BDF8)),
                          label: const Text(
                            'Re-roll Hook Art',
                            style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF38BDF8),
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          style: TextButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 6),
                            visualDensity: VisualDensity.compact,
                          ),
                        ),
                      ),
                    if (widget.onRegeneratePosterArt != null && widget.onRegenerateHeadline != null)
                      Container(width: 1, height: 18, color: Colors.white24, margin: const EdgeInsets.symmetric(horizontal: 4)),
                    if (widget.onRegenerateHeadline != null)
                      Expanded(
                        child: TextButton.icon(
                          onPressed: widget.onRegenerateHeadline,
                          icon: const Icon(Icons.edit_note_rounded, size: 16, color: Color(0xFFA855F7)),
                          label: const Text(
                            'Re-craft Headline',
                            style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFFA855F7),
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          style: TextButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 6),
                            visualDensity: VisualDensity.compact,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],

            if (widget.showShareActions) ...[
              const SizedBox(height: 16),

              // Action Buttons
              Row(
                children: [
                  // Primary Multi-image Share Button (WhatsApp / Instagram)
                  Expanded(
                    flex: 3,
                    child: ElevatedButton(
                      onPressed: _isExporting ? null : _shareAllSlides,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF25D366), // WhatsApp Emerald / Vibrant Green
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        elevation: 4,
                      ),
                      child: _isExporting
                          ? const SizedBox(
                              height: 18,
                              width: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                              ),
                            )
                          : const Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.share_rounded, size: 18),
                                SizedBox(width: 8),
                                Text(
                                  'Share All 3 Posters',
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 0.2,
                                  ),
                                ),
                              ],
                            ),
                    ),
                  ),

                  const SizedBox(width: 10),

                  // Save Posters Button
                  Expanded(
                    flex: 2,
                    child: OutlinedButton(
                      onPressed: _isExporting ? null : _saveAllSlides,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: BorderSide(color: Colors.white.withValues(alpha: 0.2)),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.download_rounded, size: 18),
                          SizedBox(width: 6),
                          Text(
                            'Save 3',
                            style: TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 6),
              const Center(
                child: Text(
                  'Optimized for WhatsApp photo sets & Instagram carousel albums',
                  style: TextStyle(
                    fontSize: 10.5,
                    color: Color(0xFF94A3B8),
                  ),
                ),
              ),
            ],
          ],
        ),
      ],
    );
  }

  Widget _buildSlideTab(int index, String title, IconData icon) {
    final isSelected = _currentPage == index;
    return Expanded(
      child: GestureDetector(
        onTap: () {
          _pageController.animateToPage(
            index,
            duration: const Duration(milliseconds: 280),
            curve: Curves.easeInOut,
          );
        },
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
          decoration: BoxDecoration(
            color: isSelected
                ? _resolvedConfig.primaryColor.withValues(alpha: 0.3)
                : Colors.white.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: isSelected
                  ? _resolvedConfig.primaryColor.withValues(alpha: 0.8)
                  : Colors.white.withValues(alpha: 0.08),
              width: isSelected ? 1.5 : 1,
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: 13,
                color: isSelected ? const Color(0xFF38BDF8) : Colors.white54,
              ),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  title,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: isSelected ? FontWeight.w800 : FontWeight.w500,
                    color: isSelected ? Colors.white : Colors.white60,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
