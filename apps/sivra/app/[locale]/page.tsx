import { redirect } from "next/navigation";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocalePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  // This page should not be reached from housesevillana.vercel.app
  // (middleware redirects to /dashboard)
  // Redirect to dashboard as fallback
  redirect("/dashboard");
}
