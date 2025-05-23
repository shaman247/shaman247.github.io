// hashtagFilterUI.js
const HashtagFilterUI = (() => {
    let _allAvailableTags = [];
    let _hashtagColors = {};
    let _tagHierarchy = [];
    let _hashtagDisplayNames = {}; // To store display names
    let _hashtagFiltersContainerDOM;
    let _filterAndDisplayEventsCallback;
    let _defaultMarkerColor;
    let _hashtagFrequencies; // To store hashtag frequencies

    function init(config) {
        _allAvailableTags = config.allAvailableTags;
        _hashtagColors = config.hashtagColors;
        _tagHierarchy = config.tagHierarchy;
        _hashtagDisplayNames = config.hashtagDisplayNames; // Store display names
        _hashtagFiltersContainerDOM = config.hashtagFiltersContainerDOM;
        _filterAndDisplayEventsCallback = config.filterAndDisplayEventsCallback;
        _defaultMarkerColor = config.defaultMarkerColor;
        _hashtagFrequencies = config.hashtagFrequencies; // Get frequencies
    }

    function _updateLabelAppearance(label, checkbox, tagValue) {
        const isSelected = checkbox.checked;
        const isIndeterminate = checkbox.indeterminate;
        const tagColor = _hashtagColors[tagValue] || _defaultMarkerColor;

        // Add 'selected' class only if the checkbox is truly checked (not indeterminate)
        label.classList.toggle('selected', isSelected && !isIndeterminate);
        // Optionally, add a class for indeterminate state if specific styling is needed via CSS
        // label.classList.toggle('indeterminate', isIndeterminate);

        if (isSelected && !isIndeterminate) {
            label.style.backgroundColor = tagColor;
        } else {
            label.style.backgroundColor = ''; // Clear background if not checked or indeterminate
        }
    }

    function _createIndividualTagCheckbox(tag, container) {
        const label = document.createElement('label');
        label.classList.add('hashtag-label');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = tag;
        checkbox.id = `tag-filter-${tag.replace(/[^a-zA-Z0-9]/g, '')}`;
        
        checkbox.addEventListener('change', () => {
            _updateLabelAppearance(label, checkbox, tag);
            // When an individual tag (potentially a parent itself) changes,
            // update its parent categories in the UI tree recursively.
            _updateParentCategoryCheckboxRecursive(label.closest('.hashtag-item'));
            _filterAndDisplayEventsCallback();
        });

        // const swatch = document.createElement('div');
        // swatch.classList.add('hashtag-color-swatch', 'circle-swatch');
        // swatch.style.borderColor = _hashtagColors[tag] || _defaultMarkerColor;
        // swatch.style.backgroundColor = _hashtagColors[tag] || _defaultMarkerColor;

        const span = document.createElement('span');
        span.textContent = _hashtagDisplayNames[tag] || Utils.formatHashtagForDisplay(tag);

        label.appendChild(checkbox);
        // label.appendChild(swatch);
        label.appendChild(span);
        container.appendChild(label);
        return checkbox; // Return the checkbox element for potential parent updates
    }

    function _buildTree(nodes, parentContainer, level) {
        nodes.forEach(node => {
            const tagName = node.hashtag;
            const children = node.children || [];
            let hasDisplayableChildren = false;

            const nodeOrDescendantsHaveAvailableTags = (currentNode) => {
                if (_allAvailableTags.includes(currentNode.hashtag)) return true;
                if (currentNode.children && currentNode.children.length > 0) {
                    return currentNode.children.some(child => nodeOrDescendantsHaveAvailableTags(child));
                }
                return false;
            };

            if (!nodeOrDescendantsHaveAvailableTags(node)) {
                return;
            }

            if (children.length > 0) {
                hasDisplayableChildren = children.some(childNode => nodeOrDescendantsHaveAvailableTags(childNode));
            }

            const tagItemDiv = document.createElement('div');
            tagItemDiv.classList.add('hashtag-item');
            tagItemDiv.style.marginLeft = `${level * 20}px`;

            const headerDiv = document.createElement('div');
            headerDiv.classList.add('hashtag-header-content');
            headerDiv.style.display = 'flex'; // Arrange icon and label horizontally
            headerDiv.style.alignItems = 'center'; // Vertically align icon and label
            // Reduce vertical padding to make the header more compact
            headerDiv.style.paddingTop = '1px'; // Reduced vertical padding
            headerDiv.style.paddingBottom = '1px'; // Reduced vertical padding

            const toggleIconElement = document.createElement('span'); // Renamed for clarity
            toggleIconElement.classList.add('toggle-icon');
            // Styles for compactness, consistent width, and spacing
            toggleIconElement.style.display = 'inline-block';
            toggleIconElement.style.width = '1.2em';          // Ensures consistent spacing for alignment
            toggleIconElement.style.textAlign = 'center';     // Centers the '►' or '▼' character
            toggleIconElement.style.marginRight = '5px';      // Compact spacing between icon and label
            toggleIconElement.style.color = _hashtagColors[tagName] || _defaultMarkerColor; // Set triangle color

            if (hasDisplayableChildren) {
                toggleIconElement.textContent = '►';
                toggleIconElement.style.cursor = 'pointer'; // Indicate it's interactive
            } else {
                // For items without children, the icon element still occupies space for alignment
                // but won't have a clickable appearance or interactive symbol.
                toggleIconElement.classList.add('placeholder-icon'); // For potential specific styling
                // It will use the width, textAlign, and marginRight defined above.
                // No textContent needed, or use '&nbsp;' if visual debugging shows collapse.
            }
            headerDiv.appendChild(toggleIconElement); // Add the styled icon element
            
            // The label now directly contains the checkbox, swatch, and name
            // and is part of the headerDiv.
            const label = document.createElement('label');
            label.classList.add('hashtag-label');
            label.style.paddingLeft = '5px'; // Add left padding
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = tagName;
            checkbox.id = `tag-filter-ui-${tagName.replace(/[^a-zA-Z0-9]/g, '')}`; // Ensure unique ID

            // const swatch = document.createElement('div');
            // swatch.classList.add('hashtag-color-swatch', 'circle-swatch');
            // swatch.style.borderColor = _hashtagColors[tagName] || _defaultMarkerColor;
            // swatch.style.backgroundColor = _hashtagColors[tagName] || _defaultMarkerColor;

            const span = document.createElement('span');
            span.textContent = _hashtagDisplayNames[tagName] || Utils.formatHashtagForDisplay(tagName);

            label.appendChild(checkbox);
            // label.appendChild(swatch);
            label.appendChild(span);
            headerDiv.appendChild(label);

            tagItemDiv.appendChild(headerDiv);

            const childrenContainer = document.createElement('div');
            childrenContainer.classList.add('hashtag-children');

            if (hasDisplayableChildren) {
                _buildTree(children, childrenContainer, 0);
                tagItemDiv.appendChild(childrenContainer);

                toggleIconElement.addEventListener('click', () => { // Use the updated variable name
                    tagItemDiv.classList.toggle('open');
                    toggleIconElement.textContent = tagItemDiv.classList.contains('open') ? '▼' : '►';
                });
            }

            checkbox.addEventListener('change', () => {
                _updateLabelAppearance(label, checkbox, tagName);
                if (hasDisplayableChildren) {
                    const descendantCheckboxes = childrenContainer.querySelectorAll('.hashtag-label input[type="checkbox"]');
                    descendantCheckboxes.forEach(descCb => {
                        if (descCb.checked !== checkbox.checked) {
                            descCb.checked = checkbox.checked;
                            _updateLabelAppearance(descCb.parentElement, descCb, descCb.value);
                        }
                    });
                }
                _updateParentCategoryCheckboxRecursive(tagItemDiv);
                _filterAndDisplayEventsCallback();
            });

            parentContainer.appendChild(tagItemDiv);
        });
    }

    function _updateParentCategoryCheckbox(currentTagCheckbox) {
        const tagItemDiv = currentTagCheckbox.closest('.hashtag-item');
        if (!tagItemDiv) return;

        const childrenContainer = tagItemDiv.querySelector(':scope > .hashtag-children');
        if (!childrenContainer || !childrenContainer.hasChildNodes()) {
            currentTagCheckbox.indeterminate = false;
            return;
        }

        const childCheckboxes = Array.from(childrenContainer.querySelectorAll('.hashtag-item > .hashtag-header-content > .hashtag-label > input[type="checkbox"]'));

        if (childCheckboxes.length === 0) {
            currentTagCheckbox.indeterminate = false;
            if (!_allAvailableTags.includes(currentTagCheckbox.value)) {
                currentTagCheckbox.checked = false;
            }
            return;
        }

        let allChecked = true;
        let noneChecked = true;
        let someIndeterminate = false;

        for (const cb of childCheckboxes) {
            if (cb.checked) noneChecked = false;
            else allChecked = false;
            if (cb.indeterminate) someIndeterminate = true;
        }

        if (allChecked && !someIndeterminate) {
            currentTagCheckbox.checked = true;
            currentTagCheckbox.indeterminate = false;
        } else if (noneChecked && !someIndeterminate) {
            currentTagCheckbox.checked = false;
            currentTagCheckbox.indeterminate = false;
        } else {
            currentTagCheckbox.checked = false;
            currentTagCheckbox.indeterminate = true;
        }
        // Update the parent label's appearance after its state is determined
        const parentLabel = currentTagCheckbox.parentElement;
        _updateLabelAppearance(parentLabel, currentTagCheckbox, currentTagCheckbox.value);

    }

    function _updateParentCategoryCheckboxRecursive(element) {
        if (!element || !element.classList.contains('hashtag-item')) return;

        const parentTagItem = element.parentElement.closest('.hashtag-item');
        if (parentTagItem) {
            const parentCheckbox = parentTagItem.querySelector(':scope > .hashtag-header-content > .hashtag-label > input[type="checkbox"]');
            if (parentCheckbox) {
                _updateParentCategoryCheckbox(parentCheckbox);
                _updateParentCategoryCheckboxRecursive(parentTagItem);
            }
        }
    }

    function populateFilters() {
        _hashtagFiltersContainerDOM.innerHTML = '';
        const renderedHierarchicalTags = new Set();

        // Build tree from defined hierarchy
        _buildTree(_tagHierarchy, _hashtagFiltersContainerDOM, 0);
        
        // Helper to collect all tags that are part of the defined hierarchy
        // This is important to ensure we don't re-list them in "Other Tags"
        // even if _buildTree might have skipped rendering some empty branches.
        function collectAllTagsFromHierarchy(nodes, collectedSet) {
            nodes.forEach(node => {
                collectedSet.add(node.hashtag);
                if (node.children && node.children.length > 0) {
                    collectAllTagsFromHierarchy(node.children, collectedSet);
                }
            });
        }
        collectAllTagsFromHierarchy(_tagHierarchy, renderedHierarchicalTags);

        // Determine "Other Tags": those in _allAvailableTags but not in the renderedHierarchicalTags set,
        // and ensure they appear more than once using _hashtagFrequencies.
        const potentialOtherTags = _allAvailableTags.filter(tag => !renderedHierarchicalTags.has(tag));
        const displayableOtherTags = potentialOtherTags.filter(tag => (_hashtagFrequencies[tag] || 0) > 1);

        if (displayableOtherTags.length > 0) {
            const otherContainer = document.createElement('div');
            otherContainer.classList.add('hashtag-item', 'other-tags-category');
            const otherHeader = document.createElement('div');
            otherHeader.textContent = "Other Tags (Multiple Occurrences)";
            otherHeader.style.fontWeight = "bold";
            otherHeader.style.marginTop = "5px"; // Reduced top margin
            otherContainer.appendChild(otherHeader);
            displayableOtherTags.forEach(tag => {
                _createIndividualTagCheckbox(tag, otherContainer);
            });
            _hashtagFiltersContainerDOM.appendChild(otherContainer);
        }
    }

    return {
        init,
        populateFilters
    };
})();