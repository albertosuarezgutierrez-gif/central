// Plantilla v1 del contrato de encargo del tratamiento (art. 28 RGPD). Derivada de `docs/contratos/encargo-tratamiento-v1.md`
// (borrador para el abogado) SIN la nota interna y con los datos del ENCARGADO como variables `{{encargado.*}}` (salen de
// `MEDIADOR` de @central/legal-templates/encargado: ningún literal aquí). El Anexo I lo inserta `{{anexo_i}}` desde el
// catálogo (catalogo.ts).
//
// 🚨 INMUTABLE una vez publicada: se carga en BD (`herramientas.plantilla`, migración 0002, con su sha256) y lo firmado queda
// en `contrato_version.documento_html`. Cambiar el FONDO = `encargo-tratamiento-v2` (plantilla nueva), nunca editar esta.
// `apps/empresa/test/plantilla-sql.test.ts` exige que el texto de 0002 sea byte a byte este.
//
// `estado: 'borrador'`: lleva marcas «pendiente de confirmar» (Anexo III). Emitirla exige `confirmo_borrador` del operador.

export const PLANTILLA_ENCARGO_V1 = {
  codigo: 'encargo_tratamiento',
  version: 'v1',
  estado: 'borrador' as const,
  texto: `# Contrato de encargo del tratamiento

**Contrato nº {{contrato.numero}} · versión {{version}} · {{fecha}}**

Conforme al artículo 28 del Reglamento (UE) 2016/679 (RGPD) y al artículo 33 de la Ley Orgánica 3/2018 (LOPDGDD).

## Reunidos

**De una parte, como RESPONSABLE DEL TRATAMIENTO** («el Responsable»):
**{{empresa.razon_social}}**, con NIF **{{empresa.nif}}** y domicilio en **{{empresa.domicilio}}**, representada por
**{{firmante.nombre}}**, con NIF **{{firmante.nif}}**, en calidad de **{{firmante.cargo}}**, con facultades suficientes
para este acto.

**De otra parte, como ENCARGADO DEL TRATAMIENTO** («el Encargado»):
**{{encargado.nombre}}**, con NIF **{{encargado.nif}}**, {{encargado.figura}} inscrito en el Registro
Administrativo de Distribuidores de Seguros de la DGSFP con la clave **{{encargado.clave_dgsfp}}**, con domicilio profesional en
**{{encargado.domicilio}}**, que opera bajo el nombre comercial **{{encargado.marca}}**. Contacto:
{{encargado.email}}.

Ambas partes se reconocen capacidad para obligarse y

## Exponen

1. Que el Encargado pone a disposición del Responsable, **de forma gratuita**, las herramientas de gestión que se
   relacionan a continuación («las Herramientas»):

{{herramientas}}

2. Que el uso de las Herramientas implica que el Encargado trate, por cuenta del Responsable, datos personales de los
   que el Responsable es titular, por lo que ambas partes suscriben el presente contrato, que se rige por las
   siguientes

## Cláusulas

### 1. Objeto

1.1. Este contrato regula el tratamiento de datos personales que el Encargado realiza **por cuenta del Responsable**
y exclusivamente para prestarle las Herramientas.

1.2. El detalle de cada tratamiento (naturaleza, finalidad, tipos de datos y categorías de interesados) figura, por
Herramienta, en el **Anexo I**. Si el Responsable activa o desactiva una Herramienta, el Anexo I se actualiza y se le
remite la nueva versión; la activación de una Herramienta nueva no surte efecto hasta que el Responsable acepta la
versión del Anexo I que la incluye.

### 2. Duración

2.1. El contrato entra en vigor en la fecha de su firma y dura **mientras el Encargado ceda al Responsable al menos
una de las Herramientas**. Para cada Herramienta, el encargo termina el día en que deja de prestarse.

2.2. Cualquiera de las partes puede poner fin a la cesión de una o de todas las Herramientas con un preaviso de
**treinta (30) días** por escrito. Las obligaciones de confidencialidad, devolución y supresión (cláusulas 5 y 13)
sobreviven a la terminación.

### 3. Naturaleza y finalidad del tratamiento

3.1. El Encargado aloja, conserva, organiza, consulta, calcula, presenta y, cuando la Herramienta lo prevé, envía o
comunica los datos **a quien el Responsable indique** (por ejemplo, la nómina al propio empleado).

3.2. La finalidad es **única**: permitir al Responsable gestionar su propia actividad con las Herramientas. El
Encargado no trata los datos para fines propios.

### 4. Instrucciones documentadas del Responsable

4.1. El Encargado trata los datos **solo siguiendo las instrucciones documentadas del Responsable**. Constituyen
instrucciones: (a) este contrato y sus anexos; (b) la configuración que el Responsable hace en cada Herramienta
(usuarios, permisos, plazos de conservación configurables, activación de funciones opcionales como la geolocalización
del fichaje); y (c) las indicaciones que el Responsable dé por escrito a {{encargado.email}}.

4.2. Si el Encargado considera que una instrucción infringe el RGPD u otra norma de protección de datos, **informará
inmediatamente** al Responsable y podrá suspender su ejecución hasta que se confirme o se modifique.

4.3. Si el Derecho de la Unión o de un Estado miembro obliga al Encargado a un tratamiento no instruido, lo comunicará
al Responsable antes de realizarlo, salvo que esa norma lo prohíba por razones de interés público.

### 5. Confidencialidad

5.1. El Encargado mantiene el secreto sobre los datos tratados, también después de terminar el contrato.

5.2. Solo acceden a los datos las personas autorizadas por el Encargado que lo necesitan para prestar el servicio o
darle soporte, y todas ellas se han comprometido por escrito a respetar la confidencialidad o están sujetas a una
obligación legal de confidencialidad. El Encargado les informa de las medidas de seguridad que deben cumplir.

### 6. Medidas de seguridad

6.1. El Encargado aplica las medidas técnicas y organizativas apropiadas al riesgo (art. 32 RGPD) descritas en el
**Anexo II**, y las revisa periódicamente.

6.2. El Encargado puede actualizar esas medidas siempre que el nivel de protección resultante **no sea inferior** al
descrito en el Anexo II.

### 7. Subencargados del tratamiento

7.1. El Responsable otorga **autorización general** para que el Encargado recurra a los subencargados que figuran en
el **Anexo III**, que prestan servicios de infraestructura (alojamiento, base de datos, envío de correo, lectura
automática de documentos).

7.2. El Encargado informará al Responsable, con al menos **quince (15) días** de antelación, de cualquier alta o
sustitución de subencargado. El Responsable puede oponerse dentro de ese plazo por motivos razonables relacionados con
la protección de datos; si no hay acuerdo, el Responsable puede dar por terminada la cesión de la Herramienta afectada
sin coste alguno.

7.3. El Encargado impone a cada subencargado, por contrato, las mismas obligaciones de protección de datos que este
contrato le impone a él, y responde ante el Responsable de su cumplimiento.

7.4. **Transferencias internacionales.** Los datos se alojan en el Espacio Económico Europeo. Cuando un subencargado
pueda tratarlos fuera del EEE, el Anexo III lo indica junto con la garantía aplicable (decisión de adecuación —incluido
el Marco de Privacidad de Datos UE-EE. UU.— o cláusulas contractuales tipo de la Comisión Europea). El Encargado no
realiza otras transferencias sin instrucción del Responsable.

### 8. Asistencia en el ejercicio de derechos

8.1. El Encargado asiste al Responsable, mediante las funciones de las Herramientas y, si no bastan, por correo, para
atender las solicitudes de **acceso, rectificación, supresión, oposición, limitación del tratamiento, portabilidad y a
no ser objeto de decisiones individualizadas automatizadas** de los interesados.

8.2. Si un interesado dirige su solicitud al Encargado, este la remitirá al Responsable **en un plazo máximo de cinco
(5) días hábiles**, sin contestarla por sí mismo salvo instrucción del Responsable.

### 9. Notificación de violaciones de seguridad

9.1. El Encargado notificará al Responsable, **sin dilación indebida y en todo caso en un plazo máximo de cuarenta y
ocho (48) horas** desde que tenga conocimiento, toda violación de la seguridad de los datos personales, a la dirección
de correo y al teléfono que el Responsable tenga registrados en la Herramienta.

9.2. La notificación incluirá, como mínimo y en la medida en que se conozca: la naturaleza de la violación, las
categorías y el número aproximado de interesados y de registros afectados, las consecuencias probables, las medidas
adoptadas o propuestas y un punto de contacto. Si no puede facilitarse toda la información a la vez, se dará de forma
gradual sin dilación.

9.3. Corresponde al Responsable notificar, en su caso, a la Agencia Española de Protección de Datos y a los
interesados. El Encargado le prestará la ayuda que necesite para ello.

### 10. Evaluación de impacto y consulta previa

El Encargado ayudará al Responsable, con la información de que disponga, a realizar las **evaluaciones de impacto**
relativas a la protección de datos que procedan (en particular, si el Responsable activa el control de presencia con
geolocalización) y, en su caso, la consulta previa a la autoridad de control.

### 11. Uso exclusivo: los datos no se usan para la correduría ni para fines comerciales

11.1. El Encargado desarrolla también una actividad de **corredor de seguros** bajo el nombre comercial {{encargado.marca}}.
Las partes declaran expresamente que esa actividad es **ajena** a este contrato.

11.2. Los datos que el Responsable trata en las Herramientas —de sus empleados, clientes, proveedores, vehículos u
otros— **no se usan, ni se cruzan, ni se combinan** con la cartera, el CRM o cualquier base de datos de la actividad de
correduría o comercial del Encargado, ni para elaborar perfiles, estudiar necesidades de aseguramiento, ofrecer
productos o servicios, ni para ninguna otra finalidad propia del Encargado.

11.3. Cualquier oferta de seguros u otros servicios a los **empleados** o a los **clientes finales** del Responsable
solo podrá hacerse a la persona que haya dado su **consentimiento propio, específico, informado y separado**, recabado
directamente por el Encargado como responsable de ese otro tratamiento, fuera de las Herramientas y sin usar los datos
de este encargo para localizarla o seleccionarla. El Responsable no presta ese consentimiento en nombre de nadie.

11.4. La cesión de las Herramientas **no está condicionada** a que el Responsable, sus empleados o sus clientes
contraten ni hayan contratado seguro alguno con el Encargado, ni a que consientan comunicaciones comerciales. Retirar
o no dar ese consentimiento no afecta en nada al servicio.

11.5. El incumplimiento de esta cláusula se considera **incumplimiento esencial**: el Encargado pasaría a ser
considerado responsable del tratamiento a todos los efectos (art. 28.10 RGPD), y el Responsable podrá resolver el
contrato de inmediato.

### 12. Información y auditorías

12.1. El Encargado pone a disposición del Responsable toda la información necesaria para demostrar el cumplimiento de
este contrato.

12.2. El Responsable, por sí o mediante un auditor que él designe y que esté sujeto a confidencialidad, puede realizar
auditorías e inspecciones, con un preaviso de **quince (15) días**, en horario laboral y sin perjudicar la seguridad
de otros clientes. Cada parte asume sus propios costes, salvo que la auditoría revele un incumplimiento relevante del
Encargado, que asumirá entonces el coste razonable de la misma.

### 13. Destino de los datos al terminar

13.1. Al terminar la cesión de una Herramienta, el Encargado, a elección del Responsable comunicada por escrito:
(a) **devuelve** los datos en un formato estructurado y de uso común (CSV, JSON o PDF, según el dato) y después los
suprime; o (b) los **suprime** directamente.

13.2. El Responsable dispone de **treinta (30) días** desde la terminación para descargar sus datos o pedir su
devolución. Transcurrido ese plazo sin instrucción, el Encargado **suprime** los datos en los **treinta (30) días**
siguientes. Las copias de seguridad se eliminan por rotación en el plazo indicado en el Anexo II. A petición del
Responsable, el Encargado certificará la supresión por escrito.

13.3. El Encargado solo conservará, debidamente **bloqueados**, los datos imprescindibles mientras puedan derivarse
responsabilidades de la ejecución del encargo o lo exija una norma, y únicamente para ese fin.

### 14. Obligaciones del Responsable

El Responsable: (a) garantiza que los datos que introduce en las Herramientas se han obtenido lícitamente y que ha
informado a los interesados (en particular, a sus empleados sobre el registro de jornada y, en su caso, la
geolocalización); (b) configura los permisos de sus usuarios; (c) custodia los códigos de acceso de sus usuarios;
(d) realiza, si procede, la evaluación de impacto; y (e) supervisa el tratamiento.

### 15. Responsabilidad

15.1. Cada parte responde de los daños que cause por incumplir este contrato o la normativa de protección de datos,
en los términos del artículo 82 RGPD.

15.2. Si el Encargado trata los datos para una finalidad propia, los comunica o los usa incumpliendo este contrato,
será considerado responsable del tratamiento respecto de ese tratamiento y responderá de las infracciones en que
incurra personalmente.

### 16. Legislación y jurisdicción

Este contrato se rige por la legislación española. Para cualquier controversia, las partes se someten a los juzgados y
tribunales de **Sevilla**, salvo norma imperativa en contrario.

---

## Firma

En prueba de conformidad, el Responsable firma el presente contrato, que el Encargado acepta y firma en los mismos
términos.

| Por el Responsable | Por el Encargado |
|---|---|
| {{empresa.razon_social}} | {{encargado.nombre}} ({{encargado.marca}}) |
| {{firmante.nombre}} · {{firmante.cargo}} | NIF {{encargado.nif}} |
| NIF {{firmante.nif}} | |
| Firma electrónica avanzada: ver el certificado de firma de esta versión | Emitido y aceptado por el Encargado el {{fecha}} |

<sub>Contrato de encargo del tratamiento nº {{contrato.numero}} · versión {{version}} · plantilla {{plantilla.version}}. La huella SHA-256 de este documento figura en su certificado de firma.</sub>

---

## Anexo I — Tratamientos por Herramienta

{{anexo_i}}

---

## Anexo II — Medidas técnicas y organizativas

1. **Cifrado en tránsito.** Todas las conexiones (navegador, API, base de datos, correo saliente) van cifradas con
   TLS.
2. **Aislamiento por empresa.** Cada empresa es un espacio separado: la base de datos aplica **seguridad a nivel de
   fila (RLS)** por empresa, con roles de base de datos propios por Herramienta y sin acceso cruzado entre esquemas.
3. **Acceso con código.** Los usuarios entran con códigos de un solo uso o credenciales individuales; los intentos se
   limitan para impedir ataques de fuerza bruta; los permisos se asignan por usuario y rol.
4. **Secretos.** Las claves y secretos de servicio se guardan en variables de entorno protegidas, nunca en el código.
5. **Registros de auditoría.** Se registran los accesos y las acciones relevantes (altas, cambios, envíos) con fecha,
   usuario y origen.
6. **Copias de seguridad.** Copias automáticas diarias de la base de datos gestionadas por el proveedor de
   infraestructura. *Plazo de conservación de las copias: pendiente de confirmar (depende del plan contratado con
   Supabase).*
7. **Conservación y supresión.** Plazos configurables por el Responsable donde la Herramienta lo permite (p. ej.,
   fotos del taller) y purgas automáticas programadas; supresión al terminar según la cláusula 13.
8. **Minimización hacia proveedores de IA.** Solo sale el dato imprescindible, previamente depurado (ver Anexo I), y
   se exige al proveedor la no utilización de los datos para entrenamiento cuando el canal lo permite.
9. **Documentos.** Los ficheros se sirven mediante enlaces firmados de caducidad corta.
10. **Organización.** Acceso a producción limitado al Encargado y a personal autorizado bajo confidencialidad;
    revisión del código y pruebas automáticas antes de cada despliegue.

---

## Anexo III — Subencargados autorizados

| Subencargado | Servicio | Herramientas | Ubicación del tratamiento | Transferencia internacional y garantía |
|---|---|---|---|---|
| **Supabase, Inc.** | Base de datos y almacenamiento de ficheros | Todas | UE — Irlanda (región AWS \`eu-west-1\`) | Datos alojados en la UE. Posible acceso de soporte desde EE. UU.: garantía *pendiente de confirmar* (DPA de Supabase con cláusulas contractuales tipo). |
| **Vercel Inc.** | Alojamiento y ejecución de la aplicación | Todas | Región de ejecución de las Herramientas: *pendiente de confirmar* (sus proyectos no fijan región; las apps de la correduría sí, \`fra1\` Fráncfort) | EE. UU.: Marco de Privacidad de Datos UE-EE. UU. y/o cláusulas contractuales tipo — *pendiente de confirmar*. |
| **Resend (Plus Five Five, Inc.)** | Envío de correo electrónico transaccional | RRHH, Contabilidad (si envía correos) | UE — Irlanda (\`eu-west-1\`) | Entidad de EE. UU.: garantía *pendiente de confirmar*. |
| **OpenRouter, Inc.** | Pasarela a modelos de IA para lectura automática de documentos (texto minimizado; imágenes de facturas) | RRHH, Portal de proveedores / Taller | *Pendiente de confirmar* (enruta a proveedores de modelos, posiblemente fuera del EEE) | Se exige \`data_collection: deny\` (no entrenamiento) en la visión de facturas; en el texto, *pendiente de confirmar*. Garantía de transferencia *pendiente de confirmar*. |
| **Groq, Inc. / Cerebras Systems Inc. / Moonshot AI** | Modelos de IA de reserva si falla el principal (solo texto minimizado) | RRHH, Portal de proveedores / Taller | EE. UU. (Groq, Cerebras); China (Moonshot) — *pendiente de confirmar* | *Pendiente de confirmar.* China no tiene decisión de adecuación: **valorar excluir este eslabón** para datos de las Herramientas. |
| **Telegram (Telegram Messenger Inc.)** | Avisos internos de incidencias de fichaje (fichajes abiertos, jornada máxima) | RRHH | *Pendiente de confirmar* (fuera del EEE) | *Pendiente de confirmar* destinatario y contenido del aviso (si incluye nombres de empleados) y garantía; sin garantía clara, **valorar sacar datos personales del aviso**. |
| **Servicios de notificaciones del navegador** (Google, Apple, Mozilla) | Entrega de avisos al móvil del empleado | RRHH | Según el navegador del empleado | El contenido viaja cifrado de extremo a extremo (estándar Web Push). *Pendiente de confirmar si se listan como subencargados.* |

*Proveedores alternativos de correo* (SMTP de IONOS o Gmail) solo se usan si falta la configuración de Resend:
*pendiente de confirmar* si están activos en los proyectos de las Herramientas; si lo están, deben añadirse a esta
lista.

*Contabilidad* no envía datos a proveedores de IA (no usa ese módulo en el código a 07/11/2026).
`,
}
