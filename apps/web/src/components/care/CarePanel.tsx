"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Search, BellRing, CalendarClock } from "lucide-react";
import { cn, formatDateVN } from "@/lib/utils";
import { normalizeVN } from "@/lib/text-normalize";
import {
  CARE_CHANNELS,
  CARE_CHANNEL_LABEL,
  CARE_OUTCOMES,
  CARE_OUTCOME_LABEL,
  ISSUE_TYPES,
  ISSUE_TYPE_LABEL,
  VALUE_BANDS,
  VALUE_BAND_LABEL,
  NOTE_REQUIRED,
  type CareChannelKey,
  type CareOutcomeKey,
} from "@/lib/customer-care";
import { SEASON_STAGE_LABEL } from "@/lib/customer-season";
import { DuePlan } from "./DuePlan";
import { ProfileBox } from "@/components/customer-report/ProfileForm";
import type { CareCustomerRow } from "@/lib/customer-care-query";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const FOLLOW_UPS = [
  { days: 3, label: "3 ngày" },
  { days: 7, label: "1 tuần" },
  { days: 30, label: "1 tháng" },
];
const PATTERN_LABEL = { REGULAR: "Đều đặn", SEASONAL: "Theo vụ", PROJECT: "Theo dự án" } as const;

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        active ? "border-amber-400 bg-amber-500/15 font-semibold text-amber-400" : "border-gray-200/40 text-ink2 hover:bg-white/5"
      )}
    >
      {children}
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 mt-4 text-xs font-medium text-muted-foreground">{children}</p>;
}

interface CareLogRow {
  id: string;
  channel: CareChannelKey;
  outcome: CareOutcomeKey;
  note: string | null;
  createdAt: string;
  employee: { name: string };
}

export function CarePanel() {
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const [selectedId, setSelectedId] = useState<string>(params.get("customer") ?? "");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["care-overview"],
    queryFn: async () => {
      const res = await fetch("/api/customer-care/overview");
      if (!res.ok) throw new Error("Không tải được danh sách khách");
      return (await res.json()).customers as CareCustomerRow[];
    },
  });
  const customers = useMemo(() => data ?? [], [data]);
  const selected = customers.find((c) => c.id === selectedId) ?? null;

  const needAttention = useMemo(() => {
    const now = Date.now();
    return customers.filter((c) => c.season || (c.followUpAt && new Date(c.followUpAt).getTime() <= now));
  }, [customers]);

  const matches = useMemo(() => {
    const q = normalizeVN(search.trim());
    const base = q
      ? customers.filter((c) => normalizeVN(c.customerName).includes(q) || normalizeVN(c.customerCode).includes(q))
      : customers;
    return base.slice(0, 8);
  }, [customers, search]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="space-y-4">
        <DuePlan onSelect={setSelectedId} />
        {needAttention.length > 0 && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-400">
              <BellRing className="h-4 w-4" /> Cần chăm sóc ({needAttention.length})
            </p>
            <div className="divide-y divide-gray-200/20">
              {needAttention.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className="flex w-full items-center justify-between gap-2 py-2 text-left hover:bg-white/5"
                >
                  <span className="min-w-0 truncate text-sm text-ink">{c.customerName}</span>
                  <span className="shrink-0 text-xs text-amber-400">
                    {c.season ? `${SEASON_STAGE_LABEL[c.season.stage]} · T${c.season.seasonMonth}` : "Đến hạn hẹn lại"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-gray-200/30 p-4">
          <p className="mb-2 text-sm font-semibold text-ink">Chọn khách</p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Gõ 2–3 chữ tên hoặc mã khách"
              className="w-full rounded-lg border border-gray-200/40 bg-transparent py-2 pl-9 pr-3 text-sm text-ink"
            />
          </div>
          {isLoading && <p className="mt-3 text-sm text-muted-foreground">Đang tải...</p>}
          <div className="mt-2 divide-y divide-gray-200/20">
            {matches.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn("flex w-full items-center justify-between gap-2 px-1 py-2 text-left hover:bg-white/5", c.id === selectedId && "bg-white/5")}
              >
                <span className="min-w-0 truncate text-sm text-ink">{c.customerName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {c.lastCareAt ? `Liên hệ ${formatDateVN(c.lastCareAt)}` : "Chưa ghi chăm sóc"}
                </span>
              </button>
            ))}
            {!isLoading && matches.length === 0 && <p className="py-3 text-sm text-muted-foreground">Không tìm thấy khách.</p>}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {selected ? (
          <>
            <QuickLog
              key={selected.id}
              customer={selected}
              onSaved={() => {
                queryClient.invalidateQueries({ queryKey: ["care-overview"] });
                queryClient.invalidateQueries({ queryKey: ["care-plan"] });
              }}
            />
            <PatternBox
              key={`p-${selected.id}-${selected.buyingPattern}`}
              customer={selected}
              onSaved={() => {
                queryClient.invalidateQueries({ queryKey: ["care-overview"] });
                queryClient.invalidateQueries({ queryKey: ["care-plan"] });
              }}
            />
            <ProfileBox key={`pf-${selected.id}`} customerId={selected.id} />
            <History customerId={selected.id} />
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-200/40 p-8 text-center text-sm text-muted-foreground">
            Chọn một khách ở bên trái để ghi chăm sóc.
          </div>
        )}
      </div>
    </div>
  );
}

function QuickLog({ customer, onSaved }: { customer: CareCustomerRow; onSaved: () => void }) {
  const queryClient = useQueryClient();
  const [channel, setChannel] = useState<CareChannelKey>("CALL");
  const [outcome, setOutcome] = useState<CareOutcomeKey | "">("");
  const [issueType, setIssueType] = useState<string>("");
  const [expectedMonth, setExpectedMonth] = useState<number | null>(null);
  const [needGroup, setNeedGroup] = useState("");
  const [needValueBand, setNeedValueBand] = useState<string>("");
  const [note, setNote] = useState("");
  const [followUpDays, setFollowUpDays] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/customer-care", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer.id,
          channel,
          outcome,
          issueType: issueType || null,
          expectedMonth,
          needGroup: needGroup || null,
          needValueBand: needValueBand || null,
          note: note || null,
          followUpDays,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Không lưu được");
      return body;
    },
    onSuccess: () => {
      setSaved(true);
      onSaved();
      queryClient.invalidateQueries({ queryKey: ["care-history", customer.id] });
      setOutcome("");
      setIssueType("");
      setExpectedMonth(null);
      setNeedGroup("");
      setNeedValueBand("");
      setNote("");
      setFollowUpDays(null);
    },
  });

  useEffect(() => {
    if (saved) {
      const t = setTimeout(() => setSaved(false), 3000);
      return () => clearTimeout(t);
    }
  }, [saved]);

  const needsMonth = outcome === "UPCOMING_ORDER" || outcome === "NEW_NEED";

  return (
    <div className="rounded-2xl border border-gray-200/30 p-4">
      <p className="text-base font-semibold text-ink">{customer.customerName}</p>
      <p className="text-xs text-muted-foreground">
        {customer.customerCode} · Đơn cuối {formatDateVN(customer.lastOrderAt)}
        {customer.season && <span className="ml-2 text-amber-400">{SEASON_STAGE_LABEL[customer.season.stage]}</span>}
      </p>

      <Label>Kênh</Label>
      <div className="flex flex-wrap gap-2">
        {CARE_CHANNELS.map((c) => (
          <Chip key={c} active={channel === c} onClick={() => setChannel(c)}>{CARE_CHANNEL_LABEL[c]}</Chip>
        ))}
      </div>

      <Label>Kết quả</Label>
      <div className="flex flex-wrap gap-2">
        {CARE_OUTCOMES.filter((o) => o !== "RESOLVED" || customer.openIssue).map((o) => (
          <Chip key={o} active={outcome === o} onClick={() => setOutcome(o)}>{CARE_OUTCOME_LABEL[o]}</Chip>
        ))}
      </div>

      {outcome === "ISSUE" && (
        <>
          <Label>Lý do</Label>
          <div className="flex flex-wrap gap-2">
            {ISSUE_TYPES.map((t) => (
              <Chip key={t} active={issueType === t} onClick={() => setIssueType(t)}>{ISSUE_TYPE_LABEL[t]}</Chip>
            ))}
          </div>
        </>
      )}
      {outcome === "NEW_NEED" && (
        <>
          <Label>Nhóm sản phẩm</Label>
          <input
            value={needGroup}
            onChange={(e) => setNeedGroup(e.target.value)}
            placeholder="Vd: tem decal, túi PE, carton"
            className="w-full rounded-lg border border-gray-200/40 bg-transparent px-3 py-2 text-sm text-ink"
          />
          <Label>Giá trị ước tính</Label>
          <div className="flex flex-wrap gap-2">
            {VALUE_BANDS.map((b) => (
              <Chip key={b} active={needValueBand === b} onClick={() => setNeedValueBand(b)}>{VALUE_BAND_LABEL[b]}</Chip>
            ))}
          </div>
        </>
      )}
      {needsMonth && (
        <>
          <Label>Tháng dự kiến có đơn</Label>
          <div className="flex flex-wrap gap-2">
            {MONTHS.map((m) => (
              <Chip key={m} active={expectedMonth === m} onClick={() => setExpectedMonth(m)}>T{m}</Chip>
            ))}
          </div>
        </>
      )}

      {customer.openIssue && outcome !== "RESOLVED" && (
        <p className="mt-3 text-xs text-amber-400">Khách đang có vấn đề chưa xử lý. Giải quyết xong thì chọn “Đã xử lý xong vấn đề”.</p>
      )}
      <Label>{outcome && NOTE_REQUIRED.includes(outcome) ? (outcome === "RESOLVED" ? "Đã xử lý thế nào (bắt buộc)" : "Ghi chú (bắt buộc)") : "Ghi chú (không bắt buộc)"}</Label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        placeholder="1 dòng"
        className="w-full rounded-lg border border-gray-200/40 bg-transparent px-3 py-2 text-sm text-ink"
      />

      <Label>Hẹn chăm sóc lại</Label>
      <div className="flex flex-wrap gap-2">
        {FOLLOW_UPS.map((f) => (
          <Chip key={f.days} active={followUpDays === f.days} onClick={() => setFollowUpDays(followUpDays === f.days ? null : f.days)}>
            {f.label}
          </Chip>
        ))}
      </div>
      {outcome === "NO_CONTACT" && !followUpDays && (
        <p className="mt-2 text-xs text-muted-foreground">Không chọn thì app tự hẹn gọi lại sau 3 ngày.</p>
      )}

      {save.isError && <p className="mt-3 text-sm text-alert">{(save.error as Error).message}</p>}
      {saved && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-success-600">
          <CheckCircle2 className="h-4 w-4" /> Đã lưu
        </p>
      )}
      <button
        disabled={!outcome || save.isPending || (NOTE_REQUIRED.includes(outcome) && !note.trim())}
        onClick={() => save.mutate()}
        className="mt-4 w-full rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-black disabled:opacity-40"
      >
        {save.isPending ? "Đang lưu..." : "Lưu"}
      </button>
    </div>
  );
}

function PatternBox({ customer, onSaved }: { customer: CareCustomerRow; onSaved: () => void }) {
  const [pattern, setPattern] = useState<CareCustomerRow["buyingPattern"]>(customer.buyingPattern);
  const [months, setMonths] = useState<number[]>(
    customer.seasonMonths.length ? customer.seasonMonths : customer.suggestedSeasonMonths
  );
  const [lead, setLead] = useState(customer.seasonLeadMonths);

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/customers/${customer.id}/pattern`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyingPattern: pattern, seasonMonths: months, seasonLeadMonths: lead }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Không lưu được");
    },
    onSuccess: onSaved,
  });

  const toggle = (m: number) => setMonths((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  const dirty =
    pattern !== customer.buyingPattern ||
    lead !== customer.seasonLeadMonths ||
    (pattern === "SEASONAL" && months.join() !== customer.seasonMonths.join());

  return (
    <div className="rounded-2xl border border-gray-200/30 p-4">
      <p className="text-sm font-semibold text-ink">Kiểu mua của khách</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(Object.keys(PATTERN_LABEL) as (keyof typeof PATTERN_LABEL)[]).map((p) => (
          <Chip key={p} active={pattern === p} onClick={() => setPattern(p)}>{PATTERN_LABEL[p]}</Chip>
        ))}
      </div>
      {pattern !== "REGULAR" && (
        <p className="mt-2 text-xs text-muted-foreground">
          Khách này không bị chấm cảnh báo theo nhịp đặt hàng thường.
          {pattern === "PROJECT" && " Không nhắc theo lịch."}
        </p>
      )}
      {customer.buyingPattern === "REGULAR" && customer.suggestedSeasonMonths.length > 0 && pattern === "REGULAR" && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-400">
          <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Lịch sử cho thấy khách hay đặt vào tháng {customer.suggestedSeasonMonths.join(", ")}. Có thể là khách theo vụ.
        </p>
      )}
      {pattern === "SEASONAL" && (
        <>
          <Label>Tháng mua thường</Label>
          <div className="flex flex-wrap gap-2">
            {MONTHS.map((m) => (
              <Chip key={m} active={months.includes(m)} onClick={() => toggle(m)}>T{m}</Chip>
            ))}
          </div>
          {customer.suggestedSeasonMonths.length > 0 && (
            <p className="mt-1.5 text-xs text-muted-foreground">Gợi ý từ lịch sử đơn: tháng {customer.suggestedSeasonMonths.join(", ")}.</p>
          )}
          <Label>Nhắc trước</Label>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3].map((n) => (
              <Chip key={n} active={lead === n} onClick={() => setLead(n)}>{n} tháng</Chip>
            ))}
          </div>
        </>
      )}
      {save.isError && <p className="mt-3 text-sm text-alert">{(save.error as Error).message}</p>}
      <button
        disabled={!dirty || save.isPending}
        onClick={() => save.mutate()}
        className="mt-4 w-full rounded-lg border border-amber-500/50 py-2 text-sm font-semibold text-amber-400 disabled:opacity-40"
      >
        {save.isPending ? "Đang lưu..." : "Lưu kiểu mua"}
      </button>
    </div>
  );
}

function History({ customerId }: { customerId: string }) {
  const { data } = useQuery({
    queryKey: ["care-history", customerId],
    queryFn: async () => {
      const res = await fetch(`/api/customer-care?customerId=${customerId}`);
      if (!res.ok) throw new Error("Không tải được lịch sử");
      return (await res.json()).logs as CareLogRow[];
    },
  });
  if (!data || data.length === 0) return null;
  return (
    <div className="rounded-2xl border border-gray-200/30 p-4">
      <p className="mb-2 text-sm font-semibold text-ink">Lịch sử chăm sóc</p>
      <div className="divide-y divide-gray-200/20">
        {data.map((l) => (
          <div key={l.id} className="py-2 text-sm">
            <p className="text-ink">
              {CARE_OUTCOME_LABEL[l.outcome]} <span className="text-muted-foreground">· {CARE_CHANNEL_LABEL[l.channel]}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDateVN(l.createdAt)} · {l.employee.name}
              {l.note ? ` · ${l.note}` : ""}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
