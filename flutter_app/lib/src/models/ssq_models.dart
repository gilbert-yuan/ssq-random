import 'dart:math';

import '../runtime/local_database.dart';

const strategyLabels = {
  'balanced': '均衡趋势',
  'hot': '热号追踪',
  'cold': '冷号补位',
  'blue': '蓝球重点',
};

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
  final DateTime createdAt;

  String get key => '${reds.join(',')}+$blue';
  String get scopedKey => '$key@$baseIssue@$strategy@$sourceName';
  String get text => '${reds.join(' ')} + $blue';

  Ticket copyWith({
    DateTime? createdAt,
    String? recordId,
    String? sourceName,
    String? sourceUrl,
    String? baseIssue,
    String? baseDate,
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
    required this.level,
    required this.amount,
  });

  final String issue;
  final String date;
  final int redHits;
  final bool blueHit;
  final String level;
  final int amount;

  String get hitText => '$redHits 红${blueHit ? ' + 蓝' : ''}';
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

  factory FavoriteStats.fromTickets(List<Ticket> tickets, List<StoredDraw> draws) {
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
    required this.count,
    required this.redFrequency,
    required this.blueFrequency,
    required this.hotReds,
    required this.coldReds,
    required this.hotBlues,
    required this.coldBlues,
    required this.balancedReds,
    required this.metrics,
  });

  final int count;
  final List<FrequencyRow> redFrequency;
  final List<FrequencyRow> blueFrequency;
  final List<String> hotReds;
  final List<String> coldReds;
  final List<String> hotBlues;
  final List<String> coldBlues;
  final List<String> balancedReds;
  final List<MetricItem> metrics;

  List<String> get allReds => List.generate(33, (index) => ballLabel(index + 1));

  factory AnalysisSnapshot.fromDraws(List<StoredDraw> draws) {
    final recent = draws.take(min(30, draws.length)).toList();
    final redCounts = {for (var i = 1; i <= 33; i += 1) ballLabel(i): 0};
    final blueCounts = {for (var i = 1; i <= 16; i += 1) ballLabel(i): 0};
    final sums = <int>[];

    for (final draw in recent) {
      for (final red in draw.red) {
        redCounts[red] = (redCounts[red] ?? 0) + 1;
      }
      blueCounts[draw.blue] = (blueCounts[draw.blue] ?? 0) + 1;
      sums.add(draw.red.map(int.parse).fold<int>(0, (total, item) => total + item));
    }

    final redRows = redCounts.entries.map((entry) => FrequencyRow(entry.key, entry.value)).toList()
      ..sort((a, b) => b.count.compareTo(a.count));
    final blueRows = blueCounts.entries.map((entry) => FrequencyRow(entry.key, entry.value)).toList()
      ..sort((a, b) => b.count.compareTo(a.count));
    final hotReds = redRows.map((item) => item.number).toList();
    final coldReds = redRows.reversed.map((item) => item.number).toList();
    final averageSum = sums.isEmpty ? 0 : sums.reduce((a, b) => a + b) / sums.length;
    final oddCount = recent.fold<int>(
      0,
      (total, draw) => total + draw.red.map(int.parse).where((item) => item.isOdd).length,
    );
    final balanced = <String>[
      ...hotReds.take(4),
      ...redRows.skip(10).take(8).map((item) => item.number),
      ...coldReds.take(5),
      ...hotReds,
    ];

    return AnalysisSnapshot(
      count: draws.length,
      redFrequency: redRows,
      blueFrequency: blueRows,
      hotReds: hotReds,
      coldReds: coldReds,
      hotBlues: blueRows.map((item) => item.number).toList(),
      coldBlues: blueRows.reversed.map((item) => item.number).toList(),
      balancedReds: balanced.toSet().toList(),
      metrics: [
        MetricItem('样本期数', '${draws.length}', '本地 SQLite'),
        MetricItem('近期开奖', recent.isEmpty ? '--' : recent.first.issue, recent.isEmpty ? '--' : recent.first.date),
        MetricItem('平均和值', averageSum.toStringAsFixed(1), '近 ${recent.length} 期'),
        MetricItem('奇偶倾向', oddCount >= recent.length * 3 ? '偏奇' : '均衡', '近 ${recent.length} 期'),
      ],
    );
  }
}

PrizeCheck? checkTicketPrize(Ticket ticket, List<StoredDraw> draws) {
  if (draws.isEmpty || ticket.baseIssue.isEmpty) return null;
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
  final blueHit = ticket.blue == target.blue;
  final level = switch ((redHits, blueHit)) {
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
    blueHit: blueHit,
    level: level,
    amount: prizeAmounts[level] ?? 0,
  );
}

Map<String, dynamic> ticketToRecordPayload(Ticket ticket, {String type = 'favorite'}) {
  return {
    'type': type,
    'reds': ticket.reds,
    'blue': ticket.blue,
    'strategy': ticket.strategy,
    'sourceName': ticket.sourceName,
    'sourceUrl': ticket.sourceUrl,
    'baseIssue': ticket.baseIssue,
    'baseDate': ticket.baseDate,
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
    createdAt: DateTime.tryParse(record.createdAt)?.toLocal() ?? DateTime.now(),
  );
}
