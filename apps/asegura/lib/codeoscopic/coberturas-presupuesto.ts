// Coberturas de cada opción de un presupuesto, leídas GRATIS de Codeoscopic al prepararlo.
//
// Camino (todo son lecturas, ninguna cotiza ni confirma nada):
//   1. `GET /insurances/{projectId}` → los precios con su `ofertaId` (`ofertasPorPrecio`).
//      `tarificacion_precios` NO guarda el `ofertaId`, así que se rehace casando cada opción
//      congelada con su precio: por `referencia_vendor` y, si no, por compañía + producto + prima.
//   2. Por cada opción con oferta: `GET /insurances/{id}/offers/{offerId}/coverages`.
//
// 🚨 PURO (sin BD ni red): las dos llamadas entran inyectadas. Así se prueba sin tocar el vendor.
//
// 🚨 Y el resultado distingue CUATRO cosas, porque `[]` a secas se leería como «no cubre nada»:
//   · `leidas`     → la compañía mandó su lista (con al menos una cobertura).
//   · `vacias`     → la compañía respondió, y la lista vino VACÍA. Es un dato, no un fallo.
//   · `fallo`      → no se pudo leer (red, 4xx/5xx, presupuesto de tiempo agotado).
//   · `sin_oferta` → ese precio no tiene oferta en el proyecto (no todo precio la tiene: en el
//                    ejemplo público, 26 precios y 15 ofertas) o no se ha podido casar con ninguno.
// y el «no intentado» es no tener sobre: las filas viejas (`[]` desnudo) y las simuladas.

import { leerCoberturas, type Cobertura } from './coberturas.ts'
import type { Cotizacion, Precio } from './respuesta.ts'

export type EstadoCoberturas = 'leidas' | 'vacias' | 'fallo' | 'sin_oferta'

/** Lo que se guarda en `presupuesto_opcion.coberturas` (jsonb). Un OBJETO, no un array: el
 *  array desnudo `[]` es el default de la columna y significa «no se intentó». */
export type SobreCoberturas = { estado: EstadoCoberturas; lista: Cobertura[] | null; leidasAt: string }

export type OpcionACasar = {
  compania: string
  producto: string
  primaEur: number
  referenciaVendor: string | null
}

const norm = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * El precio del proyecto que corresponde a una opción congelada. Primero por `referencia_vendor`
 * (única y literal); si no la hay, compañía + producto + prima al céntimo. Con dos candidatos
 * igual de buenos NO se elige ninguno: leer las coberturas de otra oferta sería peor que no leerlas.
 */
export function casarPrecio(o: OpcionACasar, precios: readonly Precio[]): Precio | null {
  if (o.referenciaVendor) {
    const porRef = precios.filter((p) => p.referenciaVendor === o.referenciaVendor)
    if (porRef.length === 1) return porRef[0]
  }
  const candidatos = precios.filter(
    (p) => norm(p.compania) === norm(o.compania) && norm(p.producto) === norm(o.producto) && Math.abs(p.primaEur - o.primaEur) < 0.005,
  )
  return candidatos.length === 1 ? candidatos[0] : null
}

/** Una promesa con tope de tiempo. Pasado el tope, rechaza (y cuenta como `fallo`). */
function conTope<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('presupuesto_de_tiempo_agotado')), Math.max(0, ms))
    p.then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}

/**
 * Lee las coberturas de cada opción. **Nunca lanza**: best-effort con presupuesto de tiempo
 * TOTAL (`presupuestoMs`), porque quien prepara el presupuesto es Alberto esperando en pantalla y
 * las coberturas son un extra — sin ellas el presupuesto sigue saliendo, y lo DICE.
 *
 * Devuelve un sobre por opción, en el mismo orden.
 */
export async function leerCoberturasDeOpciones(
  opciones: readonly OpcionACasar[],
  deps: {
    refrescar: () => Promise<Cotizacion>
    coberturas: (ofertaId: string) => Promise<unknown>
    ahora?: () => Date
  },
  presupuestoMs = 8_000,
): Promise<SobreCoberturas[]> {
  const ahora = deps.ahora ?? (() => new Date())
  const sello = () => ahora().toISOString()
  const inicio = Date.now()
  const queda = () => presupuestoMs - (Date.now() - inicio)

  let precios: Precio[]
  try {
    precios = (await conTope(deps.refrescar(), queda())).precios
  } catch (e) {
    console.warn('[presupuesto/coberturas] no se pudo releer el proyecto:', e instanceof Error ? e.message : e)
    return opciones.map(() => ({ estado: 'fallo', lista: null, leidasAt: sello() }))
  }

  return Promise.all(
    opciones.map(async (o): Promise<SobreCoberturas> => {
      const precio = casarPrecio(o, precios)
      if (!precio || !precio.ofertaId) return { estado: 'sin_oferta', lista: null, leidasAt: sello() }
      try {
        const lista = leerCoberturas(await conTope(deps.coberturas(precio.ofertaId), queda()))
        return { estado: lista.length > 0 ? 'leidas' : 'vacias', lista, leidasAt: sello() }
      } catch (e) {
        console.warn(`[presupuesto/coberturas] ${o.compania}: no se pudieron leer:`, e instanceof Error ? e.message : e)
        // 🚨 `lista: null`, NUNCA `[]`: un fallo pintado como lista vacía diría «no cubre nada».
        return { estado: 'fallo', lista: null, leidasAt: sello() }
      }
    }),
  )
}

/**
 * Lee lo guardado en `presupuesto_opcion.coberturas`. Devuelve la lista SOLO si la compañía
 * respondió (`leidas` o `vacias`); en cualquier otro caso `null` = «no constan».
 * El `[]` desnudo (default de la columna, filas anteriores a esto) es «no se intentó» → `null`.
 */
export function coberturasDeSobre(v: unknown): { estado: EstadoCoberturas | 'no_intentado'; lista: Cobertura[] | null } {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { estado: 'no_intentado', lista: null }
  const s = v as Record<string, unknown>
  const estado = s.estado
  if (estado === 'leidas' || estado === 'vacias') {
    const lista = Array.isArray(s.lista)
      ? s.lista.flatMap((c): Cobertura[] => {
          const o = c && typeof c === 'object' ? (c as Record<string, unknown>) : {}
          const nombre = typeof o.nombre === 'string' && o.nombre.trim() ? o.nombre.trim() : null
          if (!nombre) return []
          return [{
            nombre,
            incluida: typeof o.incluida === 'boolean' ? o.incluida : null,
            texto: typeof o.texto === 'string' && o.texto.trim() ? o.texto.trim() : null,
          }]
        })
      : []
    return { estado, lista }
  }
  if (estado === 'fallo' || estado === 'sin_oferta') return { estado, lista: null }
  return { estado: 'no_intentado', lista: null }
}
