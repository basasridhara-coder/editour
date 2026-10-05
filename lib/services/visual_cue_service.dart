class VisualCueService {
  /// Extracts the 6 ranked storytelling dimensions:
  /// #1 HERO (Central figure / subject)
  /// #2 MOTIF (Symbolic metaphor reflecting curator angle)
  /// #3 TENSION (Opposing friction / conflict / consequence)
  /// #4 ATMOSPHERE (Setting / environment / scale)
  /// #5 LIGHTING (Chiaroscuro & dramatic illumination)
  /// #6 STYLE (Artistic medium & poster grammar)
  static List<String> extract6RankedCueDimensions({
    required String curatorAngle,
    required String newsHeadline,
    String? newsBody,
  }) {
    final combined = '$curatorAngle $newsHeadline ${newsBody ?? ""}'.toLowerCase();
    final isIndia = combined.contains('india') || combined.contains('delhi') || combined.contains('thehindu') || combined.contains('mumbai') || combined.contains('rupee');
    final isUK = combined.contains('london') || combined.contains('westminster') || combined.contains('uk ') || combined.contains('britain');

    // 1. HERO (Subject from headline or angle)
    String hero = '';
    if (combined.contains('garbage') || combined.contains('trash') || combined.contains('waste') || combined.contains('clean')) {
      hero = isIndia ? 'Municipal Sweeper with Traditional Reed Broom' : 'Lone Sweeper with Traditional Broom';
    } else if (combined.contains('ai') || combined.contains('tech') || combined.contains('silicon') || combined.contains('data center')) {
      hero = 'Monolithic Server Tower';
    } else if (combined.contains('market') || combined.contains('invest') || combined.contains('wealth') || combined.contains('billion') || combined.contains('stock')) {
      hero = isIndia ? 'Dalal Street Bull Monument Silhouette' : 'Silhouetted Wall Street Bull';
    } else if (combined.contains('polit') || combined.contains('elect') || combined.contains('minister') || combined.contains('leader') || combined.contains('vote')) {
      hero = isIndia ? 'Indian Parliament Sandstone Colonnade' : 'Solitary Figure at Microphone';
    } else if (combined.contains('court') || combined.contains('judge') || combined.contains('law') || combined.contains('case') || combined.contains('crime') || combined.contains('goon')) {
      hero = isIndia ? 'Supreme Court of India Pillared Portico' : (isUK ? 'Old Bailey Gilded Scales of Justice' : 'Gavel & Broken Stone Pillar');
    } else if (newsHeadline.trim().isNotEmpty) {
      final phrases = _extractMeaningfulPhrases(newsHeadline);
      hero = phrases.isNotEmpty ? phrases.first : 'Central Editorial Subject';
    } else {
      hero = 'Solitary Focal Figure';
    }

    // 2. MOTIF (Core Metaphor from Curator Angle)
    String motif = '';
    if (combined.contains('court') || combined.contains('crime') || combined.contains('scale') || combined.contains('justice') || combined.contains('balance') || combined.contains('fair')) {
      motif = isIndia ? 'Ashoka Lion Capital & Scales of Justice' : 'Tipping Scales of Justice';
    } else if (combined.contains('mind') && (combined.contains('garbage') || combined.contains('trash') || combined.contains('clean'))) {
      motif = 'Mind Silhouette Filled with Plastic Waste';
    } else if (combined.contains('puppet') || combined.contains('control') || combined.contains('manipulat')) {
      motif = 'Tangled Marionette Puppet Strings';
    } else if (combined.contains('hourglass') || combined.contains('time') || combined.contains('delay') || combined.contains('wait')) {
      motif = 'Crumbling Glass Hourglass';
    } else if (combined.contains('power') || combined.contains('grid') || combined.contains('cable') || combined.contains('energy')) {
      motif = 'Tangled High-Voltage Cables';
    } else if (curatorAngle.trim().isNotEmpty) {
      final anglePhrases = _extractMeaningfulPhrases(curatorAngle);
      motif = anglePhrases.isNotEmpty ? anglePhrases.first : 'Symbolic Editorial Metaphor';
    } else {
      final thematic = _matchThematicMetaphors(combined);
      motif = thematic.isNotEmpty ? thematic.first : 'Abstract Conceptual Metaphor';
    }

    // 3. TENSION (Conflict / Friction / Obstacle)
    String tension = '';
    if (combined.contains('court') || combined.contains('crime')) {
      tension = 'Swarm of Shadows around Court Gates';
    } else if (combined.contains('garbage') || combined.contains('throw') || combined.contains('dirty') || combined.contains('street')) {
      tension = 'Hands Dropping Trash Behind Sweeper';
    } else if (combined.contains('storm') || combined.contains('threat') || combined.contains('crisis')) {
      tension = 'Approaching Storm Wall';
    } else if (combined.contains('crack') || combined.contains('fall') || combined.contains('collaps')) {
      tension = 'Cracking Foundation Beneath';
    } else if (combined.contains('surveil') || combined.contains('monitor') || combined.contains('watch')) {
      tension = 'Unblinking Mechanical Eye';
    } else if (combined.contains('greed') || combined.contains('inequal') || combined.contains('shadow')) {
      tension = 'Looming Corporate Shadow';
    } else {
      tension = 'Friction & Opposing Shadows';
    }

    // 4. ATMOSPHERE (Setting / Environment)
    String atmosphere = '';
    if (combined.contains('court') || combined.contains('legal') || combined.contains('parliament')) {
      atmosphere = isIndia ? 'Dusk over New Delhi Red Sandstone Corridor' : (isUK ? 'Rain-Mist Westminster Stone Embankment' : 'Colonnaded Classical Chamber');
    } else if (combined.contains('street') || combined.contains('city') || combined.contains('road') || combined.contains('urban')) {
      atmosphere = isIndia ? 'Monsoon-Drenched Indian City Boulevard' : 'Damp Morning City Boulevard';
    } else if (combined.contains('board') || combined.contains('exec') || combined.contains('corp')) {
      atmosphere = 'Smoke-Filled Boardroom';
    } else if (combined.contains('cyber') || combined.contains('digital') || combined.contains('data')) {
      atmosphere = 'Brutalist Concrete Server Canyon';
    } else if (combined.contains('trade') || combined.contains('stock') || combined.contains('wall street')) {
      atmosphere = isIndia ? 'Dalal Street Trading Floor at Dusk' : 'Empty Trading Floor at Dusk';
    } else {
      atmosphere = 'Atmospheric Urban Crossroads';
    }

    // 5. LIGHTING (Chiaroscuro & Mood)
    String lighting = '';
    if (combined.contains('street') || combined.contains('dawn') || combined.contains('morning')) {
      lighting = 'Single Harsh Streetlamp Spotlight';
    } else if (combined.contains('dark') || combined.contains('noir') || combined.contains('secret') || combined.contains('investig')) {
      lighting = 'Deep Chiaroscuro Silhouette';
    } else if (combined.contains('neon') || combined.contains('tech') || combined.contains('futur')) {
      lighting = 'Eerie Volumetric Neon Cyan Glow';
    } else {
      lighting = 'Dramatic Chiaroscuro Spotlight';
    }

    // 6. STYLE (Print Medium & Movement)
    String style = '';
    if (isIndia) {
      style = 'Editorial Sandstone & Indigo Broadsheet Woodcut';
    } else if (combined.contains('tech') || combined.contains('modern') || combined.contains('futur')) {
      style = 'Bauhaus Geometric Vector Poster';
    } else if (combined.contains('historic') || combined.contains('classic') || combined.contains('book') || combined.contains('paper')) {
      style = 'Vintage Woodcut Broadsheet Engraving';
    } else {
      style = 'High-Contrast Noir Risograph Print';
    }

    return [
      _cleanPillText(hero),
      _cleanPillText(motif),
      _cleanPillText(tension),
      _cleanPillText(atmosphere),
      _cleanPillText(lighting),
      _cleanPillText(style),
    ];
  }

  /// Extracts keywords prioritizing 6 ranked dimensions
  static List<String> extractKeywords({
    required String curatorAngle,
    required String newsHeadline,
    String? newsBody,
  }) {
    return extract6RankedCueDimensions(
      curatorAngle: curatorAngle,
      newsHeadline: newsHeadline,
      newsBody: newsBody,
    );
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

  /// Formats ordered word pills into a prioritized prompt instruction string mapping the 6 dimensions
  static String formatOrderedPillsForPrompt(List<String> pills) {
    if (pills.isEmpty) return '';
    final buffer = StringBuffer();
    final dimensionLabels = [
      '#1 [HERO - PRIMARY DOMINANT SUBJECT FOCUS]',
      '#2 [MOTIF - CORE EDITORIAL METAPHOR & STANCE]',
      '#3 [TENSION - CONFLICTING FORCE & STAKES]',
      '#4 [ATMOSPHERE - ENVIRONMENTAL SETTING & SCALE]',
      '#5 [LIGHTING - CHIAROSCURO & DRAMATIC MOOD]',
      '#6 [STYLE - ARTISTIC MEDIUM & POSTER GRAMMAR]',
    ];
    for (int i = 0; i < pills.length; i++) {
      final pill = pills[i].trim();
      if (pill.isEmpty) continue;
      final label = i < dimensionLabels.length ? dimensionLabels[i] : '#${i + 1} [SUPPORTING CUE]';
      buffer.writeln('$label: $pill');
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

  /// Supplies alternative visual cues that exclude already kept cues
  static List<String> getAlternativeCues({
    required List<String> existingKeptCues,
    required int countNeeded,
    String curatorAngle = '',
    String newsHeadline = '',
  }) {
    final allDimensionCues = [
      'Lone Sweeper with Traditional Broom',
      'Silhouetted Titan in Corporate Suit',
      'Wall Street Bull Behind Barbed Wire',
      'Whistleblower in Shadowed Corridor',
      'Lone Chessmaster with Tipped King',
      'Mind Silhouette Filled with Plastic Waste',
      'Tangled Marionette Puppet Strings',
      'Tipping Scales of Justice',
      'Melting Mechanical Clock',
      'Tangled High-Voltage Cables',
      'Hands Dropping Trash Behind Sweeper',
      'Approaching Storm Wall on Horizon',
      'Cracking Ice Sheet Beneath Footsteps',
      'Watchful Surveillance Camera Lens',
      'Looming Shadow Over Small Figure',
      'Damp Morning Boulevard with Reflections',
      'Boardroom Dense with Blue Cigar Smoke',
      'Towering Brutalist Concrete Facade',
      'Trading Floor Strewn with Ticker Tape',
      'Neon-Drenched Cyber Alleyway',
      'Single High-Intensity Streetlamp Beam',
      'Noir Chiaroscuro Slanted Shadows',
      'Volumetric Sunlight Rays Through Smog',
      'Eerie Blue Screen Neon Glow',
      'Golden Hour Sunset Silhouette',
      'High-Contrast Noir Risograph',
      'Minimalist Bauhaus Color Blocking',
      'Pop Graphic Screenprint Poster',
      'Vintage Broadsheet Newspaper Grammar',
      'Dramatic Graphic Novel Ink Illustration',
    ];

    final result = <String>[];
    for (final cue in allDimensionCues) {
      if (!existingKeptCues.contains(cue) && !result.contains(cue)) {
        result.add(cue);
        if (result.length >= countNeeded) break;
      }
    }
    return result;
  }
}
