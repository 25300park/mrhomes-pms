// ============================================================
// mrhomes PMS — lib/supabase.ts
// Supabase 클라이언트 (브라우저 + 서버 공용)
// ============================================================
import { createBrowserClient } from '@supabase/ssr'
import { type Database } from '@/types/database.types'

// 환경변수 — .env.local 에 설정
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// 브라우저 클라이언트 (Client Components에서 사용)
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY)
}

// ── 서버 컴포넌트용 클라이언트 ───────────────────────────────
// app/lib/supabase-server.ts 에 별도 분리 권장
// import { createServerClient } from '@supabase/ssr'
// import { cookies } from 'next/headers'
// export function createServerClient() { ... }
