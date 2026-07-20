import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

import 'models/community_models.dart';
import 'models/ssq_models.dart';
import 'pages/analysis_page.dart';
import 'pages/auth_page.dart';
import 'pages/community_page.dart';
import 'pages/overview_page.dart';
import 'pages/pick_page.dart';
import 'pages/records_page.dart';
import 'runtime/local_database.dart';
import 'services/community_service.dart';
import 'widgets/ssq_widgets.dart';

class SsqMobileApp extends StatelessWidget {
  const SsqMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '彩票助手',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF1D4ED8),
          primary: const Color(0xFF1D4ED8),
          secondary: const Color(0xFFDC2626),
        ),
        scaffoldBackgroundColor: const Color(0xFFF4F6FA),
        useMaterial3: true,
      ),
      home: const NativeSsqHome(),
    );
  }
}

class NativeSsqHome extends StatefulWidget {
  const NativeSsqHome({super.key});

  @override
  State<NativeSsqHome> createState() => _NativeSsqHomeState();
}

class _NativeSsqHomeState extends State<NativeSsqHome> {
  final CommunityService _communityService = CommunityService();
  final List<Ticket> _favorites = [];
  final Set<String> _manualReds = {};

  LocalDatabase? _database;
  AppUser? _user;
  String _sessionToken = '';
  List<StoredDraw> _draws = const [];
  List<Ticket> _tickets = const [];
  List<CommunitySource> _communitySources = const [];
  List<Ticket> _communityTickets = const [];
  List<String> _communityFailures = const [];
  Ticket? _manualTicket;
  String _manualBlue = '';
  String _lotteryKey = 'ssq';
  String _strategy = 'balanced';
  String _manualStrategy = 'balanced';
  int _coverageTicketCount = 6;
  String _selectedFavoriteIssue = '';
  int _tabIndex = 0;
  bool _loading = true;
  bool _authLoading = false;
  bool _refreshing = false;
  bool _communityLoading = false;
  String? _status;
  String? _error;
  String? _authError;
  String? _communityError;
  DateTime? _communityUpdatedAt;

  LotterySpec get _lottery => lotterySpecOf(_lotteryKey);
  AnalysisSnapshot get _analysis =>
      AnalysisSnapshot.fromDraws(_draws, spec: _lottery);
  StoredDraw? get _latest => _draws.isEmpty ? null : _draws.first;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    _database?.close();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    setState(() {
      _loading = true;
      _error = null;
      _authError = null;
    });
    try {
      final payload = json.decode(
        await rootBundle.loadString('assets/bootstrap/ssq-sample.json'),
      ) as Map<String, dynamic>;
      final sampleDraws = List<Map<String, dynamic>>.from(
        payload['draws'] as List? ?? const [],
      );
      final database = await LocalDatabase.open(sampleDraws: sampleDraws);
      final savedLottery =
          await database.readMeta('lottery_key', defaultValue: 'ssq');
      final savedLotteryKey =
          lotterySpecs.containsKey(savedLottery) ? savedLottery : 'ssq';
      final lottery = lotterySpecOf(savedLotteryKey);
      final draws =
          await database.readDraws(limit: 240, lotteryKey: lottery.key);
      final token = await database.readLocalSessionToken();
      final user =
          token.isEmpty ? null : await database.resolveSessionUser(token);
      final records = user == null
          ? const <StoredRecord>[]
          : await database.readRecords(user.id, lotteryKey: lottery.key);
      var communitySources = const <CommunitySource>[];
      try {
        communitySources = await _communityService.loadSources(lottery);
      } catch (_) {
        communitySources = const [];
      }
      if (!mounted) return;
      setState(() {
        _database = database;
        _lotteryKey = lottery.key;
        _draws = draws;
        _user = user;
        _sessionToken = user == null ? '' : token;
        _communitySources = communitySources;
        _tickets = _generateTickets('balanced');
        _favorites
          ..clear()
          ..addAll(records
              .where((record) => record.type == 'favorite')
              .map(ticketFromRecord));
        _loading = false;
        _status = user == null
            ? null
            : '已加载 ${draws.length} 期开奖数据和 ${_favorites.length} 条收藏';
      });
      if (_shouldRefreshDraws(lottery, draws)) {
        await _refreshOfficialDraws();
      }
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = '$error';
      });
    }
  }

  String _authErrorText(Object error) {
    if (error is AppException) {
      if (error.statusCode == 409) return '用户名已存在';
      if (error.statusCode == 401) return '用户名或密码不正确';
      return error.message;
    }
    return '$error';
  }

  Future<void> _completeAuth(AuthResult result) async {
    final database = _database;
    if (database == null) return;
    await database.saveLocalSessionToken(result.sessionToken);
    final records =
        await database.readRecords(result.user.id, lotteryKey: _lotteryKey);
    if (!mounted) return;
    setState(() {
      _user = result.user;
      _sessionToken = result.sessionToken;
      _favorites
        ..clear()
        ..addAll(records
            .where((record) => record.type == 'favorite')
            .map(ticketFromRecord));
      _authLoading = false;
      _authError = null;
      _status = '已登录，载入 ${_favorites.length} 条收藏';
    });
  }

  Future<void> _login(String username, String password) async {
    final database = _database;
    if (database == null || _authLoading) return;
    setState(() {
      _authLoading = true;
      _authError = null;
    });
    try {
      final result = await database.loginUser(
        {'username': username, 'password': password},
        clientType: 'flutter',
      );
      await _completeAuth(result);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _authLoading = false;
        _authError = _authErrorText(error);
      });
    }
  }

  Future<void> _register(
      String username, String password, String displayName) async {
    final database = _database;
    if (database == null || _authLoading) return;
    setState(() {
      _authLoading = true;
      _authError = null;
    });
    try {
      final result = await database.registerUser(
        {
          'username': username,
          'password': password,
          'displayName': displayName
        },
        clientType: 'flutter',
      );
      await _completeAuth(result);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _authLoading = false;
        _authError = _authErrorText(error);
      });
    }
  }

  Future<void> _logout() async {
    final database = _database;
    if (database != null) {
      await database.revokeSession(_sessionToken);
      await database.clearLocalSessionToken();
    }
    if (!mounted) return;
    setState(() {
      _user = null;
      _sessionToken = '';
      _favorites.clear();
      _selectedFavoriteIssue = '';
      _status = null;
      _authError = null;
    });
  }

  Future<void> _switchLottery(String lotteryKey) async {
    if (lotteryKey == _lotteryKey || !lotterySpecs.containsKey(lotteryKey)) {
      return;
    }
    final database = _database;
    if (database == null) return;
    await database.saveMeta('lottery_key', lotteryKey);
    final lottery = lotterySpecOf(lotteryKey);
    final draws = await database.readDraws(limit: 240, lotteryKey: lotteryKey);
    final records = _user == null
        ? const <StoredRecord>[]
        : await database.readRecords(_user!.id, lotteryKey: lotteryKey);
    var communitySources = const <CommunitySource>[];
    try {
      communitySources = await _communityService.loadSources(lottery);
    } catch (_) {
      communitySources = const [];
    }
    if (!mounted) return;
    setState(() {
      _lotteryKey = lotteryKey;
      _draws = draws;
      _tickets = draws.isEmpty ? const [] : _generateTickets(_strategy);
      _favorites
        ..clear()
        ..addAll(records
            .where((record) => record.type == 'favorite')
            .map(ticketFromRecord));
      _manualReds.clear();
      _manualBlue = '';
      _manualTicket = null;
      _selectedFavoriteIssue = '';
      _communitySources = communitySources;
      _communityTickets = const [];
      _communityFailures = const [];
      _communityError = null;
      _status = '已切换到 ${_lottery.name}';
    });
    if (_shouldRefreshDraws(lottery, draws)) {
      await _refreshOfficialDraws();
    }
  }

  bool _shouldRefreshDraws(LotterySpec lottery, List<StoredDraw> draws) {
    if (draws.isEmpty) return true;
    return lottery.key == 'dlt' && draws.length < 120;
  }

  Future<void> _refreshOfficialDraws() async {
    final database = _database;
    if (database == null || _refreshing) return;
    final lottery = _lottery;
    setState(() {
      _refreshing = true;
      _status = '正在同步${lottery.shortName}开奖数据';
    });
    try {
      final draws = lottery.key == 'dlt'
          ? await _fetchDltDraws(database, lottery)
          : await _fetchSsqDraws(database, lottery);
      if (draws.isEmpty) throw Exception('官方接口没有返回开奖数据');
      await database.upsertDraws(draws);
      final latest =
          await database.readDraws(limit: 240, lotteryKey: lottery.key);
      if (!mounted) return;
      setState(() {
        _draws = latest;
        _tickets = _generateTickets(_strategy);
        _refreshing = false;
        _status = '已同步 ${latest.length} 期${lottery.shortName}开奖数据';
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _refreshing = false;
        _status = '同步失败，继续使用本地数据：$error';
      });
    }
  }

  Future<List<StoredDraw>> _fetchSsqDraws(
      LocalDatabase database, LotterySpec lottery) async {
    final uri = Uri.parse(
      'https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice'
      '?name=${lottery.officialName}&issueCount=&issueStart=&issueEnd=&dayStart=&dayEnd='
      '&pageNo=1&pageSize=240&week=&systemType=PC',
    );
    final response = await http.get(uri, headers: const {
      'accept': 'application/json,text/plain,*/*',
      'user-agent': 'Flutter Lotto Native App',
      'referer': 'https://www.cwl.gov.cn/',
    }).timeout(const Duration(seconds: 12));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('HTTP ${response.statusCode}');
    }
    final payload = json.decode(response.body) as Map<String, dynamic>;
    final rows = List<Map<String, dynamic>>.from(
      payload['result'] as List? ?? const [],
    );
    return rows
        .map(
          (row) => database.normalizeDraw(
            row,
            lotteryKey: lottery.key,
            frontMax: lottery.frontMax,
            backMax: lottery.backMax,
            frontCount: lottery.frontCount,
            backCount: lottery.backCount,
          ),
        )
        .whereType<StoredDraw>()
        .toList(growable: false);
  }

  Future<List<StoredDraw>> _fetchDltDraws(
      LocalDatabase database, LotterySpec lottery) async {
    final uri = Uri.parse(
        'https://datachart.500.com/dlt/history/newinc/history.php?limit=240&sort=0');
    final response = await http.get(uri, headers: const {
      'accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'user-agent': 'Flutter Lotto Native App',
      'referer': 'https://datachart.500.com/dlt/history/history.shtml',
    }).timeout(const Duration(seconds: 12));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('HTTP ${response.statusCode}');
    }
    final body = utf8.decode(response.bodyBytes, allowMalformed: true);
    final rows = RegExp(r'<tr[^>]*>([\s\S]*?)</tr>', caseSensitive: false)
        .allMatches(body)
        .map((match) => match.group(1) ?? '')
        .map(_parseDltHistoryRow)
        .whereType<Map<String, dynamic>>()
        .map(
          (row) => database.normalizeDraw(
            row,
            lotteryKey: lottery.key,
            frontMax: lottery.frontMax,
            backMax: lottery.backMax,
            frontCount: lottery.frontCount,
            backCount: lottery.backCount,
          ),
        )
        .whereType<StoredDraw>()
        .toList(growable: false);
    return rows.take(240).toList(growable: false);
  }

  Map<String, dynamic>? _parseDltHistoryRow(String rowHtml) {
    final cleanRow = rowHtml.replaceAll(RegExp(r'<!--[\s\S]*?-->'), ' ');
    final cells = RegExp(r'<td[^>]*>([\s\S]*?)</td>', caseSensitive: false)
        .allMatches(cleanRow)
        .map((match) => _stripHtml(match.group(1) ?? ''))
        .where((text) => text.isNotEmpty)
        .toList(growable: false);
    if (cells.length < 8) return null;
    final issue = RegExp(r'<td[^>]*>\s*(\d{5})\s*</td>', caseSensitive: false)
            .firstMatch(cleanRow)
            ?.group(1) ??
        '';
    final reds = RegExp(r'<td[^>]*class="[^"]*cfont2[^"]*"[^>]*>(\d{1,2})</td>',
            caseSensitive: false)
        .allMatches(cleanRow)
        .map((match) => int.tryParse(match.group(1) ?? ''))
        .whereType<int>()
        .map(ballLabel)
        .toList(growable: false);
    final blues = RegExp(
            r'<td[^>]*class="[^"]*cfont4[^"]*"[^>]*>(\d{1,2})</td>',
            caseSensitive: false)
        .allMatches(cleanRow)
        .map((match) => int.tryParse(match.group(1) ?? ''))
        .whereType<int>()
        .map(ballLabel)
        .toList(growable: false);
    if (issue.isEmpty || reds.length < 5 || blues.length < 2) return null;
    final date = cells.firstWhere(
      (cell) => RegExp(r'\d{4}-\d{2}-\d{2}').hasMatch(cell),
      orElse: () => '',
    );
    return {
      'issue': issue,
      'date': date,
      'red': reds.take(5).toList(growable: false),
      'blue': blues.take(2).toList(growable: false),
      'source': '500彩票网',
    };
  }

  String _stripHtml(String html) {
    return html
        .replaceAll(RegExp(r'<[^>]+>'), ' ')
        .replaceAll('&nbsp;', ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
  }

  Future<void> _refreshCommunity() async {
    if (_communityLoading) return;
    final lottery = _lottery;
    setState(() {
      _communityLoading = true;
      _communityError = null;
      _status = '正在刷新社区共振';
    });
    try {
      final result = await _communityService.fetchResonance(lottery);
      final latest = _latest;
      final tickets = result.picks
          .map(
            (pick) => pick.toTicket(
              baseIssue: latest?.issue ?? '',
              baseDate: latest?.date ?? '',
              lotteryKey: lottery.key,
            ),
          )
          .toList(growable: false);
      if (!mounted) return;
      setState(() {
        _communitySources = result.sources;
        _communityTickets = tickets;
        _communityFailures = result.failedSources;
        _communityUpdatedAt = result.updatedAt;
        _communityLoading = false;
        _status =
            tickets.isEmpty ? '社区共振暂未识别到号码' : '已刷新 ${tickets.length} 组社区共振号';
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _communityLoading = false;
        _communityError = '$error';
        _status = '社区共振刷新失败：$error';
      });
    }
  }

  List<Ticket> _generateTickets(String strategy,
      {int count = 6,
      Map<String, int>? redUsage,
      Map<String, int>? blueUsage,
      bool registerCoverage = true}) {
    final analysis = _analysis;
    if (_draws.isEmpty) return const [];
    final tickets = <Ticket>[];
    final seen = <String>{};
    final batchRedUsage = redUsage ?? <String, int>{};
    final batchBlueUsage = blueUsage ?? <String, int>{};
    final random = Random(DateTime.now().millisecondsSinceEpoch);
    var guard = 0;
    while (tickets.length < count && guard < count * 90) {
      final reds = _pickReds(strategy, analysis, random, batchRedUsage);
      final blue = _pickBlue(strategy, analysis, random, batchBlueUsage);
      final ticket = Ticket(
        reds: reds,
        blue: blue,
        strategy: strategy,
        score: _scoreTicket(reds, blue, analysis),
        reason: _strategyReason(strategy, reds, blue, analysis),
        sourceName: '本地趋势',
        baseIssue: _latest?.issue ?? '',
        baseDate: _latest?.date ?? '',
        lotteryKey: _lotteryKey,
      );
      if (seen.add(ticket.key)) {
        tickets.add(ticket);
        if (registerCoverage) {
          _registerCoverage(ticket, batchRedUsage, batchBlueUsage);
        }
      }
      guard += 1;
    }
    return tickets;
  }

  List<String> _pickReds(
      String strategy,
      AnalysisSnapshot analysis,
      Random random,
      Map<String, int>? redUsage) {
    var best = <String>[];
    var bestScore = -9999;
    for (var attempt = 0; attempt < 72; attempt += 1) {
      final selected = <String>{};
      for (final anchor in _redAnchorsForAttempt(strategy, analysis, random)) {
        selected.add(anchor);
      }
      final pool = <String>[
        ..._preferredRedPool(strategy, analysis),
        ...analysis.allReds,
      ]..shuffle(random);
      for (final red in pool) {
        if (selected.length >= _lottery.frontCount) break;
        if (selected.contains(red)) continue;
        if (_wouldOverloadZone(selected, red) && random.nextDouble() < 0.72) {
          continue;
        }
        if (_wouldOverloadHot(strategy, selected, red, analysis) &&
            random.nextDouble() < 0.84) {
          continue;
        }
        selected.add(red);
      }
      for (final red in analysis.allReds) {
        if (selected.length >= _lottery.frontCount) break;
        selected.add(red);
      }
      final reds = selected.toList()..sort();
      final score = _redQualityScore(reds, analysis, strategy) -
          _redCoveragePenalty(reds, redUsage);
      if (score > bestScore) {
        bestScore = score;
        best = reds;
      }
    }
    if (best.length == _lottery.frontCount) return best;
    return analysis.allReds.take(_lottery.frontCount).toList();
  }

  int _redCoveragePenalty(List<String> reds, Map<String, int>? redUsage) {
    if (redUsage == null) return 0;
    return reds.fold<int>(
        0, (total, red) => total + (redUsage[red] ?? 0) * 3);
  }

  List<String> _redAnchorsForAttempt(
      String strategy, AnalysisSnapshot analysis, Random random) {
    final anchors = <String>[];
    String? choose(List<String> values, int limit) {
      if (values.isEmpty) return null;
      return values[random.nextInt(min(limit, values.length))];
    }

    switch (strategy) {
      case 'leaderBackfill':
        final leader = choose(analysis.leaderBackfillReds, 5);
        if (leader != null) anchors.add(leader);
        break;
      case 'tailPrime':
        final tail = choose(analysis.primeTailReds, 4);
        if (tail != null) anchors.add(tail);
        break;
      case 'oddBlueTurn':
        if (random.nextDouble() < 0.46) {
          final leader = choose(analysis.leaderBackfillReds, 4);
          if (leader != null) anchors.add(leader);
        }
        if (random.nextDouble() < 0.42) {
          final tail = choose(analysis.primeTailReds, 4);
          if (tail != null) anchors.add(tail);
        }
        break;
      default:
        if (random.nextDouble() < 0.32) {
          final leader = choose(analysis.leaderBackfillReds, 4);
          if (leader != null) anchors.add(leader);
        }
        if (random.nextDouble() < 0.30) {
          final tail = choose(analysis.primeTailReds, 4);
          if (tail != null) anchors.add(tail);
        }
    }
    return anchors;
  }

  List<String> _preferredRedPool(String strategy, AnalysisSnapshot analysis) {
    return switch (strategy) {
      'hot' => [
          ...analysis.hotReds.take(12),
          ...analysis.hotReds.take(8),
          ...analysis.balancedReds.take(16),
          ...analysis.coldReds.take(7),
          ...analysis.leaderBackfillReds.take(3),
          ...analysis.primeTailReds.take(2),
        ],
      'cold' => [
          ...analysis.coldReds.take(12),
          ...analysis.coldReds.take(8),
          ...analysis.hotReds.take(6),
          ...analysis.balancedReds.take(14),
          ...analysis.leaderBackfillReds.take(4),
          ...analysis.primeTailReds.take(3),
        ],
      'leaderBackfill' => [
          ...analysis.leaderBackfillReds.take(8),
          ...analysis.leaderBackfillReds.take(5),
          ...analysis.hotReds.take(8),
          ...analysis.coldReds.take(8),
          ...analysis.balancedReds.take(18),
          ...analysis.primeTailReds.take(3),
        ],
      'tailPrime' => [
          ...analysis.primeTailReds.take(5),
          ...analysis.primeTailReds.take(5),
          ...analysis.hotReds.take(8),
          ...analysis.coldReds.take(7),
          ...analysis.balancedReds.take(18),
          ...analysis.leaderBackfillReds.take(3),
        ],
      'oddBlueTurn' => [
          ...analysis.balancedReds.take(18),
          ...analysis.hotReds.take(8),
          ...analysis.coldReds.take(8),
          ...analysis.leaderBackfillReds.take(4),
          ...analysis.primeTailReds.take(4),
        ],
      'blue' => [
          ...analysis.balancedReds.take(18),
          ...analysis.hotReds.take(9),
          ...analysis.coldReds.take(6),
          ...analysis.primeTailReds.take(2),
        ],
      'inverse' => [
          ...analysis.allReds.reversed,
          ...analysis.allReds.reversed,
          ...analysis.balancedReds.reversed,
          ...analysis.coldReds.take(8),
        ],
      _ => [
          ...analysis.balancedReds.take(20),
          ...analysis.hotReds.take(8),
          ...analysis.coldReds.take(8),
          ...analysis.leaderBackfillReds.take(4),
          ...analysis.primeTailReds.take(4),
        ],
    };
  }

  bool _wouldOverloadZone(Set<String> selected, String red) {
    final zone = _redZone(red);
    final current = selected.where((item) => _redZone(item) == zone).length;
    return current >= 2 && selected.length < 5;
  }

  bool _wouldOverloadHot(String strategy, Set<String> selected, String red,
      AnalysisSnapshot analysis) {
    final hotSet = analysis.hotReds.take(10).toSet();
    if (!hotSet.contains(red)) return false;
    final limit = strategy == 'hot' ? 3 : 2;
    final current = selected.where(hotSet.contains).length;
    return current >= limit;
  }

  int _redZone(String red) {
    final value = int.parse(red);
    final zoneSize = (_lottery.frontMax / 3).ceil();
    if (value <= zoneSize) return 0;
    if (value <= zoneSize * 2) return 1;
    return 2;
  }

  int _redQualityScore(
      List<String> reds, AnalysisSnapshot analysis, String strategy) {
    if (reds.length != _lottery.frontCount) return -999;
    final numbers = reds.map(int.parse).toList()..sort();
    final sum = numbers.fold<int>(0, (total, item) => total + item);
    final oddCount = numbers.where((item) => item.isOdd).length;
    final zoneCounts = [0, 0, 0];
    for (final red in reds) {
      zoneCounts[_redZone(red)] += 1;
    }
    var consecutivePairs = 0;
    for (var index = 1; index < numbers.length; index += 1) {
      if (numbers[index] - numbers[index - 1] == 1) consecutivePairs += 1;
    }

    final hotHits = reds.where(analysis.hotReds.take(12).contains).length;
    final coldHits = reds.where(analysis.coldReds.take(12).contains).length;
    final leaderHit =
        analysis.leaderBackfillReds.take(5).contains(ballLabel(numbers.first));
    final tailHit =
        analysis.primeTailReds.take(5).contains(ballLabel(numbers.last));
    var score = 0;
    final averageSum = _lottery.frontCount * (_lottery.frontMax + 1) / 2;
    score += sum >= averageSum * 0.72 && sum <= averageSum * 1.28 ? 18 : 4;
    if (sum >= averageSum * 0.84 && sum <= averageSum * 1.16) score += 8;
    final minOdd = max(1, (_lottery.frontCount / 2).floor() - 1);
    final maxOdd =
        min(_lottery.frontCount - 1, (_lottery.frontCount / 2).ceil() + 1);
    score += oddCount >= minOdd && oddCount <= maxOdd ? 16 : 3;
    score += zoneCounts.every((count) => count > 0) ? 18 : 2;
    score += zoneCounts.every((count) => count <= 3) ? 8 : 0;
    score += consecutivePairs <= 1 ? 8 : max(0, 5 - consecutivePairs * 2);
    score += min(hotHits, 2) * 4;
    score += hotHits <= 2
        ? 8
        : hotHits == 3
            ? 1
            : -16;
    score += min(coldHits, 2) * 3;
    if (leaderHit) score += strategy == 'leaderBackfill' ? 16 : 6;
    if (tailHit) score += strategy == 'tailPrime' ? 16 : 6;
    if (strategy == 'hot' && hotHits >= 2 && hotHits <= 3) score += 8;
    if (strategy == 'hot' && hotHits >= 4) score -= 12;
    if (strategy == 'cold' && coldHits >= 2 && coldHits <= 4) score += 8;
    if (strategy == 'leaderBackfill' && !leaderHit) score -= 10;
    if (strategy == 'tailPrime' && !tailHit) score -= 10;
    if (strategy == 'inverse') {
      final highReds = numbers.where((value) => value > 31).length;
      final tailCounts = <int, int>{};
      for (final value in numbers) {
        final tail = value % 10;
        tailCounts[tail] = (tailCounts[tail] ?? 0) + 1;
      }
      final repeatedTails = tailCounts.values
          .where((count) => count > 1)
          .fold<int>(0, (sum, count) => sum + count - 1);
      score += highReds * 18;
      score -= repeatedTails * 8;
      if (consecutivePairs > 0) score -= consecutivePairs * 6;
    }
    return score;
  }

  String _pickBlue(String strategy, AnalysisSnapshot analysis, Random random,
      [Map<String, int>? blueUsage]) {
    final pool = switch (strategy) {
      'oddBlueTurn' => analysis.oddTurnBlues.isEmpty
          ? analysis.hotBlues.where((item) => int.parse(item).isOdd).toList()
          : analysis.oddTurnBlues,
      'cold' => analysis.coldBlues.take(8).toList(),
      'blue' => [
          ...analysis.hotBlues.take(5),
          ...analysis.oddTurnBlues.take(3),
          ...analysis.coldBlues.take(3),
        ],
      'inverse' => [
          ...List.generate(_lottery.backMax, (index) => ballLabel(index + 1))
              .reversed,
          ...List.generate(_lottery.backMax, (index) => ballLabel(index + 1))
              .reversed,
          ...analysis.coldBlues.take(4),
        ],
      _ => [
          ...analysis.hotBlues.take(5),
          ...analysis.coldBlues.take(4),
          ...analysis.oddTurnBlues.take(2),
        ],
    };
    final fallback =
        List.generate(_lottery.backMax, (index) => ballLabel(index + 1));
    final ranked = pool.isEmpty ? fallback : pool;
    final limit = switch (strategy) {
      'blue' => min(6, ranked.length),
      'oddBlueTurn' => min(analysis.blueOddTurnActive ? 7 : 5, ranked.length),
      _ => min(8, ranked.length),
    };
    final selected = <String>{};
    var guard = 0;
    while (selected.length < _lottery.backCount && guard < 40) {
      final candidates = ranked.take(limit).toList(growable: false);
      final leastUsed = candidates
          .map((item) => blueUsage?[item] ?? 0)
          .reduce((current, next) => current < next ? current : next);
      final leastUsedCandidates = candidates
          .where((item) => (blueUsage?[item] ?? 0) == leastUsed)
          .toList(growable: false);
      selected.add(leastUsedCandidates[random.nextInt(leastUsedCandidates.length)]);
      guard += 1;
    }
    for (final value in fallback) {
      if (selected.length >= _lottery.backCount) break;
      selected.add(value);
    }
    final values = selected.toList()..sort();
    return joinBallText(values);
  }

  void _registerCoverage(Ticket ticket, Map<String, int> redUsage,
      Map<String, int> blueUsage) {
    for (final red in ticket.reds) {
      redUsage[red] = (redUsage[red] ?? 0) + 1;
    }
    for (final blue in splitBallText(ticket.blue)) {
      blueUsage[blue] = (blueUsage[blue] ?? 0) + 1;
    }
  }

  int _scoreTicket(List<String> reds, String blue, AnalysisSnapshot analysis) {
    final redScore = _redQualityScore(reds, analysis, 'balanced');
    final backNumbers = splitBallText(blue);
    final blueHot =
        backNumbers.where(analysis.hotBlues.take(4).contains).length * 5;
    final blueOddTurn =
        backNumbers.where(analysis.oddTurnBlues.take(6).contains).length * 4;
    return min(
        99, max(45, 50 + (redScore / 2).round() + blueHot + blueOddTurn));
  }

  String _strategyReason(String strategy, List<String> reds, String blue,
      AnalysisSnapshot analysis) {
    final label = strategyLabels[strategy] ?? '均衡趋势';
    final values = reds.map(int.parse).toList()..sort();
    final sum = values.fold<int>(0, (total, item) => total + item);
    final oddCount = values.where((item) => item.isOdd).length;
    final zoneCounts = [0, 0, 0];
    for (final red in reds) {
      zoneCounts[_redZone(red)] += 1;
    }
    final highlights = <String>[
      label,
      '和值 $sum',
      '奇偶 $oddCount:${_lottery.frontCount - oddCount}',
      '三区 ${zoneCounts.join('-')}',
    ];
    if (analysis.leaderBackfillReds.take(5).contains(ballLabel(values.first))) {
      highlights.add('龙头 ${ballLabel(values.first)}');
    }
    if (analysis.primeTailReds.take(5).contains(ballLabel(values.last))) {
      highlights.add('凤尾 ${ballLabel(values.last)}');
    }
    final backNumbers = splitBallText(blue);
    final oddBacks = backNumbers
        .where((item) =>
            analysis.oddTurnBlues.contains(item) && int.parse(item).isOdd)
        .toList();
    if (oddBacks.isNotEmpty) {
      highlights.add('奇${_lottery.backName} ${oddBacks.join(' ')}');
    } else {
      highlights.add('${_lottery.backName} $blue');
    }
    return highlights.join(' · ');
  }

  void _regenerate() {
    setState(() {
      _tickets = _generateTickets(_strategy);
      _status = '已生成 ${_tickets.length} 注建议号';
    });
  }

  void _generateCoverage() {
    const modes = [
      'leaderBackfill',
      'tailPrime',
      'oddBlueTurn',
      'blue',
      'balanced',
      'hot',
      'inverse'
    ];
    final combo = <Ticket>[];
    final seen = <String>{};
    final redUsage = <String, int>{};
    final blueUsage = <String, int>{};
    var modeIndex = 0;
    while (combo.length < _coverageTicketCount &&
        modeIndex < _coverageTicketCount * 4) {
      final mode = modes[modeIndex % modes.length];
      for (final ticket in _generateTickets(mode,
          count: 3,
          redUsage: redUsage,
          blueUsage: blueUsage,
          registerCoverage: false)) {
        if (seen.add(ticket.key)) {
          combo.add(ticket);
          _registerCoverage(ticket, redUsage, blueUsage);
          break;
        }
      }
      modeIndex += 1;
    }
    setState(() {
      _tickets = combo;
      _status = '已生成 ${combo.length} 注覆盖优选';
    });
  }

  Future<void> _copyTicket(Ticket ticket) async {
    await Clipboard.setData(ClipboardData(text: ticket.text));
    setState(() => _status = '已复制 ${ticket.text}');
  }

  Future<void> _copyTickets(List<Ticket> tickets, String label) async {
    if (tickets.isEmpty) {
      setState(() => _status = '暂无可复制号码');
      return;
    }
    await Clipboard.setData(
      ClipboardData(text: tickets.map((ticket) => ticket.text).join('\n')),
    );
    setState(() => _status = '已复制$label ${tickets.length} 注');
  }

  Ticket _withCurrentBase(Ticket ticket) {
    if (ticket.baseIssue.isNotEmpty) return ticket;
    return ticket.copyWith(
        baseIssue: _latest?.issue ?? '', baseDate: _latest?.date ?? '');
  }

  Future<void> _favoriteTickets(List<Ticket> tickets) async {
    final database = _database;
    final user = _user;
    if (database == null || user == null) return;
    final candidates = <Ticket>[];
    for (final ticket in tickets) {
      final scoped =
          _withCurrentBase(ticket).copyWith(createdAt: DateTime.now());
      if (_favorites.any((item) =>
          item.key == scoped.key && item.baseIssue == scoped.baseIssue)) {
        continue;
      }
      candidates.add(scoped);
    }
    if (candidates.isEmpty) {
      setState(() => _status = '这些号码已经收藏');
      return;
    }
    final inserted = await database.appendRecords(
      user.id,
      candidates
          .map((ticket) => ticketToRecordPayload(ticket))
          .toList(growable: false),
    );
    final persisted = inserted.map(ticketFromRecord).toList(growable: false);
    if (!mounted) return;
    setState(() {
      _favorites.insertAll(0, persisted);
      _status = persisted.isEmpty ? '这些号码已经收藏' : '已收藏 ${persisted.length} 注';
    });
  }

  void _completeManual() {
    if (_draws.isEmpty) return;
    final analysis = _analysis;
    final random = Random(DateTime.now().millisecondsSinceEpoch);
    final reds = <String>{..._manualReds};
    final preferred = _preferredRedPool(_manualStrategy, analysis).toList()
      ..shuffle(random);
    for (final red in preferred) {
      if (reds.length >= _lottery.frontCount) break;
      reds.add(red);
    }
    while (reds.length < _lottery.frontCount) {
      reds.add(ballLabel(random.nextInt(_lottery.frontMax) + 1));
    }
    final sortedReds = reds.toList()..sort();
    final blue = _manualBlue.isNotEmpty
        ? _manualBlue
        : _pickBlue(_manualStrategy, analysis, random);
    setState(() {
      _manualTicket = Ticket(
        reds: sortedReds,
        blue: blue,
        strategy: _manualStrategy,
        score: _scoreTicket(sortedReds, blue, analysis),
        reason:
            '自选补全 · 已保留 ${_manualReds.length} 个${_lottery.frontName}${_manualBlue.isEmpty ? '' : '和${_lottery.backName} $_manualBlue'}',
        sourceName: '自选补全',
        baseIssue: _latest?.issue ?? '',
        baseDate: _latest?.date ?? '',
        lotteryKey: _lotteryKey,
      );
      _status = '已补全自选号';
    });
  }

  void _toggleRed(String red) {
    setState(() {
      if (_manualReds.contains(red)) {
        _manualReds.remove(red);
      } else if (_manualReds.length < _lottery.frontCount) {
        _manualReds.add(red);
      } else {
        _status = '${_lottery.frontName}最多选择 ${_lottery.frontCount} 个';
      }
      _manualTicket = null;
    });
  }

  void _toggleBlue(String blue) {
    setState(() {
      final selected = splitBallText(_manualBlue).toSet();
      if (selected.contains(blue)) {
        selected.remove(blue);
      } else if (selected.length < _lottery.backCount) {
        selected.add(blue);
      } else {
        _status = '${_lottery.backName}最多选择 ${_lottery.backCount} 个';
      }
      final values = selected.toList()..sort();
      _manualBlue = joinBallText(values);
      _manualTicket = null;
    });
  }

  void _clearManual() {
    setState(() {
      _manualReds.clear();
      _manualBlue = '';
      _manualTicket = null;
      _status = '已清空自选号码';
    });
  }

  Future<void> _favorite(Ticket ticket) async {
    await _favoriteTickets([ticket]);
  }

  Future<void> _removeFavorite(Ticket ticket) async {
    final database = _database;
    final user = _user;
    if (database == null || user == null) return;
    if (ticket.recordId.isNotEmpty) {
      await database.deleteRecord(ticket.recordId, user.id);
    } else {
      await database.deleteRecordMatching(
        user.id,
        type: 'favorite',
        ticketKey: ticket.key,
        baseIssue: ticket.baseIssue,
        lotteryKey: _lotteryKey,
      );
    }
    if (!mounted) return;
    setState(() {
      _favorites.removeWhere((item) => item.scopedKey == ticket.scopedKey);
      _status = '已删除收藏';
    });
  }

  Future<void> _clearFavoritesForIssue(String issue) async {
    final database = _database;
    final user = _user;
    if (database == null || user == null || issue.isEmpty || issue == '全部') {
      return;
    }
    await database.clearRecordsForIssue(
      user.id,
      type: 'favorite',
      lotteryKey: _lotteryKey,
      baseIssue: issue == '未分期' ? '' : issue,
    );
    if (!mounted) return;
    setState(() {
      _favorites.removeWhere((item) {
        final itemIssue = item.baseIssue.isEmpty ? '未分期' : item.baseIssue;
        return itemIssue == issue;
      });
      _status = '已清空第 $issue 期收藏';
    });
  }

  void _selectTab(int index) {
    setState(() => _tabIndex = index);
    if (index == 4 && _communityTickets.isEmpty && !_communityLoading) {
      _refreshCommunity();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const NativeLoadingScreen();
    if (_error != null) {
      return NativeErrorScreen(error: _error!, onRetry: _bootstrap);
    }
    if (_user == null) {
      return AuthPage(
        loading: _authLoading,
        error: _authError,
        onLogin: _login,
        onRegister: _register,
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(_lottery.appTitle),
        actions: [
          Center(
            child: Padding(
              padding: const EdgeInsets.only(right: 4),
              child: Text(_user!.displayName,
                  style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
          ),
          IconButton(
            tooltip: '社区共振',
            onPressed: () => _selectTab(4),
            icon: const Icon(Icons.groups_outlined),
          ),
          IconButton(
            tooltip: '同步开奖数据',
            onPressed: _refreshing ? null : _refreshOfficialDraws,
            icon: _refreshing
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.sync),
          ),
          IconButton(
            tooltip: '退出登录',
            onPressed: _logout,
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            if (_status != null) StatusBanner(text: _status!),
            Expanded(
              child: IndexedStack(
                index: _tabIndex,
                children: [
                  OverviewPage(
                    lottery: _lottery,
                    onLotteryChanged: _switchLottery,
                    manualStrategy: _manualStrategy,
                    manualReds: _manualReds,
                    manualBlue: _manualBlue,
                    manualTicket: _manualTicket,
                    onManualStrategyChanged: (value) =>
                        setState(() => _manualStrategy = value),
                    onFavorite: _favorite,
                    onCopy: _copyTicket,
                    onToggleRed: _toggleRed,
                    onToggleBlue: _toggleBlue,
                    onCompleteManual: _completeManual,
                    onClearManual: _clearManual,
                  ),
                  PickPage(
                    lottery: _lottery,
                    strategy: _strategy,
                    coverageTicketCount: _coverageTicketCount,
                    tickets: _tickets,
                    onStrategyChanged: (value) =>
                        setState(() => _strategy = value),
                    onGenerate: _regenerate,
                    onCoverageCountChanged: (value) =>
                        setState(() => _coverageTicketCount = value),
                    onGenerateCombo: _generateCoverage,
                    onFavorite: _favorite,
                    onFavoriteAll: _favoriteTickets,
                    onCopy: _copyTicket,
                    onCopyAll: _copyTickets,
                  ),
                  AnalysisPage(
                      lottery: _lottery, analysis: _analysis, draws: _draws),
                  RecordsPage(
                    lottery: _lottery,
                    favorites: _favorites,
                    draws: _draws,
                    selectedIssue: _selectedFavoriteIssue,
                    currentIssue: _latest?.issue ?? '',
                    onIssueChanged: (value) =>
                        setState(() => _selectedFavoriteIssue = value),
                    onCopy: _copyTicket,
                    onCopyAll: _copyTickets,
                    onRemove: _removeFavorite,
                    onClearIssue: _clearFavoritesForIssue,
                  ),
                  CommunityPage(
                    sources: _communitySources,
                    tickets: _communityTickets,
                    loading: _communityLoading,
                    error: _communityError,
                    updatedAt: _communityUpdatedAt,
                    failedSources: _communityFailures,
                    onRefresh: _refreshCommunity,
                    onCopy: _copyTicket,
                    onFavorite: _favorite,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tabIndex,
        onDestinationSelected: _selectTab,
        destinations: const [
          NavigationDestination(
              icon: Icon(Icons.edit_outlined),
              selectedIcon: Icon(Icons.edit),
              label: '自选'),
          NavigationDestination(
              icon: Icon(Icons.tune_outlined),
              selectedIcon: Icon(Icons.tune),
              label: '选号'),
          NavigationDestination(
              icon: Icon(Icons.bar_chart_outlined),
              selectedIcon: Icon(Icons.bar_chart),
              label: '分析'),
          NavigationDestination(
              icon: Icon(Icons.bookmark_border),
              selectedIcon: Icon(Icons.bookmark),
              label: '记录'),
          NavigationDestination(
              icon: Icon(Icons.groups_outlined),
              selectedIcon: Icon(Icons.groups),
              label: '社区'),
        ],
      ),
    );
  }
}
