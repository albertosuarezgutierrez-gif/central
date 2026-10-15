// El bloque «Historial» de la pantalla del riesgo (10/10/2026): seguro anterior, años asegurado, años sin
// siniestros, siniestros de los últimos 5 años y carné. Puro y sin E/S: lo que decide qué se afirma está testeado.
//
// 🚨 Tres estados en CADA fila (regla del repo):
//   · `pendiente` — `null`: no se sabe / no se ha leído. NUNCA se pinta 0, «ninguno» ni 🟢.
//   · `revisado`  — `0` siniestros o `0` años: el documento lo dice y el valor es 0 (un valor, no un hueco).
//   · `dato`      — hay un valor.
// `no_aplica` solo para el carné en un ramo que no lo usa (no se pinta la fila).
import { ETIQUETA_ROL, ultimosDigitosPoliza } from '@central/module-seguros'
import type { HistorialRiesgo } from './riesgo-asegura.ts'
import { codigoCompania } from './seguro-anterior.ts'

export type EstadoFila = 'pendiente' | 'revisado' | 'dato' | 'no_aplica'
export type ClaveFila = 'seguroAnterior' | 'aniosAsegurado' | 'aniosEnCompania' | 'aniosSinSiniestros' | 'siniestrosUltimos5' | 'carnet'
export type FilaHistorial = {
  clave: ClaveFila
  etiqueta: string
  estado: EstadoFila
  /** Lo que se pinta. En `pendiente` es siempre «sin dato», jamás un número. */
  texto: string
  /** Matiz en pequeño (por qué falta, o qué hacer); `null` si no hace falta. */
  nota: string | null
  /** `aviso` = el dato es malo o dudoso (siniestros, carné reciente). */
  tono: 'neutro' | 'aviso'
}

const anios = (n: number) => `${n} ${n === 1 ? 'año' : 'años'}`
const fechaIso = (d: string): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d) ?? null
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  const e = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(d.trim())
  return e ? `${e[3]}-${e[2].padStart(2, '0')}-${e[1].padStart(2, '0')}` : null
}
const esFechaReal = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso
}

/**
 * Años COMPLETOS entre `desde` y `hoy` (aaaa-mm-dd). `null` si `desde` no es una fecha real o es POSTERIOR a hoy
 * (un carné del futuro es un error de ficha, no «0 años»).
 */
export function antiguedadAnios(desde: string, hoy: string): number | null {
  const a = fechaIso(desde)
  if (a === null || !esFechaReal(a) || a > hoy) return null
  const [ya, ma, da] = a.split('-').map(Number)
  const [yh, mh, dh] = hoy.split('-').map(Number)
  return yh - ya - (mh < ma || (mh === ma && dh < da) ? 1 : 0)
}

/**
 * La fila del seguro de hoy con lo DECLARADO en este bloque (13/10/2026): manda sobre lo leído y se dice que es
 * declarado. `null` = no hay nada declarado (se pinta lo leído, como siempre). Lo declarado NUNCA se hace pasar por
 * leído de una póliza: la nota lo dice siempre.
 */
function filaSeguroDeclarado(h: HistorialRiesgo, compania: string | null, nombreCompania?: (v: string) => string): FilaHistorial | null {
  const hd = h.historialDeclarado
  const etiqueta = 'Seguro actual'
  if (hd.tieneSeguroActual === false) {
    return { clave: 'seguroAnterior', etiqueta, estado: 'revisado', texto: 'no tiene seguro ahora', nota: 'declarado aquí: se cotiza «de calle» (precio estimado)', tono: 'aviso' }
  }
  if (hd.tieneSeguroActual === null && hd.companiaActual === null && hd.numeroPoliza === null) return null
  // Lo que no se ha declarado sale de lo leído (compañía de hoy, nº de la póliza subida) y se dice.
  // Lo declarado se guarda como el CÓDIGO que espera Avant2 (13/10/2026): se pinta con su nombre si hay lista.
  const quien = (hd.companiaActual !== null ? (nombreCompania?.(hd.companiaActual) ?? hd.companiaActual) : null) ?? compania
  const poliza = hd.numeroPoliza ?? h.seguroAnterior?.numeroPoliza ?? null
  const deLeido = (hd.companiaActual === null && compania !== null) || (hd.numeroPoliza === null && poliza !== null)
  const partes = [quien ?? 'compañía sin dato', poliza ? `póliza ${poliza}` : 'nº de póliza sin dato']
  const cinco = poliza ? ultimosDigitosPoliza(poliza) : null
  const faltan = [quien === null ? 'la compañía' : null, poliza === null ? 'el nº de póliza' : null].filter(Boolean)
  return {
    clave: 'seguroAnterior', etiqueta, estado: 'dato', texto: `tiene seguro · ${partes.join(' · ')}`,
    nota: [
      'declarado aquí',
      deLeido ? `${hd.companiaActual === null && compania !== null ? 'compañía' : 'nº de póliza'}${hd.companiaActual === null && compania !== null && hd.numeroPoliza === null && poliza !== null ? ' y nº de póliza' : ''}: lo leído de su póliza` : null,
      cinco ? `a Codeoscopic van los 5 últimos: ${cinco}` : null,
      faltan.length > 0 ? `falta ${faltan.join(' y ')}: sin ${faltan.length > 1 ? 'ellos' : 'eso'} la compañía no puede consultar SINCO` : null,
    ].filter(Boolean).join(' · '),
    tono: faltan.length > 0 ? 'aviso' : 'neutro',
  }
}

function filaSeguroAnterior(h: HistorialRiesgo, compania: string | null, nombreCompania?: (v: string) => string): FilaHistorial {
  const declarado = filaSeguroDeclarado(h, compania, nombreCompania)
  if (declarado) return declarado
  const sa = h.seguroAnterior
  const nombre = compania ?? null
  const poliza = sa?.numeroPoliza ?? null
  if (nombre === null && poliza === null && sa?.codigoDgs == null) {
    // Algún otro dato leído (fecha de efecto, matrícula, años sin siniestros…) = hay un seguro anterior PARCIAL, no «ninguno».
    const hayAlgo = sa != null && Object.values(sa).some((v) => v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === ''))
    if (hayAlgo) {
      return { clave: 'seguroAnterior', etiqueta: 'Seguro anterior', estado: 'dato', texto: 'seguro anterior parcial', nota: 'consta algún dato, pero no la compañía ni la póliza', tono: 'neutro' }
    }
    return { clave: 'seguroAnterior', etiqueta: 'Seguro anterior', estado: 'pendiente', texto: 'sin dato', nota: 'no se ha leído ninguna póliza anterior', tono: 'neutro' }
  }
  const quien = nombre ?? (sa?.codigoDgs ? `compañía ${sa.codigoDgs}` : 'compañía sin dato')
  return { clave: 'seguroAnterior', etiqueta: 'Seguro anterior', estado: 'dato', texto: poliza ? `${quien} · póliza ${poliza}` : quien, nota: null, tono: 'neutro' }
}

/** Años asegurado / en compañía: `null` = sin dato (nunca 0 ni el máximo de 10); `0` = revisado; con valor = dato. */
function filaAnios(clave: 'aniosAsegurado' | 'aniosEnCompania', etiqueta: string, v: number | null | undefined): FilaHistorial {
  if (v === null || v === undefined) return { clave, etiqueta, estado: 'pendiente', texto: 'sin dato', nota: 'se declara al pedir precio', tono: 'neutro' }
  return { clave, etiqueta, estado: v === 0 ? 'revisado' : 'dato', texto: v === 0 ? 'menos de 1 año' : anios(v), nota: null, tono: 'neutro' }
}

/**
 * Años sin siniestros / siniestros en 5 años. Lo DECLARADO aquí manda sobre lo leído del papel y se rotula «declarado
 * aquí» (nunca pasa por leído); sin declarar, lo leído, como siempre (sin nota, como antes del 13/10/2026).
 */
function filaSiniestros(clave: 'aniosSinSiniestros' | 'siniestrosUltimos5', etiqueta: string, leido: number | null | undefined, declarado: number | null = null): FilaHistorial {
  const v = declarado ?? leido
  if (v === null || v === undefined) return { clave, etiqueta, estado: 'pendiente', texto: 'sin dato', nota: 'ni declarado aquí ni en el papel', tono: 'neutro' }
  const nota = declarado !== null ? 'declarado aquí' : null
  if (clave === 'aniosSinSiniestros') {
    return { clave, etiqueta, estado: v === 0 ? 'revisado' : 'dato', texto: anios(v), nota, tono: v === 0 ? 'aviso' : 'neutro' }
  }
  return v === 0
    ? { clave, etiqueta, estado: 'revisado', texto: 'ninguno', nota, tono: 'neutro' }
    : { clave, etiqueta, estado: 'dato', texto: String(v), nota, tono: 'aviso' }
}

function filaCarnet(c: HistorialRiesgo['carnet'], hoy: string): FilaHistorial {
  const etiqueta = 'Carné de conducir'
  if (c === null) return { clave: 'carnet', etiqueta, estado: 'no_aplica', texto: '', nota: null, tono: 'neutro' }
  if (c.fecha === null) {
    return { clave: 'carnet', etiqueta, estado: 'pendiente', texto: 'sin dato', nota: c.legible ? 'la ficha no tiene la fecha' : c.conductor === null ? 'no se leyó ninguna ficha de conductor' : 'no se pudo leer la ficha', tono: 'neutro' }
  }
  const n = antiguedadAnios(c.fecha, hoy)
  if (n === null) return { clave: 'carnet', etiqueta, estado: 'pendiente', texto: 'sin dato', nota: `la fecha «${c.fecha}» no es válida o es futura: revisa la ficha`, tono: 'aviso' }
  const iso = fechaIso(c.fecha)!
  const quien = c.conductor ? ` · ${ETIQUETA_ROL[c.conductor].toLowerCase()}` : ''
  const desde = `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
  return {
    clave: 'carnet', etiqueta, estado: n === 0 ? 'revisado' : 'dato',
    texto: `${n === 0 ? 'menos de 1 año' : anios(n)} (desde ${desde})${quien}`,
    nota: null, tono: n < 2 ? 'aviso' : 'neutro',
  }
}

/**
 * Las filas del bloque. `h === null` (asegura aún no manda el historial) = `sin_leer`: se dice, no se pinta un historial
 * vacío. `compania` es la compañía de HOY solo si asegura dice que lo es (`aseguradoraActual`); la de nuestra oferta no cuenta.
 * «Años asegurado» / «en la compañía» salen de `historialDeclarado` (lo tecleado en este bloque: POST `editar` de asegura,
 * guardado en `poliza_competencia.historialDeclarado`, FUERA de `seguroAnterior`); sin valor, `pendiente`, nunca un 0 ni los
 * 10 del máximo. Por eso unos años declarados NO cuentan para la fila «Seguro anterior» (ni como «parcial»).
 * 13/10/2026: también se declaran aquí seguro actual sí/no, compañía, nº de póliza, años sin siniestros y siniestros en
 * 5 años (lo que las compañías consultan en SINCO). Lo declarado manda sobre lo leído y SIEMPRE se rotula «declarado aquí».
 */
export function filasHistorial(h: HistorialRiesgo | null, opciones: {
  compania: string | null
  hoy: string
  nombreCompania?: (v: string) => string
  /**
   * 15/10/2026: con QUÉ se cotizará cada fila SIN DATO (`notaCotizaraHistorial` de `lib/correduria/supuestos-auto.ts`,
   * p. ej. «Sin dato · se cotizará con 10 años (supuesto)»). Sustituye la nota de la fila pendiente; el texto sigue
   * siendo «sin dato» (nunca un número que parezca dato). Sin él, la nota de siempre.
   */
  cotizara?: Partial<Record<ClaveFila, string | null>>
}): { estado: 'sin_leer' } | { estado: 'ok'; filas: FilaHistorial[] } {
  if (h === null) return { estado: 'sin_leer' }
  const sa = h.seguroAnterior
  const hd = h.historialDeclarado
  const filas: FilaHistorial[] = [
    filaSeguroAnterior(h, opciones.compania, opciones.nombreCompania),
    filaAnios('aniosAsegurado', 'Años asegurado', hd?.aniosAsegurado),
    filaAnios('aniosEnCompania', 'Años en la compañía', hd?.aniosEnCompania),
    filaSiniestros('aniosSinSiniestros', 'Años sin siniestros', sa?.aniosSinSiniestros, hd?.aniosSinSiniestros ?? null),
    filaSiniestros('siniestrosUltimos5', 'Siniestros en los últimos 5 años', sa?.siniestrosUltimos5, hd?.siniestrosUltimos5 ?? null),
    filaCarnet(h.carnet, opciones.hoy),
  ]
  const conCotizara = filas.map((f) => {
    const n = f.estado === 'pendiente' ? opciones.cotizara?.[f.clave] ?? null : null
    return n ? { ...f, nota: n } : f
  })
  return { estado: 'ok', filas: conCotizara.filter((f) => f.estado !== 'no_aplica') }
}

// ── Compañía actual DECLARADA: selector con la lista de Codeoscopic (13/10/2026) ────────────────────────────────────
// Regla de Alberto: «los campos son siempre los de Avant2». La compañía se elige de la lista de MERCADO de Avant2 (la
// misma que valida el cotizador: `/car/insurance-companies`, o la de moto), gratis, y se guarda su CÓDIGO (lo que va
// en `previousInsurance.previousCompany.code`). Sin lista (puerto caído), se teclea a mano como antes.

export type OpcionCompania = { id: string; nombre: string }

/** El catálogo de compañías anteriores del ramo (el de moto es propio; el resto, el de coche). */
export function tipoCatalogoCompanias(ramo: string): 'companias-anteriores' | 'companias-anteriores-moto' {
  return ramo === 'moto' ? 'companias-anteriores-moto' : 'companias-anteriores'
}

const normalCompania = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Busca en la lista por nombre o código (sin tildes ni mayúsculas). Vacío = todas. Como mucho `max` (rendimiento). */
export function filtrarCompanias(opciones: OpcionCompania[], q: string, max = 50): { opciones: OpcionCompania[]; total: number } {
  const n = normalCompania(q)
  const todas = n === '' ? opciones : opciones.filter((o) => normalCompania(o.nombre).includes(n) || normalCompania(o.id).includes(n))
  return { opciones: todas.slice(0, max), total: todas.length }
}

/**
 * Lo guardado como compañía declarada contra la lista: `codigo` = el código de la lista (si lo guardado es un código o un
 * nombre que casa SIN ambigüedad) · `null` = no casa (texto viejo tecleado a mano: se dice, no se inventa uno).
 */
export function companiaDeLista(opciones: OpcionCompania[], guardado: string | null): string | null {
  if (guardado === null || guardado.trim() === '') return null
  return codigoCompania(opciones.map((o) => ({ codigoDgs: o.id, nombreComun: o.nombre })), { codigoDgs: guardado.trim(), nombre: guardado })
}

/** Nombre para pintar lo guardado: el de la lista si es un código suyo; si no, tal cual. */
export function nombreCompaniaDeclarada(opciones: OpcionCompania[] | null, guardado: string): string {
  const o = opciones?.find((x) => x.id.toUpperCase() === guardado.trim().toUpperCase())
  return o ? o.nombre : guardado
}
