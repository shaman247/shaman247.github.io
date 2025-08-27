// mapManager.js
const MapManager = (() => {
    let _mapInstance;
    let _markersLayerInstance;
    let _hashtagColorsRef;
    let _defaultMarkerColorRef;
    let _markerColorsRef;

    // Helper function for color interpolation between two hex colors
    function _interpolateColor(color1, color2, factor) {
        // ensure factor is between 0 and 1
        factor = Math.max(0, Math.min(1, factor));

        // remove '#' from colors
        const c1 = color1.substring(1);
        const c2 = color2.substring(1);

        const r1 = parseInt(c1.substring(0, 2), 16);
        const g1 = parseInt(c1.substring(2, 4), 16);
        const b1 = parseInt(c1.substring(4, 6), 16);

        const r2 = parseInt(c2.substring(0, 2), 16);
        const g2 = parseInt(c2.substring(2, 4), 16);
        const b2 = parseInt(c2.substring(4, 6), 16);

        const r = Math.round(r1 + factor * (r2 - r1));
        const g = Math.round(g1 + factor * (g2 - g1));
        const b = Math.round(b1 + factor * (b2 - b1));

        const toHex = (c) => ('00' + c.toString(16)).slice(-2);

        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    function init(mapInstance, hashtagColors, defaultMarkerColor, markerColors) {
        _mapInstance = mapInstance;
        _hashtagColorsRef = hashtagColors;
        _defaultMarkerColorRef = defaultMarkerColor;
        _markerColorsRef = markerColors || {};

        _markersLayerInstance = L.layerGroup().addTo(_mapInstance);
        // The MapManager now only manages the markers layer, not the map instance itself.
        return { markersLayer: _markersLayerInstance };
    }

    function clearMarkers() {
        if (_markersLayerInstance) {
            _markersLayerInstance.clearLayers();
        }
    }

    function getMarkerColor(eventsAtThisLocation, locationInfo) {
        if (eventsAtThisLocation && eventsAtThisLocation.length > 0) {
            // 1. Prioritize color from location's emoji in tags.json
            if (locationInfo && locationInfo.emoji && _markerColorsRef[locationInfo.emoji]) {
                return _markerColorsRef[locationInfo.emoji];
            }
        }
        return _defaultMarkerColorRef;
    }

    function createCustomMarkerIcon(markerColor, emoji, numSelectedTags, numMatchingTags) {
        // Define styling based on prominence
        let stroke;
        let strokeWidth;
        
        let fillValue;
        let defs = '';
        let emojiOpacity = 1.0; // Default opacity

        let prominence = (numMatchingTags + 2) / (numSelectedTags + 2);

        // When no tags are selected, all markers should be a standard size.
        // When tags are selected, markers that match more tags should be larger.
        // Markers with low prominence are scaled down, up to a maximum of their base size (100%).
        const scale = numSelectedTags > 0 ? 0.5 + (prominence * 0.5) : 1.0; // Scale from 50% to 100%, or 100% if no tags.
        const baseWidth = 45;
        const baseHeight = 60;
        const iconWidth = Math.round(baseWidth * scale);
        const iconHeight = Math.round(baseHeight * scale);
        const iconSize = [iconWidth, iconHeight];

        let baseFillColor;

        if (Array.isArray(markerColor) && markerColor.length === 2) {
            baseFillColor = markerColor[0];
            stroke = markerColor[1];
        } else {
            baseFillColor = markerColor;
            stroke = '#333';
        }

        // Set stroke width based on the number of matching tags
        strokeWidth = numMatchingTags >= 2 ? 2 : 1;
        if (numMatchingTags < 2) {
            stroke = '#333';
        }



        fillValue = baseFillColor;
        // If filters are active, adjust color and opacity based on prominence
        if (numSelectedTags > 0) {
            const subduedGray = '#757575'; // A medium gray, same as default marker color
            // Interpolate color. The less prominent, the more gray it becomes.
            // factor = 0 for full color (prominence=1), factor = 1 for full gray (prominence=0)
            const factor = 1 - prominence;
            fillValue = _interpolateColor(baseFillColor, subduedGray, factor);
            
            // Also reduce emoji opacity. Using the same scale as size for consistency.
            emojiOpacity = Math.min(0.8, scale);
        }

        // Using an SVG for a pin shape allows for more complex shapes and better scaling.
        const iconHtml = `
            <svg width="${iconWidth}" height="${iconHeight}" viewBox="0 0 28 35" xmlns="http://www.w3.org/2000/svg">
                ${defs}
                <g transform="translate(0, 1)">
                    <path d="M14 0C7.37258 0 2 5.37258 2 12C2 21.056 14 32 14 32C14 32 26 21.056 26 12C26 5.37258 20.6274 0 14 0Z" fill="${fillValue}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
                    <text x="14" y="13" font-size="16" text-anchor="middle" dominant-baseline="central" style="opacity: ${emojiOpacity};">${emoji}</text>
                </g>
            </svg>`;

        return L.divIcon({
            className: 'custom-marker-icon', // A class for the container, can be empty
            html: iconHtml,
            iconSize: iconSize,
            iconAnchor: [iconSize[0] / 2, iconSize[1] - 3] // Anchor at the pin's tip, adjusted for the new size
        });
    }
    
    function addMarkerToMap(latLng, icon, tooltipText, popupContentCallback, prominence = 0) {
        if (!_markersLayerInstance) return;

        const markerOptions = {
            icon: icon,
        };

        if (prominence > 1) {
            // Give more prominent markers a higher z-index to appear on top.
            markerOptions.zIndexOffset = 1000 + prominence;
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
