import 'package:flutter/material.dart';

import '../models/ssq_models.dart';
import '../runtime/local_database.dart';
import '../widgets/ssq_widgets.dart';

class OverviewPage extends StatelessWidget {
  const OverviewPage({
    super.key,
    required this.lottery,
    required this.latest,
    required this.analysis,
    required this.tickets,
    required this.onLotteryChanged,
    required this.onFavorite,
    required this.onCopy,
    required this.onRegenerate,
  });

  final LotterySpec lottery;
  final StoredDraw? latest;
  final AnalysisSnapshot analysis;
  final List<Ticket> tickets;
  final ValueChanged<String> onLotteryChanged;
  final ValueChanged<Ticket> onFavorite;
  final ValueChanged<Ticket> onCopy;
  final VoidCallback onRegenerate;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        SectionCard(
          title: '彩种切换',
          trailing: BadgePill(text: lottery.rangeText),
          child: SegmentedButton<String>(
            segments: lotterySpecs.values
                .map((spec) =>
                    ButtonSegment(value: spec.key, label: Text(spec.shortName)))
                .toList(growable: false),
            selected: {lottery.key},
            onSelectionChanged: (values) => onLotteryChanged(values.first),
          ),
        ),
        const SizedBox(height: 10),
        LatestDrawCard(draw: latest, lottery: lottery),
        const SizedBox(height: 10),
        SectionCard(
          title: '${lottery.shortName}速览',
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
              AdviceRow(
                  label: '${lottery.frontName}热号',
                  value: analysis.hotReds.take(lottery.frontCount).join(' ')),
              AdviceRow(
                  label: '${lottery.frontName}冷号',
                  value: analysis.coldReds.take(lottery.frontCount).join(' ')),
              AdviceRow(
                  label: '${lottery.backName}重点',
                  value: analysis.hotBlues
                      .take(
                          lottery.backCount + 2 > 4 ? lottery.backCount + 2 : 4)
                      .join(' ')),
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
