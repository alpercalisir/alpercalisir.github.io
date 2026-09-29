(function () {
  const richContentPrefix = '<!-- alper-rich-html-v1 -->\n';
  const config = window.BLOG_CONFIG || {};
  const apiBase = (config.supabaseUrl || '').replace(/\/$/, '');
  const ready = /^https:\/\/[\w-]+\.supabase\.co$/.test(apiBase) && config.supabaseAnonKey && !config.supabaseAnonKey.includes('YOUR_');
  const page = document.body.dataset.page;
  const sessionKey = 'alper-blog-session';
  let session = readSession();
  let currentPost = null;
  let saveTimer;

  function readSession() {
    try {
      const value = JSON.parse(localStorage.getItem(sessionKey) || 'null');
      if (value && value.expires_at * 1000 > Date.now()) return value;
    } catch (_) {}
    localStorage.removeItem(sessionKey);
    return null;
  }

  function storeSession(value) {
    if (!value.expires_at && value.expires_in) value.expires_at = Math.floor(Date.now() / 1000) + value.expires_in;
    session = value;
    localStorage.setItem(sessionKey, JSON.stringify(value));
  }

  async function api(path, options = {}, authenticated = false) {
    if (!ready) throw new Error('Yayın sistemi henüz yapılandırılmamış. Kurulum için blog/SETUP.md dosyasına bakın.');
    const headers = { apikey: config.supabaseAnonKey, 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (authenticated && session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const response = await fetch(`${apiBase}${path}`, { ...options, headers });
    const text = await response.text();
    const result = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(result?.msg || result?.message || result?.error_description || result?.hint || result?.details || result?.error || `İstek başarısız (${response.status})`);
    return result;
  }

  function showNotice(message, isError = false) {
    const el = document.querySelector('[data-notice]');
    if (el) { el.textContent = message; el.classList.toggle('error', isError); el.hidden = !message; }
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function inlineMarkdown(text) {
    let out = escapeHtml(text);
    out = out.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
    out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return out;
  }

  function markdown(source) {
    const textBlocks = text => text.split(/\n\s*\n/).map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
      if (heading) { const level = heading[1].length; return `<h${level}>${inlineMarkdown(heading[2])}</h${level}>`; }
      if (/^([-*_])\1\1+$/.test(trimmed)) return '<hr>';
      if (/^>\s?/.test(trimmed)) return `<blockquote>${trimmed.split('\n').map(line => `<p>${inlineMarkdown(line.replace(/^>\s?/, ''))}</p>`).join('')}</blockquote>`;
      const tableLines = trimmed.split('\n');
      if (tableLines.length > 1 && /^\|?\s*:?-{3,}/.test(tableLines[1])) {
        const cells = line => line.replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
        const header = cells(tableLines[0]);
        const body = tableLines.slice(2).filter(line => line.includes('|')).map(cells);
        return `<table><thead><tr>${header.map(cell => `<th>${inlineMarkdown(cell)}</th>`).join('')}</tr></thead><tbody>${body.map(row => `<tr>${header.map((_, index) => `<td>${inlineMarkdown(row[index] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      }
      if (/^(?:[-*+]\s|\d+\.\s)/.test(trimmed)) {
        const lines = trimmed.split('\n');
        const ordered = /^\d+\./.test(lines[0]);
        const tag = ordered ? 'ol' : 'ul';
        return `<${tag}>${lines.map(line => `<li>${inlineMarkdown(line.replace(/^(?:[-*+]\s|\d+\.\s)/, ''))}</li>`).join('')}</${tag}>`;
      }
      return `<p>${trimmed.split('\n').map(inlineMarkdown).join('<br>')}</p>`;
    }).join('\n');

    const content = String(source || '').replace(/\r/g, '');
    const codeBlocks = /(`{3,})([^\n]*)\n([\s\S]*?)\n\1/g;
    let html = '';
    let cursor = 0;
    let match;
    while ((match = codeBlocks.exec(content))) {
      html += textBlocks(content.slice(cursor, match.index));
      const language = match[2].trim();
      const languageAttribute = /^[a-z0-9_+-]{1,24}$/i.test(language) ? ` data-language="${language}"` : '';
      html += `<pre${languageAttribute}><code>${escapeHtml(match[3])}</code></pre>`;
      cursor = codeBlocks.lastIndex;
    }
    return html + textBlocks(content.slice(cursor));
  }

  function sanitizeRichHtml(source) {
    const parsed = new DOMParser().parseFromString(String(source || ''), 'text/html');
    const allowedTags = new Set(['p', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'mark', 'blockquote', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'hr', 'pre', 'code', 'a', 'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'sub', 'sup']);
    const removeContents = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'input', 'button', 'video', 'audio']);
    const styleRules = {
      'text-align': /^(left|right|center|justify|start|end)$/i,
      'font-weight': /^(normal|bold|[1-9]00)$/i,
      'font-style': /^(normal|italic|oblique)$/i,
      'text-decoration': /^(none|underline|line-through|overline)(\s+(none|underline|line-through|overline))*$/i,
      'font-size': /^(\d+(\.\d+)?(px|pt|em|rem|%)|small|medium|large|x-large|xx-large)$/i,
      color: /^(#[0-9a-f]{3,8}|[a-z]{1,20}|rgba?\([\d\s.,%]+\))$/i,
      'background-color': /^(#[0-9a-f]{3,8}|[a-z]{1,20}|rgba?\([\d\s.,%]+\))$/i,
    };
    const elements = Array.from(parsed.body.querySelectorAll('*')).reverse();
    for (const element of elements) {
      const tag = element.tagName.toLowerCase();
      if (!allowedTags.has(tag)) {
        if (removeContents.has(tag)) element.remove();
        else element.replaceWith(...element.childNodes);
        continue;
      }
      for (const attribute of Array.from(element.attributes)) {
        const name = attribute.name.toLowerCase();
        if (name === 'style') {
          const safeStyles = [];
          for (const declaration of attribute.value.split(';')) {
            const separator = declaration.indexOf(':');
            if (separator < 1) continue;
            const property = declaration.slice(0, separator).trim().toLowerCase();
            const value = declaration.slice(separator + 1).trim();
            if (styleRules[property]?.test(value)) safeStyles.push(`${property}: ${value}`);
          }
          if (safeStyles.length) element.setAttribute('style', safeStyles.join('; '));
          else element.removeAttribute('style');
          continue;
        }
        if (name === 'href' && tag === 'a') {
          try {
            const url = new URL(attribute.value, location.href);
            if (!['https:', 'http:'].includes(url.protocol)) element.removeAttribute(name);
            else element.setAttribute(name, url.href);
          } catch (_) { element.removeAttribute(name); }
          continue;
        }
        if (name === 'src' && tag === 'img') {
          try {
            const url = new URL(attribute.value, location.href);
            if (url.protocol !== 'https:') element.removeAttribute(name);
            else element.setAttribute(name, url.href);
          } catch (_) { element.removeAttribute(name); }
          continue;
        }
        if (name === 'class' && tag === 'code' && /^language-[a-z0-9_+-]{1,24}$/i.test(attribute.value)) continue;
        if (['alt', 'title'].includes(name) && ['img', 'a', 'span', 'code', 'th', 'td'].includes(tag)) continue;
        if (['width', 'height', 'colspan', 'rowspan', 'start'].includes(name) && /^\d{1,4}$/.test(attribute.value) && ['img', 'th', 'td', 'ol'].includes(tag)) continue;
        element.removeAttribute(name);
      }
      if (tag === 'a' && element.hasAttribute('href')) {
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener noreferrer');
      }
      if (tag === 'pre') {
        const language = element.querySelector('code')?.className.match(/(?:language-|lang-)([a-z0-9_+-]{1,24})/i)?.[1];
        if (language) element.setAttribute('data-language', language);
      }
      if (tag === 'img') element.setAttribute('loading', 'lazy');
    }
    return parsed.body.innerHTML;
  }

  function renderContent(source) {
    const content = String(source || '');
    if (content.startsWith(richContentPrefix)) return sanitizeRichHtml(content.slice(richContentPrefix.length));
    return markdown(content);
  }

  function editorContent(source) {
    const content = String(source || '');
    if (content.startsWith(richContentPrefix)) return sanitizeRichHtml(content.slice(richContentPrefix.length));
    return markdown(content);
  }

  function slugify(text) {
    return String(text || '').toLocaleLowerCase('tr').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'yeni-yazi';
  }

  function dateLabel(value) {
    return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
  }

  async function loadPosts() {
    const list = document.querySelector('[data-post-list]');
    const count = document.querySelector('[data-post-count]');
    let posts = [];
    let loadFailed = false;
    try {
      posts = await api('/rest/v1/blog_posts?select=slug,title,excerpt,content,published_at&status=eq.published&order=published_at.desc');
    } catch (error) {
      console.warn('Blog posts could not be loaded:', error.message);
      loadFailed = true;
    }

    const search = document.querySelector('[data-search]');
    const render = () => {
      const query = search.value.trim().toLocaleLowerCase('tr');
      const visiblePosts = posts.filter(post => `${post.title} ${post.excerpt} ${post.content}`.toLocaleLowerCase('tr').includes(query));
      count.textContent = visiblePosts.length ? `${visiblePosts.length} yazı` : '';
      if (!visiblePosts.length) {
        const isSearch = Boolean(query);
        const title = loadFailed ? 'Yazılar şu an yüklenemiyor.' : isSearch ? 'Bir şey bulamadık.' : 'İlk yazı yolda.';
        const message = loadFailed ? 'Biraz sonra yeniden deneyebilirsin.' : isSearch ? 'Başka bir kelimeyle aramayı deneyebilirsin.' : 'Alper yeni yazılar hazırlıyor. Yayınlandıklarında burada görebilirsin.';
        list.innerHTML = `<div class="empty-state"><div class="empty-art" aria-hidden="true">${loadFailed ? '↻' : isSearch ? '⌕' : '✳'}</div><h3>${title}</h3><p>${message}</p>${isSearch && !loadFailed ? '<button class="text-link clear-search" type="button" data-clear-search>Aramayı temizle <span aria-hidden="true">→</span></button>' : '<a class="text-link" href="../">Ana sayfaya dön <span aria-hidden="true">→</span></a>'}</div>`;
        list.querySelector('[data-clear-search]')?.addEventListener('click', () => { search.value = ''; render(); search.focus(); });
        return;
      }
      list.innerHTML = visiblePosts.map((post, index) => {
        const plainContent = document.createElement('div');
        const rawContent = String(post.content || '');
        plainContent.innerHTML = rawContent.startsWith(richContentPrefix) ? sanitizeRichHtml(rawContent.slice(richContentPrefix.length)) : escapeHtml(rawContent);
        const words = (plainContent.textContent || '').trim().split(/\s+/).filter(Boolean).length;
        const minutes = Math.max(1, Math.ceil(words / 220));
        return `<a class="post-card${index === 0 ? ' post-card-featured' : ''}" href="post.html?slug=${encodeURIComponent(post.slug)}"><div class="post-byline"><span class="mini-avatar">a</span><span>Alper Calisir</span><span class="meta-dot">·</span><time datetime="${escapeHtml(post.published_at)}">${dateLabel(post.published_at)}</time></div><h3>${escapeHtml(post.title)}</h3><p class="post-excerpt">${escapeHtml(post.excerpt || '')}</p><div class="post-card-bottom"><span class="read-time">${minutes} dk okuma</span><span class="read-more">Yazıyı oku <span aria-hidden="true">→</span></span></div></a>`;
      }).join('');
    };
    search.addEventListener('input', render);
    render();
  }

  async function loadPost() {
    const slug = new URLSearchParams(location.search).get('slug');
    const root = document.querySelector('[data-article]');
    if (!slug) { root.innerHTML = '<p class="empty">Yazı bulunamadı.</p>'; return; }
    try {
      const posts = await api(`/rest/v1/blog_posts?select=title,excerpt,content,published_at&slug=eq.${encodeURIComponent(slug)}&status=eq.published&limit=1`);
      if (!posts.length) throw new Error('Bu yazı bulunamadı.');
      const post = posts[0];
      document.title = `${post.title} — Alper’in yazıları`;
      root.innerHTML = `<div class="eyebrow">Alper’in yazıları</div><h1>${escapeHtml(post.title)}</h1><p class="lead">${escapeHtml(post.excerpt)}</p><div class="meta">${dateLabel(post.published_at)}</div><div class="article-body">${renderContent(post.content)}</div>`;
    } catch (error) { root.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`; }
  }

  function setEditorMode(mode) {
    const editor = document.querySelector('[data-editor-body]');
    const preview = document.querySelector('[data-preview]');
    const editing = mode === 'write';
    editor.hidden = !editing;
    preview.hidden = editing;
    if (!editing) preview.innerHTML = renderContent(richContentPrefix + sanitizeRichHtml(editor.innerHTML));
    document.querySelectorAll('[data-mode]').forEach(button => button.classList.toggle('active', button.dataset.mode === mode));
  }

  function insertFormatting(format) {
    const editor = document.querySelector('[data-editor-body]');
    editor.focus();
    if (format === 'bold' || format === 'italic') {
      document.execCommand(format, false);
    } else {
      const selection = window.getSelection();
      let range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      if (!range || !editor.contains(range.commonAncestorContainer)) {
        range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
      }
      const selectedText = range.toString();
      const content = selectedText || (format === 'code-block' ? 'kodu buraya yaz' : 'code');
      const wrapper = format === 'code-block' ? document.createElement('pre') : document.createElement('code');
      const code = format === 'code-block' ? document.createElement('code') : wrapper;
      if (format === 'code-block') wrapper.appendChild(code);
      code.textContent = content;
      range.deleteContents();
      range.insertNode(wrapper);
      range.selectNodeContents(code);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function pasteRichText(event) {
    const clipboardHtml = event.clipboardData?.getData('text/html');
    if (!clipboardHtml) return;
    const safeHtml = sanitizeRichHtml(clipboardHtml);
    if (!safeHtml) return;
    event.preventDefault();
    const editor = event.currentTarget;
    const selection = window.getSelection();
    let range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || !editor.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    range.deleteContents();
    const parsed = new DOMParser().parseFromString(safeHtml, 'text/html');
    const fragment = document.createDocumentFragment();
    while (parsed.body.firstChild) fragment.appendChild(parsed.body.firstChild);
    const lastInserted = fragment.lastChild;
    range.insertNode(fragment);
    if (lastInserted) range.setStartAfter(lastInserted);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function readDraft() {
    try { return JSON.parse(localStorage.getItem('alper-blog-draft') || 'null'); } catch (_) { return null; }
  }

  function formValues() {
    const title = document.querySelector('[data-title]').value.trim();
    const editor = document.querySelector('[data-editor-body]');
    return { title, excerpt: document.querySelector('[data-excerpt]').value.trim(), content: richContentPrefix + sanitizeRichHtml(editor.innerHTML), slug: slugify(title) };
  }

  function collectDraft() {
    const data = formValues();
    localStorage.setItem('alper-blog-draft', JSON.stringify({ ...data, id: currentPost?.id || null, saved_at: new Date().toISOString() }));
    const state = document.querySelector('[data-save-state]');
    if (state) state.textContent = 'Taslak bu cihazda kaydedildi';
  }

  function queueDraft() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(collectDraft, 350);
  }

  async function savePost(publish) {
    if (!session?.user?.id) throw new Error('Önce giriş yapın.');
    const post = formValues();
    if (!post.title) throw new Error('Yayınlamak için başlık ekleyin.');
    if (publish && !post.content.trim()) throw new Error('Yayınlamak için yazı içeriği ekleyin.');
    const now = new Date().toISOString();
    const payload = { ...post, author_id: session.user.id, status: publish ? 'published' : 'draft', updated_at: now };
    if (publish) payload.published_at = currentPost?.published_at || now;
    const saved = await api(`/rest/v1/blog_posts${currentPost?.id ? `?id=eq.${currentPost.id}` : ''}`, {
      method: currentPost?.id ? 'PATCH' : 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    }, true);
    currentPost = Array.isArray(saved) ? saved[0] : saved;
    if (publish) localStorage.removeItem('alper-blog-draft');
    else localStorage.setItem('alper-blog-draft', JSON.stringify({ ...post, id: currentPost.id, saved_at: now }));
    return currentPost;
  }

  async function initWriter() {
    const loginPanel = document.querySelector('[data-login-panel]');
    const writerPanel = document.querySelector('[data-writer-panel]');
    if (!ready) showNotice('Yayın sistemi kuruluma hazır değil. Supabase ayarlarını blog/config.js dosyasına girin ve blog/setup.sql dosyasını çalıştırın.', true);
    if (session?.user?.id) {
      loginPanel.hidden = true;
      writerPanel.hidden = false;
      document.querySelector('[data-logout]').hidden = false;
      const user = document.querySelector('[data-user]');
      user.textContent = session.user.email || 'Giriş yapıldı';
      const params = new URLSearchParams(location.search);
      const id = params.get('id');
      if (id) {
        const posts = await api(`/rest/v1/blog_posts?select=*&id=eq.${encodeURIComponent(id)}&limit=1`, {}, true);
        currentPost = posts[0] || null;
      }
      const draft = readDraft();
      if (!currentPost && draft) currentPost = draft.id ? { id: draft.id } : null;
      const data = currentPost?.title ? currentPost : draft;
      if (data) {
        document.querySelector('[data-title]').value = data.title || '';
        document.querySelector('[data-excerpt]').value = data.excerpt || '';
        document.querySelector('[data-editor-body]').innerHTML = editorContent(data.content || '');
      }
      await loadDashboardPosts();
    } else {
      loginPanel.hidden = false;
      writerPanel.hidden = true;
    }
  }

  async function loadDashboardPosts() {
    const root = document.querySelector('[data-dashboard-posts]');
    try {
      const posts = await api('/rest/v1/blog_posts?select=id,title,status,updated_at&order=updated_at.desc', {}, true);
      root.innerHTML = posts.length ? posts.map(post => `<a class="post-card" href="write.html?id=${encodeURIComponent(post.id)}"><h2>${escapeHtml(post.title || 'Başlıksız yazı')}</h2><span class="meta">${post.status === 'published' ? 'Yayında' : 'Taslak'} · ${dateLabel(post.updated_at)}</span></a>`).join('') : '<p class="empty">Henüz yazı yok. İlk yazını yukarıdan başlat.</p>';
    } catch (error) { showNotice(error.message, true); }
  }

  async function signIn(event) {
    event.preventDefault();
    const email = document.querySelector('[name=email]').value.trim();
    const password = document.querySelector('[name=password]').value;
    try {
      showNotice('Giriş yapılıyor…');
      const result = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
      storeSession(result);
      showNotice('Giriş başarılı.');
      await initWriter();
    } catch (error) { showNotice(error.message, true); }
  }

  if (page === 'list') loadPosts();
  if (page === 'post') loadPost();
  if (page === 'write') {
    initWriter().catch(error => showNotice(error.message, true));
    document.querySelector('[data-login-form]').addEventListener('submit', signIn);
    document.querySelector('[data-logout]').addEventListener('click', async () => {
      try { await api('/auth/v1/logout', { method: 'POST' }, true); } catch (_) {}
      localStorage.removeItem(sessionKey); session = null; currentPost = null; location.reload();
    });
    document.querySelector('[data-new]').addEventListener('click', () => { currentPost = null; localStorage.removeItem('alper-blog-draft'); document.querySelector('[data-title]').value = ''; document.querySelector('[data-excerpt]').value = ''; document.querySelector('[data-editor-body]').innerHTML = ''; history.replaceState(null, '', 'write.html'); document.querySelector('[data-title]').focus(); });
    document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setEditorMode(button.dataset.mode)));
    document.querySelectorAll('[data-format]').forEach(button => button.addEventListener('click', () => insertFormatting(button.dataset.format)));
    document.querySelectorAll('[data-title], [data-excerpt], [data-editor-body]').forEach(input => input.addEventListener('input', queueDraft));
    document.querySelector('[data-editor-body]').addEventListener('paste', pasteRichText);
    document.querySelectorAll('[data-format]').forEach(button => button.addEventListener('mousedown', event => event.preventDefault()));
    document.querySelector('[data-save]').addEventListener('click', async () => {
      try { await savePost(false); showNotice('Taslak hesabınıza kaydedildi.'); await loadDashboardPosts(); }
      catch (error) { collectDraft(); showNotice(`${error.message} Taslak bu cihazda saklandı.`, true); }
    });
    document.querySelector('[data-publish]').addEventListener('click', async () => {
      try { const post = await savePost(true); showNotice('Yazı yayınlandı.'); await loadDashboardPosts(); if (post) { const open = document.querySelector('[data-open-post]'); open.href = `post.html?slug=${encodeURIComponent(post.slug)}`; open.hidden = false; } }
      catch (error) { collectDraft(); showNotice(`${error.message} Taslak bu cihazda saklandı.`, true); }
    });
  }
})();
