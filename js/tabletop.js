/* ==========================================================================
   GWENT — tabletop motion
   Staged card play, score counting, special-effect layers, hand preview,
   turn banners and the round / match reveal. Presentation only: the engine
   state has already resolved when these animations run.
   ========================================================================== */
(function () {
  'use strict';

  var G = window.GWENT;
  var UI = G.UI;
  var E = G.Engine;

  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(mq && mq.matches); }

  function timings() {
    if (reduced()) {
      return {
        commit: 50, travel: 140, place: 80, impact: 70,
        score: 160, scoreStep: 25, banner: 420, effect: 240, major: 40
      };
    }
    return {
      commit: 130, travel: 380, place: 190, impact: 240,
      score: 340, scoreStep: 60, banner: 860, effect: 520, major: 160
    };
  }

  var motion = UI.motion = {};
  var ctx = null;
  var seq = 0;
  var timers = [];
  var numbers = [];
  var previewHideTimer = null;
  var lastRenderFocus = null;
  var lastRenderHover = null;

  var SPECIAL_INFO = {
    scorch: { icon: 'i-flame', name: 'Scorch', desc: 'Destroy the strongest non-hero unit or units.' },
    horn: { icon: 'i-horn', name: 'Commander\'s Horn', desc: 'Double all non-hero units on a row.' },
    decoy: { icon: 'i-mask', name: 'Decoy', desc: 'Return a friendly non-hero unit to your hand.' },
    mardroeme: { icon: 'i-mushroom', name: 'Mardroeme', desc: 'Transform Berserkers on a row.' },
    clear: { icon: 'i-sun', name: 'Clear Weather', desc: 'Remove all weather effects.' }
  };

  /* ------------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------------ */

  function $(id) { return document.getElementById(id); }
  function q(selector, root) { return (root || document).querySelector(selector); }
  function qa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function rectOf(node) {
    if (!node) return null;
    var r = node.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return {
      left: r.left, top: r.top, width: r.width, height: r.height,
      right: r.right, bottom: r.bottom,
      cx: r.left + r.width / 2, cy: r.top + r.height / 2
    };
  }

  function later(fn, ms) {
    var id = window.setTimeout(function () {
      timers = timers.filter(function (timer) { return timer !== id; });
      fn();
    }, Math.max(0, ms));
    timers.push(id);
    return id;
  }

  function clearTimers() {
    timers.forEach(function (id) { window.clearTimeout(id); });
    timers = [];
  }

  function board() { return $('board'); }
  function fxLayer() { return $('fx-layer'); }
  function handHost() { return $('hand'); }

  function findEvent(events, type) {
    for (var i = 0; i < events.length; i += 1) {
      if (events[i].type === type) return events[i];
    }
    return null;
  }

  function eventsOf(events, type) {
    return events.filter(function (event) { return event.type === type; });
  }

  function cardNode(uid) {
    return q('.row .card[data-uid="' + uid + '"]');
  }

  function handNode(uid) {
    return q('.hand .card--hand[data-uid="' + uid + '"]');
  }

  function removeNode(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  function pulse(node, className, ms) {
    if (!node) return;
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
    later(function () { node.classList.remove(className); }, ms || 900);
  }

  /* ------------------------------------------------------------------------
     Number counting
     ------------------------------------------------------------------------ */

  function animateNumber(node, from, to, duration, delay) {
    if (!node) return;
    if (from === to || from === null || from === undefined) {
      node.textContent = String(to);
      return;
    }
    if (reduced()) {
      node.textContent = String(to);
      return;
    }
    var start = performance.now() + (delay || 0);
    var record = { node: node, to: to, raf: 0 };
    node.textContent = String(from);
    function frame(now) {
      var t = clamp((now - start) / Math.max(1, duration), 0, 1);
      var eased = 1 - Math.pow(1 - t, 3);
      node.textContent = String(Math.round(from + (to - from) * eased));
      if (t < 1) {
        record.raf = window.requestAnimationFrame(frame);
      } else {
        node.textContent = String(to);
      }
    }
    record.raf = window.requestAnimationFrame(frame);
    numbers.push(record);
  }

  function clearNumbers() {
    numbers.forEach(function (record) {
      window.cancelAnimationFrame(record.raf);
      if (record.node && record.node.isConnected) record.node.textContent = String(record.to);
    });
    numbers = [];
  }

  /* ------------------------------------------------------------------------
     Snapshot of the table before an engine action
     ------------------------------------------------------------------------ */

  function snapshot(state) {
    var snap = {
      scores: { player: 0, enemy: 0 },
      gems: { player: 0, enemy: 0 },
      rows: {},
      board: {},
      hand: {},
      deck: {},
      grave: {},
      handPile: {},
      weather: {},
      focusUid: null,
      hoverUid: null
    };
    if (!state) return snap;

    ['player', 'enemy'].forEach(function (side) {
      snap.scores[side] = E.scoreSide(state, side);
      snap.gems[side] = state.gems[side];
      snap.deck[side] = rectOf(q('.pile-btn[data-side="' + side + '"][data-pile="deck"]'));
      snap.grave[side] = rectOf(q('.pile-btn[data-side="' + side + '"][data-pile="grave"]'));
      snap.handPile[side] = rectOf(q('.pile-btn[data-side="' + side + '"][data-pile="hand"]'));
      G.ROW_ORDER.forEach(function (rowName) {
        var key = side + ':' + rowName;
        snap.rows[key] = E.scoreRow(state, side, rowName);
        var row = state.rows[side][rowName];
        row.cards.forEach(function (inst) {
          var node = cardNode(inst.uid);
          var rect = rectOf(node);
          if (!rect) return;
          snap.board[inst.uid] = {
            uid: inst.uid,
            cardId: inst.cardId,
            side: side,
            row: rowName,
            owner: inst.owner,
            value: E.valueForInst(state, inst),
            rect: rect
          };
        });
      });
    });

    state.hands.player.forEach(function (inst) {
      var node = handNode(inst.uid);
      var rect = rectOf(node);
      if (rect) snap.hand[inst.uid] = { uid: inst.uid, cardId: inst.cardId, rect: rect };
    });

    qa('.row[data-weather]').forEach(function (node) {
      snap.weather[node.getAttribute('data-side') + ':' + node.getAttribute('data-row')] =
        node.getAttribute('data-weather');
    });

    var active = document.activeElement;
    if (active && active.classList && active.classList.contains('card--hand')) {
      snap.focusUid = active.getAttribute('data-uid');
    }
    var hover = q('.hand .card--hand:hover');
    if (hover) snap.hoverUid = hover.getAttribute('data-uid');
    return snap;
  }

  /* ------------------------------------------------------------------------
     Visual reset
     ------------------------------------------------------------------------ */

  function clearTransientClasses() {
    qa('.is-arriving, .is-landing, .is-weather-hit, .is-weather-clear, .is-horn-hit,' +
      ' .is-scorch-hit, .is-power-surge, .is-score-changed, .is-round-fresh,' +
      ' .is-gem-spent, .is-counting, .is-new, .is-summoned, .is-round-winner')
      .forEach(function (node) {
        node.classList.remove('is-arriving', 'is-landing', 'is-weather-hit', 'is-weather-clear',
          'is-horn-hit', 'is-scorch-hit', 'is-power-surge', 'is-score-changed',
          'is-round-fresh', 'is-gem-spent', 'is-counting', 'is-new', 'is-summoned',
          'is-round-winner');
      });
    qa('.fx-horn-wave, .fx-weather-veil').forEach(removeNode);
  }

  function hideTurnBanner() {
    var banner = $('turn-banner');
    if (!banner) return;
    banner.hidden = true;
    banner.classList.remove('is-on');
    banner.innerHTML = '';
  }

  function flush() {
    clearTimers();
    clearNumbers();
    clearTransientClasses();
    var layer = fxLayer();
    if (layer) layer.innerHTML = '';
    var b = board();
    if (b) b.classList.remove('is-resolving', 'is-turn-shift');
    hideTurnBanner();
    ctx = null;
  }

  motion.reset = function () {
    flush();
    var b = board();
    if (b) b.classList.remove('is-round-over', 'is-match-over');
    var screen = $('screen-table');
    if (screen) screen.classList.remove('is-round-overlay', 'is-final');
    hidePreview();
  };

  /* ------------------------------------------------------------------------
     Action lifecycle
     ------------------------------------------------------------------------ */

  motion.beginAction = function (intent) {
    flush();
    hidePreview();
    var state = UI.state;
    ctx = {
      id: ++seq,
      intent: intent || null,
      events: [],
      before: snapshot(state),
      state: state
    };
    var b = board();
    if (b) b.classList.add('is-resolving');
  };

  motion.intent = function (intent) {
    if (!ctx || !intent) return;
    ctx.intent = intent;
  };

  motion.cancel = function () {
    if (!ctx) return;
    ctx = null;
    var b = board();
    if (b) b.classList.remove('is-resolving');
  };

  motion.event = function (type, payload) {
    if (!ctx) return;
    ctx.events.push({ type: type, payload: payload || {} });
  };

  motion.beforeRender = function () {
    var active = document.activeElement;
    lastRenderFocus = active && active.classList && active.classList.contains('card--hand')
      ? active.getAttribute('data-uid') : null;
    var hover = q('.hand .card--hand:hover');
    lastRenderHover = hover ? hover.getAttribute('data-uid') : null;
  };

  motion.afterRender = function (state, options) {
    var act = ctx;
    ctx = null;
    applyStateClasses(state);
    if (!act) {
      restoreHandFocus(state);
      syncPreview();
      return;
    }
    act.options = options || {};
    runAction(act, state);
    restoreHandFocus(state);
    hidePreview();
  };

  function applyStateClasses(state) {
    if (!state) return;
    var b = board();
    if (b) {
      b.classList.toggle('is-round-over', state.phase === 'roundEnd' || state.phase === 'gameover');
      b.classList.toggle('is-match-over', state.phase === 'gameover');
    }
    var hand = handHost();
    if (hand) {
      hand.classList.toggle('is-passed', !!state.passed.player);
      hand.classList.toggle('is-disabled', !canAct(state));
    }
    var screen = $('screen-table');
    if (screen) screen.classList.toggle('is-match-over', state.phase === 'gameover');
  }

  function canAct(state) {
    return (state.phase === 'mulligan' && !state.mulligan.player.done) ||
      (state.phase === 'playing' && state.turn === 'player' && !state.passed.player);
  }

  /* ------------------------------------------------------------------------
     Main action choreography
     ------------------------------------------------------------------------ */

  function runAction(act, state) {
    if (UI.state !== state) return;
    var t = timings();
    var intent = act.intent || {};
    var card = intent.cardId ? G.CARDS[intent.cardId] : null;
    var isPlay = intent.type === 'play' && card;
    var turnEvent = findEvent(act.events, 'turn');
    var passEvent = findEvent(act.events, 'pass');
    var roundEnd = findEvent(act.events, 'roundEnd');
    var matchEnd = findEvent(act.events, 'matchEnd');
    var roundStart = findEvent(act.events, 'roundStart');
    var scoreDelay = 70;
    var effectDelay = 70;

    if (isPlay) {
      var plan = playSequence(act, state, intent, card, t);
      scoreDelay = plan.scoreDelay;
      effectDelay = plan.effectDelay;
    }

    scheduleEffects(act, state, effectDelay, t, !!isPlay);
    var drawDelay = isPlay ? t.commit + t.travel + t.place + (reduced() ? 0 : 100)
      : roundEnd ? 500 : 90;
    scheduleDraws(act, state, drawDelay, t);

    if (roundStart) {
      later(function () {
        var rows = qa('.row');
        rows.forEach(function (row, index) {
          row.style.animationDelay = (index * 35) + 'ms';
          row.classList.add('is-round-fresh');
        });
        later(function () {
          rows.forEach(function (row) {
            row.classList.remove('is-round-fresh');
            row.style.animationDelay = '';
          });
        }, 900);
      }, 60);
    }

    if (passEvent) {
      later(function () { pulsePass(passEvent.payload.side); }, 100);
    }

    if (roundEnd) {
      later(function () {
        var b = board();
        if (b) b.classList.add('is-round-over');
        pulseGems(act, state);
      }, 160);
    }

    presentScores(act, state, scoreDelay, t);

    if (matchEnd) {
      later(function () {
        var b = board();
        if (b) b.classList.add('is-match-over');
        var screen = $('screen-table');
        if (screen) screen.classList.add('is-match-over');
      }, 240);
    }

    var resolveEnd = Math.max(
      scoreDelay + t.score + 90,
      isPlay ? t.commit + t.travel + t.place + t.impact : 260
    );
    later(function () {
      var b = board();
      if (b) b.classList.remove('is-resolving');
    }, resolveEnd);

    if (turnEvent && !roundEnd && !matchEnd && state.phase === 'playing') {
      var bannerDelay = Math.max(
        isPlay ? t.commit + t.travel + t.place + t.impact + 80 : 160,
        scoreDelay + t.score + 60
      );
      later(function () { showTurnBanner(state); }, bannerDelay);
    }
  }

  /* ------------------------------------------------------------------------
     Card flight
     ------------------------------------------------------------------------ */

  function isMajor(card) {
    if (!card) return false;
    if (card.hero) return true;
    if (card.special && card.special !== 'decoy') return true;
    return !!(card.abilities && (card.abilities.indexOf('scorch') !== -1 ||
      card.abilities.indexOf('muster') !== -1 || card.abilities.indexOf('medic') !== -1));
  }

  function sourceRect(act, intent) {
    var before = act.before;
    if (before.hand[intent.uid]) return before.hand[intent.uid].rect;
    var side = intent.side === 'enemy' ? 'enemy' : 'player';
    return before.handPile[side] || before.deck[side] || {
      left: window.innerWidth / 2 - 35, top: window.innerHeight / 2 - 49,
      width: 70, height: 98, cx: window.innerWidth / 2, cy: window.innerHeight / 2
    };
  }

  function targetRect(act, intent, card) {
    if (card && !card.special) {
      var dest = cardNode(intent.uid);
      var rect = rectOf(dest);
      if (rect) return rect;
    }
    if (card && card.special) {
      if (card.special === 'horn' || card.special === 'mardroeme') {
        var target = intent.target || {};
        var side = target.side || intent.side || 'player';
        var rowName = target.row || 'melee';
        var rowRect = rectOf(q('.row[data-side="' + side + '"][data-row="' + rowName + '"] .row__scroll'));
        if (rowRect) return rowRect;
      }
      if (card.special === 'decoy' && intent.target && intent.target.uid) {
        var targetInst = act.before.board[intent.target.uid];
        if (targetInst) return targetInst.rect;
      }
      if (G.WEATHER[card.special] || card.special === 'clear') {
        var weather = rectOf($('weather-strip'));
        if (weather) return weather;
      }
      if (card.special === 'scorch') {
        var enemyField = rectOf(q('.battlefield--' + (intent.side === 'enemy' ? 'player' : 'enemy')));
        if (enemyField) return enemyField;
      }
    }
    return rectOf(q('.weather-strip')) || rectOf(board()) || {
      left: window.innerWidth / 2, top: window.innerHeight / 2,
      width: 1, height: 1, cx: window.innerWidth / 2, cy: window.innerHeight / 2
    };
  }

  function flyFace(cardId, from, to, t, opts) {
    opts = opts || {};
    var layer = fxLayer();
    var card = G.CARDS[cardId];
    if (!layer || !from || !to || !card) return null;
    var node = UI.createCard(card, { variant: 'flight' });
    if (!node) return null;
    node.removeAttribute('data-tip');
    node.classList.add('fx-card');
    node.style.left = from.left + 'px';
    node.style.top = from.top + 'px';
    node.style.width = from.width + 'px';
    node.style.height = from.height + 'px';
    node.style.setProperty('--cw', from.width + 'px');
    if (opts.className) node.classList.add(opts.className);
    layer.appendChild(node);

    var dx = to.cx - from.cx;
    var dy = to.cy - from.cy;
    var total = t.commit + t.travel;
    var lift = reduced() ? 0 : clamp(Math.abs(dx) * 0.12 + Math.abs(dy) * 0.18, 34, 132);
    var commitOffset = t.commit / total;
    var keyframes;
    if (reduced()) {
      keyframes = [
        { transform: 'translate(0,0)', offset: 0 },
        { transform: 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)', offset: 1 }
      ];
    } else {
      keyframes = [
        { transform: 'translate(0,0) rotate(0deg) scale(1)', filter: 'brightness(1)', offset: 0 },
        {
          transform: 'translate(0,-' + Math.round(from.height * 0.15) + 'px) rotate(-1.4deg) scale(1.06)',
          filter: 'brightness(1.08)', offset: commitOffset, easing: 'cubic-bezier(.25,.6,.3,1)'
        },
        {
          transform: 'translate(' + (dx * 0.55).toFixed(1) + 'px,' +
            (dy * 0.4 - lift).toFixed(1) + 'px) rotate(3deg) scale(1.02)',
          filter: 'brightness(1.12)', offset: 0.58
        },
        {
          transform: 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) rotate(0deg) scale(1)',
          filter: 'brightness(1)', offset: 1
        }
      ];
    }

    try {
      node.animate(keyframes, {
        duration: total,
        easing: 'cubic-bezier(.3,.7,.35,1)',
        fill: 'forwards'
      });
    } catch (err) {
      node.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    }

    later(function () {
      if (opts.onArrive) opts.onArrive();
      var fadeDuration = Math.max(80, t.place);
      try {
        var fade = node.animate([
          { opacity: 1, transform: 'translate(' + dx + 'px,' + dy + 'px) scale(1)' },
          { opacity: 0, transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.95)' }
        ], { duration: fadeDuration, easing: 'ease-out', fill: 'forwards' });
        fade.onfinish = function () { removeNode(node); };
      } catch (err2) {
        removeNode(node);
      }
      later(function () { removeNode(node); }, fadeDuration + 80);
    }, total);

    return node;
  }

  function flyBack(from, to, t, delay, onArrive) {
    var layer = fxLayer();
    if (!layer || !from || !to) return;
    later(function () {
      var node = document.createElement('div');
      node.className = 'card-back fx-card fx-card-back';
      node.style.left = from.left + 'px';
      node.style.top = from.top + 'px';
      node.style.width = Math.max(26, to.width * 0.94) + 'px';
      node.style.height = Math.max(36, to.height * 0.94) + 'px';
      node.style.setProperty('--cw', Math.max(26, to.width * 0.94) + 'px');
      layer.appendChild(node);
      var dx = to.cx - from.cx;
      var dy = to.cy - from.cy;
      var total = reduced() ? 120 : 330;
      var lift = reduced() ? 0 : -46;
      try {
        node.animate([
          { transform: 'translate(0,0) scale(.8) rotate(-6deg)', opacity: 0.4, offset: 0 },
          { transform: 'translate(' + (dx * 0.5).toFixed(1) + 'px,' + (dy * 0.35 + lift).toFixed(1) +
            'px) scale(1.04) rotate(2deg)', opacity: 1, offset: 0.6 },
          { transform: 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(1) rotate(0deg)',
            opacity: 1, offset: 1 }
        ], { duration: total, easing: 'cubic-bezier(.3,.7,.35,1)', fill: 'forwards' });
      } catch (err) {
        node.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      }
      later(function () {
        if (onArrive) onArrive();
        try {
          node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, fill: 'forwards' });
        } catch (err2) { /* ignore */ }
        later(function () { removeNode(node); }, 150);
      }, total);
    }, delay || 0);
  }

  function playSequence(act, state, intent, card, t) {
    var from = sourceRect(act, intent);
    var to = targetRect(act, intent, card);
    var dest = card.special ? null : cardNode(intent.uid);

    if (dest) {
      dest.classList.remove('card--just-played');
      dest.classList.add('is-arriving');
    }

    flyFace(card.id, from, to, t, {
      className: isMajor(card) ? 'is-major' : '',
      onArrive: function () {
        if (dest) {
          dest.classList.remove('is-arriving');
          dest.classList.add('is-landing');
          later(function () { dest.classList.remove('is-landing'); }, 440);
        }
        puff(to, specialKind(card), isMajor(card));
        if (dest) flashCard(dest);
      }
    });

    var placement = t.commit + t.travel + t.place;
    var settle = reduced() ? 0 : 100;
    var effectDuration = specialDuration(card, t);
    return {
      effectDelay: placement + settle,
      scoreDelay: placement + settle + effectDuration
    };
  }

  function specialDuration(card, t) {
    if (!card || !card.special) return 0;
    if (card.special === 'scorch') return t.effect + 140;
    if (card.special === 'decoy') return t.effect - 60;
    if (G.WEATHER[card.special] || card.special === 'clear') return t.effect - 120;
    return t.effect;
  }

  function specialKind(card) {
    if (!card) return 'gold';
    if (G.WEATHER[card.special]) return 'frost';
    if (card.special === 'clear') return 'sun';
    if (card.special === 'scorch') return 'fire';
    if (card.special === 'mardroeme') return 'spore';
    if (card.special === 'decoy') return 'dust';
    return 'gold';
  }

  /* ------------------------------------------------------------------------
     Score presentation
     ------------------------------------------------------------------------ */

  function presentScores(act, state, delay, t) {
    var rowStep = 0;
    G.ROW_ORDER.forEach(function (rowName) {
      ['player', 'enemy'].forEach(function (side) {
        var key = side + ':' + rowName;
        var before = act.before.rows[key];
        var after = E.scoreRow(state, side, rowName);
        if (before === after) return;
        var rowNode = q('.row[data-side="' + side + '"][data-row="' + rowName + '"]');
        if (!rowNode) return;
        var value = rowNode.querySelector('.row__score strong');
        var scoreHost = rowNode.querySelector('.row__score');
        if (scoreHost) {
          scoreHost.classList.add('is-counting');
          rowNode.classList.add('is-score-changed');
          later(function () {
            scoreHost.classList.remove('is-counting');
            rowNode.classList.remove('is-score-changed');
          }, delay + t.score + rowStep + 220);
        }
        animateNumber(value, before, after, t.score, delay + rowStep);
        rowStep += t.scoreStep;
      });
    });

    ['player', 'enemy'].forEach(function (side) {
      var before = act.before.scores[side];
      var after = E.scoreSide(state, side);
      if (before === after) return;
      var host = q('.hud--' + side + ' .score-plate');
      if (!host) return;
      host.classList.remove('is-bumped');
      host.classList.add('is-counting');
      animateNumber(host.querySelector('strong'), before, after, t.score, delay + rowStep);
      later(function () { host.classList.remove('is-counting'); }, delay + rowStep + t.score + 220);
      rowStep += t.scoreStep;
    });

    // Individual unit strength changes (weather, horn, morale, Mardroeme).
    Object.keys(act.before.board).forEach(function (uid, index) {
      var node = cardNode(uid);
      if (!node) return;
      var inst = null;
      ['player', 'enemy'].some(function (side) {
        G.ROW_ORDER.some(function (rowName) {
          var row = state.rows[side][rowName];
          for (var i = 0; i < row.cards.length; i += 1) {
            if (row.cards[i].uid === uid) { inst = row.cards[i]; return true; }
          }
          return false;
        });
        return !!inst;
      });
      if (!inst) return;
      var value = E.valueForInst(state, inst);
      var before = act.before.board[uid].value;
      if (value === before) return;
      var valueNode = node.querySelector('.card__strength');
      if (!valueNode) return;
      animateNumber(valueNode, before, value, Math.max(180, t.score - 60), delay + index * 28);
      node.classList.add('is-power-surge');
      later(function () { node.classList.remove('is-power-surge'); }, delay + t.score + 380);
    });
  }

  function pulseGems(act, state) {
    ['player', 'enemy'].forEach(function (side) {
      if (state.gems[side] >= act.before.gems[side]) return;
      var hud = q('.hud--' + side);
      if (hud) {
        var gems = hud.querySelector('.hud__gems');
        if (gems) pulse(gems, 'is-gem-spent', 1000);
      }
      var tracker = q('.round-tracker__gem');
      if (tracker) pulse(tracker, 'is-gem-spent', 1000);
    });
  }

  function pulsePass(side) {
    var hud = q('.hud--' + side);
    if (hud) {
      var stamp = hud.querySelector('.pass-stamp');
      if (stamp) pulse(stamp, 'is-stamped', 900);
    }
    if (side === 'player') {
      var hand = handHost();
      if (hand) pulse(hand, 'is-passed-pulse', 700);
    }
  }

  /* ------------------------------------------------------------------------
     Effect layers
     ------------------------------------------------------------------------ */

  function puff(rect, kind, major) {
    var layer = fxLayer();
    if (!layer || !rect) return;
    var node = document.createElement('span');
    node.className = 'fx-puff fx-puff--' + (kind || 'gold') + (major ? ' is-major' : '');
    node.style.left = rect.cx + 'px';
    node.style.top = rect.cy + 'px';
    node.style.width = Math.max(44, Math.min(140, rect.width * 0.9)) + 'px';
    node.style.height = Math.max(44, Math.min(140, rect.height * 0.9)) + 'px';
    layer.appendChild(node);
    later(function () { removeNode(node); }, major ? 980 : 760);
  }

  function flashCard(node) {
    if (!node) return;
    node.classList.add('is-landing');
    later(function () { node.classList.remove('is-landing'); }, 480);
  }

  function scheduleEffects(act, state, delay, t, isPlay) {
    var events = act.events;

    eventsOf(events, 'horn').forEach(function (event) {
      later(function () { hornWave(event.payload.side, event.payload.row, t, false); }, delay);
    });
    eventsOf(events, 'doubleRow').forEach(function (event) {
      later(function () { hornWave(event.payload.side, event.payload.row, t, true); }, delay);
    });
    eventsOf(events, 'mardroeme').forEach(function (event) {
      later(function () { mardroemeRow(event.payload.side, event.payload.row); }, delay);
    });
    eventsOf(events, 'weather').forEach(function (event) {
      later(function () { weatherHit(event.payload.type); }, delay);
    });
    eventsOf(events, 'clearWeather').forEach(function (event) {
      later(function () { weatherClear(act); }, delay);
    });

    var burns = events.filter(function (event) {
      return event.type === 'scorch' || event.type === 'destroy';
    });
    if (burns.length) {
      later(function () { burnGhosts(act, burns, t); }, delay);
    }

    eventsOf(events, 'decoy').forEach(function (event) {
      later(function () { decoyReturn(act, event.payload, t); }, delay);
    });
    eventsOf(events, 'skellige').forEach(function (event) {
      later(function () { skelligeReturn(act, event.payload, t); }, delay + 90);
    });

    ['muster', 'summon', 'revive', 'token', 'transform'].forEach(function (type) {
      eventsOf(events, type).forEach(function (event) {
        later(function () { spawnFlash(act, event); }, delay + 80);
      });
    });

    eventsOf(events, 'leader').forEach(function (event) {
      later(function () {
        var side = event.payload.side || 'player';
        var leader = q('.hud--' + side + ' .hud__leader');
        if (leader) pulse(leader, 'is-acting', 900);
      }, delay);
    });

    eventsOf(events, 'keep').forEach(function (event) {
      later(function () {
        var node = cardNode(event.payload.uid);
        if (node) pulse(node, 'is-kept', 1000);
      }, delay);
    });
  }

  function hornWave(side, rowName, t, double) {
    var row = q('.row[data-side="' + side + '"][data-row="' + rowName + '"]');
    if (!row) return;
    row.classList.add('is-horn-hit');
    var wave = document.createElement('span');
    wave.className = 'fx-horn-wave' + (double ? ' is-double' : '');
    row.appendChild(wave);
    qa('.card', row).forEach(function (card, index) {
      card.style.animationDelay = (index * 55) + 'ms';
      card.classList.add('is-power-surge');
      later(function () {
        card.classList.remove('is-power-surge');
        card.style.animationDelay = '';
      }, 700 + index * 55);
    });
    puff(rectOf(row) || { cx: 0, cy: 0, width: 80, height: 80 }, 'gold', true);
    later(function () {
      row.classList.remove('is-horn-hit');
      removeNode(wave);
    }, reduced() ? 500 : 1100);
  }

  function mardroemeRow(side, rowName) {
    var row = q('.row[data-side="' + side + '"][data-row="' + rowName + '"]');
    if (!row) return;
    pulse(row, 'is-mardroeme-hit', 1000);
    var rect = rectOf(row);
    if (rect) puff(rect, 'spore', false);
  }

  function weatherHit(type) {
    var weather = G.WEATHER[type];
    if (!weather) return;
    weather.rows.forEach(function (rowName) {
      ['player', 'enemy'].forEach(function (side) {
        var row = q('.row[data-side="' + side + '"][data-row="' + rowName + '"]');
        if (!row) return;
        row.classList.add('is-weather-hit');
        var veil = document.createElement('span');
        veil.className = 'fx-weather-veil fx-weather-veil--' + type;
        row.appendChild(veil);
        later(function () {
          row.classList.remove('is-weather-hit');
          removeNode(veil);
        }, reduced() ? 450 : 1250);
      });
    });
    var strip = $('weather-strip');
    if (strip) pulse(strip, 'is-weather-flash', 900);
  }

  function weatherClear(act) {
    var strip = $('weather-strip');
    if (strip) pulse(strip, 'is-weather-clear', 900);
    Object.keys(act.before.weather).forEach(function (key) {
      var parts = key.split(':');
      var row = q('.row[data-side="' + parts[0] + '"][data-row="' + parts[1] + '"]');
      if (!row || row.getAttribute('data-weather')) return;
      row.classList.add('is-weather-clear');
      later(function () { row.classList.remove('is-weather-clear'); }, 900);
    });
  }

  function burnGhosts(act, events, t) {
    var used = {};
    var delay = 0;
    events.forEach(function (event) {
      var cardIds = event.type === 'scorch'
        ? (event.payload.destroyed || [])
        : [event.payload.cardId];
      cardIds.forEach(function (cardId) {
        var entry = null;
        Object.keys(act.before.board).some(function (uid) {
          if (used[uid]) return false;
          var candidate = act.before.board[uid];
          if (candidate.cardId !== cardId) return false;
          used[uid] = true;
          entry = candidate;
          return true;
        });
        if (!entry) return;
        var wait = delay;
        later(function () { burnGhost(entry, t); }, wait);
        delay += reduced() ? 50 : 95;
      });
    });
  }

  function burnGhost(entry, t) {
    var layer = fxLayer();
    var card = G.CARDS[entry.cardId];
    if (!layer || !card) return;
    var node = UI.createCard(card, { variant: 'flight', value: entry.value });
    if (!node) return;
    node.removeAttribute('data-tip');
    node.classList.add('fx-card', 'fx-ghost');
    node.style.left = entry.rect.left + 'px';
    node.style.top = entry.rect.top + 'px';
    node.style.width = entry.rect.width + 'px';
    node.style.height = entry.rect.height + 'px';
    node.style.setProperty('--cw', entry.rect.width + 'px');
    layer.appendChild(node);

    var row = q('.row[data-side="' + entry.side + '"][data-row="' + entry.row + '"]');
    if (row) pulse(row, 'is-scorch-hit', 800);
    puff(entry.rect, 'fire', true);

    if (reduced()) {
      try {
        node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' });
      } catch (err) { /* ignore */ }
      later(function () { removeNode(node); }, 170);
      return;
    }

    try {
      var anim = node.animate([
        { opacity: 1, filter: 'brightness(1) saturate(1)', transform: 'scale(1) rotate(0deg)', offset: 0 },
        { opacity: 1, filter: 'brightness(1.9) sepia(.35) saturate(1.2)', transform: 'scale(1.04) rotate(-1deg)', offset: 0.3 },
        { opacity: 0.9, filter: 'brightness(1.3) saturate(.4)', transform: 'scale(1.02) rotate(1deg)', offset: 0.55 },
        { opacity: 0, filter: 'brightness(.25) blur(3px)', transform: 'scale(.78) translateY(8px) rotate(3deg)', offset: 1 }
      ], { duration: 620, easing: 'ease-in', fill: 'forwards' });
      anim.onfinish = function () { removeNode(node); };
    } catch (err2) {
      removeNode(node);
    }
    later(function () { removeNode(node); }, 700);
  }

  function decoyReturn(act, payload, t) {
    var entry = act.before.board[payload.returned];
    if (!entry) return;
    var node = handNode(payload.returned);
    var destination = rectOf(node) || act.before.handPile[entry.owner] || act.before.handPile.player;
    if (!destination) return;
    if (node) node.classList.add('is-arriving');
    flyFace(entry.cardId, entry.rect, destination, t, {
      onArrive: function () {
        if (node) {
          node.classList.remove('is-arriving');
          node.classList.add('is-new');
          later(function () { node.classList.remove('is-new'); }, 700);
        }
        puff(destination, 'dust', false);
      }
    });
  }

  function skelligeReturn(act, payload, t) {
    var side = payload.side || 'player';
    var source = act.before.grave[side] || act.before.grave.player;
    if (!source) return;
    var cards = payload.cards || [];
    var index = 0;
    qa('.row .card[data-uid]').forEach(function (node) {
      var uid = node.getAttribute('data-uid');
      if (act.before.board[uid]) return;
      var cardId = node.getAttribute('data-card-id');
      if (cards.indexOf(cardId) === -1) return;
      var to = rectOf(node);
      if (!to) return;
      node.classList.add('is-arriving');
      var wait = index * 120;
      index += 1;
      later(function () {
        flyFace(cardId, source, to, t, {
          onArrive: function () {
            node.classList.remove('is-arriving');
            node.classList.add('is-new');
            later(function () { node.classList.remove('is-new'); }, 700);
          }
        });
      }, wait);
    });
  }

  function spawnFlash(act, event) {
    var payload = event.payload || {};
    var nodes = [];
    if (payload.uid) {
      var node = cardNode(payload.uid);
      if (node) nodes.push(node);
    }
    if (payload.cards) {
      qa('.row .card[data-uid]').forEach(function (candidate) {
        var uid = candidate.getAttribute('data-uid');
        if (act.before.board[uid]) return;
        if (payload.cards.indexOf(candidate.getAttribute('data-card-id')) !== -1) nodes.push(candidate);
      });
    }
    nodes.forEach(function (node) {
      node.classList.add('is-summoned');
      later(function () { node.classList.remove('is-summoned'); }, 900);
      var rect = rectOf(node);
      if (rect) puff(rect, 'gold', false);
    });
  }

  /* ------------------------------------------------------------------------
     Draws
     ------------------------------------------------------------------------ */

  function scheduleDraws(act, state, delay, t) {
    var draws = eventsOf(act.events, 'draw');
    if (!draws.length) return;
    var playerDelay = delay;
    draws.forEach(function (event) {
      var payload = event.payload || {};
      var side = payload.side || 'player';
      var source = act.before.deck[side] || act.before.deck.player;
      if (!source) return;
      if (side === 'player') {
        var uids = payload.uids || [];
        if (!uids.length) {
          qa('.hand .card--hand[data-uid]').forEach(function (node) {
            var uid = node.getAttribute('data-uid');
            if (!act.before.hand[uid]) uids.push(uid);
          });
        }
        uids.forEach(function (uid, index) {
          var node = handNode(uid);
          if (!node) return;
          var to = rectOf(node);
          if (!to) return;
          node.classList.add('is-arriving');
          flyBack(source, to, t, playerDelay + index * 90, function () {
            node.classList.remove('is-arriving');
            node.classList.add('is-new');
            later(function () { node.classList.remove('is-new'); }, 650);
          });
        });
        playerDelay += uids.length * 90 + 80;
      } else {
        var handPile = act.before.handPile.enemy;
        if (!handPile) return;
        var count = payload.count || 1;
        for (var i = 0; i < count; i += 1) {
          var destination = {
            left: handPile.left + (i * 3), top: handPile.top + (i * 2),
            width: handPile.width, height: handPile.height,
            cx: handPile.cx + (i * 3), cy: handPile.cy + (i * 2)
          };
          flyBack(source, destination, t, playerDelay + i * 90, null);
        }
        playerDelay += count * 90 + 80;
      }
    });
  }

  /* ------------------------------------------------------------------------
     Turn banner
     ------------------------------------------------------------------------ */

  function showTurnBanner(state) {
    var banner = $('turn-banner');
    if (!banner || !state || state.phase !== 'playing') return;
    var overlay = $('round-overlay');
    if (overlay && !overlay.classList.contains('hidden')) return;
    if (UI.isModalOpen && UI.isModalOpen()) return;

    var side = state.turn;
    var factionId = E.factionOfSide(state, side);
    var faction = G.FACTIONS[factionId] || G.FACTIONS.neutral;
    var iconId = faction && faction.icon ? faction.icon : 'i-wolf';
    var copy = side === 'player' ? 'Your move' : 'Opponent moves';
    var eyebrow = side === 'player' ? 'The table turns to you' : 'The rival commander acts';

    UI.setFactionVars(banner, factionId);
    banner.className = 'turn-banner is-' + side;
    banner.innerHTML =
      '<div class="turn-banner__medallion">' + UI.icon(iconId) + '</div>' +
      '<div class="turn-banner__copy">' +
        '<span class="turn-banner__eyebrow">' + UI.esc(eyebrow) + '</span>' +
        '<strong>' + UI.esc(copy) + '</strong>' +
        '<em>' + UI.esc(faction ? faction.name : '') + ' · Round ' + UI.roman(state.round) + '</em>' +
      '</div>';
    banner.hidden = false;
    var b = board();
    if (b) b.classList.add('is-turn-shift');
    window.requestAnimationFrame(function () {
      banner.classList.add('is-on');
    });

    var t = timings();
    later(function () {
      banner.classList.remove('is-on');
      if (b) b.classList.remove('is-turn-shift');
    }, Math.max(160, t.banner - 230));
    later(function () {
      banner.hidden = true;
      banner.className = 'turn-banner';
      banner.innerHTML = '';
    }, t.banner);
  }

  /* ------------------------------------------------------------------------
     Round and final reveal
     ------------------------------------------------------------------------ */

  motion.roundReveal = function (info, state) {
    hideTurnBanner();
    var b = board();
    if (b) b.classList.remove('is-turn-shift');
    if (b) b.classList.add('is-round-over');
    var screen = $('screen-table');
    if (screen) screen.classList.add('is-round-overlay');
    if (info && (info.winner === 'player' || info.winner === 'enemy')) {
      var hud = q('.hud--' + info.winner + ' .score-plate');
      if (hud) pulse(hud, 'is-round-winner', 1600);
    }
    if (state && state.gems) {
      ['player', 'enemy'].forEach(function (side) {
        var gems = q('.hud--' + side + ' .hud__gems');
        if (gems) pulse(gems, 'is-gem-spent', 1200);
      });
    }
  };

  motion.roundHide = function () {
    var screen = $('screen-table');
    if (screen) screen.classList.remove('is-round-overlay');
  };

  motion.finalReveal = function (result) {
    hideTurnBanner();
    var b = board();
    if (b) b.classList.add('is-match-over');
    var screen = $('screen-table');
    if (screen) screen.classList.add('is-final');
    if (result && result.winner === 'player') {
      var hud = q('.hud--player .score-plate');
      if (hud) pulse(hud, 'is-round-winner', 1800);
    }
  };

  motion.hideFinal = function () {
    var screen = $('screen-table');
    if (screen) screen.classList.remove('is-final');
  };

  /* ------------------------------------------------------------------------
     Hand focus and preview
     ------------------------------------------------------------------------ */

  function restoreHandFocus(state) {
    var hand = handHost();
    if (!hand) return;
    if (!lastRenderFocus) return;
    var target = null;
    var selection = UI.getSelection ? UI.getSelection() : null;
    var uid = lastRenderFocus;
    if (!handNode(uid) && selection && selection.uid) uid = selection.uid;
    target = handNode(uid);
    if (!target) {
      var cards = qa('.card--hand', hand);
      target = cards.length ? cards[0] : null;
    }
    if (!target) return;
    try {
      target.focus({ preventScroll: true });
    } catch (err) {
      try { target.focus(); } catch (err2) { /* ignore */ }
    }
    lastRenderFocus = null;
  }

  function onHandKeydown(event) {
    var hand = handHost();
    if (!hand) return;
    var cards = qa('.card--hand', hand);
    if (!cards.length) return;
    var current = event.target.closest ? event.target.closest('.card--hand') : null;
    var index = cards.indexOf(current);
    var next = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = cards[Math.min(cards.length - 1, index + 1)];
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = cards[Math.max(0, index - 1)];
    } else if (event.key === 'Home') {
      next = cards[0];
    } else if (event.key === 'End') {
      next = cards[cards.length - 1];
    } else if (event.key === 'Enter' || event.key === ' ') {
      if (!current) return;
      event.preventDefault();
      current.click();
      return;
    } else if (event.key === 'Escape') {
      if (UI.getSelection && UI.getSelection()) {
        event.preventDefault();
        UI.clearSelection(true);
      }
      return;
    } else {
      return;
    }
    if (!next || next === current) return;
    event.preventDefault();
    try { next.focus({ preventScroll: true }); } catch (err) { next.focus(); }
    if (next.scrollIntoView) {
      try { next.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (err2) { /* ignore */ }
    }
  }

  function previewAbilityHtml(card) {
    var html = '';
    if (card.hero) {
      html += '<span class="card-preview__ability is-hero">' + UI.icon('i-crown', 'card-preview__ability-icon') +
        '<b>Hero.</b> Immune to weather, Scorch, Decoy and hostile effects.</span>';
    }
    if (card.special) {
      var weather = G.WEATHER[card.special];
      if (weather) {
        html += '<span class="card-preview__ability">' + UI.icon(weather.icon, 'card-preview__ability-icon') +
          '<b>' + UI.esc(weather.name) + '.</b> ' + UI.esc(weather.desc) + '</span>';
      } else {
        var info = SPECIAL_INFO[card.special];
        if (info) {
          html += '<span class="card-preview__ability">' + UI.icon(info.icon, 'card-preview__ability-icon') +
            '<b>' + UI.esc(info.name) + '.</b> ' + UI.esc(info.desc) + '</span>';
        }
      }
    }
    (card.abilities || []).forEach(function (id) {
      var ability = G.ABILITIES[id];
      if (!ability) return;
      html += '<span class="card-preview__ability">' +
        UI.icon(ability.icon || 'i-star', 'card-preview__ability-icon') +
        '<b>' + UI.esc(ability.name) + '.</b> ' + UI.esc(ability.desc) + '</span>';
    });
    if (!html) {
      html = '<span class="card-preview__ability is-muted">No special ability.</span>';
    }
    return html;
  }

  function showPreview(node) {
    var state = UI.state;
    var host = $('card-preview');
    if (!state || !host || !node) return;
    var uid = node.getAttribute('data-uid');
    var inst = E.findHandCard(state, 'player', uid);
    if (!inst) return;
    var card = G.CARDS[inst.cardId];
    if (!card) return;

    if (previewHideTimer) {
      window.clearTimeout(previewHideTimer);
      previewHideTimer = null;
    }

    var faction = G.FACTIONS[card.faction] || { name: 'Neutral' };
    var rowLabel = card.special ? 'Special' : G.rowName(card);
    var meta = faction.name + ' · ' + rowLabel;
    if (!card.special) meta += ' · Base ' + card.strength;
    var power = card.special ? '' : '<span class="card-preview__power">' + card.strength + '</span>';
    var rowIcon = card.special ? (card.icon || 'i-star') : G.rowIcon(card);

    host.innerHTML =
      '<div class="card-preview__inner">' +
        '<div class="card-preview__artwrap">' +
          UI.artImage(card.art, 'card-preview__art-img') +
          '<span class="card-preview__artshade"></span>' +
          '<span class="card-preview__rowicon">' + UI.icon(rowIcon) + '</span>' +
          power +
        '</div>' +
        '<div class="card-preview__copy">' +
          '<span class="card-preview__meta">' + UI.esc(meta) + '</span>' +
          '<h3>' + UI.esc(card.name) + '</h3>' +
          '<div class="card-preview__abilities">' + previewAbilityHtml(card) + '</div>' +
        '</div>' +
      '</div>';

    host.hidden = false;
    host.classList.remove('is-visible');
    positionPreview(node, host);
    window.requestAnimationFrame(function () { host.classList.add('is-visible'); });
  }

  function positionPreview(node, host) {
    var rect = node.getBoundingClientRect();
    var width = host.offsetWidth || 320;
    var height = host.offsetHeight || 220;
    var left = clamp(rect.left + rect.width / 2 - width / 2, 10, window.innerWidth - width - 10);
    var top = rect.top - height - 16;
    if (top < 10) top = rect.bottom + 16;
    if (top + height > window.innerHeight - 10) top = Math.max(10, window.innerHeight - height - 10);
    host.style.left = Math.round(left) + 'px';
    host.style.top = Math.round(top) + 'px';
  }

  function hidePreview() {
    var host = $('card-preview');
    if (!host) return;
    host.classList.remove('is-visible');
    if (previewHideTimer) window.clearTimeout(previewHideTimer);
    previewHideTimer = window.setTimeout(function () {
      if (!host.classList.contains('is-visible')) host.hidden = true;
      previewHideTimer = null;
    }, 140);
  }

  function syncPreview() {
    if (!UI.state) { hidePreview(); return; }
    var selection = UI.getSelection ? UI.getSelection() : null;
    if (selection && selection.uid) {
      var selected = handNode(selection.uid);
      if (selected) { showPreview(selected); return; }
    }
    var hover = q('.hand .card--hand:hover');
    if (hover) { showPreview(hover); return; }
    var active = document.activeElement;
    if (active && active.classList && active.classList.contains('card--hand')) {
      showPreview(active);
      return;
    }
    hidePreview();
  }

  function bindPreview() {
    var hand = handHost();
    if (!hand) return;
    hand.addEventListener('pointerover', function (event) {
      var node = event.target.closest ? event.target.closest('.card--hand') : null;
      if (node) showPreview(node);
    });
    hand.addEventListener('pointerout', function (event) {
      var node = event.target.closest ? event.target.closest('.card--hand') : null;
      if (!node) return;
      var next = event.relatedTarget;
      if (next && node.contains(next)) return;
      if (next && next.closest && next.closest('.card--hand')) return;
      if (UI.getSelection && UI.getSelection()) return;
      hidePreview();
    });
    hand.addEventListener('focusin', function (event) {
      var node = event.target.closest ? event.target.closest('.card--hand') : null;
      if (node) showPreview(node);
    });
    hand.addEventListener('focusout', function (event) {
      if (hand.contains(event.relatedTarget)) return;
      if (UI.getSelection && UI.getSelection()) return;
      hidePreview();
    });
    hand.addEventListener('keydown', onHandKeydown);
    window.addEventListener('resize', hidePreview);
    window.addEventListener('scroll', hidePreview, true);
  }

  /* ------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------ */

  motion.init = function () {
    bindPreview();
  };

  motion.snapshot = snapshot;
  motion.flush = flush;
})();
