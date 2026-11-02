# Application Guidelines - SDKWork Doctor Flutter Mobile

## SDKWORK Soul

Read `../../../sdkwork-specs/SOUL.md`.

## SDKWORK Standards

`../../../sdkwork-specs/README.md`. Flutter root rules: `FLUTTER_APP_MOBILE_ARCHITECTURE_SPEC.md` and `APP_FLUTTER_UI_SPEC.md`.

## Application Identity

Repository manifest `../../agent.app.config.json`. This root owns the Flutter mobile surface with three tabs: chat, doctor, me.

## Build, Test, and Verification

`flutter pub get`, `flutter analyze`, `flutter test`.

## Agent Execution Rules

Business logic stays in Dart packages or lib modules; widgets never own transport clients.
