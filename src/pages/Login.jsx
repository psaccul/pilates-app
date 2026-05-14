import { useState } from 'react'
import { supabase } from '../lib/supabase'

const cardStyle = {
  background:'var(--white)', borderRadius:20, overflow:'hidden',
  width:360, maxWidth:'92vw', boxShadow:'0 20px 60px rgba(0,0,0,0.2)'
}
const wrapStyle = {
  minHeight:'100vh', display:'flex', alignItems:'center',
  justifyContent:'center', background:'var(--dark)'
}

function Logo() {
  return (
    <img src="/cei.png" alt="CEI Pilates Reformer"
      style={{ width:'100%', maxHeight:260, objectFit:'cover', objectPosition:'center center', display:'block' }}/>
  )
}

function ErrorBox({ msg }) {
  return (
    <div style={{ fontSize:12, color:'#B03030', marginBottom:12, padding:'8px 12px', background:'#FDECEA', borderRadius:8 }}>
      {msg}
    </div>
  )
}

function LoginForm({ onForgot }) {
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

      {error && <ErrorBox msg={error} />}

      <button className="btn-pri" type="submit" disabled={loading}
        style={{ width:'100%', padding:'10px', fontSize:14, marginTop:4 }}>
        {loading ? 'Ingresando…' : 'Ingresar'}
      </button>

      <button type="button" onClick={onForgot}
        style={{ width:'100%', marginTop:14, background:'none', border:'none', cursor:'pointer', fontSize:12, color:'var(--mg-m)', textDecoration:'underline' }}>
        ¿Olvidaste tu contraseña?
      </button>
    </form>
  )
}

function ForgotForm({ onBack }) {
  const [email, setEmail]   = useState('')
  const [sent, setSent]     = useState(false)
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleReset(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    if (error) setError('No se pudo enviar el email. Verificá que sea correcto.')
    else setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:36, marginBottom:16 }}>📬</div>
        <div style={{ fontWeight:600, marginBottom:8 }}>Revisá tu email</div>
        <div style={{ fontSize:13, color:'var(--mg-m)', marginBottom:24 }}>
          Te enviamos un link para restablecer tu contraseña. El link expira en 1 hora.
        </div>
        <button type="button" onClick={onBack}
          style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:'var(--mg-m)', textDecoration:'underline' }}>
          Volver al inicio de sesión
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleReset}>
      <div style={{ fontSize:13, color:'var(--mg-m)', marginBottom:20 }}>
        Ingresá tu email y te enviamos un link para crear una nueva contraseña.
      </div>

      <div className="form-row">
        <label className="form-lbl">Email</label>
        <input className="form-inp" type="email" value={email}
          onChange={e => setEmail(e.target.value)} required placeholder="admin@studio.com" />
      </div>

      {error && <ErrorBox msg={error} />}

      <button className="btn-pri" type="submit" disabled={loading}
        style={{ width:'100%', padding:'10px', fontSize:14, marginTop:4 }}>
        {loading ? 'Enviando…' : 'Enviar link'}
      </button>

      <button type="button" onClick={onBack}
        style={{ width:'100%', marginTop:14, background:'none', border:'none', cursor:'pointer', fontSize:12, color:'var(--mg-m)', textDecoration:'underline' }}>
        Volver
      </button>
    </form>
  )
}

export default function Login() {
  const [view, setView] = useState('login')

  return (
    <div style={wrapStyle}>
      <div style={cardStyle}>
        <Logo />
        <div style={{ padding:'32px 36px 36px' }}>
          {view === 'login'
            ? <LoginForm onForgot={() => setView('forgot')} />
            : <ForgotForm onBack={() => setView('login')} />
          }
        </div>
      </div>
    </div>
  )
}
