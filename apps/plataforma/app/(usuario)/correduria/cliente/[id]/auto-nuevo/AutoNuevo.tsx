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

import { useEffect, useState } from 'react'
import { btnStyle, Badge, cardStyle, CardHeader } from '@/components/ui'
import { eur } from '@/lib/dinero'
import type { Opcion, Reparo, Supuesto, Precio, Fallo, ConsumoPuerto } from '@/lib/auto-nuevo-asegura'
import type { Compania } from '@/lib/companias-asegura'
import { digitosPolizaSospechosos } from '@/lib/poliza-digitos-sospechosos'
import {
  borrarBorrador,
  claveBorradorAutoNuevo,
  guardarBorrador,
  leerBorrador,
} from '@/lib/correduria/borrador-local'

import { pedirCatalogo, pedirCotizacionAuto } from './acciones'
import { logoCompania, nombreProductoSinCia } from '@/lib/logo-compania'
import { SelectorBuscable } from '../../../SelectorBuscable'

function euroODash(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n) ? '—' : eur(n)
}

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

/** Los mínimos de una persona (propietario o conductor) cuando NO es el tomador. */
type PersonaForm = {
  dni: string
  nombre: string
  apellido1: string
  apellido2: string
  fechaNacimiento: string
  sexo: '' | 'hombre' | 'mujer'
  estadoCivil: string
  telefono: string
  /** Solo la usa el conductor: es SU carnet, no el del tomador. */
  fechaCarnet: string
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
  garaje?: string
  estadoCivilId?: string
  municipioId?: string
  correcciones?: Record<string, string>
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

const PERSONA_VACIA: PersonaForm = {
  dni: '', nombre: '', apellido1: '', apellido2: '', fechaNacimiento: '', sexo: '', estadoCivil: '', telefono: '', fechaCarnet: '',
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
      fallos: Fallo[]
      supuestos: Supuesto[]
    }
  | { estado: 'faltan'; faltan: Reparo[] }
  | { estado: 'error'; mensaje: string; tope?: boolean; gastoDesconocido: boolean }

export default function AutoNuevo({
  clienteId,
  etiquetaCliente,
  faltanInicial,
  garajes,
  civiles,
  municipios,
  municipiosMotivo,
  estadoCivilAuto,
  consumo,
  simulacion,
  companias,
}: {
  clienteId: string
  etiquetaCliente: string
  /** `null` = no se ha podido precalificar la persona · `[]` = revisado, nada falta. */
  faltanInicial: Reparo[] | null
  garajes: Opcion[]
  civiles: Opcion[]
  municipios: Opcion[] | null
  municipiosMotivo: string | null
  estadoCivilAuto: Opcion | null
  consumo: ConsumoPuerto
  simulacion: boolean
  /** `null` = no se ha podido leer el directorio de compañías: se teclea el código a mano. */
  companias: Compania[] | null
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

  const [matricula, setMatricula] = useState('')
  const [matriculacion, setMatriculacion] = useState('')
  const [garaje, setGaraje] = useState('')
  const [estadoCivilId, setEstadoCivilId] = useState(estadoCivilAuto?.id ?? '')
  const listaMunicipios = municipios ?? []
  const [municipioId, setMunicipioId] = useState(listaMunicipios.length === 1 ? listaMunicipios[0].id : '')
  const [correcciones, setCorrecciones] = useState<Record<string, string>>({})
  const [resultado, setResultado] = useState<Resultado>({ estado: 'idle' })

  // ── Propietario y conductor, SOLO si son distintos del tomador ──────────────
  // Por defecto tomador=propietario=conductor (el único caso probado contra el
  // vendor). Si Alberto marca la casilla, se piden los datos MÍNIMOS de esa
  // persona — nunca se inventan ni se copian del tomador.
  const [propietarioDistinto, setPropietarioDistinto] = useState(false)
  const [propietario, setPropietario] = useState<PersonaForm>(PERSONA_VACIA)
  const [conductorDistinto, setConductorDistinto] = useState(false)
  const [conductor, setConductor] = useState<PersonaForm>(PERSONA_VACIA)

  // ── ¿Tiene seguro EN VIGOR ahora mismo? (18/09/2026, fallo real de Alberto) ──
  // Sin esto la compañía cotiza «de calle»: precio ESTIMADO, no confirmable como
  // real, porque no puede hacer el control de antecedentes. Opt-in (por defecto
  // apagado, igual que hoy): solo se activa para presupuestos donde compensa
  // preguntar. Si se activa, hacen falta TODOS los campos — el vendor exige el
  // paquete completo o ninguno (`revisarDatosAuto`, `peticion-auto.ts`).
  const [tieneSeguroActual, setTieneSeguroActual] = useState(false)
  const [companiaActualCodigo, setCompaniaActualCodigo] = useState('')
  const [companiaActualLibre, setCompaniaActualLibre] = useState('')
  const [polizaActualDigitos, setPolizaActualDigitos] = useState('')
  const [aniosAsegurado, setAniosAsegurado] = useState('')
  const [aniosEnCompania, setAniosEnCompania] = useState('')
  const [aniosSinSiniestros, setAniosSinSiniestros] = useState('')
  const [siniestrosUltimos5, setSiniestrosUltimos5] = useState('')

  // ── Borrador local: lo tecleado NO se pierde al salir de la pantalla ───────
  //
  // Esta pantalla no guardaba nada hasta que se pagaba la cotización, y el
  // código postal —que hace falta para cotizar— se corrige en OTRA pantalla:
  // ir a arreglarlo borraba todo lo tecleado, así que el camino normal de uso
  // castigaba con volver a empezar. El mecanismo es el mismo que ya usaba
  // `retarificar` (`lib/correduria/borrador-local.ts`, común a las dos).
  //
  // Vive en el navegador, no en `seguros.*`: un borrador no es una cotización.
  const claveBorrador = claveBorradorAutoNuevo(clienteId)

  useEffect(() => {
    const b = leerBorrador<BorradorAutoNuevo>(claveBorrador)
    if (!b) return
    let vivo = true

    // Lo que no depende de ningún catálogo se restaura tal cual.
    if (b.matricula) setMatricula(b.matricula)
    if (b.matriculacion) setMatriculacion(b.matriculacion)
    if (b.correcciones) setCorrecciones(b.correcciones)

    // Lo que SÍ sale de un catálogo se restaura solo si sigue existiendo en
    // él: un id que ya no está dejaría un desplegable enseñando un valor que
    // el vendor rechazaría, que es peor que el hueco.
    if (b.garaje && garajes.some((g) => g.id === b.garaje)) setGaraje(b.garaje)
    if (b.estadoCivilId && civiles.some((c) => c.id === b.estadoCivilId)) setEstadoCivilId(b.estadoCivilId)
    if (b.municipioId && listaMunicipios.some((m) => m.id === b.municipioId)) setMunicipioId(b.municipioId)

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
        garaje,
        estadoCivilId,
        municipioId,
        correcciones,
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
    garaje,
    estadoCivilId,
    municipioId,
    correcciones,
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
  const faltaCivil = !estadoCivilId
  const faltaMunicipio = !municipioId
  const faltaMatricula = !matricula.trim()
  const faltaMatriculacion = !matriculacion

  const aMano = (faltanInicial ?? []).filter((f) => f.campo === 'sexo' || CAMPOS_A_MANO[f.campo])
  const aManoSinRellenar = aMano.filter((f) => !(correcciones[f.campo] ?? '').trim())
  const huerfanos = (faltanInicial ?? []).filter(
    (f) => !RESUELTOS_EN_PANTALLA.has(f.campo as string) && !CAMPOS_A_MANO[f.campo],
  )

  const faltaPropietario = propietarioDistinto && !personaCompleta(propietario, false)
  const faltaConductor = conductorDistinto && !personaCompleta(conductor, true)

  const companiaActualElegida = companiaActualCodigo || companiaActualLibre.trim()
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
    aManoSinRellenar.length > 0 || faltaPropietario || faltaConductor || faltaHistorial
  const puedePulsar = !cotizando && !faltaAlgo && (simulacion || consumoPermite)

  async function cotizar() {
    setResultado({ estado: 'cotizando' })
    const correccionesFinal: Record<string, unknown> = { ...correcciones }
    if (propietarioDistinto) correccionesFinal.propietario = personaParaPuerto(propietario, false)
    if (conductorDistinto) correccionesFinal.conductor = personaParaPuerto(conductor, true)
    if (tieneSeguroActual) {
      correccionesFinal.aseguradoAntes = true
      correccionesFinal.companiaAnteriorCodigo = companiaActualElegida
      correccionesFinal.polizaAnterior = polizaActualDigitos.trim()
      correccionesFinal.aniosAsegurado = Number(aniosAsegurado)
      correccionesFinal.aniosEnCompania = Number(aniosEnCompania)
      correccionesFinal.aniosSinSiniestros = Number(aniosSinSiniestros)
      if (siniestrosUltimos5.trim() !== '') correccionesFinal.siniestrosUltimos5 = Number(siniestrosUltimos5)
    }
    const r = await pedirCotizacionAuto({
      clienteId,
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
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
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
          <Campo etiqueta="Matrícula" falta={faltaMatricula} ayuda="No sale de ninguna póliza: no hay ninguna. La teclea el corredor.">
            <input value={matricula} onChange={(e) => setMatricula(e.target.value)} placeholder="1234ABC" style={input} />
          </Campo>
          <Campo etiqueta="Fecha de matriculación" falta={faltaMatriculacion}>
            <input type="date" value={matriculacion} onChange={(e) => setMatriculacion(e.target.value)} style={input} />
          </Campo>
          <Campo etiqueta="¿Dónde duerme?" falta={faltaGaraje} ayuda="Lo elige el corredor; viaja marcado como supuesto.">
            <select value={garaje} onChange={(e) => setGaraje(e.target.value)} style={input}>
              <option value="">Elige garaje</option>
              {garajes.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </select>
          </Campo>
        </div>
      </div>

      <div style={cardStyle}>
        <CardHeader
          title="2 · El tomador"
          sub={aMano.length > 0 ? 'Los datos personales NUNCA se suponen: los que falten se teclean aquí.' : 'La ficha trae todo lo personal; solo hay que confirmar estos dos.'}
        />
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <Campo etiqueta="Estado civil" falta={faltaCivil} ayuda={estadoCivilAuto ? `Viene de la ficha («${estadoCivilAuto.nombre}»). Se puede cambiar.` : 'La ficha no lo dice o no casa con el catálogo: elígelo.'}>
            <select value={estadoCivilId} onChange={(e) => setEstadoCivilId(e.target.value)} style={input}>
              <option value="">Elige estado civil</option>
              {civiles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Campo>
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

      <div style={cardStyle}>
        <CardHeader
          title="2b · ¿Propietario o conductor distintos?"
          sub="Por defecto se cotiza como si el tomador fuera también el dueño del coche y quien lo conduce. Marca solo lo que sea distinto de verdad."
        />
        <BloquePersona
          etiqueta="El propietario del coche es otra persona o empresa"
          activo={propietarioDistinto}
          onActivo={setPropietarioDistinto}
          persona={propietario}
          onPersona={setPropietario}
          civiles={civiles}
          conCarnet={false}
        />
        <div style={{ height: 12 }} />
        <BloquePersona
          etiqueta="El conductor habitual es otra persona (hijo, empleado…)"
          activo={conductorDistinto}
          onActivo={setConductorDistinto}
          persona={conductor}
          onPersona={setConductor}
          civiles={civiles}
          conCarnet
        />
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
                ayuda="⚠️ Mapfre y otras compañías a veces dan dígitos con ceros a propósito para que el competidor no pueda consultar la siniestralidad y así no perder al cliente. Si ves varios ceros seguidos, sospecha: la compañía puede rechazar el control de antecedentes con ese número y el precio se quedará en estimado."
              >
                <input
                  value={polizaActualDigitos}
                  onChange={(e) => setPolizaActualDigitos(e.target.value)}
                  placeholder="Los 5 últimos, o la póliza entera si el cliente la tiene a mano"
                  style={input}
                />
                {digitosPolizaSospechosos(polizaActualDigitos) && (
                  <p style={{ color: 'var(--negative)', fontSize: 12, fontWeight: 600, margin: '4px 0 0' }}>
                    🚩 Parece relleno (varios ceros seguidos): probablemente la compañía rechace el control de
                    antecedentes con este número y el precio se quede en estimado.
                  </p>
                )}
              </Campo>
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
          </>
        )}
      </div>

      <div style={{ ...cardStyle, borderColor: simulacion ? 'var(--warning)' : 'var(--negative)', borderWidth: 2 }}>
        <CardHeader title={simulacion ? '3 · Simular precio' : '3 · Pedir precio'} />
        {simulacion ? (
          <p style={{ fontSize: 13 }}>
            🧪 <strong>No se llama a ninguna compañía.</strong> El precio lo inventa central para poder ver la
            pantalla funcionando. No cuesta nada y no cuenta contra el tope.
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
        {resultado.estado === 'error' && (
          <p style={{ color: 'var(--negative)', fontSize: 13, marginTop: 12, whiteSpace: 'pre-wrap' }}>
            {resultado.tope ? '🛑 Tope alcanzado: ' : '⚠️ '}{resultado.mensaje}
            {resultado.gastoDesconocido && <> <strong>No se sabe si esto se ha cobrado.</strong> Comprueba el consumo antes de volver a pulsar.</>}
          </p>
        )}
        {resultado.estado === 'ok' && <Precios r={resultado} simulacion={simulacion} />}
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

function Precios({ r, simulacion }: { r: Extract<Resultado, { estado: 'ok' }>; simulacion: boolean }) {
  return (
    <div style={{ marginTop: 12 }}>
      {r.simulado && (
        <div style={{ ...cardStyle, borderColor: 'var(--warning)', background: 'var(--warning-bg)', marginBottom: 12 }}>
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--warning)' }}>🧪 ESTO ES UNA SIMULACIÓN</p>
          <p style={{ margin: '4px 0 0', fontSize: 13 }}>
            {r.avisoSimulacion ?? 'Precio inventado por central para probar la pantalla: ninguna compañía lo ha dado y no se ha gastado ni un céntimo.'}
          </p>
        </div>
      )}
      {simulacion && !r.simulado && (
        <p style={{ color: 'var(--negative)', fontSize: 13, marginBottom: 12 }}>
          ⚠️ Esta pantalla se abrió en modo simulación, pero la respuesta no viene marcada como simulada: trátala
          como una cotización REAL y comprueba el consumo antes de volver a pulsar.
        </p>
      )}
      <p style={{ fontWeight: 700, margin: '0 0 4px' }}>{r.resumen}</p>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
        Coste de esta consulta: {r.coste}
        {r.restantesHoy !== null ? <> · quedan hoy {r.restantesHoy}.</> : <> · el libro de consumo no se ha mirado (no hacía falta).</>}
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
          <thead>
            <tr>
              <th style={th}>Aseguradora</th><th style={th}>Cobertura</th>
              <th style={th}>Prima anual</th><th style={th}>Firmeza</th>
            </tr>
          </thead>
          <tbody>
            {r.precios.map((p, i) => {
              const logo = logoCompania(p.compania)
              const producto = nombreProductoSinCia(p.compania, p.producto)
              return (
              <tr key={`${p.compania}-${p.producto}-${i}`}>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    {logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logo.src}
                        alt=""
                        style={{ height: Math.round(18 * logo.escala), maxWidth: 52, objectFit: 'contain', flexShrink: 0 }}
                      />
                    ) : (
                      <Badge tono="neutral">{(p.compania ?? '—').slice(0, 2).toUpperCase()}</Badge>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{p.compania ?? '—'}</div>
                      {producto && (
                        <div style={{ color: 'var(--muted)', fontSize: 11, whiteSpace: 'nowrap' }}>{producto}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td style={td}>{p.categoria ?? <span style={{ color: 'var(--muted)' }}>sin declarar</span>}</td>
                <td style={td}>
                  <strong>{euroODash(p.primaEur)}</strong>
                  {r.simulado && <> <Badge tono="aviso">simulado</Badge></>}
                  <div style={{ color: 'var(--muted)', fontSize: 11 }}>
                    {p.franquiciaEur === null || p.franquiciaEur === undefined ? 'franquicia no declarada' : `franquicia ${euroODash(p.franquiciaEur)}`}
                  </div>
                </td>
                <td style={td}><Badge tono={p.firmeza === 'firme' ? 'positivo' : 'aviso'} title={p.avisos?.join(' · ')}>{p.firmeza ?? 'sin determinar'}</Badge></td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!r.simulado && r.precios.some((p) => p.firmeza !== 'firme') && (
        <p style={{ color: 'var(--muted)', fontSize: 12 }}>Los precios marcados como estimado o condicionado no son ofertas cerradas: la compañía puede cambiarlos al verificar los datos.</p>
      )}
      {r.fallos.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ color: 'var(--muted)', cursor: 'pointer', minHeight: 24, fontSize: 12 }}>
            {r.fallos.length} {r.fallos.length === 1 ? 'producto' : 'productos'} sin precio — ver por qué
          </summary>
          <ul style={{ margin: '6px 0 0', fontSize: 13 }}>
            {r.fallos.map((f, i) => (
              <li key={`${f.compania}-${i}`}>
                <strong>{f.compania ?? '—'}</strong>{f.producto ? ` · ${f.producto}` : ''}: {f.motivo ?? 'sin motivo declarado'}
                {f.tambienDioPrecio && <> <Badge tono="positivo">esta compañía sí dio otro precio</Badge></>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {r.supuestos.length > 0 && (
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

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }
const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid var(--border)' }

/** Reparos que ESTA pantalla resuelve con un desplegable o una caja. */
const RESUELTOS_EN_PANTALLA = new Set<string>(['codigoVehiculo', 'garaje', 'matricula', 'fechaMatriculacion', 'municipioCirculacionId', 'estadoCivil', 'sexo'])
