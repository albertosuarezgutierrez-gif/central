// Modo pilotado del tarificador RPA (03/11/2026): reglas puras de asegura (forma de comandos y peticiones, redacción, lease).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  esPngBase64,
  leasePilotaje,
  leerComandoPilotaje,
  leerPeticionCierre,
  leerPeticionEncolarPilotaje,
  leerPeticionEstado,
  redactarResultadoPilotaje,
  redactarTextoPilotaje,
  rutaCapturaPilotaje,
  TOPES_PILOTAJE,
  urlSinQuery,
} from './tarificador-pilotaje-reglas.ts'
import { modoParaWorker, modosReclamables } from './tarificador-explorador-reglas.ts'

const ID = '00000000-0000-4000-8000-0000000000aa'
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const INV = { version: 1, marcos: [{ indice: 0, url: 'https://x.test/a', nombre: null, elementos: [{ ref: 'm0e0', tag: 'button', texto: 'Siguiente' }] }], totalElementos: 1, recortado: null, textosDescartados: 0 }

test('comando: lista cerrada de acciones y claves (nada de selectores, URLs ni «forzar»)', () => {
  assert.equal(leerComandoPilotaje({ accion: 'pulsar', ref: 'm0e10' }).ok, true)
  assert.equal(leerComandoPilotaje({ accion: 'pulsar', ref: 'm0e10', efecto: 'calcular' }).ok, true)
  assert.equal(leerComandoPilotaje({ accion: 'pulsar', ref: 'm0e10', efecto: 'guardar_presupuesto' }).ok, false)
  assert.equal(leerComandoPilotaje({ accion: 'pulsar', ref: '#emitir' }).ok, false)
  assert.equal(leerComandoPilotaje({ accion: 'pulsar', ref: 'm0e10', forzar: true }).ok, false)
  assert.equal(leerComandoPilotaje({ accion: 'navegar', url: 'https://x' }).ok, false)
  assert.equal(leerComandoPilotaje({ accion: 'rellenar', ref: 'm0e1', valor: 'a', dato: 'vehiculo.matricula' }).ok, false)
  assert.equal(leerComandoPilotaje({ accion: 'rellenar', ref: 'm0e1', dato: 'credencial.usuario' }).ok, false)
  assert.equal(leerComandoPilotaje({ accion: 'rellenar', ref: 'm0e1', dato: 'vivienda.codigoPostal' }).ok, true)
  assert.equal(leerComandoPilotaje({ accion: 'seleccionar', ref: 'm0e1', valor: 'P' }).ok, true)
  assert.equal(leerComandoPilotaje({ accion: 'esperar', ms: 20_000 }).ok, false)
  assert.equal(leerComandoPilotaje({ accion: 'fin' }).ok, true)
  // 0.3.37: `inspeccionar` (diagnóstico sin pulsar) lleva SOLO un ref del inventario.
  assert.deepEqual(leerComandoPilotaje({ accion: 'inspeccionar', ref: 'm0e3' }), { ok: true, c: { accion: 'inspeccionar', ref: 'm0e3' } })
  assert.equal(leerComandoPilotaje({ accion: 'inspeccionar' }).ok, false)
  assert.equal(leerComandoPilotaje({ accion: 'inspeccionar', ref: 'm0e3', valor: 'x' }).ok, false)
  assert.equal(leerComandoPilotaje({ accion: 'inspeccionar', ref: '#a' }).ok, false)
})

test('encolar: solo `entrada` de la lista cerrada; sin cliente ni riesgo (siempre sintética); sin login asistido', () => {
  assert.equal(leerPeticionEncolarPilotaje({ entrada: 'pelayo:presupuestos:auto' }).ok, true)
  assert.equal(leerPeticionEncolarPilotaje({ entrada: 'pelayo:presupuestos:auto', oportunidadId: ID }).ok, false)
  assert.equal(leerPeticionEncolarPilotaje({ entrada: 'https://evil/' }).ok, false)
  assert.equal(leerPeticionEncolarPilotaje({ entrada: 'occident:particulares:hogar' }).ok, false)
})

test('estado: inventario saneado, n acotado, captura solo PNG y URL sin query', () => {
  const ok = leerPeticionEstado({ trabajoId: ID, n: 1, inventario: INV, capturaBase64: PNG, url: 'https://x.test/a?nif=12345678Z' })
  assert.equal(ok.ok, true)
  if (ok.ok) assert.equal(ok.p.url, 'https://x.test/a')
  assert.equal(leerPeticionEstado({ trabajoId: ID, n: 0, inventario: INV }).ok, false)
  assert.equal(leerPeticionEstado({ trabajoId: ID, n: 1, inventario: INV, capturaBase64: '/9j/4AAQ' }).ok, false, 'un JPEG no es la captura')
  assert.equal(esPngBase64(PNG), true)
  assert.equal(urlSinQuery('javascript:alert(1)'), null)
})

test('redacción de los campos de DIAGNÓSTICO nuevos: un valor sensible o con forma de dato personal no se guarda', () => {
  assert.equal(redactarTextoPilotaje('pulsado', ['Ficticia Pérez']), 'pulsado')
  assert.equal(redactarTextoPilotaje('boton: Emitir para Ficticia Pérez', ['Ficticia Pérez']), '(texto redactado)')
  assert.equal(redactarTextoPilotaje('NIF 12345678Z incorrecto', []), '(texto redactado)')
  const r = redactarResultadoPilotaje({ estado: 'rechazado', motivo: 'guard', detalle: ['ok', 'iban ES9121000418450200051332'] }, [])
  assert.deepEqual(r?.detalle, ['ok', '(texto redactado)'])
})

test('cierre: motivo de la lista; error opcional', () => {
  assert.equal(leerPeticionCierre({ trabajoId: ID, motivoFin: 'fin', nUltimo: 3, resultadoUltimo: { estado: 'hecho', motivo: 'fin' } }).ok, true)
  assert.equal(leerPeticionCierre({ trabajoId: ID, motivoFin: 'emitido' }).ok, false)
})

test('captura: ruta fija pilotaje/<sesion>/<n>.png', () => {
  assert.equal(rutaCapturaPilotaje(ID, 7), `pilotaje/${ID}/7.png`)
  assert.throws(() => rutaCapturaPilotaje('../x', 1))
})

test('lease: se renueva pero nunca pasa de 30 min + margen desde el inicio', () => {
  const inicio = new Date('2026-11-03T10:00:00Z')
  const pronto = leasePilotaje({ ahora: new Date('2026-11-03T10:05:00Z'), inicio, leaseMs: 6 * 60_000 })
  assert.equal(pronto.toISOString(), '2026-11-03T10:11:00.000Z')
  const tarde = leasePilotaje({ ahora: new Date('2026-11-03T10:29:00Z'), inicio, leaseMs: 6 * 60_000 })
  assert.equal(tarde.getTime(), inicio.getTime() + TOPES_PILOTAJE.maxMs + 3 * 60_000)
})

test('el pilotaje solo se sirve a un worker que lo declara, y solo se reclama con el interruptor del explorador', () => {
  assert.equal(modoParaWorker('pilotaje', ['tarificar', 'emision', 'exploracion', 'humo']), null)
  assert.equal(modoParaWorker('pilotaje', ['pilotaje']), 'pilotaje')
  assert.ok(!modosReclamables({}).includes('pilotaje'))
  assert.ok(modosReclamables({ TARIFICADOR_EXPLORADOR_ACTIVO: '1' }).includes('pilotaje'))
})

test('cableado: un pilotaje nunca se reintenta solo, solo termina por su cierre, y no se le descifra nada del tomador', () => {
  const t = readFileSync(new URL('./tarificador.ts', import.meta.url), 'utf8')
  assert.match(t, /if \(deHumo \|\| dePilotaje\) estado = estadoTrasFalloHumo\(\)/, 'fallo de pilotaje = error_definitivo')
  assert.match(t, /t\.modo === 'pilotaje' && r\.tipo !== 'error'\) return \{ res: \{ estado: 'conflicto'/, 'por /resultado solo un error')
  const i = t.indexOf("if (modo === 'pilotaje') {")
  const j = t.indexOf('necesitaNifTomador(f.compania')
  assert.ok(i > 0 && j > i, 'la rama del pilotaje vuelve ANTES de leer NIF/datos del tomador')
})
