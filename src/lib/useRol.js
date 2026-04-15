import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useRol() {
  const [rol, setRol] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchRol() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data } = await supabase
        .from('user_roles')
        .select('rol')
        .eq('user_id', user.id)
        .maybeSingle()
      setRol(data?.rol || 'admin')
      setLoading(false)
    }
    fetchRol()
  }, [])

  return { rol, loading, esGerente: rol === 'gerente' }
}
