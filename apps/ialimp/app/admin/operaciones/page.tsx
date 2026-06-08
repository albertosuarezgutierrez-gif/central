'use client';

import { useCallback, useEffect, useState } from 'react';

const C = {
  indigo: 'var(--brand-primary)', brand: 'var(--brand-secondary)', soft: 'var(--brand-light)', text: '#1e1b4b',
  bg: '#f1f5f9', card: '#ffffff', border: '#e2e8f0',
  ok: '#16a34a', warn: '#f59e0b', bad: '#dc2626', muted: '#64748b',
};
const FONT = 'Nunito, system-ui, sans-serif';
const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
const fdate = (s?: string | null) =>
  s ? new Date(s + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }) : '—';

export default function OperacionesPage() {
  const [ops, setOps] = useState<any>(null);
  const [prev, setPrev] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [o, p] = await Promise.all([
        fetch('/api/admin/operaciones').then((r) => r.json()),
        fetch('/api/admin/prevision-semanal').then((r) => r.json()),
      ]);
      setOps(o); setPrev(p);
    } catch {
      setMsg('No se pudieron cargar los datos.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const asignar = async () => {
    setRunning(true); setMsg('');
    try {
      const r = await fetch('/api/admin/auto-assign').then((x) => x.json());
      const tot = r?.asignadas ?? 0;
      setMsg(`Asignación ejecutada: ${tot} limpiezas asignadas.`);
      await cargar();
    } catch {
      setMsg('No se pudo ejecutar la asignación.');
    } finally { setRunning(false); }
  };

  const intColor = (i: string) => (i === 'fuerte' ? C.bad : i === 'normal' ? C.brand : C.ok);

  return (
    <div style={{ fontFamily: FONT, color: C.text, background: C.bg, minHeight: '100vh' }}>
      <header style={{ background: C.indigo, padding: '18px 24px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <a href="/dashboard" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textDecoration: 'none' }}>← Dashboard</a>
        <h1 style={{ flex: 1, color: '#fff', fontWeight: 900, fontSize: 22, margin: 0 }}>Operaciones de hoy</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={cargar} disabled={loading} style={btnGhost}>{loading ? 'Cargando…' : 'Actualizar'}</button>
          <button onClick={asignar} disabled={running} style={btn}>{running ? 'Asignando…' : 'Asignar ahora'}</button>
        </div>
      </header>

      <div style={{ padding: 20 }}>
      {msg && <div style={{ ...card, borderColor: C.brand, color: C.indigo }}>{msg}</div>}

      {/* Tarjetas de estado */}
      <div style={row}>
        <Tile label="Sin asignar (hoy y mañana)" value={ops?.sin_asignar?.total ?? '—'} color={ops?.sin_asignar?.total ? C.bad : C.ok} />
        <Tile label="Ventana ajustada" value={ops?.ventana_ajustada?.total ?? '—'} color={ops?.ventana_ajustada?.total ? C.warn : C.ok} />
        <Tile label="Cobros vencidos" value={ops?.cobros_vencidos?.total ?? '—'} sub={ops?.cobros_vencidos?.importe ? eur(ops.cobros_vencidos.importe) : undefined} color={ops?.cobros_vencidos?.total ? C.bad : C.ok} />
        <Tile label="Gastos por vencer" value={ops?.gastos_por_vencer?.total ?? '—'} color={ops?.gastos_por_vencer?.total ? C.warn : C.ok} />
        <Tile label="Ausencias hoy" value={ops?.ausencias_hoy?.total ?? '—'} />
        <Tile label="Stock / Alertas" value={`${ops?.stock_alertas ?? 0} / ${ops?.alertas_sin_leer ?? 0}`} />
      </div>

      {/* Previsión semanal */}
      <Card title="Previsión semanal">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(prev?.dias || []).length === 0 ? <Empty /> : prev.dias.map((d: any, i: number) => (
            <div key={i} style={{ ...card, flex: '1 1 120px', borderTop: `4px solid ${intColor(d.intensidad)}` }}>
              <div style={{ fontWeight: 800 }}>{fdate(d.fecha)}</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{d.limpiezas}</div>
              <div style={{ color: C.muted, fontSize: 13 }}>{d.horas_estimadas} h estim.</div>
              {d.sin_asignar > 0 && <div style={{ color: C.bad, fontSize: 12 }}>{d.sin_asignar} sin asignar</div>}
              {d.con_entrada > 0 && <div style={{ color: C.indigo, fontSize: 12 }}>{d.con_entrada} con entrada</div>}
            </div>
          ))}
        </div>
      </Card>

      {/* Listas accionables */}
      <Lista titulo="Limpiezas sin asignar" items={ops?.sin_asignar?.items} render={(x: any) => (
        <>{x.property_name} · {fdate(x.session_date)}{x.hora_checkout ? ` · salida ${x.hora_checkout}` : ''}{x.hora_checkin_siguiente ? ` · entra ${x.hora_checkin_siguiente}` : ''}</>
      )} />
      <Lista titulo="Ventana de tiempo ajustada" items={ops?.ventana_ajustada?.items} render={(x: any) => (
        <>{x.property_name} · {fdate(x.session_date)} · {x.ventana_minutos} min{x.limpiadora_nombre ? ` · ${x.limpiadora_nombre}` : ''}</>
      )} />
      <Lista titulo="Cobros vencidos" items={ops?.cobros_vencidos?.items} render={(x: any) => (
        <>Factura {String(x.ref_id).slice(0, 8)} · {eur(x.importe)} · vencía {x.fecha_vencimiento}</>
      )} />
      <Lista titulo="Gastos por vencer" items={ops?.gastos_por_vencer?.items} render={(x: any) => (
        <>{x.nombre}{x.proveedor ? ` (${x.proveedor})` : ''} · {eur(x.importe)} · en {x.dias_para_vencer} días</>
      )} />
      <Lista titulo="Ausencias de hoy" items={ops?.ausencias_hoy?.items} render={(x: any) => (
        <>{x.nombre} · {x.motivo || 'ausente'} · hasta {x.fecha_fin}</>
      )} />
      </div>
    </div>
  );
}

function Tile({ label, value, sub, color }: { label: string; value: any; sub?: string; color?: string }) {
  return (
    <div style={{ ...card, flex: '1 1 150px' }}>
      <div style={{ color: C.muted, fontSize: 13, fontWeight: 600 }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: 26, color: color || C.text, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ color: C.bad, fontSize: 12 }}>{sub}</div>}
    </div>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ ...card, marginTop: 12 }}><div style={{ fontWeight: 800, marginBottom: 10 }}>{title}</div>{children}</div>;
}
function Lista({ titulo, items, render }: { titulo: string; items?: any[]; render: (x: any) => React.ReactNode }) {
  return (
    <Card title={titulo}>
      {(!items || items.length === 0) ? <Empty texto="Nada que atender" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((x, i) => (
            <div key={i} style={{ padding: '8px 10px', background: C.soft, borderRadius: 8, fontSize: 14 }}>{render(x)}</div>
          ))}
        </div>
      )}
    </Card>
  );
}
function Empty({ texto = 'Sin datos' }: { texto?: string }) {
  return <div style={{ color: C.muted, padding: 16, textAlign: 'center' }}>{texto}</div>;
}

const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 };
const row: React.CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 };
const btn: React.CSSProperties = { background: C.indigo, color: '#fff', border: 'none', borderRadius: 10, padding: '8px 16px', fontFamily: FONT, fontWeight: 800, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 16px', fontFamily: FONT, fontWeight: 700, cursor: 'pointer' };
