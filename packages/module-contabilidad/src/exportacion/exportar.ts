// Exportación del DIARIO y del PLAN DE CUENTAS a A3 (ancho fijo), Sage y Holded (CSV). PURO: recibe asientos y cuentas ya leídos; el diseño es dato
// (`diseno.ts`). Importes en céntimos enteros → texto sin pasar por float. Un asiento que no cuadra, una cuenta ausente del plan o un texto que no cabe
// en su campo fijo son ERROR (se avisa, no se trunca en silencio), salvo la descripción/concepto de A3, que se recorta y se cuenta en `recortes`.
import { ErrorContable, validarCentimos, type Centimos } from '../partida/dinero.ts'
import type { Asiento } from '../partida/asiento.ts'
import type { Cuenta } from '../partida/plan.ts'
import { escribirCsv } from '../onboarding/csv.ts'
import {
  A3_CONSTANTES, A3_FIN_LINEA, A3_LARGO_REGISTRO, A3_LONGITUD_CUENTA_DEFECTO, A3_REGISTRO_APUNTE, A3_REGISTRO_CUENTA, AVISO_PENDIENTE_CONTRASTAR, AVISO_PREFIJO_FORMULAS,
  HOLDED_DISENO, SAGE_DISENO, type CampoFijo, type DisenoCsv, type RegistroFijo,
} from './diseno.ts'

export type FormatoExport = 'a3' | 'sage' | 'holded'
export type DatosExport = {
  asientos: readonly Asiento[]
  /** Plan de cuentas de la empresa (todas las cuentas). */
  cuentas: readonly Pick<Cuenta, 'codigo' | 'nombre'>[]
}
export type OpcionesA3 = { codigoEmpresa: string; longitudCuenta?: number }
export type ResultadoExport = {
  formato: FormatoExport
  /** Texto del fichero (para A3, a codificar en latin1 con `aLatin1`). */
  contenido: string
  extension: 'dat' | 'csv'
  codificacion: 'latin1' | 'utf-8'
  lineas: number
  recortes: number
  pendienteContrastar: true
  aviso: string
}

const iso8 = (f: string) => f.replace(/-/g, '')
export function importeTexto(c: Centimos, decimal: ',' | '.' = '.'): string {
  validarCentimos(c)
  const neg = c < 0, abs = Math.abs(c)
  return `${neg ? '-' : ''}${Math.floor(abs / 100)}${decimal}${String(abs % 100).padStart(2, '0')}`
}

/** Convierte a bytes latin1; lo que no existe en latin1 pasa a «?». */
export function aLatin1(texto: string): Uint8Array {
  const out = new Uint8Array(texto.length)
  for (let i = 0; i < texto.length; i++) { const c = texto.charCodeAt(i); out[i] = c < 256 ? c : 63 }
  return out
}

// ───────── comprobaciones comunes ─────────
function validarDatos(d: DatosExport): Map<string, string> {
  const nombres = new Map(d.cuentas.map((c) => [c.codigo, c.nombre]))
  for (const a of d.asientos) {
    let debe = 0, haber = 0
    for (const p of a.apuntes) {
      validarCentimos(p.debe); validarCentimos(p.haber)
      debe += p.debe; haber += p.haber
      if (!nombres.has(p.cuenta)) throw new ErrorContable('cuenta_fuera_del_plan', `el asiento ${a.numero ?? '?'} usa la cuenta ${p.cuenta}, que no está en el plan`)
    }
    if (debe !== haber) throw new ErrorContable('asiento_descuadrado', `el asiento ${a.numero ?? '?'} no cuadra (debe ${debe} ≠ haber ${haber}); no se exporta`)
  }
  return nombres
}
const ordenar = (xs: readonly Asiento[]) => [...xs].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.numero ?? 0) - (b.numero ?? 0)))

// ───────── A3: registros de ancho fijo conducidos por el diseño ─────────
function campo(reg: RegistroFijo, nombre: string): CampoFijo {
  const c = reg.campos.find((x) => x.nombre === nombre)
  if (!c) throw new ErrorContable('diseno_a3', `el diseño A3 no define el campo ${nombre}`)
  return c
}
/** Compone un registro de ancho fijo a partir de {campo: valor ya formateado}. Un valor más ancho que su campo es error de diseño/datos. */
export function componerRegistroFijo(reg: RegistroFijo, valores: Readonly<Record<string, string>>): string {
  const buf = new Array<string>(reg.largo).fill(' ')
  for (const c of reg.campos) {
    const v = valores[c.nombre] ?? ''
    if (v.length > c.ancho) throw new ErrorContable('campo_demasiado_ancho', `A3: «${c.nombre}» ocupa ${v.length} y el campo mide ${c.ancho}`)
    const relleno = c.tipo === 'numero' || c.tipo === 'importe' ? v.padStart(c.ancho, '0') : v.padEnd(c.ancho, ' ')
    for (let i = 0; i < c.ancho; i++) buf[c.desde - 1 + i] = relleno[i]
  }
  return buf.join('')
}
export function cuentaA3(codigo: string, longitud: number): string {
  if (codigo.length > longitud) throw new ErrorContable('cuenta_demasiado_larga', `la cuenta ${codigo} excede la longitud de subcuenta de A3 (${longitud})`)
  return codigo.padEnd(longitud, '0')
}
function opcionesA3(o: OpcionesA3): { empresa: string; longitud: number } {
  if (!/^[0-9]{1,5}$/.test(o.codigoEmpresa)) throw new ErrorContable('codigo_empresa_a3', 'el código de empresa de A3 son 1-5 cifras (es el de A3, no el NIF)')
  const longitud = o.longitudCuenta ?? A3_LONGITUD_CUENTA_DEFECTO
  if (!Number.isInteger(longitud) || longitud < 3 || longitud > A3_REGISTRO_APUNTE.campos.find((c) => c.nombre === 'cuenta')!.ancho) throw new ErrorContable('longitud_cuenta_a3', 'longitud de subcuenta no válida')
  return { empresa: o.codigoEmpresa, longitud }
}
const resumen = (formato: FormatoExport, contenido: string, lineas: number, recortes: number): ResultadoExport => ({
  formato, contenido, lineas, recortes, extension: formato === 'a3' ? 'dat' : 'csv', codificacion: formato === 'a3' ? 'latin1' : 'utf-8',
  pendienteContrastar: true, aviso: formato === 'a3' ? AVISO_PENDIENTE_CONTRASTAR : `${AVISO_PENDIENTE_CONTRASTAR} ${AVISO_PREFIJO_FORMULAS}`,
})

export function exportarDiarioA3(d: DatosExport, o: OpcionesA3): ResultadoExport {
  const { empresa, longitud } = opcionesA3(o)
  const nombres = validarDatos(d)
  const anchoDesc = campo(A3_REGISTRO_APUNTE, 'descripcionCuenta').ancho, anchoCon = campo(A3_REGISTRO_APUNTE, 'concepto').ancho
  let recortes = 0
  const corta = (t: string, n: number) => { const x = t.replace(/[\r\n]+/g, ' '); if (x.length > n) recortes++; return x.slice(0, n) }
  const lineas: string[] = []
  for (const a of ordenar(d.asientos)) {
    for (const p of a.apuntes) {
      const esDebe = p.debe > 0
      lineas.push(componerRegistroFijo(A3_REGISTRO_APUNTE, {
        tipoFormato: A3_CONSTANTES.tipoApunte, codigoEmpresa: empresa, fecha: iso8(a.fecha), cuenta: cuentaA3(p.cuenta, longitud),
        descripcionCuenta: corta(nombres.get(p.cuenta) ?? '', anchoDesc), debeHaber: esDebe ? 'D' : 'H',
        documento: String(a.numero ?? '').slice(0, 10), concepto: corta(a.concepto, anchoCon), importe: importeTexto(esDebe ? p.debe : p.haber, '.'),
      }))
    }
  }
  return resumen('a3', lineas.join(A3_FIN_LINEA) + (lineas.length ? A3_FIN_LINEA : ''), lineas.length, recortes)
}
export function exportarPlanA3(d: Pick<DatosExport, 'cuentas'>, o: OpcionesA3): ResultadoExport {
  const { empresa, longitud } = opcionesA3(o)
  const anchoDesc = campo(A3_REGISTRO_CUENTA, 'descripcion').ancho
  let recortes = 0
  const lineas = [...d.cuentas].sort((a, b) => (a.codigo < b.codigo ? -1 : 1)).map((c) => {
    if (c.nombre.length > anchoDesc) recortes++
    return componerRegistroFijo(A3_REGISTRO_CUENTA, { tipoFormato: A3_CONSTANTES.tipoCuenta, codigoEmpresa: empresa, cuenta: cuentaA3(c.codigo, longitud), descripcion: c.nombre.slice(0, anchoDesc) })
  })
  return resumen('a3', lineas.join(A3_FIN_LINEA) + (lineas.length ? A3_FIN_LINEA : ''), lineas.length, recortes)
}
export const LARGO_REGISTRO_A3 = A3_LARGO_REGISTRO

// ───────── Sage / Holded: CSV conducido por el diseño ─────────
function fechaCsv(f: string, d: DisenoCsv): string {
  const [a, m, dia] = f.split('-')
  return d.fecha === 'DD/MM/AAAA' ? `${dia}/${m}/${a}` : f
}
function diarioCsv(formato: 'sage' | 'holded', d: DatosExport, dis: DisenoCsv): ResultadoExport {
  validarDatos(d)
  const filas: string[][] = [[...dis.diario.cabecera]]
  for (const a of ordenar(d.asientos)) {
    for (const p of a.apuntes) {
      filas.push([
        String(a.numero ?? ''), fechaCsv(a.fecha, dis), p.cuenta, a.concepto.replace(/[\r\n]+/g, ' '), p.documento ?? '',
        p.debe > 0 ? importeTexto(p.debe, dis.decimal) : '', p.haber > 0 ? importeTexto(p.haber, dis.decimal) : '',
      ])
    }
  }
  // Columnas 5 y 6 (DEBE, HABER) = importes (pueden ir con signo): no se tocan. El resto es texto.
  return resumen(formato, (dis.bom ? '﻿' : '') + escribirCsv(filas, { separador: dis.separador, finDeLinea: dis.finDeLinea, numericas: [5, 6] }), filas.length - 1, 0)
}
function planCsv(formato: 'sage' | 'holded', d: Pick<DatosExport, 'cuentas'>, dis: DisenoCsv): ResultadoExport {
  const filas = [[...dis.plan.cabecera], ...[...d.cuentas].sort((a, b) => (a.codigo < b.codigo ? -1 : 1)).map((c) => [c.codigo, c.nombre])]
  return resumen(formato, (dis.bom ? '﻿' : '') + escribirCsv(filas, { separador: dis.separador, finDeLinea: dis.finDeLinea }), filas.length - 1, 0)
}
export const exportarDiarioSage = (d: DatosExport) => diarioCsv('sage', d, SAGE_DISENO)
export const exportarPlanSage = (d: Pick<DatosExport, 'cuentas'>) => planCsv('sage', d, SAGE_DISENO)
export const exportarDiarioHolded = (d: DatosExport) => diarioCsv('holded', d, HOLDED_DISENO)
export const exportarPlanHolded = (d: Pick<DatosExport, 'cuentas'>) => planCsv('holded', d, HOLDED_DISENO)

/** Punto de entrada único (lo usa la ruta). `a3` exige `a3: { codigoEmpresa }`. */
export function exportar(formato: FormatoExport, que: 'diario' | 'plan', d: DatosExport, a3?: OpcionesA3): ResultadoExport {
  if (formato === 'a3') {
    if (!a3) throw new ErrorContable('codigo_empresa_a3', 'A3 necesita el código de empresa de A3')
    return que === 'diario' ? exportarDiarioA3(d, a3) : exportarPlanA3(d, a3)
  }
  if (formato === 'sage') return que === 'diario' ? exportarDiarioSage(d) : exportarPlanSage(d)
  return que === 'diario' ? exportarDiarioHolded(d) : exportarPlanHolded(d)
}
