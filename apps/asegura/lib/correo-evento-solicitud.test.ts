import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { estadoTrasErrorSolicitud, planSolicitud, validarEntradaEvento, type ItemEvento } from './correo-evento.ts'

// «En la compañía» (20/10/2026): el estado de una solicitud de Occident se casa con la OPORTUNIDAD por su nº.
// Datos inventados del mismo formato que los reales.
const URL_OK = 'https://portaloccident.gco.global/Aplicacion/Paginas/default.aspx?marco=false&urlTransaccion=FE/SGE.Gestion.Proyectos.FE.AccesoProyecto/?idSubscripcio=00170000001'

function entrada(evento: Record<string, unknown>) {
  return validarEntradaEvento({
    mensajeId: '<m1@occidentinforma.com>',
    evento: { compania: 'occident', codigoDgs: 'C0468', tipo: 'solicitud', ilegibles: 0, numeroSolicitud: '170000001', ramo: 'Acc.colec.', tomador: 'ACADEMIA INVENTADA SL', estado: 'PRIMA / PROY * PTE DOCUMENTACION', url: URL_OK, ...evento },
  })
}

test('validarEntradaEvento solicitud: nº normalizado como clave, el TOMADOR no entra en el elemento (no se guarda)', () => {
  const v = entrada({ numeroSolicitud: '00170000001' })
  assert.ok(v.ok)
  const [i] = v.entrada.items
  assert.equal(i.tipo, 'solicitud')
  assert.equal(i.clave, '170000001')
  assert.doesNotMatch(JSON.stringify(i), /ACADEMIA|tomador/)
  assert.equal((i as Extract<ItemEvento, { tipo: 'solicitud' }>).url, URL_OK)
})

test('validarEntradaEvento solicitud: un enlace de otro dominio/protocolo o de otro nº se descarta; un nº raro es ilegible', () => {
  const v = entrada({ url: 'javascript:alert(1)' })
  assert.ok(v.ok)
  assert.equal((v.entrada.items[0] as Extract<ItemEvento, { tipo: 'solicitud' }>).url, null)
  const w = entrada({ url: URL_OK.replace('170000001', '170000002') })
  assert.ok(w.ok)
  assert.equal((w.entrada.items[0] as Extract<ItemEvento, { tipo: 'solicitud' }>).url, null)
  const x = entrada({ numeroSolicitud: 'ABC' })
  assert.ok(x.ok)
  assert.equal(x.entrada.items.length, 0)
  assert.equal(x.entrada.ilegibles, 1)
})

const item = (estado: string | null): Extract<ItemEvento, { tipo: 'solicitud' }> =>
  ({ tipo: 'solicitud', clave: '170000001', numeroSolicitud: '170000001', ramo: 'Acc.colec.', estado, url: URL_OK })
const OP = { id: 'op-1', clienteId: 'cli-1', estado: 'en_negociacion', ramo: 'accidentes', cliente: 'Academia Inventada SL' }

test('planSolicitud: sin oportunidad con ese nº → sin_resolver (bandeja), nada se escribe', () => {
  const p = planSolicitud(item('PRIMA / PROY * PTE DOCUMENTACION'), 'occident', null, { fechaCorreo: '2026-10-19', hoy: '2026-10-20' })
  assert.equal(p.estado, 'sin_resolver')
  assert.match(p.motivo ?? '', /apunta el nº en la oportunidad/)
})

test('planSolicitud: casa + PTE DOCUMENTACION con la oportunidad abierta → nota y tarea para HOY', () => {
  const p = planSolicitud(item('PRIMA / PROY * PTE DOCUMENTACION'), 'occident', OP, { fechaCorreo: '2026-10-19', hoy: '2026-10-20' })
  assert.equal(p.estado, 'aplicado')
  assert.ok(p.estado === 'aplicado' && p.tareaDocumentacion)
  assert.equal(p.tareaDocumentacion.fechaLimite, '2026-10-20')
  assert.equal(p.tareaDocumentacion.observaciones, 'Enviar documentación a Occident — Solicitud 170000001')
  assert.equal(p.detalleHistorial.estado, 'PRIMA / PROY * PTE DOCUMENTACION')
})

test('planSolicitud: otro estado, o la oportunidad ya cerrada → nota sin tarea', () => {
  const a = planSolicitud(item('Caducidad de solicitud'), 'occident', OP, { fechaCorreo: null, hoy: '2026-10-20' })
  assert.ok(a.estado === 'aplicado' && a.tareaDocumentacion === null)
  const b = planSolicitud(item('PRIMA / PROY * PTE DOCUMENTACION'), 'occident', { ...OP, estado: 'ganada' }, { fechaCorreo: null, hoy: '2026-10-20' })
  assert.ok(b.estado === 'aplicado' && b.tareaDocumentacion === null)
  assert.match(b.resumen, /está ganada/)
  const c = planSolicitud(item(null), 'occident', OP, { fechaCorreo: null, hoy: '2026-10-20' })
  assert.ok(c.estado === 'aplicado' && c.tareaDocumentacion === null)
  assert.match(c.resumen, /no reconocido/)
})

test('la nota de la solicitud NO cuenta como contacto (no es whatsapp/llamada/interesado) y es correo_compania', () => {
  const fuente = readFileSync(join(import.meta.dirname, 'correo-evento-bd.ts'), 'utf8')
  assert.match(fuente, /'correo_compania'/)
  assert.doesNotMatch(fuente.slice(fuente.indexOf('async function aplicarSolicitud')), /'(whatsapp|llamada|interesado)'/)
})

test('🪤 aplicarSolicitud: el UPDATE exige el mismo nº de solicitud y la tarea de documentación se serializa con candado', async () => {
  const src = readFileSync(join(import.meta.dirname, 'correo-evento-bd.ts'), 'utf8')
  assert.match(src, /and compania_solicitud_num = \$\{item\.numeroSolicitud\}/)
  const lock = src.indexOf("pg_advisory_xact_lock(hashtext(${`solicitud-doc:${op.id}`}))")
  assert.ok(lock > -1, 'candado por oportunidad')
  const comprobar = src.indexOf('and observaciones = ${t.observaciones}', lock)
  assert.ok(comprobar > lock && src.indexOf('crearTarea(correduriaId, op.id, t, ACTOR_CORREO, undefined, tx)', comprobar) > comprobar, 'candado → comprobar → crear')
})

test('🪤 la tarea de documentación se crea con la MISMA transacción del candado (sin pedir otra conexión al pool)', () => {
  const src = readFileSync(join(import.meta.dirname, 'correo-evento-bd.ts'), 'utf8')
  const lock = src.indexOf('pg_advisory_xact_lock(hashtext(')
  const fin = src.indexOf('}, { timeout: 20_000 })', lock)
  const tramo = src.slice(lock, fin)
  assert.match(tramo, /crearTarea\([^)]*,\s*tx\)/, 'crearTarea recibe el tx de la transacción del candado')
  const seg = readFileSync(join(import.meta.dirname, 'oportunidad-seguimiento.ts'), 'utf8')
  const ct = seg.slice(seg.indexOf('export async function crearTarea('), seg.indexOf('\n}\n', seg.indexOf('export async function crearTarea(')))
  assert.match(ct, /const r = en \? await cuerpo\(en\) : await prismaAsegura\(\)\.\$transaction\(cuerpo\)/, 'con `en` no abre otra transacción')
  assert.match(ct, /anotarEnFicha\([^;]*, en\)/, 'la nota en la ficha también va por `en`')
  const af = seg.slice(seg.indexOf('async function anotarEnFicha('))
  assert.match(af.slice(0, af.indexOf('try {')), /if \(en\) \{ await en\.\$executeRaw\(sql\); return \}/, 'con `en`, la nota va por esa conexión')
})

test('estadoTrasErrorSolicitud: sin nada escrito vuelve a sin_resolver (re-vinculable); con el estado ya aplicado, procesando', () => {
  assert.equal(estadoTrasErrorSolicitud(false), 'sin_resolver')
  assert.equal(estadoTrasErrorSolicitud(true), 'procesando')
})

test('🪤 un error en una solicitud no deja la fila en procesando para siempre: los dos catch usan el progreso', () => {
  const src = readFileSync(join(import.meta.dirname, 'correo-evento-bd.ts'), 'utf8')
  // El progreso se marca justo tras confirmar la transacción del estado y ANTES de la de la tarea.
  const ap = src.slice(src.indexOf('async function aplicarSolicitud('), src.indexOf('async function procesarSolicitud('))
  const marca = ap.indexOf('progreso.estadoAplicado = true')
  assert.ok(marca > ap.indexOf("'correo_compania'") && marca < ap.indexOf('pg_advisory_xact_lock'), 'marca entre el estado y la tarea')
  // vincularSolicitudesPendientes solo coge sin_resolver: por eso el error previo a escribir debe volver ahí.
  const vin = src.slice(src.indexOf('export async function vincularSolicitudesPendientes('))
  assert.match(vin, /tipo = 'solicitud' and estado = 'sin_resolver'/)
  for (const [nombre, tramo] of [
    ['procesarSolicitud', src.slice(src.indexOf('async function procesarSolicitud('), src.indexOf('const VENTANA_VINCULAR_DIAS'))],
    ['vincularSolicitudesPendientes', vin.slice(0, vin.indexOf('return { vinculados }'))],
  ] as const) {
    const c = tramo.slice(tramo.lastIndexOf('} catch (e) {'))
    assert.match(c, /set estado = \$\{estadoTrasErrorSolicitud\(progreso\.estadoAplicado\)\}|const estado = estadoTrasErrorSolicitud\(progreso\.estadoAplicado\)[\s\S]*set estado = \$\{estado\}/, `${nombre}: el catch fija el estado`)
  }
  // En la vinculación, la lectura de la oportunidad tras reservar está DENTRO del try.
  const reserva = vin.indexOf("set estado = 'procesando'")
  assert.ok(vin.indexOf('try {', reserva) < vin.indexOf('oportunidadDeSolicitud(', reserva), 'lectura tras reservar dentro del try')
})
