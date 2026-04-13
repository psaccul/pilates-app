import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

const COLORS = ['#C0396B','#48A999','#4A6FA5','#9B6BBB']

export default function Reportes() {
  const [mes, setMes]           = useState(format(new Date(),'yyyy-MM'))
  const [asistPorDia, setAsistPorDia] = useState([])
  const [porInstructor, setPorInstructor] = useState([])
  const [resumen, setResumen]   = useState({ clases:0, asistencias:0, promedioDia:0, diaPico:'' })
  const [loading, setLoading]   = useState(true)

  useEffect(() => { fetchReporte() }, [mes])

  async function fetchReporte() {
    setLoading(true)
    const mesDate  = parseISO(mes + '-01')
    const inicio   = format(startOfMonth(mesDate), 'yyyy-MM-dd')
    const fin      = format(endOfMonth(mesDate),   'yyyy-MM-dd')

    const [{ data: clases }, { data: asistencias }] = await Promise.all([
      supabase.from('clases')
        .select('id, fecha, instructores(nombre,apellido)')
        .gte('fecha', inicio).lte('fecha', fin),
      supabase.from('asistencias')
        .select('id, asistio, clase_id, clases(fecha)')
        .eq('asistio', true)
    ])

    // Asistencias por día
    const dias = eachDayOfInterval({ start: startOfMonth(mesDate), end: endOfMonth(mesDate) })
    const porDia = dias.map(d => {
      const key = format(d, 'yyyy-MM-dd')
      const count = (asistencias || []).filter(a => a.clases?.fecha === key).length
      return { dia: format(d,'d'), fecha: key, asistencias: count }
    }).filter(d => {
      // show only days that have classes
      return (clases||[]).some(c => c.fecha === d.fecha) || d.asistencias > 0
    })
    setAsistPorDia(porDia)

    // Por instructor
    const instrMap = {}
    ;(clases || []).forEach(c => {
      if (!c.instructores) return
      const nombre = `${c.instructores.nombre} ${c.instructores.apellido}`
      instrMap[nombre] = (instrMap[nombre] || 0) + 1
    })
    setPorInstructor(Object.entries(instrMap).map(([name, value]) => ({ name, value })))

    // Resumen
    const totalAsist = (asistencias || []).length
    const picoObj    = porDia.reduce((max, d) => d.asistencias > (max?.asistencias||0) ? d : max, null)
    setResumen({
      clases:      (clases||[]).length,
      asistencias: totalAsist,
      promedioDia: porDia.length ? Math.round(totalAsist / porDia.length) : 0,
      diaPico:     picoObj ? picoObj.dia : '—',
    })
    setLoading(false)
  }

  // generate months list (last 12)
  const meses = Array.from({ length: 12 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    return format(d, 'yyyy-MM')
  })

  return (
    <>
      <div style={{marginBottom:16, display:'flex', alignItems:'center', gap:12}}>
        <label style={{fontSize:12, color:'var(--sl-m)'}}>Mes:</label>
        <select className="form-inp" style={{width:180}} value={mes} onChange={e => setMes(e.target.value)}>
          {meses.map(m => (
            <option key={m} value={m}>
              {format(parseISO(m+'-01'), 'MMMM yyyy', { locale: es })}
            </option>
          ))}
        </select>
      </div>

      {loading ? <div className="loading">Cargando…</div> : (
        <>
          {/* Resumen */}
          <div className="stats" style={{marginBottom:20}}>
            <div className="sc" style={{'--acc':'var(--mg)'}}>
              <div className="sc-lbl">Clases dadas</div>
              <div className="sc-val">{resumen.clases}</div>
            </div>
            <div className="sc" style={{'--acc':'var(--teal)'}}>
              <div className="sc-lbl">Asistencias</div>
              <div className="sc-val">{resumen.asistencias}</div>
            </div>
            <div className="sc" style={{'--acc':'var(--blue)'}}>
              <div className="sc-lbl">Promedio por día</div>
              <div className="sc-val">{resumen.promedioDia}</div>
            </div>
            <div className="sc" style={{'--acc':'var(--purple)'}}>
              <div className="sc-lbl">Día más activo</div>
              <div className="sc-val">{resumen.diaPico}</div>
            </div>
          </div>

          <div className="grid2" style={{marginBottom:18}}>
            {/* Barras asistencia */}
            <div className="panel">
              <div className="ph"><span className="ph-title">Asistencias por día</span></div>
              <div style={{padding:'18px 10px 10px'}}>
                {asistPorDia.length === 0
                  ? <div className="empty">Sin datos este mes</div>
                  : (
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={asistPorDia} barSize={14}>
                        <XAxis dataKey="dia" tick={{fontSize:10, fill:'var(--sl-m)'}} axisLine={false} tickLine={false} />
                        <YAxis tick={{fontSize:10, fill:'var(--sl-m)'}} axisLine={false} tickLine={false} width={24} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{fontSize:11,borderRadius:8,border:'1px solid var(--border)',boxShadow:'none'}}
                          formatter={v => [v, 'Asistencias']}
                          labelFormatter={l => `Día ${l}`}
                        />
                        <Bar dataKey="asistencias" fill="var(--mg)" radius={[4,4,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )
                }
              </div>
            </div>

            {/* Torta por instructor */}
            <div className="panel">
              <div className="ph"><span className="ph-title">Clases por instructor</span></div>
              <div style={{padding:'18px 10px 10px'}}>
                {porInstructor.length === 0
                  ? <div className="empty">Sin datos este mes</div>
                  : (
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie data={porInstructor} cx="50%" cy="50%" innerRadius={45} outerRadius={65}
                          paddingAngle={3} dataKey="value">
                          {porInstructor.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{fontSize:11,borderRadius:8,border:'1px solid var(--border)'}}
                          formatter={(v,n) => [v+' clases', n]}
                        />
                        <Legend iconType="circle" iconSize={8}
                          formatter={v => <span style={{fontSize:11}}>{v}</span>} />
                      </PieChart>
                    </ResponsiveContainer>
                  )
                }
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
