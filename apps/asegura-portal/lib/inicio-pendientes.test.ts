import { test } from 'node:test'
import assert from 'node:assert/strict'

import { hayPendiente, pendienteInicio, type PolizaPendiente } from './inicio-pendientes.ts'

const HOY = '2026-10-26'
const pol = (x: Partial<PolizaPendiente>): PolizaPendiente => ({
  id: 'p1', etiqueta: 'Hogar · Mapfre', propia: true, enVigor: true, vence: null, devueltos: 0, proximoRecibo: null, siniestrosAbiertos: 0, ...x,
})

test('vencimientos: solo en vigor, con fecha, de hoy a 60 días, del más cercano al más lejano', () => {
  const r = pendienteInicio({
    hoy: HOY,
    polizas: [
      pol({ id: 'a', vence: '2026-12-20' }), // 55 días
      pol({ id: 'b', vence: '2026-10-27' }), // mañana
      pol({ id: 'c', vence: '2027-03-01' }), // fuera de ventana
      pol({ id: 'd', vence: '2026-10-01' }), // pasada: no «renovó»
      pol({ id: 'e', vence: '2026-11-01', enVigor: false }),
      pol({ id: 'f', vence: null }),
    ],
  })
  assert.deepEqual(r.vencimientos.map((v) => v.clave), ['vence:b', 'vence:a'])
  assert.equal(r.vencimientos[0].detalle, 'Vence mañana')
  assert.equal(r.vencimientos[1].detalle, 'Vence el 20/12/2026')
})

test('vencimientos: las aportadas que vencen en la ventana entran, con su rótulo y su ficha', () => {
  const r = pendienteInicio({
    hoy: HOY,
    polizas: [pol({ id: 'a', vence: '2026-12-20' })],
    declaradas: [{ id: 'x', etiqueta: 'Hogar · Otra', enVigor: true, vence: '2026-11-15' }, { id: 'y', etiqueta: 'Coche', enVigor: false, vence: '2026-11-15' }],
  })
  assert.deepEqual(r.vencimientos.map((v) => v.clave), ['vence-aportada:x', 'vence:a'])
  assert.equal(r.vencimientos[0].href, '/boveda/anadida/x')
})

test('recibos: devuelto = urgente y primero; al cobro solo si cae en 30 días; el de una póliza AJENA no es suyo', () => {
  const r = pendienteInicio({
    hoy: HOY,
    polizas: [
      pol({ id: 'a', proximoRecibo: '2026-11-10' }),
      pol({ id: 'b', devueltos: 2 }),
      pol({ id: 'c', proximoRecibo: '2027-02-01' }),
      pol({ id: 'd', propia: false, devueltos: 1, proximoRecibo: '2026-11-02' }),
    ],
  })
  assert.deepEqual(r.recibos.map((x) => x.clave), ['devuelto:b', 'cobro:a'])
  assert.equal(r.recibos[0].urgente, true)
  assert.equal(r.recibos[1].urgente, false)
})

test('siniestros abiertos: de cualquier póliza que vea', () => {
  const r = pendienteInicio({ hoy: HOY, polizas: [pol({ id: 'a', siniestrosAbiertos: 1 }), pol({ id: 'b', propia: false, siniestrosAbiertos: 3 })] })
  assert.deepEqual(r.siniestros.map((s) => s.clave), ['siniestro:a', 'siniestro:b'])
  assert.match(r.siniestros[1].titulo, /^3 siniestros abiertos/)
})

test('🚨 una fuente ilegible se DECLARA y nunca se lee como «nada pendiente»', () => {
  const todo = pendienteInicio({ hoy: HOY, polizas: null })
  assert.deepEqual(todo.sinComprobar, ['vencimientos', 'recibos', 'siniestros'])
  assert.equal(hayPendiente(todo), false)
  const parcial = pendienteInicio({ hoy: HOY, polizas: [pol({ devueltos: null, siniestrosAbiertos: null })] })
  assert.deepEqual([...parcial.sinComprobar].sort(), ['recibos', 'siniestros'])
  // Siniestros de una AJENA sin leer = «no visible en tu nivel», no un fallo nuestro.
  assert.deepEqual(pendienteInicio({ hoy: HOY, polizas: [pol({ propia: false, siniestrosAbiertos: null })] }).sinComprobar, [])
  // Las aportadas ilegibles también se declaran (vencimientos).
  assert.deepEqual(pendienteInicio({ hoy: HOY, polizas: [], declaradas: null }).sinComprobar, ['vencimientos'])
  // El recibo de una póliza ajena no se mira: no cuenta como «sin comprobar» el que no es suyo.
  assert.deepEqual(pendienteInicio({ hoy: HOY, polizas: [pol({ propia: false, devueltos: null })] }).sinComprobar, [])
})

test('sin nada pendiente y todo leído: vacío limpio (la pantalla pinta el estado amable)', () => {
  const r = pendienteInicio({ hoy: HOY, polizas: [pol({}), pol({ id: 'z', vence: '2027-09-01' })] })
  assert.equal(hayPendiente(r), false)
  assert.deepEqual(r.sinComprobar, [])
})

test('Vencimientos: una póliza con BAJA en marcha no «renueva» (misma regla que tenía la bóveda); sin saberlo, no se excluye nada', () => {
  const polizas = [pol({ id: 'a', vence: '2026-11-10' }), pol({ id: 'b', vence: '2026-11-12' })]
  const base = pendienteInicio({ hoy: HOY, polizas })
  assert.equal(base.vencimientos.length, 2)
  assert.deepEqual(pendienteInicio({ hoy: HOY, polizas, conBaja: new Set(['a']) }).vencimientos.map((v) => v.clave), ['vence:b'])
  // `null` = el puente no contestó: no se afirma nada, se enseñan las dos.
  assert.equal(pendienteInicio({ hoy: HOY, polizas, conBaja: null }).vencimientos.length, 2)
})

test('Vencimientos: «ya lo pediste» recupera la petición de precio abierta, solo en pólizas SUYAS', () => {
  const polizas = [pol({ id: 'a', vence: '2026-11-10' }), pol({ id: 'b', propia: false, vence: '2026-11-12' })]
  const peticiones = [{ polizaId: 'a', pedidoEl: '2026-10-20' }, { polizaId: 'b', pedidoEl: '2026-10-21' }]
  const r = pendienteInicio({ hoy: HOY, polizas, peticiones })
  assert.match(r.vencimientos.find((v) => v.clave === 'vence:a')!.detalle!, /Nos pediste que lo miremos el 20\/10\/2026/)
  assert.doesNotMatch(r.vencimientos.find((v) => v.clave === 'vence:b')!.detalle!, /pediste/)
  // Sin saber si pidió (null), no se dice nada.
  assert.doesNotMatch(pendienteInicio({ hoy: HOY, polizas, peticiones: null }).vencimientos[0]!.detalle!, /pediste/)
})

test('cableado: Inicio lee bajas y peticiones y las pasa a pendienteInicio; la página lee sus tres tarjetas en paralelo', async () => {
  const { readFileSync } = await import('node:fs')
  const quita = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const inicio = quita(readFileSync(new URL('./inicio.ts', import.meta.url), 'utf8'))
  assert.match(inicio, /polizasConBajaEnMarcha\(firmas, \{ conConfirmadas: true \}\)/)
  assert.match(inicio, /peticionesPrecio\(identidadId\)/)
  const pagina = quita(readFileSync(new URL('../app/(portal)/inicio/page.tsx', import.meta.url), 'utf8'))
  assert.match(pagina, /await Promise\.all\(\[\s*conPatrimonio \?[\s\S]*pendientesDeTiParaInicio[\s\S]*flotaParaInicio/)
})
