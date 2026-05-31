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
    load('Newsreader-Italic.ttf'),
    load('InterTight-Regular.ttf'),
    load('InterTight-SemiBold.ttf'),
  ])
  _fonts = [
    { name: 'News',  data: news,      weight: 500, style: 'italic' },
    { name: 'Inter', data: inter,     weight: 400, style: 'normal' },
    { name: 'Inter', data: interSemi, weight: 600, style: 'normal' },
  ]
  return _fonts
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const tipo = p.get('tipo') || 'pregunta'
  const titulo = p.get('titulo') || 'ia.rest'
  const sub = p.get('sub') || ''
  const dato = p.get('dato') || '3min'
  const unidad = p.get('unidad') || 'por error de comanda'
  const ctx = p.get('ctx') || 'Un restaurante pierde hasta 45 min al día por errores evitables.'
  const itemsRaw = p.get('items') || ''
  const num = parseInt(p.get('num') || '1')
  const total = parseInt(p.get('total') || '5')
  const punto = p.get('punto') || ''

  const fonts = await getFonts()
  const S=1080,RED='#D9442B',DARK='#14110E',D2='#1E1A15',D3='#2A221A',CR='#F6F1E7',INK='#1A1714',I2='#9C8E7E',I3='#6B5F52'
  const R = (el: React.ReactElement) => new ImageResponse(el, { width:S, height:S, fonts })

  if (tipo === 'pregunta') return R(
    <div style={{width:S,height:S,background:CR,display:'flex',flexDirection:'column',justifyContent:'space-between',padding:90,fontFamily:'News'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontStyle:'italic',fontSize:22,color:INK}}>ia<span style={{color:RED}}>.</span>rest</span>
        <span style={{fontSize:14,color:I2,fontFamily:'Inter'}}>{sub||'Hostelería · 2026'}</span>
      </div>
      <div style={{fontStyle:'italic',fontSize:titulo.length>55?58:70,color:INK,lineHeight:1.15,letterSpacing:'-1px'}}>{titulo}</div>
      <div style={{display:'flex',alignItems:'center',gap:14}}>
        <div style={{width:48,height:3,background:RED}}/>
        <span style={{fontSize:18,color:RED,letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:600,fontFamily:'Inter'}}>Léelo en el blog →</span>
      </div>
    </div>)

  if (tipo === 'stat') return R(
    <div style={{width:S,height:S,background:DARK,display:'flex',flexDirection:'column',justifyContent:'space-between',padding:90,fontFamily:'Inter'}}>
      <span style={{fontSize:12,letterSpacing:'0.15em',textTransform:'uppercase',color:RED,background:'rgba(217,68,43,0.12)',padding:'4px 14px',borderRadius:100,alignSelf:'flex-start'}}>{sub||'Dato del sector'}</span>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        <div style={{fontStyle:'italic',fontSize:160,color:RED,lineHeight:1,fontFamily:'News'}}>{dato}</div>
        <div style={{fontStyle:'italic',fontSize:34,color:I2,fontFamily:'News'}}>{unidad}</div>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:16,borderTop:'1px solid #2E2720',paddingTop:32}}>
        <div style={{fontSize:22,color:CR,lineHeight:1.5}}>{ctx}</div>
        <div style={{display:'flex',justifyContent:'space-between'}}>
          <span style={{fontStyle:'italic',fontSize:20,color:I3,fontFamily:'News'}}>ia<span style={{color:RED}}>.</span>rest</span>
          <span style={{fontSize:16,color:I3}}>www.iarest.es</span>
        </div>
      </div>
    </div>)

  if (tipo === 'tip') {
    const tips = itemsRaw ? itemsRaw.split('|').slice(0,3) : ['Digitaliza las comandas de sala','Instala KDS en cocina','Usa voz en barra y terraza']
    const [t0,t1,t2]=tips
    return R(
      <div style={{width:S,height:S,background:RED,display:'flex',flexDirection:'column',padding:90,justifyContent:'space-between',fontFamily:'News'}}>
        <span style={{fontSize:12,letterSpacing:'0.15em',textTransform:'uppercase',color:'rgba(246,241,231,0.5)',fontFamily:'Inter'}}>{sub||'3 claves · Hostelería'}</span>
        <div style={{fontStyle:'italic',fontSize:titulo.length>50?50:60,color:CR,lineHeight:1.15}}>{titulo}</div>
        <div style={{display:'flex',flexDirection:'column'}}>
          <div style={{display:'flex',gap:24,padding:'26px 0',borderBottom:'1px solid rgba(246,241,231,0.18)',alignItems:'flex-start'}}>
            <span style={{fontStyle:'italic',fontSize:52,color:'rgba(246,241,231,0.2)',lineHeight:1,flexShrink:0}}>1</span>
            <span style={{fontSize:24,color:'rgba(246,241,231,0.9)',lineHeight:1.4,fontFamily:'Inter',marginTop:8}}>{t0}</span>
          </div>
          <div style={{display:'flex',gap:24,padding:'26px 0',borderBottom:'1px solid rgba(246,241,231,0.18)',alignItems:'flex-start'}}>
            <span style={{fontStyle:'italic',fontSize:52,color:'rgba(246,241,231,0.2)',lineHeight:1,flexShrink:0}}>2</span>
            <span style={{fontSize:24,color:'rgba(246,241,231,0.9)',lineHeight:1.4,fontFamily:'Inter',marginTop:8}}>{t1}</span>
          </div>
          <div style={{display:'flex',gap:24,padding:'26px 0',alignItems:'flex-start'}}>
            <span style={{fontStyle:'italic',fontSize:52,color:'rgba(246,241,231,0.2)',lineHeight:1,flexShrink:0}}>3</span>
            <span style={{fontSize:24,color:'rgba(246,241,231,0.9)',lineHeight:1.4,fontFamily:'Inter',marginTop:8}}>{t2}</span>
          </div>
        </div>
        <span style={{fontStyle:'italic',fontSize:18,color:'rgba(246,241,231,0.4)'}}>ia<span style={{color:'rgba(246,241,231,0.7)'}}>.</span>rest</span>
      </div>)
  }

  if (tipo === 'comparativa') {
    const all = itemsRaw ? itemsRaw.split('|') : ['Papel y bolígrafo','Errores en cocina','Sin datos reales','99€/mes','Voz a comanda','KDS digital','Analytics turno','59€/mes']
    const [b0,b1,b2,b3,g0,g1,g2,g3]=all
    return R(
      <div style={{width:S,height:S,background:D2,display:'flex',flexDirection:'column',padding:80,gap:40,fontFamily:'Inter'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:13,letterSpacing:'0.14em',textTransform:'uppercase',color:I3}}>{titulo||'Antes vs ahora'}</span>
          <span style={{fontStyle:'italic',fontSize:18,color:I3,fontFamily:'News'}}>ia<span style={{color:RED}}>.</span>rest</span>
        </div>
        <div style={{display:'flex',gap:20,flex:1}}>
          <div style={{flex:1,background:'rgba(156,142,126,0.07)',border:'1px solid #2E2720',borderRadius:10,padding:36,display:'flex',flexDirection:'column',gap:18}}>
            <span style={{fontSize:11,letterSpacing:'0.14em',textTransform:'uppercase',color:I3,marginBottom:4}}>Antes</span>
            {[b0,b1,b2,b3].map((item,i)=><div key={i} style={{display:'flex',gap:12,fontSize:22,color:I3,lineHeight:1.4}}><span style={{opacity:0.5}}>—</span><span>{item}</span></div>)}
          </div>
          <div style={{flex:1,background:'rgba(217,68,43,0.1)',border:'1px solid rgba(217,68,43,0.35)',borderRadius:10,padding:36,display:'flex',flexDirection:'column',gap:18}}>
            <span style={{fontSize:11,letterSpacing:'0.14em',textTransform:'uppercase',color:RED,marginBottom:4}}>ia.rest</span>
            {[g0,g1,g2,g3].map((item,i)=><div key={i} style={{display:'flex',gap:12,fontSize:22,color:CR,lineHeight:1.4}}><span style={{color:RED}}>✓</span><span>{item}</span></div>)}
          </div>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',borderTop:'1px solid #2E2720',paddingTop:24}}>
          <span style={{fontStyle:'italic',fontSize:18,color:I3,fontFamily:'News'}}>ia<span style={{color:RED}}>.</span>rest</span>
          <span style={{fontSize:16,color:I3}}>www.iarest.es</span>
        </div>
      </div>)
  }

  if (tipo === 'cita') {
    const partes=sub.split('·'),nom=partes[0]?.trim()||'Hostelero',loc=partes[1]?.trim()||'Sector hostelería',fs=titulo.length>90?40:50
    return R(
      <div style={{width:S,height:S,background:CR,display:'flex',flexDirection:'column',justifyContent:'space-between',padding:90,fontFamily:'News'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontFamily:'Inter'}}>
          <span style={{fontSize:12,letterSpacing:'0.14em',textTransform:'uppercase',color:I3}}>ia.rest · Blog</span>
          <span style={{fontSize:12,letterSpacing:'0.1em',textTransform:'uppercase',color:RED}}>Testimonio</span>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:20}}>
          <div style={{width:60,height:5,background:RED,borderRadius:3}}/>
          <div style={{fontStyle:'italic',fontSize:fs,color:INK,lineHeight:1.35}}>{titulo}</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:4}}>
          <div style={{fontSize:20,fontWeight:600,color:INK,fontFamily:'Inter'}}>{nom}</div>
          <div style={{fontSize:16,color:I2,fontFamily:'Inter'}}>{loc}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <div style={{width:48,height:3,background:RED}}/>
          <span style={{fontStyle:'italic',fontSize:16,color:I3}}>ia.rest · www.iarest.es</span>
        </div>
      </div>)
  }

  if (tipo === 'slide') {
    const esPortada=num===1,esCierre=num===total
    if (esPortada) return R(
      <div style={{width:S,height:S,background:DARK,display:'flex',flexDirection:'column',justifyContent:'space-between',padding:90,fontFamily:'News'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontFamily:'Inter'}}>
          <span style={{fontSize:12,letterSpacing:'0.14em',textTransform:'uppercase',color:RED}}>Blog · ia.rest</span>
          <span style={{fontSize:12,letterSpacing:'0.1em',color:I3}}>1 / {total}</span>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:24}}>
          <div style={{width:50,height:4,background:RED,borderRadius:2}}/>
          <div style={{fontStyle:'italic',fontSize:titulo.length>55?52:64,color:CR,lineHeight:1.15}}>{titulo}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12,fontFamily:'Inter'}}>
          <div style={{fontSize:13,color:I3}}>Desliza para ver →</div>
          <div style={{flex:1,height:1,background:'#2E2720'}}/>
          <div style={{fontSize:13,color:I3}}>www.iarest.es</div>
        </div>
      </div>)

    if (esCierre) return R(
      <div style={{width:S,height:S,background:RED,display:'flex',flexDirection:'column',justifyContent:'space-between',padding:90,fontFamily:'News'}}>
        <span style={{fontSize:12,letterSpacing:'0.14em',textTransform:'uppercase',color:'rgba(246,241,231,0.5)',fontFamily:'Inter'}}>{num} / {total}</span>
        <div style={{display:'flex',flexDirection:'column',gap:20}}>
          <div style={{fontStyle:'italic',fontSize:56,color:CR,lineHeight:1.15}}>¿Lo probamos en tu restaurante?</div>
          <div style={{fontSize:22,color:'rgba(246,241,231,0.7)',fontFamily:'Inter'}}>14 días gratis · Sin contrato · Sin comisión</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:12,fontFamily:'Inter'}}>
          <div style={{fontSize:18,color:'rgba(246,241,231,0.6)',letterSpacing:'0.05em'}}>www.iarest.es</div>
          <div style={{fontSize:13,color:'rgba(246,241,231,0.4)',letterSpacing:'0.1em',textTransform:'uppercase'}}>TPV por voz para hostelería · 59€/mes</div>
        </div>
      </div>)

    const numStr=String(num)
    const bg=num%2===0?CR:DARK,textColor=num%2===0?INK:CR,numColor=num%2===0?'rgba(217,68,43,0.1)':'rgba(217,68,43,0.15)'
    return R(
      <div style={{width:S,height:S,background:bg,display:'flex',flexDirection:'column',justifyContent:'space-between',padding:90,fontFamily:'News'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontFamily:'Inter'}}>
          <span style={{fontSize:12,letterSpacing:'0.14em',textTransform:'uppercase',color:I3}}>ia.rest · Blog</span>
          <span style={{fontSize:12,color:I3}}>{num} / {total}</span>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <div style={{fontStyle:'italic',fontSize:160,color:numColor,lineHeight:0.85}}>{numStr}</div>
          <div style={{fontStyle:'italic',fontSize:punto.length>80?44:54,color:textColor,lineHeight:1.3}}>{punto}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:40,height:3,background:RED}}/>
          <span style={{fontStyle:'italic',fontSize:16,color:I3}}>ia.rest</span>
        </div>
      </div>)
  }

  // PRODUCTO (default)
  return R(
    <div style={{width:S,height:S,background:DARK,display:'flex',flexDirection:'column',padding:80,justifyContent:'space-between',fontFamily:'Inter'}}>
      <span style={{fontSize:12,letterSpacing:'0.15em',textTransform:'uppercase',color:RED}}>En acción · ia.rest</span>
      <div style={{background:D2,border:'1px solid #2E2720',borderRadius:14,padding:48,flex:1,margin:'36px 0',display:'flex',flexDirection:'column',gap:16}}>
        <div style={{height:4,background:RED,borderRadius:2,marginBottom:8}}/>
        <div style={{display:'flex',alignItems:'center',gap:16,padding:'16px 20px',background:D3,borderRadius:8}}>
          <div style={{width:12,height:12,borderRadius:6,background:RED}}/>
          <span style={{fontSize:22,color:CR,flex:1}}>Mesa 4 · 2 personas</span>
          <span style={{fontSize:13,background:'rgba(217,68,43,0.2)',color:RED,padding:'5px 12px',borderRadius:6}}>nueva</span>
        </div>
        <div style={{display:'flex',alignItems:'flex-end',gap:5,padding:'12px 20px'}}>
          {[12,20,32,46,32,20,12].map((h,i)=><div key={i} style={{width:8,height:h,background:RED,borderRadius:4,opacity:0.3+i*0.1}}/>)}
          <span style={{fontSize:18,color:I2,marginLeft:14}}>dictando comanda...</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:16,padding:'16px 20px',background:D3,borderRadius:8}}>
          <div style={{width:12,height:12,borderRadius:6,background:'#3F3530'}}/>
          <span style={{fontSize:22,color:CR}}>2× Croquetas · 1× Cerveza</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:16,padding:'16px 20px',background:D3,borderRadius:8}}>
          <div style={{width:12,height:12,borderRadius:6,background:'#3F3530'}}/>
          <span style={{fontSize:22,color:I2}}>→ KDS cocina ✓</span>
        </div>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        <div style={{fontSize:26,color:CR,lineHeight:1.4}}>{titulo||'Comanda por voz. En cocina en 2 segundos.'}</div>
        <div style={{fontSize:17,color:I3}}>www.iarest.es</div>
      </div>
    </div>)
}
