import type {
  ElaboracionTraza,
  ParteElaboracion,
  PuntoControl,
  TipoControl,
  UbicacionEvento,
  Ingrediente,
  RegistroDesinfeccion,
} from './types.ts'

/** Un ingrediente del escandallo: cantidad POR PAX (el sistema multiplica por comensales). */
export interface EscandalloIngrediente {
  nombre: string
  por_pax: number             // cantidad por comensal (en `unidad`)
  unidad?: string             // 'g' | 'ml' | 'u' … (por defecto 'g')
  desinfeccion?: RegistroDesinfeccion | null
  descongelacion?: boolean
}

/** Ficha de catálogo: la "receta" reutilizable de una elaboración. */
export interface FichaCatalogo {
  id: string
  nombre: string
  partida: string                    // 'frio' | 'caliente' | 'corte' | 'montaje'
  depende_de?: string[]              // sub-elaboraciones (MAYÚSCULAS)
  ingredientes: EscandalloIngrediente[]
  controles: TipoControl[]           // puntos de control que aplican a esta elaboración
  requiere_muestra?: boolean         // ¿se guarda muestra testigo?
  min_por_pax?: number               // tiempo de producción por comensal (para el reparto)
}

/** Un evento de entrada: a qué elaboraciones del catálogo da servicio. */
export interface EventoInput {
  id: string
  nombre: string
  pax: number
  fecha?: string | null
  fecha_evento: string
  elaboraciones: string[]            // ids del catálogo servidos en este evento
}

function formatCantidad(total: number, unidad: string): string {
  // Pasa a kg/L cuando es grande, para que el parte se lea bien.
  if ((unidad === 'g' || unidad === 'ml') && total >= 1000) {
    const grande = total / 1000
    const u = unidad === 'g' ? 'kg' : 'L'
    return `${Number(grande.toFixed(grande < 10 ? 1 : 0))} ${u}`
  }
  return `${Math.round(total)} ${unidad}`
}

/**
 * GENERA el parte de elaboración SOLO a partir del catálogo + los eventos.
 * Para cada elaboración servida en ≥1 evento:
 *  - une las ubicaciones/eventos que la sirven,
 *  - suma sus PAX y multiplica el escandallo → cantidades reales,
 *  - asigna los puntos de control de su ficha (sin registrar: se rellenan en cocina),
 *  - marca si requiere muestra testigo.
 * El resultado es un `ParteElaboracion` listo para trabajar (lote/proveedor en blanco).
 */
export function generarParte(catalogo: FichaCatalogo[], eventos: EventoInput[]): ParteElaboracion {
  const fichaPorId = new Map(catalogo.map(f => [f.id, f]))

  // Ubicaciones del parte (los eventos de entrada, normalizados).
  const ubicaciones: UbicacionEvento[] = eventos.map(e => ({
    id: e.id, nombre: e.nombre, pax: e.pax, fecha: e.fecha ?? null, fecha_evento: e.fecha_evento,
  }))

  // Para cada elaboración: qué eventos la sirven (en orden de aparición del catálogo).
  const eventosPorElab = new Map<string, EventoInput[]>()
  for (const ev of eventos) {
    for (const elabId of ev.elaboraciones) {
      if (!fichaPorId.has(elabId)) continue
      const lista = eventosPorElab.get(elabId) ?? []
      lista.push(ev)
      eventosPorElab.set(elabId, lista)
    }
  }

  const elaboraciones: ElaboracionTraza[] = []
  for (const ficha of catalogo) {
    const evs = eventosPorElab.get(ficha.id)
    if (!evs || evs.length === 0) continue
    const paxTotal = evs.reduce((a, e) => a + e.pax, 0)

    const ingredientes: Ingrediente[] = ficha.ingredientes.map(ing => ({
      nombre: ing.nombre,
      cantidad: formatCantidad(ing.por_pax * paxTotal, ing.unidad ?? 'g'),
      lote: '',
      proveedor: '',
      desinfeccion: ing.desinfeccion ?? null,
      descongelacion: ing.descongelacion,
    }))

    const controles: PuntoControl[] = ficha.controles.map(tipo => ({ tipo, valor: null, hora: null }))

    elaboraciones.push({
      id: ficha.id,
      nombre: ficha.nombre,
      partida: ficha.partida,
      ubicaciones: evs.map(e => e.id),
      depende_de: ficha.depende_de,
      ingredientes,
      controles,
      muestra_testigo: ficha.requiere_muestra ? null : false,
      entrada: {},
      salida: {},
      firma: null,
    })
  }

  // Semana derivada de la primera fecha de evento (texto legible dd/m/yyyy).
  const primera = eventos[0]?.fecha_evento ?? ''
  return { semana: primera, ubicaciones, elaboraciones }
}

/** PAX total del parte (suma de los eventos). */
export function paxTotal(parte: ParteElaboracion): number {
  return parte.ubicaciones.reduce((a, u) => a + u.pax, 0)
}
