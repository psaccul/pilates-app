import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useRol } from '../lib/useRol'
import Dashboard    from '../pages/Dashboard'
import Calendario   from '../pages/Calendario'
import Alumnos      from '../pages/Alumnos'
import Instructores from '../pages/Instructores'
import Pagos        from '../pages/Pagos'
import Reportes     from '../pages/Reportes'
import Finanzas     from '../pages/Finanzas'
import Modal        from './Modal'
import Avatar       from './Avatar'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// Administrador: acceso completo
// Instructor: calendario, alumnos (nuevo/editar), pagos
const PAGES_ADMIN = [
  { id:'dashboard',    label:'Dashboard',    icon:'◈' },
  { id:'calendario',   label:'Calendario',   icon:'◫' },
  { id:'alumnos',      label:'Alumnos',      icon:'◉' },
  { id:'instructores', label:'Instructores', icon:'◎' },
  { id:'pagos',        label:'Pagos',        icon:'◈' },
  { id:'reportes',     label:'Reportes',     icon:'◧' },
  { id:'finanzas',     label:'Finanzas',     icon:'◆' },
]

const PAGES_INSTRUCTOR = [
  { id:'calendario', label:'Calendario', icon:'◫' },
  { id:'alumnos',    label:'Alumnos',    icon:'◉' },
  { id:'pagos',      label:'Pagos',      icon:'◈' },
]

const PAGE_TITLES = {
  dashboard:'Buenos días ✦', calendario:'Calendario', alumnos:'Alumnos',
  instructores:'Instructores', pagos:'Pagos', reportes:'Reportes', finanzas:'Finanzas'
}

export default function Layout() {
  const { rol, esAdmin, esInstructor } = useRol()
  const [page, setPage]               = useState(esInstructor ? 'calendario' : 'dashboard')
  const [sidebarOpen, setSidebar]     = useState(false)
  const [notifOpen, setNotifOpen]     = useState(false)
  const [notifs, setNotifs]           = useState([])
  const notifRef                      = useRef(null)

  const [fichaId, setFichaId]         = useState(null)
  const [fichaData, setFichaData]     = useState(null)
  const [fichaEdit, setFichaEdit]     = useState(false)
  const [fichaSaving, setFichaSaving] = useState(false)
  const [fichaForm, setFichaForm]     = useState({})
  const [instructores, setInstructores] = useState([])

  const today = new Date().toLocaleDateString('es-AR',{ weekday:'long', day:'numeric', month:'long', year:'numeric' })
  const cap   = s => s.charAt(0).toUpperCase() + s.slice(1)
  const pages = rol === 'instructor' ? PAGES_INSTRUCTOR : PAGES_ADMIN

  useEffect(() => {
    if (rol === 'instructor' && page === 'dashboard') setPage('calendario')
  }, [rol])

  useEffect(() => {
    supabase.from('instructores').select('id,nombre,apellido').eq('activo',true)
      .then(({ data }) => setInstructores(data||[]))
    fetchNotifs()
    const t = setInterval(fetchNotifs, 120000)
    const h = e => abrirFicha(e.detail)
    window.addEventListener('open-ficha-alumno', h)
    const clickOut = e => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false) }
    document.addEventListener('mousedown', clickOut)
    return () => { clearInterval(t); window.removeEventListener('open-ficha-alumno', h); document.removeEventListener('mousedown', clickOut) }
  }, [])

  async function fetchNotifs() {
    const hoy = format(new Date(),'yyyy-MM-dd')
    const nuevas = []
    const { data: packs } = await supabase.from('packs').select('*, alumnos(nombre,apellido)').eq('activo',true)
    ;(packs||[]).forEach(pk => {
      const r = pk.clases_total - pk.clases_usadas
      if (r <= (pk.alerta_clases_restantes||2))
        nuevas.push({ tipo:'pack', icon:'📦', color:'#B03030', bg:'#FDECEA',
          titulo:'Pack por vencer',
          desc:`${pk.alumnos?.nombre} ${pk.alumnos?.apellido} — ${r} clase${r!==1?'s':''} restante${r!==1?'s':''}`,
          alumnoId: pk.alumno_id })
    })
    const { data: pagos } = await supabase.from('pagos').select('id,alumnos(nombre,apellido)').eq('pagado',false)
    if ((pagos||[]).length > 0)
      nuevas.push({ tipo:'pago', icon:'💳', color:'#7A5010', bg:'#FEF3E2',
        titulo:`${pagos.length} pago${pagos.length!==1?'s':''} pendiente${pagos.length!==1?'s':''}`,
        desc: pagos.slice(0,3).map(p=>`${p.alumnos?.nombre} ${p.alumnos?.apellido}`).join(', ')+(pagos.length>3?'…':'') })
    const { data: sinAviso } = await supabase.from('asistencias')
      .select('id,alumnos:alumno_id(nombre,apellido)').eq('estado_asistencia','ausente_sin_aviso').gte('created_at',hoy)
    if ((sinAviso||[]).length > 0)
      nuevas.push({ tipo:'ausencia', icon:'⚠', color:'#993C1D', bg:'#FAECE7',
        titulo:`${sinAviso.length} ausencia${sinAviso.length!==1?'s':''} sin aviso hoy`,
        desc: sinAviso.slice(0,2).map(a=>`${a.alumnos?.nombre} ${a.alumnos?.apellido}`).join(', ') })
    setNotifs(nuevas)
  }

  async function abrirFicha(alumnoId) {
    setFichaId(alumnoId); setFichaEdit(false)
    const { data } = await supabase.from('alumnos')
      .select('*, instructores(nombre,apellido), pagos(pagado,concepto,monto,medio), packs(nombre,clases_total,clases_usadas,activo)')
      .eq('id', alumnoId).single()
    setFichaData(data)
    setFichaForm({ nombre:data.nombre, apellido:data.apellido, telefono:data.telefono||'',
      plan:data.plan, instructor_id:data.instructor_id||'', notas:data.notas||'' })
  }

  async function guardarFicha() {
    setFichaSaving(true)
    await supabase.from('alumnos').update({
      nombre:fichaForm.nombre, apellido:fichaForm.apellido, telefono:fichaForm.telefono,
      plan:fichaForm.plan,
      instructor_id:fichaForm.instructor_id||null, notas:fichaForm.notas,
    }).eq('id', fichaData.id)
    setFichaSaving(false); setFichaEdit(false)
    abrirFicha(fichaData.id)
    window.dispatchEvent(new CustomEvent('alumno-actualizado'))
  }

  function navTo(p) { setPage(p); setSidebar(false) }
  const setFF = k => e => setFichaForm(f=>({...f,[k]:e.target.value}))

  return (
    <div className="layout">
      <div className={`sidebar-overlay${sidebarOpen?' open':''}`} onClick={() => setSidebar(false)} />

      <aside className={`sidebar${sidebarOpen?' open':''}`}>
        <div className="logo" style={{padding:'10px 8px',textAlign:'center'}}>
          <img src="/logo.png" alt="CEI Pilates Reformer" style={{width:'100%'}}/>
        </div>
        <nav>
          {pages.map(p => (
            <div key={p.id} className={`nav-item${page===p.id?' active':''}`} onClick={() => navTo(p.id)}>
              <span style={{fontSize:13}}>{p.icon}</span> {p.label}
            </div>
          ))}
        </nav>
        <div className="sidebar-btm">
          <div className="adm-row">
            <div className="adm-av" style={{background: esInstructor ? 'linear-gradient(135deg,#4A6FA5,#2C4A7A)' : undefined}}>
              {esInstructor ? 'IN' : 'AD'}
            </div>
            <div>
              <div className="adm-name">{esInstructor ? 'Instructor' : 'Administrador'}</div>
              <div style={{fontSize:9, color:'rgba(255,255,255,0.3)', marginTop:1}}>
                {esInstructor ? 'Acceso limitado' : 'Acceso completo'}
              </div>
            </div>
          </div>
          <button onClick={() => supabase.auth.signOut()}
            style={{marginTop:10,fontSize:11,color:'rgba(255,255,255,0.3)',background:'none',border:'none',cursor:'pointer',paddingLeft:36}}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
            <button className="hamburger" onClick={() => setSidebar(o=>!o)}>
              <span style={{transform:sidebarOpen?'rotate(45deg) translate(4px,4px)':'none'}}/>
              <span style={{opacity:sidebarOpen?0:1}}/>
              <span style={{transform:sidebarOpen?'rotate(-45deg) translate(4px,-4px)':'none'}}/>
            </button>
            <div style={{minWidth:0}}>
              <div className="tb-title" style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                {PAGE_TITLES[page]}
              </div>
              <div className="tb-date">{cap(today)}</div>
            </div>
          </div>

          <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
            <PageAction page={page} />
            {/* Campana */}
            <div className="notif-bell" ref={notifRef} onClick={() => setNotifOpen(o=>!o)} style={{position:'relative'}}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--sl)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {notifs.length > 0 && <div className="notif-badge">{notifs.length}</div>}
              {notifOpen && (
                <div className="notif-dropdown">
                  <div className="notif-drop-header">
                    <span>Notificaciones</span>
                    <span style={{fontSize:11,color:'var(--sl-m)'}}>{notifs.length} alerta{notifs.length!==1?'s':''}</span>
                  </div>
                  {notifs.length===0 && <div className="empty" style={{padding:'18px'}}>Sin alertas nuevas</div>}
                  {notifs.map((n,i) => (
                    <div key={i} className="notif-item" style={{cursor:n.alumnoId?'pointer':'default'}}
                      onClick={() => { if(n.alumnoId){ setNotifOpen(false); abrirFicha(n.alumnoId) } }}>
                      <div className="notif-ic" style={{background:n.bg,fontSize:13}}>{n.icon}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div className="notif-title" style={{color:n.color}}>{n.titulo}</div>
                        <div className="notif-desc" style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{n.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="content">
          {page==='dashboard'    && <Dashboard    setPage={navTo} esAdmin={esAdmin} />}
          {page==='calendario'   && <Calendario   esAdmin={esAdmin} />}
          {page==='alumnos'      && <Alumnos      esAdmin={esAdmin} />}
          {page==='instructores' && esAdmin && <Instructores />}
          {page==='pagos'        && <Pagos esAdmin={esAdmin} />}
          {page==='reportes'     && esAdmin && <Reportes />}
          {page==='finanzas'     && esAdmin && <Finanzas />}
        </div>
      </main>

      {/* FICHA GLOBAL ALUMNO */}
      {fichaId && fichaData && (
        <Modal
          title={fichaEdit?'Editar alumno':`${fichaData.nombre} ${fichaData.apellido}`}
          onClose={() => { setFichaId(null); setFichaData(null); setFichaEdit(false) }}
          footer={fichaEdit?(
            <><button className="btn-sec" onClick={() => setFichaEdit(false)}>Cancelar</button>
              <button className="btn-pri" onClick={guardarFicha} disabled={fichaSaving}>{fichaSaving?'Guardando…':'Guardar'}</button></>
          ):(
            <><button className="btn-sec" onClick={() => { setFichaId(null); setFichaData(null) }}>Cerrar</button>
              <button className="btn-pri" onClick={() => setFichaEdit(true)}>Editar</button></>
          )}>
          {!fichaEdit ? (
            <>
              <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:16}}>
                <Avatar nombre={fichaData.nombre} apellido={fichaData.apellido} size={44} fontSize={14} />
                <div>
                  <div style={{fontSize:16,fontWeight:500}}>{fichaData.nombre} {fichaData.apellido}</div>
                  <div style={{fontSize:11,color:'var(--sl-m)',marginTop:2}}>
                    {fichaData.plan==='mensual'?'Plan mensual':fichaData.plan==='pack'?'Pack prepago':'Clases sueltas'}
                  </div>
                </div>
              </div>
              <table style={{width:'100%',fontSize:13,borderCollapse:'collapse'}}>
                {[['Teléfono',fichaData.telefono||'—'],['Instructor',fichaData.instructores?`${fichaData.instructores.nombre} ${fichaData.instructores.apellido}`:'—'],['Pagos',`${(fichaData.pagos||[]).filter(p=>p.pagado).length} pagados · ${(fichaData.pagos||[]).filter(p=>!p.pagado).length} pendientes`]].map(([k,v])=>(
                  <tr key={k} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'7px 0',color:'var(--sl-m)',width:'36%'}}>{k}</td>
                    <td style={{padding:'7px 0'}}>{v}</td>
                  </tr>
                ))}
              </table>
              {(fichaData.packs||[]).filter(p=>p.activo).map(pk=>{
                const r=pk.clases_total-pk.clases_usadas; const pct=Math.round((pk.clases_usadas/pk.clases_total)*100)
                return (<div key={pk.id} style={{marginTop:10,padding:'9px 12px',background:r<=2?'#FDECEA':'#E4F4EE',borderRadius:8}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,fontWeight:500}}>
                    <span>Pack: {pk.nombre}</span>
                    <span style={{color:r<=2?'#B03030':'#2D7A5A',fontFamily:'var(--font-num)'}}>{r} clase{r!==1?'s':''} restante{r!==1?'s':''}</span>
                  </div>
                  <div style={{marginTop:5,height:4,background:'rgba(0,0,0,0.08)',borderRadius:99,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${pct}%`,background:r<=2?'#E24B4A':'#48A999',borderRadius:99}}/>
                  </div>
                </div>)
              })}
              {fichaData.notas&&<div style={{marginTop:10,padding:'10px 12px',background:'var(--sl-l)',borderRadius:8}}>
                <div style={{fontSize:10,color:'var(--sl-m)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Notas / Patologías</div>
                <div style={{fontSize:13,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{fichaData.notas}</div>
              </div>}
            </>
          ) : (
            <>
              <div className="form-row2">
                <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Nombre</label><input className="form-inp" value={fichaForm.nombre} onChange={setFF('nombre')}/></div>
                <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Apellido</label><input className="form-inp" value={fichaForm.apellido} onChange={setFF('apellido')}/></div>
              </div>
              <div className="form-row" style={{marginTop:12}}><label className="form-lbl">Teléfono</label><input className="form-inp" value={fichaForm.telefono} onChange={setFF('telefono')} placeholder="+54 9 ..."/></div>
              <div className="form-row"><label className="form-lbl">Plan</label><select className="form-inp" value={fichaForm.plan} onChange={setFF('plan')}><option value="mensual">Plan mensual</option><option value="pack">Pack prepago</option><option value="sueltas">Clases sueltas</option></select></div>
              <div className="form-row"><label className="form-lbl">Instructor</label><select className="form-inp" value={fichaForm.instructor_id} onChange={setFF('instructor_id')}><option value="">Sin asignar</option>{instructores.map(i=><option key={i.id} value={i.id}>{i.nombre} {i.apellido}</option>)}</select></div>
              <div className="form-row"><label className="form-lbl">Notas / Patologías</label><textarea className="form-inp" value={fichaForm.notas} onChange={setFF('notas')} placeholder="Ej: Hernia lumbar L4-L5..."/></div>
            </>
          )}
        </Modal>
      )}
    </div>
  )
}

function PageAction({ page }) {
  const actions = { dashboard:{label:'+ Turno',event:'open-turno'}, alumnos:{label:'+ Alumno',event:'open-alumno'}, instructores:{label:'+ Instructor',event:'open-instructor'}, pagos:{label:'+ Pago',event:'open-pago'} }
  const a = actions[page]
  if (!a) return null
  return <button className="btn-pri" onClick={() => window.dispatchEvent(new CustomEvent(a.event))}>{a.label}</button>
}
