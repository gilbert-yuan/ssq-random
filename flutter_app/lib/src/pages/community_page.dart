import 'package:flutter/material.dart';

import '../models/community_models.dart';
import '../models/ssq_models.dart';
import '../widgets/ssq_widgets.dart';

class CommunityPage extends StatelessWidget {
  const CommunityPage({
    super.key,
    required this.sources,
    required this.tickets,
    required this.loading,
    required this.error,
    required this.updatedAt,
    required this.failedSources,
    required this.onRefresh,
    required this.onCopy,
    required this.onFavorite,
  });

  final List<CommunitySource> sources;
  final List<Ticket> tickets;
  final bool loading;
  final String? error;
  final DateTime? updatedAt;
  final List<String> failedSources;
  final VoidCallback onRefresh;
  final ValueChanged<Ticket> onCopy;
  final ValueChanged<Ticket> onFavorite;

  @override
  Widget build(BuildContext context) {
    final updatedText = updatedAt == null
        ? '未刷新'
        : '${updatedAt!.month.toString().padLeft(2, '0')}-${updatedAt!.day.toString().padLeft(2, '0')} '
            '${updatedAt!.hour.toString().padLeft(2, '0')}:${updatedAt!.minute.toString().padLeft(2, '0')}';
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        SectionCard(
          title: '社区共振',
          trailing: FilledButton.tonalIcon(
            onPressed: loading ? null : onRefresh,
            icon: loading
                ? const SizedBox.square(
                    dimension: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.sync),
            label: Text(loading ? '刷新中' : '刷新'),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  BadgePill(text: '${sources.length} 个来源'),
                  BadgePill(text: '${tickets.length} 组号码'),
                  BadgePill(text: updatedText),
                ],
              ),
              if (error != null) ...[
                const SizedBox(height: 10),
                Text(error!, style: const TextStyle(color: Color(0xFFB91C1C))),
              ],
              if (failedSources.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(
                  failedSources.take(2).join('\n'),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 10),
        SectionCard(
          title: '共振号码',
          child: Column(
            children: [
              if (loading && tickets.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (tickets.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(child: Text('暂无社区共振结果')),
                )
              else
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
