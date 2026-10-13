/**
 * «¿Quieres verla siempre al día?» — la tarjeta discreta de una póliza que APORTÓ el cliente
 * (13/10/2026). La correduría no gestiona estas pólizas, así que no hay recibos ni siniestros
 * automáticos; la tarjeta lo dice con veracidad y deja pedir que pasen a llevarse en Grupo ASegura.
 *
 * Módulo PURO (sin Prisma ni red): cuándo se enseña, textos, claves y el mensaje del aviso.
 *
 * ─── Dónde se guarda lo que la persona hizo (sin tabla nueva) ────────────────────────────────
 * Se reutiliza `portal_aviso_leido` (identidad + clave + `creado_en`; el rol solo INSERTA y LEE):
 *   · `captacion-ahora-no:<polizaId>:<aaaa-mm-dd>` — «Ahora no». Una fila por pulsación; vale
 *     `DIAS_AHORA_NO` días desde su `creado_en` (por eso la fecha va en la clave: la tabla no admite
 *     UPDATE y la misma clave no se podría volver a sellar pasados los 90 días).
 *   · `captacion-pedida:<polizaId>` — la petición ya salió. Es lo que hace idempotente el botón.
 * 🚨 Solo se sella `captacion-pedida` DESPUÉS de que el aviso haya salido de verdad: sellarla antes
 * dejaría a la persona con un «Ya lo hemos recibido» que nadie recibió.
 */

export const DIAS_AHORA_NO = 90
export const PREFIJO_AHORA_NO = 'captacion-ahora-no:'
export const PREFIJO_PEDIDA = 'captacion-pedida:'

export const TEXTO_CAPTACION = {
  titulo: '¿Quieres verla siempre al día?',
  cuerpo:
    'Si esta póliza la gestiona Grupo ASegura, aquí verás sus recibos y siniestros actualizados automáticamente, sin tener que subir nada.',
  boton: 'Que la gestione Grupo ASegura',
  ahoraNo: 'Ahora no',
  yaPedida: 'Ya lo hemos recibido, te contactaremos',
  chip: 'Ponla al día con Grupo ASegura',
  errorEnvio: 'No hemos podido registrar tu petición. Vuelve a intentarlo en un rato.',
} as const

export type EstadoCaptacion = 'oculta' | 'ya_pedida' | 'ofrecer'

export type FilaMarca = { clave: string; creadoEn: Date }

const MS_DIA = 24 * 60 * 60 * 1000

export function claveAhoraNo(polizaId: string, ahora: Date): string {
  return `${PREFIJO_AHORA_NO}${polizaId}:${ahora.toISOString().slice(0, 10)}`
}

export function clavePedida(polizaId: string): string {
  return `${PREFIJO_PEDIDA}${polizaId}`
}

/** Para pedir solo las marcas de esta función a la BD (`startsWith`). */
export const PREFIJO_CAPTACION = 'captacion-'

/**
 * Qué hacer con la tarjeta de UNA póliza.
 *  · `propia` — la añadió quien mira (no la de un titular que le dio acceso). Sin ella, `oculta`.
 *  · `eliminada` — la quitó de su bóveda. Sin ella en la bóveda no se ofrece nada.
 *  · `marcas` — filas de `portal_aviso_leido` de ESTA identidad (cualquier clave; se filtra aquí).
 */
export function estadoCaptacion(e: {
  propia: boolean
  eliminada: boolean
  polizaId: string
  marcas: readonly FilaMarca[]
  ahora: Date
}): EstadoCaptacion {
  if (!e.propia || e.eliminada) return 'oculta'
  const pedida = clavePedida(e.polizaId)
  if (e.marcas.some((m) => m.clave === pedida)) return 'ya_pedida'
  const prefijo = `${PREFIJO_AHORA_NO}${e.polizaId}:`
  const limite = e.ahora.getTime() - DIAS_AHORA_NO * MS_DIA
  const silenciada = e.marcas.some((m) => m.clave.startsWith(prefijo) && m.creadoEn.getTime() > limite)
  return silenciada ? 'oculta' : 'ofrecer'
}

export type DatosPeticionGestion = {
  identidadId: string
  /** Solo si tiene ficha comprobada en la cartera; si no, el nombre es lo que tecleó al entrar. */
  nombre: string | null
  polizaId: string
  compania: string | null
  ramo: string | null
  numeroPoliza: string | null
  /** `YYYY-MM-DD` o `null` (= no consta). */
  fechaVencimiento: string | null
}

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** El aviso para Alberto (Telegram, HTML). Datos básicos de la póliza; ningún dato sensible. */
export function mensajePeticionGestion(d: DatosPeticionGestion): string {
  const quien = d.nombre ? `<b>${esc(d.nombre)}</b>` : 'una identidad del portal'
  const compania = d.compania ? esc(d.compania) : 'compañía sin identificar'
  const ramo = d.ramo ? ` (${esc(d.ramo)})` : ''
  const vence = d.fechaVencimiento ? `Vence el ${d.fechaVencimiento}.` : 'Sin vencimiento indicado.'
  const numero = d.numeroPoliza ? `\nNº ${esc(d.numeroPoliza)}` : ''
  return (
    `🤝 Petición desde el portal: ${quien} quiere que Grupo ASegura GESTIONE una póliza que aportó.\n` +
    `${compania}${ramo}. ${vence}${numero}\n` +
    `Póliza aportada ${d.polizaId}\nIdentidad ${d.identidadId}`
  )
}

/** La nota que queda en el historial de la ficha (si la hay). Texto plano. */
export function notaPeticionGestion(d: DatosPeticionGestion): string {
  return (
    `Petición desde el portal: quiere que Grupo ASegura gestione una póliza que aportó ` +
    `(${d.compania ?? 'compañía sin identificar'}${d.ramo ? `, ${d.ramo}` : ''}; ` +
    `${d.fechaVencimiento ? `vence el ${d.fechaVencimiento}` : 'sin vencimiento indicado'}). ` +
    `Póliza aportada ${d.polizaId}.`
  )
}
