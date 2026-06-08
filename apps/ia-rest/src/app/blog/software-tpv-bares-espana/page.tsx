import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Software TPV para Bares en España: Qué Necesitas Realmente',
  description: 'Guía práctica para elegir el software TPV de tu bar o restaurante en España. Sin tecnicismos, sin nombres de marca: lo que realmente importa.',
  alternates: { canonical: 'https://www.iarest.es/blog/software-tpv-bares-espana' },
  openGraph: {
    title: 'Software TPV para Bares en España: Qué Necesitas Realmente',
    description: 'Guía práctica para elegir el software TPV de tu bar o restaurante en España.',
    url: 'https://www.iarest.es/blog/software-tpv-bares-espana',
    type: 'article',
  },
  keywords: ['software tpv bares espana', 'tpv bar restaurante', 'elegir tpv hosteleria'],
}

export default function Page() {
  const s = {
    wrap:  { maxWidth: 720, margin: '0 auto', padding: '40px 24px', fontFamily: "'Inter Tight',system-ui,sans-serif", color: '#1A1714', lineHeight: 1.7 } as const,
    h1:    { fontSize: 'clamp(26px,4vw,38px)', fontWeight: 700, marginBottom: 16, lineHeight: 1.2, color: '#14110E' } as const,
    h2:    { fontSize: 'clamp(18px,3vw,24px)', fontWeight: 600, margin: '40px 0 14px', color: '#14110E' } as const,
    p:     { marginBottom: 20, fontSize: 16 } as const,
    lead:  { fontSize: 18, color: '#6B5F52', marginBottom: 36 } as const,
    cta:   { background: '#D9442B', color: '#fff', padding: '24px 32px', borderRadius: 12, textAlign: 'center' as const, marginTop: 40 } as const,
    ul:    { paddingLeft: 20, marginBottom: 20 } as const,
    li:    { marginBottom: 8, fontSize: 16 } as const,
    tag:   { display: 'inline-block', background: 'rgba(217,68,43,0.08)', color: '#D9442B', padding: '2px 10px', borderRadius: 20, fontSize: 13, fontWeight: 600, marginBottom: 16 } as const,
  }

  return (
    <article style={s.wrap}>
      <div style={s.tag}>Guía · Hostelería 2026</div>
      <h1 style={s.h1}>Software TPV para Bares en España: Qué Necesitas Realmente</h1>
      <p style={s.lead}>
        El mercado de software TPV para hostelería en España lleva años creciendo — y con él, la confusión. Más opciones no significa más claridad. Esta guía va al grano: qué mirar, qué ignorar y por qué la mayoría de bares acaban pagando por funciones que nunca usan.
      </p>

      <h2 style={s.h2}>El error más común al elegir un TPV</h2>
      <p style={s.p}>
        La mayoría de dueños de bar eligen su software TPV igual que eligieron su frigorífico: mirando el precio inicial y el logo de la marca. Error. El coste real de un TPV no está en la cuota mensual — está en el tiempo que pierdes cada día usándolo.
      </p>
      <p style={s.p}>
        Un camarero que tarda 40 segundos en apuntar una comanda en pantalla táctil, multiplicado por 80 comandas al día, son más de 50 minutos perdidos. Cada día. Solo en ese paso.
      </p>

      <h2 style={s.h2}>Lo que sí importa al comparar</h2>
      <ul style={s.ul}>
        <li style={s.li}><strong>Velocidad de comandas</strong> — ¿cuántos toques necesita el camarero para apuntar "2 cañas y una ración de croquetas"? Menos es mejor.</li>
        <li style={s.li}><strong>Integración con cocina</strong> — ¿la comanda llega al KDS o sigue yendo en papel? El papel se pierde. El KDS no.</li>
        <li style={s.li}><strong>Coste real mensual</strong> — suma cuota base + usuarios + mesas + módulos que necesitas. Lo que parece barato al principio muchas veces no lo es.</li>
        <li style={s.li}><strong>Sin comisión por venta</strong> — algunos cobran un porcentaje de cada cobro. Asegúrate de que el tuyo no.</li>
        <li style={s.li}><strong>Soporte en español, en horario de hostelería</strong> — si tienes un problema el sábado a las 22h, ¿hay alguien al otro lado?</li>
      </ul>

      <h2 style={s.h2}>Lo que puedes ignorar</h2>
      <p style={s.p}>
        Las demos son bonitas. Los dashboards con gráficos de colores gustan en el pitch. Pero en el día a día de un bar lo que importa es lo básico funcionando bien: comanda rápida, cobro rápido, cocina informada.
      </p>
      <p style={s.p}>
        No necesitas 47 módulos si solo usas 4. No necesitas un sistema diseñado para cadenas de 50 locales si tienes un bar con 12 mesas. El tamaño del software debe ajustarse al tuyo.
      </p>

      <h2 style={s.h2}>La tendencia que está cambiando la hostelería española</h2>
      <p style={s.p}>
        En 2026 el cambio más relevante no es una nueva pantalla táctil — es la voz. Los sistemas TPV por voz permiten al camarero dictar la comanda mientras camina hacia la siguiente mesa. Sin tocar nada. Sin errores de transcripción. La comanda llega a cocina en segundos.
      </p>
      <p style={s.p}>
        No es ciencia ficción: ya está funcionando en bares y restaurantes en España a 59€/mes, sin comisión por venta y sin contrato de permanencia.
      </p>

      <h2 style={s.h2}>Checklist antes de firmar</h2>
      <ul style={s.ul}>
        <li style={s.li}>¿Hay periodo de prueba gratuito sin tarjeta?</li>
        <li style={s.li}>¿Cuánto cuesta si añado 2 camareros más?</li>
        <li style={s.li}>¿Hay permanencia o puedo cancelar el mes que viene?</li>
        <li style={s.li}>¿Funciona sin conexión a internet si cae la wifi?</li>
        <li style={s.li}>¿VeriFactu incluido o es un módulo de pago aparte?</li>
        <li style={s.li}>¿A qué hora responden si hay un fallo en pleno servicio?</li>
      </ul>

      <h2 style={s.h2}>Conclusión</h2>
      <p style={s.p}>
        El mejor software TPV para tu bar no es el más famoso ni el más caro. Es el que tus camareros aprenden en una hora, el que no falla en el pico del sábado y el que no te cobra por cada mesa o cada venta. Compara con calma, prueba antes de comprometerte y huye de los contratos largos.
      </p>

      <div style={s.cta}>
        <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#fff' }}>
          ia.rest: TPV por voz para hostelería española
        </p>
        <p style={{ fontSize: 15, marginBottom: 20, color: 'rgba(255,255,255,0.85)' }}>
          59€/mes · Sin comisión · Sin permanencia · 14 días gratis
        </p>
        <a href="https://www.iarest.es" style={{ color: '#fff', textDecoration: 'underline', fontSize: 16 }}>
          Pruébalo en tu restaurante →
        </a>
      </div>
    </article>
  )
}
