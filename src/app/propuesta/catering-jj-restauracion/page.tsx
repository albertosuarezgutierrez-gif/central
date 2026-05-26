'use client'
import PropuestaBase, { ClienteConfig, MODULO_RRHH } from '@/components/propuesta/PropuestaBase'

const C = { red:'#D9442B', gold:'#C9A84C', green:'#3F7D44', teal:'#2B6A6E', amber:'#E8A33B' }

const config: ClienteConfig = {
  nombre: 'Catering JJ — Restaurantes',
  grupo: 'Restaurante Doble J · Asador Las Dos Jotas (Bormujos)',
  emailContacto: 'alberto.suarez.gutierrez@gmail.com',
  contactoNombre: 'Joaquín Jaén',
  slug: 'catering-jj-restauracion',
  ciudad: 'Sevilla',

  tagsIntro: [
    'Restaurante Doble J — Sevilla',
    'Asador Las Dos Jotas — Bormujos',
    'Sala + Barra + Terraza',
    'Carta de asados y parrilla',
  ],

  citas: [
    { cita: '', pain: 'Dos restaurantes, dos gestiones separadas', detalle: 'Doble J y Las Dos Jotas funcionan como islas. Sin visibilidad cruzada de ventas, carta o personal, tomar decisiones para los dos locales a la vez es complicado.', modulo: 'Panel multi-local', color: C.teal },
    { cita: '', pain: 'Carta actualizada a mano en cada local', detalle: 'Un cambio de precio o un plato nuevo requiere actualizar dos sistemas distintos. Errores de desincronización en carta o precios.', modulo: 'Carta centralizada', color: C.gold },
    { cita: '', pain: 'Sin análisis de qué vende más en cada local', detalle: 'Saber qué platos son más rentables en Doble J vs Las Dos Jotas requiere horas exportando y cruzando datos de dos sistemas.', modulo: 'Analytics por local', color: C.green },
    { cita: '', pain: 'Comandas por voz: la diferencia en velocidad', detalle: 'En hora punta, dictar la comanda en lugar de teclear reduce el tiempo por mesa a la mitad y libera al camarero para atender más mesas.', modulo: 'Voz + Brain', color: C.red },
  ],

  headline: 'Doble J (Sevilla) · Las Dos Jotas (Bormujos) · Gestión unificada',

  partidas: [
    { nombre: 'Cocina', secciones: ['Parrilla', 'Fríos', 'Postres'], color: C.red, icon: '🔥' },
    { nombre: 'Sala', secciones: ['Terraza', 'Interior', 'Privado'], color: C.gold, icon: '🪑' },
    { nombre: 'Barra', secciones: ['Bebidas', 'Cafés', 'Chupitos'], color: C.teal, icon: '🍺' },
  ],

  pasosFlujo: [
    { actor: 'Camarero', accion: 'Dicta la comanda por voz — "mesa 4, dos chuletones y una ensalada"', icon: '🎙️', color: C.red },
    { actor: 'ia.rest', accion: 'Comanda interpretada y enviada a cocina en menos de 1 segundo', icon: '✦', color: C.gold },
    { actor: 'Cocina', accion: 'KDS muestra la comanda por partida — sin ticket de papel', icon: '🔥', color: C.teal },
    { actor: 'Owner', accion: 'Ve ventas de Doble J y Las Dos Jotas en tiempo real desde el móvil', icon: '📊', color: C.green },
  ],

  sinKDSMensaje: 'Si algún local no tiene pantalla, una impresora por partida (desde 80€) recibe automáticamente todas las comandas — sin cambiar nada del flujo actual.',

  slideStockLabel: 'El coste oculto',
  mercaderiaAnual: '~150.000 €',
  desviacion1pct: '1.500 €',
  citaStock: 'Con dos restaurantes y producto fresco de parrilla, el control de mermas en asados vale dinero real.',

  hoyVsIaRest: {
    hoy: [
      'Dos sistemas distintos para dos restaurantes',
      'Carta actualizada por separado en cada local',
      'Análisis de ventas: exportar + cruzar datos a mano',
      'Comanda tradicional: tiempo de tecleo por mesa',
      'Personal: gestión separada por local',
    ],
    iaRest: [
      'Un panel para Doble J y Las Dos Jotas',
      'Cambio de carta → se actualiza en los dos locales a la vez',
      'Analytics de ventas por local en tiempo real',
      'Voz: comanda completa en menos de 1 segundo',
      'Personal: visibilidad de los dos locales desde un solo acceso',
    ],
  },

  datosEstrategicos: [
    { titulo: 'Voz en sala — la diferencia real', desc: 'Un camarero que dicta en lugar de teclear atiende más mesas por turno. En dos restaurantes con terraza, eso se nota en el ticket medio.' },
    { titulo: 'Carta centralizada dos locales', desc: 'Un cambio de precio o producto nuevo en ambos restaurantes desde un solo panel. Sin errores de desincronización.' },
    { titulo: 'Analytics multi-local real', desc: 'Ver en tiempo real qué vende más Doble J vs Las Dos Jotas, sin Excel, desde el móvil.' },
  ],

  objecionPrincipal: '"Ya tenemos un TPV que funciona."',
  respuestaObjecion: 'Normal. La diferencia es la voz y el panel multi-local. Empezamos por Las Dos Jotas — el que tiene menos riesgo — y lo comparas con lo que tienes hoy.',

  fasePiloto: [
    {
      fase: 'Semana 1',
      color: C.gold,
      items: [
        'Alta de carta y mesas de Las Dos Jotas',
        'Camareros formados en menos de 30 minutos',
        'Primer servicio completo con voz',
      ],
    },
    {
      fase: 'Semana 2-3',
      color: C.teal,
      items: [
        'KDS configurado por partidas en cocina',
        'Analytics de ventas activo',
        'Incorporación de Restaurante Doble J',
      ],
    },
    {
      fase: 'Mes 2',
      color: C.green,
      items: [
        'Panel unificado Doble J + Las Dos Jotas',
        'Control de stock y mermas activo',
        'Informe comparativo de rentabilidad por local',
      ],
    },
  ],

  modulos: [
    {
      icon: '🎙️',
      titulo: 'Voz + Brain',
      color: C.red,
      desc: 'El camarero habla — "mesa 4, dos chuletones, uno sin sal, y una botella de Ribera" — y la comanda llega a cocina en menos de un segundo. Sin tocar pantalla.',
      ejemplos: [
        'Modificadores: sin, con, aparte, para llevar, al punto...',
        'Funciona con acento sevillano, en sala ruidosa y en terraza',
        'En hora punta: de 2 minutos a 15 segundos por mesa',
      ],
      roi: 'Más mesas atendidas por camarero en el mismo turno.',
    },
    {
      icon: '📊',
      titulo: 'Analytics multi-local',
      color: C.teal,
      desc: 'Ventas en tiempo real de Doble J y Las Dos Jotas desde el móvil. Qué platos venden más en cada local, en qué franja horaria, con qué ticket medio.',
      ejemplos: [
        'Top 10 platos más vendidos por local esta semana',
        'Comparativa ticket medio Doble J vs Las Dos Jotas',
        'Horas punta reales para ajustar el cuadro de personal',
      ],
      roi: 'Decisiones de carta basadas en datos reales, no en sensaciones.',
    },
    MODULO_RRHH({ roi: 'Gestión de personal unificada para los dos restaurantes. Turnos, fichajes y costes desde un panel.' }),
  ],
}

export default function PropuestaCateringJJRestauracion() {
  return <PropuestaBase config={config} />
}
