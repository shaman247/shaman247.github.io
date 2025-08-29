
const DataManager = {
    fetchData: async function(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    },

    processLocationData: function(locationData, state) {
        state.locationsByLatLng = {};
        locationData.forEach(location => {
            if (location.lat != null && location.lng != null) {
                const locationKey = `${location.lat},${location.lng}`;
                state.locationsByLatLng[locationKey] = location;
            }
        });
    },

    processEventData: function(eventData, state, config) {
        const { exclude = [], rewrite = {} } = state.tagConfig;
        const hashtagsToExclude = new Set(exclude);
        const hashtagRewriteRules = rewrite;

        state.allEvents = eventData.flatMap((rawEvent, index) => {
            const { lat, lng, hashtags: rawHashtags, occurrences: occurrencesJson, ...restOfEvent } = rawEvent;

            ['name', 'location', 'sublocation'].forEach(field => {
                if (restOfEvent[field]) {
                    restOfEvent[field] = Utils.decodeHtml(restOfEvent[field]);
                }
            });

            if (!restOfEvent.name || lat == null || lng == null || lat === '' || lng === '') {
                return [];
            }

            ['location', 'sublocation'].forEach(field => {
                if (restOfEvent[field] && (restOfEvent[field].startsWith('None') || restOfEvent[field].startsWith('N/A'))) {
                    restOfEvent[field] = '';
                }
            });

            let parsedOccurrences;
            try {
                parsedOccurrences = this.parseOccurrences(occurrencesJson);
            } catch (e) {
                console.warn(`Could not parse occurrences for event "${rawEvent.name}":`, occurrencesJson, e);
                return [];
            }

            if (!this.isEventInAppDateRange(parsedOccurrences, config)) {
                return [];
            }

            const processedHashtags = this.processHashtags(rawHashtags, hashtagRewriteRules, hashtagsToExclude);
            const locationKey = `${lat},${lng}`;

            return [{
                id: index,
                ...restOfEvent,
                latitude: lat,
                longitude: lng,
                locationKey: locationKey,
                hashtags: processedHashtags,
                occurrences: parsedOccurrences
            }];
        });

        this.rebuildEventLookups(state);
        console.log("Total unique events processed:", state.allEvents.length);
    },

    parseOccurrences: function(occurrencesJson) {
        const occurrencesArray = JSON.parse(occurrencesJson || '[]');
        if (!Array.isArray(occurrencesArray)) return [];

        const parsedOccurrences = occurrencesArray.map(occ => {
            const [startDateStr, startTimeStr, endDateStr, endTimeStr] = occ;
            const start = Utils.parseDateInNewYork(startDateStr, startTimeStr);
            const effectiveEndDateStr = (endDateStr && endDateStr.trim() !== '') ? endDateStr : startDateStr;
            const effectiveEndTimeStr = (endTimeStr && endTimeStr.trim() !== '') ? endTimeStr : startTimeStr;
            const end = Utils.parseDateInNewYork(effectiveEndDateStr, effectiveEndTimeStr);

            if (start && !end) {
                return { start, end: new Date(start), originalStartTime: startTimeStr, originalEndTime: endTimeStr };
            }
            if (start && end) {
                return { start, end, originalStartTime: startTimeStr, originalEndTime: endTimeStr };
            }
            return null;
        }).filter(Boolean);

        parsedOccurrences.sort((a, b) => a.start - b.start);
        return parsedOccurrences;
    },

    isEventInAppDateRange: function(occurrences, config) {
        return occurrences.some(occ =>
            occ.start <= config.END_DATE && occ.end >= config.START_DATE
        );
    },

    processHashtags: function(rawHashtags, rewriteRules, excludeSet) {
        if (typeof rawHashtags !== 'string') return [];
        const tags = rawHashtags.replace(/,/g, ' ').split(/\s+/)
            .map(tag => tag.replace(/#/g, '').trim())
            .filter(Boolean)
            .map(tag => {
                const lowerTag = tag.toLowerCase();
                return rewriteRules[lowerTag] || tag;
            })
            .filter(tag => !excludeSet.has(tag.toLowerCase()));
        return [...new Set(tags)];
    },

    rebuildEventLookups: function(state) {
        state.eventsById = {};
        state.eventsByLatLng = {};
        state.allEvents.forEach(event => {
            state.eventsById[event.id] = event;
            if (event.locationKey) {
                if (!state.eventsByLatLng[event.locationKey]) {
                    state.eventsByLatLng[event.locationKey] = [];
                }
                state.eventsByLatLng[event.locationKey].push(event);
            }
        });
    },

    buildTagIndex: function(state, events) {
        const eventsToIndex = events || state.allEvents;
        state.eventTagIndex = {};
        eventsToIndex.forEach(event => {
            if (event.hashtags && Array.isArray(event.hashtags)) {
                event.hashtags.forEach(tag => {
                    if (!state.eventTagIndex[tag]) {
                        state.eventTagIndex[tag] = [];
                    }
                    state.eventTagIndex[tag].push(event.id);
                });
            }
        });
    },

    calculateHashtagFrequencies: function(state) {
        const tagLocationSets = {};
        state.allEvents.forEach(event => {
            if (event.hashtags && Array.isArray(event.hashtags) && event.locationKey) {
                event.hashtags.forEach(tag => {
                    if (!tagLocationSets[tag]) {
                        tagLocationSets[tag] = new Set();
                    }
                    tagLocationSets[tag].add(event.locationKey);
                });
            }
        });

        state.hashtagFrequencies = {};
        for (const tag in tagLocationSets) {
            state.hashtagFrequencies[tag] = tagLocationSets[tag].size;
        }
    },

    processTagHierarchy: function(state, config) {
        state.hashtagColors = state.tagConfig.colors || {};
        const allUniqueTagsSet = new Set();
        state.allEvents.forEach(event => {
            if (event.hashtags && Array.isArray(event.hashtags)) {
                event.hashtags.forEach(tag => allUniqueTagsSet.add(tag));
            }
        });

        state.allAvailableTags = Array.from(allUniqueTagsSet).sort();

        let paletteIndex = 0;
        state.allAvailableTags.forEach(tag => {
            if (!state.hashtagColors[tag]) {
                state.hashtagColors[tag] = config.HASHTAG_COLOR_PALETTE[paletteIndex % config.HASHTAG_COLOR_PALETTE.length];
                paletteIndex++;
            }
        });
    }
};
