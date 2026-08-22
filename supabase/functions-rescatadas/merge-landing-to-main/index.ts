// ⚠️ RESCATADA del panel de Supabase el 20/08/2026 — ver ../README.md
// 🔑 SECRETO SUSTITUIDO: el original llevaba un PAT de GitHub (`ghp_…`) en claro,
//    en GITHUB_TOKEN. Reemplazado por Deno.env.get('GITHUB_TOKEN').
// 📌 Función de un solo uso: restaura un `middleware.ts` concreto en el repo
//    `roi-intranet`. No es un servicio, es un parche de una tarde que se quedó
//    desplegado. Candidata clara a borrarse una vez confirmado que no la llama nadie.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN")!;
const REPO = 'albertosuarezgutierrez-gif/roi-intranet';
const hdr = {
  'Authorization': `Bearer ${GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
};

Deno.serve(async (_req: Request) => {
  // Get current middleware sha
  const cur = await fetch(`https://api.github.com/repos/${REPO}/contents/middleware.ts?ref=main`, { headers: hdr }).then(r=>r.json());
  const currentSha = cur.sha;

  // This is the EXACT working middleware from commit c63fdac0, unchanged
  const workingMiddleware = `import { auth } from "@/lib/auth";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { routing } from "@/i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

const PUBLIC_PREFIXES = [
  "/login",
  "/api/",
  "/sitemap.xml",
  "/robots.txt",
  "/og/",
  "/images/",
  "/fonts/",
];

const LOCALE_PREFIXES = ["/es", "/en", "/fr", "/de", "/it"];

function isLocalePath(pathname: string) {
  return LOCALE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isPublicPath(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (isLocalePath(pathname)) {
    return intlMiddleware(request);
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL("/es", request.url));
  }

  const session = await auth();
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\\\.png$).*)"],
};
`;

  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/middleware.ts`, {
    method: 'PUT',
    headers: hdr,
    body: JSON.stringify({
      message: 'fix: restore working middleware (next-intl + NextAuth v5 auth())',
      content: btoa(unescape(encodeURIComponent(workingMiddleware))),
      sha: currentSha,
      branch: 'main',
    }),
  });
  const d = await res.json();
  return new Response(JSON.stringify({
    ok: res.ok, status: res.status,
    commit: (d?.commit?.sha as string)?.slice(0,8),
    msg: d?.commit?.message ?? d?.message,
  }), { headers: { 'Content-Type': 'application/json' } });
});
