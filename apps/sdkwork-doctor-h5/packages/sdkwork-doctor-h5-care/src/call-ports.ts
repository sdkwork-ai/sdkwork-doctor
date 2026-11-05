/**
 * Browser adapters for the three call ports: speech recognition (Web Speech),
 * text-to-speech (speechSynthesis), and the camera (getUserMedia).
 *
 * Every adapter is optional by design. A browser without speech recognition
 * gets `null` and the page shows the honest "call unavailable" state with the
 * text fallback; a browser without a camera keeps the call in voice mode; a
 * browser without speech synthesis runs the call with captions only.
 */

import type {
  CareCameraPort,
  CareSpeechHandlers,
  CareSpeechRecognizerPort,
  CareSpeechSynthesizerPort,
} from './call-session';

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string } | undefined;
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorLike {
  readonly error?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/** Chromium-only speech recognition; `null` when the browser has none. */
export function createBrowserSpeechRecognizer(): CareSpeechRecognizerPort | null {
  const Constructor = getRecognitionConstructor();
  if (!Constructor) return null;
  let active: SpeechRecognitionLike | null = null;
  let localeTag = 'zh-CN';

  const detach = () => {
    if (!active) return;
    active.onresult = null;
    active.onerror = null;
    active.onend = null;
    active = null;
  };

  return {
    async initialize(tag: string) {
      localeTag = tag;
      return true;
    },
    async listen(handlers: CareSpeechHandlers) {
      detach();
      let recognition: SpeechRecognitionLike;
      try {
        recognition = new Constructor();
      } catch {
        return false;
      }
      recognition.lang = localeTag;
      recognition.continuous = false;
      recognition.interimResults = true;
      let ended = false;
      recognition.onresult = (event) => {
        let finalText = '';
        let interimText = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (!result) continue;
          const text = result[0]?.transcript ?? '';
          if (result.isFinal) finalText += text;
          else interimText += text;
        }
        if (finalText.length > 0) handlers.onResult({ text: finalText, isFinal: true });
        else if (interimText.length > 0) handlers.onResult({ text: interimText, isFinal: false });
      };
      recognition.onerror = (event) => {
        ended = true;
        const code = event?.error ?? '';
        handlers.onError(code === 'not-allowed' || code === 'service-not-allowed' ? 'permission' : (code || 'error'));
      };
      recognition.onend = () => {
        if (ended) return;
        handlers.onDone();
      };
      active = recognition;
      try {
        recognition.start();
      } catch {
        detach();
        return false;
      }
      return true;
    },
    async stop() {
      try {
        active?.stop();
      } catch {
        // The session already ended; nothing to stop.
      }
    },
    async cancel() {
      const current = active;
      detach();
      try {
        current?.abort();
      } catch {
        // The session already ended; nothing to cancel.
      }
    },
    async dispose() {
      const current = active;
      detach();
      try {
        current?.abort();
      } catch {
        // Ignore a recognizer that never started.
      }
    },
  };
}

/** speechSynthesis; when absent the call runs silently and shows captions. */
export function createBrowserSpeechSynthesizer(): CareSpeechSynthesizerPort | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  let settle: (() => void) | null = null;

  const finish = () => {
    const resolve = settle;
    settle = null;
    resolve?.();
  };

  return {
    async initialize() {
      return true;
    },
    async speak(text: string, localeTag: string) {
      window.speechSynthesis.cancel();
      await new Promise<void>((resolve) => {
        settle = resolve;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = localeTag;
        utterance.onend = finish;
        utterance.onerror = finish;
        window.speechSynthesis.speak(utterance);
        // A host that never fires `onend` (some browsers after a cancel) must
        // not leave the call stuck in "speaking"; stop() resolves it too.
      });
    },
    async stop() {
      window.speechSynthesis.cancel();
      finish();
    },
    async dispose() {
      window.speechSynthesis.cancel();
      finish();
    },
  };
}

export interface BrowserCameraOptions {
  /** Receives the live stream, or `null` when the camera closes. */
  readonly onStream: (stream: MediaStream | null) => void;
}

/** getUserMedia camera; `null` when the browser exposes no media devices. */
export function createBrowserCamera(options: BrowserCameraOptions): CareCameraPort | null {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  let stream: MediaStream | null = null;
  let facing: 'user' | 'environment' = 'user';

  const close = async () => {
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null;
    options.onStream(null);
  };

  const open = async (): Promise<boolean> => {
    await close();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: facing },
      });
    } catch {
      stream = null;
      options.onStream(null);
      return false;
    }
    options.onStream(stream);
    return true;
  };

  return {
    open,
    async flip() {
      facing = facing === 'user' ? 'environment' : 'user';
      await open();
    },
    close,
  };
}
