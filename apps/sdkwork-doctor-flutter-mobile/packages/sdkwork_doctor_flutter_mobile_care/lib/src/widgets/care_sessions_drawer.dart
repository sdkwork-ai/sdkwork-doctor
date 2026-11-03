/// The care agent's conversation drawer.
///
/// Mirrors the sdkwork-agents session list surfaces (Flutter
/// `AgentsConversationHistoryScreen` and the H5 `ConversationSessionSheet`):
/// select, rename, and delete, plus a "new conversation" action, loading,
/// empty, and failure states. Selection is reported through [onSelected] so the
/// shell keeps owning navigation.
library;

import 'package:flutter/material.dart';

import '../models/care_conversation.dart';
import '../state/care_conversations_controller.dart';

/// Localized copy resolver supplied by the surface that owns the catalog.
typedef CareSessionText = String Function(String key, {Map<String, String> params});

/// Design tokens of the drawer, injected so the package never forks the app's
/// token contract.
class CareSessionsDrawerStyle {
  const CareSessionsDrawerStyle({
    required this.background,
    required this.primary,
    required this.primarySoft,
    required this.ink,
    required this.muted,
    required this.danger,
    required this.divider,
  });

  final Color background;
  final Color primary;
  final Color primarySoft;
  final Color ink;
  final Color muted;
  final Color danger;
  final Color divider;
}

/// `HH:mm` for a session updated today, `MM-DD` otherwise.
String formatCareSessionTime(DateTime at, {DateTime? now}) {
  final DateTime local = at.toLocal();
  final DateTime reference = (now ?? DateTime.now()).toLocal();
  String two(int value) => value.toString().padLeft(2, '0');
  final bool sameDay = local.year == reference.year &&
      local.month == reference.month &&
      local.day == reference.day;
  if (sameDay) {
    return '${two(local.hour)}:${two(local.minute)}';
  }
  return '${two(local.month)}-${two(local.day)}';
}

/// Session list drawer for the care agent.
class CareSessionsDrawer extends StatelessWidget {
  const CareSessionsDrawer({
    super.key,
    required this.controller,
    required this.translate,
    required this.style,
    this.agentName = 'SDKWork Doctor',
    this.onSelected,
  });

  final CareConversationsController controller;
  final CareSessionText translate;
  final CareSessionsDrawerStyle style;
  final String agentName;

  /// Notified after a session becomes active, so the shell can close the drawer
  /// and switch to the conversation surface.
  final ValueChanged<CareConversationSession>? onSelected;

  String _titleOf(CareConversationSession session) => session.hasTitle
      ? session.title
      : translate('platform.care.sessions.untitled');

  Future<void> _rename(BuildContext context, CareConversationSession session) async {
    final String? title = await showDialog<String>(
      context: context,
      builder: (BuildContext dialogContext) => _RenameSessionDialog(
        initialTitle: session.title,
        translate: translate,
      ),
    );
    if (title != null && title.trim().isNotEmpty) {
      await controller.rename(session.id, title);
    }
  }

  Future<void> _delete(BuildContext context, CareConversationSession session) async {
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        content: Text(translate('platform.care.sessions.deleteConfirm')),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(translate('platform.care.action.cancel')),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: style.danger),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(translate('platform.care.sessions.delete')),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await controller.delete(session.id);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Drawer(
      backgroundColor: style.background,
      child: SafeArea(
        child: AnimatedBuilder(
          animation: controller,
          builder: (BuildContext context, Widget? _) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              _header(),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(backgroundColor: style.primary),
                  onPressed: () => _createNew(context),
                  icon: const Icon(Icons.add_comment_outlined, size: 18),
                  label: Text(translate('platform.care.sessions.new')),
                ),
              ),
              if (controller.error != null && controller.sessions.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: Text(
                    translate(
                      'platform.care.sessions.failed',
                      params: <String, String>{'message': controller.error!},
                    ),
                    style: TextStyle(fontSize: 12, color: style.danger),
                  ),
                ),
              Expanded(child: _body(context)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _header() {
    final String modeKey = controller.mode == 'hosted'
        ? 'platform.care.mode.hosted'
        : 'platform.care.mode.offline';
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
      child: Row(
        children: <Widget>[
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: style.primary,
              borderRadius: BorderRadius.circular(12),
            ),
            alignment: Alignment.center,
            child: const Text(
              'D',
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  agentName,
                  style: TextStyle(fontWeight: FontWeight.w600, color: style.ink),
                ),
                const SizedBox(height: 2),
                Text(
                  translate(modeKey),
                  style: TextStyle(fontSize: 12, color: style.muted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _createNew(BuildContext context) async {
    final NavigatorState navigator = Navigator.of(context, rootNavigator: true);
    await controller.createNew();
    if (navigator.canPop()) {
      navigator.maybePop();
    }
    final CareConversationSession? active = controller.activeSession;
    if (active != null) {
      onSelected?.call(active);
    }
  }

  Widget _body(BuildContext context) {
    if (controller.loadingSessions && controller.sessions.isEmpty) {
      return Center(child: CircularProgressIndicator(color: style.primary));
    }
    if (controller.sessions.isEmpty) {
      final String? error = controller.error;
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            Text(
              error == null
                  ? translate('platform.care.sessions.empty')
                  : translate(
                      'platform.care.sessions.failed',
                      params: <String, String>{'message': error},
                    ),
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: style.muted),
            ),
            if (error != null)
              TextButton(
                onPressed: controller.load,
                child: Text(translate('platform.care.sessions.retry')),
              ),
          ],
        ),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(8, 0, 8, 16),
      itemCount: controller.sessions.length,
      separatorBuilder: (BuildContext context, int index) => const SizedBox(height: 2),
      itemBuilder: (BuildContext context, int index) {
        final CareConversationSession session = controller.sessions[index];
        final bool active = session.id == controller.activeSessionId;
        return ListTile(
          selected: active,
          selectedTileColor: style.primarySoft,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
          title: Text(
            _titleOf(session),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 14,
              fontWeight: active ? FontWeight.w600 : FontWeight.w500,
              color: active ? style.primary : style.ink,
            ),
          ),
          subtitle: Text(
            formatCareSessionTime(session.updatedAt),
            style: TextStyle(fontSize: 11, color: style.muted),
          ),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              IconButton(
                tooltip: translate('platform.care.sessions.rename'),
                visualDensity: VisualDensity.compact,
                icon: Icon(Icons.edit_outlined, size: 18, color: style.muted),
                onPressed: () => _rename(context, session),
              ),
              IconButton(
                tooltip: translate('platform.care.sessions.delete'),
                visualDensity: VisualDensity.compact,
                icon: Icon(Icons.delete_outline, size: 18, color: style.danger),
                onPressed: () => _delete(context, session),
              ),
            ],
          ),
          onTap: () {
            controller.select(session.id);
            onSelected?.call(session);
            Navigator.of(context, rootNavigator: true).maybePop();
          },
        );
      },
    );
  }
}

/// Rename dialog that owns its editing controller.
///
/// The controller must outlive the dialog route's closing animation, so it is
/// owned by a widget that is disposed with the route rather than by the caller.
class _RenameSessionDialog extends StatefulWidget {
  const _RenameSessionDialog({
    required this.initialTitle,
    required this.translate,
  });

  final String initialTitle;
  final CareSessionText translate;

  @override
  State<_RenameSessionDialog> createState() => _RenameSessionDialogState();
}

class _RenameSessionDialogState extends State<_RenameSessionDialog> {
  // Select the whole title so typing replaces it instead of appending.
  late final TextEditingController _editor =
      TextEditingController(text: widget.initialTitle)
        ..selection = TextSelection(
          baseOffset: 0,
          extentOffset: widget.initialTitle.length,
        );

  @override
  void dispose() {
    _editor.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.translate('platform.care.sessions.renameTitle')),
      content: TextField(controller: _editor, autofocus: true),
      actions: <Widget>[
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(widget.translate('platform.care.action.cancel')),
        ),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(_editor.text),
          child: Text(widget.translate('platform.care.action.confirm')),
        ),
      ],
    );
  }
}
