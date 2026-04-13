import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Avatar from '../components/Avatar'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export default function Dashboard({ setPage }) {
  const [stats, setStats]   = useState({ clases: 0, alumnos: 0, asistencia: 0, pendientes: 0 })
  const [clases, setClases] = useState([])
  const [alumnos, setAlumnos] = useState([])
  const [loading, setLoading] = useState(true)

  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)
    const [
      { data: clasesHoy },
      { data: alumnosData },
      { data: pagosData },
      { data: asistData },
    ] = await Promise.all([
      supabase.from('clases').select('*, instructores(nombre,apellido)').eq('fecha', today).order('hora'),
      supabase.from('alumnos').select('*, instructores(nombre,apellido), pagos(pagado)').eq('activo', true).order('created_at', { ascending: false }).limit(5),
      supabase.from('pagos').select('pagado'),
      supabase.from('asistencias').select('asistio').eq('asistio', true),
    ])

    const pendientes = (pagosData || []).filter(p => !p.pagado).length
    const totalAlumnos = alumnosData?.length || 0

    setClases(clasesHoy || [])
    setAlumnos(alumnosData || [])
    setStats({
      clases: clasesHoy?.length || 0,
      alumnos: totalAlumnos,
      asistencia: asistData?.length || 0,
      pendientes,
    })
    setLoading(false)
  }

  function estadoPago(alumno) {
    const pagos = alumno.pagos || []
    if (pagos.length === 0) return 'sin-pago'
    if (pagos.some(p => !p.pagado)) return 'pendiente'
    return 'ok'
  }

  if (loading) return <div className="loading">Cargando…</div>

  return (
    <>
      <div className="stats">
        <div className="sc" style={{'--acc':'var(--mg)'}}>
          <div className="sc-lbl">Clases hoy</div>
          <div className="sc-val">{stats.clases}</div>
          <div className="sc-sub">programadas para hoy</div>
        </div>
        <div className="sc" style={{'--acc':'var(--blue)'}}>
          <div className="sc-lbl">Alumnos activos</div>
          <div className="sc-val">{stats.alumnos}</div>
        </div>
        <div className="sc" style={{'--acc':'var(--teal)'}}>
          <div className="sc-lbl">Asistencias totales</div>
          <div className="sc-val">{stats.asistencia}</div>
        </div>
        <div className="sc" style={{'--acc':'var(--purple)'}}>
          <div className="sc-lbl">Pagos pendientes</div>
          <div className="sc-val">{stats.pendientes}</div>
          <div className="sc-sub">revisar esta semana</div>
        </div>
      </div>

      <div className="grid2">
        <div className="panel">
          <div className="ph">
            <span className="ph-title">Agenda de hoy</span>
            <button className="ph-link" onClick={() => setPage('turnos')}>Ver semana →</button>
          </div>
          {clases.length === 0 && <div className="empty">No hay clases programadas para hoy</div>}
          {clases.map((c, i) => {
            const colors = ['var(--mg)','var(--blue)','var(--teal)','var(--purple)']
            const dc = colors[i % colors.length]
            const [hh, mm] = c.hora.split(':')
            return (
              <div key={c.id} className="si">
                <div className="t-col"><div className="t-h">{hh}</div><div className="t-m">:{mm}</div></div>
                <div className="dot" style={{'--dc':dc}} />
                <div className="ci">
                  <div className="cn">{c.nombre}</div>
                  <div className="cm">
                    {c.instructores ? `${c.instructores.nombre} ${c.instructores.apellido}` : '—'} · {c.sala || 'Sala'}
                  </div>
                </div>
                <span className={`bdg ${c.tipo==='grupal'?'bdg-g':'bdg-i'}`}>
                  {c.tipo === 'grupal' ? 'Grupal' : 'Individual'}
                </span>
              </div>
            )
          })}
        </div>

        <div className="panel">
          <div className="ph">
            <span className="ph-title">Alumnos recientes</span>
            <button className="ph-link" onClick={() => setPage('alumnos')}>Ver todos →</button>
          </div>
          {alumnos.map(a => {
            const ep = estadoPago(a)
            return (
              <div key={a.id} className="ai">
                <Avatar nombre={a.nombre} apellido={a.apellido} />
                <div>
                  <div className="an">{a.nombre} {a.apellido}</div>
                  <div className="ap">{a.plan === 'mensual' ? 'Plan mensual' : 'Clases sueltas'}{a.frecuencia ? ` · ${a.frecuencia}` : ''}</div>
                </div>
                <span className={`est ${ep==='ok'?'e-ok':ep==='pendiente'?'e-pe':'e-ve'}`} style={{marginLeft:'auto'}}>
                  {ep==='ok'?'Al día':ep==='pendiente'?'Pendiente':'Sin pago'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
