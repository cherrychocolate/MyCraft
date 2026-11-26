/* Model profiles, role routing and observable calls. Keys never return to the browser. */
(function () {
    const baseURL = modelAPIBase;
    let data = null, loading = null, selected = localStorage.getItem('glasshouse-model-editor'), draft = null, keyOpen = false, dirty = false, busy = false, notice = '', testJob = null, chatHistory = [], chatAnswer = '', catalogs = {};
    async function call(path, payload) { let r; const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);try {
        r = await fetch(baseURL + path, payload === undefined ? {signal:controller.signal} : {signal:controller.signal, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    }
    catch (e) {
        throw Error(e.name==='AbortError'?'模型调用超过90秒，未确认完成；可在调用记录核对后重试':'模型中心暂时离线，请通过工作台启动器重新打开；原连接仍保留。');
    } finally {clearTimeout(timer)} const d = await r.json(); if (!r.ok)
        throw Error(d.error + (d.hint ? ' · ' + d.hint : '')); return d; }
    async function load() { if (loading)
        return loading; loading = call('state').then(d => data = d).finally(() => loading = null); return loading; }
    const currentProfile = () => data?.profiles.find(p => p.id === selected);
    function pick(id) { chatHistory = []; chatAnswer = ''; selected = id; if(id)localStorage.setItem('glasshouse-model-editor',id); const p = currentProfile(); draft = p ? { ...p, key: '', remember: p.storage !== 'session' } : { name: '新的模型配置', provider: 'Gemini', model: '', baseUrl: data.providers.Gemini, key: '', remember: true, thinking: 'auto', enabled: true }; keyOpen = !p?.credentialConfigured; dirty = !p; notice = ''; testJob = null; draw(); }
    function status(p) { if (!p.enabled)
        return ['停用', 'off']; if (!p.model)
        return ['待选择模型', 'pending']; if (!p.credentialConfigured)
        return ['待配置密钥', 'pending']; const test = p.lastTest; if (test && test.profileRevision === p._revision)
        return [test.status === 'succeeded' ? '最近测试通过' : '最近测试失败', test.status === 'succeeded' ? 'pass' : 'fail']; return ['已配置 · 未验证', 'pending']; }
    function date(t) { return t ? new Date(t * 1000).toLocaleString('zh-CN') : '尚无记录'; }
    function credentialView(p) { if (!p?.credentialConfigured)
        return '<span class="mc-key-empty">未配置可用密钥</span>'; return `<strong>${p.keySuffix ? '•••• •••• ' + esc(p.keySuffix) : '•••• 旧连接中已配置'}</strong><span>${esc(p.credentialLabel)}${p.storage === 'legacy' ? ' · 填一次 Key 后可跨重启记忆' : ''}</span>`; }
    function editor() { const p = currentProfile(), d = draft; if (!d)
        return '<p>选择或添加一个模型配置。</p>'; const st = p ? status(p) : ['尚未保存', 'pending']; return `<div class="mc-editor-title"><div><small>MODEL CONFIGURATION</small><h3>${esc(d.name)}</h3></div><span class="mc-status ${st[1]}">${st[0]}</span></div><form id="mc-form"><div class="mc-form-grid"><label>配置名称<input name="name" value="${esc(d.name)}" required></label><label>供应商<select name="provider">${Object.keys(data.providers).map(v => `<option ${d.provider === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>${d.provider==='Qwen'&&/realtime/i.test(d.model)?'<p class="mc-notice">实时语音模型：测试与对话使用 WebSocket，由 Workspace ID 和区域生成地址。下方 HTTP 地址仅用于普通模型目录，不会把实时请求发到文本接口。</p>':''}<label>API 接口地址<input name="baseUrl" value="${esc(d.baseUrl)}" required><small>请使用该 Key 对应的接口；更换供应商或地址时需填写对应密钥。</small></label><label>模型 ID<div class="mc-model-field"><input name="model" list="mc-model-list" value="${esc(d.model || '')}" placeholder="可先保存 Key，再拉取可用模型"><button type="button" id="mc-discover" ${busy ? 'disabled' : ''}>获取可用模型</button></div><datalist id="mc-model-list">${(catalogs[selected] || []).map(m => `<option value="${esc(m)}">`).join('')}</datalist></label><div class="mc-key-box">${credentialView(p)}<button type="button" id="mc-key-edit">${keyOpen ? '收起输入' : '更换密钥'}</button></div>${keyOpen ? `<label>新的 API Key<input name="key" type="password" autocomplete="off" value="${esc(d.key || '')}" placeholder="留空保留现有凭据"><small>保存成功后显示脱敏尾号；原始 Key 不回传给浏览器。</small></label><label class="checkrow"><input name="remember" type="checkbox" ${d.remember ? 'checked' : ''}>记住在本机钥匙串（不进入项目备份）</label>` : ''}<label>百炼 Workspace ID<input name="workspaceId" value="${esc(d.workspaceId||'')}" placeholder="实时语音模型必填"></label><label>百炼区域<select name="region"><option value="cn" ${d.region!=='intl'?'selected':''}>中国内地</option><option value="intl" ${d.region==='intl'?'selected':''}>国际</option></select></label><label>推理模式<select name="thinking">${[['auto', '模型默认'], ['off', '快速 / 非思考'], ['on', '思考模式']].map(([v, n]) => `<option value="${v}" ${d.thinking === v ? 'selected' : ''}>${n}</option>`).join('')}</select><small>${p?.storage === 'legacy' ? '原连接沿用默认推理；重新保存 Key 后可切换。' : 'DeepSeek / Kimi 按接口支持发送；其他供应商保留模型默认。'}</small></label><div class="mc-editor-actions"><button class="primary" ${busy ? 'disabled' : ''}>保存配置</button><button type="button" id="mc-test" ${busy ? 'disabled' : ''}>测试真实调用</button><button type="button" id="mc-cancel">取消编辑</button>${p ? '<button type="button" id="mc-copy">复制配置</button><button type="button" id="mc-enabled">' + (p.enabled ? '停用' : '启用') + '</button>' : ''}</div></form><div class="mc-notice" id="mc-notice" role="status">${esc(notice || '保存只确认配置已记住；连接测试与实际业务调用分别显示。')}</div>${testJob ? testHTML(testJob) : ''}${p ? `<div class="mc-proof-grid"><div><small>最近连接测试</small><b>${p.lastTest ? (p.lastTest.status === 'succeeded' ? '通过' : '失败') : '尚未测试'}</b><span>${date(p.lastTest?.at)}${p.lastTest && p.lastTest.profileRevision !== p._revision ? ' · 配置已修改，需重测' : ''}</span></div><div><small>最近业务调用</small><b>${p.lastCall ? (p.lastCall.status === 'succeeded' ? '调用成功' : '调用失败') : '尚无业务调用'}</b><span>${date(p.lastCall?.at)}</span></div></div>` : ''}`; }
    function testHTML(j) { return `<div class="mc-test-result ${j.status}" role="status"><b>${j.status === 'running' ? '正在进行真实请求…' : j.status === 'passed' ? '真实调用测试通过' : '测试失败'}</b>${j.steps.map(s => `<p>${s.status === 'passed' ? '✓' : s.status === 'failed' ? '!' : '◌'} ${esc(s.name)}</p>`).join('')}${j.error ? '<strong>' + esc(j.error.message) + '</strong><p>' + esc(j.error.hint) + '</p><code>' + esc(j.error.code) + '</code>' : ''}${j.summary ? '<p>' + esc(j.summary) + '</p>' : ''}<small>${j.durationMs != null ? j.durationMs + ' ms' : '请求进行中'} · 测试会产生少量供应商调用费用</small></div>`; }
    function draw() {
        const mount = $('#model-center');
        if (!mount || !data)
            return;
        mount.innerHTML = `<div class="mc-head"><div><small>MODEL CENTER</small><h2>模型与调用</h2><p>一条配置对应一个模型与接口。密钥状态、测试结果和业务使用分开记录。</p></div><div><button id="mc-refresh">刷新状态</button><button class="primary" id="mc-add">＋ 添加模型</button></div></div><div class="mc-layout"><div class="mc-profiles">${data.profiles.map(p => { const st = status(p); return `<button data-mc-profile="${p.id}" class="mc-profile ${selected === p.id ? 'selected' : ''}"><span class="mc-provider">${esc(p.provider)}</span><b>${esc(p.name)}</b><code>${esc(p.model || '尚未选择模型')}</code><span class="mc-status ${st[1]}">${st[0]}</span><small>${p.credentialConfigured ? esc(p.credentialLabel) + (p.keySuffix ? ' · 尾号 ' + esc(p.keySuffix) : '') : '缺少凭据'}</small></button>`; }).join('') || '<p>添加第一个模型配置。</p>'}</div><section class="mc-editor">${editor()}</section></div><section class="mc-routing"><h3>按用途选择模型</h3><div>${Object.entries(data.roles).map(([id, name]) => `<label>${name}${['image', 'vision'].includes(id) ? '<small>表盘素材与视觉任务使用</small>' : ''}<select data-mc-route="${id}"><option value="">未选择</option>${data.profiles.filter(p => p.enabled).map(p => `<option value="${p.id}" ${data.routing[id] === p.id ? 'selected' : ''}>${esc(p.name)} · ${esc(p.model || '缺模型ID')}</option>`).join('')}</select></label>`).join('')}</div><small>只调用选中的配置，不会因失败静默切换到其他供应商。</small></section><section class="mc-play"><h3>用此配置试聊</h3><p>直接检验当前所选模型能否回答你的问题；这里只验证对话，不执行服务发布或系统操作。</p><form id="mc-chat-form"><textarea name="text" placeholder="例如：用一句话说明你能提供什么帮助。" required></textarea><button ${busy || !selected ? 'disabled' : ''}>发送给当前模型</button></form><div class="mc-chat-answer">${esc(chatAnswer || '等待发送。')}</div></section><section class="mc-calls"><div><h3>最近调用记录</h3><span>记录真实请求的状态、耗时与用量，不保存 Key 或原始问题正文。</span></div>${data.calls.slice(0, 12).map(e => `<article><span class="mc-status ${e.status === 'succeeded' ? 'pass' : 'fail'}">${e.status === 'succeeded' ? '成功' : '失败'}</span><b>${esc(e.profileName)}</b><small>${esc(({ test: '连接测试', design: '服务设计', chat: '试聊', 'os-chat': 'OS 对话', 'agent-turn':'助手决策' }[e.kind] || e.kind))} · ${esc(e.model)} · ${e.firstTextMs!=null?'首字 '+e.firstTextMs+' ms · ':''}完成 ${e.durationMs} ms · ${date(e.at)}</small>${e.error ? '<p>' + esc(e.error.message) + ' · ' + esc(e.error.hint || '') + '</p>' : ''}${e.usage ? '<small>用量：' + esc(Object.entries(e.usage).filter(([, v]) => typeof v === 'number').map(([k, v]) => k + ': ' + v).join(' · ')) + '</small>' : ''}</article>`).join('') || '<p>还没有调用记录。配置已保存不代表业务已经调用。</p>'}</section><a class="mc-architecture-link" href="/architecture/watchface-ai.html">表盘与 AI 设计架构评估 →</a>`;
        labelControls(mount);
        $('#mc-add').onclick = () => { if (dirty)
            return toast('先保存当前修改，或取消编辑'); pick(null); };
        $('#mc-refresh').onclick = () => task(async () => { await load(); if (selected && !dirty)
            draft = { ...currentProfile(), key: '', remember: currentProfile()?.storage !== 'session' }; notice = dirty ? '后台状态已刷新，未保存输入保留' : '已读取后台真实状态'; draw(); });
        $$('[data-mc-profile]').forEach(b => b.onclick = () => { if (dirty)
            return toast('当前配置有未保存修改，请先保存再切换'); pick(b.dataset.mcProfile); });
        $('#mc-cancel').onclick = () => pick(currentProfile()?.id || data.profiles[0]?.id || null);
        const form = $('#mc-form');
        if (busy)
            form.querySelectorAll('input,select,button').forEach(el => el.disabled = true);
        form.oninput = e => { if (e.target.name) {
            draft[e.target.name] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
            dirty = true;
            $('#mc-notice').textContent = '当前修改尚未保存，历史测试不代表这些修改。';
        } };
        form.onchange = e => { if (e.target.name === 'provider') {
            draft.provider = e.target.value;
            if (!draft.baseUrl || Object.values(data.providers).includes(draft.baseUrl))
                draft.baseUrl = data.providers[draft.provider];
            keyOpen = true;
            dirty = true;
            draw();
        } };
        form.onsubmit = e => { e.preventDefault(); task(save); };
        $('#mc-key-edit').onclick = () => { keyOpen = !keyOpen; draw(); };
        $('#mc-test').onclick = () => task(test);
        $('#mc-discover').onclick = () => task(async () => { if (dirty || !selected)
            await save(); const r = await call('discover', { profileId: selected }); catalogs[selected] = r.models; notice = '已获得 ' + r.models.length + ' 个模型。请在模型 ID 输入框中选择；实际可用性仍需测试。'; draw(); });
        $('#mc-copy')?.addEventListener('click', () => task(async () => { if (dirty)
            await save(); const p = await call('duplicate', { id: selected }); await load(); pick(p.id); notice = '已复制独立模型配置，复用原凭据；更换本配置 Key 不影响原配置。'; draw(); }));
        $('#mc-enabled')?.addEventListener('click', () => task(async () => { if (dirty)
            await save(); const p = currentProfile(); await call('enabled', { id: p.id, enabled: !p.enabled }); await load(); pick(p.id); }));
        $$('[data-mc-route]').forEach(el => el.onchange = () => task(async () => { await call('bind', { role: el.dataset.mcRoute, profileId: el.value }); await load(); notice = '用途选择已保存'; draw(); }));
        $('#mc-chat-form').onsubmit = e => { e.preventDefault(); const text = new FormData(e.target).get('text'); task(async () => { if (dirty || !selected)
            await save(); chatAnswer = '正在等待所选模型回答…'; draw(); const r = await call('chat', { profileId: selected, text, history: chatHistory }); chatHistory.push({ role: 'user', content: text }, { role: 'assistant', content: r.answer }); chatHistory = chatHistory.slice(-12); chatAnswer = r.answer; await load(); draw(); }); };
        if (busy)
            mount.querySelectorAll('input,textarea,select,button').forEach(el => el.disabled = true);
    }
    async function task(fn) { if (busy)
        return; busy = true; if ($('#mc-form'))
        $('#mc-form').querySelectorAll('input,select,button').forEach(el => el.disabled = true); try {
        await fn();
    }
    catch (e) {
        notice = e.message;
        if ($('#mc-notice'))
            $('#mc-notice').textContent = e.message;
        toast(e.message);
    }
    finally {
        busy = false;
        if (data && $('#model-center'))
            draw();
    } }
    async function save() { const saved = await call('save', { ...draft, id: selected || undefined, expected: currentProfile()?._revision }); selected = saved.id; localStorage.setItem('glasshouse-model-editor', selected); await load(); draft = { ...currentProfile(), key: '', remember: currentProfile().storage !== 'session' }; keyOpen = !currentProfile().credentialConfigured; dirty = false; notice = '配置已保存 · ' + currentProfile().credentialLabel + '。测试和实际调用状态见下方。'; draw(); }
    async function test() { if (dirty || !selected)
        await save(); notice = '配置仍已保存；正在发送真实生成请求。'; const r = await call('test', { profileId: selected }); do {
        testJob = await call('test?id=' + r.id);
        draw();
        if (testJob.status === 'running')
            await new Promise(resolve => setTimeout(resolve, 600));
    } while (testJob.status === 'running'); await load(); draft = { ...currentProfile(), key: '', remember: currentProfile().storage !== 'session' }; notice = testJob.status === 'passed' ? '测试通过，Key 仍保留在原保存位置。' : '配置仍保留；测试失败原因见下方。'; draw(); }
    const baseSettings = renderSettings;
    renderSettings = function () { baseSettings(); const legacy = $('#provider')?.closest('section'); if (legacy)
        legacy.hidden = true; const head = $('#body .pagehead'); if (head?.querySelector('p'))
        head.querySelector('p').textContent = '模型独立管理；其他日历、天气与检索连接保留在下方。'; head?.insertAdjacentHTML('afterend', '<section id="model-center"><p>正在读取模型配置与真实调用状态…</p></section>'); load().then(() => { if (!$('#model-center'))
        return; if (!data.profiles.some(p => p.id === selected) && data.profiles.length)
        selected = data.profiles[0].id; if (!draft)
        draft = currentProfile() ? { ...currentProfile(), key: '', remember: currentProfile().storage !== 'session' } : { name: '新的模型配置', provider: 'Gemini', baseUrl: data.providers.Gemini, model: '', remember: true, enabled: true, thinking: 'auto' }; keyOpen = !currentProfile()?.credentialConfigured; draw(); }).catch(e => { if ($('#model-center'))
        $('#model-center').innerHTML = '<div class="notice">' + esc(e.message) + '</div>'; }); };
    const baseRight = renderRight;
    renderRight = function () { baseRight(); const box = $('.chatbox'); if (!box)
        return; const route = data?.profiles.find(p => p.id === data.routing.design); box.insertAdjacentHTML('afterbegin', `<div class="mc-designer-model"><label>本次设计模型<select id="mc-design-choice"><option value="">${route ? '按用途设置 · ' + esc(route.name) : '使用用途设置 / 尚未配置'}</option>${(data?.profiles || []).filter(p => p.enabled).map(p => `<option value="${p.id}" >${esc(p.name)}</option>`).join('')}</select></label><small>${route ? '凭据：' + esc(route.credentialLabel) : '在模型中心保存并选择设计模型'}</small></div>`); if (current?.messages?.some(m => m.content))
        box.insertAdjacentHTML('beforeend', '<div class="mc-design-history" role="log">' + current.messages.filter(m => m.content).slice(-6).map(m => '<article><b>' + (m.role === 'user' ? '你' : 'AI') + '</b><p>' + esc(m.content.slice(0, 600)) + '</p></article>').join('') + '</div>'); };
    requestAI = async function (mode) { const source=current,box=$('#aiprompt')?.parentElement;let progress=document.getElementById('ai-request-progress');if(!progress&&box){progress=document.createElement('p');progress.id='ai-request-progress';progress.setAttribute('role','status');box.append(progress)}const report=t=>{if(progress)progress.textContent=t;};try {
        await load();
        const id = $('#mc-design-choice')?.value || (mode === 'brainstorm' ? data.routing.reasoning || data.routing.design : data.routing.design);
        if (!id)
            return toast('请先在模型中心选择服务设计或复杂推演模型');
        const profile=data.profiles.find(p=>p.id===id);if(!profile?.credentialConfigured)throw Error('设计模型缺少可用凭据，请到模型中心配置或切换用途模型');
        const prompt = $('#aiprompt')?.value.trim();
        if (!prompt)
            return toast('先描述希望创建或修改的体验');
        const research = $('#research')?.checked, history = (current.messages || []).filter(m => m.content).slice(-12).map(m => ({ role: m.role, content: m.content }));
        report('正在调用 '+profile.provider+' / '+profile.model+'；完成后会打开建议审阅，90秒无响应会明确报错。');
        const r = await call('design', { profileId: id, mode, prompt, research, history, capabilities: atoms().map(a => ({ id: a.id, name: a.name, input: a.input, output: a.output, status: a.status, scope: a.scope })), design: { name: current.name, nodes: current.nodes, elements: current.elements, pages: current.pages, description: current.description } });
        if(current!==source)throw Error('结果已返回，但当前画板已切换；未应用到其他服务');report('模型已返回，正在校验建议。');if(mode!=='brainstorm'&&(!Array.isArray(r.result?.selected)||!r.result.selected.some(id=>atoms().some(a=>a.id===id))))throw Error('模型没有返回可用能力节点，未生成可运行服务，请重试或选择连接器模板');
        checkpoint();
        current.messages = current.messages || [];
        current.messages.push({ role: 'user', content: prompt, at: Date.now() }, { role: 'assistant', content: r.result.description || r.result.title || JSON.stringify(r.result).slice(0, 1500), at: Date.now(), runId: r.id, profileId: id });
        if (mode === 'brainstorm') {
            if (!Array.isArray(r.result.ideas))
                throw Error('结果缺少创意列表');
            for (const idea of r.result.ideas)
                await put({ ...idea, id: uid(), serviceId: current.id, provider: r.provider, model: r.model }, 'idea');
            go('ideas');
        }
        else
            previewSuggestion(r);
    }
    catch (e) {
        report('未完成：'+e.message);toast(e.message);
    } };
    const originalAPI = api;
    api = async function (path, payload) { if (path === 'os-chat') {
        await load();
        return call('os-chat', { ...payload, profileId: data.routing.chat || undefined });
    } if (path === 'voice-config' && payload === undefined) {
        const cfg = await originalAPI(path);
        try {
            await load();
            const p = data.profiles.find(p => p.id === data.routing.chat);
            if (p)
                return { ...cfg, provider: p.provider, model: p.model, chatKeyConfigured: p.credentialConfigured, chatProfileName: p.name };
        }
        catch { }
        return cfg;
    } return originalAPI(path, payload); };
    if (typeof osVoice === 'function') {
        const baseOSVoice = osVoice;
        osVoice = function () { const p = data?.profiles.find(p => p.id === data.routing.chat); let hint = p ? (p.credentialConfigured ? '已选择 ' + p.name + ' · ' + p.model + '。输入文字将调用此模型。' : '已选择 ' + p.name + '，请先在模型中心配置密钥。') : '请在模型中心选择 OS 对话模型，输入文字也会调用真实模型。'; if (typeof osVoiceState !== 'undefined' && osVoiceState.busy)
            hint = '正在等待所选真实模型回答…'; return baseOSVoice().replace('配置 API Key 后可开始对话，输入文字也会调用真实模型。', esc(hint)); };
    }
    const originalVoiceSettings = configureVoice;
    configureVoice = async function () { try {
        await load();
    }
    catch { } await originalVoiceSettings(); const form = $('#voice-config-form'); if (!form || !$('#modal').open || !data)
        return; for (const name of ['provider', 'model', 'chatKey'])
        form.querySelector('[name=' + name + ']')?.closest('label')?.setAttribute('hidden', ''); const route = data.profiles.find(p => p.id === data.routing.chat); if (route) {
        form.querySelector('[name=provider]').value = route.provider;
        form.querySelector('[name=model]').value = route.model;
    } form.insertAdjacentHTML('afterbegin', `<section class="mc-voice-profile"><h3>OS 对话模型</h3><select id="mc-voice-profile-choice"><option value="">未选择 · 请在模型中心选择</option>${data.profiles.filter(p => p.enabled).map(p => `<option value="${p.id}" ${route?.id === p.id ? 'selected' : ''}>${esc(p.name)} · ${esc(p.model)}</option>`).join('')}</select><p id="mc-voice-profile-status">${route ? esc(route.name) + ' · ' + esc(route.credentialLabel) + ' · ' + (route.credentialConfigured ? '凭据已配置' : '缺少凭据') : '请选择模型中心已保存的配置。'}</p><a href="/?models=1&v=20261112-models1" target="_blank" rel="noopener">管理多个模型与密钥 ↗</a><small>下方是独立的语音引擎参数；语音 Key 仍按原流程保存在本次运行。</small></section>`); $('#mc-voice-profile-choice').onchange = async function () { try {
        await call('bind', { role: 'chat', profileId: this.value });
        await load();
        const selected = data.profiles.find(p => p.id === this.value);
        if (selected) {
            form.querySelector('[name=provider]').value = selected.provider;
            form.querySelector('[name=model]').value = selected.model;
        }
        $('#mc-voice-profile-status').textContent = selected ? selected.name + ' · ' + selected.credentialLabel + ' · 已选择' : '请在模型中心选择 OS 对话模型';
    }
    catch (e) {
        report('未完成：'+e.message);toast(e.message);
    } }; };
    window.ModelCenter = { load, call, assetURL:path=>new URL(path,baseURL).href, open: () => location.pathname === '/os.html' ? window.open('/?models=1&v=20261112-models1', '_blank') : go('settings') };
    load().then(() => { if (location.pathname !== '/os.html' && new URLSearchParams(location.search).has('models'))
        go('settings'); }).catch(() => { });
})();
