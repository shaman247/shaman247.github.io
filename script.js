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
        HASHTAG_COLOR_PALETTE: [ // A more saturated and distinct color palette with gradients between different hues
            ['#d62828', '#0077b6'], ['#f77f00', '#7209b7'], ['#fca311', '#00a896'], ['#222', '#8ac926'], ['#008000', '#480ca8'],
            ['#00a896', '#f77f00'], ['#00b4d8', '#ffbe0b'], ['#0077b6', '#e63946'], ['#3a86ff', '#fca311'], ['#480ca8', '#52b788'],
            ['#7209b7', '#8ac926'], ['#c724b1', '#00b4d8'], ['#f72585', '#8ac926'], ['#e63946', '#3a86ff'], ['#ffbe0b', '#5a189a'],
            ['#52b788', '#a44a3f'], ['#3a5a40', '#8c5a35'], ['#5a189a', '#ffbe0b'], ['#a44a3f', '#52b788'], ['#8c5a35', '#3a5a40']
        ],
        MAP_INITIAL_VIEW: [40.72, -73.95],
        MAP_INITIAL_ZOOM: 12,
        MAP_TILE_URL_DARK: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        MAP_TILE_URL_LIGHT: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        MAP_ATTRIBUTION: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
        MAP_MAX_ZOOM: 20
    };

    const hashtagFiltersContainer = document.getElementById('hashtag-filters-container');

    async function initializeApp() {
        try {
            const eventData = await loadEventsFromFile(CONFIG.EVENT_DATA_URL);
            const locationData = await loadEventsFromFile('locations.json');
            tagConfig = await loadTagConfigFromFile(CONFIG.TAG_CONFIG_URL);
            processEventData(eventData, locationData, tagConfig);
            calculateHashtagFrequencies();
            processTagHierarchy();
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
            HashtagFilterUI.populateInitialFilters();
            initDatePicker();
            filterAndDisplayEvents();
        } catch (error) {
            console.error("Failed to initialize app:", error);
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

            // Decode HTML entities from key fields to handle encoded characters like &amp; or &#039;
            if (restOfEvent.name) {
                restOfEvent.name = Utils.decodeHtml(restOfEvent.name);
            }
            if (restOfEvent.location) {
                restOfEvent.location = Utils.decodeHtml(restOfEvent.location);
            }
            if (restOfEvent.sublocation) {
                restOfEvent.sublocation = Utils.decodeHtml(restOfEvent.sublocation);
            }

            // Drop events that can't be mapped to a lat/lng
            if (lat == null || lng == null || lat === '' || lng === '') {
                return []; // Skip this event entirely
            }

            // If an event's location or sublocation field starts with "None" or "N/A", set it to an empty string
            if (restOfEvent.location && (restOfEvent.location.startsWith('None') || restOfEvent.location.startsWith('N/A'))) {
                restOfEvent.location = '';
            }
            if (restOfEvent.sublocation && (restOfEvent.sublocation.startsWith('None') || restOfEvent.sublocation.startsWith('N/A'))) {
                restOfEvent.sublocation = '';
            }
    
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
        const tagLocationSets = {};

        allEvents.forEach(event => {
            // Ensure the event has a locationKey to be counted.
            if (event.hashtags && Array.isArray(event.hashtags) && event.locationKey && event.locationKey !== 'unknown_location') {
                event.hashtags.forEach(tag => {
                    if (!tagLocationSets[tag]) {
                        tagLocationSets[tag] = new Set();
                    }
                    tagLocationSets[tag].add(event.locationKey);
                });
            }
        });

        hashtagFrequencies = {};
        for (const tag in tagLocationSets) {
            hashtagFrequencies[tag] = tagLocationSets[tag].size;
        }
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

    function createLocationPopupContent(locationInfo, eventsAtLocation, activeFilters) {
        const popupContainer = document.createElement('div');
        // Leaflet will wrap this in .leaflet-popup-content-wrapper.
        // The content element itself should have the class .leaflet-popup-content.
        popupContainer.className = 'leaflet-popup-content';
    
        // Filter the unique events at this location based on the current filters
        const filteredEvents = eventsAtLocation.filter(event => 
            !isEventFilteredOut(event, activeFilters.sliderStartDate, activeFilters.sliderEndDate, activeFilters.tagStates)
        );
    
        if (filteredEvents.length === 0) {
            const noEventsP = document.createElement('p');
            noEventsP.textContent = "No events at this location match the current filters.";
            popupContainer.appendChild(noEventsP);
            return popupContainer;
        }
    
        // --- Header ---
        const headerWrapper = document.createElement('div');
        headerWrapper.className = 'popup-header';
        if (locationInfo) {
            const emojiSpan = document.createElement('span');
            emojiSpan.className = 'popup-header-emoji';
            emojiSpan.textContent = Utils.escapeHtml(locationInfo.emoji);
            headerWrapper.appendChild(emojiSpan);
    
            const textWrapper = document.createElement('div');
            textWrapper.className = 'popup-header-text';
    
            const locationP = document.createElement('p');
            locationP.className = 'popup-header-location';
            locationP.innerHTML = `<strong>${Utils.escapeHtml(locationInfo.location)}</strong>`;
            textWrapper.appendChild(locationP);
    
            if (locationInfo.address) {
                const addressP = document.createElement('p');
                addressP.className = 'popup-header-address';
                addressP.innerHTML = `<small>${Utils.escapeHtml(locationInfo.address)}</small>`;
                textWrapper.appendChild(addressP);
            }
            headerWrapper.appendChild(textWrapper);
        }
        popupContainer.appendChild(headerWrapper);
    
        // --- Events List ---
        const eventsListWrapper = document.createElement('div');
        eventsListWrapper.className = 'popup-events-list';

        // Get the list of currently selected tags
        const selectedTags = Object.entries(activeFilters.tagStates)
            .filter(([, state]) => state === 'selected')
            .map(([tag]) => tag);
        const hasActiveTagFilters = selectedTags.length > 0;

        // If there are active tag filters, sort the events.
        if (hasActiveTagFilters) {
            filteredEvents.sort((a, b) => {
                const aTags = new Set(a.hashtags || []);
                const bTags = new Set(b.hashtags || []);

                const aMatchCount = selectedTags.filter(tag => aTags.has(tag)).length;
                const bMatchCount = selectedTags.filter(tag => bTags.has(tag)).length;

                // Primary sort: by number of matching tags, descending
                if (bMatchCount !== aMatchCount) {
                    return bMatchCount - aMatchCount;
                }

                // Secondary sort: chronologically by the first occurrence
                const aStart = a.occurrences?.[0]?.start?.getTime() || 0;
                const bStart = b.occurrences?.[0]?.start?.getTime() || 0;
                return aStart - bStart;
            });
        }
    
        // Determine if all events should be expanded (if fewer than 4 AND no tag filters are active)
        const expandAll = !hasActiveTagFilters && filteredEvents.length > 0 && filteredEvents.length < 4;
        let isFirstMatchingEventInPopup = true;
    
        filteredEvents.forEach(event => {
            const details = document.createElement('details');
            
            let shouldExpand = false;
            if (hasActiveTagFilters) {
                // If tag filters are active, expand if the event has any of the selected tags.
                const eventTags = new Set(event.hashtags || []);
                shouldExpand = selectedTags.some(tag => eventTags.has(tag));
            } else {
                // Original logic for when no tags are selected.
                shouldExpand = expandAll || isFirstMatchingEventInPopup;
            }
            details.open = shouldExpand;
    
            const summary = document.createElement('summary');
            summary.innerHTML = `<span class="popup-event-emoji">${Utils.escapeHtml(event.emoji)}</span> ${Utils.escapeHtml(event.name)}`;
            details.appendChild(summary);
    
            const eventDetailContainer = document.createElement('div');
            
            const dateTimeP = document.createElement('p');
            dateTimeP.className = 'popup-event-datetime';
            dateTimeP.textContent = Utils.formatEventDateTimeCompactly(event);
            eventDetailContainer.appendChild(dateTimeP);
    
            if (event.location !== locationInfo.location) {
                const eventLocationP = document.createElement('p');
                eventLocationP.className = 'popup-event-location';
                eventLocationP.innerHTML = `<em>${Utils.escapeHtml(event.location)}</em>`;
                eventDetailContainer.appendChild(eventLocationP);
            }
            if (event.sublocation && event.sublocation !== locationInfo.location && !event.sublocation.startsWith("Error")) {
                const sublocationP = document.createElement('p');
                sublocationP.className = 'popup-event-location';
                sublocationP.innerHTML = `<em>${Utils.escapeHtml(event.sublocation)}</em>`;
                eventDetailContainer.appendChild(sublocationP);
            }
    
            const descriptionP = document.createElement('p');
            descriptionP.innerHTML = Utils.escapeHtml(event.description);
            if (event.url && Utils.isValidUrl(event.url)) {
                const linkIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
                const urlLink = document.createElement('a');
                urlLink.href = Utils.escapeHtml(event.url);
                urlLink.target = '_blank';
                urlLink.rel = 'noopener noreferrer';
                urlLink.className = 'popup-external-link';
                urlLink.title = 'More Info (opens in new tab)';
                urlLink.innerHTML = ` ${linkIconSvg}`;
                descriptionP.appendChild(urlLink);
            }
            eventDetailContainer.appendChild(descriptionP);
    
            if (event.hashtags && event.hashtags.length > 0) {
                const tagsContainer = document.createElement('div');
                tagsContainer.className = 'hashtag-tags-container popup-tags-container';
                event.hashtags.forEach(tag => {
                    const tagButton = HashtagFilterUI.createInteractiveTagButton(tag);
                    if (tagButton) {
                        tagsContainer.appendChild(tagButton);
                    }
                });
                eventDetailContainer.appendChild(tagsContainer);
            }
    
            details.appendChild(eventDetailContainer);
            eventsListWrapper.appendChild(details);
            isFirstMatchingEventInPopup = false;
        });
    
        popupContainer.appendChild(eventsListWrapper);
        return popupContainer;
    }

    function displayEventsOnMap(locationsToDisplay, popupToReopenLatLng = null, selectedTags = []) {
        const newMarkers = {}; // To store newly created markers by their locationKey
        MapManager.clearMarkers();
        let visibleEventCountTotal = 0;
        let visibleLocationCount = 0;

        for (const locationKey in locationsToDisplay) {
            if (locationKey === 'unknown_location') continue;

            const eventsMatchingFiltersAtThisLocation = locationsToDisplay[locationKey];
            if (eventsMatchingFiltersAtThisLocation.length === 0) continue;

            visibleLocationCount++;
            visibleEventCountTotal += eventsMatchingFiltersAtThisLocation.length; 

            // Determine if the marker should be prominent
            let isProminent = false;
            if (selectedTags.length > 1) {
                const uniqueTagsAtLocation = new Set();
                eventsMatchingFiltersAtThisLocation.forEach(event => {
                    (event.hashtags || []).forEach(tag => uniqueTagsAtLocation.add(tag));
                });

                const matchedTagsCount = selectedTags.filter(tag => uniqueTagsAtLocation.has(tag)).length;
                if (matchedTagsCount > 1) {
                    isProminent = true;
                }
            }

            const [lat, lng] = locationKey.split(',').map(Number);
            const locationInfo = locationsByLatLng[locationKey];
            const markerEmoji = locationInfo ? locationInfo.emoji : '📍';
            const locationName = locationInfo ? locationInfo.location : 'Unknown Location';

            const markerColor = MapManager.getMarkerColor(eventsMatchingFiltersAtThisLocation);
            const customIcon = MapManager.createCustomMarkerIcon(markerColor[0], markerEmoji, isProminent);
            
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
            if (lat!=0 && lng!=0) { 
                const marker = MapManager.addMarkerToMap([lat, lng], customIcon, hoverTooltipText, popupContentCallback, isProminent);
                if (marker) {
                    newMarkers[locationKey] = marker;
                }
            }
        }

        // After redrawing all markers, check if a popup was open and re-open it.
        if (popupToReopenLatLng) {
            const keyToReopen = `${popupToReopenLatLng.lat},${popupToReopenLatLng.lng}`;
            if (newMarkers[keyToReopen]) {
                newMarkers[keyToReopen].openPopup();
            }
        }
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

        const selectedTags = Object.entries(tagStates)
            .filter(([, state]) => state === 'selected')
            .map(([tag]) => tag);

        let hashtagMatch = true;
        // If there are any selected tags, the event must have at least ONE of them (OR logic).
        if (selectedTags.length > 0) {
            const eventTags = new Set(event.hashtags || []);
            hashtagMatch = selectedTags.some(tag => eventTags.has(tag));
        }

        return !(dateMatch && hashtagMatch); 
    }

    function filterAndDisplayEvents() {
        if (!datePickerInstance) {
            console.warn("filterAndDisplayEvents called before datePicker is initialized.");
            return; 
        }

        // Before clearing markers, check if a popup is open.
        // If so, we'll store its location to reopen it after the redraw.
        let popupToReopenLatLng = null;
        if (map) { // Ensure map is initialized
            map.eachLayer(layer => {
                if (layer instanceof L.Popup && map.hasLayer(layer)) {
                    popupToReopenLatLng = layer.getLatLng();
                }
            });
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

        // Get selected tags to pass to the map display function for prominence logic
        const selectedTags = Object.entries(currentTagStates)
            .filter(([, state]) => state === 'selected')
            .map(([tag]) => tag);

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

        displayEventsOnMap(filteredLocations, popupToReopenLatLng, selectedTags);

        // Update the HashtagFilterUI view with the new set of filtered events and current selections
        HashtagFilterUI.updateView(allMatchingEventsFlatList);
    }

    initializeApp();
});