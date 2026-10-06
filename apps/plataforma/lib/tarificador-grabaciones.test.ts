import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MAX_BYTES_FICHERO, MAX_FICHEROS, comprobarFicheros, estadoGrabacion, mensajeError, mover, ordenInicial, tamano } from './tarificador-grabaciones.ts'

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
