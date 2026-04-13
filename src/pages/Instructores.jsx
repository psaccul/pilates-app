import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import Avatar from '../components/Avatar'

const emptyForm = { nombre:'', apellido:'', telefono:'', especialidad:'' }

export default function Instructores() {
  const [instructores, setInstructores] = useState([])
  const [loading, setLoading]           = useState(true)
  const [modal, setModal]               = useState(false)
  const [form, setForm]                 = useState(emptyForm)
  const [saving, setSaving]             = useState(false)

  useEffect(() => {
    fetchData()
    const handler = () => openModal()
    window.addEventListener('open-instructor', handler)
    return () => window.removeEventListener('open-instructor', handler)
  }, [])

  async function fetchData() {
    setLoading(true)
    const { data } = await supabase
      .from('instructores')
      .select('*, alumnos(id), clases(id)')
      .eq('activo', true)
      .order('apellido')
    setInstructores(data || [])
    setLoading(false)
  }

  function openModal(inst = null) {
    setForm(inst ? {
      id: inst.id, nombre: inst.nombre, apellido: inst.apellido,
      telefono: inst.telefono || '', especialidad: inst.especialidad || ''
    } : emptyForm)
    setModal(true)
  }

  async function handleSave() {
    if (!form.nombre || !form.apellido) return
    setSaving(true)
    const payload = { nombre: form.nombre, apellido: form.apellido, telefono: form.telefono, especialidad: form.especialidad, activo: true }
    if (form.id) {
      await supabase.from('instructores').update(payload).eq('id', form.id)
    } else {
      await supabase.from('instructores').insert(payload)
    }
    setSaving(false)
    setModal(false)
    fetchData()
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este instructor?')) return
    await supabase.from('instructores').update({ activo: false }).eq('id', id)
    fetchData()
  }

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <>
      <div className="panel">
        <div className="ph"><span className="ph-title">Instructores</span></div>
        {loading ? <div className="loading">Cargando…</div> : (
          <table className="tbl">
            <thead>
              <tr><th>Instructor</th><th>Especialidad</th><th>Teléfono</th><th>Alumnos</th><th>Clases totales</th><th></th></tr>
            </thead>
            <tbody>
              {instructores.length === 0 && (
                <tr><td colSpan={6} className="empty">No hay instructores registrados</td></tr>
              )}
              {instructores.map(i => (
                <tr key={i.id}>
                  <td>
                    <div style={{display:'flex', alignItems:'center', gap:8}}>
                      <Avatar nombre={i.nombre} apellido={i.apellido} size={26} fontSize={9} />
                      <span style={{fontWeight:500}}>{i.nombre} {i.apellido}</span>
                    </div>
                  </td>
                  <td>{i.especialidad || '—'}</td>
                  <td>{i.telefono || '—'}</td>
                  <td>{(i.alumnos || []).length}</td>
                  <td>{(i.clases || []).length}</td>
                  <td style={{display:'flex', gap:6}}>
                    <button className="btn-sec" style={{fontSize:11,padding:'4px 10px'}}
                      onClick={() => openModal(i)}>Editar</button>
                    <button className="btn-danger" style={{fontSize:11,padding:'4px 10px'}}
                      onClick={() => handleDelete(i.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <Modal
          title={form.id ? 'Editar instructor' : 'Nuevo instructor'}
          onClose={() => setModal(false)}
          footer={<>
            <button className="btn-sec" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn-pri" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar instructor'}
            </button>
          </>}
        >
          <div className="form-row2">
            <div className="form-row" style={{marginBottom:0}}>
              <label className="form-lbl">Nombre</label>
              <input className="form-inp" value={form.nombre} onChange={set('nombre')} placeholder="Nombre" />
            </div>
            <div className="form-row" style={{marginBottom:0}}>
              <label className="form-lbl">Apellido</label>
              <input className="form-inp" value={form.apellido} onChange={set('apellido')} placeholder="Apellido" />
            </div>
          </div>
          <div className="form-row" style={{marginTop:14}}>
            <label className="form-lbl">Teléfono</label>
            <input className="form-inp" value={form.telefono} onChange={set('telefono')} placeholder="+54 9 ..." />
          </div>
          <div className="form-row">
            <label className="form-lbl">Especialidad</label>
            <input className="form-inp" value={form.especialidad} onChange={set('especialidad')} placeholder="Ej: Reformer · Avanzado" />
          </div>
        </Modal>
      )}
    </>
  )
}
