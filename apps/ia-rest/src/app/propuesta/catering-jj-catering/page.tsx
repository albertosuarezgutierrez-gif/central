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

  objecionPrincipal: '"La cocina central ya tiene su sistema, y el catering tiene mucha variabilidad."',
  respuestaObjecion: 'El sistema de cocina no se toca: nos conectamos a él. Empezamos por el comercial y el presupuesto self-service del cliente, que es lo que más eventos cierra, y la variabilidad —que es justo lo que un sistema ordena— la vas viendo encajar.',

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
      emoji: '🎯',
      titulo: 'Comercial y comisiones',
      color: C.red,
      sub: 'CRM de eventos + incentivos del equipo',
      ruta: '',
      desc: 'Cada comercial con su pipeline de eventos. ia.rest calcula su comisión y su ranking automáticamente: bono por margen, por ticket más alto y por reseñas, con el % escalable de su contrato.',
      ejemplos: [
        'Ranking del equipo en tiempo real: quién vende con más margen',
        'Bono automático por ticket más caro y por reseñas del cliente',
        'Contrato con % escalable: sube solo al alcanzar objetivos',
      ],
      roi: 'El equipo se autogestiona y ves quién aporta — sin cuadrar comisiones a mano.',
    },
    {
      emoji: '💍',
      titulo: 'Presupuesto self-service del cliente',
      color: C.amber,
      sub: 'El cliente configura su evento y reserva',
      ruta: 'En desarrollo',
      desc: 'Una URL donde el cliente final monta su evento —aforo, días, menú con tu margen ya incorporado— y reserva con paga y señal. El comercial recibe el lead ya cualificado.',
      ejemplos: [
        'El cliente elige entre opciones de menú con tu margen objetivo',
        'Multi-tarificador: el precio se ajusta solo al aforo y al tipo de evento',
        'Cobro online con señal — el evento entra directo en la agenda',
      ],
      roi: 'Cualificas y cierras eventos fuera de horario. El comercial llega con el trabajo medio hecho.',
    },
    {
      emoji: '📋',
      titulo: 'Escandallos conectados',
      color: C.gold,
      sub: '',
      ruta: '',
      desc: 'Tu sistema de cocina se queda como está: ia.rest se conecta a él. El escandallo de cada menú se multiplica por el aforo y alimenta el presupuesto y la lista de compra — sin reescribir lo que ya tienes cargado.',
      ejemplos: [
        'El escandallo que ya haces, enlazado al presupuesto y a la compra',
        'Cambio de aforo → todos los géneros se recalculan solos',
        'Coste por comensal en tiempo real antes de dar precio',
      ],
      roi: 'Cero doble trabajo: lo de cocina no se reemplaza, se aprovecha en presupuesto y compra.',
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
