/// The care agent's conversation drawer.
///
/// Mirrors the sdkwork-agents session list surfaces (Flutter
/// `AgentsConversationHistoryScreen` and the H5 `ConversationSessionSheet`):
/// select, rename, pin, batch-delete, and delete, plus a "new conversation"
/// action, loading, empty, and failure states. Every row prints the doctor the
/// conversation belongs to — "AI family doctor" for an AI session, the
/// published name and department for a human doctor — so sessions sharing a
/// title stay distinguishable. The row actions live in a long-press menu
/// instead of per-row icon buttons, and selection is reported through
/// [onSelected] so the shell keeps owning navigation.
library;

import 'package:flutter/material.dart';

import '../models/care_conversation.dart';
import '../state/care_conversations_controller.dart';

/// Localized copy resolver supplied by the surface that owns the catalog.
typedef CareSessionText = String Function(String key,
    {Map<String, String> params});

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

/// One action of the session row's long-press menu.
enum _SessionAction { batch, rename, pin, reply, delete }

/// Session list drawer for the care agent.
class CareSessionsDrawer extends StatefulWidget {
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

  @override
  State<CareSessionsDrawer> createState() => _CareSessionsDrawerState();
}

class _CareSessionsDrawerState extends State<CareSessionsDrawer> {
  /// Multi-select mode entered from the long-press menu's batch action.
  bool _selecting = false;

  /// Ids ticked in [_selecting]; stale ids are ignored when the count is read.
  final Set<String> _selected = <String>{};

  /// Session whose long-press menu is open. Its row keeps the selected
  /// highlight while the menu is up, like the reference surface.
  String? _menuSessionId;

  CareSessionsDrawerStyle get _style => widget.style;

  CareSessionText get _translate => widget.translate;

  CareConversationsController get _controller => widget.controller;

  String _titleOf(CareConversationSession session) => session.hasTitle
      ? session.title
      : _translate('platform.care.sessions.untitled');

  /// Doctor identity printed under the title: the localized AI family-doctor
  /// copy for an AI session, the published human name and department otherwise.
  String _doctorOf(CareConversationSession session) {
    final CareConversationDoctor doctor = session.doctor;
    if (doctor.isAi) {
      return _translate('platform.care.doctors.ai');
    }
    final String name = doctor.displayName.trim();
    if (name.isEmpty) {
      return _translate('platform.care.sessions.untitledDoctor');
    }
    final String department = doctor.department.trim();
    return department.isEmpty ? name : '$name · $department';
  }

  int get _selectedCount =>
      _controller.sessions.where((CareConversationSession session) {
        return _selected.contains(session.id);
      }).length;

  Future<void> _rename(CareConversationSession session) async {
    final String? title = await showDialog<String>(
      context: context,
      builder: (BuildContext dialogContext) => _RenameSessionDialog(
        initialTitle: session.title,
        translate: _translate,
      ),
    );
    if (title != null && title.trim().isNotEmpty) {
      await _controller.rename(session.id, title);
    }
  }

  Future<void> _delete(CareConversationSession session) async {
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        content: Text(_translate('platform.care.sessions.deleteConfirm')),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(_translate('platform.care.action.cancel')),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: _style.danger),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(_translate('platform.care.sessions.delete')),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await _controller.delete(session.id);
    }
  }

  Future<void> _deleteSelected() async {
    final List<String> ids = <String>[
      for (final CareConversationSession session in _controller.sessions)
        if (_selected.contains(session.id)) session.id,
    ];
    if (ids.isEmpty) return;
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        content: Text(
          _translate(
            'platform.care.sessions.deleteBatchConfirm',
            params: <String, String>{'count': '${ids.length}'},
          ),
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(_translate('platform.care.action.cancel')),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: _style.danger),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(_translate('platform.care.sessions.delete')),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    for (final String id in ids) {
      await _controller.delete(id);
    }
    if (!mounted) return;
    _exitSelection();
  }

  /// Long-press menu of one session, anchored where the finger went down.
  Future<void> _openSessionMenu(
    BuildContext context,
    CareConversationSession session,
    Offset globalPosition,
  ) async {
    final RenderBox overlay =
        Overlay.of(context).context.findRenderObject()! as RenderBox;
    final bool pinned = _controller.isPinned(session.id);
    setState(() => _menuSessionId = session.id);
    final _SessionAction? action = await showMenu<_SessionAction>(
      context: context,
      position: RelativeRect.fromRect(
        Rect.fromPoints(globalPosition, globalPosition),
        Offset.zero & overlay.size,
      ),
      color: _style.background,
      elevation: 8,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      items: <PopupMenuEntry<_SessionAction>>[
        _menuItem(
          _SessionAction.batch,
          Icons.checklist_rtl,
          _translate('platform.care.sessions.batch'),
        ),
        const PopupMenuDivider(),
        _menuItem(
          _SessionAction.rename,
          Icons.edit_outlined,
          _translate('platform.care.sessions.rename'),
        ),
        const PopupMenuDivider(),
        _menuItem(
          _SessionAction.pin,
          pinned ? Icons.push_pin : Icons.push_pin_outlined,
          _translate(
            pinned
                ? 'platform.care.sessions.unpin'
                : 'platform.care.sessions.pin',
          ),
        ),
        if (session.isHuman && session.isActive) ...<PopupMenuEntry<_SessionAction>>[
          const PopupMenuDivider(),
          _menuItem(
            _SessionAction.reply,
            Icons.medical_services_outlined,
            _translate('platform.care.sessions.replyAction'),
          ),
        ],
        const PopupMenuDivider(),
        _menuItem(
          _SessionAction.delete,
          Icons.delete_outline,
          _translate('platform.care.sessions.delete'),
          danger: true,
        ),
      ],
    );
    if (!mounted) return;
    setState(() => _menuSessionId = null);
    if (action == null) return;
    switch (action) {
      case _SessionAction.batch:
        setState(() {
          _selecting = true;
          _selected
            ..clear()
            ..add(session.id);
        });
        break;
      case _SessionAction.rename:
        await _rename(session);
        break;
      case _SessionAction.pin:
        await _controller.togglePin(session.id);
        break;
      case _SessionAction.reply:
        await _replyAsDoctor(session);
        break;
      case _SessionAction.delete:
        await _delete(session);
        break;
    }
  }

  /// The doctor takes the device and answers inside the family app. The reply
  /// lands in the same conversation the family reads in 对话.
  Future<void> _replyAsDoctor(CareConversationSession session) async {
    final String? reply = await showDialog<String>(
      context: context,
      builder: (BuildContext dialogContext) => _DoctorReplyDialog(
        doctorName: session.doctor.displayName,
        translate: _translate,
      ),
    );
    if (reply == null || reply.trim().isEmpty) return;
    await _controller.replyAsDoctor(session.id, reply);
  }

  PopupMenuItem<_SessionAction> _menuItem(
    _SessionAction value,
    IconData icon,
    String label, {
    bool danger = false,
  }) {
    final Color color = danger ? _style.danger : _style.ink;
    return PopupMenuItem<_SessionAction>(
      value: value,
      height: 48,
      child: Row(
        children: <Widget>[
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: color,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _toggleSelected(String sessionId) {
    setState(() {
      if (!_selected.remove(sessionId)) {
        _selected.add(sessionId);
      }
    });
  }

  void _selectAll() {
    setState(() {
      _selected
        ..clear()
        ..addAll(_controller.sessions
            .map((CareConversationSession session) => session.id));
    });
  }

  void _clearSelection() {
    setState(_selected.clear);
  }

  void _exitSelection() {
    if (!_selecting && _selected.isEmpty) return;
    setState(() {
      _selecting = false;
      _selected.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    // The reference drawer takes 90% of the screen: the row carries the title,
    // the doctor identity, and the update time, and the wider surface keeps
    // them readable without ellipses.
    final double width = MediaQuery.sizeOf(context).width * 0.9;
    return Drawer(
      width: width,
      backgroundColor: _style.background,
      child: SafeArea(
        child: AnimatedBuilder(
          animation: _controller,
          builder: (BuildContext context, Widget? _) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              _header(),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                child: FilledButton.icon(
                  style:
                      FilledButton.styleFrom(backgroundColor: _style.primary),
                  onPressed: () => _createNew(context),
                  icon: const Icon(Icons.add_comment_outlined, size: 18),
                  label: Text(_translate('platform.care.sessions.new')),
                ),
              ),
              if (_controller.error != null && _controller.sessions.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: Text(
                    _translate(
                      'platform.care.sessions.failed',
                      params: <String, String>{
                        'message': _controller.error!,
                      },
                    ),
                    style: TextStyle(fontSize: 12, color: _style.danger),
                  ),
                ),
              Expanded(child: _body(context)),
              if (_selecting) _selectionBar(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _header() {
    final String modeKey = _controller.mode == 'hosted'
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
              color: _style.primary,
              borderRadius: BorderRadius.circular(12),
            ),
            alignment: Alignment.center,
            child: const Text(
              'D',
              style:
                  TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    Flexible(
                      child: Text(
                        widget.agentName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          color: _style.ink,
                        ),
                      ),
                    ),
                    if (_controller.unreadTotal > 0) ...<Widget>[
                      const SizedBox(width: 8),
                      _UnreadBadge(
                        count: _controller.unreadTotal,
                        danger: _style.danger,
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  _translate(modeKey),
                  style: TextStyle(fontSize: 12, color: _style.muted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _createNew(BuildContext context) async {
    _exitSelection();
    final NavigatorState navigator = Navigator.of(context, rootNavigator: true);
    await _controller.createNew();
    if (navigator.canPop()) {
      navigator.maybePop();
    }
    final CareConversationSession? active = _controller.activeSession;
    if (active != null) {
      widget.onSelected?.call(active);
    }
  }

  Widget _body(BuildContext context) {
    if (_controller.loadingSessions && _controller.sessions.isEmpty) {
      return Center(child: CircularProgressIndicator(color: _style.primary));
    }
    if (_controller.sessions.isEmpty) {
      final String? error = _controller.error;
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            Text(
              error == null
                  ? _translate('platform.care.sessions.empty')
                  : _translate(
                      'platform.care.sessions.failed',
                      params: <String, String>{'message': error},
                    ),
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: _style.muted),
            ),
            if (error != null)
              TextButton(
                onPressed: _controller.load,
                child: Text(_translate('platform.care.sessions.retry')),
              ),
          ],
        ),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(8, 0, 8, 16),
      itemCount: _controller.sessions.length,
      separatorBuilder: (BuildContext context, int index) =>
          const SizedBox(height: 2),
      itemBuilder: (BuildContext context, int index) {
        return _sessionRow(context, _controller.sessions[index]);
      },
    );
  }

  Widget _sessionRow(BuildContext context, CareConversationSession session) {
    final bool active = !_selecting &&
        (session.id == _controller.activeSessionId ||
            session.id == _menuSessionId);
    final bool selected = _selecting && _selected.contains(session.id);
    final bool pinned = _controller.isPinned(session.id);
    final String statusSuffix = !session.isHuman
        ? ''
        : !session.isActive
            ? ' · ${_translate('platform.care.sessions.ended')}'
            : session.awaitingDoctor
                ? ' · ${_translate('platform.care.sessions.waiting')}'
                : ' · ${_translate('platform.care.sessions.replied')}';
    return GestureDetector(
      key: ValueKey<String>('care-session-${session.id}'),
      behavior: HitTestBehavior.opaque,
      onLongPressStart: (LongPressStartDetails details) {
        if (_selecting) {
          _toggleSelected(session.id);
          return;
        }
        _openSessionMenu(context, session, details.globalPosition);
      },
      child: ListTile(
        selected: _selecting ? selected : active,
        selectedTileColor: _style.primarySoft,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
        leading: _selecting
            ? Checkbox(
                value: selected,
                activeColor: _style.primary,
                onChanged: (bool? value) => _toggleSelected(session.id),
              )
            : _SessionDoctorAvatar(doctor: session.doctor, style: _style),
        title: Text(
          _titleOf(session),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 14,
            fontWeight: active ? FontWeight.w600 : FontWeight.w500,
            color: active ? _style.primary : _style.ink,
          ),
        ),
        subtitle: Row(
          children: <Widget>[
            if (pinned) ...<Widget>[
              Icon(Icons.push_pin, size: 12, color: _style.muted),
              const SizedBox(width: 4),
            ],
            Expanded(
              child: Text(
                '${_doctorOf(session)}$statusSuffix',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: session.awaitingDoctor && session.isHuman
                      ? _style.danger
                      : active
                          ? _style.primary
                          : _style.muted,
                ),
              ),
            ),
            const SizedBox(width: 6),
            Text(
              formatCareSessionTime(session.updatedAt),
              style: TextStyle(fontSize: 11, color: _style.muted),
            ),
          ],
        ),
        trailing: session.unreadCount > 0
            ? _UnreadBadge(count: session.unreadCount, danger: _style.danger)
            : null,
        onTap: () {
          if (_selecting) {
            _toggleSelected(session.id);
            return;
          }
          _controller.select(session.id);
          widget.onSelected?.call(session);
          Navigator.of(context, rootNavigator: true).maybePop();
        },
      ),
    );
  }

  Widget _selectionBar() {
    final int count = _selectedCount;
    final bool allSelected =
        _controller.sessions.isNotEmpty && count == _controller.sessions.length;
    return Container(
      decoration: BoxDecoration(
        color: _style.background,
        border: Border(top: BorderSide(color: _style.divider)),
      ),
      child: SafeArea(
        top: false,
        minimum: const EdgeInsets.fromLTRB(12, 6, 4, 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text(
              _translate(
                'platform.care.sessions.selected',
                params: <String, String>{'count': '$count'},
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: _style.ink,
              ),
            ),
            Wrap(
              alignment: WrapAlignment.end,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: <Widget>[
                TextButton(
                  onPressed: allSelected ? _clearSelection : _selectAll,
                  child: Text(
                    _translate(
                      allSelected
                          ? 'platform.care.sessions.clearSelection'
                          : 'platform.care.sessions.selectAll',
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12),
                  ),
                ),
                TextButton(
                  onPressed: count == 0 ? null : _deleteSelected,
                  style: TextButton.styleFrom(foregroundColor: _style.danger),
                  child: Text(
                    _translate('platform.care.sessions.delete'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: _exitSelection,
                  child: Text(
                    _translate('platform.care.action.cancel'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Session-row identity mark: a robot glyph for the AI family doctor, the
/// human doctor's initial otherwise.
///
/// The mark plus the doctor line under the title is what makes two sessions
/// with the same title tell apart at a glance.
class _SessionDoctorAvatar extends StatelessWidget {
  const _SessionDoctorAvatar({required this.doctor, required this.style});

  final CareConversationDoctor doctor;
  final CareSessionsDrawerStyle style;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 38,
      height: 38,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: style.primarySoft,
        shape: BoxShape.circle,
      ),
      child: doctor.isAi
          ? Icon(Icons.smart_toy_outlined, size: 20, color: style.primary)
          : Text(
              _doctorInitial(doctor.displayName),
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: style.primary,
              ),
            ),
    );
  }
}

/// One-character monogram of a doctor's name; `?` when the name is missing.
String _doctorInitial(String displayName) {
  final String text = displayName.trim();
  if (text.isEmpty) return '?';
  return String.fromCharCodes(text.runes.take(1)).toUpperCase();
}

/// Count pill of unread doctor replies on a conversation row.
class _UnreadBadge extends StatelessWidget {
  const _UnreadBadge({required this.count, required this.danger});

  final int count;
  final Color danger;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 20),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: danger,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        count > 99 ? '99+' : '$count',
        textAlign: TextAlign.center,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

/// The doctor's reply composer, opened from a human conversation's row menu.
///
/// The clinician writes on the family's device; the controller stores the reply
/// and the family reads it unread in the conversation list.
class _DoctorReplyDialog extends StatefulWidget {
  const _DoctorReplyDialog({
    required this.doctorName,
    required this.translate,
  });

  final String doctorName;
  final CareSessionText translate;

  @override
  State<_DoctorReplyDialog> createState() => _DoctorReplyDialogState();
}

class _DoctorReplyDialogState extends State<_DoctorReplyDialog> {
  final TextEditingController _editor = TextEditingController();

  @override
  void dispose() {
    _editor.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.translate('platform.care.sessions.replyTitle')),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            widget.translate('platform.care.sessions.replyHint'),
            style: const TextStyle(fontSize: 12),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _editor,
            autofocus: true,
            minLines: 2,
            maxLines: 5,
            decoration: InputDecoration(
              labelText: widget.translate(
                'platform.care.sessions.replyPlaceholder',
              ),
            ),
          ),
        ],
      ),
      actions: <Widget>[
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(widget.translate('platform.care.action.cancel')),
        ),
        FilledButton(
          onPressed: () {
            final String text = _editor.text.trim();
            if (text.isEmpty) return;
            Navigator.of(context).pop(text);
          },
          child: Text(widget.translate('platform.care.sessions.replyAction')),
        ),
      ],
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
