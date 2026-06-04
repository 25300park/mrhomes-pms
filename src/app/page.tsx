import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";

export default async function RootPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // pms_auth_map에서 역할 확인
  const { data } = await supabase
    .from("pms_auth_map")
    .select("role")
    .eq("auth_uid", user!.id)
    .maybeSingle();

  const authMap = data as { role: string } | null;

  if (!authMap) redirect("/tenant");

  switch (authMap.role) {
    case "tenant":      redirect("/tenant");
    case "landlord":    redirect("/landlord");
    case "prospective": redirect("/documents");
    case "admin":
    case "agent":
      redirect(process.env.NEXT_PUBLIC_CRM_URL ?? "/login");
    default:
      redirect("/documents");
  }
}
