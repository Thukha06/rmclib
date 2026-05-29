/* ====================================
   RMCLib — Main JavaScript
   YAML-driven · Image lightbox · Optimized
==================================== */

/* ────────────────────────────────────
   Minimal YAML parser
   Handles the subset used in songs.yaml:
   mappings, sequences, block scalars (| and >),
   quoted strings, numbers, booleans.
──────────────────────────────────── */
const YAML = (() => {

  function parse(text) {
    const lines = text.split('\n');
    const root = {};
    parseBlock(lines, 0, root, 0);
    return root;
  }

  function parseValue(raw) {
    const s = raw.trim();
    if (s === 'true')  return true;
    if (s === 'false') return false;
    if (s === 'null' || s === '~') return null;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    if ((s.startsWith('"') && s.endsWith('"')) ||
        (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1);
    }
    return s;
  }

  function getIndent(line) {
    return line.match(/^(\s*)/)[1].length;
  }

  // Collect block scalar (| or >) lines
  function collectBlockScalar(lines, startIdx, baseIndent, chomping) {
    const result = [];
    let i = startIdx;
    let scalarIndent = -1;
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === '') { result.push(''); i++; continue; }
      const ind = getIndent(line);
      if (scalarIndent === -1) scalarIndent = ind;
      if (ind < scalarIndent && line.trim() !== '') break;
      result.push(line.slice(scalarIndent));
      i++;
    }
    // Trim trailing blank lines for '>'
    if (chomping === '>') {
      while (result.length && result[result.length - 1] === '') result.pop();
      return result.join(' ').trim() + '\n';
    }
    // '|' keeps literal newlines
    while (result.length && result[result.length - 1] === '') result.pop();
    return result.join('\n') + '\n';
  }

  function parseBlock(lines, startIdx, target, baseIndent) {
    let i = startIdx;
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === '' || line.trim().startsWith('#')) { i++; continue; }

      const indent = getIndent(line);
      if (indent < baseIndent) break;

      const trimmed = line.trim();

      // Sequence item
      if (trimmed.startsWith('- ') || trimmed === '-') {
        if (!Array.isArray(target)) { i++; continue; }
        const rest = trimmed.slice(2).trim();
        if (rest === '' || rest.startsWith('#')) {
          // Block mapping inside sequence
          const item = {};
          target.push(item);
          i++;
          i = parseBlock(lines, i, item, indent + 2);
        } else if (rest.includes(': ')) {
          // Inline mapping start
          const item = {};
          target.push(item);
          const [k, ...vParts] = rest.split(': ');
          const v = vParts.join(': ').trim();
          if (v === '|' || v === '>') {
            const [scalar, next] = [collectBlockScalar(lines, i + 1, indent, v), 0];
            item[k.trim()] = scalar.trimEnd();
            // advance past scalar
            let si = i + 1;
            let scInd = -1;
            while (si < lines.length) {
              const sl = lines[si];
              if (sl.trim() === '') { si++; continue; }
              const sInd = getIndent(sl);
              if (scInd === -1) scInd = sInd;
              if (sInd < scInd && sl.trim() !== '') break;
              si++;
            }
            i = si;
            i = parseBlock(lines, i, item, indent + 2);
          } else {
            item[k.trim()] = parseValue(v);
            i++;
            i = parseBlock(lines, i, item, indent + 2);
          }
        } else {
          target.push(parseValue(rest));
          i++;
        }
        continue;
      }

      // Key: value mapping
      const colonIdx = trimmed.indexOf(': ');
      const colonEnd  = trimmed === trimmed.replace(/:\s*$/, '') ? -1 : trimmed.length - 1;
      if (colonIdx !== -1 || colonEnd !== -1) {
        const sepIdx = colonIdx !== -1 ? colonIdx : colonEnd;
        const rawKey = colonIdx !== -1 ? trimmed.slice(0, colonIdx) : trimmed.slice(0, colonEnd);
        const key = rawKey.trim().replace(/^['"]|['"]$/g, '');
        const rawVal = colonIdx !== -1 ? trimmed.slice(colonIdx + 2).trim() : '';

        if (rawVal === '|' || rawVal === '>') {
          target[key] = collectBlockScalar(lines, i + 1, indent, rawVal).trimEnd();
          // advance past scalar block
          let si = i + 1;
          let scInd = -1;
          while (si < lines.length) {
            const sl = lines[si];
            if (sl.trim() === '') { si++; continue; }
            const sInd = getIndent(sl);
            if (scInd === -1) scInd = sInd;
            if (sInd < scInd && sl.trim() !== '') break;
            si++;
          }
          i = si;
        } else if (rawVal === '' || rawVal.startsWith('#')) {
          // Look ahead to see if it's a mapping or sequence
          let nextMeaningful = i + 1;
          while (nextMeaningful < lines.length && lines[nextMeaningful].trim() === '') nextMeaningful++;
          if (nextMeaningful < lines.length) {
            const nextTrim = lines[nextMeaningful].trim();
            const nextIndent = getIndent(lines[nextMeaningful]);
            if (nextIndent > indent && nextTrim.startsWith('- ')) {
              target[key] = [];
              i++;
              i = parseBlock(lines, i, target[key], nextIndent);
            } else if (nextIndent > indent) {
              target[key] = {};
              i++;
              i = parseBlock(lines, i, target[key], nextIndent);
            } else {
              target[key] = null;
              i++;
            }
          } else {
            target[key] = null;
            i++;
          }
        } else {
          target[key] = parseValue(rawVal);
          i++;
        }
        continue;
      }

      i++;
    }
    return i;
  }

  return { parse };
})();

/* ────────────────────────────────────
   State
──────────────────────────────────── */
let allSongs = [];
let currentAudio = null;
let currentAudioBtn = null;
let localData = 'data/index.yaml';
let RemoteData = 'songs/index.yaml';

const CDN_BASE = 'https://cdn.jsdelivr.net/gh/Thukha06/rakhine-music-library/';

function asset(path) {
  return CDN_BASE + path;
}

/* ────────────────────────────────────
   Load songs from YAML
──────────────────────────────────── */
async function loadYaml() {
  const url = asset(RemoteData);

  try {
    const res = await fetch(url);

    if (!res.ok) throw new Error('CDN failed');

    const text = await res.text();
    return YAML.parse(text);

  } catch (err) {
    console.warn('Using local fallback...', err);

    const res = await fetch(localData);

    if (!res.ok) {
      throw new Error('Both CDN and local YAML failed');
    }

    const text = await res.text();
    return YAML.parse(text);
  }
}

async function loadSongs() {
  const grid = document.querySelector('.songs-grid');
  // Show skeleton loaders
  grid.innerHTML = Array(6).fill(0).map(() => `
    <div class="song-card skeleton-card">
      <div class="skeleton-img"></div>
      <div class="card-body">
        <div class="skeleton-line short"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line med"></div>
      </div>
    </div>`).join('');

  try {

    const data = await loadYaml();
    allSongs = data.songs || [];
    window._allSongsRef = allSongs;
    renderCards(allSongs);
    setupFilters();
    updateCount(allSongs.length);
  } catch (err) {
    console.error('YAML load error:', err);
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:80px 0;color:var(--text-dim);font-family:var(--font-mono);font-size:13px;">
        Failed to load songs.yaml. Run via a local HTTP server (not file://).
      </div>`;
  }
}

/* ────────────────────────────────────
   Render cards with progressive image loading
──────────────────────────────────── */
function renderCards(songs) {
  const grid = document.querySelector('.songs-grid');
  grid.innerHTML = '';
  if (!songs.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:80px 0;color:var(--text-dim);font-family:var(--font-mono);font-size:13px;">No songs match this filter.</div>`;
    return;
  }
  songs.forEach((song, i) => grid.appendChild(createCard(song, i)));
}

function createCard(song, index) {
  const el = document.createElement('article');
  el.className = 'song-card';
  el.style.animationDelay = `${index * 0.06}s`;
  el.setAttribute('role', 'listitem');

  const diffClass = `badge-${(song.difficulty || 'beginner').toLowerCase()}`;

  // Build image with skeleton + progressive load
  let imgHtml;
  if (song.coverImage) {
    imgHtml = `
      <div class="card-img-skeleton" aria-hidden="true"></div>
      <img
        class="card-img-real"
        data-src="${song.coverImage}"
        alt="${song.title}"
        loading="lazy"
      >`;
  } else {
    imgHtml = `<div class="card-image-placeholder"><span class="placeholder-note">${song.key || '♩'}</span></div>`;
  }

  el.innerHTML = `
    <div class="card-image-wrap">
      ${imgHtml}
      <span class="card-badge ${diffClass}">${song.difficulty || 'Beginner'}</span>
    </div>
    <div class="card-body">
      <div class="card-artist">${song.artist || ''}</div>
      <h3 class="card-title">${song.title}</h3>
      <p class="card-desc">${song.description || ''}</p>
      <div class="card-footer">
        <div class="card-meta">
          <span class="meta-item"><span class="meta-icon">♩</span>${song.key || '—'}</span>
          <span class="meta-item"><span class="meta-icon">♪</span>${song.bpm ? song.bpm + ' BPM' : '—'}</span>
          <span class="meta-item"><span class="meta-icon">◈</span>${song.genre || '—'}</span>
        </div>
        <div class="card-arrow">→</div>
      </div>
    </div>`;

  // Progressive image load
  const img = el.querySelector('.card-img-real');
  const skeleton = el.querySelector('.card-img-skeleton');
  if (img) {
    observeImage(img, skeleton);
  }

  el.addEventListener('click', () => openDetail(song));
  return el;
}

/* ── Intersection Observer for lazy images ── */
const imgObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const img = entry.target;
    const skeleton = img.previousElementSibling;
    img.src = img.dataset.src;
    img.onload = () => {
      img.classList.add('loaded');
      if (skeleton) skeleton.style.opacity = '0';
    };
    img.onerror = () => {
      img.style.display = 'none';
      if (skeleton) {
        skeleton.innerHTML = `<span class="placeholder-note" style="font-family:var(--font-display);font-size:64px;font-weight:900;color:var(--border-light);">${img.alt?.charAt(0) || '♩'}</span>`;
        skeleton.style.display = 'flex';
        skeleton.style.alignItems = 'center';
        skeleton.style.justifyContent = 'center';
        skeleton.style.opacity = '1';
        skeleton.style.background = 'linear-gradient(135deg,var(--bg-3) 0%,var(--bg-2) 100%)';
      }
    };
    imgObserver.unobserve(img);
  });
}, { rootMargin: '200px' });

function observeImage(img, skeleton) {
  imgObserver.observe(img);
}

/* ────────────────────────────────────
   Filters
──────────────────────────────────── */
function setupFilters() {
  const bar = document.querySelector('.filter-bar');
  const genres = ['All', ...new Set(allSongs.map(s => s.genre).filter(Boolean))];
  const difficulties = [...new Set(allSongs.map(s => s.difficulty).filter(Boolean))];

  bar.innerHTML = '';
  [...genres, ...difficulties].forEach(label => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn' + (label === 'All' ? ' active' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => applyFilter(label, btn));
    bar.appendChild(btn);
  });
}

function applyFilter(label, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const filtered = label === 'All'
    ? allSongs
    : allSongs.filter(s => s.genre === label || s.difficulty === label);
  renderCards(filtered);
  updateCount(filtered.length);
}

function updateCount(count) {
  const el = document.querySelector('.section-count');
  if (el) el.textContent = `${count} song${count !== 1 ? 's' : ''}`;
}

/* ────────────────────────────────────
   Detail Panel
──────────────────────────────────── */
function openDetail(song) {
  stopCurrentAudio();
  const overlay = document.getElementById('songDetailOverlay');
  const body = document.getElementById('panelBody');
  body.innerHTML = buildPanelContent(song);
  setupAudioPlayers();
  setupPanelImages();
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  body.scrollTop = 0;
}

function closeDetail() {
  stopCurrentAudio();
  document.getElementById('songDetailOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function buildPanelContent(song) {
  const coverHtml = song.coverImage
    ? `<div class="panel-img-skeleton"></div>
       <img class="panel-cover-img" data-src="${song.coverImage}" alt="${song.title}">`
    : `<div class="panel-cover-placeholder"><span>${song.key || '♩'}</span></div>`;

  const sections = (song.sections || []).map(sec => buildSection(sec)).join('');

  return `
    <div class="panel-cover">
      ${coverHtml}
      <div class="panel-cover-overlay"></div>
      <div class="panel-cover-info">
        <div class="panel-artist">${song.artist || ''}</div>
        <h2 class="panel-title">${song.title}</h2>
      </div>
    </div>
    <div class="panel-meta-strip">
      <div class="meta-strip-item"><span class="msi-label">Key</span><span class="msi-value">${song.key || '—'}</span></div>
      <div class="meta-strip-item"><span class="msi-label">BPM</span><span class="msi-value">${song.bpm || '—'}</span></div>
      <div class="meta-strip-item"><span class="msi-label">Genre</span><span class="msi-value">${song.genre || '—'}</span></div>
      <div class="meta-strip-item"><span class="msi-label">Level</span><span class="msi-value">${song.difficulty || '—'}</span></div>
    </div>
    <div class="panel-content">${sections}</div>`;
}

function setupPanelImages() {
  // Cover image
  const coverImg = document.querySelector('.panel-cover-img');
  const coverSkel = document.querySelector('.panel-img-skeleton');
  if (coverImg) {
    coverImg.src = coverImg.dataset.src;
    coverImg.onload = () => {
      coverImg.classList.add('loaded');
      if (coverSkel) coverSkel.style.opacity = '0';
    };
    coverImg.onerror = () => {
      coverImg.style.display = 'none';
      if (coverSkel) coverSkel.style.opacity = '0';
    };
  }
  // Section images — load + enable lightbox
  document.querySelectorAll('.section-zoomable').forEach(img => {
    img.src = img.dataset.src;
    img.onload = () => img.classList.add('loaded');
    img.addEventListener('click', () => openLightbox(img.src, img.alt));
  });
}

/* ────────────────────────────────────
   Section builders
──────────────────────────────────── */
function buildSection(sec) {

  const heading = `<div class="cs-heading">${sec.heading || ''}</div>`;

  switch (sec.type) {
    case 'text':
      return `<div class="content-section">${heading}<p class="cs-text">${escapeHtml(sec.content || '')}</p></div>`;

    case 'chords': {
      const rendered = escapeHtml(sec.content || '').replace(
        /([A-G][#b]?(?:m|maj|min|dim|aug|sus|add)?[0-9]*(?:\/[A-G][#b]?)?)/g,
        '<span class="chord-token">$1</span>');
      return `<div class="content-section">${heading}<div class="cs-chords">${rendered}</div></div>`;
    }

    case 'lyrics': {
      const rendered = escapeHtml(sec.content || '').replace(
        /\[([^\]]+)\]/g, '<span class="lyric-chord">[$1]</span>');
      return `<div class="content-section">${heading}<div class="cs-lyrics">${rendered}</div></div>`;
    }

    case 'audio': {
      const src = sec.src || '';
      const uid = 'audio_' + Math.random().toString(36).slice(2);
      return `
        <div class="content-section">
          ${heading}
          <div class="audio-player" data-src="${src}">
            <p class="audio-player-desc">${escapeHtml(sec.description || '')}</p>
            <div class="audio-controls">
              <button class="audio-play-btn" id="playbtn_${uid}" data-uid="${uid}" aria-label="Play/Pause">▶</button>
              <div class="audio-track-info">
                <div class="audio-track-name">${escapeHtml(sec.heading || 'Audio Track')}</div>
                <div class="audio-progress-wrap" id="prog_${uid}" data-uid="${uid}">
                  <div class="audio-progress-bar" id="bar_${uid}"></div>
                </div>
                <div class="audio-time"><span id="cur_${uid}">0:00</span><span id="dur_${uid}">—:——</span></div>
              </div>
            </div>
            <audio id="${uid}" src="${src}" preload="none"></audio>
          </div>
        </div>`;
    }

    case 'image': {
      const src = escapeHtml(sec.src || '');
      const alt = escapeHtml(sec.heading || '');
      return `
        <div class="content-section">
          ${heading}
          ${sec.caption ? `<p class="cs-text" style="margin-bottom:12px;">${escapeHtml(sec.caption)}</p>` : ''}
          <div class="section-img-wrap">
            <div class="section-img-skeleton"></div>
            <img
              class="section-zoomable"
              data-src="${src}"
              alt="${alt}"
              title="Click to enlarge"
            >
            <div class="zoom-hint">🔍 Click to zoom</div>
          </div>
        </div>`;
    }

    default:
      return `<div class="content-section">${heading}<p class="cs-text">${escapeHtml(sec.content || '')}</p></div>`;
  }
}

/* ────────────────────────────────────
   Lightbox
──────────────────────────────────── */
function openLightbox(src, alt) {
  const lb = document.getElementById('lightbox');
  const lbImg = document.getElementById('lightboxImg');
  const lbCaption = document.getElementById('lightboxCaption');

  lbImg.src = '';
  lbImg.classList.remove('loaded');
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';

  lbCaption.textContent = alt || '';
  lbImg.src = src;
  lbImg.onload = () => lbImg.classList.add('loaded');
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  // Don't restore body overflow here — detail panel may still be open
  if (!document.getElementById('songDetailOverlay').classList.contains('open')) {
    document.body.style.overflow = '';
  }
}

/* ────────────────────────────────────
   Audio players
──────────────────────────────────── */
function setupAudioPlayers() {
  document.querySelectorAll('.audio-player').forEach(player => {
    const src = player.dataset.src;
    if (!src) return;

    player.querySelectorAll('.audio-play-btn').forEach(btn => {
      const uid = btn.dataset.uid;
      const audio = document.getElementById(uid);
      const bar   = document.getElementById('bar_' + uid);
      const cur   = document.getElementById('cur_' + uid);
      const dur   = document.getElementById('dur_' + uid);
      const prog  = document.getElementById('prog_' + uid);
      if (!audio) return;

      btn.addEventListener('click', () => {
        if (currentAudio && currentAudio !== audio) stopCurrentAudio();
        if (audio.paused) {
          audio.play().catch(() => showNoAudioNotice(player));
          btn.textContent = '⏸';
          btn.classList.add('playing');
          currentAudio = audio;
          currentAudioBtn = btn;
        } else {
          audio.pause();
          btn.textContent = '▶';
          btn.classList.remove('playing');
        }
      });

      audio.addEventListener('timeupdate', () => {
        if (!audio.duration) return;
        const pct = (audio.currentTime / audio.duration) * 100;
        if (bar) bar.style.width = pct + '%';
        if (cur) cur.textContent = formatTime(audio.currentTime);
      });

      audio.addEventListener('loadedmetadata', () => {
        if (dur) dur.textContent = formatTime(audio.duration);
      });

      audio.addEventListener('ended', () => {
        btn.textContent = '▶';
        btn.classList.remove('playing');
        if (bar) bar.style.width = '0%';
        if (cur) cur.textContent = '0:00';
        currentAudio = null;
        currentAudioBtn = null;
      });

      prog?.addEventListener('click', e => {
        if (!audio.duration) return;
        const rect = prog.getBoundingClientRect();
        audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
      });
    });
  });
}

function showNoAudioNotice(player) {
  if (!player.querySelector('.no-audio-notice')) {
    const notice = document.createElement('div');
    notice.className = 'no-audio-notice';
    notice.textContent = '⚠ Audio file not found. Place .mp3 files in the audio/ folder.';
    player.appendChild(notice);
  }
}

function stopCurrentAudio() {
  if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; currentAudio = null; }
  if (currentAudioBtn) { currentAudioBtn.textContent = '▶'; currentAudioBtn.classList.remove('playing'); currentAudioBtn = null; }
}

function formatTime(secs) {
  if (!isFinite(secs)) return '0:00';
  return `${Math.floor(secs / 60)}:${Math.floor(secs % 60).toString().padStart(2, '0')}`;
}

/* ────────────────────────────────────
   Utilities
──────────────────────────────────── */
function escapeHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str)));
  return d.innerHTML;
}

/* ────────────────────────────────────
   Header scroll
──────────────────────────────────── */
function initScrollEffects() {
  const header = document.querySelector('.site-header');
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });
}

/* ────────────────────────────────────
   Mobile nav
──────────────────────────────────── */
function initMobileNav() {
  const toggle = document.getElementById('navToggle');
  const nav = document.querySelector('.main-nav');
  toggle?.addEventListener('click', () => {
    const open = toggle.classList.toggle('open');
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open);
  });
  nav?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    toggle?.classList.remove('open');
    nav.classList.remove('open');
    toggle?.setAttribute('aria-expanded', 'false');
  }));
}

/* ────────────────────────────────────
   Keyboard
──────────────────────────────────── */
function initKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (document.getElementById('lightbox').classList.contains('open')) {
        closeLightbox();
      } else {
        closeDetail();
      }
    }
  });
}

/* ────────────────────────────────────
   Init
──────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadSongs();
  initScrollEffects();
  initMobileNav();
  initKeyboard();

  // Overlay backdrop
  document.getElementById('overlayBackdrop')?.addEventListener('click', closeDetail);

  // Lightbox backdrop
  document.getElementById('lightboxBackdrop')?.addEventListener('click', closeLightbox);
  document.getElementById('lightboxClose')?.addEventListener('click', closeLightbox);

  // Smooth scroll
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  });
});

window.closeDetail  = closeDetail;
window.closeLightbox = closeLightbox;
