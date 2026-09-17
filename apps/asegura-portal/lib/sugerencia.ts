/**
 * El botón de sugerencias del portal: le llega a Alberto por Telegram y, si esa
 * persona tiene ficha, queda además en su historial.
 *
 * ─── Por qué van las DOS cosas ───────────────────────────────────────────────
 * Telegram es donde Alberto lo va a ver hoy (regla de la casa: «¿en qué pantalla
 * lo va a ver?»); el historial de la ficha es donde seguirá estando dentro de
 * tres meses, cuando el mensaje se haya ido scrolleando. Un lead no tiene ficha,
 * así que para él **Telegram es el único registro** — y de ahí la regla de abajo.
 *
 * 🚨 **Nunca se le dice «recibida» a quien no ha salido.** Si el envío falla y
 * no hay ficha donde anotarlo, el texto de esa persona no existe en ningún
 * sitio: prometerle que lo hemos recibido es la mentira más barata de escribir y
 * la más cara de descubrir. Por eso `enviarSugerencia` devuelve los estados por
 * separado y la pantalla los traduce sin colapsar ninguno.
 *
 * La nota en la ficha es **best-effort y no cambia el desenlace**: si Telegram
 * salió, la sugerencia está entregada aunque la anotación falle. Al revés no:
 * una nota escrita con el aviso caído no es «entregada», es un renglón que nadie
 * va a leer.
 */
import { tgSend } from '@central/core-telegram'
import {
  mensajeSugerencia,
  normalizarSugerencia,
  PREFIJO_HISTORIAL_SUGERENCIA,
  resultadoSugerencia,
  type ContextoSugerencia,
  type ResultadoSugerencia,
} from '@central/module-seguros-portal'

import { PORTAL_PUENTE_TIEMPO_MS } from './puente-config'

export async function enviarSugerencia(
  ctx: ContextoSugerencia,
  textoCrudo: unknown,
): Promise<ResultadoSugerencia> {
  const texto = normalizarSugerencia(textoCrudo)
  if (texto === null) return 'vacia'

  let id: number | null = null
  let hubo: 'ok' | 'fallo' = 'ok'
  try {
    id = await tgSend(mensajeSugerencia(ctx, texto))
  } catch (e) {
    hubo = 'fallo'
    console.error('[portal/sugerencia] Telegram no aceptó el mensaje:', e instanceof Error ? e.message : e)
  }
  const r = resultadoSugerencia(id, hubo)
  if (r === 'sin_canal') {
    console.warn('[portal/sugerencia] sin avisar: falta TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID en este proyecto')
  }

  // La constancia en la ficha. Va después y sin afectar al desenlace.
  void anotarEnFicha(ctx.identidadId, texto)
  return r
}

/**
 * Deja la sugerencia en el historial de su ficha, por el puerto estrecho de
 * asegura (el portal no puede escribir en la cartera; ver `lib/mis-datos.ts`).
 *
 * No lanza y no devuelve nada: quien llama ya ha decidido qué contarle a la
 * persona con el resultado del envío. Lo que sí hace es dejar dicho en el log
 * qué pasó — una nota perdida en silencio es justo lo que convierte «queda en su
 * historial» en una promesa que nadie comprueba.
 */
async function anotarEnFicha(identidadId: string, texto: string): Promise<void> {
  const base = process.env.ASEGURA_PUENTE_URL
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  if (!base || !secret) return

  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), PORTAL_PUENTE_TIEMPO_MS)
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}/api/portal/nota`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify({ identidadId, texto: `${PREFIJO_HISTORIAL_SUGERENCIA}\n${texto}` }),
      cache: 'no-store',
      signal: control.signal,
    })
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { estado?: string } | null
      // `sin_ficha` no es una avería: es un lead, y para él el registro es el
      // Telegram que acaba de salir. Se distingue del resto para que un log
      // lleno de «sin_ficha» no se lea como que el puerto está roto.
      console.warn(`[portal/sugerencia] no queda en ninguna ficha: ${j?.estado ?? res.status}`)
    }
  } catch (e) {
    console.error('[portal/sugerencia] el puente no respondió:', e instanceof Error ? e.message : e)
  } finally {
    clearTimeout(reloj)
  }
}
