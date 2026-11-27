"use client";
// Lucian UX/UI Prompt #435 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#435

import { useEffect, useRef } from "react";
import "./lucian.css";

const EVENT = "ux-toast";
type Kind = "success" | "error";

/** Hiện thông báo góc phải dưới. Lỗi ở lại lâu hơn để kịp đọc. */
export function toast(message: string, kind: Kind = "success") {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, kind } }));
}

interface Item {
  el: HTMLElement;
  left: number;
  t0: number;
  timer?: ReturnType<typeof setTimeout>;
}

export function Toaster() {
  const region = useRef<HTMLElement>(null);

  useEffect(() => {
    const rg = region.current!;
    const H = 56, GAP = 8, MAX = 3;
    let items: Item[] = [];
    let open = false;

    function layout() {
      const n = items.length;
      items.forEach((t, k) => {
        const i = n - 1 - k;
        t.el.style.setProperty("--y", `${open ? -i * (H + GAP) : -i * 11}px`);
        t.el.style.setProperty("--s", (open ? 1 : 1 - i * 0.055).toFixed(3));
        t.el.style.setProperty("--o", i < MAX ? "1" : "0");
        t.el.style.zIndex = String(20 - i);
        t.el.classList.toggle("is-back", !open && i > 0);
      });
      rg.style.height = n ? `${open ? n * H + (n - 1) * GAP : H + 20}px` : "0px";
    }
    function dismiss(t: Item) {
      clearTimeout(t.timer);
      items = items.filter((x) => x !== t);
      t.el.remove();
      if (!items.length) open = false;
      layout();
    }
    function run(t: Item) {
      clearTimeout(t.timer);
      t.t0 = Date.now();
      if (!open) t.timer = setTimeout(() => dismiss(t), t.left);
    }
    function make(message: string, kind: Kind) {
      const el = document.createElement("div");
      el.className = kind === "error" ? "u435-t is-error" : "u435-t";
      el.setAttribute("role", kind === "error" ? "alert" : "status");
      el.innerHTML =
        `<span class="u435-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${kind === "error" ? "M8 8l8 8M16 8l-8 8" : "m6 12.5 4 4 8-9"}"/></svg></span>` +
        '<span class="u435-tx"></span><button type="button" class="u435-x" aria-label="Đóng"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button><span class="u435-pb" aria-hidden="true"><i></i></span>';
      const text = el.querySelector<HTMLElement>(".u435-tx")!;
      text.textContent = message;
      text.title = message;
      const life = kind === "error" ? 8000 : 4500;
      el.querySelector<HTMLElement>(".u435-pb i")!.style.animationDuration = `${life}ms`;
      const t: Item = { el, left: life, t0: Date.now() };
      el.querySelector(".u435-x")!.addEventListener("click", () => dismiss(t));
      el.style.setProperty("--y", "84px");
      el.style.setProperty("--o", "0");
      rg.appendChild(el);
      void el.offsetWidth;
      items.push(t);
      if (items.length > MAX) dismiss(items[0]);
      layout();
      run(t);
    }
    function setOpen(v: boolean) {
      if (open === v) return;
      open = v;
      rg.classList.toggle("is-paused", v);
      items.forEach((t) => {
        if (v) {
          clearTimeout(t.timer);
          t.left = Math.max(500, t.left - (Date.now() - t.t0));
        } else run(t);
      });
      layout();
    }

    const onToast = (e: Event) => {
      const { message, kind } = (e as CustomEvent<{ message: string; kind: Kind }>).detail;
      make(message, kind);
    };
    const enter = () => setOpen(true);
    const leave = () => setOpen(false);
    window.addEventListener(EVENT, onToast);
    rg.addEventListener("pointerover", enter);
    rg.addEventListener("pointerleave", leave);
    rg.addEventListener("focusin", enter);
    rg.addEventListener("focusout", leave);
    return () => {
      window.removeEventListener(EVENT, onToast);
      rg.removeEventListener("pointerover", enter);
      rg.removeEventListener("pointerleave", leave);
      rg.removeEventListener("focusin", enter);
      rg.removeEventListener("focusout", leave);
      items.forEach((t) => {
        clearTimeout(t.timer);
        t.el.remove();
      });
    };
  }, []);

  return (
    <div className="ux">
      <section ref={region} className="u435-rg" aria-label="Thông báo" />
    </div>
  );
}
