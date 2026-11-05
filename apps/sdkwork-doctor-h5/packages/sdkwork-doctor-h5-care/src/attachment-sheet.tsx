import { useEffect } from 'react';
import { DoctorIcon, type DoctorIconName } from '@sdkwork/doctor-h5-commons';

/**
 * Where an attachment comes from. The three values mirror the Flutter surface's
 * `CareAttachmentSource`, so both clients ask the same question.
 */
export type AttachmentSource = 'camera' | 'media' | 'files';

/** Copy and titles the app injects into the popup. */
export interface ComposerAddLabels {
  /** Accessible title of the dialog, also the composer's "+" name. */
  readonly title: string;
  readonly camera: string;
  readonly media: string;
  readonly files: string;
}

interface Choice {
  readonly source: AttachmentSource;
  readonly icon: DoctorIconName;
  readonly label: keyof Omit<ComposerAddLabels, 'title'>;
}

const CHOICES: readonly Choice[] = Object.freeze([
  { source: 'camera', icon: 'camera', label: 'camera' },
  { source: 'media', icon: 'image', label: 'media' },
  { source: 'files', icon: 'paperclip', label: 'files' },
]);

export interface ComposerAddSheetProps {
  readonly open: boolean;
  readonly labels: ComposerAddLabels;
  /** Receives the chosen source; the caller opens the chooser and closes. */
  readonly onPick: (source: AttachmentSource) => void;
  /** Dismisses the popup without choosing anything. */
  readonly onClose: () => void;
}

/**
 * The composer's "+" popup on the browser surface: the same three choices as
 * the Flutter popup, in the shell's dark navy so it reads as chrome rather than
 * as part of the transcript under it.
 *
 * The scrim, Escape, and choosing a source all close it; dismissing it must
 * never open a file chooser.
 */
export function ComposerAddSheet({ labels, onClose, onPick, open }: ComposerAddSheetProps) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    // Keep the transcript under the popup still while it is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="doctor-add-sheet"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div aria-label={labels.title} aria-modal="true" className="doctor-add-sheet-panel" role="dialog">
        <span aria-hidden="true" className="doctor-add-sheet-handle" />
        <div className="doctor-add-sheet-choices">
          {CHOICES.map((choice) => (
            <button
              className="doctor-add-choice"
              data-source={choice.source}
              key={choice.source}
              onClick={() => onPick(choice.source)}
              type="button"
            >
              <DoctorIcon name={choice.icon} />
              <span className="doctor-add-choice-label">{labels[choice.label]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Picks the files the browser shows for a source.
 *
 * `capture="environment"` is what opens the rear camera on a phone; media and
 * files both open the normal chooser, one restricted to photos and videos.
 */
export const ACCEPT_BY_SOURCE: Readonly<Record<AttachmentSource, string>> = Object.freeze({
  camera: 'image/*',
  media: 'image/*,video/*',
  files: 'image/*,video/*,.pdf,.doc,.docx,.txt,.rtf,.csv',
});

/** Applies [source] to the hidden file input right before it is clicked. */
export function applyAttachmentSource(input: HTMLInputElement, source: AttachmentSource): void {
  input.accept = ACCEPT_BY_SOURCE[source];
  if (source === 'camera') {
    input.setAttribute('capture', 'environment');
  } else {
    input.removeAttribute('capture');
  }
}
