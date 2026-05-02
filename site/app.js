// BG3 Builds — single-page renderer for YAML build guides.

const TABS_EL = document.getElementById('tabs');
const BUILD_EL = document.getElementById('build');

const state = {
  index: null,        // {builds: [...]}
  currentId: null,
  cache: new Map(),   // id -> parsed yaml
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

  const initial = (location.hash || '').replace(/^#/, '') || state.index.builds[0]?.id;
  if (initial) await selectBuild(initial);

  window.addEventListener('hashchange', () => {
    const id = (location.hash || '').replace(/^#/, '');
    if (id && id !== state.currentId) selectBuild(id);
  });
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

async function selectBuild(id) {
  state.currentId = id;
  history.replaceState(null, '', `#${id}`);
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

  renderBuild(data);
}

function showError(msg) {
  BUILD_EL.innerHTML = `<div class="error">${escapeHtml(msg)}</div>`;
}

// ---------- render ----------

function renderBuild(data) {
  const parts = [];
  parts.push(renderHero(data));
  if (data.overview) parts.push(renderSection('Overview', `<div class="prose">${renderMarkdownish(data.overview)}</div>`));
  if (data.character_creation) parts.push(renderSection('Character Creation', renderCreation(data.character_creation)));
  if (data.stats_progression) parts.push(renderSection('Stat Progression', renderStatsProgression(data.stats_progression, data.character_creation)));
  if (data.leveling) parts.push(renderSection('Level-by-level', renderTimeline(data.leveling)));
  if (data.spells) parts.push(renderSection('Spell Loadout', renderSpells(data.spells)));
  if (data.gear) parts.push(renderSection('Gear by Act', renderGear(data.gear)));
  if (data.playstyle) parts.push(renderSection('Playstyle', renderPlaystyle(data.playstyle)));
  if (data.abilities_situational) parts.push(renderSection('Ability Usage — Situational', renderAbilities(data.abilities_situational)));
  if (data.mistakes_and_tips) parts.push(renderSection('Mistakes & Tips', renderTips(data.mistakes_and_tips)));
  BUILD_EL.innerHTML = parts.join('\n');
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

function badge(key, val) {
  return `<span class="badge"><span class="key">${escapeHtml(key)}</span><span class="val">${escapeHtml(String(val))}</span></span>`;
}

function renderSection(title, body) {
  return `<section class="section"><h2>${escapeHtml(title)}</h2>${body}</section>`;
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

function renderStatRow(stats, klass = '') {
  const order = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  return `<div class="stat-grid">${order
    .filter(k => stats[k] !== undefined)
    .map(k => `<div class="stat ${klass}"><div class="name">${k.toUpperCase()}</div><div class="value">${escapeHtml(String(stats[k]))}</div></div>`)
    .join('')}</div>`;
}

function renderStatsProgression(p, cc) {
  const out = [`<div class="card">`];
  if (p.priorities) out.push(`<div><span class="muted">Priorities:</span> <strong>${(p.priorities).join(' &gt; ')}</strong></div>`);
  if (p.cap_at_12) {
    out.push(`<h4 style="margin-top:.8rem">Final stats at level 12</h4>`);
    out.push(renderStatRow(p.cap_at_12, 'final'));
  }
  if (p.asi_plan) {
    out.push(`<h4 style="margin-top:1rem">ASI / Feat plan</h4>`);
    out.push(`<ul class="tips">`);
    for (const a of p.asi_plan) {
      out.push(`<li><strong>L${escapeHtml(String(a.level))}:</strong> ${escapeHtml(a.pick)} — <span class="muted">${escapeHtml(a.reason || '')}</span></li>`);
    }
    out.push(`</ul>`);
  }
  out.push(`</div>`);
  return out.join('');
}

function renderTimeline(levels) {
  const out = [`<div class="timeline">`];
  for (const l of levels) {
    const picks = (l.pick || []).map(p => `<li>${escapeHtml(p)}</li>`).join('');
    const notes = l.notes ? `<div class="notes">${renderMarkdownish(l.notes)}</div>` : '';
    out.push(`
      <div class="lvl">
        <div class="num">${escapeHtml(String(l.level))}<small>${escapeHtml(l.take || '')}</small></div>
        <div class="body">
          <h3>${escapeHtml(l.take || `Level ${l.level}`)}</h3>
          <ul>${picks}</ul>
          ${notes}
        </div>
      </div>
    `);
  }
  out.push(`</div>`);
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
    const label = act.replace('_', ' ').replace('act', 'Act').toUpperCase();
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

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Very lightweight markdown-ish: paragraphs + **bold** + line breaks.
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
