import React, { useState } from 'react';
import './OpeningHoursEditor.css';

const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const OpeningHoursEditor = ({ value = {}, onChange }) => {
    const [copiedDay, setCopiedDay] = useState(null);

    const handleChange = (day, field, newTime) => {
        const dayData = value[day] || {};
        let updatedDayData = { ...dayData, [field]: newTime, closed: false };

        if (field === 'open') {
            if (dayData.close && newTime > dayData.close) {
                updatedDayData.close = '';
            }
        }

        if (field === 'close') {
            if (dayData.open && newTime < dayData.open) {
                return; 
            }
        }

        const updated = {
            ...value,
            [day]: updatedDayData,
        };

        onChange(updated);
    };

    const handleToggleClosed = (day) => {
        const current = value?.[day]?.closed;
        const updated = {
            ...value,
            [day]: {
                open: '',
                close: '',
                closed: !current,
            },
        };
        onChange(updated);
    };

    const handleCopy = (sourceDay) => setCopiedDay(sourceDay);

    const handlePaste = (targetDay) => {
        if (!copiedDay || !value[copiedDay]) return;
        const copied = value[copiedDay];
        const updated = {
            ...value,
            [targetDay]: { ...copied },
        };
        onChange(updated);
    };

    const handleSet24Hours = (day) => {
        const updated = {
            ...value,
            [day]: {
                open: '00:00',
                close: '23:59',
                closed: false,
            },
        };
        onChange(updated);
    };

    return (
        <div className="opening-hours-editor">
            {daysOfWeek.map((day) => {
                const data = value?.[day] || {};
                const isClosed = data.closed;

                return (
                    <div className="day-row" key={day}>
                        <div className="day-label">{day}</div>
                        <div className="controls">
                            <input
                                type="time"
                                value={data.open || ''}
                                onChange={(e) => handleChange(day, 'open', e.target.value)}
                                disabled={isClosed}
                            />
                            <span>to</span>
                            <input
                                type="time"
                                value={data.close || ''}
                                onChange={(e) => handleChange(day, 'close', e.target.value)}
                                // MODIFIED: Disable if closed or no open time is set.
                                // Set min time based on open time.
                                disabled={isClosed || !data.open}
                                min={data.open}
                            />
                            <label className="closed-checkbox">
                                <input
                                    type="checkbox"
                                    checked={!!isClosed}
                                    onChange={() => handleToggleClosed(day)}
                                />
                                Closed
                            </label>
                        </div>

                        <div className="buttons">
                            <button type="button" onClick={() => handleSet24Hours(day)} disabled={isClosed}>
                                🕛 24h
                            </button>
                            <button type="button" onClick={() => handleCopy(day)}>📋 Copy</button>
                            <button
                                type="button"
                                onClick={() => handlePaste(day)}
                                disabled={!copiedDay || copiedDay === day}
                            >
                                📥 Paste
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default OpeningHoursEditor;