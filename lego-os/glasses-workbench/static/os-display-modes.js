/* The simulator owns its display profile and scene independently of published apps. */
(function () {
  const preference = 'lego-simulator-orientation';
  let orientation = localStorage.getItem(preference) === 'landscape' ? 'landscape' : 'portrait';
  let background = 'black';
  let samplesEnabled = false;
  let scene, controller;
  let message = '';

  function size() {
    return orientation === 'landscape' ? {width:800,height:600} : {width:600,height:800};
  }

  function stopScene() {
    controller?.abort();
    scene?.remove();
    scene = null;
    document.body.removeAttribute('data-os-scene');
  }

  function attach() {
    const stage = $('.os-stage');
    if (scene && stage && scene.parentElement !== stage) stage.prepend(scene);
  }

  async function changeBackground(value) {
    stopScene();
    background = value;
    message = '';
    if (value === 'black') return renderOS();
    const current = new AbortController();
    controller = current;
    const signal = current.signal;
    scene = document.createElement('div');
    scene.className = 'display-environment';
    scene.setAttribute('aria-hidden', 'true');
    message = value === 'camera' ? '正在打开摄像头…' : '正在加载实拍街景…';
    renderOS();
    try {
      if (value === 'camera') {
        if (!navigator.mediaDevices?.getUserMedia) throw Error('此浏览器不支持摄像头');
        const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
        const stop = () => stream.getTracks().forEach(track => track.stop());
        if (signal.aborted) return stop();
        signal.addEventListener('abort', stop, {once:true});
        const video = document.createElement('video');
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        scene.append(video);
        video.srcObject = stream;
        await video.play();
      } else {
        const { startStreetScene } = await import('./os-street-scene.js?v=1');
        if (signal.aborted) return;
        await startStreetScene(scene, signal);
      }
      if (signal.aborted) return;
      document.body.dataset.osScene = value;
      message = '';
      updateStatus();
    } catch (error) {
      if (signal.aborted) return;
      stopScene();
      background = 'black';
      message = error.name === 'NotAllowedError' ? '未获得摄像头权限' : error.message || '环境加载失败';
      renderOS();
    }
  }

  function updateStatus() {
    const status = $('#display-environment-status');
    if (status) {
      status.textContent = message;
      status.hidden = !message;
    }
  }

  const render = renderOS;
  renderOS = function () {
    document.body.dataset.osOrientation = orientation;
    if (scene?.isConnected) scene.remove();
    render();
    attach();
    const header = $('.os-top');
    if (!header) return;
    $('#glass-preview-env')?.remove();
    header.insertAdjacentHTML('beforeend', `<section class="display-options" aria-label="模拟器显示">
      <select id="display-orientation" aria-label="显示方向"><option value="portrait">600 × 800 竖屏</option><option value="landscape">800 × 600 横屏</option></select>
      <select id="display-background" aria-label="环境背景"><option value="black">黑色</option><option value="street">实拍三维街景</option><option value="camera">实时摄像头</option></select>
      </section>`);
    $('.os-stage')?.insertAdjacentHTML('afterbegin', `
      <p id="display-environment-status" role="status" hidden></p>
      <button id="display-app-samples" type="button" aria-pressed="${samplesEnabled}">20 应用预览</button>`);
    $('#display-app-samples').onclick = () => {
      samplesEnabled = !samplesEnabled;
      if (osPage === 'center') renderOS();
      else osNavigate('center');
      $('#display-app-samples')?.focus({preventScroll:true});
    };
    const direction = $('#display-orientation');
    direction.value = orientation;
    direction.onchange = () => {
      orientation = direction.value;
      localStorage.setItem(preference, orientation);
      renderOS();
      $('#display-orientation')?.focus();
    };
    const select = $('#display-background');
    select.value = background;
    select.onchange = () => { void changeBackground(select.value); };
    updateStatus();
  };

  window.addEventListener('pagehide', stopScene);
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    background = 'black';
    message = '';
    renderOS();
  });
  window.LegoDisplay = {size,samples:()=>samplesEnabled};
})();
