// Remata el texto base de recaptación con un modelo barato. NUNCA bloquea el
// envío: si la IA falla o tarda, se manda el texto base determinista (ver
// `@central/module-seguros/recaptacion.ts`), que ya es un mensaje completo y
// correcto por sí solo.
//
// ⚠️ Ajuste respecto al plan (verificado en `packages/core-ai/src/client.ts`):
// `aiComplete(prompt, opciones)` devuelve `Promise<string>` directamente, NO
// `Promise<{text, proveedor, modelo}>` (eso es `aiCompleteConProveedor`, que el
// plan pide explícitamente no usar aquí). `llamarPasarela` envuelve ese string
// en `{ text }` para que `pulirConIA` no dependa de la forma exacta del SDK.

type ResultadoIA = { text: string }

/**
 * `llamar` se inyecta para poder probar sin red (por defecto, `aiComplete` de
 * la pasarela). Separado así en vez de importar `aiComplete` arriba: el
 * `import` de `@central/core-ai` no rompe `node --test` (a diferencia de
 * Prisma), pero mantener la inyección deja el test sin red real.
 */
export async function pulirConIA(
  textoBase: string,
  llamar: (prompt: string) => Promise<ResultadoIA> = llamarPasarela,
): Promise<string> {
  try {
    const r = await llamar(
      `Reescribe este mensaje de WhatsApp de un corredor de seguros a un lead antiguo, en tono cercano y natural, ` +
      `sin inventar datos nuevos, MISMA longitud aproximada, conservando el enlace tal cual aparece:\n\n${textoBase}`,
    )
    const texto = r.text.trim()
    return texto === '' ? textoBase : texto
  } catch (e) {
    console.error('[recaptacion-ia] no se pudo pulir el texto, se manda el base:', e instanceof Error ? e.message : e)
    return textoBase
  }
}

async function llamarPasarela(prompt: string): Promise<ResultadoIA> {
  const { aiComplete } = await import('@central/core-ai')
  const text = await aiComplete(prompt, { maxTokens: 260, temperature: 0.6, timeoutMs: 12_000 })
  return { text }
}
