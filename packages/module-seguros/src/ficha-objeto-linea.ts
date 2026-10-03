/**
 * Una LÍNEA con lo más útil de la ficha del bien (CIMA) para las listas del
 * operador (pólizas de la ficha del cliente, renovaciones), y los datos del
 * conductor de la póliza. Puro y testeado.
 *
 * Los códigos EIAC (combustible, uso, clase, zona) van CRUDOS: el repo no
 * documenta su significado y no se traducen a ojo (ver `fichaObjeto`).
 * `null` = no hay nada que decir: la celda omite la línea, nunca pinta «—».
 */
import { fechaPintable } from './fecha-pintable.ts'
import { ETIQUETA_POTENCIA, ETIQUETA_USO_VEHICULO, type DatoObjeto } from './objeto.ts'

const MAX_PIEZAS = 3

/** Orden de preferencia: etiqueta de `fichaObjeto` → cómo se escribe en la línea. */
const PIEZAS: Array<{ etiqueta: string; formato: (v: string) => string | null }> = [
  { etiqueta: 'Matriculación', formato: (v) => { const m = /(\d{4})\s*$/.exec(v); return m ? `Matriculación ${m[1]}` : null } },
  { etiqueta: ETIQUETA_POTENCIA, formato: (v) => `Potencia ${v}` },
  { etiqueta: 'Combustible', formato: (v) => `Combustible ${v}` },
  { etiqueta: 'Clase de inmueble', formato: (v) => `Clase ${v}` },
  { etiqueta: 'Uso', formato: (v) => `Uso ${v}` },
  { etiqueta: ETIQUETA_USO_VEHICULO, formato: (v) => `Uso ${v} (cód. compañía)` },
  { etiqueta: 'Zona', formato: (v) => `Zona ${v}` },
  { etiqueta: 'Valor del vehículo', formato: (v) => `Valor ${v}` },
]

export function lineaFichaObjeto(ficha: DatoObjeto[] | null | undefined): string | null {
  if (!Array.isArray(ficha) || ficha.length === 0) return null
  const por = new Map<string, string>()
  for (const d of ficha) {
    const v = typeof d?.valor === 'string' ? d.valor.trim() : ''
    if (v !== '' && !por.has(d.etiqueta)) por.set(d.etiqueta, v)
  }
  const piezas: string[] = []
  for (const p of PIEZAS) {
    if (piezas.length >= MAX_PIEZAS) break
    const v = por.get(p.etiqueta)
    if (v === undefined) continue
    const t = p.formato(v)
    if (t !== null) piezas.push(t)
  }
  return piezas.length > 0 ? piezas.join(' · ') : null
}

/** `AAAA-MM-DD…` o `dd/mm/aaaa` → `dd/mm/aaaa`; cualquier otra cosa (cifrado, fecha imposible) → `null`. */
function fechaEs(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  let a: string, m: string, d: string
  let r = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  if (r) [, a, m, d] = r
  else if ((r = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t))) [, d, m, a] = r
  else return null
  const f = new Date(`${a}-${m}-${d}T00:00:00Z`)
  if (Number.isNaN(f.getTime()) || f.toISOString().slice(0, 10) !== `${a}-${m}-${d}`) return null
  return fechaPintable(`${a}-${m}-${d}`)
}

/** Carné y nacimiento del conductor para la tarjeta de personas de la póliza. Solo roles `conductor_*`. */
export function lineaConductor(i: { rol: string; fechaCarnet?: string | null; fechaNacimiento?: string | null }): string | null {
  if (!i.rol.startsWith('conductor')) return null
  const carnet = fechaEs(i.fechaCarnet)
  const nac = fechaEs(i.fechaNacimiento)
  const piezas = [carnet ? `Carné según la compañía, desde el ${carnet}` : null, nac ? `Nacimiento ${nac}` : null].filter((x): x is string => x !== null)
  return piezas.length > 0 ? piezas.join(' · ') : null
}
