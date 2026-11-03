// «Cómo funciona» de cada herramienta del portal (28/10/2026): el manual corto que se abre desde la tarjeta de
// «Herramientas» y desde la cabecera de cada herramienta. Contenido PURO (sin BD ni red), junto al catálogo.
//
// 🚨 Cada frase es una afirmación sobre lo que hace la pantalla HOY. Si cambia la pantalla, cambia el manual en el mismo PR.
//   · No se inventan funciones: lo que no está en el código no se promete aquí.
//   · Quién ve qué: el acceso a una herramienta lo AUTORIZA la correduría (`TEXTO_SOLICITUD_MODULO`); el resto de
//     afirmaciones salen de `apps/asegura-portal/CLAUDE.md` (señales de patrimonio, jefe de flota, Portal del Empleado).
//   · El cepo `manuales.test.ts` falla si un módulo del catálogo se queda sin manual (o con uno vacío).
//
// Se escribe «Grupo ASegura» (A y S mayúsculas).

import { MODULOS_PORTAL, esModuloPortal, type ModuloPortal } from './modulos.ts'

export type ManualModulo = {
  modulo: ModuloPortal
  /** El titular de la página («Patrimonio y alquileres»). */
  titulo: string
  /** Qué es, en una o dos frases. */
  queEs: string
  /** Cómo empezar: pasos cortos, en orden. */
  empezar: readonly string[]
  /** Cómo se trabaja ELEMENTO a elemento (por inmueble, por vehículo…). `null` si la herramienta no trabaja por elementos aquí. */
  porElemento: { titulo: string; pasos: readonly string[] } | null
  /** Lo que ve la correduría. */
  correduriaVe: readonly string[]
  /** Lo que la correduría NO ve (o no hace). */
  correduriaNoVe: readonly string[]
}

export const MANUALES_MODULOS: Record<ModuloPortal, ManualModulo> = {
  alquileres: {
    modulo: 'alquileres',
    titulo: 'Patrimonio y alquileres',
    queEs:
      'Tus pisos, locales y edificios en un solo sitio: qué seguro tiene cada uno, sus contratos de alquiler e inquilinos, ' +
      'los gastos fijos, los documentos y las fechas que no se pueden pasar (IBI, comunidad, caldera…). ' +
      'Es gratis y el acceso lo autoriza Grupo ASegura; no hace falta tener seguros con nosotros.',
    empezar: [
      'Entra en Herramientas y pulsa «Abrir» en Patrimonio y alquileres. Si aún no lo tienes, pulsa «Solicitar»: tu corredor de Grupo ASegura lo revisa y te da acceso a mano.',
      'Da de alta tu primer inmueble con «Añadir inmueble». Pon primero el código postal: la provincia se rellena sola, eliges el municipio y la calle se autocompleta con el callejero del Catastro.',
      'Si tienes muchos, no los metas uno a uno: «Cargar todo de una vez» o «Importar desde Excel» (aparecen si tu acceso permite dar altas).',
      'Cuando tengas inmuebles, mira en cada uno qué seguro lo cubre. Si tienes una póliza de hogar o comunidad sin inmueble, la pantalla te lo avisa en «Pólizas sin inmueble» para que la enlaces.',
      'Si alguien te ha dado acceso a su patrimonio, lo verás en la misma pantalla, separado por titular y con una etiqueta que dice si el acceso es «de gestión» o «total».',
    ],
    porElemento: {
      titulo: 'Trabajar piso a piso',
      pasos: [
        'Entra en un inmueble desde la lista. Cada uno tiene su propia ficha, y lo que apuntas ahí queda solo en ese piso.',
        'Seguros: qué pólizas lo cubren, tuyas con nosotros o de otra compañía que hayas apuntado. Si algo no consta, la ficha dice «No consta»; nunca lo da por cero.',
        'Contratos: anota cada alquiler con su renta y sus fechas. Desde el contrato puedes crear un enlace para el inquilino: es de un solo uso, caduca a los 14 días y lo copias o compartes tú; la correduría no lo envía.',
        'Inquilino: con ese enlace solo ve su contrato, los recibos que tú marques y lo que suba él. No ve nada más de tu patrimonio.',
        'Gastos de este piso: gastos fijos, comunidad y derramas. Los de todos tus pisos juntos están en «Gastos de todos los pisos».',
        'Recordatorios y obligaciones: las fechas de cada piso aparecen en el Calendario y te avisan desde la campana.',
        'Documentos: guarda en la ficha del inmueble lo que necesites tener a mano.',
        'Edificio: si el uso es «edificio», puedes añadirle unidades; cada unidad hereda la responsabilidad civil del edificio. En «Rentabilidad» ves el edificio y cada unidad.',
      ],
    },
    correduriaVe: [
      'Que has pedido la herramienta y, cuando la activa, el acceso que te autoriza.',
      'Una revisión diaria de “señales” sobre lo que has apuntado: un inmueble que dijiste que no tiene seguro, un capital asegurado por debajo del valor de reconstrucción estimado con el Catastro, un alquiler vivo sin seguro de impago, una póliza de otra compañía que vence en 60 días o un inmueble con hipoteca. Solo ve el nombre que das al inmueble, el tipo de señal y las cifras del riesgo.',
      'Una petición tuya, solo si pulsas «Pedir precio»: es un botón, y no se envía nada hasta que lo pulsas.',
    ],
    correduriaNoVe: [
      'Nombre, DNI, correo ni renta de tus inquilinos: esa revisión no los usa ni los guarda.',
      'Los datos de tu comunidad de propietarios ni de su administrador.',
      'No te manda ningún mensaje por esas señales. Para contactarte con una propuesta hace falta que lo hayas pedido o que hayas aceptado recibir propuestas.',
      'Puedes oponerte a la revisión cuando quieras en Configuración → Privacidad o en la propia pantalla de Patrimonio: dejamos de calcular y retiramos las señales abiertas.',
    ],
  },

  flota: {
    modulo: 'flota',
    titulo: 'Flota de vehículos',
    queEs:
      'Los vehículos de tu empresa en una lista: el seguro de cada uno, cuándo vence y cuándo le toca la ITV. ' +
      'Es para el dueño de la sociedad y para el jefe de flota que él nombre.',
    empezar: [
      'Entra en Herramientas y pulsa «Abrir» en Flota de vehículos. Si aún no la tienes, pulsa «Solicitar»: tu corredor de Grupo ASegura lo revisa y te da acceso a mano.',
      'Si llevas la flota de una sola sociedad, entras directo a ella; si llevas varias, eliges la sociedad en «Tus sociedades».',
      'Los vehículos salen de las pólizas de automóvil y moto en vigor de esa sociedad con Grupo ASegura. Si falta alguno, escríbenos: puede que su seguro esté en otra correduría.',
      'Si no ves tu empresa, puede que no conste en tu ficha que eres el dueño: escríbenos y lo revisamos.',
      'Si el dueño te nombra jefe de flota, te llega un nombramiento pendiente en el índice de Flota: tienes que aceptarlo para llevar los vehículos.',
    ],
    porElemento: {
      titulo: 'Trabajar vehículo a vehículo',
      pasos: [
        'Cada vehículo tiene su tarjeta: su nombre o matrícula, la compañía, si es auto o moto y cuándo vence su seguro. Si no hay fecha de vencimiento, dice «no nos consta»; nunca «vigente» por defecto.',
        'ITV: la fecha es un cálculo a partir de la matriculación, no una inspección que hayamos visto. Si no sabemos el dato, la tarjeta dice «no lo sabemos». No existe un «ITV al día».',
        'Fecha de matriculación: si falta, puedes escribirla en la tarjeta del vehículo para que la ITV se calcule con ella. Si la compañía ya nos da esa fecha, usamos la suya.',
        'Etiqueta QR: cada vehículo con matrícula puede llevar su etiqueta. «Generar etiquetas» las crea por lotes, solo para los que aún no tienen; el QR se ve al generarlo, así que imprímelo en ese momento. Reimprimir una etiqueta anula la que ya está pegada.',
        'Ver su póliza: el dueño abre desde cada vehículo la ficha de su póliza.',
        'Jefe de flota: solo el dueño nombra o retira a un jefe de flota, y el nombrado tiene que aceptar. El jefe lleva los vehículos sin ver el resto de seguros de la sociedad.',
      ],
    },
    correduriaVe: [
      'Los vehículos y sus pólizas: son los de la cartera que ya lleva la correduría.',
      'Que has pedido la herramienta y, cuando la activa, el acceso que te autoriza.',
    ],
    correduriaNoVe: [
      'La correduría no decide quién es jefe de flota: lo nombra solo el dueño, y el nombrado debe aceptar.',
      'El jefe de flota no ve el resto de seguros de la sociedad, ni puede nombrar a otros jefes.',
      'Un vehículo sin matrícula no puede llevar etiqueta QR: no hay a qué colgarla.',
    ],
  },

  rrhh: {
    modulo: 'rrhh',
    titulo: 'Portal del Empleado',
    queEs:
      'Fichaje, vacaciones, nóminas y documentos para tu plantilla, cada empleado con su acceso. ' +
      'Es otra aplicación, con su propia dirección y su propio acceso: no se abre dentro de este portal.',
    empezar: [
      'En Herramientas, la tarjeta del Portal del Empleado te lleva a su dirección con «Abrir el Portal del Empleado».',
      'Si tu empresa aún no lo tiene, pulsa «Solicítalo»: avisamos a tu corredor de Grupo ASegura, que revisa la petición y da de alta a tu empresa a mano. No se activa solo.',
      'Cuando esté activado, entra con el acceso que te hayamos enviado. Este portal y el del empleado no comparten sesión: se entra por separado en cada uno.',
    ],
    porElemento: null,
    correduriaVe: [
      'Tu petición de alta y que la empresa está activada.',
    ],
    correduriaNoVe: [
      'Este portal no muestra datos de tu plantilla: fichajes, vacaciones, nóminas y documentos viven solo en el Portal del Empleado.',
    ],
  },
}

/** El manual de un módulo, o `null` si el id no es del catálogo (para validar lo que llega de una URL). */
export function manualDeModulo(id: unknown): ManualModulo | null {
  return esModuloPortal(id) ? MANUALES_MODULOS[id] : null
}

/** Dónde se abre el manual de un módulo dentro del portal. Una sola fuente para tarjetas, cabeceras y avisos. */
export function rutaManual(id: ModuloPortal): string {
  return `/herramientas/como-funciona/${id}`
}

/** Los módulos del catálogo SIN manual útil (ausente o con algún bloque vacío). Lo usa el cepo; vacío = todo cubierto. */
export function modulosSinManual(manuales: Partial<Record<string, ManualModulo>> = MANUALES_MODULOS): ModuloPortal[] {
  return MODULOS_PORTAL.filter((id) => {
    const m = manuales[id]
    if (!m || m.modulo !== id) return true
    const vacio = (t: string) => t.trim() === ''
    return (
      vacio(m.titulo) ||
      vacio(m.queEs) ||
      m.empezar.length === 0 ||
      m.empezar.some(vacio) ||
      m.correduriaVe.length === 0 ||
      m.correduriaNoVe.length === 0 ||
      (m.porElemento !== null && (vacio(m.porElemento.titulo) || m.porElemento.pasos.length === 0))
    )
  })
}
