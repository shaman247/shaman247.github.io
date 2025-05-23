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
        if (event.parsedStartDate === "Ongoing") {
            return "Ongoing";
        }
        const start = event.parsedStartDate;
        const end = event.parsedEndDate;
        if (!(start instanceof Date) || isNaN(start) || !(end instanceof Date) || isNaN(end)) {
            return "Date/Time N/A";
        }
        const optionsDate = { month: 'short', day: 'numeric' };
        const optionsTime = { hour: 'numeric', minute: 'numeric', hour12: true };

        const startDateStr = start.toLocaleDateString('en-US', optionsDate);
        const startTimeStr = start.toLocaleTimeString('en-US', optionsTime).replace(':00 AM', ' AM').replace(':00 PM', ' PM').replace(' AM', 'am').replace(' PM', 'pm');
        const endDateStr = end.toLocaleDateString('en-US', optionsDate);
        const endTimeStr = end.toLocaleTimeString('en-US', optionsTime).replace(':00 AM', ' AM').replace(':00 PM', ' PM').replace(' AM', 'am').replace(' PM', 'pm');

        if (startDateStr === endDateStr) {
            if (startTimeStr === endTimeStr) return `${startDateStr}, ${startTimeStr}`;
            return `${startDateStr} ${startTimeStr}–${endTimeStr}`; // Using en-dash
        } else {
            return `${startDateStr}, ${startTimeStr} – ${endDateStr}, ${endTimeStr}`;
        }
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

    return {
        escapeHtml,
        isValidUrl,
        formatDateForDisplay,
        formatEventDateTimeCompactly,
        formatHashtagForDisplay
    };
})();
