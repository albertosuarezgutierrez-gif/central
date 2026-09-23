import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  esCarteraViva,
  esVolcadoHistorico,
  sqlCarteraViva,
  sqlVolcadoHistorico,
  WHERE_CARTERA_VIVA,
  WHERE_VOLCADO_HISTORICO,
  esCarteraEnVigor,
  esCarteraNoEnVigor,
  sqlCarteraEnVigor,
  sqlCarteraNoEnVigor,
  WHERE_CARTERA_EN_VIGOR,
} from './cartera-viva.ts'
import { POLIZA_ESTADOS_VIGENTES } from './vigencia.ts'

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

// ─── Cartera EN VIGOR (19/09/2026) ──────────────────────────────────────────

test('🚨 el caso Kartenbrot: una póliza de CIMA cancelada es viva (origen) pero NO en vigor', () => {
  const p = { importRef: null, eiacXmlHash: 'abc', estado: 'cancelada' }
  assert.equal(esCarteraViva(p), true)
  assert.equal(esCarteraEnVigor(p), false)
  assert.equal(esCarteraNoEnVigor(p), true)
})

test('una activa de CIMA está en vigor; una activa del volcado, no', () => {
  assert.equal(esCarteraEnVigor({ importRef: null, eiacXmlHash: 'abc', estado: 'activa' }), true)
  assert.equal(esCarteraEnVigor({ importRef: 'intranet:1', eiacXmlHash: null, estado: 'activa' }), false)
})

test('en vigor = los estados de POLIZA_ESTADOS_VIGENTES, no un «distinto de cancelada»', () => {
  // El enum tiene DIEZ valores: vencida, fin_riesgo, competencia… tampoco están en vigor.
  for (const estado of POLIZA_ESTADOS_VIGENTES) {
    assert.equal(esCarteraEnVigor({ importRef: null, eiacXmlHash: null, estado }), true, estado)
  }
  for (const estado of ['cancelada', 'vencida', 'fin_riesgo', 'anula_al_vencimiento', 'competencia', '', null, undefined]) {
    assert.equal(esCarteraEnVigor({ importRef: null, eiacXmlHash: null, estado }), false, String(estado))
  }
})

test('el where de Prisma y el SQL de «en vigor» dicen lo mismo que el predicado', () => {
  assert.deepEqual(WHERE_CARTERA_EN_VIGOR, {
    AND: [WHERE_CARTERA_VIVA, { estado: { in: [...POLIZA_ESTADOS_VIGENTES] } }, { sustituidaAt: null }],
  })
  assert.equal(
    sqlCarteraEnVigor('p'),
    "((p.import_ref is null or p.eiac_xml_hash is not null) and p.estado::text in ('activa', 'en_renovacion', 'en_vigor', 'recibo_devuelto', 'cambio_clave') and p.sustituida_at is null)",
  )
  assert.equal(sqlCarteraNoEnVigor('x'), `(${sqlCarteraEnVigor('x')} is not true)`)
})

test('🚨 una póliza sustituida no está en vigor: el cliente no tiene dos seguros del mismo coche', () => {
  const p = { importRef: null, eiacXmlHash: 'abc', estado: 'activa' }
  // La sustituida se anula y se queda anulada, pase lo que pase con la nueva (Alberto, 23/09/2026).
  assert.equal(esCarteraEnVigor({ ...p, sustituidaAt: new Date('2026-09-23') }), false)
  assert.equal(esCarteraEnVigor({ ...p, sustituidaAt: null }), true)
  assert.equal(esCarteraEnVigor(p), true)
  assert.match(sqlCarteraEnVigor('p'), /p\.sustituida_at is null/)
})
