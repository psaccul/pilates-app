import { supabase } from './supabase'
import { format, addDays, addWeeks, startOfWeek } from 'date-fns'

export const HORIZON_SEMANAS = 8

function ocurrencias(horarios, desde) {
  const inicio = new Date(desde); inicio.setHours(0,0,0,0)
  const out = []
  for (let semana = 0; semana < HORIZON_SEMANAS; semana++) {
    for (const h of horarios) {
      const base = addWeeks(inicio, semana)
      const inicioSemana = startOfWeek(base, { weekStartsOn: 1 })
      const fechaDia = addDays(inicioSemana, Number(h.dia_semana))
      if (fechaDia < inicio) continue
      out.push({
        fecha: format(fechaDia, 'yyyy-MM-dd'), hora: h.hora, instructor_id: h.instructor_id || null,
        sala: h.sala || 'Sala A', nombre_clase: h.nombre_clase, alumno_id: h.alumno_id,
      })
    }
  }
  return out
}

const slotKey = o => `${o.fecha}|${o.hora}|${o.instructor_id ?? 'null'}`

// Dado un conjunto de ocurrencias (fecha+hora+instructor+alumno), asegura que existan
// las clases y las asistencias correspondientes, en pocas consultas en lote.
async function asegurarClases(ocs) {
  if (ocs.length === 0) return
  const fechas = ocs.map(o => o.fecha)
  const desde = fechas.reduce((a,b)=> a<b?a:b)
  const hasta = fechas.reduce((a,b)=> a>b?a:b)
  const { data: existentes } = await supabase.from('clases').select('id,fecha,hora,instructor_id').gte('fecha', desde).lte('fecha', hasta)
  const idPorSlot = new Map()
  for (const c of existentes || []) idPorSlot.set(`${c.fecha}|${c.hora}|${c.instructor_id ?? 'null'}`, c.id)

  const slotsVistos = new Set()
  const aInsertar = []
  for (const o of ocs) {
    const key = slotKey(o)
    if (idPorSlot.has(key) || slotsVistos.has(key)) continue
    slotsVistos.add(key)
    aInsertar.push({ nombre: o.nombre_clase, tipo: 'grupal', instructor_id: o.instructor_id, fecha: o.fecha, hora: o.hora, sala: o.sala, capacidad: 4 })
  }
  if (aInsertar.length > 0) {
    const { data: nuevas } = await supabase.from('clases').insert(aInsertar).select('id,fecha,hora,instructor_id')
    for (const c of nuevas || []) idPorSlot.set(`${c.fecha}|${c.hora}|${c.instructor_id ?? 'null'}`, c.id)
  }

  const vistosAsist = new Set()
  const asistencias = []
  for (const o of ocs) {
    const claseId = idPorSlot.get(slotKey(o))
    if (!claseId) continue
    const k = `${claseId}|${o.alumno_id}`
    if (vistosAsist.has(k)) continue
    vistosAsist.add(k)
    asistencias.push({ clase_id: claseId, alumno_id: o.alumno_id, asistio: false, recuperacion: false, estado_asistencia: 'pendiente' })
  }
  if (asistencias.length > 0) {
    await supabase.from('asistencias').upsert(asistencias, { onConflict: 'clase_id,alumno_id' })
  }
}

export async function generarClasesParaHorarios(horarios, alumnoId, desde = new Date()) {
  await asegurarClases(ocurrencias(horarios.map(h => ({ ...h, alumno_id: alumnoId })), desde))
}

// Top-up diario: para cada horario fijo activo, asegura que existan clases generadas
// hasta HORIZON_SEMANAS hacia adelante. Así un horario cargado una vez sigue generando
// clases automáticamente hasta que se modifique o se dé de baja.
export async function generarClasesRolling() {
  const hoy = format(new Date(), 'yyyy-MM-dd')
  if (localStorage.getItem('pilates_lastClasesGen') === hoy) return
  const { data: horarios } = await supabase.from('horarios_alumno').select('*').eq('activo', true)
  if (horarios?.length) await asegurarClases(ocurrencias(horarios, new Date()))
  localStorage.setItem('pilates_lastClasesGen', hoy)
}
