"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-xl font-semibold text-ink">Đã có lỗi xảy ra</h1>
        <p className="text-sm text-muted-foreground">
          {error.message || "Có lỗi không xác định. Vui lòng thử lại hoặc liên hệ quản trị viên."}
        </p>
        <button
          onClick={reset}
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-foreground hover:bg-amber-400"
        >
          Thử lại
        </button>
      </div>
    </div>
  );
}
