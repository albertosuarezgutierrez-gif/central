// La ficha de UNA póliza: lo que la fila de la ficha del cliente no cabe.
// Coberturas, todos los recibos, siniestros, intervinientes, documentos y la
// COPIA GEMELA del volcado, que a veces sabe lo que CIMA no manda.
//
// ─── La copia gemela (medido 02/09/2026) ────────────────────────────────────
// 16 de las 109 pólizas vivas existen DOS veces: la copia de CIMA (`import_ref`
// NULL) trae el vencimiento y los recibos; la del volcado de junio
// (`asegura_app:`) trae la dirección del riesgo, los m² y el año — que CIMA no
// manda. En 10 cada copia tiene la mitad del dato. Aquí se leen las dos y se
// dice de dónde sale cada cosa; NO se fusiona nada (rol SELECT-only).
//
// Mismas reglas que `cartera-ficha.ts`: `correduriaId` siempre en el WHERE,
// las fusionadas fuera, y un fallo de descifrado es «cifrado», no «no tiene».

import {
  etiquetaFormaPago,
  importeEiac,
  objetoAsegurado,
  primaReferencia,
  recargoFraccionamiento,
  resumirRecibos,
  type IntervinienteFicha,
  type ObjetoAsegurado,
  type RecargoFraccionamiento,
  type ReciboResumen,
  type RecibosPoliza,
} from '@central/module-seguros'
import { decryptField } from '@central/module-seguros-pii'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import type { SiniestroFicha } from './cartera-ficha'

export type CoberturaFicha = {
  orden: number | null
  codigo: string | null
  descripcion: string | null
  /** Texto tal cual del EIAC («30000», «ILIMITADO», «VALOR VENAL»…): NO se numera. */
  capital: string | null
  descripcionCapital: string | null
  franquicia: string | null
  desde: string | null
  hasta: string | null
}

export type FichaPoliza = {
  id: string
  cliente: { id: string; nombre: string }
  tipo: string
  aseguradora: string
  codigoEntidadDgs: string | null
  numeroPoliza: string | null
  idPolizaEntidad: string | null
  ramoDgs: string | null
  estado: string
  situacion: string | null
  origen: string
  viva: boolean
  fechaEfectoInicial: string | null
  fechaInicio: string | null
  fechaVencimiento: string | null
  prima: number | null
  primaAnual: number | null
  primaBruta: number | null
  primaMensual: number | null
  objeto: ObjetoAsegurado
  /**
   * La copia del volcado con el mismo número de póliza, si existe. `null` =
   * no hay gemela (se miró). Trae el objeto que CIMA no manda (dirección del
   * riesgo, m², año) y de qué ficha cuelga.
   */
  gemela: { polizaId: string; clienteId: string; importRef: string; objeto: ObjetoAsegurado; fechaVencimiento: string | null } | null
  coberturas: CoberturaFicha[]
  recibos: RecibosPoliza
  /** Todos, del más reciente al más antiguo. */
  listaRecibos: ReciboResumen[]
  siniestros: SiniestroFicha[]
  intervinientes: IntervinienteFicha[] | null
  /** `null` = no se pudo contar. `0` = la tabla existe y no hay ninguno (hoy: 0 en TODA la base). */
  documentos: number | null
  pago: { fraccionamiento: string | null; formaCobro: string | null; recargo: RecargoFraccionamiento }
  retarificable: boolean
}

function descifrar(v: string | null | undefined): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null
  if (!v.startsWith('v1:')) return v
  try {
    return decryptField(v)
  } catch {
    return null
  }
}
function ilegible(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.startsWith('v1:') && descifrar(v) === null
}
function esObjetoPlano(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}
function fechaIso(d: Date | null | undefined): string | null {
  return d instanceof Date ? d.toISOString().slice(0, 10) : null
}
function num(d: unknown): number | null {
  if (d === null || d === undefined) return null
  const n = Number(d)
  return Number.isFinite(n) ? n : null
}

/** La dirección del riesgo va cifrada en `datos_especificos`; se descifra si se puede. */
export function datosConDireccion(datos: unknown): Record<string, unknown> | null {
  if (!esObjetoPlano(datos)) return null
  const dir = datos.direccion
  if (typeof dir !== 'string' || !dir.startsWith('v1:')) return datos
  const claro = descifrar(dir)
  return claro === null ? datos : { ...datos, direccion: claro }
}

const ESTADOS_SINIESTRO_ABIERTO = new Set(['abierto', 'en_tramitacion'])

export async function fichaPoliza(correduriaId: string, polizaId: string): Promise<FichaPoliza | null> {
  if (!aseguraConfigurada()) return null
  const db = prismaAsegura()
  const p = await db.poliza.findFirst({
    where: { id: polizaId, correduriaId, mergedIntoPolizaId: null },
    select: {
      id: true, tipo: true, aseguradora: true, codigoEntidadDgs: true, numeroPoliza: true, idPolizaEntidad: true,
      ramoDgs: true, estado: true, situacion: true, origen: true, importRef: true,
      fechaEfectoInicial: true, fechaInicio: true, fechaVencimiento: true,
      primaAnual: true, primaBruta: true, primaMensual: true, fraccionamiento: true, datosEspecificos: true,
      cliente: { select: { id: true, nombre: true, apellidos: true } },
      coberturasRel: {
        select: { numeroOrden: true, codigo: true, descripcion: true, capitalAsegurado: true, descripcionCapital: true, franquicia: true, fechaInicio: true, fechaFin: true },
        orderBy: { numeroOrden: 'asc' },
      },
      recibos: {
        select: { id: true, situacion: true, primaTotal: true, fechaEmision: true, fechaVencimiento: true, formaPago: true },
        orderBy: { fechaEmision: 'desc' },
      },
      siniestros: {
        select: { id: true, polizaId: true, estado: true, tipo: true, referencia: true, fechaHora: true, reservaImporte: true, indemnizacionImporte: true, tramitadorNombre: true },
        orderBy: { fechaHora: 'desc' },
      },
    },
  })
  if (!p) return null

  const [intervinientes, gemela, documentos] = await Promise.all([
    db.polizaInterviniente
      .findMany({
        where: { correduriaId, polizaId: p.id },
        select: {
          polizaId: true, rol: true, clienteId: true, origen: true, nombre: true, apellidos: true, telefono: true, email: true,
          cliente: { select: { nombre: true, apellidos: true, telefono: true, email: true } },
        },
      })
      .then((filas): IntervinienteFicha[] =>
        filas.map((f) => {
          const propio = [descifrar(f.nombre), descifrar(f.apellidos)].filter(Boolean).join(' ').trim() || null
          const deFicha = f.cliente ? `${f.cliente.nombre} ${f.cliente.apellidos}`.trim() || null : null
          const telefono = descifrar(f.telefono) ?? descifrar(f.cliente?.telefono)
          const email = descifrar(f.email) ?? descifrar(f.cliente?.email)
          return {
            polizaId: f.polizaId, rol: String(f.rol), nombre: propio ?? deFicha,
            nombreIlegible: propio === null && deFicha === null && (ilegible(f.nombre) || ilegible(f.apellidos)),
            telefono, email,
            telefonoIlegible: telefono === null && (ilegible(f.telefono) || ilegible(f.cliente?.telefono)),
            emailIlegible: email === null && (ilegible(f.email) || ilegible(f.cliente?.email)),
            fichaId: f.clienteId ?? null, esTomador: f.clienteId === p.cliente.id, origen: String(f.origen),
          }
        }),
      )
      .catch((): IntervinienteFicha[] | null => null),
    // La gemela: mismo número, la OTRA cara. Solo tiene sentido si esta es de
    // CIMA (la del volcado ya es la que tiene la dirección).
    p.numeroPoliza === null
      ? Promise.resolve(null)
      : db.poliza
          .findFirst({
            where: {
              correduriaId, mergedIntoPolizaId: null, numeroPoliza: p.numeroPoliza, id: { not: p.id },
              importRef: p.importRef === null ? { not: null } : null,
            },
            select: { id: true, clienteId: true, importRef: true, datosEspecificos: true, tipo: true, fechaVencimiento: true },
          })
          .catch(() => null),
    db.$queryRaw<{ n: bigint }[]>`select count(*)::bigint as n from poliza_documentos where poliza_id = ${p.id}::uuid`
      .then((r) => Number(r[0]?.n ?? 0))
      .catch((): number | null => null),
  ])

  const datos = datosConDireccion(p.datosEspecificos)
  const matricula = datos ? texto(datos.matricula) : null
  const coberturasTexto = p.coberturasRel.map((c) => c.descripcion).filter((d): d is string => !!d)
  const recibosCrudos = p.recibos.map((r) => ({
    id: r.id, situacion: r.situacion === null ? null : String(r.situacion), primaTotal: r.primaTotal,
    fechaEmision: fechaIso(r.fechaEmision), fechaVencimiento: fechaIso(r.fechaVencimiento), formaPago: r.formaPago,
  }))
  const fraccionamiento = p.fraccionamiento === null ? null : String(p.fraccionamiento)

  return {
    id: p.id,
    cliente: { id: p.cliente.id, nombre: `${p.cliente.nombre} ${p.cliente.apellidos}`.trim() },
    tipo: String(p.tipo),
    aseguradora: p.aseguradora,
    codigoEntidadDgs: p.codigoEntidadDgs ?? null,
    numeroPoliza: p.numeroPoliza ?? null,
    idPolizaEntidad: p.idPolizaEntidad ?? null,
    ramoDgs: p.ramoDgs ?? null,
    estado: String(p.estado),
    situacion: p.situacion ?? null,
    origen: String(p.origen),
    viva: p.importRef === null,
    fechaEfectoInicial: fechaIso(p.fechaEfectoInicial),
    fechaInicio: fechaIso(p.fechaInicio),
    fechaVencimiento: fechaIso(p.fechaVencimiento),
    prima: primaReferencia({ primaAnual: num(p.primaAnual), primaBruta: num(p.primaBruta) }),
    primaAnual: num(p.primaAnual),
    primaBruta: num(p.primaBruta),
    primaMensual: num(p.primaMensual),
    objeto: objetoAsegurado({ tipo: String(p.tipo), datos, coberturas: coberturasTexto.length ? coberturasTexto : null }),
    gemela:
      gemela === null
        ? null
        : {
            polizaId: gemela.id,
            clienteId: gemela.clienteId,
            importRef: gemela.importRef ?? 'cima',
            objeto: objetoAsegurado({ tipo: String(gemela.tipo), datos: datosConDireccion(gemela.datosEspecificos), coberturas: null }),
            fechaVencimiento: fechaIso(gemela.fechaVencimiento),
          },
    coberturas: p.coberturasRel.map((c) => ({
      orden: c.numeroOrden ?? null, codigo: c.codigo ?? null, descripcion: c.descripcion ?? null,
      capital: c.capitalAsegurado ?? null, descripcionCapital: c.descripcionCapital ?? null, franquicia: c.franquicia ?? null,
      desde: fechaIso(c.fechaInicio), hasta: fechaIso(c.fechaFin),
    })),
    recibos: resumirRecibos(recibosCrudos),
    listaRecibos: recibosCrudos.map((r) => ({
      id: r.id, situacion: (r.situacion ?? '').trim() || 'sin_informar', importe: importeEiac(r.primaTotal),
      fechaEmision: r.fechaEmision, fechaVencimiento: r.fechaVencimiento, formaPago: etiquetaFormaPago(r.formaPago),
    })),
    siniestros: p.siniestros.map((s) => ({
      id: s.id, polizaId: s.polizaId, estado: String(s.estado), tipo: s.tipo ?? null, referencia: s.referencia ?? null,
      fecha: fechaIso(s.fechaHora), reserva: num(s.reservaImporte), indemnizacion: num(s.indemnizacionImporte),
      tramitador: s.tramitadorNombre ?? null, abierto: ESTADOS_SINIESTRO_ABIERTO.has(String(s.estado)),
    })),
    intervinientes,
    documentos,
    pago: {
      fraccionamiento,
      formaCobro: etiquetaFormaPago(p.recibos[0]?.formaPago ?? null),
      recargo: recargoFraccionamiento({
        fraccionamiento, primaAnual: num(p.primaAnual), vencimiento: fechaIso(p.fechaVencimiento),
        recibos: recibosCrudos.map((r) => ({ importe: importeEiac(r.primaTotal), fechaEmision: r.fechaEmision, situacion: r.situacion })),
      }),
    },
    retarificable: String(p.tipo) === 'auto' && matricula !== null,
  }
}
