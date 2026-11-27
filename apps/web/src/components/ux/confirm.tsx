"use client";
// Lucian UX/UI Prompt #436 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#436

import { useEffect, useRef, useState } from "react";
import "./lucian.css";

interface Request {
  message: string;
  title?: string;
  okLabel?: string;
  /** true = xoá/huỷ: nút đỏ, thùng rác mở nắp. */
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

const EVENT = "ux-confirm";

/** Thay window.confirm: trả về true nếu người dùng đồng ý. */
export function confirmDialog(message: string, options: Omit<Request, "message" | "resolve"> = {}): Promise<boolean> {
  return new Promise((resolve) => window.dispatchEvent(new CustomEvent<Request>(EVENT, { detail: { message, resolve, ...options } })));
}

export function ConfirmHost() {
  const [request, setRequest] = useState<Request | null>(null);
  const [phase, setPhase] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const onConfirm = (e: Event) => {
      setPhase("");
      setRequest((e as CustomEvent<Request>).detail);
    };
    window.addEventListener(EVENT, onConfirm);
    return () => window.removeEventListener(EVENT, onConfirm);
  }, []);

  useEffect(() => {
    if (request && !dialog.current?.open) dialog.current?.showModal();
  }, [request]);

  if (!request) return null;

  function finish(ok: boolean) {
    if (phase) return; // đang chạy hiệu ứng đóng, bỏ qua bấm lặp
    const done = request!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animateTrash = ok && done.danger && !reduced;
    setPhase(animateTrash ? "is-del" : "is-gone");
    setTimeout(
      () => {
        dialog.current?.close();
        setRequest(null);
        done.resolve(ok);
      },
      animateTrash ? 1100 : 260
    );
  }

  return (
    <dialog
      ref={dialog}
      className={`ux u436 u436-dlg ${phase}`}
      aria-labelledby="ux-confirm-title"
      aria-describedby="ux-confirm-text"
      onCancel={(e) => {
        e.preventDefault();
        finish(false);
      }}
    >
      <div className="u436-d">
        <div className={`u436-ic ${request.danger ? "" : "is-ask"}`} aria-hidden="true">
          {request.danger ? (
            <svg viewBox="0 0 32 32">
              <defs>
                <clipPath id="ux-confirm-clip">
                  <rect x="-10" y="-30" width="52" height="40.5" />
                </clipPath>
              </defs>
              <g clipPath="url(#ux-confirm-clip)">
                <g className="doc">
                  <path d="M12.5 -1.5h5l3 3v8h-8z" />
                  <path d="M14.5 3.5h3.5M14.5 6h3.5" strokeWidth="1.2" />
                </g>
              </g>
              <g className="lid">
                <path d="M5.5 9.5h21" />
                <path d="M12.5 9V7a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 19.5 7v2" />
              </g>
              <g className="bd">
                <path d="M8 10.5l1.3 14.6a2.4 2.4 0 0 0 2.4 2.2h8.6a2.4 2.4 0 0 0 2.4-2.2L24 10.5" />
                <path d="M13.5 15v7.5M18.5 15v7.5" />
              </g>
            </svg>
          ) : (
            <svg viewBox="0 0 32 32">
              <path d="M11.5 12.5a4.5 4.5 0 1 1 6.6 4c-1.4.8-2.1 1.6-2.1 3.1" />
              <path d="M16 25.2v.1" strokeWidth="2.8" />
            </svg>
          )}
        </div>
        <h3 id="ux-confirm-title">{request.title ?? (request.danger ? "Xác nhận xoá" : "Xác nhận")}</h3>
        <p id="ux-confirm-text">{request.message}</p>
        <div className="u436-bs">
          {/* Tiêu điểm mặc định ở nút Huỷ để Enter không xoá nhầm. */}
          <button type="button" className="u436-no" autoFocus onClick={() => finish(false)}>
            Huỷ
          </button>
          <button type="button" className={`u436-ok ${request.danger ? "" : "is-ask"}`} onClick={() => finish(true)}>
            {request.okLabel ?? (request.danger ? "Xoá" : "Đồng ý")}
          </button>
        </div>
      </div>
    </dialog>
  );
}
