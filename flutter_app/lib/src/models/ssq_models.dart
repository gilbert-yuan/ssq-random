import 'dart:math';

import '../runtime/local_database.dart';

const strategyLabels = {
  'balanced': '均衡趋势',
  'hot': '热号追踪',
  'cold': '冷号补位',
  'blue': '蓝球重点',
  'leaderBackfill': '龙头回补',
  'tailPrime': '凤尾质数',
  'oddBlueTurn': '蓝球奇数转势',
  'inverse': '逆向推荐',
};

class LotterySpec {
  const LotterySpec({
    required this.key,
    required this.name,
    required this.shortName,
    required this.appTitle,
    required this.frontName,
    required this.backName,
    required this.frontMax,
    required this.backMax,
    required this.frontCount,
    required this.backCount,
    required this.officialName,
  });

  final String key;
  final String name;
  final String shortName;
  final String appTitle;
  final String frontName;
  final String backName;
  final int frontMax;
  final int backMax;
  final int frontCount;
  final int backCount;
  final String officialName;

  String get rangeText =>
      '$frontName 01-${ballLabel(frontMax)} · $backName 01-${ballLabel(backMax)}';
}

const lotterySpecs = {
  'ssq': LotterySpec(
    key: 'ssq',
    name: '双色球',
    shortName: '双色球',
    appTitle: '双色球助手',
    frontName: '红球',
    backName: '蓝球',
    frontMax: 33,
    backMax: 16,
    frontCount: 6,
    backCount: 1,
    officialName: 'ssq',
  ),
  'dlt': LotterySpec(
    key: 'dlt',
    name: '超级大乐透',
    shortName: '大乐透',
    appTitle: '大乐透助手',
    frontName: '前区',
    backName: '后区',
    frontMax: 35,
    backMax: 12,
    frontCount: 5,
    backCount: 2,
    officialName: 'dlt',
  ),
};

LotterySpec lotterySpecOf(String key) =>
    lotterySpecs[key] ?? lotterySpecs['ssq']!;

const prizeAmounts = {
  '一等奖': 5000000,
  '二等奖': 100000,
  '三等奖': 3000,
  '四等奖': 200,
  '五等奖': 10,
  '六等奖': 5,
  '未中': 0,
};

String ballLabel(int number) => number.toString().padLeft(2, '0');

List<String> splitBallText(String value) {
  return RegExp(r'\d{1,2}')
      .allMatches(value)
      .map((match) => int.tryParse(match.group(0) ?? ''))
      .whereType<int>()
      .map(ballLabel)
      .toList(growable: false);
}

String joinBallText(Iterable<String> values) => values.join(' ');

String formatYuan(int amount) {
  if (amount >= 10000 && amount % 10000 == 0) return '${amount ~/ 10000}万';
  return '$amount元';
}

class Ticket {
  Ticket({
    required this.reds,
    required this.blue,
    required this.strategy,
    required this.score,
    required this.reason,
    this.recordId = '',
    this.sourceName = '',
    this.sourceUrl = '',
    this.baseIssue = '',
    this.baseDate = '',
    this.lotteryKey = 'ssq',
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  final List<String> reds;
  final String blue;
  final String strategy;
  final int score;
  final String reason;
  final String recordId;
  final String sourceName;
  final String sourceUrl;
  final String baseIssue;
  final String baseDate;
  final String lotteryKey;
  final DateTime createdAt;

  String get key => '${reds.join(',')}+$blue';
  String get scopedKey => '$lotteryKey@$key@$baseIssue@$strategy@$sourceName';
  String get text => '${reds.join(' ')} + $blue';
  List<String> get backNumbers => splitBallText(blue);

  Ticket copyWith({
    DateTime? createdAt,
    String? recordId,
    String? sourceName,
    String? sourceUrl,
    String? baseIssue,
    String? baseDate,
    String? lotteryKey,
  }) {
    return Ticket(
      reds: reds,
      blue: blue,
      strategy: strategy,
      score: score,
      reason: reason,
      recordId: recordId ?? this.recordId,
      sourceName: sourceName ?? this.sourceName,
      sourceUrl: sourceUrl ?? this.sourceUrl,
      baseIssue: baseIssue ?? this.baseIssue,
      baseDate: baseDate ?? this.baseDate,
      lotteryKey: lotteryKey ?? this.lotteryKey,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}

class PrizeCheck {
  PrizeCheck({
    required this.issue,
    required this.date,
    required this.redHits,
    required this.blueHit,
    required this.blueHits,
    required this.level,
    required this.amount,
    required this.frontName,
    required this.backName,
  });

  final String issue;
  final String date;
  final int redHits;
  final bool blueHit;
  final int blueHits;
  final String level;
  final int amount;
  final String frontName;
  final String backName;

  String get hitText => '$redHits $frontName + $blueHits $backName';
  bool get won => amount > 0;
}

class FavoriteStats {
  FavoriteStats({
    required this.total,
    required this.winningCount,
    required this.totalAmount,
    required this.checkedCount,
  });

  final int total;
  final int winningCount;
  final int totalAmount;
  final int checkedCount;

  factory FavoriteStats.fromTickets(
      List<Ticket> tickets, List<StoredDraw> draws) {
    var winningCount = 0;
    var totalAmount = 0;
    var checkedCount = 0;
    for (final ticket in tickets) {
      final prize = checkTicketPrize(ticket, draws);
      if (prize == null) continue;
      checkedCount += 1;
      if (prize.won) winningCount += 1;
      totalAmount += prize.amount;
    }
    return FavoriteStats(
      total: tickets.length,
      winningCount: winningCount,
      totalAmount: totalAmount,
      checkedCount: checkedCount,
    );
  }
}

class FrequencyRow {
  FrequencyRow(this.number, this.count);

  final String number;
  final int count;
}

class MetricItem {
  MetricItem(this.label, this.value, this.detail);

  final String label;
  final String value;
  final String detail;
}

class AnalysisSnapshot {
  AnalysisSnapshot({
    required this.spec,
    required this.count,
    required this.redFrequency,
    required this.blueFrequency,
    required this.hotReds,
    required this.coldReds,
    required this.hotBlues,
    required this.coldBlues,
    required this.balancedReds,
    required this.leaderBackfillReds,
    required this.primeTailReds,
    required this.oddTurnBlues,
    required this.blueOddTurnActive,
    required this.metrics,
  });

  final LotterySpec spec;
  final int count;
  final List<FrequencyRow> redFrequency;
  final List<FrequencyRow> blueFrequency;
  final List<String> hotReds;
  final List<String> coldReds;
  final List<String> hotBlues;
  final List<String> coldBlues;
  final List<String> balancedReds;
  final List<String> leaderBackfillReds;
  final List<String> primeTailReds;
  final List<String> oddTurnBlues;
  final bool blueOddTurnActive;
  final List<MetricItem> metrics;

  List<String> get allReds =>
      List.generate(spec.frontMax, (index) => ballLabel(index + 1));

  factory AnalysisSnapshot.fromDraws(List<StoredDraw> draws,
      {LotterySpec? spec}) {
    final lottery = spec ?? lotterySpecOf('ssq');
    final recent = draws.take(min(30, draws.length)).toList();
    final redCounts = {
      for (var i = 1; i <= lottery.frontMax; i += 1) ballLabel(i): 0
    };
    final blueCounts = {
      for (var i = 1; i <= lottery.backMax; i += 1) ballLabel(i): 0
    };
    final sums = <int>[];
    final leaders = <int>[];
    final tails = <int>[];
    final blueParities = <bool>[];

    for (final draw in recent) {
      final redNumbers = draw.red.map(int.parse).toList()..sort();
      for (final red in draw.red) {
        redCounts[red] = (redCounts[red] ?? 0) + 1;
      }
      for (final blue in splitBallText(draw.blue)) {
        blueCounts[blue] = (blueCounts[blue] ?? 0) + 1;
      }
      sums.add(redNumbers.fold<int>(0, (total, item) => total + item));
      if (redNumbers.isNotEmpty) {
        leaders.add(redNumbers.first);
        tails.add(redNumbers.last);
      }
      blueParities.addAll(
          splitBallText(draw.blue).map((item) => int.parse(item).isOdd));
    }

    final redRows = redCounts.entries
        .map((entry) => FrequencyRow(entry.key, entry.value))
        .toList()
      ..sort((a, b) => b.count.compareTo(a.count));
    final blueRows = blueCounts.entries
        .map((entry) => FrequencyRow(entry.key, entry.value))
        .toList()
      ..sort((a, b) => b.count.compareTo(a.count));
    final hotReds = redRows.map((item) => item.number).toList();
    final coldReds = redRows.reversed.map((item) => item.number).toList();
    final averageSum =
        sums.isEmpty ? 0 : sums.reduce((a, b) => a + b) / sums.length;
    final oddCount = recent.fold<int>(
      0,
      (total, draw) =>
          total + draw.red.map(int.parse).where((item) => item.isOdd).length,
    );
    final balanced = <String>[
      ...hotReds.take(4),
      ...redRows.skip(10).take(8).map((item) => item.number),
      ...coldReds.take(5),
      ...hotReds,
    ];
    final leaderBackfill = _rankBackfill(
      numbers: List.generate(
          max(6, (lottery.frontMax / 3).ceil()), (index) => index + 1),
      recentValues: leaders.take(14).toList(),
      globalCounts: redCounts,
    );
    final tailPrimes =
        [17, 19, 23, 29, 31].where((item) => item <= lottery.frontMax).toList();
    final primeTail = _rankBackfill(
      numbers: tailPrimes,
      recentValues: tails.take(14).toList(),
      globalCounts: redCounts,
    );
    final recentBlueOddCount =
        blueParities.take(10).where((item) => item).length;
    final evenStreak = blueParities.take(3).length == 3 &&
        blueParities.take(3).every((item) => !item);
    final oddTurnActive = evenStreak || recentBlueOddCount <= 4;
    final oddHotBlues = blueRows
        .map((item) => item.number)
        .where((item) => int.parse(item).isOdd)
        .toList();
    final oddColdBlues = blueRows.reversed
        .map((item) => item.number)
        .where((item) => int.parse(item).isOdd)
        .toList();
    final oddTurnBlues = {
      if (oddTurnActive) ...oddColdBlues.take(4),
      ...oddHotBlues.take(5),
      ...oddColdBlues.take(5),
    }.toList();

    return AnalysisSnapshot(
      spec: lottery,
      count: draws.length,
      redFrequency: redRows,
      blueFrequency: blueRows,
      hotReds: hotReds,
      coldReds: coldReds,
      hotBlues: blueRows.map((item) => item.number).toList(),
      coldBlues: blueRows.reversed.map((item) => item.number).toList(),
      balancedReds: balanced.toSet().toList(),
      leaderBackfillReds: leaderBackfill,
      primeTailReds: primeTail,
      oddTurnBlues: oddTurnBlues,
      blueOddTurnActive: oddTurnActive,
      metrics: [
        MetricItem('样本期数', '${draws.length}', '本地 SQLite'),
        MetricItem('近期开奖', recent.isEmpty ? '--' : recent.first.issue,
            recent.isEmpty ? '--' : recent.first.date),
        MetricItem(
            '平均和值', averageSum.toStringAsFixed(1), '近 ${recent.length} 期'),
        MetricItem('奇偶倾向', oddCount >= recent.length * 3 ? '偏奇' : '均衡',
            '近 ${recent.length} 期'),
        MetricItem('龙头回补', leaderBackfill.take(3).join(' '), '低位遗漏优先'),
        MetricItem('凤尾质数', primeTail.take(3).join(' '), '高位质数尾'),
        MetricItem('${lottery.backName}转势', oddTurnBlues.take(4).join(' '),
            oddTurnActive ? '奇数回补' : '奇数备选'),
      ],
    );
  }

  static List<String> _rankBackfill({
    required List<int> numbers,
    required List<int> recentValues,
    required Map<String, int> globalCounts,
  }) {
    final recentCounts = {
      for (final number in numbers)
        number: recentValues.where((item) => item == number).length,
    };
    final lastSeen = {
      for (final number in numbers)
        number: recentValues.indexWhere((item) => item == number),
    };
    final ranked = numbers.toList()
      ..sort((a, b) {
        final aLast = lastSeen[a] == -1 ? 999 : lastSeen[a]!;
        final bLast = lastSeen[b] == -1 ? 999 : lastSeen[b]!;
        final lastCompare = bLast.compareTo(aLast);
        if (lastCompare != 0) return lastCompare;
        final recentCompare =
            (recentCounts[a] ?? 0).compareTo(recentCounts[b] ?? 0);
        if (recentCompare != 0) return recentCompare;
        final globalCompare = (globalCounts[ballLabel(a)] ?? 0)
            .compareTo(globalCounts[ballLabel(b)] ?? 0);
        if (globalCompare != 0) return globalCompare;
        return a.compareTo(b);
      });
    return ranked.map(ballLabel).toList();
  }
}

PrizeCheck? checkTicketPrize(Ticket ticket, List<StoredDraw> draws,
    {LotterySpec? spec}) {
  if (draws.isEmpty || ticket.baseIssue.isEmpty) return null;
  final lottery = spec ?? lotterySpecOf(ticket.lotteryKey);
  final baseIssue = int.tryParse(ticket.baseIssue);
  if (baseIssue == null) return null;
  final ordered = draws.toList()
    ..sort((a, b) {
      final ai = int.tryParse(a.issue) ?? 0;
      final bi = int.tryParse(b.issue) ?? 0;
      return ai.compareTo(bi);
    });
  StoredDraw? target;
  for (final draw in ordered) {
    final issue = int.tryParse(draw.issue);
    if (issue != null && issue > baseIssue) {
      target = draw;
      break;
    }
  }
  if (target == null) return null;

  final targetReds = target.red.toSet();
  final redHits = ticket.reds.where(targetReds.contains).length;
  final targetBlues = splitBallText(target.blue).toSet();
  final blueHits = ticket.backNumbers.where(targetBlues.contains).length;
  final level = lottery.key == 'dlt'
      ? switch ((redHits, blueHits)) {
          (5, 2) => '一等奖',
          (5, 1) => '二等奖',
          (5, 0) || (4, 2) => '三等奖',
          (4, 1) || (3, 2) => '四等奖',
          (4, 0) || (3, 1) || (2, 2) => '五等奖',
          (3, 0) || (2, 1) || (1, 2) || (0, 2) => '六等奖',
          _ => '未中',
        }
      : switch ((redHits, blueHits > 0)) {
          (6, true) => '一等奖',
          (6, false) => '二等奖',
          (5, true) => '三等奖',
          (5, false) || (4, true) => '四等奖',
          (4, false) || (3, true) => '五等奖',
          (_, true) => '六等奖',
          _ => '未中',
        };
  return PrizeCheck(
    issue: target.issue,
    date: target.date,
    redHits: redHits,
    blueHit: blueHits > 0,
    blueHits: blueHits,
    level: level,
    amount: prizeAmounts[level] ?? 0,
    frontName: lottery.frontName,
    backName: lottery.backName,
  );
}

Map<String, dynamic> ticketToRecordPayload(Ticket ticket,
    {String type = 'favorite'}) {
  return {
    'type': type,
    'reds': ticket.reds,
    'blue': ticket.blue,
    'strategy': ticket.strategy,
    'sourceName': ticket.sourceName,
    'sourceUrl': ticket.sourceUrl,
    'baseIssue': ticket.baseIssue,
    'baseDate': ticket.baseDate,
    'lotteryKey': ticket.lotteryKey,
    'reason': ticket.reason,
    'score': ticket.score,
    'createdAt': ticket.createdAt.toUtc().toIso8601String(),
  };
}

Ticket ticketFromRecord(StoredRecord record) {
  return Ticket(
    recordId: record.id,
    reds: record.reds,
    blue: record.blue,
    strategy: record.strategy,
    score: (record.score ?? 0).round(),
    reason: record.reason,
    sourceName: record.sourceName,
    sourceUrl: record.sourceUrl,
    baseIssue: record.baseIssue,
    baseDate: record.baseDate,
    lotteryKey: record.lotteryKey,
    createdAt: DateTime.tryParse(record.createdAt)?.toLocal() ?? DateTime.now(),
  );
}
