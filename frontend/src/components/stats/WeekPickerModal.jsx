import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

export function WeekPickerModal({ isOpen, onClose, currentWeek, onSelectWeek, selectedRange = [], rangeCount = 1 }) {
  const { colors } = useTheme();
  const [viewYear, setViewYear] = useState(() => {
    const [year] = currentWeek.split('-').map(Number);
    return year;
  });
  const [pendingSelection, setPendingSelection] = useState(currentWeek);

  useEffect(() => {
    if (isOpen) {
      setPendingSelection(currentWeek);
      const [year] = currentWeek.split('-').map(Number);
      setViewYear(year);
    }
  }, [isOpen, currentWeek]);

  if (!isOpen) return null;

  // Calculate range based on pending selection for multi-week mode
  function getPendingRange() {
    if (rangeCount <= 1) return [];

    const [year, weekNum] = pendingSelection.split('-').map(Number);
    const range = [];

    for (let i = 0; i < rangeCount; i++) {
      let currentWeek = weekNum + i;
      let currentYear = year;

      // Handle year overflow - check if current year has 53 weeks
      const weeksInYear = getWeeksInYear(currentYear).length;
      while (currentWeek > weeksInYear) {
        currentWeek -= weeksInYear;
        currentYear++;
      }

      range.push(`${currentYear}-${String(currentWeek).padStart(2, '0')}`);
    }

    return range;
  }

  function isInSelectedRange(weekIdentifier) {
    const pendingRange = getPendingRange();
    if (pendingRange.length > 0) {
      return pendingRange.includes(weekIdentifier);
    }
    if (selectedRange.length === 0) return false;
    return selectedRange.includes(weekIdentifier);
  }

  function getDateOfISOWeek(week, year) {
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = simple;
    if (dow <= 4)
      ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    else
      ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
    return ISOweekStart;
  }

  function getWeeksInYear(year) {
    const weeks = [];
    for (let week = 1; week <= 52; week++) {
      const startDate = getDateOfISOWeek(week, year);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);

      weeks.push({
        week,
        identifier: `${year}-${String(week).padStart(2, '0')}`,
        startDate,
        endDate,
      });
    }

    const lastWeek = getDateOfISOWeek(53, year);
    if (lastWeek.getFullYear() === year) {
      const endDate = new Date(lastWeek);
      endDate.setDate(endDate.getDate() + 6);
      weeks.push({
        week: 53,
        identifier: `${year}-53`,
        startDate: lastWeek,
        endDate,
      });
    }

    return weeks;
  }

  // Get weeks for current year
  let weeks = getWeeksInYear(viewYear);

  // Check if pending range includes weeks from next year
  const pendingRange = getPendingRange();
  const hasNextYear = pendingRange.some(id => {
    const [year] = id.split('-').map(Number);
    return year > viewYear;
  });

  // If range spans to next year, add those weeks too
  if (hasNextYear && rangeCount > 1) {
    const nextYearWeeks = getWeeksInYear(viewYear + 1);
    // Add first N weeks from next year (up to rangeCount to avoid too many weeks)
    const weeksToAdd = nextYearWeeks.slice(0, Math.min(rangeCount, 4));
    weeks = [...weeks, ...weeksToAdd];
  }

  const today = new Date();
  const currentWeekInfo = weeks.find(w => {
    return today >= w.startDate && today <= w.endDate;
  });

  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '1rem',
  };

  const modalStyle = {
    backgroundColor: colors.background,
    borderRadius: '0.5rem',
    width: '100%',
    maxWidth: '900px',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  };

  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1.25rem',
    borderBottom: `1px solid ${colors.border}`,
  };

  const titleStyle = {
    fontSize: '1.25rem',
    fontWeight: '700',
    color: colors.text,
  };

  const closeButtonStyle = {
    backgroundColor: 'transparent',
    border: 'none',
    color: colors.textSecondary,
    cursor: 'pointer',
    padding: '0.25rem',
    borderRadius: '0.25rem',
    display: 'flex',
    alignItems: 'center',
    transition: 'background-color 0.2s',
  };

  const yearNavigationStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem',
    padding: '1rem',
    borderBottom: `1px solid ${colors.border}`,
  };

  const yearButtonStyle = {
    backgroundColor: 'transparent',
    border: 'none',
    color: colors.text,
    cursor: 'pointer',
    padding: '0.5rem',
    borderRadius: '0.25rem',
    display: 'flex',
    alignItems: 'center',
    transition: 'background-color 0.2s',
  };

  const yearTextStyle = {
    fontSize: '1.5rem',
    fontWeight: '700',
    color: colors.text,
    minWidth: '100px',
    textAlign: 'center',
  };

  const contentStyle = {
    flex: 1,
    overflow: 'auto',
    padding: '1.5rem',
  };

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: '0.6rem',
  };

  const weekCardStyle = (isSelected, isCurrentWeek, inRange) => ({
    padding: '0.6rem 0.75rem',
    border: `2px solid ${isSelected || inRange ? colors.primary : isCurrentWeek ? colors.success : colors.border}`,
    borderRadius: '0.375rem',
    backgroundColor: isSelected || inRange ? `${colors.primary}10` : isCurrentWeek ? `${colors.success}10` : colors.surface,
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  });

  const weekNumberStyle = (isSelected, isCurrentWeek, inRange) => ({
    fontSize: '1rem',
    fontWeight: '700',
    color: isSelected || inRange ? colors.primary : isCurrentWeek ? colors.success : colors.text,
  });

  const dateRangeStyle = {
    fontSize: '0.75rem',
    color: colors.textSecondary,
    lineHeight: '1.2',
  };

  const footerStyle = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.75rem',
    padding: '1rem 1.25rem',
    borderTop: `1px solid ${colors.border}`,
  };

  const cancelButtonStyle = {
    padding: '0.5rem 1.25rem',
    backgroundColor: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '0.375rem',
    color: colors.text,
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
    transition: 'all 0.2s',
  };

  const confirmButtonStyle = {
    padding: '0.5rem 1.25rem',
    backgroundColor: colors.primary,
    border: 'none',
    borderRadius: '0.375rem',
    color: colors.primaryText,
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
    transition: 'all 0.2s',
  };

  function handleConfirm() {
    onSelectWeek(pendingSelection);
    onClose();
  }

  function handleCancel() {
    setPendingSelection(currentWeek);
    onClose();
  }

  return (
    <div style={overlayStyle} onClick={handleCancel}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={titleStyle}>Selecionar Semana</h2>
          <button
            style={closeButtonStyle}
            onClick={handleCancel}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.surfaceHover}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <X size={24} />
          </button>
        </div>

        <div style={yearNavigationStyle}>
          <button
            style={yearButtonStyle}
            onClick={() => setViewYear(viewYear - 1)}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.surfaceHover}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <ChevronLeft size={24} />
          </button>

          <div style={yearTextStyle}>{viewYear}</div>

          <button
            style={yearButtonStyle}
            onClick={() => setViewYear(viewYear + 1)}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.surfaceHover}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <ChevronRight size={24} />
          </button>
        </div>

        <div style={contentStyle}>
          <div style={gridStyle}>
            {weeks.map((weekInfo) => {
              const isSelected = weekInfo.identifier === pendingSelection;
              const isCurrentWeek = currentWeekInfo?.identifier === weekInfo.identifier;
              const inRange = isInSelectedRange(weekInfo.identifier);

              return (
                <div
                  key={weekInfo.identifier}
                  style={weekCardStyle(isSelected, isCurrentWeek, inRange)}
                  onClick={() => setPendingSelection(weekInfo.identifier)}
                  onMouseEnter={(e) => {
                    if (!isSelected && !inRange) {
                      e.currentTarget.style.backgroundColor = colors.surfaceHover;
                      e.currentTarget.style.borderColor = colors.primary;
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = `0 4px 12px ${colors.primary}30`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected && !inRange) {
                      e.currentTarget.style.backgroundColor = isCurrentWeek ? `${colors.success}10` : colors.surface;
                      e.currentTarget.style.borderColor = isCurrentWeek ? colors.success : colors.border;
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }
                  }}
                >
                  <div style={weekNumberStyle(isSelected, isCurrentWeek, inRange)}>
                    Semana {weekInfo.week}
                    {isCurrentWeek && <span style={{ marginLeft: '0.25rem', fontSize: '0.65rem', fontWeight: '500' }}>(Atual)</span>}
                  </div>
                  <div style={dateRangeStyle}>
                    {weekInfo.startDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} - {weekInfo.endDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={footerStyle}>
          <button
            style={cancelButtonStyle}
            onClick={handleCancel}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.surfaceHover}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            Cancelar
          </button>
          <button
            style={confirmButtonStyle}
            onClick={handleConfirm}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
