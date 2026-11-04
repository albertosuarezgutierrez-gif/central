import { test } from 'node:test'
import assert from 'node:assert/strict'

import { construirTranscripcion, parsearAnalisis, zAnalisis, type Analisis } from './analisis.ts'
import { ejecutar, nombreDePerfil, planificar, type ContextoEjecucion, type DepsEjecutor } from './ejecutor.ts'

const CLIENTE = '11111111-1111-4111-8111-111111111111'
const OPP_AUTO = '22222222-2222-4222-8222-222222222222'

function ctx(p: Partial<ContextoEjecucion> = {}): ContextoEjecucion {
  return {
    correduriaId: 'c0000000-0000-4000-8000-000000000000',
    conversacionId: 'v0000000-0000-4000-8000-000000000000',
    estadoConversacion: 'abierta',
    clientesCandidatos: 1,
    cliente: { id: CLIENTE, tipo: 'lead', leadEstado: 'nuevo', fuente: null, nombre: 'Pepe' },
    oportunidadesAbiertas: [],
    tareasIaPendientes: [],
    perfilNombre: 'Pepe',
    hoy: '2026-10-05',
    ...p,
  }
}

function analisis(p: Partial<Analisis> & { acciones?: unknown[] } = {}): Analisis {
  return zAnalisis.parse({ es_comercial: true, ...p })
}

/** Deps de mentira que apuntan qué se llamó. */
function deps(sobre: Partial<DepsEjecutor> = {}) {
  const llamadas: string[] = []
  const auditadas: { accion: string; resultado: string; motivo?: string }[] = []
  const d: DepsEjecutor = {
    async descartarPersonal() { llamadas.push('descartarPersonal') },
    async crearLead() { llamadas.push('crearLead'); return { ok: true, clienteId: 'nuevo-id', existente: false } },
    async actualizarLead() { llamadas.push('actualizarLead'); return true },
    async crearOportunidad() { llamadas.push('crearOportunidad'); return { ok: true, id: 'opp-nueva' } },
    async actualizarOportunidad() { llamadas.push('actualizarOportunidad'); return true },
    async crearTarea() { llamadas.push('crearTarea'); return { ok: true, id: 'tarea' } },
    async rellenarNombre() { llamadas.push('rellenarNombre'); return true },
    async anotarNota() { llamadas.push('anotarNota') },
    async crearPropuesta() { llamadas.push('crearPropuesta'); return { ok: true, id: 'prop' } },
    async auditar(e) { auditadas.push({ accion: e.accion, resultado: e.resultado, motivo: e.motivo }) },
    ...sobre,
  }
  return { d, llamadas, auditadas }
}

test('Zod .strict(): un campo inventado invalida el análisis; los ausentes son null («no se sabe»), no 0 ni []', () => {
  assert.equal(parsearAnalisis('{"es_comercial":true,"inventado":1}').ok, false)
  assert.equal(parsearAnalisis('no es json').ok, false)
  const r = parsearAnalisis('```json\n{"es_comercial":true}\n```', (s) => s.replace(/```json|```/g, ''))
  assert.ok(r.ok)
  if (r.ok) {
    assert.equal(r.analisis.presupuesto, null)
    assert.equal(r.analisis.objeciones, null)
    assert.equal(r.analisis.producto, null)
    assert.deepEqual(r.analisis.acciones, [])
  }
  // Una acción con un campo extra se rechaza ella sola (strict por acción), no el análisis.
  const p = planificar(analisis({ acciones: [{ tipo: 'addConversationNote', texto: 'hola hola', id_cliente: 'x' }] }), ctx())
  assert.deepEqual(p.rechazos, [{ tipo: 'addConversationNote', motivo: 'invalida' }])
})

test('acción FUERA de la lista blanca → rechazada y auditada, sin llamar a nada', async () => {
  const p = planificar(analisis({ acciones: [{ tipo: 'deleteClient' }, { tipo: 'sendWhatsapp', texto: 'hola' }, 'basura'] }), ctx())
  assert.equal(p.pasos.length, 0)
  assert.deepEqual(p.rechazos.map((r) => r.motivo), ['fuera_de_lista', 'fuera_de_lista', 'fuera_de_lista'])
  const { d, llamadas, auditadas } = deps()
  const r = await ejecutar(p, ctx(), d)
  assert.deepEqual(llamadas, [])
  assert.equal(auditadas.length, 3)
  assert.ok(r.resultados.every((x) => x.resultado === 'rechazado'))
})

test('no pisa datos: el nombre solo se rellena si la ficha no tiene; la fecha de la oportunidad tampoco se pisa', () => {
  const conNombre = planificar(analisis({ acciones: [{ tipo: 'updateContact', nombre: 'José Pérez' }] }), ctx())
  assert.deepEqual(conNombre.rechazos, [{ tipo: 'updateContact', motivo: 'no_pisa_datos' }])
  const sinNombre = planificar(analisis({ acciones: [{ tipo: 'updateContact', nombre: 'José Pérez' }] }), ctx({ cliente: { id: CLIENTE, tipo: 'lead', leadEstado: 'nuevo', fuente: null, nombre: '(sin nombre)' } }))
  assert.deepEqual(sinNombre.pasos, [{ tipo: 'updateContact', nombre: 'José Pérez' }])
  // Un «nombre» que no lo es tampoco se escribe.
  const raro = planificar(analisis({ acciones: [{ tipo: 'updateContact', nombre: '[NOMBRE] 600' }] }), ctx({ cliente: { id: CLIENTE, tipo: 'lead', leadEstado: 'nuevo', fuente: null, nombre: '' } }))
  assert.deepEqual(raro.rechazos, [{ tipo: 'updateContact', motivo: 'nombre_invalido' }])

  const opp = [{ id: OPP_AUTO, ramo: 'auto', estado: 'competencia', fechaFinVigencia: '2026-12-01' }]
  const fecha = planificar(analisis({ acciones: [{ tipo: 'updateOpportunity', ramo: 'auto', fecha_vencimiento: '2027-01-15' }] }), ctx({ oportunidadesAbiertas: opp }))
  assert.deepEqual(fecha.rechazos, [{ tipo: 'updateOpportunity', motivo: 'nada_que_cambiar' }])
  const estado = planificar(analisis({ acciones: [{ tipo: 'updateOpportunity', ramo: 'auto', estado: 'en_negociacion', fecha_vencimiento: '2027-01-15' }] }), ctx({ oportunidadesAbiertas: opp }))
  assert.deepEqual(estado.pasos, [{ tipo: 'updateOpportunity', oportunidadId: OPP_AUTO, estado: { antes: 'competencia', despues: 'en_negociacion' }, fechaFinVigencia: null, infoRiesgo: null }])
  // Estados terminales: ni existen en el enum de la acción.
  const ganar = planificar(analisis({ acciones: [{ tipo: 'updateOpportunity', ramo: 'auto', estado: 'ganada' }] }), ctx({ oportunidadesAbiertas: opp }))
  assert.deepEqual(ganar.rechazos, [{ tipo: 'updateOpportunity', motivo: 'invalida' }])
})

test('no duplica oportunidad: si ya hay una abierta del ramo, ni se intenta; dos en el mismo análisis, una', () => {
  const abierta = planificar(analisis({ acciones: [{ tipo: 'createOpportunity', ramo: 'auto' }] }), ctx({ oportunidadesAbiertas: [{ id: OPP_AUTO, ramo: 'auto', estado: 'en_negociacion', fechaFinVigencia: null }] }))
  assert.deepEqual(abierta.pasos, [])
  assert.deepEqual(abierta.rechazos, [{ tipo: 'createOpportunity', motivo: 'ya_hay_abierta' }])
  const dos = planificar(analisis({ acciones: [{ tipo: 'createOpportunity', ramo: 'hogar' }, { tipo: 'createOpportunity', ramo: 'hogar' }] }), ctx())
  assert.equal(dos.pasos.length, 1)
  assert.deepEqual(dos.rechazos, [{ tipo: 'createOpportunity', motivo: 'ya_hay_abierta' }])
  // Tarea: tampoco si ya hay una pendiente de la IA del mismo tipo.
  const tarea = planificar(analisis({ acciones: [{ tipo: 'createTask', tipo_tarea: 'llamada', descripcion: 'Llamar' }] }), ctx({ tareasIaPendientes: [{ tipo: 'llamada' }] }))
  assert.deepEqual(tarea.rechazos, [{ tipo: 'createTask', motivo: 'ya_existe' }])
})

test('lead_estado solo hacia delante; nunca ganado/perdido; a un cliente no se le toca', () => {
  const atras = planificar(analisis({ acciones: [{ tipo: 'updateLead', lead_estado: 'contactado' }] }), ctx({ cliente: { id: CLIENTE, tipo: 'lead', leadEstado: 'propuesta', fuente: 'web', nombre: 'P' } }))
  assert.deepEqual(atras.rechazos, [{ tipo: 'updateLead', motivo: 'no_avanza' }])
  const adelante = planificar(analisis({ acciones: [{ tipo: 'updateLead', lead_estado: 'cualificado' }] }), ctx())
  assert.deepEqual(adelante.pasos, [{ tipo: 'updateLead', leadEstado: 'cualificado', fuenteWhatsapp: true }])
  const ganado = planificar(analisis({ acciones: [{ tipo: 'updateLead', lead_estado: 'ganado' }] }), ctx())
  assert.deepEqual(ganado.rechazos, [{ tipo: 'updateLead', motivo: 'invalida' }])
  const cliente = planificar(analisis({ acciones: [{ tipo: 'updateLead', lead_estado: 'cualificado' }] }), ctx({ cliente: { id: CLIENTE, tipo: 'cliente', leadEstado: 'nuevo', fuente: null, nombre: 'P' } }))
  assert.deepEqual(cliente.rechazos, [{ tipo: 'updateLead', motivo: 'no_es_lead' }])
})

test('PERSONAL sin ficha → se descarta y se purga; ninguna otra acción se ejecuta', async () => {
  const c = ctx({ cliente: null, estadoConversacion: 'pendiente_clasificar', clientesCandidatos: 0 })
  const p = planificar(analisis({ es_comercial: false, acciones: [{ tipo: 'addConversationNote', texto: 'cena el sábado' }] }), c)
  assert.deepEqual(p.pasos, [{ tipo: 'descartarPersonal' }])
  const { d, llamadas } = deps()
  await ejecutar(p, c, d)
  assert.deepEqual(llamadas, ['descartarPersonal'])
  // Con ficha, «no comercial» no descarta nada (una persona con ficha no se purga por la IA).
  const conFicha = planificar(analisis({ es_comercial: false }), ctx())
  assert.deepEqual(conFicha.pasos, [])
})

test('comercial sin ficha y sin candidatos → lead con el nombre del perfil (si parece un nombre) y luego las acciones', async () => {
  const c = ctx({ cliente: null, estadoConversacion: 'pendiente_clasificar', clientesCandidatos: 0, perfilNombre: 'Ana Gómez' })
  const p = planificar(analisis({ acciones: [{ tipo: 'createOpportunity', ramo: 'auto' }, { tipo: 'updateLead', lead_estado: 'contactado' }] }), c)
  assert.deepEqual(p.pasos.map((x) => x.tipo), ['crearLead', 'createOpportunity', 'updateLead'])
  assert.deepEqual(p.pasos[0], { tipo: 'crearLead', nombre: 'Ana Gómez' })
  const { d, llamadas } = deps()
  const r = await ejecutar(p, c, d)
  assert.equal(r.clienteId, 'nuevo-id')
  assert.deepEqual(llamadas, ['crearLead', 'crearOportunidad', 'actualizarLead'])
  assert.equal(nombreDePerfil('🔥🔥'), null)
  assert.equal(nombreDePerfil('+34 600'), null)
})

test('teléfono compartido por dos fichas → ni lead ni acciones (dos identidades no se funden)', () => {
  const p = planificar(analisis({ acciones: [{ tipo: 'addConversationNote', texto: 'quiere precio' }] }), ctx({ cliente: null, estadoConversacion: 'pendiente_clasificar', clientesCandidatos: 2 }))
  assert.deepEqual(p.pasos, [])
  assert.deepEqual(p.rechazos, [{ tipo: 'addConversationNote', motivo: 'telefono_compartido' }])
})

test('un paso que revienta no tumba los demás ni filtra el mensaje de la excepción', async () => {
  const p = planificar(analisis({ acciones: [{ tipo: 'createTask', tipo_tarea: 'llamada', descripcion: 'Llamar' }, { tipo: 'addConversationNote', texto: 'nota nota' }] }), ctx())
  const { d, auditadas } = deps({ async crearTarea() { throw new Error('valor 600123456 rompió') } })
  const r = await ejecutar(p, ctx(), d)
  assert.deepEqual(r.resultados.map((x) => x.resultado), ['error', 'hecho'])
  assert.ok(!JSON.stringify(auditadas).includes('600123456'))
})

test('la transcripción va redactada y sin el nombre del contacto', () => {
  const t = construirTranscripcion(
    [
      { direccion: 'entrante', texto: 'Soy Ana Gómez, mi DNI 12345678Z y mi móvil 600123456', fecha: new Date('2026-10-05T10:00:00Z') },
      { direccion: 'saliente', texto: 'Perfecto Ana, te llamo', fecha: new Date('2026-10-05T10:05:00Z') },
    ],
    { nombres: ['Ana Gómez'] },
  )
  for (const dato of ['Ana', 'Gómez', '12345678Z', '600123456']) assert.ok(!t.includes(dato), `${dato} en ${t}`)
  assert.ok(t.includes('Contacto:') && t.includes('Corredor:'))
  // Tope de caracteres: se quedan los ÚLTIMOS.
  const muchos = Array.from({ length: 30 }, (_, i) => ({ direccion: 'entrante' as const, texto: `mensaje ${i} ${'x'.repeat(50)}`, fecha: new Date(Date.UTC(2026, 9, 5, 0, i)) }))
  const corta = construirTranscripcion(muchos, { maxCaracteres: 300 })
  assert.ok(corta.length <= 300)
  assert.ok(corta.includes('mensaje 29'))
  assert.ok(!corta.includes('mensaje 0 '))
})

// ── Propuestas b1-b3 (04/11/2026, spec §5, D1/D4) ───────────────────────────────

const RECIBO = '44444444-4444-4444-8444-444444444444'
const RECIBO_2 = '55555555-5555-4555-8555-555555555555'
const RECIBO_NO_VIGOR = '66666666-6666-4666-8666-666666666666'

function ctxCliente(p: Partial<ContextoEjecucion> = {}): ContextoEjecucion {
  return ctx({
    cliente: { id: CLIENTE, tipo: 'cliente', leadEstado: null, fuente: 'cima', nombre: 'Pepe' },
    enVigor: true,
    recibosPendientes: [{ id: RECIBO, ramo: 'auto', situacion: 'devuelto' }],
    saliente: null,
    ...p,
  })
}

test('b1-b3 NUNCA escriben: solo crean la propuesta (ni tarea, ni oportunidad, ni nota)', async () => {
  const plan = planificar(
    analisis({ acciones: [{ tipo: 'proponerFechaCobro', fecha: '2026-10-15' }, { tipo: 'proponerVencimiento', ramo: 'auto', fecha: '2027-03-01' }] }),
    ctxCliente({ oportunidadesAbiertas: [{ id: OPP_AUTO, ramo: 'auto', estado: 'competencia', fechaFinVigencia: null }] }),
  )
  assert.deepEqual(plan.rechazos, [])
  assert.deepEqual(plan.pasos.map((p) => p.tipo), ['proponer', 'proponer'])
  const { d, llamadas } = deps()
  await ejecutar(plan, ctxCliente(), d)
  assert.deepEqual(llamadas, ['crearPropuesta', 'crearPropuesta'])
})

test('b2 «ya lo pagué» → propuesta `pagado` con el recibo del SERVIDOR', () => {
  const plan = planificar(analisis({ acciones: [{ tipo: 'proponerPagado' }] }), ctxCliente())
  assert.deepEqual(plan.pasos, [{ tipo: 'proponer', propuesta: 'pagado', reciboId: RECIBO, oportunidadId: null, fecha: null }])
})

test('IA con id inventado → rechazo (`.strict()`): la IA no da ids', () => {
  const plan = planificar(analisis({ acciones: [{ tipo: 'proponerPagado', recibo_id: RECIBO_2 }, { tipo: 'proponerFechaCobro', fecha: '2026-10-20', reciboId: RECIBO }] }), ctxCliente())
  assert.deepEqual(plan.pasos, [])
  assert.deepEqual(plan.rechazos.map((r) => r.motivo), ['invalida', 'invalida'])
})

test('el recibo del vínculo que NO es de una póliza en vigor de la ficha → rechazo (no cae a otro)', () => {
  const plan = planificar(analisis({ acciones: [{ tipo: 'proponerPagado' }] }), ctxCliente({ saliente: { origen: 'recibo_devuelto', reciboId: RECIBO_NO_VIGOR, oportunidadId: null } }))
  assert.deepEqual(plan.pasos, [])
  assert.equal(plan.rechazos[0].motivo, 'recibo_no_en_vigor')
})

test('el recibo del vínculo manda sobre la ambigüedad; sin vínculo y con dos recibos → ambiguo', () => {
  const dos = [{ id: RECIBO, ramo: 'auto', situacion: 'devuelto' }, { id: RECIBO_2, ramo: 'hogar', situacion: 'pendiente' }]
  const conVinculo = planificar(analisis({ acciones: [{ tipo: 'proponerPagado' }] }), ctxCliente({ recibosPendientes: dos, saliente: { origen: 'recibo_devuelto', reciboId: RECIBO_2, oportunidadId: null } }))
  assert.equal((conVinculo.pasos[0] as { reciboId: string }).reciboId, RECIBO_2)
  const sinVinculo = planificar(analisis({ acciones: [{ tipo: 'proponerPagado' }] }), ctxCliente({ recibosPendientes: dos }))
  assert.equal(sinVinculo.rechazos[0].motivo, 'recibo_ambiguo')
})

test('CEPO D4: ficha SIN póliza en vigor (lead/ex-cliente) o «no se sabe» → ninguna propuesta de RECIBO', () => {
  const acciones = [{ tipo: 'proponerPagado' }, { tipo: 'proponerFechaCobro', fecha: '2026-10-20' }]
  for (const enVigor of [false, null, undefined]) {
    const plan = planificar(analisis({ acciones }), ctxCliente({ enVigor, recibosPendientes: [{ id: RECIBO, ramo: 'auto', situacion: 'devuelto' }] }))
    assert.equal(plan.pasos.length, 0, `enVigor=${enVigor}`)
    assert.deepEqual(plan.rechazos.map((r) => r.motivo), ['sin_poliza_en_vigor', 'sin_poliza_en_vigor'])
  }
})

test('D4 ajustada: vencimiento de un lead SIN póliza en vigor pero con oportunidad abierta del ramo → propuesta', () => {
  const opp = [{ id: OPP_AUTO, ramo: 'auto', estado: 'competencia', fechaFinVigencia: null }]
  for (const enVigor of [false, null, undefined]) {
    const plan = planificar(analisis({ acciones: [{ tipo: 'proponerVencimiento', ramo: 'auto', fecha: '2027-03-01' }] }), ctxCliente({ enVigor, oportunidadesAbiertas: opp }))
    assert.deepEqual(plan.pasos, [{ tipo: 'proponer', propuesta: 'vencimiento', reciboId: null, oportunidadId: OPP_AUTO, fecha: '2027-03-01' }], `enVigor=${enVigor}`)
  }
  // Sin oportunidad abierta del ramo sigue sin haber nada; y con teléfono compartido tampoco.
  const sinOpp = planificar(analisis({ acciones: [{ tipo: 'proponerVencimiento', ramo: 'auto', fecha: '2027-03-01' }] }), ctxCliente({ enVigor: false }))
  assert.deepEqual(sinOpp.rechazos.map((r) => r.motivo), ['sin_oportunidad_abierta'])
  const compartido = planificar(analisis({ acciones: [{ tipo: 'proponerVencimiento', ramo: 'auto', fecha: '2027-03-01' }] }), ctxCliente({ enVigor: false, clientesCandidatos: 2, oportunidadesAbiertas: opp }))
  assert.deepEqual(compartido.rechazos.map((r) => r.motivo), ['ficha_no_unica'])
})

test('D4: a un lead sí se le abre oportunidad (a) aunque no reciba propuestas', () => {
  const plan = planificar(analisis({ acciones: [{ tipo: 'createOpportunity', ramo: 'hogar' }, { tipo: 'proponerPagado' }] }), ctx({ enVigor: false }))
  assert.deepEqual(plan.pasos.map((p) => p.tipo), ['createOpportunity'])
})

test('CEPO una ficha exacta o nada: teléfono compartido, «no se miró» o lead recién creado → ninguna propuesta', () => {
  for (const clientesCandidatos of [2, 0, null]) {
    const plan = planificar(analisis({ acciones: [{ tipo: 'proponerPagado' }] }), ctxCliente({ clientesCandidatos }))
    assert.deepEqual(plan.pasos, [], `candidatos=${clientesCandidatos}`)
    assert.equal(plan.rechazos[0].motivo, 'ficha_no_unica')
  }
  const nuevo = planificar(analisis({ acciones: [{ tipo: 'proponerPagado' }] }), ctxCliente({ cliente: null, estadoConversacion: 'pendiente_clasificar', clientesCandidatos: 0, enVigor: true }))
  assert.deepEqual(nuevo.pasos.map((p) => p.tipo), ['crearLead'])
})

test('b3 vencimiento: oportunidad del vínculo o la única del ramo; fecha pasada o igual → rechazo', () => {
  const opps = [{ id: OPP_AUTO, ramo: 'auto', estado: 'competencia', fechaFinVigencia: '2027-01-01' }]
  const ok = planificar(analisis({ acciones: [{ tipo: 'proponerVencimiento', ramo: 'auto', fecha: '2027-03-01' }] }), ctxCliente({ oportunidadesAbiertas: opps }))
  assert.deepEqual(ok.pasos, [{ tipo: 'proponer', propuesta: 'vencimiento', reciboId: null, oportunidadId: OPP_AUTO, fecha: '2027-03-01' }])
  assert.equal(planificar(analisis({ acciones: [{ tipo: 'proponerVencimiento', ramo: 'auto', fecha: '2026-01-01' }] }), ctxCliente({ oportunidadesAbiertas: opps })).rechazos[0].motivo, 'fecha_pasada')
  assert.equal(planificar(analisis({ acciones: [{ tipo: 'proponerVencimiento', ramo: 'auto', fecha: '2027-01-01' }] }), ctxCliente({ oportunidadesAbiertas: opps })).rechazos[0].motivo, 'nada_que_cambiar')
  assert.equal(planificar(analisis({ acciones: [{ tipo: 'proponerVencimiento', ramo: 'hogar', fecha: '2027-03-01' }] }), ctxCliente({ oportunidadesAbiertas: opps })).rechazos[0].motivo, 'sin_oportunidad_abierta')
})

test('la misma propuesta dos veces en un análisis → una sola', () => {
  const plan = planificar(analisis({ acciones: [{ tipo: 'proponerPagado' }, { tipo: 'proponerPagado' }] }), ctxCliente())
  assert.equal(plan.pasos.length, 1)
  assert.equal(plan.rechazos[0].motivo, 'repetida')
})
