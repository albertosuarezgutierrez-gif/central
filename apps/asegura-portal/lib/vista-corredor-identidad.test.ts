import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { IDENTIDAD_CORREDOR_ID, ORIGEN_VINCULO_CORREDOR, SESION_CORREDOR_SEGUNDOS } from '@central/module-seguros-portal'
import {
  NOMBRE_IDENTIDAD_VISTA,
  crearIdentidadDeVista,
  limpiarIdentidadesDeVistaCaducadas,
  type DbLimpiezaVista,
  type TxIdentidadVista,
} from './vista-corredor-identidad.ts'

type Identidad = { id: string; nombre: string | null; creadaEn: Date }
type Vinculo = { identidadId: string; clienteId: string; origen: string; creadoEn: Date }
type Vista = { id: string; usadoEn: Date | null }

/** BD en memoria con la semántica que importa: borrar una identidad borra sus vínculos (ON DELETE CASCADE). */
function bdFalsa(ahora: () => Date) {
  const identidades: Identidad[] = []
  const vinculos: Vinculo[] = []
  const vistas: Vista[] = []
  const db: TxIdentidadVista & DbLimpiezaVista = {
    portalIdentidad: {
      async create({ data }) {
        if (identidades.some((i) => i.id === data.id)) throw new Error('P2002')
        identidades.push({ id: data.id, nombre: data.nombre, creadaEn: ahora() })
        return { id: data.id }
      },
      async findMany({ where, take }) {
        return identidades
          .filter((i) => i.nombre === where.nombre && i.creadaEn < where.creadaEn.lt && i.id !== where.id.not)
          .slice(0, take)
          .map((i) => ({ id: i.id }))
      },
      async deleteMany({ where }) {
        const fuera = identidades.filter((i) => where.id.in.includes(i.id) && i.nombre === where.nombre).map((i) => i.id)
        for (const id of fuera) {
          identidades.splice(identidades.findIndex((i) => i.id === id), 1)
          for (let k = vinculos.length - 1; k >= 0; k--) if (vinculos[k].identidadId === id) vinculos.splice(k, 1)
        }
        return { count: fuera.length }
      },
    },
    portalVinculo: {
      async create({ data }) {
        vinculos.push({ identidadId: data.identidadId, clienteId: data.clienteId, origen: data.origen, creadoEn: ahora() })
        return { id: `${data.identidadId}:${data.clienteId}` }
      },
      async deleteMany({ where }) {
        let n = 0
        for (let k = vinculos.length - 1; k >= 0; k--) {
          const v = vinculos[k]
          if (v.identidadId === where.identidadId && v.origen === where.origen && v.creadoEn < where.creadoEn.lt) {
            vinculos.splice(k, 1)
            n++
          }
        }
        return { count: n }
      },
    },
    portalVistaCorredor: {
      async findMany({ where }) {
        return vistas
          .filter((v) => where.id.in.includes(v.id) && v.usadoEn !== null && v.usadoEn < where.usadoEn.lt)
          .map((v) => ({ id: v.id }))
      },
    },
  }
  /** Lo que las lecturas del portal ven: los clientes vinculados a ESA identidad (`carteraDeIdentidad`). */
  const clientesDe = (identidadId: string) => vinculos.filter((v) => v.identidadId === identidadId).map((v) => v.clienteId)
  /** Simula `abrirVistaCorredor` tras el consumo atómico del enlace. */
  const abrir = async (vistaId: string, clienteId: string) => {
    vistas.push({ id: vistaId, usadoEn: ahora() })
    return crearIdentidadDeVista(db, { vistaId, correduriaId: 'cor', clienteId })
  }
  return { db, identidades, vinculos, vistas, clientesDe, abrir }
}

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'
const HORA = 60 * 60 * 1000

test('dos vistas simultáneas (A y B): cada sesión sigue viendo SU cliente y ninguna ve el otro', async () => {
  let t = new Date('2026-11-02T10:00:00Z')
  const bd = bdFalsa(() => t)
  const idA = await bd.abrir(UUID_A, 'cliente-A')
  t = new Date(t.getTime() + 60_000)
  const idB = await bd.abrir(UUID_B, 'cliente-B')
  assert.notEqual(idA, idB)
  assert.notEqual(idA, IDENTIDAD_CORREDOR_ID)
  assert.deepEqual(bd.clientesDe(idA), ['cliente-A'], 'abrir B no puede cortar ni cambiar la vista de A')
  assert.deepEqual(bd.clientesDe(idB), ['cliente-B'])
  // Una apertura nueva (con su barrido) a los 5 min no toca vistas vivas.
  t = new Date(t.getTime() + 5 * 60_000)
  assert.equal(await limpiarIdentidadesDeVistaCaducadas(bd.db, t), 0)
  assert.deepEqual(bd.clientesDe(idA), ['cliente-A'])
  assert.deepEqual(bd.clientesDe(idB), ['cliente-B'])
})

test('el vínculo de la vista es de origen corredor (asegura lo excluye de «ya entra»)', async () => {
  const bd = bdFalsa(() => new Date('2026-11-02T10:00:00Z'))
  await bd.abrir(UUID_A, 'cliente-A')
  assert.deepEqual(bd.vinculos.map((v) => v.origen), [ORIGEN_VINCULO_CORREDOR])
  assert.equal(bd.identidades[0].nombre, NOMBRE_IDENTIDAD_VISTA)
})

test('caducidad: pasadas las 4 h de la sesión, la identidad de la vista y su vínculo se borran', async () => {
  let t = new Date('2026-11-02T10:00:00Z')
  const bd = bdFalsa(() => t)
  const idA = await bd.abrir(UUID_A, 'cliente-A')
  t = new Date(t.getTime() + 3 * HORA)
  const idB = await bd.abrir(UUID_B, 'cliente-B')
  // Justo antes de caducar A: nada se borra.
  t = new Date(new Date('2026-11-02T10:00:00Z').getTime() + SESION_CORREDOR_SEGUNDOS * 1000 - 1000)
  assert.equal(await limpiarIdentidadesDeVistaCaducadas(bd.db, t), 0)
  // Pasado el corte: A fuera, B (abierta hace 1 h) intacta.
  t = new Date(new Date('2026-11-02T10:00:00Z').getTime() + SESION_CORREDOR_SEGUNDOS * 1000 + 1000)
  assert.equal(await limpiarIdentidadesDeVistaCaducadas(bd.db, t), 1)
  assert.deepEqual(bd.clientesDe(idA), [])
  assert.ok(!bd.identidades.some((i) => i.id === idA))
  assert.deepEqual(bd.clientesDe(idB), ['cliente-B'])
})

test('la limpieza nunca borra una identidad de cliente ni la compartida, aunque sean viejas', async () => {
  const t = new Date('2026-11-02T10:00:00Z')
  const bd = bdFalsa(() => new Date(t.getTime() - 48 * HORA))
  bd.identidades.push({ id: 'cliente-real', nombre: null, creadaEn: new Date(t.getTime() - 48 * HORA) })
  // Mismo nombre que la marca pero sin enlace de vista detrás: NO es una vista.
  bd.identidades.push({ id: 'impostora', nombre: NOMBRE_IDENTIDAD_VISTA, creadaEn: new Date(t.getTime() - 48 * HORA) })
  bd.identidades.push({ id: IDENTIDAD_CORREDOR_ID, nombre: NOMBRE_IDENTIDAD_VISTA, creadaEn: new Date(t.getTime() - 48 * HORA) })
  bd.vistas.push({ id: IDENTIDAD_CORREDOR_ID, usadoEn: new Date(t.getTime() - 48 * HORA) })
  bd.vinculos.push({ identidadId: 'cliente-real', clienteId: 'X', origen: 'email_hash', creadoEn: new Date(t.getTime() - 48 * HORA) })
  bd.vinculos.push({ identidadId: IDENTIDAD_CORREDOR_ID, clienteId: 'Y', origen: ORIGEN_VINCULO_CORREDOR, creadoEn: new Date(t.getTime() - 48 * HORA) })
  assert.equal(await limpiarIdentidadesDeVistaCaducadas(bd.db, t), 0)
  assert.deepEqual(bd.identidades.map((i) => i.id).sort(), [IDENTIDAD_CORREDOR_ID, 'cliente-real', 'impostora'].sort())
  assert.deepEqual(bd.clientesDe('cliente-real'), ['X'])
  // El vínculo residual de la identidad compartida antigua sí se suelta (ya no cuelga sesión nueva de ella).
  assert.deepEqual(bd.clientesDe(IDENTIDAD_CORREDOR_ID), [])
})

test('🪤 la apertura crea identidad por vista y ya no borra vínculos de otras', () => {
  const sinComentarios = (f: string) => f.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const v = sinComentarios(readFileSync(new URL('./vista-corredor.ts', import.meta.url), 'utf8'))
  const apertura = v.slice(v.indexOf('export async function abrirVistaCorredor'), v.indexOf('export async function cerrarVistaCorredorDeSesion'))
  assert.match(apertura, /crearIdentidadDeVista\(tx, \{ vistaId: fila\.id/)
  assert.doesNotMatch(apertura, /deleteMany/, 'abrir una vista no puede borrar vínculos de otra')
  assert.doesNotMatch(apertura, /IDENTIDAD_CORREDOR_ID/, 'la apertura no cuelga nada de la identidad compartida')
  const a = sinComentarios(readFileSync(new URL('./auth.ts', import.meta.url), 'utf8'))
  assert.match(a, /claims: \{ identidadId, corredor: \{ clienteId \} \}/, 'la cookie lleva la identidad de ESA vista')
})
