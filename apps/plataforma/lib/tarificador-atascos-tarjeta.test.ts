// Tarjeta de «Bots atascados» en llano (21/10/2026: Allianz Hogar parado en la población del CP; la tarjeta ofrecía
// «Tipo de documento»…). `node --test`. Un brazo por aserción.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { atascoValido, enlacePedirPrecio, esCandidatoOpcion, paradoEn, vistaAtasco, type Atasco } from './tarificador-atascos-asegura.ts'

const OP = '5b9a7c2e-1d3f-4a6b-8c9d-0e1f2a3b4c5d'
const base: Atasco = {
  id: '11111111-1111-4111-8111-111111111111', trabajoId: '229b2fc5-4a39-4fd8-8dcd-4b7ce5e9c056', oportunidadId: OP, compania: 'allianz', ramo: 'hogar',
  tipo: 'accion', descripcion: 'Opción de la lista desplegable de «poblacion»', etiqueta: null, textoEsperado: null,
  candidatos: [
    { n: 1, tag: 'label', id: 'l0', type: null, role: null, texto: 'Tipo de documento', etiqueta: 'Tipo de documento' },
    { n: 2, tag: 'mat-option', id: null, type: null, role: 'option', texto: 'SEVILLA', etiqueta: null },
  ],
  ronda: 1, maxRondas: 3, creadoEn: '2026-10-21T08:00:00Z', caducaEn: '2026-10-22T08:00:00Z', hayCaptura: true, capturaBase64: null,
  capturaMime: 'image/jpeg', clave: 'elegir_opcion_poblacion', clienteNombre: 'Ana Ruiz', opciones: ['SEVILLA', 'CAMAS'], capturaConDatos: true,
}

test('esCandidatoOpcion: una opción de lista sí; una etiqueta no', () => {
  assert.equal(esCandidatoOpcion({ tag: 'mat-option', role: null }), true)
  assert.equal(esCandidatoOpcion({ tag: 'li', role: 'option' }), true)
  assert.equal(esCandidatoOpcion({ tag: 'label', role: null }), false)
})

test('paradoEn: en llano según el atasco', () => {
  assert.equal(paradoEn(base), 'elegir la población en la lista desplegable')
  assert.equal(paradoEn({ ...base, clave: 'hueco_mapa', tipo: 'campo', descripcion: 'Pantalla o paso sin mapa: allianz/hogar: mapa incompleto: faltan la elección de población del CP' }), 'la elección de población del CP')
  assert.equal(paradoEn({ ...base, clave: 'superficie', tipo: 'campo', etiqueta: 'Superficie' }), 'el campo «Superficie»')
  assert.equal(paradoEn({ ...base, clave: 'continuar', tipo: 'accion', textoEsperado: 'Continuar' }), 'el botón «Continuar»')
})

test('vistaAtasco: un atasco de lista ofrece SOLO opciones como botones; lo visto y no pulsable, aparte', () => {
  const v = vistaAtasco(base)
  assert.equal(v.modo, 'opciones')
  assert.deepEqual(v.botones, [{ n: 2, texto: 'SEVILLA' }])
  assert.deepEqual(v.opcionesVistas, ['CAMAS'])
})

test('vistaAtasco: sin opciones capturadas (solo etiquetas) → sin_opciones, sin botones', () => {
  const v = vistaAtasco({ ...base, candidatos: [base.candidatos[0]!], opciones: null })
  assert.equal(v.modo, 'sin_opciones')
  assert.deepEqual(v.botones, [])
  assert.equal(v.opcionesVistas, null)
  assert.equal(v.opcionesLeidas, 'sin_leer', 'null = no se pudo leer, NO «no llegó a abrirse»')
})

test('vistaAtasco: «no llegó a abrirse» solo con opciones = [] (tres estados)', () => {
  const sin = { ...base, candidatos: [base.candidatos[0]!] }
  assert.equal(vistaAtasco({ ...sin, opciones: [] }).opcionesLeidas, 'vacia')
  assert.equal(vistaAtasco({ ...sin, opciones: null }).opcionesLeidas, 'sin_leer')
  assert.equal(vistaAtasco({ ...sin, opciones: ['CAMAS'] }).opcionesLeidas, 'hay')
})

test('atascoValido: capturaConDatos FAIL-CLOSED (solo un false explícito la libera)', () => {
  const crudo = { ...base, capturaBase64: undefined }
  assert.equal(atascoValido({ ...crudo, capturaConDatos: false })!.capturaConDatos, false)
  assert.equal(atascoValido({ ...crudo, capturaConDatos: undefined })!.capturaConDatos, true)
  assert.equal(atascoValido({ ...crudo, capturaConDatos: 'no' })!.capturaConDatos, true)
})

test('vistaAtasco: tres estados de la captura y de otros atascos (elementos)', () => {
  assert.equal(vistaAtasco({ ...base, hayCaptura: false }).captura, 'sin_captura')
  const v = vistaAtasco({ ...base, clave: 'superficie', tipo: 'campo' })
  assert.equal(v.modo, 'elementos')
  assert.equal(v.botones.length, 2)
})

test('atascoValido: lee mime, clave, cliente y opciones (null ≠ [])', () => {
  const crudo = { ...base, capturaBase64: undefined }
  const a = atascoValido(crudo)!
  assert.equal(a.capturaMime, 'image/jpeg')
  assert.equal(a.clienteNombre, 'Ana Ruiz')
  assert.deepEqual(atascoValido({ ...crudo, opciones: [] })!.opciones, [])
  assert.equal(atascoValido({ ...crudo, opciones: undefined, capturaMime: undefined })!.opciones, null)
  assert.equal(atascoValido({ ...crudo, capturaMime: 'text/html' })!.capturaMime, 'image/png')
})

test('enlacePedirPrecio: al bloque de la oportunidad; sin oportunidad, null', () => {
  assert.equal(enlacePedirPrecio(OP), `/correduria/oportunidad/${OP}#pedir-precio`)
  assert.equal(enlacePedirPrecio(null), null)
})

test('pantalla: los botones de opción llaman a responder(elegir n) y son ≥44 px; la imagen no se sale', () => {
  const src = readFileSync(join(import.meta.dirname, '../app/(usuario)/correduria/tarificador/BotsAtascados.tsx'), 'utf8')
  assert.match(src, /responder\(a, \{ accion: 'elegir', n: b\.n \}\)/)
  assert.match(src, /minHeight: 44/)
  assert.match(src, /maxWidth: '100%'/)
  assert.match(src, /Sin captura de este atasco/)
  assert.ok(!/bot antiguo/.test(src), 'sin captura no se culpa al bot antiguo')
  assert.match(src, /No se pudieron leer las opciones/)
  assert.match(src, /if \(!vivo\) \{ pedidas\.current\.delete\(a\.id\); break \}/, 'el bucle viejo libera lo que no pidió')
  assert.match(src, /e\.key === 'Escape'/, 'el modal de la imagen se cierra con Escape')
  assert.match(src, /minHeight: 44[^\n]*>ver oportunidad|ver oportunidad<\/Link>/, 'ver oportunidad es un enlace con alto ≥44')
  assert.match(src, /El bot se ha parado en:/)
})

test('aviso de Telegram: la foto del atasco solo sale si NO lleva datos del tomador (fail-closed)', () => {
  const ruta = readFileSync(join(import.meta.dirname, '../app/api/cron/tarificador-verificacion/route.ts'), 'utf8')
  assert.match(ruta, /if \(a\.capturaBase64 && !a\.capturaConDatos\) await tgSendPhoto/)
})
