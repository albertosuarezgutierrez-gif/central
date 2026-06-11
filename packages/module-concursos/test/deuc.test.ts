// Tests de la lógica PURA del sobre administrativo + DEUC (F3).
// Runner integrado de Node (type-stripping): `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { documentosSobreAdministrativo } from '../src/deuc.ts'
import type { Biblioteca, FichaConcurso } from '../src/types.ts'

function fichaBase(over: Partial<FichaConcurso> = {}): FichaConcurso {
  return {
    objeto: 'Servicio de limpieza de un colegio',
    tipo_contrato: 'servicios', procedimiento: 'abierto', lotes: 0,
    plazos: {}, solvencia: [], garantias: {}, criterios: [], documentos: [],
    ...over,
  }
}

test('documentosSobreAdministrativo: incluye los administrativos base y marca cobertura', () => {
  const biblio: Biblioteca = [{ tipo: 'certificado_aeat', nombre: 'AEAT 2026' }]
  const items = documentosSobreAdministrativo(fichaBase(), biblio)
  // El checklist base mete AEAT, SS y la declaración responsable en 'administrativo'.
  const aeat = items.find(i => /AEAT|Agencia Tributaria/i.test(i.documento))
  const ss = items.find(i => /Seguridad Social/i.test(i.documento))
  assert.ok(aeat, 'debe listar el certificado de la AEAT')
  assert.ok(ss, 'debe listar el certificado de la Seguridad Social')
  assert.equal(aeat!.cubiertoPor?.tipo, 'certificado_aeat') // cubierto por la biblioteca
  assert.equal(ss!.cubiertoPor, undefined)                   // no está en la biblioteca
})

test('documentosSobreAdministrativo: solo devuelve documentos del sobre administrativo', () => {
  const ficha = fichaBase({
    documentos: [
      { nombre: 'Memoria técnica', sobre: 'tecnico', obligatorio: true },
      { nombre: 'Escritura de constitución', sobre: 'administrativo', obligatorio: true },
    ],
  })
  const items = documentosSobreAdministrativo(ficha, [])
  assert.ok(items.some(i => /Escritura/i.test(i.documento)))
  assert.ok(!items.some(i => /Memoria técnica/i.test(i.documento)))
})
