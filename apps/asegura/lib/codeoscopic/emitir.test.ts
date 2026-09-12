import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerOferta, encontrarPrecio, redactarPersona, redactarCrudoVendor } from './emitir.ts'
import type { Cotizacion } from './respuesta.ts'

// `leerOferta` es defensiva a propósito: la forma de `POST .../offers` no
// está verificada contra el fabricante (sin fixture, sin sandbox). Estos
// tests fijan lo mínimo que SÍ se sabe: tiene que devolver un `id`, y la
// firmeza se decide con la misma regla que `firmezaDe()` de `respuesta.ts`.

test('leerOferta: acepta la respuesta envuelta en mainQuote', () => {
  const o = leerOferta({ mainQuote: { id: 'OF123', premium: 319.02, estimate: false, messages: [] } })
  assert.equal(o.offerId, 'OF123')
  assert.equal(o.primaEur, 319.02)
  assert.equal(o.firmeza, 'firme')
  assert.deepEqual(o.avisos, [])
})

test('leerOferta: acepta la respuesta PELADA, sin mainQuote', () => {
  const o = leerOferta({ id: 42, premium: 100 })
  assert.equal(o.offerId, '42')
  assert.equal(o.primaEur, 100)
})

test('leerOferta: estimate=true manda sobre cualquier otra señal', () => {
  const o = leerOferta({ mainQuote: { id: 'OF1', estimate: true, messages: [] } })
  assert.equal(o.firmeza, 'estimado')
})

test('leerOferta: sin estimate pero con avisos → condicionado', () => {
  const o = leerOferta({
    mainQuote: { id: 'OF1', messages: [{ type: 'warning', text: 'riesgo condicionado' }] },
  })
  assert.equal(o.firmeza, 'condicionado')
  assert.deepEqual(o.avisos, ['riesgo condicionado'])
})

test('leerOferta: sin id reconocible, lanza con el crudo en el mensaje', () => {
  assert.throws(() => leerOferta({ foo: 'bar' }), /codeoscopic_oferta_sin_id/)
})

test('encontrarPrecio: casa por compañía y categoría, sin distinguir mayúsculas', () => {
  const cotizacion: Cotizacion = {
    projectId: '1',
    fechaEfecto: null,
    insuranceLineId: 'Car',
    fallos: [],
    precios: [
      {
        id: 'Q1',
        compania: 'Allianz',
        producto: 'Allianz Autos 2025',
        modalidad: null,
        categoria: 'Terceros Ampliado',
        franquiciaEur: null,
        primaEur: 319.02,
        entradaEur: null,
        meses: null,
        formaPago: null,
        frecuenciaPago: null,
        referenciaVendor: null,
        firmeza: 'estimado',
        avisos: [],
        requiereReRate: true,
        productId: 10,
        productOptions: null,
        expiraEn: null,
      },
    ],
  }
  const p = encontrarPrecio(cotizacion, 'allianz', 'terceros ampliado')
  assert.ok(p)
  assert.equal(p?.id, 'Q1')
  assert.equal(encontrarPrecio(cotizacion, 'Allianz', 'Todo Riesgo'), null)
})

// `redactarPersona` es lo que viaja en `crudo` de un 409 `patch_no_aplicado`:
// un diagnóstico real de producción (email no aplicado tras el PATCH) no es
// excusa para que el DNI o el móvil de un cliente salgan en claro en esa
// respuesta — el mismo criterio que `ibanEnmascarado()` con la cuenta.
test('redactarPersona: enmascara DNI y teléfono, deja el resto intacto', () => {
  const persona = {
    identificationDocument: { type: { id: 'Dni' }, id: '12345678Z' },
    name: 'Pilar',
    surname: 'Franco Ruz',
    email: 'pilar@example.com',
    phones: [{ number: '600112233', primary: true }],
    addresses: [{ postalCode: '41003', town: { id: 41091 }, roadName: 'Betis' }],
  }
  const r = redactarPersona(persona)
  assert.equal((r.identificationDocument as { id: string }).id, '*****678Z')
  assert.equal((r.phones as { number: string }[])[0].number, '…233')
  assert.equal(r.name, 'Pilar')
  assert.equal(r.email, 'pilar@example.com')
  assert.deepEqual(r.addresses, persona.addresses)
})

test('redactarPersona: sin identificación ni teléfonos, no revienta', () => {
  const r = redactarPersona({ name: 'X' })
  assert.equal(r.name, 'X')
  assert.equal(r.identificationDocument, undefined)
  assert.equal(r.phones, undefined)
})

test('redactarPersona: un elemento de `phones` que no es objeto se conserva tal cual', () => {
  const r = redactarPersona({ phones: [null, '600112233', { number: '611223344' }] })
  assert.deepEqual(r.phones, [null, '600112233', { number: '…344' }])
})

// `redactarCrudoVendor` protege la respuesta del SUBMIT (`envio.crudo`), que
// no tiene fixture ni forma confirmada — a diferencia de `redactarPersona`
// (que sabe exactamente dónde busca), aquí se enmascara por PATRÓN
// dondequiera que aparezca, para no depender de acertar la forma del vendor.
test('redactarCrudoVendor: enmascara DNI/NIE, móvil e IBAN dentro de cualquier string, en cualquier nivel', () => {
  const crudo = {
    holder: { identificationDocument: { id: '12345678Z' }, phones: [{ number: '611223344' }] },
    risk: { owner: { identificationDocument: { id: 'X1234567L' } } },
    messages: ['El titular 12345678Z ya tiene una cuenta ES9121000418450200051332 y el móvil 611223344'],
  }
  const r = redactarCrudoVendor(crudo) as Record<string, unknown>
  const holder = r.holder as Record<string, unknown>
  assert.equal((holder.identificationDocument as { id: string }).id, '*****678Z')
  assert.equal((holder.phones as { number: string }[])[0].number, '…344')
  const owner = (r.risk as Record<string, unknown>).owner as Record<string, unknown>
  assert.equal((owner.identificationDocument as { id: string }).id, '*****567L')
  const mensaje = (r.messages as string[])[0]
  assert.doesNotMatch(mensaje, /12345678Z/)
  assert.doesNotMatch(mensaje, /ES9121000418450200051332/)
  assert.doesNotMatch(mensaje, /\b611223344\b/)
})

test('redactarCrudoVendor: también con separadores (guion, punto, espacio) y prefijo +34', () => {
  const mensaje =
    'El NIF 12345678-Z ya está registrado, con cuenta ES91-2100-0418-4502-0005-1332 y móvil +34611223344'
  const r = redactarCrudoVendor(mensaje) as string
  assert.doesNotMatch(r, /12345678/)
  assert.doesNotMatch(r, /2100.?0418.?4502.?0005.?1332/)
  assert.doesNotMatch(r, /611223344/)
  assert.match(r, /…344/)
})

test('redactarCrudoVendor: enmascara IBAN de cualquier país, no solo ES', () => {
  // `ibanValido()` es deliberadamente agnóstica de país; la máscara tiene que
  // cubrir lo mismo — un cliente con cuenta alemana no puede salir en claro.
  const r = redactarCrudoVendor('cuenta DE89370400440532013000 ya en uso') as string
  assert.doesNotMatch(r, /370400440532013000/)
  assert.match(r, /DE89…3000/)
})

test('redactarCrudoVendor: IBAN en minúscula o mixto, PEGADO (como un valor de campo JSON)', () => {
  // Mayúsculas fijas solo protege la rama AGRUPADA (con separador); la
  // PEGADA sigue siendo insensible a mayúsculas — es la forma real en que
  // llegaría un valor de campo, y ahí no hay separador que confundir.
  const r1 = redactarCrudoVendor('cuenta es9121000418450200051332 ya en uso') as string
  assert.doesNotMatch(r1, /21000418450200051332/)
  assert.match(r1, /ya en uso/)
  const r2 = redactarCrudoVendor('cuenta Es9121000418450200051332Z ya en uso') as string
  assert.doesNotMatch(r2, /21000418450200051332/)
})

test('redactarCrudoVendor: IBAN agrupado de 4 en 4 con espacios (el formato humano habitual)', () => {
  const r = redactarCrudoVendor('cuenta ES91 2100 0418 4502 0005 1332 ya en uso') as string
  assert.doesNotMatch(r, /2100 0418 4502 0005 1332/)
  assert.match(r, /…1332/)
  assert.match(r, /ya en uso/)
})

// El bug real (encontrado por esta misma batería, no por la revisión): un
// separador válido ENTRE CADA CARÁCTER (no solo entre grupos de 4) deja que
// el patrón engulla frases enteras detrás de un IBAN sin separar — «ya en
// uso», o un slug con guiones, colándose como si fueran más grupos del IBAN.
test('redactarCrudoVendor: NO engulle palabras sueltas separadas por espacio/guion tras el falso arranque de un IBAN', () => {
  const r1 = redactarCrudoVendor('referencia AB99-request-timeout-en-el-servidor') as string
  assert.equal(r1, 'referencia AB99-request-timeout-en-el-servidor')
  const r2 = redactarCrudoVendor('cuenta DE89 3704 0044 0532 0130 00 ya en uso') as string
  assert.match(r2, /ya en uso/)
})

test('redactarCrudoVendor: valores no-string y null/undefined pasan intactos', () => {
  assert.equal(redactarCrudoVendor(null), null)
  assert.equal(redactarCrudoVendor(undefined), undefined)
  assert.equal(redactarCrudoVendor(42), 42)
  assert.deepEqual(redactarCrudoVendor([1, 'ok', null]), [1, 'ok', null])
})
