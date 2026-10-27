import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { aceptaDatos, elegirTotal } from './borrador.ts'

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

// (1a) El huésped manda sus datos UNA vez: un re-POST no reescribe el borrador que Alberto está revisando.
test('huésped: solo con la solicitud pendiente; Alberto: siempre que no esté cancelada', () => {
  assert.deepEqual(aceptaDatos('publico', 'pendiente'), { ok: true })
  assert.deepEqual(aceptaDatos('publico', 'completada'), { ok: false, codigo: 'ya_recibida' })
  assert.deepEqual(aceptaDatos('publico', 'cancelada'), { ok: false, codigo: 'no_valida' })
  assert.deepEqual(aceptaDatos('alberto', 'completada'), { ok: true })
  assert.deepEqual(aceptaDatos('alberto', 'pendiente'), { ok: true })
  assert.deepEqual(aceptaDatos('alberto', 'cancelada'), { ok: false, codigo: 'no_valida' })
})

test('el UPDATE público va condicionado a pendiente (dos envíos a la vez → gana uno) y la ruta contesta 409', () => {
  const s = src('./servicio.ts')
  assert.match(s, /aceptaDatos\(via, s\.estado\)/)
  assert.match(s, /updateMany\(\{\s*where: \{ id: s\.id, estado: via === 'publico' \? 'pendiente'/)
  const ruta = src('../../../app/api/publico/factura/[token]/route.ts')
  assert.match(ruta, /r\.codigo === 'ya_recibida'\) return NextResponse\.json\(\{ error: TEXTO_YA_RECIBIDA[^\n]*status: 409/)
  const pagina = src('../../../app/factura/[token]/page.tsx')
  assert.match(pagina, /v\.completada\s*\n?\s*\? <p role="status">\{TEXTO_YA_RECIBIDA\}<\/p>/)
})

// (2) Un reenvío no machaca el total manual de Alberto, y sin importe no deja receptor nuevo/viejo descuadrado.
test('total: manual de ahora > manual guardado > amount_gross > último conocido > null', () => {
  assert.deepEqual(elegirTotal({ totalManual: 123.456, totalReserva: 500, existente: null }), { total: 123.46, manual: true })
  assert.deepEqual(elegirTotal({ totalManual: null, totalReserva: 500, existente: { total: 450, manual: true } }), { total: 450, manual: true })
  assert.deepEqual(elegirTotal({ totalReserva: null, existente: { total: 450, manual: true } }), { total: 450, manual: true })
  assert.deepEqual(elegirTotal({ totalReserva: 500, existente: { total: 450, manual: false } }), { total: 500, manual: false })
  assert.deepEqual(elegirTotal({ totalReserva: null, existente: { total: 450, manual: false } }), { total: 450, manual: false })
  assert.equal(elegirTotal({ totalReserva: null, existente: null }), null)
  assert.equal(elegirTotal({ totalManual: 0, totalReserva: null, existente: null }), null)
})

test('prepararBorrador usa elegirTotal con el borrador existente y guarda total_manual', () => {
  const s = src('./servicio.ts')
  const cuerpo = s.slice(s.indexOf('async function prepararBorrador'), s.indexOf('/** Borrador → aviso a Alberto'))
  assert.ok(cuerpo.indexOf('sivraFacturaHuesped.findFirst') < cuerpo.indexOf('elegirTotal('), 'el existente se lee ANTES de elegir el total')
  assert.match(cuerpo, /existente: existente \? \{ total: Number\(existente\.total\), manual: existente\.totalManual \}/)
  assert.match(cuerpo, /totalManual: elegido\.manual/)
})
