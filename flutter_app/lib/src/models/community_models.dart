import 'ssq_models.dart';

class CommunitySource {
  const CommunitySource({
    required this.name,
    required this.url,
    this.lotteryKey = 'ssq',
  });

  final String name;
  final String url;
  final String lotteryKey;

  factory CommunitySource.fromJson(Map<String, dynamic> json) {
    return CommunitySource(
      name: (json['name'] ?? '').toString(),
      url: (json['url'] ?? '').toString(),
      lotteryKey: (json['lotteryKey'] ?? json['lottery'] ?? 'ssq').toString(),
    );
  }
}

class CommunityResonance {
  CommunityResonance({
    required this.reds,
    required this.blue,
    required this.sourceNames,
    required this.mentions,
    required this.sourceUrl,
  });

  final List<String> reds;
  final String blue;
  final List<String> sourceNames;
  final int mentions;
  final String sourceUrl;

  String get key => '${reds.join(',')}+$blue';
  String get text => '${reds.join(' ')} + $blue';
  int get confidence => (mentions * 16 + sourceNames.length * 18).clamp(0, 99);

  String get reason {
    final sourceText =
        sourceNames.isEmpty ? '社区来源' : sourceNames.take(2).join('、');
    return '社区共振 · $sourceText · ${sourceNames.length} 源 $mentions 次';
  }

  Ticket toTicket(
      {required String baseIssue,
      required String baseDate,
      String lotteryKey = 'ssq'}) {
    return Ticket(
      reds: reds,
      blue: blue,
      strategy: 'community',
      score: confidence,
      reason: reason,
      sourceName: sourceNames.join('、'),
      sourceUrl: sourceUrl,
      baseIssue: baseIssue,
      baseDate: baseDate,
      lotteryKey: lotteryKey,
    );
  }
}

class CommunityFetchResult {
  CommunityFetchResult({
    required this.sources,
    required this.picks,
    required this.failedSources,
    required this.updatedAt,
  });

  final List<CommunitySource> sources;
  final List<CommunityResonance> picks;
  final List<String> failedSources;
  final DateTime updatedAt;
}
