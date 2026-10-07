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
  assert.match(firmar, /where a\.id = \$\{anulacionId\}::uuid and a\.correduria_id = \$\{correduriaId\}::uuid and a\.estado = 'solicitada'/)
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
  const upd = pedir.slice(pedir.indexOf('update anulacion a set firma_otp_hash'))
  assert.match(upd.slice(0, 1200), /firma_otp_envios < \$\{MAX_CODIGOS_DIA\}::int/)
  assert.match(upd.slice(0, 1200), /firma_otp_expira is null\s+or firma_otp_expira <= now\(\)/)
})

test('🪤 se firma lo que se leyó: la huella de la carta se compara antes de firmar', () => {
  const comp = firmar.indexOf("if (huella(texto) !== datos.cartaHash) return { estado: 'carta_cambiada' }")
  assert.ok(comp > 0 && comp < firmar.indexOf('new FirmaPropia().firmar('))
})

test('🪤 tras recargar, el código ya mandado se reabre solo si SIRVE: caducado o sin intentos, no', () => {
  const f = src.slice(src.indexOf('export function codigoVigente'), src.indexOf('async function firmadasDe'))
  assert.match(f, /otpIntentos >= MAX_INTENTOS\) return null/, 'un código agotado no se ofrece: diría «teclea el código» y fallaría')
  assert.match(f, /otpExpira\.getTime\(\) > ahora\.getTime\(\)/, 'un código caducado no se ofrece')
  assert.match(src, /codigoCaducaEn: codigoVigente\(p, ahora\)/)
})

test('🪤 las bajas ya firmadas: solo las de ESTA ficha y sin la carta ni la evidencia', () => {
  const f = src.slice(src.indexOf('async function firmadasDe'), src.indexOf('export async function anulacionesParaFirmar'))
  assert.match(f, /a\.cliente_id = \$\{clienteId\}::uuid/, 'sin filtro por cliente enseñaría las bajas de otros')
  assert.match(f, /a\.correduria_id = \$\{correduriaId\}::uuid/)
  assert.doesNotMatch(f, /carta_texto|firma_otp|doc_hash|evidencia/, 'la lectura del portal no saca la carta ni la firma')
  // Las fichas salen de los vínculos con permiso de operar (`fichasOperablesDe`), nunca de la petición.
  assert.match(src, /const f = await fichasOperablesDe\(correduriaId, identidadId\)/, 'el cliente sale del vínculo, nunca de la petición')
  assert.match(src, /firmadasDe\(correduriaId, id\)/, 'cada ficha vinculada, la suya')
})
