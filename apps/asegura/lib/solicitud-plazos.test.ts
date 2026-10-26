// Cepo (26/10/2026): asegura corta la lectura de un documento del enlace ANTES de que el portal corte el puente, con margen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MARGEN_PUENTE_MS, PLAZO_LECTURA_DOCUMENTO_MS, PLAZO_LECTURA_POLIZA_MS, conPlazo } from './solicitud-plazos.ts'

const portal = readFileSync(new URL('../../asegura-portal/lib/solicitud-datos.ts', import.meta.url), 'utf8')
const tope = (nombre: string): number => {
  const m = new RegExp(`export const ${nombre} = ([\\d_]+)`).exec(portal)
  assert.ok(m, `el portal ya no declara ${nombre}`)
  return Number(m[1].replace(/_/g, ''))
}

test('póliza y documento: el plazo de lectura de asegura + margen cabe en el tope del puente del portal', () => {
  assert.ok(PLAZO_LECTURA_POLIZA_MS + MARGEN_PUENTE_MS <= tope('TOPE_PUENTE_POLIZA_MS'), 'póliza: el portal cortaría antes')
  assert.ok(PLAZO_LECTURA_DOCUMENTO_MS + MARGEN_PUENTE_MS <= tope('TOPE_PUENTE_DOCUMENTO_MS'), 'documento: el portal cortaría antes')
  // Y el portal usa esos topes (no un número suelto) al llamar al puente.
  assert.match(portal, /clase === 'poliza' \? TOPE_PUENTE_POLIZA_MS : TOPE_PUENTE_DOCUMENTO_MS/)
})

test('la subida usa los plazos al leer (póliza y papeles)', () => {
  const src = readFileSync(new URL('./solicitud-datos.ts', import.meta.url), 'utf8')
  assert.match(src, /conPlazo\(leerPoliza\([^)]*\), PLAZO_LECTURA_POLIZA_MS/)
  assert.match(src, /conPlazo\(leerDocSolicitud\([^)]*\), PLAZO_LECTURA_DOCUMENTO_MS/)
})

test('conPlazo: pasado el plazo da el valor de vencer; si acaba antes, el suyo', async () => {
  const lenta = new Promise<string>((r) => setTimeout(() => r('tarde'), 200))
  assert.equal(await conPlazo(lenta, 10, () => 'plazo'), 'plazo')
  assert.equal(await conPlazo(Promise.resolve('ya'), 1000, () => 'plazo'), 'ya')
  await assert.rejects(conPlazo(Promise.reject(new Error('x')), 1000, () => 'plazo'))
})
