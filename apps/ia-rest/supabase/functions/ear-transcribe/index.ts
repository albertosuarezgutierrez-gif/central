// ia.rest · EAR-TRANSCRIBE v8 · con error monitoring
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EAR_PROVIDER = Deno.env.get("EAR_PROVIDER") ?? "groq";
const WHISPER_URL = EAR_PROVIDER === "openai"
  ? "https://api.openai.com/v1/audio/transcriptions"
  : "https://api.groq.com/openai/v1/audio/transcriptions";
const WHISPER_MODEL = EAR_PROVIDER === "openai" ? "whisper-1" : "whisper-large-v3";
const WHISPER_KEY = EAR_PROVIDER === "openai"
  ? Deno.env.get("OPENAI_API_KEY")!
  : Deno.env.get("GROQ_API_KEY")!;

// ── Error monitor (inline helper) ───────────────────────────────────────
 async function reportarError(supabase: any, params: {
  nivel: 'info'|'warning'|'critical', categoria: string,
  mensaje: string, restaurante_id?: string|null, contexto?: any
}) {
  try {
    await supabase.from('system_errors').insert({
      nivel: params.nivel, categoria: params.categoria,
      mensaje: params.mensaje, funcion_origen: 'ear-transcribe',
      restaurante_id: params.restaurante_id ?? null,
      contexto: params.contexto ?? null,
    })
    if (params.nivel === 'critical') {
      supabase.functions.invoke('push-send', {
        body: {
          restaurante_id: params.restaurante_id ?? 'GLOBAL',
          titulo: `🔴 Error crítico · EAR`,
          mensaje: params.mensaje,
          datos: { tipo: 'system_error', nivel: 'critical' },
        }
      }).catch(() => {})
    }
  } catch { /* silencioso */ }
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
    const { camarero_id, audio_base64, audio_mime, mesa_id, session_id } = body;

    if (!restaurante_id || !camarero_id || !audio_base64) {
      return new Response(JSON.stringify({ error: "restaurante_id, camarero_id y audio_base64 requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: cam } = await supabase.from("camareros")
      .select("id, nombre").eq("id", camarero_id).eq("restaurante_id", restaurante_id).maybeSingle();
    if (!cam) return new Response(JSON.stringify({ error: "Camarero no autorizado" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const mime = audio_mime ?? "audio/webm";
    const ext = mime.includes("mp3") ? "mp3" : mime.includes("wav") ? "wav" : "webm";
    const binary = atob(audio_base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });

    const form = new FormData();
    form.append("file", blob, `audio.${ext}`);
    form.append("model", WHISPER_MODEL);
    form.append("language", "es");
    form.append("response_format", "json");
    form.append("prompt",
      "Comandas hostelería española: marchar, cañas, raciones, mesa, sin gluten, alérgico, cuenta, separada, tarjeta, efectivo, bizum, 86, poco hecho, al punto."
    );

    const whisperRes = await fetch(WHISPER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${WHISPER_KEY}` },
      body: form,
    });

    const duracion_ms = Date.now() - inicio;

    if (!whisperRes.ok) {
      const err = await whisperRes.text();
      await reportarError(supabase, {
        nivel: 'critical', categoria: 'ear',
        mensaje: `Whisper ${EAR_PROVIDER} ${whisperRes.status}: ${err.substring(0, 200)}`,
        restaurante_id, contexto: { proveedor: EAR_PROVIDER, status: whisperRes.status },
      });
      throw new Error(`Whisper ${EAR_PROVIDER} ${whisperRes.status}: ${err}`);
    }

    const whisperData = await whisperRes.json();
    const texto = whisperData.text?.trim() ?? "";

    // Transcripción vacía → warning (puede ser ruido o mic silenciado)
    if (!texto) {
      await reportarError(supabase, {
        nivel: 'info', categoria: 'ear',
        mensaje: 'Transcripción vacía (audio sin voz detectada)',
        restaurante_id, contexto: { duracion_ms, camarero_id },
      });
    }

    const { data: trans } = await supabase.from("transcripciones").insert({
      restaurante_id, camarero_id,
      mesa_id: mesa_id ?? null,
      texto_original: texto,
      latencia_ms: duracion_ms,
      latencia_ear_ms: duracion_ms,
      estado: texto ? "pendiente_brain" : "vacia",
      session_id: session_id ?? null,
      idioma: "es",
    }).select("id").single();

    console.log(`[ear-transcribe] ✅ v8 ${EAR_PROVIDER} "${texto.substring(0, 50)}" en ${duracion_ms}ms`);

    return new Response(JSON.stringify({ ok: true, transcripcion_id: trans?.id ?? null, texto, duracion_ms, proveedor: EAR_PROVIDER }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    await reportarError(supabase, {
      nivel: 'critical', categoria: 'ear',
      mensaje: String(err),
      restaurante_id,
      contexto: { error: String(err), proveedor: EAR_PROVIDER },
    });
    console.error("[ear-transcribe]", err);
    return new Response(JSON.stringify({ error: String(err), duracion_ms: Date.now() - inicio }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
