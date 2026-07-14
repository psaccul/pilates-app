import { supabase } from './supabase'
import { format, addDays, addWeeks, startOfWeek } from 'date-fns'

export const HORIZON_SEMANAS = 8

export async function generarClasesParaHorarios(horarios, alumnoId, desde = new Date()) {
  const inicio = new Date(desde); inicio.setHours(0,0,0,0)
  for (let semana = 0; semana < HORIZON_SEMANAS; semana++) {
    for (const h of horarios) {
      const base = addWeeks(inicio, semana)
      const inicioSemana = startOfWeek(base, { weekStartsOn: 1 })
      const fechaDia = addDays(inicioSemana, Number(h.dia_semana))
      if (fechaDia < inicio) continue
      const fechaStr = format(fechaDia, 'yyyy-MM-dd')
      let q = supabase.from('clases').select('id').eq('fecha', fechaStr).eq('hora', h.hora)
      if (h.instructor_id) q = q.eq('instructor_id', h.instructor_id)
      else q = q.is('instructor_id', null)
      const { data: _ex } = await q.limit(1); const existe = _ex?.[0] || null
      let claseId
      if (!existe) {
        const { data: nueva } = await supabase.from('clases').insert({ nombre: h.nombre_clase, tipo: 'grupal', instructor_id: h.instructor_id || null, fecha: fechaStr, hora: h.hora, sala: h.sala || 'Sala A', capacidad: 4 }).select().single()
        claseId = nueva?.id
      } else claseId = existe.id
      if (claseId) await supabase.from('asistencias').upsert({ clase_id: claseId, alumno_id: alumnoId, asistio: false, recuperacion: false, estado_asistencia: 'pendiente' }, { onConflict: 'clase_id,alumno_id' })
    }
  }
}

// Top-up diario: para cada horario fijo activo, asegura que existan clases generadas
// hasta HORIZON_SEMANAS hacia adelante. Así un horario cargado una vez sigue generando
// clases automáticamente hasta que se modifique o se dé de baja.
export async function generarClasesRolling() {
  const hoy = format(new Date(), 'yyyy-MM-dd')
  if (localStorage.getItem('pilates_lastClasesGen') === hoy) return
  const { data: horarios } = await supabase.from('horarios_alumno').select('*').eq('activo', true)
  const porAlumno = {}
  for (const h of horarios || []) (porAlumno[h.alumno_id] ||= []).push(h)
  for (const [alumnoId, hs] of Object.entries(porAlumno)) {
    await generarClasesParaHorarios(hs, alumnoId)
  }
  localStorage.setItem('pilates_lastClasesGen', hoy)
}
