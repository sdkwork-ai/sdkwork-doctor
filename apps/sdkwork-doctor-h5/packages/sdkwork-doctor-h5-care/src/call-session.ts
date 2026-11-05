/**
 * Presentation state of one family-doctor call: listen, ask the doctor, speak.
 *
 * The session owns turn ordering only. Speech recognition, speech synthesis,
 * and the camera sit behind typed ports, and the answer comes from the injected
 * `sendTurn` callback — the same care exchange the chat page uses. That keeps
 * the call testable without a browser, and keeps the UI free of platform APIs.
 *
 * Mirrors the Flutter `CareVoiceCallController` so the two mobile surfaces run
 * the same state machine.
 */

export type CareCallPhase =
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'ended'
  | 'unavailable';

/** A localized message the page resolves through i18n. */
export interface CareCallNotice {
  readonly key: string;
  readonly params?: Readonly<Record<string, string>>;
}

export interface CareSpeechResult {
  readonly text: string;
  readonly isFinal: boolean;
}

export interface CareSpeechHandlers {
  readonly onResult: (result: CareSpeechResult) => void;
  /** Stable short code: `permission` for a denied microphone, the platform code otherwise. */
  readonly onError: (code: string) => void;
  /** Fires when the session ends without producing a final result. */
  readonly onDone: () => void;
}

export interface CareSpeechRecognizerPort {
  /** Prepares the recognizer; `false` means the device cannot run a voice call. */
  initialize(localeTag: string): Promise<boolean>;
  /** Opens one listen session for the current utterance. */
  listen(handlers: CareSpeechHandlers): Promise<boolean>;
  /** Ends the session and keeps the transcript already produced. */
  stop(): Promise<void>;
  /** Ends the session and discards the current utterance. */
  cancel(): Promise<void>;
  dispose(): Promise<void>;
}

export interface CareSpeechSynthesizerPort {
  /** Prepares the engine; `false` runs the call silently with captions. */
  initialize(localeTag: string): Promise<boolean>;
  /** Resolves when the utterance ends or is stopped. */
  speak(text: string, localeTag: string): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
}

export interface CareCameraPort {
  /** Opens the front camera; `false` keeps the call in voice mode. */
  open(): Promise<boolean>;
  flip(): Promise<void>;
  close(): Promise<void>;
}

export interface CareCallTurnResult {
  readonly reply: string | null;
  readonly error: string | null;
}

export interface CareCallSnapshot {
  readonly phase: CareCallPhase;
  readonly transcript: string;
  readonly replyText: string | null;
  readonly notice: CareCallNotice | null;
  readonly micEnabled: boolean;
  readonly videoEnabled: boolean;
}

export interface CareCallSessionOptions {
  readonly locale: string;
  readonly recognizer: CareSpeechRecognizerPort;
  readonly synthesizer: CareSpeechSynthesizerPort;
  readonly camera: CareCameraPort;
  readonly sendTurn: (text: string) => Promise<CareCallTurnResult>;
  /** Opening line spoken before the first listen. */
  readonly greeting?: string;
  /** Delay before reopening a finished listen session; tests shrink it. */
  readonly resumeDelayMs?: number;
}

const IDLE: CareCallSnapshot = Object.freeze({
  phase: 'connecting',
  transcript: '',
  replyText: null,
  notice: null,
  micEnabled: true,
  videoEnabled: false,
});

export class CareCallSession {
  readonly #options: CareCallSessionOptions;
  readonly #snapshot: { current: CareCallSnapshot } = { current: IDLE };
  readonly #listeners = new Set<() => void>();
  #phase: CareCallPhase = 'connecting';
  #transcript = '';
  #replyText: string | null = null;
  #notice: CareCallNotice | null = null;
  #micEnabled = true;
  #videoEnabled = false;
  #synthesizerReady = false;
  #disposed = false;

  /** Invalidates an in-flight turn when the user hangs up or interrupts. */
  #turn = 0;
  /** Invalidates stale recognition callbacks of a superseded listen session. */
  #listenToken = 0;
  /** True once the current listen session produced the turn being answered. */
  #turnCommitted = false;

  constructor(options: CareCallSessionOptions) {
    this.#options = options;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  snapshot = (): CareCallSnapshot => this.#snapshot.current;

  /**
   * Prepares the ports, speaks the greeting, and starts listening. When
   * `video` is set the camera opens first, so the call starts in video mode.
   */
  async start(video = false): Promise<void> {
    if (this.#disposed) return;
    // A fresh call starts clean; the camera-denied notice set below survives
    // because the call still runs in voice mode.
    this.#notice = null;
    if (video) await this.toggleCamera();
    if (this.#disposed) return;
    const turn = this.#turn;
    const { recognizer, synthesizer, locale, greeting } = this.#options;
    this.#synthesizerReady = await synthesizer.initialize(locale);
    const recognized = await recognizer.initialize(locale);
    if (this.#isStale(turn)) return;
    if (!recognized) {
      this.#fail();
      return;
    }
    if (greeting && greeting.trim().length > 0) {
      await this.#speak(greeting);
      if (this.#isStale(turn)) return;
    }
    await this.#listen();
  }

  /** Tap on the orb: interrupt the answer, or reopen a finished listen session. */
  async interrupt(): Promise<void> {
    if (this.#disposed) return;
    if (this.#phase === 'speaking') {
      this.#turn += 1;
      await this.#options.synthesizer.stop();
      if (this.#disposed) return;
      this.#notice = null;
      this.#phase = 'listening';
      await this.#listen();
      return;
    }
    if (this.#phase === 'listening') {
      this.#turn += 1;
      this.#listenToken += 1;
      this.#notice = null;
      await this.#options.recognizer.cancel();
      if (this.#disposed) return;
      await this.#listen();
    }
  }

  /** Mutes or reopens the microphone without ending the call. */
  async toggleMic(): Promise<void> {
    if (this.#disposed) return;
    if (this.#micEnabled) {
      this.#micEnabled = false;
      this.#transcript = '';
      if (this.#phase === 'listening') {
        this.#turn += 1;
        this.#listenToken += 1;
        await this.#options.recognizer.cancel();
        if (this.#disposed) return;
        this.#phase = 'listening';
      }
      this.#notify();
      return;
    }
    this.#micEnabled = true;
    this.#notice = null;
    this.#notify();
    if (this.#phase === 'listening') await this.#listen();
  }

  /** Turns the camera on (video mode) or off (voice mode). */
  async toggleCamera(): Promise<void> {
    if (this.#disposed) return;
    if (this.#videoEnabled) {
      this.#videoEnabled = false;
      this.#notify();
      await this.#options.camera.close();
      return;
    }
    const opened = await this.#options.camera.open();
    if (this.#disposed) return;
    if (!opened) {
      this.#notice = { key: 'platform.care.call.cameraDenied' };
      this.#notify();
      return;
    }
    this.#videoEnabled = true;
    this.#notice = null;
    this.#notify();
  }

  /** Switches between the available cameras while in video mode. */
  async flipCamera(): Promise<void> {
    if (this.#disposed || !this.#videoEnabled) return;
    await this.#options.camera.flip();
  }

  /** Ends the call: the microphone, the speech engine, and the camera close. */
  async hangUp(): Promise<void> {
    if (this.#disposed) return;
    this.#phase = 'ended';
    this.#turn += 1;
    this.#listenToken += 1;
    this.#notify();
    await Promise.all([
      this.#options.recognizer.cancel(),
      this.#options.synthesizer.stop(),
      this.#options.camera.close(),
    ]);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#turn += 1;
    this.#listenToken += 1;
    void this.#options.recognizer.dispose();
    void this.#options.synthesizer.dispose();
    void this.#options.camera.close();
    this.#listeners.clear();
  }

  async #listen(): Promise<void> {
    if (
      this.#disposed ||
      !this.#micEnabled ||
      this.#phase === 'ended' ||
      this.#phase === 'unavailable'
    ) {
      return;
    }
    const turn = this.#turn;
    const token = (this.#listenToken += 1);
    this.#phase = 'listening';
    this.#transcript = '';
    this.#turnCommitted = false;
    this.#notify();
    const started = await this.#options.recognizer.listen({
      onResult: (result) => {
        if (this.#isStale(turn, token)) return;
        if (!result.isFinal) {
          this.#transcript = result.text;
          this.#notify();
          return;
        }
        const text = result.text.trim();
        if (text.length === 0) return;
        this.#transcript = text;
        this.#turnCommitted = true;
        this.#notify();
        void this.#submit(text, turn);
      },
      onError: (code) => {
        if (this.#isStale(turn, token)) return;
        this.#handleSpeechError(code, turn);
      },
      onDone: () => {
        if (this.#isStale(turn, token) || this.#turnCommitted || this.#phase !== 'listening') {
          return;
        }
        // The platform closes a session after silence; a call keeps listening
        // so the patient never has to press a control to be heard again.
        void this.#resume(turn);
      },
    });
    if (!started && !this.#isStale(turn, token)) this.#fail();
  }

  #handleSpeechError(code: string, turn: number): void {
    if (this.#phase === 'unavailable' || this.#phase === 'ended') return;
    if (code === 'permission') {
      this.#fail();
      return;
    }
    this.#transcript = '';
    this.#notice = { key: 'platform.care.call.missed' };
    this.#notify();
    void this.#resume(turn);
  }

  async #resume(turn: number): Promise<void> {
    const delay = this.#options.resumeDelayMs ?? 250;
    if (delay > 0) await new Promise((resolve) => { setTimeout(resolve, delay); });
    if (this.#disposed || turn !== this.#turn || !this.#micEnabled) return;
    if (
      this.#phase === 'unavailable' ||
      this.#phase === 'ended' ||
      this.#phase === 'thinking' ||
      this.#phase === 'speaking'
    ) {
      return;
    }
    await this.#listen();
  }

  /** Sends the final transcript and reads the answer aloud. */
  async #submit(text: string, turn: number): Promise<void> {
    await this.#options.recognizer.stop();
    if (this.#isStale(turn)) return;
    this.#phase = 'thinking';
    this.#replyText = null;
    this.#notice = null;
    this.#notify();
    let result: CareCallTurnResult;
    try {
      result = await this.#options.sendTurn(text);
    } catch (error) {
      result = {
        reply: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    if (this.#isStale(turn)) return;
    const reply = result.reply;
    if (reply === null || reply.trim().length === 0) {
      this.#notice = result.error && result.error.trim().length > 0
        ? { key: 'platform.care.call.failed', params: { message: result.error } }
        : { key: 'platform.care.call.missed' };
      this.#notify();
      // A turn that produced no answer must not strand the call in "thinking":
      // the microphone reopens so the patient can simply say it again.
      if (this.#micEnabled) {
        await this.#listen();
      } else {
        this.#phase = 'listening';
        this.#notify();
      }
      return;
    }
    this.#replyText = reply;
    await this.#speak(reply);
    if (this.#isStale(turn)) return;
    if (this.#micEnabled) {
      await this.#listen();
    } else {
      this.#phase = 'listening';
      this.#notify();
    }
  }

  async #speak(text: string): Promise<void> {
    this.#phase = 'speaking';
    this.#notify();
    if (!this.#synthesizerReady) return;
    await this.#options.synthesizer.speak(text, this.#options.locale);
  }

  #fail(): void {
    this.#phase = 'unavailable';
    this.#notice = { key: 'platform.care.call.unavailable' };
    this.#notify();
  }

  #isStale(turn: number, token?: number): boolean {
    if (this.#disposed || turn !== this.#turn) return true;
    return token !== undefined && token !== this.#listenToken;
  }

  #notify(): void {
    if (this.#disposed) return;
    const next = Object.freeze({
      phase: this.#phase,
      transcript: this.#transcript,
      replyText: this.#replyText,
      notice: this.#notice,
      micEnabled: this.#micEnabled,
      videoEnabled: this.#videoEnabled,
    });
    this.#snapshot.current = next;
    for (const listener of this.#listeners) listener();
  }
}
