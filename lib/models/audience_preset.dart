import 'package:flutter/material.dart';

class AudiencePreset {
  final String id;
  final String label;
  final String description;
  final IconData icon;
  final String defaultTone;

  const AudiencePreset({
    required this.id,
    required this.label,
    required this.description,
    required this.icon,
    required this.defaultTone,
  });

  static const List<AudiencePreset> presets = [
    AudiencePreset(
      id: 'general',
      label: 'General Public',
      description: 'Clear, balanced, and accessible to everyone',
      icon: Icons.people_outline,
      defaultTone: 'Balanced & Engaging',
    ),
    AudiencePreset(
      id: 'tech',
      label: 'Tech Enthusiasts',
      description: 'Dives into specs, architecture, and innovation',
      icon: Icons.memory,
      defaultTone: 'Deep-dive & Analytical',
    ),
    AudiencePreset(
      id: 'executives',
      label: 'Busy Executives',
      description: 'Bottom-line impact, market trends & takeaways',
      icon: Icons.business_center_outlined,
      defaultTone: 'Concise & Actionable',
    ),
    AudiencePreset(
      id: 'genz',
      label: 'Gen-Z / Social',
      description: 'Punchy, relatable, high energy & visual',
      icon: Icons.local_fire_department_outlined,
      defaultTone: 'Catchy & Casual',
    ),
    AudiencePreset(
      id: 'students',
      label: 'Students / ELI5',
      description: 'Simple concepts explained clearly with analogies',
      icon: Icons.school_outlined,
      defaultTone: 'Educational & Friendly',
    ),
    AudiencePreset(
      id: 'seniors',
      label: 'Seniors / In-Depth',
      description: 'Thoughtful context, historical perspective & depth',
      icon: Icons.auto_stories_outlined,
      defaultTone: 'Respectful & Comprehensive',
    ),
  ];

  static bool isPreset(String audience) {
    return presets.any((p) => p.label.trim().toLowerCase() == audience.trim().toLowerCase());
  }

  static const List<String> customSuggestions = [
    'Startup Founders',
    'Software Engineers',
    'Investors & VCs',
    'Product Managers',
    'Designers & Creatives',
    'Researchers & Academics',
    'Healthcare & Doctors',
    'Parents & Educators',
  ];
}

class ToneOption {
  final String label;
  final String emoji;

  const ToneOption(this.label, this.emoji);

  static const List<ToneOption> options = [
    ToneOption('Balanced & Engaging', '⚖️'),
    ToneOption('Catchy & Punchy', '⚡'),
    ToneOption('Deep-dive & Analytical', '🔬'),
    ToneOption('Concise & Actionable', '🎯'),
    ToneOption('Witty & Conversational', '💬'),
    ToneOption('Critical & Investigative', '🔍'),
  ];
}
