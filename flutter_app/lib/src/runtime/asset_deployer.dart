import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/services.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

class AssetDeployer {
  static const String _assetPrefix = 'assets/web/';

  static Future<Directory> deployWebAssets() async {
    final supportDir = await getApplicationSupportDirectory();
    final targetDir = Directory(p.join(supportDir.path, 'embedded_web'));
    await targetDir.create(recursive: true);

    final manifestRaw = await rootBundle.loadString('AssetManifest.json');
    final manifest = json.decode(manifestRaw) as Map<String, dynamic>;
    final webAssets = manifest.keys
        .where((key) => key.startsWith(_assetPrefix))
        .toList()
      ..sort();

    for (final assetKey in webAssets) {
      final bytes = await _loadAssetBytes(assetKey);
      final relativePath = assetKey.substring(_assetPrefix.length);
      final file = File(p.join(targetDir.path, relativePath));
      await file.parent.create(recursive: true);
      await file.writeAsBytes(bytes, flush: true);
    }

    return targetDir;
  }

  static Future<Uint8List> _loadAssetBytes(String key) async {
    final data = await rootBundle.load(key);
    return data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
  }
}
