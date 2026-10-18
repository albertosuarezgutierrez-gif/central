// Sexo del conductor para los bots de VEHÍCULO (18/10/2026). PURO: sin BD ni red.
//
// Allianz Moto no tiene «sin dato» en sexo (asumiría «Hombre»). Si el formulario no lo trae, asegura lo toma del TRATAMIENTO de
// la ficha (`clientes.saludo`: '1' = Sr., '2' = Sra.; `sexoDeSaludo`, la misma regla que la cartera da a Codeoscopic) al
// ENCOLAR, SOLO cuando el conductor es el propio cliente (tomador que conduce). Sin tratamiento traducible ('3', vacío) no se
// pone nada: `faltanParaTarificar` dirá que falta el sexo (nunca se inventa). Lo que trae el formulario manda.
import { sexoDeSaludo } from './codeoscopic/desde-cartera.ts'

const esObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const conSexo = (c: Record<string, unknown>) => c.sexo === 'hombre' || c.sexo === 'mujer'

/** ¿Hace falta leer el tratamiento de la ficha? Vehículo, sin sexo del conductor y conductor = tomador (no `false`). PURA. */
export function necesitaSexoDeFicha(ramo: string, riesgo: unknown): boolean {
  if (ramo !== 'moto' && ramo !== 'auto') return false
  if (!esObj(riesgo) || riesgo.tomadorEsConductor === false) return false
  const c = esObj(riesgo.conductor) ? riesgo.conductor : {}
  return !conSexo(c)
}

/** El riesgo con `conductor.sexo` del tratamiento de la ficha si hace falta y se puede; si no, el MISMO riesgo. PURA. */
export function aplicarSexoDeFicha<T>(ramo: string, riesgo: T, saludo: string | null): T {
  if (!necesitaSexoDeFicha(ramo, riesgo)) return riesgo
  const sexo = sexoDeSaludo(saludo)
  if (!sexo) return riesgo
  const r = riesgo as Record<string, unknown>
  return { ...r, conductor: { ...(esObj(r.conductor) ? r.conductor : {}), sexo } } as T
}
