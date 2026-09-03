'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Opcion } from '@/lib/codeoscopic/opciones'
import { normalizarTexto } from '@/lib/codeoscopic/opciones'
import type { Reparo } from '@/lib/codeoscopic/peticion-auto'
import type {
  Supuesto,
  VehiculoConocido,
  VersionCandidata,
} from '@/lib/codeoscopic/desde-cartera'
import type { Veredicto } from '@/lib/codeoscopic/contador'
import { eur } from '@/lib/dinero'

type Consumo = { veredicto: Veredicto; gastadoMes: string } | { error: string }

type Precio = {
  compania?: string | null
  producto?: string | null
  primaAnual?: number | null
  firmeza?: string
  categoria?: string | null
  franquiciaEur?: number | null
  avisos?: string[]
}

type Fallo = {
  compania?: string | null
  producto?: string | null
  motivo?: string | null
  tambienDioPrecio?: boolean
}

type Resultado =
  | { estado: 'idle' }
  | { estado: 'cotizando' }
  | {
      estado: 'ok'
      coste: string
      /** `null` = no se ha mirado el libro (modo simulación). NUNCA «quedan 0». */
      restantesHoy: number | null
      /** 🚨 El precio lo ha inventado central: no lo ha dado ninguna compañía. */
      simulado: boolean
      avisoSimulacion: string | null
      resumen: string
      precios: Precio[]
      fallos: Fallo[]
      supuestos: Supuesto[]
    }
  | { estado: 'faltan'; faltan: Reparo[] }
  | { estado: 'error'; mensaje: string; tope?: boolean }

// Los tipos `VehiculoConocido` / `VersionCandidata` viven en
// `lib/codeoscopic/desde-cartera.ts` y se importan arriba: el contrato lo fija
// quien lee la cartera, no la pantalla. Redefinirlo aquí sería la forma de que
// las dos copias divergieran sin que nada fallase.

/**
 * Resultado de buscar un texto de la ficha en un catálogo del vendor.
 *
 * Cuatro estados y no un booleano, porque los cuatro se arreglan distinto y
 * un desplegable vacío los cuenta todos como el mismo «no lo sabemos»:
 *  - `sin_dato`   → la ficha no lo trae. Ausencia comprobada.
 *  - `no_buscado` → todavía no se ha podido mirar (catálogo sin llegar, o la
 *                   marca no casó y sin ella no hay lista de modelos).
 *  - `casa`       → emparejado: el desplegable viene puesto y se dice de dónde.
 *  - `no_casa`    → la ficha lo dice y el catálogo no lo tiene con ESE nombre.
 *                   `cuantas` distingue «no está» (0) de «hay varias iguales» (>1).
 */
type Emparejamiento =
  | { estado: 'sin_dato' }
  | { estado: 'no_buscado'; porque: string }
  | { estado: 'casa'; opcion: Opcion; texto: string }
  | { estado: 'no_casa'; texto: string; cuantas: number }

/**
 * Empareja un texto de la ficha con una opción del catálogo.
 *
 * Mismo criterio que `emparejar()` de `opciones.ts` —exacto y normalizado, y
 * ante la duda no preselecciona— pero devolviendo POR QUÉ no ha casado, que es
 * lo que la pantalla necesita para poder decirlo.
 */
function buscarEnCatalogo(catalogo: Opcion[], texto: string | null): Emparejamiento {
  if (texto === null || texto.trim() === '') return { estado: 'sin_dato' }
  if (catalogo.length === 0) {
    return { estado: 'no_buscado', porque: 'el catálogo de Codeoscopic no ha llegado' }
  }
  const buscado = normalizarTexto(texto)
  const coincidencias = catalogo.filter((o) => normalizarTexto(o.nombre) === buscado)
  if (coincidencias.length === 1) return { estado: 'casa', opcion: coincidencias[0], texto }
  return { estado: 'no_casa', texto, cuantas: coincidencias.length }
}

/**
 * El único sitio de la app donde un clic cuesta 0,50€ — **salvo en simulación**.
 *
 * Cuatro cosas son deliberadas:
 *  - El botón dice EN el botón lo que cuesta el clic, no en una nota al pie, y
 *    dice la verdad en los dos modos: «cuesta 0,50€» o «no cuesta nada».
 *  - Se deshabilita mientras cotiza: `POST /insurances` no es idempotente, así
 *    que un doble clic serían dos proyectos y dos cargos.
 *  - Si el vendor tarda y no responde, NO se reintenta solo. La cotización queda
 *    contada como gastada porque no hay prueba de que no se haya facturado.
 *  - **La duda siempre se resuelve hacia «esto cuesta dinero».** Que un precio
 *    sea simulado se decide con el campo `simulado` de la RESPUESTA (y con el
 *    `project_id` negativo), nunca con la prop: si la pantalla se pintó en
 *    simulación y la respuesta viene sin marcar, se trata como real.
 *
 * La pantalla son tres pasos con pesos distintos a propósito: lo que ya se sabe
 * (informativo y compacto), lo que hay que decidir (los campos, protagonistas) y
 * el disparo (separado, con su advertencia y con la letra pequeña del precio).
 */
export default function Retarificador({
  polizaId,
  faltanInicial,
  garajes,
  civiles,
  municipios,
  estadoCivilAuto,
  fechaMatriculacion,
  vehiculo,
  consumo,
  simulacion,
  deshabilitado,
}: {
  polizaId: string
  faltanInicial: Reparo[]
  garajes: Opcion[]
  civiles: Opcion[]
  municipios: Opcion[]
  estadoCivilAuto: Opcion | null
  fechaMatriculacion: string | null
  /** Marca, modelo y las versiones vistas en otras pólizas de la misma matrícula. */
  vehiculo: VehiculoConocido
  consumo: Consumo
  /** El servidor tiene `CODEOSCOPIC_SIMULACION=true` al pintar esta página. */
  simulacion: boolean
  deshabilitado: boolean
}) {
  // ── Vehículo: marca → modelo → versión, todo del catálogo y todo gratis ────
  const [marcas, setMarcas] = useState<Opcion[]>([])
  const [modelos, setModelos] = useState<Opcion[]>([])
  const [versiones, setVersiones] = useState<Opcion[]>([])
  const [motores, setMotores] = useState<Opcion[]>([])
  const [marcaId, setMarcaId] = useState('')
  const [modeloId, setModeloId] = useState('')
  // 🚨 El combustible NO es un adorno: `/car/…/vehicles` lo exige como
  // parámetro `engine` y sin él responde 400, así que sin elegirlo no hay
  // versiones que enseñar. Y no se adivina de la ficha: lo que ella guarda es
  // un código EIAC («1»), de OTRO catálogo — traducirlo a ojo sería inventar el
  // motor de un coche real. Lo elige el corredor.
  const [motorId, setMotorId] = useState('')
  const [codigoVehiculo, setCodigoVehiculo] = useState('')
  const [cargando, setCargando] = useState<string | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)

  // Cómo fue la preselección desde la ficha. Se guarda para poder DECIRLO: un
  // desplegable en blanco sin explicación parece «no lo sabemos» cuando sí lo
  // sabemos y lo que pasa es que el catálogo no lo tiene con ese nombre.
  const [autoMarca, setAutoMarca] = useState<Emparejamiento>({
    estado: 'no_buscado',
    porque: 'todavía se está leyendo el catálogo',
  })
  const [autoModelo, setAutoModelo] = useState<Emparejamiento>({
    estado: 'no_buscado',
    porque: 'primero hace falta la marca',
  })

  const [garaje, setGaraje] = useState('')
  const [estadoCivilId, setEstadoCivilId] = useState(estadoCivilAuto?.id ?? '')
  const [municipioId, setMunicipioId] = useState(
    municipios.length === 1 ? municipios[0].id : '',
  )
  const [matriculacion, setMatriculacion] = useState(fechaMatriculacion ?? '')
  const [correcciones, setCorrecciones] = useState<Record<string, string>>({})
  const [resultado, setResultado] = useState<Resultado>({ estado: 'idle' })

  async function catalogo(qs: string): Promise<Opcion[]> {
    const res = await fetch(`/api/cartera/catalogos?${qs}`)
    const j = (await res.json()) as { opciones?: Opcion[]; error?: string }
    if (!res.ok) throw new Error(j.error ?? `error ${res.status}`)
    return j.opciones ?? []
  }

  // ── Preselección desde la ficha ────────────────────────────────────────────
  //
  // La compañía manda matrícula, MARCA y MODELO; lo único que falta es la
  // versión. Así que al abrir la pantalla se bajan las marcas, se empareja la
  // de la ficha, se bajan sus modelos y se empareja el modelo. Todo gratis.
  //
  // 🚨 La versión NO se autoselecciona NUNCA, ni cuando solo hay una candidata:
  // `vehiculo.versiones` son textos de otra póliza, no códigos Base7. Elegir
  // por parecido cambiaría el precio sin que nadie se entere.
  useEffect(() => {
    if (deshabilitado) return
    let vivo = true

    void (async () => {
      setCargando('marcas')
      let lista: Opcion[] = []
      try {
        lista = await catalogo('tipo=marcas')
      } catch (e) {
        if (vivo) setFallo((e as Error).message)
      } finally {
        if (vivo) setCargando(null)
      }
      if (!vivo) return
      setMarcas(lista)

      const m = buscarEnCatalogo(lista, vehiculo.marca)
      setAutoMarca(m)
      if (m.estado !== 'casa') {
        setAutoModelo({
          estado: 'no_buscado',
          porque:
            m.estado === 'sin_dato'
              ? 'la ficha no dice la marca, y sin ella no hay lista de modelos'
              : 'la marca no está resuelta, y sin ella no hay lista de modelos',
        })
        return
      }
      setMarcaId(m.opcion.id)

      setCargando('modelos')
      let lista2: Opcion[] = []
      try {
        lista2 = await catalogo(`tipo=modelos&marcaId=${encodeURIComponent(m.opcion.id)}`)
      } catch (e) {
        if (vivo) setFallo((e as Error).message)
      } finally {
        if (vivo) setCargando(null)
      }
      if (!vivo) return
      setModelos(lista2)

      const mo = buscarEnCatalogo(lista2, vehiculo.modelo)
      setAutoModelo(mo)
      if (mo.estado !== 'casa') return
      setModeloId(mo.opcion.id)

      // Las versiones NO se pueden pedir todavía: falta el combustible, que es
      // obligatorio en el catálogo del vendor. Se baja su lista y ahí para la
      // cadena automática — el corredor elige motor y entonces sí.
      setCargando('motores')
      try {
        const ms = await catalogo('tipo=motores')
        if (vivo) setMotores(ms)
      } catch (e) {
        if (vivo) setFallo((e as Error).message)
      } finally {
        if (vivo) setCargando(null)
      }
    })()

    return () => {
      vivo = false
    }
    // Se corre una sola vez por póliza: la ficha no cambia mientras la miras.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deshabilitado])

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
    } catch (e) {
      setFallo((e as Error).message)
    } finally {
      setCargando(null)
    }
  }

  function alElegirModelo(id: string) {
    setModeloId(id)
    setCodigoVehiculo('')
    // Cambiar de modelo invalida las versiones, pero NO el combustible: el
    // coche sigue siendo el mismo y volver a preguntarlo sería ruido.
    setVersiones([])
    if (id && motorId) void cargarVersiones(marcaId, id, motorId)
  }

  function alElegirMotor(id: string) {
    setMotorId(id)
    setCodigoVehiculo('')
    setVersiones([])
    if (id && modeloId) void cargarVersiones(marcaId, modeloId, id)
  }

  /**
   * Las versiones del catálogo. Los TRES parámetros son obligatorios para el
   * vendor: sin `engine` responde 400 y la pantalla se queda sin el único dato
   * que de verdad hay que elegir.
   */
  async function cargarVersiones(marca: string, modelo: string, motor: string) {
    setCargando('versiones')
    setFallo(null)
    try {
      setVersiones(
        await catalogo(
          `tipo=versiones&marcaId=${encodeURIComponent(marca)}` +
            `&modeloId=${encodeURIComponent(modelo)}&motor=${encodeURIComponent(motor)}`,
        ),
      )
    } catch (e) {
      setFallo((e as Error).message)
    } finally {
      setCargando(null)
    }
  }

  async function cotizar() {
    setResultado({ estado: 'cotizando' })
    try {
      const res = await fetch(`/api/cartera/polizas/${polizaId}/retarificar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resueltos: {
            codigoVehiculo,
            garaje,
            estadoCivilId,
            municipioId,
            fechaMatriculacion: matriculacion,
            garajeEsSupuesto: true,
          },
          correcciones,
        }),
      })
      const j = (await res.json()) as Record<string, unknown>
      if (res.status === 422) {
        setResultado({ estado: 'faltan', faltan: (j.faltan as Reparo[]) ?? [] })
        return
      }
      if (!res.ok) {
        setResultado({
          estado: 'error',
          mensaje: String(j.error ?? `error ${res.status}`),
          tope: res.status === 402,
        })
        return
      }
      // 🚨 Simulado se decide con la RESPUESTA, no con la prop, y por DOS
      // señales unidas con OR: el booleano del embudo y el `project_id`
      // negativo que la simulación acuña a propósito. El OR solo puede marcar
      // de más, nunca de menos — que es la dirección segura: rotular de real
      // algo simulado se arregla mirando; rotular de simulado un cargo real
      // haría creer que no se ha pagado.
      const projectId = Number(j.projectId)
      const simulado = j.simulado === true || (Number.isFinite(projectId) && projectId < 0)
      const restantes = typeof j.restantesHoy === 'number' ? j.restantesHoy : null
      setResultado({
        estado: 'ok',
        coste: String(j.coste),
        restantesHoy: restantes,
        simulado,
        avisoSimulacion: typeof j.avisoSimulacion === 'string' ? j.avisoSimulacion : null,
        resumen: String(j.resumen),
        precios: (j.precios as Precio[]) ?? [],
        fallos: (j.fallos as Fallo[]) ?? [],
        supuestos: (j.supuestos as Supuesto[]) ?? [],
      })
    } catch (e) {
      // Un fallo de red aquí NO significa que no nos hayan cobrado — y eso vale
      // también con la simulación puesta: la prop puede estar vieja respecto del
      // entorno del servidor, así que la duda se resuelve hacia «puede costar».
      setResultado({
        estado: 'error',
        mensaje:
          `${(e as Error).message} — la cotización puede haberse cobrado igualmente. ` +
          `No vuelvas a pulsar sin comprobar el consumo.`,
      })
    }
  }

  // ── Qué falta, campo a campo ───────────────────────────────────────────────
  //
  // Se marca EN el campo, no en una lista lejos del sitio donde se arregla.
  const faltaVersion = !codigoVehiculo
  const faltaGaraje = !garaje
  const faltaCivil = !estadoCivilId
  const faltaMunicipio = !municipioId
  const faltaMatriculacion = !matriculacion

  /** Los huecos de la ficha que SÍ se teclean aquí (sexo + los de texto). */
  const aMano = useMemo(
    () => faltanInicial.filter((f) => f.campo === 'sexo' || CAMPOS_A_MANO[f.campo]),
    [faltanInicial],
  )
  const aManoSinRellenar = aMano.filter((f) => !(correcciones[f.campo] ?? '').trim())

  /**
   * Huecos que esta pantalla NO puede arreglar (ni desplegable ni caja). No se
   * callan: el servidor los rechazará con un 422 —sin gastar— y quien mire la
   * pantalla tiene que saber por qué antes de pulsar.
   */
  const huerfanos = faltanInicial.filter(
    (f) => !RESUELTOS_EN_PANTALLA.has(f.campo as string) && !CAMPOS_A_MANO[f.campo],
  )

  const cotizando = resultado.estado === 'cotizando'
  const consumoPermite = 'error' in consumo ? false : consumo.veredicto.permitido
  const faltaAlgo =
    faltaVersion ||
    faltaGaraje ||
    faltaCivil ||
    faltaMunicipio ||
    faltaMatriculacion ||
    aManoSinRellenar.length > 0
  // En simulación no se llama al vendor ni se toca el libro, así que el tope no
  // pinta nada: bloquear por él sería impedir algo que no cuesta. Lo que NO
  // cambia es el resto de la guarda: los datos siguen haciendo falta porque el
  // cuerpo se revisa igual antes de responder.
  const puedePulsar = !deshabilitado && !cotizando && !faltaAlgo && (simulacion || consumoPermite)

  return (
    <>
      {simulacion && <BannerSimulacion />}

      {/* ── Paso 1 · el vehículo ───────────────────────────────────────────── */}
      <Paso n={1} titulo="El vehículo" sub="Lo único que hay que elegir es la versión.">
        <SabidoDeLaFicha vehiculo={vehiculo} autoMarca={autoMarca} autoModelo={autoModelo} />

        {fallo && <p className="err">{fallo}</p>}

        <div className="form-grid" style={{ marginTop: 12 }}>
          <Campo
            id="marca"
            etiqueta="Marca"
            falta={false}
            ayuda={<ProcedenciaCatalogo emp={autoMarca} elegido={marcaId} que="marca" />}
          >
            <select
              id="marca"
              value={marcaId}
              onChange={(e) => void alElegirMarca(e.target.value)}
              disabled={deshabilitado || cargando === 'marcas'}
              style={{ minHeight: 44 }}
            >
              <option value="">{cargando === 'marcas' ? 'Cargando…' : 'Elige marca'}</option>
              {marcas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            id="modelo"
            etiqueta="Modelo"
            falta={false}
            ayuda={<ProcedenciaCatalogo emp={autoModelo} elegido={modeloId} que="modelo" />}
          >
            <select
              id="modelo"
              value={modeloId}
              onChange={(e) => void alElegirModelo(e.target.value)}
              disabled={!marcaId || cargando === 'modelos'}
              style={{ minHeight: 44 }}
            >
              <option value="">{cargando === 'modelos' ? 'Cargando…' : 'Elige modelo'}</option>
              {modelos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            id="motor"
            etiqueta="Combustible"
            falta={motorId === ''}
            faltaTexto="lo elige el corredor"
            ayuda={
              <span>
                El catálogo del vendor <strong>exige</strong> el combustible para poder darte las
                versiones. La ficha no lo dice en un formato que se pueda traducir sin adivinar, así
                que lo eliges tú.
              </span>
            }
          >
            <select
              id="motor"
              value={motorId}
              onChange={(e) => alElegirMotor(e.target.value)}
              disabled={deshabilitado || cargando === 'motores'}
              style={{ minHeight: 44 }}
            >
              <option value="">{cargando === 'motores' ? 'Cargando…' : 'Elige combustible'}</option>
              {motores.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            id="version"
            etiqueta="Versión"
            falta={faltaVersion}
            faltaTexto="la elige el corredor"
            ayuda={
              <span>
                Es el único dato del coche que <strong>ninguna</strong> póliza guarda, y el que pide
                el tarificador (código Base7). El catálogo las lista por combustible, así que ese va
                primero.
              </span>
            }
          >
            <select
              id="version"
              value={codigoVehiculo}
              onChange={(e) => setCodigoVehiculo(e.target.value)}
              disabled={!modeloId || !motorId || cargando === 'versiones'}
              style={{ minHeight: 44 }}
            >
              <option value="">
                {cargando === 'versiones'
                  ? 'Cargando…'
                  : !motorId
                    ? 'Elige antes el combustible'
                    : 'Elige versión'}
              </option>
              {versiones.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            id="matriculacion"
            etiqueta="Fecha de matriculación"
            falta={faltaMatriculacion}
            ayuda={
              fechaMatriculacion
                ? 'La ha devuelto Codeoscopic desde la matrícula, y es APROXIMADA.'
                : 'No ha llegado por la matrícula: ponla a mano.'
            }
          >
            <input
              id="matriculacion"
              type="date"
              value={matriculacion}
              onChange={(e) => setMatriculacion(e.target.value)}
              style={{ minHeight: 44 }}
            />
          </Campo>

          <Campo
            id="garaje"
            etiqueta="¿Dónde duerme?"
            falta={faltaGaraje}
            ayuda="No está en la ficha: lo elige el corredor y viaja marcado como supuesto."
          >
            <select
              id="garaje"
              value={garaje}
              onChange={(e) => setGaraje(e.target.value)}
              style={{ minHeight: 44 }}
            >
              <option value="">Elige garaje</option>
              {garajes.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <PistasDeVersion versiones={vehiculo.versiones} />
      </Paso>

      {/* ── Paso 2 · el tomador ────────────────────────────────────────────── */}
      <Paso
        n={2}
        titulo="El tomador"
        sub={
          aMano.length > 0
            ? 'Los datos personales NUNCA se suponen: los que falten se teclean aquí.'
            : 'La ficha trae todo lo personal; solo hay que confirmar estos dos.'
        }
      >
        <div className="form-grid">
          <Campo
            id="civil"
            etiqueta="Estado civil"
            falta={faltaCivil}
            ayuda={
              estadoCivilAuto
                ? `Viene de la ficha («${estadoCivilAuto.nombre}»). Se puede cambiar.`
                : 'La ficha no lo dice o no casa con el catálogo: elígelo.'
            }
          >
            <select
              id="civil"
              value={estadoCivilId}
              onChange={(e) => setEstadoCivilId(e.target.value)}
              style={{ minHeight: 44 }}
            >
              <option value="">Elige estado civil</option>
              {civiles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            id="municipio"
            etiqueta="Municipio"
            falta={faltaMunicipio}
            ayuda={
              municipios.length === 0
                ? 'La ficha no tiene código postal, así que no hay municipios que ofrecer. Sin él no se puede cotizar desde aquí.'
                : municipios.length === 1
                  ? 'Único municipio de ese código postal: viene puesto.'
                  : 'Varios municipios comparten ese código postal: elige uno.'
            }
          >
            <select
              id="municipio"
              value={municipioId}
              onChange={(e) => setMunicipioId(e.target.value)}
              style={{ minHeight: 44 }}
            >
              <option value="">
                {municipios.length === 0 ? 'Sin código postal en la ficha' : 'Elige municipio'}
              </option>
              {municipios.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        {/* La frase solo aparece si DEBAJO hay algo que rellenar. Antes se
            pintaba siempre y quedaba huérfana cuando no faltaba ningún dato. */}
        {aMano.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p className="muted" style={{ margin: '0 0 8px' }}>
              De la ficha faltan {aMano.length === 1 ? 'este dato' : `estos ${aMano.length} datos`}.
              Rellénalos aquí — no se inventan solos:
            </p>
            <div className="form-grid">
              {aMano.some((f) => f.campo === 'sexo') && (
                <Campo
                  id="c-sexo"
                  etiqueta="Sexo"
                  falta={!(correcciones.sexo ?? '').trim()}
                  ayuda="La ficha no lo dice y no se adivina por el nombre."
                >
                  <select
                    id="c-sexo"
                    value={correcciones.sexo ?? ''}
                    onChange={(e) => setCorrecciones((c) => ({ ...c, sexo: e.target.value }))}
                    style={{ minHeight: 44 }}
                  >
                    <option value="">Elige</option>
                    <option value="hombre">Hombre</option>
                    <option value="mujer">Mujer</option>
                  </select>
                </Campo>
              )}
              {aMano
                .filter((f) => CAMPOS_A_MANO[f.campo])
                .map((f) => (
                  <Campo
                    key={f.campo}
                    id={`c-${f.campo}`}
                    etiqueta={CAMPOS_A_MANO[f.campo]!.etiqueta}
                    falta={!(correcciones[f.campo] ?? '').trim()}
                    ayuda={f.motivo}
                  >
                    <input
                      id={`c-${f.campo}`}
                      type={CAMPOS_A_MANO[f.campo]!.tipo}
                      value={correcciones[f.campo] ?? ''}
                      onChange={(e) =>
                        setCorrecciones((c) => ({ ...c, [f.campo]: e.target.value }))
                      }
                      style={{ minHeight: 44 }}
                    />
                  </Campo>
                ))}
            </div>
          </div>
        )}

        {huerfanos.length > 0 && (
          <div className="err" style={{ marginTop: 12 }}>
            <strong>Esto no se arregla desde esta pantalla:</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {huerfanos.map((f) => (
                <li key={f.campo}>
                  <strong>{String(f.campo)}</strong>: {f.motivo}
                </li>
              ))}
            </ul>
            <p style={{ margin: '6px 0 0' }}>
              Hay que corregirlo en la ficha del cliente. Si se pulsa igualmente, el servidor lo
              rechaza <strong>sin gastar nada</strong>.
            </p>
          </div>
        )}
      </Paso>

      {/* ── Paso 3 · el disparo ────────────────────────────────────────────── */}
      <div
        className="card"
        style={{
          borderColor: simulacion ? 'var(--warn)' : 'var(--danger)',
          borderWidth: 2,
        }}
      >
        <CabeceraPaso n={3} titulo={simulacion ? 'Simular precio' : 'Pedir precio'} />

        {simulacion ? (
          <div style={CAJA_SIMULACION}>
            <strong style={{ color: 'var(--warn)' }}>🧪 No se llama a ninguna compañía.</strong>{' '}
            El precio lo inventa central para poder ver la pantalla funcionando. No cuesta nada, no
            se toca el libro de consumo y no se puede enseñar a un cliente.
          </div>
        ) : (
          <div style={CAJA_COSTE}>
            <strong style={{ color: 'var(--danger)' }}>Este clic gasta 0,50€ reales.</strong> El
            cargo es irreversible y solo hay <strong>un intento</strong>: la petición no es
            idempotente, así que reintentar crea otro proyecto y otro cargo.
          </div>
        )}

        <Contador consumo={consumo} simulacion={simulacion} />

        {faltaAlgo && !deshabilitado && (
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            El botón se enciende cuando no quede ningún <span className="badge warn">falta</span> de
            arriba. Corregir arriba no cuesta nada.
          </p>
        )}

        <button
          type="button"
          className="primary"
          onClick={() => void cotizar()}
          disabled={!puedePulsar}
          style={{
            minHeight: 44,
            width: '100%',
            maxWidth: 420,
            marginTop: 12,
            background: simulacion ? 'var(--warn)' : undefined,
          }}
        >
          {cotizando
            ? simulacion
              ? 'Simulando…'
              : 'Cotizando… (puede tardar hasta 2 min)'
            : simulacion
              ? 'Simular precio — no cuesta nada'
              : 'Pedir precio — cuesta 0,50€'}
        </button>

        {resultado.estado === 'faltan' && (
          <div style={{ marginTop: 12 }}>
            <p className="badge ok">No se ha gastado nada</p>
            <ul>
              {resultado.faltan.map((f) => (
                <li key={f.campo}>
                  <strong>{String(f.campo)}</strong>: {f.motivo}
                </li>
              ))}
            </ul>
          </div>
        )}

        {resultado.estado === 'error' && (
          <p className="err" style={{ marginTop: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {resultado.tope ? '🛑 Tope alcanzado: ' : '⚠️ '}
            {resultado.mensaje}
          </p>
        )}

        {resultado.estado === 'ok' && (
          <Precios r={resultado} simulacion={simulacion} />
        )}
      </div>
    </>
  )
}

// ─── El resultado ────────────────────────────────────────────────────────────

function Precios({
  r,
  simulacion,
}: {
  r: Extract<Resultado, { estado: 'ok' }>
  simulacion: boolean
}) {
  return (
    <div style={{ marginTop: 16 }}>
      {/* Un precio simulado y uno real se leen igual: la única diferencia está
          en este cartel y en la etiqueta de cada prima, así que van ENCIMA y
          DENTRO de la tabla, no como nota al pie. Tiene que aguantar una
          captura recortada y una mirada de lejos. */}
      {r.simulado && (
        <div
          style={{
            border: '2px solid var(--warn)',
            background: 'rgba(217, 119, 6, 0.1)',
            borderRadius: 10,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <p style={{ margin: 0, fontWeight: 800, fontSize: 18, color: 'var(--warn)' }}>
            🧪 ESTO ES UNA SIMULACIÓN
          </p>
          <p style={{ margin: '4px 0 0' }}>
            {r.avisoSimulacion ??
              'Precio inventado por central para probar la pantalla: ninguna compañía lo ha dado y no ' +
                'se ha gastado ni un céntimo.'}
          </p>
        </div>
      )}

      {/* La pantalla se pintó en simulación y la respuesta NO viene marcada:
          se trata como REAL. La duda sobre el dinero se resuelve siempre así. */}
      {simulacion && !r.simulado && (
        <div className="err" style={{ marginBottom: 12 }}>
          ⚠️ Esta pantalla se abrió en modo simulación, pero la respuesta{' '}
          <strong>no viene marcada como simulada</strong>: trátala como una cotización REAL y
          comprueba el consumo antes de volver a pulsar.
        </div>
      )}

      <p style={{ margin: '0 0 4px' }}>
        <strong>{r.resumen}</strong>
      </p>
      <p className="muted" style={{ marginTop: 0 }}>
        Coste de esta consulta: {r.coste}
        {/* `null` = no se ha leído el libro (simulación). Decir «quedan 0» sería
            convertir un «no se sabe» en una cifra. */}
        {r.restantesHoy !== null ? (
          <> · quedan hoy {r.restantesHoy}.</>
        ) : (
          <> · el libro de consumo no se ha mirado (no hacía falta).</>
        )}
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Compañía</th>
              <th>Producto</th>
              <th>Cobertura</th>
              <th>Prima anual</th>
              <th>Franquicia</th>
              <th>Firmeza</th>
            </tr>
          </thead>
          <tbody>
            {r.precios.map((p, i) => (
              <tr key={`${p.compania}-${p.producto}-${i}`}>
                <td>{p.compania ?? '—'}</td>
                <td>{p.producto ?? '—'}</td>
                <td>{p.categoria ?? <span className="muted">sin declarar</span>}</td>
                <td>
                  <strong>{eur(p.primaAnual)}</strong>
                  {r.simulado && (
                    <>
                      {' '}
                      <span className="badge warn">simulado</span>
                    </>
                  )}
                </td>
                <td>
                  {/* `null` NO es «sin franquicia»: es «el producto no la
                      declara». Callarlo sería vender un todo riesgo ocultando
                      1.500€ de franquicia. */}
                  {p.franquiciaEur === null || p.franquiciaEur === undefined ? (
                    <span className="muted">no la declara</span>
                  ) : (
                    eur(p.franquiciaEur)
                  )}
                </td>
                <td>
                  {/* La firmeza va PEGADA al precio: enseñar la prima sola
                      promete algo que la compañía no ha cerrado. */}
                  <span
                    className={`badge ${p.firmeza === 'firme' ? 'ok' : 'warn'}`}
                    title={p.avisos?.join(' · ')}
                  >
                    {p.firmeza ?? 'sin determinar'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!r.simulado && r.precios.some((p) => p.firmeza !== 'firme') && (
        <p className="muted">
          Los precios marcados como estimado o condicionado <strong>no son ofertas cerradas</strong>:
          la compañía puede cambiarlos al verificar los datos.
        </p>
      )}

      {/* Las compañías que NO dieron precio: sin ellas, «5 precios» se lee como
          «esto es el mercado entero». Cerrado por defecto (regla de rendimiento). */}
      {r.fallos.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="muted" style={{ cursor: 'pointer', minHeight: 24, fontSize: 12 }}>
            {r.fallos.length} {r.fallos.length === 1 ? 'producto' : 'productos'} sin precio — ver por qué
          </summary>
          <ul style={{ margin: '6px 0 0' }}>
            {r.fallos.map((f, i) => (
              <li key={`${f.compania}-${i}`}>
                <strong>{f.compania ?? '—'}</strong>
                {f.producto ? ` · ${f.producto}` : ''}: {f.motivo ?? 'sin motivo declarado'}
                {f.tambienDioPrecio && (
                  <>
                    {' '}
                    <span className="badge ok">esta compañía sí dio otro precio</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Los supuestos, OTRA VEZ y al lado del precio: son la letra pequeña de
          esa cifra, y verlos antes de pulsar no basta. */}
      {r.supuestos.length > 0 && (
        <div
          style={{
            marginTop: 12,
            borderLeft: '3px solid var(--warn)',
            paddingLeft: 10,
          }}
        >
          <p className="muted" style={{ margin: '0 0 4px' }}>
            Este precio sale con estos supuestos. Si alguno no es cierto, la prima real cambia:
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {r.supuestos.map((s, i) => (
              <li key={`${String(s.campo)}-${String(s.valor)}-${i}`}>
                <strong>{String(s.campo)}</strong>: <code>{String(s.valor)}</code> — {s.porque}
                {s.optimista && (
                  <>
                    {' '}
                    <span className="badge warn">puede abaratar el precio</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Piezas de la pantalla ───────────────────────────────────────────────────

/**
 * El cartel de simulación, arriba del todo y sin ambigüedad.
 *
 * 🚨 Sustituye al aviso ROJO de «tarificación apagada» que se pintaba aquí. Ese
 * aviso era falso con la simulación puesta: en `cotizar()` el paso 0 es la
 * simulación y va ANTES de mirar `CODEOSCOPIC_TARIFICACION_ACTIVA`, así que el
 * botón SÍ funciona y NO cuesta nada.
 */
function BannerSimulacion() {
  return (
    <div
      className="card"
      style={{
        borderColor: 'var(--warn)',
        borderWidth: 2,
        background: 'rgba(217, 119, 6, 0.08)',
      }}
    >
      <p style={{ margin: 0, fontWeight: 800, fontSize: 18, color: 'var(--warn)' }}>
        🧪 Modo simulación
      </p>
      <p style={{ margin: '4px 0 0' }}>
        Los precios que salgan aquí <strong>los inventamos nosotros</strong>: no se llama a ninguna
        compañía, <strong>no se cobra nada</strong> y no cuentan contra el tope. Sirve para probar la
        pantalla, no para dar un precio a un cliente.
      </p>
      <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
        Lo decide el interruptor del servidor, nunca la pantalla ni la petición: si pudiera pedirse
        desde el navegador, cualquiera podría hacer que la app enseñara precios inventados.
      </p>
    </div>
  )
}

function CabeceraPaso({ n, titulo, sub }: { n: number; titulo: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            width: 24,
            height: 24,
            flex: '0 0 auto',
            borderRadius: 999,
            background: 'var(--brand)',
            color: '#fff',
            fontWeight: 800,
            fontSize: 12,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {n}
        </span>
        <h2 style={{ margin: 0 }}>{titulo}</h2>
      </div>
      {sub && (
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
          {sub}
        </p>
      )}
    </div>
  )
}

function Paso({
  n,
  titulo,
  sub,
  children,
}: {
  n: number
  titulo: string
  sub?: string
  children: React.ReactNode
}) {
  return (
    <div className="card">
      <CabeceraPaso n={n} titulo={titulo} sub={sub} />
      {children}
    </div>
  )
}

/**
 * Un campo del formulario: etiqueta, control, ayuda y —si falta— su marca.
 *
 * La marca va AQUÍ y no en una lista encima del botón: «falta la versión» a
 * diez centímetros del desplegable de la versión obliga a buscar dónde se
 * arregla.
 */
function Campo({
  id,
  etiqueta,
  falta,
  faltaTexto,
  ayuda,
  children,
}: {
  id: string
  etiqueta: string
  falta: boolean
  faltaTexto?: string
  ayuda?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <label htmlFor={id} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>{etiqueta}</span>
        {falta && <span className="badge warn">falta{faltaTexto ? ` · ${faltaTexto}` : ''}</span>}
      </label>
      {children}
      {ayuda && (
        <span className="muted" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
          {ayuda}
        </span>
      )}
    </div>
  )
}

/**
 * Lo que la cartera YA sabe del coche: informativo, compacto y sin competir con
 * los campos.
 *
 * Sustituye al texto que durante un día negó que la compañía mandara el modelo.
 * Era falso y medido al revés: las 80 pólizas de auto vivas traen matrícula,
 * marca Y modelo. Lo único que no trae ninguna es la versión. (La frase exacta
 * no se repite aquí ni para citarla: la persigue un guardián por texto,
 * `test/regression-retarificar-vehiculo.test.ts`.)
 */
function SabidoDeLaFicha({
  vehiculo,
  autoMarca,
  autoModelo,
}: {
  vehiculo: VehiculoConocido
  autoMarca: Emparejamiento
  autoModelo: Emparejamiento
}) {
  return (
    <div
      style={{
        background: 'var(--panel2)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '10px 12px',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: 6,
      }}
    >
      <p className="muted" style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>
        LO QUE YA SABEMOS
      </p>
      <p style={{ margin: 0 }}>
        La compañía manda <strong>matrícula, marca y modelo</strong>. Lo que no manda ninguna póliza
        es la <strong>versión</strong>, que es justo lo que pide el tarificador.
      </p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Dato etiqueta="Marca (ficha)" valor={vehiculo.marca} estado={autoMarca.estado} />
        <Dato etiqueta="Modelo (ficha)" valor={vehiculo.modelo} estado={autoModelo.estado} />
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        Los desplegables son el catálogo de Codeoscopic y <strong>no cuestan nada</strong>: buscar el
        coche por matrícula sí costaría (créditos aparte, hoy sin contratar).
      </p>
    </div>
  )
}

function Dato({
  etiqueta,
  valor,
  estado,
}: {
  etiqueta: string
  valor: string | null
  estado: Emparejamiento['estado']
}) {
  return (
    <span style={{ minWidth: 0 }}>
      <span className="muted" style={{ fontSize: 12 }}>
        {etiqueta}:{' '}
      </span>
      {/* `null` = no consta en la póliza. No se pinta un hueco mudo. */}
      {valor === null ? (
        <span className="muted">no consta en la póliza</span>
      ) : (
        <strong>{valor}</strong>
      )}
      {valor !== null && estado === 'casa' && (
        <>
          {' '}
          <span className="badge ok">en el catálogo</span>
        </>
      )}
      {valor !== null && estado === 'no_casa' && (
        <>
          {' '}
          <span className="badge warn">no casa con el catálogo</span>
        </>
      )}
    </span>
  )
}

/** De dónde sale lo que hay puesto en un desplegable — o por qué no hay nada. */
function ProcedenciaCatalogo({
  emp,
  elegido,
  que,
}: {
  emp: Emparejamiento
  elegido: string
  que: string
}) {
  if (emp.estado === 'casa') {
    return elegido === emp.opcion.id ? (
      <>
        Viene de la ficha (<strong>{emp.texto}</strong>). Se puede cambiar.
      </>
    ) : (
      <>
        La ficha dice <strong>{emp.texto}</strong>; aquí hay elegida otra cosa a mano.
      </>
    )
  }
  if (emp.estado === 'no_casa') {
    return (
      <>
        La ficha dice <strong>{emp.texto}</strong>
        {emp.cuantas > 1
          ? `, pero el catálogo tiene ${emp.cuantas} entradas con ese mismo nombre y no se elige por ti: `
          : ', pero no está en el catálogo con ese nombre: '}
        elige la {que} a mano. <strong>No es que no lo sepamos</strong>: es que el catálogo lo llama
        de otra forma.
      </>
    )
  }
  if (emp.estado === 'sin_dato') {
    return <>La póliza no trae la {que}: elígela a mano.</>
  }
  return <>Sin preseleccionar: {emp.porque}.</>
}

/**
 * Las versiones vistas en OTRAS pólizas de la misma matrícula.
 *
 * 🚨 Son PISTAS, nunca una selección. Son texto histórico de otra póliza, no
 * códigos Base7 del catálogo, y con dos o más pueden contradecirse entre sí
 * (caso real: `FORTWO COUPE PURE 52…` contra `FORFOUR PURE 1.1…`). Con 2+
 * candidatas decide la persona, y la pantalla lo dice en vez de insinuar que
 * una de ellas es «el dato».
 */
function PistasDeVersion({ versiones }: { versiones: VersionCandidata[] }) {
  if (versiones.length === 0) {
    return (
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        Ninguna otra póliza de esta matrícula guarda la versión. Sale de la ficha técnica (campo{' '}
        <strong>D.2</strong>) o preguntando al cliente.
      </p>
    )
  }
  return (
    <div
      style={{
        marginTop: 12,
        border: '1px solid var(--border)',
        borderLeft: '3px solid var(--warn)',
        borderRadius: 8,
        padding: '10px 12px',
      }}
    >
      <p style={{ margin: 0, fontWeight: 600 }}>
        {versiones.length === 1 ? 'Una pista' : `${versiones.length} pistas`} para buscar la versión
      </p>
      <p className="muted" style={{ margin: '2px 0 6px', fontSize: 12 }}>
        Texto de otras pólizas de esta misma matrícula. <strong>No son opciones del catálogo</strong>{' '}
        y por eso no se preselecciona ninguna
        {versiones.length > 1 && (
          <>
            {' '}
            — y encima <strong>se contradicen entre sí</strong>, así que aquí decides tú
          </>
        )}
        .
      </p>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {versiones.map((v, i) => (
          <li key={`${v.version}-${i}`}>
            <code>{v.version}</code>{' '}
            <span className="muted" style={{ fontSize: 12 }}>
              — {v.procedencia}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * El contador de gasto.
 *
 * En simulación no se toca el libro, así que su estado se cuenta como
 * información de contexto y NO en rojo: un «tarificación apagada» en rojo sobre
 * una pantalla que sí funciona y no cuesta nada es una afirmación falsa.
 */
function Contador({ consumo, simulacion }: { consumo: Consumo; simulacion: boolean }) {
  if (simulacion) {
    return (
      <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
        En simulación no se apunta nada en el libro de consumo ni cuenta contra el tope.{' '}
        {'error' in consumo ? (
          <>Estado del interruptor real (no afecta a esta pantalla): {consumo.error}</>
        ) : (
          <>
            Del contador real: gastado este mes {consumo.gastadoMes}
            {consumo.veredicto.permitido ? (
              <> · quedarían hoy {consumo.veredicto.restantesHoy} cotizaciones de verdad.</>
            ) : (
              <> · el tope real está alcanzado ({consumo.veredicto.explicacion}).</>
            )}
          </>
        )}
      </p>
    )
  }
  if ('error' in consumo) {
    // Sin libro no se cotiza: un tope que no se puede comprobar no es un tope.
    return <p className="err">{consumo.error}</p>
  }
  return (
    <p className={consumo.veredicto.permitido ? 'muted' : 'err'} style={{ marginBottom: 0 }}>
      Gastado este mes: <strong>{consumo.gastadoMes}</strong>
      {consumo.veredicto.permitido ? (
        <>
          {' '}
          · quedan hoy <strong>{consumo.veredicto.restantesHoy}</strong> cotizaciones.
        </>
      ) : (
        <> — {consumo.veredicto.explicacion}</>
      )}
    </p>
  )
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const CAJA_SIMULACION: React.CSSProperties = {
  border: '1px solid var(--warn)',
  background: 'rgba(217, 119, 6, 0.08)',
  borderRadius: 8,
  padding: '10px 12px',
}

const CAJA_COSTE: React.CSSProperties = {
  border: '1px solid var(--danger)',
  background: 'rgba(220, 38, 38, 0.08)',
  borderRadius: 8,
  padding: '10px 12px',
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
 * Reparos que ESTA pantalla resuelve con un desplegable o una caja. Lo que no
 * esté aquí ni en `CAMPOS_A_MANO` se declara como «no se arregla desde aquí»
 * en vez de desaparecer: un hueco que no se ve es el peor de los estados.
 */
const RESUELTOS_EN_PANTALLA = new Set<string>([
  'codigoVehiculo',
  'garaje',
  'fechaMatriculacion',
  'municipioCirculacionId',
  'estadoCivil',
  'sexo',
])
