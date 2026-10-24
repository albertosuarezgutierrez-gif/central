// Accesos al patrimonio: fail-closed, el nivel más alto gana, y la tabla de §4.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ACCIONES_PATRIMONIO,
  nivelesPatrimonio,
  puede,
  puedeAutorizarPatrimonio,
  type AutorizacionPatrimonio,
  type EntradaNiveles,
} from './acceso.ts'

const HOY = new Date('2026-10-22T10:00:00Z')
const AYER = new Date('2026-10-21T10:00:00Z')
const MANANA = new Date('2026-10-23T10:00:00Z')

const aut = (p: Partial<AutorizacionPatrimonio> = {}): AutorizacionPatrimonio => ({
  otorganteClienteId: 'c-otro', alcance: 'patrimonio_gestion', polizaId: null,
  aceptadoEn: AYER, caducaEn: null, revocadoEn: null, ...p,
})

const entrada = (p: Partial<EntradaNiveles> = {}): EntradaNiveles => ({
  vinculadas: [], dueno: [], autorizaciones: [],
  fichasVivas: new Set(['c-yo', 'c-sl', 'c-otro']), hoy: HOY, ...p,
})

test('ficha vinculada y sociedad de la que es Dueño → total', () => {
  const m = nivelesPatrimonio(entrada({ vinculadas: ['c-yo'], dueno: ['c-sl'] }))
  assert.deepEqual([...m.entries()].sort(), [['c-sl', 'total'], ['c-yo', 'total']])
})

test('autorización aceptada y vigente: patrimonio_gestion → gestion, patrimonio_total → total', () => {
  assert.equal(nivelesPatrimonio(entrada({ autorizaciones: [aut()] })).get('c-otro'), 'gestion')
  assert.equal(nivelesPatrimonio(entrada({ autorizaciones: [aut({ alcance: 'patrimonio_total' })] })).get('c-otro'), 'total')
  assert.equal(nivelesPatrimonio(entrada({ autorizaciones: [aut({ caducaEn: MANANA })] })).get('c-otro'), 'gestion')
})

test('alcances de la bóveda, flota o desconocidos NO abren el patrimonio', () => {
  for (const alcance of ['ver', 'ver_economico', 'gestion', 'total', 'flota', 'PATRIMONIO_TOTAL', '', 'toString', '__proto__']) {
    assert.equal(nivelesPatrimonio(entrada({ autorizaciones: [aut({ alcance })] })).size, 0, alcance)
  }
})

test('revocada, sin aceptar, caducada (también justo hoy) o con póliza concreta → nada', () => {
  const casos: Partial<AutorizacionPatrimonio>[] = [
    { revocadoEn: AYER },
    { aceptadoEn: null },
    { caducaEn: AYER },
    { caducaEn: HOY },
    { polizaId: 'p1' },
    { revocadoEn: AYER, alcance: 'patrimonio_total' },
  ]
  for (const c of casos) {
    assert.equal(nivelesPatrimonio(entrada({ autorizaciones: [aut(c)] })).size, 0, JSON.stringify(c))
  }
})

test('ficha no viva (fusionada/inactiva) no abre nada, venga de vínculo, Dueño o autorización', () => {
  const m = nivelesPatrimonio(entrada({
    vinculadas: ['c-muerta'], dueno: ['c-muerta2'],
    autorizaciones: [aut({ otorganteClienteId: 'c-muerta3', alcance: 'patrimonio_total' })],
  }))
  assert.equal(m.size, 0)
})

test('se queda el nivel MÁS ALTO, en cualquier orden', () => {
  const g = aut({ alcance: 'patrimonio_gestion' })
  const t = aut({ alcance: 'patrimonio_total' })
  assert.equal(nivelesPatrimonio(entrada({ autorizaciones: [t, g] })).get('c-otro'), 'total')
  assert.equal(nivelesPatrimonio(entrada({ autorizaciones: [g, t] })).get('c-otro'), 'total')
  // Una gestión no rebaja a quien ya es el titular.
  assert.equal(nivelesPatrimonio(entrada({ vinculadas: ['c-otro'], autorizaciones: [g] })).get('c-otro'), 'total')
})

test('tabla §4: Gestión ve y gestiona gastos/documentos; solo Total da altas/bajas y PII del inquilino', () => {
  assert.equal(puede('gestion', 'ver'), true)
  assert.equal(puede('gestion', 'gestionar_gastos_documentos'), true)
  assert.equal(puede('gestion', 'alta_baja'), false)
  assert.equal(puede('gestion', 'ver_pii_inquilino'), false)
  assert.equal(puede('total', 'ver'), true)
  assert.equal(puede('total', 'gestionar_gastos_documentos'), true)
  assert.equal(puede('total', 'alta_baja'), true)
  assert.equal(puede('total', 'ver_pii_inquilino'), true)
  // Enlazar un seguro (24/10/2026): desde Gestión, como gastos y documentos.
  assert.equal(puede('gestion', 'enlazar_seguro'), true)
  assert.equal(puede('total', 'enlazar_seguro'), true)
})

test('autorizar a un tercero NUNCA lo da el nivel', () => {
  assert.equal(puede('total', 'autorizar_tercero'), false)
  assert.equal(puede('gestion', 'autorizar_tercero'), false)
})

test('nivel ausente o desconocido → nada; acción desconocida → false', () => {
  for (const a of ACCIONES_PATRIMONIO) {
    assert.equal(puede(undefined, a), false)
    assert.equal(puede(null, a), false)
    assert.equal(puede('administrar' as never, a), false)
  }
  assert.equal(puede('total', 'borrar_todo' as never), false)
})

test('autorizar: solo el titular (vinculada) o el Dueño, y con ficha viva; un autorizado Total no', () => {
  const e = entrada({ vinculadas: ['c-yo'], dueno: ['c-sl'], autorizaciones: [aut({ alcance: 'patrimonio_total' })] })
  assert.equal(puedeAutorizarPatrimonio(e, 'c-yo'), true)
  assert.equal(puedeAutorizarPatrimonio(e, 'c-sl'), true)
  assert.equal(puedeAutorizarPatrimonio(e, 'c-otro'), false)
  assert.equal(puedeAutorizarPatrimonio(entrada({ vinculadas: ['c-muerta'] }), 'c-muerta'), false)
})
