const normalize = value => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

export function searchSections(sections, query, limit = 8) {
  const phrase = normalize(query.slice(0, 120)).trim();
  const terms = [...new Set(phrase.match(/[\p{L}\p{N}_-]+/gu) || [])].slice(0, 12);
  if (phrase.length < 2 || !terms.length) return [];
  return sections.flatMap(section => {
    const title = normalize(section.title), heading = normalize(section.section);
    const text = normalize(section.text), combined = `${title} ${heading} ${text}`;
    if (!terms.every(term => combined.includes(term))) return [];
    const score = (heading === phrase ? 100 : 0) + (title === phrase ? 80 : 0)
      + terms.reduce((total, term) => total + (heading.includes(term) ? 12 : 0) + (title.includes(term) ? 6 : 0), 0)
      + (text.includes(phrase) ? 4 : 0);
    const position = Math.max(0, text.indexOf(terms[0]));
    const start = Math.max(0, position - 45);
    const excerpt = (start ? '…' : '') + section.text.slice(start, start + 180) + (section.text.length > start + 180 ? '…' : '');
    return [{...section, score, excerpt}];
  }).sort((a, b) => b.score - a.score || a.url.localeCompare(b.url)).slice(0, limit);
}

function validSections(value) {
  if (!Array.isArray(value) || value.length > 5000) throw Error('Invalid search index');
  return value.filter(item => item && ['title', 'section', 'url', 'text'].every(key => typeof item[key] === 'string')
    && /^\/(?!\/)[a-z0-9/._-]*(?:#[^\s\\]*)?$/.test(item.url));
}

export function mountSearch(document, loadIndex) {
  const root = document.getElementById('doc-search');
  if (!root) return;
  const input = document.getElementById('docs-query');
  const status = document.getElementById('search-status');
  const results = document.getElementById('search-results');
  const clear = document.getElementById('search-clear');
  const retry = document.getElementById('search-retry');
  let index, pending, generation = 0;
  root.hidden = false;

  async function update() {
    const current = ++generation;
    const query = input.value.trim();
    clear.hidden = !input.value;
    retry.hidden = true;
    results.replaceChildren();
    results.hidden = true;
    if (query.length < 2) {
      status.textContent = query ? 'Type at least two characters.' : 'Search guides and reference sections.';
      root.removeAttribute('aria-busy');
      return;
    }
    status.textContent = 'Searching…';
    root.setAttribute('aria-busy', 'true');
    try {
      pending ||= loadIndex().then(validSections);
      index ||= await pending;
      if (current !== generation) return;
      const matches = searchSections(index, query);
      for (const match of matches) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = match.url;
        const title = document.createElement('strong');
        title.textContent = match.section || match.title;
        const location = document.createElement('span');
        location.className = 'search-page';
        location.textContent = match.title;
        const excerpt = document.createElement('span');
        excerpt.className = 'search-excerpt';
        excerpt.textContent = match.excerpt;
        link.append(title, location, excerpt);
        item.append(link);
        results.append(item);
      }
      results.hidden = !matches.length;
      status.textContent = matches.length ? `${matches.length === 8 ? 'Top 8' : matches.length} matching ${matches.length === 1 ? 'section' : 'sections'}.`
        : 'No matching sections. Try another term or browse all documentation.';
    } catch {
      pending = undefined;
      if (current !== generation) return;
      status.textContent = 'Search could not load. Retry or use the documentation links.';
      retry.hidden = false;
    } finally {
      if (current === generation) root.removeAttribute('aria-busy');
    }
  }

  input.addEventListener('input', update);
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      input.value = '';
      void update();
    } else if (event.key === 'ArrowDown' && results.firstElementChild) {
      event.preventDefault();
      results.querySelector('a').focus();
    }
  });
  clear.addEventListener('click', () => { input.value = ''; void update(); input.focus(); });
  retry.addEventListener('click', () => { void update(); });
}

if (typeof document !== 'undefined') {
  mountSearch(document, async () => {
    const response = await fetch('/assets/search-index.json', {credentials: 'omit'});
    if (!response.ok) throw Error('Search unavailable');
    return response.json();
  });
}
