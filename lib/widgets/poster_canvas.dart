import 'package:flutter/material.dart';
import '../models/postcard_item.dart';
import '../models/poster_style_config.dart';
import 'book_cover_viewer_dialog.dart';
import 'poster_styles/ai_infographic_poster.dart';
import 'poster_styles/bold_social_poster.dart';
import 'poster_styles/editorial_poster.dart';
import 'poster_styles/minimalist_poster.dart';
import 'poster_styles/modern_cyber_poster.dart';

class PosterCanvas extends StatelessWidget {
  final PostCardItem item;
  final GlobalKey? boundaryKey;
  final ValueChanged<PosterStyleType>? onStyleChanged;
  final bool showStyleSelector;

  const PosterCanvas({
    super.key,
    required this.item,
    this.boundaryKey,
    this.onStyleChanged,
    this.showStyleSelector = false,
  });

  @override
  Widget build(BuildContext context) {
    final currentConfig = PosterStyleConfig.getPreset(item.posterStyle);

    Widget posterContent;
    switch (item.posterStyle) {
      case PosterStyleType.aiInfographic:
        posterContent = AiInfographicPoster(item: item, config: currentConfig);
        break;
      case PosterStyleType.editorial:
        posterContent = EditorialPoster(item: item, config: currentConfig);
        break;
      case PosterStyleType.modernCyber:
        posterContent = ModernCyberPoster(item: item, config: currentConfig);
        break;
      case PosterStyleType.boldSocial:
        posterContent = BoldSocialPoster(item: item, config: currentConfig);
        break;
      case PosterStyleType.minimalist:
        posterContent = MinimalistPoster(item: item, config: currentConfig);
        break;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (item.isBookExcerpt) ...[
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: InkWell(
              onTap: () => BookCoverViewerDialog.show(context, item: item),
              borderRadius: BorderRadius.circular(10),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      Colors.amber.shade900.withValues(alpha: 0.15),
                      Colors.amber.shade700.withValues(alpha: 0.08),
                    ],
                  ),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Colors.amber.shade700.withValues(alpha: 0.35)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.auto_stories, size: 16, color: Colors.amber),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Book Cover: ${item.bookTitle ?? item.publicationName ?? "Identified Cover"}',
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          if (item.curatorAngle != null && item.curatorAngle!.isNotEmpty)
                            Text(
                              'Curator Angle: "${item.curatorAngle}"',
                              style: TextStyle(
                                fontSize: 10.5,
                                fontStyle: FontStyle.italic,
                                color: Theme.of(context).colorScheme.onSurfaceVariant,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.amber.shade800,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.visibility_outlined, size: 12, color: Colors.white),
                          SizedBox(width: 4),
                          Text(
                            'View Cover',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
        if (showStyleSelector) ...[
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              children: [
                const Icon(Icons.palette_outlined, size: 16, color: Colors.grey),
                const SizedBox(width: 6),
                const Text(
                  'Poster Theme:',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Colors.grey,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: PosterStyleType.values.map((type) {
                        final preset = PosterStyleConfig.getPreset(type);
                        final isSelected = item.posterStyle == type;
                        return Padding(
                          padding: const EdgeInsets.only(right: 6),
                          child: ChoiceChip(
                            label: Text(preset.displayName),
                            selected: isSelected,
                            onSelected: (val) {
                              if (val && onStyleChanged != null) {
                                onStyleChanged!(type);
                              }
                            },
                            visualDensity: VisualDensity.compact,
                            labelStyle: TextStyle(
                              fontSize: 11,
                              fontWeight: isSelected ? FontWeight.w700 : FontWeight.normal,
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
        // The RepaintBoundary for high-definition screenshot/export
        RepaintBoundary(
          key: boundaryKey,
          child: posterContent,
        ),
      ],
    );
  }
}
