// The site as last published (2026-10-06), opened in a new tab — a globe
// icon (2026-10-28, Craig's mockup: replaces the "View published site ↗"
// button, part of standardising on icons).
export default function PublishedSiteLink({ href, className = "" }: { href: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="View published site"
      aria-label="View published site"
      className={`inline-flex shrink-0 rounded-full p-0.5 text-[#2c3e6b] hover:bg-neutral-100 ${className}`}
    >
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
        <circle cx="12" cy="12" r="9.5" />
        <ellipse cx="12" cy="12" rx="4.2" ry="9.5" />
        <path d="M12 2.5v19M2.5 12h19M4 7h16M4 17h16" />
      </svg>
    </a>
  );
}
