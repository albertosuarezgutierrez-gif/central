// ⚠️ RESCATADA del panel de Supabase el 20/08/2026 — ver ../README.md
// 🔑 SECRETO SUSTITUIDO: llevaba el PAT `ghp_97Ct…` en claro. Reemplazado por
//    Deno.env.get('GITHUB_TOKEN').
// ✂️ PAYLOAD ELIDIDO — única función del rescate que NO es copia literal: el original
//    incrustaba, en una constante `CONTENT_B64` de ~11 KB, el `app/[locale]/page.tsx`
//    ENTERO de la landing en base64, para sobrescribirlo de un golpe. Ese contenido ya
//    vive versionado en el repo destino, así que conservar el blob aquí no aporta nada y
//    solo estorba a la lectura. Lo que importa —qué hace y con qué credencial— sí está.
//    El original íntegro sigue en el panel de Supabase mientras la función exista.
// 📌 Parche de una tarde («fix: clean page.tsx - anchor nav links, fix encoding, Smoobu
//    motor»). `verify_jwt=false`, pero a diferencia de `upload-landing` la ruta y el
//    contenido son fijos: no acepta nada del que llama. Candidata a borrar.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const TOKEN = Deno.env.get("GITHUB_TOKEN")!;
const REPO = 'albertosuarezgutierrez-gif/roi-intranet';

// El original traía aquí el page.tsx completo en base64 (~11 KB). Ver nota de cabecera.
const CONTENT_B64 = Deno.env.get("PAGE_TSX_B64") ?? '';

async function getFileSha(path: string): Promise<string|null> {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${encodeURIComponent(path)}`, {
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j.sha || null;
}

async function putFile(path: string, b64: string, sha: string) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${encodeURIComponent(path)}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: JSON.stringify({ message: 'fix: clean page.tsx - anchor nav links, fix encoding, Smoobu motor', content: b64, sha, branch: 'main' }),
  });
  const j = await r.json();
  return { status: r.status, sha: j?.content?.sha?.slice(0,8), commit: j?.commit?.sha?.slice(0,8) };
}

Deno.serve(async (_req: Request) => {
  const sha = await getFileSha('app/[locale]/page.tsx');
  if (!sha) return new Response(JSON.stringify({ error: 'sha not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  const result = await putFile('app/[locale]/page.tsx', CONTENT_B64, sha);
  return new Response(JSON.stringify({ ok: result.status === 200 || result.status === 201, ...result }), { headers: { 'Content-Type': 'application/json' } });
});
