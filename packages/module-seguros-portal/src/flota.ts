/**
 * La FLOTA de una empresa en el portal (05/10/2026) — el mínimo de empresa para
 * el piloto con 3-5 sociedades del grupo (spec `2026-09-01-asegura-portal-…`,
 * sección «Empresas»). Reglas puras, sin BD.
 *
 * Tres piezas, y por qué así:
 *
 *  1. **Quién ve la flota.** El DUEÑO de la sociedad (la misma regla que ya le
 *     abre la empresa entera: relación `Dueño` en la ficha, `empresasDelDueno`)
 *     y el **jefe de flota**, que es una fila de `portal_autorizacion` con
 *     alcance `flota` concedida por la SOCIEDAD. Nadie más.
 *     🚨 `Administración` NO entra, a propósito y por coherencia: el 25/09/2026
 *     Alberto decidió que esa relación no abre la empresa porque en el CRM es
 *     tanto el administrador como la administrativa. Si el dueño quiere que la
 *     administrativa lleve la flota, la nombra jefe de flota — y queda escrito
 *     quién y cuándo.
 *
 *  2. **El alcance `flota` NO es un `Alcance`.** No está en `ALCANCES` y
 *     `esAlcance('flota')` es `false` a propósito: todos los lectores que ya
 *     existen (`carteraDeIdentidad`, la campana, los avisos, el CRM) ignoran un
 *     alcance que no conocen («un alcance que el módulo no conoce NO abre
 *     nada»). Así el jefe de flota no ve la bóveda de la empresa —ni la prima de
 *     sus otros seguros, ni sus siniestros, ni su cuenta— sin tener que tocar
 *     ninguno de esos lectores. Meterlo en `ALCANCES` le daría la ficha ENTERA
 *     por la puerta de atrás (`porOtorgante`): el cepo de `flota.test.ts` lo vigila.
 *
 *  3. **La ITV es un cálculo, nunca un «al día».** Nadie en este sistema sabe
 *     cuándo pasó un vehículo su última inspección: lo que sale es la
 *     periodicidad legal (`proximaItv`) aplicada a la fecha de matriculación, y
 *     esa fecha puede venir de la compañía, haberla escrito el cliente o estar
 *     estimada por la serie de la matrícula. Sin fecha → `desconocida`, que se
 *     pinta como «no lo sabemos», jamás en verde.
 *
 * Fuera de esta entrega (pendiente): conductor con acceso que caduca, QR del
 * vehículo a WhatsApp, multi-CIF, dar parte desde la flota.
 */
import { fechaMatriculacionEstimada, normalizarMatricula } from '@central/module-seguros'

import { autorizacionVigente, type AutorizacionFechas, type TituloRepresentacion } from './autorizacion.ts'
import type { TipoFicha } from './dueno-empresa.ts'
import { perfilItvDeRamo, proximaItv, type FiabilidadItv } from './itv.ts'

/** El valor de `portal_autorizacion.alcance` para el jefe de flota. NO es un `Alcance` (ver cabecera). */
export const ALCANCE_FLOTA = 'flota' as const

/**
 * Con qué título actúa el jefe de flota por la sociedad. Gestiona en su nombre,
 * así que tiene que constar (mismo argumento que `titulo_representacion` en
 * `portal_autorizacion`); el CHECK de la BD lo exige para `flota`.
 */
export const TITULO_JEFE_FLOTA: TituloRepresentacion = 'empleado_autorizado'

/** Versión del texto que se sella en `version_texto`. Un texto nuevo = versión nueva; las viejas no se reescriben. */
export const VERSION_TEXTO_JEFE_FLOTA = 'jefe-flota-v1-2026-10-05'

/** Lo que el dueño acepta al nombrar. Es una afirmación sobre el código: si cambia lo que ve, cambia el texto. */
export const TEXTO_JEFE_FLOTA =
  'Nombro a esta persona jefe de flota de la sociedad. Verá los vehículos de la sociedad con su seguro en vigor: ' +
  'compañía, vencimiento y la próxima ITV calculada, y podrá anotar la fecha de matriculación de cada vehículo. ' +
  'No verá el resto de seguros de la sociedad, ni primas, recibos, siniestros ni datos bancarios, y no podrá dar ' +
  'acceso a nadie más. Tiene que aceptarlo para que valga, y se puede retirar en cualquier momento.'

/** Los ramos que forman la flota: los que tienen ITV calculable. */
export const RAMOS_FLOTA = ['auto', 'moto'] as const
export type RamoFlota = (typeof RAMOS_FLOTA)[number]

export function esRamoFlota(ramo: string | null | undefined): ramo is RamoFlota {
  return typeof ramo === 'string' && (RAMOS_FLOTA as readonly string[]).includes(ramo)
}

/** Con qué papel ve una identidad la flota de una empresa. */
export type PapelFlota = 'dueno' | 'jefe_flota'

/** Una fila de `portal_autorizacion` tal como la necesita esta regla. */
export type AutorizacionFlotaFila = AutorizacionFechas & {
  otorganteClienteId: string
  alcance: string
  polizaId: string | null
}

/**
 * Las empresas cuya flota puede ver esta identidad, con su papel.
 *
 * Todas las entradas llegan YA acotadas por quien llama a la identidad de la
 * sesión (`portal_vinculo` de esa identidad, autorizaciones cuyo destinatario
 * es ella). Esto vuelve a cerrar lo que no se puede deducir de una consulta:
 *
 *  - La empresa tiene que ser `juridica` EXPLÍCITA y estar viva (en el mapa):
 *    un `NULL` no inventa una empresa, y una ficha fusionada no abre nada.
 *  - Una autorización solo vale si es `flota`, sobre la ficha entera
 *    (`polizaId === null`) y VIGENTE (aceptada, sin revocar ni caducar): la
 *    pendiente no abre nada, que es la doble aceptación.
 *  - Una ficha propia no se «autoriza» a sí misma: si la empresa es mía, ya
 *    entro como dueño.
 *  - Si es dueño y además jefe, gana dueño.
 */
export function empresasConFlota(x: {
  /** Empresas de las que es dueño (relación `Dueño`, o la ficha de la empresa vinculada con nivel para gestionar). */
  empresasComoDueno: readonly string[]
  /** Fichas propias (vinculadas a la identidad). */
  propias: readonly string[]
  autorizaciones: readonly AutorizacionFlotaFila[]
  /** Solo fichas VIVAS (activas, sin fusionar). Lo que no esté aquí no abre nada. */
  fichaPorId: ReadonlyMap<string, { tipo: TipoFicha }>
  hoy: Date
}): Map<string, PapelFlota> {
  const out = new Map<string, PapelFlota>()
  const esEmpresaViva = (id: string) => x.fichaPorId.get(id)?.tipo === 'juridica'
  for (const id of x.empresasComoDueno) {
    if (esEmpresaViva(id)) out.set(id, 'dueno')
  }
  const propias = new Set(x.propias)
  for (const a of x.autorizaciones) {
    if (a.alcance !== ALCANCE_FLOTA) continue
    if (a.polizaId !== null) continue
    if (!autorizacionVigente(a, x.hoy)) continue
    if (propias.has(a.otorganteClienteId)) continue
    if (!esEmpresaViva(a.otorganteClienteId)) continue
    if (!out.has(a.otorganteClienteId)) out.set(a.otorganteClienteId, 'jefe_flota')
  }
  return out
}

/**
 * La empresa que se pide (de la URL o del cuerpo), SOLO si está entre las
 * autorizadas. El id de fuera NUNCA consulta: se busca dentro de lo ya
 * resuelto por sesión, y lo que no está es `null` → 404 (nunca 403: no se
 * confirma que exista).
 */
export function empresaPermitida(pedida: unknown, accesos: ReadonlyMap<string, PapelFlota>): string | null {
  if (typeof pedida !== 'string') return null
  const id = pedida.trim()
  return accesos.has(id) ? id : null
}

/** Nombrar o retirar jefes de flota: solo el dueño. El jefe no reautoriza a un cuarto. */
export function puedeNombrarJefeFlota(papel: PapelFlota | undefined): boolean {
  return papel === 'dueno'
}

/** Anotar datos del vehículo (fecha de matriculación): dueño o jefe de flota. */
export function puedeEditarVehiculo(papel: PapelFlota | undefined): boolean {
  return papel === 'dueno' || papel === 'jefe_flota'
}

/**
 * El `where` de Prisma de las pólizas de la flota. Puro para poder probar que
 * el filtro por empresa está SIEMPRE: sin empresas no hay consulta (`null`), y
 * el `clienteId` sale únicamente de la lista autorizada. `enVigor` es
 * `WHERE_CARTERA_EN_VIGOR` de `@central/module-seguros` (se recibe para no
 * reescribir aquí qué es «en vigor»: cliente = póliza viva de CIMA en vigor).
 */
export function wherePolizasFlota<T>(empresasAutorizadas: readonly string[], enVigor: T) {
  if (empresasAutorizadas.length === 0) return null
  return {
    AND: [
      {
        clienteId: { in: [...empresasAutorizadas] },
        tipo: { in: [...RAMOS_FLOTA] },
        mergedIntoPolizaId: null,
      },
      enVigor,
    ],
  }
}

// ─── El vehículo ─────────────────────────────────────────────────────────────

/** La clave del vehículo dentro de una empresa: la matrícula normalizada. `null` = sin matrícula usable. */
export function claveVehiculo(matricula: string | null | undefined): string | null {
  if (typeof matricula !== 'string') return null
  const m = normalizarMatricula(matricula)
  // Menos de 4 caracteres no identifica un vehículo: es un resto de volcado.
  return m.length >= 4 ? m : null
}

function diaValido(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const limpio = v.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limpio)) return null
  const d = new Date(`${limpio}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== limpio) return null
  return limpio
}

/**
 * La fecha de matriculación que escribe el dueño o el jefe de flota. Solo una
 * fecha REAL, no futura y no anterior a 1950 (antes no hay serie que valga).
 * `null` = no se acepta, y la ruta lo devuelve como `datos_invalidos`.
 */
export function fechaMatriculacionValida(v: unknown, hoy: Date): string | null {
  const d = diaValido(v)
  if (d === null) return null
  if (d < '1950-01-01') return null
  if (d > hoy.toISOString().slice(0, 10)) return null
  return d
}

/**
 * La fecha de matriculación que trae la compañía (EIAC) en los datos de la
 * póliza. Lee UNA clave concreta (`fechaMatriculacion`), nunca el objeto entero.
 * `null` = no la trae o no es una fecha.
 */
export function matriculacionDeCompania(datosPoliza: unknown): string | null {
  if (typeof datosPoliza !== 'object' || datosPoliza === null || Array.isArray(datosPoliza)) return null
  return diaValido((datosPoliza as Record<string, unknown>).fechaMatriculacion)
}

/** De dónde sale la fecha de matriculación. Se pinta SIEMPRE: no valen lo mismo. */
export type FuenteMatriculacion = 'compania' | 'declarada' | 'estimada'

/** Días antes de la fecha en los que una ITV o un vencimiento pasan a «pronto». */
export const DIAS_PRONTO_FLOTA = 30

export type ItvVehiculo =
  | {
      estado: 'desconocida'
      /** `sin_matriculacion` = no sabemos cuándo se matriculó; `sin_perfil` = ramo sin ITV calculable. */
      motivo: 'sin_matriculacion' | 'sin_perfil'
    }
  | {
      estado: 'calculada'
      fecha: string
      fiabilidad: FiabilidadItv
      fuente: FuenteMatriculacion
      diasHasta: number
      pronto: boolean
      periodicidadMeses: number
      /** `true` en auto: se calcula como turismo, y una furgoneta (N1) tiene otro calendario. La pantalla lo dice. */
      calculadaComoTurismo: boolean
    }

const MS_DIA = 86_400_000

function diasEntre(desdeIso: string, hasta: Date): number {
  const hoy = Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate())
  return Math.round((new Date(`${desdeIso}T00:00:00Z`).getTime() - hoy) / MS_DIA)
}

/**
 * La próxima ITV de un vehículo de la flota.
 *
 * Orden de la fecha de matriculación: compañía > declarada > estimada por la
 * matrícula (la escalera de procedencias del portal: lo calculado nunca pisa lo
 * que alguien ha dicho, y lo de la compañía gana a lo declarado). Sin ninguna →
 * `desconocida`. 🚨 No existe un estado «al día»: aunque la fecha salga lejos,
 * es un cálculo sobre una inspección que no hemos visto.
 */
export function itvDeVehiculo(x: {
  ramo: string | null | undefined
  matricula: string | null
  matriculacionCompania: string | null
  matriculacionDeclarada: string | null
  hoy: Date
}): ItvVehiculo {
  const perfil = perfilItvDeRamo(x.ramo)
  if (perfil === null) return { estado: 'desconocida', motivo: 'sin_perfil' }

  const compania = diaValido(x.matriculacionCompania)
  const declarada = compania === null ? diaValido(x.matriculacionDeclarada) : null
  const estimada =
    compania === null && declarada === null && x.matricula
      ? (fechaMatriculacionEstimada(x.matricula)?.estimada ?? null)
      : null
  const fecha = compania ?? declarada ?? estimada
  if (fecha === null) return { estado: 'desconocida', motivo: 'sin_matriculacion' }
  const fuente: FuenteMatriculacion = compania !== null ? 'compania' : declarada !== null ? 'declarada' : 'estimada'

  const itv = proximaItv({ fechaMatriculacion: fecha, perfil, hoy: x.hoy })
  if (itv === null) return { estado: 'desconocida', motivo: 'sin_matriculacion' }
  const diasHasta = diasEntre(itv.fecha, x.hoy)
  return {
    estado: 'calculada',
    fecha: itv.fecha,
    fiabilidad: itv.fiabilidad,
    fuente,
    diasHasta,
    pronto: diasHasta <= DIAS_PRONTO_FLOTA,
    periodicidadMeses: itv.periodicidadMeses,
    calculadaComoTurismo: perfil === 'turismo',
  }
}

/**
 * El vencimiento del seguro de un vehículo de la flota (ya en vigor según
 * `WHERE_CARTERA_EN_VIGOR`). Fecha ya corregida por recibos
 * (`vencimientoConRecibos`) por quien llama.
 *  - `sin_fecha` → la compañía no la ha informado: «no lo sabemos», no «vigente».
 *  - `renovacion_sin_confirmar` → en vigor según la compañía pero con la fecha
 *    pasada: el portal NO lo llama vencido (Mapfre tarda meses en mandar la
 *    renovación; ver `renovacionSinConfirmar` en `cartera-lectura.ts`).
 */
export type VencimientoFlota = {
  fecha: string | null
  diasHasta: number | null
  estado: 'sin_fecha' | 'renovacion_sin_confirmar' | 'pronto' | 'vigente'
}

export function vencimientoFlota(fecha: string | null, hoy: Date): VencimientoFlota {
  const f = diaValido(fecha)
  if (f === null) return { fecha: null, diasHasta: null, estado: 'sin_fecha' }
  const diasHasta = diasEntre(f, hoy)
  if (diasHasta < 0) return { fecha: f, diasHasta, estado: 'renovacion_sin_confirmar' }
  return { fecha: f, diasHasta, estado: diasHasta <= DIAS_PRONTO_FLOTA ? 'pronto' : 'vigente' }
}

export type VehiculoFlotaEntrada = {
  polizaId: string
  ramo: string
  compania: string
  matricula: string | null
  /** Marca/modelo/matrícula ya compuestos (`describirBien().cosa`). */
  cosa: string | null
  numeroPoliza: string | null
  /** `YYYY-MM-DD…` ya corregido por recibos. */
  fechaVencimiento: string | null
  matriculacionCompania: string | null
  /** La del ancla `portal_bien` de la empresa, por matrícula. */
  matriculacionDeclarada: string | null
}

export type VehiculoFlota = {
  polizaId: string
  /** Lo que identifica el vehículo: matrícula > marca/modelo > nº de póliza (último recurso, regla del portal). */
  etiqueta: string
  matricula: string | null
  clave: string | null
  compania: string
  ramo: string
  vencimiento: VencimientoFlota
  itv: ItvVehiculo
  matriculacionDeclarada: string | null
}

/**
 * Grupo de orden: 0 = algo pide atención ya (ITV o vencimiento en ≤30 días, o
 * renovación sin confirmar); 1 = algo NO lo sabemos (sin ITV calculable o sin
 * vencimiento): no se entierra al final como si estuviera bien; 2 = el resto.
 */
function grupo(v: VehiculoFlota): 0 | 1 | 2 {
  const itvPronto = v.itv.estado === 'calculada' && v.itv.pronto
  if (itvPronto || v.vencimiento.estado === 'pronto' || v.vencimiento.estado === 'renovacion_sin_confirmar') return 0
  if (v.itv.estado === 'desconocida' || v.vencimiento.estado === 'sin_fecha') return 1
  return 2
}

function diasClave(v: VehiculoFlota): number {
  const d = [v.vencimiento.diasHasta, v.itv.estado === 'calculada' ? v.itv.diasHasta : null].filter(
    (n): n is number => n !== null,
  )
  return d.length === 0 ? Number.MAX_SAFE_INTEGER : Math.min(...d)
}

export function vehiculosDeFlota(entradas: readonly VehiculoFlotaEntrada[], hoy: Date): VehiculoFlota[] {
  const filas = entradas
    .filter((e) => esRamoFlota(e.ramo))
    .map((e): VehiculoFlota => {
      const matricula = e.matricula?.trim() ? e.matricula.trim() : null
      const etiqueta =
        matricula ?? (e.cosa?.trim() ? e.cosa.trim() : null) ?? (e.numeroPoliza ? `Póliza nº ${e.numeroPoliza}` : 'Vehículo sin identificar')
      return {
        polizaId: e.polizaId,
        etiqueta,
        matricula,
        clave: claveVehiculo(matricula),
        compania: e.compania,
        ramo: e.ramo,
        vencimiento: vencimientoFlota(e.fechaVencimiento, hoy),
        itv: itvDeVehiculo({
          ramo: e.ramo,
          matricula,
          matriculacionCompania: e.matriculacionCompania,
          matriculacionDeclarada: e.matriculacionDeclarada,
          hoy,
        }),
        matriculacionDeclarada: diaValido(e.matriculacionDeclarada),
      }
    })
  return filas.sort((a, b) => grupo(a) - grupo(b) || diasClave(a) - diasClave(b) || a.etiqueta.localeCompare(b.etiqueta, 'es'))
}
