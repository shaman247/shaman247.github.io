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

    const CONFIG = {
        EVENT_DATA_URL: 'events.json',
        TAG_HIERARCHY_URL: 'tags.json',
        START_DATE: new Date(2025, 4, 1), // Month is 0-indexed, so 4 is May
        END_DATE: new Date(2025, 5, 30),   // 5 is June
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
        try {
            const eventData = await loadEventsFromFile(CONFIG.EVENT_DATA_URL);
            tagHierarchy = await loadEventsFromFile(CONFIG.TAG_HIERARCHY_URL);            
            processEventData(eventData);
            processTagHierarchy(); // Renamed and expanded function
            initMap();
            HashtagFilterUI.init({
                allAvailableTags: allAvailableTags,
                hashtagColors: hashtagColors,
                tagHierarchy: tagHierarchy,
                hashtagDisplayNames: hashtagDisplayNames, // Pass display names
                hashtagFrequencies: hashtagFrequencies, // Pass the calculated frequencies
                hashtagFiltersContainerDOM: hashtagFiltersContainer,
                filterAndDisplayEventsCallback: filterAndDisplayEvents,
                defaultMarkerColor: CONFIG.DEFAULT_MARKER_COLOR
            });
            HashtagFilterUI.populateFilters();
            initDateSlider();
            addEventListeners();
            filterAndDisplayEvents(); 
        } catch (error) {
            console.error("Failed to initialize app:", error);
            eventCountDisplay.textContent = "Error loading event data.";
        }
    }

    async function loadEventsFromFile(filePath) { 
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    }

    function processEventData(eventData) { 
        allEvents = eventData.map(event => {
            const parsedStartDate = event.start_date_time === "Ongoing" ? "Ongoing" : new Date(event.start_date_time);
            const parsedEndDate = event.end_date_time === "Ongoing" ? "Ongoing" : new Date(event.end_date_time);
            const locationKey = (event.latitude != null && event.longitude != null) 
                               ? `${event.latitude},${event.longitude}` : 'unknown_location';
            if (!eventsByLocation[locationKey]) eventsByLocation[locationKey] = [];
            const processedEvent = { ...event, parsedStartDate, parsedEndDate, locationKey };
            eventsByLocation[locationKey].push(processedEvent);
            return processedEvent;
        });
    }

    function initMap() { 
        const mapInstances = MapManager.init('map', CONFIG, hashtagColors, CONFIG.DEFAULT_MARKER_COLOR);
        map = mapInstances.map;
        markersLayer = mapInstances.markersLayer;
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
        // Uncheck all hashtag checkboxes (parents and children)
        document.querySelectorAll('#hashtag-filters-container .hashtag-label input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = false;
            checkbox.indeterminate = false; 
            checkbox.parentElement.classList.remove('selected');
        });
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

                if (event.location_name && event.location_name !== eventsAtLocation[0].location_name) { 
                     eventDetailHtml += `<p><strong>Venue:</strong> ${Utils.escapeHtml(event.location_name)}</p>`;
                }
                
                if (event.description) {
                    eventDetailHtml += `<p>${Utils.escapeHtml(event.description)}</p>`;
                }
                
                if (event.link) {
                    if (Utils.isValidUrl(event.link)) {
                        eventDetailHtml += `<p><a href="${Utils.escapeHtml(event.link)}" target="_blank" rel="noopener noreferrer">More Info</a></p>`;
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
                    selectedHashtags: Array.from(document.querySelectorAll('#hashtag-filters-container input:checked')).map(cb => cb.value)
                };
                const allEventsForThisPhysicalLocation = eventsByLocation[locationKey] || [];
                return createLocationPopupContent(allEventsForThisPhysicalLocation, currentPopupFilters);
            };
            MapManager.addMarkerToMap([lat, lng], customIcon, hoverTooltipText, popupContentCallback);
        }
        eventCountDisplay.textContent = `Showing ${visibleEventCountTotal} events at ${visibleLocationCount} locations.`;
    }

    function isEventFilteredOut(event, filterStartDate, filterEndDate, selectedHashtags) { 
        let dateMatch = false;
        if (event.parsedStartDate === "Ongoing") {
             dateMatch = true; 
        } else {
            const eventStart = event.parsedStartDate;
            const eventEnd = event.parsedEndDate;
            const startFilter = (filterStartDate instanceof Date && !isNaN(filterStartDate)) ? filterStartDate : CONFIG.START_DATE;
            let endFilter = (filterEndDate instanceof Date && !isNaN(filterEndDate)) ? filterEndDate : CONFIG.END_DATE;
            endFilter = new Date(endFilter); 
            endFilter.setHours(23, 59, 59, 999);
            dateMatch = eventStart <= endFilter && eventEnd >= startFilter;
        }
        let hashtagMatch = true;
        if (selectedHashtags.length > 0) {
            hashtagMatch = event.hashtags && event.hashtags.some(tag => selectedHashtags.includes(tag));
        }
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
        const selectedHashtags = Array.from(document.querySelectorAll('#hashtag-filters-container input:checked'))
                                     .map(cb => cb.value);
        const filteredLocations = {};
        for (const locationKey in eventsByLocation) {
            if (locationKey === 'unknown_location') continue;
            const eventsAtThisLocation = eventsByLocation[locationKey];
            const matchingEventsAtLocation = eventsAtThisLocation.filter(event => {
                return !isEventFilteredOut(event, currentSliderStartDate, currentSliderEndDate, selectedHashtags);
            });
            if (matchingEventsAtLocation.length > 0) {
                filteredLocations[locationKey] = matchingEventsAtLocation;
            }
        }
        displayEventsOnMap(filteredLocations);
    }

    initializeApp();
});