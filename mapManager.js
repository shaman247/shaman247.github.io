const MapManager = (() => {
    const state = {
        mapInstance: null,
        markersLayerInstance: null,
        hashtagColorsRef: null,
        defaultMarkerColorRef: null,
        markerColorsRef: null,
    };

    /**
     * Initializes the MapManager module.
     * @param {L.Map} mapInstance - The Leaflet map instance.
     * @param {object} hashtagColors - A reference to the hashtag colors object.
     * @param {Array<string>} defaultMarkerColor - The default marker color.
     * @param {object} markerColors - A reference to the marker colors object.
     * @returns {{markersLayer: L.LayerGroup}} - An object containing the markers layer.
     */
    function init(mapInstance, hashtagColors, defaultMarkerColor, markerColors) {
        state.mapInstance = mapInstance;
        state.hashtagColorsRef = hashtagColors;
        state.defaultMarkerColorRef = defaultMarkerColor;
        state.markerColorsRef = markerColors || {};

        state.markersLayerInstance = L.layerGroup().addTo(state.mapInstance);
        return { markersLayer: state.markersLayerInstance };
    }

    /**
     * Clears all markers from the map.
     */
    function clearMarkers() {
        if (state.markersLayerInstance) {
            state.markersLayerInstance.clearLayers();
        }
    }

    /**
     * Gets the color for a marker based on the events at its location.
     * @param {Array} eventsAtThisLocation - The events at the marker's location.
     * @param {object} locationInfo - Information about the location.
     * @returns {Array<string>|string} - The color for the marker.
     */
    function getMarkerColor(eventsAtThisLocation, locationInfo) {
        if (eventsAtThisLocation && eventsAtThisLocation.length > 0) {
            if (locationInfo && locationInfo.emoji && state.markerColorsRef[locationInfo.emoji]) {
                return state.markerColorsRef[locationInfo.emoji];
            }
        }
        return state.defaultMarkerColorRef;
    }

    /**
     * Creates a custom marker icon with the given color, emoji, and prominence.
     * @param {Array<string>|string} markerColor - The color of the marker.
     * @param {string} emoji - The emoji to display on the marker.
     * @returns {L.DivIcon} - The custom marker icon.
     */
    function createCustomMarkerIcon(markerColor, emoji) {
        const baseWidth = 45;
        const baseHeight = 60;
        const iconSize = [baseWidth, baseHeight];
        const iconHtml = `
            <svg width=45 height=60 viewBox="0 0 28 35" xmlns="http://www.w3.org/2000/svg">
                <g transform="translate(0, 1)">
                    <path d="M14 0C7.37258 0 2 5.37258 2 12C2 21.056 14 32 14 32C14 32 26 21.056 26 12C26 5.37258 20.6274 0 14 0Z" fill="${markerColor[0]}" stroke="#333" stroke-width="1"/>
                    <text x="14" y="13" font-size="16" text-anchor="middle" dominant-baseline="central">${emoji}</text>
                </g>
            </svg>`;

        return L.divIcon({
            className: 'custom-marker-icon',
            html: iconHtml,
            iconSize: iconSize,
            iconAnchor: [iconSize[0] / 2, iconSize[1] - 3],
        });
    }

    /**
     * Adds a marker to the map.
     * @param {L.LatLng} latLng - The latitude and longitude of the marker.
     * @param {L.DivIcon} icon - The icon for the marker.
     * @param {string} tooltipText - The text for the marker's tooltip.
     * @param {function} popupContentCallback - A function that returns the content for the marker's popup.
     * @returns {L.Marker} - The created marker.
     */
    function addMarkerToMap(latLng, icon, tooltipText, popupContentCallback) {
        if (!state.markersLayerInstance) return;

        const markerOptions = { icon };

        const marker = L.marker(latLng, markerOptions);
        marker.bindTooltip(tooltipText);
        marker.bindPopup(popupContentCallback);
        state.markersLayerInstance.addLayer(marker);
        return marker;
    }

    return {
        init,
        clearMarkers,
        getMarkerColor,
        createCustomMarkerIcon,
        addMarkerToMap,
    };
})();