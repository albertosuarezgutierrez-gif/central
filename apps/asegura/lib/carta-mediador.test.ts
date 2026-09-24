// Cepo de la carta de nombramiento de mediador (PR 6). Lee el FUENTE: lo que vigila vive en SQL crudo
// y en el ORDEN de las comprobaciones, donde ni tsc ni el build miran.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./carta-mediador.ts', import.meta.url), 'utf8')
const firmar = src.slice(src.indexOf('export async function firmarCarta'), src.indexOf('// ─── Operador'))

test('🪤 solo el TOMADOR de la póliza y del presupuesto: con otra ficha no se prepara ni se firma nada', () => {
  assert.match(src, /if \(b\.presClienteId !== f\.clienteId \|\| b\.clienteId !== f\.clienteId\) return \{ estado: 'otra_ficha' \}/)
  for (const fn of ['prepararCarta', 'pedirCodigoCarta', 'firmarCarta']) {
    const cuerpo = src.slice(src.indexOf(`export async function ${fn}`))
    assert.ok(cuerpo.indexOf('await base(') > 0 && cuerpo.indexOf('await base(') < 450, `${fn} empieza por la guarda`)
  }
})

test('🪤 sin código no hay firma; el intento se gasta antes de comparar; se firma lo que se leyó', () => {
  const sinCodigo = firmar.indexOf("if (!a.otpHash || !a.otpExpira) return { estado: 'sin_codigo' }")
  const gasto = firmar.indexOf('set firma_otp_intentos = firma_otp_intentos + 1')
  const compara = firmar.indexOf('hashCodigo(datos.codigo.trim()) !== gastado.hash')
  const huella = firmar.indexOf('huella(texto) !== datos.cartaHash')
  const firma = firmar.indexOf('new FirmaPropia()')
  assert.ok(sinCodigo > 0 && gasto > sinCodigo && compara > gasto && huella > compara && firma > huella)
})

test('🪤 nada sale hacia la compañía: el único correo es el código, a la ficha del cliente', () => {
  assert.equal(src.split('sendMail(').length - 1, 1)
  assert.match(src, /to: ficha\.email,\n\s+subject: 'Tu código para firmar el nombramiento de corredor'/)
})

test('🪤 las acciones del corredor pasan por la regla pura y por compare-and-swap del estado', () => {
  const op = src.slice(src.indexOf('export async function accionCarta'))
  assert.match(op, /transicionCartaMediador\(c\.estado, accion\)/)
  assert.match(op, /and estado = \$\{c\.estado\}`/)
})

test('🪤 la compañía sale del código DGS antes que de `aseguradora` (el volcado escribe «(legacy)»)', () => {
  const b = src.slice(src.indexOf('async function base('), src.indexOf('function componer('))
  assert.match(b, /coalesce\(cda\.nombre_comun, pol\.aseguradora\) as compania/)
  assert.match(b, /left join companias_dgs cda on cda\.codigo_dgs = pol\.codigo_entidad_dgs/)
})

test('🪤 el puente aplica las guardas del botón: ni retirado, ni sin enviar, ni tras elegir cambiar de compañía', () => {
  const b = src.slice(src.indexOf('async function base('), src.indexOf('function componer('))
  assert.match(b, /if \(b\.retirado \|\| !b\.enviado\) return/)
  assert.match(b, /if \(b\.aceptado \|\| b\.emitido \|\| b\.anulacionAbierta\) \{/)
  assert.match(b, /if \(b\.cartaAceptada\) return/)
  // Y las guardas van ANTES de devolver la base: si no, no guardan nada.
  assert.ok(b.indexOf('b.anulacionAbierta) {') < b.indexOf('return { b: '))
})

test('🪤 sin DNI/NIF válido en la ficha no hay carta; un cifrado que no abre no se confunde con «no lo tienes»', () => {
  const m = src.slice(src.indexOf('function motivoSinCarta('), src.indexOf('function componer('))
  const ilegible = m.indexOf('if (b.dniIlegible) return')
  const falta = m.indexOf('if (!b.documento) return')
  assert.ok(ilegible > 0 && falta > ilegible, 'primero «no se puede leer», después «no lo tienes»')
  assert.match(src, /documento: dniIlegible \? null : documentoParaCarta\(descifrarCampo\(b\.dniCifrado\)\)/)
  assert.match(src, /cartaNombramientoMediador\(\{ tomador: b\.tomador, documento: b\.documento,/)
})

test('🪤 la carta lleva el DNI: se guarda CIFRADA y se descifra solo para enseñarla', () => {
  assert.match(firmar, /carta_texto = \$\{encryptField\(texto\)\}/)
  assert.doesNotMatch(firmar, /carta_texto = \$\{texto\}/)
  assert.match(src, /cartaTexto: campoIlegible\(f\.cartaTexto\) \? .* : descifrarCampo\(f\.cartaTexto\)/)
})

test('🪤 a quien ya firmó se le dice «ya firmada», no «sube tu DNI»: la guarda del DNI va DETRÁS de mirar la carta abierta', () => {
  const b = src.slice(src.indexOf('async function base('), src.indexOf('function componer('))
  assert.doesNotMatch(b, /return \{ estado: 'no_disponible', motivo: 'La carta tiene que llevar tu DNI/)
  for (const fn of ['prepararCarta', 'pedirCodigoCarta', 'firmarCarta']) {
    const cuerpo = src.slice(src.indexOf(`export async function ${fn}`))
    const ya = cuerpo.search(/estado !== 'pendiente'\) return \{ estado: 'ya_firmada'/)
    const dni = cuerpo.indexOf('motivoSinCarta(')
    assert.ok(ya > 0 && dni > ya, `${fn}: «ya firmada» antes que el motivo del DNI`)
  }
})
