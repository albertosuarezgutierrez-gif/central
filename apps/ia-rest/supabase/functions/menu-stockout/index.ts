// ia.rest · MENU-STOCKOUT v7 · con error monitoring
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function reportarError(supabase: any, params: {
  nivel: 'info'|'warning'|'critical', categoria: string,
  mensaje: string, restaurante_id?: string|null, contexto?: any
}) {
  try {
    await supabase.from('system_errors').insert({
      nivel: params.nivel, categoria: params.categoria,
      mensaje: params.mensaje, funcion_origen: 'menu-stockout',
      restaurante_id: params.restaurante_id ?? null,
      contexto: params.contexto ?? null,
    })
  } catch { /* silencioso */ }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: 'iarest' } }
  );
  let restaurante_id: string | undefined;

  try {
    const body = await req.json();
    restaurante_id = body.restaurante_id;
    const { accion, producto_id, producto_nombre, motivo, reportado_por } = body;

    if (!restaurante_id || !accion) return new Response(JSON.stringify({ error: "restaurante_id y accion requeridos" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (accion === "86") {
      const nombre = producto_nombre ?? "Producto";
      await supabase.from("productos_86").insert({
        restaurante_id, nombre,
        producto_id: producto_id ?? null,
        motivo: motivo ?? "86",
        reportado_por: reportado_por ?? null,
        activo: true,
      });
      if (producto_id) {
        await supabase.from("productos").update({ disponible: false })
          .eq("id", producto_id).eq("restaurante_id", restaurante_id);
      }
      let sustitutos: any[] = [];
      if (producto_id) {
        const { data: prod } = await supabase.from("v_productos_con_seccion")
          .select("seccion_id").eq("id", producto_id).maybeSingle();
        if (prod?.seccion_id) {
          const { data: subs } = await supabase.from("v_productos_con_seccion")
            .select("id, nombre, precio")
            .eq("restaurante_id", restaurante_id)
            .eq("seccion_id", prod.seccion_id)
            .eq("disponible", true)
            .neq("id", producto_id).limit(3);
          sustitutos = subs ?? [];
        }
      }
      // Info: 86 registrado (no es un error, es un evento de negocio)
      await reportarError(supabase, {
        nivel: 'info', categoria: 'edge',
        mensaje: `Producto 86: ${nombre}`,
        restaurante_id, contexto: { producto_id, nombre, motivo },
      });
      console.log(`[menu-stockout] 86: ${nombre}`);
      return new Response(JSON.stringify({ ok: true, accion: "86", nombre, sustitutos }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (accion === "restaurar") {
      if (producto_id) {
        await supabase.from("productos").update({ disponible: true }).eq("id", producto_id).eq("restaurante_id", restaurante_id);
        await supabase.from("productos_86").update({ activo: false, restaurado_at: new Date().toISOString() })
          .eq("producto_id", producto_id).eq("restaurante_id", restaurante_id).eq("activo", true);
      } else if (producto_nombre) {
        await supabase.from("productos_86").update({ activo: false, restaurado_at: new Date().toISOString() })
          .eq("nombre", producto_nombre).eq("restaurante_id", restaurante_id).eq("activo", true);
      }
      return new Response(JSON.stringify({ ok: true, accion: "restaurado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (accion === "restaurar_todos") {
      const { data: agotados } = await supabase.from("productos_86")
        .select("producto_id").eq("restaurante_id", restaurante_id).eq("activo", true);
      const ids = (agotados ?? []).map((p: any) => p.producto_id).filter(Boolean);
      if (ids.length) await supabase.from("productos").update({ disponible: true }).in("id", ids);
      await supabase.from("productos_86")
        .update({ activo: false, restaurado_at: new Date().toISOString() })
        .eq("restaurante_id", restaurante_id).eq("activo", true);
      return new Response(JSON.stringify({ ok: true, accion: "todos_restaurados", count: agotados?.length ?? 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (accion === "consultar_86") {
      const { data } = await supabase.from("productos_86")
        .select("id, nombre, motivo, created_at, producto_id")
        .eq("restaurante_id", restaurante_id).eq("activo", true)
        .order("created_at", { ascending: false });
      return new Response(JSON.stringify({ ok: true, agotados: data ?? [], count: data?.length ?? 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: `Acción desconocida: ${accion}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    await reportarError(supabase, {
      nivel: 'critical', categoria: 'edge',
      mensaje: String(err),
      restaurante_id,
      contexto: { error: String(err) },
    });
    console.error("[menu-stockout]", err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
