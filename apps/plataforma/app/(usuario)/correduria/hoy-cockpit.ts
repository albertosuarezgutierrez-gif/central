/**
 * La lógica del cockpit «Hoy» sin JSX (pieza 1-4 de ASegura OS, maqueta
 * aprobada el 23/09/2026), para poder probarla con `node --test`.
 *
 * Tres estados en todo lo que se cuenta: número, `0` y `null` = «no se ha
 * podido mirar». Un cockpit que dice «0 incidencias» porque una lectura falló
 * es peor que no tener cockpit.
 */
import type { EmbudoPortal } from '@central/module-seguros'
import { veredictoIngesta, type VistaIngesta } from '../../../lib/correduria/ingesta-pantalla.ts'

export type LineaEstado = { tono: 'ok' | 'aviso' | 'malo' | 'cargando'; texto: string }

/** La línea de salud bajo la franja: CIMA al día o no, y desde cuándo. */
export function lineaEstadoIngesta(v: VistaIngesta | null): LineaEstado {
  const ver = veredictoIngesta(v)
  if (ver === null) return { tono: 'cargando', texto: 'Comprobando CIMA…' }
  if (ver === 'sin_comprobar' || v === null || v.estado !== 'ok') return { tono: 'aviso', texto: 'CIMA sin comprobar: mira «Ingesta»' }
  const pull = v.salud.ultimoPull
  const cuando = pull === null ? 'sin pull registrado' : pull.horas < 1 ? 'último pull hace menos de 1 h' : `último pull hace ${pull.horas} h`
  if (ver === 'incidencia') return { tono: 'malo', texto: `CIMA con incidencias · ${cuando}` }
  return { tono: 'ok', texto: `CIMA al día · ${cuando}` }
}

/** Días entre dos fechas aaaa-mm-dd (b − a). */
function dias(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/** «hoy», «ayer» o «vencida hace N d»: la vencida no se esconde entre las de hoy. */
export function cuandoTarea(fechaLimite: string, hoy: string): { texto: string; vencida: boolean } {
  const d = dias(fechaLimite, hoy)
  if (Number.isNaN(d) || d <= 0) return { texto: 'hoy', vencida: false }
  return { texto: d === 1 ? 'ayer' : `hace ${d} d`, vencida: true }
}

/**
 * Clientes con correo a los que aún no se ha invitado al portal. `null` si
 * falta cualquiera de las dos cuentas: restar un «no se sabe» daría un número
 * que parece cierto.
 */
export function sinInvitar(e: EmbudoPortal | null): number | null {
  if (e === null || e.conEmail === null || e.invitados === null) return null
  return Math.max(0, e.conEmail - e.invitados)
}
