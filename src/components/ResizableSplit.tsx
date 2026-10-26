import { useEffect, useRef, useState } from "react";

const DIVIDER_PX = 12;

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
  const frame = useRef(0);
  const pending = useRef<{ x: number; y: number } | null>(null);
  const directionRef = useRef(direction);
  const limitsRef = useRef({ minFirst, minSecond });

  useEffect(() => { directionRef.current = direction; }, [direction]);
  useEffect(() => { limitsRef.current = { minFirst, minSecond }; }, [minFirst, minSecond]);
  useEffect(() => { localStorage.setItem(storageKey, String(percent)); }, [percent, storageKey]);

  const clamp = (next: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return next;
    const total = directionRef.current === "horizontal" ? rect.width : rect.height;
    if (!total) return next;
    const minPercent = (limitsRef.current.minFirst / total) * 100;
    const maxPercent = 100 - (limitsRef.current.minSecond / total) * 100;
    if (minPercent > maxPercent) return 50;
    return Math.max(minPercent, Math.min(maxPercent, next));
  };

  useEffect(() => {
    const apply = () => {
      frame.current = 0;
      const point = pending.current;
      const element = ref.current;
      if (!point || !element) return;
      const rect = element.getBoundingClientRect();
      const total = directionRef.current === "horizontal" ? rect.width : rect.height;
      if (!total) return;
      const next = directionRef.current === "horizontal"
        ? ((point.x - rect.left) / rect.width) * 100
        : ((point.y - rect.top) / rect.height) * 100;
      setPercent(clamp(next));
    };

    const move = (event: PointerEvent) => {
      if (!dragging.current) return;
      pending.current = { x: event.clientX, y: event.clientY };
      if (!frame.current) frame.current = requestAnimationFrame(apply);
    };

    const end = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.classList.remove("is-resizing-split", "is-resizing-col", "is-resizing-row");
      if (frame.current) {
        cancelAnimationFrame(frame.current);
        frame.current = 0;
      }
      pending.current = null;
    };

    const correct = () => setPercent((current) => clamp(current));

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("blur", end);
    window.addEventListener("resize", correct);
    correct();
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("blur", end);
      window.removeEventListener("resize", correct);
      end();
    };
  }, []);

  const begin = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragging.current = true;
    pending.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add("is-resizing-split", direction === "horizontal" ? "is-resizing-col" : "is-resizing-row");
  };

  const grid = direction === "horizontal"
    ? { gridTemplateColumns: `minmax(0, ${percent}%) ${DIVIDER_PX}px minmax(0, ${100 - percent}%)` }
    : { gridTemplateRows: `minmax(0, ${percent}%) ${DIVIDER_PX}px minmax(0, ${100 - percent}%)` };

  return (
    <div ref={ref} className={`river-resizable-split is-${direction}`} style={grid}>
      <div className="river-split-pane">{first}</div>
      <div
        className="river-split-divider"
        role="separator"
        aria-orientation={direction === "horizontal" ? "vertical" : "horizontal"}
        tabIndex={0}
        onPointerDown={begin}
        onPointerCancel={() => { dragging.current = false; document.body.classList.remove("is-resizing-split", "is-resizing-col", "is-resizing-row"); }}
        onDoubleClick={() => setPercent(defaultPercent)}
        onKeyDown={(event) => {
          const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -2 : event.key === "ArrowRight" || event.key === "ArrowDown" ? 2 : 0;
          if (!delta) return;
          event.preventDefault();
          setPercent((current) => clamp(current + delta));
        }}
      />
      <div className="river-split-pane">{second}</div>
    </div>
  );
}
