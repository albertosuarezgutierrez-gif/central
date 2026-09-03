import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  esCarteraViva,
  esVolcadoHistorico,
  sqlCarteraViva,
  sqlVolcadoHistorico,
  WHERE_CARTERA_VIVA,
  WHERE_VOLCADO_HISTORICO,
} from './cartera-viva.ts'

test('lo que baja de CIMA sin import_ref es cartera viva', () => {
  assert.equal(esCarteraViva({ importRef: null, eiacXmlHash: 'abc123' }), true)
})

test('lo que emitimos nosotros (sin import_ref y sin hash aún) sigue siendo viva', () => {
  // Pendiente de que CIMA la confirme, pero es cartera nuestra: no es un lead.
  assert.equal(esCarteraViva({ importRef: null, eiacXmlHash: null }), true)
})

test('el volcado histórico que CIMA nunca ha tocado es lead', () => {
  assert.equal(esCarteraViva({ importRef: 'asegura_app:pol2:13935', eiacXmlHash: null }), false)
  assert.equal(esVolcadoHistorico({ importRef: 'intranet:9', eiacXmlHash: null }), true)
})

test('🚨 el caso Reale: fila del volcado que la ingesta de CIMA mantiene al día', () => {
  // `3021700291186` (C0613): import_ref de 2017 y suplemento 133 de agosto/2026.
  // Con el filtro viejo (`import_ref IS NULL`) contaba como lead y escondía al cliente.
  const reale = { importRef: 'asegura_app:pol2:15143', eiacXmlHash: 'd41d8c' }
  assert.equal(esCarteraViva(reale), true)
  assert.equal(esVolcadoHistorico(reale), false)
})

test("import_ref = '' es volcado, no viva: el valor de cajón no cuela", () => {
  assert.equal(esCarteraViva({ importRef: '', eiacXmlHash: null }), false)
})

test("un eiac_xml_hash vacío tampoco cuela como marca de CIMA", () => {
  assert.equal(esCarteraViva({ importRef: 'intranet:1', eiacXmlHash: '' }), false)
})

test('undefined se trata como ausente, igual que null', () => {
  assert.equal(esCarteraViva({ importRef: undefined, eiacXmlHash: undefined }), true)
  assert.equal(esCarteraViva({ importRef: 'x', eiacXmlHash: undefined }), false)
})

test('viva y volcado son complementarios exactos: nada cae fuera ni en los dos', () => {
  const refs = [null, undefined, '', 'intranet:1', 'asegura_app:pol2:1']
  const hashes = [null, undefined, '', 'abc']
  for (const importRef of refs) {
    for (const eiacXmlHash of hashes) {
      const p = { importRef, eiacXmlHash }
      assert.notEqual(esCarteraViva(p), esVolcadoHistorico(p))
    }
  }
})

test('el where de Prisma y el SQL crudo dicen lo mismo que el predicado', () => {
  assert.deepEqual(WHERE_CARTERA_VIVA, { OR: [{ importRef: null }, { NOT: { eiacXmlHash: null } }] })
  assert.deepEqual(WHERE_VOLCADO_HISTORICO, { AND: [{ NOT: { importRef: null } }, { eiacXmlHash: null }] })
  assert.equal(sqlCarteraViva(), '(p.import_ref is null or p.eiac_xml_hash is not null)')
  assert.equal(sqlCarteraViva('pol'), '(pol.import_ref is null or pol.eiac_xml_hash is not null)')
  assert.equal(sqlVolcadoHistorico('x'), '(x.import_ref is not null and x.eiac_xml_hash is null)')
})
