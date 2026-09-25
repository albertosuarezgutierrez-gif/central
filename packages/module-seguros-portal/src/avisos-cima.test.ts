import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DIAS_NOVEDAD,
  claveBase,
  eventosDePolizas,
  planificarAvisos,
  textoPushCima,
  type PolizaParaAviso,
} from './avisos-cima.ts'
import { tramitacionSiniestro } from './siniestro-tramitacion.ts'

const HOY = new Date('2026-09-25T12:00:00Z')
const d = (s: string) => new Date(`${s}T00:00:00Z`)
const NADA = new Set<string>()

function poliza(extra: Partial<PolizaParaAviso> = {}): PolizaParaAviso {
  return {
    id: 'p1',
    ramo: 'Hogar',
    compania: 'Allianz',
    recibos: [{ situacion: 'devuelto', fechaEmision: d('2021-03-01'), fechaVencimiento: d('2021-04-01') }],
    siniestros: [],
    ...extra,
  }
}

function sembrar(p: PolizaParaAviso): Set<string> {
  return new Set(planificarAvisos([p], NADA, NADA, HOY).sellarSiempre.map((s) => s.clave))
}

const siniestro = (extra: Record<string, unknown> = {}) => ({
  id: 's1',
  estado: 'abierto',
  fechaHora: d('2026-09-20'),
  tramitacion: null,
  ...extra,
})

test('🚨 semilla: la primera pasada sobre una póliza NO envía nada, lo sella todo', () => {
  // Sin esto, el primer día le llega al cliente cada recibo devuelto de hace años.
  const reciente = poliza({ recibos: [{ situacion: 'devuelto', fechaEmision: d('2026-09-20'), fechaVencimiento: null }] })
  const plan = planificarAvisos([reciente], NADA, NADA, HOY)
  assert.equal(plan.enviar.length, 0)
  const claves = plan.sellarSiempre.map((s) => s.clave)
  assert.ok(claves.includes(claveBase('p1', 'recibos')))
  assert.ok(claves.some((c) => c.endsWith(':devuelto')))
})

test('🚨 la semilla es POR LISTA: abrir los siniestros después (Solo ver → Acceso total) no avisa del historial', () => {
  const sinVerSiniestros = poliza({ siniestros: null })
  const selladas = sembrar(sinVerSiniestros)
  assert.ok(!selladas.has(claveBase('p1', 'siniestros')), 'una lista no visible no siembra')
  const conAcceso = poliza({ siniestros: [siniestro()] })
  const plan = planificarAvisos([conAcceso], selladas, NADA, HOY)
  assert.equal(plan.enviar.length, 0)
})

test('con la póliza ya sembrada, lo nuevo se envía y lo sellado no se repite', () => {
  const selladas = sembrar(poliza())
  const nuevo = poliza({
    recibos: [
      { situacion: 'devuelto', fechaEmision: d('2021-03-01'), fechaVencimiento: d('2021-04-01') },
      { situacion: 'emitido', fechaEmision: d('2026-09-20'), fechaVencimiento: d('2026-10-01') },
    ],
  })
  const plan = planificarAvisos([nuevo], selladas, NADA, HOY)
  assert.deepEqual(plan.enviar.map((e) => e.tipo), ['recibo_nuevo'])
  assert.equal(plan.sellarSiempre.length, 0)
})

test('⏳ lo que tiene fecha propia vieja se sella sin avisar aunque la póliza esté sembrada', () => {
  // CIMA rellenando a posteriori la tramitación de un siniestro de hace un año.
  const selladas = sembrar(poliza({ siniestros: [] }))
  const viejo = new Date(HOY.getTime() - (DIAS_NOVEDAD + 1) * 86_400_000)
  const plan = planificarAvisos([poliza({ siniestros: [siniestro({ fechaHora: viejo })] })], selladas, NADA, HOY)
  assert.equal(plan.enviar.length, 0)
  assert.ok(plan.sellarSiempre.some((s) => s.clave === 'sin:s1'))
})

test('un recibo que pasa de pendiente a devuelto avisa del devuelto (clave distinta)', () => {
  const r = (situacion: string) => [{ situacion, fechaEmision: d('2026-09-01'), fechaVencimiento: d('2026-09-15') }]
  const selladas = sembrar(poliza({ recibos: r('pendiente') }))
  const plan = planificarAvisos([poliza({ recibos: r('devuelto') })], selladas, NADA, HOY)
  assert.deepEqual(plan.enviar.map((e) => e.tipo), ['recibo_devuelto'])
})

test('un tipo silenciado se sella sin enviar (al reactivarlo no llega el atasco)', () => {
  const selladas = sembrar(poliza({ recibos: [] }))
  const devuelto = poliza({ recibos: [{ situacion: 'devuelto', fechaEmision: d('2026-09-20'), fechaVencimiento: null }] })
  const plan = planificarAvisos([devuelto], selladas, new Set(['recibo_devuelto']), HOY)
  assert.equal(plan.enviar.length, 0)
  assert.ok(plan.sellarSiempre.some((s) => s.tipo === 'recibo_devuelto'))
})

test('🔒 sin permiso (recibos/siniestros a null) no hay eventos', () => {
  assert.deepEqual(eventosDePolizas([poliza({ recibos: null, siniestros: null })]), [])
})

test('recibo sin ninguna fecha no se avisa: no se podría reconocer en la pasada siguiente', () => {
  assert.deepEqual(eventosDePolizas([poliza({ recibos: [{ situacion: 'devuelto', fechaEmision: null, fechaVencimiento: null }] })]), [])
})

test('cobrado y anulado no avisan', () => {
  const r = (situacion: string) => ({ situacion, fechaEmision: d('2026-09-01'), fechaVencimiento: null })
  assert.deepEqual(eventosDePolizas([poliza({ recibos: [r('cobrado'), r('anulado')] })]), [])
})

test('siniestro: alta, cambio de estado y pasos de la tramitación son eventos distintos', () => {
  const tramitacion = tramitacionSiniestro({
    situaciones: null,
    acciones: [{ accion: 'PE', situacion: 'EC', fecha: '2026-09-20' }],
    pagos: null,
    totalPagos: null,
    indemnizacion: null,
  })
  const claves = eventosDePolizas([poliza({ recibos: [], siniestros: [siniestro({ estado: 'en_tramitacion', tramitacion })] })]).map((e) => e.clave)
  assert.equal(claves[0], 'sin:s1')
  assert.equal(claves[1], 'sin:s1:estado:en_tramitacion')
  assert.equal(claves.length, 2 + (tramitacion?.pasos.length ?? 0))
})

test('🔑 la clave de un paso es el código en bruto: cambiar la traducción no la cambia', () => {
  const paso = { fecha: '2026-09-20', tipo: 'accion' as const, codigo: 'PE:EC', texto: 'Peritación: en curso', importe: null }
  const clave = (texto: string) =>
    eventosDePolizas([poliza({ recibos: [], siniestros: [siniestro({ tramitacion: { pasos: [{ ...paso, texto }], totalPagado: null, indemnizacion: null } })] })])
      .map((e) => e.clave)
      .find((c) => c.includes(':accion:'))
  assert.equal(clave('Peritación: en curso'), clave('Visita del perito (en marcha)'))
})

test('🔒 el texto no lleva importes, ni el TIPO de siniestro (puede ser un dato de salud)', () => {
  const s = {
    id: 's1',
    estado: 'cerrado',
    fechaHora: d('2026-09-20'),
    tipoLegible: 'Fallecimiento - Deceso',
    tramitacion: {
      pasos: [{ fecha: '2026-09-20', tipo: 'pago' as const, codigo: 'TA:1234.5', texto: 'Pago de la compañía al taller', importe: 1234.5 }],
      totalPagado: 1234.5,
      indemnizacion: 1234.5,
    },
  }
  for (const e of eventosDePolizas([poliza({ siniestros: [s] })])) {
    assert.ok(!/\d+[.,]\d{2}|€|1234/.test(e.texto), e.texto)
    assert.ok(!/fallecimiento|deceso/i.test(e.texto), e.texto)
  }
})

test('varias novedades = una sola notificación, y el devuelto va delante', () => {
  const eventos = eventosDePolizas([
    poliza({
      recibos: [
        { situacion: 'emitido', fechaEmision: d('2026-09-20'), fechaVencimiento: null },
        { situacion: 'devuelto', fechaEmision: d('2026-08-20'), fechaVencimiento: null },
      ],
    }),
  ])
  const t = textoPushCima(eventos)!
  assert.equal(t.title, 'Novedades en tus seguros')
  assert.match(t.body, /^Se ha devuelto/)
  assert.match(t.body, /1 novedad más/)
  assert.equal(textoPushCima([]), null)
})

test('póliza de otra persona (autorizada): el texto no dice «tu»', () => {
  const eventos = eventosDePolizas([poliza({ ajena: true, siniestros: [siniestro({ estado: 'cerrado' })] })])
  for (const e of eventos) assert.ok(!/\btu\b/i.test(e.texto), e.texto)
  assert.match(eventos[0].texto, /que sigues/)
})
