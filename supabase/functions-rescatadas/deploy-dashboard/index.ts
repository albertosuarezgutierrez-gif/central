// ⚠️ RESCATADA del panel de Supabase el 20/08/2026 — ver ../README.md
// ✅ Sin secretos en claro. Copia FIEL del original, sin tocar una línea.
// ⚠️ PERO: recibe el token de GitHub por **query string** (`?t=…`). Una credencial en la
//    URL queda escrita en los logs de Supabase, en los del proxy y en el historial del
//    navegador — sitios que nadie considera secretos. Si esta función se conserva, el
//    token debe ir en cabecera o en el entorno, nunca en la URL. Y `verify_jwt=false`.
// 📌 Parche de una tarde: commitea a `roi-intranet` cuatro rutas concretas con un mensaje
//    de commit fijo, leyendo el contenido de la tabla `_deploy_queue`. Candidata a borrar.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const OWNER = "albertosuarezgutierrez-gif";
const REPO = "roi-intranet";
const BRANCH = "main";
const PATHS = [
  "app/api/dashboard/route.ts",
  "app/api/expenses/route.ts",
  "app/(dashboard)/dashboard/page.tsx",
  "app/(dashboard)/expenses/page.tsx",
];
const COMMIT_MESSAGE = "feat(expenses): add expense tracking with /expenses CRUD page and dashboard breakdown";

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("t");
    if (!token) {
      return new Response(JSON.stringify({ error: "missing token" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: rows, error: dbErr } = await supabase
      .from("_deploy_queue")
      .select("path, content")
      .in("path", PATHS);

    if (dbErr) {
      return new Response(JSON.stringify({ error: "db error", details: dbErr.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
    if (!rows || rows.length !== PATHS.length) {
      return new Response(JSON.stringify({
        error: "missing files",
        expected: PATHS.length,
        got: rows?.length ?? 0,
        found: rows?.map((r: { path: string }) => r.path) ?? [],
      }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const gh = async (path: string, init?: RequestInit) => {
      const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}${path}`, {
        ...init,
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "deploy-dashboard",
          ...(init?.headers || {}),
        },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`GitHub ${res.status} on ${path}: ${text.slice(0, 500)}`);
      }
      return res.json();
    };

    // 1. Get ref
    const ref = await gh(`/git/refs/heads/${BRANCH}`);
    const baseSha = ref.object.sha;

    // 2. Get commit
    const baseCommit = await gh(`/git/commits/${baseSha}`);
    const baseTreeSha = baseCommit.tree.sha;

    // 3. Create blobs
    const blobs = [];
    for (const row of rows) {
      const blob = await gh(`/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: row.content, encoding: "base64" }),
      });
      blobs.push({ path: row.path, sha: blob.sha });
    }

    // 4. Create tree
    const tree = await gh(`/git/trees`, {
      method: "POST",
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: blobs.map((b) => ({
          path: b.path,
          mode: "100644",
          type: "blob",
          sha: b.sha,
        })),
      }),
    });

    // 5. Create commit
    const commit = await gh(`/git/commits`, {
      method: "POST",
      body: JSON.stringify({
        message: COMMIT_MESSAGE,
        tree: tree.sha,
        parents: [baseSha],
      }),
    });

    // 6. Update ref
    await gh(`/git/refs/heads/${BRANCH}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha }),
    });

    return new Response(JSON.stringify({
      success: true,
      commit: commit.sha,
      paths: PATHS,
      message: COMMIT_MESSAGE,
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({
      error: "exception",
      message: e instanceof Error ? e.message : String(e),
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
