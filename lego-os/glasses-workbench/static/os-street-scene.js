/* The same Artillery Passage scan and PlayCanvas renderer used in MyMonitor.
   Scan by David Fletcher (CC BY 4.0), streaming assets by willeastcott/splat-walk. */
const engine = 'https://cdn.jsdelivr.net/npm/playcanvas@2.23.3/build/playcanvas.mjs';
const assetURL = 'https://willeastcott.github.io/splat-walk/scene/lod-meta.json';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export async function startStreetScene(host, signal) {
  let pc;
  try { pc = await import(engine); }
  catch { throw Error('街景引擎加载失败，请检查网络'); }
  if (signal.aborted) return;
  const canvas = document.createElement('canvas');
  host.prepend(canvas);
  let device;
  try {
    device = await pc.createGraphicsDevice(canvas, {
      deviceTypes:[pc.DEVICETYPE_WEBGL2], antialias:false, alpha:false
    });
  } catch { throw Error('当前浏览器无法启动三维街景'); }
  if (signal.aborted) return device.destroy();

  const options = new pc.AppOptions();
  options.graphicsDevice = device;
  options.componentSystems = [pc.CameraComponentSystem,pc.GSplatComponentSystem];
  options.resourceHandlers = [pc.GSplatHandler,pc.TextureHandler,pc.JsonHandler];
  const app = new pc.AppBase(canvas);
  app.init(options);
  signal.addEventListener('abort', () => app.destroy(), {once:true});
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  device.maxPixelRatio = Math.min(window.devicePixelRatio, 1.5);
  const camera = new pc.Entity('eye');
  camera.addComponent('camera', {clearColor:new pc.Color(.84,.855,.875),horizontalFov:true,fov:62,nearClip:.08,farClip:250});
  camera.setPosition(-2.35, 2.31, -27.3);
  let yaw = 180, pitch = 0, drag = null;
  camera.setEulerAngles(pitch, yaw, 0);
  app.root.addChild(camera);
  app.scene.gsplat.radialSorting = true;
  app.scene.gsplat.colorUpdateAngle = .8;
  const resize = new ResizeObserver(() => {
    if (host.clientWidth && host.clientHeight) app.resizeCanvas(host.clientWidth, host.clientHeight);
  });
  resize.observe(host);
  signal.addEventListener('abort', () => resize.disconnect(), {once:true});
  canvas.onpointerdown = event => {
    drag = {x:event.clientX,y:event.clientY};
    canvas.setPointerCapture(event.pointerId);
  };
  canvas.onpointermove = event => {
    if (!drag) return;
    yaw -= (event.clientX - drag.x) * .16;
    pitch = clamp(pitch - (event.clientY - drag.y) * .16, -65,65);
    drag = {x:event.clientX,y:event.clientY};
    camera.setEulerAngles(pitch, yaw, 0);
  };
  canvas.onlostpointercapture = () => { drag = null; };
  const asset = new pc.Asset('artillery-passage','gsplat',{url:assetURL});
  app.assets.add(asset);
  await new Promise((resolve,reject) => {
    const timer = setTimeout(() => finish(Error('街景加载超时，可切换背景后重试')), 45000);
    const finish = error => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancelled);
      app.systems.gsplat?.off('frame:ready', onFrame);
      if (error) reject(error); else resolve();
    };
    const cancelled = () => { clearTimeout(timer); resolve(); };
    const onFrame = (_camera,_layer,ready,loading) => {
      if (asset.loaded && ready && loading === 0) finish();
    };
    signal.addEventListener('abort', cancelled, {once:true});
    app.systems.gsplat.on('frame:ready', onFrame);
    asset.on('error', () => finish(Error('实拍街景加载失败，请检查网络')));
    asset.ready(() => {
      const street = new pc.Entity('artillery-passage');
      street.addComponent('gsplat', {asset,unified:true});
      street.setLocalEulerAngles(0,0,180);
      app.root.addChild(street);
    });
    app.assets.load(asset);
    app.start();
  });
  if (signal.aborted) return;
  host.insertAdjacentHTML('beforeend', '<span class="scene-credit">Artillery Passage · David Fletcher · CC BY 4.0</span>');
}
