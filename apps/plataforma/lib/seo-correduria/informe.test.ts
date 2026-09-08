import test from 'node:test'
import assert from 'node:assert/strict'
import { accionPropuesta, redactarInforme, normalizarConsulta, type ConsultaObjetivo } from './informe.ts'
import type { DatosGsc, DatosPosthog, DatosSerp, FilaGsc, Resultados } from './tipos.ts'

// Lista propia y pequeña: NO se importa `CONSULTAS` (la escribe otro agente en paralelo).
const CONSULTAS: ConsultaObjetivo[] = [
  { consulta: 'seguro de hogar', pagina: '/seguros/hogar', grupo: 'ramo' },
  { consulta: 'seguro de comunidad de propietarios', pagina: '/seguros/comunidades', grupo: 'ramo' },
  { consulta: 'cómo cambiar de correduría sin cambiar de seguro', pagina: '/cambiar-de-correduria', grupo: 'problema' },
  { consulta: 'preaviso de un mes para cancelar el seguro', pagina: null, grupo: 'problema' },
  { consulta: 'me han subido el seguro del coche', pagina: null, grupo: 'problema' },
]

function fila(clave: string, impresiones: number, posicion: number, clics = 1): FilaGsc {
  return { clave, impresiones, posicion, clics, ctr: impresiones ? clics / impresiones : 0 }
}

function gscOk(consultas: FilaGsc[], anterior: DatosGsc['anterior'] = { ventana: { desde: '2026-08-24', hasta: '2026-08-30' }, total: { clics: 20, impresiones: 1200, ctr: 0.017, posicion: 14.2 } }): Resultados['gsc'] {
  return {
    estado: 'ok',
    datos: {
      actual: {
        ventana: { desde: '2026-08-31', hasta: '2026-09-06' },
        total: { clics: 32, impresiones: 1543, ctr: 0.021, posicion: 12.7 },
        consultas,
        paginas: [fila('/seguros/hogar', 900, 11.3, 20)],
      },
      anterior,
    },
  }
}

function serpOk(n: number): Resultados['serp'] {
  const consultas: DatosSerp['consultas'] = []
  for (let i = 0; i < n; i++) {
    consultas.push({
      consulta: i === 0 ? 'seguro de hogar' : `consulta objetivo número ${i} bastante larga para ocupar sitio`,
      pagina: i % 3 === 0 ? null : '/seguros/hogar',
      propia: i % 2 === 0 ? null : 7,
      top: [1, 2, 3, 4].map((p) => ({
        posicion: p,
        dominio: `competidor-${i}-${p}.es`,
        url: `https://competidor-${i}-${p}.es/seguros`,
        titulo: `Título ${p} de la consulta ${i}`,
      })),
    })
  }
  return { estado: 'ok', datos: { dominio: 'grupoasegura.es', consultas } }
}

const posthogOk: Resultados['posthog'] = {
  estado: 'ok',
  datos: {
    dias: 7,
    visitantes: 41,
    paginasVistas: 97,
    topPaginas: [{ ruta: '/', vistas: 40 }, { ruta: '/seguros/hogar', vistas: 22 }, { ruta: '/quienes-somos', vistas: 9 }, { ruta: '/legal', vistas: 1 }],
    origenes: [{ dominio: 'google.com', sesiones: 30 }, { dominio: 'bing.com', sesiones: 3 }],
  } satisfies DatosPosthog,
}

const todoOk = (consultasGsc: FilaGsc[] = [fila('Seguro de Hogar ', 340, 12.4, 5), fila('correduría sevilla', 900, 3.1, 40), fila('seguro comunidad', 50, 45, 0)]): Resultados => ({
  gsc: gscOk(consultasGsc),
  serp: serpOk(3),
  posthog: posthogOk,
})

test('tres fuentes ok + consulta en posición 12 con página → mejorar_pagina (casa normalizando tildes/mayúsculas/trim)', () => {
  const a = accionPropuesta(todoOk(), CONSULTAS)
  assert.equal(a.tipo, 'mejorar_pagina')
  assert.match(a.texto, /\/seguros\/hogar/)
  assert.match(a.texto, /Seguro de Hogar/)
  assert.match(a.texto, /12,4/)
})

test('gsc en error → arreglar_fuente AUNQUE haya datos de SERP, y nombra fuente y detalle', () => {
  const r: Resultados = { ...todoOk(), gsc: { estado: 'error', detalle: 'HTTP 403 del API de Search Console' } }
  const a = accionPropuesta(r, CONSULTAS)
  assert.equal(a.tipo, 'arreglar_fuente')
  assert.match(a.texto, /Search Console/)
  assert.match(a.texto, /HTTP 403 del API de Search Console/)
})

test('no_configurado también es arreglar_fuente, y dice qué secreto falta', () => {
  const r: Resultados = { ...todoOk(), posthog: { estado: 'no_configurado', detalle: 'falta POSTHOG_PERSONAL_API_KEY' } }
  const a = accionPropuesta(r, CONSULTAS)
  assert.equal(a.tipo, 'arreglar_fuente')
  assert.match(a.texto, /PostHog/)
  assert.match(a.texto, /falta POSTHOG_PERSONAL_API_KEY/)
})

test('sin consulta 8-30 con página → escribir_pagina con la primera del grupo problema sin página', () => {
  const a = accionPropuesta(todoOk([fila('seguro de hogar', 500, 3.2, 60)]), CONSULTAS)
  assert.equal(a.tipo, 'escribir_pagina')
  assert.match(a.texto, /preaviso de un mes para cancelar el seguro/)
  assert.doesNotMatch(a.texto, /me han subido/)
})

test('sin nada mejor → enlazado_interno hacia /seguros/hogar', () => {
  const soloConPagina = CONSULTAS.filter((c) => c.pagina !== null)
  const a = accionPropuesta(todoOk([fila('seguro de hogar', 500, 3.2, 60)]), soloConPagina)
  assert.equal(a.tipo, 'enlazado_interno')
  assert.match(a.texto, /\/seguros\/hogar/)
})

test('anterior: null → el informe dice «sin semana anterior» y no inventa deltas', () => {
  const r: Resultados = { ...todoOk(), gsc: gscOk([fila('seguro de hogar', 340, 12.4, 5)], null) }
  const txt = redactarInforme('2026-W36', r, accionPropuesta(r, CONSULTAS), 'grupoasegura.es')
  assert.match(txt, /sin semana anterior/)
  assert.doesNotMatch(txt, /\+100/)
  assert.doesNotMatch(txt, /\(\+/)
})

test('con anterior → deltas en formato español y posición a 1 decimal', () => {
  const r = todoOk()
  const txt = redactarInforme('2026-W36', r, accionPropuesta(r, CONSULTAS), 'grupoasegura.es')
  assert.match(txt, /32 clics \(\+12\)/)
  assert.match(txt, /1\.543 impresiones \(\+343\)/)
  assert.match(txt, /posición media 12,7 \(−1,5 ▲\)/)
  assert.match(txt, /pos\. 12,4 · 340 impr\./)
})

test('serp en error → ni «fuera del top-10» ni un 0 en todo el informe', () => {
  // Entradas sin ningún «0» a propósito: si aparece uno, lo ha inventado el redactor.
  const r: Resultados = {
    gsc: { estado: 'no_configurado', detalle: 'falta GSC_SA_JSON' },
    serp: { estado: 'error', detalle: 'Serper respondió cuatrocientos veintinueve' },
    posthog: { estado: 'error', detalle: 'HogQL sin respuesta' },
  }
  const txt = redactarInforme('S36', r, accionPropuesta(r, CONSULTAS), 'grupoasegura.es')
  assert.doesNotMatch(txt, /fuera del top-10/)
  assert.doesNotMatch(txt, /0/)
  assert.match(txt, /SERP \(Serper\) con error: Serper respondió cuatrocientos veintinueve/)
  assert.match(txt, /Search Console sin configurar: falta GSC_SA_JSON/)
})

test('escapeHtml en todo texto externo: consulta de GSC, dominio de SERP, ruta de PostHog y detalle', () => {
  const r = todoOk([fila('<script>alert(1)</script> hogar', 340, 12.4, 5)])
  const serp = serpOk(1)
  if (serp.estado === 'ok') serp.datos.consultas[0].top[0].dominio = 'mal<b>o.es'
  r.serp = serp
  r.posthog = { estado: 'ok', datos: { ...posthogOk.estado === 'ok' ? posthogOk.datos : ({} as DatosPosthog), topPaginas: [{ ruta: '/a&b<c>', vistas: 2 }] } }
  const txt = redactarInforme('2026-W36', r, { tipo: 'arreglar_fuente', texto: 'x < y & z' }, 'grupo<asegura>.es')
  assert.doesNotMatch(txt, /<script>/)
  assert.match(txt, /&lt;script&gt;alert\(1\)&lt;\/script&gt; hogar/)
  assert.match(txt, /mal&lt;b&gt;o\.es/)
  assert.match(txt, /\/a&amp;b&lt;c&gt;/)
  assert.match(txt, /Acción<\/b>: x &lt; y &amp; z/)
  assert.match(txt, /SEO grupo&lt;asegura&gt;\.es<\/b>/)
})

test('informe completo con las tres fuentes ok: bloques, etiqueta literal de PostHog, top 3 páginas y orígenes', () => {
  const r = todoOk()
  const txt = redactarInforme('2026-W36', r, accionPropuesta(r, CONSULTAS), 'grupoasegura.es')
  assert.match(txt, /^🔎 <b>SEO grupoasegura\.es<\/b> · semana 2026-W36/)
  assert.match(txt, /<b>Visitas medidas, sobre quien consintió<\/b> \(7 días\)/)
  assert.match(txt, /41 visitantes · 97 páginas vistas/)
  assert.match(txt, /\/quienes-somos \(9\)/)
  assert.doesNotMatch(txt, /\/legal/) // top 3, no 4
  assert.match(txt, /google\.com \(30\)/)
  assert.match(txt, /«seguro de hogar» — fuera del top-10 · competidor-0-1\.es, competidor-0-2\.es, competidor-0-3\.es/)
  assert.doesNotMatch(txt, /competidor-0-4/) // 3 primeros dominios
  assert.match(txt, /— posición 7 · /)
  assert.match(txt, /➡️ <b>Acción<\/b>: Mejorar \/seguros\/hogar/)
})

test('longitud < 3.500 con 14 consultas de SERP', () => {
  const r: Resultados = { ...todoOk(), serp: serpOk(14) }
  const txt = redactarInforme('2026-W36', r, accionPropuesta(r, CONSULTAS), 'grupoasegura.es')
  assert.ok(txt.length < 3500, `mide ${txt.length}`)
})

test('si el SERP se pasa de largo, se recorta a 8 consultas y se dice cuántas quedan en BD', () => {
  const r: Resultados = { ...todoOk(), serp: serpOk(60) }
  const txt = redactarInforme('2026-W36', r, accionPropuesta(r, CONSULTAS), 'grupoasegura.es')
  assert.ok(txt.length < 3500, `mide ${txt.length}`)
  assert.match(txt, /\(\+52 consultas en BD\)/)
  assert.match(txt, /60 consultas\)/)
  assert.doesNotMatch(txt, /consulta objetivo número 8 /)
})

test('normalizarConsulta: minúsculas, sin tildes, trim y espacios colapsados', () => {
  assert.equal(normalizarConsulta('  Cómo   CAMBIAR de Correduría '), 'como cambiar de correduria')
})
