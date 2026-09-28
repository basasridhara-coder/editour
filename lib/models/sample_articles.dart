class SampleArticle {
  final String title;
  final String publication;
  final String date;
  final String category;
  final String rawArticleText;
  final String suggestedAudience;
  final String suggestedTone;
  final String defaultContext;
  final String pullQuote;
  final String metric;
  final String webLink;

  const SampleArticle({
    required this.title,
    required this.publication,
    required this.date,
    required this.category,
    required this.rawArticleText,
    required this.suggestedAudience,
    required this.suggestedTone,
    required this.defaultContext,
    required this.pullQuote,
    required this.metric,
    required this.webLink,
  });

  static const List<SampleArticle> samples = [
    SampleArticle(
      title: 'Commercial Quantum Computing Hits Milestone with Fault-Tolerant Qubits',
      publication: 'The Global Science Monitor',
      date: 'September 24, 2026',
      category: 'DEEP TECH',
      rawArticleText: '''
In what physicists are heralding as a watershed moment for computing, researchers at the Geneva Applied Physics Consortium announced the successful operation of 1,024 logical fault-tolerant qubits with error rates below the threshold of decoherence.

Unlike classical supercomputers that calculate in binary states, this new hybrid superconducting array demonstrated complex molecular simulations in under four minutes—a calculation that would have required classical computing clusters roughly 8,000 years to solve.

Commercial pharmaceutical partners have already begun deploying the architecture to synthesize enzymes targeting antibiotic-resistant pathogens. While cryogenic cooling requirements remain substantial, the commercialization timeline has officially shrunk by an estimated five years according to industry analysts.
''',
      suggestedAudience: 'Tech Enthusiasts',
      suggestedTone: 'Deep-dive & Analytical',
      defaultContext: 'Focus on how this disrupts cybersecurity and pharmaceutical discovery',
      pullQuote: 'Calculations that once demanded 8,000 supercomputer years resolved in under 240 seconds.',
      metric: '1,024 Qubits',
      webLink: 'https://news.google.com/search?q=fault+tolerant+quantum+computing+milestone',
    ),
    SampleArticle(
      title: 'The Great Paper Revival: Why Print Subscriptions Surge Among Gen-Z Readers',
      publication: 'Sunday Herald Cultural Review',
      date: 'September 20, 2026',
      category: 'CULTURE & MEDIA',
      rawArticleText: '''
Tired of digital fatigue, endless push notifications, and algorithmic outrage, readers aged 18 to 27 are driving an unexpected revival in physical newspaper and literary magazine subscriptions. 

Independent newsstands in London, Tokyo, and New York report print sales up by 34% year-over-year. Readers cite the tactile sensation of paper, uninterrupted focus, and the finality of a curated edition that has a definitive end rather than an endless doomscroll.

"When you open a broadsheet with coffee on a Sunday morning, you regain control over your attention," says cultural anthropologist Elena Vance. Major publications are taking note, redesigning tactile print formats with collectible typography and long-form visual journalism.
''',
      suggestedAudience: 'Gen-Z / Social',
      suggestedTone: 'Catchy & Punchy',
      defaultContext: 'Highlight why screen fatigue is pushing youth back to tangible rituals',
      pullQuote: 'When you open a broadsheet, you regain control over your attention from the algorithms.',
      metric: '+34% Sales',
      webLink: 'https://news.google.com/search?q=print+newspaper+revival+among+young+readers',
    ),
    SampleArticle(
      title: 'The Four-Day Workweek Yields Record Profitability Across 200 Multi-Nationals',
      publication: 'The Financial Standard',
      date: 'September 18, 2026',
      category: 'BUSINESS & WORK',
      rawArticleText: '''
A landmark two-year longitudinal study tracking 214 corporations across Europe and North America that adopted 32-hour workweeks with zero pay reduction revealed striking conclusions: overall revenues increased by 14.2%, employee burnout dropped by 67%, and sick-day utilization plummeted.

Contrary to conventional industrial doctrine, managers reported that compressed schedules eliminated redundant sync meetings and forced hyper-focused asynchronous communication.

"We did not lose 20% of work; we shed 20% of bureaucratic theater," explained chief human resources officer Marcus Lindqvist. Over 92% of participating companies confirmed the four-day schedule is now permanent policy.
''',
      suggestedAudience: 'Busy Executives',
      suggestedTone: 'Concise & Actionable',
      defaultContext: 'Emphasize bottom-line revenue gains and reduction in corporate overhead',
      pullQuote: 'We did not lose 20% of our work; we eliminated 20% of bureaucratic theater.',
      metric: '+14.2% Revenue',
      webLink: 'https://news.google.com/search?q=four+day+workweek+study+results',
    ),
  ];
}
