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

import { construirDeuc } from '../src/deuc.ts'
import type { DatosIdentificacionEmpresa } from '../src/types.ts'

const EMPRESA: DatosIdentificacionEmpresa = {
  razon_social: 'Limpiezas Ejemplo SL', nif: 'B12345678', es_pyme: true,
}

test('construirDeuc: rellena procedimiento, operador y solvencia desde la ficha', () => {
  const ficha = fichaBase({
    objeto: 'Limpieza de un colegio', expediente: '2026/01', organo_contratacion: 'Ayto. de X',
    solvencia: [
      { ambito: 'economica', descripcion: 'Volumen anual ≥ 100.000 €' },
      { ambito: 'tecnica', descripcion: 'Servicios similares en 3 años' },
    ],
  })
  const deuc = construirDeuc(EMPRESA, ficha, '2026-06-11')
  assert.equal(deuc.procedimiento.objeto, 'Limpieza de un colegio')
  assert.equal(deuc.procedimiento.expediente, '2026/01')
  assert.equal(deuc.procedimiento.organo, 'Ayto. de X')
  assert.equal(deuc.operador.nif, 'B12345678')
  assert.deepEqual(deuc.solvencia.economica, ['Volumen anual ≥ 100.000 €'])
  assert.deepEqual(deuc.solvencia.tecnica, ['Servicios similares en 3 años'])
})

test('construirDeuc: motivos de exclusión y declaración final por defecto a favor', () => {
  const deuc = construirDeuc(EMPRESA, fichaBase(), '2026-06-11')
  assert.equal(deuc.motivos_exclusion.sin_condenas, true)
  assert.equal(deuc.motivos_exclusion.al_corriente_impuestos, true)
  assert.equal(deuc.motivos_exclusion.al_corriente_ss, true)
  assert.equal(deuc.motivos_exclusion.sin_quiebra, true)
  assert.equal(deuc.declaraciones_finales.veracidad, true)
  assert.equal(deuc.declaraciones_finales.fecha, '2026-06-11')
})
