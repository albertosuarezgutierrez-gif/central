# Intranet de la correduría — banco de ideas

> Todo lo que salió de la conversación del **02/09/2026** con Alberto sobre la intranet de clientes
> de Grupo Asegura. Alberto: *«guarda las ideas que hay muchas muy buenas y quiero hacer todas»*.
>
> **Qué es esto:** el backlog con lo que cada idea necesita, lo que cuesta y lo que la bloquea.
> **Qué NO es:** un plan. Lo comprometido está en
> `docs/superpowers/specs/2026-09-02-asegura-portal-calendario-clientes-design.md` (v1) y en
> `docs/superpowers/specs/2026-09-01-asegura-portal-clientes-empresas-design.md` (producto completo).
> Al mover una idea a un spec, se marca aquí y se deja el enlace. Nada se borra sin cerrarse.

## La tesis, en una frase

El producto no es «mira tus pólizas» —eso sirve a 80 personas que ya tienen el teléfono de Alberto—
sino **«tráeme tus seguros y tus fechas, y yo te aviso de todo»**. Sirve a los ~32.520 leads *y* a
los clientes, y no compite por precio: compite por servicio. El precio llega después, en el
vencimiento, cuando ya eres tú quien avisa.

## Reglas que no se negocian (cualquier idea que las rompa, se rediseña)

1. **Avant2 cuesta 0,50€ por consulta y NO es idempotente.** Repetir la llamada crea otro proyecto y
   otro cargo. Ningún botón público lo dispara; ninguna vigilancia periódica lo dispara. Vigilar
   mensualmente a 4.000 leads = **2.000€/mes**. Se vigila la FECHA (gratis) y se tarifica **una vez**,
   contra el cupo y el motivo de `seguros.codeoscopic_consumo`.
2. **Las 28.729 pólizas del volcado histórico (`import_ref IS NOT NULL`) no generan ni un aviso.**
   Son vencimientos de 2013-2018. Sí valen como base estadística de precios (idea F).
3. **Un dato que no se ha mirado no es un dato que no existe.** `NULL` es «no se sabe» y se pinta
   como tal. Una hipótesis (la dirección del DNI, un capital calculado) se enseña como pregunta, no
   como precio.
4. **La procedencia se pinta siempre.** `compania` ≠ `calculado` ≠ `declarado`.
5. **Un aviso de «tengo mejor oferta para ti» es asesoramiento**, no información: arrastra análisis
   objetivo e IPID (RDL 3/2020). Los avisos de servicio son informativos.

## Ideas, por orden de lo que yo haría

### A. v1 — intranet de los clientes de la casa ✅ CONSTRUIDA (02/09/2026)
Sus pólizas de CIMA, su calendario de vencimientos y la bóveda de pólizas de fuera.
**Estado:** código en `main` vía PR #2144. Tabla `seguros.portal_obligacion` aplicada, derivador con
poda, calendario con la fecha accionable (art. 22 LCS) y **enlace de un clic** en el correo de acceso.
El aviso por correo sale de `apps/asegura` (el portal solo guarda hashes: no tiene destinatario).
**Bloqueo para que se vea:** las envs del proyecto Vercel `asegura-portal` (`DATABASE_URL`,
`PII_LOOKUP_KEY` idéntica a la de `central-asegura`, los dos secretos de sesión/canal y
`PORTAL_PUBLIC_URL`), más `CRON_SECRET` en `central-asegura`. Dependen de Alberto.
**Y antes de encender el aviso:** contar en modo ensayo y comprobar que salen ≤109.

### B. Motor de obligaciones genérico — tengas o no la póliza con nosotros 🟡 media hecha
🟢 **La mitad de abajo ya existe:** `portal_obligacion` nació colgada del **bien** con `poliza_id`
opcional y un enum de tipo que ya incluye `itv`, `carnet`, `recibo`, `mantenimiento`, `revision_gas` y
`libre`. Lo que falta es la UI de alta y los derivadores por tipo, no el modelo.
ITV, mantenimiento (por fecha **o por km**), carnet/CAP, tacógrafo, revisión de gas, certificado
energético, IBI, licencia de actividad, extintores, vacuna del perro. Cuelga del **bien**, no de la
póliza: por eso `portal_obligacion.poliza_id` es opcional desde el primer día.
**Por qué importa:** es la tesis comercial de Alberto — *«que se acostumbren a trabajar con nosotros
y al final se vienen»*. Y cada tipo mapea a un ramo, así que el calendario **es** el cuestionario que
la gente sí rellena (gas → hogar, mascota → RC animales, extintores → RC empresa).
**Coste:** cero externo. **Necesita:** la v1 desplegada.

### C. Registro abierto a cualquiera 🟡
Cualquier persona se registra, declara sus seguros y sus vencimientos, y recibe avisos.
**Por qué es la jugada limpia:** un lead que se registra y te declara su vencimiento **te está
pidiendo** el contacto. Resuelve solo el mayor riesgo legal del proyecto — escribir a los 25.882
ex-clientes de 2015-2018 es marketing a base fría de 8 años con la legitimación sin resolver.
**Necesita:** B. **Ojo:** cambia la superficie de ataque; el rol `prisma_asegura_portal` sigue SIN
BYPASSRLS y el aislamiento lo garantiza el código, no RLS.

### D. Alta por fotos — DNI + carnet + ficha técnica 🟡
Tres fotos y el resto lo hace la IA (`lib/extraer-poliza.ts` ya lee PDF y visión).

| Foto | Da para tarificar | Y además, gratis |
|---|---|---|
| **Ficha técnica** | matrícula, marca/modelo/versión, potencia, fecha de matriculación | la **ITV** calculada por norma → obligación sin preguntar nada |
| **Carnet** | antigüedad de carnet (entra directo en la prima) | **caducidad del carnet** (10 años; 5 a partir de los 65) |
| **DNI** | identidad, fecha de nacimiento | **caducidad del DNI** (10 años) + la dirección, que alimenta la idea E |

🚨 **No se guarda la imagen del DNI.** Se extraen los campos y se descarta el fichero: minimización.
Guardar copias de documentos de identidad es un frente de RGPD que no aporta nada al producto.

### E. Hogar desde la dirección del DNI, con Catastro 🟡
`@central/core-catastro` (`precalificarHogar()`, servicios libres, **gratis**) convierte la dirección
en referencia catastral, superficie, año de construcción y uso. Faltan dos cosas que Catastro no
sabe: **propietario o inquilino** y **capital de contenido**. Se preguntan. Dos toques.
**La regla:** la dirección del DNI es una **hipótesis a confirmar** —«¿es esta tu vivienda habitual?»—
no la base de un precio. Aunque acierte la mayoría de las veces, tú tarificas *a una persona*, no a
una estadística.

### F. Precio orientativo SIN llamar a Avant2 🔵 idea nueva, sin medir
Una horquilla —*«gente con una casa como esta paga entre X e Y»*— sacada de datos que **ya tienes**:
28.843 pólizas con prima, ramo y compañía, más las que la gente suba a la bóveda, que son **precios
actuales de la competencia**. Coste: **0€**. El orientativo además no promete nada, y deja Avant2
para cuando el usuario dice «quiero el precio de verdad».
⚠️ [Suposición] Las primas del volcado son de 2013-2018: sirven para ordenar, no para cotizar. Hay
que medir la dispersión antes de enseñar una horquilla, o será un número plausible y falso.

### G. Botón de «quiero el precio de verdad» (Avant2) 🔴 el que gasta
Retarificación real. **Nunca automático, nunca en lote.** Cupo, motivo y `intento_id` contra
`seguros.codeoscopic_consumo`, que ya existe justo para esto. Se dispara **una vez**, al acercarse el
vencimiento, o cuando el usuario lo pide explícitamente.

### H. Cambio de mediador 🟢 la mejor idea de la conversación
Un tomador nombra a Grupo Asegura mediador de una póliza que ya tiene con otra compañía.
**Por qué es tan bueno:** convierte un lead en cliente **sin tarificar, sin cambiar su seguro y sin
gastar un euro**. Y el efecto de segundo orden es el premio de verdad: [Probable] una vez eres el
mediador, esa póliza **empieza a entrar por CIMA**, con lo que su vencimiento y su prima dejan de ser
dato declarado y pasan a ser dato verificado, solo y para siempre. Además abre recibos y siniestros.
**Lo que ya tienes para hacerlo:** `@central/core-firma` — firma electrónica **avanzada eIDAS art.
26**, con hash SHA-256 del documento y evidencia, y el método `otp_email`, que es **exactamente** cómo
identifica el portal. La carta de nombramiento se pre-rellena con lo que la IA leyó de la póliza
(compañía, nº, tomador, DNI) y se firma en el mismo flujo. Molde vivo: `apps/rrhh`.
**Lo que NO se automatiza** [Probable]: cada compañía tiene su procedimiento y la aceptación no está
garantizada. Se automatiza el papel, la firma y el **estado** (`enviada → aceptada → rechazada`, con
fecha). Si una compañía rechaza sistemáticamente, se ve en los datos — y entonces hay con qué
reclamar. [Suposición] Y se hereda la póliza al precio que ponga la compañía en la renovación: se
gana la relación y el dato, no el margen inmediato.
**Fuente de candidatos, ya hoy:** cada póliza «de fuera» que un cliente suba a la bóveda de la v1.

### I. Empresas y flota 🟡 el nicho que más le interesa a Alberto
Administración con avisos configurables, cascada **administrador → jefe de flota → conductor**,
autorizaciones de empleado con `caduca_at` por defecto (el que se va deja de ver sin que nadie se
acuerde), y **QR pegado en el vehículo** que devuelve solo la tarjeta de la póliza: compañía, nº,
coberturas y teléfono de siniestros. Sin login, sin PII, para el momento del golpe.
**La regla que lo hace seguro:** el papel en el contrato **propone** el acceso, no lo concede. Ser
conductor del coche de tu padre no abre nada; le da al sistema una razón para sugerirle que te
autorice con un toque.
🚨 **Bloqueado por un dato que no existe:** `poliza_intervinientes` está al **1,7%** (504 filas para
28.834 pólizas) y `tipo_persona` es NULL en **32.519 de 32.600** fichas. Sin eso no sabes quién
conduce qué ni cuáles de tus fichas son empresas → **hacer J antes**.

### J. Medir el parser de CIMA 🔵 barato y desbloquea I
Comprobar si CIMA trae los intervinientes y el `tipo_persona` y el parser los descarta. Si es eso,
arreglarlo desbloquea la derivación automática de accesos **y** multiplica las personas alcanzables
por póliza (cónyuge, conductor habitual: cada una un lead con motivo verificado). Es el mayor retorno
por línea de código del proyecto y no está medido.

### K. Canales de aviso 🟡
Hoy solo existe **email** (adaptador ya escrito, mismo puerto que manda el OTP).
- **Push** (`@central/core-push`, gratis, sin Meta): para lo rutinario, cuando haya PWA instalable.
- **WhatsApp**: el canal que Alberto quiere por defecto. **Necesita WABA propia de Grupo Asegura** —
  la de Manuel no viaja en el traspaso, y no se pierde historial: `wa_opt_in` = 0 en las 32.600
  fichas. Plantillas pre-aprobadas (Authentication para el OTP, Utility para avisos) y opt-in en
  `portal_consentimiento`. **Dimensionar el coste por mensaje antes de prometer nada.**

### L. La bóveda como observatorio de precios 🔵
Cada póliza que alguien sube es el **precio actual de un competidor**, con compañía, ramo, coberturas
y fecha. Ningún comparador tiene eso: el comparador ve lo que cotiza, no lo que la gente paga.
**Para qué sirve de verdad** [Suposición]: saber el precio a batir *antes* de tarificar, y decidir a
qué compañía llevar cada riesgo. **Para qué probablemente NO sirve:** negociar volumen con una
compañía — su palanca es producción emitida, no una base de primas declaradas. Si el objetivo es un
acuerdo, el camino es concentrar producción en pocas compañías, y esta idea es lo que dice en cuáles.

## Preguntas abiertas para Alberto

- ¿A qué te referías con *«si se vende pólizas se puede aparentar en este y otros temas»*?
- Base de legitimación y plazo de conservación de las 25.882 fichas de 2015-2018. **El portal se
  puede construir sin resolverlo; cualquier campaña, no.**
- ¿Damos de alta la WABA de Grupo Asegura ya, o se sigue con email hasta tener volumen?
