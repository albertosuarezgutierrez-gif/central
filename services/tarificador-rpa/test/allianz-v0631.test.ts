// Allianz Turismos 0.6.31 (26/10/2026): el diagnóstico de atributos NO puede colgar el hilo con JS minificado enorme (regex cuadrática) y la
// descarga del proyecto tiene tope total (el precio sigue). Fixtures SINTÉTICOS.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Page } from 'playwright'
import { detalleRechazoOcultoDescarga, extractoSaneadoDescarga, sanearTextoDiagnosticoDescarga, type ControlDescargaProyecto } from '../src/guard.ts'
import { descargarProyectoAuto } from '../src/descarga-proyecto-auto.ts'

const enorme = (n: number) => 'a'.repeat(n / 2) + 'sms' + 'b'.repeat(n / 2)

test('0.6.31 · atributo de 200.000 caracteres sin espacios con «sms»: el extracto termina en <200 ms y es corto', () => {
  const t0 = Date.now()
  const x = extractoSaneadoDescarga(enorme(200_000), 'sms')
  const ms = Date.now() - t0
  assert.ok(ms < 200, `tardó ${ms} ms`)
  assert.match(x, /sms/)
  assert.ok(x.length <= 40 + 3 + 40 + 2 + 5, String(x.length))
})

test('0.6.31 · el saneado de un texto largo (con arrobas) no es cuadrático', () => {
  const t0 = Date.now()
  sanearTextoDiagnosticoDescarga('x@'.repeat(100_000) + 'y'.repeat(100_000))
  sanearTextoDiagnosticoDescarga('a'.repeat(300_000))
  assert.ok(Date.now() - t0 < 200, `tardó ${Date.now() - t0} ms`)
})

test('0.6.31 · detalleRechazoOcultoDescarga con un manejador de ancestro de 200.000 caracteres: <200 ms', () => {
  const c: ControlDescargaProyecto = { desc: ['Descargar propuesta', null, null, null, null, null, null, null, null, null, null, null, enorme(200_000)], visible: true, habilitado: true }
  const t0 = Date.now()
  const d = detalleRechazoOcultoDescarga(c, 'allianz', true)
  assert.ok(Date.now() - t0 < 200, `tardó ${Date.now() - t0} ms`)
  assert.match(d ?? '', /«sms» en ancestro 1 onclick/)
})

test('0.6.31 · descargarProyectoAuto con una página que nunca responde: aviso «sin PDF (tiempo agotado)» sin lanzar', async () => {
  const eventos: string[] = []
  const page = { on: (e: string) => eventos.push(`on:${e}`), off: (e: string) => eventos.push(`off:${e}`) } as unknown as Page
  const colgado = new Promise<never>(() => {})
  const ctx = {
    adjuntarPdf: () => ({ indice: 0, nombre: 'x' }),
    log: () => {},
    buscarDescargaProyectoAuto: () => colgado,
    pulsarDescargaProyectoAuto: () => colgado,
  } as unknown as Parameters<typeof descargarProyectoAuto>[1]
  const t0 = Date.now()
  const r = await descargarProyectoAuto(page, ctx, 'allianz', 'p.pdf', true, 500, 300)
  assert.equal(r.pdf, null)
  assert.match(r.aviso ?? '', /Allianz: sin PDF \(tiempo agotado\)/)
  assert.ok(Date.now() - t0 < 2_000)
  assert.deepEqual(eventos, ['on:dialog', 'off:dialog'])
})
