'use client'
import { useEffect, useMemo, useState, Fragment } from 'react'
import AdminShell from '@/components/AdminShell'
import { CATALOGO, type EntidadDef, type FiltroDef } from '@/lib/informes/catalogo'
import { formatearMetrica, formatearValor, numeroEs } from '@/lib/informes/formato'
import type { ResultadoInforme, ResultadoMetrica } from '@/lib/informes/motor'
import type { CabeceraInforme } from '@/lib/informes/cabecera'

type Opcion = { id: string; nombre: string }
type Rango = { desde?: string; hasta?: string }
type Filtros = Record<string, string | boolean | Rango>
type Vista = ResultadoInforme & { filasTotales: number }

const PASO = 50
const ES_NUM = new Set(['dinero', 'horas', 'numero'])
const BTN_SEC = 'min-h-[44px] bg-paper-2 text-ink-2 border border-line hover:bg-line'

function columnasPorDefecto(e: EntidadDef): string[] {
  const d = e.columnas.filter(c => c.porDefecto).map(c => c.clave)
  return d.length ? d : e.columnas.map(c => c.clave)
}

function nombreDeCabecera(cd: string | null, porDefecto: string): string {
  const m = cd ? /filename="([^"]+)"/.exec(cd) : null
  return m ? m[1] : porDefecto
}

export default function InformesClient({ logoUrl, nombreEmpresa, colorPrimario, tieneFichaje }: { logoUrl?: string | null; nombreEmpresa?: string | null; colorPrimario?: string | null; tieneFichaje?: boolean }) {
  const entidades = useMemo(() => CATALOGO.filter(e => !e.requiereFichaje || tieneFichaje), [tieneFichaje])
  const [entidadClave, setEntidadClave] = useState(entidades[0]?.clave ?? '')
  const ent = entidades.find(e => e.clave === entidadClave) ?? entidades[0]
  const [columnas, setColumnas] = useState<string[]>(() => (ent ? columnasPorDefecto(ent) : []))
  const [filtros, setFiltros] = useState<Filtros>({})
  const [agrupacion, setAgrupacion] = useState('')
  const [vista, setVista] = useState<Vista | null>(null)
  const [cabecera, setCabecera] = useState<CabeceraInforme | null>(null)
  const [visibles, setVisibles] = useState(PASO)
  const [cargando, setCargando] = useState(false)
  const [descargando, setDescargando] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [empleados, setEmpleados] = useState<Opcion[]>([])
  const [obras, setObras] = useState<Opcion[]>([])

  useEffect(() => {
    fetch('/api/admin/empleados').then(r => (r.ok ? r.json() : { empleados: [] }))
      .then(j => setEmpleados((j.empleados ?? []).map((e: { id: string; nombre: string; apellidos?: string | null }) => ({ id: e.id, nombre: [e.nombre, e.apellidos].filter(Boolean).join(' ') }))))
      .catch(() => {})
    if (tieneFichaje) {
      fetch('/api/admin/obras').then(r => (r.ok ? r.json() : { obras: [] }))
        .then(j => setObras((j.obras ?? []).map((o: { id: string; nombre: string }) => ({ id: o.id, nombre: o.nombre }))))
        .catch(() => {})
    }
  }, [tieneFichaje])

  function cambiarEntidad(clave: string) {
    const e = entidades.find(x => x.clave === clave)
    if (!e) return
    setEntidadClave(clave)
    setColumnas(columnasPorDefecto(e))
    setFiltros({})
    setAgrupacion('')
    setVista(null); setCabecera(null); setError('')
  }

  function alternarColumna(clave: string) {
    setColumnas(cs => (cs.includes(clave) ? cs.filter(c => c !== clave) : [...cs, clave]))
  }

  function ponerFiltro(clave: string, valor: string | boolean | Rango | undefined) {
    setFiltros(f => {
      const n = { ...f }
      if (valor === undefined || valor === '' || valor === false) delete n[clave]
      else n[clave] = valor
      return n
    })
  }

  const peticion = () => ({ entidad: ent.clave, columnas, filtros, agrupacion: agrupacion || null })

  async function ver() {
    if (!columnas.length) { setError('Elige al menos una columna'); return }
    setCargando(true); setError('')
    try {
      const r = await fetch('/api/admin/informes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(peticion()) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.errores?.[0]?.mensaje ?? j.error ?? 'No se pudo generar el informe'); return }
      setVista(j.resultado); setCabecera(j.cabecera); setVisibles(PASO)
    } catch { setError('No se pudo generar el informe (sin conexión)') } finally { setCargando(false) }
  }

  async function descargar(formato: 'xlsx' | 'pdf' | 'csv') {
    if (!columnas.length) { setError('Elige al menos una columna'); return }
    setDescargando(formato); setError('')
    try {
      const r = await fetch('/api/admin/informes/exportar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...peticion(), formato }) })
      if (!r.ok) { const j = await r.json().catch(() => ({})); setError(j.errores?.[0]?.mensaje ?? j.error ?? 'No se pudo descargar'); return }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = nombreDeCabecera(r.headers.get('content-disposition'), `informe.${formato}`); a.click()
      URL.revokeObjectURL(url)
    } catch { setError('No se pudo descargar (sin conexión)') } finally { setDescargando(null) }
  }

  if (!ent) return null

  return (
    <AdminShell activo="informes" logoUrl={logoUrl} nombreEmpresa={nombreEmpresa} colorPrimario={colorPrimario} tieneFichaje={tieneFichaje}>
      <h1 className="mb-1 text-2xl">Informes</h1>
      <p className="mb-4 text-sm text-ink-3">Elige qué quieres ver, filtra, agrupa y descárgalo en Excel o PDF.</p>

      <section className="mb-4 rounded-card border border-line bg-card p-4">
        <label className="mb-1 block text-xs font-semibold uppercase text-ink-3" htmlFor="inf-entidad">1. ¿De qué?</label>
        <select id="inf-entidad" className="w-full" value={ent.clave} onChange={e => cambiarEntidad(e.target.value)}>
          {entidades.map(e => <option key={e.clave} value={e.clave}>{e.etiqueta}</option>)}
        </select>
        <p className="mt-1 text-xs text-ink-3">{ent.descripcion}</p>
      </section>

      <section className="mb-4 rounded-card border border-line bg-card p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase text-ink-3">2. Columnas ({columnas.length})</span>
          <button type="button" className={`ml-auto text-xs ${BTN_SEC}`} onClick={() => setColumnas(ent.columnas.map(c => c.clave))}>Todas</button>
          <button type="button" className={`text-xs ${BTN_SEC}`} onClick={() => setColumnas(columnasPorDefecto(ent))}>Por defecto</button>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1 sm:grid-cols-2">
          {ent.columnas.map(c => (
            <label key={c.clave} className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[10px] px-2 text-sm hover:bg-paper-2">
              <input type="checkbox" className="h-5 w-5 shrink-0" checked={columnas.includes(c.clave)} onChange={() => alternarColumna(c.clave)} />
              <span className="min-w-0">{c.etiqueta}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="mb-4 rounded-card border border-line bg-card p-4">
        <span className="mb-2 block text-xs font-semibold uppercase text-ink-3">3. Filtros</span>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
          {ent.filtros.map(f => <CampoFiltro key={f.clave} def={f} valor={filtros[f.clave]} empleados={empleados} obras={obras} onChange={v => ponerFiltro(f.clave, v)} />)}
        </div>
      </section>

      <section className="mb-4 rounded-card border border-line bg-card p-4">
        <label className="mb-1 block text-xs font-semibold uppercase text-ink-3" htmlFor="inf-agr">4. Agrupar y totalizar</label>
        <select id="inf-agr" className="w-full" value={agrupacion} onChange={e => setAgrupacion(e.target.value)}>
          <option value="">Sin agrupar (solo total general)</option>
          {ent.agrupaciones.map(a => <option key={a.clave} value={a.clave}>{a.etiqueta}</option>)}
        </select>
      </section>

      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" className="min-h-[44px] flex-1 sm:flex-none" disabled={cargando} onClick={ver}>{cargando ? 'Calculando…' : 'Ver informe'}</button>
        <button type="button" className={`flex-1 sm:flex-none ${BTN_SEC}`} disabled={!!descargando} onClick={() => descargar('xlsx')}>{descargando === 'xlsx' ? 'Generando…' : '⬇ Excel'}</button>
        <button type="button" className={`flex-1 sm:flex-none ${BTN_SEC}`} disabled={!!descargando} onClick={() => descargar('pdf')}>{descargando === 'pdf' ? 'Generando…' : '⬇ PDF'}</button>
        <button type="button" className={`flex-1 sm:flex-none ${BTN_SEC}`} disabled={!!descargando} onClick={() => descargar('csv')}>{descargando === 'csv' ? 'Generando…' : '⬇ CSV'}</button>
      </div>

      {error && <p className="mb-4 rounded-card border border-alert/40 bg-alert/10 p-3 text-sm text-alert">{error}</p>}

      {vista && cabecera && <Resultado vista={vista} cabecera={cabecera} visibles={visibles} onVerMas={() => setVisibles(v => v + PASO)} />}
    </AdminShell>
  )
}

function CampoFiltro({ def, valor, empleados, obras, onChange }: { def: FiltroDef; valor: unknown; empleados: Opcion[]; obras: Opcion[]; onChange: (v: string | boolean | Rango | undefined) => void }) {
  const etiqueta = <span className="mb-1 block text-xs text-ink-3">{def.etiqueta}</span>
  if (def.tipo === 'rango_fecha' || def.tipo === 'rango_mes') {
    const r = (valor as Rango | undefined) ?? {}
    const tipo = def.tipo === 'rango_fecha' ? 'date' : 'month'
    const set = (k: 'desde' | 'hasta', v: string) => { const n = { ...r, [k]: v || undefined }; onChange(n.desde || n.hasta ? n : undefined) }
    return (
      <div className="sm:col-span-2">
        {etiqueta}
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(140px, 100%), 1fr))' }}>
          <input type={tipo} aria-label={`${def.etiqueta} desde`} value={r.desde ?? ''} onChange={e => set('desde', e.target.value)} />
          <input type={tipo} aria-label={`${def.etiqueta} hasta`} value={r.hasta ?? ''} onChange={e => set('hasta', e.target.value)} />
        </div>
      </div>
    )
  }
  if (def.tipo === 'booleano') {
    return (
      <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={valor === true} onChange={e => onChange(e.target.checked ? true : undefined)} />
        {def.etiqueta}
      </label>
    )
  }
  const opciones: { valor: string; etiqueta: string }[] =
    def.tipo === 'empleado' ? empleados.map(e => ({ valor: e.id, etiqueta: e.nombre }))
    : def.tipo === 'obra' ? obras.map(o => ({ valor: o.id, etiqueta: o.nombre }))
    : def.opciones
  return (
    <label className="block min-w-0">
      {etiqueta}
      <select className="w-full" value={typeof valor === 'string' ? valor : ''} onChange={e => onChange(e.target.value || undefined)}>
        <option value="">Todos</option>
        {opciones.map(o => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
      </select>
    </label>
  )
}

function Metricas({ metricas }: { metricas: ResultadoMetrica[] }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(140px, 100%), 1fr))' }}>
      {metricas.map(m => (
        <div key={m.clave} className="rounded-card border border-line bg-paper-2 p-3">
          <div className="text-xs text-ink-3">{m.etiqueta}</div>
          <div className="text-lg font-semibold tabular-nums">{formatearMetrica(m.formato, m.valor)}</div>
          {m.sinDato > 0 && <div className="text-xs text-ink-3">{numeroEs(m.sinDato, 0)} sin dato (no cuentan)</div>}
        </div>
      ))}
    </div>
  )
}

function Resultado({ vista, cabecera, visibles, onVerMas }: { vista: Vista; cabecera: CabeceraInforme; visibles: number; onVerMas: () => void }) {
  const cols = vista.columnas
  const mostrar = Math.min(visibles, vista.filas.length)
  // Cabeceras de grupo que caen dentro de las filas visibles, indexadas por su primera fila.
  const gruposPorInicio = new Map((vista.grupos ?? []).map(g => [g.desde, g]))
  const metricasCab = vista.total.metricas

  return (
    <section>
      <div className="mb-3 rounded-card border border-line bg-card p-4">
        <h2 className="text-lg">{cabecera.titulo}</h2>
        <p className="text-xs text-ink-3">{cabecera.filtros.length ? cabecera.filtros.join(' · ') : 'Sin filtros'}{cabecera.agrupacion ? ` · ${cabecera.agrupacion}` : ''} · {cabecera.generado}</p>
        {vista.truncado && (
          <p className="mt-2 text-sm text-alert">⚠ Hay más de {numeroEs(vista.limite, 0)} filas: el informe (y sus totales) se limita a las primeras {numeroEs(vista.limite, 0)}. Filtra más para verlo completo.</p>
        )}
        <div className="mt-3"><Metricas metricas={metricasCab} /></div>
      </div>

      {vista.grupos && (
        <div className="mb-3 overflow-x-auto rounded-card border border-line bg-card">
          <table className="tabla-cards w-full border-collapse text-sm md:min-w-[560px]">
            <thead>
              <tr className="border-b border-line bg-paper-2">
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-ink-3">{vista.agrupacion?.etiqueta.replace(/^Por /, '')}</th>
                {metricasCab.map(m => <th key={m.clave} className="px-3 py-2 text-right text-xs font-semibold uppercase text-ink-3">{m.etiqueta}</th>)}
              </tr>
            </thead>
            <tbody>
              {vista.grupos.slice(0, 500).map(g => (
                <tr key={g.clave} className="border-b border-line">
                  <td className="px-3 py-2 font-medium">{g.etiqueta}</td>
                  {g.metricas.map(m => <td key={m.clave} data-label={m.etiqueta} className="px-3 py-2 text-right tabular-nums">{formatearMetrica(m.formato, m.valor)}</td>)}
                </tr>
              ))}
              <tr className="bg-paper-2 font-semibold">
                <td className="px-3 py-2">TOTAL</td>
                {metricasCab.map(m => <td key={m.clave} data-label={m.etiqueta} className="px-3 py-2 text-right tabular-nums">{formatearMetrica(m.formato, m.valor)}</td>)}
              </tr>
            </tbody>
          </table>
          {vista.grupos.length > 500 && <p className="p-3 text-xs text-ink-3">Se muestran 500 de {numeroEs(vista.grupos.length, 0)} grupos; el Excel los incluye todos.</p>}
        </div>
      )}

      <div className="overflow-x-auto rounded-card border border-line bg-card">
        <table className="tabla-cards w-full border-collapse text-sm md:min-w-[600px]">
          <thead>
            <tr className="border-b border-line bg-paper-2">
              {cols.map(c => <th key={c.clave} className={`px-3 py-2 text-xs font-semibold uppercase text-ink-3 ${ES_NUM.has(c.tipo) ? 'text-right' : 'text-left'}`}>{c.etiqueta}</th>)}
            </tr>
          </thead>
          <tbody>
            {vista.filas.slice(0, mostrar).map((f, i) => {
              const g = gruposPorInicio.get(i)
              return (
                <Fragment key={i}>
                  {g && (
                    <tr className="bg-paper-2">
                      <td colSpan={cols.length} className="px-3 py-2 text-sm font-semibold">{g.etiqueta} <span className="font-normal text-ink-3">({numeroEs(g.n, 0)})</span></td>
                    </tr>
                  )}
                  <tr className="border-b border-line last:border-0">
                    {cols.map(c => (
                      <td key={c.clave} data-label={c.etiqueta} className={`px-3 py-2 ${ES_NUM.has(c.tipo) ? 'text-right tabular-nums' : ''}`}>
                        {formatearValor(c.tipo, f[c.clave] ?? null) || <span className="text-ink-3">—</span>}
                      </td>
                    ))}
                  </tr>
                </Fragment>
              )
            })}
            {vista.filas.length === 0 && (
              <tr><td colSpan={Math.max(cols.length, 1)} className="px-3 py-6 text-center text-ink-3">No hay datos con estos filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-ink-3">
        <span>Mostrando {numeroEs(mostrar, 0)} de {numeroEs(vista.filasTotales, 0)} filas</span>
        {mostrar < vista.filas.length && (
          <button type="button" className={BTN_SEC} onClick={onVerMas}>Ver más</button>
        )}
        {vista.filas.length < vista.filasTotales && mostrar >= vista.filas.length && (
          <span>La vista previa llega hasta {numeroEs(vista.filas.length, 0)} filas; descarga el Excel para verlas todas.</span>
        )}
      </div>
    </section>
  )
}
