// Adaptador de presupuestos de evento: mapea `presupuestos_evento` (tarificación de
// catering: precio_adulto/_nino + costes desglosados) al modelo genérico de
// @central/module-presupuestos (líneas + costes), para reutilizar su cálculo de margen.
import type {
  CosteLinea,
  LineaPresupuesto,
  Presupuesto,
  PresupuestoAdapter,
} from '@central/module-presupuestos'

// Campos de tarificación/coste que produce el cliente (subconjunto del body / la fila).
export interface TarifaEvento {
  adultos?: number | null
  ninos?: number | null
  food_cost_adulto?: number | null
  food_cost_nino?: number | null
  barra_coste?: number | null
  operativos_coste?: number | null
  transporte_coste?: number | null
  alquiler_espacio_coste?: number | null
}

export interface PresupuestoEventoRow extends TarifaEvento {
  id: string
  evento_id: string | null
  precio_adulto: number | null
  precio_nino: number | null
  total: number | null
  descuento_aplicado_pct: number | null
  estado: string | null
}

// Construye las líneas de coste (genéricas) desde la tarificación de catering.
export function costesDeEvento(t: TarifaEvento): CosteLinea[] {
  return [
    { concepto: 'Comida adultos', importe: (t.food_cost_adulto ?? 0) * (t.adultos ?? 0), categoria: 'ingredientes' },
    { concepto: 'Comida niños', importe: (t.food_cost_nino ?? 0) * (t.ninos ?? 0), categoria: 'ingredientes' },
    { concepto: 'Barra', importe: t.barra_coste ?? 0, categoria: 'servicios' },
    { concepto: 'Operativos', importe: t.operativos_coste ?? 0, categoria: 'servicios' },
    { concepto: 'Transporte', importe: t.transporte_coste ?? 0, categoria: 'servicios' },
    { concepto: 'Alquiler espacio', importe: t.alquiler_espacio_coste ?? 0, categoria: 'otros' },
  ]
}

export const presupuestoEventoAdapter: PresupuestoAdapter<PresupuestoEventoRow> = {
  toPresupuesto(row): Presupuesto {
    const lineas: LineaPresupuesto[] = [
      { concepto: 'Menú adulto', cantidad: row.adultos ?? 0, unidad: 'pax', precioUnitario: row.precio_adulto ?? 0, categoria: 'ingredientes' },
      { concepto: 'Menú niño', cantidad: row.ninos ?? 0, unidad: 'pax', precioUnitario: row.precio_nino ?? 0, categoria: 'ingredientes' },
    ]
    return {
      id: row.id,
      parent: row.evento_id ? { parentId: row.evento_id, parentType: 'evento' } : undefined,
      lineas,
      costes: costesDeEvento(row),
      descuento: row.descuento_aplicado_pct ? { porcentaje: row.descuento_aplicado_pct } : null,
      estado: (row.estado ?? 'borrador') as Presupuesto['estado'],
    }
  },
  fromPresupuesto(p): PresupuestoEventoRow {
    const adulto = p.lineas.find(l => l.concepto === 'Menú adulto')
    const nino = p.lineas.find(l => l.concepto === 'Menú niño')
    return {
      id: p.id ?? '',
      evento_id: p.parent?.parentId ?? null,
      adultos: adulto?.cantidad ?? null,
      ninos: nino?.cantidad ?? null,
      precio_adulto: adulto?.precioUnitario ?? null,
      precio_nino: nino?.precioUnitario ?? null,
      food_cost_adulto: null,
      food_cost_nino: null,
      barra_coste: null,
      operativos_coste: null,
      transporte_coste: null,
      alquiler_espacio_coste: null,
      total: null,
      descuento_aplicado_pct: p.descuento?.porcentaje ?? null,
      estado: p.estado,
    }
  },
}
