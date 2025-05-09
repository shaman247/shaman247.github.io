// script.js
document.addEventListener('DOMContentLoaded', () => {
    let map;
    let markersLayer;
    let allEvents = [];
    let eventsByLocation = {};
    let hashtagColors = {}; // Stores { '#Tag': 'color' }
    let dateSlider;
    
    const MAY_2025_START_DATE = new Date(2025, 4, 1); 
    const MAY_2025_END_DATE = new Date(2025, 4, 31);

    const DEFAULT_MARKER_COLOR = '#757575'; 
    const HASHTAG_COLOR_PALETTE = [ 
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#FED766', '#2AB7CA',
        '#F0B67F', '#8A6FBF', '#F9A828', '#C1E1A6', '#FF8C94',
        '#A1C3D1', '#B39BC8', '#F3EAC2', '#F7A6B4', '#5D5C61',
        '#FFD166', '#06D6A0', '#118AB2', '#EF476F', '#073B4C' 
    ];

    const startDateElement = document.getElementById('slider-start-date');
    const endDateElement = document.getElementById('slider-end-date');
    const hashtagFiltersContainer = document.getElementById('hashtag-filters-container');
    const eventCountDisplay = document.getElementById('event-count-display');

    async function initializeApp() {
        try {
            const eventData = await loadEventsFromFile('events.json');
            processEventData(eventData);
            initMap();
            const sortedHashtagData = processHashtagData(); 
            populateHashtagFilters(sortedHashtagData);   
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
        map = L.map('map').setView([40.6782, -73.9442], 12);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd', maxZoom: 20
        }).addTo(map);
        markersLayer = L.layerGroup().addTo(map);
    }

    function processHashtagData() {
        const frequencies = {};
        const uniqueTagsSet = new Set();

        allEvents.forEach(event => {
            if (event.hashtags && Array.isArray(event.hashtags)) {
                event.hashtags.forEach(tag => {
                    uniqueTagsSet.add(tag);
                    frequencies[tag] = (frequencies[tag] || 0) + 1;
                });
            }
        });

        const alphabeticallySortedUniqueTags = Array.from(uniqueTagsSet).sort();
        alphabeticallySortedUniqueTags.forEach((tag, index) => {
            hashtagColors[tag] = HASHTAG_COLOR_PALETTE[index % HASHTAG_COLOR_PALETTE.length];
        });

        const displayData = alphabeticallySortedUniqueTags.map(tag => ({
            tag: tag,
            count: frequencies[tag],
            color: hashtagColors[tag] 
        }));

        displayData.sort((a, b) => {
            if (b.count !== a.count) {
                return b.count - a.count;
            }
            return a.tag.localeCompare(b.tag);
        });
        return displayData;
    }

    function populateHashtagFilters(sortedHashtagData) {
        hashtagFiltersContainer.innerHTML = '';
        sortedHashtagData.forEach(data => {
            const { tag, count, color } = data;
            const label = document.createElement('label');
            label.classList.add('hashtag-label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox'; checkbox.value = tag;
            checkbox.id = `tag-${tag.replace(/[^a-zA-Z0-9]/g, '')}`;
            checkbox.addEventListener('change', () => {
                label.classList.toggle('selected', checkbox.checked);
                filterAndDisplayEvents();
            });
            const colorSwatch = document.createElement('div');
            colorSwatch.classList.add('hashtag-color-swatch');
            colorSwatch.style.backgroundColor = color || DEFAULT_MARKER_COLOR;
            const span = document.createElement('span');
            span.textContent = `${tag} (${count})`;
            label.appendChild(checkbox); label.appendChild(colorSwatch); 
            label.appendChild(span);
            label.htmlFor = checkbox.id;
            hashtagFiltersContainer.appendChild(label);
        });
    }
    
    function formatDateForDisplay(timestamp) { 
        const date = new Date(Number(timestamp)); 
        if (isNaN(date.getTime())) { 
            console.warn("formatDateForDisplay received an invalid timestamp:", timestamp);
            return "Invalid Date";
        }
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function initDateSlider() { 
        const slider = document.getElementById('date-slider');
        if (isNaN(MAY_2025_START_DATE.getTime()) || isNaN(MAY_2025_END_DATE.getTime())) {
            console.error("MAY_2025_START_DATE or MAY_2025_END_DATE is invalid!");
            MAY_2025_START_DATE = new Date(2025, 4, 1);
            MAY_2025_END_DATE = new Date(2025, 4, 31);
        }
        const startTimestamp = MAY_2025_START_DATE.getTime();
        const endTimestamp = MAY_2025_END_DATE.getTime();
        dateSlider = noUiSlider.create(slider, {
            range: { min: startTimestamp, max: endTimestamp },
            start: [startTimestamp, endTimestamp],
            connect: true, step: 24 * 60 * 60 * 1000,
            behaviour: 'drag-tap', margin: 24 * 60 * 60 * 1000 * 1
        });
        dateSlider.on('update', (values, handle, unencoded) => { 
            startDateElement.textContent = formatDateForDisplay(unencoded[0]);
            endDateElement.textContent = formatDateForDisplay(unencoded[1]);
        });
        dateSlider.on('set', filterAndDisplayEvents); 
        const initialTimestamps = dateSlider.get(true);
        startDateElement.textContent = formatDateForDisplay(initialTimestamps[0]);
        endDateElement.textContent = formatDateForDisplay(initialTimestamps[1]);
    }
    
    function addEventListeners() { 
        document.getElementById('reset-filters').addEventListener('click', resetFilters);
    }

    function resetFilters() { 
        if (dateSlider) {
            dateSlider.set([MAY_2025_START_DATE.getTime(), MAY_2025_END_DATE.getTime()]);
        }
        const hashtagCheckboxes = document.querySelectorAll('#hashtag-filters-container input[type="checkbox"]');
        hashtagCheckboxes.forEach(checkbox => {
            checkbox.checked = false;
            checkbox.parentElement.classList.remove('selected');
        });
        // filterAndDisplayEvents(); // 'set' event on slider will trigger this
    }

    function getMarkerColorForLocation(eventsAtThisLocation) { 
        if (eventsAtThisLocation && eventsAtThisLocation.length > 0) {
            const firstEvent = eventsAtThisLocation[0];
            if (firstEvent.hashtags && firstEvent.hashtags.length > 0) {
                const firstTag = firstEvent.hashtags[0];
                return hashtagColors[firstTag] || DEFAULT_MARKER_COLOR;
            }
        }
        return DEFAULT_MARKER_COLOR;
    }
    
    function escapeHtml(unsafe) { 
        if (typeof unsafe !== 'string') return '';
        return unsafe
             .replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">")
             .replace(/"/g, "\"").replace(/'/g, "'");
    }

    function isValidUrl(string) { 
        return string && (string.startsWith('http://') || string.startsWith('https://'));
    }

    function formatEventDateTimeCompactly(event) {
        if (event.parsedStartDate === "Ongoing") return "Ongoing";
        const start = event.parsedStartDate;
        const end = event.parsedEndDate;
        if (!(start instanceof Date) || isNaN(start) || !(end instanceof Date) || isNaN(end)) return "Date/Time N/A";
        
        const optionsDate = { month: 'short', day: 'numeric' };
        // More robust time formatting to handle potential ':00' and space correctly
        const formatTime = (date) => {
            let timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
            timeStr = timeStr.replace(':00 AM', 'am').replace(':00 PM', 'pm'); // First handle :00
            timeStr = timeStr.replace(' AM', 'am').replace(' PM', 'pm'); // Then handle remaining space AM/PM
            return timeStr;
        };

        const startDateStr = start.toLocaleDateString('en-US', optionsDate);
        const startTimeStr = formatTime(start);
        const endDateStr = end.toLocaleDateString('en-US', optionsDate);
        const endTimeStr = formatTime(end);

        if (startDateStr === endDateStr) {
            if (startTimeStr === endTimeStr) return `${startDateStr}, ${startTimeStr}`;
            return `${startDateStr} ${startTimeStr}–${endTimeStr}`; // Using en-dash
        } else {
            return `${startDateStr}, ${startTimeStr} – ${endDateStr}, ${endTimeStr}`;
        }
    }

    function createLocationPopupContent(eventsAtLocation, activeFilters) {
        let mainContent = '';
        let displayedEventCount = 0;
        let isFirstMatchingEventInPopup = true;

        eventsAtLocation.forEach(event => {
            if (!isEventFilteredOut(event, activeFilters.sliderStartDate, activeFilters.sliderEndDate, activeFilters.selectedHashtags)) {
                displayedEventCount++;
                let eventDetailHtml = '';
                eventDetailHtml += `<p class="popup-event-datetime">${formatEventDateTimeCompactly(event)}</p>`;
                if (event.location_name && event.location_name !== eventsAtLocation[0].location_name) { 
                     eventDetailHtml += `<p><strong>Venue:</strong> ${escapeHtml(event.location_name)}</p>`;
                }
                if (event.description) eventDetailHtml += `<p>${escapeHtml(event.description)}</p>`;
                if (event.link) {
                    if (isValidUrl(event.link)) {
                        eventDetailHtml += `<p><a href="${escapeHtml(event.link)}" target="_blank" rel="noopener noreferrer">More Info</a></p>`;
                    } else {
                        eventDetailHtml += `<p><strong>Info:</strong> ${escapeHtml(event.link)}</p>`;
                    }
                }
                if (event.hashtags && event.hashtags.length > 0) {
                    eventDetailHtml += `<p>${event.hashtags.map(tag => 
                        `<span style="color:${hashtagColors[tag] || 'inherit'}; font-weight:bold;">${escapeHtml(tag)}</span>`
                    ).join(', ')}</p>`;
                }
                const isOpen = isFirstMatchingEventInPopup; 
                mainContent += `<details ${isOpen ? 'open' : ''}>`;
                mainContent += `<summary>${escapeHtml(event.name)}</summary>`;
                mainContent += eventDetailHtml;
                mainContent += `</details>`;
                isFirstMatchingEventInPopup = false; 
            }
        });

        if (displayedEventCount === 0) return "<p>No events at this location match the current filters.</p>";
        
        let header = '';
        const totalEventsAtPhysicalLocation = eventsAtLocation.length;
        if (totalEventsAtPhysicalLocation > 1 && displayedEventCount > 0 && displayedEventCount < totalEventsAtPhysicalLocation) {
             header = `<div><small>${displayedEventCount} of ${totalEventsAtPhysicalLocation} events match filters:</small></div>`;
        } else if (displayedEventCount === 1 && totalEventsAtPhysicalLocation > 1) {
             header = `<div><small>1 of ${totalEventsAtPhysicalLocation} events matches filters:</small></div>`;
        }
        return header + mainContent;
    }

    function displayEventsOnMap(locationsToDisplay) {
        markersLayer.clearLayers();
        let visibleEventCountTotal = 0;
        let visibleLocationCount = 0;

        for (const locationKey in locationsToDisplay) {
            if (locationKey === 'unknown_location') continue;
            const eventsMatchingFiltersAtThisLocation = locationsToDisplay[locationKey];
            if (eventsMatchingFiltersAtThisLocation.length === 0) continue;

            visibleLocationCount++;
            visibleEventCountTotal += eventsMatchingFiltersAtThisLocation.length; 
            const [lat, lng] = locationKey.split(',').map(Number);
            const markerColor = getMarkerColorForLocation(eventsMatchingFiltersAtThisLocation); 
            const customIcon = L.divIcon({
                className: 'custom-marker-icon',
                html: `<div style="background-color: ${markerColor}; width: 100%; height: 100%; border-radius: 50%;"></div>`,
                iconSize: [20, 20], iconAnchor: [10, 10] 
            });
            const marker = L.marker([lat, lng], { icon: customIcon });
            const hoverTooltipText = eventsMatchingFiltersAtThisLocation.length > 1 
                ? `${eventsMatchingFiltersAtThisLocation.length} events here (match filters)` 
                : eventsMatchingFiltersAtThisLocation[0].name;
            marker.bindTooltip(hoverTooltipText);

            marker.bindPopup(() => { 
                const sliderValues = dateSlider.get(true); 
                const currentPopupFilters = {
                    sliderStartDate: new Date(sliderValues[0]),
                    sliderEndDate: new Date(sliderValues[1]),   
                    selectedHashtags: Array.from(document.querySelectorAll('#hashtag-filters-container input:checked')).map(cb => cb.value)
                };
                const allEventsForThisPhysicalLocation = eventsByLocation[locationKey] || [];
                return createLocationPopupContent(allEventsForThisPhysicalLocation, currentPopupFilters);
            });
            markersLayer.addLayer(marker);
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
            const startFilter = (filterStartDate instanceof Date && !isNaN(filterStartDate)) ? filterStartDate : MAY_2025_START_DATE;
            let endFilter = (filterEndDate instanceof Date && !isNaN(filterEndDate)) ? filterEndDate : MAY_2025_END_DATE;
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