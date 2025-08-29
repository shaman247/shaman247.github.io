document.addEventListener('DOMContentLoaded', () => {
    const App = {
        // Application state
        state: {
            map: null,
            tileLayer: null,
            markersLayer: null,
            allEvents: [],
            eventsById: {},
            tagConfig: {},
            eventsByLatLng: {},
            locationsByLatLng: {},
            hashtagColors: {},
            hashtagDisplayNames: {},
            hashtagFrequencies: {},
            datePickerInstance: null,
            allAvailableTags: [],
            eventTagIndex: {},
            allEventsFilteredByDate: [],
        },

        // Configuration constants
        config: {
            EVENT_DATA_URL: 'events.json',
            TAG_CONFIG_URL: 'tags.json',
            LOCATIONS_DATA_URL: 'locations.json',
            START_DATE: new Date(2025, 7, 1),
            END_DATE: new Date(2025, 11, 31),
            ONE_DAY_IN_MS: 24 * 60 * 60 * 1000,
            DEFAULT_MARKER_COLOR: ['#0f0', '#ccc'],
            HASHTAG_COLOR_PALETTE: [
                ['#d16a6f', '#d19f6a'], ['#e88c4b', '#e8c54b'], ['#d9c35c', '#a6d95c'],
                ['#68b08f', '#689db0'], ['#5f8fe3', '#8f5fe3'], ['#a65b9a', '#d15a63'],
                ['#4cb3a2', '#9ac44c'], ['#e0528b', '#e08b52'], ['#5a7a60', '#9c7a55'],
                ['#82b340', '#5f8fe3'], ['#d19f6a', '#d16a6f'], ['#e8c54b', '#e88c4b'],
                ['#a6d95c', '#d9c35c'], ['#689db0', '#68b08f'], ['#8f5fe3', '#5f8fe3'],
                ['#d15a63', '#a65b9a'], ['#9ac44c', '#4cb3a2'], ['#e08b52', '#e0528b'],
                ['#9c7a55', '#5a7a60'], ['#5f8fe3', '#82b340']
            ],
            MAP_INITIAL_VIEW: [40.72, -73.95],
            MAP_INITIAL_ZOOM: 12,
            MAP_TILE_URL_DARK: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
            MAP_TILE_URL_LIGHT: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
            MAP_ATTRIBUTION: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
            MAP_MAX_ZOOM: 20,
            MARKER_DISPLAY_LIMIT: 500
        },

        // DOM elements
        elements: {
            hashtagFiltersContainer: document.getElementById('hashtag-filters-container'),
            datePicker: document.getElementById('date-picker'),
            datePickerSizer: document.getElementById('date-picker-sizer'),
            toggleTagsBtn: document.getElementById('toggle-tags-btn'),
            leftPanel: document.getElementById('left-panel'),
        },

        /**
         * Initializes the application.
         */
        async init() {
            try {
                const [eventData, locationData, tagConfig] = await Promise.all([
                    DataManager.fetchData(this.config.EVENT_DATA_URL),
                    DataManager.fetchData(this.config.LOCATIONS_DATA_URL),
                    DataManager.fetchData(this.config.TAG_CONFIG_URL)
                ]);

                this.state.tagConfig = tagConfig;
                DataManager.processLocationData(locationData, this.state);
                DataManager.processEventData(eventData, this.state, this.config);
                DataManager.calculateHashtagFrequencies(this.state);
                DataManager.processTagHierarchy(this.state, this.config);
                DataManager.buildTagIndex(this.state);

                this.initMap();
                this.initHashtagFilterUI();
                UIManager.initDatePicker(this.elements, this.config, this.state, {
                    onDatePickerClose: (selectedDates) => {
                        this.state.allEventsFilteredByDate = this.filterEventsByDateRange(selectedDates[0], selectedDates[1]);
                        this.filterAndDisplayEvents();
                    }
                });
                UIManager.initEventListeners(this.elements);

                this.filterAndDisplayEvents();
            } catch (error) {
                console.error("Failed to initialize app:", error);
            }
        },

        /**
         * Initializes the Leaflet map.
         */
        initMap() {
            this.state.map = L.map('map', { zoomControl: false })
                .setView(this.config.MAP_INITIAL_VIEW, this.config.MAP_INITIAL_ZOOM);

            L.control.zoom({ position: 'topright' }).addTo(this.state.map);

            this.state.tileLayer = L.tileLayer(this.config.MAP_TILE_URL_DARK, {
                attribution: this.config.MAP_ATTRIBUTION,
                maxZoom: this.config.MAP_MAX_ZOOM
            }).addTo(this.state.map);

            const { markersLayer } = MapManager.init(this.state.map, this.state.hashtagColors, this.config.DEFAULT_MARKER_COLOR, this.state.tagConfig.markerColors);
            this.state.markersLayer = markersLayer;
        },

        /**
         * Initializes the hashtag filter UI.
         */
        initHashtagFilterUI() {
            HashtagFilterUI.init({
                allAvailableTags: this.state.allAvailableTags,
                hashtagColors: this.state.hashtagColors,
                hashtagDisplayNames: this.state.hashtagDisplayNames,
                initialGlobalFrequencies: this.state.hashtagFrequencies,
                hashtagFiltersContainerDOM: this.elements.hashtagFiltersContainer,
                onFilterChangeCallback: this.filterAndDisplayEvents.bind(this),
                defaultMarkerColor: this.config.DEFAULT_MARKER_COLOR
            });
            HashtagFilterUI.populateInitialFilters();
        },

        /**
         * Filters and displays events on the map based on current filter criteria.
         */
        filterAndDisplayEvents() {
            if (!this.state.datePickerInstance) {
                console.warn("filterAndDisplayEvents called before datePicker is initialized.");
                return;
            }

            let popupToReopenLatLng = null;
            if (this.state.map) {
                this.state.map.eachLayer(layer => {
                    if (layer instanceof L.Popup && this.state.map.hasLayer(layer)) {
                        popupToReopenLatLng = layer.getLatLng();
                    }
                });
            }

            const selectedDates = this.state.datePickerInstance.selectedDates;
            if (selectedDates.length < 2) {
                return;
            }

            const [currentSliderStartDate, currentSliderEndDate] = selectedDates;
            const currentTagStates = HashtagFilterUI.getTagStates();

            const selectedTags = Object.entries(currentTagStates).filter(([, s]) => s === 'selected').map(([t]) => t);
            const requiredTags = Object.entries(currentTagStates).filter(([, s]) => s === 'required').map(([t]) => t);

            let eventsToFilter;

            if (requiredTags.length > 0) {
                const firstRequiredTag = requiredTags[0];
                const initialEventIds = this.state.eventTagIndex[firstRequiredTag] || new Set();
                eventsToFilter = Array.from(initialEventIds).map(id => this.state.eventsById[id]).filter(Boolean);
            } else if (selectedTags.length > 0) {
                const matchingEventIds = new Set();
                selectedTags.forEach(tag => {
                    if (this.state.eventTagIndex[tag]) {
                        this.state.eventTagIndex[tag].forEach(eventId => matchingEventIds.add(eventId));
                    }
                });
                eventsToFilter = Array.from(matchingEventIds).map(id => this.state.eventsById[id]).filter(Boolean);
            } else {
                eventsToFilter = this.state.allEventsFilteredByDate;
            }

            const allMatchingEventsFlatList = eventsToFilter.filter(event =>
                this.isEventMatchingFilters(event, currentSliderStartDate, currentSliderEndDate, currentTagStates)
            );

            const filteredLocations = {};
            allMatchingEventsFlatList.forEach(event => {
                if (event.locationKey) {
                    if (!filteredLocations[event.locationKey]) {
                        filteredLocations[event.locationKey] = [];
                    }
                    filteredLocations[event.locationKey].push(event);
                }
            });

            const positiveTags = [...selectedTags, ...requiredTags];
            this.displayEventsOnMap(filteredLocations, popupToReopenLatLng, positiveTags);
            HashtagFilterUI.updateView(allMatchingEventsFlatList);
        },

        /**
         * Checks if an event matches the current date and tag filters.
         * @param {object} event - The event to check.
         * @param {Date} filterStartDate - The start of the date range.
         * @param {Date} filterEndDate - The end of the date range.
         * @param {object} tagStates - The current state of the tag filters.
         * @returns {boolean} - True if the event matches the filters.
         */
        isEventMatchingFilters(event, filterStartDate, filterEndDate, tagStates) {
            const dateMatch = this.isEventInDateRange(event, filterStartDate, filterEndDate);
            if (!dateMatch) return false;

            const selectedTags = Object.entries(tagStates).filter(([, state]) => state === 'selected').map(([tag]) => tag);
            const requiredTags = Object.entries(tagStates).filter(([, state]) => state === 'required').map(([tag]) => tag);
            const forbiddenTags = Object.entries(tagStates).filter(([, state]) => state === 'forbidden').map(([tag]) => tag);

            const eventTags = new Set(event.hashtags || []);

            // Rule 1: Must contain all required tags
            if (requiredTags.length > 0 && !requiredTags.every(tag => eventTags.has(tag))) {
                return false;
            }

            // Rule 2: Must not contain any forbidden tags
            if (forbiddenTags.length > 0 && forbiddenTags.some(tag => eventTags.has(tag))) {
                return false;
            }

            // Rule 3: Must contain at least one of the selected or required tags, if any exist.
            const positiveTags = [...selectedTags, ...requiredTags];
            if (positiveTags.length > 0 && !positiveTags.some(tag => eventTags.has(tag))) {
                return false;
            }

            return true;
        },
        
        /**
         * Checks if an event falls within a given date range.
         * @param {object} event - The event to check.
         * @param {Date} startDate - The start of the date range.
         * @param {Date} endDate - The end of the date range.
         * @returns {boolean} - True if the event is in the date range.
         */
        isEventInDateRange(event, startDate, endDate) {
            if (!event.occurrences || event.occurrences.length === 0) {
                return false;
            }
            const startFilter = (startDate instanceof Date && !isNaN(startDate)) ? startDate : this.config.START_DATE;
            let endFilter = (endDate instanceof Date && !isNaN(endDate)) ? endDate : this.config.END_DATE;
            endFilter = new Date(endFilter);
            endFilter.setHours(23, 59, 59, 999);

            for (const occurrence of event.occurrences) {
                if (occurrence.start <= endFilter && occurrence.end >= startFilter) {
                    return true;
                }
            }
            return false;
        },

        /**
         * Filters events by a date range.
         * @param {Date} startDate - The start of the date range.
         * @param {Date} endDate - The end of the date range.
         * @returns {Array} - A list of events that fall within the date range.
         */
        filterEventsByDateRange(startDate, endDate) {
            return this.state.allEvents.filter(event => this.isEventInDateRange(event, startDate, endDate));
        },

        /**
         * Displays events on the map.
         * @param {object} locationsToDisplay - The locations and events to display.
         * @param {L.LatLng} popupToReopenLatLng - The LatLng of a popup to reopen.
         * @param {Array<string>} selectedTags - The currently selected tags.
         */
        displayEventsOnMap(locationsToDisplay, popupToReopenLatLng = null, selectedTags = []) {
            const newMarkers = {};
            MapManager.clearMarkers();
            let visibleLocationCount = 0;

            for (const locationKey in locationsToDisplay) {
                if (visibleLocationCount >= this.config.MARKER_DISPLAY_LIMIT) {
                    console.warn(`Marker display limit (${this.config.MARKER_DISPLAY_LIMIT}) reached.`);
                    break;
                }

                const eventsAtLocation = locationsToDisplay[locationKey];
                if (eventsAtLocation.length === 0) continue;

                visibleLocationCount++;

                const [lat, lng] = locationKey.split(',').map(Number);
                if (lat === 0 && lng === 0) continue;

                const locationInfo = this.state.locationsByLatLng[locationKey];
                const markerEmoji = locationInfo ? locationInfo.emoji : '📍';
                const locationName = locationInfo ? locationInfo.location : 'Unknown Location';

                const markerColor = MapManager.getMarkerColor(eventsAtLocation, locationInfo);
                const customIcon = MapManager.createCustomMarkerIcon(markerColor, markerEmoji);

                const popupContentCallback = () => {
                    const selectedDates = this.state.datePickerInstance.selectedDates;
                    const currentPopupFilters = {
                        sliderStartDate: selectedDates[0],
                        sliderEndDate: selectedDates[1],
                        tagStates: HashtagFilterUI.getTagStates()
                    };
                    const allEventsForThisPhysicalLocation = this.state.eventsByLatLng[locationKey] || [];
                    return UIManager.createLocationPopupContent(locationInfo, allEventsForThisPhysicalLocation, currentPopupFilters, this.isEventMatchingFilters.bind(this));
                };

                const marker = MapManager.addMarkerToMap([lat, lng], customIcon, locationName, popupContentCallback);
                if (marker) {
                    newMarkers[locationKey] = marker;
                }
            }

            if (popupToReopenLatLng) {
                const keyToReopen = `${popupToReopenLatLng.lat},${popupToReopenLatLng.lng}`;
                if (newMarkers[keyToReopen]) {
                    newMarkers[keyToReopen].openPopup();
                }
            }
        }
    };

    App.init();
});