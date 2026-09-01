// lib/sivra/mensajes-prog/ciclo.ts — el ciclo de mensajes EN CRISTIANO, para enseñárselo a Alberto.
//
// Existe para que el panel de /apartamentos pueda decir qué manda el sistema y cuándo sin que nadie
// tenga que abrir `decidir.ts`. Es una DESCRIPCIÓN, no la lógica: las ventanas de verdad viven en
// `mensajesDebidos()` y no se duplican aquí como números que puedan divergir — aquí van en el
// lenguaje del dueño («la víspera, por la mañana»), que es lo que se lee de un vistazo.
//
// 🚨 Lo vigila `ciclo.test.ts`: la lista tiene que cubrir EXACTAMENTE los `TIPOS_MENSAJE`. Si mañana
// se añade un hito y no se describe aquí, el panel lo omitiría en silencio y Alberto creería que el
// sistema manda seis cosas cuando manda siete. Un resumen incompleto miente igual que un dato falso.

import type { TipoMensaje } from './plantillas.ts'

export type PasoCiclo = {
  tipo: TipoMensaje
  titulo: string
  cuando: string
  /** Qué lleva dentro. Lo que a Alberto le importa es si van los códigos o no. */
  contenido: string
  /** true = ese mensaje entrega códigos de acceso. */
  conCodigos?: boolean
}

export const CICLO: PasoCiclo[] = [
  {
    tipo: 'confirmacion',
    titulo: 'Confirmación',
    cuando: 'En cuanto entra la reserva',
    contenido: 'Gracias por reservar, fechas y personas, enlace del check-in obligatorio y opciones de parking. Pregunta la hora de llegada.',
  },
  {
    tipo: 'acceso',
    titulo: 'Cómo llegar',
    cuando: '7 días antes, desde las 09:00',
    contenido: 'Dirección exacta y los pasos para entrar, con las fotos. SIN códigos todavía.',
  },
  {
    tipo: 'vispera_llegada',
    titulo: 'Víspera de la llegada',
    cuando: 'El día antes, desde las 09:00',
    contenido: 'El mensaje importante: los pasos otra vez Y los CÓDIGOS. Manda el PIN de esa reserva si la cerradura lo tiene; si no, el código maestro.',
    conCodigos: true,
  },
  {
    tipo: 'bienvenida',
    titulo: 'Bienvenida',
    cuando: 'El día de llegada, desde las 08:00',
    contenido: 'Wifi, básicos de la casa y a quién escribir. Solo si la víspera salió ayer — dos mensajes el mismo día serían la ristra de Smoobu.',
  },
  {
    tipo: 'estancia',
    titulo: 'Mitad de estancia',
    cuando: 'Al día siguiente de llegar, desde las 10:30',
    contenido: '«¿Todo bien?». SOLO en estancias de 3 noches o más: en una de dos noches sería preguntar el día de la salida.',
  },
  {
    tipo: 'vispera_salida',
    titulo: 'Víspera de la salida',
    cuando: 'El día antes de salir, desde las 17:00',
    contenido: 'Hora del check-out, dónde dejar las llaves y —solo si el piso queda libre— la oferta de salida tardía. Smoobu no tenía este mensaje.',
  },
  {
    tipo: 'post_salida',
    titulo: 'Después de salir',
    cuando: 'El día de la salida desde las 12:00',
    contenido: 'Gracias y petición de reseña. Nada de códigos ni de dinero.',
  },
]

/** Los hitos que entregan códigos. Es lo que hay que mirar si se cambia una cerradura. */
export const PASOS_CON_CODIGOS = CICLO.filter(p => p.conCodigos).map(p => p.tipo)
