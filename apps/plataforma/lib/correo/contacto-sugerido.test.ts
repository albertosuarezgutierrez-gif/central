import test from 'node:test'
import assert from 'node:assert/strict'

import {
  botonesContactoSugerido, buscarFichaDeRemitente, clasificarBuzon, contactoParaDirectorio, debeSugerirContactoAseguradora, decidirBotonCsg,
  inferirCompania, candidatasCompania, botonesElegirCompania, leerCandidatasGuardadas, candidataElegida, interpretarAltaContacto, leerDatosContactoSugerido, lineaTrasAlta, partirRemitente, pareceContactoPersonal, textoAvisoCorreoCliente,
  decidirRutaAlta, botonDeshacerCsg, textoAltaAutomatica, idContactoCreado, leerContactoIdGuardado, interpretarDeshacer, lineaTrasDeshacer,
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

test('🚨 envíos automáticos reales no entran solos al Directorio; buzones útiles y personas sí', () => {
  for (const e of ['no-responder@reale.es', 'eiac@reale.es', 'mediador@allianz.es', 'avisosrecibos@info.mapfre.com',
    'comisiones-mapfre@info.mapfre.com', 'portalmediadores@mapfre.com', '$s0209uca@allianz.es', 'app-dmapappcolemp@mapfre.com',
    'encuesta.calidad.corredores@observatorio.mapfre.com', 'enviodocumentacionpoliza@info.mapfre.com', 'e-learning.mediadores@allianz.es',
    'correo@allianz.es', 'email@seguros.generali.com', 'noreply@comunica.mapfre.com', 'mailer-daemon@googlemail.com']) {
    assert.equal(pareceContactoPersonal(e), false, e)
  }
  for (const e of ['contabilidad.mediadores@reale.es', 'cstsoportecorredores@cst.mapfre.com', 'desarrollo.comercial@allianz.es',
    'soporteoperativocorredorescentrosur@occident.com', 'raul.palomino@occident.com', 'elena.perez@helvetia.es', 'nereiacastro@mapfre.es']) {
    assert.equal(pareceContactoPersonal(e), true, e)
  }
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
  assert.equal(inferirCompania('x@catalanaoccidente.com', DIR)?.codigoDgs, 'A2')
  assert.equal(inferirCompania('x@catalana-occidente.com', DIR)?.codigoDgs, 'A2', 'guiones fuera')
})

test('🚨 solo la coincidencia EXACTA se asigna sola; las parciales (filiales) van a confirmar', () => {
  const dir = [...DIR, { codigoDgs: 'B2', nombreComun: 'Mapfre Asistencia' }]
  // «Mapfre Asistencia» está en el directorio: casa EXACTA con ella y no con Mapfre
  assert.equal(inferirCompania('x@mapfreasistencia.com', dir)?.codigoDgs, 'B2')
  assert.equal(inferirCompania('x@mapfre-asistencia.com', dir)?.codigoDgs, 'B2')
  // Sin ella, mapfreasistencia.com NO se asigna a Mapfre: candidata por confirmar
  const sinFilial = candidatasCompania('x@mapfreasistencia.com', DIR)
  assert.equal(sinFilial.tipo, 'ambigua')
  assert.equal(inferirCompania('x@allianztrade.com', DIR), null, 'allianztrade no se asigna a Allianz')
  const t = candidatasCompania('x@allianztrade.com', DIR)
  assert.deepEqual(t.tipo === 'ambigua' ? t.candidatas.map((c) => c.codigoDgs) : null, ['D1'])
  // Occident: ni prefijo ni contiene se asignan solos
  assert.equal(inferirCompania('x@occidentinforma.com', DIR), null)
  assert.equal(candidatasCompania('x@occidentinforma.com', DIR).tipo, 'ambigua')
  assert.equal(inferirCompania('a@tugenerali.es', DIR), null)
  // Exacta + parciales: gana la exacta
  assert.equal(inferirCompania('x@mapfre.com', dir)?.codigoDgs, 'B1')
  // Más de 3 parciales: a mano
  const muchas = ['Vida', 'Hogar', 'Salud', 'Auto'].map((n, i) => ({ codigoDgs: `Z${i}`, nombreComun: `Zeta ${n}` }))
  assert.equal(candidatasCompania('x@zeta.es', muchas).tipo, 'ninguna')
})

test('una sola candidata por confirmar: botón «¿X?» + Ignorar y mensaje «No es seguro»', () => {
  const b = botonesElegirCompania(5, [{ codigoDgs: 'D1', nombreComun: 'Allianz' }])!
  assert.equal(b[0][0].texto, '🏢 ¿Allianz?')
  assert.deepEqual(b.flat().map((x) => x.callback), ['csg_c:5:D1', 'csg_no:5'])
  assert.match(lineaTrasAlta({ estado: 'ambigua', candidatas: [{ codigoDgs: 'D1', nombreComun: 'Allianz' }] }), /No es seguro que sea Allianz: confirma la compañía/)
  assert.equal(leerCandidatasGuardadas({ candidatos: [{ codigoDgs: 'D1', nombreComun: 'Allianz' }] }).length, 1)
})

test('inferirCompania: subdominios, tugenerali.es y .com.es', () => {
  assert.equal(inferirCompania('a@info.mapfre.com', DIR)?.codigoDgs, 'B1')
  assert.equal(inferirCompania('a@generali.es', DIR)?.codigoDgs, 'C1')
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
  assert.equal(interpretarAltaContacto(404, { estado: 'compania_desconocida' }).estado, 'error')
  assert.match(lineaTrasAlta({ estado: 'sin_compania' }), /añádelo a mano/)
})

test('🚨 incierto ≠ «no se ha creado»: 502/red, 5xx y 200 estado:error son INCIERTOS; 400/404/sin configurar son PREVIOS', () => {
  for (const [st, j] of [[502, { estado: 'error', motivo: 'red' }], [502, null], [500, null], [504, {}], [200, { estado: 'error', causa: 'x' }]] as const) {
    const r = interpretarAltaContacto(st, j)
    assert.equal(r.estado, 'error'); assert.equal(r.estado === 'error' && r.incierto, true, `${st}`)
    const l = lineaTrasAlta(r)
    assert.match(l, /No sé si se ha añadido/); assert.match(l, /Directorio/); assert.doesNotMatch(l, /no se ha creado nada/)
  }
  for (const [st, j] of [[400, { estado: 'invalido' }], [404, { estado: 'compania_desconocida' }], [503, { estado: 'sin_configurar' }]] as const) {
    const r = interpretarAltaContacto(st, j)
    assert.equal(r.estado === 'error' && !r.incierto, true, `${st}`)
    assert.match(lineaTrasAlta(r), /no se ha creado nada, añádelo a mano/)
  }
})

const CS = [
  { codigoDgs: 'A1', nombreComun: 'Generali Vida' }, { codigoDgs: 'A2', nombreComun: 'Generali Hogar' },
  { codigoDgs: 'A3', nombreComun: 'Generali Salud' }, { codigoDgs: 'A4', nombreComun: 'Generali Auto' },
  { codigoDgs: 'B1', nombreComun: 'Mapfre' },
]

test('ambigua (2-3 candidatas) → un botón por candidata + Ignorar; >3 o 0 → a mano', () => {
  const amb = candidatasCompania('x@generali.es', CS.slice(0, 3).concat(CS[4]))
  assert.equal(amb.tipo, 'ambigua')
  if (amb.tipo !== 'ambigua') return
  assert.deepEqual(amb.candidatas.map((c) => c.codigoDgs), ['A1', 'A2', 'A3'])
  const b = botonesElegirCompania(77, amb.candidatas)!.flat().map((x) => x.callback!)
  assert.deepEqual(b, ['csg_c:77:A1', 'csg_c:77:A2', 'csg_c:77:A3', 'csg_no:77'])
  for (const c of b) assert.ok(Buffer.byteLength(c) <= 64)
  assert.equal(candidatasCompania('x@generali.es', CS).tipo, 'ninguna', '4 candidatas: a mano')
  assert.equal(candidatasCompania('x@desconocida.es', CS).tipo, 'ninguna')
  assert.equal(candidatasCompania('x@mapfre.es', CS).tipo, 'una')
  assert.equal(candidatasCompania('x@generalivida.es', CS).tipo, 'una', 'exacta única')
  assert.equal(inferirCompania('x@generali.es', CS.slice(0, 3)), null, 'inferirCompania sigue sin adivinar')
  assert.equal(botonesElegirCompania(1, []), null)
  assert.equal(botonesElegirCompania(1, [CS[0], { codigoDgs: 'x'.repeat(70), nombreComun: 'L' }]), null, 'no cabe en 64 bytes')
})

test('🚨 código no candidato → rechazado; decidirBotonCsg valida forma y titular', () => {
  const g = leerCandidatasGuardadas({ candidatos: CS.slice(0, 2) })
  assert.equal(candidataElegida(g, 'A2')?.nombreComun, 'Generali Hogar')
  assert.equal(candidataElegida(g, 'A3'), null)
  assert.equal(candidataElegida(g, 'B1'), null)
  assert.deepEqual(leerCandidatasGuardadas({}), [])
  assert.deepEqual(leerCandidatasGuardadas({ candidatos: CS }), [])
  const t = { from: { id: 42 } }
  assert.deepEqual(decidirBotonCsg(t, 'c', ['7', 'A2'], '42'), { ok: true, accion: 'c', id: 7, quien: '42', codigoDgs: 'A2' })
  assert.equal(decidirBotonCsg({ from: { id: 9 } }, 'c', ['7', 'A2'], '42').ok, false)
  for (const mal of [[], ['7'], ['7', 'A;DROP'], ['7', 'A', 'B'], ['7', '']]) assert.equal(decidirBotonCsg(t, 'c', mal, '42').ok, false, JSON.stringify(mal))
})

// ── Alta automática (19/10/2026) ───────────────────────────────────────────────────────────────────────────────
const DIRC = [
  { codigoDgs: 'A1', nombreComun: 'Occident', contactos: [{ email: 'viejo@occident.com' }] },
  { codigoDgs: 'B1', nombreComun: 'Mapfre', contactos: [] },
  { codigoDgs: 'D1', nombreComun: 'Allianz', contactos: [] },
]

test('🚨 decidirRutaAlta: exacta → auto; parcial → confirmar; ninguna → a mano; ya existe → silencio', () => {
  assert.deepEqual(decidirRutaAlta('ana@mapfre.com', DIRC, true), { ruta: 'auto', compania: DIRC[1] })
  assert.deepEqual(decidirRutaAlta('ana@allianztrade.com', DIRC, true), { ruta: 'confirmar' }, 'parcial: NUNCA sola')
  assert.deepEqual(decidirRutaAlta('ana@desconocida.com', DIRC, true), { ruta: 'a_mano' })
  assert.deepEqual(decidirRutaAlta('Viejo@Occident.com', DIRC, true), { ruta: 'existia', compania: 'Occident' }, 'mayúsculas no duplican')
  assert.deepEqual(decidirRutaAlta('ana@mapfre.com', DIRC, false), { ruta: 'a_mano' }, 'alta no válida: nunca sola')
  const conSinEmail = [{ codigoDgs: 'A1', nombreComun: 'Occident', contactos: [{ email: null }] }]
  assert.notEqual(decidirRutaAlta('', conSinEmail, false).ruta, 'existia', 'email vacío no casa con contactos sin email')
})

test('deshacer: botón corto csg_u:<id>, línea del alta y callback validado (chat ajeno / forma abierta rechazados)', () => {
  const b = botonDeshacerCsg(12)
  assert.equal(b[0][0].callback, 'csg_u:12')
  assert.ok(Buffer.byteLength(b[0][0].callback) <= 64)
  assert.equal(b[0][0].texto, '↩️ Deshacer')
  assert.equal(textoAltaAutomatica('Ana <b>', 'Mapfre'), '✅ <b>Añadido al Directorio</b>: Ana &lt;b&gt; → Mapfre')
  assert.match(textoAltaAutomatica('Ana', 'Mapfre', true), /desactívalo en \/correduria/, 'sin deshacer guardado: se dice cómo quitarlo')
  assert.doesNotMatch(textoAltaAutomatica('Ana', 'Mapfre'), /desactívalo/)
  const t = { from: { id: 42 } }
  assert.deepEqual(decidirBotonCsg(t, 'u', ['12'], '42'), { ok: true, accion: 'u', id: 12, quien: '42' })
  assert.equal(decidirBotonCsg({ from: { id: 99 } }, 'u', ['12'], '42').ok, false, 'chat ajeno')
  assert.equal(decidirBotonCsg(t, 'u', ['12'], undefined).ok, false, 'sin chat configurado')
  for (const mal of ['', 'x', '0', '-3', '1;2']) assert.equal(decidirBotonCsg(t, 'u', [mal], '42').ok, false, mal)
  assert.equal(decidirBotonCsg(t, 'u', ['12', 'extra'], '42').ok, false, 'forma cerrada: un solo argumento')
  assert.equal(decidirBotonCsg(t, 'ok', ['12', 'extra'], '42').ok, false)
})

test('deshacer: id del contacto creado e interpretación de la respuesta (lo raro = error repetible)', () => {
  assert.equal(idContactoCreado({ estado: 'creado', id: 'abc-123' }), 'abc-123')
  assert.equal(idContactoCreado({ id: 7 }), null)
  assert.equal(idContactoCreado({ id: '../x' }), null)
  assert.equal(leerContactoIdGuardado({ contactoId: 'abc-123' }), 'abc-123')
  assert.equal(leerContactoIdGuardado({}), null)
  assert.equal(interpretarDeshacer(200, { estado: 'ok' }).estado, 'deshecho')
  assert.equal(interpretarDeshacer(404, { estado: 'no_encontrado' }).estado, 'no_encontrado')
  for (const [s, j] of [[502, { estado: 'error' }], [200, { estado: 'error' }], [500, null], [200, null]] as const) assert.equal(interpretarDeshacer(s, j).estado, 'error')
  assert.match(lineaTrasDeshacer({ estado: 'deshecho' }), /Deshecho/)
  assert.match(lineaTrasDeshacer({ estado: 'error' }), /No he podido deshacerlo/)
})

test('alta automática incierta: «No sé si se ha añadido», nunca «no se ha creado»', () => {
  assert.match(lineaTrasAlta({ estado: 'error', incierto: true }), /No sé si se ha añadido/)
})

test('🚨 «desactivado» (dado de baja): ni creado ni incierto; línea con «reactívalo»', () => {
  const r = interpretarAltaContacto(200, { estado: 'desactivado', compania: 'Mapfre' })
  assert.deepEqual(r, { estado: 'desactivado', compania: 'Mapfre' })
  assert.notEqual(r.estado, 'creado')
  assert.equal((r as { incierto?: boolean }).incierto, undefined)
  assert.match(lineaTrasAlta(r), /Estaba dado de baja en Mapfre: reactívalo en el Directorio/)
  assert.equal(interpretarAltaContacto(500, { estado: 'desactivado' }).estado, 'error', 'solo el 200 vale')
})
