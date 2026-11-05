/// SDKWork Doctor care capability package.
///
/// Owns the agent conversation surface shared by the Doctor Flutter root: the
/// session service port, the generated-SDK transport for `/app/v3/api`, the
/// on-device fallback, the list/transcript controller, and the conversation
/// drawer.
///
/// Authority: `FLUTTER_APP_MOBILE_ARCHITECTURE_SPEC.md`,
/// `APP_FLUTTER_UI_SPEC.md`, `APP_SDK_INTEGRATION_SPEC.md`.
library;

export 'src/models/care_conversation.dart';
export 'src/sdk/care_fingerprint.dart';
export 'src/services/agents_care_conversation_service.dart';
export 'src/services/care_conversation_service.dart';
export 'src/services/local_care_conversation_service.dart';
export 'src/state/care_conversations_controller.dart';
export 'src/state/care_human_consultations.dart';
export 'src/state/care_session_pins.dart';
export 'src/widgets/care_sessions_drawer.dart';
