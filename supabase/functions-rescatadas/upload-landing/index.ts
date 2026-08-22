// ⚠️ RESCATADA del panel de Supabase el 20/08/2026 — ver ../README.md
// 🔑 SECRETO SUSTITUIDO: llevaba el PAT `ghp_97Ct…` en claro. Reemplazado por
//    Deno.env.get('GITHUB_TOKEN').
//
// 🚨🚨 ESTO NO ES SOLO UNA FUGA — ES UN ENDPOINT DE ESCRITURA SIN AUTENTICAR.
//    Combina tres cosas: `verify_jwt = false` (cualquiera la puede llamar), acepta
//    `{ path, content, message }` ARBITRARIOS del cuerpo de la petición, y commitea lo
//    que le manden a `main` de `roi-intranet` con el token incrustado. Es decir:
//    **quien conozca la URL puede escribir cualquier fichero en el repo.** Sin login,
//    sin traza de autoría, directo a la rama principal.
//    Prioridad de borrado: la primera. No hay arreglo que la haga aceptable tal cual;
//    si el flujo hace falta, va con auth y con una lista blanca de rutas.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN")!;
const REPO = 'albertosuarezgutierrez-gif/roi-intranet';

async function upsertFile(path: string, content: string, message: string) {
  const apiUrl = `https://api.github.com/repos/${REPO}/contents/${path}`;
  const headers = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  let sha: string | undefined;
  const get = await fetch(apiUrl, { headers });
  if (get.ok) { const j = await get.json(); sha = j.sha; }
  const body: Record<string,string> = { message, content, branch: 'main' };
  if (sha) body.sha = sha;
  const put = await fetch(apiUrl, { method:'PUT', headers, body: JSON.stringify(body) });
  const res = await put.json();
  return { status: put.status, ok: put.ok, path, sha: res?.content?.sha };
}

Deno.serve(async (req: Request) => {
  const { path, content, message } = await req.json();
  const result = await upsertFile(path, content, message || `Deploy: ${path}`);
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
});
