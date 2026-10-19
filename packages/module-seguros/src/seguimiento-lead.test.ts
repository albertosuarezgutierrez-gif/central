import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claveHitoSeguimiento, enVentanaSeguimiento, hitoSeguimientoLead, mismoHito, type HiloSeguimiento } from './seguimiento-lead.ts'

// Fechas RELATIVAS a un `ahora` inyectado (nada de reloj real).
const AHORA = new Date('2026-10-21T10:00:00Z') // 12:00 en Madrid
const hace = (horas: number) => new Date(AHORA.getTime() - horas * 3_600_000).toISOString()

const base = (o: Partial<HiloSeguimiento> = {}): HiloSeguimiento => ({
  estadoDatos: 'pedida', ultimaPeticionAt: hace(49), ultimoRecordatorioAt: null, recordatoriosEnviados: 0,
  ultimoContactoClienteAt: null, cerradoPerdidoAt: null, propuestaEnviadaAt: null, propuestaCerrada: null, ...o,
})

test('petición sin contestar: nada antes de 48 h; a las 48 h el 1er recordatorio, anclado al envío', () => {
  assert.equal(hitoSeguimientoLead(base({ ultimaPeticionAt: hace(47) }), AHORA), null)
  const h = hitoSeguimientoLead(base(), AHORA)
  assert.equal(h?.etapa, 'datos_1')
  assert.equal(h?.ancla, hace(49))
  assert.equal(h?.recordatoriosTrasEnvio, 1)
})

test('2º recordatorio a las 72 h del 1º (5 días de la petición) y después «¿cerrar?» a las 48 h del 2º', () => {
  const r1 = base({ ultimaPeticionAt: hace(200), ultimoRecordatorioAt: hace(71), recordatoriosEnviados: 1 })
  assert.equal(hitoSeguimientoLead(r1, AHORA), null)
  const r1b = { ...r1, ultimoRecordatorioAt: hace(73) }
  assert.equal(hitoSeguimientoLead(r1b, AHORA)?.etapa, 'datos_2')
  assert.equal(hitoSeguimientoLead(r1b, AHORA)?.ancla, hace(73))
  const r2 = base({ ultimaPeticionAt: hace(300), ultimoRecordatorioAt: hace(49), recordatoriosEnviados: 2 })
  assert.equal(hitoSeguimientoLead(r2, AHORA)?.etapa, 'datos_cerrar')
})

test('idempotente: el mismo estado da el mismo hito y la misma clave en cada pasada del cron', () => {
  const h = base()
  const a = hitoSeguimientoLead(h, AHORA)!
  const b = hitoSeguimientoLead(h, new Date(AHORA.getTime() + 10 * 60_000))!
  assert.equal(claveHitoSeguimiento('7', a), claveHitoSeguimiento('7', b))
  assert.match(claveHitoSeguimiento('7', a), /^f5:7:datos_1:\d+$/)
})

test('un envío real nuevo (repregunta) reinicia el reloj y los recordatorios de antes no cuentan', () => {
  // Recordatorio viejo (antes de la repregunta): la cadena nueva arranca en 0.
  const h = base({ ultimaPeticionAt: hace(50), ultimoRecordatorioAt: hace(100), recordatoriosEnviados: 2 })
  assert.equal(hitoSeguimientoLead(h, AHORA)?.etapa, 'datos_1')
})

test('el cliente que contesta corta la cadena', () => {
  assert.equal(hitoSeguimientoLead(base({ ultimoContactoClienteAt: hace(10) }), AHORA), null)
  // Contestó ANTES de la última petición (la repregunta es posterior): la cadena sigue.
  assert.equal(hitoSeguimientoLead(base({ ultimoContactoClienteAt: hace(60) }), AHORA)?.etapa, 'datos_1')
})

test('no se sabe = no se avisa (columna sin SQL, sin envío, estado que no espera datos, cerrado)', () => {
  assert.equal(hitoSeguimientoLead(base({ recordatoriosEnviados: null }), AHORA), null)
  assert.equal(hitoSeguimientoLead(base({ ultimaPeticionAt: null }), AHORA), null)
  assert.equal(hitoSeguimientoLead(base({ estadoDatos: 'lista_para_tarificar' }), AHORA), null)
  assert.equal(hitoSeguimientoLead(base({ cerradoPerdidoAt: hace(1) }), AHORA), null)
})

test('propuesta enviada sin aceptar: recordatorio a las 72 h, UNO solo; aceptada o ilegible = nada', () => {
  const p = base({ estadoDatos: 'tarificada', propuestaEnviadaAt: hace(73), propuestaCerrada: false })
  assert.equal(hitoSeguimientoLead({ ...p, propuestaEnviadaAt: hace(71) }, AHORA), null)
  assert.equal(hitoSeguimientoLead(p, AHORA)?.etapa, 'propuesta_1')
  assert.equal(hitoSeguimientoLead({ ...p, propuestaCerrada: true }, AHORA), null)
  assert.equal(hitoSeguimientoLead({ ...p, propuestaCerrada: null }, AHORA), null)
  assert.equal(hitoSeguimientoLead({ ...p, ultimoRecordatorioAt: hace(1), recordatoriosEnviados: 1 }, AHORA), null)
  assert.equal(hitoSeguimientoLead({ ...p, ultimoContactoClienteAt: hace(5) }, AHORA), null)
})

test('mismoHito: otra etapa u otro ancla = ya no toca', () => {
  const h = hitoSeguimientoLead(base(), AHORA)
  assert.equal(mismoHito(h, 'datos_1', hace(49)), true)
  assert.equal(mismoHito(h, 'datos_2', hace(49)), false)
  assert.equal(mismoHito(h, 'datos_1', hace(48)), false)
  assert.equal(mismoHito(null, 'datos_1', hace(49)), false)
})

test('ventana 9-20 h de Madrid (verano UTC+2 e invierno UTC+1)', () => {
  assert.equal(enVentanaSeguimiento(new Date('2026-10-21T06:59:00Z')), false) // 08:59 Madrid
  assert.equal(enVentanaSeguimiento(new Date('2026-10-21T07:00:00Z')), true) // 09:00
  assert.equal(enVentanaSeguimiento(new Date('2026-10-21T17:59:00Z')), true) // 19:59
  assert.equal(enVentanaSeguimiento(new Date('2026-10-21T18:00:00Z')), false) // 20:00
  assert.equal(enVentanaSeguimiento(new Date('2026-12-01T08:00:00Z')), true) // 09:00 invierno
  assert.equal(enVentanaSeguimiento(new Date('2026-12-01T19:30:00Z')), false) // 20:30 invierno
  assert.equal(enVentanaSeguimiento(new Date('2026-12-01T02:00:00Z')), false) // 03:00
})
