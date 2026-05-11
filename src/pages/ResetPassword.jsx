import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function ResetPassword({ onDone }) {
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [showPass, setShowPass]   = useState(false)
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [done, setDone]           = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return }
    if (password.length < 6)  { setError('La contraseña debe tener al menos 6 caracteres'); return }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) setError('No se pudo actualizar la contraseña. Intentá de nuevo.')
    else setDone(true)
    setLoading(false)
  }

  const wrapStyle = {
    minHeight:'100vh', display:'flex', alignItems:'center',
    justifyContent:'center', background:'var(--dark)'
  }
  const cardStyle = {
    background:'var(--white)', borderRadius:20, padding:'40px 36px',
    width:360, maxWidth:'92vw', boxShadow:'0 20px 60px rgba(0,0,0,0.2)'
  }

  if (done) {
    return (
      <div style={wrapStyle}>
        <div style={{ ...cardStyle, textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:16 }}>✅</div>
          <div style={{ fontWeight:600, marginBottom:8 }}>Contraseña actualizada</div>
          <div style={{ fontSize:13, color:'var(--mg-m)', marginBottom:24 }}>
            Ya podés ingresar con tu nueva contraseña.
          </div>
          <button className="btn-pri" onClick={onDone} style={{ width:'100%', padding:'10px', fontSize:14 }}>
            Ir al inicio de sesión
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={wrapStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:28, fontWeight:300, color:'var(--dark)' }}>Studio</div>
          <div style={{ fontSize:10, letterSpacing:'0.2em', color:'var(--mg-m)', textTransform:'uppercase', marginTop:4 }}>Pilates Reformer</div>
        </div>

        <div style={{ fontWeight:600, marginBottom:6 }}>Nueva contraseña</div>
        <div style={{ fontSize:13, color:'var(--mg-m)', marginBottom:20 }}>
          Elegí una contraseña nueva para tu cuenta.
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label className="form-lbl">Nueva contraseña</label>
            <div style={{ position:'relative' }}>
              <input className="form-inp" type={showPass ? 'text' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
                style={{ paddingRight:42 }} />
              <button type="button" onClick={() => setShowPass(s => !s)}
                style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--sl-m)', fontSize:16, padding:4, lineHeight:1 }}>
                {showPass ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <div className="form-row">
            <label className="form-lbl">Confirmar contraseña</label>
            <input className="form-inp" type={showPass ? 'text' : 'password'} value={confirm}
              onChange={e => setConfirm(e.target.value)} required placeholder="••••••••" />
          </div>

          {error && (
            <div style={{ fontSize:12, color:'#B03030', marginBottom:12, padding:'8px 12px', background:'#FDECEA', borderRadius:8 }}>
              {error}
            </div>
          )}

          <button className="btn-pri" type="submit" disabled={loading}
            style={{ width:'100%', padding:'10px', fontSize:14, marginTop:4 }}>
            {loading ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}
