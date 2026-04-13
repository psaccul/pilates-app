import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import Avatar from '../components/Avatar'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const emptyForm = { nombre:'', apellido:'', telefono:'', plan:'mensual', frecuencia:'', instructor_id:'' }

export default function Alumnos() {
  const [alumnos, setAlumnos]           = useState([])
  const [instructores, setInstructores] = useState([])
  const [loading, setLoading]           = useState(true)
  const [modal, setModal]               = useState(false)
  const [historial, setHistorial]       = useState(null)  // alumno seleccionado
  const [histData, setHistData]         = useState([])
  const [form, setForm]                 = useState(emptyForm)
  const [saving, setSaving]             = useState(false)
  const [search, setSearch]             = useState('')

  useEffect(() => {
    fetchData()
    const handler = () => openModal()
    window.addEventListener('open-alumno', handler)
    return () => window.removeEventListener('open-alumno', handler)
  }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: al }, { data: ins }] = await Promise.all([
      supabase.from('alumnos')
        .select('*, instructores(nombre,apellido), pagos(pagado)')
        .eq('activo', true)
        .order('apellido'),
      supabase.from('instructores').select('id,nombre,apellido').eq('activo',true)
    ])
    setAlumnos(al || [])
    setInstructores(ins || [])
    setLoading(false)
  }

  function openModal(alumno = null) {
    setForm(alumno ? {
      id: alumno.id, nombre: alumno.nombre, apellido: alumno.apellido,
      telefono: alumno.telefono || '', plan: alumno.plan,
      frecuencia: alumno.frecuencia || '', instructor_id: alumno.instructor_id || ''
    } : emptyForm)
    setModal(true)
  }

  async function handleSave() {
    if (!form.nombre || !form.apellido) return
    setSaving(true)
    const payload = {
      nombre: form.nombre, apellido: form.apellido, telefono: form.telefono,
      plan: form.plan, frecuencia: form.frecuencia,
      instructor_id: form.instructor_id || null, activo: true
    }
    if (form.id) {
      await supabase.from('alumnos').update(payload).eq('id', form.id)
    } else {
      await supabase.from('alumnos').insert(payload)
    }
    setSaving(false)
    setModal(false)
    fetchData()
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este alumno?')) return
    await supabase.from('alumnos').update({ activo: false }).eq('id', id)
    fetchData()
  }

  async function verHistorial(alumno) {
    setHistorial(alumno)
    const { data } = await supabase
      .from('asistencias')
      .select('*, clases(nombre, fecha, hora, instructores(nombre,apellido))')
      .eq('alumno_id', alumno.id)
      .order('created_at', { ascending: false })
      .limit(30)
    setHistData(data || [])
  }

  function estadoPago(alumno) {
    const pagos = alumno.pagos || []
    if (pagos.length === 0) return 'sin-pago'
    if (pagos.some(p => !p.pagado)) return 'pendiente'
    return 'ok'
  }

  const filtered = alumnos.filter(a =>
    `${a.nombre} ${a.apellido}`.toLowerCase().includes(search.toLowerCase())
  )
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <>
      <div style={{marginBottom:14, display:'flex', gap:10}}>
        <input className="form-inp" style={{maxWidth:280}}
          placeholder="Buscar alumno…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="panel">
        <div className="ph"><span className="ph-title">Alumnos activos ({filtered.length})</span></div>
        {loading ? <div className="loading">Cargando…</div> : (
          <table className="tbl">
            <thead>
              <tr><th>Alumno</th><th>Plan</th><th>Frecuencia</th><th>Instructor</th><th>Teléfono</th><th>Estado pago</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="empty">No se encontraron alumnos</td></tr>
              )}
              {filtered.map(a => {
                const ep = estadoPago(a)
                return (
                  <tr key={a.id}>
                    <td>
                      <div style={{display:'flex', alignItems:'center', gap:8}}>
                        <Avatar nombre={a.nombre} apellido={a.apellido} size={26} fontSize={9} />
                        <span style={{fontWeight:500}}>{a.nombre} {a.apellido}</span>
                      </div>
                    </td>
                    <td>{a.plan === 'mensual' ? 'Mensual' : 'Sueltas'}</td>
                    <td>{a.frecuencia || '—'}</td>
                    <td>{a.instructores ? `${a.instructores.nombre} ${a.instructores.apellido}` : '—'}</td>
                    <td>{a.telefono || '—'}</td>
                    <td><span className={`est ${ep==='ok'?'e-ok':ep==='pendiente'?'e-pe':'e-ve'}`}>
                      {ep==='ok'?'Al día':ep==='pendiente'?'Pendiente':'Sin pago'}
                    </span></td>
                    <td style={{display:'flex', gap:6}}>
                      <button className="btn-sec" style={{fontSize:11,padding:'4px 10px'}}
                        onClick={() => verHistorial(a)}>Historial</button>
                      <button className="btn-sec" style={{fontSize:11,padding:'4px 10px'}}
                        onClick={() => openModal(a)}>Editar</button>
                      <button className="btn-danger" style={{fontSize:11,padding:'4px 10px'}}
                        onClick={() => handleDelete(a.id)}>✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal nuevo/editar */}
      {modal && (
        <Modal
          title={form.id ? 'Editar alumno' : 'Nuevo alumno'}
          onClose={() => setModal(false)}
          footer={<>
            <button className="btn-sec" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn-pri" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar alumno'}
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
            <label className="form-lbl">Teléfono (WhatsApp)</label>
            <input className="form-inp" value={form.telefono} onChange={set('telefono')} placeholder="+54 9 3765 ..." />
          </div>
          <div className="form-row2">
            <div className="form-row" style={{marginBottom:0}}>
              <label className="form-lbl">Plan</label>
              <select className="form-inp" value={form.plan} onChange={set('plan')}>
                <option value="mensual">Plan mensual</option>
                <option value="sueltas">Clases sueltas</option>
              </select>
            </div>
            <div className="form-row" style={{marginBottom:0}}>
              <label className="form-lbl">Frecuencia</label>
              <select className="form-inp" value={form.frecuencia} onChange={set('frecuencia')}>
                <option value="">—</option>
                <option value="1×/semana">1×/semana</option>
                <option value="2×/semana">2×/semana</option>
                <option value="3×/semana">3×/semana</option>
                <option value="Libre">Libre</option>
              </select>
            </div>
          </div>
          <div className="form-row" style={{marginTop:14}}>
            <label className="form-lbl">Instructor asignado</label>
            <select className="form-inp" value={form.instructor_id} onChange={set('instructor_id')}>
              <option value="">Sin asignar</option>
              {instructores.map(i => (
                <option key={i.id} value={i.id}>{i.nombre} {i.apellido}</option>
              ))}
            </select>
          </div>
        </Modal>
      )}

      {/* Modal historial */}
      {historial && (
        <Modal
          title={`Historial — ${historial.nombre} ${historial.apellido}`}
          onClose={() => setHistorial(null)}
          footer={<button className="btn-pri" onClick={() => setHistorial(null)}>Cerrar</button>}
        >
          <div style={{padding:'0 0 0 0', marginTop:-20}}>
            <table className="tbl">
              <thead>
                <tr><th>Fecha</th><th>Clase</th><th>Instructor</th><th>Asistió</th></tr>
              </thead>
              <tbody>
                {histData.length === 0 && (
                  <tr><td colSpan={4} className="empty">Sin registros aún</td></tr>
                )}
                {histData.map(h => (
                  <tr key={h.id}>
                    <td>{h.clases?.fecha ? format(new Date(h.clases.fecha+'T00:00:00'), 'dd/MM/yy') : '—'}</td>
                    <td>{h.clases?.nombre || '—'}</td>
                    <td>{h.clases?.instructores ? `${h.clases.instructores.nombre} ${h.clases.instructores.apellido}` : '—'}</td>
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
