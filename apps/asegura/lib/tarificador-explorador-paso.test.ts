// Cepos de la ORQUESTACIÓN del paso y del cierre del explorador (fase B, 13/10/2026). `node --test`. BD, lock e IA son
// dobles: lo que se prueba es el ORDEN (la IA nunca dentro de la transacción; tx2 descarta si el estado cambió; el cierre
// respeta el mismo lock y la IA en vuelo). Fixtures sintéticas, sin datos personales.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { construirMapa, huellaPantalla, sanearInventarioDom, type InventarioDom, type RespuestaExplorador } from '@central/module-tarificacion'
import { PasoOcupado, consumoPaso, ejecutarCierre, ejecutarPaso, erroresPasoAnterior, esBucle, memoriaAgotadaEnPantalla, planDeMemoriaUsable, type DepsPaso, type EstadoPaso, type PasoARegistrar } from './tarificador-explorador-paso.ts'

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
  const registrados: PasoARegistrar[] = []
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
      registrados.push(p)
      // Como `pasosDe` (BD): la fila de un paso de login también se lee con el tipo de la normal (lleva `fase` y el validador normal la rechaza).
      st.pasos.push({ huella: p.huella, respuesta: p.respuesta as RespuestaExplorador, origen: p.origen, llamadaIA: p.origen === 'ia', costeEur: p.costeEur, acciones: 0 })
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
  return { d, st, traza, costes, registrados }
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

// 14/10/2026: la exploración real de Allianz Hogar terminó `sin_salida` por FALSO bucle (misma huella, pero cada lote
// rellenaba más campos). El servidor solo declara bucle si además NO cambia el conjunto de refs con valor.
const conRelleno = (relleno: boolean[]) => sanearInventarioDom({
  marcos: [{
    url: 'https://portal.example.test/alta', titulos: [{ texto: 'Datos del riesgo', tag: 'h2' }],
    elementos: [
      ...relleno.map((c, i) => ({ tag: 'input', id: `campo${i}`, type: 'text', etiqueta: `Campo ${i}`, conValor: c })),
      { tag: 'button', id: 'sig', texto: 'Siguiente' },
    ],
  }],
}, undefined, { refs: true }) as InventarioDom

test('🪤 bucle: misma huella con MÁS campos rellenos → no es bucle (sigue a la IA); mismo relleno → sin_salida por regla', async () => {
  const inv0 = conRelleno([false, false, false])
  const inv1 = conRelleno([true, false, false])
  const inv2 = conRelleno([true, true, false])
  const huella = huellaPantalla(inv0)
  assert.equal(huellaPantalla(inv2), huella)
  const previo = (inv: InventarioDom) => ({ huella, inventario: inv, respuesta: null, origen: 'ia' as const, llamadaIA: true, costeEur: 0, acciones: 3 })

  assert.equal(esBucle([previo(inv0), previo(inv1)], inv2, huella, 0), false)
  assert.equal(esBucle([previo(inv2), previo(inv2)], inv2, huella, 0), true)
  // Paso guardado sin inventario (anterior al cambio): relleno desconocido = sin cambio → bucle, como antes.
  const { inventario: _i, ...sinInv } = previo(inv0)
  assert.equal(esBucle([sinInv, sinInv], inv2, huella, 0), true)

  // De punta a punta con los dobles: dos pasos previos con menos relleno → la IA responde, no la regla.
  const progreso = dobles()
  progreso.st.pasos.push(previo(inv0), previo(inv1))
  const r1 = await ejecutarPaso({ ...entrada, inventario: inv2 }, progreso.d)
  assert.ok(r1.tipo === 'ok' && r1.origen === 'ia')

  const atasco = dobles()
  atasco.st.pasos.push(previo(inv2), previo(inv2))
  const r2 = await ejecutarPaso({ ...entrada, inventario: inv2 }, atasco.d)
  assert.ok(r2.tipo === 'ok' && r2.origen === 'regla')
  assert.ok(r2.tipo === 'ok' && r2.respuesta.acciones[0].accion === 'parar' && r2.respuesta.acciones[0].motivo === 'sin_salida')
  assert.ok(!atasco.traza.includes('ia'))
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

test('🪤 incidencias del worker (14/10/2026): van a los errores del paso ANTERIOR con la etiqueta de SU inventario; nunca un valor', async () => {
  const inc = [{ accion: 'rellenar' as const, ref: 'm0e0', dato: 'inmueble.superficie_m2', causa: 'valor_no_aplicado' as const }]
  // Sin pasos previos (o sin incidencias): no se anota nada.
  assert.equal(erroresPasoAnterior([], inc), undefined)
  const previo = { huella: 'h', respuesta: null, origen: 'ia' as const, llamadaIA: true, costeEur: 0, acciones: 1, inventario }
  assert.equal(erroresPasoAnterior([previo], []), undefined)
  assert.deepEqual(erroresPasoAnterior([previo], inc), ['ejecucion: rellenar m0e0 «Superficie» (inmueble.superficie_m2): valor_no_aplicado'])
  // Por el paso entero: la tx2 de IA lleva `erroresPasoAnterior` al registrar (el último paso guardado es el previo).
  const { d, st, registrados } = dobles()
  st.pasos.push(previo)
  const r = await ejecutarPaso({ ...entrada, incidencias: inc }, d)
  assert.equal(r.tipo, 'ok')
  assert.deepEqual(registrados[0].erroresPasoAnterior, ['ejecucion: rellenar m0e0 «Superficie» (inmueble.superficie_m2): valor_no_aplicado'])
  assert.equal(registrados[0].errores, null, 'el paso NUEVO no se marca como rechazado')
})

// ─── LOGIN ASISTIDO (14/10/2026) ─────────────────────────────────────────────
const invSso = sanearInventarioDom({
  marcos: [{
    url: 'https://ssoaut.gco.global/my.policy',
    elementos: [
      { tag: 'input', id: 'usernamegco', type: 'text', etiqueta: 'Nombre de usuario' },
      { tag: 'input', id: 'password', type: 'password', etiqueta: 'Contraseña' },
      { tag: 'button', id: 'SubmitCreds', type: 'submit', texto: 'Iniciar sesión' },
    ],
  }],
}, undefined, { refs: true }) as InventarioDom
const LOGIN_IA = JSON.stringify({
  version: 1, fase: 'login', pantalla: { nombre: 'Acceso', tipo: 'formulario' },
  acciones: [
    { accion: 'rellenar', ref: 'm0e0', dato: 'credencial.usuario' },
    { accion: 'rellenar', ref: 'm0e1', dato: 'credencial.contrasena' },
    { accion: 'avanzar', ref: 'm0e2', efectoEsperado: 'siguiente_pantalla', confianza: 'alta' },
  ],
  mapeo: [], motivo: null,
})
const entradaLogin = { ...entrada, inventario: invSso, entrada: 'occident:productos:hogar', fase: 'login' as const }

test('🪤 fase de login: validador de login (claves credencial.*), SIN memoria; la misma respuesta en fase normal se rechaza', async () => {
  const a = dobles()
  let memoria = 0
  a.d.mapas = async () => { memoria++; return [] }
  let prompt = ''
  a.d.ia = async (p) => { prompt = p; return LOGIN_IA }
  const r = await ejecutarPaso(entradaLogin, a.d)
  assert.ok(r.tipo === 'ok' && r.respuesta.acciones.length === 3 && 'fase' in r.respuesta && r.respuesta.fase === 'login')
  assert.equal(memoria, 0, 'la fase de login no consulta la memoria del mapa')
  assert.match(prompt, /FASE DE LOGIN/)
  // Fase normal con la MISMA respuesta (y la misma entrada): credencial.* no existe → parar ambiguo.
  const b = dobles()
  b.d.ia = async () => LOGIN_IA
  const n = await ejecutarPaso({ ...entradaLogin, fase: 'normal' }, b.d)
  assert.ok(n.tipo === 'ok' && n.respuesta.acciones[0].accion === 'parar')
  assert.ok(b.registrados[0].errores?.length)
  // Login con una clave de ramo (o un valor en vez de la clave) → parar, nunca se reenvía al worker.
  for (const malo of ['tomador.nif', 'secreto-literal']) {
    const c = dobles()
    c.d.ia = async () => LOGIN_IA.replace('credencial.usuario', malo)
    const m = await ejecutarPaso(entradaLogin, c.d)
    assert.ok(m.tipo === 'ok' && m.respuesta.acciones[0].accion === 'parar', malo)
  }
})

test('🪤 fase de login: como mucho MAX_PANTALLAS_LOGIN pasos de login (regla, sin IA); la parada lleva la marca de fase', async () => {
  const a = dobles()
  for (let i = 0; i < 4; i++) a.st.pasos.push({ huella: `${i}`.padStart(16, '0'), respuesta: { fase: 'login', acciones: [] } as unknown as RespuestaExplorador, origen: 'ia', llamadaIA: true, costeEur: 0, acciones: 0 })
  const r = await ejecutarPaso(entradaLogin, a.d)
  assert.ok(r.tipo === 'ok' && r.origen === 'regla' && r.respuesta.acciones[0].accion === 'parar' && 'fase' in r.respuesta)
  assert.ok(!a.traza.includes('ia'))
})

test('🪤 fase de login (revisión): la CONTRASEÑA una sola vez por exploración, también tras un reintento del trabajo', async () => {
  // Un paso de login YA guardado que pidió la contraseña (p. ej. el intento anterior murió por infra tras enviarla).
  const a = dobles()
  a.st.pasos.push({ huella: '1'.padStart(16, '0'), respuesta: JSON.parse(LOGIN_IA) as RespuestaExplorador, origen: 'ia', llamadaIA: true, costeEur: 0, acciones: 3 })
  a.d.ia = async () => LOGIN_IA
  const r = await ejecutarPaso(entradaLogin, a.d)
  assert.ok(r.tipo === 'ok' && r.respuesta.acciones[0].accion === 'parar', 'segunda contraseña → parar')
  assert.deepEqual(a.registrados[0].errores, ['login_contrasena_repetida'])
  // Sin contraseña previa (p. ej. solo se eligió el usuario) → pasa.
  const b = dobles()
  b.st.pasos.push({ huella: '1'.padStart(16, '0'), respuesta: { fase: 'login', pantalla: { nombre: null, tipo: 'otro' }, acciones: [{ accion: 'avanzar', ref: 'm0e2' }] } as unknown as RespuestaExplorador, origen: 'ia', llamadaIA: true, costeEur: 0, acciones: 1 })
  b.d.ia = async () => LOGIN_IA
  const s = await ejecutarPaso(entradaLogin, b.d)
  assert.ok(s.tipo === 'ok' && s.respuesta.acciones.length === 3)
})

test('🪤 0.3.16: respuesta rechazada por el validador → los errores del paso dicen QUÉ acción y QUÉ ref (sin valores)', async () => {
  const { d, registrados } = dobles()
  d.ia = async () => JSON.stringify({
    version: 1, pantalla: { nombre: 'Riesgo', tipo: 'formulario' },
    acciones: [
      { accion: 'rellenar', ref: 'm0e1', dato: 'inmueble.superficie_m2' },
      { accion: 'marcar', ref: 'r999' },
    ],
    mapeo: [], motivo: null,
  })
  const r = await ejecutarPaso(entrada, d)
  assert.ok(r.tipo === 'ok' && r.respuesta.acciones[0].accion === 'parar')
  const errores = registrados[0].errores ?? []
  assert.ok(errores.some((e) => /^rechazo acciones\[0\] rellenar m0e1: /.test(e)), errores.join(' | '))
  // Ref inventada por la IA: no se copia al diagnóstico.
  assert.ok(errores.some((e) => /^rechazo acciones\[1\] marcar \?: /.test(e)), errores.join(' | '))
})

// ─── 0.3.24 (Fidelidade real 30/10/2026, 2f0d9b15…): el mapa repetía `marcar` en la MISMA pantalla sin moverla → bucle sin IA ───
test('🪤 0.3.24 memoriaAgotadaEnPantalla: la racha final con ESTA huella incluye un paso del mapa → true; otra pantalla por medio la rompe', () => {
  const p = (huella: string, origen: 'ia' | 'mapa' | 'regla') => ({ huella, origen })
  assert.equal(memoriaAgotadaEnPantalla([], 'h'), false)
  assert.equal(memoriaAgotadaEnPantalla([p('h', 'mapa')], 'h'), true)
  assert.equal(memoriaAgotadaEnPantalla([p('h', 'mapa'), p('h', 'ia')], 'h'), true)
  assert.equal(memoriaAgotadaEnPantalla([p('h', 'ia')], 'h'), false)
  assert.equal(memoriaAgotadaEnPantalla([p('h', 'mapa'), p('otra', 'mapa')], 'h'), false)
  assert.equal(memoriaAgotadaEnPantalla([p('otra', 'mapa')], 'h'), false)
})

test('🪤 0.3.24 ejecutarPaso: el mapa ya aplicado en ESTA pantalla (sigue igual) → decide la IA; en una pantalla nueva el mapa sigue sirviendo', async () => {
  const huella = huellaPantalla(inventario)
  const respuesta = JSON.parse(RESPUESTA_IA) as RespuestaExplorador
  const mapa = construirMapa({ entrada: entrada.entrada, compania: 'allianz', producto: 'hogar', modelo: null, fecha: '2026-10-30', efectosEnPortal: [], redNoGet: [], coste: { llamadas: 1, eurEstimado: 0.01 }, motivoFin: null }, [{ huella, inventario, respuesta }])
  // Pantalla nueva (el último paso es OTRA huella): el mapa sirve, sin IA.
  const a = dobles()
  a.d.mapas = async () => [{ estado: 'revisado', mapa }]
  a.st.pasos.push({ huella: '0000000000000000', respuesta: null, origen: 'mapa', llamadaIA: false, costeEur: 0, acciones: 1 })
  const ra = await ejecutarPaso(entrada, a.d)
  assert.equal(ra.tipo === 'ok' && ra.origen, 'mapa')
  assert.ok(!a.traza.includes('ia'))
  // MISMA pantalla tras un paso del mapa: la IA, con el inventario completo.
  const b = dobles()
  b.d.mapas = async () => [{ estado: 'revisado', mapa }]
  b.st.pasos.push({ huella, respuesta, origen: 'mapa', llamadaIA: false, costeEur: 0, acciones: 2 })
  const rb = await ejecutarPaso(entrada, b.d)
  assert.equal(rb.tipo === 'ok' && rb.origen, 'ia')
  assert.ok(b.traza.includes('ia'))
})
