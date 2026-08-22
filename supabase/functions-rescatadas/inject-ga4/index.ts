// ⚠️ RESCATADA del panel de Supabase el 20/08/2026 — ver ../README.md
// ✅ Sin secretos en claro. Copia FIEL del original, sin tocar una línea. El fallback
//    `SUPABASE_URL ?? 'https://wswbeh…'` es la URL pública del proyecto, no una credencial,
//    y la clave cae a `''` (falla la llamada, no deja nada usable en el repo).
// 📌 Hermana de `push-route-ga4`: opera sobre el mismo invento, la landing guardada como
//    ~31 filas gzip+base64 en la tabla `_deploy_assets`. Aquí la DESCOMPRIME, le mete el
//    snippet de GA4 (G-N5CMQL9C4M) antes de `</head>`, la recomprime y REESCRIBE las filas.
// ⚠️ `verify_jwt=false` + BORRA e INSERTA filas (`DELETE ?key=like.html_chunk_*` y luego
//    POST): cualquiera con la URL puede dispararlo. Es idempotente (si ya está GA4 sale),
//    pero entre el DELETE y el INSERT la landing se queda sin contenido — y si el INSERT
//    falla, se queda así. Cuarto endpoint de escritura sin autenticar del panel.
// 📌 Candidata a borrar junto con `push-route-ga4` y el repo `house-sevillana-landing`.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const U = Deno.env.get('SUPABASE_URL') ?? 'https://wswbehlcuxqxyinousql.supabase.co';
const K = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GA = `<!-- Google tag (gtag.js) -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=G-N5CMQL9C4M"></script>\n<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-N5CMQL9C4M');</script>`;

async function sbFetch(path: string, opts: RequestInit = {}) {
  return fetch(`${U}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: K,
      Authorization: `Bearer ${K}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
      ...((opts.headers as Record<string,string>) ?? {}),
    },
  });
}

Deno.serve(async (_req: Request) => {
  try {
    if (!K) return new Response(JSON.stringify({ error: 'SERVICE_ROLE_KEY not set', key_len: K.length }), { status: 500 });

    // Read chunks
    const r = await sbFetch('_deploy_assets?key=like.html_chunk_*&select=key,value&order=key');
    const rows: { key: string; value: string }[] = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) return new Response(JSON.stringify({ error: 'no rows', raw: rows }), { status: 500 });

    rows.sort((a, b) => a.key.localeCompare(b.key));
    const b64 = rows.map(x => x.value).join('');
    const gzipBytes = Uint8Array.from(atob(b64), x => x.charCodeAt(0));

    const ds = new DecompressionStream('gzip');
    const w = ds.writable.getWriter();
    w.write(gzipBytes); w.close();
    const html = await new Response(ds.readable).text();

    if (html.includes('G-N5CMQL9C4M')) {
      return new Response(JSON.stringify({ ok: true, msg: 'GA4 already present, skipped' }));
    }

    const newHtml = html.replace('</head>', `${GA}\n</head>`);

    const cs = new CompressionStream('gzip');
    const w2 = cs.writable.getWriter();
    w2.write(new TextEncoder().encode(newHtml)); w2.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    const compressed = new Uint8Array(buf);

    let newB64 = '';
    const STEP = 3000;
    for (let i = 0; i < compressed.length; i += STEP) {
      newB64 += btoa(String.fromCharCode(...compressed.slice(i, Math.min(i + STEP, compressed.length))));
    }

    const newChunks: { key: string; value: string }[] = [];
    const CSIZE = 4000;
    for (let i = 0; i < newB64.length; i += CSIZE) {
      newChunks.push({ key: `html_chunk_${String(newChunks.length).padStart(2, '0')}`, value: newB64.slice(i, i + CSIZE) });
    }

    // Delete old
    const delRes = await sbFetch('_deploy_assets?key=like.html_chunk_*', { method: 'DELETE' });
    if (!delRes.ok) return new Response(JSON.stringify({ error: `delete ${delRes.status}: ${await delRes.text()}` }), { status: 500 });

    // Insert new
    const insRes = await sbFetch('_deploy_assets', {
      method: 'POST',
      body: JSON.stringify(newChunks),
      headers: { Prefer: 'return=minimal' },
    });
    if (!insRes.ok) return new Response(JSON.stringify({ error: `insert ${insRes.status}: ${await insRes.text()}` }), { status: 500 });

    return new Response(JSON.stringify({
      ok: true,
      msg: `GA4 injected OK. ${rows.length} old chunks -> ${newChunks.length} new chunks`,
      ga_pos: newHtml.indexOf('G-N5CMQL9C4M'),
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), stack: (e as Error).stack }), { status: 500 });
  }
});
