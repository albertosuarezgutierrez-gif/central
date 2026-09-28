// Aviso de Telegram para un correo de DEVOLUCIÓN de recibo (28/09/2026). PURO.
//
// Hasta este día el triaje avisaba con el asunto del correo («Reale Contabilidad - Med 38605 /
// Devolucion Recibos Banco 28-09-2026») y nada más: para saber de quién era había que abrir el correo,
// buscar la póliza y echar la cuenta del plazo a mano. Ahora el correo se lee
// (`leerCorreoDevolucion`), asegura lo registra, y el aviso dice quién, qué, cuánto, hasta cuándo y
// qué preguntar, con el enlace a su ficha.
//
// Tres desenlaces por fila, sin colapsar: registrada (con cliente y llamada creada), `sin_recibo` (la
// compañía avisa de un recibo que aún no está en la cartera: se enlazará solo al llegar) y — si el
// puerto no contestó — «no se pudo registrar», que manda a mirar el correo.

import type { LecturaCorreoDevolucion } from '@central/module-seguros'
import { eur } from '../dinero.ts'

export type ResultadoPuertoDevolucion = {
  idRecibo: string
  estado: 'registrada' | 'ya_registrada' | 'sin_recibo'
  clienteId: string | null
  cliente: string | null
  ramo: string | null
  compania: string | null
  importe: number | null
  fechaEfecto: string | null
  suspensionDesde: string | null
  tipoMotivo: string | null
  motivo: string | null
  tarea: 'abierta' | 'ya_habia' | 'no_aplica'
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const fechaEs = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const cola = (id: string): string => (id.length > 4 ? `…${id.slice(-4)}` : id)

const PISTA_MOTIVO: Record<string, string> = {
  cuenta: 'cuenta/titular: pedir el IBAN bueno',
  cliente_rechaza: 'lo devolvió el cliente: ¿se va o es precio?',
  fondos: 'sin fondos',
}

/** Lee la respuesta del puerto sin fiarse de su forma: una fila rara se descarta, no se inventa. */
export function leerResultadosPuerto(json: unknown): ResultadoPuertoDevolucion[] | null {
  if (typeof json !== 'object' || json === null) return null
  const r = (json as Record<string, unknown>).resultados
  if (!Array.isArray(r)) return null
  const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
  return r.flatMap((x): ResultadoPuertoDevolucion[] => {
    if (typeof x !== 'object' || x === null) return []
    const o = x as Record<string, unknown>
    const estado = o.estado === 'registrada' || o.estado === 'ya_registrada' || o.estado === 'sin_recibo' ? o.estado : null
    const idRecibo = txt(o.idRecibo)
    if (!estado || !idRecibo) return []
    const tarea = o.tarea === 'abierta' || o.tarea === 'ya_habia' ? o.tarea : 'no_aplica'
    return [{
      idRecibo, estado, tarea,
      clienteId: txt(o.clienteId), cliente: txt(o.cliente), ramo: txt(o.ramo), compania: txt(o.compania),
      importe: typeof o.importe === 'number' && Number.isFinite(o.importe) ? o.importe : null,
      fechaEfecto: txt(o.fechaEfecto), suspensionDesde: txt(o.suspensionDesde), tipoMotivo: txt(o.tipoMotivo), motivo: txt(o.motivo),
    }]
  })
}

/**
 * `resultados === null` = el puerto no contestó (o no hay config): se avisa con lo leído del correo
 * y se dice que NO está registrado.
 */
export function textoAvisoDevolucion(
  lectura: LecturaCorreoDevolucion,
  resultados: ResultadoPuertoDevolucion[] | null,
  urlFicha: (clienteId: string) => string,
): string {
  const compania = { reale: 'Reale', occident: 'Occident', mapfre: 'Mapfre' }[lectura.compania]
  const n = lectura.devoluciones.length
  const lineas: string[] = [`🧾 <b>${n === 1 ? 'Recibo DEVUELTO' : `${n} recibos DEVUELTOS`}</b> — ${compania}`]
  for (const d of lectura.devoluciones) {
    const r = resultados?.find((x) => x.idRecibo === d.idRecibo) ?? null
    const importe = r?.importe ?? d.importe
    const efecto = r?.fechaEfecto ?? d.fechaEfecto
    const quien = r?.cliente ? `<b>${esc(r.cliente)}</b>` : `recibo ${esc(cola(d.idRecibo))}`
    const cabeza = [quien, r?.ramo ? esc(r.ramo.replace(/_/g, ' ')) : null, importe !== null ? eur(importe) : null, efecto ? `efecto ${fechaEs(efecto)}` : null]
      .filter(Boolean).join(' · ')
    lineas.push(`• ${cabeza}`)
    if (d.motivo) {
      const pista = d.tipoMotivo ? PISTA_MOTIVO[d.tipoMotivo] : undefined
      lineas.push(`  Motivo: ${esc(d.motivo)}${pista ? ` (${pista})` : ''}`)
    }
    if (resultados === null) continue
    if (!r) { lineas.push('  ⚠️ asegura no devolvió esta fila: míralo en el correo.'); continue }
    if (r.estado === 'sin_recibo') {
      lineas.push('  ❔ Ese recibo aún no está en la cartera: queda anotado y se marcará solo cuando llegue.')
      continue
    }
    if (r.suspensionDesde) lineas.push(`  ⏳ La cobertura queda en suspenso el ${fechaEs(r.suspensionDesde)} si no paga`)
    const tarea = r.tarea === 'abierta' ? '📞 Llamada creada en «Tareas de hoy»' : r.tarea === 'ya_habia' ? '📞 Ya tenía llamada abierta' : 'ℹ️ Póliza no vigente: sin llamada'
    lineas.push(`  ${tarea}${r.clienteId ? ` · <a href="${esc(urlFicha(r.clienteId))}">ficha</a>` : ''}${r.estado === 'ya_registrada' ? ' · (aviso repetido)' : ''}`)
  }
  if (lectura.incidencias.length > 0) {
    lineas.push(`ℹ️ ${compania} intentó contactar por ${lectura.incidencias.length === 1 ? 'una incidencia' : 'incidencias'} en el recibo ${lectura.incidencias.map((i) => esc(cola(i.idRecibo))).join(', ')} (no dice que esté devuelto).`)
  }
  if (lectura.ilegibles > 0) lineas.push(`⚠️ ${lectura.ilegibles} fila(s) del correo no se han sabido leer: míralo.`)
  if (resultados === null && n > 0) lineas.push('⚠️ No se pudo registrar en la cartera (asegura no contestó): la ficha y las tareas NO lo saben todavía.')
  return lineas.join('\n')
}
