
const UIManager = {
    initDatePicker: function(elements, config, state, callbacks) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let initialStartDate = config.START_DATE;
        if (today.getTime() > config.START_DATE.getTime() && today.getTime() <= config.END_DATE.getTime()) {
            initialStartDate = today;
        }

        const defaultEndDate = new Date(today.getTime() + (14 * config.ONE_DAY_IN_MS));
        const finalDefaultEndDate = defaultEndDate > config.END_DATE ? config.END_DATE : defaultEndDate;

        state.datePickerInstance = flatpickr(elements.datePicker, {
            mode: "range",
            dateFormat: "M j",
            defaultDate: [initialStartDate, finalDefaultEndDate],
            minDate: config.START_DATE,
            maxDate: config.END_DATE,
            monthSelectorType: "static",
            onReady: (selectedDates, dateStr, instance) => this.resizeDatePickerInput(instance, elements),
            onClose: (selectedDates, dateStr, instance) => {
                if (selectedDates.length === 2) {
                    callbacks.onDatePickerClose(selectedDates);
                }
                this.resizeDatePickerInput(instance, elements);
            }
        });

        const initialSelectedDates = state.datePickerInstance.selectedDates;
        if (initialSelectedDates.length === 2) {
            callbacks.onDatePickerClose(initialSelectedDates);
        }
    },

    initEventListeners: function(elements) {
        if (elements.toggleTagsBtn && elements.hashtagFiltersContainer) {
            if (window.innerWidth <= 768 && !elements.leftPanel.classList.contains('collapsed')) {
                elements.hashtagFiltersContainer.classList.add('collapsed');
            }
            elements.toggleTagsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                elements.hashtagFiltersContainer.classList.toggle('collapsed');
            });
        }
    },

    resizeDatePickerInput: function(instance, elements) {
        const input = instance.input;
        const sizer = elements.datePickerSizer;
        if (!sizer || !input) return;
        sizer.textContent = input.value || input.placeholder;
        input.style.width = `${sizer.offsetWidth + 5}px`;
    },

    createLocationPopupContent: function(locationInfo, eventsAtLocation, activeFilters, filterFunctions) {
        const popupContainer = document.createElement('div');
        popupContainer.className = 'leaflet-popup-content';

        if (locationInfo) {
            popupContainer.appendChild(this.createPopupHeader(locationInfo));
        }

        popupContainer.appendChild(this.createEventsList(eventsAtLocation, activeFilters, locationInfo, filterFunctions));

        return popupContainer;
    },

    createPopupHeader: function (locationInfo) {
        const headerWrapper = document.createElement('div');
        headerWrapper.className = 'popup-header';

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
        return headerWrapper;
    },

    createEventsList: function(eventsAtLocation, activeFilters, locationInfo, filterFunctions) {
        const eventsListWrapper = document.createElement('div');
        eventsListWrapper.className = 'popup-events-list';

        if (eventsAtLocation.length === 0) {
            const noEventsP = document.createElement('p');
            noEventsP.textContent = "No events at this location in the selected date range.";
            eventsListWrapper.appendChild(noEventsP);
            return eventsListWrapper;
        }

        const selectedTags = Object.entries(activeFilters.tagStates)
            .filter(([, state]) => (state === 'selected' || state === 'required'))
            .map(([tag]) => tag);

        const hasActiveTagFilters = selectedTags.length > 0;
        const hasForbiddenTags = Object.entries(activeFilters.tagStates).some(([, state]) => state === 'forbidden');
        const hasAnyTagFilter = hasActiveTagFilters || hasForbiddenTags;

        eventsAtLocation.sort((a, b) => {
            const aTagMatch = filterFunctions.isEventMatchingTagFilters(a, activeFilters.tagStates);
            const bTagMatch = filterFunctions.isEventMatchingTagFilters(b, activeFilters.tagStates);

            // Events matching tags get priority
            if (aTagMatch !== bTagMatch) {
                return bTagMatch - aTagMatch; // true (1) comes before false (0)
            }

            // Secondary sort: if scores are equal, sort by tag match count if there are active tag filters
            if (hasActiveTagFilters) {
                const aMatchCount = selectedTags.filter(tag => (a.hashtags || []).includes(tag)).length;
                const bMatchCount = selectedTags.filter(tag => (b.hashtags || []).includes(tag)).length;
                if (bMatchCount !== aMatchCount) {
                    return bMatchCount - aMatchCount;
                }
            }

            // Tertiary sort: by start date
            const aStart = a.occurrences?.[0]?.start?.getTime() || 0;
            const bStart = b.occurrences?.[0]?.start?.getTime() || 0;
            return aStart - bStart;
        });

        const matchingEvents = eventsAtLocation.filter(event => filterFunctions.isEventMatchingTagFilters(event, activeFilters.tagStates));
        const expandAll = !hasAnyTagFilter && eventsAtLocation.length > 0 && eventsAtLocation.length < 4;
        let isFirstEvent = true;

        eventsAtLocation.forEach(event => {
            const details = document.createElement('details');
            const eventMatches = matchingEvents.includes(event);

            if (hasAnyTagFilter) {
                details.open = eventMatches;
            } else {
                details.open = expandAll || isFirstEvent;
            }

            const summary = document.createElement('summary');
            summary.innerHTML = `<span class="popup-event-emoji">${Utils.escapeHtml(event.emoji)}</span> ${Utils.escapeHtml(event.name)}`;

            details.appendChild(summary);

            details.appendChild(this.createEventDetail(event, locationInfo));
            eventsListWrapper.appendChild(details);
            isFirstEvent = false;
        });

        return eventsListWrapper;
    },

    createEventDetail: function(event, locationInfo) {
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

        return eventDetailContainer;
    }
};
