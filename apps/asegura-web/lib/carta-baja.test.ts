// Cepos de la carta de no renovación pública (`/carta-baja-seguro`).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { DATOS_VACIOS, HUECOS_CARTA, componerCarta, hrefCorreo, plazoCarta } from './carta-baja.ts'

const HOY = new Date(Date.UTC(2026, 8, 26)) // 26/09/2026

test('el plazo es vencimiento − 30 días, y dice en qué punto está', () => {
  assert.deepEqual(plazoCarta('', HOY), { estado: 'sin_fecha', limite: null, dias: null })
  const en = plazoCarta('2026-12-15', HOY)
  assert.equal(en.estado, 'en_plazo')
  assert.equal(en.limite?.toISOString().slice(0, 10), '2026-11-15')
  assert.equal(en.dias, 50)
  // El último día todavía cuenta.
  assert.equal(plazoCarta('2026-10-26', HOY).estado, 'en_plazo')
  assert.equal(plazoCarta('2026-10-25', HOY).estado, 'fuera_de_plazo')
  assert.equal(plazoCarta('2026-09-01', HOY).estado, 'vencida')
  assert.equal(plazoCarta('2026-02-31', HOY).estado, 'sin_fecha')
})

test('«hoy» es el día LOCAL del navegador, no el UTC', () => {
  // 00:30 del 27/09 en Madrid (UTC+2) = 22:30 UTC del 26/09.
  const antes = process.env.TZ
  process.env.TZ = 'Europe/Madrid'
  try {
    const madrugada = new Date('2026-09-26T22:30:00Z')
    assert.match(componerCarta(DATOS_VACIOS, madrugada).cuerpo, /27 de septiembre de 2026/)
    assert.equal(plazoCarta('2026-10-27', madrugada).dias, 0)
  } finally {
    process.env.TZ = antes
  }
})

test('lo que no se ha escrito sale como hueco visible, nunca inventado', () => {
  const c = componerCarta(DATOS_VACIOS, HOY)
  assert.deepEqual(new Set(c.huecos), new Set(Object.keys(HUECOS_CARTA)))
  for (const h of Object.values(HUECOS_CARTA)) assert.ok(c.cuerpo.includes(h), `falta el hueco ${h}`)
  assert.doesNotMatch(c.cuerpo, /del ramo de/, 'sin ramo elegido la carta no debe nombrar ninguno')
})

test('con todos los datos no queda ni un corchete', () => {
  const c = componerCarta(
    {
      tomador: 'Ana Pérez López',
      nif: '12345678z',
      compania: 'Compañía X',
      numeroPoliza: 'P-001',
      ramo: 'hogar',
      vence: '2026-12-15',
      lugar: 'Sevilla',
    },
    HOY,
  )
  assert.deepEqual(c.huecos, [])
  assert.doesNotMatch(c.cuerpo, /\[/)
  assert.match(c.cuerpo, /^Sevilla, 26 de septiembre de 2026/)
  assert.match(c.cuerpo, /NIF 12345678Z/)
  assert.match(c.cuerpo, /del ramo de hogar, con vencimiento el 15 de diciembre de 2026/)
  assert.equal(c.asunto, 'Comunicación de no renovación de la póliza n.º P-001')
})

test('el correo no lleva destinatario y codifica el texto', () => {
  const h = hrefCorreo('Asunto con ñ', 'línea 1\nlínea 2')
  assert.match(h, /^mailto:\?subject=/)
  assert.ok(!h.includes('\n'))
  assert.ok(decodeURIComponent(h.split('body=')[1]) === 'línea 1\nlínea 2')
})

// El texto legal tiene que ser EL MISMO que el de la carta del portal: dos
// redacciones de la misma comunicación acaban diciendo cosas distintas y nadie
// se entera. Se lee el fuente del portal y se exigen sus frases fijas.
test('el cuerpo coincide con la carta del portal', () => {
  const portal = readFileSync(
    new URL('../../../packages/module-seguros-portal/src/carta-no-renovacion.ts', import.meta.url),
    'utf8',
  )
  const web = readFileSync(new URL('./carta-baja.ts', import.meta.url), 'utf8')
  const FRASES = [
    'Departamento de Atención al Cliente',
    'Muy señores míos:',
    'les comunico mi voluntad de NO PRORROGAR dicho contrato a su vencimiento, conforme a lo previsto en el artículo 22 de la Ley 50/1980, de 8 de octubre, de Contrato de Seguro.',
    'Les ruego que confirmen por escrito la recepción de esta comunicación y la baja de la póliza con efectos desde la fecha de vencimiento indicada, y que no emitan ningún recibo por periodos posteriores.',
    'Comunicación de no renovación de la póliza n.º',
    'en calidad de tomador/a de la póliza n.º',
  ]
  for (const f of FRASES) {
    assert.ok(portal.includes(f), `el portal ya no dice: «${f}» — actualiza la carta pública a la vez`)
    assert.ok(web.includes(f), `la carta pública no dice: «${f}»`)
  }
})

// Privacidad: la página promete que nada sale del navegador.
test('el componente de la carta no manda datos a ningún sitio', () => {
  const src = readFileSync(new URL('../components/CartaBaja.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|sendBeacon|<form/, 'la carta no puede enviar nada a un servidor')
  const llamadas = src.match(/medir\([^)]*\)/g) ?? []
  assert.ok(llamadas.length > 0, 'la carta no mide nada: el cepo de abajo estaría mirando al vacío')
  for (const m of llamadas) {
    assert.doesNotMatch(m, /tomador|nif|numeroPoliza|compania|lugar|cuerpo/, `dato personal en analítica: ${m}`)
  }
})

test('la página está en el sitemap y en el pie', () => {
  const sitemap = readFileSync(new URL('../app/sitemap.ts', import.meta.url), 'utf8')
  assert.match(sitemap, /url\('\/carta-baja-seguro'\)/)
  const sitio = readFileSync(new URL('./sitio.ts', import.meta.url), 'utf8')
  assert.match(sitio, /href: '\/carta-baja-seguro'/)
})
