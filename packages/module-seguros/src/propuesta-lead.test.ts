import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  camposIdd, claveIdd, conInformacionPrevia, declaracionNecesidadesLead, deducirNecesidadesLead, encajeOpcion, huellaPropuesta,
  informacionPreviaMediador, llevaInformacionPrevia, opcionIdd, recomendarOpcion, type OpcionComparada,
} from './propuesta-lead.ts'
import { camposLeibles, leerRespuestaIa, promptExtraerRespuesta, validarValorContrato } from './respuesta-lead.ts'
import { MEDIADOR } from './mediador.ts'
import { preguntasNecesidades } from './necesidades-idd.ts'

const HOY = '2026-10-19'
const AUTO_TODO = {
  idd_uso: 'particular', idd_conductores: 'solo_tomador', idd_modalidad: 'todo_riesgo_franquicia', idd_lunas: 'si',
  idd_asistencia: 'indiferente', idd_sustitucion: 'no', idd_prioridad: 'precio', idd_franquicia: 'si',
}

const op = (clave: string, prima: number, g: Record<string, 'si' | 'no' | 'no_consta'> | null, extra: Partial<OpcionComparada> = {}): OpcionComparada & { enviable: boolean } => ({
  clave, origen: 'rpa', compania: clave.toUpperCase(), producto: null, primaEur: prima, franquiciaEur: 300, firmeza: 'estimado',
  garantias: g, bloqueo: null, caducada: false, enviable: true, ...extra,
})

// ─── Necesidades: lo no respondido NO se inventa ────────────────────────────────────────────────────────────────

test('sin respuestas, ninguna necesidad se da por sabida (no se rellena con «indiferente»)', () => {
  const n = deducirNecesidadesLead('auto', {})
  assert.equal(n.completas, false)
  assert.equal(n.respondidas.length, 0)
  assert.equal(n.faltan.length, preguntasNecesidades('auto').length)
  assert.deepEqual(n.respuestas, {})
  assert.equal(declaracionNecesidadesLead('auto', n), null, 'sin completas no hay declaración que firmar')
})

test('falta UNA necesidad → no completas, y esa sale con su pregunta y opciones', () => {
  const { idd_sustitucion: _quitada, ...casi } = AUTO_TODO
  const n = deducirNecesidadesLead('auto', casi)
  assert.equal(n.completas, false)
  assert.deepEqual(n.faltan.map((f) => f.id), ['sustitucion'])
  assert.ok(n.faltan[0].opciones.length >= 2)
})

test('todas respondidas → completas, y la declaración dice de dónde sale', () => {
  const n = deducirNecesidadesLead('auto', AUTO_TODO)
  assert.equal(n.completas, true)
  assert.ok(n.respondidas.every((r) => r.fuente === 'respuesta'))
  const d = declaracionNecesidadesLead('auto', n)!
  assert.match(d, /Modalidad: todo riesgo con franquicia\./)
  assert.match(d, /Según lo que nos contó por correo/)
})

test('hogar: solo se deduce lo que su dato dice sin ambigüedad, y se marca como deducido', () => {
  const n = deducirNecesidadesLead('hogar', { uso: 'Soy el propietario', ocupacion: 'vivienda habitual', capitalContinente: 120000, capitalContenido: 30000 })
  const por = Object.fromEntries(n.respondidas.map((r) => [r.id, r]))
  assert.equal(por.regimen.valor, 'propietario')
  assert.equal(por.regimen.fuente, 'deducida')
  assert.equal(por.vivienda.valor, 'habitual')
  assert.equal(por.que_asegura.valor, 'ambos')
  // Un solo capital NO es «solo continente».
  const solo = deducirNecesidadesLead('hogar', { capitalContinente: 120000 })
  assert.ok(!solo.respondidas.some((r) => r.id === 'que_asegura'))
  // Ambiguo (nombra las dos) → no se deduce.
  const amb = deducirNecesidadesLead('hogar', { uso: 'propietario pero ahora de inquilino' })
  assert.ok(!amb.respondidas.some((r) => r.id === 'regimen'))
})

test('lo que el cliente RESPONDE manda sobre lo deducido', () => {
  const n = deducirNecesidadesLead('hogar', { uso: 'propietario', idd_regimen: 'inquilino' })
  const r = n.respondidas.find((x) => x.id === 'regimen')!
  assert.equal(r.valor, 'inquilino')
  assert.equal(r.fuente, 'respuesta')
})

test('opcionIdd: solo vale una opción de SU pregunta (por valor, por texto o sí/no booleano)', () => {
  assert.equal(opcionIdd('idd_modalidad', 'todo_riesgo'), 'todo_riesgo')
  assert.equal(opcionIdd('idd_modalidad', 'todo riesgo sin franquicia'), 'todo_riesgo')
  assert.equal(opcionIdd('idd_lunas', true), 'si')
  assert.equal(opcionIdd('idd_modalidad', 'el mejor'), null)
  assert.equal(opcionIdd('idd_inventada', 'si'), null)
  assert.equal(opcionIdd('modalidad', 'todo_riesgo'), null, 'sin prefijo no es una clave IDD')
})

// ─── F2 lee las respuestas IDD como el resto del contrato ───────────────────────────────────────────────────────

test('la lectura de la respuesta incluye las necesidades IDD del ramo, con sus opciones en el prompt', () => {
  const claves = camposLeibles(['auto']).map((c) => c.clave)
  for (const c of camposIdd('auto')) assert.ok(claves.includes(c.clave), c.clave)
  assert.match(promptExtraerRespuesta(['auto'], HOY), /idd_modalidad: .*SOLO una de estas palabras: terceros, terceros_ampliado/)
  assert.equal(validarValorContrato('idd_modalidad', 'nada de eso', HOY).ok, false)
})

test('una respuesta IDD solo cuenta si la cita habla de ESA necesidad (un «sí» suelto no vale)', () => {
  const texto = 'Hola, sí. Quiero todo riesgo con franquicia y que lleve lunas.'
  const l = leerRespuestaIa({
    idd_modalidad: { valor: 'todo_riesgo_franquicia', cita: 'todo riesgo con franquicia' },
    idd_lunas: { valor: 'si', cita: 'que lleve lunas' },
    idd_sustitucion: { valor: 'si', cita: 'Hola, sí' },
  }, { texto, ramos: ['auto'], hoy: HOY })
  assert.equal(l.valores.idd_modalidad, 'todo_riesgo_franquicia')
  assert.equal(l.valores.idd_lunas, 'si')
  assert.ok(!('idd_sustitucion' in l.valores), 'la cita no habla de vehículo de sustitución')
  assert.ok(!l.invalidos.some((x) => x.clave.startsWith('idd_')), 'una respuesta IDD dudosa no es «dato inválido»')
})

// ─── Encaje y recomendación ─────────────────────────────────────────────────────────────────────────────────────

const N_AUTO = deducirNecesidadesLead('auto', AUTO_TODO)

test('encaje: un todo riesgo pedido exige daños propios AFIRMADOS; «no consta» no encaja', () => {
  const tr = op('a', 400, { danos_propios: 'si', lunas: 'si' })
  const nc = op('b', 300, { danos_propios: 'no_consta', lunas: 'si' })
  const sin = op('c', 250, null)
  assert.equal(encajeOpcion('auto', tr, N_AUTO).encaja, true)
  assert.deepEqual(encajeOpcion('auto', nc, N_AUTO).falla, ['no consta daños propios (todo riesgo)'])
  assert.equal(encajeOpcion('auto', sin, N_AUTO).encaja, false)
})

test('encaje: bloqueo anunciado o caducada no encajan; sin necesidades completas no encaja nada', () => {
  const g = { danos_propios: 'si' as const, lunas: 'si' as const }
  assert.equal(encajeOpcion('auto', op('a', 400, g, { bloqueo: 'INCENDIO-ROBO SIN DAÑOS' }), N_AUTO).encaja, false)
  assert.equal(encajeOpcion('auto', op('a', 400, g, { caducada: true }), N_AUTO).encaja, false)
  assert.equal(encajeOpcion('auto', op('a', 400, g), deducirNecesidadesLead('auto', {})).encaja, false)
})

test('encaje: «sin franquicia» exige franquicia 0 conocida (null = no consta)', () => {
  const n = deducirNecesidadesLead('auto', { ...AUTO_TODO, idd_modalidad: 'todo_riesgo', idd_franquicia: 'no' })
  const g = { danos_propios: 'si' as const, lunas: 'si' as const }
  assert.equal(encajeOpcion('auto', op('a', 400, g, { franquiciaEur: 0 }), n).encaja, true)
  assert.equal(encajeOpcion('auto', op('a', 400, g, { franquiciaEur: null }), n).encaja, false)
  assert.equal(encajeOpcion('auto', op('a', 400, g, { franquiciaEur: 300 }), n).encaja, false)
})

test('recomendación: prioridad precio → la más barata de las que ENCAJAN y son enviables', () => {
  const g = { danos_propios: 'si' as const, lunas: 'si' as const }
  const r = recomendarOpcion('auto', [
    op('cara', 500, g),
    op('barata', 380, g),
    op('mas_barata_no_encaja', 200, { danos_propios: 'no', lunas: 'si' }),
    op('mas_barata_avant2', 100, g, { enviable: false }),
  ], N_AUTO)
  assert.equal(r?.clave, 'barata')
  assert.match(r!.justificacion, /precio/)
})

test('recomendación: prioridad coberturas → la más completa; sin ninguna que encaje → null', () => {
  const n = deducirNecesidadesLead('auto', { ...AUTO_TODO, idd_prioridad: 'coberturas' })
  const r = recomendarOpcion('auto', [
    op('basica', 300, { danos_propios: 'si', lunas: 'si' }),
    op('completa', 450, { danos_propios: 'si', lunas: 'si', robo: 'si', incendio: 'si' }),
  ], n)
  assert.equal(r?.clave, 'completa')
  assert.equal(recomendarOpcion('auto', [op('x', 100, { danos_propios: 'no' })], n), null)
  assert.equal(recomendarOpcion('auto', [op('x', 100, { danos_propios: 'si', lunas: 'si' })], deducirNecesidadesLead('auto', {})), null)
})

// ─── Huella ─────────────────────────────────────────────────────────────────────────────────────────────────────

test('huella: cambia con un precio nuevo, otra prima o una necesidad respondida; no con el orden', () => {
  const a = op('a', 400, null)
  const b = op('b', 300, null)
  const h = huellaPropuesta([a, b], {})
  assert.equal(huellaPropuesta([b, a], {}), h)
  assert.notEqual(huellaPropuesta([a, b, op('c', 350, null)], {}), h)
  assert.notEqual(huellaPropuesta([a, { ...b, primaEur: 301 }], {}), h)
  assert.notEqual(huellaPropuesta([a, b], { lunas: 'si' }), h)
})

// ─── Información previa del mediador ────────────────────────────────────────────────────────────────────────────

test('información previa: sale de MEDIADOR y se añade SIEMPRE si falta algo; no se duplica', () => {
  const info = informacionPreviaMediador()
  assert.ok(info.includes(MEDIADOR.identidad.claveDgsfp))
  assert.ok(llevaInformacionPrevia(info))
  const sin = 'Hola Juan: te mando la propuesta.'
  const con = conInformacionPrevia(sin)
  assert.ok(llevaInformacionPrevia(con))
  assert.equal(conInformacionPrevia(con), con, 'idempotente')
  // Solo el pie corto (DGSFP sin independencia ni remuneración) NO basta.
  assert.ok(!llevaInformacionPrevia(`${sin}\n${MEDIADOR.identidad.claveDgsfp}`))
  assert.ok(llevaInformacionPrevia(conInformacionPrevia(`${sin}\n${MEDIADOR.identidad.claveDgsfp}`)))
})

test('claveIdd es estable (lo usan F2 al guardar y F4 al leer)', () => {
  assert.equal(claveIdd('modalidad'), 'idd_modalidad')
})
