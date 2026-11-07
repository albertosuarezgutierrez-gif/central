import { test } from 'node:test'
import assert from 'node:assert/strict'
import { previsualizar, activar, reenviar, type RepoOperador, type DatosEmision } from '../lib/operador.ts'
import { MEDIADOR } from '../../../packages/legal-templates/src/encargado.ts'
import { PLANTILLA_ENCARGO_V1 } from '../../../packages/core-herramientas/src/plantilla-encargo-v1.ts'
import type { CanalCorreo } from '../lib/canal-correo.ts'

const datos = (): DatosEmision => ({
  cuenta: { id: 'c1', cif: 'B88936158', razon_social: 'Talleres de Automoción G2, S.L.', via: 'Calle Prueba', numero: '1', resto: null, cp: '41003', municipio: 'Sevilla', provincia: 'Sevilla' },
  dueno: { persona_id: 'p1', email: 'dueno@prueba.test', nombre: 'Persona Dueña', nif: '28823484E', titulo: 'administrador' },
  plantilla: { id: 'pl1', version: 'v1', estado: 'borrador', texto: PLANTILLA_ENCARGO_V1.texto, sha256: 'x' },
  siguiente: 1, vigentes: [], con_ref: ['contabilidad', 'rrhh', 'nominas'],
})

function repo(d: DatosEmision | null) {
  const llamadas: string[] = []
  const r: RepoOperador = {
    async datosEmision() { return d },
    async emitirVersion(e) { llamadas.push(`emitir:${e.herramientas.join(',')}:${e.confirmo}`); return { versionId: 'v1', n: 1, envioId: 'e1' } },
    async reservarEnvio(_v, tipo) { llamadas.push(`reservar:${tipo}`); return { envioId: 'e2', destinatario: 'dueno@prueba.test', razonSocial: 'X' } },
    async resolverEnvio(_id, estado) { llamadas.push(`resolver:${estado}`) },
  }
  return { r, llamadas }
}
const canal = (ok = true) => { const enviados: string[] = []; const c: CanalCorreo = { async enviar(to, m) { enviados.push(`${to}|${m.subject}`); return ok ? { ok: true, id: 'msg' } : { ok: false, error: 'smtp' } } }; return { c, enviados } }
const base = { cuentaId: 'c1', herramientas: ['contabilidad', 'rrhh'], confirmoDestinatario: 'dueno@prueba.test', confirmoBorrador: true, actor: 'alberto@prueba.test', urlContrato: 'https://empresa.grupoasegura.es/' }

test('vista previa: anexo = vigente + pedido, destinatario = dueño, borrador detectado', () => {
  const d = datos(); d.vigentes = ['contabilidad']
  const p = previsualizar(d, ['rrhh'], MEDIADOR, new Date())
  assert.ok(p.ok)
  if (!p.ok) return
  assert.deepEqual(p.herramientas, ['contabilidad', 'rrhh'])
  assert.deepEqual(p.nuevas, ['rrhh'])
  assert.equal(p.destinatario, 'dueno@prueba.test')
  assert.equal(p.borrador, true)
  assert.ok(p.marcasPendientes > 0)
})

test('CEPO variable ausente → NO emite ni envía; dice qué falta', async () => {
  const d = datos(); d.cuenta.via = null; d.dueno!.titulo = null
  const { r, llamadas } = repo(d); const { c, enviados } = canal()
  const x = await activar(r, c, base, MEDIADOR)
  assert.equal(x.ok, false)
  if (x.ok) return
  assert.equal(x.status, 422)
  assert.ok(x.faltan!.some((f) => f.includes('domicilio')) && x.faltan!.some((f) => f.includes('título')))
  assert.deepEqual(llamadas, []); assert.deepEqual(enviados, [])
})

test('CEPO sin ref_externa en una herramienta → no emite', async () => {
  const d = datos(); d.con_ref = ['contabilidad']
  const { r, llamadas } = repo(d)
  const x = await activar(r, canal().c, base, MEDIADOR)
  assert.equal(x.ok, false); assert.deepEqual(llamadas, [])
})

test('CEPO confirmo_destinatario distinto → 409 y NO emite (el OK era para otro correo)', async () => {
  const { r, llamadas } = repo(datos()); const { c, enviados } = canal()
  const x = await activar(r, c, { ...base, confirmoDestinatario: 'otro@prueba.test' }, MEDIADOR)
  assert.deepEqual([x.ok, !x.ok && x.status], [false, 409])
  assert.deepEqual(llamadas, []); assert.deepEqual(enviados, [])
})

test('plantilla borrador sin confirmo_borrador → 422, nada sale', async () => {
  const { r, llamadas } = repo(datos())
  const x = await activar(r, canal().c, { ...base, confirmoBorrador: false }, MEDIADOR)
  assert.deepEqual([x.ok, !x.ok && x.error], [false, 'falta_confirmar_borrador']); assert.deepEqual(llamadas, [])
})

test('sin proveedor de correo → 503 ANTES de emitir', async () => {
  const { r, llamadas } = repo(datos())
  const x = await activar(r, null, base, MEDIADOR)
  assert.deepEqual([x.ok, !x.ok && x.status], [false, 503]); assert.deepEqual(llamadas, [])
})

test('clic bueno: emite, envía UNA vez al dueño y resuelve el envío', async () => {
  const { r, llamadas } = repo(datos()); const { c, enviados } = canal()
  const x = await activar(r, c, base, MEDIADOR)
  assert.ok(x.ok)
  assert.deepEqual(llamadas, ['emitir:contabilidad,rrhh:dueno@prueba.test', 'resolver:aceptado'])
  assert.equal(enviados.length, 1)
  assert.ok(enviados[0].startsWith('dueno@prueba.test|'))
  assert.ok(!enviados[0].includes('28823484E'), 'el correo no lleva datos del contrato')
})

test('proveedor falla tras emitir → contrato emitido, envío «fallido», sin reintento automático', async () => {
  const { r, llamadas } = repo(datos()); const { c, enviados } = canal(false)
  const x = await activar(r, c, base, MEDIADOR)
  assert.ok(x.ok && x.correo === 'fallido')
  assert.equal(enviados.length, 1)
  assert.deepEqual(llamadas.at(-1), 'resolver:fallido')
})

test('recordatorio: exige confirmar destinatario y es UN envío por clic', async () => {
  const { r, llamadas } = repo(datos()); const { c, enviados } = canal()
  const sin = await reenviar(r, c, { versionId: 'v1', tipo: 'recordatorio', confirmoDestinatario: '', actor: 'a@b.es', urlContrato: 'https://x' })
  assert.equal(sin.ok, false); assert.deepEqual(enviados, [])
  const con = await reenviar(r, c, { versionId: 'v1', tipo: 'recordatorio', confirmoDestinatario: 'dueno@prueba.test', actor: 'a@b.es', urlContrato: 'https://x' })
  assert.ok(con.ok); assert.equal(enviados.length, 1); assert.deepEqual(llamadas, ['reservar:recordatorio', 'resolver:aceptado'])
})
