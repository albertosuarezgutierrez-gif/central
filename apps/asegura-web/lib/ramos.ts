// Contenido de las páginas por ramo. Datos, no JSX: así el copy se puede
// revisar de un vistazo, testear, y reutilizar en el JSON-LD sin duplicarlo.
//
// 🚨 REGLA REGULATORIA QUE MANDA SOBRE EL COPY (RDL 3/2020, art. 173-178):
// esta web INFORMA y CAPTA, no asesora. En cuanto un texto dice «te ahorramos
// un X %», «la mejor póliza» o compara precios concretos, deja de ser
// información y pasa a ser asesoramiento — y el asesoramiento arrastra análisis
// objetivo documentado e IPID entregado antes de contratar. Nada de eso se
// puede prometer desde una landing.
//
// Por tanto, en `intro`, `cubre`, `paraQuien` y `faq` está PROHIBIDO:
//   · cifras o porcentajes de ahorro («hasta un 40 % menos»)
//   · superlativos sobre el resultado («el mejor precio», «la póliza ideal»)
//   · comparaciones de precio con compañías concretas o con comparadores
//   · dar por hecho que una cobertura existe: las coberturas las fija cada
//     póliza, así que se habla de lo que HAY QUE MIRAR, no de lo que «incluye»
// Lo que sí se puede decir, porque es verdad y es la propuesta de valor real:
// que somos correduría (varias compañías, no una marca), que el análisis lo
// hacemos nosotros, y que quien atiende es una persona con nombre y clave DGSFP.
//
// Lo protege `ramos.test.ts`, que barre el copy buscando esos patrones.

export type Faq = {
  /** La pregunta tal y como la escribiría el cliente en Google. */
  pregunta: string
  /** Respuesta corta y honesta. Se publica tal cual en el JSON-LD `FAQPage`. */
  respuesta: string
}

export type Ramo = {
  /** Segmento de URL: `/seguros/<slug>`. No se cambia una vez publicado. */
  slug: string
  /** Nombre corto, para navegación y migas. */
  nombre: string
  /** `<h1>` de la página. Lleva la localidad porque la pelea es local. */
  h1: string
  /** `<title>`. Máx ~60 caracteres útiles antes de que Google lo corte. */
  title: string
  /** `<meta name="description">`. ~150-160 caracteres. */
  description: string
  /** Uno o dos párrafos. Sin claims (ver cabecera). */
  intro: readonly string[]
  /** Qué conviene mirar en este ramo. Verbos, no promesas de cobertura. */
  cubre: readonly string[]
  /** A quién le encaja esta página. Ayuda al lector a auto-descartarse rápido. */
  paraQuien: readonly string[]
  /** Preguntas reales. Alimentan la página Y el JSON-LD `FAQPage`. */
  faq: readonly Faq[]
}

/**
 * 📌 El orden es de PRIORIDAD COMERCIAL, y está medido (04/09/2026, sobre
 * `seguros.poliza_recibos`, 12 meses de recibos cobrados):
 *
 *   hogar  22,03 % de comisión → 68,74 € por póliza y año
 *   RC     17,09 %             → 52,15 €
 *   auto   10,44 %             → 40,87 €
 *
 * Hogar renta el doble que auto con una prima parecida, y además auto es el
 * ramo cuya búsqueda controlan los comparadores. Por eso hogar va primero y
 * auto va deliberadamente el cuarto: no es un descuido de orden.
 *
 * ⚠️ La muestra de hogar son 8 recibos de 7 pólizas: es una hipótesis razonada,
 * no una conclusión. Si al medir con más pólizas cambia el orden, se cambia
 * aquí y las páginas se reordenan solas.
 */
export const RAMOS: readonly Ramo[] = [
  {
    slug: 'hogar',
    nombre: 'Hogar',
    h1: 'Seguro de hogar en Sevilla',
    title: 'Seguro de hogar en Sevilla · Grupo ASegura',
    description:
      'Correduría de seguros en Sevilla. Revisamos tu seguro de hogar entre varias compañías y te explicamos qué cubre de verdad tu póliza. Sin compromiso.',
    intro: [
      'Somos correduría, no aseguradora: trabajamos con varias compañías a la vez, así que nuestro trabajo es mirar tu caso y buscar dónde encaja mejor, no colocarte la póliza de una marca concreta.',
      'En hogar, la mayoría de los disgustos no vienen del precio sino de una cobertura que se daba por supuesta y no estaba: el continente y el contenido mal valorados, la responsabilidad civil corta, o una exclusión que nadie leyó. Eso es lo que revisamos contigo antes de nada.',
    ],
    cubre: [
      'Continente y contenido: si las sumas aseguradas se corresponden con lo que costaría reconstruir y reponer hoy, no con lo que costaba cuando se firmó.',
      'Responsabilidad civil: qué pasa si el agua de tu piso llega al vecino de abajo.',
      'Daños por agua: qué entra, qué se considera avería propia y qué franquicia lleva.',
      'Robo dentro y fuera de la vivienda, y qué se considera joya u objeto de valor.',
      'Cláusulas de infraseguro: la regla proporcional, que es la que hace que un siniestro se pague a medias.',
      'Asistencia en el hogar y peritaje: quién decide y en cuánto tiempo.',
    ],
    paraQuien: [
      'Tienes piso o casa en Sevilla y no sabes qué cubre exactamente tu póliza actual.',
      'Te ha subido la prima en la renovación y quieres entender por qué antes de decidir.',
      'Has reformado, comprado o heredado y las sumas aseguradas se han quedado antiguas.',
      'Alquilas tu vivienda y no tienes claro qué te toca a ti y qué al inquilino.',
    ],
    faq: [
      {
        pregunta: '¿Qué diferencia hay entre continente y contenido?',
        respuesta:
          'El continente es la construcción: paredes, suelos, instalaciones y todo lo que quedaría si pusieras la casa boca abajo. El contenido es lo que se cae: muebles, ropa, electrodomésticos y objetos personales. Se aseguran por separado y es habitual que uno de los dos esté mal valorado.',
      },
      {
        pregunta: '¿Qué es la regla proporcional o infraseguro?',
        respuesta:
          'Si aseguras tu vivienda por menos de lo que vale, la compañía puede indemnizar un siniestro en la misma proporción. Asegurada por la mitad de su valor, un daño de 10.000 € puede pagarse a 5.000 €. Por eso revisar las sumas aseguradas suele importar más que la diferencia de prima.',
      },
      {
        pregunta: '¿El seguro de hogar es obligatorio?',
        respuesta:
          'Por ley no lo es para el propietario que no tiene hipoteca. Sí lo suele exigir el banco mientras dure la hipoteca, y en ese caso solo puede exigir el seguro de daños del inmueble: la entidad no puede obligarte a contratarlo con ella.',
      },
      {
        pregunta: '¿Puedo cambiar de seguro de hogar antes de que termine el año?',
        respuesta:
          'La póliza se prorroga sola al vencimiento salvo que se avise antes. Como tomador puedes oponerte a la prórroga comunicándolo con al menos un mes de antelación a la fecha de vencimiento (art. 22 de la Ley de Contrato de Seguro). Esa fecha límite es lo que conviene tener apuntada, porque se pasa sin que nadie te avise.',
      },
      {
        pregunta: '¿Cobráis algo por revisar mi póliza?',
        respuesta:
          'No. Como corredores cobramos una comisión sobre la prima que paga la compañía aseguradora; el cliente no abona ningún honorario adicional por el servicio de mediación.',
      },
    ],
  },
  {
    slug: 'comunidades',
    nombre: 'Comunidades',
    h1: 'Seguro de comunidades de propietarios en Sevilla',
    title: 'Seguro de comunidad en Sevilla · Grupo ASegura',
    description:
      'Correduría de seguros en Sevilla. Revisamos la póliza de tu comunidad de propietarios entre varias compañías y te explicamos qué mirar antes de la junta.',
    intro: [
      'Somos correduría, no aseguradora: trabajamos con varias compañías a la vez y el análisis lo hacemos nosotros. En una comunidad eso pesa, porque quien firma responde ante los vecinos de una decisión que casi nunca ha tomado antes.',
      'La mayoría de los problemas en comunidades no son de prima: son de dónde acaba la póliza de la comunidad y dónde empieza la del vecino cuando una bajante moja tres pisos. Eso es lo que ponemos por escrito antes de hablar de precio.',
    ],
    cubre: [
      'El continente común: fachada, cubierta, portal, ascensor e instalaciones generales, y si la suma asegurada se corresponde con lo que costaría reconstruir hoy.',
      'Dónde termina la póliza de la comunidad y dónde empieza la de cada vivienda: ahí nacen casi todas las discusiones por daños por agua.',
      'Responsabilidad civil de la comunidad: la caída en zona común, el desprendimiento de fachada o el daño a un tercero.',
      'Localización de la avería: quién asume el picado y el reparado, y qué franquicia se aplica.',
      'Responsabilidad civil de los cargos de la comunidad y del personal contratado, si lo hay.',
      'Qué dicen los estatutos: hay comunidades cuyos estatutos exigen tener seguro, y conviene comprobarlo antes de renovar.',
    ],
    paraQuien: [
      'Eres presidente o administrador y te toca renovar una póliza que se firmó hace años y nadie ha vuelto a leer.',
      'Un siniestro de agua ha acabado en discusión sobre si lo paga la comunidad o el propietario.',
      'La finca ha hecho obras —cubierta, ascensor, fachada— y las sumas aseguradas siguen siendo las de antes.',
      'Administras varias comunidades en Sevilla y quieres una revisión ordenada, no una por urgencia.',
    ],
    faq: [
      {
        pregunta: '¿Es obligatorio el seguro de la comunidad de propietarios?',
        respuesta:
          'No existe una obligación general para toda España en la Ley de Propiedad Horizontal: depende de la normativa autonómica aplicable y, muy a menudo, de los propios estatutos de la comunidad, que sí pueden exigirlo. Lo primero es comprobar qué dicen los estatutos y qué acordó la junta.',
      },
      {
        pregunta: '¿Quién paga cuando una fuga del piso de arriba moja mi vivienda?',
        respuesta:
          'Depende de dónde esté la avería, no de dónde se vea el daño. Si el origen está en un elemento común suele intervenir la póliza de la comunidad; si está en una instalación privativa, la del propietario. Por eso conviene mirar las dos pólizas juntas: el hueco entre ellas es donde se queda el dinero.',
      },
      {
        pregunta: '¿Quién decide el seguro, el presidente o la junta?',
        respuesta:
          'La contratación es un acuerdo de la junta de propietarios y el presidente firma en su representación. Nuestro trabajo es preparar el análisis y la comparativa con tiempo, para que la junta decida con la información delante y no en cinco minutos al final del orden del día.',
      },
      {
        pregunta: '¿Puede la comunidad cambiar de seguro antes del vencimiento?',
        respuesta:
          'La póliza se prorroga sola salvo aviso. La comunidad, como tomadora, puede oponerse a la prórroga comunicándolo con al menos un mes de antelación a la fecha de vencimiento (art. 22 de la Ley de Contrato de Seguro). Con el calendario de juntas de por medio, esa fecha hay que tenerla apuntada con margen.',
      },
      {
        pregunta: '¿Cobráis algo por revisar la póliza de la comunidad?',
        respuesta:
          'No. Como corredores cobramos una comisión sobre la prima que paga la compañía aseguradora; la comunidad no abona ningún honorario adicional por el servicio de mediación.',
      },
    ],
  },
  {
    slug: 'comercio',
    nombre: 'Comercio y pyme',
    h1: 'Seguro de comercio y pyme en Sevilla',
    title: 'Seguro de comercio y pyme en Sevilla · Grupo ASegura',
    description:
      'Correduría de seguros en Sevilla. Analizamos el seguro de tu local, comercio o pyme entre varias compañías: continente, contenido y responsabilidad civil.',
    intro: [
      'Somos correduría: trabajamos con varias compañías y el análisis del riesgo lo hacemos nosotros. En un negocio eso se nota, porque dos comercios de la misma calle rara vez necesitan la misma póliza.',
      'En comercio el daño caro casi nunca es el escaparate roto: es el mes que el local está cerrado mientras se repara. Por eso miramos primero cómo trabajas —qué guardas, qué maquinaria tienes, cuánta gente entra— y después la prima.',
    ],
    cubre: [
      'Continente y contenido del local: obra, instalaciones, mobiliario y existencias, y si las sumas se corresponden con lo que hay hoy dentro.',
      'Pérdida de beneficios: cuántos días de cierre podrías sostener y en qué condiciones se indemniza la paralización de la actividad.',
      'Responsabilidad civil de explotación: el cliente que se resbala, el daño al local vecino, el producto que vendes.',
      'Robo, expoliación y daños por agua, con atención a los límites por existencias y a la franquicia.',
      'Avería de maquinaria y equipos electrónicos, y qué ocurre con las cámaras frigoríficas y la mercancía en frío.',
      'La actividad declarada en la póliza: si es exactamente la que haces, porque una actividad mal descrita es la vía más rápida a un siniestro discutido.',
    ],
    paraQuien: [
      'Tienes un local abierto al público en Sevilla —tienda, bar, taller, clínica, oficina— y la póliza se firmó al abrir y no se ha tocado.',
      'Has cambiado de actividad, ampliado el local o incorporado maquinaria nueva.',
      'Te piden acreditar responsabilidad civil para el arrendador, para una licencia o para un cliente.',
      'Eres autónomo con local y no tienes claro qué separa el seguro del negocio del de tu casa.',
    ],
    faq: [
      {
        pregunta: '¿Es obligatorio el seguro de responsabilidad civil para un comercio?',
        respuesta:
          'Depende de la actividad y de la norma que la regule: hay actividades con seguro obligatorio por normativa sectorial o municipal, y hay contratos de alquiler, licencias y pliegos que lo exigen aunque ninguna ley lo imponga. Se revisa con tu actividad y tu contrato delante.',
      },
      {
        pregunta: '¿Qué es la pérdida de beneficios y por qué importa tanto?',
        respuesta:
          'Es la garantía que responde del margen que dejas de ingresar mientras el negocio está parado por un siniestro cubierto, y de los gastos fijos que siguen corriendo. Se contrata por un importe y por un periodo de indemnización: las dos cifras hay que calcularlas, no elegirlas a ojo.',
      },
      {
        pregunta: '¿Qué pasa si en la póliza consta una actividad distinta de la que hago?',
        respuesta:
          'Es uno de los motivos habituales de discusión en un siniestro. La compañía tarifica según la actividad declarada y el riesgo que asume con ella; si la real es otra, la indemnización puede reducirse o rechazarse. Si has cambiado de actividad, se comunica y se actualiza la póliza.',
      },
      {
        pregunta: '¿Puedo cambiar de compañía sin esperar al vencimiento?',
        respuesta:
          'La póliza se prorroga sola al vencimiento salvo que se avise antes. Como tomador puedes oponerte a la prórroga comunicándolo con al menos un mes de antelación a esa fecha (art. 22 de la Ley de Contrato de Seguro). Es la fecha que más se pasa, porque nadie te la recuerda.',
      },
      {
        pregunta: '¿Cobráis por estudiar el seguro de mi negocio?',
        respuesta:
          'No. Como corredores cobramos una comisión sobre la prima que paga la compañía aseguradora; el cliente no abona ningún honorario adicional por el servicio de mediación.',
      },
    ],
  },
  {
    slug: 'auto',
    nombre: 'Auto y moto',
    h1: 'Seguro de coche y moto en Sevilla',
    title: 'Seguro de coche y moto en Sevilla · Grupo ASegura',
    description:
      'Correduría de seguros en Sevilla. Vemos contigo tu seguro de coche o moto entre varias compañías: terceros, todo riesgo, franquicia y qué revisar.',
    intro: [
      'Auto es el ramo donde más fácil resulta contratar mirando solo la cifra final, y donde peor sienta descubrir después lo que no se miró. Como correduría trabajamos con varias compañías, así que podemos enseñarte qué cambia de una modalidad a otra antes de que elijas.',
      'El seguro de responsabilidad civil de suscripción obligatoria lo lleva todo vehículo a motor: es el mínimo legal, no una modalidad. A partir de ahí, terceros ampliado o todo riesgo con o sin franquicia es una decisión sobre cuánto asumes tú, y depende del coche y del uso que le das.',
    ],
    cubre: [
      'Qué separa el seguro obligatorio de responsabilidad civil de las coberturas voluntarias que se le añaden encima.',
      'Terceros, terceros ampliado y todo riesgo con o sin franquicia: qué asume la compañía y qué asumes tú en cada caso.',
      'La franquicia: su importe y en qué garantías se aplica realmente.',
      'Lunas, robo e incendio: límites, red de talleres y si hay libre elección de taller.',
      'Asistencia en carretera: desde qué kilómetro, si opera desde el domicilio y a quién alcanza además de al conductor.',
      'Conductores: quién puede llevar el vehículo según la póliza y qué ocurre con un conductor ocasional o novel.',
      'Vehículo de sustitución y peritaje: quién decide la reparación y en cuánto tiempo.',
    ],
    paraQuien: [
      'Tienes coche o moto en Sevilla y renuevas cada año sin mirar qué ha cambiado en el condicionado.',
      'Vas a cambiar de vehículo, o el tuyo ya tiene años y dudas si mantener el todo riesgo.',
      'Has dado un parte y quieres entender cómo afecta a tu bonificación antes de renovar.',
      'En casa conduce más de una persona y quieres que la póliza lo refleje.',
    ],
    faq: [
      {
        pregunta: '¿Qué seguro de coche es obligatorio en España?',
        respuesta:
          'Todo vehículo a motor con estacionamiento habitual en España debe tener el seguro de responsabilidad civil de suscripción obligatoria, que responde de los daños causados a terceros. Las demás garantías —lunas, robo, daños propios, asistencia— son voluntarias y se contratan por encima de ese mínimo.',
      },
      {
        pregunta: '¿Me compensa el todo riesgo o me quedo a terceros?',
        respuesta:
          'No hay una respuesta válida para todos: depende del valor del vehículo, de cuánto lo usas, de dónde aparca y de cuánto dinero estarías dispuesto a poner tú si te lo golpean. Lo que sí se puede hacer es poner las modalidades una al lado de otra y decidir con las diferencias delante.',
      },
      {
        pregunta: '¿Para qué sirve el parte amistoso de accidente?',
        respuesta:
          'Es la declaración conjunta que firman los dos conductores en el momento del accidente y suele ser la prueba principal de cómo ocurrió. Conviene llevar uno en el vehículo, rellenarlo allí mismo con los datos de ambos y no firmarlo si no estás de acuerdo con lo que describe.',
      },
      {
        pregunta: '¿Puedo cambiar de seguro de coche antes de que acabe el año?',
        respuesta:
          'La póliza se prorroga sola al vencimiento salvo aviso previo. Como tomador puedes oponerte a la prórroga comunicándolo con al menos un mes de antelación a la fecha de vencimiento (art. 22 de la Ley de Contrato de Seguro). Apuntar esa fecha evita quedarse otro año atado sin quererlo.',
      },
      {
        pregunta: '¿Cobráis algo por revisar mi seguro de coche?',
        respuesta:
          'No. Como corredores cobramos una comisión sobre la prima que paga la compañía aseguradora; el cliente no abona ningún honorario adicional por el servicio de mediación.',
      },
    ],
  },
  {
    slug: 'vida-y-salud',
    nombre: 'Vida y salud',
    h1: 'Seguro de vida y de salud en Sevilla',
    title: 'Seguro de vida y de salud en Sevilla · Grupo ASegura',
    description:
      'Correduría de seguros en Sevilla. Vida riesgo, vida ahorro y salud: te explicamos carencias, copago, cuadro médico y cuestionario antes de contratar.',
    intro: [
      'Vida y salud son los dos ramos donde las preguntas se vuelven personales, así que el trato es el que corresponde: se pregunta lo justo, se explica para qué sirve cada dato y se decide sin prisa.',
      'Los datos de salud son categorías especiales de datos personales (art. 9 del RGPD). Solo se recogen los que la aseguradora necesita para valorar el riesgo y se tratan con esa protección reforzada, tanto en el cuestionario como después.',
    ],
    cubre: [
      'Vida riesgo y vida ahorro no son el mismo producto: el primero protege económicamente a quien queda; el segundo es un instrumento de ahorro con sus propias reglas de rescate y de fiscalidad.',
      'El capital y la designación de beneficiarios: si la cifra encaja con lo que hoy sostiene tu hogar y si los beneficiarios están actualizados.',
      'Vida vinculado a una hipoteca: qué te exige el banco, qué es voluntario y con quién puedes contratarlo.',
      'El cuestionario de salud: contestarlo completo y con exactitud es lo que sostiene la póliza el día que hace falta usarla.',
      'En salud, el cuadro médico en Sevilla y provincia: si están los especialistas y hospitales a los que realmente vas a ir.',
      'Copago o sin copago: cuánto se paga por acto médico y cómo encaja con el uso que prevés hacer de la póliza.',
      'Carencias y preexistencias: desde cuándo puedes usar cada prestación y cómo se tratan las enfermedades anteriores a la contratación.',
    ],
    paraQuien: [
      'Tienes hijos, hipoteca o un negocio que depende de ti y quieres entender qué pasaría económicamente si tú faltas.',
      'El banco te pide un seguro de vida por la hipoteca y quieres saber qué margen de elección tienes.',
      'Buscas acceso a especialistas privados en Sevilla y estás comparando pólizas de salud.',
      'Ya tienes salud contratada y no sabes qué carencias te quedan ni qué recoge tu cuadro médico.',
    ],
    faq: [
      {
        pregunta: '¿Tengo que contratar el seguro de vida con el banco de mi hipoteca?',
        respuesta:
          'El banco puede exigir la contratación de determinados seguros vinculados al préstamo, pero no puede imponerte la entidad con la que los contratas: puedes presentar una póliza de otra compañía con condiciones equivalentes. Conviene leer, eso sí, cómo afecta a las condiciones bonificadas del préstamo.',
      },
      {
        pregunta: '¿Qué es la carencia en un seguro de salud?',
        respuesta:
          'Es el tiempo que debe pasar desde la entrada en vigor de la póliza hasta que puedes usar determinadas prestaciones. Suele afectar a pruebas diagnósticas, intervenciones y parto, y varía según la compañía y el producto, así que es de las primeras cosas que hay que mirar.',
      },
      {
        pregunta: '¿Me interesa una póliza de salud con copago o sin copago?',
        respuesta:
          'Con copago pagas una cantidad por cada acto médico además de la prima, y la prima suele ser más contenida; sin copago pagas solo la prima. Cuál encaja depende de cuánto prevés usarla, y esa cuenta se puede hacer con números antes de decidir, no después.',
      },
      {
        pregunta: '¿Qué ocurre si tengo una enfermedad anterior a la contratación?',
        respuesta:
          'Hay que declararla en el cuestionario de salud. La compañía decide entonces si la acepta, la excluye o aplica un recargo, y esa decisión queda por escrito en la póliza. No declararla no la convierte en cubierta: es el motivo más frecuente de que una prestación se rechace después.',
      },
      {
        pregunta: '¿Qué se hace con mis datos de salud?',
        respuesta:
          'Se tratan como categoría especial del art. 9 del RGPD: se recogen para valorar el riesgo y gestionar la póliza y se comunican a las compañías a las que se pide presupuesto. Puedes ejercer tus derechos de acceso, rectificación, supresión y oposición en cualquier momento.',
      },
    ],
  },
  {
    slug: 'responsabilidad-civil',
    nombre: 'Responsabilidad civil',
    h1: 'Seguro de responsabilidad civil en Sevilla',
    title: 'Seguro de responsabilidad civil en Sevilla · Grupo ASegura',
    description:
      'Correduría de seguros en Sevilla. RC profesional y de autónomo: límites, retroactividad y delimitación temporal explicados antes de firmar la póliza.',
    intro: [
      'La responsabilidad civil es el ramo donde peor sienta la sorpresa: la reclamación llega años después del trabajo que la origina, y para entonces lo que decide no es lo que uno recuerda haber contratado, sino cómo estaba delimitada la póliza en el tiempo.',
      'Somos correduría y trabajamos con varias compañías, así que aquí nuestro trabajo empieza antes del precio: entender qué haces exactamente, para quién y con qué encargo, porque de ahí salen el límite y la delimitación temporal que necesitas.',
    ],
    cubre: [
      'RC de explotación y RC profesional: la primera responde de los daños que causa tu actividad; la segunda, del perjuicio derivado de un error en el ejercicio de tu profesión. No son intercambiables.',
      'El límite por siniestro y por anualidad, y los sublímites por víctima o por reclamación, que son los que marcan el techo real.',
      'La delimitación temporal: si la póliza responde por el hecho ocurrido o por la reclamación recibida durante su vigencia (claims made), y con qué retroactividad.',
      'Qué ocurre con las reclamaciones que llegan cuando la póliza ya está cancelada.',
      'La actividad descrita en la póliza: si recoge todo lo que haces, incluidos los encargos ocasionales fuera de tu especialidad.',
      'RC patronal, de productos y de subcontratistas, según con quién y cómo trabajes.',
      'Los seguros de RC exigidos por norma o por colegio profesional, y si el que tienes acredita lo que te están pidiendo.',
    ],
    paraQuien: [
      'Eres autónomo o profesional en Sevilla y un cliente, un colegio o un pliego te pide acreditar responsabilidad civil.',
      'Ejerces una profesión en la que un error puede reclamarse años después: técnicos, sanitarios, asesores, arquitectura o ingeniería.',
      'Tienes empleados o subcontratas parte del trabajo y no sabes hasta dónde llega tu responsabilidad.',
      'Vas a cambiar de compañía y quieres evitar que quede un hueco entre la póliza vieja y la nueva.',
    ],
    faq: [
      {
        pregunta: '¿Qué diferencia hay entre RC de explotación y RC profesional?',
        respuesta:
          'La de explotación responde de los daños materiales o personales que causa la actividad en su desarrollo: una caída en tu local, un daño en el inmueble donde trabajas. La profesional responde del perjuicio económico derivado de un error en tu asesoramiento o en tu trabajo técnico. Muchos autónomos necesitan las dos.',
      },
      {
        pregunta: '¿Qué significa que una póliza sea claims made?',
        respuesta:
          'Que responde de las reclamaciones presentadas mientras la póliza está en vigor, aunque el hecho sea anterior, dentro del periodo de retroactividad pactado. Estas cláusulas de delimitación temporal las regula el art. 73 de la Ley de Contrato de Seguro, y su efecto práctico es que cancelar sin más puede dejar un hueco.',
      },
      {
        pregunta: '¿Qué es la retroactividad y por qué se mira al cambiar de compañía?',
        respuesta:
          'Es hasta cuándo hacia atrás responde la póliza por hechos anteriores a su contratación. Sin retroactividad, un error cometido antes de firmar queda fuera aunque la reclamación llegue estando ya cubierto. Al cambiar de aseguradora es de los primeros datos que hay que poner sobre la mesa.',
      },
      {
        pregunta: '¿Es obligatorio el seguro de responsabilidad civil para un autónomo?',
        respuesta:
          'No con carácter general: depende de la profesión y de la norma que la regule. Hay actividades con seguro obligatorio y colegios profesionales que lo exigen para ejercer, y hay contratos y pliegos que lo piden sin que ninguna ley lo imponga. Lo que hay que comprobar es qué te exigen a ti y con qué límite.',
      },
      {
        pregunta: '¿Cobráis honorarios por el estudio de la RC?',
        respuesta:
          'No. Como corredores cobramos una comisión sobre la prima que paga la compañía aseguradora; el cliente no abona ningún honorario adicional por el servicio de mediación. Grupo ASegura es correduría inscrita en el registro de la DGSFP.',
      },
    ],
  },
]

/** Devuelve un ramo por su slug, o `null` si no existe (nunca un ramo de relleno). */
export function ramoPorSlug(slug: string): Ramo | null {
  return RAMOS.find((r) => r.slug === slug) ?? null
}
