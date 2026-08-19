// ia.rest · BRAIN-PARSE v9 · con error monitoring
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Error monitor (inline helper) ───────────────────────────────────────
 async function reportarError(supabase: any, params: {
  nivel: 'info'|'warning'|'critical', categoria: string,
  mensaje: string, restaurante_id?: string|null, contexto?: any
}) {
  try {
    await supabase.from('system_errors').insert({
      nivel: params.nivel, categoria: params.categoria,
      mensaje: params.mensaje, funcion_origen: 'brain-parse',
      restaurante_id: params.restaurante_id ?? null,
      contexto: params.contexto ?? null,
    })
    if (params.nivel === 'critical') {
      supabase.functions.invoke('push-send', {
        body: {
          restaurante_id: params.restaurante_id ?? 'GLOBAL',
          titulo: `🔴 Error crítico · BRAIN`,
          mensaje: params.mensaje,
          datos: { tipo: 'system_error', nivel: 'critical' },
        }
      }).catch(() => {})
    }
  } catch { /* silencioso */ }
}

async function cargarCarta(supabase: any, restaurante_id: string): Promise<string> {
  const { data } = await supabase
    .from("v_productos_con_seccion")
    .select("id, nombre, precio, seccion_nombre")
    .eq("restaurante_id", restaurante_id)
    .order("seccion_nombre");
  if (!data?.length) return "Sin carta disponible.";
  const secs: Record<string, any[]> = {};
  for (const p of data) {
    const s = p.seccion_nombre ?? "General";
    if (!secs[s]) secs[s] = [];
    secs[s].push(p);
  }
  let out = "CARTA:\n";
  for (const [sec, items] of Object.entries(secs)) {
    out += `\n[${sec.toUpperCase()}]\n`;
    for (const i of items) out += `- "${i.nombre}" (ID:${i.id}) ${i.precio ? `€${i.precio}` : ""}\n`;
  }
  return out;
}

async function contextoMesa(supabase: any, restaurante_id: string, mesa_id: string): Promise<string> {
  const { data } = await supabase
    .from("comandas")
    .select(`id, comanda_items (cantidad, notas, nombre, productos(nombre))`)
    .eq("restaurante_id", restaurante_id)
    .eq("mesa_id", mesa_id)
    .in("estado", ["nueva", "en_cocina"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.comanda_items?.length) return "";
  const items = (data.comanda_items as any[])
    .map((ci: any) => `${ci.cantidad}x ${ci.productos?.nombre ?? ci.nombre}${ci.notas ? ` (${ci.notas})` : ""}`)
    .join(", ");
  return `\nYA PEDIDO EN MESA: ${items}`;
}

async function cargarMesas(supabase: any, restaurante_id: string): Promise<string> {
  const { data } = await supabase
    .from("mesas")
    .select("numero, zona, nombre, estado")
    .eq("restaurante_id", restaurante_id)
    .order("zona")
    .order("numero");
  if (!data?.length) return "";
  const zonas: Record<string, number[]> = {};
  for (const m of data) {
    const z = m.zona ?? "salon";
    if (!zonas[z]) zonas[z] = [];
    zonas[z].push(m.numero);
  }
  let out = "\nMESAS DEL RESTAURANTE:\n";
  for (const [zona, nums] of Object.entries(zonas)) {
    out += `- ${zona}: mesas ${nums.join(", ")}\n`;
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: 'iarest' } }
  );
  const inicio = Date.now();
  let restaurante_id: string | undefined;

  try {
    const body = await req.json();
    restaurante_id = body.restaurante_id;
    const { texto, transcripcion_id, mesa_id_contexto } = body;

    if (!restaurante_id || !texto)
      return new Response(
        JSON.stringify({ error: "restaurante_id y texto requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    const [carta, ctxmesa, ctxmesas] = await Promise.all([
      cargarCarta(supabase, restaurante_id),
      mesa_id_contexto ? contextoMesa(supabase, restaurante_id, mesa_id_contexto) : Promise.resolve(""),
      cargarMesas(supabase, restaurante_id),
    ]);

    const systemPrompt = `Eres BRAIN, el agente de ia.rest para comandas de hostelería española.

${carta}${ctxmesa}${ctxmesas}

VOCABULARIO HOSTELERO:
- marchar = servir/llevar a mesa
- 86 = producto agotado
- sin/sin X = excluir ingrediente
- poco hecho / al punto / muy hecho = punto de carne
- media ración, ración entera
- cuenta / separada / dividida = cobro
- alérgico a X / sin gluten = alergia crítica

IDENTIFICACIÓN DE MESAS — MUY IMPORTANTE:
El camarero habla de las mesas con números y opcionalmente la zona.
Zonas posibles: salon, terraza, barra.
Ejemplos de cómo habla el camarero:
- "la cuatro" → mesa_numero=4, mesa_zona=null (se asumirá salón si es única)
- "mesa cuatro" → mesa_numero=4, mesa_zona=null
- "terraza cuatro" → mesa_numero=4, mesa_zona="terraza"
- "terraza cuatro" o "la cuatro de terraza" → mesa_numero=4, mesa_zona="terraza"
- "barra dos" o "la barra dos" → mesa_numero=2, mesa_zona="barra"
- "la diez" → mesa_numero=10, mesa_zona=null
Siempre extrae el número como entero. Si el camarero menciona zona, inclúyela.
SI NO HAY NÚMERO DE MESA CLARO en el texto, usa mesa_numero=null.

Responde SOLO JSON válido sin markdown ni texto adicional:
{
  "intent": "comanda|cobro|86|alergia|consulta|nota_cocina|desconocido",
  "confianza": 0.95,
  "mesa_numero": 4,
  "mesa_zona": "terraza",
  "items": [
    {
      "producto_nombre": "nombre tal como está en la carta",
      "producto_id": "uuid exacto de la carta o null si no está seguro",
      "cantidad": 2,
      "modificadores": ["sin sal"],
      "notas": null,
      "seccion_cocina": null
    }
  ],
  "notas_generales": null,
  "quip": "frase breve max 12 palabras o null",
  "alergen": null,
  "metodo_pago": null,
  "personas_cobro": null,
  "mensaje_cocina": null,
  "requiere_confirmacion": false
}`;

    const llm = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: texto }],
      }),
    });

    if (!llm.ok) {
      const errText = await llm.text();
      await reportarError(supabase, {
        nivel: 'critical', categoria: 'brain',
        mensaje: `Claude API ${llm.status}: ${errText.substring(0, 200)}`,
        restaurante_id, contexto: { status: llm.status, texto: texto.substring(0, 100) },
      });
      throw new Error(`Claude API ${llm.status}: ${errText}`);
    }

    const llmData = await llm.json();
    const raw = llmData.content?.[0]?.text ?? "{}";

    let parsed: any = {};
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      parsed = { intent: "desconocido", confianza: 0, items: [], requiere_confirmacion: true };
      // Warning: JSON inválido de Claude (raro pero registrable)
      await reportarError(supabase, {
        nivel: 'warning', categoria: 'brain',
        mensaje: 'BRAIN devolvió JSON inválido',
        restaurante_id, contexto: { raw: raw.substring(0, 300), texto: texto.substring(0, 100) },
      });
    }

    // Confianza baja → warning
    if ((parsed.confianza ?? 1) < 0.3) {
      await reportarError(supabase, {
        nivel: 'warning', categoria: 'brain',
        mensaje: `Confianza muy baja: ${parsed.confianza} — intent: ${parsed.intent}`,
        restaurante_id, contexto: { confianza: parsed.confianza, intent: parsed.intent, texto: texto.substring(0, 100) },
      });
    }

    // ── LOOKUP DE MESA v5 ────────────────────────────────────────────
    let mesa_id: string | undefined;
    let mesa_nombre_resuelta: string | undefined;
    let mesa_zonas_candidatas: string[] | undefined;

    const mesa_numero = typeof parsed.mesa_numero === "number" ? parsed.mesa_numero : null;
    const mesa_zona = parsed.mesa_zona ?? null;

    if (mesa_numero !== null) {
      const { data: candidatas, error: lookupErr } = await supabase
        .rpc("buscar_mesa_por_voz", {
          p_restaurante_id: restaurante_id,
          p_numero: mesa_numero,
          p_zona: mesa_zona,
        });

      if (lookupErr) {
        console.error("[brain-parse] lookup error:", lookupErr);
        await reportarError(supabase, {
          nivel: 'warning', categoria: 'brain',
          mensaje: `Lookup de mesa fallido: ${lookupErr.message}`,
          restaurante_id, contexto: { mesa_numero, mesa_zona, error: lookupErr.message },
        });
      } else if (candidatas?.length === 1) {
        mesa_id = candidatas[0].id;
        mesa_nombre_resuelta = candidatas[0].nombre;
      } else if (candidatas?.length > 1) {
        mesa_zonas_candidatas = candidatas.map((m: any) => m.zona);
        parsed.requiere_confirmacion = true;
        parsed.quip = `¿mesa ${mesa_numero} de ${mesa_zonas_candidatas.join(" o ")}?`;
      } else {
        console.warn(`[brain-parse] ⚠️ mesa ${mesa_numero} zona=${mesa_zona} no encontrada`);
      }
    }

    const procesado_en_ms = Date.now() - inicio;

    if (transcripcion_id) {
      await supabase.from("transcripciones").update({
        estado: "procesada", intent: parsed.intent,
        texto_brain: parsed, brain_output: parsed,
        latencia_brain_ms: procesado_en_ms,
      }).eq("id", transcripcion_id);
    }

    console.log(`[brain-parse] ✅ v9 intent=${parsed.intent} mesa=${mesa_nombre_resuelta ?? "?"} en ${procesado_en_ms}ms`);

    return new Response(
      JSON.stringify({
        ok: true, ...parsed,
        mesa_id, mesa_nombre_resuelta, mesa_zonas_candidatas,
        procesado_en_ms, texto_original: texto,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    await reportarError(supabase, {
      nivel: 'critical', categoria: 'brain',
      mensaje: String(err),
      restaurante_id,
      contexto: { error: String(err) },
    });
    console.error("[brain-parse]", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
