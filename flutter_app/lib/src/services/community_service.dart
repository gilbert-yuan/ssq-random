import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

import '../models/community_models.dart';
import '../models/ssq_models.dart';

class CommunityService {
  CommunityService({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  Future<List<CommunitySource>> loadSources([LotterySpec? lottery]) async {
    final payload = json.decode(
      await rootBundle.loadString('assets/bootstrap/community-sources.json'),
    ) as List<dynamic>;
    final sources = payload
        .whereType<Map<String, dynamic>>()
        .map(CommunitySource.fromJson)
        .where((source) => source.name.isNotEmpty && source.url.isNotEmpty)
        .toList(growable: false);
    if (lottery == null) return sources;
    return sources
        .where((source) => source.lotteryKey == lottery.key)
        .toList(growable: false);
  }

  Future<CommunityFetchResult> fetchResonance(LotterySpec lottery) async {
    final sources = await loadSources(lottery);
    final fetched = await Future.wait(
        sources.map((source) => _fetchSource(source, lottery)));
    final byKey = <String, _CommunityAccumulator>{};
    final failed = <String>[];

    for (final result in fetched) {
      final source = result.source;
      if (result.error != null) {
        failed.add('${source.name}：${result.error}');
        continue;
      }
      if (result.tickets.isEmpty) {
        failed.add('${source.name}：未识别到号码');
        continue;
      }
      final seenInSource = <String>{};
      for (final ticket in result.tickets) {
        final key = '${ticket.$1.join(',')}+${ticket.$2}';
        final item = byKey.putIfAbsent(
          key,
          () => _CommunityAccumulator(ticket.$1, ticket.$2, source.url),
        );
        item.mentions += 1;
        if (seenInSource.add(key)) item.sourceNames.add(source.name);
      }
    }

    final picks = byKey.values
        .where((item) => item.sourceNames.isNotEmpty)
        .map(
          (item) => CommunityResonance(
            reds: item.reds,
            blue: item.blue,
            sourceNames: item.sourceNames.toList()..sort(),
            mentions: item.mentions,
            sourceUrl: item.sourceUrl,
          ),
        )
        .toList()
      ..sort((a, b) {
        final sourceCompare =
            b.sourceNames.length.compareTo(a.sourceNames.length);
        if (sourceCompare != 0) return sourceCompare;
        final mentionCompare = b.mentions.compareTo(a.mentions);
        if (mentionCompare != 0) return mentionCompare;
        return b.confidence.compareTo(a.confidence);
      });

    return CommunityFetchResult(
      sources: sources,
      picks: picks.take(20).toList(growable: false),
      failedSources: failed,
      updatedAt: DateTime.now(),
    );
  }

  Future<_SourceFetch> _fetchSource(
      CommunitySource source, LotterySpec lottery) async {
    try {
      final response = await _client.get(
        Uri.parse(source.url),
        headers: {
          'accept':
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'zh-CN,zh;q=0.9',
          'cache-control': 'no-cache',
          'user-agent': 'Mozilla/5.0 Flutter SSQ Native App',
          'referer': Uri.parse(source.url).origin,
        },
      ).timeout(const Duration(seconds: 18));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw Exception('HTTP ${response.statusCode}');
      }
      final body = utf8.decode(response.bodyBytes, allowMalformed: true);
      final tickets =
          _extractTickets(body, lottery).take(100).toList(growable: false);
      return _SourceFetch(source: source, tickets: tickets);
    } catch (error) {
      return _SourceFetch(source: source, tickets: const [], error: '$error');
    }
  }

  Iterable<(List<String>, String)> _extractTickets(
      String body, LotterySpec lottery) sync* {
    final text = _normalizeDigits(body)
        .replaceAll(
            RegExp(r'<script[\s\S]*?</script>', caseSensitive: false), ' ')
        .replaceAll(
            RegExp(r'<style[\s\S]*?</style>', caseSensitive: false), ' ')
        .replaceAll(RegExp(r'<[^>]+>'), ' ');
    final numbers = RegExp(r'\d{1,2}')
        .allMatches(text)
        .map((match) => int.tryParse(match.group(0) ?? ''))
        .whereType<int>()
        .toList(growable: false);
    final emitted = <String>{};
    final explicitPattern = RegExp(
      r'((?:0?[1-9]|[12]\d|3[0-5])(?:[\s,，.、/|+\-]+(?:0?[1-9]|[12]\d|3[0-5])){4})\s*(?:\+|后区|蓝球?|蓝码|后区号码|blue|b|[,，;；])\s*((?:0?[1-9]|1[0-2])(?:[\s,，.、/|+\-]+(?:0?[1-9]|1[0-2])){0,1})',
      caseSensitive: false,
    );
    for (final match in explicitPattern.allMatches(text)) {
      final redValues = _numbersFromText(match.group(1) ?? '')
          .where((value) => value >= 1 && value <= lottery.frontMax)
          .take(lottery.frontCount)
          .toList(growable: false);
      final blueValues = _numbersFromText(match.group(2) ?? '')
          .where((value) => value >= 1 && value <= lottery.backMax)
          .take(lottery.backCount)
          .toList(growable: false);
      final ticket = _ticketFromValues(redValues, blueValues, lottery);
      if (ticket == null) continue;
      final key = '${ticket.$1.join(',')}+${ticket.$2}';
      if (emitted.add(key)) {
        yield ticket;
      }
      if (emitted.length >= 120) break;
    }

    final windowSize = lottery.frontCount + lottery.backCount;
    for (var i = 0; i + windowSize - 1 < numbers.length; i += 1) {
      final window = numbers.sublist(i, i + windowSize);
      final redValues = window.take(lottery.frontCount).toList(growable: false);
      final blueValues = window
          .skip(lottery.frontCount)
          .take(lottery.backCount)
          .toList(growable: false);
      final ticket = _ticketFromValues(redValues, blueValues, lottery);
      if (ticket == null) continue;
      final key = '${ticket.$1.join(',')}+${ticket.$2}';
      if (emitted.add(key)) {
        yield ticket;
      }
      if (emitted.length >= 120) break;
    }
  }

  (List<String>, String)? _ticketFromValues(
    List<int> redValues,
    List<int> blueValues,
    LotterySpec lottery,
  ) {
    if (blueValues.any((value) => value < 1 || value > lottery.backMax)) {
      return null;
    }
    if (redValues.any((value) => value < 1 || value > lottery.frontMax)) {
      return null;
    }
    final redSet = redValues.map(ballLabel).toSet();
    final blueSet = blueValues.map(ballLabel).toSet();
    if (redSet.length != lottery.frontCount ||
        blueSet.length != lottery.backCount) {
      return null;
    }
    final reds = redSet.toList()..sort();
    final blues = blueSet.toList()..sort();
    return (reds, joinBallText(blues));
  }

  List<int> _numbersFromText(String value) {
    return RegExp(r'\d{1,2}')
        .allMatches(value)
        .map((match) => int.tryParse(match.group(0) ?? ''))
        .whereType<int>()
        .toList(growable: false);
  }

  String _normalizeDigits(String text) {
    return text.replaceAllMapped(
      RegExp(r'[\uFF10-\uFF19]'),
      (match) =>
          String.fromCharCode(match.group(0)!.codeUnitAt(0) - 0xFF10 + 48),
    );
  }
}

class _CommunityAccumulator {
  _CommunityAccumulator(this.reds, this.blue, this.sourceUrl);

  final List<String> reds;
  final String blue;
  final String sourceUrl;
  final Set<String> sourceNames = {};
  int mentions = 0;
}

class _SourceFetch {
  const _SourceFetch({required this.source, required this.tickets, this.error});

  final CommunitySource source;
  final List<(List<String>, String)> tickets;
  final String? error;
}
