import React, { useState } from 'react';
import './OpeningHoursEditor.css';

const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const OpeningHoursEditor = ({ value = {}, onChange }) => {
    const [copiedDay, setCopiedDay] = useState(null);

    const handleChange = (day, field, fieldValue) => {
        const updated = {
            ...value,
            [day]: {
                ...value[day],
                [field]: fieldValue,
                closed: field === 'closed' ? fieldValue : value?.[day]?.closed || false,
            },
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
                                disabled={isClosed}
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
