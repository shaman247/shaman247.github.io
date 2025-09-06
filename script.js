document.addEventListener('DOMContentLoaded', () => {
    const App = {
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
            eventsByLatLngInDateRange: {},
            lastSelectedDates: [],
        },

        config: {
            EVENT_DATA_URL: 'events.json',
            TAG_CONFIG_URL: 'tags.json',
            LOCATIONS_DATA_URL: 'locations.json',
            START_DATE: new Date(2025, 7, 1),
            END_DATE: new Date(2025, 11, 31),
            ONE_DAY_IN_MS: 24 * 60 * 60 * 1000,
            DEFAULT_MARKER_COLOR: '#444',
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

        elements: {
            hashtagFiltersContainer: document.getElementById('hashtag-filters-container'),
            datePicker: document.getElementById('date-picker'),
            datePickerSizer: document.getElementById('date-picker-sizer'),
            toggleTagsBtn: document.getElementById('toggle-tags-btn'),
            leftPanel: document.getElementById('left-panel'),
        },

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
                        const [newStart, newEnd] = selectedDates;
                        const [oldStart, oldEnd] = this.state.lastSelectedDates;

                        if (oldStart && oldEnd && newStart.getTime() === oldStart.getTime() && newEnd.getTime() === oldEnd.getTime()) {
                            return;
                        }

                        this.state.lastSelectedDates = selectedDates;
                        this.state.allEventsFilteredByDate = this.filterEventsByDateRange(newStart, newEnd);
                        
                        this.state.eventsByLatLngInDateRange = {};
                        this.state.allEventsFilteredByDate.forEach(event => {
                            if (event.locationKey) {
                                if (!this.state.eventsByLatLngInDateRange[event.locationKey]) {
                                    this.state.eventsByLatLngInDateRange[event.locationKey] = [];
                                }
                                this.state.eventsByLatLngInDateRange[event.locationKey].push(event);
                            }
                        });

                        DataManager.buildTagIndex(this.state, this.state.allEventsFilteredByDate);
                        this.filterAndDisplayEvents();
                    }
                });
                UIManager.initEventListeners(this.elements);

                this.filterAndDisplayEvents();
            } catch (error) {
                console.error("Failed to initialize app:", error);
            }
        },

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

        filterAndDisplayEvents(options = {}) {
            if (!this.state.datePickerInstance) {
                console.warn("filterAndDisplayEvents called before datePicker is initialized.");
                return;
            }

            let openPopup = null;
            let openMarker = null;
            if (this.state.map) {
                this.state.map.eachLayer(layer => {
                    if (layer instanceof L.Popup && this.state.map.hasLayer(layer)) {
                        openPopup = layer;
                        if (layer._source) { openMarker = layer._source; }
                    }
                });
            }

            const selectedDates = this.state.datePickerInstance.selectedDates;
            if (selectedDates.length < 2) {
                return;
            }

            const currentTagStates = HashtagFilterUI.getTagStates();

            const selectedTags = Object.entries(currentTagStates).filter(([, s]) => s === 'selected').map(([t]) => t);
            const requiredTags = Object.entries(currentTagStates).filter(([, s]) => s === 'required').map(([t]) => t);
            const forbiddenTags = Object.entries(currentTagStates).filter(([, s]) => s === 'forbidden').map(([t]) => t);

            let allMatchingEventsFlatList;

            if (selectedTags.length === 0 && requiredTags.length === 0) {
                allMatchingEventsFlatList = this.state.allEventsFilteredByDate;
                if (forbiddenTags.length > 0) {
                    const forbiddenTagsSet = new Set(forbiddenTags);
                    allMatchingEventsFlatList = allMatchingEventsFlatList.filter(event =>
                        !event.hashtags?.some(tag => forbiddenTagsSet.has(tag))
                    );
                }
            } else {
                let eventsToFilter;

                if (requiredTags.length > 0) {
                    let matchingEventIds = new Set(this.state.eventTagIndex[requiredTags[0]] || []);
                    for (let i = 1; i < requiredTags.length; i++) {
                        const tag = requiredTags[i];
                        const eventIdsForTag = new Set(this.state.eventTagIndex[tag] || []);
                        matchingEventIds = new Set([...matchingEventIds].filter(id => eventIdsForTag.has(id)));
                    }
                    eventsToFilter = Array.from(matchingEventIds).map(id => this.state.eventsById[id]).filter(Boolean);
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

                if (forbiddenTags.length > 0) {
                    const forbiddenTagsSet = new Set(forbiddenTags);
                    eventsToFilter = eventsToFilter.filter(event =>
                        !event.hashtags?.some(tag => forbiddenTagsSet.has(tag))
                    );
                }

                allMatchingEventsFlatList = eventsToFilter;
            }

            const filteredLocations = {};
            allMatchingEventsFlatList.forEach(event => {
                if (event.locationKey) {
                    if (!filteredLocations[event.locationKey]) {
                        filteredLocations[event.locationKey] = [];
                    }
                    filteredLocations[event.locationKey].push(event);
                }
            });

            if (openPopup) {
                const popupLatLng = openPopup.getLatLng();
                const locationKey = `${popupLatLng.lat},${popupLatLng.lng}`;
                const locationInfo = this.state.locationsByLatLng[locationKey];
                const eventsAtLocationInDateRange = this.state.eventsByLatLngInDateRange[locationKey] || [];

                const currentPopupFilters = {
                    sliderStartDate: selectedDates[0],
                    sliderEndDate: selectedDates[1],
                    tagStates: currentTagStates
                };
                const filterFunctions = {
                    isEventMatchingTagFilters: this.isEventMatchingTagFilters.bind(this)
                };
                const newContent = UIManager.createLocationPopupContent(
                    locationInfo,
                    eventsAtLocationInDateRange,
                    currentPopupFilters, 
                    filterFunctions);
                openPopup.setContent(newContent);
            }
            this.displayEventsOnMap(filteredLocations, openMarker);
            HashtagFilterUI.updateView(allMatchingEventsFlatList);
        },
        
        isEventMatchingTagFilters(event, tagStates) {
            const selectedTags = Object.entries(tagStates).filter(([, state]) => state === 'selected').map(([tag]) => tag);
            const requiredTags = Object.entries(tagStates).filter(([, state]) => state === 'required').map(([tag]) => tag);
            const forbiddenTags = Object.entries(tagStates).filter(([, state]) => state === 'forbidden').map(([tag]) => tag);

            const eventTags = new Set(event.hashtags || []);

            if (forbiddenTags.length > 0 && forbiddenTags.some(tag => eventTags.has(tag))) {
                return false;
            }
            if (requiredTags.length > 0 && !requiredTags.every(tag => eventTags.has(tag))) {
                return false;
            }
            if (requiredTags.length === 0 && selectedTags.length > 0 && !selectedTags.some(tag => eventTags.has(tag))) {
                return false;
            }
            return true;
        },
        
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

        filterEventsByDateRange(startDate, endDate) {
            return this.state.allEvents.filter(event => this.isEventInDateRange(event, startDate, endDate));
        },

        displayEventsOnMap(locationsToDisplay, markerToKeep = null) {
             let openMarkerLocationKey = null;
             if (markerToKeep) {
                 const latLng = markerToKeep.getLatLng();
                 openMarkerLocationKey = `${latLng.lat},${latLng.lng}`;
             }
 
             MapManager.clearMarkers(markerToKeep);
             let visibleLocationCount = markerToKeep ? 1 : 0;
 
             for (const locationKey in locationsToDisplay) {
                 if (locationKey === openMarkerLocationKey) {
                     continue;
                 }
 
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
                 const locationName = locationInfo ? locationInfo.location : 'Unknown Location';
 
                 const customIcon = MapManager.createMarkerIcon(locationInfo);
 
                 const popupContentCallback = () => {
                     const selectedDates = this.state.datePickerInstance.selectedDates;
                     const currentPopupFilters = {
                         sliderStartDate: selectedDates[0],
                         sliderEndDate: selectedDates[1],
                         tagStates: HashtagFilterUI.getTagStates()
                     };
                     const eventsAtLocationInDateRange = this.state.eventsByLatLngInDateRange[locationKey] || [];
                     const filterFunctions = {
                        isEventMatchingTagFilters: this.isEventMatchingTagFilters.bind(this)
                     };
                     return UIManager.createLocationPopupContent(locationInfo, eventsAtLocationInDateRange, currentPopupFilters, filterFunctions);
                 };
 
                 MapManager.addMarkerToMap([lat, lng], customIcon, locationName, popupContentCallback);
             }
        }
    };

    App.init();
});