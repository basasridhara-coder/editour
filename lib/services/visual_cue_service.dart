class VisualCueService {
  /// Extracts high-signal visual metaphors and concrete keywords
  /// based on the curator's angle context and extracted news content.
  static List<String> extractKeywords({
    required String curatorAngle,
    required String newsHeadline,
    String? newsBody,
  }) {
    final combined = '${curatorAngle.toLowerCase()} ${newsHeadline.toLowerCase()} ${(newsBody ?? "").toLowerCase()}';
    final Set<String> results = {};

    // 1. Specific Thematic Visual Metaphors based on Content & Angle
    if (_hasAny(combined, ['wealth', 'fortune', 'asset', 'crore', 'money', 'billion', 'rich', 'affluent', 'opulence', 'accumul', 'shameless'])) {
      results.add('Scales of justice');
      results.add('Astronomical fortune');
      results.add('Red tape dossiers');
      results.add('Political bandhgala silhouette');
      results.add('Classical stone colonnades');
    } else if (_hasAny(combined, ['corrupt', 'bribe', 'scam', 'ed', 'cbi', 'probe', 'arrest', 'charge sheet', 'fraud', 'investigat'])) {
      results.add('Red tape dossiers');
      results.add('Subpoena ledger');
      results.add('Judicial gavel');
      results.add('Shadowy corridors');
      results.add('Classical colonnades');
    }

    if (_hasAny(combined, ['election', 'vote', 'ballot', 'eci', 'polling', 'campaign', 'candidate', 'democracy'])) {
      results.add('EVM control console');
      results.add('Indelible ink bottle mark');
      results.add('Ballot box silhouette');
      results.add('Colonnades of parliament');
      results.add('Diplomatic microphone');
    }

    if (_hasAny(combined, ['protest', 'campus', 'student', 'university', 'strike', 'demonstrat', 'rally', 'march'])) {
      results.add('Megaphones & placards');
      results.add('Police barricades');
      results.add('Historic campus archway');
      results.add('Dramatic spotlight');
      results.add('Torn paper notices');
    }

    if (_hasAny(combined, ['quantum', 'qubit', 'supercomput', 'physics', 'chip', 'semiconductor', 'hardware'])) {
      results.add('Quantum superconducting core');
      results.add('Decoherence barrier');
      results.add('Silicon microchip array');
      results.add('Cryogenic mist');
      results.add('Laser interferometry');
    } else if (_hasAny(combined, ['ai', 'artificial intelligence', 'algorithm', 'model', 'llm', 'deep learning', 'tech', 'cyber', 'data', 'cloud'])) {
      results.add('Server racks in darkness');
      results.add('Opaque black box');
      results.add('Silicon wafer reflections');
      results.add('Fiber optic glow');
      results.add('Surveillance lens');
    }

    if (_hasAny(combined, ['climate', 'carbon', 'emission', 'heat', 'flood', 'drought', 'energy', 'oil', 'coal', 'planet', 'green'])) {
      results.add('Smokestacks in twilight');
      results.add('Cracked dry earth');
      results.add('Satellite thermal map');
      results.add('Submerged coastline');
      results.add('Hourglass with rising water');
    }

    if (_hasAny(combined, ['market', 'stock', 'inflation', 'trade', 'tariff', 'fed', 'rbi', 'bank', 'economy', 'interest rate', 'dollar', 'rupee'])) {
      results.add('Wall street ticker tape');
      results.add('Heavy bank vault door');
      results.add('Rising interest graph');
      results.add('Gold bullion bars');
      results.add('Stock exchange trading floor');
    }

    if (_hasAny(combined, ['work', 'job', 'workweek', 'office', 'burnout', 'corporate', 'meeting', 'employee', 'labor', 'company'])) {
      results.add('Empty boardroom chairs');
      results.add('Wall clock at twilight');
      results.add('Office skyscraper window');
      results.add('Executive desk ledger');
      results.add('Shedding red tape');
    }

    if (_hasAny(combined, ['paper', 'print', 'book', 'read', 'newspaper', 'broadsheet', 'screen fatigue', 'doomscroll', 'magazine', 'newsstand'])) {
      results.add('Tactile vintage broadsheet');
      results.add('Ragged torn newsprint');
      results.add('Serif ink typography');
      results.add('Coffee on wooden desk');
      results.add('Shattered smartphone screen');
    }

    if (_hasAny(combined, ['court', 'judge', 'verdict', 'justice', 'supreme court', 'law', 'legal', 'petition', 'ruling'])) {
      results.add('Judicial gavel');
      results.add('Blindfolded justice silhouette');
      results.add('Supreme Court marble steps');
      results.add('Official legal parchment');
      results.add('Classical colonnades');
    }

    // 2. Extract key distinctive phrases from Curator's Angle if specified
    if (curatorAngle.trim().isNotEmpty) {
      final angleWords = curatorAngle.trim().split(RegExp(r'[,;.\n]+'));
      for (final phrase in angleWords) {
        final clean = phrase.trim();
        if (clean.length >= 4 && clean.length <= 32 && !_isGenericPhrase(clean)) {
          // Capitalize phrase cleanly
          final capitalized = clean.split(' ').map((w) => w.isNotEmpty ? '${w[0].toUpperCase()}${w.substring(1)}' : '').join(' ');
          if (!results.contains(capitalized)) {
            // Insert at the front so curator's exact angle words take immediate priority!
            results.add(capitalized);
          }
        }
      }
    }

    // 3. Fallback defaults if few results matched
    if (results.length < 3) {
      results.add('Noir chiaroscuro lighting');
      results.add('Dramatic spotlight');
      results.add('Editorial institutional silhouette');
      results.add('Concrete symbolic metaphor');
    }

    return results.take(6).toList();
  }

  static bool _hasAny(String text, List<String> terms) {
    for (final t in terms) {
      if (text.contains(t)) return true;
    }
    return false;
  }

  static bool _isGenericPhrase(String text) {
    final lower = text.toLowerCase();
    return lower.startsWith('focus on') ||
        lower.startsWith('highlight why') ||
        lower.startsWith('explain for') ||
        lower.contains('and then') ||
        lower.contains('because of');
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
