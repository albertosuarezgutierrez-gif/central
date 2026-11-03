// Fase 3 de la regularización de RC (03/11/2026): ✅ a la compañía con anti-replay, buzón solo del Directorio, cierre
// manual idempotente y claves de la tarea del agente de correo. Repo en memoria (sin BD). `node --test`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  clavesTareaRegularizacion, decidirRespuestaCompaniaConRepo, editarRespuestaCompaniaConRepo, resolverRegularizacionConRepo,
  type FilaCompania, type RepoCompania,
} from './regularizacion-rc-compania.ts'
import { claveTareaDe } from './correo-evento.ts'

const ID = '3f2a1c4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b'
const POL = '11111111-1111-4111-8111-111111111111'

function fila(o: Partial<FilaCompania> = {}): FilaCompania {
  return {
    id: ID, clienteId: 'c', polizaId: POL, compania: 'occident', numero: 'BIDS000002', dgs: 'C0468',
    periodoDesde: '2025-07', periodoHasta: '2026-07', estado: 'completada', documentoId: null,
    companiaEstado: 'borrador', companiaVersion: 1, asunto: 'Regularización RC', textoCifrado: 'cif:texto con la cifra 2.162,49€',
    para: 'soporte@occident.com', resueltaAt: null, ...o,
  }
}

const BUZONES = [
  { id: 'b1', nombre: 'Soporte', email: 'soporte@occident.com', activo: true },
  { id: 'b2', nombre: 'Baja', email: 'baja@occident.com', activo: false },
]

/** Repo en memoria con la MISMA condición de las sentencias (versión, estado, buzón, resuelta). */
function repo(inicial: FilaCompania, o: { enviar?: () => Promise<string>; documento?: () => Promise<{ nombre: string; contenido: Buffer; tipo: string } | null>; tareas?: string[] } = {}) {
  const st = { f: { ...inicial }, envios: [] as { to: string; texto: string; adjuntos: number; idem: string }[], tareas: [...(o.tareas ?? [])], cerradas: [] as string[], historial: [] as string[] }
  const r: RepoCompania = {
    leer: async () => ({ ...st.f }),
    buzones: async (dgs) => (dgs === 'C0468' ? BUZONES : []),
    documento: async () => (o.documento ? o.documento() : { nombre: 'm390.pdf', contenido: Buffer.from('x'), tipo: 'application/pdf' }),
    reclamar: async ({ version }) => {
      const f = st.f
      if (f.estado !== 'completada' || f.resueltaAt || f.companiaEstado !== 'borrador' || f.companiaVersion !== version || !f.para) return 0
      f.companiaEstado = 'enviando'; return 1
    },
    confirmar: async () => (st.f.companiaEstado === 'enviando' ? ((st.f.companiaEstado = 'enviada'), 1) : 0),
    volverABorrador: async () => { if (st.f.companiaEstado === 'enviando') st.f.companiaEstado = 'borrador' },
    enviar: async (x) => { st.envios.push({ to: x.to, texto: x.texto, adjuntos: x.adjuntos.length, idem: x.idempotencia }); return o.enviar ? o.enviar() : 'enviado' },
    guardarEdicion: async ({ textoCifrado, para }) => {
      if (st.f.companiaEstado !== 'borrador' || st.f.resueltaAt) return 0
      if (textoCifrado) st.f.textoCifrado = textoCifrado
      if (para) st.f.para = para
      st.f.companiaVersion++; return 1
    },
    resolver: async () => {
      if (st.f.estado !== 'completada' || st.f.resueltaAt || st.f.companiaEstado === 'enviando') return 0
      st.f.resueltaAt = new Date(); return 1
    },
    cerrarTareas: async () => { const c = st.tareas.splice(0); st.cerradas.push(...c); return c },
    historial: async (_f, t) => { st.historial.push(t) },
    log: () => {},
  }
  return { r, st }
}

const descifrar = (v: string) => (v.startsWith('cif:') ? v.slice(4) : null)
const cifrar = (v: string) => `cif:${v}`

test('✅ camino feliz: sale UNA vez al buzón elegido, con el texto descifrado, y queda enviada', async () => {
  const { r, st } = repo(fila())
  assert.deepEqual(await decidirRespuestaCompaniaConRepo(r, descifrar, { id: ID, version: 1 }), { estado: 'enviada_compania' })
  assert.equal(st.envios.length, 1)
  assert.equal(st.envios[0].to, 'soporte@occident.com')
  assert.match(st.envios[0].texto, /2\.162,49€/)
  assert.equal(st.f.companiaEstado, 'enviada')
  assert.equal(st.historial.length, 1)
})

test('🚨 anti-replay: el ✅ de un mensaje viejo (versión anterior tras ✏️) no envía; el doble clic tampoco', async () => {
  const { r, st } = repo(fila({ companiaVersion: 2 }))
  assert.deepEqual(await decidirRespuestaCompaniaConRepo(r, descifrar, { id: ID, version: 1 }), { estado: 'obsoleta' })
  assert.equal(st.envios.length, 0)
  assert.equal((await decidirRespuestaCompaniaConRepo(r, descifrar, { id: ID, version: 2 })).estado, 'enviada_compania')
  assert.equal((await decidirRespuestaCompaniaConRepo(r, descifrar, { id: ID, version: 2 })).estado, 'sin_cambios')
  assert.equal(st.envios.length, 1, 'dos ✅ = un correo')
})

test('🚨 sin buzón elegido NO sale (no se inventa la dirección); tampoco a un contacto dado de baja en el Directorio', async () => {
  for (const para of [null, 'baja@occident.com', 'inventado@occident.com']) {
    const { r, st } = repo(fila({ para }))
    assert.deepEqual(await decidirRespuestaCompaniaConRepo(r, descifrar, { id: ID, version: 1 }), { estado: 'sin_destino_compania' }, String(para))
    assert.equal(st.envios.length, 0)
    assert.equal(st.f.companiaEstado, 'borrador')
  }
})

test('adjunto: si el cliente subió documento va adjunto; si no se puede leer, NO sale (el texto diría «Adjuntamos»)', async () => {
  const a = repo(fila({ documentoId: 'd1' }))
  assert.equal((await decidirRespuestaCompaniaConRepo(a.r, descifrar, { id: ID, version: 1 })).estado, 'enviada_compania')
  assert.equal(a.st.envios[0].adjuntos, 1)
  const b = repo(fila({ documentoId: 'd1' }), { documento: async () => null })
  assert.equal((await decidirRespuestaCompaniaConRepo(b.r, descifrar, { id: ID, version: 1 })).estado, 'adjunto_ilegible')
  assert.equal(b.st.envios.length, 0)
})

test('fallos de envío: vuelve a borrador (503 ≠ 502); resuelta o texto ilegible no envían', async () => {
  const a = repo(fila(), { enviar: async () => 'sin_proveedor' })
  assert.equal((await decidirRespuestaCompaniaConRepo(a.r, descifrar, { id: ID, version: 1 })).estado, 'canal_no_disponible')
  assert.equal(a.st.f.companiaEstado, 'borrador')
  const b = repo(fila(), { enviar: async () => 'rechazado' })
  assert.equal((await decidirRespuestaCompaniaConRepo(b.r, descifrar, { id: ID, version: 1 })).estado, 'envio_fallido')
  const c = repo(fila({ resueltaAt: new Date() }))
  assert.equal((await decidirRespuestaCompaniaConRepo(c.r, descifrar, { id: ID, version: 1 })).estado, 'ya_resuelta')
  const d = repo(fila({ textoCifrado: 'roto' }))
  assert.equal((await decidirRespuestaCompaniaConRepo(d.r, descifrar, { id: ID, version: 1 })).estado, 'ilegible')
  assert.equal(c.st.envios.length + d.st.envios.length, 0)
})

test('✏️ «Para:»: solo un contacto ACTIVO del Directorio; sube la versión (el ✅ viejo deja de valer)', async () => {
  const { r, st } = repo(fila({ para: null }))
  assert.equal((await editarRespuestaCompaniaConRepo(r, cifrar, { id: ID, entrada: 'Para: inventado@occident.com' })).estado, 'buzon_desconocido')
  assert.equal((await editarRespuestaCompaniaConRepo(r, cifrar, { id: ID, entrada: 'Para: baja@occident.com' })).estado, 'buzon_desconocido')
  assert.equal(st.f.para, null)
  assert.equal(st.f.companiaVersion, 1)
  assert.equal((await editarRespuestaCompaniaConRepo(r, cifrar, { id: ID, entrada: 'Para: SOPORTE@occident.com' })).estado, 'editada')
  assert.equal(st.f.para, 'soporte@occident.com')
  assert.equal(st.f.companiaVersion, 2)
  assert.equal((await decidirRespuestaCompaniaConRepo(r, descifrar, { id: ID, version: 1 })).estado, 'obsoleta')
  assert.equal(st.envios.length, 0)
  const t = 'Buenos días, os paso la facturación real del periodo indicado.'
  assert.equal((await editarRespuestaCompaniaConRepo(r, cifrar, { id: ID, entrada: t })).estado, 'editada')
  assert.equal(st.f.textoCifrado, `cif:${t}`, 'el texto editado se guarda CIFRADO')
  assert.equal((await editarRespuestaCompaniaConRepo(r, cifrar, { id: ID, entrada: 'ok' })).estado, 'invalida')
})

test('🏁 cierre manual idempotente: sella y cierra la tarea una vez; la segunda es ya_resuelta sin historial nuevo', async () => {
  const { r, st } = repo(fila({ companiaEstado: 'enviada' }), { tareas: ['g1'] })
  assert.deepEqual(await resolverRegularizacionConRepo(r, { id: ID, actor: 'telegram' }), { estado: 'resuelta', tareasCerradas: 1 })
  assert.deepEqual(await resolverRegularizacionConRepo(r, { id: ID, actor: 'telegram' }), { estado: 'ya_resuelta', tareasCerradas: 0 })
  assert.deepEqual(st.cerradas, ['g1'])
  assert.equal(st.historial.length, 1)
  assert.equal(st.envios.length, 0, 'cerrar no envía nada')
})

test('🏁 no cierra lo que no toca: sin respuesta del cliente, o con un correo a medio salir', async () => {
  const a = repo(fila({ estado: 'pendiente', companiaEstado: null }), { tareas: ['g1'] })
  assert.deepEqual(await resolverRegularizacionConRepo(a.r, { id: ID, actor: 'x' }), { estado: 'no_completada' })
  assert.deepEqual(a.st.cerradas, [])
  const b = repo(fila({ companiaEstado: 'enviando' }), { tareas: ['g1'] })
  assert.deepEqual(await resolverRegularizacionConRepo(b.r, { id: ID, actor: 'x' }), { estado: 'enviando' })
  assert.deepEqual(b.st.cerradas, [])
})

test('la clave de tarea que cierra el 🏁 es EXACTAMENTE la que crea el agente de correo para esa póliza + periodo', () => {
  const c = clavesTareaRegularizacion(POL, { desde: '2025-07', hasta: '2026-07' })
  const item = { tipo: 'suplemento', subtipo: 'regularizacion_rc', periodo: '2025-07_2026-07' } as unknown as Parameters<typeof claveTareaDe>[0]
  assert.equal(c.nueva, claveTareaDe(item, POL))
  assert.equal(c.vieja, claveTareaDe({ tipo: 'suplemento' } as unknown as Parameters<typeof claveTareaDe>[0], POL))
})

test('SQL: reclamar exige versión + borrador + buzón + sin resolver; cerrar tareas la vieja solo de ESE periodo; todo con correduria_id', () => {
  const src = readFileSync(new URL('./regularizacion-rc-compania.ts', import.meta.url), 'utf8')
  assert.match(src, /set compania_estado = 'enviando'[\s\S]*?compania_estado = 'borrador' and compania_version = \$\{version\} and compania_para is not null/)
  assert.match(src, /e\.clave_tarea = \$\{vieja\} and left\(e\.detalle->>'periodoDesde', 7\) = \$\{periodo\.desde\}/)
  for (const m of src.matchAll(/Prisma\.sql`([\s\S]*?)`/g)) {
    if (/solicitud_regularizacion|gestiones|correo_evento_entrante/.test(m[1])) assert.match(m[1], /correduria_id/, m[1].slice(0, 80))
  }
  // Fase 2 no lee columnas de fase 3: sin el SQL 2026-11-03c el portal y la petición al cliente siguen igual.
  const f2 = readFileSync(new URL('./regularizacion-rc.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(f2, /compania_estado|resuelta_at|compania_texto/)
})

test('Telegram: sin buzón dice «Falta dirección de …», enseña el Directorio y NO ofrece ✅; con buzón sí', async () => {
  const { textoPropuestaCompania, botonesRespuestaCompania, leerBotonRrc } = await import('./regularizacion-rc-telegram.ts')
  const base = { quien: 'OBRAS SL', compania: 'occident', numeroPoliza: 'BIDS000002', periodo: { desde: '2025-07', hasta: '2026-07' }, asunto: 'A', texto: 'T 2.162,49€', conDocumento: false }
  const sin = textoPropuestaCompania({ ...base, para: null, buzones: [{ nombre: 'Soporte', email: 'soporte@occident.com' }] })
  assert.match(sin, /Falta dirección de occident/)
  assert.match(sin, /soporte@occident\.com/)
  assert.ok(botonesRespuestaCompania(ID, 1, false).flat().every((b) => !b.callback.startsWith('rrc_cenv')))
  const con = textoPropuestaCompania({ ...base, para: 'soporte@occident.com', buzones: [] })
  assert.doesNotMatch(con, /Falta dirección/)
  const cenv = botonesRespuestaCompania(ID, 4, true).flat().find((b) => b.callback.startsWith('rrc_cenv'))
  assert.equal(cenv?.callback, `rrc_cenv:${ID}:4`)
  assert.ok(Buffer.byteLength(cenv!.callback) <= 64)
  assert.deepEqual(leerBotonRrc('cenv', [ID, '4']), { accion: 'cenv', id: ID, version: 4 })
  assert.equal(leerBotonRrc('cenvx', [ID, '4']), null)
})
