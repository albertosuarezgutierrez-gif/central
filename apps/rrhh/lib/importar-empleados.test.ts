import { describe, it, expect } from 'vitest'
import {
  parsearCsv, tablaDesdeMatriz, prepararImportacion, celdaATexto, serieExcelAIso, campoDeCabecera, plantillaCsv, esZip,
  LIMITE_FILAS, COLUMNAS, leerCsvSubido, porcentajeDeHoja, MENSAJE_SOLO_CSV,
} from './importar-empleados'
import { existentesVacios, registrarClaves } from './alta-empleado'

const ctx = { hoy: '2026-11-07', tablas: null, convenio: null }
const CAB = 'Apellidos *;Nombre *;DNI/NIE *;Email *;Nº afiliación SS;Tipo contrato;Fecha alta;Grupo cotización;Jornada %;Salario base €/mes;IBAN'

describe('parsearCsv', () => {
  it('«;» de Excel español, BOM, CRLF, comillas con «;» y «""» dentro, ceros a la izquierda intactos', () => {
    const m = parsearCsv('﻿a;b;c\r\n"López; ""Pepe""";081234567890;x\r\n')
    expect(m).toEqual([['a', 'b', 'c'], ['López; "Pepe"', '081234567890', 'x']])
  })
  it('detecta «,» y salto de línea dentro de comillas', () => {
    expect(parsearCsv('a,b\n"1\n2",3')).toEqual([['a', 'b'], ['1\n2', '3']])
  })
})

describe('celdas de Excel', () => {
  it('serie de fecha → ISO (con el 29/02/1900 falso absorbido)', () => {
    expect(serieExcelAIso(45658)).toBe('2025-01-01')
    expect(serieExcelAIso(61)).toBe('1900-03-01')
    expect(celdaATexto(32874, true)).toBe('1990-01-01')
  })
  it('números largos sin notación científica; texto recortado', () => {
    expect(celdaATexto(281234567840, false)).toBe('281234567840')
    expect(celdaATexto(1350.5, false)).toBe('1350.5')
    expect(celdaATexto('  Ana ', false)).toBe('Ana')
    expect(celdaATexto(null, false)).toBe('')
  })
})

describe('cabeceras', () => {
  it('reconoce la plantilla, alias y variantes sin tildes ni «*»', () => {
    expect(campoDeCabecera('DNI/NIE *')).toBe('dni')
    expect(campoDeCabecera('NIF')).toBe('dni')
    expect(campoDeCabecera('nº afiliacion ss')).toBe('nss')
    expect(campoDeCabecera('Correo electrónico')).toBe('email')
    expect(campoDeCabecera('Salario base €/mes')).toBe('salario_base')
    expect(campoDeCabecera('Color favorito')).toBeNull()
  })
  it('la plantilla CSV se reconoce entera', () => {
    const t = tablaDesdeMatriz(parsearCsv(plantillaCsv()))
    expect(t.faltan).toEqual([]); expect(t.ignoradas).toEqual([])
    expect(parsearCsv(plantillaCsv())[0]).toHaveLength(COLUMNAS.length)
  })
  it('avisa de columnas obligatorias que faltan y no valida filas', () => {
    const t = tablaDesdeMatriz([['Nombre', 'Email'], ['Ana', 'a@x.es']])
    expect(t.faltan).toEqual(['Apellidos', 'DNI/NIE'])
    expect(prepararImportacion(t, ctx, existentesVacios()).altas).toEqual([])
  })
})

describe('prepararImportacion (vista previa)', () => {
  const csv = [
    CAB,
    'García;Ana;12345678Z;ana@x.es;281234567840;indefinido;01/11/2026;7;100;1.350,00;ES9121000418450200051332',
    'Pérez;Luis;12345678A;luis@x.es;;;;;;;',              // letra mal
    ';;;;;;;;;;',                                          // vacía: se salta
    'Ruiz;Eva;X1234567L;ANA@x.es;;;;;;;',                  // email repetido en el fichero
    'Sanz;Leo;Y0000000Z;leo@x.es;;temporal;;7;100;;',      // contrato sin fecha ni salario
    'Mora;Iris;Z9999999H;iris@x.es;;;;;;;',                // ya existe en la plantilla
  ].join('\n')
  const ya = existentesVacios()
  registrarClaves(ya, { dni: 'Z9999999H', nss: null, email: 'otra@x.es' })
  const { previa, altas } = prepararImportacion(tablaDesdeMatriz(parsearCsv(csv)), ctx, ya)

  it('una fila por línea con datos, con su nº de fila del Excel', () => {
    expect(previa.filas.map(f => f.numero)).toEqual([2, 3, 5, 6, 7])
    expect(previa.validas).toBe(1)
    expect(previa.conError).toBe(4)
  })
  it('solo las válidas pasan a confirmar', () => {
    expect(altas.map(a => a.numero)).toEqual([2])
    expect(altas[0].alta.contrato?.salarioBase).toBe(1350)
  })
  it('errores por fila: letra, duplicados y contrato incompleto', () => {
    const por = Object.fromEntries(previa.filas.map(f => [f.numero, f]))
    expect(por[3].errores.map(e => e.campo)).toEqual(['dni'])
    expect(por[5].duplicado).toMatch(/Email repetido en el fichero/)
    expect(por[6].errores.map(e => e.campo).sort()).toEqual(['fecha_alta', 'salario_base'])
    expect(por[7].duplicado).toMatch(/Ya hay un empleado con ese DNI/)
  })
  it('la vista previa no lleva DNI ni IBAN enteros', () => {
    const json = JSON.stringify(previa)
    expect(json).not.toContain('12345678Z')
    expect(json).not.toContain('ES9121000418450200051332')
    expect(previa.filas[0].dni).toBe('•••••678Z')
  })
  it('por encima del límite de filas no se valida nada', () => {
    const muchas = [CAB.split(';'), ...Array.from({ length: LIMITE_FILAS + 1 }, (_, i) => ['A', 'B', '12345678Z', `a${i}@x.es`])]
    const r = prepararImportacion(tablaDesdeMatriz(muchas), ctx, existentesVacios())
    expect(r.previa.excedeLimite).toBe(true)
    expect(r.altas).toEqual([])
  })
})

describe('esZip', () => {
  it('reconoce la firma de un .xlsx y rechaza texto', () => {
    expect(esZip(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]))).toBe(true)
    expect(esZip(new TextEncoder().encode('a;b;c'))).toBe(false)
  })
})

describe('solo CSV: un Excel subido NO se abre (CVE-2023-30533 en xlsx@0.18.5)', () => {
  it('ZIP (.xlsx/.ods) por firma, aunque se llame .csv, se rechaza con «guarda tu Excel como CSV»', () => {
    expect(() => leerCsvSubido(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]), 'empleados.csv')).toThrow(MENSAJE_SOLO_CSV)
    expect(MENSAJE_SOLO_CSV).toMatch(/guarda tu Excel como CSV/)
  })
  it('.xls antiguo (OLE2) y extensiones de hoja de cálculo, rechazados', () => {
    expect(() => leerCsvSubido(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]), 'x.bin')).toThrow(MENSAJE_SOLO_CSV)
    for (const n of ['a.xlsx', 'a.XLS', 'a.ods', 'a.xlsm']) expect(() => leerCsvSubido(new TextEncoder().encode('a;b'), n)).toThrow(MENSAJE_SOLO_CSV)
  })
  it('CSV en UTF-8 se lee; uno que no es UTF-8 (Windows-1252) se rechaza en vez de romper las tildes', () => {
    expect(leerCsvSubido(new TextEncoder().encode('Nombre;Apellidos\nAna;Núñez'), 'a.csv')).toEqual([['Nombre', 'Apellidos'], ['Ana', 'Núñez']])
    expect(() => leerCsvSubido(new Uint8Array([0x4e, 0xfa, 0xf1, 0x65, 0x7a]), 'a.csv')).toThrow(/UTF-8/)
  })
})

describe('porcentajes de la hoja (jornada, IRPF): la fracción de Excel no se adivina', () => {
  it('con «%» (lo que Excel escribe en CSV para una celda con formato %) se respeta', () => {
    expect(porcentajeDeHoja('jornada_pct', '100%')).toEqual({ texto: '100%' })
    expect(porcentajeDeHoja('jornada_pct', '50 %')).toEqual({ texto: '50 %' })
    expect(porcentajeDeHoja('irpf_pct', '15,5%')).toEqual({ texto: '15,5%' })
  })
  it('jornada ≤ 1 sin «%» (1 = 100 %, 0,5 = 50 %) → error de fila, nunca 1 %', () => {
    for (const v of ['1', '0,5', '0.75', '1,0']) expect(porcentajeDeHoja('jornada_pct', v)).toHaveProperty('error.campo', 'jornada_pct')
    expect(porcentajeDeHoja('jornada_pct', '50')).toEqual({ texto: '50' })
  })
  it('IRPF entre 0 y 1 sin «%» (0,15 = 15 %) → error; 0 y 1 (1 %) valen', () => {
    for (const v of ['0,15', '0.02', '0,5']) expect(porcentajeDeHoja('irpf_pct', v)).toHaveProperty('error.campo', 'irpf_pct')
    expect(porcentajeDeHoja('irpf_pct', '0')).toEqual({ texto: '0' })
    expect(porcentajeDeHoja('irpf_pct', '1')).toEqual({ texto: '1' })
    expect(porcentajeDeHoja('irpf_pct', '15')).toEqual({ texto: '15' })
  })
  it('en la vista previa: la fila con jornada «1» o IRPF «0,15» sale en error con UN mensaje por celda y no se da de alta', () => {
    const cab = 'Apellidos;Nombre;DNI/NIE;Email;Tipo contrato;Fecha alta;Grupo cotización;Jornada %;Salario base €/mes;IRPF %'
    const csv = [cab,
      'García;Ana;12345678Z;ana@x.es;indefinido;01/11/2026;7;1;1.350,00;15',
      'Ruiz;Eva;X1234567L;eva@x.es;indefinido;01/11/2026;7;100%;1.350,00;0,15',
      'Sanz;Leo;Y0000000Z;leo@x.es;indefinido;01/11/2026;7;100 %;1.350,00;15 %',
    ].join('\n')
    const { previa, altas } = prepararImportacion(tablaDesdeMatriz(parsearCsv(csv)), ctx, existentesVacios())
    const por = Object.fromEntries(previa.filas.map(f => [f.numero, f]))
    expect(por[2].estado).toBe('error')
    expect(por[2].errores.map(e => e.campo)).toEqual(['jornada_pct'])
    expect(por[2].errores[0].mensaje).toMatch(/ambigua/)
    expect(por[3].errores.map(e => e.campo)).toEqual(['irpf_pct'])
    expect(altas.map(a => a.numero)).toEqual([4])
    expect(altas[0].alta.contrato?.jornadaPct).toBe(100)
  })
})

describe('guardián: la ruta de importación no abre .xlsx', () => {
  it('sin import de xlsx ni lector XLSX en la ruta ni en el módulo', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    for (const f of ['app/api/admin/empleados/importar/route.ts', 'lib/importar-empleados.ts']) {
      const src = readFileSync(join(__dirname, '..', f), 'utf8')
      expect(src).not.toMatch(/from ['"]xlsx['"]|leerXlsx|importar-empleados-xlsx/)
    }
  })
})
