import 'dart:math';

import 'package:flutter/material.dart';

import '../models/ssq_models.dart';
import '../runtime/local_database.dart';

class StatusBanner extends StatelessWidget {
  const StatusBanner({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: const Color(0xFFEFF6FF),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFBFDBFE)),
      ),
      child: Text(text, style: const TextStyle(color: Color(0xFF1E3A8A))),
    );
  }
}

class NativeLoadingScreen extends StatelessWidget {
  const NativeLoadingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('正在加载本地数据'),
          ],
        ),
      ),
    );
  }
}

class NativeErrorScreen extends StatelessWidget {
  const NativeErrorScreen({super.key, required this.error, required this.onRetry});

  final String error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 42),
              const SizedBox(height: 12),
              Text('启动失败', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 8),
              SelectableText(error, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton(onPressed: onRetry, child: const Text('重试')),
            ],
          ),
        ),
      ),
    );
  }
}

class SectionCard extends StatelessWidget {
  const SectionCard({super.key, required this.title, required this.child, this.trailing});

  final String title;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: Color(0xFFE2E8F0)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                  ),
                ),
                if (trailing != null) trailing!,
              ],
            ),
            const SizedBox(height: 10),
            child,
          ],
        ),
      ),
    );
  }
}

class LatestDrawCard extends StatelessWidget {
  const LatestDrawCard({super.key, required this.draw});

  final StoredDraw? draw;

  @override
  Widget build(BuildContext context) {
    final latest = draw;
    return Card(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: Color(0xFFE2E8F0)),
      ),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        child: latest == null
            ? const Text('暂无开奖数据')
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Expanded(
                        child: Text('最新开奖', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
                      ),
                      BadgePill(text: latest.issue),
                    ],
                  ),
                  const SizedBox(height: 12),
                  BallRow(reds: latest.red, blue: latest.blue),
                  const SizedBox(height: 10),
                  Text('开奖日期 ${latest.date} · 来源 ${latest.source}', style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
      ),
    );
  }
}

class MetricGrid extends StatelessWidget {
  const MetricGrid({super.key, required this.metrics});

  final List<MetricItem> metrics;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 520 ? 4 : 2;
        return GridView.count(
          crossAxisCount: columns,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          childAspectRatio: columns == 4 ? 1.7 : 1.55,
          children: metrics.map((metric) => MetricBox(metric: metric)).toList(),
        );
      },
    );
  }
}

class MetricBox extends StatelessWidget {
  const MetricBox({super.key, required this.metric});

  final MetricItem metric;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(metric.label, style: Theme.of(context).textTheme.labelSmall),
          const SizedBox(height: 4),
          Text(metric.value, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
          Text(metric.detail, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}

class TicketTile extends StatelessWidget {
  const TicketTile({
    super.key,
    required this.ticket,
    this.onCopy,
    this.onFavorite,
    this.onDelete,
    this.statusText,
  });

  final Ticket ticket;
  final VoidCallback? onCopy;
  final VoidCallback? onFavorite;
  final VoidCallback? onDelete;
  final String? statusText;

  @override
  Widget build(BuildContext context) {
    final reasonText = ticket.baseIssue.isEmpty
        ? ticket.reason
        : '基于 ${ticket.baseIssue} 期 · ${ticket.reason}';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: BallRow(reds: ticket.reds, blue: ticket.blue, small: true)),
              BadgePill(text: '${ticket.score}'),
              if (onCopy != null) ...[
                const SizedBox(width: 2),
                MiniIconButton(tooltip: '复制', icon: Icons.copy_outlined, onPressed: onCopy),
              ],
              if (onFavorite != null) ...[
                const SizedBox(width: 2),
                MiniIconButton(tooltip: '收藏', icon: Icons.bookmark_add_outlined, onPressed: onFavorite),
              ],
              if (onDelete != null) ...[
                const SizedBox(width: 2),
                MiniIconButton(tooltip: '删除', icon: Icons.delete_outline, onPressed: onDelete),
              ],
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              Expanded(
                child: Text(
                  reasonText,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
              if (statusText != null) ...[
                const SizedBox(width: 6),
                BadgePill(text: statusText!),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
class MiniIconButton extends StatelessWidget {
  const MiniIconButton({super.key, required this.tooltip, required this.icon, required this.onPressed});

  final String tooltip;
  final IconData icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox.square(
      dimension: 28,
      child: IconButton.filledTonal(
        tooltip: tooltip,
        onPressed: onPressed,
        padding: EdgeInsets.zero,
        iconSize: 15,
        icon: Icon(icon),
      ),
    );
  }
}

class BallRow extends StatelessWidget {
  const BallRow({super.key, required this.reds, required this.blue, this.small = false});

  final List<String> reds;
  final String blue;
  final bool small;

  @override
  Widget build(BuildContext context) {
    final gap = SizedBox(width: small ? 2.5 : 4);
    final balls = <Widget>[
      for (final red in reds) ...[
        Ball(text: red, color: const Color(0xFFDC2626), small: small),
        gap,
      ],
      Ball(text: blue, color: const Color(0xFF2563EB), small: small),
    ];
    return Align(
      alignment: Alignment.centerLeft,
      child: FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.centerLeft,
        child: Row(mainAxisSize: MainAxisSize.min, children: balls),
      ),
    );
  }
}

class Ball extends StatelessWidget {
  const Ball({super.key, required this.text, required this.color, this.small = false});

  final String text;
  final Color color;
  final bool small;

  @override
  Widget build(BuildContext context) {
    final size = small ? 21.0 : 30.0;
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      child: Text(
        text,
        style: TextStyle(color: Colors.white, fontSize: small ? 9 : 12, fontWeight: FontWeight.w900),
      ),
    );
  }
}

class NumberGrid extends StatelessWidget {
  const NumberGrid({super.key, required this.max, required this.selected, required this.color, required this.onTap});

  final int max;
  final Set<String> selected;
  final Color color;
  final ValueChanged<String> onTap;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: max,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 8,
        mainAxisSpacing: 6,
        crossAxisSpacing: 6,
      ),
      itemBuilder: (context, index) {
        final value = ballLabel(index + 1);
        final active = selected.contains(value);
        return InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: () => onTap(value),
          child: Container(
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: active ? color : Colors.white,
              shape: BoxShape.circle,
              border: Border.all(color: active ? color : const Color(0xFFCBD5E1)),
            ),
            child: Text(
              value,
              style: TextStyle(color: active ? Colors.white : const Color(0xFF111827), fontWeight: FontWeight.w800),
            ),
          ),
        );
      },
    );
  }
}

class FrequencyList extends StatelessWidget {
  const FrequencyList({super.key, required this.rows, required this.color});

  final List<FrequencyRow> rows;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final maxCount = rows.isEmpty ? 1 : rows.map((item) => item.count).reduce(max);
    return Column(
      children: rows.map((row) {
        final width = row.count / maxCount;
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 5),
          child: Row(
            children: [
              Ball(text: row.number, color: color, small: true),
              const SizedBox(width: 8),
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(999),
                  child: LinearProgressIndicator(value: width, minHeight: 8, color: color, backgroundColor: const Color(0xFFE2E8F0)),
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(width: 28, child: Text('${row.count}', textAlign: TextAlign.end)),
            ],
          ),
        );
      }).toList(),
    );
  }
}

class DrawHistoryTile extends StatelessWidget {
  const DrawHistoryTile({super.key, required this.draw});

  final StoredDraw draw;

  @override
  Widget build(BuildContext context) {
    final sum = draw.red.map(int.parse).fold<int>(0, (total, item) => total + item);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          SizedBox(width: 74, child: Text(draw.issue, style: const TextStyle(fontWeight: FontWeight.w700))),
          Expanded(child: BallRow(reds: draw.red, blue: draw.blue, small: true)),
          Text('和值 $sum', style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}

class AdviceRow extends StatelessWidget {
  const AdviceRow({super.key, required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Row(
        children: [
          SizedBox(width: 74, child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700))),
          Expanded(child: Text(value.isEmpty ? '--' : value)),
        ],
      ),
    );
  }
}

class StrategyDropdown extends StatelessWidget {
  const StrategyDropdown({super.key, required this.value, required this.onChanged});

  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return DropdownButton<String>(
      value: value,
      underline: const SizedBox.shrink(),
      items: strategyLabels.entries.map((entry) => DropdownMenuItem(value: entry.key, child: Text(entry.value))).toList(),
      onChanged: (value) {
        if (value != null) onChanged(value);
      },
    );
  }
}

class SubTitle extends StatelessWidget {
  const SubTitle(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(text, style: Theme.of(context).textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w800)),
    );
  }
}

class BadgePill extends StatelessWidget {
  const BadgePill({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Text(text, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
    );
  }
}


