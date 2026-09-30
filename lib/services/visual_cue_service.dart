class VisualCueService {
  /// Extracts high-signal visual metaphors and concrete keywords
  /// prioritizing the Curator's angle, context, available headline, and story excerpts.
  static List<String> extractKeywords({
    required String curatorAngle,
    required String newsHeadline,
    String? newsBody,
  }) {
    final List<String> prioritized = [];
    final Set<String> seen = {};

    void addPill(String pill) {
      final clean = _cleanPillText(pill);
      if (clean.length >= 3 && clean.length <= 36 && !seen.contains(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        prioritized.add(clean);
      }
    }

    final combinedText = '$curatorAngle $newsHeadline ${newsBody ?? ""}';
    final lowerCombined = combinedText.toLowerCase();

    // 1. Direct High-Signal Concepts from Curator Angle & Context (FIRST PRIORITY!)
    // The user's angle is their unhedged stance/critique, so its core motifs should be #1!
    if (curatorAngle.trim().isNotEmpty) {
      final anglePhrases = _extractMeaningfulPhrases(curatorAngle);
      for (final p in anglePhrases) {
        addPill(p);
      }
    }

    // 2. Direct Subject / Entity / Conflict from Headline (SECOND PRIORITY!)
    if (newsHeadline.trim().isNotEmpty) {
      final headlinePhrases = _extractMeaningfulPhrases(newsHeadline);
      for (final p in headlinePhrases) {
        addPill(p);
      }
    }

    // 3. Domain-Specific Thematic Visual Metaphors matching semantic keywords
    final thematicMetaphors = _matchThematicMetaphors(lowerCombined);
    for (final m in thematicMetaphors) {
      addPill(m);
    }

    // 4. Secondary salient phrases from story body (if available)
    if (newsBody != null && newsBody.trim().isNotEmpty) {
      final bodyPhrases = _extractMeaningfulPhrases(newsBody);
      for (final p in bodyPhrases) {
        addPill(p);
      }
    }

    // 5. Stylistic Noir / Editorial Fallbacks if still fewer than 4 pills
    final fallbacks = [
      'Noir chiaroscuro lighting',
      'Dramatic spotlight',
      'Classical stone colonnades',
      'Tactile vintage broadsheet',
      'Concrete editorial metaphor',
      'Deep negative space',
    ];
    for (final f in fallbacks) {
      if (prioritized.length >= 5) break;
      addPill(f);
    }

    return prioritized.take(6).toList();
  }

  /// Extracts clean, readable headline words from a web URL slug when article text cannot be fetched
  static String extractHeadlineFromUrl(String url) {
    if (url.trim().isEmpty) return '';
    try {
      final uri = Uri.tryParse(url.trim());
      if (uri == null) return '';
      final segments = uri.pathSegments.where((s) => s.trim().isNotEmpty).toList();
      if (segments.isEmpty) return '';

      // Find the segment with the most words/hyphens (typically the article slug)
      String bestSlug = '';
      for (final seg in segments) {
        final cleanSeg = seg.replaceAll(RegExp(r'\.(html|ece|htm|php|cms|amp|asp)$', caseSensitive: false), '');
        if (cleanSeg.length > bestSlug.length && (cleanSeg.contains('-') || cleanSeg.contains('_'))) {
          bestSlug = cleanSeg;
        }
      }
      if (bestSlug.isEmpty && segments.isNotEmpty) {
        bestSlug = segments.last.replaceAll(RegExp(r'\.(html|ece|htm|php|cms|amp|asp)$', caseSensitive: false), '');
      }

      // Remove trailing IDs or timestamps like -101712345 or _20240420
      bestSlug = bestSlug.replaceAll(RegExp(r'[-_]\d{5,}$'), '');

      // Replace hyphens and underscores with spaces
      final words = bestSlug.split(RegExp(r'[-_]+')).where((w) => w.trim().isNotEmpty).toList();
      if (words.isEmpty) return '';

      // Capitalize cleanly
      return words.map((w) {
        if (w.length <= 1) return w.toUpperCase();
        if (_isStopWord(w)) return w.toLowerCase();
        return '${w[0].toUpperCase()}${w.substring(1).toLowerCase()}';
      }).join(' ');
    } catch (_) {
      return '';
    }
  }

  /// Extracts key substantive phrases (1-4 words) from freeform sentences
  static List<String> _extractMeaningfulPhrases(String text) {
    final results = <String>[];
    if (text.trim().isEmpty) return results;

    // Clean text: strip out common meta-prompt prefixes
    String cleaned = text
        .replaceAll(RegExp(r'^(focus on|highlight why|explain for|critique on|stance on|opinion on|angle on)\s+', caseSensitive: false), '')
        .replaceAll(RegExp(r'[\r\n]+'), ' ')
        .trim();

    // Split on punctuation and structural separators
    final segments = cleaned.split(RegExp(r'[,;:.!?|•—–\(\)\[\]"\u201C\u201D\u2018\u2019]+'));
    for (final seg in segments) {
      final trimmed = seg.trim();
      if (trimmed.isEmpty) continue;

      final words = trimmed.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
      if (words.isNotEmpty && words.length <= 4) {
        final phrase = _stripStopWords(words);
        if (phrase.isNotEmpty && phrase.length >= 3) {
          results.add(_toTitleCase(phrase));
        }
      } else if (words.length > 4) {
        // If longer sentence, extract salient noun chunks / phrases of 2-3 words
        for (int i = 0; i < words.length - 1; i++) {
          final w1 = words[i].toLowerCase();
          final w2 = words[i + 1].toLowerCase();
          if (!_isStopWord(w1) && !_isStopWord(w2) && w1.length > 2 && w2.length > 2) {
            final phrase = '$w1 $w2';
            results.add(_toTitleCase(phrase));
            i++; // skip next word to avoid overlapping pairs
          }
        }
      }
    }
    return results;
  }

  /// Matches rich domain visual metaphors based on text keywords
  static List<String> _matchThematicMetaphors(String text) {
    final List<String> metaphors = [];

    if (_hasAny(text, ['wealth', 'fortune', 'asset', 'crore', 'money', 'billion', 'rich', 'affluent', 'opulence', 'accumul', 'shameless', 'greed'])) {
      metaphors.addAll([
        'Scales of justice',
        'Astronomical fortune',
        'Red tape dossiers',
        'Political bandhgala silhouette',
        'Classical stone colonnades',
      ]);
    }

    if (_hasAny(text, ['corrupt', 'bribe', 'scam', 'ed', 'cbi', 'probe', 'arrest', 'charge sheet', 'fraud', 'investigat', 'whistleblower'])) {
      metaphors.addAll([
        'Red tape dossiers',
        'Subpoena ledger',
        'Judicial gavel',
        'Shadowy corridors',
        'Classical colonnades',
      ]);
    }

    if (_hasAny(text, ['election', 'vote', 'ballot', 'eci', 'polling', 'campaign', 'candidate', 'democracy', 'transparency'])) {
      metaphors.addAll([
        'EVM control console',
        'Indelible ink bottle mark',
        'Ballot box silhouette',
        'Colonnades of parliament',
        'Diplomatic microphone',
      ]);
    }

    if (_hasAny(text, ['court', 'judge', 'verdict', 'justice', 'supreme court', 'law', 'legal', 'petition', 'ruling', 'bench'])) {
      metaphors.addAll([
        'Judicial gavel',
        'Blindfolded justice silhouette',
        'Supreme Court marble steps',
        'Official legal parchment',
        'Classical colonnades',
      ]);
    }

    if (_hasAny(text, ['protest', 'campus', 'student', 'university', 'strike', 'demonstrat', 'rally', 'march', 'police', 'barricade'])) {
      metaphors.addAll([
        'Megaphones & placards',
        'Police barricades',
        'Historic campus archway',
        'Dramatic spotlight',
        'Torn paper notices',
      ]);
    }

    if (_hasAny(text, ['quantum', 'qubit', 'supercomput', 'physics', 'chip', 'semiconductor', 'hardware', 'nvidia'])) {
      metaphors.addAll([
        'Quantum superconducting core',
        'Decoherence barrier',
        'Silicon microchip array',
        'Cryogenic mist',
        'Laser interferometry',
      ]);
    } else if (_hasAny(text, ['ai', 'artificial intelligence', 'algorithm', 'model', 'llm', 'deep learning', 'tech', 'cyber', 'data', 'cloud'])) {
      metaphors.addAll([
        'Server racks in darkness',
        'Opaque black box',
        'Silicon wafer reflections',
        'Fiber optic glow',
        'Surveillance lens',
      ]);
    }

    if (_hasAny(text, ['climate', 'carbon', 'emission', 'heat', 'flood', 'drought', 'energy', 'oil', 'coal', 'planet', 'green', 'pollution'])) {
      metaphors.addAll([
        'Smokestacks in twilight',
        'Cracked dry earth',
        'Satellite thermal map',
        'Submerged coastline',
        'Hourglass with rising water',
      ]);
    }

    if (_hasAny(text, ['market', 'stock', 'inflation', 'trade', 'tariff', 'fed', 'rbi', 'bank', 'economy', 'interest rate', 'dollar', 'rupee', 'budget'])) {
      metaphors.addAll([
        'Wall street ticker tape',
        'Heavy bank vault door',
        'Rising interest graph',
        'Gold bullion bars',
        'Stock exchange trading floor',
      ]);
    }

    if (_hasAny(text, ['work', 'job', 'workweek', 'office', 'burnout', 'corporate', 'meeting', 'employee', 'labor', 'company', 'salary', 'overtime'])) {
      metaphors.addAll([
        'Empty boardroom chairs',
        'Wall clock at twilight',
        'Office skyscraper window',
        'Executive desk ledger',
        'Shedding red tape',
      ]);
    }

    if (_hasAny(text, ['paper', 'print', 'book', 'read', 'newspaper', 'broadsheet', 'screen fatigue', 'doomscroll', 'magazine', 'newsstand'])) {
      metaphors.addAll([
        'Tactile vintage broadsheet',
        'Ragged torn newsprint',
        'Serif ink typography',
        'Coffee on wooden desk',
        'Shattered smartphone screen',
      ]);
    }

    if (_hasAny(text, ['war', 'conflict', 'border', 'military', 'army', 'defense', 'missile', 'drone', 'security', 'geopolitic'])) {
      metaphors.addAll([
        'Barbed wire barricades',
        'Surveillance radar',
        'Diplomatic summit podium',
        'Tactical map overlay',
      ]);
    }

    if (_hasAny(text, ['space', 'isro', 'nasa', 'rocket', 'moon', 'mars', 'satellite', 'orbit', 'galaxy'])) {
      metaphors.addAll([
        'Launchpad gantry in twilight',
        'Orbital satellite telemetry',
        'Deep space nebula',
        'Cratered lunar surface',
      ]);
    }

    return metaphors;
  }

  static bool _hasAny(String text, List<String> terms) {
    for (final t in terms) {
      if (text.contains(t)) return true;
    }
    return false;
  }

  static final Set<String> _stopWords = {
    'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up',
    'about', 'into', 'over', 'after', 'than', 'this', 'that', 'these',
    'those', 'it', 'its', 'as', 'if', 'be', 'been', 'has', 'have', 'had',
    'why', 'how', 'what', 'when', 'where', 'which', 'who', 'whom',
    'very', 'more', 'most', 'some', 'any', 'all', 'such', 'not', 'no',
    'just', 'then', 'so', 'can', 'will', 'would', 'could', 'should',
    'focus', 'highlight', 'explain', 'show', 'make', 'give', 'says', 'said',
  };

  static bool _isStopWord(String word) => _stopWords.contains(word.toLowerCase());

  static String _stripStopWords(List<String> words) {
    int start = 0;
    while (start < words.length && _isStopWord(words[start])) {
      start++;
    }
    int end = words.length - 1;
    while (end >= start && _isStopWord(words[end])) {
      end--;
    }
    if (start > end) return '';
    return words.sublist(start, end + 1).join(' ');
  }

  static String _cleanPillText(String text) {
    var clean = text.replaceAll(RegExp(r"""^[\s"“'#\d.:-]+|[\s"”'.:-]+$"""), '').trim();
    if (clean.length > 36) {
      clean = clean.substring(0, 36).trim();
    }
    return _toTitleCase(clean);
  }

  static String _toTitleCase(String text) {
    return text.split(' ').map((w) {
      if (w.isEmpty) return '';
      if (_isStopWord(w)) return w.toLowerCase();
      return '${w[0].toUpperCase()}${w.substring(1)}';
    }).join(' ');
  }

  /// Formats ordered word pills into a prioritized prompt instruction string
  static String formatOrderedPillsForPrompt(List<String> pills) {
    if (pills.isEmpty) return '';
    final buffer = StringBuffer();
    for (int i = 0; i < pills.length; i++) {
      final pill = pills[i].trim();
      if (pill.isEmpty) continue;
      if (i == 0) {
        buffer.writeln('#1 [PRIMARY DOMINANT VISUAL FOCUS]: $pill');
      } else if (i == 1) {
        buffer.writeln('#2 [SECONDARY SUPPORTING MOTIF]: $pill');
      } else {
        buffer.writeln('#${i + 1} [ATMOSPHERIC PROP / CONTEXT]: $pill');
      }
    }
    return buffer.toString().trim();
  }

  /// Parses pills back from a prompt or string containing priority formatted lines
  static List<String> parsePillsFromPrompt(String prompt) {
    if (prompt.trim().isEmpty) return [];
    final lines = prompt.split('\n');
    final pills = <String>[];
    for (final line in lines) {
      final trimmed = line.trim();
      if (trimmed.isEmpty) continue;
      final colonIndex = trimmed.indexOf(':');
      if (colonIndex != -1 && trimmed.startsWith('#')) {
        final cue = trimmed.substring(colonIndex + 1).trim();
        if (cue.isNotEmpty && !pills.contains(cue)) {
          pills.add(cue);
        }
      } else if (!trimmed.startsWith('#') && !pills.contains(trimmed)) {
        pills.add(trimmed);
      }
    }
    return pills;
  }
}
