import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Dashboard      from '../pages/Dashboard'
import Calendario     from '../pages/Calendario'
import Turnos         from '../pages/Turnos'
import Alumnos        from '../pages/Alumnos'
import Instructores   from '../pages/Instructores'
import Pagos          from '../pages/Pagos'
import Reportes       from '../pages/Reportes'
import Notificaciones from '../pages/Notificaciones'
import Modal          from './Modal'
import Avatar         from './Avatar'

const PAGES = [
  { id: 'dashboard',    label: 'Dashboard',     icon: '◈' },
  { id: 'calendario',   label: 'Calendario',     icon: '◫' },
  { id: 'turnos',       label: 'Turnos',         icon: '◷' },
  { id: 'alumnos',      label: 'Alumnos',        icon: '◉' },
  { id: 'instructores', label: 'Instructores',   icon: '◎' },
  { id: 'pagos',        label: 'Pagos',          icon: '◈' },
  { id: 'reportes',     label: 'Reportes',       icon: '◫' },
  { id: 'notif',        label: 'Notificaciones', icon: '◌' },
]

const PAGE_TITLES = {
  dashboard:'Buenos días ✦', calendario:'Calendario', turnos:'Turnos',
  alumnos:'Alumnos', instructores:'Instructores', pagos:'Pagos',
  reportes:'Reportes', notif:'Notificaciones'
}

export default function Layout() {
  const [page, setPage]         = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [fichaAlumno, setFichaAlumno] = useState(null)
  const [fichaData, setFichaData]     = useState(null)
  const [fichaEditando, setFichaEditando] = useState(false)
  const [fichaSaving, setFichaSaving]     = useState(false)
  const [fichaForm, setFichaForm]         = useState({})

  const today = new Date().toLocaleDateString('es-AR', {
    weekday:'long', day:'numeric', month:'long', year:'numeric'
  })
  const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1)

  // Escuchar evento global para abrir ficha de alumno
  useEffect(() => {
    const handler = e => abrirFicha(e.detail)
    window.addEventListener('open-ficha-alumno', handler)
    return () => window.removeEventListener('open-ficha-alumno', handler)
  }, [])

  async function abrirFicha(alumnoId) {
    setFichaAlumno(alumnoId)
    setFichaEditando(false)
    const { data } = await supabase.from('alumnos')
      .select('*, instructores(nombre,apellido), pagos(pagado,concepto,monto,medio)')
      .eq('id', alumnoId).single()
    setFichaData(data)
    setFichaForm({
      nombre: data.nombre, apellido: data.apellido,
      telefono: data.telefono || '', plan: data.plan,
      frecuencia: data.frecuencia || '',
      instructor_id: data.instructor_id || '',
      notas: data.notas || '',
    })
  }

  async function guardarFicha() {
    if (!fichaData) return
    setFichaSaving(true)
    await supabase.from('alumnos').update({
      nombre: fichaForm.nombre, apellido: fichaForm.apellido,
      telefono: fichaForm.telefono, plan: fichaForm.plan,
      frecuencia: fichaForm.frecuencia,
      instructor_id: fichaForm.instructor_id || null,
      notas: fichaForm.notas,
    }).eq('id', fichaData.id)
    setFichaSaving(false)
    setFichaEditando(false)
    abrirFicha(fichaData.id)
    window.dispatchEvent(new CustomEvent('alumno-actualizado'))
  }

  function navTo(pageId) {
    setPage(pageId)
    setSidebarOpen(false)
  }

  const setFF = k => e => setFichaForm(f => ({...f, [k]: e.target.value}))

  return (
    <div className="layout">

      {/* Overlay mobile */}
      <div className={`sidebar-overlay${sidebarOpen?' open':''}`}
        onClick={() => setSidebarOpen(false)} />

      {/* Sidebar */}
      <aside className={`sidebar${sidebarOpen?' open':''}`}>
        <div className="logo">
          <div className="logo-word">Studio</div>
          <div className="logo-sub">Pilates Reformer</div>
        </div>
        <nav>
          {PAGES.map(p => (
            <div key={p.id} className={`nav-item${page===p.id?' active':''}`}
              onClick={() => navTo(p.id)}>
              <span style={{fontSize:14}}>{p.icon}</span> {p.label}
            </div>
          ))}
        </nav>
        <div className="sidebar-btm">
          <div className="adm-row">
            <div className="adm-av">AD</div>
            <div className="adm-name">Administrador</div>
          </div>
          <button onClick={() => supabase.auth.signOut()}
            style={{marginTop:12, fontSize:11, color:'rgba(255,255,255,0.3)',
              background:'none', border:'none', cursor:'pointer', paddingLeft:36}}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        <div className="topbar">
          <div style={{display:'flex', alignItems:'center', gap:12}}>
            {/* Hamburger */}
            <button className="hamburger" onClick={() => setSidebarOpen(o => !o)}>
              <span style={{transform: sidebarOpen ? 'rotate(45deg) translate(4px,4px)' : 'none'}} />
              <span style={{opacity: sidebarOpen ? 0 : 1}} />
              <span style={{transform: sidebarOpen ? 'rotate(-45deg) translate(4px,-4px)' : 'none'}} />
            </button>
            <div>
              <div className="tb-title">{PAGE_TITLES[page]}</div>
              <div className="tb-date">{capitalize(today)}</div>
            </div>
          </div>
          <PageAction page={page} />
        </div>

        <div className="content">
          {page === 'dashboard'    && <Dashboard    setPage={navTo} />}
          {page === 'calendario'   && <Calendario />}
          {page === 'turnos'       && <Turnos />}
          {page === 'alumnos'      && <Alumnos />}
          {page === 'instructores' && <Instructores />}
          {page === 'pagos'        && <Pagos />}
          {page === 'reportes'     && <Reportes />}
          {page === 'notif'        && <Notificaciones />}
        </div>
      </main>

      {/* ====== MODAL GLOBAL: Ficha del alumno ====== */}
      {fichaAlumno && fichaData && (
        <Modal
          title={fichaEditando ? 'Editar alumno' : `${fichaData.nombre} ${fichaData.apellido}`}
          onClose={() => { setFichaAlumno(null); setFichaData(null); setFichaEditando(false) }}
          footer={fichaEditando ? (
            <>
              <button className="btn-sec" onClick={() => setFichaEditando(false)}>Cancelar</button>
              <button className="btn-pri" onClick={guardarFicha} disabled={fichaSaving}>
                {fichaSaving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </>
          ) : (
            <>
              <button className="btn-sec" onClick={() => { setFichaAlumno(null); setFichaData(null) }}>Cerrar</button>
              <button className="btn-pri" onClick={() => setFichaEditando(true)}>Editar</button>
            </>
          )}
        >
          {!fichaEditando ? (
            /* Vista de ficha */
            <>
              <div style={{display:'flex', alignItems:'center', gap:14, marginBottom:20}}>
                <Avatar nombre={fichaData.nombre} apellido={fichaData.apellido} size={48} fontSize={16} />
                <div>
                  <div style={{fontSize:18, fontWeight:500}}>{fichaData.nombre} {fichaData.apellido}</div>
                  <div style={{fontSize:12, color:'var(--sl-m)', marginTop:2}}>
                    {fichaData.plan==='mensual'?'Plan mensual':'Clases sueltas'}
                    {fichaData.frecuencia ? ` · ${fichaData.frecuencia}` : ''}
                  </div>
                </div>
              </div>

              <table style={{width:'100%', fontSize:13, borderCollapse:'collapse'}}>
                {[
                  ['Teléfono', fichaData.telefono || '—'],
                  ['Instructor', fichaData.instructores ? `${fichaData.instructores.nombre} ${fichaData.instructores.apellido}` : '—'],
                  ['Pagos al día', (fichaData.pagos||[]).filter(p=>p.pagado).length + ' pagados · ' + (fichaData.pagos||[]).filter(p=>!p.pagado).length + ' pendientes'],
                ].map(([k,v]) => (
                  <tr key={k} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'8px 0', color:'var(--sl-m)', width:'40%'}}>{k}</td>
                    <td style={{padding:'8px 0', fontWeight:400}}>{v}</td>
                  </tr>
                ))}
              </table>

              {fichaData.notas && (
                <div style={{marginTop:14, padding:'12px', background:'var(--sl-l)', borderRadius:8}}>
                  <div style={{fontSize:10, color:'var(--sl-m)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6}}>Notas / Patologías</div>
                  <div style={{fontSize:13, lineHeight:1.6, whiteSpace:'pre-wrap'}}>{fichaData.notas}</div>
                </div>
              )}
            </>
          ) : (
            /* Formulario edición */
            <>
              <div className="form-row2">
                <div className="form-row" style={{marginBottom:0}}>
                  <label className="form-lbl">Nombre</label>
                  <input className="form-inp" value={fichaForm.nombre} onChange={setFF('nombre')} />
                </div>
                <div className="form-row" style={{marginBottom:0}}>
                  <label className="form-lbl">Apellido</label>
                  <input className="form-inp" value={fichaForm.apellido} onChange={setFF('apellido')} />
                </div>
              </div>
              <div className="form-row" style={{marginTop:14}}>
                <label className="form-lbl">Teléfono (WhatsApp)</label>
                <input className="form-inp" value={fichaForm.telefono} onChange={setFF('telefono')} placeholder="+54 9 ..." />
              </div>
              <div className="form-row2">
                <div className="form-row" style={{marginBottom:0}}>
                  <label className="form-lbl">Plan</label>
                  <select className="form-inp" value={fichaForm.plan} onChange={setFF('plan')}>
                    <option value="mensual">Plan mensual</option>
                    <option value="sueltas">Clases sueltas</option>
                  </select>
                </div>
                <div className="form-row" style={{marginBottom:0}}>
                  <label className="form-lbl">Frecuencia</label>
                  <select className="form-inp" value={fichaForm.frecuencia} onChange={setFF('frecuencia')}>
                    <option value="">—</option>
                    <option value="1×/semana">1×/semana</option>
                    <option value="2×/semana">2×/semana</option>
                    <option value="3×/semana">3×/semana</option>
                    <option value="Libre">Libre</option>
                  </select>
                </div>
              </div>
              <div className="form-row" style={{marginTop:14}}>
                <label className="form-lbl">Notas / Patologías / Condiciones especiales</label>
                <textarea className="form-inp" value={fichaForm.notas} onChange={setFF('notas')}
                  placeholder="Ej: Hernia lumbar L4-L5. Evitar flexión profunda. Alergia a látex..." />
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  )
}

function PageAction({ page }) {
  const actions = {
    dashboard:    { label:'+ Nuevo turno',     event:'open-turno' },
    turnos:       { label:'+ Nueva clase',     event:'open-turno' },
    alumnos:      { label:'+ Nuevo alumno',    event:'open-alumno' },
    instructores: { label:'+ Nuevo instructor',event:'open-instructor' },
    pagos:        { label:'+ Registrar pago',  event:'open-pago' },
  }
  const a = actions[page]
  if (!a) return null
  return (
    <button className="btn-pri"
      onClick={() => window.dispatchEvent(new CustomEvent(a.event))}>
      {a.label}
    </button>
  )
}
