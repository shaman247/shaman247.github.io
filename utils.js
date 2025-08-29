const Utils = (() => {
    /**
     * Escapes HTML special characters in a string.
     * @param {string} unsafe - The string to escape.
     * @returns {string} - The escaped string.
     */
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /**
     * Decodes HTML entities in a string.
     * @param {string} html - The string to decode.
     * @returns {string} - The decoded string.
     */
    function decodeHtml(html) {
        if (typeof html !== 'string') return '';
        const txt = document.createElement("textarea");
        txt.innerHTML = html;
        return txt.value;
    }

    /**
     * Checks if a string is a valid URL.
     * @param {string} string - The string to check.
     * @returns {boolean} - True if the string is a valid URL.
     */
    function isValidUrl(string) {
        return string && (string.startsWith('http://') || string.startsWith('https://'));
    }

    /**
     * Formats a timestamp for display.
     * @param {number} timestamp - The timestamp to format.
     * @returns {string} - The formatted date string.
     */
    function formatDateForDisplay(timestamp) {
        const date = new Date(Number(timestamp));
        if (isNaN(date.getTime())) {
            console.warn("Utils.formatDateForDisplay received an invalid timestamp:", timestamp);
            return "Invalid Date";
        }
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    /**
     * Formats the date and time of an event compactly.
     * @param {object} event - The event object.
     * @returns {string} - The formatted date and time string.
     */
    function formatEventDateTimeCompactly(event) {
        if (!event || !Array.isArray(event.occurrences) || event.occurrences.length === 0) {
            return "Date/Time N/A";
        }

        if (event.occurrences.length === 1) {
            return formatSingleOccurrence(event.occurrences[0]);
        }

        return formatMultipleOccurrences(event.occurrences);
    }

    /**
     * Formats a single event occurrence.
     * @param {object} occurrence - The occurrence object.
     * @returns {string} - The formatted string for a single occurrence.
     */
    function formatSingleOccurrence(occurrence) {
        const { start, end, originalStartTime, originalEndTime } = occurrence;
        if (!(start instanceof Date) || isNaN(start) || !(end instanceof Date) || isNaN(end)) {
            return "Date/Time N/A";
        }

        const optionsDate = { month: 'short', day: 'numeric' };
        const optionsTime = { hour: 'numeric', minute: 'numeric', hour12: true };

        const hasStartTime = originalStartTime && originalStartTime.trim() !== '';
        const hasEndTime = originalEndTime && originalEndTime.trim() !== '';

        const formatTime = (date) => date.toLocaleTimeString('en-US', optionsTime).replace(':00 AM', 'am').replace(':00 PM', 'pm').replace(' ', '');

        const startDateStr = start.toLocaleDateString('en-US', optionsDate);
        const endDateStr = end.toLocaleDateString('en-US', optionsDate);

        const isSameDay = start.toDateString() === end.toDateString();

        let startTimeStr = hasStartTime ? formatTime(start) : '';
        let endTimeStr = hasEndTime ? formatTime(end) : '';

        if (isSameDay) {
            if (startTimeStr && endTimeStr && startTimeStr !== endTimeStr) {
                return `${startDateStr}, ${startTimeStr}–${endTimeStr}`;
            } else if (startTimeStr) {
                return `${startDateStr}, ${startTimeStr}`;
            } else {
                return startDateStr;
            }
        } else {
            let finalString = `${startDateStr}`;
            if (startTimeStr) {
                finalString += `, ${startTimeStr}`;
            }
            finalString += ` – ${endDateStr}`;
            if (endTimeStr) {
                finalString += `, ${endTimeStr}`;
            }
            return finalString;
        }
    }

    /**
     * Formats multiple event occurrences.
     * @param {Array<object>} occurrences - The array of occurrence objects.
     * @returns {string} - The formatted string for multiple occurrences.
     */
    function formatMultipleOccurrences(occurrences) {
        const dateGroups = {};
        const optionsDate = { month: 'short', day: 'numeric' };
        const optionsTime = { hour: 'numeric', minute: 'numeric', hour12: true };
        const formatTime = (date) => date.toLocaleTimeString('en-US', optionsTime).replace(':00 AM', 'am').replace(':00 PM', 'pm').replace(' ', '');

        occurrences.forEach(occurrence => {
            const { start, end, originalStartTime, originalEndTime } = occurrence;
            if (!(start instanceof Date) || isNaN(start)) return;

            const dateKey = start.toISOString().split('T')[0];
            if (!dateGroups[dateKey]) {
                dateGroups[dateKey] = { displayDate: start.toLocaleDateString('en-US', optionsDate), times: new Set() };
            }

            const hasStartTime = originalStartTime && originalStartTime.trim() !== '';
            const hasEndTime = end && originalEndTime && originalEndTime.trim() !== '';
            const isSameDay = end && start.toDateString() === end.toDateString();

            let timeStr = '';
            if (hasStartTime && hasEndTime && isSameDay) {
                const startTime = formatTime(start);
                const endTime = formatTime(end);
                timeStr = (startTime !== endTime) ? `${startTime}–${endTime}` : startTime;
            } else if (hasStartTime) {
                timeStr = formatTime(start);
            }

            if (timeStr) {
                dateGroups[dateKey].times.add(timeStr);
            }
        });

        return Object.values(dateGroups).map(group => {
            return group.times.size > 0 ? `${group.displayDate}: ${Array.from(group.times).join(', ')}` : group.displayDate;
        }).join('; ');
    }

    /**
     * Formats a hashtag string for display.
     * @param {string} tagString - The hashtag string.
     * @returns {string} - The formatted string.
     */
    function formatHashtagForDisplay(tagString) {
        if (typeof tagString !== 'string' || !tagString) return '';
        let displayName = tagString.startsWith('#') ? tagString.substring(1) : tagString;

        const addSpacesToCamelCaseWord = (word) => {
            if (!word) return '';
            let result = word.replace(/([a-z\d])([A-Z])/g, '$1 $2');
            result = result.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
            return result;
        };

        const parts = displayName.split(' ');
        const processedParts = parts.map(part => addSpacesToCamelCaseWord(part));
        return processedParts.join(' ');
    }

    /**
     * Parses a time string into an object with hours, minutes, and seconds.
     * @param {string} timeStr - The time string to parse.
     * @returns {{hours: number, minutes: number, seconds: number}} - The parsed time object.
     */
    function parseTime(timeStr) {
        if (!timeStr || !timeStr.trim()) return { hours: 12, minutes: 0, seconds: 0 };
        const lcTime = timeStr.toLowerCase();
        const modifier = lcTime.includes('pm') ? 'pm' : lcTime.includes('am') ? 'am' : null;

        let [hours, minutes] = lcTime.replace(/am|pm/g, '').trim().split(':').map(Number);
        minutes = minutes || 0;

        if (isNaN(hours) || isNaN(minutes)) return { hours: 12, minutes: 0, seconds: 0 };

        if (modifier === 'pm' && hours < 12) {
            hours += 12;
        }
        if (modifier === 'am' && hours === 12) {
            hours = 0;
        }
        return { hours, minutes, seconds: 0 };
    }

    /**
     * Gets the time zone offset for New York on a given date.
     * @param {Date} date - The date to get the offset for.
     * @returns {string} - The time zone offset string.
     */
    function getNewYorkOffset(date) {
        const year = date.getFullYear();
        const mar1 = new Date(year, 2, 1);
        const firstSundayInMarch = new Date(mar1);
        firstSundayInMarch.setDate(1 + (7 - mar1.getDay()) % 7);
        const dstStart = new Date(firstSundayInMarch);
        dstStart.setDate(firstSundayInMarch.getDate() + 7);
        dstStart.setHours(2);

        const nov1 = new Date(year, 10, 1);
        const dstEnd = new Date(nov1);
        dstEnd.setDate(1 + (7 - nov1.getDay()) % 7);
        dstEnd.setHours(2);

        return (date >= dstStart && date < dstEnd) ? '-04:00' : '-05:00';
    }

    /**
     * Parses a date string and time string in the context of the New York time zone.
     * @param {string} dateStr - The date string to parse.
     * @param {string} timeStr - The time string to parse.
     * @returns {Date|null} - The parsed date object or null if invalid.
     */
    function parseDateInNewYork(dateStr, timeStr) {
        if (!dateStr) return null;
        const tempDate = new Date(dateStr.replace(/-/g, '/') + ' 12:00:00');
        if (isNaN(tempDate.getTime())) return null;

        const offset = getNewYorkOffset(tempDate);
        const timeParts = parseTime(timeStr);
        const isoString = `${dateStr}T${String(timeParts.hours).padStart(2, '0')}:${String(timeParts.minutes).padStart(2, '0')}:${String(timeParts.seconds).padStart(2, '0')}${offset}`;
        const finalDate = new Date(isoString);

        return isNaN(finalDate.getTime()) ? null : finalDate;
    }

    return {
        escapeHtml,
        decodeHtml,
        isValidUrl,
        formatDateForDisplay,
        formatEventDateTimeCompactly,
        formatHashtagForDisplay,
        parseDateInNewYork,
    };
})();