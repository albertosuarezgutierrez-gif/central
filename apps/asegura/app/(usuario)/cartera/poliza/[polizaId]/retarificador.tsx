'use client'

import { useEffect, useState } from 'react'
import type { Opcion } from '@/lib/codeoscopic/catalogos'
import type { Reparo } from '@/lib/codeoscopic/peticion-auto'
import type { Supuesto } from '@/lib/codeoscopic/desde-cartera'
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

type Resultado =
  | { estado: 'idle' }
  | { estado: 'cotizando' }
  | {
      estado: 'ok'
      coste: string
      restantesHoy: number
      resumen: string
      precios: Precio[]
      supuestos: Supuesto[]
    }
  | { estado: 'faltan'; faltan: Reparo[] }
  | { estado: 'error'; mensaje: string; tope?: boolean }

/**
 * El único sitio de la app donde un clic cuesta 0,50€.
 *
 * Tres cosas son deliberadas:
 *  - El botón dice el precio EN el botón, no en una nota al pie.
 *  - Se deshabilita mientras cotiza: `POST /insurances` no es idempotente, así
 *    que un doble clic serían dos proyectos y dos cargos.
 *  - Si el vendor tarda y no responde, NO se reintenta solo. La cotización queda
 *    contada como gastada porque no hay prueba de que no se haya facturado.
 */
export default function Retarificador({
  polizaId,
  faltanInicial,
  garajes,
  civiles,
  municipios,
  estadoCivilAuto,
  fechaMatriculacion,
  consumo,
  deshabilitado,
}: {
  polizaId: string
  faltanInicial: Reparo[]
  garajes: Opcion[]
  civiles: Opcion[]
  municipios: Opcion[]
  estadoCivilAuto: Opcion | null
  fechaMatriculacion: string | null
  consumo: Consumo
  deshabilitado: boolean
}) {
  // ── Vehículo: marca → modelo → versión, todo del catálogo y todo gratis ────
  const [marcas, setMarcas] = useState<Opcion[]>([])
  const [modelos, setModelos] = useState<Opcion[]>([])
  const [versiones, setVersiones] = useState<Opcion[]>([])
  const [marcaId, setMarcaId] = useState('')
  const [modeloId, setModeloId] = useState('')
  const [codigoVehiculo, setCodigoVehiculo] = useState('')
  const [cargando, setCargando] = useState<string | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)

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

  useEffect(() => {
    if (deshabilitado) return
    setCargando('marcas')
    catalogo('tipo=marcas')
      .then(setMarcas)
      .catch((e: Error) => setFallo(e.message))
      .finally(() => setCargando(null))
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

  async function alElegirModelo(id: string) {
    setModeloId(id)
    setCodigoVehiculo('')
    setVersiones([])
    if (!id) return
    setCargando('versiones')
    try {
      setVersiones(
        await catalogo(
          `tipo=versiones&marcaId=${encodeURIComponent(marcaId)}&modeloId=${encodeURIComponent(id)}`,
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
      setResultado({
        estado: 'ok',
        coste: String(j.coste),
        restantesHoy: Number(j.restantesHoy),
        resumen: String(j.resumen),
        precios: (j.precios as Precio[]) ?? [],
        supuestos: (j.supuestos as Supuesto[]) ?? [],
      })
    } catch (e) {
      // Un fallo de red aquí NO significa que no nos hayan cobrado.
      setResultado({
        estado: 'error',
        mensaje:
          `${(e as Error).message} — la cotización puede haberse cobrado igualmente. ` +
          `No vuelvas a pulsar sin comprobar el consumo.`,
      })
    }
  }

  const faltanCampos = [
    !codigoVehiculo && 'la versión del vehículo',
    !garaje && 'el tipo de garaje',
    !estadoCivilId && 'el estado civil',
    !municipioId && 'el municipio',
    !matriculacion && 'la fecha de matriculación',
  ].filter(Boolean) as string[]

  const cotizando = resultado.estado === 'cotizando'
  const puedePulsar =
    !deshabilitado &&
    !cotizando &&
    faltanCampos.length === 0 &&
    !('error' in consumo ? true : !consumo.veredicto.permitido)

  return (
    <>
      <div className="card">
        <h2>El vehículo</h2>
        <p className="muted">
          La compañía manda la matrícula pero no el modelo, así que hay que elegirlo. Estos
          desplegables son el catálogo de Codeoscopic y <strong>no cuestan nada</strong>: buscar el
          coche por matrícula sí costaría (créditos aparte, hoy sin contratar).
        </p>
        {fallo && <p className="err">{fallo}</p>}
        <div className="form-grid">
          <div>
            <label htmlFor="marca">Marca</label>
            <select
              id="marca"
              value={marcaId}
              onChange={(e) => void alElegirMarca(e.target.value)}
              disabled={deshabilitado || cargando === 'marcas'}
            >
              <option value="">{cargando === 'marcas' ? 'Cargando…' : 'Elige marca'}</option>
              {marcas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="modelo">Modelo</label>
            <select
              id="modelo"
              value={modeloId}
              onChange={(e) => void alElegirModelo(e.target.value)}
              disabled={!marcaId || cargando === 'modelos'}
            >
              <option value="">{cargando === 'modelos' ? 'Cargando…' : 'Elige modelo'}</option>
              {modelos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="version">Versión</label>
            <select
              id="version"
              value={codigoVehiculo}
              onChange={(e) => setCodigoVehiculo(e.target.value)}
              disabled={!modeloId || cargando === 'versiones'}
            >
              <option value="">{cargando === 'versiones' ? 'Cargando…' : 'Elige versión'}</option>
              {versiones.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="matriculacion">Fecha de matriculación</label>
            <input
              id="matriculacion"
              type="date"
              value={matriculacion}
              onChange={(e) => setMatriculacion(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="garaje">¿Dónde duerme?</label>
            <select id="garaje" value={garaje} onChange={(e) => setGaraje(e.target.value)}>
              <option value="">Elige garaje</option>
              {garajes.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>El tomador</h2>
        <div className="form-grid">
          <div>
            <label htmlFor="civil">Estado civil</label>
            <select
              id="civil"
              value={estadoCivilId}
              onChange={(e) => setEstadoCivilId(e.target.value)}
            >
              <option value="">Elige estado civil</option>
              {civiles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            {estadoCivilAuto && (
              <span className="muted" style={{ fontSize: 12 }}>
                Cogido de la ficha.
              </span>
            )}
          </div>
          <div>
            <label htmlFor="municipio">Municipio</label>
            <select
              id="municipio"
              value={municipioId}
              onChange={(e) => setMunicipioId(e.target.value)}
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
          </div>
        </div>

        {faltanInicial.length > 0 && (
          <>
            <p className="muted" style={{ marginTop: 12 }}>
              De la ficha faltan estos datos. Rellénalos aquí — no se inventan solos:
            </p>
            <div className="form-grid">
              {faltanInicial.some((f) => f.campo === 'sexo') && (
                <div>
                  <label htmlFor="c-sexo">Sexo</label>
                  <select
                    id="c-sexo"
                    value={correcciones.sexo ?? ''}
                    onChange={(e) => setCorrecciones((c) => ({ ...c, sexo: e.target.value }))}
                  >
                    <option value="">Elige</option>
                    <option value="hombre">Hombre</option>
                    <option value="mujer">Mujer</option>
                  </select>
                  <span className="muted" style={{ fontSize: 12 }}>
                    La ficha no lo dice y no se adivina por el nombre.
                  </span>
                </div>
              )}
              {faltanInicial
                .filter((f) => CAMPOS_A_MANO[f.campo])
                .map((f) => (
                  <div key={f.campo}>
                    <label htmlFor={`c-${f.campo}`}>{CAMPOS_A_MANO[f.campo]!.etiqueta}</label>
                    <input
                      id={`c-${f.campo}`}
                      type={CAMPOS_A_MANO[f.campo]!.tipo}
                      value={correcciones[f.campo] ?? ''}
                      onChange={(e) =>
                        setCorrecciones((c) => ({ ...c, [f.campo]: e.target.value }))
                      }
                    />
                    <span className="muted" style={{ fontSize: 12 }}>
                      {f.motivo}
                    </span>
                  </div>
                ))}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2>Cotizar</h2>
        {'error' in consumo ? (
          <p className="err">{consumo.error}</p>
        ) : (
          <p className={consumo.veredicto.permitido ? 'muted' : 'err'}>
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
        )}

        {faltanCampos.length > 0 && (
          <p className="muted">Antes de cotizar falta elegir: {faltanCampos.join(', ')}.</p>
        )}

        <button
          type="button"
          className="primary"
          onClick={() => void cotizar()}
          disabled={!puedePulsar}
        >
          {cotizando ? 'Cotizando… (puede tardar hasta 2 min)' : 'Pedir precio — cuesta 0,50€'}
        </button>

        {resultado.estado === 'faltan' && (
          <div style={{ marginTop: 12 }}>
            <p className="badge ok">No se ha gastado nada</p>
            <ul>
              {resultado.faltan.map((f) => (
                <li key={f.campo}>
                  <strong>{f.campo}</strong>: {f.motivo}
                </li>
              ))}
            </ul>
          </div>
        )}

        {resultado.estado === 'error' && (
          <p className="err" style={{ marginTop: 12 }}>
            {resultado.tope ? '🛑 Tope alcanzado: ' : '⚠️ '}
            {resultado.mensaje}
          </p>
        )}

        {resultado.estado === 'ok' && (
          <div style={{ marginTop: 12 }}>
            <p>
              <strong>{resultado.resumen}</strong>
            </p>
            <p className="muted">
              Coste de esta consulta: {resultado.coste} · quedan hoy {resultado.restantesHoy}.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Compañía</th>
                    <th>Producto</th>
                    <th>Prima anual</th>
                    <th>Firmeza</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.precios.map((p, i) => (
                    <tr key={`${p.compania}-${p.producto}-${i}`}>
                      <td>{p.compania ?? '—'}</td>
                      <td>{p.producto ?? '—'}</td>
                      <td>{eur(p.primaAnual)}</td>
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
            {resultado.precios.some((p) => p.firmeza !== 'firme') && (
              <p className="muted">
                Los precios marcados como estimado o condicionado <strong>no son ofertas
                cerradas</strong>: la compañía puede cambiarlos al verificar los datos.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  )
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
