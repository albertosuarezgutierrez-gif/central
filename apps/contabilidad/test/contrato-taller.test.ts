// Contrato taller → contabilidad: lo que genera `apps/taller/lib/factura-hechos.ts` (tras pasar por JSON, como en el outbox/HTTP)
// debe aceptarlo el puerto (`parsearEntradaHecho`) y asentarse CUADRADO. Efectivo → 570, bizum/tarjeta/propio → 572.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hechoCobro, hechoVenta } from '../../taller/lib/factura-hechos.ts'
import { parsearEntradaHecho } from '../lib/hecho-entrada.ts'
import { recibirHecho } from '../lib/servicio.ts'
import { crearAlmacen } from './_repo-memoria.ts'

const A = '00000000-0000-4000-8000-00000000000a'
const viaJson = (h: unknown) => JSON.parse(JSON.stringify(h))
const cuadra = (ap: { debe: number; haber: number }[]) => ap.reduce((s, x) => s + x.debe, 0) === ap.reduce((s, x) => s + x.haber, 0)

test('cobro del taller: el puerto lo acepta y 570 (efectivo) / 572 (bizum, tarjeta, código propio)', async () => {
  const casos: [string, boolean | undefined, string][] = [
    ['efectivo', true, '570'], ['efectivo', undefined, '570'], ['bizum', false, '572'], ['tarjeta', false, '572'], ['vale_taller', false, '572'],
  ]
  const al = crearAlmacen(); al.empresaLista(A).origenes.add('taller')
  for (const [i, [medioCodigo, esEfectivo, cuenta]] of casos.entries()) {
    const h = hechoCobro({ id: `c${i}`, fecha: '2026-11-04', importeCent: 12100, medioCodigo, numSerie: 'T-1', esEfectivo })
    assert.ok(h.ok)
    const p = parsearEntradaHecho({ empresaId: A, hecho: viaJson(h.ok ? h.hecho : null) })
    assert.ok(p.ok, `${medioCodigo}: ${p.ok ? '' : p.errores.join()}`)
    const r = await recibirHecho(al.repo(A), 'taller', p.ok ? p.valor.hecho : (null as never))
    assert.equal(r.resultado, 'asentado', medioCodigo)
    const asiento = al.datos(A).asientos.at(-1)!
    assert.equal(asiento.apuntes[0].cuenta, cuenta, medioCodigo)
    assert.ok(cuadra(asiento.apuntes), `cuadra ${medioCodigo}`)
  }
})

test('venta del taller: el puerto la acepta y el asiento cuadra (430 / 705 / 477)', async () => {
  const h = hechoVenta({
    numSerie: 'T-1', fechaExpedicion: '2026-11-04', tipo: 'F1', clienteNombre: 'Cliente',
    desglose: [{ baseCent: 10000, ivaPuntosBasicos: 2100, cuotaCent: 2100 }] as never,
  })
  assert.ok(h.ok)
  const p = parsearEntradaHecho({ empresaId: A, hecho: viaJson(h.ok ? h.hecho : null) })
  assert.ok(p.ok, p.ok ? '' : p.errores.join())
  const al = crearAlmacen(); al.empresaLista(A).origenes.add('taller')
  const r = await recibirHecho(al.repo(A), 'taller', p.ok ? p.valor.hecho : (null as never))
  assert.equal(r.resultado, 'asentado')
  const asiento = al.datos(A).asientos.at(-1)!
  assert.ok(cuadra(asiento.apuntes))
  assert.equal(asiento.apuntes.reduce((s, x) => s + x.debe, 0), 12100)
})
