import 'package:flutter/material.dart';

import '../models/ssq_models.dart';
import '../runtime/local_database.dart';
import '../widgets/ssq_widgets.dart';

class AnalysisPage extends StatelessWidget {
  const AnalysisPage({
    super.key,
    required this.lottery,
    required this.analysis,
    required this.draws,
  });

  final LotterySpec lottery;
  final AnalysisSnapshot analysis;
  final List<StoredDraw> draws;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        SectionCard(
          title: '分析指标',
          child: MetricGrid(metrics: analysis.metrics),
        ),
        const SizedBox(height: 10),
        SectionCard(
          title: '近期开奖记录',
          child: Column(
            children: draws
                .take(12)
                .map((draw) => DrawHistoryTile(draw: draw))
                .toList(),
          ),
        ),
      ],
    );
  }
}
