(function () {
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
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return out;
  }

  function markdown(source) {
    const blocks = String(source || '').replace(/\r/g, '').split(/\n\s*\n/);
    return blocks.map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      const code = trimmed.match(/^```([^\n]*)\n([\s\S]*?)\n```$/);
      if (code) return `<pre><code>${escapeHtml(code[2])}</code></pre>`;
      const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
      if (heading) { const level = heading[1].length; return `<h${level}>${inlineMarkdown(heading[2])}</h${level}>`; }
      if (/^([-*_])\1\1+$/.test(trimmed)) return '<hr>';
      if (/^(?:[-*+]\s|\d+\.\s)/.test(trimmed)) {
        const lines = trimmed.split('\n');
        const ordered = /^\d+\./.test(lines[0]);
        const tag = ordered ? 'ol' : 'ul';
        return `<${tag}>${lines.map(line => `<li>${inlineMarkdown(line.replace(/^(?:[-*+]\s|\d+\.\s)/, ''))}</li>`).join('')}</${tag}>`;
      }
      return `<p>${trimmed.split('\n').map(inlineMarkdown).join('<br>')}</p>`;
    }).join('\n');
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
        const words = `${post.content || ''}`.trim().split(/\s+/).filter(Boolean).length;
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
      root.innerHTML = `<div class="eyebrow">Alper’in yazıları</div><h1>${escapeHtml(post.title)}</h1><p class="lead">${escapeHtml(post.excerpt)}</p><div class="meta">${dateLabel(post.published_at)}</div><div class="article-body">${markdown(post.content)}</div>`;
    } catch (error) { root.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`; }
  }

  function setEditorMode(mode) {
    const editor = document.querySelector('[data-editor-body]');
    const preview = document.querySelector('[data-preview]');
    const editing = mode === 'write';
    editor.hidden = !editing;
    preview.hidden = editing;
    if (!editing) preview.innerHTML = markdown(editor.value);
    document.querySelectorAll('[data-mode]').forEach(button => button.classList.toggle('active', button.dataset.mode === mode));
  }

  function readDraft() {
    try { return JSON.parse(localStorage.getItem('alper-blog-draft') || 'null'); } catch (_) { return null; }
  }

  function formValues() {
    const title = document.querySelector('[data-title]').value.trim();
    return { title, excerpt: document.querySelector('[data-excerpt]').value.trim(), content: document.querySelector('[data-editor-body]').value, slug: slugify(title) };
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
        document.querySelector('[data-editor-body]').value = data.content || '';
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
    document.querySelector('[data-new]').addEventListener('click', () => { currentPost = null; localStorage.removeItem('alper-blog-draft'); document.querySelector('[data-title]').value = ''; document.querySelector('[data-excerpt]').value = ''; document.querySelector('[data-editor-body]').value = ''; history.replaceState(null, '', 'write.html'); document.querySelector('[data-title]').focus(); });
    document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setEditorMode(button.dataset.mode)));
    document.querySelectorAll('[data-title], [data-excerpt], [data-editor-body]').forEach(input => input.addEventListener('input', queueDraft));
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
