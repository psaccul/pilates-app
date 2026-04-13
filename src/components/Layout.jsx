import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Dashboard     from '../pages/Dashboard'
import Calendario    from '../pages/Calendario'
import Turnos        from '../pages/Turnos'
import Alumnos       from '../pages/Alumnos'
import Instructores  from '../pages/Instructores'
import Pagos         from '../pages/Pagos'
import Reportes      from '../pages/Reportes'
import Notificaciones from '../pages/Notificaciones'

const PAGES = [
  { id: 'dashboard',     label: 'Dashboard',        icon: '◈' },
  { id: 'calendario',    label: 'Calendario',        icon: '◫' },
  { id: 'turnos',        label: 'Turnos',            icon: '◷' },
  { id: 'alumnos',       label: 'Alumnos',           icon: '◉' },
  { id: 'instructores',  label: 'Instructores',      icon: '◎' },
  { id: 'pagos',         label: 'Pagos',             icon: '◈' },
  { id: 'reportes',      label: 'Reportes',          icon: '◫' },
  { id: 'notif',         label: 'Notificaciones',    icon: '◌' },
]

const PAGE_TITLES = {
  dashboard: 'Buenos días ✦', calendario: 'Calendario',
  turnos: 'Turnos', alumnos: 'Alumnos', instructores: 'Instructores',
  pagos: 'Pagos', reportes: 'Reportes', notif: 'Notificaciones'
}

export default function Layout() {
  const [page, setPage] = useState('dashboard')

  const today = new Date().toLocaleDateString('es-AR', {
    weekday:'long', day:'numeric', month:'long', year:'numeric'
  })

  const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1)

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-word">Studio</div>
          <div className="logo-sub">Pilates Reformer</div>
        </div>
        <nav>
          {PAGES.map(p => (
            <div key={p.id} className={`nav-item${page===p.id?' active':''}`}
              onClick={() => setPage(p.id)}>
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

      <main className="main">
        <div className="topbar">
          <div>
            <div className="tb-title">{PAGE_TITLES[page]}</div>
            <div className="tb-date">{capitalize(today)}</div>
          </div>
          <PageAction page={page} setPage={setPage} />
        </div>
        <div className="content">
          {page === 'dashboard'    && <Dashboard    setPage={setPage} />}
          {page === 'calendario'   && <Calendario />}
          {page === 'turnos'       && <Turnos />}
          {page === 'alumnos'      && <Alumnos />}
          {page === 'instructores' && <Instructores />}
          {page === 'pagos'        && <Pagos />}
          {page === 'reportes'     && <Reportes />}
          {page === 'notif'        && <Notificaciones />}
        </div>
      </main>
    </div>
  )
}

function PageAction({ page, setPage }) {
  // Each page manages its own modals; this just provides top-level shortcut buttons
  const actions = {
    dashboard:    { label: '+ Nuevo turno',       event: 'open-turno' },
    turnos:       { label: '+ Nueva clase',        event: 'open-turno' },
    alumnos:      { label: '+ Nuevo alumno',       event: 'open-alumno' },
    instructores: { label: '+ Nuevo instructor',   event: 'open-instructor' },
    pagos:        { label: '+ Registrar pago',     event: 'open-pago' },
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
