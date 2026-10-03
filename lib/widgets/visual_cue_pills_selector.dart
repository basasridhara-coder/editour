import 'package:flutter/material.dart';

class VisualCuePillsSelector extends StatefulWidget {
  final List<String> pills;
  final ValueChanged<List<String>> onPillsChanged;
  final void Function(Set<int> selectedIndices)? onAutoSuggest;
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
  final TextEditingController _textController = TextEditingController();
  final Set<int> _selectedIndices = {};

  @override
  void initState() {
    super.initState();
    _textController.addListener(() {
      setState(() {});
    });
  }

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  void _addCues() {
    final text = _textController.text.trim();
    if (text.isEmpty) return;

    final updated = List<String>.from(widget.pills);
    final parts = text.split(',');
    for (final part in parts) {
      final clean = part.trim();
      if (clean.isNotEmpty && !updated.contains(clean)) {
        updated.add(clean);
      }
    }

    widget.onPillsChanged(updated);
    _textController.clear();
    setState(() {});
  }

  void _removePill(int index) {
    if (index >= 0 && index < widget.pills.length) {
      final updated = List<String>.from(widget.pills);
      updated.removeAt(index);

      final newSelected = <int>{};
      for (final s in _selectedIndices) {
        if (s < index) {
          newSelected.add(s);
        } else if (s > index) {
          newSelected.add(s - 1);
        }
      }
      _selectedIndices
        ..clear()
        ..addAll(newSelected);

      widget.onPillsChanged(updated);
    }
  }

  void _triggerSuggest() {
    widget.onAutoSuggest?.call(Set.from(_selectedIndices));
    setState(() {
      _selectedIndices.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasPills = widget.pills.isNotEmpty;
    final canAdd = _textController.text.trim().isNotEmpty;
    final isSelective = _selectedIndices.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // 1. Header Row: Drag / Selection Instruction & Suggest Button
        Row(
          children: [
            if (isSelective) ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2.5),
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  '${_selectedIndices.length} selected for re-suggest',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: theme.colorScheme.primary,
                  ),
                ),
              ),
              const SizedBox(width: 6),
              InkWell(
                onTap: () => setState(() => _selectedIndices.clear()),
                child: Text(
                  'Clear',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: theme.colorScheme.outline,
                    decoration: TextDecoration.underline,
                  ),
                ),
              ),
            ] else ...[
              Icon(Icons.swap_vert, size: 14, color: theme.colorScheme.onSurfaceVariant),
              const SizedBox(width: 4),
              Text(
                'Tap to select • Drag ⇅ to prioritize (#1 is Hero)',
                style: TextStyle(
                  fontSize: 11,
                  color: theme.colorScheme.onSurfaceVariant,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
            const Spacer(),
            if (widget.onAutoSuggest != null)
              InkWell(
                onTap: widget.isAutoSuggesting ? null : _triggerSuggest,
                borderRadius: BorderRadius.circular(8),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: isSelective
                        ? theme.colorScheme.primary
                        : theme.colorScheme.primaryContainer.withValues(alpha: 0.7),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: isSelective
                          ? theme.colorScheme.primary
                          : theme.colorScheme.primary.withValues(alpha: 0.35),
                    ),
                    boxShadow: isSelective
                        ? [
                            BoxShadow(
                              color: theme.colorScheme.primary.withValues(alpha: 0.25),
                              blurRadius: 6,
                              offset: const Offset(0, 2),
                            ),
                          ]
                        : null,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (widget.isAutoSuggesting)
                        SizedBox(
                          width: 12,
                          height: 12,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: isSelective ? Colors.white : theme.colorScheme.primary,
                          ),
                        )
                      else
                        Icon(
                          isSelective ? Icons.refresh_rounded : Icons.auto_awesome,
                          size: 13,
                          color: isSelective ? Colors.white : theme.colorScheme.primary,
                        ),
                      const SizedBox(width: 4),
                      Text(
                        isSelective
                            ? 'Suggest (${_selectedIndices.length})'
                            : 'Suggest All',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: isSelective ? Colors.white : theme.colorScheme.primary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),

        const SizedBox(height: 8),

        // 2. All 6 Cue Categories Reorderable & Selectable Deck
        Container(
          height: 224,
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: theme.colorScheme.outlineVariant.withValues(alpha: 0.6),
            ),
          ),
          child: !hasPills
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (widget.isAutoSuggesting) ...[
                        const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Analyzing article & generating 6 cue categories...',
                          style: TextStyle(
                            fontSize: 11.5,
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ] else ...[
                        Icon(
                          Icons.auto_awesome,
                          size: 24,
                          color: theme.colorScheme.primary.withValues(alpha: 0.5),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'No visual cues yet',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Tap Suggest All above or type a custom cue below',
                          style: TextStyle(
                            fontSize: 11,
                            color: theme.colorScheme.outline,
                          ),
                        ),
                      ],
                    ],
                  ),
                )
              : ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: ReorderableListView.builder(
                    scrollDirection: Axis.vertical,
                    physics: const BouncingScrollPhysics(),
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 5),
                    itemCount: widget.pills.length,
                    onReorderItem: (oldIndex, newIndex) {
                      final updated = List<String>.from(widget.pills);
                      final item = updated.removeAt(oldIndex);
                      updated.insert(newIndex, item);

                      final wasSelected = _selectedIndices.contains(oldIndex);
                      final newSelected = <int>{};
                      for (final s in _selectedIndices) {
                        if (s == oldIndex) continue;
                        int mapped = s;
                        if (oldIndex < newIndex) {
                          if (s > oldIndex && s <= newIndex) mapped = s - 1;
                        } else {
                          if (s >= newIndex && s < oldIndex) mapped = s + 1;
                        }
                        newSelected.add(mapped);
                      }
                      if (wasSelected) {
                        newSelected.add(newIndex);
                      }
                      _selectedIndices
                        ..clear()
                        ..addAll(newSelected);

                      widget.onPillsChanged(updated);
                    },
                    itemBuilder: (context, index) {
                      final cue = widget.pills[index];
                      final isPrimary = index == 0;
                      final isSelected = _selectedIndices.contains(index);

                      Color rowBg;
                      Color borderColor;
                      Color badgeBg;
                      String badgeText;

                      switch (index) {
                        case 0:
                          rowBg = const Color(0xFFF59E0B).withValues(alpha: 0.12);
                          borderColor = const Color(0xFFF59E0B).withValues(alpha: 0.6);
                          badgeBg = const Color(0xFFF59E0B);
                          badgeText = '★ #1 HERO';
                          break;
                        case 1:
                          rowBg = const Color(0xFF0284C7).withValues(alpha: 0.09);
                          borderColor = const Color(0xFF0284C7).withValues(alpha: 0.55);
                          badgeBg = const Color(0xFF0284C7);
                          badgeText = '★ #2 MOTIF';
                          break;
                        case 2:
                          rowBg = const Color(0xFFE11D48).withValues(alpha: 0.08);
                          borderColor = const Color(0xFFE11D48).withValues(alpha: 0.5);
                          badgeBg = const Color(0xFFE11D48);
                          badgeText = '⚡ #3 TENSION';
                          break;
                        case 3:
                          rowBg = const Color(0xFF8B5CF6).withValues(alpha: 0.08);
                          borderColor = const Color(0xFF8B5CF6).withValues(alpha: 0.5);
                          badgeBg = const Color(0xFF8B5CF6);
                          badgeText = '🏛 #4 ATMOSPHERE';
                          break;
                        case 4:
                          rowBg = const Color(0xFF059669).withValues(alpha: 0.08);
                          borderColor = const Color(0xFF059669).withValues(alpha: 0.5);
                          badgeBg = const Color(0xFF059669);
                          badgeText = '💡 #5 LIGHTING';
                          break;
                        case 5:
                          rowBg = const Color(0xFF475569).withValues(alpha: 0.08);
                          borderColor = const Color(0xFF475569).withValues(alpha: 0.5);
                          badgeBg = const Color(0xFF475569);
                          badgeText = '🎨 #6 STYLE';
                          break;
                        default:
                          rowBg = theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3);
                          borderColor = theme.colorScheme.outlineVariant.withValues(alpha: 0.4);
                          badgeBg = theme.colorScheme.outline.withValues(alpha: 0.55);
                          badgeText = '#${index + 1} CUE';
                          break;
                      }

                      return Container(
                        key: ValueKey('cue_${cue}_$index'),
                        margin: const EdgeInsets.only(bottom: 4),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? theme.colorScheme.primary.withValues(alpha: 0.13)
                              : rowBg,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: isSelected ? theme.colorScheme.primary : borderColor,
                            width: isSelected ? 1.6 : (isPrimary ? 1.4 : 1.0),
                          ),
                        ),
                        child: InkWell(
                          onTap: () {
                            setState(() {
                              if (isSelected) {
                                _selectedIndices.remove(index);
                              } else {
                                _selectedIndices.add(index);
                              }
                            });
                          },
                          borderRadius: BorderRadius.circular(8),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                            child: Row(
                              children: [
                                // Drag indicator (drag from handle only)
                                ReorderableDragStartListener(
                                  index: index,
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 2),
                                    child: Icon(
                                      Icons.drag_indicator_rounded,
                                      size: 16,
                                      color: theme.colorScheme.outline,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 4),

                                // Selection Checkbox Icon
                                Icon(
                                  isSelected
                                      ? Icons.check_circle_rounded
                                      : Icons.radio_button_unchecked,
                                  size: 16,
                                  color: isSelected
                                      ? theme.colorScheme.primary
                                      : theme.colorScheme.outline.withValues(alpha: 0.5),
                                ),
                                const SizedBox(width: 6),

                                // Dimension Badge
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: badgeBg,
                                    borderRadius: BorderRadius.circular(5),
                                  ),
                                  child: Text(
                                    badgeText,
                                    style: const TextStyle(
                                      fontSize: 9.5,
                                      fontWeight: FontWeight.w900,
                                      color: Colors.white,
                                      letterSpacing: 0.3,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),

                                // Cue text
                                Expanded(
                                  child: Text(
                                    cue,
                                    style: TextStyle(
                                      fontSize: 12.5,
                                      fontWeight: isPrimary ? FontWeight.bold : FontWeight.w500,
                                      color: isSelected ? theme.colorScheme.primary : null,
                                    ),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),

                                // Delete button
                                InkWell(
                                  onTap: () => _removePill(index),
                                  borderRadius: BorderRadius.circular(6),
                                  child: Padding(
                                    padding: const EdgeInsets.all(3),
                                    child: Icon(
                                      Icons.close,
                                      size: 14,
                                      color: theme.colorScheme.onSurfaceVariant,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
        ),

        const SizedBox(height: 8),

        // 3. Custom Cue Addition (Directly below all the 6 Cue categories)
        Container(
          height: 42,
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            borderRadius: BorderRadius.circular(9),
            border: Border.all(
              color: theme.colorScheme.outlineVariant.withValues(alpha: 0.65),
            ),
          ),
          child: Row(
            children: [
              const SizedBox(width: 9),
              Icon(
                Icons.add_circle_outline,
                size: 16,
                color: theme.colorScheme.primary.withValues(alpha: 0.8),
              ),
              const SizedBox(width: 7),
              Expanded(
                child: TextField(
                  controller: _textController,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _addCues(),
                  style: const TextStyle(fontSize: 12),
                  decoration: InputDecoration(
                    isDense: true,
                    hintText: 'Type custom cue to add (or comma-separated)...',
                    hintStyle: TextStyle(
                      fontSize: 11.5,
                      color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.6),
                    ),
                    border: InputBorder.none,
                    contentPadding: const EdgeInsets.symmetric(vertical: 10),
                  ),
                ),
              ),
              if (canAdd)
                IconButton(
                  icon: const Icon(Icons.clear, size: 14),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  tooltip: 'Clear',
                  onPressed: () {
                    _textController.clear();
                    setState(() {});
                  },
                ),
              const SizedBox(width: 4),
              FilledButton.tonal(
                onPressed: canAdd ? _addCues : null,
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  visualDensity: VisualDensity.compact,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(7)),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.add, size: 14),
                    SizedBox(width: 2),
                    Text('Add', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
              const SizedBox(width: 5),
            ],
          ),
        ),
      ],
    );
  }
}
