import 'package:flutter/material.dart';

import '../models/ssq_models.dart';
import '../runtime/local_database.dart';
import '../widgets/ssq_widgets.dart';

class OverviewPage extends StatelessWidget {
  const OverviewPage({
    super.key,
    required this.latest,
    required this.analysis,
    required this.tickets,
    required this.onFavorite,
    required this.onCopy,
    required this.onRegenerate,
  });

  final StoredDraw? latest;
  final AnalysisSnapshot analysis;
  final List<Ticket> tickets;
  final ValueChanged<Ticket> onFavorite;
  final ValueChanged<Ticket> onCopy;
  final VoidCallback onRegenerate;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        LatestDrawCard(draw: latest),
        const SizedBox(height: 10),
        SectionCard(
          title: '本期速览',
          trailing: Text('${analysis.count} 期样本'),
          child: MetricGrid(metrics: analysis.metrics),
        ),
        const SizedBox(height: 10),
        SectionCard(
          title: '趋势建议',
          trailing: FilledButton.tonalIcon(
            onPressed: onRegenerate,
            icon: const Icon(Icons.refresh),
            label: const Text('换一组'),
          ),
          child: Column(
            children: [
              AdviceRow(label: '热号关注', value: analysis.hotReds.take(6).join(' ')),
              AdviceRow(label: '冷号观察', value: analysis.coldReds.take(6).join(' ')),
              AdviceRow(label: '蓝球重点', value: analysis.hotBlues.take(4).join(' ')),
            ],
          ),
        ),
        const SizedBox(height: 10),
        SectionCard(
          title: '建议号',
          child: Column(
            children: tickets.take(3).map((ticket) {
              return TicketTile(
                ticket: ticket,
                onCopy: () => onCopy(ticket),
                onFavorite: () => onFavorite(ticket),
              );
            }).toList(),
          ),
        ),
      ],
    );
  }
}
