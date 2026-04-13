export default function Toggle({ value, onChange, labelOn = 'Sí', labelOff = 'No', colorOn = 'var(--teal)' }) {
  return (
    <div className="toggle-wrap" onClick={() => onChange(!value)}>
      <div className={`toggle${value ? ' on' : ''}`} style={value ? {background:colorOn,borderColor:colorOn} : {}}>
        <div className="toggle-knob" />
      </div>
      <span style={{ fontSize: 11, color: value ? colorOn : 'var(--sl-m)', fontWeight: 500 }}>
        {value ? labelOn : labelOff}
      </span>
    </div>
  )
}
