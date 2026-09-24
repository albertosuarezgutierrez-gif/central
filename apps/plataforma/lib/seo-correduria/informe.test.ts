import test from 'node:test'
import assert from 'node:assert/strict'
import { accionPropuesta, bloqueDescubrimiento, bloqueTelefonosPorRevisar, redactarInforme, normalizarConsulta, type ConsultaObjetivo } from './informe.ts'
import type { DatosCobertura, DatosGsc, DatosPosthog, FilaGsc, Resultados } from './tipos.ts'

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

const coberturaOk: Resultados['cobertura'] = {
  estado: 'ok',
  datos: {
    paginas: [
      { url: 'https://grupoasegura.es/', estado: 'ok', verdicto: 'PASS', cobertura: 'Submitted and indexed' },
      { url: 'https://grupoasegura.es/seguros/hogar', estado: 'ok', verdicto: 'PASS', cobertura: 'Submitted and indexed' },
    ],
  } satisfies DatosCobertura,
}

const todoOk = (consultasGsc: FilaGsc[] = [fila('Seguro de Hogar ', 340, 12.4, 5), fila('correduría sevilla', 900, 3.1, 40), fila('seguro comunidad', 50, 45, 0)]): Resultados => ({
  gsc: gscOk(consultasGsc),
  posthog: posthogOk,
  cobertura: coberturaOk,
})

test('dos fuentes ok + consulta en posición 12 con página → mejorar_pagina (casa normalizando tildes/mayúsculas/trim)', () => {
  const a = accionPropuesta(todoOk(), CONSULTAS)
  assert.equal(a.tipo, 'mejorar_pagina')
  assert.match(a.texto, /\/seguros\/hogar/)
  assert.match(a.texto, /Seguro de Hogar/)
  assert.match(a.texto, /12,4/)
})

test('gsc en error → arreglar_fuente, y nombra fuente y detalle', () => {
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

test('las tres fuentes en error/no_configurado → ningún 0 en el informe', () => {
  // Entradas sin ningún «0» a propósito: si aparece uno, lo ha inventado el redactor.
  const r: Resultados = {
    gsc: { estado: 'no_configurado', detalle: 'falta GSC_SA_JSON' },
    posthog: { estado: 'error', detalle: 'HogQL sin respuesta' },
    cobertura: { estado: 'error', detalle: 'sin respuesta del API de inspección' },
  }
  const txt = redactarInforme('S36', r, accionPropuesta(r, CONSULTAS), 'grupoasegura.es')
  assert.doesNotMatch(txt, /0/)
  assert.match(txt, /PostHog con error: HogQL sin respuesta/)
  assert.match(txt, /Search Console sin configurar: falta GSC_SA_JSON/)
  assert.match(txt, /Cobertura de indexación con error: sin respuesta del API de inspección/)
})

test('una página propia fuera del índice → arreglar_indexacion, antes que mejorar/escribir', () => {
  const r: Resultados = {
    ...todoOk(),
    cobertura: {
      estado: 'ok',
      datos: {
        paginas: [
          { url: 'https://grupoasegura.es/', estado: 'ok', verdicto: 'PASS', cobertura: 'Submitted and indexed' },
          { url: 'https://grupoasegura.es/seguros/hogar', estado: 'ok', verdicto: 'FAIL', cobertura: 'Not found (404)' },
        ],
      },
    },
  }
  const a = accionPropuesta(r, CONSULTAS)
  assert.equal(a.tipo, 'arreglar_indexacion')
  assert.match(a.texto, /\/seguros\/hogar/)
  assert.match(a.texto, /Not found \(404\)/)
})

test('cobertura toda PASS → no bloquea la acción normal (mejorar_pagina sigue saliendo)', () => {
  const a = accionPropuesta(todoOk(), CONSULTAS)
  assert.equal(a.tipo, 'mejorar_pagina')
})

test('una página sin poder inspeccionar (estado:error) también es arreglar_indexacion: no se trata como PASS por omisión', () => {
  const r: Resultados = {
    ...todoOk(),
    cobertura: {
      estado: 'ok',
      datos: {
        paginas: [
          { url: 'https://grupoasegura.es/', estado: 'ok', verdicto: 'PASS' },
          { url: 'https://grupoasegura.es/seguros/hogar', estado: 'error', detalle: '429: quota exceeded' },
        ],
      },
    },
  }
  const a = accionPropuesta(r, CONSULTAS)
  assert.equal(a.tipo, 'arreglar_indexacion')
  assert.match(a.texto, /no se pudo inspeccionar/)
  assert.match(a.texto, /429: quota exceeded/)
})

test('bloque de cobertura: página FAIL se pinta con su motivo, y "todas indexadas" cuando no hay problema', () => {
  const okTxt = redactarInforme('2026-W36', todoOk(), accionPropuesta(todoOk(), CONSULTAS), 'grupoasegura.es')
  assert.match(okTxt, /2 página\(s\) comprobadas, todas indexadas\./)

  const rConFallo: Resultados = {
    ...todoOk(),
    cobertura: {
      estado: 'ok',
      datos: {
        paginas: [
          { url: 'https://grupoasegura.es/', estado: 'ok', verdicto: 'PASS' },
          { url: 'https://grupoasegura.es/roto', estado: 'ok', verdicto: 'FAIL', cobertura: 'Not found (404)' },
          { url: 'https://grupoasegura.es/otra', estado: 'error', detalle: 'timeout' },
          { url: 'https://grupoasegura.es/mas', estado: 'error', detalle: '429: quota exceeded' },
        ],
      },
    },
  }
  const txt = redactarInforme('2026-W36', rConFallo, { tipo: 'arreglar_fuente', texto: 'x' }, 'grupoasegura.es')
  assert.match(txt, /🔴 fuera del índice https:\/\/grupoasegura\.es\/roto — Not found \(404\)/)
  // Cada página sin comprobar lleva SU PROPIO motivo — no se le atribuye a todas el de la primera.
  assert.match(txt, /❔ https:\/\/grupoasegura\.es\/otra — sin comprobar \(timeout\)/)
  assert.match(txt, /❔ https:\/\/grupoasegura\.es\/mas — sin comprobar \(429: quota exceeded\)/)
})

test('escapeHtml en todo texto externo: consulta de GSC, ruta de PostHog y detalle', () => {
  const r = todoOk([fila('<script>alert(1)</script> hogar', 340, 12.4, 5)])
  r.posthog = { estado: 'ok', datos: { ...posthogOk.estado === 'ok' ? posthogOk.datos : ({} as DatosPosthog), topPaginas: [{ ruta: '/a&b<c>', vistas: 2 }] } }
  const txt = redactarInforme('2026-W36', r, { tipo: 'arreglar_fuente', texto: 'x < y & z' }, 'grupo<asegura>.es')
  assert.doesNotMatch(txt, /<script>/)
  assert.match(txt, /&lt;script&gt;alert\(1\)&lt;\/script&gt; hogar/)
  assert.match(txt, /\/a&amp;b&lt;c&gt;/)
  assert.match(txt, /Acción<\/b>: x &lt; y &amp; z/)
  assert.match(txt, /SEO grupo&lt;asegura&gt;\.es<\/b>/)
})

test('informe completo con las dos fuentes ok: bloques, etiqueta literal de PostHog, top 3 páginas y orígenes', () => {
  const r = todoOk()
  const txt = redactarInforme('2026-W36', r, accionPropuesta(r, CONSULTAS), 'grupoasegura.es')
  assert.match(txt, /^🔎 <b>SEO grupoasegura\.es<\/b> · semana 2026-W36/)
  assert.match(txt, /<b>Visitas medidas, sobre quien consintió<\/b> \(7 días\)/)
  assert.match(txt, /41 visitantes · 97 páginas vistas/)
  assert.match(txt, /\/quienes-somos \(9\)/)
  assert.doesNotMatch(txt, /\/legal/) // top 3, no 4
  assert.match(txt, /google\.com \(30\)/)
  assert.match(txt, /➡️ <b>Acción<\/b>: Mejorar \/seguros\/hogar/)
})

test('normalizarConsulta: minúsculas, sin tildes, trim y espacios colapsados', () => {
  assert.equal(normalizarConsulta('  Cómo   CAMBIAR de Correduría '), 'como cambiar de correduria')
})

test('teléfonos por revisar: nada que decir si no hay ninguno', () => {
  assert.equal(bloqueTelefonosPorRevisar([]), null)
})

test('teléfonos por revisar: una línea por compañía, con fecha, días y fuente escapados', () => {
  const t = bloqueTelefonosPorRevisar([
    { nombre: 'A&B', verificadoEl: '2025-01-01', diasDesde: 631, fuente: 'https://a.example/?x=1&y=2' },
  ])!
  assert.match(t, /Teléfonos de siniestros por revisar<\/b> \(1\)/)
  assert.match(t, /• A&amp;B: comprobado el 2025-01-01 \(hace 631 días\) — https:\/\/a\.example\/\?x=1&amp;y=2/)
})

test('aviso a buscadores: el fallo se dice con su motivo, escapado', () => {
  const t = bloqueDescubrimiento(
    { estado: 'ok', texto: 'reenviado' },
    { estado: 'error', detalle: 'IndexNow 403: <key>' },
  )
  assert.match(t, /• Sitemap a Google: reenviado/)
  assert.match(t, /• IndexNow \(Bing\): ⚠️ no se hizo — IndexNow 403: &lt;key&gt;/)
})
