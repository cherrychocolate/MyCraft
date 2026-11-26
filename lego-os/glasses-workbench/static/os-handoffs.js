/* Provider pages complete the action after a user chooses to open them. */
(function () {
  const entries = [
    {id:'chat', name:'聊天', glyph:'news'},
    {id:'travel', name:'出行', glyph:'pin'},
    {id:'shop', name:'购物', glyph:'cube'}
  ];
  if (window.LegoSite) entries.push({id:'reddit',name:'Reddit'});
  const telegramRoutes = new Set([
    'addemoji','addlist','addstickers','addstyle','addtheme','auction','auth','boost','call',
    'confirmphone','contact','giftcode','invoice','joinchat','login','nft','proxy','setlanguage',
    'share','socks','web'
  ]);
  const entry = id => entries.find(app => app.id === id);
  const modes = {flight:'机票',rail:'火车票',car:'租车',ride:'叫车'};
  const trip = {mode:'flight',origin:'',destination:'',date:'',review:false};
  function updateTrip(fields = {}) {
    if (Object.hasOwn(modes, fields.mode)) trip.mode = fields.mode;
    for (const field of ['origin','destination','date']) {
      if (typeof fields[field] === 'string') trip[field] = fields[field];
    }
    trip.review = Boolean(fields.review && trip.origin && trip.destination && trip.date);
  }
  function travelLink(name, provider, url, glyph) {
    return `<a class="handoff-option" href="${url}" target="_blank" rel="noopener noreferrer">
      ${GlassGraphics.icon(glyph,35)}<span><strong>${name}</strong><small>${provider}</small></span><span aria-hidden="true">↗</span>
    </a>`;
  }
  function travelCards() {
    return [
      travelLink('机票','Trip.com','https://www.trip.com/flights/','arrow'),
      travelLink('火车票','Trip.com','https://www.trip.com/trains/','calendar'),
      travelLink('租车','Trip.com','https://www.trip.com/carhire/','pin'),
      travelLink('叫车','Uber · 支持地区','https://m.uber.com/','pin')
    ].join('');
  }
  function tripCard() {
    if (trip.review) return `<section class="handoff-card trip-review">
      <strong>${esc(trip.origin)} → ${esc(trip.destination)}</strong><span>${esc(trip.date)} · ${modes[trip.mode]}</span>
      <small role="status">行程已核对，预订权限待配置。</small>
      <button data-trip-edit>修改行程</button>
    </section>`;
    return `<form class="handoff-card trip-edit" data-handoff-form="trip">
      <label>票种<select name="mode">${Object.entries(modes).map(([k,v])=>`<option value="${k}" ${k===trip.mode?'selected':''}>${v}</option>`).join('')}</select></label>
      <label>日期<input type="date" name="date" value="${esc(trip.date)}" required></label>
      <label>出发地<input name="origin" value="${esc(trip.origin)}" maxlength="50" required></label>
      <label>目的地<input name="destination" value="${esc(trip.destination)}" maxlength="50" required></label>
      <button type="submit">核对行程</button>
    </form>`;
  }
  const body = {
      reddit: () => `<div class="handoff-options">
        ${travelLink('热门帖子','Reddit 官网','https://www.reddit.com/r/popular/','news')}
        ${travelLink('科技社区','r/technology','https://www.reddit.com/r/technology/','link')}
        ${travelLink('虚拟现实社区','r/virtualreality','https://www.reddit.com/r/virtualreality/','link')}
      </div>`,
      chat: () => `<form class="handoff-card" data-handoff-form="telegram">
        <label>Telegram 用户名<input name="recipient" placeholder="@用户名" maxlength="33" required autocomplete="off"></label>
        <label>消息草稿<textarea name="draft" rows="3" maxlength="1500"></textarea></label>
        <button type="submit">预览</button><div class="handoff-preview" role="status"></div>
      </form>`,
      travel: travelCards,
      shop: () => `<form class="handoff-card" id="jd-product-search" action="https://search.jd.com/Search" method="get" target="_blank" rel="noopener noreferrer">
        <label>商品关键词<input name="keyword" placeholder="搜索商品" required maxlength="80" autocomplete="off"></label>
        <button type="submit">在京东搜索 ↗</button>
      </form>`
  };
  function render(app, embedded = false) {
    return `<section class="handoff-page${embedded?' handoff-inline':''}"><h1>${app.name}</h1>${embedded&&app.id==='travel'?tripCard():body[app.id]()}</section>`;
  }
  const content = osContent;
  osContent = function () {
    const app = entry(osPage);
    return app ? render(app) : content();
  };
  document.addEventListener('submit', event => {
    const form = event.target;
    if (form.dataset.handoffForm === 'trip') {
      event.preventDefault();
      updateTrip({...Object.fromEntries(new FormData(form)),review:true});
      renderOS();
      return;
    }
    if (form.dataset.handoffForm !== 'telegram') return;
    event.preventDefault();
    const recipient = form.elements.recipient.value.trim().replace(/^@/, '');
    const preview = form.querySelector('.handoff-preview');
    if (!/^[a-z][a-z0-9_]{3,31}$/i.test(recipient) || telegramRoutes.has(recipient.toLowerCase())) {
      preview.textContent = '请输入有效的 Telegram 个人用户名。';
      return;
    }
    const draft = form.elements.draft.value.trim();
    const url = new URL(`https://t.me/${recipient}`);
    if (draft) url.searchParams.set('text', draft.startsWith('@') ? ` ${draft}` : draft);
    preview.innerHTML = `<p><strong>@${esc(recipient)}</strong>${draft ? `<span>${esc(draft)}</span>` : ''}</p>
      <a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">在 Telegram 打开 ↗</a>`;
    window.LegoGamepad?.refreshFocus(false);
  });
  document.addEventListener('input', event => {
    const form = event.target.closest('[data-handoff-form]');
    if (form?.dataset.handoffForm === 'telegram') form.querySelector('.handoff-preview')?.replaceChildren();
    if (form?.dataset.handoffForm === 'trip') updateTrip(Object.fromEntries(new FormData(form)));
  });
  const click = osClick;
  osClick = function (event) {
    if (event.target.closest('[data-trip-edit]')) {
      trip.review = false;
      renderOS();
      return;
    }
    return click(event);
  };
  window.LegoHandoffs = {entries, entry, render, updateTrip, trip:()=>({...trip})};
})();
