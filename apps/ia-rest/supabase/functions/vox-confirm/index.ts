// ia.rest · VOX-CONFIRM v7 · con error monitoring
// TTS fallback graceful: si OpenAI falla devuelve texto sin audio (el cliente sigue funcionando)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function reportarError(params: {
  nivel: 'info'|'warning'|'critical', categoria: string,
  mensaje: string, restaurante_id?: string|null, contexto?: any
}) {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { db: { schema: 'iarest' } }
    )
    await supabase.from('system_errors').insert({
      nivel: params.nivel, categoria: params.categoria,
      mensaje: params.mensaje, funcion_origen: 'vox-confirm',
      restaurante_id: params.restaurante_id ?? null,
      contexto: params.contexto ?? null,
    })
    // VOX no dispara push critical — el sistema sigue funcionando sin audio
  } catch { /* silencioso */ }
}

function textoConfirmacion(body: any): string {
  if (body.texto_override) return body.texto_override;
  if (body.quip) return body.quip;

  const { intent, items = [], mesa_nombre, metodo_pago, personas_cobro } = body;
  switch (intent) {
    case "comanda": {
      if (!items.length) return "Comanda anotada.";
      if (items.length === 1) {
        const i = items[0];
        const mods = i.modificadores?.length ? `, ${i.modificadores.join(", ")}` : "";
        const mesa = mesa_nombre ? ` para ${mesa_nombre}` : "";
        return `${i.cantidad > 1 ? i.cantidad + " " : ""}${i.producto_nombre}${mods}${mesa}. Marchando.`;
      }
      const total = items.reduce((s: number, i: any) => s + (i.cantidad ?? 1), 0);
      return `${total} items${mesa_nombre ? " para " + mesa_nombre : ""}. Marchando.`;
    }
    case "cobro": {
      const m = metodo_pago === "tarjeta" ? "con tarjeta" : metodo_pago === "bizum" ? "por Bizum" : metodo_pago === "efectivo" ? "en efectivo" : "";
      const sep = personas_cobro > 1 ? ` dividida entre ${personas_cobro}` : "";
      return `Cuenta${mesa_nombre ? " de " + mesa_nombre : ""}${sep} ${m}.`.trim();
    }
    case "86":
      return items.length === 1 ? `86 ${items[0].producto_nombre}. Anotado.` : `${items.length} productos en 86.`;
    case "alergia":
      return `${mesa_nombre ? mesa_nombre + ": " : ""}Alergia registrada. Cocina avisada.`;
    case "nota_cocina":
      return "Mensaje enviado a cocina.";
    default:
      return "Entendido.";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const inicio = Date.now();

  try {
    const body = await req.json();
    if (!body.intent) return new Response(JSON.stringify({ error: "intent requerido" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const texto = textoConfirmacion(body);
    if (!texto) return new Response(JSON.stringify({ ok: true, texto: "", audio_base64: null }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      // OPENAI_API_KEY no configurada — warning, fallback graceful
      await reportarError({
        nivel: 'warning', categoria: 'vox',
        mensaje: 'OPENAI_API_KEY no configurada — VOX sin audio (fallback texto)',
        contexto: { intent: body.intent },
      });
      return new Response(JSON.stringify({ ok: true, texto, audio_base64: null, error_tts: 'OPENAI_API_KEY no configurada' }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "tts-1", input: texto, voice: "nova", speed: 1.1, response_format: "mp3" }),
    });

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      // Warning (no critical): el sistema sigue funcionando sin audio
      await reportarError({
        nivel: 'warning', categoria: 'vox',
        mensaje: `TTS OpenAI ${ttsRes.status}: ${errText.substring(0, 150)}`,
        contexto: { status: ttsRes.status, intent: body.intent },
      });
      // Fallback graceful: texto sin audio
      return new Response(JSON.stringify({ ok: true, texto, audio_base64: null, error_tts: `TTS ${ttsRes.status}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const buf = await ttsRes.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
    const audio_base64 = btoa(bin);

    console.log(`[vox-confirm] ✅ v7 "${texto.substring(0, 40)}" en ${Date.now() - inicio}ms`);
    return new Response(JSON.stringify({ ok: true, texto, audio_base64, audio_mime: "audio/mp3", duracion_ms: Date.now() - inicio }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    await reportarError({
      nivel: 'warning', categoria: 'vox',
      mensaje: String(err),
      contexto: { error: String(err) },
    });
    console.error("[vox-confirm]", err);
    // Fallback graceful siempre
    return new Response(JSON.stringify({ ok: true, texto: "Entendido.", audio_base64: null, error_tts: String(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
