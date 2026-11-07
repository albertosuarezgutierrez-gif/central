// Plan de cuentas. La semilla (PGC PYMES, RD 1515/2007) es DATO, no lógica: las plantillas
// sectoriales (taller, hostelería, limpieza…) añaden filas con `crearPlan(SEMILLA_PGC_PYMES, extra)`.

import { ErrorContable } from './dinero.ts'

export type Naturaleza = 'deudora' | 'acreedora'

export interface Cuenta {
  codigo: string
  nombre: string
  /** 1-9: primer dígito del código. */
  grupo: number
  naturaleza: Naturaleza
  /** true = nivel hoja: admite apuntes. Una cuenta dividida en subcuentas deja de admitirlos. */
  admiteApuntes: boolean
}

/** Fila de semilla: [código, nombre, naturaleza D/A]. */
export type FilaSemilla = readonly [codigo: string, nombre: string, naturaleza: 'D' | 'A']

export interface PlanDeCuentas {
  readonly cuentas: Readonly<Record<string, Cuenta>>
}

export const SEMILLA_PGC_PYMES: readonly FilaSemilla[] = [
  // Grupo 1 — Financiación básica
  ['100', 'Capital social', 'A'],
  ['101', 'Fondo social', 'A'],
  ['112', 'Reserva legal', 'A'],
  ['113', 'Reservas voluntarias', 'A'],
  ['118', 'Aportaciones de socios o propietarios', 'A'],
  ['120', 'Remanente', 'A'],
  ['121', 'Resultados negativos de ejercicios anteriores', 'D'],
  ['129', 'Resultado del ejercicio', 'A'],
  ['170', 'Deudas a largo plazo con entidades de crédito', 'A'],
  ['171', 'Deudas a largo plazo', 'A'],
  ['173', 'Proveedores de inmovilizado a largo plazo', 'A'],
  // Grupo 2 — Activo no corriente
  ['203', 'Propiedad industrial', 'D'],
  ['206', 'Aplicaciones informáticas', 'D'],
  ['210', 'Terrenos y bienes naturales', 'D'],
  ['211', 'Construcciones', 'D'],
  ['212', 'Instalaciones técnicas', 'D'],
  ['213', 'Maquinaria', 'D'],
  ['214', 'Utillaje', 'D'],
  ['215', 'Otras instalaciones', 'D'],
  ['216', 'Mobiliario', 'D'],
  ['217', 'Equipos para procesos de información', 'D'],
  ['218', 'Elementos de transporte', 'D'],
  ['219', 'Otro inmovilizado material', 'D'],
  ['280', 'Amortización acumulada del inmovilizado intangible', 'A'],
  ['281', 'Amortización acumulada del inmovilizado material', 'A'],
  // Grupo 3 — Existencias
  ['300', 'Mercaderías', 'D'],
  ['310', 'Materias primas', 'D'],
  ['320', 'Otros aprovisionamientos', 'D'],
  // Grupo 4 — Acreedores y deudores por operaciones comerciales
  ['400', 'Proveedores', 'A'],
  ['4009', 'Proveedores, facturas pendientes de recibir o formalizar', 'A'],
  ['407', 'Anticipos a proveedores', 'D'],
  ['410', 'Acreedores por prestaciones de servicios', 'A'],
  ['430', 'Clientes', 'D'],
  ['436', 'Clientes de dudoso cobro', 'D'],
  ['438', 'Anticipos de clientes', 'A'],
  ['440', 'Deudores', 'D'],
  ['460', 'Anticipos de remuneraciones', 'D'],
  ['465', 'Remuneraciones pendientes de pago', 'A'],
  ['4700', 'Hacienda Pública, deudora por IVA', 'D'],
  ['4708', 'Hacienda Pública, deudora por subvenciones concedidas', 'D'],
  ['4709', 'Hacienda Pública, deudora por devolución de impuestos', 'D'],
  ['471', 'Organismos de la Seguridad Social, deudores', 'D'],
  ['472', 'Hacienda Pública, IVA soportado', 'D'],
  ['473', 'Hacienda Pública, retenciones y pagos a cuenta', 'D'],
  ['4750', 'Hacienda Pública, acreedora por IVA', 'A'],
  ['4751', 'Hacienda Pública, acreedora por retenciones practicadas', 'A'],
  ['4752', 'Hacienda Pública, acreedora por impuesto sobre sociedades', 'A'],
  ['476', 'Organismos de la Seguridad Social, acreedores', 'A'],
  ['477', 'Hacienda Pública, IVA repercutido', 'A'],
  ['480', 'Gastos anticipados', 'D'],
  ['485', 'Ingresos anticipados', 'A'],
  // Grupo 5 — Cuentas financieras
  ['520', 'Deudas a corto plazo con entidades de crédito', 'A'],
  ['523', 'Proveedores de inmovilizado a corto plazo', 'A'],
  ['551', 'Cuenta corriente con socios y administradores', 'D'],
  ['555', 'Partidas pendientes de aplicación', 'A'],
  ['570', 'Caja, euros', 'D'],
  ['572', 'Bancos e instituciones de crédito c/c vista, euros', 'D'],
  // Grupo 6 — Compras y gastos
  ['600', 'Compras de mercaderías', 'D'],
  ['601', 'Compras de materias primas', 'D'],
  ['602', 'Compras de otros aprovisionamientos', 'D'],
  ['606', 'Descuentos sobre compras por pronto pago', 'A'],
  ['607', 'Trabajos realizados por otras empresas', 'D'],
  ['608', 'Devoluciones de compras y operaciones similares', 'A'],
  ['609', 'Rappels por compras', 'A'],
  ['621', 'Arrendamientos y cánones', 'D'],
  ['622', 'Reparaciones y conservación', 'D'],
  ['623', 'Servicios de profesionales independientes', 'D'],
  ['624', 'Transportes', 'D'],
  ['625', 'Primas de seguros', 'D'],
  ['626', 'Servicios bancarios y similares', 'D'],
  ['627', 'Publicidad, propaganda y relaciones públicas', 'D'],
  ['628', 'Suministros', 'D'],
  ['629', 'Otros servicios', 'D'],
  ['630', 'Impuesto sobre beneficios', 'D'],
  ['631', 'Otros tributos', 'D'],
  ['640', 'Sueldos y salarios', 'D'],
  ['642', 'Seguridad Social a cargo de la empresa', 'D'],
  ['649', 'Otros gastos sociales', 'D'],
  ['662', 'Intereses de deudas', 'D'],
  ['671', 'Pérdidas procedentes del inmovilizado material', 'D'],
  ['669', 'Otros gastos financieros', 'D'],
  ['680', 'Amortización del inmovilizado intangible', 'D'],
  ['681', 'Amortización del inmovilizado material', 'D'],
  // Grupo 7 — Ventas e ingresos
  ['700', 'Ventas de mercaderías', 'A'],
  ['701', 'Ventas de productos terminados', 'A'],
  ['702', 'Ventas de productos semiterminados', 'A'],
  ['703', 'Ventas de subproductos y residuos', 'A'],
  ['704', 'Ventas de envases y embalajes', 'A'],
  ['705', 'Prestaciones de servicios', 'A'],
  ['706', 'Descuentos sobre ventas por pronto pago', 'D'],
  ['708', 'Devoluciones de ventas y operaciones similares', 'D'],
  ['709', 'Rappels sobre ventas', 'D'],
  ['752', 'Ingresos por arrendamientos', 'A'],
  ['759', 'Ingresos por servicios diversos', 'A'],
  ['769', 'Otros ingresos financieros', 'A'],
  ['771', 'Beneficios procedentes del inmovilizado material', 'A'],
]

const CODIGO_RE = /^[1-9][0-9]{2,}$/

function filaACuenta(f: FilaSemilla): Cuenta {
  const [codigo, nombre, nat] = f
  if (!CODIGO_RE.test(codigo)) throw new ErrorContable('codigo_invalido', `código de cuenta inválido: ${codigo}`)
  return { codigo, nombre, grupo: Number(codigo[0]), naturaleza: nat === 'D' ? 'deudora' : 'acreedora', admiteApuntes: true }
}

/** Crea un plan a partir de la semilla (+ filas extra de plantillas sectoriales). Un código repetido es error. */
export function crearPlan(semilla: readonly FilaSemilla[] = SEMILLA_PGC_PYMES, extra: readonly FilaSemilla[] = []): PlanDeCuentas {
  const cuentas: Record<string, Cuenta> = {}
  for (const f of [...semilla, ...extra]) {
    const c = filaACuenta(f)
    if (cuentas[c.codigo]) throw new ErrorContable('cuenta_duplicada', `cuenta duplicada: ${c.codigo}`)
    cuentas[c.codigo] = c
  }
  return { cuentas }
}

export function obtenerCuenta(plan: PlanDeCuentas, codigo: string): Cuenta | undefined {
  return plan.cuentas[codigo]
}

/** Cuenta existente más larga que sea prefijo estricto de `codigo`. */
function buscarPadre(plan: PlanDeCuentas, codigo: string): Cuenta | undefined {
  for (let len = codigo.length - 1; len >= 3; len--) {
    const p = plan.cuentas[codigo.slice(0, len)]
    if (p) return p
  }
  return undefined
}

/**
 * Crea una subcuenta (p. ej. 430000001 para un cliente). Debe colgar de una cuenta existente (prefijo);
 * hereda grupo y naturaleza. La cuenta padre directa pasa a NO admitir apuntes (queda como agrupadora).
 * Devuelve un plan nuevo; no muta el original.
 */
export function crearSubcuenta(plan: PlanDeCuentas, codigo: string, nombre: string): PlanDeCuentas {
  if (!CODIGO_RE.test(codigo)) throw new ErrorContable('codigo_invalido', `código de subcuenta inválido: ${codigo}`)
  if (!nombre.trim()) throw new ErrorContable('nombre_vacio', 'la subcuenta necesita nombre')
  if (plan.cuentas[codigo]) throw new ErrorContable('cuenta_duplicada', `la cuenta ${codigo} ya existe`)
  const padre = buscarPadre(plan, codigo)
  if (!padre) throw new ErrorContable('sin_cuenta_padre', `la subcuenta ${codigo} no cuelga de ninguna cuenta existente`)
  const nueva: Cuenta = { codigo, nombre: nombre.trim(), grupo: padre.grupo, naturaleza: padre.naturaleza, admiteApuntes: true }
  return { cuentas: { ...plan.cuentas, [padre.codigo]: { ...padre, admiteApuntes: false }, [codigo]: nueva } }
}
