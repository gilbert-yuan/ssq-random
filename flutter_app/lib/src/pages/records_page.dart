import 'package:flutter/material.dart';

import '../models/ssq_models.dart';
import '../runtime/local_database.dart';
import '../widgets/ssq_widgets.dart';

class RecordsPage extends StatelessWidget {
  const RecordsPage({
    super.key,
    required this.lottery,
    required this.favorites,
    required this.draws,
    required this.selectedIssue,
    required this.currentIssue,
    required this.onIssueChanged,
    required this.onCopy,
    required this.onCopyAll,
    required this.onRemove,
    required this.onClearIssue,
  });

  final LotterySpec lottery;
  final List<Ticket> favorites;
  final List<StoredDraw> draws;
  final String selectedIssue;
  final String currentIssue;
  final ValueChanged<String> onIssueChanged;
  final ValueChanged<Ticket> onCopy;
  final void Function(List<Ticket> tickets, String label) onCopyAll;
  final ValueChanged<Ticket> onRemove;
  final ValueChanged<String> onClearIssue;

  @override
  Widget build(BuildContext context) {
    final issueSet = favorites
        .map((ticket) => ticket.baseIssue.isEmpty ? '未分期' : ticket.baseIssue)
        .toSet();
    final hasCurrentIssueFavorites = currentIssue.isNotEmpty &&
        favorites.any((ticket) => ticket.baseIssue == currentIssue);
    if (currentIssue.isNotEmpty) issueSet.add(currentIssue);
    final issues = issueSet.toList()..sort((a, b) => b.compareTo(a));
    final options = [...issues, '全部'];
    final defaultIssue = hasCurrentIssueFavorites ? currentIssue : '全部';
    final activeIssue =
        selectedIssue.isNotEmpty && options.contains(selectedIssue)
            ? selectedIssue
            : defaultIssue;
    final visible = activeIssue == '全部'
        ? favorites
        : favorites.where((ticket) {
            final issue = ticket.baseIssue.isEmpty ? '未分期' : ticket.baseIssue;
            return issue == activeIssue;
          }).toList(growable: false);
    final summary = FavoriteStats.fromTickets(favorites, draws);
    final visibleSummary = FavoriteStats.fromTickets(visible, draws);
    final strategyGroups = <String, List<Ticket>>{};
    for (final ticket in favorites) {
      strategyGroups.putIfAbsent(ticket.strategy, () => []).add(ticket);
    }
    final activeLabel = activeIssue == currentIssue && currentIssue.isNotEmpty
        ? '当前期'
        : '第 $activeIssue 期';

    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        SectionCard(
          title: '${lottery.shortName}收藏统计',
          trailing: Text(activeIssue == '全部' ? '全部期号' : activeLabel),
          child: MetricGrid(
            metrics: [
              MetricItem(
                  '总收藏', '${summary.total}', '当前显示 ${visibleSummary.total} 注'),
              MetricItem('已核对', '${summary.checkedCount}',
                  '待开奖 ${summary.total - summary.checkedCount} 注'),
              MetricItem('中奖个数', '${summary.winningCount}',
                  '当前 ${visibleSummary.winningCount} 注'),
              MetricItem('中奖总额', formatYuan(summary.totalAmount),
                  '当前 ${formatYuan(visibleSummary.totalAmount)}'),
            ],
          ),
        ),
        const SizedBox(height: 10),
        SectionCard(
          title: '个人策略统计',
          child: strategyGroups.isEmpty
              ? const Text('收藏号码后会在开奖核对后展示策略结果。')
              : Column(
                  children: strategyGroups.entries.map((entry) {
                    final checked = entry.value
                        .map((ticket) =>
                            checkTicketPrize(ticket, draws, spec: lottery))
                        .whereType<PrizeCheck>()
                        .toList(growable: false);
                    final wins = checked.where((prize) => prize.won).length;
                    final averageRed = checked.isEmpty
                        ? '待开奖'
                        : (checked.fold<int>(0,
                                      (sum, prize) => sum + prize.redHits) /
                                  checked.length)
                            .toStringAsFixed(2);
                    return ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      title: Text(strategyLabels[entry.key] ?? entry.key),
                      subtitle: Text(
                          '${entry.value.length} 注 · 已核对 ${checked.length} 注 · 中奖 $wins 注'),
                      trailing: Text('均红 $averageRed'),
                    );
                  }).toList(growable: false),
                ),
        ),
        const SizedBox(height: 10),
        SectionCard(
          title: '${lottery.shortName}收藏记录',
          trailing: Text('${visible.length}/${favorites.length} 注'),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF8FAFC),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFFE2E8F0)),
                      ),
                      child: DropdownButton<String>(
                        value: activeIssue,
                        isExpanded: true,
                        underline: const SizedBox.shrink(),
                        items: options
                            .map((issue) => DropdownMenuItem(
                                  value: issue,
                                  child: Text(_issueLabel(issue)),
                                ))
                            .toList(),
                        onChanged: (value) {
                          if (value != null) onIssueChanged(value);
                        },
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: visible.isEmpty
                          ? null
                          : () => onCopyAll(visible, '收藏'),
                      icon: const Icon(Icons.copy_all_outlined),
                      label: const Text('复制当前'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: visible.isEmpty || activeIssue == '全部'
                          ? null
                          : () => onClearIssue(activeIssue),
                      icon: const Icon(Icons.delete_sweep_outlined),
                      label: const Text('清空当前期'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              if (favorites.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(child: Text('暂无收藏号码')),
                )
              else if (visible.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 24),
                  child: Center(
                      child: Text(activeIssue == '全部' ? '暂无收藏号码' : '当前期暂无收藏')),
                )
              else
                ...visible.map((ticket) {
                  final prize = checkTicketPrize(ticket, draws, spec: lottery);
                  final status = prize == null
                      ? '待开奖'
                      : '${prize.level} ${prize.hitText} ${formatYuan(prize.amount)}';
                  return TicketTile(
                    ticket: ticket,
                    statusText: status,
                    onCopy: () => onCopy(ticket),
                    onDelete: () => onRemove(ticket),
                  );
                }),
            ],
          ),
        ),
      ],
    );
  }

  String _issueLabel(String issue) {
    if (issue == '全部') return '全部期号';
    if (issue == currentIssue && currentIssue.isNotEmpty) return '当前期 $issue';
    return '基于第 $issue 期';
  }
}
