# 🆕 Mejoras en la gestión de limpiezas — guía para Vanessa

Resumen de lo nuevo que puedes hacer desde el panel (Inicio y Agenda).
Texto pensado para enviártelo directamente. 👇

---

Hola Vanessa, he añadido varias cosas que pediste. Te las cuento rápido:

**✏️ Editar una limpieza**
Cada limpieza tiene ahora un botón **✏️ Editar**. Ábrelo para cambiar la **fecha**
(eso resuelve lo de haberla puesto hoy en vez de mañana 😉), la **hora**, el **tipo**,
la **limpiadora**, la **ventana** (checkout/checkin) o las **notas/especificaciones**.
👉 Si cambias la fecha o la hora de una limpieza que ya tiene limpiadora, **a ella le
llega un aviso automático** «⏰ Cambio de horario». No tienes que avisarla tú.

**↔️ Mover a otro día (rápido)**
Si solo quieres moverla de día, tienes un atajo **→ Mañana** (o **← Hoy**) en la
tarjeta, de un toque, sin abrir nada.

**↕️ Ordenar como tú quieras**
Por defecto la app ordena por urgencia (las que tienen entrada de huésped, primero).
Pero ahora **tú mandas**: usa las **flechas ↑ ↓** (o **arrastra** en el ordenador)
para poner las limpiezas en el orden que quieras que empiecen. Ese orden **lo ven
también las limpiadoras** en su app. ¿Quieres volver al orden automático? Botón
**↺ Orden automático**.

**🔥 Marcar urgente**
Si entra algo de última hora que es prioritario aunque no tenga huésped entrando,
márcalo **🔥 Urgente** y sube arriba del todo.

**⧉ Duplicar**
¿Mismo piso, otra reserva? Botón **⧉ Duplicar** y te crea una copia para que solo
cambies la fecha.

**➕ Añadir limpieza de último momento** (esto ya existía)
Botón **＋ Nueva limpieza** arriba a la derecha en el Inicio. Eliges cliente →
propiedad → fecha/hora/limpiadora/notas y listo. Úsalo cuando entre una reserva nueva.

**⚠️ No olvidar ninguna sin asignar**
Hay un filtro **«Sin asignar»** que te deja ver de un vistazo las limpiezas que aún
no tienen limpiadora, para que no se te escape ninguna. Y si asignas dos limpiezas a
la misma limpiadora muy pegadas en hora, te avisa.

**📝 Las notas llegan a la limpiadora**
Lo que escribas en **Notas** al crear o editar una limpieza ahora **lo ve la
limpiadora** destacado en su app (antes no se mostraba). Úsalo para indicaciones:
«cambiar sábanas cama grande», «llave bajo el felpudo», «entra a las 15h»…

**📲 Enviar acceso a las limpiadoras**
Para la prueba con el equipo: en **Equipo → Limpiadoras**, botón **📲 Enviar acceso**
genera el enlace de cada limpiadora para mandárselo por WhatsApp. Ellas tocan y entran
directas. Te paso aparte una guía cortita para reenviarles sobre cómo subir fotos e
incidencias.

Cualquier cosa me dices y lo ajustamos. 🙌

---

> Nota interna: documenta las features de la rama `feat/vanessa-gestion-limpiezas`.
> Endpoints: `PATCH /api/admin/sesiones/[id]` (edición), `POST /api/admin/sesiones/reordenar`
> (orden manual). Columnas `orden_manual`/`urgente_manual`. Ver `CLAUDE.md`.
