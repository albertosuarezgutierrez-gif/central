// lib/telegram/avisos.ts — la única puerta por la que sale un aviso PROACTIVO de Telegram.
//
// `tgAviso(id, texto)` = `tgSend(texto)` + interruptor + bitácora. El `id` tiene que estar en
// `catalogo.ts` (lo verifica el guardián `test/regression-telegram-avisos.test.ts`), porque el
// panel /telegram promete que su interruptor apaga algo: un id sin catalogar sería un aviso que
// llega y no se puede callar, y un id catalogado sin emisor sería un interruptor que no hace nada.
//
// Lo que NO pasa por aquí, a propósito: las RESPUESTAS del bot a un mensaje o a un botón de
// Alberto. Esas siguen usando `tgSend` directo — silenciarlas no quitaría ruido, rompería la
// conversación.
import { tgSend, tgSendButtons, type Boton } from '@central/core-telegram'
import { avisoActivo, registrarEnvio } from './preferencias'

/** Manda un aviso proactivo, salvo que esté silenciado. Devuelve `null` si no se envió. */
export async function tgAviso(
  id: string,
  texto: string,
  opts: { chatId?: string; html?: boolean } = {},
): Promise<number | null> {
  if (!(await avisoActivo(id))) {
    await registrarEnvio(id, 'omitido')
    return null
  }
  const messageId = await tgSend(texto, opts)
  await registrarEnvio(id, 'enviado')
  return messageId
}

/** Igual que `tgAviso`, con teclado de botones. */
export async function tgAvisoBotones(
  id: string,
  texto: string,
  botones: Boton[][],
  opts: { chatId?: string } = {},
): Promise<number | null> {
  if (!(await avisoActivo(id))) {
    await registrarEnvio(id, 'omitido')
    return null
  }
  const messageId = await tgSendButtons(texto, botones, opts)
  await registrarEnvio(id, 'enviado')
  return messageId
}

/**
 * Envoltura para código que ya compone su mensaje con `tgAlert` (emoji + cabecera SIVRA + hora).
 * Mismo interruptor; el formato lo pone el llamante.
 */
export async function avisoPermitido(id: string): Promise<boolean> {
  if (await avisoActivo(id)) return true
  await registrarEnvio(id, 'omitido')
  return false
}

/** Marca en la bitácora un aviso que ya se ha enviado por otra vía (p. ej. `tgAlert`). */
export async function avisoEnviado(id: string): Promise<void> {
  await registrarEnvio(id, 'enviado')
}
