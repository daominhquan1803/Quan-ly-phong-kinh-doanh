import { describe, it, expect } from "vitest";
import { urlBase64ToUint8Array } from "./push-client";

describe("urlBase64ToUint8Array", () => {
  it("giải mã đúng 1 khoá VAPID base64url thật (không padding, có ký tự '-'/'_')", () => {
    // "hi" -> base64 chuẩn "aGk=" -> base64url (bỏ padding) "aGk"
    const result = urlBase64ToUint8Array("aGk");
    expect(Array.from(result)).toEqual([104, 105]); // "h"=104, "i"=105
  });

  it("thay đúng '-' -> '+' và '_' -> '/' khi giải mã", () => {
    // byte [251, 255] -> base64 chuẩn "+/8=" -> base64url "-_8"
    const result = urlBase64ToUint8Array("-_8");
    expect(Array.from(result)).toEqual([251, 255]);
  });

  it("tự thêm padding đúng cho độ dài không chia hết cho 4", () => {
    // "hello" -> base64 chuẩn "aGVsbG8=" -> base64url (bỏ padding) "aGVsbG8"
    const result = urlBase64ToUint8Array("aGVsbG8");
    expect(new TextDecoder().decode(result)).toBe("hello");
  });
});
