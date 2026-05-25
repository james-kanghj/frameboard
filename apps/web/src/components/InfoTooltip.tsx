"use client";

// Small (i) button with a portal'd tooltip that opens on hover, focus,
// or tap. Portal escapes overflow/stacking-context clipping the way
// RowMenu does; closes on outside click, Escape, scroll, or resize.
//
// The width is fixed at 288px (w-72) and the horizontal position is
// clamped to the viewport so the leftmost metric column doesn't render
// its bubble off-screen.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

interface Props {
  label: string;
  children: ReactNode;
}

export function InfoTooltip({ label, children }: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<
    { top: number; left: number } | null
  >(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const recompute = useCallback(() => {
    if (!buttonRef.current) return;
    const btn = buttonRef.current.getBoundingClientRect();
    const TIP_WIDTH = 288;
    const MARGIN = 8;
    const center = btn.left + btn.width / 2 - TIP_WIDTH / 2;
    const maxLeft = window.innerWidth - TIP_WIDTH - MARGIN;
    const left = Math.max(MARGIN, Math.min(center, maxLeft));
    setPosition({ top: btn.bottom + 6, left });
  }, []);

  useLayoutEffect(() => {
    if (open) recompute();
  }, [open, recompute]);

  useEffect(() => {
    if (!open) return;
    function onClickAway(e: MouseEvent) {
      if (
        buttonRef.current?.contains(e.target as Node) ||
        tipRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onReposition() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[9px] font-bold leading-none text-slate-500 transition hover:border-slate-500 hover:text-slate-700 focus:border-slate-500 focus:text-slate-700 focus:outline-none"
      >
        i
      </button>
      {open &&
        position &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
            }}
            className="z-50 w-72 max-w-[calc(100vw-16px)] rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-700 shadow-lg"
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
