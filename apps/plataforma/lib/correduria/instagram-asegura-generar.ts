// Genera UNA pieza de Instagram de Grupo ASegura y la manda a Telegram con botones `asig_*`.
// La usan el cron (`/api/cron/asegura-instagram`) y el botón 🔄 del webhook de Telegram.
//
// Flujo: elegir tema/plantilla → IA → cepo (`revisarPieza`) → si hay reparos, regenerar UNA vez →
// si siguen, `rechazado_copy` + aviso del motivo (sin botones). Si pasa: `pendiente` + imagen +
// Telegram con ✅/🗑️/🔄. Nada se publica aquí.
import { chatConDirector } from '@/lib/pasarela'
import { tgAviso, tgAvisoBotones, escapeHtml } from '@/lib/telegram'
import { cuentaDelLibro } from './cuenta-libro'
import {
  elegirTema, elegirPlantilla, construirPrompt, parsearPieza, revisarPieza, decidirTrasRevision,
  explicarReparos, captionFinal, callbackAsig, urlImagenIg, FICHAS_TEMA_IG,
  type PiezaIg, type PlantillaIg, type Reparo, type TemaIg,
} from './instagram-asegura'
import { recientesIg, caducarPendientesIg, insertarIg, fijarImagenYMensajeIg, esSinMigracion } from './instagram-asegura-db'

const URL_PLATAFORMA_POR_DEFECTO = 'https://plataforma-ten-flame.vercel.app'

export function basePublica(): string {
  return process.env.NEXT_PUBLIC_APP_URL || URL_PLATAFORMA_POR_DEFECTO
}

export type ResultadoGenerar =
  | { estado: 'pendiente'; id: string; tema: TemaIg; plantilla: PlantillaIg; telegram: boolean; imagenOk: boolean }
  | { estado: 'rechazado_copy'; id: string | null; tema: TemaIg; motivo: string }
  | { estado: 'error'; motivo: string; sinMigracion?: boolean }

const NOMBRE_TEMA: Record<TemaIg, string> = {
  comunidades: 'Comunidades', comercio: 'Comercio y pyme', flota: 'Flota',
  hogar: 'Hogar', renovacion: 'Renovación', marca: 'Marca',
}

async function avisarFallo(texto: string): Promise<void> {
  await tgAviso('correduria.instagram-fallido', texto).catch(() => null)
}

export async function generarBorradorIg(opts: { temaForzado?: TemaIg } = {}): Promise<ResultadoGenerar> {
  const cuenta = await cuentaDelLibro()
  if (!cuenta.ok) {
    await avisarFallo(`📸 Instagram ASegura: no genero nada. ${escapeHtml(cuenta.motivo)}`)
    return { estado: 'error', motivo: cuenta.motivo }
  }
  const cuentaId = cuenta.cuentaId

  let tema: TemaIg
  let plantilla: PlantillaIg
  try {
    await caducarPendientesIg(cuentaId)
    const rec = await recientesIg(cuentaId)
    tema = opts.temaForzado ?? elegirTema(rec.temas)
    plantilla = elegirPlantilla(rec.ultimaPlantilla)
  } catch (e) {
    const sin = esSinMigracion(e)
    const motivo = sin
      ? 'falta la tabla asegura_instagram_borradores (migración prisma/sql/2026-11-04_asegura_instagram_borradores.sql sin aplicar)'
      : `no se pudo leer la BD: ${String(e).slice(0, 160)}`
    await avisarFallo(`📸 Instagram ASegura: no genero nada — ${escapeHtml(motivo)}.`)
    return { estado: 'error', motivo, sinMigracion: sin }
  }

  // ── IA + cepo: regenerar UNA vez, luego descartar ──
  let pieza: PiezaIg | null = null
  let ultima: PiezaIg | null = null
  let reparos: Reparo[] = []
  let intento = 0
  for (intento = 1; intento <= 2; intento++) {
    let texto = ''
    try {
      const r = await chatConDirector(
        [{ role: 'user', content: construirPrompt(tema, plantilla, reparos) }],
        { app: 'asegura', endpoint: 'instagram', categoria: 'redaccion', maxTokens: 1_200, temperature: 0.5, timeoutMs: 60_000 },
      )
      texto = r.text
    } catch (e) {
      const motivo = `la IA no respondió: ${String(e).slice(0, 160)}`
      await avisarFallo(`📸 Instagram ASegura (${NOMBRE_TEMA[tema]}): ${escapeHtml(motivo)}. No hay post hoy.`)
      return { estado: 'error', motivo }
    }
    const candidata = parsearPieza(texto)
    reparos = candidata ? revisarPieza(candidata, tema, plantilla) : [{ campo: 'formato', motivo: 'la respuesta no traía un JSON legible' }]
    if (candidata) ultima = candidata
    const d = decidirTrasRevision(intento, reparos)
    if (d === 'aceptar') { pieza = candidata; break }
    if (d === 'descartar') break
  }
  const intentos = Math.min(intento, 2)

  if (!pieza) {
    const motivo = explicarReparos(reparos)
    let id: string | null = null
    try {
      id = await insertarIg({
        cuentaId, estado: 'rechazado_copy', plantilla, tema,
        titulo: ultima?.titulo ?? '', sub: ultima?.sub ?? '', puntos: ultima?.puntos ?? [],
        caption: ultima ? captionFinal(ultima) : '', motivo, intentos,
      })
    } catch (e) { console.error('[asegura-instagram] no se guardó el rechazo:', e) }
    await avisarFallo(
      `📸 <b>Instagram ASegura: post descartado</b> (${NOMBRE_TEMA[tema]} · ${plantilla})\n` +
      `El cepo de copy lo paró dos veces y no se envía:\n${escapeHtml(motivo)}`,
    )
    return { estado: 'rechazado_copy', id, tema, motivo }
  }

  const caption = captionFinal(pieza)
  const id = await insertarIg({
    cuentaId, estado: 'pendiente', plantilla, tema,
    titulo: pieza.titulo, sub: pieza.sub, puntos: pieza.puntos, caption, motivo: null, intentos,
  })
  const imageUrl = urlImagenIg(basePublica(), id)

  // Se pide la imagen una vez: calienta el render y comprueba que existe ANTES de ofrecer el ✅.
  let imagenOk = false
  try {
    const r = await fetch(imageUrl, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
    imagenOk = r.ok && (r.headers.get('content-type') ?? '').startsWith('image/')
  } catch { imagenOk = false }

  const texto =
    `📸 <b>Instagram Grupo ASegura</b> · ${NOMBRE_TEMA[tema]} · <code>${plantilla}</code>\n` +
    `<i>${escapeHtml(FICHAS_TEMA_IG[tema].publico)}</i>\n\n` +
    `<b>${escapeHtml(pieza.titulo)}</b>\n` +
    `🖼️ <a href="${escapeHtml(imageUrl)}">Ver imagen</a>${imagenOk ? '' : ' ⚠️ <i>no se pudo comprobar la imagen: ábrela antes de aprobar</i>'}\n\n` +
    `${escapeHtml(caption.slice(0, 700))}${caption.length > 700 ? '…' : ''}\n\n` +
    `✅ Revisado por el cepo de copy${intentos > 1 ? ' (al 2.º intento)' : ''}. Nada se publica sin tu botón.`
  const msgId = await tgAvisoBotones('correduria.instagram-listo', texto, [
    [{ texto: '✅ Aprobar', callback: callbackAsig('aprobar', id) }, { texto: '🗑️ Descartar', callback: callbackAsig('descartar', id) }],
    [{ texto: '🔄 Otro', callback: callbackAsig('regenerar', id) }],
  ]).catch(() => null)

  await fijarImagenYMensajeIg(cuentaId, id, imageUrl, msgId)
  return { estado: 'pendiente', id, tema, plantilla, telegram: msgId !== null, imagenOk }
}
