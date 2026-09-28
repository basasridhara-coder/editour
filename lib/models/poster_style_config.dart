import 'package:flutter/material.dart';

enum PosterStyleType {
  aiInfographic,
  editorial,
  modernCyber,
  boldSocial,
  minimalist,
}

class PosterStyleConfig {
  final PosterStyleType type;
  final String displayName;
  final String description;
  final Color primaryColor;
  final Color secondaryColor;
  final Color backgroundColor;
  final Color textColor;
  final Color accentColor;

  const PosterStyleConfig({
    required this.type,
    required this.displayName,
    required this.description,
    required this.primaryColor,
    required this.secondaryColor,
    required this.backgroundColor,
    required this.textColor,
    required this.accentColor,
  });

  static PosterStyleConfig get defaultConfig => getPreset(PosterStyleType.aiInfographic);

  static PosterStyleConfig getPreset(PosterStyleType type) {
    switch (type) {
      case PosterStyleType.aiInfographic:
        return const PosterStyleConfig(
          type: PosterStyleType.aiInfographic,
          displayName: '🎨 AI Infographic Art',
          description: 'Generative AI visual infographic poster crafted by Gemini',
          primaryColor: Color(0xFF6366F1), // indigo
          secondaryColor: Color(0xFF06B6D4), // cyan
          backgroundColor: Color(0xFF0D1117), // dark obsidian
          textColor: Colors.white,
          accentColor: Color(0xFFF59E0B), // amber
        );
      case PosterStyleType.editorial:
        return const PosterStyleConfig(
          type: PosterStyleType.editorial,
          displayName: 'Editorial Digest',
          description: 'Classic serif elegance, rich paper tone & literary poise',
          primaryColor: Color(0xFF1E293B), // slate-800
          secondaryColor: Color(0xFF991B1B), // crimson
          backgroundColor: Color(0xFFFBF8F2), // vintage warm paper
          textColor: Color(0xFF1E1E24),
          accentColor: Color(0xFFB45309), // warm amber
        );
      case PosterStyleType.modernCyber:
        return const PosterStyleConfig(
          type: PosterStyleType.modernCyber,
          displayName: 'Tech Horizon',
          description: 'Dark obsidian, electric cyan & clean cyber aesthetics',
          primaryColor: Color(0xFF0F172A), // deep navy
          secondaryColor: Color(0xFF06B6D4), // cyan
          backgroundColor: Color(0xFF090D16), // midnight
          textColor: Color(0xFFF1F5F9),
          accentColor: Color(0xFF818CF8), // indigo
        );
      case PosterStyleType.boldSocial:
        return const PosterStyleConfig(
          type: PosterStyleType.boldSocial,
          displayName: 'Bold Pop',
          description: 'High-contrast vibrant cards made for viral feeds',
          primaryColor: Color(0xFF4F46E5), // violet
          secondaryColor: Color(0xFFEC4899), // pink
          backgroundColor: Color(0xFFFFFBEB), // warm light yellow
          textColor: Color(0xFF18181B),
          accentColor: Color(0xFFF43F5E), // rose
        );
      case PosterStyleType.minimalist:
        return const PosterStyleConfig(
          type: PosterStyleType.minimalist,
          displayName: 'Swiss Clean',
          description: 'Timeless architectural minimalism and grid discipline',
          primaryColor: Color(0xFF18181B),
          secondaryColor: Color(0xFF71717A),
          backgroundColor: Color(0xFFFFFFFF),
          textColor: Color(0xFF09090B),
          accentColor: Color(0xFF2563EB), // electric blue
        );
    }
  }
}
