import type { TemplateData } from './types'

export default function TemplateTaberna({ d }: { d: TemplateData }) {
  const a = d.color_acento
  return (
    <html lang={d.idioma}>
      <head>
        <meta charSet="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;1,400&family=Josefin+Sans:wght@300;400;600;700&display=swap" rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: `
          *{box-sizing:border-box;margin:0;padding:0}
          body{background:#F9F4EE;color:#2a1a0e;font-family:'Josefin Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
          a{text-decoration:none;color:inherit}
          .hero{background:${a};position:relative;overflow:hidden}
          .hero-pattern{position:absolute;inset:0;opacity:.07;background-image:repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 50%),repeating-linear-gradient(-45deg,#fff 0,#fff 1px,transparent 0,transparent 50%);background-size:14px 14px}
          .hero-inner{position:relative;padding:40px 28px;text-align:center}
          .escudo{font-size:38px;margin-bottom:10px}
          .hero-logo{height:64px;object-fit:contain;filter:brightness(0) invert(1);margin-bottom:10px}
          .hero-title{font-family:'Crimson Text',serif;font-size:46px;font-weight:600;color:#FFF8F0;line-height:1}
          .hero-sub{font-size:10px;letter-spacing:4px;text-transform:uppercase;color:rgba(255,248,240,.55);margin-top:10px}
          .azulejos{display:flex;height:10px}
          .az{flex:1}
          .body{padding:28px}
          .frase{font-family:'Crimson Text',serif;font-size:20px;font-style:italic;color:${a};border-left:3px solid ${a};padding-left:16px;margin-bottom:20px;line-height:1.55}
          .desc{font-size:13px;font-weight:300;line-height:1.85;color:#5a3a2a;margin-bottom:28px}
          .menu-header{background:${a};padding:12px 28px;margin:0 -28px;display:flex;align-items:center;gap:14px}
          .menu-line{flex:1;height:1px;background:rgba(255,248,240,.3)}
          .menu-title{font-family:'Crimson Text',serif;font-size:22px;font-style:italic;color:#FFF8F0;white-space:nowrap}
          .cat{font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${a};margin:20px 0 10px;font-weight:700}
          .item{display:flex;justify-content:space-between;align-items:baseline;padding:9px 0;border-bottom:1px dashed #D8C8B8;font-family:'Crimson Text',serif;font-size:16px}
          .item-desc{font-size:12px;color:#9a7060;font-family:'Josefin Sans';font-weight:300;margin-top:2px}
          .price{font-family:'Josefin Sans';font-size:13px;font-weight:700;color:${a};margin-left:16px;white-space:nowrap}
          .dark-sec{background:#2a1a0e;margin:28px -28px 0;padding:24px 28px}
          .dark-title{font-family:'Crimson Text',serif;font-size:22px;color:#FFF8F0;font-style:italic;margin-bottom:14px}
          .h-item{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #3a2a1e;font-size:12px;font-weight:300;color:#9a7a5a}
          .h-val{color:#FFF8F0;font-weight:400}
          .cta-area{text-align:center;padding:24px 0}
          .btn{background:${a};color:#FFF8F0;border:none;padding:13px 32px;font-family:'Josefin Sans';font-size:11px;letter-spacing:3px;text-transform:uppercase;cursor:pointer;display:inline-block;margin:4px}
          .btn-outline{background:transparent;border:1px solid rgba(255,248,240,.3);color:rgba(255,248,240,.6)}
          .maps-btn{display:inline-block;margin-top:8px;background:transparent;border:1px solid #5a4030;color:#9a7a5a;padding:10px 20px;font-size:10px;letter-spacing:3px;text-transform:uppercase;cursor:pointer}
          .redes{display:flex;gap:20px;justify-content:center;flex-wrap:wrap;padding:16px 0 0}
          .red{font-size:11px;color:#9a7a5a;letter-spacing:2px;text-transform:uppercase}
          footer{background:#2a1a0e;padding:16px 28px;text-align:center;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#3a2a1e}
          footer a{color:${a}}
          @media(max-width:480px){.hero-title{font-size:36px}}
        ` }} />
      </head>
      <body>
        <div className="hero">
          <div className="hero-pattern"/>
          <div className="hero-inner">
            {d.logo_url
              ? <img src={d.logo_url} alt={d.nombre} className="hero-logo" />
              : <><div className="escudo">🏺</div><div className="hero-title">{d.nombre}</div></>
            }
            <div className="hero-sub">Taberna · Sevilla · Est. 1987</div>
          </div>
        </div>
        <div className="azulejos">
          {Array.from({length:12}).map((_,i) => <div key={i} className="az" style={{background:i%2===0?a:'#FFF8F0'}}/>)}
        </div>

        <div className="body">
          {d.frase_bienvenida && <div className="frase">{d.frase_bienvenida}</div>}
          {d.descripcion_local && <div className="desc">{d.descripcion_local}</div>}

          {d.mostrar_carta && d.carta.length > 0 && (
            <><div className="menu-header"><div className="menu-line"/><div className="menu-title">{d.t.carta}</div><div className="menu-line"/></div>
            {d.carta.map(c => (<div key={c.cat}>
              <div className="cat">{c.cat}</div>
              {c.items.map(i => (
                <div key={i.nombre} className="item">
                  <div><div>{i.nombre}</div>{i.descripcion && <div className="item-desc">{i.descripcion}</div>}</div>
                  {i.precio != null && <span className="price">{Number(i.precio).toFixed(2)} €</span>}
                </div>
              ))}
            </div>))}</>
          )}
        </div>

        <div className="dark-sec">
          {d.horarios.length > 0 && (
            <><div className="dark-title">{d.t.horarios}</div>
            {d.horarios.map(h => <div key={h.dia} className="h-item"><span style={{textTransform:'capitalize'}}>{h.dia}</span><span className="h-val">{h.hora}</span></div>)}</>
          )}

          {d.mostrar_reservas && (d.telefono_reservas || d.url_reserva_directa || d.whatsapp) && (
            <div className="cta-area">
              {d.telefono_reservas && <a href={`tel:${d.telefono_reservas}`} className="btn btn-outline">{d.t.llamar}</a>}
              {d.whatsapp && <a href={`https://wa.me/${d.whatsapp.replace(/\D/g,'')}`} className="btn btn-outline">{d.t.whatsapp}</a>}
              {d.url_reserva_directa && <a href={d.url_reserva_directa} className="btn">{d.t.reservar}</a>}
            </div>
          )}

          {d.url_google_maps && <div style={{textAlign:'center'}}><a href={d.url_google_maps} target="_blank" rel="noopener noreferrer" className="maps-btn">{d.t.maps}</a></div>}
          {d.descripcion_barrio && <div style={{fontSize:12,color:'#6a4a2a',marginTop:16,lineHeight:1.7,fontWeight:300}}>{d.descripcion_barrio}</div>}

          {Object.values(d.redes_sociales).some(Boolean) && (
            <div className="redes">
              {d.redes_sociales.instagram && <a href={`https://instagram.com/${d.redes_sociales.instagram.replace('@','')}`} target="_blank" rel="noopener" className="red">Instagram</a>}
              {d.redes_sociales.facebook && <a href={d.redes_sociales.facebook} target="_blank" rel="noopener" className="red">Facebook</a>}
              {d.redes_sociales.tiktok && <a href={`https://tiktok.com/@${d.redes_sociales.tiktok.replace('@','')}`} target="_blank" rel="noopener" className="red">TikTok</a>}
              {d.redes_sociales.tripadvisor && <a href={d.redes_sociales.tripadvisor} target="_blank" rel="noopener" className="red">TripAdvisor</a>}
            </div>
          )}
        </div>

        <footer>{d.t.footer} <a href="https://www.iarest.es" target="_blank" rel="noopener">ia.rest</a></footer>
      </body>
    </html>
  )
}
