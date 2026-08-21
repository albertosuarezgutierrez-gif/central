# 📄 Contrato de encargado de tratamiento — Manuel Suárez (BORRADOR)

> **Qué es y por qué existe.** El punto 6 del mensaje enviado a Manuel (ver
> `docs/TRASPASO-CORREDURIA.md`) le promete «te paso el documento». Este es ese documento.
>
> **⚠️ BORRADOR PARA REVISIÓN, NO PARA FIRMAR TAL CUAL.** No soy abogado. Esto cubre las cláusulas
> que el **art. 28.3 RGPD** exige de forma expresa, con la estructura que usa la AEPD, pero **antes de
> firmarlo tiene que verlo la asesoría** — sobre todo si en la cartera hay ramo de **salud/vida**, que
> es categoría especial del **art. 9 RGPD** y sube el listón de las medidas de seguridad.
>
> **No se envía a Manuel hasta que Alberto lo apruebe** (regla del repo: ninguna comunicación a
> terceros sin autorización explícita para ese envío concreto).

---

## ✅ Decidido — quién firma como Responsable (20/08/2026)

Firma **Alberto Suárez Gutiérrez, persona física**, actuando bajo el nombre comercial
**«Grupo ASegura»**. Decisión de Alberto en esta sesión.

> **Qué implica y por qué conviene saberlo:** el responsable del tratamiento es **de quien sean los
> clientes de la cartera**. En `apps/plataforma` la correduría figura contablemente como ASegura S.L.
> (CS-F/0170), pero eso es la **contabilidad de las comisiones**, no la titularidad de los clientes del
> CRM. Alberto ha decidido firmar como persona física. **Si al revisarlo la asesoría ve que la cartera
> está a nombre de la sociedad, la que tiene que firmar es la sociedad** y hay que rehacer el bloque de
> REUNIDOS — es un cambio de dos líneas, pero no se puede firmar «a medias».

## 🔴 Datos que siguen faltando — rellenar antes de firmar

No los invento: son identificadores legales y un error aquí invalida el documento.

| Hueco | Qué hace falta | Nota |
|---|---|---|
| **NIF de Alberto** | El número, tal cual | ⚠️ **Deliberadamente en blanco.** No lo escribo de memoria en un documento legal: lo pone Alberto o lo confirma antes de firmar |
| **Domicilio de Alberto** a efectos de notificaciones | — | El que use para su actividad |
| Nombre completo, NIF y domicilio de Manuel Suárez | — | Firma como persona física salvo que facturase por sociedad |
| Fecha de inicio real del tratamiento | Desde cuándo tiene Manuel los datos | Ver abajo, «lo que este contrato NO arregla» |
| Categorías de datos y ramos | Sale del **inventario de la Fase 1** | Hasta ver las tablas no se sabe si hay art. 9 |

**Lo que este contrato NO arregla, y conviene saberlo antes de firmarlo:** firmarlo ahora **no legaliza
retroactivamente** el periodo en que Manuel ya tuvo los datos sin contrato. Lo que hace es (a) documentar
la relación, (b) gobernar la entrega y (c) dejar por escrito el borrado. Es lo correcto y es mejor que no
tenerlo, pero no borra el pasado: eso valóralo con la asesoría. La alternativa —no firmar nada— es peor
en todos los escenarios.

---

## CONTRATO DE ENCARGADO DE TRATAMIENTO

**En Sevilla, a [FECHA]**

### REUNIDOS

De una parte, **D. Alberto Suárez Gutiérrez**, mayor de edad, que actúa en su propio nombre y derecho
bajo el nombre comercial **«Grupo ASegura»**, con NIF **[NIF]** y domicilio a efectos de notificaciones
en **[DOMICILIO]**, en adelante el **RESPONSABLE DEL TRATAMIENTO**.

De otra parte, **D. Manuel Suárez [APELLIDO 2]**, mayor de edad, con NIF **[NIF]** y domicilio en
**[DOMICILIO]**, en adelante el **ENCARGADO DEL TRATAMIENTO**.

Ambas partes se reconocen capacidad legal suficiente para obligarse y

### EXPONEN

**I.** Que el RESPONSABLE desarrolla la actividad de **correduría de seguros** bajo el nombre comercial
«Grupo ASegura» y, en el marco de esa actividad, trata datos personales de sus clientes y de los tomadores, asegurados y beneficiarios de las
pólizas intermediadas.

**II.** Que el ENCARGADO ha desarrollado, por encargo del RESPONSABLE, una aplicación de gestión (CRM)
para dicha actividad, alojada hasta la fecha en cuentas de servicios en la nube (Supabase y Vercel)
**titularidad del propio ENCARGADO**, lo que ha supuesto el acceso y el tratamiento por su parte de los
datos personales referidos.

**III.** Que las partes han acordado el **traspaso de dicha aplicación y de los datos** a la
infraestructura del RESPONSABLE, y desean regular por escrito el tratamiento realizado por el ENCARGADO
conforme al **artículo 28 del Reglamento (UE) 2016/679 (RGPD)** y a la **Ley Orgánica 3/2018 (LOPDGDD)**.

Y a tal fin suscriben el presente contrato con arreglo a las siguientes

### CLÁUSULAS

#### 1. Objeto

El ENCARGADO tratará por cuenta del RESPONSABLE los datos personales necesarios para: (a) el
**desarrollo y mantenimiento** de la aplicación CRM de correduría, y (b) la **entrega íntegra** de dichos
datos al RESPONSABLE y su posterior **supresión** de los sistemas del ENCARGADO.

#### 2. Identificación de la información tratada

- **Categorías de interesados:** clientes de la correduría, tomadores, asegurados y beneficiarios de las
  pólizas; en su caso, personas de contacto de las compañías aseguradoras.
- **Categorías de datos:** identificativos (nombre, NIF/NIE, dirección, teléfono, correo electrónico),
  datos económicos y de facturación (incluidos datos bancarios de domiciliación), datos de las pólizas y
  de los siniestros, y datos de los bienes asegurados.
- **Categorías especiales (art. 9 RGPD):** **[SÍ / NO — a confirmar con el inventario de la Fase 1]**. Si
  existe ramo de **salud o vida**, se tratan datos relativos a la salud, y las medidas de seguridad de la
  cláusula 3.d se refuerzan conforme a la cláusula 8.

> ⚠️ Esta lista se cierra **con el inventario real de las tablas** (Fase 1 del traspaso), no antes. Un
> contrato que enumera categorías que nadie ha comprobado es papel mojado en una inspección.

#### 3. Obligaciones del ENCARGADO

El ENCARGADO se obliga a:

a) **Tratar los datos únicamente siguiendo instrucciones documentadas** del RESPONSABLE, incluidas las
   relativas a transferencias internacionales. No aplicarlos ni utilizarlos con fin distinto, ni
   comunicarlos a terceros, ni siquiera para su conservación.

b) **Confidencialidad**, de carácter indefinido y subsistente tras la terminación de este contrato,
   extensiva a cualquier persona que actúe bajo su autoridad.

c) **No subcontratar** ninguna de las prestaciones sin autorización previa y por escrito del
   RESPONSABLE. *(Se exceptúan los proveedores de infraestructura ya en uso —Supabase y Vercel—, que el
   RESPONSABLE autoriza expresamente en la cláusula 5.)*

d) **Medidas de seguridad (art. 32 RGPD)** apropiadas al riesgo, y en particular: cifrado en tránsito y
   en reposo, control de acceso individualizado con credenciales no compartidas, y no extracción de
   copias de la base de datos fuera de los sistemas autorizados.

e) **No conservar copias locales** (portátiles, discos externos, servicios de almacenamiento personales,
   correo electrónico) de la base de datos ni de volcados de la misma, salvo las estrictamente necesarias
   para el traspaso y por el tiempo imprescindible.

f) **Asistir al RESPONSABLE** en la respuesta al ejercicio de derechos (acceso, rectificación, supresión,
   oposición, limitación y portabilidad), comunicándole sin dilación cualquier solicitud que reciba
   directamente, sin responderla por su cuenta.

g) **Notificar las violaciones de seguridad** de que tenga conocimiento **sin dilación indebida y, en
   todo caso, dentro de las 24 horas** siguientes, con la información del art. 33.3 RGPD, a fin de que el
   RESPONSABLE pueda cumplir su plazo de 72 horas ante la AEPD.

h) **Poner a disposición del RESPONSABLE** toda la información necesaria para demostrar el cumplimiento
   de estas obligaciones y permitir auditorías.

i) **Entregar y suprimir** los datos conforme a la cláusula 6.

#### 4. Obligaciones del RESPONSABLE

Entregar al ENCARGADO los datos y accesos necesarios, velar por el cumplimiento previo del RGPD,
supervisar el tratamiento y realizar, cuando proceda, la evaluación de impacto.

#### 5. Proveedores de infraestructura autorizados

El RESPONSABLE autoriza expresamente el uso de **Supabase** y **Vercel** como subencargados durante el
periodo de traspaso, con tratamiento en la Unión Europea salvo que se acredite lo contrario. Concluido el
traspaso, el ENCARGADO **eliminará el proyecto** de ambos servicios conforme a la cláusula 6.

#### 6. Entrega, supresión y acreditación

1. El ENCARGADO entregará al RESPONSABLE la totalidad de los datos y del código, en formato utilizable, en
   la fecha que acuerden. Se dejará constancia escrita de la **fecha de entrega**.
2. El ENCARGADO **no suprimirá nada** hasta que el RESPONSABLE le confirme por escrito que el traspaso
   está verificado y en funcionamiento.
3. Recibida esa confirmación, el ENCARGADO **suprimirá definitivamente** los datos, incluidas copias de
   seguridad y cualesquiera copias locales, y **eliminará el proyecto de Supabase y de Vercel**, en un
   plazo máximo de **[30] días naturales**.
4. El ENCARGADO **acreditará la supresión por escrito** al RESPONSABLE (basta correo electrónico
   indicando qué se ha borrado y en qué fecha), documento que quedará unido a este contrato.
5. Podrá conservar los datos **bloqueados** el tiempo estrictamente necesario para atender
   responsabilidades derivadas del tratamiento, y solo mientras subsistan.

> Los apartados 2, 3 y 4 son los que de verdad cierran el traspaso: la promesa de borrar sin fecha ni
> acreditación no vale de nada, y borrar antes de tiempo deja sin red la comparación lado a lado.

#### 7. Duración

Desde **[FECHA DE INICIO REAL DEL TRATAMIENTO]** hasta la acreditación de la supresión (cláusula 6.4).
Las obligaciones de confidencialidad subsisten indefinidamente.

#### 8. Datos de categoría especial

Si del inventario resulta que se tratan datos relativos a la **salud**, las partes reconocen que resulta
de aplicación el art. 9 RGPD y el ENCARGADO reforzará las medidas de la cláusula 3.d, sin que en ningún
caso puedan extraerse copias fuera de los sistemas autorizados.

#### 9. Responsabilidad y legislación aplicable

Cada parte responderá de los incumplimientos que le sean imputables conforme al art. 82 RGPD. Este
contrato se rige por el RGPD, la LOPDGDD y el Derecho español, sometiéndose las partes a los **juzgados y
tribunales de Sevilla** con renuncia a cualquier otro fuero.

---

Y en prueba de conformidad, firman por duplicado en el lugar y fecha indicados.

| EL RESPONSABLE | EL ENCARGADO |
|---|---|
| Fdo.: **D. Alberto Suárez Gutiérrez** | Fdo.: **D. Manuel Suárez [APELLIDO 2]** |

---

## Anexo — Registro de la entrega y del borrado

Se rellena a medida que avanza el traspaso. Es la prueba documental de la cláusula 6.

| Hito | Fecha | Acreditado por |
|---|---|---|
| Contrato firmado por ambas partes | | |
| Entrega de los datos (volcado al schema `seguros`) | | |
| Verificación end-to-end y confirmación escrita al ENCARGADO | | |
| Supresión en Supabase (proyecto eliminado) | | |
| Supresión en Vercel (proyecto eliminado) | | |
| Transferencia del repositorio de GitHub | | |
| Acreditación escrita de la supresión | | |
