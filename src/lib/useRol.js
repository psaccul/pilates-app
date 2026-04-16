import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Roles:
//   'administrador' — acceso completo incluyendo finanzas
//   'instructor'    — acceso limitado: calendario, alumnos, pagos
// Default sin registro = 'administrador'

export function useRol() {
  const [rol, setRol]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId]   = useState(null)

  useEffect(() => {
    async function fetchRol() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setUserId(user.id)
      const { data } = await supabase
        .from('user_roles')
        .select('rol')
        .eq('user_id', user.id)
        .maybeSingle()
      // Default: administrador
      setRol(data?.rol || 'administrador')
      setLoading(false)
    }
    fetchRol()
  }, [])

  return {
    rol,
    loading,
    userId,
    esAdmin:      rol === 'administrador',
    esInstructor: rol === 'instructor',
  }
}
