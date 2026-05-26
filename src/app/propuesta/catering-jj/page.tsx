'use client'
import PropuestaBase, {
  ClienteConfig,
  MODULO_RECEPCION,
  MODULO_RRHH,
  MODULO_EVENTOS,
} from '@/components/propuesta/PropuestaBase'

const C = { red:'#D9442B', gold:'#C9A84C', green:'#3F7D44', teal:'#2B6A6E', amber:'#E8A33B' }

const MODULO_ESCANDALLOS_CATERING = (): any => ({
  icon: '📋',
  titulo: 'Escandallos por evento',
  color: C.gold,
  desc: 'Crea el escandallo de cada menú una vez. ia.rest multiplica automáticamente por el número de comensales y genera la lista de compra completa del evento al instante.',
  ejemplos: [
    'Boda 350 personas → lista de compra generada en 5 segundos',
    'Cambio de aforo → todos los géneros se recalculan solos',
    'Coste por comensal en tiempo real antes de dar presupuesto',
  ],
  roi: 'Elimina el Excel de escandallos. Cero errores de cálculo en eventos de 400+ personas.',
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
    { cita: '', pain: 'Escandallo manual por aforo', detalle: 'Recalcular food cost cada vez que cambia el número de comensales consume horas que no generan valor.', modulo: 'Presupuestador automático', color: C.gold },
    { cita: '', pain: 'Stock invisible post-evento', detalle: 'Sin registro en tiempo real, el inventario al día siguiente de una boda de 400 personas es siempre una sorpresa.', modulo: 'Almacén en tiempo real', color: C.teal },
    { cita: '', pain: 'Pases sin coordinación digital', detalle: 'Coordinar cocina central y hacienda simultáneamente con papel multiplica los errores de servicio.', modulo: 'KDS por pases', color: C.green },
    { cita: '', pain: 'El margen real se descubre después', detalle: 'Cada propuesta parte de cero: géneros, personal, transporte. Sin datos, el margen es siempre una estimación.', modulo: 'Margen calculado antes', color: C.red },
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
    { titulo: 'Escandallos automáticos', desc: 'Un menú guardado una vez. ia.rest multiplica por el aforo y genera la compra. Para 50 eventos al año, son semanas de trabajo recuperadas.' },
    { titulo: 'Dos haciendas, un solo panel', desc: 'Stock centralizado. Sabes en todo momento qué hay en El Alba y en Trinidad sin llamadas ni WhatsApps.' },
    { titulo: 'Presupuestador con margen real', desc: 'Calcula el coste exacto de cada evento antes de confirmarlo. Nunca más cerrar una boda que no es rentable.' },
  ],

  objecionPrincipal: '"Tenemos nuestros procesos montados. No sé si merece la pena cambiar."',
  respuestaObjecion: 'No cambias nada de golpe. Empezamos solo con escandallos y almacén — lo que más te duele hoy. El resto lo vas añadiendo tú cuando quieras.',

  fasePiloto: [
    {
      fase: 'Semana 1-2',
      color: C.gold,
      items: [
        'Alta de tus menús y escandallos en ia.rest',
        'Conectamos tus proveedores habituales',
        'Primer evento con lista de compra automática',
      ],
    },
    {
      fase: 'Semana 3-4',
      color: C.teal,
      items: [
        'OCR albarán activo en ambas haciendas',
        'Stock centralizado El Alba + Trinidad',
        'Presupuestador configurado con tus márgenes',
      ],
    },
    {
      fase: 'Mes 2',
      color: C.green,
      items: [
        'KDS por pases en primer evento real',
        'Gestión de personal por evento activa',
        'Primer informe de rentabilidad real vs presupuestada',
      ],
    },
  ],

  modulos: [
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
