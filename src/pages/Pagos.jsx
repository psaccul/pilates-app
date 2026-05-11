import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import Toggle from '../components/Toggle'
import Avatar from '../components/Avatar'
import { format } from 'date-fns'

const emptyForm = { alumno_id:'', concepto:'', monto:'', medio:'efectivo', pagado:true, fecha_pago:'', periodo:'' }

export default function Pagos() {
  const [pagos, setPagos]     = useState([])
  const [alumnos, setAlumnos] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(emptyForm)
  const [saving, setSaving]   = useState(false)
  const [filtro, setFiltro]   = useState('todos')

  useEffect(() => {
    fetchData()
    const handler = () => openModal()
    window.addEventListener('open-pago', handler)
    return () => window.removeEventListener('open-pago', handler)
  }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: pg }, { data: al }] = await Promise.all([
      supabase.from('pagos').select('*, alumnos(nombre,apellido)').order('created_at',{ascending:false}),
      supabase.from('alumnos').select('id,nombre,apellido').eq('activo',true).order('apellido'),
    ])
    setPagos(pg||[])
    setAlumnos(al||[])
    setLoading(false)
  }

  function openModal(pago = null) {
    setForm(pago
      ? { id:pago.id, alumno_id:pago.alumno_id, concepto:pago.concepto, monto:pago.monto||'', medio:pago.medio, pagado:pago.pagado, fecha_pago:pago.fecha_pago||'', periodo:pago.periodo||'' }
      : { ...emptyForm, fecha_pago:format(new Date(),'yyyy-MM-dd'), periodo:format(new Date(),'yyyy-MM') })
    setModal(true)
  }

  async function handleSave() {
    if (!form.alumno_id || !form.concepto) return
    setSaving(true)
    const payload = { alumno_id:form.alumno_id, concepto:form.concepto, monto:form.monto?Number(form.monto):null, medio:form.medio, pagado:form.pagado, fecha_pago:form.pagado?(form.fecha_pago||format(new Date(),'yyyy-MM-dd')):null, periodo:form.periodo||null }
    if (form.id) await supabase.from('pagos').update(payload).eq('id',form.id)
    else await supabase.from('pagos').insert(payload)
    setSaving(false); setModal(false); fetchData()
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar?')) return
    await supabase.from('pagos').delete().eq('id',id); fetchData()
  }

  async function togglePagado(pago) {
    const nuevo = !pago.pagado
    await supabase.from('pagos').update({ pagado:nuevo, fecha_pago:nuevo?format(new Date(),'yyyy-MM-dd'):null }).eq('id',pago.id)
    setPagos(prev => prev.map(p=>p.id===pago.id?{...p,pagado:nuevo}:p))
  }

  const set = k => e => setForm(f=>({...f,[k]:e.target.value}))
  const filtrados = pagos.filter(p=>filtro==='pendientes'?!p.pagado:filtro==='pagados'?p.pagado:true)
  const totalPagado    = pagos.filter(p=>p.pagado).reduce((s,p)=>s+Number(p.monto||0),0)
  const totalPendiente = pagos.filter(p=>!p.pagado).reduce((s,p)=>s+Number(p.monto||0),0)

  const medioTag = m => {
    if (m==='efectivo')    return <span className="tag-ef">Efectivo</span>
    if (m==='mercadopago') return <span className="tag-mp">Mercado Pago</span>
    return <span className="tag-tr">Transferencia</span>
  }

  return (
    <>
      <div className="stats" style={{gridTemplateColumns:'repeat(3,1fr)'}}>
        <div className="sc" style={{'--acc':'var(--teal)'}}><div className="sc-lbl">Total cobrado</div><div className="sc-val" style={{fontSize:22}}>${Math.round(totalPagado).toLocaleString('es-AR')}</div></div>
        <div className="sc" style={{'--acc':'var(--mg)'}}><div className="sc-lbl">Pendiente de cobro</div><div className="sc-val" style={{fontSize:22,color:totalPendiente>0?'#B03030':'inherit'}}>${Math.round(totalPendiente).toLocaleString('es-AR')}</div></div>
        <div className="sc" style={{'--acc':'var(--blue)'}}><div className="sc-lbl">Registros totales</div><div className="sc-val">{pagos.length}</div></div>
      </div>

      <div className="tabs">
        {['todos','pagados','pendientes'].map(f=>(
          <div key={f} className={`tab${filtro===f?' active':''}`} onClick={() => setFiltro(f)}>{f.charAt(0).toUpperCase()+f.slice(1)}</div>
        ))}
      </div>

      <div className="panel">
        <div className="ph"><span className="ph-title">Registro de pagos ({filtrados.length})</span></div>
        {loading ? <div className="loading">Cargando…</div> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{position:'sticky',left:0,background:'var(--sl-l)',zIndex:2}}>Alumno</th>
                  <th>Concepto</th><th>Período</th><th>Monto</th><th>Medio</th><th>Fecha</th><th>Estado</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length===0 && <tr><td colSpan={8} className="empty">Sin registros</td></tr>}
                {filtrados.map(p=>(
                  <tr key={p.id}>
                    <td className="col-sticky">
                      <div style={{display:'flex',alignItems:'center',gap:7,cursor:'pointer'}} onClick={() => window.dispatchEvent(new CustomEvent('open-ficha-alumno',{detail:p.alumno_id}))}>
                        <Avatar nombre={p.alumnos?.nombre||'?'} apellido={p.alumnos?.apellido||''} size={22} fontSize={8}/>
                        <span style={{color:'var(--mg)',fontWeight:500,whiteSpace:'nowrap'}}>{p.alumnos?`${p.alumnos.nombre} ${p.alumnos.apellido}`:'—'}</span>
                      </div>
                    </td>
                    <td style={{whiteSpace:'nowrap'}}>{p.concepto}</td>
                    <td style={{fontSize:11,color:'var(--sl-m)',whiteSpace:'nowrap'}}>{p.periodo||'—'}</td>
                    <td style={{fontWeight:500,fontFamily:'var(--font-num)',whiteSpace:'nowrap'}}>{p.monto!=null?`$${Number(p.monto).toLocaleString('es-AR')}`:'—'}</td>
                    <td>{medioTag(p.medio)}</td>
                    <td style={{fontSize:11,color:'var(--sl-m)',whiteSpace:'nowrap'}}>{p.fecha_pago?format(new Date(p.fecha_pago+'T00:00:00'),'dd/MM/yy'):'—'}</td>
                    <td><Toggle value={p.pagado} onChange={() => togglePagado(p)} labelOn="Pagado" labelOff="Pendiente"/></td>
                    <td>
                      <div style={{display:'flex',gap:5,whiteSpace:'nowrap'}}>
                        <button className="btn-sec" style={{fontSize:11,padding:'4px 8px'}} onClick={() => openModal(p)}>Editar</button>
                        <button className="btn-danger" style={{fontSize:11,padding:'4px 8px'}} onClick={() => handleDelete(p.id)}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <Modal title={form.id?'Editar pago':'Registrar pago'} onClose={() => setModal(false)}
          footer={<><button className="btn-sec" onClick={() => setModal(false)}>Cancelar</button><button className="btn-pri" onClick={handleSave} disabled={saving}>{saving?'Guardando…':'Guardar pago'}</button></>}>
          <div className="form-row"><label className="form-lbl">Alumno</label><select className="form-inp" value={form.alumno_id} onChange={set('alumno_id')}><option value="">Seleccioná un alumno</option>{alumnos.map(a=><option key={a.id} value={a.id}>{a.nombre} {a.apellido}</option>)}</select></div>
          <div className="form-row"><label className="form-lbl">Concepto</label><input className="form-inp" value={form.concepto} onChange={set('concepto')} placeholder="Ej: Plan mensual — Mayo"/></div>
          <div className="form-row2">
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Monto</label><input className="form-inp" type="number" value={form.monto} onChange={set('monto')} placeholder="0"/></div>
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Medio de pago</label><select className="form-inp" value={form.medio} onChange={set('medio')}><option value="efectivo">Efectivo</option><option value="mercadopago">Mercado Pago</option><option value="transferencia">Transferencia</option></select></div>
          </div>
          <div className="form-row" style={{marginTop:13}}><label className="form-lbl">Período (mes que corresponde)</label><input className="form-inp" type="month" value={form.periodo} onChange={set('periodo')}/></div>
          <div className="form-row"><label className="form-lbl">Fecha de pago</label><input className="form-inp" type="date" value={form.fecha_pago} onChange={set('fecha_pago')}/></div>
          <div className="form-row"><label className="form-lbl">¿Ya pagó?</label><div style={{marginTop:6}}><Toggle value={form.pagado} onChange={v=>setForm(f=>({...f,pagado:v}))} labelOn="Sí, ya pagó" labelOff="Pendiente"/></div></div>
        </Modal>
      )}
    </>
  )
}
