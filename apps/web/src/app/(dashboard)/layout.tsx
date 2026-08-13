import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar role={session?.user?.role} />
      <div className="flex flex-1 flex-col min-w-0">
        <Header userName={session?.user?.name ?? undefined} role={session?.user?.role} />
        <main className="flex-1 p-6 overflow-x-auto">{children}</main>
      </div>
    </div>
  );
}
