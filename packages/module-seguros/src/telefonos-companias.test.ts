import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TELEFONOS_COMPANIAS,
  telefonoVerificadoPorNombre,
  telefonosPorRevisar,
  vcardCompania,
  type TelefonoCompania,
} from './telefonos-companias.ts'

const base: TelefonoCompania = {
  slug: 'prueba',
  nombre: 'Prueba, S.A.',
  codigoDgs: null,
  siniestros: '900 111 222',
  asistencia: [
    { para: 'Hogar', numeros: ['900 333 444', '900 111 222'], horario: null },
  ],
  whatsapp: '+34600111222',
  whatsappRamos: ['hogar'],
  whatsappNota: 'de lunes a viernes',
  horario: '24 horas',
  fuente: 'https://prueba.example/contacto',
  verificado: true,
  verificadoEl: '2026-01-10',
}

test('vcard: cada número con su rótulo, en E.164, y sin repetir', () => {
  const v = vcardCompania(base)
  assert.match(v, /^BEGIN:VCARD\r\nVERSION:3\.0\r\n/)
  assert.match(v, /END:VCARD\r\n$/)
  assert.match(v, /item1\.TEL;TYPE=VOICE:\+34900111222\r\nitem1\.X-ABLabel:Dar parte/)
  assert.match(v, /item2\.TEL;TYPE=VOICE:\+34600111222\r\nitem2\.X-ABLabel:WhatsApp partes/)
  assert.match(v, /item3\.TEL;TYPE=VOICE:\+34900333444\r\nitem3\.X-ABLabel:Asistencia Hogar/)
  // El 900 111 222 también sale en asistencia: se guarda una sola vez, con el primer rótulo.
  assert.equal(v.match(/\+34900111222/g)?.length, 1)
})

test('vcard: escapa comas y la nota lleva fecha, fuente y el límite del WhatsApp', () => {
  const v = vcardCompania(base)
  assert.match(v, /ORG:Prueba\\, S\.A\./)
  assert.match(v, /NOTE:.*solo para partes de hogar\. WhatsApp: de lunes a viernes\./)
  assert.match(v, /NOTE:.*Comprobado el 2026-01-10 en https:\/\/prueba\.example\/contacto/)
})

test('vcard: una compañía sin verificar no genera tarjeta', () => {
  assert.throws(() => vcardCompania({ ...base, verificado: false }))
})

test('vcard: todas las del catálogo verificadas generan tarjeta con al menos un número', () => {
  for (const c of TELEFONOS_COMPANIAS.filter((t) => t.verificado)) {
    assert.match(vcardCompania(c), /item1\.TEL/, c.slug)
  }
})

test('por nombre o slug, sin distinguir mayúsculas; nada si no está', () => {
  assert.equal(telefonoVerificadoPorNombre('MAPFRE')?.slug, 'mapfre')
  assert.equal(telefonoVerificadoPorNombre('occident')?.nombre, 'Occident')
  assert.equal(telefonoVerificadoPorNombre('Inventada'), null)
})

test('por revisar: solo las que pasan del plazo, de la más vieja a la más nueva', () => {
  const vieja = { ...base, nombre: 'Vieja', verificadoEl: '2025-01-01' }
  const media = { ...base, nombre: 'Media', verificadoEl: '2025-06-01' }
  const nueva = { ...base, nombre: 'Nueva', verificadoEl: '2026-09-01' }
  const sinVerificar = { ...base, nombre: 'Sin', verificado: false, verificadoEl: '2020-01-01' }
  const r = telefonosPorRevisar(new Date('2026-09-24T10:00:00Z'), 270, [media, nueva, vieja, sinVerificar])
  assert.deepEqual(r.map((x) => x.nombre), ['Vieja', 'Media'])
  assert.equal(r[0].diasDesde, 631)
})

test('por revisar: el día exacto del plazo aún no avisa', () => {
  const c = { ...base, verificadoEl: '2026-01-01' }
  assert.deepEqual(telefonosPorRevisar(new Date('2026-09-28T00:00:00Z'), 270, [c]), [])
  assert.equal(telefonosPorRevisar(new Date('2026-09-29T00:00:00Z'), 270, [c]).length, 1)
})

// 04/10/2026: datos de las webs oficiales. Lo NO encontrado debe seguir vacío.
const por = (slug: string) => TELEFONOS_COMPANIAS.find((c) => c.slug === slug)!
const nums = (c: TelefonoCompania, para: string) => c.asistencia.find((a) => a.para === para)?.numeros

test('Reale: extranjero y salud añadidos; sin WhatsApp de siniestros', () => {
  const c = por('reale')
  assert.equal(c.siniestros, '900 455 900')
  assert.deepEqual(nums(c, 'Desde el extranjero'), ['+34 913 939 030'])
  assert.deepEqual(nums(c, 'Salud'), ['900 299 783'])
  assert.deepEqual(nums(c, 'En carretera'), ['900 365 900', '91 454 74 00'])
  assert.equal(c.whatsapp, null)
})

test('Generali: viajes añadido; siniestros de hogar/empresas sigue sin dato', () => {
  const c = por('generali')
  assert.deepEqual(nums(c, 'Viajes'), ['91 514 36 09'])
  assert.deepEqual(nums(c, 'Asistencia en carretera'), ['911 123 443', '900 903 433'])
  assert.equal(c.siniestros, null)
  assert.equal(c.horario, null)
})

test('Allianz: asistencia por tipo de riesgo y SIN teléfono de siniestros', () => {
  const c = por('allianz')
  assert.equal(c.siniestros, null)
  assert.deepEqual(nums(c, 'Coche, moto y furgoneta'), ['900 117 115', '900 117 117'])
  assert.deepEqual(nums(c, 'Hogar y comercio'), ['913 255 258'])
  assert.deepEqual(nums(c, 'Vehículos pesados'), ['900 117 120'])
})

test('Mapfre: sin número de siniestros separado (la web no lo distingue)', () => {
  const c = por('mapfre')
  assert.equal(c.siniestros, null)
  assert.deepEqual(nums(c, 'Hogar y ayuda en carretera'), ['918 365 365', '900 822 822'])
  assert.deepEqual(nums(c, 'Accidentes personales'), ['918 366 224', '900 810 852'])
  assert.deepEqual(nums(c, 'Decesos'), ['918 366 181', '900 814 111'])
  assert.deepEqual(nums(c, 'Viajes'), ['918 366 280', '900 814 300'])
})

test('Occident: asistencia sigue vacía (no encontrada)', () => {
  assert.deepEqual(por('occident').asistencia, [])
})
