// Puente entre el catálogo de la vertical Alquiler (`alquiler_materiales`) y el contrato
// compartido de @central/module-materiales.
//
// POR QUÉ EXISTE: el panel de Salud de la arquitectura marcaba `alquiler` como
// "reimplementación" de la capacidad Almacén/stock — la app llevaba su propia aritmética de
// stock a mano (`Math.max(0, total - comprometido)`) teniendo el módulo compartido al lado,
// que además contempla `ParentType: 'alquiler'` justo para este caso. Aquí NO se migra la
// tabla: se adapta la fila al tipo `Material` del módulo y se compone su lógica pura.
//
// 🚨 LÍMITE DEL PUENTE (regla "dato que NO hay ≠ dato que NO se ha mirado"): la tabla
// `alquiler_materiales` NO tiene columnas económicas de inventario (precio de compra ni coste
// de reposición) — el material se tarifa POR DÍA, no se valora. Rellenarlas a 0 sería un
// "no lo sé" disfrazado de valor, así que todo lo que el módulo derive de ellas
// (`valorStock`, `resumenContable`, y el `valorTotal` de `resumenStock`) queda PROHIBIDO
// aguas abajo: `resumenStockUnidades()` lo recorta del tipo para que ni siquiera compile
// pintar "0 €" de inventario. Si algún día la tabla gana esas columnas, se rellenan aquí y
// se deja de recortar.
import {
  disponibilidadTrasReserva,
  resumenStock,
  type Material,
  type ResumenStock,
} from '@central/module-materiales'

/** Fila del catálogo de alquiler, tal y como la sirve `alquiler-repo`. */
export interface MaterialAlquiler {
  id: string
  nombre: string
  categoria: string | null
  stockTotal: number
  activo: boolean
}

/** Unidades libres HOY = total − comprometido por los alquileres que solapan la ventana. */
export function disponibleTrasComprometido(stockTotal: number, comprometido: number): number {
  return disponibilidadTrasReserva(stockTotal, comprometido)
}

/**
 * Adapta una fila de `alquiler_materiales` al `Material` compartido.
 * `cuentaId` es el negocio (scope del holding en esta vertical).
 * Los campos económicos van a 0 A PROPÓSITO y no deben leerse: ver el aviso de cabecera.
 */
export function aMaterialCompartido(
  m: MaterialAlquiler,
  cuentaId: string,
  comprometido: number,
): Material {
  return {
    id: m.id,
    negocioId: cuentaId,
    nombre: m.nombre,
    categoria: m.categoria ?? 'sin categoría',
    tipo: 'activo',
    estado: m.activo ? 'operativo' : 'baja',
    cantidadTotal: m.stockTotal,
    cantidadDisponible: disponibleTrasComprometido(m.stockTotal, comprometido),
    precioCompra: 0,
    costeReposicion: 0,
    activo: m.activo,
  }
}

/** Resumen del catálogo SOLO en unidades. El valor en € se recorta: ver el aviso de cabecera. */
export type ResumenStockUnidades = Omit<ResumenStock, 'valorTotal'>

export function resumenStockUnidades(materiales: Material[]): ResumenStockUnidades {
  const { valorTotal: _valorTotal, ...unidades } = resumenStock(materiales)
  return unidades
}
