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
/**
 * Fase 2 (al CLIENTE): env / mod / no. Fase 3 (a la COMPAÑÍA, 03/11/2026): `cenv` ✅ Enviar a la compañía (ÚNICA vía de
 * salida hacia ella) · `cmod` ✏️ Modificar (texto y/o «Para:») · `res` 🏁 Regularización resuelta (cierra tarea y solicitud).
 * `<v>` en cenv/cmod es `compania_version`; en `res` se ignora (cerrar no envía nada).
 */
export type AccionRrc = 'env' | 'mod' | 'no' | 'cenv' | 'cmod' | 'res'
const ACCIONES_RRC: readonly AccionRrc[] = ['env', 'mod', 'no', 'cenv', 'cmod', 'res']

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
  if (!(ACCIONES_RRC as readonly string[]).includes(accion) || args.length !== 2) return null
  const [id, v] = args
  if (!UUID.test(id) || !/^\d{1,4}$/.test(v) || Number(v) < 1) return null
  return { accion: accion as AccionRrc, id, version: Number(v) }
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
      ? 'Se enviará por correo (a su email de la ficha) y aviso en la app si la tiene. Tu ✅ cubre los dos; nada sale sin ✅.'
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
    'Declarado por quien tenía el enlace: compruébalo antes de mandarlo a la compañía (te propongo el borrador aparte; nada sale sin tu ✅).',
    ...(a.urlFicha ? [a.urlFicha] : []),
  ].join('\n')
}

// La línea tras pulsar la pinta plataforma (`apps/plataforma/lib/regularizacion-rc-asegura.ts`, `lineaTrasPulsarRrc`).

// ─── Fase 3: respuesta a la COMPAÑÍA ─────────────────────────────────────────

/** ✅ solo si hay buzón elegido (sin destinatario no se ofrece enviar). 🏁 siempre: cerrar no manda nada. */
export function botonesRespuestaCompania(id: string, version: number, hayPara: boolean): { texto: string; callback: string }[][] {
  return [
    [
      ...(hayPara ? [{ texto: '✅ Enviar a la compañía', callback: `${PREFIJO_RRC}_cenv:${id}:${version}` }] : []),
      { texto: '✏️ Modificar', callback: `${PREFIJO_RRC}_cmod:${id}:${version}` },
    ],
    [{ texto: '🏁 Regularización resuelta', callback: `${PREFIJO_RRC}_res:${id}:${version}` }],
  ]
}

/**
 * La propuesta de respuesta a la compañía. Sin buzón elegido lo dice («falta dirección de <compañía>») y enseña los
 * contactos ACTIVOS del Directorio para que Alberto elija con ✏️ «Para: …». Nunca propone uno por su cuenta.
 */
export function textoPropuestaCompania(a: {
  quien: string; compania: string; numeroPoliza: string | null; periodo: PeriodoRegularizacion
  para: string | null; buzones: readonly { nombre: string; email: string }[]
  asunto: string; texto: string; conDocumento: boolean; editado?: boolean
}): string {
  const cia = esc(a.compania)
  const destino = a.para
    ? `Para: <b>${esc(a.para)}</b> (buzón elegido por ti). Nada sale sin ✅.`
    : [
        `⚠️ <b>Falta dirección de ${cia}</b>: no hay buzón elegido y no me lo invento (sus avisos vienen de occidentinforma.com, sin buzón de respuesta; el canal oficial es ingresar el suplemento en su portal de mediadores).`,
        a.buzones.length
          ? `Si prefieres correo, pulsa ✏️ y empieza con «Para: correo» de uno de estos del Directorio:\n${a.buzones.slice(0, 8).map((b) => `· ${esc(b.nombre)} — ${esc(b.email)}`).join('\n')}`
          : `No hay contactos activos de ${cia} con correo en el Directorio: añádelo allí o ingrésalo en el portal y pulsa 🏁.`,
      ].join('\n')
  return [
    `📤 <b>Respuesta a ${cia} · regularización de RC · ${esc(a.quien)}</b>`,
    `${a.numeroPoliza ? `Póliza ${esc(a.numeroPoliza)} · ` : ''}periodo ${esc(textoPeriodo(a.periodo))}`,
    a.editado ? '✏️ Borrador EDITADO por ti.' : 'El cliente ya ha dado la cifra. Borrador de la respuesta a la compañía:',
    destino,
    a.conDocumento ? '📎 Irá adjunto el documento que subió el cliente.' : 'Sin adjunto.',
    '',
    `<b>Asunto:</b> ${esc(a.asunto)}`,
    `<blockquote expandable>${esc(a.texto)}</blockquote>`,
    'Cuando la compañía emita el suplemento (o lo hayas ingresado en su portal), pulsa 🏁.',
  ].join('\n').slice(0, 4000)
}
