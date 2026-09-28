import 'package:flutter/material.dart';
import '../models/postcard_item.dart';
import '../models/poster_style_config.dart';
import 'carousel_slides/slide_hook_poster.dart';
import 'carousel_slides/slide_critique_poster.dart';
import 'carousel_slides/slide_receipts_poster.dart';

/// Renders the complete 4:5 Instagram feed post visual.
/// If carousel trio, allows swiping between Slide 1 (Hook), Slide 2 (Curator), and Slide 3 (Receipts).
/// Artwork always uses BoxFit.cover to fill 100% of the 4:5 canvas with ZERO pillarbox gaps!
class CompleteInfographicVisual extends StatefulWidget {
  final PostCardItem item;
  final PosterStyleConfig config;
  final VoidCallback? onOpenDetail;
  final ValueChanged<int>? onPageChanged;

  const CompleteInfographicVisual({
    super.key,
    required this.item,
    required this.config,
    this.onOpenDetail,
    this.onPageChanged,
  });

  @override
  State<CompleteInfographicVisual> createState() => _CompleteInfographicVisualState();
}

class _CompleteInfographicVisualState extends State<CompleteInfographicVisual> {
  late final PageController _pageController;
  int _currentPage = 0;

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.item.isCarouselTrio) {
      return AspectRatio(
        aspectRatio: 4 / 5,
        child: GestureDetector(
          onTap: widget.onOpenDetail,
          child: Stack(
            fit: StackFit.expand,
            children: [
              PageView(
                controller: _pageController,
                physics: const BouncingScrollPhysics(),
                onPageChanged: (idx) {
                  setState(() => _currentPage = idx);
                  widget.onPageChanged?.call(idx);
                },
                children: [
                  SlideHookPoster(
                    item: widget.item,
                    config: widget.config,
                    borderRadius: BorderRadius.zero,
                  ),
                  SlideCritiquePoster(
                    item: widget.item,
                    config: widget.config,
                    borderRadius: BorderRadius.zero,
                  ),
                  SlideReceiptsPoster(
                    item: widget.item,
                    config: widget.config,
                    borderRadius: BorderRadius.zero,
                  ),
                ],
              ),
              // Floating slide indicator badge on top right
              Positioned(
                top: 14,
                right: 14,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3.5),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.75),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
                  ),
                  child: Text(
                    '${_currentPage + 1} / 3',
                    style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    // Single poster format: 4:5 complete poster
    return AspectRatio(
      aspectRatio: 4 / 5,
      child: GestureDetector(
        onTap: widget.onOpenDetail,
        child: SlideHookPoster(
          item: widget.item,
          config: widget.config,
          borderRadius: BorderRadius.zero,
        ),
      ),
    );
  }
}
