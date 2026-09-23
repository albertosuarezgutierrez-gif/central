// Enlaza sola la póliza nueva con la que sustituye (cambio de compañía, o renovación con número
// nuevo) cuando la prueba es determinista: la regla vive en `detectarSustituciones`
// (module-seguros/src/sustitucion-auto.ts). Corre DENTRO de `detectarYGuardar`, antes de la foto:
// así la baja posterior de la vieja ya nace explicada y no se anuncia como fuga ni abre retención.
//
// Solo toca NUESTROS campos (`sustituida_at`, `poliza_origen_id`): CIMA no los escribe nunca, así
// que la próxima ingesta no los pisa. No se comunica nada a nadie.

import { detectarSustituciones, POLIZA_ESTADOS_VIGENTES, sqlCarteraViva, type RiesgoComun } from '@central/module-seguros'
import { decryptField } from '@central/module-seguros-pii'
import { Prisma } from './generated/asegura-client'
import type { prismaAsegura } from './asegura-db'

type Tx = Pick<ReturnType<typeof prismaAsegura>, '$queryRaw' | '$executeRaw'>

export type ResultadoEnlaceSustituciones = { enlazadas: number; ambiguas: number; duplicidades: number }

/** Frase para el historial: la matrícula es dato del contrato; una dirección o un DNI no se escriben. */
function comoSeSabe(r: RiesgoComun): string {
  switch (r.tipo) {
    case 'matricula': return `mismo vehículo ${r.valor}`
    case 'catastro': return 'misma referencia catastral'
    case 'direccion': return 'misma dirección del riesgo'
    case 'asegurado': return 'mismo asegurado'
  }
}

/** Descifra la dirección del riesgo; `null` si no hay o si sigue cifrada (sin clave no hay prueba). */
function direccionEnClaro(v: string | null): string | null {
  if (!v) return null
  try {
    const d = decryptField(v)
    return typeof d === 'string' && !d.startsWith('v1:') ? d : null
  } catch {
    return null
  }
}

const VIGENTES = [...POLIZA_ESTADOS_VIGENTES] as string[]

export async function enlazarSustituciones(tx: Tx, correduriaId: string): Promise<ResultadoEnlaceSustituciones> {
  const viva = Prisma.raw(sqlCarteraViva('p'))
  const filas = await tx.$queryRaw<{
    id: string; cliente_id: string; ramo: string; numero_poliza: string | null; inicio: string | null
    vencimiento: string | null; matricula: string | null; vigente: boolean; sustituida: boolean; con_origen: boolean
    aseguradora: string | null; padre_id: string | null; refcat: string | null; direccion: string | null; cp: string | null
    nif_asegurado: string | null
  }[]>`
    select p.id::text as id, p.cliente_id::text as cliente_id, p.tipo::text as ramo, p.numero_poliza,
           to_char(p.fecha_inicio, 'YYYY-MM-DD') as inicio, to_char(p.fecha_vencimiento, 'YYYY-MM-DD') as vencimiento,
           nullif(trim(p.datos_especificos->>'matricula'), '') as matricula,
           p.estado::text = any(${VIGENTES}::text[]) as vigente,
           p.sustituida_at is not null as sustituida, p.poliza_origen_id is not null as con_origen, p.aseguradora,
           p.poliza_padre_id::text as padre_id,
           coalesce(p.datos_especificos->>'referencia_catastral', p.datos_especificos->>'referenciaCatastral', p.datos_especificos->>'refcat') as refcat,
           p.datos_especificos->>'direccion' as direccion, p.datos_especificos->>'cp' as cp,
           (select i.nif_lookup_hash from poliza_intervinientes i
             where i.poliza_id = p.id and i.rol::text = 'asegurado' and i.nif_lookup_hash is not null
             order by i.created_at limit 1) as nif_asegurado
    from polizas p
    where p.correduria_id = ${correduriaId}::uuid and ${viva} and p.merged_into_poliza_id is null`
  const { enlaces, ambiguas, duplicidades } = detectarSustituciones(filas.map((f) => ({
    id: f.id, clienteId: f.cliente_id, ramo: f.ramo, numeroPoliza: f.numero_poliza, fechaInicio: f.inicio,
    fechaVencimiento: f.vencimiento, matricula: f.matricula, vigente: f.vigente, sustituida: f.sustituida, conOrigen: f.con_origen,
    padreId: f.padre_id, refCatastral: f.refcat, direccion: direccionEnClaro(f.direccion), cp: f.cp, nifAsegurado: f.nif_asegurado,
  })))
  const porId = new Map(filas.map((f) => [f.id, f]))
  let enlazadas = 0
  for (const e of enlaces) {
    // Las dos guardas `is null` hacen idempotente la pasada: otra que corra a la vez, o una emisión
    // de Codeoscopic que enlazó entre medias, no se pisa.
    const n = await tx.$executeRaw`
      update polizas set poliza_origen_id = ${e.viejaId}::uuid, updated_at = now()
      where id = ${e.nuevaId}::uuid and correduria_id = ${correduriaId}::uuid and poliza_origen_id is null`
    if (n === 0) continue
    await tx.$executeRaw`
      update polizas set sustituida_at = now(), updated_at = now()
      where id = ${e.viejaId}::uuid and correduria_id = ${correduriaId}::uuid and sustituida_at is null`
    const v = porId.get(e.viejaId)!
    const nu = porId.get(e.nuevaId)!
    await tx.$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
      values (${correduriaId}::uuid, ${nu.cliente_id}::uuid, ${e.nuevaId}::uuid, cast('gestion' as tipo_historial_interno),
              ${`Sustitución enlazada sola: la póliza ${nu.aseguradora ?? ''} ${nu.numero_poliza ?? ''} (efecto ${nu.inicio}) sustituye a la ${v.aseguradora ?? ''} ${v.numero_poliza ?? ''} (vence ${v.vencimiento}), ${comoSeSabe(e.riesgo)}.`})`
    enlazadas++
  }
  return { enlazadas, ambiguas, duplicidades: duplicidades.length }
}
