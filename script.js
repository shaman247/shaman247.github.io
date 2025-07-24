// script.js
document.addEventListener('DOMContentLoaded', () => {
    let map;
    let markersLayer;
    let allEvents = [];
    let eventsByLocation = {};
    let hashtagColors = {};
    let hashtagDisplayNames = {}; // To store display names
    let hashtagFrequencies = {}; // To store calculated frequencies
    let dateSlider;
    let allAvailableTags = [];
    let tagHierarchy = [];
    let leftPanel; // Already declared
    let resizeHandle;
    // let mapContainer; // map div's parent, if needed for layout adjustments

    const CONFIG = {
        EVENT_DATA_URL: 'events.json',
        TAG_HIERARCHY_URL: 'tags.json',
        START_DATE: new Date(2025, 6, 1),
        END_DATE: new Date(2025, 7, 31),
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
        MAP_TILE_URL: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        MAP_ATTRIBUTION: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
        MAP_MAX_ZOOM: 20
    };

    const startDateElement = document.getElementById('slider-start-date');
    const endDateElement = document.getElementById('slider-end-date');
    const hashtagFiltersContainer = document.getElementById('hashtag-filters-container');
    const eventCountDisplay = document.getElementById('event-count-display');

    async function initializeApp() {
        // Assign panel-related elements here
        leftPanel = document.getElementById('left-panel'); // Assign the ID of your main left panel
        resizeHandle = document.getElementById('resize-handle'); // Assign the ID of the resize handle element
        // mapContainer = document.getElementById('map-container'); // Assign if you have a specific map container div

        try {
            const eventData = await loadEventsFromFile(CONFIG.EVENT_DATA_URL);
            tagHierarchy = await loadEventsFromFile(CONFIG.TAG_HIERARCHY_URL);            
            processEventData(eventData);
            calculateHashtagFrequencies(); // Calculate frequencies after events are processed
            processTagHierarchy(); // Renamed and expanded function
            initMap();
            HashtagFilterUI.init({
                allAvailableTags: allAvailableTags,
                hashtagColors: hashtagColors,
                hashtagDisplayNames: hashtagDisplayNames, // Pass display names
                initialGlobalFrequencies: hashtagFrequencies, // Pass the global frequencies
                hashtagFiltersContainerDOM: hashtagFiltersContainer,
                onFilterChangeCallback: filterAndDisplayEvents, // Callback for when filters change
                defaultMarkerColor: CONFIG.DEFAULT_MARKER_COLOR
            });
            HashtagFilterUI.populateInitialFilters(); // Use new method
            initDateSlider();
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

    function processEventData(eventData) { 
        allEvents = eventData.map(rawEvent => {
            const { date_time, latitude, longitude, url: eventUrl, location: eventLocation, hashtags: rawHashtags, ...restOfEvent } = rawEvent;

            // Normalize newline characters: replace literal '\\n' with actual '\n'
            const normalizedDateTime = date_time.replace(/\\n/g, '\n');
            const dtLines = normalizedDateTime.split('\n');

            let parsedStartDate = null;
            let parsedEndDate = null;

            // Construct a minimal valid iCalendar string for parsing
            const iCalString = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//EventsApp//EN
BEGIN:VEVENT
${normalizedDateTime}
END:VEVENT
END:VCALENDAR`;

            try {
                const jcalData = ICAL.parse(iCalString);
                const vcalendar = new ICAL.Component(jcalData);
                const vevent = vcalendar.getFirstSubcomponent('vevent');

                if (vevent) {
                    const icalEvent = new ICAL.Event(vevent);
                    if (icalEvent.startDate) {
                        parsedStartDate = icalEvent.startDate.toJSDate();
                    }
                    if (icalEvent.endDate) {
                        parsedEndDate = icalEvent.endDate.toJSDate();
                    }
                }
            } catch (e) {
                console.warn(`Failed to parse iCal data for event (ID: ${rawEvent.id || 'N/A'}): "${date_time}". Error: ${e.message}`);
            }
            
            const locationKey = (latitude != null && longitude != null) 
                               ? `${latitude},${longitude}` : 'unknown_location';

            let processedHashtags = rawHashtags;
            if (typeof rawHashtags === 'string') {
                // Normalize by replacing commas with spaces, then split by any whitespace
                processedHashtags = rawHashtags
                    .replace(/,/g, ' ') // Replace all commas with a space
                    .split(/\s+/)       // Split by one or more whitespace characters
                    .map(tag => tag.trim()) // Trim each resulting tag
                    .filter(tag => tag.length > 0); // Filter out any empty strings
            } else if (!Array.isArray(rawHashtags)) {
                processedHashtags = [];
            }

            if (!eventsByLocation[locationKey]) eventsByLocation[locationKey] = [];
            const processedEvent = { 
                ...restOfEvent, latitude, longitude, parsedStartDate, parsedEndDate, 
                locationKey, url: eventUrl, location: eventLocation, hashtags: processedHashtags 
            };
            eventsByLocation[locationKey].push(processedEvent);
            return processedEvent;
        });
        console.log("Total events processed:", allEvents.length);
        if (allEvents.length > 0) {
            console.log("First processed event sample:", JSON.parse(JSON.stringify(allEvents[0]))); // Log a copy
        }
    }

    function initMap() { 
        const mapInstances = MapManager.init('map', CONFIG, hashtagColors, CONFIG.DEFAULT_MARKER_COLOR);
        map = mapInstances.map;
        markersLayer = mapInstances.markersLayer;
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
        // Process colors and displayNames from tagHierarchy (tags.json)
        function recurseHierarchy(nodes) {
            nodes.forEach(node => {
                if (node.hashtag && node.color) {
                    hashtagColors[node.hashtag] = node.color;
                }
                if (node.hashtag && node.displayName) {
                    hashtagDisplayNames[node.hashtag] = node.displayName;
                }
                if (node.children && node.children.length > 0) {
                    recurseHierarchy(node.children);
                }
            });
        }
        recurseHierarchy(tagHierarchy);

        // Collect all unique hashtags from events
        const uniqueHashtagsFromEvents = new Set();
        allEvents.forEach(event => {
            if (event.hashtags && Array.isArray(event.hashtags)) {
                event.hashtags.forEach(tag => uniqueHashtagsFromEvents.add(tag));
            }
        });
    
        // Collect all hashtags from the tagHierarchy (even if they didn't have a color property)
        const definedCategoryHashtags = new Set();
        function getAllDefinedHashtags(nodes) {
            nodes.forEach(node => {
                definedCategoryHashtags.add(node.hashtag);
                if (node.children && node.children.length > 0) {
                    getAllDefinedHashtags(node.children);
                }
            });
        }
        getAllDefinedHashtags(tagHierarchy);
    
        const allUniqueTagsSet = new Set([...uniqueHashtagsFromEvents, ...definedCategoryHashtags]);
        allAvailableTags = Array.from(allUniqueTagsSet).sort(); // Populate global allAvailableTags
    
        // Assign palette colors as a fallback for tags not colored from tags.json
        let paletteIndex = 0;
        allAvailableTags.forEach(tag => {
            if (!hashtagColors[tag]) {
                hashtagColors[tag] = CONFIG.HASHTAG_COLOR_PALETTE[paletteIndex % CONFIG.HASHTAG_COLOR_PALETTE.length];
                paletteIndex++;
            }
        });
    }

    function initDateSlider() { 
        const slider = document.getElementById('date-slider');
        const startTimestamp = CONFIG.START_DATE.getTime();
        const endTimestamp = CONFIG.END_DATE.getTime();

        let initialStartHandleTimestamp = startTimestamp;
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Set to the beginning of today
        const todayTimestamp = today.getTime();

        if (todayTimestamp <= endTimestamp) { // If today is not after the END_DATE
            initialStartHandleTimestamp = Math.max(todayTimestamp, startTimestamp); // Use today, but not before original START_DATE
        }

        dateSlider = noUiSlider.create(slider, {
            range: { min: startTimestamp, max: endTimestamp },
            start: [initialStartHandleTimestamp, endTimestamp],
            connect: true, step: CONFIG.ONE_DAY_IN_MS,
            behaviour: 'drag-tap',
            margin: CONFIG.ONE_DAY_IN_MS // Minimum 1 day between handles
        });
        dateSlider.on('update', (values, handle, unencoded) => { 
            startDateElement.textContent = Utils.formatDateForDisplay(unencoded[0]);
            endDateElement.textContent = Utils.formatDateForDisplay(unencoded[1]);
        });
        dateSlider.on('set', filterAndDisplayEvents); 
        const initialTimestamps = dateSlider.get(true);
        startDateElement.textContent = Utils.formatDateForDisplay(initialTimestamps[0]);
        endDateElement.textContent = Utils.formatDateForDisplay(initialTimestamps[1]);
    }

    function addEventListeners() { 
        document.getElementById('reset-filters').addEventListener('click', resetFilters);
    }

    function resetFilters() { 
        if (dateSlider) {
            // Determine the correct initial start for the slider
            let initialStartHandleTimestamp = CONFIG.START_DATE.getTime();
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayTimestamp = today.getTime();
            const endTimestamp = CONFIG.END_DATE.getTime();        

            if (todayTimestamp <= endTimestamp) {
                initialStartHandleTimestamp = Math.max(todayTimestamp, CONFIG.START_DATE.getTime());
            }
            dateSlider.set([initialStartHandleTimestamp, endTimestamp]);
        }
        HashtagFilterUI.resetSelections(); // Use the UI module's reset function
        filterAndDisplayEvents(); // Re-filter and update everything
    }

    function createLocationPopupContent(eventsAtLocation, activeFilters) {
        let mainContent = '';
        let displayedEventCount = 0;
        let isFirstMatchingEventInPopup = true;

        eventsAtLocation.forEach(event => {
            if (!isEventFilteredOut(event, activeFilters.sliderStartDate, activeFilters.sliderEndDate, activeFilters.selectedHashtags)) {
                displayedEventCount++;
                let eventDetailHtml = '';
                
                eventDetailHtml += `<p class="popup-event-datetime">${Utils.formatEventDateTimeCompactly(event)}</p>`;
                // Use event.location (new field name)
                if (event.location && event.location !== eventsAtLocation[0].location) { 
                     eventDetailHtml += `<p><strong>Venue:</strong> ${Utils.escapeHtml(event.location)}</p>`;
                }
                
                if (event.description) {
                    eventDetailHtml += `<p>${Utils.escapeHtml(event.description)}</p>`;
                }
                // Use event.url (new field name)
                if (event.url) {
                    if (Utils.isValidUrl(event.url)) {
                        eventDetailHtml += `<p><a href="${Utils.escapeHtml(event.url)}" target="_blank" rel="noopener noreferrer">More Info</a></p>`;
                    } else {
                        eventDetailHtml += `<p><strong>Info:</strong> ${Utils.escapeHtml(event.link)}</p>`; // Changed "Link" to "Info" for non-URLs
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
                mainContent += `<summary>${Utils.escapeHtml(event.name)}</summary>`;
                mainContent += eventDetailHtml;
                mainContent += `</details>`;
                isFirstMatchingEventInPopup = false; 
            }
        });

        if (displayedEventCount === 0) {
            return "<p>No events at this location match the current filters.</p>";
        }
        
        let header = '';
        const totalEventsAtPhysicalLocation = eventsAtLocation.length; // All events physically here
        if (totalEventsAtPhysicalLocation > 1 && displayedEventCount > 0) {
             header = `<div><small>${displayedEventCount} of ${totalEventsAtPhysicalLocation} events match filters:</small></div>`;
        } else if (displayedEventCount === 1 && totalEventsAtPhysicalLocation > 1) {
             header = `<div><small>1 of ${totalEventsAtPhysicalLocation} events matches filters:</small></div>`;
        }
        // If displayedEventCount === totalEventsAtPhysicalLocation, no extra header needed as summary is enough.
        
        return header + mainContent;
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
            const markerColor = MapManager.getMarkerColor(eventsMatchingFiltersAtThisLocation);
            const customIcon = MapManager.createCustomMarkerIcon(markerColor);
            
            const hoverTooltipText = eventsMatchingFiltersAtThisLocation.length > 1 
                ? `${eventsMatchingFiltersAtThisLocation.length} events here (match filters)` 
                : eventsMatchingFiltersAtThisLocation[0].name;

            const popupContentCallback = () => {
                const sliderValues = dateSlider.get(true); 
                const currentPopupFilters = {
                    sliderStartDate: new Date(sliderValues[0]),
                    sliderEndDate: new Date(sliderValues[1]),   
                    tagStates: HashtagFilterUI.getTagStates() // Get current tag states
                };
                const allEventsForThisPhysicalLocation = eventsByLocation[locationKey] || [];
                return createLocationPopupContent(allEventsForThisPhysicalLocation, currentPopupFilters);
            };
            MapManager.addMarkerToMap([lat, lng], customIcon, hoverTooltipText, popupContentCallback);
        }
        eventCountDisplay.textContent = `Showing ${visibleEventCountTotal} events at ${visibleLocationCount} locations.`;
    }

    function isEventFilteredOut(event, filterStartDate, filterEndDate, tagStates) { 
        let dateMatch = false;
        if (!event.parsedStartDate || !event.parsedEndDate) {
            dateMatch = false; // Event has invalid/missing date info, filter it out
        } else {
            const eventStart = event.parsedStartDate;
            const eventEnd = event.parsedEndDate;
            const startFilter = (filterStartDate instanceof Date && !isNaN(filterStartDate)) ? filterStartDate : CONFIG.START_DATE;
            let endFilter = (filterEndDate instanceof Date && !isNaN(filterEndDate)) ? filterEndDate : CONFIG.END_DATE;
            endFilter = new Date(endFilter); 
            endFilter.setHours(23, 59, 59, 999);
            dateMatch = eventStart <= endFilter && eventEnd >= startFilter; // Ensure eventStart and eventEnd are valid Date objects
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
        if (!dateSlider) {
            console.warn("filterAndDisplayEvents called before dateSlider is initialized.");
            return; 
        }
        const sliderTimestamps = dateSlider.get(true);
        const currentSliderStartDate = new Date(sliderTimestamps[0]);
        const currentSliderEndDate = new Date(sliderTimestamps[1]);
        if (isNaN(currentSliderStartDate.getTime()) || isNaN(currentSliderEndDate.getTime())) {
            console.error("Slider returned invalid timestamps for filtering:", sliderTimestamps);
            return; 
        }
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
        if (!leftPanel || !resizeHandle) {
            console.warn("Panel resizing elements ('left-panel', 'resize-handle') not found in the DOM.");
            return;
        }

        let isResizing = false;
        let initialPosX = 0;
        let initialWidth = 0;

        resizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault(); // Prevent text selection or other default actions
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