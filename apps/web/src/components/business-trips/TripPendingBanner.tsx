"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BellRing } from "lucide-react";

interface Summary {
  isAdmin: boolean;
  awaitingReport: number;
  awaitingReview: number;
  needsRevision: number;
  nextStepsOverdue: number;
}

/**
 * Banner nhắc ở trang Công tác / Kế hoạch tuần / KPI: buổi chưa nộp báo cáo, báo cáo chờ duyệt (CHƯA tính điểm), cần bổ sung,
 * việc tiếp theo trễ hạn. Không hiện gì khi mọi thứ đã xong.
 */
export function TripPendingBanner({ linkToTrips = true }: { linkToTrips?: boolean }) {
  const { data } = useQuery({
    queryKey: ["business-trips", "summary"],
    queryFn: async () => {
      const res = await fetch("/api/business-trips/summary");
      if (!res.ok) throw new Error("summary");
      return res.json() as Promise<Summary>;
    },
    staleTime: 60_000,
  });
  if (!data) return null;
  const who = data.isAdmin ? "của nhân viên" : "của bạn";
  const items: string[] = [];
  if (data.awaitingReport > 0) items.push(`${data.awaitingReport} buổi đi ${who} chưa nộp báo cáo`);
  if (data.needsRevision > 0) items.push(`${data.needsRevision} báo cáo cần bổ sung`);
  if (data.awaitingReview > 0) items.push(`${data.awaitingReview} báo cáo chờ duyệt — chưa được tính điểm`);
  if (data.nextStepsOverdue > 0) items.push(`${data.nextStepsOverdue} việc tiếp theo trễ hạn`);
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300">
      <BellRing className="h-4 w-4 shrink-0" />
      <span>{items.join(" · ")}</span>
      {linkToTrips && (
        <Link href="/business-trips" className="ml-auto font-medium underline underline-offset-2 hover:text-amber-200">
          Mở trang Công tác
        </Link>
      )}
    </div>
  );
}
