// Cepos de «Precio Allianz (bot)» (06/10/2026). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  fechasPorDefecto, formularioInicial, leerTrabajoBot, mensajeEncolar, riesgoDesdeFormulario, sigueEnCurso, vistaTrabajo,
} from './tarificador-asegura-reglas.ts'

const APP = join(import.meta.dirname, '..')

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
  const f = { ...formularioInicial({ codigoPostal: '41003' }, new Date('2026-10-06T00:00:00Z')), m2Construidos: '1200', anioConstruccion: '1985', plantas: '5', numViviendasYLocales: '18' }
  const r = riesgoDesdeFormulario(f)
  assert.ok(r.ok)
  if (r.ok) {
    assert.equal(r.riesgo.ascensor, null)
    assert.equal(r.riesgo.piscina, null)
    assert.equal(r.riesgo.m2Construidos, 1200)
    assert.deepEqual((r.riesgo.direccion as { codigoPostal: string }).codigoPostal, '41003')
  }
  const mal = riesgoDesdeFormulario({ ...f, m2Construidos: '', codigoPostal: '12', fechaTermino: f.fechaEfecto })
  assert.ok(!mal.ok && mal.errores.length === 3)
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
