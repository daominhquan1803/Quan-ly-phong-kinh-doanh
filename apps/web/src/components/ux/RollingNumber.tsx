"use client";
// Lucian UX/UI Prompt #426 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#426

import { useEffect, useState } from "react";
import "./lucian.css";

const DIGITS = "01234567890123456789".split("");

/** Số lăn như đồng hồ công-tơ-mét khi hiện ra và khi rê chuột. Ký tự không phải số giữ nguyên. */
export function RollingNumber({ value }: { value: string }) {
  const [spin, setSpin] = useState(false);

  useEffect(() => {
    // Khung hình đầu đứng ở 0, khung sau lăn tới số thật.
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setSpin(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  function replay() {
    setSpin(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setSpin(true)));
  }

  let order = 0;
  return (
    <span className="ux" style={{ color: "inherit" }} onPointerEnter={replay}>
      <span className="ux-sr">{value}</span>
      {/* Chỉ xuống dòng giữa các từ (vd "10,061" và "tỷ"), không cắt giữa các chữ số. */}
      {value.split(/\s+/).map((word, w) => (
        <span key={w} aria-hidden="true">
          {w > 0 && " "}
          <span className="u426-n">
            {word.split("").map((ch, i) =>
              /\d/.test(ch) ? (
                <span key={i} className="u426-col">
                  <span style={{ "--d": spin ? Number(ch) + 10 : 0, "--k": order++, transition: spin ? undefined : "none" } as React.CSSProperties}>
                    {DIGITS.map((d, j) => (
                      <b key={j}>{d}</b>
                    ))}
                  </span>
                </span>
              ) : (
                <i key={i}>{ch}</i>
              )
            )}
          </span>
        </span>
      ))}
    </span>
  );
}
