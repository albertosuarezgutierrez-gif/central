// Test puro del parte de la pasada del escaneo de facturas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detalleEscaneo, type ResultadoEscaneo } from './resumen-escaneo.ts'

const BASE: ResultadoEscaneo = { nuevas: 0, ok: true, error: null, pendientes: 0, noLeidas: 0 }

test('pasada buena y vacía: 0 de verdad', () => {
  assert.equal(detalleEscaneo(BASE), '0 factura(s) nueva(s)')
})

test('pasada fallida: manda el error, no el recuento', () => {
  const r = detalleEscaneo({ ...BASE, ok: false, error: 'IMAP: invalid credentials' })
  assert.equal(r, 'IMAP: invalid credentials')
})

test('pasada fallida sin error: lo dice, no finge un 0', () => {
  const r = detalleEscaneo({ ...BASE, ok: false, error: null })
  assert.ok(!r.includes('0 factura'))
  assert.match(r, /no se completó/)
})

test('un adjunto ilegible NO puede leerse como «no había facturas»', () => {
  const r = detalleEscaneo({ ...BASE, noLeidas: 2 })
  assert.match(r, /2 con adjunto ilegible/)
  assert.match(r, /PDF-pendiente/)
  assert.match(r, /NO es «no había facturas»/)
})

test('los correos sin mirar por tiempo salen aparte de los ilegibles', () => {
  const r = detalleEscaneo({ ...BASE, nuevas: 1, noLeidas: 2, pendientes: 5 })
  assert.match(r, /1 factura\(s\) nueva\(s\)/)
  assert.match(r, /2 con adjunto ilegible/)
  assert.match(r, /5 correo\(s\) sin mirar/)
})

test('sin incidencias no se añade ruido al parte', () => {
  const r = detalleEscaneo({ ...BASE, nuevas: 3 })
  assert.equal(r, '3 factura(s) nueva(s)')
})
