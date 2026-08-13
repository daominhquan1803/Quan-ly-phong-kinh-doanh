import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Không tìm thấy trang</h1>
        <p className="text-sm text-gray-500">Trang bạn tìm không tồn tại hoặc đã bị xoá.</p>
        <Link href="/" className="inline-block rounded-md bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">
          Về trang chủ
        </Link>
      </div>
    </div>
  );
}
