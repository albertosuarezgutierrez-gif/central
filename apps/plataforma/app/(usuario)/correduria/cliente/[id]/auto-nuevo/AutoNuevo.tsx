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
import { pedirCatalogo, pedirCotizacionAuto } from './acciones'

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

  const cotizando = resultado.estado === 'cotizando'
  const consumoPermite = consumo.estado === 'ok' ? consumo.veredicto.permitido : consumo.estado === 'no_disponible'
  const faltaAlgo =
    faltaVersion || faltaGaraje || faltaCivil || faltaMunicipio || faltaMatricula || faltaMatriculacion ||
    aManoSinRellenar.length > 0
  const puedePulsar = !cotizando && !faltaAlgo && (simulacion || consumoPermite)

  async function cotizar() {
    setResultado({ estado: 'cotizando' })
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
      correcciones,
    })
    switch (r.estado) {
      case 'faltan':
        setResultado({ estado: 'faltan', faltan: r.faltan })
        return
      case 'tope':
        setResultado({ estado: 'error', mensaje: r.mensaje, tope: true, gastoDesconocido: false })
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
        })
        return
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
            <select value={marcaId} onChange={(e) => void alElegirMarca(e.target.value)} disabled={cargando === 'marcas'} style={input}>
              <option value="">{cargando === 'marcas' ? 'Cargando…' : 'Elige marca'}</option>
              {marcas.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Modelo" falta={false}>
            <select value={modeloId} onChange={(e) => alElegirModelo(e.target.value)} disabled={!marcaId || cargando === 'modelos'} style={input}>
              <option value="">{cargando === 'modelos' ? 'Cargando…' : 'Elige modelo'}</option>
              {modelos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Combustible" falta={motorId === ''} faltaTexto="lo elige el corredor">
            <select value={motorId} onChange={(e) => alElegirMotor(e.target.value)} disabled={cargando === 'motores'} style={input}>
              <option value="">{cargando === 'motores' ? 'Cargando…' : 'Elige combustible'}</option>
              {motores.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Versión" falta={faltaVersion} faltaTexto="la elige el corredor">
            <select value={codigoVehiculo} onChange={(e) => setCodigoVehiculo(e.target.value)} disabled={!modeloId || !motorId || cargando === 'versiones'} style={input}>
              <option value="">{cargando === 'versiones' ? 'Cargando…' : !motorId ? 'Elige antes el combustible' : 'Elige versión'}</option>
              {versiones.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </select>
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
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
          <thead>
            <tr>
              <th style={th}>Compañía</th><th style={th}>Producto</th><th style={th}>Cobertura</th>
              <th style={th}>Prima anual</th><th style={th}>Franquicia</th><th style={th}>Firmeza</th>
            </tr>
          </thead>
          <tbody>
            {r.precios.map((p, i) => (
              <tr key={`${p.compania}-${p.producto}-${i}`}>
                <td style={td}>{p.compania ?? '—'}</td>
                <td style={td}>{p.producto ?? '—'}</td>
                <td style={td}>{p.categoria ?? <span style={{ color: 'var(--muted)' }}>sin declarar</span>}</td>
                <td style={td}>
                  <strong>{euroODash(p.primaEur)}</strong>
                  {r.simulado && <> <Badge tono="aviso">simulado</Badge></>}
                </td>
                <td style={td}>{p.franquiciaEur === null || p.franquiciaEur === undefined ? <span style={{ color: 'var(--muted)' }}>no la declara</span> : euroODash(p.franquiciaEur)}</td>
                <td style={td}><Badge tono={p.firmeza === 'firme' ? 'positivo' : 'aviso'} title={p.avisos?.join(' · ')}>{p.firmeza ?? 'sin determinar'}</Badge></td>
              </tr>
            ))}
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
