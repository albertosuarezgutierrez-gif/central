import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { entidad } from './catalogo'
import { construirCabecera } from './cabecera'
import { calcularInforme } from './motor'
import { generarCsv, generarXlsx, nombreArchivo } from './exportar'
import { generarPdf } from './exportar-pdf'
import { dineroEs, fechaEs, fechaHoraEs, numeroEs } from './formato'

const ENT = entidad('fichajes')!
const pet = { entidad: 'fichajes', columnas: ['empleado', 'fecha', 'entrada', 'horas'], filtros: { fecha: { desde: '2026-03-01', hasta: '2026-03-31' } }, agrupacion: 'empleado' }
const filas = [
  { empleado_id: 'e1', empleado_etiqueta: 'Ana', empleado: 'Ana', fecha: '2026-03-02', entrada: new Date('2026-03-02T07:00:00Z'), horas: 8 },
  { empleado_id: 'e1', empleado_etiqueta: 'Ana', empleado: 'Ana', fecha: '2026-03-03', entrada: new Date('2026-03-03T07:00:00Z'), horas: null },
  { empleado_id: 'e2', empleado_etiqueta: 'Luis', empleado: 'Luis', fecha: '2026-03-03', entrada: new Date('2026-03-03T08:00:00Z'), horas: 1234.5 },
]
const r = calcularInforme(ENT, pet, filas)
const cab = construirCabecera(ENT, pet, 'Empresa Demo SL', {}, new Date('2026-10-05T10:00:00Z'))

describe('formato español', () => {
  it('miles también con 4 cifras, coma decimal, € detrás', () => {
    expect(numeroEs(1234.5)).toBe('1.234,50')
    expect(numeroEs(1234567.891, 2)).toBe('1.234.567,89')
    expect(dineroEs(2162.49)).toBe('2.162,49€')
    expect(fechaEs('2026-03-02')).toBe('02/03/2026')
    expect(fechaHoraEs('2026-03-02T07:00:00Z')).toBe('02/03/2026 08:00')
  })
})

describe('exportación de informes', () => {
  it('xlsx: buffer no vacío, con subtotales y total numéricos con formato', () => {
    const buf = generarXlsx(r, cab)
    expect(buf.length).toBeGreaterThan(1000)
    expect(buf.subarray(0, 2).toString()).toBe('PK')
    const wb = XLSX.read(buf, { type: 'buffer', cellNF: true })
    expect(wb.SheetNames).toEqual(['Informe', 'Resumen'])
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Informe, { header: 1, raw: true })
    const total = aoa.find(f => typeof f[0] === 'string' && (f[0] as string).startsWith('TOTAL'))!
    expect(total[3]).toBe(1242.5) // suma de horas sin el fichaje en curso
    const sub = aoa.find(f => f[0] === 'Subtotal Ana')!
    expect(sub[3]).toBe(8)
    const ws = wb.Sheets.Informe
    const celdaHoras = Object.keys(ws).find(k => ws[k]?.v === 1234.5)!
    expect(ws[celdaHoras].z).toBe('#,##0.00')
    expect(aoa.some(f => typeof f[0] === 'string' && (f[0] as string).includes('sin dato no cuentan'))).toBe(true)
  })

  it('pdf: buffer no vacío y válido', async () => {
    const buf = await generarPdf(r, cab)
    expect(buf.length).toBeGreaterThan(1000)
    expect(buf.subarray(0, 4).toString()).toBe('%PDF')
  }, 30_000)

  it('csv: BOM, «;», coma decimal y celda vacía para el dato que no hay', () => {
    const csv = generarCsv(r)
    expect(csv.startsWith('﻿')).toBe(true)
    const lineas = csv.slice(1).split('\r\n')
    expect(lineas[0]).toBe('"Empleado";"Fecha";"Entrada";"Horas"')
    expect(lineas).toContain('"Luis";"03/03/2026";"03/03/2026 09:00";"1234,50"')
    expect(lineas).toContain('"Ana";"03/03/2026";"03/03/2026 08:00";""')
  })

  it('nombre de archivo saneado', () => {
    expect(nombreArchivo('fichajes', 'xlsx', new Date('2026-10-05T10:00:00Z'))).toBe('informe_fichajes_2026-10-05.xlsx')
    expect(nombreArchivo('../x"y', 'pdf', new Date('2026-10-05T10:00:00Z'))).toBe('informe_xy_2026-10-05.pdf')
  })

  it('cabecera con filtros legibles', () => {
    expect(cab.filtros).toEqual(['Fecha de entrada: del 01/03/2026 al 31/03/2026'])
    expect(cab.agrupacion).toBe('Por empleado')
    expect(cab.generado).toBe('05/10/2026 12:00')
  })
})
