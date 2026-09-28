import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/gemini_service.dart';
import '../services/storage_service.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final StorageService _storageService = StorageService();
  final GeminiService _geminiService = GeminiService();
  final TextEditingController _apiKeyController = TextEditingController();
  final TextEditingController _handleController = TextEditingController();

  bool _obscureApiKey = true;
  bool _isLoading = true;
  bool _isSaving = false;
  bool _isTesting = false;
  String? _testResult;
  bool? _testSuccess;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  @override
  void dispose() {
    _apiKeyController.dispose();
    _handleController.dispose();
    super.dispose();
  }

  Future<void> _loadSettings() async {
    final apiKey = await _storageService.getApiKey();
    final handle = await _storageService.getCreatorHandle();
    setState(() {
      _apiKeyController.text = apiKey ?? '';
      _handleController.text = handle;
      _isLoading = false;
    });

    if (apiKey != null && apiKey.trim().isNotEmpty) {
      _testConnection(silent: true);
    }
  }

  Future<void> _testConnection({bool silent = false}) async {
    final key = _apiKeyController.text.trim();
    if (key.isEmpty) {
      if (!silent) {
        setState(() {
          _testSuccess = false;
          _testResult = 'Please enter an API key first.';
        });
      }
      return;
    }

    setState(() {
      _isTesting = true;
      _testResult = null;
    });

    final res = await _geminiService.testApiKey(key);
    if (mounted) {
      setState(() {
        _isTesting = false;
        _testSuccess = res['success'] == true;
        _testResult = res['success'] == true
            ? (res['message'] ?? 'Successfully connected to Google Gemini!')
            : (res['error'] ?? 'Connection test failed');
      });
    }
  }

  Future<void> _saveSettings() async {
    setState(() => _isSaving = true);
    final key = _apiKeyController.text.trim();
    await _storageService.setApiKey(key);
    await _storageService.setCreatorHandle(_handleController.text.trim());
    setState(() => _isSaving = false);

    await _testConnection();

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Settings saved & verified!'),
          backgroundColor: Colors.green,
        ),
      );
    }
  }

  Future<void> _openGoogleAiStudio() async {
    final uri = Uri.parse('https://aistudio.google.com/app/apikey');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (_isLoading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings & Configuration'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Gemini API Key Section
            Card(
              elevation: 0,
              color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
                side: BorderSide(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5)),
              ),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.auto_awesome, color: theme.colorScheme.primary),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Google Gemini AI API Key',
                            style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'PostCard uses Gemini 1.5 & 2.0 Flash to analyze physical newspaper photos, read columns via OCR, and craft audience posters.',
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _apiKeyController,
                      obscureText: _obscureApiKey,
                      onChanged: (val) {
                        _storageService.setApiKey(val);
                      },
                      decoration: InputDecoration(
                        labelText: 'Gemini API Key',
                        hintText: 'AIzaSy...',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        filled: true,
                        fillColor: theme.colorScheme.surface,
                        suffixIcon: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            IconButton(
                              icon: Icon(_obscureApiKey ? Icons.visibility_off : Icons.visibility),
                              onPressed: () => setState(() => _obscureApiKey = !_obscureApiKey),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Test Connection & Status Button
                    Row(
                      children: [
                        Flexible(
                          child: FilledButton.tonalIcon(
                            onPressed: _isTesting ? null : () => _testConnection(),
                            icon: _isTesting
                                ? const SizedBox(
                                    width: 14,
                                    height: 14,
                                    child: CircularProgressIndicator(strokeWidth: 2),
                                  )
                                : const Icon(Icons.network_check, size: 16),
                            label: Text(
                              _isTesting ? 'Testing...' : 'Test Connection',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        TextButton.icon(
                          onPressed: _openGoogleAiStudio,
                          icon: const Icon(Icons.open_in_new, size: 14),
                          label: const Text('Get Free Key', style: TextStyle(fontSize: 12)),
                        ),
                      ],
                    ),

                    if (_testResult != null) ...[
                      const SizedBox(height: 10),
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: _testSuccess == true
                              ? Colors.green.withValues(alpha: 0.1)
                              : Colors.red.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: _testSuccess == true
                                ? Colors.green.withValues(alpha: 0.3)
                                : Colors.red.withValues(alpha: 0.3),
                          ),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(
                              _testSuccess == true ? Icons.check_circle : Icons.error_outline,
                              size: 16,
                              color: _testSuccess == true ? Colors.green : Colors.red,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _testResult!,
                                style: TextStyle(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w500,
                                  color: _testSuccess == true ? Colors.green.shade800 : Colors.red.shade800,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],

                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: Colors.blue.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.blue.withValues(alpha: 0.2)),
                      ),
                      child: const Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.info_outline, size: 16, color: Colors.blue),
                          SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'When an API key is provided, PostCard directly runs multimodal OCR and generates audience-tailored posters. If offline or without a key, Smart Demo Mode is active.',
                              style: TextStyle(fontSize: 11, color: Colors.blueGrey),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Creator Profile Section
            Card(
              elevation: 0,
              color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
                side: BorderSide(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5)),
              ),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.person_pin_outlined, color: theme.colorScheme.primary),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Creator Attribution',
                            style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Default name or handle stamped onto your created posters and opinion callouts.',
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _handleController,
                      onChanged: (val) => _storageService.setCreatorHandle(val),
                      decoration: InputDecoration(
                        labelText: 'Your Handle or Byline',
                        hintText: '@curator or Your Name',
                        prefixIcon: const Icon(Icons.alternate_email),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        filled: true,
                        fillColor: theme.colorScheme.surface,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),

            // Save Button
            FilledButton.icon(
              onPressed: _isSaving ? null : _saveSettings,
              icon: _isSaving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.save),
              label: Text(_isSaving ? 'Saving...' : 'Save & Verify Preferences'),
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
            const SizedBox(height: 28),

            // How It Works Guide
            Text(
              'How PostCard Works',
              style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 10),
            _buildGuideTile(
              number: '1',
              title: 'Snap Physical Print',
              desc: 'Read a broadsheet or magazine and snap the article photo with your camera.',
            ),
            _buildGuideTile(
              number: '2',
              title: 'Specify Audience & Context',
              desc: 'Select who you are summarizing for: Tech buffs, Execs, Gen-Z, or general public.',
            ),
            _buildGuideTile(
              number: '3',
              title: 'Gemini Multimodal Analysis',
              desc: 'Gemini OCR reads the clipping, rewrites headlines, and designs aesthetic posters.',
            ),
            _buildGuideTile(
              number: '4',
              title: 'Add Your Voice & Source Link',
              desc: 'Add your own take and digital link for readers who want to dive deeper.',
            ),
            _buildGuideTile(
              number: '5',
              title: 'Export & Social Share',
              desc: 'Share exportable posters directly to Instagram, WhatsApp, X, and LinkedIn.',
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGuideTile({
    required String number,
    required String title,
    required String desc,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 12,
            child: Text(number, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                const SizedBox(height: 2),
                Text(desc, style: const TextStyle(fontSize: 12, color: Colors.grey)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
