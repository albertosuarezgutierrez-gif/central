import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gunzipSync } from 'node:zlib'
import { envolverPeticion, peticionConsulta, solicitudConsultaLotes, escaparXml } from '../src/soap.ts'
import { enviarSes } from '../src/enviar.ts'

test('la consulta NO lleva tipoComunicacion en la cabecera', () => {
  // La cabecera de `C` solo lleva codigoArrendador, aplicacion y tipoOperacion. Mandar el campo
  // (aunque sea vacío) es inventarse una petición que la guía no describe.
  const sobre = peticionConsulta({ codigoArrendador: '0000000001', aplicacion: 'central', lotes: ['x'] })
  assert.doesNotMatch(sobre, /tipoComunicacion/)
  assert.match(sobre, /<tipoOperacion>C<\/tipoOperacion>/)
})

test('el alta SÍ emite tipoComunicacion cuando se le pasa', () => {
  const sobre = envolverPeticion({
    codigoArrendador: '1', aplicacion: 'central', tipoOperacion: 'A',
    tipoComunicacion: 'PV', solicitudB64: 'AAA',
  })
  assert.match(sobre, /<tipoComunicacion>PV<\/tipoComunicacion>/)
})

test('escapa los caracteres que romperían el XML', () => {
  assert.equal(escaparXml(`Casa & Cía "<3">`), 'Casa &amp; Cía &quot;&lt;3&quot;&gt;')
  // Un nombre comercial con "&" en el campo `aplicacion` generaría un XML inválido y un 10118
  // que no se parece en nada a su causa.
  const sobre = envolverPeticion({
    codigoArrendador: '1', aplicacion: 'Pisos & Co', tipoOperacion: 'C', solicitudB64: 'AAA',
  })
  assert.match(sobre, /<aplicacion>Pisos &amp; Co<\/aplicacion>/)
})

test('la solicitud de consulta lleva un <con:lote> por lote', () => {
  const xml = solicitudConsultaLotes(['a', 'b'])
  assert.match(xml, /<con:lote>a<\/con:lote><con:lote>b<\/con:lote>/)
})

test('enviarSes manda Basic auth y no filtra la contraseña en el detalle', () => {
  let visto: { url?: string; headers?: any; body?: string } = {}
  const fake = (async (url: any, init: any) => {
    visto = { url: String(url), headers: init.headers, body: init.body }
    return new Response('<respuesta><codigo>0</codigo></respuesta>', { status: 200 })
  }) as unknown as typeof fetch

  return enviarSes({
    url: 'https://ejemplo/ws', sobre: '<x/>', fetchImpl: fake,
    credenciales: { usuario: 'USUARIO', password: 'SECRETO' },
  }).then(r => {
    assert.equal(r.ok, true)
    assert.equal(visto.headers.Authorization,
      'Basic ' + Buffer.from('USUARIO:SECRETO', 'utf8').toString('base64'))
    // La contraseña no puede acabar en un latido, un log ni un aviso de Telegram.
    assert.doesNotMatch(r.detalle, /SECRETO/)
  })
})

test('un fallo de red se clasifica como transporte, nunca como parte mal formado', () => {
  const rota = (async () => { throw new Error('ECONNRESET') }) as unknown as typeof fetch
  return enviarSes({
    url: 'https://ejemplo/ws', sobre: '<x/>', fetchImpl: rota,
    credenciales: { usuario: 'u', password: 'p' },
  }).then(r => {
    assert.equal(r.clase, 'transporte')
    assert.match(r.detalle, /no se pudo contactar/)
  })
})

test('un fallo de cadena de certificados se nombra como tal', () => {
  const rota = (async () => { throw new Error('unable to verify the first certificate') }) as unknown as typeof fetch
  return enviarSes({
    url: 'https://ejemplo/ws', sobre: '<x/>', fetchImpl: rota,
    credenciales: { usuario: 'u', password: 'p' },
  }).then(r => {
    assert.equal(r.clase, 'transporte')
    assert.match(r.detalle, /TLS.*cadena FNMT/s)
  })
})

test('la solicitud del sobre no es gzip', () => {
  // Guardián de la regresión que costó el 10111.
  const sobre = peticionConsulta({ codigoArrendador: '1', aplicacion: 'c', lotes: ['x'] })
  const b64 = sobre.match(/<solicitud>([^<]+)<\/solicitud>/)![1]
  assert.throws(() => gunzipSync(Buffer.from(b64, 'base64')))
})
