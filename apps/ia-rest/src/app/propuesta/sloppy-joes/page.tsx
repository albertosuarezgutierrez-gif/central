'use client'
import PropuestaBase, {
  ClienteConfig,
  MODULO_ASISTENTE_COCINA,
  MODULO_ANALISIS_CARTA,
  MODULO_RECEPCION,
  MODULO_EVENTOS,
  MODULO_RRHH,
  MODULO_DELIVERY,
  MODULO_STOREFRONT,
} from '@/components/propuesta/PropuestaBase'

const C = { red:'#D9442B', gold:'#C9A84C', green:'#3F7D44', teal:'#2B6A6E', amber:'#E8A33B' }

const config: ClienteConfig = {
  nombre: 'Sloppy Joe\'s',
  grupo: 'Sloppy Joe\'s — 6 locales en Sevilla',
  emailContacto: 'alberto.suarez.gutierrez@gmail.com',
  contactoNombre: 'Sloppy Joe\'s',
  slug: 'sloppy-joes',
  ciudad: 'Sevilla',
  tagsIntro: ['6 locales en Sevilla', 'Delivery Glovo + UberEats', '€294/mes Deliverect', '€540/mes Ágora', 'Alta rotación de personal'],

  citas: [
    { cita: '', pain: 'Una tablet extra por local solo para delivery', detalle: 'Gestionar Glovo y UberEats desde dispositivos separados al POS multiplica los errores y la carga operativa en cada turno.', modulo: 'Delivery integrado en cocina', color: '#E84E0F' },
    { cita: '', pain: 'El 30% de cada pedido online va a la plataforma', detalle: 'Con Deliverect encima, el coste real de cada pedido online ronda el 35-38%. La tienda propia elimina esa comisión.', modulo: 'Tienda propia sin comisión', color: C.green },
    { cita: '', pain: 'Sin visibilidad de qué vende cada local', detalle: 'Con 6 locales y sistemas distintos, saber qué referencias son rentables en cada punto es imposible sin horas de Excel.', modulo: 'Análisis de carta multi-local', color: C.gold },
    { cita: '', pain: 'RRHH sin criterios comunes entre locales', detalle: 'La rotación de personal en multi-local sin centralización genera inconsistencias de servicio y coste de formación repetido.', modulo: 'RRHH centralizado', color: C.teal },
  ],

  headline: '6 locales · Delivery + Sala · Ágora + Deliverect + Glovo',
  partidas: [
    { nombre:'Cocina', secciones:['Platos calientes','Entrantes','Postres'], color:'#D9442B', icon:'🔥' },
    { nombre:'Barra', secciones:['Bebidas','Cafés','Cocktails'], color:C.gold, icon:'🍺' },
    { nombre:'Delivery', secciones:['Glovo','UberEats','Tienda propia'], color:'#E84E0F', icon:'🛵' },
  ],
  pasosFlujo: [
    { actor:'Cliente', accion:'Pide en Glovo, UberEats o tu tienda propia', icon:'📱', color:'#F6F1E7' },
    { actor:'ia.rest', accion:'Recibe el pedido y lo envía automáticamente al KDS', icon:'✦', color:C.red },
    { actor:'Cocina', accion:'Ve el pedido delivery igual que uno de sala — sin tablet extra', icon:'🔥', color:'#D9442B' },
    { actor:'Barra', accion:'Prepara bebidas en paralelo', icon:'🍺', color:C.gold },
    { actor:'Repartidor', accion:'El pedido está listo — tiempo estimado calculado automáticamente', icon:'🛵', color:'#E84E0F' },
    { actor:'Owner', accion:'Ve rentabilidad por canal: sala vs Glovo vs tienda propia', icon:'📊', color:C.green },
  ],
  sinKDSMensaje: 'Si algún local no tiene pantalla KDS, una impresora por partida (desde 80€) recibe automáticamente todos los pedidos — sala y delivery — sin tablet adicional.',

  slideStockLabel: 'El coste oculto',
  mercaderiaAnual: '~1.200.000 €',
  desviacion1pct: '12.000 €',
  citaStock: 'Deliverect €294/mes + Ágora €540/mes. Casi 900€ al mes en software.',
  hoyVsIaRest: {
    hoy: ['Deliverect: €294/mes por los 6 locales', 'Glovo: 30% de comisión por pedido', 'Tablet extra en cada local solo para delivery', 'Sin visibilidad de rentabilidad por canal', 'Sin análisis de qué se vende más en cada local'],
    iaRest: ['Delivery integrado: €0 extra', 'Tu tienda propia sin comisión', 'Todo en la misma pantalla: sala + delivery', 'Rentabilidad por canal en tiempo real', 'Análisis de carta con datos reales de todos los locales', '📊 Contabilidad: 303 calculado + fichero A3 para la asesoría', '🏪 Central de almacén: stock de los 6 locales en un panel'],
  },
  datosEstrategicos: [
    { titulo:'Eliminar Deliverect', desc:'€294/mes que dejan de pagar. ia.rest integra Glovo y UberEats directamente.' },
    { titulo:'Tienda propia sin comisión', desc:'Cada pedido que viene por tu web o Instagram en lugar de Glovo ahorra el 30% de comisión.' },
    { titulo:'Datos de los 6 locales agregados', desc:'"El local de Triana vende 3 veces más de X que el de la Alameda. ¿Por qué?" Ahora lo sabrás.' },
    { titulo:'Contabilidad: el 303 sin hacer nada', desc:'Al final de cada trimestre, el contable recibe el fichero A3 con los asientos listos y las casillas del 303 calculadas. Sin exportar. Sin llamar a nadie.' },
    { titulo:'Central de almacén para los 6 locales', desc:'Un panel donde el encargado de compras ve el stock crítico de todos los locales a la vez. Si 3 locales necesitan lo mismo, un solo pedido al proveedor — mejor precio.' },
  ],

  modulos: [
    MODULO_DELIVERY({
      ejemplos: ['Pedido Glovo → KDS en < 1 segundo, sin tablet extra', 'UberEats + Glovo + tienda propia en un solo panel', 'Control de tiempos de entrega por canal'],
      roi: 'Elimina la tablet de Deliverect y sus €294/mes. Todo en ia.rest.',
    }),
    MODULO_STOREFRONT({
      ejemplos: ['Enlace desde tu Instagram → pedido directo sin comisión', 'Delivery y recogida en el mismo panel', 'Glovo cobra 30% — tu tienda cobra 0%'],
      roi: 'Cada pedido que viene por tu web en lugar de Glovo te ahorra el 30% de comisión.',
    }),
    MODULO_ANALISIS_CARTA({
      desc: 'Clasifica cada plato en los 6 locales. ¿El mismo plato funciona diferente en Triana que en la Alameda? Ahora lo sabes.',
      roi: 'Toma decisiones de carta con datos reales de los 6 locales, no intuición.',
    }),
    MODULO_ASISTENTE_COCINA(),
    MODULO_RECEPCION({ roi: 'Elimina el papel en recepción de mercancía. Stock actualizado en 30 segundos.' }),
    MODULO_RRHH({ roi: '6 locales. Un panel. Criterios homogéneos. Sin papeles ni WhatsApps de CVs.' }),
    MODULO_EVENTOS({
      ejemplos: ['Partido Betis en casa — refuerza barra en los 3 locales más cercanos', 'Feria de Abril — pedidos delivery se disparan 60%', 'Calor extremo — prepara bebidas frías en todos los locales'],
      roi: 'Con 6 locales en Sevilla, anticipar picos de demanda marca la diferencia.',
    }),
  ],

  objecionPrincipal: '"Ya tenemos Deliverect y Ágora. ¿Para qué cambiar?"',
  respuestaObjecion: 'Deliverect hace una cosa: enrutar pedidos. ia.rest hace eso y además: análisis de carta, stock, RRHH, previsión, voz en cocina. Y te ahorras los €294/mes.',

  fasePiloto: [
    { fase:'Semana 1-2', color:C.red, items:['Un local piloto configurado','Delivery integrado operativo','KDS sala + delivery unificado','Sin tablet Deliverect en ese local'] },
    { fase:'Semana 2-4', color:C.amber, items:['Análisis de carta con datos reales','Tienda propia activa','Rentabilidad por canal visible','Asistente IA cocina','Contabilidad: cierre diario + 303'] },
    { fase:'Mes 2+', color:C.green, items:['Los 6 locales integrados','Central de almacén activa → pedido grupal','RRHH centralizado','Portal asesoría para el contable','Previsión por eventos','Benchmarking entre locales'] },
  ],
  precioMensaje: 'Ahorro vs Deliverect: €294/mes que desaparecen desde el primer mes.',
}

export default function PropuestaSloppyJoes() {
  return <PropuestaBase config={config} />
}
