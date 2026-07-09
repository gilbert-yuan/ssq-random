import 'package:flutter/material.dart';

import '../models/ssq_models.dart';
import '../runtime/local_database.dart';
import '../widgets/ssq_widgets.dart';

class AnalysisPage extends StatelessWidget {
  const AnalysisPage({super.key, required this.analysis, required this.draws});

  final AnalysisSnapshot analysis;
  final List<StoredDraw> draws;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        SectionCard(
          title: '红球热度',
          child: FrequencyList(rows: analysis.redFrequency.take(12).toList(), color: const Color(0xFFDC2626)),
        ),
        const SizedBox(height: 10),
        SectionCard(
          title: '蓝球热度',
          child: FrequencyList(rows: analysis.blueFrequency.take(8).toList(), color: const Color(0xFF2563EB)),
        ),
        const SizedBox(height: 10),
        SectionCard(
          title: '近期形态',
          child: Column(children: draws.take(12).map((draw) => DrawHistoryTile(draw: draw)).toList()),
        ),
      ],
    );
  }
}
