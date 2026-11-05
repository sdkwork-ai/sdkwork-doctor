/**
 * The surface's single outline icon set. Navigation destinations and the
 * grouped profile rows draw from it, so the tab bar and the 我的 hub speak the
 * same visual language. Icons are decorative: the label always carries meaning.
 */
export type DoctorIconName =
  | 'camera'
  | 'chat'
  | 'doctor'
  | 'image'
  | 'records'
  | 'user'
  | 'users'
  | 'device'
  | 'language'
  | 'paperclip'
  | 'video'
  | 'videoOff'
  | 'mic'
  | 'micOff'
  | 'flip'
  | 'close'
  | 'chevron';

const ICON_PATHS: Readonly<Record<DoctorIconName, string>> = Object.freeze({
  // The three attachment sources of the composer's "+" popup.
  camera:
    'M4 8.5h3l1.4-2h7.2l1.4 2h3V19H4zM12 17a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2z',
  image:
    'M4 5h16v14H4zM8 10.4a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2zM4 17l5-5 4 4 3-3 4 4',
  paperclip:
    'M19.5 11.6l-7.6 7.6a4.1 4.1 0 0 1-5.8-5.8l7.6-7.6a2.7 2.7 0 0 1 3.9 3.9l-7.6 7.6a1.4 1.4 0 0 1-1.9-1.9l7.1-7.1',
  chat: 'M4 5h16v11H8l-4 4z',
  doctor: 'M12 4v16M4 12h16',
  records: 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c2 .7 3 2.3 3 4.2',
  device: 'M4 5h16v10H4zM9 19h6M12 15v4',
  language: 'M4 6h9M8.5 6c0 4-2 7-4.5 9M6 12c1.5 2.5 3.5 4 6 5M13 20l4-11 4 11M14.5 16h5',
  video: 'M4 7h11v10H4zM15 11l5-3v10l-5-3',
  videoOff: 'M4 7h11v10H4zM15 11l5-3v10l-5-3M3 3l18 18',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  micOff: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3M4 4l16 16',
  flip: 'M4 9h12l-3-3M20 15H8l3 3',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M9 6l6 6-6 6',
});

export interface DoctorIconProps {
  readonly name: DoctorIconName;
  readonly className?: string;
}

export function DoctorIcon({ name, className }: DoctorIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className ? 'doctor-icon ' + className : 'doctor-icon'}
      fill="none"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
      width="20"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
