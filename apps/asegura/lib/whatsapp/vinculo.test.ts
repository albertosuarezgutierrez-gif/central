import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  VENTANA_ECHO_MS,
  casarEcho,
  hashTextoSaliente,
  normalizarTextoSaliente,
  salienteDeLaRespuesta,
  validarSalientePrevisto,
  type PrevistoCandidato,
} from './vinculo.ts'

const T0 = new Date('2026-11-04T10:00:00Z')
const mas = (ms: number) => new Date(T0.getTime() + ms)
const TEL = 'a'.repeat(64)
const OTRO_TEL = 'b'.repeat(64)
const TEXTO = 'Hola Juan, tu recibo de AUTO de 123,45€ ha sido devuelto. ¿Cuándo te viene bien pagarlo?'

function previsto(p: Partial<PrevistoCandidato> = {}): PrevistoCandidato {
  return { id: 'p1', telefonoHash: TEL, textoHash: hashTextoSaliente(TEXTO), abiertoAt: T0, casado: false, ...p }
}

test('normalización: espacios, saltos, mayúsculas, NFKC y zero-width no cambian el hash', () => {
  const variantes = [TEXTO, `  ${TEXTO}  `, TEXTO.replace(/ /g, '  '), TEXTO.toUpperCase(), TEXTO.replace('Cuándo', 'Cuándo'), TEXTO.replace(' ', '​ ')]
  for (const v of variantes) assert.equal(hashTextoSaliente(v), hashTextoSaliente(TEXTO), JSON.stringify(v))
  assert.equal(normalizarTextoSaliente('A\r\nB\n\nC'), 'a b c')
  assert.notEqual(hashTextoSaliente(TEXTO), hashTextoSaliente(TEXTO.replace('123,45', '123,46')))
})

test('normalización: vacío o no-texto → null (no hay nada que comparar)', () => {
  assert.equal(hashTextoSaliente(''), null)
  assert.equal(hashTextoSaliente('   \n '), null)
  assert.equal(hashTextoSaliente(null), null)
  assert.match(hashTextoSaliente('x') ?? '', /^[0-9a-f]{64}$/)
})

test('casado EXACTO: mismo teléfono, mismo texto, dentro de 24 h', () => {
  const r = casarEcho({ telefonoHash: TEL, fecha: mas(60_000), textoHash: hashTextoSaliente(TEXTO) }, [previsto()])
  assert.deepEqual(r, { previstoId: 'p1', tipo: 'exacto' })
})

test('casado EXACTO entre varios: gana el del texto exacto, aunque haya otros candidatos', () => {
  const r = casarEcho({ telefonoHash: TEL, fecha: mas(60_000), textoHash: hashTextoSaliente(TEXTO) }, [
    previsto({ id: 'otro', textoHash: hashTextoSaliente('otra cosa'), abiertoAt: mas(30_000) }),
    previsto({ id: 'bueno' }),
  ])
  assert.deepEqual(r, { previstoId: 'bueno', tipo: 'exacto' })
})

test('casado APROXIMADO: Alberto editó el texto y hay UN solo previsto abierto para ese teléfono', () => {
  const r = casarEcho({ telefonoHash: TEL, fecha: mas(60_000), textoHash: hashTextoSaliente(`${TEXTO} Un saludo`) }, [previsto()])
  assert.deepEqual(r, { previstoId: 'p1', tipo: 'aproximado' })
})

test('DOS candidatos sin hash exacto → NINGUNO (no se elige a ciegas)', () => {
  const r = casarEcho({ telefonoHash: TEL, fecha: mas(60_000), textoHash: hashTextoSaliente('texto editado') }, [previsto({ id: 'a' }), previsto({ id: 'b', abiertoAt: mas(1000) })])
  assert.equal(r, null)
})

test('fuera de 24 h → sin vínculo; y un echo ANTERIOR a abrir el wa.me (más allá de la holgura) tampoco casa', () => {
  assert.equal(casarEcho({ telefonoHash: TEL, fecha: mas(VENTANA_ECHO_MS + 1), textoHash: hashTextoSaliente(TEXTO) }, [previsto()]), null)
  assert.equal(casarEcho({ telefonoHash: TEL, fecha: mas(-10 * 60_000), textoHash: hashTextoSaliente(TEXTO) }, [previsto()]), null)
})

test('otro teléfono → sin vínculo (aunque el texto sea idéntico)', () => {
  assert.equal(casarEcho({ telefonoHash: OTRO_TEL, fecha: mas(60_000), textoHash: hashTextoSaliente(TEXTO) }, [previsto()]), null)
})

test('un previsto ya casado no se vuelve a casar', () => {
  assert.equal(casarEcho({ telefonoHash: TEL, fecha: mas(60_000), textoHash: hashTextoSaliente(TEXTO) }, [previsto({ casado: true })]), null)
})

test('genérico (sin texto) con un único previsto → aproximado; con dos → ninguno', () => {
  const g = previsto({ textoHash: null })
  assert.deepEqual(casarEcho({ telefonoHash: TEL, fecha: mas(1000), textoHash: hashTextoSaliente('hola') }, [g]), { previstoId: 'p1', tipo: 'aproximado' })
  assert.equal(casarEcho({ telefonoHash: TEL, fecha: mas(1000), textoHash: hashTextoSaliente('hola') }, [g, previsto({ id: 'p2', textoHash: null })]), null)
})

test('la respuesta se interpreta contra el vinculado MÁS RECIENTE anterior a ella y de ≤14 días', () => {
  const v = [
    { id: 'viejo', enviadoAt: new Date('2026-10-01T10:00:00Z') },
    { id: 'reciente', enviadoAt: new Date('2026-11-03T10:00:00Z') },
    { id: 'posterior', enviadoAt: new Date('2026-11-05T10:00:00Z') },
  ]
  assert.equal(salienteDeLaRespuesta(new Date('2026-11-04T10:00:00Z'), v)?.id, 'reciente')
  assert.equal(salienteDeLaRespuesta(new Date('2026-10-20T10:00:00Z'), [v[0]]), null, '19 días: fuera')
  assert.equal(salienteDeLaRespuesta(new Date('2026-11-04T10:00:00Z'), []), null)
})

test('entrada del endpoint: origen con ancla exige su ancla; genérico sin texto vale; ids mal formados no', () => {
  const ok = validarSalientePrevisto({ telefono: '+34 600 123 456', origen: 'recibo_devuelto', texto: TEXTO, reciboId: '11111111-1111-4111-8111-111111111111' })
  assert.equal(ok.ok, true)
  assert.equal(validarSalientePrevisto({ telefono: '600123456', origen: 'recibo_devuelto', texto: TEXTO }).ok, false)
  assert.equal(validarSalientePrevisto({ telefono: '600123456', origen: 'lead', texto: TEXTO }).ok, false)
  assert.equal(validarSalientePrevisto({ telefono: '600123456', origen: 'generico' }).ok, true)
  assert.equal(validarSalientePrevisto({ telefono: '600123456', origen: 'recaptacion' }).ok, false, 'sin texto solo el genérico')
  assert.equal(validarSalientePrevisto({ telefono: '600123456', origen: 'generico', clienteId: 'no-uuid' }).ok, false)
  assert.equal(validarSalientePrevisto({ telefono: 'abc', origen: 'generico' }).ok, false)
  assert.equal(validarSalientePrevisto({ telefono: '600123456', origen: 'inventado' }).ok, false)
})
