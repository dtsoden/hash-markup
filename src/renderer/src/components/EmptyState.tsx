interface Props {
  onNew: () => void;
  onOpen: () => void;
}

/**
 * Shown when there are zero tabs open. A faint watermark of the official
 * CommonMark/Markdown mark sits behind two "get started" buttons. The SVG
 * is a vector so it scales with viewport size without loss of fidelity.
 *
 * Mark: https://github.com/dcurtis/markdown-mark (CC0 public domain).
 */
export function EmptyState({ onNew, onOpen }: Props) {
  return (
    <div className="empty-state">
      <svg
        className="empty-mark"
        aria-hidden="true"
        viewBox="0 0 208 128"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          x="1.5"
          y="1.5"
          width="205"
          height="125"
          rx="15"
          ry="15"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
        />
        <path
          fill="currentColor"
          d="M30 98V30h20l20 25 20-25h20v68H90V59L70 84 50 59v39H30zM155 98l-30-33h20V30h20v35h20z"
        />
      </svg>
      <div className="empty-actions">
        <button type="button" onClick={onOpen}>Open file…</button>
        <button type="button" onClick={onNew}>New document</button>
      </div>
    </div>
  );
}
