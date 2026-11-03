import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RAMOS_RIESGO, REGISTRO_RAMOS, definicionDeRamo } from './registro-ramos.ts'
import { RAMOS_VARIANTE, ramoVariante } from '../../app/(usuario)/correduria/oportunidad/[id]/variante.ts'
import { RAMOS_COTIZADOR_EMBEBIDO, ramoCotizadorEmbebido } from '../../app/(usuario)/correduria/oportunidad/[id]/cotizador-embebido.ts'
import { claveDatosDeRamo, diferenciasVariante, rolesDelRamo } from '@central/module-seguros'

test('el registro cubre los 11 ramos y lee roles y clave de module-seguros (sin copia)', () => {
  assert.equal(RAMOS_RIESGO.length, 11)
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
  // Ids reales de `insuranceLine` (importar.ts): TermLife, Health, Burial. Vida lleva `risk.insured`; salud y decesos
  // `risk.insureds[]` (13/10/2026: los tres comparan por identidad del asegurado).
  const linea: Record<string, string> = { auto: 'Car', moto: 'Motorcycle', hogar: 'Home', vida: 'TermLife', salud: 'Health', decesos: 'Burial', comercio: 'Business', rc: 'Liability', comunidades: 'Community', patinete: 'Other', otros: 'Other' }
  const ana = { name: 'Ana', surname: 'Ruiz', birthDate: '1980-01-01', gender: { id: 'Female' } }
  for (const r of RAMOS_RIESGO) {
    const p = (x: number) => ({ insuranceLine: { id: linea[r] }, effectiveDate: '2026-10-01', risk: { capital: x, insured: ana, insureds: [ana] } })
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

test('13/10/2026: los SEIS ramos con Avant2 en el repo son embebidos; el registro y la parrilla dicen lo mismo', async () => {
  const { RAMOS_AVANT2 } = await import('../../app/(usuario)/correduria/oportunidad/[id]/parrilla-precios.ts')
  const { tieneAvant2 } = await import('./registro-ramos.ts')
  for (const r of RAMOS_RIESGO) {
    assert.equal(tieneAvant2(r), (RAMOS_AVANT2 as readonly string[]).includes(r), r)
    assert.equal(REGISTRO_RAMOS[r].cotizador === 'embebido', (RAMOS_AVANT2 as readonly string[]).includes(r), `${r}: con Avant2 = embebido`)
  }
  assert.deepEqual(RAMOS_RIESGO.filter((r) => REGISTRO_RAMOS[r].cotizador === 'pantalla'), [], 'ya no queda ningún ramo en pantalla aparte')
})

test('sin Avant2 (comercio, RC, comunidades, otros, tipos fuera del registro): aviso explícito, nunca cotizador inventado', async () => {
  const { avisoSinAvant2 } = await import('./registro-ramos.ts')
  for (const r of ['auto', 'moto', 'hogar', 'vida', 'salud', 'decesos']) assert.equal(avisoSinAvant2(r, { hayBots: false }), null, r)
  for (const r of ['comercio', 'rc', 'otros', 'accidentes', 'empresas', null, undefined, '']) {
    const a = avisoSinAvant2(r, { hayBots: false })
    assert.ok(a, String(r))
    assert.match(a!, /Sin precio automático por Avant2/)
    assert.match(a!, /no hay bot de compañía activo/)
  }
  assert.match(avisoSinAvant2('comunidades', { hayBots: true })!, /bots de compañía/)
  assert.equal(REGISTRO_RAMOS.comunidades.cotizador, 'bots')
  for (const r of ['comercio', 'rc', 'otros'] as const) assert.equal(REGISTRO_RAMOS[r].cotizador, 'fuera', r)
})

test('28/10/2026: el patinete (VMP) NO tarifica: fuera, sin comparador, datos en el bloque libre y aviso honesto', async () => {
  const { avisoSinAvant2, tieneAvant2 } = await import('./registro-ramos.ts')
  const p = REGISTRO_RAMOS.patinete
  assert.equal(p.cotizador, 'fuera')
  assert.equal(p.comparable, false)
  assert.equal(p.claveObjeto, 'datosRiesgoLibre')
  assert.equal(tieneAvant2('patinete'), false)
  assert.match(avisoSinAvant2('patinete', { hayBots: false })!, /Sin precio automático por Avant2/)
})
