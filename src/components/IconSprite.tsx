export function IconSprite() {
  return (
    <svg className="tmi-icon-sprite" aria-hidden="true" focusable="false">
      <symbol id="tmi-icon-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></symbol>
      <symbol id="tmi-icon-notebook" viewBox="0 0 24 24"><path d="M5 4.5h11.5A2.5 2.5 0 0 1 19 7v13H7.5A2.5 2.5 0 0 1 5 17.5v-13Z" /><path d="M8 4.5v15" /></symbol>
      <symbol id="tmi-icon-star" viewBox="0 0 24 24"><path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8L12 4Z" /></symbol>
      <symbol id="tmi-icon-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></symbol>
      <symbol id="tmi-icon-trash" viewBox="0 0 24 24"><path d="M5 7h14" /><path d="M9 7V5h6v2" /><path d="M7 7l1 12h8l1-12" /><path d="M10 11v5M14 11v5" /></symbol>
      <symbol id="tmi-icon-library" viewBox="0 0 24 24"><path d="M4 7.5h6l1.5 2H20v9.5H4z" /><path d="M12 12v4M10 14l2 2 2-2" /></symbol>
      <symbol id="tmi-icon-preferences" viewBox="0 0 24 24"><path d="M4 7h5M13 7h7M4 12h9M17 12h3M4 17h3M11 17h9" /><circle cx="11" cy="7" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="9" cy="17" r="2" /></symbol>
      <symbol id="tmi-icon-folder" viewBox="0 0 24 24"><path d="M3 7.5c0-1.2 1-2.2 2.2-2.2h4.1l2.1 2.1h7.4c1.2 0 2.2 1 2.2 2.2v7.4c0 1.2-1 2.2-2.2 2.2H5.2C4 19.2 3 18.2 3 17V7.5Z" /></symbol>
      <symbol id="tmi-icon-expand" viewBox="0 0 24 24"><path d="M8.5 4H4v4.5M15.5 4H20v4.5M20 15.5V20h-4.5M8.5 20H4v-4.5" /><path d="M9 9l-5-5M15 9l5-5M15 15l5 5M9 15l-5 5" /></symbol>
      <symbol id="tmi-icon-collapse" viewBox="0 0 24 24"><path d="M4 8.5h4.5V4M20 8.5h-4.5V4M15.5 20v-4.5H20M8.5 20v-4.5H4" /><path d="M9 9l-5-5M15 9l5-5M15 15l5 5M9 15l-5 5" /></symbol>
    </svg>
  );
}

export function Icon({ name, className = "tmi-icon" }: { name: string; className?: string }) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#tmi-icon-${name}`} />
    </svg>
  );
}

export function FolderIcon({ className = "tmi-folder-icon-svg" }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true">
      <use href="#tmi-icon-folder" />
    </svg>
  );
}
