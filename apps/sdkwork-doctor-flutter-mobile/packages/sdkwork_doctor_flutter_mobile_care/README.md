# sdkwork_doctor_flutter_mobile_care

Doctor care capability package: the family-doctor conversation sessions.

## What it owns

| Layer | File |
| --- | --- |
| Models | `lib/src/models/care_conversation.dart` |
| Service port | `lib/src/services/care_conversation_service.dart` |
| sdkwork-agents transport | `lib/src/services/agents_care_conversation_service.dart` |
| On-device transport | `lib/src/services/local_care_conversation_service.dart` |
| Presentation state | `lib/src/state/care_conversations_controller.dart` |
| Conversation drawer | `lib/src/widgets/care_sessions_drawer.dart` |
| Idempotency fingerprint | `lib/src/sdk/care_fingerprint.dart` |

## Boundaries

- The package never constructs an SDK client. The application bootstrap builds
  `SdkworkAppClient` from `sdkwork_agents_app_sdk` and injects it through
  `AgentsCareConversationService` (`FLUTTER_APP_MOBILE_ARCHITECTURE_SPEC.md` §6).
- No raw HTTP, no manual auth headers, no copied DTOs: every hosted call is a
  generated SDK operation under `client.ai` (sessions, session items, turns).
- Triage stays in the application (`lib/triage.dart`); the on-device transport
  receives the responder and the reply policy as callbacks.
- Copy comes from the owning surface through `CareSessionText`; the package
  ships no locale catalog of its own.
- Design tokens arrive as `CareSessionsDrawerStyle`; the package never forks
  `specs/design-tokens.contract.json`.

## Verification

```bash
flutter test
flutter analyze
```
