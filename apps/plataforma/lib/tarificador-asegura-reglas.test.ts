// Cepos de «Precio Allianz (bot)» (06/10/2026). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  vistaPrecio, fechasPorDefecto, formularioInicial, leerTrabajoBot, mensajeEncolar, riesgoDesdeFormulario, sigueEnCurso, vistaTrabajo,
} from './tarificador-asegura-reglas.ts'

import { fechaCorta, formularioConUltimoRiesgo, importeDeTexto, importeParaCampo, leerUltimoRiesgoBot } from './tarificador-asegura-reglas.ts'

const APP = join(import.meta.dirname, '..')

// ─── Pre-relleno con el último riesgo (07/10/2026) ──────────────────────────

test('último riesgo: respuesta sin datos o sin forma → null', () => {
  assert.equal(leerUltimoRiesgoBot({ riesgo: null, trabajoId: null, creadoEn: null }), null)
  assert.equal(leerUltimoRiesgoBot({ estado: 'error' }), null)
  assert.equal(leerUltimoRiesgoBot(null), null)
  assert.equal(leerUltimoRiesgoBot({ riesgo: [1] }), null)
  assert.deepEqual(leerUltimoRiesgoBot({ riesgo: { uso: 'x' }, creadoEn: '2026-10-05T08:00:00.000Z' }), { riesgo: { uso: 'x' }, creadoEn: '2026-10-05T08:00:00.000Z' })
})

test('fecha corta dd/mm/aaaa', () => {
  assert.equal(fechaCorta('2026-10-05T08:00:00.000Z'), '05/10/2026')
  assert.equal(fechaCorta('basura'), null)
  assert.equal(fechaCorta(null), null)
})

test('pre-relleno: solo claves conocidas, números a texto, tri-estado, ignora lo demás', () => {
  const hoy = new Date('2026-10-06T10:00:00Z')
  const base = formularioInicial({ codigoPostal: '41001', ciudad: 'Sevilla', provincia: 'Sevilla', direccion: 'Ficha 1' }, hoy)
  const f = formularioConUltimoRiesgo(base, {
    fechaEfecto: '2026-11-01', fechaTermino: '2027-11-01', m2Construidos: 800, anioConstruccion: 1990, plantas: 5,
    numEdificios: 2, numViviendasYLocales: 24, capitalContinente: 1500000, capitalContenido: 20000.5, tipoVivienda: 'Viviendas Pisos en Alto', uso: 'Habitual', listaPropietarios: '> 50%',
    ascensor: true, piscina: false, calidadConstruccion: 'alta', password: 'x', otraCosa: 1,
    direccion: { via: 'Calle Sol', numero: '4', codigoPostal: '41003', municipio: 'Sevilla', provincia: 'Sevilla', token: 'z' },
  }, hoy)
  assert.deepEqual(f, {
    fechaEfecto: '2026-11-01', fechaTermino: '2027-11-01', m2Construidos: '800', anioConstruccion: '1990', tipoVivienda: 'Viviendas Pisos en Alto',
    uso: 'Habitual', plantas: '5', numEdificios: '2', numViviendasYLocales: '24', listaPropietarios: '> 50%', codigoPostal: '41003',
    via: 'Calle Sol', numero: '4', municipio: 'Sevilla', provincia: 'Sevilla', capitalContinente: '1.500.000', capitalContenido: '20.000,5', ascensor: 'si', piscina: 'no', calidadConstruccion: 'alta',
  })
  assert.ok(!('password' in f) && !('otraCosa' in f))
})

test('pre-relleno: lo que no viene (o viene mal) deja el valor del formulario; fechas caducadas no pasan', () => {
  const hoy = new Date('2026-10-06T10:00:00Z')
  const base = formularioInicial({ codigoPostal: '41001' }, hoy)
  const f = formularioConUltimoRiesgo(base, {
    fechaEfecto: '2026-01-01', fechaTermino: '2027-01-01', m2Construidos: null, ascensor: null, piscina: 'si', calidadConstruccion: 'platino',
    direccion: { codigoPostal: '123' },
  }, hoy)
  assert.deepEqual(f, base)
  assert.deepEqual(formularioConUltimoRiesgo(base, {}, hoy), base)
})

test('PrecioAllianzBot y proxy: piden el último riesgo al abrir; su fallo no es bloqueante; proxy con guarda', () => {
  const src = readFileSync(join(APP, 'app/(usuario)/correduria/cliente/[id]/PrecioAllianzBot.tsx'), 'utf8')
  assert.match(src, /api\/correduria\/tarificador\/ultimo-riesgo\?cliente_id=/)
  assert.match(src, /Datos de la última petición/)
  assert.ok(!/setFallo\([^)]*ultimo/i.test(src))
  const ruta = readFileSync(join(APP, 'app/api/correduria/tarificador/ultimo-riesgo/route.ts'), 'utf8')
  assert.ok(ruta.indexOf('exigirCorreduria()') < ruta.indexOf('searchParams'))
})

test('fechas por defecto: mañana y +1 año', () => {
  assert.deepEqual(fechasPorDefecto(new Date('2026-10-06T12:00:00Z')), { fechaEfecto: '2026-10-07', fechaTermino: '2027-10-07' })
  assert.deepEqual(fechasPorDefecto(new Date('2027-12-31T23:00:00Z')), { fechaEfecto: '2028-01-01', fechaTermino: '2029-01-01' })
})

test('prefill: solo CP de 5 dígitos; sin ficha, vacío', () => {
  const hoy = new Date('2026-10-06T00:00:00Z')
  assert.equal(formularioInicial({ codigoPostal: '41003', ciudad: 'Sevilla', provincia: 'Sevilla', direccion: 'C/ Socorro' }, hoy).codigoPostal, '41003')
  assert.equal(formularioInicial({ codigoPostal: '4100' }, hoy).codigoPostal, '')
  assert.equal(formularioInicial(null, hoy).municipio, '')
})

test('formulario → riesgo: obligatorios, vacío = null (nunca 0/false)', () => {
  const f = { ...formularioInicial({ codigoPostal: '41003' }, new Date('2026-10-06T00:00:00Z')), m2Construidos: '1200', anioConstruccion: '1985', plantas: '5', numViviendasYLocales: '18', capitalContinente: '1.500.000' }
  const r = riesgoDesdeFormulario(f)
  assert.ok(r.ok)
  if (r.ok) {
    assert.equal(r.riesgo.ascensor, null)
    assert.equal(r.riesgo.piscina, null)
    assert.equal(r.riesgo.m2Construidos, 1200)
    assert.equal(r.riesgo.capitalContinente, 1500000)
    assert.equal(r.riesgo.capitalContenido, null)
    assert.deepEqual((r.riesgo.direccion as { codigoPostal: string }).codigoPostal, '41003')
  }
  const mal = riesgoDesdeFormulario({ ...f, m2Construidos: '', codigoPostal: '12', fechaTermino: f.fechaEfecto })
  assert.ok(!mal.ok && mal.errores.length === 3)
})

test('capital de edificación: sin él no se envía y el error dice cuál falta; importes a la española', () => {
  const f = { ...formularioInicial({ codigoPostal: '41003' }, new Date('2026-10-06T00:00:00Z')), m2Construidos: '1200', anioConstruccion: '1985', plantas: '5', numViviendasYLocales: '18' }
  const sin = riesgoDesdeFormulario(f)
  assert.ok(!sin.ok && sin.errores.length === 1 && /valor de reposición/.test(sin.errores[0]))
  for (const mal of ['0', 'abc', '12.5', '1,2,3', '-5']) assert.ok(!riesgoDesdeFormulario({ ...f, capitalContinente: mal }).ok, mal)
  assert.ok(!riesgoDesdeFormulario({ ...f, capitalContinente: '1.500.000', capitalContenido: 'x' }).ok)
  const ok = riesgoDesdeFormulario({ ...f, capitalContinente: '1.500.000,50 €', capitalContenido: '30000' })
  assert.ok(ok.ok && ok.riesgo.capitalContinente === 1500000.5 && ok.riesgo.capitalContenido === 30000)
  assert.equal(importeDeTexto('1500000'), 1500000)
  assert.equal(importeParaCampo(1500000), '1.500.000')
  assert.equal(importeParaCampo(9500), '9.500')
})

test('mensajes de encolar: 503 apagado, 202, 409', () => {
  assert.deepEqual(mensajeEncolar(202, { trabajoId: 'x' }), { ok: true, trabajoId: 'x' })
  assert.deepEqual(mensajeEncolar(503, { estado: 'apagado' }), { ok: false, mensaje: 'El bot está apagado (TARIFICADOR_RPA_ACTIVO)' })
  const m = mensajeEncolar(409, { motivo: 'sin_integracion' })
  assert.ok(!m.ok && m.mensaje.includes('sin_integracion'))
})

test('vista: requiere_humano, error del bot, en curso', () => {
  const base = { creadoEn: '', actualizadoEn: '', ofertas: [], pdfs: [] }
  assert.equal(vistaTrabajo({ ...base, estado: 'requiere_humano', error: { tipo: 'captcha', mensaje: '' } }).titulo, 'Allianz pide verificación humana')
  const e = vistaTrabajo({ ...base, estado: 'error_definitivo', error: { tipo: 'datos', mensaje: 'Uso no admite' } })
  assert.match(e.detalle ?? '', /datos: Uso no admite/)
  assert.equal(sigueEnCurso('en_curso'), true)
  assert.equal(sigueEnCurso('ok'), false)
})

test('leerTrabajoBot descarta ofertas sin prima y respuestas sin forma', () => {
  assert.equal(leerTrabajoBot({ error: 'x' }), null)
  const t = leerTrabajoBot({ estado: 'ok', ofertas: [{ primaTotalAnual: null }, { compania: 'a', producto: 'p', primaTotalAnual: 10, pdfIndice: 0 }], pdfs: [{ indice: 0, nombre: 'a.pdf' }] })
  assert.equal(t?.ofertas.length, 1)
  assert.equal(t?.pdfs[0].nombre, 'a.pdf')
  assert.equal(t?.ofertas[0].fechaTerminoPortal, null) // asegura antigua: sin fecha real, null (no la pedida)
})

test('leerTrabajoBot: fecha de término real de Allianz solo si es ISO; el modal la pasa a vistaPrecio y enlaza el proyecto', () => {
  const t = leerTrabajoBot({ estado: 'ok', ofertas: [
    { compania: 'a', producto: 'p', primaTotalAnual: 342.77, primaTotalSucesivos: 347.55, pdfIndice: 0, fechaTerminoPortal: '2027-10-01' },
    { compania: 'a', producto: 'q', primaTotalAnual: 10, pdfIndice: null, fechaTerminoPortal: '01102027' },
  ], pdfs: [] })
  assert.equal(t?.ofertas[0].fechaTerminoPortal, '2027-10-01')
  assert.equal(t?.ofertas[1].fechaTerminoPortal, null)
  assert.equal(vistaPrecio(t!.ofertas[0], t!.ofertas[0].fechaTerminoPortal).primerRecibo?.hasta, '01/10/2027')
  const ui = readFileSync(join(APP, 'app/(usuario)/correduria/cliente/[id]/PrecioAllianzBot.tsx'), 'utf8')
  assert.match(ui, /vistaPrecio\(o, o\.fechaTerminoPortal\)/)
  assert.match(ui, /o\.pdfIndice !== null && \(\s*<a href=\{`\/api\/correduria\/tarificador\/trabajo\/\$\{trabajoId\}\/pdf\/\$\{o\.pdfIndice\}`\}/)
  assert.match(ui, /Descargar proyecto de Allianz \(PDF\)/)
})

test('rutas proxy: exigen sesión de correduría y el secreto no sale al cliente', () => {
  for (const r of ['app/api/correduria/tarificador/encolar/route.ts', 'app/api/correduria/tarificador/trabajo/[id]/route.ts', 'app/api/correduria/tarificador/trabajo/[id]/pdf/[indice]/route.ts']) {
    const src = readFileSync(join(APP, r), 'utf8')
    assert.match(src, /exigirCorreduria\(\)/, r)
    assert.ok(!src.includes('ASEGURA_OPERADOR_SECRET'), r)
  }
  const ui = readFileSync(join(APP, 'app/(usuario)/correduria/cliente/[id]/PrecioAllianzBot.tsx'), 'utf8')
  assert.ok(!ui.includes('ASEGURA_OPERADOR_SECRET') && !ui.includes('tarificador-asegura.ts'))
  const sinComentarios = ui.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  assert.ok(!/emitir|contratar/i.test(sinComentarios), 'nada de emitir/contratar en la UI')
})

test('vistaPrecio: principal = prima anual (sucesivos); primer recibo solo si difiere; sin inventar', () => {
  const base = { compania: 'allianz', producto: 'C', pdfIndice: null }
  const dif = { ...base, primaTotalAnual: 342.77, primaNeta: 295.88, impuestos: 46.89, primaTotalSucesivos: 347.55, primaNetaSucesivos: 300, impuestosSucesivos: 47.55 }
  assert.deepEqual(vistaPrecio(dif, '2027-10-01'), { total: 347.55, neta: 300, impuestos: 47.55, primerRecibo: { total: 342.77, hasta: '01/10/2027' } })
  assert.equal(vistaPrecio(dif).primerRecibo?.hasta, null) // sin fecha real no se inventa
  assert.equal(vistaPrecio(dif, 'basura').primerRecibo?.hasta, null)
  const igual = { ...dif, primaTotalAnual: 347.55 }
  assert.equal(vistaPrecio(igual).primerRecibo, null)
  assert.equal(vistaPrecio(igual).total, 347.55)
  const soloPrimero = { ...base, primaTotalAnual: 342.77, primaNeta: 295.88, impuestos: 46.89 }
  assert.deepEqual(vistaPrecio(soloPrimero), { total: 342.77, neta: 295.88, impuestos: 46.89, primerRecibo: null })
  const sucSinDesglose = { ...base, primaTotalAnual: 342.77, primaNeta: 295.88, impuestos: 46.89, primaTotalSucesivos: 347.55, primaNetaSucesivos: null, impuestosSucesivos: null }
  const v = vistaPrecio(sucSinDesglose)
  assert.equal(v.neta, null) // no se mezcla la neta del primer recibo con la prima anual
  assert.equal(v.impuestos, null)
})

test('leerTrabajoBot conserva los sucesivos y los marca null si no vienen', () => {
  const t = leerTrabajoBot({ estado: 'ok', ofertas: [
    { compania: 'a', producto: 'p', primaTotalAnual: 342.77, primaTotalSucesivos: 347.55, primaNetaSucesivos: 300, impuestosSucesivos: 47.55 },
    { compania: 'a', producto: 'q', primaTotalAnual: 10 },
  ] })
  assert.equal(t?.ofertas[0].primaTotalSucesivos, 347.55)
  assert.equal(t?.ofertas[1].primaTotalSucesivos, null)
})
