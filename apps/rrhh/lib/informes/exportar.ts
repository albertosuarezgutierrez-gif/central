// Exportación de un informe a Excel (.xlsx, SheetJS) y CSV. SERVIDOR (sin BD: recibe el
// resultado del motor ya calculado). El PDF va en `exportar-pdf.tsx`.
//
// Excel: hoja «Informe» con cabecera (título, empresa, filtros, fecha), detalle con filas de
// grupo, subtotal y total; las celdas son NÚMEROS/FECHAS reales con formato (no texto), para que
// Pilar pueda seguir sumando en Excel. Hoja «Resumen» con todas las métricas por grupo + total.
// null = celda vacía (nunca 0).

import * as XLSX from 'xlsx'
import type { ColumnaDef, TipoColumna } from './catalogo'
import type { CabeceraInforme } from './cabecera'
import { formatearMetrica, formatearValor, numeroEs, partesMadrid } from './formato'
import type { ResultadoInforme, ResultadoMetrica, Valor } from './motor'

const FMT_DINERO = '#,##0.00 "€"'
const FMT_HORAS = '#,##0.00'
const FMT_FECHA = 'dd/mm/yyyy'
const FMT_FECHAHORA = 'dd/mm/yyyy hh:mm'

/** Serial de Excel (días desde 1899-12-30) de una fecha/hora LOCAL ya descompuesta. */
function serialExcel(y: number, m: number, d: number, h = 0, mi = 0): number {
  return Date.UTC(y, m - 1, d, h, mi) / 86400000 + 25569
}

type Celda = { v: string | number | boolean; t: 's' | 'n' | 'b'; z?: string } | null

function celda(tipo: TipoColumna, v: Valor): Celda {
  if (v === null || v === '') return null
  switch (tipo) {
    case 'dinero': return typeof v === 'number' ? { v, t: 'n', z: FMT_DINERO } : { v: String(v), t: 's' }
    case 'horas': return typeof v === 'number' ? { v, t: 'n', z: FMT_HORAS } : { v: String(v), t: 's' }
    case 'numero': return typeof v === 'number' ? { v, t: 'n', z: Number.isInteger(v) ? '#,##0' : '#,##0.00' } : { v: String(v), t: 's' }
    case 'fecha': {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v))
      return m ? { v: serialExcel(+m[1], +m[2], +m[3]), t: 'n', z: FMT_FECHA } : { v: String(v), t: 's' }
    }
    case 'fechahora': {
      const p = partesMadrid(String(v))
      return p ? { v: serialExcel(p.y, p.m, p.d, p.h, p.mi), t: 'n', z: FMT_FECHAHORA } : { v: String(v), t: 's' }
    }
    case 'booleano': return { v: v === true ? 'Sí' : v === false ? 'No' : String(v), t: 's' }
    default: return { v: String(v), t: 's' }
  }
}

function celdaMetrica(m: ResultadoMetrica): Celda {
  if (m.valor === null) return { v: '—', t: 's' }
  if (m.formato === 'recuento') return { v: m.valor, t: 'n', z: '#,##0' }
  return celda(m.formato, m.valor)
}

/** Fila de subtotal/total: suma bajo la columna cuando hay una métrica `suma` sobre ella. */
function filaTotales(columnas: ColumnaDef[], rotulo: string, metricas: ResultadoMetrica[]): Celda[] {
  return columnas.map((c, i) => {
    const m = metricas.find(x => x.tipo === 'suma' && x.campo === c.clave)
    if (m) return celdaMetrica(m)
    return i === 0 ? { v: rotulo, t: 's' } : null
  })
}

function resumenTexto(metricas: ResultadoMetrica[]): string {
  return metricas.filter(m => m.tipo !== 'recuento').map(m => `${m.etiqueta}: ${formatearMetrica(m.formato, m.valor)}`).join(' · ')
}

function hoja(filas: Celda[][], anchos: number[]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {}
  let maxC = 0
  filas.forEach((fila, r) => {
    fila.forEach((c, col) => {
      if (!c) return
      ws[XLSX.utils.encode_cell({ r, c: col })] = c.z ? { v: c.v, t: c.t, z: c.z } : { v: c.v, t: c.t }
      maxC = Math.max(maxC, col)
    })
  })
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(filas.length - 1, 0), c: Math.max(maxC, anchos.length - 1, 0) } })
  ws['!cols'] = anchos.map(w => ({ wch: w }))
  return ws
}

const S = (v: string): Celda => ({ v, t: 's' })

function lineasCabecera(cab: CabeceraInforme, r: ResultadoInforme): Celda[][] {
  const out: Celda[][] = [
    [S(cab.titulo)],
    [S(`Empresa: ${cab.empresa}`)],
    [S(cab.filtros.length ? `Filtros: ${cab.filtros.join(' · ')}` : 'Filtros: ninguno')],
  ]
  if (cab.agrupacion) out.push([S(`Agrupado: ${cab.agrupacion}`)])
  out.push([S(`Generado el ${cab.generado}`)])
  if (r.truncado) out.push([S(`⚠ Informe limitado a las primeras ${numeroEs(r.limite, 0)} filas: filtra más para verlo completo.`)])
  for (const m of r.total.metricas) {
    if (m.sinDato > 0) out.push([S(`Nota: ${numeroEs(m.sinDato, 0)} fila(s) sin dato no cuentan en «${m.etiqueta}».`)])
  }
  out.push([])
  return out
}

export function generarXlsx(r: ResultadoInforme, cab: CabeceraInforme): Buffer {
  const cols = r.columnas
  const filas: Celda[][] = lineasCabecera(cab, r)
  filas.push(cols.map(c => S(c.etiqueta)))
  const filaDato = (i: number) => cols.map(c => celda(c.tipo, r.filas[i][c.clave] ?? null))

  if (r.grupos) {
    for (const g of r.grupos) {
      filas.push([S(`${r.agrupacion?.etiqueta.replace(/^Por /, '') ?? 'Grupo'}: ${g.etiqueta} (${numeroEs(g.n, 0)})`)])
      for (let i = g.desde; i < g.hasta; i++) filas.push(filaDato(i))
      filas.push(filaTotales(cols, `Subtotal ${g.etiqueta}`, g.metricas))
      filas.push([])
    }
  } else {
    for (let i = 0; i < r.filas.length; i++) filas.push(filaDato(i))
  }
  filas.push(filaTotales(cols, `TOTAL (${numeroEs(r.total.n, 0)} filas)`, r.total.metricas))
  const resumen = resumenTexto(r.total.metricas)
  if (resumen) filas.push([S(resumen)])

  const anchos = cols.map(c => Math.min(40, Math.max(c.etiqueta.length + 2, c.tipo === 'fechahora' ? 17 : c.tipo === 'fecha' ? 11 : 12)))
  if (anchos.length) anchos[0] = Math.max(anchos[0], 28)

  // Hoja Resumen: grupo × métricas.
  const res: Celda[][] = [[S(cab.titulo)], [S(`Empresa: ${cab.empresa}`)], []]
  res.push([S(cab.agrupacion ? cab.agrupacion.replace(/^Por /, '') : ''), ...r.total.metricas.map(m => S(m.etiqueta))])
  for (const g of r.grupos ?? []) res.push([S(g.etiqueta), ...g.metricas.map(celdaMetrica)])
  res.push([S('TOTAL'), ...r.total.metricas.map(celdaMetrica)])

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, hoja(filas, anchos), 'Informe')
  XLSX.utils.book_append_sheet(wb, hoja(res, [30, ...r.total.metricas.map(m => Math.max(14, m.etiqueta.length + 2))]), 'Resumen')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer
}

/** CSV para Excel en español: `;` de separador, coma decimal, BOM UTF-8. Solo el detalle. */
export function generarCsv(r: ResultadoInforme): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
  const valorCsv = (tipo: TipoColumna, v: Valor): string => {
    if (v === null) return ''
    // En CSV sin separador de miles (Excel lo leería como texto) y sin «€»: número limpio.
    if (typeof v === 'number' && (tipo === 'dinero' || tipo === 'horas' || tipo === 'numero')) {
      return (tipo === 'numero' && Number.isInteger(v) ? String(v) : v.toFixed(2)).replace('.', ',')
    }
    return formatearValor(tipo, v)
  }
  const lineas = [r.columnas.map(c => esc(c.etiqueta)).join(';')]
  for (const f of r.filas) lineas.push(r.columnas.map(c => esc(valorCsv(c.tipo, f[c.clave] ?? null))).join(';'))
  return '﻿' + lineas.join('\r\n')
}

/** Nombre de archivo seguro: informe_fichajes_2026-10-05.xlsx */
export function nombreArchivo(entidad: string, ext: string, ahora = new Date()): string {
  return `informe_${entidad.replace(/[^a-z0-9_]/gi, '')}_${ahora.toISOString().slice(0, 10)}.${ext}`
}
