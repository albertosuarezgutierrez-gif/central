// Plantillas SECTORIALES como DATOS (spec §4.1/§4.3): cuentas extra sugeridas + reglas de asiento + ejes de rentabilidad.
// Son datos, no lógica: el núcleo no se entera. La empresa elige plantilla en el alta y puede editar sus reglas (precedencia:
// regla de la empresa > plantilla del sector > genérica PGC). Cambiar una plantilla NO reescribe asientos pasados.
//
// 🚨 Todas las cuentas que citan las reglas existen en la semilla PGC pymes (así una empresa dada de alta ANTES de esta plantilla
// sigue pudiendo asentar); las `cuentasExtra` son cuentas del PGC que la semilla no trae y que el sector suele necesitar.
import { combinarReglas, REGLAS_PGC, type MedioPago, type ReglasAsiento } from '../partida/hechos.ts'
import { crearPlan, SEMILLA_PGC_PYMES, type FilaSemilla, type PlanDeCuentas } from '../partida/plan.ts'

export const SECTORES_PLANTILLA = ['generico', 'taller', 'hosteleria', 'limpieza', 'alquiler'] as const
export type SectorPlantilla = (typeof SECTORES_PLANTILLA)[number]

export interface DimensionDef {
  clave: string
  etiqueta: string
  ayuda: string
}

export interface PlantillaSector {
  sector: SectorPlantilla
  nombre: string
  descripcion: string
  cuentasExtra: readonly FilaSemilla[]
  /** Reglas COMPLETAS efectivas del sector (genérica ya mezclada). */
  reglas: ReglasAsiento
  /** Ejes de rentabilidad que ofrece el sector, el primero es el que se abre por defecto. */
  dimensiones: readonly DimensionDef[]
}

/** Etiquetas legibles de las categorías de línea que usan las plantillas (cualquier otra se capitaliza). */
export const ETIQUETAS_CATEGORIA: Readonly<Record<string, string>> = {
  mano_obra: 'Mano de obra', recambio: 'Recambios', consumibles: 'Consumibles y pequeño material', trabajos_terceros: 'Trabajos de otras empresas',
  suministros: 'Suministros', alquiler: 'Alquiler del local', reparaciones: 'Reparaciones y conservación', seguros: 'Seguros', servicios: 'Servicios',
  comida: 'Comida', bebida: 'Bebida', eventos: 'Eventos y catering', productos_limpieza: 'Productos de limpieza', subcontratas: 'Subcontratas',
  material_alquilado: 'Alquiler de material', fianzas_retenidas: 'Fianzas retenidas', mantenimiento: 'Mantenimiento de material',
}

export function etiquetaCategoria(clave: string): string {
  if (ETIQUETAS_CATEGORIA[clave]) return ETIQUETAS_CATEGORIA[clave]
  const t = clave.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Medios de cobro/pago → tesorería: efectivo a caja (570); bizum, transferencia, tarjeta y otro a bancos (572). Editable por empresa. */
export const MEDIOS_POR_DEFECTO: Readonly<Record<MedioPago, string>> = { efectivo: '570', bizum: '572', transferencia: '572', tarjeta: '572', otro: '572' }
const MEDIOS = { cobro: MEDIOS_POR_DEFECTO, pago: MEDIOS_POR_DEFECTO }

const INCOBRABLES: FilaSemilla = ['650', 'Pérdidas de créditos comerciales incobrables', 'D']

export const PLANTILLAS: Readonly<Record<SectorPlantilla, PlantillaSector>> = {
  generico: {
    sector: 'generico',
    nombre: 'Genérica (PGC pymes)',
    descripcion: 'Sin particularidades de sector: ventas a 705 (prestación de servicios), compras a 600, cobros y pagos por banco.',
    cuentasExtra: [],
    reglas: combinarReglas(REGLAS_PGC, { medios: MEDIOS }),
    dimensiones: [
      { clave: 'cliente', etiqueta: 'Cliente', ayuda: 'Qué clientes dejan más margen' },
      { clave: 'proveedor', etiqueta: 'Proveedor', ayuda: 'A quién se compra más' },
    ],
  },
  taller: {
    sector: 'taller',
    nombre: 'Taller',
    descripcion: 'Mano de obra a 705 (prestaciones de servicios) y recambios a 700 (mercaderías); compras de recambios a 600 y trabajos de otras empresas a 607.',
    cuentasExtra: [INCOBRABLES, ['754', 'Ingresos por comisiones', 'A']],
    reglas: combinarReglas(REGLAS_PGC, {
      venta: { ingreso: '705' },
      compra: { gasto: '600' },
      medios: MEDIOS,
      categorias: {
        venta: { mano_obra: '705', recambio: '700' },
        compra: { recambio: '600', consumibles: '602', trabajos_terceros: '607', suministros: '628', alquiler: '621', reparaciones: '622', seguros: '625' },
      },
    }),
    dimensiones: [
      { clave: 'ot', etiqueta: 'Orden de trabajo', ayuda: 'Margen de cada reparación' },
      { clave: 'cliente', etiqueta: 'Cliente', ayuda: 'Qué clientes dejan más margen' },
      { clave: 'tipo_trabajo', etiqueta: 'Tipo de trabajo', ayuda: 'Mecánica, chapa, neumáticos, revisión…' },
      { clave: 'mecanico', etiqueta: 'Mecánico', ayuda: 'Quién produce más margen' },
      { clave: 'proveedor', etiqueta: 'Recambio / proveedor', ayuda: 'A quién se compra más' },
    ],
  },
  hosteleria: {
    sector: 'hosteleria',
    nombre: 'Hostelería',
    descripcion: 'Ventas de comida y bebida a 700; eventos a 705. Cobros por caja (570). Compras de mercaderías a 600.',
    cuentasExtra: [INCOBRABLES, ['740', 'Subvenciones, donaciones y legados a la explotación', 'A']],
    reglas: combinarReglas(REGLAS_PGC, {
      venta: { ingreso: '700' },
      compra: { gasto: '600' },
      cobro: { tesoreria: '570' },
      pago: { tesoreria: '572' },
      medios: MEDIOS,
      categorias: {
        venta: { comida: '700', bebida: '700', eventos: '705' },
        compra: { comida: '600', bebida: '600', suministros: '628', alquiler: '621', reparaciones: '622', seguros: '625' },
      },
    }),
    dimensiones: [
      { clave: 'producto', etiqueta: 'Producto', ayuda: 'Qué platos y bebidas dejan margen' },
      { clave: 'franja', etiqueta: 'Franja horaria', ayuda: 'Desayuno, comida, cena, noche' },
      { clave: 'mesa', etiqueta: 'Mesa / zona', ayuda: 'Terraza, salón, barra' },
    ],
  },
  limpieza: {
    sector: 'limpieza',
    nombre: 'Limpieza',
    descripcion: 'Servicios a 705, con retenciones de clientes a 473; productos de limpieza a 602 y subcontratas a 607.',
    cuentasExtra: [INCOBRABLES, ['641', 'Indemnizaciones', 'D']],
    reglas: combinarReglas(REGLAS_PGC, {
      venta: { ingreso: '705' },
      compra: { gasto: '602' },
      medios: MEDIOS,
      categorias: {
        venta: { servicios: '705' },
        compra: { productos_limpieza: '602', subcontratas: '607', suministros: '628', mantenimiento: '622', seguros: '625' },
      },
    }),
    dimensiones: [
      { clave: 'cliente', etiqueta: 'Cliente', ayuda: 'Qué clientes dejan más margen' },
      { clave: 'servicio', etiqueta: 'Servicio', ayuda: 'Oficinas, comunidades, cristales, fin de obra…' },
      { clave: 'empleado', etiqueta: 'Equipo / empleado', ayuda: 'Margen por equipo' },
    ],
  },
  alquiler: {
    sector: 'alquiler',
    nombre: 'Alquiler de materiales',
    descripcion: 'Ingresos de alquiler a 752 (arrendamientos); mantenimiento del material a 622. Fianzas en el pasivo, fuera de las ventas.',
    cuentasExtra: [INCOBRABLES, ['659', 'Otras pérdidas en gestión corriente', 'D']],
    reglas: combinarReglas(REGLAS_PGC, {
      venta: { ingreso: '752' },
      compra: { gasto: '622' },
      medios: MEDIOS,
      categorias: {
        venta: { material_alquilado: '752', servicios: '705' },
        compra: { mantenimiento: '622', suministros: '628', alquiler: '621', seguros: '625' },
      },
    }),
    dimensiones: [
      { clave: 'cliente', etiqueta: 'Cliente', ayuda: 'Qué clientes dejan más margen' },
      { clave: 'material', etiqueta: 'Material', ayuda: 'Qué artículos rinden más' },
    ],
  },
}

export const esSectorPlantilla = (v: unknown): v is SectorPlantilla => typeof v === 'string' && (SECTORES_PLANTILLA as readonly string[]).includes(v)

/** Plantilla del sector; un sector desconocido (dato viejo) cae en la genérica en vez de romper. */
export const plantillaDe = (sector: unknown): PlantillaSector => (esSectorPlantilla(sector) ? PLANTILLAS[sector] : PLANTILLAS.generico)

/** Semilla PGC + cuentas extra del sector: lo que se siembra en el alta. */
export function filasPlanDeSector(sector: unknown): FilaSemilla[] {
  return [...SEMILLA_PGC_PYMES, ...plantillaDe(sector).cuentasExtra]
}

export function planDeSector(sector: unknown): PlanDeCuentas {
  return crearPlan(SEMILLA_PGC_PYMES, plantillaDe(sector).cuentasExtra)
}
