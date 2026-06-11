'use client'
import PropuestaBase, {
  ClienteConfig,
  MODULO_RECEPCION,
  MODULO_RRHH,
  MODULO_EVENTOS,
} from '@/components/propuesta/PropuestaBase'

const C = { red:'#D9442B', gold:'#C9A84C', green:'#3F7D44', teal:'#2B6A6E', amber:'#E8A33B' }

const MODULO_COMERCIAL = (): any => ({
  emoji: '🎯',
  titulo: 'Comercial y comisiones',
  sub: 'CRM de eventos + incentivos del equipo',
  ruta: '',
  color: C.red,
  desc: 'Cada comercial con su pipeline de bodas y eventos. ia.rest calcula su comisión y su ranking automáticamente: bono por margen, por ticket más alto y por reseñas conseguidas — con el % escalable que marca su contrato.',
  ejemplos: [
    'Ranking del equipo en tiempo real: quién vende con más margen',
    'Bono automático por ticket más caro y por reseñas del cliente',
    'Contrato con % escalable: sube solo al alcanzar objetivos',
  ],
  roi: 'El equipo se autogestiona y ves quién aporta de verdad — sin cuadrar comisiones a mano.',
})

const MODULO_MATERIAL = (): any => ({
  emoji: '🍽️',
  titulo: 'Material de eventos',
  sub: 'Menaje, roturas y previsión por evento',
  ruta: '',
  color: C.teal,
  desc: 'Catálogo de mesas, sillas, vajilla y cristalería con stock real. Cada evento descuenta lo que sale; al cerrar la boda registras las roturas con foto y se liquidan solas. ia.rest aprende cuánto material necesita cada tipo de evento.',
  ejemplos: [
    'Previsión de material y bebida por aforo, temporada y temperatura',
    'Inventario post-boda con parte de roturas y foto',
    'Aviso si no llega el material para los eventos cerrados de la semana',
  ],
  roi: 'Saber qué tienes, qué se rompió y qué hace falta — sin recuento por vídeo ni listas de papel.',
})

const MODULO_MARKETPLACE = (): any => ({
  emoji: '💍',
  titulo: 'Presupuesto self-service del cliente',
  sub: 'El cliente configura su evento y reserva',
  ruta: 'En desarrollo',
  color: C.amber,
  desc: 'Una URL donde el cliente final monta su evento —50 adultos, 15 niños, 2 días—, elige menú con tu margen ya incorporado y reserva con paga y señal. El comercial recibe el lead ya cualificado y solo remata.',
  ejemplos: [
    'El cliente elige entre opciones de menú con tu margen objetivo',
    'Multi-tarificador: el precio se ajusta solo al aforo y al tipo de evento',
    'Cobro online con señal — el evento entra directo en la agenda',
  ],
  roi: 'Cualificas y cierras bodas fuera de horario. El comercial llega con el trabajo medio hecho.',
})

const MODULO_ESCANDALLOS_CATERING = (): any => ({
  icon: '📋',
  titulo: 'Escandallos conectados',
  color: C.gold,
  desc: 'Vuestro sistema de cocina se queda como está: ia.rest se conecta a él. Cuando entra un evento, el escandallo de cada menú se multiplica por el aforo y alimenta el presupuesto y la lista de compra — sin volver a teclear lo que ya tenéis cargado.',
  ejemplos: [
    'El escandallo que ya hacéis, enlazado al presupuesto y a la compra',
    'Cambio de aforo → géneros y coste por comensal recalculados solos',
    'Coste real por comensal disponible antes de cerrar el precio',
  ],
  roi: 'Cero doble trabajo: lo de cocina no se reemplaza, se aprovecha en el resto del grupo.',
})

const MODULO_ALMACEN_CATERING = (): any => ({
  icon: '🏭',
  titulo: 'Almacén y compras',
  color: C.teal,
  desc: 'Control de stock centralizado para Hacienda El Alba y Hacienda Trinidad. Recepción de mercancía con OCR de albarán — fotografías el albarán y el stock se actualiza solo.',
  ejemplos: [
    'OCR albarán: foto → stock actualizado en segundos',
    'Pedido automático al proveedor cuando el stock baja del mínimo',
    'Control de mermas y diferencias entre lo comprado y lo servido',
  ],
  roi: 'Con dos haciendas y eventos simultáneos, saber exactamente qué tienes en cada almacén vale dinero.',
})

const MODULO_PRESUPUESTADOR = (): any => ({
  icon: '💶',
  titulo: 'Presupuestador de eventos',
  color: C.green,
  desc: 'Introduce aforo + menú + personal necesario → ia.rest calcula el coste total del evento, el precio de venta con tu margen objetivo y genera un PDF de presupuesto listo para el cliente.',
  ejemplos: [
    'Presupuesto boda 350 personas generado en 2 minutos',
    'Comparativa de márgenes por tipo de menú',
    'Histórico de rentabilidad real vs presupuestada por evento',
  ],
  roi: 'Sabes exactamente cuánto ganas en cada boda antes de confirmarla.',
})

const MODULO_KDS_PASES = (): any => ({
  icon: '🍽️',
  titulo: 'KDS por pases',
  color: C.red,
  desc: 'En un evento de 400 personas la cocina no trabaja comanda por comanda — trabaja por pases. ia.rest organiza la cocina en tandas: mesas 1-10, mesas 11-20... Cada partida sabe exactamente qué preparar y cuándo.',
  ejemplos: [
    'Pase 1 — 80 entrantes: cocina fría + barra coordinadas',
    'Pase 2 — 80 principales: tiempos ajustados automáticamente',
    'Aviso automático cuando el pase está listo para salir',
  ],
  roi: 'Menos caos en cocina. Todos los platos de una mesa salen juntos y a tiempo.',
})

const config: ClienteConfig = {
  nombre: 'Catering Joaquín Jaén',
  grupo: 'Catering Joaquín Jaén — Hacienda El Alba + Hacienda Trinidad',
  emailContacto: 'alberto.suarez.gutierrez@gmail.com',
  contactoNombre: 'Joaquín Jaén',
  slug: 'catering-jj',
  ciudad: 'Sevilla',
  verticales: [
    { label: 'Haciendas — El Alba y Trinidad', sub: 'Bodas y eventos hasta 550 personas · Pases · Stock', url: '/propuesta/catering-jj-haciendas', icon: '🏛️', color: C.gold },
    { label: 'Restaurantes — Doble J y Las Dos Jotas', sub: 'Sala · Delivery · KDS · Gestión diaria', url: '/propuesta/catering-jj-restauracion', icon: '🍽️', color: C.teal },
    { label: 'Catering externo', sub: 'Cocina central · Logística · Presupuestador', url: '/propuesta/catering-jj-catering', icon: '🚚', color: C.green },
  ],
  tagsIntro: [
    'Bodas hasta 550 personas',
    'Eventos de empresa',
    'Dos haciendas en exclusiva',
    '15 años de trayectoria',
    'Cocina central en Valencina',
  ],

  citas: [
    { cita: '', pain: 'Comisiones del equipo a mano', detalle: 'Calcular el bono de cada comercial por margen, ticket y reseñas, con su % escalable de contrato, consume horas y genera discusiones.', modulo: 'Comercial e incentivos', color: C.red },
    { cita: '', pain: 'Material de eventos sin control', detalle: 'Recuento de copas por vídeo, listas de papel y roturas que se descubren tarde. Cuánto material hace falta para la semana es siempre una estimación.', modulo: 'Material y roturas', color: C.teal },
    { cita: '', pain: 'Cada presupuesto, desde cero', detalle: 'El cliente quiere respuesta rápida; montar el menú con su margen y enviarlo lleva tiempo. El que responde antes se lleva la boda.', modulo: 'Presupuesto self-service', color: C.amber },
    { cita: '', pain: 'La cocina, en una isla', detalle: 'El sistema de cocina ya funciona y es bueno — pero vive aparte del comercial, del material y de la contabilidad del grupo.', modulo: 'Conectamos, no reemplazamos', color: C.green },
  ],

  headline: 'Dos haciendas · Bodas hasta 550 · Eventos empresa · Cocina central',

  partidas: [
    { nombre: 'Cocina central', secciones: ['Fríos', 'Calientes', 'Postres'], color: C.red, icon: '🔥' },
    { nombre: 'Hacienda El Alba', secciones: ['Montaje', 'Pases', 'Barra'], color: C.gold, icon: '🏛️' },
    { nombre: 'Hacienda Trinidad', secciones: ['Montaje', 'Pases', 'Barra'], color: C.teal, icon: '🌿' },
  ],

  pasosFlujo: [
    { actor: 'Cliente', accion: 'Solicita presupuesto para boda de 350 personas', icon: '💍', color: '#F6F1E7' },
    { actor: 'ia.rest', accion: 'Seleccionas menú → calcula coste de géneros + personal automáticamente', icon: '✦', color: C.red },
    { actor: 'Joaquín', accion: 'Genera PDF de presupuesto en 2 minutos y lo envía al cliente', icon: '📄', color: C.gold },
    { actor: 'Compras', accion: 'Confirma el evento → ia.rest genera orden de compra al proveedor', icon: '🛒', color: C.teal },
    { actor: 'Cocina', accion: 'Día del evento: KDS organiza los pases automáticamente', icon: '🍽️', color: C.green },
    { actor: 'Post-evento', accion: 'Cierre: mermas reales vs planificadas, rentabilidad del evento', icon: '📊', color: C.amber },
  ],

  sinKDSMensaje: 'En cada hacienda una pantalla KDS coordina los pases de cocina. El jefe de sala ve en tiempo real el estado de cada pase y puede comunicar con cocina sin walkie ni gritos.',

  slideStockLabel: 'El coste oculto del catering',
  mercaderiaAnual: '~300.000 €',
  desviacion1pct: '3.000 €',
  citaStock: 'En eventos de 400 personas, una desviación del 1% en géneros son miles de euros al año.',

  hoyVsIaRest: {
    hoy: [
      'Escandallos en Excel — recalcular a mano para cada aforo',
      'Presupuesto: horas de cálculo entre géneros + personal',
      'Stock: sabes qué compraste, no siempre qué sobró',
      'Cocina en evento: coordinación por voz o walkie',
      'Rentabilidad real de cada evento: difícil de calcular',
    ],
    iaRest: [
      'Escandallo × aforo calculado en segundos',
      'Presupuesto completo en 2 minutos con PDF incluido',
      'Stock en tiempo real en Hacienda El Alba y Trinidad',
      'KDS por pases: cocina coordinada sin caos',
      'Rentabilidad real por evento al cerrar',
    ],
  },

  datosEstrategicos: [
    { titulo: 'Tu cocina, conectada al grupo', desc: 'El sistema de cocina que ya tenéis no se toca: se conecta. Sus escandallos y costes alimentan el presupuesto, la compra y la contabilidad del holding — sin reescribir nada.' },
    { titulo: 'Comercial que se autogestiona', desc: 'Cada comercial con su pipeline, su comisión y su ranking calculados solos. Bonos por margen, ticket y reseñas con el % escalable de cada contrato.' },
    { titulo: 'Material y previsión por evento', desc: 'Catálogo de menaje con stock real, roturas con foto al cerrar la boda y previsión de cuánto material y bebida hace falta según aforo y temporada.' },
  ],

  objecionPrincipal: '"Tenemos nuestros procesos montados, sobre todo en cocina. No sé si merece la pena cambiar."',
  respuestaObjecion: 'No tocamos lo que ya funciona: el sistema de cocina se queda y nos conectamos a él. Empezamos por donde menos duele —el material de eventos y el comercial— y el resto lo vais añadiendo vosotros cuando queráis.',

  fasePiloto: [
    {
      fase: 'Semana 1-2',
      color: C.gold,
      items: [
        'Catálogo de material de eventos con stock real',
        'Alta del equipo comercial con sus contratos y comisiones',
        'Primer evento con material descontado automáticamente',
      ],
    },
    {
      fase: 'Semana 3-4',
      color: C.teal,
      items: [
        'Inventario post-boda con roturas por foto',
        'Ranking y comisiones del equipo en tiempo real',
        'Conexión con vuestro sistema de cocina (escandallos → presupuesto)',
      ],
    },
    {
      fase: 'Mes 2',
      color: C.green,
      items: [
        'Previsión de material y bebida por evento',
        'Presupuesto self-service del cliente (piloto)',
        'Financiero del catering consolidado en plataforma',
      ],
    },
  ],

  modulos: [
    MODULO_COMERCIAL(),
    MODULO_MATERIAL(),
    MODULO_MARKETPLACE(),
    MODULO_ESCANDALLOS_CATERING(),
    MODULO_ALMACEN_CATERING(),
    MODULO_PRESUPUESTADOR(),
    MODULO_KDS_PASES(),
    MODULO_RECEPCION({ roi: 'OCR de albarán: fotografías la entrega y el stock se actualiza solo en los dos almacenes.' }),
    MODULO_RRHH({ roi: 'Gestiona el personal de cada evento: convocatoria, fichaje y coste de personal por celebración.' }),
    MODULO_EVENTOS({
      ejemplos: [
        'Semana de bodas en junio — planifica compras con antelación',
        'Dos eventos simultáneos — reparto de géneros entre haciendas',
        'Temporada alta — previsión de stock para no quedarte sin nada',
      ],
      roi: 'Con dos haciendas y eventos simultáneos, la previsión marca la diferencia.',
    }),
  ],
}

export default function PropuestaCateringJJ() {
  return <PropuestaBase config={config} />
}
