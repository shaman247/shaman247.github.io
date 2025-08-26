// mapManager.js
const MapManager = (() => {
    let _mapInstance;
    let _markersLayerInstance;
    let _hashtagColorsRef;
    let _defaultMarkerColorRef;

    function init(mapInstance, hashtagColors, defaultMarkerColor) {
        _mapInstance = mapInstance;
        _hashtagColorsRef = hashtagColors;
        _defaultMarkerColorRef = defaultMarkerColor;

        _markersLayerInstance = L.layerGroup().addTo(_mapInstance);
        // The MapManager now only manages the markers layer, not the map instance itself.
        return { markersLayer: _markersLayerInstance };
    }

    function clearMarkers() {
        if (_markersLayerInstance) {
            _markersLayerInstance.clearLayers();
        }
    }

    function getMarkerColor(eventsAtThisLocation) {
        if (eventsAtThisLocation && eventsAtThisLocation.length > 0) {
            const firstEvent = eventsAtThisLocation[0];
            if (firstEvent.hashtags && firstEvent.hashtags.length > 0) {
                const firstTag = firstEvent.hashtags[0];
                return _hashtagColorsRef[firstTag] || _defaultMarkerColorRef;
            }
        }
        return _defaultMarkerColorRef;
    }

    function createCustomMarkerIcon(markerColor, emoji, isProminent = false) {
        // Dark theme is now the only theme. The stroke color is for non-prominent markers.
        const originalStrokeColor = 'black';

        // Define styling based on prominence
        let dropShadowFilter;
        let stroke;
        let strokeWidth;

        if (isProminent) {
            dropShadowFilter = 'none'; // No shadow for prominent markers
            stroke = 'white';          // Large white border
            strokeWidth = 2.5;         // A "large" border
        } else {
            dropShadowFilter = 'drop-shadow(0 2px 3px rgba(0,0,0,0.5))'; // Default shadow
            stroke = originalStrokeColor; // Original stroke color
            strokeWidth = 0;              // Original stroke width (no border)
        }
        
        let fillValue;
        let defs = '';

        if (Array.isArray(markerColor) && markerColor.length === 2) {
            const gradId = `grad-${markerColor[0].substring(1)}-${markerColor[1].substring(1)}`;
            defs = `
            <defs>
                <linearGradient id="${gradId}" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:${markerColor[0]}" />
                    <stop offset="100%" style="stop-color:${markerColor[1]}" />
                </linearGradient>
            </defs>
            `;
            fillValue = `url(#${gradId})`;
        } else {
            fillValue = markerColor;
        }

        // Using an SVG for a pin shape allows for more complex shapes and better scaling.
        const iconHtml = `
            <svg width="34" height="45" viewBox="0 0 28 35" xmlns="http://www.w3.org/2000/svg" style="filter: ${dropShadowFilter};">
                ${defs}
                <g transform="translate(0, 1)">
                    <path d="M14 0C7.37258 0 2 5.37258 2 12C2 21.056 14 32 14 32C14 32 26 21.056 26 12C26 5.37258 20.6274 0 14 0Z" fill="${fillValue}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
                    <text x="14" y="13" font-size="20" text-anchor="middle" dominant-baseline="central">${emoji}</text>
                </g>
            </svg>`;

        return L.divIcon({
            className: 'custom-marker-icon', // A class for the container, can be empty
            html: iconHtml,
            iconSize: [42, 53], // The size of the SVG, increased by 50%
            iconAnchor: [21, 50] // Anchor at the pin's tip, adjusted for the new size
        });
    }
    
    function addMarkerToMap(latLng, icon, tooltipText, popupContentCallback, isProminent = false) {
        if (!_markersLayerInstance) return;

        const markerOptions = {
            icon: icon,
        };

        if (isProminent) {
            markerOptions.zIndexOffset = 1000; // A high value to ensure it's on top of other markers
        }

        const marker = L.marker(latLng, markerOptions);
        marker.bindTooltip(tooltipText);
        marker.bindPopup(popupContentCallback);
        _markersLayerInstance.addLayer(marker);
        return marker;
    }

    return {
        init,
        clearMarkers,
        getMarkerColor,
        createCustomMarkerIcon,
        addMarkerToMap
    };
})();
