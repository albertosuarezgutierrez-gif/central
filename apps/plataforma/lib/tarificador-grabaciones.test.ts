import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { avisoSinPendientes, MAX_BYTES_GRABACION, prepararEnvios, MAX_BYTES_FICHERO, MAX_FICHEROS, comprobarFicheros, estadoGrabacion, mensajeError, textoConfirmarBorrado, mover, ordenInicial, tamano } from './tarificador-grabaciones.ts'

test('mensajeError: bien → null; SQL sin aplicar, red, tamaño y causa legibles', () => {
  assert.equal(mensajeError(201, { id: 'x' }, 'Crear'), null)
  assert.match(mensajeError(503, { estado: 'tabla_sin_crear', mensaje: 'falta aplicar el SQL' }, 'Leer')!, /falta aplicar/)
  assert.match(mensajeError(502, null, 'Leer')!, /red/)
  assert.match(mensajeError(413, null, 'p.html')!, /4 MB/)
  assert.match(mensajeError(400, { mensaje: 'nombre no válido' }, 'p.html')!, /nombre no válido/)
  assert.match(mensajeError(500, null, 'Analizar')!, /HTTP 500/)
})

test('comprobarFicheros: solo .html, ≤ 4 MB, ≤ 40 por grabación', () => {
  assert.deepEqual(comprobarFicheros([{ name: 'a.html', size: 10 }], 0), [])
  assert.equal(comprobarFicheros([], 0).length, 1)
  assert.match(comprobarFicheros([{ name: 'a.pdf', size: 10 }], 0)[0], /no es un .html/)
  assert.match(comprobarFicheros([{ name: 'a.html', size: MAX_BYTES_FICHERO + 1 }], 0)[0], /4 MB/)
  assert.match(comprobarFicheros([{ name: 'a.html', size: 1 }, { name: 'b.html', size: 1 }], MAX_FICHEROS - 1)[0], /Caben 1/)
})

test('orden: por nombre (el marcador lleva fecha y hora) y se puede mover', () => {
  const l = ordenInicial([{ name: 'pantalla-x-20261007-101500.html', size: 1 }, { name: 'pantalla-x-20261007-100900.html', size: 1 }])
  assert.equal(l[0].name, 'pantalla-x-20261007-100900.html')
  assert.deepEqual(mover([1, 2, 3], 2, -1), [1, 3, 2])
  assert.deepEqual(mover([1, 2, 3], 0, -1), [1, 2, 3])
})

test('tamaño y estado', () => {
  assert.equal(tamano(2048), '2 KB')
  assert.equal(estadoGrabacion({ pantallas: 0, analizadas: 0, conError: 0, mapaValidado: false }).texto, 'Sin pantallas')
  assert.equal(estadoGrabacion({ pantallas: 3, analizadas: 3, conError: 0, mapaValidado: true }).tono, 'positivo')
  assert.equal(estadoGrabacion({ pantallas: 3, analizadas: 3, conError: 0, mapaValidado: false }).texto, 'Mapa por validar')
})

test('la pantalla pone el marcador por el DOM (React 19 bloquea href="javascript:" en JSX) y el panel enlaza Grabaciones y Fichas', () => {
  const dir = join(import.meta.dirname, '../app/(usuario)/correduria/tarificador')
  const ui = readFileSync(join(dir, 'grabaciones/Grabaciones.tsx'), 'utf8')
  assert.match(ui, /setAttribute\('href', bookmarklet\)/)
  assert.ok(!/href=\{bookmarklet\}/.test(ui), 'href={bookmarklet} lo bloquea React 19')
  const panel = readFileSync(join(dir, 'PanelTarificador.tsx'), 'utf8')
  assert.match(panel, /href="\/correduria\/tarificador\/grabaciones"/)
  assert.match(panel, /href="\/correduria\/tarificador\/fichas"/)
})

test('avisoSinPendientes: con pendientes null; sin ellas distingue fallidas de todo analizado', () => {
  assert.equal(avisoSinPendientes([{ estado: 'ok' }, { estado: 'pendiente' }, { estado: 'error' }]), null)
  assert.equal(avisoSinPendientes([{ estado: 'ok' }, { estado: 'error' }, { estado: 'error' }]), 'No hay pantallas nuevas. Hay 2 que fallaron: pulsa «Reintentar las que fallaron».')
  assert.equal(avisoSinPendientes([{ estado: 'ok' }]), 'Todas las pantallas ya están analizadas.')
  assert.equal(avisoSinPendientes([]), 'Todas las pantallas ya están analizadas.')
})

test('multipantalla: se admite hasta 32 MB, y lo que pasa de 4 MB se trocea por pantallas en orden', () => {
  assert.deepEqual(comprobarFicheros([{ name: 'grabacion-portal-20261007-100000.html', size: MAX_BYTES_GRABACION }], 0), [])
  assert.match(comprobarFicheros([{ name: 'grabacion-p.html', size: MAX_BYTES_GRABACION + 1 }], 0)[0], /32 MB/)
  assert.match(comprobarFicheros([{ name: 'pantalla-p.html', size: MAX_BYTES_FICHERO + 1 }], 0)[0], /4 MB/)
  const pant = (n: number, relleno = '') => `<!-- grabador:pantalla ${n}/3 · x · 10:00:00 -->\n<html><body>P${n}${relleno}</body></html>\n`
  // Cabe en una petición: se manda tal cual.
  const corto = `<!-- grabacion ASegura v3 -->\n${pant(1)}${pant(2)}`
  assert.deepEqual(prepararEnvios('grabacion-a.html', corto, 0), { envios: [{ nombre: 'grabacion-a.html', html: corto }], error: null })
  // Pasa de 4 MB: una petición por pantalla, con el nombre que les pondría asegura.
  const grande = `<!-- grabacion ASegura v3 -->\n${pant(1, '<p>x</p>'.repeat(300_000))}${pant(2, '<p>y</p>'.repeat(300_000))}${pant(3)}`
  const r = prepararEnvios('grabacion-a.html', grande, 0)
  assert.equal(r.error, null)
  assert.deepEqual(r.envios.map((e) => e.nombre), ['grabacion-a-p01.html', 'grabacion-a-p02.html', 'grabacion-a-p03.html'])
  assert.match(r.envios[1].html, /P2/)
  // No caben en la grabación / una pantalla suelta enorme.
  assert.match(prepararEnvios('grabacion-a.html', corto, 39).error!, /solo caben 1/)
  assert.match(prepararEnvios('pantalla-a.html', '<html>' + 'x'.repeat(MAX_BYTES_FICHERO + 10), 0).error!, /4 MB/)
})

test('textoConfirmarBorrado: lleva el nombre de la grabación y el aviso de que no se deshace', () => {
  const t = textoConfirmarBorrado({ compania: 'Mapfre', ramo: 'comunidades', producto: null })
  assert.match(t, /«Mapfre · comunidades»/)
  assert.match(t, /Se borrará la grabación y todas sus pantallas\. No se puede deshacer\./)
  assert.match(textoConfirmarBorrado({ compania: 'A', ramo: 'B', producto: 'Hogar Plus' }), /A · B · Hogar Plus/)
})
