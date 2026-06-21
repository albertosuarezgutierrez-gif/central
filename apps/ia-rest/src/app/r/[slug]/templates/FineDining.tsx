import type { TemplateData } from './types'

export default function TemplateFineDining({ d }: { d: TemplateData }) {
  const a = d.color_acento
  return (
    <html lang={d.idioma}>
      <head>
        <meta charSet="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Tenor+Sans&family=Didact+Gothic&family=EB+Garamond:ital,wght@0,400;1,400&display=swap" rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: `
          *{box-sizing:border-box;margin:0;padding:0}
          body{background:#080808;color:#E8E0D0;font-family:'Didact Gothic',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
          a{text-decoration:none;color:inherit}
          .gold-line{height:1px;background:linear-gradient(to right,transparent,${a}66,${a},${a}66,transparent)}
          .top{padding:22px 32px;display:flex;justify-content:space-between;align-items:center}
          .top-name{font-family:'Tenor Sans',serif;font-size:15px;letter-spacing:5px;text-transform:uppercase;color:#C0B090}
          .top-tag{font-size:9px;letter-spacing:4px;text-transform:uppercase;color:#333}
          .hero{padding:52px 32px 44px;text-align:center}
          .pre{font-size:9px;letter-spacing:6px;text-transform:uppercase;color:${a};margin-bottom:22px}
          .hero-logo{height:72px;object-fit:contain;filter:brightness(0) invert(1) sepia(.3);margin-bottom:14px}
          .title{font-family:'Tenor Sans',serif;font-size:56px;font-weight:400;color:#E8E0D0;letter-spacing:8px;text-transform:uppercase;line-height:1}
          .year{font-size:9px;letter-spacing:5px;color:${a};margin-top:14px;text-transform:uppercase}
          .frase{font-family:'EB Garamond',serif;font-size:17px;font-style:italic;color:#9A8A6A;text-align:center;padding:32px 32px 0;line-height:1.85;letter-spacing:.5px}
          .desc{font-size:13px;color:#555;text-align:center;padding:10px 32px 0;line-height:1.85;letter-spacing:.3px}
          .sec{padding:36px 32px 0}
          .sec-label{font-size:8px;letter-spacing:6px;text-transform:uppercase;color:${a};margin-bottom:20px}
          .cat{font-family:'Tenor Sans';font-size:12px;letter-spacing:3px;text-transform:uppercase;color:${a};margin:22px 0 12px}
          .item{display:flex;justify-content:space-between;align-items:baseline;padding:11px 0;border-bottom:1px solid #111}
          .item-name{font-family:'Tenor Sans';font-size:14px;color:#D0C8B8;letter-spacing:1px}
          .item-desc{font-size:11px;color:#444;margin-top:3px;letter-spacing:.3px}
          .dots{flex:1;border-bottom:1px dotted #1e1e1e;margin:0 14px;position:relative;top:-4px}
          .price{font-size:13px;color:${a};letter-spacing:1px;white-space:nowrap}
          .reserva{margin:36px 32px 0;border:1px solid #1a1512;padding:32px;text-align:center;position:relative}
          .reserva::before{content:'◆';position:absolute;top:-9px;left:50%;transform:translateX(-50%);background:#080808;padding:0 10px;color:${a};font-size:11px}
          .res-t{font-family:'Tenor Sans';font-size:24px;letter-spacing:3px;margin-bottom:6px}
          .res-s{font-size:9px;letter-spacing:3px;color:#333;text-transform:uppercase;margin-bottom:22px}
          .btn{background:transparent;border:1px solid ${a}55;color:${a};padding:12px 28px;font-size:9px;letter-spacing:4px;text-transform:uppercase;cursor:pointer;display:inline-block;margin:4px;font-family:'Didact Gothic'}
          .btn-main{background:${a}22;border-color:${a}}
          .h-item{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #0e0e0e;font-size:12px;color:#444;letter-spacing:.5px}
          .h-val{color:#9A8A6A}
          .redes{display:flex;gap:20px;justify-content:center;flex-wrap:wrap}
          .red{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#333}
          .red:hover{color:${a}}
          footer{padding:24px 32px;text-align:center;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#1a1512;margin-top:36px;border-top:1px solid #0d0d0d}
          footer a{color:${a}66}
          @media(max-width:480px){.title{font-size:40px;letter-spacing:4px}.top{padding:16px 20px}.sec{padding:28px 20px 0}.reserva{margin:28px 20px 0}}
        ` }} />
      </head>
      <body>
        <div className="gold-line"/>
        <div className="top">
          <div className="top-name">{d.nombre}</div>
          <div className="top-tag">Sevilla · {new Date().getFullYear()}</div>
        </div>
        <div className="gold-line"/>

        <div className="hero">
          <div className="pre">Restaurante</div>
          {d.logo_url
            ? <img src={d.logo_url} alt={d.nombre} className="hero-logo" />
            : <div className="title">{d.nombre}</div>
          }
          <div className="year">Sevilla · España · MMXXVI</div>
        </div>

        <div className="gold-line"/>
        {d.frase_bienvenida && <div className="frase">"{d.frase_bienvenida}"</div>}
        {d.descripcion_local && <div className="desc">{d.descripcion_local}</div>}

        {d.mostrar_carta && d.carta.length > 0 && (
          <div className="sec">
            <div className="sec-label">— {d.t.carta} —</div>
            {d.carta.map(c => (<div key={c.cat}>
              <div className="cat">{c.cat}</div>
              {c.items.map(i => (
                <div key={i.nombre} className="item">
                  <div><div className="item-name">{i.nombre}</div>{i.descripcion && <div className="item-desc">{i.descripcion}</div>}</div>
                  <span className="dots"/>
                  {i.precio != null && <span className="price">{Number(i.precio).toFixed(2)}</span>}
                </div>
              ))}
            </div>))}
          </div>
        )}

        {d.mostrar_reservas && (d.telefono_reservas || d.url_reserva_directa || d.whatsapp) && (
          <div className="reserva">
            <div className="res-t">{d.t.reservar}</div>
            <div className="res-s">{d.t.reserva_directa}</div>
            {d.telefono_reservas && <a href={`tel:${d.telefono_reservas}`} className="btn">{d.t.llamar}</a>}
            {d.whatsapp && <a href={`https://wa.me/${d.whatsapp.replace(/\D/g,'')}`} className="btn">{d.t.whatsapp}</a>}
            {d.url_reserva_directa && <a href={d.url_reserva_directa} className="btn btn-main">{d.t.online}</a>}
          </div>
        )}

        {d.horarios.length > 0 && (
          <div className="sec">
            <div className="sec-label">— {d.t.horarios} —</div>
            {d.horarios.map(h => <div key={h.dia} className="h-item"><span style={{textTransform:'capitalize'}}>{h.dia}</span><span className="h-val">{h.hora}</span></div>)}
          </div>
        )}

        {d.url_google_maps && (
          <div className="sec" style={{textAlign:'center'}}>
            <a href={d.url_google_maps} target="_blank" rel="noopener noreferrer" className="btn">{d.t.maps}</a>
          </div>
        )}

        {d.descripcion_barrio && <div className="desc" style={{padding:'16px 32px 0',fontSize:12,color:'#333'}}>{d.descripcion_barrio}</div>}

        {Object.values(d.redes_sociales).some(Boolean) && (
          <div className="sec"><div className="redes">
            {d.redes_sociales.instagram && <a href={`https://instagram.com/${d.redes_sociales.instagram.replace('@','')}`} target="_blank" rel="noopener" className="red">Instagram</a>}
            {d.redes_sociales.facebook && <a href={d.redes_sociales.facebook} target="_blank" rel="noopener" className="red">Facebook</a>}
            {d.redes_sociales.tiktok && <a href={`https://tiktok.com/@${d.redes_sociales.tiktok.replace('@','')}`} target="_blank" rel="noopener" className="red">TikTok</a>}
            {d.redes_sociales.tripadvisor && <a href={d.redes_sociales.tripadvisor} target="_blank" rel="noopener" className="red">TripAdvisor</a>}
          </div></div>
        )}

        <div className="gold-line" style={{marginTop:36}}/>
        <footer>{d.t.footer} <a href="https://www.iarest.es" target="_blank" rel="noopener">ia.rest</a></footer>
      </body>
    </html>
  )
}
