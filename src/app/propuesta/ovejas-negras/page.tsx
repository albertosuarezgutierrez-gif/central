'use client'
import PropuestaBase, {
  ClienteConfig,
  MODULO_ASISTENTE_COCINA,
  MODULO_ANALISIS_CARTA,
  MODULO_RECEPCION,
  MODULO_VINOS,
  MODULO_EVENTOS,
  MODULO_RRHH,
} from '@/components/propuesta/PropuestaBase'

const C = { red:'#D9442B', gold:'#C9A84C', green:'#3F7D44', teal:'#2B6A6E', amber:'#E8A33B' }

const config: ClienteConfig = {
  nombre: 'Ovejas Negras',
  grupo: 'Ovejas Negras · Batuta · Serendipia · Eslava',
  emailContacto: 'alberto.suarez.gutierrez@gmail.com',
  contactoNombre: 'Ricardo Fernández',
  fechaReunion: '20 de mayo de 2026',
  lugarReunion: 'Espacio Eslava',
  tagsIntro: ['50 restaurantes', '8M€ en mercadería', '1.000 albaranes/mes', 'Alta rotación de personal'],
  citas: [
    { cita: '"No sabemos dónde va el solomillo de cerdo."', modulo: 'Asistente IA cocina', color: C.teal },
    { cita: '"Una desviación del 1% en 8 millones. La dejancia pura."', modulo: 'Recepción mercancía', color: C.green },
    { cita: '"Compramos y compramos sin saber qué sale."', modulo: 'Análisis de carta', color: C.gold },
    { cita: '"Eslava tiene una bodega que nadie vende."', modulo: 'Bodega inteligente', color: '#8B4E9E' },
    { cita: '"Me cuesta creer que un sistema lo haga todo bien."', modulo: 'La integración', color: C.red },
  ],
  headline: '50 mesas · 5 zonas · 3 partidas · 14 camareros',
  partidas: [
    { nombre:'Cocina caliente', secciones:['Principales','Entrantes calientes'], color:'#D9442B', icon:'🔥' },
    { nombre:'Cocina fría', secciones:['Ensaladas','Entrantes fríos','Postres'], color:C.teal, icon:'❄️' },
    { nombre:'Barra', secciones:['Bebidas','Cafés','Copas'], color:C.gold, icon:'🍺' },
  ],
  pasosFlujo: [
    { actor:'Camarero', accion:'Dice la comanda por voz en sala', icon:'🎙️', color:'#F6F1E7' },
    { actor:'ia.rest', accion:'Detecta qué va a cada partida automáticamente', icon:'✦', color:C.red },
    { actor:'Cocina caliente', accion:'Ve solo sus platos en su pantalla (vista Producción)', icon:'🔥', color:'#D9442B' },
    { actor:'Barra', accion:'Ve solo sus bebidas simultáneamente', icon:'🍺', color:C.gold },
    { actor:'Jefe de cocina', accion:'Pregunta al asistente IA: "¿Cuántos solomillos pendientes?"', icon:'✦', color:C.teal },
    { actor:'Marcha', accion:'Todo listo → imprime ticket de pase automático', icon:'🖨️', color:C.green },
  ],
  sinKDSMensaje: 'Para los locales que todavía van a papel: una impresora térmica por partida (desde 80€) recibe el ticket automáticamente. El papel desaparece solo.',
  slideStockLabel: 'Los 8M€',
  mercaderiaAnual: '8.000.000 €',
  desviacion1pct: '80.000 €',
  citaStock: 'La dejancia pura.',
  hoyVsIaRest: {
    hoy: ['Recepción manual sin cruce vs pedido', 'Caducidades a ojo', '€0,30 por albarán', 'Sin historial de precios', 'Mermas no registradas'],
    iaRest: ['Lista pre-cargada desde pedido', 'Caducidad extraída de etiqueta', '€0 por albarán incluido', 'Detecta subidas de precio', 'Mermas registradas por proveedor'],
  },
  datosEstrategicos: [
    { titulo:'Central de compras', desc:'2% sobre 8M€ en volumen = 160.000€/año para el grupo.' },
    { titulo:'Inteligencia de precios', desc:'Detección temprana de subidas. "Tu restaurante paga 23% más de jamón que la media del grupo."' },
    { titulo:'Benchmarking sectorial', desc:'Datos agregados de todos tus locales. Nadie en el sector tiene esto.' },
  ],
  modulos: [
    MODULO_ASISTENTE_COCINA({ roi:'Con 3 partidas y 14 camareros, el jefe no puede estar en todos lados. La IA coordina.' }),
    MODULO_ANALISIS_CARTA(),
    MODULO_RECEPCION({ roi:'1.000 albaranes/mes × €0,30 = €300 por restaurante. En 50 locales: €15.000/mes ahorrados.' }),
    MODULO_VINOS({ sub:'La bodega de Eslava que nadie vende, vendida.', roi:'El camarero no necesita saber de vinos. ia.rest sabe por él.' }),
    MODULO_EVENTOS({ ejemplos:['Feria de Abril en 4 días — vendisteis 40% más cerveza','Semana Santa — refuerza la terraza','Calor extremo mañana — prepara bebidas frías'] }),
    MODULO_RRHH({ roi:'50 restaurantes. Un panel. Criterios homogéneos para todo el grupo.' }),
  ],
  objecionPrincipal: '"Me cuesta creer que un sistema aúne todo Y que todo esté bien hecho."',
  respuestaObjecion: 'No somos mejor que cada especialista. Somos lo que ninguno puede darte solo: la integración.',
  fasePiloto: [
    { fase:'Semana 1-2', color:C.red, items:['Configuración local piloto','Comandas por voz + KDS','OCR albaranes','Recepción mercancía'] },
    { fase:'Semana 2-4', color:C.amber, items:['Análisis de carta real','Asistente IA cocina','Vinos maridaje IA','Alertas stock'] },
    { fase:'Mes 2+', color:C.green, items:['RRHH grupo centralizado','Previsión por eventos','Central de compras','Benchmarking locales'] },
  ],
}

export default function PropuestaOvejasNegras() {
  return <PropuestaBase config={config} />
}
