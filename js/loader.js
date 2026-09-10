(function() {
    // --- C'EST ICI QUE TU CHANGES LA VERSION ---
    const VERSION = '16'; 
    // -------------------------------------------

    // 1. Injecter le CSS (Style)
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `./css/style.css?v=${VERSION}`;
    document.head.appendChild(link);

    // 2. Injecter le Noyau (Main JS)
    const script = document.createElement('script');
    script.src = `./js/main.js?v=${VERSION}`;
    script.defer = true; // Important pour ne pas bloquer l'affichage
    document.body.appendChild(script);

})();