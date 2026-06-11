// Tests de la lógica PURA de la biblioteca de empresa (F2).
// Runner integrado de Node (type-stripping): `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { tipoDeDocumento } from '../src/biblioteca.ts'
import { autocompletarChecklist } from '../src/biblioteca.ts'
import { documentosFaltantes } from '../src/biblioteca.ts'
import { documentosCaducados } from '../src/biblioteca.ts'
import type { Biblioteca, ItemChecklist } from '../src/types.ts'
import type { FichaConcurso } from '../src/types.ts'

test('tipoDeDocumento: reconoce AEAT y Seguridad Social', () => {
  assert.equal(tipoDeDocumento('Certificado de estar al corriente con la AEAT'), 'certificado_aeat')
  assert.equal(tipoDeDocumento('Certificado de la Agencia Tributaria'), 'certificado_aeat')
  assert.equal(tipoDeDocumento('Estar al corriente con la Seguridad Social'), 'certificado_ss')
})

test('tipoDeDocumento: reconoce escritura, poderes, CIF', () => {
  assert.equal(tipoDeDocumento('Escritura de constitución de la sociedad'), 'escritura_constitucion')
  assert.equal(tipoDeDocumento('Poder de representación / apoderamiento'), 'poderes')
  assert.equal(tipoDeDocumento('Tarjeta de identificación fiscal (CIF)'), 'cif')
})

test('tipoDeDocumento: reconoce seguro RC, ISO, clasificación, DEUC', () => {
  assert.equal(tipoDeDocumento('Póliza de responsabilidad civil'), 'seguro_rc')
  assert.equal(tipoDeDocumento('Certificado ISO 9001'), 'certificado_iso')
  assert.equal(tipoDeDocumento('Clasificación empresarial del contratista'), 'clasificacion_empresarial')
  assert.equal(tipoDeDocumento('Declaración responsable (DEUC o modelo del pliego)'), 'deuc')
})

test('tipoDeDocumento: devuelve undefined cuando no reconoce', () => {
  assert.equal(tipoDeDocumento('Memoria técnica de la propuesta'), undefined)
  assert.equal(tipoDeDocumento('Oferta económica (modelo del pliego)'), undefined)
})

const BIBLIO: Biblioteca = [
  { tipo: 'certificado_aeat', nombre: 'Certificado AEAT 2026' },
  { tipo: 'certificado_ss', nombre: 'Certificado SS 2026' },
]

test('autocompletarChecklist: marca hecho lo que cubre la biblioteca', () => {
  const checklist: ItemChecklist[] = [
    { sobre: 'administrativo', documento: 'Certificado de estar al corriente con la AEAT', obligatorio: true, hecho: false },
    { sobre: 'administrativo', documento: 'Certificado de la Seguridad Social', obligatorio: true, hecho: false },
    { sobre: 'tecnico', documento: 'Memoria técnica', obligatorio: true, hecho: false },
  ]
  const out = autocompletarChecklist(checklist, BIBLIO)
  assert.equal(out[0].hecho, true)
  assert.equal(out[1].hecho, true)
  assert.equal(out[2].hecho, false) // memoria no está en la biblioteca
})

test('autocompletarChecklist: no muta la entrada', () => {
  const checklist: ItemChecklist[] = [
    { sobre: 'administrativo', documento: 'Certificado AEAT', obligatorio: true, hecho: false },
  ]
  autocompletarChecklist(checklist, BIBLIO)
  assert.equal(checklist[0].hecho, false)
})

test('autocompletarChecklist: biblioteca vacía deja todo igual', () => {
  const checklist: ItemChecklist[] = [
    { sobre: 'administrativo', documento: 'Certificado AEAT', obligatorio: true, hecho: false },
  ]
  const out = autocompletarChecklist(checklist, [])
  assert.equal(out[0].hecho, false)
})

function fichaConDocs(): FichaConcurso {
  return {
    objeto: 'x', tipo_contrato: 'servicios', procedimiento: 'abierto', lotes: 0,
    plazos: {}, solvencia: [], garantias: {}, criterios: [],
    documentos: [
      { nombre: 'Certificado de estar al corriente con la AEAT', sobre: 'administrativo', obligatorio: true },
      { nombre: 'Póliza de responsabilidad civil', sobre: 'administrativo', obligatorio: true },
      { nombre: 'Memoria técnica', sobre: 'tecnico', obligatorio: true },
    ],
  }
}

test('documentosFaltantes: devuelve lo no cubierto por la biblioteca', () => {
  const biblio: Biblioteca = [{ tipo: 'certificado_aeat', nombre: 'AEAT' }]
  const faltan = documentosFaltantes(fichaConDocs(), biblio)
  const nombres = faltan.map(d => d.nombre)
  assert.ok(!nombres.includes('Certificado de estar al corriente con la AEAT')) // cubierto
  assert.ok(nombres.includes('Póliza de responsabilidad civil'))               // no en biblioteca
  assert.ok(nombres.includes('Memoria técnica'))                               // tipo no reconocido → falta
})

test('documentosFaltantes: biblioteca vacía → faltan todos', () => {
  const faltan = documentosFaltantes(fichaConDocs(), [])
  assert.equal(faltan.length, 3)
})

const BIBLIO_VIG: Biblioteca = [
  { tipo: 'certificado_aeat', nombre: 'AEAT', vigencia_hasta: '2026-05-01' }, // ya caducado
  { tipo: 'certificado_ss', nombre: 'SS', vigencia_hasta: '2026-07-15' },     // vigente hoy, caduca antes del límite
  { tipo: 'seguro_rc', nombre: 'RC' },                                        // sin vigencia → nunca caduca
]

test('documentosCaducados: con hoy detecta solo lo ya vencido', () => {
  const out = documentosCaducados(BIBLIO_VIG, '2026-06-11')
  assert.deepEqual(out.map(d => d.tipo), ['certificado_aeat'])
})

test('documentosCaducados: con límite (fin de plazo) detecta lo que vencerá antes', () => {
  const out = documentosCaducados(BIBLIO_VIG, '2026-06-11', '2026-08-01')
  assert.deepEqual(out.map(d => d.tipo), ['certificado_aeat', 'certificado_ss'])
})

test('documentosCaducados: documentos sin vigencia_hasta nunca se listan', () => {
  const out = documentosCaducados([{ tipo: 'otro', nombre: 'x' }], '2026-06-11')
  assert.equal(out.length, 0)
})
