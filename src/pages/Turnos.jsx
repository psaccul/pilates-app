import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import Toggle from '../components/Toggle'
import { format, startOfWeek, endOfWeek, addWeeks } from 'date-fns'
import { es } from 'date-fns/locale'

const emptyForm = { nombre:'', tipo:'grupal', fecha:'', hora:'', sala:'', capacidad:4, instructor_id:'' }

export default function Turnos() {
  const [clases, setClases]         = useState([])
  const [instructores, setInstructores] = useState([])
  const [asistencias, setAsistencias]   = useState({})
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState(false)
  const [form, setForm]             = useState(emptyForm)
  const [saving, setSaving]         = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)

  const weekStart = startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 })
  const weekEnd   = endOfWeek(weekStart, { weekStartsOn: 1 })

  useEffect(() => {
    fetchInstructores()
    const handler = () => openModal()
    window.addEventListener('open-turno', handler)
    return () => window.removeEventListener('open-turno', handler)
  }, [])

  useEffect(() => { fetchClases() }, [weekOffset])

  async function fetchInstructores() {
    const { data } = await supabase.from('instructores').select('id,nombre,apellido').eq('activo',true)
    setInstructores(data || [])
  }

  async function fetchClases() {
    setLoading(true)
    const { data } = await supabase
      .from('clases')
      .select('*, instructores(nombre,apellido)')
      .gte('fecha', format(weekStart,'yyyy-MM-dd'))
      .lte('fecha', format(weekEnd,'yyyy-MM-dd'))
      .order('fecha').order('hora')

    setClases(data || [])

    // fetch asistencias for these classes
    if (data && data.length > 0) {
      const ids = data.map(c => c.id)
      const { data: asis } = await supabase
        .from('asistencias')
        .select('id,clase_id,asistio')
        .in('clase_id', ids)
      const map = {}
      ;(asis || []).forEach(a => { map[a.clase_id] = a })
      setAsistencias(map)
    }
    setLoading(false)
  }

  function openModal(clase = null) {
    setForm(clase ? {
      ...clase,
      instructor_id: clase.instructor_id || ''
    } : { ...emptyForm, fecha: format(new Date(),'yyyy-MM-dd') })
    setModal(true)
  }

  async function handleSave() {
    if (!form.nombre || !form.fecha || !form.hora) return
    setSaving(true)
    const payload = {
      nombre: form.nombre, tipo: form.tipo, fecha: form.fecha,
      hora: form.hora, sala: form.sala, capacidad: Number(form.capacidad),
      instructor_id: form.instructor_id || null,
    }
    if (form.id) {
      await supabase.from('clases').update(payload).eq('id', form.id)
    } else {
      await supabase.from('clases').insert(payload)
    }
    setSaving(false)
    setModal(false)
    fetchClases()
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta clase?')) return
    await supabase.from('clases').delete().eq('id', id)
    fetchClases()
  }

  async function toggleAsistencia(clase) {
    const current = asistencias[clase.id]
    if (current) {
      const nuevoValor = !current.asistio
      await supabase.from('asistencias').update({ asistio: nuevoValor }).eq('id', current.id)
      setAsistencias(prev => ({ ...prev, [clase.id]: { ...current, asistio: nuevoValor } }))
    } else {
      const { data } = await supabase.from('asistencias')
        .insert({ clase_id: clase.id, asistio: true })
        .select().single()
      setAsistencias(prev => ({ ...prev, [clase.id]: data }))
    }
  }

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <>
      <div className="tabs">
        <button className="btn-sec" onClick={() => setWeekOffset(w => w - 1)}>← Semana anterior</button>
        <span style={{padding:'6px 16px', fontSize:13, color:'var(--sl-m)'}}>
          {format(weekStart,'d MMM',{locale:es})} — {format(weekEnd,'d MMM yyyy',{locale:es})}
        </span>
        <button className="btn-sec" onClick={() => setWeekOffset(w => w + 1)}>Semana siguiente →</button>
      </div>

      <div className="panel">
        <div className="ph">
          <span className="ph-title">Clases de la semana</span>
        </div>
        {loading ? <div className="loading">Cargando…</div> : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Día / Hora</th><th>Clase</th><th>Instructor</th>
                <th>Tipo</th><th>Sala</th><th>Cap.</th><th>Asistencia</th><th></th>
              </tr>
            </thead>
            <tbody>
              {clases.length === 0 && (
                <tr><td colSpan={8} className="empty">No hay clases esta semana</td></tr>
              )}
              {clases.map(c => {
                const asis = asistencias[c.id]
                const diaFecha = format(new Date(c.fecha + 'T00:00:00'), 'EEE d', { locale: es })
                return (
                  <tr key={c.id}>
                    <td>
                      <div style={{fontWeight:500, textTransform:'capitalize'}}>{diaFecha}</div>
                      <div style={{fontSize:10, color:'var(--sl-m)'}}>{c.hora.slice(0,5)}</div>
                    </td>
                    <td style={{fontWeight:500}}>{c.nombre}</td>
                    <td>{c.instructores ? `${c.instructores.nombre} ${c.instructores.apellido}` : '—'}</td>
                    <td><span className={`bdg ${c.tipo==='grupal'?'bdg-g':'bdg-i'}`}>{c.tipo==='grupal'?'Grupal':'Individual'}</span></td>
                    <td>{c.sala || '—'}</td>
                    <td>{c.capacidad}</td>
                    <td>
                      <Toggle
                        value={asis?.asistio || false}
                        onChange={() => toggleAsistencia(c)}
                        labelOn="Presente"
                        labelOff="Sin marcar"
                      />
                    </td>
                    <td style={{display:'flex', gap:6}}>
                      <button className="btn-sec" style={{fontSize:11, padding:'4px 10px'}}
                        onClick={() => openModal(c)}>Editar</button>
                      <button className="btn-danger" style={{fontSize:11, padding:'4px 10px'}}
                        onClick={() => handleDelete(c.id)}>✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <Modal
          title={form.id ? 'Editar clase' : 'Nueva clase'}
          onClose={() => setModal(false)}
          footer={<>
            <button className="btn-sec" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn-pri" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar clase'}
            </button>
          </>}
        >
          <div className="form-row">
            <label className="form-lbl">Tipo de clase</label>
            <select className="form-inp" value={form.tipo} onChange={set('tipo')}>
              <option value="grupal">Grupal</option>
              <option value="individual">Individual</option>
            </select>
          </div>
          <div className="form-row">
            <label className="form-lbl">Nombre de la clase</label>
            <input className="form-inp" value={form.nombre} onChange={set('nombre')} placeholder="Ej: Reformer Intermedio" />
          </div>
          <div className="form-row2">
            <div className="form-row" style={{marginBottom:0}}>
              <label className="form-lbl">Fecha</label>
              <input className="form-inp" type="date" value={form.fecha} onChange={set('fecha')} />
            </div>
            <div className="form-row" style={{marginBottom:0}}>
              <label className="form-lbl">Hora</label>
              <input className="form-inp" type="time" value={form.hora} onChange={set('hora')} />
            </div>
          </div>
          <div className="form-row2" style={{marginTop:14}}>
            <div className="form-row" style={{marginBottom:0}}>
              <label className="form-lbl">Instructor</label>
              <select className="form-inp" value={form.instructor_id} onChange={set('instructor_id')}>
                <option value="">Sin asignar</option>
                {instructores.map(i => (
                  <option key={i.id} value={i.id}>{i.nombre} {i.apellido}</option>
                ))}
              </select>
            </div>
            <div className="form-row" style={{marginBottom:0}}>
              <label className="form-lbl">Sala</label>
              <select className="form-inp" value={form.sala} onChange={set('sala')}>
                <option value="">—</option>
                <option value="Sala A">Sala A</option>
                <option value="Sala B">Sala B</option>
              </select>
            </div>
          </div>
          <div className="form-row" style={{marginTop:14}}>
            <label className="form-lbl">Capacidad máxima</label>
            <input className="form-inp" type="number" min={1} max={20} value={form.capacidad} onChange={set('capacidad')} />
          </div>
        </Modal>
      )}
    </>
  )
}
