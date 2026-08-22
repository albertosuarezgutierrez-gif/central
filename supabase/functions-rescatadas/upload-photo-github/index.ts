// ⚠️ RESCATADA del panel de Supabase el 20/08/2026 — ver ../README.md
// 🔑 SECRETO SUSTITUIDO: llevaba el PAT `ghp_97Ct…` en claro → Deno.env.get('GITHUB_TOKEN').
//
// 🚨 SEGUNDO ENDPOINT DE ESCRITURA SIN AUTENTICAR (el otro es `upload-landing`).
//    `verify_jwt = false` + `{ filename, content }` del cuerpo + token incrustado:
//    cualquiera que conozca la URL escribe ficheros en `roi-intranet`. Aquí la ruta va
//    prefijada con `public/fotos/`, lo que acota el destino pero no la autoriza — y
//    `filename` no se sanea, así que conviene no dar por hecho que el prefijo aguanta.
//    Borrar o poner detrás de auth.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN")!;
const REPO = 'albertosuarezgutierrez-gif/roi-intranet';
const BRANCH = 'main';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { filename, content } = await req.json();
    if (!filename || !content) {
      return new Response(JSON.stringify({ error: 'filename and content required' }), { status: 400 });
    }

    const path = `public/fotos/${filename}`;
    const apiUrl = `https://api.github.com/repos/${REPO}/contents/${path}`;

    // Check if file exists to get SHA (needed for update)
    let sha: string | undefined;
    const getRes = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      }
    });
    if (getRes.ok) {
      const existing = await getRes.json();
      sha = existing.sha;
    }

    const body: Record<string, string> = {
      message: `Add photo: ${filename}`,
      content: content,
      branch: BRANCH,
    };
    if (sha) body.sha = sha;

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(body),
    });

    const result = await putRes.json();

    if (putRes.ok) {
      return new Response(JSON.stringify({ ok: true, file: filename, status: putRes.status }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({ ok: false, error: result, status: putRes.status }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
