import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import Avatar from '../components/Avatar'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, endOfWeek, isSameMonth, isToday,
  addMonths, subMonths, addWeeks, subWeeks, isSameDay
} from 'date-fns'
import { es } from 'date-fns/locale'

const COL_INST = [
  { bg:'#FAE0EA', text:'#8B1A42', border:'#C0396B' },
  { bg:'#D8F3EA', text:'#085041', border:'#1D9E75' },
  { bg:'#D6E8F9', text:'#042C53', border:'#185FA5' },
  { bg:'#F0EAF8', text:'#6A3A8A', border:'#9B6BBB' },
  { bg:'#FEF3E2', text:'#7A5010', border:'#D4A020' },
]

const ESTADOS = {
  pendiente:         { icon:'—', bg:'var(--sl-l)',  text:'var(--sl-m)',  border:'transparent' },
  presente:          { icon:'✓', bg:'#E4F4EE',      text:'#2D7A5A',     border:'#6DC49A' },
  ausente_con_aviso: { icon:'⚠', bg:'#FEF3E2',      text:'#7A5010',     border:'#F0C060' },
  ausente_sin_aviso: { icon:'✗', bg:'#FDECEA',      text:'#B03030',     border:'#F09595' },
}

export default function Calendario() {
  const [refDate, setRefDate]       = useState(new Date())
  const [vistaMovil, setVistaMovil] = useState('semanal')  // 'semanal' | 'mensual'
  const [esMobile, setEsMobile]     = useState(window.innerWidth <= 768)
  const [clases, setClases]         = useState([])
  const [instructores, setInstructores] = useState([])
  const [alumnos, setAlumnos]       = useState([])
  const [loading, setLoading]       = useState(true)

  const [modalClase, setModalClase] = useState(null)
  const [modalNueva, setModalNueva] = useState(null)
  const [modalMover, setModalMover] = useState(null)
  const [modalAgregar, setModalAgregar] = useState(null)
  const [editando, setEditando]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [dragging, setDragging]     = useState(null)
  const [dragOver, setDragOver]     = useState(null)

  const emptyForm = { nombre:'', tipo:'grupal', instructor_id:'', fecha:'', hora:'08:00', sala:'Sala A', capacidad:4 }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    const onResize = () => setEsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => { fetchBase() }, [])
  useEffect(() => { fetchClases() }, [refDate, esMobile, vistaMovil])

  async function fetchBase() {
    const [{ data: ins }, { data: al }] = await Promise.all([
      supabase.from('instructores').select('id,nombre,apellido').eq('activo',true).order('nombre'),
      supabase.from('alumnos').select('id,nombre,apellido').eq('activo',true).order('apellido'),
    ])
    setInstructores(ins||[])
    setAlumnos(al||[])
  }

  function getRango() {
    if (esMobile && vistaMovil === 'semanal') {
      const sw = startOfWeek(refDate, {weekStartsOn:1})
      const ew = endOfWeek(refDate, {weekStartsOn:1})
      return { inicio: format(sw,'yyyy-MM-dd'), fin: format(ew,'yyyy-MM-dd'), dias: eachDayOfInterval({start:sw,end:ew}) }
    }
    // Mensual
    const sm = startOfMonth(refDate)
    const em = endOfMonth(refDate)
    const sw = startOfWeek(sm,{weekStartsOn:1})
    const ew = endOfWeek(em,{weekStartsOn:1})
    return { inicio: format(sw,'yyyy-MM-dd'), fin: format(ew,'yyyy-MM-dd'), dias: eachDayOfInterval({start:sw,end:ew}) }
  }

  async function fetchClases() {
    setLoading(true)
    const { inicio, fin } = getRango()
    const { data } = await supabase
      .from('clases')
      .select('*, instructores(id,nombre,apellido), asistencias(id,alumno_id,asistio,recuperacion,estado_asistencia,alumnos(id,nombre,apellido))')
      .gte('fecha',inicio).lte('fecha',fin).order('hora')
    setClases(data||[])
    setLoading(false)
  }

  async function refrescarClase(id) {
    const { data } = await supabase
      .from('clases')
      .select('*, instructores(id,nombre,apellido), asistencias(id,alumno_id,asistio,recuperacion,estado_asistencia,alumnos(id,nombre,apellido))')
      .eq('id',id).single()
    if (data) { setClases(prev => prev.map(c=>c.id===id?data:c)); setModalClase(data) }
  }

  function colInst(instId) {
    const idx = instructores.findIndex(i=>i.id===instId)
    return COL_INST[idx%COL_INST.length]||COL_INST[0]
  }

  function clasesDia(dia) {
    const key = format(dia,'yyyy-MM-dd')
    return clases.filter(c=>c.fecha===key).sort((a,b)=>a.hora.localeCompare(b.hora))
  }

  function resumen(clase) {
    const a = clase.asistencias||[]
    return {
      total:      a.length,
      presentes:  a.filter(x=>x.estado_asistencia==='presente').length,
      conAviso:   a.filter(x=>x.estado_asistencia==='ausente_con_aviso').length,
      sinAviso:   a.filter(x=>x.estado_asistencia==='ausente_sin_aviso').length,
      pendientes: a.filter(x=>!x.estado_asistencia||x.estado_asistencia==='pendiente').length,
      recs:       a.filter(x=>x.recuperacion).length,
    }
  }

  // Drag & drop
  function onDragStart(e, id) { setDragging({id}); e.dataTransfer.effectAllowed='move' }
  function onDragOver(e, fecha) { e.preventDefault(); setDragOver(fecha) }
  async function onDrop(e, fecha) {
    e.preventDefault(); setDragOver(null)
    if (!dragging) return
    const c = clases.find(x=>x.id===dragging.id)
    if (!c||c.fecha===fecha){setDragging(null);return}
    await supabase.from('clases').update({fecha}).eq('id',dragging.id)
    setDragging(null); fetchClases()
  }

  // CRUD
  async function guardarNueva() {
    if (!form.nombre||!form.fecha||!form.hora) return
    setSaving(true)
    await supabase.from('clases').insert({ nombre:form.nombre, tipo:form.tipo, instructor_id:form.instructor_id||null, fecha:form.fecha, hora:form.hora, sala:form.sala, capacidad:Number(form.capacidad) })
    setSaving(false); setModalNueva(null); setForm(emptyForm); fetchClases()
  }

  async function guardarEdicion() {
    if (!form.nombre||!form.hora) return
    setSaving(true)
    await supabase.from('clases').update({ nombre:form.nombre, tipo:form.tipo, instructor_id:form.instructor_id||null, hora:form.hora, sala:form.sala, capacidad:Number(form.capacidad) }).eq('id',modalClase.id)
    setSaving(false); setEditando(false); refrescarClase(modalClase.id); fetchClases()
  }

  async function eliminarClase() {
    if (!confirm('¿Eliminar esta clase?')) return
    await supabase.from('clases').delete().eq('id',modalClase.id)
    setModalClase(null); fetchClases()
  }

  async function cambiarEstado(asistId, nuevoEstado) {
    await supabase.from('asistencias').update({ estado_asistencia:nuevoEstado, asistio:nuevoEstado==='presente' }).eq('id',asistId)
    await refrescarClase(modalClase.id)
  }

  async function agregarAlumno(alumnoId, esRec) {
    await supabase.from('asistencias').upsert({ clase_id:modalAgregar.clase.id, alumno_id:alumnoId, asistio:false, recuperacion:esRec, estado_asistencia:'pendiente' }, {onConflict:'clase_id,alumno_id'})
    setModalAgregar(null); refrescarClase(modalAgregar.clase.id)
  }

  async function quitarAlumno(asistId) {
    await supabase.from('asistencias').delete().eq('id',asistId)
    refrescarClase(modalClase.id)
  }

  async function moverAlumno(destId) {
    await supabase.from('asistencias').delete().eq('id',modalMover.asistId)
    await supabase.from('asistencias').upsert({ clase_id:destId, alumno_id:modalMover.alumnoId, asistio:false, recuperacion:false, estado_asistencia:'pendiente' }, {onConflict:'clase_id,alumno_id'})
    setModalMover(null); refrescarClase(modalClase.id); fetchClases()
  }

  const setF = k => e => setForm(f=>({...f,[k]:e.target.value}))
  const { dias } = getRango()
  const semanaActual = startOfWeek(refDate,{weekStartsOn:1})

  // NAVEGACIÓN
  function anterior() {
    if (esMobile && vistaMovil==='semanal') setRefDate(d => subWeeks(d,1))
    else setRefDate(d => subMonths(d,1))
  }
  function siguiente() {
    if (esMobile && vistaMovil==='semanal') setRefDate(d => addWeeks(d,1))
    else setRefDate(d => addMonths(d,1))
  }
  function irHoy() { setRefDate(new Date()) }

  function labelPeriodo() {
    if (esMobile && vistaMovil==='semanal') {
      const sw = startOfWeek(refDate,{weekStartsOn:1})
      const ew = endOfWeek(refDate,{weekStartsOn:1})
      return `${format(sw,'d MMM',{locale:es})} — ${format(ew,'d MMM',{locale:es})}`
    }
    return format(refDate,'MMMM yyyy',{locale:es}).replace(/^\w/,c=>c.toUpperCase())
  }

  // Chip de clase
  function ChipClase({ c, compact=false }) {
    const col = colInst(c.instructor_id)
    const res = resumen(c)
    const tieneRec = (c.asistencias||[]).some(a=>a.recuperacion)
    const hayAusSA = res.sinAviso>0
    return (
      <div draggable onDragStart={e=>onDragStart(e,c.id)} onDragEnd={()=>setDragging(null)}
        onClick={() => { setModalClase(c); setEditando(false) }}
        style={{
          background:col.bg, color:col.text,
          border:`1px solid ${hayAusSA?'#F09595':tieneRec?'#D4A020':col.border}`,
          borderRadius:5, padding:compact?'4px 8px':'3px 6px', marginBottom:3,
          cursor:'grab', userSelect:'none', opacity:dragging?.id===c.id?0.4:1,
        }}>
        <div style={{fontSize:compact?11:9, fontWeight:500, opacity:0.75}}>
          {c.hora.slice(0,5)}
          {compact && <span style={{marginLeft:4,opacity:0.9}}>{c.instructores?.nombre?.split(' ')[0]||'—'}</span>}
        </div>
        <div style={{fontSize:compact?12:10, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
          {c.nombre}
          {tieneRec && <span style={{fontSize:8,padding:'1px 3px',background:'rgba(0,0,0,0.1)',borderRadius:3,marginLeft:3}}>REC</span>}
        </div>
        {res.total>0 && (
          <div style={{display:'flex',gap:2,marginTop:2,alignItems:'center'}}>
            {res.presentes>0  && <div style={{height:3,borderRadius:2,background:'#48A999',flex:res.presentes}}/>}
            {res.conAviso>0   && <div style={{height:3,borderRadius:2,background:'#D4A020',flex:res.conAviso}}/>}
            {res.sinAviso>0   && <div style={{height:3,borderRadius:2,background:'#E24B4A',flex:res.sinAviso}}/>}
            {res.pendientes>0 && <div style={{height:3,borderRadius:2,background:'var(--border)',flex:res.pendientes}}/>}
            <span style={{fontSize:8,color:col.text,opacity:0.6,fontFamily:'var(--font-num)'}}>{res.presentes}/{res.total}</span>
          </div>
        )}
      </div>
    )
  }

  // VISTA SEMANAL (mobile)
  function VistaSemanal() {
    return (
      <div>
        {dias.map(dia => {
          const clasesD  = clasesDia(dia)
          const esHoy    = isToday(dia)
          const fechaStr = format(dia,'yyyy-MM-dd')
          return (
            <div key={fechaStr}
              onDragOver={e=>onDragOver(e,fechaStr)} onDragLeave={()=>setDragOver(null)} onDrop={e=>onDrop(e,fechaStr)}
              style={{
                marginBottom:8, borderRadius:10, overflow:'hidden',
                border:`1px solid ${dragOver===fechaStr?'var(--mg)':esHoy?'rgba(192,57,107,0.3)':'var(--border)'}`,
                background: dragOver===fechaStr?'rgba(192,57,107,0.04)':esHoy?'rgba(192,57,107,0.02)':'var(--white)',
                outline: dragOver===fechaStr?'2px dashed var(--mg)':'none', outlineOffset:-2,
              }}>
              {/* Cabecera del día */}
              <div style={{padding:'8px 12px', borderBottom: clasesD.length>0?'1px solid var(--border)':'none', display:'flex', alignItems:'center', justifyContent:'space-between', background:esHoy?'rgba(192,57,107,0.06)':'var(--sl-l)'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{
                    width:28,height:28,borderRadius:'50%',
                    background:esHoy?'var(--mg)':'transparent',
                    color:esHoy?'#fff':'var(--dark)',
                    display:'flex',alignItems:'center',justifyContent:'center',
                    fontFamily:'var(--font-num)',fontSize:13,fontWeight:700,
                  }}>{dia.getDate()}</div>
                  <span style={{fontSize:13,fontWeight:esHoy?500:400,color:esHoy?'var(--mg)':'var(--dark)',textTransform:'capitalize'}}>
                    {format(dia,'EEEE',{locale:es})}
                  </span>
                </div>
                <button onClick={() => { setForm({...emptyForm,fecha:fechaStr}); setModalNueva(fechaStr) }}
                  style={{fontSize:11,padding:'3px 9px',borderRadius:6,background:'var(--white)',border:'1px solid var(--border)',cursor:'pointer',color:'var(--sl-m)'}}>
                  + Clase
                </button>
              </div>
              {/* Clases del día */}
              {clasesD.length===0
                ? <div style={{padding:'10px 12px',fontSize:11,color:'var(--sl-m)'}}>Sin clases</div>
                : <div style={{padding:'8px 12px',display:'flex',flexDirection:'column',gap:4}}>
                    {clasesD.map(c => <ChipClase key={c.id} c={c} compact />)}
                  </div>
              }
            </div>
          )
        })}
      </div>
    )
  }

  // VISTA MENSUAL (desktop + opción mobile)
  function VistaMensual() {
    return (
      <>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,minmax(0,1fr))', gap:1, background:'var(--border)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
          {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => (
            <div key={d} style={{background:'var(--sl-l)',padding:'6px 4px',fontSize:9,fontWeight:500,color:'var(--sl-m)',textTransform:'uppercase',letterSpacing:'0.05em',textAlign:'center'}}>{d}</div>
          ))}
          {dias.map(dia => {
            const esMes  = isSameMonth(dia,refDate)
            const esHoy  = isToday(dia)
            const fStr   = format(dia,'yyyy-MM-dd')
            const cDia   = clasesDia(dia)
            const isDT   = dragOver===fStr
            return (
              <div key={fStr} className={esHoy?'cal-hoy-celda':''}
                onDragOver={e=>onDragOver(e,fStr)} onDragLeave={()=>setDragOver(null)} onDrop={e=>onDrop(e,fStr)}
                style={{ background:isDT?'rgba(192,57,107,0.06)':esHoy?undefined:esMes?'var(--white)':'var(--sl-l)', padding:6, minHeight:esMes?100:80, opacity:esMes?1:0.4, outline:isDT?'2px dashed var(--mg)':'none', outlineOffset:-2, transition:'background 0.12s' }}>
                <div className={`cal-num${esHoy?' cal-num-hoy':''}`}>{dia.getDate()}</div>
                {cDia.map(c => <ChipClase key={c.id} c={c} />)}
                {esMes && (
                  <button onClick={() => { setForm({...emptyForm,fecha:fStr}); setModalNueva(fStr) }}
                    style={{width:'100%',marginTop:2,background:'none',border:'0.5px dashed var(--border)',borderRadius:4,color:'var(--sl-m)',fontSize:10,padding:'1px 0',cursor:'pointer'}}>
                    +
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <div style={{fontSize:10,color:'var(--sl-m)',marginTop:6,textAlign:'center'}}>Arrastrá una clase para moverla a otro día</div>
      </>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:10}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <button className="btn-sec" style={{padding:'6px 10px'}} onClick={anterior}>←</button>
          <span style={{fontSize:14,fontWeight:500,minWidth:140,textAlign:'center'}}>{labelPeriodo()}</span>
          <button className="btn-sec" style={{padding:'6px 10px'}} onClick={siguiente}>→</button>
          <button className="btn-sec" style={{fontSize:11}} onClick={irHoy}>Hoy</button>
        </div>

        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          {/* Toggle vista en móvil */}
          {esMobile && (
            <div style={{display:'flex',background:'var(--sl-l)',borderRadius:8,padding:2,gap:2}}>
              {['semanal','mensual'].map(v => (
                <button key={v} onClick={() => setVistaMovil(v)}
                  style={{padding:'4px 12px',borderRadius:6,border:'none',fontSize:11,cursor:'pointer',
                    background:vistaMovil===v?'var(--white)':'transparent',
                    color:vistaMovil===v?'var(--dark)':'var(--sl-m)',
                    fontWeight:vistaMovil===v?500:400,transition:'all 0.15s'}}>
                  {v.charAt(0).toUpperCase()+v.slice(1)}
                </button>
              ))}
            </div>
          )}
          {/* Leyenda */}
          <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
            {instructores.map((inst,idx) => {
              const col = COL_INST[idx%COL_INST.length]
              return (
                <div key={inst.id} style={{display:'flex',alignItems:'center',gap:4,fontSize:10,color:'var(--sl-m)'}}>
                  <div style={{width:8,height:8,borderRadius:'50%',background:col.border}}/>
                  {inst.nombre}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {loading ? <div className="loading">Cargando…</div>
        : (esMobile && vistaMovil==='semanal') ? <VistaSemanal /> : <VistaMensual />
      }

      {/* ====== MODAL: Ver clase ====== */}
      {modalClase && !editando && !modalAgregar && !modalMover && (
        <Modal title={modalClase.nombre} onClose={() => setModalClase(null)}
          footer={<>
            <button className="btn-danger" onClick={eliminarClase}>Eliminar</button>
            <button className="btn-sec" onClick={() => setModalClase(null)}>Cerrar</button>
          </>}>
          <div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:12}}>
            {modalClase.instructores && (() => { const col=colInst(modalClase.instructor_id); return <span style={{fontSize:11,padding:'3px 9px',borderRadius:99,background:col.bg,color:col.text}}>{modalClase.instructores.nombre} {modalClase.instructores.apellido}</span> })()}
            <span style={{fontSize:11,padding:'3px 9px',borderRadius:99,background:'var(--sl-l)',color:'var(--sl-m)'}}>{modalClase.tipo==='grupal'?'Grupal':'Individual'}</span>
            <span style={{fontSize:11,padding:'3px 9px',borderRadius:99,background:'var(--sl-l)',color:'var(--sl-m)'}}>{modalClase.sala}</span>
            <span style={{fontSize:11,padding:'3px 9px',borderRadius:99,background:'var(--sl-l)',color:'var(--sl-m)',fontFamily:'var(--font-num)'}}>{modalClase.hora?.slice(0,5)} · {modalClase.fecha}</span>
          </div>

          {/* Resumen */}
          {(() => { const r=resumen(modalClase); if(r.total===0) return null; return (
            <div style={{display:'flex',gap:7,marginBottom:12,flexWrap:'wrap'}}>
              <span style={{fontSize:11,padding:'3px 9px',borderRadius:8,background:'#E4F4EE',color:'#2D7A5A'}}>✓ {r.presentes}</span>
              {r.conAviso>0  && <span style={{fontSize:11,padding:'3px 9px',borderRadius:8,background:'#FEF3E2',color:'#7A5010'}}>⚠ {r.conAviso}</span>}
              {r.sinAviso>0  && <span style={{fontSize:11,padding:'3px 9px',borderRadius:8,background:'#FDECEA',color:'#B03030'}}>✗ {r.sinAviso}</span>}
              {r.pendientes>0 && <span style={{fontSize:11,padding:'3px 9px',borderRadius:8,background:'var(--sl-l)',color:'var(--sl-m)'}}>○ {r.pendientes}</span>}
              {r.recs>0 && <span style={{fontSize:11,padding:'3px 9px',borderRadius:8,background:'#FEF3E2',color:'#7A5010'}}>REC {r.recs}</span>}
            </div>
          )})()}

          <div style={{fontSize:11,fontWeight:500,color:'var(--sl-m)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8}}>
            Alumnos ({(modalClase.asistencias||[]).length})
          </div>

          {(modalClase.asistencias||[]).length===0 && <div className="empty" style={{padding:'16px 0'}}>Sin alumnos asignados</div>}

          {(modalClase.asistencias||[]).map(a => {
            const estado = a.estado_asistencia||'pendiente'
            return (
              <div key={a.id} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 0',borderBottom:'1px solid var(--border)',flexWrap:'wrap'}}>
                <div style={{cursor:'pointer'}} onClick={() => window.dispatchEvent(new CustomEvent('open-ficha-alumno',{detail:a.alumno_id}))}>
                  <Avatar nombre={a.alumnos?.nombre||'?'} apellido={a.alumnos?.apellido||''} size={24} fontSize={8}/>
                </div>
                <div style={{flex:1,minWidth:80,cursor:'pointer'}} onClick={() => window.dispatchEvent(new CustomEvent('open-ficha-alumno',{detail:a.alumno_id}))}>
                  <div style={{fontSize:13,fontWeight:500,color:'var(--mg)'}}>{a.alumnos?.nombre} {a.alumnos?.apellido}</div>
                  {a.recuperacion && <span style={{fontSize:9,padding:'1px 5px',background:'#FEF3E2',color:'#7A5010',borderRadius:3}}>REC</span>}
                </div>
                <div style={{display:'flex',gap:3,flexShrink:0}}>
                  {Object.entries(ESTADOS).map(([key,val]) => (
                    <button key={key} onClick={() => cambiarEstado(a.id,key)} title={val.label}
                      style={{ padding:'4px 7px',borderRadius:6,fontSize:12,cursor:'pointer',fontWeight:600,
                        background:estado===key?val.bg:'var(--sl-l)', color:estado===key?val.text:'var(--sl-m)',
                        border:`1px solid ${estado===key?val.border:'transparent'}`, transition:'all 0.12s' }}>
                      {val.icon}
                    </button>
                  ))}
                  <button className="btn-sec" style={{fontSize:10,padding:'3px 6px'}}
                    onClick={() => setModalMover({clase:modalClase,asistId:a.id,alumnoId:a.alumno_id})}>→</button>
                  <button className="btn-danger" style={{fontSize:10,padding:'3px 6px'}} onClick={() => quitarAlumno(a.id)}>✕</button>
                </div>
              </div>
            )
          })}

          {resumen(modalClase).sinAviso>0 && (
            <div style={{marginTop:10,padding:'9px 12px',background:'#FDECEA',borderRadius:8,fontSize:12,color:'#B03030'}}>
              ⚠ {resumen(modalClase).sinAviso} ausente{resumen(modalClase).sinAviso>1?'s':''} sin aviso.
            </div>
          )}

          <div style={{display:'flex',gap:7,marginTop:12,flexWrap:'wrap'}}>
            <button className="btn-sec" style={{fontSize:11}} onClick={() => setModalAgregar({clase:modalClase,esRec:false})}>+ Alumno</button>
            <button style={{fontSize:11,padding:'6px 12px',borderRadius:8,background:'#FEF3E2',color:'#7A5010',border:'1px solid #F0C060',cursor:'pointer'}}
              onClick={() => setModalAgregar({clase:modalClase,esRec:true})}>+ Recuperación</button>
            <button className="btn-sec" style={{fontSize:11}} onClick={() => {
              setForm({nombre:modalClase.nombre,tipo:modalClase.tipo,instructor_id:modalClase.instructor_id||'',fecha:modalClase.fecha,hora:modalClase.hora,sala:modalClase.sala,capacidad:modalClase.capacidad})
              setEditando(true)
            }}>Editar</button>
          </div>
        </Modal>
      )}

      {/* ====== MODAL: Editar ====== */}
      {modalClase && editando && (
        <Modal title="Editar clase" onClose={() => setEditando(false)}
          footer={<><button className="btn-sec" onClick={() => setEditando(false)}>Cancelar</button><button className="btn-pri" onClick={guardarEdicion} disabled={saving}>{saving?'…':'Guardar'}</button></>}>
          <div className="form-row"><label className="form-lbl">Nombre</label><input className="form-inp" value={form.nombre} onChange={setF('nombre')}/></div>
          <div className="form-row2">
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Tipo</label><select className="form-inp" value={form.tipo} onChange={setF('tipo')}><option value="grupal">Grupal</option><option value="individual">Individual</option></select></div>
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Instructor</label><select className="form-inp" value={form.instructor_id} onChange={setF('instructor_id')}><option value="">Sin asignar</option>{instructores.map(i=><option key={i.id} value={i.id}>{i.nombre} {i.apellido}</option>)}</select></div>
          </div>
          <div className="form-row2" style={{marginTop:12}}>
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Hora</label><input className="form-inp" type="time" value={form.hora} onChange={setF('hora')}/></div>
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Sala</label><select className="form-inp" value={form.sala} onChange={setF('sala')}><option value="Sala A">Sala A</option><option value="Sala B">Sala B</option></select></div>
          </div>
        </Modal>
      )}

      {/* ====== MODAL: Nueva clase ====== */}
      {modalNueva && (
        <Modal title={`Nueva clase — ${format(new Date(modalNueva+'T00:00:00'),"d 'de' MMMM",{locale:es})}`}
          onClose={() => setModalNueva(null)}
          footer={<><button className="btn-sec" onClick={() => setModalNueva(null)}>Cancelar</button><button className="btn-pri" onClick={guardarNueva} disabled={saving}>{saving?'…':'Guardar'}</button></>}>
          <div className="form-row"><label className="form-lbl">Nombre</label><input className="form-inp" value={form.nombre} onChange={setF('nombre')} placeholder="Ej: Reformer Intermedio"/></div>
          <div className="form-row2">
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Tipo</label><select className="form-inp" value={form.tipo} onChange={setF('tipo')}><option value="grupal">Grupal</option><option value="individual">Individual</option></select></div>
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Instructor</label><select className="form-inp" value={form.instructor_id} onChange={setF('instructor_id')}><option value="">Sin asignar</option>{instructores.map(i=><option key={i.id} value={i.id}>{i.nombre} {i.apellido}</option>)}</select></div>
          </div>
          <div className="form-row2" style={{marginTop:12}}>
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Hora</label><input className="form-inp" type="time" value={form.hora} onChange={setF('hora')}/></div>
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Sala</label><select className="form-inp" value={form.sala} onChange={setF('sala')}><option value="Sala A">Sala A</option><option value="Sala B">Sala B</option></select></div>
          </div>
          <div className="form-row" style={{marginTop:12}}><label className="form-lbl">Capacidad</label><input className="form-inp" type="number" min={1} max={20} value={form.capacidad} onChange={setF('capacidad')}/></div>
        </Modal>
      )}

      {/* ====== MODAL: Agregar alumno ====== */}
      {modalAgregar && (
        <Modal title={modalAgregar.esRec?'Agregar recuperación':'Agregar alumno'}
          onClose={() => setModalAgregar(null)}
          footer={<button className="btn-sec" onClick={() => setModalAgregar(null)}>Cancelar</button>}>
          {modalAgregar.esRec && <div style={{fontSize:12,padding:'8px 12px',background:'#FEF3E2',color:'#7A5010',borderRadius:8,marginBottom:12}}>Clase de recuperación — el lugar queda reservado.</div>}
          {(() => {
            const ya = (modalAgregar.clase.asistencias||[]).map(a=>a.alumno_id)
            const disp = alumnos.filter(a=>!ya.includes(a.id))
            if (disp.length===0) return <div className="empty">No hay alumnos disponibles</div>
            return disp.map(a => (
              <div key={a.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}><Avatar nombre={a.nombre} apellido={a.apellido} size={22} fontSize={8}/><span style={{fontSize:13}}>{a.nombre} {a.apellido}</span></div>
                <button className="btn-pri" style={{fontSize:11,padding:'4px 12px'}} onClick={() => agregarAlumno(a.id,modalAgregar.esRec)}>Agregar</button>
              </div>
            ))
          })()}
        </Modal>
      )}

      {/* ====== MODAL: Mover alumno ====== */}
      {modalMover && (
        <Modal title="Mover a otra clase" onClose={() => setModalMover(null)}
          footer={<button className="btn-sec" onClick={() => setModalMover(null)}>Cancelar</button>}>
          <div style={{fontSize:12,color:'var(--sl-m)',marginBottom:12}}>Seleccioná la clase de destino:</div>
          {clases.filter(c=>c.id!==modalMover.clase.id).map(c => {
            const col = colInst(c.instructor_id)
            return (
              <div key={c.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                <div>
                  <div style={{fontSize:13,fontWeight:500}}>{c.nombre}</div>
                  <div style={{fontSize:11,color:'var(--sl-m)'}}>{c.fecha} · {c.hora?.slice(0,5)} · <span style={{color:col.border}}>{c.instructores?.nombre} {c.instructores?.apellido}</span></div>
                </div>
                <button className="btn-pri" style={{fontSize:11,padding:'4px 12px'}} onClick={() => moverAlumno(c.id)}>Mover</button>
              </div>
            )
          })}
        </Modal>
      )}
    </div>
  )
}
