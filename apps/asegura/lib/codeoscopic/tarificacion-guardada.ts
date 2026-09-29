// Lee la ÚLTIMA cotización REAL ya guardada de una póliza, para poder
// "retomarla" en pantalla sin volver a pagar el `POST /insurances` que ya se
// pagó. Impuro (BD) — hermano de `cotizaciones.ts`, que es quien la escribió.
//
// 🚨 Recuperar el precio NO sustituye al ReRate: `expires_at` llega a NULL en
// la respuesta real del vendor (no se sabe cuánto vale una cotización viva),
// así que lo único que esto evita es repetir el gasto de 0,50€ — confirmar el
// precio con la compañía sigue siendo `POST .../oferta`, que se pide igual
// sobre el `projectId` recuperado.

import { descuentosDeOpciones, type DescuentoComercial, type GarantiasClasificadas } from '@central/module-seguros'
import { listaOpciones } from './coberturas-tarificacion.ts'
import { prisma } from '../tenant.ts'
import { extraerFormularioAuto, extraerHistorialGuardado, extraerVehiculoGuardado, type FormularioAutoGuardado, type HistorialGuardado, type VehiculoGuardado } from './formulario-guardado.ts'
import { fechaEfectoCaducada } from './fecha-efecto.ts'

export type PrecioGuardado = {
  /** Id de la fila en `tarificacion_precios`: la clave para ocultar/filtrar esa opción. */
  id: string
  compania: string | null
  producto: string | null
  modalidad: string | null
  categoria: string | null
  primaEur: number | null
  entradaEur: number | null
  franquiciaEur: number | null
  firmeza: string
  avisos: string[]
  /** Garantías clasificadas (`{version, porClave}`). `null` = aún no se han leído sus
   *  coberturas (o el ramo no tiene catálogo) — «no se sabe», nunca «no incluye nada». */
  garantias: GarantiasClasificadas | null
  /** Descuentos comerciales con los que la compañía tarificó este precio (opciones del producto).
   *  `null` = sus opciones aún no se han leído (no «sin descuento»); `[]` = no manda ninguno. */
  descuentos: DescuentoComercial[] | null
}

export type TarificacionGuardada = {
  cotizacionId: string
  projectId: string
  creadaEn: string
  /** `effectiveDate` con la que se cotizó (`peticion`); null si no consta. */
  fechaEfecto: string | null
  /** Fecha de efecto ya PASADA (13/09/2026): el proyecto está muerto — la
   *  compañía no confirma ni emite con efecto anterior a hoy y la fecha no se
   *  puede cambiar. Recuperar su precio sería ofrecer un botón sin salida. */
  caducada: boolean
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
  const base = await cargarPrecios(t)
  return { ...base, formulario: extraerFormularioAuto(t.peticion) }
}

/** Ramos de cliente NUEVO cuya tarificación se puede retomar en pantalla. */
export const RAMOS_RETOMABLES = ['auto', 'moto', 'hogar', 'decesos', 'salud', 'vida'] as const
export type RamoRetomable = (typeof RAMOS_RETOMABLES)[number]

/**
 * La última tarificación REAL de un cliente SIN póliza (oportunidad nueva) para ese ramo, para
 * retomarla sin volver a pagar (28/09/2026: la parrilla solo vivía en memoria de la pantalla, y al
 * cerrarla no había forma de preparar el presupuesto ni de emitir). `null` = no hay ninguna.
 */
export async function ultimaTarificacionNueva(
  correduriaId: string,
  clienteId: string,
  ramo: RamoRetomable,
  /** Variante de un riesgo (29/09/2026): la de esa oportunidad, o esa tarificación concreta. */
  filtro: { oportunidadId?: string | null; tarificacionId?: string | null } = {},
): Promise<(Omit<TarificacionGuardada, 'formulario'> & { vehiculo: VehiculoGuardado | null; historialPrevio: HistorialGuardado | null }) | null> {
  const oportunidadId = filtro.oportunidadId ?? null
  const tarificacionId = filtro.tarificacionId ?? null
  const cabeceras = await prisma.$queryRaw<
    { id: string; creado_at: Date; project_id_codeoscopic: string | null; peticion: unknown }[]
  >`
    select id::text as id, creado_at, project_id_codeoscopic, peticion
    from tarificaciones
    where correduria_id = ${correduriaId}::uuid
      and cliente_id = ${clienteId}::uuid
      and poliza_id is null
      and simulado = false
      and ramo = ${ramo}
      and (${oportunidadId}::uuid is null or oportunidad_id = ${oportunidadId}::uuid)
      and (${tarificacionId}::uuid is null or id = ${tarificacionId}::uuid)
    order by creado_at desc
    limit 1
  `
  const t = cabeceras[0]
  if (!t || !t.project_id_codeoscopic) return null
  // El vehículo con el que se pidió (coche y moto): para volver a pedir precio sin dictarlo otra vez.
  const vehiculo = ramo === 'auto' || ramo === 'moto' ? extraerVehiculoGuardado(t.peticion) : null
  // El último seguro anterior declarado para este cliente y ramo (de esta u otra variante del MISMO
  // vehículo): la variante nueva lo hereda en vez de salir «de calle» sin bonificación.
  const historialPrevio = ramo === 'auto' || ramo === 'moto' ? await ultimoHistorial(correduriaId, clienteId, ramo, oportunidadId, vehiculo?.matricula ?? null) : null
  return { ...(await cargarPrecios(t)), vehiculo, historialPrevio }
}

async function ultimoHistorial(correduriaId: string, clienteId: string, ramo: 'auto' | 'moto', oportunidadId: string | null, matricula: string | null): Promise<HistorialGuardado | null> {
  const filas = await prisma.$queryRaw<{ peticion: unknown }[]>`
    select peticion from tarificaciones
    where correduria_id = ${correduriaId}::uuid
      and cliente_id = ${clienteId}::uuid
      and simulado = false
      and ramo = ${ramo}
      and (${oportunidadId}::uuid is null or oportunidad_id = ${oportunidadId}::uuid)
      and peticion->'risk'->'previousInsurance' is not null
    order by creado_at desc
    limit 5
  `.catch(() => [] as { peticion: unknown }[])
  const limpia = (m: string | null) => (m ?? '').replace(/[\s-]/g, '').toUpperCase()
  for (const f of filas) {
    const h = extraerHistorialGuardado(f.peticion)
    if (!h) continue
    if (!matricula || !h.matricula || limpia(h.matricula) !== limpia(matricula)) continue
    return h
  }
  return null
}

async function cargarPrecios(t: { id: string; creado_at: Date; project_id_codeoscopic: string | null; peticion: unknown }): Promise<Omit<TarificacionGuardada, 'formulario'>> {
  const filasPrecios = await prisma.$queryRaw<
    {
      id: string
      compania: string | null
      producto: string | null
      modalidad: string | null
      categoria: string | null
      prima_eur: number | string | null
      entrada_eur: number | string | null
      franquicia_eur: number | string | null
      firmeza: string | null
      avisos: unknown
      garantias: unknown
      opciones: unknown
    }[]
  >`
    select id::text as id, compania, producto, modalidad, categoria, prima_eur, entrada_eur, franquicia_eur,
           firmeza, avisos, garantias, opciones
    from tarificacion_precios
    where tarificacion_id = ${t.id}::uuid
    order by prima_eur asc nulls last
  `

  const peticion = t.peticion && typeof t.peticion === 'object' ? (t.peticion as Record<string, unknown>) : {}
  const fechaEfecto = typeof peticion.effectiveDate === 'string' && peticion.effectiveDate.trim() !== '' ? peticion.effectiveDate.trim() : null

  return {
    cotizacionId: t.id,
    projectId: t.project_id_codeoscopic as string,
    creadaEn: t.creado_at.toISOString(),
    fechaEfecto,
    caducada: fechaEfectoCaducada(fechaEfecto),
    precios: filasPrecios.map((p) => ({
      id: p.id,
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
      garantias: garantiasDe(p.garantias),
      descuentos: descuentosDeOpciones(listaOpciones(p.opciones)),
    })),
  }
}

function numero(v: number | string | null): number | null {
  if (v === null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** El jsonb de `garantias`, validado por forma. Cualquier otra cosa es `null` («no se sabe»). */
function garantiasDe(v: unknown): GarantiasClasificadas | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  if (typeof o.version !== 'number' || !o.porClave || typeof o.porClave !== 'object' || Array.isArray(o.porClave)) return null
  const porClave: GarantiasClasificadas['porClave'] = {}
  for (const [k, e] of Object.entries(o.porClave as Record<string, unknown>)) {
    if (e === 'si' || e === 'no' || e === 'no_consta') porClave[k] = e
  }
  return { version: o.version, porClave }
}
