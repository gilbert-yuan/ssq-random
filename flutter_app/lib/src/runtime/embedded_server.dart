import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:http/http.dart' as http;
import 'package:shelf/shelf.dart';
import 'package:shelf/shelf_io.dart' as shelf_io;
import 'package:shelf_router/shelf_router.dart';
import 'package:shelf_static/shelf_static.dart';

import 'local_database.dart';

class EmbeddedServer {
  EmbeddedServer({
    required this.assetRoot,
    required this.database,
    required this.defaultSources,
  });

  final Directory assetRoot;
  final LocalDatabase database;
  final List<Map<String, dynamic>> defaultSources;

  final http.Client _client = http.Client();
  HttpServer? _httpServer;

  Uri get baseUri {
    final server = _httpServer;
    if (server == null) {
      throw StateError('Server has not started yet.');
    }
    return Uri.parse('http://127.0.0.1:${server.port}');
  }

  Future<void> start() async {
    if (_httpServer != null) return;
    final router = Router();
    final staticHandler = createStaticHandler(
      assetRoot.path,
      defaultDocument: 'mobile.html',
      serveFilesOutsidePath: false,
    );

    router.get('/', (Request request) {
      return Response.found('/mobile.html?embedded=1');
    });
    router.get('/api/health', (Request request) {
      return _jsonResponse({
        'ok': true,
        'time': DateTime.now().toUtc().toIso8601String(),
      });
    });
    router.get('/api/draws', _handleDraws);
    router.get('/api/metrics', _handleMetrics);
    router.post('/api/complete-ticket', _handleCompleteTicket);
    router.get('/api/records', _handleRecordsGet);
    router.post('/api/records', _handleRecordsPost);
    router.delete('/api/records', _handleRecordsDelete);
    router.patch('/api/records', _handleRecordsPatch);
    router.get('/api/community', _handleCommunity);
    router.get('/api/auth/me', _handleAuthMe);
    router.post('/api/auth/register', _handleAuthRegister);
    router.post('/api/auth/login', _handleAuthLogin);
    router.post('/api/auth/logout', _handleAuthLogout);

    final handler = Pipeline()
        .addMiddleware(_securityHeadersMiddleware())
        .addHandler((request) async {
      final response = await router.call(request);
      if (response.statusCode != 404) return response;
      if (request.url.path.startsWith('api/')) {
        return _jsonResponse(
          {'ok': false, 'error': 'not found', 'code': 'NOT_FOUND'},
          status: 404,
        );
      }
      return staticHandler(request);
    });

    _httpServer = await shelf_io.serve(
      handler,
      InternetAddress.loopbackIPv4,
      0,
    );
  }

  Future<void> stop() async {
    _client.close();
    await _httpServer?.close(force: true);
    _httpServer = null;
  }

  Middleware _securityHeadersMiddleware() {
    return (innerHandler) {
      return (request) async {
        final response = await innerHandler(request);
        return response.change(headers: {
          ...response.headers,
          'x-content-type-options': 'nosniff',
          'x-frame-options': 'DENY',
          'referrer-policy': 'strict-origin-when-cross-origin',
          'permissions-policy': 'camera=(), microphone=(), geolocation=()',
        });
      };
    };
  }

  Future<Response> _handleAuthMe(Request request) async {
    final auth = await _resolveAuth(request);
    return _jsonResponse({
      'ok': true,
      'authenticated': auth.user != null,
      'user': auth.user?.toJson(),
    });
  }

  Future<Response> _handleAuthRegister(Request request) async {
    try {
      final payload = await _readJsonBody(request);
      final result = await database.registerUser(payload);
      return _jsonResponse(
        {
          'ok': true,
          'authenticated': true,
          'user': result.user.toJson(),
          'expiresAt': result.expiresAt,
        },
        headers: {
          'set-cookie': _makeSessionCookie(result.sessionToken),
        },
      );
    } on AppException catch (error) {
      return _jsonResponse(
        {'ok': false, 'error': error.message},
        status: error.statusCode,
      );
    }
  }

  Future<Response> _handleAuthLogin(Request request) async {
    try {
      final payload = await _readJsonBody(request);
      final result = await database.loginUser(payload);
      return _jsonResponse(
        {
          'ok': true,
          'authenticated': true,
          'user': result.user.toJson(),
          'expiresAt': result.expiresAt,
        },
        headers: {
          'set-cookie': _makeSessionCookie(result.sessionToken),
        },
      );
    } on AppException catch (error) {
      return _jsonResponse(
        {'ok': false, 'error': error.message},
        status: error.statusCode,
      );
    }
  }

  Future<Response> _handleAuthLogout(Request request) async {
    final auth = await _resolveAuth(request);
    if (auth.sessionToken.isNotEmpty) {
      await database.revokeSession(auth.sessionToken);
    }
    return _jsonResponse(
      {
        'ok': true,
        'authenticated': false,
        'user': null,
      },
      headers: {
        'set-cookie': _clearSessionCookie(),
      },
    );
  }

  Future<Response> _handleDraws(Request request) async {
    final limit = _clampInt(
      request.requestedUri.queryParameters['limit'],
      fallback: 180,
      min: 30,
      max: 1000,
    );
    final refresh =
        request.requestedUri.queryParameters['refresh'] == '1';
    final payload = await _loadDrawPayload(limit: limit, refresh: refresh);
    return _jsonResponse(payload);
  }

  Future<Response> _handleMetrics(Request request) async {
    final limit = _clampInt(
      request.requestedUri.queryParameters['limit'],
      fallback: 240,
      min: 30,
      max: 300,
    );
    final draws = await database.readDraws(limit: limit);
    final series = _buildMetricSeries(draws);
    return _jsonResponse({
      'ok': true,
      'summary': {
        'count': series.length,
        'backtest': {
          'sumType': {'hitRate': 0, 'hits': 0, 'checked': 0},
          'parityType': {'hitRate': 0, 'hits': 0, 'checked': 0},
          'hotColdType': {'hitRate': 0, 'hits': 0, 'checked': 0},
        },
        'regression': {
          'avgAbsResidual': 0,
          'within10Rate': 0,
        },
      },
      'series': series,
    });
  }

  Future<Response> _handleCompleteTicket(Request request) async {
    try {
      final payload = await _readJsonBody(request);
      final draws = await database.readDraws(limit: 120);
      final auth = await _resolveAuth(request);
      final completion = await _buildCompletionPayload(
        payload,
        draws: draws,
        userId: auth.user?.id ?? '',
      );
      return _jsonResponse(completion);
    } on AppException catch (error) {
      return _jsonResponse(
        {'ok': false, 'error': error.message},
        status: error.statusCode,
      );
    }
  }

  Future<Response> _handleRecordsGet(Request request) async {
    final auth = await _resolveAuth(request);
    final limit = _clampInt(
      request.requestedUri.queryParameters['limit'],
      fallback: 240,
      min: 30,
      max: 1000,
    );
    final draws = await database.readDraws(limit: max(limit, 240));
    if (auth.user == null) {
      return _jsonResponse(_emptyRecordPayload(draws, auth.user));
    }
    final records = await database.readRecords(auth.user!.id);
    final annotated = _annotateRecords(records, draws);
    return _jsonResponse({
      'ok': true,
      'authenticated': true,
      'user': auth.user!.toJson(),
      'drawSource': 'sqlite',
      'latestDraw': draws.isEmpty ? null : draws.first.toJson(),
      'records': annotated.take(300).toList(growable: false),
      'summary': _buildRecordSummary(annotated),
      'sourcePerformance': _buildSourcePerformance(annotated),
      'announcements': _buildAnnouncements(annotated),
    });
  }

  Future<Response> _handleRecordsPost(Request request) async {
    final auth = await _resolveAuth(request);
    if (auth.user == null) return _unauthorizedResponse();
    final payload = await _readJsonBody(request);
    final items = payload['records'] is List
        ? List<Map<String, dynamic>>.from(payload['records'] as List)
        : <Map<String, dynamic>>[
            Map<String, dynamic>.from(
              payload['record'] as Map? ?? payload,
            ),
          ];
    final inserted = await database.appendRecords(auth.user!.id, items);
    return _jsonResponse({
      'ok': true,
      'added': inserted.length,
      'records': inserted.map((item) => item.toJson()).toList(growable: false),
    });
  }

  Future<Response> _handleRecordsDelete(Request request) async {
    final auth = await _resolveAuth(request);
    if (auth.user == null) return _unauthorizedResponse();
    final id = request.requestedUri.queryParameters['id'] ?? '';
    if (id.isEmpty) {
      return _jsonResponse(
        {'ok': false, 'error': 'missing record id'},
        status: 400,
      );
    }
    final deleted = await database.deleteRecord(id, auth.user!.id);
    return _jsonResponse({'ok': true, 'deleted': deleted});
  }

  Future<Response> _handleRecordsPatch(Request request) async {
    final auth = await _resolveAuth(request);
    if (auth.user == null) return _unauthorizedResponse();
    final payload = await _readJsonBody(request);
    final id = '${payload['id'] ?? request.requestedUri.queryParameters['id'] ?? ''}';
    if (id.isEmpty) {
      return _jsonResponse(
        {'ok': false, 'error': 'missing record id'},
        status: 400,
      );
    }
    final result = await database.setRecordPinned(
      id,
      payload['pinned'] == true,
      auth.user!.id,
    );
    return _jsonResponse({'ok': true, ...result});
  }

  Future<Response> _handleCommunity(Request request) async {
    final auth = await _resolveAuth(request);
    final userId = auth.user?.id ?? '';
    if (request.requestedUri.queryParameters['saved'] == '1') {
      final snapshot =
          userId.isEmpty ? null : await database.readCommunitySnapshot(userId);
      return _jsonResponse({
        'ok': true,
        'authenticated': userId.isNotEmpty,
        'user': auth.user?.toJson(),
        'snapshot': snapshot,
      });
    }

    final sources = await _readSources(request.requestedUri);
    final recommendations = <Map<String, dynamic>>[];
    final errors = <Map<String, dynamic>>[];

    for (final source in sources) {
      try {
        final html = await _fetchHtml(source.url);
        recommendations.addAll(_extractRecommendations(html, source));
      } catch (error) {
        errors.add({
          'sourceName': source.name,
          'sourceUrl': source.url,
          'error': '$error',
        });
      }
    }

    final payload = {
      'ok': true,
      'fetchedAt': DateTime.now().toUtc().toIso8601String(),
      'sources': sources.map((item) => item.toJson()).toList(growable: false),
      'count': recommendations.length,
      'recommendations': recommendations,
      'aggregate': _aggregateRecommendations(recommendations),
      'sourceScores': _scoreSources(sources, recommendations, errors),
      'errors': errors,
    };

    if (userId.isNotEmpty) {
      await database.upsertCommunitySnapshot(userId, payload);
    }

    return _jsonResponse(payload);
  }

  Future<Map<String, dynamic>> _loadDrawPayload({
    required int limit,
    required bool refresh,
  }) async {
    final stored = await database.readDraws(limit: limit);
    if (!refresh && stored.isNotEmpty) {
      return {
        'ok': true,
        'source': 'sqlite',
        'sourceUrl': 'local://sqlite',
        'fetchedAt': DateTime.now().toUtc().toIso8601String(),
        'draws': stored.map((item) => item.toJson()).toList(growable: false),
        'database': {
          'type': 'sqlite',
          'stored': stored.length,
        },
      };
    }

    try {
      final url = Uri.parse(
        'https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice'
        '?name=ssq&issueCount=&issueStart=&issueEnd=&dayStart=&dayEnd='
        '&pageNo=1&pageSize=$limit&week=&systemType=PC',
      );
      final response = await _client.get(url, headers: {
        'accept': 'application/json,text/plain,*/*',
        'user-agent': 'Flutter SSQ Mobile App',
        'referer': 'https://www.cwl.gov.cn/',
      }).timeout(const Duration(seconds: 12));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw HttpException('HTTP ${response.statusCode}');
      }
      final payload = json.decode(response.body) as Map<String, dynamic>;
      final rows = List<Map<String, dynamic>>.from(payload['result'] as List? ?? const []);
      final draws = rows
          .map(database.normalizeDraw)
          .whereType<StoredDraw>()
          .toList(growable: false);
      if (draws.isEmpty) {
        throw const FormatException('official API returned no draw rows');
      }
      await database.upsertDraws(draws);
      final latest = await database.readDraws(limit: limit);
      return {
        'ok': true,
        'source': 'official',
        'sourceUrl': url.toString(),
        'fetchedAt': DateTime.now().toUtc().toIso8601String(),
        'draws': latest.map((item) => item.toJson()).toList(growable: false),
        'database': {
          'type': 'sqlite',
          'stored': latest.length,
        },
      };
    } catch (error) {
      final fallback = stored.isNotEmpty
          ? stored
          : await database.readDraws(limit: limit);
      return {
        'ok': true,
        'source': fallback.isNotEmpty ? 'sqlite' : 'sample',
        'sourceUrl': 'local://sqlite',
        'fetchedAt': DateTime.now().toUtc().toIso8601String(),
        'warning': 'External source unavailable, using local cache.',
        'error': '$error',
        'draws': fallback.map((item) => item.toJson()).toList(growable: false),
        'database': {
          'type': 'sqlite',
          'stored': fallback.length,
        },
      };
    }
  }

  List<Map<String, dynamic>> _buildMetricSeries(List<StoredDraw> draws) {
    if (draws.isEmpty) return const [];
    final recent = draws.take(min(90, draws.length)).toList(growable: false);
    final frequency = _redFrequency(draws.take(min(30, draws.length)).toList());
    final sortedHot = frequency.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final hotSet = sortedHot.take(12).map((entry) => entry.key).toSet();
    final coldSet = sortedHot.reversed.take(12).map((entry) => entry.key).toSet();

    return recent.map((draw) {
      final redInts = draw.red.map(int.parse).toList(growable: false);
      final sum = redInts.fold<int>(0, (acc, item) => acc + item);
      final odd = redInts.where((item) => item.isOdd).length;
      final even = redInts.length - odd;
      final hotHits = draw.red.where(hotSet.contains).length;
      final coldHits = draw.red.where(coldSet.contains).length;
      return {
        'issue': draw.issue,
        'sum': sum,
        'odd': odd,
        'even': even,
        'hotRatio': double.parse((hotHits / 6).toStringAsFixed(2)),
        'coldRatio': double.parse((coldHits / 6).toStringAsFixed(2)),
        'typeLabel': _classifyDraw(sum: sum, odd: odd, hotHits: hotHits),
      };
    }).toList(growable: false);
  }

  Future<Map<String, dynamic>> _buildCompletionPayload(
    Map<String, dynamic> payload, {
    required List<StoredDraw> draws,
    required String userId,
  }) async {
    if (draws.isEmpty) {
      throw AppException(400, 'draw history is required before completion');
    }

    final selectedReds = _parseBallList(payload['reds'], 33).toSet();
    if (selectedReds.length > 6) {
      throw AppException(400, 'red ball count must be 6 or fewer');
    }
    final blueList = _parseBallList(payload['blue'], 16);
    final selectedBlue = blueList.isEmpty ? '' : blueList.first;
    final strategy = '${payload['strategy'] ?? 'balanced'}';

    final recent = draws.take(min(30, draws.length)).toList(growable: false);
    final redFreq = _redFrequency(recent);
    final blueFreq = _blueFrequency(recent);
    final rankedReds = redFreq.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final rankedBlues = blueFreq.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    List<String>? communityReds;
    String? communityBlue;
    if (strategy == 'community' && userId.isNotEmpty) {
      final snapshot = await database.readCommunitySnapshot(userId);
      final aggregate = List<Map<String, dynamic>>.from(
        snapshot?['aggregate'] as List? ?? const [],
      );
      for (final item in aggregate) {
        final reds = _parseBallList(item['reds'], 33).toSet();
        final blue = _parseBallList(item['blue'], 16);
        final matchesReds = selectedReds.every(reds.contains);
        final matchesBlue = selectedBlue.isEmpty ||
            (blue.isNotEmpty && blue.first == selectedBlue);
        if (matchesReds && matchesBlue) {
          communityReds = reds.toList()..sort();
          communityBlue = blue.isEmpty ? null : blue.first;
          break;
        }
      }
    }

    final finalReds = <String>{...selectedReds};
    final preferredReds = communityReds ??
        _prioritizedRedsForStrategy(strategy, rankedReds.map((item) => item.key).toList());
    for (final red in preferredReds) {
      if (finalReds.length >= 6) break;
      finalReds.add(red);
    }
    if (finalReds.length < 6) {
      for (var i = 1; i <= 33 && finalReds.length < 6; i += 1) {
        finalReds.add(i.toString().padLeft(2, '0'));
      }
    }
    final orderedReds = finalReds.toList()..sort();

    final blue = selectedBlue.isNotEmpty
        ? selectedBlue
        : (communityBlue ??
            _prioritizedBlueForStrategy(
              strategy,
              rankedBlues.map((item) => item.key).toList(),
            ));
    final score = 70 + selectedReds.length * 4 + (selectedBlue.isNotEmpty ? 3 : 0);

    return {
      'ok': true,
      'ticket': {
        'reds': orderedReds,
        'blue': blue,
        'kind': strategy,
        'score': score,
        'reason':
            'Completed inside the Flutter app using local draw statistics.',
      },
      'position': {
        'typeLabel': 'Local completion',
        'rows': [
          {
            'label': 'Selected reds',
            'value': selectedReds.isEmpty ? '--' : (selectedReds.toList()..sort()).join(' '),
            'percentile': 90,
          },
          {
            'label': 'Completion strategy',
            'value': strategy,
            'percentile': 86,
          },
          {
            'label': 'Blue ball',
            'value': blue,
            'percentile': 78,
          },
        ],
      },
    };
  }

  List<String> _prioritizedRedsForStrategy(
    String strategy,
    List<String> ranked,
  ) {
    if (strategy == 'cold') {
      return ranked.reversed.toList(growable: false);
    }
    if (strategy == 'balanced') {
      final head = ranked.take(12).toList();
      final middle = ranked.skip(12).take(12).toList();
      return [...head.take(3), ...middle.take(3), ...head.skip(3)];
    }
    return ranked;
  }

  String _prioritizedBlueForStrategy(
    String strategy,
    List<String> ranked,
  ) {
    if (ranked.isEmpty) return '01';
    if (strategy == 'cold') return ranked.last;
    if (strategy == 'blue') return ranked.first;
    return ranked[min(1, ranked.length - 1)];
  }

  List<Map<String, dynamic>> _annotateRecords(
    List<StoredRecord> records,
    List<StoredDraw> draws,
  ) {
    final ascending = [...draws]
      ..sort((a, b) => int.parse(a.issue).compareTo(int.parse(b.issue)));

    return records.map((record) {
      final validationDraw = _findValidationDraw(record, ascending);
      final hit = validationDraw == null
          ? null
          : _scoreRecordAgainstDraw(record, validationDraw);
      return {
        ...record.toJson(),
        'status': hit == null
            ? 'pending'
            : ((hit['prize'] as Map<String, dynamic>)['won'] == true
                ? 'won'
                : 'lost'),
        'hit': hit,
        'isPinned': record.pinnedAt.isNotEmpty,
      };
    }).toList(growable: false);
  }

  StoredDraw? _findValidationDraw(
    StoredRecord record,
    List<StoredDraw> ascendingDraws,
  ) {
    if (record.baseIssue.isNotEmpty) {
      for (final draw in ascendingDraws) {
        if (int.tryParse(draw.issue) != null &&
            int.tryParse(record.baseIssue) != null &&
            int.parse(draw.issue) > int.parse(record.baseIssue)) {
          return draw;
        }
      }
      return null;
    }
    return ascendingDraws.isEmpty ? null : ascendingDraws.last;
  }

  Map<String, dynamic> _scoreRecordAgainstDraw(
    StoredRecord record,
    StoredDraw draw,
  ) {
    final redHits = draw.red.where(record.reds.contains).length;
    final blueHit = record.blue == draw.blue ? 1 : 0;
    final prize = _evaluatePrize(redHits, blueHit);
    return {
      'issue': draw.issue,
      'date': draw.date,
      'redHits': redHits,
      'blueHit': blueHit,
      'hitText': '$redHits+$blueHit',
      'drawRed': draw.red,
      'drawBlue': draw.blue,
      'prize': prize,
    };
  }

  Map<String, dynamic> _evaluatePrize(int redHits, int blueHit) {
    String label = '';
    int tier = 0;
    bool won = false;
    bool jackpot = false;

    if (redHits == 6 && blueHit == 1) {
      label = '1st prize';
      tier = 1;
      won = true;
      jackpot = true;
    } else if (redHits == 6) {
      label = '2nd prize';
      tier = 2;
      won = true;
      jackpot = true;
    } else if (redHits == 5 && blueHit == 1) {
      label = '3rd prize';
      tier = 3;
      won = true;
    } else if ((redHits == 5 && blueHit == 0) || (redHits == 4 && blueHit == 1)) {
      label = '4th prize';
      tier = 4;
      won = true;
    } else if ((redHits == 4 && blueHit == 0) || (redHits == 3 && blueHit == 1)) {
      label = '5th prize';
      tier = 5;
      won = true;
    } else if (blueHit == 1 && redHits <= 2) {
      label = '6th prize';
      tier = 6;
      won = true;
    }

    return {
      'won': won,
      'tier': tier,
      'label': label,
      'amount': null,
      'amountText': '',
      'isJackpot': jackpot,
    };
  }

  Map<String, dynamic> _buildRecordSummary(List<Map<String, dynamic>> records) {
    final checked = records.where((item) => item['hit'] != null).toList();
    final wins = checked
        .where((item) => ((item['hit'] as Map)['prize'] as Map)['won'] == true)
        .toList();
    final pendingCount = records.length - checked.length;
    final blueHits =
        checked.where((item) => (item['hit'] as Map)['blueHit'] == 1).length;
    final avgRed = checked.isEmpty
        ? 0.0
        : checked
                .map((item) => (item['hit'] as Map)['redHits'] as int)
                .reduce((a, b) => a + b) /
            checked.length;

    Map<String, dynamic>? best;
    var bestScore = -1;
    for (final item in checked) {
      final hit = item['hit'] as Map<String, dynamic>;
      final prize = hit['prize'] as Map<String, dynamic>;
      final score =
          ((prize['won'] == true) ? (7 - (prize['tier'] as int)) * 100 : 0) +
              (hit['redHits'] as int) * 10 +
              (hit['blueHit'] as int) * 3;
      if (score > bestScore) {
        bestScore = score;
        best = {
          'id': item['id'],
          'key': item['key'],
          'type': item['type'],
          'strategy': item['strategy'],
          'sourceName': item['sourceName'],
          'hitText': hit['hitText'],
          'issue': hit['issue'],
          'prizeLabel': prize['label'],
          'prizeAmountText': prize['amountText'],
        };
      }
    }

    return {
      'total': records.length,
      'checked': checked.length,
      'pendingCount': pendingCount,
      'winCount': wins.length,
      'loseCount': checked.length - wins.length,
      'avgRed': double.parse(avgRed.toStringAsFixed(2)),
      'blueHits': blueHits,
      'blueRate': checked.isEmpty
          ? 0
          : ((blueHits / checked.length) * 100).round(),
      'strongHits': checked
          .where((item) {
            final hit = item['hit'] as Map<String, dynamic>;
            return (hit['redHits'] as int) >= 4 ||
                ((hit['redHits'] as int) >= 3 && (hit['blueHit'] as int) == 1);
          })
          .length,
      'totalAmount': 0,
      'totalAmountText': '',
      'jackpotCount': wins
          .where((item) =>
              (((item['hit'] as Map)['prize'] as Map)['isJackpot'] == true))
          .length,
      'best': best,
    };
  }

  List<Map<String, dynamic>> _buildSourcePerformance(
    List<Map<String, dynamic>> records,
  ) {
    final sourceRecords = records.where(
      (item) =>
          item['type'] == 'community' &&
          '${item['sourceName']}'.isNotEmpty &&
          item['hit'] != null,
    );
    final bySource = <String, Map<String, dynamic>>{};
    for (final record in sourceRecords) {
      final sourceName = '${record['sourceName']}';
      final hit = record['hit'] as Map<String, dynamic>;
      final row = bySource[sourceName] ??
          {
            'sourceName': sourceName,
            'sourceUrl': record['sourceUrl'],
            'checked': 0,
            'totalRed': 0,
            'blueHits': 0,
            'strongHits': 0,
            'performanceScore': 0,
          };
      row['checked'] = (row['checked'] as int) + 1;
      row['totalRed'] = (row['totalRed'] as int) + (hit['redHits'] as int);
      row['blueHits'] = (row['blueHits'] as int) + (hit['blueHit'] as int);
      if ((hit['redHits'] as int) >= 4 ||
          ((hit['redHits'] as int) >= 3 && (hit['blueHit'] as int) == 1)) {
        row['strongHits'] = (row['strongHits'] as int) + 1;
      }
      bySource[sourceName] = row;
    }

    return bySource.values.map((row) {
      final checked = row['checked'] as int;
      final totalRed = row['totalRed'] as int;
      final blueHits = row['blueHits'] as int;
      final strongHits = row['strongHits'] as int;
      return {
        ...row,
        'avgRed': checked == 0 ? 0 : double.parse((totalRed / checked).toStringAsFixed(2)),
        'blueRate': checked == 0 ? 0 : ((blueHits / checked) * 100).round(),
        'totalAmount': 0,
        'totalAmountText': '',
        'performanceScore': min(99, totalRed * 4 + blueHits * 8 + strongHits * 12),
      };
    }).toList(growable: false)
      ..sort((a, b) =>
          (b['performanceScore'] as int).compareTo(a['performanceScore'] as int));
  }

  List<Map<String, dynamic>> _buildAnnouncements(
    List<Map<String, dynamic>> records,
  ) {
    return records
        .where((item) =>
            item['type'] == 'favorite' &&
            item['hit'] != null &&
            (((item['hit'] as Map)['prize'] as Map)['isJackpot'] == true))
        .take(5)
        .map((item) {
      final hit = item['hit'] as Map<String, dynamic>;
      final prize = hit['prize'] as Map<String, dynamic>;
      return {
        'id': item['id'],
        'issue': hit['issue'],
        'prizeLabel': prize['label'],
        'amount': prize['amount'],
        'amountText': prize['amountText'],
        'text':
            'Win alert: favorite ticket matched ${prize['label']} on issue ${hit['issue']}.',
      };
    }).toList(growable: false);
  }

  Map<String, dynamic> _emptyRecordPayload(
    List<StoredDraw> draws,
    AppUser? user,
  ) {
    return {
      'ok': true,
      'authenticated': false,
      'user': user?.toJson(),
      'drawSource': 'sqlite',
      'latestDraw': draws.isEmpty ? null : draws.first.toJson(),
      'records': const [],
      'summary': _buildRecordSummary(const []),
      'sourcePerformance': const [],
      'announcements': const [],
    };
  }

  Future<List<CommunitySource>> _readSources(Uri uri) async {
    final raw = uri.queryParameters['urls'] ?? '';
    final custom = raw
        .split(RegExp(r'\n+'))
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty)
        .take(8)
        .toList(growable: false);
    if (custom.isNotEmpty) {
      return Future.wait(custom.map((item) async {
        final target = Uri.parse(item);
        await _validateSource(target);
        return CommunitySource(
          name: 'Custom source ${custom.indexOf(item) + 1}',
          url: target.toString(),
        );
      }));
    }
    final builtIn = defaultSources
        .map((item) => CommunitySource(
              name: '${item['name'] ?? 'Source'}',
              url: '${item['url'] ?? ''}',
            ))
        .where((item) => item.url.isNotEmpty)
        .take(8)
        .toList(growable: false);
    for (final source in builtIn) {
      await _validateSource(Uri.parse(source.url));
    }
    return builtIn;
  }

  Future<void> _validateSource(Uri uri) async {
    if (!(uri.scheme == 'http' || uri.scheme == 'https')) {
      throw const FormatException('only HTTP/HTTPS source URLs are supported');
    }
    if (uri.userInfo.isNotEmpty) {
      throw const FormatException('source URLs must not include credentials');
    }
    final host = uri.host.toLowerCase();
    if (host == 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
      throw const FormatException('local and private network URLs are not allowed');
    }
    final addresses = await InternetAddress.lookup(host);
    if (addresses.any(_isPrivateAddress)) {
      throw const FormatException('local and private network URLs are not allowed');
    }
  }

  bool _isPrivateAddress(InternetAddress address) {
    final host = address.address;
    if (address.type == InternetAddressType.IPv4) {
      final parts = host.split('.').map(int.parse).toList(growable: false);
      final first = parts[0];
      final second = parts[1];
      return first == 0 ||
          first == 10 ||
          first == 127 ||
          (first == 169 && second == 254) ||
          (first == 172 && second >= 16 && second <= 31) ||
          (first == 192 && second == 168) ||
          first >= 224;
    }
    return host == '::1' ||
        host == '::' ||
        host.startsWith('fc') ||
        host.startsWith('fd') ||
        host.startsWith('fe80:');
  }

  Future<String> _fetchHtml(String url) async {
    final response = await _client.get(
      Uri.parse(url),
      headers: {
        'accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'user-agent': 'Flutter SSQ Mobile App',
      },
    ).timeout(const Duration(seconds: 12));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw HttpException('HTTP ${response.statusCode}');
    }
    try {
      return utf8.decode(response.bodyBytes);
    } catch (_) {
      return latin1.decode(response.bodyBytes);
    }
  }

  List<Map<String, dynamic>> _extractRecommendations(
    String html,
    CommunitySource source,
  ) {
    final lines = _htmlToCandidateLines(html);
    final seen = <String>{};
    final results = <Map<String, dynamic>>[];
    for (final line in lines) {
      final parsed = _parseRecommendationFromLine(line);
      if (parsed == null) continue;
      final key = '${(parsed['reds'] as List).join(',')}+${parsed['blue']}';
      if (!seen.add(key)) continue;
      results.add({
        ...parsed,
        'key': key,
        'sourceName': source.name,
        'sourceUrl': source.url,
        'context': line.length > 180 ? line.substring(0, 180) : line,
      });
      if (results.length >= 50) break;
    }
    return results;
  }

  List<String> _htmlToCandidateLines(String html) {
    final normalized = _decodeEntities(_normalizeDigits(html))
        .replaceAll(RegExp(r'<script[\s\S]*?</script>', caseSensitive: false), ' ')
        .replaceAll(RegExp(r'<style[\s\S]*?</style>', caseSensitive: false), ' ')
        .replaceAll(
          RegExp(r'<(br|p|li|tr|div|section|article|h[1-6])\b[^>]*>', caseSensitive: false),
          '\n',
        )
        .replaceAll(RegExp(r'<[^>]+>'), ' ')
        .replaceAll(RegExp(r'[ \t]+'), ' ');

    return normalized
        .split(RegExp(r'\n+'))
        .map((item) => item.trim())
        .where((item) => item.length >= 12 && item.length <= 260)
        .where((item) =>
            RegExp(r'(?<!\d)(0?[1-9]|[12]\d|3[0-3])(?!\d)').allMatches(item).length >= 7)
        .toList(growable: false);
  }

  Map<String, dynamic>? _parseRecommendationFromLine(String line) {
    final compact = _normalizeDigits(line)
        .replaceAll(RegExp(r'[:;,]'), ' ')
        .replaceAll('|', ' | ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();

    final explicit = RegExp(
      r'((?:0?[1-9]|[12]\d|3[0-3])(?:[\s,./|+\-]+(?:0?[1-9]|[12]\d|3[0-3])){5,})\s*(?:\+|\|)\s*(0?[1-9]|1[0-6])',
      caseSensitive: false,
    ).firstMatch(compact);
    if (explicit != null) {
      final reds = _uniqueSortedReds(
        _parseBallList(explicit.group(1), 33).map(int.parse).toList(),
      );
      final blue = int.parse(explicit.group(2)!).toString().padLeft(2, '0');
      if (reds.length == 6) {
        return {'reds': reds, 'blue': blue, 'confidence': 0.94};
      }
    }

    final tokens = RegExp(r'(?<!\d)(0?[1-9]|[12]\d|3[0-3])(?!\d)')
        .allMatches(compact)
        .map((match) => int.parse(match.group(0)!))
        .toList(growable: false);
    if (tokens.length < 7) return null;

    for (var index = 0; index <= tokens.length - 7; index += 1) {
      final slice = tokens.sublist(index, index + 7);
      final reds = _uniqueSortedReds(slice.take(6).toList(growable: false));
      final blue = slice[6];
      if (reds.length == 6 && blue >= 1 && blue <= 16) {
        return {
          'reds': reds,
          'blue': blue.toString().padLeft(2, '0'),
          'confidence': index == 0 ? 0.72 : 0.62,
        };
      }
    }
    return null;
  }

  List<String> _uniqueSortedReds(List<int> numbers) {
    final filtered = numbers.where((item) => item >= 1 && item <= 33).toSet().toList()
      ..sort();
    return filtered.take(6).map((item) => item.toString().padLeft(2, '0')).toList(growable: false);
  }

  List<Map<String, dynamic>> _aggregateRecommendations(
    List<Map<String, dynamic>> items,
  ) {
    final map = <String, Map<String, dynamic>>{};
    for (final item in items) {
      final key = '${item['key']}';
      final current = map[key] ??
          {
            'key': key,
            'reds': item['reds'],
            'blue': item['blue'],
            'count': 0,
            'sources': <String>[],
            'confidence': 0.0,
          };
      current['count'] = (current['count'] as int) + 1;
      current['confidence'] =
          (current['confidence'] as num).toDouble() + ((item['confidence'] as num?)?.toDouble() ?? 0.6);
      (current['sources'] as List<String>).add('${item['sourceName']}');
      map[key] = current;
    }

    final rows = map.values.map((item) {
      final count = item['count'] as int;
      final confidence = (item['confidence'] as num).toDouble();
      return {
        ...item,
        'confidence': double.parse((confidence / max(1, count)).toStringAsFixed(2)),
        'sources': (item['sources'] as List<String>).toSet().toList(growable: false),
      };
    }).toList(growable: false)
      ..sort((a, b) {
        final byCount = (b['count'] as int).compareTo(a['count'] as int);
        if (byCount != 0) return byCount;
        return ((b['confidence'] as num).toDouble())
            .compareTo((a['confidence'] as num).toDouble());
      });
    return rows.take(30).toList(growable: false);
  }

  List<Map<String, dynamic>> _scoreSources(
    List<CommunitySource> sources,
    List<Map<String, dynamic>> recommendations,
    List<Map<String, dynamic>> errors,
  ) {
    final rows = <String, Map<String, dynamic>>{};
    for (final source in sources) {
      rows[source.name] = {
        'sourceName': source.name,
        'sourceUrl': source.url,
        'parsed': 0,
        'unique': <String>{},
        'confidence': 0.0,
        'error': errors.any((item) => item['sourceName'] == source.name),
      };
    }

    for (final item in recommendations) {
      final row = rows['${item['sourceName']}'];
      if (row == null) continue;
      row['parsed'] = (row['parsed'] as int) + 1;
      (row['unique'] as Set<String>).add('${item['key']}');
      row['confidence'] =
          (row['confidence'] as num).toDouble() + ((item['confidence'] as num?)?.toDouble() ?? 0.6);
    }

    return rows.values.map((row) {
      final parsed = row['parsed'] as int;
      final unique = (row['unique'] as Set<String>).length;
      final avgConfidence = parsed == 0
          ? 0.0
          : (row['confidence'] as num).toDouble() / parsed;
      final score = row['error'] == true
          ? 15
          : min(96, (35 + parsed * 4 + unique * 3 + avgConfidence * 25).round());
      return {
        'sourceName': row['sourceName'],
        'sourceUrl': row['sourceUrl'],
        'parsed': parsed,
        'unique': unique,
        'avgConfidence': double.parse(avgConfidence.toStringAsFixed(2)),
        'error': row['error'],
        'score': score,
      };
    }).toList(growable: false)
      ..sort((a, b) => (b['score'] as int).compareTo(a['score'] as int));
  }

  Map<String, int> _redFrequency(List<StoredDraw> draws) {
    final map = <String, int>{};
    for (var i = 1; i <= 33; i += 1) {
      map[i.toString().padLeft(2, '0')] = 0;
    }
    for (final draw in draws) {
      for (final red in draw.red) {
        map[red] = (map[red] ?? 0) + 1;
      }
    }
    return map;
  }

  Map<String, int> _blueFrequency(List<StoredDraw> draws) {
    final map = <String, int>{};
    for (var i = 1; i <= 16; i += 1) {
      map[i.toString().padLeft(2, '0')] = 0;
    }
    for (final draw in draws) {
      map[draw.blue] = (map[draw.blue] ?? 0) + 1;
    }
    return map;
  }

  String _classifyDraw({
    required int sum,
    required int odd,
    required int hotHits,
  }) {
    if (hotHits >= 4) return 'hot-heavy';
    if (sum >= 110) return 'high-sum';
    if (sum <= 80) return 'low-sum';
    if (odd >= 4) return 'odd-heavy';
    return 'balanced';
  }

  Future<Map<String, dynamic>> _readJsonBody(Request request) async {
    final body = await request.readAsString();
    if (body.trim().isEmpty) return <String, dynamic>{};
    return Map<String, dynamic>.from(json.decode(body) as Map);
  }

  Future<_ResolvedAuth> _resolveAuth(Request request) async {
    final token = _extractSessionToken(request);
    final user = await database.resolveSessionUser(token);
    return _ResolvedAuth(sessionToken: token, user: user);
  }

  String _extractSessionToken(Request request) {
    final cookieHeader = request.headers['cookie'] ?? '';
    for (final chunk in cookieHeader.split(';')) {
      final parts = chunk.trim().split('=');
      if (parts.length < 2) continue;
      final name = parts.first.trim();
      final value = parts.sublist(1).join('=').trim();
      if (name == LocalDatabase.sessionCookieName) {
        return Uri.decodeComponent(value);
      }
    }
    return '';
  }

  String _makeSessionCookie(String token) {
    final maxAge = LocalDatabase.sessionTtlDays * 24 * 60 * 60;
    return '${LocalDatabase.sessionCookieName}=${Uri.encodeComponent(token)}; '
        'Path=/; HttpOnly; SameSite=Lax; Max-Age=$maxAge';
  }

  String _clearSessionCookie() {
    return '${LocalDatabase.sessionCookieName}=; '
        'Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
  }

  Response _unauthorizedResponse() {
    return _jsonResponse(
      {
        'ok': false,
        'authenticated': false,
        'user': null,
        'error': 'login required',
        'code': 'AUTH_REQUIRED',
      },
      status: 401,
    );
  }

  Response _jsonResponse(
    Map<String, dynamic> payload, {
    int status = 200,
    Map<String, String> headers = const {},
  }) {
    return Response(
      status,
      body: json.encode(payload),
      headers: {
        'content-type': 'application/json; charset=utf-8',
        ...headers,
      },
    );
  }

  int _clampInt(
    String? value, {
    required int fallback,
    required int min,
    required int max,
  }) {
    final parsed = int.tryParse(value ?? '');
    if (parsed == null) return fallback;
    if (parsed < min) return min;
    if (parsed > max) return max;
    return parsed;
  }

  String _decodeEntities(String text) {
    return text
        .replaceAll(RegExp(r'&nbsp;|&#160;', caseSensitive: false), ' ')
        .replaceAll(RegExp(r'&amp;', caseSensitive: false), '&')
        .replaceAll(RegExp(r'&lt;', caseSensitive: false), '<')
        .replaceAll(RegExp(r'&gt;', caseSensitive: false), '>')
        .replaceAll(RegExp(r'&quot;', caseSensitive: false), '"');
  }

  String _normalizeDigits(String text) {
    return text.replaceAllMapped(
      RegExp(r'[\uFF10-\uFF19]'),
      (match) => String.fromCharCode(match.group(0)!.codeUnitAt(0) - 0xFF10 + 48),
    );
  }

  List<String> _parseBallList(Object? value, int max) {
    final text = _normalizeDigits(
      value is List ? value.join(' ') : '${value ?? ''}',
    );
    return RegExp(r'\d{1,2}')
        .allMatches(text)
        .map((item) => int.tryParse(item.group(0) ?? ''))
        .whereType<int>()
        .where((item) => item >= 1 && item <= max)
        .map((item) => item.toString().padLeft(2, '0'))
        .toList(growable: false);
  }
}

class CommunitySource {
  CommunitySource({
    required this.name,
    required this.url,
  });

  final String name;
  final String url;

  Map<String, dynamic> toJson() => {
        'name': name,
        'url': url,
      };
}

class _ResolvedAuth {
  _ResolvedAuth({
    required this.sessionToken,
    required this.user,
  });

  final String sessionToken;
  final AppUser? user;
}
