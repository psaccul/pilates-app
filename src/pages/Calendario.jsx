import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import Avatar from '../components/Avatar'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, endOfWeek, isSameMonth, isToday, parseISO, addMonths, subMonths
} from 'date-fns'
import { es } from 'date-fns/locale'

const COLORES_INSTRUCTOR = [
  { bg:'#FAE0EA', text:'#8B1A42', border:'#C0396B' },
  { bg:'#D8F3EA', text:'#085041', border:'#1D9E75' },
  { bg:'#D6E8F9', text:'#042C53', border:'#185FA5' },
  { bg:'#F0EAF8', text:'#6A3A8A', border:'#9B6BBB' },
  { bg:'#FEF3E2', text:'#7A5010', border:'#D4A020' },
]

export default function Calendario() {
  const [mesActual, setMesActual]       = useState(new Date())
  const [clases, setClases]             = useState([])
  const [instructores, setInstructores] = useState([])
  const [alumnos, setAlumnos]           = useState([])
  const [loading, setLoading]           = useState(true)

  // modales
  const [modalClase, setModalClase]     = useState(null)   // clase seleccionada
  const [modalNueva, setModalNueva]     = useState(null)   // fecha para nueva clase
  const [modalMover, setModalMover]     = useState(null)   // { clase, alumnoId }
  const [modalAgregar, setModalAgregar] = useState(null)   // { clase, esRec }

  const emptyForm = { nombre:'', tipo:'grupal', instructor_id:'', fecha:'', hora:'08:00', sala:'Sala A', capacidad:4 }
  const [form, setForm]   = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [editando, setEditando] = useState(false)

  useEffect(() => { fetchBase() }, [])
  useEffect(() => { fetchClases() }, [mesActual])

  async function fetchBase() {
    const [{ data: ins }, { data: al }] = await Promise.all([
      supabase.from('instructores').select('id,nombre,apellido').eq('activo', true).order('nombre'),
      supabase.from('alumnos').select('id,nombre,apellido').eq('activo', true).order('apellido'),
    ])
    setInstructores(ins || [])
    setAlumnos(al || [])
  }

  async function fetchClases() {
    setLoading(true)
    const inicio = format(startOfWeek(startOfMonth(mesActual), { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const fin    = format(endOfWeek(endOfMonth(mesActual),     { weekStartsOn: 1 }), 'yyyy-MM-dd')

    const { data } = await supabase
      .from('clases')
      .select('*, instructores(id,nombre,apellido), asistencias(id,alumno_id,asistio,recuperacion,alumnos(id,nombre,apellido))')
      .gte('fecha', inicio)
      .lte('fecha', fin)
      .order('hora')

    setClases(data || [])
    setLoading(false)
  }

  // Color por instructor (índice estable)
  function colorInstructor(instructorId) {
    const idx = instructores.findIndex(i => i.id === instructorId)
    return COLORES_INSTRUCTOR[idx % COLORES_INSTRUCTOR.length] || COLORES_INSTRUCTOR[0]
  }

  // Días del calendario (incluyendo padding de semana)
  const diasCalendario = eachDayOfInterval({
    start: startOfWeek(startOfMonth(mesActual), { weekStartsOn: 1 }),
    end:   endOfWeek(endOfMonth(mesActual),     { weekStartsOn: 1 }),
  })

  function clasesDia(dia) {
    const key = format(dia, 'yyyy-MM-dd')
    return clases.filter(c => c.fecha === key).sort((a,b) => a.hora.localeCompare(b.hora))
  }

  function alumnosNormales(clase) {
    return (clase.asistencias || []).filter(a => !a.recuperacion)
  }

  function alumnosRecuperacion(clase) {
    return (clase.asistencias || []).filter(a => a.recuperacion)
  }

  // --- Acciones ---

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
    fetchClases()
    // refrescar modal
    const { data } = await supabase
      .from('clases')
      .select('*, instructores(id,nombre,apellido), asistencias(id,alumno_id,asistio,recuperacion,alumnos(id,nombre,apellido))')
      .eq('id', modalClase.id)
      .single()
    setModalClase(data)
  }

  async function eliminarClase() {
    if (!confirm('¿Eliminar esta clase?')) return
    await supabase.from('clases').delete().eq('id', modalClase.id)
    setModalClase(null)
    fetchClases()
  }

  async function agregarAlumnoAClase(alumnoId, esRec) {
    await supabase.from('asistencias').upsert({
      clase_id: modalAgregar.clase.id,
      alumno_id: alumnoId,
      asistio: false,
      recuperacion: esRec,
    }, { onConflict: 'clase_id,alumno_id' })
    setModalAgregar(null)
    fetchClases()
    // refrescar modal clase
    const { data } = await supabase
      .from('clases')
      .select('*, instructores(id,nombre,apellido), asistencias(id,alumno_id,asistio,recuperacion,alumnos(id,nombre,apellido))')
      .eq('id', modalAgregar.clase.id)
      .single()
    setModalClase(data)
  }

  async function quitarAlumno(asistenciaId) {
    await supabase.from('asistencias').delete().eq('id', asistenciaId)
    fetchClases()
    const { data } = await supabase
      .from('clases')
      .select('*, instructores(id,nombre,apellido), asistencias(id,alumno_id,asistio,recuperacion,alumnos(id,nombre,apellido))')
      .eq('id', modalClase.id)
      .single()
    setModalClase(data)
  }

  async function moverAlumno(claseDestId) {
    const { clase, asistenciaId, alumnoId } = modalMover
    // quitar de origen
    await supabase.from('asistencias').delete().eq('id', asistenciaId)
    // agregar a destino
    await supabase.from('asistencias').upsert({
      clase_id: claseDestId,
      alumno_id: alumnoId,
      asistio: false,
      recuperacion: false,
    }, { onConflict: 'clase_id,alumno_id' })
    setModalMover(null)
    fetchClases()
    const { data } = await supabase
      .from('clases')
      .select('*, instructores(id,nombre,apellido), asistencias(id,alumno_id,asistio,recuperacion,alumnos(id,nombre,apellido))')
      .eq('id', clase.id)
      .single()
    setModalClase(data)
  }

  const setF = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  // -------------------------------------------------------
  // RENDER
  // -------------------------------------------------------

  return (
    <div>
      {/* Header del calendario */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button className="btn-sec" onClick={() => setMesActual(m => subMonths(m, 1))}>←</button>
          <span style={{ fontSize:16, fontWeight:500, minWidth:160, textAlign:'center' }}>
            {format(mesActual, 'MMMM yyyy', { locale: es }).replace(/^\w/, c => c.toUpperCase())}
          </span>
          <button className="btn-sec" onClick={() => setMesActual(m => addMonths(m, 1))}>→</button>
          <button className="btn-sec" onClick={() => setMesActual(new Date())}>Hoy</button>
        </div>

        {/* Leyenda instructores */}
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
          {instructores.map((inst, idx) => {
            const col = COLORES_INSTRUCTOR[idx % COLORES_INSTRUCTOR.length]
            return (
              <div key={inst.id} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'var(--sl-m)' }}>
                <div style={{ width:9, height:9, borderRadius:'50%', background:col.border, flexShrink:0 }} />
                {inst.nombre} {inst.apellido}
              </div>
            )
          })}
          <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'var(--sl-m)' }}>
            <div style={{ width:9, height:9, borderRadius:'50%', background:'#D4A020', flexShrink:0 }} />
            Con recuperación
          </div>
        </div>
      </div>

      {/* Grid días */}
      <div style={{
        display:'grid', gridTemplateColumns:'repeat(7,minmax(0,1fr))',
        gap:1, background:'var(--border)',
        border:'1px solid var(--border)', borderRadius:12, overflow:'hidden'
      }}>
        {/* Cabecera días */}
        {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => (
          <div key={d} style={{
            background:'var(--sl-l)', padding:'7px 10px',
            fontSize:10, fontWeight:500, color:'var(--sl-m)',
            textTransform:'uppercase', letterSpacing:'0.06em', textAlign:'center'
          }}>{d}</div>
        ))}

        {/* Celdas */}
        {diasCalendario.map(dia => {
          const esMes   = isSameMonth(dia, mesActual)
          const esHoy   = isToday(dia)
          const clasesD = clasesDia(dia)

          return (
            <div key={dia.toISOString()} style={{
              background: esMes ? 'var(--white)' : 'var(--sl-l)',
              padding:8, minHeight:110, opacity: esMes ? 1 : 0.5
            }}>
              {/* Número del día */}
              <div style={{
                width:22, height:22, borderRadius:'50%',
                background: esHoy ? 'var(--mg)' : 'transparent',
                color: esHoy ? '#fff' : 'var(--sl-m)',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:11, fontWeight:500, marginBottom:5
              }}>{dia.getDate()}</div>

              {/* Chips de clases */}
              {clasesD.map(c => {
                const col     = colorInstructor(c.instructor_id)
                const normales = alumnosNormales(c).length
                const recs     = alumnosRecuperacion(c).length
                const total    = normales + recs
                return (
                  <button key={c.id}
                    onClick={() => { setModalClase(c); setEditando(false) }}
                    style={{
                      display:'block', width:'100%', textAlign:'left',
                      background: col.bg, color: col.text,
                      border:`1px solid ${recs > 0 ? '#D4A020' : col.border}`,
                      borderRadius:5, padding:'3px 6px', marginBottom:3,
                      cursor:'pointer', transition:'opacity 0.12s'
                    }}
                  >
                    <span style={{ fontSize:9, fontWeight:500, opacity:0.75, display:'block' }}>
                      {c.hora.slice(0,5)} · {c.instructores ? c.instructores.nombre.split(' ')[0] : '—'}
                    </span>
                    <span style={{ fontSize:10, fontWeight:500, display:'block', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {c.nombre}
                      {recs > 0 && <span style={{ fontSize:8, padding:'1px 4px', background:'rgba(0,0,0,0.12)', borderRadius:3, marginLeft:4 }}>REC</span>}
                    </span>
                    <span style={{ fontSize:9, opacity:0.7, display:'block' }}>
                      {total} alumno{total !== 1 ? 's' : ''}
                    </span>
                  </button>
                )
              })}

              {/* Botón agregar clase */}
              {esMes && (
                <button onClick={() => {
                  setForm({ ...emptyForm, fecha: format(dia,'yyyy-MM-dd') })
                  setModalNueva(format(dia,'yyyy-MM-dd'))
                }} style={{
                  width:'100%', marginTop:2, background:'none',
                  border:'0.5px dashed var(--border)', borderRadius:4,
                  color:'var(--sl-m)', fontSize:11, padding:'2px 0', cursor:'pointer'
                }}>+</button>
              )}
            </div>
          )
        })}
      </div>

      {/* ============================
          MODAL: Ver clase
      ============================= */}
      {modalClase && !editando && !modalAgregar && !modalMover && (
        <Modal
          title={modalClase.nombre}
          onClose={() => setModalClase(null)}
          footer={<>
            <button className="btn-danger" onClick={eliminarClase}>Eliminar</button>
            <button className="btn-sec" onClick={() => setModalClase(null)}>Cerrar</button>
          </>}
        >
          {/* Info básica */}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
            {modalClase.instructores && (() => {
              const col = colorInstructor(modalClase.instructor_id)
              return (
                <span style={{ fontSize:11, padding:'3px 9px', borderRadius:99, background:col.bg, color:col.text }}>
                  {modalClase.instructores.nombre} {modalClase.instructores.apellido}
                </span>
              )
            })()}
            <span style={{ fontSize:11, padding:'3px 9px', borderRadius:99, background:'var(--sl-l)', color:'var(--sl-m)' }}>
              {modalClase.tipo === 'grupal' ? 'Grupal' : 'Individual'}
            </span>
            <span style={{ fontSize:11, padding:'3px 9px', borderRadius:99, background:'var(--sl-l)', color:'var(--sl-m)' }}>
              {modalClase.sala}
            </span>
            <span style={{ fontSize:11, padding:'3px 9px', borderRadius:99, background:'var(--sl-l)', color:'var(--sl-m)' }}>
              {modalClase.hora?.slice(0,5)} · {modalClase.fecha}
            </span>
          </div>

          {/* Alumnos normales */}
          <div style={{ fontSize:11, fontWeight:500, color:'var(--sl-m)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>
            Alumnos ({alumnosNormales(modalClase).length + alumnosRecuperacion(modalClase).length})
          </div>

          {alumnosNormales(modalClase).map(a => (
            <div key={a.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid var(--border)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <Avatar nombre={a.alumnos?.nombre||'?'} apellido={a.alumnos?.apellido||''} size={24} fontSize={8} />
                <span style={{ fontSize:13 }}>{a.alumnos?.nombre} {a.alumnos?.apellido}</span>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button className="btn-sec" style={{ fontSize:10, padding:'3px 8px' }}
                  onClick={() => setModalMover({ clase: modalClase, asistenciaId: a.id, alumnoId: a.alumno_id })}>
                  Mover →
                </button>
                <button className="btn-danger" style={{ fontSize:10, padding:'3px 8px' }}
                  onClick={() => quitarAlumno(a.id)}>✕</button>
              </div>
            </div>
          ))}

          {/* Alumnos en recuperación */}
          {alumnosRecuperacion(modalClase).map(a => (
            <div key={a.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid var(--border)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <Avatar nombre={a.alumnos?.nombre||'?'} apellido={a.alumnos?.apellido||''} size={24} fontSize={8} />
                <span style={{ fontSize:13 }}>{a.alumnos?.nombre} {a.alumnos?.apellido}</span>
                <span style={{ fontSize:9, padding:'2px 6px', background:'#FEF3E2', color:'#7A5010', borderRadius:3 }}>RECUPERACIÓN</span>
              </div>
              <button className="btn-danger" style={{ fontSize:10, padding:'3px 8px' }}
                onClick={() => quitarAlumno(a.id)}>✕</button>
            </div>
          ))}

          {alumnosNormales(modalClase).length === 0 && alumnosRecuperacion(modalClase).length === 0 && (
            <div className="empty">Sin alumnos asignados</div>
          )}

          {/* Acciones */}
          <div style={{ display:'flex', gap:8, marginTop:14, flexWrap:'wrap' }}>
            <button className="btn-sec" style={{ fontSize:11 }}
              onClick={() => setModalAgregar({ clase: modalClase, esRec: false })}>
              + Agregar alumno
            </button>
            <button style={{ fontSize:11, padding:'6px 12px', borderRadius:8, background:'#FEF3E2', color:'#7A5010', border:'1px solid #F0C060', cursor:'pointer' }}
              onClick={() => setModalAgregar({ clase: modalClase, esRec: true })}>
              + Recuperación
            </button>
            <button className="btn-sec" style={{ fontSize:11 }}
              onClick={() => {
                setForm({
                  nombre: modalClase.nombre, tipo: modalClase.tipo,
                  instructor_id: modalClase.instructor_id || '',
                  fecha: modalClase.fecha, hora: modalClase.hora,
                  sala: modalClase.sala, capacidad: modalClase.capacidad
                })
                setEditando(true)
              }}>
              Editar clase
            </button>
          </div>
        </Modal>
      )}

      {/* ============================
          MODAL: Editar clase
      ============================= */}
      {modalClase && editando && (
        <Modal
          title="Editar clase"
          onClose={() => setEditando(false)}
          footer={<>
            <button className="btn-sec" onClick={() => setEditando(false)}>Cancelar</button>
            <button className="btn-pri" onClick={guardarEdicion} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </>}
        >
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

      {/* ============================
          MODAL: Nueva clase
      ============================= */}
      {modalNueva && (
        <Modal
          title={`Nueva clase — ${format(parseISO(modalNueva), "d 'de' MMMM", { locale: es })}`}
          onClose={() => setModalNueva(null)}
          footer={<>
            <button className="btn-sec" onClick={() => setModalNueva(null)}>Cancelar</button>
            <button className="btn-pri" onClick={guardarNuevaClase} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar clase'}
            </button>
          </>}
        >
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

      {/* ============================
          MODAL: Agregar alumno / recuperación
      ============================= */}
      {modalAgregar && (
        <Modal
          title={modalAgregar.esRec ? 'Agregar recuperación' : 'Agregar alumno'}
          onClose={() => setModalAgregar(null)}
          footer={<button className="btn-sec" onClick={() => setModalAgregar(null)}>Cancelar</button>}
        >
          {modalAgregar.esRec && (
            <div style={{ fontSize:12, padding:'8px 12px', background:'#FEF3E2', color:'#7A5010', borderRadius:8, marginBottom:14 }}>
              Esta clase se marcará como <strong>recuperación</strong> para el alumno seleccionado.
            </div>
          )}
          {(() => {
            const yaAsignados = (modalAgregar.clase.asistencias || []).map(a => a.alumno_id)
            const disponibles = alumnos.filter(a => !yaAsignados.includes(a.id))
            if (disponibles.length === 0) return <div className="empty">No hay alumnos disponibles</div>
            return disponibles.map(a => (
              <div key={a.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <Avatar nombre={a.nombre} apellido={a.apellido} size={24} fontSize={8} />
                  <span style={{ fontSize:13 }}>{a.nombre} {a.apellido}</span>
                </div>
                <button className="btn-pri" style={{ fontSize:11, padding:'4px 12px' }}
                  onClick={() => agregarAlumnoAClase(a.id, modalAgregar.esRec)}>
                  Agregar
                </button>
              </div>
            ))
          })()}
        </Modal>
      )}

      {/* ============================
          MODAL: Mover alumno
      ============================= */}
      {modalMover && (
        <Modal
          title="Mover alumno a otra clase"
          onClose={() => setModalMover(null)}
          footer={<button className="btn-sec" onClick={() => setModalMover(null)}>Cancelar</button>}
        >
          <div style={{ fontSize:12, color:'var(--sl-m)', marginBottom:14 }}>
            Seleccioná la clase de destino:
          </div>
          {clases.filter(c => c.id !== modalMover.clase.id).map(c => {
            const col = colorInstructor(c.instructor_id)
            return (
              <div key={c.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:500 }}>{c.nombre}</div>
                  <div style={{ fontSize:11, color:'var(--sl-m)' }}>
                    {c.fecha} · {c.hora?.slice(0,5)} ·&nbsp;
                    <span style={{ color: col.border }}>{c.instructores?.nombre} {c.instructores?.apellido}</span>
                  </div>
                </div>
                <button className="btn-pri" style={{ fontSize:11, padding:'4px 12px' }}
                  onClick={() => moverAlumno(c.id)}>
                  Mover
                </button>
              </div>
            )
          })}
        </Modal>
      )}
    </div>
  )
}
