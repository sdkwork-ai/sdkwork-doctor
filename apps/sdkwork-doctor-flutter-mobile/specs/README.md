# Flutter Spec Index

Four tabs: chat, doctor, records, me, matching PC/H5/mini program route identity. Triage mirrors the shared TypeScript contract; the agent SDK binds through a swap seam in a later round.

Voice-call mode (`lib/care/voice/`, `lib/ui/care_call_screen.dart`) is the fourth navbar action, left of the "+" on the chat surface. It opens a full-screen call that speaks the family-doctor conversation through typed platform ports: on-device speech recognition, text-to-speech, and a camera preview. Every spoken turn goes through `lib/care/care_exchange.dart`, so it produces the same transcript entry and 看病记录 row as a typed turn.

Platform permissions are declared in `android/app/src/main/AndroidManifest.xml` (`RECORD_AUDIO`, `CAMERA`) and requested at call time only; both hardware features are marked not required, so the app installs on devices without a microphone or camera. A device without a usable recognizer renders the unavailable state instead of a control that cannot listen.
