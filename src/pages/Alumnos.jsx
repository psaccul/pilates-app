import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import Avatar from '../components/Avatar'
import { format, addDays, addWeeks, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'

const DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']
const emptyForm = { nombre:'', apellido:'', telefono:'', plan:'mensual', instructor_id:'', notas:'', nivel:'A', clases_semana:2, fecha_nacimiento:'' }
const emptyHorario = { dia_semana:'1', hora:'08:00', instructor_id:'', sala:'Sala A', nombre_clase:'' }

function normStr(s) {
  return (s||'').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu,'').trim()
}

function buscarPosiblesDuplicados(form, alumnos) {
  const nombre   = normStr(form.nombre)
  const apellido = normStr(form.apellido)
  const tel      = (form.telefono||'').replace(/\D/g,'')
  return alumnos.filter(a => {
    if (a.id === form.id) return false
    const aN  = normStr(a.nombre)
    const aAp = normStr(a.apellido)
    const aTel = (a.telefono||'').replace(/\D/g,'')
    const mismosNombres = apellido.length >= 2 && nombre.length >= 2 && aAp === apellido &&
      (aN === nombre || normStr(a.nombre).startsWith(nombre.slice(0,3)) || nombre.startsWith(normStr(a.nombre).slice(0,3)))
    const mismoTel = tel.length >= 8 && aTel.length >= 8 && aTel === tel
    return mismosNombres || mismoTel
  })
}

export default function Alumnos({ esAdmin }) {
  const [alumnos, setAlumnos]           = useState([])
  const [instructores, setInstructores] = useState([])
  const [loading, setLoading]           = useState(true)
  const [modal, setModal]               = useState(false)
  const [historial, setHistorial]       = useState(null)
  const [histData, setHistData]         = useState([])
  const [form, setForm]                 = useState(emptyForm)
  const [saving, setSaving]             = useState(false)
  const [search, setSearch]             = useState('')
  const [formHorarios, setFormHorarios]       = useState([])
  const [formHorarioNew, setFormHorarioNew]   = useState(emptyHorario)
  const [horariosToDelete, setHorariosToDelete] = useState([])
  const [replicarSemanas, setReplicarSemanas] = useState(4)
  const [replicarDesde, setReplicarDesde]     = useState(format(new Date(),'yyyy-MM-dd'))
  const [replicando, setReplicando]           = useState(false)
  const [replicarOk, setReplicarOk]           = useState(false)
  const [auditModal, setAuditModal]           = useState(false)
  const [semanasNuevo, setSemanasNuevo]       = useState(4)

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
      supabase.from('alumnos').select('*, instructores(nombre,apellido), pagos(pagado,periodo,monto)').eq('activo',true).order('apellido'),
      supabase.from('instructores').select('id,nombre,apellido').eq('activo',true),
    ])
    setAlumnos(al||[])
    setInstructores(ins||[])
    setLoading(false)
  }

  async function openModal(alumno = null) {
    setForm(alumno ? {
      id:alumno.id, nombre:alumno.nombre, apellido:alumno.apellido,
      telefono:alumno.telefono||'', plan:alumno.plan,
      instructor_id:alumno.instructor_id||'', notas:alumno.notas||'',
      nivel:alumno.nivel||'A', clases_semana:alumno.clases_semana||2,
      fecha_nacimiento:alumno.fecha_nacimiento||''
    } : emptyForm)
    setFormHorarioNew({ ...emptyHorario, instructor_id: alumno?.instructor_id||'' })
    setHorariosToDelete([])
    setReplicarOk(false)
    if (alumno) {
      const { data } = await supabase.from('horarios_alumno').select('*, instructores(nombre)').eq('alumno_id',alumno.id).eq('activo',true).order('dia_semana').order('hora')
      setFormHorarios(data||[])
    } else {
      setFormHorarios([])
    }
    setModal(true)
  }

  async function handleSave() {
    if (!form.nombre || !form.apellido) return
    setSaving(true)
    // Si hay un horario a medio cargar sin confirmar, incluirlo al guardar
    const todosHorarios = (formHorarioNew.hora && formHorarioNew.nombre_clase)
      ? [...formHorarios, { ...formHorarioNew, dia_semana:Number(formHorarioNew.dia_semana), _isNew:true }]
      : formHorarios
    const payload = {
      nombre:form.nombre, apellido:form.apellido, telefono:form.telefono,
      plan:form.plan, instructor_id:form.instructor_id||null, notas:form.notas,
      nivel:form.nivel||'A', clases_semana:Number(form.clases_semana)||2,
      fecha_nacimiento:form.fecha_nacimiento||null, activo:true
    }
    let alumnoId = form.id
    if (form.id) {
      await supabase.from('alumnos').update(payload).eq('id',form.id)
    } else {
      const { data: nuevo } = await supabase.from('alumnos').insert(payload).select().single()
      if (nuevo) {
        alumnoId = nuevo.id
        const concepto = form.plan==='mensual'?'Plan mensual':form.plan==='pack'?'Pack prepago':'Clase suelta'
        const periodo = form.plan==='mensual' ? format(new Date(),'yyyy-MM') : null
        await supabase.from('pagos').insert({ alumno_id:nuevo.id, concepto, monto:null, medio:'efectivo', pagado:false, fecha_pago:null, periodo })
        if (form.plan==='mensual') localStorage.setItem('pilates_lastPagosGen', format(new Date(),'yyyy-MM'))
      }
    }
    // Guardar horarios
    if (horariosToDelete.length > 0)
      await supabase.from('horarios_alumno').update({ activo:false }).in('id', horariosToDelete)
    const nuevos = todosHorarios.filter(h=>h._isNew)
    for (const h of nuevos) {
      await supabase.from('horarios_alumno').insert({ alumno_id:alumnoId, dia_semana:Number(h.dia_semana), hora:h.hora, instructor_id:h.instructor_id||null, sala:h.sala, nombre_clase:h.nombre_clase, activo:true })
    }
    // Generar clases automáticamente para los horarios nuevos (4 semanas desde hoy)
    if (nuevos.length > 0) {
      const desde = new Date(); desde.setHours(0,0,0,0)
      for (let semana=0; semana<4; semana++) {
        for (const h of nuevos) {
          const base = addWeeks(desde, semana)
          const inicioSemana = startOfWeek(base, {weekStartsOn:1})
          const fechaDia = addDays(inicioSemana, Number(h.dia_semana))
          if (fechaDia < desde) continue
          const fechaStr = format(fechaDia, 'yyyy-MM-dd')
          let q = supabase.from('clases').select('id').eq('fecha',fechaStr).eq('hora',h.hora)
          if (h.instructor_id) q = q.eq('instructor_id', h.instructor_id)
          else q = q.is('instructor_id', null)
          const { data: existe } = await q.maybeSingle()
          let claseId
          if (!existe) {
            const { data: nueva } = await supabase.from('clases').insert({ nombre:h.nombre_clase, tipo:'grupal', instructor_id:h.instructor_id||null, fecha:fechaStr, hora:h.hora, sala:h.sala||'Sala A', capacidad:4 }).select().single()
            claseId = nueva?.id
          } else { claseId = existe.id }
          if (claseId) await supabase.from('asistencias').upsert({ clase_id:claseId, alumno_id:alumnoId, asistio:false, recuperacion:false, estado_asistencia:'pendiente' }, {onConflict:'clase_id,alumno_id'})
        }
      }
      window.dispatchEvent(new CustomEvent('horarios-generados'))
    }
    setSaving(false); setModal(false); fetchData()
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este alumno?')) return
    await supabase.from('alumnos').update({ activo:false }).eq('id',id); fetchData()
  }

  async function generarClasesDesdeModal() {
    if (!form.id || formHorarios.length === 0) return
    setReplicando(true); setReplicarOk(false)
    const desde = new Date(replicarDesde + 'T00:00:00')
    for (let semana = 0; semana < replicarSemanas; semana++) {
      for (const h of formHorarios) {
        const base = addWeeks(desde, semana)
        const inicioSemana = startOfWeek(base, { weekStartsOn: 1 })
        const fechaDia = addDays(inicioSemana, Number(h.dia_semana))
        if (fechaDia < desde) continue
        const fechaStr = format(fechaDia, 'yyyy-MM-dd')
        let q = supabase.from('clases').select('id').eq('fecha', fechaStr).eq('hora', h.hora)
        if (h.instructor_id) q = q.eq('instructor_id', h.instructor_id)
        else q = q.is('instructor_id', null)
        const { data: existe } = await q.maybeSingle()
        let claseId
        if (!existe) {
          const { data: nueva } = await supabase.from('clases').insert({ nombre: h.nombre_clase, tipo: 'grupal', instructor_id: h.instructor_id || null, fecha: fechaStr, hora: h.hora, sala: h.sala || 'Sala A', capacidad: 4 }).select().single()
          claseId = nueva?.id
        } else { claseId = existe.id }
        if (claseId) await supabase.from('asistencias').upsert({ clase_id: claseId, alumno_id: form.id, asistio: false, recuperacion: false, estado_asistencia: 'pendiente' }, { onConflict: 'clase_id,alumno_id' })
      }
    }
    setReplicando(false); setReplicarOk(true)
    window.dispatchEvent(new CustomEvent('horarios-generados'))
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

  function deudaMeses(alumno) {
    return (alumno.pagos||[]).filter(x=>!x.pagado).length
  }

  function cumpleHoy(alumno) {
    if (!alumno.fecha_nacimiento) return false
    const hoy = new Date()
    const fn  = new Date(alumno.fecha_nacimiento+'T00:00:00')
    return fn.getDate()===hoy.getDate() && fn.getMonth()===hoy.getMonth()
  }

  function cumpleEstaSemana(alumno) {
    if (!alumno.fecha_nacimiento) return false
    const hoy = new Date()
    const fn  = new Date(alumno.fecha_nacimiento+'T00:00:00')
    for (let i=1; i<=7; i++) {
      const d = addDays(hoy, i)
      if (fn.getDate()===d.getDate() && fn.getMonth()===d.getMonth()) return true
    }
    return false
  }

  function edadLabel(alumno) {
    if (!alumno.fecha_nacimiento) return null
    const fn  = new Date(alumno.fecha_nacimiento+'T00:00:00')
    const hoy = new Date()
    let edad = hoy.getFullYear() - fn.getFullYear()
    const m = hoy.getMonth() - fn.getMonth()
    if (m < 0 || (m===0 && hoy.getDate() < fn.getDate())) edad--
    return edad
  }

  const filtered = alumnos.filter(a=>`${a.nombre} ${a.apellido}`.toLowerCase().includes(search.toLowerCase()))

  // Cumpleaños hoy o esta semana para el aviso
  const cumpleHoyList   = alumnos.filter(a=>cumpleHoy(a))
  const cumpleSemanaList = alumnos.filter(a=>!cumpleHoy(a)&&cumpleEstaSemana(a))

  const set   = k => e => setForm(f=>({...f,[k]:e.target.value}))
  const setHN = k => e => setFormHorarioNew(f=>({...f,[k]:e.target.value}))

  async function agregarHorarioEnModal() {
    if (!formHorarioNew.hora || !formHorarioNew.nombre_clase) return
    setSaving(true)
    const h = { ...formHorarioNew, dia_semana: Number(formHorarioNew.dia_semana) }

    if (form.id) {
      // Alumno existente: guardar en DB inmediatamente
      const { data: guardado } = await supabase.from('horarios_alumno')
        .insert({ alumno_id:form.id, dia_semana:h.dia_semana, hora:h.hora, instructor_id:h.instructor_id||null, sala:h.sala, nombre_clase:h.nombre_clase, activo:true })
        .select('*, instructores(nombre)').single()
      if (guardado) setFormHorarios(prev=>[...prev, guardado])

      // Generar clases si se eligió > 0 semanas
      if (semanasNuevo > 0) {
        const desde = new Date(); desde.setHours(0,0,0,0)
        for (let semana=0; semana<semanasNuevo; semana++) {
          const base = addWeeks(desde, semana)
          const inicioSemana = startOfWeek(base, {weekStartsOn:1})
          const fechaDia = addDays(inicioSemana, h.dia_semana)
          if (fechaDia < desde) continue
          const fechaStr = format(fechaDia, 'yyyy-MM-dd')
          let q = supabase.from('clases').select('id').eq('fecha',fechaStr).eq('hora',h.hora)
          if (h.instructor_id) q = q.eq('instructor_id', h.instructor_id)
          else q = q.is('instructor_id', null)
          const { data: existe } = await q.maybeSingle()
          let claseId
          if (!existe) {
            const { data: nueva } = await supabase.from('clases').insert({ nombre:h.nombre_clase, tipo:'grupal', instructor_id:h.instructor_id||null, fecha:fechaStr, hora:h.hora, sala:h.sala||'Sala A', capacidad:4 }).select().single()
            claseId = nueva?.id
          } else { claseId = existe.id }
          if (claseId) await supabase.from('asistencias').upsert({ clase_id:claseId, alumno_id:form.id, asistio:false, recuperacion:false, estado_asistencia:'pendiente' }, {onConflict:'clase_id,alumno_id'})
        }
        window.dispatchEvent(new CustomEvent('horarios-generados'))
        setReplicarOk(true)
      }
    } else {
      // Alumno nuevo: solo agregar al estado, se guarda con "Guardar alumno"
      setFormHorarios(prev=>[...prev, { ...h, _isNew:true, _uid:Date.now() }])
    }

    setFormHorarioNew(f=>({ ...emptyHorario, instructor_id:f.instructor_id }))
    setSaving(false)
  }

  function quitarHorarioEnModal(h) {
    if (!h._isNew && h.id) setHorariosToDelete(prev=>[...prev, h.id])
    setFormHorarios(prev=>prev.filter(x=> h._isNew ? x._uid!==h._uid : x.id!==h.id))
  }

  return (
    <>
      {/* Avisos cumpleaños */}
      {cumpleHoyList.map(a=>(
        <div key={a.id} style={{padding:'10px 16px',background:'#FEF3E2',border:'1px solid #F0C060',borderRadius:10,fontSize:12,color:'#7A5010',marginBottom:8,display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:18}}>🎂</span>
          <span>Hoy es el cumpleaños de <strong>{a.nombre} {a.apellido}</strong>{edadLabel(a)!==null?` — cumple ${edadLabel(a)} años`:''}</span>
        </div>
      ))}
      {cumpleSemanaList.map(a=>{
        const fn=new Date(a.fecha_nacimiento+'T00:00:00')
        return(
          <div key={a.id} style={{padding:'10px 16px',background:'#E6F1FB',border:'1px solid #A8C8F0',borderRadius:10,fontSize:12,color:'#185FA5',marginBottom:8,display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:18}}>🎁</span>
            <span><strong>{a.nombre} {a.apellido}</strong> cumple años el <strong>{format(fn,"d 'de' MMMM",{locale:es})}</strong></span>
          </div>
        )
      })}

      <div style={{marginBottom:12}}>
        <input className="form-inp" style={{maxWidth:280}} placeholder="Buscar alumno…" value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>

      <div className="panel">
        <div className="ph">
          <span className="ph-title">Alumnos activos ({filtered.length})</span>
          {esAdmin && <button className="btn-sec" style={{fontSize:11,padding:'4px 10px'}} onClick={()=>setAuditModal(true)}>Buscar duplicados</button>}
        </div>
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
                {filtered.length===0&&<tr><td colSpan={8} className="empty">No se encontraron alumnos</td></tr>}
                {filtered.map(a => {
                  const ep = estadoPago(a)
                  const deuda = deudaMeses(a)
                  const hoyC = cumpleHoy(a)
                  const semC = !hoyC && cumpleEstaSemana(a)
                  return (
                    <tr key={a.id}>
                      <td className="col-sticky">
                        <div style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}} onClick={()=>window.dispatchEvent(new CustomEvent('open-ficha-alumno',{detail:a.id}))}>
                          <Avatar nombre={a.nombre} apellido={a.apellido} size={24} fontSize={9}/>
                          <div>
                            <span style={{fontWeight:500,color:'var(--mg)',whiteSpace:'nowrap'}}>{a.nombre} {a.apellido}</span>
                            {hoyC&&<span style={{fontSize:9,marginLeft:4}}>🎂</span>}
                            {semC&&<span style={{fontSize:9,marginLeft:4}}>🎁</span>}
                          </div>
                        </div>
                      </td>
                      <td style={{textAlign:'center'}}>
                        <span style={{fontSize:12,fontWeight:700,color:a.nivel==='A'?'#2D7A5A':a.nivel==='B'?'#185FA5':'#6A3A8A'}}>{a.nivel||'—'}</span>
                      </td>
                      <td style={{whiteSpace:'nowrap'}}>{a.plan==='mensual'?'Plan mensual':a.plan==='pack'?'Prepago':'Clases sueltas'}</td>
                      <td style={{textAlign:'center',fontFamily:'var(--font-num)',fontWeight:500}}>{a.clases_semana===5?'Pase libre':a.clases_semana||2}</td>
                      <td style={{whiteSpace:'nowrap'}}>{a.instructores?`${a.instructores.nombre} ${a.instructores.apellido}`:'—'}</td>
                      <td style={{maxWidth:160}}>
                        {a.notas?<span title={a.notas} style={{fontSize:11,color:'var(--sl-m)',cursor:'help'}}>{a.notas.length>30?a.notas.slice(0,30)+'…':a.notas}</span>:<span style={{color:'var(--border)'}}>—</span>}
                      </td>
                      <td>
                        <div style={{display:'flex',alignItems:'center',gap:4,flexWrap:'wrap'}}>
                          <span className={`est ${ep==='ok'?'e-ok':ep==='pendiente'?'e-pe':'e-ve'}`}>
                            {ep==='ok'?'Al día':ep==='pendiente'?'Pendiente':'Sin pago'}
                          </span>
                          {deuda > 0 && (
                            <span style={{fontSize:9,background:'#FDECEA',color:'#B03030',padding:'2px 6px',borderRadius:4,fontWeight:700,whiteSpace:'nowrap'}}>
                              {deuda} {deuda===1?'mes':'meses'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{display:'flex',gap:4,whiteSpace:'nowrap'}}>
                          <button className="btn-sec" style={{fontSize:11,padding:'4px 7px'}} onClick={()=>verHistorial(a)}>Historial</button>
                          <button className="btn-sec" style={{fontSize:11,padding:'4px 7px'}} onClick={()=>openModal(a)}>Editar</button>
                          {esAdmin&&<button className="btn-danger" style={{fontSize:11,padding:'4px 7px'}} onClick={()=>handleDelete(a.id)}>x</button>}
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
      {modal&&(()=>{
        const posiblesDups = (form.nombre.length>=2 && form.apellido.length>=2) || form.telefono.length>=8
          ? buscarPosiblesDuplicados(form, alumnos) : []
        return (
        <Modal title={form.id?'Editar alumno':'Nuevo alumno'} onClose={()=>setModal(false)}
          footer={<><button className="btn-sec" onClick={()=>setModal(false)}>Cancelar</button><button className="btn-pri" onClick={handleSave} disabled={saving}>{saving?'Guardando…':'Guardar alumno'}</button></>}>

          {posiblesDups.length > 0 && (
            <div style={{background:'#FEF3E2',border:'1px solid #F0C060',borderRadius:10,padding:'10px 14px',marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:600,color:'#7A5010',marginBottom:8}}>Posible duplicado detectado</div>
              {posiblesDups.map(d=>(
                <div key={d.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,background:'#FFF8EC',borderRadius:7,padding:'7px 10px',marginBottom:6}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <Avatar nombre={d.nombre} apellido={d.apellido} size={24} fontSize={9}/>
                    <div>
                      <div style={{fontSize:12,fontWeight:500,color:'var(--mg)'}}>{d.nombre} {d.apellido}</div>
                      {d.telefono&&<div style={{fontSize:11,color:'var(--sl-m)'}}>{d.telefono}</div>}
                    </div>
                  </div>
                  <button className="btn-sec" style={{fontSize:11,padding:'4px 8px',whiteSpace:'nowrap'}} onClick={()=>{ setModal(false); openModal(d) }}>Ver / Editar</button>
                </div>
              ))}
              <div style={{fontSize:11,color:'#7A5010',marginTop:4}}>Podés igualmente guardar si son personas distintas.</div>
            </div>
          )}

          <div className="form-row2">
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Nombre</label><input className="form-inp" value={form.nombre} onChange={set('nombre')} placeholder="Nombre"/></div>
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Apellido</label><input className="form-inp" value={form.apellido} onChange={set('apellido')} placeholder="Apellido"/></div>
          </div>
          <div className="form-row" style={{marginTop:13}}><label className="form-lbl">Teléfono (WhatsApp)</label><input className="form-inp" value={form.telefono} onChange={set('telefono')} placeholder="+54 9 3765 ..."/></div>
          <div className="form-row"><label className="form-lbl">Fecha de nacimiento</label><input className="form-inp" type="date" value={form.fecha_nacimiento} onChange={set('fecha_nacimiento')}/></div>
          <div className="form-row2">
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Plan</label><select className="form-inp" value={form.plan} onChange={set('plan')}><option value="mensual">Plan mensual</option><option value="pack">Prepago</option><option value="sueltas">Clases sueltas</option></select></div>
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Clases por semana</label><select className="form-inp" value={form.clases_semana} onChange={set('clases_semana')}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option><option value={5}>Pase libre</option></select></div>
          </div>
          <div className="form-row2" style={{marginTop:12}}>
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Nivel</label><select className="form-inp" value={form.nivel} onChange={set('nivel')}><option value="A">A</option><option value="B">B</option><option value="C">C</option></select></div>
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Instructor asignado</label><select className="form-inp" value={form.instructor_id} onChange={set('instructor_id')}><option value="">Sin asignar</option>{instructores.map(i=><option key={i.id} value={i.id}>{i.nombre} {i.apellido}</option>)}</select></div>
          </div>
          <div className="form-row"><label className="form-lbl">Notas / Patologías</label><textarea className="form-inp" value={form.notas} onChange={set('notas')} placeholder="Ej: Hernia lumbar L4-L5..."/></div>

          {/* Horarios fijos */}
          <div style={{marginTop:16,borderTop:'1px solid var(--border)',paddingTop:14}}>
            <div style={{fontSize:11,fontWeight:600,color:'var(--sl-m)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:10}}>Días y horarios fijos</div>
            {formHorarios.length===0
              ? <div style={{fontSize:12,color:'var(--border)',marginBottom:10}}>Sin horarios asignados</div>
              : formHorarios.map((h,i)=>(
                  <div key={h._isNew?h._uid:h.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 8px',background:'var(--sl-l)',borderRadius:7,marginBottom:6}}>
                    <div>
                      <span style={{fontSize:13,fontWeight:500}}>{DIAS[h.dia_semana]} {h.hora?.slice(0,5)}</span>
                      <span style={{fontSize:11,color:'var(--sl-m)',marginLeft:8}}>{h.nombre_clase}</span>
                      {(h.instructores?.nombre || (h._isNew && instructores.find(i=>i.id===h.instructor_id)?.nombre)) && (
                        <span style={{fontSize:10,marginLeft:6,color:'var(--white)',background:'var(--sl-m)',padding:'1px 6px',borderRadius:4}}>
                          {h.instructores?.nombre || instructores.find(i=>i.id===h.instructor_id)?.nombre}
                        </span>
                      )}
                      {h._isNew&&<span style={{fontSize:9,marginLeft:4,color:'#2D7A5A',fontWeight:700}}>nuevo</span>}
                    </div>
                    <button className="btn-danger" style={{fontSize:11,padding:'2px 7px'}} onClick={()=>quitarHorarioEnModal(h)}>×</button>
                  </div>
                ))
            }
            <div style={{background:'var(--sl-l)',borderRadius:10,padding:'10px',marginTop:6}}>
              <div className="form-row2">
                <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Día</label><select className="form-inp" value={formHorarioNew.dia_semana} onChange={setHN('dia_semana')}>{DIAS.map((d,i)=><option key={i} value={i}>{d}</option>)}</select></div>
                <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Hora</label><input className="form-inp" type="time" value={formHorarioNew.hora} onChange={setHN('hora')}/></div>
              </div>
              <div className="form-row" style={{marginTop:8}}><label className="form-lbl">Nombre de la clase</label><input className="form-inp" value={formHorarioNew.nombre_clase} onChange={setHN('nombre_clase')} placeholder="Ej: Reformer Intermedio"/></div>
              <div className="form-row2">
                <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Instructor</label><select className="form-inp" value={formHorarioNew.instructor_id} onChange={setHN('instructor_id')}><option value="">Sin asignar</option>{instructores.map(i=><option key={i.id} value={i.id}>{i.nombre} {i.apellido}</option>)}</select></div>
                <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Sala</label><select className="form-inp" value={formHorarioNew.sala} onChange={setHN('sala')}><option value="Sala A">Sala A</option><option value="Sala B">Sala B</option></select></div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8,marginTop:10,flexWrap:'wrap'}}>
                <span style={{fontSize:11,color:'var(--sl-m)'}}>Generar clases:</span>
                {[0,4,8,12].map(n=>(
                  <button key={n} onClick={()=>setSemanasNuevo(n)}
                    style={{fontSize:11,padding:'3px 10px',borderRadius:6,border:`1px solid ${semanasNuevo===n?'var(--mg)':'var(--border)'}`,background:semanasNuevo===n?'var(--mg)':'var(--white)',color:semanasNuevo===n?'#fff':'var(--dark)',cursor:'pointer',fontWeight:semanasNuevo===n?600:400}}>
                    {n===0?'No generar':`${n} sem`}
                  </button>
                ))}
              </div>
              <button className="btn-sec" style={{fontSize:12,marginTop:8}} onClick={agregarHorarioEnModal} disabled={saving}>
                {saving ? 'Guardando…' : semanasNuevo > 0 ? `+ Agregar y generar ${semanasNuevo} semanas` : '+ Agregar horario'}
              </button>
            </div>
          </div>

          {/* Generar clases en el calendario — solo para alumnos existentes con horarios */}
          {form.id && formHorarios.length > 0 && (
            <div style={{marginTop:14,padding:'12px',background:'#FEF3E2',borderRadius:10,border:'1px solid #F0C060'}}>
              <div style={{fontSize:11,fontWeight:500,color:'#7A5010',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:10}}>Generar clases en el calendario</div>
              <div className="form-row2">
                <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Desde</label><input className="form-inp" type="date" value={replicarDesde} onChange={e=>setReplicarDesde(e.target.value)}/></div>
                <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Semanas</label><select className="form-inp" value={replicarSemanas} onChange={e=>setReplicarSemanas(Number(e.target.value))}>{[1,2,3,4,6,8,12].map(n=><option key={n} value={n}>{n} semanas</option>)}</select></div>
              </div>
              {replicarOk&&<div style={{fontSize:12,color:'#2D7A5A',background:'#E4F4EE',padding:'7px 10px',borderRadius:7,marginTop:8}}>Clases generadas correctamente</div>}
              <button className="btn-pri" style={{fontSize:12,background:'#D4A020',marginTop:8}} onClick={generarClasesDesdeModal} disabled={replicando}>{replicando?'Generando…':`Generar ${replicarSemanas} semanas`}</button>
            </div>
          )}
        </Modal>
        )
      })()}

      {/* MODAL auditoría duplicados */}
      {auditModal&&(()=>{
        const grupos = []
        const vistos = new Set()
        for (const a of alumnos) {
          if (vistos.has(a.id)) continue
          const dups = buscarPosiblesDuplicados(a, alumnos)
          if (dups.length > 0) {
            grupos.push([a, ...dups])
            vistos.add(a.id)
            dups.forEach(d=>vistos.add(d.id))
          }
        }
        return (
          <Modal title="Auditoría de duplicados" onClose={()=>setAuditModal(false)} footer={<button className="btn-pri" onClick={()=>setAuditModal(false)}>Cerrar</button>}>
            {grupos.length === 0
              ? <div style={{padding:'20px 0',textAlign:'center',color:'var(--sl-m)',fontSize:13}}>No se detectaron posibles duplicados.</div>
              : grupos.map((grupo, gi)=>(
                <div key={gi} style={{marginBottom:16,border:'1px solid #F0C060',borderRadius:10,overflow:'hidden'}}>
                  <div style={{background:'#FEF3E2',padding:'6px 12px',fontSize:11,fontWeight:600,color:'#7A5010'}}>Posible duplicado — grupo {gi+1}</div>
                  {grupo.map(a=>(
                    <div key={a.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,padding:'9px 12px',borderTop:'1px solid #F5E8C8'}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <Avatar nombre={a.nombre} apellido={a.apellido} size={26} fontSize={10}/>
                        <div>
                          <div style={{fontSize:13,fontWeight:500,color:'var(--mg)'}}>{a.nombre} {a.apellido}</div>
                          <div style={{fontSize:11,color:'var(--sl-m)'}}>{[a.telefono, a.fecha_nacimiento&&format(new Date(a.fecha_nacimiento+'T00:00:00'),"d/MM/yyyy"), a.plan].filter(Boolean).join(' · ')}</div>
                        </div>
                      </div>
                      <button className="btn-sec" style={{fontSize:11,padding:'4px 8px',whiteSpace:'nowrap'}} onClick={()=>{ setAuditModal(false); openModal(a) }}>Editar</button>
                    </div>
                  ))}
                </div>
              ))
            }
          </Modal>
        )
      })()}

      {/* MODAL historial */}
      {historial&&(
        <Modal title={`Historial — ${historial.nombre} ${historial.apellido}`} onClose={()=>setHistorial(null)} footer={<button className="btn-pri" onClick={()=>setHistorial(null)}>Cerrar</button>}>
          <table className="tbl">
            <thead><tr><th>Fecha</th><th>Clase</th><th>Instructor</th><th>Asistió</th></tr></thead>
            <tbody>
              {histData.length===0&&<tr><td colSpan={4} className="empty">Sin registros</td></tr>}
              {histData.map(h=>(
                <tr key={h.id}>
                  <td>{h.clases?.fecha?format(new Date(h.clases.fecha+'T00:00:00'),'dd/MM/yy'):'—'}</td>
                  <td>{h.clases?.nombre||'—'}</td>
                  <td>{h.clases?.instructores?`${h.clases.instructores.nombre} ${h.clases.instructores.apellido}`:'—'}</td>
                  <td><span className={`est ${h.asistio?'e-ok':'e-ve'}`}>{h.asistio?'Sí':'No'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
    </>
  )
}
