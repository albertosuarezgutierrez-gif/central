// Tests de la lógica PURA de la biblioteca de empresa (F2).
// Runner integrado de Node (type-stripping): `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { tipoDeDocumento } from '../src/biblioteca.ts'
import { autocompletarChecklist } from '../src/biblioteca.ts'
import type { Biblioteca, ItemChecklist } from '../src/types.ts'

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
