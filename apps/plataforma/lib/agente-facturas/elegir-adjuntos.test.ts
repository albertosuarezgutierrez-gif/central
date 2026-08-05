import test from 'node:test'
import assert from 'node:assert/strict'
import { ordenarAdjuntosFactura } from './elegir-adjuntos.ts'

const img = (nombre: string, inline = true) => ({ nombre, mime: 'image/png', inline })
const pdf = (nombre: string) => ({ nombre, mime: 'application/pdf', inline: false })

// El caso REAL del 05/08: el aviso de DIGI, con el PDF en la última posición.
test('el correo de DIGI: el PDF gana a las 11 imágenes incrustadas', () => {
  const orden = ordenarAdjuntosFactura([
    img('VoLTE-VoWiFi.png'), img('header.png'), img('icon_calendar.png'),
    img('logo-Mi-DIGI.png'), img('google-play.png'), img('apple-store.png'),
    img('logo-digi-blanco.png'), img('instagram.png'), img('facebook.png'),
    img('twitter.png'), img('youtube.png'),
    pdf('DGFCJ2600617472.pdf'),
  ])
  assert.equal(orden[0].nombre, 'DGFCJ2600617472.pdf')
})

test('un adjunto real gana a una imagen incrustada aunque sea imagen', () => {
  const orden = ordenarAdjuntosFactura([
    img('header.png'),
    { nombre: 'ticket.jpg', mime: 'image/jpeg', inline: false },
  ])
  assert.equal(orden[0].nombre, 'ticket.jpg')
})

test('entre dos PDF reales, el que se llama factura va primero', () => {
  const orden = ordenarAdjuntosFactura([pdf('condiciones-generales.pdf'), pdf('factura-julio.pdf')])
  assert.equal(orden[0].nombre, 'factura-julio.pdf')
})

test('el nombre decorativo baja aunque no sea inline', () => {
  const orden = ordenarAdjuntosFactura([
    { nombre: 'logo.png', mime: 'image/png', inline: false },
    { nombre: 'escaneo.png', mime: 'image/png', inline: false },
  ])
  assert.equal(orden[0].nombre, 'escaneo.png')
})

// Conservador: si SOLO hay imágenes incrustadas no se descarta ninguna — puede ser
// la foto de un ticket pegada en el cuerpo. Se ordenan, no se tiran.
test('no descarta nada: devuelve tantos como recibe', () => {
  const entrada = [img('logo.png'), img('foto.png')]
  assert.equal(ordenarAdjuntosFactura(entrada).length, 2)
})

test('estable: a igualdad de puntuación manda el orden del correo', () => {
  const orden = ordenarAdjuntosFactura([pdf('a.pdf'), pdf('b.pdf')])
  assert.deepEqual(orden.map((o) => o.nombre), ['a.pdf', 'b.pdf'])
})

test('lista vacía no rompe', () => {
  assert.deepEqual(ordenarAdjuntosFactura([]), [])
})
