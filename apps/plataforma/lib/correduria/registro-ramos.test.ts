import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RAMOS_RIESGO, REGISTRO_RAMOS, definicionDeRamo } from './registro-ramos.ts'
import { RAMOS_VARIANTE, ramoVariante } from '../../app/(usuario)/correduria/oportunidad/[id]/variante.ts'
import { RAMOS_COTIZADOR_EMBEBIDO, ramoCotizadorEmbebido } from '../../app/(usuario)/correduria/oportunidad/[id]/cotizador-embebido.ts'
import { claveDatosDeRamo, diferenciasVariante, rolesDelRamo } from '@central/module-seguros'

test('el registro cubre los 10 ramos y lee roles y clave de module-seguros (sin copia)', () => {
  assert.equal(RAMOS_RIESGO.length, 10)
  for (const r of RAMOS_RIESGO) {
    assert.deepEqual(REGISTRO_RAMOS[r].roles, rolesDelRamo(r), r)
    assert.equal(REGISTRO_RAMOS[r].claveObjeto, claveDatosDeRamo(r), r)
  }
})

test('cotizador del registro == lo que hace hoy la pantalla (ramoVariante / ramoCotizadorEmbebido)', () => {
  for (const r of RAMOS_RIESGO) {
    const emb = ramoCotizadorEmbebido(r) !== null
    const pant = ramoVariante(r) !== null
    const t = REGISTRO_RAMOS[r].cotizador
    assert.equal(t === 'embebido', emb, `${r} embebido`)
    assert.equal(t === 'embebido' || t === 'pantalla', pant, `${r} cotizable desde el riesgo`)
  }
  for (const r of [...RAMOS_VARIANTE, ...RAMOS_COTIZADOR_EMBEBIDO]) assert.ok(definicionDeRamo(r), `${r} sin entrada`)
})

test('un ramo sin comparador pinta «no comparable»: el registro y diferenciasVariante coinciden (H1)', () => {
  const linea: Record<string, string> = { auto: 'Car', moto: 'Motorcycle', hogar: 'Home', vida: 'Life', salud: 'Health', decesos: 'Funeral', comercio: 'Business', rc: 'Liability', comunidades: 'Community', otros: 'Other' }
  for (const r of RAMOS_RIESGO) {
    const p = (x: number) => ({ insuranceLine: { id: linea[r] }, effectiveDate: '2026-10-01', risk: { capital: x } })
    const d = diferenciasVariante(p(1), p(1))
    assert.equal(d !== null, REGISTRO_RAMOS[r].comparable, r)
  }
})

test('tipo desconocido: null, no una definición inventada', () => {
  assert.equal(definicionDeRamo('barco'), null)
  assert.equal(definicionDeRamo(null), null)
})

test('hogar (fase 3): embebido, con propietario y asegurado como personas y la vivienda como objeto', () => {
  const h = REGISTRO_RAMOS.hogar
  assert.equal(h.cotizador, 'embebido')
  assert.deepEqual(h.roles, ['tomador', 'propietario', 'asegurado'])
  assert.equal(h.claveObjeto, 'datosVivienda')
  assert.equal(h.comparable, true)
})
