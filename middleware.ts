// middleware.ts
// 인증 보호 + 역할별 라우팅 가드
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";

const PUBLIC_PATHS = ["/login"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 공개 경로는 통과
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 세션 확인 (토큰 자동 갱신 포함)
  const { data: { user } } = await supabase.auth.getUser();

  // 미인증 → 로그인 페이지
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 역할 확인
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role;

  // 역할별 경로 접근 제한
  // tenant가 /landlord 접근 시 → /tenant 로
  if (pathname.startsWith("/landlord") && role === "tenant") {
    return NextResponse.redirect(new URL("/tenant", request.url));
  }
  // landlord가 /tenant 접근 시 → /landlord 로
  if (pathname.startsWith("/tenant") && role === "landlord") {
    return NextResponse.redirect(new URL("/landlord", request.url));
  }
  // admin/agent가 PMS 접근 시 → CRM으로
  if (
    (pathname.startsWith("/tenant") || pathname.startsWith("/landlord")) &&
    (role === "admin" || role === "agent")
  ) {
    return NextResponse.redirect(
      new URL(process.env.NEXT_PUBLIC_CRM_URL ?? "/login", request.url)
    );
  }

  return response;
}

export const config = {
  matcher: [
    // 정적 파일 및 API routes 제외
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
