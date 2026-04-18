import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts'
import { format, startOfMonth, endOfMonth, eachWeekOfInterval, startOfWeek, endOfWeek, parseISO, getDaysInMonth } from 'date-fns'
import { es } from 'date-fns/locale'

const COLORS = ['#C0396B','#48A999','#4A6FA5','#9B6BBB']
const NIVEL_COL = { A:{bg:'#E4F4EE',text:'#2D7A5A'}, B:{bg:'#E6F1FB',text:'#185FA5'}, C:{bg:'#F0EAF8',text:'#6A3A8A'} }

export default function Reportes({ esAdmin }) {
  const [tab, setTab]       = useState('cumplimiento')
  const [mes, setMes]       = useState(format(new Date(),'yyyy-MM'))
  const [loading, setLoading] = useState(true)

  const [asistPorDia, setAsistPorDia]       = useState([])
  const [asistPorSemana, setAsistPorSemana] = useState([])
  const [porInstructor, setPorInstructor]   = useState([])
  const [resumen, setResumen]               = useState({ clases:0, asistencias:0, promedioDia:0, diaPico:'' })
  const [alumnosReport, setAlumnosReport]   = useState([])
  const [cumplimiento, setCumplimiento]     = useState([])

  useEffect(() => { fetchReporte() }, [mes, tab])

  async function fetchReporte() {
    setLoading(true)
    const mesDate = parseISO(mes+'-01')
    const inicio  = format(startOfMonth(mesDate),'yyyy-MM-dd')
    const fin     = format(endOfMonth(mesDate),  'yyyy-MM-dd')

    if (tab === 'asistencia') {
      const [{ data: clases }, { data: asistencias }] = await Promise.all([
        supabase.from('clases').select('id,fecha,tipo,instructores(nombre,apellido)').gte('fecha',inicio).lte('fecha',fin),
        supabase.from('asistencias').select('id,asistio,estado_asistencia,clase_id,clases(fecha)').eq('asistio',true),
      ])
      const diasSet = {}
      ;(clases||[]).forEach(c => { if (!diasSet[c.fecha]) diasSet[c.fecha] = 0 })
      ;(asistencias||[]).forEach(a => {
        if (a.clases?.fecha >= inicio && a.clases?.fecha <= fin)
          diasSet[a.clases.fecha] = (diasSet[a.clases.fecha]||0) + 1
      })
      const diasArr = Object.entries(diasSet).sort(([a],[b])=>a.localeCompare(b))
        .map(([fecha,count]) => ({ dia:format(new Date(fecha+'T00:00:00'),'d',{locale:es}), fecha, asistencias:count }))
      setAsistPorDia(diasArr)

      const semanas = eachWeekOfInterval({start:startOfMonth(mesDate),end:endOfMonth(mesDate)},{weekStartsOn:1})
      setAsistPorSemana(semanas.map((sw,i) => {
        const se = endOfWeek(sw,{weekStartsOn:1})
        const count = (asistencias||[]).filter(a => a.clases?.fecha >= format(sw,'yyyy-MM-dd') && a.clases?.fecha <= format(se,'yyyy-MM-dd')).length
        return { semana:`Sem ${i+1}`, asistencias:count }
      }))

      const instrMap = {}
      ;(clases||[]).forEach(c => {
        const n = c.instructores ? `${c.instructores.nombre} ${c.instructores.apellido}` : 'Sin asignar'
        instrMap[n] = (instrMap[n]||0) + 1
      })
      setPorInstructor(Object.entries(instrMap).map(([name,value])=>({name,value})))

      const totalAsist = (asistencias||[]).filter(a=>a.clases?.fecha>=inicio&&a.clases?.fecha<=fin).length
      const picoObj = diasArr.reduce((max,d)=>d.asistencias>(max?.asistencias||0)?d:max,null)
      setResumen({ clases:(clases||[]).length, asistencias:totalAsist, promedioDia:diasArr.length?Math.round(totalAsist/diasArr.length):0, diaPico:picoObj?picoObj.dia:'—' })
    }

    if (tab === 'alumnos') {
      const { data: als } = await supabase.from('alumnos')
        .select('*, instructores(nombre,apellido), pagos(pagado,monto), asistencias(asistio,estado_asistencia,recuperacion)')
        .eq('activo',true).order('apellido')
      setAlumnosReport(als||[])
    }

    if (tab === 'cumplimiento') {
      // Calcular semanas del mes
      const diasMes   = getDaysInMonth(mesDate)
      const semansMes = Math.ceil(diasMes / 7)  // ~4 semanas

      const { data: als } = await supabase.from('alumnos')
        .select('id,nombre,apellido,nivel,plan,clases_semana,instructores(nombre,apellido)')
        .eq('activo',true).order('apellido')

      // Para cada alumno, contar asistencias reales en el mes
      const alumnosIds = (als||[]).map(a=>a.id)
      const { data: asisData } = await supabase.from('asistencias')
        .select('alumno_id,asistio,estado_asistencia,clases(fecha)')
        .in('alumno_id', alumnosIds.length>0?alumnosIds:['none'])
        .eq('asistio', true)

      const asistPorAlumno = {}
      ;(asisData||[]).forEach(a => {
        const f = a.clases?.fecha
        if (f && f >= inicio && f <= fin) {
          asistPorAlumno[a.alumno_id] = (asistPorAlumno[a.alumno_id]||0) + 1
        }
      })

      const data = (als||[]).map(a => {
        const csem       = a.clases_semana || 2
        const esperadas  = csem * semansMes        // total esperado en el mes
        const realizadas = asistPorAlumno[a.id] || 0
        const faltantes  = Math.max(0, esperadas - realizadas)
        const pct        = esperadas > 0 ? Math.round((realizadas / esperadas) * 100) : 0
        return { ...a, esperadas, realizadas, faltantes, pct }
      })

      setCumplimiento(data)
    }

    setLoading(false)
  }

  function estadoPago(alumno) {
    const p = alumno.pagos||[]
    if (p.length===0) return { label:'Sin registro', cls:'e-ve', deudor:true }
    if (p.some(x=>!x.pagado)) return { label:'Deudor', cls:'e-ve', deudor:true }
    return { label:'Al día', cls:'e-ok', deudor:false }
  }

  const meses = Array.from({length:12},(_,i)=>{ const d=new Date(); d.setMonth(d.getMonth()-i); return format(d,'yyyy-MM') })

  return (
    <>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:10}}>
        <div className="tabs" style={{marginBottom:0}}>
          <div className={`tab${tab==='cumplimiento'?' active':''}`} onClick={() => setTab('cumplimiento')}>Cumplimiento mensual</div>
          <div className={`tab${tab==='asistencia'?' active':''}`} onClick={() => setTab('asistencia')}>Asistencia</div>
          <div className={`tab${tab==='alumnos'?' active':''}`} onClick={() => setTab('alumnos')}>Estado alumnos</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <select className="form-inp" style={{width:170}} value={mes} onChange={e=>setMes(e.target.value)}>
            {meses.map(m=><option key={m} value={m}>{format(parseISO(m+'-01'),'MMMM yyyy',{locale:es})}</option>)}
          </select>
          <button className="btn-sec" onClick={() => window.print()} style={{fontSize:12}}>🖨 Imprimir</button>
        </div>
      </div>

      {loading ? <div className="loading">Cargando…</div> : (
        <>
          {/* ===== CUMPLIMIENTO MENSUAL ===== */}
          {tab === 'cumplimiento' && (
            <>
              {/* Resumen rápido */}
              {(() => {
                const completos   = cumplimiento.filter(a=>a.pct>=100).length
                const incompletos = cumplimiento.filter(a=>a.pct>0&&a.pct<100).length
                const sinClases   = cumplimiento.filter(a=>a.realizadas===0).length
                return (
                  <div className="stats" style={{gridTemplateColumns:'repeat(3,1fr)',marginBottom:16}}>
                    <div className="sc" style={{'--acc':'var(--teal)'}}>
                      <div className="sc-lbl">Completaron el plan</div>
                      <div className="sc-val">{completos}</div>
                      <div className="sc-sub">{completos>0?`${Math.round(completos/cumplimiento.length*100)}% del total`:''}</div>
                    </div>
                    <div className="sc" style={{'--acc':'var(--mg)'}}>
                      <div className="sc-lbl">Incompletos</div>
                      <div className="sc-val">{incompletos}</div>
                      <div className="sc-sub">faltan clases</div>
                    </div>
                    <div className="sc" style={{'--acc':'#E24B4A'}}>
                      <div className="sc-lbl">Sin asistencia</div>
                      <div className="sc-val">{sinClases}</div>
                      <div className="sc-sub">0 clases en el mes</div>
                    </div>
                  </div>
                )
              })()}

              <div className="panel">
                <div className="ph">
                  <span className="ph-title">Cumplimiento — {format(parseISO(mes+'-01'),'MMMM yyyy',{locale:es})}</span>
                  <span style={{fontSize:11,color:'var(--sl-m)'}}>{cumplimiento.length} alumnos</span>
                </div>
                <div className="tbl-wrap">
                  <table className="tbl" style={{minWidth:620}}>
                    <thead>
                      <tr>
                        <th style={{position:'sticky',left:0,background:'var(--sl-l)',zIndex:2}}>Alumno</th>
                        <th>Nivel</th>
                        <th>Instructor</th>
                        <th style={{textAlign:'center'}}>Esperadas</th>
                        <th style={{textAlign:'center'}}>Realizadas</th>
                        <th style={{textAlign:'center'}}>Faltantes</th>
                        <th style={{minWidth:120}}>Cumplimiento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cumplimiento.length===0&&<tr><td colSpan={7} className="empty">Sin datos</td></tr>}
                      {cumplimiento
                        .sort((a,b)=>a.pct-b.pct)  // ordenar por menor cumplimiento primero
                        .map(a => {
                          const color = a.pct>=100?'#2D7A5A':a.pct>=60?'#7A5010':'#B03030'
                          const bgBar = a.pct>=100?'#48A999':a.pct>=60?'#D4A020':'#E24B4A'
                          return (
                            <tr key={a.id} style={{background:a.realizadas===0?'#FFF5F5':a.pct>=100?'#F6FBF8':'var(--white)'}}>
                              <td className="col-sticky">
                                <span style={{fontWeight:500,cursor:'pointer',color:'var(--mg)'}}
                                  onClick={() => window.dispatchEvent(new CustomEvent('open-ficha-alumno',{detail:a.id}))}>
                                  {a.nombre} {a.apellido}
                                </span>
                              </td>
                              <td>
                                {a.nivel && <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:99,...NIVEL_COL[a.nivel]}}>{a.nivel}</span>}
                              </td>
                              <td style={{fontSize:11,color:'var(--sl-m)',whiteSpace:'nowrap'}}>{a.instructores?`${a.instructores.nombre} ${a.instructores.apellido}`:'—'}</td>
                              <td style={{textAlign:'center',fontFamily:'var(--font-num)',fontWeight:500}}>{a.esperadas}</td>
                              <td style={{textAlign:'center',fontFamily:'var(--font-num)',fontWeight:700,color:color}}>{a.realizadas}</td>
                              <td style={{textAlign:'center',fontFamily:'var(--font-num)',color:a.faltantes>0?'#B03030':'#2D7A5A',fontWeight:a.faltantes>0?600:400}}>
                                {a.faltantes>0?`-${a.faltantes}`:'✓'}
                              </td>
                              <td>
                                <div style={{display:'flex',alignItems:'center',gap:8}}>
                                  <div style={{flex:1,height:6,background:'var(--sl-l)',borderRadius:99,overflow:'hidden',minWidth:60}}>
                                    <div style={{height:'100%',width:`${Math.min(100,a.pct)}%`,background:bgBar,borderRadius:99,transition:'width 0.3s'}}/>
                                  </div>
                                  <span style={{fontSize:11,fontWeight:600,color,fontFamily:'var(--font-num)',minWidth:32,textAlign:'right'}}>{a.pct}%</span>
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      }
                    </tbody>
                  </table>
                </div>

                {/* Nota al pie */}
                <div style={{padding:'10px 16px',fontSize:11,color:'var(--sl-m)',borderTop:'1px solid var(--border)'}}>
                  Esperadas = clases/semana × semanas del mes. Los alumnos con menor cumplimiento aparecen primero.
                  Los marcados en rojo no tuvieron ninguna asistencia este mes.
                </div>
              </div>
            </>
          )}

          {/* ===== ASISTENCIA ===== */}
          {tab === 'asistencia' && (
            <>
              <div className="stats">
                <div className="sc" style={{'--acc':'var(--mg)'}}><div className="sc-lbl">Clases dadas</div><div className="sc-val">{resumen.clases}</div></div>
                <div className="sc" style={{'--acc':'var(--teal)'}}><div className="sc-lbl">Asistencias</div><div className="sc-val">{resumen.asistencias}</div></div>
                <div className="sc" style={{'--acc':'var(--blue)'}}><div className="sc-lbl">Promedio/día</div><div className="sc-val">{resumen.promedioDia}</div></div>
                <div className="sc" style={{'--acc':'var(--purple)'}}><div className="sc-lbl">Día más activo</div><div className="sc-val">{resumen.diaPico}</div></div>
              </div>
              <div className="grid2" style={{marginBottom:16}}>
                <div className="panel">
                  <div className="ph"><span className="ph-title">Por día</span></div>
                  <div style={{padding:'14px 8px 8px'}}>
                    {asistPorDia.length===0?<div className="empty">Sin datos</div>:(
                      <ResponsiveContainer width="100%" height={150}>
                        <BarChart data={asistPorDia} barSize={12}>
                          <XAxis dataKey="dia" tick={{fontSize:10,fill:'var(--sl-m)'}} axisLine={false} tickLine={false}/>
                          <YAxis tick={{fontSize:10,fill:'var(--sl-m)'}} axisLine={false} tickLine={false} width={22} allowDecimals={false}/>
                          <Tooltip contentStyle={{fontSize:11,borderRadius:8,border:'1px solid var(--border)'}} formatter={v=>[v,'Asistencias']} labelFormatter={l=>`Día ${l}`}/>
                          <Bar dataKey="asistencias" fill="var(--mg)" radius={[4,4,0,0]}/>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
                <div className="panel">
                  <div className="ph"><span className="ph-title">Por semana</span></div>
                  <div style={{padding:'14px 8px 8px'}}>
                    {asistPorSemana.length===0?<div className="empty">Sin datos</div>:(
                      <ResponsiveContainer width="100%" height={150}>
                        <LineChart data={asistPorSemana}>
                          <XAxis dataKey="semana" tick={{fontSize:10,fill:'var(--sl-m)'}} axisLine={false} tickLine={false}/>
                          <YAxis tick={{fontSize:10,fill:'var(--sl-m)'}} axisLine={false} tickLine={false} width={22} allowDecimals={false}/>
                          <Tooltip contentStyle={{fontSize:11,borderRadius:8}} formatter={v=>[v,'Asistencias']}/>
                          <Line type="monotone" dataKey="asistencias" stroke="var(--teal)" strokeWidth={2} dot={{fill:'var(--teal)',r:4}}/>
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>
              <div className="panel">
                <div className="ph"><span className="ph-title">Clases por instructor</span></div>
                <div style={{padding:'14px 8px 8px'}}>
                  {porInstructor.length===0?<div className="empty">Sin datos</div>:(
                    <ResponsiveContainer width="100%" height={150}>
                      <PieChart>
                        <Pie data={porInstructor} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3} dataKey="value">
                          {porInstructor.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                        </Pie>
                        <Tooltip contentStyle={{fontSize:11,borderRadius:8}} formatter={(v,n)=>[`${v} clases`,n]}/>
                        <Legend iconType="circle" iconSize={8} formatter={v=><span style={{fontSize:10}}>{v}</span>}/>
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ===== ESTADO ALUMNOS ===== */}
          {tab === 'alumnos' && (
            <div className="panel">
              <div className="ph">
                <span className="ph-title">Estado general — {format(parseISO(mes+'-01'),'MMMM yyyy',{locale:es})}</span>
                <span style={{fontSize:11,color:'var(--sl-m)'}}>{alumnosReport.length} alumnos</span>
              </div>
              <div className="tbl-wrap">
                <table className="tbl" style={{minWidth:640}}>
                  <thead>
                    <tr>
                      <th style={{position:'sticky',left:0,background:'var(--sl-l)',zIndex:2}}>Alumno</th>
                      <th>Plan</th><th>Instructor</th>
                      <th style={{textAlign:'center'}}>Asistencias</th>
                      <th style={{textAlign:'center'}}>A recuperar</th>
                      <th>Estado pago</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alumnosReport.length===0&&<tr><td colSpan={6} className="empty">Sin datos</td></tr>}
                    {alumnosReport.map(a=>{
                      const ep=estadoPago(a)
                      const presentes=(a.asistencias||[]).filter(x=>x.asistio).length
                      const aRec=(a.asistencias||[]).filter(x=>x.estado_asistencia==='ausente_con_aviso').length
                      return(
                        <tr key={a.id} style={ep.deudor?{background:'#FFF5F5'}:{}}>
                          <td className="col-sticky">
                            <span style={{fontWeight:500,cursor:'pointer',color:'var(--mg)'}} onClick={() => window.dispatchEvent(new CustomEvent('open-ficha-alumno',{detail:a.id}))}>{a.nombre} {a.apellido}</span>
                          </td>
                          <td style={{whiteSpace:'nowrap'}}>{a.plan==='mensual'?'Mensual':a.plan==='pack'?'Pack':'Sueltas'}</td>
                          <td style={{fontSize:11,whiteSpace:'nowrap'}}>{a.instructores?`${a.instructores.nombre} ${a.instructores.apellido}`:'—'}</td>
                          <td style={{textAlign:'center',fontWeight:500,fontFamily:'var(--font-num)'}}>{presentes}</td>
                          <td style={{textAlign:'center'}}>
                            {aRec>0?<span style={{background:'#FEF3E2',color:'#7A5010',padding:'2px 8px',borderRadius:6,fontSize:11,fontWeight:500}}>{aRec}</span>:'—'}
                          </td>
                          <td><span className={`est ${ep.cls}`}>{ep.label}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <style>{`@media print { .sidebar,.topbar,.tabs,.btn-sec,.btn-pri,.hamburger,.notif-bell{display:none!important} .content{padding:0!important} .panel{break-inside:avoid} .layout{height:auto;overflow:visible} .main{overflow:visible} }`}</style>
    </>
  )
}
