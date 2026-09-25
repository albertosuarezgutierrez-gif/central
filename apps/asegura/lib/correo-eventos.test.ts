// Cepos del seguimiento de correos (25/09/2026). Lo puro se prueba de verdad; lo que vive con Prisma se
// vigila leyendo el FUENTE, porque este job de CI no genera el cliente.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { etiquetaTipo, interpretarEventoCorreo } from './correo-eventos.ts'

const fuente = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8')

test('entregado: id de Resend, tipo y la hora del EVENTO (no la de recepción)', () => {
  const e = interpretarEventoCorreo({
    type: 'email.delivered',
    created_at: '2026-09-25T16:00:07.000Z',
    data: { email_id: 'abc-123', to: ['rafael@example.com'], created_at: '2026-09-25T16:00:01.000Z' },
  })
  assert.ok(e)
  assert.equal(e.tipo, 'email.delivered')
  assert.equal(e.resendId, 'abc-123')
  assert.equal(e.ocurridoEn.toISOString(), '2026-09-25T16:00:07.000Z')
  assert.deepEqual(e.detalle, {})
})

test('clic: guarda enlace, IP y navegador — y nunca la dirección del destinatario', () => {
  const e = interpretarEventoCorreo({
    type: 'email.clicked',
    created_at: '2026-09-25T17:10:00.000Z',
    data: {
      email_id: 'abc-123', to: ['rafael@example.com'],
      click: { link: 'https://clientes.grupoasegura.es', ipAddress: '81.0.0.1', userAgent: 'Mozilla/5.0 iPhone', timestamp: '2026-09-25T17:10:00.000Z' },
    },
  })
  assert.ok(e)
  assert.deepEqual(e.detalle, { enlace: 'https://clientes.grupoasegura.es', ip: '81.0.0.1', navegador: 'Mozilla/5.0 iPhone' })
  assert.ok(!JSON.stringify(e).includes('rafael@example.com'), 'el evento guardado no puede llevar el correo del cliente')
})

test('rebote: guarda el motivo, que es lo que se enseña si el cliente dice «no me llegó»', () => {
  const e = interpretarEventoCorreo({
    type: 'email.bounced', created_at: '2026-09-25T16:00:09Z',
    data: { email_id: 'x', bounce: { message: 'mailbox full', type: 'Transient', subType: 'MailboxFull' } },
  })
  assert.deepEqual(e?.detalle, { motivo: 'mailbox full', tipoRebote: 'Transient', subtipoRebote: 'MailboxFull' })
})

test('lo que no es un evento de correo, o viene cojo, no se guarda', () => {
  assert.equal(interpretarEventoCorreo({ type: 'contact.created', created_at: '2026-09-25T16:00:00Z', data: { email_id: 'x' } }), null)
  assert.equal(interpretarEventoCorreo({ type: 'email.opened', created_at: '2026-09-25T16:00:00Z', data: {} }), null)
  assert.equal(interpretarEventoCorreo({ type: 'email.opened', created_at: 'ayer', data: { email_id: 'x' } }), null)
  assert.equal(interpretarEventoCorreo(null), null)
})

test('la etiqueta de Resend solo lleva caracteres válidos', () => {
  assert.equal(etiquetaTipo('felicitacion'), 'felicitacion')
  assert.equal(etiquetaTipo('invitación portal'), 'invitacion_portal')
})

test('🚨 el webhook guarda el evento, NO deja que su fallo bloquee la recaptación, y si falló responde 500', () => {
  const src = fuente('../app/api/webhooks/resend/route.ts')
  const guarda = src.indexOf('registrarEventoCorreo(')
  assert.ok(guarda > 0, 'el webhook no guarda los eventos de correo')
  const recaptacion = src.indexOf('update recaptacion_envios')
  assert.ok(guarda < recaptacion, 'el evento tiene que guardarse antes de la lógica de recaptación')
  const tramo = src.slice(guarda, recaptacion)
  assert.doesNotMatch(tramo, /return NextResponse/, 'un fallo al guardar el evento no puede cortar la recaptación (bajas por rebote)')
  assert.match(src, /seguimientoCaido\s*\?[\s\S]{0,120}status: 500/, 'un evento que no se pudo guardar tiene que acabar en 500 para que Resend lo reintente')
})

test('🚨 todo correo que sale por el punto único deja fila en correo_envio, salga bien o mal', () => {
  const src = fuente('./correo-envio.ts')
  // API ok, API rechazada, API caída, SMTP ok, SMTP fallido.
  assert.ok((src.match(/registrarEnvioCorreo\(/g) ?? []).length >= 5, 'algún camino de envío no deja constancia')
  assert.match(src, /api\.resend\.com\/emails/, 'sin la API de Resend no hay id y no hay eventos que atar al cliente')
})

test('🚨 la felicitación sale por el punto único con seguimiento', () => {
  assert.match(fuente('./correo-felicitacion.ts'), /enviarCorreoCliente\(/)
  assert.doesNotMatch(fuente('./correo-felicitacion.ts'), /sendMail\(/, 'la felicitación no puede salir por SMTP directo: se perdería el seguimiento')
})
