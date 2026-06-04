import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";

export default async function RootPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // service_role 대신 auth_uid 직접 비교로 RLS 우회
  const { data, error } = await supabase
    .from("pms_auth_map")
    .select("role")
    .eq("auth_uid", user!.id)
    .maybeSingle();

  console.log("pms_auth_map result:", data, error);

  if (!data) redirect("/tenant"); // 임시: 데이터 없어도 tenant로 이동

  switch (data.role) {
    case "tenant":   redirect("/tenant");
    case "landlord": redirect("/landlord");
    default:         redirect("/tenant");
  }
}