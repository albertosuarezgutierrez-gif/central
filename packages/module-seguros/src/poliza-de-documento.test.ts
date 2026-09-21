import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  partirNombre,
  tipoPersonaDeNombre,
  prepararAltaDesdeDocumento,
  prepararDeclaradaDesdeDocumento,
  type LecturaPoliza,
} from './poliza-de-documento.ts'

function lectura(datos: Record<string, string | number | null>, ramo: string | null = 'auto'): LecturaPoliza {
  return { ramo, tipoLectura: 'auto', datos }
}

// ─── Sin tomador no se abre ficha (no se inventa una persona) ───────────────

test('sin tomador no hay alta, y se dice por qué', () => {
  const r = prepararAltaDesdeDocumento(lectura({ tomador: null, dni: '12345678Z' }))
  assert.equal(r.alta, null)
  assert.ok(r.avisos.includes('sin_nombre'))
})

test('un marcador de «no encontrado» NO cuenta como tomador', () => {
  // El modelo escribe «N/A» cuando no lo ve: eso es un hueco, no un nombre.
  for (const marcador of ['N/A', '-', 'ninguno', '']) {
    const r = prepararAltaDesdeDocumento(lectura({ tomador: marcador }))
    assert.equal(r.alta, null, `«${marcador}» se coló como nombre`)
  }
})

// ─── El DNI es la identidad: su ausencia se declara siempre ─────────────────

test('sin DNI se avisa aunque el alta salga adelante', () => {
  const r = prepararAltaDesdeDocumento(lectura({ tomador: 'Juan Pérez Gil', dni: null }))
  assert.ok(r.alta)
  assert.ok(r.avisos.includes('sin_dni'))
})

test('con DNI no se avisa de que falta', () => {
  const r = prepararAltaDesdeDocumento(lectura({ tomador: 'Juan Pérez Gil', dni: '12345678Z' }))
  assert.equal(r.alta?.dni, '12345678Z')
  assert.ok(!r.avisos.includes('sin_dni'))
})

// ─── Partir el nombre es una heurística, y se dice ──────────────────────────

test('partirNombre: dos tokens = nombre + apellido', () => {
  assert.deepEqual(partirNombre('Juan Pérez'), { nombre: 'Juan', apellidos: 'Pérez' })
})

test('partirNombre: cuatro tokens = nombre compuesto + dos apellidos', () => {
  assert.deepEqual(partirNombre('Juan Carlos Pérez Gil'), { nombre: 'Juan Carlos', apellidos: 'Pérez Gil' })
})

test('partirNombre: tres tokens = un nombre y dos apellidos', () => {
  assert.deepEqual(partirNombre('Ana Pérez Gil'), { nombre: 'Ana', apellidos: 'Pérez Gil' })
})

test('partirNombre: la partícula se pega al apellido que abre', () => {
  assert.deepEqual(partirNombre('María del Carmen de la Rosa'), {
    nombre: 'María del Carmen',
    apellidos: 'de la Rosa',
  })
})

test('partirNombre: con coma manda el documento, no la heurística', () => {
  assert.deepEqual(partirNombre('LÓPEZ RUIZ, MARÍA'), { nombre: 'MARÍA', apellidos: 'LÓPEZ RUIZ' })
})

test('el alta de una persona avisa de que el nombre lo partió una máquina', () => {
  const r = prepararAltaDesdeDocumento(lectura({ tomador: 'Juan Pérez Gil', dni: '12345678Z' }))
  assert.ok(r.avisos.includes('nombre_partido'))
})

// ─── Una empresa NO se parte en nombre y apellidos ──────────────────────────

test('una sociedad se guarda entera y sin aviso de partido', () => {
  const r = prepararAltaDesdeDocumento(lectura({ tomador: 'ESQUIANSA S.L.', dni: 'B41000000' }))
  assert.equal(r.alta?.nombre, 'ESQUIANSA S.L.')
  assert.equal(r.alta?.apellidos, '')
  assert.equal(r.alta?.tipoPersona, 'juridica')
  assert.ok(!r.avisos.includes('nombre_partido'))
})

test('tipoPersonaDeNombre: ante la duda, persona física', () => {
  assert.equal(tipoPersonaDeNombre('Juan Pérez Gil'), 'fisica')
  assert.equal(tipoPersonaDeNombre('TRANSPORTES GLOBAL 2 SA'), 'juridica')
  assert.equal(tipoPersonaDeNombre('COMUNIDAD DE PROPIETARIOS SOCORRO 24'), 'juridica')
})

test('la fecha de nacimiento de una empresa no se arrastra', () => {
  const r = prepararAltaDesdeDocumento(lectura({ tomador: 'ESQUIANSA S.L.', fechaNacimiento: '1980-01-01' }))
  assert.equal(r.alta?.fechaNacimiento, null)
})

// ─── El canal queda marcado: llegó directamente al corredor ─────────────────

test('la fuente es venta directa, no web ni portal', () => {
  const r = prepararAltaDesdeDocumento(lectura({ tomador: 'Juan Pérez Gil' }))
  assert.equal(r.alta?.fuente, 'venta_directa')
})

// ─── La póliza declarada: lo que falta se declara, no se rellena ────────────

test('sin vencimiento se avisa: es el dato por el que se sube la póliza', () => {
  const r = prepararDeclaradaDesdeDocumento(lectura({ compania: 'Allianz', numeroPoliza: '123', fechaVencimiento: null }))
  assert.equal(r.declarada.fechaVencimiento, null)
  assert.ok(r.avisos.includes('sin_vencimiento'))
})

test('sin compañía ni número se avisa: no se podrá cotejar contra la cartera', () => {
  const r = prepararDeclaradaDesdeDocumento(lectura({ compania: null, numeroPoliza: null }))
  assert.ok(r.avisos.includes('sin_compania'))
  assert.ok(r.avisos.includes('sin_numero'))
})

test('una póliza completa no genera ningún aviso', () => {
  const r = prepararDeclaradaDesdeDocumento(
    lectura({ compania: 'Allianz', numeroPoliza: '3021700291186', fechaVencimiento: '2027-03-15' }),
  )
  assert.deepEqual(r.avisos, [])
})

test('la prima 0 se conserva como 0 y no se convierte en «no hay prima»', () => {
  // 24 de las 110 pólizas vivas guardan prima 0: es un dato, no un hueco.
  const r = prepararDeclaradaDesdeDocumento(lectura({ primaAnual: 0 }))
  assert.equal(r.declarada.primaAnual, 0)
})

test('lo que no tiene columna propia se guarda entero en datosRamo', () => {
  const r = prepararDeclaradaDesdeDocumento(
    lectura({ compania: 'Allianz', marca: 'Seat', modelo: 'León', aniosSinSiniestros: 5 }),
  )
  assert.deepEqual(r.declarada.datosRamo, { marca: 'Seat', modelo: 'León', aniosSinSiniestros: 5 })
})

test('los campos con columna propia no se duplican en datosRamo', () => {
  const r = prepararDeclaradaDesdeDocumento(lectura({ compania: 'Allianz', matricula: '1234ABC', tomador: 'Juan Pérez' }))
  assert.equal(r.declarada.matricula, '1234ABC')
  assert.equal(r.declarada.datosRamo, null)
})

test('datosRamo vacío es null, no {}', () => {
  // `{}` diría «se miró y no había más»; `null` dice «no quedó nada que guardar».
  const r = prepararDeclaradaDesdeDocumento(lectura({ compania: 'Allianz' }))
  assert.equal(r.declarada.datosRamo, null)
})

test('los marcadores de «no encontrado» no llegan a datosRamo', () => {
  const r = prepararDeclaradaDesdeDocumento(lectura({ marca: 'N/A', modelo: 'León' }))
  assert.deepEqual(r.declarada.datosRamo, { modelo: 'León' })
})
