// ⚠️ RESCATADA del panel de Supabase el 20/08/2026 — ver ../README.md
// 🔑 SECRETO SUSTITUIDO: el original llevaba un PAT de GitHub (`ghp_…`) en claro,
//    en la constante TOKEN. Se ha reemplazado por Deno.env.get('GITHUB_TOKEN').
//    La función DESPLEGADA sigue con el token incrustado hasta que se redespliegue.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const OWNER = "albertosuarezgutierrez-gif";
const REPO  = "roi-intranet";
const BRANCH = "main";
const TOKEN = Deno.env.get("GITHUB_TOKEN")!;

async function gh(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${TOKEN}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`GitHub ${method} ${path}: ${res.status} - ${JSON.stringify(data)}`);
  return data;
}

Deno.serve(async (_req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: files, error } = await supabase
      .from("_deploy_queue")
      .select("path, content");

    if (error) throw new Error(`DB error: ${error.message}`);
    if (!files || files.length === 0) throw new Error("No files in _deploy_queue");

    // Get current HEAD
    const refData = await gh(`/git/refs/heads/${BRANCH}`);
    const headSha: string = refData.object.sha;
    const commitData = await gh(`/git/commits/${headSha}`);
    const baseTreeSha: string = commitData.tree.sha;

    // Build tree
    const treeItems = files.map((f: {path: string; content: string}) => ({
      path: f.path,
      mode: "100644",
      type: "blob",
      content: atob(f.content),
    }));

    const newTree = await gh("/git/trees", "POST", { base_tree: baseTreeSha, tree: treeItems });
    const newCommit = await gh("/git/commits", "POST", {
      message: "feat: income filters + /updates page + smoobu daily sync",
      tree: newTree.sha,
      parents: [headSha],
    });
    await gh(`/git/refs/heads/${BRANCH}`, "PATCH", { sha: newCommit.sha, force: false });

    return new Response(JSON.stringify({
      success: true,
      commitSha: newCommit.sha,
      files: files.map((f: {path: string}) => f.path),
    }), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
