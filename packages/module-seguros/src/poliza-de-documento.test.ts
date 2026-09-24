import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clasificarCoincidencias,
  clavesCotejo,
  partirNombre,
  puedeEnlazarse,
  proyectarVencimiento,
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
    lectura({
      compania: 'Allianz',
      numeroPoliza: '3021700291186',
      fechaVencimiento: '2027-03-15',
      matricula: '1234ABC',
    }),
    new Date('2026-09-21T00:00:00Z'),
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

// ─── El vencimiento que sirve para entrar, no el que imprime el papel ───────

const HOY = new Date('2026-09-21T00:00:00Z')

test('un vencimiento futuro se deja como está', () => {
  const r = proyectarVencimiento('2027-03-15', HOY)
  assert.deepEqual(r, { fecha: '2027-03-15', proyectado: false })
})

test('un vencimiento pasado se proyecta al próximo aniversario y se DECLARA', () => {
  // Caso real: póliza de Allianz con vigencia «hasta el 31/8/2025, prorrogable
  // automáticamente», mandada por el interesado en septiembre de 2026.
  // Guardar 2025-08-31 hace que el calendario la dé por muerta y no avise NUNCA
  // de la única fecha por la que se subió el documento.
  const r = proyectarVencimiento('2025-08-31', HOY)
  assert.deepEqual(r, { fecha: '2027-08-31', proyectado: true })
})

test('un papel de hace varias renovaciones llega hasta el aniversario vigente', () => {
  const r = proyectarVencimiento('2019-03-10', HOY)
  assert.equal(r.fecha, '2027-03-10')
  assert.equal(r.proyectado, true)
})

test('el 29 de febrero se proyecta al 28, nunca al 1 de marzo', () => {
  // Adelantar un día una fecha de preaviso es conservador; atrasarla, no.
  const r = proyectarVencimiento('2024-02-29', new Date('2026-06-01T00:00:00Z'))
  assert.equal(r.fecha, '2027-02-28')
})

test('el vencimiento proyectado sale como aviso, no en silencio', () => {
  const r = prepararDeclaradaDesdeDocumento(
    lectura({ compania: 'Allianz', numeroPoliza: '099999999', fechaVencimiento: '2025-08-31', matricula: '1111BBB' }),
    HOY,
  )
  assert.equal(r.declarada.fechaVencimiento, '2027-08-31')
  assert.ok(r.avisos.includes('vencimiento_proyectado'))
})

// ─── Cotejo: el número de póliza NO es la clave del riesgo ─────────────────

test('en auto la clave del riesgo es la matrícula', () => {
  const r = clavesCotejo(lectura({ matricula: '1111 BBB', dni: '00000001R', numeroPoliza: '099999999' }))
  assert.equal(r.claves.matricula, '1111BBB')
  assert.equal(r.claves.dni, '00000001R')
  assert.equal(r.hayClaveDeRiesgo, true)
})

test('en hogar la clave del riesgo es la dirección', () => {
  const r = clavesCotejo({
    ramo: 'hogar',
    tipoLectura: 'hogar',
    datos: { direccion: 'Calle Socorro 24', cp: '41003', numeroPoliza: 'H-1' },
  })
  assert.equal(r.claves.direccion, 'Calle Socorro 24')
  assert.equal(r.claves.cp, '41003')
  assert.equal(r.hayClaveDeRiesgo, true)
})

test('la matrícula de un hogar no se arrastra, ni la dirección de un coche', () => {
  const hogar = clavesCotejo({
    ramo: 'hogar',
    tipoLectura: 'hogar',
    datos: { matricula: '1111BBB', direccion: 'Calle Socorro 24' },
  })
  assert.equal(hogar.claves.matricula, null)
  const auto = clavesCotejo(lectura({ matricula: '1111BBB', direccion: 'Calle Socorro 24' }))
  assert.equal(auto.claves.direccion, null)
})

test('solo con el número de póliza NO hay clave de riesgo, y se avisa', () => {
  // Un vacío buscando por número dice «esta póliza no la tengo», que no es
  // «este riesgo no lo tengo»: el mismo coche cambia de número al cambiar de
  // compañía. Quien lo pinte tiene que poder decir la diferencia.
  const r = clavesCotejo(lectura({ numeroPoliza: '099999999' }))
  assert.equal(r.hayClaveDeRiesgo, false)
  const d = prepararDeclaradaDesdeDocumento(
    lectura({ compania: 'Allianz', numeroPoliza: '099999999', fechaVencimiento: '2027-08-31' }),
    HOY,
  )
  assert.ok(d.avisos.includes('sin_clave_de_riesgo'))
})

test('la matrícula se coteja igual escrita de cualquier forma', () => {
  const de = (v: string) => clavesCotejo(lectura({ matricula: v })).claves.matricula
  assert.equal(de('1111 BBB'), '1111BBB')
  assert.equal(de('1111-bbb'), '1111BBB')
  assert.equal(clavesCotejo(lectura({ matricula: null })).claves.matricula, null)
})

// ─── La póliza REAL que mandó un cliente (Allianz 099999999) ────────────────

test('una póliza de auto con la forma real se convierte en ficha y en lead sin inventar nada', () => {
  const real = lectura({
    compania: 'Allianz',
    numeroPoliza: '099999999',
    fechaEfecto: '2024-09-06',
    fechaVencimiento: '2025-08-31',
    primaAnual: 253.59,
    matricula: '1111BBB',
    marca: 'NISSAN',
    modelo: 'QASHQAI 2.0DCI ACENTA 4X4 AUTO 5P',
    tomador: 'MANUEL EJEMPLO PRUEBA',
    dni: '00000001R',
    fechaNacimiento: '1989-07-30',
    fechaCarnet: '2008-07-01',
  })

  const { alta, avisos: avisosAlta } = prepararAltaDesdeDocumento(real)
  assert.equal(alta?.nombre, 'MANUEL')
  assert.equal(alta?.apellidos, 'EJEMPLO PRUEBA')
  assert.equal(alta?.dni, '00000001R')
  assert.equal(alta?.tipoPersona, 'fisica')
  assert.equal(alta?.fechaNacimiento, '1989-07-30')
  assert.ok(!avisosAlta.includes('sin_dni'))
  // El corte del nombre lo hizo una máquina: se dice.
  assert.ok(avisosAlta.includes('nombre_partido'))

  const { declarada, avisos } = prepararDeclaradaDesdeDocumento(real, HOY)
  assert.equal(declarada.compania, 'Allianz')
  assert.equal(declarada.matricula, '1111BBB')
  assert.equal(declarada.primaAnual, 253.59)
  // La póliza es de 2024-2025 y sigue viva por prórroga: sin proyectar, el
  // calendario no avisaría nunca.
  assert.equal(declarada.fechaVencimiento, '2027-08-31')
  assert.ok(avisos.includes('vencimiento_proyectado'))
  assert.ok(!avisos.includes('sin_clave_de_riesgo'))
  // Lo que no tiene columna propia se conserva entero.
  assert.equal((declarada.datosRamo as Record<string, unknown>).marca, 'NISSAN')
})

// ─── Una ficha que comparte teléfono NO es la misma persona ────────────────

const porDni = { id: 'a', nombre: 'Padre Ejemplo', por: 'dni' as const, tipo: 'cliente' }
const porTel = { id: 'b', nombre: 'Hijo Ejemplo', por: 'telefono' as const, tipo: 'lead' }
const porMail = { id: 'c', nombre: 'Cuñado Ejemplo', por: 'email' as const, tipo: 'lead' }

test('solo el DNI autoriza a enlazar la póliza a una ficha existente', () => {
  assert.equal(puedeEnlazarse(porDni), true)
  assert.equal(puedeEnlazarse(porTel), false)
  assert.equal(puedeEnlazarse(porMail), false)
})

test('el teléfono compartido se clasifica como MISMO CONTACTO, no misma persona', () => {
  // El caso real: el hijo hace el trámite del padre y en el papel va su móvil.
  const r = clasificarCoincidencias([porTel])
  assert.deepEqual(r.mismaPersona, [])
  assert.equal(r.mismoContacto.length, 1)
})

test('DNI y teléfono a la vez no se mezclan en el mismo cajón', () => {
  const r = clasificarCoincidencias([porDni, porTel, porMail])
  assert.equal(r.mismaPersona.length, 1)
  assert.equal(r.mismoContacto.length, 2)
})

test('sin coincidencias los dos cajones están vacíos, no nulos', () => {
  // `[]` aquí sí es «se miró y no hay»: la consulta se hizo.
  const r = clasificarCoincidencias([])
  assert.deepEqual(r, { mismaPersona: [], mismoContacto: [] })
})
