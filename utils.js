// utils.js
const Utils = (() => {
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }

    function decodeHtml(html) {
        if (typeof html !== 'string') return '';
        const txt = document.createElement("textarea");
        txt.innerHTML = html;
        return txt.value;
    }

    function isValidUrl(string) {
        return string && (string.startsWith('http://') || string.startsWith('https://'));
    }

    function formatDateForDisplay(timestamp) {
        const date = new Date(Number(timestamp));
        if (isNaN(date.getTime())) {
            console.warn("Utils.formatDateForDisplay received an invalid timestamp:", timestamp);
            return "Invalid Date";
        }
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

     function formatEventDateTimeCompactly(event) {
        if (!event || !Array.isArray(event.occurrences) || event.occurrences.length === 0) {
            return "Date/Time N/A";
        }

        const occurrences = event.occurrences;

        // Handle single occurrence case
        if (occurrences.length === 1) {
            const occurrence = occurrences[0];
            const start = occurrence.start;
            const end = occurrence.end;
            if (!(start instanceof Date) || isNaN(start) || !(end instanceof Date) || isNaN(end)) {
                return "Date/Time N/A";
            }

            const optionsDate = { month: 'short', day: 'numeric' };
            const optionsTime = { hour: 'numeric', minute: 'numeric', hour12: true };

            const hasStartTime = occurrence.originalStartTime && occurrence.originalStartTime.trim() !== '';
            const hasEndTime = occurrence.originalEndTime && occurrence.originalEndTime.trim() !== '';

            const formatTime = (date) => date.toLocaleTimeString('en-US', optionsTime).replace(':00 AM', ' AM').replace(':00 PM', ' PM').replace(' AM', 'am').replace(' PM', 'pm');

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
                finalString += ` – ${endDateStr}`; // Use endash for ranges
                if (endTimeStr) {
                    finalString += `, ${endTimeStr}`;
                }
                return finalString;
            }
        }

        // Handle multiple occurrences
        const dateGroups = {};
        const optionsDate = { month: 'short', day: 'numeric' };
        const optionsTime = { hour: 'numeric', minute: 'numeric', hour12: true };
        const formatTime = (date) => date.toLocaleTimeString('en-US', optionsTime).replace(':00 AM', ' AM').replace(':00 PM', ' PM').replace(' AM', 'am').replace(' PM', 'pm');

        occurrences.forEach(occurrence => {
            const start = occurrence.start;
            const end = occurrence.end;
            if (!(start instanceof Date) || isNaN(start)) return;

            const dateKey = start.toISOString().split('T')[0]; // YYYY-MM-DD
            if (!dateGroups[dateKey]) {
                dateGroups[dateKey] = { displayDate: start.toLocaleDateString('en-US', optionsDate), times: new Set() };
            }

            const hasStartTime = occurrence.originalStartTime && occurrence.originalStartTime.trim() !== '';
            const hasEndTime = end && occurrence.originalEndTime && occurrence.originalEndTime.trim() !== '';
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

    function formatHashtagForDisplay(tagString) {
        if (typeof tagString !== 'string' || !tagString) return '';
        let displayName = tagString.startsWith('#') ? tagString.substring(1) : tagString;

        // Helper function to add spaces to a single word based on casing
        function addSpacesToCamelCaseWord(word) {
            if (!word) return '';
            // Add space before a capital letter if it's preceded by a lowercase letter or a digit.
            // e.g., "myWord" -> "my Word", "word2Word" -> "word2 Word"
            let result = word.replace(/([a-z\d])([A-Z])/g, '$1 $2');
            // Add space before a capital letter if it's part of an acronym sequence 
            // followed by another capital letter starting a new word.
            // e.g., "HTMLContent" -> "HTML Content", "RnBSoul" -> "RnB Soul"
            result = result.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
            return result;
        }

        // Split by existing spaces, process each part, then rejoin.
        // This ensures that tags already containing spaces are handled correctly,
        // and each segment is formatted for camel/pascal casing.
        const parts = displayName.split(' ');
        const processedParts = parts.map(part => addSpacesToCamelCaseWord(part));
        return processedParts.join(' ');
    }

    function parseTime(timeStr) {
        // Default to noon if no time is provided, which is a reasonable default for an all-day event.
        if (!timeStr || !timeStr.trim()) return { hours: 12, minutes: 0, seconds: 0 };
        const lcTime = timeStr.toLowerCase();
        const modifier = lcTime.includes('pm') ? 'pm' : lcTime.includes('am') ? 'am' : null;
        
        let [hours, minutes] = lcTime.replace(/am|pm/g, '').trim().split(':').map(Number);
        minutes = minutes || 0;

        if (isNaN(hours) || isNaN(minutes)) return { hours: 12, minutes: 0, seconds: 0 };

        if (modifier === 'pm' && hours < 12) {
            hours += 12;
        }
        if (modifier === 'am' && hours === 12) { // Midnight case: 12am is 00 hours
            hours = 0;
        }
        return { hours, minutes, seconds: 0 };
    }

    function getNewYorkOffset(date) {
        const year = date.getFullYear();
        
        // DST starts on the second Sunday in March at 2 AM
        const mar1 = new Date(year, 2, 1);
        const firstSundayInMarch = new Date(mar1);
        firstSundayInMarch.setDate(1 + (7 - mar1.getDay()) % 7);
        const dstStart = new Date(firstSundayInMarch);
        dstStart.setDate(firstSundayInMarch.getDate() + 7);
        dstStart.setHours(2);

        // DST ends on the first Sunday in November at 2 AM
        const nov1 = new Date(year, 10, 1);
        const dstEnd = new Date(nov1);
        dstEnd.setDate(1 + (7 - nov1.getDay()) % 7);
        dstEnd.setHours(2);

        if (date >= dstStart && date < dstEnd) {
            return '-04:00'; // EDT
        } else {
            return '-05:00'; // EST
        }
    }

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
        parseDateInNewYork
    };
})();
