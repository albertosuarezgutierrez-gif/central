// Tipos del módulo TRANSPORTE (casa de marcas). Agnóstico de vertical y de BD.
// Modela el SERVICIO/ORDEN de transporte que un negocio de camiones presta tanto INTERNO a otro
// negocio del propio grupo (p. ej. flota → catering: candidato a eliminación intercompany) como
// EXTERNO a un cliente tercero (ingreso real). Es una de las dos verticales "nuevas" del diseño
// (docs/DISENO-modulos-materiales-flota.md §4); la otra es alquiler de materiales.
//
// Se COMPONE sobre:
//  - el patrón de agregado Encargo por id (`encargoId`; el package `module-encargo` se retiró
//    el 29/08/2026 sin consumidor),
//  - y `@central/module-flota` (vehículos/portes), referenciando los portes por id (`porteIds`).
//    La capa de servicio NO duplica la operativa de flota: el coste/rentabilidad de cada porte lo
//    calcula module-flota; aquí se agrega al nivel de servicio (precio al cliente, estado, factura).
//
// Costuras (seams) hacia otros módulos, solo por id / forma, nunca import de tipos de dominio:
//  - `encargoId`  → el Encargo del que cuelga este servicio (identidad común).
//  - `porteIds[]` → los Porte de module-flota que ejecutan el servicio.
//  - `sociedadOrigenId`/`sociedadDestinoId` + `aTerceros` → consolidación intercompany
//    (module-intercompany): un servicio INTERNO entre dos sociedades del holding se elimina;
//    uno a un tercero es ingreso real y NO se elimina.

export type EstadoServicio =
  | 'presupuestado'
  | 'planificado'
  | 'en_curso'
  | 'entregado'
  | 'facturado'
  | 'cancelado'

export interface ParentRef {
  parentId: string
  parentType: string // normalmente 'encargo' | 'evento'
}

export interface ServicioTransporte {
  id: string
  encargoId?: string | null // Encargo del que cuelga (patrón de agregado por id, tipo 'porte')
  clienteNombre?: string | null
  // true = servicio a un cliente TERCERO (ingreso externo real);
  // false = INTERNO, mueve recursos del propio grupo (candidato a intercompany).
  aTerceros: boolean
  origen?: string | null
  destino?: string | null
  fecha: string // ISO yyyy-mm-dd (fecha de servicio)
  estado: EstadoServicio
  porteIds: string[] // Porte(s) de module-flota que ejecutan el servicio
  // Precio de cierre del servicio al cliente (sin IVA). Si es null, se deriva del coste de los
  // portes con `sugerirImporte()`. Lo que se persiste y se usa para facturación/intercompany.
  importe?: number | null
  descuentoEur?: number | null // descuento absoluto en €
  notas?: string | null
  parent?: ParentRef
  // Costura intercompany (solo en servicios internos del holding):
  sociedadOrigenId?: string | null // sociedad que PRESTA el transporte (factura → ingreso)
  sociedadDestinoId?: string | null // sociedad que lo RECIBE (gasto)
}

export type NuevoServicioTransporte = Omit<ServicioTransporte, 'id'>

export interface ResumenServicios {
  porEstado: Record<EstadoServicio, number>
  activos: number // planificado + en_curso + entregado
  ingresosTerceros: number // Σ importe de servicios a terceros no cancelados
  totalInterno: number // Σ importe de servicios internos no cancelados (base intercompany)
}

// Forma de una operación intercompany derivada de un servicio interno (coincide con
// OperacionIntercompany de @central/module-intercompany SIN importarlo: solo la forma).
export interface OperacionIntercompanyDeTransporte {
  sociedadOrigenId: string
  sociedadDestinoId: string
  importe: number
  tipo: 'flota'
  parent: { parentId: string; parentType: 'porte' }
}

// PORT de adaptación: cada vertical mapea su fila de dominio ↔ ServicioTransporte.
export interface ServicioAdapter<TDominio> {
  toServicio(fila: TDominio): ServicioTransporte
  fromServicio(s: ServicioTransporte): TDominio
}
