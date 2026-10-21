import { Check } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

export function Checkbox({ label, checked, onChange, ...props }) {
  const { colors } = useTheme();

  const containerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
  };

  const checkboxStyle = {
    width: '1.25rem',
    height: '1.25rem',
    border: `2px solid ${checked ? colors.primary : colors.border}`,
    borderRadius: '0.25rem',
    backgroundColor: checked ? colors.primary : 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
    flexShrink: 0,
  };

  const labelStyle = {
    fontSize: '0.875rem',
    color: colors.text,
    userSelect: 'none',
  };

  return (
    <label style={containerStyle} {...props}>
      <div style={checkboxStyle}>
        {checked && <Check size={16} color={colors.primaryText} strokeWidth={3} />}
      </div>
      <span style={labelStyle}>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ display: 'none' }}
      />
    </label>
  );
}
