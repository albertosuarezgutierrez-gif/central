import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'

import { MAX_BYTES_IMPORTACION, MAX_FILAS_IMPORTACION, plantillaCsv } from '@central/module-patrimonio'

import { leerFichero, organizarHoja, sha256 } from './importacion-lectura.ts'

const enc = (s: string) => new TextEncoder().encode(s)

function xlsx(aoa: unknown[][]): Uint8Array {
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), 'Hoja1')
  return new Uint8Array(XLSX.write(libro, { type: 'array', bookType: 'xlsx' }))
}

test('xlsx: cabeceras y filas; números siguen siendo números; fechas de Excel → ISO del día de calendario', () => {
  const r = leerFichero(xlsx([['Inmueble', 'Fecha', 'Importe'], ['Socorro', new Date(Date.UTC(2026, 2, 5)), 412.3]]))
  assert.ok(r.ok)
  assert.deepEqual(r.hoja.cabeceras, ['Inmueble', 'Fecha', 'Importe'])
  assert.deepEqual(r.hoja.filas, [['Socorro', '2026-03-05', 412.3]])
})

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

test('topes: tamaño, filas, columnas, binario y .xls antiguo se rechazan sin abrir nada', () => {
  assert.deepEqual(leerFichero(new Uint8Array(0)), { ok: false, motivo: 'vacio' })
  assert.deepEqual(leerFichero(new Uint8Array(MAX_BYTES_IMPORTACION + 1)), { ok: false, motivo: 'demasiado_grande' })
  assert.deepEqual(leerFichero(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0])), { ok: false, motivo: 'formato' })
  assert.deepEqual(leerFichero(new Uint8Array([1, 2, 0, 3, 4])), { ok: false, motivo: 'formato' })
  const muchas = ['A'].concat(Array.from({ length: MAX_FILAS_IMPORTACION + 1 }, (_, i) => String(i)))
  assert.deepEqual(leerFichero(enc(muchas.join('\n'))), { ok: false, motivo: 'demasiadas_filas' })
  const justo = ['A'].concat(Array.from({ length: MAX_FILAS_IMPORTACION }, (_, i) => String(i)))
  assert.ok(leerFichero(enc(justo.join('\n'))).ok)
  assert.deepEqual(leerFichero(enc(Array.from({ length: 61 }, (_, i) => `c${i}`).join(';') + '\n' + Array(61).fill('x').join(';'))), { ok: false, motivo: 'demasiadas_columnas' })
  assert.deepEqual(leerFichero(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9, 9, 9])), { ok: false, motivo: 'ilegible' })
  const xl = leerFichero(xlsx([['A'], ...Array.from({ length: MAX_FILAS_IMPORTACION + 5 }, (_, i) => [i])]))
  assert.deepEqual(xl, { ok: false, motivo: 'demasiadas_filas' })
})

test('el hash identifica el fichero (mismo contenido, mismo hash) y las filas vacías de relleno no cuentan', () => {
  const t = enc('A;B\n1;2\n;\n;\n')
  const r = leerFichero(t)
  assert.ok(r.ok)
  assert.equal(r.hash, sha256(enc('A;B\n1;2\n;\n;\n')))
  assert.equal(r.hoja.filas.length, 1)
  assert.deepEqual(organizarHoja([[null, null]]), { ok: false, motivo: 'sin_filas' })
})
