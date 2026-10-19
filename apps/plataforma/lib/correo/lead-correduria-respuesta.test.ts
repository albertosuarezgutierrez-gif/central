import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MEDIADOR } from '@central/module-seguros'
import {
  cuboAdjunto, leerCasar, leerGuardar, lineaAdjuntos, plantillaRepregunta, resumirRespuesta, textoRespuestaTelegram,
} from './lead-correduria-respuesta.ts'

const OP = '22222222-2222-4222-8222-222222222222'
const CLI = '11111111-1111-4111-8111-111111111111'
const op = (x: object = {}) => ({ id: OP, ramo: 'hogar', nuevos: [], iguales: [], discrepancias: [], protegidos: [], sinClave: [], invalidos: [], faltan: [], guardado: true, ...x })

test('🪤 casar: solo un «ok» legible casa; lo demás NO se lee (nunca «casa» por defecto)', () => {
  assert.equal(leerCasar(200, { estado: 'ok', hiloId: '5', clienteId: CLI, pila: 'Ana', oportunidades: [{ id: OP, ramo: 'hogar' }] }).estado, 'ok')
  assert.equal(leerCasar(200, { estado: 'ambiguo' }).estado, 'ambiguo')
  assert.equal(leerCasar(503, { estado: 'sin_tabla' }).estado, 'sin_tabla')
  assert.equal(leerCasar(200, { estado: 'ok', hiloId: 'x', clienteId: CLI }).estado, 'error')
  assert.equal(leerCasar(502, null).estado, 'error')
})

test('🪤 guardar: «completo» exige el ok de asegura Y nada pendiente en ninguna oportunidad', () => {
  assert.equal(leerGuardar(200, { estado: 'ok', completo: true, oportunidades: [op()] }).estado, 'ok')
  const g = leerGuardar(200, { estado: 'ok', completo: true, oportunidades: [op(), op({ guardado: false })] })
  assert.equal(g.estado === 'ok' && g.completo, false)
  assert.equal(leerGuardar(500, { estado: 'error' }).estado, 'no')
})

test('🪤 un fallo (IA o asegura) no se lee como «no mandó nada»: ni completo ni repregunta', () => {
  const r = resumirRespuesta({ estado: 'no', motivo: 'HTTP 500' }, [], false)
  assert.equal(r.sinLeer, true)
  assert.equal(r.completo, false)
  const ia = resumirRespuesta({ estado: 'ok', completo: true, oportunidades: [op()] }, [], true)
  assert.equal(ia.completo, false, 'con la IA caída no se puede afirmar «completo»')
  assert.equal(ia.sinLeer, true)
  const t = textoRespuestaTelegram({ pila: 'Ana', ramos: ['hogar'], guardado: { estado: 'ok', completo: true, oportunidades: [op()] }, resumen: ia, iaFallo: true, adjuntos: null })
  assert.match(t, /No he podido leer su respuesta/)
  assert.doesNotMatch(t, /listo para tarificar/)
})

test('aviso: ✔️ recibidos, ⚠️ no valen/no cuadran, ❌ faltan, 📎; completo → «listo para tarificar»; sin valores', () => {
  const g = { estado: 'ok' as const, completo: false, oportunidades: [op({ nuevos: ['metrosCuadrados', 'dni'], discrepancias: ['cp'], faltan: ['anioConstruccion'] })] }
  const res = resumirRespuesta(g, [{ clave: 'fechaNacimiento', motivo: 'la fecha no existe o no se entiende' }], false)
  const t = textoRespuestaTelegram({ pila: 'Alejandro', ramos: ['hogar'], guardado: g, resumen: res, iaFallo: false, adjuntos: lineaAdjuntos({ guardados: 2, repetidos: 0, sinClave: 0, sinTabla: 0, fallidos: 0, omitidos: 0 }) })
  assert.match(t, /📥 <b>Alejandro ha respondido<\/b> · Hogar/)
  assert.match(t, /✔️ DNI o NIE y metros cuadrados/)
  assert.doesNotMatch(t, /\d{8}[A-Z]/, 'ni un DNI en Telegram')
  assert.match(t, /no valen: fecha de nacimiento/)
  assert.match(t, /no cuadran.*código postal de la vivienda/)
  assert.match(t, /❌ faltan: año de construcción/)
  assert.match(t, /📎 2 adjuntos guardados en su ficha \(sin leer/)
  const ok = { estado: 'ok' as const, completo: true, oportunidades: [op({ nuevos: ['dni'] }), op({ id: OP, ramo: 'vida' })] }
  assert.match(textoRespuestaTelegram({ pila: null, ramos: ['hogar', 'vida'], guardado: ok, resumen: resumirRespuesta(ok, [], false), iaFallo: false, adjuntos: null }),
    /✅ <b>Datos completos para Hogar y Vida — listo para tarificar<\/b>/)
})

test('🪤 repregunta: SOLO lo que falta y lo que no vale; nada si no falta nada; pie legal siempre', () => {
  const p = plantillaRepregunta({ pila: 'Ana López', ramos: ['vida'], faltan: ['fechaEfecto'], invalidos: [{ clave: 'dni', motivo: 'la letra del DNI no cuadra con los números' }], asuntoOriginal: 'Re: Seguro de vida' })
  assert.ok(p)
  assert.equal(p!.asunto, 'Re: Seguro de vida')
  assert.match(p!.cuerpo, /^Hola Ana:/)
  assert.match(p!.cuerpo, /Desde qué fecha quieres que empiece/)
  assert.match(p!.cuerpo, /DNI o NIE: la letra del DNI no cuadra/)
  assert.doesNotMatch(p!.cuerpo, /capital que quieres asegurar/, 'lo que ya tiene no se vuelve a pedir')
  assert.ok(p!.cuerpo.includes(MEDIADOR.identidad.claveDgsfp))
  assert.equal(plantillaRepregunta({ pila: null, ramos: ['vida'], faltan: [], invalidos: [], asuntoOriginal: 'x' }), null)
})

test('adjuntos: lo desconocido es fallo, nunca «guardado»', () => {
  assert.equal(cuboAdjunto(200, { estado: 'guardado' }), 'guardados')
  assert.equal(cuboAdjunto(503, { estado: 'sin_clave' }), 'sinClave')
  assert.equal(cuboAdjunto(200, { estado: 'raro' }), 'fallidos')
  assert.match(lineaAdjuntos({ guardados: 0, repetidos: 0, sinClave: 1, sinTabla: 0, fallidos: 0, omitidos: 1 }) ?? '', /NO guardado: asegura no tiene la clave[\s\S]*1 adjunto más/)
  assert.equal(lineaAdjuntos({ guardados: 0, repetidos: 0, sinClave: 0, sinTabla: 0, fallidos: 0, omitidos: 0 }), null)
})
