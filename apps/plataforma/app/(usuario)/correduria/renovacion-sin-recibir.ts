/**
 * «Vigente con la fecha de vencimiento pasada» NO es «vencida sin gestionar».
 *
 * Caso fundacional (23/09/2026): Vencimientos pintaba 10 pólizas de Mapfre en
 * rojo como «YA VENCIDAS y sin gestionar». Las diez tenían cobrada su última
 * anualidad hasta esa fecha, y Mapfre (C0058) no mandaba un solo fichero por
 * CIMA desde el 23/06. Alberto: «no tiene sentido».
 *
 * Tenía razón: el contrato de seguro se prorroga solo (LCS art. 22) salvo que
 * alguien lo anule. Si la compañía no manda ni la anualidad nueva ni la
 * anulación, lo que la BD dice es «no ha llegado la renovación», no «esto se ha
 * caído». Por eso estas filas van al final, en tono de aviso, y agrupadas con
 * la fecha del último fichero de CIMA de su compañía: lo que hay que hacer es
 * mirarlo en el portal de la compañía, no recuperar al cliente.
 *
 * Puro: sin React ni red, para poder probarlo.
 */

export type FilaRenovacion = {
  dias: number
  aseguradora: string
  prima: number | null
  fechaVencimiento: string
  ultimoFicheroCompania?: string | null
}

export type CompaniaSinRecibir = {
  aseguradora: string
  n: number
  /** `YYYY-MM-DD` del último fichero de CIMA, o `null` = no consta. */
  ultimoFichero: string | null
}

export type ResumenSinRecibir = {
  n: number
  /** Suma de las primas CONOCIDAS; las desconocidas van en `sinPrima`. */
  prima: number
  sinPrima: number
  companias: CompaniaSinRecibir[]
}

export function esRenovacionSinRecibir(p: Pick<FilaRenovacion, 'dias'>): boolean {
  return p.dias < 0
}

/** Primero lo que está por vencer (de antes a después); al final, lo que no ha llegado. */
export function ordenarRenovaciones<T extends Pick<FilaRenovacion, 'dias'>>(polizas: readonly T[]): T[] {
  const porVenir = polizas.filter(p => !esRenovacionSinRecibir(p))
  const sinRecibir = polizas.filter(esRenovacionSinRecibir)
  return [...porVenir, ...sinRecibir]
}

export function resumenSinRecibir(polizas: readonly FilaRenovacion[]): ResumenSinRecibir | null {
  const filas = polizas.filter(esRenovacionSinRecibir)
  if (filas.length === 0) return null
  const porCompania = new Map<string, CompaniaSinRecibir>()
  for (const p of filas) {
    const c = porCompania.get(p.aseguradora) ?? { aseguradora: p.aseguradora, n: 0, ultimoFichero: null }
    c.n += 1
    const f = p.ultimoFicheroCompania ?? null
    if (f !== null && (c.ultimoFichero === null || f > c.ultimoFichero)) c.ultimoFichero = f
    porCompania.set(p.aseguradora, c)
  }
  return {
    n: filas.length,
    prima: filas.reduce((s, p) => s + (p.prima ?? 0), 0),
    sinPrima: filas.filter(p => p.prima === null).length,
    companias: [...porCompania.values()].sort((a, b) => b.n - a.n),
  }
}

function fecha(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

/** La línea por compañía: de qué fecha es lo último que se sabe de ella. */
export function textoCompaniaSinRecibir(c: CompaniaSinRecibir): string {
  const cuantas = c.n === 1 ? '1 póliza' : `${c.n} pólizas`
  return c.ultimoFichero === null
    ? `${c.aseguradora} (${cuantas}): no consta cuándo mandó su último fichero por CIMA.`
    : `${c.aseguradora} (${cuantas}): su último fichero por CIMA es del ${fecha(c.ultimoFichero)}.`
}
