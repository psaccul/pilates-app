const COLORS = [
  'linear-gradient(135deg,#C0396B,#8B1A42)',
  'linear-gradient(135deg,#4A6FA5,#2C4A7A)',
  'linear-gradient(135deg,#48A999,#2A6B62)',
  'linear-gradient(135deg,#9B6BBB,#6A3A8A)',
]

export default function Avatar({ nombre = '', apellido = '', size = 30, fontSize = 10 }) {
  const initials = `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase()
  const idx = (nombre.charCodeAt(0) + apellido.charCodeAt(0)) % COLORS.length
  return (
    <div className="av" style={{
      width: size, height: size, fontSize,
      background: COLORS[idx], flexShrink: 0
    }}>
      {initials}
    </div>
  )
}
