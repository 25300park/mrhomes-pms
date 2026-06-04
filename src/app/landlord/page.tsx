"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

// ── 타입 ─────────────────────────────────────────────────────
type Deal = {
  id: string;
  listing_id: string;
  contract_type: string;
  contract_date: string;
  move_in_date: string;
  contract_end_date: string;
  contract_months: number;
  monthly_rent: number;
  status: string;
  listing: { id: string; name: string; unit_no: string; address: string } | null;
  tenant_contact: { id: string; name: string; mobile: string; email: string } | null;
  tenant_info: {
    deposit: number | null;
    utility_payment_day: number | null;
    ac_cleaning_interval: number | null;
    ac_next_cleaning: string | null;
    notes: string | null;
  } | null;
};

type PaymentSchedule = {
  id: string;
  deal_id: string;
  due_date: string;
  amount_due: number;
  status: "PENDING" | "AWAITING_APPROVAL" | "PAID" | "OVERDUE";
  receipt_image_url: string | null;
  receipt_notes: string | null;
  verified_at: string | null;
};

type CareRequest = {
  id: string;
  deal_id: string;
  service_type: string;
  preferred_date: string;
  status: string;
  description: string | null;
  scheduled_at: string | null;
  assigned_to: string | null;
  price: number | null;
  report_image_url: string | null;
  workers: { name: string; mobile: string; tools: string; notes: string }[] | null;
};

// ── 레이블 ───────────────────────────────────────────────────
const PAYMENT_BADGE: Record<string, { label: string; cls: string }> = {
  PENDING:           { label: "납부 대기", cls: "bg-blue-100 text-blue-700" },
  AWAITING_APPROVAL: { label: "검토 대기", cls: "bg-amber-100 text-amber-700" },
  PAID:              { label: "납부 완료", cls: "bg-emerald-100 text-emerald-700" },
  OVERDUE:           { label: "연체",      cls: "bg-red-100 text-red-700" },
};

const CARE_BADGE: Record<string, { label: string; cls: string }> = {
  PENDING:   { label: "접수중", cls: "bg-blue-100 text-blue-700" },
  SCHEDULED: { label: "일정확정", cls: "bg-amber-100 text-amber-700" },
  COMPLETED: { label: "완료",   cls: "bg-emerald-100 text-emerald-700" },
  CANCELLED: { label: "취소",   cls: "bg-slate-100 text-slate-500" },
};

const CARE_LABELS: Record<string, string> = {
  AIRCON: "❄️ 에어컨 청소", CLEANING: "🧹 유닛 청소",
  REPAIR: "🔧 잔수리",      HANDYMAN: "🪛 핸디맨",
};

// ── 메인 컴포넌트 ────────────────────────────────────────────
export default function LandlordPortal() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<"overview" | "payments" | "care">("overview");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [allPayments, setAllPayments] = useState<PaymentSchedule[]>([]);
  const [allCare, setAllCare] = useState<CareRequest[]>([]);
  const [landlordName, setLandlordName] = useState("임대인");
  const [loading, setLoading] = useState(true);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);

  const selectedDeal = deals.find((d) => d.id === selectedDealId) ?? deals[0];

  // ── 데이터 로드 ──────────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // pms_auth_map → contact_id 조회
      const { data: authMapRaw } = await supabase
        .from("pms_auth_map")
        .select("contact_id")
        .eq("auth_uid", user.id)
        .single();

      const authMap = authMapRaw as { contact_id: string } | null;
      if (!authMap?.contact_id) { setLoading(false); return; }

      // 임대인 이름
      const { data: contactRaw } = await supabase
        .from("contacts")
        .select("name")
        .eq("id", authMap.contact_id)
        .single();
      const contact = contactRaw as { name: string } | null;
      if (contact) setLandlordName(contact.name);

      // 본인 소유 매물의 deals 전체 조회
      const { data: dealDataRaw } = await supabase
        .from("deals")
        .select(`
          id, listing_id, contract_type, contract_date,
          move_in_date, contract_end_date, contract_months,
          monthly_rent, status,
          listing:listings(id, name, unit_no, address),
          tenant_contact:contacts!deals_tenant_contact_id_fkey(id, name, mobile, email),
          tenant_info(deposit, utility_payment_day, ac_cleaning_interval, ac_next_cleaning, notes)
        `)
        .eq("owner_contact_id", authMap.contact_id)
        .order("contract_date", { ascending: false });

      const dealData = dealDataRaw as Deal[] | null;
      if (dealData && dealData.length > 0) {
        setDeals(dealData);
        const dealIds = dealData.map((d) => d.id);

        // 납부 스케줄
        const { data: paymentDataRaw } = await supabase
          .from("payment_schedules")
          .select("*")
          .in("deal_id", dealIds)
          .order("due_date", { ascending: false });
        if (paymentDataRaw) setAllPayments(paymentDataRaw as PaymentSchedule[]);

        // 케어 서비스
        const { data: careDataRaw } = await supabase
          .from("care_service_requests")
          .select("*")
          .in("deal_id", dealIds)
          .order("created_at", { ascending: false });
        if (careDataRaw) setAllCare(careDataRaw as CareRequest[]);
      }
      setLoading(false);
    }
    loadData();

    // Realtime 구독
    const channel = supabase.channel("landlord-updates")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "payment_schedules" }, (payload) => {
        setAllPayments((prev) => prev.map((p) => p.id === payload.new.id ? { ...p, ...payload.new } : p));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "care_service_requests" }, (payload) => {
        setAllCare((prev) => prev.map((c) => c.id === payload.new.id ? { ...c, ...payload.new } : c));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── 집계 ─────────────────────────────────────────────────────
  const stats = {
    totalUnits:      deals.length,
    activeUnits:     deals.filter((d) => d.status === "ACTIVE").length,
    totalMonthlyRent: deals.filter((d) => d.status === "ACTIVE")
                          .reduce((s, d) => s + d.monthly_rent, 0),
    awaitingApproval: allPayments.filter((p) => p.status === "AWAITING_APPROVAL").length,
    overduePayments:  allPayments.filter((p) => p.status === "OVERDUE").length,
    pendingCare:      allCare.filter((c) => c.status === "PENDING").length,
  };

  const dealPayments = selectedDeal
    ? allPayments.filter((p) => p.deal_id === selectedDeal.id)
    : [];
  const dealCare = selectedDeal
    ? allCare.filter((c) => c.deal_id === selectedDeal.id)
    : [];

  function getDaysLeft(endDate: string) {
    return Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000);
  }
  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString("ko-KR");
  }

  if (loading) return (
    <div className="max-w-lg mx-auto min-h-screen flex items-center justify-center">
      <p className="text-slate-400 text-sm">데이터를 불러오는 중...</p>
    </div>
  );

  if (deals.length === 0) return (
    <div className="max-w-lg mx-auto min-h-screen flex items-center justify-center p-6">
      <div className="text-center space-y-2">
        <p className="text-2xl">🏢</p>
        <p className="font-bold text-slate-700">등록된 계약이 없습니다</p>
        <p className="text-xs text-slate-400">mrhomes 담당자에게 문의해주세요.</p>
      </div>
    </div>
  );

  // ── 렌더링 ───────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto bg-white min-h-screen flex flex-col font-sans">

      {/* 헤더 */}
      <header className="bg-[#1a2a3a] text-white px-6 py-6">
        <p className="text-xs text-slate-400 mb-1">mrhomes 임대인 포털</p>
        <h1 className="text-xl font-bold">{landlordName}</h1>
        <p className="text-xs text-slate-300 mt-1">
          관리 유닛 {stats.totalUnits}개 · 활성 {stats.activeUnits}개
        </p>
      </header>

      {/* 탭 */}
      <div className="flex border-b border-slate-200 bg-white sticky top-0 z-10">
        {(["overview", "payments", "care"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-xs font-medium transition-colors ${
              activeTab === tab ? "border-b-2 border-[#2a4d69] text-[#2a4d69]" : "text-slate-400"
            }`}>
            {tab === "overview" ? "📋 전체 현황" : tab === "payments" ? "💰 수납 관리" : "🔧 케어 현황"}
          </button>
        ))}
      </div>

      <main className="flex-1 p-5 space-y-5 overflow-y-auto">

        {/* ── 전체 현황 ── */}
        {activeTab === "overview" && (
          <>
            {/* KPI */}
            <div className="grid grid-cols-2 gap-3">
              <KpiCard label="월 임대 수입" value={`PHP ${stats.totalMonthlyRent.toLocaleString()}`} accent />
              <KpiCard label="영수증 검토 대기" value={`${stats.awaitingApproval}건`} warn={stats.awaitingApproval > 0} />
              <KpiCard label="연체 건수" value={`${stats.overduePayments}건`} danger={stats.overduePayments > 0} />
              <KpiCard label="케어 신청 대기" value={`${stats.pendingCare}건`} warn={stats.pendingCare > 0} />
            </div>

            {/* 계약 만료 임박 */}
            {deals.filter((d) => d.status === "ACTIVE" && getDaysLeft(d.contract_end_date) <= 60).length > 0 && (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                <h4 className="text-sm font-bold text-amber-800">⚠️ 계약 만료 임박</h4>
                <div className="mt-2 space-y-1">
                  {deals.filter((d) => d.status === "ACTIVE" && getDaysLeft(d.contract_end_date) <= 60).map((d) => (
                    <p key={d.id} className="text-xs text-amber-700">
                      {d.listing?.unit_no ?? d.listing?.name} · {d.tenant_contact?.name} · D-{getDaysLeft(d.contract_end_date)}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* 유닛 목록 */}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">보유 유닛</h3>
              <div className="space-y-3">
                {deals.map((d) => {
                  const daysLeft = getDaysLeft(d.contract_end_date);
                  const isExpiring = d.status === "ACTIVE" && daysLeft <= 60;
                  const payments = allPayments.filter((p) => p.deal_id === d.id);
                  const paid = payments.filter((p) => p.status === "PAID").length;
                  return (
                    <div key={d.id}
                      onClick={() => { setSelectedDealId(d.id); setActiveTab("payments"); }}
                      className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm cursor-pointer hover:border-[#2a4d69] transition-colors">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-slate-800 text-sm">
                            {d.listing?.unit_no ? `${d.listing.name} ${d.listing.unit_no}` : d.listing?.name ?? "-"}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">{d.listing?.address}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                          d.status === "ACTIVE"
                            ? isExpiring ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}>
                          {d.status === "ACTIVE" ? (isExpiring ? `만료 D-${daysLeft}` : "계약중") : d.status}
                        </span>
                      </div>
                      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-3 text-xs text-slate-500">
                        <span>임차인: <span className="text-slate-700 font-medium">{d.tenant_contact?.name ?? "-"}</span></span>
                        <span className="text-center font-medium text-slate-800">PHP {d.monthly_rent.toLocaleString()}</span>
                        <span className="text-right">{paid}/{payments.length}회 납부</span>
                      </div>
                      <div className="mt-1 text-[10px] text-slate-400">
                        {fmtDate(d.move_in_date)} ~ {fmtDate(d.contract_end_date)} ({d.contract_months}개월)
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ── 수납 관리 ── */}
        {activeTab === "payments" && (
          <>
            {/* 유닛 선택 */}
            {deals.length > 1 && (
              <select className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                value={selectedDeal?.id ?? ""}
                onChange={(e) => setSelectedDealId(e.target.value)}>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.listing?.unit_no ?? d.listing?.name} — {d.tenant_contact?.name}
                  </option>
                ))}
              </select>
            )}

            {/* 계약 요약 */}
            {selectedDeal && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">계약 정보</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    ["임차인", selectedDeal.tenant_contact?.name ?? "-"],
                    ["월 임대료", `PHP ${selectedDeal.monthly_rent.toLocaleString()}`],
                    ["계약 시작", fmtDate(selectedDeal.move_in_date)],
                    ["계약 종료", fmtDate(selectedDeal.contract_end_date)],
                    ["보증금", selectedDeal.tenant_info?.deposit ? `PHP ${Number(selectedDeal.tenant_info.deposit).toLocaleString()}` : "-"],
                    ["납부 기준일", selectedDeal.tenant_info?.utility_payment_day ? `매월 ${selectedDeal.tenant_info.utility_payment_day}일` : "-"],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-white rounded-lg p-2 border border-slate-100">
                      <p className="text-[10px] text-slate-400">{label}</p>
                      <p className="font-bold text-slate-800 mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 납부 요약 */}
            {dealPayments.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "전체", value: dealPayments.length, cls: "text-slate-800" },
                  { label: "완료", value: dealPayments.filter((p) => p.status === "PAID").length, cls: "text-emerald-700" },
                  { label: "연체", value: dealPayments.filter((p) => p.status === "OVERDUE").length, cls: "text-red-600" },
                ].map(({ label, value, cls }) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3 text-center border border-slate-200">
                    <p className="text-[10px] text-slate-500">{label}</p>
                    <p className={`text-lg font-bold mt-0.5 ${cls}`}>{value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* 영수증 검토 대기 알림 */}
            {dealPayments.filter((p) => p.status === "AWAITING_APPROVAL").length > 0 && (
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl">
                <p className="text-xs font-bold text-amber-800">
                  📩 {dealPayments.filter((p) => p.status === "AWAITING_APPROVAL").length}건 영수증 검토 중
                </p>
                <p className="text-[10px] text-amber-700 mt-0.5">CRM 담당자 확인 후 상태가 업데이트됩니다.</p>
              </div>
            )}

            {/* 납부 목록 */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">납부 내역</h3>
              {dealPayments.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">납부 일정이 없습니다.</p>
              ) : (
                <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                  {dealPayments.map((p, i) => {
                    const badge = PAYMENT_BADGE[p.status];
                    const isThisMonth = p.due_date.startsWith(new Date().toISOString().slice(0, 7));
                    return (
                      <div key={p.id} className={`rounded-xl p-3 border ${isThisMonth ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}>
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 w-6">{dealPayments.length - i}월</span>
                            <span className="text-xs font-bold text-slate-800">
                              {new Date(p.due_date).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-800">PHP {p.amount_due.toLocaleString()}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                          </div>
                        </div>
                        {p.receipt_image_url && (
                          <a href={p.receipt_image_url} target="_blank" rel="noreferrer"
                            className="mt-1.5 block text-[10px] text-blue-600 underline">
                            영수증 보기 →
                          </a>
                        )}
                        {p.verified_at && (
                          <p className="mt-0.5 text-[10px] text-emerald-600">확인: {fmtDate(p.verified_at)}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── 케어 현황 ── */}
        {activeTab === "care" && (
          <>
            {deals.length > 1 && (
              <select className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                value={selectedDeal?.id ?? ""}
                onChange={(e) => setSelectedDealId(e.target.value)}>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.listing?.unit_no ?? d.listing?.name} — {d.tenant_contact?.name}
                  </option>
                ))}
              </select>
            )}

            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">케어 서비스 이력</h3>
              {dealCare.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">케어 신청 내역이 없습니다.</p>
              ) : dealCare.map((req) => {
                const badge = CARE_BADGE[req.status];
                return (
                  <div key={req.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-slate-800">{CARE_LABELS[req.service_type] ?? req.service_type}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                    </div>
                    <div className="text-xs text-slate-500 space-y-0.5">
                      <p>희망: {new Date(req.preferred_date).toLocaleString("ko-KR")}</p>
                      {req.scheduled_at && <p>확정: {new Date(req.scheduled_at).toLocaleString("ko-KR")}</p>}
                      {req.assigned_to && <p>담당: {req.assigned_to}</p>}
                      {req.price && <p>금액: PHP {req.price.toLocaleString()}</p>}
                      {req.description && <p className="text-slate-400">{req.description}</p>}
                    </div>
                    {/* 작업자 정보 */}
                    {req.workers && req.workers.length > 0 && (
                      <div className="border-t border-slate-100 pt-2">
                        <p className="text-[10px] font-bold text-slate-400 mb-1.5">작업자 정보</p>
                        <div className="space-y-1.5">
                          {req.workers.map((w, i) => (
                            <div key={i} className="bg-slate-50 rounded-lg p-2 text-[10px]">
                              <div className="flex justify-between">
                                <span className="font-bold text-slate-700">{i + 1}. {w.name}</span>
                                <span className="text-slate-500">{w.mobile}</span>
                              </div>
                              {w.tools && <p className="text-slate-400 mt-0.5">🔧 {w.tools}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {req.report_image_url && (
                      <a href={req.report_image_url} target="_blank" rel="noreferrer"
                        className="block text-xs text-blue-600 underline">완료 사진 보기 →</a>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ── KPI 카드 ─────────────────────────────────────────────────
function KpiCard({ label, value, accent = false, warn = false, danger = false }:
  { label: string; value: string; accent?: boolean; warn?: boolean; danger?: boolean }) {
  const bg = danger ? "bg-red-50 border-red-200"
    : warn ? "bg-amber-50 border-amber-200"
    : accent ? "bg-[#1a2a3a] border-transparent"
    : "bg-slate-50 border-slate-200";
  const tv = accent ? "text-white" : danger ? "text-red-700" : warn ? "text-amber-700" : "text-slate-900";
  const tl = accent ? "text-slate-400" : "text-slate-500";
  return (
    <div className={`border rounded-xl p-4 ${bg}`}>
      <p className={`text-[10px] font-medium uppercase tracking-wide ${tl}`}>{label}</p>
      <p className={`text-lg font-bold mt-1 ${tv}`}>{value}</p>
    </div>
  );
}
