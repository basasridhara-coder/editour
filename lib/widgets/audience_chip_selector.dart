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
    final isCustom = !AudiencePreset.isPreset(selectedAudience) && selectedAudience.isNotEmpty;

    // Build audience options list
    const customTriggerKey = '__custom_audience_trigger__';
    final List<DropdownMenuItem<String>> audienceItems = [];

    for (final preset in AudiencePreset.presets) {
      audienceItems.add(
        DropdownMenuItem<String>(
          value: preset.label,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(preset.icon, size: 18, color: theme.colorScheme.primary),
              const SizedBox(width: 10),
              Flexible(
                child: Text(
                  preset.label,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
                ),
              ),
            ],
          ),
        ),
      );
    }

    if (isCustom) {
      audienceItems.add(
        DropdownMenuItem<String>(
          value: selectedAudience,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.stars, size: 18, color: theme.colorScheme.primary),
              const SizedBox(width: 10),
              Flexible(
                child: Text(
                  selectedAudience,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
        ),
      );
    }

    audienceItems.add(
      DropdownMenuItem<String>(
        value: customTriggerKey,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              isCustom ? Icons.edit_outlined : Icons.add_circle_outline,
              size: 18,
              color: theme.colorScheme.primary,
            ),
            const SizedBox(width: 10),
            Text(
              isCustom ? 'Edit Custom Audience...' : '+ Custom Audience...',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.bold,
                color: theme.colorScheme.primary,
              ),
            ),
          ],
        ),
      ),
    );

    final String currentAudienceValue = (isCustom || AudiencePreset.isPreset(selectedAudience))
        ? selectedAudience
        : (AudiencePreset.presets.isNotEmpty ? AudiencePreset.presets.first.label : selectedAudience);

    // Build tone options list
    final List<DropdownMenuItem<String>> toneItems = [];
    bool toneMatched = false;
    for (final tone in ToneOption.options) {
      if (tone.label == selectedTone) toneMatched = true;
      toneItems.add(
        DropdownMenuItem<String>(
          value: tone.label,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(tone.emoji, style: const TextStyle(fontSize: 16)),
              const SizedBox(width: 10),
              Flexible(
                child: Text(
                  tone.label,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
                ),
              ),
            ],
          ),
        ),
      );
    }

    if (!toneMatched && selectedTone.isNotEmpty) {
      toneItems.add(
        DropdownMenuItem<String>(
          value: selectedTone,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('✨', style: TextStyle(fontSize: 16)),
              const SizedBox(width: 10),
              Flexible(
                child: Text(
                  selectedTone,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
                ),
              ),
            ],
          ),
        ),
      );
    }

    final String currentToneValue = toneMatched
        ? selectedTone
        : (toneItems.isNotEmpty ? toneItems.first.value ?? selectedTone : selectedTone);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 1. Target Audience Dropdown Section
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
        DropdownButtonFormField<String>(
          key: ValueKey('audience_$currentAudienceValue'),
          initialValue: currentAudienceValue,
          isExpanded: true,
          icon: const Icon(Icons.arrow_drop_down),
          decoration: InputDecoration(
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            filled: true,
            fillColor: theme.colorScheme.surface,
          ),
          items: audienceItems,
          onChanged: (val) {
            if (val == null) return;
            if (val == customTriggerKey) {
              _showCustomAudienceSheet(context);
              return;
            }
            onAudienceSelected(val);
            final matchedPreset = AudiencePreset.presets.where((p) => p.label == val).firstOrNull;
            if (matchedPreset != null) {
              onToneSelected(matchedPreset.defaultTone);
            }
          },
        ),
        const SizedBox(height: 16),

        // 2. Tone & Vibe Dropdown Section
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
        DropdownButtonFormField<String>(
          key: ValueKey('tone_$currentToneValue'),
          initialValue: currentToneValue,
          isExpanded: true,
          icon: const Icon(Icons.arrow_drop_down),
          decoration: InputDecoration(
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            filled: true,
            fillColor: theme.colorScheme.surface,
          ),
          items: toneItems,
          onChanged: (val) {
            if (val != null) {
              onToneSelected(val);
            }
          },
        ),
      ],
    );
  }
}
