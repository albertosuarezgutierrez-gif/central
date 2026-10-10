/**
 * El CSS que el retarificador y el panel de emisión dan por supuesto (`.card`,
 * `.muted`, `.err`, `button.primary`…). Viene de `apps/asegura`, cuyo
 * `globals.css` aquí no existe, y va ACOTADO a `.retarificar` sobre los tokens
 * de plataforma para no tocar el `globals.css` de todos.
 *
 * 29/09/2026: vivía solo en la página de retarificar, y el panel de emisión se
 * monta también en las altas nuevas (auto, moto, hogar) y en «Traer de Avant2».
 * Allí salía sin estilo: «Confirmar precio con la compañía» parecía texto y no
 * un botón, y Alberto no pudo emitir. Por eso `Emision` se envuelve sola.
 */
export const CSS_RETARIFICADOR = `
.retarificar {
  --brand: var(--primary);
  --brand-soft: var(--primary-light);
  --panel: var(--surface);
  --panel2: var(--bg);
  --ok: var(--positive);
  --warn: var(--warning);
  --danger: var(--negative);
}
.retarificar .card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
}
.retarificar .muted { color: var(--muted); }
.retarificar h1 { font-size: 20px; margin: 0 0 4px; }
.retarificar h2 { font-size: 16px; margin: 0 0 8px; }
.retarificar h3 { font-size: 14px; margin: 0 0 6px; }
.retarificar .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.retarificar table { width: 100%; border-collapse: collapse; min-width: 520px; }
.retarificar th, .retarificar td {
  text-align: left;
  padding: 9px 10px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
.retarificar th {
  color: var(--muted);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .03em;
}
/* La tabla de precios: fila compacta (24 filas es lo normal en un presupuesto
   real) y la última columna —el botón de confirmar— SIEMPRE visible, aunque
   el resto de la fila necesite scroll horizontal en móvil. */
.retarificar table.precios { min-width: 420px; }
.retarificar table.precios th, .retarificar table.precios td { padding: 6px 8px; font-size: 13px; }
.retarificar table.precios th:last-child, .retarificar table.precios td:last-child {
  position: sticky;
  right: 0;
  background: var(--panel);
  padding-left: 4px;
  padding-right: 4px;
  text-align: center;
}
/* 44px: el mínimo táctil de la regla Responsive del CLAUDE.md raíz — no 36px,
   que quedaba por debajo justo en el único botón garantizado visible (el
   sticky) en móvil. */
.retarificar button.ghost.icono {
  padding: 0;
  width: 44px;
  min-height: 44px;
  min-width: 44px;
  font-size: 16px;
  line-height: 1;
}
.retarificar .badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: var(--brand-soft);
  color: var(--brand);
}
.retarificar .badge.ok { background: var(--positive-bg); color: var(--ok); }
.retarificar .badge.warn { background: var(--warning-bg); color: var(--warn); }
.retarificar .badge.danger { background: var(--negative-bg); color: var(--danger); }
.retarificar label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 4px;
}
.retarificar input, .retarificar select, .retarificar textarea, .retarificar button { font: inherit; }
.retarificar input, .retarificar select, .retarificar textarea {
  width: 100%;
  padding: 9px 11px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
}
/* 160px de mínimo: por debajo de 360px de viewport una sola columna, que es lo
   que hace falta en el móvil de Alberto. */
.retarificar .form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}
.retarificar button.primary {
  padding: 10px 16px;
  border: 0;
  border-radius: 8px;
  background: var(--brand);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  min-height: 44px;
}
.retarificar button.primary:disabled { opacity: .6; cursor: default; }
.retarificar button.ghost {
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font-weight: 600;
  cursor: pointer;
  min-height: 44px;
}
/* Toggle Sí/No de la maqueta de pre-emisión (preemision-mock.tsx) — el mismo
   gesto azul/blanco que enseña Avant2, pero con los tokens de plataforma. */
.retarificar .toggle-sino {
  flex: 1;
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font-weight: 600;
  cursor: pointer;
  min-height: 44px;
}
.retarificar .toggle-sino.activo {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
}
.retarificar .err {
  background: var(--negative-bg);
  color: var(--danger);
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
}
.retarificar a { color: var(--primary); }
`
