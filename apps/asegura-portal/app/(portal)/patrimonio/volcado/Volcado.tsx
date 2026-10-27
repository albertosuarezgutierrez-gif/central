'use client'

import { useState } from 'react'

import type {
  ContratoVolcado,
  EvaluacionVolcado,
  GastoVolcado,
  InmuebleVolcado,
  PropuestaVolcado,
} from '@central/module-patrimonio'

import { eur } from '@/lib/dinero'

type Existente = { id: string; alias: string; uso: string; edificio: string | null }
type Vista = {
  id: string
  estado: 'propuesta' | 'revisada' | 'confirmada' | 'descartada'
  nombre: string | null
  propuesta: PropuestaVolcado | null
  evaluacion: EvaluacionVolcado | null
  motivos: string[]
  existentes: Existente[]
}
type Hecho = { resultado: { creados: number; yaExisten: number; conProblema: number }; inquilinos: { creados: number; pendientes: { contrato: string; motivo: string }[] } }

const POR_PAGINA = 50
const USOS: { v: string; t: string }[] = [
  { v: 'edificio', t: 'Edificio entero' }, { v: 'vivienda', t: 'Vivienda' }, { v: 'local', t: 'Local' }, { v: 'oficina', t: 'Oficina' },
  { v: 'nave', t: 'Nave' }, { v: 'garaje', t: 'Garaje' }, { v: 'trastero', t: 'Trastero' }, { v: 'otro', t: 'Otro' },
]
const CATEGORIAS: { v: string; t: string }[] = [
  { v: 'COMUNIDAD', t: 'Comunidad' }, { v: 'IMPUESTOS', t: 'Impuestos (IBI, basura…)' }, { v: 'SUMINISTROS', t: 'Suministros' },
  { v: 'SEGURO', t: 'Seguro' }, { v: 'MANTENIMIENTO', t: 'Mantenimiento' }, { v: 'GESTION', t: 'Gestión' },
  { v: 'FINANCIACION', t: 'Financiación' }, { v: 'OTRO', t: 'Otro' },
]
const PERIODICIDADES = [{ v: 'mensual', t: 'Mensual' }, { v: 'trimestral', t: 'Trimestral' }, { v: 'semestral', t: 'Semestral' }, { v: 'anual', t: 'Anual' }]

const ERRORES: Record<string, string> = {
  no_encontrado: 'No tienes permiso para dar de alta en ese patrimonio, o la propuesta ya no existe.',
  falta_fichero: 'Elige un fichero.',
  fichero_vacio: 'El fichero está vacío.',
  fichero_demasiado_grande: 'El fichero es demasiado grande (hojas: 5 MB; PDF o fotos: 10 MB).',
  formato_no_admitido: 'Formato no admitido. Sube un Excel (.xlsx), un CSV, un PDF o una foto (JPG, PNG, WebP).',
  fichero_ilegible: 'No hemos podido abrir el fichero. ¿Está dañado o protegido con contraseña?',
  sin_filas: 'No hemos encontrado filas con datos debajo de la cabecera.',
  sin_cabeceras: 'La primera fila de la hoja tiene que llevar los nombres de las columnas.',
  demasiadas_filas: 'La hoja tiene más de 500 filas. Divídela en varias.',
  demasiadas_columnas: 'La hoja tiene más de 60 columnas.',
  limite_diario: 'Has llegado al límite de cargas de hoy. Prueba mañana.',
  cupo_ia_agotado: 'Has llegado al límite de este mes de lectura automática; con tus seguros en Grupo ASegura tienes más. Puedes usar «Importar desde Excel» sin lectura automática.',
  sin_propuesta: 'No hemos podido proponer nada a partir de este fichero.',
  demasiadas_peticiones: 'Demasiados intentos seguidos. Prueba más tarde.',
  sin_sesion: 'Tu sesión ha caducado. Vuelve a entrar.',
  cerrado: 'Esta propuesta ya está cerrada.',
  falta_confirmacion: 'Marca la casilla de confirmación.',
  datos_invalidos: 'Hay un dato con un formato que no entendemos. Revísalo.',
}
const MOTIVO_INQUILINO: Record<string, string> = {
  sin_puente: 'el servicio de inquilinos no está disponible ahora',
  sin_clave: 'no podemos guardar datos de inquilinos ahora mismo',
  error: 'no se ha podido guardar',
}

const caja: React.CSSProperties = { display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }
const rejilla: React.CSSProperties = { display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }
const etiqueta: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, minWidth: 0 }
const campo: React.CSSProperties = { minHeight: 44, minWidth: 0, width: '100%' }
const ETIQUETA_ESTADO = { nueva: 'Se creará', ya_existe: 'Ya existe', con_problema: 'Hay que corregirlo' } as const

/** «1.234,56» / «750» → céntimos. Vacío → null (no consta). Ilegible → NaN (lo dice la validación del servidor). */
function aCentimos(t: string): number | null {
  const s = t.trim().replace(/\s|€/g, '')
  if (s === '') return null
  const normal = s.includes(',') || /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s
  return /^\d+(\.\d{1,2})?$/.test(normal) ? Math.round(Number(normal) * 100) : Number.NaN
}
const aTexto = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2).replace('.', ','))
const vacioANull = (s: string) => (s.trim() === '' ? null : s)

export function Volcado({ titulares }: { titulares: { clienteId: string; nombre: string }[] }) {
  const [titular, setTitular] = useState(titulares[0]?.clienteId ?? '')
  const [fichero, setFichero] = useState<File | null>(null)
  const [vista, setVista] = useState<Vista | null>(null)
  const [prop, setProp] = useState<PropuestaVolcado | null>(null)
  const [evaluacion, setEvaluacion] = useState<EvaluacionVolcado | null>(null)
  const [sucio, setSucio] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<Hecho | null>(null)
  const [conforme, setConforme] = useState(false)
  const [descartadas, setDescartadas] = useState(0)
  const [ver, setVer] = useState({ inmuebles: POR_PAGINA, contratos: POR_PAGINA, gastos: POR_PAGINA })

  const dice = (e: unknown) => (typeof e === 'string' ? ERRORES[e] ?? 'No se ha podido completar. Inténtalo de nuevo.' : 'No se ha podido completar. Inténtalo de nuevo.')

  async function cargar(id: string) {
    const r = await fetch(`/api/patrimonio/volcados/${id}`)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(dice(j.error))
    setVista(j as Vista)
    setProp((j as Vista).propuesta)
    setEvaluacion((j as Vista).evaluacion)
    setSucio(false)
  }

  async function subir(e: React.FormEvent) {
    e.preventDefault()
    if (!fichero) return setError(ERRORES.falta_fichero)
    setOcupado(true); setError(null); setHecho(null)
    try {
      const fd = new FormData()
      fd.set('titular', titular); fd.set('fichero', fichero)
      const r = await fetch('/api/patrimonio/volcados', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        const extra = Array.isArray(j.motivos) && j.motivos.length > 0 ? ` ${j.motivos.join(' ')}` : ''
        throw new Error(dice(j.error) + extra)
      }
      setDescartadas(typeof j.descartadas === 'number' ? j.descartadas : 0)
      await cargar(j.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : ERRORES.fichero_ilegible)
    } finally {
      setOcupado(false)
    }
  }

  function cambiar(f: (p: PropuestaVolcado) => PropuestaVolcado) {
    if (!prop) return
    setProp(f(prop)); setSucio(true); setConforme(false)
  }
  const inm = (k: number, c: Partial<InmuebleVolcado>) => cambiar((p) => ({ ...p, inmuebles: p.inmuebles.map((x, i) => (i === k ? { ...x, ...c } : x)) }))
  const con = (k: number, c: Partial<ContratoVolcado>) => cambiar((p) => ({ ...p, contratos: p.contratos.map((x, i) => (i === k ? { ...x, ...c } : x)) }))
  const gas = (k: number, c: Partial<GastoVolcado>) => cambiar((p) => ({ ...p, gastos: p.gastos.map((x, i) => (i === k ? { ...x, ...c } : x)) }))
  const quitar = (lista: 'inmuebles' | 'contratos' | 'gastos', k: number) => cambiar((p) => ({ ...p, [lista]: (p[lista] as unknown[]).filter((_, i) => i !== k) }) as PropuestaVolcado)

  async function comprobar() {
    if (!vista || !prop) return
    setOcupado(true); setError(null)
    try {
      const r = await fetch(`/api/patrimonio/volcados/${vista.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(prop) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(dice(j.error) + (j.campo ? ` (${j.campo})` : ''))
      setEvaluacion(j.evaluacion as EvaluacionVolcado)
      setSucio(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : dice(null))
    } finally {
      setOcupado(false)
    }
  }

  async function confirmar() {
    if (!vista || !prop || !conforme || sucio) return
    setOcupado(true); setError(null)
    try {
      const r = await fetch(`/api/patrimonio/volcados/${vista.id}/confirmar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmar: true, propuesta: prop }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(dice(j.error) + (j.campo ? ` (${j.campo})` : ''))
      setHecho(j as Hecho); setVista(null); setProp(null); setEvaluacion(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : dice(null))
    } finally {
      setOcupado(false)
    }
  }

  async function descartar() {
    if (!vista) return
    setOcupado(true); setError(null)
    try {
      await fetch(`/api/patrimonio/volcados/${vista.id}/descartar`, { method: 'POST' })
      setVista(null); setProp(null); setEvaluacion(null)
    } finally {
      setOcupado(false)
    }
  }

  const aviso = error && <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>

  if (hecho) {
    return (
      <section className="seccion" style={caja} aria-live="polite">
        <h2 style={{ margin: 0 }}>Patrimonio cargado</h2>
        <p style={{ margin: 0 }}>
          Se han creado {hecho.resultado.creados} elementos. {hecho.resultado.yaExisten > 0 && `${hecho.resultado.yaExisten} ya existían y no se han duplicado. `}
          {hecho.resultado.conProblema > 0 && `${hecho.resultado.conProblema} tenían un problema y no se han creado.`}
        </p>
        {hecho.inquilinos.creados > 0 && <p style={{ margin: 0 }}>Inquilinos añadidos a sus contratos: {hecho.inquilinos.creados}. Su DNI, correo y teléfono los puedes añadir en cada contrato.</p>}
        {hecho.inquilinos.pendientes.length > 0 && (
          <p role="note" style={{ margin: 0 }}>
            {hecho.inquilinos.pendientes.length} inquilino(s) NO se han podido añadir ({[...new Set(hecho.inquilinos.pendientes.map((x) => MOTIVO_INQUILINO[x.motivo] ?? x.motivo))].join('; ')}).
            Los contratos sí están creados: añade el inquilino desde cada contrato.
          </p>
        )}
        <p style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <a className="boton" style={{ minHeight: 44 }} href="/patrimonio">Ver mi patrimonio</a>
          <button type="button" className="boton-tenue" style={{ minHeight: 44 }} onClick={() => setHecho(null)}>Cargar otro fichero</button>
        </p>
      </section>
    )
  }

  if (!vista || !prop || !evaluacion) {
    return (
      <form onSubmit={subir} className="seccion" style={caja}>
        {titulares.length > 1 && (
          <label style={etiqueta}>
            Patrimonio de
            <select value={titular} onChange={(e) => setTitular(e.target.value)} style={campo}>
              {titulares.map((t) => <option key={t.clienteId} value={t.clienteId}>{t.nombre}</option>)}
            </select>
          </label>
        )}
        <label style={etiqueta}>
          Fichero
          <input type="file" accept=".xlsx,.csv,text/csv,application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFichero(e.target.files?.[0] ?? null)} style={campo} />
        </label>
        <p className="suave" style={{ margin: 0, fontSize: 13 }}>
          Excel o CSV de hasta 500 filas (5 MB), o un PDF o foto de hasta 10 MB. De los inquilinos solo leemos el nombre: el DNI,
          el teléfono, el correo y las cuentas bancarias se descartan al leer. Cada lectura cuenta en tu límite mensual de lectura automática.
        </p>
        {aviso}
        <button type="submit" className="boton" style={{ minHeight: 44 }} disabled={ocupado || !fichero}>{ocupado ? 'Leyendo… (puede tardar un minuto)' : 'Subir y proponer'}</button>
      </form>
    )
  }

  const abierta = vista.estado === 'propuesta' || vista.estado === 'revisada'
  const edificios = [
    ...prop.inmuebles.filter((i) => i.uso === 'edificio' && i.edificio === null).map((i) => ({ v: i.ref, t: i.alias ?? i.ref })),
    ...vista.existentes.filter((x) => x.uso === 'edificio' && x.edificio === null).map((x) => ({ v: x.id, t: `${x.alias} (ya en tu patrimonio)` })),
  ]
  const destinos = [
    ...prop.inmuebles.map((i) => ({ v: i.ref, t: i.alias ?? i.direccion ?? i.ref })),
    ...vista.existentes.map((x) => ({ v: x.id, t: `${x.alias} (ya en tu patrimonio)` })),
  ]
  const ev = <T extends { ref: string }>(lista: T[], ref: string) => lista.find((x) => x.ref === ref)
  const estado = (e: { estado: keyof typeof ETIQUETA_ESTADO; motivo: string | null; avisos: string[] } | undefined) =>
    !e || sucio ? <span className="chip">Sin comprobar</span> : (
      <>
        <span className="chip">{ETIQUETA_ESTADO[e.estado]}</span>
        {e.motivo && <div role="note" style={{ fontSize: 13 }}>{e.motivo}</div>}
        {e.estado === 'nueva' && e.avisos.map((a) => <div key={a} className="suave" style={{ fontSize: 13 }}>{a}</div>)}
      </>
    )
  const quitarBoton = (onClick: () => void) => (
    <button type="button" className="boton-tenue" style={{ minHeight: 44 }} disabled={!abierta || ocupado} onClick={onClick}>Quitar</button>
  )
  const verMas = (lista: keyof typeof ver, total: number) =>
    total > ver[lista] ? (
      <button type="button" className="boton-tenue" style={{ minHeight: 44 }} onClick={() => setVer({ ...ver, [lista]: ver[lista] + POR_PAGINA })}>Ver más ({total - ver[lista]} restantes)</button>
    ) : null

  return (
    <div style={caja}>
      <section className="seccion" style={caja} aria-live="polite">
        <h2 style={{ margin: 0 }}>Revisa la propuesta{vista.nombre ? ` de «${vista.nombre}»` : ''}</h2>
        {vista.motivos.map((m) => <p key={m} role="note" style={{ margin: 0 }}>{m}</p>)}
        {descartadas > 0 && <p className="suave" style={{ margin: 0, fontSize: 13 }}>Hemos descartado {descartadas} columna(s) con DNI, teléfono, correo o cuentas: no se leen.</p>}
        <p style={{ margin: 0 }}>
          {sucio ? 'Has hecho cambios: pulsa «Comprobar cambios» antes de confirmar.' : `Se crearán ${evaluacion.resumen.nuevos} · ya existen ${evaluacion.resumen.yaExisten} · por corregir ${evaluacion.resumen.conProblema}.`}
        </p>
        <p className="suave" style={{ margin: 0, fontSize: 13 }}>La lectura automática puede equivocarse: revisa sobre todo las rentas, las fechas y a qué piso va cada contrato.</p>
      </section>

      <section className="seccion" style={caja} aria-labelledby="v-inm">
        <h2 id="v-inm" style={{ margin: 0 }}>Inmuebles ({prop.inmuebles.length})</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          {prop.inmuebles.slice(0, ver.inmuebles).map((i, k) => (
            <li key={i.ref} className="seccion" style={{ margin: 0, minWidth: 0, display: 'grid', gap: 8 }}>
              {estado(ev(evaluacion.inmuebles, i.ref))}
              <div style={rejilla}>
                <label style={etiqueta}>Nombre<input value={i.alias ?? ''} disabled={!abierta} onChange={(e) => inm(k, { alias: vacioANull(e.target.value) })} style={campo} maxLength={80} /></label>
                <label style={etiqueta}>Uso
                  <select value={i.uso ?? ''} disabled={!abierta} onChange={(e) => inm(k, { uso: (vacioANull(e.target.value) as InmuebleVolcado['uso']) })} style={campo}>
                    <option value="">— Elige —</option>
                    {USOS.map((u) => <option key={u.v} value={u.v}>{u.t}</option>)}
                  </select>
                </label>
                {i.uso !== 'edificio' && edificios.length > 0 && (
                  <label style={etiqueta}>Dentro del edificio
                    <select value={i.edificio ?? ''} disabled={!abierta} onChange={(e) => inm(k, { edificio: vacioANull(e.target.value) })} style={campo}>
                      <option value="">— Ninguno (inmueble suelto) —</option>
                      {edificios.filter((x) => x.v !== i.ref).map((x) => <option key={x.v} value={x.v}>{x.t}</option>)}
                    </select>
                  </label>
                )}
                {i.edificio === null && (
                  <>
                    <label style={etiqueta}>Dirección<input value={i.direccion ?? ''} disabled={!abierta} onChange={(e) => inm(k, { direccion: vacioANull(e.target.value) })} style={campo} maxLength={200} /></label>
                    <label style={etiqueta}>Código postal<input inputMode="numeric" value={i.cp ?? ''} disabled={!abierta} onChange={(e) => inm(k, { cp: vacioANull(e.target.value) })} style={campo} maxLength={5} /></label>
                    <label style={etiqueta}>Referencia catastral<input value={i.referenciaCatastral ?? ''} disabled={!abierta} onChange={(e) => inm(k, { referenciaCatastral: vacioANull(e.target.value.replace(/\s/g, '').toUpperCase()) })} style={campo} maxLength={20} /></label>
                  </>
                )}
                <label style={etiqueta}>Superficie (m²)<input inputMode="decimal" value={i.superficieM2 ?? ''} disabled={!abierta} onChange={(e) => { const n = Number(e.target.value.replace(',', '.')); inm(k, { superficieM2: e.target.value.trim() === '' ? null : Number.isFinite(n) ? n : null }) }} style={campo} /></label>
              </div>
              <div>{quitarBoton(() => quitar('inmuebles', k))}</div>
            </li>
          ))}
        </ul>
        {verMas('inmuebles', prop.inmuebles.length)}
      </section>

      <section className="seccion" style={caja} aria-labelledby="v-con">
        <h2 id="v-con" style={{ margin: 0 }}>Contratos de alquiler ({prop.contratos.length})</h2>
        {prop.contratos.length === 0 && <p className="suave" style={{ margin: 0 }}>No hemos encontrado contratos en el fichero.</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          {prop.contratos.slice(0, ver.contratos).map((c, k) => (
            <li key={c.ref} className="seccion" style={{ margin: 0, minWidth: 0, display: 'grid', gap: 8 }}>
              {estado(ev(evaluacion.contratos, c.ref))}
              <div style={rejilla}>
                <label style={etiqueta}>Inmueble
                  <select value={c.inmueble ?? ''} disabled={!abierta} onChange={(e) => con(k, { inmueble: vacioANull(e.target.value) })} style={campo}>
                    <option value="">— Elige —</option>
                    {destinos.map((x) => <option key={x.v} value={x.v}>{x.t}</option>)}
                  </select>
                </label>
                <label style={etiqueta}>Inquilino (solo nombre)<input value={c.inquilino?.nombre ?? ''} disabled={!abierta} onChange={(e) => con(k, { inquilino: e.target.value.trim() === '' ? null : { nombre: e.target.value, tipo: c.inquilino?.tipo ?? 'persona' } })} style={campo} maxLength={200} /></label>
                <label style={etiqueta}>Desde<input type="date" value={c.inicio ?? ''} disabled={!abierta} onChange={(e) => con(k, { inicio: vacioANull(e.target.value) })} style={campo} /></label>
                <label style={etiqueta}>Hasta (vacío = indefinido)<input type="date" value={c.fin ?? ''} disabled={!abierta} onChange={(e) => con(k, { fin: vacioANull(e.target.value) })} style={campo} /></label>
                <label style={etiqueta}>Renta mensual (€) <span className="suave" style={{ fontWeight: 400 }}>{c.rentaCent === null || Number.isNaN(c.rentaCent) ? 'sin dato' : eur(c.rentaCent / 100)}</span>
                  <input inputMode="decimal" defaultValue={aTexto(c.rentaCent)} disabled={!abierta} onChange={(e) => con(k, { rentaCent: aCentimos(e.target.value) })} style={campo} />
                </label>
                <label style={etiqueta}>Fianza (€) <span className="suave" style={{ fontWeight: 400 }}>{c.fianzaCent === null || Number.isNaN(c.fianzaCent) ? 'sin dato' : eur(c.fianzaCent / 100)}</span>
                  <input inputMode="decimal" defaultValue={aTexto(c.fianzaCent)} disabled={!abierta} onChange={(e) => con(k, { fianzaCent: aCentimos(e.target.value) })} style={campo} />
                </label>
                <label style={etiqueta}>Actualización
                  <select value={c.indice ?? ''} disabled={!abierta} onChange={(e) => con(k, { indice: (vacioANull(e.target.value) as ContratoVolcado['indice']) })} style={campo}>
                    <option value="">Ninguna</option><option value="IPC">IPC</option><option value="IRAV">IRAV</option>
                  </select>
                </label>
              </div>
              <div>{quitarBoton(() => quitar('contratos', k))}</div>
            </li>
          ))}
        </ul>
        {verMas('contratos', prop.contratos.length)}
      </section>

      <section className="seccion" style={caja} aria-labelledby="v-gas">
        <h2 id="v-gas" style={{ margin: 0 }}>Gastos fijos ({prop.gastos.length})</h2>
        {prop.gastos.length === 0 && <p className="suave" style={{ margin: 0 }}>No hemos encontrado gastos que se repitan.</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          {prop.gastos.slice(0, ver.gastos).map((g, k) => (
            <li key={g.ref} className="seccion" style={{ margin: 0, minWidth: 0, display: 'grid', gap: 8 }}>
              {estado(ev(evaluacion.gastos, g.ref))}
              <div style={rejilla}>
                <label style={etiqueta}>Concepto<input value={g.concepto ?? ''} disabled={!abierta} onChange={(e) => gas(k, { concepto: vacioANull(e.target.value) })} style={campo} maxLength={200} /></label>
                <label style={etiqueta}>Inmueble
                  <select value={g.inmueble ?? ''} disabled={!abierta} onChange={(e) => gas(k, { inmueble: vacioANull(e.target.value) })} style={campo}>
                    <option value="">— Sin inmueble (del titular) —</option>
                    {destinos.map((x) => <option key={x.v} value={x.v}>{x.t}</option>)}
                  </select>
                </label>
                <label style={etiqueta}>Categoría
                  <select value={g.categoria ?? ''} disabled={!abierta} onChange={(e) => gas(k, { categoria: (vacioANull(e.target.value) as GastoVolcado['categoria']) })} style={campo}>
                    <option value="">— Elige —</option>
                    {CATEGORIAS.map((x) => <option key={x.v} value={x.v}>{x.t}</option>)}
                  </select>
                </label>
                <label style={etiqueta}>Cada cuánto
                  <select value={g.periodicidad ?? ''} disabled={!abierta} onChange={(e) => gas(k, { periodicidad: (vacioANull(e.target.value) as GastoVolcado['periodicidad']) })} style={campo}>
                    <option value="">— Elige —</option>
                    {PERIODICIDADES.map((x) => <option key={x.v} value={x.v}>{x.t}</option>)}
                  </select>
                </label>
                <label style={etiqueta}>Importe (€, vacío = variable) <span className="suave" style={{ fontWeight: 400 }}>{g.importeCent === null || Number.isNaN(g.importeCent) ? 'variable' : eur(g.importeCent / 100)}</span>
                  <input inputMode="decimal" defaultValue={aTexto(g.importeCent)} disabled={!abierta} onChange={(e) => gas(k, { importeCent: aCentimos(e.target.value) })} style={campo} />
                </label>
                <label style={etiqueta}>Día del mes<input inputMode="numeric" value={g.diaMes ?? ''} disabled={!abierta} onChange={(e) => { const n = Number(e.target.value); gas(k, { diaMes: e.target.value.trim() === '' ? null : Number.isInteger(n) ? n : null }) }} style={campo} maxLength={2} /></label>
                <label style={etiqueta}>Desde<input type="date" value={g.inicio ?? ''} disabled={!abierta} onChange={(e) => gas(k, { inicio: vacioANull(e.target.value) })} style={campo} /></label>
              </div>
              <div>{quitarBoton(() => quitar('gastos', k))}</div>
            </li>
          ))}
        </ul>
        {verMas('gastos', prop.gastos.length)}
      </section>

      {abierta && (
        <section className="seccion" style={caja}>
          {aviso}
          <button type="button" className="boton-tenue" style={{ minHeight: 44 }} disabled={ocupado || !sucio} onClick={comprobar}>Comprobar cambios</button>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
            <input type="checkbox" checked={conforme} disabled={sucio} onChange={(e) => setConforme(e.target.checked)} style={{ width: 24, height: 24 }} />
            He revisado la propuesta y quiero crear lo marcado como «Se creará».
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="boton" style={{ minHeight: 44 }} disabled={ocupado || sucio || !conforme || evaluacion.resumen.nuevos === 0} onClick={confirmar}>
              {ocupado ? 'Creando…' : `Confirmar y crear ${evaluacion.resumen.nuevos}`}
            </button>
            <button type="button" className="boton-tenue" style={{ minHeight: 44 }} disabled={ocupado} onClick={descartar}>Descartar la propuesta</button>
          </div>
        </section>
      )}
    </div>
  )
}
