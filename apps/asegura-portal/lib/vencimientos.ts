// Fuente única de «Tus vencimientos» (pieza 1-5): qué pólizas entran en la
// ventana y qué prima se enseña como «pagas ahora». La leen la bóveda (para
// decidir si pide las peticiones al puente y para pintar el bloque) y la página
// «Mejorar el precio». Si cada una llevara su copia, podrían discrepar: la
// bóveda dejaría de pedir las peticiones mientras el bloque sigue pintándose, y
// entonces `peticiones === null` («no se pudo saber») enseñaría el botón a quien
// ya lo pidió.
import { diasHastaVencimientoPortal, enVentanaVencimientos } from '@central/module-seguros-portal'

import type { PolizaPortal } from './cartera-lectura.ts'

export type Vencimiento = { p: PolizaPortal; dias: number | null }

/**
 * El criterio de PROPIEDAD/VIGOR de la acción «mejorar el precio»: el mismo que aplica el puente de asegura
 * (`pedirMejorarPrecio`: ficha vinculada + `sqlCarteraEnVigor`, que exige `sustituida_at IS NULL`). Si la lista
 * enseñara algo que el puente rechaza, el cliente vería «No encontramos esta póliza entre las tuyas».
 */
export function ofrecibleParaMejorarPrecio(p: Pick<PolizaPortal, 'vigencia' | 'sustituidaAt'>): boolean {
  return p.vigencia === 'vigente' && (p.sustituidaAt ?? null) === null
}

/**
 * Lo que renueva en la ventana, del más cercano al más lejano. Solo en vigor y
 * con fecha; una fecha ya pasada no entra (la compañía no ha mandado la
 * renovación y decir «renovó» sería afirmar algo que no sabemos).
 */
export function vencimientosEnVentana(
  polizas: PolizaPortal[],
  hoyIso: string,
  /** Pólizas con baja en marcha (`polizasConBajaEnMarcha`). Una póliza que se da de baja no «renueva». */
  conBaja: ReadonlySet<string> = new Set(),
): Vencimiento[] {
  return polizas
    .filter((p) => ofrecibleParaMejorarPrecio(p) && !conBaja.has(p.id) && p.fechaVencimiento !== null)
    .map((p) => ({ p, dias: diasHastaVencimientoPortal(p.fechaVencimiento!.toISOString().slice(0, 10), hoyIso) }))
    .filter((f) => enVentanaVencimientos(f.dias))
    .sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0))
}

/**
 * La prima que paga hoy: la bruta (lo que se cobra de verdad) y, si no está, la
 * anual. Un 0 guardado no es una prima: se calla, igual que asegura (`nullif(…, 0)`).
 */
export function primaQuePaga(prima: PolizaPortal['prima']): number | null {
  const leida = prima?.bruta ?? prima?.anual ?? null
  return leida !== null && leida > 0 ? leida : null
}
