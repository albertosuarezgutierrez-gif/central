import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Tipos ──────────────────────────────────

interface BrainRequest {
  restaurante_id: string;
  transcripcion: string;   // texto crudo de EAR / Whisper
  contexto?: {
    mesas_ocupadas?: string[];
    camarero_id?: string;
    hora?: string;
    [key: string]: unknown;
  };
  modelo?: string;         // override del modelo a usar
}

interface BrainOutput {
  mesa: string;
  items: Array<{
    nombre: string;
    cantidad: number;
    notas?: string[];
  }>;
  intent: "comanda" | "cuenta" | "modificacion" | "86" | "otro";
  notas: string[];
  confianza: number;        // 0-1
  raw_input: string;        // reflejo de la transcripción
}

// ─── Prompt del sistema para BRAIN ──────────────────────────────────

const SYSTEM_PROMPT = `Eres BRAIN, el agente de interpretación de un sistema de voz para hostelería española.

Tu único trabajo es convertir transcripciones de voz de camareros en JSON estructurado.
El vocabulario es hostelero real: "marchar", "86", mesas codificadas (T04, B11, M02), etc.

Siempre responde ÚNICAMENTE con JSON válido, sin texto adicional, sin markdown.

Esquema de respuesta:
{
  "mesa": string,           // código de mesa, ej: "T04" o "barra"
  "items": [
    {
      "nombre": string,     // nombre del producto
      "cantidad": number,   // cantidad pedida
      "notas": string[]     // modificaciones, alergias, etc.
    }
  ],
  "intent": string,         // "comanda" | "cuenta" | "modificacion" | "86" | "otro"
  "notas": string[],        // notas generales (alergias, urgencia, etc.)
  "confianza": number,      // 0.0 - 1.0, tu nivel de confianza en la interpretación
  "raw_input": string       // la transcripción original sin cambios
}

Ejemplos:
Input: "marchar segundos mesa cuatro y un manchado para la doce"
Output: {"mesa":"T04","items":[{"nombre":"segundos","cantidad":1,"notas":[]},{"nombre":"manchado","cantidad":1,"notas":[]}],"intent":"comanda","notas":[],"confianza":0.95,"raw_input":"marchar segundos mesa cuatro y un manchado para la doce"}

Input: "86 las croquetas, sustituye por gambas en la siete"
Output: {"mesa":"T07","items":[{"nombre":"croquetas","cantidad":1,"notas":["86","sustituir por gambas"]}],"intent":"86","notas":["avisar a David"],"confianza":0.92,"raw_input":"86 las croquetas, sustituye por gambas en la siete"}

Input: "cuenta para la cinco, pago con tarjeta, separada en dos"
Output: {"mesa":"T05","items":[],"intent":"cuenta","notas":["pago tarjeta","dividir en 2"],"confianza":0.98,"raw_input":"cuenta para la cinco, pago con tarjeta, separada en dos"}`;

// ─── Helper: guardar en ia_training_log ──────────────────────

async function logTrainingData(
  supabase: ReturnType<typeof createClient>,
  payload: {
    restaurante_id: string;
    input_raw: string;
    input_context: object;
    output_brain: BrainOutput;
    latencia_ms: number;
    modelo_usado: string;
  }
): Promise<string | null> {
  const confianza = payload.output_brain.confianza ?? 1;
  const calidad =
    confianza >= 0.9 ? 5
    : confianza >= 0.7 ? 4
    : confianza >= 0.5 ? 3
    : confianza >= 0.3 ? 2
    : 1;

  const { data, error } = await supabase
    .from("ia_training_log")
    .insert({
      restaurante_id: payload.restaurante_id,
      input_raw:      payload.input_raw,
      input_context:  payload.input_context,
      output_brain:   payload.output_brain,
      latencia_ms:    payload.latencia_ms,
      modelo_usado:   payload.modelo_usado,
      calidad,
      confirmado_por: "auto",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[ia_training_log] Error:", error.message);
    return null;
  }
  return data?.id ?? null;
}

// ─── Helper: marcar corrección ──────────────────────────

async function marcarCorreccion(
  supabase: ReturnType<typeof createClient>,
  log_id: string,
  correccion: BrainOutput
): Promise<void> {
  const { error } = await supabase
    .from("ia_training_log")
    .update({
      fue_corregido:  true,
      correccion,
      calidad:        2,
      confirmado_por: "camarero",
    })
    .eq("id", log_id);

  if (error) {
    console.error("[marcarCorreccion] Error:", error.message);
  }
}

// ─── Handler principal ──────────────────────────────────

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: 'iarest' } }
  );

  try {
    const body = await req.json() as BrainRequest & { accion?: "correccion"; log_id?: string; correccion?: BrainOutput };

    // ── Ruta: marcar corrección de un log existente ──
    if (body.accion === "correccion" && body.log_id && body.correccion) {
      await marcarCorreccion(supabase, body.log_id, body.correccion);
      return new Response(
        JSON.stringify({ ok: true }),
        { headers: corsHeaders }
      );
    }

    // ── Ruta principal: procesar transcripción ──
    const { restaurante_id, transcripcion, contexto = {}, modelo = "claude-sonnet-4-20250514" } = body;

    if (!restaurante_id || !transcripcion) {
      return new Response(
        JSON.stringify({ error: "restaurante_id y transcripcion son obligatorios" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const inicio = Date.now();

    // Llamada a Claude (Anthropic API)
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Transcripción: "${transcripcion}"\nContexto: ${JSON.stringify(contexto)}`,
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      console.error("[BRAIN] Anthropic error:", err);
      return new Response(
        JSON.stringify({ error: "Error llamando al modelo", detalle: err }),
        { status: 502, headers: corsHeaders }
      );
    }

    const latencia_ms = Date.now() - inicio;
    const anthropicData = await anthropicRes.json();
    const rawText = anthropicData?.content?.[0]?.text ?? "{}";

    let output: BrainOutput;
    try {
      output = JSON.parse(rawText);
      output.raw_input = transcripcion;
    } catch {
      console.error("[BRAIN] JSON parse error:", rawText);
      output = {
        mesa: "?",
        items: [],
        intent: "otro",
        notas: ["Error de parsing"],
        confianza: 0,
        raw_input: transcripcion,
      };
    }

    // Guardar en ia_training_log (sin await para no añadir latencia)
    const logPromise = logTrainingData(supabase, {
      restaurante_id,
      input_raw:     transcripcion,
      input_context: {
        ...contexto,
        hora: new Date().toISOString(),
      },
      output_brain:  output,
      latencia_ms,
      modelo_usado:  modelo,
    });

    // Devolver resultado al cliente inmediatamente
    // El log se guarda en background
    const response = new Response(
      JSON.stringify({ ok: true, brain: output, latencia_ms }),
      { headers: corsHeaders }
    );

    // Esperar el log antes de cerrar la función (Deno Edge requiere esto)
    await logPromise;

    return response;

  } catch (e) {
    console.error("[BRAIN] Error inesperado:", e);
    return new Response(
      JSON.stringify({ error: "Error interno", detalle: String(e) }),
      { status: 500, headers: corsHeaders }
    );
  }
});
