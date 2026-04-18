import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import Avatar from '../components/Avatar'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, endOfWeek, isSameMonth, isToday,
  addMonths, subMonths, addWeeks, subWeeks, addDays
} from 'date-fns'
import { es } from 'date-fns/locale'

// Colores por defecto para instructores (asignados por orden de creación)
const COL_INST = [
  { bg:'#FAE0EA', text:'#8B1A42', border:'#C0396B', nombre:'Rosa magenta' },
  { bg:'#D8F3EA', text:'#085041', border:'#1D9E75', nombre:'Verde' },
  { bg:'#D6E8F9', text:'#042C53', border:'#185FA5', nombre:'Azul' },
  { bg:'#F0EAF8', text:'#6A3A8A', border:'#9B6BBB', nombre:'Violeta' },
  { bg:'#FEF3E2', text:'#7A5010', border:'#D4A020', nombre:'Naranja' },
]

const ESTADOS = {
  pendiente:         { icon:'—', label:'Sin marcar',      bg:'var(--sl-l)', text:'var(--sl-m)',  border:'transparent',  barColor:'#D0D5DD' },
  presente:          { icon:'✓', label:'Presente',         bg:'#E4F4EE',    text:'#2D7A5A',     border:'#6DC49A',       barColor:'#48A999' },
  ausente_con_aviso: { icon:'⚠', label:'Ausente c/aviso', bg:'#FEF3E2',    text:'#7A5010',     border:'#F0C060',       barColor:'#D4A020' },
  ausente_sin_aviso: { icon:'✗', label:'Ausente s/aviso', bg:'#FDECEA',    text:'#B03030',     border:'#F09595',       barColor:'#E24B4A' },
}

export default function Calendario({ esAdmin }) {
  const [refDate, setRefDate]       = useState(new Date())
  const [vistaMovil, setVistaMovil] = useState('semanal')
  const [esMobile, setEsMobile]     = useState(window.innerWidth <= 768)
  const [clases, setClases]         = useState([])
  const [instructores, setInstructores] = useState([])
  const [alumnos, setAlumnos]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [mostrarLeyenda, setMostrarLeyenda] = useState(false)

  const [modalClase, setModalClase] = useState(null)
  const [modalNueva, setModalNueva] = useState(null)
  const [modalMover, setModalMover] = useState(null)
  const [modalAgregar, setModalAgregar] = useState(null)
  const [editando, setEditando]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [dragging, setDragging]     = useState(null)
  const [dragOver, setDragOver]     = useState(null)

  // Multi-selección de alumnos
  const [seleccionados, setSeleccionados] = useState([])

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
    if (esMobile && vistaMovil==='semanal') {
      const sw = startOfWeek(refDate,{weekStartsOn:1})
      const ew = endOfWeek(refDate,{weekStartsOn:1})
      return { inicio:format(sw,'yyyy-MM-dd'), fin:format(ew,'yyyy-MM-dd'), dias:eachDayOfInterval({start:sw,end:ew}) }
    }
    const sm=startOfMonth(refDate), em=endOfMonth(refDate)
    const sw=startOfWeek(sm,{weekStartsOn:1}), ew=endOfWeek(em,{weekStartsOn:1})
    return { inicio:format(sw,'yyyy-MM-dd'), fin:format(ew,'yyyy-MM-dd'), dias:eachDayOfInterval({start:sw,end:ew}) }
  }

  async function fetchClases() {
    setLoading(true)
    const { inicio, fin } = getRango()
    const { data } = await supabase.from('clases')
      .select('*, instructores(id,nombre,apellido), asistencias(id,alumno_id,asistio,recuperacion,estado_asistencia,alumnos(id,nombre,apellido))')
      .gte('fecha',inicio).lte('fecha',fin).order('hora')
    setClases(data||[])
    setLoading(false)
  }

  async function refrescarClase(id) {
    const { data } = await supabase.from('clases')
      .select('*, instructores(id,nombre,apellido), asistencias(id,alumno_id,asistio,recuperacion,estado_asistencia,alumnos(id,nombre,apellido))')
      .eq('id',id).single()
    if (data) { setClases(prev=>prev.map(c=>c.id===id?data:c)); setModalClase(data) }
  }

  function colInst(instId) {
    const idx = instructores.findIndex(i=>i.id===instId)
    return COL_INST[idx%COL_INST.length]||COL_INST[0]
  }

  function clasesDia(dia) {
    return clases.filter(c=>c.fecha===format(dia,'yyyy-MM-dd')).sort((a,b)=>a.hora.localeCompare(b.hora))
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

  // Verificar capacidad antes de agregar
  function capacidadDisponible(clase) {
    const ocupados = (clase.asistencias||[]).length
    return clase.capacidad - ocupados
  }

  // Drag & drop
  function onDragStart(e, id) { setDragging({id}); e.dataTransfer.effectAllowed='move' }
  function onDragOver(e, fecha) { e.preventDefault(); setDragOver(fecha) }
  async function onDrop(e, fecha) {
    e.preventDefault(); setDragOver(null)
    if (!dragging) return
    const c = clases.find(x=>x.id===dragging.id)
    if (!c||c.fecha===fecha) { setDragging(null); return }
    await supabase.from('clases').update({fecha}).eq('id',dragging.id)
    setDragging(null); fetchClases()
  }

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

  // Agregar múltiples alumnos a la vez
  async function agregarAlumnosSeleccionados(esRec) {
    const clase = modalAgregar.clase
    const disponible = capacidadDisponible(clase)

    if (seleccionados.length > disponible) {
      alert(`Solo hay ${disponible} lugar${disponible!==1?'es':''} disponible${disponible!==1?'s':''}. Seleccionaste ${seleccionados.length} alumnos.`)
      return
    }

    setSaving(true)
    for (const alumnoId of seleccionados) {
      await supabase.from('asistencias').upsert({
        clase_id:clase.id, alumno_id:alumnoId,
        asistio:false, recuperacion:esRec, estado_asistencia:'pendiente'
      },{ onConflict:'clase_id,alumno_id' })
    }
    setSaving(false)
    setSeleccionados([])
    setModalAgregar(null)
    refrescarClase(clase.id)
  }

  function toggleSeleccion(alumnoId) {
    setSeleccionados(prev =>
      prev.includes(alumnoId) ? prev.filter(id=>id!==alumnoId) : [...prev, alumnoId]
    )
  }

  async function quitarAlumno(asistId) {
    await supabase.from('asistencias').delete().eq('id',asistId)
    refrescarClase(modalClase.id)
  }

  async function moverAlumno(destId) {
    // Verificar capacidad del destino
    const destClase = clases.find(c=>c.id===destId)
    if (destClase && capacidadDisponible(destClase) <= 0) {
      alert(`La clase "${destClase.nombre}" está completa (${destClase.capacidad}/${destClase.capacidad} alumnos).`)
      return
    }
    await supabase.from('asistencias').delete().eq('id',modalMover.asistId)
    await supabase.from('asistencias').upsert({ clase_id:destId, alumno_id:modalMover.alumnoId, asistio:false, recuperacion:false, estado_asistencia:'pendiente' },{ onConflict:'clase_id,alumno_id' })
    setModalMover(null); refrescarClase(modalClase.id); fetchClases()
  }

  const setF = k => e => setForm(f=>({...f,[k]:e.target.value}))
  const { dias } = getRango()

  function anterior() {
    if (esMobile && vistaMovil==='semanal') setRefDate(d=>subWeeks(d,1))
    else setRefDate(d=>subMonths(d,1))
  }
  function siguiente() {
    if (esMobile && vistaMovil==='semanal') setRefDate(d=>addWeeks(d,1))
    else setRefDate(d=>addMonths(d,1))
  }

  function labelPeriodo() {
    if (esMobile && vistaMovil==='semanal') {
      const sw=startOfWeek(refDate,{weekStartsOn:1}), ew=endOfWeek(refDate,{weekStartsOn:1})
      return `${format(sw,'d MMM',{locale:es})} — ${format(ew,'d MMM',{locale:es})}`
    }
    return format(refDate,'MMMM yyyy',{locale:es}).replace(/^\w/,c=>c.toUpperCase())
  }

  function ChipClase({ c, compact=false }) {
    const col=colInst(c.instructor_id), res=resumen(c)
    const tieneRec=(c.asistencias||[]).some(a=>a.recuperacion)
    const hayAusSA=res.sinAviso>0
    const lleno = c.capacidad > 0 && (c.asistencias||[]).length >= c.capacidad
    return (
      <div draggable onDragStart={e=>onDragStart(e,c.id)} onDragEnd={()=>setDragging(null)}
        onClick={() => { setModalClase(c); setEditando(false) }}
        style={{ background:col.bg, color:col.text,
          border:`1px solid ${hayAusSA?'#F09595':tieneRec?'#D4A020':lleno?'#B03030':col.border}`,
          borderRadius:5, padding:compact?'5px 8px':'3px 6px', marginBottom:3,
          cursor:'grab', userSelect:'none', opacity:dragging?.id===c.id?0.4:1 }}>
        <div style={{fontSize:compact?11:9,fontWeight:500,opacity:0.75}}>
          {c.hora.slice(0,5)}{compact&&<span style={{marginLeft:4}}>{c.instructores?.nombre?.split(' ')[0]||'—'}</span>}
        </div>
        <div style={{fontSize:compact?12:10,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
          {c.nombre}
          {tieneRec&&<span style={{fontSize:8,padding:'1px 3px',background:'rgba(0,0,0,0.1)',borderRadius:3,marginLeft:3}}>REC</span>}
          {lleno&&<span style={{fontSize:8,padding:'1px 3px',background:'rgba(180,0,0,0.12)',borderRadius:3,marginLeft:3,color:'#B03030'}}>LLENO</span>}
        </div>
        {res.total>0&&(
          <div style={{display:'flex',gap:2,marginTop:2,alignItems:'center'}}>
            {res.presentes>0  &&<div style={{height:3,borderRadius:2,background:ESTADOS.presente.barColor,flex:res.presentes}}/>}
            {res.conAviso>0   &&<div style={{height:3,borderRadius:2,background:ESTADOS.ausente_con_aviso.barColor,flex:res.conAviso}}/>}
            {res.sinAviso>0   &&<div style={{height:3,borderRadius:2,background:ESTADOS.ausente_sin_aviso.barColor,flex:res.sinAviso}}/>}
            {res.pendientes>0 &&<div style={{height:3,borderRadius:2,background:ESTADOS.pendiente.barColor,flex:res.pendientes}}/>}
            <span style={{fontSize:8,color:col.text,opacity:0.6,fontFamily:'var(--font-num)'}}>{res.presentes}/{res.total}</span>
          </div>
        )}
      </div>
    )
  }

  function VistaSemanal() {
    return (
      <div>
        {dias.map(dia => {
          const clasesD=clasesDia(dia), esHoy=isToday(dia), fechaStr=format(dia,'yyyy-MM-dd')
          return (
            <div key={fechaStr} onDragOver={e=>onDragOver(e,fechaStr)} onDragLeave={()=>setDragOver(null)} onDrop={e=>onDrop(e,fechaStr)}
              style={{ marginBottom:8, borderRadius:10, overflow:'hidden',
                border:`1px solid ${dragOver===fechaStr?'var(--mg)':esHoy?'rgba(192,57,107,0.3)':'var(--border)'}`,
                background:dragOver===fechaStr?'rgba(192,57,107,0.04)':esHoy?'rgba(192,57,107,0.02)':'var(--white)',
                outline:dragOver===fechaStr?'2px dashed var(--mg)':'none', outlineOffset:-2 }}>
              <div style={{padding:'8px 12px',borderBottom:clasesD.length>0?'1px solid var(--border)':'none',display:'flex',alignItems:'center',justifyContent:'space-between',background:esHoy?'rgba(192,57,107,0.06)':'var(--sl-l)'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{width:28,height:28,borderRadius:'50%',background:esHoy?'var(--mg)':'transparent',color:esHoy?'#fff':'var(--dark)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--font-num)',fontSize:13,fontWeight:700}}>{dia.getDate()}</div>
                  <span style={{fontSize:13,fontWeight:esHoy?500:400,color:esHoy?'var(--mg)':'var(--dark)',textTransform:'capitalize'}}>{format(dia,'EEEE',{locale:es})}</span>
                </div>
                {esAdmin && <button onClick={() => { setForm({...emptyForm,fecha:fechaStr}); setModalNueva(fechaStr) }} style={{fontSize:11,padding:'3px 9px',borderRadius:6,background:'var(--white)',border:'1px solid var(--border)',cursor:'pointer',color:'var(--sl-m)'}}>+ Clase</button>}
              </div>
              {clasesD.length===0
                ? <div style={{padding:'10px 12px',fontSize:11,color:'var(--sl-m)'}}>Sin clases</div>
                : <div style={{padding:'8px 12px',display:'flex',flexDirection:'column',gap:4}}>{clasesD.map(c=><ChipClase key={c.id} c={c} compact/>)}</div>
              }
            </div>
          )
        })}
      </div>
    )
  }

  function VistaMensual() {
    return (
      <>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))',gap:1,background:'var(--border)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
          {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d=>(
            <div key={d} style={{background:'var(--sl-l)',padding:'6px 4px',fontSize:9,fontWeight:500,color:'var(--sl-m)',textTransform:'uppercase',letterSpacing:'0.05em',textAlign:'center'}}>{d}</div>
          ))}
          {dias.map(dia => {
            const esMes=isSameMonth(dia,refDate), esHoy=isToday(dia)
            const fStr=format(dia,'yyyy-MM-dd'), cDia=clasesDia(dia), isDT=dragOver===fStr
            return (
              <div key={fStr} className={esHoy?'cal-hoy-celda':''}
                onDragOver={e=>onDragOver(e,fStr)} onDragLeave={()=>setDragOver(null)} onDrop={e=>onDrop(e,fStr)}
                style={{background:isDT?'rgba(192,57,107,0.06)':esHoy?undefined:esMes?'var(--white)':'var(--sl-l)',padding:6,minHeight:esMes?100:80,opacity:esMes?1:0.4,outline:isDT?'2px dashed var(--mg)':'none',outlineOffset:-2,transition:'background 0.12s'}}>
                <div className={`cal-num${esHoy?' cal-num-hoy':''}`}>{dia.getDate()}</div>
                {cDia.map(c=><ChipClase key={c.id} c={c}/>)}
                {esMes && esAdmin && (
                  <button onClick={() => { setForm({...emptyForm,fecha:fStr}); setModalNueva(fStr) }}
                    style={{width:'100%',marginTop:2,background:'none',border:'0.5px dashed var(--border)',borderRadius:4,color:'var(--sl-m)',fontSize:10,padding:'1px 0',cursor:'pointer'}}>+</button>
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
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,flexWrap:'wrap',gap:10}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <button className="btn-sec" style={{padding:'6px 10px'}} onClick={anterior}>←</button>
          <span style={{fontSize:14,fontWeight:500,minWidth:140,textAlign:'center'}}>{labelPeriodo()}</span>
          <button className="btn-sec" style={{padding:'6px 10px'}} onClick={siguiente}>→</button>
          <button className="btn-sec" style={{fontSize:11}} onClick={() => setRefDate(new Date())}>Hoy</button>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          {esMobile&&(
            <div style={{display:'flex',background:'var(--sl-l)',borderRadius:8,padding:2,gap:2}}>
              {['semanal','mensual'].map(v=>(
                <button key={v} onClick={() => setVistaMovil(v)}
                  style={{padding:'4px 11px',borderRadius:6,border:'none',fontSize:11,cursor:'pointer',background:vistaMovil===v?'var(--white)':'transparent',color:vistaMovil===v?'var(--dark)':'var(--sl-m)',fontWeight:vistaMovil===v?500:400,transition:'all 0.15s'}}>
                  {v.charAt(0).toUpperCase()+v.slice(1)}
                </button>
              ))}
            </div>
          )}
          {/* Botón leyenda */}
          <button className="btn-sec" style={{fontSize:11}} onClick={() => setMostrarLeyenda(l=>!l)}>
            {mostrarLeyenda?'Ocultar guía':'Ver guía de colores'}
          </button>
        </div>
      </div>

      {/* Leyenda de colores */}
      {mostrarLeyenda && (
        <div style={{marginBottom:12,padding:'12px 14px',background:'var(--sl-l)',borderRadius:10,border:'1px solid var(--border)'}}>
          <div style={{fontSize:11,fontWeight:500,color:'var(--sl-m)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:10}}>Guía de colores y estados</div>
          <div style={{display:'flex',gap:16,flexWrap:'wrap',marginBottom:10}}>
            {Object.entries(ESTADOS).map(([key,val])=>(
              <div key={key} style={{display:'flex',alignItems:'center',gap:7}}>
                <div style={{width:24,height:24,borderRadius:6,background:val.bg,border:`1px solid ${val.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:val.text,fontWeight:700}}>{val.icon}</div>
                <span style={{fontSize:11,color:'var(--dark)'}}>{val.label}</span>
              </div>
            ))}
          </div>
          <div style={{fontSize:11,color:'var(--sl-m)',marginBottom:6,fontWeight:500}}>Colores por instructor (asignados automáticamente en orden):</div>
          <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
            {instructores.map((inst,idx)=>{
              const col=COL_INST[idx%COL_INST.length]
              return (
                <div key={inst.id} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px',background:col.bg,borderRadius:6,border:`1px solid ${col.border}`}}>
                  <span style={{fontSize:11,fontWeight:500,color:col.text}}>{inst.nombre} {inst.apellido}</span>
                </div>
              )
            })}
          </div>
          <div style={{marginTop:8,fontSize:11,color:'var(--sl-m)'}}>
            Las clases <strong style={{color:'#B03030'}}>LLENAS</strong> muestran borde rojo. Las clases con recuperaciones muestran etiqueta <strong>REC</strong>.
          </div>
        </div>
      )}

      {loading ? <div className="loading">Cargando…</div>
        : (esMobile && vistaMovil==='semanal') ? <VistaSemanal/> : <VistaMensual/>
      }

      {/* ====== MODAL: Ver clase ====== */}
      {modalClase && !editando && !modalAgregar && !modalMover && (
        <Modal title={modalClase.nombre} onClose={() => setModalClase(null)}
          footer={<>{esAdmin&&<button className="btn-danger" onClick={eliminarClase}>Eliminar</button>}<button className="btn-sec" onClick={() => setModalClase(null)}>Cerrar</button></>}>
          <div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:12}}>
            {modalClase.instructores&&(()=>{const col=colInst(modalClase.instructor_id);return <span style={{fontSize:11,padding:'3px 9px',borderRadius:99,background:col.bg,color:col.text}}>{modalClase.instructores.nombre} {modalClase.instructores.apellido}</span>})()}
            <span style={{fontSize:11,padding:'3px 9px',borderRadius:99,background:'var(--sl-l)',color:'var(--sl-m)'}}>{modalClase.tipo==='grupal'?'Grupal':'Individual'}</span>
            <span style={{fontSize:11,padding:'3px 9px',borderRadius:99,background:'var(--sl-l)',color:'var(--sl-m)'}}>{modalClase.sala}</span>
            <span style={{fontSize:11,padding:'3px 9px',borderRadius:99,background:'var(--sl-l)',color:'var(--sl-m)',fontFamily:'var(--font-num)'}}>{modalClase.hora?.slice(0,5)} · {modalClase.fecha}</span>
            {/* Capacidad */}
            {(() => {
              const tot=(modalClase.asistencias||[]).length, cap=modalClase.capacidad
              const color=tot>=cap?'#B03030':'#2D7A5A', bg=tot>=cap?'#FDECEA':'#E4F4EE'
              return <span style={{fontSize:11,padding:'3px 9px',borderRadius:99,background:bg,color,fontWeight:500,fontFamily:'var(--font-num)'}}>{tot}/{cap} lugares</span>
            })()}
          </div>

          {/* Leyenda de estados inline */}
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10,padding:'8px 10px',background:'var(--sl-l)',borderRadius:8}}>
            {Object.entries(ESTADOS).map(([key,val])=>(
              <div key={key} style={{display:'flex',alignItems:'center',gap:4,fontSize:10,color:'var(--dark)'}}>
                <span style={{width:18,height:18,borderRadius:4,background:val.bg,border:`1px solid ${val.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:val.text,fontWeight:700}}>{val.icon}</span>
                {val.label}
              </div>
            ))}
          </div>

          {/* Resumen */}
          {(()=>{const r=resumen(modalClase);if(r.total===0)return null;return(
            <div style={{display:'flex',gap:7,marginBottom:12,flexWrap:'wrap'}}>
              <span style={{fontSize:11,padding:'3px 9px',borderRadius:8,background:'#E4F4EE',color:'#2D7A5A'}}>✓ {r.presentes}</span>
              {r.conAviso>0&&<span style={{fontSize:11,padding:'3px 9px',borderRadius:8,background:'#FEF3E2',color:'#7A5010'}}>⚠ {r.conAviso}</span>}
              {r.sinAviso>0&&<span style={{fontSize:11,padding:'3px 9px',borderRadius:8,background:'#FDECEA',color:'#B03030'}}>✗ {r.sinAviso}</span>}
              {r.pendientes>0&&<span style={{fontSize:11,padding:'3px 9px',borderRadius:8,background:'var(--sl-l)',color:'var(--sl-m)'}}>○ {r.pendientes}</span>}
              {r.recs>0&&<span style={{fontSize:11,padding:'3px 9px',borderRadius:8,background:'#FEF3E2',color:'#7A5010'}}>REC {r.recs}</span>}
            </div>
          )})()}

          <div style={{fontSize:11,fontWeight:500,color:'var(--sl-m)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8}}>Alumnos ({(modalClase.asistencias||[]).length}/{modalClase.capacidad})</div>

          {(modalClase.asistencias||[]).length===0&&<div className="empty" style={{padding:'14px 0'}}>Sin alumnos asignados</div>}

          {(modalClase.asistencias||[]).map(a=>{
            const estado=a.estado_asistencia||'pendiente'
            return(
              <div key={a.id} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 0',borderBottom:'1px solid var(--border)',flexWrap:'wrap'}}>
                <div style={{cursor:'pointer'}} onClick={() => window.dispatchEvent(new CustomEvent('open-ficha-alumno',{detail:a.alumno_id}))}>
                  <Avatar nombre={a.alumnos?.nombre||'?'} apellido={a.alumnos?.apellido||''} size={24} fontSize={8}/>
                </div>
                <div style={{flex:1,minWidth:80,cursor:'pointer'}} onClick={() => window.dispatchEvent(new CustomEvent('open-ficha-alumno',{detail:a.alumno_id}))}>
                  <div style={{fontSize:13,fontWeight:500,color:'var(--mg)'}}>{a.alumnos?.nombre} {a.alumnos?.apellido}</div>
                  {a.recuperacion&&<span style={{fontSize:9,padding:'1px 5px',background:'#FEF3E2',color:'#7A5010',borderRadius:3}}>REC</span>}
                </div>
                <div style={{display:'flex',gap:3,flexShrink:0}}>
                  {Object.entries(ESTADOS).map(([key,val])=>(
                    <button key={key} onClick={() => cambiarEstado(a.id,key)} title={val.label}
                      style={{padding:'4px 7px',borderRadius:6,fontSize:12,cursor:'pointer',fontWeight:700,background:estado===key?val.bg:'var(--sl-l)',color:estado===key?val.text:'var(--sl-m)',border:`1px solid ${estado===key?val.border:'transparent'}`,transition:'all 0.12s'}}>
                      {val.icon}
                    </button>
                  ))}
                  <button className="btn-sec" style={{fontSize:10,padding:'3px 6px'}} onClick={() => setModalMover({clase:modalClase,asistId:a.id,alumnoId:a.alumno_id})}>→</button>
                  <button className="btn-danger" style={{fontSize:10,padding:'3px 6px'}} onClick={() => quitarAlumno(a.id)}>✕</button>
                </div>
              </div>
            )
          })}

          {resumen(modalClase).sinAviso>0&&<div style={{marginTop:10,padding:'9px 12px',background:'#FDECEA',borderRadius:8,fontSize:12,color:'#B03030'}}>⚠ {resumen(modalClase).sinAviso} ausente{resumen(modalClase).sinAviso>1?'s':''} sin aviso.</div>}

          <div style={{display:'flex',gap:7,marginTop:12,flexWrap:'wrap'}}>
            <button className="btn-sec" style={{fontSize:11}} onClick={() => { setSeleccionados([]); setModalAgregar({clase:modalClase,esRec:false}) }}>+ Agregar alumnos</button>
            <button style={{fontSize:11,padding:'6px 12px',borderRadius:8,background:'#FEF3E2',color:'#7A5010',border:'1px solid #F0C060',cursor:'pointer'}} onClick={() => { setSeleccionados([]); setModalAgregar({clase:modalClase,esRec:true}) }}>+ Recuperación</button>
            {esAdmin&&<button className="btn-sec" style={{fontSize:11}} onClick={() => { setForm({nombre:modalClase.nombre,tipo:modalClase.tipo,instructor_id:modalClase.instructor_id||'',fecha:modalClase.fecha,hora:modalClase.hora,sala:modalClase.sala,capacidad:modalClase.capacidad}); setEditando(true) }}>Editar</button>}
          </div>
        </Modal>
      )}

      {/* ====== MODAL: Editar ====== */}
      {modalClase&&editando&&(
        <Modal title="Editar clase" onClose={() => setEditando(false)}
          footer={<><button className="btn-sec" onClick={() => setEditando(false)}>Cancelar</button><button className="btn-pri" onClick={guardarEdicion} disabled={saving}>{saving?'…':'Guardar'}</button></>}>
          <div className="form-row"><label className="form-lbl">Nombre</label><input className="form-inp" value={form.nombre} onChange={setF('nombre')}/></div>
          <div className="form-row2">
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Tipo</label><select className="form-inp" value={form.tipo} onChange={setF('tipo')}><option value="grupal">Grupal</option><option value="individual">Individual</option></select></div>
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Instructor</label><select className="form-inp" value={form.instructor_id} onChange={setF('instructor_id')}><option value="">Sin asignar</option>{instructores.map(i=><option key={i.id} value={i.id}>{i.nombre} {i.apellido}</option>)}</select></div>
          </div>
          <div className="form-row2" style={{marginTop:12}}>
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Hora</label><input className="form-inp" type="time" value={form.hora} onChange={setF('hora')}/></div>
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Sala</label><select className="form-inp" value={form.sala} onChange={setF('sala')}><option value="Sala A">Sala A</option><option value="Sala B">Sala B</option><option value="Sala C">Sala C</option></select></div>
          </div>
          <div className="form-row" style={{marginTop:12}}><label className="form-lbl">Capacidad máxima</label><input className="form-inp" type="number" min={1} max={20} value={form.capacidad} onChange={setF('capacidad')}/></div>
        </Modal>
      )}

      {/* ====== MODAL: Nueva clase ====== */}
      {modalNueva&&(
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
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Sala</label><select className="form-inp" value={form.sala} onChange={setF('sala')}><option value="Sala A">Sala A</option><option value="Sala B">Sala B</option><option value="Sala C">Sala C</option></select></div>
          </div>
          <div className="form-row" style={{marginTop:12}}><label className="form-lbl">Capacidad máxima</label><input className="form-inp" type="number" min={1} max={20} value={form.capacidad} onChange={setF('capacidad')}/></div>
        </Modal>
      )}

      {/* ====== MODAL: Agregar alumnos (multi-selección) ====== */}
      {modalAgregar&&(
        <Modal title={modalAgregar.esRec?'Agregar recuperación':'Agregar alumnos'}
          onClose={() => { setModalAgregar(null); setSeleccionados([]) }}
          footer={<>
            <button className="btn-sec" onClick={() => { setModalAgregar(null); setSeleccionados([]) }}>Cancelar</button>
            <button className="btn-pri" onClick={() => agregarAlumnosSeleccionados(modalAgregar.esRec)} disabled={seleccionados.length===0||saving}>
              {saving?'Agregando…':`Agregar ${seleccionados.length>0?seleccionados.length:''} alumno${seleccionados.length!==1?'s':''}`}
            </button>
          </>}>
          {(() => {
            const cap=modalAgregar.clase.capacidad, ocupados=(modalAgregar.clase.asistencias||[]).length, libre=cap-ocupados
            return (
              <div style={{fontSize:12,padding:'8px 12px',background:libre<=0?'#FDECEA':'#E4F4EE',borderRadius:8,marginBottom:12,color:libre<=0?'#B03030':'#2D7A5A'}}>
                {libre<=0
                  ? `⚠ Esta clase está completa (${ocupados}/${cap}). No se pueden agregar más alumnos.`
                  : `Lugares disponibles: ${libre} de ${cap}. Podés seleccionar hasta ${libre} alumno${libre!==1?'s':''}.`
                }
              </div>
            )
          })()}
          {modalAgregar.esRec&&<div style={{fontSize:12,padding:'8px 12px',background:'#FEF3E2',color:'#7A5010',borderRadius:8,marginBottom:12}}>Clase de recuperación — el lugar queda reservado.</div>}
          {(() => {
            const ya=(modalAgregar.clase.asistencias||[]).map(a=>a.alumno_id)
            const disp=alumnos.filter(a=>!ya.includes(a.id))
            if (disp.length===0) return <div className="empty">No hay alumnos disponibles</div>
            const libre=modalAgregar.clase.capacidad-(modalAgregar.clase.asistencias||[]).length
            return disp.map(a=>{
              const sel=seleccionados.includes(a.id)
              const disabled=!sel&&seleccionados.length>=libre
              return(
                <div key={a.id} onClick={() => !disabled&&toggleSeleccion(a.id)}
                  style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid var(--border)',cursor:disabled?'not-allowed':'pointer',opacity:disabled?0.4:1,background:sel?'#E4F4EE':'transparent',borderRadius:sel?6:0,transition:'all 0.12s'}}>
                  <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${sel?'#2D7A5A':'var(--border)'}`,background:sel?'#48A999':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    {sel&&<span style={{color:'#fff',fontSize:12,fontWeight:700}}>✓</span>}
                  </div>
                  <Avatar nombre={a.nombre} apellido={a.apellido} size={22} fontSize={8}/>
                  <span style={{fontSize:13}}>{a.nombre} {a.apellido}</span>
                </div>
              )
            })
          })()}
        </Modal>
      )}

      {/* ====== MODAL: Mover alumno ====== */}
      {modalMover&&(
        <Modal title="Mover a otra clase" onClose={() => setModalMover(null)}
          footer={<button className="btn-sec" onClick={() => setModalMover(null)}>Cancelar</button>}>
          <div style={{fontSize:12,color:'var(--sl-m)',marginBottom:12}}>Seleccioná la clase de destino:</div>
          {clases.filter(c=>c.id!==modalMover.clase.id).map(c=>{
            const col=colInst(c.instructor_id)
            const libre=c.capacidad-(c.asistencias||[]).length
            const llena=libre<=0
            return(
              <div key={c.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)',opacity:llena?0.5:1}}>
                <div>
                  <div style={{fontSize:13,fontWeight:500}}>{c.nombre}</div>
                  <div style={{fontSize:11,color:'var(--sl-m)'}}>{c.fecha} · {c.hora?.slice(0,5)} · <span style={{color:col.border}}>{c.instructores?.nombre} {c.instructores?.apellido}</span></div>
                  <div style={{fontSize:10,color:llena?'#B03030':'#2D7A5A',fontFamily:'var(--font-num)'}}>
                    {llena?`Clase llena (${c.capacidad}/${c.capacidad})`:`${libre} lugar${libre!==1?'es':''} libre${libre!==1?'s':''}`}
                  </div>
                </div>
                <button className="btn-pri" style={{fontSize:11,padding:'4px 12px'}} onClick={() => moverAlumno(c.id)} disabled={llena}>
                  {llena?'Llena':'Mover'}
                </button>
              </div>
            )
          })}
        </Modal>
      )}
    </div>
  )
}
