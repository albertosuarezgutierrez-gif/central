import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { viaEnCallejero, viasValidadas, zonaCpServidor, type ListarVias } from './solicitud-datos-direccion.ts'

const CAMPOS = [{ clave: 'vivienda', etiqueta: 'Dirección', tipo: 'direccion' as const, obligatorio: true }]
const ENTRADA = { viviendaProvincia: 'Sevilla', viviendaMunicipio: 'Sevilla', viviendaViaTipo: 'CL', viviendaViaNombre: 'Socorro' }

test('la zona del CP sale de la tabla oficial (la misma que la ruta del portal)', () => {
  const z = zonaCpServidor('41003')
  assert.ok(z.provincias?.includes('Sevilla'))
  assert.ok(z.municipios?.includes('Sevilla'))
  assert.ok(zonaCpServidor('07001').provincias?.includes('Baleares'), 'con el nombre clásico también')
})

test('la calle solo es oficial si el callejero la tiene; si no contesta o no está, «por validar»', async () => {
  const conSocorro: ListarVias = async () => [{ tipo: 'CL', nombre: 'SOCORRO' }, { tipo: 'PZ', nombre: 'SOCORRO' }]
  assert.deepEqual(await viaEnCallejero({ provincia: 'Sevilla', municipio: 'Sevilla', tipo: 'cl', nombre: 'Socorro' }, conSocorro), { tipo: 'CL', nombre: 'SOCORRO' })
  assert.equal(await viaEnCallejero({ provincia: 'Sevilla', municipio: 'Sevilla', tipo: 'AV', nombre: 'Socorro' }, conSocorro), null)
  assert.equal(await viaEnCallejero({ provincia: 'Sevilla', municipio: 'Sevilla', tipo: 'CL', nombre: 'Socorro' }, async () => { throw new Error('caído') }), null)
  assert.equal(await viaEnCallejero({ provincia: 'Sevilla', municipio: 'Sevilla', tipo: 'CL', nombre: 'Socorro' }, async () => null), null)
  const m = await viasValidadas(CAMPOS, ENTRADA, conSocorro)
  assert.deepEqual(m.get('vivienda'), { tipo: 'CL', nombre: 'SOCORRO' })
  // Callejero lento: pasado el tope, sin validar.
  const lento: ListarVias = () => new Promise((r) => setTimeout(() => r([{ tipo: 'CL', nombre: 'SOCORRO' }]), 200))
  assert.equal((await viasValidadas(CAMPOS, ENTRADA, lento, 20)).get('vivienda') ?? null, null)
})

test('responderSolicitud valida la dirección en el SERVIDOR y el aviso de hogar no puede reventar fuera del try', () => {
  const src = readFileSync(new URL('./solicitud-datos.ts', import.meta.url), 'utf8')
  const f = src.slice(src.indexOf('export async function responderSolicitud'))
  assert.match(f, /validarRespuestas\(campos, entrada, new Date\(\), \{ zonaCp: zonaCpServidor, viaValidada: \(clave\) => vias\.get\(clave\) \?\? null \}\)/)
  const a = f.slice(f.indexOf('after(async () => {'))
  assert.ok(a.indexOf('try {') > 0 && a.indexOf('try {') < a.indexOf('$queryRaw'), 'la consulta va dentro del try del after()')
  const ruta = readFileSync(new URL('../app/api/portal/solicitud-datos/route.ts', import.meta.url), 'utf8')
  assert.match(ruta, /export const maxDuration = 60/)
})
