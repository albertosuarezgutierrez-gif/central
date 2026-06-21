'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

const C = { dark:'#14110E', bg2:'#1E1A15', bg3:'#2A221A', paper:'#F6F1E7', ink2:'#D8CDB6', ink3:'#9C8E7E', ink4:'#6B5F52', red:'#D9442B', amber:'#E8A33B', green:'#3F7D44', rule:'#2E2720' }

interface Foto { id: string; url: string; caption?: string; aprobada_marketing: boolean; usada_instagram: boolean; usada_blog: boolean; subida_por_personal?: { nombre: string }; created_at: string }

export default function GaleriaEventoPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [fotos, setFotos] = useState<Foto[]>([])
  const [cargando, setCargando] = useState(true)
  const [urlNueva, setUrlNueva] = useState('')
  const [captionNueva, setCaptionNueva] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [filtro, setFiltro] = useState<'todas'|'pendiente'|'aprobada'>('todas')

  const cargar = async () => {
    setCargando(true)
    const r = await fetch(`/api/owner/eventos/${id}/galeria`)
    const d = await r.json()
    setFotos(d.fotos || [])
    setCargando(false)
  }

  useEffect(() => { cargar() }, [id])

  const subirFoto = async () => {
    if (!urlNueva.trim()) return
    setSubiendo(true)
    await fetch(`/api/owner/eventos/${id}/galeria`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: urlNueva.trim(), caption: captionNueva })
    })
    setUrlNueva(''); setCaptionNueva(''); cargar()
    setSubiendo(false)
  }

  const toggleAprobada = async (foto: Foto) => {
    await fetch(`/api/owner/eventos/${id}/galeria`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ foto_id: foto.id, aprobada_marketing: !foto.aprobada_marketing })
    })
    cargar()
  }

  const eliminar = async (fotoId: string) => {
    if (!confirm('¿Eliminar foto?')) return
    await fetch(`/api/owner/eventos/${id}/galeria`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ foto_id: fotoId })
    })
    cargar()
  }

  const sh = (s: React.CSSProperties) => s
  const fotosFiltradas = fotos.filter(f =>
    filtro === 'todas' ? true :
    filtro === 'pendiente' ? !f.aprobada_marketing :
    f.aprobada_marketing
  )

  return (
    <div style={sh({ minHeight:'100vh', background:C.dark, fontFamily:'Inter Tight, sans-serif' })}>
      <div style={sh({ background:C.bg2, borderBottom:`1px solid ${C.rule}`, padding:'1rem 1.5rem', display:'flex', alignItems:'center', gap:'1rem' })}>
        <button onClick={() => router.back()} style={sh({ background:'transparent', border:'none', color:C.ink2, cursor:'pointer', fontSize:'1.2rem' })}>←</button>
        <div>
          <div style={sh({ color:C.paper, fontWeight:700 })}>Galería del evento</div>
          <div style={sh({ color:C.ink3, fontSize:'0.78rem' })}>{fotos.length} fotos · {fotos.filter(f=>f.aprobada_marketing).length} aprobadas</div>
        </div>
      </div>

      <div style={sh({ padding:'1.25rem 1.5rem' })}>
        {/* Añadir foto */}
        <div style={sh({ background:C.bg2, borderRadius:10, padding:'1rem', marginBottom:'1.25rem', border:`1px solid ${C.rule}` })}>
          <div style={sh({ color:C.ink3, fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.75rem' })}>Añadir foto</div>
          <input type="text" value={urlNueva} onChange={e => setUrlNueva(e.target.value)}
            placeholder="URL de la imagen"
            style={sh({ width:'100%', padding:'0.7rem', background:C.bg3, border:`1px solid ${C.rule}`, borderRadius:8, color:C.paper, fontSize:'0.9rem', boxSizing:'border-box', marginBottom:'0.5rem' })} />
          <div style={sh({ display:'flex', gap:'0.5rem' })}>
            <input type="text" value={captionNueva} onChange={e => setCaptionNueva(e.target.value)}
              placeholder="Descripción (opcional)"
              style={sh({ flex:1, padding:'0.7rem', background:C.bg3, border:`1px solid ${C.rule}`, borderRadius:8, color:C.paper, fontSize:'0.9rem' })} />
            <button onClick={subirFoto} disabled={!urlNueva.trim() || subiendo}
              style={sh({ padding:'0.7rem 1.2rem', background:C.red, border:'none', borderRadius:8, color:C.paper, cursor:'pointer', fontWeight:600, whiteSpace:'nowrap' })}>
              {subiendo ? '...' : '+ Añadir'}
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div style={sh({ display:'flex', gap:'0.5rem', marginBottom:'1rem', flexWrap:'wrap' })}>
          {(['todas','pendiente','aprobada'] as const).map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              style={sh({ padding:'0.4rem 0.9rem', border:`2px solid ${filtro===f ? C.red : C.rule}`, borderRadius:20, background:filtro===f ? 'rgba(217,68,43,0.15)' : C.bg2, color:filtro===f ? C.paper : C.ink3, cursor:'pointer', fontSize:'0.82rem' })}>
              {f==='todas' ? `Todas (${fotos.length})` : f==='pendiente' ? `Pendientes (${fotos.filter(fo=>!fo.aprobada_marketing).length})` : `Aprobadas (${fotos.filter(fo=>fo.aprobada_marketing).length})`}
            </button>
          ))}
        </div>

        {cargando && <div style={sh({ color:C.ink3, textAlign:'center', padding:'2rem' })}>Cargando...</div>}

        {/* Grid fotos */}
        <div style={sh({ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:'0.75rem' })}>
          {fotosFiltradas.map(foto => (
            <div key={foto.id} style={sh({ background:C.bg2, borderRadius:10, overflow:'hidden', border:`1px solid ${foto.aprobada_marketing ? C.green : C.rule}` })}>
              <div style={sh({ position:'relative', paddingBottom:'66%', overflow:'hidden' })}>
                <img src={foto.url} alt={foto.caption || 'foto evento'}
                  style={sh({ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' })}
                  onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                <div style={sh({ position:'absolute', top:'0.4rem', right:'0.4rem', display:'flex', gap:'0.3rem' })}>
                  {foto.usada_instagram && <span style={sh({ background:'rgba(0,0,0,0.7)', borderRadius:4, padding:'0.15rem 0.35rem', color:C.amber, fontSize:'0.65rem' })}>📸 IG</span>}
                  {foto.usada_blog && <span style={sh({ background:'rgba(0,0,0,0.7)', borderRadius:4, padding:'0.15rem 0.35rem', color:C.ink2, fontSize:'0.65rem' })}>📝</span>}
                </div>
              </div>
              <div style={sh({ padding:'0.75rem' })}>
                {foto.caption && <div style={sh({ color:C.ink2, fontSize:'0.82rem', marginBottom:'0.5rem' })}>{foto.caption}</div>}
                <div style={sh({ color:C.ink4, fontSize:'0.72rem', marginBottom:'0.6rem' })}>
                  {foto.subida_por_personal?.nombre} · {new Date(foto.created_at).toLocaleDateString('es-ES')}
                </div>
                <div style={sh({ display:'flex', gap:'0.4rem', flexWrap:'wrap' })}>
                  <button onClick={() => toggleAprobada(foto)}
                    style={sh({ flex:1, padding:'0.4rem', border:`1px solid ${foto.aprobada_marketing ? C.green : C.rule}`, borderRadius:6, background:foto.aprobada_marketing ? 'rgba(63,125,68,0.15)' : 'transparent', color:foto.aprobada_marketing ? C.green : C.ink3, cursor:'pointer', fontSize:'0.75rem' })}>
                    {foto.aprobada_marketing ? '✅ Aprobada' : 'Aprobar'}
                  </button>
                  <button onClick={() => eliminar(foto.id)}
                    style={sh({ padding:'0.4rem 0.6rem', border:`1px solid ${C.rule}`, borderRadius:6, background:'transparent', color:C.ink4, cursor:'pointer', fontSize:'0.75rem' })}>
                    🗑
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {fotosFiltradas.length === 0 && !cargando && (
          <div style={sh({ textAlign:'center', padding:'3rem', color:C.ink3 })}>
            <div style={sh({ fontSize:'2rem', marginBottom:'0.5rem' })}>📷</div>
            {filtro === 'todas' ? 'Sin fotos todavía' : `Sin fotos ${filtro === 'pendiente' ? 'pendientes' : 'aprobadas'}`}
          </div>
        )}
      </div>
    </div>
  )
}
