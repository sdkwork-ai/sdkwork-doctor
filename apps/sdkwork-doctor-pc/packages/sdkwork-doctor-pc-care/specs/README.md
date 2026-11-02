# Component Spec Index

Machine contract: [component.spec.json](component.spec.json).

Owns the three PC care tabs: `chat` (agent conversation), `doctor` (family health record), and `me` (members, privacy, device diagnostics). Chat consumes `AgentConversationPort`; it never constructs an agents transport.
