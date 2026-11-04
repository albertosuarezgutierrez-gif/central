import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  diaMadrid, esHoraResumen, esQueja, estaSinContestar, resumenActivo, sanearResumen, textoResumenDiario, type ConversacionDia, type DatosResumen,
} from './resumen-diario-reglas.ts'

const AHORA = new Date('2026-11-04T18:00:00Z') // 19:00 en Madrid (CET)

const conv = (o: Partial<ConversacionDia> = {}): ConversacionDia => ({
  nombre: 'María López', entrantes: 2, salientesIa: 0, ultimaDireccion: 'saliente', ultimoAt: new Date('2026-11-04T16:00:00Z'),
  intencion: 'renovacion', riesgoAbandono: null, resumen: 'Pregunta por la renovación del coche', accionesAplicadas: 1, ...o,
})
const datos = (o: Partial<DatosResumen> = {}): DatosResumen => ({ ahora: AHORA, hoy: [], sinContestar: [], propuestas: [], ...o })

test('apagado por defecto', () => {
  assert.equal(resumenActivo({}), false)
  assert.equal(resumenActivo({ ASEGURA_WHATSAPP_RESUMEN_ACTIVO: '0' }), false)
  assert.equal(resumenActivo({ ASEGURA_WHATSAPP_RESUMEN_ACTIVO: '1' }), true)
})

test('las 19:00 de Madrid caen a las 18 UTC en invierno y a las 17 UTC en verano', () => {
  assert.equal(esHoraResumen(new Date('2026-11-04T18:05:00Z')), true)
  assert.equal(esHoraResumen(new Date('2026-11-04T17:05:00Z')), false)
  assert.equal(esHoraResumen(new Date('2026-07-15T17:05:00Z')), true)
  assert.equal(esHoraResumen(new Date('2026-07-15T18:05:00Z')), false)
})

test('día de Madrid [inicio, fin): 24 h normales y 23/25 h en el cambio de hora', () => {
  const d = diaMadrid(AHORA)
  assert.equal(d.inicio.toISOString(), '2026-11-03T23:00:00.000Z')
  assert.equal(d.fin.toISOString(), '2026-11-04T23:00:00.000Z')
  const verano = diaMadrid(new Date('2026-07-15T12:00:00Z'))
  assert.equal(verano.inicio.toISOString(), '2026-07-14T22:00:00.000Z')
  const otono = diaMadrid(new Date('2026-10-25T12:00:00Z')) // 25 h
  assert.equal((otono.fin.getTime() - otono.inicio.getTime()) / 3_600_000, 25)
  const primavera = diaMadrid(new Date('2026-03-29T12:00:00Z')) // 23 h
  assert.equal((primavera.fin.getTime() - primavera.inicio.getTime()) / 3_600_000, 23)
})

test('sanear: fuera teléfonos, DNI, correos y enlaces; corto', () => {
  const s = sanearResumen('Llámale al 600 123 456 o al +34954123456, DNI 12345678Z, mail a x@y.es, https://a.b/c — quiere renovar')
  assert.ok(s && !/\d{6}|@|https|12345678/.test(s), s ?? '')
  assert.match(s ?? '', /quiere renovar/)
  assert.equal(sanearResumen('   '), null)
  assert.equal(sanearResumen(null), null)
  assert.ok((sanearResumen('a'.repeat(500)) ?? '').length <= 140)
})

test('queja y sin contestar', () => {
  assert.equal(esQueja({ intencion: 'queja', riesgoAbandono: null }), true)
  assert.equal(esQueja({ intencion: 'otro', riesgoAbandono: 'alto' }), true)
  assert.equal(esQueja({ intencion: 'otro', riesgoAbandono: 'medio' }), false)
  assert.equal(esQueja({ intencion: null, riesgoAbandono: null }), false)
  const h = (n: number) => new Date(AHORA.getTime() - n * 3_600_000)
  assert.equal(estaSinContestar({ ultimaDireccion: 'entrante', ultimoAt: h(5) }, AHORA), true)
  assert.equal(estaSinContestar({ ultimaDireccion: 'entrante', ultimoAt: h(1) }, AHORA), false, 'aún es pronto')
  assert.equal(estaSinContestar({ ultimaDireccion: 'saliente', ultimoAt: h(5) }, AHORA), false)
  assert.equal(estaSinContestar({ ultimaDireccion: 'entrante', ultimoAt: h(24 * 9) }, AHORA), false, 'historia, no de hoy')
  assert.equal(estaSinContestar({ ultimaDireccion: null, ultimoAt: null }, AHORA), false)
})

test('día sin nada → no se manda resumen vacío', () => {
  assert.equal(textoResumenDiario(datos()), null)
})

test('resumen: nombres de ficha, secciones, fechas en español y ni un teléfono', () => {
  const t = textoResumenDiario(datos({
    hoy: [conv(), conv({ nombre: 'Pedro <Gil>', intencion: 'queja', riesgoAbandono: 'alto', resumen: 'Furioso, llamad al 600123456' })],
    sinContestar: [conv({ nombre: 'Luis Ramos', ultimaDireccion: 'entrante', ultimoAt: new Date(AHORA.getTime() - 6 * 3_600_000) })],
    propuestas: [{ nombre: 'Ana Ruiz', tipo: 'fecha_cobro' }],
  }))
  assert.ok(t)
  assert.match(t, /04\/11\/2026/)
  assert.match(t, /María López \(renovacion · 1 acción\(es\)\) — Pregunta por la renovación del coche/)
  assert.match(t, /Propuestas esperando tu botón[\s\S]*Ana Ruiz · fecha de cobro/)
  assert.match(t, /Queja o riesgo de abandono[\s\S]*Pedro &lt;Gil&gt; · queja · riesgo alto/)
  assert.match(t, /Sin contestar[\s\S]*Luis Ramos · hace 6 h/)
  assert.doesNotMatch(t, /\d{6,}|<Gil>/)
})

test('propuestas sin leer se dicen, no se cuentan como cero', () => {
  const t = textoResumenDiario(datos({ hoy: [conv()], propuestas: null }))
  assert.match(t ?? '', /sin leer/)
})

test('listas largas se cortan con «y N más»', () => {
  const muchas = Array.from({ length: 12 }, (_, i) => conv({ nombre: `Cliente ${i}` }))
  assert.match(textoResumenDiario(datos({ hoy: muchas })) ?? '', /… y 4 más/)
})

test('CEPO: el resumen solo LEE (ni escribe en BD ni habla con Meta) y solo conversaciones con ficha y sin baja', () => {
  const sin = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')
  const src = sin(readFileSync(new URL('./resumen-diario.ts', import.meta.url), 'utf8'))
  assert.doesNotMatch(src, /\b(insert into|update\s+\w+\s+set|delete from)\b|\$executeRaw|graph\.facebook|\/messages/i)
  assert.match(src, /cv\.wa_opt_out_at is null and c\.wa_opt_out_at is null/)
  assert.match(src, /join clientes c on c\.id = cv\.cliente_id/)
  assert.match(src, /descartada_personal/)
  const n = (src.match(/correduria_id = \$\{correduriaId\}/g) ?? []).length
  assert.ok(n >= 3, 'cada consulta filtra por correduría')
})
