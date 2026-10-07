// Recomendación de una oportunidad (08/10/2026): lectura PURA de la respuesta JSON de
// `/api/correduria/tarificador/oportunidad/[id]/propuesta?formato=json` (asegura). Lo que no se entiende no se pinta.
// 🚨 Solo descarga: nada de aquí envía la propuesta al cliente.

export type OfertaRevisada = {
  compania: string
  producto: string
  primaAnualEur: number
  /** `false` = errores de calidad: sale con aviso y NO se recomienda. */
  recomendable: boolean
  errores: string[]
  avisos: string[]
}

export type VistaRecomendacion = {
  recomendada: { compania: string; producto: string; puntos: number; motivos: string[]; reservas: string[]; empate: boolean } | null
  ofertas: OfertaRevisada[]
  avisos: string[]
}

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
const textos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [])
const mensajes = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => obj(x)?.mensaje).filter((m): m is string => typeof m === 'string' && m.trim() !== '') : []

/** JSON de la propuesta → vista, o `null` si no es la forma conocida (`estado: 'ok'` con ofertas). */
export function leerRecomendacion(v: unknown): VistaRecomendacion | null {
  const o = obj(v)
  if (!o || o.estado !== 'ok' || !Array.isArray(o.ofertas)) return null
  const ofertas: OfertaRevisada[] = []
  for (const x of o.ofertas) {
    const r = obj(x)
    const calidad = obj(r?.calidad)
    if (!r || typeof r.compania !== 'string' || typeof r.primaAnualEur !== 'number' || !Number.isFinite(r.primaAnualEur) || typeof r.recomendable !== 'boolean') continue
    ofertas.push({
      compania: r.compania, producto: typeof r.producto === 'string' ? r.producto : '', primaAnualEur: r.primaAnualEur,
      recomendable: r.recomendable, errores: mensajes(calidad?.errores), avisos: mensajes(calidad?.avisos),
    })
  }
  const rec = obj(o.recomendada)
  const recomendada = rec && typeof rec.compania === 'string' && typeof rec.puntos === 'number'
    ? { compania: rec.compania, producto: typeof rec.producto === 'string' ? rec.producto : '', puntos: rec.puntos, motivos: textos(rec.motivos), reservas: textos(rec.reservas), empate: rec.empate === true }
    : null
  return { recomendada, ofertas, avisos: textos(o.avisos) }
}

/** Clave de lo que hay que releer: los trabajos que ya tienen oferta. Cambia cuando llega un resultado nuevo. */
export function claveTrabajosConOferta(trabajos: readonly { id: string; estado: string; ofertas: readonly unknown[] }[]): string {
  return trabajos.filter((t) => t.estado === 'ok' && t.ofertas.length > 0).map((t) => t.id).sort().join(',')
}
