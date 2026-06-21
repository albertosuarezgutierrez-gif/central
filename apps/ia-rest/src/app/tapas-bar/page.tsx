import { Metadata } from 'next'
export const metadata: Metadata = {
  title: 'Software gestión bar de tapas | ia.rest',
  description: 'Sistema de gestión para bares de tapas en España. Comandas por voz, almacén, escandallos y analytics. Sin comisiones por venta.',
  keywords: ['software bar tapas España','TPV bar sin comisión','gestión bar tapas','sistema comandas bar','TPV hostelería','ia.rest'],
  openGraph: { title: 'ia.rest · Gestión para bares de tapas y raciones', description: 'Comandas por voz, almacén y analytics. Para el ritmo real de un bar.', url: 'https://www.iarest.es/tapas-bar', siteName: 'ia.rest', locale: 'es_ES', type: 'website' },
  alternates: { canonical: 'https://www.iarest.es/tapas-bar' },
}
const R='#D9442B',D='#14110E',P='#F6F1E7',B2='#1E1A15',B3='#2A221A',I3='#9C8E7E',I4='#6B5F52',RD='#2A2520',RL='#D8CDB6',AM='#E8A33B',GR='#3F7D44',SE="'Newsreader',Georgia,serif",SN="'Inter Tight',system-ui,sans-serif",ML='mailto:hola@iarest.es?subject=Videollamada%20ia.rest%20bar&body=Hola%2C%20tengo%20un%20bar%20de%20tapas%20y%20quiero%20ver%20ia.rest.'
export default function Page() {
  const sala=[['🎙','Comandas por voz','Tan rápido como hablar. Sin tocar pantallas.'],['📺','Barra y cocina coordinadas','Al instante. Sin tickets perdidos.'],['💳','Cobro rápido','Mesa, barra o para llevar.'],['📊','Qué tapa vende más','El ranking de tus tapas en tiempo real.']]
  const cocina=[['🧑‍🍳','Control de salidas','Qué hay pendiente y qué lleva más tiempo.'],['📋','Escandallos','Coste real de cada tapa y ración.'],['🏷','Caducidades','Control de lo que entra y caduca.'],['✅','APPCC automático','Sin registros manuales.']]
  const gestion=[['📦','Almacén','Stock real. Sabes cuándo pedir antes de quedarte sin.'],['📷','Control de albaranes','Foto al albarán del proveedor y listo.'],['🤝','Gestión de proveedores','Pedidos desde el sistema. Sin llamadas.'],['🔮','Previsión de demanda','La IA te avisa de lo que necesitas.'],['📊','Analytics','Horas pico, ticket medio y márgenes.'],['🏢','Multi-local','Si tienes varios bares, un panel para todos.']]
  const pqItems=['🍺 Bares de tapas y raciones','🥘 Tabernas y mesones','🍷 Bares de vinos','🌅 Bares con terraza','📦 Alta rotación de producto','🏢 Cadenas de bares']
  return (
    <main style={{background:P,minHeight:'100vh',color:D,fontFamily:SN}}>
      <nav style={{padding:'20px 28px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:`1px solid ${RL}`}}>
        <span style={{fontFamily:SE,fontSize:22,color:D}}>ia<span style={{color:R}}>.</span>rest</span>
        <a href={ML} style={{background:R,color:'#fff',padding:'9px 22px',borderRadius:8,fontSize:13,fontWeight:700,textDecoration:'none'}}>Solicitar videollamada →</a>
      </nav>
      <section style={{maxWidth:700,margin:'0 auto',padding:'80px 28px 72px',textAlign:'center'}}>
        <div style={{display:'inline-block',background:`${R}15`,border:`1px solid ${R}35`,borderRadius:20,padding:'4px 16px',fontSize:11,color:R,letterSpacing:'.12em',textTransform:'uppercase',fontWeight:700,marginBottom:32}}>Bares · Tapas · Raciones · Tabernas</div>
        <h1 style={{fontFamily:SE,fontSize:50,fontWeight:300,lineHeight:1.1,margin:'0 0 24px',color:D}}>El ritmo de un bar.<br/><span style={{color:R}}>Sin el caos.</span></h1>
        <p style={{fontSize:18,color:I4,lineHeight:1.7,margin:'0 0 44px',maxWidth:520,marginLeft:'auto',marginRight:'auto'}}>Comandas rápidas, control de lo que sale y lo que entra, y analytics para saber qué tapa arrasa. Todo sin complicaciones.</p>
        <a href={ML} style={{display:'inline-block',background:R,color:'#fff',padding:'18px 44px',borderRadius:10,fontSize:16,fontWeight:700,textDecoration:'none'}}>Ver cómo funciona — 15 min</a>
        <p style={{fontSize:12,color:I3,marginTop:14}}>Videollamada gratuita · Sin compromiso</p>
      </section>
      <section style={{background:D,padding:'72px 28px'}}>
        <div style={{maxWidth:780,margin:'0 auto'}}>
          {[{l:'En sala y barra',c:R,items:sala},{l:'En cocina',c:AM,items:cocina},{l:'En gestión',c:GR,items:gestion}].map(({l,c,items})=>(
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
        <h2 style={{fontFamily:SE,fontSize:30,fontWeight:300,color:D,textAlign:'center',marginBottom:32}}>Para bares que van en serio</h2>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:10}}>
          {pqItems.map(item=><div key={item} style={{fontSize:13,color:I4,padding:'13px 16px',background:'#EFEDE8',borderRadius:10,border:`1px solid ${RL}`}}>{item}</div>)}
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
        <p style={{fontSize:15,color:I4,marginBottom:36,lineHeight:1.65}}>15 minutos. Te mostramos el sistema en un bar real. Sin instalación.</p>
        <a href={ML} style={{display:'inline-block',background:R,color:'#fff',padding:'18px 48px',borderRadius:10,fontSize:16,fontWeight:700,textDecoration:'none'}}>Solicitar videollamada gratuita →</a>
        <p style={{fontSize:13,color:I3,marginTop:16}}>O escríbenos a <a href="mailto:hola@iarest.es" style={{color:R,textDecoration:'none',fontWeight:600}}>hola@iarest.es</a></p>
      </section>
      <footer style={{borderTop:`1px solid ${RL}`,padding:'22px',textAlign:'center'}}>
        <span style={{fontSize:12,color:I3}}>ia<span style={{color:R}}>.</span>rest · <a href="https://www.iarest.es" style={{color:I3,textDecoration:'none'}}>www.iarest.es</a></span>
      </footer>
    </main>
  )
}
