'use client'

import { useState } from 'react'
import type { CatalogoHogar, DisponibilidadHogar, Opcion } from '@/lib/codeoscopic/catalogos'
import type { ReparoHogar } from '@/lib/codeoscopic/peticion-hogar'
import type { SupuestoHogar } from '@/lib/codeoscopic/desde-cartera-hogar'
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
      supuestos: SupuestoHogar[]
      fuenteRiesgo: string | null
    }
  | { estado: 'faltan'; faltan: ReparoHogar[] }
  | { estado: 'error'; mensaje: string; clase: 'tope' | 'ramo' | 'vendor' | 'otro' }

/** Lo que la ficha ya trae y el corredor puede corregir. `null` = no consta. */
export type PrefijadosHogar = {
  cp: string | null
  metrosCuadrados: number | null
  anioConstruccion: number | null
  capitalContinente: number | null
  capitalContenido: number | null
  fechaEfecto: string | null
}

/** Los tres catálogos sin los que no hay cuerpo, y los seis que viajan solo si se eligen. */
export const CATALOGOS_OBLIGATORIOS = ['property-types', 'uses', 'occupancy-types'] as const
export const CATALOGOS_OPCIONALES = [
  'locations',
  'settlement-types',
  'build-materials',
  'build-qualities',
  'door-types',
  'alarm-types',
] as const
export type CatalogoPantalla = (typeof CATALOGOS_OBLIGATORIOS)[number] | (typeof CATALOGOS_OPCIONALES)[number]

const ETIQUETAS: Record<CatalogoPantalla, string> = {
  'property-types': 'Tipo de vivienda',
  uses: 'Uso',
  'occupancy-types': 'Ocupación',
  locations: 'Ubicación',
  'settlement-types': 'Tipo de núcleo',
  'build-materials': 'Material de construcción',
  'build-qualities': 'Calidad de construcción',
  'door-types': 'Puerta',
  'alarm-types': 'Alarma',
}

/** Del nombre del catálogo al campo de `DatosHogar` que rellena. */
const CAMPO_OPCIONAL: Record<(typeof CATALOGOS_OPCIONALES)[number], string> = {
  locations: 'ubicacion',
  'settlement-types': 'asentamiento',
  'build-materials': 'material',
  'build-qualities': 'calidad',
  'door-types': 'puerta',
  'alarm-types': 'alarma',
}

/**
 * El botón de hogar: el segundo sitio de la app donde un clic cuesta 0,50€.
 *
 * Mismas tres decisiones que el de auto (precio EN el botón, deshabilitado
 * mientras cotiza, sin reintento automático) y una cuarta propia de hogar:
 * el 502 del vendor se enseña ENTERO, porque el formato del `risk` de hogar no
 * está verificado y ese mensaje es lo que dirá qué campo del contrato sobra o
 * falta. Un 400 de validación NO se cobra.
 */
export default function RetarificadorHogar({
  polizaId,
  faltanInicial,
  civiles,
  municipios,
  estadoCivilAuto,
  catalogos,
  fallosCatalogo,
  ramo,
  prefijados,
  consumo,
  deshabilitado,
}: {
  polizaId: string
  faltanInicial: ReparoHogar[]
  civiles: Opcion[]
  municipios: Opcion[]
  estadoCivilAuto: Opcion | null
  catalogos: Partial<Record<CatalogoHogar, Opcion[]>>
  /** Catálogos que no se han podido leer (por nombre). Uno obligatorio bloquea el botón. */
  fallosCatalogo: string[]
  ramo: DisponibilidadHogar
  prefijados: PrefijadosHogar
  consumo: Consumo
  deshabilitado: boolean
}) {
  const primero = (n: CatalogoPantalla) => catalogos[n]?.[0]?.id ?? ''

  const [estadoCivilId, setEstadoCivilId] = useState(estadoCivilAuto?.id ?? '')
  const [municipioId, setMunicipioId] = useState(municipios.length === 1 ? municipios[0].id : '')
  // Los tres obligatorios arrancan en la PRIMERA opción y se marcan como
  // supuesto hasta que el corredor los toque: el precio sale con ellos.
  const [obligatorios, setObligatorios] = useState<Record<string, { valor: string; supuesto: boolean }>>({
    'property-types': { valor: primero('property-types'), supuesto: true },
    uses: { valor: primero('uses'), supuesto: true },
    'occupancy-types': { valor: primero('occupancy-types'), supuesto: true },
  })
  // Los opcionales arrancan VACÍOS: vacío = no viaja, y el vendor pone el suyo.
  const [opcionales, setOpcionales] = useState<Record<string, string>>({})
  const [numeros, setNumeros] = useState<Record<string, string>>({
    metrosCuadrados: prefijados.metrosCuadrados?.toString() ?? '',
    anioConstruccion: prefijados.anioConstruccion?.toString() ?? '',
    capitalContinente: prefijados.capitalContinente?.toString() ?? '',
    capitalContenido: prefijados.capitalContenido?.toString() ?? '',
  })
  const [fechaEfecto, setFechaEfecto] = useState(prefijados.fechaEfecto ?? '')
  const [cp, setCp] = useState(prefijados.cp ?? '')
  const [correccionesPersona, setCorreccionesPersona] = useState<Record<string, string>>({})
  const [resultado, setResultado] = useState<Resultado>({ estado: 'idle' })

  /** Solo viaja como corrección lo que el corredor ha CAMBIADO respecto a la ficha. */
  function correcciones(): Record<string, unknown> {
    const c: Record<string, unknown> = { ...correccionesPersona }
    for (const k of ['metrosCuadrados', 'anioConstruccion', 'capitalContinente', 'capitalContenido'] as const) {
      const v = numeros[k].trim()
      const original = prefijados[k]
      if (v === '' ) continue
      if (original !== null && Number(v) === original) continue
      c[k] = Number(v)
    }
    if (fechaEfecto && fechaEfecto !== prefijados.fechaEfecto) c.fechaEfecto = fechaEfecto
    if (cp.trim() && cp.trim() !== prefijados.cp) c.cp = cp.trim()
    for (const n of CATALOGOS_OPCIONALES) {
      const v = opcionales[n]
      if (v) c[CAMPO_OPCIONAL[n]] = v
    }
    return c
  }

  async function cotizar() {
    setResultado({ estado: 'cotizando' })
    try {
      const res = await fetch(`/api/cartera/polizas/${polizaId}/retarificar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resueltos: {
            municipioId: municipioId ? Number(municipioId) : null,
            estadoCivilId,
            tipoVivienda: obligatorios['property-types'].valor,
            uso: obligatorios.uses.valor,
            ocupacion: obligatorios['occupancy-types'].valor,
            supuestos: {
              tipoVivienda: obligatorios['property-types'].supuesto,
              uso: obligatorios.uses.supuesto,
              ocupacion: obligatorios['occupancy-types'].supuesto,
            },
          },
          correcciones: correcciones(),
        }),
      })
      const j = (await res.json()) as Record<string, unknown>
      if (res.status === 422) {
        setResultado({ estado: 'faltan', faltan: (j.faltan as ReparoHogar[]) ?? [] })
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
        restantesHoy: Number(j.restantesHoy),
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

  const fallaObligatorio = CATALOGOS_OBLIGATORIOS.some((n) => fallosCatalogo.includes(n) || !(catalogos[n]?.length))
  const faltanCampos = [
    !municipioId && 'el municipio',
    !estadoCivilId && 'el estado civil',
    !obligatorios['property-types'].valor && 'el tipo de vivienda',
    !obligatorios.uses.valor && 'el uso',
    !obligatorios['occupancy-types'].valor && 'la ocupación',
    !numeros.metrosCuadrados.trim() && 'los m²',
    !numeros.anioConstruccion.trim() && 'el año de construcción',
    !numeros.capitalContinente.trim() && !numeros.capitalContenido.trim() && 'un capital (continente o contenido)',
    !fechaEfecto && 'la fecha de efecto',
  ].filter(Boolean) as string[]

  const cotizando = resultado.estado === 'cotizando'
  const puedePulsar =
    !deshabilitado &&
    ramo.estado === 'disponible' &&
    !fallaObligatorio &&
    !cotizando &&
    faltanCampos.length === 0 &&
    !('error' in consumo ? true : !consumo.veredicto.permitido)

  return (
    <>
      <div className="card">
        <h2>La vivienda</h2>
        <p className="muted">
          Estos desplegables son los catálogos de hogar de Codeoscopic y <strong>no cuestan nada</strong>.
          Los tres primeros son obligatorios y arrancan en la primera opción <em>como supuesto</em>: si no
          los tocas, el precio sale con ellos y así se dirá. Los demás solo viajan si eliges algo.
        </p>
        {fallosCatalogo.length > 0 && (
          <p className="err">
            No se han podido leer estos catálogos: {fallosCatalogo.join(', ')}.
            {fallaObligatorio
              ? ' Alguno es obligatorio, así que no se puede cotizar todavía. No es un problema de la ficha.'
              : ' Son opcionales: se puede cotizar sin ellos.'}
          </p>
        )}
        <div className="form-grid">
          <div>
            <label htmlFor="cp">Código postal del riesgo</label>
            <input id="cp" inputMode="numeric" value={cp} onChange={(e) => setCp(e.target.value)} />
          </div>
          <div>
            <label htmlFor="municipio">Municipio</label>
            <select id="municipio" value={municipioId} onChange={(e) => setMunicipioId(e.target.value)}>
              <option value="">
                {municipios.length === 0 ? 'Sin código postal utilizable' : 'Elige municipio'}
              </option>
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
          </div>
          {CATALOGOS_OBLIGATORIOS.map((n) => (
            <div key={n}>
              <label htmlFor={`cat-${n}`}>{ETIQUETAS[n]}</label>
              <select
                id={`cat-${n}`}
                value={obligatorios[n].valor}
                onChange={(e) => setObligatorios((o) => ({ ...o, [n]: { valor: e.target.value, supuesto: false } }))}
                disabled={!(catalogos[n]?.length)}
              >
                <option value="">{catalogos[n]?.length ? 'Elige' : 'Catálogo no disponible'}</option>
                {(catalogos[n] ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </select>
              {obligatorios[n].supuesto && obligatorios[n].valor && (
                <span className="badge warn" style={{ fontSize: 12 }}>
                  supuesto: primera opción
                </span>
              )}
            </div>
          ))}
          <div>
            <label htmlFor="m2">Superficie (m²)</label>
            <input
              id="m2"
              type="number"
              min={1}
              inputMode="decimal"
              value={numeros.metrosCuadrados}
              onChange={(e) => setNumeros((x) => ({ ...x, metrosCuadrados: e.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="anio">Año de construcción</label>
            <input
              id="anio"
              type="number"
              min={1500}
              inputMode="numeric"
              value={numeros.anioConstruccion}
              onChange={(e) => setNumeros((x) => ({ ...x, anioConstruccion: e.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="continente">Capital continente (€)</label>
            <input
              id="continente"
              type="number"
              min={0}
              inputMode="decimal"
              value={numeros.capitalContinente}
              onChange={(e) => setNumeros((x) => ({ ...x, capitalContinente: e.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="contenido">Capital contenido (€)</label>
            <input
              id="contenido"
              type="number"
              min={0}
              inputMode="decimal"
              value={numeros.capitalContenido}
              onChange={(e) => setNumeros((x) => ({ ...x, capitalContenido: e.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="efecto">Fecha de efecto</label>
            <input id="efecto" type="date" value={fechaEfecto} onChange={(e) => setFechaEfecto(e.target.value)} />
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Los capitales NO se inventan: si la ficha no los trae, hay que teclearlos. Un continente
          inventado da un precio inventado.
        </p>

        <details style={{ marginTop: 12 }}>
          <summary>Detalles opcionales (solo viajan si eliges algo)</summary>
          <div className="form-grid" style={{ marginTop: 8 }}>
            {CATALOGOS_OPCIONALES.map((n) => (
              <div key={n}>
                <label htmlFor={`cat-${n}`}>{ETIQUETAS[n]}</label>
                <select
                  id={`cat-${n}`}
                  value={opcionales[n] ?? ''}
                  onChange={(e) => setOpcionales((o) => ({ ...o, [n]: e.target.value }))}
                  disabled={!(catalogos[n]?.length)}
                >
                  <option value="">{catalogos[n]?.length ? 'Sin especificar' : 'Catálogo no disponible'}</option>
                  {(catalogos[n] ?? []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nombre}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </details>
      </div>

      <div className="card">
        <h2>El tomador</h2>
        <div className="form-grid">
          <div>
            <label htmlFor="civil">Estado civil</label>
            <select id="civil" value={estadoCivilId} onChange={(e) => setEstadoCivilId(e.target.value)}>
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
        </div>

        {faltanInicial.some((f) => CAMPOS_A_MANO[f.campo] || f.campo === 'sexo') && (
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
                    value={correccionesPersona.sexo ?? ''}
                    onChange={(e) => setCorreccionesPersona((c) => ({ ...c, sexo: e.target.value }))}
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
                      value={correccionesPersona[f.campo] ?? ''}
                      onChange={(e) => setCorreccionesPersona((c) => ({ ...c, [f.campo]: e.target.value }))}
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

        {faltanCampos.length > 0 && (
          <p className="muted">Antes de cotizar falta: {faltanCampos.join(', ')}.</p>
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
            {resultado.clase === 'vendor' && '⚠️ Respuesta del vendor (entera, porque dice qué campo del contrato sobra o falta): '}
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
            <p>
              <strong>{resultado.resumen}</strong>
            </p>
            <p className="muted">
              Coste de esta consulta: {resultado.coste} · quedan hoy {resultado.restantesHoy}.
              {resultado.fuenteRiesgo && <> · riesgo según: {FUENTE[resultado.fuenteRiesgo] ?? resultado.fuenteRiesgo}</>}
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
            {resultado.supuestos.length > 0 && (
              <>
                <p className="muted" style={{ marginTop: 8 }}>
                  Este precio sale con estos supuestos:
                </p>
                <ul>
                  {resultado.supuestos.map((s) => (
                    <li key={`${s.campo}-${String(s.valor)}`}>
                      <strong>{s.campo}</strong>: <code>{String(s.valor)}</code> — {s.porque}
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

const FUENTE: Record<string, string> = {
  poliza: 'la póliza',
  gemela: 'la copia del volcado de junio/2026',
  catastro: 'el Catastro',
}

/** Los campos de la persona que el corredor puede teclear cuando la ficha no los trae. */
const CAMPOS_A_MANO: Record<string, { etiqueta: string; tipo: string } | undefined> = {
  dni: { etiqueta: 'DNI', tipo: 'text' },
  nombre: { etiqueta: 'Nombre', tipo: 'text' },
  apellido1: { etiqueta: 'Primer apellido', tipo: 'text' },
  telefono: { etiqueta: 'Móvil', tipo: 'tel' },
  fechaNacimiento: { etiqueta: 'Fecha de nacimiento', tipo: 'date' },
}
