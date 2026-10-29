import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { botonesPropuesta, botonReintento, decidirBotonFactura, mensajeVigente, textoPropuesta, urlModificar, PREFIJO_FACTURA_HUESPED } from './telegram.ts'

const ID = '0b6f6d1e-2c4a-4f7e-9a51-3d2e1c0b9a88'
const CHAT = '111222333'

test('solo la PERSONA autorizada (from.id = TELEGRAM_CHAT_ID) puede emitir', () => {
  assert.deepEqual(decidirBotonFactura({ from: { id: 111222333 } }, 'emi', [ID], CHAT), { ok: true, accion: 'emi', facturaId: ID, quien: CHAT })
  for (const from of [{ id: 999 }, {}, undefined]) assert.equal(decidirBotonFactura({ from } as never, 'emi', [ID], CHAT).ok, false)
  // Sin chat configurado: nadie (fail-closed).
  assert.equal(decidirBotonFactura({ from: { id: CHAT } }, 'emi', [ID], undefined).ok, false)
  assert.equal(decidirBotonFactura({ from: { id: CHAT } }, 'emi', [ID], '').ok, false)
})

test('forma cerrada: acción conocida y un único uuid', () => {
  for (const [a, args] of [['borrar', [ID]], ['emi', []], ['emi', [ID, 'x']], ['emi', ['1; DROP']], ['emi', [ID.toUpperCase()]]] as const) {
    assert.equal(decidirBotonFactura({ from: { id: CHAT } }, a, args, CHAT).ok, false, `${a} ${args}`)
  }
})

test('callback_data ≤ 64 bytes y con prefijo propio', () => {
  for (const b of [...botonesPropuesta(ID, 'https://x.es/sivra/facturas?reserva=1').flat(), ...botonReintento(ID).flat()]) {
    if (!b.callback) continue
    assert.ok(Buffer.byteLength(b.callback, 'utf8') <= 64, b.callback)
    assert.ok(b.callback.startsWith(`${PREFIJO_FACTURA_HUESPED}_`))
  }
})

test('botones del borrador: ✅ Enviar = fhu_emi (emite y envía) y ✏️ Modificar = ENLACE a la reserva (no emite)', () => {
  const [[env, mod]] = botonesPropuesta(ID, urlModificar('https://plataforma.x/', '157416681'))
  assert.equal(env.texto, '✅ Enviar')
  assert.equal(env.callback, `${PREFIJO_FACTURA_HUESPED}_emi:${ID}`)
  assert.equal(mod.texto, '✏️ Modificar')
  assert.equal(mod.callback, undefined)
  assert.equal(mod.url, 'https://plataforma.x/sivra/facturas?reserva=157416681')
  const alta = readFileSync(new URL('../../../app/(usuario)/sivra/facturas/AltaManual.tsx', import.meta.url), 'utf8')
  assert.match(alta, /new URLSearchParams\(window\.location\.search\)\.get\('reserva'\)/)
})

test('el prefijo está enrutado en el webhook y no lo usa nadie más', () => {
  const ruta = readFileSync(new URL('../../../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url), 'utf8')
  assert.match(ruta, /prefix === PREFIJO_FACTURA_HUESPED/)
  assert.match(ruta, /decidirBotonFactura\(cb, action, args, process\.env\.TELEGRAM_CHAT_ID\)/)
  assert.doesNotMatch(ruta, /prefix === 'fhu'/)
})

test('el texto escapa lo que escribe el huésped y avisa del bloqueo', () => {
  const t = textoPropuesta({
    piso: 'House sevillana', reservationId: '157416681', estanciaDesde: '2027-07-31', estanciaHasta: '2027-08-03',
    receptor: { tipo: 'empresa', nombre: '<b>Evil</b>', nif: 'B12345678', pais: 'ES', email: 'a@b.es', direccion: { pais: 'ES', cp: '41003', provincia: 'Sevilla', municipio: 'Sevilla', via: 'CL SOCORRO', numero: '24', resto: null, viaCatastro: true } },
    total: 363, base: null, cuota: null, tipoIva: null, bloqueo: 'falta configurar IVA/serie: falta el tipo de IVA',
  })
  assert.doesNotMatch(t, /<b>Evil<\/b>/)
  assert.match(t, /&lt;b&gt;Evil/)
  assert.match(t, /363,00€/)
  assert.match(t, /falta configurar IVA\/serie/)
  assert.match(t, /no emitirá/)
})

test('el texto del borrador lleva email, CC y el número que tendría', () => {
  const t = textoPropuesta({
    piso: 'House Sevillana', reservationId: '1', estanciaDesde: null, estanciaHasta: null,
    receptor: { tipo: 'empresa', nombre: 'Laie SL', nif: 'B08549784', pais: 'ES', email: 'info@laie.es', direccion: { pais: 'ES', cp: '41003', provincia: 'Sevilla', municipio: 'Sevilla', via: 'CL SOCORRO', numero: '24', resto: null, viaCatastro: true } },
    total: 363, base: 330, cuota: 33, tipoIva: 10, bloqueo: null, cc: ['lcalles@laie.es'], numeroPrevisto: 'HS-2026-047',
  })
  assert.match(t, /✉️ info@laie\.es · CC lcalles@laie\.es/)
  assert.match(t, /Nº que tendría: <b>HS-2026-047<\/b>/)
  assert.match(t, /B08549784/)
  assert.match(t, /Nada sale sin tu botón/)
})

// (1b) El ✅ emite lo que hay en BD: solo vale si es el del mensaje VIGENTE (el que enseña esos datos).
test('mensajeVigente: igual = sí; distinto, o sin dato por cualquier lado = NO (fail-closed)', () => {
  assert.equal(mensajeVigente(BigInt(4242), 4242), true)
  assert.equal(mensajeVigente(4242, 4242), true)
  assert.equal(mensajeVigente(BigInt(4242), 4241), false)
  assert.equal(mensajeVigente(null, 4242), false, 'borrador regenerado (id anulado) o aviso silenciado')
  assert.equal(mensajeVigente(BigInt(4242), null), false)
  assert.equal(mensajeVigente(BigInt(4242), undefined), false)
})

test('el ✅ comprueba el mensaje BAJO el FOR UPDATE y el borrador regenerado anula el mensaje viejo', () => {
  const emitir = readFileSync(new URL('./emitir.ts', import.meta.url), 'utf8')
  const tx = emitir.slice(emitir.indexOf('export async function emitirFactura'), emitir.indexOf('const pdf = await generarPdfFactura'))
  assert.match(tx, /telegram_message_id\s*\n\s*FROM sivra_facturas_huesped WHERE id = \$\{facturaId\}::uuid FOR UPDATE/)
  assert.match(tx, /if \(!mensajeVigente\(f\.telegram_message_id, mensajeId\)\) return \{ estado: 'obsoleta' \}/)
  const acciones = readFileSync(new URL('./telegram-acciones.ts', import.meta.url), 'utf8')
  assert.match(acciones, /emitirFactura\(d\.facturaId, mensajeId\)/)
  const webhook = readFileSync(new URL('../../../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url), 'utf8')
  assert.match(webhook, /resolverBotonFactura\(d, mensajeId \?\? null\)/)
  const servicio = readFileSync(new URL('./servicio.ts', import.meta.url), 'utf8')
  assert.match(servicio, /updateMany\(\{ where: \{ id: existente\.id, estado: 'borrador' \}, data: \{ \.\.\.datos, telegramMessageId: null,/)
})

// (5) Un envío colgado sin `envio_error` (pudo salir) NO se vuelve a reclamar solo: solo con `forzar` de Alberto.
test('enviarFactura no reclama automáticamente un envío dudoso', () => {
  const emitir = readFileSync(new URL('./emitir.ts', import.meta.url), 'utf8')
  const envio = emitir.slice(emitir.indexOf('export async function enviarFactura'), emitir.indexOf('const fallo = async'))
  const where = envio.slice(envio.indexOf('WHERE id ='), envio.indexOf('RETURNING'))
  assert.match(where, /envio_en_curso_at IS NULL/)
  // La única vía a un reclamo viejo es con forzar: ningún «OR envio_en_curso_at < …» sin la condición de forzar.
  assert.doesNotMatch(where.replace(/\(\$\{opts\.forzar === true\} AND envio_en_curso_at < now\(\) - interval '10 minutes'\)/, ''), /envio_en_curso_at </)
  assert.match(envio, /\{ estado: 'dudoso' \}/)
  const ruta = readFileSync(new URL('../../../app/api/sivra/facturas/[id]/route.ts', import.meta.url), 'utf8')
  assert.match(ruta, /enviarFactura\(id, \{ forzar: b\.forzar === true \}\)/)
  for (const f of ['./telegram-acciones.ts']) assert.doesNotMatch(readFileSync(new URL(f, import.meta.url), 'utf8'), /forzar/)
})

// (6) Rendimiento UI: los borradores se pintan de 50 en 50 y la rejilla no desborda a 320 px.
test('/sivra/facturas: borradores con «Ver más» y grid minmax(0, 1fr)', () => {
  const page = readFileSync(new URL('../../../app/(usuario)/sivra/facturas/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /\.borradores \?\? \[\]\)\.slice\(0, borradoresVisibles\)\.map/)
  assert.match(page, /setBorradoresVisibles\(\(v\) => v \+ PASO\)/)
  assert.match(page, /display: 'grid', gap: 8, gridTemplateColumns: 'minmax\(0, 1fr\)'/)
})
