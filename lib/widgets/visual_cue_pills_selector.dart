import 'package:flutter/material.dart';

class VisualCuePillsSelector extends StatefulWidget {
  final List<String> pills;
  final ValueChanged<List<String>> onPillsChanged;
  final VoidCallback? onAutoSuggest;
  final bool isAutoSuggesting;

  const VisualCuePillsSelector({
    super.key,
    required this.pills,
    required this.onPillsChanged,
    this.onAutoSuggest,
    this.isAutoSuggesting = false,
  });

  @override
  State<VisualCuePillsSelector> createState() => _VisualCuePillsSelectorState();
}

class _VisualCuePillsSelectorState extends State<VisualCuePillsSelector> {
  final TextEditingController _addController = TextEditingController();
  bool _isAddingCustom = false;

  @override
  void dispose() {
    _addController.dispose();
    super.dispose();
  }

  void _addCustomPill() {
    final text = _addController.text.trim();
    if (text.isNotEmpty) {
      final updated = List<String>.from(widget.pills);
      if (!updated.contains(text)) {
        updated.add(text);
        widget.onPillsChanged(updated);
      }
      _addController.clear();
      setState(() => _isAddingCustom = false);
    }
  }

  void _removePill(int index) {
    if (index >= 0 && index < widget.pills.length) {
      final updated = List<String>.from(widget.pills);
      updated.removeAt(index);
      widget.onPillsChanged(updated);
    }
  }

  void _promoteToPrimary(int index) {
    if (index > 0 && index < widget.pills.length) {
      final updated = List<String>.from(widget.pills);
      final item = updated.removeAt(index);
      updated.insert(0, item);
      widget.onPillsChanged(updated);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasPills = widget.pills.isNotEmpty;

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.45)),
      ),
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header Row: Title + Auto-Suggest Button
          Row(
            children: [
              Icon(Icons.auto_awesome, size: 16, color: theme.colorScheme.primary),
              const SizedBox(width: 6),
              const Expanded(
                child: Text(
                  'Visual Cues & Metaphors (Priority Order)',
                  style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (widget.onAutoSuggest != null)
                TextButton.icon(
                  onPressed: widget.isAutoSuggesting ? null : widget.onAutoSuggest,
                  icon: widget.isAutoSuggesting
                      ? const SizedBox(
                          width: 12,
                          height: 12,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.refresh_rounded, size: 14),
                  label: const Text(
                    'Auto-Suggest',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
                  ),
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    visualDensity: VisualDensity.compact,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            'Touch & drag pills to reorder priority. Pill #1 is the primary dominant visual focus.',
            style: TextStyle(
              fontSize: 11,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 10),

          // Reorderable Horizontal Pills Row
          if (hasPills) ...[
            SizedBox(
              height: 44,
              child: ReorderableListView.builder(
                scrollDirection: Axis.horizontal,
                physics: const BouncingScrollPhysics(),
                buildDefaultDragHandles: false,
                itemCount: widget.pills.length,
                // ignore: deprecated_member_use
                onReorder: (oldIndex, newIndex) {
                  if (oldIndex < newIndex) {
                    newIndex -= 1;
                  }
                  final updated = List<String>.from(widget.pills);
                  final item = updated.removeAt(oldIndex);
                  updated.insert(newIndex, item);
                  widget.onPillsChanged(updated);
                },
                itemBuilder: (context, index) {
                  final cue = widget.pills[index];
                  final isPrimary = index == 0;
                  final isSecondary = index == 1;

                  Color pillBg;
                  Color pillBorder;
                  Color textColor;
                  Color badgeBg;
                  String badgeText;

                  if (isPrimary) {
                    pillBg = const Color(0xFFF59E0B).withValues(alpha: 0.18);
                    pillBorder = const Color(0xFFF59E0B);
                    textColor = const Color(0xFFF59E0B);
                    badgeBg = const Color(0xFFF59E0B);
                    badgeText = '★ #1 FOCUS';
                  } else if (isSecondary) {
                    pillBg = const Color(0xFF38BDF8).withValues(alpha: 0.14);
                    pillBorder = const Color(0xFF38BDF8);
                    textColor = const Color(0xFF38BDF8);
                    badgeBg = const Color(0xFF38BDF8);
                    badgeText = '#2 MOTIF';
                  } else {
                    pillBg = theme.colorScheme.surface;
                    pillBorder = theme.colorScheme.outlineVariant.withValues(alpha: 0.6);
                    textColor = theme.colorScheme.onSurface;
                    badgeBg = theme.colorScheme.outline.withValues(alpha: 0.4);
                    badgeText = '#${index + 1}';
                  }

                  return ReorderableDelayedDragStartListener(
                    key: ValueKey('cue_$cue'),
                    index: index,
                    child: Container(
                      margin: const EdgeInsets.only(right: 8),
                      decoration: BoxDecoration(
                        color: pillBg,
                        borderRadius: BorderRadius.circular(22),
                        border: Border.all(color: pillBorder, width: isPrimary ? 1.4 : 1.0),
                        boxShadow: isPrimary
                            ? [
                                BoxShadow(
                                  color: const Color(0xFFF59E0B).withValues(alpha: 0.25),
                                  blurRadius: 6,
                                  offset: const Offset(0, 2),
                                ),
                              ]
                            : null,
                      ),
                      padding: const EdgeInsets.fromLTRB(8, 4, 6, 4),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // Priority Order Badge
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                            decoration: BoxDecoration(
                              color: badgeBg,
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              badgeText,
                              style: TextStyle(
                                fontSize: isPrimary || isSecondary ? 8.5 : 9,
                                fontWeight: FontWeight.w900,
                                color: (isPrimary || isSecondary) ? Colors.black : Colors.white,
                                letterSpacing: 0.3,
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),

                          // Pill Keyword Label
                          GestureDetector(
                            onTap: () {
                              if (!isPrimary) {
                                _promoteToPrimary(index);
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text('⭐ Promoted "$cue" to #1 Primary Focus!'),
                                    duration: const Duration(seconds: 1),
                                  ),
                                );
                              }
                            },
                            child: Text(
                              cue,
                              style: TextStyle(
                                fontSize: 11.5,
                                fontWeight: isPrimary ? FontWeight.w800 : FontWeight.w600,
                                color: textColor,
                              ),
                            ),
                          ),
                          const SizedBox(width: 4),

                          // Touch & Drag Indicator
                          Icon(
                            Icons.drag_indicator_rounded,
                            size: 14,
                            color: textColor.withValues(alpha: 0.5),
                          ),
                          const SizedBox(width: 2),

                          // Remove Pill Button
                          InkWell(
                            onTap: () => _removePill(index),
                            borderRadius: BorderRadius.circular(12),
                            child: Padding(
                              padding: const EdgeInsets.all(2),
                              child: Icon(
                                Icons.close_rounded,
                                size: 13,
                                color: textColor.withValues(alpha: 0.75),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 8),
          ] else ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: theme.colorScheme.surface,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.4)),
              ),
              child: Row(
                children: [
                  Icon(Icons.lightbulb_outline, size: 14, color: theme.colorScheme.primary),
                  const SizedBox(width: 6),
                  const Expanded(
                    child: Text(
                      'No visual cues yet. Tap "Auto-Suggest" or add custom word pills below.',
                      style: TextStyle(fontSize: 11.5, color: Colors.grey),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
          ],

          // Add Custom Pill Row / Action
          if (_isAddingCustom) ...[
            Row(
              children: [
                Expanded(
                  child: SizedBox(
                    height: 38,
                    child: TextField(
                      controller: _addController,
                      autofocus: true,
                      onSubmitted: (_) => _addCustomPill(),
                      decoration: InputDecoration(
                        hintText: 'e.g. Broken mirror, Neon rain, Gavel...',
                        hintStyle: const TextStyle(fontSize: 12),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                        filled: true,
                        fillColor: theme.colorScheme.surface,
                      ),
                      style: const TextStyle(fontSize: 12),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                IconButton.filled(
                  iconSize: 16,
                  visualDensity: VisualDensity.compact,
                  onPressed: _addCustomPill,
                  icon: const Icon(Icons.check),
                  tooltip: 'Add Pill',
                ),
                IconButton(
                  iconSize: 16,
                  visualDensity: VisualDensity.compact,
                  onPressed: () => setState(() => _isAddingCustom = false),
                  icon: const Icon(Icons.close),
                  tooltip: 'Cancel',
                ),
              ],
            ),
          ] else ...[
            Row(
              children: [
                ActionChip(
                  avatar: const Icon(Icons.add_rounded, size: 14),
                  label: const Text('+ Add Custom Cue Pill', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                  onPressed: () => setState(() => _isAddingCustom = true),
                  visualDensity: VisualDensity.compact,
                  backgroundColor: theme.colorScheme.surface,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(20),
                    side: BorderSide(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5)),
                  ),
                ),
                const SizedBox(width: 8),
                if (hasPills && widget.pills.length > 1)
                  Text(
                    'Tip: Tap any pill to make it #1',
                    style: TextStyle(fontSize: 10.5, fontStyle: FontStyle.italic, color: theme.colorScheme.onSurfaceVariant),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
