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
      title: '双色球助手',
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
  String _strategy = 'balanced';
  String _manualStrategy = 'balanced';
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

  AnalysisSnapshot get _analysis => AnalysisSnapshot.fromDraws(_draws);
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
      final draws = await database.readDraws(limit: 240);
      final token = await database.readLocalSessionToken();
      final user = token.isEmpty ? null : await database.resolveSessionUser(token);
      final records = user == null ? const <StoredRecord>[] : await database.readRecords(user.id);
      var communitySources = const <CommunitySource>[];
      try {
        communitySources = await _communityService.loadSources();
      } catch (_) {
        communitySources = const [];
      }
      if (!mounted) return;
      setState(() {
        _database = database;
        _draws = draws;
        _user = user;
        _sessionToken = user == null ? '' : token;
        _communitySources = communitySources;
        _tickets = _generateTickets('balanced');
        _favorites
          ..clear()
          ..addAll(records.where((record) => record.type == 'favorite').map(ticketFromRecord));
        _loading = false;
        _status = user == null ? null : '已加载 ${draws.length} 期开奖数据和 ${_favorites.length} 条收藏';
      });
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
    final records = await database.readRecords(result.user.id);
    if (!mounted) return;
    setState(() {
      _user = result.user;
      _sessionToken = result.sessionToken;
      _favorites
        ..clear()
        ..addAll(records.where((record) => record.type == 'favorite').map(ticketFromRecord));
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

  Future<void> _register(String username, String password, String displayName) async {
    final database = _database;
    if (database == null || _authLoading) return;
    setState(() {
      _authLoading = true;
      _authError = null;
    });
    try {
      final result = await database.registerUser(
        {'username': username, 'password': password, 'displayName': displayName},
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

  Future<void> _refreshOfficialDraws() async {
    final database = _database;
    if (database == null || _refreshing) return;
    setState(() {
      _refreshing = true;
      _status = '正在同步官方开奖数据';
    });
    try {
      final uri = Uri.parse(
        'https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice'
        '?name=ssq&issueCount=&issueStart=&issueEnd=&dayStart=&dayEnd='
        '&pageNo=1&pageSize=240&week=&systemType=PC',
      );
      final response = await http.get(uri, headers: const {
        'accept': 'application/json,text/plain,*/*',
        'user-agent': 'Flutter SSQ Native App',
        'referer': 'https://www.cwl.gov.cn/',
      }).timeout(const Duration(seconds: 12));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw Exception('HTTP ${response.statusCode}');
      }
      final payload = json.decode(response.body) as Map<String, dynamic>;
      final rows = List<Map<String, dynamic>>.from(
        payload['result'] as List? ?? const [],
      );
      final draws = rows.map(database.normalizeDraw).whereType<StoredDraw>().toList();
      if (draws.isEmpty) throw Exception('官方接口没有返回开奖数据');
      await database.upsertDraws(draws);
      final latest = await database.readDraws(limit: 240);
      if (!mounted) return;
      setState(() {
        _draws = latest;
        _tickets = _generateTickets(_strategy);
        _refreshing = false;
        _status = '已同步 ${latest.length} 期开奖数据';
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _refreshing = false;
        _status = '同步失败，继续使用本地数据：$error';
      });
    }
  }

  Future<void> _refreshCommunity() async {
    if (_communityLoading) return;
    setState(() {
      _communityLoading = true;
      _communityError = null;
      _status = '正在刷新社区共振';
    });
    try {
      final result = await _communityService.fetchResonance();
      final latest = _latest;
      final tickets = result.picks
          .map(
            (pick) => pick.toTicket(
              baseIssue: latest?.issue ?? '',
              baseDate: latest?.date ?? '',
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
        _status = tickets.isEmpty ? '社区共振暂未识别到号码' : '已刷新 ${tickets.length} 组社区共振号';
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

  List<Ticket> _generateTickets(String strategy, {int count = 6}) {
    final analysis = _analysis;
    if (_draws.isEmpty) return const [];
    final tickets = <Ticket>[];
    final seen = <String>{};
    final random = Random(DateTime.now().millisecondsSinceEpoch);
    var guard = 0;
    while (tickets.length < count && guard < count * 90) {
      final reds = _pickReds(strategy, analysis, random);
      final blue = _pickBlue(strategy, analysis, random);
      final ticket = Ticket(
        reds: reds,
        blue: blue,
        strategy: strategy,
        score: _scoreTicket(reds, blue, analysis),
        reason: _strategyReason(strategy, reds, blue, analysis),
        sourceName: '本地趋势',
        baseIssue: _latest?.issue ?? '',
        baseDate: _latest?.date ?? '',
      );
      if (seen.add(ticket.key)) tickets.add(ticket);
      guard += 1;
    }
    return tickets;
  }

  List<String> _pickReds(String strategy, AnalysisSnapshot analysis, Random random) {
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
        if (selected.length >= 6) break;
        if (selected.contains(red)) continue;
        if (_wouldOverloadZone(selected, red) && random.nextDouble() < 0.72) continue;
        if (_wouldOverloadHot(strategy, selected, red, analysis) && random.nextDouble() < 0.84) continue;
        selected.add(red);
      }
      for (final red in analysis.allReds) {
        if (selected.length >= 6) break;
        selected.add(red);
      }
      final reds = selected.toList()..sort();
      final score = _redQualityScore(reds, analysis, strategy);
      if (score > bestScore) {
        bestScore = score;
        best = reds;
      }
    }
    if (best.length == 6) return best;
    return analysis.allReds.take(6).toList();
  }

  List<String> _redAnchorsForAttempt(String strategy, AnalysisSnapshot analysis, Random random) {
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

  bool _wouldOverloadHot(String strategy, Set<String> selected, String red, AnalysisSnapshot analysis) {
    final hotSet = analysis.hotReds.take(10).toSet();
    if (!hotSet.contains(red)) return false;
    final limit = strategy == 'hot' ? 3 : 2;
    final current = selected.where(hotSet.contains).length;
    return current >= limit;
  }

  int _redZone(String red) {
    final value = int.parse(red);
    if (value <= 11) return 0;
    if (value <= 22) return 1;
    return 2;
  }

  int _redQualityScore(List<String> reds, AnalysisSnapshot analysis, String strategy) {
    if (reds.length != 6) return -999;
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
    final leaderHit = analysis.leaderBackfillReds.take(5).contains(ballLabel(numbers.first));
    final tailHit = analysis.primeTailReds.take(5).contains(ballLabel(numbers.last));
    var score = 0;
    score += sum >= 70 && sum <= 128 ? 18 : 4;
    if (sum >= 78 && sum <= 118) score += 8;
    score += oddCount >= 2 && oddCount <= 4 ? 16 : 3;
    score += zoneCounts.every((count) => count > 0) ? 18 : 2;
    score += zoneCounts.every((count) => count <= 3) ? 8 : 0;
    score += consecutivePairs <= 1 ? 8 : max(0, 5 - consecutivePairs * 2);
    score += min(hotHits, 2) * 4;
    score += hotHits <= 2 ? 8 : hotHits == 3 ? 1 : -16;
    score += min(coldHits, 2) * 3;
    if (leaderHit) score += strategy == 'leaderBackfill' ? 16 : 6;
    if (tailHit) score += strategy == 'tailPrime' ? 16 : 6;
    if (strategy == 'hot' && hotHits >= 2 && hotHits <= 3) score += 8;
    if (strategy == 'hot' && hotHits >= 4) score -= 12;
    if (strategy == 'cold' && coldHits >= 2 && coldHits <= 4) score += 8;
    if (strategy == 'leaderBackfill' && !leaderHit) score -= 10;
    if (strategy == 'tailPrime' && !tailHit) score -= 10;
    return score;
  }

  String _pickBlue(String strategy, AnalysisSnapshot analysis, Random random) {
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
      _ => [
          ...analysis.hotBlues.take(5),
          ...analysis.coldBlues.take(4),
          ...analysis.oddTurnBlues.take(2),
        ],
    };
    final fallback = List.generate(16, (index) => ballLabel(index + 1));
    final ranked = pool.isEmpty ? fallback : pool;
    final limit = switch (strategy) {
      'blue' => min(6, ranked.length),
      'oddBlueTurn' => min(analysis.blueOddTurnActive ? 7 : 5, ranked.length),
      _ => min(8, ranked.length),
    };
    return ranked[random.nextInt(max(1, limit))];
  }

  int _scoreTicket(List<String> reds, String blue, AnalysisSnapshot analysis) {
    final redScore = _redQualityScore(reds, analysis, 'balanced');
    final blueHot = analysis.hotBlues.take(4).contains(blue) ? 8 : 0;
    final blueOddTurn = analysis.oddTurnBlues.take(6).contains(blue) ? 7 : 0;
    return min(99, max(45, 50 + (redScore / 2).round() + blueHot + blueOddTurn));
  }

  String _strategyReason(String strategy, List<String> reds, String blue, AnalysisSnapshot analysis) {
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
      '奇偶 $oddCount:${6 - oddCount}',
      '三区 ${zoneCounts.join('-')}',
    ];
    if (analysis.leaderBackfillReds.take(5).contains(ballLabel(values.first))) {
      highlights.add('龙头 ${ballLabel(values.first)}');
    }
    if (analysis.primeTailReds.take(5).contains(ballLabel(values.last))) {
      highlights.add('凤尾 ${ballLabel(values.last)}');
    }
    if (analysis.oddTurnBlues.contains(blue) && int.parse(blue).isOdd) {
      highlights.add('奇蓝 $blue');
    } else {
      highlights.add('蓝球 $blue');
    }
    return highlights.join(' · ');
  }

  void _regenerate() {
    setState(() {
      _tickets = _generateTickets(_strategy);
      _status = '已生成 ${_tickets.length} 注建议号';
    });
  }

  void _generateCombo() {
    const modes = ['leaderBackfill', 'tailPrime', 'oddBlueTurn', 'blue', 'balanced', 'hot'];
    final combo = <Ticket>[];
    final seen = <String>{};
    for (final mode in modes) {
      for (final ticket in _generateTickets(mode, count: 3)) {
        if (seen.add(ticket.key)) {
          combo.add(ticket);
          break;
        }
      }
    }
    setState(() {
      _tickets = combo;
      _status = '已生成推荐组合';
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
    return ticket.copyWith(baseIssue: _latest?.issue ?? '', baseDate: _latest?.date ?? '');
  }

  Future<void> _favoriteTickets(List<Ticket> tickets) async {
    final database = _database;
    final user = _user;
    if (database == null || user == null) return;
    final candidates = <Ticket>[];
    for (final ticket in tickets) {
      final scoped = _withCurrentBase(ticket).copyWith(createdAt: DateTime.now());
      if (_favorites.any((item) => item.key == scoped.key && item.baseIssue == scoped.baseIssue)) continue;
      candidates.add(scoped);
    }
    if (candidates.isEmpty) {
      setState(() => _status = '这些号码已经收藏');
      return;
    }
    final inserted = await database.appendRecords(
      user.id,
      candidates.map((ticket) => ticketToRecordPayload(ticket)).toList(growable: false),
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
    final preferred = _preferredRedPool(_manualStrategy, analysis).toList()..shuffle(random);
    for (final red in preferred) {
      if (reds.length >= 6) break;
      reds.add(red);
    }
    while (reds.length < 6) {
      reds.add(ballLabel(random.nextInt(33) + 1));
    }
    final sortedReds = reds.toList()..sort();
    final blue = _manualBlue.isNotEmpty ? _manualBlue : _pickBlue(_manualStrategy, analysis, random);
    setState(() {
      _manualTicket = Ticket(
        reds: sortedReds,
        blue: blue,
        strategy: _manualStrategy,
        score: _scoreTicket(sortedReds, blue, analysis),
        reason: '自选补全 · 已保留 ${_manualReds.length} 个红球${_manualBlue.isEmpty ? '' : '和蓝球 $_manualBlue'}',
        sourceName: '自选补全',
        baseIssue: _latest?.issue ?? '',
        baseDate: _latest?.date ?? '',
      );
      _status = '已补全自选号';
    });
  }

  void _toggleRed(String red) {
    setState(() {
      if (_manualReds.contains(red)) {
        _manualReds.remove(red);
      } else if (_manualReds.length < 6) {
        _manualReds.add(red);
      } else {
        _status = '红球最多选择 6 个';
      }
      _manualTicket = null;
    });
  }

  void _toggleBlue(String blue) {
    setState(() {
      _manualBlue = _manualBlue == blue ? '' : blue;
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
      );
    }
    if (!mounted) return;
    setState(() {
      _favorites.removeWhere((item) => item.scopedKey == ticket.scopedKey);
      _status = '已删除收藏';
    });
  }

  Future<void> _clearFavorites() async {
    final database = _database;
    final user = _user;
    if (database == null || user == null) return;
    await database.clearRecords(user.id, type: 'favorite');
    if (!mounted) return;
    setState(() {
      _favorites.clear();
      _selectedFavoriteIssue = '';
      _status = '已清空收藏记录';
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
    if (_error != null) return NativeErrorScreen(error: _error!, onRetry: _bootstrap);
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
        title: const Text('双色球助手'),
        actions: [
          Center(
            child: Padding(
              padding: const EdgeInsets.only(right: 4),
              child: Text(_user!.displayName, style: const TextStyle(fontWeight: FontWeight.w700)),
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
                    latest: _latest,
                    analysis: _analysis,
                    tickets: _tickets,
                    onFavorite: _favorite,
                    onCopy: _copyTicket,
                    onRegenerate: _regenerate,
                  ),
                  PickPage(
                    strategy: _strategy,
                    manualStrategy: _manualStrategy,
                    tickets: _tickets,
                    manualReds: _manualReds,
                    manualBlue: _manualBlue,
                    manualTicket: _manualTicket,
                    onStrategyChanged: (value) => setState(() => _strategy = value),
                    onManualStrategyChanged: (value) => setState(() => _manualStrategy = value),
                    onGenerate: _regenerate,
                    onGenerateCombo: _generateCombo,
                    onFavorite: _favorite,
                    onFavoriteAll: _favoriteTickets,
                    onCopy: _copyTicket,
                    onCopyAll: _copyTickets,
                    onToggleRed: _toggleRed,
                    onToggleBlue: _toggleBlue,
                    onCompleteManual: _completeManual,
                    onClearManual: _clearManual,
                  ),
                  AnalysisPage(analysis: _analysis, draws: _draws),
                  RecordsPage(
                    favorites: _favorites,
                    draws: _draws,
                    selectedIssue: _selectedFavoriteIssue,
                    currentIssue: _latest?.issue ?? '',
                    onIssueChanged: (value) => setState(() => _selectedFavoriteIssue = value),
                    onCopy: _copyTicket,
                    onCopyAll: _copyTickets,
                    onRemove: _removeFavorite,
                    onClear: _clearFavorites,
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
          NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard), label: '速览'),
          NavigationDestination(icon: Icon(Icons.tune_outlined), selectedIcon: Icon(Icons.tune), label: '选号'),
          NavigationDestination(icon: Icon(Icons.bar_chart_outlined), selectedIcon: Icon(Icons.bar_chart), label: '分析'),
          NavigationDestination(icon: Icon(Icons.bookmark_border), selectedIcon: Icon(Icons.bookmark), label: '记录'),
          NavigationDestination(icon: Icon(Icons.groups_outlined), selectedIcon: Icon(Icons.groups), label: '社区'),
        ],
      ),
    );
  }
}
