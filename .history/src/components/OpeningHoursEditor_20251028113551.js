import React, { useState, useCallback } from 'react';
import './OpeningHoursEditor.css';

// Constants
const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// Child Component for a single day's row
const DayRow = React.memo(({
    day,
    data,
    copiedDay,
    onTimeChange,
    onToggleClosed,
    onSet24Hours,
    onCopy,
    onPaste
}) => {
    const isClosed = data.closed;

    return (
        <div className="day-row">
            <label className="day-label" htmlFor={`open-time-${day}`}>{day}</label>
            <div className="controls">
                <input
                    id={`open-time-${day}`}
                    aria-label={`Opening time for ${day}`}
                    type="time"
                    value={data.open || ''}
                    onChange={(e) => onTimeChange(day, 'open', e.target.value)}
                    disabled={isClosed}
                />
                <span>to</span>
                <input
                    aria-label={`Closing time for ${day}`}
                    type="time"
                    value={data.close || ''}
                    onChange={(e) => onTimeChange(day, 'close', e.target.value)}
                    disabled={isClosed || !data.open}
                    min={data.open}
                />
                <label className="closed-checkbox">
                    <input
                        type="checkbox"
                        checked={!!isClosed}
                        onChange={() => onToggleClosed(day)}
                    />
                    Closed
                </label>
            </div>

            <div className="buttons">
                <button type="button" onClick={() => onSet24Hours(day)} disabled={isClosed}>
                    🕛 24h
                </button>
                <button type="button" onClick={() => onCopy(day)}>📋 Copy</button>
                <button
                    type="button"
                    onClick={() => onPaste(day)}
                    disabled={!copiedDay || copiedDay === day}
                >
                    📥 Paste
                </button>
            </div>
        </div>
    );
});

// Main Parent Component
const OpeningHoursEditor = ({ value = {}, onChange }) => {
    const [copiedDay, setCopiedDay] = useState(null);

    const handleTimeChange = useCallback((day, field, newTime) => {
        const dayData = value[day] || {};
        let updatedDayData = { ...dayData, [field]: newTime, closed: false };

        if (field === 'open' && dayData.close && newTime > dayData.close) {
            updatedDayData.close = '';
        }

        if (field === 'close' && dayData.open && newTime < dayData.open) {
            return; // Reject invalid time
        }

        onChange({ ...value, [day]: updatedDayData });
    }, [value, onChange]);

    const handleToggleClosed = useCallback((day) => {
        const isCurrentlyClosed = value[day]?.closed;
        onChange({
            ...value,
            [day]: { open: '', close: '', closed: !isCurrentlyClosed },
        });
    }, [value, onChange]);

    const handleSet24Hours = useCallback((day) => {
        onChange({
            ...value,
            [day]: { open: '00:00', close: '23:59', closed: false },
        });
    }, [value, onChange]);

    const handlePaste = useCallback((targetDay) => {
        if (!copiedDay || !value[copiedDay]) return;
        onChange({
            ...value,
            [targetDay]: { ...value[copiedDay] },
        });
    }, [copiedDay, value, onChange]);

    return (
        <div className="opening-hours-editor">
            {DAYS_OF_WEEK.map((day) => (
                <DayRow
                    key={day}
                    day={day}
                    data={value?.[day] || {}}
                    copiedDay={copiedDay}
                    onTimeChange={handleTimeChange}
                    onToggleClosed={handleToggleClosed}
                    onSet24Hours={handleSet24Hours}
                    onCopy={setCopiedDay} // Pass the state setter directly
                    onPaste={handlePaste}
                />
            ))}
        </div>
    );
};

export default OpeningHoursEditor;