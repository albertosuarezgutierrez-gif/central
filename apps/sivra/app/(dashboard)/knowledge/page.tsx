"use client"
import { useState, useEffect } from "react"

type KBEntry = {
  id: number; property_id: string | null; category: string; keywords: string[]
  answer_es: string | null; answer_en: string | null; answer_fr: string | null
  answer_de: string | null; answer_it: string | null
  uses: number; active: boolean; created_at: string
}

const CATEGORIES = ["wifi","checkin","checkout","parking","normas","llaves","general"]
const CAT_EMOJI: Record<string,string> = { wifi:"📶", checkin:"🔑", checkout:"🚪", parking:"🅿️", normas:"📋", llaves:"🗝️", general:"💬" }
const LANG_FLAGS: Record<string,string> = { es:"🇪🇸", en:"🇬🇧", fr:"🇫🇷", de:"🇩🇪", it:"🇮🇹" }

export default function KnowledgePage() {
  const [entries, setEntries] = useState<KBEntry[]>([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState<"all"|"active"|"pending">("all")
  const [showNew, setShowNew]   = useState(false)
  const [newEntry, setNewEntry] = useState({ category:"general", keywords:"", answer_es:"", answer_en:"" })
  const [saving, setSaving]     = useState(false)

  const load = () => {
    setLoading(true)
    fetch("/api/mensajes/knowledge").then(r=>r.json()).then(d=>{ setEntries(d.entries||[]); setLoading(false) }).catch(()=>setLoading(false))
  }
  useEffect(load, [])

  const toggle = async (id: number, active: boolean) => {
    await fetch("/api/mensajes/knowledge", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id,active}) })
    setEntries(prev => prev.map(e => e.id===id ? {...e, active} : e))
  }

  const remove = async (id: number) => {
    if (!confirm("¿Eliminar esta entrada?")) return
    await fetch("/api/mensajes/knowledge", { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id}) })
    setEntries(prev => prev.filter(e => e.id!==id))
  }

  const create = async () => {
    if (!newEntry.keywords || (!newEntry.answer_es && !newEntry.answer_en)) return
    setSaving(true)
    await fetch("/api/mensajes/knowledge", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(newEntry) })
    setSaving(false)
    setShowNew(false)
    setNewEntry({ category:"general", keywords:"", answer_es:"", answer_en:"" })
    load()
  }

  const filtered = entries.filter(e =>
    filter==="all" ? true : filter==="active" ? e.active : !e.active
  )
  const totalActive  = entries.filter(e=>e.active).length
  const totalPending = entries.filter(e=>!e.active).length
  const totalUses    = entries.reduce((s,e)=>s+e.uses,0)

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#1A2535] tracking-tight">Base de conocimiento</h1>
          <p className="text-sm text-[#9898A8] mt-0.5">FAQs para responder huéspedes sin consumir API · auto-aprendizaje con Claude</p>
        </div>
        <button onClick={()=>setShowNew(true)}
          className="px-4 py-2 bg-[#BBFF44] text-sm font-semibold rounded-[6px] hover:bg-[#BBFF44] transition-colors">
          + Nueva entrada
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label:"Entradas activas", val:totalActive,  color:"#10b981", icon:"✅" },
          { label:"Pendientes revisión", val:totalPending, color:"#f59e0b", icon:"⏳" },
          { label:"Usos totales",     val:totalUses,    color:"var(--lime-d)", icon:"⚡" },
        ].map(k=>(
          <div key={k.label} className="bg-[#FFFFFF] border border-[#E8EDF3] rounded-[6px] p-4">
            <div className="text-lg mb-1">{k.icon}</div>
            <div className="text-2xl font-bold" style={{color:k.color}}>{k.val}</div>
            <div className="text-xs text-[#9898A8]">{k.label}</div>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="bg-[#f5f3ff] border border-[#c4b5fd] rounded-[6px] p-4 mb-5 text-sm">
        <div className="font-semibold text-[#5A9A12] mb-2">⚡ Cómo funciona</div>
        <div className="text-[#4c1d95] text-xs space-y-1">
          <div>1. Llega una pregunta de un huésped → se busca en esta base por <strong>keywords</strong></div>
          <div>2. Si hay coincidencia → responde en el idioma del huésped <strong>sin llamar a Claude</strong> (gratis)</div>
          <div>3. Si no hay → Claude responde y guarda la respuesta aquí como <strong>"Pendiente revisión"</strong></div>
          <div>4. Tú revisas y activas las buenas → en pocas semanas el 90% de preguntas se responden solos</div>
          <div className="pt-1">+ Si la pregunta es sobre wifi/acceso/normas, se adjunta automáticamente el <strong>enlace Smoobu personalizado</strong> del huésped</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(["all","active","pending"] as const).map(f=>(
          <button key={f} onClick={()=>setFilter(f)}
            className="px-3 py-1.5 rounded-[4px] text-xs font-medium border transition-all"
            style={{background:filter===f?"#BBFF44":"white", color:filter===f?"#1A2535":"#71717a", borderColor:filter===f?"#BBFF44":"#252530"}}>
            {f==="all"?"Todas":f==="active"?"Activas":"Pendientes revisión"}
          </button>
        ))}
      </div>

      {/* Entries table */}
      <div className="bg-[#FFFFFF] rounded-[6px] border border-[#E8EDF3] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[#6B7F96] text-sm">Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-[#6B7F96] text-sm">Sin entradas</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#E8EDF3]">
                  <th className="px-4 py-2.5 text-left font-semibold text-[#9898A8]">Categoría</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[#9898A8]">Keywords</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[#9898A8]">Respuestas</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[#9898A8]">Usos</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[#9898A8]">Estado</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[#9898A8]">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e=>(
                  <tr key={e.id} className="border-b border-[#f9f9f9] hover:bg-[#f9f9fb] transition-colors"
                    style={{background: !e.active ? "#fffbeb" : "white"}}>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5">
                        <span>{CAT_EMOJI[e.category] ?? "💬"}</span>
                        <span className="font-medium text-[#1A2535] capitalize">{e.category}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(e.keywords ?? []).map(kw=>(
                          <span key={kw} className="px-1.5 py-0.5 bg-[#F4F6F9] rounded text-[10px] text-[#9898A8]">{kw}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {(["es","en","fr","de","it"] as const).map(lng=>{
                          const a = e[`answer_${lng}`]
                          return a ? (
                            <span key={lng} title={a}
                              className="text-base cursor-help" style={{opacity: a ? 1 : 0.3}}>
                              {LANG_FLAGS[lng]}
                            </span>
                          ) : null
                        })}
                      </div>
                      <div className="text-[10px] text-[#6B7F96] mt-0.5 max-w-[200px] truncate">
                        {e.answer_es ?? e.answer_en ?? ""}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-[#1A2535]">{e.uses}</span>
                    </td>
                    <td className="px-4 py-3">
                      {e.active ? (
                        <span className="px-2 py-0.5 rounded-full bg-[#dcfce7] text-[#166534] text-[10px] font-semibold">Activa</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e] text-[10px] font-semibold">Revisión</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={()=>toggle(e.id, !e.active)}
                          className="text-[10px] px-2 py-1 rounded-[4px] border border-[#E8EDF3] hover:border-[#BBFF44] hover:text-[#BBFF44] transition-colors text-[#9898A8]">
                          {e.active ? "Desactivar" : "✅ Activar"}
                        </button>
                        <button onClick={()=>remove(e.id)}
                          className="text-[10px] px-2 py-1 rounded-[4px] border border-[#E8EDF3] hover:border-[#ef4444] hover:text-[#ef4444] transition-colors text-[#9898A8]">
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New entry modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={()=>setShowNew(false)}>
          <div className="bg-[#FFFFFF] rounded-[6px] shadow-2xl p-6 w-full max-w-lg" onClick={e=>e.stopPropagation()}>
            <h3 className="font-bold text-[#1A2535] mb-4">Nueva entrada de conocimiento</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-[#9898A8] mb-1 block">Categoría</label>
                <select value={newEntry.category} onChange={e=>setNewEntry(p=>({...p,category:e.target.value}))}
                  className="w-full border border-[#E8EDF3] rounded-[4px] px-3 py-2 text-sm outline-none focus:border-[#BBFF44]">
                  {CATEGORIES.map(c=><option key={c} value={c}>{CAT_EMOJI[c]} {c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[#9898A8] mb-1 block">Keywords (separadas por coma)</label>
                <input value={newEntry.keywords} onChange={e=>setNewEntry(p=>({...p,keywords:e.target.value}))}
                  placeholder="wifi, contraseña, internet, password"
                  className="w-full border border-[#E8EDF3] rounded-[4px] px-3 py-2 text-sm outline-none focus:border-[#BBFF44]"/>
              </div>
              <div>
                <label className="text-xs font-medium text-[#9898A8] mb-1 block">Respuesta en español</label>
                <textarea value={newEntry.answer_es} onChange={e=>setNewEntry(p=>({...p,answer_es:e.target.value}))}
                  rows={3} placeholder="La red WiFi es..."
                  className="w-full border border-[#E8EDF3] rounded-[4px] px-3 py-2 text-sm outline-none focus:border-[#BBFF44] resize-none"/>
              </div>
              <div>
                <label className="text-xs font-medium text-[#9898A8] mb-1 block">Respuesta en inglés</label>
                <textarea value={newEntry.answer_en} onChange={e=>setNewEntry(p=>({...p,answer_en:e.target.value}))}
                  rows={3} placeholder="The WiFi network is..."
                  className="w-full border border-[#E8EDF3] rounded-[4px] px-3 py-2 text-sm outline-none focus:border-[#BBFF44] resize-none"/>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={()=>setShowNew(false)} className="px-4 py-2 text-sm text-[#9898A8] hover:text-[#1A2535]">Cancelar</button>
              <button onClick={create} disabled={saving}
                className="px-4 py-2 bg-[#BBFF44] text-sm font-semibold rounded-[6px] hover:bg-[#BBFF44] disabled:opacity-50">
                {saving?"Guardando…":"Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
