import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'screens/main_navigation_shell.dart';
import 'services/storage_service.dart';
import 'services/web_feed_server.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await StorageService().init().timeout(const Duration(seconds: 3));
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
    const primarySeed = Color(0xFF1E293B);

    return MaterialApp(
      title: 'Editour',
      debugShowCheckedModeBanner: false,
      themeMode: ThemeMode.system,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: primarySeed,
          brightness: Brightness.light,
        ),
        textTheme: _safeTextTheme(Brightness.light),
        fontFamilyFallback: const ['Roboto', 'sans-serif'],
        appBarTheme: const AppBarTheme(
          centerTitle: false,
          elevation: 0,
          scrolledUnderElevation: 1,
        ),
        cardTheme: CardThemeData(
          elevation: 1,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        ),
      ),
      darkTheme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: primarySeed,
          brightness: Brightness.dark,
        ),
        textTheme: _safeTextTheme(Brightness.dark),
        fontFamilyFallback: const ['Roboto', 'sans-serif'],
        appBarTheme: const AppBarTheme(
          centerTitle: false,
          elevation: 0,
          scrolledUnderElevation: 1,
        ),
        cardTheme: CardThemeData(
          elevation: 1,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        ),
      ),
      home: const MainNavigationShell(),
    );
  }
}
