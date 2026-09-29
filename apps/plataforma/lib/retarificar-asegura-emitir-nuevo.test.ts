// Emisión a clientes NUEVOS (28/09/2026): las causas nuevas con las que
// `POST /api/operador/codeoscopic/emitir` de asegura corta ANTES del Submit.
// Si alguna cae al `error` genérico, la pantalla la pinta como «no hay respuesta
// clara» y el corredor no ve el botón «Emitir igualmente» (o, peor, reintenta
// algo que el interruptor apagado no va a dejar pasar nunca).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { interpretarEmitir, emitirAsegura } from './retarificar-asegura.ts'
import { resultadoEmision } from './correduria-emision-tg.ts'
import { figurasCompletas, textoCasillaFigura } from './figuras-emision-texto.ts'

const COLETILLA = ' Si aun así es una póliza nueva, confirma con `duplicadoConfirmado: true`.'

test('409 ya_en_cartera → duplicado, con las pólizas y el nº enmascarado, sin la coletilla técnica', () => {
  const r = interpretarEmitir(409, {
    estado: 'error',
    causa: 'ya_en_cartera',
    mensaje: 'La matrícula 1234ABC ya está asegurada en OTRA ficha de la cartera (póliza ••••1186): comprueba si es el mismo vehículo antes de emitir. No se ha enviado nada.' + COLETILLA,
    polizas: ['p1', 7, 'p2'],
    confirmar: true,
  })
  assert.equal(r.estado, 'duplicado')
  if (r.estado !== 'duplicado') return
  assert.equal(r.causa, 'ya_en_cartera')
  assert.deepEqual(r.polizas, ['p1', 'p2'])
  assert.match(r.mensaje, /••••1186/)
  assert.doesNotMatch(r.mensaje, /duplicadoConfirmado/)
})

test('409 ya_emitido → duplicado sin pólizas; sin mensaje cae al texto propio', () => {
  const r = interpretarEmitir(409, { estado: 'error', causa: 'ya_emitido', mensaje: 'Ya se le emitió otra póliza de hogar.' + COLETILLA })
  assert.equal(r.estado, 'duplicado')
  assert.deepEqual(r.estado === 'duplicado' ? r.polizas : null, [])
  const sin = interpretarEmitir(409, { causa: 'ya_emitido' })
  assert.match(sin.estado === 'duplicado' ? sin.mensaje : '', /últimos 30 días/)
})

test('identidad, proyecto_liberado, cliente_distinto (409) y tomador_fusionado (404) → bloqueado', () => {
  for (const [status, causa] of [
    [409, 'identidad'],
    [409, 'proyecto_liberado'],
    [409, 'cliente_distinto'],
    [404, 'tomador_fusionado'],
  ] as const) {
    const r = interpretarEmitir(status, { estado: 'error', causa, mensaje: `m-${causa}` })
    assert.equal(r.estado, 'bloqueado', causa)
    assert.equal(r.estado === 'bloqueado' ? r.causa : null, causa)
    assert.equal(r.estado === 'bloqueado' ? r.mensaje : null, `m-${causa}`)
  }
  // Un 404 `otro` («la póliza ya no existe») NO es un bloqueo nuevo: sigue siendo error.
  assert.equal(interpretarEmitir(404, { causa: 'otro', mensaje: 'x' }).estado, 'error')
})

test('503 apagado del interruptor NUEVO → nuevo_apagado; el apagado general sigue siendo sin_configurar', () => {
  const nuevo = interpretarEmitir(503, {
    estado: 'error',
    causa: 'apagado',
    mensaje: 'la emisión a clientes NUEVOS (sin póliza previa en cartera) está apagada: falta `CODEOSCOPIC_EMISION_NUEVO=1`. No se ha enviado nada.',
  })
  assert.equal(nuevo.estado, 'nuevo_apagado')
  assert.match(nuevo.estado === 'nuevo_apagado' ? nuevo.mensaje : '', /clientes nuevos está apagada/)
  const general = interpretarEmitir(503, { causa: 'apagado', mensaje: 'CODEOSCOPIC_EMISION_ACTIVA no está a 1' })
  assert.equal(general.estado, 'sin_configurar')
})

test('las causas viejas no cambian: ya_emitida sigue en error y reintento_sin_confirmar en su estado', () => {
  assert.equal(interpretarEmitir(409, { causa: 'ya_emitida', mensaje: 'ya consta' }).estado, 'error')
  assert.equal(interpretarEmitir(409, { causa: 'reintento_sin_confirmar' }).estado, 'reintento_sin_confirmar')
})

test('Telegram: los cortes nuevos son «rechazada» (consta que no salió nada), nunca «incierta»', () => {
  for (const r of [
    interpretarEmitir(409, { causa: 'ya_en_cartera', mensaje: 'x' }),
    interpretarEmitir(409, { causa: 'identidad', mensaje: 'x' }),
    interpretarEmitir(503, { causa: 'apagado', mensaje: 'falta `CODEOSCOPIC_EMISION_NUEVO=1`' }),
  ]) {
    assert.equal(resultadoEmision(r, 'https://x').estado, 'rechazada', r.estado)
  }
})

test('emitirAsegura y pedirEmision solo mandan duplicadoConfirmado cuando es true (lee el fuente)', () => {
  const lib = readFileSync(fileURLToPath(new URL('./retarificar-asegura.ts', import.meta.url)), 'utf8')
  assert.match(lib, /p\.duplicadoConfirmado === true \? \{ duplicadoConfirmado: true \} : \{\}/)
  const acc = readFileSync(
    fileURLToPath(new URL('../app/(usuario)/correduria/poliza/[id]/retarificar/acciones.ts', import.meta.url)),
    'utf8',
  )
  assert.match(acc, /duplicadoConfirmado: entrada\.duplicadoConfirmado === true/)
})

// ─── 409 `confirmar_figuras` (29/09/2026, arts. 10 y 89 LCS) ────────────────────────────────

const FIGURAS_409 = {
  estado: 'error',
  causa: 'confirmar_figuras',
  mensaje: 'Esta variante cambia las personas o el CP del riesgo respecto a la primera. No se ha emitido nada.',
  cambios: [
    { campo: 'conductor_habitual', antes: 'Juan Pérez López', despues: 'María Pérez Ruiz' },
    { campo: 'cp', antes: '41003', despues: '41900' },
  ],
  exigidas: ['conductor', 'cp', 'cliente'],
}

test('409 confirmar_figuras → su estado, con los cambios y las exigidas tal cual', () => {
  const r = interpretarEmitir(409, FIGURAS_409)
  assert.equal(r.estado, 'confirmar_figuras')
  if (r.estado !== 'confirmar_figuras') return
  assert.deepEqual(r.cambios, FIGURAS_409.cambios)
  assert.deepEqual(r.exigidas, ['conductor', 'cp', 'cliente'])
  assert.match(r.mensaje, /No se ha emitido nada/)
  // Consta que no salió nada: en Telegram es «rechazada» y manda a la pantalla, no confirma.
  const tg = resultadoEmision(r, 'https://x')
  assert.equal(tg.estado, 'rechazada')
  assert.match(tg.texto, /pantalla de emisión/)
})

test('409 confirmar_figuras con cambios o exigidas corruptos NO da ese estado (ni «emitido»)', () => {
  const corruptos: unknown[] = [
    { ...FIGURAS_409, cambios: 'x' },
    { ...FIGURAS_409, cambios: [{ campo: 'domicilio', antes: 'a', despues: 'b' }] },
    { ...FIGURAS_409, cambios: [{ campo: 'tomador', antes: 7, despues: 'b' }] },
    { ...FIGURAS_409, cambios: [null] },
    { ...FIGURAS_409, exigidas: ['conductor', 'firma'] },
    { ...FIGURAS_409, exigidas: [] },
    { ...FIGURAS_409, exigidas: undefined },
  ]
  for (const c of corruptos) {
    const r = interpretarEmitir(409, c)
    assert.equal(r.estado, 'error', JSON.stringify(c))
  }
})

async function cuerpoEnviado(extra: { figurasConfirmadas?: string[] }): Promise<Record<string, unknown>> {
  const antes = { fetch: globalThis.fetch, secret: process.env.ASEGURA_OPERADOR_SECRET }
  let cuerpo: Record<string, unknown> = {}
  process.env.ASEGURA_OPERADOR_SECRET = 'test'
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    cuerpo = JSON.parse(String(init?.body ?? '{}'))
    return new Response(JSON.stringify(FIGURAS_409), { status: 409 })
  }) as typeof fetch
  try {
    const r = await emitirAsegura({ projectId: 'p1', campos: {}, ...extra })
    assert.equal(r.estado, 'confirmar_figuras')
  } finally {
    globalThis.fetch = antes.fetch
    if (antes.secret === undefined) delete process.env.ASEGURA_OPERADOR_SECRET
    else process.env.ASEGURA_OPERADOR_SECRET = antes.secret
  }
  return cuerpo
}

test('figurasConfirmadas viaja en el cuerpo cuando se pasa, y no cuando no', async () => {
  const con = await cuerpoEnviado({ figurasConfirmadas: ['conductor', 'cp', 'cliente'] })
  assert.deepEqual(con.figurasConfirmadas, ['conductor', 'cp', 'cliente'])
  const sin = await cuerpoEnviado({})
  assert.equal('figurasConfirmadas' in sin, false)
})

test('textos de las casillas: nombre del conductor (o del tomador), CP y cliente; sin nombre no se inventa', () => {
  const cambios = FIGURAS_409.cambios as Parameters<typeof textoCasillaFigura>[1]
  assert.equal(textoCasillaFigura('conductor', cambios), 'María Pérez Ruiz conduce el vehículo de forma habitual.')
  assert.equal(textoCasillaFigura('cp', cambios), 'El vehículo duerme y circula habitualmente en el CP 41900.')
  assert.equal(textoCasillaFigura('cliente', cambios), 'Se lo he explicado al cliente y lo confirma.')
  assert.equal(
    textoCasillaFigura('conductor', [{ campo: 'tomador', antes: 'A', despues: 'Pedro Gil' }]),
    'Pedro Gil conduce el vehículo de forma habitual.',
  )
  assert.equal(
    textoCasillaFigura('conductor', [{ campo: 'propietario', antes: 'A', despues: 'B' }]),
    'La persona declarada como conductor habitual conduce el vehículo de forma habitual.',
  )
  assert.equal(figurasCompletas(['conductor', 'cliente'], new Set(['conductor'])), false)
  assert.equal(figurasCompletas(['conductor', 'cliente'], new Set(['cliente', 'conductor'])), true)
  assert.equal(figurasCompletas([], new Set()), false)
})

test('cepo (lee emision.tsx): el botón de emitir del paso confirmar_figuras está disabled mientras falte una exigida', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../app/(usuario)/correduria/poliza/[id]/retarificar/emision.tsx', import.meta.url)),
    'utf8',
  )
  const i = src.indexOf("estado.paso === 'confirmar_figuras' && (")
  assert.ok(i > 0, 'falta el panel confirmar_figuras')
  const panel = src.slice(i, src.indexOf("estado.paso === 'bloqueado' && (", i))
  // `completas` sale de figurasCompletas(exigidas, marcadas), y el botón de emitir se deshabilita con él.
  assert.match(panel, /const completas = figurasCompletas\(estado\.exigidas, figurasMarcadas\)/)
  assert.match(panel, /disabled=\{!completas\}/)
  assert.match(panel, /Marca las casillas para emitir/)
  // El reenvío lleva figurasConfirmadas y conserva las opciones previas.
  assert.match(panel, /\.\.\.estado\.opciones,\s*figurasConfirmadas:/)
  // Una casilla por exigida, sin preseleccionar.
  assert.match(panel, /estado\.exigidas\.map\(/)
  assert.match(panel, /checked=\{figurasMarcadas\.has\(e\)\}/)
})
