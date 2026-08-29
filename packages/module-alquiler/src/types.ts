// Tipos del módulo ALQUILER de materiales (casa de marcas). Agnóstico de vertical y de BD.
// Modela el alquiler de material/menaje (mesas, sillas, vajilla, carpas…) tanto INTERNO a un
// evento del propio grupo como EXTERNO a un cliente tercero (ingreso real). Es una de las dos
// verticales "nuevas" del diseño (docs/DISENO-modulos-materiales-flota.md): usa el patrón de
// agregado Encargo por id (`encargoId`; el package `module-encargo` se retiró el 29/08/2026 sin
// consumidor) y referencia los materiales de `@central/module-materiales` por id — sin acoplar
// tipos entre módulos.
//
// Costuras (seams) hacia otros módulos, solo por id / forma, nunca import de tipos:
//  - `encargoId`  → el Encargo del que cuelga este alquiler (identidad común).
//  - `lineas[].materialId` → el Material alquilado (module-materiales).
//  - `sociedadOrigenId`/`sociedadDestinoId` + `aTerceros` → consolidación intercompany
//    (module-intercompany): un alquiler INTERNO entre dos sociedades del holding se elimina;
//    uno a un tercero es ingreso real y NO se elimina.

export type EstadoAlquiler = 'reservado' | 'entregado' | 'devuelto' | 'cancelado'

export interface ParentRef {
  parentId: string
  parentType: string // normalmente 'encargo' | 'evento'
}

// Una línea de material dentro de un alquiler. El precio puede ser por día (lo normal en alquiler)
// o una tarifa fija por unidad (p. ej. consumibles que no se devuelven). Si `tarifaFija` está
// presente, manda sobre `tarifaDia`.
export interface LineaAlquiler {
  materialId: string
  nombre: string
  cantidad: number
  tarifaDia: number // € por unidad y día
  tarifaFija?: number | null // € por unidad (flat, ignora los días) — opcional
}

export interface Alquiler {
  id: string
  encargoId?: string | null // Encargo del que cuelga (patrón de agregado por id)
  clienteNombre?: string | null
  // true = alquiler a un cliente TERCERO (ingreso externo real);
  // false = INTERNO, sirve a un evento del propio grupo (candidato a intercompany).
  aTerceros: boolean
  fechaInicio: string // ISO yyyy-mm-dd
  fechaFin: string // ISO yyyy-mm-dd (fin previsto)
  estado: EstadoAlquiler
  lineas: LineaAlquiler[]
  fianza?: number | null // depósito retenido mientras el material está fuera
  descuentoEur?: number | null // descuento absoluto en €
  fechaDevolucionReal?: string | null // ISO; si > fechaFin → recargo por retraso
  notas?: string | null
  parent?: ParentRef
  // Costura intercompany (solo en alquileres internos del holding):
  sociedadOrigenId?: string | null // sociedad que ALQUILA (factura → ingreso)
  sociedadDestinoId?: string | null // sociedad que USA el material (gasto)
}

export type NuevoAlquiler = Omit<Alquiler, 'id'>

export interface ResumenAlquileres {
  porEstado: Record<EstadoAlquiler, number>
  activos: number // reservado + entregado
  ingresosTerceros: number // Σ total de alquileres a terceros no cancelados
  totalInterno: number // Σ total de alquileres internos no cancelados (base intercompany)
  fianzasRetenidas: number // Σ fianza de los alquileres en estado 'entregado'
}

// Forma de una operación intercompany derivada de un alquiler interno (coincide con
// OperacionIntercompany de @central/module-intercompany SIN importarlo: solo la forma).
export interface OperacionIntercompanyDeAlquiler {
  sociedadOrigenId: string
  sociedadDestinoId: string
  importe: number
  tipo: 'materiales'
  parent: { parentId: string; parentType: 'alquiler' }
}

// PORT de adaptación: cada vertical mapea su fila de dominio ↔ Alquiler.
export interface AlquilerAdapter<TDominio> {
  toAlquiler(fila: TDominio): Alquiler
  fromAlquiler(a: Alquiler): TDominio
}
