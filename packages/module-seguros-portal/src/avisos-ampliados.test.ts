import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DIAS_CAPTACION_APORTADA,
  eventosSubidaPrima,
  eventosVencimientoAportada,
  eventosVencimientoAutorizado,
  nombreTitularParaAviso,
  observarPrima,
  primaAportadaObservable,
  primaCarteraObservable,
  TEXTO_SUBIDA_PRIMA,
  TEXTO_VENCIMIENTO_AUTORIZADO,
  textoSubidaPrima,
  type TitularAutorizadoParaAviso,
} from './avisos-ampliados.ts'
import { planificarAvisos, urlPushCima } from './avisos-cima.ts'

const HOY = new Date('2026-10-13T08:00:00Z')
const d = (s: string) => new Date(`${s}T00:00:00Z`)
const masDias = (n: number) => new Date(Date.UTC(2026, 9, 13 + n))

// ─── 1. Vencimiento de aportadas ─────────────────────────────────────────────

const aportada = (extra: Partial<Parameters<typeof eventosVencimientoAportada>[0][number]> = {}) => ({
  id: 'd1',
  ramo: 'hogar',
  compania: 'Mapfre',
  fechaVencimiento: masDias(DIAS_CAPTACION_APORTADA),
  confirmadaPorUsuario: true,
  ...extra,
})

test('aportada a 45 días: avisa con el texto pedido y enlaza a su ficha', () => {
  const [e] = eventosVencimientoAportada([aportada()], HOY, new Set(), true)
  assert.equal(e.tipo, 'vencimiento_aportada')
  assert.equal(e.texto, 'Tu seguro de hogar con Mapfre vence el 27/11/2026. ¿Quieres que te preparemos una comparativa?')
  assert.equal(e.url, '/boveda/anadida/d1')
  assert.equal(e.clave, 'apo-venc:d1:2026-11-27')
})

test('🪤 aportada: ventana FIJA 45→30 días (fuera de ella, nada)', () => {
  assert.equal(eventosVencimientoAportada([aportada({ fechaVencimiento: masDias(46) })], HOY).length, 0)
  assert.equal(eventosVencimientoAportada([aportada({ fechaVencimiento: masDias(30) })], HOY).length, 1)
  // Pasado el último día para oponerse a la prórroga (art. 22 LCS) ya no se ofrece comparativa.
  assert.equal(eventosVencimientoAportada([aportada({ fechaVencimiento: masDias(29) })], HOY).length, 0)
})

test('🪤 aportada sin confirmar o sin fecha: no se avisa (la fecha la adivinó un extractor)', () => {
  assert.equal(eventosVencimientoAportada([aportada({ confirmadaPorUsuario: false })], HOY).length, 0)
  assert.equal(eventosVencimientoAportada([aportada({ fechaVencimiento: null })], HOY).length, 0)
})

test('🪤 aportada con la gestión ya pedida: no se le ofrece otra vez', () => {
  assert.equal(eventosVencimientoAportada([aportada()], HOY, new Set(['d1'])).length, 0)
})

test('🪤 sin consentimiento comercial vigente: el aviso dice el hecho, sin ofrecer la comparativa', () => {
  const [e] = eventosVencimientoAportada([aportada()], HOY)
  assert.equal(e.texto, 'Tu seguro de hogar con Mapfre vence el 27/11/2026.')
  assert.doesNotMatch(e.texto, /comparativa/)
})

test('aportada sin ramo ni compañía: no inventa ninguno', () => {
  const [e] = eventosVencimientoAportada([aportada({ ramo: null, compania: null })], HOY, new Set(), true)
  assert.equal(e.texto, 'Tu seguro vence el 27/11/2026. ¿Quieres que te preparemos una comparativa?')
})

// ─── 2. Subida de prima ──────────────────────────────────────────────────────

const U = 'cartera-bruta-anual|anual'

test('🪤 primera observación = semilla: la prima que ya tenía no es una subida', () => {
  assert.deepEqual(observarPrima(null, { importe: 500, unidad: U }, 10, HOY), { importe: 500, unidad: U, subida: null })
})

test('🪤 sube MÁS del umbral → subida con desde/hasta/%; exactamente el umbral no', () => {
  const r = observarPrima({ importe: 400, unidad: U, subida: null }, { importe: 460, unidad: U }, 10, HOY)
  assert.deepEqual(r?.subida, { desde: 400, hasta: 460, porcentaje: 15, en: HOY })
  const justo = observarPrima({ importe: 400, unidad: U, subida: null }, { importe: 440, unidad: U }, 10, HOY)
  assert.equal(justo?.subida, null)
  assert.equal(justo?.importe, 440)
})

test('el umbral del cliente manda (5% sí avisa lo que con 10% no)', () => {
  const r = observarPrima({ importe: 400, unidad: U, subida: null }, { importe: 430, unidad: U }, 5, HOY)
  assert.ok(r?.subida)
})

test('🪤 unidades distintas (anual → mensual): re-semilla sin avisar', () => {
  const r = observarPrima({ importe: 400, unidad: U, subida: null }, { importe: 600, unidad: 'cartera-bruta-anual|mensual' }, 10, HOY)
  assert.deepEqual(r, { importe: 600, unidad: 'cartera-bruta-anual|mensual', subida: null })
})

test('🪤 cotas: importe < 1€ o > 1.000.000€ no se observa (si no, revienta el CHECK y la identidad se queda sin pushes)', () => {
  assert.equal(observarPrima(null, { importe: 0.004, unidad: U }, 10, HOY), null)
  assert.equal(observarPrima(null, { importe: 0.99, unidad: U }, 10, HOY), null)
  assert.equal(observarPrima({ importe: 400, unidad: U, subida: null }, { importe: 0.5, unidad: U }, 10, HOY), null)
  assert.equal(observarPrima(null, { importe: 2_000_000, unidad: U }, 10, HOY), null)
  assert.equal(observarPrima(null, { importe: Number.NaN, unidad: U }, 10, HOY), null)
  assert.deepEqual(observarPrima(null, { importe: 1, unidad: U }, 10, HOY), { importe: 1, unidad: U, subida: null })
})

test('🪤 subida > 500 % = dato malo: ni se observa ni se avisa (y numeric(7,2) no desborda)', () => {
  assert.equal(observarPrima({ importe: 1, unidad: U, subida: null }, { importe: 999_999, unidad: U }, 10, HOY), null)
  assert.equal(observarPrima({ importe: 100, unidad: U, subida: null }, { importe: 601, unidad: U }, 10, HOY), null)
  const limite = observarPrima({ importe: 100, unidad: U, subida: null }, { importe: 600, unidad: U }, 10, HOY)
  assert.equal(limite?.subida?.porcentaje, 500)
})

test('🪤 null = no se sabe: ni avisa ni pisa lo guardado', () => {
  assert.equal(observarPrima({ importe: 400, unidad: U, subida: null }, null, 10, HOY), null)
  assert.equal(primaCarteraObservable(null), null)
  assert.equal(primaCarteraObservable({ bruta: null, fraccionamiento: 'anual' }), null)
  assert.equal(primaCarteraObservable({ bruta: 0, fraccionamiento: 'anual' }), null)
  assert.equal(primaAportadaObservable({ primaAnual: null, periodicidadPago: 'anual' }), null)
})

test('🪤 prima «dudosa» de CIMA (importe del periodo): no se compara aunque traiga número', () => {
  assert.equal(primaCarteraObservable({ bruta: 73.39, fraccionamiento: 'mensual', dudosa: true }), null)
})

test('cartera y aportada nunca comparten unidad', () => {
  const c = primaCarteraObservable({ bruta: 400, fraccionamiento: 'anual' })
  const a = primaAportadaObservable({ primaAnual: 400, periodicidadPago: 'anual' })
  assert.notEqual(c?.unidad, a?.unidad)
})

test('si el precio vuelve a bajar, la subida pendiente se borra (no se avisa «sube» de algo falso)', () => {
  const pendiente = { importe: 460, unidad: U, subida: { desde: 400, hasta: 460, porcentaje: 15, en: HOY } }
  assert.equal(observarPrima(pendiente, { importe: 410, unidad: U }, 10, HOY)?.subida, null)
  // Mismo importe: nada que escribir, la subida pendiente sigue.
  assert.equal(observarPrima(pendiente, { importe: 460, unidad: U }, 10, HOY), null)
})

test('🔒 pantalla de bloqueo: la subida NO lleva importes, %, ramo ni compañía', () => {
  assert.equal(textoSubidaPrima(), 'Una de tus pólizas sube de precio. Ábrela para ver el detalle.')
  const [e] = eventosSubidaPrima([{ origen: 'cartera', refId: 'p1', ramo: 'hogar', subida: { desde: 1200, hasta: 1380, porcentaje: 15, en: HOY } }])
  assert.equal(e.texto, TEXTO_SUBIDA_PRIMA)
  assert.doesNotMatch(e.texto, /\d|€|%|hogar/i)
})

test('evento de subida: clave con los dos importes y enlace a la ficha según origen', () => {
  const s = { desde: 400, hasta: 460, porcentaje: 15, en: HOY }
  const [c] = eventosSubidaPrima([{ origen: 'cartera', refId: 'p1', ramo: 'auto', subida: s }])
  assert.equal(c.clave, 'prima:cartera:p1:400.00:460.00')
  assert.equal(c.url, '/boveda/poliza/p1')
  const [a] = eventosSubidaPrima([{ origen: 'aportada', refId: 'd1', ramo: null, subida: s }])
  assert.equal(a.url, '/boveda/anadida/d1')
  assert.equal(eventosSubidaPrima([{ origen: 'cartera', refId: 'p2', ramo: null, subida: null }]).length, 0)
})

test('🪤 una subida detectada hace más de 45 días no se manda: se sella en silencio', () => {
  const vieja = { desde: 400, hasta: 460, porcentaje: 15, en: masDias(-60) }
  const ev = eventosSubidaPrima([{ origen: 'cartera', refId: 'p1', ramo: 'auto', subida: vieja }])
  const plan = planificarAvisos([], new Set(), new Set(), HOY, [], [], ev)
  assert.equal(plan.enviar.length, 0)
  assert.equal(plan.sellarSiempre[0].clave, ev[0].clave)
})

// ─── 3. Vencimientos de pólizas autorizadas ──────────────────────────────────

const polizaAjena = (extra: Partial<TitularAutorizadoParaAviso['polizas'][number]> = {}) => ({
  id: 'p9',
  ramo: 'hogar',
  compania: 'Allianz',
  // Fecha accionable = vencimiento − 30 = hoy + 5 → dentro de los 7 días por defecto.
  fechaVencimiento: masDias(35),
  vigencia: 'vigente' as const,
  procedencia: { importRef: null, eiacXmlHash: null },
  ...extra,
})

const titular = (alcances: string[], extra: Partial<TitularAutorizadoParaAviso> = {}): TitularAutorizadoParaAviso => ({
  nombre: 'Carmen López Ruiz',
  tipoPersona: 'fisica',
  autorizacion: { alcances, partes: ['p9'] },
  polizas: [polizaAjena()],
  ...extra,
})

test('Gestión y Total reciben el vencimiento; 🔒 en pantalla de bloqueo SIN nombre del titular ni datos de la póliza', () => {
  for (const nivel of ['gestion', 'total']) {
    const [e] = eventosVencimientoAutorizado([titular([nivel])], HOY, 7)
    assert.equal(e.tipo, 'vencimiento_autorizado', nivel)
    assert.equal(e.texto, 'Vence una póliza de una persona que te dio acceso.')
    assert.equal(e.texto, TEXTO_VENCIMIENTO_AUTORIZADO)
    assert.doesNotMatch(e.texto, /Carmen|López|Hogar|Allianz|\d/)
    assert.equal(e.url, '/boveda/poliza/p9')
  }
})

test('🪤 Consulta (ver / ver_economico / documentos) NO recibe avisos de lo ajeno', () => {
  for (const a of [['ver'], ['ver_economico'], ['documentos'], ['ver', 'ver_economico']]) {
    // `partes` con la póliza A PROPÓSITO: aunque la lista por póliza viniera mal, el nivel corta solo.
    assert.equal(eventosVencimientoAutorizado([titular(a, { autorizacion: { alcances: a, partes: ['p9'] } })], HOY, 7).length, 0, a.join('+'))
  }
})

test('🪤 solo Gestión o Total EXPLÍCITOS: el alcance heredado `partes` (puede dar parte) no recibe el vencimiento', () => {
  for (const tipoPersona of ['fisica', 'juridica'] as const) {
    const t = titular(['partes'], { tipoPersona, autorizacion: { alcances: ['partes'], partes: ['p9'] } })
    assert.equal(eventosVencimientoAutorizado([t], HOY, 7).length, 0, tipoPersona)
  }
})

test('🪤 por PÓLIZA: Total sobre otra póliza no abre el vencimiento de esta', () => {
  const t = titular(['total'], { autorizacion: { alcances: ['total'], partes: ['otra'] } })
  assert.equal(eventosVencimientoAutorizado([t], HOY, 7).length, 0)
})

test('🪤 la vía «dueño» (su empresa) no es una autorización: no avisa por aquí', () => {
  const t = titular(['total'], { autorizacion: { alcances: ['total'], partes: ['p9'], via: 'dueno' } })
  assert.equal(eventosVencimientoAutorizado([t], HOY, 7).length, 0)
})

test('🪤 respeta la antelación DEL AUTORIZADO', () => {
  assert.equal(eventosVencimientoAutorizado([titular(['total'])], HOY, 3).length, 0)
  assert.equal(eventosVencimientoAutorizado([titular(['total'])], HOY, 7).length, 1)
})

test('🪤 sin vencimiento, no vigente o del volcado: nada', () => {
  for (const p of [
    polizaAjena({ fechaVencimiento: null }),
    polizaAjena({ vigencia: 'no_vigente' }),
    polizaAjena({ procedencia: { importRef: 'volcado-2024', eiacXmlHash: null } }),
  ]) {
    assert.equal(eventosVencimientoAutorizado([titular(['total'], { polizas: [p] })], HOY, 7).length, 0)
  }
})

test('🪤 póliza de OTRO tomador donde la ficha solo figura: el acceso no es a ella', () => {
  const p = polizaAjena({ figuraTitular: { roles: ['propietario'], tomador: 'Otro' } })
  assert.equal(eventosVencimientoAutorizado([titular(['total'], { polizas: [p] })], HOY, 7).length, 0)
})

test('nombre del titular: de pila si es persona; entero si es sociedad; vacío → sin nombre', () => {
  assert.equal(nombreTitularParaAviso('  Carmen   López ', 'fisica'), 'Carmen')
  assert.equal(nombreTitularParaAviso('Talleres Ruiz SL', 'juridica'), 'Talleres Ruiz SL')
  assert.equal(nombreTitularParaAviso(' ', 'fisica'), null)
  const [e] = eventosVencimientoAutorizado([titular(['total'], { nombre: '' })], HOY, 7)
  assert.equal(e.texto, TEXTO_VENCIMIENTO_AUTORIZADO)
})

// ─── Plan y enlace ───────────────────────────────────────────────────────────

test('🪤 los tipos nuevos se pueden silenciar (la casilla de /configuracion manda)', () => {
  const ev = eventosVencimientoAutorizado([titular(['total'])], HOY, 7)
  const plan = planificarAvisos([], new Set(), new Set(['vencimiento_autorizado']), HOY, [], [], ev)
  assert.equal(plan.enviar.length, 0)
  assert.equal(plan.sellarSiempre.length, 1)
})

test('lo ya sellado no se repite', () => {
  const ev = eventosVencimientoAportada([aportada()], HOY)
  assert.equal(planificarAvisos([], new Set([ev[0].clave]), new Set(), HOY, [], [], ev).enviar.length, 0)
})

test('la notificación abre la ficha solo si hay UNA novedad', () => {
  const ev = eventosVencimientoAportada([aportada(), aportada({ id: 'd2' })], HOY)
  assert.equal(urlPushCima(ev.slice(0, 1)), '/boveda/anadida/d1')
  assert.equal(urlPushCima(ev), '/boveda')
  assert.equal(urlPushCima([]), '/boveda')
})

test('las fechas son las del día (UTC), no las de la zona del servidor', () => {
  const [e] = eventosVencimientoAportada([aportada({ fechaVencimiento: d('2026-11-27') })], HOY)
  assert.match(e.texto, /27\/11\/2026/)
})
