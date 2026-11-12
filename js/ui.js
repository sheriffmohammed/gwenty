/* ==========================================================================
   GWENT — presentation layer
   Screens, cards, table, modals, overlays, tooltips and tavern sound.
   ========================================================================== */
(function () {
  'use strict';

  var G = window.GWENT;
  var E = G.Engine;
  var UI = G.UI = {};

  var FACTION_LABEL = {
    northern: 'Northern Realms',
    nilfgaard: 'Nilfgaardian Empire',
    scoiatael: 'Scoia\'tael',
    monsters: 'Monsters',
    skellige: 'Skellige',
    neutral: 'Neutral'
  };
  var FACTION_MARK = {
    northern: 'North',
    nilfgaard: 'Nilfgaard',
    scoiatael: 'Scoia\'tael',
    monsters: 'Monsters',
    skellige: 'Skellige',
    neutral: 'Neutral'
  };
  var FACTION_ICON = {
    northern: 'i-crown',
    nilfgaard: 'i-sun',
    scoiatael: 'i-leaf',
    monsters: 'i-skull',
    skellige: 'i-ship',
    neutral: 'i-wolf'
  };
  var ABILITY_CLASS = {
    tightBond: 'bond',
    morale: 'morale',
    medic: 'medic',
    muster: 'muster',
    spy: 'spy',
    scorch: 'scorch',
    horn: 'horn',
    mardroeme: 'mardroeme',
    berserker: 'berserker',
    avenger: 'avenger',
    agile: 'agile',
    summon: 'summon'
  };
  var SPECIAL_PIP = {
    scorch: { icon: 'i-flame', name: 'Scorch', desc: 'Destroy the strongest non-hero unit or units.' },
    horn: { icon: 'i-horn', name: 'Commander\'s Horn', desc: 'Double all non-hero units on a row.' },
    decoy: { icon: 'i-mask', name: 'Decoy', desc: 'Return a friendly non-hero unit to your hand.' },
    mardroeme: { icon: 'i-mushroom', name: 'Mardroeme', desc: 'Transform Berserkers on a row.' },
    clear: { icon: 'i-sun', name: 'Clear Weather', desc: 'Remove all weather effects.' }
  };
  var ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
  var WEATHER_ROWS = { frost: 'Close combat', fog: 'Ranged', rain: 'Siege', storm: 'Ranged and siege' };
  var uiState = {
    tooltipTarget: null,
    audio: null,
    soundOn: true,
    soundPack: {},
    selection: null,
    coinToken: 0,
    modalOpen: false
  };
  UI.handlers = {};
  UI.state = null;
  UI.isModalOpen = function () { return uiState.modalOpen; };
  UI.getSelection = function () { return uiState.selection; };

  function esc(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function icon(id, className) {
    return '<svg class="icon ' + (className || '') + '" aria-hidden="true"><use href="#' + id + '"></use></svg>';
  }

  function artImage(src, className) {
    if (!src) return '';
    return '<img class="' + (className || '') + ' art-img" src="' + esc(src) +
      '" alt="" decoding="async" draggable="false">';
  }

  function bindArtFallback() {
    document.addEventListener('error', function (event) {
      var img = event.target;
      if (!img || img.tagName !== 'IMG' || !img.classList.contains('art-img')) return;
      img.classList.add('is-missing');
      var card = img.closest ? img.closest('.card') : null;
      if (card) card.classList.add('card--no-art');
    }, true);
  }

  function setFactionVars(node, faction) {
    if (!node) return;
    var f = faction || 'neutral';
    node.style.setProperty('--faction', 'var(--faction-' + f + ')');
    node.style.setProperty('--faction-bright', 'var(--faction-' + f + '-bright)');
    node.style.setProperty('--faction-deep', 'var(--faction-' + f + '-deep)');
  }

  function factionClass(faction) {
    return 'card--faction-' + (faction || 'neutral');
  }

  function roman(n) { return ROMAN[n] || String(n); }

  function abilityPips(card) {
    var pips = [];
    if (card.special) {
      var special = SPECIAL_PIP[card.special] || (G.WEATHER[card.special] ? {
        icon: G.WEATHER[card.special].icon,
        name: G.WEATHER[card.special].name,
        desc: G.WEATHER[card.special].desc
      } : null);
      if (special) {
        pips.push('<span class="ability-pip" title="' + esc(special.name) + '">' + icon(special.icon) + '</span>');
      }
      return pips.join('');
    }
    (card.abilities || []).forEach(function (id) {
      var ability = G.ABILITIES[id];
      if (!ability) return;
      pips.push('<span class="ability-pip ability-pip--' + (ABILITY_CLASS[id] || '') +
        '" title="' + esc(ability.name) + '">' + icon(ability.icon) + '</span>');
    });
    return pips.join('');
  }

  function cardTitle(card) {
    if (!card) return '';
    if (card.special) {
      var special = SPECIAL_PIP[card.special];
      return special ? special.name : card.name;
    }
    return G.rowName(card);
  }

  function createCard(card, opts) {
    opts = opts || {};
    if (!card) return null;
    var tag = opts.tag || 'div';
    var node = document.createElement(tag);
    if (tag === 'button') node.type = 'button';
    var classes = ['card', factionClass(card.faction)];
    if (card.hero) classes.push('card--hero');
    if (card.special) classes.push('card--special');
    if (opts.variant) classes.push('card--' + opts.variant);
    if (opts.className) classes.push(opts.className);
    if (opts.extraClass) classes.push(opts.extraClass);
    if (opts.selected) classes.push('is-selected');
    if (opts.targetable) classes.push('is-targetable');
    if (opts.dimmed) classes.push('is-dimmed');
    if (opts.unplayable) classes.push('is-unplayable');
    if (opts.justPlayed) classes.push('card--just-played');
    if (opts.isNew) classes.push('is-new');
    node.className = classes.join(' ');
    node.setAttribute('data-card-id', card.id);
    node.setAttribute('data-tip', 'card');
    if (opts.uid) node.setAttribute('data-uid', opts.uid);
    if (opts.boardSide) node.setAttribute('data-side', opts.boardSide);
    if (opts.owner) node.setAttribute('data-owner', opts.owner);
    if (opts.value !== undefined && opts.value !== null) node.setAttribute('data-value', opts.value);
    node.setAttribute('aria-label', card.name + (card.special ? '' : ', strength ' + card.strength));

    var value = opts.value;
    if (value === undefined || value === null) value = card.special ? null : card.strength;
    var strengthClass = '';
    if (!card.special && value !== null && value !== card.strength) {
      strengthClass = value > card.strength ? ' is-buffed' : ' is-reduced';
    }

    node.innerHTML =
      '<div class="card__art">' +
        '<div class="card__art-pattern"></div>' +
        artImage(card.art, 'card__art-img') +
        '<div class="card__icon-wrap">' + icon(card.icon || 'i-star', 'card__icon') + '</div>' +
      '</div>' +
      (card.special ? '' : '<div class="card__strength' + strengthClass + '">' + value + '</div>') +
      '<div class="card__row" title="' + esc(cardTitle(card)) + '">' +
        icon(card.special ? (card.icon || 'i-star') : G.rowIcon(card)) +
      '</div>' +
      '<div class="card__abilities">' + abilityPips(card) + '</div>' +
      '<div class="card__nameplate">' +
        '<span class="card__name">' + esc(card.name) + '</span>' +
        '<span class="card__faction-mark">' + esc(FACTION_MARK[card.faction] || 'Neutral') + '</span>' +
      '</div>';

    if (opts.tipValue !== undefined && opts.tipValue !== null) node.setAttribute('data-tip-value', opts.tipValue);
    if (opts.tipBase !== undefined && opts.tipBase !== null) node.setAttribute('data-tip-base', opts.tipBase);
    return node;
  }

  function cardTipHtml(card, inst, value) {
    if (!card) return '';
    var parts = [];
    parts.push('<strong>' + esc(card.name) + '</strong>');
    if (card.special) {
      var specialName = SPECIAL_PIP[card.special];
      if (G.WEATHER[card.special]) {
        parts.push('<div>' + esc(G.WEATHER[card.special].name) + ' — affects ' +
          esc(WEATHER_ROWS[card.special] || 'the battlefield') + '.</div>');
        parts.push('<div>' + esc(G.WEATHER[card.special].desc) + '</div>');
      } else if (specialName && specialName.desc) {
        parts.push('<div>' + esc(specialName.desc) + '</div>');
      } else if (card.special === 'clear') {
        parts.push('<div>Remove every weather effect from both battlefields.</div>');
      }
      return parts.join('');
    }
    var meta = FACTION_LABEL[card.faction] || 'Neutral';
    meta += ' · ' + G.rowName(card);
    meta += ' · Base strength ' + card.strength;
    parts.push('<div>' + esc(meta) + '</div>');
    if (value !== undefined && value !== null && Number(value) !== card.strength) {
      parts.push('<div><b>Current strength:</b> ' + esc(value) + '</div>');
    }
    if (card.hero) {
      parts.push('<span class="tip-ability"><b>Hero.</b> Immune to weather, Scorch, Decoy and hostile effects.</span>');
    }
    (card.abilities || []).forEach(function (id) {
      var ability = G.ABILITIES[id];
      if (!ability) return;
      parts.push('<span class="tip-ability"><b>' + esc(ability.name) + '.</b> ' + esc(ability.desc) + '</span>');
    });
    if (inst && inst.owner && inst.owner !== (inst.boardSide || inst.owner)) {
      parts.push('<span class="tip-ability"><b>Spy.</b> Counts for the other commander.</span>');
    }
    return parts.join('');
  }

  function leaderTipHtml(leader, state) {
    if (!leader) return '';
    var used = state && state.usedLeaders[leader.faction === state.playerFaction ? 'player' : 'enemy'];
    var html = '<strong>' + esc(leader.name + (leader.epithet ? ' — ' + leader.epithet : '')) + '</strong>' +
      '<div><b>' + esc(leader.ability) + '</b></div><div>' + esc(leader.desc) + '</div>';
    if (leader.passive) html += '<span class="tip-ability"><b>Passive.</b> Always in effect.</span>';
    else if (used) html += '<span class="tip-ability"><b>Spent.</b> This commander has already acted.</span>';
    return html;
  }

  function weatherTipHtml(type) {
    var weather = G.WEATHER[type];
    if (!weather) return '';
    return '<strong>' + esc(weather.name) + '</strong><div>Affects ' +
      esc(WEATHER_ROWS[type] || 'the battlefield') + '.</div><div>' + esc(weather.desc) + '</div>';
  }

  /* ------------------------------------------------------------------------
     Tooltip
     ------------------------------------------------------------------------ */

  function positionTip(clientX, clientY) {
    var tip = UI.els.tooltip;
    var pad = 12;
    var width = tip.offsetWidth;
    var height = tip.offsetHeight;
    var x = clientX + 16;
    var y = clientY + 18;
    if (x + width > window.innerWidth - pad) x = clientX - width - 16;
    if (y + height > window.innerHeight - pad) y = clientY - height - 12;
    x = Math.max(pad, x);
    y = Math.max(pad, y);
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  function showTipFor(target, x, y) {
    var tip = UI.els.tooltip;
    if (!tip || !target) return;
    var kind = target.getAttribute('data-tip');
    var html = '';
    if (kind === 'card') {
      var card = G.CARDS[target.getAttribute('data-card-id')];
      var value = target.getAttribute('data-tip-value');
      if (value === null) value = target.getAttribute('data-value');
      html = cardTipHtml(card, null, value);
    } else if (kind === 'leader') {
      var leader = G.LEADERS[target.getAttribute('data-leader-id')];
      html = leaderTipHtml(leader, UI.state);
    } else if (kind === 'weather') {
      html = weatherTipHtml(target.getAttribute('data-weather-id'));
    } else if (kind === 'generic') {
      html = '<strong>' + esc(target.getAttribute('data-tip-title') || '') + '</strong>' +
        '<div>' + esc(target.getAttribute('data-tip-body') || '') + '</div>';
    }
    if (!html) return;
    tip.innerHTML = html;
    tip.hidden = false;
    uiState.tooltipTarget = target;
    positionTip(x, y);
  }

  function hideTip() {
    if (UI.els.tooltip) UI.els.tooltip.hidden = true;
    uiState.tooltipTarget = null;
  }

  function findTipTarget(node) {
    return node && node.closest ? node.closest('[data-tip]') : null;
  }

  function bindTooltip() {
    document.addEventListener('pointerover', function (event) {
      var target = findTipTarget(event.target);
      if (!target || target === uiState.tooltipTarget) return;
      showTipFor(target, event.clientX, event.clientY);
    });
    document.addEventListener('pointermove', function (event) {
      if (!uiState.tooltipTarget) return;
      positionTip(event.clientX, event.clientY);
    });
    document.addEventListener('pointerout', function (event) {
      if (!uiState.tooltipTarget) return;
      var next = event.relatedTarget;
      if (next && uiState.tooltipTarget.contains(next)) return;
      if (next && findTipTarget(next) === uiState.tooltipTarget) return;
      hideTip();
    });
    document.addEventListener('focusin', function (event) {
      var target = findTipTarget(event.target);
      if (!target) return;
      var rect = target.getBoundingClientRect();
      showTipFor(target, rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
    document.addEventListener('focusout', function () { hideTip(); });
    window.addEventListener('scroll', hideTip, true);
  }

  /* ------------------------------------------------------------------------
     Sound
     ------------------------------------------------------------------------ */

  function loadSoundSetting() {
    try {
      var value = window.localStorage.getItem('gwent-sound');
      if (value !== null) uiState.soundOn = value !== 'off';
    } catch (err) { /* file:// storage may be unavailable */ }
  }

  function saveSoundSetting() {
    try { window.localStorage.setItem('gwent-sound', uiState.soundOn ? 'on' : 'off'); } catch (err) { /* ignore */ }
  }

  function audioContext() {
    if (!uiState.soundOn) return null;
    if (!uiState.audio) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      try { uiState.audio = new Ctx(); } catch (err) { return null; }
    }
    if (uiState.audio.state === 'suspended') uiState.audio.resume();
    return uiState.audio;
  }

  function tone(freq, endFreq, duration, type, gainValue, delay) {
    var ctx = audioContext();
    if (!ctx) return;
    var start = ctx.currentTime + (delay || 0);
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq && endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue || 0.05), start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  function noise(duration, gainValue, delay, options) {
    var ctx = audioContext();
    if (!ctx) return;
    options = options || {};
    var start = ctx.currentTime + (delay || 0);
    var length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    var buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    var source = ctx.createBufferSource();
    var filter = ctx.createBiquadFilter();
    var gain = ctx.createGain();
    filter.type = options.type || 'bandpass';
    filter.frequency.setValueAtTime(options.freq || 700, start);
    if (options.endFreq) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, options.endFreq), start + duration);
    }
    filter.Q.value = options.q === undefined ? 0.8 : options.q;
    gain.gain.setValueAtTime(gainValue || 0.02, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(start);
  }

  // A sound pack is optional. Drop MP3 files named after the events into
  // assets/audio/ and they replace the synthesized tavern sounds. Missing
  // files fall back to the Web Audio versions without breaking the game.
  var SOUND_PACK_DIR = 'assets/audio/';
  var SOUND_PACK_VOLUME = 0.72;

  function playPackSound(name) {
    if (!uiState.soundOn) return false;
    if (!uiState.soundPack) uiState.soundPack = {};
    var entry = uiState.soundPack[name];
    if (entry === false) return false;
    if (!entry) {
      var AudioCtor = window.Audio;
      if (!AudioCtor) { uiState.soundPack[name] = false; return false; }
      try {
        entry = new AudioCtor(SOUND_PACK_DIR + name + '.mp3');
      } catch (err) {
        uiState.soundPack[name] = false;
        return false;
      }
      entry.preload = 'auto';
      entry.volume = SOUND_PACK_VOLUME;
      entry.addEventListener('error', function () { uiState.soundPack[name] = false; });
      uiState.soundPack[name] = entry;
    }
    if (entry.error) return false;
    if (entry.readyState < 2) return false;
    try {
      entry.currentTime = 0;
      var promise = entry.play();
      if (promise && typeof promise.catch === 'function') promise.catch(function () { /* gesture may be required */ });
      return true;
    } catch (err) {
      return false;
    }
  }

  function playSound(name) {
    if (!uiState.soundOn) return;
    if (playPackSound(name)) return;
    switch (name) {
      case 'click':
        tone(320, 240, 0.05, 'triangle', 0.028);
        noise(0.03, 0.012, 0, { type: 'highpass', freq: 1800 });
        break;
      case 'select': tone(560, 720, 0.07, 'sine', 0.03); break;
      case 'play':
        noise(0.12, 0.045, 0, { type: 'lowpass', freq: 1800, endFreq: 480 });
        tone(122, 62, 0.18, 'sine', 0.06);
        break;
      case 'deal':
        noise(0.08, 0.032, 0, { type: 'highpass', freq: 900, endFreq: 1700 });
        tone(520, 360, 0.06, 'triangle', 0.02);
        break;
      case 'shuffle':
        noise(0.3, 0.028, 0, { type: 'bandpass', freq: 1300, endFreq: 520, q: 0.6 });
        noise(0.16, 0.018, 0.12, { type: 'bandpass', freq: 900, endFreq: 400, q: 0.6 });
        break;
      case 'coin':
        tone(1046, 980, 0.5, 'sine', 0.032);
        tone(1568, 1400, 0.34, 'sine', 0.018, 0.02);
        noise(0.05, 0.016, 0, { type: 'highpass', freq: 3000 });
        break;
      case 'coinLand':
        tone(760, 420, 0.35, 'sine', 0.05);
        tone(1140, 860, 0.26, 'triangle', 0.018, 0.04);
        noise(0.08, 0.018, 0, { type: 'highpass', freq: 2500 });
        break;
      case 'pass':
        tone(300, 180, 0.3, 'sine', 0.03);
        noise(0.18, 0.018, 0, { type: 'lowpass', freq: 700, endFreq: 300 });
        break;
      case 'weather':
        noise(1.1, 0.042, 0, { type: 'lowpass', freq: 950, endFreq: 220 });
        tone(92, 54, 1, 'sine', 0.032);
        break;
      case 'leader':
        tone(146, 146, 0.38, 'sawtooth', 0.018);
        tone(220, 220, 0.52, 'triangle', 0.03, 0.1);
        tone(293, 293, 0.5, 'triangle', 0.016, 0.18);
        break;
      case 'horn':
        tone(196, 196, 0.7, 'sawtooth', 0.026);
        tone(294, 294, 0.7, 'sawtooth', 0.018, 0.03);
        tone(392, 392, 0.6, 'triangle', 0.014, 0.06);
        break;
      case 'mardroeme':
        tone(140, 210, 0.4, 'sine', 0.03);
        tone(210, 280, 0.3, 'triangle', 0.014, 0.08);
        break;
      case 'destroy':
        noise(0.3, 0.05, 0, { type: 'lowpass', freq: 1200, endFreq: 200 });
        tone(130, 40, 0.35, 'sawtooth', 0.04);
        break;
      case 'error':
        tone(190, 140, 0.16, 'square', 0.022);
        tone(140, 100, 0.18, 'square', 0.016, 0.08);
        break;
      case 'round':
        tone(196, 196, 0.7, 'sine', 0.045);
        tone(392, 392, 0.5, 'sine', 0.018, 0.02);
        noise(0.12, 0.018, 0, { type: 'lowpass', freq: 1200 });
        break;
      case 'victory': [262, 330, 392, 523].forEach(function (f, i) { tone(f, f, 0.45, 'triangle', 0.045, i * 0.16); }); break;
      case 'defeat': [240, 200, 160].forEach(function (f, i) { tone(f, f * 0.84, 0.5, 'sine', 0.04, i * 0.2); }); break;
      default: break;
    }
  }

  UI.sound = playSound;

  function updateSoundButton() {
    var btn = UI.els.btnSound;
    if (!btn) return;
    btn.innerHTML = icon(uiState.soundOn ? 'i-sound-on' : 'i-sound-off');
    btn.setAttribute('aria-label', uiState.soundOn ? 'Mute sound' : 'Unmute sound');
    btn.setAttribute('title', uiState.soundOn ? 'Sound on' : 'Sound off');
    btn.setAttribute('aria-pressed', uiState.soundOn ? 'false' : 'true');
  }

  UI.toggleSound = function () {
    uiState.soundOn = !uiState.soundOn;
    saveSoundSetting();
    updateSoundButton();
    if (uiState.soundOn) {
      uiState.soundPack = {};
      playSound('select');
    }
    UI.toast(uiState.soundOn ? 'Sound on' : 'Sound muted', 'info');
  };

  UI.setSound = function (on) {
    uiState.soundOn = !!on;
    saveSoundSetting();
    updateSoundButton();
  };

  /* ------------------------------------------------------------------------
     Toast
     ------------------------------------------------------------------------ */

  UI.toast = function (text, kind, duration) {
    var stack = UI.els.toastStack;
    if (!stack || !text) return;
    var toast = document.createElement('div');
    toast.className = 'toast' + (kind ? ' toast--' + kind : '');
    toast.innerHTML = icon(kind === 'danger' ? 'i-skull' : kind === 'weather' ? 'i-fog' :
      kind === 'score' ? 'i-star' : kind === 'opponent' ? 'i-eye' : 'i-gem') +
      '<span>' + esc(text) + '</span>';
    stack.appendChild(toast);
    while (stack.children.length > 3) stack.removeChild(stack.firstChild);
    var hold = Math.max(1200, duration || 2300);
    window.setTimeout(function () { toast.classList.add('is-out'); }, hold);
    window.setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, hold + 350);
  };

  UI.els = {};
  UI.store = uiState;
  UI.createCard = createCard;
  UI.icon = icon;
  UI.artImage = artImage;
  UI.bindArtFallback = bindArtFallback;
  UI.esc = esc;
  UI.setFactionVars = setFactionVars;
  UI.factionLabel = function (f) { return FACTION_LABEL[f] || f; };
  UI.roman = roman;
  UI.cardTipHtml = cardTipHtml;
  UI.leaderTipHtml = leaderTipHtml;
  UI.playSound = playSound;
  UI.loadSoundSetting = loadSoundSetting;
  UI.updateSoundButton = updateSoundButton;
  UI.bindTooltip = bindTooltip;
  UI.hideTip = hideTip;
})();

/* ==========================================================================
   Screens, title showcase, setup and live table rendering
   ========================================================================== */
(function () {
  'use strict';

  var G = window.GWENT;
  var E = G.Engine;
  var UI = G.UI;
  var use = UI.icon;
  var artImage = UI.artImage;
  var ROWS = G.ROW_ORDER;
  var SIDES = ['player', 'enemy'];
  var uiState = UI.store;
  var WEATHER_ROWS = {
    frost: 'Close combat',
    fog: 'Ranged',
    rain: 'Siege',
    storm: 'Ranged and siege'
  };

  function $(id) { return document.getElementById(id); }
  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  function renderTitle() {
    var picks = ['nt-ciri', 'nt-geralt', 'nt-yennefer'];
    picks.forEach(function (id, i) {
      var host = $('title-card-' + (i + 1));
      if (!host) return;
      host.innerHTML = '';
      var card = G.CARDS[id];
      if (card) host.appendChild(UI.createCard(card, { className: 'title-card' }));
    });
  }

  function renderSetup(setup) {
    var factionGrid = $('faction-grid');
    var leaderList = $('leader-list');
    var deckbar = $('setup-deckbar');
    var opponent = $('setup-opponent');
    var start = $('btn-start');
    if (!factionGrid || !leaderList) return;

    factionGrid.innerHTML = '';
    G.FACTION_ORDER.forEach(function (id) {
      var faction = G.FACTIONS[id];
      var selected = setup.faction === id;
      var btn = el('button', 'faction-card' + (selected ? ' is-selected' : ''));
      btn.type = 'button';
      btn.setAttribute('role', 'listitem');
      btn.setAttribute('data-faction', id);
      btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
      UI.setFactionVars(btn, id);
      btn.innerHTML =
        '<span class="faction-card__selected-mark">' + use('i-star') + '</span>' +
        '<span class="faction-card__crest">' + use(faction.icon) + '</span>' +
        '<span class="faction-card__name">' + UI.esc(faction.name) + '</span>' +
        '<span class="faction-card__otype">' + UI.esc(faction.otype) + '</span>' +
        '<span class="faction-card__passive">' + UI.esc(faction.passive) + '</span>';
      factionGrid.appendChild(btn);
    });

    var faction = G.FACTIONS[setup.faction];
    leaderList.innerHTML = '';
    if (faction) {
      UI.setFactionVars(leaderList, setup.faction);
      G.leadersFor(setup.faction).forEach(function (leader) {
        var selected = setup.leaderId === leader.id;
        var btn = el('button', 'leader-option' + (selected ? ' is-selected' : ''));
        btn.type = 'button';
        btn.setAttribute('data-leader', leader.id);
        btn.setAttribute('data-tip', 'leader');
        btn.setAttribute('data-leader-id', leader.id);
        btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
        btn.innerHTML =
          '<span class="leader-option__crest">' + use(leader.icon || faction.icon) +
            artImage(leader.art, 'leader-option__crest-img') + '</span>' +
          '<span class="leader-option__body">' +
            '<span class="leader-option__name">' + UI.esc(leader.name + (leader.epithet ? ' — ' + leader.epithet : '')) + '</span>' +
            '<span class="leader-option__ability">' + UI.esc(leader.ability + '. ' + leader.desc) + '</span>' +
          '</span>' +
          '<span class="leader-option__check">' + use('i-star') + '</span>';
        leaderList.appendChild(btn);
      });
    }

    if (deckbar && faction) {
      UI.setFactionVars(deckbar, setup.faction);
      var ids = G.deckFor(setup.faction);
      var stats = G.deckStats(ids);
      var preview = [];
      var seen = Object.create(null);
      ids.forEach(function (id) {
        if (preview.length >= 6 || seen[id]) return;
        var card = G.CARDS[id];
        if (!card || card.special) return;
        seen[id] = true;
        preview.push(card);
      });
      var rowbars = [
        ['Close', stats.rowBars.melee],
        ['Ranged', stats.rowBars.ranged],
        ['Siege', stats.rowBars.siege]
      ].map(function (entry) {
        var pct = stats.units ? Math.max(2, Math.round(entry[1] / stats.units * 100)) : 0;
        return '<span class="deck-rowbar"><span>' + entry[0] + '</span><span class="deck-rowbar__track">' +
          '<span class="deck-rowbar__fill" style="width:' + pct + '%"></span></span></span>';
      }).join('');
      deckbar.innerHTML =
        '<div class="deckbar-head">' +
          '<span class="deckbar-title">' + UI.esc(faction.deckName) + '</span>' +
          '<span class="deckbar-counts">' +
            '<span><strong>' + stats.total + '</strong> cards</span>' +
            '<span><strong>' + stats.units + '</strong> units</span>' +
            '<span><strong>' + stats.heroes + '</strong> heroes</span>' +
          '</span>' +
        '</div>' +
        '<div class="deckbar-body">' +
          '<div class="deckbar-lead"><em>' + UI.esc(faction.passiveName) + '</em> — ' +
            UI.esc(faction.passive) + '<div class="deck-rowbars">' + rowbars + '</div></div>' +
          '<div class="deck-preview" id="deck-preview"></div>' +
        '</div>';
      var previewHost = $('deck-preview');
      preview.forEach(function (card, i) {
        var node = UI.createCard(card, { className: 'deck-preview-card' });
        node.style.setProperty('--tilt', ((i - (preview.length - 1) / 2) * 3.2) + 'deg');
        previewHost.appendChild(node);
      });
    }

    if (opponent && setup.opponentFaction) {
      var enemyFaction = G.FACTIONS[setup.opponentFaction];
      var enemyLeader = G.LEADERS[setup.opponentLeaderId];
      UI.setFactionVars(opponent, setup.opponentFaction);
      opponent.innerHTML = use(enemyFaction.icon) +
        '<span>Your opponent: <strong>' + UI.esc(enemyFaction.name) + '</strong>' +
        (enemyLeader ? ' led by <strong>' + UI.esc(enemyLeader.name + (enemyLeader.epithet ? ', ' + enemyLeader.epithet : '')) + '</strong>' : '') +
        '</span>';
    }

    if (start) {
      start.disabled = !(setup.faction && setup.leaderId && setup.opponentFaction && setup.opponentLeaderId);
    }
  }

  function pileButton(side, pile, count, iconId, label, extraClass) {
    return '<button class="pile-btn' + (count ? '' : ' is-empty') + (extraClass ? ' ' + extraClass : '') +
      '" data-pile="' + pile + '" data-side="' + side +
      '" aria-label="' + UI.esc(label + ': ' + count + ' card' + (count === 1 ? '' : 's')) +
      '" data-tip="generic" data-tip-title="' + UI.esc(label) + '" data-tip-body="' +
      UI.esc(count + ' card' + (count === 1 ? '' : 's') + '. Click to inspect.') + '">' +
      use(iconId) + '<span>' + count + '</span></button>';
  }

  function leaderButton(state, side) {
    var leader = E.leaderOfSide(state, side);
    if (!leader) return '';
    var faction = E.factionOfSide(state, side);
    var check = E.canUseLeader(state, side);
    var active = !leader.passive && !state.usedLeaders[side] && !state.cancelledLeaders[side] && check.ok;
    var cls = 'hud__leader';
    if (leader.passive || state.usedLeaders[side] || state.cancelledLeaders[side]) cls += ' is-spent';
    if (active) cls += ' is-ready';
    return '<button class="' + cls + '" data-hud-side="' + side + '" data-tip="leader" data-leader-id="' + leader.id +
      '" aria-label="' + UI.esc(leader.name + ', ' + leader.ability) + '">' +
      artImage(leader.art, 'hud__leader-img') +
      use(leader.icon || (G.FACTIONS[faction] && G.FACTIONS[faction].icon) || 'i-crown') +
      '<span class="hud__leader-crown">' + use(leader.passive ? 'i-star' : 'i-crown') + '</span></button>';
  }

  function renderHud(state, side) {
    var host = side === 'player' ? $('hud-player') : $('hud-enemy');
    if (!host) return;
    var faction = G.FACTIONS[E.factionOfSide(state, side)];
    var leader = E.leaderOfSide(state, side);
    var score = E.scoreSide(state, side);
    var other = E.scoreSide(state, E.other(side));
    var gems = state.gems[side];
    var active = state.phase === 'playing' && state.turn === side;
    var passed = state.passed[side];
    var deckCount = state.decks[side].length;
    var graveCount = state.graves[side].length;
    var handCount = state.hands[side].length;
    var prevHand = host.getAttribute('data-hand-count');
    var handChanged = prevHand !== null && prevHand !== String(handCount);
    host.setAttribute('data-hand-count', String(handCount));
    var prevScore = host.getAttribute('data-score');
    var scoreChanged = prevScore !== null && prevScore !== String(score);
    host.setAttribute('data-score', String(score));
    var status = '';
    if (state.phase === 'mulligan') status = 'Mulligan';
    else if (state.phase === 'choosing') status = 'Choosing';
    else if (state.phase === 'roundEnd') status = 'Round over';
    else if (state.phase === 'gameover') status = 'Match over';
    else if (passed) status = 'Passed';
    else if (state.turn === side) status = side === 'player' ? 'Your move' : 'Their move';
    else status = side === 'player' ? 'Waiting' : 'Opponent';
    var ribbonCls = 'turn-ribbon';
    if (passed) ribbonCls += ' is-passed';
    else if (active) ribbonCls += ' is-active';

    UI.setFactionVars(host, faction ? faction.id : 'neutral');
    host.className = 'hud hud--' + side + (active ? ' is-active' : '') + (passed ? ' is-passed' : '');
    var gemHtml = '';
    for (var i = 0; i < 2; i += 1) gemHtml += '<span class="gem' + (i < gems ? ' is-won' : '') + '"></span>';
    host.innerHTML =
      '<div class="hud__identity">' +
        leaderButton(state, side) +
        '<div class="hud__names">' +
          '<span class="hud__eyebrow"><span class="hud__eyebrow-prefix">' +
            (side === 'player' ? 'Your banner' : 'Opponent') + ' · </span>' +
            UI.esc(faction ? faction.name : '') + '</span>' +
          '<span class="hud__leader-name">' + UI.esc(leader ? leader.name : '') +
            (leader && leader.epithet ? '<span class="hud__leader-epithet">, ' + UI.esc(leader.epithet) + '</span>' : '') +
          '</span>' +
          '<span class="hud__leader-sub">' + UI.esc(leader ? leader.ability : '') + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="hud__gems"><span class="hud__gems-label">Gems</span>' + gemHtml + '</div>' +
      '<div class="hud__score"><span class="hud__score-label">Strength</span>' +
        '<div class="score-plate' + (score > other ? ' is-leading' : '') + (scoreChanged ? ' is-bumped' : '') + '"><strong>' + score + '</strong></div>' +
      '</div>' +
      '<div class="hud__piles">' +
        pileButton(side, 'deck', deckCount, 'i-tower', 'Deck') +
        pileButton(side, 'grave', graveCount, 'i-skull', 'Discard pile') +
        pileButton(side, 'hand', handCount, 'i-scroll', side === 'player' ? 'Your hand' : 'Opponent hand',
          'pile-btn--hand' + (handChanged ? ' is-changed' : '')) +
      '</div>' +
      '<div class="hud__status"><span class="' + ribbonCls + '">' +
        use(passed ? 'i-cross' : active ? 'i-sword' : 'i-gem') + status + '</span></div>';

    var leaderBtn = host.querySelector('.hud__leader');
    if (leaderBtn) {
      leaderBtn.setAttribute('data-tip', 'leader');
      leaderBtn.setAttribute('data-leader-id', leader.id);
      if (side === 'enemy') leaderBtn.setAttribute('aria-disabled', 'true');
    }
  }

  function renderRoundTracker(state) {
    var host = $('round-tracker');
    if (!host) return;
    var ticks = '';
    for (var i = 1; i <= 3; i += 1) {
      var cls = 'round-tick';
      if (i < state.round) cls += ' is-done';
      else if (i === state.round && state.phase !== 'gameover') cls += ' is-current';
      ticks += '<span class="' + cls + '"></span>';
    }
    host.innerHTML = '<span class="round-tracker__label">Best of three</span><div class="round-ticks">' + ticks + '</div>' +
      '<span class="round-tracker__gem">' + use('i-gem') + state.gems.player + '–' + state.gems.enemy + '</span>';
  }

  function rowOrder(side) {
    return side === 'enemy' ? ['siege', 'ranged', 'melee'] : ['melee', 'ranged', 'siege'];
  }

  function rowBadges(state, side, row) {
    var badges = '';
    E.weatherTypesForRow(state, row).forEach(function (type) {
      badges += '<span class="row-badge row-badge--weather" title="' + UI.esc(G.WEATHER[type].name) + '">' +
        use(G.WEATHER[type].icon) + '</span>';
    });
    var rowObj = state.rows[side][row];
    if (rowObj.horn) badges += '<span class="row-badge row-badge--horn" title="Commander\'s Horn">' + use('i-horn') + '</span>';
    if (rowObj.leaderDouble) badges += '<span class="row-badge row-badge--horn" title="Row doubling">' + use('i-crown') + '</span>';
    if (rowObj.mardroeme) badges += '<span class="row-badge row-badge--mardroeme" title="Mardroeme">' + use('i-mushroom') + '</span>';
    return badges;
  }

  function rowWeather(state, row) {
    var types = E.weatherTypesForRow(state, row);
    if (types.indexOf('storm') !== -1) return 'storm';
    return types[0] || null;
  }

  function targetSet(selection) {
    var map = Object.create(null);
    if (!selection) return map;
    if (selection.kind === 'friendly-unit' && selection.units) {
      selection.units.forEach(function (uid) { map[uid] = true; });
    }
    return map;
  }

  function renderRows(state, animateUid) {
    SIDES.forEach(function (side) {
      var host = side === 'player' ? $('rows-player') : $('rows-enemy');
      if (!host) return;
      var scrolls = {};
      host.querySelectorAll('.row').forEach(function (rowNode) {
        var scroll = rowNode.querySelector('.row__scroll');
        if (scroll) scrolls[rowNode.getAttribute('data-row')] = scroll.scrollLeft;
      });
      host.innerHTML = '';
      rowOrder(side).forEach(function (rowName) {
        var row = state.rows[side][rowName];
        var score = E.scoreRow(state, side, rowName);
        var rowNode = el('div', 'row row--' + side);
        var weather = rowWeather(state, rowName);
        if (weather) rowNode.setAttribute('data-weather', weather);
        rowNode.setAttribute('data-row', rowName);
        rowNode.setAttribute('data-side', side);
        if (row.horn) rowNode.classList.add('has-horn');
        if (row.mardroeme) rowNode.classList.add('has-mardroeme');
        if (state.phase === 'playing' && state.turn === side) rowNode.classList.add('is-active-side');
        var hasLanded = !!(animateUid && row.cards.some(function (inst) { return inst.uid === animateUid; }));
        if (hasLanded) rowNode.classList.add('is-landed');
        var selection = uiState.selection;
        if (selection && selection.rows && selection.rows[side + ':' + rowName]) {
          rowNode.classList.add('is-deployable');
        }
        var targets = targetSet(selection);
        var rowTargets = row.cards.some(function (inst) { return targets[inst.uid]; });
        if (rowTargets) rowNode.classList.add('is-target-unit');

        var cardsHtml = '';
        row.cards.forEach(function (inst) {
          var card = G.CARDS[inst.cardId];
          if (!card) return;
          var cardNode = UI.createCard(card, {
            variant: 'board',
            uid: inst.uid,
            boardSide: side,
            owner: inst.owner,
            value: E.valueForInst(state, inst),
            targetable: !!targets[inst.uid],
            justPlayed: animateUid && animateUid === inst.uid,
            tipValue: E.valueForInst(state, inst)
          });
          if (targets[inst.uid]) {
            cardNode.setAttribute('role', 'button');
            cardNode.setAttribute('tabindex', '0');
            cardNode.setAttribute('aria-label', 'Return ' + card.name + ' with Decoy');
          }
          cardsHtml += cardNode.outerHTML;
        });

        rowNode.innerHTML =
          '<div class="row__label">' + use(G.ROWS[rowName].icon) +
            '<span class="row__label-name">' + UI.esc(G.ROWS[rowName].short) + '</span>' +
            '<span class="row__label-sub">' + UI.esc(G.ROWS[rowName].sub) + '</span>' +
          '</div>' +
          '<div class="row__scroll"><div class="row__cards">' + cardsHtml + '</div></div>' +
          '<div class="row__score' + (score > 0 ? ' is-buffed' : '') + '"><strong>' + score + '</strong><span>str</span></div>' +
          '<div class="row__badges">' + rowBadges(state, side, rowName) + '</div>' +
          (row.cards.length ? '' : '<div class="row__empty">' + UI.esc(rowEmptyText(rowName)) + '</div>');
        host.appendChild(rowNode);
        if (scrolls[rowName]) rowNode.querySelector('.row__scroll').scrollLeft = scrolls[rowName];
      });
    });
  }

  function rowEmptyText(row) {
    if (row === 'melee') return 'No blades drawn';
    if (row === 'ranged') return 'No arrows in the air';
    return 'The siege lines are quiet';
  }

  function renderWeather(state) {
    var host = $('weather-strip');
    if (!host) return;
    var chips = '';
    state.weatherZone.forEach(function (inst) {
      var card = G.CARDS[inst.cardId];
      if (!card || !card.weather) return;
      var weather = G.WEATHER[card.weather];
      chips += '<span class="weather-chip" data-tip="weather" data-weather-id="' + card.weather + '">' +
        use(weather.icon) + weather.name + ' <em>' + UI.esc(WEATHER_ROWS[card.weather] || '') + '</em></span>';
    });
    host.innerHTML =
      '<span class="weather-strip__label">' + use('i-fog') + 'Weather</span>' +
      '<div class="weather-strip__center">' + (chips || '<span class="weather-clear">Fair skies over both battlefields</span>') + '</div>' +
      '<span class="weather-strip__owner">' + (chips ? 'Both sides' : 'No active weather') + '</span>';
  }

  function hintText(state) {
    var selection = uiState.selection;
    if (state.phase === 'mulligan') {
      if (state.mulligan.player.done) return 'Hand locked. Waiting for your opponent to finish their mulligan.';
      var left = state.mulligan.player.remaining;
      return left > 0
        ? 'Mulligan — click up to ' + left + ' card' + (left === 1 ? '' : 's') + ' to redraw, then lock your hand.'
        : 'Your mulligans are spent. Lock your hand to begin.';
    }
    if (state.phase === 'choosing') return 'A choice awaits your word.';
    if (state.phase === 'roundEnd') return 'The round is over.';
    if (state.phase === 'gameover') return 'The match is decided.';
    if (state.passed.player) return 'You have passed. Your opponent plays on.';
    if (state.turn !== 'player') return 'Your opponent studies the board…';
    if (selection) {
      if (selection.kind === 'friendly-unit') return 'Choose a friendly non-hero unit to return to your hand.';
      if (selection.kind === 'any-row') return selection.card && selection.card.special === 'mardroeme'
        ? 'Choose a row for the Mardroeme.' : 'Choose either commander\'s row to sound the horn.';
      if (selection.kind === 'own-row') return 'Choose close combat or ranged for this agile unit.';
      return 'Press Play to commit this card, or select another.';
    }
    return 'Your move. Select a card to play.';
  }

  function renderHand(state) {
    var hand = $('hand');
    if (!hand) return;
    hand.innerHTML = '';
    var cards = state.hands.player.slice();
    var count = cards.length;
    var counter = $('hand-count');
    if (counter) {
      var strong = counter.querySelector('strong');
      var prevCount = counter.getAttribute('data-count');
      if (strong) strong.textContent = count;
      if (prevCount !== null && prevCount !== String(count)) {
        counter.classList.remove('is-changed');
        void counter.offsetWidth;
        counter.classList.add('is-changed');
      }
      counter.setAttribute('data-count', String(count));
    }
    var compact = window.innerWidth <= 760;
    var overlap = count > 9 ? -38 : count > 7 ? -30 : count > 5 ? -22 : -14;
    hand.style.setProperty('--hand-overlap', overlap + 'px');
    var selection = uiState.selection;
    var canAct = (state.phase === 'mulligan' && !state.mulligan.player.done) ||
      (state.phase === 'playing' && state.turn === 'player' && !state.passed.player);
    cards.forEach(function (inst, index) {
      var card = G.CARDS[inst.cardId];
      if (!card) return;
      var mid = (count - 1) / 2;
      var maxFan = compact ? 1.4 : 2.7;
      var fan = (index - mid) * Math.min(maxFan, (compact ? 9 : 16) / Math.max(6, count));
      var lift = compact ? 0 : Math.abs(index - mid) * 2.3;
      var node = UI.createCard(card, {
        variant: 'hand',
        tag: 'button',
        uid: inst.uid,
        selected: selection && selection.uid === inst.uid,
        dimmed: !!(selection && selection.uid !== inst.uid),
        unplayable: !canAct,
        tipValue: card.special ? null : card.strength
      });
      node.style.setProperty('--fan', fan.toFixed(2) + 'deg');
      node.style.setProperty('--hand-lift', lift.toFixed(1) + 'px');
      node.setAttribute('aria-label', card.name + (card.special ? '' : ', strength ' + card.strength));
      hand.appendChild(node);
    });
    hand.classList.toggle('is-disabled', !canAct);
  }

  function renderActions(state) {
    var host = $('table-actions');
    if (!host) return;
    var selection = uiState.selection;
    var playerTurn = state.phase === 'playing' && state.turn === 'player' && !state.passed.player;
    var html = '';
    if (state.phase === 'mulligan') {
      if (state.mulligan.player.done) {
        html = '<button class="btn btn--quiet table-lock" disabled>' + use('i-check') + 'Hand locked</button>';
      } else {
        html = '<button class="btn btn--primary table-lock" data-action="finish-mulligan">' +
          use('i-check') + 'Lock hand</button>';
      }
    } else if (state.phase === 'playing') {
      if (playerTurn && selection && !selection.kind) {
        html += '<button class="btn btn--primary table-play" data-action="play-selected">' +
          use(selection.card.icon || 'i-sword') + 'Play card</button>';
      }
      html += '<button class="pass-seal' + (playerTurn ? ' is-prompt' : '') + (state.passed.player ? ' is-passed' : '') +
        '" data-action="pass" ' + (playerTurn ? '' : 'disabled') + ' title="Pass the round">' +
        '<span class="pass-seal__ring"></span><span class="pass-seal__label">Pass</span></button>';
    }
    host.innerHTML = html;
    var hint = $('hand-hint');
    if (hint) {
      hint.textContent = hintText(state);
      hint.classList.toggle('is-urgent', !!selection || state.phase === 'mulligan');
    }
  }

  function renderTable(state, options) {
    options = options || {};
    UI.state = state;
    if (!state) return;
    var roundEl = $('topbar-round');
    if (roundEl) roundEl.textContent = 'ROUND ' + UI.roman(state.round);
    renderRoundTracker(state);
    renderHud(state, 'player');
    renderHud(state, 'enemy');
    var justPlayed = options.justPlayedUid || null;
    if (justPlayed) {
      if (uiState.animatedUid === justPlayed) justPlayed = null;
      else uiState.animatedUid = justPlayed;
    } else if (!state.lastPlayedUid) {
      uiState.animatedUid = null;
    }
    renderRows(state, justPlayed);
    renderWeather(state);
    renderHand(state);
    renderActions(state);
    var board = $('board');
    if (board) {
      board.classList.toggle('is-selecting', !!uiState.selection);
      board.classList.toggle('is-busy', !!options.busy || (state.phase === 'playing' && state.turn === 'enemy'));
    }
    var thinking = $('thinking');
    if (thinking) {
      var showThinking = state.phase === 'playing' && state.turn === 'enemy' && !state.passed.enemy;
      if (options.thinking !== undefined) showThinking = !!options.thinking;
      if (showThinking) thinking.removeAttribute('hidden');
      else thinking.setAttribute('hidden', '');
    }
    var chronicle = $('btn-chronicle');
    if (chronicle) chronicle.disabled = false;
    UI.updateSoundButton();
  }

  UI.renderTitle = renderTitle;
  UI.renderSetup = renderSetup;
  UI.renderTable = renderTable;
  UI.renderRows = renderRows;
  UI.renderHand = renderHand;
})();

/* ==========================================================================
   Interaction, modals, overlays and bindings
   ========================================================================== */
(function () {
  'use strict';

  var G = window.GWENT;
  var E = G.Engine;
  var UI = G.UI;
  var use = UI.icon;
  var artImage = UI.artImage;
  var bindArtFallback = UI.bindArtFallback;
  var uiState = UI.store;
  var SIDES = ['player', 'enemy'];
  var ROWS = G.ROW_ORDER;
  var activeModal = null;
  var lastFocus = null;

  function $(id) { return document.getElementById(id); }
  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }
  function invoke(name) {
    var fn = UI.handlers && UI.handlers[name];
    if (typeof fn === 'function') return fn.apply(null, Array.prototype.slice.call(arguments, 1));
    return undefined;
  }

  /* ------------------------------------------------------------------------
     Card selection
     ------------------------------------------------------------------------ */

  function clearSelection(render) {
    uiState.selection = null;
    if (render !== false && UI.state) UI.renderTable(UI.state);
  }

  function decoyTargets(state) {
    var units = [];
    SIDES.forEach(function (side) {
      ROWS.forEach(function (row) {
        state.rows[side][row].cards.forEach(function (inst) {
          var card = G.CARDS[inst.cardId];
          if (inst.owner === 'player' && card && !card.special && !card.hero && !card.token) {
            units.push(inst.uid);
          }
        });
      });
    });
    return units;
  }

  function selectHandCard(uid) {
    var state = UI.state;
    if (!state) return;
    if (state.phase === 'mulligan') {
      if (!state.mulligan.player.done) invoke('mulligan', uid);
      return;
    }
    if (state.phase !== 'playing' || state.turn !== 'player' || state.passed.player) return;
    var inst = E.findHandCard(state, 'player', uid);
    if (!inst) return;
    if (uiState.selection && uiState.selection.uid === uid) {
      clearSelection(true);
      return;
    }
    var card = G.CARDS[inst.cardId];
    if (!card) return;

    var kind = E.targetKind(card);
    var selection = { uid: uid, card: card, kind: null };
    if (kind === 'own-row') {
      selection.kind = 'own-row';
      selection.rows = { 'player:melee': true, 'player:ranged': true };
    } else if (kind === 'any-row') {
      selection.kind = 'any-row';
      selection.rows = {};
      SIDES.forEach(function (side) {
        ROWS.forEach(function (rowName) {
          var row = state.rows[side][rowName];
          if (card.special === 'horn' && (row.horn || row.leaderDouble)) return;
          if (card.special === 'mardroeme' && row.mardroeme) return;
          selection.rows[side + ':' + rowName] = true;
        });
      });
      if (!Object.keys(selection.rows).length) {
        UI.toast(card.special === 'horn' ? 'Every row is already doubled.' : 'Mardroeme already clings to every row.', 'info');
        return;
      }
    } else if (kind === 'friendly-unit') {
      var units = decoyTargets(state);
      if (!units.length) {
        UI.toast('No friendly non-hero unit can answer a Decoy.', 'info');
        return;
      }
      selection.kind = 'friendly-unit';
      selection.units = units;
    }
    uiState.selection = selection;
    UI.playSound('select');
    UI.renderTable(state);
  }

  function playSelection(target) {
    var selection = uiState.selection;
    if (!selection) return;
    var uid = selection.uid;
    uiState.selection = null;
    invoke('playCard', uid, target || null);
  }

  function activateBoardCard(node) {
    var selection = uiState.selection;
    if (!selection || selection.kind !== 'friendly-unit' || !node) return;
    var uid = node.getAttribute('data-uid');
    if (selection.units && selection.units.indexOf(uid) !== -1) playSelection({ uid: uid });
  }

  function onRowsClick(event) {
    var selection = uiState.selection;
    if (!selection) return;
    var cardNode = event.target.closest ? event.target.closest('.card[data-uid]') : null;
    if (selection.kind === 'friendly-unit') {
      activateBoardCard(cardNode);
      return;
    }
    var rowNode = event.target.closest ? event.target.closest('.row') : null;
    if (!rowNode) return;
    var key = rowNode.getAttribute('data-side') + ':' + rowNode.getAttribute('data-row');
    if (selection.rows && selection.rows[key]) {
      playSelection({ side: rowNode.getAttribute('data-side'), row: rowNode.getAttribute('data-row') });
    }
  }

  function onRowsKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    var node = event.target.closest ? event.target.closest('.card.is-targetable') : null;
    if (!node) return;
    event.preventDefault();
    activateBoardCard(node);
  }

  /* ------------------------------------------------------------------------
     Modal shell
     ------------------------------------------------------------------------ */

  function openModal(opts) {
    opts = opts || {};
    closeModal(true);
    var root = UI.els.modalRoot;
    if (!root) return null;
    lastFocus = document.activeElement;
    root.innerHTML = '';
    var shell = el('div', 'modal' +
      (opts.size === 'wide' ? ' modal--wide' : opts.size === 'small' ? ' modal--small' : '') +
      (opts.size === 'chronicle' ? ' modal--chronicle' : ''));

    var header = el('div', 'modal__header');
    var titles = el('div', 'modal__titles');
    if (opts.eyebrow) titles.appendChild(el('p', 'eyebrow', UI.esc(opts.eyebrow)));
    var title = el('h2');
    title.textContent = opts.title || '';
    titles.appendChild(title);
    if (opts.subtitle) titles.appendChild(el('p', 'modal__subtitle', UI.esc(opts.subtitle)));
    header.appendChild(titles);
    if (opts.dismissible !== false) {
      var closeBtn = el('button', 'modal__close', use('i-close'));
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', 'Close');
      closeBtn.addEventListener('click', function () { closeModal(); });
      header.appendChild(closeBtn);
    }
    shell.appendChild(header);

    var body = el('div', 'modal__body');
    if (opts.body) {
      if (typeof opts.body === 'string') body.innerHTML = opts.body;
      else body.appendChild(opts.body);
    }
    shell.appendChild(body);

    var buttons = [];
    if (opts.actions && opts.actions.length) {
      var footer = el('div', 'modal__footer');
      if (opts.note) footer.appendChild(el('p', 'modal__note', opts.note));
      opts.actions.forEach(function (action) {
        var btn = el('button', 'btn ' + (action.cls || ''));
        btn.type = 'button';
        if (action.disabled) btn.disabled = true;
        if (action.icon) {
          btn.innerHTML = use(action.icon) + '<span>' + UI.esc(action.label) + '</span>';
        } else {
          btn.textContent = action.label;
        }
        btn.addEventListener('click', function () {
          if (btn.disabled) return;
          var result = action.onClick ? action.onClick() : undefined;
          if (action.close !== false && result !== false && activeModal && activeModal.shell === shell) {
            closeModal();
          }
        });
        footer.appendChild(btn);
        buttons.push(btn);
      });
      shell.appendChild(footer);
    }

    root.appendChild(shell);
    root.hidden = false;
    uiState.modalOpen = true;
    uiState.modalRequired = opts.dismissible === false;
    activeModal = { shell: shell, body: body, buttons: buttons, dismissible: opts.dismissible !== false };
    root.onclick = function (event) {
      if (event.target === root && opts.dismissible !== false) closeModal();
    };
    window.setTimeout(function () {
      if (!uiState.modalOpen || !activeModal || activeModal.shell !== shell) return;
      var target = shell.querySelector('.modal__footer .btn--primary') ||
        shell.querySelector('.modal__close') || shell.querySelector('button');
      if (target) {
        try { target.focus(); } catch (err) { /* ignore */ }
      }
    }, 30);
    return { shell: shell, body: body, buttons: buttons, close: function () { closeModal(true); } };
  }

  function closeModal(silent) {
    if (!uiState.modalOpen && UI.els.modalRoot && UI.els.modalRoot.hidden) return;
    uiState.modalOpen = false;
    uiState.modalRequired = false;
    activeModal = null;
    var root = UI.els.modalRoot;
    if (root) {
      root.hidden = true;
      root.innerHTML = '';
      root.onclick = null;
    }
    if (lastFocus && document.contains(lastFocus)) {
      try { lastFocus.focus({ preventScroll: true }); } catch (err) { /* ignore */ }
    }
    lastFocus = null;
    if (!silent) invoke('onModalClosed');
  }

  function trapModalFocus(event) {
    if (!activeModal || event.key !== 'Tab') return;
    var selector = 'button:not([disabled]):not([tabindex="-1"]), a[href], input:not([disabled]), ' +
      'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    var nodes = Array.prototype.filter.call(activeModal.shell.querySelectorAll(selector), function (node) {
      return node.getClientRects().length > 0;
    });
    if (!nodes.length) return;
    var first = nodes[0];
    var last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* ------------------------------------------------------------------------
     Choice dialogs
     ------------------------------------------------------------------------ */

  function openStartChoice(onChoose) {
    var body = el('div');
    body.innerHTML = '<p class="choice-lead">Your banner carries the old privilege of the Aen Seidhe. ' +
      'Name the commander who plays the first card of the match.</p>' +
      '<div class="choice-grid" style="grid-template-columns:repeat(2,minmax(0,1fr));max-width:420px;margin:0 auto">' +
        '<div class="choice-card" style="cursor:default;padding:16px 10px">' +
          '<div style="text-align:center;color:var(--brass-bright)">' + use('i-sword') + '</div>' +
          '<p style="margin-top:8px;font-size:.82rem;line-height:1.4;color:rgba(213,200,173,.72);text-align:center">' +
            'Open the play and seize the first move.' +
          '</p>' +
        '</div>' +
        '<div class="choice-card" style="cursor:default;padding:16px 10px">' +
          '<div style="text-align:center;color:var(--brass-bright)">' + use('i-leaf') + '</div>' +
          '<p style="margin-top:8px;font-size:.82rem;line-height:1.4;color:rgba(213,200,173,.72);text-align:center">' +
            'Yield the first move and answer their opening.' +
          '</p>' +
        '</div>' +
      '</div>';
    openModal({
      eyebrow: 'The Aen Seidhe',
      title: 'Choose the opening move',
      subtitle: 'The elves may decide who begins the first round. This choice is made once, before the cards are played.',
      body: body,
      dismissible: false,
      actions: [
        { label: 'Open the play', cls: 'btn--primary', icon: 'i-sword', onClick: function () { onChoose(true); } },
        { label: 'Let them open', cls: 'btn--ghost', icon: 'i-leaf', onClick: function () { onChoose(false); } }
      ]
    });
  }

  function openChoice(pending, onSubmit) {
    var body = el('div');
    var lead = el('p', 'choice-lead');
    lead.textContent = pending.lead || '';
    body.appendChild(lead);
    var grid = el('div', 'choice-grid');
    body.appendChild(grid);
    if (!pending.options || !pending.options.length) {
      body.appendChild(el('p', 'choice-empty', 'There is nothing to choose.'));
    }

    var max = pending.type === 'leader-discard' ? 2 : 1;
    var picked = [];
    var confirmBtn = null;

    (pending.options || []).forEach(function (opt) {
      var card = G.CARDS[opt.cardId];
      var btn = el('button', 'choice-card');
      btn.type = 'button';
      btn.setAttribute('data-uid', opt.uid);
      btn.setAttribute('aria-pressed', 'false');
      if (card) btn.appendChild(UI.createCard(card, { className: 'card--choice' }));
      btn.appendChild(el('span', 'choice-card__check', use('i-check')));
      btn.addEventListener('click', function () {
        if (pending.type === 'peek') return;
        var index = picked.indexOf(opt.uid);
        if (index >= 0) {
          picked.splice(index, 1);
        } else {
          if (max === 1) picked.length = 0;
          if (picked.length >= max) return;
          picked.push(opt.uid);
        }
        Array.prototype.forEach.call(grid.children, function (node) {
          var on = picked.indexOf(node.getAttribute('data-uid')) !== -1;
          node.classList.toggle('is-picked', on);
          node.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        if (confirmBtn) confirmBtn.disabled = picked.length !== max;
      });
      grid.appendChild(btn);
    });

    var actions;
    if (pending.type === 'peek') {
      actions = [{
        label: 'Keep it in mind', cls: 'btn--primary', icon: 'i-eye',
        onClick: function () { return onSubmit({}); }
      }];
    } else {
      actions = [{
        label: max === 2 ? 'Discard 2 cards' : 'Confirm choice',
        cls: 'btn--primary', icon: 'i-check', disabled: true,
        onClick: function () {
          var payload = max === 2 ? { uids: picked.slice() } : { uid: picked[0] };
          return onSubmit(payload);
        }
      }];
    }

    var modal = openModal({
      eyebrow: 'A choice awaits',
      title: pending.title || 'Choose',
      body: body,
      note: pending.type === 'peek' ? 'These cards remain hidden from the rest of the table.' : '',
      actions: actions,
      dismissible: false
    });
    if (modal && actions.length && pending.type !== 'peek') confirmBtn = modal.buttons[0];
  }

  /* ------------------------------------------------------------------------
     Rules, collection, piles, chronicle
     ------------------------------------------------------------------------ */

  function openRules() {
    var abilityHtml = Object.keys(G.ABILITIES).map(function (id) {
      var ability = G.ABILITIES[id];
      return '<div class="glossary-item"><span class="glossary-item__icon">' + use(ability.icon) + '</span>' +
        '<div class="glossary-item__body"><b>' + UI.esc(ability.name) + '</b><p>' + UI.esc(ability.desc) + '</p></div></div>';
    }).join('');
    var weatherHtml = Object.keys(G.WEATHER).map(function (id) {
      var weather = G.WEATHER[id];
      return '<div class="glossary-item"><span class="glossary-item__icon">' + use(weather.icon) + '</span>' +
        '<div class="glossary-item__body"><b>' + UI.esc(weather.name) + '</b><p>' + UI.esc(weather.desc) + '</p></div></div>';
    }).join('');
    var factionHtml = G.FACTION_ORDER.map(function (id) {
      var faction = G.FACTIONS[id];
      return '<div class="faction-passive-row" style="--faction-bright:var(--faction-' + id + '-bright)">' +
        '<b>' + UI.esc(faction.name) + '</b><span><strong>' + UI.esc(faction.passiveName) + '.</strong> ' +
        UI.esc(faction.passive) + '</span></div>';
    }).join('');

    var body = el('div');
    body.innerHTML =
      '<div class="rules-grid">' +
        '<div class="rules-copy">' +
          '<h3>The duel</h3>' +
          '<p>Two commanders meet across a tavern table, each with a deck, a leader and <strong>two gems</strong>. ' +
            'Win two rounds — or leave your opponent with no gems — and the match is yours. A match is at most three rounds.</p>' +
          '<h3>The opening</h3>' +
          '<p>Both sides draw ten cards. Each commander may once redraw up to <strong>two</strong> cards; the replaced cards ' +
            'are shuffled back into the deck. There are no ordinary draws between rounds.</p>' +
          '<h3>A round</h3>' +
          '<ul>' +
            '<li>Players alternate playing one card or passing.</li>' +
            '<li>Once you pass, you cannot play again that round. The round ends when both sides have passed.</li>' +
            '<li>The higher total strength takes the round; the loser spends a gem.</li>' +
            '<li>A tie costs both sides a gem, unless Nilfgaard is involved — the Empire wins tied rounds.</li>' +
            '<li>The winner opens the next round. After a tie, the other commander opens.</li>' +
          '</ul>' +
          '<h3>Weather and rows</h3>' +
          '<p>Weather affects both battlefields and <strong>remains between rounds</strong> until replaced or cleared. ' +
            'Commander&rsquo;s Horns, Mardroeme and leader row effects are cleared when a round ends. ' +
            'Strength is counted in this order: weather, Tight Bond, Morale, then doubling.</p>' +
          '<h3>Heroes and specials</h3>' +
          '<p>Heroes are immune to weather, Scorch, Decoy, Commander&rsquo;s Horn and Morale, and cannot be revived. ' +
            'A unit&rsquo;s Scorch only burns its matching enemy row, and only if that row totals 10 or more. ' +
            'A Decoy returns one of your own non-hero units to hand. Mardroeme transforms every Berserker on its row.</p>' +
          '<h3>The AI opponent</h3>' +
          '<p>Your rival reads the visible board, not your hand. It counts weather, passes when the round is lost, ' +
            'and will spend its leader when the moment is worth it.</p>' +
        '</div>' +
        '<div class="glossary">' +
          '<div class="modal-section__title">Card abilities</div>' + abilityHtml +
          '<div class="modal-section__title" style="margin-top:14px">Weather</div>' + weatherHtml +
        '</div>' +
      '</div>' +
      '<div class="modal-section"><div class="modal-section__title">Faction passives</div>' +
        '<div class="faction-passives">' + factionHtml + '</div></div>' +
      '<div class="modal-section"><div class="modal-section__title">A note on this table</div>' +
        '<p class="rules-copy" style="font-size:.86rem;line-height:1.55;color:rgba(213,200,173,.62)">' +
        'This is a faithful fan recreation of Gwent as it appears in The Witcher 3, with a few quality-of-life ' +
        'clarifications for play in the browser. Every card, name and piece of lore belongs to CD PROJEKT RED.</p></div>';

    openModal({
      eyebrow: 'The rules of the table',
      title: 'How to play Gwent',
      subtitle: 'A duel of three rounds, two gems apiece, and no second chances once you pass.',
      body: body,
      size: 'wide',
      actions: [{ label: 'Back to the table', cls: 'btn--ghost', icon: 'i-chevron' }]
    });
  }

  function collectionOrder(a, b) {
    var fa = G.FACTION_ORDER.indexOf(a.faction);
    var fb = G.FACTION_ORDER.indexOf(b.faction);
    if (fa < 0) fa = 5;
    if (fb < 0) fb = 5;
    if (fa !== fb) return fa - fb;
    if (!!a.special !== !!b.special) return a.special ? 1 : -1;
    var ra = G.ROW_ORDER.indexOf(a.row);
    var rb = G.ROW_ORDER.indexOf(b.row);
    if (ra < 0) ra = 9;
    if (rb < 0) rb = 9;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  }

  function openCollection() {
    var active = uiState.collectionFilter || 'all';
    var filters = [
      ['all', 'All cards'], ['northern', 'North'], ['nilfgaard', 'Nilfgaard'],
      ['scoiatael', 'Scoia\'tael'], ['monsters', 'Monsters'], ['skellige', 'Skellige'],
      ['neutral', 'Neutral'], ['special', 'Specials'], ['hero', 'Heroes']
    ];
    var body = el('div');
    var toolbar = el('div', 'collection-toolbar');
    var count = el('span', 'collection-count');
    var grid = el('div', 'collection-grid');
    body.appendChild(toolbar);
    body.appendChild(grid);

    var chips = [];
    filters.forEach(function (entry) {
      var chip = el('button', 'filter-chip' + (active === entry[0] ? ' is-active' : ''));
      chip.type = 'button';
      chip.textContent = entry[1];
      chip.addEventListener('click', function () {
        active = entry[0];
        uiState.collectionFilter = active;
        paint();
      });
      toolbar.appendChild(chip);
      chips.push(chip);
    });
    toolbar.appendChild(count);

    function paint() {
      chips.forEach(function (chip, index) {
        chip.classList.toggle('is-active', filters[index][0] === active);
      });
      grid.innerHTML = '';
      var list = G.CARD_LIST.filter(function (card) {
        if (!card || card.token || card.transformed) return false;
        if (active === 'all') return true;
        if (active === 'special') return !!card.special;
        if (active === 'hero') return !!card.hero;
        return card.faction === active;
      }).sort(collectionOrder);
      count.textContent = list.length + ' card' + (list.length === 1 ? '' : 's');
      list.forEach(function (card) {
        var item = el('div', 'collection-item');
        var node = UI.createCard(card, { className: 'card--collection' });
        item.appendChild(node);
        var label = card.special ? (G.isWeatherCard(card) ? 'Weather' : 'Special')
          : card.hero ? 'Hero · ' + G.rowName(card) : G.rowName(card);
        item.appendChild(el('span', 'collection-item__label', UI.esc(label)));
        grid.appendChild(item);
      });
      if (!list.length) grid.appendChild(el('p', 'collection-empty', 'No cards answer that filter.'));
    }
    paint();

    openModal({
      eyebrow: 'The collection',
      title: 'Every card on the Continent',
      subtitle: 'Browse the full catalogue. Hover or focus a card to read its abilities.',
      body: body,
      size: 'wide',
      note: 'Token and transformed cards are shown only when they reach the table.',
      actions: [{ label: 'Close', cls: 'btn--ghost' }]
    });
  }

  function groupForCard(card) {
    if (!card) return 'special';
    if (card.special) return 'special';
    if (card.row === 'agile') return 'agile';
    return card.row || 'special';
  }

  function openPile(side, pile) {
    var state = UI.state;
    if (!state) return;
    var sideLabel = side === 'player' ? 'Your' : 'Opponent\'s';
    var pileLabel = pile === 'deck' ? 'deck' : pile === 'grave' ? 'discard pile' : 'hand';
    var list = pile === 'deck' ? state.decks[side] : pile === 'grave' ? state.graves[side] : state.hands[side];
    var hidden = side === 'enemy' && (pile === 'deck' || pile === 'hand');
    var body = el('div');
    var grid = el('div', 'pile-grid');
    body.appendChild(grid);

    if (!list.length) {
      body.appendChild(el('p', 'choice-empty', 'This pile is empty.'));
    } else if (hidden) {
      list.forEach(function () {
        var back = el('div', 'card-back');
        back.style.setProperty('--cw', '92px');
        back.innerHTML = '<span class="card-back__crest">' + use('i-wolf') + '</span>';
        grid.appendChild(back);
      });
    } else {
      var groups = { melee: [], ranged: [], siege: [], agile: [], special: [] };
      list.forEach(function (inst) {
        var card = G.CARDS[inst.cardId];
        if (card) groups[groupForCard(card)].push(card);
      });
      ['melee', 'ranged', 'siege', 'agile', 'special'].forEach(function (key) {
        if (!groups[key].length) return;
        var label = key === 'special' ? 'Special cards' : key === 'agile' ? 'Agile units' : G.ROWS[key].name;
        grid.appendChild(el('span', 'pile-group-label', UI.esc(label)));
        groups[key].sort(collectionOrder).forEach(function (card) {
          grid.appendChild(UI.createCard(card, { className: 'card--pile' }));
        });
      });
    }

    openModal({
      eyebrow: side === 'player' ? 'Your side of the table' : 'Across the table',
      title: sideLabel + ' ' + pileLabel,
      subtitle: hidden
        ? 'The contents are hidden. Only the count is public knowledge.'
        : list.length + ' card' + (list.length === 1 ? '' : 's') + ' in this pile.',
      body: body,
      size: 'wide',
      actions: [{ label: 'Close', cls: 'btn--ghost' }]
    });
  }

  function openChronicle() {
    var state = UI.state;
    var body = el('div');
    if (!state) {
      body.appendChild(el('p', 'chronicle-empty', 'No match has been recorded yet.'));
    } else {
      var summary = el('div', 'modal-section');
      summary.innerHTML = '<div class="modal-section__title">Standing</div>' +
        '<p class="rules-copy" style="font-size:.9rem;line-height:1.6;color:rgba(213,200,173,.72)">' +
        UI.esc(G.FACTIONS[state.playerFaction].name) + ' — ' + state.gems.player + ' gems · ' +
        UI.esc(G.FACTIONS[state.enemyFaction].name) + ' — ' + state.gems.enemy + ' gems<br>' +
        'Round ' + UI.roman(state.round) + ' · ' +
        (state.phase === 'gameover' ? 'Match complete' : 'In progress') +
        '</p>';
      body.appendChild(summary);

      var groups = {};
      state.log.forEach(function (entry) {
        var key = String(entry.round);
        if (!groups[key]) groups[key] = [];
        groups[key].push(entry);
      });
      var keys = Object.keys(groups).sort(function (a, b) { return Number(a) - Number(b); });
      if (!keys.length) body.appendChild(el('p', 'chronicle-empty', 'The chronicle is still blank.'));
      keys.forEach(function (key) {
        var roundNumber = Number(key);
        var info = state.roundHistory.filter(function (entry) { return entry.round === roundNumber; })[0];
        var label = 'Round ' + UI.roman(roundNumber);
        if (info) label += ' · ' + info.scores.player + '–' + info.scores.enemy;
        if (roundNumber === state.round && state.phase !== 'gameover') label += ' · in progress';
        var block = el('div', 'chronicle-round');
        block.appendChild(el('div', 'chronicle-round__label', UI.esc(label)));
        groups[key].forEach(function (entry) {
          var cls = 'chronicle-entry' +
            (entry.side === 'player' ? ' is-player' : entry.side === 'enemy' ? ' is-enemy' : ' is-system');
          var row = el('div', cls);
          row.innerHTML = '<span>' + UI.esc(entry.text) + '</span>';
          block.appendChild(row);
        });
        body.appendChild(block);
      });
    }

    var modal = openModal({
      eyebrow: 'The chronicle',
      title: 'A record of the table',
      subtitle: 'Every deployment, pass and twist of fate.',
      body: body,
      size: 'chronicle',
      actions: [{ label: 'Close', cls: 'btn--ghost' }]
    });
    if (modal) {
      window.setTimeout(function () {
        var scrolling = modal.shell.querySelector('.modal__body');
        if (scrolling) scrolling.scrollTop = scrolling.scrollHeight;
      }, 40);
    }
  }

  /* ------------------------------------------------------------------------
     Menu, confirm and leader dialogs
     ------------------------------------------------------------------------ */

  function menuButton(label, note, onClick, danger) {
    var btn = el('button', 'menu-item' + (danger ? ' menu-item--danger' : ''));
    btn.type = 'button';
    btn.innerHTML = '<span>' + UI.esc(label) + '</span><small>' + UI.esc(note) + '</small>';
    btn.addEventListener('click', onClick);
    return btn;
  }

  function openMenu() {
    var list = el('div', 'menu-list');
    list.appendChild(menuButton('Resume the round', 'Return to the table', function () {
      closeModal();
    }));
    list.appendChild(menuButton('How to play', 'Rules and card glossary', function () {
      openRules();
    }));
    list.appendChild(menuButton('The cards', 'Browse the full collection', function () {
      openCollection();
    }));
    list.appendChild(menuButton('Chronicle', 'Read the match so far', function () {
      openChronicle();
    }));

    var soundBtn = menuButton('Sound', uiState.soundOn ? 'On' : 'Off', function () {
      UI.toggleSound();
      var note = soundBtn.querySelector('small');
      if (note) note.textContent = uiState.soundOn ? 'On' : 'Off';
    });
    list.appendChild(soundBtn);

    list.appendChild(menuButton('Restart the match', 'Begin again with the same banners', function () {
      openConfirm({
        title: 'Restart the match?',
        message: 'The current table will be swept clean and a fresh coin cast. <strong>This cannot be undone.</strong>',
        confirmLabel: 'Restart',
        onConfirm: function () { invoke('restart'); }
      });
    }));
    list.appendChild(menuButton('Abandon to the title', 'Leave the table', function () {
      openConfirm({
        title: 'Abandon the table?',
        message: 'The match will be forfeit and the chronicle closed. <strong>The tavern will still be here.</strong>',
        confirmLabel: 'Abandon',
        danger: true,
        onConfirm: function () { invoke('quitToTitle'); }
      });
    }, true));

    openModal({
      eyebrow: 'The table waits',
      title: 'Paused',
      subtitle: 'Your opponent is considering the board. Take your time.',
      body: list,
      size: 'small',
      actions: [{ label: 'Return to the table', cls: 'btn--primary', icon: 'i-sword' }]
    });
  }

  function openConfirm(opts) {
    var body = el('div');
    body.innerHTML = '<div class="confirm-emblem">' + use(opts.danger ? 'i-skull' : 'i-crown') + '</div>' +
      '<p class="confirm-copy">' + (opts.message || '') + '</p>';
    openModal({
      eyebrow: opts.eyebrow || 'A word before you act',
      title: opts.title || 'Are you certain?',
      body: body,
      size: 'small',
      dismissible: true,
      actions: [
        { label: opts.cancelLabel || 'Keep playing', cls: 'btn--ghost' },
        {
          label: opts.confirmLabel || 'Confirm',
          cls: opts.danger ? 'btn--danger' : 'btn--primary',
          onClick: function () { if (opts.onConfirm) opts.onConfirm(); }
        }
      ]
    });
  }

  function openLeaderDialog(side) {
    var state = UI.state;
    if (!state) return;
    var leader = E.leaderOfSide(state, side);
    if (!leader) return;
    var faction = G.FACTIONS[E.factionOfSide(state, side)];
    var check = E.canUseLeader(state, side);
    var used = state.usedLeaders[side];
    var cancelled = state.cancelledLeaders[side];
    var status;
    if (leader.passive) status = 'Passive ability — always in effect';
    else if (used) status = 'Ability spent this match';
    else if (cancelled) status = 'Ability cancelled by the White Flame';
    else if (side === 'player') status = check.ok ? 'Ready to invoke' : check.reason;
    else status = 'Opponent commander';

    var body = el('div', 'leader-dialog');
    var crest = el('div', 'leader-dialog__crest', use(leader.icon || (faction && faction.icon) || 'i-crown'));
    crest.insertAdjacentHTML('beforeend', artImage(leader.art, 'leader-dialog__crest-img'));
    UI.setFactionVars(crest, leader.faction);
    body.appendChild(crest);
    var copy = el('div', 'leader-dialog__body');
    copy.innerHTML = '<h3>' + UI.esc(leader.name) + '</h3>' +
      (leader.epithet ? '<p class="leader-dialog__epithet">' + UI.esc(leader.epithet) + '</p>' : '') +
      '<div class="leader-dialog__ability"><b>' + UI.esc(leader.ability) + '</b>' + UI.esc(leader.desc) + '</div>' +
      '<p class="leader-dialog__meta">' + UI.esc(status) + '</p>';
    body.appendChild(copy);

    var actions = [];
    if (side === 'player' && !leader.passive && !used && !cancelled && state.phase === 'playing') {
      actions.push({
        label: 'Invoke ' + leader.ability,
        cls: 'btn--primary',
        icon: leader.icon || 'i-crown',
        disabled: !check.ok,
        onClick: function () { if (check.ok) invoke('useLeader'); }
      });
    }
    actions.push({ label: 'Close', cls: 'btn--ghost' });
    openModal({
      eyebrow: side === 'player' ? 'Your commander' : 'The opposing commander',
      title: leader.name,
      subtitle: (leader.epithet ? leader.epithet + ' · ' : '') + (faction ? faction.name : ''),
      body: body,
      actions: actions,
      note: !check.ok && side === 'player' && !leader.passive && !used && !cancelled ? check.reason : ''
    });
  }

  /* ------------------------------------------------------------------------
     Coin, round and match overlays
     ------------------------------------------------------------------------ */

  function showCoin(copy, onContinue) {
    var els = UI.els;
    if (!els.coinOverlay) return;
    uiState.coinToken = (uiState.coinToken || 0) + 1;
    var token = uiState.coinToken;
    if (uiState.coinTimer) window.clearTimeout(uiState.coinTimer);
    els.coinOverlay.classList.remove('hidden');
    els.coinKicker.textContent = copy.kicker || 'The coin is cast';
    els.coinResult.textContent = 'The coin turns in the air…';
    els.coinDetail.textContent = '';
    els.btnCoinContinue.classList.add('hidden');
    els.btnCoinContinue.onclick = null;
    var coin = els.flipCoin;
    coin.classList.remove('is-flipping');
    void coin.offsetWidth;
    coin.classList.add('is-flipping');
    UI.playSound('coin');

    var settled = false;
    uiState.coinTimer = window.setTimeout(function () {
      if (token !== uiState.coinToken) return;
      settled = true;
      coin.classList.remove('is-flipping');
      els.coinResult.textContent = copy.result || 'The coin has spoken';
      els.coinDetail.textContent = copy.detail || '';
      UI.playSound('coinLand');
      els.btnCoinContinue.classList.remove('hidden');
      els.btnCoinContinue.focus();
    }, 1750);

    els.btnCoinContinue.onclick = function () {
      if (!settled) return;
      if (uiState.coinTimer) window.clearTimeout(uiState.coinTimer);
      uiState.coinTimer = null;
      els.coinOverlay.classList.add('hidden');
      els.btnCoinContinue.classList.add('hidden');
      els.btnCoinContinue.onclick = null;
      UI.playSound('click');
      if (typeof onContinue === 'function') onContinue();
    };
  }

  function hideCoin() {
    if (uiState.coinTimer) window.clearTimeout(uiState.coinTimer);
    uiState.coinTimer = null;
    uiState.coinToken = (uiState.coinToken || 0) + 1;
    if (UI.els.coinOverlay) UI.els.coinOverlay.classList.add('hidden');
    if (UI.els.btnCoinContinue) {
      UI.els.btnCoinContinue.classList.add('hidden');
      UI.els.btnCoinContinue.onclick = null;
    }
  }

  function gemRow(count) {
    var html = '';
    for (var i = 0; i < 2; i += 1) html += '<span class="gem' + (i < count ? ' is-won' : '') + '"></span>';
    return html;
  }

  function showRound(info, state) {
    var els = UI.els;
    if (!els.roundOverlay || !info) return;
    var winner = info.winner;
    var cls = winner === 'player' ? 'is-victory' : winner === 'enemy' ? 'is-defeat' : 'is-draw';
    var title = winner === 'player' ? 'You take the round' : winner === 'enemy' ? 'The round is lost' : 'Neither banner yields';
    var iconId = winner === 'player' ? 'i-crown' : winner === 'enemy' ? 'i-skull' : 'i-cross';
    var line;
    if (winner === 'tie') {
      line = 'Both commanders spend a gem. The table stays silent.';
    } else if (winner === 'player') {
      line = 'The round goes to ' + G.FACTIONS[state.playerFaction].name + ' — your opponent loses a gem.';
    } else {
      line = 'The round goes to ' + G.FACTIONS[state.enemyFaction].name + ' — you lose a gem.';
    }
    if (info.tieBroken) {
      var ngSide = state.playerFaction === 'nilfgaard' ? 'your' : 'the enemy';
      line = 'The scores are level, but Nilfgaard claims ties. ' + (ngSide === 'your' ? 'The round bends to your sun.' : 'The round bends to the Great Sun.');
    }
    var nextStarter = winner === 'tie' ? E.other(info.starter) : winner;
    var footnote = info.matchOver
      ? 'The match is decided. The chronicle is complete.'
      : 'Round ' + UI.roman(info.round + 1) + ' will be opened by ' +
        (nextStarter === 'player' ? 'you' : 'your opponent') + '.';

    els.roundOverlay.innerHTML =
      '<div class="round-banner ' + cls + '">' +
        '<div class="round-banner__seal">' + use(iconId) + '</div>' +
        '<p class="round-banner__round">Round ' + UI.roman(info.round) + ' · complete</p>' +
        '<h2>' + UI.esc(title) + '</h2>' +
        '<p class="round-banner__line">' + UI.esc(line) + '</p>' +
        '<div class="round-scores">' +
          '<div class="round-score' + (winner === 'player' ? ' is-winner' : '') + '">' +
            '<span class="round-score__name">You · ' + UI.esc(G.FACTIONS[state.playerFaction].name) + '</span>' +
            '<strong>' + info.scores.player + '</strong>' +
            '<span class="round-score__gems">' + gemRow(info.gemsAfter.player) + '</span>' +
          '</div>' +
          '<span class="round-scores__vs">versus</span>' +
          '<div class="round-score' + (winner === 'enemy' ? ' is-winner' : '') + '">' +
            '<span class="round-score__name">Opponent · ' + UI.esc(G.FACTIONS[state.enemyFaction].name) + '</span>' +
            '<strong>' + info.scores.enemy + '</strong>' +
            '<span class="round-score__gems">' + gemRow(info.gemsAfter.enemy) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="round-banner__actions">' +
          '<button class="btn btn--primary" data-round-continue>' + use(info.matchOver ? 'i-crown' : 'i-chevron') +
            (info.matchOver ? 'See the reckoning' : 'Next round') + '</button>' +
        '</div>' +
        '<p class="round-banner__footnote">' + UI.esc(footnote) + '</p>' +
      '</div>';
    els.roundOverlay.classList.remove('hidden');
    var btn = els.roundOverlay.querySelector('[data-round-continue]');
    if (btn) {
      btn.addEventListener('click', function () {
        hideRound();
        invoke('roundContinue');
      });
      try { btn.focus(); } catch (err) { /* ignore */ }
    }
  }

  function hideRound() {
    if (UI.els.roundOverlay) UI.els.roundOverlay.classList.add('hidden');
  }

  function showGameOver(result, state) {
    var els = UI.els;
    if (!els.gameOver || !result) return;
    var cls = result.winner === 'player' ? 'is-victory' : result.winner === 'enemy' ? 'is-defeat' : 'is-draw';
    var title = result.winner === 'player' ? 'Victory' : result.winner === 'enemy' ? 'Defeat' : 'A draw';
    var iconId = result.winner === 'player' ? 'i-crown' : result.winner === 'enemy' ? 'i-skull' : 'i-cross';
    var line = result.winner === 'draw'
      ? 'No banner flies over the table. The Continent remembers neither name.'
      : result.winner === 'player'
        ? 'The table is yours. Let the tavern keep the tale.'
        : 'The enemy banner rises. The table falls silent.';
    var stats = state.stats.player;
    els.gameOver.className = 'game-over ' + cls;
    els.gameOver.innerHTML =
      '<div class="game-over__inner">' +
        '<div class="game-over__sigil">' + use(iconId) + '</div>' +
        '<p class="eyebrow">' + UI.esc(G.FACTIONS[state.playerFaction].name) + ' vs ' +
          UI.esc(G.FACTIONS[state.enemyFaction].name) + '</p>' +
        '<h2>' + title + '</h2>' +
        '<p class="game-over__line">' + UI.esc(line) + '</p>' +
        '<div class="game-over__score"><span>Rounds won</span><b>' +
          state.roundsWon.player + ' – ' + state.roundsWon.enemy + '</b></div>' +
        '<div class="game-over__stats">' +
          '<div class="game-over__stat"><span>Rounds</span><strong>' + stats.roundsWon + '</strong></div>' +
          '<div class="game-over__stat"><span>Cards played</span><strong>' + stats.played + '</strong></div>' +
          '<div class="game-over__stat"><span>Gems kept</span><strong>' + state.gems.player + '</strong></div>' +
          '<div class="game-over__stat"><span>Leader</span><strong>' + (stats.leaderUsed ? 'Used' : 'Unused') + '</strong></div>' +
        '</div>' +
        '<p class="game-over__line">' + UI.esc(result.reason || '') + '</p>' +
        '<div class="game-over__actions">' +
          '<button class="btn btn--primary" data-game="rematch">' + use('i-sword') + 'Rematch</button>' +
          '<button class="btn btn--ghost" data-game="setup">' + use('i-shield') + 'Change banners</button>' +
          '<button class="btn btn--quiet" data-game="title">' + use('i-chevron') + 'Return to title</button>' +
        '</div>' +
      '</div>';
    els.gameOver.classList.remove('hidden');
    els.gameOver.querySelector('[data-game="rematch"]').addEventListener('click', function () { invoke('gameRematch'); });
    els.gameOver.querySelector('[data-game="setup"]').addEventListener('click', function () { invoke('gameSetup'); });
    els.gameOver.querySelector('[data-game="title"]').addEventListener('click', function () { invoke('gameTitle'); });
  }

  function hideGameOver() {
    if (UI.els.gameOver) {
      UI.els.gameOver.classList.add('hidden');
      UI.els.gameOver.innerHTML = '';
    }
  }

  /* ------------------------------------------------------------------------
     Screen and event bindings
     ------------------------------------------------------------------------ */

  function showScreen(name) {
    ['title', 'setup', 'table'].forEach(function (key) {
      var screen = $('screen-' + key);
      if (screen) screen.classList.toggle('hidden', key !== name);
    });
    UI.hideTip();
  }

  function cacheEls() {
    var ids = [
      'modal-root', 'tooltip', 'toast-stack', 'screen-title', 'screen-setup', 'screen-table',
      'title-card-1', 'title-card-2', 'title-card-3',
      'btn-play', 'btn-collection', 'btn-rules-title', 'btn-setup-back', 'btn-setup-rules',
      'faction-grid', 'leader-list', 'setup-deckbar', 'setup-opponent', 'btn-start',
      'btn-menu', 'btn-chronicle', 'btn-sound', 'topbar-round', 'round-tracker',
      'hud-player', 'hud-enemy', 'rows-player', 'rows-enemy', 'weather-strip',
      'board', 'hand', 'table-actions', 'hand-hint', 'thinking',
      'coin-overlay', 'coin-kicker', 'flip-coin', 'coin-result', 'coin-detail', 'btn-coin-continue',
      'round-overlay', 'game-over'
    ];
    ids.forEach(function (id) { UI.els[id] = $(id); });
    UI.els.modalRoot = $('modal-root');
    UI.els.toastStack = $('toast-stack');
    UI.els.btnSound = $('btn-sound');
    UI.els.coinOverlay = $('coin-overlay');
    UI.els.coinKicker = $('coin-kicker');
    UI.els.flipCoin = $('flip-coin');
    UI.els.coinResult = $('coin-result');
    UI.els.coinDetail = $('coin-detail');
    UI.els.btnCoinContinue = $('btn-coin-continue');
    UI.els.roundOverlay = $('round-overlay');
    UI.els.gameOver = $('game-over');
  }

  function bindStatic() {
    var els = UI.els;
    function on(id, handler) {
      var node = $(id);
      if (node) node.addEventListener('click', handler);
    }
    on('btn-play', function () { UI.playSound('click'); invoke('titlePlay'); });
    on('btn-collection', function () { UI.playSound('click'); openCollection(); });
    on('btn-rules-title', function () { UI.playSound('click'); openRules(); });
    on('btn-setup-back', function () { UI.playSound('click'); invoke('setupBack'); });
    on('btn-setup-rules', function () { UI.playSound('click'); openRules(); });
    on('btn-start', function () { UI.playSound('click'); invoke('startMatch'); });
    on('btn-menu', function () { UI.playSound('click'); openMenu(); });
    on('btn-chronicle', function () { UI.playSound('click'); openChronicle(); });
    on('btn-sound', function () { UI.toggleSound(); });

    var factionGrid = els['faction-grid'];
    if (factionGrid) {
      factionGrid.addEventListener('click', function (event) {
        var node = event.target.closest ? event.target.closest('[data-faction]') : null;
        if (!node) return;
        UI.playSound('select');
        invoke('setupFaction', node.getAttribute('data-faction'));
      });
    }
    var leaderList = els['leader-list'];
    if (leaderList) {
      leaderList.addEventListener('click', function (event) {
        var node = event.target.closest ? event.target.closest('[data-leader]') : null;
        if (!node) return;
        UI.playSound('select');
        invoke('setupLeader', node.getAttribute('data-leader'));
      });
    }
    if (els.hand) {
      els.hand.addEventListener('click', function (event) {
        var node = event.target.closest ? event.target.closest('.card--hand[data-uid]') : null;
        if (node) selectHandCard(node.getAttribute('data-uid'));
      });
    }
    [els['rows-player'], els['rows-enemy']].forEach(function (host) {
      if (!host) return;
      host.addEventListener('click', onRowsClick);
      host.addEventListener('keydown', onRowsKeydown);
    });
    if (els['table-actions']) {
      els['table-actions'].addEventListener('click', function (event) {
        var node = event.target.closest ? event.target.closest('[data-action]') : null;
        if (!node || node.disabled) return;
        var action = node.getAttribute('data-action');
        if (action === 'play-selected') {
          playSelection(null);
        } else if (action === 'pass') {
          clearSelection(false);
          invoke('pass');
        } else if (action === 'finish-mulligan') {
          clearSelection(false);
          invoke('finishMulligan');
        }
      });
    }
    [['hud-player', 'player'], ['hud-enemy', 'enemy']].forEach(function (entry) {
      var host = $(entry[0]);
      if (!host) return;
      host.addEventListener('click', function (event) {
        var pile = event.target.closest ? event.target.closest('.pile-btn') : null;
        if (pile) {
          openPile(pile.getAttribute('data-side'), pile.getAttribute('data-pile'));
          return;
        }
        var leader = event.target.closest ? event.target.closest('.hud__leader') : null;
        if (leader) openLeaderDialog(entry[1]);
      });
    });

    document.addEventListener('keydown', function (event) {
      if (uiState.modalOpen) {
        if (event.key === 'Escape' && !uiState.modalRequired) {
          event.preventDefault();
          closeModal();
          return;
        }
        trapModalFocus(event);
      }
    });
    window.addEventListener('resize', function () { if (uiState.tooltipTarget) UI.hideTip(); });
  }

  UI.init = function () {
    if (UI.initialized) return;
    cacheEls();
    bindArtFallback();
    UI.bindTooltip();
    UI.loadSoundSetting();
    UI.updateSoundButton();
    UI.renderTitle();
    bindStatic();
    UI.initialized = true;
  };

  UI.showScreen = showScreen;
  UI.clearSelection = clearSelection;
  UI.selectHandCard = selectHandCard;
  UI.openModal = openModal;
  UI.closeModal = closeModal;
  UI.openRules = openRules;
  UI.openCollection = openCollection;
  UI.openPile = openPile;
  UI.openChronicle = openChronicle;
  UI.openMenu = openMenu;
  UI.openConfirm = openConfirm;
  UI.openLeaderDialog = openLeaderDialog;
  UI.openStartChoice = openStartChoice;
  UI.openChoice = openChoice;
  UI.showCoin = showCoin;
  UI.hideCoin = hideCoin;
  UI.showRound = showRound;
  UI.hideRound = hideRound;
  UI.showGameOver = showGameOver;
  UI.hideGameOver = hideGameOver;
})();
