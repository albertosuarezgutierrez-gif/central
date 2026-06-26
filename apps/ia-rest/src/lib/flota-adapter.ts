// Adaptador de flota: mapea las filas a medida de ia-rest (`vehiculos_grupo` y
// `evento_transporte`) al modelo genérico de @central/module-flota, para reutilizar su lógica
// (costes, rentabilidad, asignación). Mismo patrón que `crm-eventos.ts` (leads_evento → Oportunidad).
// Import SOLO de tipos: se borra en runtime (Node type-stripping), así el adaptador es puro.
import type { Vehiculo, Porte, TipoVehiculo, EstadoPorte } from '@central/module-flota'

// Fila mínima de `vehiculos_grupo` (columnas reales verificadas en la BD).
export interface VehiculoGrupoRow {
  id: string
  cuenta_id: string | null
  nombre: string
  matricula: string | null
  capacidad_kg: number | null
  capacidad_m3: number | null
  tipo: string | null
  es_propio: boolean | null
  proveedor_transporte: string | null
  tarifa_km: number | null
  tarifa_fija_evento: number | null
  activo: boolean | null
}

// Fila mínima de `evento_transporte` (columnas reales verificadas en la BD).
export interface EventoTransporteRow {
  id: string
  evento_id: string | null
  vehiculo_id: string
  conductor_id: string | null
  km_estimados: number | null
  km_reales: number | null
  coste_estimado: number | null
  coste_real: number | null
  hora_salida: string | null
  hora_llegada: string | null
}

export function vehiculoFromRow(row: VehiculoGrupoRow): Vehiculo {
  return {
    id: row.id,
    cuentaId: row.cuenta_id ?? '',
    nombre: row.nombre,
    matricula: row.matricula ?? '',
    tipo: (row.tipo ?? 'furgon') as TipoVehiculo,
    capacidadKg: row.capacidad_kg,
    capacidadM3: row.capacidad_m3,
    esPropio: row.es_propio ?? true,
    proveedorTransporte: row.proveedor_transporte,
    tarifaKm: row.tarifa_km,
    // En ia-rest la tarifa fija por porte se llama `tarifa_fija_evento`.
    tarifaFija: row.tarifa_fija_evento,
    activo: row.activo ?? true,
  }
}

// `evento_transporte` no tiene columna de estado: se deriva (con km reales → completado).
export function porteFromRow(row: EventoTransporteRow): Porte {
  const estado: EstadoPorte = row.km_reales != null ? 'completado' : 'planificado'
  return {
    id: row.id,
    parent: row.evento_id ? { parentId: row.evento_id, parentType: 'evento' } : undefined,
    vehiculoId: row.vehiculo_id,
    conductorId: row.conductor_id,
    estado,
    kmEstimados: row.km_estimados,
    kmReales: row.km_reales,
    costeEstimado: row.coste_estimado,
    costeReal: row.coste_real,
    horaSalida: row.hora_salida,
    horaLlegada: row.hora_llegada,
  }
}
