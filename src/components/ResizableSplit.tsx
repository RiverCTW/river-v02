import { useEffect, useRef, useState } from "react";

export function ResizableSplit({ direction, storageKey, defaultPercent, minFirst = 360, minSecond = 320, first, second }: {
  direction: "horizontal" | "vertical";
  storageKey: string;
  defaultPercent: number;
  minFirst?: number;
  minSecond?: number;
  first: React.ReactNode;
  second: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [percent, setPercent] = useState(() => {
    const stored = Number(localStorage.getItem(storageKey));
    return Number.isFinite(stored) && stored > 0 ? stored : defaultPercent;
  });
  const dragging = useRef(false);

  useEffect(() => { localStorage.setItem(storageKey, String(percent)); }, [percent, storageKey]);

  useEffect(() => {
    const correct = () => setPercent((current) => clamp(current));
    correct();
    window.addEventListener("resize", correct);
    return () => window.removeEventListener("resize", correct);
  }, [direction, minFirst, minSecond]);

  const clamp = (next: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return next;
    const total = direction === "horizontal" ? rect.width : rect.height;
    const minPercent = (minFirst / total) * 100;
    const maxPercent = 100 - (minSecond / total) * 100;
    return Math.max(minPercent, Math.min(maxPercent, next));
  };

  const move = (event: PointerEvent) => {
    if (!dragging.current || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const next = direction === "horizontal" ? ((event.clientX - rect.left) / rect.width) * 100 : ((event.clientY - rect.top) / rect.height) * 100;
    setPercent(clamp(next));
  };

  const end = () => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.classList.remove("is-resizing-split");
  };

  useEffect(() => {
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("blur", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("blur", end);
      end();
    };
  });

  return (
    <div ref={ref} className={`river-resizable-split is-${direction}`} style={direction === "horizontal" ? { gridTemplateColumns: `minmax(0, ${percent}%) 8px minmax(0, ${100 - percent}%)` } : { gridTemplateRows: `minmax(0, ${percent}%) 8px minmax(0, ${100 - percent}%)` }}>
      <div className="river-split-pane">{first}</div>
      <div
        className="river-split-divider"
        role="separator"
        aria-orientation={direction === "horizontal" ? "vertical" : "horizontal"}
        onPointerDown={(event) => {
          event.preventDefault();
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          document.body.classList.add("is-resizing-split");
        }}
        onLostPointerCapture={end}
        onPointerCancel={end}
        onDoubleClick={() => setPercent(defaultPercent)}
      />
      <div className="river-split-pane">{second}</div>
    </div>
  );
}
