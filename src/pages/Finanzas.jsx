import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

const COLORES_MEDIOS = { efectivo:'#4A6FA5', mercadopago:'#1D9E75', transferencia:'#9B6BBB' }

export default function Finanzas() {
  const [tab, setTab]               = useState('ingresos')
  const [mes, setMes]               = useState(format(new Date(),'yyyy-MM'))
  const [loading, setLoading]       = useState(true)

  // Ingresos
  const [ingresosDia, setIngresosDia]       = useState([])
  const [resumenMes, setResumenMes]         = useState({ total:0, efectivo:0, mp:0, transf:0 })

  // Instructores
  const [instructores, setInstructores]     = useState([])
  const [tarifas, setTarifas]               = useState({})
  const [modalTarifa, setModalTarifa]       = useState(null)
  const [tarForm, setTarForm]               = useState({ porcentaje_grupal:40, porcentaje_individual:50, tarifa_hora:0 })
  const [liquidaciones, setLiquidaciones]   = useState([])
  const [modalLiquidar, setModalLiquidar]   = useState(null)
  const [saving, setSaving]                 = useState(false)

  // Config
  const [config, setConfig]                 = useState({ cobro_dia_inicio:1, cobro_dia_fin:10, nombre_estudio:'Studio Pilates Reformer' })
  const [savingConfig, setSavingConfig]     = useState(false)

  // Packs
  const [packs, setPacks]                   = useState([])
  const [modalPack, setModalPack]           = useState(null)
  const [alumnos, setAlumnos]               = useState([])
  const [packForm, setPackForm]             = useState({ alumno_id:'', nombre:'', clases_total:10, precio:'', fecha_inicio:'', fecha_vencimiento:'', alerta_clases_restantes:2 })

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
      { data: clasesData },
    ] = await Promise.all([
      supabase.from('pagos').select('*').eq('pagado',true).gte('fecha_pago',inicio).lte('fecha_pago',fin),
      supabase.from('instructores').select('*').eq('activo',true).order('apellido'),
      supabase.from('instructor_tarifas').select('*'),
      supabase.from('liquidaciones').select('*, instructores(nombre,apellido)').gte('periodo_inicio',inicio).lte('periodo_fin',fin),
      supabase.from('configuracion').select('*').eq('id',1).maybeSingle(),
      supabase.from('packs').select('*, alumnos(nombre,apellido)').order('created_at',{ascending:false}),
      supabase.from('alumnos').select('id,nombre,apellido').eq('activo',true).order('apellido'),
      supabase.from('clases').select('*, asistencias(id)').gte('fecha',inicio).lte('fecha',fin),
    ])

    // Ingresos agrupados por día
    const porDia = {}
    ;(pagosData||[]).forEach(p => {
      if (!p.fecha_pago) return
      if (!porDia[p.fecha_pago]) porDia[p.fecha_pago] = { fecha:p.fecha_pago, efectivo:0, mercadopago:0, transferencia:0, total:0 }
      const m = p.medio || 'efectivo'
      porDia[p.fecha_pago][m] = (porDia[p.fecha_pago][m]||0) + Number(p.monto||0)
      porDia[p.fecha_pago].total += Number(p.monto||0)
    })
    const diasArr = Object.values(porDia).sort((a,b) => a.fecha.localeCompare(b.fecha)).map(d => ({
      ...d, label: format(new Date(d.fecha+'T00:00:00'),'d/M')
    }))
    setIngresosDia(diasArr)

    const totEf  = (pagosData||[]).filter(p=>p.medio==='efectivo').reduce((s,p)=>s+Number(p.monto||0),0)
    const totMp  = (pagosData||[]).filter(p=>p.medio==='mercadopago').reduce((s,p)=>s+Number(p.monto||0),0)
    const totTr  = (pagosData||[]).filter(p=>p.medio==='transferencia').reduce((s,p)=>s+Number(p.monto||0),0)
    setResumenMes({ total: totEf+totMp+totTr, efectivo:totEf, mp:totMp, transf:totTr })

    setInstructores(insData||[])
    const tarMap = {}
    ;(tarifasData||[]).forEach(t => { tarMap[t.instructor_id] = t })
    setTarifas(tarMap)
    setLiquidaciones(liqData||[])
    if (configData) setConfig(configData)
    setPacks(packsData||[])
    setAlumnos(alumnosData||[])
    setLoading(false)
  }

  // Calcular liquidación estimada de un instructor en el mes
  function calcLiquidacion(instructor) {
    const tarifa = tarifas[instructor.id]
    if (!tarifa) return { grupales:0, individuales:0, bruto:0, neto:0 }
    // contar clases del mes con asistencias
    return { grupales:0, individuales:0, bruto:0, neto:0 } // se calcula en tiempo real
  }

  async function guardarTarifa() {
    if (!modalTarifa) return
    setSaving(true)
    await supabase.from('instructor_tarifas').upsert({
      instructor_id: modalTarifa.id,
      porcentaje_grupal: Number(tarForm.porcentaje_grupal),
      porcentaje_individual: Number(tarForm.porcentaje_individual),
      tarifa_hora: Number(tarForm.tarifa_hora),
    }, { onConflict: 'instructor_id' })
    setSaving(false)
    setModalTarifa(null)
    fetchAll()
  }

  async function generarLiquidacion(instructor) {
    const inicio = format(startOfMonth(parseISO(mes+'-01')),'yyyy-MM-dd')
    const fin    = format(endOfMonth(parseISO(mes+'-01')),  'yyyy-MM-dd')
    const tarifa = tarifas[instructor.id]
    if (!tarifa) { alert('Primero configurá la tarifa del instructor'); return }

    setSaving(true)
    // Contar clases del mes
    const { data: clasesIns } = await supabase.from('clases')
      .select('id,tipo').eq('instructor_id',instructor.id).gte('fecha',inicio).lte('fecha',fin)

    const grupales    = (clasesIns||[]).filter(c=>c.tipo==='grupal').length
    const individuales = (clasesIns||[]).filter(c=>c.tipo==='individual').length

    // Ingresos del mes para este instructor (estimado por clases)
    const { data: pagosIns } = await supabase.from('pagos')
      .select('monto').eq('pagado',true).gte('fecha_pago',inicio).lte('fecha_pago',fin)
    const bruto = (pagosIns||[]).reduce((s,p) => s+Number(p.monto||0), 0)
    const pct   = tarifa.porcentaje_grupal || 40
    const neto  = Math.round(bruto * (pct/100))

    await supabase.from('liquidaciones').upsert({
      instructor_id: instructor.id,
      periodo_inicio: inicio, periodo_fin: fin,
      clases_grupales: grupales, clases_individuales: individuales,
      monto_bruto: bruto, porcentaje: pct, monto_neto: neto,
      pagado: false,
    }, { onConflict: 'instructor_id,periodo_inicio' })

    setSaving(false)
    fetchAll()
  }

  async function marcarLiqPagada(liqId) {
    await supabase.from('liquidaciones').update({ pagado:true, fecha_pago:format(new Date(),'yyyy-MM-dd') }).eq('id',liqId)
    fetchAll()
  }

  async function guardarConfig() {
    setSavingConfig(true)
    await supabase.from('configuracion').update({
      cobro_dia_inicio: Number(config.cobro_dia_inicio),
      cobro_dia_fin: Number(config.cobro_dia_fin),
      nombre_estudio: config.nombre_estudio,
    }).eq('id',1)
    setSavingConfig(false)
    alert('Configuración guardada')
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
    setModalPack(null)
    fetchAll()
  }

  const tabs = [
    { id:'ingresos',    label:'Ingresos' },
    { id:'instructores',label:'Pago instructores' },
    { id:'packs',       label:'Packs prepago' },
    { id:'config',      label:'Configuración' },
  ]

  if (loading) return <div className="loading">Cargando…</div>

  return (
    <>
      {/* Aviso solo gerente */}
      <div style={{padding:'8px 14px', background:'#1E2533', borderRadius:8, fontSize:11, color:'rgba(255,255,255,0.5)', marginBottom:16, display:'flex', alignItems:'center', gap:8}}>
        <span style={{color:'var(--mg)'}}>★</span> Sección de acceso exclusivo para gerencia
      </div>

      <div className="tabs">
        {tabs.map(t => (
          <div key={t.id} className={`tab${tab===t.id?' active':''}`} onClick={() => setTab(t.id)}>{t.label}</div>
        ))}
      </div>

      {/* ===== INGRESOS ===== */}
      {tab === 'ingresos' && (
        <>
          <div className="stats" style={{gridTemplateColumns:'repeat(4,1fr)', marginBottom:20}}>
            <div className="sc" style={{'--acc':'var(--teal)'}}>
              <div className="sc-lbl">Total del mes</div>
              <div className="sc-val" style={{fontSize:22}}>${Math.round(resumenMes.total).toLocaleString('es-AR')}</div>
            </div>
            <div className="sc" style={{'--acc':'var(--blue)'}}>
              <div className="sc-lbl">Efectivo</div>
              <div className="sc-val" style={{fontSize:22}}>${Math.round(resumenMes.efectivo).toLocaleString('es-AR')}</div>
            </div>
            <div className="sc" style={{'--acc':'var(--teal)'}}>
              <div className="sc-lbl">Mercado Pago</div>
              <div className="sc-val" style={{fontSize:22}}>${Math.round(resumenMes.mp).toLocaleString('es-AR')}</div>
            </div>
            <div className="sc" style={{'--acc':'var(--purple)'}}>
              <div className="sc-lbl">Transferencia</div>
              <div className="sc-val" style={{fontSize:22}}>${Math.round(resumenMes.transf).toLocaleString('es-AR')}</div>
            </div>
          </div>

          <div style={{marginBottom:16, display:'flex', alignItems:'center', gap:10}}>
            <label style={{fontSize:12, color:'var(--sl-m)'}}>Mes:</label>
            <select className="form-inp" style={{width:180}} value={mes} onChange={e => setMes(e.target.value)}>
              {Array.from({length:12},(_,i)=>{
                const d = new Date(); d.setMonth(d.getMonth()-i)
                return format(d,'yyyy-MM')
              }).map(m => (
                <option key={m} value={m}>{format(parseISO(m+'-01'),'MMMM yyyy',{locale:es})}</option>
              ))}
            </select>
          </div>

          <div className="grid2">
            <div className="panel">
              <div className="ph"><span className="ph-title">Ingresos por día</span></div>
              <div style={{padding:'18px 10px 10px'}}>
                {ingresosDia.length===0
                  ? <div className="empty">Sin ingresos registrados este mes</div>
                  : <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={ingresosDia} barSize={12}>
                        <XAxis dataKey="label" tick={{fontSize:10,fill:'var(--sl-m)'}} axisLine={false} tickLine={false} />
                        <YAxis tick={{fontSize:10,fill:'var(--sl-m)'}} axisLine={false} tickLine={false} width={60}
                          tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                        <Tooltip contentStyle={{fontSize:11,borderRadius:8,border:'1px solid var(--border)'}}
                          formatter={v => [`$${Number(v).toLocaleString('es-AR')}`, '']} />
                        <Bar dataKey="efectivo" stackId="a" fill={COLORES_MEDIOS.efectivo} radius={[0,0,0,0]} name="Efectivo" />
                        <Bar dataKey="mercadopago" stackId="a" fill={COLORES_MEDIOS.mercadopago} name="Mercado Pago" />
                        <Bar dataKey="transferencia" stackId="a" fill={COLORES_MEDIOS.transferencia} radius={[4,4,0,0]} name="Transferencia" />
                      </BarChart>
                    </ResponsiveContainer>
                }
              </div>
            </div>

            <div className="panel">
              <div className="ph"><span className="ph-title">Distribución por medio</span></div>
              <div style={{padding:'18px 10px 10px'}}>
                {resumenMes.total === 0
                  ? <div className="empty">Sin datos</div>
                  : <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={[
                          {name:'Efectivo', value:resumenMes.efectivo},
                          {name:'Mercado Pago', value:resumenMes.mp},
                          {name:'Transferencia', value:resumenMes.transf},
                        ].filter(d=>d.value>0)}
                          cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={3} dataKey="value">
                          {['efectivo','mercadopago','transferencia'].map((k,i) => (
                            <Cell key={i} fill={Object.values(COLORES_MEDIOS)[i]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={v => [`$${Number(v).toLocaleString('es-AR')}`,'']} contentStyle={{fontSize:11,borderRadius:8}} />
                        <Legend iconType="circle" iconSize={8} formatter={v => <span style={{fontSize:11}}>{v}</span>} />
                      </PieChart>
                    </ResponsiveContainer>
                }
              </div>
            </div>
          </div>

          {/* Tabla detalle por día */}
          <div className="panel">
            <div className="ph"><span className="ph-title">Detalle diario</span></div>
            <table className="tbl">
              <thead><tr><th>Fecha</th><th>Efectivo</th><th>Mercado Pago</th><th>Transferencia</th><th>Total día</th></tr></thead>
              <tbody>
                {ingresosDia.length===0 && <tr><td colSpan={5} className="empty">Sin datos</td></tr>}
                {ingresosDia.map(d => (
                  <tr key={d.fecha}>
                    <td style={{fontWeight:500}}>{format(new Date(d.fecha+'T00:00:00'),'EEEE d/MM',{locale:es}).replace(/^\w/,c=>c.toUpperCase())}</td>
                    <td>{d.efectivo>0?`$${Math.round(d.efectivo).toLocaleString('es-AR')}`:'—'}</td>
                    <td>{d.mercadopago>0?`$${Math.round(d.mercadopago).toLocaleString('es-AR')}`:'—'}</td>
                    <td>{d.transferencia>0?`$${Math.round(d.transferencia).toLocaleString('es-AR')}`:'—'}</td>
                    <td style={{fontWeight:500}}>${Math.round(d.total).toLocaleString('es-AR')}</td>
                  </tr>
                ))}
                {ingresosDia.length>0 && (
                  <tr style={{background:'var(--sl-l)'}}>
                    <td style={{fontWeight:500}}>Total del mes</td>
                    <td style={{fontWeight:500}}>${Math.round(resumenMes.efectivo).toLocaleString('es-AR')}</td>
                    <td style={{fontWeight:500}}>${Math.round(resumenMes.mp).toLocaleString('es-AR')}</td>
                    <td style={{fontWeight:500}}>${Math.round(resumenMes.transf).toLocaleString('es-AR')}</td>
                    <td style={{fontWeight:700,color:'var(--mg)'}}>${Math.round(resumenMes.total).toLocaleString('es-AR')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ===== PAGO INSTRUCTORES ===== */}
      {tab === 'instructores' && (
        <>
          <div style={{marginBottom:16, display:'flex', alignItems:'center', gap:10}}>
            <label style={{fontSize:12, color:'var(--sl-m)'}}>Mes a liquidar:</label>
            <select className="form-inp" style={{width:180}} value={mes} onChange={e => setMes(e.target.value)}>
              {Array.from({length:12},(_,i)=>{
                const d = new Date(); d.setMonth(d.getMonth()-i)
                return format(d,'yyyy-MM')
              }).map(m => (
                <option key={m} value={m}>{format(parseISO(m+'-01'),'MMMM yyyy',{locale:es})}</option>
              ))}
            </select>
          </div>

          <div className="panel section-mb">
            <div className="ph"><span className="ph-title">Instructores y tarifas</span></div>
            <table className="tbl">
              <thead><tr><th>Instructor</th><th>% Grupal</th><th>% Individual</th><th>Tarifa/hora</th><th>Liquidación {mes}</th><th></th></tr></thead>
              <tbody>
                {instructores.map(inst => {
                  const tar = tarifas[inst.id]
                  const liq = liquidaciones.find(l => l.instructor_id === inst.id)
                  return (
                    <tr key={inst.id}>
                      <td style={{fontWeight:500}}>{inst.nombre} {inst.apellido}</td>
                      <td>{tar?.porcentaje_grupal||'—'}%</td>
                      <td>{tar?.porcentaje_individual||'—'}%</td>
                      <td>{tar?.tarifa_hora?`$${Number(tar.tarifa_hora).toLocaleString('es-AR')}`:'—'}</td>
                      <td>
                        {liq ? (
                          <div>
                            <div style={{fontWeight:500, color: liq.pagado?'#2D7A5A':'#B03030'}}>
                              ${Math.round(liq.monto_neto).toLocaleString('es-AR')} {liq.pagado?'✓ Pagado':'Pendiente'}
                            </div>
                            <div style={{fontSize:10, color:'var(--sl-m)'}}>
                              {liq.clases_grupales} grup. · {liq.clases_individuales} ind. · {liq.porcentaje}%
                            </div>
                          </div>
                        ) : <span style={{color:'var(--sl-m)',fontSize:11}}>Sin liquidar</span>}
                      </td>
                      <td style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                        <button className="btn-sec" style={{fontSize:11,padding:'4px 8px'}}
                          onClick={() => {
                            setModalTarifa(inst)
                            const t = tarifas[inst.id]
                            setTarForm({ porcentaje_grupal:t?.porcentaje_grupal||40, porcentaje_individual:t?.porcentaje_individual||50, tarifa_hora:t?.tarifa_hora||0 })
                          }}>Tarifa</button>
                        {!liq?.pagado && (
                          <button className="btn-pri" style={{fontSize:11,padding:'4px 8px'}}
                            onClick={() => generarLiquidacion(inst)} disabled={saving}>
                            {saving?'…':'Liquidar'}
                          </button>
                        )}
                        {liq && !liq.pagado && (
                          <button className="btn-sec" style={{fontSize:11,padding:'4px 8px',color:'#2D7A5A',borderColor:'#6DC49A'}}
                            onClick={() => marcarLiqPagada(liq.id)}>Marcar pagado</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ===== PACKS PREPAGO ===== */}
      {tab === 'packs' && (
        <>
          <div style={{marginBottom:14}}>
            <button className="btn-pri" onClick={() => {
              setPackForm({alumno_id:'',nombre:'',clases_total:10,precio:'',fecha_inicio:'',fecha_vencimiento:'',alerta_clases_restantes:2})
              setModalPack(true)
            }}>+ Nuevo pack</button>
          </div>
          <div className="panel">
            <div className="ph"><span className="ph-title">Packs activos</span></div>
            <table className="tbl">
              <thead><tr><th>Alumno</th><th>Pack</th><th>Clases</th><th>Usadas</th><th>Restantes</th><th>Vencimiento</th><th>Estado</th></tr></thead>
              <tbody>
                {packs.length===0 && <tr><td colSpan={7} className="empty">Sin packs registrados</td></tr>}
                {packs.map(pk => {
                  const restantes = pk.clases_total - pk.clases_usadas
                  const pct = Math.round((pk.clases_usadas/pk.clases_total)*100)
                  return (
                    <tr key={pk.id}>
                      <td style={{fontWeight:500, cursor:'pointer', color:'var(--mg)'}}
                        onClick={() => window.dispatchEvent(new CustomEvent('open-ficha-alumno',{detail:pk.alumno_id}))}>
                        {pk.alumnos?.nombre} {pk.alumnos?.apellido}
                      </td>
                      <td>{pk.nombre}</td>
                      <td>{pk.clases_total}</td>
                      <td>
                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                          {pk.clases_usadas}
                          <div style={{width:40,height:3,background:'var(--sl-l)',borderRadius:99,overflow:'hidden'}}>
                            <div style={{height:'100%',width:`${pct}%`,background:restantes<=2?'#E24B4A':'#48A999',borderRadius:99}} />
                          </div>
                        </div>
                      </td>
                      <td>
                        <span style={{fontWeight:500,color:restantes<=2?'#B03030':restantes<=4?'#7A5010':'#2D7A5A'}}>
                          {restantes}
                        </span>
                      </td>
                      <td style={{fontSize:11,color:'var(--sl-m)'}}>{pk.fecha_vencimiento||'—'}</td>
                      <td>
                        <span className={`est ${pk.activo&&restantes>0?'e-ok':restantes<=0?'e-ve':'e-pe'}`}>
                          {!pk.activo?'Inactivo':restantes<=0?'Agotado':restantes<=2?'Por vencer':'Activo'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ===== CONFIGURACIÓN ===== */}
      {tab === 'config' && (
        <div className="panel" style={{maxWidth:480}}>
          <div className="ph"><span className="ph-title">Configuración del estudio</span></div>
          <div style={{padding:'20px 22px'}}>
            <div className="form-row">
              <label className="form-lbl">Nombre del estudio</label>
              <input className="form-inp" value={config.nombre_estudio||''} onChange={e=>setConfig(c=>({...c,nombre_estudio:e.target.value}))} />
            </div>
            <div style={{fontSize:12, color:'var(--sl-m)', marginBottom:10, fontWeight:500}}>Período de cobro mensual</div>
            <div className="form-row2">
              <div className="form-row" style={{marginBottom:0}}>
                <label className="form-lbl">Desde el día</label>
                <input className="form-inp" type="number" min={1} max={28} value={config.cobro_dia_inicio||1}
                  onChange={e=>setConfig(c=>({...c,cobro_dia_inicio:e.target.value}))} />
              </div>
              <div className="form-row" style={{marginBottom:0}}>
                <label className="form-lbl">Hasta el día</label>
                <input className="form-inp" type="number" min={1} max={31} value={config.cobro_dia_fin||10}
                  onChange={e=>setConfig(c=>({...c,cobro_dia_fin:e.target.value}))} />
              </div>
            </div>
            <div style={{fontSize:11, color:'var(--sl-m)', marginTop:6, marginBottom:16}}>
              El dashboard mostrará alerta de cobro durante este período cada mes.
            </div>
            <button className="btn-pri" onClick={guardarConfig} disabled={savingConfig}>
              {savingConfig?'Guardando…':'Guardar configuración'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL: Tarifa instructor */}
      {modalTarifa && (
        <Modal title={`Tarifa — ${modalTarifa.nombre} ${modalTarifa.apellido}`}
          onClose={() => setModalTarifa(null)}
          footer={<>
            <button className="btn-sec" onClick={() => setModalTarifa(null)}>Cancelar</button>
            <button className="btn-pri" onClick={guardarTarifa} disabled={saving}>{saving?'Guardando…':'Guardar'}</button>
          </>}>
          <div className="form-row2">
            <div className="form-row" style={{marginBottom:0}}>
              <label className="form-lbl">% sobre clases grupales</label>
              <input className="form-inp" type="number" min={0} max={100} value={tarForm.porcentaje_grupal}
                onChange={e=>setTarForm(f=>({...f,porcentaje_grupal:e.target.value}))} />
            </div>
            <div className="form-row" style={{marginBottom:0}}>
              <label className="form-lbl">% sobre clases individuales</label>
              <input className="form-inp" type="number" min={0} max={100} value={tarForm.porcentaje_individual}
                onChange={e=>setTarForm(f=>({...f,porcentaje_individual:e.target.value}))} />
            </div>
          </div>
          <div className="form-row" style={{marginTop:14}}>
            <label className="form-lbl">Tarifa por hora (opcional)</label>
            <input className="form-inp" type="number" value={tarForm.tarifa_hora}
              onChange={e=>setTarForm(f=>({...f,tarifa_hora:e.target.value}))} placeholder="0" />
          </div>
        </Modal>
      )}

      {/* MODAL: Nuevo pack */}
      {modalPack && (
        <Modal title="Nuevo pack prepago"
          onClose={() => setModalPack(null)}
          footer={<>
            <button className="btn-sec" onClick={() => setModalPack(null)}>Cancelar</button>
            <button className="btn-pri" onClick={guardarPack} disabled={saving}>{saving?'Guardando…':'Guardar pack'}</button>
          </>}>
          <div className="form-row">
            <label className="form-lbl">Alumno</label>
            <select className="form-inp" value={packForm.alumno_id} onChange={e=>setPackForm(f=>({...f,alumno_id:e.target.value}))}>
              <option value="">Seleccioná un alumno</option>
              {alumnos.map(a => <option key={a.id} value={a.id}>{a.nombre} {a.apellido}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label className="form-lbl">Nombre del pack</label>
            <input className="form-inp" value={packForm.nombre} onChange={e=>setPackForm(f=>({...f,nombre:e.target.value}))} placeholder="Ej: Pack 10 clases" />
          </div>
          <div className="form-row2">
            <div className="form-row" style={{marginBottom:0}}>
              <label className="form-lbl">Cantidad de clases</label>
              <input className="form-inp" type="number" min={1} value={packForm.clases_total} onChange={e=>setPackForm(f=>({...f,clases_total:e.target.value}))} />
            </div>
            <div className="form-row" style={{marginBottom:0}}>
              <label className="form-lbl">Precio total</label>
              <input className="form-inp" type="number" value={packForm.precio} onChange={e=>setPackForm(f=>({...f,precio:e.target.value}))} placeholder="0" />
            </div>
          </div>
          <div className="form-row2" style={{marginTop:14}}>
            <div className="form-row" style={{marginBottom:0}}>
              <label className="form-lbl">Fecha inicio</label>
              <input className="form-inp" type="date" value={packForm.fecha_inicio} onChange={e=>setPackForm(f=>({...f,fecha_inicio:e.target.value}))} />
            </div>
            <div className="form-row" style={{marginBottom:0}}>
              <label className="form-lbl">Vencimiento</label>
              <input className="form-inp" type="date" value={packForm.fecha_vencimiento} onChange={e=>setPackForm(f=>({...f,fecha_vencimiento:e.target.value}))} />
            </div>
          </div>
          <div className="form-row" style={{marginTop:14}}>
            <label className="form-lbl">Alertar cuando queden X clases</label>
            <input className="form-inp" type="number" min={1} max={5} value={packForm.alerta_clases_restantes} onChange={e=>setPackForm(f=>({...f,alerta_clases_restantes:e.target.value}))} />
          </div>
        </Modal>
      )}
    </>
  )
}
