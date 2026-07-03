import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';
import 'package:uuid/uuid.dart';

class AppUser {
  AppUser({
    required this.id,
    required this.username,
    required this.displayName,
    required this.createdAt,
    required this.lastLoginAt,
  });

  final String id;
  final String username;
  final String displayName;
  final String createdAt;
  final String lastLoginAt;

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'username': username,
      'displayName': displayName,
      'createdAt': createdAt,
      'lastLoginAt': lastLoginAt,
    };
  }
}

class AuthResult {
  AuthResult({
    required this.user,
    required this.sessionToken,
    required this.expiresAt,
  });

  final AppUser user;
  final String sessionToken;
  final String expiresAt;
}

class StoredDraw {
  StoredDraw({
    required this.issue,
    required this.date,
    required this.red,
    required this.blue,
    required this.source,
  });

  final String issue;
  final String date;
  final List<String> red;
  final String blue;
  final String source;

  Map<String, dynamic> toJson() {
    return {
      'issue': issue,
      'date': date,
      'red': red,
      'blue': blue,
      'source': source,
    };
  }
}

class StoredRecord {
  StoredRecord({
    required this.id,
    required this.userId,
    required this.type,
    required this.key,
    required this.reds,
    required this.blue,
    required this.strategy,
    required this.sourceName,
    required this.sourceUrl,
    required this.baseIssue,
    required this.baseDate,
    required this.reason,
    required this.score,
    required this.createdAt,
    required this.pinnedAt,
  });

  final String id;
  final String userId;
  final String type;
  final String key;
  final List<String> reds;
  final String blue;
  final String strategy;
  final String sourceName;
  final String sourceUrl;
  final String baseIssue;
  final String baseDate;
  final String reason;
  final double? score;
  final String createdAt;
  final String pinnedAt;

  StoredRecord copyWith({
    String? pinnedAt,
  }) {
    return StoredRecord(
      id: id,
      userId: userId,
      type: type,
      key: key,
      reds: reds,
      blue: blue,
      strategy: strategy,
      sourceName: sourceName,
      sourceUrl: sourceUrl,
      baseIssue: baseIssue,
      baseDate: baseDate,
      reason: reason,
      score: score,
      createdAt: createdAt,
      pinnedAt: pinnedAt ?? this.pinnedAt,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'userId': userId,
      'type': type,
      'key': key,
      'reds': reds,
      'blue': blue,
      'strategy': strategy,
      'sourceName': sourceName,
      'sourceUrl': sourceUrl,
      'baseIssue': baseIssue,
      'baseDate': baseDate,
      'reason': reason,
      'score': score,
      'createdAt': createdAt,
      'pinnedAt': pinnedAt,
    };
  }
}

class LocalDatabase {
  LocalDatabase._(this._db);

  static const String sessionCookieName = 'ssq_session';
  static const int sessionTtlDays = 30;

  final Database _db;
  final Uuid _uuid = const Uuid();

  static Future<LocalDatabase> open({
    required List<Map<String, dynamic>> sampleDraws,
  }) async {
    final supportDir = await getApplicationSupportDirectory();
    final dbPath = p.join(supportDir.path, 'ssq_mobile_app.sqlite');
    final db = await openDatabase(
      dbPath,
      version: 1,
      onCreate: (database, version) async {
        await database.execute('''
          CREATE TABLE draws (
            issue TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            red_json TEXT NOT NULL,
            blue TEXT NOT NULL,
            source TEXT NOT NULL,
            fetched_at TEXT NOT NULL
          )
        ''');
        await database.execute('''
          CREATE TABLE users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            username_norm TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            display_name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            last_login_at TEXT NOT NULL
          )
        ''');
        await database.execute('''
          CREATE TABLE sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            client_type TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            last_seen_at TEXT NOT NULL
          )
        ''');
        await database.execute('''
          CREATE TABLE records (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            type TEXT NOT NULL,
            ticket_key TEXT NOT NULL,
            reds_json TEXT NOT NULL,
            blue TEXT NOT NULL,
            strategy TEXT NOT NULL,
            source_name TEXT NOT NULL,
            source_url TEXT NOT NULL,
            base_issue TEXT NOT NULL,
            base_date TEXT NOT NULL,
            reason TEXT NOT NULL,
            score REAL,
            pinned_at TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
          )
        ''');
        await database.execute('''
          CREATE UNIQUE INDEX records_dedup_idx
          ON records (
            user_id,
            type,
            ticket_key,
            base_issue,
            strategy,
            source_name
          )
        ''');
        await database.execute('''
          CREATE TABLE community_snapshots (
            user_id TEXT PRIMARY KEY,
            payload_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        ''');
      },
    );

    final instance = LocalDatabase._(db);
    await instance._seedSampleDraws(sampleDraws);
    return instance;
  }

  Future<void> close() => _db.close();

  Future<void> _seedSampleDraws(List<Map<String, dynamic>> sampleDraws) async {
    final count = Sqflite.firstIntValue(
          await _db.rawQuery('SELECT COUNT(*) AS total FROM draws'),
        ) ??
        0;
    if (count > 0) return;
    final draws = sampleDraws
        .map(normalizeDraw)
        .whereType<StoredDraw>()
        .toList(growable: false);
    await upsertDraws(draws);
  }

  Future<List<StoredDraw>> readDraws({int limit = 240}) async {
    final rows = await _db.query(
      'draws',
      orderBy: 'CAST(issue AS INTEGER) DESC',
      limit: limit,
    );
    return rows.map(_drawFromRow).toList(growable: false);
  }

  Future<void> upsertDraws(List<StoredDraw> draws) async {
    if (draws.isEmpty) return;
    final batch = _db.batch();
    final now = DateTime.now().toUtc().toIso8601String();
    for (final draw in draws) {
      batch.insert(
        'draws',
        {
          'issue': draw.issue,
          'date': draw.date,
          'red_json': json.encode(draw.red),
          'blue': draw.blue,
          'source': draw.source,
          'fetched_at': now,
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }
    await batch.commit(noResult: true);
  }

  Future<AuthResult> registerUser(
    Map<String, dynamic> payload, {
    String clientType = 'web',
  }) async {
    final username = _requireUsername(payload['username']);
    final password = _requirePassword(payload['password']);
    final usernameNorm = username.toLowerCase();
    final displayName = String(payload['displayName'] ?? '').trim().isEmpty
        ? username
        : String(payload['displayName']).trim();
    final now = DateTime.now().toUtc().toIso8601String();
    final userId = _uuid.v4();

    try {
      await _db.insert(
        'users',
        {
          'id': userId,
          'username': username,
          'username_norm': usernameNorm,
          'password_hash': _hashPassword(password),
          'display_name': displayName,
          'created_at': now,
          'last_login_at': now,
        },
        conflictAlgorithm: ConflictAlgorithm.abort,
      );
    } on DatabaseException catch (error) {
      if ((error.isUniqueConstraintError())) {
        throw AppException(409, 'username already exists');
      }
      rethrow;
    }

    final user = AppUser(
      id: userId,
      username: username,
      displayName: displayName,
      createdAt: now,
      lastLoginAt: now,
    );
    final session = await _createSession(userId, clientType: clientType);
    return AuthResult(
      user: user,
      sessionToken: session.$1,
      expiresAt: session.$2,
    );
  }

  Future<AuthResult> loginUser(
    Map<String, dynamic> payload, {
    String clientType = 'web',
  }) async {
    final usernameNorm = _requireUsername(payload['username']).toLowerCase();
    final password = _requirePassword(payload['password']);
    final rows = await _db.query(
      'users',
      where: 'username_norm = ?',
      whereArgs: [usernameNorm],
      limit: 1,
    );
    if (rows.isEmpty) {
      throw AppException(401, 'invalid username or password');
    }
    final row = rows.first;
    if (!_verifyPassword(password, row['password_hash'] as String)) {
      throw AppException(401, 'invalid username or password');
    }

    final now = DateTime.now().toUtc().toIso8601String();
    await _db.update(
      'users',
      {'last_login_at': now},
      where: 'id = ?',
      whereArgs: [row['id']],
    );
    final user = AppUser(
      id: row['id'] as String,
      username: row['username'] as String,
      displayName: row['display_name'] as String,
      createdAt: row['created_at'] as String,
      lastLoginAt: now,
    );
    final session = await _createSession(user.id, clientType: clientType);
    return AuthResult(
      user: user,
      sessionToken: session.$1,
      expiresAt: session.$2,
    );
  }

  Future<AppUser?> resolveSessionUser(String sessionToken) async {
    if (sessionToken.isEmpty) return null;
    final now = DateTime.now().toUtc();
    final rows = await _db.rawQuery(
      '''
      SELECT
        s.id AS session_id,
        u.id AS user_id,
        u.username,
        u.display_name,
        u.created_at,
        u.last_login_at,
        s.expires_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
      LIMIT 1
      ''',
      [_hashToken(sessionToken)],
    );
    if (rows.isEmpty) return null;
    final row = rows.first;
    final expiresAt = DateTime.tryParse(row['expires_at'] as String)?.toUtc();
    if (expiresAt == null || !expiresAt.isAfter(now)) {
      await revokeSession(sessionToken);
      return null;
    }
    await _db.update(
      'sessions',
      {'last_seen_at': now.toIso8601String()},
      where: 'id = ?',
      whereArgs: [row['session_id']],
    );
    return AppUser(
      id: row['user_id'] as String,
      username: row['username'] as String,
      displayName: row['display_name'] as String,
      createdAt: row['created_at'] as String,
      lastLoginAt: row['last_login_at'] as String,
    );
  }

  Future<int> revokeSession(String sessionToken) async {
    if (sessionToken.isEmpty) return 0;
    return _db.delete(
      'sessions',
      where: 'token_hash = ?',
      whereArgs: [_hashToken(sessionToken)],
    );
  }

  Future<List<StoredRecord>> readRecords(
    String userId, {
    int limit = 3000,
  }) async {
    final rows = await _db.query(
      'records',
      where: 'user_id = ?',
      whereArgs: [userId],
      orderBy: "CASE WHEN pinned_at = '' THEN 1 ELSE 0 END, pinned_at DESC, created_at DESC",
      limit: limit,
    );
    return rows.map(_recordFromRow).toList(growable: false);
  }

  Future<List<StoredRecord>> appendRecords(
    String userId,
    List<Map<String, dynamic>> payloads,
  ) async {
    final records = payloads
        .map((item) => normalizeRecord(item, userId: userId))
        .whereType<StoredRecord>()
        .toList(growable: false);
    if (records.isEmpty) return const [];

    final inserted = <StoredRecord>[];
    final batch = _db.batch();
    for (final record in records) {
      batch.insert(
        'records',
        {
          'id': record.id,
          'user_id': record.userId,
          'type': record.type,
          'ticket_key': record.key,
          'reds_json': json.encode(record.reds),
          'blue': record.blue,
          'strategy': record.strategy,
          'source_name': record.sourceName,
          'source_url': record.sourceUrl,
          'base_issue': record.baseIssue,
          'base_date': record.baseDate,
          'reason': record.reason,
          'score': record.score,
          'pinned_at': record.pinnedAt,
          'created_at': record.createdAt,
        },
        conflictAlgorithm: ConflictAlgorithm.ignore,
      );
    }
    final results = await batch.commit();
    for (var i = 0; i < results.length; i += 1) {
      if ((results[i] as int?) != null) {
        inserted.add(records[i]);
      }
    }
    return inserted;
  }

  Future<int> deleteRecord(String id, String userId) {
    return _db.delete(
      'records',
      where: 'id = ? AND user_id = ?',
      whereArgs: [id, userId],
    );
  }

  Future<Map<String, dynamic>> setRecordPinned(
    String id,
    bool pinned,
    String userId,
  ) async {
    final pinnedAt =
        pinned ? DateTime.now().toUtc().toIso8601String() : '';
    final changed = await _db.update(
      'records',
      {'pinned_at': pinnedAt},
      where: 'id = ? AND user_id = ?',
      whereArgs: [id, userId],
    );
    return {
      'changed': changed,
      'pinnedAt': pinnedAt,
    };
  }

  Future<Map<String, dynamic>?> readCommunitySnapshot(String userId) async {
    final rows = await _db.query(
      'community_snapshots',
      where: 'user_id = ?',
      whereArgs: [userId],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return json.decode(rows.first['payload_json'] as String)
        as Map<String, dynamic>;
  }

  Future<void> upsertCommunitySnapshot(
    String userId,
    Map<String, dynamic> payload,
  ) async {
    await _db.insert(
      'community_snapshots',
      {
        'user_id': userId,
        'payload_json': json.encode(payload),
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  StoredDraw? normalizeDraw(Map<String, dynamic> raw) {
    final reds = _parseBallList(
      raw['red'] ?? raw['redballs'] ?? raw['redBalls'],
      33,
    ).take(6).toList(growable: false);
    final blues = _parseBallList(
      raw['blue'] ?? raw['blueballs'] ?? raw['blueBalls'],
      16,
    );
    final issue = String(raw['code'] ?? raw['issue'] ?? raw['expect'] ?? '');
    final date = String(raw['date'] ?? raw['openTime'] ?? raw['time'] ?? '');
    if (issue.isEmpty || reds.length != 6 || blues.isEmpty) return null;
    return StoredDraw(
      issue: issue,
      date: date,
      red: reds,
      blue: blues.first,
      source: String(raw['source'] ?? 'local'),
    );
  }

  StoredRecord? normalizeRecord(
    Map<String, dynamic> raw, {
    required String userId,
  }) {
    final reds = _parseBallList(
      raw['reds'] ?? raw['red'] ?? raw['redBalls'],
      33,
    ).take(6).toList(growable: false);
    final blues = _parseBallList(raw['blue'] ?? raw['blueBalls'], 16);
    if (reds.length != 6 || blues.isEmpty) return null;

    final type = <String>{'ticket', 'favorite', 'community', 'manual'}
            .contains(raw['type'])
        ? String(raw['type'])
        : 'ticket';
    final createdAt = String(raw['createdAt'] ?? '')
            .trim()
            .isNotEmpty
        ? String(raw['createdAt']).trim()
        : DateTime.now().toUtc().toIso8601String();

    final pinnedAt = String(raw['pinnedAt'] ?? '').trim();
    return StoredRecord(
      id: String(raw['id'] ?? _uuid.v4()),
      userId: userId,
      type: type,
      key: '${reds.join(',')}+${blues.first}',
      reds: reds,
      blue: blues.first,
      strategy: String(raw['strategy'] ?? raw['kind'] ?? ''),
      sourceName: String(raw['sourceName'] ?? ''),
      sourceUrl: String(raw['sourceUrl'] ?? ''),
      baseIssue: String(raw['baseIssue'] ?? ''),
      baseDate: String(raw['baseDate'] ?? ''),
      reason: String(raw['reason'] ?? raw['context'] ?? '').trim().substring(
            0,
            min(240, String(raw['reason'] ?? raw['context'] ?? '').trim().length),
          ),
      score: raw['score'] == null ? null : double.tryParse('${raw['score']}'),
      createdAt: createdAt,
      pinnedAt: pinnedAt,
    );
  }

  StoredDraw _drawFromRow(Map<String, Object?> row) {
    return StoredDraw(
      issue: row['issue'] as String,
      date: row['date'] as String,
      red: List<String>.from(json.decode(row['red_json'] as String) as List),
      blue: row['blue'] as String,
      source: row['source'] as String,
    );
  }

  StoredRecord _recordFromRow(Map<String, Object?> row) {
    return StoredRecord(
      id: row['id'] as String,
      userId: row['user_id'] as String,
      type: row['type'] as String,
      key: row['ticket_key'] as String,
      reds: List<String>.from(json.decode(row['reds_json'] as String) as List),
      blue: row['blue'] as String,
      strategy: row['strategy'] as String,
      sourceName: row['source_name'] as String,
      sourceUrl: row['source_url'] as String,
      baseIssue: row['base_issue'] as String,
      baseDate: row['base_date'] as String,
      reason: row['reason'] as String,
      score: row['score'] == null ? null : (row['score'] as num).toDouble(),
      createdAt: row['created_at'] as String,
      pinnedAt: row['pinned_at'] as String,
    );
  }

  Future<(String, String)> _createSession(
    String userId, {
    required String clientType,
  }) async {
    final token = _randomToken();
    final createdAt = DateTime.now().toUtc();
    final expiresAt = createdAt.add(
      const Duration(days: sessionTtlDays),
    );
    await _db.insert(
      'sessions',
      {
        'id': _uuid.v4(),
        'user_id': userId,
        'token_hash': _hashToken(token),
        'client_type': clientType,
        'created_at': createdAt.toIso8601String(),
        'expires_at': expiresAt.toIso8601String(),
        'last_seen_at': createdAt.toIso8601String(),
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
    return (token, expiresAt.toIso8601String());
  }

  String _requireUsername(Object? raw) {
    final username = String(raw ?? '').trim();
    final re = RegExp(r'^[A-Za-z0-9_-]{3,24}$');
    if (!re.hasMatch(username)) {
      throw AppException(
        400,
        'username must be 3-24 chars using letters, numbers, _ or -',
      );
    }
    return username;
  }

  String _requirePassword(Object? raw) {
    final password = String(raw ?? '');
    if (password.length < 6 || password.length > 72) {
      throw AppException(400, 'password must be 6-72 chars');
    }
    return password;
  }

  String _hashToken(String token) {
    return sha256.convert(utf8.encode(token)).toString();
  }

  String _hashPassword(String password) {
    final salt = _randomToken(length: 16);
    final digest = sha256.convert(utf8.encode('$salt::$password')).toString();
    return 'sha256\$$salt\$$digest';
  }

  bool _verifyPassword(String password, String stored) {
    final parts = stored.split(r'$');
    if (parts.length != 3 || parts.first != 'sha256') return false;
    final salt = parts[1];
    final digest = parts[2];
    return sha256.convert(utf8.encode('$salt::$password')).toString() == digest;
  }

  String _randomToken({int length = 32}) {
    final random = Random.secure();
    const alphabet =
        'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return List.generate(
      length,
      (_) => alphabet[random.nextInt(alphabet.length)],
    ).join();
  }

  List<String> _parseBallList(Object? value, int max) {
    final text = _normalizeDigits(_stringifyValue(value));
    final matches = RegExp(r'\d{1,2}')
        .allMatches(text)
        .map((item) => int.tryParse(item.group(0) ?? ''))
        .whereType<int>()
        .where((item) => item >= 1 && item <= max)
        .map((item) => item.toString().padLeft(2, '0'))
        .toList(growable: false);
    return matches;
  }

  String _stringifyValue(Object? value) {
    if (value is List) return value.join(' ');
    return String(value ?? '');
  }

  String _normalizeDigits(String text) {
    return text.replaceAllMapped(
      RegExp(r'[\uFF10-\uFF19]'),
      (match) => String.fromCharCode(match.group(0)!.codeUnitAt(0) - 0xFF10 + 48),
    );
  }
}

class AppException implements Exception {
  AppException(this.statusCode, this.message);

  final int statusCode;
  final String message;

  @override
  String toString() => message;
}
