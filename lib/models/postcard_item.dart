import 'dart:convert';
import 'poster_style_config.dart';

class PostCardItem {
  final String id;
  final DateTime createdAt;
  final String originalPhotoPath;
  final String? originalHeadline;
  final String? publicationName;
  final String targetAudience;
  final String tone;
  final String? userContext;
  final String adaptedHeadline;
  final String hook;
  final String summary;
  final String? whyItMatters;
  final List<String> keyTakeaways;
  final String? pullQuote;
  final String? keyMetric;
  final String categoryBadge;
  final String? digitalLink;
  final String? creatorOpinion;
  final String? creatorHandle;
  final PosterStyleType posterStyle;
  final String? renderedPosterPath;
  final String? illustrationPrompt;
  final String? illustrationBase64;
  final String? curatorIllustrationPrompt;
  final String? curatorIllustrationBase64;
  final double visualArtRatio;
  final String? infographicType;
  final List<String> infographicStats;
  final String? visualMood;
  final bool isUserCreated;
  final String sourceType; // 'photo' | 'digital_link' | 'book_excerpt'
  final String? bookCoverPhotoPath;
  final List<String> bookExcerptPhotoPaths;
  final String? bookTitle;
  final String? bookAuthor;
  final String? curatorAngle;
  final String? hookCues;
  final String? bookCoverBase64;
  final String postFormat; // 'editorial_briefing' | 'carousel_trio'
  final String? receiptHighlightQuote;
  final List<String> articleExcerpts;

  bool get isDigitalLinkSource =>
      sourceType == 'digital_link' ||
      originalPhotoPath.startsWith('http') ||
      originalPhotoPath == 'digital_article_link' ||
      (originalPhotoPath.isEmpty && digitalLink != null && digitalLink!.isNotEmpty);

  bool get isBookExcerpt => sourceType == 'book_excerpt';

  bool get isCarouselTrio => postFormat == 'carousel_trio';

  List<String> get resolvedArticleExcerpts {
    final List<String> list = List<String>.from(
      articleExcerpts.map((e) => e.trim()).where((e) => e.isNotEmpty),
    );
    if (list.length >= 3) {
      return list.take(3).toList();
    }
    if (list.isEmpty) {
      if (receiptHighlightQuote != null && receiptHighlightQuote!.trim().isNotEmpty) {
        list.add(receiptHighlightQuote!.trim());
      } else if (pullQuote != null && pullQuote!.trim().isNotEmpty) {
        list.add(pullQuote!.trim());
      }
    }
    for (final t in keyTakeaways) {
      if (list.length >= 3) break;
      final clean = t.trim();
      if (!clean.toLowerCase().contains('curator') &&
          !clean.toLowerCase().contains('my angle') &&
          !clean.toLowerCase().contains('i argue') &&
          clean.length > 20 &&
          !list.contains(clean)) {
        list.add(clean);
      }
    }
    if (list.length < 3 && summary.isNotEmpty) {
      final parts = summary.split(RegExp(r'\.\s+|\n+'));
      for (final p in parts) {
        if (list.length >= 3) break;
        final clean = p.trim().endsWith('.') ? p.trim() : '${p.trim()}.';
        if (!clean.toLowerCase().contains('curator') &&
            !clean.toLowerCase().contains('my angle') &&
            clean.length > 25 &&
            !list.contains(clean)) {
          list.add(clean);
        }
      }
    }
    return list;
  }

  PostCardItem({
    required this.id,
    required this.createdAt,
    required this.originalPhotoPath,
    this.originalHeadline,
    this.publicationName,
    required this.targetAudience,
    required this.tone,
    this.userContext,
    required this.adaptedHeadline,
    required this.hook,
    required this.summary,
    this.whyItMatters,
    required this.keyTakeaways,
    this.pullQuote,
    this.keyMetric,
    required this.categoryBadge,
    this.digitalLink,
    this.creatorOpinion,
    this.creatorHandle,
    this.posterStyle = PosterStyleType.editorial,
    this.renderedPosterPath,
    this.illustrationPrompt,
    this.illustrationBase64,
    this.curatorIllustrationPrompt,
    this.curatorIllustrationBase64,
    this.visualArtRatio = 0.6,
    this.infographicType,
    this.infographicStats = const [],
    this.visualMood,
    this.isUserCreated = false,
    this.sourceType = 'photo',
    this.bookCoverPhotoPath,
    this.bookExcerptPhotoPaths = const [],
    this.bookTitle,
    this.bookAuthor,
    this.curatorAngle,
    this.hookCues,
    this.bookCoverBase64,
    this.postFormat = 'editorial_briefing',
    this.receiptHighlightQuote,
    this.articleExcerpts = const [],
  });

  PostCardItem copyWith({
    String? id,
    DateTime? createdAt,
    String? originalPhotoPath,
    String? originalHeadline,
    String? publicationName,
    String? targetAudience,
    String? tone,
    String? userContext,
    String? adaptedHeadline,
    String? hook,
    String? summary,
    String? whyItMatters,
    List<String>? keyTakeaways,
    String? pullQuote,
    String? keyMetric,
    String? categoryBadge,
    String? digitalLink,
    String? creatorOpinion,
    String? creatorHandle,
    PosterStyleType? posterStyle,
    String? renderedPosterPath,
    String? illustrationPrompt,
    String? illustrationBase64,
    String? curatorIllustrationPrompt,
    String? curatorIllustrationBase64,
    double? visualArtRatio,
    String? infographicType,
    List<String>? infographicStats,
    String? visualMood,
    bool? isUserCreated,
    String? sourceType,
    String? bookCoverPhotoPath,
    List<String>? bookExcerptPhotoPaths,
    String? bookTitle,
    String? bookAuthor,
    String? curatorAngle,
    String? hookCues,
    String? bookCoverBase64,
    String? postFormat,
    String? receiptHighlightQuote,
    List<String>? articleExcerpts,
  }) {
    return PostCardItem(
      id: id ?? this.id,
      createdAt: createdAt ?? this.createdAt,
      originalPhotoPath: originalPhotoPath ?? this.originalPhotoPath,
      originalHeadline: originalHeadline ?? this.originalHeadline,
      publicationName: publicationName ?? this.publicationName,
      targetAudience: targetAudience ?? this.targetAudience,
      tone: tone ?? this.tone,
      userContext: userContext ?? this.userContext,
      adaptedHeadline: adaptedHeadline ?? this.adaptedHeadline,
      hook: hook ?? this.hook,
      summary: summary ?? this.summary,
      whyItMatters: whyItMatters ?? this.whyItMatters,
      keyTakeaways: keyTakeaways ?? this.keyTakeaways,
      pullQuote: pullQuote ?? this.pullQuote,
      keyMetric: keyMetric ?? this.keyMetric,
      categoryBadge: categoryBadge ?? this.categoryBadge,
      digitalLink: digitalLink ?? this.digitalLink,
      creatorOpinion: creatorOpinion ?? this.creatorOpinion,
      creatorHandle: creatorHandle ?? this.creatorHandle,
      posterStyle: posterStyle ?? this.posterStyle,
      renderedPosterPath: renderedPosterPath ?? this.renderedPosterPath,
      illustrationPrompt: illustrationPrompt ?? this.illustrationPrompt,
      illustrationBase64: illustrationBase64 ?? this.illustrationBase64,
      curatorIllustrationPrompt: curatorIllustrationPrompt ?? this.curatorIllustrationPrompt,
      curatorIllustrationBase64: curatorIllustrationBase64 ?? this.curatorIllustrationBase64,
      visualArtRatio: visualArtRatio ?? this.visualArtRatio,
      infographicType: infographicType ?? this.infographicType,
      infographicStats: infographicStats ?? this.infographicStats,
      visualMood: visualMood ?? this.visualMood,
      isUserCreated: isUserCreated ?? this.isUserCreated,
      sourceType: sourceType ?? this.sourceType,
      bookCoverPhotoPath: bookCoverPhotoPath ?? this.bookCoverPhotoPath,
      bookExcerptPhotoPaths: bookExcerptPhotoPaths ?? this.bookExcerptPhotoPaths,
      bookTitle: bookTitle ?? this.bookTitle,
      bookAuthor: bookAuthor ?? this.bookAuthor,
      curatorAngle: curatorAngle ?? this.curatorAngle,
      hookCues: hookCues ?? this.hookCues,
      bookCoverBase64: bookCoverBase64 ?? this.bookCoverBase64,
      postFormat: postFormat ?? this.postFormat,
      receiptHighlightQuote: receiptHighlightQuote ?? this.receiptHighlightQuote,
      articleExcerpts: articleExcerpts ?? this.articleExcerpts,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'createdAt': createdAt.toIso8601String(),
      'originalPhotoPath': originalPhotoPath,
      'originalHeadline': originalHeadline,
      'publicationName': publicationName,
      'targetAudience': targetAudience,
      'tone': tone,
      'userContext': userContext,
      'adaptedHeadline': adaptedHeadline,
      'hook': hook,
      'summary': summary,
      'whyItMatters': whyItMatters,
      'keyTakeaways': keyTakeaways,
      'pullQuote': pullQuote,
      'keyMetric': keyMetric,
      'categoryBadge': categoryBadge,
      'digitalLink': digitalLink,
      'creatorOpinion': creatorOpinion,
      'creatorHandle': creatorHandle,
      'posterStyle': posterStyle.name,
      'renderedPosterPath': renderedPosterPath,
      'illustrationPrompt': illustrationPrompt,
      'illustrationBase64': illustrationBase64,
      'curatorIllustrationPrompt': curatorIllustrationPrompt,
      'curatorIllustrationBase64': curatorIllustrationBase64,
      'visualArtRatio': visualArtRatio,
      'infographicType': infographicType,
      'infographicStats': infographicStats,
      'visualMood': visualMood,
      'isUserCreated': isUserCreated,
      'sourceType': sourceType,
      'bookCoverPhotoPath': bookCoverPhotoPath,
      'bookExcerptPhotoPaths': bookExcerptPhotoPaths,
      'bookTitle': bookTitle,
      'bookAuthor': bookAuthor,
      'curatorAngle': curatorAngle,
      'hookCues': hookCues,
      'bookCoverBase64': bookCoverBase64,
      'postFormat': postFormat,
      'receiptHighlightQuote': receiptHighlightQuote,
      'articleExcerpts': articleExcerpts,
      'resolvedArticleExcerpts': resolvedArticleExcerpts,
    };
  }

  factory PostCardItem.fromMap(Map<String, dynamic> map) {
    PosterStyleType style = PosterStyleType.editorial;
    if (map['posterStyle'] != null) {
      try {
        style = PosterStyleType.values.byName(map['posterStyle']);
      } catch (_) {
        style = PosterStyleType.editorial;
      }
    }

    return PostCardItem(
      id: map['id'] ?? '',
      createdAt: map['createdAt'] != null
          ? DateTime.parse(map['createdAt'])
          : DateTime.now(),
      originalPhotoPath: map['originalPhotoPath'] ?? '',
      originalHeadline: map['originalHeadline'],
      publicationName: map['publicationName'],
      targetAudience: map['targetAudience'] ?? 'General Public',
      tone: map['tone'] ?? 'Balanced',
      userContext: map['userContext'],
      adaptedHeadline: map['adaptedHeadline'] ?? '',
      hook: map['hook'] ?? '',
      summary: map['summary'] ?? '',
      whyItMatters: map['whyItMatters'],
      keyTakeaways: List<String>.from(map['keyTakeaways'] ?? []),
      pullQuote: map['pullQuote'],
      keyMetric: map['keyMetric'],
      categoryBadge: map['categoryBadge'] ?? 'ARTICLE',
      digitalLink: map['digitalLink'],
      creatorOpinion: map['creatorOpinion'],
      creatorHandle: map['creatorHandle'],
      posterStyle: style,
      renderedPosterPath: map['renderedPosterPath'],
      illustrationPrompt: map['illustrationPrompt'],
      illustrationBase64: map['illustrationBase64'],
      curatorIllustrationPrompt: map['curatorIllustrationPrompt'],
      curatorIllustrationBase64: map['curatorIllustrationBase64'],
      visualArtRatio: (map['visualArtRatio'] as num?)?.toDouble() ?? 0.6,
      infographicType: map['infographicType'],
      infographicStats: List<String>.from(map['infographicStats'] ?? []),
      visualMood: map['visualMood'],
      isUserCreated: map['isUserCreated'] == true,
      sourceType: map['sourceType'] ?? 'photo',
      bookCoverPhotoPath: map['bookCoverPhotoPath'],
      bookExcerptPhotoPaths: List<String>.from(map['bookExcerptPhotoPaths'] ?? []),
      bookTitle: map['bookTitle'],
      bookAuthor: map['bookAuthor'],
      curatorAngle: map['curatorAngle'],
      hookCues: map['hookCues'],
      bookCoverBase64: map['bookCoverBase64'],
      postFormat: map['postFormat'] ?? 'editorial_briefing',
      receiptHighlightQuote: map['receiptHighlightQuote'],
      articleExcerpts: (map['articleExcerpts'] as List?)?.map((e) => e.toString()).toList() ?? const [],
    );
  }

  String toJson() => json.encode(toMap());

  factory PostCardItem.fromJson(String source) =>
      PostCardItem.fromMap(json.decode(source));
}
