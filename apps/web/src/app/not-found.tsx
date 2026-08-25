import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-xl font-semibold text-ink">Không tìm thấy trang</h1>
        <p className="text-sm text-muted-foreground">Trang bạn tìm không tồn tại hoặc đã bị xoá.</p>
        <Link href="/" className="inline-block rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-foreground hover:bg-amber-400">
          Về trang chủ
        </Link>
      </div>
    </div>
  );
}
