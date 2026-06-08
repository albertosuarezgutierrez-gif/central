'use client'
import PropuestaBase, { ClienteConfig, MODULO_RRHH, MODULO_EVENTOS } from '@/components/propuesta/PropuestaBase'

const C = { red:'#D9442B', gold:'#C9A84C', green:'#3F7D44', teal:'#2B6A6E', amber:'#E8A33B' }

const config: ClienteConfig = {
  nombre: 'Catering JJ — Catering externo',
  grupo: 'Catering Joaquín Jaén — Cocina central Valencina',
  emailContacto: 'alberto.suarez.gutierrez@gmail.com',
  contactoNombre: 'Joaquín Jaén',
  slug: 'catering-jj-catering',
  ciudad: 'Sevilla',

  tagsIntro: [
    'Cocina central — Valencina de la Concepción',
    'Catering externo corporativo y social',
    'Bodas, empresas, eventos al aire libre',
    'Producción centralizada + logística propia',
  ],

  citas: [
    { cita: '', pain: 'Escandallo por aforo: siempre desde cero', detalle: 'Cada petición de presupuesto implica recalcular géneros, personal y logística desde cero. Para 50 eventos al año, son semanas de trabajo no facturadas.', modulo: 'Escandallos automáticos', color: C.gold },
    { cita: '', pain: 'Presupuesto en horas, no en minutos', detalle: 'Calcular el coste real de un catering externo — géneros, personal, transporte, márgen — puede llevar medio día. El cliente espera respuesta rápida.', modulo: 'Presupuestador', color: C.teal },
    { cita: '', pain: 'Logística de producción sin trazabilidad', detalle: 'Qué salió de cocina central, qué llegó a destino, qué sobró. Sin registro, la rentabilidad real de cada servicio de catering es difícil de calcular.', modulo: 'Control producción', color: C.green },
    { cita: '', pain: 'Personal externo sin control de horas real', detalle: 'En catering externo el personal extra es la partida más variable. Sin fichaje real por servicio, el coste de personal es siempre una estimación.', modulo: 'RRHH por servicio', color: C.red },
  ],

  headline: 'Cocina central · Logística propia · Catering externo hasta 500p',

  partidas: [
    { nombre: 'Cocina central', secciones: ['Producción', 'Envasado', 'Logística'], color: C.red, icon: '🏭' },
    { nombre: 'Equipo en destino', secciones: ['Montaje', 'Servicio', 'Desmontaje'], color: C.gold, icon: '🚚' },
    { nombre: 'Barra externa', secciones: ['Bebidas', 'Cócteles', 'Cafés'], color: C.teal, icon: '🍹' },
  ],

  pasosFlujo: [
    { actor: 'Cliente', accion: 'Solicita presupuesto — 200 personas, menú degustación', icon: '📞', color: '#F6F1E7' },
    { actor: 'ia.rest', accion: 'Seleccionas el menú → calcula géneros + personal + transporte automáticamente', icon: '✦', color: C.red },
    { actor: 'Joaquín', accion: 'Revisa márgenes, ajusta y genera PDF de presupuesto en 2 minutos', icon: '📄', color: C.gold },
    { actor: 'Producción', accion: 'Evento confirmado → orden de compra al proveedor generada automáticamente', icon: '🛒', color: C.teal },
    { actor: 'Logística', accion: 'Día del servicio: producción marcada, reparto registrado', icon: '🚚', color: C.green },
    { actor: 'Cierre', accion: 'Rentabilidad real del servicio: géneros + personal + logística vs presupuestado', icon: '📊', color: C.amber },
  ],

  sinKDSMensaje: 'En catering externo no hay sala fija, pero el equipo en destino puede usar ia.rest desde el móvil para coordinar pases y registrar el servicio en tiempo real.',

  slideStockLabel: 'El coste real del catering',
  mercaderiaAnual: '~180.000 €',
  desviacion1pct: '1.800 €',
  citaStock: 'En producción centralizada para catering externo, saber exactamente qué salió y qué sobró vale miles de euros al año.',

  hoyVsIaRest: {
    hoy: [
      'Escandallo: recalcular a mano para cada aforo',
      'Presupuesto: horas de cálculo entre géneros, personal y logística',
      'Control de producción: difícil de trazar qué salió de cocina',
      'Personal externo: horas estimadas, no reales',
      'Rentabilidad por servicio: se calcula después, si se calcula',
    ],
    iaRest: [
      'Escandallo × aforo calculado en segundos',
      'Presupuesto completo con PDF en 2 minutos',
      'Trazabilidad de producción desde cocina central hasta destino',
      'Personal extra fichando por QR — coste real por servicio',
      'Rentabilidad real al cerrar cada servicio de catering',
    ],
  },

  datosEstrategicos: [
    { titulo: 'Presupuestador en 2 minutos', desc: 'Introduce el menú, el aforo y el personal necesario. ia.rest calcula el coste exacto y genera el PDF para el cliente. El que responde antes se lleva el evento.' },
    { titulo: 'Trazabilidad de producción', desc: 'Qué salió de cocina central, qué llegó a destino, qué sobró. El registro automático convierte la rentabilidad real de cada catering en un dato, no en una intuición.' },
    { titulo: 'Personal externo con coste real', desc: 'Extras fichando por QR en el servicio. Al cerrar el evento, el coste de personal es exacto — no estimado.' },
  ],

  objecionPrincipal: '"El catering tiene mucha variabilidad. No sé si un sistema encaja."',
  respuestaObjecion: 'La variabilidad es exactamente el problema que resuelve. Empezamos solo con el presupuestador — el que más tiempo te ahorra — y ves si encaja con tu forma de trabajar.',

  fasePiloto: [
    {
      fase: 'Semana 1-2',
      color: C.gold,
      items: [
        'Alta de tus menús de catering en ia.rest',
        'Configuración de tus márgenes y tarifas de personal',
        'Primer presupuesto real generado con ia.rest',
      ],
    },
    {
      fase: 'Semana 3-4',
      color: C.teal,
      items: [
        'Proveedores habituales conectados',
        'Primer servicio con control de producción activo',
        'Personal externo con fichaje QR',
      ],
    },
    {
      fase: 'Mes 2',
      color: C.green,
      items: [
        'Trazabilidad completa cocina central → destino',
        'Primer informe de rentabilidad real por servicio',
        'Integración con gestión de haciendas si aplica',
      ],
    },
  ],

  modulos: [
    {
      emoji: '📋',
      titulo: 'Escandallos por evento',
      color: C.gold,
      sub: '',
      ruta: '',
      desc: 'Crea el escandallo de cada menú una vez. ia.rest multiplica automáticamente por el aforo y genera la lista de compra completa del servicio al instante.',
      ejemplos: [
        'Menú degustación 200 personas → lista de compra en 5 segundos',
        'Cambio de aforo → todos los géneros se recalculan solos',
        'Coste por comensal en tiempo real antes de dar precio',
      ],
      roi: 'Para 50 servicios al año, el presupuestador recupera semanas de trabajo.',
    },
    {
      emoji: '💶',
      titulo: 'Presupuestador con margen real',
      color: C.teal,
      sub: '',
      ruta: '',
      desc: 'Géneros + personal + transporte + margen objetivo = presupuesto PDF listo para el cliente en 2 minutos. Sabes exactamente cuánto ganas antes de confirmar el servicio.',
      ejemplos: [
        'Comparativa de márgenes por tipo de menú',
        'Ajuste de precio por aforo con un deslizador',
        'PDF de presupuesto con tu marca listo para enviar',
      ],
      roi: 'El que responde antes con un presupuesto serio se lleva el evento.',
    },
    MODULO_RRHH({ roi: 'Personal externo fichando por QR en cada servicio. El coste de personal por catering — exacto, no estimado.' }),
    MODULO_EVENTOS({
      ejemplos: [
        'Temporada bodas — planifica compras de cocina central con 3 semanas de antelación',
        'Varios servicios simultáneos — reparto de personal y producción entre equipos',
        'Histórico de rentabilidad por tipo de evento: corporativo vs bodas vs celebraciones',
      ],
      roi: 'Con producción centralizada y servicios simultáneos, la previsión lo cambia todo.',
    }),
  ],
}

export default function PropuestaCateringJJCatering() {
  return <PropuestaBase config={config} />
}
