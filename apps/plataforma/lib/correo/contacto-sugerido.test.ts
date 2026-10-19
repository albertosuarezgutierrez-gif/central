import test from 'node:test'
import assert from 'node:assert/strict'

import {
  botonesContactoSugerido, buscarFichaDeRemitente, clasificarBuzon, contactoParaDirectorio, debeSugerirContactoAseguradora, decidirBotonCsg,
  inferirCompania, interpretarAltaContacto, leerDatosContactoSugerido, lineaTrasAlta, partirRemitente, pareceContactoPersonal, textoAvisoCorreoCliente,
} from './contacto-sugerido.ts'

test('pareceContactoPersonal: un nombre.apellido es persona', () => {
  assert.equal(pareceContactoPersonal('ana.lopez@occidentinforma.com'), true)
})

test('🚨 los buzones genéricos conocidos NO se sugieren (ya se sabe que son genéricos)', () => {
  for (const local of ['mediadores', 'comunicacion.mediadores', 'no-reply', 'info', 'notificaciones']) {
    assert.equal(pareceContactoPersonal(`${local}@occidentinforma.com`), false, local)
  }
})

test('sin @ o vacío, no se sugiere (no hay nada que sugerir)', () => {
  assert.equal(pareceContactoPersonal(''), false)
  assert.equal(pareceContactoPersonal('texto sin arroba'), false)
})

test('mayúsculas y variantes no cuelan un genérico como persona', () => {
  assert.equal(pareceContactoPersonal('Mediadores@Occident.com'), false)
})

// 🚨 Caso real 19/10/2026 (datos ficticios): un CLIENTE reenvía desde su gmail a hola@ el aviso
// «Devolución de Recibo MAPFRE». La IA lo clasifica como correo de correduría y el triaje proponía
// a ese cliente como «Posible contacto nuevo de aseguradora». Un gmail NUNCA es una aseguradora.
test('🚨 un gmail que reenvía un recibo de Mapfre NO se propone como contacto de aseguradora', () => {
  assert.equal(debeSugerirContactoAseguradora('cliente.ficticio@gmail.com'), false)
})

test('🚨 ningún dominio de correo personal se propone como contacto de aseguradora', () => {
  for (const d of ['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.es', 'live.com', 'yahoo.es', 'icloud.com', 'me.com', 'telefonica.net']) {
    assert.equal(debeSugerirContactoAseguradora(`ana.lopez@${d}`), false, d)
  }
})

test('un dominio que no es de una aseguradora conocida tampoco se propone', () => {
  assert.equal(debeSugerirContactoAseguradora('ana.lopez@talleres-ficticios.es'), false)
})

test('una persona de una aseguradora conocida SÍ se propone (y un buzón genérico suyo no)', () => {
  assert.equal(debeSugerirContactoAseguradora('ana.lopez@occidentinforma.com'), true)
  assert.equal(debeSugerirContactoAseguradora('Ana.Lopez@Mapfre.com'), true)
  assert.equal(debeSugerirContactoAseguradora('mediadores@occidentinforma.com'), false)
})

test('buscarFichaDeRemitente: el que no es aseguradora se busca como cliente; la aseguradora no', () => {
  assert.equal(buscarFichaDeRemitente('cliente.ficticio@gmail.com'), true)
  assert.equal(buscarFichaDeRemitente('ana.lopez@talleres-ficticios.es'), true)
  assert.equal(buscarFichaDeRemitente('avisosrecibos@info.mapfre.com'), false)
  assert.equal(buscarFichaDeRemitente('texto sin arroba'), false)
})

test('textoAvisoCorreoCliente: dice que es TU CLIENTE, el asunto y el enlace a su ficha (escapado)', () => {
  const t = textoAvisoCorreoCliente({
    nombre: 'Cliente <Ficticio>', asunto: 'Fwd: Devolución de Recibo MAPFRE',
    url: 'https://ejemplo.test/correduria/clientes/abc', anotado: true,
  })
  assert.match(t, /📩 <b>Correo de tu cliente Cliente &lt;Ficticio&gt;<\/b>: Fwd: Devolución de Recibo MAPFRE/)
  assert.match(t, /href="https:\/\/ejemplo\.test\/correduria\/clientes\/abc"/)
  assert.doesNotMatch(t, /contacto nuevo de aseguradora/i)
  assert.match(t, /historial/)
  assert.match(textoAvisoCorreoCliente({ nombre: 'X', asunto: 'a', url: 'u', anotado: false }), /NO he podido anotarlo/)
})

// ── Botón «✅ Añadir al directorio» (19/10/2026) ──────────────────────────────────────────────────────────────
const OCC = 'Soporte Operativo Corredores Centro Sur <SoporteOperativoCorredoresCentroSur@occident.com>'
const DIR = [
  { codigoDgs: 'A1', nombreComun: 'Occident', nombreCima: 'Seguros Catalana Occidente S.A.' },
  { codigoDgs: 'A2', nombreComun: 'Catalana Occidente' },
  { codigoDgs: 'B1', nombreComun: 'Mapfre' },
  { codigoDgs: 'C1', nombreComun: 'Generali' },
  { codigoDgs: 'D1', nombreComun: 'Allianz' },
]

test('el aviso real de Occident: el buzón genérico SE sugiere y se parte bien', () => {
  assert.equal(debeSugerirContactoAseguradora('SoporteOperativoCorredoresCentroSur@occident.com'), true)
  assert.deepEqual(partirRemitente(OCC), { email: 'soporteoperativocorredorescentrosur@occident.com', nombre: 'Soporte Operativo Corredores Centro Sur' })
})

test('inferirCompania: occident.com → Occident, no Catalana Occidente', () => {
  assert.equal(inferirCompania('x@occident.com', DIR)?.codigoDgs, 'A1')
  assert.equal(inferirCompania('x@occidentinforma.com', DIR)?.codigoDgs, 'A1')
  assert.equal(inferirCompania('x@catalanaoccidente.com', DIR)?.codigoDgs, 'A2')
})

test('inferirCompania: subdominios, tugenerali.es y .com.es', () => {
  assert.equal(inferirCompania('a@info.mapfre.com', DIR)?.codigoDgs, 'B1')
  assert.equal(inferirCompania('a@tugenerali.es', DIR)?.codigoDgs, 'C1')
  assert.equal(inferirCompania('a@allianz.com.es', DIR)?.codigoDgs, 'D1')
})

test('🚨 inferirCompania: sin match o ambiguo → null (nunca se crea ni se adivina)', () => {
  assert.equal(inferirCompania('a@zurich.es', DIR), null)
  assert.equal(inferirCompania('a@gmail.com', DIR), null)
  assert.equal(inferirCompania('sin-arroba', DIR), null)
  const dup = [...DIR, { codigoDgs: 'B2', nombreComun: 'Mapfre Vida' }, { codigoDgs: 'B3', nombreComun: 'Mapfre' }]
  assert.equal(inferirCompania('a@mapfre.es', dup), null, 'dos compañías con el mismo nombre = ambiguo')
})

test('clasificarBuzon: el departamento es buzón genérico (con área), una persona no', () => {
  assert.deepEqual(clasificarBuzon(OCC), { generico: true, area: 'general' })
  assert.equal(clasificarBuzon('Siniestros Hogar <siniestros.hogar@mapfre.com>').area, 'siniestros')
  assert.deepEqual(clasificarBuzon('Ana López <ana.lopez@occident.com>'), { generico: false, area: null })
})

test('contactoParaDirectorio: cargo «Buzón genérico» solo para departamentos; email en minúsculas; nota con fecha', () => {
  const b = contactoParaDirectorio(OCC, 'Presupuestos', '19/10/2026')!
  assert.equal(b.cargo, 'Buzón genérico / departamento')
  assert.equal(b.email, 'soporteoperativocorredorescentrosur@occident.com')
  assert.match(b.notas, /19\/10\/2026/)
  const p = contactoParaDirectorio('Ana López <Ana.Lopez@occident.com>', '', '19/10/2026')!
  assert.equal(p.cargo, null)
  assert.equal(p.nombre, 'Ana López')
  assert.equal(contactoParaDirectorio('texto sin arroba', '', 'x'), null)
})

test('callback_data: solo el id corto, ≤ 64 bytes, sin email; ids enormes tampoco lo revientan', () => {
  const cb = botonesContactoSugerido(999999999999999).flat().map((b) => b.callback!)
  assert.deepEqual(cb, ['csg_ok:999999999999999', 'csg_no:999999999999999'])
  for (const c of cb) { assert.ok(Buffer.byteLength(c) <= 64); assert.ok(!c.includes('@')) }
})

test('🚨 decidirBotonCsg: solo el titular, acción conocida, id numérico', () => {
  const t = { from: { id: 42 } }
  assert.deepEqual(decidirBotonCsg(t, 'ok', ['7'], '42'), { ok: true, accion: 'ok', id: 7, quien: '42' })
  assert.deepEqual(decidirBotonCsg(t, 'no', ['7'], '42'), { ok: true, accion: 'no', id: 7, quien: '42' })
  assert.equal(decidirBotonCsg({ from: { id: 99 } }, 'ok', ['7'], '42').ok, false, 'otra persona')
  assert.equal(decidirBotonCsg(t, 'ok', ['7'], undefined).ok, false, 'sin chat configurado = fail-closed')
  assert.equal(decidirBotonCsg(t, 'borrar', ['7'], '42').ok, false)
  for (const mal of ['', 'abc', '0', '-1', '1e3', '7; DROP']) assert.equal(decidirBotonCsg(t, 'ok', [mal], '42').ok, false, mal)
})

test('leerDatosContactoSugerido: jsonb raro = null (no se crea nada)', () => {
  assert.equal(leerDatosContactoSugerido(null), null)
  assert.equal(leerDatosContactoSugerido({ email: 'no-es-email', nombre: 'X' }), null)
  assert.equal(leerDatosContactoSugerido({ email: 'a@occident.com', nombre: '' }), null)
  assert.deepEqual(leerDatosContactoSugerido({ email: 'A@Occident.com', nombre: 'A', asunto: 's' }), { email: 'a@occident.com', nombre: 'A', asunto: 's' })
})

test('interpretarAltaContacto + lineaTrasAlta: creado / ya existía / error nunca se confunden', () => {
  const ok = interpretarAltaContacto(200, { estado: 'creado', compania: 'Occident' })
  assert.deepEqual(ok, { estado: 'creado', compania: 'Occident' })
  assert.match(lineaTrasAlta(ok), /Añadido a Occident/)
  const ya = interpretarAltaContacto(200, { estado: 'existia', compania: 'Occident' })
  assert.match(lineaTrasAlta(ya), /Ya existía/)
  assert.equal(interpretarAltaContacto(200, { estado: 'creado' }).estado, 'error', 'creado sin compañía no se da por bueno')
  assert.equal(interpretarAltaContacto(502, null).estado, 'error')
  assert.equal(interpretarAltaContacto(404, { estado: 'compania_desconocida' }).estado, 'error')
  assert.match(lineaTrasAlta({ estado: 'sin_compania' }), /añádelo a mano/)
})
