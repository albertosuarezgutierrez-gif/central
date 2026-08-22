// ⚠️ RESCATADA del panel de Supabase el 20/08/2026 — ver ../README.md
// ✅ Sin secretos en claro. Copia FIEL del original, sin tocar una línea.
// ✅ `verify_jwt = TRUE` — la segunda (y última) del lote que exige clave, con `junta-pdf-texto`.
// 📌 Migración de una tarde para `apps/almacen` (cliente Joaquín Jaén): las fotos del
//    catálogo apuntaban al dominio del proveedor (`plataformacateringjoaquinjaen.com`);
//    esto las baja, las sube al bucket `catalogo` y reescribe `almacen_materiales.imagen_url`.
//    Trabaja por lotes (`?limit=`, tope 80) y devuelve `remaining` para reencadenar.
// ⚠️ Lleva la `cuenta_id` del tenant de Joaquín incrustada: no es un secreto, pero sí
//    la ata a ESE cliente. Si el rehosting ya terminó (`remaining = 0`), borrar.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CUENTA = "0de50000-0000-4000-a000-000000000001";
const BUCKET = "catalogo";
const SRC_PREFIX = "https://plataformacateringjoaquinjaen.com/";

const extFromType = (t: string): string => {
  if (t.includes("png")) return "png";
  if (t.includes("webp")) return "webp";
  if (t.includes("gif")) return "gif";
  if (t.includes("svg")) return "svg";
  return "jpg";
};

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "40", 10), 80);

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: rows, error: qErr } = await supa
    .from("almacen_materiales")
    .select("id, imagen_url")
    .eq("cuenta_id", CUENTA)
    .like("imagen_url", SRC_PREFIX + "%")
    .limit(limit);

  if (qErr) {
    return new Response(JSON.stringify({ error: qErr.message }), { status: 500 });
  }

  let updated = 0;
  const errors: { id: string; err: string }[] = [];

  for (const row of rows ?? []) {
    try {
      const resp = await fetch(row.imagen_url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; almacen-rehost/1.0)" },
      });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const ct = resp.headers.get("content-type") || "image/jpeg";
      const bytes = new Uint8Array(await resp.arrayBuffer());
      if (bytes.length === 0) throw new Error("vacío");
      const path = `joaquin-jaen/${row.id}.${extFromType(ct)}`;
      const { error: upErr } = await supa.storage.from(BUCKET).upload(path, bytes, {
        contentType: ct,
        upsert: true,
      });
      if (upErr) throw new Error("upload: " + upErr.message);
      const pub = supa.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const { error: updErr } = await supa
        .from("almacen_materiales")
        .update({ imagen_url: pub })
        .eq("id", row.id);
      if (updErr) throw new Error("update: " + updErr.message);
      updated++;
    } catch (e) {
      errors.push({ id: row.id, err: String(e instanceof Error ? e.message : e) });
    }
  }

  const { count: remaining } = await supa
    .from("almacen_materiales")
    .select("id", { count: "exact", head: true })
    .eq("cuenta_id", CUENTA)
    .like("imagen_url", SRC_PREFIX + "%");

  return new Response(
    JSON.stringify({ batch: rows?.length ?? 0, updated, remaining: remaining ?? 0, errors }),
    { headers: { "Content-Type": "application/json" } },
  );
});
