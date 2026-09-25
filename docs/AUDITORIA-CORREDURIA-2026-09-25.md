# Auditoría del panel de la correduría (25/09/2026)

Auditoría de solo lectura, pedida por Alberto: «que se pueda modificar, editar, eliminar, todo lo que yo quiera». Cubre `/correduria/**` de plataforma y el puerto `apps/asegura/app/api/operador/**`. Esto es la foto de ese día: antes de fiarte de una fila, míralo en el código.

## Matriz CRUD (✅ sí · ⚠️ parcial · ❌ no)

| Entidad | Crear | Ver | Editar | Eliminar / descartar |
|---|---|---|---|---|
| Cliente | ✅ | ✅ | ✅ (identidad solo con DNI) | ✅ descarte suave; ❌ fusionar duplicados |
| Teléfono / email | ✅ | ✅ | ✅ | ✅ |
| Interviniente de póliza | ❌ | ✅ | ❌ | ✅ |
| Póliza viva (CIMA) | ❌ (`poliza/emitida` sin pantalla) | ✅ | ⚠️ solo RC, dirección del riesgo y ref. catastral | ⚠️ solo por anulación |
| Póliza emitida sin confirmar por CIMA | ❌ | ✅ | ❌ | ❌ |
| Póliza histórica (volcado) | — | ✅ | ❌ | ✅ desde PR #3590: «Eliminar» con confirmación y «Recuperar» |
| Póliza aportada por el cliente | ❌ | ✅ | ❌ | ❌ (falta columna para archivarla) |
| Oportunidad | ✅ | ✅ | ⚠️ solo las abiertas | ✅ descartar; ❌ reabrir una ganada o enlazarle la póliza después |
| Tarea | ⚠️ solo colgada de una oportunidad | ⚠️ no hay agenda de futuras | ❌ | ⚠️ cerrar sin confirmación; ❌ borrar o reabrir |
| Nota | ✅ | ✅ | ❌ | ❌ (las columnas ya existen) |
| Documento | ✅ | ✅ | ⚠️ solo «revisado», que no se puede desmarcar | ✅ |
| Siniestro | ⚠️ solo sobre póliza viva y confirmada por CIMA | ✅ | ⚠️ los datos base no se editan | ❌ no existe estado «anulado» |
| Presupuesto | ⚠️ solo retarificando | ⚠️ los de un lead no se ven en ninguna pantalla | ✅ | ✅ |

## Enlaces que no casan

- «➕ Abrir una oportunidad» del resumen (`SegurosCliente.tsx`) no lleva `&oportunidad=nueva`, así que no abre el formulario.
- La tarjeta de póliza aportada dice «Abrir seguimiento», pero no abre nada.
- «Retarificar hogar ↗» se abre en pestaña nueva aunque ya vive en plataforma.
- «Subir póliza» manda a apps/asegura, que pide otro login.
- Vencimientos, «Hoy», inicio y la pantalla de llamada siguen enlazando a `/correduria/oportunidad/<id>`. Funciona, porque esa ruta redirige a la ficha, pero da un salto de más.

## Top 10 de huecos (propuesta · tamaño · BD)

1. Reprogramar, editar y borrar tareas, y pedir el resultado al cerrarlas · M · endpoint.
2. Tareas sobre cliente, póliza o siniestro sin oportunidad · M · endpoint (las columnas ya existen).
3. Agenda de tareas futuras · S-M · endpoint de listado.
4. Presupuestos visibles en la ficha, también los de leads · S · no hace falta (el puerto ya los sirve).
5. Oportunidad ganada: enlazar la póliza después y poder reabrirla · S-M · regla de negocio y endpoint.
6. Editar y borrar notas · S · endpoint.
7. Archivar pólizas aportadas por el cliente · M · **DDL**.
8. Alta manual de póliza y guardar su PDF · L · endpoint y decisión sobre dónde se guardan los documentos.
9. Siniestro: editar los datos base y marcar «abierto por error» · M · **DDL** (valor nuevo en el enum).
10. Documentos: cambiar el tipo, moverlos y desmarcar «revisado» · S · endpoint.
