// Telegram de la regularización de RC (03/11/2026). PURO (sin BD ni red): lo leen `node --test` y `regularizacion-rc.ts`.
//
// Prefijo PROPIO `rrc`; lo enruta el webhook de plataforma (`lib/regularizacion-rc-asegura.ts`), que solo deja pulsar a la
// PERSONA de TELEGRAM_CHAT_ID y reenvía la decisión a `POST /api/operador/regularizacion-rc`:
//   · rrc_env:<uuid>:<v>  ✅ Enviar — crea el token, manda el correo al cliente. ÚNICA vía de salida.
//   · rrc_mod:<uuid>:<v>  ✏️ Modificar — Alberto contesta con el texto nuevo (force_reply); vuelve con botones nuevos.
//   · rrc_no:<uuid>:<v>   ❌ Descartar — no sale nada.
// `<v>` = versión del borrador: tras ✏️ sube y el ✅ del mensaje viejo deja de valer (emite lo que vio, no otra cosa).
// `callback_data` ≤ 64 bytes y sin datos personales: «rrc_env:» + uuid + «:999» = 48.
import { eurDeCentimos, textoPeriodo, type PeriodoRegularizacion, type RespuestaRegularizacion } from '@central/module-seguros/regularizacion-rc'

export const PREFIJO_RRC = 'rrc'
export type AccionRrc = 'env' | 'mod' | 'no'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function botonesRegularizacion(id: string, version: number): { texto: string; callback: string }[][] {
  return [
    [
      { texto: '✅ Enviar', callback: `${PREFIJO_RRC}_env:${id}:${version}` },
      { texto: '✏️ Modificar', callback: `${PREFIJO_RRC}_mod:${id}:${version}` },
    ],
    [{ texto: '❌ Descartar', callback: `${PREFIJO_RRC}_no:${id}:${version}` }],
  ]
}

/** Lee `rrc_<acción>:<uuid>:<versión>` ya partido por `parseCallback`. `null` = botón no válido. */
export function leerBotonRrc(accion: string, args: readonly string[]): { accion: AccionRrc; id: string; version: number } | null {
  if ((accion !== 'env' && accion !== 'mod' && accion !== 'no') || args.length !== 2) return null
  const [id, v] = args
  if (!UUID.test(id) || !/^\d{1,4}$/.test(v) || Number(v) < 1) return null
  return { accion, id, version: Number(v) }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * La propuesta a Alberto: quién (nombre de pila o razón social, SIN DNI ni contacto), compañía, nº de póliza, periodo,
 * si hay email al que mandarlo, y el borrador plegado. El enlace aún NO existe (sale `{{ENLACE}}`).
 */
export function textoPropuestaRegularizacion(a: {
  quien: string; compania: string; numeroPoliza: string | null; periodo: PeriodoRegularizacion
  hayEmail: boolean; asunto: string; texto: string; editado?: boolean
}): string {
  const lineas = [
    `📑 <b>Regularización de RC · ${esc(a.quien)}</b>`,
    `${esc(a.compania)}${a.numeroPoliza ? ` · póliza ${esc(a.numeroPoliza)}` : ''} · periodo ${esc(textoPeriodo(a.periodo))}`,
    a.editado
      ? '✏️ Borrador EDITADO por ti.'
      : 'La compañía pide la facturación real del periodo. Propongo pedírsela al cliente por correo con un enlace de un solo uso (30 días).',
    a.hayEmail
      ? 'Sale a su email de la ficha. Nada sale sin ✅.'
      : '⚠️ <b>No tiene email válido en la ficha</b> (o está de baja): el ✅ no podrá enviarlo. Pídeselo por otra vía.',
    '',
    `<b>Asunto:</b> ${esc(a.asunto)}`,
    `<blockquote expandable>${esc(a.texto)}</blockquote>`,
  ]
  return lineas.join('\n').slice(0, 4000)
}

/** Aviso a Alberto cuando el cliente contesta. Lleva la cifra (es su canal); no se responde a la compañía (fase 3). */
export function textoAvisoRespuestaRegularizacion(a: { quien: string; compania: string; numeroPoliza: string | null; periodo: PeriodoRegularizacion; respuesta: RespuestaRegularizacion; conDocumento: boolean; urlFicha: string | null }): string {
  const r = a.respuesta
  return [
    `📥 <b>Regularización de RC contestada · ${esc(a.quien)}</b>`,
    `${esc(a.compania)}${a.numeroPoliza ? ` · póliza ${esc(a.numeroPoliza)}` : ''} · periodo ${esc(textoPeriodo(a.periodo))}`,
    `Facturación del periodo: <b>${eurDeCentimos(r.facturacionCent)}</b>`,
    `Empleados: ${r.empleados === null ? 'no lo ha indicado' : String(r.empleados)} · Masa salarial: ${r.masaSalarialCent === null ? 'no la ha indicado' : eurDeCentimos(r.masaSalarialCent)}`,
    a.conDocumento ? '📎 Ha adjuntado un documento (en su ficha → Documentos).' : 'Sin documento adjunto.',
    'Declarado por quien tenía el enlace: compruébalo antes de mandarlo a la compañía (todavía no se le responde sola).',
    ...(a.urlFicha ? [a.urlFicha] : []),
  ].join('\n')
}

// La línea tras pulsar la pinta plataforma (`apps/plataforma/lib/regularizacion-rc-asegura.ts`, `lineaTrasPulsarRrc`).
