# Flutter app shell

This folder contains a Flutter shell that embeds the existing mobile web page,
runs a local HTTP API inside the app, and stores app data in SQLite.

## Current state

The source code for the Flutter layer is checked in, but the host machine that
prepared it did not have a Flutter SDK installed. Because of that, the
generated `android/` and `ios/` folders are not included yet.

## Bootstrap once Flutter is installed

1. Install Flutter and make sure `flutter --version` works.
2. From the repository root run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap_flutter_app.ps1
```

3. Then launch the app:

```powershell
cd .\flutter_app
flutter run
```

## Architecture

- `assets/web/`: a copy of the existing `public/` mobile site assets
- `lib/src/runtime/asset_deployer.dart`: copies bundled web assets to a local
  runtime directory that `shelf` can serve
- `lib/src/runtime/local_database.dart`: SQLite models and persistence
- `lib/src/runtime/embedded_server.dart`: local API + static hosting
- `lib/src/runtime/app_runtime.dart`: bootstraps assets, database, and server

