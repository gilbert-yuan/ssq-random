import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

import '../models/community_models.dart';
import '../models/ssq_models.dart';

class CommunityService {
  CommunityService({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  Future<List<CommunitySource>> loadSources() async {
    final payload = json.decode(
      await rootBundle.loadString('assets/bootstrap/community-sources.json'),
    ) as List<dynamic>;
    return payload
        .whereType<Map<String, dynamic>>()
        .map(CommunitySource.fromJson)
        .where((source) => source.name.isNotEmpty && source.url.isNotEmpty)
        .toList(growable: false);
  }

  Future<CommunityFetchResult> fetchResonance() async {
    final sources = await loadSources();
    final byKey = <String, _CommunityAccumulator>{};
    final failed = <String>[];

    for (final source in sources) {
      try {
        final response = await _client
            .get(
              Uri.parse(source.url),
              headers: const {
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'user-agent': 'Flutter SSQ Native App',
              },
            )
            .timeout(const Duration(seconds: 10));
        if (response.statusCode < 200 || response.statusCode >= 300) {
          throw Exception('HTTP ${response.statusCode}');
        }
        final body = utf8.decode(response.bodyBytes, allowMalformed: true);
        final tickets = _extractTickets(body).take(80).toList(growable: false);
        if (tickets.isEmpty) {
          failed.add('${source.name}：未识别到号码');
          continue;
        }
        final seenInSource = <String>{};
        for (final ticket in tickets) {
          final key = ticket.$1.join(',') + '+${ticket.$2}';
          final item = byKey.putIfAbsent(
            key,
            () => _CommunityAccumulator(ticket.$1, ticket.$2, source.url),
          );
          item.mentions += 1;
          if (seenInSource.add(key)) item.sourceNames.add(source.name);
        }
      } catch (error) {
        failed.add('${source.name}：$error');
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
        final sourceCompare = b.sourceNames.length.compareTo(a.sourceNames.length);
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

  Iterable<(List<String>, String)> _extractTickets(String body) sync* {
    final text = _normalizeDigits(body)
        .replaceAll(RegExp(r'<script[\s\S]*?</script>', caseSensitive: false), ' ')
        .replaceAll(RegExp(r'<style[\s\S]*?</style>', caseSensitive: false), ' ')
        .replaceAll(RegExp(r'<[^>]+>'), ' ');
    final numbers = RegExp(r'\d{1,2}')
        .allMatches(text)
        .map((match) => int.tryParse(match.group(0) ?? ''))
        .whereType<int>()
        .toList(growable: false);
    final emitted = <String>{};
    for (var i = 0; i + 6 < numbers.length; i += 1) {
      final window = numbers.sublist(i, i + 7);
      final redValues = window.take(6).toList(growable: false);
      final blueValue = window.last;
      if (blueValue < 1 || blueValue > 16) continue;
      if (redValues.any((value) => value < 1 || value > 33)) continue;
      final redSet = redValues.map(ballLabel).toSet();
      if (redSet.length != 6) continue;
      final reds = redSet.toList()..sort();
      final blue = ballLabel(blueValue);
      final key = '${reds.join(',')}+$blue';
      if (emitted.add(key)) yield (reds, blue);
      if (emitted.length >= 120) break;
    }
  }

  String _normalizeDigits(String text) {
    return text.replaceAllMapped(
      RegExp(r'[\uFF10-\uFF19]'),
      (match) => String.fromCharCode(match.group(0)!.codeUnitAt(0) - 0xFF10 + 48),
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
