import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import Avatar from '../components/Avatar'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { addDays, addWeeks, startOfWeek } from 'date-fns'

const DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']
const emptyForm = { nombre:'', apellido:'', telefono:'', plan:'mensual',  instructor_id:'', notas:'', nivel:'A', clases_semana:2 }

const NIVELES = { A:'Principiante (A)', B:'Intermedio (B)', C:'Avanzado (C)' }
const emptyHorario = { dia_semana:'1', hora:'08:00', instructor_id:'', sala:'Sala A', nombre_clase:'' }

export default function Alumnos({ esAdmin }) {
  const [alumnos, setAlumnos]           = useState([])
  const [instructores, setInstructores] = useState([])
  const [loading, setLoading]           = useState(true)
  const [modal, setModal]               = useState(false)
  const [historial, setHistorial]       = useState(null)
  const [histData, setHistData]         = useState([])
  const [horariosModal, setHorariosModal] = useState(null)
  const [horarios, setHorarios]         = useState([])
  const [form, setForm]                 = useState(emptyForm)
  const [horarioForm, setHorarioForm]   = useState(emptyHorario)
  const [saving, setSaving]             = useState(false)
  const [search, setSearch]             = useState('')
  const [replicarSemanas, setReplicarSemanas] = useState(4)
  const [replicarDesde, setReplicarDesde]     = useState(format(new Date(),'yyyy-MM-dd'))
  const [replicando, setReplicando]           = useState(false)
  const [replicarOk, setReplicarOk]           = useState(false)

  useEffect(() => {
    fetchData()
    const h1 = () => openModal()
    const h2 = () => fetchData()
    window.addEventListener('open-alumno', h1)
    window.addEventListener('alumno-actualizado', h2)
    return () => { window.removeEventListener('open-alumno', h1); window.removeEventListener('alumno-actualizado', h2) }
  }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: al }, { data: ins }] = await Promise.all([
      supabase.from('alumnos').select('*, instructores(nombre,apellido), pagos(pagado)').eq('activo',true).order('apellido'),
      supabase.from('instructores').select('id,nombre,apellido').eq('activo',true),
    ])
    setAlumnos(al||[])
    setInstructores(ins||[])
    setLoading(false)
  }

  function openModal(alumno = null) {
    setForm(alumno ? { id:alumno.id, nombre:alumno.nombre, apellido:alumno.apellido, telefono:alumno.telefono||'', plan:alumno.plan,  instructor_id:alumno.instructor_id||'', notas:alumno.notas||'', nivel:alumno.nivel||'A', clases_semana:alumno.clases_semana||2 } : emptyForm)
    setModal(true)
  }

  async function handleSave() {
    if (!form.nombre || !form.apellido) return
    setSaving(true)
    const payload = { nombre:form.nombre, apellido:form.apellido, telefono:form.telefono, plan:form.plan, instructor_id:form.instructor_id||null, notas:form.notas, nivel:form.nivel||'A', clases_semana:Number(form.clases_semana)||2, activo:true }
    if (form.id) await supabase.from('alumnos').update(payload).eq('id',form.id)
    else await supabase.from('alumnos').insert(payload)
    setSaving(false); setModal(false); fetchData()
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este alumno?')) return
    await supabase.from('alumnos').update({ activo:false }).eq('id',id); fetchData()
  }

  async function abrirHorarios(alumno) {
    setHorariosModal(alumno); setReplicarOk(false)
    const { data } = await supabase.from('horarios_alumno').select('*, instructores(nombre,apellido)').eq('alumno_id',alumno.id).eq('activo',true).order('dia_semana').order('hora')
    setHorarios(data||[])
    setHorarioForm({ ...emptyHorario, instructor_id: alumno.instructor_id||'' })
  }

  async function agregarHorario() {
    if (!horarioForm.hora || !horarioForm.nombre_clase) return
    setSaving(true)
    await supabase.from('horarios_alumno').insert({ alumno_id:horariosModal.id, dia_semana:Number(horarioForm.dia_semana), hora:horarioForm.hora, instructor_id:horarioForm.instructor_id||null, sala:horarioForm.sala, nombre_clase:horarioForm.nombre_clase, activo:true })
    const { data } = await supabase.from('horarios_alumno').select('*, instructores(nombre,apellido)').eq('alumno_id',horariosModal.id).eq('activo',true).order('dia_semana').order('hora')
    setHorarios(data||[]); setSaving(false)
  }

  async function eliminarHorario(id) {
    await supabase.from('horarios_alumno').update({ activo:false }).eq('id',id)
    setHorarios(prev => prev.filter(h=>h.id!==id))
  }

  async function replicarClases() {
    if (!horariosModal || horarios.length===0) return
    setReplicando(true); setReplicarOk(false)
    const desde = new Date(replicarDesde+'T00:00:00')
    for (let semana=0; semana<replicarSemanas; semana++) {
      for (const h of horarios) {
        const base = addWeeks(desde, semana)
        const inicioSemana = startOfWeek(base,{weekStartsOn:1})
        const fechaDia = addDays(inicioSemana, h.dia_semana)
        const fechaStr = format(fechaDia,'yyyy-MM-dd')
        const { data: existe } = await supabase.from('clases').select('id').eq('fecha',fechaStr).eq('hora',h.hora).eq('instructor_id',h.instructor_id||'').maybeSingle()
        let claseId
        if (!existe) {
          const { data: nueva } = await supabase.from('clases').insert({ nombre:h.nombre_clase, tipo:'grupal', instructor_id:h.instructor_id||null, fecha:fechaStr, hora:h.hora, sala:h.sala, capacidad:4 }).select().single()
          claseId = nueva?.id
        } else { claseId = existe.id }
        if (claseId) await supabase.from('asistencias').upsert({ clase_id:claseId, alumno_id:horariosModal.id, asistio:false, recuperacion:false, estado_asistencia:'pendiente' },{ onConflict:'clase_id,alumno_id' })
      }
    }
    setReplicando(false); setReplicarOk(true)
  }

  async function verHistorial(alumno) {
    setHistorial(alumno)
    const { data } = await supabase.from('asistencias').select('*, clases(nombre,fecha,hora,instructores(nombre,apellido))').eq('alumno_id',alumno.id).order('created_at',{ascending:false}).limit(30)
    setHistData(data||[])
  }

  function estadoPago(alumno) {
    const p = alumno.pagos||[]
    if (p.length===0) return 'sin-pago'
    if (p.some(x=>!x.pagado)) return 'pendiente'
    return 'ok'
  }

  const filtered = alumnos.filter(a=>`${a.nombre} ${a.apellido}`.toLowerCase().includes(search.toLowerCase()))
  const set  = k => e => setForm(f=>({...f,[k]:e.target.value}))
  const setH = k => e => setHorarioForm(f=>({...f,[k]:e.target.value}))

  return (
    <>
      <div style={{marginBottom:12}}>
        <input className="form-inp" style={{maxWidth:280}} placeholder="Buscar alumno…" value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>

      <div className="panel">
        <div className="ph"><span className="ph-title">Alumnos activos ({filtered.length})</span></div>
        {loading ? <div className="loading">Cargando…</div> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{position:'sticky',left:0,background:'var(--sl-l)',zIndex:2}}>Alumno</th>
                  <th>Nivel</th><th>Plan</th><th>Clases/sem</th><th>Instructor</th><th>Notas</th><th>Estado</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length===0 && <tr><td colSpan={7} className="empty">No se encontraron alumnos</td></tr>}
                {filtered.map(a => {
                  const ep = estadoPago(a)
                  return (
                    <tr key={a.id}>
                      <td className="col-sticky">
                        <div style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}} onClick={() => window.dispatchEvent(new CustomEvent('open-ficha-alumno',{detail:a.id}))}>
                          <Avatar nombre={a.nombre} apellido={a.apellido} size={24} fontSize={9}/>
                          <span style={{fontWeight:500,color:'var(--mg)',whiteSpace:'normal',wordBreak:'break-word',minWidth:100,maxWidth:160,lineHeight:1.3}}>{a.nombre} {a.apellido}</span>
                        </div>
                      </td>
                      <td>
                        {a.nivel && <span style={{fontSize:11,fontWeight:700,padding:'2px 9px',borderRadius:99,background:a.nivel==='A'?'#E4F4EE':a.nivel==='B'?'#E6F1FB':'#F0EAF8',color:a.nivel==='A'?'#2D7A5A':a.nivel==='B'?'#185FA5':'#6A3A8A'}}>{a.nivel}</span>}
                      </td>
                      <td style={{whiteSpace:'nowrap'}}>{a.plan==='mensual'?'Mensual':a.plan==='pack'?'Pack':'Sueltas'}</td>
                      <td style={{textAlign:'center',fontFamily:'var(--font-num)',fontWeight:500}}>{a.clases_semana||2}</td>
                      <td style={{whiteSpace:'nowrap'}}>{a.instructores?`${a.instructores.nombre} ${a.instructores.apellido}`:'—'}</td>
                      <td style={{maxWidth:160}}>
                        {a.notas ? <span title={a.notas} style={{fontSize:11,color:'var(--sl-m)',cursor:'help'}}>{a.notas.length>30?a.notas.slice(0,30)+'…':a.notas}</span> : <span style={{color:'var(--border)'}}>—</span>}
                      </td>
                      <td><span className={`est ${ep==='ok'?'e-ok':ep==='pendiente'?'e-pe':'e-ve'}`}>{ep==='ok'?'Al día':ep==='pendiente'?'Pendiente':'Sin pago'}</span></td>
                      <td>
                        <div style={{display:'flex',gap:4,whiteSpace:'nowrap'}}>
                          {esAdmin && <button className="btn-sec" style={{fontSize:11,padding:'4px 7px'}} onClick={() => abrirHorarios(a)}>Horarios</button>}
                          <button className="btn-sec" style={{fontSize:11,padding:'4px 7px'}} onClick={() => verHistorial(a)}>Historial</button>
                          <button className="btn-sec" style={{fontSize:11,padding:'4px 7px'}} onClick={() => openModal(a)}>Editar</button>
                          {esAdmin && <button className="btn-danger" style={{fontSize:11,padding:'4px 7px'}} onClick={() => handleDelete(a.id)}>✕</button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL nuevo/editar */}
      {modal && (
        <Modal title={form.id?'Editar alumno':'Nuevo alumno'} onClose={() => setModal(false)}
          footer={<><button className="btn-sec" onClick={() => setModal(false)}>Cancelar</button><button className="btn-pri" onClick={handleSave} disabled={saving}>{saving?'Guardando…':'Guardar alumno'}</button></>}>
          <div className="form-row2">
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Nombre</label><input className="form-inp" value={form.nombre} onChange={set('nombre')} placeholder="Nombre"/></div>
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Apellido</label><input className="form-inp" value={form.apellido} onChange={set('apellido')} placeholder="Apellido"/></div>
          </div>
          <div className="form-row" style={{marginTop:13}}><label className="form-lbl">Teléfono (WhatsApp)</label><input className="form-inp" value={form.telefono} onChange={set('telefono')} placeholder="+54 9 3765 ..."/></div>
          <div className="form-row2">
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Plan</label><select className="form-inp" value={form.plan} onChange={set('plan')}><option value="mensual">Plan mensual</option><option value="pack">Pack prepago</option><option value="sueltas">Clases sueltas</option></select></div>
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Clases por semana</label><select className="form-inp" value={form.clases_semana} onChange={set('clases_semana')}><option value={1}>1 clase/semana</option><option value={2}>2 clases/semana</option><option value={3}>3 clases/semana</option><option value={4}>4 clases/semana</option></select></div>
          </div>
          <div className="form-row2" style={{marginTop:0}}>
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Nivel de Pilates</label><select className="form-inp" value={form.nivel} onChange={set('nivel')}><option value="A">A — Principiante</option><option value="B">B — Intermedio</option><option value="C">C — Avanzado</option></select></div>
          </div>
          <div className="form-row" style={{marginTop:13}}><label className="form-lbl">Instructor asignado</label><select className="form-inp" value={form.instructor_id} onChange={set('instructor_id')}><option value="">Sin asignar</option>{instructores.map(i=><option key={i.id} value={i.id}>{i.nombre} {i.apellido}</option>)}</select></div>
          <div className="form-row"><label className="form-lbl">Notas / Patologías / Condiciones especiales</label><textarea className="form-inp" value={form.notas} onChange={set('notas')} placeholder="Ej: Hernia lumbar L4-L5. Evitar flexión profunda..."/></div>
        </Modal>
      )}

      {/* MODAL Horarios */}
      {horariosModal && (
        <Modal title={`Horarios — ${horariosModal.nombre} ${horariosModal.apellido}`} onClose={() => { setHorariosModal(null); setReplicarOk(false) }}
          footer={<button className="btn-pri" onClick={() => { setHorariosModal(null); setReplicarOk(false) }}>Cerrar</button>}>
          {horarios.length===0 ? <div className="empty" style={{padding:'12px 0'}}>Sin horarios fijos</div>
            : horarios.map(h => (
              <div key={h.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--border)'}}>
                <div><div style={{fontSize:13,fontWeight:500}}>{DIAS[h.dia_semana]} {h.hora?.slice(0,5)}</div><div style={{fontSize:11,color:'var(--sl-m)'}}>{h.nombre_clase} · {h.sala} · {h.instructores?`${h.instructores.nombre} ${h.instructores.apellido}`:'—'}</div></div>
                <button className="btn-danger" style={{fontSize:11,padding:'3px 7px'}} onClick={() => eliminarHorario(h.id)}>✕</button>
              </div>
            ))}
          <div style={{marginTop:14,padding:'12px',background:'var(--sl-l)',borderRadius:10}}>
            <div style={{fontSize:11,fontWeight:500,color:'var(--sl-m)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:10}}>Agregar horario fijo</div>
            <div className="form-row2">
              <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Día</label><select className="form-inp" value={horarioForm.dia_semana} onChange={setH('dia_semana')}>{DIAS.map((d,i)=><option key={i} value={i}>{d}</option>)}</select></div>
              <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Hora</label><input className="form-inp" type="time" value={horarioForm.hora} onChange={setH('hora')}/></div>
            </div>
            <div className="form-row" style={{marginTop:10}}><label className="form-lbl">Nombre de la clase</label><input className="form-inp" value={horarioForm.nombre_clase} onChange={setH('nombre_clase')} placeholder="Ej: Reformer Intermedio"/></div>
            <div className="form-row2">
              <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Instructor</label><select className="form-inp" value={horarioForm.instructor_id} onChange={setH('instructor_id')}><option value="">Sin asignar</option>{instructores.map(i=><option key={i.id} value={i.id}>{i.nombre} {i.apellido}</option>)}</select></div>
              <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Sala</label><select className="form-inp" value={horarioForm.sala} onChange={setH('sala')}><option value="Sala A">Sala A</option><option value="Sala B">Sala B</option></select></div>
            </div>
            <button className="btn-pri" style={{marginTop:10,fontSize:12}} onClick={agregarHorario} disabled={saving}>{saving?'…':'+ Agregar'}</button>
          </div>
          {horarios.length>0 && (
            <div style={{marginTop:14,padding:'12px',background:'#FEF3E2',borderRadius:10,border:'1px solid #F0C060'}}>
              <div style={{fontSize:11,fontWeight:500,color:'#7A5010',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:10}}>Generar clases en el calendario</div>
              <div className="form-row2">
                <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Desde</label><input className="form-inp" type="date" value={replicarDesde} onChange={e=>setReplicarDesde(e.target.value)}/></div>
                <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Semanas</label><select className="form-inp" value={replicarSemanas} onChange={e=>setReplicarSemanas(Number(e.target.value))}>{[1,2,3,4,6,8,12].map(n=><option key={n} value={n}>{n} semanas</option>)}</select></div>
              </div>
              {replicarOk && <div style={{fontSize:12,color:'#2D7A5A',background:'#E4F4EE',padding:'7px 10px',borderRadius:7,marginBottom:8}}>¡Clases generadas correctamente!</div>}
              <button className="btn-pri" style={{fontSize:12,background:'#D4A020',marginTop:8}} onClick={replicarClases} disabled={replicando}>{replicando?'Generando…':`Generar ${replicarSemanas} semanas`}</button>
            </div>
          )}
        </Modal>
      )}

      {/* MODAL historial */}
      {historial && (
        <Modal title={`Historial — ${historial.nombre} ${historial.apellido}`} onClose={() => setHistorial(null)} footer={<button className="btn-pri" onClick={() => setHistorial(null)}>Cerrar</button>}>
          <div style={{marginTop:-18}}>
            <table className="tbl">
              <thead><tr><th>Fecha</th><th>Clase</th><th>Instructor</th><th>Asistió</th></tr></thead>
              <tbody>
                {histData.length===0 && <tr><td colSpan={4} className="empty">Sin registros aún</td></tr>}
                {histData.map(h=>(
                  <tr key={h.id}>
                    <td>{h.clases?.fecha?format(new Date(h.clases.fecha+'T00:00:00'),'dd/MM/yy'):' —'}</td>
                    <td>{h.clases?.nombre||'—'}</td>
                    <td>{h.clases?.instructores?`${h.clases.instructores.nombre} ${h.clases.instructores.apellido}`:'—'}</td>
                    <td><span className={`est ${h.asistio?'e-ok':'e-ve'}`}>{h.asistio?'Sí':'No'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </>
  )
}
