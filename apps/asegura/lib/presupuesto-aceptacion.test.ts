// Cepo de la aceptación firmada del presupuesto (PR 4). Lee el FUENTE: vigila el ORDEN de las
// comprobaciones y de las escrituras, que vive en SQL crudo donde ni tsc ni el build miran.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./presupuesto-aceptacion.ts', import.meta.url), 'utf8')
const aprob = readFileSync(new URL('./aprobaciones.ts', import.meta.url), 'utf8')
const firmar = src.slice(src.indexOf('export async function firmarAceptacion'))

test('🪤 sin código no hay firma, el intento se gasta antes de comparar y lo firmado es lo enseñado', () => {
  const firma = firmar.indexOf('new FirmaPropia()') > 0 ? firmar.indexOf('new FirmaPropia()') : src.indexOf('new FirmaPropia()')
  const sinCodigo = firmar.indexOf("return { estado: 'sin_codigo' }")
  const gasto = firmar.indexOf('set firma_otp_intentos = firma_otp_intentos + 1')
  const compara = firmar.indexOf('hashCodigo(datos.codigo.trim()) !== gastado.hash')
  const huella = firmar.indexOf("c.documentoHash !== datos.documentoHash")
  const usoFirma = firmar.indexOf('await firmar(presupuestoId, c.documento)')
  assert.ok(sinCodigo > 0 && gasto > sinCodigo && compara > gasto, 'código obligatorio y gastado antes de comparar')
  assert.ok(huella > compara && usoFirma > huella, 'la huella se comprueba antes de firmar')
  assert.ok(firma > 0)
})

test('🪤 la huella cubre la carta de anulación, no solo la aceptación', () => {
  assert.match(src, /documentoHash: huella\(documento \+ '\\n\\n' \+ \(anulacion\?\.carta \?\? ''\)\)/)
})

test('🪤 el cambio de compañía se decide por código DGS y la anulación nace enlazada al presupuesto', () => {
  assert.match(src, /esCambioCompania\(f\.actualDgs, f\.opcionDgs\)/)
  assert.match(firmar, /insert into anulacion \([^)]*presupuesto_id\)/)
})

test('🪤 la anulación firmada con un presupuesto no se propone a la compañía hasta que la nueva esté emitida', () => {
  assert.match(aprob, /a\.presupuesto_id is null or exists \(select 1 from presupuesto pr where pr\.id = a\.presupuesto_id and pr\.emitido_at is not null\)/)
})
