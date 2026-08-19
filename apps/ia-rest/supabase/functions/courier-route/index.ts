// ia.rest · COURIER-ROUTE v10 · fix nota_general
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

async function reportarError(supabase: any, params: {
  nivel: 'info'|'warning'|'critical', categoria: string,
  mensaje: string, restaurante_id?: string|null, contexto?: any
}) {
  try {
    await supabase.from('system_errors').insert({
      nivel: params.nivel, categoria: params.categoria,
      mensaje: params.mensaje, funcion_origen: 'courier-route',
      restaurante_id: params.restaurante_id ?? null,
      contexto: params.contexto ?? null,
    })
    if (params.nivel === 'critical') {
      supabase.functions.invoke('push-send', {
        body: {
          restaurante_id: params.restaurante_id ?? 'GLOBAL',
          titulo: `🔴 Error crítico · COURIER`,
          mensaje: params.mensaje,
          datos: { tipo: 'system_error', nivel: 'critical' },
        }
      }).catch(() => {})
    }
  } catch { /* silencioso */ }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: 'iarest' } });
  const inicio = Date.now();
  let restaurante_id: string | undefined;

  try {
    const body = await req.json();
    restaurante_id = body.restaurante_id;
    const { camarero_id, brain_output, transcripcion_id } = body;

    if (!restaurante_id || !brain_output) return new Response(JSON.stringify({ error: "restaurante_id y brain_output requeridos" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (brain_output.requiere_confirmacion) return new Response(
      JSON.stringify({ ok: true, accion: "pendiente_confirmacion", quip: brain_output.quip }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let resultado: Record<string, unknown> = {};

    switch (brain_output.intent) {
      case "comanda": {
        // ── Obtener tipo_iva_defecto del restaurante ──────────────────────
        const { data: rest } = await supabase
          .from("restaurantes")
          .select("tipo_iva_defecto")
          .eq("id", restaurante_id)
          .single();
        const tipo_iva_defecto: number = rest?.tipo_iva_defecto ?? 10;

        // ── Obtener tipo_iva por producto en bulk ──────────────────────
        const productoIds = (brain_output.items ?? [])
          .map((i: any) => i.producto_id)
          .filter(Boolean);
        const productoIvaMap: Record<string, number> = {};
        if (productoIds.length) {
          const { data: prods } = await supabase
            .from("productos")
            .select("id, tipo_iva")
            .in("id", productoIds);
          if (prods) {
            for (const p of prods) {
              productoIvaMap[p.id] = p.tipo_iva ?? tipo_iva_defecto;
            }
          }
        }

        // ── Crear o reusar comanda ──────────────────────────────────────
        let comanda_id: string;
        if (brain_output.mesa_id) {
          const { data: ex } = await supabase.from("comandas")
            .select("id").eq("restaurante_id", restaurante_id)
            .eq("mesa_id", brain_output.mesa_id)
            .in("estado", ["nueva", "en_cocina"]).maybeSingle();
          if (ex) { comanda_id = ex.id; }
          else {
            const { data: n, error: ce } = await supabase.from("comandas").insert({
              restaurante_id, mesa_id: brain_output.mesa_id, camarero_id,
              estado: "nueva", tipo: "comanda",
              nota_general: brain_output.notas_generales ?? null,
            }).select("id").single();
            if (ce) throw new Error(`Crear comanda: ${ce.message}`);
            comanda_id = n.id;
          }
        } else {
          const { data: n, error: ce } = await supabase.from("comandas").insert({
            restaurante_id, camarero_id, estado: "nueva", tipo: "comanda",
            nota_general: brain_output.notas_generales ?? null,
          }).select("id").single();
          if (ce) throw new Error(`Crear comanda sin mesa: ${ce.message}`);
          comanda_id = n.id;
        }

        // ── Insertar items con precio_unitario y tipo_iva ──────────────────────
        if (brain_output.items?.length) {
          const items = brain_output.items.map((item: any) => ({
            comanda_id,
            restaurante_id,
            producto_id:     item.producto_id ?? null,
            nombre:          item.producto_nombre,
            cantidad:        item.cantidad,
            precio_unitario: item.precio_unitario ?? null,
            tipo_iva:        item.producto_id
                               ? (productoIvaMap[item.producto_id] ?? tipo_iva_defecto)
                               : tipo_iva_defecto,
            modificadores:   item.modificadores ?? [],
            notas:           item.notas ?? null,
            estado:          "pendiente",
          }));
          const { error: ie } = await supabase.from("comanda_items").insert(items);
          if (ie) throw new Error(`Insertar items: ${ie.message}`);
        }

        const { data: job } = await supabase.from("print_jobs").insert({
          restaurante_id, comanda_id,
          payload: { mesa: brain_output.mesa_nombre ?? "BARRA", items: brain_output.items, ts: new Date().toISOString() },
          status: "pendiente",
        }).select("id").maybeSingle();
        resultado = { accion: "comanda_creada", comanda_id, print_job_id: job?.id };
        console.log(`[courier] ✅ v10 comanda ${comanda_id} · iva_defecto=${tipo_iva_defecto}`);
        break;
      }
      case "86": {
        for (const item of brain_output.items ?? []) {
          await supabase.from("productos_86").insert({
            restaurante_id, nombre: item.producto_nombre,
            producto_id: item.producto_id ?? null,
            motivo: brain_output.mensaje_cocina ?? "86 por voz",
            reportado_por: camarero_id ?? null, activo: true,
          });
          if (item.producto_id) {
            await supabase.from("productos").update({ disponible: false })
              .eq("id", item.producto_id).eq("restaurante_id", restaurante_id);
          }
        }
        resultado = { accion: "86_procesado", items: brain_output.items?.length ?? 0 };
        break;
      }
      case "alergia": {
        if (brain_output.mesa_id) {
          await supabase.from("alergeno_confirmaciones").insert({
            restaurante_id, mesa_id: brain_output.mesa_id,
            alergenos: brain_output.alergen ?? [],
            confirmado_por: camarero_id, confirmado_at: new Date().toISOString(),
          });
        }
        resultado = { accion: "alergia_registrada", alergenos: brain_output.alergen };
        break;
      }
      case "cobro":
        resultado = { accion: "cobro_iniciado", metodo: brain_output.metodo_pago, personas: brain_output.personas_cobro, mesa_id: brain_output.mesa_id };
        break;
      case "nota_cocina":
        resultado = { accion: "nota_enviada", mensaje: brain_output.mensaje_cocina };
        break;
      default:
        resultado = { accion: "no_procesado", intent: brain_output.intent };
    }

    if (transcripcion_id) {
      await supabase.from("transcripciones").update({
        estado: "completada", courier_resultado: resultado, latencia_total_ms: Date.now() - inicio,
      }).eq("id", transcripcion_id);
    }
    return new Response(JSON.stringify({ ok: true, quip: brain_output.quip, procesado_en_ms: Date.now() - inicio, ...resultado }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    await reportarError(supabase, {
      nivel: 'critical', categoria: 'courier',
      mensaje: String(err),
      restaurante_id,
      contexto: { error: String(err) },
    });
    console.error("[courier-route]", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
