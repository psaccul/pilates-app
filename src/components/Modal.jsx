export default function Modal({ title, onClose, children, footer }) {
  return (
    <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="mh">
          <span className="mh-title">{title}</span>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="mc">{children}</div>
        {footer && <div className="mf">{footer}</div>}
      </div>
    </div>
  )
}
