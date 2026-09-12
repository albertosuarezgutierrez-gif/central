# Portal (asegura-portal): la póliza aportada es de un tercero — design

> Origen: sesión del 09-12/09/2026. Alberto subió con su cuenta una póliza de
> hogar de Mapfre cuyo tomador/asegurado es su madre (María Antonia Gutiérrez
> Alcalá). Confirmado por Alberto: «esta es de mi madre». Dos peticiones suyas:
> que se le notifique a ella, y que si no está en el sistema se le pregunte al
> que sube qué vinculación tiene con esa persona para asignarla como contacto.

## 1. Contexto medido antes de diseñar

Al probar la subida real (`apps/asegura-portal` → `/boveda` → «Elegir PDF o
foto»), sobre el PDF real de esa póliza:

- **La 1ª pasada de `extraerPoliza()` (`lib/extraer-poliza.ts`) funciona bien**:
  compañía, nº póliza, ramo y vencimiento salieron correctos. Descarta que
  falte la clave de IA en producción.
- **La 2ª pasada (campos propios del ramo) falló esta vez** (`camposRamo:
  'no_leidos'`) — el mismo fallo intermitente ya medido el 07/09/2026
  ("OpenRouter: respuesta vacía"), sin reintento hoy.
- **Ni forma de pago ni coberturas se piden en NINGÚN ramo** — no es un fallo
  de lectura, el catálogo (`campos-ramo.ts`) nunca las incluye, pese a que el
  PDF las trae con total claridad (tabla completa de coberturas, "SEMESTRAL,
  domiciliación bancaria").
- **`pdf-parse` extrae el texto perfectamente** (35.076 caracteres, con la
  codificación rota típica de Mapfre ya documentada, no bloqueante): descarta
  que sea un PDF ilegible.
- **El tomador/asegurado leído en el texto (`MARIA ANTONIA GUTIERREZ ALCALA`,
  DNI `28448672H`) no coincide con quien sube el documento.** Hoy `extraer-
  poliza.ts` ni siquiera pide ese campo en su esquema fijo — nunca se ha
  podido detectar este caso.

Este documento cubre **solo** la pieza de "la póliza es de un tercero": la
notificación a esa persona y su alta como contacto. La corrección de forma de
pago/coberturas/2ª-pasada-sin-reintento se trata aparte (fuera de este spec).

## 2. Decisiones tomadas con Alberto

1. **Ambas cosas, según si hay contacto a mano**: si en el momento de subir se
   conoce el email del tercero, se dispara una invitación real. Si no, se
   queda como aviso pendiente para que el corredor lo complete después.
2. **Detección automática, se pregunta solo si hay duda** (no un selector
   manual "de quién es" antes de subir, y tampoco fusión automática de fichas
   por nombre — ver §7, decisión explícita de NO HACER).
3. **El sistema de invitaciones se amplía** para admitir como objeto una
   póliza **aportada** (`portal_poliza_declarada`), no solo pólizas de la
   cartera real. Con el matiz técnico del §5.2: se implementa como un
   mecanismo HERMANO del actual, no forzando la tabla `portal_invitacion`
   existente (motivo en ese apartado).
4. Añadidas en esta ronda: pantalla de confirmación antes de enviar el correo
   (§5.4), copy del correo explicando por qué llega (§5.4), y el aviso interno
   pendiente lleva contador/badge en `/correduria` como el resto de colas
   (§5.5).

## 3. Extracción: el nuevo campo `nombreTomador`

Se añade al esquema FIJO de la 1ª pasada de `extraerPoliza()` (la que
funciona de forma fiable), no al catálogo por ramo de la 2ª:

```
"nombreTomador": string | null
```

Reglas:
- Se pide "el nombre completo del TOMADOR o ASEGURADO tal como figura en el
  documento", con la misma disciplina que el resto: valores de cajón (`n/a`,
  `no consta`…) se anulan a `null` en la normalización, nunca se inventan.
- **No se pide ni se guarda el DNI del tercero.** `portal_poliza_declarada`
  no está cifrada (a diferencia de `clientes.dni`/`direccion` en el schema
  del corredor, que sí llevan `PII_ENCRYPTION_KEY`), y el nombre basta para
  el aviso y la invitación — el mismo principio de minimización que ya rige
  no guardar el IBAN de un recibo.
- Vive junto al resto de `PolizaLeida` en `@central/module-seguros-portal`,
  con su propio `normalizarNombreLeido()` testeado (casos: vacío, valor de
  cajón, con dobles espacios/mayúsculas sostenidas del OCR de Mapfre).

## 4. Detección: cuándo se pregunta y cuándo no

Se ejecuta al guardar la póliza (mismo momento en que hoy se decide `fuente`/
`camposRamo`), comparando `nombreTomador` (si se leyó) contra el nombre del
titular de la ficha vinculada a la identidad que sube (`portal_vinculo` →
`clientes.nombre`, ya legible por el rol del portal — se usa para "Seguros
que te han autorizado a ver", así que el GRANT ya existe).

| Caso | Nombre leído | Vínculo con ficha | Resultado |
|---|---|---|---|
| A | `null` (no se leyó ninguno) | — | Se guarda como hoy. Sin pantalla nueva. |
| B | Coincide razonablemente con el titular de la ficha | Sí | Se guarda como hoy. Sin pantalla nueva. |
| C | No coincide | Sí | Tras guardar: *"Hemos leído que el titular de este documento es {nombre}. ¿Eres tú?"* — Sí, soy yo / No, es de otra persona. |
| D | Se leyó un nombre | No (sin vínculo, o email no vinculado a ninguna ficha) | Se pregunta igual, en tono neutro (no afirma que sea de otra persona, solo confirma): *"Hemos leído que el titular es {nombre}. ¿Es tuyo o de otra persona?"* |

La comparación (caso C) es **laxa y solo para decidir si se pregunta**, nunca
para escribir nada por su cuenta: normaliza mayúsculas/acentos y compara por
solape de tokens (nombre + al menos un apellido en común cuenta como
"coincide"; nombres de casada, un segundo apellido distinto, etc. no deben
disparar una pregunta molesta sobre la propia póliza). Un falso "no coincide"
solo cuesta una pregunta de más, nunca escribe un dato erróneo — por eso el
umbral puede ser conservador (preguntar de más es barato; no preguntar cuando
hacía falta es el fallo caro).

🚨 **Esto NO es agrupar identidades por nombre** (la regla que prohíbe el
`CLAUDE.md` raíz): no se fusiona ninguna ficha, no se escribe ningún vínculo
por esta comparación. Es solo el disparador de una pregunta que luego
contesta una persona.

## 5. El flujo tras confirmar "es de otra persona"

### 5.1. Qué se pide

Dos campos, uno obligatorio y otro no:
- **Relación** (obligatoria) — reutiliza `RELACIONES_INVITACION` de
  `@central/module-seguros-portal` (Cónyuge/Pareja, Hijo/a, Padre/Madre,
  Hermano/a, Amigo/a, Empleado/a, Socio/a, Otra). Sin relación no se puede
  etiquetar el aviso ni el correo tiene saludo con sentido.
- **Email** (opcional) — *"Si tienes su email, se lo mandamos ahora mismo. Si
  no, lo guardamos para retomarlo luego."*

### 5.2. Con email: invitación real — mecanismo HERMANO, no la misma tabla

`portal_invitacion` hoy exige `otorganteClienteId` **NOT NULL** (la ficha de
la CARTERA cuyos seguros se abren) y su aceptación crea una
`portal_autorizacion` sobre una póliza real. Nuestro caso es distinto en las
dos puntas:

- Quien sube puede no tener ficha en la cartera (es un lead, o ni siquiera
  eso).
- Lo que se comparte no es "mis pólizas de la cartera": es un dato que otro
  leyó de un documento y que **es de ella**, no de quien lo subió. Aceptar la
  invitación no debe dar acceso a la fila del uploader — debe darle a ella
  **su propia fila**.

Forzar esto en `portal_invitacion` obligaría a hacer `otorganteClienteId`
nullable (rompiendo una garantía que hoy varias reglas y cepos dan por
sentada) y a bifurcar la semántica de "aceptar" según el tipo de fila. Es más
seguro y más claro crear una tabla hermana, reutilizando la infraestructura ya
construida (token de 256 bits hasheado, `hashCanal()`, límite de envíos,
`enviarInvitacion()`/plantilla de correo, `CAMPOS_PROHIBIDOS_EN_INVITACION`):

```
portal_notificacion_tercero
  id                      uuid PK
  poliza_declarada_id     uuid  FK → portal_poliza_declarada (la fila original, del uploader)
  creada_por_identidad_id uuid  FK → portal_identidad (quien subió)
  nombre_declarado        text  (el nombre leído/confirmado del tercero, para el saludo — igual que invitado_nombre)
  relacion                text  CHECK contra el mismo vocabulario que portal_invitacion.relacion
  destinatario_canal_hash text NULL  (NULL = "sin contacto todavía", el aviso interno)
  token_hash              text NULL UNIQUE (solo se rellena cuando SÍ hay email y se manda el correo)
  creada_en, caduca_en, aceptada_en, aceptada_por_identidad_id,
  rechazada_en, rechazada_por_identidad_id, retirada_en   (mismo patrón que portal_invitacion)
```

**Al aceptar** (código de un solo uso al correo, igual que cualquier acceso al
portal): se COPIA lo declarado (compañía, nº póliza, ramo, prima, vencimiento,
`datosRamo`) a una fila NUEVA de `portal_poliza_declarada` con
`identidadId` = la de quien acepta. Esa fila nueva lleva además
`origenNotificacionId` (columna nueva, nullable, FK →
`portal_notificacion_tercero.id`): su sola presencia es la señal de "esto no
lo subió esta persona, lo trajo la subida de otra" — no se reutiliza
`procedencia` (que describe de dónde sale cada CAMPO de `datosRamo|catastro|
documento|declarado>`, no el origen de la fila entera). La pantalla usa esa
columna para no presentarla como si el aceptante la hubiera subido él mismo
(mismo espíritu que el chip "Añadida por ti" ya existente para las aportadas).
La fila **original** del uploader no se toca ni se borra: sigue siendo su
apunte.

Esto es deliberadamente distinto de `portal_autorizacion` (que da acceso de
LECTURA a la fila de otro) porque una aportada no tiene "dueño de la
cartera" que pueda autorizar — nace y muere con la identidad que la declaró.
Copiar es más simple que inventar un tercer destinatario de autorización.

### 5.3. Sin email: aviso interno pendiente

Misma tabla, `destinatario_canal_hash` y `token_hash` a `NULL`. Aparece en
`/correduria` (panel del corredor) como una fila más, con el nombre
declarado y la relación, para que Alberto la complete cuando tenga el
contacto — en ese momento se rellenan los dos campos y se dispara el envío
(mismo camino que 5.2).

### 5.4. Confirmación antes de enviar, y copy del correo

- Tras rellenar relación (+ email opcional), antes de que salga nada: *"Vamos
  a avisar a {email}, como tu {relación}. ¿Confirmas?"* — con opción de
  cancelar o corregir el email. El nombre viene de una IA leyendo un PDF y el
  email lo teclea una persona: un paso de confirmación es barato comparado
  con el coste de escribirle a un desconocido.
- El correo dice explícitamente el porqué: *"{quien sube} ha guardado un
  documento en el que apareces como titular"* — no un genérico "te invito a
  mi portal". Sigue sin llevar compañía, nº de póliza ni importe
  (`CAMPOS_PROHIBIDOS_EN_INVITACION` se reutiliza tal cual).

### 5.5. Visibilidad de la cola pendiente

El aviso sin email (5.3) suma al contador de la sección donde viva en
`/correduria` (mismo patrón `onContador?: (n) => void` de `Secciones.tsx` que
ya usan Retención/Contactos) — nunca una cola sin badge, por la regla ya
escrita en este repo: un aviso en una pantalla que nadie abre no existe.

## 6. Reglas heredadas sin cambios

- La relación (parentesco) **nunca** va en el cuerpo del correo —
  `CAMPOS_PROHIBIDOS_EN_INVITACION` ya lo impone y se reutiliza tal cual.
- El límite de envíos (`MAX_INVITACIONES_DIA = 10` por identidad) se
  reutiliza para esta tabla hermana; no se inventa un límite nuevo.
- El token no abre sesión por sí mismo (se lo comerían escáneres/prefetch);
  el código de un solo uso al correo es lo que de verdad canjea — mismo
  mecanismo que `lib/enlace-acceso.ts` e `invitacion.ts`.
- `nombreTomador`/`nombre_declarado` son datos **declarados, no verificados**
  — la persona real prueba quién es al aceptar con su propio código, igual
  que en toda invitación de este portal.

## 7. Explícitamente FUERA de alcance (decisión, no olvido)

**No se busca automáticamente si el tercero ya tiene ficha en la cartera
comparando su nombre.** El `CLAUDE.md` raíz de este repo prohíbe agrupar
personas por nombre en vez de por identificador (NIF/vínculo verificado) —
la comparación del §4 es solo un disparador de PREGUNTA, nunca una fusión de
fichas ni una búsqueda en toda la cartera de 32.600 registros. Si el tercero
ya es cliente, lo detecta el corredor a mano al ver el aviso (5.3/5.5); no se
automatiza aquí porque el coste de fundir dos personas por error es mucho
mayor que el de mandar una invitación de más a alguien que ya tenía ficha.

## 8. Compatibilidad con lo que viene después (no se construye aquí)

El diseño actúa **por documento**, no por sesión de subida completa: cuando
se construyan la subida múltiple y la vía de "recibo bancario" (ambas
pendientes, fuera de este spec), cada documento dispara su propia detección
sin retocar esta pieza — un lote de tres documentos de tres personas
distintas produce, como mucho, tres preguntas independientes.

## 9. Testing

- `nombreTomador`: normalización (valores de cajón, mayúsculas sostenidas de
  Mapfre, `null`).
- Comparación de nombres (§4): coincide exacto, con acentos, con apellido de
  casada (no debe disparar pregunta), sin nombre leído (caso A, no pregunta),
  sin vínculo (caso D, pregunta neutra).
- `portal_notificacion_tercero`: CHECK de que `token_hash` solo se rellena
  cuando `destinatario_canal_hash` no es NULL; que aceptar COPIA (no
  autoriza) una fila nueva bajo la identidad aceptante; que la relación
  nunca aparece en el cuerpo del correo (reutilizar el cepo existente sobre
  la nueva plantilla); que el límite diario de envíos cuenta también estas
  filas.
- Regresión de visibilidad: la fila pendiente sin email aparece en el
  contador de `/correduria` y desaparece al resolverse (enviada/aceptada/
  rechazada/retirada), nunca queda huérfana sin badge.
