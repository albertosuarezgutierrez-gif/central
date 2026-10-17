// Bots del tarificador por texto libre en Telegram (15/10/2026): interpretación, lista blanca, tope y botones. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  atascoSigueIgual, candidatasBots, casarCandidatoAtasco, companiasParaRamo, decidirBotonBots, dentroDeTopeBots, esParaBots,
  leerPropuesta, pideAccionProhibida, remitenteAutorizadoBots, systemBots, bloqueSupuestosBots, conBloqueSupuestosBots, TOPE_BOTS_EUR, TOPE_BOTS_LLAMADAS, trabajoBotsParaIA,
  type CandidatoAtascoTg, type OportunidadBots,
} from './correduria-bots-tg.ts'
import { clasificarDestino, ocultarDatosPersonales, restaurarDatosOcultos } from './correduria-asistente.ts'

const ID = '11111111-1111-4111-8111-111111111111'
const ID2 = '22222222-2222-4222-8222-222222222222'

test('esParaBots: los tres ejemplos de Alberto entran; Avant2 y el contable no', () => {
  assert.equal(esParaBots('prueba Allianz en la oportunidad del Hyundai de Manuel'), true)
  assert.equal(esParaBots('el campo atascado es la matrícula'), true)
  assert.equal(esParaBots('¿Cómo va el precio de Manuel?'), true)
  assert.equal(esParaBots('pide precio de la moto de Pablo'), false)
  assert.equal(esParaBots('gasto de 30€ en gasolina'), false)
  assert.equal(esParaBots('pásame el botón de la factura'), false)
})

test('clasificarDestino: un texto de atasco va a la correduría (no al contable ni a la IA clasificadora)', () => {
  assert.equal(clasificarDestino('el campo atascado es la matrícula'), 'correduria')
  assert.equal(clasificarDestino('¿cómo va el precio de Manuel?'), 'correduria')
})

test('pideAccionProhibida: emitir, contratar, pagar, grabar póliza o enviar a terceros', () => {
  for (const t of ['prueba Allianz y emítela', 'contrata la de Mapfre', 'paga el recibo', 'graba la póliza de Manuel', 'mándale el precio a Manuel', 'envíaselo por WhatsApp', 'lanza Mapfre y mándalo por correo']) {
    assert.equal(pideAccionProhibida(t), true, t)
  }
  for (const t of ['el campo atascado es la forma de pago', 'prueba Allianz en la oportunidad del Hyundai de Manuel', 'mándame cómo va el precio', 'el campo es el email']) {
    assert.equal(pideAccionProhibida(t), false, t)
  }
})

test('tope: fail-closed sin recuento, corta en 12 llamadas o 0,50€, deja pasar por debajo', () => {
  assert.equal(dentroDeTopeBots(null).ok, false)
  assert.equal(dentroDeTopeBots({ llamadas: Number.NaN, eur: 0 }).ok, false)
  assert.equal(dentroDeTopeBots({ llamadas: TOPE_BOTS_LLAMADAS, eur: 0 }).ok, false)
  assert.equal(dentroDeTopeBots({ llamadas: 0, eur: TOPE_BOTS_EUR }).ok, false)
  assert.equal(dentroDeTopeBots({ llamadas: TOPE_BOTS_LLAMADAS - 1, eur: TOPE_BOTS_EUR - 0.01 }).ok, true)
  const t = dentroDeTopeBots({ llamadas: 99, eur: 0 })
  assert.ok(!t.ok && /tope/.test(t.texto))
})

test('companiasParaRamo: solo compañías con bot activo en ESE ramo; «todas»; ninguna inventada', () => {
  const ints = [{ compania: 'mapfre', ramo: 'auto' }, { compania: 'allianz', ramo: 'moto' }, { compania: 'allianz', ramo: 'comunidades' }]
  assert.deepEqual(companiasParaRamo(['Mapfre'], ints, 'auto'), { ok: true, companias: ['mapfre'] })
  assert.deepEqual(companiasParaRamo(['todas'], ints, 'auto'), { ok: true, companias: ['mapfre'] })
  const r = companiasParaRamo(['allianz'], ints, 'auto')
  assert.ok(!r.ok && /allianz/.test(r.motivo) && /mapfre/.test(r.motivo))
  assert.equal(companiasParaRamo([], ints, 'auto').ok, false)
  assert.equal(companiasParaRamo(['mapfre'], ints, 'hogar').ok, false)
})

const op = (o: Partial<OportunidadBots>): OportunidadBots => ({
  id: ID, clienteId: ID2, clienteNombre: 'Manuel', ramo: 'auto', estado: 'en_negociacion', vehiculo: 'HYUNDAI TUCSON', matricula: '1234 BCD', aseguradora: null, ...o,
})

test('candidatasBots: abiertas, ramo con bot desde Telegram y que casan con la pista', () => {
  const ops = [
    op({ id: 'a' }),
    op({ id: 'b', vehiculo: 'SEAT IBIZA', matricula: '9999XYZ' }),
    op({ id: 'c', estado: 'ganada' }),
    op({ id: 'd', ramo: 'moto' }),
    op({ id: 'a' }),
  ]
  assert.deepEqual(candidatasBots(ops, 'Hyundai').map((o) => o.id), ['a'])
  assert.deepEqual(candidatasBots(ops, '1234BCD').map((o) => o.id), ['a'])
  assert.deepEqual(candidatasBots(ops, null).map((o) => o.id), ['a', 'b'])
  assert.deepEqual(candidatasBots(ops, 'Toyota'), [])
})

const cands: CandidatoAtascoTg[] = [
  { n: 1, tag: 'input', texto: 'Matrícula', etiqueta: null, id: null },
  { n: 2, tag: 'input', texto: 'Fecha de matriculación', etiqueta: null, id: null },
  { n: 3, tag: 'select', texto: null, etiqueta: 'Uso del vehículo', id: null },
]

test('casarCandidatoAtasco: por nombre (uno / varios / ninguno) y por número solo si está en la lista', () => {
  assert.deepEqual(casarCandidatoAtasco(cands, 'la matrícula', undefined), { tipo: 'uno', n: 1 })
  assert.deepEqual(casarCandidatoAtasco(cands, 'matricula', undefined), { tipo: 'uno', n: 1 })
  assert.deepEqual(casarCandidatoAtasco(cands, 'matricul', undefined), { tipo: 'varios', ns: [1, 2] })
  assert.equal(casarCandidatoAtasco(cands, 'el garaje', undefined).tipo, 'ninguno')
  assert.deepEqual(casarCandidatoAtasco(cands, null, 3), { tipo: 'uno', n: 3 })
  assert.equal(casarCandidatoAtasco(cands, null, 7).tipo, 'ninguno')
  assert.equal(casarCandidatoAtasco(cands, null, '#mat-input-1').tipo, 'ninguno')
})

test('decidirBotonBots: solo from.id = TELEGRAM_CHAT_ID y `tbot_ok|no:<uuid>`', () => {
  assert.deepEqual(decidirBotonBots({ from: { id: 42 } }, 'ok', [ID], '42'), { ok: true, accion: 'ok', id: ID, quien: '42' })
  assert.equal(decidirBotonBots({ from: { id: 43 } }, 'ok', [ID], '42').ok, false)
  assert.equal(decidirBotonBots({ from: { id: 42 } }, 'ok', [ID], undefined).ok, false)
  assert.equal(decidirBotonBots({ from: { id: 42 } }, 'ok', ['1'], '42').ok, false)
  assert.equal(decidirBotonBots({ from: { id: 42 } }, 'emitir', [ID], '42').ok, false)
  assert.equal(decidirBotonBots({ from: { id: 42 } }, 'ok', [ID, 'mapfre'], '42').ok, false)
})

test('leerPropuesta: lo guardado se valida; nada raro llega a ejecutarse', () => {
  assert.deepEqual(leerPropuesta('tarificar', { oportunidadId: ID, ramo: 'auto', companias: ['mapfre'] }), { tipo: 'tarificar', cuerpo: { oportunidadId: ID, ramo: 'auto', companias: ['mapfre'] } })
  assert.equal(leerPropuesta('tarificar', { oportunidadId: ID, ramo: 'moto', companias: ['mapfre'] }), null)
  assert.equal(leerPropuesta('tarificar', { oportunidadId: ID, ramo: 'auto', companias: ['mapfre', 'x;drop'] }), null)
  assert.equal(leerPropuesta('emitir', { oportunidadId: ID }), null)
  assert.equal(leerPropuesta('atasco', { atascoId: ID, n: 2, rotulo: 'Matrícula', selector: '#x' })?.tipo, 'atasco')
  assert.equal(leerPropuesta('atasco', { atascoId: ID, n: 0, rotulo: 'Matrícula' }), null)
})

test('atascoSigueIgual: al confirmar, el número N tiene que ser el MISMO candidato', () => {
  assert.equal(atascoSigueIgual(cands, { atascoId: ID, n: 1, rotulo: 'Matrícula' }), true)
  assert.equal(atascoSigueIgual(cands, { atascoId: ID, n: 2, rotulo: 'Matrícula' }), false)
  assert.equal(atascoSigueIgual(null, { atascoId: ID, n: 1, rotulo: 'Matrícula' }), false)
})

test('cableado: en modo bots el bucle SOLO ejecuta herramientas de bots y el webhook enruta `tbot`', () => {
  const tg = readFileSync(new URL('./correduria-asistente-telegram.ts', import.meta.url), 'utf8')
  assert.match(tg, /if \(bots\) \{\s*\/\/[^\n]*\n\s*const rb: [^=]+= await ejecutarBots\(/)
  assert.match(tg, /herramientas = bots \? HERRAMIENTAS_BOTS :/)
  assert.match(tg, /if \(bots && pideAccionProhibida\(pregunta\)\)/)
  const wh = readFileSync(new URL('../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url), 'utf8')
  assert.match(wh, /prefix === PREFIJO_BOTS_TG[\s\S]{0,200}decidirBotonBots\(cb, action, args, process\.env\.TELEGRAM_CHAT_ID\)/)
})

// ── Revisión 15/10/2026 ─────────────────────────────────────────────────────────────────────────────

test('bots_estado: los supuestos del precio viajan a la IA junto a las ofertas (y el prompt exige decirlos)', () => {
  const SUP = 'Precio con supuestos: uso diario, garaje colectivo.'
  const t = trabajoBotsParaIA('Allianz', '2026-10-15', { titulo: 'Con precio', motivo: null, ofertas: ['Turismos · Todo riesgo: 512,00€'], supuestos: [SUP] })
  assert.deepEqual(t.supuestos, [SUP])
  assert.match(JSON.stringify(t), /Precio con supuestos: uso diario/)
  // Sin ofertas no hay precio al que acompañar; sin supuestos, nada que inventar.
  assert.equal(trabajoBotsParaIA('Allianz', null, { titulo: 'En curso', motivo: null, ofertas: [], supuestos: [SUP] }).supuestos, undefined)
  assert.equal(trabajoBotsParaIA('Allianz', null, { titulo: 'Con precio', motivo: null, ofertas: ['x'], supuestos: [] }).supuestos, undefined)
  assert.match(systemBots('2026-10-15'), /Precio con supuestos/)
  const src = readFileSync(new URL('./correduria-bots-telegram.ts', import.meta.url), 'utf8')
  assert.match(src, /const s = resumenTrabajo\(l\.trabajo\)[\s\S]{0,200}trabajoBotsParaIA\(compania, [^\n]*, s\)/, 'estado() usa el helper con el resumen entero')
})

test('texto libre del modo bots: solo la PERSONA autorizada (from.id), no basta el chat', () => {
  assert.equal(remitenteAutorizadoBots(12345, '12345'), true)
  assert.equal(remitenteAutorizadoBots('12345', ' 12345 '), true)
  assert.equal(remitenteAutorizadoBots(999, '12345'), false, 'otro miembro del grupo')
  assert.equal(remitenteAutorizadoBots(undefined, '12345'), false, 'sin from')
  assert.equal(remitenteAutorizadoBots(null, '12345'), false)
  assert.equal(remitenteAutorizadoBots({ id: 12345 }, '12345'), false)
  assert.equal(remitenteAutorizadoBots(12345, undefined), false, 'sin chat configurado, nadie')
  assert.equal(remitenteAutorizadoBots('', ''), false)
  // Cableado: el asistente lo mira ANTES de la IA y de cualquier propuesta, y la ruta le pasa from.id.
  const asis = readFileSync(new URL('./correduria-asistente-telegram.ts', import.meta.url), 'utf8')
  const iGuarda = asis.indexOf('remitenteAutorizadoBots(fromId, process.env.TELEGRAM_CHAT_ID)')
  assert.ok(iGuarda > 0, 'guarda presente')
  assert.match(asis, /if \(bots && !remitenteAutorizadoBots\(fromId, process\.env\.TELEGRAM_CHAT_ID\)\) \{ await tgSend\(TEXTO_REMITENTE_BOTS\)[^}]*\}\); return \}/, 'corta en modo bots')
  assert.ok(iGuarda < asis.indexOf('openrouterConfigPasarela()', iGuarda - 2000), 'antes de configurar la IA')
  assert.ok(iGuarda < asis.indexOf('limpiarPropuestasBots()'), 'antes de tocar propuestas')
  const ruta = readFileSync(new URL('../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url), 'utf8')
  assert.match(ruta, /manejarCorreduriaTg\(texto, fromId\)/)
  assert.doesNotMatch(ruta, /correduriaSegura\([a-z]+\)/, 'ninguna llamada sin from.id')
})

test('modo bots: DNI/NIE, IBAN, tarjeta, teléfono y email NO salen a la IA; la búsqueda recupera el original', () => {
  const o = ocultarDatosPersonales('precio del coche de 12345678Z, NIE X1234567L, tel +34 612 345 678 o 912345678, ana.p@correo.es, ES9121000418450200051332, tarjeta 4111 1111 1111 1111')
  for (const v of ['12345678Z', 'X1234567L', '612 345 678', '912345678', 'ana.p@correo.es', 'ES91', '4111']) assert.ok(!o.texto.includes(v), `sin «${v}»`)
  assert.match(o.texto, /\[DNI_1\].*\[NIE_1\].*\[TEL_1\].*\[TEL_2\].*\[EMAIL_1\].*\[IBAN_1\].*\[TARJETA_1\]/)
  assert.equal(o.claves['[DNI_1]'], '12345678Z')
  assert.equal(o.claves['[TEL_1]'], '+34612345678')
  // Lo que no es dato personal se queda: matrícula, uuid, CIF de empresa, nº que no pasa Luhn, CP.
  const limpio = ocultarDatosPersonales(`Hyundai 1234 BBB, oportunidad ${ID}, CIF B12345678, póliza 1234 5678 1234 5678, CP 41003`)
  assert.deepEqual(limpio.claves, {})
  // DNI con guion y el mismo dato repetido → una sola clave.
  const rep = ocultarDatosPersonales('12345678-z y otra vez 12345678Z')
  assert.equal(rep.texto, '[DNI_1] y otra vez [DNI_1]')
  // Restaurar: solo en servidor, en todos los textos de los argumentos; una clave desconocida se deja.
  assert.deepEqual(restaurarDatosOcultos({ buscar: '[DNI_1]', pista: 'coche [TEL_9]', n: 2, l: ['[EMAIL_1]'] }, o.claves),
    { buscar: '12345678Z', pista: 'coche [TEL_9]', n: 2, l: ['ana.p@correo.es'] })
  // Cableado: a la IA va `preguntaIA` (ocultada) también en la pasada de cierre; las herramientas reciben los args restaurados.
  const asis = readFileSync(new URL('./correduria-asistente-telegram.ts', import.meta.url), 'utf8')
  assert.match(asis, /const oculto = bots \? ocultarDatosPersonales\(pregunta\)/)
  assert.match(asis, /\{ role: 'user', content: preguntaIA \}/)
  assert.match(asis, /const cierre = `\$\{preguntaIA\}/)
  assert.match(asis, /ejecutarBots\(nombreH, args === null \? null : restaurarDatosOcultos\(args, oculto\.claves\)/)
})

test('bloque fijo del SERVIDOR: «Precio con supuestos (Compañía): …» al final, sin depender de la IA', () => {
  const SUP = 'Precio con supuestos: uso diario, garaje colectivo.'
  const items = [{ compania: 'Allianz', supuestos: [SUP] }, { compania: 'Allianz', supuestos: [SUP] }, { compania: 'Mapfre', supuestos: ['Precio con supuestos: efecto 18/10/2026.'] }]
  const b = bloqueSupuestosBots(items)
  assert.equal(b, '\n\n⚠️ Precio con supuestos (Allianz): uso diario, garaje colectivo.\n⚠️ Precio con supuestos (Mapfre): efecto 18/10/2026.\nConfírmalo con el cliente.')
  assert.equal(bloqueSupuestosBots([]), '')
  assert.equal(bloqueSupuestosBots([{ compania: null, supuestos: [] }]), '')
  // Aunque la IA no lo diga, sale; con respuesta larga se recorta la IA, nunca el bloque.
  const r = conBloqueSupuestosBots('La IA no menciona nada.', items)
  assert.ok(r.startsWith('La IA no menciona nada.') && r.endsWith(b))
  const largo = conBloqueSupuestosBots('x'.repeat(5000), items, 3800)
  assert.equal(largo.length, 3800)
  assert.ok(largo.endsWith(b))
  // Cableado: estado() devuelve los supuestos y el asistente los añade tras enmascarar, solo en modo bots.
  const tel = readFileSync(new URL('./correduria-bots-telegram.ts', import.meta.url), 'utf8')
  assert.match(tel, /ok: true, supuestos \}/)
  const asis = readFileSync(new URL('./correduria-asistente-telegram.ts', import.meta.url), 'utf8')
  assert.match(asis, /if \(rb\.supuestos\?\.length\) supuestosBots\.push\(\.\.\.rb\.supuestos\)/)
  assert.match(asis, /respuesta = enmascarar\(respuesta\)\.slice\(0, 3800\)\n.*\n  if \(bots && supuestosBots\.length\) respuesta = conBloqueSupuestosBots\(respuesta, supuestosBots, 3800\)/)
})
