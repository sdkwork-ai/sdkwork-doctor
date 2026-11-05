import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';

import './support/ts-resolve.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const sessionFile = path.join(
  repoRoot,
  'apps/sdkwork-doctor-h5/packages/sdkwork-doctor-h5-care/src/call-session.ts',
);
const { CareCallSession } = await import(
  new URL('file:///' + sessionFile.replaceAll('\\', '/')).href
);

const flush = async (rounds = 8) => {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  }
};

function createRecognizer({ initialize = true, listen = true } = {}) {
  const state = {
    initialized: false,
    listening: false,
    handlers: null,
    cancelled: 0,
    stops: 0,
    disposed: false,
  };
  const recognizer = {
    state,
    async initialize() {
      state.initialized = true;
      return initialize;
    },
    async listen(handlers) {
      state.handlers = handlers;
      state.listening = true;
      return listen;
    },
    async stop() {
      state.stops += 1;
      state.listening = false;
    },
    async cancel() {
      state.cancelled += 1;
      state.listening = false;
      state.handlers = null;
    },
    async dispose() {
      state.disposed = true;
    },
    emitInterim(text) {
      state.handlers?.onResult({ text, isFinal: false });
    },
    emitFinal(text) {
      state.handlers?.onResult({ text, isFinal: true });
    },
    emitError(code) {
      state.handlers?.onError(code);
    },
    emitDone() {
      state.handlers?.onDone();
    },
  };
  return recognizer;
}

function createSynthesizer({ available = true } = {}) {
  const state = { spoken: [], stopped: 0, settling: null, available };
  const synthesizer = {
    state,
    async initialize() {
      return available;
    },
    speak(text) {
      state.spoken.push(text);
      return new Promise((resolve) => { state.settling = resolve; });
    },
    async stop() {
      state.stopped += 1;
      const settle = state.settling;
      state.settling = null;
      settle?.();
    },
    async dispose() {
      // Nothing held by the fake.
    },
    finish() {
      const settle = state.settling;
      state.settling = null;
      settle?.();
    },
  };
  return synthesizer;
}

function createCamera({ open = true } = {}) {
  const state = { opened: 0, closed: 0, flipped: 0 };
  return {
    state,
    async open() {
      state.opened += 1;
      return open;
    },
    async flip() {
      state.flipped += 1;
    },
    async close() {
      state.closed += 1;
    },
  };
}

function createSession({
  greeting = '我在，说说哪里不舒服。',
  sendTurn = async () => ({ reply: '多喝水，观察一天。', error: null }),
  recognizer = createRecognizer(),
  synthesizer = createSynthesizer(),
  camera = createCamera(),
} = {}) {
  const session = new CareCallSession({
    locale: 'zh-CN',
    recognizer,
    synthesizer,
    camera,
    greeting,
    resumeDelayMs: 0,
    sendTurn,
  });
  return { session, recognizer, synthesizer, camera };
}

test('a call opens with the greeting, then listens', async () => {
  const { session, recognizer, synthesizer } = createSession();
  const started = session.start();
  await flush();
  assert.equal(session.snapshot().phase, 'speaking');
  assert.deepEqual(synthesizer.state.spoken, ['我在，说说哪里不舒服。']);

  synthesizer.finish();
  await started;
  assert.equal(session.snapshot().phase, 'listening');
  assert.equal(session.snapshot().transcript, '');
  assert.equal(recognizer.state.listening, true);
});

test('a final transcript becomes a turn, the answer is spoken, and listening resumes', async () => {
  const asked = [];
  const { session, recognizer, synthesizer } = createSession({
    sendTurn: async (text) => {
      asked.push(text);
      return { reply: '多喝水，观察一天。', error: null };
    },
  });
  const started = session.start();
  await flush();
  synthesizer.finish();
  await started;

  recognizer.emitFinal('  头痛两天  ');
  await flush();
  assert.deepEqual(asked, ['头痛两天']);
  assert.equal(session.snapshot().phase, 'speaking');
  assert.equal(session.snapshot().replyText, '多喝水，观察一天。');
  assert.deepEqual(synthesizer.state.spoken, ['我在，说说哪里不舒服。', '多喝水，观察一天。']);

  synthesizer.finish();
  await flush();
  assert.equal(session.snapshot().phase, 'listening');
  assert.equal(session.snapshot().transcript, '');
});

test('an interim transcript is shown while the patient speaks', async () => {
  const { session, recognizer, synthesizer } = createSession();
  const started = session.start();
  await flush();
  synthesizer.finish();
  await started;

  recognizer.emitInterim('头');
  assert.equal(session.snapshot().transcript, '头');
  recognizer.emitInterim('头痛');
  assert.equal(session.snapshot().transcript, '头痛');
  assert.equal(session.snapshot().phase, 'listening');
});

test('a failed turn keeps the call alive with the failure notice', async () => {
  const { session, recognizer, synthesizer } = createSession({
    sendTurn: async () => ({ reply: null, error: '网络中断' }),
  });
  const started = session.start();
  await flush();
  synthesizer.finish();
  await started;

  recognizer.emitFinal('头痛');
  await flush();
  assert.deepEqual(session.snapshot().notice, {
    key: 'platform.care.call.failed',
    params: { message: '网络中断' },
  });
  assert.equal(session.snapshot().phase, 'listening');
  assert.equal(session.snapshot().micEnabled, true);
});

test('an empty answer falls back to the "did not catch that" notice', async () => {
  const { session, recognizer, synthesizer } = createSession({
    sendTurn: async () => ({ reply: '   ', error: null }),
  });
  const started = session.start();
  await flush();
  synthesizer.finish();
  await started;

  recognizer.emitFinal('头痛');
  await flush();
  assert.deepEqual(session.snapshot().notice, { key: 'platform.care.call.missed' });
});

test('a recognizer error resumes listening, and a permission error ends the call', async () => {
  const { session, recognizer, synthesizer } = createSession();
  const started = session.start();
  await flush();
  synthesizer.finish();
  await started;

  recognizer.emitError('no-speech');
  await flush();
  assert.deepEqual(session.snapshot().notice, { key: 'platform.care.call.missed' });
  assert.equal(session.snapshot().phase, 'listening');

  recognizer.emitError('permission');
  await flush();
  assert.equal(session.snapshot().phase, 'unavailable');
  assert.deepEqual(session.snapshot().notice, { key: 'platform.care.call.unavailable' });
});

test('muting the microphone cancels the session and reopening it listens again', async () => {
  const { session, recognizer, synthesizer } = createSession();
  const started = session.start();
  await flush();
  synthesizer.finish();
  await started;

  const cancelled = recognizer.state.cancelled;
  await session.toggleMic();
  assert.equal(session.snapshot().micEnabled, false);
  assert.equal(session.snapshot().transcript, '');
  assert.ok(recognizer.state.cancelled > cancelled);
  assert.equal(recognizer.state.listening, false);

  await session.toggleMic();
  assert.equal(session.snapshot().micEnabled, true);
  assert.equal(recognizer.state.listening, true);
});

test('interrupting the answer stops speech and reopens the microphone', async () => {
  const { session, recognizer, synthesizer } = createSession();
  const started = session.start();
  await flush();
  synthesizer.finish();
  await started;

  recognizer.emitFinal('头痛');
  await flush();
  assert.equal(session.snapshot().phase, 'speaking');
  const stopped = synthesizer.state.stopped;

  await session.interrupt();
  assert.ok(synthesizer.state.stopped > stopped);
  assert.equal(session.snapshot().phase, 'listening');
  assert.equal(recognizer.state.listening, true);
});

test('video mode opens the camera and a denied camera keeps the call in voice mode', async () => {
  const denied = createCamera({ open: false });
  const first = createSession({ camera: denied });
  const started = first.session.start(true);
  await flush();
  assert.equal(denied.state.opened, 1);
  assert.equal(first.session.snapshot().videoEnabled, false);
  assert.deepEqual(first.session.snapshot().notice, { key: 'platform.care.call.cameraDenied' });
  first.synthesizer.finish();
  await started;

  const granted = createCamera();
  const second = createSession({ camera: granted });
  await second.session.toggleCamera();
  assert.equal(second.session.snapshot().videoEnabled, true);
  assert.equal(granted.state.opened, 1);
  await second.session.flipCamera();
  assert.equal(granted.state.flipped, 1);
  await second.session.toggleCamera();
  assert.equal(second.session.snapshot().videoEnabled, false);
  assert.ok(granted.state.closed >= 1);
});

test('hanging up ends the call and releases every port', async () => {
  const { session, recognizer, synthesizer, camera } = createSession();
  const started = session.start();
  await flush();
  synthesizer.finish();
  await started;

  await session.hangUp();
  assert.equal(session.snapshot().phase, 'ended');
  assert.equal(recognizer.state.cancelled, 1);
  assert.ok(synthesizer.state.stopped >= 1);
  assert.ok(camera.state.closed >= 1);
});

test('an unavailable recognizer stops the call before it starts', async () => {
  const { session, synthesizer } = createSession({
    recognizer: createRecognizer({ initialize: false }),
  });
  await session.start();
  assert.equal(session.snapshot().phase, 'unavailable');
  assert.deepEqual(session.snapshot().notice, { key: 'platform.care.call.unavailable' });
  assert.deepEqual(synthesizer.state.spoken, [], 'no greeting is spoken on an unusable device');
});

test('a disposed session stops calling back into the UI', async () => {
  const { session, recognizer, synthesizer } = createSession();
  const started = session.start();
  await flush();
  synthesizer.finish();
  await started;

  let notifications = 0;
  session.subscribe(() => { notifications += 1; });
  session.dispose();
  recognizer.emitFinal('头痛');
  await flush();
  assert.equal(notifications, 0);
  assert.equal(recognizer.state.disposed, true);
});
