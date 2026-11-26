/* Each sheet contains the original video frames in reading order. */
(function () {
  const size = 200, columns = 11, frames = 120, fps = 24;
  const duration = frames / fps * 1000;
  const blendMs = 84;
  const wideShots = new Set(['front','walk','turn','back','sitting','jumping','waving','looking-up']);
  const idle = ['front', 'walk', 'front', 'turn', 'front', 'looking-up'];
  const playlists = {
    idle, wake: ['walk', ...idle], dismiss: ['back', ...idle], updated: ['tail', ...idle],
    thinking: ['jumping', 'looking-up', 'paws'], listening: ['looking-up', 'front', 'face-close'],
    composing: ['face', 'front', 'looking-up'], transcribing: ['face-close', 'looking-up'],
    responding: ['turn', 'face', 'front'], speaking: ['waving', 'face', 'paws'],
    synthesizing: ['paws', 'looking-up'], answer: ['sitting', ...idle], error: ['sitting', ...idle]
  };
  const sheets = new Map();
  const players = new Map();
  let animation = 0;

  function sheet(clip) {
    if (sheets.has(clip)) {
      const existing = sheets.get(clip);
      sheets.delete(clip);
      sheets.set(clip, existing);
      return existing;
    }
    const image = new Image();
    image.src = '/assistant/kai-atlas/' + clip + '.webp';
    const asset = {image, ready:false};
    sheets.set(clip, asset);
    image.decode().then(() => { asset.ready = true; }).catch(() => { asset.failed = true; });
    while (sheets.size > 4) sheets.delete(sheets.keys().next().value);
    return asset;
  }

  function drawTile(ctx, frame, opacity) {
    ctx.globalAlpha = opacity;
    ctx.drawImage(frame.asset.image, frame.index % columns * size,
      Math.floor(frame.index / columns) * size, size, size, 0, 0, size, size);
  }

  function step(player, now) {
    if (!player.canvas?.isConnected) return;
    if (player.pending?.asset.failed) {
      player.pending = null;
      player.started = now;
    }
    if (player.pending?.asset.ready) {
      // At matching wide-shot endpoints use a short blend. Cuts between
      // different framings keep the character from casting a double image.
      player.previous = player.displayed?.index >= frames - 6 &&
        wideShots.has(player.clip) && wideShots.has(player.pending.clip) ? player.displayed : null;
      player.clip = player.pending.clip;
      player.asset = player.pending.asset;
      player.pending = null;
      player.started = now;
      const next = player.sequence[(player.position + 1) % player.sequence.length];
      sheet(next);
    }
    if (player.asset) {
      const elapsed = Math.max(0, now - player.started);
      const index = Math.min(frames - 1, Math.floor(elapsed * fps / 1000));
      const alpha = player.previous ? Math.min(1, elapsed / blendMs) : 1;
      if (player.displayed?.index !== index || player.displayed.asset !== player.asset ||
          player.previous || !player.canvas.hasAttribute('data-ready')) {
        const ctx = player.canvas.getContext('2d');
        ctx.clearRect(0, 0, size, size);
        if (alpha < 1) drawTile(ctx, player.previous, 1 - alpha);
        player.displayed = {asset:player.asset, index};
        drawTile(ctx, player.displayed, alpha);
        ctx.globalAlpha = 1;
        player.canvas.dataset.ready = '';
        player.canvas.dataset.kaiClip = player.clip;
        if (alpha === 1) player.previous = null;
      }
      if (!player.pending && now - player.started >= duration) {
        player.position = (player.position + 1) % player.sequence.length;
        queue(player);
      }
    }
  }

  function queue(player) {
    const clip = player.sequence[player.position];
    player.pending = {clip, asset:sheet(clip)};
  }

  function tick(now) {
    animation = 0;
    for (const player of players.values()) step(player, now);
    if ([...players.values()].some(player => player.canvas?.isConnected)) {
      animation = requestAnimationFrame(tick);
    }
  }

  function update(lane, canvas, mood) {
    let player = players.get(lane);
    if (!canvas) {
      players.delete(lane);
      return;
    }
    if (!player) {
      player = {};
      players.set(lane, player);
    }
    player.canvas = canvas;
    if (mood !== player.mood) {
      player.mood = mood;
      player.sequence = playlists[mood] || idle;
      player.position = 0;
      queue(player);
    }
    step(player, performance.now());
    if (!animation) animation = requestAnimationFrame(tick);
  }

  window.LegoKaiMotion = {
    markup: `<canvas class="kai-character" width="${size}" height="${size}"></canvas>`,
    update
  };
})();
