import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contactoEfectivo, etiquetaRol, filasIntervinientes, type IntervinienteFicha } from './intervinientes.ts'

const base = (x: Partial<IntervinienteFicha>): IntervinienteFicha => ({
  polizaId: 'p1', rol: 'propietario', nombre: null, nombreIlegible: false,
  telefono: null, email: null, telefonoIlegible: false, emailIlegible: false,
  fichaId: null, esTomador: false, origen: 'cima', ...x,
})

test('el tomador manda: si tiene teléfono, no se mira a nadie más', () => {
  const c = contactoEfectivo({ telefono: '600', email: 'a@b' }, [base({ telefono: '700' })])
  assert.equal(c.telefono, '600')
  assert.equal(c.viaTelefono, 'tomador')
  assert.equal(c.quien, null)
})

test('Esquiansa: la empresa no tiene teléfono, su conductor habitual sí', () => {
  const c = contactoEfectivo({ telefono: null, email: null }, [
    base({ rol: 'conductor_habitual', nombre: 'Juan Manuel Lopez Benjumea', telefono: '600', email: 'jm@x', fichaId: 'f2' }),
  ])
  assert.equal(c.telefono, '600')
  assert.equal(c.viaTelefono, 'interviniente')
  assert.equal(c.quien?.nombre, 'Juan Manuel Lopez Benjumea')
  assert.equal(c.quien?.rol, 'conductor_habitual')
  assert.equal(c.quien?.fichaId, 'f2')
})

test('la persona de contacto va antes que el conductor si las dos tienen teléfono', () => {
  const c = contactoEfectivo({ telefono: null, email: null }, [
    base({ rol: 'conductor_habitual', nombre: 'C', telefono: '1' }),
    base({ rol: 'contacto', nombre: 'K', telefono: '2' }),
  ])
  assert.equal(c.quien?.nombre, 'K')
})

test('un interviniente que ES el tomador no aporta contacto nuevo', () => {
  const c = contactoEfectivo({ telefono: null, email: null }, [base({ telefono: '600', esTomador: true })])
  assert.equal(c.telefono, null)
})

test('🚨 intervinientes sin mirar ≠ sin intervinientes', () => {
  const sinMirar = contactoEfectivo({ telefono: null, email: null }, null)
  assert.equal(sinMirar.intervinientesSinMirar, true)
  const ninguno = contactoEfectivo({ telefono: null, email: null }, [])
  assert.equal(ninguno.intervinientesSinMirar, false)
  assert.equal(ninguno.telefono, null)
})

test('el email puede venir de otra persona que el teléfono', () => {
  const c = contactoEfectivo({ telefono: '600', email: null }, [base({ rol: 'contacto', nombre: 'K', email: 'k@x' })])
  assert.equal(c.viaTelefono, 'tomador')
  assert.equal(c.viaEmail, 'interviniente')
  assert.equal(c.quien?.nombre, 'K')
})

test('etiquetas de rol en castellano, sin guiones bajos', () => {
  assert.equal(etiquetaRol('conductor_habitual'), 'conductor habitual')
  assert.equal(etiquetaRol('lo_que_sea'), 'lo que sea')
})

// ── El tomador, que NO es un interviniente ───────────────────────────────────

const TITULAR = { polizaId: 'p1', fichaId: 'c1', nombre: 'GLOBAL 2 INSTALACIONES TECNICAS' }

test('6930FBP: con un solo conductor habitual, el titular SÍ sale, y el primero', () => {
  const r = filasIntervinientes(TITULAR, [base({ rol: 'conductor_habitual', nombre: 'X', fichaId: 'c9' })])
  assert.equal(r.filas.length, 2)
  assert.equal(r.filas[0].rol, 'tomador')
  assert.equal(r.filas[0].nombre, 'GLOBAL 2 INSTALACIONES TECNICAS')
  assert.equal(r.filas[0].fichaId, 'c1')
  assert.equal(r.filas[0].origen, 'poliza')
  assert.equal(r.aviso, null)
})

test('cepo 6930FBP: el titular no puede faltar en la tarjeta', () => {
  // Este es el fallo que vio Alberto: la empresa titular no aparecía por
  // ningún lado porque CIMA solo manda al conductor.
  const r = filasIntervinientes(TITULAR, [base({ rol: 'conductor_habitual' })])
  assert.ok(r.filas.some(f => f.esTomador), 'la tarjeta se ha quedado otra vez sin el tomador')
})

test('si la compañía ya manda al tomador como propietario, no se duplica', () => {
  const r = filasIntervinientes(TITULAR, [base({ rol: 'propietario', fichaId: 'c1', esTomador: true })])
  assert.equal(r.filas.length, 1)
  assert.equal(r.filas[0].rol, 'propietario')
  assert.equal(r.aviso, null)
})

test('sin intervinientes de CIMA: sale el tomador y se dice que no hay nadie más', () => {
  const r = filasIntervinientes(TITULAR, [])
  assert.equal(r.filas.length, 1)
  assert.equal(r.filas[0].rol, 'tomador')
  assert.equal(r.aviso, 'solo_tomador')
})

test('no se pudo mirar la tabla: el tomador sale igual, pero el aviso NO se colapsa', () => {
  const r = filasIntervinientes(TITULAR, null)
  assert.equal(r.filas.length, 1)
  assert.equal(r.filas[0].rol, 'tomador')
  // «no se pudo mirar» nunca se pinta como «no hay nadie más».
  assert.equal(r.aviso, 'sin_mirar')
})

test('el rol sintetizado tiene etiqueta propia', () => {
  assert.equal(etiquetaRol('tomador'), 'tomador')
})

test('GLOBAL 2: con tres conductores distintos, se dice de QUÉ póliza sale el teléfono', () => {
  // La empresa no tiene teléfono propio; cada furgoneta lleva su conductor
  // habitual, y son tres personas diferentes. El número que se pinta es el de
  // UNO, y hay que poder decir cuál.
  const c = contactoEfectivo({ telefono: null, email: null }, [
    base({ polizaId: 'pA', rol: 'conductor_habitual', nombre: 'A' }),
    base({ polizaId: 'pB', rol: 'conductor_habitual', nombre: 'B', telefono: '615', email: 'b@x' }),
    base({ polizaId: 'pC', rol: 'conductor_habitual', nombre: 'C', telefono: '699' }),
  ])
  assert.equal(c.telefono, '615')
  assert.equal(c.quien?.nombre, 'B')
  assert.equal(c.quien?.polizaId, 'pB')
})
