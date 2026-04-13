import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Avatar from '../components/Avatar'
import Modal from '../components/Modal'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const COLORES = ['var(--mg)','var(--blue)','var(--teal)','var(--purple)']

export default function Dashboard({ setPage }) {
  const [stats, setStats]     = useState({ clases:0, alumnos:0, asistencia:0, pendientes:0 })
  const [clases, setClases]   = useState([])
  const [alumnos, setAlumnos] = useState([])
  const [loading, setLoading] = useState(true)

  const [panelClases, setPanelClases]   = useState(false)
  const [panelAlumnos, setPanelAlumnos] = useState(false)
  const [panelAsist, setPanelAsist]     = useState(false)
  const [panelPagos, setPanelPagos]     = useState(false)

  const [todosAlumnos, setTodosAlumnos] = useState([])
  const [pagosPend, setPagosPend]       = useState([])
  const [asistMes, setAsistMes]         = useState([])
  const [clasesDetalle, setClasesDetalle] = useState([])
  const [loadingPanel, setLoadingPanel] = useState(false)

  const today     = format(new Date(), 'yyyy-MM-dd')
  const mesInicio = format(new Date(), 'yyyy-MM-01')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [
      { data: clasesHoy },
      { data: alumnosData },
      { data: pagosData },
      { data: asistData },
    ] = await Promise.all([
      supabase.from('clases')
        .select('*, instructores(nombre,apellido), asistencias(id,alumno_id,asistio,estado_asistencia,alumnos(nombre,apellido))')
        .eq('fecha', today).order('hora'),
      supabase.from('alumnos')
        .select('*, instructores(nombre,apellido), pagos(pagado)')
        .eq('activo', true).order('created_at', {ascending:false}).limit(5),
      supabase.from('pagos').select('pagado'),
      supabase.from('asistencias').select('asistio').eq('asistio', true),
    ])
    setClases(clasesHoy || [])
    setAlumnos(alumnosData || [])
    setStats({
      clases:     clasesHoy?.length || 0,
      alumnos:    (alumnosData||[]).length,
      asistencia: (asistData||[]).length,
      pendientes: (pagosData||[]).filter(p=>!p.pagado).length,
    })
    setLoading(false)
  }

  async function abrirPanelClases() {
    setPanelClases(true)
    setLoadingPanel(true)
    const { data } = await supabase.from('clases')
      .select('*, instructores(nombre,apellido), asistencias(id,alumno_id,asistio,estado_asistencia,alumnos(nombre,apellido))')
      .eq('fecha', today).order('hora')
    setClasesDetalle(data || [])
    setLoadingPanel(false)
  }

  async function abrirPanelAlumnos() {
    setPanelAlumnos(true)
    setLoadingPanel(true)
    const { data } = await supabase.from('alumnos')
      .select('*, instructores(nombre,apellido), pagos(pagado)')
      .eq('activo', true).order('apellido')
    setTodosAlumnos(data || [])
    setLoadingPanel(false)
  }

  async function abrirPanelPagos() {
    setPanelPagos(true)
    setLoadingPanel(true)
    const { data } = await supabase.from('pagos')
      .select('*, alumnos(nombre,apellido)')
      .eq('pagado', false).order('created_at', {ascending:false})
    setPagosPend(data || [])
    setLoadingPanel(false)
  }

  async function abrirPanelAsist() {
    setPanelAsist(true)
    setLoadingPanel(true)
    const { data } = await supabase.from('asistencias')
      .select('*, clases(nombre,fecha,hora), alumnos:alumno_id(nombre,apellido)')
      .eq('asistio', true).gte('created_at', mesInicio)
      .order('created_at', {ascending:false}).limit(40)
    setAsistMes(data || [])
    setLoadingPanel(false)
  }

  async function marcarPagado(pagoId) {
    await supabase.from('pagos').update({ pagado:true, fecha_pago:today }).eq('id', pagoId)
    setPagosPend(prev => prev.filter(p => p.id !== pagoId))
    setStats(s => ({...s, pendientes: Math.max(0, s.pendientes-1)}))
  }

  function resumen(clase) {
    const asis = clase.asistencias || []
    return {
      total:      asis.length,
      presentes:  asis.filter(a => a.estado_asistencia === 'presente').length,
      conAviso:   asis.filter(a => a.estado_asistencia === 'ausente_con_aviso').length,
      sinAviso:   asis.filter(a => a.estado_asistencia === 'ausente_sin_aviso').length,
      pendientes: asis.filter(a => !a.estado_asistencia || a.estado_asistencia === 'pendiente').length,
    }
  }

  function estadoPago(alumno) {
    const pagos = alumno.pagos || []
    if (pagos.length === 0) return 'sin-pago'
    if (pagos.some(p => !p.pagado)) return 'pendiente'
    return 'ok'
  }

  // Contar alertas del día
  const alertasSinAviso = clases.reduce((sum, c) => {
    return sum + (c.asistencias||[]).filter(a => a.estado_asistencia === 'ausente_sin_aviso').length
  }, 0)

  if (loading) return <div className="loading">Cargando…</div>

  return (
    <>
      {/* Alerta del día */}
      {alertasSinAviso > 0 && (
        <div style={{
          padding:'10px 16px', background:'#FDECEA', border:'1px solid #F09595',
          borderRadius:10, fontSize:12, color:'#B03030', marginBottom:16,
          display:'flex', alignItems:'center', gap:10
        }}>
          <span style={{fontSize:16}}>⚠</span>
          <span>Hay <strong>{alertasSinAviso} ausencia{alertasSinAviso>1?'s':''} sin aviso</strong> hoy. Revisalas en el calendario o en "Clases hoy".</span>
          <button className="btn-sec" style={{fontSize:11, marginLeft:'auto', color:'#B03030', borderColor:'#F09595'}}
            onClick={abrirPanelClases}>Ver →</button>
        </div>
      )}

      {/* STATS */}
      <div className="stats">
        <div className="sc" style={{'--acc':'var(--mg)', cursor:'pointer'}} onClick={abrirPanelClases}>
          <div className="sc-lbl">Clases hoy</div>
          <div className="sc-val">{stats.clases}</div>
          <div className="sc-sub" style={{color:'var(--mg)'}}>Ver detalle →</div>
        </div>
        <div className="sc" style={{'--acc':'var(--blue)', cursor:'pointer'}} onClick={abrirPanelAlumnos}>
          <div className="sc-lbl">Alumnos activos</div>
          <div className="sc-val">{stats.alumnos}</div>
          <div className="sc-sub" style={{color:'var(--blue)'}}>Ver todos →</div>
        </div>
        <div className="sc" style={{'--acc':'var(--teal)', cursor:'pointer'}} onClick={abrirPanelAsist}>
          <div className="sc-lbl">Asistencias del mes</div>
          <div className="sc-val">{stats.asistencia}</div>
          <div className="sc-sub" style={{color:'var(--teal)'}}>Ver historial →</div>
        </div>
        <div className="sc" style={{'--acc':'var(--purple)', cursor:'pointer'}} onClick={abrirPanelPagos}>
          <div className="sc-lbl">Pagos pendientes</div>
          <div className="sc-val">{stats.pendientes}</div>
          <div className="sc-sub" style={{color: stats.pendientes>0 ? '#B03030' : 'var(--sl-m)'}}>
            {stats.pendientes>0 ? 'Revisar →' : 'Todo al día'}
          </div>
        </div>
      </div>

      {/* AGENDA + ALUMNOS */}
      <div className="grid2">
        <div className="panel">
          <div className="ph">
            <span className="ph-title">Agenda de hoy</span>
            <button className="ph-link" onClick={() => setPage('calendario')}>Ver calendario →</button>
          </div>
          {clases.length === 0 && <div className="empty">No hay clases programadas para hoy</div>}
          {clases.map((c,i) => {
            const res = resumen(c)
            const [hh,mm] = c.hora.split(':')
            return (
              <div key={c.id} className="si" onClick={abrirPanelClases}>
                <div className="t-col"><div className="t-h">{hh}</div><div className="t-m">:{mm}</div></div>
                <div className="dot" style={{'--dc': COLORES[i%COLORES.length]}} />
                <div className="ci">
                  <div className="cn">{c.nombre}</div>
                  <div className="cm">{c.instructores ? `${c.instructores.nombre} ${c.instructores.apellido}` : '—'} · {c.sala||''}</div>
                </div>
                <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2}}>
                  <span className={`bdg ${c.tipo==='grupal'?'bdg-g':'bdg-i'}`}>{c.tipo==='grupal'?'Grupal':'Individual'}</span>
                  {res.total > 0 && (
                    <span style={{fontSize:9, color:'var(--sl-m)'}}>
                      {res.presentes}✓ {res.conAviso>0?`${res.conAviso}⚠`:''} {res.sinAviso>0?<span style={{color:'#B03030'}}>{res.sinAviso}✗</span>:''}
                    </span>
                  )}
                </div>
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
                  <div className="ap">{a.plan==='mensual'?'Plan mensual':'Clases sueltas'}{a.frecuencia?` · ${a.frecuencia}`:''}</div>
                </div>
                <span className={`est ${ep==='ok'?'e-ok':ep==='pendiente'?'e-pe':'e-ve'}`} style={{marginLeft:'auto'}}>
                  {ep==='ok'?'Al día':ep==='pendiente'?'Pendiente':'Sin pago'}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* MODAL: Clases de hoy con detalle de asistencia */}
      {panelClases && (
        <Modal title={`Clases de hoy — ${format(new Date(),"d 'de' MMMM",{locale:es})}`}
          onClose={() => setPanelClases(false)}
          footer={<>
            <button className="btn-sec" onClick={() => { setPanelClases(false); setPage('calendario') }}>Ir al calendario →</button>
            <button className="btn-pri" onClick={() => setPanelClases(false)}>Cerrar</button>
          </>}>
          {loadingPanel ? <div className="loading">Cargando…</div>
            : clasesDetalle.length === 0
              ? <div className="empty">No hay clases hoy</div>
              : clasesDetalle.map(c => {
                const res = resumen(c)
                return (
                  <div key={c.id} style={{marginBottom:16, paddingBottom:16, borderBottom:'1px solid var(--border)'}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
                      <div>
                        <div style={{fontWeight:500, fontSize:14}}>{c.nombre}</div>
                        <div style={{fontSize:11, color:'var(--sl-m)', marginTop:1}}>
                          {c.hora?.slice(0,5)} · {c.instructores?`${c.instructores.nombre} ${c.instructores.apellido}`:'—'} · {c.sala}
                        </div>
                      </div>
                      <div style={{display:'flex', gap:6}}>
                        {res.presentes>0 && <span style={{fontSize:10, padding:'2px 7px', borderRadius:6, background:'#E4F4EE', color:'#2D7A5A'}}>✓ {res.presentes}</span>}
                        {res.conAviso>0  && <span style={{fontSize:10, padding:'2px 7px', borderRadius:6, background:'#FEF3E2', color:'#7A5010'}}>⚠ {res.conAviso}</span>}
                        {res.sinAviso>0  && <span style={{fontSize:10, padding:'2px 7px', borderRadius:6, background:'#FDECEA', color:'#B03030'}}>✗ {res.sinAviso}</span>}
                        {res.pendientes>0 && <span style={{fontSize:10, padding:'2px 7px', borderRadius:6, background:'var(--sl-l)', color:'var(--sl-m)'}}>○ {res.pendientes}</span>}
                      </div>
                    </div>
                    {(c.asistencias||[]).map(a => {
                      const estado = a.estado_asistencia || 'pendiente'
                      const color = estado==='presente'?'#2D7A5A':estado==='ausente_con_aviso'?'#7A5010':estado==='ausente_sin_aviso'?'#B03030':'var(--sl-m)'
                      const icono = estado==='presente'?'✓':estado==='ausente_con_aviso'?'⚠':estado==='ausente_sin_aviso'?'✗':'○'
                      return (
                        <div key={a.id} style={{display:'flex', alignItems:'center', gap:8, padding:'5px 0', fontSize:12}}>
                          <span style={{fontSize:13, color, fontWeight:500, minWidth:14}}>{icono}</span>
                          <Avatar nombre={a.alumnos?.nombre||'?'} apellido={a.alumnos?.apellido||''} size={20} fontSize={7} />
                          <span>{a.alumnos?.nombre} {a.alumnos?.apellido}</span>
                          {a.recuperacion && <span style={{fontSize:9, padding:'1px 5px', background:'#FEF3E2', color:'#7A5010', borderRadius:3}}>REC</span>}
                        </div>
                      )
                    })}
                    {(c.asistencias||[]).length===0 && <div style={{fontSize:11, color:'var(--sl-m)'}}>Sin alumnos asignados</div>}
                  </div>
                )
              })
          }
        </Modal>
      )}

      {/* MODAL: Todos los alumnos */}
      {panelAlumnos && (
        <Modal title={`Alumnos activos (${todosAlumnos.length})`}
          onClose={() => setPanelAlumnos(false)}
          footer={<>
            <button className="btn-sec" onClick={() => { setPanelAlumnos(false); setPage('alumnos') }}>Ir a alumnos →</button>
            <button className="btn-pri" onClick={() => setPanelAlumnos(false)}>Cerrar</button>
          </>}>
          {loadingPanel ? <div className="loading">Cargando…</div>
            : todosAlumnos.map(a => {
              const ep = estadoPago(a)
              return (
                <div key={a.id} style={{display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)'}}>
                  <Avatar nombre={a.nombre} apellido={a.apellido} size={26} fontSize={9} />
                  <div style={{flex:1}}>
                    <div style={{fontSize:13, fontWeight:500}}>{a.nombre} {a.apellido}</div>
                    <div style={{fontSize:11, color:'var(--sl-m)'}}>{a.instructores?`${a.instructores.nombre} ${a.instructores.apellido}`:'—'} · {a.plan==='mensual'?'Plan mensual':'Clases sueltas'}</div>
                  </div>
                  <span className={`est ${ep==='ok'?'e-ok':ep==='pendiente'?'e-pe':'e-ve'}`}>
                    {ep==='ok'?'Al día':ep==='pendiente'?'Pendiente':'Sin pago'}
                  </span>
                </div>
              )
            })
          }
        </Modal>
      )}

      {/* MODAL: Asistencias del mes */}
      {panelAsist && (
        <Modal title={`Asistencias — ${format(new Date(),'MMMM yyyy',{locale:es})}`}
          onClose={() => setPanelAsist(false)}
          footer={<button className="btn-pri" onClick={() => setPanelAsist(false)}>Cerrar</button>}>
          {loadingPanel ? <div className="loading">Cargando…</div>
            : asistMes.length===0
              ? <div className="empty">Sin asistencias este mes</div>
              : asistMes.map(a => (
                <div key={a.id} style={{padding:'7px 0', borderBottom:'1px solid var(--border)', fontSize:12}}>
                  <div style={{fontWeight:500}}>{a.alumnos?.nombre} {a.alumnos?.apellido}</div>
                  <div style={{color:'var(--sl-m)', marginTop:1}}>
                    {a.clases?.nombre} · {a.clases?.fecha ? format(new Date(a.clases.fecha+'T00:00:00'),'dd/MM',{locale:es}) : '—'} {a.clases?.hora?.slice(0,5)}
                  </div>
                </div>
              ))
          }
        </Modal>
      )}

      {/* MODAL: Pagos pendientes */}
      {panelPagos && (
        <Modal title={`Pagos pendientes (${pagosPend.length})`}
          onClose={() => setPanelPagos(false)}
          footer={<>
            <button className="btn-sec" onClick={() => { setPanelPagos(false); setPage('pagos') }}>Ir a pagos →</button>
            <button className="btn-pri" onClick={() => setPanelPagos(false)}>Cerrar</button>
          </>}>
          {loadingPanel ? <div className="loading">Cargando…</div>
            : pagosPend.length===0
              ? <div className="empty" style={{color:'var(--teal)'}}>¡Todo al día!</div>
              : pagosPend.map(p => (
                <div key={p.id} style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 0', borderBottom:'1px solid var(--border)'}}>
                  <div>
                    <div style={{fontSize:13, fontWeight:500}}>{p.alumnos?.nombre} {p.alumnos?.apellido}</div>
                    <div style={{fontSize:11, color:'var(--sl-m)', marginTop:1}}>
                      {p.concepto} · {p.monto?`$${Number(p.monto).toLocaleString('es-AR')}`:'—'} ·&nbsp;
                      <span className={p.medio==='efectivo'?'tag-ef':p.medio==='mercadopago'?'tag-mp':'tag-tr'}>
                        {p.medio==='efectivo'?'Efectivo':p.medio==='mercadopago'?'Mercado Pago':'Transferencia'}
                      </span>
                    </div>
                  </div>
                  <button className="btn-pri" style={{fontSize:11, padding:'4px 12px'}}
                    onClick={() => marcarPagado(p.id)}>Marcar pagado</button>
                </div>
              ))
          }
        </Modal>
      )}
    </>
  )
}
