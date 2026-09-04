'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronDown, Download, Eraser, Search, Users } from 'lucide-react'
import {
  ESTADOS,
  MIN_LETRAS_BUSQUEDA,
  RAMOS,
  VENTANAS,
  describirFiltro,
  etiquetaRamo,
  filtroActivo,
  parseFiltroCartera,
} from '@central/module-seguros'
import { eur } from '@/lib/dinero'
import { MOTIVOS_PUERTO } from '@/lib/correduria-puerto'
import { Badge, Pendiente, TablaScroll, btnStyle, type Tono } from '@/components/ui'
import {
  POR_PAGINA_UI,
  companiasDe,
  describirCausaAsegura,
  interpretarLista,
  nombreCompleto,
  proximoVencimiento,
  type ClienteListado,
  type Facetas,
  type ListaCartera,
} from '@/lib/cartera-lista-asegura'
import Bloque from './Bloque'

/**
 * 📋 El listado FILTRABLE de la cartera: quién tiene qué, y sobre todo quién
 * NO tiene qué.
 *
 * ─── Para qué existe ───────────────────────────────────────────────────────
 * La cartera viva son 80 clientes y 110 pólizas, y el reparto por ramo (auto
 * 81 · hogar 19 · RC 9 · moto 1) ES el negocio que falta: 81 coches asegurados
 * de los que solo 19 casas están con nosotros. Por eso el filtro «que NO
 * tenga» (`sinRamo`) no es un extra — es la pregunta que genera trabajo, y
 * tiene su atajo propio.
 *
 * ─── El vocabulario NO se duplica ──────────────────────────────────────────
 * Ramos, estados y ventanas salen de `@central/module-seguros`, el mismo
 * módulo que parsea el puerto. Si esta pantalla tuviera su lista, ofrecería un
 * filtro que asegura no entiende (o al revés) y las dos formas de ese desajuste
 * devuelven cero resultados sin un solo error.
 *
 * ─── 🚨 Lo que esta pantalla tiene que DECIR ───────────────────────────────
 * Una lista vacía se pinta igual haya lo que haya detrás, así que se distingue
 * en voz alta: no se ha podido leer · el texto era demasiado corto para
 * filtrar · se ignoraron valores del filtro (y entonces la lista es MÁS ANCHA
 * de la pedida) · o de verdad no hay nadie que cumpla.
 */

type Seleccion = {
  grupo: 'viva' | 'leads'
  ramo: string[]
  sinRamo: string[]
  compania: string[]
  provincia: string[]
  estado: string[]
  vence: string
  canal: string
  q: string
  pagina: number
}

const VACIA: Seleccion = {
  grupo: 'viva', ramo: [], sinRamo: [], compania: [], provincia: [], estado: [],
  vence: '', canal: '', q: '', pagina: 1,
}

/** Las claves que gobierna esta pantalla. El resto de la query (`?s=`, la
 *  sección abierta) NO se toca: reescribir la URL entera cerraría la pestaña
 *  desde la que se está mirando. */
const CLAVES = ['grupo', 'ramo', 'sinRamo', 'compania', 'provincia', 'estado', 'vence', 'canal', 'q', 'pagina'] as const

function paramsDe(s: Seleccion): URLSearchParams {
  const p = new URLSearchParams()
  if (s.grupo !== 'viva') p.set('grupo', s.grupo)
  for (const k of ['ramo', 'sinRamo', 'compania', 'provincia', 'estado'] as const) {
    if (s[k].length) p.set(k, s[k].join(','))
  }
  if (s.vence) p.set('vence', s.vence)
  if (s.canal) p.set('canal', s.canal)
  if (s.q) p.set('q', s.q)
  if (s.pagina > 1) p.set('pagina', String(s.pagina))
  return p
}

/** Lo que pide la URL al abrir la pantalla, para poder guardar y compartir una
 *  lista. El texto se lee CRUDO (no por el parser): `parseFiltroCartera` lo
 *  vacía cuando es corto, y entonces el cuadro aparecería en blanco sin que se
 *  entendiera por qué no filtró. */
function deLaUrl(busqueda: string): Seleccion {
  const p = new URLSearchParams(busqueda)
  const { filtro } = parseFiltroCartera(p)
  return {
    grupo: filtro.grupo,
    ramo: filtro.ramos,
    sinRamo: filtro.sinRamos,
    compania: filtro.companias,
    provincia: filtro.provincias,
    estado: filtro.estados,
    vence: filtro.vence ?? '',
    canal: filtro.canal ?? '',
    q: (p.get('q') ?? '').trim(),
    pagina: filtro.pagina,
  }
}

export default function ListaCartera({ onContador }: {
  /** Cuántos clientes cumplen el filtro, para el contador de la sección.
   *  `null` = «no se ha podido leer» y JAMÁS 0: un 0 aquí afirma que la
   *  cartera está vacía, que es la mentira cara de esta pantalla. */
  onContador?: (n: number | null) => void
}) {
  const [sel, setSel] = useState<Seleccion>(VACIA)
  const [texto, setTexto] = useState('')
  const [listo, setListo] = useState(false)
  const [datos, setDatos] = useState<ListaCartera | null>(null)
  const [cargando, setCargando] = useState(true)

  // El aviso viaja por REF: si el padre pasa una lambda nueva en cada render,
  // meterla en las dependencias del efecto relanzaría el fetch en bucle.
  const avisar = useRef(onContador)
  avisar.current = onContador

  // La URL solo se lee en el cliente: hacerlo en el render rompería la
  // hidratación (el servidor no tiene `window`).
  useEffect(() => {
    const inicial = deLaUrl(window.location.search)
    setSel(inicial)
    setTexto(inicial.q)
    setListo(true)
  }, [])

  // El cuadro de texto no dispara una llamada por tecla.
  useEffect(() => {
    const t = setTimeout(() => {
      setSel((s) => (s.q === texto ? s : { ...s, q: texto, pagina: 1 }))
    }, 350)
    return () => clearTimeout(t)
  }, [texto])

  useEffect(() => {
    if (!listo) return
    const params = paramsDe(sel)

    // El filtro vive en la URL por `replaceState` y NO por `next/link`: navegar
    // remontaría este componente y volvería a pedirle todo al puerto en cada
    // clic de un desplegable.
    const url = new URLSearchParams(window.location.search)
    for (const k of CLAVES) url.delete(k)
    for (const [k, v] of params) url.set(k, v)
    const qs = url.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)

    const ctrl = new AbortController()
    setCargando(true)
    const pedidos = new URLSearchParams(params)
    pedidos.set('porPagina', String(POR_PAGINA_UI))
    fetch(`/api/correduria/cartera-lista?${pedidos.toString()}`, { signal: ctrl.signal })
      .then(async (res) => interpretarLista(res.status, await res.json().catch(() => null)))
      .catch((e): ListaCartera | null => (e?.name === 'AbortError' ? null : { estado: 'error', motivo: 'red' }))
      .then((d) => {
        if (d === null) return // respuesta vieja: la ha sustituido otra
        setDatos(d)
        setCargando(false)
        // Una carga → un contador, siempre dentro del `.then`.
        avisar.current?.(d.estado === 'ok' ? d.total : null)
      })
    return () => ctrl.abort()
  }, [sel, listo])

  const cambiar = useCallback((cambio: Partial<Seleccion>) => {
    // Cualquier cambio de filtro vuelve a la página 1: quedarse en la 3 de una
    // lista que ahora tiene una sola página enseña un vacío que no es tal.
    setSel((s) => ({ ...s, ...cambio, pagina: cambio.pagina ?? 1 }))
  }, [])

  const limpiar = useCallback(() => { setSel(VACIA); setTexto('') }, [])

  const filtro = useMemo(() => parseFiltroCartera(paramsDe(sel)).filtro, [sel])
  const hayFiltro = filtroActivo(filtro)
  const facetas = datos?.estado === 'ok' ? datos.facetas : null

  // El texto corto no filtra, y eso lo sabe la pantalla sin preguntar a nadie:
  // se dice aunque el puerto (versión vieja) no mande `buscable`.
  const textoCorto = texto.trim().length > 0 && texto.trim().length < MIN_LETRAS_BUSQUEDA
  const noBusco = textoCorto || (datos?.estado === 'ok' && !datos.buscable && texto.trim() !== '')

  return (
    <Bloque
      titulo="Listado de la cartera"
      Icono={Users}
      sub={
        <>
          {describirFiltro(filtro)}
          {datos?.estado === 'ok' && ` — ${datos.total} cliente(s)`}
          {sel.grupo === 'leads' && ' · el volcado histórico de 2013-2018: no son clientes de hoy.'}
        </>
      }
      accion={
        <BotonCsv sel={sel} desactivado={datos?.estado !== 'ok' || datos.total === 0} />
      }
    >
      <Barra
        sel={sel}
        texto={texto}
        setTexto={setTexto}
        cambiar={cambiar}
        limpiar={limpiar}
        hayFiltro={hayFiltro}
        facetas={facetas}
      />

      {noBusco && (
        <Nota tono="aviso">
          El texto «{texto.trim()}» tiene menos de {MIN_LETRAS_BUSQUEDA} letras, así que{' '}
          <strong>no ha filtrado nada</strong>. Lo que ves abajo es la lista sin buscar, no un
          resultado de la búsqueda.
        </Nota>
      )}

      {datos?.estado === 'ok' && datos.descartados.length > 0 && (
        <Nota tono="aviso">
          <strong>He ignorado estos valores del filtro:</strong>{' '}
          {datos.descartados.map((d) => `${d.campo}=${d.valor}`).join(' · ')}. La lista de abajo es{' '}
          <strong>más ancha</strong> que lo que has pedido.
        </Nota>
      )}

      <Resultado datos={datos} cargando={cargando} hayFiltro={hayFiltro} limpiar={limpiar} sel={sel} cambiar={cambiar} />
    </Bloque>
  )
}

// ─── Barra de filtros ───────────────────────────────────────────────────────

function Barra({ sel, texto, setTexto, cambiar, limpiar, hayFiltro, facetas }: {
  sel: Seleccion
  texto: string
  setTexto: (v: string) => void
  cambiar: (c: Partial<Seleccion>) => void
  limpiar: () => void
  hayFiltro: boolean
  facetas: Facetas | null
}) {
  const cuenta = (lista: { v: string; n: number }[] | undefined, v: string): number | null => {
    if (!lista) return null
    return lista.find((f) => f.v === v)?.n ?? 0
  }

  const opcionesRamo = RAMOS.map((r) => ({ v: r.v, label: r.label, n: cuenta(facetas?.ramos, r.v) }))
  const opcionesEstado = ESTADOS.map((e) => ({ v: e.v, label: e.label, n: cuenta(facetas?.estados, e.v) }))
  // Compañías y provincias no tienen vocabulario fijo: salen de las facetas.
  // Lo ya seleccionado se añade siempre, para poder DESmarcarlo aunque el
  // recuento de esta página no lo traiga.
  const deFaceta = (lista: { v: string; n: number }[] | undefined, elegidos: string[]) => {
    const base = (lista ?? []).map((f) => ({ v: f.v, label: f.v, n: f.n as number | null }))
    const faltan = elegidos.filter((e) => !base.some((b) => b.v === e))
    return [...base, ...faltan.map((v) => ({ v, label: v, n: null }))]
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
      <Segmentado
        valor={sel.grupo}
        onCambio={(v) => cambiar({ grupo: v as Seleccion['grupo'], sinRamo: v === 'leads' ? [] : sel.sinRamo })}
        opciones={[
          { v: 'viva', label: 'Cartera viva' },
          { v: 'leads', label: 'Leads' },
        ]}
      />

      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, flex: '1 1 200px', minWidth: 0 }}>
        <Search size={15} strokeWidth={1.75} aria-hidden style={{ color: 'var(--muted)', flexShrink: 0 }} />
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Nombre o apellidos"
          aria-label="Buscar por nombre o apellidos"
          style={{
            flex: 1, minWidth: 0, minHeight: 44, padding: '0 10px', fontSize: 14,
            borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--text)',
          }}
        />
      </label>

      <Multi etiqueta="Ramo" opciones={opcionesRamo} valor={sel.ramo} onCambio={(v) => cambiar({ ramo: v })} />
      {sel.grupo === 'viva' && (
        <Multi
          etiqueta="Que NO tenga"
          titulo="Venta cruzada: clientes SIN ninguna póliza viva de estos ramos"
          opciones={opcionesRamo}
          valor={sel.sinRamo}
          onCambio={(v) => cambiar({ sinRamo: v })}
        />
      )}
      <Multi
        etiqueta="Compañía"
        opciones={deFaceta(facetas?.companias, sel.compania)}
        valor={sel.compania}
        onCambio={(v) => cambiar({ compania: v })}
        vacio="El puerto no manda el reparto por compañía, así que aquí no hay lista que ofrecer."
      />
      <Multi
        etiqueta="Provincia"
        opciones={deFaceta(facetas?.provincias, sel.provincia)}
        valor={sel.provincia}
        onCambio={(v) => cambiar({ provincia: v })}
        vacio="El puerto no manda el reparto por provincia, así que aquí no hay lista que ofrecer."
      />
      <Multi etiqueta="Estado" opciones={opcionesEstado} valor={sel.estado} onCambio={(v) => cambiar({ estado: v })} />

      <Selector
        etiqueta="Vencimiento"
        valor={sel.vence}
        onCambio={(v) => cambiar({ vence: v })}
        opciones={[{ v: '', label: 'Cualquier vencimiento' }, ...VENTANAS.map((x) => ({ v: x.v as string, label: x.label }))]}
      />

      <Segmentado
        valor={sel.canal}
        onCambio={(v) => cambiar({ canal: v })}
        opciones={[
          { v: '', label: 'Todos' },
          { v: 'con', label: 'Con contacto' },
          { v: 'sin', label: 'Sin contacto' },
        ]}
      />

      {/* El hueco medido: 81 autos contra 19 hogares. Es el atajo que genera negocio. */}
      <button
        type="button"
        onClick={() => cambiar({ grupo: 'viva', ramo: ['auto'], sinRamo: ['hogar'] })}
        style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}
        title="Clientes con coche asegurado con nosotros a los que les falta el hogar"
      >
        Auto sin Hogar
      </button>

      {hayFiltro && (
        <button type="button" onClick={limpiar} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>
          <Eraser size={15} strokeWidth={1.75} aria-hidden /> Limpiar
        </button>
      )}
    </div>
  )
}

function Segmentado({ valor, opciones, onCambio }: {
  valor: string
  opciones: { v: string; label: string }[]
  onCambio: (v: string) => void
}) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      {opciones.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onCambio(o.v)}
          aria-pressed={valor === o.v}
          style={{
            minHeight: 44, padding: '0 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            border: 'none', whiteSpace: 'nowrap',
            background: valor === o.v ? 'var(--primary-light)' : 'var(--surface)',
            color: valor === o.v ? 'var(--primary)' : 'var(--muted)',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Selector({ etiqueta, valor, opciones, onCambio }: {
  etiqueta: string
  valor: string
  opciones: { v: string; label: string }[]
  onCambio: (v: string) => void
}) {
  return (
    <select
      aria-label={etiqueta}
      value={valor}
      onChange={(e) => onCambio(e.target.value)}
      style={{
        minHeight: 44, padding: '0 10px', fontSize: 13, borderRadius: 10, maxWidth: '100%',
        border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
      }}
    >
      {opciones.map((o) => (
        <option key={o.v} value={o.v}>{o.label}</option>
      ))}
    </select>
  )
}

/**
 * Desplegable múltiple con casillas: en móvil un `<select multiple>` es
 * inmanejable (hay que mantener pulsado), y aquí se filtra con el pulgar.
 * El recuento de cada opción sale de las facetas; `null` = no vienen, y
 * entonces NO se pinta un número (un «0» diría «no hay ninguno de ese ramo»).
 */
function Multi({ etiqueta, titulo, opciones, valor, onCambio, vacio }: {
  etiqueta: string
  titulo?: string
  opciones: { v: string; label: string; n: number | null }[]
  valor: string[]
  onCambio: (v: string[]) => void
  vacio?: string
}) {
  const alternar = (v: string) => {
    onCambio(valor.includes(v) ? valor.filter((x) => x !== v) : [...valor, v])
  }
  return (
    <details style={{ position: 'relative' }} title={titulo}>
      <summary
        style={{
          ...btnStyle('secundario', 'sm'),
          minHeight: 44, listStyle: 'none', userSelect: 'none',
          borderColor: valor.length ? 'var(--primary)' : 'var(--border)',
          color: valor.length ? 'var(--primary)' : 'var(--text)',
        }}
      >
        {etiqueta}{valor.length > 0 && ` · ${valor.length}`}
        <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
      </summary>
      <div
        style={{
          position: 'absolute', zIndex: 30, top: '100%', left: 0, marginTop: 6,
          width: 260, maxWidth: '86vw', maxHeight: 300, overflowY: 'auto',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 6, boxShadow: 'var(--shadow)',
        }}
      >
        {opciones.length === 0 ? (
          <p style={{ margin: 0, padding: 8, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
            {vacio ?? 'Sin opciones.'}
          </p>
        ) : (
          opciones.map((o) => (
            <label
              key={o.v}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, minHeight: 44,
                padding: '0 8px', fontSize: 13, cursor: 'pointer',
              }}
            >
              <input type="checkbox" checked={valor.includes(o.v)} onChange={() => alternar(o.v)} />
              <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{o.label}</span>
              {o.n !== null && (
                <span style={{ color: 'var(--muted)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{o.n}</span>
              )}
            </label>
          ))
        )}
      </div>
    </details>
  )
}

// ─── Resultado ──────────────────────────────────────────────────────────────

function Nota({ tono, children }: { tono: 'aviso' | 'malo'; children: ReactNode }) {
  const color = tono === 'malo' ? 'var(--negative)' : 'var(--warning)'
  return (
    <div style={{ border: `1px solid ${color}`, borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13, lineHeight: 1.5 }}>
      {children}
    </div>
  )
}

function Resultado({ datos, cargando, hayFiltro, limpiar, sel, cambiar }: {
  datos: ListaCartera | null
  cargando: boolean
  hayFiltro: boolean
  limpiar: () => void
  sel: Seleccion
  cambiar: (c: Partial<Seleccion>) => void
}) {
  if (datos === null) {
    return <p style={pMuted}>Cargando…</p>
  }

  if (datos.estado === 'sin_configurar') {
    return (
      <Nota tono="aviso">
        El puerto con asegura no está conectado (falta <code>ASEGURA_OPERADOR_SECRET</code>).{' '}
        <strong>No lo leas como «no hay clientes»</strong>: es que desde aquí no se puede mirar.
      </Nota>
    )
  }

  if (datos.estado === 'error') {
    const causa = describirCausaAsegura(datos.causa)
    return (
      <Nota tono="malo">
        <strong>No se ha podido leer la cartera:</strong> {MOTIVOS_PUERTO[datos.motivo]}
        {causa && <> Causa que declara asegura: {causa}.</>}{' '}
        <strong>No significa que no haya clientes</strong> — significa que no se ha podido mirar.
      </Nota>
    )
  }

  const paginas = Math.max(1, Math.ceil(datos.total / Math.max(1, datos.porPagina)))
  const desde = (datos.pagina - 1) * datos.porPagina + 1

  return (
    <div style={{ opacity: cargando ? 0.55 : 1, transition: 'opacity .15s ease' }}>
      {datos.ilegibles > 0 && (
        <Nota tono="aviso">
          {datos.ilegibles} ficha(s) de esta página llegaron sin identificador y no se pueden
          pintar. Están en la cartera, pero no salen en la lista.
        </Nota>
      )}

      {datos.clientes.length === 0 ? (
        <div>
          <p style={pMuted}>
            {hayFiltro
              ? 'Ningún cliente cumple este filtro.'
              : 'El puerto no ha devuelto ningún cliente para este grupo.'}
          </p>
          {hayFiltro && (
            <button type="button" onClick={limpiar} style={{ ...btnStyle('secundario'), marginTop: 8 }}>
              <Eraser size={15} strokeWidth={1.75} aria-hidden /> Quitar los filtros
            </button>
          )}
        </div>
      ) : (
        <>
          {/* La plantilla del grid es OBLIGATORIA: sin ella la pista implícita
              se dimensiona con el contenido más ancho (una tabla de pólizas) y
              arrastra la página entera en móvil. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
            {datos.clientes.map((c) => (
              <FilaCliente key={c.id} c={c} />
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {desde}–{desde + datos.clientes.length - 1} de {datos.total} · página {datos.pagina} de {paginas}
            </span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
              <button
                type="button"
                disabled={sel.pagina <= 1}
                onClick={() => cambiar({ pagina: sel.pagina - 1 })}
                style={{ ...btnStyle('secundario', 'sm'), minHeight: 44, opacity: sel.pagina <= 1 ? 0.4 : 1 }}
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={sel.pagina >= paginas}
                onClick={() => cambiar({ pagina: sel.pagina + 1 })}
                style={{ ...btnStyle('secundario', 'sm'), minHeight: 44, opacity: sel.pagina >= paginas ? 0.4 : 1 }}
              >
                Siguiente
              </button>
            </span>
          </div>
        </>
      )}
    </div>
  )
}

const TONO_ESTADO: Record<string, Tono> = {
  activa: 'positivo', en_vigor: 'positivo', en_renovacion: 'info',
  recibo_devuelto: 'negativo', cancelada: 'negativo', vencida: 'negativo',
  fin_riesgo: 'negativo', anula_al_vencimiento: 'aviso', cambio_clave: 'neutral',
  competencia: 'neutral',
}

function etiquetaEstado(v: string): string {
  return ESTADOS.find((e) => e.v === v)?.label ?? v.replace(/_/g, ' ')
}

function FilaCliente({ c }: { c: ClienteListado }) {
  // Montaje perezoso: la tabla de pólizas no existe hasta que se abre. Un
  // `<details>` cerrado igualmente crearía todo su DOM (regla de rendimiento).
  const [abierto, setAbierto] = useState(false)
  const companias = companiasDe(c)
  const vence = proximoVencimiento(c)

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <Link href={`/correduria/cliente/${c.id}`} style={{ fontWeight: 700, fontSize: 15, overflowWrap: 'anywhere' }}>
          {nombreCompleto(c)}
        </Link>
        <Canal etiqueta="Email" valor={c.tieneEmail} />
        <Canal etiqueta="Teléfono" valor={c.tieneTelefono} />
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, overflowWrap: 'anywhere' }}>
        {c.provincia ?? 'provincia sin dato'}
        {c.ciudad && ` · ${c.ciudad}`}
        {' · '}
        {c.polizasVivas === null ? 'pólizas vivas sin dato' : `${c.polizasVivas} póliza(s) viva(s)`}
        {c.ramosVivos !== null && c.ramosVivos.length > 0 && ` · ${c.ramosVivos.map(etiquetaRamo).join(' · ')}`}
        {companias !== null && companias.length > 0 && ` · ${companias.join(' · ')}`}
        {c.polizas !== null && ` · ${vence ? `vence ${vence}` : 'sin vencimiento informado'}`}
      </div>

      {c.polizas === null ? (
        <p style={{ ...pMuted, marginTop: 6 }}>
          El puerto no manda sus pólizas en este listado; se ven en su ficha.
        </p>
      ) : c.polizas.length === 0 ? null : (
        <details onToggle={(e) => setAbierto((e.currentTarget as HTMLDetailsElement).open)} style={{ marginTop: 6 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, minHeight: 44, display: 'flex', alignItems: 'center' }}>
            {c.polizas.length} póliza(s) en vigor
          </summary>
          {abierto && (
            <TablaScroll>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 6 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 12 }}>
                    <th style={th}>Ramo</th>
                    <th style={th}>Compañía</th>
                    <th style={th}>Nº</th>
                    <th style={th}>Vence</th>
                    <th style={th}>Prima</th>
                    <th style={th}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {c.polizas.map((p) => (
                    <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={td}>{etiquetaRamo(p.tipo)}</td>
                      <td style={td}>{p.aseguradora}</td>
                      <td style={td}>{p.numeroPoliza ?? <Pendiente texto="sin nº" />}</td>
                      <td style={td}>{p.fechaVencimiento ?? <Pendiente texto="sin fecha" />}</td>
                      {/* Una prima que la compañía no informa NO se pinta como
                          0,00€: eso diría que la póliza no cuesta nada. */}
                      <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>
                        {p.prima === null ? <Pendiente texto="sin prima" /> : eur(p.prima)}
                      </td>
                      <td style={td}>
                        <Badge tono={TONO_ESTADO[p.estado] ?? 'neutral'}>{etiquetaEstado(p.estado)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TablaScroll>
          )}
        </details>
      )}

      {c.polizasIlegibles > 0 && (
        <p style={{ ...pMuted, marginTop: 4 }}>
          {c.polizasIlegibles} póliza(s) suyas llegaron sin identificador y no se muestran.
        </p>
      )}
    </div>
  )
}

/** Los TRES estados de un canal. `null` es «sin comprobar», jamás una cruz. */
function Canal({ etiqueta, valor }: { etiqueta: string; valor: boolean | null }) {
  if (valor === null) return <Pendiente texto={`${etiqueta} sin comprobar`} />
  if (valor) return <Badge tono="positivo">{etiqueta}</Badge>
  return <Badge tono="neutral" title={`No consta ${etiqueta.toLowerCase()} en su ficha`}>Sin {etiqueta.toLowerCase()}</Badge>
}

// ─── Descarga ───────────────────────────────────────────────────────────────

function BotonCsv({ sel, desactivado }: { sel: Seleccion; desactivado: boolean }) {
  const [estado, setEstado] = useState<'listo' | 'bajando' | 'error'>('listo')

  // Se descarga por `fetch` y no por un enlace: así un fallo del puerto se
  // puede DECIR. Un enlace directo se bajaría un JSON de error con extensión
  // .csv, o peor, un fichero vacío que fuera del navegador se lee como «no hay
  // ningún cliente que cumpla».
  const bajar = async () => {
    setEstado('bajando')
    try {
      const params = paramsDe(sel)
      params.set('formato', 'csv')
      const res = await fetch(`/api/correduria/cartera-lista?${params.toString()}`)
      if (!res.ok) { setEstado('error'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cartera-asegura-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setEstado('listo')
    } catch {
      setEstado('error')
    }
  }

  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {estado === 'error' && (
        <span style={{ fontSize: 12, color: 'var(--negative)' }}>
          No se ha podido generar el CSV (el puerto no respondió). No se ha descargado nada.
        </span>
      )}
      <button
        type="button"
        onClick={bajar}
        disabled={desactivado || estado === 'bajando'}
        style={{ ...btnStyle('secundario', 'sm'), minHeight: 44, opacity: desactivado ? 0.4 : 1 }}
        title="Descarga el conjunto FILTRADO entero, no solo esta página (tope 2.000 filas)"
      >
        <Download size={15} strokeWidth={1.75} aria-hidden />
        {estado === 'bajando' ? 'Generando…' : 'Descargar CSV'}
      </button>
    </span>
  )
}

const pMuted = { margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 } as const
const th = { padding: '4px 8px', fontWeight: 600, whiteSpace: 'nowrap' } as const
const td = { padding: '6px 8px', verticalAlign: 'top' } as const
