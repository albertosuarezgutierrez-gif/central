'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { eur } from '@/lib/dinero'
import {
  CATEGORIAS_GASTO,
  ETIQUETA_CATEGORIA,
  ETIQUETA_PERIODICIDAD,
  PERIODICIDADES,
  eurosACentimos,
  type DerramaFila,
  type GastoFila,
  type PlantillaFila,
  type ComunidadFila,
  type TitularGastos,
} from '@/lib/patrimonio/gastos-api'
import { GENERAL, TEXTO_GENERAL, eleccionDeInmueble, inmuebleInicial } from '@/lib/patrimonio/gastos-vista'

export const PAGINA_GASTOS = 50

const ERRORES: Record<string, string> = {
  no_encontrado: 'No tienes permiso para hacer eso en este titular.',
  ya_existe: 'Eso ya existe.',
  demasiadas_peticiones: 'Demasiados intentos seguidos. Prueba más tarde.',
  sin_sesion: 'Tu sesión ha caducado. Vuelve a entrar.',
}
export const etiqueta: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, minWidth: 0 }
export const rejilla: React.CSSProperties = { display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }
export const lista: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }
export const fila: React.CSSProperties = { overflowWrap: 'anywhere', minWidth: 0 }
export const fechaEs = (iso: string) => iso.split('-').reverse().join('/')

/** Plegado perezoso: ~50 filas y «Ver más». */
export function Plegable<T extends { id: string }>({ filas, vacio, pinta }: { filas: T[]; vacio: string; pinta: (f: T) => React.ReactNode }) {
  const [visibles, setVisibles] = useState(PAGINA_GASTOS)
  if (filas.length === 0) return <p className="suave" style={{ margin: 0 }}>{vacio}</p>
  return (
    <>
      <ul style={lista}>{filas.slice(0, visibles).map((f) => <li key={f.id} style={fila}>{pinta(f)}</li>)}</ul>
      {filas.length > visibles && (
        <button type="button" className="boton boton-secundario" style={{ minHeight: 44, marginTop: 8 }} onClick={() => setVisibles((v) => v + PAGINA_GASTOS)}>
          Ver más ({filas.length - visibles} restantes)
        </button>
      )}
    </>
  )
}

/** Envío común: POST JSON y `router.refresh()` sin desmontar. */
export function useEnvio(url: string, alTerminar: () => void) {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function enviar(cuerpo: unknown) {
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
      const j = (await res.json().catch(() => ({}))) as { id?: string; error?: string; campo?: string }
      if (res.ok && j.id) {
        alTerminar()
        router.refresh()
        return
      }
      setError(j.error === 'datos_invalidos' ? `Revisa el campo «${j.campo ?? ''}».` : (ERRORES[j.error ?? ''] ?? 'No hemos podido guardarlo. Inténtalo de nuevo.'))
    } catch {
      setError('No hemos podido conectar. Vuelve a intentarlo.')
    } finally {
      setEnviando(false)
    }
  }
  return { enviando, error, enviar }
}

export function Formulario({ titulo, children, error, enviando, onSubmit, onCancelar }: {
  titulo: string; children: React.ReactNode; error: string | null; enviando: boolean; onSubmit: () => void; onCancelar: () => void
}) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit() }} style={{ ...rejilla, marginTop: 12 }}>
      <h3 style={{ margin: 0 }}>{titulo}</h3>
      {children}
      {error && <p className="error-linea" role="alert" style={{ margin: 0 }}>{error}</p>}
      <div className="acciones">
        <button type="submit" className="boton" style={{ minHeight: 44 }} disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="boton boton-secundario" style={{ minHeight: 44 }} disabled={enviando} onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  )
}

/** `inmuebleFijo`: desde la ficha del piso, el inmueble viene puesto y no se pregunta. */
export function NuevaPlantilla({ t, cerrar, inmuebleFijo }: { t: TitularGastos; cerrar: () => void; inmuebleFijo?: string }) {
  const [concepto, setConcepto] = useState('')
  const [categoria, setCategoria] = useState<string>('COMUNIDAD')
  const [periodicidad, setPeriodicidad] = useState<string>('mensual')
  const [diaMes, setDiaMes] = useState('1')
  const [inicio, setInicio] = useState('')
  const [fin, setFin] = useState('')
  const [importe, setImporte] = useState('')
  const [inmueble, setInmueble] = useState(() => inmuebleInicial(t.inmuebles, inmuebleFijo))
  const [proveedor, setProveedor] = useState('')
  const [local, setLocal] = useState<string | null>(null)
  const { enviando, error, enviar } = useEnvio('/api/patrimonio/plantillas', cerrar)
  return (
    <Formulario titulo="Nuevo gasto fijo" error={local ?? error} enviando={enviando} onCancelar={cerrar} onSubmit={() => {
      const cent = eurosACentimos(importe)
      if (cent === 'invalido') return setLocal('Revisa el campo «importe».')
      const eleccion = eleccionDeInmueble(t.inmuebles, inmueble)
      if (!eleccion.ok) return setLocal('Elige a qué piso corresponde el gasto, o marca que es un gasto general del titular.')
      setLocal(null)
      void enviar({
        titular: t.clienteId, concepto, categoria, periodicidad, diaMes: Number(diaMes), inicio, fin: fin || null,
        importeCent: cent, inmueble: eleccion.inmueble, proveedor: proveedor || null,
      })
    }}>
      <label style={etiqueta}>Concepto<input className="campo" value={concepto} maxLength={200} required disabled={enviando} onChange={(e) => setConcepto(e.target.value)} /></label>
      {inmuebleFijo ? (
        <p style={{ margin: 0 }}>Piso: <strong>{t.inmuebles.find((i) => i.id === inmuebleFijo)?.alias ?? 'este inmueble'}</strong></p>
      ) : (
        <label style={etiqueta}>¿De qué piso es este gasto?
          <select className="campo" value={inmueble} required disabled={enviando} onChange={(e) => setInmueble(e.target.value)}>
            {t.inmuebles.length > 1 && <option value="" disabled>Elige un piso</option>}
            {t.inmuebles.map((i) => <option key={i.id} value={i.id}>{i.alias}</option>)}
            <option value={GENERAL}>{TEXTO_GENERAL}</option>
          </select>
        </label>
      )}
      <label style={etiqueta}>Categoría
        <select className="campo" value={categoria} disabled={enviando} onChange={(e) => setCategoria(e.target.value)}>
          {CATEGORIAS_GASTO.map((c) => <option key={c} value={c}>{ETIQUETA_CATEGORIA[c]}</option>)}
        </select>
      </label>
      <label style={etiqueta}>Cada cuánto
        <select className="campo" value={periodicidad} disabled={enviando} onChange={(e) => setPeriodicidad(e.target.value)}>
          {PERIODICIDADES.map((p) => <option key={p} value={p}>{ETIQUETA_PERIODICIDAD[p]}</option>)}
        </select>
      </label>
      <label style={etiqueta}>Día del mes (1-31)<input className="campo" type="number" min={1} max={31} value={diaMes} required disabled={enviando} onChange={(e) => setDiaMes(e.target.value)} /></label>
      <label style={etiqueta}>Desde<input className="campo" type="date" value={inicio} required disabled={enviando} onChange={(e) => setInicio(e.target.value)} /></label>
      <label style={etiqueta}>Hasta (opcional)<input className="campo" type="date" value={fin} disabled={enviando} onChange={(e) => setFin(e.target.value)} /></label>
      <label style={etiqueta}>Importe en € (vacío = variable, se confirma con la factura)
        <input className="campo" inputMode="decimal" value={importe} disabled={enviando} onChange={(e) => setImporte(e.target.value)} />
      </label>
      <label style={etiqueta}>Proveedor (opcional)<input className="campo" value={proveedor} maxLength={120} disabled={enviando} onChange={(e) => setProveedor(e.target.value)} /></label>
    </Formulario>
  )
}

export function NuevaComunidad({ t, cerrar }: { t: TitularGastos; cerrar: () => void }) {
  const [nombre, setNombre] = useState('')
  const [administrador, setAdministrador] = useState('')
  const [email, setEmail] = useState('')
  const [elegidos, setElegidos] = useState<Record<string, string>>({})
  const [local, setLocal] = useState<string | null>(null)
  const { enviando, error, enviar } = useEnvio('/api/patrimonio/comunidades', cerrar)
  return (
    <Formulario titulo="Nueva comunidad de propietarios" error={local ?? error} enviando={enviando} onCancelar={cerrar} onSubmit={() => {
      const inmuebles: { inmueble: string; coeficiente: number | null }[] = []
      for (const [id, c] of Object.entries(elegidos)) {
        const n = c.trim() === '' ? null : Number(c.replace(',', '.'))
        if (n !== null && !(n > 0 && n <= 100)) return setLocal('El coeficiente debe estar entre 0 y 100 (o vacío si no lo sabes).')
        inmuebles.push({ inmueble: id, coeficiente: n })
      }
      setLocal(null)
      void enviar({ titular: t.clienteId, nombre, administradorNombre: administrador || null, administradorEmail: email || null, inmuebles })
    }}>
      <label style={etiqueta}>Nombre<input className="campo" value={nombre} maxLength={120} required disabled={enviando} onChange={(e) => setNombre(e.target.value)} /></label>
      <label style={etiqueta}>Administrador (opcional)<input className="campo" value={administrador} maxLength={120} disabled={enviando} onChange={(e) => setAdministrador(e.target.value)} /></label>
      <label style={etiqueta}>Correo del administrador (opcional)<input className="campo" type="email" value={email} disabled={enviando} onChange={(e) => setEmail(e.target.value)} /></label>
      <fieldset style={{ ...rejilla, margin: 0, border: 0, padding: 0, minWidth: 0 }}>
        <legend style={{ fontSize: 13, fontWeight: 600 }}>Inmuebles que están en esta comunidad</legend>
        {t.inmuebles.length === 0 && <p className="suave" style={{ margin: 0 }}>Aún no hay inmuebles dados de alta.</p>}
        {t.inmuebles.map((i) => (
          <div key={i.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', minHeight: 44 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44, flex: '1 1 160px', minWidth: 0 }}>
              <input type="checkbox" checked={i.id in elegidos} disabled={enviando}
                onChange={(e) => setElegidos((x) => { const y = { ...x }; if (e.target.checked) y[i.id] = ''; else delete y[i.id]; return y })} />
              <span style={fila}>{i.alias}</span>
            </label>
            {i.id in elegidos && (
              <input className="campo" style={{ flex: '0 1 140px' }} inputMode="decimal" placeholder="Coeficiente % (opcional)" aria-label={`Coeficiente de ${i.alias}`}
                value={elegidos[i.id]} disabled={enviando} onChange={(e) => setElegidos((x) => ({ ...x, [i.id]: e.target.value }))} />
            )}
          </div>
        ))}
      </fieldset>
    </Formulario>
  )
}

export function NuevaDerrama({ t, cerrar, inmuebleFijo }: { t: TitularGastos; cerrar: () => void; inmuebleFijo?: string }) {
  const enlaces = t.comunidades.flatMap((c) => c.inmuebles.filter((i) => !inmuebleFijo || i.inmuebleId === inmuebleFijo).map((i) => ({ clave: `${c.id}|${i.inmuebleId}`, comunidad: c.id, inmueble: i.inmuebleId, texto: `${c.nombre} · ${i.alias}` })))
  const [sel, setSel] = useState(enlaces[0]?.clave ?? '')
  const [concepto, setConcepto] = useState('')
  const [total, setTotal] = useState('')
  const [cuotas, setCuotas] = useState('1')
  const [primera, setPrimera] = useState('')
  const [local, setLocal] = useState<string | null>(null)
  const { enviando, error, enviar } = useEnvio('/api/patrimonio/derramas', cerrar)
  return (
    <Formulario titulo="Nueva derrama" error={local ?? error} enviando={enviando} onCancelar={cerrar} onSubmit={() => {
      const e = enlaces.find((x) => x.clave === sel)
      const cent = eurosACentimos(total)
      if (!e) return setLocal('Elige comunidad e inmueble.')
      if (cent === null || cent === 'invalido') return setLocal('Revisa el campo «total».')
      setLocal(null)
      void enviar({ titular: t.clienteId, comunidad: e.comunidad, inmueble: e.inmueble, concepto, totalCent: cent, cuotas: Number(cuotas), primera })
    }}>
      <label style={etiqueta}>Comunidad e inmueble
        <select className="campo" value={sel} disabled={enviando} onChange={(e) => setSel(e.target.value)}>
          {enlaces.map((e) => <option key={e.clave} value={e.clave}>{e.texto}</option>)}
        </select>
      </label>
      <label style={etiqueta}>Concepto<input className="campo" value={concepto} maxLength={200} required disabled={enviando} onChange={(e) => setConcepto(e.target.value)} /></label>
      <label style={etiqueta}>Total que le toca al inmueble, en €<input className="campo" inputMode="decimal" value={total} required disabled={enviando} onChange={(e) => setTotal(e.target.value)} /></label>
      <label style={etiqueta}>Nº de cuotas mensuales (1 = pago único)<input className="campo" type="number" min={1} max={120} value={cuotas} required disabled={enviando} onChange={(e) => setCuotas(e.target.value)} /></label>
      <label style={etiqueta}>Fecha de la primera cuota<input className="campo" type="date" value={primera} required disabled={enviando} onChange={(e) => setPrimera(e.target.value)} /></label>
    </Formulario>
  )
}


const sub: React.CSSProperties = { fontSize: 13 }
const catTxt = (c: string | null) => (c === null ? null : (ETIQUETA_CATEGORIA[c as keyof typeof ETIQUETA_CATEGORIA] ?? c))

/** Fila de un gasto fijo. `conInmueble` solo en la vista del titular entero. */
export function FilaPlantilla({ p, conInmueble }: { p: PlantillaFila; conInmueble?: boolean }) {
  return (
    <>
      <strong>{p.concepto}</strong>{!p.activo && <span className="chip" style={{ marginLeft: 8 }}>Pausado</span>}
      <br />
      <span className="suave" style={sub}>
        {catTxt(p.categoria)} · {ETIQUETA_PERIODICIDAD[p.periodicidad as keyof typeof ETIQUETA_PERIODICIDAD] ?? p.periodicidad} · día {p.diaMes}
        {' · '}{p.importeCent === null ? 'Importe variable' : eur(p.importeCent / 100)}
        {conInmueble ? ` · ${p.inmuebleAlias ?? 'Gasto general'}` : ''}{' · desde '}{fechaEs(p.inicio)}{p.fin ? ` hasta ${fechaEs(p.fin)}` : ''}
      </span>
    </>
  )
}

export function FilaComunidad({ c }: { c: ComunidadFila }) {
  return (
    <>
      <strong>{c.nombre}</strong>
      <br />
      <span className="suave" style={sub}>
        {c.administradorNombre ? `Administra: ${c.administradorNombre} · ` : ''}
        {c.inmuebles.length === 0 ? 'Sin inmuebles enlazados' : c.inmuebles.map((i) => `${i.alias}${i.coeficiente === null ? ' (coeficiente: no consta)' : ` (${i.coeficiente.toLocaleString('es-ES')} %)`}`).join(', ')}
      </span>
    </>
  )
}

export function FilaDerrama({ d }: { d: DerramaFila }) {
  return (
    <>
      <strong>{d.concepto}</strong>
      <br />
      <span className="suave" style={sub}>
        {d.comunidadNombre} · {d.inmuebleAlias} · {eur(d.totalCent / 100)} en {d.cuotas} {d.cuotas === 1 ? 'cuota' : 'cuotas'} desde {fechaEs(d.primera)}
      </span>
    </>
  )
}

/** Confirmar / descartar un gasto propuesto. Importe sin saber → se pide antes de confirmar (nunca se inventa un 0). */
function AccionesGasto({ clienteId, g }: { clienteId: string; g: GastoFila }) {
  const router = useRouter()
  const [importe, setImporte] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function resolver(accion: 'confirmar' | 'descartar') {
    let importeCent: number | undefined
    if (accion === 'confirmar' && g.totalCent === null) {
      const c = eurosACentimos(importe)
      if (c === null || c === 'invalido') return setError('Escribe el importe real del gasto para confirmarlo.')
      importeCent = c
    }
    setOcupado(true)
    setError(null)
    try {
      const res = await fetch('/api/patrimonio/gastos', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titular: clienteId, gasto: g.id, accion, ...(importeCent !== undefined ? { importeCent } : {}) }),
      })
      // 409 = ya estaba resuelto (otra pestaña, otra persona): se recarga y se ve cómo quedó.
      if (res.ok || res.status === 409) return router.refresh()
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      setError(j.error === 'no_encontrado' ? 'No tienes permiso para hacer eso en este titular.' : j.error === 'sin_sesion' ? 'Tu sesión ha caducado. Vuelve a entrar.' : 'No hemos podido guardarlo. Inténtalo de nuevo.')
    } catch {
      setError('No hemos podido conectar. Vuelve a intentarlo.')
    } finally {
      setOcupado(false)
    }
  }
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      {g.totalCent === null && (
        <label style={etiqueta}>Importe real en € (este gasto es de importe variable)
          <input className="campo" inputMode="decimal" value={importe} disabled={ocupado} onChange={(e) => setImporte(e.target.value)} />
        </label>
      )}
      {error && <p className="error-linea" role="alert" style={{ margin: 0 }}>{error}</p>}
      <div className="acciones">
        <button type="button" className="boton" style={{ minHeight: 44 }} disabled={ocupado} onClick={() => void resolver('confirmar')}>{ocupado ? 'Guardando…' : 'Confirmar'}</button>
        <button type="button" className="boton boton-secundario" style={{ minHeight: 44 }} disabled={ocupado} onClick={() => void resolver('descartar')}>Descartar</button>
      </div>
    </div>
  )
}

/**
 * Un gasto ya generado: «Por confirmar» (propuesto) o «Confirmado». Importe `null` = sin saber, nunca 0.
 * `puedeGestionar` + `clienteId`: solo entonces el propuesto lleva «Confirmar» / «Descartar».
 */
export function FilaGasto({ g, clienteId, puedeGestionar }: { g: GastoFila; clienteId?: string; puedeGestionar?: boolean }) {
  return (
    <>
      <strong>{g.concepto ?? 'Gasto'}</strong>
      <span className="chip" style={{ marginLeft: 8 }}>{g.estado === 'propuesto' ? 'Por confirmar' : 'Confirmado'}</span>
      <br />
      <span className="suave" style={sub}>
        {[catTxt(g.categoria), fechaEs(g.fecha), g.totalCent === null ? 'Importe sin confirmar' : eur(g.totalCent / 100)].filter(Boolean).join(' · ')}
      </span>
      {g.estado === 'propuesto' && puedeGestionar && clienteId && <AccionesGasto clienteId={clienteId} g={g} />}
    </>
  )
}
