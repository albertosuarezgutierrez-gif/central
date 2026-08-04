/**
 * ai-client.ts — Wrapper IA para plataforma (gateway directo).
 * Plataforma ES la pasarela central, por lo que llama directamente a @central/core-ai
 * sin necesidad de enrutar por HTTP. NVIDIA_API_KEY en Vercel env.
 */
import { nimVision, groqTranscribe, openrouterVisionEx, type NimConfig, type NimChatMessage, type ImageInput } from '@central/core-ai'
import { chatConDirector } from '@/lib/pasarela'
import { openrouterConfigPasarela } from '@/lib/ia-director'
import { registrarUso, estimarTokens, costeEur } from '@/lib/ai-gateway'
import { parsearJsonIa } from '@/lib/agente-facturas/parsear-json-ia'

const NVIDIA_TEXT  = 'meta/llama-3.3-70b-instruct'
const NVIDIA_VISION = 'meta/llama-3.2-90b-vision-instruct'

/**
 * Modelo MULTIMODAL por defecto para leer documentos de varias páginas.
 *
 * NIM (el suplente gratis) solo acepta UNA imagen por petición, y eso obliga a
 * leer página a página — que es justo lo que hizo fallar la lectura registral:
 * sin ver el cuadro de cargas entero, el modelo no puede saber el RANGO de cada
 * carga, y el rango decide si se hereda o se purga.
 *
 * `gpt-5.6-luna` se eligió del catálogo real de OpenRouter (30/07/2026) por ser
 * multimodal, tener 1M de contexto —caben de sobra 12 páginas escaneadas— y
 * costar 0,1 $/M de entrada. Override por env sin tocar código.
 */
const VISION_MULTIPAGINA = process.env.OPENROUTER_VISION_MODEL || 'openai/gpt-5.6-luna'

/**
 * Mismo modelo para la lectura de UNA imagen cuando el llamador necesita que
 * OpenRouter sea el camino primario (con NIM de suplente) en vez de irse directo
 * a NIM. `aiVision` exige un modelo multimodal EXPLÍCITO para llamar a OpenRouter
 * —mandar imágenes al modelo de texto por defecto devuelve 404— y sin
 * `OPENROUTER_VISION_MODEL` puesta no hay ninguno, así que se nombra aquí.
 */
const VISION_UNA_PAGINA = VISION_MULTIPAGINA

function nimConfig(): NimConfig {
  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) throw new Error('NVIDIA_API_KEY no configurada en Vercel')
  return { apiKey, visionModel: NVIDIA_VISION }
}

/**
 * Completion de texto (system+user…). Mismo contrato de siempre: recibe mensajes
 * {role,content} y devuelve el texto.
 *
 * Antes iba DIRECTO a NVIDIA NIM con modelo pinneado (Llama 3.3-70b), saltándose
 * OpenRouter y el Agente Director. Ahora enruta por `chatConDirector` (la pasarela):
 * con `OPENROUTER_API_KEY` el Director elige el mejor modelo por petición (+ fallback
 * nativo entre modelos); sin ella cae a la cadena clásica GRATIS de siempre
 * (NIM → Groq → Kimi; Gemini apagado por defecto). Degrada, nunca muere; lanza solo si TODO falla.
 * (Auditoría de enrutado 2026-07 — PR-A: rescatar las ~10 rutas que bypaseaban.)
 */
export async function aiComplete(
  messages: { role: string; content: string }[],
  opts: { timeoutMs?: number } = {},
): Promise<string> {
  const { text } = await chatConDirector(messages as NimChatMessage[], {
    app: 'plataforma',
    endpoint: 'ai-client',
    // Mismo techo de salida que la implementación NIM directa anterior.
    maxTokens: 2048,
    timeoutMs: opts.timeoutMs ?? 20_000,
  })
  return text
}

/**
 * VISIÓN / OCR con el modelo que decida la app. Un solo punto de entrada para
 * leer imágenes desde plataforma (certificaciones registrales escaneadas,
 * tickets, fotos de facturas).
 *
 * Enrutado: si hay `OPENROUTER_API_KEY` va por el agregador —así el Director
 * puede elegir CUALQUIER modelo multimodal del catálogo y hay fallback nativo
 * entre modelos— y si falla o no está configurado, cae a NIM
 * (`llama-3.2-90b-vision`, gratis). Degrada, nunca muere.
 *
 * Registra siempre en `ai_usos` con el coste real cuando el proveedor lo informa:
 * leer 10 páginas escaneadas cuesta tokens de verdad y tiene que verse en el
 * panel de gasto de IA.
 */
export async function aiVision(
  system: string,
  images: ImageInput[],
  userText: string,
  opts: {
    maxTokens?: number; model?: string; timeoutMs?: number; endpoint?: string
    /** `true` = varias imágenes en la MISMA llamada: exige modelo multimodal y
     *  NO cae a NIM, que solo acepta una (mejor lanzar que mandar basura). */
    multiPagina?: boolean
  } = {},
): Promise<string> {
  const endpoint = opts.endpoint ?? 'vision'
  const maxTokens = opts.maxTokens ?? 2000
  const timeoutMs = opts.timeoutMs ?? 60_000
  const entrada = system + userText

  // 🚨 Sin un modelo MULTIMODAL explícito NO se llama a OpenRouter (30/07/2026).
  // El default de la pasarela es un modelo de TEXTO (`OPENROUTER_MODEL`), y
  // mandarle imágenes devuelve «No endpoints found that support image input»
  // (404) en cada intento: la validación del lector registral en producción se
  // quedó con cero cargas por esto, que se lee como «finca limpia» — el peor
  // fallo posible. Cuando el catálogo del Director aún no ofrece la categoría
  // `registral`, se va directo a NIM, que sí tiene modelo de visión conocido.
  const modeloVision = opts.model ?? (opts.multiPagina ? VISION_MULTIPAGINA : process.env.OPENROUTER_VISION_MODEL)
  const or = modeloVision ? openrouterConfigPasarela() : null
  if (or) {
    const t0 = Date.now()
    try {
      const res = await openrouterVisionEx(or, system, images, userText, {
        model: modeloVision,
        maxTokens,
        signal: AbortSignal.timeout(timeoutMs),
      })
      const tokens = res.usage?.total_tokens ?? estimarTokens(entrada, res.text) + images.length * 800
      await registrarUso({
        app: 'plataforma', endpoint, proveedor: 'openrouter', modelo: res.model,
        ok: true, ms: Date.now() - t0, tokens, costeEur: costeEur('openrouter', tokens),
      })
      return res.text
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : 'error'
      await registrarUso({
        app: 'plataforma', endpoint, proveedor: 'openrouter', modelo: modeloVision ?? null,
        ok: false, ms: Date.now() - t0, error: msg,
      })
      console.warn('[ai-client] visión OpenRouter falló:', msg)
      // Con varias imágenes NO hay suplente posible: NIM las rechaza. Se lanza
      // para que el llamante pueda reintentar página a página, que sí funciona.
      if (opts.multiPagina) throw e
    }
  }

  if (opts.multiPagina) {
    throw new Error('Lectura multipágina sin modelo multimodal disponible (falta OPENROUTER_API_KEY).')
  }

  // Suplente gratis: NIM vision.
  const t1 = Date.now()
  try {
    const text = await nimVision(nimConfig(), system, images, userText, maxTokens, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    const tokens = estimarTokens(entrada, text) + images.length * 258
    await registrarUso({
      app: 'plataforma', endpoint, proveedor: 'nim', modelo: NVIDIA_VISION,
      ok: true, ms: Date.now() - t1, tokens, costeEur: costeEur('nim', tokens),
    })
    return text
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : 'error'
    await registrarUso({
      app: 'plataforma', endpoint, proveedor: 'nim', modelo: NVIDIA_VISION,
      ok: false, ms: Date.now() - t1, error: msg,
    })
    throw e
  }
}

/**
 * Transcribe voz → texto (STT) con Groq Whisper (`whisper-large-v3`, gratis).
 * Usa GROQ_API_KEY (la misma del fallback de texto). Devuelve '' si no reconoce nada.
 * Para las notas de voz del agente de contabilidad por Telegram.
 */
export async function aiTranscribe(
  audio: Buffer, fileName: string, mimeType?: string, opts: { timeoutMs?: number } = {},
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY no configurada (necesaria para transcribir voz)')
  return groqTranscribe(
    { apiKey },
    { data: audio, fileName, mimeType },
    { language: 'es', signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000) },
  )
}

// ─── Invoice extraction ───────────────────────────────────────────────

const INVOICE_SYSTEM = `Eres un extractor de datos de facturas españolas.
Analiza el texto o imagen de la factura y devuelve SOLO JSON sin markdown:
{
  "fecha": "YYYY-MM-DD",
  "proveedor": "nombre empresa emisora",
  "nif_proveedor": "NIF/CIF si aparece",
  "concepto": "descripción del servicio/producto",
  "numero_factura": "número de factura si aparece",
  "base_imponible": 0.00,
  "iva_porcentaje": 21,
  "iva": 0.00,
  "irpf_porcentaje": 0,
  "irpf": 0.00,
  "total": 0.00,
  "categoria": "ALQUILER|LIMPIEZA|MANTENIMIENTO|SUMINISTROS|COMUNIDAD|SEGURO|IMPUESTOS|PLATAFORMAS|MOBILIARIO|REFORMAS|OTRO"
}
Reglas: fecha formato YYYY-MM-DD. Números decimales con punto. categoria según el tipo de gasto.
Si es un recibo o adeudo de ALQUILER de local/vivienda con retención de IRPF, rellena "irpf" con el
importe RETENIDO en positivo (p.ej. 57.63) e "irpf_porcentaje" (p.ej. 19); normalmente
total = base_imponible + iva - irpf. Si no hay retención, irpf=0 e irpf_porcentaje=0.
Si no encuentras un campo, pon null. Solo JSON, sin texto adicional.`


/**
 * Por qué una extracción se quedó sin datos. **Los dos casos NO son lo mismo** y
 * confundirlos es lo que hacía que el escaneo de facturas dijera «0 facturas nuevas»
 * cuando en realidad había correos que no supo leer (02/08/2026):
 *   · `'sin_datos'` — algún modelo respondió y ahí no había factura (un boletín, un
 *     PDF de publicidad). SÍ se ha mirado: descartarlo es una conclusión legítima.
 *   · `'tecnico'`   — NINGÚN modelo respondió (timeout, JSON truncado, API caída).
 *     NO se ha mirado: el llamador debe encolarlo, no darlo por revisado.
 */
export type FalloExtraccion = 'tecnico' | 'sin_datos'

/**
 * Tope de salida de la extracción, común a texto y visión.
 *
 * 🚨 NO bajarlo a la altura del JSON esperado (~250 tokens). Los modelos que
 * sirve el Director RAZONAN antes de escribir y esos tokens cuentan contra el
 * mismo tope: con 512 la respuesta se cortaba a mitad y `parsearJsonIa` la
 * declaraba ilegible —correctamente, un importe truncado es peor que ninguno—,
 * así que un modelo que SÍ había leído la factura acababa contado como «no se
 * ha podido leer». Misma lección que la sonda de IA el 03/08/2026, donde
 * `maxTokens: 5` se iba entero en el razonamiento de gpt-oss-120b.
 */
const INVOICE_MAX_TOKENS = 1500

export interface ResultadoExtraccion {
  datos: Record<string, any>
  /** `null` = se extrajeron datos. Ver `FalloExtraccion` para los dos «sin datos». */
  fallo: FalloExtraccion | null
}

/**
 * Igual que `aiExtractInvoice`, pero dice POR QUÉ no hay datos cuando no los hay.
 * PDF (texto) → pasarela de texto (Director/OpenRouter → cadena gratis).
 * Imagen      → pasarela de visión (`aiVision`: OpenRouter multimodal → NIM).
 */
export async function aiExtractInvoiceDetallado(input: {
  text?:        string
  imageBase64?: string
  mimeType?:    string
}): Promise<ResultadoExtraccion> {
  // ── Imagen: pasarela de VISIÓN ───────────────────────────────────────
  //
  // 🚨 Esta rama se quedó fuera del arreglo del 03/08/2026 (PR #1234), que solo
  // llevó la de TEXTO a la pasarela. Consecuencia medida el 04/08: la extracción
  // por texto pasó a 0 errores y 5 facturas nuevas, pero quedaron 9 correos «sin
  // poder leer» de los que NO había ni rastro en `ai_usos` — porque esta rama
  // llamaba a `nimVision` a pelo: un solo intento, sin suplente, sin coste
  // visible y con un `JSON.parse` crudo que trataba unas vallas ```json como
  // fallo técnico. Ahora usa `aiVision` (OpenRouter multimodal → NIM de
  // suplente, registro en `ai_usos`) y el MISMO parseo tolerante que el texto.
  if (input.imageBase64 && input.mimeType) {
    const images = [{ data: input.imageBase64, mediaType: input.mimeType }]
    let txt: string
    try {
      txt = await aiVision(INVOICE_SYSTEM, images, 'Extrae los datos de esta factura en JSON:', {
        endpoint: 'extraer-factura',
        model: VISION_UNA_PAGINA,
        maxTokens: INVOICE_MAX_TOKENS,
        timeoutMs: 45_000,
      })
    } catch (e) {
      console.warn('[extraer] visión falló:', String(e).slice(0, 140))
      return { datos: {}, fallo: 'tecnico' }
    }
    const { datos, ok } = parsearJsonIa(txt)
    if (!ok) {
      console.warn('[extraer] visión: respuesta no parseable:', txt.slice(0, 140))
      return { datos: {}, fallo: 'tecnico' }
    }
    return Object.keys(datos).length > 0 ? { datos, fallo: null } : { datos: {}, fallo: 'sin_datos' }
  }

  // ── Texto (PDF extraído): pasarela (OpenRouter + Director) → cadena gratis ──
  //
  // 🚨 Antes iba DIRECTO a Groq → NIM, saltándose la pasarela. El 03/08/2026 eso
  // dejó 10 facturas sin leer en una sola pasada: Groq devolvía `429` de rate
  // limit en `gpt-oss-120b` y NIM se agotaba por timeout — los dos únicos
  // eslabones que había. Decisión de Alberto: pasarla por OpenRouter.
  //
  // `chatConDirector` no es solo «otro proveedor»: trae el Director eligiendo
  // modelo, reintento con modelo seguro, la cadena GRATIS (NIM → Groq → …) de
  // respaldo si OpenRouter falla o no está configurado, respeto del presupuesto
  // diario (si se agota, degrada a la cadena gratis en vez de gastar), y registro
  // en `ai_usos` con `endpoint='extraer-factura'` → lo que cuesta leer las
  // facturas se ve en el panel de gasto de IA en vez de ser invisible.
  if (input.text) {
    const user = `Factura:\n${input.text.slice(0, 4000)}`
    let raw: string
    try {
      const res = await chatConDirector([{ role: 'user', content: user }], {
        app: 'plataforma',
        endpoint: 'extraer-factura',
        system: INVOICE_SYSTEM,
        maxTokens: INVOICE_MAX_TOKENS,
        temperature: 0.1, // JSON determinista
        timeoutMs: 25_000,
      })
      raw = res.text
    } catch (e) {
      // Ni OpenRouter ni la cadena gratis contestaron: NO se ha leído la factura.
      console.warn('[extraer] la pasarela no devolvió nada:', String(e).slice(0, 140))
      return { datos: {}, fallo: 'tecnico' }
    }

    // Un JSON envuelto en ```…``` o con prosa alrededor SÍ es una lectura buena;
    // uno truncado NO se repara (un importe a medias es peor que ninguno).
    const { datos, ok } = parsearJsonIa(raw)
    if (!ok) {
      console.warn('[extraer] respuesta no parseable:', raw.slice(0, 140))
      return { datos: {}, fallo: 'tecnico' }
    }
    return Object.keys(datos).length > 0
      ? { datos, fallo: null }
      : { datos: {}, fallo: 'sin_datos' }
  }

  // Ni texto ni imagen: NADIE ha mirado nada. El caso real es un PDF ESCANEADO,
  // cuya capa de texto sale vacía de `pdf-parse` y llega aquí como `text: ''`.
  // Devolver `sin_datos` lo contaba como «leído y descartado» —una factura en
  // papel escaneada desaparecía como si se hubiera comprobado que no lo era—,
  // así que es `tecnico`: se encola en Gmail y sale en el parte.
  return { datos: {}, fallo: 'tecnico' }
}

/**
 * Extrae datos estructurados de una factura. Devuelve {} si NINGÚN modelo logra leerla.
 * ⚠️ Este `{}` NO distingue «no era una factura» de «no se pudo leer»: si esa diferencia
 * importa (y para contabilidad importa), usa `aiExtractInvoiceDetallado`.
 */
export async function aiExtractInvoice(input: {
  text?:        string
  imageBase64?: string
  mimeType?:    string
}): Promise<Record<string, any>> {
  return (await aiExtractInvoiceDetallado(input)).datos
}
