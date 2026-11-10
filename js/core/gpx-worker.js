/* Parse GPX locally without occupying the page thread. */
importScripts('/js/core/gpx.js?v=300.2');

self.onmessage = ({ data }) => {
    self.postMessage(self.TitanGpx.analyse(data));
};
