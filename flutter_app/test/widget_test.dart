import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ssq_mobile_app/src/app_shell.dart';
import 'package:ssq_mobile_app/src/models/ssq_models.dart';
import 'package:ssq_mobile_app/src/pages/records_page.dart';

void main() {
  test('app shell can be constructed', () {
    const app = SsqMobileApp();

    expect(app, isA<StatelessWidget>());
  });

  testWidgets('favorites fall back to all issues when the current issue is empty',
      (tester) async {
    final favorite = Ticket(
      reds: const ['01', '06', '11', '18', '25', '32'],
      blue: '09',
      strategy: 'balanced',
      score: 80,
      reason: 'test',
      baseIssue: '2026001',
    );

    await tester.pumpWidget(MaterialApp(
      home: RecordsPage(
        lottery: lotterySpecOf('ssq'),
        favorites: [favorite],
        draws: const [],
        selectedIssue: '',
        currentIssue: '2026002',
        onIssueChanged: (_) {},
        onCopy: (_) {},
        onCopyAll: (_, __) {},
        onRemove: (_) {},
        onClearIssue: (_) {},
      ),
    ));

    expect(find.text('全部期号'), findsWidgets);
    expect(find.text('当前期暂无收藏'), findsNothing);
  });
}
