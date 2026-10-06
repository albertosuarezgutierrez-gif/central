import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidirFicha, esDocumentoDeSeguro, fichaDelDocumento, planTomador, posiblesDuplicadosPorContacto, puedeAbrirFiguras, puedeVolcarEnFicha, fechaLlamada, mismoNombre, proximoVencimiento, ramoOportunidad } from './oportunidad-documento-reglas.ts'

const HOY = new Date('2026-09-29T10:00:00Z')

test('🪤 un vencimiento pasado se corre al año siguiente (la póliza se renueva)', () => {
  assert.equal(proximoVencimiento('2025-03-15', HOY), '2027-03-15')
  assert.equal(proximoVencimiento('2025-12-01', HOY), '2026-12-01')
  assert.equal(proximoVencimiento('2026-11-20', HOY), '2026-11-20')
  assert.equal(proximoVencimiento('2024-02-29', HOY), '2027-02-28')
  assert.equal(proximoVencimiento(null, HOY), null)
  assert.equal(proximoVencimiento('no', HOY), null)
})

test('🪤 la llamada es 45 días antes; si ya pasó o no hay fecha, mañana', () => {
  assert.equal(fechaLlamada('2026-12-31', HOY), '2026-11-16')
  assert.equal(fechaLlamada('2026-10-20', HOY), '2026-09-30')
  assert.equal(fechaLlamada(null, HOY), '2026-09-30')
})

test('ramo desconocido = otros; documento sin datos de seguro no abre nada', () => {
  assert.equal(ramoOportunidad('auto'), 'auto')
  assert.equal(ramoOportunidad(null), 'otros')
  assert.equal(esDocumentoDeSeguro({}), false)
  assert.equal(esDocumentoDeSeguro({ compania: 'Mapfre' }), true)
  assert.equal(esDocumentoDeSeguro({ primaAnual: 0 }), false)
})

test('🪤 mismo nombre sin orden; el padre no es el hijo', () => {
  assert.equal(mismoNombre('PIÑA FRANCO MANUEL ANTONIO', 'Manuel Antonio Piña Franco'), true)
  assert.equal(mismoNombre('Manuel Piña', 'Manuel Antonio Piña Franco'), true)
  assert.equal(mismoNombre('Manuel Piña Ruiz', 'Manuel Antonio Piña Franco'), false)
  assert.equal(mismoNombre('Manuel', 'Manuel Antonio Piña Franco'), false)
  // 🪤 apellidos pegados por el OCR: mismo nombre si sin espacios son idénticos
  assert.equal(mismoNombre('JOSE ANTONIOMARTINAVILA', 'Jose Antonio Martin Avila', { exacto: true }), true)
  assert.equal(mismoNombre('JOSE ANTONIOMARTINAVILA', 'Jose Antonio Martin Avila'), true)
  assert.equal(mismoNombre('JOSE ANTONIOMARTINAVILA', 'Jose Antonio Martin Avila Ruiz', { exacto: true }), false)
  // Las partículas no cuentan para el mínimo de dos palabras.
  assert.equal(mismoNombre('María de la', 'María de la Paz Ruiz'), false)
  assert.equal(mismoNombre('Manuel Piña', 'Manuel Piña Ruiz', { exacto: true }), false)
  assert.equal(mismoNombre('PIÑA RUIZ MANUEL', 'Manuel Piña Ruiz', { exacto: true }), true)
})

const base = { clienteSube: 'yo', nombreFicha: 'Manuel Antonio Piña Franco', dniFicha: '12345678Z', tomador: 'PIÑA FRANCO MANUEL ANTONIO', dniDocumento: null, coincidencias: null }

test('🪤 decidir ficha: por DNI primero; dos DNI distintos nunca se funden', () => {
  assert.deepEqual(decidirFicha({ ...base, dniDocumento: '12.345.678-z' }), { tipo: 'ficha', clienteId: 'yo', porque: 'dni_ficha' })
  assert.deepEqual(decidirFicha({ ...base, dniDocumento: '87654321X', coincidencias: [{ id: 'otro', activo: true }] }), { tipo: 'ficha', clienteId: 'otro', porque: 'dni_cartera' })
  // Mismo nombre, pero la ficha tiene OTRO DNI: es otra persona → lead.
  assert.deepEqual(decidirFicha({ ...base, dniDocumento: '87654321X', coincidencias: [] }), { tipo: 'lead' })
  // Ficha sin DNI y mismo nombre: es ella.
  assert.deepEqual(decidirFicha({ ...base, dniFicha: null, dniDocumento: '87654321X', coincidencias: [] }), { tipo: 'ficha', clienteId: 'yo', porque: 'nombre' })
  // 🪤 El hijo sin DNI no se queda la póliza del padre, que sí trae el suyo.
  assert.deepEqual(decidirFicha({ ...base, dniFicha: null, nombreFicha: 'Manuel Piña', tomador: 'Manuel Piña Ruiz', dniDocumento: '87654321X', coincidencias: [] }), { tipo: 'lead' })
})

test('decidir ficha sin DNI en el documento: por nombre; otra persona = lead', () => {
  assert.deepEqual(decidirFicha(base), { tipo: 'ficha', clienteId: 'yo', porque: 'nombre' })
  assert.deepEqual(decidirFicha({ ...base, tomador: 'María López García' }), { tipo: 'lead' })
  assert.deepEqual(decidirFicha({ ...base, tomador: null }), { tipo: 'ficha', clienteId: 'yo', porque: 'sin_tomador' })
  assert.deepEqual(decidirFicha({ ...base, clienteSube: null, tomador: null }), { tipo: 'sin_persona' })
  assert.deepEqual(decidirFicha({ ...base, clienteSube: null }), { tipo: 'lead' })
})

test('🪤 por contacto NUNCA se asigna ficha: solo posibles duplicados (el hijo no se queda la del padre)', () => {
  // Aunque sea una sola, sin DNI y con el mismo nombre: no se usa, se anota.
  assert.deepEqual(posiblesDuplicadosPorContacto([{ id: 'ana' }, { id: 'ana' }, { id: 'hijo' }]), ['ana', 'hijo'])
  assert.deepEqual(posiblesDuplicadosPorContacto([{ id: 'nuevo' }, { id: 'hijo' }], 'nuevo'), ['hijo'])
  assert.deepEqual(posiblesDuplicadosPorContacto([]), [])
})

test('🪤 desde el PORTAL solo se vuelca en la ficha PROPIA de quien sube (toma de cuenta por email)', () => {
  const b = { origen: 'portal', verificado: true, hayTomador: true, porqueFicha: 'dni_ficha', clienteId: 'yo', clienteSube: 'yo' }
  assert.equal(puedeVolcarEnFicha(b), true)
  assert.equal(puedeVolcarEnFicha({ ...b, clienteId: 'otro', porqueFicha: 'dni_cartera' }), false)
  assert.equal(puedeVolcarEnFicha({ ...b, clienteSube: null }), false)
  assert.equal(puedeVolcarEnFicha({ ...b, origen: 'solicitud', clienteId: 'otro' }), false)
  // El corredor sí rellena la ficha del tomador aunque la subiera desde otra.
  assert.equal(puedeVolcarEnFicha({ ...b, origen: 'ficha', clienteId: 'otro' }), true)
  assert.equal(puedeVolcarEnFicha({ ...b, origen: 'ficha', verificado: false }), false)
  assert.equal(puedeVolcarEnFicha({ ...b, origen: 'ficha', porqueFicha: 'sin_tomador' }), false)
})

// ─── «Subir póliza» sin ficha de contexto (03/10/2026): lo mismo que la ficha → Documentos ──────
const sinContexto = { clienteSube: null, nombreFicha: null, dniFicha: null }
const persona = { nombre: 'Estibaliz', apellidos: 'Eslava Ruiz', dni: '12345678Z', tipoPersona: 'fisica' as const }
const empresa = { nombre: 'Transportes Ejemplo SL', apellidos: '', dni: 'B12345674', tipoPersona: 'juridica' as const }

test('🪤 sin contexto, el DNI que coincide (índice ciego) da ESA ficha', () => {
  assert.deepEqual(
    planTomador({ ...sinContexto, alta: persona, encontradas: [{ id: 'ficha-dni', por: 'dni' }] }),
    { tipo: 'ficha', clienteId: 'ficha-dni', porque: 'dni_cartera' },
  )
})

test('🪤 sin contexto, el CIF que coincide da ESA ficha (la empresa se identifica igual que una persona)', () => {
  assert.deepEqual(
    planTomador({ ...sinContexto, alta: empresa, encontradas: [{ id: 'ficha-cif', por: 'dni' }] }),
    { tipo: 'ficha', clienteId: 'ficha-cif', porque: 'dni_cartera' },
  )
})

test('🪤 sin contexto y sin coincidencia: lead NUEVO que nace con su DNI/CIF', () => {
  const p = planTomador({ ...sinContexto, alta: empresa, encontradas: [] })
  assert.equal(p.tipo, 'lead')
  assert.equal(p.tipo === 'lead' && p.alta.dni, 'B12345674')
  assert.equal(p.tipo === 'lead' && p.alta.tipoPersona, 'juridica')
  assert.deepEqual(p.tipo === 'lead' && p.posiblesDuplicados, [])
  // No se pudo buscar (null ≠ []): tampoco se inventa una ficha; el alta re-comprueba el DNI.
  assert.equal(planTomador({ ...sinContexto, alta: persona, encontradas: null }).tipo, 'lead')
})

test('🪤 sin contexto, solo coincide el TELÉFONO: lead nuevo + nota, y NUNCA esa otra ficha', () => {
  const p = planTomador({ ...sinContexto, alta: persona, encontradas: [{ id: 'padre', por: 'telefono' }, { id: 'madre', por: 'email' }] })
  assert.equal(p.tipo, 'lead')
  assert.equal(p.tipo === 'lead' && p.alta.dni, '12345678Z')
  assert.deepEqual(p.tipo === 'lead' && p.posiblesDuplicados, ['padre', 'madre'])
  // Tampoco sin DNI en el documento, ni con un solo candidato que se llame igual.
  const sinDni = planTomador({ ...sinContexto, alta: { ...persona, dni: null }, encontradas: [{ id: 'padre', por: 'telefono' }] })
  assert.equal(sinDni.tipo, 'lead')
  assert.equal(sinDni.tipo === 'lead' && sinDni.alta.dni, null)
  assert.deepEqual(sinDni.tipo === 'lead' && sinDni.posiblesDuplicados, ['padre'])
})

test('sin contexto y sin tomador legible: no se toca ninguna ficha', () => {
  assert.deepEqual(planTomador({ ...sinContexto, alta: null, encontradas: [{ id: 'x', por: 'telefono' }] }), { tipo: 'sin_persona' })
})

test('🪤 la respuesta de la ficha lleva NOMBRES de campos y avisos, nunca valores', () => {
  const f = fichaDelDocumento({
    estado: 'creada', clienteId: 'nuevo', clienteNuevo: true, conIdentificador: true, posiblesDuplicados: ['padre'],
    ficha: { estado: 'rellenada', campos: ['fecha de nacimiento', 'domicilio', 'teléfono'], avisos: [] },
  })
  assert.deepEqual(f && { id: f.clienteId, creada: f.creada, rellenados: f.rellenados }, { id: 'nuevo', creada: true, rellenados: ['fecha de nacimiento', 'domicilio', 'teléfono'] })
  assert.match(f!.avisos.join(' '), /posible duplicado/)
  const sinId = fichaDelDocumento({ estado: 'creada', clienteId: 'n2', clienteNuevo: true, conIdentificador: false, ficha: { estado: 'no_tocada', motivo: 'sin_dni_documento' } })
  assert.match(sinId!.avisos.join(' '), /sin identificador/)
  assert.deepEqual(sinId!.rellenados, [])
  // Ya existía; la oportunidad falló pero la ficha estaba resuelta: el fichero no se pierde.
  assert.equal(fichaDelDocumento({ estado: 'error', clienteId: 'ya' })?.creada, false)
  assert.equal(fichaDelDocumento({ estado: 'sin_persona' }), null)
  assert.equal(fichaDelDocumento({ estado: 'ya_nuestra' }), null)
})

test('🪤 figuras de la póliza: nunca desde el portal ni el enlace de datos, ni en la ficha propia', () => {
  const b = { origen: 'subir-poliza', verificado: true, hayTomador: true, porqueFicha: 'dni_ficha', clienteId: 'c1', clienteSube: 'c1' }
  assert.equal(puedeAbrirFiguras(b), true)
  assert.equal(puedeAbrirFiguras({ ...b, origen: 'ficha' }), true)
  assert.equal(puedeAbrirFiguras({ ...b, origen: 'portal' }), false)
  assert.equal(puedeAbrirFiguras({ ...b, origen: 'solicitud' }), false)
  assert.equal(puedeAbrirFiguras({ ...b, verificado: false }), false)
})

test('🪤 tomador con apellidos pegados en ficha sin DNI: misma ficha, no lead duplicado', () => {
  const base = { clienteSube: 'yo', nombreFicha: 'Jose Antonio Martin Avila', dniFicha: null, tomador: 'JOSE ANTONIOMARTINAVILA', dniDocumento: '12345678Z', coincidencias: [] }
  assert.deepEqual(decidirFicha(base), { tipo: 'ficha', clienteId: 'yo', porque: 'nombre' })
  assert.deepEqual(decidirFicha({ ...base, tomador: 'JOSE ANTONIOMARTINRUIZ' }), { tipo: 'lead' })
})
