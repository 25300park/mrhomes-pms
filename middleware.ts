import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

const PUBLIC_PATHS = ["/login"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // pms_auth_map에서 역할 확인
  const { data } = await supabase
    .from("pms_auth_map")
    .select("role")
    .eq("auth_uid", user.id)
    .single();

  const role = (data as { role: string } | null)?.role;

  if (pathname.startsWith("/landlord") && role === "tenant") {
    return NextResponse.redirect(new URL("/tenant", request.url));
  }
  if (pathname.startsWith("/tenant") && role === "landlord") {
    return NextResponse.redirect(new URL("/landlord", request.url));
  }
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
