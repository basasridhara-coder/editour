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
  final bool showOverlays;

  const CompleteInfographicVisual({
    super.key,
    required this.item,
    required this.config,
    this.onOpenDetail,
    this.onPageChanged,
    this.showOverlays = true,
  });

  @override
  State<CompleteInfographicVisual> createState() => _CompleteInfographicVisualState();
}

class _CompleteInfographicVisualState extends State<CompleteInfographicVisual> {
  late final PageController _pageController;

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
        child: FittedBox(
          fit: BoxFit.contain,
          alignment: Alignment.center,
          child: SizedBox(
            width: 360,
            height: 450,
            child: PageView.builder(
              controller: _pageController,
              physics: const BouncingScrollPhysics(),
              itemCount: 3,
              onPageChanged: widget.onPageChanged,
              itemBuilder: (context, index) {
                switch (index) {
                  case 0:
                    return SlideHookPoster(
                      item: widget.item,
                      config: widget.config,
                      showOverlays: widget.showOverlays,
                    );
                  case 1:
                    return SlideCritiquePoster(
                      item: widget.item,
                      config: widget.config,
                      showOverlays: widget.showOverlays,
                    );
                  case 2:
                    return SlideReceiptsPoster(
                      item: widget.item,
                      config: widget.config,
                    );
                  default:
                    return const SizedBox.shrink();
                }
              },
            ),
          ),
        ),
      );
    }

    // Single poster format: 4:5 complete poster
    return AspectRatio(
      aspectRatio: 4 / 5,
      child: FittedBox(
        fit: BoxFit.contain,
        alignment: Alignment.center,
        child: SizedBox(
          width: 360,
          height: 450,
          child: SlideHookPoster(
            item: widget.item,
            config: widget.config,
            showOverlays: widget.showOverlays,
          ),
        ),
      ),
    );
  }
}
