const HashtagFilterUI = (() => {
    const TAG_STATE = {
        UNSELECTED: 'unselected',
        SELECTED: 'selected',
        REQUIRED: 'required',
        FORBIDDEN: 'forbidden'
    };

    const MAX_TAGS_TO_SHOW = 120;

    const state = {
        allAvailableTags: [],
        hashtagColors: {},
        hashtagDisplayNames: {},
        hashtagFiltersContainerDOM: null,
        onFilterChangeCallback: null,
        defaultMarkerColor: null,
        initialGlobalFrequencies: {},
        currentDynamicFrequencies: {},
        tagStates: {}, // Stores state for each tag: 'unselected', 'selected', 'required', or 'forbidden'
        tagPositions: new Map(),
        searchInputDOM: null,
        searchTerm: '',
        tagDisplayNameMap: {},
    };

    /**
     * Initializes the HashtagFilterUI module.
     * @param {object} config - The configuration object.
     */
    function init(config) {
        Object.assign(state, config);
        state.initialGlobalFrequencies = { ...config.initialGlobalFrequencies };
        state.currentDynamicFrequencies = { ...config.initialGlobalFrequencies };

        preprocessTags();

        state.allAvailableTags.forEach(tag => {
            state.tagStates[tag] = TAG_STATE.UNSELECTED;
        });

        if (!state.hashtagFiltersContainerDOM) {
            console.error("HashtagFilterUI: hashtagFiltersContainerDOM is not provided.");
            return;
        }

        state.searchInputDOM = document.getElementById('hashtag-search-input');
        if (state.searchInputDOM) {
            state.searchInputDOM.addEventListener('input', handleSearchInput);
            state.searchInputDOM.addEventListener('keydown', handleSearchKeydown);
        }
    }

    function handleSearchInput(e) {
        state.searchTerm = e.target.value.toLowerCase();
        renderFilters();
    }

    function handleSearchKeydown(e) {
        if (e.key === 'Escape') {
            clearSearch();
        }
    }

    function preprocessTags() {
        state.allAvailableTags.forEach(tag => {
            state.tagDisplayNameMap[tag] = (state.hashtagDisplayNames[tag] || Utils.formatHashtagForDisplay(tag)).toLowerCase();
        });
    }

    function clearSearch() {
        if (state.searchInputDOM) {
            state.searchInputDOM.value = '';
        }
        state.searchTerm = '';
        renderFilters();
    }

    /**
     * Updates the visual appearance of a tag button based on its state.
     * @param {HTMLElement} buttonElement - The button element to update.
     * @param {string} tagValue - The tag associated with the button.
     */
    function updateTagVisuals(buttonElement, tagValue) {
        const tagState = state.tagStates[tagValue];
        const displayName = state.hashtagDisplayNames[tagValue] || Utils.formatHashtagForDisplay(tagValue);
        const tagColor = state.hashtagColors[tagValue] || state.defaultMarkerColor[0];

        buttonElement.className = 'hashtag-button';
        buttonElement.style.background = '';
        buttonElement.style.backgroundColor = '';
        buttonElement.style.color = '';
        buttonElement.style.borderColor = '';
        buttonElement.style.borderWidth = '';
        buttonElement.style.textDecoration = '';
        buttonElement.style.filter = '';

        switch (tagState) {
            case TAG_STATE.SELECTED:
                buttonElement.classList.add('state-selected');
                if (Array.isArray(tagColor)) {
                    buttonElement.style.background = `linear-gradient(to bottom, ${tagColor[0]}, ${tagColor[1]})`;
                } else {
                    buttonElement.style.backgroundColor = tagColor;
                }
                buttonElement.style.color = 'white';
                break;
            case TAG_STATE.REQUIRED:
                buttonElement.classList.add('state-required');
                if (Array.isArray(tagColor)) {
                    buttonElement.style.background = `linear-gradient(to bottom, ${tagColor[0]}, ${tagColor[1]})`;
                } else {
                    buttonElement.style.backgroundColor = tagColor;
                }
                buttonElement.style.color = 'white';
                buttonElement.style.filter = 'drop-shadow(0 0 3px white)';
                break;
            case TAG_STATE.FORBIDDEN:
                buttonElement.classList.add('state-forbidden');
                buttonElement.style.textDecoration = 'line-through';
                break;
            case TAG_STATE.UNSELECTED:
            default:
                buttonElement.classList.add('state-unselected');
                break;
        }
        buttonElement.textContent = displayName;
    }

    function getNextState(currentState) {
        switch (currentState) {
            case TAG_STATE.UNSELECTED:
                return TAG_STATE.SELECTED;
            case TAG_STATE.SELECTED:
                return TAG_STATE.REQUIRED;
            case TAG_STATE.REQUIRED:
                return TAG_STATE.FORBIDDEN;
            case TAG_STATE.FORBIDDEN:
                return TAG_STATE.UNSELECTED;
            default:
                return TAG_STATE.UNSELECTED;
        }
    }

    function getPopupNextState(currentState) {
        switch (currentState) {
            case TAG_STATE.SELECTED:
            case TAG_STATE.REQUIRED:
                return TAG_STATE.UNSELECTED;
            case TAG_STATE.UNSELECTED:
                return TAG_STATE.SELECTED;
            case TAG_STATE.FORBIDDEN:
                return TAG_STATE.UNSELECTED;
            default:
                return TAG_STATE.UNSELECTED;
        }
    }

    /**
     * Creates a tag button element.
     * @param {string} tag - The tag value.
     * @returns {HTMLElement} - The created button element.
     */
    function createTagElement(tag) {
        const button = document.createElement('button');
        button.dataset.tag = tag;

        updateTagVisuals(button, tag);

        button.addEventListener('click', () => {
            state.tagStates[tag] = getNextState(state.tagStates[tag]);
            updateTagVisuals(button, tag);
            if (state.onFilterChangeCallback) {
                state.onFilterChangeCallback();
            }
        });

        button.addEventListener('contextmenu', (e) => e.preventDefault());
        return button;
    }

    /**
     * Creates an interactive tag button for use in popups.
     * @param {string} tag - The tag value.
     * @returns {HTMLElement} - The created button element.
     */
    function createInteractiveTagButton(tag) {
        const button = document.createElement('button');
        button.dataset.tag = tag;

        updateTagVisuals(button, tag);

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            state.tagStates[tag] = getNextState(state.tagStates[tag]);
            updateTagVisuals(button, tag);
            if (state.onFilterChangeCallback) {
                state.onFilterChangeCallback();
            }
        });

        button.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        return button;
    }

    function createPopupTagButton(tag) {
        const button = document.createElement('button');
        button.dataset.tag = tag;

        updateTagVisuals(button, tag);

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            state.tagStates[tag] = getPopupNextState(state.tagStates[tag]);
            updateTagVisuals(button, tag);
            if (state.onFilterChangeCallback) {
                state.onFilterChangeCallback();
            }
        });

        button.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        return button;
    }

    function renderFilters() {
        if (!state.hashtagFiltersContainerDOM) return;

        const allTagButtons = state.hashtagFiltersContainerDOM.querySelectorAll('.hashtag-button');
        allTagButtons.forEach(button => {
            const tag = button.dataset.tag;
            if (tag) {
                state.tagPositions.set(tag, button.getBoundingClientRect());
            }
        });

        state.hashtagFiltersContainerDOM.innerHTML = '';
        const tagsContainer = document.createElement('div');
        tagsContainer.classList.add('hashtag-tags-container');
        state.hashtagFiltersContainerDOM.appendChild(tagsContainer);

        const sortedTags = getSortedAndFilteredTags();
        const tagsToDisplay = sortedTags.slice(0, MAX_TAGS_TO_SHOW);

        tagsToDisplay.forEach(tag => {
            const tagElement = createTagElement(tag);
            tagsContainer.appendChild(tagElement);
        });

        animateTags();
    }

    function getSortedAndFilteredTags() {
        const statePriority = {
            [TAG_STATE.REQUIRED]: 1,
            [TAG_STATE.SELECTED]: 2,
            [TAG_STATE.FORBIDDEN]: 3,
            [TAG_STATE.UNSELECTED]: 4
        };

        const filteredTags = state.allAvailableTags.filter(tag => {
            const tagState = state.tagStates[tag];
            if (tagState === TAG_STATE.SELECTED || tagState === TAG_STATE.REQUIRED || tagState === TAG_STATE.FORBIDDEN) {
                return true;
            }
            return state.tagDisplayNameMap[tag].includes(state.searchTerm);
        });

        return filteredTags.sort((a, b) => {
            const stateA = state.tagStates[a];
            const stateB = state.tagStates[b];

            const priorityA = statePriority[stateA] || 5;
            const priorityB = statePriority[stateB] || 5;
            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }

            const currentFreqA = state.currentDynamicFrequencies[a] || 0;
            const currentFreqB = state.currentDynamicFrequencies[b] || 0;
            if (currentFreqB !== currentFreqA) {
                return currentFreqB - currentFreqA;
            }

            const initialFreqA = state.initialGlobalFrequencies[a] || 0;
            const initialFreqB = state.initialGlobalFrequencies[b] || 0;
            if (initialFreqB !== initialFreqA) {
                return initialFreqB - initialFreqA;
            }

            return a.localeCompare(b);
        });
    }

    function animateTags() {
        requestAnimationFrame(() => {
            const newTagButtons = state.hashtagFiltersContainerDOM.querySelectorAll('.hashtag-button');
            const tagsToAnimate = [];

            newTagButtons.forEach(button => {
                const tag = button.dataset.tag;
                const firstPos = state.tagPositions.get(tag);
                if (!firstPos) return;

                const lastPos = button.getBoundingClientRect();
                const dx = firstPos.left - lastPos.left;
                const dy = firstPos.top - lastPos.top;

                if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
                    tagsToAnimate.push({ button, dx, dy });
                }
            });

            tagsToAnimate.forEach(({ button, dx, dy }) => {
                button.style.transform = `translate(${dx}px, ${dy}px)`;
            });

            state.hashtagFiltersContainerDOM.offsetHeight;

            requestAnimationFrame(() => {
                tagsToAnimate.forEach(({ button }) => {
                    button.classList.add('moving');
                    button.style.transform = '';
                    button.addEventListener('transitionend', () => button.classList.remove('moving'), { once: true });
                });
            });

            state.tagPositions.clear();
        });
    }

    /**
     * Populates the initial set of filters.
     */
    function populateInitialFilters() {
        state.currentDynamicFrequencies = { ...state.initialGlobalFrequencies };
        state.allAvailableTags.forEach(tag => {
            state.tagStates[tag] = TAG_STATE.UNSELECTED;
        });
        renderFilters();
    }

    /**
     * Updates the UI based on a new set of filtered events.
     * @param {Array} filteredEvents - The currently filtered events.
     */
    function updateView(filteredEvents) {
        state.currentDynamicFrequencies = {};
        state.allAvailableTags.forEach(tag => state.currentDynamicFrequencies[tag] = 0);

        if (filteredEvents && Array.isArray(filteredEvents)) {
            const tagLocationSets = {};
            filteredEvents.forEach(event => {
                if (event.hashtags && Array.isArray(event.hashtags) && event.locationKey) {
                    event.hashtags.forEach(tag => {
                        if (state.allAvailableTags.includes(tag)) {
                            if (!tagLocationSets[tag]) {
                                tagLocationSets[tag] = new Set();
                            }
                            tagLocationSets[tag].add(event.locationKey);
                        }
                    });
                }
            });

            for (const tag in tagLocationSets) {
                state.currentDynamicFrequencies[tag] = tagLocationSets[tag].size;
            }
        }

        preprocessTags();
        renderFilters();
    }

    /**
     * Gets the current state of the tags.
     * @returns {object} - A copy of the tag states.
     */
    function getTagStates() {
        return { ...state.tagStates };
    }

    /**
     * Resets all tag selections to their default state.
     */
    function resetSelections() {
        state.allAvailableTags.forEach(tag => {
            state.tagStates[tag] = TAG_STATE.UNSELECTED;
        });
        clearSearch();
    }

    return {
        init,
        populateInitialFilters,
        updateView,
        getTagStates,
        resetSelections,
        createInteractiveTagButton,
        createPopupTagButton,
    };
})();

if (typeof Utils === 'undefined') {
    console.warn('HashtagFilterUI: Utils object is not defined. Some functionality may be affected.');
}