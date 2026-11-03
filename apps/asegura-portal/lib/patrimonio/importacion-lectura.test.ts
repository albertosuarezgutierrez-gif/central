import { test } from 'node:test'
import assert from 'node:assert/strict'

import { MAX_BYTES_IMPORTACION, MAX_FILAS_IMPORTACION, plantillaCsv } from '@central/module-patrimonio'

import { leerFichero, leerHojaVolcado, organizarHoja, sha256 } from './importacion-lectura.ts'
import { zip } from './xlsx-lectura.test.ts'

const enc = (s: string) => new TextEncoder().encode(s)

test('csv en UTF-8 con ; y en Windows-1252; la plantilla con solo cabeceras no tiene filas', () => {
  const a = leerFichero(enc('﻿Nombre;Renta\r\nPiso;1.200,50\r\n'))
  assert.ok(a.ok)
  assert.deepEqual(a.hoja.filas, [['Piso', '1.200,50']])
  // «ñ» en latin1 (0xF1) no es UTF-8 válido.
  const l1 = new Uint8Array([...enc('Nombre;Renta\r\nPi'), 0xf1, ...enc('a;5\r\n')])
  const b = leerFichero(l1)
  assert.ok(b.ok)
  assert.equal(b.hoja.filas[0][0], 'Piña')
  assert.deepEqual(leerFichero(enc(plantillaCsv('inmueble'))), { ok: false, motivo: 'sin_filas' })
})

test('🚨 columnas con NIF / correo / teléfono / IBAN / inquilino se tiran al leer: nada de ello llega a las filas', () => {
  const r = leerFichero(enc('Inmueble;Inquilino;NIF;Email;Teléfono;IBAN;Renta\nSocorro;Ana Pérez;12345678Z;a@b.es;600111222;ES9121000418450200051332;900\n'))
  assert.ok(r.ok)
  assert.equal(r.hoja.descartadas, 5)
  assert.deepEqual(r.hoja.filas, [['Socorro', null, null, null, null, null, '900']])
  assert.ok(!JSON.stringify(r.hoja.filas).match(/12345678Z|a@b\.es|600111222|ES91|Ana/))
})

test('topes: tamaño, filas, columnas, binario y .xls se rechazan; un zip que no es un libro es ilegible', () => {
  assert.deepEqual(leerFichero(new Uint8Array(0)), { ok: false, motivo: 'vacio' })
  assert.deepEqual(leerFichero(new Uint8Array(MAX_BYTES_IMPORTACION + 1)), { ok: false, motivo: 'demasiado_grande' })
  assert.deepEqual(leerFichero(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0])), { ok: false, motivo: 'formato' })
  assert.deepEqual(leerFichero(new Uint8Array([1, 2, 0, 3, 4])), { ok: false, motivo: 'formato' })
  const muchas = ['A'].concat(Array.from({ length: MAX_FILAS_IMPORTACION + 1 }, (_, i) => String(i)))
  assert.deepEqual(leerFichero(enc(muchas.join('\n'))), { ok: false, motivo: 'demasiadas_filas' })
  const justo = ['A'].concat(Array.from({ length: MAX_FILAS_IMPORTACION }, (_, i) => String(i)))
  assert.ok(leerFichero(enc(justo.join('\n'))).ok)
  assert.deepEqual(leerFichero(enc(Array.from({ length: 61 }, (_, i) => `c${i}`).join(';') + '\n' + Array(61).fill('x').join(';'))), { ok: false, motivo: 'demasiadas_columnas' })
  assert.deepEqual(leerFichero(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9, 9, 9])), { ok: false, motivo: 'ilegible' }, 'zip sin libro')
})

test('el hash identifica el fichero (mismo contenido, mismo hash) y las filas vacías de relleno no cuentan', () => {
  const t = enc('A;B\n1;2\n;\n;\n')
  const r = leerFichero(t)
  assert.ok(r.ok)
  assert.equal(r.hash, sha256(enc('A;B\n1;2\n;\n;\n')))
  assert.equal(r.hoja.filas.length, 1)
  assert.deepEqual(organizarHoja([[null, null]]), { ok: false, motivo: 'sin_filas' })
})

const libroXlsx = (filas: string[][]) => zip([
  { nombre: 'xl/workbook.xml', texto: '<workbook><sheets><sheet name="H" sheetId="1" r:id="rId1"/></sheets></workbook>' },
  { nombre: 'xl/_rels/workbook.xml.rels', texto: '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>' },
  {
    nombre: 'xl/worksheets/sheet1.xml',
    texto: `<worksheet><sheetData>${filas.map((f, i) => `<row r="${i + 1}">${f.map((c) => `<c t="inlineStr"><is><t>${c}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`,
  },
])

test('.xlsx (27/10/2026): se lee con el lector propio y pasa por los MISMOS filtros que el CSV', () => {
  const r = leerFichero(libroXlsx([['Inmueble', 'Inquilino', 'NIF', 'Renta'], ['Socorro', 'Ana Pérez', '12345678Z', '900']]))
  assert.ok(r.ok)
  assert.deepEqual(r.hoja.filas, [['Socorro', null, null, '900']])
})

test('🚨 volcado: conserva el NOMBRE del inquilino y tira NIF, correo, teléfono e IBAN al leer', () => {
  const r = leerHojaVolcado(enc('Piso;Inquilino;DNI;Correo;Móvil;Cuenta;Renta\n1ºA;Ana Pérez;12345678Z;a@b.es;600111222;ES9121000418450200051332;900\n'))
  assert.ok(r.ok)
  assert.equal(r.hoja.descartadas, 4)
  assert.deepEqual(r.hoja.filas, [['1ºA', 'Ana Pérez', null, null, null, null, '900']])
  assert.ok(!JSON.stringify(r.hoja.filas).match(/12345678Z|a@b\.es|600111222|ES91/))
})
