import { useTheme } from '../../contexts/ThemeContext';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  fullWidth = false,
  icon,
  onClick,
  type = 'button',
  className = '',
  ...props
}) {
  const { colors } = useTheme();

  const baseStyles = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    fontWeight: '500',
    borderRadius: '0.375rem',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background-color 0.2s, border-color 0.2s',
    fontFamily: 'inherit',
    opacity: disabled ? 0.5 : 1,
    width: fullWidth ? '100%' : 'auto',
    flexShrink: 0,
  };

  const variants = {
    primary: {
      backgroundColor: colors.primary,
      color: colors.primaryText,
      ':hover': {
        backgroundColor: disabled ? colors.primary : colors.primaryHover,
      }
    },
    secondary: {
      backgroundColor: colors.surface,
      color: colors.text,
      border: `1px solid ${colors.border}`,
      ':hover': {
        backgroundColor: disabled ? colors.surface : colors.surfaceHover,
      }
    },
    outline: {
      backgroundColor: 'transparent',
      color: colors.text,
      border: `1px solid ${colors.border}`,
      ':hover': {
        backgroundColor: disabled ? 'transparent' : colors.surface,
      }
    },
    ghost: {
      backgroundColor: 'transparent',
      color: colors.text,
      ':hover': {
        backgroundColor: disabled ? 'transparent' : colors.surface,
      }
    },
    danger: {
      backgroundColor: colors.error,
      color: '#ffffff',
      ':hover': {
        backgroundColor: disabled ? colors.error : '#dc2626',
      }
    }
  };

  const sizes = {
    sm: { padding: '0.375rem 0.75rem', fontSize: '0.875rem' },
    md: { padding: '0.5rem 1rem', fontSize: '0.875rem' },
    lg: { padding: '0.625rem 1.25rem', fontSize: '1rem' },
  };

  // Fallback to primary if variant doesn't exist
  const currentVariant = variants[variant] || variants.primary;

  const style = {
    ...baseStyles,
    ...sizes[size],
    ...currentVariant,
  };

  // Store original styles for proper reset
  const originalBgColor = currentVariant.backgroundColor;
  const hoverBgColor = currentVariant[':hover']?.backgroundColor || originalBgColor;

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={style}
      className={className}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = hoverBgColor;
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = originalBgColor;
        }
      }}
      onMouseDown={(e) => {
        // Prevent size change on click
        e.currentTarget.style.transform = 'none';
      }}
      {...props}
    >
      {icon && <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</span>}
      {children}
    </button>
  );
}
