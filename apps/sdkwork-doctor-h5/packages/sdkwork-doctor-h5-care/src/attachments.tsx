import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { MedicalAttachment, MedicalAttachmentKind, MedicalAttachmentStore } from '@sdkwork/doctor-common-doctor';
import { ActionButton } from '@sdkwork/doctor-h5-commons';

/** Catalog key of one attachment kind label. */
export function attachmentKindLabelKey(kind: MedicalAttachmentKind): string {
  return 'platform.care.medical.attachment.' + kind;
}

/** Human-readable size for an attachment row. */
export function attachmentSizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return String(Math.round(bytes)) + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/** Resolves an attachment to a renderable URL and revokes it on unmount. */
export function useAttachmentUrl(
  store: MedicalAttachmentStore,
  attachment: MedicalAttachment,
): string | null {
  const inline = attachment.dataUrl ?? attachment.path ?? null;
  const [url, setUrl] = useState<string | null>(inline);
  useEffect(() => {
    if (attachment.dataUrl || attachment.path) {
      setUrl(attachment.dataUrl ?? attachment.path ?? null);
      return undefined;
    }
    let active = true;
    let objectUrl: string | null = null;
    void store.read(attachment).then((blob) => {
      if (!active || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [store, attachment.id, attachment.dataUrl, attachment.path]);
  return url;
}

function AttachmentRow({
  store,
  attachment,
  onRemove,
}: {
  readonly store: MedicalAttachmentStore;
  readonly attachment: MedicalAttachment;
  readonly onRemove?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const url = useAttachmentUrl(store, attachment);
  return (
    <li className="doctor-attachment">
      {attachment.kind === 'image' && url ? (
        <img alt={attachment.name} className="doctor-attachment-image" src={url} />
      ) : null}
      {attachment.kind === 'video' && url ? (
        <video className="doctor-attachment-video" controls src={url} />
      ) : null}
      <div className="doctor-attachment-copy">
        {attachment.kind === 'file' && url ? (
          <a className="doctor-link" download={attachment.name} href={url} rel="noreferrer" target="_blank">
            {attachment.name}
          </a>
        ) : (
          <span className="doctor-attachment-name">{attachment.name}</span>
        )}
        <span className="doctor-check-detail">
          {t(attachmentKindLabelKey(attachment.kind))} · {attachmentSizeLabel(attachment.sizeBytes)}
        </span>
      </div>
      {onRemove ? (
        <ActionButton onClick={() => onRemove(attachment.id)}>{t('platform.care.chat.removeAttachment')}</ActionButton>
      ) : null}
    </li>
  );
}

/** Read-only list of the files attached to a conversation or a medical record. */
export function AttachmentList({
  store,
  attachments,
  onRemove,
}: {
  readonly store: MedicalAttachmentStore;
  readonly attachments: readonly MedicalAttachment[];
  readonly onRemove?: (id: string) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <ul className="doctor-attachment-list">
      {attachments.map((attachment) => (
        <AttachmentRow attachment={attachment} key={attachment.id} store={store} onRemove={onRemove} />
      ))}
    </ul>
  );
}

/** Hidden file input plus its visible button. */
export function AttachmentPicker({
  disabled,
  label,
  onPick,
}: {
  readonly disabled?: boolean;
  readonly label: string;
  readonly onPick: (files: readonly File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const change = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Reset so picking the same file twice still fires a change event.
    event.target.value = '';
    if (files.length > 0) onPick(files);
  };
  return (
    <>
      <input
        accept="image/*,video/*,.pdf,.doc,.docx,.txt,.rtf,.csv"
        className="doctor-attachment-input"
        multiple
        onChange={change}
        ref={inputRef}
        type="file"
      />
      <ActionButton disabled={disabled} onClick={() => inputRef.current?.click()}>{label}</ActionButton>
    </>
  );
}
