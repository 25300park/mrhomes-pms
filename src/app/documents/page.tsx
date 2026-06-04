"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase";

type PmsDocument = {
  id: string;
  type: "LISTING_REPORT" | "LOI" | "CONTRACT" | "OTHER";
  title: string;
  html_content: string | null;
  file_url: string | null;
  status: "SENT" | "VIEWED" | "COMMENT_REQUESTED" | "SIGNED" | "REJECTED";
  signed_at: string | null;
  signature_data: string | null;
  comment: string | null;
  sent_at: string;
};

const TYPE_LABEL: Record<string, { label: string; icon: string; cls: string }> = {
  LISTING_REPORT: { label: "매물 리포트", icon: "🏠", cls: "bg-blue-100 text-blue-700" },
  LOI:            { label: "LOI",         icon: "✍️", cls: "bg-purple-100 text-purple-700" },
  CONTRACT:       { label: "계약서",      icon: "📄", cls: "bg-amber-100 text-amber-700" },
  OTHER:          { label: "기타",        icon: "📎", cls: "bg-slate-100 text-slate-500" },
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  SENT:              { label: "미확인",   cls: "bg-blue-100 text-blue-700" },
  VIEWED:            { label: "확인함",   cls: "bg-slate-100 text-slate-600" },
  COMMENT_REQUESTED: { label: "수정요청", cls: "bg-amber-100 text-amber-700" },
  SIGNED:            { label: "서명완료", cls: "bg-emerald-100 text-emerald-700" },
  REJECTED:          { label: "거절",     cls: "bg-red-100 text-red-700" },
};

export default function ProspectivePage() {
  const supabase = createClient();
  // pms_documents는 DB 타입에 없으므로 any로 캐스팅
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [docs, setDocs] = useState<PmsDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("고객");
  const [selectedDoc, setSelectedDoc] = useState<PmsDocument | null>(null);
  const [view, setView] = useState<"list" | "detail" | "sign">("list");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);

  useEffect(() => { loadData(); }, []);

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

    const { data: docsRaw } = await db
      .from("pms_documents")
      .select("*")
      .eq("contact_id", authMap.contact_id)
      .order("sent_at", { ascending: false });
    if (docsRaw) setDocs(docsRaw as PmsDocument[]);
    setLoading(false);
  }

  async function openDoc(doc: PmsDocument) {
    setSelectedDoc(doc);
    setView("detail");
    setComment(doc.comment || "");
    setHasSigned(false);
    if (doc.status === "SENT") {
      await db.from("pms_documents").update({ status: "VIEWED" }).eq("id", doc.id);
      setDocs((prev) => prev.map((d) => d.id === doc.id ? { ...d, status: "VIEWED" as const } : d));
    }
  }

  async function submitComment() {
    if (!selectedDoc || !comment.trim()) return;
    setSubmitting(true);
    try {
      await db.from("pms_documents")
        .update({ status: "COMMENT_REQUESTED", comment })
        .eq("id", selectedDoc.id);
      setDocs((prev) => prev.map((d) => d.id === selectedDoc.id ? { ...d, status: "COMMENT_REQUESTED" as const, comment } : d));
      setSelectedDoc((prev) => prev ? { ...prev, status: "COMMENT_REQUESTED" as const, comment } : prev);
      alert("수정 요청이 전달되었습니다.");
    } finally { setSubmitting(false); }
  }

  async function submitSignature() {
    if (!selectedDoc || !canvasRef.current || !hasSigned) return;
    setSubmitting(true);
    try {
      const signatureData = canvasRef.current.toDataURL("image/png");
      await db.from("pms_documents")
        .update({ status: "SIGNED", signature_data: signatureData, signed_at: new Date().toISOString() })
        .eq("id", selectedDoc.id);
      setDocs((prev) => prev.map((d) => d.id === selectedDoc.id ? { ...d, status: "SIGNED" as const } : d));
      setSelectedDoc((prev) => prev ? { ...prev, status: "SIGNED" as const } : prev);
      setView("detail");
      alert("서명이 완료되었습니다! 담당자가 확인 후 연락드립니다.");
    } finally { setSubmitting(false); }
  }

  type DrawEvent = React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>;

  function getPos(e: DrawEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }

  function startDraw(e: DrawEvent) {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    e.preventDefault();
    const pos = getPos(e, canvas);
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true); setHasSigned(true);
  }

  function draw(e: DrawEvent) {
    if (!isDrawing) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    e.preventDefault();
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1a2a3a"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.stroke();
  }

  function endDraw() { setIsDrawing(false); }

  function clearCanvas() {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
  }

  if (loading) return (
    <div className="max-w-md mx-auto min-h-screen flex items-center justify-center">
      <p className="text-slate-400 text-sm">불러오는 중...</p>
    </div>
  );

  // ── 서명 화면 ──
  if (view === "sign" && selectedDoc) return (
    <div className="max-w-md mx-auto bg-white min-h-screen flex flex-col font-sans">
      <header className="bg-[#1a2a3a] text-white px-6 py-4">
        <button onClick={() => setView("detail")} className="text-xs text-slate-400 mb-2 block">← 돌아가기</button>
        <h1 className="text-lg font-bold">전자서명</h1>
        <p className="text-xs text-slate-300 mt-1">{selectedDoc.title}</p>
      </header>
      <main className="flex-1 p-5 space-y-4">
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
          <p className="text-xs text-amber-800 font-bold">서명 전 확인사항</p>
          <p className="text-xs text-amber-700 mt-1">위 문서 내용을 충분히 검토하셨습니까? 서명 후에는 취소할 수 없습니다.</p>
        </div>
        <div className="bg-white border-2 border-slate-300 rounded-xl overflow-hidden">
          <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
            <span className="text-xs text-slate-500 font-bold">아래 공간에 서명해 주세요</span>
            <button onClick={clearCanvas} className="text-xs text-slate-400 underline">지우기</button>
          </div>
          <canvas
            ref={canvasRef} width={380} height={180}
            className="w-full touch-none cursor-crosshair"
            onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
            onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
          />
        </div>
        <p className="text-[10px] text-slate-400 text-center">서명은 본인의 자필 서명과 동일한 법적 효력을 가질 수 있습니다.</p>
        <button onClick={submitSignature} disabled={!hasSigned || submitting}
          className="w-full bg-[#2a4d69] text-white font-bold py-3 rounded-xl disabled:opacity-40">
          {submitting ? "처리 중..." : "✅ 서명 완료 및 제출"}
        </button>
      </main>
    </div>
  );

  // ── 문서 상세 화면 ──
  if (view === "detail" && selectedDoc) {
    const statusInfo = STATUS_LABEL[selectedDoc.status] ?? { label: selectedDoc.status, cls: "bg-slate-100 text-slate-500" };
    const isSigned = selectedDoc.status === "SIGNED";
    const isLoi = selectedDoc.type === "LOI";
    return (
      <div className="max-w-md mx-auto bg-white min-h-screen flex flex-col font-sans">
        <header className="bg-[#1a2a3a] text-white px-6 py-4">
          <button onClick={() => setView("list")} className="text-xs text-slate-400 mb-2 block">← 문서함</button>
          <div className="flex justify-between items-start">
            <h1 className="text-base font-bold leading-tight">{selectedDoc.title}</h1>
            <span className={`text-[10px] font-bold px-2 py-1 rounded-full ml-2 flex-shrink-0 ${statusInfo.cls}`}>{statusInfo.label}</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">{new Date(selectedDoc.sent_at).toLocaleDateString("ko-KR")} 수신</p>
        </header>
        <main className="flex-1 overflow-y-auto">
          {selectedDoc.html_content && (
            <div className="p-5 border-b border-slate-100">
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: selectedDoc.html_content }}
                onClick={(e) => {
                  const card = (e.target as HTMLElement).closest("[data-rbs-url]") as HTMLElement | null;
                  if (card) {
                    const url = card.getAttribute("data-rbs-url");
                    if (url) window.open(url, "_blank");
                  }
                }}
                style={{ cursor: "default" }}
              />
              {selectedDoc.type === "LISTING_REPORT" && (
                <p className="text-[10px] text-slate-400 mt-3 text-center">
                  Tap a listing card to view details on rbs-homes.com
                </p>
              )}
            </div>
          )}
          {isLoi && !isSigned && (
            <div className="p-5 space-y-4">
              <div className="border-t border-slate-100 pt-4">
                <h3 className="text-sm font-bold text-slate-700 mb-3">의견 또는 수정 요청</h3>
                <textarea className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm resize-none h-24"
                  placeholder="수정이 필요한 내용을 입력해주세요..."
                  value={comment} onChange={(e) => setComment(e.target.value)} />
                <button onClick={submitComment} disabled={!comment.trim() || submitting}
                  className="w-full mt-2 bg-amber-500 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-40">
                  {submitting ? "전송 중..." : "💬 수정 요청 전달"}
                </button>
              </div>
              <div className="border-t border-slate-100 pt-4">
                <button onClick={() => setView("sign")} className="w-full bg-[#2a4d69] text-white font-bold py-3 rounded-xl">
                  ✍️ 전자서명 진행
                </button>
                <p className="text-[10px] text-slate-400 text-center mt-2">내용에 동의하시면 전자서명으로 의사를 표시해 주세요.</p>
              </div>
            </div>
          )}
          {isSigned && (
            <div className="p-5">
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl text-center">
                <p className="text-2xl mb-2">✅</p>
                <p className="text-sm font-bold text-emerald-800">서명이 완료되었습니다</p>
                {selectedDoc.signed_at && (
                  <p className="text-xs text-emerald-600 mt-1">{new Date(selectedDoc.signed_at).toLocaleString("ko-KR")}</p>
                )}
              </div>
            </div>
          )}
          {selectedDoc.type === "LISTING_REPORT" && (
            <div className="p-5 border-t border-slate-100">
              <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-4 rounded-xl space-y-2">
                <p className="text-xs font-bold">더 많은 매물을 보고 싶으신가요?</p>
                <p className="text-[10px] text-indigo-200">BGC 전역의 프리미엄 매물을 직접 검색해보세요.</p>
                <a href={process.env.NEXT_PUBLIC_RBS_HOMES_URL ?? "https://rbs-homes.com"} target="_blank" rel="noreferrer"
                  className="inline-block text-xs bg-white text-indigo-900 font-bold px-3 py-1.5 rounded-lg">
                  rbs-homes.com 방문하기 →
                </a>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ── 문서함 목록 ──
  const unreadCount = docs.filter((d) => d.status === "SENT").length;
  return (
    <div className="max-w-md mx-auto bg-white min-h-screen flex flex-col font-sans">
      <header className="bg-[#1a2a3a] text-white px-6 py-6 rounded-b-2xl shadow-md">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs bg-[#2a4d69] px-2 py-1 rounded-full text-blue-200">mrhomes</span>
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              {unreadCount}건 미확인
            </span>
          )}
        </div>
        <h1 className="text-xl font-bold">안녕하세요, {userName}님!</h1>
        <p className="text-xs text-slate-300 mt-1">담당자가 공유한 문서를 확인하세요.</p>
      </header>
      <main className="flex-1 p-5 space-y-4 overflow-y-auto">
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-4 rounded-xl space-y-2">
          <span className="text-[10px] bg-indigo-600 px-2 py-0.5 rounded-full font-semibold">매물 검색</span>
          <h4 className="font-bold text-sm">BGC 프리미엄 매물 보기</h4>
          <p className="text-xs text-indigo-200">rbs-homes.com에서 다양한 매물을 직접 검색해보세요.</p>
          <a href={process.env.NEXT_PUBLIC_RBS_HOMES_URL ?? "https://rbs-homes.com"} target="_blank" rel="noreferrer"
            className="inline-block text-xs bg-white text-indigo-900 font-bold px-3 py-1.5 rounded-lg">
            매물 검색하기 →
          </a>
        </div>
        <div>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
            📁 내 문서함 ({docs.length}건)
          </h3>
          {docs.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <p className="text-3xl">📭</p>
              <p className="text-slate-500 text-sm">아직 공유된 문서가 없습니다.</p>
              <p className="text-xs text-slate-400">담당자가 매물 리포트나 LOI를 공유하면 여기에 표시됩니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {docs.map((doc) => {
                const typeInfo = TYPE_LABEL[doc.type] ?? { label: doc.type, icon: "📎", cls: "bg-slate-100 text-slate-500" };
                const statusInfo = STATUS_LABEL[doc.status] ?? { label: doc.status, cls: "bg-slate-100 text-slate-500" };
                const isUnread = doc.status === "SENT";
                return (
                  <div key={doc.id} onClick={() => openDoc(doc)}
                    className={`bg-white border rounded-xl p-4 cursor-pointer hover:border-[#2a4d69] transition-colors ${isUnread ? "border-blue-300 bg-blue-50" : "border-slate-200"}`}>
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{typeInfo.icon}</span>
                        <div>
                          <p className={`text-sm font-bold ${isUnread ? "text-blue-800" : "text-slate-800"}`}>{doc.title}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{new Date(doc.sent_at).toLocaleDateString("ko-KR")}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${typeInfo.cls}`}>{typeInfo.label}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusInfo.cls}`}>{statusInfo.label}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
