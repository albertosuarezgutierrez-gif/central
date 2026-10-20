import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PREFIJO_TAREA_CORREO, campoFechaDedupe, claveNumero, claveTareaDe, elegirSiniestro, elegirSiniestroAcotado, fechaCorreoMadrid, TOPE_SINIESTROS_CANDIDATOS, planItem, resolverPolizaEvento, tareaValida, validarEntradaEvento, validarMarcaRevisado, venceTarea,
  type ContextoItem, type ItemEvento, type PolizaCandidata,
} from './correo-evento.ts'

const HOY = '2026-10-14'

function poliza(p: Partial<PolizaCandidata> = {}): PolizaCandidata {
  return {
    id: 'p1', clienteId: 'c1', numeroPoliza: 'BIDS000001', codigoDgs: 'C0468', aseguradora: 'Occident', importRef: null,
    eiacXmlHash: 'h', estado: 'activa', sustituidaAt: null, ...p,
  }
}

const enVigor = (p = poliza()): ContextoItem['resolucion'] => ({ estado: 'en_vigor', poliza: p })
function ctx(c: Partial<ContextoItem> = {}): ContextoItem {
  return { resolucion: enVigor(), siniestro: null, expediente: null, tareaAbierta: false, fechaCorreo: '2026-10-13', hoy: HOY, ...c }
}

// ── Entrada ──────────────────────────────────────────────────────────────────

test('validarEntradaEvento: exige mensajeId, compañía conocida y SU código DGS (no el que diga quien llama)', () => {
  const evento = { tipo: 'anulacion', compania: 'allianz', codigoDgs: 'C0109', ilegibles: 0, numeroPoliza: '031000000', fechaEfecto: '2026-11-01', motivo: null }
  assert.equal(validarEntradaEvento({ evento }).ok, false)
  assert.equal(validarEntradaEvento({ mensajeId: '<a@b>', evento: { ...evento, compania: 'generali' } }).ok, false)
  assert.equal(validarEntradaEvento({ mensajeId: '<a@b>', evento: { ...evento, codigoDgs: 'C0468' } }).ok, false)
  assert.equal(validarEntradaEvento({ mensajeId: '<a@b>', compania: 'reale', evento }).ok, false)
  const v = validarEntradaEvento({ mensajeId: '<a@b>', evento })
  assert.ok(v.ok)
  assert.equal(v.entrada.items.length, 1)
  assert.equal(v.entrada.items[0].clave, '031000000')
})

test('validarEntradaEvento: una fila rara se CUENTA como ilegible, no se inventa; la misma fila dos veces, una', () => {
  const v = validarEntradaEvento({
    mensajeId: '<m@x>',
    evento: {
      tipo: 'pre_anulacion', compania: 'occident', codigoDgs: 'C0468', ilegibles: 1,
      recibos: [
        { numeroPoliza: 'BIDS000001', idRecibo: '480000001-H', importe: null, fechaLimite: '2026-10-15' },
        { numeroPoliza: 'BIDS000001', idRecibo: '480000001-H', importe: null, fechaLimite: '2026-10-15' },
        { numeroPoliza: '', idRecibo: 'x', importe: null, fechaLimite: null },
        { numeroPoliza: 'BIDS000002', idRecibo: '<script>', importe: null, fechaLimite: null },
      ],
    },
  })
  assert.ok(v.ok)
  assert.equal(v.entrada.items.length, 1)
  assert.equal(v.entrada.ilegibles, 3)
})

test('validarEntradaEvento: el texto libre vuelve a pasar sinDatosSensibles (el puerto no se fía de quien llama)', () => {
  const v = validarEntradaEvento({
    mensajeId: '<m@x>',
    evento: {
      tipo: 'siniestro', compania: 'occident', codigoDgs: 'C0468', ilegibles: 0,
      siniestros: [{ subtipo: 'apertura', numeroSiniestro: '43000001', numeroPoliza: '806000001', ramo: null, fechaOcurrencia: '2026-09-15', fechaAccion: null, accion: 'Pago a cuenta ES9121000418450200051332 de 12345678Z' }],
    },
  })
  assert.ok(v.ok)
  const i = v.entrada.items[0] as Extract<ItemEvento, { tipo: 'siniestro' }>
  assert.doesNotMatch(i.accion ?? '', /ES91|12345678Z/)
})

// ── Resolver la póliza ───────────────────────────────────────────────────────

test('claveNumero: sin separadores ni ceros a la izquierda (Mapfre 0008400000001 = CIMA 8400000001)', () => {
  assert.equal(claveNumero('0008400000001'), claveNumero('8400000001'))
  assert.equal(claveNumero(' bids-000.001 '), 'BIDS000001')
  assert.equal(claveNumero(''), null)
})

test('resolverPolizaEvento: nº + compañía, solo cartera viva; en vigor manda', () => {
  const r = resolverPolizaEvento('BIDS000001', 'occident', 'C0468', [poliza()])
  assert.equal(r.estado, 'en_vigor')
})

test('resolverPolizaEvento: el MISMO nº en otra compañía no casa', () => {
  const r = resolverPolizaEvento('BIDS000001', 'reale', 'C0613', [poliza()])
  assert.deepEqual(r, { estado: 'sin_resolver', motivo: 'no_encontrada' })
})

test('resolverPolizaEvento: sin código DGS se mira el nombre de la aseguradora', () => {
  const r = resolverPolizaEvento('BIDS000001', 'occident', 'C0468', [poliza({ codigoDgs: null, aseguradora: 'OCCIDENT GCO' })])
  assert.equal(r.estado, 'en_vigor')
})

test('resolverPolizaEvento: el volcado histórico (lead) no resuelve', () => {
  const r = resolverPolizaEvento('BIDS000001', 'occident', 'C0468', [poliza({ importRef: 'volcado', eiacXmlHash: null })])
  assert.deepEqual(r, { estado: 'sin_resolver', motivo: 'no_encontrada' })
})

test('resolverPolizaEvento: viva pero anulada → no_en_vigor; dos en vigor → ambigua (nunca se elige una)', () => {
  assert.equal(resolverPolizaEvento('BIDS000001', 'occident', 'C0468', [poliza({ estado: 'anulada' })]).estado, 'no_en_vigor')
  const dos = resolverPolizaEvento('BIDS000001', 'occident', 'C0468', [poliza(), poliza({ id: 'p2', clienteId: 'c2' })])
  assert.deepEqual(dos, { estado: 'sin_resolver', motivo: 'ambigua' })
  assert.deepEqual(resolverPolizaEvento(null, 'occident', 'C0468', [poliza()]), { estado: 'sin_resolver', motivo: 'sin_numero' })
})

// ── Despacho por tipo ────────────────────────────────────────────────────────

const siniestro = (s: Partial<Extract<ItemEvento, { tipo: 'siniestro' }>> = {}): ItemEvento => ({
  tipo: 'siniestro', clave: '43000001', subtipo: 'apertura', numeroSiniestro: '43000001', numeroPoliza: 'BIDS000001', ramo: null,
  fechaOcurrencia: '2026-09-15', fechaAccion: '2026-09-15', accion: 'Apertura de expediente con cargo a póliza', ...s,
})

test('siniestro nuevo en póliza en vigor → se ABRE (origen nuestro, referencia = nº de la compañía)', () => {
  const p = planItem(siniestro(), 'occident', ctx())
  assert.equal(p.estado, 'aplicado')
  assert.ok(p.abrirSiniestro)
  assert.equal(p.abrirSiniestro.referencia, '43000001')
  assert.equal(p.abrirSiniestro.fechaHora, '2026-09-15T12:00:00.000Z')
  assert.ok(p.abrirSiniestro.descripcion.length >= 5)
  assert.match(p.resumen, /siniestro 43000001 abierto/)
})

test('siniestro que ya vino por CIMA → duplicado_cima: SOLO nota, sin abrir ni cambiar estado', () => {
  const p = planItem(siniestro({ subtipo: 'cierre' }), 'occident', ctx({ siniestro: { id: 's1', origen: 'cima', clienteId: 'c1', polizaId: 'p1' } }))
  assert.equal(p.estado, 'duplicado_cima')
  assert.equal(p.abrirSiniestro, null)
  assert.equal(p.tarea, null)
  assert.equal(p.siniestroId, 's1')
  assert.match(p.nota ?? '', /cierre/)
})

test('siniestro nuestro ya en la ficha → nota de seguimiento (aplicado)', () => {
  const p = planItem(siniestro({ subtipo: 'actualizacion' }), 'occident', ctx({ siniestro: { id: 's2', origen: 'gestionado_correduria', clienteId: 'c1', polizaId: 'p1' } }))
  assert.equal(p.estado, 'aplicado')
  assert.equal(p.abrirSiniestro, null)
  assert.ok(p.nota)
})

test('cierre de un siniestro que no tenemos → nota, no se abre uno para cerrarlo', () => {
  const p = planItem(siniestro({ subtipo: 'cierre' }), 'occident', ctx())
  assert.equal(p.abrirSiniestro, null)
  assert.ok(p.nota)
})

test('siniestro sin póliza (tramitador) y sin ficha → sin_resolver: nada en la cartera', () => {
  const p = planItem(siniestro({ numeroPoliza: null }), 'occident', ctx({ resolucion: { estado: 'sin_resolver', motivo: 'sin_numero' } }))
  assert.equal(p.estado, 'sin_resolver')
  assert.equal(p.nota, null)
  assert.equal(p.tarea, null)
  assert.equal(p.abrirSiniestro, null)
  assert.match(p.resumen, /bandeja/)
})

const recibo = (tipo: 'pre_anulacion' | 'impago', fechaLimite: string | null, importe: number | null = null): ItemEvento => ({
  tipo, clave: 'BIDS000001/480000001-H', numeroPoliza: 'BIDS000001', idRecibo: '480000001-H', importe, fechaLimite,
})

test('pre-anulación → nota + llamada ALTA que vence el día límite de la compañía', () => {
  const p = planItem(recibo('pre_anulacion', '2026-10-15'), 'occident', ctx())
  assert.equal(p.estado, 'aplicado')
  assert.ok(p.nota)
  assert.deepEqual([p.tarea?.tipo, p.tarea?.prioridad, p.tarea?.fechaLimite], ['llamada', 'alta', '2026-10-15'])
  assert.ok(p.tarea?.observaciones.startsWith(PREFIJO_TAREA_CORREO))
  assert.match(p.resumen, /vence 15\/10\/2026/)
  assert.equal(p.claveTarea, 'recibo:p1:480000001H')
})

test('impago (Mapfre delega) → tarea; el importe va en formato español', () => {
  const p = planItem(recibo('impago', '2026-10-26', 1494.69), 'mapfre', ctx())
  assert.ok(p.tarea)
  assert.match(p.nota ?? '', /1\.494,69€/)
})

test('un aviso que llega TARDE no crea una tarea en el pasado: vence hoy', () => {
  const p = planItem(recibo('pre_anulacion', '2026-10-01'), 'occident', ctx())
  assert.equal(p.tarea?.fechaLimite, HOY)
  assert.equal(venceTarea(null, HOY, 0), HOY)
  assert.equal(venceTarea(null, HOY, 7), '2026-10-21')
})

test('una tarea por póliza/recibo: con la tarea abierta, solo nota', () => {
  const p = planItem(recibo('impago', '2026-10-26'), 'mapfre', ctx({ tareaAbierta: true }))
  assert.equal(p.tarea, null)
  assert.ok(p.nota)
  // pre-anulación e impago del MISMO recibo comparten llave
  assert.equal(claveTareaDe(recibo('impago', null), 'p1'), claveTareaDe(recibo('pre_anulacion', null), 'p1'))
})

test('pre-anulación de una póliza que CIMA ya da por no vigente → duplicado_cima sin escribir', () => {
  const p = planItem(recibo('pre_anulacion', '2026-10-15'), 'occident', ctx({ resolucion: { estado: 'no_en_vigor', poliza: poliza({ estado: 'anulada' }) } }))
  assert.equal(p.estado, 'duplicado_cima')
  assert.equal(p.nota, null)
  assert.equal(p.tarea, null)
})

test('pre-anulación con póliza no encontrada → sin_resolver (bandeja), sin nota ni tarea', () => {
  const p = planItem(recibo('pre_anulacion', '2026-10-15'), 'occident', ctx({ resolucion: { estado: 'sin_resolver', motivo: 'no_encontrada' } }))
  assert.equal(p.estado, 'sin_resolver')
  assert.equal(p.nota, null)
  assert.equal(p.tarea, null)
})

const anulacion: ItemEvento = { tipo: 'anulacion', clave: '031000000', numeroPoliza: '031000000', fechaEfecto: '2026-11-01', motivo: 'A petición del mediador' }

test('anulación SIN expediente → tarea «confirmar», NUNCA un expediente creado solo', () => {
  const p = planItem(anulacion, 'allianz', ctx())
  assert.equal(p.estado, 'aplicado')
  assert.match(p.tarea?.observaciones ?? '', /no hay expediente/)
  assert.equal(p.tarea?.fechaLimite, '2026-10-16')
  assert.equal(Object.keys(p).includes('crearExpediente'), false)
})

test('anulación CON expediente abierto → la tarea dice cuál y que se confirme', () => {
  const p = planItem(anulacion, 'allianz', ctx({ expediente: { id: 'a1', estado: 'comunicada', fechaEfecto: '2026-11-01' } }))
  assert.match(p.tarea?.observaciones ?? '', /expediente abierto en \/anulaciones \(comunicada\)/)
  assert.match(p.resumen, /hay expediente abierto/)
})

test('anulación de una póliza ya no vigente en CIMA → duplicado_cima, nada que hacer', () => {
  const p = planItem(anulacion, 'allianz', ctx({ resolucion: { estado: 'no_en_vigor', poliza: poliza({ estado: 'anulada' }) } }))
  assert.equal(p.estado, 'duplicado_cima')
  assert.equal(p.tarea, null)
})

test('suplemento → nota + tarea de revisar a 7 días', () => {
  const item: ItemEvento = { tipo: 'suplemento', clave: 'BIDS000001', numeroPoliza: 'BIDS000001', descripcion: 'Regularización de RC', periodoDesde: '2025-06', periodoHasta: '2026-06' }
  const p = planItem(item, 'occident', ctx())
  assert.equal(p.tarea?.fechaLimite, '2026-10-21')
  assert.match(p.tarea?.observaciones ?? '', /Revisar suplemento/)
})

test('toda tarea del plan pasa las reglas de una tarea a mano (validarTarea)', () => {
  for (const item of [recibo('pre_anulacion', '2026-10-01'), recibo('impago', null), anulacion]) {
    const p = planItem(item, 'occident', ctx())
    assert.ok(p.tarea)
    assert.deepEqual(tareaValida(p.tarea, new Date(`${HOY}T12:00:00Z`)), { ok: true })
  }
})

test('ningún texto del plan lleva IBAN ni NIF', () => {
  const items: ItemEvento[] = [siniestro({ accion: 'Apertura' }), recibo('pre_anulacion', '2026-10-15', 20), anulacion]
  for (const i of items) {
    const p = planItem(i, 'occident', ctx())
    const todo = JSON.stringify(p)
    assert.doesNotMatch(todo, /\b[A-Z]{2}\d{2}(?:\s?\d{4}){5}\b/)
    assert.doesNotMatch(todo, /\b\d{8}[A-Z]\b/)
  }
})

// ── Siniestro ya en la cartera: compañía y póliza tienen que cuadrar ──────────

type FilaSin = Parameters<typeof elegirSiniestro>[0][number]
function sin(f: Partial<FilaSin> = {}): FilaSin {
  return {
    id: 's1', origen: 'cima', clienteId: 'c1', polizaId: 'p1', idSiniestroEntidad: '43000001', referencia: null, codigoEntidadDgs: 'C0468',
    poliza: { numeroPoliza: '806000001', codigoDgs: 'C0468', aseguradora: 'Occident' }, ...f,
  }
}

test('elegirSiniestro: con código DGS de la compañía y la misma póliza → casa (CIMA primero)', () => {
  const r = elegirSiniestro([sin({ id: 's2', origen: 'gestionado_correduria' }), sin()], '43000001', 'occident', 'C0468', '806000001')
  assert.deepEqual(r, { estado: 'casa', siniestro: { id: 's1', origen: 'cima', clienteId: 'c1', polizaId: 'p1' } })
})

test('🪤 elegirSiniestro: siniestro SIN código DGS solo casa si SU póliza es de esa compañía', () => {
  const deMapfre = sin({ codigoEntidadDgs: null, poliza: { numeroPoliza: '806000001', codigoDgs: 'C0058', aseguradora: 'Mapfre' } })
  assert.equal(elegirSiniestro([deMapfre], '43000001', 'occident', 'C0468', null).estado, 'ninguno')
  const sinPoliza = sin({ codigoEntidadDgs: null, poliza: null })
  assert.equal(elegirSiniestro([sinPoliza], '43000001', 'occident', 'C0468', null).estado, 'ninguno')
  const porNombre = sin({ codigoEntidadDgs: null, poliza: { numeroPoliza: '806000001', codigoDgs: null, aseguradora: 'Occident Seguros' } })
  assert.equal(elegirSiniestro([porNombre], '43000001', 'occident', 'C0468', null).estado, 'casa')
})

test('🪤 elegirSiniestro: el correo trae OTRA póliza que la del siniestro → poliza_distinta (sin_resolver)', () => {
  assert.equal(elegirSiniestro([sin()], '43000001', 'occident', 'C0468', '547000001').estado, 'poliza_distinta')
  // Mismo nº con otro formato (ceros, puntos) sí es la misma póliza.
  assert.equal(elegirSiniestro([sin()], '43000001', 'occident', 'C0468', '0806.000.001').estado, 'casa')
  const p = planItem(siniestro(), 'occident', ctx({ siniestroPolizaDistinta: true }))
  assert.equal(p.estado, 'sin_resolver')
  assert.equal(p.nota, null)
  assert.equal(p.abrirSiniestro, null)
  assert.match(p.motivo ?? '', /otra póliza/)
})

test('elegirSiniestro: el nº tiene que casar entero (no «contiene»)', () => {
  assert.equal(elegirSiniestro([sin({ idSiniestroEntidad: '943000001' })], '43000001', 'occident', 'C0468', null).estado, 'ninguno')
})

// ── Una nota por aviso repetido (el resumen diario de Occident llega cada día con otro Message-ID) ──

test('campoFechaDedupe: la fecha que distingue un aviso repetido de uno nuevo, por tipo', () => {
  assert.equal(campoFechaDedupe('pre_anulacion'), 'fechaLimite')
  assert.equal(campoFechaDedupe('impago'), 'fechaLimite')
  assert.equal(campoFechaDedupe('anulacion'), 'fechaEfecto')
  assert.equal(campoFechaDedupe('suplemento'), 'periodoHasta')
  assert.equal(campoFechaDedupe('siniestro'), null)
})

// ── Cepos sobre el FUENTE de la BD (lo que tsc no ve) ────────────────────────

const BD = readFileSync(join(import.meta.dirname, 'correo-evento-bd.ts'), 'utf8')

test('la BD reserva la fila ANTES de escribir y con la llave de idempotencia', () => {
  const reserva = BD.indexOf('on conflict (correduria_id, mensaje_id, tipo, clave) do nothing')
  assert.ok(reserva > 0)
  assert.ok(reserva < BD.indexOf('abrirSiniestro(correduriaId'), 'la reserva va antes de abrir el siniestro')
  assert.ok(reserva < BD.indexOf('await anotar(db'), 'la reserva va antes de la primera nota')
  assert.ok(reserva < BD.indexOf('await crearTareaCorreo('), 'la reserva va antes de la tarea')
})

test('la BD no escribe nada en la cartera si el plan es sin_resolver', () => {
  assert.match(BD, /if \(plan\.estado !== 'sin_resolver' && clienteId\)/)
})

test('el SQL crudo no prefija el schema (lo vigila el guardián de aislamiento)', () => {
  assert.doesNotMatch(BD, /seguros\.\w+/)
})

test('la BD resuelve el siniestro con elegirSiniestro (compañía + póliza), no con un «contains» suelto', () => {
  assert.match(BD, /elegirSiniestro(Acotado)?\(/)
  assert.match(BD, /siniestroPolizaDistinta/)
})

test('la BD no repite la nota si ya hay fila aplicada con la misma clave de tarea y la misma fecha', () => {
  const guarda = BD.indexOf('await notaYaAnotada(')
  assert.ok(guarda > 0, 'falta la guarda de nota repetida')
  assert.ok(guarda < BD.indexOf('if (plan.nota && !notaRepetida) await anotar(db'), 'la guarda va antes de anotar')
  assert.match(BD, /e\.estado = 'aplicado' and e\.clave_tarea = \$\{claveTarea\}/)
  assert.match(BD, /is not distinct from \$\{fecha\}/)
  // La primera fila guarda su clave de tarea aunque no cree tarea (solo nota): si no, la siguiente no la ve.
  assert.match(BD, /clave_tarea = \$\{claveGuardada\}/)
})

// ── Fecha del correo en Madrid y límite de candidatos (14/10/2026) ─────────────

test('fechaCorreoMadrid: un correo de las 00:30 de Madrid cae en el día de Madrid, no en el UTC anterior', () => {
  assert.equal(fechaCorreoMadrid('2026-10-13T22:30:00.000Z'), '2026-10-14') // 00:30 CEST del 14
  assert.equal(fechaCorreoMadrid('2026-01-13T23:30:00.000Z'), '2026-01-14') // 00:30 CET del 14
  assert.equal(fechaCorreoMadrid('2026-10-14T10:00:00.000Z'), '2026-10-14')
  assert.equal(fechaCorreoMadrid('2026-10-13'), '2026-10-13') // fecha sola: se respeta
  assert.equal(fechaCorreoMadrid('basura'), null)
  assert.equal(fechaCorreoMadrid(null), null)
})

test('elegirSiniestroAcotado: más candidatos que el tope → no se elige ninguno (nunca uno al azar)', () => {
  const fila = (i: number) => ({
    id: `s${i}`, origen: 'cima', clienteId: 'c', polizaId: 'p', idSiniestroEntidad: '123', referencia: null, codigoEntidadDgs: 'C0468',
    poliza: { numeroPoliza: 'X', codigoDgs: 'C0468', aseguradora: 'Occident' },
  })
  const pocas = Array.from({ length: TOPE_SINIESTROS_CANDIDATOS }, (_, i) => fila(i))
  assert.equal(elegirSiniestroAcotado(pocas, TOPE_SINIESTROS_CANDIDATOS, '123', 'Occident', 'C0468', null).estado, 'casa')
  const muchas = Array.from({ length: TOPE_SINIESTROS_CANDIDATOS + 1 }, (_, i) => fila(i))
  assert.equal(elegirSiniestroAcotado(muchas, TOPE_SINIESTROS_CANDIDATOS, '123', 'Occident', 'C0468', null).estado, 'poliza_distinta')
})

test('validarMarcaRevisado: uuid + booleano estricto, nada se coacciona', () => {
  const id = '0b6c1f7e-3a52-4d7e-9f0a-1c2d3e4f5a6b'
  assert.deepEqual(validarMarcaRevisado({ id, revisado: true }), { ok: true, id, revisado: true })
  assert.deepEqual(validarMarcaRevisado({ id, revisado: false }), { ok: true, id, revisado: false })
  assert.equal(validarMarcaRevisado({ id: 'no-es-uuid', revisado: true }).ok, false)
  assert.equal(validarMarcaRevisado({ id: `${id}; drop`, revisado: true }).ok, false)
  assert.equal(validarMarcaRevisado({ id, revisado: 'true' }).ok, false)
  assert.equal(validarMarcaRevisado({ id, revisado: 1 }).ok, false)
  assert.equal(validarMarcaRevisado({ id }).ok, false)
  assert.equal(validarMarcaRevisado(null).ok, false)
  assert.equal(validarMarcaRevisado([id]).ok, false)
})

test('validarEntradaEvento: anulados por impago (Occident) → una anulación por póliza, SIN fecha de efecto, recibo en el motivo', () => {
  const evento = {
    tipo: 'anulacion', compania: 'occident', codigoDgs: 'C0468', ilegibles: 0, numeroPoliza: null, fechaEfecto: null,
    motivo: '3 recibos anulados por impago (anulación automática)',
    recibos: [
      { numeroPoliza: 'BIDS000001', idRecibo: '480000001-H', fechaAnulacion: '2026-10-15' },
      { numeroPoliza: '8-10.000.001-P', idRecibo: '470000001-H', fechaAnulacion: 'no-es-fecha' },
      { numeroPoliza: 'BIDS000003', idRecibo: '<script>', fechaAnulacion: '2026-10-15' },
    ],
  }
  const v = validarEntradaEvento({ mensajeId: '<m@x>', evento })
  assert.ok(v.ok)
  assert.deepEqual(v.entrada.items, [
    { tipo: 'anulacion', clave: 'BIDS000001/480000001-H', numeroPoliza: 'BIDS000001', idRecibo: '480000001-H', fechaEfecto: null, motivo: 'Recibo 480000001-H anulado por impago el 15/10/2026 (anulación automática)' },
    { tipo: 'anulacion', clave: '8-10.000.001-P/470000001-H', numeroPoliza: '8-10.000.001-P', idRecibo: '470000001-H', fechaEfecto: null, motivo: 'Recibo 470000001-H anulado por impago (anulación automática)' },
  ])
  assert.equal(v.entrada.ilegibles, 1)
  // Sin `recibos` (Allianz y los eventos de antes) se sigue leyendo la póliza única.
  const solo = validarEntradaEvento({ mensajeId: '<m@x>', evento: { ...evento, recibos: undefined, numeroPoliza: 'BIDS000001', fechaEfecto: '2026-11-01' } })
  assert.ok(solo.ok)
  assert.equal(solo.entrada.items.length, 1)
  assert.equal(solo.entrada.items[0].clave, 'BIDS000001')
})

test('planItem: recibo ANULADO por impago → la nota y la tarea hablan del RECIBO, no de la póliza; una tarea por recibo', () => {
  const item: ItemEvento = {
    tipo: 'anulacion', clave: 'BIDS000001/480000001-H', numeroPoliza: 'BIDS000001', idRecibo: '480000001-H', fechaEfecto: null,
    motivo: 'Recibo 480000001-H anulado por impago el 15/10/2026 (anulación automática)',
  }
  const p = planItem(item, 'occident', ctx())
  assert.equal(p.estado, 'aplicado')
  assert.match(p.nota ?? '', /ANULADO POR IMPAGO el recibo 480000001-H/)
  assert.match(p.nota ?? '', /no dice que la póliza esté anulada/)
  assert.doesNotMatch(p.nota ?? '', /ANULACIÓN de la póliza/)
  assert.match(p.tarea?.observaciones ?? '', /anulado por impago el recibo 480000001-H/)
  assert.doesNotMatch(p.tarea?.observaciones ?? '', /expediente|baja/)
  // Otro recibo de la MISMA póliza es otra tarea (y otra nota): la clave lleva el recibo.
  const otro = claveTareaDe({ ...item, clave: 'BIDS000001/480000002-H', idRecibo: '480000002-H' }, 'p1')
  assert.notEqual(claveTareaDe(item, 'p1'), otro)
  // La anulación de PÓLIZA (Allianz) no cambia: misma clave y mismo texto de siempre.
  assert.equal(claveTareaDe(anulacion, 'p1'), 'anulacion:p1')
  assert.match(planItem(anulacion, 'allianz', ctx()).nota ?? '', /ANULACIÓN de la póliza/)
  // Con tarea abierta de ese recibo: solo nota.
  assert.equal(planItem(item, 'occident', ctx({ tareaAbierta: true })).tarea, null)
})
