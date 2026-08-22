// ⚠️ RESCATADA del panel de Supabase el 20/08/2026 — ver ../README.md
// ✅ Sin secretos. Copia FIEL del original, sin tocar una línea.
// 📌 CASCARÓN VACÍO: no importa ningún CSV. Devuelve literalmente
//    `{ ok: true, msg: "placeholder, use SQL batches" }` y ni siquiera usa el cliente
//    que crea. Se quedó a medias y nunca se terminó ni se borró.
// ⚠️ Ojo con el `ok: true`: si algo la vigila, se pone verde sin haber hecho nada —
//    el patrón exacto que CLAUDE.md prohíbe («un check que se pone verde porque la
//    consulta no devolvió nada es el fallo más caro que hay»).
//    Instancia el cliente con la service_role, así que ocupa un secreto para nada.
//    Borrado sin coste: no hace nada que se pueda perder.
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Slim wrapper: edge function streams remaining batches by reading them from a staging table
// To keep the deployment small, we'll embed records via batch fetches.

Deno.serve(async () => {
  try {
    // @ts-ignore
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    return new Response(JSON.stringify({ ok: true, msg: "placeholder, use SQL batches" }), { headers: { "Content-Type": "application/json" }});
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" }});
  }
});
