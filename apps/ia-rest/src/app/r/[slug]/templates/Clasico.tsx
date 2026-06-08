import type { TemplateData } from './types'

export default function TemplateClasico({ d }: { d: TemplateData }) {
  const a = d.color_acento
  return (
    <html lang={d.idioma}>
      <head>
        <meta charSet="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Cormorant+Garamond:wght@300;400;600&display=swap" rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: `
          *{box-sizing:border-box;margin:0;padding:0}
          body{background:#FAF7F2;color:#1a1208;font-family:'Cormorant Garamond',Georgia,serif;-webkit-font-smoothing:antialiased}
          a{text-decoration:none;color:inherit}
          .max{max-width:680px;margin:0 auto;padding:0 28px}
          .hero{background:#1a1208;padding:52px 28px 44px;text-align:center;position:relative;overflow:hidden}
          .hero::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,rgba(212,175,55,.18) 0%,transparent 70%)}
          .ornament{color:${a};font-size:18px;letter-spacing:8px;display:block;margin-bottom:18px;position:relative}
          .hero-logo{height:70px;object-fit:contain;margin-bottom:14px;position:relative}
          .hero-title{font-family:'Playfair Display',serif;font-size:44px;font-weight:700;color:#FAF7F2;letter-spacing:3px;line-height:1.05;position:relative}
          .hero-sub{font-size:12px;font-weight:300;color:${a};letter-spacing:5px;text-transform:uppercase;margin-top:10px;position:relative}
          .divider{display:flex;align-items:center;gap:12px;margin:32px 28px}
          .div-line{flex:1;height:1px;background:linear-gradient(to right,transparent,#C8B89A,transparent)}
          .div-diamond{width:6px;height:6px;background:${a};transform:rotate(45deg);flex-shrink:0}
          .frase{font-family:'Playfair Display',serif;font-size:19px;font-style:italic;color:#5a3e1b;text-align:center;padding:0 28px;line-height:1.65}
          .desc{font-size:16px;color:#6b5234;text-align:center;padding:8px 28px 0;line-height:1.85;font-weight:300}
          .sec-label{font-size:10px;font-weight:600;letter-spacing:5px;text-transform:uppercase;color:${a};text-align:center;margin:32px 0 20px}
          .carta{padding:0 28px}
          .cat{font-family:'Playfair Display',serif;font-size:19px;font-weight:700;color:#1a1208;margin:24px 0 10px;border-bottom:1px solid ${a};padding-bottom:6px}
          .item{display:flex;justify-content:space-between;align-items:baseline;padding:9px 0;border-bottom:1px dotted #D8CDB6}
          .item-name{font-size:16px}
          .item-desc{font-size:12px;color:#9a7a5a;margin-top:2px}
          .price{color:${a};font-weight:600;font-size:15px;margin-left:16px;white-space:nowrap}
          .reserva{background:#1a1208;margin:32px 28px;padding:28px;text-align:center;border:1px solid ${a}}
          .res-t{font-family:'Playfair Display',serif;font-size:24px;color:#FAF7F2;margin-bottom:6px}
          .res-s{font-size:11px;letter-spacing:3px;color:rgba(250,247,242,.4);text-transform:uppercase;margin-bottom:20px}
          .btn{background:transparent;border:1px solid ${a};color:${a};padding:12px 28px;font-size:13px;letter-spacing:3px;text-transform:uppercase;cursor:pointer;font-family:'Cormorant Garamond',serif;display:inline-block;margin:4px}
          .btn-solid{background:${a};color:#FAF7F2;border:1px solid ${a}}
          .horarios{padding:0 28px}
          .h-item{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px dotted #D8CDB6;font-size:15px}
          .h-dia{color:#9a7a5a;text-transform:capitalize}
          .maps-btn{display:inline-block;margin-top:14px;background:transparent;border:1px solid #C8B89A;color:#5a3e1b;padding:10px 22px;font-size:12px;letter-spacing:3px;text-transform:uppercase;cursor:pointer}
          .redes{display:flex;gap:20px;justify-content:center;flex-wrap:wrap;padding:0 28px}
          .red{font-size:13px;color:#9a7a5a;font-weight:500}
          footer{background:#1a1208;padding:24px 28px;text-align:center;margin-top:40px}
          footer p{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#3a2a18}
          footer a{color:${a}}
          @media(max-width:480px){.hero-title{font-size:34px}.frase{font-size:16px}}
        ` }} />
      </head>
      <body>
        <div className="hero">
          <span className="ornament">✦ ✦ ✦</span>
          {d.logo_url
            ? <img src={d.logo_url} alt={d.nombre} className="hero-logo" style={{filter:'brightness(0) invert(1)'}} />
            : <div className="hero-title">{d.nombre}</div>
          }
          <div className="hero-sub">Sevilla · Restaurante</div>
        </div>

        {d.frase_bienvenida && (<><div className="divider"><div className="div-line"/><div className="div-diamond"/><div className="div-line"/></div><div className="frase">"{d.frase_bienvenida}"</div></>)}
        {d.descripcion_local && <div className="desc">{d.descripcion_local}</div>}
        {d.descripcion_barrio && <div className="desc" style={{fontSize:14,color:'#9a7a5a',marginTop:4}}>{d.descripcion_barrio}</div>}

        {d.mostrar_reservas && (d.telefono_reservas || d.url_reserva_directa || d.whatsapp) && (
          <div className="reserva">
            <div className="res-t">{d.t.reservar}</div>
            <div className="res-s">{d.t.reserva_directa}</div>
            {d.telefono_reservas && <a href={`tel:${d.telefono_reservas}`} className="btn">{d.t.llamar}</a>}
            {d.whatsapp && <a href={`https://wa.me/${d.whatsapp.replace(/\D/g,'')}`} className="btn">{d.t.whatsapp}</a>}
            {d.url_reserva_directa && <a href={d.url_reserva_directa} className="btn btn-solid">{d.t.online}</a>}
          </div>
        )}

        {d.mostrar_carta && d.carta.length > 0 && (
          <><div className="divider"><div className="div-line"/><div className="div-diamond"/><div className="div-line"/></div>
          <div className="sec-label">— {d.t.carta} —</div>
          <div className="carta">
            {d.carta.map(c => (
              <div key={c.cat}>
                <div className="cat">{c.cat}</div>
                {c.items.map(i => (
                  <div key={i.nombre} className="item">
                    <div><div className="item-name">{i.nombre}</div>{i.descripcion && <div className="item-desc">{i.descripcion}</div>}</div>
                    {i.precio != null && <span className="price">{Number(i.precio).toFixed(2)} €</span>}
                  </div>
                ))}
              </div>
            ))}
          </div></>
        )}

        {d.horarios.length > 0 && (
          <><div className="divider"><div className="div-line"/><div className="div-diamond"/><div className="div-line"/></div>
          <div className="sec-label">— {d.t.horarios} —</div>
          <div className="horarios">
            {d.horarios.map(h => <div key={h.dia} className="h-item"><span className="h-dia">{h.dia}</span><span>{h.hora}</span></div>)}
          </div></>
        )}

        {d.url_google_maps && (
          <><div className="divider"><div className="div-line"/><div className="div-diamond"/><div className="div-line"/></div>
          <div className="sec-label">— {d.t.como_llegar} —</div>
          <div style={{textAlign:'center',padding:'0 28px'}}>
            <a href={d.url_google_maps} target="_blank" rel="noopener noreferrer" className="maps-btn">{d.t.maps}</a>
          </div></>
        )}

        {Object.values(d.redes_sociales).some(Boolean) && (
          <><div style={{height:32}}/><div className="redes">
            {d.redes_sociales.instagram && <a href={`https://instagram.com/${d.redes_sociales.instagram.replace('@','')}`} target="_blank" rel="noopener" className="red">Instagram</a>}
            {d.redes_sociales.facebook && <a href={d.redes_sociales.facebook} target="_blank" rel="noopener" className="red">Facebook</a>}
            {d.redes_sociales.tiktok && <a href={`https://tiktok.com/@${d.redes_sociales.tiktok.replace('@','')}`} target="_blank" rel="noopener" className="red">TikTok</a>}
            {d.redes_sociales.tripadvisor && <a href={d.redes_sociales.tripadvisor} target="_blank" rel="noopener" className="red">TripAdvisor</a>}
          </div></>
        )}

        <footer><p>{d.t.footer} <a href="https://www.iarest.es" target="_blank" rel="noopener">ia.rest</a> · Sistema inteligente para hostelería</p></footer>
      </body>
    </html>
  )
}
