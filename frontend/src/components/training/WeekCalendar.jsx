import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { Button } from '../common/Button';

export function WeekCalendar({ currentWeek, onWeekSelect, onClose }) {
  const { colors } = useTheme();
  const [selectedYear, setSelectedYear] = useState(currentWeek.year);
  const [tempSelectedWeek, setTempSelectedWeek] = useState(null);
  const calendarRef = useRef(null);
  const today = new Date();

  // Get current week info for highlighting (using local timezone - Brazil)
  const getCurrentWeekInfo = () => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dayNum = d.getDay() || 7; // 0=Sun, 1=Mon, ..., 6=Sat, convert 0 to 7
    const thursday = new Date(d);
    thursday.setDate(d.getDate() + (4 - dayNum)); // Adjust to Thursday
    const yearStart = new Date(thursday.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((thursday - yearStart) / 86400000) + 1) / 7);
    return { year: thursday.getFullYear(), week: weekNo };
  };

  const currentWeekInfo = getCurrentWeekInfo();

  // Get number of weeks in a year (using local timezone)
  const getWeeksInYear = (year) => {
    const lastDay = new Date(year, 11, 31);
    const dayNum = lastDay.getDay() || 7;
    const lastThursday = new Date(year, 11, 31 - dayNum + 4);
    const yearStart = new Date(year, 0, 1);
    return Math.ceil((((lastThursday - yearStart) / 86400000) + 1) / 7);
  };

  const weeksInYear = getWeeksInYear(selectedYear);

  // Generate weeks array
  const weeks = Array.from({ length: weeksInYear }, (_, i) => i + 1);

  const handleWeekClick = (weekNumber) => {
    setTempSelectedWeek(weekNumber);
  };

  const handleConfirm = () => {
    if (tempSelectedWeek === null) return;

    // Calculate the Monday of the selected week (using local timezone - Brazil)
    const jan1 = new Date(selectedYear, 0, 1);
    const daysOffset = (tempSelectedWeek - 1) * 7;
    const targetDate = new Date(jan1.getTime() + daysOffset * 24 * 60 * 60 * 1000);

    // Adjust to Monday
    const dayOfWeek = targetDate.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    targetDate.setDate(targetDate.getDate() + diff);
    targetDate.setHours(0, 0, 0, 0); // Set to start of day

    onWeekSelect({
      year: selectedYear,
      week: tempSelectedWeek,
      identifier: `${selectedYear}-${String(tempSelectedWeek).padStart(2, '0')}`,
      startDate: targetDate,
    });
    onClose();
  };

  const isCurrentWeek = (weekNumber) => {
    return selectedYear === currentWeekInfo.year && weekNumber === currentWeekInfo.week;
  };

  const isSelectedWeek = (weekNumber) => {
    return tempSelectedWeek === weekNumber;
  };

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const calendarStyle = {
    position: 'absolute',
    top: '100%',
    left: '0',
    marginTop: '0.5rem',
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.5rem',
    padding: '0.75rem',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
    zIndex: 1000,
    width: '310px',
    maxHeight: 'calc(100vh - 150px)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };

  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1rem',
    paddingBottom: '0.75rem',
    borderBottom: `1px solid ${colors.border}`,
  };

  const yearStyle = {
    fontSize: '1.125rem',
    fontWeight: '600',
    color: colors.text,
  };

  const weeksGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, 1fr)',
    gap: '0.4rem',
    overflowY: 'auto',
    flex: 1,
    maxHeight: 'calc(100vh - 350px)',
  };

  const weekButtonStyle = (weekNumber) => {
    const isCurrent = isCurrentWeek(weekNumber);
    const isSelected = isSelectedWeek(weekNumber);

    return {
      padding: '0.5rem',
      minHeight: '36px',
      border: isCurrent ? `2px solid #10b981` : `1px solid ${colors.border}`,
      backgroundColor: isSelected ? colors.primary : colors.surface,
      color: isSelected ? colors.primaryText : isCurrent ? '#10b981' : colors.text,
      borderRadius: '0.375rem',
      cursor: 'pointer',
      fontSize: '0.8rem',
      fontWeight: isSelected ? '600' : '500',
      transition: 'background-color 0.2s, transform 0.15s',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: isSelected ? `0 2px 8px ${colors.primary}40` : '0 1px 3px rgba(0,0,0,0.1)',
    };
  };

  const legendStyle = {
    marginTop: '0.75rem',
    paddingTop: '0.5rem',
    borderTop: `1px solid ${colors.border}`,
    display: 'flex',
    gap: '0.75rem',
    fontSize: '0.7rem',
    color: colors.textSecondary,
    flexShrink: 0,
  };

  const legendItemStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
  };

  const legendBoxStyle = (type) => {
    if (type === 'current') {
      return {
        width: '16px',
        height: '16px',
        border: `2px solid ${colors.primary}`,
        borderRadius: '0.25rem',
      };
    } else if (type === 'selected') {
      return {
        width: '16px',
        height: '16px',
        backgroundColor: colors.primary,
        borderRadius: '0.25rem',
      };
    }
  };

  return (
    <div ref={calendarRef} style={calendarStyle}>
      <div style={headerStyle}>
        <Button
          variant="ghost"
          size="sm"
          icon={<ChevronLeft size={16} />}
          onClick={() => setSelectedYear(selectedYear - 1)}
        />
        <div style={yearStyle}>{selectedYear}</div>
        <Button
          variant="ghost"
          size="sm"
          icon={<ChevronRight size={16} />}
          onClick={() => setSelectedYear(selectedYear + 1)}
        />
      </div>

      <div style={weeksGridStyle}>
        {weeks.map((weekNumber) => (
          <button
            key={weekNumber}
            style={weekButtonStyle(weekNumber)}
            onClick={() => handleWeekClick(weekNumber)}
            onMouseEnter={(e) => {
              if (!isSelectedWeek(weekNumber)) {
                e.currentTarget.style.backgroundColor = `${colors.primary}20`;
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = `0 4px 12px ${colors.primary}30`;
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelectedWeek(weekNumber)) {
                e.currentTarget.style.backgroundColor = colors.surface;
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
              }
            }}
          >
            M{weekNumber}
          </button>
        ))}
      </div>

      <div style={legendStyle}>
        <div style={legendItemStyle}>
          <div style={{ ...legendBoxStyle('current'), border: '2px solid #10b981', backgroundColor: 'transparent' }} />
          <span>Microciclo Atual</span>
        </div>
        <div style={legendItemStyle}>
          <div style={legendBoxStyle('selected')} />
          <span>Selecionado</span>
        </div>
      </div>

      {/* Confirm Button */}
      <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
        <Button
          variant="secondary"
          onClick={onClose}
          size="sm"
          style={{ flex: 1 }}
        >
          Cancelar
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={tempSelectedWeek === null}
          size="sm"
          style={{ flex: 1 }}
        >
          Confirmar
        </Button>
      </div>
    </div>
  );
}
