"use client";
// Lucian UX/UI Prompt #416 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#416

import { useEffect, useRef } from "react";
import "./lucian.css";

/** Thanh chuyển tab có con trượt. Bàn phím: mũi tên trái/phải, Home, End. */
export function UxTabs<K extends string>({ tabs, value, onChange, label }: { tabs: [K, string][]; value: K; onChange: (key: K) => void; label: string }) {
  const list = useRef<HTMLDivElement>(null);
  const last = useRef(0);

  useEffect(() => {
    const el = list.current!;
    const place = () => {
      const active = el.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!active) return;
      // Mép đi trước chạy nhanh, mép sau đuổi theo (hiệu ứng giãn) tuỳ hướng di chuyển.
      const forward = active.offsetLeft > last.current;
      last.current = active.offsetLeft;
      el.style.setProperty("--tl", forward ? ".62s" : ".38s");
      el.style.setProperty("--tr", forward ? ".38s" : ".62s");
      el.style.setProperty("--l", `${active.offsetLeft}px`);
      el.style.setProperty("--r", `${el.clientWidth - active.offsetLeft - active.offsetWidth}px`);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, tabs]);

  function onKeyDown(e: React.KeyboardEvent) {
    const cur = tabs.findIndex(([k]) => k === value);
    const to = e.key === "ArrowRight" ? cur + 1 : e.key === "ArrowLeft" ? cur - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    const next = (to + tabs.length) % tabs.length;
    onChange(tabs[next][0]);
    list.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  }

  return (
    <div className="ux">
      <div ref={list} className="u416-tl" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        <span className="u416-th" aria-hidden="true" />
        {tabs.map(([k, text]) => (
          <button key={k} type="button" role="tab" className="u416-tab" aria-selected={k === value} tabIndex={k === value ? 0 : -1} onClick={() => onChange(k)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
