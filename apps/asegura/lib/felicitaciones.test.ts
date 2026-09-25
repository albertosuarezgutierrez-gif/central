// Cepos de la felicitación de cumpleaños. Leen el FUENTE donde la pieza vive dentro de Prisma/SQL.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { cuerpoFelicitacion } from './correo-felicitacion.ts'

const src = readFileSync(new URL('./felicitaciones.ts', import.meta.url), 'utf8')

test('🚨 solo cartera EN VIGOR y nunca una sociedad: 32.520 leads no reciben felicitación', () => {
  assert.match(src, /\.\.\.WHERE_CARTERA_EN_VIGOR/)
  assert.match(src, /NOT: \{ tipoPersona: 'juridica' \}/)
})

test('🚨 apagado por defecto: sin ASEGURA_FELICITACIONES_ACTIVAS=1 no se escribe a nadie', () => {
  assert.match(src, /env\?\.trim\(\) === '1'/)
  const cuerpo = src.slice(src.indexOf('r.cumpleHoy += 1'))
  assert.ok(cuerpo.indexOf('if (soloContar) continue') < cuerpo.indexOf('insert into felicitacion'))
})

test('🚨 la fila se RESERVA antes de enviar, y sin reserva no hay correo', () => {
  const cuerpo = src.slice(src.indexOf('r.cumpleHoy += 1'))
  assert.ok(cuerpo.indexOf('on conflict (cliente_id, anio) do nothing') < cuerpo.indexOf('enviarFelicitacion('))
  assert.match(cuerpo, /if \(reservada === 0\) \{ r\.yaFelicitados \+= 1; continue \}/)
})

test('el correo felicita y no vende: sin pólizas, compañías, precios ni ofertas', () => {
  const c = cuerpoFelicitacion({ nombre: 'María', enlace: 'https://clientes.grupoasegura.es' })
  assert.match(c.asunto, /Feliz cumpleaños, María/)
  const todo = `${c.asunto}\n${c.texto}\n${c.html}`.toLowerCase()
  for (const p of ['póliza', 'oferta', 'descuento', 'precio', 'ahorr', '€', 'renueva', 'mapfre', 'allianz']) {
    assert.ok(!todo.includes(p), `el correo no puede decir «${p}»`)
  }
  assert.match(c.texto, /dejamos de enviarlas/)
  assert.throws(() => cuerpoFelicitacion({ nombre: null, enlace: 'http://x.es' }), /enlace_no_https/)
})

test('🚨 sin proveedor de correo se SUELTA la reserva: el reintento del día aún felicita', () => {
  const cuerpo = src.slice(src.indexOf("if (res === 'sin_proveedor')"))
  const borra = cuerpo.indexOf('delete from felicitacion')
  assert.ok(borra >= 0 && borra < cuerpo.indexOf("throw new Error('sin_correo_configurado')"))
})

test('el correo lleva el logo en PNG desde la web pública y existe en el disco', () => {
  const c = cuerpoFelicitacion({ nombre: 'María', enlace: 'https://clientes.grupoasegura.es' })
  const m = c.html.match(/<img src="https:\/\/grupoasegura\.es(\/brand\/[^"]+\.png)"/)
  assert.ok(m, 'la felicitación no lleva el logotipo en PNG (Gmail no pinta SVG)')
  // Un <img> a un fichero que no está no rompe nada: pinta el icono roto y solo lo ve el cliente.
  assert.ok(existsSync(new URL(`../../asegura-web/public${m![1]}`, import.meta.url)), `${m![1]} no está en apps/asegura-web/public`)
})
