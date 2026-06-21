import { Metadata } from 'next'
export const metadata: Metadata = {
  title: 'Software gestión restaurante mediterráneo | ia.rest',
  description: 'Sistema de gestión para restaurantes mediterráneos en España. Comandas por voz, almacén, escandallos, proveedores y eventos. Sin comisiones.',
  keywords: ['software restaurante mediterráneo España','TPV restaurante español','gestión restaurante','sistema hostelería','TPV sin comisiones España','ia.rest'],
  openGraph: { title: 'ia.rest · Gestión completa para restaurantes mediterráneos', description: 'Sala, cocina, almacén, proveedores y eventos. Todo conectado.', url: 'https://www.iarest.es/restaurante-mediterraneo', siteName: 'ia.rest', locale: 'es_ES', type: 'website' },
  alternates: { canonical: 'https://www.iarest.es/restaurante-mediterraneo' },
}
const R='#D9442B',D='#14110E',P='#F6F1E7',B2='#1E1A15',B3='#2A221A',I2='#D8CDB6',I3='#9C8E7E',I4='#6B5F52',RD='#2A2520',RL='#D8CDB6',AM='#E8A33B',GR='#3F7D44',SE="'Newsreader',Georgia,serif",SN="'Inter Tight',system-ui,sans-serif",ML='mailto:hola@iarest.es?subject=Videollamada%20ia.rest&body=Hola%2C%20quiero%20ver%20ia.rest%20para%20mi%20restaurante.'
export default function Page() {
  return <LandingPage badge="Restaurantes mediterráneos · españoles · de autor" h1a="Todo tu restaurante." h1b="Un solo sistema." sub="Sala, cocina, almacén y proveedores. Conectados y automatizados para que tú te concentres en lo que importa." pq="Para cualquier restaurante que quiera crecer sin perder el control" pqItems={['🥘 Carta amplia con elaboraciones propias','🍷 Carta de vinos destacada','📅 Eventos y celebraciones','🏢 Grupos con varios locales','🌿 Opciones veganas y sin gluten','👨‍🍳 Cocina de autor o de mercado']} />
}
function LandingPage({badge,h1a,h1b,sub,pq,pqItems}:{badge:string,h1a:string,h1b:string,sub:string,pq:string,pqItems:string[]}) {
  const sala=[['🎙','Comandas por voz','Desde cualquier dispositivo. Al instante.'],['📺','Cocina en tiempo real','Cada partida ve exactamente lo suyo.'],['💳','Cobro y factura','Automático. Sin papel.'],['📊','Analytics','Qué vende más, cuándo y cuánto margen.']]
  const cocina=[['🧑‍🍳','Asistente IA','El jefe pregunta. La IA responde.'],['📋','Elaboraciones','Fichas técnicas y caducidades controladas.'],['🏷','Etiquetado','Caducidades y trazabilidad automática.'],['✅','Control APPCC','Registros sanitarios sin burocracia.']]
  const gestion=[['📷','Control albaranes','Foto y listo. Sin teclear nada.'],['📦','Almacén y escandallos','Coste por plato. Alertas automáticas.'],['🤝','Proveedores','Pedidos y recepciones desde el sistema.'],['🎉','Eventos','Presupuestos y coordinación sin emails.'],['🔮','Previsión demanda','La IA anticipa lo que necesitas.'],['🏢','Multi-local','Todos los locales desde un panel.']]
  return <Shell badge={badge} h1a={h1a} h1b={h1b} sub={sub} pq={pq} pqItems={pqItems} sala={sala} cocina={cocina} gestion={gestion} />
}
function Shell({badge,h1a,h1b,sub,pq,pqItems,sala,cocina,gestion}:any) {
  return (
    <main style={{background:P,minHeight:'100vh',color:D,fontFamily:SN}}>
      <nav style={{padding:'20px 28px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:`1px solid ${RL}`}}>
        <span style={{fontFamily:SE,fontSize:22,color:D}}>ia<span style={{color:R}}>.</span>rest</span>
        <a href={ML} style={{background:R,color:'#fff',padding:'9px 22px',borderRadius:8,fontSize:13,fontWeight:700,textDecoration:'none'}}>Solicitar videollamada →</a>
      </nav>
      <section style={{maxWidth:700,margin:'0 auto',padding:'80px 28px 72px',textAlign:'center'}}>
        <div style={{display:'inline-block',background:`${R}15`,border:`1px solid ${R}35`,borderRadius:20,padding:'4px 16px',fontSize:11,color:R,letterSpacing:'.12em',textTransform:'uppercase',fontWeight:700,marginBottom:32}}>{badge}</div>
        <h1 style={{fontFamily:SE,fontSize:50,fontWeight:300,lineHeight:1.1,margin:'0 0 24px',color:D}}>{h1a}<br/><span style={{color:R}}>{h1b}</span></h1>
        <p style={{fontSize:18,color:I4,lineHeight:1.7,margin:'0 0 44px',maxWidth:520,marginLeft:'auto',marginRight:'auto'}}>{sub}</p>
        <a href={ML} style={{display:'inline-block',background:R,color:'#fff',padding:'18px 44px',borderRadius:10,fontSize:16,fontWeight:700,textDecoration:'none'}}>Ver cómo funciona — 15 min</a>
        <p style={{fontSize:12,color:I3,marginTop:14}}>Videollamada gratuita · Sin compromiso</p>
      </section>
      <section style={{background:D,padding:'72px 28px'}}>
        <div style={{maxWidth:780,margin:'0 auto'}}>
          {[{l:'En sala',c:R,items:sala},{l:'En cocina',c:AM,items:cocina},{l:'En gestión',c:GR,items:gestion}].map(({l,c,items})=>(
            <div key={l} style={{marginBottom:52}}>
              <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:26}}><div style={{width:3,height:30,background:c,borderRadius:2}}/><h2 style={{fontFamily:SE,fontSize:26,fontWeight:300,color:P,margin:0}}>{l}</h2></div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(185px,1fr))',gap:2}}>
                {items.map(([e,t,d]:string[])=>(
                  <div key={t} style={{background:B2,border:`1px solid ${RD}`,padding:'22px 18px'}}>
                    <div style={{fontSize:22,marginBottom:10}}>{e}</div>
                    <div style={{fontSize:13,fontWeight:700,color:c,marginBottom:6}}>{t}</div>
                    <div style={{fontSize:12,color:I3,lineHeight:1.6}}>{d}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section style={{maxWidth:660,margin:'0 auto',padding:'60px 28px'}}>
        <h2 style={{fontFamily:SE,fontSize:30,fontWeight:300,color:D,textAlign:'center',marginBottom:32}}>{pq}</h2>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:10}}>
          {pqItems.map((item:string)=><div key={item} style={{fontSize:13,color:I4,padding:'13px 16px',background:'#EFEDE8',borderRadius:10,border:`1px solid ${RL}`}}>{item}</div>)}
        </div>
      </section>
      <section style={{background:D,padding:'52px 28px'}}>
        <div style={{maxWidth:500,margin:'0 auto',textAlign:'center'}}>
          <p style={{fontFamily:SE,fontSize:34,fontWeight:300,color:P,margin:'0 0 10px'}}>Sin sorpresas</p>
          <p style={{fontSize:14,color:I3,margin:'0 0 26px',lineHeight:1.65}}>Precio fijo mensual. <strong style={{color:P}}>Sin comisión por venta. Sin permanencia.</strong></p>
          <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap',marginBottom:14}}>
            {[['59€/mes','Plan base'],['+20€','Por usuario (2-6)'],['+15€','Por usuario (7+)']].map(([p,l])=>(
              <div key={l} style={{background:B3,border:`1px solid ${RD}`,borderRadius:10,padding:'12px 20px',textAlign:'center'}}>
                <div style={{fontFamily:SE,fontSize:22,color:R}}>{p}</div>
                <div style={{fontSize:11,color:I3,marginTop:3}}>{l}</div>
              </div>
            ))}
          </div>
          <p style={{fontSize:12,color:I4}}>14 días de prueba gratuita · Sin tarjeta</p>
        </div>
      </section>
      <section style={{maxWidth:500,margin:'0 auto',padding:'70px 28px 80px',textAlign:'center'}}>
        <h2 style={{fontFamily:SE,fontSize:32,fontWeight:300,color:D,marginBottom:14}}>¿Lo vemos juntos?</h2>
        <p style={{fontSize:15,color:I4,marginBottom:36,lineHeight:1.65}}>15 minutos. Te mostramos el sistema en un negocio real. Sin instalación, sin compromiso.</p>
        <a href={ML} style={{display:'inline-block',background:R,color:'#fff',padding:'18px 48px',borderRadius:10,fontSize:16,fontWeight:700,textDecoration:'none'}}>Solicitar videollamada gratuita →</a>
        <p style={{fontSize:13,color:I3,marginTop:16}}>O escríbenos a <a href="mailto:hola@iarest.es" style={{color:R,textDecoration:'none',fontWeight:600}}>hola@iarest.es</a></p>
      </section>
      <footer style={{borderTop:`1px solid ${RL}`,padding:'22px',textAlign:'center'}}>
        <span style={{fontSize:12,color:I3}}>ia<span style={{color:R}}>.</span>rest · <a href="https://www.iarest.es" style={{color:I3,textDecoration:'none'}}>www.iarest.es</a></span>
      </footer>
    </main>
  )
}
