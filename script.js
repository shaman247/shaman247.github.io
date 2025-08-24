// script.js
document.addEventListener('DOMContentLoaded', () => {
    let map;
    let markersLayer;
    let allEvents = [];
    let tagConfig = {}; // To store data from tags.json
    let tileLayer;
    let eventsByLatLng = {};
    let locationsByLatLng = {};
    let hashtagColors = {};
    let hashtagDisplayNames = {}; // To store display names
    let hashtagFrequencies = {}; // To store calculated frequencies
    let datePickerInstance;
    let allAvailableTags = [];
    let resizeHandle;
    // let mapContainer; // map div's parent, if needed for layout adjustments

    const CONFIG = {
        EVENT_DATA_URL: 'events.json',
        TAG_CONFIG_URL: 'tags.json',
        START_DATE: new Date(2025, 7, 1),
        END_DATE: new Date(2025, 8, 30),
        ONE_DAY_IN_MS: 24 * 60 * 60 * 1000,
        DEFAULT_MARKER_COLOR: '#757575',
        HASHTAG_COLOR_PALETTE: [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#FED766', '#2AB7CA',
            '#F0B67F', '#8A6FBF', '#F9A828', '#C1E1A6', '#FF8C94',
            '#A1C3D1', '#B39BC8', '#F3EAC2', '#F7A6B4', '#5D5C61',
            '#FFD166', '#06D6A0', '#118AB2', '#EF476F', '#073B4C'
        ],
        MAP_INITIAL_VIEW: [40.6782, -73.9442],
        MAP_INITIAL_ZOOM: 12,
        MAP_TILE_URL_DARK: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        MAP_TILE_URL_LIGHT: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        MAP_ATTRIBUTION: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
        MAP_MAX_ZOOM: 20
    };

    const hashtagFiltersContainer = document.getElementById('hashtag-filters-container');
    const eventCountDisplay = document.getElementById('event-count-display');

    async function initializeApp() {
        // const leftPanel = document.getElementById('left-panel'); // This is now handled inside initPanelResizer
        resizeHandle = document.getElementById('resize-handle');

        try {
            const eventData = await loadEventsFromFile(CONFIG.EVENT_DATA_URL);
            const locationData = await loadEventsFromFile('locations.json');
            tagConfig = await loadTagConfigFromFile(CONFIG.TAG_CONFIG_URL);
            processEventData(eventData, locationData, tagConfig);
            calculateHashtagFrequencies(); // Calculate frequencies after events are processed
            processTagHierarchy(); // Renamed and expanded function
            initMap();
            initTheme();
            HashtagFilterUI.init({
                allAvailableTags: allAvailableTags,
                hashtagColors: hashtagColors,
                hashtagDisplayNames: hashtagDisplayNames, // Pass display names
                initialGlobalFrequencies: hashtagFrequencies, // Pass the global frequencies
                hashtagFiltersContainerDOM: hashtagFiltersContainer,
                onFilterChangeCallback: filterAndDisplayEvents, // Callback for when filters change
                defaultMarkerColor: CONFIG.DEFAULT_MARKER_COLOR
            });
            HashtagFilterUI.populateInitialFilters();
            initDatePicker();
            addEventListeners();
            initPanelResizer(); // Initialize the panel resizing logic
            filterAndDisplayEvents();
        } catch (error) {
            console.error("Failed to initialize app:", error);
            eventCountDisplay.textContent = "Error loading event data.";
        }
    }

    async function loadEventsFromFile(filePath) { 
        console.log(`Fetching data from: ${filePath}`);
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    }

    async function loadTagConfigFromFile(filePath) {
        console.log(`Fetching tag config from: ${filePath}`);
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    }

    function processEventData(eventData, locationData, tagConfig) {
        // First, process locations into a lookup map for easy access.
        locationsByLatLng = {};
        locationData.forEach(location => {
            if (location.lat != null && location.lng != null) {
                const locationKey = `${location.lat},${location.lng}`;
                locationsByLatLng[locationKey] = location;
            }
        });

        const hashtagsToExclude = new Set(tagConfig.exclude || []);
        const hashtagRewriteRules = tagConfig.rewrite || {};
    
        // Use .flatMap to process and filter in one go, handling the new JSON structure
        allEvents = eventData.flatMap(rawEvent => {
            const { lat, lng, hashtags: rawHashtags, occurrences: occurrencesJson, ...restOfEvent } = rawEvent;
    
            // 1. Parse occurrences from the JSON string
            let parsedOccurrences = [];
            try {
                const occurrencesArray = JSON.parse(occurrencesJson || '[]');
                if (Array.isArray(occurrencesArray)) {
                    parsedOccurrences = occurrencesArray.map(occ => {
                        const [startDateStr, startTimeStr, endDateStr, endTimeStr] = occ;
                        const start = Utils.parseDateInNewYork(startDateStr, startTimeStr);
                        
                        // If end date is missing, it's the same as the start date.
                        const effectiveEndDateStr = (endDateStr && endDateStr.trim() !== '') ? endDateStr : startDateStr;
                        // If end time is missing, it's the same as the start time.
                        const effectiveEndTimeStr = (endTimeStr && endTimeStr.trim() !== '') ? endTimeStr : startTimeStr;
                        const end = Utils.parseDateInNewYork(effectiveEndDateStr, effectiveEndTimeStr);
    
                        // If start is valid but end is not, default end to start. This can happen if end date is invalid.
                        if (start && !end) {
                            return { start, end: new Date(start), originalStartTime: startTimeStr, originalEndTime: endTimeStr };
                        }
                        if (start && end) {
                            return { start, end, originalStartTime: startTimeStr, originalEndTime: endTimeStr };
                        }
                        return null;
                    }).filter(Boolean); // Filter out nulls from failed parsing
                }
            } catch (e) {
                console.warn(`Could not parse occurrences for event "${rawEvent.name}":`, occurrencesJson, e);
                return []; // Return empty array to be flattened out by flatMap
            }
    
            // Sort occurrences chronologically
            parsedOccurrences.sort((a, b) => a.start - b.start);
    
            // 2. Pre-filter events: skip if no occurrences fall within the app's master date range
            const eventIsInAppRange = parsedOccurrences.some(occ => 
                occ.start <= CONFIG.END_DATE && occ.end >= CONFIG.START_DATE
            );
    
            if (!eventIsInAppRange) {
                return []; // Skip this event entirely
            }
    
            // 3. Process hashtags
            let processedHashtags = [];
            if (typeof rawHashtags === 'string') {
                processedHashtags = rawHashtags.replace(/,/g, ' ').split(/\s+/)
                    .map(tag => tag.replace(/#/g, '').trim())
                    .filter(Boolean) // Remove empty strings from splitting
                    .map(tag => {
                        const lowerTag = tag.toLowerCase();
                        return hashtagRewriteRules[lowerTag] || tag; // Apply rewrites
                    })
                    .filter(tag => !hashtagsToExclude.has(tag.toLowerCase()));
            }
            processedHashtags = [...new Set(processedHashtags)]; // Ensure uniqueness
    
            // Look up location info using the lat/lng key
            const locationKey = (lat != null && lng != null) ? `${lat},${lng}` : 'unknown_location';
            const locationInfo = locationsByLatLng[locationKey] || {};

            // 4. Construct and return the final event object in an array for flatMap
            return [{
                ...restOfEvent,
                latitude: lat,
                longitude: lng,
                locationKey: locationKey,
                hashtags: processedHashtags,
                occurrences: parsedOccurrences
            }];
        });

        // Rebuild eventsByLatLng from the new allEvents structure
        eventsByLatLng = {};
        allEvents.forEach(event => {
            if (event.locationKey !== 'unknown_location') {
                if (!eventsByLatLng[event.locationKey]) {
                    eventsByLatLng[event.locationKey] = [];
                }
                eventsByLatLng[event.locationKey].push(event);
            }
        });
    
        console.log("Total unique events processed:", allEvents.length);
        if (allEvents.length > 0) {
            console.log("First processed event sample:", JSON.parse(JSON.stringify(allEvents[0])));
            }
        }

    function initMap() {
        // Initialize the map once and store the instance.
        map = L.map('map').setView(CONFIG.MAP_INITIAL_VIEW, CONFIG.MAP_INITIAL_ZOOM);

        // Create the tile layer instance. The URL will be set by initTheme().
        // We can give it a default URL to start.
        tileLayer = L.tileLayer(CONFIG.MAP_TILE_URL_DARK, {
            attribution: CONFIG.MAP_ATTRIBUTION,
            maxZoom: CONFIG.MAP_MAX_ZOOM
        }).addTo(map);

        // Initialize the MapManager with the existing map instance. It will create and return the markers layer.
        const mapManagerInstances = MapManager.init(map, hashtagColors, CONFIG.DEFAULT_MARKER_COLOR);
        markersLayer = mapManagerInstances.markersLayer;
    }

    function calculateHashtagFrequencies() {
        hashtagFrequencies = {};
        allEvents.forEach(event => {
            if (event.hashtags && Array.isArray(event.hashtags)) {
                event.hashtags.forEach(tag => {
                    hashtagFrequencies[tag] = (hashtagFrequencies[tag] || 0) + 1;
                });
            }
        });
    }

    function processTagHierarchy() {
        // Collect all unique hashtags from events
        const allUniqueTagsSet = new Set();
        allEvents.forEach(event => {
            if (event.hashtags && Array.isArray(event.hashtags)) {
                event.hashtags.forEach(tag => allUniqueTagsSet.add(tag));
            }
        });

        allAvailableTags = Array.from(allUniqueTagsSet).sort();

        let paletteIndex = 0;
        allAvailableTags.forEach(tag => {
            if (!hashtagColors[tag]) {
                hashtagColors[tag] = CONFIG.HASHTAG_COLOR_PALETTE[paletteIndex % CONFIG.HASHTAG_COLOR_PALETTE.length];
                paletteIndex++;
            }
        });
    }

    function initDatePicker() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let initialStartDate = CONFIG.START_DATE;
        if (today.getTime() > CONFIG.START_DATE.getTime() && today.getTime() <= CONFIG.END_DATE.getTime()) {
            initialStartDate = today;
        }

        datePickerInstance = flatpickr("#date-picker", {
            mode: "range",
            dateFormat: "M j, Y",
            defaultDate: [initialStartDate, CONFIG.END_DATE],
            minDate: CONFIG.START_DATE,
            maxDate: CONFIG.END_DATE,
            monthSelectorType: "static", // Disables the month dropdown/selector
            onClose: function(selectedDates, dateStr, instance) {
                // This is called when the calendar is closed.
                // A good time to trigger the filter.
                if (selectedDates.length === 2) {
                    filterAndDisplayEvents();
                }
            }
        });
    }

    function updateMapTheme(theme) {
        if (!tileLayer) return;
        const newUrl = theme === 'light' ? CONFIG.MAP_TILE_URL_LIGHT : CONFIG.MAP_TILE_URL_DARK;
        tileLayer.setUrl(newUrl);
    }

    function setTheme(theme) {
        document.body.dataset.theme = theme;
        localStorage.setItem('theme', theme);
        updateMapTheme(theme);
        // Redraw markers to apply the new theme-appropriate stroke color.
        filterAndDisplayEvents();
    }

    function initTheme() {
        const themeToggle = document.getElementById('theme-switch-checkbox');
        if (!themeToggle) return;

        // Check for saved theme, default to dark
        const savedTheme = localStorage.getItem('theme') || 'dark';

        if (savedTheme === 'light') {
            themeToggle.checked = true;
        }
        setTheme(savedTheme);

        themeToggle.addEventListener('change', (e) => {
            setTheme(e.target.checked ? 'light' : 'dark');
        });
    }

    function addEventListeners() { 
        document.getElementById('reset-filters').addEventListener('click', resetFilters);

        const togglePanelBtn = document.getElementById('toggle-panel-btn');
        const leftPanel = document.getElementById('left-panel');

        if (togglePanelBtn && leftPanel) {
            togglePanelBtn.addEventListener('click', () => {
                const isCollapsed = leftPanel.classList.toggle('collapsed');
                if (isCollapsed) {
                    togglePanelBtn.innerHTML = '&#187;'; // »
                    togglePanelBtn.title = 'Show Panel';
                } else {
                    togglePanelBtn.innerHTML = '&#9776;'; // ☰
                    togglePanelBtn.title = 'Hide Panel';
                }
                
                // Give the CSS transition time to finish before invalidating map size
                setTimeout(() => map.invalidateSize(), 310); // A little more than the transition duration
            });
        }
    }

    function resetFilters() { 
        if (datePickerInstance) {
            // Determine the correct initial start for the date picker
            let initialStartDate = CONFIG.START_DATE;
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (today.getTime() > CONFIG.START_DATE.getTime() && today.getTime() <= CONFIG.END_DATE.getTime()) {
                initialStartDate = today;
            }
            // Set date without triggering onChange/onClose events, then manually filter
            datePickerInstance.setDate([initialStartDate, CONFIG.END_DATE], false);
        }
        HashtagFilterUI.resetSelections(); // Use the UI module's reset function
        filterAndDisplayEvents(); // Re-filter and update everything
    }

    function createLocationPopupContent(locationInfo, eventsAtLocation, activeFilters) {
        let mainContent = '';
        let displayedEventCount = 0;
        let isFirstMatchingEventInPopup = true;

        // Filter the unique events at this location based on the current filters
        const filteredEvents = eventsAtLocation.filter(event => 
            !isEventFilteredOut(event, activeFilters.sliderStartDate, activeFilters.sliderEndDate, activeFilters.tagStates)
        );

        filteredEvents.forEach(event => {
            displayedEventCount++;

            // The formatEventDateTimeCompactly now takes a single event object with an occurrences array
            let eventDetailHtml = `<p class="popup-event-datetime">${Utils.formatEventDateTimeCompactly(event)}</p>`;

            // If the specific event's location name is different from the main header, show it.
            if (event.location !== event.primaryLocationName) {
                eventDetailHtml += `<p class="popup-event-sublocation"><em>${Utils.escapeHtml(event.location)}</em></p>`;
            }

            if (event.description) {
                eventDetailHtml += `<p>${Utils.escapeHtml(event.description)}</p>`;
            }
            if (event.url) {
                if (Utils.isValidUrl(event.url)) {
                    eventDetailHtml += `<p><a href="${Utils.escapeHtml(event.url)}" target="_blank" rel="noopener noreferrer">More Info</a></p>`;
                } else {
                    eventDetailHtml += `<p><strong>Info:</strong> ${Utils.escapeHtml(event.url)}</p>`;
                }
            }
            if (event.hashtags && event.hashtags.length > 0) {
                eventDetailHtml += `<p>${event.hashtags.map(tag =>
                    `<span style="color:${hashtagColors[tag] || CONFIG.DEFAULT_MARKER_COLOR}; font-weight:bold;">${
                        Utils.escapeHtml(hashtagDisplayNames[tag] || Utils.formatHashtagForDisplay(tag))
                    }</span>`
                ).join(', ')}</p>`;
            }

            const isOpen = isFirstMatchingEventInPopup;
            mainContent += `<details ${isOpen ? 'open' : ''}>`;
            mainContent += `<summary><span class="popup-event-emoji">${Utils.escapeHtml(event.emoji)}</span> ${Utils.escapeHtml(event.name)}</summary>`;
            mainContent += eventDetailHtml;
            mainContent += `</details>`;
            isFirstMatchingEventInPopup = false;
        });

        if (filteredEvents.length === 0) {
            return "<p>No events at this location match the current filters.</p>";
        }
        
        let headerContent = '';
        if (locationInfo) {
            const emojiSpan = `<span class="popup-header-emoji">${Utils.escapeHtml(locationInfo.emoji)}</span>`;
        
            let textContent = `<p class="popup-header-location"><strong>${Utils.escapeHtml(locationInfo.location)}</strong></p>`;
            if (locationInfo.address) {
                textContent += `<p class="popup-header-address"><small>${Utils.escapeHtml(locationInfo.address)}</small></p>`;
            }
            const textWrapper = `<div class="popup-header-text">${textContent}</div>`;
            headerContent = emojiSpan + textWrapper;
        }
        
        const headerWrapper = `<div class="popup-header">${headerContent}</div>`;
        const eventsListWrapper = `<div class="popup-events-list">${mainContent}</div>`;
        return headerWrapper + eventsListWrapper; 
    }

    function displayEventsOnMap(locationsToDisplay) {
        MapManager.clearMarkers();
        let visibleEventCountTotal = 0;
        let visibleLocationCount = 0;

        for (const locationKey in locationsToDisplay) {
            if (locationKey === 'unknown_location') continue;

            const eventsMatchingFiltersAtThisLocation = locationsToDisplay[locationKey];
            if (eventsMatchingFiltersAtThisLocation.length === 0) continue;

            visibleLocationCount++;
            visibleEventCountTotal += eventsMatchingFiltersAtThisLocation.length; 

            const [lat, lng] = locationKey.split(',').map(Number);
            const locationInfo = locationsByLatLng[locationKey];
            const markerEmoji = locationInfo ? locationInfo.emoji : '📍';
            const locationName = locationInfo ? locationInfo.location : 'Unknown Location';

            const markerColor = MapManager.getMarkerColor(eventsMatchingFiltersAtThisLocation);
            const customIcon = MapManager.createCustomMarkerIcon(markerColor, markerEmoji);
            
            const hoverTooltipText = locationName;

            const popupContentCallback = () => {
                const selectedDates = datePickerInstance.selectedDates;
                const currentPopupFilters = {
                    sliderStartDate: selectedDates[0],
                    sliderEndDate: selectedDates[1],
                    tagStates: HashtagFilterUI.getTagStates() // Get current tag states
                };
                const allEventsForThisPhysicalLocation = eventsByLatLng[locationKey] || [];
                return createLocationPopupContent(locationInfo, allEventsForThisPhysicalLocation, currentPopupFilters);
            };
            MapManager.addMarkerToMap([lat, lng], customIcon, hoverTooltipText, popupContentCallback);
        }
        eventCountDisplay.textContent = `Showing ${visibleEventCountTotal} events at ${visibleLocationCount} locations.`;
    }

    function isEventFilteredOut(event, filterStartDate, filterEndDate, tagStates) { 
        let dateMatch = false;
        // An event is a match if at least one of its occurrences is in range.
        if (event.occurrences && event.occurrences.length > 0) {
            const startFilter = (filterStartDate instanceof Date && !isNaN(filterStartDate)) ? filterStartDate : CONFIG.START_DATE;
            let endFilter = (filterEndDate instanceof Date && !isNaN(filterEndDate)) ? filterEndDate : CONFIG.END_DATE;
            endFilter = new Date(endFilter); 
            endFilter.setHours(23, 59, 59, 999);

            for (const occurrence of event.occurrences) {
                const eventStart = occurrence.start;
                const eventEnd = occurrence.end;
                if (eventStart <= endFilter && eventEnd >= startFilter) {
                    dateMatch = true;
                    break; // Found a matching occurrence, no need to check others
                }
            }
        }
        let hashtagMatch = true;
        const eventTags = new Set(event.hashtags || []);

        const requiredTags = [];
        const selectedOrTags = [];
        const forbiddenTags = [];

        for (const tag in tagStates) {
            if (tagStates.hasOwnProperty(tag)) {
                if (tagStates[tag] === 'required') requiredTags.push(tag);
                else if (tagStates[tag] === 'selected') selectedOrTags.push(tag);
                else if (tagStates[tag] === 'forbidden') forbiddenTags.push(tag);
            }
        }

        // 1. Forbidden check: If event has any forbidden tag, it's out.
        if (forbiddenTags.length > 0) {
            for (const forbiddenTag of forbiddenTags) {
                if (eventTags.has(forbiddenTag)) {
                    hashtagMatch = false;
                    break;
                }
            }
        }
        if (!hashtagMatch) return !(dateMatch && hashtagMatch); // Early exit

        // 2. Required check: If event does not have ALL required tags, it's out.
        if (requiredTags.length > 0) {
            let allRequiredMet = true;
            for (const requiredTag of requiredTags) {
                if (!eventTags.has(requiredTag)) {
                    allRequiredMet = false;
                    break;
                }
            }
            if (!allRequiredMet) hashtagMatch = false;
        }
        if (!hashtagMatch) return !(dateMatch && hashtagMatch); // Early exit

        // 3. Selected (OR) check: If event does not have AT LEAST ONE selected tag (and there are selected tags), it's out.
        if (selectedOrTags.length > 0) {
            let anySelectedMet = false;
            for (const selectedTag of selectedOrTags) {
                if (eventTags.has(selectedTag)) {
                    anySelectedMet = true;
                    break;
                }
            }
            if (!anySelectedMet) hashtagMatch = false;
        }
        // If selectedOrTags is empty, this part of the condition is met by default.

        return !(dateMatch && hashtagMatch); 
    }

    function filterAndDisplayEvents() { 
        if (!datePickerInstance) {
            console.warn("filterAndDisplayEvents called before datePicker is initialized.");
            return; 
        }
        const selectedDates = datePickerInstance.selectedDates;
        if (selectedDates.length < 2) {
            // If a range isn't fully selected yet, we can either do nothing or filter with a default.
            // For now, we'll just log it and not update the map.
            // The `onClose` event in the date picker setup should prevent this from being a common issue.
            console.log("Date range not fully selected. Skipping filter.");
            return;
        }

        const currentSliderStartDate = selectedDates[0];
        const currentSliderEndDate = selectedDates[1];
        const currentTagStates = HashtagFilterUI.getTagStates();

        // First, filter all events based on date and selected tags to get a flat list
        // This list will be used to update the HashtagFilterUI's dynamic frequencies
        const allMatchingEventsFlatList = allEvents.filter(event => {
            return !isEventFilteredOut(event, currentSliderStartDate, currentSliderEndDate, currentTagStates);
        });

        // Then, group these filtered events by location for map display
        const filteredLocations = {};
        allMatchingEventsFlatList.forEach(event => {
            if (event.locationKey && event.locationKey !== 'unknown_location') {
                if (!filteredLocations[event.locationKey]) {
                    filteredLocations[event.locationKey] = [];
                }
                filteredLocations[event.locationKey].push(event);
            }
        });

        displayEventsOnMap(filteredLocations);

        // Update the HashtagFilterUI view with the new set of filtered events and current selections
        HashtagFilterUI.updateView(allMatchingEventsFlatList);
    }

    function initPanelResizer() {
        const leftPanel = document.getElementById('left-panel');
        if (!leftPanel || !resizeHandle) {
            console.warn("Panel resizing elements ('left-panel', 'resize-handle') not found in the DOM.");
            return;
        }

        let isResizing = false;
        let initialPosX = 0;
        let initialWidth = 0;

        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            initialPosX = e.clientX;
            initialWidth = leftPanel.offsetWidth;

            // Apply styles for visual feedback during resize
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none'; // Prevent text selection

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });

        function handleMouseMove(e) {
            if (!isResizing) return;

            const deltaX = e.clientX - initialPosX;
            let newWidth = initialWidth + deltaX;

            // Define min/max width for the panel (adjust as needed)
            const minWidth = 200; // Example: minimum width of 200px
            const maxWidth = 600; // Example: maximum width of 600px

            newWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
            leftPanel.style.width = `${newWidth}px`;

            if (map) {
                map.invalidateSize(); // Crucial for Leaflet to adjust the map layout
            }
        }

        function handleMouseUp() {
            if (!isResizing) return;
            isResizing = false;

            // Reset styles
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        }
    }

    initializeApp();
});