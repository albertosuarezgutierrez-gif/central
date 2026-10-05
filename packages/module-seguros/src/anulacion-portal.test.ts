// Baja pedida por el cliente desde el portal: el mapeo de sus tres motivos, las compuertas y la retención de 48 h.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HORAS_RETENCION_PORTAL, MOTIVOS_PORTAL, liberaSolaAt, liberadaParaFirma, siguientePaso, solicitudDesdePortal } from './anulacion.ts'

const ctx = { vencimiento: '2027-01-10', hoy: '2026-10-05' }

test('los tres motivos del portal y las 48 h son los del diseño', () => {
  assert.deepEqual([...MOTIVOS_PORTAL], ['venta', 'precio', 'otro'])
  assert.equal(HORAS_RETENCION_PORTAL, 48)
})

test('venta → anticipada con efecto = fecha de venta, motivo venta_del_bien, pedida por el cliente', () => {
  const r = solicitudDesdePortal({ motivo: 'venta', fechaVenta: '2026-10-01' }, ctx)
  assert.ok(r.ok)
  assert.equal(r.solicitud.tipo, 'inmediata')
  assert.equal(r.solicitud.fechaEfecto, '2026-10-01')
  assert.equal(r.solicitud.motivo, 'venta_del_bien')
  assert.equal(r.solicitud.solicitadaPor, 'cliente')
  assert.equal(r.solicitud.origen, 'portal')
  assert.equal(r.solicitud.fechaVenta, '2026-10-01')
  assert.equal(r.solicitud.liberadaDeEntrada, true, 'efecto ya pasado (≤3 días): nace liberada')
})

test('venta: sin fecha, futura, de hace más de 90 días o posterior al vencimiento → se rechaza', () => {
  assert.equal(solicitudDesdePortal({ motivo: 'venta' }, ctx).ok, false)
  const futura = solicitudDesdePortal({ motivo: 'venta', fechaVenta: '2026-10-20' }, ctx)
  assert.ok(!futura.ok && /futura/.test(futura.motivo))
  const vieja = solicitudDesdePortal({ motivo: 'venta', fechaVenta: '2026-06-01' }, ctx)
  assert.ok(!vieja.ok && /90 días/.test(vieja.motivo))
  const tarde = solicitudDesdePortal({ motivo: 'venta', fechaVenta: '2026-10-05' }, { ...ctx, vencimiento: '2026-10-01' })
  assert.ok(!tarde.ok && /posterior al vencimiento/.test(tarde.motivo))
  // El borde: exactamente 90 días atrás todavía vale.
  assert.ok(solicitudDesdePortal({ motivo: 'venta', fechaVenta: '2026-07-07' }, ctx).ok)
  assert.equal(solicitudDesdePortal({ motivo: 'venta', fechaVenta: '2026-07-06' }, ctx).ok, false)
})

test('una venta con el efecto a más de 3 días... no existe: el efecto de una venta ya pasó, y por eso nace liberada', () => {
  const r = solicitudDesdePortal({ motivo: 'venta', fechaVenta: '2026-10-05' }, ctx)
  assert.ok(r.ok && r.solicitud.liberadaDeEntrada)
})

test('precio sin haber visto la oferta → ofrecer_presupuesto; viéndola → no renovación al vencimiento', () => {
  const sin = solicitudDesdePortal({ motivo: 'precio' }, ctx)
  assert.ok(!sin.ok)
  assert.equal(sin.error, 'ofrecer_presupuesto')
  assert.equal(solicitudDesdePortal({ motivo: 'precio', ofertaPrecioVista: 'true' }, ctx).ok, false, 'solo true booleano')
  const con = solicitudDesdePortal({ motivo: 'precio', ofertaPrecioVista: true }, ctx)
  assert.ok(con.ok)
  assert.equal(con.solicitud.tipo, 'no_renovacion')
  assert.equal(con.solicitud.fechaEfecto, '2027-01-10')
  assert.equal(con.solicitud.motivo, 'precio')
  assert.equal(con.solicitud.fechaVenta, null)
  assert.equal(con.solicitud.liberadaDeEntrada, false, 'efecto lejano: pasa por la retención de 48 h')
})

test('otro sin texto → error; con texto → no renovación con motivo otro', () => {
  assert.equal(solicitudDesdePortal({ motivo: 'otro' }, ctx).ok, false)
  assert.equal(solicitudDesdePortal({ motivo: 'otro', motivoTexto: '   ' }, ctx).ok, false)
  const r = solicitudDesdePortal({ motivo: 'otro', motivoTexto: 'Me voy al extranjero' }, ctx)
  assert.ok(r.ok)
  assert.equal(r.solicitud.motivo, 'otro')
  assert.equal(r.solicitud.motivoTexto, 'Me voy al extranjero')
  assert.equal(r.solicitud.tipo, 'no_renovacion')
})

test('motivo desconocido o cuerpo vacío → error; sin vencimiento no hay baja al vencimiento', () => {
  assert.equal(solicitudDesdePortal({ motivo: 'competidor' }, ctx).ok, false)
  assert.equal(solicitudDesdePortal(null, ctx).ok, false)
  assert.equal(solicitudDesdePortal({ motivo: 'otro', motivoTexto: 'x' }, { ...ctx, vencimiento: null }).ok, false)
})

test('menos de 30 días al vencimiento: pasa, pero con aviso; con margen, sin aviso', () => {
  const cerca = solicitudDesdePortal({ motivo: 'otro', motivoTexto: 'x' }, { hoy: '2026-10-05', vencimiento: '2026-10-25' })
  assert.ok(cerca.ok && /menos de 30 días/.test(cerca.advertencia ?? ''))
  const lejos = solicitudDesdePortal({ motivo: 'otro', motivoTexto: 'x' }, ctx)
  assert.ok(lejos.ok && lejos.advertencia === null)
  // La venta no es una no renovación: el preaviso del art. 22 no le aplica.
  const venta = solicitudDesdePortal({ motivo: 'venta', fechaVenta: '2026-10-04' }, { hoy: '2026-10-05', vencimiento: '2026-10-25' })
  assert.ok(venta.ok && venta.advertencia === null)
})

test('efecto a 3 días o menos nace liberada; a 4, no', () => {
  const tres = solicitudDesdePortal({ motivo: 'otro', motivoTexto: 'x' }, { hoy: '2026-10-05', vencimiento: '2026-10-08' })
  assert.ok(tres.ok && tres.solicitud.liberadaDeEntrada)
  const cuatro = solicitudDesdePortal({ motivo: 'otro', motivoTexto: 'x' }, { hoy: '2026-10-05', vencimiento: '2026-10-09' })
  assert.ok(cuatro.ok && !cuatro.solicitud.liberadaDeEntrada)
})

test('🪤 retención: borde de las 48 h exacto; liberada a mano o del corredor, firmable siempre', () => {
  const createdAt = new Date('2026-10-05T10:00:00Z')
  const retenida = { origen: 'portal' as const, liberadaAt: null, createdAt }
  assert.equal(liberadaParaFirma(retenida, new Date('2026-10-05T10:00:01Z')), false)
  assert.equal(liberadaParaFirma(retenida, new Date('2026-10-07T09:59:59.999Z')), false, 'un milisegundo antes de las 48 h')
  assert.equal(liberadaParaFirma(retenida, new Date('2026-10-07T10:00:00Z')), true, 'a las 48 h clavadas, se libera sola')
  assert.equal(liberaSolaAt(createdAt).toISOString(), '2026-10-07T10:00:00.000Z')
  assert.equal(liberadaParaFirma({ ...retenida, liberadaAt: new Date('2026-10-05T11:00:00Z') }, new Date('2026-10-05T11:00:01Z')), true)
  assert.equal(liberadaParaFirma({ origen: 'corredor', liberadaAt: null, createdAt }, createdAt), true, 'la del corredor nunca se retiene')
})

test('siguiente paso de una pedida por el cliente: llámale y cuándo se libera sola', () => {
  const a = { estado: 'solicitada' as const, fechaEfecto: '2027-01-10', compania: 'MAPFRE', pedidaPorCliente: { liberaSolaAt: '2026-10-07T10:00:00.000Z' } }
  const p = siguientePaso(a, '2026-10-05')!
  assert.match(p.texto, /Pedida por el cliente: llámale; se libera sola el 07\/10\/2026 a las 12:00/)
  assert.equal(p.alerta, true)
  assert.match(siguientePaso({ ...a, pedidaPorCliente: null }, '2026-10-05')!.texto, /Falta la firma del cliente/)
})

test('precio: compañía y precio ofrecido (opcionales) → texto estable en formato español', () => {
  const ok = (extra: Record<string, unknown>) => {
    const r = solicitudDesdePortal({ motivo: 'precio', ofertaPrecioVista: true, ...extra }, ctx)
    assert.ok(r.ok)
    return r.solicitud.motivoTexto
  }
  assert.equal(ok({ competidor: 'Mapfre', precioOfrecido: 123.45 }), 'competidor: Mapfre · precio_ofrecido: 123,45€')
  assert.equal(ok({ competidor: 'Línea Directa', precioOfrecido: '1.234,5' }), 'competidor: Línea Directa · precio_ofrecido: 1.234,50€')
  assert.equal(ok({ precioOfrecido: '2162,49 €' }), 'precio_ofrecido: 2.162,49€')
  assert.equal(ok({ precioOfrecido: 1000 }), 'precio_ofrecido: 1.000,00€', 'miles con punto también en 4 cifras')
  assert.equal(ok({ competidor: 'AXA' }), 'competidor: AXA')
  assert.equal(ok({}), null, 'sin nada, no se inventa texto')
  assert.equal(ok({ competidor: '  ', precioOfrecido: '' }), null)
})

test('precio: texto saneado (sin saltos ni «·»), ≤120 caracteres; un precio absurdo es error', () => {
  const r = solicitudDesdePortal({ motivo: 'precio', ofertaPrecioVista: true, competidor: 'X\n· Y\u0000' + 'z'.repeat(300), precioOfrecido: 99 }, ctx)
  assert.ok(r.ok)
  const t = r.solicitud.motivoTexto ?? ''
  assert.ok(t.length <= 120 && !/[\n·\u0000]/.test(t.replace('competidor: ', '').replace(' · precio_ofrecido: 99,00€', '')), t)
  for (const malo of ['abc', -5, 0, '12,345', 1e9, '1,2,3']) {
    assert.equal(solicitudDesdePortal({ motivo: 'precio', ofertaPrecioVista: true, precioOfrecido: malo }, ctx).ok, false, String(malo))
  }
})
