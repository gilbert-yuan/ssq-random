import 'package:flutter/material.dart';

import '../models/ssq_models.dart';
import '../widgets/ssq_widgets.dart';

class PickPage extends StatelessWidget {
  const PickPage({
    super.key,
    required this.lottery,
    required this.strategy,
    required this.manualStrategy,
    required this.tickets,
    required this.manualReds,
    required this.manualBlue,
    required this.manualTicket,
    required this.onStrategyChanged,
    required this.onManualStrategyChanged,
    required this.onGenerate,
    required this.onGenerateCombo,
    required this.onFavorite,
    required this.onFavoriteAll,
    required this.onCopy,
    required this.onCopyAll,
    required this.onToggleRed,
    required this.onToggleBlue,
    required this.onCompleteManual,
    required this.onClearManual,
  });

  final LotterySpec lottery;
  final String strategy;
  final String manualStrategy;
  final List<Ticket> tickets;
  final Set<String> manualReds;
  final String manualBlue;
  final Ticket? manualTicket;
  final ValueChanged<String> onStrategyChanged;
  final ValueChanged<String> onManualStrategyChanged;
  final VoidCallback onGenerate;
  final VoidCallback onGenerateCombo;
  final ValueChanged<Ticket> onFavorite;
  final ValueChanged<List<Ticket>> onFavoriteAll;
  final ValueChanged<Ticket> onCopy;
  final void Function(List<Ticket> tickets, String label) onCopyAll;
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
                      label: const Text('组合'),
                    ),
                  ),
                ],
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
        const SizedBox(height: 10),
        SectionCard(
          title: '自选补全',
          trailing: StrategyDropdown(
              value: manualStrategy, onChanged: onManualStrategyChanged),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SubTitle(lottery.frontName),
              NumberGrid(
                  max: lottery.frontMax,
                  selected: manualReds,
                  color: const Color(0xFFDC2626),
                  onTap: onToggleRed),
              const SizedBox(height: 10),
              SubTitle(lottery.backName),
              NumberGrid(
                  max: lottery.backMax,
                  selected: splitBallText(manualBlue).toSet(),
                  color: const Color(0xFF2563EB),
                  onTap: onToggleBlue),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                      child: FilledButton(
                          onPressed: onCompleteManual,
                          child: const Text('补全'))),
                  const SizedBox(width: 8),
                  Expanded(
                      child: OutlinedButton(
                          onPressed: onClearManual, child: const Text('清空'))),
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
