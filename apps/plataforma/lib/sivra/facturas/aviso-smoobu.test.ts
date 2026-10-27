// Aviso al huésped por Smoobu tras el correo de la factura: texto bilingüe, fail-open y solo en la transición a `enviada`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { avisarFacturaEnSmoobu, correoYAviso, lineaAviso, nombreSaludo, textoAvisoFactura, type DepsAviso } from './aviso-smoobu.ts'

const datos = { reservationId: '155000111', nombre: 'Ana López', numero: '2026-046', email: 'ana@example.com' }

test('texto bilingüe ES/EN con nombre, número y correo', () => {
  const t = textoAvisoFactura(datos)
  assert.match(t, /^Hola Ana López, te hemos enviado la factura 2026-046 a ana@example\.com\. Si no la ves, revisa la carpeta de spam\. ¡Gracias por tu estancia!/)
  assert.match(t, /Hi Ana López, we have sent invoice 2026-046 to ana@example\.com\. If you can't find it, please check your spam folder\. Thanks for staying with us!$/)
})

test('nombre del saludo: particular → receptor; empresa → persona de la reserva (o la empresa si no se sabe)', () => {
  assert.equal(nombreSaludo({ tipo: 'particular', nombre: 'Ana López' }, 'Otro Nombre'), 'Ana López')
  assert.equal(nombreSaludo({ tipo: 'empresa', nombre: 'Acme SL' }, '  John   Smith '), 'John Smith')
  assert.equal(nombreSaludo({ tipo: 'empresa', nombre: 'Acme SL' }, null), 'Acme SL')
})

function deps(over: Partial<DepsAviso> = {}) {
  const enviados: Array<[string, string]> = []
  const d: DepsAviso = {
    yaEnviado: async () => false,
    enviar: async (rid, t) => { enviados.push([rid, t]); return { ok: true } },
    ...over,
  }
  return { d, enviados }
}

test('Smoobu OK → enviado, por la reserva de la factura', async () => {
  const { d, enviados } = deps()
  assert.deepEqual(await avisarFacturaEnSmoobu(datos, d), { estado: 'enviado' })
  assert.equal(enviados.length, 1)
  assert.equal(enviados[0][0], '155000111')
  assert.equal(lineaAviso({ estado: 'enviado' }), '📧 correo enviado · 💬 aviso en Smoobu enviado')
})

test('Smoobu falla → no_enviado con el motivo (fail-open, sin reintento)', async () => {
  let llamadas = 0
  const { d } = deps({ enviar: async () => { llamadas++; return { ok: false, status: 503, motivo: { texto: 'Smoobu está caído (503).' } } } })
  const r = await avisarFacturaEnSmoobu(datos, d)
  assert.deepEqual(r, { estado: 'no_enviado', motivo: 'Smoobu está caído (503).' })
  assert.equal(llamadas, 1)
  assert.equal(lineaAviso(r), '📧 correo enviado · ⚠️ aviso en Smoobu no enviado: Smoobu está caído (503).')
  // Una excepción tampoco escapa.
  const { d: d2 } = deps({ enviar: async () => { throw new Error('red') } })
  assert.deepEqual(await avisarFacturaEnSmoobu(datos, d2), { estado: 'no_enviado', motivo: 'red' })
})

test('ya consta el mismo texto en mensajes_enviados → no se repite', async () => {
  const { d, enviados } = deps({ yaEnviado: async () => true })
  assert.deepEqual(await avisarFacturaEnSmoobu(datos, d), { estado: 'ya_avisado' })
  assert.equal(enviados.length, 0)
})

test('correoYAviso: el correo falla → ni se marca enviada ni se avisa', async () => {
  let marcada = 0, avisos = 0
  const r = await correoYAviso({
    enviarCorreo: async () => { throw new Error('SMTP 550') },
    marcarEnviada: async () => { marcada++; return 1 },
    avisar: async () => { avisos++; return { estado: 'enviado' } },
  })
  assert.deepEqual(r, { ok: false, motivo: 'SMTP 550' })
  assert.equal(marcada, 0)
  assert.equal(avisos, 0)
})

test('correoYAviso: éxito → marca y avisa una vez; sin transición (0 filas) no avisa; Smoobu que lanza no tumba el envío', async () => {
  let avisos = 0
  const ok = await correoYAviso({ enviarCorreo: async () => {}, marcarEnviada: async () => 1, avisar: async () => { avisos++; return { estado: 'enviado' } } })
  assert.deepEqual(ok, { ok: true, aviso: { estado: 'enviado' } })
  assert.equal(avisos, 1)
  const sinTransicion = await correoYAviso({ enviarCorreo: async () => {}, marcarEnviada: async () => 0, avisar: async () => { avisos++; return { estado: 'enviado' } } })
  assert.equal(sinTransicion.ok, true)
  assert.equal(avisos, 1)
  const lanza = await correoYAviso({ enviarCorreo: async () => {}, marcarEnviada: async () => 1, avisar: async () => { throw new Error('boom') } })
  assert.deepEqual(lanza, { ok: true, aviso: { estado: 'no_enviado', motivo: 'boom' } })
})

// Cableado: enviarFactura usa correoYAviso, la transición va condicionada a 'emitida' y el aviso sale por enviar.ts.
test('enviarFactura cablea el aviso tras la transición a enviada y por enviarAlHuespedDetallado', () => {
  const src = readFileSync(new URL('./emitir.ts', import.meta.url), 'utf8')
  const envio = src.slice(src.indexOf('export async function enviarFactura'))
  assert.match(envio, /correoYAviso\(\{/)
  assert.match(envio, /marcarEnviada: \(\) => prisma\.\$executeRaw\(Prisma\.sql`\s*UPDATE sivra_facturas_huesped SET estado = 'enviada'[^`]*AND estado = 'emitida'`\)/)
  assert.match(envio, /enviar: \(rid, t\) => enviarAlHuespedDetallado\(rid, t\)/)
  assert.match(envio, /FROM mensajes_enviados WHERE booking_id = \$\{rid\} AND texto = \$\{t\}/)
  const acciones = readFileSync(new URL('./telegram-acciones.ts', import.meta.url), 'utf8')
  assert.match(acciones, /lineaAviso\(r\.aviso\)/)
})
