'use client'
import { useState, useEffect } from 'react'
import AdminShell from '@/components/AdminShell'

type Branding = { nombre: string; color_primario: string | null; logo_url: string | null }
type DocEmpresa = { id: string; categoria: string; nombre: string; storage_path: string; anio: number | null; mes: number | null; subido_at: string; url: string | null }

const CATEGORIAS = [
  { id: 'cif', label: 'CIF' },
  { id: 'escritura', label: 'Escritura' },
  { id: 'seguro_social', label: 'Seguro Social (TC2)' },
  { id: 'poliza', label: 'Póliza de seguro' },
  { id: 'contrato', label: 'Contrato' },
  { id: 'otro', label: 'Otro' },
]
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function EmpresaClient({ branding }: { branding: Branding }) {
  const [docs, setDocs] = useState<DocEmpresa[]>([])
  const [docCategoria, setDocCategoria] = useState('contrato')
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

  const porCategoria = CATEGORIAS.map(c => ({
    ...c,
    items: docs.filter(d => d.categoria === c.id),
  })).filter(c => c.items.length > 0)

  return (
    <AdminShell activo="empresa" logoUrl={branding.logo_url} nombreEmpresa={branding.nombre} colorPrimario={branding.color_primario}>
      <h1 className="mb-4 text-2xl">Documentación de empresa</h1>

      <section className="mb-6 rounded-card border border-line bg-card p-4">
        <h2 className="mb-3 text-base font-semibold">Subir documento</h2>
        <form onSubmit={subirDoc} className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            <select value={docCategoria} onChange={e => setDocCategoria(e.target.value)} className="text-sm">
              {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            {(docCategoria === 'seguro_social' || docCategoria === 'poliza') && (
              <>
                <input placeholder="Año (ej. 2026)" value={docAnio} onChange={e => setDocAnio(e.target.value)} className="w-24 text-sm" />
                {docCategoria === 'seguro_social' && (
                  <select value={docMes} onChange={e => setDocMes(e.target.value)} className="text-sm">
                    <option value="">Mes</option>
                    {MESES.map((m, i) => <option key={i + 1} value={String(i + 1)}>{m}</option>)}
                  </select>
                )}
              </>
            )}
            <input placeholder="Nombre del documento (opcional)" value={docNombre} onChange={e => setDocNombre(e.target.value)} className="flex-1 min-w-[160px] text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <input key={docFileKey} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xml"
              onChange={e => setDocFile(e.target.files?.[0] ?? null)} className="flex-1 text-sm" />
            <button type="submit" disabled={subiendoDoc}>{subiendoDoc ? 'Subiendo…' : 'Subir'}</button>
          </div>
          {docMsg && <p className={`text-sm ${docMsg.startsWith('Error') ? 'text-alert' : 'text-ok'}`}>{docMsg}</p>}
        </form>
      </section>

      {porCategoria.length > 0 ? (
        <div className="grid gap-4">
          {porCategoria.map(cat => (
            <section key={cat.id} className="rounded-card border border-line bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-3">{cat.label}</h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {cat.items.map(d => (
                      <tr key={d.id} className="border-b border-line/50 last:border-0 hover:bg-paper-2/50">
                        <td className="py-2 pr-3">
                          {d.url
                            ? <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-accent no-underline hover:underline">{d.nombre}</a>
                            : <span>{d.nombre}</span>}
                          {d.anio && <span className="ml-1 text-xs text-ink-3">{d.anio}{d.mes ? `/${String(d.mes).padStart(2,'0')}` : ''}</span>}
                        </td>
                        <td className="py-2 pr-3 text-xs text-ink-3 hidden sm:table-cell whitespace-nowrap">
                          {new Date(d.subido_at).toLocaleDateString('es-ES')}
                        </td>
                        <td className="py-2 text-right">
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
            </section>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-3">Sin documentos. Sube el primero con el formulario de arriba.</p>
      )}
    </AdminShell>
  )
}
