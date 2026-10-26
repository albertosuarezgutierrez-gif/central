'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { eur } from '@/lib/dinero'

type Tipo = 'inmueble' | 'contrato' | 'gasto'
type Estado = 'nueva' | 'ya_existe' | 'repetida' | 'con_problema'
type Fila = { n: number; estado: Estado; motivo: string | null; avisos: string[]; datos: Record<string, unknown> }
type Vista = {
  id: string
  estado: 'propuesta' | 'revisada' | 'confirmada' | 'descartada'
  tipo: Tipo
  nombre: string | null
  cabeceras: string[]
  mapeo: { columnas: Record<string, number | null>; usoPorDefecto: string | null }
  campos: { campo: string; etiqueta: string }[]
  faltan: string[]
  muestra: (string | number | null)[][]
  filas: Fila[]
  resumen: { nuevas: number; yaExisten: number; repetidas: number; conProblema: number; porValidar: number } | null
}

const TIPOS: { v: Tipo; t: string }[] = [
  { v: 'inmueble', t: 'Inmuebles' },
  { v: 'contrato', t: 'Contratos de alquiler' },
  { v: 'gasto', t: 'Gastos' },
]
const USOS = ['vivienda', 'local', 'oficina', 'nave', 'garaje', 'trastero', 'otro']
const POR_PAGINA = 50

const ERRORES: Record<string, string> = {
  no_encontrado: 'No tienes permiso para importar en ese titular, o la importación ya no existe.',
  falta_fichero: 'Elige un fichero.',
  fichero_vacio: 'El fichero está vacío.',
  fichero_demasiado_grande: 'El fichero pasa de 5 MB.',
  formato_no_admitido: 'Solo admitimos CSV. En Excel: Archivo → Guardar como → «CSV (delimitado por comas)» y sube ese fichero.',
  fichero_ilegible: 'No hemos podido abrir el fichero. ¿Está dañado o protegido con contraseña?',
  sin_filas: 'No hemos encontrado filas con datos debajo de la cabecera.',
  sin_cabeceras: 'La primera fila tiene que llevar los nombres de las columnas.',
  demasiadas_filas: 'El fichero tiene más de 500 filas. Divídelo en varios.',
  demasiadas_columnas: 'El fichero tiene más de 60 columnas.',
  tipo_no_reconocido: 'No hemos reconocido qué datos trae. Elige arriba si son inmuebles, contratos o gastos y vuelve a subirlo.',
  limite_diario: 'Has llegado al límite de importaciones de hoy. Prueba mañana.',
  demasiadas_peticiones: 'Demasiados intentos seguidos. Prueba más tarde.',
  sin_sesion: 'Tu sesión ha caducado. Vuelve a entrar.',
  cerrada: 'Esta importación ya está cerrada.',
  mapeo_incompleto: 'Faltan columnas imprescindibles. Elígelas arriba.',
}
const ETIQUETA_FALTA: Record<string, string> = { alias: 'nombre, dirección o referencia', uso: 'uso (o elige uno para todo el fichero)', inmueble: 'inmueble', inicio: 'fecha de inicio', renta: 'renta', fecha: 'fecha', importe: 'importe' }

const fechaEs = (f: unknown) => (typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) ? `${f.slice(8)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '—')
const cent = (v: unknown) => (typeof v === 'number' ? eur(v / 100) : '—')
const txt = (v: unknown) => (typeof v === 'string' && v !== '' ? v : '—')

function resumenFila(tipo: Tipo, d: Record<string, unknown>): string {
  if (tipo === 'inmueble') return [txt(d.alias), txt(d.uso), d.direccionNormalizada ? String(d.direccionNormalizada) : 'sin dirección'].join(' · ')
  if (tipo === 'contrato') return `${txt(d.inmueble)} · desde ${fechaEs(d.inicio)}${d.fin ? ` hasta ${fechaEs(d.fin)}` : ' (sin fin)'} · renta ${cent(d.rentaCent)} · fianza ${cent(d.fianzaCent)}`
  return `${fechaEs(d.fecha)} · ${txt(d.concepto)} · ${txt(d.categoria)} · ${cent(d.totalCent)}${d.inmueble ? ` · ${String(d.inmueble)}` : ''}`
}

const ETIQUETA_ESTADO: Record<Estado, string> = { nueva: 'Se creará', ya_existe: 'Ya existe', repetida: 'Repetida', con_problema: 'Hay que corregirla' }
const caja: React.CSSProperties = { display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }
const etiqueta: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, minWidth: 0 }

export function Importador({ titulares }: { titulares: { clienteId: string; nombre: string }[] }) {
  const router = useRouter()
  const [titular, setTitular] = useState(titulares[0]?.clienteId ?? '')
  const [tipo, setTipo] = useState<'auto' | Tipo>('auto')
  const [fichero, setFichero] = useState<File | null>(null)
  const [vista, setVista] = useState<Vista | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<{ creadas: number; yaExisten: number; repetidas: number; conProblema: number } | null>(null)
  const [verTodas, setVerTodas] = useState(false)
  const [soloRevisar, setSoloRevisar] = useState(false)
  const [descartadas, setDescartadas] = useState(0)

  const dice = (e: unknown) => (typeof e === 'string' ? ERRORES[e] ?? 'No se ha podido completar. Inténtalo de nuevo.' : 'No se ha podido completar. Inténtalo de nuevo.')

  async function cargar(id: string) {
    const r = await fetch(`/api/patrimonio/importaciones/${id}`)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(dice(j.error))
    setVista(j as Vista)
  }

  async function subir(e: React.FormEvent) {
    e.preventDefault()
    if (!fichero) return setError(ERRORES.falta_fichero)
    setOcupado(true); setError(null); setHecho(null)
    try {
      const fd = new FormData()
      fd.set('titular', titular); fd.set('tipo', tipo); fd.set('fichero', fichero)
      const r = await fetch('/api/patrimonio/importaciones', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(dice(j.error))
      setDescartadas(typeof j.descartadas === 'number' ? j.descartadas : 0)
      await cargar(j.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : ERRORES.fichero_ilegible)
    } finally {
      setOcupado(false)
    }
  }

  async function mapear(cambios: { columnas?: Record<string, number | null>; usoPorDefecto?: string | null; tipo?: Tipo }) {
    if (!vista) return
    setOcupado(true); setError(null)
    try {
      const cuerpo = {
        tipo: cambios.tipo ?? vista.tipo,
        columnas: cambios.columnas ?? vista.mapeo.columnas,
        usoPorDefecto: cambios.usoPorDefecto === undefined ? vista.mapeo.usoPorDefecto : cambios.usoPorDefecto,
      }
      const r = await fetch(`/api/patrimonio/importaciones/${vista.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(dice(j.error))
      setVista(j as Vista)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido actualizar.')
    } finally {
      setOcupado(false)
    }
  }

  async function accion(que: 'confirmar' | 'descartar') {
    if (!vista) return
    setOcupado(true); setError(null)
    try {
      const r = await fetch(`/api/patrimonio/importaciones/${vista.id}/${que}`, { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(dice(j.error))
      if (que === 'confirmar') {
        const res = j.resultado as { creadas: number; yaExisten: number; repetidas: number; conProblema: number }
        setHecho(res)
      }
      setVista(null); setFichero(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido completar.')
    } finally {
      setOcupado(false)
    }
  }

  const aviso = error && <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>

  if (hecho) {
    return (
      <section className="seccion" style={caja} aria-live="polite">
        <h2 style={{ margin: 0 }}>Importación hecha</h2>
        <p style={{ margin: 0 }}>
          Hemos creado {hecho.creadas} {hecho.creadas === 1 ? 'elemento' : 'elementos'}.
          {hecho.yaExisten > 0 && ` ${hecho.yaExisten} ya existían y no se han tocado.`}
          {hecho.repetidas > 0 && ` ${hecho.repetidas} estaban repetidas en el fichero.`}
          {hecho.conProblema > 0 && ` ${hecho.conProblema} se han quedado fuera porque tenían algún problema: corrígelas en el Excel y vuelve a subirlo (lo que ya está creado no se duplica).`}
        </p>
        <p style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <a className="boton" style={{ minHeight: 44 }} href="/patrimonio">Ver mi patrimonio</a>
          <button type="button" className="boton-tenue" style={{ minHeight: 44 }} onClick={() => setHecho(null)}>Importar otro fichero</button>
        </p>
      </section>
    )
  }

  if (!vista) {
    return (
      <form onSubmit={subir} className="seccion" style={caja}>
        <label style={etiqueta}>
          Titular
          <select value={titular} onChange={(e) => setTitular(e.target.value)} style={{ minHeight: 44 }}>
            {titulares.map((t) => <option key={t.clienteId} value={t.clienteId}>{t.nombre}</option>)}
          </select>
        </label>
        <label style={etiqueta}>
          ¿Qué trae el fichero?
          <select value={tipo} onChange={(e) => setTipo(e.target.value as 'auto' | Tipo)} style={{ minHeight: 44 }}>
            <option value="auto">Que lo detecte la aplicación</option>
            {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.t}</option>)}
          </select>
        </label>
        <label style={etiqueta}>
          Fichero CSV (hasta 5 MB y 500 filas). ¿Tienes un Excel? Guárdalo como CSV: Archivo → Guardar como → CSV
          <input type="file" accept=".csv,text/csv" onChange={(e) => setFichero(e.target.files?.[0] ?? null)} style={{ minHeight: 44 }} />
        </label>
        <p className="suave" style={{ margin: 0, fontSize: 13 }}>
          ¿No tienes hoja? Descarga una plantilla:{' '}
          {TIPOS.map((t, i) => (
            <span key={t.v}>{i > 0 && ' · '}<a href={`/api/patrimonio/importaciones/plantilla?tipo=${t.v}`}>{t.t}</a></span>
          ))}
          . No guardamos el fichero, y las columnas con NIF, correo, teléfono, IBAN o inquilino se ignoran:
          esos datos no se importan.
        </p>
        {aviso}
        <button type="submit" className="boton" style={{ minHeight: 44 }} disabled={ocupado || !fichero}>{ocupado ? 'Leyendo…' : 'Subir y revisar'}</button>
      </form>
    )
  }

  const abierta = vista.estado === 'propuesta' || vista.estado === 'revisada'
  const filasVisibles = vista.filas.filter((f) => !soloRevisar || f.estado !== 'nueva' || f.avisos.length > 0)
  const mostradas = verTodas ? filasVisibles : filasVisibles.slice(0, POR_PAGINA)
  const r = vista.resumen
  return (
    <div style={caja}>
      <section className="seccion" style={caja} aria-labelledby="mapeo">
        <h2 id="mapeo" style={{ margin: 0 }}>1. Columnas{vista.nombre ? ` de «${vista.nombre}»` : ''}</h2>
        <label style={etiqueta}>
          Datos del fichero
          <select value={vista.tipo} disabled={ocupado || !abierta} onChange={(e) => mapear({ tipo: e.target.value as Tipo, columnas: {} })} style={{ minHeight: 44 }}>
            {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.t}</option>)}
          </select>
        </label>
        <p className="suave" style={{ margin: 0, fontSize: 13 }}>
          Hemos propuesto qué columna es cada dato. Revisa y cambia lo que no esté bien.
          {descartadas > 0 && ` Se han ignorado ${descartadas} ${descartadas === 1 ? 'columna' : 'columnas'} con datos personales.`}
        </p>
        {vista.campos.map((c) => (
          <label key={c.campo} style={etiqueta}>
            {c.etiqueta}
            <select
              value={vista.mapeo.columnas[c.campo] ?? ''}
              disabled={ocupado || !abierta}
              onChange={(e) => mapear({ columnas: { ...vista.mapeo.columnas, [c.campo]: e.target.value === '' ? null : Number(e.target.value) } })}
              style={{ minHeight: 44 }}
            >
              <option value="">— no importar —</option>
              {vista.cabeceras.map((h, i) => (
                <option key={i} value={i}>{h}{vista.muestra[0]?.[i] != null ? ` (ej.: ${String(vista.muestra[0][i]).slice(0, 30)})` : ''}</option>
              ))}
            </select>
          </label>
        ))}
        {vista.tipo === 'inmueble' && (
          <label style={etiqueta}>
            Uso para todos los que no lo traigan
            <select value={vista.mapeo.usoPorDefecto ?? ''} disabled={ocupado || !abierta} onChange={(e) => mapear({ usoPorDefecto: e.target.value === '' ? null : e.target.value })} style={{ minHeight: 44 }}>
              <option value="">— ninguno: las filas sin uso se quedan fuera —</option>
              {USOS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
        )}
        {vista.faltan.length > 0 && (
          <p role="status" style={{ margin: 0 }}>Falta elegir: {vista.faltan.map((f) => ETIQUETA_FALTA[f] ?? f).join(', ')}.</p>
        )}
      </section>

      <section className="seccion" style={caja} aria-labelledby="previa">
        <h2 id="previa" style={{ margin: 0 }}>2. Vista previa</h2>
        {r && (
          <p style={{ margin: 0 }} aria-live="polite">
            Se crearán <strong>{r.nuevas}</strong>
            {r.yaExisten > 0 && <> · ya existen {r.yaExisten}</>}
            {r.repetidas > 0 && <> · repetidas {r.repetidas}</>}
            {r.conProblema > 0 && <> · con problema {r.conProblema}</>}
            {r.porValidar > 0 && <> · direcciones por validar {r.porValidar}</>}
            . Nada se crea hasta que confirmes.
          </p>
        )}
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
          <input type="checkbox" checked={soloRevisar} onChange={(e) => setSoloRevisar(e.target.checked)} />
          Solo las que hay que mirar (problemas, repetidas o con aviso)
        </label>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          {mostradas.map((f) => (
            <li key={f.n} className="seccion" style={{ margin: 0, minWidth: 0, overflowWrap: 'anywhere' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span className="chip">Fila {f.n}</span>
                <strong>{ETIQUETA_ESTADO[f.estado]}</strong>
              </div>
              <div style={{ marginTop: 6 }}>{resumenFila(vista.tipo, f.datos)}</div>
              {f.motivo && <div role="note" style={{ marginTop: 6 }}>{f.motivo}</div>}
              {f.estado === 'nueva' && f.avisos.map((a) => <div key={a} className="suave" style={{ marginTop: 4, fontSize: 13 }}>{a}</div>)}
            </li>
          ))}
        </ul>
        {filasVisibles.length > mostradas.length && (
          <button type="button" className="boton-tenue" style={{ minHeight: 44 }} onClick={() => setVerTodas(true)}>Ver las {filasVisibles.length - mostradas.length} restantes</button>
        )}
        {aviso}
        <div className="acciones">
          <button type="button" className="boton" style={{ minHeight: 44 }} disabled={ocupado || !abierta || vista.faltan.length > 0} onClick={() => accion('confirmar')}>
            {ocupado ? 'Trabajando…' : r && r.nuevas > 0 ? `Confirmar y crear ${r.nuevas}` : 'Confirmar'}
          </button>
          <button type="button" className="boton-tenue" style={{ minHeight: 44 }} disabled={ocupado || !abierta} onClick={() => accion('descartar')}>Descartar</button>
        </div>
      </section>
    </div>
  )
}
