'use client'

// El COTIZADOR de moto (07/10/2026: extraído de `MotoNuevo.tsx`, que ahora solo lo re-exporta).
// Dos modos:
//   - COMPLETO (por defecto): la pantalla `moto-nuevo` («➕ Presupuestar» de la ficha) y retarificar una póliza de
//     moto. Pinta catálogo, matrícula, figuras… como siempre.
//   - `embebido` (bloque «Pedir precio» de la oportunidad): el vehículo y las figuras salen del RIESGO (Datos del
//     vehículo / Intervinientes, que se editan arriba). Aquí solo se piden las condiciones de la cotización: fecha
//     de efecto, carné/experiencia si faltan, km/garaje, seguro actual/historial y estado civil. Si arriba se está
//     editando o el riesgo cambia, el bloque padre (`oportunidad/[id]/PedirPrecioMoto.tsx`) lo bloquea o lo recarga.
//
// La pantalla de presupuesto de MOTO SIN PÓLIZA («oportunidad nueva»), DENTRO
// de `/correduria` — mismo diseño que el resto del panel (`components/ui.tsx`).
//
// Es la hermana de `.../auto-nuevo/AutoNuevo.tsx`, con dos diferencias reales
// (docs/CODEOSCOPIC-API-PORTAL.md § «El ramo MOTO, contrato completo»):
//   - el combustible (`engine`) es un ENUM CERRADO en moto (Gasolina/Diésel/
//     Otros), no un catálogo a consultar como en auto;
//   - el vendor exige la EXPERIENCIA de conducción, que auto no tiene. Se
//     supone «ya ha llevado esta moto» (el caso normal) y se enseña como
//     supuesto corregible; si el corredor marca «otra moto», hace falta el
//     código Base7 de esa moto anterior, que se teclea a mano (no hay
//     ninguna ficha de la que sacarlo).

import { useEffect, useRef, useState } from 'react'
import { Flag, FlaskConical } from 'lucide-react'
import RecotizarIgualmente from '@/components/RecotizarIgualmente'
import { btnStyle, Badge, cardStyle, CardHeader } from '@/components/ui'
import ListaPrecios from '../../../ListaPrecios'
import FiltroGarantias from '../../../FiltroGarantias'
import { cotizacionIdDe } from '@/lib/presupuesto-asegura'
import { ConIcono } from '../../../iconos'
import type { Opcion, Reparo, Supuesto, Precio, Fallo, ConsumoPuerto } from '@/lib/moto-nuevo-asegura'
import type { Compania } from '@/lib/companias-asegura'
import { digitosPolizaSospechosos } from '@/lib/poliza-digitos-sospechosos'
import { codigoCompania, historialDeclarado, type AnteriorParaTarificar } from '@/lib/seguro-anterior'
import { fechaMatriculacionEstimada } from '@central/module-seguros/matricula'
import { garajePorDefecto } from '@/lib/supuestos-presupuesto'
import { planPrecargaVehiculo, previoPuedeMandar, sigueSinConfirmar } from '@/lib/correduria/precarga-vehiculo'
import { AYUDA_FECHA_EFECTO, limitesFechaEfecto } from '@/lib/correduria/fecha-efecto'
import { KM_ANUALES_SUPUESTOS, kilometrosDesdeTexto, origenesHistorialManual, type DatosVehiculoRiesgo } from '@central/module-seguros'
import { pedirCatalogo, pedirCotizacionMoto, pedirTarificacionGuardadaMoto } from './acciones'
import type { TarificacionNuevaGuardada, VehiculoGuardado } from '@/lib/retarificar-asegura'
import { pedirCotizacion } from '../../../poliza/[id]/retarificar/acciones'
import { Emision } from '../../../poliza/[id]/retarificar/emision'
import { SelectorBuscable } from '../../../SelectorBuscable'
import EnlaceOportunidad from '../../../EnlaceOportunidad'
import type { RolExtra, VarianteNueva } from '../../../oportunidad/[id]/variante'
import {
  PERSONA_VACIA,
  correccionesDeFiguras,
  figuraCompleta,
  type PersonaForm,
} from '../../../oportunidad/[id]/figuras-form'
import { BloqueFigura } from '../../../oportunidad/[id]/BloqueFigura'
import { NotaVariante } from '../../../oportunidad/[id]/NotaVariante'
import { FallosTarificacion } from '../../../FallosTarificacion'
import { AvisoBonusSupuesto, PanelSeguroImputado, eleccionParaCotizar } from '../../../SeguroAnteriorImputado'
import { describirCandidata, type SeguroAnteriorImputado } from '@/lib/correduria/seguro-anterior-imputado'
import type { OtroVehiculo } from '@/lib/correduria/pack-otro-vehiculo'
import { primaActualParaLista } from '@/lib/correduria/competencia-oportunidad'
import PackVehiculos from '../PackVehiculos'

const input: React.CSSProperties = {
  padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 14, minHeight: 44, background: 'var(--surface)', color: 'var(--text)', width: '100%',
}

/** `engine` es un enum cerrado en moto: no hace falta consultar ningún catálogo. */
const MOTORES: { id: string; nombre: string }[] = [
  { id: 'Gasoline', nombre: 'Gasolina' },
  { id: 'Diesel', nombre: 'Diésel' },
  { id: 'Others', nombre: 'Otros' },
]

/** Los campos que el corredor puede teclear cuando la ficha no los trae. */
const CAMPOS_A_MANO: Record<string, { etiqueta: string; tipo: string } | undefined> = {
  dni: { etiqueta: 'DNI', tipo: 'text' },
  nombre: { etiqueta: 'Nombre', tipo: 'text' },
  apellido1: { etiqueta: 'Primer apellido', tipo: 'text' },
  telefono: { etiqueta: 'Móvil', tipo: 'tel' },
  fechaNacimiento: { etiqueta: 'Fecha de nacimiento', tipo: 'date' },
  nacionalidad: { etiqueta: 'Nacionalidad (código ISO de 3 letras, p. ej. ESP)', tipo: 'text' },
  fechaCarnet: { etiqueta: 'Fecha del carnet', tipo: 'date' },
}

/**
 * Los papeles que moto admite en otra ficha. SIN conductor ocasional: el vendor no lo admite en
 * moto (entrega 2 del diseño, 29/09/2026), así que aunque el riesgo lo traiga no se pinta ni viaja.
 */
const ROLES_MOTO: readonly RolExtra[] = ['propietario', 'conductor_habitual']

type Resultado =
  | { estado: 'idle' }
  | { estado: 'cotizando' }
  | {
      estado: 'ok'
      coste: string
      restantesHoy: number | null
      simulado: boolean
      avisoSimulacion: string | null
      resumen: string
      precios: Precio[]
      /** `null` = retomada de una cotización que no guardó sus fallos (no es «ninguno falló»). */
      fallos: Fallo[] | null
      /** `null` = cotización recuperada: los supuestos no se guardan con ella (30/09/2026). */
      supuestos: Supuesto[] | null
      /** Qué pasó con la copia guardada: su `cotizacionId` es lo que permite emitir. */
      guardado?: unknown
      /** Seguro anterior declarado y si el bonus va SUPUESTO (03/10/2026). `null`/ausente = no consta. */
      seguroAnterior?: SeguroAnteriorImputado | null
    }
  | { estado: 'faltan'; faltan: Reparo[] }
  | { estado: 'error'; mensaje: string; tope?: boolean; gastoDesconocido: boolean; proyectoVigente?: boolean; duplicado?: boolean }

/**
 * Modo PÓLIZA (retarificar una moto de la cartera, 23/09/2026): la misma
 * pantalla, pero la matrícula y el historial (compañía anterior, nº, años) salen
 * de la póliza en asegura (`precalificarMoto`), así que no se teclean, y el
 * precio se pide por `POST /retarificar` de esa póliza.
 */
export type PolizaMoto = {
  id: string
  matricula: string | null
  /** Aproximada, del vendor por la matrícula. `null` = no se ha podido saber: se teclea. */
  fechaMatriculacion: string | null
  /** Qué se declara como seguro anterior, para enseñarlo (la aseguradora y el nº). */
  anterior: string
}

export default function CotizadorMoto({
  embebido = false,
  bloqueo = null,
  onCotizando,
  onCotizado,
  clienteId,
  etiquetaCliente,
  faltanInicial,
  garajes,
  civiles,
  municipios,
  municipiosMotivo,
  estadoCivilMoto,
  consumo,
  simulacion,
  companias,
  poliza = null,
  otroVehiculo = null,
  variante = null,
  datosRiesgo: datosRiesgoProp = null,
  anterior = null,
  anteriorAmbiguo = null,
  seguroImputado = null,
}: {
  /**
   * Modo OPORTUNIDAD (07/10/2026): vehículo y figuras del riesgo, sin catálogo ni formularios de figuras; solo las
   * condiciones de la cotización. `datosRiesgo` y `variante` son entonces OBLIGATORIOS (los lee el bloque padre).
   */
  embebido?: boolean
  /** Motivo por el que AHORA no se puede pedir precio (datos del riesgo en edición, recargando…). `null` = nada lo impide. */
  bloqueo?: string | null
  /** Avisa al bloque padre de que hay una cotización EN VUELO (para no dejar editar el riesgo mientras se paga). */
  onCotizando?: (enVuelo: boolean) => void
  /** Embebido: la cotización quedó GUARDADA (su id); el padre relee el riesgo y la abre en «Presupuestos de este riesgo». */
  onCotizado?: (tarificacionId: string) => void
  /** Vehículo NUEVO (03/10/2026): la póliza de motor del cliente que asegura propone como seguro anterior. */
  seguroImputado?: SeguroAnteriorImputado | null
  /**
   * Los datos del vehículo del RIESGO (30/09/2026, `info_riesgo.datosVehiculo`): se PRECARGAN aquí y lo que se
   * use al pedir precio se anota de vuelta. Prioridad: variante retomada (`?tarificacion=`) > riesgo. Esta
   * pantalla no guarda borrador local. `null` = sin riesgo o sin datos, o retarificando una póliza.
   */
  datosRiesgo?: DatosVehiculoRiesgo | null
  poliza?: PolizaMoto | null
  /** Pack coche + moto (03/10/2026): la otra oportunidad del cliente (el coche). `null` = no se han podido leer sus oportunidades. */
  otroVehiculo?: OtroVehiculo | null
  /** El seguro que tiene hoy, leído de su póliza y guardado en la oportunidad (29/09/2026). */
  anterior?: AnteriorParaTarificar | null
  /** Nº de oportunidades de moto abiertas con datos cuando no se sabe cuál: no se precarga ninguna. */
  anteriorAmbiguo?: number | null
  /** Variante de un riesgo (29/09/2026): la tarificación se cuelga de su oportunidad. */
  variante?: VarianteNueva | null
  clienteId: string
  etiquetaCliente: string
  /** `null` = no se ha podido precalificar la persona · `[]` = revisado, nada falta. */
  faltanInicial: Reparo[] | null
  garajes: Opcion[]
  civiles: Opcion[]
  municipios: Opcion[] | null
  municipiosMotivo: string | null
  estadoCivilMoto: Opcion | null
  consumo: ConsumoPuerto
  simulacion: boolean
  /** `null` = no se ha podido leer el directorio de compañías: se teclea el código a mano. */
  companias: Pick<Compania, 'codigoDgs' | 'nombreComun' | 'nombreCima'>[] | null
}) {
  // Retarificando una PÓLIZA mandan las de la póliza: el riesgo no precarga nada.
  const datosRiesgo = poliza === null ? datosRiesgoProp : null
  // ── Vehículo: marca → modelo → combustible → versión, todo del catálogo ────
  const [marcas, setMarcas] = useState<Opcion[]>([])
  const [modelos, setModelos] = useState<Opcion[]>([])
  const [versiones, setVersiones] = useState<Opcion[]>([])
  // Embebido: la moto ES la del riesgo (ids del catálogo elegidos en «Datos del vehículo»); aquí no se cambia.
  const [marcaId, setMarcaId] = useState(embebido ? datosRiesgoProp?.marcaId ?? '' : '')
  const [modeloId, setModeloId] = useState(embebido ? datosRiesgoProp?.modeloId ?? '' : '')
  const [motorId, setMotorId] = useState(embebido ? datosRiesgoProp?.motorId ?? '' : '')
  const [codigoVehiculo, setCodigoVehiculo] = useState(embebido ? datosRiesgoProp?.codigoVehiculo ?? '' : '')
  const [cargando, setCargando] = useState<string | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)

  useEffect(() => {
    // Embebido no pinta el catálogo: no se piden las marcas.
    if (embebido) return
    let vivo = true
    setCargando('marcas')
    void catalogo('tipo=marcas-moto')
      .then((lista) => {
        if (vivo) setMarcas(lista)
      })
      .catch((e: Error) => {
        if (vivo) setFallo(e.message)
      })
      .finally(() => {
        if (vivo) setCargando(null)
      })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [matricula, setMatricula] = useState(poliza?.matricula ?? datosRiesgo?.matricula ?? '')
  const [matriculacion, setMatriculacion] = useState(poliza?.fechaMatriculacion ?? datosRiesgo?.fechaMatriculacion ?? '')
  // Igual que en auto: la fecha se deduce de la matrícula (Avant2, gratis; o la
  // serie nacional mientras tanto). `true` = la puso la estimación, no el corredor.
  const [matriculacionEstimada, setMatriculacionEstimada] = useState(false)
  const [fuenteMatriculacion, setFuenteMatriculacion] = useState<'avant2' | 'serie' | null>(null)
  // Por defecto en GARAJE, nunca en la calle, como en auto (Alberto, 29/09/2026; sustituye a «vía
  // pública»): es un dato de EMISIÓN, no de precio — viaja como supuesto y se confirma al emitir.
  const [kmAnuales, setKmAnuales] = useState(datosRiesgo?.kmAnuales != null ? String(datosRiesgo.kmAnuales) : '')
  const garajeDelRiesgo = datosRiesgo?.garaje && garajes.some((g) => g.id === datosRiesgo.garaje) ? datosRiesgo.garaje : null
  const [garaje, setGaraje] = useState(() => garajeDelRiesgo ?? garajePorDefecto(garajes)?.id ?? '')
  // ¿Lo ha elegido el corredor? El garaje de arriba es un defecto, no una elección: la moto
  // guardada puede traer su garaje, y sin esto retomar caía en silencio al defecto (29/09/2026).
  const garajeElegido = useRef(garajeDelRiesgo !== null)
  const [nota, setNota] = useState('')
  // ── Figuras de la variante (29/09/2026) ─────────────────────────────────────
  // Propietario y conductor habitual en OTRA ficha: sus datos los pone asegura desde esa ficha y
  // aquí solo se pide el estado civil y lo que falte (el carné de moto del conductor incluido).
  // Retarificando una PÓLIZA van las personas de la póliza: no aplica.
  const figs: Partial<Record<RolExtra, string>> = {}
  if (variante && poliza === null) {
    for (const rol of ROLES_MOTO) if (variante.figuras[rol]) figs[rol] = variante.figuras[rol]
  }
  const ocasionalIgnorado = variante !== null && poliza === null && !!variante.figuras.conductor_ocasional
  const [figCorr, setFigCorr] = useState<Record<RolExtra, PersonaForm>>({
    propietario: PERSONA_VACIA,
    conductor_habitual: PERSONA_VACIA,
    conductor_ocasional: PERSONA_VACIA,
  })
  const [estadoCivilId, setEstadoCivilId] = useState(estadoCivilMoto?.id ?? '')
  const listaMunicipios = municipios ?? []
  const [municipioId, setMunicipioId] = useState(listaMunicipios.length === 1 ? listaMunicipios[0].id : '')
  const [experiencias, setExperiencias] = useState<Opcion[]>([])
  const [experienciaConduccion, setExperienciaConduccion] = useState('')
  const [motoAnteriorCodigo, setMotoAnteriorCodigo] = useState('')
  const [correcciones, setCorrecciones] = useState<Record<string, string>>({})
  // Vacía = el defecto del servidor (DIAS_EFECTO_DEFECTO), para que el precio siga valiendo al emitir.
  const [fechaEfecto, setFechaEfecto] = useState('')
  const limitesEfecto = limitesFechaEfecto()
  const [resultado, setResultado] = useState<Resultado>({ estado: 'idle' })

  // ── Precarga desde el riesgo (30/09/2026; PARCIAL desde el 07/10/2026) ──────────────────────────────────
  // Prioridad: variante RETOMADA (`?tarificacion=`, lo pagado manda) > riesgo. Igual que AutoNuevo
  // (`lib/correduria/precarga-vehiculo.ts`): la cascada marca → modelo → combustible → versión se precarga hasta donde
  // llegue el riesgo y el texto sin id va a la caja de búsqueda como pista (nunca como selección).
  const retomada = (variante?.tarificacionId ?? null) !== null
  const plan = planPrecargaVehiculo(datosRiesgo, retomada)
  const riesgoManda = plan.completa
  const avisoDelRiesgo = 'precargado · sin confirmar'
  useEffect(() => {
    // Embebido: los ids ya vienen del riesgo (arriba); no hay cascada que poblar.
    const c = embebido ? null : plan.cascada
    if (!c) return
    let vivo = true
    void (async () => {
      try {
        setCargando('modelos')
        const ms = await catalogo(`tipo=modelos-moto&marcaId=${encodeURIComponent(c.marcaId)}`)
        if (!vivo) return
        setMarcaId(c.marcaId)
        setModelos(ms)
        if (c.motorId && MOTORES.some((m) => m.id === c.motorId)) setMotorId(c.motorId)
        if (!c.modeloId || !ms.some((m) => m.id === c.modeloId)) return
        setModeloId(c.modeloId)
        if (!c.motorId) return
        setCargando('versiones')
        const vs = await catalogo(
          `tipo=versiones-moto&marcaId=${encodeURIComponent(c.marcaId)}` +
            `&modeloId=${encodeURIComponent(c.modeloId)}&motor=${encodeURIComponent(c.motorId)}`,
        )
        if (!vivo) return
        setVersiones(vs)
        if (c.codigoVehiculo && vs.some((x) => x.id === c.codigoVehiculo)) setCodigoVehiculo(c.codigoVehiculo)
      } catch {
        // Precargar el vehículo es una comodidad: si el catálogo falla, se elige a mano.
      } finally {
        if (vivo) setCargando(null)
      }
    })()
    return () => { vivo = false }
    // Una vez, al abrir la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Retomar la última tarificación ya pagada (28/09/2026) ────────────────────
  // La parrilla vivía solo en memoria: al cerrar la pestaña no había forma de preparar el
  // presupuesto ni de emitir sin volver a pagar. Gratis: solo lee lo ya guardado.
  const [guardada, setGuardada] = useState<TarificacionNuevaGuardada | null>(null)
  // La moto de la última petición de precio (28/09/2026, Alberto: «ya tienes los datos»): se precarga
  // para volver a pedir precio corrigiendo solo lo que cambió (garaje, km…). Vale aunque sus precios
  // hayan caducado: la moto no caduca. Solo rellena lo que el corredor aún no ha tocado.
  const [previo, setPrevio] = useState<VehiculoGuardado | null>(null)
  const [usarPrevio, setUsarPrevio] = useState(false)
  useEffect(() => {
    // Embebido: la moto es la del riesgo y las variantes ya pedidas están en «Presupuestos de este riesgo»: la
    // última tarificación NO precarga nada aquí (sería cotizar con la moto anterior).
    if (poliza !== null || embebido) return
    let vivo = true
    pedirTarificacionGuardadaMoto({ clienteId, oportunidadId: variante?.oportunidadId ?? null, tarificacionId: variante?.tarificacionId ?? null })
      .then((r) => {
        if (!vivo || r.estado !== 'ok') return
        if (!r.guardada.caducada && r.guardada.precios.length > 0) setGuardada(r.guardada)
        const v = r.guardada.vehiculo
        if (!v) return
        // 07/10/2026: si el riesgo trae OTRA moto (otro código, o marca/modelo sin poder probar que sea la misma), la moto de
        // la última tarificación no manda: ni su versión ni sus datos (matrícula, km, garaje) son de esta moto.
        if (!previoPuedeMandar(datosRiesgo, v.codigoVehiculo, retomada)) return
        // Con el vehículo del riesgo ya cargado (y sin variante retomada) la última tarificación no lo pisa.
        if (!riesgoManda) {
          setPrevio(v)
          setUsarPrevio(true)
          setCodigoVehiculo((c) => (retomada ? v.codigoVehiculo : c || v.codigoVehiculo))
        }
        if (v.matricula) setMatricula((m) => (retomada ? v.matricula! : m || v.matricula!))
        if (v.fechaMatriculacion) {
          setMatriculacion((f) => (retomada ? v.fechaMatriculacion! : f || v.fechaMatriculacion!))
          setMatriculacionEstimada(false)
        }
        // Los km solo si se DECLARARON: la media supuesta no se convierte en un dato del cliente.
        if (v.kmAnuales !== null && v.kmAnuales !== KM_ANUALES_SUPUESTOS) {
          setKmAnuales((k) => (retomada ? String(v.kmAnuales) : k || String(v.kmAnuales)))
        }
        // El garaje con el que se pidió, si sigue en el catálogo y el corredor no ha elegido otro.
        if (v.garaje && (retomada || !garajeElegido.current) && garajes.some((g) => g.id === v.garaje)) setGaraje(v.garaje)
      })
      .catch(() => {})
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, poliza, variante?.oportunidadId, variante?.tarificacionId])
  function elegirOtraMoto() {
    setUsarPrevio(false)
    setCodigoVehiculo('')
  }
  const retomar = (g: TarificacionNuevaGuardada) =>
    setResultado({
      estado: 'ok',
      coste: '0 € (retomada, ya estaba pagada)',
      restantesHoy: null,
      simulado: false,
      avisoSimulacion: null,
      resumen: `Tarificación del ${new Date(g.creadaEn).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' })}${g.fechaEfecto ? ` · efecto ${g.fechaEfecto.split('-').reverse().join('/')}` : ''}`,
      precios: g.precios,
      fallos: g.fallos,
      supuestos: null,
      guardado: { estado: 'guardada', cotizacionId: g.cotizacionId },
    })

  // ── ¿Tiene seguro EN VIGOR ahora mismo? (fallo real de Alberto, 18/09/2026) ──
  // Igual que en auto: sin esto la compañía cotiza «de calle» y el precio no es
  // confirmable como real. Opt-in, apagado por defecto.
  // Precargado del seguro que tiene hoy (29/09/2026): lo leído de su póliza al abrir la oportunidad.
  // Solo lo que el documento DICE; lo que no, se queda vacío y se pide como siempre.
  const sa = anterior?.seguroAnterior ?? null
  const [tieneSeguroActual, setTieneSeguroActual] = useState(anterior !== null)
  const [companiaActualCodigo, setCompaniaActualCodigo] = useState(() =>
    anterior && companias ? codigoCompania(companias, { codigoDgs: sa?.codigoDgs ?? null, nombre: anterior.aseguradora }) ?? '' : '')
  const [companiaActualLibre, setCompaniaActualLibre] = useState(() => (companias === null ? sa?.codigoDgs ?? '' : ''))
  const [polizaActualDigitos, setPolizaActualDigitos] = useState(() => anterior?.numeroPoliza?.trim() ?? '')
  const [matriculaAnterior, setMatriculaAnterior] = useState('')
  // Vehículo NUEVO (03/10/2026): qué póliza suya se declara como seguro anterior si no se teclea a mano.
  const [eleccionAnterior, setEleccionAnterior] = useState(() => seguroImputado?.elegida?.id ?? '')
  // Los años NO se teclean (29/09/2026, Alberto): se declara el máximo y la compañía aplica el
  // bonus real contrastando el nº de póliza con SINCO. Lo leído de su póliza manda sobre el máximo.
  const historial = historialDeclarado(sa)
  const [aniosAsegurado, setAniosAsegurado] = useState(String(historial.aniosAsegurado))
  const [aniosEnCompania, setAniosEnCompania] = useState(String(historial.aniosEnCompania))
  const [aniosSinSiniestros, setAniosSinSiniestros] = useState(String(historial.aniosSinSiniestros))
  const [siniestrosUltimos5, setSiniestrosUltimos5] = useState(historial.siniestrosUltimos5 === null ? '' : String(historial.siniestrosUltimos5))

  useEffect(() => {
    void catalogo('tipo=experiencia-moto')
      .then(setExperiencias)
      .catch(() => {
        // No bloquea la pantalla: sin catálogo se cotiza igual con el supuesto
        // por defecto («ya ha llevado esta moto») que ya calcula asegura.
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function catalogo(qs: string): Promise<Opcion[]> {
    const r = await pedirCatalogo(Object.fromEntries(new URLSearchParams(qs)))
    if (r.estado !== 'ok') throw new Error(r.mensaje)
    return r.opciones
  }

  async function alElegirMarca(id: string) {
    setUsarPrevio(false)
    setMarcaId(id)
    setModeloId('')
    setCodigoVehiculo('')
    setModelos([])
    setVersiones([])
    if (!id) return
    setCargando('modelos')
    try {
      setModelos(await catalogo(`tipo=modelos-moto&marcaId=${encodeURIComponent(id)}`))
    } catch (e) {
      setFallo((e as Error).message)
    } finally {
      setCargando(null)
    }
  }

  function alElegirModelo(id: string) {
    setModeloId(id)
    setCodigoVehiculo('')
    setVersiones([])
    if (id && motorId) void cargarVersiones(marcaId, id, motorId)
  }

  function alElegirMotor(id: string) {
    setMotorId(id)
    setCodigoVehiculo('')
    setVersiones([])
    if (id && modeloId) void cargarVersiones(marcaId, modeloId, id)
  }

  async function cargarVersiones(marca: string, modelo: string, motor: string) {
    setCargando('versiones')
    setFallo(null)
    try {
      setVersiones(
        await catalogo(
          `tipo=versiones-moto&marcaId=${encodeURIComponent(marca)}&modeloId=${encodeURIComponent(modelo)}&motor=${encodeURIComponent(motor)}`,
        ),
      )
    } catch (e) {
      setFallo((e as Error).message)
    } finally {
      setCargando(null)
    }
  }

  // Embebido: los CUATRO ids del catálogo, o asegura no puede releer la versión para cruzarla con el carné.
  const faltaVersion = !codigoVehiculo || (embebido && (!marcaId || !modeloId || !motorId))
  const faltaGaraje = !garaje
  // Km al año: vacío = no se ha preguntado (asegura supone la media y lo marca como supuesto). Se parsea con
  // `kilometrosDesdeTexto`, no con `Number()`: «5.000» es 5000, no 5.
  const kmLeidos = kilometrosDesdeTexto(kmAnuales)
  const kmInvalido = kmAnuales.trim() !== '' && kmLeidos === null
  // Tomador EMPRESA (29/09/2026): va con su CIF, sin estado civil, y conduce otra ficha del riesgo.
  const tomadorEmpresa = variante?.empresas.tomador === true
  const faltaCivil = !estadoCivilId && !tomadorEmpresa
  // Con un conductor habitual en otra ficha, el «falta conductor» de la precalificación ya está cubierto.
  const faltanTomador = (faltanInicial ?? []).filter((f) => !(f.campo === 'conductor' && figs.conductor_habitual))
  const faltaMunicipio = !municipioId
  // En modo póliza la matrícula la pone asegura desde la póliza: no se exige aquí.
  // Vehículo NUEVO (03/10/2026): la matrícula ya no es obligatoria — un vehículo recién comprado se tarifica
  // antes de matricularse con la versión y la fecha de matriculación PREVISTA (≤ 90 días). Lo valida asegura.
  const faltaMatricula = false
  const faltaMatriculacion = !matriculacion
  const faltaMotoAnterior = experienciaConduccion === 'OtherMotorcycle' && !motoAnteriorCodigo.trim()
  const estimacion = poliza ? null : fechaMatriculacionEstimada(matricula, hoyLocal())

  // Hermano del efecto de `AutoNuevo.tsx`: con cada matrícula tecleada se
  // consulta la fecha a Avant2 y, mientras tanto o si no responde, vale la
  // estimación por la serie nacional. Nunca pisa una fecha tecleada por el
  // corredor, y en modo póliza no actúa (la fecha sale de la póliza).
  // Embebido: la fecha es la del riesgo; si falta, se pone en «Datos del vehículo», no se estima aquí en silencio.
  const puedeRellenarFecha = !poliza && !embebido && (matriculacion === '' || matriculacionEstimada)
  useEffect(() => {
    if (!puedeRellenarFecha) return
    const placa = matricula.trim()
    if (placa === '') {
      if (matriculacionEstimada) {
        setMatriculacion('')
        setMatriculacionEstimada(false)
        setFuenteMatriculacion(null)
      }
      return
    }
    const local = fechaMatriculacionEstimada(placa, hoyLocal())
    setMatriculacion(local?.estimada ?? '')
    setMatriculacionEstimada(local !== null)
    setFuenteMatriculacion(local ? 'serie' : null)
    if (placa.length < 6) return
    let vivo = true
    const t = setTimeout(async () => {
      try {
        const [f] = await catalogo(`tipo=fecha-matriculacion-moto&matricula=${encodeURIComponent(placa)}`)
        if (!vivo || !f) return
        setMatriculacion(f.id)
        setMatriculacionEstimada(true)
        setFuenteMatriculacion('avant2')
      } catch {
        // Avant2 no ha respondido: se queda la estimación por la serie.
      }
    }, 500)
    return () => {
      vivo = false
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matricula])

  const aMano = faltanTomador.filter((f) => f.campo === 'sexo' || CAMPOS_A_MANO[f.campo])
  const aManoSinRellenar = aMano.filter((f) => !(correcciones[f.campo] ?? '').trim())
  const huerfanos = faltanTomador.filter(
    // En modo póliza la matrícula NO se resuelve en pantalla (la pone asegura
    // desde la póliza): si falta, es un hueco de la ficha y se enseña como tal.
    (f) =>
      !(RESUELTOS_EN_PANTALLA.has(f.campo as string) && !(poliza && f.campo === 'matricula')) &&
      !CAMPOS_A_MANO[f.campo],
  )

  const companiaActualElegida = companiaActualCodigo || companiaActualLibre.trim()
  // En modo póliza la tarjeta del toggle no se pinta, así que se queda en false.
  const faltaAnios = aniosAsegurado.trim() === '' || aniosEnCompania.trim() === '' || aniosSinSiniestros.trim() === ''
    || (Number(aniosSinSiniestros) < 5 && aniosSinSiniestros !== aniosAsegurado && siniestrosUltimos5.trim() === '')
  const faltaHistorial =
    tieneSeguroActual &&
    (!companiaActualElegida ||
      !polizaActualDigitos.trim() ||
      aniosAsegurado.trim() === '' ||
      aniosEnCompania.trim() === '' ||
      aniosSinSiniestros.trim() === '')

  // Una figura en otra ficha sin estado civil, o con un hueco de su ficha sin teclear, no cotiza.
  const faltaFigura = ROLES_MOTO.some((rol) => figs[rol] && !figuraCompleta(figCorr[rol], variante?.faltan[rol] ?? null, variante?.empresas[rol] ?? false))

  const cotizando = resultado.estado === 'cotizando'
  const consumoPermite = consumo.estado === 'ok' ? consumo.veredicto.permitido : consumo.estado === 'no_disponible'
  const faltaAlgo =
    faltaVersion || faltaGaraje || faltaCivil || faltaMunicipio || faltaMatricula || faltaMatriculacion ||
    faltaMotoAnterior || aManoSinRellenar.length > 0 || faltaHistorial || kmInvalido || faltaFigura
    // En modo póliza, un hueco que no se arregla aquí (compañía o nº anterior,
    // CP de circulación, matrícula) también apaga el botón: el servidor lo
    // rechazaría igual, y el botón encendido prometería un precio que no llega.
    || (poliza !== null && huerfanos.length > 0)

  const puedePulsar = !cotizando && !faltaAlgo && bloqueo === null && (simulacion || consumoPermite)

  async function cotizar() {
    await pedirPrecio(false)
  }

  /** `forzarNuevo` SOLO tras «Descartar y pedir precio de cero» (modo póliza). */
  // Guarda SÍNCRONA contra el doble clic: cada consulta cuesta 0,50€ y no es idempotente. El estado de React llega
  // tarde (un segundo clic en el mismo tick ve aún `cotizando`=false); el ref no.
  const cotizandoEnVuelo = useRef(false)
  async function pedirPrecio(forzarNuevo: boolean, forzar = false) {
    if (cotizandoEnVuelo.current) return
    cotizandoEnVuelo.current = true
    try {
      onCotizando?.(true)
      await pedirPrecioSinGuarda(forzarNuevo, forzar)
    } catch (e) {
      // Una excepción (red, timeout, fallo del servidor) NO es una respuesta de error: sin esto la pantalla se
      // quedaba en «cotizando» y el cobro, desconocido, no se avisaba. Se desconoce si se cobró → gastoDesconocido.
      setResultado({
        estado: 'error',
        mensaje: `No se ha podido completar la consulta (${e instanceof Error ? e.message : 'error desconocido'}).`,
        gastoDesconocido: true,
      })
    } finally {
      cotizandoEnVuelo.current = false
      onCotizando?.(false)
    }
  }

  async function pedirPrecioSinGuarda(forzarNuevo: boolean, forzar: boolean) {
    // Embebido: el riesgo se está editando o recargando → no se paga con datos que van a cambiar.
    if (bloqueo !== null) return
    setResultado({ estado: 'cotizando' })
    const correccionesFinal: Record<string, unknown> = {
      ...correcciones,
      ...(experienciaConduccion === 'OtherMotorcycle' ? { motoAnteriorCodigo: motoAnteriorCodigo.trim() } : {}),
      ...(kmLeidos !== null ? { kmAnuales: kmLeidos } : {}),
      ...(fechaEfecto !== '' ? { fechaEfecto } : {}),
    }
    if (tieneSeguroActual) {
      correccionesFinal.aseguradoAntes = true
      correccionesFinal.companiaAnteriorCodigo = companiaActualElegida
      correccionesFinal.polizaAnterior = polizaActualDigitos.trim()
      if (matriculaAnterior.trim()) correccionesFinal.matriculaAnterior = matriculaAnterior.trim()
      correccionesFinal.aniosAsegurado = Number(aniosAsegurado)
      correccionesFinal.aniosEnCompania = Number(aniosEnCompania)
      correccionesFinal.aniosSinSiniestros = Number(aniosSinSiniestros)
      if (siniestrosUltimos5.trim() !== '') correccionesFinal.siniestrosUltimos5 = Number(siniestrosUltimos5)
      // De dónde salen los años (03/10/2026, criterio conservador): solo cuentan como DATO si no pasan de
      // lo que acredita su póliza leída — la MISMA regla que la imputación automática. Lo precargado al
      // máximo o tecleado por encima va SUPUESTO y la emisión pedirá verificarlo.
      Object.assign(correccionesFinal, origenesHistorialManual({ seguro: sa, aniosAsegurado: Number(aniosAsegurado), aniosSinSiniestros: Number(aniosSinSiniestros), hoy: limitesFechaEfecto().min }))
    }
    // marca/modelo/motor no viajan al vendor: asegura los usa para releer la versión
    // del catálogo (gratis) y cruzar su cilindrada y kW con el carné antes de pagar.
    const version = { marcaId, modeloId, motor: motorId }
    const resueltosPoliza = {
      ...version,
      codigoVehiculo,
      garaje,
      estadoCivilId,
      municipioId,
      fechaMatriculacion: matriculacion,
      garajeEsSupuesto: true,
      experienciaConduccion: experienciaConduccion || undefined,
    }
    const r = poliza
      ? await pedirCotizacion({
          polizaId: poliza.id,
          resueltos: resueltosPoliza,
          correcciones: correccionesFinal,
          ...(forzarNuevo ? { forzarNuevo: true } : {}),
          ...(forzar ? { forzar: true } : {}),
          // Retarificar la póliza como variante de SU riesgo («con las mismas personas», 29/09/2026).
          variante: variante ? { oportunidadId: variante.oportunidadId, nota } : null,
        })
      : await pedirCotizacionMoto({
      forzar,
      clienteId,
      ...(tieneSeguroActual ? {} : eleccionParaCotizar(seguroImputado, eleccionAnterior)),
      variante: variante ? { oportunidadId: variante.oportunidadId, figuras: figs as Record<string, string>, nota } : null,
      resueltos: {
        ...version,
        codigoVehiculo,
        garaje,
        estadoCivilId,
        municipioId,
        matricula: matricula.trim().toUpperCase(),
        fechaMatriculacion: matriculacion,
        garajeEsSupuesto: true,
        // Lo que se ha usado, para anotarlo en el riesgo (`info_riesgo.datosVehiculo`): asegura ignora esta
        // clave al cotizar. Los km solo si se han escrito; el garaje solo si se ha elegido (el defecto no es
        // un dato del cliente); sin nombres ni ids si el vehículo viene de una variante guardada.
        ...(variante
          ? {
              vehiculoRiesgo: {
                marca: usarPrevio && previo ? null : marcas.find((m) => m.id === marcaId)?.nombre ?? null,
                modelo: usarPrevio && previo ? null : modelos.find((m) => m.id === modeloId)?.nombre ?? null,
                version: usarPrevio && previo ? null : versiones.find((x) => x.id === codigoVehiculo)?.nombre ?? null,
                marcaId: usarPrevio && previo ? null : marcaId || null,
                modeloId: usarPrevio && previo ? null : modeloId || null,
                motorId: usarPrevio && previo ? null : motorId || null,
                kmAnuales: kmLeidos,
                garaje: garajeElegido.current ? garaje : null,
              },
            }
          : {}),
        // `''` cuenta como «no se ha preguntado» en asegura: se supone
        // `ThisMotorcycle`. Solo se manda un valor real si se ha elegido.
        experienciaConduccion: experienciaConduccion || undefined,
      },
      // Figuras de la variante: asegura rellena desde su ficha y lo tecleado aquí manda encima.
      correcciones: { ...correccionesFinal, ...correccionesDeFiguras(figs, figCorr, ROLES_MOTO) },
    })
    switch (r.estado) {
      case 'faltan':
        setResultado({ estado: 'faltan', faltan: r.faltan })
        return
      case 'tope':
        setResultado({ estado: 'error', mensaje: r.mensaje, tope: true, gastoDesconocido: false })
        return
      case 'duplicado_cotizacion':
        setResultado({ estado: 'error', mensaje: r.mensaje, gastoDesconocido: false, duplicado: true })
        return
      case 'proyecto_vigente':
        setResultado({ estado: 'error', mensaje: r.mensaje, gastoDesconocido: false, proyectoVigente: true })
        return
      case 'ramo':
      case 'no_encontrada':
      case 'sin_configurar':
        setResultado({ estado: 'error', mensaje: r.mensaje, gastoDesconocido: false })
        return
      case 'error':
        setResultado({ estado: 'error', mensaje: r.mensaje, gastoDesconocido: r.gastoDesconocido })
        return
      case 'ok':
        setResultado({
          estado: 'ok',
          coste: r.coste,
          restantesHoy: r.restantesHoy,
          simulado: r.simulado,
          avisoSimulacion: r.avisoSimulacion,
          resumen: r.resumen,
          precios: r.precios,
          fallos: r.fallos,
          supuestos: r.supuestos,
          guardado: r.guardado,
          seguroAnterior: r.seguroAnterior ?? null,
        })
        // Embebido: guardada y enlazada a la oportunidad → el padre relee el riesgo y la abre en «Presupuestos de este
        // riesgo» (desde ahí se emite). Sin id guardado se queda aquí, a la vista: no se pierde un precio pagado.
        if (embebido && onCotizado) {
          const id = cotizacionIdDe(r.guardado)
          if (id !== null) onCotizado(id)
        }
        return
      default: {
        const _exhaustivo: never = r
        return _exhaustivo
      }
    }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {variante && (
        <NotaVariante nota={nota} onNota={setNota} />
      )}
      {faltanInicial === null && (
        <div style={{ ...cardStyle, borderColor: 'var(--negative)', color: 'var(--negative)', fontSize: 13 }}>
          No se ha podido precalificar la ficha de {etiquetaCliente || 'este cliente'}: no se sabe qué datos
          personales faltan. Puedes seguir eligiendo la moto abajo (es gratis); el servidor cortará antes de
          gastar si falta algo.
        </div>
      )}

      <div style={cardStyle}>
        <CardHeader
          title={embebido ? '1 · Condiciones de la moto' : '1 · La moto'}
          sub={embebido ? 'La moto, la matrícula y la versión son las de «Datos del vehículo»: se cambian allí. Aquí, solo lo de esta cotización.' : 'Marca, modelo, combustible y versión: todo del catálogo de Codeoscopic, gratis.'}
        />
        {fallo && <p style={{ color: 'var(--negative)', fontSize: 13 }}>{fallo}</p>}
        {embebido && (
          <div style={{ display: 'grid', gap: 4, marginBottom: 10, fontSize: 13, minWidth: 0, overflowWrap: 'anywhere' }}>
            <span>
              <strong>Moto:</strong>{' '}
              {[datosRiesgo?.marca, datosRiesgo?.modelo, datosRiesgo?.version].filter(Boolean).join(' · ') || <span style={{ color: 'var(--muted)' }}>sin dato</span>}
              {codigoVehiculo ? ` (código ${codigoVehiculo})` : ''}
              {' · '}<strong>Matrícula:</strong> {matricula.trim() !== '' ? matricula.trim().toUpperCase() : <span style={{ color: 'var(--muted)' }}>sin matricular</span>}
              {' · '}<strong>Matriculación:</strong> {matriculacion ? fechaCorta(matriculacion) : <span style={{ color: 'var(--muted)' }}>sin dato</span>}
            </span>
            {faltaVersion && (
              <span style={{ color: 'var(--negative)' }}>Falta elegir la versión del catálogo (marca, modelo, combustible y versión): hazlo en «Datos del vehículo».</span>
            )}
            {faltaMatriculacion && (
              <span style={{ color: 'var(--negative)' }}>Falta la fecha de matriculación (o la prevista, si aún no está matriculada): ponla en «Datos del vehículo».</span>
            )}
          </div>
        )}
        {!embebido && usarPrevio && previo && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 10, fontSize: 13 }}>
            <span>
              <strong>La misma moto que la última vez</strong>
              {previo.matricula ? ` · ${previo.matricula}` : ''} · versión {previo.codigoVehiculo}. Corrige solo lo que haya cambiado.
            </span>
            <button type="button" onClick={elegirOtraMoto} style={{ ...btnStyle('sutil'), minHeight: 44 }}>Elegir otra moto</button>
          </div>
        )}
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))' }}>
          {!embebido && !(usarPrevio && previo) && (<>
          <Campo etiqueta="Marca" falta={false} aviso={sigueSinConfirmar(plan, datosRiesgo?.marcaId, marcaId) ? avisoDelRiesgo : undefined}>
            <SelectorBuscable
              valor={marcaId}
              pista={marcaId ? null : plan.pistaMarca}
              onCambiar={(v) => void alElegirMarca(v)}
              opciones={marcas}
              deshabilitado={cargando === 'marcas'}
              textoVacio={cargando === 'marcas' ? 'Cargando…' : 'Elige marca'}
              nombre="marca"
              plural="marcas"
              style={input}
            />
          </Campo>
          <Campo etiqueta="Modelo" falta={false} aviso={sigueSinConfirmar(plan, datosRiesgo?.modeloId, modeloId) ? avisoDelRiesgo : undefined}>
            <SelectorBuscable
              valor={modeloId}
              pista={modeloId ? null : plan.pistaModelo}
              onCambiar={alElegirModelo}
              opciones={modelos}
              deshabilitado={!marcaId || cargando === 'modelos'}
              textoVacio={cargando === 'modelos' ? 'Cargando…' : 'Elige modelo'}
              nombre="modelo"
              plural="modelos"
              style={input}
            />
          </Campo>
          <Campo etiqueta="Combustible" falta={motorId === ''} faltaTexto="lo elige el corredor" aviso={sigueSinConfirmar(plan, datosRiesgo?.motorId, motorId) ? avisoDelRiesgo : undefined}>
            <SelectorBuscable
              valor={motorId}
              onCambiar={alElegirMotor}
              opciones={MOTORES}
              textoVacio="Elige combustible"
              nombre="combustible"
              plural="combustibles"
              style={input}
            />
          </Campo>
          <Campo etiqueta="Versión" falta={faltaVersion} faltaTexto="la elige el corredor" aviso={sigueSinConfirmar(plan, datosRiesgo?.codigoVehiculo, codigoVehiculo) ? avisoDelRiesgo : undefined}>
            <SelectorBuscable
              valor={codigoVehiculo}
              pista={codigoVehiculo ? null : plan.pistaVersion}
              onCambiar={setCodigoVehiculo}
              opciones={versiones}
              deshabilitado={!modeloId || !motorId || cargando === 'versiones'}
              textoVacio={cargando === 'versiones' ? 'Cargando…' : !motorId ? 'Elige antes el combustible' : 'Elige versión'}
              nombre="versión"
              plural="versiones"
              marcador="Buscar: TECNO, 48V, 4X2…"
              style={input}
            />
          </Campo>
          </>)}
          {embebido ? null : poliza ? (
            <Campo etiqueta="Matrícula" falta={false} ayuda="Sale de la póliza: no se cambia aquí.">
              <input value={matricula || 'La de la póliza'} readOnly style={{ ...input, opacity: 0.8 }} />
            </Campo>
          ) : (
            <Campo etiqueta="Matrícula" falta={faltaMatricula} ayuda="La teclea el corredor. Si el vehículo aún no está matriculado, déjala vacía y pon la fecha de matriculación prevista (máx. 90 días); con seguro anterior hará falta la matrícula de esa póliza.">
              <input value={matricula} onChange={(e) => setMatricula(e.target.value)} placeholder="1234ABC" style={input} />
            </Campo>
          )}
          {!embebido && (
          <Campo
            etiqueta="Fecha de matriculación"
            falta={faltaMatriculacion}
            ayuda={
              matriculacionEstimada && fuenteMatriculacion === 'avant2'
                ? 'Consultada a Avant2 por la matrícula. El propio proveedor la da como aproximada: confírmala con la ficha técnica.'
                : matriculacionEstimada && estimacion
                  ? `Estimada por la matrícula (entre ${fechaCorta(estimacion.desde)} y ${fechaCorta(estimacion.hasta)}): no es dato oficial y falla si la moto vino de fuera. Confírmala con la ficha técnica.`
                  : !poliza && matricula.trim() && !matriculacion && !estimacion
                    ? 'No se puede estimar por esta matrícula (formato antiguo o muy reciente): tecléala.'
                    : undefined
            }
          >
            <input
              type="date"
              value={matriculacion}
              onChange={(e) => {
                setMatriculacion(e.target.value)
                setMatriculacionEstimada(false)
                setFuenteMatriculacion(null)
              }}
              style={input}
            />
          </Campo>
          )}
          <Campo etiqueta="Fecha de efecto" falta={false} ayuda={AYUDA_FECHA_EFECTO}>
            <input type="date" min={limitesEfecto.min} max={limitesEfecto.max} value={fechaEfecto} onChange={(e) => setFechaEfecto(e.target.value)} style={input} />
          </Campo>
          <Campo etiqueta="¿Dónde duerme?" falta={faltaGaraje} ayuda="Lo elige el corredor; viaja marcado como supuesto.">
            <select value={garaje} onChange={(e) => { garajeElegido.current = true; setGaraje(e.target.value) }} style={input}>
              <option value="">Elige garaje</option>
              {garajes.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </select>
          </Campo>
          <Campo
            etiqueta="Kilómetros al año"
            falta={kmInvalido}
            faltaTexto="no se entiende como kilometraje (dígitos, y el punto solo como separador de miles)"
            ayuda={`Si lo dejas vacío se supone la media (${KM_ANUALES_SUPUESTOS.toLocaleString('es-ES')}) y se marca como supuesto. Es factor de precio: pon lo que declare el cliente.`}
          >
            <input
              inputMode="numeric"
              value={kmAnuales}
              onChange={(e) => setKmAnuales(e.target.value)}
              placeholder={`${KM_ANUALES_SUPUESTOS.toLocaleString('es-ES')} (media)`}
              style={input}
            />
          </Campo>
          <Campo
            etiqueta="Experiencia de conducción"
            falta={false}
            ayuda={
              experienciaConduccion === ''
                ? 'Si no se elige, se supone que ya ha llevado ESTA moto (el caso normal); se marca como supuesto.'
                : undefined
            }
          >
            <select value={experienciaConduccion} onChange={(e) => setExperienciaConduccion(e.target.value)} style={input}>
              <option value="">Se supone: ya ha llevado esta moto</option>
              {experiencias.map((e) => (
                <option key={e.id} value={e.id}>{e.id === 'ThisMotorcycle' ? 'Ya ha llevado esta moto' : e.id === 'OtherMotorcycle' ? 'Viene de conducir otra moto' : e.nombre}</option>
              ))}
            </select>
          </Campo>
          {experienciaConduccion === 'OtherMotorcycle' && (
            <Campo etiqueta="Código de la moto anterior" falta={faltaMotoAnterior} ayuda="El vendor lo exige cuando la experiencia viene de OTRA moto. Es el código Base7: si no se tiene, cambia la experiencia arriba.">
              <input value={motoAnteriorCodigo} onChange={(e) => setMotoAnteriorCodigo(e.target.value)} style={input} />
            </Campo>
          )}
        </div>
      </div>

      <div style={cardStyle}>
        <CardHeader
          title="2 · El tomador"
          sub={aMano.length > 0 ? 'Los datos personales NUNCA se suponen: los que falten se teclean aquí.' : 'La ficha trae todo lo personal; solo hay que confirmar estos dos.'}
        />
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          {tomadorEmpresa ? (
            <p style={{ fontSize: 13, margin: 0, alignSelf: 'center' }}>Empresa: va con su CIF y su razón social, sin estado civil. Conduce el conductor habitual del riesgo.</p>
          ) : (
                    <Campo etiqueta="Estado civil" falta={faltaCivil} ayuda={estadoCivilMoto ? `Viene de la ficha («${estadoCivilMoto.nombre}»). Se puede cambiar.` : 'La ficha no lo dice o no casa con el catálogo: elígelo.'}>
              <select value={estadoCivilId} onChange={(e) => setEstadoCivilId(e.target.value)} style={input}>
                <option value="">Elige estado civil</option>
                {civiles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Campo>
          )}
          <Campo
            etiqueta="Municipio"
            falta={faltaMunicipio}
            ayuda={
              municipios === null
                ? municipiosMotivo ?? 'No se ha podido resolver el municipio del cliente.'
                : listaMunicipios.length === 0
                  ? municipiosMotivo ?? 'El código postal de la ficha no ha devuelto ningún municipio.'
                  : listaMunicipios.length === 1
                    ? 'Único municipio del código postal del cliente: viene puesto desde la ficha.'
                    : 'Varios municipios comparten el código postal: elige uno.'
            }
          >
            <select value={municipioId} onChange={(e) => setMunicipioId(e.target.value)} style={input}>
              <option value="">{listaMunicipios.length === 0 ? 'Sin municipios que elegir' : 'Elige municipio'}</option>
              {listaMunicipios.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </Campo>
        </div>

        {aMano.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 8px' }}>
              De la ficha faltan {aMano.length === 1 ? 'este dato' : `estos ${aMano.length} datos`}. Rellénalos aquí —
              no se inventan solos:
            </p>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              {aMano.some((f) => f.campo === 'sexo') && (
                <Campo etiqueta="Sexo" falta={!(correcciones.sexo ?? '').trim()}>
                  <select value={correcciones.sexo ?? ''} onChange={(e) => setCorrecciones((c) => ({ ...c, sexo: e.target.value }))} style={input}>
                    <option value="">Elige</option>
                    <option value="hombre">Hombre</option>
                    <option value="mujer">Mujer</option>
                  </select>
                </Campo>
              )}
              {aMano.filter((f) => CAMPOS_A_MANO[f.campo]).map((f) => (
                <Campo key={f.campo} etiqueta={CAMPOS_A_MANO[f.campo]!.etiqueta} falta={!(correcciones[f.campo] ?? '').trim()} ayuda={f.motivo}>
                  <input
                    type={CAMPOS_A_MANO[f.campo]!.tipo}
                    value={correcciones[f.campo] ?? ''}
                    onChange={(e) => setCorrecciones((c) => ({ ...c, [f.campo]: e.target.value }))}
                    style={input}
                  />
                </Campo>
              ))}
            </div>
          </div>
        )}

        {huerfanos.length > 0 && (
          <div style={{ ...cardStyle, marginTop: 12, borderColor: 'var(--negative)', padding: 12 }}>
            <strong style={{ color: 'var(--negative)' }}>Esto no se arregla desde esta pantalla:</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13 }}>
              {huerfanos.map((f) => <li key={f.campo}><strong>{f.campo}</strong>: {f.motivo}</li>)}
            </ul>
            <p style={{ margin: '6px 0 0', fontSize: 13 }}>
              Hay que corregirlo en la ficha del cliente. Si se pulsa igualmente, el servidor lo rechaza sin gastar nada.
            </p>
          </div>
        )}
      </div>

      {(Object.keys(figs).length > 0 || ocasionalIgnorado) && (
        <div style={cardStyle}>
          <CardHeader
            title="2b · Propietario y conductor del riesgo"
            sub={embebido
              ? 'Son los de «Intervinientes». Aquí solo se pide su estado civil y, si falta, la fecha del carné de quien conduce; lo demás se completa en su ficha.'
              : 'Los papeles que el riesgo pone en otra ficha salen de esa ficha: aquí solo se pide su estado civil y lo que falte. Los que no, los ocupa el tomador.'}
          />
          {ROLES_MOTO.filter((rol) => figs[rol]).map((rol, i) => (
            <div key={rol} style={i > 0 ? { marginTop: 12 } : undefined}>
              <BloqueFigura rol={rol} nombre={variante?.nombres[rol] ?? null} faltan={variante?.faltan[rol] ?? null} empresa={variante?.empresas[rol] ?? false}
                persona={figCorr[rol]} onPersona={(p) => setFigCorr((f) => ({ ...f, [rol]: p }))} civiles={civiles} soloCondiciones={embebido} />
            </div>
          ))}
          {ocasionalIgnorado && (
            <p style={{ color: 'var(--warning)', fontSize: 13, margin: Object.keys(figs).length > 0 ? '12px 0 0' : 0 }}>
              El riesgo tiene un conductor ocasional, pero en moto la compañía no lo admite: esta cotización no lo declara.
            </p>
          )}
        </div>
      )}

      {poliza ? (
      <div style={cardStyle}>
        <CardHeader
          title="2c · Seguro anterior: esta póliza"
          sub="La compañía, el número y la antigüedad salen de la póliza que se retarifica: es lo que da el bonus. Los años que no constan se suponen a la baja y salen en los supuestos junto al precio."
        />
        <p style={{ fontSize: 13, margin: 0 }}>{poliza.anterior}</p>
      </div>
      ) : (
      <div style={cardStyle}>
        <CardHeader
          title="2c · ¿Tiene seguro EN VIGOR ahora mismo?"
          sub="Sin esto la compañía cotiza «de calle»: no puede hacer el control de antecedentes y el precio NO es confirmable como real. Pregúntalo sobre todo en presupuestos importantes."
        />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={tieneSeguroActual}
            onChange={(e) => setTieneSeguroActual(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          Sí, tiene un seguro de moto en vigor ahora mismo
        </label>
        {anterior && (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>
            Precargado de su póliza actual (oportunidad{anterior.etiqueta ? ` ${anterior.etiqueta}` : ''}): revísalo.
            {anterior.aseguradora && !companiaActualElegida ? ` La compañía leída es «${anterior.aseguradora}»: elígela en la lista.` : ''}
            {sa === null ? ' Del bonus el documento no decía nada: esos años se teclean.' : ''}
          </p>
        )}
        {!anterior && anteriorAmbiguo !== null && anteriorAmbiguo > 1 && (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>
            Tiene {anteriorAmbiguo} oportunidades de moto abiertas con su póliza leída: tarifica desde la oportunidad de esa moto para precargar su bonus.
          </p>
        )}
        {!tieneSeguroActual && seguroImputado && (
          <PanelSeguroImputado s={seguroImputado} valor={eleccionAnterior} onCambio={setEleccionAnterior} />
        )}

        {tieneSeguroActual && (
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 10 }}>
            <Campo etiqueta="Compañía actual" falta={!companiaActualElegida}>
              {companias === null ? (
                <input
                  value={companiaActualLibre}
                  onChange={(e) => setCompaniaActualLibre(e.target.value)}
                  placeholder="Código DGS (p. ej. C0058)"
                  style={input}
                />
              ) : (
                <select value={companiaActualCodigo} onChange={(e) => setCompaniaActualCodigo(e.target.value)} style={input}>
                  <option value="">Elige compañía</option>
                  {companias.map((c) => <option key={c.codigoDgs} value={c.codigoDgs}>{c.nombreComun}</option>)}
                </select>
              )}
            </Campo>
            <Campo
              etiqueta="Últimos 5 dígitos de la póliza"
              falta={!polizaActualDigitos.trim()}
              ayuda="Mapfre y otras compañías a veces dan dígitos con ceros a propósito para que el competidor no pueda consultar la siniestralidad y así no perder al cliente. Si ves varios ceros seguidos, sospecha: la compañía puede rechazar el control de antecedentes con ese número y el precio se quedará en estimado."
            >
              <input
                value={polizaActualDigitos}
                onChange={(e) => setPolizaActualDigitos(e.target.value)}
                placeholder="Los 5 últimos, o la póliza entera si el cliente la tiene a mano"
                style={input}
              />
              {digitosPolizaSospechosos(polizaActualDigitos) && (
                <p style={{ color: 'var(--negative)', fontSize: 12, fontWeight: 600, margin: '4px 0 0' }}>
                  <ConIcono i={Flag}>Parece relleno (varios ceros seguidos): probablemente la compañía rechace el control de
                  antecedentes con este número y el precio se quede en estimado.</ConIcono>
                </p>
              )}
            </Campo>
            <Campo
              etiqueta="Matrícula de esa póliza"
                falta={false}
              ayuda="Solo si la póliza anterior era de OTRO vehículo (moto recién comprada). La compañía busca el historial por esta matrícula: con la de la moto nueva no lo encuentra y no aplica la bonificación. Vacío = la misma matrícula."
            >
              <input
                value={matriculaAnterior}
                onChange={(e) => setMatriculaAnterior(e.target.value)}
                placeholder={matricula.trim() ? `La misma (${matricula.trim().toUpperCase()})` : 'La misma'}
                style={input}
              />
            </Campo>
          </div>
        )}
        {tieneSeguroActual && (
          <details open={faltaAnios || undefined} style={{ marginTop: 10, fontSize: 13 }}>
            <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>
              Historial declarado: {aniosAsegurado || '—'} años asegurado · {aniosEnCompania || '—'} en la compañía · {aniosSinSiniestros || '—'} sin siniestros
              {siniestrosUltimos5 !== '' ? ` · ${siniestrosUltimos5} siniestros en 5 años` : ''} — ajustar
            </summary>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 8px' }}>
              {sa ? 'Lo leído de su póliza manda; lo que no traía va al máximo.' : 'Se declara el máximo.'} La compañía lo contrasta
              con SINCO por el nº de póliza y aplica el bonus real. Si el sistema rechaza un valor, aprende el tope y lo ajusta solo.
            </p>
            {digitosPolizaSospechosos(polizaActualDigitos) && (
              <p style={{ color: 'var(--negative)', fontSize: 12, fontWeight: 600, margin: '0 0 8px' }}>
                Con este nº de póliza la compañía probablemente no pueda contrastarlo: lo declarado aquí quedaría como dato. Revísalo.
              </p>
            )}
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              <Campo etiqueta="Años asegurado sin interrupción" falta={aniosAsegurado.trim() === ''}>
                <input type="number" min={0} value={aniosAsegurado} onChange={(e) => setAniosAsegurado(e.target.value)} style={input} />
              </Campo>
              <Campo etiqueta="Años en esta compañía" falta={aniosEnCompania.trim() === ''}>
                <input type="number" min={0} value={aniosEnCompania} onChange={(e) => setAniosEnCompania(e.target.value)} style={input} />
              </Campo>
              <Campo etiqueta="Años sin siniestros" falta={aniosSinSiniestros.trim() === ''}>
                <input type="number" min={0} value={aniosSinSiniestros} onChange={(e) => setAniosSinSiniestros(e.target.value)} style={input} />
              </Campo>
              <Campo
                etiqueta="Siniestros en los últimos 5 años (si aplica)"
                falta={false}
                ayuda="Solo hace falta si lleva menos de 5 años sin siniestros: si falta y la compañía lo exige, lo dirá al pedir el precio, sin cobrar nada."
              >
                <input type="number" min={0} value={siniestrosUltimos5} onChange={(e) => setSiniestrosUltimos5(e.target.value)} style={input} />
              </Campo>
            </div>
          </details>
        )}
      </div>
      )}

      {/* Pack coche + moto (03/10/2026): apagado por defecto; solo al tarificar una moto NUEVA (no al retarificar una póliza). */}
      {/* Embebido (oportunidad): sin pack; el pack coche + moto sigue en la pantalla completa de la ficha. */}
      {poliza === null && !embebido && (
        <PackVehiculos
          clienteId={clienteId}
          ramoActual="moto"
          otro={otroVehiculo}
          estadoCivilId={estadoCivilId}
          municipioId={municipioId}
          fechaEfecto={fechaEfecto}
          preciosActuales={resultado.estado === 'ok' && !resultado.simulado ? resultado.precios : null}
          puedePedir={simulacion || consumoPermite}
          llamadasHechas={resultado.estado === 'ok' && !resultado.simulado ? 1 : 0}
          onPack={() => undefined}
        />
      )}

      <div style={{ ...cardStyle, borderColor: simulacion ? 'var(--warning)' : 'var(--negative)', borderWidth: 2 }}>
        <CardHeader title={simulacion ? '3 · Simular precio' : '3 · Pedir precio'} />
        {simulacion ? (
          <p style={{ fontSize: 13 }}>
            <ConIcono i={FlaskConical}><strong>No se llama a ninguna compañía.</strong> El precio lo inventa central para poder ver la
            pantalla funcionando. No cuesta nada y no cuenta contra el tope.</ConIcono>
          </p>
        ) : (
          <p style={{ fontSize: 13 }}>
            <strong style={{ color: 'var(--negative)' }}>Este clic gasta 0,50€ reales.</strong> Un solo intento:
            la petición no es idempotente, así que reintentar crea otro proyecto y otro cargo.
          </p>
        )}

        <Contador consumo={consumo} simulacion={simulacion} />

        {bloqueo !== null && (
          <p role="status" style={{ color: 'var(--warning)', fontSize: 13, fontWeight: 600, margin: '8px 0 0' }}>{bloqueo}</p>
        )}
        <button type="button" onClick={() => void cotizar()} disabled={!puedePulsar} style={{ ...btnStyle('primario'), width: '100%', maxWidth: 420, marginTop: 12, minHeight: 44 }}>
          {cotizando ? (simulacion ? 'Simulando…' : 'Cotizando… (puede tardar hasta 2 min)') : simulacion ? 'Simular precio — no cuesta nada' : 'Pedir precio — cuesta 0,50€'}
        </button>
        {faltaAlgo && (
          <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8 }}>
            El botón se enciende cuando no falte nada arriba. Corregir arriba no cuesta nada.
          </p>
        )}

        {resultado.estado === 'faltan' && (
          <div style={{ marginTop: 12 }}>
            <Badge tono="positivo">No se ha gastado nada</Badge>
            <ul style={{ fontSize: 13 }}>{resultado.faltan.map((f) => <li key={f.campo}><strong>{f.campo}</strong>: {f.motivo}</li>)}</ul>
          </div>
        )}
        {guardada && resultado.estado === 'idle' && (
          <div style={{ ...cardStyle, marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14 }}>
              Ya hay una tarificación de moto de {variante ? (variante.tarificacionId ? 'esta variante' : 'este riesgo') : 'este cliente'} ({new Date(guardada.creadaEn).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' })}, {guardada.precios.length} precios{guardada.fechaEfecto ? `, efecto ${guardada.fechaEfecto.split('-').reverse().join('/')}` : ''}).
            </span>
            <button type="button" onClick={() => retomar(guardada)} style={{ ...btnStyle('secundario'), minHeight: 44 }}>
              Retomarla sin pagar
            </button>
          </div>
        )}
        {resultado.estado === 'error' && (
          <p style={{ color: 'var(--negative)', fontSize: 13, marginTop: 12, whiteSpace: 'pre-wrap' }}>
            {resultado.tope ? 'Tope alcanzado: ' : ''}{resultado.mensaje}
            {resultado.gastoDesconocido && <> <strong>No se sabe si esto se ha cobrado.</strong> Comprueba el consumo antes de volver a pulsar.</>}
          </p>
        )}
        {resultado.estado === 'error' && resultado.duplicado && (
          <RecotizarIgualmente onRecotizar={() => void pedirPrecio(false, true)} deshabilitado={!puedePulsar} />
        )}
        {resultado.estado === 'error' && resultado.proyectoVigente && poliza && (
          <button
            type="button"
            onClick={() => void pedirPrecio(true)}
            disabled={!puedePulsar}
            style={{ ...btnStyle('secundario'), width: '100%', maxWidth: 420, marginTop: 8 }}
          >
            {simulacion ? 'Descartar y simular de cero' : 'Descartar y pedir precio de cero — cuesta 0,50€'}
          </button>
        )}
        {resultado.estado === 'ok' && <Precios r={resultado} simulacion={simulacion} emitible sustituye={poliza !== null} clienteId={clienteId} actual={poliza === null ? primaActualParaLista(anterior) : null} />}
      </div>
    </div>
  )
}

/** Hoy en la hora del navegador, `YYYY-MM-DD`: acota la estimación de una matrícula de este mes. */
function hoyLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

function Campo({ etiqueta, falta, faltaTexto, ayuda, aviso, children }: { etiqueta: string; falta: boolean; faltaTexto?: string; ayuda?: string; aviso?: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
        <span>{etiqueta}</span>
        {falta && <Badge tono="aviso">falta{faltaTexto ? ` · ${faltaTexto}` : ''}</Badge>}
        {!falta && aviso && <Badge tono="aviso">{aviso}</Badge>}
      </label>
      {children}
      {ayuda && <span style={{ color: 'var(--muted)', fontSize: 12, display: 'block', marginTop: 4 }}>{ayuda}</span>}
    </div>
  )
}

function Contador({ consumo, simulacion }: { consumo: ConsumoPuerto; simulacion: boolean }) {
  if (simulacion) return null
  if (consumo.estado === 'error') return <p style={{ color: 'var(--negative)', fontSize: 13 }}>{consumo.error}</p>
  if (consumo.estado === 'no_disponible') {
    return (
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>
        No se ha podido leer el contador de gasto. {consumo.porque} El tope lo sigue aplicando asegura: si estuviera
        alcanzado, la respuesta lo dirá y no se cobrará nada.
      </p>
    )
  }
  return (
    <p style={{ color: consumo.veredicto.permitido ? 'var(--muted)' : 'var(--negative)', fontSize: 13 }}>
      Gastado este mes: <strong>{consumo.gastadoMes}</strong>
      {consumo.veredicto.permitido ? <> · quedan hoy <strong>{consumo.veredicto.restantesHoy}</strong> cotizaciones.</> : <> — {consumo.veredicto.explicacion}</>}
    </p>
  )
}

function Precios({
  r,
  simulacion,
  emitible = false,
  sustituye = true,
  clienteId,
  actual = null,
}: {
  /** «Pagas X → te proponemos Y» (03/10/2026): lo que paga hoy, anualizado. `null` = sin comparación. */
  actual?: ReturnType<typeof primaActualParaLista>
  r: Extract<Resultado, { estado: 'ok' }>
  simulacion: boolean
  clienteId: string
  /** Desde el 28/09/2026 también sin póliza: asegura emite a un cliente NUEVO con el
   *  proyecto enlazado a la ficha y a la tarificación (antes exigía una póliza de la
   *  cartera a la que colgar la nueva). */
  emitible?: boolean
  /** `true` si hay póliza anterior que sustituir (carta de baja); `false` = cliente nuevo. */
  sustituye?: boolean
}) {
  const cotizacionId = cotizacionIdDe(r.guardado)
  const puedeEmitir = emitible && !r.simulado && cotizacionId !== null
  const propsLista = {
    precios: r.precios,
    simulado: r.simulado,
    puedeEmitir,
    motivoNoEmitir: r.simulado ? 'Simulado: no hay proyecto real de Codeoscopic' : 'Esta cotización no quedó guardada: no se puede emitir sin su id',
    actual,
    emision: emitible
      ? (p: (typeof r.precios)[number], cerrar: () => void) => (
          <Emision
            tarificacionId={cotizacionId as string}
            compania={p.compania ?? ''}
            categoria={p.categoria ?? ''}
            primaEur={p.primaEur ?? null}
            producto={p.producto ?? null}
            modalidad={p.modalidad ?? null}
            idPrecio={p.id ?? null}
            sustituye={sustituye}
            onCerrar={cerrar}
          />
        )
      : undefined,
  }
  return (
    <div style={{ marginTop: 12 }}>
      <EnlaceOportunidad guardado={r.guardado} />
      {r.seguroAnterior?.elegida && (
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0' }}>Seguro anterior declarado: {describirCandidata(r.seguroAnterior.elegida)}</p>
      )}
      {r.seguroAnterior?.bonusSupuesto && <AvisoBonusSupuesto condicion={r.seguroAnterior.condicion} />}
      {r.simulado && (
        <div style={{ ...cardStyle, borderColor: 'var(--warning)', background: 'var(--warning-bg)', marginBottom: 12 }}>
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--warning)' }}><ConIcono i={FlaskConical}>ESTO ES UNA SIMULACIÓN</ConIcono></p>
          <p style={{ margin: '4px 0 0', fontSize: 13 }}>
            {r.avisoSimulacion ?? 'Precio inventado por central para probar la pantalla: ninguna compañía lo ha dado y no se ha gastado ni un céntimo.'}
          </p>
        </div>
      )}
      {simulacion && !r.simulado && (
        <p style={{ color: 'var(--negative)', fontSize: 13, marginBottom: 12 }}>
          Esta pantalla se abrió en modo simulación, pero la respuesta no viene marcada como simulada: trátala
          como una cotización REAL y comprueba el consumo antes de volver a pulsar.
        </p>
      )}
      <p style={{ fontWeight: 700, margin: '0 0 4px' }}>{r.resumen}</p>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
        Coste de esta consulta: {r.coste}
        {r.restantesHoy !== null ? <> · quedan hoy {r.restantesHoy}.</> : <> · el libro de consumo no se ha mirado (no hacía falta).</>}
      </p>
      {cotizacionId !== null ? (
        <>
          {/* «Qué verá el cliente» enseña todos los precios y, desde el 29/09/2026, cada fila se emite
              ahí mismo: ya no hay una segunda lista plegada debajo para emitir. */}
          <FiltroGarantias ramo="moto" origen={{ clienteId, ramo: 'moto' }} tarificacionId={cotizacionId} simulado={r.simulado} actual={actual} emitir={puedeEmitir ? (o, cerrar) => (
                <Emision
                  tarificacionId={cotizacionId as string}
                  compania={o.compania ?? ''}
                  categoria={o.categoria ?? ''}
                  primaEur={o.primaEur}
                  producto={o.producto}
                  modalidad={o.modalidad}
                  idPrecio={o.idVendor}
                  sustituye={sustituye}
                  onCerrar={cerrar}
                />
              ) : undefined} />
        </>
      ) : (
        <ListaPrecios {...propsLista} />
      )}
      <FallosTarificacion fallos={r.fallos} />
      {r.supuestos === null && (
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          De esta cotización recuperada <strong>no se guardaron los supuestos</strong> con los que se pidió el precio
          (garaje, historial, código postal…): compruébalos con el cliente antes de prometer la prima.
        </p>
      )}
      {r.supuestos !== null && r.supuestos.length > 0 && (
        <div style={{ marginTop: 12, borderLeft: '3px solid var(--warning)', paddingLeft: 10 }}>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 4px' }}>Este precio sale con estos supuestos. Si alguno no es cierto, la prima real cambia:</p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {r.supuestos.map((s, i) => (
              <li key={`${String(s.campo)}-${String(s.valor)}-${i}`}>
                <strong>{String(s.campo)}</strong>: {s.oculto ? <span style={{ color: 'var(--muted)' }}>(dato personal, se queda en asegura)</span> : <code>{String(s.valor)}</code>} — {s.porque}
                {s.optimista && <> <Badge tono="aviso">puede abaratar el precio</Badge></>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}


/**
 * «Presupuestos de este riesgo» → «Ver precios y emitir» (07/10/2026, oportunidad de MOTO): los precios de UNA variante
 * ya pagada, leídos de lo guardado (GRATIS), con el MISMO panel de emisión que tras cotizar (`Emision` con `idPrecio`
 * y `modalidad`, regla 21). Sin cambiar de URL. Si lo leído no es ESA variante, o su efecto ya pasó, no se emite.
 */
export function PreciosVarianteMoto({ clienteId, oportunidadId, tarificacionId, simulado }: {
  /** El tomador de ESA variante (la tarificación es suya). */
  clienteId: string
  oportunidadId: string
  tarificacionId: string
  /** La variante es una simulación: se enseña, nunca se emite. */
  simulado: boolean
}) {
  type Carga =
    | { estado: 'cargando' }
    | { estado: 'error'; mensaje: string }
    | { estado: 'caducada'; fechaEfecto: string | null }
    | { estado: 'ok'; r: Extract<Resultado, { estado: 'ok' }> }
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' })
  useEffect(() => {
    let vivo = true
    setCarga({ estado: 'cargando' })
    pedirTarificacionGuardadaMoto({ clienteId, oportunidadId, tarificacionId })
      .then((r) => {
        if (!vivo) return
        if (r.estado === 'ninguna') { setCarga({ estado: 'error', mensaje: 'No se encuentra esta variante guardada: no se puede emitir desde aquí.' }); return }
        if (r.estado !== 'ok') { setCarga({ estado: 'error', mensaje: `No se han podido leer sus precios: ${r.mensaje}` }); return }
        const g = r.guardada
        // Nunca otra en su lugar: si asegura devolviera otra tarificación (la última del cliente), no se emite.
        if (g.cotizacionId !== tarificacionId) { setCarga({ estado: 'error', mensaje: 'Lo leído no es esta variante: no se emite desde aquí.' }); return }
        if (g.caducada) { setCarga({ estado: 'caducada', fechaEfecto: g.fechaEfecto }); return }
        setCarga({
          estado: 'ok',
          r: {
            estado: 'ok',
            coste: '0 € (ya estaba pagada)',
            restantesHoy: null,
            simulado,
            avisoSimulacion: null,
            resumen: `Tarificación del ${new Date(g.creadaEn).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' })}${g.fechaEfecto ? ` · efecto ${fechaCorta(g.fechaEfecto)}` : ''}`,
            precios: g.precios,
            fallos: g.fallos,
            supuestos: null,
            guardado: { estado: 'guardada', cotizacionId: g.cotizacionId },
          },
        })
      })
      .catch(() => { if (vivo) setCarga({ estado: 'error', mensaje: 'No se han podido leer sus precios (sin conexión).' }) })
    return () => { vivo = false }
  }, [clienteId, oportunidadId, tarificacionId, simulado])
  if (carga.estado === 'cargando') return <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Leyendo sus precios (gratis)…</p>
  if (carga.estado === 'error') return <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--negative)' }}>{carga.mensaje}</p>
  if (carga.estado === 'caducada') {
    return (
      <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>
        Su fecha de efecto{carga.fechaEfecto ? ` (${fechaCorta(carga.fechaEfecto)})` : ''} ya ha pasado: la compañía no la confirma ni la emite. Pide precio de nuevo en el bloque «Pedir precio».
      </p>
    )
  }
  return <Precios r={carga.r} simulacion={false} emitible sustituye={false} clienteId={clienteId} />
}

/** Reparos que ESTA pantalla resuelve con un desplegable o una caja. */
const RESUELTOS_EN_PANTALLA = new Set<string>([
  'codigoVehiculo', 'garaje', 'matricula', 'fechaMatriculacion', 'municipioCirculacionId',
  'estadoCivil', 'sexo', 'experienciaConduccion', 'motoAnteriorCodigo',
])
