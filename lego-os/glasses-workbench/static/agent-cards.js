/* Project runtime data into the answer. Application routes and controls stay in the app. */
(function (root) {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
    ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[char]);
  const text = escape;
  const dateLabel = date => String(date || '').slice(5).replace('-', '/');

  function card(title, content, caption = '', kind = '') {
    return `<section class="agent-card${kind ? ' agent-card-' + kind : ''}" aria-label="${text(title)}"><header>
      <strong>${text(title)}</strong>${caption ? `<small>${text(caption)}</small>` : ''}
    </header>${content}</section>`;
  }
  const empty = message => `<p class="agent-card-empty">${text(message)}</p>`;
  const failed = state => state.error || state.lastRefreshError ||
    (state.status === 'running' ? '正在读取…' : '暂无可展示的数据');
  const value = (reading, unit) => reading == null ? '' : text(reading) + unit;

  function weather(instance, options, query) {
    const {doc, s} = instance;
    const data = s.weather;
    const current = data?.current;
    const location = data?.location?.name || doc.runtimeConfig?.locationName || '天气';
    if (!current) return card(location, empty(failed(s)));
    const view = options.view || 'current';
    const requested = [
      /气温|温度|多少度|冷不冷|热不热/.test(query) && 'temperature',
      /体感/.test(query) && 'feelsLike',
      /下雨|降雨|带伞/.test(query) && 'precipitation',
      /湿度/.test(query) && 'humidity',
      /风速|风力|大风/.test(query) && 'wind',
      /紫外线|防晒/.test(query) && 'uv',
      /日出|日落/.test(query) && 'sun'
    ].filter(Boolean);
    const metrics = requested.length ? requested : options.metrics || [];
    const show = key => metrics.length ? metrics.includes(key) :
      (view === 'current' ? ['temperature','feelsLike'] : ['temperature','precipitation']).includes(key);
    const daily = data.daily || {}, hourly = data.hourly || {};
    const pairs = (...items) => items.filter(Boolean).map(item => `<span>${item}</span>`).join('');
    const label = (name, reading, unit) => reading == null ? '' : name + ' ' + value(reading, unit);
    const glyph = (code, day) => show('temperature') && code != null ? root.GlassGraphics.weather(code, day, 30) : '';
    const weatherRow = (time, label, icon, readings) => readings ?
      `<li class="agent-card-row"><time datetime="${text(time)}">${text(label)}</time><div>${icon}${readings}</div></li>` : '';
    let content;
    if (view === 'current') {
      const slot = hourly.time?.findIndex(t => t >= current.time) ?? -1;
      const today = daily.time?.indexOf(current.time?.slice(0,10)) ?? 0;
      const readings = pairs(
        show('temperature') && value(current.temperature_2m, '°C'),
        show('feelsLike') && label('体感', current.apparent_temperature, '°C'),
        show('precipitation') && label('降雨概率', hourly.precipitation_probability?.[slot], '%'),
        show('wind') && label('风速', current.wind_speed_10m, ' km/h'),
        show('humidity') && label('湿度', current.relative_humidity_2m, '%'),
        show('uv') && label('紫外线', daily.uv_index_max?.[today], ''),
        show('sun') && label('日出', daily.sunrise?.[today]?.slice(11,16), ''),
        show('sun') && label('日落', daily.sunset?.[today]?.slice(11,16), '')
      );
      content = readings ? `<div class="agent-card-weather-now">${glyph(current.weather_code, !!current.is_day)}${readings}</div>` : '';
    } else if (view === 'daily') {
      const offset = options.offset || 0;
      content = (daily.time || []).slice(offset, offset + (options.days || 7)).map((time, index) => {
        const i = offset + index;
        const low = daily.temperature_2m_min?.[i], high = daily.temperature_2m_max?.[i];
        return weatherRow(time, dateLabel(time), glyph(daily.weather_code?.[i], true), pairs(
          show('temperature') && low != null && high != null && `${value(low,'°')} – ${value(high,'°C')}`,
          show('precipitation') && label('降雨', daily.precipitation_probability_max?.[i], '%'),
          show('wind') && label('最大风速', daily.wind_speed_10m_max?.[i], ' km/h'),
          show('uv') && label('紫外线', daily.uv_index_max?.[i], ''),
          show('sun') && label('日出', daily.sunrise?.[i]?.slice(11,16), ''),
          show('sun') && label('日落', daily.sunset?.[i]?.slice(11,16), '')
        ));
      }).join('');
    } else {
      const hours = options.hours || Math.min(24, Number(query.match(/(\d+)\s*小时/)?.[1]) || 6);
      content = (hourly.time || []).map((time,i) => ({time,i})).filter(row => row.time >= current.time)
        .slice(0,hours).map(({time,i}) => weatherRow(time, time.slice(11,16), glyph(hourly.weather_code?.[i], hourly.is_day?.[i] !== 0), pairs(
          show('temperature') && value(hourly.temperature_2m?.[i], '°C'),
          show('feelsLike') && label('体感', hourly.apparent_temperature?.[i], '°C'),
          show('precipitation') && label('降雨', hourly.precipitation_probability?.[i], '%'),
          show('wind') && label('风速', hourly.wind_speed_10m?.[i], ' km/h'),
          show('humidity') && label('湿度', hourly.relative_humidity_2m?.[i], '%')
        ))).join('');
    }
    const title = location + (view === 'hourly' ? '逐时预报' : view === 'daily' && options.days !== 1 ? '多日预报' : '天气');
    const body = content ? (view === 'current' ? content : `<ul>${content}</ul>`) : empty('暂无所问范围内的数据');
    return card(title, body, s.lastRefreshError ? '上次读取' : '');
  }

  function calendarRange(options, query, today) {
    const engine = root.TimetableEngine;
    const add = engine.add;
    const range = (view,start,days,label) => ({view,start,days,end:add(start,days-1),label});
    const date = query.match(/20\d\d-\d\d-\d\d/)?.[0];
    const nextEvent = /下一节|下节课|下一场|最近一项/.test(query);
    if (/作业|考试|待办/.test(query) && !/课表|日程/.test(query)) return range('tasks',today,1,'待办与考试');
    if (nextEvent) return range('upcoming',today,7,'接下来的安排');
    const rollingWeek = /(?:未来|接下来|往后|今后|之后)(?:的)?\s*(?:(?:一|1)?(?:个)?\s*(?:周|星期)|[七7]\s*天)/.test(query);
    const rollingDays = query.match(/(?:未来|接下来|往后|今后)(?:的)?\s*([一二两三四五六七1-7])\s*天/);
    if (rollingWeek || rollingDays) {
      const number = rollingDays?.[1];
      const days = rollingWeek ? 7 : Number(number) || '一二三四五六七'.indexOf(number.replace('两','二'))+1;
      const shift = /从今天|今起|含今天/.test(query) ? 0 : /从后天/.test(query) ? 2 : 1;
      return range('week', add(today,shift), days, `未来 ${days} 天课表`);
    }
    if (date && Number.isFinite(Date.parse(date))) return range('today',date,1,'课表与日程');
    const weekStart = engine.monday(today);
    const weekday = query.match(/(?:(本|这|下)(?:个)?)?(?:星期|周)([一二三四五六日天])/);
    if (weekday) {
      const offset = '一二三四五六日'.indexOf(weekday[2].replace('天','日'));
      return range('today',add(weekStart,offset+(weekday[1]==='下'?7:0)),1,'课表与日程');
    }
    if (/下周|下星期|下个星期/.test(query)) return range('week',add(weekStart,7),7,'下周课表');
    if (/本周|这周|这个星期|周课表/.test(query)) return range('week',weekStart,7,'本周课表');
    if (/今天|今日|明天|明日|后天|昨天/.test(query)) {
      const shift = /后天/.test(query) ? 2 : /明天|明日/.test(query) ? 1 : /昨天/.test(query) ? -1 : 0;
      return range('today',add(today,shift),1,shift===0?'今日课表':'课表与日程');
    }
    const view = options.view || 'today';
    const days = options.days || (view === 'week' || view === 'upcoming' ? 7 : 1);
    return range(view,options.date || (view==='week'?weekStart:today),days,
      view==='week'?'周课表':view==='upcoming'?'接下来的安排':'课表与日程');
  }

  function calendar(instance, options, query, today) {
    const {doc, s} = instance;
    const engine = root.TimetableEngine;
    const {view,start,days,end,label} = options.range || calendarRange(options,query,today);
    if (view === 'tasks') {
      const tasks = (doc.timetable?.tasks || []).filter(item => !item.done)
        .sort((a,b) => String(a.due || '').localeCompare(String(b.due || '')));
      const rows = tasks.map(item => `<li class="agent-card-row"><time>${text(item.due?.replace('T',' '))}</time><strong>${text(item.title)}</strong></li>`).join('');
      return card('待办与考试', rows ? `<ul>${rows}</ul>` : empty('暂无未完成事项'));
    }
    const caption = days > 1 ? `${dateLabel(start)} – ${dateLabel(end)}` : dateLabel(start);
    if (options.calendarError) return card(label, empty(options.calendarError), caption, 'schedule');
    if (!options.calendar && s.status !== 'ready' && (s.calendarMode === 'live' || !doc.timetable)) {
      return card('课表与日程', empty(failed(s)));
    }
    const available = Array.from({length:days}, (_, index) => engine.add(start,index));
    let groups = available.map(date => {
      const rows = (options.calendar ? options.calendar.filter(row => row.date === date) : root.ServiceSurfaces.rows(doc,s,date))
        .filter(row => view !== 'upcoming' || row.status !== 'cancelled' && (date !== today || (row.end || row.start) >= (options.clock || s.clock)))
        .sort((a,b) => String(a.start).localeCompare(String(b.start)));
      return {date,rows};
    }).filter(group => group.rows.length);
    if (view === 'upcoming') groups = groups.slice(0,1).map(group => ({...group,rows:group.rows.slice(0,1)}));
    const content = groups.map(group => {
      const weekday = '日一二三四五六'[new Date(group.date+'T00:00:00Z').getUTCDay()];
      return `<div class="agent-card-day">${days > 1 ? `<b>${text(dateLabel(group.date))} 周${weekday}</b>` : ''}<ul>${group.rows.map(row =>
        `<li class="agent-card-row"><time>${text([row.start,row.end].filter(Boolean).join(' – ') || '全天')}</time>
          <div><strong>${text(row.title)}</strong>${row.location ? `<span>${text(row.location)}</span>` : ''}
          ${row.status === 'cancelled' ? '<span>已取消</span>' : row.status === 'changed' ? '<span>已调整</span>' : ''}</div></li>`
      ).join('')}</ul></div>`;
    }).join('');
    return card(label, content || empty('这段时间暂无安排'), caption, 'schedule');
  }

  function sourceLink(url, title) {
    try {
      const parsed = new URL(url);
      if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return text(title);
      return `<a href="${text(parsed.href)}" target="_blank" rel="noopener noreferrer">${text(title)}</a>`;
    } catch { return text(title); }
  }

  function service(instance, options = {}, query = '', today) {
    const {doc, s} = instance;
    if (doc.template === 'weather') return weather(instance, options, query);
    if (doc.template === 'calendar') return calendar(instance, options, query, today || s.date);
    const feed = s.reddit || Object.values(s.results || {}).filter(result => result.ok)
      .map(result => result.value?.data || result.value)
      .find(data => ['reddit','content-feed'].includes(data?.type));
    if (!feed) return '';
    const rows = (feed.items || []).map(item =>
      `<li>${sourceLink(item.url, item.title)}${/摘要|概述/.test(query) && item.excerpt ? `<p>${text(item.excerpt)}</p>` : ''}</li>`).join('');
    return card(doc.name, rows ? `<ul>${rows}</ul>` : empty('没有匹配结果'), feed.stale ? '上次读取' : '');
  }
  root.LegoReplyCards = {service,calendarRange};
})(globalThis);
