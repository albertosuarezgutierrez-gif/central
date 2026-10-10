// Tests de asignarTitular. Runner: `node --test` (type-stripping; módulo puro).
// Fijan: NIF receptor → sociedad; propiedad → negocio → sociedad; Punto y Coma (paralizada) nunca
// recibe un gasto; y que la duda cae en null con motivo, jamás en un titular por defecto.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { asignarTitular, type ContextoTitular } from './asignar-titular.ts'

const ALBERTO = 'soc-alberto'
const PYC = 'soc-pyc'

// Espejo de la BD real (04/10/2026): Alberto persona física con los cuatro pisos; Punto y Coma sin
// negocios y paralizada.
const CTX: ContextoTitular = {
  sociedades: [
    { id: ALBERTO, nombre: 'Alberto Suárez Gutiérrez', cif: '28823484E', estado: 'activa' },
    { id: PYC, nombre: 'PUNTO Y COMA GESTION, S.L.', cif: 'B90446683', estado: 'paralizada' },
  ],
  negocios: [
    { id: 'neg-busto', sociedadId: ALBERTO, refExt: 'prop_busto_reform', app: 'sivra' },
    { id: 'neg-duplex', sociedadId: ALBERTO, refExt: 'prop_duplex_center', app: 'sivra' },
    { id: 'neg-luxury', sociedadId: ALBERTO, refExt: 'prop_luxury_busto', app: 'sivra' },
    { id: 'neg-socorro', sociedadId: ALBERTO, refExt: 'prop_house_sevillana', app: 'sivra' },
  ],
}

test('NIF del receptor (con prefijo ES y ruido) → su sociedad', () => {
  // Caso real: Vercel/OpenRouter facturan a «ES NIF28823484E».
  const a = asignarTitular({ nif_cliente: 'ES NIF28823484E', cliente: 'Alberto Suárez' }, CTX)
  assert.equal(a.sociedadId, ALBERTO)
  assert.equal(a.fuente, 'nif_receptor')
  assert.equal(a.negocioId, null, 'el NIF da la sociedad, nunca la actividad')
})

test('propiedad de un piso → negocio → sociedad', () => {
  const a = asignarTitular({ propiedad: 'prop_house_sevillana' }, CTX)
  assert.equal(a.sociedadId, ALBERTO)
  assert.equal(a.negocioId, 'neg-socorro')
  assert.equal(a.fuente, 'propiedad')
})

test('NIF y propiedad de acuerdo → sociedad por NIF y negocio por propiedad', () => {
  const a = asignarTitular({ nif_cliente: '28823484E', propiedad: 'prop_duplex_center' }, CTX)
  assert.equal(a.sociedadId, ALBERTO)
  assert.equal(a.negocioId, 'neg-duplex')
})

test('Punto y Coma por NIF → pendiente «sociedad_paralizada» con la sugerida para el aviso', () => {
  const a = asignarTitular({ nif_cliente: 'B-90446683', cliente: 'Punto y Coma Gestión SL' }, CTX)
  assert.equal(a.sociedadId, null)
  assert.equal(a.pendiente, 'sociedad_paralizada')
  assert.ok(a.pendiente && a.sociedadSugeridaId === PYC)
})

test('Punto y Coma por NOMBRE → también paralizada (DIGI factura sin NIF)', () => {
  const a = asignarTitular({ cliente: 'Punto Y Coma Gestion Sl' }, CTX)
  assert.equal(a.pendiente, 'sociedad_paralizada')
})

test('paralizada gana aunque la propiedad apunte a una sociedad activa', () => {
  const a = asignarTitular({ nif_cliente: 'B90446683', propiedad: 'prop_busto_reform' }, CTX)
  assert.equal(a.sociedadId, null)
  assert.equal(a.pendiente, 'sociedad_paralizada')
})

test('NIF de un titular y propiedad de OTRA sociedad activa → conflicto, null', () => {
  const ctx: ContextoTitular = {
    sociedades: [...CTX.sociedades, { id: 'soc-b', nombre: 'Otra SL', cif: 'B11111111', estado: 'activa' }],
    negocios: CTX.negocios,
  }
  const a = asignarTitular({ nif_cliente: 'B11111111', propiedad: 'prop_busto_reform' }, ctx)
  assert.equal(a.sociedadId, null)
  assert.equal(a.pendiente, 'conflicto_titular')
})

test('sin NIF, sin nombre exacto y sin propiedad → null «sin_datos», aunque solo haya UNA sociedad activa', () => {
  // Caso real: ASECON (renta), Asociación de Corredores, Mercadona: nada dice de quién es.
  const a = asignarTitular({ cliente: null, propiedad: null }, CTX)
  assert.equal(a.sociedadId, null)
  assert.equal(a.pendiente, 'sin_datos')
})

test('nombre parcial («Alberto Suarez») NO identifica: null', () => {
  const a = asignarTitular({ cliente: 'Alberto Suarez' }, CTX)
  assert.equal(a.sociedadId, null)
})

test('nombre completo exacto (sin acentos, mayúsculas) → sociedad por nombre', () => {
  const a = asignarTitular({ cliente: 'ALBERTO SUAREZ GUTIERREZ' }, CTX)
  assert.equal(a.sociedadId, ALBERTO)
  assert.equal(a.fuente, 'nombre_receptor')
})

test('NIF receptor que no es de ningún titular y sin propiedad → «receptor_no_titular»', () => {
  // Caso real: IONOS con «861075916» leído como NIF del cliente.
  const a = asignarTitular({ nif_cliente: '861075916', cliente: 'Alberto Suarez Gutierrez' }, CTX)
  assert.equal(a.pendiente, 'receptor_no_titular')
})

test('NIF receptor igual al del proveedor (extractor confundido) → se ignora', () => {
  const a = asignarTitular({ nif_cliente: '28823484E', nif_proveedor: '28823484E' }, CTX)
  assert.equal(a.sociedadId, null)
})

test('gasto compartido de los pisos → sociedad común de los pisos, sin negocio', () => {
  const a = asignarTitular({ propiedad: 'prop_multi_apartamentos' }, CTX)
  assert.equal(a.sociedadId, ALBERTO)
  assert.equal(a.negocioId, null)
  assert.equal(a.fuente, 'propiedad_compartida')
})

test('gasto compartido con pisos en DOS sociedades → null', () => {
  const ctx: ContextoTitular = {
    sociedades: [...CTX.sociedades, { id: 'soc-b', nombre: 'Otra SL', cif: 'B11111111', estado: 'activa' }],
    negocios: [...CTX.negocios, { id: 'neg-x', sociedadId: 'soc-b', refExt: 'prop_x', app: 'sivra' }],
  }
  assert.equal(asignarTitular({ propiedad: 'prop_multi_apartamentos' }, ctx).sociedadId, null)
})

test('gasto personal → la única persona física; con dos personas físicas → null', () => {
  assert.equal(asignarTitular({ propiedad: 'prop_personal' }, CTX).sociedadId, ALBERTO)
  const ctx: ContextoTitular = {
    sociedades: [...CTX.sociedades, { id: 'soc-pilar', nombre: 'Pilar', cif: '12345678Z', estado: 'activa' }],
    negocios: CTX.negocios,
  }
  assert.equal(asignarTitular({ propiedad: 'prop_personal' }, ctx).sociedadId, null)
})

test('propiedad desconocida o vacía → no inventa negocio', () => {
  assert.equal(asignarTitular({ propiedad: 'prop_inexistente' }, CTX).sociedadId, null)
  assert.equal(asignarTitular({ propiedad: '' }, CTX).pendiente, 'sin_datos')
})

// ── Reglas por proveedor (decisión de Alberto, 04/10/2026) ─────────────────────────────────────
// Contexto TRAS la migración: existe el negocio de la correduría (ref_ext `grupo_asegura`).
const CORREDURIA = 'neg-correduria'
const CTX_C: ContextoTitular = {
  sociedades: CTX.sociedades,
  negocios: [...CTX.negocios, { id: CORREDURIA, sociedadId: ALBERTO, refExt: 'grupo_asegura', app: 'asegura' }],
}

test('informática/IA → negocio de la correduría (lista explícita, variantes de nombre)', () => {
  const nombres = [
    'Anthropic Ireland, Limited', 'Anthropic, PBC', 'Vercel Inc.', 'Supabase Inc', 'OpenRouter, Inc',
    'Fly.io, Inc.', 'GitHub, Inc.', 'Cloudflare, Inc.', 'IONOS Cloud S.L.U.', 'CODEOSCOPIC S.A',
  ]
  for (const proveedor of nombres) {
    const a = asignarTitular({ proveedor, nif_cliente: 'ES NIF28823484E' }, CTX_C)
    assert.equal(a.negocioId, CORREDURIA, proveedor)
    assert.equal(a.sociedadId, ALBERTO, proveedor)
    assert.equal(a.fuente, 'proveedor', proveedor)
  }
})

test('la regla por proveedor manda sobre la propiedad (Asisa y Codeoscopic llevaban prop_personal)', () => {
  const a = asignarTitular({ proveedor: 'ASISA', propiedad: 'prop_personal' }, CTX_C)
  assert.equal(a.negocioId, CORREDURIA)
  assert.equal(a.fuente, 'proveedor')
})

test('IONOS con un NIF de receptor basura → correduría (el proveedor sí dice de quién es)', () => {
  const a = asignarTitular({ proveedor: 'IONOS Cloud S.L.U.', nif_cliente: '861075916' }, CTX_C)
  assert.equal(a.negocioId, CORREDURIA)
})

test('sin el negocio de la correduría en BD, la regla NO aplica: no se inventa el destino', () => {
  const a = asignarTitular({ proveedor: 'Vercel Inc.', nif_cliente: 'ES28823484E' }, CTX)
  assert.equal(a.negocioId, null)
  assert.equal(a.fuente, 'nif_receptor')
})

test('informática a nombre de Punto y Coma → sigue pendiente «sociedad_paralizada» (solo DIGI se salta)', () => {
  const a = asignarTitular({ proveedor: 'PriceLabs, Inc.', nif_cliente: 'B90446683' }, CTX_C)
  assert.equal(a.pendiente, 'sociedad_paralizada')
  const b = asignarTitular({ proveedor: 'Vercel Inc.', nif_cliente: 'B90446683' }, CTX_C)
  assert.equal(b.sociedadId, null)
  assert.equal(b.pendiente, 'sociedad_paralizada')
})

test('DIGI a nombre de Punto y Coma (paralizada) → PISOS, sin negocio concreto', () => {
  const a = asignarTitular(
    { proveedor: 'DIGI Spain Telecom, S.A.U.', cliente: 'Punto Y Coma Gestion Sl', nif_cliente: 'B90446683', propiedad: 'prop_multi_apartamentos' },
    CTX_C,
  )
  assert.equal(a.sociedadId, ALBERTO)
  assert.equal(a.negocioId, null)
  assert.equal(a.fuente, 'proveedor_compartida')
  assert.equal(a.pendiente, null)
})

test('DIGI con la propiedad de un piso concreto → ese piso', () => {
  const a = asignarTitular({ proveedor: 'DIGI Spain Telecom', propiedad: 'prop_house_sevillana' }, CTX_C)
  assert.equal(a.negocioId, 'neg-socorro')
})

test('DIGI a nombre de OTRA sociedad ACTIVA → conflicto (la excepción es solo para la paralizada)', () => {
  const ctx: ContextoTitular = {
    sociedades: [...CTX_C.sociedades, { id: 'soc-b', nombre: 'Otra SL', cif: 'B11111111', estado: 'activa' }],
    negocios: CTX_C.negocios,
  }
  assert.equal(asignarTitular({ proveedor: 'DIGI Spain Telecom', nif_cliente: 'B11111111' }, ctx).pendiente, 'conflicto_titular')
})

test('Círculo Mercantil → personal (persona física, sin negocio)', () => {
  const a = asignarTitular({ proveedor: 'Real Círculo Mercantil e Industrial de Sevilla' }, CTX_C)
  assert.equal(a.sociedadId, ALBERTO)
  assert.equal(a.negocioId, null)
  assert.equal(a.fuente, 'proveedor_personal')
})

test('Endesa y el internet del Dúplex NO tienen regla: van por su propiedad', () => {
  const e = asignarTitular({ proveedor: 'Endesa Energía S.A.U.', propiedad: 'prop_duplex_center' }, CTX_C)
  assert.equal(e.negocioId, 'neg-duplex')
  assert.equal(e.fuente, 'propiedad')
  const i = asignarTitular({ proveedor: 'Internet', propiedad: 'prop_duplex_center' }, CTX_C)
  assert.equal(i.negocioId, 'neg-duplex')
  assert.equal(i.fuente, 'propiedad')
})

test('«Digital» o «Digitalización» no son DIGI', () => {
  const a = asignarTitular({ proveedor: 'Kit Digital Andalucía', propiedad: 'prop_personal' }, CTX_C)
  assert.equal(a.fuente, 'propiedad_personal')
})

test('NIF del titular + propiedad compartida/personal → la fuente conserva el ámbito (no «sin determinar»)', () => {
  // Casos reales: IKEA (prop_multi_apartamentos) y Glovo (prop_personal) traen el NIF de Alberto.
  const c = asignarTitular({ nif_cliente: '28823484e', propiedad: 'prop_multi_apartamentos' }, CTX)
  assert.equal(c.sociedadId, ALBERTO)
  assert.equal(c.fuente, 'propiedad_compartida')
  const p = asignarTitular({ nif_cliente: '28823484E', propiedad: 'prop_personal' }, CTX)
  assert.equal(p.fuente, 'propiedad_personal')
  // Con un piso concreto, el ámbito ya lo da el negocio: la fuente sigue siendo el receptor.
  assert.equal(asignarTitular({ nif_cliente: '28823484E', propiedad: 'prop_busto_reform' }, CTX).fuente, 'nif_receptor')
})
