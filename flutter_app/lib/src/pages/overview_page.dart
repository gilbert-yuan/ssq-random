import 'package:flutter/material.dart';

import '../models/ssq_models.dart';
import '../widgets/ssq_widgets.dart';

class OverviewPage extends StatelessWidget {
  const OverviewPage({
    super.key,
    required this.lottery,
    required this.manualStrategy,
    required this.manualReds,
    required this.manualBlue,
    required this.manualTicket,
    required this.onLotteryChanged,
    required this.onManualStrategyChanged,
    required this.onFavorite,
    required this.onCopy,
    required this.onToggleRed,
    required this.onToggleBlue,
    required this.onCompleteManual,
    required this.onClearManual,
  });

  final LotterySpec lottery;
  final String manualStrategy;
  final Set<String> manualReds;
  final String manualBlue;
  final Ticket? manualTicket;
  final ValueChanged<String> onLotteryChanged;
  final ValueChanged<String> onManualStrategyChanged;
  final ValueChanged<Ticket> onFavorite;
  final ValueChanged<Ticket> onCopy;
  final ValueChanged<String> onToggleRed;
  final ValueChanged<String> onToggleBlue;
  final VoidCallback onCompleteManual;
  final VoidCallback onClearManual;

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
        SectionCard(
          title: '自主选号',
          trailing: StrategyDropdown(
            value: manualStrategy,
            onChanged: onManualStrategyChanged,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SubTitle(lottery.frontName),
              NumberGrid(
                max: lottery.frontMax,
                selected: manualReds,
                color: const Color(0xFFDC2626),
                onTap: onToggleRed,
              ),
              const SizedBox(height: 10),
              SubTitle(lottery.backName),
              NumberGrid(
                max: lottery.backMax,
                selected: splitBallText(manualBlue).toSet(),
                color: const Color(0xFF2563EB),
                onTap: onToggleBlue,
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: FilledButton(
                      onPressed: onCompleteManual,
                      child: const Text('补全号码'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: onClearManual,
                      child: const Text('清空选择'),
                    ),
                  ),
                ],
              ),
              if (manualTicket != null) ...[
                const SizedBox(height: 8),
                TicketTile(
                  ticket: manualTicket!,
                  onCopy: () => onCopy(manualTicket!),
                  onFavorite: () => onFavorite(manualTicket!),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
