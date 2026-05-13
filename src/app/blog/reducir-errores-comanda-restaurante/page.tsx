import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Cómo reducir los errores de comanda en tu restaurante',
  description: 'Causas reales de los errores de comanda en hostelería y cómo eliminarlos. Datos, herramientas y consejos prácticos para restaurantes y bares.',
  alternates: { canonical: 'https://www.iarest.es/blog/reducir-errores-comanda-restaurante' },
  openGraph: {
    title: 'Cómo reducir los errores de comanda en tu restaurante',
    description: 'Causas y soluciones reales para los errores de comanda en hostelería.',
    url: 'https://www.iarest.es/blog/reducir-errores-comanda-restaurante',
    type: 'article',
    publishedTime: '2026-05-13',
  },
  keywords: [
    'errores comanda restaurante', 'reducir errores hosteleria', 'errores camarero',
    'gestión comandas restaurante', 'mejorar servicio restaurante', 'tpv sin errores',
    'comanda por voz hosteleria', 'sistema comandas restaurante eficiente',
  ],
}

const SE = "'Newsreader',Georgia,serif"
const SN = "'Inter Tight',system-ui,sans-serif"
const SM = "'JetBrains Mono',monospace"

export default function ArticuloErroresComanda() {
  return (
    <div style={{ minHeight: '100vh', background: '#F6F1E7', color: '#1A1714', fontFamily: SN }}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '48px 20px' }}>

        {/* Nav */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 48 }}>
          <a href="/" style={{ textDecoration: 'none' }}>
            <span style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: '#1A1714' }}>
              ia<span style={{ color: '#D9442B' }}>.</span>rest
            </span>
          </a>
          <span style={{ color: '#D8CDB6' }}>/</span>
          <a href="/blog" style={{ fontSize: 13, color: '#6B5F52', textDecoration: 'none' }}>Blog</a>
        </div>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
            <span style={{
              fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
              fontWeight: 600, color: '#2d5c31', background: '#3F7D4420',
              padding: '3px 10px', borderRadius: 100,
            }}>Operaciones</span>
            <span style={{ fontSize: 12, color: '#6B5F52', fontFamily: SM }}>Mayo 2026 · 6 min lectura</span>
          </div>
          <h1 style={{
            fontFamily: SE, fontStyle: 'italic', fontSize: 38, color: '#1A1714',
            margin: '0 0 20px', lineHeight: 1.15, letterSpacing: '-0.5px',
          }}>
            Cómo reducir los errores de comanda en tu restaurante
          </h1>
          <p style={{ fontSize: 17, color: '#3A332C', lineHeight: 1.7, margin: 0 }}>
            Un camarero medio comete entre 3 y 5 errores de comanda por turno. No es descuido — es el diseño del proceso. Esta guía analiza las causas reales y las soluciones que funcionan en hostelería.
          </p>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #D8CDB6', margin: '0 0 40px' }} />

        {/* Contenido */}
        <div style={{ fontSize: 16, lineHeight: 1.8, color: '#3A332C' }}>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '0 0 16px', letterSpacing: '-0.3px' }}>
            El coste real de un error de comanda
          </h2>
          <p>
            Cuando un cliente recibe algo que no pidió, el coste visible es el plato que hay que repetir. Pero el coste real es mayor: el tiempo de cocina que se pierde, la mesa que espera, el camarero que tiene que dar explicaciones, y la posibilidad de que ese cliente no vuelva.
          </p>
          <p>
            En un restaurante de volumen medio, un error de comanda al día equivale a <strong>15-20 minutos de trabajo extra</strong> repartidos entre sala y cocina. En temporada alta, con 3-4 errores, el impacto en la rotación de mesas es directamente measurable.
          </p>
          <p>
            Los errores de alérgenos tienen un impacto diferente: además del riesgo para el cliente, exponen legalmente al restaurante. El Reglamento europeo 1169/2011 exige trazabilidad de los 14 alérgenos reconocidos. Un error documentado puede derivar en inspecciones sanitarias.
          </p>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12,
            margin: '24px 0',
          }}>
            {[
              { val: '3–5', label: 'errores por camarero y turno de media' },
              { val: '45s', label: 'de atención perdida en cada viaje al TPV' },
              { val: '−€€', label: 'en costes de reposición y tiempo de cocina' },
            ].map((stat, i) => (
              <div key={i} style={{
                background: '#FBF8F1', border: '1px solid #D8CDB6',
                borderRadius: 6, padding: '16px', textAlign: 'center',
              }}>
                <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 28, color: '#D9442B', lineHeight: 1 }}>{stat.val}</div>
                <div style={{ fontSize: 12, color: '#6B5F52', marginTop: 6, lineHeight: 1.4 }}>{stat.label}</div>
              </div>
            ))}
          </div>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '32px 0 16px', letterSpacing: '-0.3px' }}>
            Las 4 causas principales
          </h2>

          <h3 style={{ fontFamily: SE, fontSize: 19, color: '#1A1714', margin: '24px 0 8px' }}>
            1. La libreta y el viaje al TPV
          </h3>
          <p>
            El flujo clásico — anotar en libreta, ir al terminal, teclear — introduce dos puntos de fallo: el traspaso de libreta a terminal y la prisa durante el tecleo en hora punta. Un camarero que gestiona cuatro mesas a la vez tiene que mantener en memoria los pedidos de cada una mientras llega al TPV.
          </p>
          <p>
            La solución no es entrenar más memoria al camarero — es eliminar el viaje.
          </p>

          <h3 style={{ fontFamily: SE, fontSize: 19, color: '#1A1714', margin: '24px 0 8px' }}>
            2. Las modificaciones y notas especiales
          </h3>
          <p>
            "Sin sal", "muy hecho", "la silla alta del niño", "es alérgica al gluten". Estas modificaciones son las que más se pierden en el proceso. En un TPV táctil, cada modificación implica varios clics adicionales que a menudo se omiten cuando hay prisa.
          </p>
          <p>
            Las notas de alérgenos son especialmente críticas: si no llegan a cocina, el error no solo molesta — puede causar una reacción en el cliente.
          </p>

          <h3 style={{ fontFamily: SE, fontSize: 19, color: '#1A1714', margin: '24px 0 8px' }}>
            3. La confusión de mesa en hora punta
          </h3>
          <p>
            Un camarero que lleva 8 mesas a las 14:15 puede confundir la T03 con la T05 cuando llega al terminal. Especialmente si las mesas tienen distribuciones físicas similares o si hay varios camareros compartiendo terminales.
          </p>

          <h3 style={{ fontFamily: SE, fontSize: 19, color: '#1A1714', margin: '24px 0 8px' }}>
            4. El personal nuevo
          </h3>
          <p>
            Aprender un TPV tarda entre 1 y 2 semanas. Durante ese tiempo, el índice de errores es notablemente más alto. En hostelería, con la alta rotación de personal que existe, este período de aprendizaje se repite constantemente y tiene un coste real en errores y supervisión.
          </p>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '32px 0 16px', letterSpacing: '-0.3px' }}>
            Las soluciones que funcionan
          </h2>

          <h3 style={{ fontFamily: SE, fontSize: 19, color: '#1A1714', margin: '24px 0 8px' }}>
            Comandera en el bolsillo (sin viaje al TPV)
          </h3>
          <p>
            Cualquier sistema que permita al camarero enviar la comanda desde el mismo lugar donde toma el pedido elimina el punto de fallo más frecuente. Puede ser una tablet, un móvil con app o un sistema de voz.
          </p>
          <p>
            La clave no es la tecnología concreta — es que el camarero no tenga que retener la información mientras camina hacia un terminal.
          </p>

          <h3 style={{ fontFamily: SE, fontSize: 19, color: '#1A1714', margin: '24px 0 8px' }}>
            Dictado por voz con confirmación
          </h3>
          <p>
            El dictado por voz tiene una ventaja específica sobre la pantalla táctil: el camarero puede dictar la comanda <em>mientras está todavía con el cliente</em>, con la información fresca, y el sistema la lee en voz alta para confirmar antes de enviar.
          </p>
          <p>
            Esto convierte el proceso en un doble check natural: el camarero dicta, el sistema confirma en voz alta, el camarero valida. El índice de error en este flujo cae cerca de cero porque la confirmación ocurre en el mismo momento del pedido, no tres mesas después.
          </p>
          <p>
            ia.rest usa este modelo: el camarero dicta ("dos cañas y una ensaladilla a la T04"), el sistema transcribe en menos de 0,3 segundos, estructura el pedido y lo lee en voz alta. Solo entonces el camarero confirma. Si hay algo mal, lo corrige antes de que llegue a cocina.
          </p>

          <div style={{
            background: '#1A1714', borderRadius: 6, padding: '20px 24px', margin: '24px 0',
          }}>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: '#6B5F52', fontFamily: SM, letterSpacing: '0.05em' }}>FLUJO CON VOZ</p>
            <p style={{ margin: 0, fontSize: 14, color: '#D8CDB6', lineHeight: 1.8 }}>
              Camarero dicta → <span style={{ color: '#E8A33B' }}>Whisper transcribe (0,3s)</span> → <span style={{ color: '#E8A33B' }}>BRAIN estructura</span> → <span style={{ color: '#3F7D44' }}>VOX confirma en voz alta</span> → camarero valida → <span style={{ color: '#D9442B' }}>cocina recibe</span>
            </p>
          </div>

          <h3 style={{ fontFamily: SE, fontSize: 19, color: '#1A1714', margin: '24px 0 8px' }}>
            Gestión de alérgenos integrada
          </h3>
          <p>
            Los alérgenos no pueden depender de la memoria del camarero. Necesitan estar en el sistema: el camarero declara los alérgenos del cliente en esa mesa, y cuando dicta o introduce un plato que los contiene, el sistema avisa antes de confirmar.
          </p>
          <p>
            En ia.rest, el camarero pulsa ALERG → activa los alérgenos del cliente (de los 14 reconocidos por el Reglamento europeo) → a partir de ese momento, cualquier plato incompatible genera un aviso sonoro antes de enviar la comanda a cocina.
          </p>

          <h3 style={{ fontFamily: SE, fontSize: 19, color: '#1A1714', margin: '24px 0 8px' }}>
            Formación en 10 minutos, no en 2 semanas
          </h3>
          <p>
            Si el sistema es hablar en español normal de hostelería ("dos de la casa", "la cuatro sin gluten, ojo", "cuenta para la ocho separada en tres"), el personal nuevo puede operar desde el primer turno. No hay menús que memorizar, no hay flujos de pantallas que aprender.
          </p>
          <p>
            Esto no elimina el período de adaptación — hay que aprender el local, las mesas, los productos — pero sí elimina la carga cognitiva adicional del sistema tecnológico.
          </p>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '32px 0 16px', letterSpacing: '-0.3px' }}>
            Cómo medir los errores en tu restaurante
          </h2>
          <p>
            Antes de implantar cualquier solución, conviene saber cuántos errores reales estás teniendo. Una forma sencilla:
          </p>
          <ul style={{ paddingLeft: 20, margin: '0 0 16px' }}>
            <li style={{ marginBottom: 8 }}>Pide a cocina que anote cada vez que llega una comanda con un problema (plato que no corresponde, modificación que falta, mesa equivocada)</li>
            <li style={{ marginBottom: 8 }}>Cruza ese número con el total de comandas del turno</li>
            <li style={{ marginBottom: 8 }}>Clasifica los errores por tipo: ¿son principalmente de mesa? ¿de modificaciones? ¿de personal nuevo?</li>
          </ul>
          <p>
            Con ese diagnóstico, la solución correcta es más evidente. Si el 80% de los errores son de mesa, el problema está en el paso libreta→TPV. Si son de modificaciones, el problema está en la interfaz. Si son de personal nuevo, el problema está en la formación.
          </p>

        </div>

        {/* CTA */}
        <div style={{
          marginTop: 48, padding: '32px',
          background: '#1A1714', borderRadius: 8, textAlign: 'center',
        }}>
          <p style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, color: '#F6F1E7', margin: '0 0 8px' }}>
            ia.rest reduce los errores de comanda a cero
          </p>
          <p style={{ fontSize: 13, color: '#D8CDB6', margin: '0 0 20px' }}>
            Confirmación por voz en cada comanda. Alertas de alérgenos integradas. Personal nuevo operativo en 5 minutos.
          </p>
          <a href="/registro" style={{
            display: 'inline-block', background: '#D9442B', color: '#F6F1E7',
            textDecoration: 'none', padding: '12px 28px', borderRadius: 6,
            fontSize: 14, fontWeight: 600,
          }}>
            Pruébalo 14 días gratis →
          </a>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid #D8CDB6', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <a href="/blog" style={{ color: '#6B5F52', fontSize: 13, textDecoration: 'none' }}>← Volver al blog</a>
          <a href="/blog/alternativa-numier-tpv" style={{ color: '#D9442B', fontSize: 13, textDecoration: 'none' }}>
            Siguiente: Alternativa a Numier TPV →
          </a>
        </div>

      </div>
    </div>
  )
}
