// ia.rest · VERIFACTU-SIGN v9 · con error monitoring
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

async function sha256(data: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}

async function reportarError(supabase: any, params: {
  nivel: 'info'|'warning'|'critical', categoria: string,
  mensaje: string, restaurante_id?: string|null, contexto?: any
}) {
  try {
    await supabase.from('system_errors').insert({
      nivel: params.nivel, categoria: params.categoria,
      mensaje: params.mensaje, funcion_origen: 'verifactu-sign',
      restaurante_id: params.restaurante_id ?? null,
      contexto: params.contexto ?? null,
    })
    if (params.nivel === 'critical') {
      supabase.functions.invoke('push-send', {
        body: {
          restaurante_id: params.restaurante_id ?? 'GLOBAL',
          titulo: `🔴 Error crítico · VERIFACTU`,
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
  let restaurante_id: string | undefined;

  try {
    const body = await req.json();
    restaurante_id = body.restaurante_id;
    const { comanda_id, importe_total: imp_override, tipo_iva: iva_override } = body;

    if (!restaurante_id || !comanda_id) return new Response(JSON.stringify({ error: "restaurante_id y comanda_id requeridos" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: ex } = await supabase.from("facturas_verifactu").select("id,numero_serie,huella,qr_url").eq("comanda_id", comanda_id).maybeSingle();
    if (ex) return new Response(JSON.stringify({ ok:true, factura_id:ex.id, numero_serie:ex.numero_serie, huella:ex.huella, qr_url:ex.qr_url, ya_existia:true }),
      { status:200, headers:{ ...corsHeaders, "Content-Type":"application/json" } });

    const { data: rest } = await supabase.from("restaurantes").select("nombre,razon_social,nif,tipo_iva_defecto").eq("id", restaurante_id).single();
    if (!rest) return new Response(JSON.stringify({ error:"Restaurante no encontrado" }), { status:404, headers:{ ...corsHeaders, "Content-Type":"application/json" } });

    const { data: comanda } = await supabase.from("comandas").select("id,total_cobrado").eq("id",comanda_id).eq("restaurante_id",restaurante_id).single();
    if (!comanda) return new Response(JSON.stringify({ error:"Comanda no encontrada" }), { status:404, headers:{ ...corsHeaders, "Content-Type":"application/json" } });

    const nif = rest.nif || "00000000T";
    const razon = rest.razon_social || rest.nombre;
    const total = Number(imp_override ?? comanda.total_cobrado ?? 0);
    const iva = Number(iva_override ?? rest.tipo_iva_defecto ?? 10);
    const cuota = parseFloat((total - total/(1+iva/100)).toFixed(2));
    const base = parseFloat((total - cuota).toFixed(2));

    // Avisar si NIF es el por defecto (no configurado)
    if (!rest.nif) {
      await reportarError(supabase, {
        nivel: 'warning', categoria: 'verifactu',
        mensaje: 'Factura generada con NIF por defecto (00000000T) — restaurante sin NIF configurado',
        restaurante_id, contexto: { comanda_id, nombre: rest.nombre },
      });
    }

    const { data: ultima } = await supabase.from("facturas_verifactu").select("huella,numero_factura")
      .eq("restaurante_id",restaurante_id).order("numero_factura",{ascending:false}).limit(1).maybeSingle();
    const anterior = ultima?.huella ?? "0".repeat(64);

    const ahora = new Date();
    const inicio_dia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).toISOString();
    const { count } = await supabase.from("facturas_verifactu").select("*",{count:"exact",head:true})
      .eq("restaurante_id",restaurante_id).gte("created_at",inicio_dia);
    const seq = (count ?? 0) + 1;
    const y=ahora.getFullYear(), m=String(ahora.getMonth()+1).padStart(2,"0"), d=String(ahora.getDate()).padStart(2,"0");
    const numero_serie = `${y}${m}${d}-${String(seq).padStart(6,"0")}`;
    const fecha_str = ahora.toISOString().substring(0,19);

    const cadena = [nif, numero_serie, fecha_str, "F2", cuota.toFixed(2), total.toFixed(2), anterior].join("|");
    const huella = await sha256(cadena);

    const qp = new URLSearchParams({ nif, numserie:numero_serie, fecha:fecha_str.substring(0,10), importe:total.toFixed(2), huella:huella.substring(0,13).toUpperCase() });
    const qr_url = `https://www2.agenciatributaria.gob.es/wlpl/BUGC-JDIT/VerQR?${qp}`;
    const qr_data = `${nif};${numero_serie};${fecha_str.substring(0,10)};${total.toFixed(2)};${huella.substring(0,13).toUpperCase()}`;

    const { data: factura, error: se } = await supabase.from("facturas_verifactu").insert({
      restaurante_id, comanda_id, numero_serie,
      numero_factura: (ultima?.numero_factura ?? 0) + 1,
      fecha_expedicion: ahora.toISOString(),
      tipo_factura: "F2",
      nif_emisor: nif, razon_social: razon, nombre_emisor: razon,
      base_imponible: base, tipo_iva: iva, cuota_iva: cuota, importe_total: total,
      huella_anterior: anterior, huella,
      primer_registro: !ultima,
      qr_data, qr_url,
      estado_envio: "no_aplica",
      enviada_aeat: false, anulada: false, num_items: 1,
    }).select().single();

    if (se) throw new Error(se.message);

    await supabase.from("comandas").update({ factura_verifactu_id: factura.id }).eq("id", comanda_id);

    console.log(`[verifactu-sign] ✅ v9 ${numero_serie} | €${total}`);
    return new Response(JSON.stringify({ ok:true, factura_id:factura.id, numero_serie, numero_factura:factura.numero_factura, importe_total:total, huella, qr_url }),
      { status:201, headers:{ ...corsHeaders, "Content-Type":"application/json" } });

  } catch(err) {
    await reportarError(supabase, {
      nivel: 'critical', categoria: 'verifactu',
      mensaje: String(err),
      restaurante_id,
      contexto: { error: String(err) },
    });
    console.error("[verifactu-sign]", err);
    return new Response(JSON.stringify({ error: String(err) }), { status:500, headers:{ ...corsHeaders, "Content-Type":"application/json" } });
  }
});
