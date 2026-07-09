# Flutter native app

This folder contains the native Flutter implementation of the SSQ mobile experience. The app is built with declarative Flutter widgets and Dart state logic; it does not package or render the web UI.

## Run

```powershell
cd .\flutter_app
flutter pub get
flutter run
```

## Architecture

- `lib/src/app_shell.dart`: Material app, screens, native widgets, setState state flow, number generation and analysis UI.
- `lib/src/runtime/local_database.dart`: SQLite models, local draw cache, records, and account persistence helpers.
- `lib/src/runtime/app_runtime.dart`: native data bootstrap helper for bundled sample draws.
- `assets/bootstrap/`: bundled JSON data used to seed the local database.

The Flutter app intentionally avoids WebView, HTML rendering, JavaScript injection, and web bridge plugins.
