// Catálogo DECLARATIVO de informes estándar (mismo patrón que apps/rrhh/lib/informes/catalogo.ts). PURO.
// Un informe nuevo = una entrada aquí + su rama en `generar.ts`. Lo que llega del cliente solo elige una CLAVE de esta lista blanca
// y valores validados (fechas ISO, cuenta numérica): nada se interpola en SQL.
export type TipoColumna = 'texto' | 'fecha' | 'dinero' | 'numero'
export type ColumnaInforme = { clave: string; etiqueta: string; tipo: TipoColumna }
/** `periodo` = desde/hasta · `cuenta` = una cuenta (y sus subcuentas) · `corte` = fecha de corte (hasta). */
export type FiltroInforme = 'periodo' | 'cuenta' | 'corte'

export type InformeDef = {
  clave: string
  titulo: string
  descripcion: string
  filtros: readonly FiltroInforme[]
  columnas: readonly ColumnaInforme[]
}

const c = (clave: string, etiqueta: string, tipo: TipoColumna): ColumnaInforme => ({ clave, etiqueta, tipo })

export const INFORMES: readonly InformeDef[] = [
  {
    clave: 'diario', titulo: 'Libro diario', descripcion: 'Todos los asientos del periodo, por fecha y número, con sus apuntes.',
    filtros: ['periodo'],
    columnas: [c('numero', 'Nº', 'numero'), c('fecha', 'Fecha', 'fecha'), c('concepto', 'Concepto', 'texto'), c('cuenta', 'Cuenta', 'texto'), c('documento', 'Documento', 'texto'), c('debe', 'Debe', 'dinero'), c('haber', 'Haber', 'dinero')],
  },
  {
    clave: 'mayor', titulo: 'Libro mayor', descripcion: 'Movimientos de una cuenta (con sus subcuentas) y saldo acumulado, con el saldo inicial del periodo.',
    filtros: ['periodo', 'cuenta'],
    columnas: [c('fecha', 'Fecha', 'fecha'), c('numero', 'Nº', 'numero'), c('concepto', 'Concepto', 'texto'), c('cuenta', 'Cuenta', 'texto'), c('debe', 'Debe', 'dinero'), c('haber', 'Haber', 'dinero'), c('saldo', 'Saldo', 'dinero')],
  },
  {
    clave: 'sumas_saldos', titulo: 'Sumas y saldos', descripcion: 'Debe, haber y saldo de cada cuenta en el periodo. Debe cuadrar siempre.',
    filtros: ['periodo'],
    columnas: [c('cuenta', 'Cuenta', 'texto'), c('nombre', 'Nombre', 'texto'), c('debe', 'Debe', 'dinero'), c('haber', 'Haber', 'dinero'), c('saldoDeudor', 'Saldo deudor', 'dinero'), c('saldoAcreedor', 'Saldo acreedor', 'dinero')],
  },
  {
    clave: 'balance', titulo: 'Balance de situación', descripcion: 'Activo y patrimonio neto + pasivo (abreviado) a una fecha de corte.',
    filtros: ['corte'],
    columnas: [c('lado', 'Lado', 'texto'), c('rubrica', 'Rúbrica', 'texto'), c('importe', 'Importe', 'dinero')],
  },
  {
    clave: 'pyg', titulo: 'Cuenta de pérdidas y ganancias', descripcion: 'Ingresos y gastos del periodo (abreviada). Ingresos en positivo, gastos en negativo.',
    filtros: ['periodo'],
    columnas: [c('rubrica', 'Rúbrica', 'texto'), c('importe', 'Importe', 'dinero')],
  },
  {
    clave: 'antiguedad_clientes', titulo: 'Antigüedad de saldos de clientes (43x)', descripcion: 'Facturas pendientes de cobro por antigüedad a la fecha de corte (0-30, 31-60, 61-90, +90 días).',
    filtros: ['corte'],
    columnas: [c('cuenta', 'Cuenta', 'texto'), c('documento', 'Documento', 'texto'), c('desde', 'Desde', 'fecha'), c('dias', 'Días', 'numero'), c('tramo', 'Tramo', 'texto'), c('importe', 'Pendiente', 'dinero')],
  },
  {
    clave: 'antiguedad_proveedores', titulo: 'Antigüedad de saldos de proveedores (40x/41x)', descripcion: 'Facturas pendientes de pago por antigüedad a la fecha de corte.',
    filtros: ['corte'],
    columnas: [c('cuenta', 'Cuenta', 'texto'), c('documento', 'Documento', 'texto'), c('desde', 'Desde', 'fecha'), c('dias', 'Días', 'numero'), c('tramo', 'Tramo', 'texto'), c('importe', 'Pendiente', 'dinero')],
  },
]

export const informePorClave = (clave: string): InformeDef | undefined => INFORMES.find((i) => i.clave === clave)
