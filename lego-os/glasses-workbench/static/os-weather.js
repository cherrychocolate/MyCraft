/* Weather uses a summary and one explicit reading layer per forecast. */
(function () {
  const renderApp = osApp;
  const G = GlassGraphics;
  const conditions = {0:'晴',1:'大部晴朗',2:'多云',3:'阴',45:'雾',48:'雾凇',51:'毛毛雨',53:'毛毛雨',55:'强毛毛雨',56:'冻毛毛雨',57:'强冻毛毛雨',61:'小雨',63:'中雨',65:'大雨',66:'冻雨',67:'强冻雨',71:'小雪',73:'中雪',75:'大雪',77:'雪粒',80:'阵雨',81:'阵雨',82:'强阵雨',85:'阵雪',86:'强阵雪',95:'雷暴',96:'雷暴伴冰雹',99:'强雷暴伴冰雹'};
  const degrees = v => v == null ? '—' : esc(v) + '°';
  const percent = v => v == null ? '—' : esc(v) + '%';
  const condition = v => conditions[v] || '—';

  function rows(weather, hourly) {
    const values = weather[hourly ? 'hourly' : 'daily'];
    return (values?.time || [])
      .map((time, index) => ({time, index}))
      .filter(({time}) => !hourly || time >= weather.current.time)
      .slice(0, hourly ? 24 : 7)
      .map(({time, index: i}) => {
        const code = values.weather_code?.[i];
        const label = hourly ? time.slice(11, 16) : i === 0 ? '今天' : time.slice(5).replace('-', '/');
        const reading = hourly ? degrees(values.temperature_2m?.[i]) : `${degrees(values.temperature_2m_min?.[i])} / ${degrees(values.temperature_2m_max?.[i])}`;
        const rain = percent((hourly ? values.precipitation_probability : values.precipitation_probability_max)?.[i]);
        return `<li><time datetime="${esc(time)}">${esc(label)}</time>${G.weather(code, !hourly || values.is_day?.[i] !== 0, 30)}<span>${condition(code)}</span><b>${reading}</b>${hourly ? `<small>降雨 ${rain}</small>` : ''}</li>`;
      }).join('');
  }

  function forecast(weather, hourly) {
    const title = hourly ? '24 小时预报' : '七天预报';
    const content = rows(weather, hourly);
    return `<section class="weather-app weather-forecast" tabindex="0" data-focus-scroll="weather-${hourly?'hourly':'daily'}" data-focus-default aria-label="${title}">
      <h1>${title}</h1>
      ${content ? `<ul class="weather-forecast-list">${content}</ul>` : '<p>暂无预报</p>'}
    </section>`;
  }

  osApp = function () {
    const i = osInstance(osActive);
    if (i?.doc.template !== 'weather' || i.release.mode === 'prototype' || i.s.status !== 'ready') return renderApp();
    const {weather: w, route, lastRefreshError, updatedAt, refreshing} = i.s;
    const c = w?.current;
    if (!c) return renderApp();
    if (route === 'weather-hourly' || route === 'weather-daily') return forecast(w, route === 'weather-hourly');
    const daily = w.daily || {};
    const city = esc(w.location?.name || i.doc.runtimeConfig?.locationName || '天气');
    return `<section class="weather-app weather-summary">
      <header><h1>${city}</h1><button data-action="refresh" aria-label="刷新天气" ${refreshing?'disabled':''}>↻</button></header>
      <div class="weather-current">
        ${G.weather(c.weather_code, !!c.is_day, 92)}
        <div><strong>${degrees(c.temperature_2m)}</strong><span>${condition(c.weather_code)} · ${degrees(daily.temperature_2m_min?.[0])} / ${degrees(daily.temperature_2m_max?.[0])}</span></div>
      </div>
      <div class="weather-forecast-actions">
        <button data-action="route" data-arg="weather-hourly" data-focus-default>24 小时预报 <span aria-hidden="true">›</span></button>
        <button data-action="route" data-arg="weather-daily">七天预报 <span aria-hidden="true">›</span></button>
      </div>
      <dl class="weather-facts">
        <div><dt>体感</dt><dd>${degrees(c.apparent_temperature)}</dd></div>
        <div><dt>湿度</dt><dd>${percent(c.relative_humidity_2m)}</dd></div>
        <div><dt>风速</dt><dd>${c.wind_speed_10m == null?'—':esc(c.wind_speed_10m)+' km/h'}</dd></div>
        <div><dt>紫外线</dt><dd>${esc(daily.uv_index_max?.[0] ?? '—')}</dd></div>
        <div><dt>日出</dt><dd>${esc(daily.sunrise?.[0]?.slice(11,16) || '—')}</dd></div>
        <div><dt>日落</dt><dd>${esc(daily.sunset?.[0]?.slice(11,16) || '—')}</dd></div>
      </dl>
      ${i.s.weatherSource ? `<small>${esc(i.s.weatherSource)}</small>` : ''}
      ${lastRefreshError ? `<small role="status">刷新失败${updatedAt ? ' · 上次更新 ' + esc(new Date(updatedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})) : ''}</small>` : ''}
    </section>`;
  };
})();
