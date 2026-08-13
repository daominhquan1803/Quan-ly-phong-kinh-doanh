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
        <h1 className="text-xl font-semibold text-gray-900">Đã có lỗi xảy ra</h1>
        <p className="text-sm text-gray-500">
          {error.message || "Có lỗi không xác định. Vui lòng thử lại hoặc liên hệ quản trị viên."}
        </p>
        <button
          onClick={reset}
          className="rounded-md bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700"
        >
          Thử lại
        </button>
      </div>
    </div>
  );
}
