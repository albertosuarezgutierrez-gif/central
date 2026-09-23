import { test } from 'node:test'
import assert from 'node:assert/strict'
import { documentosEmitidos, documentoCaducado, documentoPoliza, meritaReintentoDocumento } from './documentos-emitidos.ts'

// Fixtures LITERALES del OpenAPI vivo de INT (leído el 23/09/2026, ver
// docs/CODEOSCOPIC-API-PORTAL.md § 12) — no inventados: son los dos únicos
// ejemplos reales de `issuedDocuments[]` que trae la doc del fabricante.
const POLICY_APPLICATION_GET = {
  id: 'I338',
  status: { id: 'Approved' },
  policyNumber: '849651',
  issuedDocuments: [
    {
      name: 'Póliza',
      url: 'https://api.codeoscopic.io/insurances/2693/files/pm-id-1626',
      creationDateTime: '2023-11-07T13:19:16+01:00',
      expirationDateTime: '2024-11-06T13:19:16+01:00',
    },
  ],
}

const SUBMIT_RESPONSE_ARRAY = [
  { id: 'P63', policyNumber: '25671986' }, // sin issuedDocuments
  {
    id: 'P64',
    policyNumber: '71-0097026',
    issuedDocuments: [
      {
        name: 'Póliza',
        url: 'https://api.codeoscopic.io/insurances/632/files/pm-id-1538',
        creationDateTime: '2023-10-03T10:01:52+02:00',
        expirationDateTime: '2024-10-02T10:01:52+02:00',
      },
    ],
  },
]

test('documentosEmitidos lee el fixture real del GET de una solicitud aprobada', () => {
  const docs = documentosEmitidos(POLICY_APPLICATION_GET)
  assert.equal(docs.length, 1)
  assert.equal(docs[0].nombre, 'Póliza')
  assert.equal(docs[0].url, 'https://api.codeoscopic.io/insurances/2693/files/pm-id-1626')
  assert.equal(docs[0].creadaEn, '2023-11-07T13:19:16+01:00')
  assert.equal(docs[0].caducaEn, '2024-11-06T13:19:16+01:00')
})

test('documentosEmitidos acepta el array del Submit y encuentra el elemento con documentos', () => {
  const docs = documentosEmitidos(SUBMIT_RESPONSE_ARRAY[1])
  assert.equal(docs.length, 1)
  assert.equal(docs[0].url, 'https://api.codeoscopic.io/insurances/632/files/pm-id-1538')
})

test('documentosEmitidos acepta el array COMPLETO del Submit (envio.crudo), no solo un elemento suelto', () => {
  const docs = documentosEmitidos(SUBMIT_RESPONSE_ARRAY)
  assert.equal(docs.length, 1)
  assert.equal(docs[0].url, 'https://api.codeoscopic.io/insurances/632/files/pm-id-1538')
})

test('documentosEmitidos acepta el proyecto entero con policyApplications[] (crudoPrevio de emitir/route.ts)', () => {
  const proyecto = { effectiveDate: '2026-09-01', policyApplications: SUBMIT_RESPONSE_ARRAY }
  const docs = documentosEmitidos(proyecto)
  assert.equal(docs.length, 1)
  assert.equal(docs[0].url, 'https://api.codeoscopic.io/insurances/632/files/pm-id-1538')
})

test('un elemento sin name o sin url se descarta, no se inventa', () => {
  assert.deepEqual(documentosEmitidos({ issuedDocuments: [{ url: 'https://x' }, { name: 'Póliza' }] }), [])
})

test('sin issuedDocuments devuelve [] — no es "no se emitió", es "esta respuesta no lo trae"', () => {
  assert.deepEqual(documentosEmitidos(SUBMIT_RESPONSE_ARRAY[0]), [])
  assert.deepEqual(documentosEmitidos(null), [])
  assert.deepEqual(documentosEmitidos({}), [])
})

test('documentoCaducado compara contra el reloj, nunca contra una duración supuesta', () => {
  const doc = documentosEmitidos(POLICY_APPLICATION_GET)[0]
  assert.equal(documentoCaducado(doc, new Date('2024-01-01T00:00:00Z')), false)
  assert.equal(documentoCaducado(doc, new Date('2025-01-01T00:00:00Z')), true)
  assert.equal(documentoCaducado({ ...doc, caducaEn: null }, new Date('2099-01-01T00:00:00Z')), false)
})

test('documentoPoliza prioriza el que se llama "Póliza" sobre otros informes', () => {
  const docs = [
    { nombre: 'Informe de oferta', url: 'https://x/1', creadaEn: null, caducaEn: null },
    { nombre: 'Póliza', url: 'https://x/2', creadaEn: null, caducaEn: null },
  ]
  assert.equal(documentoPoliza(docs)?.url, 'https://x/2')
  assert.equal(documentoPoliza([]), null)
})

test('meritaReintentoDocumento: solo aprobada Y sin documentos', () => {
  const conDoc = documentosEmitidos(POLICY_APPLICATION_GET)
  assert.equal(meritaReintentoDocumento('aprobada', []), true)
  assert.equal(meritaReintentoDocumento('aprobada', conDoc), false)
  assert.equal(meritaReintentoDocumento('pendiente', []), false)
  assert.equal(meritaReintentoDocumento('rechazada', []), false)
  assert.equal(meritaReintentoDocumento('desconocido', []), false)
})
