import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

const COLORES_MEDIOS = { efectivo:'#4A6FA5', mercadopago:'#1D9E75', transferencia:'#9B6BBB' }

export default function Finanzas() {
  const [tab, setTab]           = useState('ingresos')
  const [mes, setMes]           = useState(format(new Date(),'yyyy-MM'))
  const [loading, setLoading]   = useState(true)

  const [ingresosDia, setIngresosDia]   = useState([])
  const [resumenMes, setResumenMes]     = useState({ total:0, efectivo:0, mp:0, transf:0 })

  const [instructores, setInstructores] = useState([])
  const [tarifas, setTarifas]           = useState({})
  const [modalTarifa, setModalTarifa]   = useState(null)
  const [tarForm, setTarForm]           = useState({ porcentaje_grupal:40, porcentaje_individual:50, tarifa_hora:0 })
  const [liquidaciones, setLiquidaciones] = useState([])
  const [saving, setSaving]             = useState(false)
  const [liquidandoId, setLiquidandoId] = useState(null)

  const [config, setConfig]             = useState({
    cobro_dia_inicio:1, cobro_dia_fin:10, nombre_estudio:'Studio Pilates Reformer',
    precio_mensual:0, precio_prepago:0, precio_sueltas:0, precio_individual:0,
    precio_mensual_1:0, precio_mensual_2:0, precio_mensual_3:0, precio_mensual_4:0, precio_mensual_5:0,
  })
  const [savingConfig, setSavingConfig] = useState(false)
  const [configOk, setConfigOk]         = useState(false)

  const [packs, setPacks]               = useState([])
  const [modalPack, setModalPack]       = useState(false)
  const [alumnos, setAlumnos]           = useState([])
  const [packForm, setPackForm]         = useState({
    alumno_id:'', nombre:'', clases_total:10, precio:'',
    fecha_inicio:'', fecha_vencimiento:'', alerta_clases_restantes:2
  })

  const CATEGORIAS_EGRESO = [
    { value:'sueldo',          label:'Sueldos' },
    { value:'impuesto',        label:'Impuestos' },
    { value:'servicio',        label:'Servicios' },
    { value:'gasto_operativo', label:'Gastos operativos' },
    { value:'mantenimiento',   label:'Mantenimiento' },
    { value:'otro',            label:'Otro' },
  ]
  const emptyEgreso = { id:null, fecha:format(new Date(),'yyyy-MM-dd'), concepto:'', categoria:'gasto_operativo', monto:'', medio:'transferencia', notas:'' }
  const [egresos, setEgresos]           = useState([])
  const [totalEgresos, setTotalEgresos] = useState(0)
  const [modalEgreso, setModalEgreso]   = useState(false)
  const [egresoForm, setEgresoForm]     = useState(emptyEgreso)
  const [savingEgreso, setSavingEgreso] = useState(false)

  useEffect(() => { fetchAll() }, [mes])

  async function fetchAll() {
    setLoading(true)
    const inicio = format(startOfMonth(parseISO(mes+'-01')),'yyyy-MM-dd')
    const fin    = format(endOfMonth(parseISO(mes+'-01')),  'yyyy-MM-dd')

    const [
      { data: pagosData },
      { data: insData },
      { data: tarifasData },
      { data: liqData },
      { data: configData },
      { data: packsData },
      { data: alumnosData },
    ] = await Promise.all([
      supabase.from('pagos').select('*').eq('pagado',true).gte('fecha_pago',inicio).lte('fecha_pago',fin),
      supabase.from('instructores').select('*').eq('activo',true).order('apellido'),
      supabase.from('instructor_tarifas').select('*'),
      supabase.from('liquidaciones').select('*, instructores(nombre,apellido)').gte('periodo_inicio',inicio).lte('periodo_fin',fin),
      supabase.from('configuracion').select('*').eq('id',1).maybeSingle(),
      supabase.from('packs').select('*, alumnos(nombre,apellido)').order('created_at',{ascending:false}),
      supabase.from('alumnos').select('id,nombre,apellido,plan,clases_semana').eq('activo',true).order('apellido'),
    ])

    const porDia = {}
    ;(pagosData||[]).forEach(p => {
      if (!p.fecha_pago) return
      if (!porDia[p.fecha_pago]) porDia[p.fecha_pago] = { fecha:p.fecha_pago, efectivo:0, mercadopago:0, transferencia:0, total:0 }
      const m = p.medio||'efectivo'
      porDia[p.fecha_pago][m] = (porDia[p.fecha_pago][m]||0) + Number(p.monto||0)
      porDia[p.fecha_pago].total += Number(p.monto||0)
    })
    const diasArr = Object.values(porDia).sort((a,b)=>a.fecha.localeCompare(b.fecha))
      .map(d=>({...d, label:format(new Date(d.fecha+'T00:00:00'),'d/M')}))
    setIngresosDia(diasArr)

    const totEf  = (pagosData||[]).filter(p=>p.medio==='efectivo').reduce((s,p)=>s+Number(p.monto||0),0)
    const totMp  = (pagosData||[]).filter(p=>p.medio==='mercadopago').reduce((s,p)=>s+Number(p.monto||0),0)
    const totTr  = (pagosData||[]).filter(p=>p.medio==='transferencia').reduce((s,p)=>s+Number(p.monto||0),0)
    setResumenMes({ total:totEf+totMp+totTr, efectivo:totEf, mp:totMp, transf:totTr })

    setInstructores(insData||[])
    const tarMap = {}
    ;(tarifasData||[]).forEach(t => { tarMap[t.instructor_id] = t })
    setTarifas(tarMap)
    setLiquidaciones(liqData||[])
    if (configData) setConfig({
      cobro_dia_inicio:  configData.cobro_dia_inicio  || 1,
      cobro_dia_fin:     configData.cobro_dia_fin     || 10,
      nombre_estudio:    configData.nombre_estudio    || 'Studio Pilates Reformer',
      precio_mensual:    configData.precio_mensual    || 0,
      precio_prepago:    configData.precio_prepago    || 0,
      precio_sueltas:    configData.precio_sueltas    || 0,
      precio_individual: configData.precio_individual || 0,
      precio_mensual_1:  configData.precio_mensual_1  || 0,
      precio_mensual_2:  configData.precio_mensual_2  || 0,
      precio_mensual_3:  configData.precio_mensual_3  || 0,
      precio_mensual_4:  configData.precio_mensual_4  || 0,
      precio_mensual_5:  configData.precio_mensual_5  || 0,
    })
    setPacks(packsData||[])
    setAlumnos(alumnosData||[])

    const { data: egresosData } = await supabase.from('egresos').select('*').gte('fecha',inicio).lte('fecha',fin).order('fecha',{ascending:false})
    setEgresos(egresosData||[])
    setTotalEgresos((egresosData||[]).reduce((s,e)=>s+Number(e.monto||0),0))

    setLoading(false)
  }

  async function guardarTarifa() {
    if (!modalTarifa) return
    setSaving(true)
    await supabase.from('instructor_tarifas').upsert({
      instructor_id: modalTarifa.id,
      porcentaje_grupal: Number(tarForm.porcentaje_grupal),
      porcentaje_individual: Number(tarForm.porcentaje_individual),
      tarifa_hora: Number(tarForm.tarifa_hora),
    }, { onConflict:'instructor_id' })
    setSaving(false)
    setModalTarifa(null)
    fetchAll()
  }

  async function generarLiquidacion(instructor) {
    const tarifa = tarifas[instructor.id]
    if (!tarifa) { alert('Primero configurá la tarifa del instructor usando el botón "Tarifa".'); return }
    setLiquidandoId(instructor.id)
    const inicio = format(startOfMonth(parseISO(mes+'-01')),'yyyy-MM-dd')
    const fin    = format(endOfMonth(parseISO(mes+'-01')),  'yyyy-MM-dd')

    const { data: clasesIns } = await supabase.from('clases')
      .select('id,tipo').eq('instructor_id',instructor.id).gte('fecha',inicio).lte('fecha',fin)

    const grupales     = (clasesIns||[]).filter(c=>c.tipo==='grupal').length
    const individuales = (clasesIns||[]).filter(c=>c.tipo==='individual').length
    const bruto = resumenMes.total
    const pct   = tarifa.porcentaje_grupal || 40
    const neto  = Math.round(bruto * (pct/100))

    await supabase.from('liquidaciones').delete()
      .eq('instructor_id', instructor.id).eq('periodo_inicio', inicio)

    await supabase.from('liquidaciones').insert({
      instructor_id: instructor.id,
      periodo_inicio: inicio, periodo_fin: fin,
      clases_grupales: grupales, clases_individuales: individuales,
      monto_bruto: bruto, porcentaje: pct, monto_neto: neto,
      pagado: false,
    })

    setLiquidandoId(null)
    fetchAll()
  }

  async function marcarLiqPagada(liqId) {
    await supabase.from('liquidaciones').update({ pagado:true, fecha_pago:format(new Date(),'yyyy-MM-dd') }).eq('id',liqId)
    fetchAll()
  }

  async function guardarConfig() {
    setSavingConfig(true)
    setConfigOk(false)
    await supabase.from('configuracion').update({
      cobro_dia_inicio:  Number(config.cobro_dia_inicio),
      cobro_dia_fin:     Number(config.cobro_dia_fin),
      nombre_estudio:    config.nombre_estudio,
      precio_mensual:    Number(config.precio_mensual||0),
      precio_prepago:    Number(config.precio_prepago||0),
      precio_sueltas:    Number(config.precio_sueltas||0),
      precio_individual: Number(config.precio_individual||0),
      precio_mensual_1:  Number(config.precio_mensual_1||0),
      precio_mensual_2:  Number(config.precio_mensual_2||0),
      precio_mensual_3:  Number(config.precio_mensual_3||0),
      precio_mensual_4:  Number(config.precio_mensual_4||0),
      precio_mensual_5:  Number(config.precio_mensual_5||0),
    }).eq('id',1)
    setSavingConfig(false)
    setConfigOk(true)
    setTimeout(() => setConfigOk(false), 3000)
  }

  async function guardarPack() {
    if (!packForm.alumno_id || !packForm.nombre) return
    setSaving(true)
    await supabase.from('packs').insert({
      alumno_id: packForm.alumno_id,
      nombre: packForm.nombre,
      clases_total: Number(packForm.clases_total),
      precio: packForm.precio ? Number(packForm.precio) : null,
      fecha_inicio: packForm.fecha_inicio || null,
      fecha_vencimiento: packForm.fecha_vencimiento || null,
      alerta_clases_restantes: Number(packForm.alerta_clases_restantes),
      activo: true,
    })
    setSaving(false)
    setModalPack(false)
    fetchAll()
  }

  async function guardarEgreso() {
    if (!egresoForm.concepto || !egresoForm.monto) return
    setSavingEgreso(true)
    const payload = { fecha:egresoForm.fecha, concepto:egresoForm.concepto, categoria:egresoForm.categoria, monto:Number(egresoForm.monto), medio:egresoForm.medio, notas:egresoForm.notas||null }
    if (egresoForm.id) {
      await supabase.from('egresos').update(payload).eq('id',egresoForm.id)
    } else {
      await supabase.from('egresos').insert(payload)
    }
    setSavingEgreso(false); setModalEgreso(false); fetchAll()
  }

  async function eliminarEgreso(id) {
    if (!confirm('¿Eliminar este egreso?')) return
    await supabase.from('egresos').delete().eq('id',id); fetchAll()
  }

  const meses = Array.from({length:12},(_,i)=>{
    const d=new Date(); d.setMonth(d.getMonth()-i); return format(d,'yyyy-MM')
  })

  if (loading) return <div className="loading">Cargando…</div>

  return (
    <>
      <div style={{padding:'8px 14px',background:'#1E2533',borderRadius:8,fontSize:11,color:'rgba(255,255,255,0.5)',marginBottom:16,display:'flex',alignItems:'center',gap:8}}>
        <span style={{color:'var(--mg)'}}>★</span> Sección exclusiva — Administrador
      </div>

      <div className="tabs">
        {[['ingresos','Ingresos'],['egresos','Egresos'],['instructores','Pago instructores'],['packs','Packs prepago'],['config','Configuración']].map(([id,label])=>(
          <div key={id} className={`tab${tab===id?' active':''}`} onClick={() => setTab(id)}>{label}</div>
        ))}
      </div>

      {/* ===== INGRESOS ===== */}
      {tab==='ingresos' && (()=>{
        // Facturación proyectada: precio por plan × alumnos
        const proyectados = alumnos.map(a => {
          let precio = 0
          if (a.plan==='mensual')       precio = Number(config[`precio_mensual_${a.clases_semana||2}`]||0)
          else if (a.plan==='pack')         precio = Number(config.precio_prepago||0)
          else if (a.plan==='sueltas')      precio = Number(config.precio_sueltas||0)
          else if (a.plan==='individual')   precio = Number(config.precio_individual||0)
          return { ...a, precioEsperado: precio }
        })
        const totalProyectado = proyectados.reduce((s,a)=>s+a.precioEsperado,0)
        const diferencia = resumenMes.total - totalProyectado
        return (
        <>
          <div style={{marginBottom:14,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <label style={{fontSize:12,color:'var(--sl-m)'}}>Mes:</label>
            <select className="form-inp" style={{width:180}} value={mes} onChange={e=>setMes(e.target.value)}>
              {meses.map(m=><option key={m} value={m}>{format(parseISO(m+'-01'),'MMMM yyyy',{locale:es})}</option>)}
            </select>
          </div>
          <div className="stats" style={{gridTemplateColumns:'repeat(2,1fr)',marginBottom:12}}>
            <div className="sc" style={{'--acc':'var(--teal)'}}><div className="sc-lbl">Total cobrado</div><div className="sc-val" style={{fontSize:22}}>${Math.round(resumenMes.total).toLocaleString('es-AR')}</div></div>
            <div className="sc" style={{'--acc':'var(--blue)'}}><div className="sc-lbl">Efectivo</div><div className="sc-val" style={{fontSize:22}}>${Math.round(resumenMes.efectivo).toLocaleString('es-AR')}</div></div>
            <div className="sc" style={{'--acc':'var(--teal)'}}><div className="sc-lbl">Mercado Pago</div><div className="sc-val" style={{fontSize:22}}>${Math.round(resumenMes.mp).toLocaleString('es-AR')}</div></div>
            <div className="sc" style={{'--acc':'var(--purple)'}}><div className="sc-lbl">Transferencia</div><div className="sc-val" style={{fontSize:22}}>${Math.round(resumenMes.transf).toLocaleString('es-AR')}</div></div>
          </div>
          {/* Resultado del mes */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
            <div style={{background:'var(--sl-l)',borderRadius:10,padding:'12px 14px'}}>
              <div style={{fontSize:11,color:'var(--sl-m)',marginBottom:4}}>Egresos del mes</div>
              <div style={{fontSize:18,fontWeight:700,fontFamily:'var(--font-num)',color:'#B03030'}}>${Math.round(totalEgresos).toLocaleString('es-AR')}</div>
            </div>
            <div style={{background: (resumenMes.total-totalEgresos)>=0?'#E4F4EE':'#FDECEA',borderRadius:10,padding:'12px 14px',gridColumn:'span 2'}}>
              <div style={{fontSize:11,color:'var(--sl-m)',marginBottom:4}}>Resultado neto</div>
              <div style={{fontSize:22,fontWeight:700,fontFamily:'var(--font-num)',color:(resumenMes.total-totalEgresos)>=0?'#2D7A5A':'#B03030'}}>
                {(resumenMes.total-totalEgresos)>=0?'':'-'}${Math.abs(Math.round(resumenMes.total-totalEgresos)).toLocaleString('es-AR')}
              </div>
              <div style={{fontSize:10,color:'var(--sl-m)',marginTop:2}}>Ingresos − Egresos</div>
            </div>
          </div>

          {/* Panel facturación proyectada */}
          <div className="panel" style={{marginBottom:16}}>
            <div className="ph"><span className="ph-title">Facturación proyectada del mes</span></div>
            <div style={{padding:'14px 16px'}}>
              {totalProyectado===0
                ? <div className="empty" style={{padding:'8px 0'}}>Configurá los precios por plan en la pestaña Configuración para ver la proyección.</div>
                : <>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
                    <div style={{background:'var(--sl-l)',borderRadius:10,padding:'12px 14px'}}>
                      <div style={{fontSize:11,color:'var(--sl-m)',marginBottom:4}}>Proyectado</div>
                      <div style={{fontSize:20,fontWeight:700,fontFamily:'var(--font-num)',color:'var(--mg)'}}>${Math.round(totalProyectado).toLocaleString('es-AR')}</div>
                    </div>
                    <div style={{background:'var(--sl-l)',borderRadius:10,padding:'12px 14px'}}>
                      <div style={{fontSize:11,color:'var(--sl-m)',marginBottom:4}}>Cobrado</div>
                      <div style={{fontSize:20,fontWeight:700,fontFamily:'var(--font-num)',color:'#2D7A5A'}}>${Math.round(resumenMes.total).toLocaleString('es-AR')}</div>
                    </div>
                    <div style={{background:diferencia<0?'#FDECEA':'#E4F4EE',borderRadius:10,padding:'12px 14px'}}>
                      <div style={{fontSize:11,color:'var(--sl-m)',marginBottom:4}}>{diferencia<0?'Pendiente de cobrar':'Diferencia'}</div>
                      <div style={{fontSize:20,fontWeight:700,fontFamily:'var(--font-num)',color:diferencia<0?'#B03030':'#2D7A5A'}}>{diferencia<0?'-':''}${Math.abs(Math.round(diferencia)).toLocaleString('es-AR')}</div>
                    </div>
                  </div>
                  <div style={{fontSize:11,fontWeight:600,color:'var(--sl-m)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8}}>Detalle por alumno</div>
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead><tr><th>Alumno</th><th>Plan</th><th>Clases/sem</th><th>Precio esperado</th></tr></thead>
                      <tbody>
                        {proyectados.map(a=>(
                          <tr key={a.id}>
                            <td style={{fontWeight:500,whiteSpace:'nowrap'}}>{a.nombre} {a.apellido}</td>
                            <td style={{whiteSpace:'nowrap'}}>{a.plan==='mensual'?'Plan mensual':a.plan==='pack'?'Prepago':'Clases sueltas'}</td>
                            <td style={{textAlign:'center',fontFamily:'var(--font-num)'}}>{a.plan==='mensual'?a.clases_semana||2:'—'}</td>
                            <td style={{fontFamily:'var(--font-num)',fontWeight:500,color:a.precioEsperado===0?'#B03030':'var(--mg)'}}>
                              {a.precioEsperado===0?<span style={{fontSize:11,color:'#B03030'}}>Sin precio</span>:`$${a.precioEsperado.toLocaleString('es-AR')}`}
                            </td>
                          </tr>
                        ))}
                        <tr style={{background:'var(--sl-l)'}}>
                          <td colSpan={3} style={{fontWeight:600}}>Total proyectado</td>
                          <td style={{fontWeight:700,fontFamily:'var(--font-num)',color:'var(--mg)'}}>${Math.round(totalProyectado).toLocaleString('es-AR')}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </>
              }
            </div>
          </div>
          <div className="grid2">
            <div className="panel">
              <div className="ph"><span className="ph-title">Ingresos por día</span></div>
              <div style={{padding:'14px 8px 8px'}}>
                {ingresosDia.length===0?<div className="empty">Sin ingresos este mes</div>:(
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={ingresosDia} barSize={10}>
                      <XAxis dataKey="label" tick={{fontSize:9,fill:'var(--sl-m)'}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fontSize:9,fill:'var(--sl-m)'}} axisLine={false} tickLine={false} width={50} tickFormatter={v=>`$${(v/1000).toFixed(0)}k`}/>
                      <Tooltip contentStyle={{fontSize:11,borderRadius:8,border:'1px solid var(--border)'}} formatter={v=>[`$${Number(v).toLocaleString('es-AR')}`,'']}/>
                      <Bar dataKey="efectivo" stackId="a" fill={COLORES_MEDIOS.efectivo} name="Efectivo"/>
                      <Bar dataKey="mercadopago" stackId="a" fill={COLORES_MEDIOS.mercadopago} name="Mercado Pago"/>
                      <Bar dataKey="transferencia" stackId="a" fill={COLORES_MEDIOS.transferencia} radius={[4,4,0,0]} name="Transferencia"/>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
            <div className="panel">
              <div className="ph"><span className="ph-title">Por medio de pago</span></div>
              <div style={{padding:'14px 8px 8px'}}>
                {resumenMes.total===0?<div className="empty">Sin datos</div>:(
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={[{name:'Efectivo',value:resumenMes.efectivo},{name:'Mercado Pago',value:resumenMes.mp},{name:'Transferencia',value:resumenMes.transf}].filter(d=>d.value>0)}
                        cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={3} dataKey="value">
                        {['efectivo','mercadopago','transferencia'].map((_,i)=><Cell key={i} fill={Object.values(COLORES_MEDIOS)[i]}/>)}
                      </Pie>
                      <Tooltip formatter={v=>[`$${Number(v).toLocaleString('es-AR')}`,'']} contentStyle={{fontSize:11,borderRadius:8}}/>
                      <Legend iconType="circle" iconSize={8} formatter={v=><span style={{fontSize:10}}>{v}</span>}/>
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
          <div className="panel">
            <div className="ph"><span className="ph-title">Detalle diario</span></div>
            <div className="finanzas-scroll">
              <table className="tbl" style={{minWidth:500}}>
                <thead><tr><th>Fecha</th><th>Efectivo</th><th>Mercado Pago</th><th>Transferencia</th><th>Total</th></tr></thead>
                <tbody>
                  {ingresosDia.length===0&&<tr><td colSpan={5} className="empty">Sin datos</td></tr>}
                  {ingresosDia.map(d=>(
                    <tr key={d.fecha}>
                      <td style={{fontWeight:500}}>{format(new Date(d.fecha+'T00:00:00'),'EEE d/MM',{locale:es}).replace(/^\w/,c=>c.toUpperCase())}</td>
                      <td>{d.efectivo>0?`$${Math.round(d.efectivo).toLocaleString('es-AR')}`:'—'}</td>
                      <td>{d.mercadopago>0?`$${Math.round(d.mercadopago).toLocaleString('es-AR')}`:'—'}</td>
                      <td>{d.transferencia>0?`$${Math.round(d.transferencia).toLocaleString('es-AR')}`:'—'}</td>
                      <td style={{fontWeight:500,fontFamily:'var(--font-num)'}}>${Math.round(d.total).toLocaleString('es-AR')}</td>
                    </tr>
                  ))}
                  {ingresosDia.length>0&&(
                    <tr style={{background:'var(--sl-l)'}}>
                      <td style={{fontWeight:500}}>Total del mes</td>
                      <td style={{fontWeight:500}}>${Math.round(resumenMes.efectivo).toLocaleString('es-AR')}</td>
                      <td style={{fontWeight:500}}>${Math.round(resumenMes.mp).toLocaleString('es-AR')}</td>
                      <td style={{fontWeight:500}}>${Math.round(resumenMes.transf).toLocaleString('es-AR')}</td>
                      <td style={{fontWeight:700,color:'var(--mg)',fontFamily:'var(--font-num)'}}>${Math.round(resumenMes.total).toLocaleString('es-AR')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
        )
      })()}

      {/* ===== EGRESOS ===== */}
      {tab==='egresos' && (()=>{
        const porCategoria = CATEGORIAS_EGRESO.map(cat => ({
          ...cat,
          total: egresos.filter(e=>e.categoria===cat.value).reduce((s,e)=>s+Number(e.monto||0),0),
          items: egresos.filter(e=>e.categoria===cat.value).length,
        })).filter(c=>c.total>0)
        return (
        <>
          <div style={{marginBottom:14,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <label style={{fontSize:12,color:'var(--sl-m)'}}>Mes:</label>
              <select className="form-inp" style={{width:180}} value={mes} onChange={e=>setMes(e.target.value)}>
                {meses.map(m=><option key={m} value={m}>{format(parseISO(m+'-01'),'MMMM yyyy',{locale:es})}</option>)}
              </select>
            </div>
            <button className="btn-pri" onClick={()=>{ setEgresoForm({...emptyEgreso}); setModalEgreso(true) }}>+ Nuevo egreso</button>
          </div>

          {/* Resumen por categoría */}
          {porCategoria.length > 0 && (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:10,marginBottom:16}}>
              {porCategoria.map(c=>(
                <div key={c.value} style={{background:'var(--sl-l)',borderRadius:10,padding:'12px 14px'}}>
                  <div style={{fontSize:11,color:'var(--sl-m)',marginBottom:4}}>{c.label}</div>
                  <div style={{fontSize:16,fontWeight:700,fontFamily:'var(--font-num)',color:'#B03030'}}>${Math.round(c.total).toLocaleString('es-AR')}</div>
                  <div style={{fontSize:10,color:'var(--sl-m)',marginTop:2}}>{c.items} {c.items===1?'egreso':'egresos'}</div>
                </div>
              ))}
              <div style={{background:'#FDECEA',borderRadius:10,padding:'12px 14px'}}>
                <div style={{fontSize:11,color:'var(--sl-m)',marginBottom:4}}>Total egresos</div>
                <div style={{fontSize:16,fontWeight:700,fontFamily:'var(--font-num)',color:'#B03030'}}>${Math.round(totalEgresos).toLocaleString('es-AR')}</div>
                <div style={{fontSize:10,color:'#B03030',marginTop:2,fontWeight:600}}>Resultado: {(resumenMes.total-totalEgresos)>=0?'+':''}{Math.round(resumenMes.total-totalEgresos).toLocaleString('es-AR')}</div>
              </div>
            </div>
          )}

          <div className="panel">
            <div className="ph"><span className="ph-title">Egresos — {format(parseISO(mes+'-01'),'MMMM yyyy',{locale:es})}</span></div>
            <div className="tbl-wrap">
              <table className="tbl" style={{minWidth:560}}>
                <thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Medio</th><th style={{textAlign:'right'}}>Monto</th><th></th></tr></thead>
                <tbody>
                  {egresos.length===0&&<tr><td colSpan={6} className="empty">Sin egresos este mes</td></tr>}
                  {egresos.map(e=>(
                    <tr key={e.id}>
                      <td style={{whiteSpace:'nowrap',fontSize:12}}>{format(new Date(e.fecha+'T00:00:00'),'dd/MM/yy')}</td>
                      <td>
                        <div style={{fontWeight:500}}>{e.concepto}</div>
                        {e.notas&&<div style={{fontSize:10,color:'var(--sl-m)'}}>{e.notas}</div>}
                      </td>
                      <td><span style={{fontSize:11,padding:'2px 8px',borderRadius:6,background:'var(--sl-l)',color:'var(--sl-m)',whiteSpace:'nowrap'}}>{CATEGORIAS_EGRESO.find(c=>c.value===e.categoria)?.label||e.categoria}</span></td>
                      <td style={{fontSize:11,color:'var(--sl-m)',textTransform:'capitalize'}}>{e.medio}</td>
                      <td style={{textAlign:'right',fontFamily:'var(--font-num)',fontWeight:600,color:'#B03030'}}>${Number(e.monto).toLocaleString('es-AR')}</td>
                      <td>
                        <div style={{display:'flex',gap:4}}>
                          <button className="btn-sec" style={{fontSize:11,padding:'3px 7px'}} onClick={()=>{ setEgresoForm({id:e.id,fecha:e.fecha,concepto:e.concepto,categoria:e.categoria,monto:e.monto,medio:e.medio,notas:e.notas||''}); setModalEgreso(true) }}>Editar</button>
                          <button className="btn-danger" style={{fontSize:11,padding:'3px 7px'}} onClick={()=>eliminarEgreso(e.id)}>×</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {egresos.length>0&&(
                    <tr style={{background:'var(--sl-l)'}}>
                      <td colSpan={4} style={{fontWeight:600,padding:'10px 14px'}}>Total</td>
                      <td style={{textAlign:'right',fontWeight:700,fontFamily:'var(--font-num)',color:'#B03030',padding:'10px 14px'}}>${Math.round(totalEgresos).toLocaleString('es-AR')}</td>
                      <td/>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
        )
      })()}

      {/* ===== PAGO INSTRUCTORES ===== */}
      {tab==='instructores' && (
        <>
          <div style={{marginBottom:14,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <label style={{fontSize:12,color:'var(--sl-m)'}}>Mes a liquidar:</label>
            <select className="form-inp" style={{width:180}} value={mes} onChange={e=>setMes(e.target.value)}>
              {meses.map(m=><option key={m} value={m}>{format(parseISO(m+'-01'),'MMMM yyyy',{locale:es})}</option>)}
            </select>
          </div>
          {instructores.map(inst => {
            const tar = tarifas[inst.id]
            const liq = liquidaciones.find(l=>l.instructor_id===inst.id)
            const esLiquidando = liquidandoId===inst.id
            return (
              <div key={inst.id} style={{border:'1px solid var(--border)',borderRadius:12,padding:'14px 16px',marginBottom:10,background:'var(--white)'}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:500}}>{inst.nombre} {inst.apellido}</div>
                    <div style={{fontSize:11,color:'var(--sl-m)',marginTop:2}}>
                      {tar?`${tar.porcentaje_grupal}% grupales · ${tar.porcentaje_individual}% individuales`:<span style={{color:'#B03030'}}>Sin tarifa configurada</span>}
                    </div>
                  </div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                    <button className="btn-sec" style={{fontSize:11,padding:'4px 10px'}}
                      onClick={() => { setModalTarifa(inst); const t=tarifas[inst.id]; setTarForm({porcentaje_grupal:t?.porcentaje_grupal||40,porcentaje_individual:t?.porcentaje_individual||50,tarifa_hora:t?.tarifa_hora||0}) }}>
                      Tarifa
                    </button>
                    {!liq?.pagado&&<button className="btn-pri" style={{fontSize:11,padding:'4px 10px'}} onClick={() => generarLiquidacion(inst)} disabled={esLiquidando}>{esLiquidando?'Calculando…':'Liquidar'}</button>}
                    {liq&&!liq.pagado&&<button className="btn-sec" style={{fontSize:11,padding:'4px 10px',color:'#2D7A5A',borderColor:'#6DC49A'}} onClick={() => marcarLiqPagada(liq.id)}>Marcar pagado</button>}
                  </div>
                </div>
                {liq&&(
                  <div style={{marginTop:10,padding:'10px 12px',background:liq.pagado?'#E4F4EE':'#FEF3E2',borderRadius:8}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:4}}>
                      <div>
                        <div style={{fontSize:12,color:'var(--sl-m)'}}>{liq.clases_grupales} cls. grupales · {liq.clases_individuales} cls. individuales · {liq.porcentaje}%</div>
                        <div style={{fontSize:11,color:'var(--sl-m)'}}>Ingreso bruto del mes: ${Math.round(liq.monto_bruto).toLocaleString('es-AR')}</div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontSize:16,fontWeight:700,fontFamily:'var(--font-num)',color:liq.pagado?'#2D7A5A':'#7A5010'}}>${Math.round(liq.monto_neto).toLocaleString('es-AR')}</div>
                        <div style={{fontSize:10,color:liq.pagado?'#2D7A5A':'#7A5010'}}>{liq.pagado?'✓ Pagado':'Pendiente de pago'}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}

      {/* ===== PACKS PREPAGO ===== */}
      {tab==='packs' && (
        <>
          <div style={{marginBottom:12}}>
            <button className="btn-pri" onClick={() => { setPackForm({alumno_id:'',nombre:'',clases_total:10,precio:'',fecha_inicio:'',fecha_vencimiento:'',alerta_clases_restantes:2}); setModalPack(true) }}>+ Nuevo pack</button>
          </div>
          <div className="panel">
            <div className="ph"><span className="ph-title">Packs activos</span></div>
            <div className="finanzas-scroll">
              <table className="tbl" style={{minWidth:600}}>
                <thead><tr><th>Alumno</th><th>Pack</th><th>Clases</th><th>Usadas</th><th>Restantes</th><th>Vencimiento</th><th>Estado</th></tr></thead>
                <tbody>
                  {packs.length===0&&<tr><td colSpan={7} className="empty">Sin packs</td></tr>}
                  {packs.map(pk=>{
                    const rest=pk.clases_total-pk.clases_usadas
                    const pct=Math.round((pk.clases_usadas/pk.clases_total)*100)
                    return(
                      <tr key={pk.id}>
                        <td style={{cursor:'pointer',color:'var(--mg)',fontWeight:500,whiteSpace:'nowrap'}} onClick={() => window.dispatchEvent(new CustomEvent('open-ficha-alumno',{detail:pk.alumno_id}))}>{pk.alumnos?.nombre} {pk.alumnos?.apellido}</td>
                        <td style={{whiteSpace:'nowrap'}}>{pk.nombre}</td>
                        <td style={{fontFamily:'var(--font-num)',textAlign:'center'}}>{pk.clases_total}</td>
                        <td><div style={{display:'flex',alignItems:'center',gap:6}}><span style={{fontFamily:'var(--font-num)'}}>{pk.clases_usadas}</span><div style={{width:36,height:3,background:'var(--sl-l)',borderRadius:99,overflow:'hidden'}}><div style={{height:'100%',width:`${pct}%`,background:rest<=2?'#E24B4A':'#48A999',borderRadius:99}}/></div></div></td>
                        <td><span style={{fontWeight:500,fontFamily:'var(--font-num)',color:rest<=2?'#B03030':rest<=4?'#7A5010':'#2D7A5A'}}>{rest}</span></td>
                        <td style={{fontSize:11,color:'var(--sl-m)',whiteSpace:'nowrap'}}>{pk.fecha_vencimiento||'—'}</td>
                        <td><span className={`est ${pk.activo&&rest>0?'e-ok':rest<=0?'e-ve':'e-pe'}`}>{!pk.activo?'Inactivo':rest<=0?'Agotado':rest<=2?'Por vencer':'Activo'}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ===== CONFIGURACIÓN ===== */}
      {tab==='config' && (
        <div className="panel" style={{maxWidth:480}}>
          <div className="ph"><span className="ph-title">Configuración del estudio</span></div>
          <div style={{padding:'18px 20px'}}>
            <div className="form-row">
              <label className="form-lbl">Nombre del estudio</label>
              <input className="form-inp" value={config.nombre_estudio||''} onChange={e=>setConfig(c=>({...c,nombre_estudio:e.target.value}))}/>
            </div>

            <div style={{fontSize:12,color:'var(--sl-m)',marginBottom:8,fontWeight:500}}>Período de cobro mensual</div>
            <div className="form-row2">
              <div className="form-row" style={{marginBottom:0}}>
                <label className="form-lbl">Desde el día</label>
                <input className="form-inp" type="number" min={1} max={28} value={config.cobro_dia_inicio||1} onChange={e=>setConfig(c=>({...c,cobro_dia_inicio:e.target.value}))}/>
              </div>
              <div className="form-row" style={{marginBottom:0}}>
                <label className="form-lbl">Hasta el día</label>
                <input className="form-inp" type="number" min={1} max={31} value={config.cobro_dia_fin||10} onChange={e=>setConfig(c=>({...c,cobro_dia_fin:e.target.value}))}/>
              </div>
            </div>
            <div style={{fontSize:11,color:'var(--sl-m)',marginTop:6,marginBottom:16}}>El dashboard mostrará alerta azul durante este período cada mes.</div>

            <div style={{fontSize:12,color:'var(--sl-m)',marginBottom:8,fontWeight:500}}>Precios por plan</div>

            <div style={{fontSize:11,color:'var(--sl-m)',marginBottom:6}}>Plan mensual — según clases por semana</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,marginBottom:12}}>
              {[1,2,3,4].map(n=>(
                <div key={n} className="form-row" style={{marginBottom:0}}>
                  <label className="form-lbl">{n} clase{n>1?'s':''}/sem</label>
                  <input className="form-inp" type="number" value={config[`precio_mensual_${n}`]||0} onChange={e=>setConfig(c=>({...c,[`precio_mensual_${n}`]:e.target.value}))} placeholder="0"/>
                </div>
              ))}
              <div className="form-row" style={{marginBottom:0}}>
                <label className="form-lbl">Pase libre</label>
                <input className="form-inp" type="number" value={config.precio_mensual_5||0} onChange={e=>setConfig(c=>({...c,precio_mensual_5:e.target.value}))} placeholder="0"/>
              </div>
            </div>

            <div className="form-row" style={{marginBottom:12}}>
              <label className="form-lbl">Prepago (precio del pack)</label>
              <input className="form-inp" type="number" value={config.precio_prepago||0} onChange={e=>setConfig(c=>({...c,precio_prepago:e.target.value}))} placeholder="0"/>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              <div style={{background:'var(--sl-l)',borderRadius:10,padding:'12px 14px'}}>
                <div style={{fontSize:11,color:'var(--sl-m)',marginBottom:6}}>Clases sueltas</div>
                <label className="form-lbl">Precio por clase suelta</label>
                <input className="form-inp" type="number" value={config.precio_sueltas||0} onChange={e=>setConfig(c=>({...c,precio_sueltas:e.target.value}))} placeholder="0"/>
              </div>
              <div style={{background:'var(--sl-l)',borderRadius:10,padding:'12px 14px'}}>
                <div style={{fontSize:11,color:'var(--sl-m)',marginBottom:6}}>Clases individuales</div>
                <label className="form-lbl">Precio por clase individual</label>
                <input className="form-inp" type="number" value={config.precio_individual||0} onChange={e=>setConfig(c=>({...c,precio_individual:e.target.value}))} placeholder="0"/>
              </div>
            </div>
            <div style={{fontSize:11,color:'var(--sl-m)',marginBottom:16}}>Estos precios se usan en el reporte de Facturación proyectada.</div>

            {configOk && <div style={{fontSize:12,color:'#2D7A5A',background:'#E4F4EE',padding:'8px 12px',borderRadius:8,marginBottom:12}}>✓ Configuración guardada</div>}
            <button className="btn-pri" onClick={guardarConfig} disabled={savingConfig}>{savingConfig?'Guardando…':'Guardar configuración'}</button>
          </div>
        </div>
      )}

      {/* MODAL: Egreso */}
      {modalEgreso&&(
        <Modal title={egresoForm.id?'Editar egreso':'Nuevo egreso'} onClose={()=>setModalEgreso(false)}
          footer={<><button className="btn-sec" onClick={()=>setModalEgreso(false)}>Cancelar</button><button className="btn-pri" onClick={guardarEgreso} disabled={savingEgreso}>{savingEgreso?'Guardando…':'Guardar'}</button></>}>
          <div className="form-row2">
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Fecha</label><input className="form-inp" type="date" value={egresoForm.fecha} onChange={e=>setEgresoForm(f=>({...f,fecha:e.target.value}))}/></div>
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Categoría</label><select className="form-inp" value={egresoForm.categoria} onChange={e=>setEgresoForm(f=>({...f,categoria:e.target.value}))}>{CATEGORIAS_EGRESO.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
          </div>
          <div className="form-row" style={{marginTop:12}}><label className="form-lbl">Concepto</label><input className="form-inp" value={egresoForm.concepto} onChange={e=>setEgresoForm(f=>({...f,concepto:e.target.value}))} placeholder="Ej: Alquiler local, Sueldo María, AFIP..."/></div>
          <div className="form-row2">
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Monto</label><input className="form-inp" type="number" value={egresoForm.monto} onChange={e=>setEgresoForm(f=>({...f,monto:e.target.value}))} placeholder="0"/></div>
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Medio de pago</label><select className="form-inp" value={egresoForm.medio} onChange={e=>setEgresoForm(f=>({...f,medio:e.target.value}))}><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="mercadopago">Mercado Pago</option></select></div>
          </div>
          <div className="form-row" style={{marginTop:12}}><label className="form-lbl">Notas (opcional)</label><textarea className="form-inp" value={egresoForm.notas} onChange={e=>setEgresoForm(f=>({...f,notas:e.target.value}))} placeholder="Detalles adicionales..."/></div>
        </Modal>
      )}

      {/* MODAL: Tarifa */}
      {modalTarifa&&(
        <Modal title={`Tarifa — ${modalTarifa.nombre} ${modalTarifa.apellido}`} onClose={() => setModalTarifa(null)}
          footer={<><button className="btn-sec" onClick={() => setModalTarifa(null)}>Cancelar</button><button className="btn-pri" onClick={guardarTarifa} disabled={saving}>{saving?'Guardando…':'Guardar'}</button></>}>
          <div style={{fontSize:12,color:'var(--sl-m)',marginBottom:14,padding:'8px 12px',background:'var(--sl-l)',borderRadius:8}}>El porcentaje se calcula sobre el total de ingresos del mes.</div>
          <div className="form-row2">
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">% Clases grupales</label><input className="form-inp" type="number" min={0} max={100} value={tarForm.porcentaje_grupal} onChange={e=>setTarForm(f=>({...f,porcentaje_grupal:e.target.value}))}/></div>
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">% Clases individuales</label><input className="form-inp" type="number" min={0} max={100} value={tarForm.porcentaje_individual} onChange={e=>setTarForm(f=>({...f,porcentaje_individual:e.target.value}))}/></div>
          </div>
          <div className="form-row" style={{marginTop:13}}><label className="form-lbl">Tarifa por hora (opcional)</label><input className="form-inp" type="number" value={tarForm.tarifa_hora} onChange={e=>setTarForm(f=>({...f,tarifa_hora:e.target.value}))} placeholder="0"/></div>
        </Modal>
      )}

      {/* MODAL: Nuevo pack */}
      {modalPack&&(
        <Modal title="Nuevo pack prepago" onClose={() => setModalPack(false)}
          footer={<><button className="btn-sec" onClick={() => setModalPack(false)}>Cancelar</button><button className="btn-pri" onClick={guardarPack} disabled={saving}>{saving?'Guardando…':'Guardar pack'}</button></>}>
          <div className="form-row"><label className="form-lbl">Alumno</label><select className="form-inp" value={packForm.alumno_id} onChange={e=>setPackForm(f=>({...f,alumno_id:e.target.value}))}><option value="">Seleccioná un alumno</option>{alumnos.map(a=><option key={a.id} value={a.id}>{a.nombre} {a.apellido}</option>)}</select></div>
          <div className="form-row"><label className="form-lbl">Nombre del pack</label><input className="form-inp" value={packForm.nombre} onChange={e=>setPackForm(f=>({...f,nombre:e.target.value}))} placeholder="Ej: Pack 10 clases"/></div>
          <div className="form-row2">
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Cantidad de clases</label><input className="form-inp" type="number" min={1} value={packForm.clases_total} onChange={e=>setPackForm(f=>({...f,clases_total:e.target.value}))}/></div>
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Precio total</label><input className="form-inp" type="number" value={packForm.precio} onChange={e=>setPackForm(f=>({...f,precio:e.target.value}))} placeholder="0"/></div>
          </div>
          <div className="form-row2" style={{marginTop:13}}>
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Fecha inicio</label><input className="form-inp" type="date" value={packForm.fecha_inicio} onChange={e=>setPackForm(f=>({...f,fecha_inicio:e.target.value}))}/></div>
            <div className="form-row" style={{marginBottom:0}}><label className="form-lbl">Vencimiento</label><input className="form-inp" type="date" value={packForm.fecha_vencimiento} onChange={e=>setPackForm(f=>({...f,fecha_vencimiento:e.target.value}))}/></div>
          </div>
          <div className="form-row" style={{marginTop:13}}><label className="form-lbl">Alertar cuando queden X clases</label><input className="form-inp" type="number" min={1} max={5} value={packForm.alerta_clases_restantes} onChange={e=>setPackForm(f=>({...f,alerta_clases_restantes:e.target.value}))}/></div>
        </Modal>
      )}
    </>
  )
}
