import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'runtime/app_runtime.dart';

class SsqMobileApp extends StatelessWidget {
  const SsqMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SSQ Mobile App',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFD13F34),
          surface: const Color(0xFFF8F1E3),
        ),
        scaffoldBackgroundColor: const Color(0xFFF8F1E3),
        useMaterial3: true,
      ),
      home: const _RuntimeScreen(),
    );
  }
}

class _RuntimeScreen extends StatefulWidget {
  const _RuntimeScreen();

  @override
  State<_RuntimeScreen> createState() => _RuntimeScreenState();
}

class _RuntimeScreenState extends State<_RuntimeScreen> {
  late final Future<AppRuntime> _runtimeFuture;
  AppRuntime? _runtime;

  @override
  void initState() {
    super.initState();
    _runtimeFuture = AppRuntime.bootstrap().then((runtime) {
      _runtime = runtime;
      return runtime;
    });
  }

  @override
  void dispose() {
    final runtime = _runtime;
    if (runtime != null) {
      runtime.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<AppRuntime>(
      future: _runtimeFuture,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return _ErrorScreen(error: snapshot.error);
        }
        if (!snapshot.hasData) {
          return const _LoadingScreen();
        }
        return _EmbeddedWebView(runtime: snapshot.data!);
      },
    );
  }
}

class _LoadingScreen extends StatelessWidget {
  const _LoadingScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 18),
            Text('Starting embedded app runtime...'),
          ],
        ),
      ),
    );
  }
}

class _ErrorScreen extends StatelessWidget {
  const _ErrorScreen({required this.error});

  final Object? error;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Embedded app failed to start',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 12),
                SelectableText('$error'),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _EmbeddedWebView extends StatefulWidget {
  const _EmbeddedWebView({required this.runtime});

  final AppRuntime runtime;

  @override
  State<_EmbeddedWebView> createState() => _EmbeddedWebViewState();
}

class _EmbeddedWebViewState extends State<_EmbeddedWebView> {
  late final WebViewController _controller;

  bool _isLocal(Uri? uri) {
    if (uri == null) return false;
    if (uri.host == '127.0.0.1' || uri.host == 'localhost') return true;
    return uri.scheme == 'about';
  }

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFFF8F1E3))
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (request) {
            final uri = Uri.tryParse(request.url);
            return _isLocal(uri)
                ? NavigationDecision.navigate
                : NavigationDecision.prevent;
          },
        ),
      )
      ..loadRequest(widget.runtime.entryUri);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: WebViewWidget(controller: _controller),
      ),
    );
  }
}

