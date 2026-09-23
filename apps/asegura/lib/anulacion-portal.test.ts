// Cepo de la firma de la anulación en el portal (pieza 2-d-2). Lee el FUENTE: lo que vigila es el
// orden de las comprobaciones y SQL crudo, donde ni tsc ni el build miran, e importar arrastraría Prisma.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./anulacion-portal.ts', import.meta.url), 'utf8')
const firmar = src.slice(src.indexOf('export async function firmarAnulacion'))

test('sin código no hay firma: la sesión del portal sola no firma una anulación', () => {
  const sinCodigo = firmar.indexOf("if (!p.otpHash || !p.otpExpira) return { estado: 'sin_codigo' }")
  assert.ok(sinCodigo > 0 && sinCodigo < firmar.indexOf('new FirmaPropia().firmar('))
  assert.ok(firmar.indexOf("metodo: 'otp_email'") > 0)
})

test('lo firmado es lo guardado y lo que se mandará: el mismo texto se hashea y se guarda', () => {
  assert.match(firmar, /bytes: new TextEncoder\(\)\.encode\(texto\)/)
  assert.match(firmar, /carta_texto = \$\{texto\}/)
})

test('solo firma el tomador, y solo desde «solicitada»; la ficha sale del vínculo, no de la petición', () => {
  assert.match(src, /a\.cliente_id = \$\{clienteId\}::uuid\s+and a\.estado = 'solicitada'/)
  assert.match(firmar, /where id = \$\{anulacionId\}::uuid and correduria_id = \$\{correduriaId\}::uuid and estado = 'solicitada'/)
  for (const firma of src.match(/export async function \w+\([^)]*\)/g) ?? []) {
    assert.doesNotMatch(firma, /clienteId/, `ninguna función pública recibe clienteId: ${firma}`)
  }
  assert.ok(firmar.indexOf('if (!nombreCoincide(datos.nombre, p.tomador))') < firmar.indexOf('new FirmaPropia().firmar('))
})

test('🪤 el intento se GASTA antes de comparar, en una sola sentencia con el tope', () => {
  const gasto = firmar.indexOf('set firma_otp_intentos = firma_otp_intentos + 1')
  assert.ok(gasto > 0, 'falta gastar el intento')
  assert.ok(gasto < firmar.indexOf('hashCodigo(datos.codigo.trim())'), 'el intento se gasta antes de comparar el código')
  assert.match(firmar, /firma_otp_intentos < \$\{MAX_INTENTOS\}::int\s+returning/)
})

test('🪤 pedir código: los frenos (60 s y tope diario) van DENTRO del update, no en un if previo', () => {
  const pedir = src.slice(src.indexOf('export async function pedirCodigoFirma'), src.indexOf('export type ResultadoFirma'))
  const upd = pedir.slice(pedir.indexOf('update anulacion set firma_otp_hash'))
  assert.match(upd.slice(0, 900), /firma_otp_envios < \$\{MAX_CODIGOS_DIA\}::int/)
  assert.match(upd.slice(0, 900), /firma_otp_expira is null\s+or firma_otp_expira <= now\(\)/)
})

test('🪤 se firma lo que se leyó: la huella de la carta se compara antes de firmar', () => {
  const comp = firmar.indexOf("if (huella(texto) !== datos.cartaHash) return { estado: 'carta_cambiada' }")
  assert.ok(comp > 0 && comp < firmar.indexOf('new FirmaPropia().firmar('))
})
