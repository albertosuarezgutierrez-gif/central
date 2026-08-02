// Sonda ACTIVA de los proveedores de IA — un «ping» real y minúsculo a cada eslabón, cada día.
//
// Por qué existe (02/08/2026): la GEMINI_API_KEY estuvo MES Y MEDIO muerta (429 de cuota en el
// 100% de las llamadas) sin que saltara nada, porque la cadena de fallback recuperaba siempre y
// el único vigilante (Check 12 del health-check) es PASIVO: necesita que el tráfico orgánico
// acumule ≥10 fallos en la ventana para disparar (~una semana con la cadencia real de los crons).
// Esta sonda no espera al tráfico: pregunta directamente a cada proveedor configurado y, si uno
// no responde, el health-check lo canta por Telegram ESE día — venga o no venga tráfico.
//
// Diseño:
// - Un ping por proveedor con la MISMA key y el MISMO modelo por defecto que usa la app en
//   producción (si la cuota está muerta, el ping muere igual que el tráfico real).
// - maxTokens 5: el coste de los proveedores de pago (Kimi, OpenRouter) es despreciable
//   (≈ milésimas de céntimo/día) y los gratis no cuestan nada.
// - En PARALELO con timeout individual — la pasada completa cuesta como el ping más lento.
// - Cada intento queda en `ai_usos` (endpoint 'sonda'): alimenta el Check 12 y el panel de
//   gasto, y deja histórico de CUÁNDO murió una key (no solo que está muerta).
// - Gemini solo se sondea si está reactivado (GEMINI_TEXTO=1 o GEMINI_WEBSEARCH=1): sondear un
//   eslabón desenchufado del código solo repetiría la alerta de una avería ya conocida.
import { nimChat, groqChat, moonshotChat, openrouterChat, geminiChat } from '@central/core-ai'
import type { NimChatMessage } from '@central/core-ai'
import { registrarUso } from '@/lib/ai-gateway'

const TIMEOUT_MS = Number(process.env.SONDA_IA_TIMEOUT_MS ?? 12_000)
const PING: NimChatMessage[] = [{ role: 'user', content: 'ping' }]

export type SondaIA = { proveedor: string; modelo: string; ok: boolean; ms: number; error?: string }

type Sonda = { proveedor: string; modelo: string; llamar: (signal: AbortSignal) => Promise<string> }

// Mismos defaults de modelo que la cadena real (client.ts de core-ai / pasarela). Si allí se
// cambia un default, actualizarlo aquí — la sonda debe probar lo que la app usa de verdad.
function sondasConfiguradas(): Sonda[] {
  const lista: Sonda[] = []
  const opts = { maxTokens: 5, temperature: 0 }

  const nimKey = process.env.NVIDIA_API_KEY
  if (nimKey) {
    const modelo = 'meta/llama-3.3-70b-instruct'
    lista.push({ proveedor: 'nim', modelo, llamar: (signal) => nimChat({ apiKey: nimKey, textModel: modelo }, PING, { ...opts, signal }) })
  }

  const groqKey = process.env.GROQ_API_KEY
  if (groqKey) {
    const modelo = process.env.GROQ_BRAIN_MODEL ?? 'openai/gpt-oss-120b'
    lista.push({ proveedor: 'groq', modelo, llamar: (signal) => groqChat({ apiKey: groqKey, textModel: modelo }, PING, { ...opts, signal }) })
  }

  const orKey = process.env.OPENROUTER_API_KEY
  if (orKey) {
    const modelo = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat'
    lista.push({ proveedor: 'openrouter', modelo, llamar: (signal) => openrouterChat({ apiKey: orKey, textModel: modelo }, PING, { ...opts, signal }) })
  }

  const kimiKey = process.env.MOONSHOT_API_KEY
  if (kimiKey) {
    const modelo = process.env.MOONSHOT_MODEL ?? 'kimi-k2.6'
    lista.push({
      proveedor: 'kimi', modelo,
      llamar: (signal) => moonshotChat({ apiKey: kimiKey, textModel: modelo, baseUrl: process.env.MOONSHOT_BASE_URL || undefined }, PING, { ...opts, signal }),
    })
  }

  const geminiKey = process.env.GEMINI_API_KEY
  const geminiActivo = process.env.GEMINI_TEXTO === '1' || process.env.GEMINI_WEBSEARCH === '1'
  if (geminiKey && geminiActivo) {
    const modelo = process.env.GEMINI_BRAIN_MODEL ?? 'gemini-flash-latest'
    lista.push({ proveedor: 'gemini', modelo, llamar: () => geminiChat({ apiKey: geminiKey, model: modelo }, PING, { ...opts, timeoutMs: TIMEOUT_MS }) })
  }

  return lista
}

/**
 * Sondea todos los proveedores configurados en paralelo. NUNCA lanza: cada resultado lleva su
 * ok/error y el registro en `ai_usos` es best-effort (un fallo del registro no tumba la sonda).
 */
export async function sondearProveedoresIA(): Promise<SondaIA[]> {
  return Promise.all(sondasConfiguradas().map(async (s): Promise<SondaIA> => {
    const t0 = Date.now()
    try {
      await s.llamar(AbortSignal.timeout(TIMEOUT_MS))
      const ms = Date.now() - t0
      await registrarUso({ app: 'plataforma', endpoint: 'sonda', proveedor: s.proveedor, modelo: s.modelo, ok: true, ms, tokens: 10, costeEur: 0 }).catch(() => {})
      return { proveedor: s.proveedor, modelo: s.modelo, ok: true, ms }
    } catch (e) {
      const ms = Date.now() - t0
      // 300 chars: los 429 de cuota traen el detalle de QUÉ cuota se agotó al final del body
      // (lección del corte anterior: con 150 chars el mensaje se quedaba en «check your plan»).
      const error = (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 300)
      await registrarUso({ app: 'plataforma', endpoint: 'sonda', proveedor: s.proveedor, modelo: s.modelo, ok: false, ms, error }).catch(() => {})
      return { proveedor: s.proveedor, modelo: s.modelo, ok: false, ms, error }
    }
  }))
}
