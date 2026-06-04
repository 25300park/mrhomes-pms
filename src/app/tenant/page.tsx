"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase";

type Deal = {
  id: string;
  listing_id: string;
  contract_date: string;
  move_in_date: string;
  contract_end_date: string;
  contract_months: number;
  monthly_rent: number;
  payment_type: string;
  status: string;
  listing: { id: string; name: string; unit_no: string; address: string; } | null;
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

type Worker = { name: string; mobile: string; tools: string; notes: string };

type CareRequest = {
  id: string;
  deal_id: string;
  service_type: string;
  preferred_date: string;
  status: string;
  description: string | null;
  scheduled_at: string | null;
  assigned_to: string | null;
  workers: Worker[] | null;
  gatepass_notes: string | null;
};

type CommunityPost = {
  id: string;
  title: string;
  body: string;
  is_notice: boolean;
  created_at: string;
};

const CARE_LABELS: Record<string, string> = {
  AIRCON: "❄️ 에어컨 정기 청소",
  CLEANING: "🧹 유닛 전체 청소",
  REPAIR: "🔧 잔수리·조명 교체",
  HANDYMAN: "🪛 핸디맨 서비스",
};

const PAYMENT_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PENDING:           { label: "납부 대기",  cls: "bg-blue-100 text-blue-700" },
  AWAITING_APPROVAL: { label: "확인 대기",  cls: "bg-amber-100 text-amber-700" },
  PAID:              { label: "납부 완료",  cls: "bg-emerald-100 text-emerald-700" },
  OVERDUE:           { label: "연체",       cls: "bg-red-100 text-red-700" },
};

export default function TenantDashboard() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<"dashboard" | "care" | "community">("dashboard");
  const [deal, setDeal] = useState<Deal | null>(null);
  const [payments, setPayments] = useState<PaymentSchedule[]>([]);
  const [careRequests, setCareRequests] = useState<CareRequest[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("입주민");
  const [unreadCount, setUnreadCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [receiptNotes, setReceiptNotes] = useState("");
  const [careForm, setCareForm] = useState({ service_type: "AIRCON", preferred_date: "", description: "" });
  const [careSubmitting, setCareSubmitting] = useState(false);
  const [careSuccess, setCareSuccess] = useState(false);

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: authMapRaw } = await supabase
        .from("pms_auth_map")
        .select("contact_id")
        .eq("auth_uid", user.id)
        .single();

      const authMap = authMapRaw as { contact_id: string } | null;
      if (!authMap?.contact_id) { setLoading(false); return; }

      const { data: contactRaw } = await supabase
        .from("contacts")
        .select("name")
        .eq("id", authMap.contact_id)
        .single();
      const contact = contactRaw as { name: string } | null;
      if (contact) setUserName(contact.name.split(" ")[0]);

      const { data: dealDataRaw } = await supabase
        .from("deals")
        .select(`
          id, listing_id, contract_date, move_in_date, contract_end_date,
          contract_months, monthly_rent, payment_type, status,
          listing:listings(id, name, unit_no, address),
          tenant_info(deposit, utility_payment_day, ac_cleaning_interval, ac_next_cleaning, notes)
        `)
        .eq("tenant_contact_id", authMap.contact_id)
        .eq("status", "ACTIVE")
        .order("contract_date", { ascending: false })
        .limit(1)
        .single();

      const dealData = dealDataRaw as Deal | null;
      if (dealData) {
        setDeal(dealData);

        const { data: paymentDataRaw } = await supabase
          .from("payment_schedules")
          .select("*")
          .eq("deal_id", dealData.id)
          .order("due_date", { ascending: false })
          .limit(6);
        if (paymentDataRaw) setPayments(paymentDataRaw as PaymentSchedule[]);

        const { data: careDataRaw } = await supabase
          .from("care_service_requests")
          .select("*")
          .eq("deal_id", dealData.id)
          .order("created_at", { ascending: false })
          .limit(5);
        if (careDataRaw) setCareRequests(careDataRaw as CareRequest[]);

        const { data: postDataRaw } = await supabase
          .from("community_posts")
          .select("*")
          .eq("listing_id", dealData.listing_id)
          .order("created_at", { ascending: false })
          .limit(10);
        if (postDataRaw) setPosts(postDataRaw as CommunityPost[]);
      }

      const { data: notifDataRaw } = await supabase
        .from("pms_notifications")
        .select("id")
        .eq("auth_uid", user.id)
        .eq("is_read", false);
      if (notifDataRaw) setUnreadCount((notifDataRaw as {id:string}[]).length);

      setLoading(false);
    }
    loadData();

    const channel = supabase.channel("payment-updates")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "payment_schedules" }, (payload) => {
        setPayments((prev) => prev.map((p) => p.id === payload.new.id ? { ...p, ...payload.new } : p));
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function handleReceiptUpload(paymentId: string, file: File) {
    setUploading(true); setUploadError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("로그인이 필요합니다.");
      const ext = file.name.split(".").pop();
      const path = `receipts/${user.id}/${paymentId}.${ext}`;
      const { error: storageError } = await supabase.storage.from("payment-receipts").upload(path, file, { upsert: true });
      if (storageError) throw storageError;
      const { data: urlData } = supabase.storage.from("payment-receipts").getPublicUrl(path);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any).from("payment_schedules").update({
        status: "AWAITING_APPROVAL", receipt_image_url: urlData.publicUrl, receipt_notes: receiptNotes,
      }).eq("id", paymentId);
      if (updateError) throw updateError;
      setPayments((prev) => prev.map((p) => p.id === paymentId ? { ...p, status: "AWAITING_APPROVAL", receipt_image_url: urlData.publicUrl } : p));
      setReceiptNotes("");
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : "업로드 실패. 다시 시도해주세요.");
    } finally { setUploading(false); }
  }

  async function handleCareSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!deal) return;
    setCareSubmitting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: careInserted, error } = await (supabase as any).from("care_service_requests").insert({
        deal_id: deal.id, service_type: careForm.service_type,
        preferred_date: careForm.preferred_date, description: careForm.description || null, status: "PENDING",
      }).select().single();
      if (error) throw error;
      setCareRequests((prev) => [careInserted as CareRequest, ...prev]);
      setCareSuccess(true);
      setCareForm({ service_type: "AIRCON", preferred_date: "", description: "" });
    } catch (e) { console.error(e); }
    finally { setCareSubmitting(false); }
  }

  function getDaysUntilExpiry(endDate: string) {
    return Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }

  const thisMonth = new Date().toISOString().slice(0, 7);
  const currentPayment = payments.find((p) => p.due_date.startsWith(thisMonth));

  if (loading) return (
    <div className="max-w-md mx-auto min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-slate-400 text-sm">데이터를 불러오는 중...</div>
    </div>
  );

  return (
    <div className="max-w-md mx-auto bg-white min-h-screen shadow-xl flex flex-col font-sans">
      <header className="bg-[#1a2a3a] text-white px-6 py-6 rounded-b-2xl shadow-md">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs bg-[#2a4d69] px-2 py-1 rounded-full text-blue-200">
            {deal?.listing?.name ?? "mrhomes"}
          </span>
          <button className="relative text-slate-300 hover:text-white">
            🔔{unreadCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">{unreadCount}</span>
            )}
          </button>
        </div>
        <h1 className="text-xl font-bold">안녕하세요, {userName}님!</h1>
        {deal && (
          <p className="text-xs text-slate-300 mt-1">
            {deal.listing?.unit_no ?? deal.listing?.name} · 계약 만료까지 D-{getDaysUntilExpiry(deal.contract_end_date)}
          </p>
        )}
      </header>

      <main className="flex-1 p-5 space-y-5 overflow-y-auto">
        {activeTab === "dashboard" && (
          <>
            {/* 계약 요약 카드 */}
            {deal && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <h3 className="font-bold text-slate-800 text-sm mb-3">📋 계약 요약</h3>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ["계약 시작", deal.move_in_date ? new Date(deal.move_in_date).toLocaleDateString("ko-KR") : "-"],
                    ["계약 종료", new Date(deal.contract_end_date).toLocaleDateString("ko-KR")],
                    ["계약 기간", deal.contract_months ? `${deal.contract_months}개월` : "-"],
                    ["월 임대료", `PHP ${deal.monthly_rent.toLocaleString()}`],
                    ["보증금", deal.tenant_info?.deposit ? `PHP ${Number(deal.tenant_info.deposit).toLocaleString()}` : "-"],
                    ["납부 기준일", deal.tenant_info?.utility_payment_day ? `매월 ${deal.tenant_info.utility_payment_day}일` : "-"],
                    ["에어컨 청소주기", deal.tenant_info?.ac_cleaning_interval ? `${deal.tenant_info.ac_cleaning_interval}개월마다` : "-"],
                    ["다음 에어컨 청소", deal.tenant_info?.ac_next_cleaning ? new Date(deal.tenant_info.ac_next_cleaning).toLocaleDateString("ko-KR") : "-"],
                  ] as [string,string][]).map(([label, value]) => (
                    <div key={label} className="bg-slate-50 rounded-lg p-2">
                      <p className="text-[10px] text-slate-500">{label}</p>
                      <p className="text-xs font-bold text-slate-800 mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>
                {deal.tenant_info?.notes && (
                  <div className="mt-2 bg-amber-50 rounded-lg p-2">
                    <p className="text-[10px] text-amber-700 font-bold">메모</p>
                    <p className="text-xs text-amber-800 mt-0.5">{deal.tenant_info.notes}</p>
                  </div>
                )}
              </div>
            )}

            {deal && getDaysUntilExpiry(deal.contract_end_date) <= 60 && (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start space-x-3">
                <span className="text-xl">⚠️</span>
                <div>
                  <h4 className="text-sm font-bold text-amber-800">계약 만료 임박</h4>
                  <p className="text-xs text-amber-700 mt-0.5">계약 종료까지 <strong>{getDaysUntilExpiry(deal.contract_end_date)}일</strong> 남았습니다.</p>
                </div>
              </div>
            )}
            {currentPayment ? (
              <PaymentCard payment={currentPayment} onUpload={handleReceiptUpload} uploading={uploading}
                uploadError={uploadError} fileInputRef={fileInputRef} notes={receiptNotes} onNotesChange={setReceiptNotes} />
            ) : (
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-center text-sm text-slate-500">
                이번 달 납부 일정이 없습니다.
              </div>
            )}
            {payments.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <h3 className="font-bold text-slate-800 text-sm mb-3">💰 납부 일정 ({payments.length}개월)</h3>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-slate-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-slate-500">전체</p>
                    <p className="text-sm font-bold">{payments.length}회</p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-emerald-600">완료</p>
                    <p className="text-sm font-bold text-emerald-700">{payments.filter(p => p.status === "PAID").length}회</p>
                  </div>
                  <div className={`rounded-lg p-2 text-center ${payments.filter(p => p.status === "OVERDUE").length > 0 ? "bg-red-50" : "bg-slate-50"}`}>
                    <p className={`text-[10px] ${payments.filter(p => p.status === "OVERDUE").length > 0 ? "text-red-500" : "text-slate-500"}`}>연체</p>
                    <p className={`text-sm font-bold ${payments.filter(p => p.status === "OVERDUE").length > 0 ? "text-red-600" : "text-slate-700"}`}>{payments.filter(p => p.status === "OVERDUE").length}회</p>
                  </div>
                </div>
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {payments.map((p, i) => {
                    const badge = PAYMENT_STATUS_BADGE[p.status];
                    const isThisMonth = p.due_date.startsWith(new Date().toISOString().slice(0, 7));
                    return (
                      <div key={p.id} className={`flex justify-between items-center text-xs p-2 rounded-lg ${isThisMonth ? "bg-amber-50 border border-amber-200" : "bg-slate-50"}`}>
                        <span className={`font-medium w-8 ${isThisMonth ? "text-amber-800" : "text-slate-500"}`}>{i+1}월</span>
                        <span className="text-slate-400">{new Date(p.due_date).toLocaleDateString("ko-KR", { month:"2-digit", day:"2-digit" })}</span>
                        <span className="font-bold text-slate-800">PHP {p.amount_due.toLocaleString()}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {deal && getDaysUntilExpiry(deal.contract_end_date) <= 60 && (
              <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-5 rounded-xl space-y-2">
                <span className="text-[10px] bg-indigo-600 px-2 py-0.5 rounded-full font-semibold">Lease Renewal</span>
                <h4 className="font-bold text-sm">다음 거주지를 찾으시나요?</h4>
                <p className="text-xs text-indigo-200">mrhomes가 보유한 BGC 전역의 프리미엄 매물을 가장 먼저 선점하세요.</p>
                <a href="https://rbs-homes.com" target="_blank" rel="noreferrer"
                  className="inline-block mt-1 text-xs bg-white text-indigo-900 font-bold px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">
                  rbs-homes.com 방문하기 →
                </a>
              </div>
            )}
          </>
        )}

        {activeTab === "care" && (
          <div className="space-y-5">
            <h3 className="font-bold text-slate-800 text-lg">홈 케어 서비스 신청</h3>
            {careRequests.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide">신청 내역</h4>
                {careRequests.map((req) => (
                  <div key={req.id} className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                    {/* 헤더 */}
                    <div className="p-3 flex justify-between items-center">
                      <div>
                        <p className="text-xs font-bold text-slate-800">{CARE_LABELS[req.service_type] ?? req.service_type}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">희망: {new Date(req.preferred_date).toLocaleString("ko-KR")}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        req.status === "PENDING" ? "bg-blue-100 text-blue-700"
                        : req.status === "SCHEDULED" ? "bg-amber-100 text-amber-700"
                        : req.status === "COMPLETED" ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"}`}>
                        {req.status === "PENDING" ? "접수중" : req.status === "SCHEDULED" ? "일정확정" : req.status === "COMPLETED" ? "완료" : "취소"}
                      </span>
                    </div>
                    {/* 확정 일정 정보 */}
                    {req.status === "SCHEDULED" && req.scheduled_at && (
                      <div className="px-3 pb-2">
                        <p className="text-[10px] text-amber-700 font-bold">
                          📅 확정 방문일시: {new Date(req.scheduled_at).toLocaleString("ko-KR")}
                        </p>
                        {req.assigned_to && (
                          <p className="text-[10px] text-slate-500 mt-0.5">👷 담당: {req.assigned_to}</p>
                        )}
                      </div>
                    )}
                    {/* 작업자 정보 (SCHEDULED/COMPLETED) */}
                    {(req.status === "SCHEDULED" || req.status === "COMPLETED") && req.workers && req.workers.length > 0 && (
                      <div className="border-t border-slate-200 px-3 py-2 bg-white">
                        <p className="text-[10px] font-bold text-slate-500 mb-2">GATEPASS 작업자 정보</p>
                        <div className="space-y-2">
                          {req.workers.map((w, i) => (
                            <div key={i} className="bg-slate-50 rounded-lg p-2 text-[10px]">
                              <div className="flex justify-between">
                                <span className="font-bold text-slate-800">{i+1}. {w.name}</span>
                                <span className="text-slate-500">{w.mobile}</span>
                              </div>
                              {w.tools && <p className="text-slate-500 mt-0.5">🔧 {w.tools}</p>}
                              {w.notes && <p className="text-slate-400 mt-0.5">{w.notes}</p>}
                            </div>
                          ))}
                        </div>
                        {req.gatepass_notes && (
                          <p className="text-[10px] text-amber-700 mt-2 bg-amber-50 rounded-lg p-2">
                            📝 {req.gatepass_notes}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-slate-100 pt-4" />
            {!careSuccess ? (
              <form onSubmit={handleCareSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">서비스 종류</label>
                  <select className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    value={careForm.service_type} onChange={(e) => setCareForm({ ...careForm, service_type: e.target.value })}>
                    {Object.entries(CARE_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">희망 방문 일시</label>
                  <input type="datetime-local" required className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    value={careForm.preferred_date} onChange={(e) => setCareForm({ ...careForm, preferred_date: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">상세 요청 사항 (선택)</label>
                  <textarea className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm h-24 resize-none"
                    placeholder="방문 전 연락 필수, 특이사항 등" value={careForm.description}
                    onChange={(e) => setCareForm({ ...careForm, description: e.target.value })} />
                </div>
                <button type="submit" disabled={careSubmitting || !deal}
                  className="w-full bg-[#2a4d69] text-white text-sm font-bold py-3 rounded-lg disabled:opacity-50">
                  {careSubmitting ? "신청 중..." : "케어 서비스 신청하기"}
                </button>
              </form>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-xl text-center space-y-3">
                <span className="text-3xl">✅</span>
                <h4 className="font-bold text-emerald-900 text-sm">신청이 접수되었습니다!</h4>
                <p className="text-xs text-emerald-700">담당 직원이 일정을 확정하여 알림을 보내드립니다.</p>
                <button onClick={() => setCareSuccess(false)} className="text-xs text-emerald-800 underline">추가 신청하기</button>
              </div>
            )}
          </div>
        )}

        {activeTab === "community" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-lg">{deal?.listing?.name ?? "커뮤니티"}</h3>
              <span className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full">입주민 전용</span>
            </div>
            {posts.length === 0 ? (
              <div className="text-center text-sm text-slate-400 py-10">아직 게시글이 없습니다.</div>
            ) : posts.map((post) => (
              <div key={post.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className={`text-xs font-bold ${post.is_notice ? "text-[#2a4d69]" : "text-slate-700"}`}>
                    {post.is_notice ? "📌 공지" : "입주민"}
                  </span>
                  <span className="text-[10px] text-slate-400">{new Date(post.created_at).toLocaleDateString("ko-KR")}</span>
                </div>
                <h4 className="text-sm font-semibold text-slate-900">{post.title}</h4>
                <p className="text-xs text-slate-600 line-clamp-3">{post.body}</p>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 h-16 flex items-center justify-around rounded-t-xl shadow-lg">
        {(["dashboard", "care", "community"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex flex-col items-center justify-center space-y-1 w-1/3 ${activeTab === tab ? "text-[#2a4d69]" : "text-slate-400"}`}>
            <span className="text-lg">{tab === "dashboard" ? "🏠" : tab === "care" ? "🔧" : "💬"}</span>
            <span className="text-[10px] font-medium">{tab === "dashboard" ? "홈" : tab === "care" ? "홈케어" : "커뮤니티"}</span>
          </button>
        ))}
      </footer>
    </div>
  );
}

function PaymentCard({ payment, onUpload, uploading, uploadError, fileInputRef, notes, onNotesChange }: {
  payment: PaymentSchedule; onUpload: (id: string, file: File) => void; uploading: boolean;
  uploadError: string; fileInputRef: React.RefObject<HTMLInputElement | null>; notes: string; onNotesChange: (v: string) => void;
}) {
  const badge = PAYMENT_STATUS_BADGE[payment.status];
  const isPending = payment.status === "PENDING";
  const isOverdue = payment.status === "OVERDUE";
  return (
    <div className={`bg-white border rounded-xl p-5 shadow-sm space-y-4 ${isOverdue ? "border-red-300" : "border-slate-200"}`}>
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-slate-800 text-sm">
          {new Date(payment.due_date).toLocaleDateString("ko-KR", { year: "numeric", month: "long" })} 임대료
        </h3>
        <span className={`text-xs px-2 py-1 rounded-full font-bold ${badge.cls}`}>{badge.label}</span>
      </div>
      <div className="flex justify-between items-baseline py-2 border-b border-dashed border-slate-200">
        <span className="text-xs text-slate-500">납부 마감: {new Date(payment.due_date).toLocaleDateString("ko-KR")}</span>
        <span className="text-xl font-bold text-slate-900">PHP {payment.amount_due.toLocaleString()}</span>
      </div>
      {(isPending || isOverdue) ? (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">인터넷뱅킹 또는 GCash 이체 후 영수증을 업로드해주세요.</p>
          <textarea className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 resize-none h-16"
            placeholder="이체 참고 메모 (선택)" value={notes} onChange={(e) => onNotesChange(e.target.value)} />
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const file = e.target.files?.[0]; if (file) onUpload(payment.id, file); }} />
          {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="w-full bg-[#2a4d69] hover:bg-[#1a2a3a] text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-50 transition-colors">
            {uploading ? "업로드 중..." : "📸 이체 영수증 업로드"}
          </button>
        </div>
      ) : payment.status === "AWAITING_APPROVAL" ? (
        <div className="bg-amber-50 text-amber-800 text-xs p-3 rounded-lg">
          영수증 업로드 완료. CRM 담당자가 검토 중입니다.
          {payment.receipt_image_url && (
            <a href={payment.receipt_image_url} target="_blank" rel="noreferrer" className="block mt-1 text-amber-600 underline">업로드된 영수증 확인 →</a>
          )}
        </div>
      ) : (
        <div className="bg-emerald-50 text-emerald-800 text-xs p-3 rounded-lg flex items-center gap-2">
          ✅ 납부가 확인되었습니다.
          {payment.verified_at && <span className="text-emerald-600">({new Date(payment.verified_at).toLocaleDateString("ko-KR")})</span>}
        </div>
      )}
    </div>
  );
}
