// mapManager.js
const MapManager = (() => {
    let _mapInstance;
    let _markersLayerInstance;
    let _hashtagColorsRef;
    let _defaultMarkerColorRef;

    function init(mapId, mapConfig, hashtagColors, defaultMarkerColor) {
        _hashtagColorsRef = hashtagColors;
        _defaultMarkerColorRef = defaultMarkerColor;

        _mapInstance = L.map(mapId).setView(mapConfig.MAP_INITIAL_VIEW, mapConfig.MAP_INITIAL_ZOOM);
        L.tileLayer(mapConfig.MAP_TILE_URL, {
            attribution: mapConfig.MAP_ATTRIBUTION,
            subdomains: 'abcd',
            maxZoom: mapConfig.MAP_MAX_ZOOM
        }).addTo(_mapInstance);
        _markersLayerInstance = L.layerGroup().addTo(_mapInstance);
        return { map: _mapInstance, markersLayer: _markersLayerInstance };
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

    function createCustomMarkerIcon(markerColor) {
        return L.divIcon({
            className: 'custom-marker-icon',
            html: `<div style="background-color: ${markerColor}; width: 100%; height: 100%; border-radius: 50%;"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
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
