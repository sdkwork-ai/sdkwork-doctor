// Conversation tab: hosted agent when the host provisions an agents API URL and
// a token, offline triage otherwise. The switcher at the top chooses which
// patient file the conversation is for; every exchange is recorded against the
// active patient. Above the transcript the patient ends the conversation, which
// asks the agent for a 病历 the human doctor can then diagnose. Copy comes from
// the generated care catalog.
const { careText } = require('../../lib/i18n.js');
const { createCareAgent } = require('../../lib/agent.js');
const { createVisitRecord } = require('../../lib/visit-records.js');
const {
  createMedicalRecord,
  createMedicalTranscriptEntry,
} = require('../../lib/medical-records.js');
const { chooseAttachments, formatBytes } = require('../../lib/attachments.js');

function patientLabel(profile) {
  return careText('platform.care.profile.relation.' + profile.relation) + ' · ' + profile.displayName;
}

function mapAttachment(attachment) {
  return {
    id: attachment.id,
    kind: attachment.kind,
    name: attachment.name,
    sizeLabel: formatBytes(attachment.sizeBytes),
    path: attachment.path || '',
    dataUrl: attachment.dataUrl || '',
  };
}

function formatSessionTime(iso) {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return '';
  const two = (part) => String(part).padStart(2, '0');
  const now = new Date();
  const sameDay = value.getFullYear() === now.getFullYear()
    && value.getMonth() === now.getMonth()
    && value.getDate() === now.getDate();
  if (sameDay) return two(value.getHours()) + ':' + two(value.getMinutes());
  return two(value.getMonth() + 1) + '-' + two(value.getDate());
}

function sessionWaiting(session) {
  return session.status === 'active' && String(session.preview || '').indexOf('\u0001p:') === 0;
}

function sessionReplied(session) {
  return session.status === 'active' && String(session.preview || '').indexOf('\u0001d:') === 0;
}

Page({
  data: {
    title: '',
    subtitle: '',
    empty: '',
    modeLabel: '',
    placeholder: '',
    send: '',
    sending: '',
    voiceLabel: '',
    attachLabel: '',
    error: '',
    draft: '',
    busy: false,
    ending: false,
    notice: '',
    messages: [],
    patientTitle: '',
    switchHint: '',
    noPatient: '',
    goProfile: '',
    hasPatient: false,
    patients: [],
    attachments: [],
    sessionTitle: '',
    sessionActive: '',
    sessionMeta: '',
    endLabel: '',
    endingLabel: '',
    endConfirm: '',
    endEmpty: '',
    generated: '',
    generatedHint: '',
    attachmentHint: '',
    removeLabel: '',
    attachImage: '',
    attachVideo: '',
    attachFile: '',
    sessionsTitle: '',
    sessionsSubtitle: '',
    sessionsEmpty: '',
    openSessions: '',
    aiLabel: '',
    aiHint: '',
    modeAiLabel: '',
    humanBadge: '',
    humanName: '',
    humanMeta: '',
    humanStatus: '',
    humanEmpty: '',
    humanPlaceholder: '',
    humanActive: false,
    humanWaiting: false,
    humanEnded: false,
    humanSessions: [],
    unreadTotal: 0,
    activeHumanId: '',
    sheetOpen: false,
    doctorReplyOpen: false,
    doctorReplyDraft: '',
    replyAction: '',
    replyTitle: '',
    replyHint: '',
    replyPlaceholder: '',
    humanPending: '',
    humanEnd: '',
    waitingLabel: '',
    repliedLabel: '',
    endedLabel: '',
  },

  onLoad() {
    const app = getApp();
    this.agent = createCareAgent(app.globalData.careAgentOptions);
    this.store = app.globalData.patients;
    this.medicalRecords = app.globalData.medicalRecords;
    this.careSessions = app.globalData.careSessions;
    this.humanStore = app.globalData.humanConsultations;
    this.member = null;
    this.pending = [];
    this.sessionId = null;
    this.activeHumanId = '';
    this.startedAt = new Date().toISOString();
    this.chatTitle = careText('platform.care.chat.title');
    this.setData({
      title: this.chatTitle,
      empty: careText('platform.care.chat.empty'),
      modeLabel: careText(this.agent.mode === 'hosted' ? 'platform.care.mode.hosted' : 'platform.care.mode.offline'),
      placeholder: careText('platform.care.chat.placeholder'),
      send: careText('platform.care.chat.send'),
      sending: careText('platform.care.chat.sending'),
      voiceLabel: careText('platform.care.chat.voice'),
      attachLabel: careText('platform.care.chat.attach'),
      patientTitle: careText('platform.care.chat.patient'),
      switchHint: careText('platform.care.chat.switchPatient'),
      noPatient: careText('platform.care.chat.noPatient'),
      goProfile: careText('platform.care.nav.me'),
      sessionTitle: careText('platform.care.medical.session'),
      sessionActive: careText('platform.care.medical.sessionActive'),
      sessionMeta: careText('platform.care.medical.sessionMeta', { messages: '0', attachments: '0' }),
      endLabel: careText('platform.care.medical.endAction'),
      endingLabel: careText('platform.care.medical.ending'),
      endConfirm: careText('platform.care.medical.endConfirm'),
      endEmpty: careText('platform.care.medical.endEmpty'),
      generated: careText('platform.care.medical.generated'),
      generatedHint: careText('platform.care.medical.generatedHint'),
      attachmentHint: careText('platform.care.chat.attachmentHint'),
      removeLabel: careText('platform.care.chat.removeAttachment'),
      attachImage: careText('platform.care.medical.attachment.image'),
      attachVideo: careText('platform.care.medical.attachment.video'),
      attachFile: careText('platform.care.medical.attachment.file'),
      sessionsTitle: careText('platform.care.sessions.title'),
      sessionsSubtitle: careText('platform.care.sessions.subtitle'),
      sessionsEmpty: careText('platform.care.sessions.empty'),
      openSessions: careText('platform.care.chat.openSessions'),
      aiLabel: careText('platform.care.doctors.ai'),
      aiHint: careText('platform.care.sessions.subtitle'),
      modeAiLabel: careText(this.agent.mode === 'hosted' ? 'platform.care.mode.hosted' : 'platform.care.mode.offline'),
      humanBadge: careText('platform.care.chat.humanBadge'),
      humanEmpty: careText('platform.care.chat.humanEmpty'),
      humanPlaceholder: careText('platform.care.chat.humanPlaceholder', { doctor: '医生' }),
      replyAction: careText('platform.care.sessions.replyAction'),
      replyTitle: careText('platform.care.sessions.replyTitle'),
      replyHint: careText('platform.care.sessions.replyHint'),
      replyPlaceholder: careText('platform.care.sessions.replyPlaceholder'),
      humanPending: careText('platform.care.chat.humanPending'),
      humanEnd: careText('platform.care.chat.humanEnd'),
      waitingLabel: careText('platform.care.sessions.waiting'),
      repliedLabel: careText('platform.care.sessions.replied'),
      endedLabel: careText('platform.care.sessions.ended'),
    });
    this.renderPatients();
    if (this.store && typeof this.store.subscribe === 'function') {
      this.unsubscribe = this.store.subscribe(() => this.renderPatients());
    }
  },

  onShow() {
    this.renderPatients();
    const app = getApp();
    const openId = app.globalData.openHumanConsultationId;
    if (openId) {
      app.globalData.openHumanConsultationId = '';
      this.activeHumanId = openId;
    }
    this.renderHuman();
  },

  onUnload() {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = null;
  },

  renderPatients() {
    const active = this.store ? this.store.getActive() : null;
    const activeId = active ? active.id : null;
    const profiles = this.store ? this.store.list() : [];
    this.member = active;
    this.setData({
      hasPatient: Boolean(active),
      patients: profiles.map((profile) => ({
        id: profile.id,
        label: patientLabel(profile),
        active: profile.id === activeId,
      })),
      subtitle: active
        ? careText('platform.care.chat.subtitle', { member: patientLabel(active) })
        : '',
    });
  },

  onSelectPatient(event) {
    const id = event && event.currentTarget ? event.currentTarget.dataset.id : '';
    if (!this.store || !id) return;
    this.store.select(id);
    // A human consultation belongs to the patient it was opened for; switching
    // patient returns to the AI family-doctor conversation.
    this.activeHumanId = '';
    this.renderPatients();
    this.renderHuman();
  },

  /**
   * Renders the conversation list and the open human consultation.
   *
   * The human branch owns `messages` while it is open, so the same transcript
   * block renders both the AI and the human conversation. The AI row is the
   * default when no human consultation is selected.
   */
  renderHuman() {
    const store = this.humanStore;
    const sessions = store ? store.list() : [];
    const activeId = this.activeHumanId || '';
    const active = activeId && store ? store.find(activeId) : null;
    const humanActive = Boolean(active && active.status === 'active');
    if (active && store) {
      store.markRead(active.id);
    }
    const humanMessages = active
      ? active.messages.map((message) => ({
        id: message.id,
        role: careText(message.isUser ? 'platform.care.chat.you' : 'platform.care.chat.doctor'),
        text: message.text,
        level: '',
        warn: false,
        attachments: [],
      }))
      : [];
    const rows = sessions.map((session) => ({
      id: session.id,
      title: session.title,
      doctor: session.doctor.displayName
        + (session.doctor.department ? ' · ' + session.doctor.department : ''),
      time: formatSessionTime(session.updatedAt),
      unread: session.unreadCount,
      statusLabel: session.status === 'ended'
        ? this.data.endedLabel
        : sessionWaiting(session)
          ? this.data.waitingLabel
          : sessionReplied(session)
            ? this.data.repliedLabel
            : this.data.waitingLabel,
      active: session.id === activeId,
    }));
    const aiModeLabel = this.agent
      ? careText(this.agent.mode === 'hosted' ? 'platform.care.mode.hosted' : 'platform.care.mode.offline')
      : '';
    this.setData({
      humanSessions: rows,
      unreadTotal: store ? store.unreadTotal() : 0,
      activeHumanId: active ? active.id : '',
      humanName: active ? active.doctor.displayName : '',
      humanMeta: active
        ? [active.doctor.department, active.memberLabel].filter((part) => Boolean(part)).join(' · ')
        : '',
      humanActive,
      humanWaiting: active ? sessionWaiting(active) : false,
      humanEnded: active ? active.status !== 'active' : false,
      humanPlaceholder: active
        ? careText('platform.care.chat.humanPlaceholder', { doctor: active.doctor.displayName })
        : this.data.humanPlaceholder,
      humanStatus: active
        ? active.status !== 'active'
          ? this.data.endedLabel
          : sessionWaiting(active)
            ? this.data.waitingLabel
            : this.data.repliedLabel
        : '',
      messages: active ? humanMessages : (this.agent ? this.mapMessages() : []),
      title: active ? active.doctor.displayName : this.chatTitle,
      subtitle: active
        ? active.memberLabel
        : (this.member
          ? careText('platform.care.chat.subtitle', { member: patientLabel(this.member) })
          : ''),
      modeLabel: active ? careText('platform.care.mode.human') : aiModeLabel,
      sessionMeta: active
        ? careText('platform.care.medical.sessionMeta', {
          messages: String(active.messages.length),
          attachments: '0',
        })
        : this.sessionMeta(),
    });
  },

  onOpenSessions() {
    this.setData({ sheetOpen: true });
  },

  onCloseSessions() {
    this.setData({ sheetOpen: false });
  },

  onSelectHuman(event) {
    const id = event && event.currentTarget ? event.currentTarget.dataset.id : '';
    if (!id) return;
    this.activeHumanId = id;
    this.setData({ sheetOpen: false, doctorReplyOpen: false });
    this.renderHuman();
  },

  onSelectAi() {
    this.activeHumanId = '';
    this.setData({ sheetOpen: false, doctorReplyOpen: false });
    this.renderHuman();
  },

  onEndHuman() {
    if (!this.activeHumanId || !this.humanStore) return;
    wx.showModal({
      title: this.data.humanName || this.data.title,
      content: this.data.humanEnd,
      confirmText: this.data.humanEnd,
      cancelText: careText('platform.care.action.cancel'),
      success: (result) => {
        if (!result.confirm) return;
        this.humanStore.end(this.activeHumanId);
        this.renderHuman();
      },
    });
  },

  onOpenDoctorReply() {
    if (!this.data.humanActive) return;
    this.setData({ doctorReplyOpen: true, doctorReplyDraft: '' });
  },

  onCloseDoctorReply() {
    this.setData({ doctorReplyOpen: false });
  },

  onReplyInput(event) {
    const detail = event && event.detail ? event.detail : {};
    this.setData({ doctorReplyDraft: detail.value || '' });
  },

  onSubmitDoctorReply() {
    const text = String(this.data.doctorReplyDraft || '').trim();
    if (!text || !this.activeHumanId || !this.humanStore) return;
    this.humanStore.appendDoctorReply(this.activeHumanId, text);
    this.setData({ doctorReplyOpen: false, doctorReplyDraft: '' });
    this.renderHuman();
  },

  /** Stops a tap inside the sheet from reaching the backdrop's close handler. */
  noop() {},

  onGoProfile() {
    try {
      wx.switchTab({ url: '/pages/profile/index' });
    } catch (error) {
      // Without a tab bar host the guidance text stays the fallback.
    }
  },

  onInput(event) {
    const detail = event && event.detail ? event.detail : {};
    this.setData({ draft: detail.value || '' });
  },

  sessionMeta() {
    const messages = this.agent ? this.agent.history().length : 0;
    return careText('platform.care.medical.sessionMeta', {
      messages: String(messages),
      attachments: String((this.pending || []).length),
    });
  },

  mapMessages() {
    if (!this.agent) return [];
    return this.agent.history().map((message, index) => ({
      id: 'm' + index,
      role: careText(message.role === 'user' ? 'platform.care.chat.you' : 'platform.care.chat.doctor'),
      text: message.text,
      level: careText('platform.care.level.' + (message.level || 'routine')),
      warn: message.level === 'emergency' || message.level === 'urgent',
      attachments: (message.attachments || []).map(mapAttachment),
    }));
  },

  onAttach() {
    if (!this.member) return;
    chooseAttachments({
      image: this.data.attachImage,
      video: this.data.attachVideo,
      file: this.data.attachFile,
    })
      .then((added) => {
        this.pending = (this.pending || []).concat(added);
        this.setData({
          attachments: this.pending.map(mapAttachment),
          sessionMeta: this.sessionMeta(),
          error: '',
        });
      })
      .catch((error) => {
        const message = String((error && (error.errMsg || error.message)) || error || '');
        if (message.indexOf('cancel') >= 0) return;
        this.setData({ error: careText('platform.care.chat.attachmentFailed', { name: '', message }) });
      });
  },

  onRemoveAttachment(event) {
    const id = event && event.currentTarget ? event.currentTarget.dataset.id : '';
    if (!id) return;
    this.pending = (this.pending || []).filter((attachment) => attachment.id !== id);
    this.setData({ attachments: this.pending.map(mapAttachment), sessionMeta: this.sessionMeta() });
  },

  onOpenAttachment(event) {
    const path = event && event.currentTarget ? event.currentTarget.dataset.path : '';
    if (!path) return;
    try {
      wx.openDocument({ filePath: path, showMenu: true });
    } catch (error) {
      // A file the host cannot preview stays listed by name.
    }
  },

  onSend(event) {
    const detail = event && event.detail ? event.detail : {};
    const text = String(detail.text || this.data.draft || '').trim();
    const member = this.member;
    const pending = this.pending || [];
    if (!member || (!text && pending.length === 0) || this.data.busy || this.data.ending) return;
    // A human consultation has no app-side assistant: the turn is stored for
    // the doctor, who replies from the same conversation on this device.
    if (this.activeHumanId && this.humanStore) {
      if (!text) return;
      this.humanStore.appendPatientMessage(this.activeHumanId, text);
      this.pending = [];
      this.setData({
        draft: '',
        attachments: [],
        error: '',
        notice: this.data.humanPending,
      });
      this.renderHuman();
      return;
    }
    this.setData({ busy: true, error: '', notice: '' });
    this.agent
      .send(text, member, pending)
      .then((reply) => {
        const store = getApp().globalData.records;
        if (store) {
          store.add(createVisitRecord({
            member: member,
            symptom: text || pending.map((attachment) => attachment.name).join(', '),
            advice: reply.text,
            level: reply.level,
            mode: this.agent.mode,
          }));
        }
        // One 看病记录 per visit: the typed turn joins the open session.
        if (this.careSessions) {
          const session = this.careSessions.ensureActive({
            member: member,
            mode: this.agent.mode,
            sessionId: this.agent.sessionId() || undefined,
          });
          this.sessionId = session.id;
          this.careSessions.appendMessage(session.id, {
            role: 'patient',
            text: text || pending.map((attachment) => attachment.name).join(', '),
            at: new Date().toISOString(),
            channel: 'text',
            level: reply.level,
            attachmentIds: pending.map((attachment) => attachment.id),
          });
          this.careSessions.appendMessage(session.id, {
            role: 'assistant',
            text: reply.text,
            at: new Date().toISOString(),
            channel: 'text',
          });
        }
        this.pending = [];
        this.setData({
          draft: '',
          messages: this.mapMessages(),
          attachments: [],
          sessionMeta: this.sessionMeta(),
          busy: false,
        });
      })
      .catch((error) => {
        this.setData({
          busy: false,
          error: careText('platform.care.chat.error', { message: (error && error.message) || String(error) }),
        });
      });
  },

  onEndConversation() {
    if (!this.member || this.data.busy || this.data.ending) return;
    if (!this.agent || this.agent.history().length === 0) {
      this.setData({ error: this.data.endEmpty });
      return;
    }
    wx.showModal({
      title: this.data.sessionTitle,
      content: this.data.endConfirm,
      confirmText: this.data.endLabel,
      cancelText: careText('platform.care.action.cancel'),
      success: (result) => {
        if (result.confirm) this.generateMedicalRecord();
      },
    });
  },

  generateMedicalRecord() {
    const member = this.member;
    if (!member || !this.agent || this.data.ending) return;
    const history = this.agent.history();
    const endedAt = new Date().toISOString();
    const seen = {};
    const attachments = [];
    history.forEach((message) => {
      (message.attachments || []).forEach((attachment) => {
        if (seen[attachment.id]) return;
        seen[attachment.id] = true;
        attachments.push(attachment);
      });
    });
    (this.pending || []).forEach((attachment) => {
      if (seen[attachment.id]) return;
      seen[attachment.id] = true;
      attachments.push(attachment);
    });
    const transcript = history.map((message) => (message.role === 'user' ? 'user' : 'assistant'));
    const open = this.careSessions
      ? (this.careSessions.findActive(member.id)
        || (this.sessionId ? this.careSessions.find(this.sessionId) : null))
      : null;
    const startedAt = open ? open.startedAt : this.startedAt;
    const summaryRequest = {
      member: member,
      transcript: history.map((message, index) => ({
        role: transcript[index],
        text: message.text || (message.attachments || []).map((attachment) => attachment.name).join(', '),
      })),
      attachments: attachments.map((attachment) => ({ name: attachment.name, kind: attachment.kind })),
      startedAt: startedAt,
      endedAt: endedAt,
    };
    this.setData({ ending: true, error: '', notice: '' });
    this.agent
      .summarize(summaryRequest)
      .then((draft) => {
        const record = createMedicalRecord({
          member: member,
          mode: this.agent.mode,
          sessionId: (open && open.id) || this.agent.sessionId() || undefined,
          startedAt: startedAt,
          endedAt: endedAt,
          summary: draft.summary,
          attachments: attachments,
          transcript: history.map((message, index) => createMedicalTranscriptEntry({
            role: transcript[index] === 'user' ? 'patient' : 'assistant',
            text: message.text,
            at: new Date().toISOString(),
            level: message.level,
            attachmentIds: (message.attachments || []).map((attachment) => attachment.id),
          })),
          diagnosis: {
            impression: draft.diagnosis.impression,
            conditions: draft.diagnosis.conditions,
            recommendations: draft.diagnosis.recommendations,
            level: draft.diagnosis.level,
            notes: draft.diagnosis.notes,
          },
        });
        const store = getApp().globalData.medicalRecords;
        if (store) store.add(record);
        if (open && this.careSessions) {
          this.careSessions.end(open.id, { medicalRecordId: record.id, endedAt: endedAt });
        }
        this.agent.reset();
        this.pending = [];
        this.sessionId = null;
        this.startedAt = new Date().toISOString();
        this.setData({
          ending: false,
          messages: [],
          attachments: [],
          draft: '',
          notice: this.data.generated + ' ' + this.data.generatedHint,
          sessionMeta: this.sessionMeta(),
        });
      })
      .catch((error) => {
        this.setData({
          ending: false,
          error: careText('platform.care.medical.failed', {
            message: (error && error.message) || String(error),
          }),
        });
      });
  },
});
