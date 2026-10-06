// Fuente única de «Tus vencimientos» (pieza 1-5): qué pólizas entran en la
// ventana y qué prima se enseña como «pagas ahora». La leen la bóveda (para
// decidir si pide las peticiones al puente y para pintar el bloque) y la página
// «Mejorar el precio». Si cada una llevara su copia, podrían discrepar: la
// bóveda dejaría de pedir las peticiones mientras el bloque sigue pintándose, y
// entonces `peticiones === null` («no se pudo saber») enseñaría el botón a quien
// ya lo pidió.
import { diasHastaVencimientoPortal, enVentanaVencimientos, nivelPuedeOperar } from '@central/module-seguros-portal'

import type { PolizaPortal } from './cartera-lectura.ts'

export type Vencimiento = { p: PolizaPortal; dias: number | null }

/**
 * Solo los titulares (fichas propias) cuyo vínculo deja OPERAR (`gestionar`/`administrar`): el servidor rechaza
 * «mejorar el precio» y «solicitar baja» sobre una ficha vinculada de solo consulta (`sin_permiso`), así que el
 * portal no las ofrece ahí. NO relaja nada: solo quita lo que ya se rechazaba.
 */
export function titularesQueOperan<T extends { nivel: string }>(titulares: readonly T[]): T[] {
  return titulares.filter((t) => nivelPuedeOperar(t.nivel))
}

/**
 * El criterio de PROPIEDAD/VIGOR de la acción «mejorar el precio»: el mismo que aplica el puente de asegura
 * (`pedirMejorarPrecio`: ficha vinculada + `sqlCarteraEnVigor`, que exige `sustituida_at IS NULL`). Si la lista
 * enseñara algo que el puente rechaza, el cliente vería «No encontramos esta póliza entre las tuyas».
 */
export function ofrecibleParaMejorarPrecio(p: Pick<PolizaPortal, 'vigencia' | 'sustituidaAt'>): boolean {
  return enVigorParaActuar(p)
}

/**
 * «En vigor» a efectos de ACTUAR sobre la póliza (mejorar el precio, solicitar baja): el criterio de
 * `esCarteraEnVigor` de asegura — vigente y no sustituida. NO es `cuentaComoEnVigor` (esa es más ancha a
 * propósito, para listar/avisar: incluye «sin fecha» y «renovación sin confirmar»).
 */
export function enVigorParaActuar(p: Pick<PolizaPortal, 'vigencia' | 'sustituidaAt'>): boolean {
  return p.vigencia === 'vigente' && (p.sustituidaAt ?? null) === null
}

/**
 * ¿Se ofrece «Solicitar baja» en esta fila? Solo si el servidor la aceptaría: en vigor para actuar y sin baja
 * en marcha. `bajasAbiertas === null` (no se pudo leer el puente) = no se ofrece: no se afirma que no haya.
 */
export function puedeOfrecerSolicitarBaja(
  p: Pick<PolizaPortal, 'id' | 'vigencia' | 'sustituidaAt'>,
  bajasAbiertas: ReadonlySet<string> | null,
): boolean {
  return bajasAbiertas !== null && enVigorParaActuar(p) && !bajasAbiertas.has(p.id)
}

/**
 * ¿La página «Mejorar el precio» aceptaría esta póliza (sin tener en cuenta la baja en marcha)? Mismo
 * predicado que la página y que el enlace de «Solicitar baja»: en vigor para actuar y con fecha de vencimiento.
 */
export function aceptaMejorarPrecio(p: Pick<PolizaPortal, 'vigencia' | 'sustituidaAt' | 'fechaVencimiento'>): boolean {
  return ofrecibleParaMejorarPrecio(p) && p.fechaVencimiento !== null
}

/**
 * Qué hace la página «Mejorar el precio» con una póliza. `conBaja === null` (no se pudo leer el puente) =
 * se conserva el comportamiento de siempre: no se inventa una baja.
 */
export function estadoMejorarPrecio(
  p: Pick<PolizaPortal, 'id' | 'vigencia' | 'sustituidaAt' | 'fechaVencimiento'>,
  conBaja: ReadonlySet<string> | null,
): 'ok' | 'no_disponible' | 'baja_en_marcha' {
  if (!aceptaMejorarPrecio(p)) return 'no_disponible'
  return conBaja !== null && conBaja.has(p.id) ? 'baja_en_marcha' : 'ok'
}

/**
 * ¿Se ENLAZA «Mejorar el precio» desde una fila? Solo si la página lo atendería (`estadoMejorarPrecio === 'ok'`:
 * en vigor, con fecha, sin baja en marcha — confirmadas incluidas, como la página) y el vínculo OPERA. Mismo
 * predicado que la página: si discreparan, el botón llevaría a un 404 o a «ya tiene una baja en marcha».
 * `conBaja` = `polizasConBajaEnMarcha(firmas, { conConfirmadas: true })`, o `null` si el puente no respondió.
 */
export function puedeOfrecerMejorarPrecio(
  p: Pick<PolizaPortal, 'id' | 'vigencia' | 'sustituidaAt' | 'fechaVencimiento'>,
  nivel: string,
  conBaja: ReadonlySet<string> | null,
): boolean {
  return nivelPuedeOperar(nivel) && estadoMejorarPrecio(p, conBaja) === 'ok'
}

/**
 * Quita de una lista de obligaciones las «renueva/vence» de pólizas con baja en marcha. Solo `tipo: 'poliza'`:
 * un recordatorio propio (ITV…) puede colgar del mismo `polizaId` y sigue siendo verdad. `conBaja === null`
 * (no se pudo leer) = la lista tal cual.
 */
export function sinObligacionesDePolizasConBaja<T extends { tipo: string; polizaId: string | null }>(
  filas: readonly T[],
  conBaja: ReadonlySet<string> | null,
): T[] {
  if (conBaja === null || conBaja.size === 0) return [...filas]
  return filas.filter((f) => !(f.tipo === 'poliza' && f.polizaId !== null && conBaja.has(f.polizaId)))
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
