// Acuerdos con compañías y claves de mediador, leídos del schema `seguros`
// (tablas de prisma/sql/2026-10-06_seguros_acuerdos_companias.sql). Lo sirve el
// puerto en `GET /api/operador/companias/acuerdos`; plataforma lo pinta en el
// bloque de compañías. Spec:
// docs/superpowers/specs/2026-10-06-correduria-acuerdos-companias-design.md
//
// Fase 1: SOLO LECTURA. La productividad (producción frente a objetivo, comisión
// esperada frente a la aplicada por CIMA) es la fase 3 y se calculará aquí, con
// las reglas puras de `@central/module-seguros/acuerdos.ts`.
//
// 🚨 Tres estados, nunca dos: `sin_configurar` NO es «no hay acuerdos», y un
// fallo de BD es `error` con su CAUSA (`lib/error-cartera.ts`). Un catch que
// devolviera listas vacías diría «no tienes ningún acuerdo» cuando la tabla no
// se ha podido leer — o no existe todavía porque la migración no se ha aplicado.
//
// 🚨 NULL ≠ 0: un porcentaje NULL sale como `null` («no consta»). Nada de
// `Number(x ?? 0)`: un Decimal nulo convertido a 0 es «este ramo no comisiona»,
// una afirmación falsa contra la que Alberto decidiría a qué compañía llevar un
// cliente.
//
// Aislamiento: TODAS las consultas filtran por `correduriaId` (las hijas, a
// través de su cabecera). Con BYPASSRLS, olvidarlo no da error: da los acuerdos
// de otra correduría.

import {
  conflictosCodigos,
  deLista,
  leerTramos,
  AMBITOS_OBJETIVO,
  BASES_OBJETIVO,
  CANALES_CLAVE,
  CRITERIOS_COBRO,
  ESTADOS_CLAVE,
  FUENTES_ACUERDO,
  TIPOS_OBJETIVO,
  type ConflictoCodigo,
  type Tramo,
} from '@central/module-seguros'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import { registrarErrorCartera, type CausaErrorCartera } from './error-cartera'

/** Un valor de lista cerrada que no se reconoce se DEVUELVE tal cual, marcado, en vez de esconderse. */
export type Cerrado<T extends string> = { valor: T } | { valor: null; crudo: string }

function cerrado<T extends string>(lista: readonly T[], v: string): Cerrado<T> {
  const ok = deLista(lista, v)
  return ok === null ? { valor: null, crudo: v } : { valor: ok }
}

export type ClaveDto = {
  id: string
  companiaCodigoDgs: string
  estado: Cerrado<(typeof ESTADOS_CLAVE)[number]>
  canal: Cerrado<(typeof CANALES_CLAVE)[number]>
  asociacion: string | null
  codigosCima: string[]
  etiqueta: string | null
  /** 'YYYY-MM-DD' o `null` = no consta. */
  fechaAlta: string | null
  fechaBaja: string | null
  notas: string | null
}

export type LineaDto = {
  id: string
  ramo: string | null
  ramoTexto: string
  producto: string | null
  modalidad: string | null
  /** `null` = el acuerdo no lo dice. NUNCA se rellena con 0. */
  pctNp: number | null
  pctCartera: number | null
  notas: string | null
}

export type ObjetivoDto = {
  id: string
  tipo: Cerrado<(typeof TIPOS_OBJETIVO)[number]>
  ambito: Cerrado<(typeof AMBITOS_OBJETIVO)[number]>
  base: Cerrado<(typeof BASES_OBJETIVO)[number]>
  criterioCobro: Cerrado<(typeof CRITERIOS_COBRO)[number]> | null
  /** `[]` = todos los ramos. */
  ramos: string[]
  periodoDesde: string
  periodoHasta: string
  /** `ilegible` = el jsonb no tiene la forma esperada: el objetivo no es calculable. */
  tramos: { estado: 'ok'; tramos: Tramo[] } | { estado: 'ilegible'; motivo: string }
  siniestralidadMaxPct: number | null
  condiciones: string | null
}

export type AcuerdoDto = {
  id: string
  companiaCodigoDgs: string
  fuente: Cerrado<(typeof FUENTES_ACUERDO)[number]>
  fuenteNombre: string | null
  /** `null` = sin clave asignada: la productividad de este acuerdo es «pendiente». */
  claveId: string | null
  vigenciaDesde: string
  vigenciaHasta: string | null
  requisitosApertura: string | null
  letraPequena: string | null
  documentoFuente: string
  /** ISO o `null` = extracto SIN COTEJAR con el documento original. */
  revisadoAt: string | null
  comisiones: LineaDto[]
  objetivos: ObjetivoDto[]
}

export type AcuerdosCartera =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; causa: CausaErrorCartera }
  | {
      estado: 'ok'
      claves: ClaveDto[]
      acuerdos: AcuerdoDto[]
      /** Códigos de CIMA que están en más de una clave de la misma compañía (calidad del dato). */
      conflictosCodigos: ConflictoCodigo[]
    }

const fecha = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null)

/** Decimal de Prisma (o lo que llegue) → número; `null` se queda `null`. */
function numeroONull(d: { toString(): string } | null): number | null {
  if (d === null) return null
  const n = Number(d.toString())
  return Number.isFinite(n) ? n : null
}

export async function acuerdosCartera(correduriaId: string): Promise<AcuerdosCartera> {
  if (!aseguraConfigurada()) return { estado: 'sin_configurar' }
  try {
    const db = prismaAsegura()
    const [claves, acuerdos] = await Promise.all([
      db.claveMediador.findMany({
        where: { correduriaId },
        orderBy: [{ companiaCodigoDgs: 'asc' }, { etiqueta: 'asc' }],
      }),
      db.acuerdoCompania.findMany({
        where: { correduriaId },
        orderBy: [{ companiaCodigoDgs: 'asc' }, { vigenciaDesde: 'desc' }, { fuente: 'asc' }],
        include: {
          comisiones: { orderBy: [{ ramoTexto: 'asc' }, { modalidad: 'asc' }] },
          objetivos: { orderBy: [{ tipo: 'asc' }, { periodoDesde: 'asc' }] },
        },
      }),
    ])

    const clavesDto: ClaveDto[] = claves.map((c) => ({
      id: c.id,
      companiaCodigoDgs: c.companiaCodigoDgs,
      estado: cerrado(ESTADOS_CLAVE, c.estado),
      canal: cerrado(CANALES_CLAVE, c.canal),
      asociacion: c.asociacion,
      codigosCima: c.codigosCima,
      etiqueta: c.etiqueta,
      fechaAlta: fecha(c.fechaAlta),
      fechaBaja: fecha(c.fechaBaja),
      notas: c.notas,
    }))

    const acuerdosDto: AcuerdoDto[] = acuerdos.map((a) => ({
      id: a.id,
      companiaCodigoDgs: a.companiaCodigoDgs,
      fuente: cerrado(FUENTES_ACUERDO, a.fuente),
      fuenteNombre: a.fuenteNombre,
      claveId: a.claveId,
      vigenciaDesde: fecha(a.vigenciaDesde) as string,
      vigenciaHasta: fecha(a.vigenciaHasta),
      requisitosApertura: a.requisitosApertura,
      letraPequena: a.letraPequena,
      documentoFuente: a.documentoFuente,
      revisadoAt: a.revisadoAt ? a.revisadoAt.toISOString() : null,
      comisiones: a.comisiones.map((l) => ({
        id: l.id,
        ramo: l.ramo,
        ramoTexto: l.ramoTexto,
        producto: l.producto,
        modalidad: l.modalidad,
        pctNp: numeroONull(l.pctNp),
        pctCartera: numeroONull(l.pctCartera),
        notas: l.notas,
      })),
      objetivos: a.objetivos.map((o) => ({
        id: o.id,
        tipo: cerrado(TIPOS_OBJETIVO, o.tipo),
        ambito: cerrado(AMBITOS_OBJETIVO, o.ambito),
        base: cerrado(BASES_OBJETIVO, o.base),
        criterioCobro: o.criterioCobro === null ? null : cerrado(CRITERIOS_COBRO, o.criterioCobro),
        ramos: o.ramos,
        periodoDesde: fecha(o.periodoDesde) as string,
        periodoHasta: fecha(o.periodoHasta) as string,
        tramos: leerTramos(o.tramos),
        siniestralidadMaxPct: numeroONull(o.siniestralidadMaxPct),
        condiciones: o.condiciones,
      })),
    }))

    return {
      estado: 'ok',
      claves: clavesDto,
      acuerdos: acuerdosDto,
      conflictosCodigos: conflictosCodigos(clavesDto),
    }
  } catch (e) {
    return { estado: 'error', causa: registrarErrorCartera('operador/companias/acuerdos', e) }
  }
}
