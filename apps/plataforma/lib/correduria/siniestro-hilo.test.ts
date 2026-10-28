import test from 'node:test'
import assert from 'node:assert/strict'
import { autorDeModo, citasNoEncontradas, combinacionValida, cuentaSustituidos, cuerpoCaja, mensajesVisibles, modoDeMensaje, puedeEditar, estadoPlazo, leerEsperando, leerHilo, leerMensajes, leerPlazos, motivoFallo, plegarTexto, textoDias } from './siniestro-hilo.ts'

test('mensajes null ≠ []', () => {
  assert.equal(leerMensajes(null), null)
  assert.deepEqual(leerMensajes([]), [])
  assert.deepEqual(leerMensajes([{ id: 'x', autor: 'raro', tipo: 'nota', texto: 'a' }]), [])
})
test('leerHilo tolera error y campos ausentes', () => {
  assert.equal(leerHilo({ estado: 'error' }), null)
  const h = leerHilo({ poliza: { id: 'p' } })!
  assert.equal(h.mensajes, null)
  assert.equal(h.diasEsperandoCompania, null)
  assert.deepEqual(h.poliza?.documentos, [])
})
test('plazo sin fecha base nunca es 0', () => {
  const e = estadoPlazo({ clave: 'a', etiqueta: 'A', fecha: null, diasRestantes: null, baseLegal: null, verificado: true, nota: null })
  assert.equal(e.texto, 'falta la fecha base')
  assert.equal(e.tono, 'neutral')
})
test('plazo rojo <15 y aviso si no verificado', () => {
  const p = { clave: 'a', etiqueta: 'A', fecha: '2026-11-01', diasRestantes: 14, baseLegal: null, verificado: false, nota: null }
  assert.equal(estadoPlazo(p).tono, 'malo')
  assert.match(estadoPlazo(p).aviso ?? '', /pendiente de verificar/)
  assert.deepEqual({ ...estadoPlazo({ ...p, diasRestantes: 15, verificado: true }) }, { ...estadoPlazo({ ...p, diasRestantes: 15, verificado: true }), ...{ tono: 'neutral', aviso: null } })
  assert.equal(estadoPlazo({ ...p, diasRestantes: -2 }).texto, 'vencido hace 2 días')
})
test('plegado', () => {
  assert.equal(plegarTexto('corto', false).plegado, false)
  const largo = 'x'.repeat(700)
  assert.equal(plegarTexto(largo, false).plegado, true)
  assert.equal(plegarTexto(largo, true).visible.length, 700)
})
test('días y esperando', () => {
  assert.equal(textoDias(1), '1 día')
  assert.equal(textoDias(null), 'sin fecha base')
  assert.equal(leerEsperando({}), null)
  assert.deepEqual(leerEsperando([{ siniestroId: 'a', dias: 3 }, { siniestroId: 'b', dias: 20 }, { dias: 1 }])!.map(x => x.siniestroId), ['b', 'a'])
})
test('caja', () => {
  assert.deepEqual(cuerpoCaja('interna', ' hola ', null), { autor: 'interna', tipo: 'nota', texto: 'hola' })
  assert.deepEqual({ ...cuerpoCaja('enviado', 'x', 'd1') }, { ...cuerpoCaja('enviado', 'x', 'd1'), ...{ autor: 'corredor', tipo: 'enviado', documentoId: 'd1' } })
})

test('mensaje ilegible: texto null pero visible; sin texto y legible se descarta', () => {
  const base = { id: 'm', autor: 'compania', tipo: 'comentario', creadoAt: null }
  const [m] = leerMensajes([{ ...base, texto: null, textoIlegible: true }])!
  assert.equal(m.textoIlegible, true)
  assert.equal(m.texto, null)
  assert.deepEqual(leerMensajes([{ ...base, texto: null, textoIlegible: false }]), [])
})
test('plazo: base_legal (snake) y nota', () => {
  const [p] = leerPlazos([{ clave: 'respuesta_sac', etiqueta: 'SAC', fecha: null, diasRestantes: null, base_legal: 'Orden ECO/734/2004', verificado: false, nota: 'falta la fecha' }])!
  assert.equal(p.baseLegal, 'Orden ECO/734/2004')
  assert.equal(p.nota, 'falta la fecha')
})
test('leerHilo: solo estado ok; sin_migracion y errores no son hilo', () => {
  assert.equal(leerHilo({ estado: 'sin_migracion' }), null)
  assert.notEqual(leerHilo({ estado: 'ok', mensajes: [], plazos: [] }), null)
  assert.equal(motivoFallo(503, { estado: 'sin_migracion' }), 'El hilo aún no está activado en la base de datos')
  assert.equal(motivoFallo(403, { motivo: 'otra' }), 'otra')
  assert.equal(motivoFallo(500, null), 'error 500')
})
test('esperando: un objeto de error nunca es lista vacía', () => {
  assert.equal(leerEsperando({ estado: 'error' }), null)
  assert.deepEqual(leerEsperando([]), [])
})
test('combinaciones y reclamación SAC solo con enviado', () => {
  assert.equal(combinacionValida('compania', 'enviado'), false)
  assert.equal(combinacionValida('corredor', 'enviado'), true)
  assert.equal(combinacionValida('corredor', 'rehuse'), false)
  assert.equal(combinacionValida('compania', 'rehuse'), true)
  assert.equal(cuerpoCaja('rehuse', 'x', null).tipo, 'rehuse')
  assert.equal(cuerpoCaja('enviado', 'x', null, true).reclamacionSac, true)
  assert.equal('reclamacionSac' in cuerpoCaja('enviado', 'x', null, false), false)
  assert.equal('reclamacionSac' in cuerpoCaja('interna', 'x', null, true), false)
})
test('citas no encontradas', () => {
  assert.deepEqual(citasNoEncontradas({ citas: { noEncontradas: ['art 5'] } }), ['art 5'])
  assert.deepEqual(citasNoEncontradas({ citas: { noEncontradas: [] } }), [])
  assert.deepEqual(citasNoEncontradas(null), [])
})

const msg = (id: string, o: Record<string, unknown> = {}) =>
  leerMensajes([{ id, autor: 'compania', tipo: 'comentario', texto: `t${id}`, ...o }])![0]

test('leerMensaje lee sustituidoPor (null si falta)', () => {
  assert.equal(msg('a').sustituidoPor, null)
  assert.equal(msg('a', { sustituidoPor: 'b' }).sustituidoPor, 'b')
})
test('mensajesVisibles: por defecto solo vigentes con «editado»; con el conmutador, las sustituidas atenuables', () => {
  const l = [msg('a', { sustituidoPor: 'a2' }), msg('b'), msg('a2', { meta: { sustituyeA: 'a' } })]
  const v = mensajesVisibles(l, false)
  assert.deepEqual(v.map(x => [x.mensaje.id, x.editado, x.sustituido]), [['b', false, false], ['a2', true, false]])
  const t = mensajesVisibles(l, true)
  assert.deepEqual(t.map(x => [x.mensaje.id, x.editado, x.sustituido]), [['a', false, true], ['b', false, false], ['a2', true, false]])
  assert.equal(cuentaSustituidos(l), 1)
})
test('mensajesVisibles: sin sustituidoPor del servidor, deduce las sustituidas de meta.sustituyeA', () => {
  const l = [msg('a'), msg('a2', { meta: { sustituyeA: 'a' } })]
  assert.deepEqual(mensajesVisibles(l, false).map(x => x.mensaje.id), ['a2'])
})
test('puedeEditar: nunca IA, ni sustituidos, ni ilegibles, ni combinaciones que la caja no escribe', () => {
  assert.equal(puedeEditar(msg('a')), true)
  assert.equal(puedeEditar(msg('a', { autor: 'ia', tipo: 'borrador' })), false)
  assert.equal(puedeEditar(msg('a', { sustituidoPor: 'b' })), false)
  assert.equal(puedeEditar(msg('a', { texto: undefined, textoIlegible: true })), false)
  assert.equal(puedeEditar(msg('a', { autor: 'corredor', tipo: 'comentario' })), false)
  assert.equal(puedeEditar(msg('a', { autor: 'corredor', tipo: 'enviado' })), true)
})
test('modoDeMensaje y autorDeModo son coherentes; cuerpoCaja manda sustituyeA solo si se edita', () => {
  assert.equal(modoDeMensaje({ autor: 'compania', tipo: 'rehuse' }), 'rehuse')
  assert.equal(autorDeModo('rehuse'), 'compania')
  assert.equal(autorDeModo('compania'), 'compania')
  assert.equal(autorDeModo('enviado'), 'corredor')
  assert.equal(autorDeModo('interna'), 'interna')
  assert.equal('sustituyeA' in cuerpoCaja('compania', 'x', null), false)
  assert.equal(cuerpoCaja('rehuse', ' x ', null, false, 'abc').sustituyeA, 'abc')
  assert.equal(cuerpoCaja('rehuse', ' x ', null, false, 'abc').tipo, 'rehuse')
})
