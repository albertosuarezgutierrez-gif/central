import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Demo Storefront — ia.rest',
  description: 'Prueba el canal de pedidos online de ia.rest',
  robots: 'noindex',
}

export default function DemoStorefrontPage() {
  const links = [
    {
      icon: '🛒',
      label: 'Tienda online (cliente)',
      desc: 'Carta completa, carrito, checkout — lo que ve el cliente final',
      url: '/tienda/demo',
      color: '#D9442B',
      cta: 'Abrir tienda',
    },
    {
      icon: '📞',
      label: 'Pedido rápido (empleado)',
      desc: 'Canal teléfono y mostrador — el empleado introduce el pedido',
      url: '/edge/pedido-rapido',
      color: '#3B82F6',
      cta: 'Abrir panel · PIN 7672',
    },
    {
      icon: '📋',
      label: 'Panel pedidos online (owner)',
      desc: 'Gestión y cierre de pedidos — confirmar, cocina, listo, entregado',
      url: '/owner/pedidos-online',
      color: '#3F7D44',
      cta: 'Abrir panel · PIN 1369',
    },
    {
      icon: '👨‍🍳',
      label: 'KDS Cocina',
      desc: 'Los pedidos online llegan aquí igual que cualquier comanda',
      url: '/kds',
      color: '#8B5CF6',
      cta: 'Abrir KDS · PIN 3297',
    },
  ]

  const flujo = [
    { paso: '1', label: 'Cliente pide en /tienda/demo', icon: '🛒' },
    { paso: '2', label: 'Paga con Stripe', icon: '💳' },
    { paso: '3', label: 'Comanda aparece en KDS', icon: '👨‍🍳' },
    { paso: '4', label: 'Owner avanza estado en panel', icon: '📋' },
    { paso: '5', label: 'Cliente ve tracking en tiempo real', icon: '📱' },
  ]

  return (
    <div className="min-h-screen bg-[#14110E]" style={{ fontFamily: 'Inter Tight, sans-serif' }}>

      {/* Hero */}
      <div className="border-b border-[#2A2420] px-6 py-10 text-center">
        <p className="text-[#D9442B] text-sm font-bold uppercase tracking-widest mb-3">ia.rest · Demo</p>
        <h1 className="text-3xl font-bold text-[#F6F1E7] mb-2" style={{ fontFamily: 'Newsreader, serif' }}>
          Storefront — Canal de pedidos propio
        </h1>
        <p className="text-[#9C8E7E] text-sm max-w-md mx-auto">
          Sin Deliverect, sin Glovo, sin comisiones. El pedido entra directamente en cocina.
        </p>
      </div>

      {/* Links principales */}
      <div className="max-w-lg mx-auto px-4 py-8 space-y-3">
        {links.map(l => (
          <a
            key={l.url}
            href={l.url}
            className="flex items-center gap-4 bg-[#1E1A16] border border-[#2A2420] rounded-2xl px-5 py-4 hover:border-[#3A3028] transition-all group"
          >
            <span className="text-3xl">{l.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[#F6F1E7] text-sm group-hover:text-white transition-colors">{l.label}</p>
              <p className="text-xs text-[#9C8E7E] mt-0.5 line-clamp-1">{l.desc}</p>
            </div>
            <span
              className="text-xs font-bold px-3 py-1.5 rounded-xl whitespace-nowrap flex-shrink-0"
              style={{ background: l.color + '20', color: l.color }}
            >
              {l.cta}
            </span>
          </a>
        ))}
      </div>

      {/* Flujo */}
      <div className="max-w-lg mx-auto px-4 pb-10">
        <p className="text-xs font-bold text-[#9C8E7E] uppercase tracking-widest mb-4 text-center">
          Flujo completo de pedido
        </p>
        <div className="bg-[#1E1A16] rounded-2xl border border-[#2A2420] overflow-hidden">
          {flujo.map((f, i) => (
            <div
              key={f.paso}
              className={`flex items-center gap-4 px-5 py-3.5 ${i < flujo.length - 1 ? 'border-b border-[#2A2420]' : ''}`}
            >
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: '#D9442B20', color: '#D9442B' }}
              >
                {f.paso}
              </span>
              <span className="text-lg">{f.icon}</span>
              <span className="text-sm text-[#D8CDB6]">{f.label}</span>
            </div>
          ))}
        </div>

        <div className="mt-6 bg-[#D9442B15] border border-[#D9442B30] rounded-2xl px-5 py-4">
          <p className="text-xs font-bold text-[#D9442B] mb-1">⚠️ Nota sobre el pago en demo</p>
          <p className="text-xs text-[#9C8E7E]">
            El pago Stripe está en modo TEST. Usa la tarjeta{' '}
            <span className="font-mono text-[#D8CDB6]">4242 4242 4242 4242</span>,
            fecha futura, cualquier CVC.
            La comanda llega a cocina solo cuando el webhook esté configurado.
          </p>
        </div>
      </div>
    </div>
  )
}
