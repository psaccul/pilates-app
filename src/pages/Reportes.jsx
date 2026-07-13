import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts'
import { format, startOfMonth, endOfMonth, eachWeekOfInterval, startOfWeek, endOfWeek, parseISO, getDaysInMonth } from 'date-fns'
import { es } from 'date-fns/locale'

const COLORS = ['#C0396B','#48A999','#4A6FA5','#9B6BBB']

export default function Reportes() {
  const [tab, setTab]     = useState('facturacion')
  const [mes, setMes]     = useState(format(new Date(),'yyyy-MM'))
  const [loading, setLoading] = useState(true)

  const [asistPorDia, setAsistPorDia]       = useState([])
  const [asistPorSemana, setAsistPorSemana] = useState([])
  const [porInstructor, setPorInstructor]   = useState([])
  const [resumen, setResumen]               = useState({ clases:0, asistencias:0, promedioDia:0, diaPico:'' })
  const [alumnosReport, setAlumnosReport]   = useState([])
  const [cumplimiento, setCumplimiento]     = useState([])
  const [reporteInstructores, setReporteInstructores] = useState([])
  const [facturacion, setFacturacion]       = useState({ alumnos:[], total:0, porPlan:{} })
  const [diferencias, setDiferencias]       = useState([])

  useEffect(() => { fetchReporte() }, [mes, tab])

  async function fetchReporte() {
    setLoading(true)
    const mesDate = parseISO(mes+'-01')
    const inicio  = format(startOfMonth(mesDate),'yyyy-MM-dd')
    const fin     = format(endOfMonth(mesDate),  'yyyy-MM-dd')

    if (tab === 'facturacion') {
      const [{ data: als }, { data: cfg }] = await Promise.all([
        supabase.from('alumnos').select('id,nombre,apellido,plan,nivel,clases_semana,instructor_id,instructores(nombre,apellido),horarios_alumno(instructor_id,instructores(nombre))').eq('activo',true).order('apellido'),
        supabase.from('configuracion').select('precio_mensual,precio_prepago,precio_sueltas,precio_individual,precio_mensual_1,precio_mensual_2,precio_mensual_3,precio_mensual_4,precio_mensual_5').eq('id',1).maybeSingle(),
      ])
      const alumnosConMonto = (als||[]).map(a => {
        let monto = 0
        if (a.plan==='mensual')     monto = Number(cfg?.[`precio_mensual_${a.clases_semana||2}`]||0)
        else if (a.plan==='pack')        monto = Number(cfg?.precio_prepago||0)
        else if (a.plan==='sueltas')     monto = Number(cfg?.precio_sueltas||0)
        else if (a.plan==='individual')  monto = Number(cfg?.precio_individual||0)
        return { ...a, monto }
      })
      const porPlan = {
        mensual: alumnosConMonto.filter(a=>a.plan==='mensual'),
        pack:    alumnosConMonto.filter(a=>a.plan==='pack'),
        sueltas: alumnosConMonto.filter(a=>a.plan==='sueltas'),
      }
      const total = alumnosConMonto.reduce((s,a)=>s+a.monto,0)
      setFacturacion({ alumnos:alumnosConMonto, total, porPlan })
    }

    if (tab === 'cumplimiento') {
      const diasMes   = getDaysInMonth(mesDate)
      const semansMes = Math.ceil(diasMes/7)
      const { data: als } = await supabase.from('alumnos')
        .select('id,nombre,apellido,nivel,plan,clases_semana,instructor_id,instructores(nombre,apellido),horarios_alumno(instructor_id,instructores(nombre))')
        .eq('activo',true).order('apellido')
      const alumnosIds = (als||[]).map(a=>a.id)
      const { data: asisData } = await supabase.from('asistencias')
        .select('alumno_id,asistio,clases(fecha)')
        .in('alumno_id', alumnosIds.length>0?alumnosIds:['none'])
        .eq('asistio',true)
      const asistPorAlumno = {}
      ;(asisData||[]).forEach(a => {
        const f = a.clases?.fecha
        if (f && f>=inicio && f<=fin)
          asistPorAlumno[a.alumno_id] = (asistPorAlumno[a.alumno_id]||0)+1
      })
      setCumplimiento((als||[]).map(a => {
        const csem=a.clases_semana||2, esperadas=csem*semansMes
        const realizadas=asistPorAlumno[a.id]||0
        return { ...a, esperadas, realizadas, faltantes:Math.max(0,esperadas-realizadas), pct:esperadas>0?Math.round((realizadas/esperadas)*100):0 }
      }))
    }

    if (tab === 'instructores') {
      const { data: ins } = await supabase.from('instructores').select('id,nombre,apellido').eq('activo',true).order('apellido')
      const { data: clases } = await supabase.from('clases')
        .select('id,nombre,fecha,instructor_id,asistencias(id,estado_asistencia,motivo_cancelacion)')
        .gte('fecha',inicio).lte('fecha',fin)
      setReporteInstructores((ins||[]).map(inst => {
        const miClases=(clases||[]).filter(c=>c.instructor_id===inst.id)
        let dadas=0, canceladas=0
        const motivosConteo={cambio_instructor:0,baja_instituto:0,sin_motivo:0,otro:0}
        miClases.forEach(c => {
          const asis=c.asistencias||[]
          if (asis.length===0){dadas++;return}
          if (asis.some(a=>a.estado_asistencia==='presente')){dadas++}
          else{
            canceladas++
            asis.forEach(a=>{
              if (a.motivo_cancelacion&&motivosConteo[a.motivo_cancelacion]!==undefined) motivosConteo[a.motivo_cancelacion]++
              else if(a.motivo_cancelacion) motivosConteo.otro++
            })
          }
        })
        return { ...inst, total:miClases.length, dadas, canceladas, motivosConteo }
      }))
    }

    if (tab === 'asistencia') {
      const [{ data: clases }, { data: asistencias }] = await Promise.all([
        supabase.from('clases').select('id,fecha,tipo,instructores(nombre,apellido)').gte('fecha',inicio).lte('fecha',fin),
        supabase.from('asistencias').select('id,asistio,clase_id,clases(fecha)').eq('asistio',true),
      ])
      const diasSet={}
      ;(clases||[]).forEach(c=>{ if(!diasSet[c.fecha]) diasSet[c.fecha]=0 })
      ;(asistencias||[]).forEach(a=>{ if(a.clases?.fecha>=inicio&&a.clases?.fecha<=fin) diasSet[a.clases.fecha]=(diasSet[a.clases.fecha]||0)+1 })
      const diasArr=Object.entries(diasSet).sort(([a],[b])=>a.localeCompare(b)).map(([fecha,count])=>({ dia:format(new Date(fecha+'T00:00:00'),'d',{locale:es}), fecha, asistencias:count }))
      setAsistPorDia(diasArr)
      const semanas=eachWeekOfInterval({start:startOfMonth(mesDate),end:endOfMonth(mesDate)},{weekStartsOn:1})
      setAsistPorSemana(semanas.map((sw,i)=>{
        const se=endOfWeek(sw,{weekStartsOn:1})
        return { semana:`Sem ${i+1}`, asistencias:(asistencias||[]).filter(a=>a.clases?.fecha>=format(sw,'yyyy-MM-dd')&&a.clases?.fecha<=format(se,'yyyy-MM-dd')).length }
      }))
      const instrMap={}
      ;(clases||[]).forEach(c=>{ const n=c.instructores?`${c.instructores.nombre} ${c.instructores.apellido}`:'Sin asignar'; instrMap[n]=(instrMap[n]||0)+1 })
      setPorInstructor(Object.entries(instrMap).map(([name,value])=>({name,value})))
      const totalAsist=(asistencias||[]).filter(a=>a.clases?.fecha>=inicio&&a.clases?.fecha<=fin).length
      const picoObj=diasArr.reduce((max,d)=>d.asistencias>(max?.asistencias||0)?d:max,null)
      setResumen({ clases:(clases||[]).length, asistencias:totalAsist, promedioDia:diasArr.length?Math.round(totalAsist/diasArr.length):0, diaPico:picoObj?picoObj.dia:'—' })
    }

    if (tab === 'diferencias') {
      const [{ data: pgs }, { data: cfg }] = await Promise.all([
        supabase.from('pagos')
          .select('id,alumno_id,monto,periodo,fecha_pago,pagado,alumnos(nombre,apellido,plan,clases_semana)')
          .eq('periodo', mes)
          .not('monto','is',null)
          .order('fecha_pago',{ascending:false}),
        supabase.from('configuracion').select('precio_mensual_1,precio_mensual_2,precio_mensual_3,precio_mensual_4,precio_mensual_5,precio_prepago,precio_sueltas').eq('id',1).maybeSingle(),
      ])
      const conDif = (pgs||[]).map(p => {
        const a = p.alumnos
        let esperado = null
        if (a?.plan==='mensual')  esperado = Number(cfg?.[`precio_mensual_${a.clases_semana||2}`]||0)||null
        else if (a?.plan==='pack')    esperado = Number(cfg?.precio_prepago||0)||null
        else if (a?.plan==='sueltas') esperado = Number(cfg?.precio_sueltas||0)||null
        const dif = esperado!==null ? Number(p.monto)-esperado : null
        return { ...p, esperado, dif }
      }).filter(p => p.dif!==null && p.dif!==0)
      setDiferencias(conDif)
    }

    if (tab === 'alumnos') {
      const { data: als } = await supabase.from('alumnos')
        .select('*, instructor_id, instructores(nombre,apellido), horarios_alumno(instructor_id,instructores(nombre)), pagos(pagado,monto), asistencias(asistio,estado_asistencia)')
        .eq('activo',true).order('apellido')
      setAlumnosReport(als||[])
    }

    setLoading(false)
  }

  function mostrarInstructores(alumno) {
    const map = new Map()
    if (alumno.instructor_id && alumno.instructores)
      map.set(alumno.instructor_id, alumno.instructores.nombre)
    ;(alumno.horarios_alumno||[]).forEach(h => {
      if (h.instructor_id && h.instructores) map.set(h.instructor_id, h.instructores.nombre)
    })
    if (map.size === 0) return '—'
    return Array.from(map.values()).join(' · ')
  }

  function estadoPago(alumno) {
    const p=alumno.pagos||[]
    if(p.length===0) return {label:'Sin registro',cls:'e-ve',deudor:true}
    if(p.some(x=>!x.pagado)) return {label:'Deudor',cls:'e-ve',deudor:true}
    return {label:'Al día',cls:'e-ok',deudor:false}
  }

  const meses=Array.from({length:12},(_,i)=>{ const d=new Date(); d.setMonth(d.getMonth()-i); return format(d,'yyyy-MM') })

  return (
    <>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:10}}>
        <div className="tabs" style={{marginBottom:0}}>
          <div className={`tab${tab==='facturacion'?' active':''}`} onClick={()=>setTab('facturacion')}>Facturación</div>
          <div className={`tab${tab==='cumplimiento'?' active':''}`} onClick={()=>setTab('cumplimiento')}>Cumplimiento</div>
          <div className={`tab${tab==='instructores'?' active':''}`} onClick={()=>setTab('instructores')}>Por instructor</div>
          <div className={`tab${tab==='asistencia'?' active':''}`} onClick={()=>setTab('asistencia')}>Asistencia</div>
          <div className={`tab${tab==='alumnos'?' active':''}`} onClick={()=>setTab('alumnos')}>Estado alumnos</div>
          <div className={`tab${tab==='diferencias'?' active':''}`} onClick={()=>setTab('diferencias')}>Diferencias</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <select className="form-inp" style={{width:170}} value={mes} onChange={e=>setMes(e.target.value)}>
            {meses.map(m=><option key={m} value={m}>{format(parseISO(m+'-01'),'MMMM yyyy',{locale:es})}</option>)}
          </select>
          <button className="btn-sec" onClick={()=>window.print()} style={{fontSize:12}}>Imprimir</button>
        </div>
      </div>

      {loading ? <div className="loading">Cargando...</div> : <>

        {tab==='facturacion' && <>
          {facturacion.total===0&&facturacion.alumnos.length>0&&(
            <div style={{padding:'12px 16px',background:'#FEF3E2',borderRadius:10,border:'1px solid #F0C060',fontSize:12,color:'#7A5010',marginBottom:16}}>
              Los precios por plan están en $0. Configuralos en Finanzas → Configuración.
            </div>
          )}
          <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:12,marginBottom:16}}>
            {[
              { label:'Facturación estimada', valor:facturacion.total, sub:format(parseISO(mes+'-01'),'MMMM yyyy',{locale:es}), acc:'var(--teal)' },
              { label:'Plan mensual',         valor:(facturacion.porPlan.mensual||[]).reduce((s,a)=>s+a.monto,0), sub:`${(facturacion.porPlan.mensual||[]).length} alumnos`, acc:'var(--mg)' },
              { label:'Prepago',              valor:(facturacion.porPlan.pack||[]).reduce((s,a)=>s+a.monto,0),    sub:`${(facturacion.porPlan.pack||[]).length} alumnos`,    acc:'var(--blue)' },
              { label:'Clases sueltas',       valor:(facturacion.porPlan.sueltas||[]).reduce((s,a)=>s+a.monto,0), sub:`${(facturacion.porPlan.sueltas||[]).length} alumnos`,  acc:'var(--purple)' },
            ].map(card=>(
              <div key={card.label} className="sc" style={{'--acc':card.acc}}>
                <div className="sc-lbl">{card.label}</div>
                <div style={{fontFamily:'var(--font-num)',fontSize:18,fontWeight:700,lineHeight:1.2,marginTop:4,wordBreak:'break-all'}}>
                  ${Math.round(card.valor).toLocaleString('es-AR')}
                </div>
                <div className="sc-sub" style={{marginTop:4}}>{card.sub}</div>
              </div>
            ))}
          </div>
          <div className="panel">
            <div className="ph">
              <span className="ph-title">Detalle por alumno</span>
              <span style={{fontSize:11,color:'var(--sl-m)'}}>{facturacion.alumnos.length} alumnos activos</span>
            </div>
            <div className="tbl-wrap">
              <table className="tbl" style={{minWidth:520}}>
                <thead><tr>
                  <th style={{position:'sticky',left:0,background:'var(--sl-l)',zIndex:2}}>Alumno</th>
                  <th>Nivel</th><th>Plan</th><th>Clases/sem</th><th>Instructor</th>
                  <th style={{textAlign:'right'}}>Monto</th>
                </tr></thead>
                <tbody>
                  {facturacion.alumnos.length===0&&<tr><td colSpan={6} className="empty">Sin alumnos</td></tr>}
                  {facturacion.alumnos.map(a=>(
                    <tr key={a.id}>
                      <td className="col-sticky"><span style={{fontWeight:500,cursor:'pointer',color:'var(--mg)'}} onClick={()=>window.dispatchEvent(new CustomEvent('open-ficha-alumno',{detail:a.id}))}>{a.nombre} {a.apellido}</span></td>
                      <td style={{textAlign:'center'}}><span style={{fontSize:12,fontWeight:700,color:a.nivel==='A'?'#2D7A5A':a.nivel==='B'?'#185FA5':'#6A3A8A'}}>{a.nivel||'—'}</span></td>
                      <td style={{whiteSpace:'nowrap'}}>{a.plan==='mensual'?'Plan mensual':a.plan==='pack'?'Prepago':'Clases sueltas'}</td>
                      <td style={{textAlign:'center',fontFamily:'var(--font-num)'}}>{a.clases_semana||2}</td>
                      <td style={{fontSize:11,color:'var(--sl-m)'}}>{mostrarInstructores(a)}</td>
                      <td style={{textAlign:'right',fontFamily:'var(--font-num)',fontWeight:600}}>${a.monto.toLocaleString('es-AR')}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{background:'var(--sl-l)'}}>
                    <td colSpan={5} style={{padding:'10px 14px',fontWeight:600}}>Total estimado</td>
                    <td style={{textAlign:'right',padding:'10px 14px',fontFamily:'var(--font-num)',fontWeight:700,fontSize:15,color:'var(--mg)'}}>${Math.round(facturacion.total).toLocaleString('es-AR')}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>}

        {tab==='cumplimiento' && <>
          <div className="stats" style={{gridTemplateColumns:'repeat(3,1fr)',marginBottom:16}}>
            <div className="sc" style={{'--acc':'var(--teal)'}}><div className="sc-lbl">Completaron</div><div className="sc-val">{cumplimiento.filter(a=>a.pct>=100).length}</div></div>
            <div className="sc" style={{'--acc':'var(--mg)'}}><div className="sc-lbl">Incompletos</div><div className="sc-val">{cumplimiento.filter(a=>a.pct>0&&a.pct<100).length}</div></div>
            <div className="sc" style={{'--acc':'#E24B4A'}}><div className="sc-lbl">Sin asistencia</div><div className="sc-val">{cumplimiento.filter(a=>a.realizadas===0).length}</div></div>
          </div>
          <div className="panel">
            <div className="ph"><span className="ph-title">Cumplimiento — {format(parseISO(mes+'-01'),'MMMM yyyy',{locale:es})}</span></div>
            <div className="tbl-wrap">
              <table className="tbl" style={{minWidth:600}}>
                <thead><tr>
                  <th style={{position:'sticky',left:0,background:'var(--sl-l)',zIndex:2}}>Alumno</th>
                  <th>Nivel</th><th>Instructor</th>
                  <th style={{textAlign:'center'}}>Esperadas</th>
                  <th style={{textAlign:'center'}}>Realizadas</th>
                  <th style={{textAlign:'center'}}>Faltantes</th>
                  <th style={{minWidth:120}}>Cumplimiento</th>
                </tr></thead>
                <tbody>
                  {cumplimiento.length===0&&<tr><td colSpan={7} className="empty">Sin datos</td></tr>}
                  {cumplimiento.sort((a,b)=>a.pct-b.pct).map(a=>{
                    const color=a.pct>=100?'#2D7A5A':a.pct>=60?'#7A5010':'#B03030'
                    const bgBar=a.pct>=100?'#48A999':a.pct>=60?'#D4A020':'#E24B4A'
                    return (
                      <tr key={a.id} style={{background:a.realizadas===0?'#FFF5F5':a.pct>=100?'#F6FBF8':'var(--white)'}}>
                        <td className="col-sticky"><span style={{fontWeight:500,cursor:'pointer',color:'var(--mg)'}} onClick={()=>window.dispatchEvent(new CustomEvent('open-ficha-alumno',{detail:a.id}))}>{a.nombre} {a.apellido}</span></td>
                        <td style={{textAlign:'center'}}><span style={{fontSize:12,fontWeight:700,color:a.nivel==='A'?'#2D7A5A':a.nivel==='B'?'#185FA5':'#6A3A8A'}}>{a.nivel||'—'}</span></td>
                        <td style={{fontSize:11,color:'var(--sl-m)'}}>{mostrarInstructores(a)}</td>
                        <td style={{textAlign:'center',fontFamily:'var(--font-num)',fontWeight:500}}>{a.esperadas}</td>
                        <td style={{textAlign:'center',fontFamily:'var(--font-num)',fontWeight:700,color}}>{a.realizadas}</td>
                        <td style={{textAlign:'center',fontFamily:'var(--font-num)',color:a.faltantes>0?'#B03030':'#2D7A5A',fontWeight:a.faltantes>0?600:400}}>{a.faltantes>0?`-${a.faltantes}`:'ok'}</td>
                        <td>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <div style={{flex:1,height:6,background:'var(--sl-l)',borderRadius:99,overflow:'hidden',minWidth:60}}>
                              <div style={{height:'100%',width:`${Math.min(100,a.pct)}%`,background:bgBar,borderRadius:99}}/>
                            </div>
                            <span style={{fontSize:11,fontWeight:600,color,fontFamily:'var(--font-num)',minWidth:32,textAlign:'right'}}>{a.pct}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>}

        {tab==='instructores' && <>
          <div className="stats" style={{gridTemplateColumns:'repeat(3,1fr)',marginBottom:16}}>
            <div className="sc" style={{'--acc':'var(--teal)'}}><div className="sc-lbl">Clases dadas</div><div className="sc-val">{reporteInstructores.reduce((s,i)=>s+i.dadas,0)}</div></div>
            <div className="sc" style={{'--acc':'#E24B4A'}}><div className="sc-lbl">Canceladas</div><div className="sc-val">{reporteInstructores.reduce((s,i)=>s+i.canceladas,0)}</div></div>
            <div className="sc" style={{'--acc':'var(--blue)'}}><div className="sc-lbl">Total programadas</div><div className="sc-val">{reporteInstructores.reduce((s,i)=>s+i.total,0)}</div></div>
          </div>
          {reporteInstructores.map(inst=>(
            <div key={inst.id} style={{border:'1px solid var(--border)',borderRadius:12,marginBottom:12,overflow:'hidden'}}>
              <div style={{padding:'12px 16px',background:'var(--sl-l)',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
                <div style={{fontWeight:500,fontSize:14}}>{inst.nombre} {inst.apellido}</div>
                <div style={{display:'flex',gap:10}}>
                  <span style={{fontSize:12,padding:'3px 10px',borderRadius:99,background:'#E4F4EE',color:'#2D7A5A',fontWeight:600}}>ok {inst.dadas} dadas</span>
                  {inst.canceladas>0&&<span style={{fontSize:12,padding:'3px 10px',borderRadius:99,background:'#FDECEA',color:'#B03030',fontWeight:600}}>x {inst.canceladas} canceladas</span>}
                  <span style={{fontSize:12,padding:'3px 10px',borderRadius:99,background:'var(--white)',color:'var(--sl-m)'}}>Total: {inst.total}</span>
                </div>
              </div>
              {inst.canceladas>0&&(
                <div style={{padding:'12px 16px'}}>
                  <div style={{fontSize:11,color:'var(--sl-m)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8}}>Motivos</div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    {[{key:'cambio_instructor',label:'Cambio de instructor',color:'#185FA5',bg:'#E6F1FB'},{key:'baja_instituto',label:'Baja del instituto',color:'#B03030',bg:'#FDECEA'},{key:'sin_motivo',label:'Sin motivo',color:'#7A5010',bg:'#FEF3E2'},{key:'otro',label:'Otro',color:'#6A3A8A',bg:'#F0EAF8'}]
                      .filter(m=>inst.motivosConteo[m.key]>0)
                      .map(m=><span key={m.key} style={{fontSize:11,padding:'4px 10px',borderRadius:8,background:m.bg,color:m.color,fontWeight:500}}>{m.label}: {inst.motivosConteo[m.key]}</span>)}
                    {Object.values(inst.motivosConteo).every(v=>v===0)&&<span style={{fontSize:11,color:'var(--sl-m)'}}>Sin motivos registrados</span>}
                  </div>
                </div>
              )}
              {inst.total===0&&<div style={{padding:'12px 16px',fontSize:12,color:'var(--sl-m)'}}>Sin clases este mes.</div>}
            </div>
          ))}
          {reporteInstructores.length===0&&<div className="empty">Sin instructores activos</div>}
        </>}

        {tab==='asistencia' && <>
          <div className="stats">
            <div className="sc" style={{'--acc':'var(--mg)'}}><div className="sc-lbl">Clases dadas</div><div className="sc-val">{resumen.clases}</div></div>
            <div className="sc" style={{'--acc':'var(--teal)'}}><div className="sc-lbl">Asistencias</div><div className="sc-val">{resumen.asistencias}</div></div>
            <div className="sc" style={{'--acc':'var(--blue)'}}><div className="sc-lbl">Promedio/dia</div><div className="sc-val">{resumen.promedioDia}</div></div>
            <div className="sc" style={{'--acc':'var(--purple)'}}><div className="sc-lbl">Dia mas activo</div><div className="sc-val">{resumen.diaPico}</div></div>
          </div>
          <div className="grid2" style={{marginBottom:16}}>
            <div className="panel">
              <div className="ph"><span className="ph-title">Por dia</span></div>
              <div style={{padding:'14px 8px 8px'}}>
                {asistPorDia.length===0?<div className="empty">Sin datos</div>:(
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={asistPorDia} barSize={12}>
                      <XAxis dataKey="dia" tick={{fontSize:10,fill:'var(--sl-m)'}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fontSize:10,fill:'var(--sl-m)'}} axisLine={false} tickLine={false} width={22} allowDecimals={false}/>
                      <Tooltip contentStyle={{fontSize:11,borderRadius:8}} formatter={v=>[v,'Asistencias']} labelFormatter={l=>`Dia ${l}`}/>
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
            <div className="ph"><span className="ph-title">Por instructor</span></div>
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
        </>}

        {tab==='alumnos' && (
          <div className="panel">
            <div className="ph">
              <span className="ph-title">Estado general — {format(parseISO(mes+'-01'),'MMMM yyyy',{locale:es})}</span>
              <span style={{fontSize:11,color:'var(--sl-m)'}}>{alumnosReport.length} alumnos</span>
            </div>
            <div className="tbl-wrap">
              <table className="tbl" style={{minWidth:560}}>
                <thead><tr>
                  <th style={{position:'sticky',left:0,background:'var(--sl-l)',zIndex:2}}>Alumno</th>
                  <th>Plan</th><th>Instructor</th>
                  <th style={{textAlign:'center'}}>Asistencias</th>
                  <th style={{textAlign:'center'}}>A recuperar</th>
                  <th>Estado pago</th>
                </tr></thead>
                <tbody>
                  {alumnosReport.length===0&&<tr><td colSpan={6} className="empty">Sin datos</td></tr>}
                  {alumnosReport.map(a=>{
                    const ep=estadoPago(a)
                    const presentes=(a.asistencias||[]).filter(x=>x.asistio).length
                    const aRec=(a.asistencias||[]).filter(x=>x.estado_asistencia==='ausente_con_aviso').length
                    return (
                      <tr key={a.id} style={ep.deudor?{background:'#FFF5F5'}:{}}>
                        <td className="col-sticky"><span style={{fontWeight:500,cursor:'pointer',color:'var(--mg)'}} onClick={()=>window.dispatchEvent(new CustomEvent('open-ficha-alumno',{detail:a.id}))}>{a.nombre} {a.apellido}</span></td>
                        <td style={{whiteSpace:'nowrap'}}>{a.plan==='mensual'?'Plan mensual':a.plan==='pack'?'Prepago':'Clases sueltas'}</td>
                        <td style={{fontSize:11}}>{mostrarInstructores(a)}</td>
                        <td style={{textAlign:'center',fontWeight:500,fontFamily:'var(--font-num)'}}>{presentes}</td>
                        <td style={{textAlign:'center'}}>{aRec>0?<span style={{background:'#FEF3E2',color:'#7A5010',padding:'2px 8px',borderRadius:6,fontSize:11,fontWeight:500}}>{aRec}</span>:'—'}</td>
                        <td><span className={`est ${ep.cls}`}>{ep.label}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </>}

        {tab==='diferencias' && (()=>{
          const deMenos = diferencias.filter(p=>p.dif<0)
          const deMas   = diferencias.filter(p=>p.dif>0)
          const totalDif = diferencias.reduce((s,p)=>s+p.dif,0)
          return (<>
            <div className="stats" style={{gridTemplateColumns:'repeat(3,1fr)',marginBottom:16}}>
              <div className="sc" style={{'--acc':'#E24B4A'}}>
                <div className="sc-lbl">Pagaron de menos</div>
                <div className="sc-val">{deMenos.length}</div>
                {deMenos.length>0&&<div className="sc-sub" style={{color:'#B03030',fontWeight:600}}>-${Math.abs(Math.round(deMenos.reduce((s,p)=>s+p.dif,0))).toLocaleString('es-AR')}</div>}
              </div>
              <div className="sc" style={{'--acc':'var(--teal)'}}>
                <div className="sc-lbl">Pagaron de más</div>
                <div className="sc-val">{deMas.length}</div>
                {deMas.length>0&&<div className="sc-sub" style={{color:'#2D7A5A',fontWeight:600}}>+${Math.round(deMas.reduce((s,p)=>s+p.dif,0)).toLocaleString('es-AR')}</div>}
              </div>
              <div className="sc" style={{'--acc':'var(--mg)'}}>
                <div className="sc-lbl">Diferencia neta</div>
                <div className="sc-val" style={{fontSize:18,color:totalDif<0?'#B03030':totalDif>0?'#2D7A5A':'inherit'}}>
                  {totalDif>=0?'+':''}{Math.round(totalDif).toLocaleString('es-AR')}
                </div>
              </div>
            </div>
            {diferencias.length===0
              ? <div className="panel"><div style={{padding:28,textAlign:'center',color:'var(--sl-m)',fontSize:14}}>Sin diferencias en {format(parseISO(mes+'-01'),'MMMM yyyy',{locale:es})} — todos pagaron el monto exacto.</div></div>
              : <div className="panel">
                  <div className="ph">
                    <span className="ph-title">Diferencias — {format(parseISO(mes+'-01'),'MMMM yyyy',{locale:es})}</span>
                    <span style={{fontSize:11,color:'var(--sl-m)'}}>{diferencias.length} registros</span>
                  </div>
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead><tr>
                        <th style={{position:'sticky',left:0,background:'var(--sl-l)',zIndex:2}}>Alumno</th>
                        <th>Plan</th><th>Precio plan</th><th>Pagó</th><th>Diferencia</th><th>Fecha</th>
                      </tr></thead>
                      <tbody>
                        {diferencias.map(p=>{
                          const menos = p.dif<0
                          return (
                            <tr key={p.id} style={{background:menos?'#FFF5F5':'#F6FBF8'}}>
                              <td className="col-sticky">
                                <span style={{fontWeight:500,cursor:'pointer',color:'var(--mg)'}} onClick={()=>window.dispatchEvent(new CustomEvent('open-ficha-alumno',{detail:p.alumno_id}))}>
                                  {p.alumnos?.nombre} {p.alumnos?.apellido}
                                </span>
                              </td>
                              <td style={{fontSize:11,whiteSpace:'nowrap'}}>{p.alumnos?.plan==='mensual'?'Mensual':p.alumnos?.plan==='pack'?'Prepago':'Sueltas'}</td>
                              <td style={{fontFamily:'var(--font-num)',fontWeight:500,whiteSpace:'nowrap'}}>${Number(p.esperado).toLocaleString('es-AR')}</td>
                              <td style={{fontFamily:'var(--font-num)',fontWeight:600,whiteSpace:'nowrap'}}>${Number(p.monto).toLocaleString('es-AR')}</td>
                              <td>
                                <span style={{fontFamily:'var(--font-num)',fontWeight:700,fontSize:13,color:menos?'#B03030':'#2D7A5A',whiteSpace:'nowrap'}}>
                                  {menos?'':'+'}${Math.abs(p.dif).toLocaleString('es-AR')}
                                </span>
                              </td>
                              <td style={{fontSize:11,color:'var(--sl-m)',whiteSpace:'nowrap'}}>{p.fecha_pago?format(new Date(p.fecha_pago+'T00:00:00'),'dd/MM/yy'):'—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
            }
          </>)
        })()}

    </>}
  </>
  )
}
