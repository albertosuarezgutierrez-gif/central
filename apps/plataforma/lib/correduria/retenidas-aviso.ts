// ────────────────────────────────────────────────────────────────────────────
// Aviso de emisiones RETENIDAS («riesgo condicionado») que han CAMBIADO (30/09/2026).
//
// Alberto emite a veces desde la web de Avant2 y la compañía deja la póliza retenida: no está en
// vigor hasta que la libere. asegura las revisa dos veces al día; este mensaje solo dice lo que ha
// cambiado (liberada → ya en cartera · rechazada · otro cambio) y cuántas SIGUEN retenidas. Sin
// cambios no se manda nada: «siguen igual» no es noticia, y la ficha del cliente ya lo pinta.
// Todo PURO (sin BD ni red). HTML escapado: `tgAviso` manda con parse_mode HTML.
// ────────────────────────────────────────────────────────────────────────────
import type { CambioRetenida, SigueRetenida } from '../correduria-puerto.ts'
import { esAllianz, RECORDATORIO_ALLIANZ_CORTO } from '@central/module-seguros'
import { URL_PLATAFORMA_POR_DEFECTO } from '../correduria-emision-tg.ts'

const esc = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function urlOportunidadesCliente(
  clienteId: string,
  base: string = process.env.NEXT_PUBLIC_APP_URL || URL_PLATAFORMA_POR_DEFECTO,
): string {
  return `${base.replace(/\/$/, '')}/correduria/cliente/${encodeURIComponent(clienteId)}?tab=oportunidades`
}

export type TipoCambioRetenida = 'liberada' | 'rechazada' | 'otro'

const LIBERADA = new Set(['emitida', 'aprobada', 'liberada', 'en_vigor', 'vigor'])

/** Qué ha pasado con la retenida. Un `despues` que no conocemos es «otro», nunca «liberada». */
export function tipoCambio(c: Pick<CambioRetenida, 'despues'>): TipoCambioRetenida {
  const d = (c.despues ?? '').toLowerCase()
  if (d === 'rechazada') return 'rechazada'
  if (LIBERADA.has(d)) return 'liberada'
  return 'otro'
}

/** Recordatorio corto de Allianz (solo su intranet; sin otra póliza suya, solo la básica). Vacío si no es Allianz. */
function notaAllianz(compania: string | null): string {
  return esAllianz(compania) ? `\n   <i>${esc(RECORDATORIO_ALLIANZ_CORTO)}</i>` : ''
}

/**
 * ¿Es la pasada de la MAÑANA (hora de Madrid < 12)? Solo en esa se recuerda a diario lo que sigue
 * retenida aunque no haya cambios; la de la tarde solo avisa si algo cambia.
 */
export function esPasadaDeManana(ahora: Date = new Date()): boolean {
  const h = Number.parseInt(ahora.toLocaleString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }), 10)
  return Number.isFinite(h) && h < 12
}

function fechaDesde(d: string | null): string {
  if (!d) return 'no consta desde cuándo'
  const t = new Date(d)
  if (Number.isNaN(t.getTime())) return `desde ${esc(d)}`
  return `desde el ${t.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' })}`
}

function lineaSigue(c: SigueRetenida, base: string | undefined): string {
  const cliente = `<a href="${esc(urlOportunidadesCliente(c.clienteId, base))}">${esc(c.cliente)}</a>`
  return `⏳ ${cliente} — ${esc(c.compania ?? 'la compañía')} · ${fechaDesde(c.desde)}${notaAllianz(c.compania)}`
}

function lineaCambio(c: CambioRetenida, base: string | undefined): string {
  const compania = esc(c.compania ?? 'la compañía')
  const cliente = `<a href="${esc(urlOportunidadesCliente(c.clienteId, base))}">${esc(c.cliente)}</a>`
  const detalle = (c.descripcion ? `\n   <i>${esc(c.descripcion)}</i>` : '') + notaAllianz(c.compania)
  switch (tipoCambio(c)) {
    case 'liberada': {
      const poliza = c.numeroPoliza ? ` nº ${esc(c.numeroPoliza)}` : ' (nº de póliza aún no consta)'
      return `✅ ${cliente} — ${compania} la ha LIBERADA: póliza${poliza}, ya en cartera.${detalle}`
    }
    case 'rechazada':
      return `⛔ ${cliente} — ${compania} la ha RECHAZADA: no hay póliza.${detalle}`
    case 'otro':
      return `🔄 ${cliente} — ${compania}: ${esc(c.antes ?? '?')} → ${esc(c.despues ?? '?')}.${detalle}`
  }
}

/**
 * El Telegram. `null` = no hay nada que decir: sin cambios y sin recordatorio no se manda nada.
 * `recordatorio` (pasada de la mañana) manda también SIN cambios si siguen retenidas, con la lista
 * (una retenida es un bloqueo: Alberto tiene que intervenir en la intranet de la compañía). Sin
 * recordatorio, `siguen` es solo el recuento de una línea.
 */
export function mensajeRetenidas(
  r: { cambios: readonly CambioRetenida[]; siguen: readonly SigueRetenida[]; errores?: number; recordatorio: boolean },
  base?: string,
): string | null {
  const listar = r.recordatorio && r.siguen.length > 0
  if (r.cambios.length === 0 && !listar) return null
  const partes = [`🛡️ <b>Emisiones retenidas · Grupo ASegura</b>`]
  if (r.cambios.length > 0) {
    partes.push(`${r.cambios.length} han cambiado:`, '')
    for (const c of r.cambios.slice(0, 20)) partes.push(lineaCambio(c, base))
    if (r.cambios.length > 20) partes.push(`… y ${r.cambios.length - 20} más.`)
  }
  partes.push('')
  const errores = r.errores ?? 0
  const n = r.siguen.length
  if (listar) {
    partes.push(`⏳ ${n} sigue${n === 1 ? '' : 'n'} retenida${n === 1 ? '' : 's'} por la compañía (no en vigor):`)
    for (const c of r.siguen.slice(0, 20)) partes.push(lineaSigue(c, base))
    if (n > 20) partes.push(`… y ${n - 20} más.`)
    partes.push('', '⛔ Bloqueada: tienes que intervenir tú en la intranet de la compañía.')
  } else {
    partes.push(
      // Con proyectos sin revisar, «no queda ninguna» sería afirmar lo que no se ha mirado.
      n === 0 && errores === 0
        ? 'No queda ninguna retenida.'
        : `⏳ ${n} sigue${n === 1 ? '' : 'n'} retenida${n === 1 ? '' : 's'} por la compañía (no en vigor).`,
    )
  }
  if (errores > 0) partes.push(`⚠️ ${errores} no se ${errores === 1 ? 'ha' : 'han'} podido revisar esta vez: su estado no se sabe.`)
  return partes.join('\n')
}
