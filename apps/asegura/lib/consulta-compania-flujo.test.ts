// Flujo de las consultas a compañías (15/10/2026, fase 1) con PUERTOS FALSOS: lo que hacen las rutas sin BD ni red.
// Un brazo por aserción. Los cepos (🪤) se han visto fallar rompiendo lo que protegen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  crearBorradores,
  editarBorrador,
  enviarConsulta,
  leerPanel,
  type ConsultaBD,
  type CorreoSaliente,
  type HistorialConsulta,
  type PuertosConsulta,
} from './consulta-compania-flujo.ts'

const CORR = '00000000-0000-4000-8000-000000000001'
const OP = '00000000-0000-4000-8000-0000000000a1'
const CLI = '00000000-0000-4000-8000-0000000000c1'
const DNI = '12345678Z'
const NOMBRE = 'Ana Pérez Gómez'

type Registro = {
  prompts: string[]
  insertadas: Array<{ c: Parameters<PuertosConsulta['insertarBorrador']>[1]; h: HistorialConsulta }>
  correos: CorreoSaliente[]
  enviadas: Array<{ id: string; e: Parameters<PuertosConsulta['marcarEnviada']>[2]; h: HistorialConsulta }>
  liberadas: string[]
  actualizadas: Array<{ id: string; k: Record<string, unknown> }>
}

function falso(o: Partial<PuertosConsulta> & { consultas?: ConsultaBD[] } = {}): { p: PuertosConsulta; r: Registro } {
  const r: Registro = { prompts: [], insertadas: [], correos: [], enviadas: [], liberadas: [], actualizadas: [] }
  const consultas = new Map<string, ConsultaBD>((o.consultas ?? []).map((c) => [c.id, c]))
  let n = 0
  const p: PuertosConsulta = {
    hayTablas: async () => true,
    leerOportunidad: async (_c, id) =>
      id === OP
        ? {
            id: OP, clienteId: CLI, ramo: 'responsabilidad_civil', fechaFinVigencia: '2099-12-01',
            infoRiesgo: { datosRiesgoLibre: { descripcion: 'Bar de tapas', direccion: 'C/ Sol 1', notas: 'llamar a Ana al 600111222', actividad: 'Bar', facturacion: 250000 } },
            polizaCompetencia: { aseguradora: 'Allianz', prima: 900, coberturas: 'RC 300.000€', nPoliza: 'P-999' },
            faltanRamo: [], datosRamo: { descripcion: 'Bar de tapas', direccion: 'C/ Sol 1', notas: 'llamar a Ana al 600111222', actividad: 'Bar', facturacion: 250000 },
          }
        : null,
    companias: async () => [{ codigoDgs: 'C1', nombre: 'Mapfre' }, { codigoDgs: 'C2', nombre: 'Allianz' }, { codigoDgs: 'C3', nombre: 'Axa' }],
    contactos: async () => [
      { id: 'k1', companiaCodigoDgs: 'C1', nombre: 'Luis', cargo: null, area: 'comercial', email: 'luis@mapfre.es', activo: true, orden: 0, ramos: null },
      { id: 'k2', companiaCodigoDgs: 'C1', nombre: 'Eva', cargo: null, area: 'tecnico', email: 'eva@mapfre.es', activo: true, orden: 1, ramos: ['auto'] },
      { id: 'k3', companiaCodigoDgs: 'C3', nombre: 'Raúl', cargo: null, area: 'tecnico', email: 'raul@axa.es', activo: true, orden: 0, ramos: ['responsabilidad_civil'] },
    ],
    documentos: async () => [{ documentoId: 'd1', nombre: 'poliza-allianz.pdf', competencia: true }],
    tomador: async () => ({ nombre: NOMBRE, documento: DNI, documentoLegible: true }),
    listarConsultas: async () => [...consultas.values()],
    leerConsulta: async (_c, id) => consultas.get(id) ?? null,
    insertarBorrador: async (_c, c, h) => {
      r.insertadas.push({ c, h })
      const id = `q${++n}`
      consultas.set(id, { ...c, id, estado: 'borrador', gmailMessageId: null, enviadaAt: null, respondidaAt: null })
      return { id }
    },
    actualizarBorrador: async (_c, id, k) => {
      r.actualizadas.push({ id, k })
      const c = consultas.get(id)
      if (!c) return false
      consultas.set(id, { ...c, ...k })
      return true
    },
    reservarEnvio: async () => true,
    liberarReserva: async (_c, id) => { r.liberadas.push(id) },
    marcarEnviada: async (_c, id, e, h) => {
      r.enviadas.push({ id, e, h })
      const c = consultas.get(id)!
      consultas.set(id, { ...c, estado: 'enviada', enviadaAt: e.enviadaAt.toISOString(), gmailMessageId: e.messageId, asunto: e.asunto, identidadIncluida: e.identidadIncluida })
    },
    leerAdjunto: async () => ({ nombre: 'poliza-allianz.pdf', mime: 'application/pdf', contenido: Buffer.from('%PDF') }),
    redactar: async (prompt) => { r.prompts.push(prompt); return `Hola:\n\nTomador: {{NOMBRE_TOMADOR}} ({{DOC_TOMADOR}})\n\nPedimos precio.` },
    canalDisponible: () => true,
    enviarCorreo: async (c) => { r.correos.push(c); return { messageId: '<abc@mail.gmail.com>' } },
    hoy: () => '2026-10-15',
    ahora: () => new Date('2026-10-15T10:00:00Z'),
    ...o,
  }
  return { p, r }
}

const BORRADOR: ConsultaBD = {
  id: 'q9', clienteId: CLI, oportunidadIds: [OP], companiaCodigoDgs: 'C1', destinatarios: ['k1', 'k2'],
  asunto: 'Consulta RC', cuerpo: `Hola:\n\nTomador: {{NOMBRE_TOMADOR}} ({{DOC_TOMADOR}})\n\nPedimos precio.`,
  estado: 'borrador', codigoRef: 'ASG-AB23', gmailMessageId: null, identidadIncluida: true, competenciaIncluida: false,
  responderAntes: null, adjuntos: [{ documentoId: 'd1', nombre: 'poliza-allianz.pdf', competencia: true }], enviadaAt: null, respondidaAt: null,
}

const PETICION = { destinatarios: ['k1', 'k3'], incluirIdentidad: true, incluirCompetencia: false, adjuntos: [], responderAntes: null, actor: 'humano:x' }

// ─── Panel ──────────────────────────────────────────────────────────────────────

test('panel: sin el SQL → 503 sin_migracion', async () => {
  const { p } = falso({ hayTablas: async () => false })
  const r = await leerPanel(p, CORR, OP)
  assert.equal(r.ok ? 200 : r.status, 503)
})

test('🪤 panel: el DNI entero no cruza el puerto', async () => {
  const { p } = falso({ consultas: [BORRADOR] })
  const r = await leerPanel(p, CORR, OP)
  assert.ok(r.ok && !JSON.stringify(r.valor).includes(DNI))
})

test('panel: el tomador va enmascarado', async () => {
  const { p } = falso()
  const r = await leerPanel(p, CORR, OP)
  assert.deepEqual(r.ok && r.valor.tomador, { nombre: NOMBRE, docEnmascarado: '*****678Z', docLegible: true })
})

test('panel: faltan de otro ramo sin calcular → null (no se sabe), nunca []', async () => {
  const base = falso().p
  const { p } = falso({ leerOportunidad: async (c, id) => { const o = await base.leerOportunidad(c, id); return o && { ...o, ramo: 'hogar', faltanRamo: null } } })
  const r = await leerPanel(p, CORR, OP)
  assert.equal(r.ok && r.valor.faltan, null)
})

test('panel: un borrador con el envío reservado sale como envioSinConfirmar', async () => {
  const { p } = falso({ consultas: [{ ...BORRADOR, gmailMessageId: 'enviando:q9' }] })
  const r = await leerPanel(p, CORR, OP)
  assert.equal(r.ok && r.valor.consultas[0].envioSinConfirmar, true)
})

test('panel: primero las compañías con contactos del ramo (solo ordena)', async () => {
  const { p } = falso()
  const r = await leerPanel(p, CORR, OP)
  assert.deepEqual(r.ok && r.valor.companias.map((c) => c.codigoDgs), ['C3', 'C2', 'C1'])
})

test('panel: un contacto sin clasificar conserva ramos null (nunca «todos»)', async () => {
  const { p } = falso()
  const r = await leerPanel(p, CORR, OP)
  assert.equal(r.ok && r.valor.companias.find((c) => c.codigoDgs === 'C1')!.contactos.find((k) => k.id === 'k1')!.ramos, null)
})

test('panel: RC avisa de los datos mínimos que faltan', async () => {
  const { p } = falso()
  const r = await leerPanel(p, CORR, OP)
  assert.deepEqual(r.ok && r.valor.faltan, ['cnae', 'plantilla', 'siniestralidad3Anios', 'limiteDeseado'])
})

test('panel: responder antes = vencimiento − 15 días', async () => {
  const { p } = falso()
  const r = await leerPanel(p, CORR, OP)
  assert.equal(r.ok && r.valor.responderAntesPropuesta, '2099-11-16')
})

test('panel: oportunidad ajena o inexistente → 404', async () => {
  const { p } = falso()
  const r = await leerPanel(p, CORR, '00000000-0000-4000-8000-0000000000ff')
  assert.equal(r.ok ? 200 : r.status, 404)
})

// ─── Borradores ─────────────────────────────────────────────────────────────────

test('borradores: uno POR COMPAÑÍA', async () => {
  const { p, r } = falso()
  await crearBorradores(p, CORR, OP, PETICION)
  assert.deepEqual(r.insertadas.map((x) => x.c.companiaCodigoDgs), ['C1', 'C3'])
})

test('borradores: varias personas de la misma compañía van juntas', async () => {
  const { p, r } = falso()
  await crearBorradores(p, CORR, OP, { ...PETICION, destinatarios: ['k1', 'k2'] })
  assert.deepEqual(r.insertadas.map((x) => x.c.destinatarios), [['k1', 'k2']])
})

test('borradores: en RC la IA ve los datos mínimos del bloque libre (actividad, facturación)', async () => {
  const { p, r } = falso()
  await crearBorradores(p, CORR, OP, PETICION)
  assert.ok(r.prompts.every((x) => x.includes('Actividad: Bar') && x.includes('250000')))
})

test('editar: un borrador con envío reservado sin confirmar no se edita (409)', async () => {
  const { p, r } = falso({ consultas: [{ ...BORRADOR, gmailMessageId: 'enviando:q9' }] })
  const res = await editarBorrador(p, CORR, 'q9', { asunto: 'otro' })
  assert.equal(res.ok ? 200 : res.status, 409)
  assert.equal(r.actualizadas.length, 0)
})

test('🪤 borradores: el prompt de la IA no lleva identidad ni dirección ni notas', async () => {
  const { p, r } = falso()
  await crearBorradores(p, CORR, OP, PETICION)
  for (const t of [NOMBRE, 'Ana', DNI, 'C/ Sol', '600111222']) assert.ok(r.prompts.every((x) => !x.includes(t)), `«${t}» en el prompt`)
})

test('borradores: sin la casilla de competencia la IA no la ve', async () => {
  const { p, r } = falso()
  await crearBorradores(p, CORR, OP, PETICION)
  assert.ok(r.prompts.every((x) => !x.includes('Allianz')))
})

test('borradores: con la casilla, solo compañía/prima/coberturas (sin nº de póliza)', async () => {
  const { p, r } = falso()
  await crearBorradores(p, CORR, OP, { ...PETICION, incluirCompetencia: true })
  assert.ok(r.prompts.every((x) => x.includes('Allianz por 900,00€') && !x.includes('P-999')))
})

test('borradores: un contacto desconocido → 400 y no se crea nada', async () => {
  const { p, r } = falso()
  const res = await crearBorradores(p, CORR, OP, { ...PETICION, destinatarios: ['k1', 'nadie'] })
  assert.deepEqual([res.ok ? 200 : res.status, r.insertadas.length], [400, 0])
})

test('borradores: sin destinatarios → 400', async () => {
  const { p } = falso()
  const res = await crearBorradores(p, CORR, OP, { ...PETICION, destinatarios: [] })
  assert.equal(res.ok ? 200 : res.status, 400)
})

test('borradores: un adjunto que no es de esta ficha → 400', async () => {
  const { p, r } = falso()
  const res = await crearBorradores(p, CORR, OP, { ...PETICION, adjuntos: ['ajeno'] })
  assert.deepEqual([res.ok ? 200 : res.status, r.insertadas.length], [400, 0])
})

test('borradores: si la IA falla, plantilla (y sigue siendo borrador)', async () => {
  const { p } = falso({ redactar: async () => { throw new Error('sin cupo') } })
  const res = await crearBorradores(p, CORR, OP, PETICION)
  assert.ok(res.ok && res.valor.redaccion.every((x) => x.por === 'plantilla') && res.valor.consultas.every((c) => c.estado === 'borrador'))
})

test('🪤 borradores sin identidad: el cuerpo guardado no lleva marcadores', async () => {
  const { p, r } = falso()
  await crearBorradores(p, CORR, OP, { ...PETICION, incluirIdentidad: false })
  assert.ok(r.insertadas.every((x) => !x.c.cuerpo.includes('{{')))
})

test('borradores: faltar datos mínimos NO bloquea', async () => {
  const { p } = falso()
  const res = await crearBorradores(p, CORR, OP, PETICION)
  assert.equal(res.ok, true)
})

test('borradores: el historial de la oportunidad no lleva nombres', async () => {
  const { p, r } = falso()
  await crearBorradores(p, CORR, OP, PETICION)
  assert.ok(r.insertadas.every((x) => !JSON.stringify(x.h.detalle).includes('Mapfre') && !JSON.stringify(x.h.detalle).includes('Ana')))
})

test('borradores: el DTO devuelto no lleva el DNI entero', async () => {
  const { p } = falso()
  const res = await crearBorradores(p, CORR, OP, PETICION)
  assert.ok(res.ok && !JSON.stringify(res.valor).includes(DNI) && res.valor.consultas[0].cuerpo.includes('*****678Z'))
})

// ─── Editar ─────────────────────────────────────────────────────────────────────

test('editar: una consulta enviada no se edita (409)', async () => {
  const { p } = falso({ consultas: [{ ...BORRADOR, estado: 'enviada' }] })
  const r = await editarBorrador(p, CORR, 'q9', { asunto: 'otro' })
  assert.equal(r.ok ? 200 : r.status, 409)
})

test('🪤 editar: lo que vuelve de la pantalla (enmascarado) se guarda con marcadores', async () => {
  const { p, r } = falso({ consultas: [BORRADOR] })
  await editarBorrador(p, CORR, 'q9', { cuerpo: `Hola:\n\nTomador: ${NOMBRE} (*****678Z)\n\nPedimos precio, gracias.` })
  assert.equal(r.actualizadas[0].k.cuerpo, 'Hola:\n\nTomador: {{NOMBRE_TOMADOR}} ({{DOC_TOMADOR}})\n\nPedimos precio, gracias.')
})

test('editar: un documento enmascarado suelto → 422', async () => {
  const { p } = falso({ consultas: [BORRADOR] })
  const r = await editarBorrador(p, CORR, 'q9', { cuerpo: 'DNI *****999X' })
  assert.equal(r.ok ? 200 : r.status, 422)
})

// ─── Enviar ─────────────────────────────────────────────────────────────────────

test('enviar: sin credenciales de Gmail → 503 canal_no_disponible y no sale nada', async () => {
  const { p, r } = falso({ consultas: [BORRADOR], canalDisponible: () => false })
  const res = await enviarConsulta(p, CORR, 'q9', 'humano:x')
  assert.deepEqual([res.ok ? 'ok' : `${res.status} ${res.estado}`, r.correos.length], ['503 canal_no_disponible', 0])
})

test('enviar: ya enviada → 409 (idempotente)', async () => {
  const { p, r } = falso({ consultas: [{ ...BORRADOR, estado: 'enviada' }] })
  const res = await enviarConsulta(p, CORR, 'q9', 'humano:x')
  assert.deepEqual([res.ok ? 200 : res.status, r.correos.length], [409, 0])
})

test('enviar: otra petición ganó la reserva → 409 y no sale nada', async () => {
  const { p, r } = falso({ consultas: [BORRADOR], reservarEnvio: async () => false })
  const res = await enviarConsulta(p, CORR, 'q9', 'humano:x')
  assert.deepEqual([res.ok ? 200 : res.status, r.correos.length], [409, 0])
})

test('enviar: el SMTP falla → 502 envio_fallido, se libera la reserva y no se marca', async () => {
  const { p, r } = falso({ consultas: [BORRADOR], enviarCorreo: async () => { throw new Error('535 auth') } })
  const res = await enviarConsulta(p, CORR, 'q9', 'humano:x')
  assert.deepEqual([res.ok ? 'ok' : `${res.status} ${res.estado}`, r.liberadas, r.enviadas.length], ['502 envio_fallido', ['q9'], 0])
})

test('enviar: el correo lleva el DNI ENTERO (sustituido en asegura) y el código en el asunto', async () => {
  const { p, r } = falso({ consultas: [BORRADOR] })
  await enviarConsulta(p, CORR, 'q9', 'humano:x')
  assert.ok(r.correos[0].texto.includes(`Tomador: ${NOMBRE} (${DNI})`) && r.correos[0].asunto.startsWith('[ASG-AB23]'))
})

test('enviar: van todos los de la compañía en Para y el adjunto', async () => {
  const { p, r } = falso({ consultas: [BORRADOR] })
  await enviarConsulta(p, CORR, 'q9', 'humano:x')
  assert.deepEqual([r.correos[0].para, r.correos[0].adjuntos.length], [['luis@mapfre.es', 'eva@mapfre.es'], 1])
})

test('🪤 enviar: la respuesta a plataforma no lleva el DNI entero', async () => {
  const { p } = falso({ consultas: [BORRADOR] })
  const res = await enviarConsulta(p, CORR, 'q9', 'humano:x')
  assert.ok(res.ok && !JSON.stringify(res.valor).includes(DNI) && res.valor.estado === 'enviada')
})

test('enviar: historial interno dice «se envió identidad» y el de la oportunidad no lleva nombres', async () => {
  const { p, r } = falso({ consultas: [BORRADOR] })
  await enviarConsulta(p, CORR, 'q9', 'humano:x')
  const h = r.enviadas[0].h
  assert.ok(/Se envió identidad del cliente/.test(h.textoInterno) && !JSON.stringify(h.detalle).match(/Ana|12345678Z|poliza-allianz/))
})

test('🪤 enviar sin identidad: ni nombre ni documento, y consta identidadIncluida=false', async () => {
  const sin = { ...BORRADOR, identidadIncluida: false, cuerpo: 'Hola:\n\nPedimos precio.' }
  const { p, r } = falso({ consultas: [sin] })
  await enviarConsulta(p, CORR, 'q9', 'humano:x')
  assert.ok(!r.correos[0].texto.includes(DNI) && !r.correos[0].texto.includes('Ana') && r.enviadas[0].e.identidadIncluida === false)
})

test('enviar: con identidad y el DNI ilegible → 503 y no sale nada', async () => {
  const { p, r } = falso({ consultas: [BORRADOR], tomador: async () => ({ nombre: NOMBRE, documento: null, documentoLegible: false }) })
  const res = await enviarConsulta(p, CORR, 'q9', 'humano:x')
  assert.deepEqual([res.ok ? 200 : res.status, r.correos.length], [503, 0])
})

test('🪤 enviar: si el SMTP aceptó a alguno y rechazó a otro, SALIÓ: se marca enviada (no se libera para reenviar)', async () => {
  const { p, r } = falso({ consultas: [BORRADOR], enviarCorreo: async () => ({ messageId: '<m@x>', rechazados: ['eva@mapfre.es'] }) })
  const res = await enviarConsulta(p, CORR, 'q9', 'humano:x')
  assert.ok(res.ok)
  assert.equal(r.liberadas.length, 0)
  assert.match(r.enviadas[0].h.textoInterno, /NO aceptó: eva@mapfre\.es/)
})

test('enviar: estado desconocido en BD no rompe el DTO', async () => {
  const { p } = falso({ consultas: [{ ...BORRADOR, estado: 'algo_nuevo' }] })
  const r = await leerPanel(p, CORR, OP)
  assert.equal(r.ok && r.valor.consultas[0].estado, 'algo_nuevo')
})
