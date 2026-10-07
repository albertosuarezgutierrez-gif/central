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
  primaConRecibos,
  vencimientoConRecibos,
  recargoFraccionamiento,
  evolucionPrima,
  type EvolucionPrima,
  resumirRecibos,
  type IntervinienteFicha,
  type ObjetoAsegurado,
  type RecargoFraccionamiento,
  type ReciboResumen,
  type RecibosPoliza, extraerDetalleCobertura, type DetalleCobertura,
  seguimientoSustitucion, type SeguimientoSustitucion } from '@central/module-seguros'
import { decryptField } from '@central/module-seguros-pii'
import { personasDePoliza, type PersonasPoliza } from '@central/module-seguros'
import { retarificabilidad, type DocumentoResumen, type Retarificabilidad } from '@central/module-seguros'
import { esCarteraViva, WHERE_CARTERA_VIVA, WHERE_VOLCADO_HISTORICO } from '@central/module-seguros'
import { capitalesHogar, eurDeCapital, type CapitalAsegurado } from '@central/module-seguros'
import { leerDatosCompaniaCima, type DatosCompaniaCima } from '@central/module-seguros'
import { contarDocumentosPoliza, listarDocumentos } from './cartera-documentos'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import { casosDeRamo, type EjecutorLectura } from './codeoscopic/casos'
import { estimar, mereceLaPena, type RiesgoAEstimar } from './codeoscopic/horquilla'
import { elegirRiesgo, hogarDeDatos } from './codeoscopic/desde-cartera-hogar'
import type { SiniestroFicha } from './cartera-ficha'
import { SELECT_SINIESTRO, conTercerosCima, mapSiniestro } from './cartera-siniestros'
import { historialRiesgo } from './cartera-historial-riesgo'
import type { EslabonHistorial } from '@central/module-seguros'
import { contratoCima, type ContratoCima } from './cartera-poliza-contrato'

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
  /** Código EIAC de modalidad de valoración (VP/VT/VE…), tal cual: no hay tabla oficial en el repo. */
  modalidad: string | null
  /** Límites, franquicias y prima de la propia cobertura, leídos de `datos_extra` (null si no trae nada). */
  detalle: DetalleCobertura | null
}

/**
 * La estimación PROPIA de prima, aplanada para la pantalla.
 *
 * Es `Estimacion` (de `codeoscopic/horquilla.ts`) más el veredicto de
 * `mereceLaPena` y de dónde salieron los casos. 🚨 NO es un precio y el tipo
 * está hecho para que no pueda confundirse: `orientativa` es un literal `true`
 * y `etiqueta` viene siempre. Enseñar esto como si fuera la oferta de una
 * compañía es la forma más cara de perder un cliente.
 */
export type EstimacionFicha = {
  horquilla: { minEur: number; medianaEur: number; maxEur: number } | null
  /** Por qué NO hay horquilla, cuando no la hay. Nunca se calla. */
  sinBase: string | null
  casos: number
  desde: string | null
  hasta: string | null
  antiguedadMedianaMeses: number | null
  base: 'parecidos' | 'toda-la-cartera' | null
  etiqueta: string
  orientativa: true
  /** ¿Merece la pena gastar los 0,50€ de una cotización real? `no-se` es una respuesta. */
  veredicto: 'merece' | 'no-merece' | 'no-se'
  porque: string
  /**
   * Con qué se ha construido. `cotizacionesDisponibles: false` significa que la
   * tabla de cotizaciones no se ha podido leer — que NO es lo mismo que
   * `cotizaciones: 0`, que es «se ha mirado y no hay ninguna».
   */
  fuente: { cartera: number; cotizaciones: number; cotizacionesDisponibles: boolean }
}

export type FichaPoliza = {
  id: string
  /** `telefono`: el principal de la ficha, descifrado; `null` = no tiene o no se pudo leer. */
  cliente: { id: string; nombre: string; telefono: string | null }
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
  /**
   * Las demás pólizas del MISMO bien (sustituciones, renovaciones, misma matrícula), de la más
   * antigua a la más reciente. `[]` = no hay otras; `null` = no se pudo consultar.
   */
  historialRiesgo: EslabonHistorial[] | null
  coberturas: CoberturaFicha[]
  recibos: RecibosPoliza
  /** Todos, del más reciente al más antiguo. */
  listaRecibos: ReciboFichaPoliza[]
  /**
   * Devoluciones que avisó la compañía por correo (`recibo_devolucion`), abiertas Y resueltas, de la
   * más reciente a la más antigua. Las que trae CIMA ya están en `listaRecibos` como `devuelto`.
   * `null` = no se pudo leer (≠ `[]`, que es «no ha habido ninguna»).
   */
  historialDevoluciones: DevolucionHistorial[] | null
  /**
   * Baja VERIFICADA por el corredor desde un recibo devuelto («el cliente se va»), antes de que CIMA
   * la confirme. `null` = no la hay o no se pudo leer (la póliza se pinta con su `estado`).
   */
  bajaVerificada: { en: string; por: string | null; motivo: string | null; estadoCima: string | null; cimaEn: string | null } | null
  /**
   * Fechas del contrato que manda CIMA (asegura#864). Cada una `null` = CIMA
   * aún no la ha mandado para esta póliza, no «no tiene».
   */
  fechasContrato: { emision: string | null; efectoActual: string | null; situacion: string | null; solicitud: string | null }
  /**
   * Cobro, contrato, riesgos y beneficiarios de `datos_especificos`, por LISTA
   * BLANCA (`contratoCima`). El IBAN NO cruza: solo sus 4 últimos dígitos.
   * `null` = la ficha no trae ninguna de esas claves.
   */
  contrato: ContratoCima | null
  siniestros: SiniestroFicha[]
  /**
   * Personas que manda CIMA (asegura#880): `figuras` de la póliza (papel, nombre, domicilio, teléfono,
   * email; beneficiario con orden y %) y la persona asegurada + préstamo/modalidad de vida y decesos.
   * Descifrado en este servidor; el documento NO cruza (solo «consta»). Cada parte
   * `null` = no consta (póliza ingerida antes de #880, o sin ese bloque).
   */
  personas: PersonasPoliza
  intervinientes: IntervinienteFicha[] | null
  /** `null` = no se pudo contar. `0` = la tabla existe y no hay ninguno (hoy: 0 en TODA la base). */
  documentos: number | null
  /** La lista (con estado pedido/recibido/revisado). `null` = no se pudo consultar. */
  listaDocumentos: DocumentoResumen[] | null
  pago: { fraccionamiento: string | null; formaCobro: string | null; recargo: RecargoFraccionamiento }
  /**
   * «Por qué ha subido»: prima por anualidad (aniversario a aniversario, recibos CA/NP)
   * y veredicto con siniestros del ciclo anterior. `sin_datos` cuando CIMA no manda la
   * anualidad anterior o el ciclo está incompleto — NUNCA se pinta como «no ha subido».
   */
  evolucionPrima: EvolucionPrima
  /**
   * Lo que la compañía dice de la póliza por CIMA y no es el objeto: anulación,
   * póliza a la que sustituye, suplementos, «otros datos» y el resto de la ficha
   * del inmueble. `null` = la ficha no trae nada de esto (o se ingirió antes de
   * que se leyera, 24/09/2026), NO «la compañía no lo manda».
   */
  datosCompania: DatosCompaniaCima | null
  /** `datos_especificos.cimaExtra` tal cual (sin PII, denegada en origen). `null` = clave ausente (aún no leído) ≠ `[]`. */
  cimaExtra: Array<{ ruta: string; valor: string }> | null
  cimaExtraTruncado: boolean
  /** `retarificacion.retarificable`, mantenido por compatibilidad con quien ya lo lee. */
  retarificable: boolean
  /** Por qué ramo se puede pedir precio (auto/hogar), o por qué no, mirando también la gemela. */
  retarificacion: Retarificabilidad
  /**
   * Qué se puede esperar que cueste esto hoy, con los casos que ya conocemos
   * (cartera viva + cotizaciones reales guardadas). `null` = ni se ha intentado,
   * porque la póliza no es retarificable. Si hay estimación pero sin horquilla,
   * viene igual: su `sinBase` y su `etiqueta` dicen por qué.
   */
  estimacion: EstimacionFicha | null
  /**
   * Los dos capitales de hogar reconstruidos por corroboración entre garantías,
   * cada uno con su porqué (`consenso` / `solo_sublimites` / …). `null` cuando
   * la póliza no es de hogar.
   */
  capitalesHogar: { continente: CapitalAsegurado; contenido: CapitalAsegurado } | null
  /**
   * Sustitución por retarificación (20/09/2026): si esta póliza viene de
   * cambiar de compañía, o si a ella la ha sustituido otra. Los dos lados
   * pueden venir a la vez que `null` — no son excluyentes con nada más de la
   * ficha. `seguimiento` sale de `seguimientoSustitucion()`, la MISMA regla
   * que usa plataforma: nunca se reimplementa el «¿ya lo confirmó CIMA?».
   */
  sustitucion: {
    origen: PolizaRelacionada | null
    sustituidaPor: PolizaRelacionada | null
    sustituidaAt: string | null
    seguimiento: SeguimientoSustitucion
  }
}

/** El recibo de la lista, con la remesa y la comisión que la ingesta guarda desde asegura#861. */
export type ReciboFichaPoliza = ReciboResumen & {
  idRemesa: string | null
  gestionCobro: string | null
  claseComision: string | null
  baseComision: number | null
  retencionIrpf: number | null
  /** Comisión bruta del recibo según CIMA. `null` = no la da o no se sabe leer (nunca 0 por defecto). */
  comisionBruta: number | null
  /** `clase_recibo` del EIAC (CA/NP/SU…) tal cual. `null` = no consta. */
  clase: string | null
  /** Día en que el recibo pasó a su situación actual (cobrado/devuelto/anulado). `null` = no consta. */
  fechaSituacion: string | null
  /** Prima neta del recibo (CIMA). `null` = no consta (nunca 0). Solo operador. */
  primaNeta: number | null
  /** Comisión líquida del recibo (CIMA). `null` = no consta (nunca 0). Solo operador. */
  comisionLiquida: number | null
  /**
   * La compañía avisó POR CORREO de que el banco lo devolvió y aún no consta el cobro
   * (`recibo_devolucion`). Es lo único que permite marcarlo «cobrado de nuevo» a mano: una devolución
   * que trae CIMA la resuelve CIMA. `null` = no hay aviso abierto o no se pudo leer.
   */
  devolucionCorreo: { fecha: string; motivo: string | null; tipoMotivo: string | null } | null
  /** `datos_extra.cimaExtra` del recibo (sin PII, denegada en origen). `null` = clave ausente (aún no leído) ≠ `[]`. Solo operador. */
  cimaExtra: Array<{ ruta: string; valor: string }> | null
  cimaExtraTruncado: boolean
}

export type DevolucionHistorial = {
  /** Nº de recibo tal cual lo escribió la compañía. */
  idRecibo: string
  fecha: string
  fechaEfecto: string | null
  importe: number | null
  motivo: string | null
  tipoMotivo: string | null
  /** `null` = sigue abierta. */
  resueltaEn: string | null
  /** `cobrado` (a mano), `cima:cobrado`, `cima:anulado`… tal cual se guardó. */
  resueltaComo: string | null
}

export type PolizaRelacionada = {
  polizaId: string
  clienteId: string
  aseguradora: string
  numeroPoliza: string | null
  estado: string
  confirmadaCima: boolean
}

/** Hoy en Madrid, `YYYY-MM-DD`: la horquilla pesa la antigüedad de cada caso. */
function hoyEnMadrid(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })
}

/**
 * Qué se enseña cuando NO se han podido leer los casos.
 *
 * Los ceros de `fuente` aquí no dicen «no hay»: dicen «no se ha podido contar»,
 * y por eso van SIEMPRE acompañados de la etiqueta, que es lo que la pantalla
 * pinta. Se degrada en vez de tumbar la ficha entera —la estimación es un
 * añadido, no la póliza— pero no se calla, que es lo que `CLAUDE.md` prohíbe.
 */
function estimacionIlegible(motivo: string): EstimacionFicha {
  const texto = `No se han podido leer los casos con los que comparar: ${motivo}`
  return {
    horquilla: null,
    sinBase: texto,
    casos: 0,
    desde: null,
    hasta: null,
    antiguedadMedianaMeses: null,
    base: null,
    etiqueta: texto,
    orientativa: true,
    veredicto: 'no-se',
    porque: texto,
    fuente: { cartera: 0, cotizaciones: 0, cotizacionesDisponibles: false },
  }
}

/**
 * La estimación de una póliza: reúne los casos, construye la horquilla y dice
 * si merece la pena gastar los 0,50€ de una cotización de verdad.
 *
 * 🚨 Solo LEE la base de datos. No llama a Codeoscopic ni de lejos.
 */
async function estimacionPoliza(input: {
  correduriaId: string
  ramo: string
  /** La que se estima: queda fuera de sus propios casos, no se compara consigo misma. */
  polizaId: string
  primaActual: number | null
  riesgo: RiesgoAEstimar
  tx: EjecutorLectura
}): Promise<EstimacionFicha> {
  let reunidos
  try {
    reunidos = await casosDeRamo({
      correduriaId: input.correduriaId,
      ramo: input.ramo,
      tx: input.tx,
      excluirPolizaId: input.polizaId,
    })
  } catch (e) {
    return estimacionIlegible(e instanceof Error ? e.message : String(e))
  }
  const estimacion = estimar(reunidos.casos, input.riesgo, hoyEnMadrid())
  const { veredicto, porque } = mereceLaPena(input.primaActual, estimacion)
  return {
    ...estimacion,
    veredicto,
    porque,
    fuente: {
      cartera: reunidos.cartera,
      cotizaciones: reunidos.cotizaciones,
      cotizacionesDisponibles: reunidos.cotizacionesDisponibles,
    },
  }
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
/** Descifrado para las figuras de CIMA: lanza o devuelve `null` si no abre (`figuras-cima.ts` lo trata como ilegible). */
const descifrarFigura = (v: string): string | null => decryptField(v)
function ilegible(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.startsWith('v1:') && descifrar(v) === null
}
/** `cimaExtra` de `datos_especificos`: `null` si la clave no está (null ≠ []); solo pares {ruta, valor} de texto. */
function leerCimaExtra(datos: unknown): Array<{ ruta: string; valor: string }> | null {
  if (!esObjetoPlano(datos) || !Array.isArray(datos.cimaExtra)) return null
  const out: Array<{ ruta: string; valor: string }> = []
  for (const it of datos.cimaExtra) {
    if (it && typeof it === 'object' && typeof (it as { ruta?: unknown }).ruta === 'string' && typeof (it as { valor?: unknown }).valor === 'string') {
      out.push({ ruta: (it as { ruta: string }).ruta, valor: (it as { valor: string }).valor })
    }
  }
  return out
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


export async function fichaPoliza(correduriaId: string, polizaId: string): Promise<FichaPoliza | null> {
  if (!aseguraConfigurada()) return null
  const db = prismaAsegura()
  const p = await db.poliza.findFirst({
    where: { id: polizaId, correduriaId, mergedIntoPolizaId: null },
    select: {
      id: true, tipo: true, aseguradora: true, codigoEntidadDgs: true, numeroPoliza: true, idPolizaEntidad: true,
      ramoDgs: true, estado: true, situacion: true, origen: true, importRef: true, eiacXmlHash: true,
      polizaOrigenId: true, sustituidaAt: true,
      fechaEfectoInicial: true, fechaInicio: true, fechaVencimiento: true,
      fechaEmision: true, fechaEfectoActual: true, fechaSituacion: true, fechaSolicitud: true,
      primaAnual: true, primaBruta: true, primaMensual: true, fraccionamiento: true, datosEspecificos: true,
      cliente: { select: { id: true, nombre: true, apellidos: true, telefono: true } },
      coberturasRel: {
        select: { numeroOrden: true, codigo: true, descripcion: true, capitalAsegurado: true, descripcionCapital: true, franquicia: true, fechaInicio: true, fechaFin: true, modalidadValoracion: true, datosExtra: true },
        orderBy: { numeroOrden: 'asc' },
      },
      recibos: {
        select: { id: true, situacion: true, primaTotal: true, primaNeta: true, claseRecibo: true, fechaEfectoInicial: true, fechaEfectoActual: true, fechaEmision: true, fechaVencimiento: true, formaPago: true,
          idRemesa: true, gestionCobro: true, claseComision: true, baseComision: true, retencionIrpf: true, comisionBruta: true,
          fechaSituacion: true, comisionLiquida: true, datosExtra: true },
        orderBy: { fechaEmision: 'desc' },
      },
      siniestros: { where: { fusionadoEnSiniestroId: null }, select: SELECT_SINIESTRO, orderBy: { fechaHora: 'desc' } },
    },
  })
  if (!p) return null

  const [intervinientes, gemela, documentos, listaDocumentos, historial] = await Promise.all([
    db.polizaInterviniente
      .findMany({
        where: { correduriaId, polizaId: p.id },
        // Determinista a propósito: ver la nota de `cartera-ficha`.
        orderBy: [{ rol: 'asc' }, { id: 'asc' }],
        select: {
          id: true, polizaId: true, rol: true, clienteId: true, origen: true, nombre: true, apellidos: true, telefono: true, email: true,
          nifLookupHash: true, fechaCarnet: true, fechaNacimiento: true,
          cliente: { select: { nombre: true, apellidos: true, telefono: true, email: true } },
        },
      })
      .then((filas): IntervinienteFicha[] => {
        // Etiqueta opaca por NIF; ver la nota de `cartera-ficha`.
        const claves = new Map<string, string>()
        for (const f of filas) {
          if (f.nifLookupHash && !claves.has(f.nifLookupHash)) claves.set(f.nifLookupHash, `p${claves.size + 1}`)
        }
        return filas.map((f) => {
          const propio = [descifrar(f.nombre), descifrar(f.apellidos)].filter(Boolean).join(' ').trim() || null
          const deFicha = f.cliente ? `${f.cliente.nombre} ${f.cliente.apellidos}`.trim() || null : null
          const telefono = descifrar(f.telefono) ?? descifrar(f.cliente?.telefono)
          const email = descifrar(f.email) ?? descifrar(f.cliente?.email)
          return {
            id: f.id, polizaId: f.polizaId, rol: String(f.rol), nombre: propio ?? deFicha,
            nombreIlegible: propio === null && deFicha === null && (ilegible(f.nombre) || ilegible(f.apellidos)),
            telefono, email,
            telefonoIlegible: telefono === null && (ilegible(f.telefono) || ilegible(f.cliente?.telefono)),
            emailIlegible: email === null && (ilegible(f.email) || ilegible(f.cliente?.email)),
            fichaId: f.clienteId ?? null, esTomador: f.clienteId === p.cliente.id, origen: String(f.origen),
            personaClave: f.nifLookupHash ? claves.get(f.nifLookupHash) ?? null : null,
            // Cifrados en la BD: solo salen si se abren (operador); ilegible → `null`, no «sin carné».
            fechaCarnet: descifrar(f.fechaCarnet), fechaNacimiento: descifrar(f.fechaNacimiento),
          }
        })
      })
      .catch((): IntervinienteFicha[] | null => null),
    // La gemela: mismo número, la OTRA cara. Solo tiene sentido si esta es de
    // CIMA (la del volcado ya es la que tiene la dirección).
    p.numeroPoliza === null
      ? Promise.resolve(null)
      : db.poliza
          .findFirst({
            where: {
              correduriaId, mergedIntoPolizaId: null, numeroPoliza: p.numeroPoliza, id: { not: p.id },
              // La gemela es la de la OTRA cara: si ésta es viva, la copia del volcado;
              // si ésta es del volcado, la que mantiene CIMA.
              ...(esCarteraViva(p) ? WHERE_VOLCADO_HISTORICO : WHERE_CARTERA_VIVA),
            },
            select: { id: true, clienteId: true, importRef: true, eiacXmlHash: true, datosEspecificos: true, tipo: true, fechaVencimiento: true },
          })
          .catch(() => null),
    contarDocumentosPoliza(correduriaId, p.id),
    listarDocumentos(correduriaId, { polizaId: p.id }),
    historialRiesgo(correduriaId, p.id),
  ])

  const [polizaOrigen, sustituidaPor] = await Promise.all([
    p.polizaOrigenId
      ? db.poliza
          .findFirst({
            where: { id: p.polizaOrigenId, correduriaId },
            select: { id: true, clienteId: true, aseguradora: true, numeroPoliza: true, estado: true, idPolizaEntidad: true },
          })
          .catch(() => null)
      : Promise.resolve(null),
    // El reverso: ¿hay alguna póliza cuyo origen sea ESTA? Solo puede haber una
    // (cada emisión se ancla a un `polizaOrigenId` distinto), pero por si acaso
    // se coge la más reciente.
    db.poliza
      .findFirst({
        where: { polizaOrigenId: p.id, correduriaId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, clienteId: true, aseguradora: true, numeroPoliza: true, estado: true, idPolizaEntidad: true },
      })
      .catch(() => null),
  ])
  const relacionada = (x: typeof polizaOrigen): PolizaRelacionada | null =>
    x === null ? null : { polizaId: x.id, clienteId: x.clienteId, aseguradora: x.aseguradora, numeroPoliza: x.numeroPoliza ?? null, estado: String(x.estado), confirmadaCima: x.idPolizaEntidad !== null }

  const datos = datosConDireccion(p.datosEspecificos)
  const datosGemela = esObjetoPlano(gemela?.datosEspecificos) ? gemela.datosEspecificos : null
  const retarificacion = retarificabilidad({ tipo: String(p.tipo), estado: String(p.estado), datos, datosGemela })
  const coberturasTexto = p.coberturasRel.map((c) => c.descripcion).filter((d): d is string => !!d)

  // El capital asegurado de hogar se RECONSTRUYE por corroboración entre
  // garantías: ninguna compañía manda una fila que diga «este es el
  // continente», y coger el importe más alto daría un número plausible y falso
  // (ver `garantias.ts` en `@central/module-seguros`).
  //
  // 🚨 Y se le pasa la SEGUNDA fuente: los capitales que la copia del volcado
  // guarda en su `datos_especificos` («61000» / «7000», como texto). El dato ya
  // está en memoria —es el mismo objeto del que salen los m² y el año que la
  // ficha ya pintaba—, así que aquí no se consulta nada nuevo. Hasta el
  // 03/09/2026 se cogían unos campos de ese objeto y no otros, y luego la ficha
  // afirmaba que el capital «no consta»: el «no lo he mirado» disfrazado de «no
  // lo hay» que prohíbe `CLAUDE.md`.
  //
  // Cuál de las dos caras ES el volcado depende de cuál se está mirando: si
  // ésta es la viva, el volcado es la gemela; si ésta ya es la del volcado, es
  // ella misma. Con `null` el módulo entiende «no se ha mirado» y no dice nada
  // del volcado en sus motivos.
  const datosVolcado = esCarteraViva(p) ? datosGemela : datos
  const capitales =
    String(p.tipo) === 'hogar'
      ? capitalesHogar(
          p.coberturasRel.map((c) => ({ descripcion: c.descripcion, capital: c.capitalAsegurado })),
          datosVolcado ? { continente: datosVolcado.continente, contenido: datosVolcado.contenido } : null,
        )
      : null
  // El riesgo puede venir de la póliza o de su copia gemela: CIMA no manda el
  // objeto de hogar y la del volcado sí. Lo que no traiga ninguna sigue a
  // `null` — un 0 aquí torcería la horquilla.
  const riesgoHogar = elegirRiesgo(hogarDeDatos(datos, 'poliza'), hogarDeDatos(datosGemela, 'gemela'))
  // L10 (28/09/2026): si CIMA no dio la prima ANUAL (fraccionada sin anualizada en
  // una compañía no medida), lo guardado no se presenta como anual en ninguna parte.
  const primaDudosa = (p.datosEspecificos as { primaAnualDudosa?: unknown } | null)?.primaAnualDudosa === true
  const primaAnualF = primaDudosa ? null : num(p.primaAnual)
  const primaBrutaF = primaDudosa ? null : num(p.primaBruta)
  // Allianz manda prima y renovación solo en el recibo de cartera (27/09/2026).
  const hoyIso = new Date().toISOString()
  const recibosVig = p.recibos.map((r) => ({
    claseRecibo: r.claseRecibo ?? null, situacion: r.situacion === null ? null : String(r.situacion),
    primaTotal: r.primaTotal, fechaVencimiento: fechaIso(r.fechaVencimiento),
  }))
  const prima = primaConRecibos({
    primaAnual: primaAnualF, primaBruta: primaBrutaF,
    fraccionamiento: p.fraccionamiento === null ? null : String(p.fraccionamiento),
  }, recibosVig, hoyIso).prima
  // Solo se estima lo RETARIFICABLE: la pregunta que responde esto es «¿gasto
  // los 0,50€ de una cotización?», y no se puede gastar en algo que no se puede
  // pedir (un ramo que Codeoscopic no sirve, o una póliza cancelada). Cuando no,
  // `null` — la pantalla ya tiene el motivo en `retarificacion.motivo`.
  const estimacion = retarificacion.retarificable
    ? await estimacionPoliza({
        correduriaId,
        ramo: String(p.tipo),
        polizaId: p.id,
        primaActual: prima,
        // Se lee con la MISMA conexión que la ficha (schema `seguros`): así la
        // horquilla y la póliza salen de la misma cartera, no de dos copias.
        tx: db,
        riesgo: {
          metrosCuadrados: riesgoHogar?.metrosCuadrados ?? null,
          anioConstruccion: riesgoHogar?.anioConstruccion ?? null,
          // El capital corroborado manda sobre el tecleado en la ficha; si
          // ninguno lo sabe, sigue siendo «no lo sé».
          capitalContinente:
            (capitales ? eurDeCapital(capitales.continente) : null) ?? riesgoHogar?.capitalContinente ?? null,
        },
      })
    : null
  const devolucionesCorreo = await devolucionesCorreoAbiertas(db, correduriaId, p.recibos.map((r) => r.id))
  const historialDevoluciones = await devolucionesDePoliza(db, correduriaId, p.id, p.recibos.map((r) => r.id))
  const bajaVerificada = await leerBajaVerificada(db, p.id)
  const recibosCrudos = p.recibos.map((r) => ({
    id: r.id, situacion: r.situacion === null ? null : String(r.situacion), primaTotal: r.primaTotal,
    fechaEmision: fechaIso(r.fechaEmision), fechaVencimiento: fechaIso(r.fechaVencimiento), fechaEfecto: fechaIso(r.fechaEfectoActual),
    formaPago: r.formaPago,
  }))
  const fraccionamiento = p.fraccionamiento === null ? null : String(p.fraccionamiento)

  return {
    id: p.id,
    cliente: {
      id: p.cliente.id, nombre: `${p.cliente.nombre} ${p.cliente.apellidos}`.trim(),
      telefono: descifrar(p.cliente.telefono),
    },
    tipo: String(p.tipo),
    aseguradora: p.aseguradora,
    codigoEntidadDgs: p.codigoEntidadDgs ?? null,
    numeroPoliza: p.numeroPoliza ?? null,
    idPolizaEntidad: p.idPolizaEntidad ?? null,
    ramoDgs: p.ramoDgs ?? null,
    estado: String(p.estado),
    situacion: p.situacion ?? null,
    origen: String(p.origen),
    viva: esCarteraViva(p),
    fechaEfectoInicial: fechaIso(p.fechaEfectoInicial),
    fechaInicio: fechaIso(p.fechaInicio),
    fechaVencimiento: vencimientoConRecibos(fechaIso(p.fechaVencimiento), recibosVig, hoyIso),
    prima,
    primaAnual: primaAnualF,
    primaBruta: primaBrutaF,
    primaMensual: num(p.primaMensual),
    objeto: objetoAsegurado({ tipo: String(p.tipo), datos, coberturas: coberturasTexto.length ? coberturasTexto : null }),
    historialRiesgo: historial,
    gemela:
      gemela === null
        ? null
        : {
            polizaId: gemela.id,
            clienteId: gemela.clienteId,
            // Con qué cara se etiqueta la gemela. `'cima'` cuando es cartera viva —
            // incluida la fila del volcado que CIMA mantiene, que SÍ lleva `import_ref`.
            importRef: esCarteraViva(gemela) ? 'cima' : (gemela.importRef ?? 'cima'),
            objeto: objetoAsegurado({ tipo: String(gemela.tipo), datos: datosConDireccion(gemela.datosEspecificos), coberturas: null }),
            fechaVencimiento: fechaIso(gemela.fechaVencimiento),
          },
    coberturas: p.coberturasRel.map((c) => ({
      orden: c.numeroOrden ?? null, codigo: c.codigo ?? null, descripcion: c.descripcion ?? null,
      capital: c.capitalAsegurado ?? null, descripcionCapital: c.descripcionCapital ?? null, franquicia: c.franquicia ?? null,
      desde: fechaIso(c.fechaInicio), hasta: fechaIso(c.fechaFin),
      modalidad: c.modalidadValoracion ?? null, detalle: extraerDetalleCobertura(c.datosExtra),
    })),
    recibos: resumirRecibos(recibosCrudos),
    listaRecibos: p.recibos.map((x, i) => {
      const r = recibosCrudos[i]
      return {
        id: r.id, situacion: (r.situacion ?? '').trim() || 'sin_informar', importe: importeEiac(r.primaTotal),
        fechaEmision: r.fechaEmision, fechaVencimiento: r.fechaVencimiento, fechaEfecto: r.fechaEfecto ?? null, formaPago: etiquetaFormaPago(r.formaPago),
        idRemesa: texto(x.idRemesa), gestionCobro: texto(x.gestionCobro), claseComision: texto(x.claseComision),
        baseComision: num(x.baseComision), retencionIrpf: num(x.retencionIrpf), comisionBruta: importeEiac(x.comisionBruta),
        clase: texto(x.claseRecibo), fechaSituacion: fechaIso(x.fechaSituacion),
        primaNeta: importeEiac(x.primaNeta), comisionLiquida: importeEiac(x.comisionLiquida),
        devolucionCorreo: devolucionesCorreo.get(r.id) ?? null,
        cimaExtra: leerCimaExtra(x.datosExtra),
        cimaExtraTruncado: esObjetoPlano(x.datosExtra) && x.datosExtra.cimaExtraTruncado === true,
      }
    }),
    historialDevoluciones,
    bajaVerificada,
    fechasContrato: {
      emision: fechaIso(p.fechaEmision), efectoActual: fechaIso(p.fechaEfectoActual),
      situacion: fechaIso(p.fechaSituacion), solicitud: fechaIso(p.fechaSolicitud),
    },
    contrato: contratoCima(p.datosEspecificos, descifrar),
    siniestros: await conTercerosCima(correduriaId, p.siniestros.map(mapSiniestro)),
    // Personas de CIMA (asegura#880): figuras, persona asegurada de vida/decesos. Descifradas AQUÍ;
    // del documento solo «consta». Todo `null` si la póliza es anterior a #880.
    personas: personasDePoliza(p.datosEspecificos, descifrarFigura),
    datosCompania: leerDatosCompaniaCima(p.datosEspecificos),
    cimaExtra: leerCimaExtra(p.datosEspecificos),
    cimaExtraTruncado: esObjetoPlano(p.datosEspecificos) && p.datosEspecificos.cimaExtraTruncado === true,
    evolucionPrima: evolucionPrima({
      fechaInicio: fechaIso(p.fechaInicio),
      fraccionamiento: p.fraccionamiento === null ? null : String(p.fraccionamiento),
      recibos: p.recibos.map((r) => ({
        id: r.id, claseRecibo: r.claseRecibo ?? null, fechaEfectoInicial: fechaIso(r.fechaEfectoInicial), fechaEmision: fechaIso(r.fechaEmision),
        situacion: r.situacion === null ? null : String(r.situacion), primaTotal: r.primaTotal, primaNeta: r.primaNeta,
      })),
      siniestros: p.siniestros.map((x) => ({ fechaHora: x.fechaHora instanceof Date ? x.fechaHora.toISOString() : null, estado: String(x.estado) })),
    }),
    intervinientes,
    documentos,
    listaDocumentos,
    pago: {
      fraccionamiento,
      formaCobro: etiquetaFormaPago(p.recibos[0]?.formaPago ?? null),
      recargo: recargoFraccionamiento({
        fraccionamiento, primaAnual: primaAnualF, vencimiento: fechaIso(p.fechaVencimiento),
        recibos: recibosCrudos.map((r) => ({ importe: importeEiac(r.primaTotal), fechaEmision: r.fechaEmision, situacion: r.situacion })),
      }),
    },
    retarificable: retarificacion.retarificable,
    retarificacion,
    estimacion,
    capitalesHogar: capitales,
    sustitucion: {
      origen: relacionada(polizaOrigen),
      sustituidaPor: relacionada(sustituidaPor),
      sustituidaAt: fechaIso(p.sustituidaAt),
      seguimiento: seguimientoSustitucion({ polizaOrigenId: p.polizaOrigenId ?? null, idPolizaEntidad: p.idPolizaEntidad ?? null }),
    },
  }
}

/** Devoluciones avisadas por correo y aún abiertas, por id de recibo. Un fallo de lectura → mapa vacío (no se ofrece el botón). */
async function devolucionesCorreoAbiertas(
  db: ReturnType<typeof prismaAsegura>,
  correduriaId: string,
  reciboIds: string[],
): Promise<Map<string, { fecha: string; motivo: string | null; tipoMotivo: string | null }>> {
  const out = new Map<string, { fecha: string; motivo: string | null; tipoMotivo: string | null }>()
  if (reciboIds.length === 0) return out
  try {
    const filas = await db.$queryRaw<{ reciboId: string; fecha: string; motivo: string | null; tipoMotivo: string | null }[]>`
      select recibo_id::text as "reciboId", to_char(fecha_devolucion, 'YYYY-MM-DD') as fecha, motivo, tipo_motivo as "tipoMotivo"
      from recibo_devolucion
      where correduria_id = ${correduriaId}::uuid and resuelta_at is null and recibo_id = any(${reciboIds}::uuid[])`
    for (const f of filas) out.set(f.reciboId, { fecha: f.fecha, motivo: f.motivo, tipoMotivo: f.tipoMotivo })
  } catch (e) {
    console.error('[cartera-poliza] devoluciones por correo no leídas:', e instanceof Error ? e.message : e)
  }
  return out
}

/** Todas las devoluciones avisadas por correo de esta póliza (por póliza o por sus recibos). */
async function devolucionesDePoliza(
  db: ReturnType<typeof prismaAsegura>,
  correduriaId: string,
  polizaId: string,
  reciboIds: string[],
): Promise<DevolucionHistorial[] | null> {
  try {
    const filas = await db.$queryRaw<{ idRecibo: string; fecha: string; fechaEfecto: string | null; importe: string | null; motivo: string | null
      tipoMotivo: string | null; resueltaEn: string | null; resueltaComo: string | null }[]>`
      select id_recibo as "idRecibo", to_char(fecha_devolucion, 'YYYY-MM-DD') as fecha, to_char(fecha_efecto, 'YYYY-MM-DD') as "fechaEfecto",
             importe::text as importe, motivo, tipo_motivo as "tipoMotivo",
             to_char(resuelta_at at time zone 'Europe/Madrid', 'YYYY-MM-DD') as "resueltaEn", resuelta_motivo as "resueltaComo"
      from recibo_devolucion
      where correduria_id = ${correduriaId}::uuid
        and (poliza_id = ${polizaId}::uuid or recibo_id = any(${reciboIds}::uuid[]))
      order by fecha_devolucion desc, created_at desc
      limit 50`
    return filas.map((f) => ({ ...f, importe: f.importe === null ? null : (Number.isFinite(Number(f.importe)) ? Number(f.importe) : null) }))
  } catch (e) {
    console.error('[cartera-poliza] historial de devoluciones no leído:', e instanceof Error ? e.message : e)
    return null
  }
}

async function leerBajaVerificada(db: ReturnType<typeof prismaAsegura>, polizaId: string): Promise<FichaPoliza['bajaVerificada']> {
  try {
    // `estadoCima` = lo último que CIMA escribió DESPUÉS de la baja (NULL = aún no ha dicho nada).
    const [b] = await db.$queryRaw<{ en: string; por: string | null; motivo: string | null; estadoCima: string | null; cimaEn: string | null }[]>`
      select to_char(baja_verificada_at at time zone 'Europe/Madrid', 'YYYY-MM-DD') as en, baja_verificada_por as por, baja_motivo as motivo,
             baja_estado_cima as "estadoCima", to_char(baja_cima_at at time zone 'Europe/Madrid', 'YYYY-MM-DD') as "cimaEn"
      from polizas where id = ${polizaId}::uuid and baja_verificada_at is not null`
    return b ?? null
  } catch (err) {
    console.error('[cartera-poliza] baja verificada no leída:', err instanceof Error ? err.message : err)
    return null
  }
}
