// IDEA 4 del tarificador (07/11/2026) — la parte con BD. Reglas puras en `tarificador-vehiculo-lead-reglas.ts`.
// Enganche: paso del barrido de la cola (`barrerTarificadorRpa`, cron cada 5 min). Apagado por defecto: sin
// `TARIFICADOR_RPA_ACTIVO=1` Y `TARIFICADOR_VEHICULO_ACTIVO=1` no hace nada. TARIFICAR ≠ EMITIR; no envía nada a nadie.
// Idempotente: la marca `info_riesgo.vehiculoConsulta` se reclama con UN update atómico (una sola consulta por oportunidad).

import { requireSecret } from '@central/core-identity'
import { prisma } from './tenant'
import { hayVehiculoMatricula } from './esquema-bd'
import { ESTADOS_ABIERTA } from './codeoscopic/oportunidad-presupuesto-reglas'
import { editarDatosRiesgo } from './oportunidad-riesgo'
import { consultarOEncolarVehiculo } from './tarificador-vehiculo'
import { rpaActivo } from './tarificador-reglas'
import { cacheVigente, claveCacheMatricula, resultadoDeFila, vehiculoActivo, type ResultadoVehiculo } from './tarificador-vehiculo-reglas'
import {
  CLAVE_CONSULTA_VEHICULO,
  MAX_ENCOLAR_POR_BARRIDO,
  consultaCaducada,
  decidirConsultaLead,
  leerMarcaConsulta,
  matriculaDeRiesgo,
  valorDesdeResultado,
} from './tarificador-vehiculo-lead-reglas'

export type ResumenVehiculoLeads = { omitido?: string; encoladas: number; aplicadas: number; sinResultado: number; caducadas: number; errores: number }

const ACTOR = 'bot:vehiculo'

type FilaOp = { id: string; tipo: string; estado: string; info_riesgo: Record<string, unknown> | null }

async function ponerMarca(correduriaId: string, id: string, estado: string, soloSiNoHay: boolean): Promise<boolean> {
  const marca = JSON.stringify({ [CLAVE_CONSULTA_VEHICULO]: { estado, at: new Date().toISOString() } })
  const n = soloSiNoHay
    ? await prisma.$executeRaw`
        update seguros.oportunidades set info_riesgo = coalesce(info_riesgo, '{}'::jsonb) || ${marca}::jsonb
        where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and not (coalesce(info_riesgo, '{}'::jsonb) ? ${CLAVE_CONSULTA_VEHICULO}::text)`
    : await prisma.$executeRaw`
        update seguros.oportunidades set info_riesgo = coalesce(info_riesgo, '{}'::jsonb) || ${marca}::jsonb
        where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`
  return n > 0
}

async function leerCache(correduriaId: string, matricula: string): Promise<ResultadoVehiculo | null> {
  const clave = claveCacheMatricula(matricula, requireSecret('TARIFICADOR_WORKER_SECRET'))
  const f = await prisma.$queryRaw<{ estado: string; marca: string | null; modelo: string | null; version: string | null; fecha_matriculacion: Date | null; combustible: string | null; consultado_at: Date; ahora: Date }[]>`
    select estado, marca, modelo, version, fecha_matriculacion, combustible, consultado_at, now() as ahora
    from seguros.tarificador_vehiculo_matricula where correduria_id = ${correduriaId}::uuid and matricula_hash = ${clave}`
  return f[0] && cacheVigente(f[0].consultado_at, f[0].ahora) ? resultadoDeFila(f[0]) : null
}

/** Aplica el resultado de la caché a la oportunidad (sin confirmar) y sella la marca. Devuelve el estado final de la marca. */
async function aplicar(correduriaId: string, op: FilaOp, r: ResultadoVehiculo): Promise<'aplicada' | 'sin_resultado'> {
  const valor = valorDesdeResultado(op.info_riesgo, r)
  if (valor) {
    const e = await editarDatosRiesgo(correduriaId, { oportunidadId: op.id, clave: 'datosVehiculo', datos: valor, confirmar: false, actor: ACTOR })
    if (!e.ok) throw new Error(`no guardado (${e.status})`)
  }
  const estado = r.estado === 'ok' ? 'aplicada' : 'sin_resultado'
  await ponerMarca(correduriaId, op.id, estado, false)
  return estado
}

export async function engancharVehiculosDeLeads(correduriaId: string, env: Record<string, string | undefined> = process.env): Promise<ResumenVehiculoLeads> {
  const r: ResumenVehiculoLeads = { encoladas: 0, aplicadas: 0, sinResultado: 0, caducadas: 0, errores: 0 }
  if (!rpaActivo(env) || !vehiculoActivo(env)) return { ...r, omitido: 'vehiculo_apagado' }
  if (!(await hayVehiculoMatricula())) return { ...r, omitido: 'vehiculo_sin_esquema' }
  const abiertas = [...ESTADOS_ABIERTA]

  // 1) Consultas encoladas: si ya hay resultado en la caché, se aplica; si llevan demasiado, caducan.
  const pendientes = await prisma.$queryRaw<FilaOp[]>`
    select id::text as id, tipo::text as tipo, estado::text as estado, info_riesgo from seguros.oportunidades
    where correduria_id = ${correduriaId}::uuid and tipo::text = 'auto' and info_riesgo -> ${CLAVE_CONSULTA_VEHICULO}::text ->> 'estado' = 'encolada'
    order by created_at limit 50`
  for (const op of pendientes) {
    try {
      const marca = leerMarcaConsulta(op.info_riesgo)
      const matricula = matriculaDeRiesgo(op.info_riesgo)
      const res = matricula ? await leerCache(correduriaId, matricula) : null
      if (res) {
        const e = await aplicar(correduriaId, op, res)
        if (e === 'aplicada') r.aplicadas++
        else r.sinResultado++
      } else if (!marca || !matricula || consultaCaducada(marca, new Date())) {
        await ponerMarca(correduriaId, op.id, 'caducada', false)
        r.caducadas++
      }
    } catch (e) {
      r.errores++
      console.error('[tarificador] vehiculo-leads, aplicar', e instanceof Error ? e.message.slice(0, 120) : 'error')
    }
  }

  // 2) Leads de coche nuevos con matrícula y sin ficha: reclamar la marca (atómico) y encolar (o aplicar la caché).
  const candidatas = await prisma.$queryRaw<FilaOp[]>`
    select id::text as id, tipo::text as tipo, estado::text as estado, info_riesgo from seguros.oportunidades
    where correduria_id = ${correduriaId}::uuid and tipo::text = 'auto' and estado::text = any(${abiertas}::text[])
      and not (coalesce(info_riesgo, '{}'::jsonb) ? ${CLAVE_CONSULTA_VEHICULO}::text)
      and (info_riesgo ->> 'matricula' is not null or info_riesgo -> 'datosVehiculo' ->> 'matricula' is not null)
    order by created_at desc limit 100`
  let encoladas = 0
  for (const op of candidatas) {
    if (encoladas >= MAX_ENCOLAR_POR_BARRIDO) break
    const d = decidirConsultaLead({ tipo: op.tipo, abierta: (abiertas as string[]).includes(op.estado), info: op.info_riesgo })
    if (d.accion !== 'consultar') continue
    try {
      if (!(await ponerMarca(correduriaId, op.id, 'encolada', true))) continue // otro barrido la reclamó
      const c = await consultarOEncolarVehiculo({ correduriaId, matricula: d.matricula, solicitadoPor: ACTOR })
      encoladas++
      if (c.estado === 'cache') {
        const e = await aplicar(correduriaId, op, c.resultado)
        if (e === 'aplicada') r.aplicadas++
        else r.sinResultado++
      } else if (c.estado === 'rechazado') {
        await ponerMarca(correduriaId, op.id, 'caducada', false)
        r.caducadas++
      } else r.encoladas++
    } catch (e) {
      r.errores++
      console.error('[tarificador] vehiculo-leads, encolar', e instanceof Error ? e.message.slice(0, 120) : 'error')
    }
  }
  return r
}
