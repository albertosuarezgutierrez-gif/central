'use client'
import { SE, SN, SM } from '@/lib/colors'
import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const C = {
  bg:'#14110E', bg2:'#1E1A15', bg3:'#2A221A',
  cream:'#F6F1E7', creamMid:'#D8CDB6', creamDim:'#8C7B69',
  vermilion:'#D9442B', amber:'#E8A33B', green:'#3F7D44', rule:'#2E2720',
}

type Screen = 'paid' | 'google' | 'feedback' | 'whatsapp' | 'email' | 'gracias'

interface RestInfo {
  nombre: string
  google_review_url: string | null
  instagram_url: string | null
  web_url: string | null
}

const FooterBranding = () => (
  <div style={{ padding:'10px 0 8px', textAlign:'center', borderTop:`1px solid ${C.rule}33`, flexShrink:0 }}>
    <a href="https://www.iarest.es" target="_blank" rel="noopener noreferrer"
       style={{ textDecoration:'none', display:'inline-flex', alignItems:'center', gap:4, opacity:0.32 }}>
      <span style={{ fontFamily:'monospace', fontSize:8, color:C.creamDim, letterSpacing:'0.1em', textTransform:'uppercase' }}>Gestionado con</span>
      <span style={{ fontFamily:'serif', fontSize:10, fontStyle:'italic', color:C.cream, fontWeight:600 }}>ia.rest</span>
      <span style={{ fontFamily:'monospace', fontSize:8, color:C.creamDim }}>· www.iarest.es</span>
    </a>
  </div>
)

function QrSuccessInner() {
  const params       = useSearchParams()
  const sesionId     = params.get('sesion')
  const [screen, setScreen] = useState<Screen>('paid')
  const [stars,  setStars]  = useState(0)
  const [hover,  setHover]  = useState(0)
  const [rest,   setRest]   = useState<RestInfo | null>(null)
  const [feedback, setFeedback] = useState('')
  const [chips,    setChips]   = useState<string[]>([])
  const [email,    setEmail]   = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const valoracionId = useRef<string | null>(null)

  // Cargar datos del restaurante desde la sesión
  useEffect(() => {
    if (!sesionId) return
    fetch(`${SUPABASE_URL}/rest/v1/qr_sesiones_cliente?id=eq.${sesionId}&select=restaurantes(nombre,google_review_url,instagram_url,web_url)`, {
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
    })
      .then(r => r.json())
      .then(data => {
        const r = data?.[0]?.restaurantes
        if (r) setRest(r)
      })
      .catch(() => {})
  }, [sesionId])

  // Guardar valoración
  async function guardarValoracion(estrellas: number): Promise<string | null> {
    if (!sesionId) return null
    try {
      const body: Record<string, unknown> = {
        sesion_id: sesionId,
        estrellas,
        ...(rest && { restaurante_id: undefined }) // se obtiene por FK desde sesion
      }
      // Necesitamos el restaurante_id — lo sacamos de la sesión
      const sesRes = await fetch(`${SUPABASE_URL}/rest/v1/qr_sesiones_cliente?id=eq.${sesionId}&select=restaurante_id`, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
      })
      const sesData = await sesRes.json()
      const restaurante_id = sesData?.[0]?.restaurante_id
      if (!restaurante_id) return null

      const res = await fetch(`${SUPABASE_URL}/rest/v1/qr_valoraciones`, {
        method: 'POST',
        headers: {
          'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`,
          'Content-Type': 'application/json', 'Prefer': 'return=representation'
        },
        body: JSON.stringify({ sesion_id: sesionId, restaurante_id, estrellas })
      })
      const data = await res.json()
      return data?.[0]?.id ?? null
    } catch { return null }
  }

  // Actualizar campo en la valoración
  async function actualizarValoracion(campos: Record<string, unknown>) {
    if (!valoracionId.current) return
    fetch(`${SUPABASE_URL}/rest/v1/qr_valoraciones?id=eq.${valoracionId.current}`, {
      method: 'PATCH',
      headers: {
        'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(campos)
    }).catch(() => {})
  }

  const handleStars = async (s: number) => {
    setStars(s)
    const id = await guardarValoracion(s)
    valoracionId.current = id
    setScreen(s >= 4 ? 'google' : 'feedback')
  }

  const handleGoogle = () => {
    actualizarValoracion({ enviado_google: true })
    const url = rest?.google_review_url || 'https://maps.google.com'
    window.open(url, '_blank')
    setScreen('whatsapp')
  }

  const handleWhatsapp = () => {
    actualizarValoracion({ compartido_whatsapp: true })
    const nombre = rest?.nombre ?? 'este restaurante'
    const web    = rest?.web_url ?? ''
    const texto  = `He disfrutado mucho en ${nombre}. Si buscas dónde comer bien, te lo recomiendo 👌${web ? ' ' + web : ''}`
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')
    setScreen('email')
  }

  const handleSkipWhatsapp = () => setScreen('email')

  const handleEmail = async () => {
    if (!email.trim()) { setScreen('gracias'); return }
    await actualizarValoracion({ email_captado: email.trim() })
    setEmailSent(true)
    setTimeout(() => setScreen('gracias'), 1200)
  }

  const handleFeedback = async () => {
    await actualizarValoracion({
      comentario: feedback,
      opciones_feedback: chips,
    })
    setScreen('email')
  }

  const nombreRest = rest?.nombre ?? 'el restaurante'

  return (
    <div style={{ fontFamily:"'Inter Tight', sans-serif", background:C.bg, color:C.cream,
                  minHeight:'100vh', maxWidth:480, margin:'0 auto',
                  display:'flex', flexDirection:'column' }}>
      <style>{`
        @keyframes pop{0%{transform:scale(0);opacity:0}60%{transform:scale(1.2)}100%{transform:scale(1);opacity:1}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .ani{animation:fadeUp 0.35s ease both}
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>

      {/* ── PAID: check + estrellas ── */}
      {screen === 'paid' && (
        <div className="ani" style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center',
                                       justifyContent:'center', padding:'32px 24px', gap:22, textAlign:'center' }}>
          <div style={{ width:80, height:80, borderRadius:'50%', background:`${C.green}20`,
                        border:`2px solid ${C.green}`, display:'flex', alignItems:'center',
                        justifyContent:'center', fontSize:36, animation:'pop 0.5s ease' }}>✓</div>
          <div>
            <div style={{ fontFamily:'Georgia, serif', fontSize:26, fontStyle:'italic', marginBottom:5 }}>¡Pagado!</div>
            <div style={{ fontSize:13, color:C.creamDim }}>Recibo enviado a tu móvil</div>
          </div>
          <div style={{ width:'100%', background:C.bg2, borderRadius:16, padding:'22px 18px', border:`1px solid ${C.rule}` }}>
            <div style={{ fontFamily:'cursive', fontSize:15, color:C.amber, marginBottom:4 }}>¿Cómo fue tu experiencia?</div>
            <div style={{ fontSize:11, color:C.creamDim, marginBottom:16 }}>en {nombreRest}</div>
            <div style={{ display:'flex', justifyContent:'center', gap:6, marginBottom:18 }}>
              {[1,2,3,4,5].map(s => (
                <button key={s}
                  onMouseEnter={()=>setHover(s)} onMouseLeave={()=>setHover(0)}
                  onClick={()=>handleStars(s)}
                  style={{ fontSize:32, background:'none', border:'none', cursor:'pointer',
                           transition:'transform 0.15s',
                           transform: (hover>=s||stars>=s) ? 'scale(1.2)':'scale(1)',
                           opacity: (hover>=s||stars>=s) ? 1 : 0.2,
                           color:'#FBBF24',
                           filter: (hover>=s||stars>=s) ? 'drop-shadow(0 0 8px #FBBF2466)':'none' }}>★</button>
              ))}
            </div>
            <div style={{ fontSize:10, color:C.creamDim }}>Toca las estrellas para valorar</div>
          </div>
          <div style={{ fontFamily:'cursive', fontSize:13, color:C.creamDim }}>¡Hasta la próxima! 🍷</div>
        </div>
      )}

      {/* ── GOOGLE: 4-5★ ── */}
      {screen === 'google' && (
        <div className="ani" style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center',
                                       justifyContent:'center', padding:'28px 22px', gap:20, textAlign:'center' }}>
          <div style={{ display:'flex', gap:4 }}>
            {[1,2,3,4,5].map(s=><span key={s} style={{ fontSize:26, color:'#FBBF24', opacity:s<=stars?1:0.15,
              filter:s<=stars?'drop-shadow(0 0 6px #FBBF2466)':'none' }}>★</span>)}
          </div>
          <div>
            <div style={{ fontFamily:'Georgia, serif', fontSize:22, fontStyle:'italic', marginBottom:6 }}>¡Nos alegra mucho!</div>
            <div style={{ fontSize:12, color:C.creamDim, lineHeight:1.7 }}>
              ¿Nos dejas una reseña en Google?<br/>
              Ayuda a que más gente nos encuentre<br/>y solo tarda 30 segundos.
            </div>
          </div>
          {/* Botón Google */}
          <button onClick={handleGoogle} style={{ display:'flex', alignItems:'center', justifyContent:'center',
                                                   gap:10, width:'100%', padding:'16px',
                                                   background:'white', border:'none', borderRadius:14,
                                                   cursor:'pointer', boxShadow:'0 2px 16px rgba(0,0,0,0.4)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span style={{ fontSize:14, fontWeight:700, color:'#1A1714' }}>Valorar en Google</span>
          </button>
          <div style={{ fontSize:10, color:C.creamDim, opacity:0.6 }}>Se abrirá Google Maps</div>
        </div>
      )}

      {/* ── FEEDBACK PRIVADO: 1-3★ ── */}
      {screen === 'feedback' && (
        <div className="ani" style={{ flex:1, display:'flex', flexDirection:'column', padding:'24px 20px', gap:16 }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ display:'flex', justifyContent:'center', gap:3, marginBottom:10 }}>
              {[1,2,3,4,5].map(s=><span key={s} style={{ fontSize:22, color:'#FBBF24', opacity:s<=stars?1:0.15 }}>★</span>)}
            </div>
            <div style={{ fontFamily:'Georgia, serif', fontSize:18, fontStyle:'italic', marginBottom:4 }}>Gracias por contárnoslo</div>
            <div style={{ fontSize:11, color:C.creamDim, lineHeight:1.6 }}>¿Qué podemos mejorar? El responsable<br/>lo recibirá directamente.</div>
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>
            {['Tiempo de espera','Temperatura','Atención','Limpieza','Ruido','Carta','Precio'].map(opt=>(
              <button key={opt} onClick={()=>setChips(c=>c.includes(opt)?c.filter(x=>x!==opt):[...c,opt])}
                style={{ padding:'6px 12px', background: chips.includes(opt)?C.amber+33:C.bg2,
                         border:`1px solid ${chips.includes(opt)?C.amber:C.rule}`,
                         borderRadius:20, color:chips.includes(opt)?C.amber:C.creamDim, fontSize:11, cursor:'pointer' }}>
                {opt}</button>
            ))}
          </div>
          <textarea value={feedback} onChange={e=>setFeedback(e.target.value)}
            placeholder="Cuéntanos más (opcional)..."
            rows={3}
            style={{ background:C.bg2, border:`1px solid ${C.rule}`, borderRadius:10,
                     color:C.cream, fontSize:12, padding:'10px 12px', resize:'none', fontFamily:'inherit' }}/>
          <button onClick={handleFeedback}
            style={{ width:'100%', padding:'13px', background:C.bg3, border:`1px solid ${C.rule}`,
                     borderRadius:12, color:C.cream, fontSize:13, fontWeight:600, cursor:'pointer' }}>
            Enviar al restaurante →
          </button>
        </div>
      )}

      {/* ── WHATSAPP: compartir con amigos ── */}
      {screen === 'whatsapp' && (
        <div className="ani" style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center',
                                       justifyContent:'center', padding:'28px 22px', gap:20, textAlign:'center' }}>
          <div style={{ fontSize:48 }}>📲</div>
          <div>
            <div style={{ fontFamily:'Georgia, serif', fontSize:20, fontStyle:'italic', marginBottom:6 }}>¿Se lo cuentas a alguien?</div>
            <div style={{ fontSize:12, color:C.creamDim, lineHeight:1.7 }}>
              Comparte {nombreRest} con<br/>amigos o familia por WhatsApp.
            </div>
          </div>
          <button onClick={handleWhatsapp}
            style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10,
                     width:'100%', padding:'15px', background:'#25D366', border:'none',
                     borderRadius:14, cursor:'pointer' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            <span style={{ fontSize:14, fontWeight:700, color:'white' }}>Compartir por WhatsApp</span>
          </button>
          <button onClick={handleSkipWhatsapp}
            style={{ background:'none', border:'none', color:C.creamDim, fontSize:11, cursor:'pointer', textDecoration:'underline' }}>
            Ahora no
          </button>
          {rest?.instagram_url && (
            <a href={rest.instagram_url} target="_blank" rel="noopener noreferrer"
               style={{ display:'flex', alignItems:'center', gap:8, textDecoration:'none',
                        padding:'10px 16px', background:C.bg2, borderRadius:12, border:`1px solid ${C.rule}` }}>
              <span style={{ fontSize:18 }}>📷</span>
              <span style={{ fontSize:12, color:C.creamMid }}>Síguenos en Instagram</span>
            </a>
          )}
        </div>
      )}

      {/* ── EMAIL: fidelización ── */}
      {screen === 'email' && (
        <div className="ani" style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center',
                                       justifyContent:'center', padding:'28px 22px', gap:18, textAlign:'center' }}>
          <div style={{ fontSize:42 }}>🎁</div>
          <div>
            <div style={{ fontFamily:'Georgia, serif', fontSize:20, fontStyle:'italic', marginBottom:6 }}>¿Quieres ser el primero en saber?</div>
            <div style={{ fontSize:12, color:C.creamDim, lineHeight:1.7 }}>
              Menús especiales, eventos y ofertas<br/>de {nombreRest} directos a tu correo.
            </div>
          </div>
          {!emailSent ? (
            <>
              <input value={email} onChange={e=>setEmail(e.target.value)}
                type="email" placeholder="tu@email.com"
                style={{ width:'100%', padding:'13px 14px', background:C.bg2,
                         border:`1px solid ${C.rule}`, borderRadius:12,
                         color:C.cream, fontSize:13, fontFamily:'inherit' }}/>
              <button onClick={handleEmail}
                style={{ width:'100%', padding:'13px', background:C.vermilion, border:'none',
                         borderRadius:12, color:'white', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                {email.trim() ? 'Suscribirme →' : 'Ahora no, gracias'}
              </button>
            </>
          ) : (
            <div style={{ background:`${C.green}15`, borderRadius:12, padding:'13px 18px',
                          border:`1px solid ${C.green}33`, fontSize:13 }}>
              ✓ ¡Apuntado! Te llegará todo lo bueno.
            </div>
          )}
          {!emailSent && (
            <div style={{ fontSize:9, color:C.creamDim, opacity:0.5 }}>Sin spam. Puedes darte de baja cuando quieras.</div>
          )}
        </div>
      )}

      {/* ── GRACIAS: pantalla final ── */}
      {screen === 'gracias' && (
        <div className="ani" style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center',
                                       justifyContent:'center', padding:'32px 24px', gap:18, textAlign:'center' }}>
          <div style={{ fontSize:52 }}>🍷</div>
          <div>
            <div style={{ fontFamily:'Georgia, serif', fontSize:24, fontStyle:'italic', marginBottom:6 }}>¡Hasta la próxima!</div>
            <div style={{ fontSize:12, color:C.creamDim, lineHeight:1.7 }}>
              Gracias por elegir {nombreRest}.<br/>
              Te esperamos pronto.
            </div>
          </div>
        </div>
      )}

      <FooterBranding />
    </div>
  )
}

export default function QrSuccess() {
  return (
    <Suspense>
      <QrSuccessInner />
    </Suspense>
  )
}
