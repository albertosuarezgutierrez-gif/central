// Alta de trabajador: reglas PURAS compartidas por el asistente de 3 pasos (/admin/empleados/nuevo) y la importación
// Excel/CSV (/admin/empleados/importar). Una sola validación para los dos caminos; la escritura vive en
// `alta-empleado-repo.ts` (una sola también). Sin BD ni reloj: `hoy` y las tablas de convenio se inyectan.
//
// Campos vacíos = «no se sabe» (NULL), nunca un valor de cajón. El contrato es OPCIONAL: solo se crea si llega el tipo de
// contrato, y entonces sus campos obligatorios se exigen todos (sin jornada 100 % ni grupo por defecto).
import { normalizarEmpleado } from './empleados'
import { eurosTextoACentimos, proponerSalario, type FilaTablaConvenio } from './convenio-tablas'
import {
  validarFechaAlta, validarFechaNacimiento, validarIbanEmpleado, validarNaf, validarNifNie, validarTelefono, fechaIso,
} from './alta-empleado-validadores'

/** Lo que llega del formulario o de una fila del fichero: todo texto (las celdas se pasan a texto antes). */
export interface EntradaAlta {
  nombre?: string; apellidos?: string; email?: string; dni?: string; nss?: string; telefono?: string
  fecha_nacimiento?: string; puesto?: string; fecha_alta?: string
  tipo_contrato?: string; fecha_fin?: string; grupo_cotizacion?: string; categoria?: string; jornada_pct?: string
  salario_base?: string; irpf_pct?: string; iban?: string
}
export const CAMPOS_ALTA = [
  'nombre', 'apellidos', 'email', 'dni', 'nss', 'telefono', 'fecha_nacimiento', 'puesto', 'fecha_alta',
  'tipo_contrato', 'fecha_fin', 'grupo_cotizacion', 'categoria', 'jornada_pct', 'salario_base', 'irpf_pct', 'iban',
] as const satisfies readonly (keyof EntradaAlta)[]
export type CampoAlta = (typeof CAMPOS_ALTA)[number]

export type TipoContratoAlta = 'indefinido' | 'temporal' | 'parcial'

/** Cuerpo de contrato con la forma que espera `parsearDatosContrato` (lib/contratos.ts), que sigue siendo la autoridad. */
export interface ContratoAlta {
  salarioBase: number
  grupoCotizacion: number
  tipoContrato: TipoContratoAlta
  jornadaPct: number
  irpfRetencionPct: number
  categoriaConvenio: string | null
  conceptosFijos: []
  vigenteDesde: string
  fechaInicio: string
  fechaFin: string | null
  duracion: 'indefinido' | 'temporal' | null
}

export interface AltaNormalizada {
  /** null SOLO en el alta rápida del listado (DNI opcional allí = «no se sabe»); el asistente y el fichero lo exigen. */
  nombre: string; apellidos: string | null; email: string; dni: string | null; nss: string | null; telefono: string | null
  fecha_nacimiento: string | null; puesto: string | null; fecha_alta: string | null; iban: string | null
  /** Copia en la ficha (texto libre allí): mismos valores que el contrato. */
  tipo_contrato: string | null; categoria: string | null; grupo_cotizacion: string | null; tipo_jornada: string | null
  contrato: ContratoAlta | null
}

export interface ErrorCampo { campo: CampoAlta; mensaje: string }
export type ResultadoAlta =
  | { ok: true; alta: AltaNormalizada; avisos: string[] }
  | { ok: false; errores: ErrorCampo[] }

export interface ContextoAlta {
  hoy: string
  /** null = tablas sin cargar («no se sabe»): no se propone salario. */
  tablas: FilaTablaConvenio[] | null
  convenio?: string | null
}

const TIPOS: Record<string, TipoContratoAlta> = {
  indefinido: 'indefinido', temporal: 'temporal', parcial: 'parcial',
  'tiempo parcial': 'parcial', 'a tiempo parcial': 'parcial', 'duracion determinada': 'temporal', 'duración determinada': 'temporal',
}

const t = (v: unknown) => (v == null ? '' : String(v)).trim()
const opc = (v: unknown) => t(v) || null

/** «15» / «15,5» / «15 %» → número. null si no es un número. */
export function porcentaje(v: unknown): number | null {
  const s = t(v).replace(/\s|%/g, '').replace(',', '.')
  if (!s || !/^\d+(\.\d+)?$/.test(s)) return null
  return Number(s)
}

/**
 * Salario que se propone para el contrato: el de la tabla del convenio (categoría + año de la fecha de alta) si hay UNA fila
 * que case. Devuelve euros con 2 decimales en texto (para el campo del formulario) o null («no se sabe»).
 */
export function salarioPropuesto(ctx: ContextoAlta, categoria: string | null | undefined, fechaAlta: string | null | undefined): string | null {
  if (!ctx.tablas) return null
  const f = fechaIso(fechaAlta) ?? ctx.hoy
  const p = proponerSalario(ctx.tablas, { anio: Number(f.slice(0, 4)), categoria, convenio: ctx.convenio ?? null })
  return p.ok ? (p.fila.salarioBaseCent / 100).toFixed(2) : null
}

/** Valida y normaliza un alta. Devuelve TODOS los errores (no para en el primero) para la vista previa por fila. */
export function validarAlta(e: EntradaAlta, ctx: ContextoAlta): ResultadoAlta {
  const errores: ErrorCampo[] = []
  const avisos: string[] = []
  const err = (campo: CampoAlta, mensaje: string) => { errores.push({ campo, mensaje }) }

  // Paso 1 — datos personales. Nombre y email: la regla de siempre (lib/empleados.ts), sin duplicarla.
  const nombre = t(e.nombre)
  let email = ''
  if (!nombre) err('nombre', 'Falta el nombre')
  if (!t(e.apellidos)) err('apellidos', 'Faltan los apellidos')
  // El email lo valida `normalizarEmpleado` (el nombre ya se ha mirado arriba: aquí solo interesa su regla del email).
  // Su tipo admite null; aquí un email que no llega es un error del campo, nunca un valor de cajón.
  try { email = normalizarEmpleado({ nombre: nombre || '-', email: t(e.email) }).email ?? ''; if (!email) throw new Error('sin email') }
  catch { err('email', 'Falta el email o no es válido (se usa para firmar documentos)') }
  if (t(e.nombre).length > 120) err('nombre', 'Nombre demasiado largo')
  if (t(e.apellidos).length > 160) err('apellidos', 'Apellidos demasiado largos')

  const dni = validarNifNie(e.dni)
  if (!dni.ok) err('dni', dni.motivo)
  let nss: string | null = null
  if (t(e.nss)) { const r = validarNaf(e.nss); if (r.ok) nss = r.valor; else err('nss', r.motivo) }
  let telefono: string | null = null
  if (t(e.telefono)) { const r = validarTelefono(e.telefono); if (r.ok) telefono = r.valor; else err('telefono', r.motivo) }
  let fecha_nacimiento: string | null = null
  if (t(e.fecha_nacimiento)) {
    const r = validarFechaNacimiento(e.fecha_nacimiento, ctx.hoy)
    if (r.ok) fecha_nacimiento = r.valor; else err('fecha_nacimiento', r.motivo)
  }

  // Paso 2 — contrato y convenio.
  let fecha_alta: string | null = null
  if (t(e.fecha_alta)) { const r = validarFechaAlta(e.fecha_alta, ctx.hoy); if (r.ok) fecha_alta = r.valor; else err('fecha_alta', r.motivo) }
  const puesto = opc(e.puesto)
  if (puesto && puesto.length > 120) err('puesto', 'Puesto demasiado largo')
  const categoria = opc(e.categoria)?.replace(/\s+/g, ' ') ?? null
  if (categoria && categoria.length > 200) err('categoria', 'Categoría demasiado larga')

  let contrato: ContratoAlta | null = null
  const tipoTxt = t(e.tipo_contrato).toLowerCase()
  const hayDatosContrato = [e.fecha_fin, e.grupo_cotizacion, e.jornada_pct, e.salario_base, e.irpf_pct].some(v => t(v))
  if (!tipoTxt && hayDatosContrato) err('tipo_contrato', 'Indica el tipo de contrato (indefinido, temporal o parcial)')
  if (tipoTxt) {
    const tipo = TIPOS[tipoTxt]
    if (!tipo) err('tipo_contrato', 'Tipo de contrato: indefinido, temporal o parcial')
    if (!t(e.fecha_alta)) err('fecha_alta', 'Falta la fecha de alta (inicio del contrato)')
    const grupo = Number(t(e.grupo_cotizacion))
    if (!t(e.grupo_cotizacion)) err('grupo_cotizacion', 'Falta el grupo de cotización (1-11)')
    else if (!Number.isInteger(grupo) || grupo < 1 || grupo > 11) err('grupo_cotizacion', 'Grupo de cotización: un número de 1 a 11')
    const jornada = porcentaje(e.jornada_pct)
    if (!t(e.jornada_pct)) err('jornada_pct', 'Falta la jornada (%)')
    else if (jornada === null || jornada <= 0 || jornada > 100) err('jornada_pct', 'Jornada: porcentaje entre 1 y 100')
    else if (tipo === 'parcial' && jornada >= 100) err('jornada_pct', 'Un contrato a tiempo parcial no llega al 100 %')
    let irpf = 0
    if (t(e.irpf_pct)) {
      const p = porcentaje(e.irpf_pct)
      if (p === null || p < 0 || p > 45) err('irpf_pct', 'Retención IRPF: porcentaje entre 0 y 45'); else irpf = p
    }
    let fechaFin: string | null = null
    if (t(e.fecha_fin)) {
      fechaFin = fechaIso(e.fecha_fin)
      if (!fechaFin) err('fecha_fin', 'Fecha de fin incorrecta (DD/MM/AAAA)')
      else if (tipo === 'indefinido') err('fecha_fin', 'Un contrato indefinido no lleva fecha de fin')
      else if (fecha_alta && fechaFin < fecha_alta) err('fecha_fin', 'La fecha de fin es anterior a la de alta')
    }
    // Paso 3 — salario: el escrito; si no hay, el de la tabla del convenio (con aviso); si tampoco, error.
    let salarioTxt = t(e.salario_base)
    if (!salarioTxt) {
      const prop = salarioPropuesto(ctx, categoria, fecha_alta)
      if (prop) { salarioTxt = prop; avisos.push('Salario tomado de la tabla del convenio') }
    }
    const cent = salarioTxt ? eurosTextoACentimos(salarioTxt) : null
    if (!salarioTxt) err('salario_base', categoria ? 'Falta el salario (no hay tabla del convenio para esa categoría y año)' : 'Falta el salario base (€/mes)')
    else if (cent === null || cent <= 0) err('salario_base', 'Salario base incorrecto (€/mes, p. ej. 1.350,00)')
    else if (cent > 10_000_000) err('salario_base', 'Salario base fuera de rango (¿es anual? va en €/mes)')

    if (tipo && fecha_alta && cent && cent > 0 && jornada && Number.isInteger(grupo)) {
      contrato = {
        salarioBase: cent / 100, grupoCotizacion: grupo, tipoContrato: tipo, jornadaPct: jornada, irpfRetencionPct: irpf,
        categoriaConvenio: categoria, conceptosFijos: [], vigenteDesde: fecha_alta, fechaInicio: fecha_alta, fechaFin,
        // «parcial» no dice si es indefinido o temporal: con fecha de fin es temporal; sin ella, «no se sabe» (null).
        duracion: tipo === 'parcial' ? (fechaFin ? 'temporal' : null) : tipo,
      }
    }
  }

  let iban: string | null = null
  if (t(e.iban)) { const r = validarIbanEmpleado(e.iban); if (r.ok) iban = r.valor; else err('iban', r.motivo) }

  if (errores.length || !dni.ok) return { ok: false, errores }
  return {
    ok: true,
    avisos,
    alta: {
      nombre, apellidos: opc(e.apellidos), email, dni: dni.valor, nss, telefono, fecha_nacimiento, puesto, fecha_alta, iban,
      tipo_contrato: contrato?.tipoContrato ?? null,
      categoria,
      grupo_cotizacion: contrato ? String(contrato.grupoCotizacion) : null,
      tipo_jornada: contrato ? (contrato.jornadaPct >= 100 ? 'Completa' : 'Parcial') : null,
      contrato,
    },
  }
}

/** Claves de identidad de un alta (DNI/NIE, NAF, email). Dos personas con la misma clave no se dan de alta dos veces. */
export function clavesIdentidad(a: Pick<AltaNormalizada, 'dni' | 'nss' | 'email'>): { dni: string | null; nss: string | null; email: string } {
  // Sin DNI no se compara por DNI (null = «no se sabe», nunca «coincide con otro sin DNI»).
  return { dni: a.dni ? a.dni.toUpperCase() : null, nss: a.nss, email: a.email.toLowerCase() }
}

export interface Existentes { dnis: Set<string>; nss: Set<string>; emails: Set<string> }

/**
 * Motivo por el que un alta choca con la plantilla actual o con una fila anterior del mismo fichero. null = no choca.
 * Un empleado de BAJA también cuenta: se reactiva desde su ficha, no se crea otro.
 */
export function motivoDuplicado(a: Pick<AltaNormalizada, 'dni' | 'nss' | 'email'>, ya: Existentes, previos?: Existentes): string | null {
  const k = clavesIdentidad(a)
  if (k.dni && ya.dnis.has(k.dni)) return 'Ya hay un empleado con ese DNI/NIE en la empresa (si está de baja, reactívalo desde su ficha)'
  if (k.nss && ya.nss.has(k.nss)) return 'Ya hay un empleado con ese nº de afiliación en la empresa'
  if (ya.emails.has(k.email)) return 'Ya hay un empleado con ese email en la empresa'
  if (previos) {
    if (k.dni && previos.dnis.has(k.dni)) return 'DNI/NIE repetido en el fichero'
    if (k.nss && previos.nss.has(k.nss)) return 'Nº de afiliación repetido en el fichero'
    if (previos.emails.has(k.email)) return 'Email repetido en el fichero'
  }
  return null
}

export function registrarClaves(conj: Existentes, a: Pick<AltaNormalizada, 'dni' | 'nss' | 'email'>): void {
  const k = clavesIdentidad(a)
  if (k.dni) conj.dnis.add(k.dni); conj.emails.add(k.email); if (k.nss) conj.nss.add(k.nss)
}

export const existentesVacios = (): Existentes => ({ dnis: new Set(), nss: new Set(), emails: new Set() })

/**
 * Alta RÁPIDA del listado (`POST /api/admin/empleados`): nombre + email obligatorios (regla de `normalizarEmpleado`), el resto
 * opcional y sin contrato. El DNI, si llega, se valida igual que en el asistente; si no llega queda en null («no se sabe»).
 * Devuelve la misma `AltaNormalizada` para que la escritura sea la única de `darDeAltaLote`.
 */
export function validarAltaRapida(e: { nombre?: unknown; apellidos?: unknown; email?: unknown; dni?: unknown; telefono?: unknown; puesto?: unknown }):
  { ok: true; alta: AltaNormalizada } | { ok: false; error: string } {
  let n: ReturnType<typeof normalizarEmpleado>
  try { n = normalizarEmpleado({ nombre: t(e.nombre), apellidos: t(e.apellidos), email: t(e.email), telefono: t(e.telefono) }) }
  catch (err) { return { ok: false, error: err instanceof Error ? err.message : 'Datos incorrectos' } }
  if (!n.email) return { ok: false, error: 'El email es obligatorio (se usa para firmar documentos)' }
  let dni: string | null = null
  if (t(e.dni)) { const r = validarNifNie(t(e.dni)); if (!r.ok) return { ok: false, error: r.motivo }; dni = r.valor }
  const puesto = opc(e.puesto)
  if (n.nombre.length > 120 || (n.apellidos?.length ?? 0) > 160 || (puesto?.length ?? 0) > 120) return { ok: false, error: 'Algún campo es demasiado largo' }
  return {
    ok: true,
    alta: {
      nombre: n.nombre, apellidos: n.apellidos, email: n.email, dni, nss: null, telefono: n.telefono, fecha_nacimiento: null,
      puesto, fecha_alta: null, iban: null, tipo_contrato: null, categoria: null, grupo_cotizacion: null, tipo_jornada: null,
      contrato: null,
    },
  }
}
