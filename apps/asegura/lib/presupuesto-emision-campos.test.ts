// Cepo de los campos derivados del GET de presupuesto para la emisión (12/10/2026). `node --test`. Sin datos personales.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { precondicionesEmision, type PresupuestoParaEmitir } from '@central/module-tarificacion'
import { camposEmisionDe } from './presupuesto-emision-campos.ts'

test('IPID y opción: true/false leídos; sin fila = null (no se sabe), nunca false', () => {
  assert.deepEqual(camposEmisionDe({ ipidHuella: 'abc', opcionElegidaId: 'o1' }), { ipidConsta: true, opcionElegidaId: 'o1' })
  assert.deepEqual(camposEmisionDe({ ipidHuella: null, opcionElegidaId: 'o1' }), { ipidConsta: false, opcionElegidaId: 'o1' })
  assert.deepEqual(camposEmisionDe({ ipidHuella: '   ', opcionElegidaId: null }), { ipidConsta: false, opcionElegidaId: null })
  assert.deepEqual(camposEmisionDe(undefined), { ipidConsta: null, opcionElegidaId: null })
  assert.deepEqual(camposEmisionDe(null), { ipidConsta: null, opcionElegidaId: null })
})

test('nunca expone el hash del IPID', () => {
  const r = camposEmisionDe({ ipidHuella: 'HASH-SECRETO', opcionElegidaId: 'o1' })
  assert.ok(!JSON.stringify(r).includes('HASH-SECRETO'))
  assert.deepEqual(Object.keys(r).sort(), ['ipidConsta', 'opcionElegidaId'])
})

test('no diverge de la regla de emisión: ipidConsta=false <=> la precondición rechaza por IPID', () => {
  const ahora = new Date('2026-10-12T10:00:00Z')
  for (const ipidHuella of ['h', '', '  ', null]) {
    const p: PresupuestoParaEmitir = { origen: 'ofertas', aceptadoAt: new Date('2026-10-11'), firmaId: 'f', opcionElegidaId: 'o1', ipidHuella, venceEl: new Date('2026-11-01'), retiradoAt: null, emitidoAt: null }
    const r = precondicionesEmision(p, { id: 'o1', compania: 'allianz', primaEur: '347.55' }, 'comunidades', ahora)
    const rechazaPorIpid = !r.ok && /IPID/.test(r.motivo)
    assert.equal(camposEmisionDe(p).ipidConsta === false, rechazaPorIpid, `huella ${JSON.stringify(ipidHuella)}`)
  }
})

test('la ruta GET añade los campos con el helper (no a mano)', () => {
  const src = readFileSync(new URL('../app/api/operador/presupuesto/route.ts', import.meta.url), 'utf8')
  assert.match(src, /leerCamposEmision\(correduria\.id/)
  assert.match(src, /camposEmisionDe\(null\)/)
})
