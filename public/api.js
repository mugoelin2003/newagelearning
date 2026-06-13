/**
 * New Age Learning — front-end API client
 * ---------------------------------------
 * One small module every front end (public site, learner, educator,
 * institution, admin) uses to talk to the backend. Drop it in, set the
 * two config values, and call the methods.
 *
 *   <script src="api.js"></script>
 *   NAL.config({ base: 'https://api.newagelearning.in', mock: false });
 *   const items = await NAL.content.list();
 *
 * Every method maps 1:1 to an endpoint in api-reference.md.
 * While mock:true, calls resolve against in-memory sample data so the
 * screens work with no server. Flip mock:false to go live — no other
 * code changes needed.
 */
(function (global) {
  let BASE = 'https://api.newagelearning.in';
  let MOCK = true;
  let TOKEN = null;

  function config({ base, mock, token } = {}) {
    if (base !== undefined) BASE = base;
    if (mock !== undefined) MOCK = mock;
    if (token !== undefined) TOKEN = token;
  }

  async function http(path, { method = 'GET', body, form } = {}) {
    const headers = {};
    if (TOKEN) headers.Authorization = 'Bearer ' + TOKEN;
    let payload;
    if (form) { payload = form; }                       // FormData (file uploads)
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(BASE + path, { method, headers, body: payload });
    if (!res.ok) throw new Error('API ' + res.status + ' ' + path);
    return res.status === 204 ? null : res.json();
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---- mock data (only used while MOCK = true) ----
  const M = {
    content: [
      { id: 1, title: 'Smart Money for Teens', age_group: 'Grades 8–12', formats: ['pdf', 'audio'] },
      { id: 2, title: 'AI for Curious Kids', age_group: 'Ages 8–12', formats: ['pdf', 'audio', 'video'] },
      { id: 3, title: 'Future Skills Playbook', age_group: 'Professional', formats: ['pdf', 'video'] },
    ],
    signupFields: [
      { field_key: 'name', label: 'Name', type: 'text', is_mandatory: true },
      { field_key: 'mobile', label: 'Mobile number', type: 'number', is_mandatory: true },
      { field_key: 'city', label: 'City', type: 'text', is_mandatory: false },
      { field_key: 'state', label: 'State', type: 'dropdown', options: ['Karnataka', 'Maharashtra', 'Delhi'], is_mandatory: false },
      { field_key: 'interest', label: 'Interested in', type: 'dropdown', options: ['AI', 'Smart money', 'Exam prep'], is_mandatory: false },
    ],
    appearance: [
      { block_key: 'home.hero.headline', type: 'text', text_value: 'Learning that helps young India lead the world.' },
    ],
    branding: [{ placement: 'header', image_url: null }, { placement: 'footer', image_url: null }],
    wishlist: [], progress: {},
  };
  async function mock(v) { await sleep(150); return v; }

  // ===================================================================
  //  API SURFACE
  // ===================================================================
  const NAL = {
    config,
    setToken: (t) => (TOKEN = t),

    auth: {
      signup: (data) => MOCK ? mock({ token: 'mock', user: { id: 'u1', ...data } })
        : http('/api/auth/signup', { method: 'POST', body: data }),
      login: (data) => MOCK ? mock({ token: 'mock', user: { id: 'u1', name: data.mobile || data.email } })
        : http('/api/auth/login', { method: 'POST', body: data }),
      me: () => MOCK ? mock({ id: 'u1', role: 'learner', name: 'Asha R' }) : http('/api/auth/me'),
    },

    catalog: {
      tree: () => MOCK ? mock([]) : http('/api/catalog'),
      add: (node) => http('/api/admin/catalog', { method: 'POST', body: node }),
      remove: (id) => http('/api/admin/catalog/' + id, { method: 'DELETE' }),
    },

    content: {
      list: () => MOCK ? mock(M.content) : http('/api/content'),                       // public
      get: (id) => MOCK ? mock(M.content.find((c) => c.id === id)) : http('/api/content/' + id),
      adminList: () => http('/api/admin/content'),
      create: (data) => http('/api/admin/content', { method: 'POST', body: data }),
      update: (id, data) => http('/api/admin/content/' + id, { method: 'PATCH', body: data }),
      remove: (id) => http('/api/admin/content/' + id, { method: 'DELETE' }),
      uploadFile: (id, kind, file) => { const f = new FormData(); f.append('kind', kind); f.append('file', file); return http('/api/admin/content/' + id + '/files', { method: 'POST', form: f }); },
    },

    approvals: {
      pendingContent: () => http('/api/admin/approvals/content'),
      approveContent: (id) => http('/api/admin/approvals/content/' + id + '/approve', { method: 'POST' }),
      rejectContent: (id) => http('/api/admin/approvals/content/' + id + '/reject', { method: 'POST' }),
      pendingBlogs: () => http('/api/admin/approvals/blogs'),
      approveBlog: (id) => http('/api/admin/approvals/blogs/' + id + '/approve', { method: 'POST' }),
      rejectBlog: (id) => http('/api/admin/approvals/blogs/' + id + '/reject', { method: 'POST' }),
    },

    educator: {
      submitContent: (data) => MOCK ? mock({ ...data, status: 'pending' }) : http('/api/educator/content', { method: 'POST', body: data }),
    },

    blogs: {
      list: () => MOCK ? mock([]) : http('/api/blogs'),
      get: (slug) => http('/api/blogs/' + slug),
      create: (data) => http('/api/admin/blogs', { method: 'POST', body: data }),
    },

    signupFields: {
      list: () => MOCK ? mock(M.signupFields) : http('/api/signup-fields'),            // public
      adminList: () => http('/api/admin/signup-fields'),
      add: (data) => http('/api/admin/signup-fields', { method: 'POST', body: data }),
      update: (id, data) => http('/api/admin/signup-fields/' + id, { method: 'PATCH', body: data }),
      remove: (id) => http('/api/admin/signup-fields/' + id, { method: 'DELETE' }),
    },

    branding: {
      list: () => MOCK ? mock(M.branding) : http('/api/branding'),
      set: (placement, file) => { const f = new FormData(); f.append('file', file); return http('/api/admin/branding/' + placement, { method: 'PUT', form: f }); },
    },
    appearance: {
      list: () => MOCK ? mock(M.appearance) : http('/api/appearance'),
      set: (key, data) => http('/api/admin/appearance/' + key, { method: 'PUT', body: data }),
    },

    me: {                                                                              // learner personalisation
      wishlist: () => MOCK ? mock(M.wishlist) : http('/api/me/wishlist'),
      addWishlist: (id) => MOCK ? mock((M.wishlist.push(id), true)) : http('/api/me/wishlist/' + id, { method: 'POST' }),
      removeWishlist: (id) => MOCK ? mock((M.wishlist = M.wishlist.filter((x) => x !== id), true)) : http('/api/me/wishlist/' + id, { method: 'DELETE' }),
      getProgress: (id) => MOCK ? mock(M.progress[id] || { percent: 0 }) : http('/api/me/progress/' + id),
      saveProgress: (id, data) => { M.progress[id] = data; return MOCK ? mock(true) : http('/api/me/progress/' + id, { method: 'PUT', body: data }); },
    },

    events: { log: (event_type, content_id, metadata) => MOCK ? Promise.resolve() : http('/api/events', { method: 'POST', body: { event_type, content_id, metadata } }) },

    contact: { send: (data) => MOCK ? mock({ ok: true }) : http('/api/contact', { method: 'POST', body: data }) },

    campaigns: { send: (data) => http('/api/admin/campaigns', { method: 'POST', body: data }) },
  };

  global.NAL = NAL;
  if (typeof module !== 'undefined') module.exports = NAL;
})(typeof window !== 'undefined' ? window : globalThis);
