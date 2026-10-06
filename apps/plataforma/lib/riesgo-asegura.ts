/**
 * El riesgo como pantalla (29/09/2026, docs/superpowers/specs/2026-09-29-riesgo-figuras-variantes-design.md).
 * Lectura PURA de lo que manda `GET /api/operador/oportunidad/riesgo` de asegura. Una respuesta rara
 * degrada a `null` en el campo, nunca a un valor tranquilizador: una variante sin precios leídos no
 * es «0 opciones», es «no se pudo leer».
 */
import {
  CAMPOS_VEHICULO, ETIQUETA_ROL, esClaveDatosRiesgo, esRolFigura, leerDatosCapital, leerDatosComercio, leerDatosRiesgoLibre, leerDatosVehiculo, leerDatosVivienda,
  type CampoVehiculo, type ClaveDatosRiesgo, type DatosCapitalRiesgo, type DatosComercioRiesgo, type DatosRiesgoLibre, type DatosVehiculoRiesgo, type DatosViviendaRiesgo,
  type RolFigura, type Diferencia,
} from '@central/module-seguros'

export type FiguraRiesgo = {
  rol: RolFigura
  clienteId: string
  nombre: string
  vinculo: string | null
  porDefecto: boolean
  /** Lo que le falta en su ficha para cotizar. `null` = no se pudo leer. */
  faltan: string[] | null
  /** Su ficha es una EMPRESA: va con CIF, sin estado civil, y solo puede ser propietaria. */
  empresa: boolean
}
export type VarianteRiesgo = {
  id: string
  referencia: string
  creadoAt: string
  tomador: { clienteId: string | null; nombre: string | null }
  /** Póliza retarificada en esta variante (renovación); `null` = presupuesto de cliente nuevo. */
  polizaId: string | null
  nota: string | null
  simulado: boolean
  fechaEfecto: string | null
  nPrecios: number | null
  mejor: { compania: string | null; primaEur: number } | null
  presupuesto: {
    id: string
    enviadoAt: string | null
    vistoAt: string | null
    elegidoAt: string | null
    aceptadoAt: string | null
    emitidoAt: string | null
    retiradoAt: string | null
  } | null
  cambios: Diferencia[] | null
}
export type Riesgo = {
  oportunidad: {
    id: string
    clienteId: string
    clienteNombre: string
    ramo: string
    estado: string
    polizaId: string | null
    matricula: string | null
    vehiculo: string | null
    vence: string | null
    aseguradora: string | null
    /** `true` = la compañía de HOY (competencia), no la de nuestra oferta. `null` = asegura no lo dice. */
    aseguradoraActual: boolean | null
    prima: number | null
  }
  roles: RolFigura[]
  figuras: FiguraRiesgo[]
  vinculos: Array<{ clienteId: string; nombre: string; tipo: string }>
  variantes: VarianteRiesgo[]
  /**
   * Datos del vehículo (solo auto/moto; `null` = otro ramo, o una versión de asegura que aún no los manda:
   * en ese caso NO se enseña el bloque, no se pinta «sin datos»). Un campo sin dato es `null`, nunca `0`.
   */
  datosVehiculo: DatosVehiculoRiesgo | null
  /** Lo que falta para pedir precio. `null` = no aplica o no se sabe. */
  faltanVehiculo: CampoVehiculo[] | null
  /**
   * Los datos del riesgo de CUALQUIER ramo (30/09/2026). `null` = una versión de asegura que aún no los manda
   * (no se enseña el bloque: no se pinta «sin datos» sobre algo que no se ha podido mirar). Cada bloque trae sus
   * datos tal cual (`null` = no se sabe, nunca `''`/`0`), lo que falta para pedir precio y si lo que se ve es la
   * precarga de la póliza (`dePoliza`, nunca confirmada). `tarifica: false` = ramo que se cotiza fuera.
   */
  datosRiesgo: DatosRiesgoDeRamo | null
}

export type DatosRiesgoDeRamo =
  | { clave: 'datosVehiculo'; datos: DatosVehiculoRiesgo; faltan: string[]; dePoliza: boolean; tarifica: boolean }
  | { clave: 'datosVivienda'; datos: DatosViviendaRiesgo; faltan: string[]; dePoliza: boolean; tarifica: boolean }
  | { clave: 'datosCapital'; datos: DatosCapitalRiesgo; faltan: string[]; dePoliza: boolean; tarifica: boolean }
  | { clave: 'datosComercio'; datos: DatosComercioRiesgo; faltan: string[]; dePoliza: boolean; tarifica: boolean }
  | { clave: 'datosRiesgoLibre'; datos: DatosRiesgoLibre; faltan: string[]; dePoliza: boolean; tarifica: boolean }

/** Lee `datosRiesgo` sin fiarse: una clave rara o unos datos ilegibles son `null` («no se sabe»), no un bloque vacío. */
export function leerDatosRiesgoDeRamo(bruto: unknown): DatosRiesgoDeRamo | null {
  const o = obj(bruto)
  const clave = o.clave
  if (!esClaveDatosRiesgo(clave)) return null
  const faltan = Array.isArray(o.faltan) ? o.faltan.filter((c): c is string => typeof c === 'string') : []
  const comunes = { faltan, dePoliza: o.dePoliza === true, tarifica: o.tarifica !== false }
  switch (clave as ClaveDatosRiesgo) {
    case 'datosVehiculo': { const d = leerDatosVehiculo(o.datos); return d ? { clave: 'datosVehiculo', datos: d, ...comunes } : null }
    case 'datosVivienda': { const d = leerDatosVivienda(o.datos); return d ? { clave: 'datosVivienda', datos: d, ...comunes } : null }
    case 'datosCapital': { const d = leerDatosCapital(o.datos); return d ? { clave: 'datosCapital', datos: d, ...comunes } : null }
    case 'datosComercio': { const d = leerDatosComercio(o.datos); return d ? { clave: 'datosComercio', datos: d, ...comunes } : null }
    case 'datosRiesgoLibre': { const d = leerDatosRiesgoLibre(o.datos); return d ? { clave: 'datosRiesgoLibre', datos: d, ...comunes } : null }
  }
}

export type LecturaRiesgo = { estado: 'ok'; riesgo: Riesgo } | { estado: 'no_encontrado' } | { estado: 'error'; motivo: string }

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function interpretarRiesgo(status: number, j: unknown): LecturaRiesgo {
  const o = obj(j)
  if (status === 404 || o.estado === 'no_encontrado') return { estado: 'no_encontrado' }
  if (status !== 200 || o.estado !== 'ok') return { estado: 'error', motivo: txt(o.motivo) ?? txt(o.causa) ?? `HTTP ${status}` }
  const op = obj(o.oportunidad)
  if (!txt(op.id) || !txt(op.clienteId)) return { estado: 'error', motivo: 'respuesta sin oportunidad' }
  const figuras = (Array.isArray(o.figuras) ? o.figuras : []).flatMap((f): FiguraRiesgo[] => {
    const x = obj(f)
    if (!esRolFigura(x.rol) || !txt(x.clienteId)) return []
    return [{
      rol: x.rol, clienteId: x.clienteId as string, nombre: txt(x.nombre) ?? 'Sin nombre', vinculo: txt(x.vinculo),
      porDefecto: x.porDefecto === true,
      faltan: Array.isArray(x.faltan) ? x.faltan.filter((c): c is string => typeof c === 'string') : null,
      empresa: x.empresa === true,
    }]
  })
  const variantes = (Array.isArray(o.variantes) ? o.variantes : []).flatMap((v): VarianteRiesgo[] => {
    const x = obj(v)
    if (!txt(x.id)) return []
    const t = obj(x.tomador)
    const m = obj(x.mejor)
    const p = x.presupuesto === null ? null : obj(x.presupuesto)
    return [{
      id: x.id as string,
      referencia: txt(x.referencia) ?? '—',
      creadoAt: txt(x.creadoAt) ?? '',
      tomador: { clienteId: txt(t.clienteId), nombre: txt(t.nombre) },
      polizaId: txt(x.polizaId),
      nota: txt(x.nota),
      simulado: x.simulado === true,
      fechaEfecto: txt(x.fechaEfecto),
      nPrecios: num(x.nPrecios),
      mejor: num(m.primaEur) !== null ? { compania: txt(m.compania), primaEur: num(m.primaEur)! } : null,
      presupuesto: p && txt(p.id)
        ? {
            id: p.id as string, enviadoAt: txt(p.enviadoAt), vistoAt: txt(p.vistoAt), elegidoAt: txt(p.elegidoAt),
            aceptadoAt: txt(p.aceptadoAt), emitidoAt: txt(p.emitidoAt), retiradoAt: txt(p.retiradoAt),
          }
        : null,
      cambios: Array.isArray(x.cambios)
        ? x.cambios.flatMap((c): Diferencia[] => {
            const d = obj(c)
            return txt(d.campo) ? [{ campo: d.campo as string, antes: txt(d.antes), despues: txt(d.despues) }] : []
          })
        : null,
    }]
  })
  return {
    estado: 'ok',
    riesgo: {
      oportunidad: {
        id: op.id as string, clienteId: op.clienteId as string, clienteNombre: txt(op.clienteNombre) ?? 'Cliente',
        ramo: txt(op.ramo) ?? 'otros', estado: txt(op.estado) ?? '', polizaId: txt(op.polizaId), matricula: txt(op.matricula),
        vehiculo: txt(op.vehiculo), vence: txt(op.vence), aseguradora: txt(op.aseguradora),
        aseguradoraActual: typeof op.aseguradoraActual === 'boolean' ? op.aseguradoraActual : null, prima: num(op.prima),
      },
      roles: (Array.isArray(o.roles) ? o.roles : []).filter(esRolFigura),
      figuras,
      vinculos: (Array.isArray(o.vinculos) ? o.vinculos : []).flatMap((v) => {
        const x = obj(v)
        return txt(x.clienteId) ? [{ clienteId: x.clienteId as string, nombre: txt(x.nombre) ?? 'Sin nombre', tipo: txt(x.tipo) ?? '' }] : []
      }),
      variantes,
      datosRiesgo: leerDatosRiesgoDeRamo(o.datosRiesgo),
      datosVehiculo: leerDatosVehiculo(o.datosVehiculo),
      faltanVehiculo: Array.isArray(o.faltanVehiculo)
        ? o.faltanVehiculo.filter((c): c is CampoVehiculo => (CAMPOS_VEHICULO as readonly string[]).includes(c as string))
        : null,
    },
  }
}

/** Estado del presupuesto de una variante, en palabras. `null` = sin presupuesto preparado. */
export function estadoPresupuestoVariante(p: VarianteRiesgo['presupuesto']): string | null {
  if (!p) return null
  if (p.retiradoAt) return 'Retirado'
  if (p.emitidoAt) return 'Emitido'
  if (p.aceptadoAt) return 'Aceptado'
  if (p.elegidoAt) return 'Eligió opción'
  if (p.vistoAt) return 'Enviado · visto'
  if (p.enviadoAt) return 'Enviado · sin abrir'
  return 'Preparado, sin enviar'
}

/** Figura que ocupa un rol: la asignada o, si no hay, la del tomador (salvo el ocasional, que es opcional). */
export function figuraDelRol(r: Riesgo, rol: RolFigura): FiguraRiesgo | null {
  return r.figuras.find((f) => f.rol === rol) ?? null
}

export const ROTULO_ROL = ETIQUETA_ROL

const CAMPO_FALTA: Record<string, string> = {
  dni: 'DNI', nombre: 'nombre', apellido1: 'apellido', fechaNacimiento: 'fecha de nacimiento',
  sexo: 'sexo', telefono: 'móvil', fechaCarnet: 'fecha del carnet', ficha: 'ficha',
  empresa_no_conduce: 'es una empresa y no puede conducir (asigna un conductor habitual persona)',
}
/**
 * Dónde se rellena cada clave que puede devolver `faltanDeFigura()` (apps/asegura/lib/oportunidad-riesgo.ts).
 * · `completar`: bloque «Falta por completar» del modal «Editar datos» (sexo → `clientes.saludo`, móvil → teléfono principal).
 * · `formulario`: formulario del propio modal (identidad: DNI/nombre/apellidos/nacimiento; carné: `EditarCarnets`).
 * · `cambiar`: no es un dato que teclear: se resuelve con «Cambiar» (poner a una persona como conductor).
 * · `sin_ficha`: la figura no tiene ficha legible; no hay nada que editar hasta que exista.
 * Un test lee `faltanDeFigura` y falla si aparece una clave sin entrada aquí.
 */
export const EDITOR_DE_FALTA: Record<string, 'completar' | 'formulario' | 'cambiar' | 'sin_ficha'> = {
  dni: 'formulario', nombre: 'formulario', apellido1: 'formulario', fechaNacimiento: 'formulario', fechaCarnet: 'formulario',
  sexo: 'completar', telefono: 'completar',
  empresa_no_conduce: 'cambiar', ficha: 'sin_ficha',
}

/** Rótulos de lo que falta y se corrige en los formularios del modal (no en «Falta por completar»). */
export function rotulosFaltaEnFormulario(f: string[] | null): string[] {
  return (f ?? []).filter((k) => EDITOR_DE_FALTA[k] === 'formulario').map((k) => CAMPO_FALTA[k] ?? k)
}

/** ¿La ficha de la figura NO tiene móvil? `null` (no se pudo leer la ficha) = no se sabe → false: no se ofrece escribir a ciegas. */
export function faltaMovil(f: string[] | null): boolean {
  return f !== null && f.includes('telefono')
}
/** ¿La ficha de la figura NO tiene sexo? Misma regla que `faltaMovil`: `null` = no se sabe → false. */
export function faltaSexo(f: string[] | null): boolean {
  return f !== null && f.includes('sexo')
}
export function textoFaltan(f: string[] | null): string | null {
  if (f === null) return 'No se pudo leer su ficha'
  if (f.length === 0) return null
  return `Falta en su ficha: ${f.map((c) => CAMPO_FALTA[c] ?? c).join(', ')}`
}

// ─── Comparar dos variantes del riesgo (29/09/2026) ─────────────────────────
// Lectura PURA de `GET /api/operador/oportunidad/comparar`. Tres estados que no se colapsan:
// `cambios: null` = «no se puede comparar» · `[]` = «mismos datos» · con filas = lo que cambia.
// Una compañía sin precio en una de las dos es `null` en esa columna («—»), nunca 0 €.

export type PrecioComparado = { primaEur: number; modalidad: string | null } | null
export type FilaComparacion = { compania: string; a: PrecioComparado; b: PrecioComparado }
export type Comparacion = { a: string; b: string; cambios: Diferencia[] | null; companias: FilaComparacion[] }
export type LecturaComparacion = { estado: 'ok'; comparacion: Comparacion } | { estado: 'no_encontrado' } | { estado: 'error'; motivo: string }

function precioComparado(v: unknown): PrecioComparado {
  const x = obj(v)
  const prima = num(x.primaEur)
  return prima === null ? null : { primaEur: prima, modalidad: txt(x.modalidad) }
}

export function interpretarComparacion(status: number, j: unknown): LecturaComparacion {
  const o = obj(j)
  if (status === 404 || o.estado === 'no_encontrado') return { estado: 'no_encontrado' }
  if (status !== 200 || o.estado !== 'ok') return { estado: 'error', motivo: txt(o.motivo) ?? txt(o.causa) ?? `HTTP ${status}` }
  if (!txt(o.a) || !txt(o.b)) return { estado: 'error', motivo: 'respuesta sin variantes' }
  const cambios = Array.isArray(o.cambios)
    ? o.cambios.flatMap((c): Diferencia[] => {
        const d = obj(c)
        return txt(d.campo) ? [{ campo: d.campo as string, antes: txt(d.antes), despues: txt(d.despues) }] : []
      })
    : null
  const companias = (Array.isArray(o.companias) ? o.companias : []).flatMap((c): FilaComparacion[] => {
    const x = obj(c)
    const compania = txt(x.compania)
    if (!compania) return []
    const a = precioComparado(x.a)
    const b = precioComparado(x.b)
    return a === null && b === null ? [] : [{ compania, a, b }]
  })
  return { estado: 'ok', comparacion: { a: o.a as string, b: o.b as string, cambios, companias } }
}

/** La prima más baja de cada columna (`null` = esa variante no tiene ningún precio). */
export function mejoresComparacion(filas: readonly FilaComparacion[]): { a: number | null; b: number | null } {
  const min = (xs: (number | undefined)[]) => {
    const v = xs.filter((x): x is number => typeof x === 'number')
    return v.length > 0 ? Math.min(...v) : null
  }
  return { a: min(filas.map((f) => f.a?.primaEur)), b: min(filas.map((f) => f.b?.primaEur)) }
}

/** `b − a` redondeado al céntimo; `null` si falta cualquiera de las dos (no se compara con un hueco). */
export function diferenciaComparacion(f: FilaComparacion): number | null {
  if (f.a === null || f.b === null) return null
  return Math.round((f.b.primaEur - f.a.primaEur) * 100) / 100
}

/** Las dos marcadas, la más ANTIGUA como `a` (orden de `creadoAt`; sin fecha, la de más abajo en la lista). */
export function ordenarParaComparar(variantes: readonly VarianteRiesgo[], ids: readonly string[]): [VarianteRiesgo, VarianteRiesgo] | null {
  if (ids.length !== 2 || ids[0] === ids[1]) return null
  const elegidas = ids.map((id) => ({ v: variantes.find((x) => x.id === id), i: variantes.findIndex((x) => x.id === id) }))
  if (elegidas.some((e) => !e.v)) return null
  const [x, y] = elegidas as { v: VarianteRiesgo; i: number }[]
  const ta = Date.parse(x.v.creadoAt)
  const tb = Date.parse(y.v.creadoAt)
  const xAntes = Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb ? ta < tb : x.i > y.i
  return xAntes ? [x.v, y.v] : [y.v, x.v]
}
