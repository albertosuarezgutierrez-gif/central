// PATRIMONIO (22/10/2026, paso 6) — lógica PURA (puertos inyectados, sin prisma ni sesión) de comunidades, plantillas de
// gasto fijo y derramas: `GET/POST /api/patrimonio/{plantillas,comunidades,derramas}`. La BD real está en `gastos-bd.ts`.
//
// 🚨 El `titular` del cuerpo es una PETICIÓN: se busca DENTRO de los accesos ya resueltos por la cookie. Si no está, o el
// nivel no permite la acción, la MISMA 404 `no_encontrado` (nunca 403). El inmueble / la comunidad del cuerpo tampoco
// consultan por sí solos: el puerto los busca DENTRO de ese titular (y la BD lo repite con FK compuestas).
// Permisos (tabla §4 de la spec): plantillas y derramas = `gestionar_gastos_documentos` (Gestión y Total);
// comunidad (estructura: qué inmueble cuelga de qué comunidad) = `alta_baja` (solo Total).
// Importes: `null` = variable / no consta, NUNCA 0 (la BD lo exige: `importe_cent > 0`).
import { CATEGORIAS_GASTO, esCategoriaGasto, esFecha, puede, type CategoriaGasto, type NivelPatrimonio, type Periodicidad } from '@central/module-patrimonio'
import type { FuenteFactura, PropuestaFactura } from './factura-propuesta.ts'

export type AccesosMapa = ReadonlyMap<string, NivelPatrimonio>
export type Respuesta = { status: number; body: Record<string, unknown> }

export const PERIODICIDADES: readonly Periodicidad[] = ['mensual', 'trimestral', 'semestral', 'anual']
export const ETIQUETA_PERIODICIDAD: Record<Periodicidad, string> = { mensual: 'Mensual', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' }
export const ETIQUETA_CATEGORIA: Record<CategoriaGasto, string> = {
  COMUNIDAD: 'Comunidad', IMPUESTOS: 'Impuestos', SUMINISTROS: 'Suministros', SEGURO: 'Seguro', MANTENIMIENTO: 'Mantenimiento',
  REFORMAS: 'Reformas', GESTION: 'Gestión', FINANCIACION: 'Financiación', MOBILIARIO: 'Mobiliario', OTRO: 'Otro',
}
export { CATEGORIAS_GASTO }

const NO_ENCONTRADO: Respuesta = { status: 404, body: { error: 'no_encontrado' } }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const texto = (v: unknown, min: number, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim().replace(/\s+/g, ' ')
  return t.length >= min && t.length <= max ? t : null
}
const opcional = (v: unknown): v is null | undefined | '' => v === undefined || v === null || v === ''

/** «1.234,56» / «1234.5» / «12» → céntimos enteros. Vacío → `null` (variable). Inválido o ≤ 0 → `'invalido'`. */
export function eurosACentimos(v: unknown): number | null | 'invalido' {
  if (opcional(v)) return null
  const s = String(v).trim().replace(/\s/g, '').replace(/€/g, '')
  // Sin coma, «1.234» / «1.234.567» (grupos de 3 dígitos) son miles españoles; «12.5» / «12.50» son decimales.
  const normal = s.includes(',') || (typeof v === 'string' && /^\d{1,3}(\.\d{3})+$/.test(s)) ? s.replace(/\./g, '').replace(',', '.') : s
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return 'invalido'
  const cent = Math.round(Number(normal) * 100)
  return Number.isSafeInteger(cent) && cent > 0 ? cent : 'invalido'
}

/** Céntimos del cuerpo: entero > 0, o `null` si falta (variable). Un 0 o un negativo NO es «variable»: es inválido. */
function importeCent(v: unknown): number | null | 'invalido' {
  if (opcional(v)) return null
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : 'invalido'
}

// ─── Validación de la forma ───────────────────────────────────────────────────────────────────────────────

export type DatosPlantilla = {
  inmuebleId: string | null
  comunidadId: string | null
  concepto: string
  categoria: CategoriaGasto
  periodicidad: Periodicidad
  diaMes: number
  inicio: string
  fin: string | null
  importeCent: number | null
  proveedor: string | null
}
export type DatosComunidad = {
  nombre: string
  nifComunidad: string | null
  administradorNombre: string | null
  administradorEmail: string | null
  inmuebles: { inmuebleId: string; coeficiente: number | null }[]
}
export type DatosDerrama = { comunidadId: string; inmuebleId: string; concepto: string; totalCent: number; cuotas: number; primera: string }
type V<T> = { ok: true; datos: T } | { ok: false; campo: string }
const obj = (c: unknown) => (c && typeof c === 'object' ? c : {}) as Record<string, unknown>

export function validarPlantilla(cuerpo: unknown): V<DatosPlantilla> {
  const b = obj(cuerpo)
  const concepto = texto(b.concepto, 1, 200)
  if (!concepto) return { ok: false, campo: 'concepto' }
  if (!esCategoriaGasto(b.categoria)) return { ok: false, campo: 'categoria' }
  if (!(PERIODICIDADES as readonly unknown[]).includes(b.periodicidad)) return { ok: false, campo: 'periodicidad' }
  const diaMes = b.diaMes
  if (typeof diaMes !== 'number' || !Number.isInteger(diaMes) || diaMes < 1 || diaMes > 31) return { ok: false, campo: 'diaMes' }
  if (!esFecha(b.inicio)) return { ok: false, campo: 'inicio' }
  let fin: string | null = null
  if (!opcional(b.fin)) {
    if (!esFecha(b.fin) || b.fin < b.inicio) return { ok: false, campo: 'fin' }
    fin = b.fin
  }
  const imp = importeCent(b.importeCent)
  if (imp === 'invalido') return { ok: false, campo: 'importe' }
  let inmuebleId: string | null = null
  if (!opcional(b.inmueble)) {
    if (typeof b.inmueble !== 'string' || !UUID.test(b.inmueble)) return { ok: false, campo: 'inmueble' }
    inmuebleId = b.inmueble
  }
  let comunidadId: string | null = null
  if (!opcional(b.comunidad)) {
    if (typeof b.comunidad !== 'string' || !UUID.test(b.comunidad) || inmuebleId === null) return { ok: false, campo: 'comunidad' }
    comunidadId = b.comunidad
  }
  const proveedor = opcional(b.proveedor) ? null : texto(b.proveedor, 1, 120)
  if (!opcional(b.proveedor) && !proveedor) return { ok: false, campo: 'proveedor' }
  return {
    ok: true,
    datos: { inmuebleId, comunidadId, concepto, categoria: b.categoria, periodicidad: b.periodicidad as Periodicidad, diaMes, inicio: b.inicio, fin, importeCent: imp, proveedor },
  }
}

export function validarComunidad(cuerpo: unknown): V<DatosComunidad> {
  const b = obj(cuerpo)
  const nombre = texto(b.nombre, 1, 120)
  if (!nombre) return { ok: false, campo: 'nombre' }
  const nif = opcional(b.nifComunidad) ? null : texto(b.nifComunidad, 8, 12)
  if (!opcional(b.nifComunidad) && !nif) return { ok: false, campo: 'nifComunidad' }
  const adm = opcional(b.administradorNombre) ? null : texto(b.administradorNombre, 1, 120)
  if (!opcional(b.administradorNombre) && !adm) return { ok: false, campo: 'administradorNombre' }
  const email = opcional(b.administradorEmail) ? null : texto(b.administradorEmail, 3, 200)
  if (!opcional(b.administradorEmail) && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return { ok: false, campo: 'administradorEmail' }
  const inmuebles: DatosComunidad['inmuebles'] = []
  const lista = b.inmuebles === undefined ? [] : b.inmuebles
  if (!Array.isArray(lista) || lista.length > 50) return { ok: false, campo: 'inmuebles' }
  for (const x of lista) {
    const e = obj(x)
    if (typeof e.inmueble !== 'string' || !UUID.test(e.inmueble)) return { ok: false, campo: 'inmuebles' }
    // Coeficiente en %: `null` = no consta (la BD admite NULL; 0 no es «no consta»).
    let coef: number | null = null
    if (!opcional(e.coeficiente)) {
      if (typeof e.coeficiente !== 'number' || !Number.isFinite(e.coeficiente) || e.coeficiente <= 0 || e.coeficiente > 100) return { ok: false, campo: 'coeficiente' }
      coef = e.coeficiente
    }
    if (inmuebles.some((i) => i.inmuebleId === e.inmueble)) return { ok: false, campo: 'inmuebles' }
    inmuebles.push({ inmuebleId: e.inmueble, coeficiente: coef })
  }
  return { ok: true, datos: { nombre, nifComunidad: nif, administradorNombre: adm, administradorEmail: email, inmuebles } }
}

export function validarDerrama(cuerpo: unknown): V<DatosDerrama> {
  const b = obj(cuerpo)
  if (typeof b.comunidad !== 'string' || !UUID.test(b.comunidad)) return { ok: false, campo: 'comunidad' }
  if (typeof b.inmueble !== 'string' || !UUID.test(b.inmueble)) return { ok: false, campo: 'inmueble' }
  const concepto = texto(b.concepto, 1, 200)
  if (!concepto) return { ok: false, campo: 'concepto' }
  // La derrama SIEMPRE tiene total (a diferencia de la plantilla): sin importe no hay reparto.
  const total = importeCent(b.totalCent)
  if (total === null || total === 'invalido') return { ok: false, campo: 'total' }
  const cuotas = b.cuotas
  if (typeof cuotas !== 'number' || !Number.isInteger(cuotas) || cuotas < 1 || cuotas > 120) return { ok: false, campo: 'cuotas' }
  if (!esFecha(b.primera)) return { ok: false, campo: 'primera' }
  return { ok: true, datos: { comunidadId: b.comunidad, inmuebleId: b.inmueble, concepto, totalCent: total, cuotas, primera: b.primera } }
}

// ─── Puertos y respuestas ───────────────────────────────────────────────────────────────────────────────────

export type PlantillaFila = {
  id: string; inmuebleId: string | null; inmuebleAlias: string | null; concepto: string; categoria: string; periodicidad: string
  diaMes: number; inicio: string; fin: string | null; importeCent: number | null; proveedor: string | null; activo: boolean
}
export type ComunidadFila = { id: string; nombre: string; administradorNombre: string | null; inmuebles: { inmuebleId: string; alias: string; coeficiente: number | null }[] }
export type DerramaFila = {
  id: string; comunidadId: string; comunidadNombre: string; inmuebleId: string; inmuebleAlias: string; concepto: string
  totalCent: number; cuotas: number; primera: string
}
/** Factura leída con IA que se subió y aún no se ha confirmado ni descartado (la revisión se pudo cerrar sin resolverla). */
export type FacturaPendiente = {
  id: string
  inmuebleId: string | null
  fuente: FuenteFactura
  /** Lo LEÍDO (`propuesta.leido`): `fecha: null` = «fecha sin leer». La columna `fecha` del gasto es solo un marcador. */
  propuesta: PropuestaFactura
  motivos: string[]
  subidaEn: string
}

export type TitularGastos = {
  clienteId: string
  nombre: string
  nivel: NivelPatrimonio
  /** Es tu propia ficha (vínculo), no una a la que accedes por Dueño o autorización. */
  propio: boolean
  puedeGestionar: boolean
  puedeEstructura: boolean
  inmuebles: { id: string; alias: string }[]
  plantillas: PlantillaFila[]
  comunidades: ComunidadFila[]
  derramas: DerramaFila[]
  /** Solo con nivel de gestión; vacío si no puede gestionar. */
  facturasPendientes: FacturaPendiente[]
}

export type ResultadoCrear = { ok: true; id: string } | { ok: false; motivo: 'no_encontrado' | 'duplicado' }

export interface PuertosGastos {
  accesos(): Promise<AccesosMapa>
  /** Solo se llama con ids que salieron de `accesos()`. */
  listar(clientesIds: readonly string[], accesos: AccesosMapa): Promise<TitularGastos[]>
  /** El inmueble / la comunidad se buscan DENTRO de ese titular; fuera de él → `no_encontrado`. */
  crearPlantilla(x: { clienteId: string; datos: DatosPlantilla }): Promise<ResultadoCrear>
  crearComunidad(x: { clienteId: string; datos: DatosComunidad }): Promise<ResultadoCrear>
  crearDerrama(x: { clienteId: string; datos: DatosDerrama }): Promise<ResultadoCrear>
}

type Accion = 'gestionar_gastos_documentos' | 'alta_baja'

/** Titular DENTRO de los accesos y con el nivel que da la acción; si no, `null` (la 404 única). */
function titularConPermiso(accesos: AccesosMapa, cuerpo: unknown, accion: Accion): string | null {
  const pedido = obj(cuerpo).titular
  if (typeof pedido !== 'string' || !accesos.has(pedido)) return null
  return puede(accesos.get(pedido), accion) ? pedido : null
}

export async function responderListaGastos(p: PuertosGastos): Promise<Respuesta> {
  const accesos = await p.accesos()
  if (accesos.size === 0) return { status: 200, body: { titulares: [] } }
  return { status: 200, body: { titulares: await p.listar([...accesos.keys()], accesos) } }
}

async function alta<T>(
  p: PuertosGastos,
  cuerpo: unknown,
  accion: Accion,
  validar: (c: unknown) => V<T>,
  crear: (x: { clienteId: string; datos: T }) => Promise<ResultadoCrear>,
): Promise<Respuesta> {
  const accesos = await p.accesos()
  const clienteId = titularConPermiso(accesos, cuerpo, accion)
  if (clienteId === null) return NO_ENCONTRADO
  const v = validar(cuerpo)
  if (!v.ok) return { status: 400, body: { error: 'datos_invalidos', campo: v.campo } }
  const r = await crear({ clienteId, datos: v.datos })
  if (r.ok) return { status: 201, body: { id: r.id } }
  return r.motivo === 'no_encontrado' ? NO_ENCONTRADO : { status: 409, body: { error: 'ya_existe' } }
}

export const responderAltaPlantilla = (p: PuertosGastos, c: unknown) => alta(p, c, 'gestionar_gastos_documentos', validarPlantilla, (x) => p.crearPlantilla(x))
export const responderAltaComunidad = (p: PuertosGastos, c: unknown) => alta(p, c, 'alta_baja', validarComunidad, (x) => p.crearComunidad(x))
export const responderAltaDerrama = (p: PuertosGastos, c: unknown) => alta(p, c, 'gestionar_gastos_documentos', validarDerrama, (x) => p.crearDerrama(x))
