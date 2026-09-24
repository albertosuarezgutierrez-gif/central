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

test('🪤 no se compone la anulación de una póliza ajena, no vigente o con expediente ya abierto', () => {
  const comp = src.slice(src.indexOf('function componer'), src.indexOf('type SinFicha'))
  const apta = comp.indexOf('cambio && !f.polizaApta')
  const abierto = comp.indexOf('cambio && f.expedienteAbierto')
  const carta = comp.indexOf('anulacionPorCambio(')
  assert.ok(apta > 0 && abierto > 0 && carta > apta && carta > abierto, 'las dos guardas van ANTES de componer la carta')
  assert.match(src, /pol\.cliente_id = p\.cliente_id and pol\.merged_into_poliza_id is null/)
  assert.match(firmar, /uq_anulacion_abierta_por_poliza.*documento_cambiado/)
})

test('🪤 retirar un presupuesto aceptado desiste su anulación en la MISMA transacción', () => {
  const pres = readFileSync(new URL('./presupuesto.ts', import.meta.url), 'utf8')
  const retirar = pres.slice(pres.indexOf('export async function retirarPresupuesto'))
  const tx = retirar.indexOf('db.$transaction(')
  const desiste = retirar.indexOf("update anulacion set estado = 'desistida'")
  assert.ok(tx > 0 && desiste > tx && desiste < retirar.indexOf('return { estado: \'ok\' }'), 'la anulación se desiste dentro de la tx del retiro')
  assert.match(retirar, /where presupuesto_id = \$\{fila\.id\}::uuid and correduria_id = \$\{correduriaId\}::uuid and estado in \('solicitada', 'firmada'\)/)
})

test('🪤 lo firmado cita lo que el cliente tuvo delante: recuento del presupuesto y versión vigente de los textos', () => {
  assert.match(src, /count\(\*\)::int from presupuesto_opcion x where x\.presupuesto_id = p\.id\) as "nOpciones"/)
  assert.match(src, /count\(distinct lower\(trim\(x\.compania\)\)\)::int from presupuesto_opcion x where x\.presupuesto_id = p\.id\) as "nCompanias"/)
  assert.match(src, /versionTextos: VERSION_TEXTOS_LEGALES/)
  assert.match(src, /informacionMediador: `\$\{MEDIADOR\.identidad\.portal\}\/legal\/mediador`/)
})
