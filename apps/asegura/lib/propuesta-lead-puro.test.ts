import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { deducirNecesidadesLead, MEDIADOR } from '@central/module-seguros'
import {
  armarPropuesta, correoEnHilo, decidirEnvio, opcionDeOfertaRpa, opcionDePrecioAvant2, validarPeticionPropuesta, type CabeceraPropuesta,
} from './propuesta-lead-puro.ts'

const HOY = '2026-10-19'
const OF1 = '11111111-1111-4111-8111-111111111111'
const OF2 = '22222222-2222-4222-8222-222222222222'
const CAB: CabeceraPropuesta = {
  hiloId: '7', clienteId: '33333333-3333-4333-8333-333333333333', oportunidadId: '44444444-4444-4444-8444-444444444444', ramo: 'auto',
  pila: 'Juan', estadoDatos: 'tarificada', messageIdRaiz: '<a@b>', messageIds: ['<a@b>'],
}
const NEC = deducirNecesidadesLead('auto', {
  idd_uso: 'particular', idd_conductores: 'solo_tomador', idd_modalidad: 'todo_riesgo_franquicia', idd_lunas: 'si',
  idd_asistencia: 'indiferente', idd_sustitucion: 'no', idd_prioridad: 'precio', idd_franquicia: 'si',
})
const COB_TR = [
  { clave: 'danos_propios', literal: 'Daños propios', estado: 'incluida' },
  { clave: 'lunas', literal: 'Rotura de lunas', estado: 'incluida' },
]
const fila = (id: string, prima: number, extra: Record<string, unknown> = {}, avisos: string[] = [], coberturas: unknown = COB_TR) => ({
  id, compania: id === OF1 ? 'Allianz' : 'Mapfre', producto: 'Todo riesgo con franquicia', primaTotal: prima, estado: 'extraida',
  datosExtra: { origen: 'rpa', franquiciaGeneral: 300, ...extra }, oferta: { coberturas, avisos },
})

test('oferta del bot → opción: prima, franquicia, firmeza «estimado», coberturas del catálogo, bloqueo y caducidad', () => {
  const o = opcionDeOfertaRpa('auto', fila(OF1, 412.3), HOY)!
  assert.equal(o.primaEur, 412.3)
  assert.equal(o.franquiciaEur, 300)
  assert.equal(o.firmeza, 'estimado')
  assert.equal(o.garantias?.danos_propios, 'si')
  assert.equal(o.garantias?.lunas, 'si')
  assert.equal(o.bloqueo, null)
  const b = opcionDeOfertaRpa('auto', fila(OF1, 412.3, {}, ['ESTA POLIZA QUEDARÁ BLOQUEADA POR LA SIGUIENTE RAZÓN: INCENDIO-ROBO SIN DAÑOS']), HOY)!
  assert.equal(b.bloqueo, 'INCENDIO-ROBO SIN DAÑOS')
  assert.equal(opcionDeOfertaRpa('auto', fila(OF1, 412.3, { validezHasta: '2026-10-01' }), HOY)!.caducada, true)
  // Sin coberturas legibles = no constan (null), nunca «no incluye».
  assert.equal(opcionDeOfertaRpa('auto', { ...fila(OF1, 400), oferta: null }, HOY)!.garantias, null)
  // Sin prima no hay opción (nunca un 0).
  assert.equal(opcionDeOfertaRpa('auto', fila(OF1, 0), HOY), null)
})

test('🪤 SINCO al tarificar: firme solo con compañía ≠ occident + auto + oferta guardada con nº de póliza tecleado', () => {
  const con = (companiaTrabajo: string | null, tecleada: unknown) => ({ ...fila(OF1, 412.3), companiaTrabajo, oferta: { coberturas: COB_TR, avisos: [], polizaAnteriorTecleada: tecleada } })
  assert.equal(opcionDeOfertaRpa('auto', con('mapfre', true), HOY)!.firmeza, 'firme')
  assert.equal(opcionDeOfertaRpa('auto', con('allianz', true), HOY)!.firmeza, 'firme')
  assert.equal(opcionDeOfertaRpa('auto', con('occident', true), HOY)!.firmeza, 'estimado', 'Occident siempre estimado')
  assert.equal(opcionDeOfertaRpa('auto', con('mapfre', undefined), HOY)!.firmeza, 'estimado', 'sin tecleo confirmado')
  assert.equal(opcionDeOfertaRpa('auto', con('mapfre', 'true'), HOY)!.firmeza, 'estimado', 'solo `true` estricto')
  assert.equal(opcionDeOfertaRpa('auto', con(null, true), HOY)!.firmeza, 'estimado', 'compañía desconocida')
  assert.equal(opcionDeOfertaRpa('moto', con('mapfre', true), HOY)!.firmeza, 'estimado', 'solo auto')
  assert.equal(opcionDeOfertaRpa('auto', { ...con('mapfre', true), oferta: null }, HOY)!.firmeza, 'estimado', 'sin oferta guardada')
})

test('precio de Avant2: se enseña, NUNCA es enviable desde F4, y sin firmeza no es «firme»', () => {
  const a = opcionDePrecioAvant2({ id: OF2, compania: 'Reale', producto: null, prima_eur: '350.00', franquicia_eur: null, firmeza: null, avisos: [], garantias: null })!
  assert.equal(a.firmeza, 'estimado')
  assert.equal(a.clave, `cds:${OF2}`)
  const p = armarPropuesta(CAB, NEC, [a])
  assert.equal(p.opciones[0].enviable, false)
  assert.match(p.opciones[0].motivoNoEnviable!, /Avant2/)
  assert.equal(p.recomendada, null)
})

test('armarPropuesta: ordena por prima, recomienda la que encaja y solo es enviable lo que encaja', () => {
  const caro = opcionDeOfertaRpa('auto', fila(OF1, 412.3), HOY)!
  const barato = opcionDeOfertaRpa('auto', fila(OF2, 398, {}, [], [{ clave: 'x', literal: 'Responsabilidad civil obligatoria', estado: 'incluida' }]), HOY)!
  const p = armarPropuesta(CAB, NEC, [caro, barato])
  assert.deepEqual(p.opciones.map((o) => o.clave), [OF2, OF1])
  assert.equal(p.opciones[0].enviable, false, 'el barato no consta como todo riesgo')
  assert.equal(p.opciones[1].enviable, true)
  assert.equal(p.recomendada?.clave, OF1)
})

test('sin necesidades completas: nada es enviable ni se recomienda', () => {
  const p = armarPropuesta(CAB, deducirNecesidadesLead('auto', {}), [opcionDeOfertaRpa('auto', fila(OF1, 412.3), HOY)!])
  assert.ok(p.opciones.every((o) => !o.enviable))
  assert.equal(p.recomendada, null)
})

test('decidirEnvio: EXACTAMENTE la opción y la prima pulsadas; si no, no sale ninguna', () => {
  const p = armarPropuesta(CAB, NEC, [opcionDeOfertaRpa('auto', fila(OF1, 412.3), HOY)!])
  assert.equal(decidirEnvio(p, OF1, 412.3).ok, true)
  const sinEsa = decidirEnvio(p, OF2, 398)
  assert.equal(sinEsa.ok, false)
  assert.equal(!sinEsa.ok && sinEsa.estado, 'opcion_no_esta')
  const otraPrima = decidirEnvio(p, OF1, 400)
  assert.equal(!otraPrima.ok && otraPrima.estado, 'precio_cambiado')
  const enviada = decidirEnvio({ ...p, estadoDatos: 'propuesta_enviada' }, OF1, 412.3)
  assert.equal(!enviada.ok && enviada.estado, 'ya_enviada')
  const sinNec = decidirEnvio(armarPropuesta(CAB, deducirNecesidadesLead('auto', {}), [opcionDeOfertaRpa('auto', fila(OF1, 412.3), HOY)!]), OF1, 412.3)
  assert.equal(!sinNec.ok && sinNec.estado, 'necesidades_incompletas')
})

test('validarPeticionPropuesta: enviar exige uuid de oferta, prima, Message-ID, idempotencia y dirección simple', () => {
  const base = {
    accion: 'enviar', hiloId: '7', clave: OF1, primaEur: 412.3, to: 'juan@example.com', asunto: 'Seguro coche',
    texto: 'Hola Juan, te mando la propuesta que mejor encaja.', enRespuestaA: { messageId: '<a@b>', references: ['<r@b>'] },
    idempotencia: 'clp-12', actor: 'agente:telegram-1',
  }
  assert.equal(validarPeticionPropuesta(base).ok, true)
  assert.equal(validarPeticionPropuesta({ ...base, clave: `cds:${OF1}` }).ok, false, 'Avant2 no se envía desde aquí')
  assert.equal(validarPeticionPropuesta({ ...base, enRespuestaA: { messageId: 'x\r\nBcc: a@b' } }).ok, false)
  assert.equal(validarPeticionPropuesta({ ...base, to: 'Juan <juan@example.com>' }).ok, false)
  assert.equal(validarPeticionPropuesta({ ...base, primaEur: 0 }).ok, false)
  assert.equal(validarPeticionPropuesta({ ...base, idempotencia: '' }).ok, false)
  assert.equal(validarPeticionPropuesta({ accion: 'pendientes', actor: 'agente:triaje-correo' }).ok, true)
})

test('correoEnHilo: el texto aprobado va delante del enlace, escapado en HTML, con el asunto del hilo', () => {
  const c = correoEnHilo({ asunto: 'Tu presupuesto', texto: 'ENLACE', html: '<p>ENLACE</p>' }, { asunto: 'Re: Seguro coche', intro: 'Hola <Juan>\n\nPárrafo 2' })
  assert.equal(c.asunto, 'Re: Seguro coche')
  assert.ok(c.texto.startsWith('Hola <Juan>'))
  assert.ok(c.texto.endsWith('ENLACE'))
  assert.ok(c.html.includes('Hola &lt;Juan&gt;'))
  assert.ok(!c.html.includes('<Juan>'))
})

// ─── Cepos del servicio (lee el FUENTE: lo que tsc no ve) ─────────────────────────────────────────────────────

const SRC = readFileSync(new URL('./propuesta-lead.ts', import.meta.url), 'utf8')

test('el envío de la propuesta reutiliza el aviso de siempre (portal con código) EN EL HILO, con copia a hola@ e idempotencia', () => {
  assert.match(SRC, /prepararAviso\(correduriaId, \{ id: presupuestoId, canal: 'email'/)
  assert.match(SRC, /ejecutarAviso\(aviso, null, undefined, \{[\s\S]*enRespuestaA: e\.enRespuestaA, copiaOculta: MEDIADOR\.identidad\.email, idempotencia: e\.idempotencia/)
  assert.match(SRC, /intro: conInformacionPrevia\(e\.texto\)/, 'la información previa del mediador va SIEMPRE')
  assert.equal(MEDIADOR.identidad.email, 'hola@grupoasegura.es')
})

test('antes de enviar: idempotencia, decisión sobre la opción EXACTA y el destinatario = email del hilo y de la ficha', () => {
  const i = (s: string) => SRC.indexOf(s)
  const orden = ['yaEnviado(correduriaId, e.idempotencia)', 'decidirEnvio(p, e.clave, e.primaEur)', "noEnviado('email_no_es_del_hilo'", "noEnviado('email_no_es_de_la_ficha'", "noEnviado('email_distinto'", 'prepararPresupuestoDeOfertas(', 'ejecutarAviso(']
  for (const s of orden) assert.ok(i(s) > 0, `falta: ${s}`)
  for (let k = 1; k < orden.length; k++) assert.ok(i(orden[k - 1]) < i(orden[k]), `${orden[k - 1]} tiene que ir antes que ${orden[k]}`)
  // Nunca otra oferta: el presupuesto se monta SOLO con la pulsada.
  assert.match(SRC, /ofertaIds: \[d\.opcion\.clave\]/)
})

const ENVIO = readFileSync(new URL('./envio-presupuesto.ts', import.meta.url), 'utf8')
const LEAD = readFileSync(new URL('./correo-lead.ts', import.meta.url), 'utf8')
const RESP = readFileSync(new URL('./correo-respuesta-lead.ts', import.meta.url), 'utf8')

test('el aviso del presupuesto en el hilo lleva In-Reply-To/References, copia a hola@ e idempotencia, y la deja en el evento', () => {
  assert.match(ENVIO, /\.\.\.\(hilo \? \{ enRespuestaA: hilo\.enRespuestaA, copiaOculta: hilo\.copiaOculta, idempotencia: hilo\.idempotencia \} : \{\}\)/)
  assert.match(ENVIO, /\.\.\.\(hilo \? \{ enHilo: true, idempotencia: hilo\.idempotencia \} : \{\}\)/)
  assert.match(ENVIO, /if \(hilo && \(entrada\.canal !== 'email' \|\| lote\)\) return error\('no_enviable'/)
})

test('una petición o respuesta posterior NO hace retroceder un hilo con propuesta enviada', () => {
  assert.match(LEAD, /when h\.estado_datos in \('tarificando', 'tarificada', 'propuesta_enviada'\) then h\.estado_datos/)
  assert.match(RESP, /case when estado_datos in \('sin_pedir', 'pedida', 'incompleta', 'lista_para_tarificar'\) then/)
})

test('todo SQL del servicio va por correduría (tenant) y nada habla con Codeoscopic', () => {
  assert.match(SRC, /from '\.\/tenant'/)
  assert.ok(!/codeoscopic\/(cliente|tarificar|emitir)/.test(SRC))
  for (const m of SRC.matchAll(/\$(?:queryRaw|executeRaw)[^`]*`([\s\S]*?)`/g)) {
    assert.match(m[1], /correduria_id/, `consulta sin correduría: ${m[1].slice(0, 80)}`)
  }
})

// 💶 Opción B (19/10/2026): un lead con precio REAL de Avant2 (y sin precio de bot) también llega a la propuesta.
test('🪤 pendientesPropuestaLead acepta precio de bot O tarificación real de Avant2 (lee el fuente)', () => {
  const src = readFileSync(new URL('./propuesta-lead.ts', import.meta.url), 'utf8').replace(/\s+/g, ' ')
  const f = src.slice(src.indexOf('export async function pendientesPropuestaLead'), src.indexOf('export async function hiloTrasPrecioRpa'))
  assert.match(f, /f\.datos_extra->>'origen' = 'rpa'\) or exists \(select 1 from seguros\.tarificaciones t where t\.correduria_id = h\.correduria_id and t\.oportunidad_id = h\.oportunidad_id and t\.simulado = false/)
})
test('🪤 el hilo pasa a tarificada tras Avant2 solo desde lista_para_tarificar/tarificando y con precio real (lee el fuente)', async () => {
  const { HILO_ANTES_DE_PRECIO } = await import('./propuesta-lead-puro.ts')
  assert.deepEqual([...HILO_ANTES_DE_PRECIO], ['lista_para_tarificar', 'tarificando'])
  const src = readFileSync(new URL('./propuesta-lead.ts', import.meta.url), 'utf8').replace(/\s+/g, ' ')
  const f = src.slice(src.indexOf('export async function hiloTrasPrecioAvant2'))
  assert.match(f, /h\.estado_datos = any\(\$\{\[\.\.\.HILO_ANTES_DE_PRECIO\]\}::text\[\]\) and exists \(select 1 from seguros\.tarificaciones t [^`]*t\.simulado = false/)
})
