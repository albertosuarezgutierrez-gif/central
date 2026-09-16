# Portal: quién es el titular de una póliza aportada — design

> Origen: sesión del 16/09/2026. Alberto reportó que las pólizas de Juan Manuel
> subidas desde el portal no aparecían en su ficha del corredor (arreglado en
> esta misma sesión, ver `apps/asegura/lib/cartera-ficha.ts::listarDeclaradas`).
> A partir de ahí, tres preguntas suyas encadenadas: qué pasa si la póliza es
> de una empresa no fichada, qué pasa si es de un familiar, y si la IA — con
> "todo el contexto del negocio" — puede resolverlo sola y avisar por Telegram
> solo cuando hay problema.

## 0. Relación con `2026-09-12-portal-poliza-tercero-design.md`

Ese spec (sin implementar) cubre el mismo caso — la póliza es de un tercero —
con una decisión que este documento **reconcilia, no descarta**: su §7 prohíbe
"buscar automáticamente si el tercero ya tiene ficha en la cartera comparando
su nombre", citando la regla del `CLAUDE.md` raíz contra agrupar personas por
nombre en vez de por identificador.

Esa prohibición sigue vigente **para el universo que protegía**: buscar por
nombre contra las 32.600 fichas de toda la cartera es peligroso (dos
homónimos sin relación). Pero este spec añade un universo distinto y ya
acotado por el propio Alberto: **las relaciones que ESA ficha concreta ya
tiene declaradas** (`cliente_relaciones` — cónyuge, madre, hijo... normalmente
2-5 filas). Comparar el nombre leído contra ese conjunto pequeño y ya vetado
por una persona (Alberto o el propio cliente, al declarar la relación) no es
"agrupar por nombre a ciegas": es preguntar "¿ya nos dijiste quién es esta
persona?" antes de volver a preguntarlo.

**Este spec sustituye §2-§5 del anterior** (el flujo de detección y de
notificación) y **conserva sin cambios sus §6-§9** (reglas heredadas, alcance
explícitamente fuera, testing de la parte de invitación/tabla hermana). El
mecanismo de notificación al tercero (`portal_notificacion_tercero`,
confirmación antes de enviar, copy del correo) sigue siendo el camino cuando
NO hay auto-cotejo — este spec solo añade el paso previo que puede evitar
llegar a preguntar.

## 1. Alcance

Se aplica **solo al crear** una póliza declarada (`portal_poliza_declarada`),
en el mismo momento en que hoy se decide `fuente`/`camposRamo`
(`POST /api/polizas`, `apps/asegura-portal`). Editar una declarada después
(`PATCH /api/polizas/[id]`) no vuelve a disparar nada de esto.

No toca ningún flujo con reloj legal (siniestros, supresión RGPD,
autorizaciones): la IA aquí solo identifica DE QUIÉN es un documento, nunca
decide un estado con consecuencia legal. Ver razonamiento completo en la
conversación de origen — es la misma regla que ya sigue todo el repo
("IA enruta, código decide") aplicada a este caso.

## 2. Flujo de decisión

Al guardar, con `nombreTomador` ya leído por `extraerPoliza()` (campo nuevo,
igual que en el spec del 12/09, §3 — se mantiene tal cual: esquema FIJO de la
1ª pasada, valores de cajón anulados a `null`, sin guardar DNI del tercero):

```
1. nombreTomador === null           → se guarda como hoy. Sin preguntar nada.
2. Coincide con el nombre del propio → titularTipo='propio'. Sin preguntar nada.
   cliente (comparación laxa, solo
   dispara la siguiente pregunta,
   nunca escribe un vínculo — igual
   que el spec del 12/09 §4)
3. No coincide → ¿casa con una       → titularTipo='familiar' + la relación
   relación YA DECLARADA en           YA CONOCIDA (cónyuge/madre/hijo...).
   `cliente_relaciones` de esa         Sin preguntar nada. ← NUEVO en este spec
   ficha? (nombre + apellido en
   común, mismo umbral laxo)
4. No casa con ninguna relación      → igual que el spec del 12/09 §5: se
   conocida, y tampoco tiene forma     pregunta con PROPUESTAS (no texto
   de empresa (eso ya lo cubre la      libre): "¿Quién es {nombre}?" con
   casilla existente)                  botones Familiar / Empresa / Otra
                                        persona, el más probable ya marcado
                                        si hay alguna pista (mismo apellido
                                        que el cliente → sugiere Familiar).
```

El caso 3 es la única pieza nueva de verdad. El caso 4 es el flujo del spec
del 12/09 (con el matiz de botones en vez de "¿eres tú? sí/no" a secas — ver
§3).

## 3. El caso 4, con propuestas y sin dejar nada sin asignar

- Si elige **Familiar** u **Otra persona**: dos campos cortos, nombre y
  relación (reutiliza `RELACIONES_INVITACION` de
  `@central/module-seguros-portal`, igual que el spec del 12/09 §5.1).
- Si elige **Empresa**: pasa por la casilla/flujo que YA EXISTE hoy
  (`titularTipo='empresa'`, nombre + CIF) — no se duplica ese camino.
- **Nunca queda sin asignar.** Si no contesta o la respuesta no aclara nada,
  se asigna `titularTipo='otro'` con el nombre leído del documento, marcado
  como sin confirmar (nuevo valor del enum, junto a `propio`/`empresa`/
  `familiar`). No hay un estado "sin identificar" que se quede huérfano para
  siempre: `otro` sin confirmar es visible y accionable (aparece en el aviso
  de Telegram y en la cola de `/correduria`), pero no es un limbo.

## 4. Aviso: Telegram SUMA a la cola de `/correduria`, no la sustituye

El spec del 12/09 (§5.5) ya diseñó la cola visible en `/correduria` con
badge, para el corredor que abre esa pantalla a diario — eso se mantiene tal
cual, es la fuente de verdad de "qué queda pendiente".

Se añade un **aviso Telegram** (nueva entrada de catálogo,
`lib/telegram/catalogo.ts`, obligatoria en el mismo PR) que se dispara
**siempre que se llega al caso 4** (no solo si queda sin resolver del todo):
en cuanto el auto-cotejo silencioso (casos 2-3) no basta y hay que preguntarle
algo al cliente, Alberto lo sabe al momento — incluso si el cliente contesta
bien, porque es información nueva sobre su cartera que antes no veía.
Mensaje: nombre leído, quién lo subió, qué eligió el cliente (o que quedó sin
confirmar) y enlace a la ficha.

No es bloqueante ni sustituye la cola — es la inmediatez que la cola no da
(la cola solo se ve si Alberto la abre; Telegram le llega sin que la abra,
misma razón por la que existen los demás avisos proactivos del catálogo).

## 5. Datos

Se ensancha `portal_poliza_declarada` (mismo espíritu que el spec del 12/09,
que ya proponía tocar esta tabla para `titularTipo`):

- `titular_tipo`: CHECK ampliado a `propio | empresa | familiar | otro`
  (antes `propio | empresa`, con `null` = no se preguntó).
- `titular_relacion` (texto corto: "madre", "cónyuge"...) — solo con
  `familiar` u `otro`.
- `titular_nombre_leido` — el nombre CRUDO leído del documento, se guarda
  siempre que se extrajo alguno (permite reintentar el cotejo más adelante,
  p. ej. si se declara la relación a mano después desde la ficha).
- `titular_confirmado` (boolean) — `false` cuando se asignó `otro` sin que el
  cliente contestara (caso 3 de §3); `true` en cualquier otro caso.

## 6. Impacto aguas abajo (ya construido esta sesión)

- `apps/asegura/lib/leads-portal.ts` (`fichasDeEmpresas`/cotejo): se añade un
  brazo `familiar` — si `titularTipo='familiar'` y el nombre casa con una
  ficha real de la cartera (vía la relación ya vinculada), el lead se coteja
  contra ESA ficha, no la personal de quien sube — mismo patrón que ya existe
  para `empresa`.
- `apps/asegura/lib/cartera-ficha.ts` (`listarDeclaradas`, PR de esta misma
  sesión): `PolizaDeclaradaFicha` gana `titularRelacion`; el cotejo
  `yaEnCartera` sigue sin comprobarse contra la ficha del familiar (lo mismo
  que ya se documentó para `empresa`: eso es trabajo de la cola de leads, no
  de la ficha).
- `apps/plataforma`: la fila de "Aportadas desde el portal" en la ficha del
  cliente pasa a decir "a nombre de {relación}: {nombre}" cuando aplique, en
  vez de solo "a nombre de su empresa".

## 7. Lo que se hereda sin cambios del spec del 12/09

- El mecanismo de notificación al tercero cuando NO hay auto-cotejo
  (`portal_notificacion_tercero`, confirmación antes de enviar, copy del
  correo, límite de envíos, token que no abre sesión por sí mismo) — §5, §6
  de aquel documento, sin tocar.
- El §7 de aquel documento (fuera de alcance: no se busca por nombre en TODA
  la cartera) sigue siendo la regla — este spec solo abre la excepción
  acotada de §0/§2.3 de aquí.
- El §8 (compatibilidad con subida múltiple / vía recibo bancario, aún sin
  construir): sigue aplicando igual — cada documento dispara su propia
  detección.

## 8. Testing

- Comparación de nombres contra `cliente_relaciones` (caso 3): coincide con
  una relación declarada → auto-asigna sin preguntar; no coincide con
  ninguna → cae al caso 4; ficha sin ninguna relación declarada → cae al
  caso 4 directamente (no hay contra qué comparar).
- Caso 4: el fallback sin respuesta asigna `otro` + `titular_confirmado=false`
  — nunca queda `titular_tipo` en `null` tras haber leído un nombre.
- Guardián que rompe a propósito el auto-cotejo (vacía `cliente_relaciones`
  antes de la comprobación) y verifica que SÍ pide propuestas y SÍ dispara el
  aviso Telegram — no basta verlo en verde, hay que verlo fallar primero
  (regla del `CLAUDE.md` raíz sobre cepos).
- Catálogo de Telegram: la fila nueva existe y el guardián de
  `lib/telegram/catalogo.test.ts` no rompe.
- Regresión de visibilidad (heredada del spec del 12/09 §9): la fila
  pendiente sin resolver sigue apareciendo en el contador de `/correduria`.

## 9. Explícitamente fuera de alcance (igual que el spec del 12/09)

- No se busca por nombre en toda la cartera (32.600 fichas) — solo contra las
  relaciones ya declaradas de la ficha concreta que sube el documento.
- No se toca ningún estado con reloj legal (siniestros, RGPD, autorizaciones).
- No se construye ningún chat conversacional multi-turno — la interacción es
  como mucho una pantalla con botones tras la lectura del documento.
