import 'package:flutter/material.dart';

import '../models/ssq_models.dart';
import '../widgets/ssq_widgets.dart';

class PickPage extends StatelessWidget {
  const PickPage({
    super.key,
    required this.lottery,
    required this.strategy,
    required this.coverageTicketCount,
    required this.tickets,
    required this.onStrategyChanged,
    required this.onGenerate,
    required this.onCoverageCountChanged,
    required this.onGenerateCombo,
    required this.onFavorite,
    required this.onFavoriteAll,
    required this.onCopy,
    required this.onCopyAll,
  });

  final LotterySpec lottery;
  final String strategy;
  final int coverageTicketCount;
  final List<Ticket> tickets;
  final ValueChanged<String> onStrategyChanged;
  final VoidCallback onGenerate;
  final ValueChanged<int> onCoverageCountChanged;
  final VoidCallback onGenerateCombo;
  final ValueChanged<Ticket> onFavorite;
  final ValueChanged<List<Ticket>> onFavoriteAll;
  final ValueChanged<Ticket> onCopy;
  final void Function(List<Ticket> tickets, String label) onCopyAll;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        SectionCard(
          title: '一键建议号',
          trailing:
              StrategyDropdown(value: strategy, onChanged: onStrategyChanged),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: onGenerate,
                      icon: const Icon(Icons.casino_outlined),
                      label: const Text('生成'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton.tonalIcon(
                      onPressed: onGenerateCombo,
                      icon: const Icon(Icons.auto_awesome),
                      label: const Text('覆盖优选'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Align(
                alignment: Alignment.centerLeft,
                child: Text('覆盖预算',
                    style: Theme.of(context).textTheme.labelLarge),
              ),
              const SizedBox(height: 6),
              SegmentedButton<int>(
                segments: const [
                  ButtonSegment(value: 6, label: Text('6 注')),
                  ButtonSegment(value: 10, label: Text('10 注')),
                  ButtonSegment(value: 20, label: Text('20 注')),
                ],
                selected: {coverageTicketCount},
                showSelectedIcon: false,
                onSelectionChanged: (values) =>
                    onCoverageCountChanged(values.first),
              ),
              const SizedBox(height: 6),
              Align(
                alignment: Alignment.centerLeft,
                child: Text('预计 ${coverageTicketCount * 2} 元 · 按批次降低红蓝球重复',
                    style: Theme.of(context).textTheme.bodySmall),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => onCopyAll(tickets, '建议号'),
                      icon: const Icon(Icons.copy_all_outlined),
                      label: const Text('复制全部'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => onFavoriteAll(tickets),
                      icon: const Icon(Icons.bookmark_add_outlined),
                      label: const Text('收藏全部'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              ...tickets.map(
                (ticket) => TicketTile(
                  ticket: ticket,
                  onCopy: () => onCopy(ticket),
                  onFavorite: () => onFavorite(ticket),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
