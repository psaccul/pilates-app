import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import Avatar from '../components/Avatar'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, endOfWeek, isSameMonth, isToday, addMonths, subMonths
} from 'date-fns'
import { es } from 'date-fns/locale'

const COLORES_INSTRUCTOR = [
  { bg:'#FAE0EA', text:'#8B1A42', border:'#C0396B' },
  { bg:'#D8F3EA', text:'#085041', border:'#1D9E75' },
  { bg:'#D6E8F9', text:'#042C53', border:'#185FA5' },
  { bg:'#F0EAF8', text:'#6A3A8A', border:'#9B6BBB' },
  { bg:'#FEF3E2', text:'#7A5010', border:'#D4A020' },
]

const ESTADOS = {
  pendiente:         { label:'Sin marcar',      bg:'var(--sl-l)', text:'var(--sl-m)', border:'transparent', icon:'—' },
  presente:          { label:'Presente',         bg:'#E4F4EE',    text:'#2D7A5A',    border:'#6DC49A',      icon:'✓' },
  ausente_con_aviso: { label:'Ausente c/aviso', bg:'#FEF3E2',    text:'#7A5010',    border:'#F0C060',      icon:'⚠' },
  ausente_sin_aviso: { label:'Ausente s/aviso', bg:'#FDECEA',    text:'#B03030',    border:'#F09595',      icon:'✗' },
}

export default function Calendario() {
  const [mesActual, setMesActual]       = useState(new Date())
  const [clases, setClases]             = useState([])
  const [instructores, setInstructores] = useState([])
  const [alumnos, setAlumnos]           = useState([])
  const [loading, setLoading]           = useState(true)

  const [modalClase, setModalClase]     = useState(null)
  const [modalNueva, setModalNueva]     = useState(null)
  const [modalMover, setModalMover]     = useState(null)
  const [modalAgregar, setModalAgregar] = useState(null)
  const [editando, setEditando]         = useState(false)
  const [saving, setSaving]             = useState(false)

  // Drag & drop
  const [dragging, setDragging]         = useState(null) // { claseId }
  const [dragOver, setDragOver]         = useState(null) // fecha string

  const emptyForm = { nombre:'', tipo:'grupal', instructor_id:'', fecha:'', hora:'08:00', sala:'Sala A', capacidad:4 }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => { fetchBase() }, [])
  useEffect(() => { fetchClases() }, [mesActual])

  async function fetchBase() {
    const [{ data: ins }, { data: al }] = await Promise.all([
      supabase.from('instructores').select('id,nombre,apellido').eq('activo',true).order('nombre'),
      supabase.from('alumnos').select('id,nombre,apellido').eq('activo',true).order('apellido'),
    ])
    setInstructores(ins || [])
    setAlumnos(al || [])
  }

  async function fetchClases() {
    setLoading(true)
    const inicio = format(startOfWeek(startOfMonth(mesActual),{weekStartsOn:1}),'yyyy-MM-dd')
    const fin    = format(endOfWeek(endOfMonth(mesActual),    {weekStartsOn:1}),'yyyy-MM-dd')
    const { data } = await supabase
      .from('clases')
      .select('*, instructores(id,nombre,apellido), asistencias(id,alumno_id,asistio,recuperacion,estado_asistencia,alumnos(id,nombre,apellido))')
      .gte('fecha', inicio).lte('fecha', fin).order('hora')
    setClases(data || [])
    setLoading(false)
  }

  async function refrescarClase(claseId) {
    const { data } = await supabase
      .from('clases')
      .select('*, instructores(id,nombre,apellido), asistencias(id,alumno_id,asistio,recuperacion,estado_asistencia,alumnos(id,nombre,apellido))')
      .eq('id', claseId).single()
    if (data) {
      setClases(prev => prev.map(c => c.id === claseId ? data : c))
      setModalClase(data)
    }
  }

  function colorInstructor(instructorId) {
    const idx = instructores.findIndex(i => i.id === instructorId)
    return COLORES_INSTRUCTOR[idx % COLORES_INSTRUCTOR.length] || COLORES_INSTRUCTOR[0]
  }

  const diasCalendario = eachDayOfInterval({
    start: startOfWeek(startOfMonth(mesActual),{weekStartsOn:1}),
    end:   endOfWeek(endOfMonth(mesActual),    {weekStartsOn:1}),
  })

  function clasesDia(dia) {
    const key = format(dia,'yyyy-MM-dd')
    return clases.filter(c => c.fecha === key).sort((a,b) => a.hora.localeCompare(b.hora))
  }

  function resumenAsistencia(clase) {
    const asis = clase.asistencias || []
    return {
      total:      asis.length,
      presentes:  asis.filter(a => a.estado_asistencia === 'presente').length,
      conAviso:   asis.filter(a => a.estado_asistencia === 'ausente_con_aviso').length,
      sinAviso:   asis.filter(a => a.estado_asistencia === 'ausente_sin_aviso').length,
      pendientes: asis.filter(a => !a.estado_asistencia || a.estado_asistencia === 'pendiente').length,
    }
  }

  // -------- DRAG & DROP --------
  function onDragStart(e, claseId) {
    setDragging({ claseId })
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragOver(e, fecha) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(fecha)
  }

  function onDragLeave() {
    setDragOver(null)
  }

  async function onDrop(e, fechaDestino) {
    e.preventDefault()
    setDragOver(null)
    if (!dragging) return
    const clase = clases.find(c => c.id === dragging.claseId)
    if (!clase || clase.fecha === fechaDestino) { setDragging(null); return }
    // Mover la clase a la nueva fecha
    await supabase.from('clases').update({ fecha: fechaDestino }).eq('id', dragging.claseId)
    setDragging(null)
    fetchClases()
  }

  // -------- ASISTENCIA --------
  async function cambiarEstado(asistenciaId, nuevoEstado) {
    await supabase.from('asistencias').update({
      estado_asistencia: nuevoEstado,
      asistio: nuevoEstado === 'presente',
    }).eq('id', asistenciaId)
    await refrescarClase(modalClase.id)
  }

  // -------- CRUD CLASES --------
  async function guardarNuevaClase() {
    if (!form.nombre || !form.fecha || !form.hora) return
    setSaving(true)
    await supabase.from('clases').insert({
      nombre: form.nombre, tipo: form.tipo,
      instructor_id: form.instructor_id || null,
      fecha: form.fecha, hora: form.hora,
      sala: form.sala, capacidad: Number(form.capacidad),
    })
    setSaving(false)
    setModalNueva(null)
    setForm(emptyForm)
    fetchClases()
  }

  async function guardarEdicion() {
    if (!form.nombre || !form.hora) return
    setSaving(true)
    await supabase.from('clases').update({
      nombre: form.nombre, tipo: form.tipo,
      instructor_id: form.instructor_id || null,
      hora: form.hora, sala: form.sala, capacidad: Number(form.capacidad),
    }).eq('id', modalClase.id)
    setSaving(false)
    setEditando(false)
    refrescarClase(modalClase.id)
    fetchClases()
  }

  async function eliminarClase() {
    if (!confirm('¿Eliminar esta clase?')) return
    await supabase.from('clases').delete().eq('id', modalClase.id)
    setModalClase(null)
    fetchClases()
  }

  async function agregarAlumnoAClase(alumnoId, esRec) {
    await supabase.from('asistencias').upsert({
      clase_id: modalAgregar.clase.id, alumno_id: alumnoId,
      asistio: false, recuperacion: esRec, estado_asistencia: 'pendiente',
    }, { onConflict: 'clase_id,alumno_id' })
    setModalAgregar(null)
    refrescarClase(modalAgregar.clase.id)
  }

  async function quitarAlumno(asistenciaId) {
    await supabase.from('asistencias').delete().eq('id', asistenciaId)
    refrescarClase(modalClase.id)
  }

  async function moverAlumno(claseDestId) {
    const { asistenciaId, alumnoId } = modalMover
    await supabase.from('asistencias').delete().eq('id', asistenciaId)
    await supabase.from('asistencias').upsert({
      clase_id: claseDestId, alumno_id: alumnoId,
      asistio: false, recuperacion: false, estado_asistencia: 'pendiente',
    }, { onConflict: 'clase_id,alumno_id' })
    setModalMover(null)
    refrescarClase(modalClase.id)
    fetchClases()
  }

  const setF = k => e => setForm(f => ({...f, [k]: e.target.value}))

  return (
    <div>
      {/* Header */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10}}>
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <button className="btn-sec" onClick={() => setMesActual(m => subMonths(m,1))}>←</button>
          <span style={{fontSize:15, fontWeight:500, minWidth:150, textAlign:'center'}}>
            {format(mesActual,'MMMM yyyy',{locale:es}).replace(/^\w/,c=>c.toUpperCase())}
          </span>
          <button className="btn-sec" onClick={() => setMesActual(m => addMonths(m,1))}>→</button>
          <button className="btn-sec" onClick={() => setMesActual(new Date())}>Hoy</button>
        </div>
        <div style={{display:'flex', gap:10, flexWrap:'wrap', alignItems:'center'}}>
          {instructores.map((inst,idx) => {
            const col = COLORES_INSTRUCTOR[idx % COLORES_INSTRUCTOR.length]
            return (
              <div key={inst.id} style={{display:'flex', alignItems:'center', gap:5, fontSize:11, color:'var(--sl-m)'}}>
                <div style={{width:9, height:9, borderRadius:'50%', background:col.border}} />
                {inst.nombre} {inst.apellido}
              </div>
            )
          })}
        </div>
      </div>

      {/* Grid */}
      <div style={{
        display:'grid', gridTemplateColumns:'repeat(7,minmax(0,1fr))',
        gap:1, background:'var(--border)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden'
      }}>
        {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => (
          <div key={d} style={{background:'var(--sl-l)', padding:'7px 6px', fontSize:10, fontWeight:500, color:'var(--sl-m)', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:'center'}}>{d}</div>
        ))}

        {diasCalendario.map(dia => {
          const esMes   = isSameMonth(dia, mesActual)
          const esHoy   = isToday(dia)
          const fechaStr = format(dia,'yyyy-MM-dd')
          const clasesD  = clasesDia(dia)
          const isDragTarget = dragOver === fechaStr

          return (
            <div key={dia.toISOString()}
              className={esHoy ? 'cal-hoy-celda' : ''}
              onDragOver={e => onDragOver(e, fechaStr)}
              onDragLeave={onDragLeave}
              onDrop={e => onDrop(e, fechaStr)}
              style={{
                background: isDragTarget ? 'rgba(192,57,107,0.08)' : esHoy ? undefined : esMes ? 'var(--white)' : 'var(--sl-l)',
                padding: esHoy ? '8px 6px' : '6px',
                minHeight: esHoy ? 130 : 110,
                opacity: esMes ? 1 : 0.5,
                transition: 'background 0.15s',
                outline: isDragTarget ? '2px dashed var(--mg)' : 'none',
                outlineOffset: -2,
              }}>

              {/* Número del día */}
              <div className={esHoy ? 'cal-num-hoy' : 'cal-num'} style={{marginBottom: esHoy ? 8 : 5}}>
                {dia.getDate()}
              </div>

              {/* Chips */}
              {clasesD.map(c => {
                const col      = colorInstructor(c.instructor_id)
                const res      = resumenAsistencia(c)
                const tieneRec = (c.asistencias||[]).some(a => a.recuperacion)
                const hayAusSA = res.sinAviso > 0
                return (
                  <div key={c.id}
                    draggable
                    onDragStart={e => onDragStart(e, c.id)}
                    onDragEnd={() => setDragging(null)}
                    onClick={() => { setModalClase(c); setEditando(false) }}
                    style={{
                      background: col.bg, color: col.text,
                      border: `1px solid ${hayAusSA ? '#F09595' : tieneRec ? '#D4A020' : col.border}`,
                      borderRadius:5, padding:'3px 6px', marginBottom:3,
                      cursor:'grab', userSelect:'none',
                      opacity: dragging?.claseId === c.id ? 0.4 : 1,
                    }}>
                    <span style={{fontSize:9, fontWeight:500, opacity:0.75, display:'block'}}>
                      {c.hora.slice(0,5)} · {c.instructores?.nombre?.split(' ')[0]||'—'}
                    </span>
                    <span style={{fontSize:10, fontWeight:500, display:'block', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                      {c.nombre}
                      {tieneRec && <span style={{fontSize:8, padding:'1px 3px', background:'rgba(0,0,0,0.12)', borderRadius:3, marginLeft:3}}>REC</span>}
                    </span>
                    {res.total > 0 && (
                      <div style={{display:'flex', gap:2, marginTop:2, alignItems:'center'}}>
                        {res.presentes  > 0 && <div style={{height:3, borderRadius:2, background:'#48A999', flex:res.presentes}} />}
                        {res.conAviso   > 0 && <div style={{height:3, borderRadius:2, background:'#D4A020', flex:res.conAviso}} />}
                        {res.sinAviso   > 0 && <div style={{height:3, borderRadius:2, background:'#E24B4A', flex:res.sinAviso}} />}
                        {res.pendientes > 0 && <div style={{height:3, borderRadius:2, background:'var(--border)', flex:res.pendientes}} />}
                        <span style={{fontSize:8, color:col.text, opacity:0.6}}>{res.presentes}/{res.total}</span>
                      </div>
                    )}
                  </div>
                )
              })}

              {esMes && (
                <button onClick={() => { setForm({...emptyForm, fecha:fechaStr}); setModalNueva(fechaStr) }}
                  style={{width:'100%', marginTop:2, background:'none', border:'0.5px dashed var(--border)', borderRadius:4, color:'var(--sl-m)', fontSize:11, padding:'2px 0', cursor:'pointer'}}>
                  +
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div style={{fontSize:11, color:'var(--sl-m)', marginTop:8, textAlign:'center'}}>
        Arrastrá una clase para moverla a otro día
      </div>

      {/* ====== MODAL: Ver clase ====== */}
      {modalClase && !editando && !modalAgregar && !modalMover && (
        <Modal title={modalClase.nombre}
          onClose={() => setModalClase(null)}
          footer={<>
            <button className="btn-danger" onClick={eliminarClase}>Eliminar</button>
            <button className="btn-sec" onClick={() => setModalClase(null)}>Cerrar</button>
          </>}>

          <div style={{display:'flex', gap:8, flexWrap:'wrap', marginBottom:14}}>
            {modalClase.instructores && (() => {
              const col = colorInstructor(modalClase.instructor_id)
              return <span style={{fontSize:11, padding:'3px 9px', borderRadius:99, background:col.bg, color:col.text}}>{modalClase.instructores.nombre} {modalClase.instructores.apellido}</span>
            })()}
            <span style={{fontSize:11, padding:'3px 9px', borderRadius:99, background:'var(--sl-l)', color:'var(--sl-m)'}}>{modalClase.tipo==='grupal'?'Grupal':'Individual'}</span>
            <span style={{fontSize:11, padding:'3px 9px', borderRadius:99, background:'var(--sl-l)', color:'var(--sl-m)'}}>{modalClase.sala}</span>
            <span style={{fontSize:11, padding:'3px 9px', borderRadius:99, background:'var(--sl-l)', color:'var(--sl-m)'}}>{modalClase.hora?.slice(0,5)} · {modalClase.fecha}</span>
          </div>

          {/* Resumen */}
          {(() => {
            const res = resumenAsistencia(modalClase)
            if (res.total === 0) return null
            return (
              <div style={{display:'flex', gap:8, marginBottom:14, flexWrap:'wrap'}}>
                <span style={{fontSize:11, padding:'4px 10px', borderRadius:8, background:'#E4F4EE', color:'#2D7A5A'}}>✓ {res.presentes}</span>
                {res.conAviso  > 0 && <span style={{fontSize:11, padding:'4px 10px', borderRadius:8, background:'#FEF3E2', color:'#7A5010'}}>⚠ {res.conAviso}</span>}
                {res.sinAviso  > 0 && <span style={{fontSize:11, padding:'4px 10px', borderRadius:8, background:'#FDECEA', color:'#B03030'}}>✗ {res.sinAviso}</span>}
                {res.pendientes> 0 && <span style={{fontSize:11, padding:'4px 10px', borderRadius:8, background:'var(--sl-l)', color:'var(--sl-m)'}}>○ {res.pendientes}</span>}
              </div>
            )
          })()}

          <div style={{fontSize:11, fontWeight:500, color:'var(--sl-m)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8}}>
            Alumnos ({(modalClase.asistencias||[]).length})
          </div>

          {(modalClase.asistencias||[]).length === 0 && <div className="empty" style={{padding:'20px 0'}}>Sin alumnos asignados</div>}

          {(modalClase.asistencias||[]).map(a => {
            const estado = a.estado_asistencia || 'pendiente'
            return (
              <div key={a.id} style={{display:'flex', alignItems:'center', gap:8, padding:'8px 0', borderBottom:'1px solid var(--border)', flexWrap:'wrap'}}>
                <div style={{cursor:'pointer'}}
                  onClick={() => window.dispatchEvent(new CustomEvent('open-ficha-alumno', {detail: a.alumno_id}))}>
                  <Avatar nombre={a.alumnos?.nombre||'?'} apellido={a.alumnos?.apellido||''} size={26} fontSize={9} />
                </div>
                <div style={{flex:1, minWidth:80}}>
                  <div style={{fontSize:13, fontWeight:500, cursor:'pointer'}}
                    onClick={() => window.dispatchEvent(new CustomEvent('open-ficha-alumno', {detail: a.alumno_id}))}>
                    {a.alumnos?.nombre} {a.alumnos?.apellido}
                  </div>
                  {a.recuperacion && <span style={{fontSize:9, padding:'1px 5px', background:'#FEF3E2', color:'#7A5010', borderRadius:3}}>REC</span>}
                </div>
                <div style={{display:'flex', gap:3}}>
                  {Object.entries(ESTADOS).map(([key, val]) => (
                    <button key={key} onClick={() => cambiarEstado(a.id, key)} title={val.label}
                      style={{
                        padding:'4px 8px', borderRadius:6, fontSize:12, cursor:'pointer', fontWeight:600,
                        background: estado===key ? val.bg : 'var(--sl-l)',
                        color: estado===key ? val.text : 'var(--sl-m)',
                        border: `1px solid ${estado===key ? val.border : 'transparent'}`,
                        transition:'all 0.12s',
                      }}>
                      {val.icon}
                    </button>
                  ))}
                  <button className="btn-sec" style={{fontSize:10, padding:'3px 7px'}}
                    onClick={() => setModalMover({clase:modalClase, asistenciaId:a.id, alumnoId:a.alumno_id})}>→</button>
                  <button className="btn-danger" style={{fontSize:10, padding:'3px 6px'}}
                    onClick={() => quitarAlumno(a.id)}>✕</button>
                </div>
              </div>
            )
          })}

          {resumenAsistencia(modalClase).sinAviso > 0 && (
            <div style={{marginTop:12, padding:'10px 14px', background:'#FDECEA', borderRadius:8, fontSize:12, color:'#B03030'}}>
              ⚠ {resumenAsistencia(modalClase).sinAviso} ausente{resumenAsistencia(modalClase).sinAviso>1?'s':''} sin aviso — considerá enviar un WhatsApp.
            </div>
          )}

          <div style={{display:'flex', gap:8, marginTop:14, flexWrap:'wrap'}}>
            <button className="btn-sec" style={{fontSize:11}} onClick={() => setModalAgregar({clase:modalClase, esRec:false})}>+ Alumno</button>
            <button style={{fontSize:11, padding:'6px 12px', borderRadius:8, background:'#FEF3E2', color:'#7A5010', border:'1px solid #F0C060', cursor:'pointer'}}
              onClick={() => setModalAgregar({clase:modalClase, esRec:true})}>+ Recuperación</button>
            <button className="btn-sec" style={{fontSize:11}} onClick={() => {
              setForm({nombre:modalClase.nombre, tipo:modalClase.tipo, instructor_id:modalClase.instructor_id||'', fecha:modalClase.fecha, hora:modalClase.hora, sala:modalClase.sala, capacidad:modalClase.capacidad})
              setEditando(true)
            }}>Editar</button>
          </div>
        </Modal>
      )}

      {/* ====== MODAL: Editar ====== */}
      {modalClase && editando && (
        <Modal title="Editar clase" onClose={() => setEditando(false)}
          footer={<>
            <button className="btn-sec" onClick={() => setEditando(false)}>Cancelar</button>
            <button className="btn-pri" onClick={guardarEdicion} disabled={saving}>{saving?'Guardando…':'Guardar'}</button>
          </>}>
          <div className="form-row">
            <label className="form-lbl">Nombre</label>
            <input className="form-inp" value={form.nombre} onChange={setF('nombre')} />
          </div>
          <div className="form-row2">
            <div className="form-row" style={{marginBottom:0}}>
              <label className="form-lbl">Tipo</label>
              <select className="form-inp" value={form.tipo} onChange={setF('tipo')}>
                <option value="grupal">Grupal</option>
                <option value="individual">Individual</option>
              </select>
            </div>
            <div className="form-row" style={{marginBottom:0}}>
              <label className="form-lbl">Instructor</label>
              <select className="form-inp" value={form.instructor_id} onChange={setF('instructor_id')}>
                <option value="">Sin asignar</option>
                {instructores.map(i => <option key={i.id} value={i.id}>{i.nombre} {i.apellido}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row2" style={{marginTop:14}}>
            <div className="form-row" style={{marginBottom:0}}>
              <label className="form-lbl">Hora</label>
              <input className="form-inp" type="time" value={form.hora} onChange={setF('hora')} />
            </div>
            <div className="form-row" style={{marginBottom:0}}>
              <label className="form-lbl">Sala</label>
              <select className="form-inp" value={form.sala} onChange={setF('sala')}>
                <option value="Sala A">Sala A</option>
                <option value="Sala B">Sala B</option>
              </select>
            </div>
          </div>
        </Modal>
      )}

      {/* ====== MODAL: Nueva clase ====== */}
      {modalNueva && (
        <Modal title={`Nueva clase — ${format(new Date(modalNueva+'T00:00:00'),"d 'de' MMMM",{locale:es})}`}
          onClose={() => setModalNueva(null)}
          footer={<>
            <button className="btn-sec" onClick={() => setModalNueva(null)}>Cancelar</button>
            <button className="btn-pri" onClick={guardarNuevaClase} disabled={saving}>{saving?'Guardando…':'Guardar'}</button>
          </>}>
          <div className="form-row">
            <label className="form-lbl">Nombre</label>
            <input className="form-inp" value={form.nombre} onChange={setF('nombre')} placeholder="Ej: Reformer Intermedio" />
          </div>
          <div className="form-row2">
            <div className="form-row" style={{marginBottom:0}}>
              <label className="form-lbl">Tipo</label>
              <select className="form-inp" value={form.tipo} onChange={setF('tipo')}>
                <option value="grupal">Grupal</option>
                <option value="individual">Individual</option>
              </select>
            </div>
            <div className="form-row" style={{marginBottom:0}}>
              <label className="form-lbl">Instructor</label>
              <select className="form-inp" value={form.instructor_id} onChange={setF('instructor_id')}>
                <option value="">Sin asignar</option>
                {instructores.map(i => <option key={i.id} value={i.id}>{i.nombre} {i.apellido}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row2" style={{marginTop:14}}>
            <div className="form-row" style={{marginBottom:0}}>
              <label className="form-lbl">Hora</label>
              <input className="form-inp" type="time" value={form.hora} onChange={setF('hora')} />
            </div>
            <div className="form-row" style={{marginBottom:0}}>
              <label className="form-lbl">Sala</label>
              <select className="form-inp" value={form.sala} onChange={setF('sala')}>
                <option value="Sala A">Sala A</option>
                <option value="Sala B">Sala B</option>
              </select>
            </div>
          </div>
          <div className="form-row" style={{marginTop:14}}>
            <label className="form-lbl">Capacidad</label>
            <input className="form-inp" type="number" min={1} max={20} value={form.capacidad} onChange={setF('capacidad')} />
          </div>
        </Modal>
      )}

      {/* ====== MODAL: Agregar alumno ====== */}
      {modalAgregar && (
        <Modal title={modalAgregar.esRec ? 'Agregar recuperación' : 'Agregar alumno'}
          onClose={() => setModalAgregar(null)}
          footer={<button className="btn-sec" onClick={() => setModalAgregar(null)}>Cancelar</button>}>
          {modalAgregar.esRec && (
            <div style={{fontSize:12, padding:'8px 12px', background:'#FEF3E2', color:'#7A5010', borderRadius:8, marginBottom:14}}>
              Clase de recuperación — el lugar queda reservado aunque falte a su clase habitual.
            </div>
          )}
          {(() => {
            const yaAsignados = (modalAgregar.clase.asistencias||[]).map(a => a.alumno_id)
            const disponibles = alumnos.filter(a => !yaAsignados.includes(a.id))
            if (disponibles.length === 0) return <div className="empty">No hay alumnos disponibles</div>
            return disponibles.map(a => (
              <div key={a.id} style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)'}}>
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <Avatar nombre={a.nombre} apellido={a.apellido} size={24} fontSize={8} />
                  <span style={{fontSize:13}}>{a.nombre} {a.apellido}</span>
                </div>
                <button className="btn-pri" style={{fontSize:11, padding:'4px 12px'}}
                  onClick={() => agregarAlumnoAClase(a.id, modalAgregar.esRec)}>Agregar</button>
              </div>
            ))
          })()}
        </Modal>
      )}

      {/* ====== MODAL: Mover alumno ====== */}
      {modalMover && (
        <Modal title="Mover a otra clase" onClose={() => setModalMover(null)}
          footer={<button className="btn-sec" onClick={() => setModalMover(null)}>Cancelar</button>}>
          <div style={{fontSize:12, color:'var(--sl-m)', marginBottom:14}}>Seleccioná la clase de destino:</div>
          {clases.filter(c => c.id !== modalMover.clase.id).map(c => {
            const col = colorInstructor(c.instructor_id)
            return (
              <div key={c.id} style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)'}}>
                <div>
                  <div style={{fontSize:13, fontWeight:500}}>{c.nombre}</div>
                  <div style={{fontSize:11, color:'var(--sl-m)'}}>{c.fecha} · {c.hora?.slice(0,5)} · <span style={{color:col.border}}>{c.instructores?.nombre} {c.instructores?.apellido}</span></div>
                </div>
                <button className="btn-pri" style={{fontSize:11, padding:'4px 12px'}} onClick={() => moverAlumno(c.id)}>Mover</button>
              </div>
            )
          })}
        </Modal>
      )}
    </div>
  )
}
