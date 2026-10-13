// IA de texto de la correduría enrutada por la PASARELA central (vive en plataforma), igual que
// rrhh (`apps/rrhh/lib/ai.ts`). Por la pasarela cada llamada queda en `ai_usos` con app='asegura'
// y le aplican el tope diario y el mensual (`ia_presupuestos`); una llamada directa a `aiComplete`
// gasta saldo de OpenRouter sin que nada la cuente ni la pare (pieza 1-6 de ASegura OS).
//
// Envs (proyecto Vercel central-asegura): AI_GATEWAY_URL (URL de plataforma) y AI_GATEWAY_SECRET
// (el mismo valor que en plataforma). Sin ellas se cae a la llamada directa de antes, para no
// romper nada mientras se ponen — y se avisa en el log, porque ese gasto no se está contando.
//
// La visión de imágenes (`openrouterVision` en documentos/extraer-poliza.ts) sigue directa: la
// visión de la pasarela es otro modelo (NIM) y cambiarlo cambiaría lo que se lee de una póliza.

export type ViaIA = 'pasarela' | 'directo'

/** Pura: decide la vía según el entorno. Prioriza la pasarela. */
export function viaIA(env: Record<string, string | undefined> = process.env): ViaIA {
  return env.AI_GATEWAY_URL && env.AI_GATEWAY_SECRET ? 'pasarela' : 'directo'
}

let avisadoDirecto = false

/**
 * Completion de texto. `privado`: la petición lleva datos personales (pólizas, nombres) y la
 * pasarela la manda solo a proveedores que no entrenan con ella.
 */
export async function iaTexto(
  prompt: string,
  opts: {
    system?: string; maxTokens?: number; timeoutMs?: number; privado?: boolean
    /** Categoría del catálogo de la pasarela (p. ej. `redaccion`: un modelo más capaz que el flash por
     *  defecto). Solo por la pasarela; en la llamada directa no aplica. */
    categoria?: string
    /** Modelo de OpenRouter EXPLÍCITO (slug). SOLO por la pasarela (va por OpenRouter con ese modelo y registra su coste);
     *  sin pasarela LANZA: un gasto con modelo elegido no puede quedar fuera de `ai_usos` y de los topes. */
    modeloOpenRouter?: string
    /** Atribución de coste en `ai_usos.cliente_ref` (p. ej. `explorador:<trabajo>`). Solo por la pasarela. */
    cliente?: string
    /** Cachear el `system` en el proveedor (prompt largo repetido). Solo por la pasarela. */
    cacheSystem?: boolean
  } = {},
): Promise<string> {
  const via = viaIA()
  // Antes de cargar nada: un modelo explícito sin pasarela no se llama (gasto fuera de `ai_usos` y de los topes).
  if (via !== 'pasarela' && opts.modeloOpenRouter) throw new Error('iaTexto: un modelo explícito solo va por la pasarela (AI_GATEWAY_URL/AI_GATEWAY_SECRET)')
  const core = await import('@central/core-ai')
  if (via === 'pasarela') {
    return core.gatewayChat(
      { url: process.env.AI_GATEWAY_URL!, secret: process.env.AI_GATEWAY_SECRET!, app: 'asegura' },
      [{ role: 'user', content: prompt }],
      {
        system: opts.system, maxTokens: opts.maxTokens, timeoutMs: opts.timeoutMs, privado: opts.privado, categoria: opts.categoria,
        modeloOpenRouter: opts.modeloOpenRouter, cliente: opts.cliente, cacheSystem: opts.cacheSystem,
      },
    )
  }
  if (!avisadoDirecto) {
    avisadoDirecto = true
    console.warn('[asegura/ia] sin AI_GATEWAY_URL/AI_GATEWAY_SECRET: llamada DIRECTA, fuera de ai_usos y de los topes')
  }
  return core.aiComplete(prompt, { system: opts.system, maxTokens: opts.maxTokens, timeoutMs: opts.timeoutMs })
}
