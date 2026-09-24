// Historial del riesgo de una póliza: las demás pólizas del MISMO bien (ver
// `historial-riesgo.ts` de module-seguros). Dos vías:
//   1. enlace explícito — la red de `poliza_origen_id` (sustitución) y `poliza_padre_id` (renovación),
//      en los dos sentidos;
//   2. misma matrícula del mismo cliente (motor), que cubre lo que todavía no se ha enlazado.
// Todo acotado a la correduría y sin pólizas fusionadas. `null` = no se ha podido consultar.
import { esCarteraViva, ordenarHistorialRiesgo, type EslabonHistorial, type EslabonRiesgo } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'

const TOPE = 40

export async function historialRiesgo(correduriaId: string, polizaId: string): Promise<EslabonHistorial[] | null> {
  try {
    const filas = await prismaAsegura().$queryRaw<{
      id: string; aseguradora: string | null; numero_poliza: string | null; inicio: string | null; vencimiento: string | null
      estado: string; sustituida: boolean; import_ref: string | null; eiac_xml_hash: string | null; via: 'enlace' | 'matricula'
    }[]>`
      with recursive
        obj as (
          select id, correduria_id, cliente_id, tipo::text as tipo,
                 upper(regexp_replace(coalesce(datos_especificos->>'matricula', ''), '[^A-Za-z0-9]', '', 'g')) as mat
          from polizas where id = ${polizaId}::uuid and correduria_id = ${correduriaId}::uuid),
        aristas as (
          select p.id as a, p.poliza_origen_id as b from polizas p where p.correduria_id = ${correduriaId}::uuid and p.poliza_origen_id is not null
          union all
          select p.id, p.poliza_padre_id from polizas p where p.correduria_id = ${correduriaId}::uuid and p.poliza_padre_id is not null),
        und as (select a, b from aristas union all select b, a from aristas),
        red(id) as (select id from obj union select und.b from red join und on und.a = red.id)
      (select p.id::text as id, p.aseguradora, p.numero_poliza, to_char(p.fecha_inicio, 'YYYY-MM-DD') as inicio,
              to_char(p.fecha_vencimiento, 'YYYY-MM-DD') as vencimiento, p.estado::text as estado, p.sustituida_at is not null as sustituida,
              p.import_ref, p.eiac_xml_hash, 'enlace' as via
       from polizas p join red on red.id = p.id
       where p.correduria_id = ${correduriaId}::uuid and p.merged_into_poliza_id is null
       limit ${TOPE})
      union all
      (select p.id::text, p.aseguradora, p.numero_poliza, to_char(p.fecha_inicio, 'YYYY-MM-DD'),
              to_char(p.fecha_vencimiento, 'YYYY-MM-DD'), p.estado::text, p.sustituida_at is not null,
              p.import_ref, p.eiac_xml_hash, 'matricula'
       from polizas p, obj
       where p.correduria_id = ${correduriaId}::uuid and p.cliente_id = obj.cliente_id and p.merged_into_poliza_id is null
         and obj.tipo in ('auto', 'moto') and length(obj.mat) >= 5
         and upper(regexp_replace(coalesce(p.datos_especificos->>'matricula', ''), '[^A-Za-z0-9]', '', 'g')) = obj.mat
       limit ${TOPE})`
    const eslabones: EslabonRiesgo[] = filas.map((f) => ({
      id: f.id, aseguradora: f.aseguradora, numeroPoliza: f.numero_poliza, fechaInicio: f.inicio, fechaVencimiento: f.vencimiento,
      estado: f.estado, sustituida: f.sustituida, viva: esCarteraViva({ importRef: f.import_ref, eiacXmlHash: f.eiac_xml_hash }), via: f.via,
    }))
    return ordenarHistorialRiesgo(eslabones, polizaId)
  } catch (e) {
    console.error('[asegura/historial-riesgo] no se pudo leer:', e instanceof Error ? e.message : e)
    return null
  }
}
