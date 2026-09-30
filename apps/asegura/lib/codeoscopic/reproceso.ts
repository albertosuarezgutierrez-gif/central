// ─── Re-procesar respuestas REALES guardadas (30/09/2026) ────────────────────
//
// Desde el 29/09/2026 cada cotización guarda la respuesta ENTERA del vendor
// (`tarificaciones.respuesta`). Con eso, un cambio en el lector (`leerCotizacion`)
// se prueba contra cotizaciones de verdad sin volver a pagar 0,50€: se vuelve a
// leer cada respuesta con el código de HOY y se compara con lo que se guardó.
// Una diferencia es exactamente lo que ese cambio haría distinto en pantalla.
//
// PURO: entra la respuesta cruda y las filas guardadas; sale la lista de diferencias
// y los reparos de coherencia. La BD la pone `app/api/operador/codeoscopic/reproceso`.
// Los fixtures escritos a mano se escriben con la misma suposición que el código;
// esto compara contra lo que la compañía mandó de verdad.

import { revisarCoherenciaCotizacion, type ReparoCotizacion } from '@central/module-seguros'
import { leerCotizacion, type Precio } from './respuesta.ts'

export type FilaGuardadaReproceso = {
  compania: string | null
  categoria: string | null
  modalidad: string | null
  primaEur: number | null
  franquiciaEur: number | null
  idPrecio: string | null
}

export type DiferenciaReproceso =
  | { tipo: 'falta'; clave: string } // se guardó y hoy el lector ya no la saca
  | { tipo: 'sobra'; clave: string } // hoy el lector saca una que no se guardó
  | { tipo: 'cambia'; clave: string; campo: 'categoria' | 'modalidad' | 'primaEur' | 'franquiciaEur'; antes: unknown; ahora: unknown }

export type ResultadoReproceso =
  | { estado: 'ok'; precios: number; diferencias: DiferenciaReproceso[]; reparos: ReparoCotizacion[] }
  | { estado: 'ilegible'; motivo: string }

const norm = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

/** Llave de emparejamiento: el id del vendor si la fila lo tiene; si no (filas anteriores al
 *  29/09/2026), compañía + nivel + modalidad. */
function clave(p: { idPrecio: string | null; compania: string | null; categoria: string | null; modalidad: string | null }): string {
  return p.idPrecio && p.idPrecio.trim() !== '' ? `id:${p.idPrecio.trim()}` : `${norm(p.compania)}|${norm(p.categoria)}|${norm(p.modalidad)}`
}

function comoFila(p: Precio): FilaGuardadaReproceso {
  return {
    compania: p.compania,
    categoria: p.categoria,
    modalidad: p.modalidad,
    primaEur: p.primaEur,
    franquiciaEur: p.franquiciaEur,
    idPrecio: typeof p.id === 'string' && p.id.trim() !== '' ? p.id.trim() : null,
  }
}

const igualNumero = (a: number | null, b: number | null) =>
  a === null || b === null ? a === b : Math.abs(a - b) < 0.005

export function compararReproceso(crudo: unknown, guardadas: readonly FilaGuardadaReproceso[]): ResultadoReproceso {
  let precios: Precio[]
  try {
    precios = leerCotizacion(crudo).precios
  } catch (e) {
    return { estado: 'ilegible', motivo: e instanceof Error ? e.message : String(e) }
  }
  // Con id en las guardadas se empareja por id; si la guardada no lo tiene, la de hoy tampoco
  // puede usarlo (serían llaves distintas para la misma opción).
  const usarId = guardadas.some((g) => g.idPrecio && g.idPrecio.trim() !== '')
  const hoy = precios.map(comoFila).map((f) => (usarId ? f : { ...f, idPrecio: null }))

  const antes = new Map<string, FilaGuardadaReproceso[]>()
  for (const g of guardadas) antes.set(clave(g), [...(antes.get(clave(g)) ?? []), g])
  const diferencias: DiferenciaReproceso[] = []
  for (const f of hoy) {
    const k = clave(f)
    const lista = antes.get(k)
    const g = lista?.shift()
    if (!g) {
      diferencias.push({ tipo: 'sobra', clave: k })
      continue
    }
    for (const campo of ['categoria', 'modalidad'] as const) {
      if (norm(g[campo]) !== norm(f[campo])) diferencias.push({ tipo: 'cambia', clave: k, campo, antes: g[campo], ahora: f[campo] })
    }
    for (const campo of ['primaEur', 'franquiciaEur'] as const) {
      if (!igualNumero(g[campo], f[campo])) diferencias.push({ tipo: 'cambia', clave: k, campo, antes: g[campo], ahora: f[campo] })
    }
  }
  for (const [k, resto] of antes) for (const _ of resto) diferencias.push({ tipo: 'falta', clave: k })

  return { estado: 'ok', precios: precios.length, diferencias, reparos: revisarCoherenciaCotizacion(precios) }
}
