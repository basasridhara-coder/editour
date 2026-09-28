import 'package:flutter/material.dart';
import '../models/audience_preset.dart';

class AudienceChipSelector extends StatelessWidget {
  final String selectedAudience;
  final String selectedTone;
  final ValueChanged<String> onAudienceSelected;
  final ValueChanged<String> onToneSelected;

  const AudienceChipSelector({
    super.key,
    required this.selectedAudience,
    required this.selectedTone,
    required this.onAudienceSelected,
    required this.onToneSelected,
  });

  void _showCustomAudienceSheet(BuildContext context) {
    final theme = Theme.of(context);
    final isCustom = !AudiencePreset.isPreset(selectedAudience);
    final controller = TextEditingController(text: isCustom ? selectedAudience : '');

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: theme.colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
            left: 20,
            right: 20,
            top: 16,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.outlineVariant,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primaryContainer,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(
                        Icons.track_changes,
                        color: theme.colorScheme.primary,
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Custom Target Audience',
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            'Tailor vocabulary & stakes to your specific niche',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: controller,
                  autofocus: true,
                  textCapitalization: TextCapitalization.words,
                  decoration: InputDecoration(
                    labelText: 'Target Audience Name',
                    hintText: 'e.g. Startup Founders, Deep Learning Engineers',
                    prefixIcon: const Icon(Icons.groups_outlined),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    suffixIcon: IconButton(
                      icon: const Icon(Icons.clear),
                      onPressed: () => controller.clear(),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  'Popular Niches:',
                  style: theme.textTheme.labelMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: AudiencePreset.customSuggestions.map((suggestion) {
                    final isCurrent = controller.text.trim().toLowerCase() == suggestion.toLowerCase();
                    return ActionChip(
                      label: Text(suggestion, style: const TextStyle(fontSize: 12)),
                      backgroundColor: isCurrent ? theme.colorScheme.primaryContainer : null,
                      onPressed: () {
                        controller.text = suggestion;
                        controller.selection = TextSelection.fromPosition(
                          TextPosition(offset: suggestion.length),
                        );
                      },
                    );
                  }).toList(),
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    icon: const Icon(Icons.check),
                    label: const Text('Set Target Audience'),
                    onPressed: () {
                      final text = controller.text.trim();
                      if (text.isNotEmpty) {
                        onAudienceSelected(text);
                      }
                      Navigator.of(ctx).pop();
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isCustom = !AudiencePreset.isPreset(selectedAudience);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                Icon(Icons.groups_outlined, size: 18, color: theme.colorScheme.primary),
                const SizedBox(width: 8),
                Text(
                  'Target Audience',
                  style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
                ),
              ],
            ),
            InkWell(
              borderRadius: BorderRadius.circular(8),
              onTap: () => _showCustomAudienceSheet(context),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                child: Row(
                  children: [
                    Icon(
                      isCustom ? Icons.edit_outlined : Icons.add_circle_outline,
                      size: 14,
                      color: theme.colorScheme.primary,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      isCustom ? 'Edit Custom' : '+ Custom',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.primary,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            ...AudiencePreset.presets.map((preset) {
              final isSelected = selectedAudience == preset.label;
              return FilterChip(
                avatar: Icon(
                  preset.icon,
                  size: 16,
                  color: isSelected ? Colors.white : theme.colorScheme.onSurfaceVariant,
                ),
                label: Text(preset.label),
                selected: isSelected,
                onSelected: (val) {
                  if (val) {
                    onAudienceSelected(preset.label);
                    // auto-select suggested tone
                    onToneSelected(preset.defaultTone);
                  }
                },
                selectedColor: theme.colorScheme.primary,
                labelStyle: TextStyle(
                  fontSize: 12,
                  fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                  color: isSelected ? Colors.white : theme.colorScheme.onSurface,
                ),
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
              );
            }),
            if (isCustom)
              FilterChip(
                avatar: const Icon(
                  Icons.stars,
                  size: 16,
                  color: Colors.white,
                ),
                label: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(selectedAudience),
                    const SizedBox(width: 4),
                    const Icon(Icons.edit, size: 12, color: Colors.white70),
                  ],
                ),
                selected: true,
                onSelected: (_) => _showCustomAudienceSheet(context),
                selectedColor: theme.colorScheme.primary,
                labelStyle: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
              ),
          ],
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Icon(Icons.tune_outlined, size: 18, color: theme.colorScheme.primary),
            const SizedBox(width: 8),
            Text(
              'Tone & Vibe',
              style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
            ),
          ],
        ),
        const SizedBox(height: 8),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: ToneOption.options.map((tone) {
              final isSelected = selectedTone == tone.label;
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: FilterChip(
                  label: Text('${tone.emoji} ${tone.label}'),
                  selected: isSelected,
                  onSelected: (val) {
                    if (val) {
                      onToneSelected(tone.label);
                    }
                  },
                  selectedColor: theme.colorScheme.secondary,
                  labelStyle: TextStyle(
                    fontSize: 12,
                    fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                    color: isSelected ? Colors.white : theme.colorScheme.onSurface,
                  ),
                ),
              );
            }).toList(),
          ),
        ),
      ],
    );
  }
}
