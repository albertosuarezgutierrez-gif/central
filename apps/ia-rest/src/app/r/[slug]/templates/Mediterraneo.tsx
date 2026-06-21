import type { TemplateData } from './types'

export default function TemplateMediterraneo({ d }: { d: TemplateData }) {
  const a = d.color_acento
  return (
    <html lang={d.idioma}>
      <head>
        <meta charSet="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=Nunito:wght@300;400;600;700&display=swap" rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: `
          *{box-sizing:border-box;margin:0;padding:0}
          body{background:#FDF6EC;color:#2D1B0E;font-family:'Nunito',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
          a{text-decoration:none;color:inherit}
          .hero{background:linear-gradient(160deg,${a}dd 0%,${a} 100%);padding:0;position:relative;overflow:hidden}
          .hero::after{content:'';position:absolute;bottom:-1px;left:0;right:0;height:48px;background:#FDF6EC;clip-path:ellipse(55% 100% at 50% 100%)}
          .hero-inner{padding:44px 28px 60px;text-align:center;position:relative}
          .hero-icon{width:72px;height:72px;background:rgba(255,255,255,.18);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:30px;backdrop-filter:blur(4px)}
          .hero-logo{height:60px;object-fit:contain;filter:brightness(0) invert(1);margin-bottom:10px}
          .hero-title{font-family:'Lora',serif;font-size:40px;font-weight:600;color:#fff;line-height:1.1}
          .hero-loc{font-size:12px;font-weight:300;color:rgba(255,255,255,.75);letter-spacing:3px;text-transform:uppercase;margin-top:8px}
          .frase{font-family:'Lora',serif;font-style:italic;font-size:18px;color:${a};text-align:center;padding:36px 28px 0;line-height:1.65}
          .desc{font-size:14px;font-weight:300;color:#7a5c3a;text-align:center;padding:10px 28px 0;line-height:1.85}
          .tags{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;padding:18px 28px 0}
          .tag{background:#FDEFD8;border:1px solid #F0C89A;border-radius:20px;padding:5px 14px;font-size:12px;color:#8a5c2a;font-weight:600}
          .sec{padding:36px 28px 0}
          .sec-title{font-family:'Lora',serif;font-size:24px;color:#2D1B0E;margin-bottom:18px;display:flex;align-items:center;gap:12px}
          .sec-title::after{content:'';flex:1;height:1px;background:linear-gradient(to right,${a}66,transparent)}
          .cat{font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:${a};margin:18px 0 10px}
          .item{display:flex;justify-content:space-between;align-items:baseline;padding:9px 0;border-bottom:1px solid #F0E4D0}
          .item-name{font-size:15px;font-weight:400}
          .item-desc{font-size:12px;color:#b8987a;margin-top:2px}
          .price{font-weight:700;color:${a};margin-left:16px;white-space:nowrap;font-size:15px}
          .reserva{background:linear-gradient(135deg,${a}cc,${a});border-radius:20px;padding:32px;text-align:center;margin:32px 28px 0}
          .res-t{font-family:'Lora',serif;font-size:24px;color:#fff;margin-bottom:6px}
          .res-s{font-size:12px;color:rgba(255,255,255,.7);margin-bottom:20px;font-weight:300}
          .btn{background:#fff;border:none;padding:12px 24px;border-radius:30px;font-family:'Nunito';font-size:13px;font-weight:700;cursor:pointer;display:inline-block;margin:4px}
          .btn-outline{background:transparent;border:2px solid rgba(255,255,255,.6);color:#fff;border-radius:30px}
          .h-item{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #F0E4D0;font-size:14px;font-weight:300}
          .h-dia{color:#9a7a5a;text-transform:capitalize}
          .maps-btn{display:inline-flex;align-items:center;gap:8px;background:${a};color:#fff;padding:12px 22px;border-radius:30px;font-size:13px;font-weight:600;margin-top:14px}
          .redes{display:flex;gap:16px;justify-content:center;flex-wrap:wrap}
          .red{font-size:13px;color:#b8987a;font-weight:600}
          footer{padding:24px 28px;text-align:center;font-size:12px;color:#b8987a;border-top:1px solid #F0E4D0;margin-top:36px}
          footer a{color:${a};font-weight:600}
          @media(max-width:480px){.hero-title{font-size:32px}.reserva{margin:28px 16px 0}}
        ` }} />
      </head>
      <body>
        <div className="hero">
          <div className="hero-inner">
            {d.logo_url
              ? <img src={d.logo_url} alt={d.nombre} className="hero-logo" />
              : <><div className="hero-icon">🫒</div><div className="hero-title">{d.nombre}</div></>
            }
            <div className="hero-loc">📍 Sevilla, España</div>
          </div>
        </div>

        {d.frase_bienvenida && <div className="frase">"{d.frase_bienvenida}"</div>}
        {d.descripcion_local && <div className="desc">{d.descripcion_local}</div>}
        {d.descripcion_barrio && <div className="desc" style={{fontSize:13,color:'#b8987a',marginTop:4}}>{d.descripcion_barrio}</div>}

        <div className="tags">
          {['Producto local','Cocina andaluza','Reserva directa'].map(t => <span key={t} className="tag">{t}</span>)}
        </div>

        {d.mostrar_carta && d.carta.length > 0 && (
          <div className="sec">
            <div className="sec-title">{d.t.carta}</div>
            {d.carta.map(c => (<div key={c.cat}>
              <div className="cat">{c.cat}</div>
              {c.items.map(i => (
                <div key={i.nombre} className="item">
                  <div><div className="item-name">{i.nombre}</div>{i.descripcion && <div className="item-desc">{i.descripcion}</div>}</div>
                  {i.precio != null && <span className="price">{Number(i.precio).toFixed(2)} €</span>}
                </div>
              ))}
            </div>))}
          </div>
        )}

        {d.mostrar_reservas && (d.telefono_reservas || d.url_reserva_directa || d.whatsapp) && (
          <div className="reserva">
            <div className="res-t">{d.t.reservar}</div>
            <div className="res-s">{d.t.reserva_directa}</div>
            {d.telefono_reservas && <a href={`tel:${d.telefono_reservas}`} className="btn" style={{color:a}}>{d.t.llamar}</a>}
            {d.whatsapp && <a href={`https://wa.me/${d.whatsapp.replace(/\D/g,'')}`} className="btn btn-outline">{d.t.whatsapp}</a>}
            {d.url_reserva_directa && <a href={d.url_reserva_directa} className="btn" style={{color:a}}>{d.t.online}</a>}
          </div>
        )}

        {d.horarios.length > 0 && (
          <div className="sec">
            <div className="sec-title">{d.t.horarios}</div>
            {d.horarios.map(h => <div key={h.dia} className="h-item"><span className="h-dia">{h.dia}</span><span style={{fontWeight:600}}>{h.hora}</span></div>)}
          </div>
        )}

        {d.url_google_maps && (
          <div className="sec" style={{textAlign:'center'}}>
            <a href={d.url_google_maps} target="_blank" rel="noopener noreferrer" className="maps-btn">🗺 {d.t.maps}</a>
          </div>
        )}

        {Object.values(d.redes_sociales).some(Boolean) && (
          <div className="sec"><div className="redes">
            {d.redes_sociales.instagram && <a href={`https://instagram.com/${d.redes_sociales.instagram.replace('@','')}`} target="_blank" rel="noopener" className="red">Instagram</a>}
            {d.redes_sociales.facebook && <a href={d.redes_sociales.facebook} target="_blank" rel="noopener" className="red">Facebook</a>}
            {d.redes_sociales.tiktok && <a href={`https://tiktok.com/@${d.redes_sociales.tiktok.replace('@','')}`} target="_blank" rel="noopener" className="red">TikTok</a>}
            {d.redes_sociales.tripadvisor && <a href={d.redes_sociales.tripadvisor} target="_blank" rel="noopener" className="red">TripAdvisor</a>}
          </div></div>
        )}

        <footer>{d.t.footer} <a href="https://www.iarest.es" target="_blank" rel="noopener">ia.rest</a></footer>
      </body>
    </html>
  )
}
