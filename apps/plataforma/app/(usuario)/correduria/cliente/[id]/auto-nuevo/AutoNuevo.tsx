'use client'

// La pantalla de presupuesto de AUTO SIN PÓLIZA («oportunidad nueva»), DENTRO
// de `/correduria` — mismo diseño que el resto del panel (`components/ui.tsx`).
//
// Es la hermana de `.../poliza/[id]/retarificar/retarificador.tsx` (mismo
// catálogo marca→modelo→motor→versión, gratis, del vendor), pero MÁS SIMPLE
// a propósito: sin póliza no hay «lo que ya sabemos» que reconciliar —
// `vehiculo` siempre es desconocido, así que no hay pistas ni emparejamientos
// que pintar. Lo único nuevo de verdad es la MATRÍCULA: en la retarificación
// sale de la póliza; aquí la teclea el corredor.
//
// No hay recálculo en servidor al corregir un campo (a diferencia de
// hogar-nuevo): los huecos de la PERSONA los calcula `faltanInicial` una vez
// (gratis, en el servidor) y el resto —vehículo, garaje, municipio— los
// calcula esta pantalla en local, exactamente igual que la retarificación de
// auto ya hace.

import { useEffect, useRef, useState } from 'react'
import { Flag, FlaskConical } from 'lucide-react'
import { btnStyle, Badge, cardStyle, CardHeader } from '@/components/ui'
import { ConIcono } from '../../../iconos'
import type { Opcion, Reparo, Supuesto, Precio, Fallo, ConsumoPuerto } from '@/lib/auto-nuevo-asegura'
import { digitosPolizaSospechosos } from '@/lib/poliza-digitos-sospechosos'
import { codigoCompania, historialDeclarado, type AnteriorParaTarificar } from '@/lib/seguro-anterior'
import { KM_ANUALES_SUPUESTOS, kilometrosDesdeTexto } from '@central/module-seguros'
import { fechaMatriculacionEstimada } from '@central/module-seguros/matricula'
import { garajePorDefecto } from '@/lib/supuestos-presupuesto'
import { AYUDA_FECHA_EFECTO, limitesFechaEfecto } from '@/lib/correduria/fecha-efecto'
import {
  borrarBorrador,
  claveBorradorAutoNuevo,
  guardarBorrador,
  leerBorrador,
} from '@/lib/correduria/borrador-local'
import { clasificarFaltan } from '@/lib/correduria/campos-faltan'

import { pedirCatalogo, pedirCotizacionAuto, pedirTarificacionGuardadaAuto } from './acciones'
import type { TarificacionNuevaGuardada, VehiculoGuardado } from '@/lib/retarificar-asegura'
import { ROLES_EXTRA, type RolExtra, type VarianteNueva } from '../../../oportunidad/[id]/variante'
import { NotaVariante } from '../../../oportunidad/[id]/NotaVariante'
import {
  CLAVE_FIGURA,
  PERSONA_VACIA,
  figuraCompleta,
  figuraParaPuerto,
  type PersonaForm,
} from '../../../oportunidad/[id]/figuras-form'
import { BloqueFigura } from '../../../oportunidad/[id]/BloqueFigura'
import ListaPrecios from '../../../ListaPrecios'
import FiltroGarantias from '../../../FiltroGarantias'
import { cotizacionIdDe } from '@/lib/presupuesto-asegura'
import { Emision } from '../../../poliza/[id]/retarificar/emision'
import { SelectorBuscable } from '../../../SelectorBuscable'
import { FallosTarificacion } from '../../../FallosTarificacion'

const input: React.CSSProperties = {
  padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 14, minHeight: 44, background: 'var(--surface)', color: 'var(--text)', width: '100%',
}

/** Los campos que el corredor puede teclear cuando la ficha no los trae. */
const CAMPOS_A_MANO: Record<string, { etiqueta: string; tipo: string } | undefined> = {
  dni: { etiqueta: 'DNI', tipo: 'text' },
  nombre: { etiqueta: 'Nombre', tipo: 'text' },
  apellido1: { etiqueta: 'Primer apellido', tipo: 'text' },
  telefono: { etiqueta: 'Móvil', tipo: 'tel' },
  fechaNacimiento: { etiqueta: 'Fecha de nacimiento', tipo: 'date' },
  fechaCarnet: { etiqueta: 'Fecha del carnet', tipo: 'date' },
}

/**
 * Lo que se guarda del formulario mientras se teclea (ver
 * `lib/correduria/borrador-local.ts`). Todo opcional: un borrador viejo puede
 * no traer un campo que se añadió después, y eso no puede romper la pantalla.
 */
type BorradorAutoNuevo = {
  marcaId?: string
  modeloId?: string
  motorId?: string
  codigoVehiculo?: string
  matricula?: string
  matriculacion?: string
  matriculacionEstimada?: boolean
  garaje?: string
  kmAnuales?: string
  fechaCompra?: string
  remolqueLigero?: boolean
  estadoCivilId?: string
  municipioId?: string
  correcciones?: Record<string, string>
  zonaCarnet?: string
  tipoCarnet?: string
  ocasionalDistinto?: boolean
  ocasional?: PersonaForm
  propietarioDistinto?: boolean
  propietario?: PersonaForm
  conductorDistinto?: boolean
  conductor?: PersonaForm
  tieneSeguroActual?: boolean
  companiaActualCodigo?: string
  companiaActualLibre?: string
  polizaActualDigitos?: string
  aniosAsegurado?: string
  aniosEnCompania?: string
  aniosSinSiniestros?: string
  siniestrosUltimos5?: string
}

/** ¿Están rellenos los campos mínimos? `conCarnet` los exige también para el conductor. */
function personaCompleta(p: PersonaForm, conCarnet: boolean): boolean {
  return (
    p.dni.trim() !== '' &&
    p.nombre.trim() !== '' &&
    p.apellido1.trim() !== '' &&
    p.fechaNacimiento !== '' &&
    (p.sexo === 'hombre' || p.sexo === 'mujer') &&
    p.estadoCivil !== '' &&
    p.telefono.trim() !== '' &&
    (!conCarnet || p.fechaCarnet !== '')
  )
}

/** La forma que espera `DatosAuto.propietario`/`conductor` en el puerto de asegura. */
function personaParaPuerto(p: PersonaForm, conCarnet: boolean): Record<string, unknown> {
  const base: Record<string, unknown> = {
    dni: p.dni.trim(),
    nombre: p.nombre.trim(),
    apellido1: p.apellido1.trim(),
    fechaNacimiento: p.fechaNacimiento,
    sexo: p.sexo,
    estadoCivil: p.estadoCivil,
    telefono: p.telefono.trim(),
  }
  if (p.apellido2.trim() !== '') base.apellido2 = p.apellido2.trim()
  if (conCarnet) base.fechaCarnet = p.fechaCarnet
  return base
}

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
      /** Qué pasó con la copia guardada: su `cotizacionId` es de lo que sale el presupuesto. */
      guardado?: unknown
    }
  | { estado: 'faltan'; faltan: Reparo[] }
  | { estado: 'error'; mensaje: string; tope?: boolean; gastoDesconocido: boolean }

export default function AutoNuevo({
  clienteId,
  matriculaInicial = '',
  etiquetaCliente,
  faltanInicial,
  garajes,
  civiles,
  zonasCarnet,
  tiposCarnet,
  municipios,
  municipiosMotivo,
  estadoCivilAuto,
  consumo,
  simulacion,
  companias,
  variante = null,
  anterior = null,
  anteriorAmbiguo = null,
}: {
  /** Variante de un riesgo (29/09/2026): oportunidad, figuras en otras fichas y qué les falta. */
  variante?: VarianteNueva | null
  /** El seguro que tiene hoy, leído de su póliza y guardado en la oportunidad (29/09/2026). */
  anterior?: AnteriorParaTarificar | null
  /** Nº de oportunidades de auto abiertas con datos cuando no se sabe cuál: no se precarga ninguna. */
  anteriorAmbiguo?: number | null
  clienteId: string
  /** Leída del documento por el asistente de Telegram (`?matricula=`). */
  matriculaInicial?: string
  etiquetaCliente: string
  /** `null` = no se ha podido precalificar la persona · `[]` = revisado, nada falta. */
  faltanInicial: Reparo[] | null
  garajes: Opcion[]
  civiles: Opcion[]
  /** Catálogos del carnet. `[]` = no se han podido leer: viaja el supuesto B/España. */
  zonasCarnet: Opcion[]
  tiposCarnet: Opcion[]
  municipios: Opcion[] | null
  municipiosMotivo: string | null
  estadoCivilAuto: Opcion | null
  consumo: ConsumoPuerto
  simulacion: boolean
  /** `null` = no se ha podido leer el directorio de compañías: se teclea el código a mano. */
  companias: { codigoDgs: string; nombreComun: string }[] | null
}) {
  // ── Vehículo: marca → modelo → versión, todo del catálogo y todo gratis ────
  const [marcas, setMarcas] = useState<Opcion[]>([])
  const [modelos, setModelos] = useState<Opcion[]>([])
  const [versiones, setVersiones] = useState<Opcion[]>([])
  const [motores, setMotores] = useState<Opcion[]>([])
  const [marcaId, setMarcaId] = useState('')
  const [modeloId, setModeloId] = useState('')
  const [motorId, setMotorId] = useState('')
  const [codigoVehiculo, setCodigoVehiculo] = useState('')
  const [cargando, setCargando] = useState<string | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    setCargando('marcas')
    void catalogo('tipo=marcas')
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

  const [matricula, setMatricula] = useState(matriculaInicial)
  const [matriculacion, setMatriculacion] = useState('')
  // true = la fecha la ha puesto la ESTIMACIÓN por matrícula, no el corredor:
  // se pinta como tal y se recalcula si cambia la matrícula. En cuanto el
  // corredor toca la fecha, pasa a ser suya.
  const [matriculacionEstimada, setMatriculacionEstimada] = useState(false)
  // De dónde sale la fecha estimada: Avant2 (`/car/registration-date`, que el
  // propio proveedor llama aproximada) o, si no responde, la serie nacional.
  const [fuenteMatriculacion, setFuenteMatriculacion] = useState<'avant2' | 'serie' | null>(null)
  // Por defecto en GARAJE, nunca en la calle (Alberto, 29/09/2026; sustituye a «vía pública» del
  // 25/09): es un dato de EMISIÓN, no de precio — viaja como supuesto y se confirma al emitir.
  const [garaje, setGaraje] = useState(() => garajePorDefecto(garajes)?.id ?? '')
  // El garaje por defecto no es una elección: el vehículo guardado de una variante puede traer
  // su garaje, y sin esto retomar caía en silencio al defecto (29/09/2026).
  const garajeElegido = useRef(false)

  // ── Los tres datos del coche que hasta hoy viajaban SUPUESTOS ─────────────
  // `kmAnuales`, `fechaCompra` y `remolqueLigero` ya iban en la petición al
  // vendor (`peticion-auto.ts`), pero con un valor que nadie había preguntado:
  // 15.000 km, fecha de compra = la de matriculación y sin remolque. Los tres
  // mueven la prima, y los kilómetros son factor de tarifa de primer orden.
  // Se dejan VACÍOS a propósito: en blanco significa «no se ha preguntado» y
  // viaja el supuesto de siempre; con valor, manda el corredor. Prerrellenarlos
  // con el supuesto convertiría un «no lo sé» en un dato afirmado.
  // Por defecto 10.000 km/año y compra = matriculación (Alberto, 25/09/2026):
  // se ven en pantalla y el corredor los cambia si el cliente dice otra cosa.
  const [kmAnuales, setKmAnuales] = useState(String(KM_ANUALES_POR_DEFECTO))
  // Vacío = sigue a la matriculación (se pinta esa fecha y no se manda nada:
  // el precalificador ya usa la de matriculación como compra).
  const [fechaCompra, setFechaCompra] = useState('')
  const [remolqueLigero, setRemolqueLigero] = useState(false)
  // Vacía = el defecto del servidor (DIAS_EFECTO_DEFECTO), para que el precio siga valiendo al emitir.
  const [fechaEfecto, setFechaEfecto] = useState('')
  const limitesEfecto = limitesFechaEfecto()
  const [estadoCivilId, setEstadoCivilId] = useState(estadoCivilAuto?.id ?? '')
  const listaMunicipios = municipios ?? []
  const [municipioId, setMunicipioId] = useState(listaMunicipios.length === 1 ? listaMunicipios[0].id : '')
  const [correcciones, setCorrecciones] = useState<Record<string, string>>({})
  const [resultado, setResultado] = useState<Resultado>({ estado: 'idle' })

  // ── Propietario y conductor, SOLO si son distintos del tomador ──────────────
  // Por defecto tomador=propietario=conductor (el único caso probado contra el
  // vendor). Si Alberto marca la casilla, se piden los datos MÍNIMOS de esa
  // persona — nunca se inventan ni se copian del tomador.
  // ── El carnet: qué tipo y dónde se expidió ────────────────────────────────
  // Vacío = «no se ha preguntado», y entonces viaja el supuesto (B, España)
  // DECLARADO como tal. Prerrellenarlos con el defecto volvería a convertir un
  // «no lo sé» en un dato afirmado — que es de lo que iba todo esto.
  const [zonaCarnet, setZonaCarnet] = useState('')
  const [tipoCarnet, setTipoCarnet] = useState('')

  // ── Conductor ocasional ───────────────────────────────────────────────────
  // No declararlo es reticencia (art. 10 LCS): la compañía puede reducir la
  // indemnización, y el conductor joven no declarado es el caso de manual.
  const [ocasionalDistinto, setOcasionalDistinto] = useState(false)
  const [ocasional, setOcasional] = useState<PersonaForm>(PERSONA_VACIA)

  const [propietarioDistinto, setPropietarioDistinto] = useState(false)
  const [propietario, setPropietario] = useState<PersonaForm>(PERSONA_VACIA)
  const [conductorDistinto, setConductorDistinto] = useState(false)
  const [conductor, setConductor] = useState<PersonaForm>(PERSONA_VACIA)

  // ── Variante de un riesgo (29/09/2026) ─────────────────────────────────────
  // Un papel que ocupa otra ficha NO se teclea: su casilla «distinto» no cuenta aunque un borrador
  // viejo la traiga marcada, y se piden solo el estado civil y lo que falte en su ficha.
  const figs: Partial<Record<RolExtra, string>> = variante?.figuras ?? {}
  const [nota, setNota] = useState('')
  const [figCorr, setFigCorr] = useState<Record<RolExtra, PersonaForm>>({
    propietario: PERSONA_VACIA,
    conductor_habitual: PERSONA_VACIA,
    conductor_ocasional: PERSONA_VACIA,
  })
  const propietarioDistintoEf = !figs.propietario && propietarioDistinto
  const conductorDistintoEf = !figs.conductor_habitual && conductorDistinto
  const ocasionalDistintoEf = !figs.conductor_ocasional && ocasionalDistinto

  // La variante guardada de ESTE riesgo (gratis): retomarla sin pagar y, si es el mismo coche,
  // no volver a dictarlo. Solo en modo variante: sin riesgo, «la última del cliente» podría ser
  // de otro coche.
  const [guardada, setGuardada] = useState<TarificacionNuevaGuardada | null>(null)
  const [previo, setPrevio] = useState<VehiculoGuardado | null>(null)
  const [usarPrevio, setUsarPrevio] = useState(false)

  // ── ¿Tiene seguro EN VIGOR ahora mismo? (18/09/2026, fallo real de Alberto) ──
  // Sin esto la compañía cotiza «de calle»: precio ESTIMADO, no confirmable como
  // real, porque no puede hacer el control de antecedentes. Opt-in (por defecto
  // apagado, igual que hoy): solo se activa para presupuestos donde compensa
  // preguntar. Si se activa, hacen falta TODOS los campos — el vendor exige el
  // paquete completo o ninguno (`revisarDatosAuto`, `peticion-auto.ts`).
  // Precargado del seguro que tiene hoy (29/09/2026, mismo criterio que moto): lo leído de su
  // póliza; y los años NO se teclean: el máximo salvo lo leído (la compañía lo contrasta con SINCO).
  const sa = anterior?.seguroAnterior ?? null
  const historial = historialDeclarado(sa)
  const [tieneSeguroActual, setTieneSeguroActual] = useState(anterior !== null)
  const [companiaActualCodigo, setCompaniaActualCodigo] = useState(() =>
    anterior && companias ? codigoCompania(companias, { codigoDgs: sa?.codigoDgs ?? null, nombre: anterior.aseguradora }) ?? '' : '')
  const [companiaActualLibre, setCompaniaActualLibre] = useState(() => (companias === null ? sa?.codigoDgs ?? '' : ''))
  const [polizaActualDigitos, setPolizaActualDigitos] = useState(() => anterior?.numeroPoliza?.replace(/\s+/g, '') ?? '')
  const [aniosAsegurado, setAniosAsegurado] = useState(String(historial.aniosAsegurado))
  const [aniosEnCompania, setAniosEnCompania] = useState(String(historial.aniosEnCompania))
  const [aniosSinSiniestros, setAniosSinSiniestros] = useState(String(historial.aniosSinSiniestros))
  const [siniestrosUltimos5, setSiniestrosUltimos5] = useState(historial.siniestrosUltimos5 === null ? '' : String(historial.siniestrosUltimos5))
  const [matriculaAnterior, setMatriculaAnterior] = useState('')

  // ── Borrador local: lo tecleado NO se pierde al salir de la pantalla ───────
  //
  // Esta pantalla no guardaba nada hasta que se pagaba la cotización, y el
  // código postal —que hace falta para cotizar— se corrige en OTRA pantalla:
  // ir a arreglarlo borraba todo lo tecleado, así que el camino normal de uso
  // castigaba con volver a empezar. El mecanismo es el mismo que ya usaba
  // `retarificar` (`lib/correduria/borrador-local.ts`, común a las dos).
  //
  // Vive en el navegador, no en `seguros.*`: un borrador no es una cotización.
  const claveBorrador = claveBorradorAutoNuevo(clienteId, variante?.oportunidadId)

  useEffect(() => {
    const b = leerBorrador<BorradorAutoNuevo>(claveBorrador)
    if (!b) return
    let vivo = true

    // Lo que no depende de ningún catálogo se restaura tal cual.
    if (b.matricula) setMatricula(b.matricula)
    if (b.matriculacion) setMatriculacion(b.matriculacion)
    if (b.matriculacionEstimada) setMatriculacionEstimada(true)
    if (b.kmAnuales) setKmAnuales(b.kmAnuales)
    if (b.fechaCompra) setFechaCompra(b.fechaCompra)
    if (b.remolqueLigero) setRemolqueLigero(true)
    if (b.correcciones) setCorrecciones(b.correcciones)

    // Lo que SÍ sale de un catálogo se restaura solo si sigue existiendo en
    // él: un id que ya no está dejaría un desplegable enseñando un valor que
    // el vendor rechazaría, que es peor que el hueco.
    if (b.garaje && garajes.some((g) => g.id === b.garaje)) {
      garajeElegido.current = true
      setGaraje(b.garaje)
    }
    if (b.estadoCivilId && civiles.some((c) => c.id === b.estadoCivilId)) setEstadoCivilId(b.estadoCivilId)
    if (b.municipioId && listaMunicipios.some((m) => m.id === b.municipioId)) setMunicipioId(b.municipioId)

    if (b.zonaCarnet && zonasCarnet.some((z) => z.id === b.zonaCarnet)) setZonaCarnet(b.zonaCarnet)
    if (b.tipoCarnet && tiposCarnet.some((t) => t.id === b.tipoCarnet)) setTipoCarnet(b.tipoCarnet)
    if (b.ocasionalDistinto) {
      setOcasionalDistinto(true)
      if (b.ocasional) setOcasional(b.ocasional)
    }
    if (b.propietarioDistinto) {
      setPropietarioDistinto(true)
      if (b.propietario) setPropietario(b.propietario)
    }
    if (b.conductorDistinto) {
      setConductorDistinto(true)
      if (b.conductor) setConductor(b.conductor)
    }
    if (b.tieneSeguroActual) {
      setTieneSeguroActual(true)
      if (b.companiaActualCodigo) setCompaniaActualCodigo(b.companiaActualCodigo)
      if (b.companiaActualLibre) setCompaniaActualLibre(b.companiaActualLibre)
      if (b.polizaActualDigitos) setPolizaActualDigitos(b.polizaActualDigitos)
      if (b.aniosAsegurado) setAniosAsegurado(b.aniosAsegurado)
      if (b.aniosEnCompania) setAniosEnCompania(b.aniosEnCompania)
      if (b.aniosSinSiniestros) setAniosSinSiniestros(b.aniosSinSiniestros)
      if (b.siniestrosUltimos5) setSiniestrosUltimos5(b.siniestrosUltimos5)
    }

    // El vehículo es una cascada (marca → modelo+motor → versión) y cada paso
    // es una llamada al catálogo, gratis. Se rehace entera para que el
    // desplegable de versión llegue poblado y `codigoVehiculo` siga siendo un
    // código que el catálogo reconoce, no una cadena suelta del borrador.
    if (b.marcaId) {
      void (async () => {
        try {
          setCargando('modelos')
          const [ms, mt] = await Promise.all([
            catalogo(`tipo=modelos&marcaId=${encodeURIComponent(b.marcaId!)}`),
            catalogo('tipo=motores'),
          ])
          if (!vivo) return
          setMarcaId(b.marcaId!)
          setModelos(ms)
          setMotores(mt)
          if (b.modeloId && ms.some((m) => m.id === b.modeloId)) setModeloId(b.modeloId)
          if (b.motorId && mt.some((m) => m.id === b.motorId)) setMotorId(b.motorId)
          if (b.modeloId && b.motorId && ms.some((m) => m.id === b.modeloId)) {
            setCargando('versiones')
            const vs = await catalogo(
              `tipo=versiones&marcaId=${encodeURIComponent(b.marcaId!)}` +
                `&modeloId=${encodeURIComponent(b.modeloId)}&motor=${encodeURIComponent(b.motorId)}`,
            )
            if (!vivo) return
            setVersiones(vs)
            if (b.codigoVehiculo && vs.some((v) => v.id === b.codigoVehiculo)) {
              setCodigoVehiculo(b.codigoVehiculo)
            }
          }
        } catch {
          // Restaurar el coche es una comodidad: si el catálogo falla, se
          // elige a mano. NO se pinta el error de `fallo`, que está reservado
          // a lo que el corredor acaba de pedir.
        } finally {
          if (vivo) setCargando(null)
        }
      })()
    }

    return () => {
      vivo = false
    }
    // Se restaura UNA vez al abrir la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Autoguardado: cualquier cambio se guarda, aunque no se llegue a cotizar.
  useEffect(() => {
    const t = setTimeout(() => {
      guardarBorrador<BorradorAutoNuevo>(claveBorrador, {
        marcaId,
        modeloId,
        motorId,
        codigoVehiculo,
        matricula,
        matriculacion,
        matriculacionEstimada,
        garaje,
        kmAnuales,
        fechaCompra,
        remolqueLigero,
        estadoCivilId,
        municipioId,
        correcciones,
        zonaCarnet,
        tipoCarnet,
        ocasionalDistinto,
        ocasional,
        propietarioDistinto,
        propietario,
        conductorDistinto,
        conductor,
        tieneSeguroActual,
        companiaActualCodigo,
        companiaActualLibre,
        polizaActualDigitos,
        aniosAsegurado,
        aniosEnCompania,
        aniosSinSiniestros,
        siniestrosUltimos5,
      })
    }, 400)
    return () => clearTimeout(t)
  }, [
    claveBorrador,
    marcaId,
    modeloId,
    motorId,
    codigoVehiculo,
    matricula,
    matriculacion,
    matriculacionEstimada,
    garaje,
    kmAnuales,
    fechaCompra,
    remolqueLigero,
    estadoCivilId,
    municipioId,
    correcciones,
    zonaCarnet,
    tipoCarnet,
    ocasionalDistinto,
    ocasional,
    propietarioDistinto,
    propietario,
    conductorDistinto,
    conductor,
    tieneSeguroActual,
    companiaActualCodigo,
    companiaActualLibre,
    polizaActualDigitos,
    aniosAsegurado,
    aniosEnCompania,
    aniosSinSiniestros,
    siniestrosUltimos5,
  ])

  useEffect(() => {
    if (!variante) return
    let vivo = true
    pedirTarificacionGuardadaAuto({ clienteId, oportunidadId: variante.oportunidadId, tarificacionId: variante.tarificacionId })
      .then((r) => {
        if (!vivo || r.estado !== 'ok') return
        if (!r.guardada.caducada && r.guardada.precios.length > 0) setGuardada(r.guardada)
        const v = r.guardada.vehiculo
        if (!v) return
        setPrevio(v)
        setUsarPrevio(true)
        setCodigoVehiculo((c) => c || v.codigoVehiculo)
        if (v.fechaMatriculacion) {
          setMatriculacion((f) => f || v.fechaMatriculacion!)
          setMatriculacionEstimada(false)
        }
        if (v.matricula) setMatricula((m) => m || v.matricula!)
        // Los km solo si se DECLARARON (la media supuesta no es un dato del cliente) y el corredor
        // no ha tecleado otra cifra.
        if (v.kmAnuales !== null && v.kmAnuales !== KM_ANUALES_SUPUESTOS) {
          setKmAnuales((k) => (k === String(KM_ANUALES_POR_DEFECTO) ? String(v.kmAnuales) : k))
        }
        if (v.garaje && !garajeElegido.current && garajes.some((g) => g.id === v.garaje)) setGaraje(v.garaje)
      })
      .catch(() => {})
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, variante?.oportunidadId, variante?.tarificacionId])

  function elegirOtroCoche() {
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

  async function catalogo(qs: string): Promise<Opcion[]> {
    const r = await pedirCatalogo(Object.fromEntries(new URLSearchParams(qs)))
    if (r.estado !== 'ok') throw new Error(r.mensaje)
    return r.opciones
  }

  async function alElegirMarca(id: string) {
    setMarcaId(id)
    setModeloId('')
    setCodigoVehiculo('')
    setModelos([])
    setVersiones([])
    if (!id) return
    setCargando('modelos')
    try {
      setModelos(await catalogo(`tipo=modelos&marcaId=${encodeURIComponent(id)}`))
      if (motores.length === 0) setMotores(await catalogo('tipo=motores'))
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
          `tipo=versiones&marcaId=${encodeURIComponent(marca)}&modeloId=${encodeURIComponent(modelo)}&motor=${encodeURIComponent(motor)}`,
        ),
      )
    } catch (e) {
      setFallo((e as Error).message)
    } finally {
      setCargando(null)
    }
  }

  const faltaVersion = !codigoVehiculo
  const faltaGaraje = !garaje
  // Tomador EMPRESA (29/09/2026): va con su CIF, sin estado civil, y conduce otra ficha del riesgo.
  const tomadorEmpresa = variante?.empresas.tomador === true
  const faltaCivil = !estadoCivilId && !tomadorEmpresa
  // Con un conductor habitual en otra ficha, el «falta conductor» de la precalificación ya está cubierto.
  const faltanTomador = (faltanInicial ?? []).filter((f) => !(f.campo === 'conductor' && (figs.conductor_habitual || conductorDistintoEf)))
  const faltaMunicipio = !municipioId
  const faltaMatricula = !matricula.trim()
  const faltaMatriculacion = !matriculacion
  const estimacion = fechaMatriculacionEstimada(matricula, hoyLocal())

  // Con cada matrícula (tecleada, pegada o restaurada del borrador) se consulta
  // la fecha a Avant2, gratis; mientras tanto, o si no responde, vale la
  // estimación por la serie nacional. Solo rellena si la fecha está vacía o la
  // puso la propia estimación: nunca pisa una fecha tecleada por el corredor.
  const puedeRellenarFecha = matriculacion === '' || matriculacionEstimada
  useEffect(() => {
    if (!puedeRellenarFecha) return
    const placa = matricula.trim()
    // Matrícula vacía: solo se borra una fecha que era estimada. En el montaje
    // no se toca nada, o pisaría la fecha que restaura el borrador.
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
        const [f] = await catalogo(`tipo=fecha-matriculacion&matricula=${encodeURIComponent(placa)}`)
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
  // Cada hueco, a donde de verdad se arregla (`lib/correduria/campos-faltan.ts`).
  // Antes todo lo que no supiera teclear la pantalla se mandaba a la ficha del
  // cliente por descarte, incluidos los seis campos del bloque 3 — que estan
  // AQUI y en la ficha no existen.
  const reparos = clasificarFaltan(
    faltanTomador.map((f) => ({ campo: f.campo as string, motivo: f.motivo })),
    (c) => Boolean(CAMPOS_A_MANO[c]),
  )

  const faltaPropietario = propietarioDistintoEf && !personaCompleta(propietario, false)
  const faltaConductor = conductorDistintoEf && !personaCompleta(conductor, true)
  const faltaOcasional = ocasionalDistintoEf && !personaCompleta(ocasional, true)
  const faltaFigura = ROLES_EXTRA.some((rol) => figs[rol] && !figuraCompleta(figCorr[rol], variante?.faltan[rol] ?? null, variante?.empresas[rol] ?? false))
  // La misma ficha de conductor habitual y de ocasional es UN conductor, no dos (y el vendor rechaza
  // dos personas con el mismo documento, con un 400 que se paga).
  const figuraRepetida = !!figs.conductor_habitual && figs.conductor_habitual === figs.conductor_ocasional
  // El vendor rechaza dos personas con el mismo DNI y distinto dato, y ese 400
  // se paga. Si el ocasional es el mismo que conduce, lo que hay es un
  // conductor, no dos: se dice aquí, gratis.
  const ocasionalDuplicado =
    ocasionalDistintoEf &&
    ocasional.dni.trim() !== '' &&
    ocasional.dni.trim().toUpperCase() === (conductorDistintoEf ? conductor.dni : '').trim().toUpperCase()

  // Un número mal tecleado NO se manda al vendor: `revisarDatosAuto` lo
  // rechazaría, pero ya habría costado el viaje. Se para aquí, en la pantalla.
  //
  // 🚨 El parseo NO es `Number()`: `Number('15.000')` es 15, y «15.000» es
  // justo lo que imprime la ayuda de este campo. La regla vive testeada en
  // `kilometrosDesdeTexto` (@central/module-seguros).
  const kmLeidos = kilometrosDesdeTexto(kmAnuales)
  const kmInvalido = kmAnuales.trim() !== '' && kmLeidos === null

  // Un coche no se compra antes de matricularse. El vendor no lo comprueba: se
  // traga las dos fechas y tarifica, así que el disparate solo se vería en el
  // precio. Aquí es gratis.
  const compraInvalida = fechaCompra !== '' && matriculacion !== '' && fechaCompra < matriculacion

  const companiaActualElegida = companiaActualCodigo || companiaActualLibre.trim()
  const faltaAnios = aniosAsegurado.trim() === '' || aniosEnCompania.trim() === '' || aniosSinSiniestros.trim() === ''
    || (Number(aniosSinSiniestros) < 5 && aniosSinSiniestros !== aniosAsegurado && siniestrosUltimos5.trim() === '')
  const faltaHistorial =
    tieneSeguroActual &&
    (!companiaActualElegida ||
      !polizaActualDigitos.trim() ||
      aniosAsegurado.trim() === '' ||
      aniosEnCompania.trim() === '' ||
      aniosSinSiniestros.trim() === '')

  const cotizando = resultado.estado === 'cotizando'
  const consumoPermite = consumo.estado === 'ok' ? consumo.veredicto.permitido : consumo.estado === 'no_disponible'
  const faltaAlgo =
    faltaVersion || faltaGaraje || faltaCivil || faltaMunicipio || faltaMatricula || faltaMatriculacion ||
    aManoSinRellenar.length > 0 || faltaPropietario || faltaConductor || faltaHistorial || kmInvalido || compraInvalida || faltaOcasional || ocasionalDuplicado ||
    faltaFigura || figuraRepetida
  const puedePulsar = !cotizando && !faltaAlgo && (simulacion || consumoPermite)

  async function cotizar() {
    setResultado({ estado: 'cotizando' })
    const correccionesFinal: Record<string, unknown> = { ...correcciones }
    // En blanco = no se ha preguntado: no se manda nada y sigue mandando el
    // supuesto del precalificador. Con valor, manda el corredor.
    if (kmLeidos !== null) correccionesFinal.kmAnuales = kmLeidos
    if (fechaCompra !== '' && !compraInvalida) correccionesFinal.fechaCompra = fechaCompra
    if (remolqueLigero) correccionesFinal.remolqueLigero = true
    if (fechaEfecto !== '') correccionesFinal.fechaEfecto = fechaEfecto
    // En blanco NO se manda: el precalificador ya declara el supuesto, y
    // `supuestosVigentes` lo retira en cuanto aquí se elige algo.
    if (zonaCarnet !== '') correccionesFinal.zonaCarnet = zonaCarnet
    if (tipoCarnet !== '') correccionesFinal.tipoCarnet = tipoCarnet
    if (ocasionalDistintoEf && !ocasionalDuplicado) {
      correccionesFinal.conductorOcasional = personaParaPuerto(ocasional, true)
    }
    if (propietarioDistintoEf) correccionesFinal.propietario = personaParaPuerto(propietario, false)
    if (conductorDistintoEf) correccionesFinal.conductor = personaParaPuerto(conductor, true)
    // Figuras de la variante: asegura rellena desde su ficha y lo tecleado aquí manda encima.
    for (const rol of ROLES_EXTRA) {
      if (figs[rol]) correccionesFinal[CLAVE_FIGURA[rol]] = figuraParaPuerto(figCorr[rol])
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
    }
    const r = await pedirCotizacionAuto({
      clienteId,
      variante: variante
        ? { oportunidadId: variante.oportunidadId, figuras: figs as Record<string, string>, nota }
        : null,
      resueltos: {
        codigoVehiculo,
        garaje,
        estadoCivilId,
        municipioId,
        matricula: matricula.trim().toUpperCase(),
        fechaMatriculacion: matriculacion,
        garajeEsSupuesto: true,
      },
      correcciones: correccionesFinal,
    })
    switch (r.estado) {
      case 'faltan':
        setResultado({ estado: 'faltan', faltan: r.faltan })
        return
      case 'tope':
        setResultado({ estado: 'error', mensaje: r.mensaje, tope: true, gastoDesconocido: false })
        return
      case 'proyecto_vigente':
      case 'ramo':
      case 'no_encontrada':
      case 'sin_configurar':
        setResultado({ estado: 'error', mensaje: r.mensaje, gastoDesconocido: false })
        return
      case 'error':
        setResultado({ estado: 'error', mensaje: r.mensaje, gastoDesconocido: r.gastoDesconocido })
        return
      case 'ok':
        // La cotización ya está pagada y guardada en `seguros.tarificaciones`,
        // que es la fuente de verdad: el borrador local ya no pinta nada y
        // llevaba datos personales, así que se borra en cuanto sobra. Una
        // cotización SIMULADA no ha pagado nada y puede querer repetirse, así
        // que ahí el borrador se queda.
        if (!r.simulado) borrarBorrador(claveBorrador)
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
        })
        return
      default: {
        const _exhaustivo: never = r
        return _exhaustivo
      }
    }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {variante && <NotaVariante nota={nota} onNota={setNota} />}
      {faltanInicial === null && (
        <div style={{ ...cardStyle, borderColor: 'var(--negative)', color: 'var(--negative)', fontSize: 13 }}>
          No se ha podido precalificar la ficha de {etiquetaCliente || 'este cliente'}: no se sabe qué datos
          personales faltan. Puedes seguir eligiendo el coche abajo (es gratis); el servidor cortará antes de
          gastar si falta algo.
        </div>
      )}

      <div style={cardStyle}>
        <CardHeader title="1 · El vehículo" sub="Marca, modelo, combustible y versión: todo del catálogo de Codeoscopic, gratis." />
        {fallo && <p style={{ color: 'var(--negative)', fontSize: 13 }}>{fallo}</p>}
        {usarPrevio && previo && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 10, fontSize: 13 }}>
            <span>
              <strong>El mismo vehículo que en la variante guardada</strong>
              {previo.matricula ? ` · ${previo.matricula}` : ''} · versión {previo.codigoVehiculo}. Corrige solo lo que haya cambiado.
            </span>
            <button type="button" onClick={elegirOtroCoche} style={{ ...btnStyle('sutil'), minHeight: 44 }}>Elegir otro vehículo</button>
          </div>
        )}
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          {!(usarPrevio && previo) && (<>
          <Campo etiqueta="Marca" falta={false}>
            <SelectorBuscable
              valor={marcaId}
              onCambiar={(v) => void alElegirMarca(v)}
              opciones={marcas}
              deshabilitado={cargando === 'marcas'}
              textoVacio={cargando === 'marcas' ? 'Cargando…' : 'Elige marca'}
              nombre="marca"
              plural="marcas"
              style={input}
            />
          </Campo>
          <Campo etiqueta="Modelo" falta={false}>
            <SelectorBuscable
              valor={modeloId}
              onCambiar={alElegirModelo}
              opciones={modelos}
              deshabilitado={!marcaId || cargando === 'modelos'}
              textoVacio={cargando === 'modelos' ? 'Cargando…' : 'Elige modelo'}
              nombre="modelo"
              plural="modelos"
              style={input}
            />
          </Campo>
          <Campo etiqueta="Combustible" falta={motorId === ''} faltaTexto="lo elige el corredor">
            <SelectorBuscable
              valor={motorId}
              onCambiar={alElegirMotor}
              opciones={motores}
              deshabilitado={cargando === 'motores'}
              textoVacio={cargando === 'motores' ? 'Cargando…' : 'Elige combustible'}
              nombre="combustible"
              plural="combustibles"
              style={input}
            />
          </Campo>
          <Campo etiqueta="Versión" falta={faltaVersion} faltaTexto="la elige el corredor">
            <SelectorBuscable
              valor={codigoVehiculo}
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
          <Campo etiqueta="Matrícula" falta={faltaMatricula} ayuda="No sale de ninguna póliza: no hay ninguna. La teclea el corredor.">
            <input value={matricula} onChange={(e) => setMatricula(e.target.value)} placeholder="1234ABC" style={input} />
          </Campo>
          <Campo
            etiqueta="Fecha de matriculación"
            falta={faltaMatriculacion}
            ayuda={
              matriculacionEstimada && fuenteMatriculacion === 'avant2'
                ? 'Consultada a Avant2 por la matrícula. El propio proveedor la da como aproximada: confírmala con la ficha técnica.'
                : matriculacionEstimada && estimacion
                ? `Estimada por la matrícula (entre ${fechaCorta(estimacion.desde)} y ${fechaCorta(estimacion.hasta)}): no es dato oficial y falla si el coche vino de fuera. Confírmala con la ficha técnica.`
                : matricula.trim() && !matriculacion && !estimacion
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
            ayuda={`Por defecto ${KM_ANUALES_POR_DEFECTO.toLocaleString('es-ES')}. Es factor de precio de primer orden: si el cliente sabe otra cifra, cámbiala.`}
          >
            <input
              inputMode="numeric"
              value={kmAnuales}
              onChange={(e) => setKmAnuales(e.target.value)}
              placeholder={String(KM_ANUALES_POR_DEFECTO)}
              style={input}
            />
          </Campo>
          <Campo
            etiqueta="Fecha de compra"
            falta={compraInvalida}
            faltaTexto="no puede ser anterior a la matriculación"
            ayuda="Por defecto, la de matriculación. Cámbiala solo si es de segunda mano."
          >
            <input type="date" value={fechaCompra || matriculacion} onChange={(e) => setFechaCompra(e.target.value === matriculacion ? '' : e.target.value)} style={input} />
          </Campo>
          <Campo etiqueta="Remolque ligero (< 750 kg)" falta={false} ayuda="Márcalo si el cliente lleva remolque. Sin marcar = sin remolque.">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44 }}>
              <input
                type="checkbox"
                checked={remolqueLigero}
                onChange={(e) => setRemolqueLigero(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              {/* Texto fijo: pintar el estado («No lleva») junto a una casilla vacía se leía como la
                  opción a marcar y decía lo contrario de lo que hace (29/09/2026). */}
              <span style={{ fontSize: 14 }}>Lleva remolque</span>
            </label>
          </Campo>
          <Campo etiqueta="Fecha de efecto" falta={false} ayuda={AYUDA_FECHA_EFECTO}>
            <input type="date" min={limitesEfecto.min} max={limitesEfecto.max} value={fechaEfecto} onChange={(e) => setFechaEfecto(e.target.value)} style={input} />
          </Campo>
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
                    <Campo etiqueta="Estado civil" falta={faltaCivil} ayuda={estadoCivilAuto ? `Viene de la ficha («${estadoCivilAuto.nombre}»). Se puede cambiar.` : 'La ficha no lo dice o no casa con el catálogo: elígelo.'}>
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
          <Campo
            etiqueta="Carnet expedido en"
            falta={false}
            ayuda={
              zonasCarnet.length === 0
                ? 'No se ha podido leer el catálogo: viaja España como supuesto.'
                : 'En blanco viaja España, marcado como supuesto. Con un carnet de fuera, elígelo: declararlo como español es declarar mal el riesgo.'
            }
          >
            <select value={zonaCarnet} onChange={(e) => setZonaCarnet(e.target.value)} style={input} disabled={zonasCarnet.length === 0}>
              <option value="">España (supuesto)</option>
              {zonasCarnet.map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
            </select>
          </Campo>
          <Campo
            etiqueta="Tipo de carnet"
            falta={false}
            ayuda={
              tiposCarnet.length === 0
                ? 'No se ha podido leer el catálogo: viaja el B como supuesto.'
                : 'En blanco viaja el B de turismos, marcado como supuesto.'
            }
          >
            <select value={tipoCarnet} onChange={(e) => setTipoCarnet(e.target.value)} style={input} disabled={tiposCarnet.length === 0}>
              <option value="">B · turismos (supuesto)</option>
              {tiposCarnet.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
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

        {reparos.historial.length > 0 && (
          <div style={{ ...cardStyle, marginTop: 12, borderColor: 'var(--warning)', padding: 12 }}>
            <strong>Esto se rellena aqui abajo, en «2c · ¿Tiene seguro en vigor ahora mismo?»:</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13 }}>
              {reparos.historial.map((f) => <li key={f.campo}><strong>{f.campo}</strong>: {f.motivo}</li>)}
            </ul>
            <p style={{ margin: '6px 0 0', fontSize: 13 }}>
              Enciende el interruptor y rellena el bloque. Si no tienes esos datos, dejalo apagado:
              el precio sale estimado, que es honesto. Rellenarlo con ceros lo cotiza como conductor
              novel y el precio se dispara.
            </p>
          </div>
        )}

        {reparos.ficha.length > 0 && (
          <div style={{ ...cardStyle, marginTop: 12, borderColor: 'var(--negative)', padding: 12 }}>
            <strong style={{ color: 'var(--negative)' }}>Esto no se arregla desde esta pantalla:</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13 }}>
              {reparos.ficha.map((f) => <li key={f.campo}><strong>{f.campo}</strong>: {f.motivo}</li>)}
            </ul>
            <p style={{ margin: '6px 0 0', fontSize: 13 }}>
              Se corrige en la <a href={`/correduria/cliente/${clienteId}`} style={{ color: 'var(--brand)' }}>ficha
              del cliente</a> (pestaña Contactos). Si se pulsa igualmente, el servidor lo rechaza sin gastar nada.
            </p>
          </div>
        )}

        {reparos.desconocidos.length > 0 && (
          <div style={{ ...cardStyle, marginTop: 12, borderColor: 'var(--negative)', padding: 12 }}>
            <strong style={{ color: 'var(--negative)' }}>Falta esto, y no se sabe donde se corrige:</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13 }}>
              {reparos.desconocidos.map((f) => <li key={f.campo}><strong>{f.campo}</strong>: {f.motivo}</li>)}
            </ul>
            <p style={{ margin: '6px 0 0', fontSize: 13 }}>
              El servidor lo pide y esta pantalla no lo tiene mapeado. Se dice en vez de mandarte a la
              ficha del cliente por descarte, que seria un viaje en balde.
            </p>
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <CardHeader
          title="2b · ¿Propietario o conductor distintos?"
          sub={
            Object.keys(figs).length > 0
              ? 'Los papeles que el riesgo pone en otra ficha salen de esa ficha: aquí solo se pide su estado civil y lo que falte.'
              : 'Por defecto se cotiza como si el tomador fuera también el dueño del coche y quien lo conduce. Marca solo lo que sea distinto de verdad.'
          }
        />
        {figs.propietario ? (
          <BloqueFigura rol="propietario" nombre={variante?.nombres.propietario ?? null} faltan={variante?.faltan.propietario ?? null} empresa={variante?.empresas.propietario ?? false}
            persona={figCorr.propietario} onPersona={(p) => setFigCorr((f) => ({ ...f, propietario: p }))} civiles={civiles} />
        ) : (
          <BloquePersona
            etiqueta="El propietario del coche es otra persona o empresa"
            activo={propietarioDistinto}
            onActivo={setPropietarioDistinto}
            persona={propietario}
            onPersona={setPropietario}
            civiles={civiles}
            conCarnet={false}
          />
        )}
        <div style={{ height: 12 }} />
        {figs.conductor_habitual ? (
          <BloqueFigura rol="conductor_habitual" nombre={variante?.nombres.conductor_habitual ?? null} faltan={variante?.faltan.conductor_habitual ?? null} empresa={variante?.empresas.conductor_habitual ?? false}
            persona={figCorr.conductor_habitual} onPersona={(p) => setFigCorr((f) => ({ ...f, conductor_habitual: p }))} civiles={civiles} />
        ) : (
          <BloquePersona
            etiqueta="El conductor habitual es otra persona (hijo, empleado…)"
            activo={conductorDistinto}
            onActivo={setConductorDistinto}
            persona={conductor}
            onPersona={setConductor}
            civiles={civiles}
            conCarnet
          />
        )}
        <div style={{ height: 12 }} />
        {figs.conductor_ocasional ? (
          <BloqueFigura rol="conductor_ocasional" nombre={variante?.nombres.conductor_ocasional ?? null} faltan={variante?.faltan.conductor_ocasional ?? null} empresa={variante?.empresas.conductor_ocasional ?? false}
            persona={figCorr.conductor_ocasional} onPersona={(p) => setFigCorr((f) => ({ ...f, conductor_ocasional: p }))} civiles={civiles} />
        ) : (
          <BloquePersona
            etiqueta="Lo conduce también otra persona de forma habitual (conductor ocasional)"
            activo={ocasionalDistinto}
            onActivo={setOcasionalDistinto}
            persona={ocasional}
            onPersona={setOcasional}
            civiles={civiles}
            conCarnet
          />
        )}
        {figuraRepetida && (
          <p style={{ color: 'var(--negative)', fontSize: 13, margin: '8px 0 0' }}>
            La misma persona figura como conductor habitual y como ocasional. Quita el ocasional en la pantalla del
            riesgo: la compañía rechaza dos personas con el mismo documento, y ese rechazo se paga.
          </p>
        )}
        {ocasionalDuplicado && (
          <p style={{ color: 'var(--negative)', fontSize: 13, margin: '8px 0 0' }}>
            El conductor ocasional tiene el mismo DNI que el habitual. Si conduce solo él, no declares un
            ocasional: la compañía rechaza dos personas con el mismo documento, y ese rechazo se paga.
          </p>
        )}
        <p style={{ color: 'var(--muted)', fontSize: 12, margin: '10px 0 0' }}>
          El ocasional no es un adorno: no declarar a quien también conduce es reticencia (art. 10 LCS) y la
          compañía puede reducir la indemnización. El caso de manual es el hijo con carnet reciente.
        </p>
      </div>

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
          Sí, tiene un seguro de auto en vigor ahora mismo
        </label>
        {anterior && (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>
            Precargado de su póliza actual (oportunidad{anterior.etiqueta ? ` ${anterior.etiqueta}` : ''}): revísalo.
            {anterior.aseguradora && !companiaActualElegida ? ` La compañía leída es «${anterior.aseguradora}»: elígela en la lista.` : ''}
          </p>
        )}
        {!anterior && anteriorAmbiguo !== null && anteriorAmbiguo > 1 && (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>
            Tiene {anteriorAmbiguo} oportunidades de auto abiertas con su póliza leída: tarifica desde la oportunidad de ese coche para precargarla.
          </p>
        )}

        {tieneSeguroActual && (
          <>
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
                ayuda="Solo si la póliza anterior era de OTRO vehículo (coche recién comprado). La compañía busca el historial por esta matrícula: con la del coche nuevo no lo encuentra y no aplica la bonificación. Vacío = la misma matrícula."
              >
                <input
                  value={matriculaAnterior}
                  onChange={(e) => setMatriculaAnterior(e.target.value)}
                  placeholder={matricula.trim() ? `La misma (${matricula.trim().toUpperCase()})` : 'La misma'}
                  style={input}
                />
              </Campo>
            </div>
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
          </>
        )}
      </div>

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

        <button type="button" onClick={() => void cotizar()} disabled={!puedePulsar} style={{ ...btnStyle('primario'), width: '100%', maxWidth: 420, marginTop: 12 }}>
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
              Ya hay una tarificación de {variante?.tarificacionId ? 'esta variante' : 'este riesgo'} ({new Date(guardada.creadaEn).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' })}, {guardada.precios.length} precios{guardada.fechaEfecto ? `, efecto ${guardada.fechaEfecto.split('-').reverse().join('/')}` : ''}).
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
        {resultado.estado === 'ok' && <Precios r={resultado} simulacion={simulacion} clienteId={clienteId} />}
      </div>
    </div>
  )
}

/** El toggle + mini-formulario de una persona (propietario o conductor) cuando no es el tomador. */
function BloquePersona({
  etiqueta,
  activo,
  onActivo,
  persona,
  onPersona,
  civiles,
  conCarnet,
}: {
  etiqueta: string
  activo: boolean
  onActivo: (v: boolean) => void
  persona: PersonaForm
  onPersona: (p: PersonaForm) => void
  civiles: Opcion[]
  conCarnet: boolean
}) {
  function set<K extends keyof PersonaForm>(campo: K, valor: PersonaForm[K]) {
    onPersona({ ...persona, [campo]: valor })
  }
  return (
    <div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 600 }}>
        <input type="checkbox" checked={activo} onChange={(e) => onActivo(e.target.checked)} style={{ width: 18, height: 18 }} />
        {etiqueta}
      </label>
      {activo && (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 10 }}>
          <Campo etiqueta="DNI/NIF" falta={!persona.dni.trim()}>
            <input value={persona.dni} onChange={(e) => set('dni', e.target.value)} style={input} />
          </Campo>
          <Campo etiqueta="Nombre" falta={!persona.nombre.trim()}>
            <input value={persona.nombre} onChange={(e) => set('nombre', e.target.value)} style={input} />
          </Campo>
          <Campo etiqueta="Primer apellido" falta={!persona.apellido1.trim()}>
            <input value={persona.apellido1} onChange={(e) => set('apellido1', e.target.value)} style={input} />
          </Campo>
          <Campo etiqueta="Segundo apellido" falta={false}>
            <input value={persona.apellido2} onChange={(e) => set('apellido2', e.target.value)} style={input} />
          </Campo>
          <Campo etiqueta="Fecha de nacimiento" falta={!persona.fechaNacimiento}>
            <input type="date" value={persona.fechaNacimiento} onChange={(e) => set('fechaNacimiento', e.target.value)} style={input} />
          </Campo>
          <Campo etiqueta="Sexo" falta={persona.sexo === ''}>
            <select value={persona.sexo} onChange={(e) => set('sexo', e.target.value as PersonaForm['sexo'])} style={input}>
              <option value="">Elige</option>
              <option value="hombre">Hombre</option>
              <option value="mujer">Mujer</option>
            </select>
          </Campo>
          <Campo etiqueta="Estado civil" falta={persona.estadoCivil === ''}>
            <select value={persona.estadoCivil} onChange={(e) => set('estadoCivil', e.target.value)} style={input}>
              <option value="">Elige estado civil</option>
              {civiles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Móvil" falta={!persona.telefono.trim()}>
            <input value={persona.telefono} onChange={(e) => set('telefono', e.target.value)} style={input} />
          </Campo>
          {conCarnet && (
            <Campo etiqueta="Fecha del carnet" falta={!persona.fechaCarnet} ayuda="Es SU carnet, no el del tomador.">
              <input type="date" value={persona.fechaCarnet} onChange={(e) => set('fechaCarnet', e.target.value)} style={input} />
            </Campo>
          )}
        </div>
      )}
    </div>
  )
}

const KM_ANUALES_POR_DEFECTO = 10000

/** Hoy en la hora del navegador, `YYYY-MM-DD`: acota la estimación de una matrícula de este mes. */
function hoyLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

function Campo({ etiqueta, falta, faltaTexto, ayuda, children }: { etiqueta: string; falta: boolean; faltaTexto?: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
        <span>{etiqueta}</span>
        {falta && <Badge tono="aviso">falta{faltaTexto ? ` · ${faltaTexto}` : ''}</Badge>}
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

function Precios({ r, simulacion, clienteId }: { r: Extract<Resultado, { estado: 'ok' }>; simulacion: boolean; clienteId: string }) {
  // Emitir a un cliente NUEVO (28/09/2026): asegura enlazó el proyecto a la ficha y a
  // esta tarificación al confirmar el precio, así que no hace falta póliza previa.
  const cotizacionId = cotizacionIdDe(r.guardado)
  const puedeEmitir = !r.simulado && cotizacionId !== null
  const propsLista = {
    precios: r.precios,
    simulado: r.simulado,
    puedeEmitir,
    motivoNoEmitir: r.simulado ? 'Simulado: no hay proyecto real de Codeoscopic' : 'Esta cotización no quedó guardada: no se puede emitir sin su id',
    // Cliente NUEVO: no hay póliza anterior, así que no hay carta de baja.
    emision: (p: (typeof r.precios)[number], cerrar: () => void) => (
      <Emision
        tarificacionId={cotizacionId as string}
        compania={p.compania ?? ''}
        categoria={p.categoria ?? ''}
        primaEur={p.primaEur ?? null}
        producto={p.producto ?? null}
        modalidad={p.modalidad ?? null}
        sustituye={false}
        ramo="auto"
        onCerrar={cerrar}
      />
    ),
  }
  return (
    <div style={{ marginTop: 12 }}>
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
          <FiltroGarantias ramo="auto" origen={{ clienteId, ramo: 'auto' }} tarificacionId={cotizacionId} simulado={r.simulado} emitir={puedeEmitir ? (o, cerrar) => (
                <Emision
                  tarificacionId={cotizacionId as string}
                  compania={o.compania ?? ''}
                  categoria={o.categoria ?? ''}
                  primaEur={o.primaEur}
                  producto={o.producto}
                  modalidad={o.modalidad}
                  sustituye={false}
                  ramo="auto"
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


/** Reparos que ESTA pantalla resuelve con un desplegable o una caja. */
