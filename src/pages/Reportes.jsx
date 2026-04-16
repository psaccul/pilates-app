import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts'
import { format, startOfMonth, endOfMonth, eachWeekOfInterval, startOfWeek, endOfWeek, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

const COLORS = ['#C0396B','#48A999','#4A6FA5','#9B6BBB']

export default function Reportes({ esGerente }) {
  const [tab, setTab]       = useState('asistencia')
  const [mes, setMes]       = useState(format(new Date(),'yyyy-MM'))
  const [loading, setLoading] = useState(true)
  const printRef = useRef()

  // Asistencia
  const [asistPorDia, setAsistPorDia]         = useState([])
  const [asistPorSemana, setAsistPorSemana]   = useState([])
  const [porInstructor, setPorInstructor]     = useState([])
  const [resumen, setResumen]                 = useState({ clases:0, asistencias:0, promedioDia:0, diaPico:'' })

  // Alumnos
  const [alumnosReport, setAlumnosReport]     = useState([])

  useEffect(() => { fetchReporte() }, [mes, tab])

  async function fetchReporte() {
    setLoading(true)
    const mesDate  = parseISO(mes+'-01')
    const inicio   = format(startOfMonth(mesDate),'yyyy-MM-dd')
    const fin      = format(endOfMonth(mesDate),  'yyyy-MM-dd')

    if (tab === 'asistencia') {
      const [{ data: clases }, { data: asistencias }] = await Promise.all([
        supabase.from('clases').select('id,fecha,tipo,instructores(nombre,apellido)').gte('fecha',inicio).lte('fecha',fin),
        supabase.from('asistencias').select('id,asistio,estado_asistencia,clase_id,clases(fecha)').eq('asistio',true),
      ])

      // Por día
      const diasSet = {}
      ;(clases||[]).forEach(c => { if (!diasSet[c.fecha]) diasSet[c.fecha] = 0 })
      ;(asistencias||[]).forEach(a => {
        if (a.clases?.fecha && a.clases.fecha >= inicio && a.clases.fecha <= fin)
          diasSet[a.clases.fecha] = (diasSet[a.clases.fecha]||0) + 1
      })
      const diasArr = Object.entries(diasSet)
        .sort(([a],[b]) => a.localeCompare(b))
        .map(([fecha,count]) => ({ dia:format(new Date(fecha+'T00:00:00'),'d',{locale:es}), fecha, asistencias:count }))
      setAsistPorDia(diasArr)

      // Por semana
      const semanas = eachWeekOfInterval({start:startOfMonth(mesDate),end:endOfMonth(mesDate)},{weekStartsOn:1})
      const semArr = semanas.map((semStart,i) => {
        const semEnd = endOfWeek(semStart,{weekStartsOn:1})
        const count = (asistencias||[]).filter(a => {
          const f = a.clases?.fecha
          if (!f) return false
          return f >= format(semStart,'yyyy-MM-dd') && f <= format(semEnd,'yyyy-MM-dd')
        }).length
        return { semana:`Sem ${i+1}`, asistencias:count }
      })
      setAsistPorSemana(semArr)

      // Por instructor
      const instrMap = {}
      ;(clases||[]).forEach(c => {
        const nombre = c.instructores ? `${c.instructores.nombre} ${c.instructores.apellido}` : 'Sin asignar'
        instrMap[nombre] = (instrMap[nombre]||0) + 1
      })
      setPorInstructor(Object.entries(instrMap).map(([name,value]) => ({name,value})))

      const totalAsist = (asistencias||[]).filter(a => a.clases?.fecha >= inicio && a.clases?.fecha <= fin).length
      const picoObj = diasArr.reduce((max,d) => d.asistencias>(max?.asistencias||0)?d:max, null)
      setResumen({
        clases: (clases||[]).length,
        asistencias: totalAsist,
        promedioDia: diasArr.length ? Math.round(totalAsist/diasArr.length) : 0,
        diaPico: picoObj ? picoObj.dia : '—',
      })
    }

    if (tab === 'alumnos') {
      const { data: als } = await supabase.from('alumnos')
        .select('*, instructores(nombre,apellido), pagos(pagado,monto,concepto), asistencias(asistio,estado_asistencia,recuperacion)')
        .eq('activo',true).order('apellido')
      setAlumnosReport(als||[])
    }

    setLoading(false)
  }

  function estadoPago(alumno) {
    const p = alumno.pagos||[]
    if (p.length===0) return { label:'Sin registro', cls:'e-ve', deudor:true }
    if (p.some(x=>!x.pagado)) return { label:'Deudor', cls:'e-ve', deudor:true }
    return { label:'Al día', cls:'e-ok', deudor:false }
  }

  function handlePrint() {
    window.print()
  }

  const meses = Array.from({length:12},(_,i)=>{
    const d = new Date(); d.setMonth(d.getMonth()-i)
    return format(d,'yyyy-MM')
  })

  return (
    <>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:10}}>
        <div className="tabs" style={{marginBottom:0}}>
          <div className={`tab${tab==='asistencia'?' active':''}`} onClick={() => setTab('asistencia')}>Asistencia</div>
          <div className={`tab${tab==='alumnos'?' active':''}`} onClick={() => setTab('alumnos')}>Estado alumnos</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <select className="form-inp" style={{width:170}} value={mes} onChange={e => setMes(e.target.value)}>
            {meses.map(m => (
              <option key={m} value={m}>{format(parseISO(m+'-01'),'MMMM yyyy',{locale:es})}</option>
            ))}
          </select>
          <button className="btn-sec" onClick={handlePrint} style={{fontSize:12}}>🖨 Imprimir</button>
        </div>
      </div>

      {loading ? <div className="loading">Cargando…</div> : (
        <div ref={printRef}>

          {/* ===== ASISTENCIA ===== */}
          {tab === 'asistencia' && (
            <>
              <div className="stats">
                <div className="sc" style={{'--acc':'var(--mg)'}}>
                  <div className="sc-lbl">Clases dadas</div>
                  <div className="sc-val">{resumen.clases}</div>
                </div>
                <div className="sc" style={{'--acc':'var(--teal)'}}>
                  <div className="sc-lbl">Asistencias</div>
                  <div className="sc-val">{resumen.asistencias}</div>
                </div>
                <div className="sc" style={{'--acc':'var(--blue)'}}>
                  <div className="sc-lbl">Promedio/día</div>
                  <div className="sc-val">{resumen.promedioDia}</div>
                </div>
                <div className="sc" style={{'--acc':'var(--purple)'}}>
                  <div className="sc-lbl">Día más activo</div>
                  <div className="sc-val">{resumen.diaPico}</div>
                </div>
              </div>

              <div className="grid2" style={{marginBottom:18}}>
                <div className="panel">
                  <div className="ph"><span className="ph-title">Asistencias por día</span></div>
                  <div style={{padding:'18px 10px 10px'}}>
                    {asistPorDia.length===0 ? <div className="empty">Sin datos</div> : (
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={asistPorDia} barSize={12}>
                          <XAxis dataKey="dia" tick={{fontSize:10,fill:'var(--sl-m)'}} axisLine={false} tickLine={false} />
                          <YAxis tick={{fontSize:10,fill:'var(--sl-m)'}} axisLine={false} tickLine={false} width={24} allowDecimals={false} />
                          <Tooltip contentStyle={{fontSize:11,borderRadius:8,border:'1px solid var(--border)'}}
                            formatter={v=>[v,'Asistencias']} labelFormatter={l=>`Día ${l}`} />
                          <Bar dataKey="asistencias" fill="var(--mg)" radius={[4,4,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                <div className="panel">
                  <div className="ph"><span className="ph-title">Asistencias por semana</span></div>
                  <div style={{padding:'18px 10px 10px'}}>
                    {asistPorSemana.length===0 ? <div className="empty">Sin datos</div> : (
                      <ResponsiveContainer width="100%" height={160}>
                        <LineChart data={asistPorSemana}>
                          <XAxis dataKey="semana" tick={{fontSize:10,fill:'var(--sl-m)'}} axisLine={false} tickLine={false} />
                          <YAxis tick={{fontSize:10,fill:'var(--sl-m)'}} axisLine={false} tickLine={false} width={24} allowDecimals={false} />
                          <Tooltip contentStyle={{fontSize:11,borderRadius:8}} formatter={v=>[v,'Asistencias']} />
                          <Line type="monotone" dataKey="asistencias" stroke="var(--teal)" strokeWidth={2} dot={{fill:'var(--teal)',r:4}} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="ph"><span className="ph-title">Clases por instructor</span></div>
                <div style={{padding:'18px 10px 10px'}}>
                  {porInstructor.length===0 ? <div className="empty">Sin datos</div> : (
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie data={porInstructor} cx="50%" cy="50%" innerRadius={45} outerRadius={65}
                          paddingAngle={3} dataKey="value">
                          {porInstructor.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{fontSize:11,borderRadius:8}} formatter={(v,n)=>[`${v} clases`,n]} />
                        <Legend iconType="circle" iconSize={8} formatter={v=><span style={{fontSize:11}}>{v}</span>} />
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
                <span className="ph-title">Estado general de alumnos — {format(parseISO(mes+'-01'),'MMMM yyyy',{locale:es})}</span>
                <span style={{fontSize:11,color:'var(--sl-m)'}}>{alumnosReport.length} alumnos</span>
              </div>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Alumno</th><th>Plan</th><th>Instructor</th>
                    <th>Asistencias</th><th>Ausencias c/aviso</th><th>A recuperar</th>
                    <th>Estado pago</th>
                  </tr>
                </thead>
                <tbody>
                  {alumnosReport.length===0 && <tr><td colSpan={7} className="empty">Sin datos</td></tr>}
                  {alumnosReport.map(a => {
                    const ep = estadoPago(a)
                    const asis    = (a.asistencias||[])
                    const presentes  = asis.filter(x=>x.asistio).length
                    const conAviso   = asis.filter(x=>x.estado_asistencia==='ausente_con_aviso').length
                    const aRecuperar = asis.filter(x=>x.estado_asistencia==='ausente_con_aviso' && !x.recuperacion).length
                    return (
                      <tr key={a.id} style={ep.deudor?{background:'#FFF5F5'}:{}}>
                        <td>
                          <div style={{cursor:'pointer',color:'var(--mg)',fontWeight:500}}
                            onClick={() => window.dispatchEvent(new CustomEvent('open-ficha-alumno',{detail:a.id}))}>
                            {a.nombre} {a.apellido}
                          </div>
                        </td>
                        <td>{a.plan==='mensual'?'Mensual':a.plan==='pack'?'Pack':'Sueltas'}</td>
                        <td style={{fontSize:11}}>{a.instructores?`${a.instructores.nombre} ${a.instructores.apellido}`:'—'}</td>
                        <td style={{textAlign:'center',fontWeight:500}}>{presentes}</td>
                        <td style={{textAlign:'center'}}>{conAviso>0?<span style={{color:'#7A5010',fontWeight:500}}>{conAviso}</span>:'—'}</td>
                        <td style={{textAlign:'center'}}>
                          {aRecuperar>0
                            ? <span style={{background:'#FEF3E2',color:'#7A5010',padding:'2px 8px',borderRadius:6,fontSize:11,fontWeight:500}}>{aRecuperar}</span>
                            : '—'
                          }
                        </td>
                        <td>
                          <span className={`est ${ep.cls}`} style={ep.deudor?{fontSize:11,fontWeight:700}:{fontSize:11}}>
                            {ep.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>
      )}

      <style>{`
        @media print {
          .sidebar, .topbar, .tabs, .btn-sec, .btn-pri { display: none !important; }
          .content { padding: 0 !important; }
          .panel { break-inside: avoid; }
        }
      `}</style>
    </>
  )
}
