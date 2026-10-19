import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decidirBotonClp } from './lead-correduria-peticion.ts'
import { botonesAvant2, claveAvant2, instruccionAvant2, leerDatosAvant2, oportunidadAvant2, ramosAvant2, textoOfertaAvant2 } from './lead-correduria-avant2.ts'
import { esParaBots } from '../correduria-bots-tg.ts'
import type { Revision } from './lead-correduria-tarificar.ts'

const YO = { from: { id: 42 } }
const C = '11111111-1111-4111-8111-111111111111'
const OP = '22222222-2222-4222-8222-222222222222'
const OP2 = '33333333-3333-4333-8333-333333333333'
type Ok = Extract<Revision, { estado: 'ok' }>
const rev = (ops: Ok['oportunidades']): Ok => ({ estado: 'ok', rpaActivo: true, oportunidades: ops, contador: { usadas: 0, tope: 20 } })
const op = (ramo: string, companias: Ok['oportunidades'][number]['companias'], estado: Ok['oportunidades'][number]['estado'] = 'evaluada') =>
  ({ id: OP, ramo, estado, companias, supuestos: [], noLeidos: [], concretas: [], pendientes: [] })

// ─── El botón ─────────────────────────────────────────────────────────────────

test('💶 clp_cds:<p>:auto vale para el titular', () => {
  assert.deepEqual(decidirBotonClp(YO, 'cds', ['7', 'auto'], '42'), { ok: true, accion: 'cds', id: 7, ramo: 'auto', quien: '42' })
})
test('💶 clp_cds:<p>:moto vale', () => {
  assert.equal(decidirBotonClp(YO, 'cds', ['7', 'moto'], '42').ok, true)
})
test('💶 clp_cds con otro ramo (hogar) se rechaza antes de la BD', () => {
  assert.equal(decidirBotonClp(YO, 'cds', ['7', 'hogar'], '42').ok, false)
})
test('💶 clp_cds sin ramo se rechaza', () => {
  assert.equal(decidirBotonClp(YO, 'cds', ['7'], '42').ok, false)
})
test('💶 clp_cds de otra persona se rechaza', () => {
  assert.equal(decidirBotonClp({ from: { id: 99 } }, 'cds', ['7', 'auto'], '42').ok, false)
})
test('💶 clp_cds con id no numérico se rechaza', () => {
  assert.equal(decidirBotonClp(YO, 'cds', ['x', 'auto'], '42').ok, false)
})

test('💶 los botones solo salen para coche/moto', () => {
  assert.deepEqual(botonesAvant2(7, ['hogar', 'auto', 'vida']).flat().map((b) => b.callback), ['clp_cds:7:auto'])
})
test('💶 sin coche ni moto no hay botón', () => {
  assert.equal(botonesAvant2(7, ['hogar', 'comunidades']).length, 0)
})
test('💶 el texto del botón dice el coste', () => {
  assert.equal(botonesAvant2(7, ['moto'])[0][0].texto, '💶 Avant2 (0,50€)')
})
test('💶 callback_data ≤ 64 bytes con el id más largo', () => {
  for (const b of botonesAvant2('999999999999999', ['auto', 'moto']).flat()) assert.ok(Buffer.byteLength(b.callback ?? '') <= 64)
})
test('💶 el aviso dice que no se paga hasta el segundo botón', () => {
  assert.match(textoOfertaAvant2(['auto']), /No se paga nada hasta que pulses ese segundo botón/)
})

// ─── Cuándo se ofrece ─────────────────────────────────────────────────────────

test('💶 coche con sus bots en pruebas (ninguno a precio) → se ofrece', () => {
  assert.deepEqual(ramosAvant2(rev([op('auto', [{ compania: 'mapfre', estado: 'en_pruebas' }])])), ['auto'])
})
test('💶 coche con un bot que llega a precio → NO se ofrece', () => {
  assert.deepEqual(ramosAvant2(rev([op('auto', [{ compania: 'mapfre', estado: 'lista' }])])), [])
})
test('💶 hogar sin bots → NO se ofrece (Avant2 por aquí solo coche/moto)', () => {
  assert.deepEqual(ramosAvant2(rev([op('hogar', [], 'sin_bot')])), [])
})
test('💶 con una discrepancia sin elegir → NO se ofrece', () => {
  assert.deepEqual(ramosAvant2(rev([op('auto', []), { ...op('moto', []), estado: 'discrepancias' }])), [])
})
test('💶 sin formulario → NO se ofrece', () => {
  assert.deepEqual(ramosAvant2(rev([op('moto', [], 'sin_formulario')])), [])
})

// ─── Lo que se le pasa al asistente ───────────────────────────────────────────

test('💶 la instrucción al asistente NO entra en modo bots (que no pide Avant2)', () => {
  assert.equal(esParaBots(instruccionAvant2({ clienteId: C, oportunidadId: OP, ramo: 'auto' })), false)
})
test('💶 la instrucción lleva la oportunidad y manda a proponer_tarificacion', () => {
  assert.match(instruccionAvant2({ clienteId: C, oportunidadId: OP, ramo: 'moto' }), new RegExp(`oportunidadId ${OP}.*proponer_tarificacion`))
})
test('💶 la instrucción no lleva ningún email ni teléfono', () => {
  assert.ok(!/@|\d{9}/.test(instruccionAvant2({ clienteId: C, oportunidadId: OP, ramo: 'auto' }).replace(new RegExp(`${C}|${OP}`, 'g'), '')))
})
test('💶 datos del pendiente: sin ficha → null (no se entrega nada)', () => {
  assert.equal(leerDatosAvant2({ oportunidadIds: [OP] }), null)
})
test('💶 datos del pendiente: sin oportunidades → null', () => {
  assert.equal(leerDatosAvant2({ clienteId: C, oportunidadIds: [] }), null)
})
test('💶 datos del pendiente legibles', () => {
  assert.deepEqual(leerDatosAvant2({ clienteId: C, oportunidadIds: [OP, 'x'], to: 'a@b.es' }), { clienteId: C, oportunidadIds: [OP], hilo: null })
})
test('💶 la oportunidad: la del ramo y del tomador', () => {
  assert.equal(oportunidadAvant2([{ id: OP, ramo: 'hogar', tomador: C }, { id: OP2, ramo: 'auto', tomador: C }], C, 'auto'), OP2)
})
test('💶 la oportunidad: dos de coche = no se adivina', () => {
  assert.equal(oportunidadAvant2([{ id: OP, ramo: 'auto', tomador: C }, { id: OP2, ramo: 'auto', tomador: C }], C, 'auto'), null)
})
test('💶 la oportunidad: de otro tomador = ninguna', () => {
  assert.equal(oportunidadAvant2([{ id: OP, ramo: 'auto', tomador: OP2 }], C, 'auto'), null)
})
test('💶 la marca de un solo uso es por hilo y ramo', () => {
  assert.notEqual(claveAvant2('<a@b>', 'auto'), claveAvant2('<a@b>', 'moto'))
})

// ─── Cepos sobre el fuente (lo que tsc no ve) ─────────────────────────────────

const PROCESO = readFileSync(new URL('./lead-correduria-avant2-proceso.ts', import.meta.url), 'utf8')
const CODIGO = PROCESO.replace(/^\s*\/\/.*$/gm, '')

test('🪤 la entrega NUNCA paga: ni cotiza ni pulsa cas_tarif por su cuenta (lee el fuente)', () => {
  assert.ok(!/tarificarDesdeBoton|cotizar[A-Z(]|cas_tarif|auto-nuevo|moto-nuevo/.test(CODIGO))
})
test('🪤 un solo uso: la marca va ANTES de entregar al asistente (lee el fuente)', () => {
  const marca = CODIGO.search(/INSERT INTO correduria_pendiente_tg[^`]*\$\{claveAvant2\(hilo, ramo\)\}/)
  const yaUsado = CODIGO.indexOf('if (!marca.length) return')
  const entrega = CODIGO.indexOf('await manejarCorreduriaTg(')
  assert.ok(marca > 0 && yaUsado > marca && entrega > yaUsado)
})
test('🪤 la marca caduca a los 15 min (caduca_at en el INSERT) (lee el fuente)', () => {
  assert.match(CODIGO, /INSERT INTO correduria_pendiente_tg \([^)]*caduca_at\)[^`]*now\(\) \+ interval '15 minutes'\)/)
})
test('🪤 el conflicto solo se reabre si la marca ya caducó (DO UPDATE ... WHERE caduca_at < now()) (lee el fuente)', () => {
  assert.match(CODIGO, /ON CONFLICT \(gmail_message_id, tipo\) DO UPDATE SET caduca_at = EXCLUDED\.caduca_at, datos = EXCLUDED\.datos\s+WHERE correduria_pendiente_tg\.caduca_at < now\(\)\s+RETURNING id/)
  assert.ok(!/DO NOTHING/.test(CODIGO))
})
test('🪤 si el asistente lanza, la marca se borra (DELETE por id) antes de devolver el error (lee el fuente)', () => {
  const m = CODIGO.match(/try \{\s*await manejarCorreduriaTg\([^\n]*\n\s*\} catch \(e\) \{([\s\S]*?)throw e\s*\}/)
  assert.ok(m, 'try/catch alrededor de manejarCorreduriaTg')
  assert.match(m![1], /DELETE FROM correduria_pendiente_tg WHERE id = \$\{marca\[0\]\.id\}/)
})
test('🪤 el texto de Telegram es honesto: avisa de reintentar en 15 min (lee el fuente)', () => {
  assert.match(CODIGO, /si no ves su propuesta en un momento, vuelve a pulsar 💶 en 15 min/)
  assert.ok(!/Lead de \$\{RAMO_TXT\[ramo\]\} pasado al asistente \(#clp/.test(CODIGO))
})
test('🪤 la entrega pasa por instruccionAvant2 (solo ids) (lee el fuente)', () => {
  assert.match(CODIGO, /manejarCorreduriaTg\(instruccionAvant2\(\{ clienteId: datos\.clienteId, oportunidadId, ramo \}\), quien\)/)
})
test('🪤 el asistente sigue con botón para el precio: PRECIO_SIN_BOTON = false (lee el fuente)', () => {
  const a = readFileSync(new URL('../correduria-asistente-telegram.ts', import.meta.url), 'utf8')
  assert.match(a, /const PRECIO_SIN_BOTON = false/)
})
test('🪤 resolverBotonClp enruta cds a la entrega (lee el fuente)', () => {
  const p = readFileSync(new URL('./lead-correduria-pendiente.ts', import.meta.url), 'utf8')
  assert.match(p, /if \(d\.accion === 'cds'\) return \(await import\('\.\/lead-correduria-avant2-proceso'\)\)\.resolverAvant2Clp\(d\.id, d\.ramo, d\.quien\)/)
})
test('🪤 «ningún bot llega a precio» tras 🤖 ofrece 💶 con el id del pendiente (lee el fuente)', () => {
  const t = readFileSync(new URL('./lead-correduria-tarificar-proceso.ts', import.meta.url), 'utf8')
  assert.match(t, /const avant2 = ramosAvant2\(rev\)\s*if \(avant2\.length\) await tgSendButtons\(textoOfertaAvant2\(avant2\), botonesAvant2\(id, avant2\)\)/)
})
test('🪤 el aviso «Listo para tarificar» sin 🤖 ofrece 💶 (lee el fuente)', () => {
  const t = readFileSync(new URL('./lead-correduria-tarificar-proceso.ts', import.meta.url), 'utf8')
  assert.match(t, /botonesAvant2\(ancla, avant2\)/)
})
