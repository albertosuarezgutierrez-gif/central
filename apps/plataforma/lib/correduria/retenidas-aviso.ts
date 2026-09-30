// ────────────────────────────────────────────────────────────────────────────
// Aviso de emisiones RETENIDAS («riesgo condicionado») que han CAMBIADO (30/09/2026).
//
// Alberto emite a veces desde la web de Avant2 y la compañía deja la póliza retenida: no está en
// vigor hasta que la libere. asegura las revisa dos veces al día; este mensaje solo dice lo que ha
// cambiado (liberada → ya en cartera · rechazada · otro cambio) y cuántas SIGUEN retenidas. Sin
// cambios no se manda nada: «siguen igual» no es noticia, y la ficha del cliente ya lo pinta.
// Todo PURO (sin BD ni red). HTML escapado: `tgAviso` manda con parse_mode HTML.
// ────────────────────────────────────────────────────────────────────────────
import type { CambioRetenida } from '../correduria-puerto.ts'
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

function lineaCambio(c: CambioRetenida, base: string | undefined): string {
  const compania = esc(c.compania ?? 'la compañía')
  const cliente = `<a href="${esc(urlOportunidadesCliente(c.clienteId, base))}">${esc(c.cliente)}</a>`
  const detalle = c.descripcion ? `\n   <i>${esc(c.descripcion)}</i>` : ''
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
 * El Telegram. `null` = no hay cambios: no se manda nada. `siguen` es solo el recuento de las que
 * continúan retenidas (una línea), no la lista.
 */
export function mensajeRetenidas(
  r: { cambios: readonly CambioRetenida[]; siguen: number; errores?: number },
  base?: string,
): string | null {
  if (r.cambios.length === 0) return null
  const partes = [`🛡️ <b>Emisiones retenidas · Grupo ASegura</b>`, `${r.cambios.length} han cambiado:`, '']
  for (const c of r.cambios.slice(0, 20)) partes.push(lineaCambio(c, base))
  if (r.cambios.length > 20) partes.push(`… y ${r.cambios.length - 20} más.`)
  partes.push('')
  const errores = r.errores ?? 0
  partes.push(
    // Con proyectos sin revisar, «no queda ninguna» sería afirmar lo que no se ha mirado.
    r.siguen === 0 && errores === 0
      ? 'No queda ninguna retenida.'
      : `⏳ ${r.siguen} sigue${r.siguen === 1 ? '' : 'n'} retenida${r.siguen === 1 ? '' : 's'} por la compañía (no en vigor).`,
  )
  if (errores > 0) partes.push(`⚠️ ${errores} no se ${errores === 1 ? 'ha' : 'han'} podido revisar esta vez: su estado no se sabe.`)
  return partes.join('\n')
}
