import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
export const runtime = 'edge'
export const dynamic = 'force-dynamic'

const ORIGIN = 'https://www.iarest.es'
type FontDef = { name: string; data: ArrayBuffer; weight: 400|500|600; style: 'normal'|'italic' }
let _fonts: FontDef[] | null = null
async function getFonts(): Promise<FontDef[]> {
  if (_fonts) return _fonts
  const load = (f: string) => fetch(`${ORIGIN}/fonts/${f}`).then(r => r.arrayBuffer())
  const [news, inter, interSemi] = await Promise.all([
    load('Newsreader-Italic.ttf'), load('InterTight-Regular.ttf'), load('InterTight-SemiBold.ttf'),
  ])
  _fonts = [
    { name: 'News', data: news, weight: 500, style: 'italic' },
    { name: 'Inter', data: inter, weight: 400, style: 'normal' },
    { name: 'Inter', data: interSemi, weight: 600, style: 'normal' },
  ]
  return _fonts
}

const S=1080, RED='#D9442B', DARK='#14110E', D2='#1E1A15', D3='#2A221A', CR='#F6F1E7', INK='#1A1714', I2='#9C8E7E', I3='#6B5F52', RULE='#2E2720'

// barras de onda decorativas (7, central roja)
function Wave({ h, op=1, accent=RED, rest=CR }: { h: number; op?: number; accent?: string; rest?: string }) {
  const hs=[0.4,0.62,0.82,1,0.82,0.62,0.4]
  return (
    <div style={{display:'flex',alignItems:'center',gap:Math.round(h*0.16)}}>
      {hs.map((f,i)=><div key={i} style={{width:Math.round(h*0.14),height:Math.round(h*f),background:i===3?accent:rest,borderRadius:99,opacity:op}}/>)}
    </div>
  )
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const tipo = p.get('tipo') || 'stat'
  const v = parseInt(p.get('v') || '1')
  const fonts = await getFonts()
  const R = (el: React.ReactElement) => new ImageResponse(el, { width:S, height:S, fonts })

  // contenido de ejemplo fijo (para comparar diseños con el mismo texto)
  const dato='30%', unidad='de las comandas tienen errores', sub='Dato del sector'
  const ctx='Un fallo en sala se traduce en platos devueltos, mesas lentas y margen perdido.'
  const preg='¿Cuánto pierdes cada día por comandas mal apuntadas?'

  // ---------- STAT (6 variantes) ----------
  if (tipo==='stat') {
    if (v===1) return R( // bloque oscuro (actual)
      <div style={{width:S,height:S,background:DARK,display:'flex',flexDirection:'column',justifyContent:'space-between',padding:90,fontFamily:'Inter'}}>
        <span style={{fontSize:13,letterSpacing:'0.15em',textTransform:'uppercase',color:RED,background:'rgba(217,68,43,0.12)',padding:'5px 16px',borderRadius:100,alignSelf:'flex-start'}}>{sub}</span>
        <div style={{display:'flex',flexDirection:'column'}}>
          <div style={{fontStyle:'italic',fontSize:300,color:RED,lineHeight:1,fontFamily:'News'}}>{dato}</div>
          <div style={{fontStyle:'italic',fontSize:40,color:I2,fontFamily:'News'}}>{unidad}</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:18,borderTop:`1px solid ${RULE}`,paddingTop:36}}>
          <div style={{fontSize:26,color:CR,lineHeight:1.5}}>{ctx}</div>
          <span style={{fontStyle:'italic',fontSize:22,color:I3,fontFamily:'News'}}>ia<span style={{color:RED}}>.</span>rest</span>
        </div>
      </div>)
    if (v===2) return R( // editorial crema
      <div style={{width:S,height:S,background:CR,display:'flex',flexDirection:'column',justifyContent:'space-between',padding:96,fontFamily:'Inter'}}>
        <span style={{fontSize:14,letterSpacing:'0.18em',textTransform:'uppercase',color:I3}}>{sub}</span>
        <div style={{display:'flex',alignItems:'flex-end',gap:28}}>
          <div style={{fontStyle:'italic',fontSize:280,color:INK,lineHeight:0.9,fontFamily:'News'}}>{dato}</div>
          <div style={{display:'flex',flexDirection:'column',gap:10,paddingBottom:40}}>
            <div style={{width:60,height:4,background:RED}}/>
            <div style={{fontStyle:'italic',fontSize:36,color:INK,fontFamily:'News',maxWidth:340,lineHeight:1.2}}>{unidad}</div>
          </div>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
          <div style={{fontSize:24,color:I3,lineHeight:1.5,maxWidth:680}}>{ctx}</div>
          <span style={{fontStyle:'italic',fontSize:22,color:INK,fontFamily:'News'}}>ia<span style={{color:RED}}>.</span>rest</span>
        </div>
      </div>)
    if (v===3) return R( // rojo total
      <div style={{width:S,height:S,background:RED,display:'flex',flexDirection:'column',justifyContent:'space-between',padding:96,fontFamily:'Inter'}}>
        <span style={{fontSize:14,letterSpacing:'0.18em',textTransform:'uppercase',color:'rgba(246,241,231,0.6)'}}>{sub}</span>
        <div style={{display:'flex',flexDirection:'column'}}>
          <div style={{fontStyle:'italic',fontSize:320,color:CR,lineHeight:0.95,fontFamily:'News'}}>{dato}</div>
          <div style={{fontStyle:'italic',fontSize:42,color:'rgba(246,241,231,0.85)',fontFamily:'News'}}>{unidad}</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:18,borderTop:'1px solid rgba(246,241,231,0.25)',paddingTop:36}}>
          <div style={{fontSize:26,color:'rgba(246,241,231,0.9)',lineHeight:1.5}}>{ctx}</div>
          <span style={{fontStyle:'italic',fontSize:22,color:'rgba(246,241,231,0.7)',fontFamily:'News'}}>ia.rest · www.iarest.es</span>
        </div>
      </div>)
    if (v===4) return R( // split vertical
      <div style={{width:S,height:S,display:'flex',fontFamily:'Inter'}}>
        <div style={{width:S*0.52,height:S,background:DARK,display:'flex',flexDirection:'column',justifyContent:'center',padding:70}}>
          <div style={{fontStyle:'italic',fontSize:260,color:RED,lineHeight:0.9,fontFamily:'News'}}>{dato}</div>
          <div style={{fontStyle:'italic',fontSize:36,color:I2,fontFamily:'News',marginTop:10}}>{unidad}</div>
        </div>
        <div style={{width:S*0.48,height:S,background:D2,display:'flex',flexDirection:'column',justifyContent:'space-between',padding:64}}>
          <span style={{fontSize:13,letterSpacing:'0.15em',textTransform:'uppercase',color:RED}}>{sub}</span>
          <div style={{fontSize:30,color:CR,lineHeight:1.55}}>{ctx}</div>
          <span style={{fontStyle:'italic',fontSize:22,color:I3,fontFamily:'News'}}>ia<span style={{color:RED}}>.</span>rest</span>
        </div>
      </div>)
    if (v===5) return R( // onda de fondo
      <div style={{width:S,height:S,background:DARK,display:'flex',position:'relative',padding:90}}>
        <div style={{position:'absolute',top:0,left:0,width:S,height:S,display:'flex',alignItems:'center',justifyContent:'center',opacity:0.10}}>
          <Wave h={760} op={1}/>
        </div>
        <div style={{position:'absolute',top:90,left:90,width:S-180,height:S-180,display:'flex',flexDirection:'column',justifyContent:'space-between',fontFamily:'Inter'}}>
          <span style={{fontSize:13,letterSpacing:'0.15em',textTransform:'uppercase',color:RED}}>{sub}</span>
          <div style={{display:'flex',flexDirection:'column'}}>
            <div style={{fontStyle:'italic',fontSize:300,color:CR,lineHeight:0.95,fontFamily:'News'}}>{dato}</div>
            <div style={{fontStyle:'italic',fontSize:40,color:RED,fontFamily:'News'}}>{unidad}</div>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
            <div style={{fontSize:26,color:I2,lineHeight:1.5,maxWidth:620}}>{ctx}</div>
            <span style={{fontStyle:'italic',fontSize:22,color:I3,fontFamily:'News'}}>ia.rest</span>
          </div>
        </div>
      </div>)
    return R( // v6 tarjeta producto
      <div style={{width:S,height:S,background:DARK,display:'flex',flexDirection:'column',justifyContent:'center',padding:80,fontFamily:'Inter'}}>
        <span style={{fontSize:13,letterSpacing:'0.15em',textTransform:'uppercase',color:RED,marginBottom:30}}>{sub}</span>
        <div style={{display:'flex',flexDirection:'column',background:D2,border:`1px solid ${RULE}`,borderRadius:28,padding:64,gap:24}}>
          <div style={{height:5,width:90,background:RED,borderRadius:3}}/>
          <div style={{display:'flex',alignItems:'baseline',gap:24}}>
            <div style={{fontStyle:'italic',fontSize:200,color:RED,lineHeight:0.9,fontFamily:'News'}}>{dato}</div>
            <div style={{fontStyle:'italic',fontSize:36,color:I2,fontFamily:'News',maxWidth:360,lineHeight:1.2}}>{unidad}</div>
          </div>
          <div style={{fontSize:26,color:CR,lineHeight:1.5,borderTop:`1px solid ${RULE}`,paddingTop:28}}>{ctx}</div>
        </div>
        <span style={{fontStyle:'italic',fontSize:24,color:I3,fontFamily:'News',marginTop:36}}>ia<span style={{color:RED}}>.</span>rest · www.iarest.es</span>
      </div>)
  }

  // ---------- PREGUNTA (4 variantes) ----------
  if (v===1) return R( // editorial crema (actual)
    <div style={{width:S,height:S,background:CR,display:'flex',flexDirection:'column',justifyContent:'space-between',padding:96,fontFamily:'News'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontStyle:'italic',fontSize:24,color:INK}}>ia<span style={{color:RED}}>.</span>rest</span>
        <span style={{fontSize:15,color:I2,fontFamily:'Inter'}}>Hostelería · 2026</span>
      </div>
      <div style={{fontStyle:'italic',fontSize:76,color:INK,lineHeight:1.15,letterSpacing:'-1px'}}>{preg}</div>
      <div style={{display:'flex',alignItems:'center',gap:16}}>
        <div style={{width:52,height:3,background:RED}}/>
        <span style={{fontSize:18,color:RED,letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:600,fontFamily:'Inter'}}>Léelo en el blog →</span>
      </div>
    </div>)
  if (v===2) return R( // oscuro dramático
    <div style={{width:S,height:S,background:DARK,display:'flex',flexDirection:'column',justifyContent:'center',padding:96,fontFamily:'News'}}>
      <div style={{width:64,height:5,background:RED,borderRadius:3,marginBottom:40}}/>
      <div style={{fontStyle:'italic',fontSize:96,color:CR,lineHeight:1.1,letterSpacing:'-1px'}}>{preg}</div>
      <span style={{fontSize:18,color:I3,letterSpacing:'0.1em',textTransform:'uppercase',fontFamily:'Inter',marginTop:50}}>ia.rest · www.iarest.es</span>
    </div>)
  if (v===3) return R( // rojo con comillas
    <div style={{width:S,height:S,background:RED,display:'flex',flexDirection:'column',justifyContent:'space-between',padding:96,fontFamily:'News'}}>
      <div style={{fontStyle:'italic',fontSize:260,color:'rgba(246,241,231,0.25)',lineHeight:0.6,height:120}}>“</div>
      <div style={{fontStyle:'italic',fontSize:84,color:CR,lineHeight:1.12}}>{preg}</div>
      <span style={{fontStyle:'italic',fontSize:24,color:'rgba(246,241,231,0.8)'}}>ia<span style={{color:CR}}>.</span>rest</span>
    </div>)
  return R( // v4 onda lateral
    <div style={{width:S,height:S,background:DARK,display:'flex',alignItems:'center',padding:90,gap:50,fontFamily:'News'}}>
      <div style={{display:'flex'}}><Wave h={560}/></div>
      <div style={{display:'flex',flexDirection:'column',gap:40,flex:1}}>
        <div style={{fontStyle:'italic',fontSize:72,color:CR,lineHeight:1.15}}>{preg}</div>
        <span style={{fontSize:17,color:I3,letterSpacing:'0.1em',textTransform:'uppercase',fontFamily:'Inter'}}>ia.rest · www.iarest.es</span>
      </div>
    </div>)
}
