'use client'
import PropuestaBase, { ClienteConfig, MODULO_RRHH, MODULO_EVENTOS } from '@/components/propuesta/PropuestaBase'

const C = { red:'#D9442B', gold:'#C9A84C', green:'#3F7D44', teal:'#2B6A6E', amber:'#E8A33B' }

const config: ClienteConfig = {
  nombre: 'Catering JJ — Haciendas',
  grupo: 'Hacienda El Alba · Hacienda Trinidad · Hacienda El Triunfo',
  emailContacto: 'alberto.suarez.gutierrez@gmail.com',
  contactoNombre: 'Joaquín Jaén',
  slug: 'catering-jj-haciendas',
  ciudad: 'Sevilla',

  tagsIntro: [
    'Hacienda El Alba — 450 personas',
    'Hacienda Trinidad — 550 personas',
    'Hacienda El Triunfo',
    'Bodas · Empresas · Celebraciones',
    'Cocina central en Valencina',
  ],

  citas: [
    { cita: '', pain: 'Pases sin coordinación digital', detalle: 'Con 400 comensales en una hacienda, coordinar cocina central y sala con walkie o papel genera retrasos y errores en los momentos clave del servicio.', modulo: 'KDS por pases', color: C.gold },
    { cita: '', pain: 'Stock real tras el evento: desconocido', detalle: 'Al día siguiente de una boda de 450 personas nadie sabe exactamente qué géneros quedaron. El inventario real tarda días en cuadrarse.', modulo: 'Almacén en tiempo real', color: C.teal },
    { cita: '', pain: 'Personal de evento sin control de horas', detalle: 'Extras y fijos en el mismo evento, sin fichaje real. El coste de personal por celebración es siempre una estimación.', modulo: 'RRHH por evento', color: C.green },
    { cita: '', pain: 'Dos haciendas, dos mundos', detalle: 'Stock separado, personal que rota entre espacios, eventos simultáneos. Sin visión unificada, la gestión depende de llamadas y WhatsApps.', modulo: 'Panel centralizado', color: C.red },
  ],

  headline: 'El Alba 450p · Trinidad 550p · El Triunfo · Todo desde un panel',

  partidas: [
    { nombre: 'Cocina central', secciones: ['Fríos', 'Calientes', 'Postres'], color: C.red, icon: '🔥' },
    { nombre: 'Hacienda El Alba', secciones: ['Montaje', 'Pases', 'Barra'], color: C.gold, icon: '🏛️' },
    { nombre: 'Hacienda Trinidad', secciones: ['Montaje', 'Pases', 'Barra'], color: C.teal, icon: '🌿' },
  ],

  pasosFlujo: [
    { actor: 'Cocina central', accion: 'Prepara elaboraciones para evento de 400 personas', icon: '🔥', color: C.red },
    { actor: 'Logística', accion: 'Reparto a hacienda — stock descontado automáticamente', icon: '🚚', color: C.gold },
    { actor: 'Hacienda', accion: 'Recibe el material — confirma en ia.rest con un toque', icon: '🏛️', color: C.teal },
    { actor: 'Sala', accion: 'KDS organiza pases: mesa 1-10, 11-20... cocina coordinada', icon: '🍽️', color: C.green },
    { actor: 'Post-evento', accion: 'Cierre: mermas reales, horas personal, rentabilidad', icon: '📊', color: C.amber },
  ],

  sinKDSMensaje: 'Una pantalla KDS en cada hacienda. El jefe de sala ve el estado de cada pase en tiempo real y coordina con cocina central sin walkie ni gritos.',

  slideStockLabel: 'El coste oculto',
  mercaderiaAnual: '~200.000 €',
  desviacion1pct: '2.000 €',
  citaStock: 'En bodas de 400 personas, perder el control del stock entre cocina central y hacienda son miles de euros al año.',

  hoyVsIaRest: {
    hoy: [
      'Stock post-evento: días en cuadrarse',
      'Pases coordinados por walkie o voz',
      'Personal extras: horas estimadas, no reales',
      'Dos haciendas: gestión separada, sin visión unificada',
      'Rentabilidad por celebración: difícil de calcular',
    ],
    iaRest: [
      'Stock actualizado en tiempo real en las tres haciendas',
      'KDS por pases: todos los platos de una mesa salen juntos',
      'Fichaje real de extras por evento — coste exacto',
      'Panel único para El Alba, Trinidad y El Triunfo',
      'Rentabilidad real al cerrar cada celebración',
    ],
  },

  datosEstrategicos: [
    { titulo: 'KDS por pases en hacienda', desc: 'El KDS no es para restaurante diario — es perfectamente para eventos de 400 personas donde los pases marcan la diferencia entre un servicio fluido y un caos.' },
    { titulo: 'Stock centralizado tres haciendas', desc: 'Saber exactamente qué hay en cada hacienda y en cocina central antes, durante y después del evento elimina las sorpresas y las llamadas de última hora.' },
    { titulo: 'Personal de evento con fichaje real', desc: 'Extras y fijos fichando por QR. Sabes exactamente cuántas horas trabajó cada persona en cada celebración — el coste de personal deja de ser una estimación.' },
  ],

  objecionPrincipal: '"Para eventos ya tenemos nuestra forma de trabajar."',
  respuestaObjecion: 'Lo entiendo. Empezamos solo con el stock centralizado — lo que más duele hoy. El KDS y el personal lo añades cuando quieras, sin tocar nada de lo que ya funciona.',

  fasePiloto: [
    {
      fase: 'Semana 1-2',
      color: C.gold,
      items: [
        'Alta de las tres haciendas en ia.rest',
        'Stock inicial de El Alba + Trinidad',
        'Primer evento con control de stock en tiempo real',
      ],
    },
    {
      fase: 'Semana 3-4',
      color: C.teal,
      items: [
        'KDS configurado para pases en una hacienda',
        'Personal de evento con fichaje QR activo',
        'Cocina central conectada con las haciendas',
      ],
    },
    {
      fase: 'Mes 2',
      color: C.green,
      items: [
        'Panel unificado El Alba + Trinidad + El Triunfo',
        'Primer informe de rentabilidad real por evento',
        'Hacienda El Triunfo incorporada al sistema',
      ],
    },
  ],

  modulos: [
    {
      emoji: '🍽️',
      titulo: 'KDS por pases',
      color: C.gold,
      sub: '',
      ruta: '',
      desc: 'ia.rest organiza la cocina en tandas: mesas 1-10, mesas 11-20... Cada partida sabe qué preparar y cuándo. Cocina central y hacienda coordinadas sin walkie ni gritos.',
      ejemplos: [
        'Pase 1 — 80 entrantes: cocina fría + barra coordinadas en tiempo real',
        'Aviso automático cuando el pase está listo para salir a sala',
        'El jefe de sala ve el estado de cada pase desde su tablet',
      ],
      roi: 'Todos los platos de una mesa salen juntos y a tiempo, aunque sean 400 comensales.',
    },
    {
      emoji: '🏭',
      titulo: 'Stock centralizado tres haciendas',
      color: C.teal,
      sub: '',
      ruta: '',
      desc: 'Control de stock unificado para El Alba, Trinidad y El Triunfo. Sabes en todo momento qué hay en cada espacio sin llamadas ni hojas de Excel.',
      ejemplos: [
        'Transferencia de géneros de cocina central a hacienda — registrada automáticamente',
        'Stock actualizado en tiempo real durante y después del evento',
        'Mermas reales vs planificadas por celebración',
      ],
      roi: 'El inventario real al día siguiente del evento — sin días de espera para cuadrarlo.',
    },
    MODULO_RRHH({ roi: 'Extras y fijos fichando por QR. El coste real de personal por evento — no una estimación.' }),
    MODULO_EVENTOS({
      ejemplos: [
        'Semana de bodas en junio — planifica el stock de las tres haciendas con antelación',
        'Dos eventos simultáneos — reparto de personal y géneros entre espacios',
        'Temporada alta — previsión de compras para no quedarte sin producto',
      ],
      roi: 'Con tres haciendas y eventos simultáneos, la previsión lo cambia todo.',
    }),
  ],
}

export default function PropuestaCateringJJHaciendas() {
  return <PropuestaBase config={config} />
}
