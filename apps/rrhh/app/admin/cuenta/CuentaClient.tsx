'use client'
import { useState, useEffect } from 'react'
import AdminShell from '@/components/AdminShell'
import { CATEGORIAS, MESES, etiquetaCategoria, pideAnio, pideMes, sufijoPeriodo } from '@/lib/categorias-empresa'

type Analisis = { resumen?: string; dias_permisos?: Record<string, number | string>; jornada_anual_horas?: number | string | null; vacaciones?: number | string | null; fuente?: string | null; _meta?: { aviso?: string; con_busqueda?: boolean } }
type Branding = { nombre: string; color_primario: string | null; logo_url: string | null; tiene_fichaje?: boolean }
type DocEmpresa = { id: string; categoria: string; nombre: string; storage_path: string; anio: number | null; mes: number | null; subido_at: string; url: string | null }

export default function CuentaClient({ convenio, analisis, analisisFecha, branding }: {
  convenio: { codigo: string; nombre: string }
  analisis: Analisis | null
  analisisFecha: string | null
  branding: Branding
}) {
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const [cod, setCod] = useState(convenio.codigo)
  const [nom, setNom] = useState(convenio.nombre)
  const [convMsg, setConvMsg] = useState('')

  const [color, setColor] = useState(branding.color_primario ?? '#2b6a6e')
  const [logoUrl, setLogoUrl] = useState(branding.logo_url)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [brandMsg, setBrandMsg] = useState('')
  const [guardandoBrand, setGuardandoBrand] = useState(false)

  async function guardarMarca(e: React.FormEvent) {
    e.preventDefault(); setBrandMsg(''); setGuardandoBrand(true)
    const fd = new FormData()
    fd.set('color', color)
    if (logoFile) fd.set('file', logoFile)
    const r = await fetch('/api/admin/cuenta/branding', { method: 'POST', body: fd })
    const j = await r.json().catch(() => ({}))
    if (r.ok) { setBrandMsg('Marca guardada'); setLogoFile(null); if (j.branding?.logo_url) setLogoUrl(j.branding.logo_url) }
    else setBrandMsg(j.error ?? 'Error al guardar')
    setGuardandoBrand(false)
  }

  async function quitarLogo() {
    setBrandMsg(''); setGuardandoBrand(true)
    const fd = new FormData(); fd.set('quitar_logo', '1')
    const r = await fetch('/api/admin/cuenta/branding', { method: 'POST', body: fd })
    if (r.ok) { setLogoUrl(null); setLogoFile(null); setBrandMsg('Logo quitado') } else setBrandMsg('Error')
    setGuardandoBrand(false)
  }

  const [docs, setDocs] = useState<DocEmpresa[]>([])
  const [docCategoria, setDocCategoria] = useState('cif')
  const [docNombre, setDocNombre] = useState('')
  const [docAnio, setDocAnio] = useState<string>('')
  const [docMes, setDocMes] = useState<string>('')
  const [docFile, setDocFile] = useState<File | null>(null)
  const [docFileKey, setDocFileKey] = useState(0)
  const [docMsg, setDocMsg] = useState('')
  const [subiendoDoc, setSubiendoDoc] = useState(false)

  async function cargarDocs() {
    const r = await fetch('/api/admin/cuenta/documentos')
    if (r.ok) setDocs((await r.json()).documentos)
  }
  useEffect(() => { cargarDocs() }, [])

  async function subirDoc(e: React.FormEvent) {
    e.preventDefault(); setDocMsg(''); setSubiendoDoc(true)
    const fd = new FormData()
    fd.set('categoria', docCategoria)
    fd.set('nombre', docNombre || docFile?.name || 'documento')
    if (docAnio) fd.set('anio', docAnio)
    if (docMes) fd.set('mes', docMes)
    if (docFile) fd.set('file', docFile)
    else { setDocMsg('Selecciona un archivo'); setSubiendoDoc(false); return }
    const r = await fetch('/api/admin/cuenta/documentos', { method: 'POST', body: fd })
    setSubiendoDoc(false)
    if (r.ok) { setDocNombre(''); setDocAnio(''); setDocMes(''); setDocFile(null); setDocFileKey(k => k + 1); await cargarDocs(); setDocMsg('Documento subido') }
    else setDocMsg((await r.json()).error ?? 'Error al subir')
  }

  async function borrarDoc(id: string, nombre: string) {
    if (!confirm(`¿Borrar "${nombre}"?`)) return
    await fetch(`/api/admin/cuenta/documentos/${id}`, { method: 'DELETE' })
    await cargarDocs()
  }

  function cambiarCategoria(id: string) {
    setDocCategoria(id)
    if (!pideAnio(id)) setDocAnio('')
    if (!pideMes(id)) setDocMes('')
  }

  const [datos, setDatos] = useState<Analisis | null>(analisis)
  const [fecha, setFecha] = useState<string | null>(analisisFecha)
  const [analizando, setAnalizando] = useState(false)
  const [analisisMsg, setAnalisisMsg] = useState('')

  async function analizar() {
    setAnalizando(true); setAnalisisMsg('')
    const r = await fetch('/api/admin/cuenta/convenio/analizar', { method: 'POST' })
    const j = await r.json().catch(() => ({}))
    if (j.ok && j.datos) { setDatos(j.datos); setFecha(new Date().toISOString()); setAnalisisMsg('Convenio analizado') }
    else setAnalisisMsg(j.mensaje ?? j.error ?? 'No se pudo analizar')
    setAnalizando(false)
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault(); setMsg(''); setError('')
    const r = await fetch('/api/auth/cambiar-password', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actual, nueva }),
    })
    if (r.ok) { setActual(''); setNueva(''); setMsg('Contraseña actualizada') }
    else setError((await r.json()).error ?? 'Error')
  }

  async function guardarConvenio(e: React.FormEvent) {
    e.preventDefault(); setConvMsg('')
    const r = await fetch('/api/admin/cuenta/convenio', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ codigo: cod, nombre: nom }),
    })
    setConvMsg(r.ok ? 'Convenio guardado' : 'Error al guardar')
  }

  return (
    <AdminShell activo="cuenta" logoUrl={branding.logo_url} nombreEmpresa={branding.nombre} colorPrimario={branding.color_primario} tieneFichaje={branding.tiene_fichaje}>
      <h1 className="text-2xl">Mi cuenta</h1>

      <section className="my-3 max-w-sm rounded-card border border-line bg-card p-4">
        <h2 className="mb-2 text-base">Identidad corporativa (marca blanca)</h2>
        <form onSubmit={guardarMarca} className="grid grid-cols-1 gap-2.5">
          <label className="text-ink-2 text-sm">Color corporativo</label>
          <div className="flex items-center gap-2">
            <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#2b6a6e'}
              onChange={e => setColor(e.target.value)} className="h-10 w-12 p-1" aria-label="Color corporativo" />
            <input value={color} onChange={e => setColor(e.target.value)} placeholder="#2b6a6e" className="min-w-0 flex-1" />
            <span className="inline-block h-9 w-9 shrink-0 rounded-lg border border-line" style={{ background: color }} aria-hidden />
          </div>

          <label className="text-ink-2 mt-1 text-sm">Logo (PNG, JPG, SVG o WebP · máx. 2 MB)</label>
          {logoUrl && (
            <div className="flex items-center gap-3">
              <img src={logoUrl} alt="Logo actual" className="max-h-10 w-auto max-w-[160px] object-contain" />
              <button type="button" onClick={quitarLogo} disabled={guardandoBrand} className="bg-paper-2 text-ink-2 hover:bg-line text-xs">Quitar</button>
            </div>
          )}
          {/* w-full + min-w-0: el ancho intrínseco del control de archivo (~370 px) ensanchaba
              el grid del formulario y sacaba la sección del viewport en móvil. */}
          <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="w-full min-w-0"
            onChange={e => setLogoFile(e.target.files?.[0] ?? null)} />

          <button type="submit" disabled={guardandoBrand}>{guardandoBrand ? 'Guardando…' : 'Guardar marca'}</button>
          {brandMsg && <p className="text-ok text-sm">{brandMsg}</p>}
        </form>
        <p className="text-ink-3 mt-2 text-xs">El logo y el color se aplican al <strong>Portal del Empleado</strong> que ven tus trabajadores. Deja el color vacío para usar el de iarrhh.</p>
      </section>

      <section className="my-3 max-w-sm rounded-card border border-line bg-card p-4">
        <h2 className="mb-2 text-base">Convenio colectivo</h2>
        <form onSubmit={guardarConvenio} className="grid grid-cols-1 gap-2.5">
          <input placeholder="Código del convenio (REGCON)" value={cod} onChange={e => setCod(e.target.value)} />
          <input placeholder="Nombre del convenio (opcional)" value={nom} onChange={e => setNom(e.target.value)} />
          <button type="submit">Guardar convenio</button>
          {convMsg && <p className="text-ok text-sm">{convMsg}</p>}
        </form>
        <p className="text-ink-3 mt-2 text-xs">El convenio determina los días de permisos y las tablas salariales aplicables.</p>

        <div className="mt-3 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={analizar} disabled={analizando || !cod} className="bg-paper-2 text-accent-ink hover:bg-line">
              {analizando ? 'Analizando…' : '🤖 Analizar convenio con IA'}
            </button>
            {fecha && <span className="text-ink-3 text-xs">Actualizado: {new Date(fecha).toLocaleString('es-ES')}</span>}
          </div>
          {analisisMsg && <p className="text-ink-3 mt-1 text-sm">{analisisMsg}</p>}

          {datos && (
            <div className="mt-2 grid gap-1 text-sm">
              {datos.resumen && <p className="text-ink-2">{datos.resumen}</p>}
              {datos.dias_permisos && Object.keys(datos.dias_permisos).length > 0 && (
                <div>
                  <p className="text-ink-3 text-xs">Días de permisos (orientativo):</p>
                  <ul className="grid grid-cols-1 gap-0.5">
                    {Object.entries(datos.dias_permisos).map(([k, v]) => (
                      <li key={k} className="text-xs">· {k.replace(/_/g, ' ')}: <strong>{String(v)}</strong></li>
                    ))}
                  </ul>
                </div>
              )}
              {datos.vacaciones != null && <p className="text-xs">· Vacaciones: <strong>{String(datos.vacaciones)}</strong></p>}
              {datos.jornada_anual_horas != null && <p className="text-xs">· Jornada anual: <strong>{String(datos.jornada_anual_horas)}</strong></p>}
              {datos.fuente && <p className="text-ink-3 text-xs">Fuente: {datos.fuente}</p>}
              <p className="text-alert text-xs">⚠️ {datos._meta?.aviso ?? 'Datos orientativos; verifícalos con el texto oficial del convenio.'}</p>
            </div>
          )}
        </div>
      </section>

      <section className="my-3 rounded-card border border-line bg-card p-4">
        <h2 className="mb-3 text-base">Documentación de empresa</h2>
        <form onSubmit={subirDoc} className="mb-4 grid gap-2">
          <div className="flex min-w-0 flex-wrap gap-2">
            <select value={docCategoria} onChange={e => cambiarCategoria(e.target.value)} className="text-sm" aria-label="Categoría del documento">
              {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            {pideAnio(docCategoria) && (
              <>
                <input placeholder="Año (ej. 2026)" value={docAnio} onChange={e => setDocAnio(e.target.value)} className="w-24 text-sm" aria-label="Año" />
                {pideMes(docCategoria) && (
                  <select value={docMes} onChange={e => setDocMes(e.target.value)} className="text-sm" aria-label="Mes">
                    <option value="">Mes</option>
                    {MESES.map((m, i) => <option key={i + 1} value={String(i + 1)}>{m}</option>)}
                  </select>
                )}
              </>
            )}
            <input placeholder="Nombre del documento (opcional)" value={docNombre} onChange={e => setDocNombre(e.target.value)} className="flex-1 text-sm" />
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <input key={docFileKey} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xml" onChange={e => setDocFile(e.target.files?.[0] ?? null)} className="min-w-0 flex-1 text-sm" />
            <button type="submit" disabled={subiendoDoc}>{subiendoDoc ? 'Subiendo…' : 'Subir'}</button>
          </div>
          {docMsg && <p className="text-sm text-ok">{docMsg}</p>}
        </form>

        {docs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-ink-3">
                  <th className="pb-1 text-left text-xs font-semibold uppercase">Categoría</th>
                  <th className="pb-1 text-left text-xs font-semibold uppercase">Nombre</th>
                  <th className="pb-1 text-left text-xs font-semibold uppercase hidden sm:table-cell">Fecha</th>
                  <th className="pb-1"></th>
                </tr>
              </thead>
              <tbody>
                {docs.map(d => (
                  <tr key={d.id} className="border-b border-line/50 last:border-0 hover:bg-paper-2/50">
                    <td className="py-1.5 pr-2 text-xs text-ink-3">{etiquetaCategoria(d.categoria)}{d.anio ? ` ${sufijoPeriodo(d.anio, d.mes)}` : ''}</td>
                    <td className="py-1.5 pr-2">{d.nombre}</td>
                    <td className="py-1.5 pr-2 text-xs text-ink-3 hidden sm:table-cell">{new Date(d.subido_at).toLocaleDateString('es-ES')}</td>
                    <td className="py-1.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer" className="rounded px-2 py-0.5 text-xs bg-paper-2 text-ink-2 hover:bg-line no-underline">Descargar</a>}
                        <button onClick={() => borrarDoc(d.id, d.nombre)} className="px-2 py-0.5 text-xs text-alert bg-paper-2 hover:bg-line">🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-ink-3">Sin documentos subidos</p>
        )}
      </section>

      <section className="my-3 max-w-sm rounded-card border border-line bg-card p-4">
        <h2 className="mb-2 text-base">Cambiar contraseña</h2>
        <form onSubmit={enviar} className="grid grid-cols-1 gap-2.5">
          <input type="password" placeholder="Contraseña actual" value={actual} onChange={e => setActual(e.target.value)} />
          <input type="password" placeholder="Nueva contraseña (mín. 8)" value={nueva} onChange={e => setNueva(e.target.value)} minLength={8} />
          <button type="submit">Guardar</button>
          {msg && <p className="text-ok text-sm">{msg}</p>}
          {error && <p className="text-alert text-sm">{error}</p>}
        </form>
      </section>
    </AdminShell>
  )
}
