// hashtagFilterUI.js
const HashtagFilterUI = (() => {
    const TAG_STATE_UNSELECTED = 'unselected';
    const TAG_STATE_SELECTED = 'selected'; // Logical OR
    const TAG_STATE_REQUIRED = 'required'; // Logical AND
    const TAG_STATE_FORBIDDEN = 'forbidden'; // Logical NOT

    let _allAvailableTags = [];
    let _hashtagColors = {};
    let _hashtagDisplayNames = {};
    let _hashtagFiltersContainerDOM;
    let _onFilterChangeCallback;
    let _defaultMarkerColor;
    let _initialGlobalFrequencies;
    let _currentDynamicFrequencies = {};
    let _tagStates = {}; // Stores state for each tag: 'unselected', 'selected', 'required', 'forbidden'
    let _tagPositions = new Map(); // To store tag positions for animations

    function init(config) {
        _allAvailableTags = config.allAvailableTags;
        _hashtagColors = config.hashtagColors;
        _hashtagDisplayNames = config.hashtagDisplayNames;
        _hashtagFiltersContainerDOM = config.hashtagFiltersContainerDOM;
        _onFilterChangeCallback = config.onFilterChangeCallback;
        _defaultMarkerColor = config.defaultMarkerColor;
        _initialGlobalFrequencies = { ...config.initialGlobalFrequencies };
        _currentDynamicFrequencies = { ...config.initialGlobalFrequencies };

        _allAvailableTags.forEach(tag => {
            _tagStates[tag] = TAG_STATE_UNSELECTED;
        });

        if (!_hashtagFiltersContainerDOM) {
            console.error("HashtagFilterUI: hashtagFiltersContainerDOM is not provided.");
            return;

        }
    }
    
    function _cycleTagState(tag) {
        const currentState = _tagStates[tag];
        if (currentState === TAG_STATE_UNSELECTED) {
            _tagStates[tag] = TAG_STATE_SELECTED;
        } else if (currentState === TAG_STATE_SELECTED) {
            _tagStates[tag] = TAG_STATE_REQUIRED;
        } else if (currentState === TAG_STATE_REQUIRED) {
            _tagStates[tag] = TAG_STATE_FORBIDDEN;
        } else { // TAG_STATE_FORBIDDEN
            _tagStates[tag] = TAG_STATE_UNSELECTED;
        }
    }

    function _updateTagVisuals(buttonElement, tagValue) {
        const state = _tagStates[tagValue];
        const displayName = _hashtagDisplayNames[tagValue] || Utils.formatHashtagForDisplay(tagValue);
        const tagColor = _hashtagColors[tagValue] || _defaultMarkerColor;

        // Reset classes and styles
        buttonElement.className = 'hashtag-button'; // Base class
        buttonElement.style.backgroundColor = '';
        buttonElement.style.color = '';
        buttonElement.style.borderColor = '';
        buttonElement.style.borderWidth = '';

        switch (state) {
            case TAG_STATE_SELECTED: // OR
                buttonElement.classList.add('state-selected');
                buttonElement.style.backgroundColor = tagColor;
                buttonElement.style.color = 'white';
                buttonElement.textContent = displayName;
                break;
            case TAG_STATE_REQUIRED: // AND
                buttonElement.classList.add('state-required');
                buttonElement.style.backgroundColor = tagColor;
                buttonElement.style.color = 'white';
                buttonElement.textContent = displayName;
                break;
            case TAG_STATE_FORBIDDEN: // NOT
                buttonElement.classList.add('state-forbidden');
                buttonElement.style.backgroundColor = '';
                buttonElement.style.color = 'white';
                buttonElement.textContent = displayName;
                break;
            case TAG_STATE_UNSELECTED:
            default:
                buttonElement.classList.add('state-unselected');
                buttonElement.textContent = displayName;
                break;
        }
    }

    function _createTagElement(tag) {
        const button = document.createElement('button');
        button.dataset.tag = tag; // Store tag value for reference

        _updateTagVisuals(button, tag); // Set initial appearance

        button.addEventListener('click', () => {
            _cycleTagState(tag);
            _updateTagVisuals(button, tag); // Update just this button's visuals immediately

            if (_onFilterChangeCallback) {
                _onFilterChangeCallback();
            }
        });

        button.addEventListener('contextmenu', (e) => {
            e.preventDefault(); // Prevent default right-click menu
            const currentState = _tagStates[tag];

            if (currentState === TAG_STATE_UNSELECTED) {
                _tagStates[tag] = TAG_STATE_SELECTED; // If unselected, make it selected (OR)
            } else {
                _tagStates[tag] = TAG_STATE_UNSELECTED; // If selected, required, or forbidden, make it unselected
            }

            _updateTagVisuals(button, tag); // Update just this button's visuals immediately
            if (_onFilterChangeCallback) {
                _onFilterChangeCallback();
            }
        });
        return button;
    }

    function _renderFilters() {
        if (!_hashtagFiltersContainerDOM) return;

        // Before clearing, get the 'first' position of all existing tag buttons
        const allTagButtons = _hashtagFiltersContainerDOM.querySelectorAll('.hashtag-button');
        allTagButtons.forEach(button => {
            const tag = button.dataset.tag;
            if (tag) {
                _tagPositions.set(tag, button.getBoundingClientRect());
            }
        });

        _hashtagFiltersContainerDOM.innerHTML = ''; // Clear existing filters

        // Use a <div> container instead of <ul> for a more flexible flow layout
        const tagsContainer = document.createElement('div');
        tagsContainer.classList.add('hashtag-tags-container'); // Class for styling the container
        _hashtagFiltersContainerDOM.appendChild(tagsContainer); // Attach it to the DOM

        const statePriority = {
            [TAG_STATE_REQUIRED]: 1,
            [TAG_STATE_SELECTED]: 2,
            [TAG_STATE_FORBIDDEN]: 3,
            [TAG_STATE_UNSELECTED]: 4
        };

        const sortedTags = [..._allAvailableTags].sort((a, b) => {
            const stateA = _tagStates[a];
            const stateB = _tagStates[b];

            // 1. Sort by state priority
            const priorityA = statePriority[stateA];
            const priorityB = statePriority[stateB];
            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }

            // 2. If same state priority, sort by current dynamic frequency (descending)
            const currentFreqA = _currentDynamicFrequencies[a] || 0;
            const currentFreqB = _currentDynamicFrequencies[b] || 0;
            if (currentFreqB !== currentFreqA) {
                return currentFreqB - currentFreqA; // Higher current frequency first
            }

            // 3. If same frequency, sort by initial global frequency (descending)
            const initialFreqA = _initialGlobalFrequencies[a] || 0;
            const initialFreqB = _initialGlobalFrequencies[b] || 0;
            if (initialFreqB !== initialFreqA) {
                return initialFreqB - initialFreqA; // Higher initial global frequency first
            }

            // 4. Finally, sort alphabetically
            return a.localeCompare(b);
        });
        sortedTags.forEach(tag => {
            // Ensure tag has a global frequency of at least 2 before creating element
            if ((_initialGlobalFrequencies[tag] || 0) < 2) return;
            const tagElement = _createTagElement(tag);
            tagsContainer.appendChild(tagElement);
        });

        // --- Animate tags from old to new positions (FLIP) ---
        requestAnimationFrame(() => {
            const newTagButtons = _hashtagFiltersContainerDOM.querySelectorAll('.hashtag-button');
            const tagsToAnimate = [];

            newTagButtons.forEach(button => {
                const tag = button.dataset.tag;
                const firstPos = _tagPositions.get(tag);
                
                if (!firstPos) return; // Skip tags that are new to the view

                const lastPos = button.getBoundingClientRect();

                const dx = firstPos.left - lastPos.left;
                const dy = firstPos.top - lastPos.top;

                // Only animate if the tag has moved significantly
                if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
                    tagsToAnimate.push({ button, dx, dy });
                }
            });

            // 1. INVERT: Apply the previous position as a transform for all moving tags
            tagsToAnimate.forEach(({ button, dx, dy }) => {
                button.style.transform = `translate(${dx}px, ${dy}px)`;
            });

            // We must force the browser to repaint before we apply the 'play' step.
            // Accessing a property like offsetHeight is a common and reliable way to trigger this "reflow".
            _hashtagFiltersContainerDOM.offsetHeight;

            // 2. PLAY: In the next frame, trigger the animation for all moving tags
            requestAnimationFrame(() => {
                tagsToAnimate.forEach(({ button }) => {
                    button.classList.add('moving');
                    button.style.transform = ''; // Animate to natural position

                    // 3. CLEANUP: Remove the moving class after the animation finishes
                    button.addEventListener('transitionend', () => button.classList.remove('moving'), { once: true });
                });
            });

            // Clear the map for the next render cycle
            _tagPositions.clear();
        });
    }
    
    // Public method to be called initially
    function populateInitialFilters() {
        _currentDynamicFrequencies = { ..._initialGlobalFrequencies };
        _allAvailableTags.forEach(tag => { // Ensure all tags start unselected
            _tagStates[tag] = TAG_STATE_UNSELECTED;

        });
        _renderFilters();
    }

    // Public method to update the view based on externally filtered events
    function updateView(filteredEvents) {
        _currentDynamicFrequencies = {};
        _allAvailableTags.forEach(tag => _currentDynamicFrequencies[tag] = 0); // Initialize all to 0

        if (filteredEvents && Array.isArray(filteredEvents)) {
            filteredEvents.forEach(event => {
                if (event.hashtags && Array.isArray(event.hashtags)) {
                    event.hashtags.forEach(tag => {
                        if (_allAvailableTags.includes(tag)) { // Only count available tags
                            _currentDynamicFrequencies[tag] = (_currentDynamicFrequencies[tag] || 0) + 1;
                        }
                    });
                }
            });
        }

        _renderFilters(); // Re-render with new frequencies and preserved selections
    }

    // Public method to get current tag states
    function getTagStates() {
        return { ..._tagStates }; // Return a copy
    }

    // Public method to reset selections (e.g., called by a global reset button)
    function resetSelections() {
        _allAvailableTags.forEach(tag => {
            _tagStates[tag] = TAG_STATE_UNSELECTED;

        });
        // The main app (script.js) will call filterAndDisplayEvents,
        // which will then call updateView, causing a re-render.
    }

    return {
        init,
        populateInitialFilters,
        updateView,
        getTagStates,
        resetSelections
    };
})();








// Ensure Utils.formatHashtagForDisplay is available if this file is loaded before utils.js
// or if it's used by other parts of the application.
// For this specific redesign, it's used within _createTagElement.
// If not already globally available via a Utils object, it would need to be passed in or defined.
// Assuming Utils.js is loaded and Utils is a global object.


if (typeof Utils === 'undefined') {
    console.warn('HashtagFilterUI: Utils object is not defined. Utils.formatHashtagForDisplay might not be available.');
    // Fallback or ensure Utils is loaded before this script.
    // For simplicity, this example assumes Utils is available.
}