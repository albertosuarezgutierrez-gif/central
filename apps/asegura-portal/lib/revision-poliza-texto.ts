/**
 * Textos de «Revisar mi póliza». Módulo SIN imports de Node: lo importa el componente cliente
 * (`RevisarPoliza.tsx`); `revision-poliza.ts` arrastra `node:crypto` y no puede ir al bundle del navegador.
 */
export const TEXTO_REVISION = {
  boton: 'Revisar mi póliza',
  revisando: 'Revisando…',
  titulo: 'Puntos que mirar',
  aviso: 'Orientativo, generado automáticamente. Tu corredor lo revisará contigo.',
  cta: '¿Lo vemos juntos?',
  ctaHecha: 'Ya lo hemos recibido, te contactaremos',
  sinPuntos: 'No hemos destacado ningún punto con lo que consta de esta póliza.',
  sinIa: 'La revisión automática no está disponible ahora mismo. Si quieres que la miremos juntos, dínoslo.',
  sinDatos:
    'De esta póliza consta muy poco (ni coberturas ni datos del seguro), así que no podemos revisarla bien. Si completas sus datos, o nos la enseñas, la miramos contigo.',
  tope: 'Hoy ya has hecho varias revisiones. Vuelve mañana o, si prefieres, lo vemos juntos.',
  ctaInvitacion: 'Si quieres, tu corredor lo revisa contigo.',
  error: 'No hemos podido revisarla ahora. Vuelve a intentarlo en un rato.',
} as const
