// El emisor GENÉRICO de la intranet: «tienes algo esperándote en tu área de
// clientes», por correo, derivado del MISMO catálogo que pinta la campana.
//
// Origen (15/09/2026, Alberto): «cualquier modificación para hacerlo genérico,
// para cuando se añade más cosas a la intranet, todo lo que sea la intranet de
// un cliente… un correo cortito, educado, con acceso a la intranet
// directamente», y ese mismo día, sobre el reparo del código postal de un
// cliente real: «es lo que quiero que notifique por mail e intranet,
// explicándole cómo modificar su dirección».
//
// Cada test de aquí se vio en ROJO rompiendo a mano lo que dice proteger.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { TIPOS_AVISO } from '../packages/module-seguros-portal/src/avisos.ts'

import {
  ETIQUETA_POR_TIPO,
  cuerpoAvisosIntranet,
  resumirAvisos,
} from '../apps/asegura/lib/correo-avisos-intranet.ts'
import { avisosNuevos, claveAviso, enlacePortal, type Pendiente } from '../apps/asegura/lib/avisos-intranet-reglas.ts'

const RAIZ = new URL('..', import.meta.url).pathname
const fuente = (p: string) => readFileSync(join(RAIZ, p), 'utf8')

const HOY = new Date('2026-09-15T08:00:00Z')

const pendiente = (x: Partial<Pendiente> = {}): Pendiente => ({
  clienteId: 'c1',
  nombre: 'Manuel',
  autorizaciones: { otorgadas: [], recibidas: [] },
  obligaciones: [],
  peticiones: [],
  datos: [],
  ...x,
})

test('TODO tipo del catálogo tiene su etiqueta de correo: uno nuevo no sale como «algo pendiente»', () => {
  for (const tipo of TIPOS_AVISO) {
    const e = ETIQUETA_POR_TIPO[tipo]
    assert.ok(e, `el aviso «${tipo}» no tiene cómo nombrarse en el correo`)
    assert.ok(e.uno.trim().length > 0 && e.varios.trim().length > 0, `«${tipo}» tiene una etiqueta vacía`)
  }
  assert.deepEqual(
    Object.keys(ETIQUETA_POR_TIPO).sort(),
    [...TIPOS_AVISO].sort(),
    'las etiquetas y el catálogo tienen que ser la MISMA lista: una de más es un tipo que ya no existe',
  )
})

test('el correo dice CUÁNTAS cosas hay y de qué clase, y lleva el enlace', () => {
  const c = cuerpoAvisosIntranet({
    nombre: 'Manuel',
    avisos: [{ tipo: 'datos_por_revisar' }, { tipo: 'obligacion_en_ventana' }, { tipo: 'obligacion_en_ventana' }],
    total: 3,
    enlace: 'https://clientes.grupoasegura.es/',
  })
  assert.match(c.asunto, /3 novedades/)
  assert.match(c.texto, /^Hola, Manuel:/)
  assert.match(c.texto, /2 vencimientos próximos/)
  assert.match(c.texto, /https:\/\/clientes\.grupoasegura\.es\//)
  assert.match(c.html, /href="https:\/\/clientes\.grupoasegura\.es\/"/)
})

test('sin nombre se saluda sin nombre, y no se inventa uno', () => {
  const c = cuerpoAvisosIntranet({ nombre: null, avisos: [{ tipo: 'peticion_recibida' }], total: 1, enlace: 'https://x.es/' })
  assert.match(c.texto, /^Hola:/)
  assert.match(c.asunto, /^Novedades/, 'una es «Novedades», no «1 novedades»')
})

test('🚨 el correo habla de lo NUEVO, y lo que ya estaba lo dice APARTE', () => {
  // El fallo que esto evita: «tienes un aviso» sobre una campana que marca 4.
  // El cliente entra, resuelve el nuevo y se va con tres sin tocar.
  const c = cuerpoAvisosIntranet({
    nombre: 'Manuel',
    avisos: [{ tipo: 'datos_por_revisar' }],
    total: 4,
    enlace: 'https://x.es/',
  })
  assert.match(c.texto, /otros 3 avisos sin resolver/)
  assert.match(c.html, /otros 3 avisos sin resolver/)

  const igual = cuerpoAvisosIntranet({ nombre: null, avisos: [{ tipo: 'datos_por_revisar' }], total: 1, enlace: 'https://x.es/' })
  assert.ok(!/sin resolver/.test(igual.texto), 'sin nada de antes no se inventa una segunda frase')

  // `total` por debajo de los nuevos (algo se resolvió entre medias) no puede
  // dar «otros -1 avisos».
  const raro = cuerpoAvisosIntranet({ nombre: null, avisos: [{ tipo: 'datos_por_revisar' }], total: 0, enlace: 'https://x.es/' })
  assert.ok(!/sin resolver/.test(raro.texto))
})

test('el resumen va en el orden del CATÁLOGO, no en el de llegada', () => {
  const desordenado = resumirAvisos([{ tipo: 'datos_por_revisar' }, { tipo: 'peticion_recibida' }])
  const ordenado = resumirAvisos([{ tipo: 'peticion_recibida' }, { tipo: 'datos_por_revisar' }])
  assert.equal(desordenado, ordenado, 'dos correos con lo mismo tienen que leerse igual')
})

test('🚨 el correo NO copia el título del aviso: solo viaja la CLASE', () => {
  const src = fuente('apps/asegura/lib/avisos-intranet.ts')
  assert.match(
    src,
    /avisos:\s*nuevos\.map\(\(a\)\s*=>\s*\(\{\s*tipo:\s*a\.tipo\s*\}\)\)/,
    'al emisor de correo solo se le pasa `{ tipo }`: un título lleva matrícula, nº de póliza o el nombre de un tercero, y la dirección la tecleó un humano',
  )
  const correo = fuente('apps/asegura/lib/correo-avisos-intranet.ts')
  assert.ok(!/\btitulo\b/.test(correo.replace(/\/\*[\s\S]*?\*\//g, '')), 'el cuerpo del correo no puede mirar el título de un aviso')
})

test('el enlace del correo es https o no hay correo', () => {
  assert.equal(enlacePortal('https://clientes.grupoasegura.es/boveda'), 'https://clientes.grupoasegura.es/')
  assert.equal(enlacePortal('http://clientes.grupoasegura.es'), null, 'http no: el enlace lleva a una sesión')
  assert.equal(enlacePortal('no-es-una-url'), null)
  assert.equal(enlacePortal(''), null)
  // Sin argumento cae al defecto de la casa (la env de Vercel), que sí es https:
  // el correo no se queda sin enlace porque falte una variable, pero tampoco se
  // inventa un dominio distinto del del portal.
  assert.match(enlacePortal(undefined) ?? '', /^https:\/\/[^/]+\/$/)
})

test('la clave del sello es `tipo:id`, nunca el título', () => {
  assert.equal(claveAviso({ tipo: 'datos_por_revisar', id: 'cp_invalido' }), 'datos_por_revisar:cp_invalido')
})

test('lo ya sellado NO se vuelve a mandar; lo nuevo sí', () => {
  const p = pendiente({
    datos: [
      { tipo: 'cp_invalido', texto: 'El código postal guardado («0812») no es un código postal español de 5 dígitos.' },
      { tipo: 'ciudad_sin_letras', texto: 'En la ciudad hay guardado «34304».' },
    ],
  })
  const todos = avisosNuevos(p, HOY, new Set())
  assert.equal(todos?.nuevos.length, 2)
  assert.equal(todos?.total, 2)

  const solo = avisosNuevos(p, HOY, new Set(['datos_por_revisar:cp_invalido']))
  assert.deepEqual(
    solo?.nuevos.map((a) => a.id),
    ['ciudad_sin_letras'],
    'un aviso se manda UNA vez: el sello del anterior no puede llevarse por delante al nuevo',
  )
  assert.equal(solo?.total, 2, 'el TOTAL cuenta también lo ya sellado: es lo que marca su campana')

  assert.deepEqual(
    avisosNuevos(p, HOY, new Set(['datos_por_revisar:cp_invalido', 'datos_por_revisar:ciudad_sin_letras']))?.nuevos,
    [],
  )
})

test('🚨 una fuente ilegible deja al cliente SIN correo esa pasada, no con un total a medias', () => {
  // `datos: null` es lo que llega cuando la ficha no se pudo leer. Un correo que
  // dice «tienes 1 aviso» cuando hay 3 es peor que no mandarlo: el cliente entra,
  // resuelve uno y se va tranquilo.
  const p = { ...pendiente(), datos: null as unknown as Pendiente['datos'] }
  assert.equal(avisosNuevos(p, HOY, new Set()), null)
})

test('el botón manual de «Invitar por correo» SELLA lo que avisa, o el cron lo repite mañana', () => {
  const src = fuente('apps/asegura/lib/aviso-acceso.ts')
  assert.match(
    src,
    /portalAvisoEnviado\.createMany[\s\S]{0,300}autorizacion_pendiente:\$\{f\.id\}/,
    'sin el sello, a quien Alberto acaba de avisar a mano le llega por la mañana el mismo aviso otra vez',
  )
})

test('el cron está declarado, va DESPUÉS del de vencimientos y pide su secreto', () => {
  const vercel = JSON.parse(fuente('apps/asegura/vercel.json')) as { crons: { path: string; schedule: string }[] }
  const cron = vercel.crons.find((c) => c.path === '/api/cron/avisos-intranet')
  assert.ok(cron, 'el emisor sin cron no manda nada, y nada falla')
  // Los dos pueden hablar del mismo vencimiento: solapados, dos correos a la vez.
  const vencimientos = vercel.crons.find((c) => c.path === '/api/cron/avisos-vencimiento')!
  const minutos = (s: string) => Number(s.split(' ')[1]) * 60 + Number(s.split(' ')[0])
  assert.ok(minutos(cron!.schedule) > minutos(vencimientos.schedule), 'este cron va después del de vencimientos')

  const ruta = fuente('apps/asegura/app/api/cron/avisos-intranet/route.ts')
  assert.match(ruta, /isCronAuthorized\(req\)/, 'detrás de esta puerta se escribe a clientes reales')
  assert.match(ruta, /status: 503/, '«no he podido mirar» no puede responder 200')
  assert.match(ruta, /export const maxDuration = \d+/, 'un corte a mitad del bucle deja correos entregados y sin sellar')
})

test('🚨 el emisor solo mira la CARTERA VIVA: 32.520 leads no reciben «revisa tu dirección»', () => {
  const src = fuente('apps/asegura/lib/avisos-intranet.ts')
  assert.match(
    src,
    /titularesVivos[\s\S]{0,400}WHERE_CARTERA_VIVA/,
    'los titulares se sacan de las pólizas vivas; sobre `clientes` a secas esto sería un mailing a todo el volcado',
  )
  assert.match(src, /if \(!titularesVivos\.has\(f\.id\)\) continue/, 'y la ficha que no es de la cartera viva no genera reparo')
})

test('🚨 `autorizado_cliente_id` se declara NULLABLE: la BD lo es desde el 04/09/2026', () => {
  // La divergencia costaba caro y era invisible: el modelo lo declaraba
  // obligatorio, así que la PRIMERA autorización a alguien invitado (identidad
  // del portal, sin ficha) reventaba TODA lectura de la tabla — la ficha del
  // corredor y este cron incluidos. Hoy son 0 filas: esperaba a la primera
  // invitación. El emisor además lo lee en dos consultas, para no traerse
  // nunca un `null` en esa columna.
  const schema = fuente('apps/asegura/prisma/asegura.prisma')
  const modelo = schema.slice(schema.indexOf('model PortalAutorizacion'))
  assert.match(modelo.slice(0, 2000), /autorizadoClienteId\s+String\?/)
  assert.match(modelo.slice(0, 2000), /autorizadoIdentidadId\s+String\?/, 'la otra rama del destinatario también existe en la BD')

  const src = fuente('apps/asegura/lib/avisos-intranet.ts')
  assert.match(src, /autorizadoClienteId: \{ not: null \}/, 'la consulta principal no puede traerse filas de invitado')
})
