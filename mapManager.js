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

    function createCustomMarkerIcon(markerColor, emoji) {
        // Get the current theme from the body's data attribute to set the stroke color.
        const currentTheme = document.body.dataset.theme || 'dark';
        const strokeColor = currentTheme === 'light' ? 'white' : 'black';

        // Using an SVG for a pin shape allows for more complex shapes and better scaling.
        const iconHtml = `
            <svg width="34" height="45" viewBox="0 0 28 35" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5));">
                <g transform="translate(0, 1)">
                    <path d="M14 0C7.37258 0 2 5.37258 2 12C2 21.056 14 32 14 32C14 32 26 21.056 26 12C26 5.37258 20.6274 0 14 0Z" fill="${markerColor}" stroke="${strokeColor}" stroke-width="0"/>
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
    
    function addMarkerToMap(latLng, icon, tooltipText, popupContentCallback) {
        if (!_markersLayerInstance) return;
        const marker = L.marker(latLng, { icon: icon });
        marker.bindTooltip(tooltipText);
        marker.bindPopup(popupContentCallback);
        _markersLayerInstance.addLayer(marker);
    }

    return {
        init,
        clearMarkers,
        getMarkerColor,
        createCustomMarkerIcon,
        addMarkerToMap
    };
})();
