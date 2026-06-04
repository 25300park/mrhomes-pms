"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError("이메일 또는 비밀번호를 확인해주세요.");
      setLoading(false);
      return;
    }

    // 루트로 이동하면 page.tsx가 역할에 맞게 리다이렉트
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#1a2a3a] flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* 로고 헤더 */}
        <div className="bg-[#1a2a3a] px-8 py-8 text-center">
          <h1 className="text-2xl font-bold text-white tracking-tight">mrhomes</h1>
          <p className="text-xs text-slate-400 mt-1">Property Management System</p>
        </div>

        {/* 로그인 폼 */}
        <form onSubmit={handleLogin} className="px-8 py-8 space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">
              이메일
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2a4d69] transition"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">
              비밀번호
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2a4d69] transition"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#2a4d69] hover:bg-[#1a2a3a] text-white font-bold py-3 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>

          <p className="text-center text-xs text-slate-400 pt-2">
            계정 문의:{" "}
            <a
              href="mailto:admin@mrhomes.ph"
              className="text-[#2a4d69] underline"
            >
              admin@mrhomes.ph
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
