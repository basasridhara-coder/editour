import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'screens/main_navigation_shell.dart';
import 'services/storage_service.dart';
import 'services/web_feed_server.dart';

/// Global Reading Atmosphere Controller ('daylight', 'obsidian', 'auto')
final ValueNotifier<String> appAtmosphereNotifier = ValueNotifier<String>('auto');

ThemeMode calculateEffectiveThemeMode(String atmosphere) {
  if (atmosphere == 'daylight') return ThemeMode.light;
  if (atmosphere == 'obsidian') return ThemeMode.dark;
  // auto: daylight between 6 AM and 6 PM, obsidian at night
  final hour = DateTime.now().hour;
  return (hour >= 6 && hour < 18) ? ThemeMode.light : ThemeMode.dark;
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await StorageService().init().timeout(const Duration(seconds: 3));
    final savedMode = await StorageService().getAtmospherePreference();
    appAtmosphereNotifier.value = savedMode;
  } catch (e, stack) {
    debugPrint('StorageService init error: $e\n$stack');
  }

  // Start embedded web feed server
  try {
    await WebFeedServer().start();
  } catch (e) {
    debugPrint('WebFeedServer auto-start error: $e');
  }

  runApp(const PostCardApp());
}

class PostCardApp extends StatelessWidget {
  const PostCardApp({super.key});

  TextTheme _safeTextTheme(Brightness brightness) {
    final base = brightness == Brightness.light
        ? ThemeData.light().textTheme
        : ThemeData.dark().textTheme;
    try {
      return GoogleFonts.interTextTheme(base);
    } catch (_) {
      return base;
    }
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: appAtmosphereNotifier,
      builder: (context, atmosphere, _) {
        final effectiveMode = calculateEffectiveThemeMode(atmosphere);

        return MaterialApp(
          title: 'Editour',
          debugShowCheckedModeBanner: false,
          themeMode: effectiveMode,
          theme: ThemeData(
            useMaterial3: true,
            scaffoldBackgroundColor: const Color(0xFFF8F5EE), // Daylight linen paper
            colorScheme: ColorScheme.fromSeed(
              seedColor: const Color(0xFF4F46E5),
              brightness: Brightness.light,
              surface: const Color(0xFFF8F5EE),
            ),
            textTheme: _safeTextTheme(Brightness.light),
            fontFamilyFallback: const ['Roboto', 'sans-serif'],
            appBarTheme: const AppBarTheme(
              backgroundColor: Color(0xFFF8F5EE),
              foregroundColor: Color(0xFF0F172A),
              centerTitle: false,
              elevation: 0,
              scrolledUnderElevation: 1,
            ),
            cardTheme: CardThemeData(
              color: Colors.white,
              elevation: 1,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            ),
          ),
          darkTheme: ThemeData(
            useMaterial3: true,
            scaffoldBackgroundColor: const Color(0xFF0B0E14), // Obsidian press velvet dark
            colorScheme: ColorScheme.fromSeed(
              seedColor: const Color(0xFF6366F1),
              brightness: Brightness.dark,
              surface: const Color(0xFF0B0E14),
            ),
            textTheme: _safeTextTheme(Brightness.dark),
            fontFamilyFallback: const ['Roboto', 'sans-serif'],
            appBarTheme: const AppBarTheme(
              backgroundColor: Color(0xFF0B0E14),
              foregroundColor: Color(0xFFF8FAFC),
              centerTitle: false,
              elevation: 0,
              scrolledUnderElevation: 1,
            ),
            cardTheme: CardThemeData(
              color: const Color(0xFF161D2B),
              elevation: 1,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            ),
          ),
          home: const MainNavigationShell(),
        );
      },
    );
  }
}
