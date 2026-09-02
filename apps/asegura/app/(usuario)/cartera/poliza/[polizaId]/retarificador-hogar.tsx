'use client'

import { useMemo, useState } from 'react'
import type { DisponibilidadHogar } from '@/lib/codeoscopic/catalogos'
import type { Opcion } from '@/lib/codeoscopic/opciones'
import { revisarDatosHogar, TOPE_JOYAS, type DatosHogar } from '@/lib/codeoscopic/peticion-hogar'
import type { PrecalificacionHogar, SupuestoHogar } from '@/lib/codeoscopic/desde-cartera-hogar'
import {
  resumen as armarResumen,
  CATALOGOS_PANTALLA,
  CAMPO_DE_CATALOGO,
  GRUPOS,
  PROCEDENCIAS,
  type CatalogoPantalla,
  type Fila,
  type Resumen,
} from '@/lib/codeoscopic/resumen-hogar'
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
      /** `null` = no se ha mirado el libro (modo simulación), NUNCA «quedan 0». */
      restantesHoy: number | null
      /** El precio lo ha inventado central para ver la pantalla: no lo ha dado ninguna compañía. */
      simulado: boolean
      avisoSimulacion: string | null
      resumen: string
      precios: Precio[]
      supuestos: SupuestoHogar[]
      fuenteRiesgo: string | null
    }
  | { estado: 'faltan'; faltan: { campo: string; motivo: string }[] }
  | { estado: 'error'; mensaje: string; clase: 'tope' | 'ramo' | 'vendor' | 'otro' }

/** El id por defecto de cada desplegable (o `null` si el catálogo no da nada que suponer). */
export type DefectosHogar = Record<CatalogoPantalla | 'road-types', string | null>

/**
 * Campos que la precalificación puede echar en falta y que NO tienen fila en la
 * ficha (viven en la persona, no en la vivienda). Sin esto un hueco de sexo
 * apagaría el botón sin decir por qué: el peor de los estados, «no se sabe»
 * disfrazado de nada.
 */
const HUERFANOS: Record<string, { etiqueta: string; tipo: 'texto' | 'sexo' }> = {
  sexo: { etiqueta: 'Sexo', tipo: 'sexo' },
  cpResidencia: { etiqueta: 'Código postal de residencia', tipo: 'texto' },
}

/**
 * La ficha de hogar: **se lee, no se rellena.**
 *
 * Todo llega puesto (de la póliza, del volcado, del Catastro o supuesto) y cada
 * fila dice DE DÓNDE sale; el corredor solo toca lo que esté mal, con el lápiz.
 * Es la diferencia entre un formulario en blanco —donde un valor por defecto es
 * indistinguible de un dato real en cuanto se escribe— y un expediente que
 * declara su propia procedencia.
 *
 * Las filas las arma `lib/codeoscopic/resumen-hogar.ts` (puro) en el SERVIDOR.
 * Al corregir una, la ficha se rehace **aquí**, con la misma función pura y el
 * mismo revisor que usa el puerto: recalcular en el cliente evita duplicar el
 * formateo y, sobre todo, evita que la pantalla y el servidor discrepen sobre
 * qué falta. No hay ida y vuelta al servidor: corregir no cuesta dinero.
 *
 * El botón sigue siendo lo único que gasta (0,50€ por clic) y conserva su
 * contrato con el puerto: `resueltos` + `correcciones`.
 */
export default function RetarificadorHogar({
  polizaId,
  resumen: resumenServidor,
  pre,
  defectos,
  vias,
  catalogos,
  estadosCiviles,
  municipios,
  fallosCatalogo,
  ramo,
  consumo,
  primaActual,
  deshabilitado,
}: {
  polizaId: string
  /** La ficha ya armada en el servidor: es lo que se pinta mientras nadie corrija nada. */
  resumen: Resumen
  /** La precalificación entera, para rehacer la ficha al corregir una fila. */
  pre: PrecalificacionHogar
  defectos: DefectosHogar
  /** `/road-types`. Vacío = no se pudo leer, y el tipo de vía es obligatorio. */
  vias: Opcion[]
  catalogos: Partial<Record<CatalogoPantalla, Opcion[]>>
  estadosCiviles: Opcion[]
  municipios: Opcion[]
  /** Catálogos que no se han podido leer (por nombre). Todos son obligatorios: uno bloquea el botón. */
  fallosCatalogo: string[]
  ramo: DisponibilidadHogar
  consumo: Consumo
  /** Lo que el cliente paga HOY al año. `null` = no consta en la ficha, y entonces no se dice nada. */
  primaActual: number | null
  deshabilitado: boolean
}) {
  // Lo que el corredor ha corregido a mano, por campo. `null` = «lo ha dejado
  // vacío», que NO es lo mismo que no haberlo tocado.
  const [correcciones, setCorrecciones] = useState<Record<string, unknown>>({})
  const [editando, setEditando] = useState<string | null>(null)
  const [borrador, setBorrador] = useState('')
  const [resultado, setResultado] = useState<Resultado>({ estado: 'idle' })

  const corregidos = useMemo(() => new Set(Object.keys(correcciones)), [correcciones])

  // Qué desplegables trae la pantalla por DEFECTO (no elegidos por nadie). Se
  // toma de la ficha del servidor: es la que sabe qué supuso la precalificación.
  const supuestosDeOrigen = useMemo(
    () => new Set(resumenServidor.supuestos.map((f) => f.campo as string)),
    [resumenServidor],
  )

  const ficha: Resumen = useMemo(() => {
    if (corregidos.size === 0) return resumenServidor
    const datos = { ...pre.datos, ...correcciones } as Partial<DatosHogar>
    return armarResumen(
      {
        ...pre,
        datos,
        // El mismo revisor que usa el puerto antes de gastar: si aquí falta
        // algo, allí también, y al revés.
        faltan: revisarDatosHogar(datos),
        // Un campo corregido deja de ser un supuesto: lo ha dicho una persona.
        supuestos: pre.supuestos.filter((s) => !corregidos.has(s.campo as string)),
      },
      { catalogos, estadosCiviles, municipios, corregidos, nivel: 'corredor' },
    )
  }, [pre, correcciones, corregidos, resumenServidor, catalogos, estadosCiviles, municipios])

  const porCampo = useMemo(() => new Map(ficha.filas.map((f) => [f.campo as string, f])), [ficha])

  // Lo que falta y NO tiene fila (sexo, CP de residencia): se teclea aparte.
  const faltanSinFila = useMemo(() => {
    const conFila = new Set(ficha.filas.map((f) => f.campo as string))
    const vistos = new Set<string>()
    return (corregidos.size === 0 ? pre.faltan : revisarDatosHogar({ ...pre.datos, ...correcciones } as Partial<DatosHogar>))
      .filter((f) => {
        const c = f.campo as string
        if (conFila.has(c) || vistos.has(c)) return false
        vistos.add(c)
        return true
      })
  }, [pre, correcciones, corregidos, ficha])

  function abrir(f: Fila) {
    setEditando(f.campo as string)
    setBorrador(aTexto(f))
  }

  function guardar(f: Fila) {
    const valor = deTexto(f, borrador)
    setCorrecciones((c) => ({ ...c, [f.campo as string]: valor }))
    setEditando(null)
  }

  function deshacer(campo: string) {
    setCorrecciones((c) => {
      const { [campo]: _fuera, ...resto } = c
      return resto
    })
    setEditando(null)
  }

  /** Los ids de catálogo que viajan como `resueltos` (el puerto los espera ahí, no en `correcciones`). */
  const CAMPOS_RESUELTOS = useMemo(() => {
    const s = new Set<string>(['municipioId', 'estadoCivil', 'tipoViaId', 'propietarioEsTomador'])
    for (const n of CATALOGOS_PANTALLA) s.add(CAMPO_DE_CATALOGO[n])
    return s
  }, [])

  function cuerpoResueltos(): Record<string, unknown> {
    const ids: Record<string, string | null> = {}
    const supuestos: Record<string, boolean> = {}
    for (const n of CATALOGOS_PANTALLA) {
      const campo = CAMPO_DE_CATALOGO[n]
      ids[campo] = cadena(porCampo.get(campo)?.valor)
      // Sigue siendo un valor por defecto de la pantalla mientras nadie lo toque.
      supuestos[campo] = !corregidos.has(campo) && supuestosDeOrigen.has(campo)
    }
    return {
      municipioId: entero(porCampo.get('municipioId')?.valor),
      estadoCivilId: cadena(porCampo.get('estadoCivil')?.valor) ?? '',
      tipoViaId: cadena(porCampo.get('tipoViaId')?.valor),
      ...ids,
      propietarioEsTomador: porCampo.get('propietarioEsTomador')?.valor === true,
      supuestos: { ...supuestos, tipoVia: !corregidos.has('tipoViaId') && supuestosDeOrigen.has('tipoViaId') },
    }
  }

  /** Solo viaja lo que ha tocado una persona; lo demás ya lo tiene la precalificación del servidor. */
  function cuerpoCorrecciones(): Record<string, unknown> {
    const c: Record<string, unknown> = {}
    for (const [campo, valor] of Object.entries(correcciones)) {
      if (CAMPOS_RESUELTOS.has(campo)) continue
      c[campo] = valor
    }
    return c
  }

  async function cotizar() {
    setResultado({ estado: 'cotizando' })
    try {
      const res = await fetch(`/api/cartera/polizas/${polizaId}/retarificar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resueltos: cuerpoResueltos(), correcciones: cuerpoCorrecciones() }),
      })
      const j = (await res.json()) as Record<string, unknown>
      if (res.status === 422) {
        setResultado({ estado: 'faltan', faltan: (j.faltan as { campo: string; motivo: string }[]) ?? [] })
        return
      }
      if (!res.ok) {
        const mensaje = String(j.error ?? `error ${res.status}`)
        setResultado({
          estado: 'error',
          mensaje,
          clase: res.status === 402 ? 'tope' : res.status === 409 ? 'ramo' : res.status === 502 ? 'vendor' : 'otro',
        })
        return
      }
      setResultado({
        estado: 'ok',
        coste: String(j.coste),
        // OJO: `Number(null)` es 0, y eso convertiría un «no se ha mirado» en
        // un «quedan 0 cotizaciones». Se conserva el hueco.
        restantesHoy: typeof j.restantesHoy === 'number' ? j.restantesHoy : null,
        simulado: j.simulado === true,
        avisoSimulacion: typeof j.avisoSimulacion === 'string' ? j.avisoSimulacion : null,
        resumen: String(j.resumen),
        precios: (j.precios as Precio[]) ?? [],
        supuestos: (j.supuestos as SupuestoHogar[]) ?? [],
        fuenteRiesgo: typeof j.fuenteRiesgo === 'string' ? j.fuenteRiesgo : null,
      })
    } catch (e) {
      // Un fallo de red aquí NO significa que no nos hayan cobrado.
      setResultado({
        estado: 'error',
        clase: 'otro',
        mensaje:
          `${(e as Error).message} — la cotización puede haberse cobrado igualmente. ` +
          `No vuelvas a pulsar sin comprobar el consumo.`,
      })
    }
  }

  // Un catálogo obligatorio sin leer (o vacío) bloquea: sin ids válidos no hay cuerpo.
  const fallaObligatorio =
    CATALOGOS_PANTALLA.some((n) => fallosCatalogo.includes(n) || !catalogos[n]?.length) ||
    fallosCatalogo.includes('road-types') ||
    vias.length === 0

  const cotizando = resultado.estado === 'cotizando'
  const consumoPermite = 'error' in consumo ? false : consumo.veredicto.permitido
  const puedePulsar =
    !deshabilitado && ramo.estado === 'disponible' && !fallaObligatorio && !cotizando && ficha.listo && consumoPermite

  return (
    <>
      {primaActual !== null && (
        <div className="card">
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Lo que paga hoy
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 26, fontWeight: 800, color: 'var(--brand)' }}>
            {eur(primaActual)} <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)' }}>al año</span>
          </p>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
            Cada precio que llegue se compara con esta cifra.
          </p>
        </div>
      )}

      {fallosCatalogo.length > 0 && (
        <div className="card err">
          No se han podido leer estos catálogos: {fallosCatalogo.join(', ')}. Todos son obligatorios para el
          vendor, así que no se puede cotizar todavía. No es un problema de la ficha.
        </div>
      )}

      {(ficha.faltan.length > 0 || faltanSinFila.length > 0) && (
        <div className="card">
          <h2 style={{ color: 'var(--danger)' }}>Falta esto para poder pedir precio</h2>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            {ficha.faltan.map((f) => (
              <li key={f.campo as string} style={{ marginBottom: 6 }}>
                <strong>{f.etiqueta}</strong>: {f.falta}{' '}
                <a href={`#fila-${String(f.campo)}`} onClick={() => abrir(f)}>
                  corregir ↓
                </a>
              </li>
            ))}
          </ul>
          {faltanSinFila.length > 0 && (
            <div className="form-grid" style={{ marginTop: 12 }}>
              {faltanSinFila.map((f) => {
                const campo = f.campo as string
                const h = HUERFANOS[campo]
                return (
                  <div key={campo}>
                    <label htmlFor={`h-${campo}`}>{h?.etiqueta ?? campo}</label>
                    {h?.tipo === 'sexo' ? (
                      <select
                        id={`h-${campo}`}
                        value={String(correcciones[campo] ?? '')}
                        onChange={(e) => setCorrecciones((c) => ({ ...c, [campo]: e.target.value || null }))}
                        style={{ minHeight: 44 }}
                      >
                        <option value="">Elige</option>
                        <option value="hombre">Hombre</option>
                        <option value="mujer">Mujer</option>
                      </select>
                    ) : (
                      <input
                        id={`h-${campo}`}
                        value={String(correcciones[campo] ?? '')}
                        onChange={(e) => setCorrecciones((c) => ({ ...c, [campo]: e.target.value || null }))}
                        style={{ minHeight: 44 }}
                      />
                    )}
                    <span className="muted" style={{ fontSize: 12 }}>
                      {f.motivo}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── La ficha ───────────────────────────────────────────────────────── */}
      {GRUPOS.map((g) => {
        const filas = ficha.filas.filter((f) => f.grupo === g.id)
        if (filas.length === 0) return null
        return (
          <div className="card" key={g.id}>
            <h2>{g.titulo}</h2>
            {g.nota && (
              <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {g.nota}
              </p>
            )}
            <div style={{ marginTop: 8 }}>
              {filas.map((f) => (
                <FilaFicha
                  key={f.campo as string}
                  fila={f}
                  editando={editando === (f.campo as string)}
                  borrador={borrador}
                  setBorrador={setBorrador}
                  abrir={() => abrir(f)}
                  cerrar={() => setEditando(null)}
                  guardar={() => guardar(f)}
                  deshacer={() => deshacer(f.campo as string)}
                  vias={vias}
                  catalogos={catalogos}
                  estadosCiviles={estadosCiviles}
                  municipios={municipios}
                  defectos={defectos}
                />
              ))}
            </div>
          </div>
        )
      })}

      {/* ── El botón: lo único que gasta ───────────────────────────────────── */}
      <div className="card">
        <h2>Pedir precio</h2>
        {ramo.estado !== 'disponible' && (
          <p className="err">
            {ramo.estado === 'ausente'
              ? `Hogar NO está entre los ramos que Codeoscopic tarifica para esta organización (hay: ${ramo.ramos.join(', ')}). Hay que pedírselo a Codeoscopic; hasta entonces el botón no hace nada.`
              : 'No se ha podido comprobar si hogar tarifica para esta organización (la lista de ramos no llegó). No se cotiza a ciegas.'}
          </p>
        )}
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
        {ficha.optimistas.length > 0 && (
          <p className="muted" style={{ fontSize: 12 }}>
            ⚠️ {ficha.optimistas.length} de los supuestos ABARATAN el precio ({ficha.optimistas
              .map((f) => f.etiqueta.toLowerCase())
              .join(', ')}): si el cliente los desmiente, la prima real sube.
          </p>
        )}

        <button
          type="button"
          className="primary"
          onClick={() => void cotizar()}
          disabled={!puedePulsar}
          style={{ minHeight: 44, width: '100%', maxWidth: 420 }}
        >
          {cotizando ? 'Cotizando… (puede tardar hasta 2 min)' : 'Pedir precio (0,50€)'}
        </button>
        {!ficha.listo && (
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            El botón se enciende cuando no falte nada arriba. Corregir la ficha no cuesta nada.
          </p>
        )}

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
          <div className="err" style={{ marginTop: 12 }}>
            {resultado.clase === 'tope' && '🛑 Tope alcanzado: '}
            {resultado.clase === 'ramo' && '🚫 Ramo: '}
            {resultado.clase === 'vendor' &&
              '⚠️ Respuesta del vendor (entera, porque dice qué campo del contrato sobra o falta): '}
            {resultado.clase === 'otro' && '⚠️ '}
            <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{resultado.mensaje}</span>
            {resultado.clase === 'vendor' && (
              <p className="muted" style={{ fontSize: 12 }}>
                Si es un 400 de validación, NO se ha cobrado. Un timeout o un 5xx sí cuentan como gastados.
              </p>
            )}
          </div>
        )}

        {resultado.estado === 'ok' && (
          <div style={{ marginTop: 12 }}>
            {/* Un precio simulado y uno real se leen igual: la única diferencia
                está en este cartel, así que va ENCIMA del listado y no como
                nota al pie. */}
            {resultado.simulado && (
              <div
                className="card"
                style={{ borderColor: 'var(--warn)', background: 'rgba(217, 119, 6, 0.08)', marginBottom: 12 }}
              >
                <p style={{ margin: 0, fontWeight: 700, color: 'var(--warn)' }}>🧪 ESTO ES UNA SIMULACIÓN</p>
                <p style={{ margin: '4px 0 0' }}>
                  {resultado.avisoSimulacion ??
                    'Precio inventado por central para probar la pantalla: ninguna compañía lo ha dado y no se ha ' +
                      'gastado ni un céntimo.'}
                </p>
              </div>
            )}
            <p>
              <strong>{resultado.resumen}</strong>
            </p>
            <p className="muted">
              Coste de esta consulta: {resultado.coste}
              {/* `null` = no se ha leído el libro (simulación). Decir «quedan 0»
                  sería convertir un «no se sabe» en una cifra. */}
              {resultado.restantesHoy !== null && <> · quedan hoy {resultado.restantesHoy}</>}.
              {resultado.fuenteRiesgo && <> · riesgo según: {FUENTE[resultado.fuenteRiesgo] ?? resultado.fuenteRiesgo}</>}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Compañía</th>
                    <th>Producto</th>
                    <th>Prima anual</th>
                    <th>{primaActual === null ? 'Diferencia' : 'Frente a lo que paga hoy'}</th>
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
                        <Diferencia primaActual={primaActual} nueva={p.primaAnual ?? null} />
                      </td>
                      <td>
                        {/* La firmeza va PEGADA al precio: enseñar la prima sola
                            promete algo que la compañía no ha cerrado. */}
                        <span className={`badge ${p.firmeza === 'firme' ? 'ok' : 'warn'}`} title={p.avisos?.join(' · ')}>
                          {p.firmeza ?? 'sin determinar'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!resultado.simulado && resultado.precios.some((p) => p.firmeza !== 'firme') && (
              <p className="muted">
                Los precios marcados como estimado o condicionado <strong>no son ofertas cerradas</strong>: la
                compañía puede cambiarlos al verificar los datos.
              </p>
            )}
            {resultado.supuestos.length > 0 && (
              <>
                <p className="muted" style={{ marginTop: 8 }}>
                  Este precio sale con estos supuestos:
                </p>
                <ul>
                  {resultado.supuestos.map((s) => (
                    <li key={`${String(s.campo)}-${String(s.valor)}`}>
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
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ─── Una fila de la ficha ────────────────────────────────────────────────────

function FilaFicha({
  fila,
  editando,
  borrador,
  setBorrador,
  abrir,
  cerrar,
  guardar,
  deshacer,
  vias,
  catalogos,
  estadosCiviles,
  municipios,
  defectos,
}: {
  fila: Fila
  editando: boolean
  borrador: string
  setBorrador: (v: string) => void
  abrir: () => void
  cerrar: () => void
  guardar: () => void
  deshacer: () => void
  vias: Opcion[]
  catalogos: Partial<Record<CatalogoPantalla, Opcion[]>>
  estadosCiviles: Opcion[]
  municipios: Opcion[]
  defectos: DefectosHogar
}) {
  const campo = fila.campo as string
  // Un dato personal que ya consta NO se reescribe aquí (`editable: false`),
  // pero si FALTA hay que poder teclearlo: no se inventa solo y sin él no hay
  // precio. Es la única puerta que se le abre.
  const sePuedeTocar = fila.editable || fila.falta !== null

  return (
    <div
      id={`fila-${campo}`}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        gap: 8,
        padding: '10px 0',
        borderTop: '1px solid var(--border)',
      }}
    >
      <div style={{ flex: '1 1 180px', minWidth: 0 }}>
        <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
          {fila.etiqueta}
        </div>
        {!editando && (
          <>
            <div style={{ fontSize: 15, wordBreak: 'break-word' }}>
              {fila.falta !== null && fila.legible === '—' ? <span className="muted">—</span> : fila.legible}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, alignItems: 'center' }}>
              {fila.procedencia && (
                <span className={`badge ${fila.procedencia === 'corregido' ? 'ok' : ''}`} style={{ fontSize: 11 }}>
                  {PROCEDENCIAS[fila.procedencia]}
                </span>
              )}
              {fila.optimista && (
                <span className="badge warn" style={{ fontSize: 11 }}>
                  esto puede subir
                </span>
              )}
              {fila.falta !== null && (
                <span className="badge danger" style={{ fontSize: 11 }}>
                  falta: {fila.falta}
                </span>
              )}
            </div>
            {/* El porqué de un supuesto es la letra pequeña del precio: tiene
                que poder leerse ENTERO, no recortado en un `title`. */}
            {fila.porque && (
              <details style={{ marginTop: 4 }}>
                <summary className="muted" style={{ fontSize: 12, cursor: 'pointer', minHeight: 24 }}>
                  por qué
                </summary>
                <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                  {fila.porque}
                </p>
              </details>
            )}
          </>
        )}

        {editando && (
          <div style={{ marginTop: 4 }}>
            <Control
              fila={fila}
              borrador={borrador}
              setBorrador={setBorrador}
              vias={vias}
              catalogos={catalogos}
              estadosCiviles={estadosCiviles}
              municipios={municipios}
              defectos={defectos}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              <button type="button" className="primary" onClick={guardar} style={{ minHeight: 44 }}>
                Guardar
              </button>
              <button type="button" className="ghost" onClick={cerrar} style={{ minHeight: 44 }}>
                Cancelar
              </button>
              {fila.procedencia === 'corregido' && (
                <button type="button" className="ghost" onClick={deshacer} style={{ minHeight: 44 }}>
                  Volver al valor de la ficha
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {!editando && sePuedeTocar && (
        <button
          type="button"
          className="ghost"
          onClick={abrir}
          aria-label={`Corregir ${fila.etiqueta}`}
          title={`Corregir ${fila.etiqueta}`}
          style={{ minWidth: 44, minHeight: 44, flex: '0 0 auto' }}
        >
          ✏️
        </button>
      )}
    </div>
  )
}

function Control({
  fila,
  borrador,
  setBorrador,
  vias,
  catalogos,
  estadosCiviles,
  municipios,
  defectos,
}: {
  fila: Fila
  borrador: string
  setBorrador: (v: string) => void
  vias: Opcion[]
  catalogos: Partial<Record<CatalogoPantalla, Opcion[]>>
  estadosCiviles: Opcion[]
  municipios: Opcion[]
  defectos: DefectosHogar
}) {
  const id = `edit-${String(fila.campo)}`
  const alto = { minHeight: 44 } as const

  if (fila.control === 'siNo') {
    return (
      <label htmlFor={id} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, color: 'inherit', fontSize: 14 }}>
        <input
          id={id}
          type="checkbox"
          checked={borrador === 'si'}
          onChange={(e) => setBorrador(e.target.checked ? 'si' : 'no')}
          style={{ width: 20, height: 20, padding: 0, margin: 0, flex: '0 0 auto' }}
        />
        Sí
      </label>
    )
  }

  if (fila.control === 'siNoNoSe') {
    return (
      <select id={id} value={borrador} onChange={(e) => setBorrador(e.target.value)} style={alto}>
        {/* Tres estados: «no se sabe» es una respuesta, no un hueco — y no viaja. */}
        <option value="">No se sabe (no viaja)</option>
        <option value="si">Sí</option>
        <option value="no">No</option>
      </select>
    )
  }

  if (fila.control === 'municipio') {
    return (
      <>
        <select id={id} value={borrador} onChange={(e) => setBorrador(e.target.value)} style={alto}>
          <option value="">{municipios.length === 0 ? 'Sin código postal utilizable' : 'Elige municipio'}</option>
          {municipios.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
        {municipios.length > 1 && (
          <span className="muted" style={{ fontSize: 12 }}>
            Este CP tiene {municipios.length} municipios: decide tú, no se elige uno a ciegas.
          </span>
        )}
      </>
    )
  }

  if (fila.control === 'opcion' || String(fila.campo) === 'tipoViaId') {
    // El tipo de vía es un texto en la ficha pero un id de `/road-types` para el
    // vendor: si se teclea a mano no vale, así que se elige de su catálogo.
    const esVia = String(fila.campo) === 'tipoViaId'
    const lista = esVia
      ? vias
      : String(fila.campo) === 'estadoCivil'
        ? estadosCiviles
        : (fila.catalogo ? catalogos[fila.catalogo] : undefined) ?? []
    const porDefecto = esVia ? defectos['road-types'] : fila.catalogo ? defectos[fila.catalogo] : null
    return (
      <select id={id} value={borrador} onChange={(e) => setBorrador(e.target.value)} style={alto} disabled={lista.length === 0}>
        <option value="">{lista.length === 0 ? 'Catálogo no disponible' : 'Elige'}</option>
        {lista.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
            {o.id === porDefecto ? ' (el de la pantalla)' : ''}
          </option>
        ))}
      </select>
    )
  }

  if (fila.control === 'fecha') {
    return <input id={id} type="date" value={borrador} onChange={(e) => setBorrador(e.target.value)} style={alto} />
  }

  if (fila.control === 'numero' || fila.control === 'euros') {
    const esJoya = String(fila.campo) === 'joyasEnCajaFuerte' || String(fila.campo) === 'joyasFueraDeCaja'
    return (
      <>
        <input
          id={id}
          type="number"
          min={0}
          {...(esJoya ? { max: TOPE_JOYAS } : {})}
          inputMode="decimal"
          value={borrador}
          onChange={(e) => setBorrador(e.target.value)}
          style={alto}
        />
        {esJoya && (
          <span className="muted" style={{ fontSize: 12 }}>
            Hasta {eur(TOPE_JOYAS)}.
          </span>
        )}
      </>
    )
  }

  return <input id={id} value={borrador} onChange={(e) => setBorrador(e.target.value)} style={alto} />
}

/**
 * El precio nuevo frente al que paga hoy. Sin prima actual NO se inventa una
 * comparación: se dice que no consta, que es distinto de «no hay diferencia».
 */
function Diferencia({ primaActual, nueva }: { primaActual: number | null; nueva: number | null }) {
  if (primaActual === null) return <span className="muted">no consta lo que paga hoy</span>
  if (nueva === null || Number.isNaN(nueva)) return <span className="muted">—</span>
  const delta = nueva - primaActual
  if (Math.abs(delta) < 0.005) return <span className="muted">igual</span>
  const sube = delta > 0
  return (
    <span style={{ color: sube ? 'var(--danger)' : 'var(--ok)', fontWeight: 700, whiteSpace: 'nowrap' }}>
      {sube ? '▲ sube' : '▼ ahorra'} {eur(Math.abs(delta))}
    </span>
  )
}

// ─── Conversión entre el valor de la fila y el control ───────────────────────

function aTexto(f: Fila): string {
  if (f.control === 'siNo') return f.valor === true ? 'si' : 'no'
  if (f.control === 'siNoNoSe') return typeof f.valor === 'boolean' ? (f.valor ? 'si' : 'no') : ''
  if (f.valor === null || f.valor === undefined) return ''
  return String(f.valor)
}

function deTexto(f: Fila, t: string): unknown {
  switch (f.control) {
    case 'siNo':
      return t === 'si'
    case 'siNoNoSe':
      // `null` = no se sabe. No es `false`: «no» es una respuesta y esto no lo es.
      return t === '' ? null : t === 'si'
    case 'numero':
    case 'euros':
    case 'municipio': {
      const n = Number(t.trim())
      return t.trim() === '' || !Number.isFinite(n) ? null : n
    }
    default:
      return t.trim() === '' ? null : t.trim()
  }
}

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function entero(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

const FUENTE: Record<string, string> = {
  poliza: 'la póliza',
  gemela: 'la copia del volcado de junio/2026',
  catastro: 'el Catastro',
}
