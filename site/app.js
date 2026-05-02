// BG3 Builds — single-page renderer for YAML build guides.

const TABS_EL = document.getElementById('tabs');
const BUILD_EL = document.getElementById('build');

const state = {
  index: null,         // {builds: [...]}
  currentId: null,
  cache: new Map(),    // id -> parsed yaml
  view: 'level',       // 'level' | 'reference'
  level: 1,            // currently-shown level (1..N)
};

// ---------- bootstrap ----------

async function init() {
  try {
    const res = await fetch('builds/index.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`builds/index.json: ${res.status}`);
    state.index = await res.json();
  } catch (err) {
    showError(`Could not load build index: ${err.message}`);
    return;
  }

  renderTabs();

  parseHash();
  const initialId = state.currentId || state.index.builds[0]?.id;
  if (initialId) await selectBuild(initialId, { fromHash: true });

  window.addEventListener('hashchange', () => {
    const before = { id: state.currentId, view: state.view, level: state.level };
    parseHash();
    if (state.currentId !== before.id) {
      selectBuild(state.currentId, { fromHash: true });
    } else if (state.view !== before.view || state.level !== before.level) {
      renderCurrent();
    }
  });

  document.addEventListener('keydown', onKey);
}

function parseHash() {
  // hash format: #<buildId>[/<view>[/L<n>]]
  // examples: #wood-elf-bardadin
  //           #wood-elf-bardadin/level/L7
  //           #wood-elf-bardadin/reference
  const raw = (location.hash || '').replace(/^#/, '');
  if (!raw) return;
  const [id, view, lvl] = raw.split('/');
  if (id) state.currentId = id;
  if (view === 'reference' || view === 'level') state.view = view;
  if (lvl && /^L\d+$/.test(lvl)) state.level = parseInt(lvl.slice(1), 10);
}

function syncHash() {
  const parts = [state.currentId, state.view];
  if (state.view === 'level') parts.push(`L${state.level}`);
  history.replaceState(null, '', `#${parts.filter(Boolean).join('/')}`);
}

// ---------- tabs ----------

function renderTabs() {
  TABS_EL.innerHTML = '';
  for (const b of state.index.builds) {
    const btn = document.createElement('button');
    btn.className = 'tab';
    btn.dataset.id = b.id;
    btn.innerHTML = `${escapeHtml(b.name)}<span class="tab-tagline">${escapeHtml(b.tagline || '')}</span>`;
    btn.addEventListener('click', () => selectBuild(b.id));
    TABS_EL.appendChild(btn);
  }
}

function setActiveTab(id) {
  for (const t of TABS_EL.querySelectorAll('.tab')) {
    t.classList.toggle('active', t.dataset.id === id);
  }
}

async function selectBuild(id, { fromHash = false } = {}) {
  state.currentId = id;
  if (!fromHash) {
    // jumping to a fresh build resets level/view to defaults
    state.level = 1;
    state.view = 'level';
  }
  setActiveTab(id);
  BUILD_EL.innerHTML = `<div class="loading">Loading build…</div>`;

  let data = state.cache.get(id);
  if (!data) {
    const meta = state.index.builds.find(b => b.id === id);
    if (!meta) {
      showError(`Unknown build: ${id}`);
      return;
    }
    try {
      const res = await fetch(`builds/${meta.file}`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      data = jsyaml.load(text);
      state.cache.set(id, data);
    } catch (err) {
      showError(`Could not load ${meta.file}: ${err.message}`);
      return;
    }
  }

  // clamp level to actual range
  const levels = (data.leveling || []).map(l => Number(l.level)).filter(Number.isFinite);
  const maxL = Math.max(1, ...levels);
  if (state.level < 1) state.level = 1;
  if (state.level > maxL) state.level = maxL;

  renderCurrent();
  syncHash();
}

function renderCurrent() {
  const data = state.cache.get(state.currentId);
  if (!data) return;
  renderBuild(data);
  syncHash();
}

function showError(msg) {
  BUILD_EL.innerHTML = `<div class="error">${escapeHtml(msg)}</div>`;
}

// ---------- keyboard nav ----------

function onKey(ev) {
  if (state.view !== 'level') return;
  if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA') return;
  const data = state.cache.get(state.currentId);
  if (!data) return;
  const levels = (data.leveling || []).map(l => Number(l.level));
  const max = Math.max(...levels);
  if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') {
    state.level = Math.min(max, state.level + 1);
    renderCurrent();
    ev.preventDefault();
  } else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') {
    state.level = Math.max(1, state.level - 1);
    renderCurrent();
    ev.preventDefault();
  }
}

// ---------- top-level render ----------

function renderBuild(data) {
  const parts = [];
  parts.push(renderHero(data));
  parts.push(renderViewToggle());
  if (state.view === 'level') {
    parts.push(renderLevelView(data));
  } else {
    parts.push(renderReferenceView(data));
  }
  BUILD_EL.innerHTML = parts.join('\n');
  // wire up listeners (event delegation would be cleaner, but simple direct binding for now)
  for (const btn of BUILD_EL.querySelectorAll('[data-set-view]')) {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.setView;
      renderCurrent();
    });
  }
  for (const btn of BUILD_EL.querySelectorAll('[data-go-level]')) {
    btn.addEventListener('click', () => {
      state.level = parseInt(btn.dataset.goLevel, 10);
      renderCurrent();
    });
  }
}

function renderHero(data) {
  const m = data.meta || {};
  const badges = [];
  if (m.race) badges.push(badge('Race', m.race));
  if (m.classes) badges.push(badge('Classes', (m.classes || []).join(' / ')));
  if (m.final_split) badges.push(badge('Split', m.final_split));
  if (m.level_range) badges.push(badge('Levels', m.level_range));
  if (m.difficulty) badges.push(badge('Difficulty', m.difficulty));

  const win = m.win_condition
    ? `<div class="win-condition"><strong>Win condition.</strong> ${escapeHtml(m.win_condition)}</div>`
    : '';

  return `
    <section class="hero">
      <h2>${escapeHtml(m.name || 'Untitled build')}</h2>
      <div class="tagline">${escapeHtml(m.tagline || '')}</div>
      <div class="badges">${badges.join('')}</div>
      ${win}
    </section>
  `;
}

function renderViewToggle() {
  const v = state.view;
  return `
    <div class="view-toggle" role="tablist" aria-label="View mode">
      <button class="view-btn ${v === 'level' ? 'active' : ''}"
              data-set-view="level" role="tab" aria-selected="${v === 'level'}">
        Level by level
      </button>
      <button class="view-btn ${v === 'reference' ? 'active' : ''}"
              data-set-view="reference" role="tab" aria-selected="${v === 'reference'}">
        Reference
      </button>
    </div>
  `;
}

function badge(key, val) {
  return `<span class="badge"><span class="key">${escapeHtml(key)}</span><span class="val">${escapeHtml(String(val))}</span></span>`;
}

function renderSection(title, body) {
  return `<section class="section"><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

// ---------- level view ----------

function renderLevelView(data) {
  const levels = data.leveling || [];
  if (!levels.length) return `<div class="muted">No leveling plan defined.</div>`;
  const max = Math.max(...levels.map(l => Number(l.level)));
  const cur = clamp(state.level, 1, max);
  state.level = cur;

  const lvlData = levels.find(l => Number(l.level) === cur) || levels[0];

  return `
    ${renderLevelPicker(levels, cur)}
    ${renderLevelPanel(lvlData, data, cur, max)}
  `;
}

function renderLevelPicker(levels, cur) {
  // Group by class taken so we can split visually (e.g., Bard 1-6 | Paladin 1-6).
  const cells = levels.map(l => {
    const n = Number(l.level);
    const take = (l.take || '').trim();
    const short = takeShort(take);
    return `<button class="lvl-cell ${n === cur ? 'active' : ''}"
                    data-go-level="${n}"
                    aria-current="${n === cur}"
                    title="Level ${n} — ${escapeHtml(take)}">
              <span class="lvl-num">${n}</span>
              <span class="lvl-take">${escapeHtml(short)}</span>
            </button>`;
  }).join('');

  return `
    <nav class="level-picker" aria-label="Level selector">
      <div class="level-picker-hint">Pick a level — or use ← / → keys</div>
      <div class="level-grid">${cells}</div>
    </nav>
  `;
}

function takeShort(take) {
  // "Bard 6" -> "B6", "Paladin 3" -> "P3"
  const m = (take || '').match(/^(\w+)\s+(\d+)/);
  if (!m) return take || '';
  return m[1].charAt(0).toUpperCase() + m[2];
}

function renderLevelPanel(lvl, data, cur, max) {
  const picks = (lvl.pick || []).map(p => `<li>${renderInlineMd(p)}</li>`).join('');
  const notes = lvl.notes ? `<div class="lvl-notes">${renderMarkdownish(lvl.notes)}</div>` : '';

  // contextual mini-sections
  const phase = phaseFor(cur, data);
  const playstyleBlock = renderLevelPlaystyle(phase, data);
  const gearBlock = renderLevelGear(cur, data);
  const spellBlock = renderLevelSpells(cur, data);

  // prev/next
  const prevDisabled = cur <= 1 ? 'disabled' : '';
  const nextDisabled = cur >= max ? 'disabled' : '';
  const prevLabel = cur > 1 ? `← Level ${cur - 1}` : '←';
  const nextLabel = cur < max ? `Level ${cur + 1} →` : '→';

  return `
    <article class="lvl-panel">
      <header class="lvl-panel-head">
        <div class="lvl-panel-num">
          <span class="lvl-panel-n">${cur}</span>
          <span class="lvl-panel-take">${escapeHtml(lvl.take || '')}</span>
        </div>
        ${phase ? `<span class="lvl-panel-phase">${escapeHtml(phaseLabel(phase))}</span>` : ''}
      </header>

      <div class="lvl-panel-body">
        <section class="lvl-block">
          <h3>What to pick at this level</h3>
          <ul class="picks">${picks}</ul>
          ${notes}
        </section>

        ${spellBlock}
        ${gearBlock}
        ${playstyleBlock}
      </div>

      <footer class="lvl-panel-nav">
        <button class="lvl-nav-btn" data-go-level="${cur - 1}" ${prevDisabled}>${prevLabel}</button>
        <span class="lvl-nav-pos">${cur} / ${max}</span>
        <button class="lvl-nav-btn" data-go-level="${cur + 1}" ${nextDisabled}>${nextLabel}</button>
      </footer>
    </article>
  `;
}

function phaseFor(level, data) {
  const ps = data.playstyle || {};
  if (ps.early && includesLevel(ps.early.levels, level)) return 'early';
  if (ps.mid   && includesLevel(ps.mid.levels, level))   return 'mid';
  if (ps.late  && includesLevel(ps.late.levels, level))  return 'late';
  // fallback heuristics
  if (level <= 6) return ps.early ? 'early' : null;
  if (level <= 9) return ps.mid ? 'mid' : null;
  return ps.late ? 'late' : null;
}

function phaseLabel(phase) {
  return ({ early: 'Early game', mid: 'Mid game', late: 'Late game' })[phase] || phase;
}

function includesLevel(rangeStr, lvl) {
  if (!rangeStr) return false;
  // e.g. "1 – 6 (pure Bard)" or "7-9" or "10 to 12"
  const m = String(rangeStr).match(/(\d+)\s*[–\-to]+\s*(\d+)/);
  if (!m) return false;
  const a = +m[1], b = +m[2];
  return lvl >= Math.min(a, b) && lvl <= Math.max(a, b);
}

function renderLevelPlaystyle(phase, data) {
  if (!phase) return '';
  const p = (data.playstyle || {})[phase];
  if (!p) return '';
  const blocks = [];
  if (p.summary) blocks.push(`<div class="prose">${renderMarkdownish(p.summary)}</div>`);
  if (p.standard_turn) blocks.push(`<h4>Standard turn</h4><div class="prose">${renderMarkdownish(p.standard_turn)}</div>`);
  if (p.nova_turn) blocks.push(`<h4>Nova turn</h4><div class="prose">${renderMarkdownish(p.nova_turn)}</div>`);
  return `<section class="lvl-block">
    <h3>How to play this phase ${p.levels ? `<span class="muted">(${escapeHtml(p.levels)})</span>` : ''}</h3>
    ${blocks.join('')}
  </section>`;
}

function actForLevel(level) {
  if (level <= 4) return 'act_1';
  if (level <= 8) return 'act_2';
  return 'act_3';
}

function renderLevelGear(level, data) {
  const gear = data.gear || {};
  const act = actForLevel(level);
  const items = gear[act] || [];
  if (!items.length) return '';
  const rows = items.slice(0, 6).map(r => `
    <li>
      <span class="gear-slot">${escapeHtml(r.slot || '')}</span>
      <span class="gear-item">${escapeHtml(r.item || '')}</span>
      <span class="gear-where">${escapeHtml(r.where || '')}</span>
    </li>
  `).join('');
  const actLabel = ({ act_1: 'Act 1', act_2: 'Act 2', act_3: 'Act 3' })[act];
  return `<section class="lvl-block">
    <h3>Gear to chase right now <span class="muted">(${actLabel})</span></h3>
    <ul class="gear-mini">${rows}</ul>
    <div class="muted">See the full gear list and BiS in the <a href="#" data-set-view="reference" class="inline-link">Reference view</a>.</div>
  </section>`;
}

function renderLevelSpells(level, data) {
  // Show what spells become available at this level.
  // Bard slot levels in BG3: L1 = L1 spells, L3 = L2 spells, L5 = L3 spells.
  const events = [];
  if (level === 1) events.push({ kind: 'unlock', text: 'Bard L1 spell slots; you start with 4 known spells.' });
  if (level === 3) events.push({ kind: 'unlock', text: 'L2 spell slots — pick Hold Person and Heat Metal here.' });
  if (level === 5) events.push({ kind: 'unlock', text: 'L3 spell slots — pick Hypnotic Pattern.' });
  if (level === 8) events.push({ kind: 'unlock', text: 'Divine Smite — burn any spell slot for +2d8 radiant on a melee hit.' });
  if (level === 11) events.push({ kind: 'unlock', text: 'L4 spell slots from multiclass casting (Bard 6 + Pal 5 = caster 8).' });
  if (!events.length) return '';
  return `<section class="lvl-block">
    <h3>What unlocks here</h3>
    <ul class="unlocks">${events.map(e => `<li>${escapeHtml(e.text)}</li>`).join('')}</ul>
  </section>`;
}

// ---------- reference view ----------

function renderReferenceView(data) {
  const parts = [];
  if (data.overview) parts.push(renderSection('Overview', `<div class="prose">${renderMarkdownish(data.overview)}</div>`));
  if (data.character_creation) parts.push(renderSection('Character Creation', renderCreation(data.character_creation)));
  if (data.skills) parts.push(renderSection('Skills', renderSkills(data.skills)));
  if (data.stats_progression) parts.push(renderSection('Stat Progression', renderStatsProgression(data.stats_progression, data.character_creation)));
  if (data.spells) parts.push(renderSection('Spell Loadout', renderSpells(data.spells)));
  if (data.gear) parts.push(renderSection('Gear by Act', renderGear(data.gear)));
  if (data.alternative_splits) parts.push(renderSection('Alternative Splits', renderAlternatives(data.alternative_splits)));
  if (data.race_choice) parts.push(renderSection('Race Choice', renderRaceChoice(data.race_choice)));
  if (data.playstyle) parts.push(renderSection('Playstyle', renderPlaystyle(data.playstyle)));
  if (data.abilities_situational) parts.push(renderSection('Ability Usage — Situational', renderAbilities(data.abilities_situational)));
  if (data.mistakes_and_tips) parts.push(renderSection('Mistakes & Tips', renderTips(data.mistakes_and_tips)));
  return parts.join('\n');
}

function renderCreation(c) {
  const out = [`<div class="card">`];
  if (c.note) out.push(`<div class="prose">${renderMarkdownish(c.note)}</div>`);
  const dl = [];
  if (c.class) dl.push(['Class', c.class]);
  if (c.background_suggested) dl.push(['Background', c.background_suggested]);
  if (c.cantrips_at_l1) dl.push(['Cantrips (L1)', (c.cantrips_at_l1).join(', ')]);
  if (c.spells_known_at_l1) dl.push(['Spells (L1)', (c.spells_known_at_l1).join(', ')]);
  if (c.skill_proficiencies) dl.push(['Skill proficiencies', (c.skill_proficiencies).join(', ')]);
  if (dl.length) {
    out.push('<dl class="kv">');
    for (const [k, v] of dl) out.push(`<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`);
    out.push('</dl>');
  }
  out.push('</div>');

  if (c.ability_scores) {
    const a = c.ability_scores;
    out.push(`<div class="card">`);
    out.push(`<h3>Ability scores at character creation</h3>`);
    if (a.note) out.push(`<div class="muted" style="margin-bottom:.6rem">${escapeHtml(a.note)}</div>`);
    out.push(renderStatRow(a, 'starting'));
    if (c.final_starting) {
      out.push(`<h4 style="margin-top:.8rem">After Wood Elf bonuses</h4>`);
      out.push(renderStatRow(c.final_starting, 'final'));
    }
    out.push(`</div>`);
  }
  return out.join('');
}

function renderSkills(s) {
  const out = [];
  if (s.summary) out.push(`<div class="prose" style="margin-bottom:1rem">${renderMarkdownish(s.summary)}</div>`);

  if (s.at_creation) {
    const c = s.at_creation;
    out.push(`<div class="card"><h3>At character creation</h3>`);
    const groups = [
      ['From race', c.from_race],
      ['From background', c.from_background],
      ['From class (Bard L1)', c.from_class],
    ];
    for (const [label, g] of groups) {
      if (!g) continue;
      const picks = (g.pick || []).map(escapeHtml).join(', ');
      const subhead = g.background ? ` <span class="muted">(${escapeHtml(g.background)})</span>` : '';
      out.push(`<div class="skills-group">
        <div class="label-row">${escapeHtml(label)}${subhead}</div>
        <div><strong>${picks}</strong></div>
        ${g.note ? `<div class="ab-notes">${renderMarkdownish(g.note)}</div>` : ''}
      </div>`);
    }
    out.push(`</div>`);
  }

  if (s.at_level_3_expertise) {
    const e = s.at_level_3_expertise;
    out.push(`<div class="card"><h3>Bard 3 — Expertise</h3>
      <div><strong>${(e.pick || []).map(escapeHtml).join(', ')}</strong></div>
      ${e.note ? `<div class="ab-notes">${renderMarkdownish(e.note)}</div>` : ''}
    </div>`);
  }

  if (s.later_levels) {
    out.push(`<div class="card"><h3>Levels 4 → 12</h3>
      <div class="prose">${renderMarkdownish(s.later_levels)}</div>
    </div>`);
  }
  return out.join('');
}

function renderStatRow(stats, klass = '') {
  const order = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  return `<div class="stat-grid">${order
    .filter(k => stats[k] !== undefined)
    .map(k => `<div class="stat ${klass}"><div class="name">${k.toUpperCase()}</div><div class="value">${escapeHtml(String(stats[k]))}</div></div>`)
    .join('')}</div>`;
}

function renderStatsProgression(p) {
  const out = [`<div class="card">`];
  if (p.priorities) out.push(`<div><span class="muted">Priorities:</span> <strong>${(p.priorities).join(' &gt; ')}</strong></div>`);
  if (p.cap_at_12) {
    out.push(`<h4 style="margin-top:.8rem">Final stats at level 12</h4>`);
    out.push(renderStatRow(p.cap_at_12, 'final'));
  }
  if (p.asi_plan) {
    out.push(`<h4 style="margin-top:1rem">ASI / Feat plan</h4><ul class="tips">`);
    for (const a of p.asi_plan) {
      out.push(`<li><strong>L${escapeHtml(String(a.level))}:</strong> ${escapeHtml(a.pick)} — <span class="muted">${escapeHtml(a.reason || '')}</span></li>`);
    }
    out.push(`</ul>`);
  }
  if (p.alternates) {
    out.push(`<h4 style="margin-top:1rem">Alternate feats</h4><ul class="tips">`);
    for (const alt of p.alternates) {
      out.push(`<li><strong>${escapeHtml(alt.feat)}.</strong> ${escapeHtml(alt.when || '')} <span class="muted">${escapeHtml(alt.tradeoff || '')}</span></li>`);
    }
    out.push(`</ul>`);
  }
  if (p.permanent_boosts) {
    out.push(`<h4 style="margin-top:1rem">Permanent stat boosts</h4>`);
    if (p.permanent_boosts.note) out.push(`<div class="muted" style="margin-bottom:.5rem">${escapeHtml(p.permanent_boosts.note)}</div>`);
    out.push(`<ul class="tips">`);
    for (const b of (p.permanent_boosts.items || [])) {
      out.push(`<li><strong>${escapeHtml(b.name)}</strong> — ${escapeHtml(b.grants || '')}. <span class="muted">${escapeHtml(b.where || '')}</span> ${b.recommend ? '— ' + escapeHtml(b.recommend) : ''}</li>`);
    }
    out.push(`</ul>`);
  }
  out.push(`</div>`);
  return out.join('');
}

function renderAlternatives(a) {
  const out = [];
  if (a.intro) out.push(`<div class="prose" style="margin-bottom:1rem">${renderMarkdownish(a.intro)}</div>`);
  for (const opt of (a.options || [])) {
    out.push(`<div class="card"><h3>${escapeHtml(opt.name)}</h3>`);
    if (opt.gives) {
      out.push(`<h4>Gives you</h4><ul class="tips">`);
      for (const g of opt.gives) out.push(`<li>${escapeHtml(g)}</li>`);
      out.push(`</ul>`);
    }
    if (opt.gives_up) {
      out.push(`<h4>Gives up</h4><ul class="tips">`);
      for (const g of opt.gives_up) out.push(`<li>${escapeHtml(g)}</li>`);
      out.push(`</ul>`);
    }
    if (opt.best_for) {
      out.push(`<div class="muted" style="margin-top:.6rem"><strong>Best for:</strong> ${escapeHtml(opt.best_for)}</div>`);
    }
    out.push(`</div>`);
  }
  return out.join('');
}

function renderRaceChoice(r) {
  const out = [`<div class="card">`];
  if (r.locked_for_you) out.push(`<div class="muted">Locked race for this guide: <strong>${escapeHtml(r.locked_for_you)}</strong></div>`);
  if (r.why_its_fine) out.push(`<div class="prose" style="margin-top:.6rem">${renderMarkdownish(r.why_its_fine)}</div>`);
  out.push(`</div>`);
  if (r.community_meta_picks && r.community_meta_picks.length) {
    out.push(`<div class="card"><h3>Community meta race picks</h3><ul class="tips">`);
    for (const p of r.community_meta_picks) {
      out.push(`<li><strong>${escapeHtml(p.race)}.</strong> ${escapeHtml(p.upside || '')}</li>`);
    }
    out.push(`</ul></div>`);
  }
  if (r.takeaway) out.push(`<div class="card"><div class="prose">${renderMarkdownish(r.takeaway)}</div></div>`);
  return out.join('');
}

function renderSpells(s) {
  const out = [];
  if (s.cantrips) out.push(spellsBlock('Cantrips', s.cantrips, 'keep'));
  for (const lvl of [1, 2, 3, 4, 5]) {
    const k = s[`level_${lvl}`];
    if (!k) continue;
    out.push(`<div class="spells-block"><h3>Level ${lvl} spells</h3>`);
    if (k.keepers) out.push(`<div class="label-row">Keepers</div>` + listOf(k.keepers, 'keep'));
    if (k.skip)    out.push(`<div class="label-row">Skip / drop</div>` + listOf(k.skip, 'skip'));
    out.push(`</div>`);
  }
  if (s.paladin_prepared) {
    out.push(`<div class="card"><h3>Paladin prepared spells</h3>`);
    if (s.paladin_prepared.note) out.push(`<div class="muted" style="margin-bottom:.5rem">${escapeHtml(s.paladin_prepared.note)}</div>`);
    if (s.paladin_prepared.recommended_at_12) {
      out.push(`<div><strong>Recommended @ L12:</strong> ${escapeHtml((s.paladin_prepared.recommended_at_12).join(', '))}</div>`);
    }
    out.push(`</div>`);
  }
  if (s.must_pick_now) {
    out.push(`<div class="card" style="margin-top:.8rem"><h3>Must-pick moments</h3><ul class="tips">`);
    for (const m of s.must_pick_now) {
      out.push(`<li><strong>L${escapeHtml(String(m.at_level))} — ${escapeHtml(m.spell)}.</strong> ${escapeHtml(m.why)}</li>`);
    }
    out.push(`</ul></div>`);
  }
  return out.join('');
}

function spellsBlock(title, items, klass) {
  return `<div class="spells-block"><h3>${escapeHtml(title)}</h3>${listOf(items, klass)}</div>`;
}

function listOf(items, klass) {
  return `<ul class="spell-list ${klass}">` +
    items.map(s => {
      const name = s.name || '';
      const reason = s.reason || s.why || '';
      const skip = klass === 'skip';
      return `<li class="${skip ? 'skip' : ''}"><span class="name">${escapeHtml(name)}</span>${reason ? ' — <span class="reason">' + escapeHtml(reason) + '</span>' : ''}</li>`;
    }).join('') +
    `</ul>`;
}

function renderGear(g) {
  const out = [];
  if (g.notes) out.push(`<div class="prose" style="margin-bottom:1rem">${renderMarkdownish(g.notes)}</div>`);
  for (const act of ['act_1', 'act_2', 'act_3']) {
    if (!g[act]) continue;
    const label = ({ act_1: 'Act 1', act_2: 'Act 2', act_3: 'Act 3' })[act];
    out.push(`<div class="card"><h3>${escapeHtml(label)}</h3>`);
    out.push(gearTable(g[act]));
    out.push(`</div>`);
  }
  if (g.bis_at_12) {
    out.push(`<div class="card" style="margin-top:.8rem"><h3>Best-in-slot at level 12</h3>`);
    out.push(`<dl class="kv">`);
    const order = ['main_hand', 'off_hand', 'armor', 'helm', 'gloves', 'boots', 'cloak', 'amulet', 'ring_1', 'ring_2'];
    for (const key of order) {
      if (g.bis_at_12[key] === undefined) continue;
      out.push(`<dt>${escapeHtml(key.replace(/_/g, ' '))}</dt><dd>${escapeHtml(g.bis_at_12[key])}</dd>`);
    }
    out.push(`</dl></div>`);
  }
  return out.join('');
}

function gearTable(rows) {
  return `<table class="gear">
    <thead><tr><th>Slot</th><th>Item</th><th>Where</th><th>Why</th></tr></thead>
    <tbody>${rows.map(r =>
      `<tr><td class="slot">${escapeHtml(r.slot || '')}</td>
           <td class="item">${escapeHtml(r.item || '')}</td>
           <td class="where">${escapeHtml(r.where || '')}</td>
           <td class="why">${escapeHtml(r.why || '')}</td></tr>`
    ).join('')}</tbody>
  </table>`;
}

function renderPlaystyle(p) {
  const phases = [];
  for (const phase of ['early', 'mid', 'late']) {
    if (!p[phase]) continue;
    const ph = p[phase];
    phases.push(`<div class="card">
      <h3>${capitalize(phase)} game ${ph.levels ? `<span class="muted">(${escapeHtml(ph.levels)})</span>` : ''}</h3>
      ${ph.summary ? `<div class="prose">${renderMarkdownish(ph.summary)}</div>` : ''}
      ${ph.standard_turn ? `<h4 style="margin-top:.6rem">Standard turn</h4><div class="prose">${renderMarkdownish(ph.standard_turn)}</div>` : ''}
      ${ph.nova_turn ? `<h4 style="margin-top:.6rem">Nova turn</h4><div class="prose">${renderMarkdownish(ph.nova_turn)}</div>` : ''}
    </div>`);
  }
  return phases.join('');
}

function renderAbilities(rows) {
  return `<div class="abilities">${rows.map(r => `
    <div class="ability">
      <h3>${escapeHtml(r.name || '')}</h3>
      ${r.when ? `<div class="when">${escapeHtml(r.when)}</div>` : ''}
      ${r.not ? `<div class="not">${escapeHtml(r.not)}</div>` : ''}
      ${r.cost ? `<div class="cost">${escapeHtml(r.cost)}</div>` : ''}
      ${r.notes ? `<div class="ab-notes">${escapeHtml(r.notes)}</div>` : ''}
    </div>
  `).join('')}</div>`;
}

function renderTips(rows) {
  return `<ul class="tips">${rows.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>`;
}

// ---------- helpers ----------

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// inline-md: just escape + **bold**
function renderInlineMd(text) {
  return escapeHtml(String(text ?? '')).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

// paragraphs + **bold** + line breaks
function renderMarkdownish(text) {
  if (text == null) return '';
  const escaped = escapeHtml(String(text));
  const bolded = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return bolded
    .split(/\n\s*\n/)
    .map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

init();
