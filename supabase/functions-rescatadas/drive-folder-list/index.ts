// ⚠️ RESCATADA del panel de Supabase el 20/08/2026 — ver ../README.md
// ✅ Sin secretos. Copia FIEL del original, sin tocar una línea.
// 📌 Sonda de una tarde: raspa la vista pública `embeddedfolderview` de una carpeta de
//    Drive y devuelve los IDs de los ficheros. No autentica contra Google — solo funciona
//    si la carpeta está compartida «con cualquiera con el enlace», así que el FOLDER_ID
//    no es una credencial: es el identificador de algo que ya es público.
//    `verify_jwt=false`, pero no escribe nada y no gasta cuota de nadie. Candidata a borrar
//    (fue el paso previo a `drive-photos-publish`, que ya tiene los IDs incrustados).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const FOLDER_ID = "154gYlyzi7yqDaYAArferoWlVReOF4FW1";

Deno.serve(async () => {
  try {
    const url = `https://drive.google.com/embeddedfolderview?id=${FOLDER_ID}#list`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; HouseSevillanaBot/1.0)",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    const html = await res.text();

    // Parse the embedded folder view HTML.
    // Pattern: anchors to /file/d/<id>/view followed by a div with the filename.
    const items: { id: string; name: string }[] = [];
    const re = /<a[^>]+href="https:\/\/drive\.google\.com\/file\/d\/([^\/"]+)\/view[^"]*"[^>]*>[\s\S]*?<div class="flip-entry-title">([^<]+)<\/div>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      items.push({ id: m[1], name: m[2].trim() });
    }

    // Fallback: simpler pattern
    if (items.length === 0) {
      const re2 = /\/file\/d\/([^\/]+)\/view/g;
      const ids = new Set<string>();
      let m2: RegExpExecArray | null;
      while ((m2 = re2.exec(html)) !== null) ids.add(m2[1]);
      ids.forEach((id) => items.push({ id, name: "(unknown)" }));
    }

    return new Response(JSON.stringify({
      folderId: FOLDER_ID,
      url,
      status: res.status,
      htmlLength: html.length,
      htmlSample: html.slice(0, 1500),
      count: items.length,
      items,
    }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    const err = e as Error;
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
