import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';

import 'asset_deployer.dart';
import 'embedded_server.dart';
import 'local_database.dart';

class AppRuntime {
  AppRuntime._({
    required this.assetRoot,
    required this.database,
    required this.server,
  });

  final Directory assetRoot;
  final LocalDatabase database;
  final EmbeddedServer server;

  Uri get entryUri => server.baseUri.replace(
        path: '/mobile.html',
        queryParameters: const {'embedded': '1'},
      );

  static Future<AppRuntime> bootstrap() async {
    final assetRoot = await AssetDeployer.deployWebAssets();
    final samplePayload = json.decode(
      await rootBundle.loadString('assets/bootstrap/ssq-sample.json'),
    ) as Map<String, dynamic>;
    final sampleDraws = List<Map<String, dynamic>>.from(
      samplePayload['draws'] as List? ?? const [],
    );
    final defaultSources = List<Map<String, dynamic>>.from(
      json.decode(
        await rootBundle.loadString('assets/bootstrap/community-sources.json'),
      ) as List,
    );

    final database = await LocalDatabase.open(sampleDraws: sampleDraws);
    final server = EmbeddedServer(
      assetRoot: assetRoot,
      database: database,
      defaultSources: defaultSources,
    );
    await server.start();

    return AppRuntime._(
      assetRoot: assetRoot,
      database: database,
      server: server,
    );
  }

  Future<void> dispose() async {
    await server.stop();
    await database.close();
  }
}
