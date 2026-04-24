/* global React */
const { useState } = React;

// ── Icon (Lucide via CDN) ──────────────────────────────────
const Icon = ({ name, size = 16, className = '', style = {} }) => (
  <i data-lucide={name} style={{ width: size, height: size, ...style }} className={className} />
);

// ── Button ─────────────────────────────────────────────────
const Button = ({ variant = 'primary', size, onClick, disabled, children, icon, type = 'button' }) => {
  const cls = ['lfc-btn', `lfc-btn--${variant}`, size && `lfc-btn--${size}`].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </button>
  );
};

// ── Badge ──────────────────────────────────────────────────
const Badge = ({ variant = 'neutral', dot = false, children }) => (
  <span className={`lfc-badge lfc-badge--${variant} ${dot ? 'lfc-badge--dot' : ''}`}>{children}</span>
);

// ── Permission chip ────────────────────────────────────────
const PermChip = ({ children }) => {
  const [resource, action] = String(children).split(':');
  return (
    <span className="lfc-perm-chip">
      <span className="lfc-perm-chip__res">{resource}:</span>
      {action}
    </span>
  );
};

// ── Input ──────────────────────────────────────────────────
const Input = ({ label, error, value, onChange, type = 'text', placeholder, icon }) => (
  <div className="lfc-input-group">
    {label && <label className="lfc-input-label" style={error ? { color: 'var(--danger)' } : undefined}>{label}</label>}
    <div className="lfc-input-wrap">
      {icon && <Icon name={icon} size={14} className="lfc-input-icon" />}
      <input
        className={`lfc-input ${error ? 'lfc-input--error' : ''} ${icon ? 'lfc-input--with-icon' : ''}`}
        type={type}
        value={value}
        onChange={e => onChange && onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
    {error && <span className="lfc-input-err">{error}</span>}
  </div>
);

// ── Card ───────────────────────────────────────────────────
const Card = ({ title, right, children, onClick }) => (
  <div className={`lfc-card ${onClick ? 'lfc-card--clickable' : ''}`} onClick={onClick}>
    {(title || right) && (
      <div className="lfc-card__head">
        <span className="lfc-card__title">{title}</span>
        {right}
      </div>
    )}
    <div className="lfc-card__body">{children}</div>
  </div>
);

// ── Alert ──────────────────────────────────────────────────
const Alert = ({ variant = 'info', children, onDismiss }) => {
  const iconName = { success: 'check-circle-2', danger: 'alert-circle', info: 'info', warning: 'alert-triangle' }[variant];
  return (
    <div className={`lfc-alert lfc-alert--${variant}`}>
      <Icon name={iconName} size={16} />
      <div className="lfc-alert__body">{children}</div>
      {onDismiss && (
        <button className="lfc-alert__x" onClick={onDismiss} aria-label="Fechar"><Icon name="x" size={14} /></button>
      )}
    </div>
  );
};

// ── Eyebrow / label ────────────────────────────────────────
const Eyebrow = ({ children, accent }) => (
  <div className={`lfc-eyebrow ${accent ? 'lfc-eyebrow--accent' : ''}`}>{children}</div>
);

Object.assign(window, { Icon, Button, Badge, PermChip, Input, Card, Alert, Eyebrow });
