import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Email o contraseña incorrectos')
    setLoading(false)
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--dark)' }}>
      <div style={{ background:'var(--white)', borderRadius:20, padding:'40px 36px', width:360, maxWidth:'92vw', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:28, fontWeight:300, color:'var(--dark)' }}>Studio</div>
          <div style={{ fontSize:10, letterSpacing:'0.2em', color:'var(--mg-m)', textTransform:'uppercase', marginTop:4 }}>Pilates Reformer</div>
        </div>

        <form onSubmit={handleLogin}>
          <div className="form-row">
            <label className="form-lbl">Email</label>
            <input className="form-inp" type="email" value={email}
              onChange={e => setEmail(e.target.value)} required placeholder="admin@studio.com" />
          </div>

          <div className="form-row">
            <label className="form-lbl">Contraseña</label>
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

          {error && (
            <div style={{ fontSize:12, color:'#B03030', marginBottom:12, padding:'8px 12px', background:'#FDECEA', borderRadius:8 }}>
              {error}
            </div>
          )}

          <button className="btn-pri" type="submit" disabled={loading}
            style={{ width:'100%', padding:'10px', fontSize:14, marginTop:4 }}>
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
