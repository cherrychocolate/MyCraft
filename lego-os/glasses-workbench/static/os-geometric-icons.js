/* Filled shapes for the simulator chrome. Authored graphics keep their own renderer. */
(function () {
  const shapes = new Set([
    'grid','cube','sun','moon','cloud','rain','snow','wind','drop','calendar','clock','arrow',
    'play','check','pin','news','bolt','voice','settings','bell','link','image','home','book'
  ]);
  GlassGraphics.icon = function (name, size = 24) {
    const shape = shapes.has(name) ? name : 'cube';
    const width = Math.max(12, Math.min(256, Number(size) || 24));
    return `<span class="g-icon g-${shape} os-geo-icon" style="--geo-size:${width}px" aria-hidden="true"><i></i><i></i><i></i></span>`;
  };
  GlassGraphics.weather = function (code, day = true, size = 80) {
    const value = Number(code);
    const shape = value < 2 ? day ? 'sun' : 'moon' : value < 50 ? 'cloud' : value < 70 ? 'rain' : value < 80 ? 'snow' : 'rain';
    return GlassGraphics.icon(shape, size);
  };
})();
