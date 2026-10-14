// Cepos de la ORQUESTACIÓN del paso y del cierre del explorador (fase B, 13/10/2026). `node --test`. BD, lock e IA son
// dobles: lo que se prueba es el ORDEN (la IA nunca dentro de la transacción; tx2 descarta si el estado cambió; el cierre
// respeta el mismo lock y la IA en vuelo). Fixtures sintéticas, sin datos personales.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanearInventarioDom, type InventarioDom } from '@central/module-tarificacion'
import { PasoOcupado, consumoPaso, ejecutarCierre, ejecutarPaso, planDeMemoriaUsable, type DepsPaso, type EstadoPaso } from './tarificador-explorador-paso.ts'

const inventario = sanearInventarioDom({
  marcos: [{
    url: 'https://portal.example.test/alta', titulos: [{ texto: 'Datos del riesgo', tag: 'h2' }],
    elementos: [
      { tag: 'input', id: 'superficie', type: 'text', etiqueta: 'Superficie' },
      { tag: 'button', id: 'sig', texto: 'Siguiente' },
    ],
  }],
}, undefined, { refs: true }) as InventarioDom

const RESPUESTA_IA = JSON.stringify({
  version: 1, pantalla: { nombre: 'Riesgo', tipo: 'formulario' },
  acciones: [
    { accion: 'rellenar', ref: 'm0e0', dato: 'inmueble.superficie_m2' },
    { accion: 'avanzar', ref: 'm0e1', efectoEsperado: 'siguiente_pantalla', confianza: 'alta' },
  ],
  mapeo: [], motivo: null,
})

const entrada = { inventario, avancesFallidos: 0, ramo: 'hogar', entrada: 'allianz:particulares:hogar', conDatosReales: false, modelo: 'anthropic/claude-sonnet-4.5' }

function dobles(o: { ocupado?: boolean; iaEnVuelo?: boolean; durante?: (st: EstadoPaso) => void; iaFalla?: boolean } = {}) {
  const st: EstadoPaso = { pasos: [], cerrada: false, iaEnVuelo: o.iaEnVuelo ?? false, inicio: new Date('2026-10-13T10:00:00Z'), llamadasCabecera: 0, eurCabecera: 0 }
  const traza: string[] = []
  let dentro = false
  const costes: number[] = []
  const d: DepsPaso<'bd'> = {
    conLock: async (fn) => {
      if (o.ocupado) throw new PasoOcupado()
      if (dentro) throw new Error('lock anidado')
      dentro = true
      traza.push('lock')
      try {
        return await fn('bd')
      } finally {
        dentro = false
        traza.push('suelta')
      }
    },
    leer: async () => ({ ...st, pasos: [...st.pasos] }),
    reservarIA: async () => { st.iaEnVuelo = true; traza.push('reserva') },
    liberarIA: async () => { st.iaEnVuelo = false; traza.push('libera') },
    registrar: async (_bd, p) => {
      st.pasos.push({ huella: p.huella, respuesta: p.respuesta, origen: p.origen, llamadaIA: p.origen === 'ia', costeEur: p.costeEur, acciones: 0 })
      st.iaEnVuelo = false
      costes.push(p.costeEur)
      traza.push(`registra:${p.origen}`)
      return '2026-10-13T10:06:00.000Z'
    },
    anotarDescartada: async (_bd, c) => { st.eurCabecera += c; traza.push('descartada') },
    mapas: async () => [],
    ia: async () => {
      traza.push(dentro ? 'IA-DENTRO-DEL-LOCK' : 'ia')
      o.durante?.(st)
      if (o.iaFalla) throw new Error('timeout')
      return RESPUESTA_IA
    },
    ahora: () => new Date('2026-10-13T10:01:00Z'),
    env: {},
  }
  return { d, st, traza, costes }
}

test('paso con IA: la IA corre FUERA de la transacción (tx1 reserva y suelta; tx2 registra)', async () => {
  const { d, traza } = dobles()
  const r = await ejecutarPaso(entrada, d)
  assert.equal(r.tipo, 'ok')
  assert.ok(r.tipo === 'ok' && r.origen === 'ia' && r.respuesta.acciones.length === 2 && r.leaseHasta === '2026-10-13T10:06:00.000Z')
  assert.deepEqual(traza, ['lock', 'reserva', 'suelta', 'ia', 'lock', 'registra:ia', 'suelta'])
})

test('si el estado cambió durante la IA (otro paso registrado), tx2 DESCARTA, anota el coste, libera y da conflicto', async () => {
  const { d, traza, st } = dobles({
    durante: (s) => { s.pasos.push({ huella: '0000000000000000', respuesta: null, origen: 'regla', llamadaIA: false, costeEur: 0, acciones: 0 }) },
  })
  const r = await ejecutarPaso(entrada, d)
  assert.deepEqual(r, { tipo: 'conflicto', motivo: 'estado_cambiado' })
  assert.ok(!traza.includes('registra:ia'), 'no se registra un paso sobre un estado que cambió')
  assert.ok(traza.includes('descartada') && traza.includes('libera'))
  assert.ok(st.eurCabecera > 0, 'el coste de la llamada descartada cuenta para el tope')
})

test('si la exploración se cerró durante la IA: conflicto exploracion_cerrada, sin registrar', async () => {
  const { d, traza } = dobles({ durante: (s) => { s.cerrada = true } })
  assert.deepEqual(await ejecutarPaso(entrada, d), { tipo: 'conflicto', motivo: 'exploracion_cerrada' })
  assert.ok(!traza.includes('registra:ia'))
})

test('IA ya en vuelo (otro paso) o lock ocupado: PasoOcupado (→ 409) sin llamar a la IA', async () => {
  const a = dobles({ iaEnVuelo: true })
  await assert.rejects(ejecutarPaso(entrada, a.d), PasoOcupado)
  assert.ok(!a.traza.includes('ia'))
  const b = dobles({ ocupado: true })
  await assert.rejects(ejecutarPaso(entrada, b.d), PasoOcupado)
  assert.ok(!b.traza.includes('ia'))
})

test('si la tx2 lanza (PasoOcupado o error de BD) tras pagar la IA, el rescate anota el coste y libera; el error original sube', async () => {
  for (const fallo of [new PasoOcupado(), new Error('bd caída')]) {
    const { d, traza } = dobles()
    const lock = d.conLock
    let n = 0
    d.conLock = (fn) => (++n === 2 ? Promise.reject(fallo) : lock(fn))
    let rescatado: number | null = null
    d.rescate = async (c) => { rescatado = c; traza.push('rescate') }
    await assert.rejects(ejecutarPaso(entrada, d), (err) => err === fallo)
    assert.ok(rescatado !== null && rescatado > 0, 'el coste de la IA pagada se anota')
  }
  // Un rescate que falla no tapa el error original.
  const { d } = dobles()
  const lock = d.conLock
  let n = 0
  const original = new Error('bd caída')
  d.conLock = (fn) => (++n === 2 ? Promise.reject(original) : lock(fn))
  d.rescate = async () => { throw new Error('rescate caído') }
  await assert.rejects(ejecutarPaso(entrada, d), (err) => err === original)
  // Sin IA (lock ocupado en tx1) no hay nada que rescatar.
  const b = dobles({ ocupado: true })
  let llamado = false
  b.d.rescate = async () => { llamado = true }
  await assert.rejects(ejecutarPaso(entrada, b.d), PasoOcupado)
  assert.equal(llamado, false)
})

test('IA caída: se registra «parar ambiguo» con el PEOR caso de coste', async () => {
  const { d, costes } = dobles({ iaFalla: true })
  const r = await ejecutarPaso(entrada, d)
  assert.ok(r.tipo === 'ok' && r.respuesta.acciones[0].accion === 'parar')
  assert.ok(costes[0] > 0)
})

test('parada determinista (pantalla de código): se registra en tx1, sin reservar ni llamar a la IA', async () => {
  const otp = sanearInventarioDom({ marcos: [{ url: 'https://portal.example.test/v', titulos: ['Código de verificación'], elementos: [{ tag: 'input', id: 'otp', type: 'text' }] }] }, undefined, { refs: true }) as InventarioDom
  const { d, traza } = dobles()
  const r = await ejecutarPaso({ ...entrada, inventario: otp }, d)
  assert.ok(r.tipo === 'ok' && r.origen === 'regla')
  assert.deepEqual(traza, ['lock', 'registra:regla', 'suelta'])
})

test('consumoPaso: llamadas y € de la cabecera mandan (incluyen las descartadas)', () => {
  const st: EstadoPaso = { pasos: [{ huella: 'a', respuesta: null, origen: 'ia', llamadaIA: true, costeEur: 0.1, acciones: 2 }], cerrada: false, iaEnVuelo: false, inicio: null, llamadasCabecera: 3, eurCabecera: 0.5 }
  assert.deepEqual(consumoPaso(st, new Date()), { llamadas: 3, acciones: 2, eur: 0.5, ms: 0, pasos: 1 })
  assert.equal(consumoPaso({ ...st, llamadasCabecera: 0, eurCabecera: 0 }, new Date()).eur, 0.1)
})

test('cierre: toma el MISMO lock, respeta la IA en vuelo y solo entonces construye el mapa', async () => {
  let dentro = false
  let cerrado = 0
  const deps = (o: { ocupado?: boolean; iaEnVuelo?: boolean; cerrada?: boolean }) => ({
    conLock: async <T>(fn: (bd: 'bd') => Promise<T>): Promise<T> => {
      if (o.ocupado) throw new PasoOcupado()
      dentro = true
      try {
        return await fn('bd')
      } finally {
        dentro = false
      }
    },
    leer: async () => ({ cerrada: o.cerrada ?? false, iaEnVuelo: o.iaEnVuelo ?? false }),
    cerrar: async () => {
      assert.ok(dentro, 'el mapa se construye y guarda DENTRO del lock')
      cerrado++
      return true
    },
  })
  await assert.rejects(ejecutarCierre(deps({ ocupado: true })), PasoOcupado)
  await assert.rejects(ejecutarCierre(deps({ iaEnVuelo: true })), PasoOcupado)
  assert.equal(cerrado, 0)
  assert.deepEqual(await ejecutarCierre(deps({ cerrada: true })), { tipo: 'conflicto', motivo: 'exploracion_cerrada' })
  assert.deepEqual(await ejecutarCierre(deps({})), { tipo: 'ok' })
  assert.equal(cerrado, 1)
})

test('rutas: paso y cierre usan el lock por exploración y responden 409 si está ocupado', async () => {
  const { readFileSync } = await import('node:fs')
  const path = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const aqui = path.dirname(fileURLToPath(import.meta.url))
  for (const r of ['paso', 'cierre']) {
    const f = readFileSync(path.join(aqui, '..', 'app', 'api', 'tarificador', 'explorador', r, 'route.ts'), 'utf8')
    assert.match(f, /conLock: \(fn\) => conLockExploracion\(e, fn\)/, `${r}: usa el try-lock por exploración`)
    assert.match(f, /err instanceof PasoOcupado\) return NextResponse\.json\(\{ estado: 'conflicto', motivo: 'paso_en_curso' \}, \{ status: 409 \}\)/, `${r}: ocupado → 409`)
    assert.match(f, r === 'paso' ? /ejecutarPaso<Bd>\(/ : /ejecutarCierre<Bd>\(/)
  }
})

test('memoria con datos reales: un plan con elegir/marcar NO se reutiliza (repetiría el uso/régimen de otra exploración)', () => {
  const plan = (acciones: unknown[]) => ({ version: 1, pantalla: { nombre: 'x', tipo: 'formulario' }, acciones, mapeo: [], motivo: 'del mapa' }) as never
  const elegir = { accion: 'elegir', ref: 'm0e1', opcion: { valor: 'H' } }
  const rellenar = { accion: 'rellenar', ref: 'm0e2', dato: 'inmueble.codigo_postal' }
  const marcar = { accion: 'marcar', ref: 'm0e3' }
  assert.equal(planDeMemoriaUsable(plan([rellenar, elegir]), true), false)
  assert.equal(planDeMemoriaUsable(plan([marcar]), true), false)
  assert.equal(planDeMemoriaUsable(plan([rellenar]), true), true)
  assert.equal(planDeMemoriaUsable(plan([rellenar, elegir]), false), true)
})

test('guardado del presupuesto: tras un guardar_presupuesto YA registrado, la pantalla siguiente sin importes admite Descargar y terminar []', async () => {
  const trasGuardar = sanearInventarioDom({
    marcos: [{ url: 'https://portal.example.test/archivado', titulos: [{ texto: 'Proyecto archivado', tag: 'h2' }], elementos: [{ tag: 'button', id: 'pdf', texto: 'Descargar PDF' }] }],
  }, undefined, { refs: true }) as InventarioDom
  const descargar = JSON.stringify({ version: 1, pantalla: { nombre: 'Archivado', tipo: 'resultado' }, acciones: [{ accion: 'avanzar', ref: 'm0e0', efectoEsperado: 'guardar_presupuesto', confianza: 'alta' }], mapeo: [], motivo: null })
  const guardado = { version: 1 as const, pantalla: { nombre: 'Precio', tipo: 'resultado' as const }, acciones: [{ accion: 'avanzar' as const, ref: 'm0e9', efectoEsperado: 'guardar_presupuesto' as const, confianza: 'alta' as const }], mapeo: [], motivo: null }
  for (const previo of [true, false]) {
    const { d, st } = dobles()
    d.ia = async () => descargar
    if (previo) st.pasos.push({ huella: '0000000000000000', respuesta: guardado, origen: 'ia', llamadaIA: true, costeEur: 0, acciones: 1 })
    const r = await ejecutarPaso({ ...entrada, inventario: trasGuardar }, d)
    assert.equal(r.tipo, 'ok')
    if (r.tipo !== 'ok') continue
    const a = r.respuesta.acciones[0]
    // Sin guardado previo (sin precio visto) el validador lo rechaza → parar.
    assert.equal(a.accion, previo ? 'avanzar' : 'parar', `previo=${previo}`)
  }
})
