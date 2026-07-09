import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ssq_mobile_app/src/app_shell.dart';

void main() {
  test('app shell can be constructed', () {
    const app = SsqMobileApp();

    expect(app, isA<StatelessWidget>());
  });
}
