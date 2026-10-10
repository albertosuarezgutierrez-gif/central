// La lectura de una oferta, normalizada (F2, 05/10/2026). Fixtures ANÓNIMOS: los PDFs reales no se commitean.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cifraEnTexto, garantiasDeJson, normalizarOfertaLeida, numeroLeido, ofertaNormalizadaDeFila } from './oferta-leida.ts'

const TEXTO = `[[Página 1]]
COMPAÑÍA EJEMPLO SEGUROS, S.A.
Producto: Comunidad Plus
Prima neta 480,00 € Prima total 522,60 €
[[Página 2]]
Continente 200.000,00
Responsabilidad Civil General límite 300.000 €
Daños por agua incluido franquicia 150 €
Defensa jurídica: no contratada`

const BRUTO = {
  compania: 'Compañía Ejemplo Seguros',
  producto: 'Comunidad Plus',
  primaNeta: 480,
  primaTotal: '522,60',
  franquiciaGeneral: null,
  formaPago: 'Anual',
  fechaEfecto: '2026-11-01',
  validezHasta: 'no consta',
  otrasModalidades: [],
  garantias: [
    { nombre: 'Continente', estado: 'incluida', capital: 200000, limite: null, franquicia: null, pagina: 2, texto: 'Continente 200.000,00' },
    { nombre: 'Responsabilidad Civil General', estado: 'incluida', capital: null, limite: 300000, franquicia: null, pagina: 2, texto: 'Responsabilidad Civil General límite 300.000 €' },
    { nombre: 'Daños por agua', estado: 'incluida', capital: null, limite: null, franquicia: 150, pagina: 2, texto: 'Daños por agua incluido franquicia 150 €' },
    { nombre: 'Defensa jurídica', estado: 'excluida', capital: null, limite: null, franquicia: null, pagina: 2, texto: 'Defensa jurídica: no contratada' },
    // Inventada: ni la cita ni la cifra están en el PDF → se marca, no se borra.
    { nombre: 'Gastos de reparación estética', estado: null, capital: null, limite: 900, franquicia: null, pagina: 3, texto: 'Estética hasta 900 €' },
    // Sin nada que comparar: no aporta.
    { nombre: 'Asistencia 24h', estado: null, capital: 0, limite: null, franquicia: 0, pagina: null, texto: null },
    { nombre: null, estado: 'incluida' },
  ],
}

test('numeroLeido: formato español, inglés y basura', () => {
  assert.equal(numeroLeido('1.234,56 €'), 1234.56)
  assert.equal(numeroLeido('1,234.56'), 1234.56)
  assert.equal(numeroLeido(522.6), 522.6)
  assert.equal(numeroLeido('incluido'), null)
  assert.equal(numeroLeido('15%'), null)
})

test('normaliza: claves canónicas, extras con su texto literal, null ≠ 0, evidencia y cifras verificadas', () => {
  const r = normalizarOfertaLeida(BRUTO, 'comunidades', TEXTO)
  assert.ok(r.ok)
  const o = r.oferta
  assert.equal(o.primaTotal, 522.6)
  assert.equal(o.primaNeta, 480)
  assert.equal(o.extra.validezHasta, null, '«no consta» es null')
  assert.deepEqual(o.garantias.continente?.capital, 200000)
  assert.equal(o.garantias.rc_general?.limite, 300000)
  assert.equal(o.garantias.danos_agua?.franquicia, 150)
  assert.equal(o.garantias.defensa_juridica?.estado, 'excluida')
  assert.equal(o.extra.literales.rc_general, 'Responsabilidad Civil General')
  // La que no casa con la taxonomía va como extra con su nombre literal.
  assert.ok('Gastos de reparación estética' in o.garantias)
  assert.deepEqual(o.extra.evidenciaNoEncontrada, ['Gastos de reparación estética'])
  assert.deepEqual(o.extra.cifrasNoEncontradas, ['Gastos de reparación estética.limite'])
  // Capital 0 y franquicia 0 sin cita = no figura: la garantía no aporta nada y no entra.
  assert.ok(!Object.keys(o.garantias).some((k) => /asistencia/i.test(k)))
  assert.equal(o.extra.descartadasSinNombre, 1)
  assert.equal(o.garantias.continente?.evidencia?.pagina, 2)
})

test('una salida sin la forma esperada es «no se ha podido leer», nunca una oferta vacía', () => {
  assert.equal(normalizarOfertaLeida({ compania: 'X' }, 'comunidades', TEXTO).ok, false)
  assert.equal(normalizarOfertaLeida(null, 'comunidades', TEXTO).ok, false)
})

test('cifraEnTexto no confunde 200 con 1.200', () => {
  assert.equal(cifraEnTexto(200, 'Total 1.200,00 €'), false)
  assert.equal(cifraEnTexto(1200, 'Total 1.200,00 €'), true)
  assert.equal(cifraEnTexto(300000, 'límite 300.000 €'), true)
})

test('de la fila guardada a la oferta comparable: numeric como texto, garantías ilegibles fuera', () => {
  const o = ofertaNormalizadaDeFila({
    id: 'x', rol: 'oferta', compania: null, producto: 'P', primaNeta: null, primaTotal: '612.90',
    garantias: { continente: { estado: null, capital: 250000, limite: null, franquicia: null, evidencia: { pagina: 1, texto: 't' } }, roto: 'x' },
  })
  assert.equal(o.primaTotal, 612.9)
  assert.equal(o.primaNeta, null)
  assert.equal(o.compania, 'Compañía sin leer')
  assert.deepEqual(Object.keys(o.garantias), ['continente'])
  assert.deepEqual(garantiasDeJson(null), {})
})
