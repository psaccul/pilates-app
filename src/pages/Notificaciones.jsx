import { useState } from 'react'

const CONFIG_INICIAL = [
  { id: 'recordatorio', label: 'Recordatorio de clase', desc: 'Se envía 2 hs antes de cada turno', activo: true },
  { id: 'pago_pendiente', label: 'Pago pendiente', desc: 'Se envía si el alumno no pagó al inicio del mes', activo: true },
  { id: 'cancelacion', label: 'Cancelación de clase', desc: 'Avisa a los alumnos si se cancela un turno', activo: true },
  { id: 'bienvenida', label: 'Bienvenida a nuevos alumnos', desc: 'Se envía al registrar un alumno nuevo', activo: false },
]

const HISTORIAL = [
  { ic: '💬', titulo: 'Recordatorio enviado', desc: 'Sofía Ramírez — Reformer Intermedio hoy 08:00 hs', hace: 'hace 2 hs' },
  { ic: '💬', titulo: 'Aviso de pago', desc: 'Marcos Vidal — Plan mensual de Abril pendiente', hace: 'hace 1 día' },
  { ic: '💬', titulo: 'Recordatorio enviado', desc: 'Camila López — Reformer Principiantes ayer 10:00 hs', hace: 'hace 1 día' },
  { ic: '👋', titulo: 'Bienvenida enviada', desc: 'Roberto Silva — nuevo alumno registrado', hace: 'hace 3 días' },
]

export default function Notificaciones() {
  const [config, setConfig] = useState(CONFIG_INICIAL)

  function toggleConfig(id) {
    setConfig(prev => prev.map(c => c.id === id ? { ...c, activo: !c.activo } : c))
  }

  return (
    <>
      <div style={{
        background:'#FEF3E2', border:'1px solid #F0C060', borderRadius:10,
        padding:'12px 16px', fontSize:12, color:'#7A5010', marginBottom:18,
        display:'flex', gap:10, alignItems:'flex-start'
      }}>
        <span style={{fontSize:16}}>⚠️</span>
        <div>
          <strong>Para activar los envíos de WhatsApp</strong> necesitás conectar Twilio o la API oficial de Meta.
          Esto requiere una cuenta externa. Escribí "configurar WhatsApp" cuando estés lista para ese paso.
        </div>
      </div>

      <div className="grid2">
        <div className="panel">
          <div className="ph"><span className="ph-title">Recordatorios automáticos</span></div>
          <div style={{padding:'16px 18px', display:'flex', flexDirection:'column', gap:16}}>
            {config.map(c => (
              <div key={c.id} className="notif-row" style={{marginBottom:0}}>
                <div>
                  <div style={{fontSize:13, fontWeight:500}}>{c.label}</div>
                  <div style={{fontSize:11, color:'var(--sl-m)', marginTop:2}}>{c.desc}</div>
                </div>
                <div style={{display:'flex', alignItems:'center', gap:7, cursor:'pointer'}}
                  onClick={() => toggleConfig(c.id)}>
                  <div className={`toggle${c.activo?' on':''}`}>
                    <div className="toggle-knob" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="ph"><span className="ph-title">Últimas notificaciones</span></div>
          {HISTORIAL.map((h, i) => (
            <div key={i} className="notif-item">
              <div className="notif-ic">{h.ic}</div>
              <div style={{flex:1}}>
                <div className="notif-title">{h.titulo}</div>
                <div className="notif-desc">{h.desc}</div>
              </div>
              <div style={{fontSize:10, color:'var(--sl-m)', whiteSpace:'nowrap', marginLeft:8}}>{h.hace}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
