# BORRADOR P15 — Textos legales de las señales de patrimonio (26/10/2026)

> **Estado: BORRADOR. NO ACTIVO. Pendiente de aprobación de Alberto (y, si se quiere, de un asesor).**
> Todo lo de este documento está en el código detrás del interruptor `PATRIMONIO_SENALES_ACTIVAS` (env, apagado por
> defecto; solo el valor exacto `1` enciende). Apagado: no se muestra nada nuevo, no se escribe ningún consentimiento nuevo,
> no se calcula ni se lee ninguna señal, y `VERSION_TEXTOS_LEGALES` sigue siendo `2026-10-v1`.
> Los textos de abajo son los que el código pinta hoy. Si Alberto cambia una palabra, se cambia el fichero indicado y, si es de
> fondo, la versión (`-borrador` desaparece al aprobar).

## 0. Decisiones que necesito de Alberto antes de encender nada

1. **Base legal: dos instrucciones que no casan.** Decisión de Alberto: «interés legítimo informado» para calcular las señales.
   Encargo de esta sesión: el motor solo corre si la identidad tiene `comercial_patrimonio` vigente (= consentimiento).
   Está implementado lo segundo (variante A, la conservadora) con `POLITICA_CALCULO = 'con_consentimiento'` en
   `packages/module-patrimonio/src/senales.ts`. Pasar a interés legítimo es **una línea** (`'interes_legitimo'`: se calcula salvo
   oposición, y `comercial_patrimonio = false` pasa a ser la oposición) **más** sustituir el apartado de la política por la
   variante B de abajo y rehacer la casilla como «No quiero…» (hoy es un «sí» explícito). **Hasta que decida, rige A.**
2. **Supresión (art. 17):** `ALCANCE_SUPRESION` (`packages/module-seguros-portal/src/supresion.ts`) no menciona las señales.
   Propuesta: tratarlas como `suprimible` (se borran las filas de `portal_patrimonio_senal` de la ficha cuando se atiende una
   supresión). No está hecho; **hay que decidirlo y cablearlo antes de activar**, y por eso el texto de privacidad no promete
   un plazo de conservación concreto.
3. **Conservación:** las señales cerradas (resueltas, retiradas, descartadas) se guardan para respetar los 180 días del
   descarte. ¿Plazo máximo (p. ej. 2 años) y borrado automático? No está hecho.
4. **«Interés legítimo» y llamadas comerciales:** el art. 66 LGTel exige consentimiento o base clara para llamadas comerciales;
   las señales **no contactan** a nadie y la cola de `/correduria` etiqueta el permiso (Lo ha pedido / Consiente / Sin permiso).
   Confirmar que la regla de la casa («nunca un envío sin tu OK») se mantiene también para quien tenga la casilla marcada.
5. **Inquilino:** nunca es lead sin su propio consentimiento (decisión de Alberto). El motor no lee ninguna tabla de inquilino
   (cepo). Su consentimiento propio llega con P17, no aquí.
6. **Descarte: 180 días** (decisión de Alberto): implementado (`DIAS_TRAS_DESCARTE`); vuelve solo si la condición sigue igual.
7. **Siete cosas que el borrador NO hace aún** (para que no se den por hechas): encargo de tratamiento (`encargo_patrimonio`),
   gate «gratis solo con póliza en vigor», «Abrir oportunidad» desde la cola, bloque «Patrimonio» en la ficha del cliente,
   la casilla también en «Configuración», Telegram inmediato para «Lo ha pedido», y el CHECK de `portal_consentimiento.tipo`
   (paso SQL manual, ver §5).

## 1. Aviso en la herramienta (pantalla «Patrimonio», encima de las listas, solo con la herramienta activada)

Fichero: `apps/asegura-portal/app/(portal)/patrimonio/ConsentimientoPatrimonio.tsx`.

> **Revisión de seguros de tus inmuebles**
> **¿Quieres que revisemos los seguros de tus inmuebles?**
> Lo que apuntas aquí es tuyo: lo usamos para enseñártelo y calcular tu rentabilidad y tu calendario. Si marcas la casilla,
> además, Grupo ASegura comprobará una vez al día si a tus inmuebles les falta algún seguro (por ejemplo, uno que nos has dicho
> que no tienen, un capital por debajo del valor estimado, un alquiler sin seguro de impago o una póliza de otra compañía a
> punto de vencer) y una persona de la correduría lo verá para proponértelo. No usamos los datos de tus inquilinos ni de tu
> comunidad. Esto no te envía ningún mensaje: solo te contactamos si lo pides con «Pedir precio» o si marcas la casilla.
> Detalle en la política de privacidad.

## 2. Casilla `comercial_patrimonio` y su retirada

Fichero del texto sellado: `packages/module-seguros-portal/src/consentimiento.ts`
(`TEXTO_CONSENTIMIENTO_COMERCIAL_PATRIMONIO`, versión `2026-11-p1-borrador`; al aprobar, quitar `-borrador`).

> ☐ Quiero que Grupo ASegura revise los seguros de los inmuebles que llevo en esta herramienta y me proponga, sin compromiso,
> cubrir lo que falte. Puedo retirarlo cuando quiera desde esta misma pantalla.

Reglas implementadas: independiente de la casilla `comercial`; **nunca premarcada**; la fila (`portal_consentimiento`,
append-only) sella IP, navegador y versión del texto; retirar = fila nueva `otorgado:false` con el mismo control, sin
confirmaciones; si el guardado falla la casilla vuelve a como estaba; una marca sobre otra versión del texto no consiente el nuevo.

Mensajes de estado: «Anotado: revisaremos los seguros de tus inmuebles.» · «Anotado: dejaremos de revisarlos y retiraremos lo
que tuviéramos apuntado (puede tardar hasta un día).» (la retirada de las señales abiertas la hace el cron diario) · «Todavía no
nos has dicho nada: mientras tanto, no revisamos los seguros de tus inmuebles.»

## 3. Ampliación de la política de privacidad — variante A (la que está en el código: consentimiento)

Fichero: `apps/asegura-portal/app/legal/privacidad/ApartadoSenalesPatrimonio.tsx` (se pinta como «3 bis» solo con el
interruptor; entra con `VERSION_TEXTOS_LEGALES_PATRIMONIO = 2026-11-v1`).

> **3 bis. Revisión de los seguros de tus inmuebles (solo si la marcas)**
> En «Patrimonio» puedes marcar una casilla, desmarcada por defecto y independiente del resto del servicio: «Revisión de
> seguros de mis inmuebles». **Solo si la marcas**, una vez al día comparamos los inmuebles, los contratos de alquiler y las
> pólizas de otras compañías que has apuntado ahí con los seguros que tienes con nosotros, y la correduría anota una «señal»
> cuando detecta alguna de estas situaciones: un inmueble que nos has dicho que no tiene seguro; un capital asegurado por debajo
> del valor de reconstrucción estimado a partir del Catastro; un alquiler vivo sin seguro de impago; una póliza con otra compañía
> que vence en los próximos 60 días; o un inmueble con hipoteca.
> - **Qué datos usa y guarda:** el nombre que tú das al inmueble, el tipo de señal y las cifras del riesgo (metros cuadrados,
>   valor estimado, capital asegurado, fecha de vencimiento). No usa ni guarda el nombre, el DNI, el correo ni la renta de ningún
>   inquilino, ni los datos de tu comunidad de propietarios o de su administrador.
> - **Quién lo ve:** solo la correduría, en su pantalla interna. No se comunica a ninguna compañía ni a terceros.
> - **Qué no hace:** no enviamos ningún mensaje por esta causa. Una persona de la correduría decide si te contacta, y solo lo
>   hace si lo has pedido (con «Pedir precio») o si has marcado la casilla.
> - **Base legal:** tu consentimiento (art. 6.1.a RGPD). Lo puedes retirar cuando quieras desmarcando la casilla en la misma
>   pantalla; retirarlo no afecta a lo ya hecho. Al retirarlo dejamos de calcular y retiramos las señales que estuvieran
>   abiertas (puede tardar hasta un día).
> - **Descartes:** si la correduría descarta una señal, no se vuelve a anotar hasta pasados 180 días, y solo si la situación
>   sigue siendo la misma.

Cada frase es una afirmación sobre el código (mapa en la cabecera del componente; cepo
`test/regression-portal-patrimonio-senales.test.ts`).

## 3-B. Variante B (si Alberto confirma «interés legítimo informado»; NO está en el código)

Sustituye a las viñetas «Solo si la marcas» y «Base legal»:

> **3 bis. Revisión de los seguros de tus inmuebles**
> Para ayudarte a no quedarte sin cobertura, una vez al día comparamos los inmuebles, contratos y pólizas de otras compañías
> que has apuntado en «Patrimonio» con los seguros que tienes con nosotros, y la correduría anota una «señal» cuando detecta
> [misma lista]. **Base legal:** nuestro interés legítimo en ofrecer a nuestros clientes la revisión de sus seguros (art. 6.1.f
> RGPD, considerando 47), tras ponderarlo con tus derechos: solo usamos datos que tú has apuntado, no usamos datos de
> inquilinos ni de la comunidad, no enviamos ningún mensaje por esta causa y solo la correduría ve la señal. **Puedes oponerte
> en cualquier momento** desmarcando/«No quiero esta revisión» en «Patrimonio» o escribiendo a {correo del mediador}; si te
> opones dejamos de calcular y retiramos lo anotado. Contactar contigo con una propuesta sigue requiriendo que lo hayas pedido
> («Pedir precio») o que lo consientas.

Requiere además: casilla invertida («No quiero…», `comercial_patrimonio=false` = oposición), informar **antes** de calcular
(aviso al entrar en Patrimonio, no solo en la política) y `POLITICA_CALCULO='interes_legitimo'`.

## 4. Qué cambia en el código al activar (para que Alberto sepa qué aprueba)

- `versionTextosLegales(true)` → `2026-11-v1` / fecha `2026-10-26`: la acreditación `lds_art19` y las solicitudes de supresión
  se sellan con ella; **todos los clientes volverán a acreditar la información precontractual al entrar** (es el coste de
  subir la versión; ver la nota en `packages/module-seguros/src/mediador.ts`).
- Las acreditaciones de `apps/asegura` (`presupuesto-aceptacion.ts`) siguen sellando `VERSION_TEXTOS_LEGALES` base: **pendiente
  de decidir** si deben usar la ampliada cuando el interruptor esté encendido.
- Pasos de despliegue (en este orden): (1) SQL `apps/asegura/prisma/sql/2026-10-26_portal_patrimonio_senal.sql`;
  (2) ensanchar a mano el CHECK de `portal_consentimiento.tipo` (§5); (3) desplegar; (4) poner `PATRIMONIO_SENALES_ACTIVAS=1`
  en `central-asegura` **y** `asegura-portal` y redeploy; (5) ensayo `GET /api/cron/senales-patrimonio?contar=1`.

## 5. Paso SQL manual (no está en ningún fichero, a propósito)

`seguros.portal_consentimiento.tipo` tiene un CHECK con `avisos, comercial, lds_art19`. Hay que sustituirlo por uno que admita
también `comercial_patrimonio` (la sentencia de borrado de la restricción antigua no se escribe en ficheros del repo). Sin
ese paso, la casilla devuelve 500 y no se registra nada: falla cerrado.
