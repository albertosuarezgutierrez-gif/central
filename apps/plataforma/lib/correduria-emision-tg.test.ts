import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  ACTOR_EMISION_TG, emisionTgActiva, huellaResumen, lineasTrasEmision, prepararResumen, proyectoValido, resultadoEmision, textoResumen,
  type ResumenEmision,
} from './correduria-emision-tg.ts'
import { interpretarEmitir, leerTrasEmision, type VistaImportacion } from './retarificar-asegura.ts'

// Fase 3a (26/09/2026): emitir desde Telegram. Lo puro se prueba de verdad; lo que vive en SQL y en
// el webhook se vigila leyendo el FUENTE, porque ni `tsc` ni el build miran dentro de un `Prisma.sql`.

const POLIZA = '9588dad8-893f-4c27-af63-60a53b755d3b'
const oferta = (quoteId: string, primaEur = 520.97) => ({
  quoteId, compania: 'Allianz', producto: null, modalidad: null, categoria: 'Terceros Ampliado',
  primaEur, primerReciboEur: 241.3, pago: 'Semestral', efecto: '2026-09-29', caduca: '2026-09-29',
})
function vista(extra: Partial<Extract<VistaImportacion, { estado: 'ok' }>> = {}): VistaImportacion {
  return {
    estado: 'ok', projectId: '40000001', tomador: 'coincide', vehiculo: 'coincide', bloqueos: [],
    ofertas: [oferta('Q2024763856')], otras: 19,
    titular: { nombre: 'Ana Ruiz Gil', documento: '…678Z', direccion: 'Calle Sol 3', codigoPostal: '41003' },
    matricula: '1234ABC',
    cuenta: { enmascarada: 'ES91…1332', origen: 'ficha', descripcion: 'la cuenta de la ficha' },
    cuentaAviso: null, cuentaInformada: true,
    direccion: { origen: 'proyecto', texto: 'Calle Sol 3' },
    ...extra,
  }
}
const resumenDe = (v: VistaImportacion, q: string | null = null): ResumenEmision => {
  const p = prepararResumen(POLIZA, v, q)
  assert.equal(p.tipo, 'resumen', JSON.stringify(p))
  return (p as { resumen: ResumenEmision }).resumen
}

test('el interruptor está apagado salvo un «sí» explícito', () => {
  assert.equal(emisionTgActiva(undefined), false)
  assert.equal(emisionTgActiva(''), false)
  assert.equal(emisionTgActiva('0'), false)
  assert.equal(emisionTgActiva('1'), true)
  assert.equal(emisionTgActiva('sí'), true)
})

test('número de proyecto: solo cifras', () => {
  assert.equal(proyectoValido('40000001'), '40000001')
  assert.equal(proyectoValido(40000001), '40000001')
  assert.equal(proyectoValido('4000/../1'), null)
  assert.equal(proyectoValido(''), null)
})

test('un «no coincide» dice qué trae el proyecto (tomador enmascarado y matrícula), no solo que no cuadra', () => {
  const p = prepararResumen(POLIZA, vista({
    tomador: 'distinto', vehiculo: 'distinto',
    bloqueos: ['el tomador del proyecto no es el cliente de esta póliza (DNI distinto)'],
  }), null)
  assert.equal(p.tipo, 'no')
  const m = p.tipo === 'no' ? p.motivo : ''
  assert.match(m, /en el proyecto: tomador Ana Ruiz Gil, documento …678Z; matrícula 1234ABC/)
  // Con todo coincidiendo no se añade nada.
  const b = prepararResumen(POLIZA, vista({ bloqueos: ['esta póliza ya está sustituida'] }), null)
  assert.doesNotMatch(b.tipo === 'no' ? b.motivo : '', /en el proyecto/)
})

test('dirección a medias en Avant2: el resumen enseña la de la ficha; si la ficha tampoco la tiene, no hay botón', () => {
  const r = resumenDe(vista({ direccion: { origen: 'ficha', texto: 'Calle Feria 12' } }))
  assert.deepEqual(r.direccionEmision, { texto: 'Calle Feria 12', origen: 'ficha' })
  const t = textoResumen(r)
  assert.match(t, /Dirección: Calle Feria 12, 41003/)
  assert.match(t, /de la ficha: en Avant2 estaba incompleta/)
  const no = prepararResumen(POLIZA, vista({ direccion: { origen: 'falta', faltan: ['calle', 'número'] } }), null)
  assert.equal(no.tipo, 'no')
  assert.match(no.tipo === 'no' ? no.motivo : '', /dirección del tomador está incompleta.*\(calle, número\)/)
  // Una asegura anterior que no manda `direccion`: se enseña la del proyecto, como antes.
  assert.equal(resumenDe(vista({ direccion: null })).direccionEmision.texto, 'Calle Sol 3')
})

test('sin botón si algo impide emitir o no se ha podido comprobar', () => {
  assert.equal(prepararResumen(POLIZA, vista({ bloqueos: ['el tomador del proyecto no es el cliente'] }), null).tipo, 'no')
  assert.equal(prepararResumen(POLIZA, vista({ tomador: 'sin_dato' }), null).tipo, 'no')
  assert.equal(prepararResumen(POLIZA, vista({ vehiculo: 'distinto' }), null).tipo, 'no')
  assert.equal(prepararResumen(POLIZA, vista({ cuentaInformada: false }), null).tipo, 'no')
  assert.equal(prepararResumen(POLIZA, vista({ titular: null }), null).tipo, 'no')
  assert.equal(prepararResumen(POLIZA, vista({ ofertas: [] }), null).tipo, 'no')
  assert.equal(prepararResumen(POLIZA, { estado: 'sin_configurar', mensaje: 'apagado' }, null).tipo, 'no')
  assert.equal(prepararResumen(POLIZA, { estado: 'error', mensaje: 'red' }, null).tipo, 'no')
})

test('sin cuenta confirmable no hay botón, y se dice por qué (no se teclea IBAN por Telegram)', () => {
  const sinCuenta = prepararResumen(POLIZA, vista({ cuenta: null }), null)
  assert.equal(sinCuenta.tipo, 'no')
  assert.match((sinCuenta as { motivo: string }).motivo, /no tiene cuenta/)
  const caida = prepararResumen(POLIZA, vista({ cuenta: null, cuentaAviso: 'no_comprobada' }), null)
  assert.match((caida as { motivo: string }).motivo, /no se ha podido leer/)
})

test('varios precios emitibles: se pregunta cuál; con quoteId se elige ese', () => {
  const v = vista({ ofertas: [oferta('Q1', 480), oferta('Q2', 520.97)] })
  assert.equal(prepararResumen(POLIZA, v, null).tipo, 'elegir')
  assert.equal(resumenDe(v, 'Q2').quoteId, 'Q2')
  assert.equal(prepararResumen(POLIZA, v, 'Q-otro').tipo, 'no')
})

test('la huella cambia si cambia un céntimo, la fecha o la cuenta; no si solo cambia el orden', () => {
  const base = resumenDe(vista())
  const h = huellaResumen(base)
  assert.equal(huellaResumen({ ...base }), h)
  const reordenado = Object.fromEntries(Object.entries(base).reverse()) as ResumenEmision
  assert.equal(huellaResumen(reordenado), h)
  assert.notEqual(huellaResumen(resumenDe(vista({ ofertas: [oferta('Q2024763856', 520.98)] }))), h)
  assert.notEqual(huellaResumen({ ...base, efecto: '2026-09-30' }), h)
  assert.notEqual(huellaResumen({ ...base, cuenta: { ...base.cuenta, enmascarada: 'ES12…0000' } }), h)
})

test('el resumen lo escribe el servidor: importes en español, datos enmascarados y aviso de irreversible', () => {
  const t = textoResumen(resumenDe(vista()))
  assert.match(t, /520,97€/)
  assert.match(t, /primer recibo 241,30€/)
  assert.match(t, /29\/09\/2026/)
  assert.match(t, /ES91…1332/)
  assert.match(t, /…678Z/)
  assert.match(t, /IRREVERSIBLE/)
  const sinDato = textoResumen(resumenDe(vista({ matricula: null, titular: { nombre: null, documento: null, direccion: null, codigoPostal: null } })))
  assert.match(sinDato, /no consta/)
})

test('resultado: emitida, rechazada o incierta — y nunca se invita a reintentar', () => {
  const url = 'https://x/correduria/poliza/1'
  assert.equal(resultadoEmision({ estado: 'ok', referenciaVendor: 'P-1', acunado: null, cuenta: null, trasEmision: null }, url).estado, 'emitida')
  assert.equal(resultadoEmision({ estado: 'emitido_sin_acunar', mensaje: 'sin DGS' }, url).estado, 'emitida')
  assert.equal(resultadoEmision({ estado: 'faltan_campos', faltan: ['email'], campos: null, mensaje: null, cuenta: null, cuentaAviso: null, confirmar: false }, url).estado, 'rechazada')
  assert.equal(resultadoEmision({ estado: 'sin_configurar', mensaje: 'apagado' }, url).estado, 'rechazada')
  assert.equal(resultadoEmision({ estado: 'en_vuelo', mensaje: 'en curso' }, url).estado, 'incierta')
  const dudas = [
    resultadoEmision({ estado: 'error', motivo: 'red', mensaje: 'corte', crudo: null }, url),
    resultadoEmision({ estado: 'error', motivo: 'asegura_error', mensaje: '502', crudo: null, quizaEmitido: true }, url),
    resultadoEmision({ estado: 'error', motivo: 'respuesta_ilegible', mensaje: '?', crudo: null }, url),
  ]
  for (const d of dudas) {
    assert.equal(d.estado, 'incierta')
    assert.match(d.texto, /NO lo repitas/)
  }
  assert.equal(resultadoEmision({ estado: 'error', motivo: 'asegura_error', mensaje: 'tomador distinto', crudo: null, status: 409, causa: 'otro' }, url).estado, 'rechazada')
})

test('un 500 de asegura sin cuerpo NO es «no se ha emitido»: el Submit pudo salir', () => {
  const url = 'https://x'
  assert.equal(resultadoEmision(interpretarEmitir(500, null), url).estado, 'incierta')
  assert.equal(resultadoEmision(interpretarEmitir(504, { estado: 'error' }), url).estado, 'incierta')
  // Sin status (respuesta construida a mano o vieja): la duda gana.
  assert.equal(resultadoEmision({ estado: 'error', motivo: 'asegura_error', mensaje: 'x', crudo: null }, url).estado, 'incierta')
  // Rechazos limpios, que sí dicen que no se ha emitido:
  assert.equal(resultadoEmision(interpretarEmitir(502, { estado: 'error', causa: 'vendor', mensaje: '400: bad', quizaEmitido: false }), url).estado, 'rechazada')
  assert.equal(resultadoEmision(interpretarEmitir(502, { estado: 'error', causa: 'vendor', mensaje: '500: unknown', quizaEmitido: true }), url).estado, 'incierta')
  assert.equal(resultadoEmision(interpretarEmitir(502, { estado: 'error', causa: 'vendor', mensaje: '?' }), url).estado, 'incierta')
  assert.equal(resultadoEmision(interpretarEmitir(503, { estado: 'error', causa: 'sin_libro', mensaje: 'libro' }), url).estado, 'rechazada')
  assert.equal(resultadoEmision(interpretarEmitir(429, { estado: 'error', causa: 'tope', mensaje: 'tope' }), url).estado, 'rechazada')
  assert.equal(resultadoEmision(interpretarEmitir(409, { estado: 'error', causa: 'otro', mensaje: 'ya sustituida' }), url).estado, 'rechazada')
  assert.equal(resultadoEmision(interpretarEmitir(409, { estado: 'error', causa: 'ya_emitida', mensaje: 'ya' }), url).estado, 'incierta')
})

test('sin prima o sin fecha de efecto no hay botón', () => {
  assert.equal(prepararResumen(POLIZA, vista({ ofertas: [{ ...oferta('Q1'), primaEur: null }] }), null).tipo, 'no')
  assert.equal(prepararResumen(POLIZA, vista({ ofertas: [{ ...oferta('Q1'), efecto: null }] }), null).tipo, 'no')
})

test('un envío anterior sin aclarar de la misma póliza frena el botón, ANTES de guardar otro', () => {
  const prep = tg.slice(tg.indexOf('async function prepararEmision'), tg.indexOf('type FilaEmision'))
  const freno = prep.indexOf("estado IN ('emitiendo', 'incierta')")
  assert.ok(freno > 0)
  assert.ok(freno < prep.indexOf('INSERT INTO correduria_asistente_emision'))
  assert.match(prep, /if \(dudoso !== 0\)/)
})

// ── Cepos sobre el fuente (SQL y webhook) ────────────────────────────────────────────────────────

const fuente = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const tg = fuente('./correduria-asistente-telegram.ts')
const cuerpoBoton = tg.slice(tg.indexOf('export async function emitirDesdeBoton'), tg.indexOf('// ── Botones y notas'))

test('el botón es de un solo uso y caduca: el UPDATE exige propuesta y plazo vivo', () => {
  assert.match(cuerpoBoton, /SET estado = 'emitiendo'[\s\S]*?WHERE id = \$\{id\} AND estado = 'propuesta' AND caduca_at > now\(\)/)
})

test('el interruptor se mira ANTES de gastar el botón', () => {
  assert.ok(cuerpoBoton.indexOf('emisionTgActiva(') > 0)
  assert.ok(cuerpoBoton.indexOf('emisionTgActiva(') < cuerpoBoton.indexOf("SET estado = 'emitiendo'"))
})

test('la huella se compara ANTES de enlazar y de emitir', () => {
  const huella = cuerpoBoton.indexOf('huellaResumen(prep.resumen) !== fila.huella')
  assert.ok(huella > 0)
  assert.ok(huella < cuerpoBoton.indexOf('importarProyectoAsegura('))
  assert.ok(huella < cuerpoBoton.indexOf('emitirAsegura('))
})

test('se emite con la cuenta del resumen y firmado por el asistente; nunca confirma un reintento', () => {
  assert.match(cuerpoBoton, /cuentaConfirmada: fila\.resumen\.cuenta\.enmascarada/)
  assert.match(cuerpoBoton, /actor: ACTOR_EMISION_TG/)
  assert.equal(ACTOR_EMISION_TG, 'agente:asistente-telegram')
  assert.doesNotMatch(tg, /reintentoConfirmado|acunarExistente/)
})

test('un chat ajeno no llega a los botones: el webhook filtra el emisor antes de cas_*', () => {
  const wh = fuente('../app/api/sivra/mensajes/telegram-webhook/route.ts')
  const filtro = wh.indexOf('if (!emisorAutorizado(body))')
  assert.ok(filtro > 0)
  assert.ok(filtro < wh.indexOf("if (prefix === 'cas')"))
  assert.match(wh, /if \(action === 'emitir'\)[\s\S]*?after\(\(\) => emitirDesdeBoton\(arg\)\)/)
  // Y dentro del chat, solo la persona autorizada: el from.id se mira ANTES de emitir.
  const rama = wh.slice(wh.indexOf("if (prefix === 'cas')"))
  assert.ok(rama.indexOf('cb.from?.id') > 0 && rama.indexOf('cb.from?.id') < rama.indexOf('emitirDesdeBoton('))
})

test('tras emitir: el mensaje dice qué pasó con la baja y el correo, y sin dato dice que no lo sabe', () => {
  const ok = lineasTrasEmision({ baja: 'abierta', correo: 'enviado' })
  assert.match(ok, /baja de la póliza anterior está abierta/)
  assert.match(ok, /Se le ha enviado al cliente el correo/)
  assert.match(lineasTrasEmision({ baja: null, correo: 'sin_email' }), /NO se ha avisado al cliente: su ficha no tiene correo/)
  assert.doesNotMatch(lineasTrasEmision({ baja: null, correo: 'sin_email' }), /baja de la póliza/)
  assert.match(lineasTrasEmision(null), /No sé si se ha avisado/)
  assert.match(lineasTrasEmision({ baja: 'sin_datos', correo: null }), /NO se ha podido abrir la baja[\s\S]*No sé si se ha avisado/)
})

test('leerTrasEmision: un valor desconocido cae a null, nunca a «enviado»', () => {
  assert.deepEqual(leerTrasEmision({ baja: 'abierta', correo: 'enviado' }), { baja: 'abierta', correo: 'enviado' })
  assert.deepEqual(leerTrasEmision({ baja: 'raro', correo: 'ok' }), { baja: null, correo: null })
  assert.equal(leerTrasEmision(undefined), null)
})

test('el resumen avisa ANTES de pulsar de que al cliente le llega el correo', () => {
  const src = readFileSync(fileURLToPath(new URL('./correduria-emision-tg.ts', import.meta.url)), 'utf8')
  const t = src.slice(src.indexOf('export function textoResumen'), src.indexOf('// ── Resultado del Submit'))
  assert.match(t, /el cliente recibe un correo con su nuevo seguro/)
})

test('tras emitir: baja ya en marcha, tope de tiempo y corte con el proveedor se cuentan como lo que son', () => {
  assert.match(lineasTrasEmision({ baja: 'en_curso', correo: 'enviado' }), /ya estaba firmada o comunicada/)
  assert.match(lineasTrasEmision({ baja: null, correo: null, enCurso: true }), /siguen en marcha/)
  assert.match(lineasTrasEmision({ baja: 'abierta', correo: 'incierto' }), /pudo salir[\s\S]*ANTES de reenviarlo/)
  assert.match(lineasTrasEmision({ baja: 'abierta', correo: 'no_resuelve' }), /no le lleva a SU ficha/)
  assert.deepEqual(leerTrasEmision({ baja: null, correo: null, enCurso: true }), { baja: null, correo: null, enCurso: true })
})
