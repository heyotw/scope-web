// ─── markdown renderer ────────────────────────────────────────────────────────
// just extract code blocks first then escape the rest

function escHtml(str) {
    return String(str)
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;');
}

function copyCode(btn) {
    const code = btn.closest('pre').querySelector('code').textContent;
    navigator.clipboard.writeText(code).then(() => {
        btn.textContent='Copied!'; btn.classList.add('copied');
        setTimeout(()=>{ btn.textContent='Copy'; btn.classList.remove('copied'); }, 2000);
    });
}

function renderInline(text) {
    // text is already escaped at this point
    let h = text;
    h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
    h = h.replace(/_([^_\n]+)_/g, '<em>$1</em>');
    h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return h;
}

function renderBlock(raw) {
    const h = escHtml(raw);
    const lines = h.split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];

        // heading (the # thing)
        if (/^### /.test(line)) { out.push(`<h3>${renderInline(line.slice(4))}</h3>`); i++; continue; }
        if (/^## /.test(line))  { out.push(`<h2>${renderInline(line.slice(3))}</h2>`); i++; continue; }
        if (/^# /.test(line))   { out.push(`<h1>${renderInline(line.slice(2))}</h1>`); i++; continue; }

        // that weird line thing (---)
        if (/^---+$/.test(line)) { out.push('<hr>'); i++; continue; }

        // quotes (the > thing)
        if (/^&gt; /.test(line)) { out.push(`<blockquote>${renderInline(line.slice(5))}</blockquote>`); i++; continue; }

        // unordered list (bullets baby)
        if (/^[*\-] /.test(line)) {
            const items = [];
            while (i < lines.length && /^[*\-] /.test(lines[i])) {
                items.push(`<li>${renderInline(lines[i].slice(2))}</li>`);
                i++;
            }
            out.push(`<ul>${items.join('')}</ul>`);
            continue;
        }

        // ordered list (numbered, for the organized folks)
        if (/^\d+\. /.test(line)) {
            const items = [];
            while (i < lines.length && /^\d+\. /.test(lines[i])) {
                items.push(`<li>${renderInline(lines[i].replace(/^\d+\. /,''))}</li>`);
                i++;
            }
            out.push(`<ol>${items.join('')}</ol>`);
            continue;
        }

        // paragraph (just text hanging around until it finds a blank line)
        if (line.trim() === '') { i++; continue; }
        const para = [];
        while (i < lines.length && lines[i].trim() !== '') {
            para.push(renderInline(lines[i]));
            i++;
        }
        out.push(`<p>${para.join('<br>')}</p>`);
    }
    return out.join('\n');
}

function renderMarkdown(raw) {
    // step 1: extract the code blocks so we don't accidentally markdown them
    const segments = [];
    const re = /```(\w*)\r?\n?([\s\S]*?)```/g;
    let last = 0, m;

    while ((m = re.exec(raw)) !== null) {
        if (m.index > last) segments.push({t:'text', c: raw.slice(last, m.index)});
        segments.push({t:'code', lang: m[1]||'text', c: m[2]});
        last = m.index + m[0].length;
    }
    if (last < raw.length) segments.push({t:'text', c: raw.slice(last)});

    // step 2: render each segment
    return segments.map(seg => {
        if (seg.t === 'code') {
            const lang = escHtml(seg.lang);
            const code = escHtml(seg.c.replace(/\n$/, '')); // gotta escape the code too
            return `<pre><div class="code-bar"><span class="code-lang">${lang}</span><button class="copy-btn" onclick="copyCode(this)">Copy</button></div><code>${code}</code></pre>`;
        }
        return renderBlock(seg.c);
    }).join('');
}

// ─── loading bar ──────────────────────────────────────────────────────────────
let loadBarTimer = null;

function loadBarStart() {
    const bar = document.getElementById('load-bar');
    bar.classList.remove('done');
    bar.classList.add('running');
    bar.style.width = '0%';
    clearTimeout(loadBarTimer);
    // fake it til you make it
    setTimeout(()=>{ bar.style.width='30%'; }, 50);
    setTimeout(()=>{ bar.style.width='60%'; }, 300);
    setTimeout(()=>{ bar.style.width='85%'; }, 700);
}

function loadBarDone() {
    const bar = document.getElementById('load-bar');
    bar.style.width = '100%';
    clearTimeout(loadBarTimer);
    loadBarTimer = setTimeout(()=>{
        bar.classList.add('done');
        setTimeout(()=>{ bar.classList.remove('running','done'); bar.style.width='0%'; }, 500);
    }, 150);
}

// ─── theme ────────────────────────────────────────────────────────────────────
function toggleTheme() {
    const t = document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';
    document.documentElement.setAttribute('data-theme', t);
    document.getElementById('theme-btn').textContent = t==='dark'?'☀':'☾';
    localStorage.setItem('theme', t);
}

(function(){
    const s = localStorage.getItem('theme');
    if (s) { document.documentElement.setAttribute('data-theme',s); document.getElementById('theme-btn').textContent=s==='dark'?'☀':'☾'; }
})();

// ─── sidebar collapse ──────────────────────────────────────────────────────────
let leftOpen=true, rightOpen=true;

function toggleLeft() {
    leftOpen=!leftOpen;
    document.getElementById('left-sidebar').classList.toggle('collapsed',!leftOpen);
    localStorage.setItem('leftOpen',leftOpen);
}

function toggleRight() {
    rightOpen=!rightOpen;
    document.getElementById('right-panel').classList.toggle('collapsed',!rightOpen);
    localStorage.setItem('rightOpen',rightOpen);
}

(function(){
    if (localStorage.getItem('leftOpen')==='false') { leftOpen=false; document.getElementById('left-sidebar').classList.add('collapsed'); }
    if (localStorage.getItem('rightOpen')==='false') { rightOpen=false; document.getElementById('right-panel').classList.add('collapsed'); }
})();

// ─── state ────────────────────────────────────────────────────────────────────
let chatId=null, convHistory=[], imageContexts=[], imageQueue=[], isProcessing=false, saveTimer=null, allChats=[], searchEnabled=false;

const messagesEl  = document.getElementById('messages');
const promptEl    = document.getElementById('prompt');
const sendBtn     = document.getElementById('send-btn');
const emptyState  = document.getElementById('empty-state');
const qListEl     = document.getElementById('queue-list');
const ctxListEl   = document.getElementById('ctx-list');
const ctxEmptyEl  = document.getElementById('ctx-empty');
const chatIdEl    = document.getElementById('chat-id-el');
const chatTitleEl = document.getElementById('chat-title');
const qHint       = document.getElementById('q-hint');
const qCountEl    = document.getElementById('q-count');
const previewsEl  = document.getElementById('input-previews');
const chatListEl  = document.getElementById('chat-list');

// ─── init ──────────────────────────────────────────────────────────────────────
(async function init(){
    await refreshChatList();
    const parts=window.location.pathname.split('/');
    const idx=parts.indexOf('chats');
    if (idx!==-1 && parts[idx+1]) await loadChat(parts[idx+1]);
    else await newChat();
})();

// ─── chat lifecycle ───────────────────────────────────────────────────────────
async function newChat() {
    try {
        const res=await fetch('/api/chats',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Untitled Chat'})});
        const data=await res.json();
        chatId=data.id; convHistory=[]; imageContexts=[]; imageQueue=[];
        messagesEl.innerHTML=''; messagesEl.appendChild(emptyState); emptyState.style.display='';
        chatTitleEl.value=data.title;
        chatIdEl.textContent=chatId.slice(0,8)+'…'; chatIdEl.style.display='';
        window.history.pushState({},'',`/chats/${chatId}`);
        renderContextPanel(); renderQueue(); renderPreviews(); await refreshChatList();
        toast('New chat');
    } catch(e){ toast('Failed to create chat',true); }
}

async function loadChat(id) {
    loadBarStart();
    try {
        const res=await fetch(`/api/chats/${id}`);
        if (!res.ok) throw new Error();
        const data=await res.json();
        chatId=data.id;
        chatTitleEl.value=data.title;
        chatIdEl.textContent=chatId.slice(0,8)+'…'; chatIdEl.style.display='';
        window.history.pushState({},'',`/chats/${chatId}`);
        convHistory=[]; imageQueue=[];
        messagesEl.innerHTML=''; messagesEl.appendChild(emptyState); emptyState.style.display='';
        if (data.messages?.length) {
            emptyState.style.display='none';
            for (const msg of data.messages) restoreMessage(msg);
            for (const msg of data.messages) {
                if (msg.type==='user-text') convHistory.push({role:'user',content:msg.text||''});
                else if (msg.type==='ai') convHistory.push({role:'assistant',content:msg.text||''});
            }
        }
        imageContexts=(data.images||[]).filter(i=>i.description);
        renderContextPanel(); renderQueue(); renderPreviews(); await refreshChatList();
        toast(`Loaded: ${data.title}`);
    } catch(e){ toast('Chat not found',true); await newChat(); }
    loadBarDone();
}

async function saveChat() {
    if (!chatId) return;
    try {
        await fetch(`/api/chats/${chatId}`,{
            method:'PUT', headers:{'Content-Type':'application/json'},
            body:JSON.stringify({title:chatTitleEl.value.trim()||'Untitled Chat', messages:collectMessages(), images:imageContexts})
        });
        await refreshChatList();
    } catch(e){}
}

function saveChatDebounced(){ clearTimeout(saveTimer); saveTimer=setTimeout(saveChat,900); }

function collectMessages() {
    const msgs=[];
    for (const el of messagesEl.querySelectorAll('[data-msg]')) {
        try{ msgs.push(JSON.parse(el.getAttribute('data-msg'))); }catch(e){}
    }
    return msgs;
}

// ─── DELETE ───────────────────────────────────────────────────────────────────
let confirmCb=null;

function openConfirm(text, onOk) {
    document.getElementById('confirm-text').textContent=text;
    document.getElementById('confirm-dialog').classList.add('show');
    confirmCb=onOk;
    document.getElementById('confirm-ok').onclick=()=>{ closeConfirm(); if(confirmCb) confirmCb(); };
}

function closeConfirm(){ document.getElementById('confirm-dialog').classList.remove('show'); }

function deleteChat(id, title, e) {
    e.stopPropagation();
    openConfirm(`"${title}" will be permanently deleted.`, async ()=>{
        // Optimistic: animate out immediately
        const el=document.getElementById(`ci-${id}`);
        if (el) {
            el.classList.add('removing');
            setTimeout(()=>el.remove(), 320);
        }
        // update allchats cache
        allChats=allChats.filter(c=>c.id!==id);
        toast('Chat deleted');

        // api call in background
        try { await fetch(`/api/chats/${id}`,{method:'DELETE'}); } catch(e){}

        if (id===chatId) await newChat();
    });
}

// ─── chat list ────────────────────────────────────────────────────────────────
async function refreshChatList() {
    try {
        const res=await fetch('/api/chats');
        allChats=await res.json();
        renderChatList(allChats);
    }catch(e){}
}

function renderChatList(chats) {
    chatListEl.innerHTML='';
    if (!chats.length){ chatListEl.innerHTML='<div class="chat-list-empty">No chats yet</div>'; return; }
    const lbl=document.createElement('div'); lbl.className='section-label'; lbl.textContent='Recent'; chatListEl.appendChild(lbl);
    for (const c of chats) {
        const d=document.createElement('div');
        d.className='chat-item'+(c.id===chatId?' active':'');
        d.id=`ci-${c.id}`;
        const date=new Date(c.updated_at).toLocaleDateString(undefined,{month:'short',day:'numeric'});
        d.innerHTML=`<div class="chat-item-info">
            <div class="chat-item-title">${escHtml(c.title)}</div>
            <div class="chat-item-date">${date}</div>
        </div>
        <button class="chat-del-btn" title="Delete">🗑</button>`;
        d.querySelector('.chat-item-info').onclick=()=>{ closeModal(); loadChat(c.id); };
        d.querySelector('.chat-del-btn').onclick=(e)=>deleteChat(c.id,c.title,e);
        chatListEl.appendChild(d);
    }
}

// ─── IMAGE QUEUE ──────────────────────────────────────────────────────────────
function triggerUpload(){ document.getElementById('file-input').click(); }

function onDragOver(e){ e.preventDefault(); document.getElementById('drop-zone').classList.add('drag-over'); }
function onDragLeave(){  document.getElementById('drop-zone').classList.remove('drag-over'); }
function onDrop(e){
    e.preventDefault(); document.getElementById('drop-zone').classList.remove('drag-over');
    handleFiles([...e.dataTransfer.files].filter(f=>f.type.startsWith('image/')));
}

// image queue ───────────────────────────────────────────────────────────────────
document.addEventListener('paste', e=>{
    const items=[...e.clipboardData.items].filter(it=>it.type.startsWith('image/'));
    if (!items.length) return;
    e.preventDefault();
    const files=items.map(it=>it.getAsFile()).filter(Boolean);
    handleFiles(files);
    toast('Image pasted!');
});

function handleFiles(files) {
    for (const file of files) {
        const id=crypto.randomUUID();
        const reader=new FileReader();
        reader.onloadend=()=>{ imageQueue.push({id,dataUrl:reader.result,name:file.name||'pasted-image.png',status:'pending'}); renderQueue(); renderPreviews(); };
        reader.readAsDataURL(file);
    }
    try{ document.getElementById('file-input').value=''; }catch(e){}
}

function removeQueue(id){ imageQueue=imageQueue.filter(i=>i.id!==id); renderQueue(); renderPreviews(); }

function renderQueue() {
    const pending=imageQueue.filter(i=>i.status!=='done');
    qHint.style.display=pending.length?'':'none';
    qCountEl.textContent=pending.length;
    qListEl.innerHTML='';
    for (const item of imageQueue) {
        const d=document.createElement('div'); d.className='queue-item'; d.id=`qi-${item.id}`;
        d.innerHTML=`<img src="${item.dataUrl}" alt="">
            <div class="qi-info"><div class="qi-name">${escHtml(item.name)}</div><div class="qi-status ${item.status}" id="qs-${item.id}">${item.status}</div></div>
            <button class="qi-del" onclick="removeQueue('${item.id}')">✕</button>`;
        qListEl.appendChild(d);
    }
}

function renderPreviews() {
    previewsEl.innerHTML='';
    const pending=imageQueue.filter(i=>i.status==='pending');
    if (pending.length){
        previewsEl.classList.add('has');
        for (const item of pending){
            const chip=document.createElement('div'); chip.className='preview-chip';
            chip.innerHTML=`<img src="${item.dataUrl}" alt=""><button class="pc-remove" onclick="removeQueue('${item.id}')">✕</button>`;
            previewsEl.appendChild(chip);
        }
    } else { previewsEl.classList.remove('has'); }
}

function setQueueStatus(id,status){
    const el=document.getElementById(`qs-${id}`);
    if (el){ el.className=`qi-status ${status}`; el.textContent=status; }
    const qi=imageQueue.find(i=>i.id===id); if(qi) qi.status=status;
    renderQueue(); renderPreviews();
}

// ─── context panel ────────────────────────────────────────────────────────────
function renderContextPanel(){
    ctxEmptyEl.style.display=imageContexts.length===0?'':'none';
    [...ctxListEl.querySelectorAll('.ctx-card')].forEach(el=>el.remove());
    for (const ctx of imageContexts){
        const card=document.createElement('div'); card.className='ctx-card';
        card.innerHTML=`<div class="ctx-head" onclick="this.parentElement.classList.toggle('open')">
            <img src="${ctx.thumbUrl||ctx.dataUrl}" alt=""><span class="ctx-name">${escHtml(ctx.name)}</span><span class="ctx-chev">▼</span></div>
            <div class="ctx-body">${escHtml(ctx.description)}</div>`;
        ctxListEl.appendChild(card);
    }
}

// ─── message dom ───────────────────────────────────────────────────────────────
function hideEmpty(){ emptyState.style.display='none'; }
function scrollBottom(){ messagesEl.scrollTop=messagesEl.scrollHeight; }

function addUserMsg(text, imgs=[]){
    hideEmpty();
    const wrap=document.createElement('div'); wrap.className='msg-wrap user';
    wrap.setAttribute('data-msg',JSON.stringify({type:'user',text,images:imgs.length?imgs:undefined}));
    const ih=imgs.length?`<div class="msg-user-imgs">${imgs.map(u=>`<img src="${u}" alt="">`).join('')}</div>`:'';
    wrap.innerHTML=`<div class="msg-user">${ih}${text?renderMarkdown(text):''}</div>`;
    messagesEl.appendChild(wrap); scrollBottom();
}

function createAIWrap(type){
    hideEmpty();
    const wrap=document.createElement('div'); wrap.className='msg-wrap ai';
    const isV=type==='vision';
    wrap.innerHTML=`<div class="msg-meta ${isV?'vision':'ai-meta'}"><div class="msg-meta-dot"></div>${isV?'Vision Analysis':'Scope (17B)'}</div>
        <div class="msg-body ${isV?'vision-style':'md'}"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
    messagesEl.appendChild(wrap); scrollBottom();
    return wrap;
}

// startStreaming replaced by createStreamer above

function finaliseAI(wrap,fullText,type){
    const el=wrap.querySelector('.msg-body');
    if (type==='vision') el.textContent=fullText;
    else el.innerHTML=renderMarkdown(fullText);
    wrap.setAttribute('data-msg',JSON.stringify({type:type==='vision'?'vision':'ai',text:fullText}));
    scrollBottom();
}

function addNote(text){
    hideEmpty();
    const wrap=document.createElement('div'); wrap.className='msg-wrap note';
    wrap.innerHTML=`<div class="msg-note">${escHtml(text)}</div>`;
    messagesEl.appendChild(wrap); scrollBottom();
}

function addError(text){
    hideEmpty();
    const wrap=document.createElement('div'); wrap.className='msg-wrap ai';
    wrap.innerHTML=`<div class="msg-error">✕ ${escHtml(text)}</div>`;
    messagesEl.appendChild(wrap); scrollBottom();
}

function restoreMessage(msg){
    if (msg.type==='user'){
        const wrap=document.createElement('div'); wrap.className='msg-wrap user';
        wrap.setAttribute('data-msg',JSON.stringify(msg));
        const ih=(msg.images||[]).length?`<div class="msg-user-imgs">${msg.images.map(u=>`<img src="${u}" alt="">`).join('')}</div>`:'';
        wrap.innerHTML=`<div class="msg-user">${ih}${msg.text?renderMarkdown(msg.text):''}</div>`;
        messagesEl.appendChild(wrap);
    } else if (msg.type==='vision'){
        const wrap=document.createElement('div'); wrap.className='msg-wrap ai';
        wrap.setAttribute('data-msg',JSON.stringify(msg));
        wrap.innerHTML=`<div class="msg-meta vision"><div class="msg-meta-dot"></div>Vision Analysis</div><div class="msg-body vision-style">${escHtml(msg.text||'')}</div>`;
        messagesEl.appendChild(wrap);
    } else if (msg.type==='ai'){
        const wrap=document.createElement('div'); wrap.className='msg-wrap ai';
        wrap.setAttribute('data-msg',JSON.stringify(msg));
        wrap.innerHTML=`<div class="msg-meta ai-meta"><div class="msg-meta-dot"></div>Scope (17B)</div><div class="msg-body md">${renderMarkdown(msg.text||'')}</div>`;
        messagesEl.appendChild(wrap);
    }
    emptyState.style.display='none';
}

// ─── ai call ───────────────────────────────────────────────────────────────────
// ─── loop detection ────────────────────────────────────────────────────────────
function detectLoop(text) {
    if (text.length < 120) return false;
    const tail   = text.slice(-60);
    const before = text.slice(-260, -60);
    if (before.includes(tail)) return true;
    const seg = text.slice(-600);
    const m = seg.match(/(.{20,80})\1{4,}/);
    return !!m;
}

// ─── live markdown streaming ───────────────────────────────────────────────────
// renders markdown incrementally — handles unclosed fences/bold gracefully

function renderMarkdownLive(raw) {
    // If there's an unclosed code fence, temporarily close it so the
    // partial block renders as a proper <pre> while streaming
    const fenceCount = (raw.match(/```/g) || []).length;
    if (fenceCount % 2 === 1) {
        raw = raw + '\n```';
    }
    return renderMarkdown(raw);
}

// returns a streamer object: { append(token), getText() }
function createStreamer(wrap, type) {
    const el = wrap.querySelector('.msg-body');
    el.innerHTML = '';
    let text      = '';
    let rafPending = false;

    function flush() {
        rafPending = false;
        if (!el.isConnected) return;
        if (type === 'vision') {
            el.textContent = text;
        } else {
            // save scroll position — only scroll if user was near bottom
            const atBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;
            el.innerHTML = renderMarkdownLive(text);
            if (atBottom) scrollBottom();
        }
    }

    return {
        append(token) {
            text += token;
            if (!rafPending) {
                rafPending = true;
                requestAnimationFrame(flush);
            }
        },
        getText() { return text; },
        finalFlush() {
            rafPending = false;
            flush();
        }
    };
}

// ─── ai call ───────────────────────────────────────────────────────────────────
async function callAI(messages, type='ai'){
    const wrap    = createAIWrap(type);
    const streamer = createStreamer(wrap, type);
    const maxTok  = type === 'vision' ? 700 : 1024;

    try {
        const res = await fetch('/api/infer', {
            method:  'POST',
            headers: {'Content-Type':'application/json'},
            body:    JSON.stringify({
                messages,
                max_tokens:         maxTok,
                repetition_penalty: 1.2,
                temperature:        type === 'vision' ? 0.5 : 0.6,
            })
        });

        if (!res.ok) throw new Error(`API ${res.status}`);

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let loopDetected = false;

        outer: while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            for (const line of chunk.split('\n')) {
                if (line === 'data: [DONE]') break outer;
                if (line.startsWith('data: ')) {
                    try {
                        const data  = JSON.parse(line.slice(6));
                        if (data.error) throw new Error(data.error);
                        const token = data.choices?.[0]?.delta?.content || '';
                        if (token) {
                            streamer.append(token);
                            if (streamer.getText().length > 200 && detectLoop(streamer.getText())) {
                                loopDetected = true;
                                reader.cancel();
                                break outer;
                            }
                        }
                    } catch(e) {
                        if (e.message && e.message !== 'Unexpected end of JSON input') throw e;
                    }
                }
            }
        }

        // Final flush — render complete (no temporary fence closure)
        streamer.finalFlush();

        let fullText = streamer.getText();
        if (loopDetected) {
            fullText = fullText.replace(/(.{20,80})\1{3,}[\s\S]*$/,'').trim()
                + '\n\n*(response truncated — repetition detected)*';
        }

        finaliseAI(wrap, fullText, type);
        return fullText;

    } catch(e) {
        if (e.name !== 'AbortError') {
            wrap.innerHTML = `<div class="msg-error">✕ ${escHtml(e.message)}</div>`;
            return null;
        }
        finaliseAI(wrap, streamer.getText(), type);
        return streamer.getText() || null;
    }
}

// ─── search note helpers ──────────────────────────────────────────────────────
let _searchNoteEl = null;

function addSearchNote(query){
    hideEmpty();
    _searchNoteEl = document.createElement('div');
    _searchNoteEl.className = 'msg-wrap note';
    _searchNoteEl.innerHTML = `<div class="msg-note" id="search-note-inner">🌐 searching for "<em>${escHtml(query)}</em>"…</div>`;
    messagesEl.appendChild(_searchNoteEl);
    scrollBottom();
}

function replaceSearchNote(text){
    if (!_searchNoteEl) return;
    const inner = document.getElementById('search-note-inner');
    if (inner) inner.textContent = text;
    // Fade out after 3s
    setTimeout(()=>{
        if (_searchNoteEl) {
            _searchNoteEl.style.opacity = '0';
            setTimeout(()=>{ if(_searchNoteEl){ _searchNoteEl.remove(); _searchNoteEl=null; }}, 400);
        }
    }, 3000);
}

// ─── web search ───────────────────────────────────────────────────────────────
function toggleSearch(){
    searchEnabled = !searchEnabled;
    const btn  = document.getElementById('search-toggle');
    const hint = document.getElementById('search-hint');
    btn.classList.toggle('active', searchEnabled);
    hint.style.display = searchEnabled ? '' : 'none';
    toast(searchEnabled ? '🌐 web search enabled' : 'web search off');
}

async function doSearch(query){
    try {
        const res = await fetch('/api/search',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({query, count:6})
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.error) { console.warn('Search error:',data.error); return null; }
        return data.results || [];
    } catch(e){ console.warn('Search failed:',e); return null; }
}

function formatSearchResults(results){
    if (!results || !results.length) return '';
    const lines = results.map((r,i)=>
        `[${i+1}] ${r.title}\nURL: ${r.url}\n${r.description}${r.age?' ('+r.age.slice(0,10)+')':''}`
    );
    return lines.join('\n\n');
}

// ─── send ──────────────────────────────────────────────────────────────────────
async function send(){
    if (isProcessing) return;
    const text    = promptEl.value.trim();
    const pending = imageQueue.filter(i=>i.status==='pending');
    if (!text && !pending.length) return;

    isProcessing=true; sendBtn.disabled=true;
    promptEl.value=''; promptEl.style.height='auto';
    addUserMsg(text, pending.map(i=>i.dataUrl));

    try {
        if (pending.length > 0) {
            // vision path
            for (const item of pending){
                setQueueStatus(item.id,'processing');
                try {
                    const up=await fetch(`/api/chats/${chatId}/images`,{
                        method:'POST',headers:{'Content-Type':'application/json'},
                        body:JSON.stringify({data_url:item.dataUrl})
                    });
                    if(up.ok){ const d=await up.json(); item.processedDataUrl=d.data_url; item.imageId=d.image_id; item.thumbUrl=d.url; }
                }catch(e){}
            }

            // improved vision prompt — push model to be precise and specific
            const visionPrompt = text
                ? `${text}\n\nFor each image, provide a detailed and accurate analysis. Be specific: name exact locations, brands, objects, text visible in the image, colors, and any other precise details. Do not generalise — if you can identify something specifically, do so.`
                : `Analyse ${pending.length === 1 ? 'this image' : 'these images'} in precise detail. Identify and name: exact location or subject, all visible text, objects, people, landmarks, brands, colors, and any other specific identifiable elements. Be as accurate and specific as possible.`;

            const content=[];
            content.push({type:'text', text: visionPrompt});
            for (const item of pending)
                content.push({type:'image_url', image_url:{url:item.processedDataUrl||item.dataUrl}});

            addNote(`Sending ${pending.length} image(s) to Scope Vision…`);

            const desc = await callAI([...convHistory,{role:'user',content}], 'vision');
            if(desc){
                for (const item of pending){
                    imageContexts.push({
                        imageId:   item.imageId||item.id,
                        dataUrl:   item.processedDataUrl||item.dataUrl,
                        thumbUrl:  item.thumbUrl||item.dataUrl,
                        name:      item.name,
                        description: desc
                    });
                    setQueueStatus(item.id,'done');
                }
                renderContextPanel();
                // strip base64 from history to avoid cloudflare 3030 context overflow
                const names    = pending.map(i=>i.name).join(', ');
                const stripped = content
                    .filter(c=>c.type==='text')
                    .map(c=>({...c, text: c.text+`\n[Images attached: ${names}]`}));
                convHistory.push(
                    {role:'user',    content: stripped.length ? stripped : [{type:'text',text:`[${names}]`}]},
                    {role:'assistant', content: desc}
                );
                imageQueue = imageQueue.filter(i=>i.status==='pending');
                renderQueue(); renderPreviews();
            } else {
                pending.forEach(item=>setQueueStatus(item.id,'error'));
            }

        } else {
            // text path (with optional web search)
            const messages = [];
            let searchContext = '';

            // web search — run before building messages
            if (searchEnabled && text) {
                addSearchNote(text);
                const results = await doSearch(text);
                if (results && results.length) {
                    searchContext = formatSearchResults(results);
                    replaceSearchNote(`🌐 found ${results.length} results`);
                } else {
                    replaceSearchNote('🌐 no search results found');
                }
            }

            // build system prompt
            const sysChunks = [];

            if (searchContext) {
                sysChunks.push(
                    `You have access to the following live web search results for the query "${text}". ` +
                    `Use them to give an accurate, up-to-date answer. Cite relevant URLs inline where helpful.\n\n` +
                    `SEARCH RESULTS:\n${searchContext}`
                );
            }

            if (imageContexts.length > 0) {
                const block = imageContexts
                    .map((c,i)=>`Image ${i+1} ("${c.name}"):\n${c.description}`)
                    .join('\n\n---\n\n');
                sysChunks.push(
                    `The user has previously shared ${imageContexts.length} image(s). Visual descriptions:\n\n${block}`
                );
            }

            if (sysChunks.length) {
                messages.push({role:'system', content: sysChunks.join('\n\n---\n\n')});
            }

            messages.push(...convHistory, {role:'user', content: text});

            const reply = await callAI(messages, 'ai');
            if (reply !== null){
                convHistory.push({role:'user',content:text},{role:'assistant',content:reply});
            }
        }
    } catch(e){ addError(e.message); }

    isProcessing=false; sendBtn.disabled=false; promptEl.focus(); saveChatDebounced();
}

// ─── input ────────────────────────────────────────────────────────────────────
promptEl.addEventListener('input',()=>{
    promptEl.style.height='auto';
    promptEl.style.height=Math.min(promptEl.scrollHeight,180)+'px';
});
promptEl.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); send(); } });

// ─── toast ────────────────────────────────────────────────────────────────────
function toast(msg,isError=false){
    const el=document.getElementById('toast');
    el.textContent=(isError?'✕ ':'✓ ')+msg;
    el.classList.add('show');
    setTimeout(()=>el.classList.remove('show'),2500);
}

// ─── copy link ────────────────────────────────────────────────────────────────
function copyLink(){
    if(!chatId) return;
    navigator.clipboard.writeText(`${location.origin}/chats/${chatId}`).then(()=>toast('Link copied!')).catch(()=>prompt('Copy URL:',`${location.origin}/chats/${chatId}`));
}

// ─── modal ────────────────────────────────────────────────────────────────────
async function openModal(){
    document.getElementById('modal').classList.add('show');
    document.getElementById('modal-input').value='';
    try{ const res=await fetch('/api/chats'); allChats=await res.json(); renderModalList(allChats); }catch(e){ renderModalList([]); }
    document.getElementById('modal-input').focus();
}

function closeModal(){ document.getElementById('modal').classList.remove('show'); }

function renderModalList(chats){
    const el=document.getElementById('modal-list'); el.innerHTML='';
    if(!chats.length){ el.innerHTML='<div style="font-size:12px;color:var(--text3);padding:8px;text-align:center;">No saved chats</div>'; return; }
    for (const c of chats){
        const d=document.createElement('div'); d.className='modal-item';
        const date=new Date(c.updated_at).toLocaleDateString(undefined,{month:'short',day:'numeric'});
        d.innerHTML=`<span class="modal-item-title">${escHtml(c.title)}</span><span class="modal-item-meta">${c.id.slice(0,8)}… · ${date}</span>`;
        d.onclick=()=>{ closeModal(); loadChat(c.id); };
        el.appendChild(d);
    }
}

function filterModal(){
    const q=document.getElementById('modal-input').value.toLowerCase();
    renderModalList(allChats.filter(c=>c.title.toLowerCase().includes(q)||c.id.includes(q)));
}

async function loadFromInput(){
    let val=document.getElementById('modal-input').value.trim();
    const m=val.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if(m) val=m[0]; if(!val) return;
    closeModal(); await loadChat(val);
}

// ─── KEYBOARD CHAT NAVIGATION ────────────────────────────────────────────────
function navigateChats(dir) {
    if (!allChats.length) return;
    const currentIdx = allChats.findIndex(c => c.id === chatId);
    let nextIdx = currentIdx + dir;
    nextIdx = Math.max(0, Math.min(allChats.length - 1, nextIdx));
    if (nextIdx !== currentIdx && allChats[nextIdx]) {
        loadChat(allChats[nextIdx].id);
        // scroll the sidebar item into view
        const el = document.getElementById(`ci-${allChats[nextIdx].id}`);
        if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); closeConfirm(); return; }

    // enter confirms delete when dialog is open
    if (e.key === 'Enter') {
        const dlg = document.getElementById('confirm-dialog');
        if (dlg.classList.contains('show')) {
            e.preventDefault();
            document.getElementById('confirm-ok').click();
            return;
        }
    }

    // arrow key chat navigation (up/down when not typing)
    const active = document.activeElement;
    const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
    if (!isTyping && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        navigateChats(e.key === 'ArrowUp' ? -1 : 1);
    }
});