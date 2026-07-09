import 'dart:convert';

import 'package:flutter/services.dart';

import 'local_database.dart';

class AppRuntime {
  AppRuntime._({required this.database});

  final LocalDatabase database;

  static Future<AppRuntime> bootstrap() async {
    final samplePayload = json.decode(
      await rootBundle.loadString('assets/bootstrap/ssq-sample.json'),
    ) as Map<String, dynamic>;
    final sampleDraws = List<Map<String, dynamic>>.from(
      samplePayload['draws'] as List? ?? const [],
    );
    return AppRuntime._(
      database: await LocalDatabase.open(sampleDraws: sampleDraws),
    );
  }

  Future<void> dispose() => database.close();
}
