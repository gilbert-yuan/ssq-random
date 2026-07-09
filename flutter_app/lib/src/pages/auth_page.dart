import 'package:flutter/material.dart';

class AuthPage extends StatefulWidget {
  const AuthPage({
    super.key,
    required this.loading,
    required this.error,
    required this.onLogin,
    required this.onRegister,
  });

  final bool loading;
  final String? error;
  final Future<void> Function(String username, String password) onLogin;
  final Future<void> Function(String username, String password, String displayName) onRegister;

  @override
  State<AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends State<AuthPage> {
  final _usernameController = TextEditingController(text: 'demo');
  final _passwordController = TextEditingController(text: '123456');
  final _displayNameController = TextEditingController(text: '本机用户');
  bool _registerMode = false;
  bool _obscure = true;

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    _displayNameController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final username = _usernameController.text.trim();
    final password = _passwordController.text;
    final displayName = _displayNameController.text.trim();
    if (_registerMode) {
      await widget.onRegister(username, password, displayName);
    } else {
      await widget.onLogin(username, password);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('双色球助手')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(18),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: Card(
                elevation: 0,
                color: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: const BorderSide(color: Color(0xFFE2E8F0)),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        _registerMode ? '注册本机账户' : '登录本机账户',
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
                      ),
                      const SizedBox(height: 14),
                      SegmentedButton<bool>(
                        segments: const [
                          ButtonSegment(value: false, label: Text('登录'), icon: Icon(Icons.login)),
                          ButtonSegment(value: true, label: Text('注册'), icon: Icon(Icons.person_add_outlined)),
                        ],
                        selected: {_registerMode},
                        onSelectionChanged: widget.loading
                            ? null
                            : (value) => setState(() => _registerMode = value.first),
                      ),
                      const SizedBox(height: 14),
                      TextField(
                        controller: _usernameController,
                        enabled: !widget.loading,
                        textInputAction: TextInputAction.next,
                        decoration: const InputDecoration(
                          labelText: '用户名',
                          prefixIcon: Icon(Icons.person_outline),
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _passwordController,
                        enabled: !widget.loading,
                        obscureText: _obscure,
                        textInputAction: _registerMode ? TextInputAction.next : TextInputAction.done,
                        onSubmitted: (_) => widget.loading ? null : _submit(),
                        decoration: InputDecoration(
                          labelText: '密码',
                          prefixIcon: const Icon(Icons.lock_outline),
                          suffixIcon: IconButton(
                            tooltip: _obscure ? '显示密码' : '隐藏密码',
                            onPressed: () => setState(() => _obscure = !_obscure),
                            icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                          ),
                          border: const OutlineInputBorder(),
                        ),
                      ),
                      if (_registerMode) ...[
                        const SizedBox(height: 10),
                        TextField(
                          controller: _displayNameController,
                          enabled: !widget.loading,
                          textInputAction: TextInputAction.done,
                          onSubmitted: (_) => widget.loading ? null : _submit(),
                          decoration: const InputDecoration(
                            labelText: '昵称',
                            prefixIcon: Icon(Icons.badge_outlined),
                            border: OutlineInputBorder(),
                          ),
                        ),
                      ],
                      if (widget.error != null) ...[
                        const SizedBox(height: 10),
                        Text(widget.error!, style: const TextStyle(color: Color(0xFFB91C1C))),
                      ],
                      const SizedBox(height: 14),
                      FilledButton.icon(
                        onPressed: widget.loading ? null : _submit,
                        icon: widget.loading
                            ? const SizedBox.square(
                                dimension: 18,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : Icon(_registerMode ? Icons.person_add_outlined : Icons.login),
                        label: Text(widget.loading ? '处理中' : (_registerMode ? '注册并登录' : '登录')),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '用户名 3-24 位，可用字母、数字、_ 或 -；密码至少 6 位。收藏和中奖统计会保存在本机 SQLite。',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
