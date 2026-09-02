'use client'

import { useState } from 'react'
import type { CatalogoHogar, DisponibilidadHogar } from '@/lib/codeoscopic/catalogos'
import { pareceOpcionPropietario, type Opcion } from '@/lib/codeoscopic/opciones'
import { TOPE_JOYAS, type ReparoHogar } from '@/lib/codeoscopic/peticion-hogar'
import type { CatalogoResuelto, SupuestoHogar } from '@/lib/codeoscopic/desde-cartera-hogar'
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

/**
 * Lo que la ficha (o la precalificación) ya trae y el corredor puede corregir.
 * `null` = no consta. Lo que sea un supuesto ya viene declarado en la lista de
 * supuestos de la página: aquí solo se prefija el formulario.
 */
export type PrefijadosHogar = {
  // ── Dónde ──
  cp: string | null
  tipoViaId: string | null
  nombreVia: string | null
  numeroVia: string | null
  planta: string | null
  puertaVivienda: string | null
  /** La dirección ENTERA tal como está en la ficha, para comprobar el troceo. */
  direccionEntera: string | null
  // ── Cómo es ──
  metrosCuadrados: number | null
  anioConstruccion: number | null
  habitaciones: number | null
  // ── Cuánto ──
  capitalContinente: number | null
  capitalContenido: number | null
  // ── Quién / cuándo ──
  propietarioEsTomador: boolean
  fechaEfecto: string | null
}

/**
 * Los NUEVE catálogos de hogar que el vendor exige (verificado contra el
 * portal el 02/09/2026). Ya no hay «opcionales»: sin uno de estos no hay cuerpo.
 */
export const CATALOGOS_PANTALLA = [
  'property-types',
  'uses',
  'occupancy-types',
  'locations',
  'settlement-types',
  'build-materials',
  'build-qualities',
  'door-types',
  'alarm-types',
] as const satisfies readonly CatalogoHogar[]
export type CatalogoPantalla = (typeof CATALOGOS_PANTALLA)[number]

/** Del nombre del catálogo al campo de `DatosHogar` / `ResueltosHogar` que rellena. */
export const CAMPO_DE_CATALOGO: Record<CatalogoPantalla, Exclude<CatalogoResuelto, 'tipoVia'>> = {
  'property-types': 'tipoVivienda',
  uses: 'uso',
  'occupancy-types': 'ocupacion',
  locations: 'ubicacion',
  'settlement-types': 'asentamiento',
  'build-materials': 'material',
  'build-qualities': 'calidad',
  'door-types': 'puertasSecundarias',
  'alarm-types': 'alarma',
}

/** El id por defecto de cada desplegable (o `null` si el catálogo no da nada que suponer). */
export type DefectosHogar = Record<CatalogoPantalla | 'road-types', string | null>

/**
 * Etiquetas que dicen lo que significan DE VERDAD. Dos nombres del vendor
 * engañan: `uses` es el régimen (propietario/inquilino) y `occupancy-types` el
 * uso (habitual/segunda residencia).
 */
const ETIQUETAS: Record<CatalogoPantalla, string> = {
  'property-types': 'Tipo de vivienda',
  uses: 'Régimen (propietario / inquilino)',
  'occupancy-types': 'Uso (habitual / segunda residencia)',
  locations: 'Ubicación',
  'settlement-types': 'Liquidación del siniestro',
  'build-materials': 'Material de construcción',
  'build-qualities': 'Calidad de construcción',
  'door-types': 'Puertas secundarias',
  'alarm-types': 'Alarma',
}

const TEXTOS = ['nombreVia', 'numeroVia', 'planta', 'puertaVivienda'] as const
const NUMEROS = ['metrosCuadrados', 'anioConstruccion', 'habitaciones', 'capitalContinente', 'capitalContenido'] as const
const LIMITES = ['joyasEnCajaFuerte', 'joyasFueraDeCaja', 'objetosDeValor', 'perrosPeligrosos'] as const
const PROTECCIONES = ['puertaPrincipalBlindada', 'ventanasSeguras', 'urbanizacionCerrada'] as const

const ETIQUETA_PROTECCION: Record<(typeof PROTECCIONES)[number], string> = {
  puertaPrincipalBlindada: 'Puerta principal blindada',
  ventanasSeguras: 'Ventanas con rejas o cristales de seguridad',
  urbanizacionCerrada: 'Urbanización cerrada',
}

type Eleccion = { valor: string; supuesto: boolean }

/**
 * El botón de hogar: el segundo sitio de la app donde un clic cuesta 0,50€.
 *
 * Mismas tres decisiones que el de auto (precio EN el botón, deshabilitado
 * mientras cotiza, sin reintento automático). El contrato del `risk` de hogar
 * está verificado contra el portal (02/09/2026); aun así el 502 del vendor se
 * enseña ENTERO, porque si el contrato cambia ese mensaje es lo que dirá qué
 * campo sobra o falta. Un 400 de validación NO se cobra.
 *
 * Lo que el vendor exige y la ficha no guarda (calle troceada, habitaciones,
 * protecciones, joyas, perros) arranca con un supuesto declarado y se puede
 * corregir aquí antes de pagar.
 */
export default function RetarificadorHogar({
  polizaId,
  faltanInicial,
  civiles,
  municipios,
  vias,
  estadoCivilAuto,
  catalogos,
  defectos,
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
  /** `/road-types`. Vacío = no se pudo leer, y el tipo de vía es obligatorio. */
  vias: Opcion[]
  estadoCivilAuto: Opcion | null
  catalogos: Partial<Record<CatalogoHogar, Opcion[]>>
  defectos: DefectosHogar
  /** Catálogos que no se han podido leer (por nombre). Todos son obligatorios: uno bloquea el botón. */
  fallosCatalogo: string[]
  ramo: DisponibilidadHogar
  prefijados: PrefijadosHogar
  consumo: Consumo
  deshabilitado: boolean
}) {
  const [estadoCivilId, setEstadoCivilId] = useState(estadoCivilAuto?.id ?? '')
  const [municipioId, setMunicipioId] = useState(municipios.length === 1 ? municipios[0].id : '')
  // Los nueve arrancan en el defecto de la pantalla (el ejemplo del portal si
  // el catálogo lo trae; si no, la primera opción) y se marcan como supuesto
  // hasta que el corredor los toque: el precio sale con ellos.
  const [desplegables, setDesplegables] = useState<Record<CatalogoPantalla, Eleccion>>(() => {
    const o = {} as Record<CatalogoPantalla, Eleccion>
    for (const n of CATALOGOS_PANTALLA) o[n] = { valor: defectos[n] ?? '', supuesto: true }
    return o
  })
  const [tipoVia, setTipoVia] = useState<Eleccion>({ valor: defectos['road-types'] ?? '', supuesto: true })
  const [textos, setTextos] = useState<Record<(typeof TEXTOS)[number], string>>({
    nombreVia: prefijados.nombreVia ?? '',
    numeroVia: prefijados.numeroVia ?? '',
    planta: prefijados.planta ?? '',
    puertaVivienda: prefijados.puertaVivienda ?? '',
  })
  const [referenciaCatastral, setReferenciaCatastral] = useState('')
  const [numeros, setNumeros] = useState<Record<(typeof NUMEROS)[number] | 'anioUltimaReforma', string>>({
    metrosCuadrados: prefijados.metrosCuadrados?.toString() ?? '',
    anioConstruccion: prefijados.anioConstruccion?.toString() ?? '',
    habitaciones: prefijados.habitaciones?.toString() ?? '',
    anioUltimaReforma: '',
    capitalContinente: prefijados.capitalContinente?.toString() ?? '',
    capitalContenido: prefijados.capitalContenido?.toString() ?? '',
  })
  // Las protecciones arrancan a «no» como supuesto (lo conservador: marcarlas abarata).
  const [protecciones, setProtecciones] = useState<Record<(typeof PROTECCIONES)[number], boolean>>({
    puertaPrincipalBlindada: false,
    ventanasSeguras: false,
    urbanizacionCerrada: false,
  })
  // Tres estados: no se sabe (no viaja) / sí / no.
  const [vigilante, setVigilante] = useState<'' | 'si' | 'no'>('')
  // Los cuatro límites son 0 POR DISEÑO (el vendor los exige y la ficha no los tiene).
  const [limites, setLimites] = useState<Record<(typeof LIMITES)[number], string>>({
    joyasEnCajaFuerte: '0',
    joyasFueraDeCaja: '0',
    objetosDeValor: '0',
    perrosPeligrosos: '0',
  })
  const [propietario, setPropietario] = useState(prefijados.propietarioEsTomador)
  const [propietarioTocado, setPropietarioTocado] = useState(false)
  const [fechaEfecto, setFechaEfecto] = useState(prefijados.fechaEfecto ?? '')
  const [cp, setCp] = useState(prefijados.cp ?? '')
  const [correccionesPersona, setCorreccionesPersona] = useState<Record<string, string>>({})
  const [resultado, setResultado] = useState<Resultado>({ estado: 'idle' })

  function elegir(n: CatalogoPantalla, valor: string) {
    setDesplegables((d) => ({ ...d, [n]: { valor, supuesto: false } }))
    // Si cambia el régimen, se re-preselecciona «el tomador es el dueño» — SOLO
    // si el corredor no ha tocado ese checkbox a mano.
    if (n === 'uses' && !propietarioTocado) {
      setPropietario(pareceOpcionPropietario(catalogos.uses?.find((o) => o.id === valor) ?? null))
    }
  }

  /**
   * Solo viaja como corrección lo que el corredor ha CAMBIADO respecto a lo
   * prefijado (textos y números). Los sí/no viajan SIEMPRE (un «no» es una
   * respuesta, no un hueco) y los cuatro límites también (son 0 por diseño).
   */
  function correcciones(): Record<string, unknown> {
    const c: Record<string, unknown> = { ...correccionesPersona }
    for (const k of TEXTOS) {
      const v = textos[k].trim()
      if (v === '' || v === (prefijados[k] ?? '')) continue
      c[k] = v
    }
    if (referenciaCatastral.trim()) c.referenciaCatastral = referenciaCatastral.trim()
    for (const k of NUMEROS) {
      const v = numeros[k].trim()
      const original = prefijados[k]
      if (v === '') continue
      if (original !== null && Number(v) === original) continue
      c[k] = Number(v)
    }
    if (numeros.anioUltimaReforma.trim()) c.anioUltimaReforma = Number(numeros.anioUltimaReforma)
    for (const k of PROTECCIONES) c[k] = protecciones[k]
    if (vigilante !== '') c.vigilante = vigilante === 'si'
    for (const k of LIMITES) {
      const v = limites[k].trim()
      c[k] = v === '' ? 0 : Number(v)
    }
    if (fechaEfecto && fechaEfecto !== prefijados.fechaEfecto) c.fechaEfecto = fechaEfecto
    if (cp.trim() && cp.trim() !== prefijados.cp) c.cp = cp.trim()
    return c
  }

  async function cotizar() {
    setResultado({ estado: 'cotizando' })
    try {
      const ids: Record<string, string | null> = {}
      const supuestos: Record<string, boolean> = { tipoVia: tipoVia.supuesto }
      for (const n of CATALOGOS_PANTALLA) {
        ids[CAMPO_DE_CATALOGO[n]] = desplegables[n].valor || null
        supuestos[CAMPO_DE_CATALOGO[n]] = desplegables[n].supuesto
      }
      const res = await fetch(`/api/cartera/polizas/${polizaId}/retarificar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resueltos: {
            municipioId: municipioId ? Number(municipioId) : null,
            estadoCivilId,
            tipoViaId: tipoVia.valor || null,
            ...ids,
            propietarioEsTomador: propietario,
            supuestos,
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

  // Un catálogo obligatorio sin leer (o vacío) bloquea: sin ids válidos no hay cuerpo.
  const fallaObligatorio =
    CATALOGOS_PANTALLA.some((n) => fallosCatalogo.includes(n) || !(catalogos[n]?.length)) ||
    fallosCatalogo.includes('road-types') ||
    vias.length === 0

  const faltanCampos = [
    !municipioId && 'el municipio',
    !estadoCivilId && 'el estado civil',
    !tipoVia.valor && 'el tipo de vía',
    !textos.nombreVia.trim() && 'el nombre de la vía',
    !textos.numeroVia.trim() && 'el número',
    ...CATALOGOS_PANTALLA.map((n) => !desplegables[n].valor && ETIQUETAS[n].toLowerCase()),
    !numeros.metrosCuadrados.trim() && 'los m²',
    !numeros.anioConstruccion.trim() && 'el año de construcción',
    !numeros.habitaciones.trim() && 'las habitaciones',
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

  const estiloCheck = { display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, color: 'inherit', fontSize: 14, margin: 0 } as const
  const estiloCaja = { width: 20, height: 20, padding: 0, margin: 0, flex: '0 0 auto' } as const

  return (
    <>
      <div className="card">
        <h2>La vivienda</h2>
        <p className="muted">
          Los desplegables son los catálogos de hogar de Codeoscopic y <strong>no cuestan nada</strong>. El vendor
          exige los nueve (contrato verificado contra su portal el 02/09/2026): arrancan en el valor por defecto{' '}
          <em>como supuesto</em> y, si no los tocas, el precio sale con ellos y así se dirá. Lo que la ficha no
          guarda (calle troceada, habitaciones, protecciones, joyas, perros) también arranca con un supuesto que
          puedes corregir antes de pagar.
        </p>
        {fallosCatalogo.length > 0 && (
          <p className="err">
            No se han podido leer estos catálogos: {fallosCatalogo.join(', ')}. Todos son obligatorios, así que no
            se puede cotizar todavía. No es un problema de la ficha.
          </p>
        )}

        <h3 style={{ marginTop: 12 }}>Dónde está</h3>
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
          <div>
            <label htmlFor="via">Tipo de vía</label>
            <select
              id="via"
              value={tipoVia.valor}
              onChange={(e) => setTipoVia({ valor: e.target.value, supuesto: false })}
              disabled={vias.length === 0}
            >
              <option value="">{vias.length ? 'Elige' : 'Catálogo no disponible'}</option>
              {vias.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </select>
            {tipoVia.supuesto && tipoVia.valor && (
              <span className="badge warn" style={{ fontSize: 12 }}>
                supuesto: valor por defecto
              </span>
            )}
          </div>
          <div>
            <label htmlFor="nombreVia">Nombre de la vía</label>
            <input id="nombreVia" value={textos.nombreVia} onChange={(e) => setTextos((t) => ({ ...t, nombreVia: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="numeroVia">Número</label>
            <input id="numeroVia" value={textos.numeroVia} onChange={(e) => setTextos((t) => ({ ...t, numeroVia: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="planta">Planta</label>
            <input id="planta" value={textos.planta} onChange={(e) => setTextos((t) => ({ ...t, planta: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="puerta">Puerta</label>
            <input id="puerta" value={textos.puertaVivienda} onChange={(e) => setTextos((t) => ({ ...t, puertaVivienda: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="refcat">Referencia catastral (opcional)</label>
            <input id="refcat" value={referenciaCatastral} onChange={(e) => setReferenciaCatastral(e.target.value)} />
          </div>
        </div>
        {prefijados.direccionEntera && (
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Dirección en la ficha: «{prefijados.direccionEntera}» — comprueba que el troceo en tipo de vía, nombre,
            número, planta y puerta es correcto.
          </p>
        )}

        <h3 style={{ marginTop: 16 }}>Cómo es</h3>
        <div className="form-grid">
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
            <label htmlFor="habitaciones">Habitaciones (sin salón, cocina ni baños)</label>
            <input
              id="habitaciones"
              type="number"
              min={1}
              inputMode="numeric"
              value={numeros.habitaciones}
              onChange={(e) => setNumeros((x) => ({ ...x, habitaciones: e.target.value }))}
            />
            {prefijados.habitaciones !== null && Number(numeros.habitaciones) === prefijados.habitaciones && (
              <span className="badge warn" style={{ fontSize: 12 }}>
                supuesto: estimadas por los m²
              </span>
            )}
          </div>
          <div>
            <label htmlFor="reforma">Año de última reforma (opcional)</label>
            <input
              id="reforma"
              type="number"
              min={1500}
              inputMode="numeric"
              value={numeros.anioUltimaReforma}
              onChange={(e) => setNumeros((x) => ({ ...x, anioUltimaReforma: e.target.value }))}
            />
          </div>
          {CATALOGOS_PANTALLA.map((n) => (
            <div key={n}>
              <label htmlFor={`cat-${n}`}>{ETIQUETAS[n]}</label>
              <select
                id={`cat-${n}`}
                value={desplegables[n].valor}
                onChange={(e) => elegir(n, e.target.value)}
                disabled={!(catalogos[n]?.length)}
              >
                <option value="">{catalogos[n]?.length ? 'Elige' : 'Catálogo no disponible'}</option>
                {(catalogos[n] ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </select>
              {desplegables[n].supuesto && desplegables[n].valor && (
                <span className="badge warn" style={{ fontSize: 12 }}>
                  supuesto: valor por defecto
                </span>
              )}
            </div>
          ))}
        </div>

        <h3 style={{ marginTop: 16 }}>Protecciones</h3>
        <p className="muted" style={{ fontSize: 12 }}>
          Arrancan a «no» como supuesto, que es lo conservador: si marcas alguna, el precio baja.
        </p>
        <div className="form-grid">
          {PROTECCIONES.map((k) => (
            <label key={k} htmlFor={`prot-${k}`} style={estiloCheck}>
              <input
                id={`prot-${k}`}
                type="checkbox"
                style={estiloCaja}
                checked={protecciones[k]}
                onChange={(e) => setProtecciones((p) => ({ ...p, [k]: e.target.checked }))}
              />
              {ETIQUETA_PROTECCION[k]}
            </label>
          ))}
          <div>
            <label htmlFor="vigilante">Vigilante</label>
            <select id="vigilante" value={vigilante} onChange={(e) => setVigilante(e.target.value as '' | 'si' | 'no')}>
              <option value="">No se sabe (no viaja)</option>
              <option value="si">Sí</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>

        <h3 style={{ marginTop: 16 }}>Cuánto se asegura y desde cuándo</h3>
        <div className="form-grid">
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
          <summary>Joyas, objetos de valor y perros (arrancan a 0: el vendor los exige y la ficha no los tiene)</summary>
          <div className="form-grid" style={{ marginTop: 8 }}>
            <div>
              <label htmlFor="joyasCaja">Joyas en caja fuerte (€, hasta {eur(TOPE_JOYAS)})</label>
              <input
                id="joyasCaja"
                type="number"
                min={0}
                max={TOPE_JOYAS}
                inputMode="numeric"
                value={limites.joyasEnCajaFuerte}
                onChange={(e) => setLimites((l) => ({ ...l, joyasEnCajaFuerte: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="joyasFuera">Joyas fuera de caja fuerte (€, hasta {eur(TOPE_JOYAS)})</label>
              <input
                id="joyasFuera"
                type="number"
                min={0}
                max={TOPE_JOYAS}
                inputMode="numeric"
                value={limites.joyasFueraDeCaja}
                onChange={(e) => setLimites((l) => ({ ...l, joyasFueraDeCaja: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="objetos">Objetos de valor (€)</label>
              <input
                id="objetos"
                type="number"
                min={0}
                inputMode="numeric"
                value={limites.objetosDeValor}
                onChange={(e) => setLimites((l) => ({ ...l, objetosDeValor: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="perros">Perros potencialmente peligrosos</label>
              <input
                id="perros"
                type="number"
                min={0}
                inputMode="numeric"
                value={limites.perrosPeligrosos}
                onChange={(e) => setLimites((l) => ({ ...l, perrosPeligrosos: e.target.value }))}
              />
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Si hay joyas, objetos de valor o perros y se dejan a 0, el precio real sube.
          </p>
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
          <label htmlFor="propietario" style={estiloCheck}>
            <input
              id="propietario"
              type="checkbox"
              style={estiloCaja}
              checked={propietario}
              onChange={(e) => {
                setPropietario(e.target.checked)
                setPropietarioTocado(true)
              }}
            />
            El tomador es el propietario de la vivienda
          </label>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Si lo es, viaja también como propietario en la petición (la misma persona). Se preselecciona según el
          régimen elegido arriba hasta que lo toques.
        </p>

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
