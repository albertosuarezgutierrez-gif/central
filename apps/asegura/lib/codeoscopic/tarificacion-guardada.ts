// Lee la ÚLTIMA cotización REAL ya guardada de una póliza, para poder
// "retomarla" en pantalla sin volver a pagar el `POST /insurances` que ya se
// pagó. Impuro (BD) — hermano de `cotizaciones.ts`, que es quien la escribió.
//
// 🚨 Recuperar el precio NO sustituye al ReRate: `expires_at` llega a NULL en
// la respuesta real del vendor (no se sabe cuánto vale una cotización viva),
// así que lo único que esto evita es repetir el gasto de 0,50€ — confirmar el
// precio con la compañía sigue siendo `POST .../oferta`, que se pide igual
// sobre el `projectId` recuperado.

import { prisma } from '../tenant.ts'
import { extraerFormularioAuto, type FormularioAutoGuardado } from './formulario-guardado.ts'

export type PrecioGuardado = {
  compania: string | null
  producto: string | null
  modalidad: string | null
  categoria: string | null
  primaEur: number | null
  entradaEur: number | null
  franquiciaEur: number | null
  firmeza: string
  avisos: string[]
}

export type TarificacionGuardada = {
  cotizacionId: string
  projectId: string
  creadaEn: string
  precios: PrecioGuardado[]
  formulario: FormularioAutoGuardado
}

/**
 * La última tarificación REAL (no simulada) de auto guardada para esta
 * póliza en ESTA correduría. `null` = no hay ninguna — no es un error, es
 * que todavía no se ha pedido precio nunca para esta póliza.
 */
export async function ultimaTarificacionRealAuto(
  correduriaId: string,
  polizaId: string,
): Promise<TarificacionGuardada | null> {
  const cabeceras = await prisma.$queryRaw<
    { id: string; creado_at: Date; project_id_codeoscopic: string | null; peticion: unknown }[]
  >`
    select id::text as id, creado_at, project_id_codeoscopic, peticion
    from tarificaciones
    where correduria_id = ${correduriaId}::uuid
      and poliza_id = ${polizaId}::uuid
      and simulado = false
      and ramo = 'auto'
    order by creado_at desc
    limit 1
  `
  const t = cabeceras[0]
  if (!t || !t.project_id_codeoscopic) return null

  const filasPrecios = await prisma.$queryRaw<
    {
      compania: string | null
      producto: string | null
      modalidad: string | null
      categoria: string | null
      prima_eur: number | string | null
      entrada_eur: number | string | null
      franquicia_eur: number | string | null
      firmeza: string | null
      avisos: unknown
    }[]
  >`
    select compania, producto, modalidad, categoria, prima_eur, entrada_eur, franquicia_eur, firmeza, avisos
    from tarificacion_precios
    where tarificacion_id = ${t.id}::uuid
    order by prima_eur asc nulls last
  `

  return {
    cotizacionId: t.id,
    projectId: t.project_id_codeoscopic,
    creadaEn: t.creado_at.toISOString(),
    precios: filasPrecios.map((p) => ({
      compania: p.compania,
      producto: p.producto,
      modalidad: p.modalidad,
      categoria: p.categoria,
      // Prisma devuelve `numeric` como string: se convierte aquí, en el único
      // sitio, para que nadie más tenga que acordarse.
      primaEur: numero(p.prima_eur),
      entradaEur: numero(p.entrada_eur),
      franquiciaEur: numero(p.franquicia_eur),
      firmeza: p.firmeza ?? 'estimado',
      avisos: Array.isArray(p.avisos) ? p.avisos.filter((a): a is string => typeof a === 'string') : [],
    })),
    formulario: extraerFormularioAuto(t.peticion),
  }
}

function numero(v: number | string | null): number | null {
  if (v === null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}
