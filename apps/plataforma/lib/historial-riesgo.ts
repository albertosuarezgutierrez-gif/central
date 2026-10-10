// El bloque «Historial» de la pantalla del riesgo (10/10/2026): seguro anterior, años asegurado, años sin
// siniestros, siniestros de los últimos 5 años y carné. Puro y sin E/S: lo que decide qué se afirma está testeado.
//
// 🚨 Tres estados en CADA fila (regla del repo):
//   · `pendiente` — `null`: no se sabe / no se ha leído. NUNCA se pinta 0, «ninguno» ni 🟢.
//   · `revisado`  — `0` siniestros o `0` años: el documento lo dice y el valor es 0 (un valor, no un hueco).
//   · `dato`      — hay un valor.
// `no_aplica` solo para el carné en un ramo que no lo usa (no se pinta la fila).
import { ETIQUETA_ROL } from '@central/module-seguros'
import type { HistorialRiesgo } from './riesgo-asegura.ts'

export type EstadoFila = 'pendiente' | 'revisado' | 'dato' | 'no_aplica'
export type ClaveFila = 'seguroAnterior' | 'aniosAsegurado' | 'aniosSinSiniestros' | 'siniestrosUltimos5' | 'carnet'
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

function filaSeguroAnterior(h: HistorialRiesgo, compania: string | null): FilaHistorial {
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

function filaSiniestros(clave: 'aniosSinSiniestros' | 'siniestrosUltimos5', etiqueta: string, v: number | null | undefined): FilaHistorial {
  if (v === null || v === undefined) return { clave, etiqueta, estado: 'pendiente', texto: 'sin dato', nota: 'el papel no lo dice', tono: 'neutro' }
  if (clave === 'aniosSinSiniestros') {
    return { clave, etiqueta, estado: v === 0 ? 'revisado' : 'dato', texto: anios(v), nota: null, tono: v === 0 ? 'aviso' : 'neutro' }
  }
  return v === 0
    ? { clave, etiqueta, estado: 'revisado', texto: 'ninguno', nota: null, tono: 'neutro' }
    : { clave, etiqueta, estado: 'dato', texto: String(v), nota: null, tono: 'aviso' }
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
 * «Años asegurado» no tiene fuente guardada: siempre `pendiente` (se declara al pedir precio), nunca un 0 ni los 10 del máximo.
 */
export function filasHistorial(h: HistorialRiesgo | null, opciones: { compania: string | null; hoy: string }): { estado: 'sin_leer' } | { estado: 'ok'; filas: FilaHistorial[] } {
  if (h === null) return { estado: 'sin_leer' }
  const sa = h.seguroAnterior
  const filas: FilaHistorial[] = [
    filaSeguroAnterior(h, opciones.compania),
    { clave: 'aniosAsegurado', etiqueta: 'Años asegurado', estado: 'pendiente', texto: 'sin dato', nota: 'se declara al pedir precio', tono: 'neutro' },
    filaSiniestros('aniosSinSiniestros', 'Años sin siniestros', sa?.aniosSinSiniestros),
    filaSiniestros('siniestrosUltimos5', 'Siniestros en los últimos 5 años', sa?.siniestrosUltimos5),
    filaCarnet(h.carnet, opciones.hoy),
  ]
  return { estado: 'ok', filas: filas.filter((f) => f.estado !== 'no_aplica') }
}
