/* ==========================================================================
   GWENT — opponent intelligence
   Legal move generation, hand evaluation, leader timing and passing.
   ========================================================================== */
(function () {
  'use strict';

  var G = window.GWENT;
  var E = G.Engine;
  var AI = G.AI = {};

  var ROWS = G.ROW_ORDER;
  var SIDES = ['player', 'enemy'];
  var WEATHERS = ['frost', 'fog', 'rain', 'storm'];

  function other(side) { return side === 'player' ? 'enemy' : 'player'; }
  function cardOf(inst) { return inst ? G.CARDS[inst.cardId] : null; }
  function has(card, ability) { return !!(card && card.abilities && card.abilities.indexOf(ability) !== -1); }
  function isUnit(card) { return !!(card && !card.special); }
  function isHero(card) { return !!(card && card.hero); }
  function isSpy(card) { return has(card, 'spy'); }
  function isWeatherCard(card) { return !!(card && card.weather && card.special); }

  function factionOf(state, side) {
    return side === 'player' ? state.playerFaction : state.enemyFaction;
  }

  function leaderOf(state, side) {
    return G.LEADERS[side === 'player' ? state.playerLeaderId : state.enemyLeaderId];
  }

  function halfWeather(state) {
    return E.leaderEffectActive(state, 'halfWeather');
  }

  /* ------------------------------------------------------------------------
     A pure row evaluator. Mirrors the engine but can consider hypothetical
     cards, weather, horns and Mardroeme transformations without touching the
     real board.
     ------------------------------------------------------------------------ */

  function weatherSet(state, add) {
    var set = Object.create(null);
    state.weatherZone.forEach(function (inst) {
      var c = cardOf(inst);
      if (c && c.weather) set[c.weather] = true;
    });
    if (add) set[add] = true;
    return set;
  }

  function weatherHits(set, row) {
    return WEATHERS.some(function (type) {
      return set[type] && G.WEATHER[type].rows.indexOf(row) !== -1;
    });
  }

  function rowScoreWith(state, side, rowName, opts) {
    opts = opts || {};
    var row = state.rows[side] && state.rows[side][rowName];
    if (!row) return 0;
    var set = opts.weatherSet || weatherSet(state, opts.addWeather);
    var horn = opts.horn === undefined ? row.horn : opts.horn;
    var leaderDouble = opts.leaderDouble === undefined ? row.leaderDouble : opts.leaderDouble;
    var transforms = opts.transforms || null;
    var entries = [];

    row.cards.forEach(function (inst) {
      var c = cardOf(inst);
      if (!c || c.special) return;
      if (transforms && transforms[inst.uid]) c = transforms[inst.uid];
      entries.push({ card: c, uid: inst.uid });
    });
    if (opts.extraCard && isUnit(opts.extraCard)) {
      entries.push({ card: opts.extraCard, uid: opts.extraUid || '__extra' });
    }

    var affected = !opts.ignoreWeather && weatherHits(set, rowName);
    var halved = halfWeather(state);

    return entries.reduce(function (total, entry) {
      var c = entry.card;
      var base = c.strength;
      var hero = isHero(c);
      if (!hero && affected) base = halved ? Math.ceil(base / 2) : 1;
      if (isSpy(c) && state.flags.spyDouble) base *= 2;

      if (has(c, 'tightBond')) {
        var count = entries.filter(function (otherEntry) {
          return otherEntry.card.name === c.name;
        }).length;
        base *= Math.max(1, count);
      }

      if (!hero) {
        var morale = entries.filter(function (otherEntry) {
          return otherEntry.uid !== entry.uid && has(otherEntry.card, 'morale');
        }).length;
        base += morale;
      }

      if (!hero && (horn || leaderDouble)) base *= 2;
      else if (hero && leaderDouble) base *= 2;
      return total + base;
    }, 0);
  }

  function sideScoreWith(state, side, opts) {
    return ROWS.reduce(function (sum, row) {
      return sum + rowScoreWith(state, side, row, opts);
    }, 0);
  }

  function currentRowValue(state, side, rowName) {
    return rowScoreWith(state, side, rowName);
  }

  function nonHeroRowValue(state, side, rowName) {
    return state.rows[side][rowName].cards.reduce(function (sum, inst) {
      var c = cardOf(inst);
      if (!c || c.special || c.hero) return sum;
      return sum + E.valueForInst(state, inst);
    }, 0);
  }

  /* ------------------------------------------------------------------------
     Simple hand/card values
     ------------------------------------------------------------------------ */

  function deckDrawValue(state, side) {
    if (!state.decks[side].length) return 0;
    var values = state.decks[side].map(function (inst) {
      var c = cardOf(inst);
      if (!c) return 0;
      if (c.special) return 4;
      return Math.max(2, c.strength * 0.75);
    });
    var avg = values.reduce(function (a, b) { return a + b; }, 0) / values.length;
    return Math.max(3, Math.min(8, avg));
  }

  function bestGraveValue(state, side) {
    var best = 0;
    state.graves[side].forEach(function (inst) {
      var c = cardOf(inst);
      if (!c || c.special || c.hero || c.token) return;
      best = Math.max(best, c.strength + (has(c, 'medic') ? 3 : 0) + (isSpy(c) ? 4 : 0));
    });
    return best;
  }

  function cardHandValue(state, side, inst) {
    var c = cardOf(inst);
    if (!c) return 0;
    if (c.special) {
      if (c.weather) return 4 + Math.max(0, bestWeatherDelta(state, side, c.weather));
      if (c.special === 'clear') return 3 + Math.max(0, clearDelta(state, side));
      if (c.special === 'horn') return 3 + Math.max(0, bestHornGain(state, side));
      if (c.special === 'mardroeme') return 2 + bestMardroemeGain(state, side);
      if (c.special === 'scorch') return 3 + Math.max(0, bestSpecialScorch(state, side));
      if (c.special === 'decoy') return 3 + bestDecoyTarget(state, side).score * 0.4;
      return 3;
    }
    var value = c.strength;
    if (c.hero) value += 2;
    if (c.row === 'agile') value += 1;
    if (isSpy(c)) value += 4;
    if (has(c, 'medic')) value += 2 + Math.min(6, bestGraveValue(state, side) * 0.45);
    if (has(c, 'muster')) {
      var matches = state.decks[side].filter(function (candidate) {
        var m = cardOf(candidate);
        return m && (m.name === c.name || (c.musterGroup && m.musterGroup === c.musterGroup));
      });
      matches.forEach(function (m) { value += Math.max(1, cardOf(m).strength * 0.55); });
    }
    if (has(c, 'scorch')) value += 2;
    if (has(c, 'horn')) value += 5;
    if (has(c, 'mardroeme')) value += 3;
    if (has(c, 'avenger')) value += 4;
    if (has(c, 'tightBond')) {
      var same = state.hands[side].filter(function (candidate) {
        return candidate !== inst && cardOf(candidate) && cardOf(candidate).name === c.name;
      }).length;
      value += same * 2;
    }
    return value;
  }

  /* ------------------------------------------------------------------------
     Special-card and leader evaluators
     ------------------------------------------------------------------------ */

  function bestWeatherDelta(state, side, addType) {
    var selfBefore = sideScoreWith(state, side);
    var opp = other(side);
    var oppBefore = sideScoreWith(state, opp);
    var selfAfter = sideScoreWith(state, side, { addWeather: addType });
    var oppAfter = sideScoreWith(state, opp, { addWeather: addType });
    return (oppBefore - oppAfter) - (selfBefore - selfAfter);
  }

  function bestWeather(state, side) {
    var best = { type: null, delta: 0 };
    WEATHERS.forEach(function (type) {
      var delta = bestWeatherDelta(state, side, type);
      if (delta > best.delta) best = { type: type, delta: delta };
    });
    return best;
  }

  function clearDelta(state, side) {
    if (!state.weatherZone.length) return 0;
    var selfBefore = sideScoreWith(state, side);
    var opp = other(side);
    var oppBefore = sideScoreWith(state, opp);
    var empty = Object.create(null);
    var selfAfter = sideScoreWith(state, side, { weatherSet: empty });
    var oppAfter = sideScoreWith(state, opp, { weatherSet: empty });
    return (selfAfter - selfBefore) - (oppAfter - oppBefore);
  }

  function bestHornGain(state, side) {
    var best = 0;
    ROWS.forEach(function (row) {
      var r = state.rows[side][row];
      if (r.horn || r.leaderDouble) return;
      var before = rowScoreWith(state, side, row);
      var after = rowScoreWith(state, side, row, { horn: true });
      best = Math.max(best, after - before);
    });
    return best;
  }

  function hornTarget(state, side) {
    var best = null;
    ROWS.forEach(function (row) {
      var r = state.rows[side][row];
      if (r.horn || r.leaderDouble) return;
      var before = rowScoreWith(state, side, row);
      var gain = rowScoreWith(state, side, row, { horn: true }) - before;
      if (gain > 0 && (!best || gain > best.gain)) best = { side: side, row: row, gain: gain };
    });
    return best;
  }

  function transformsForRow(state, side, rowName) {
    var row = state.rows[side][rowName];
    if (row.mardroeme) return null;
    var map = Object.create(null);
    var count = 0;
    row.cards.forEach(function (inst) {
      var c = cardOf(inst);
      if (c && has(c, 'berserker') && c.transformInto && G.CARDS[c.transformInto]) {
        map[inst.uid] = G.CARDS[c.transformInto];
        count += 1;
      }
    });
    return count ? map : null;
  }

  function bestMardroeme(state, side) {
    var best = null;
    ROWS.forEach(function (row) {
      var map = transformsForRow(state, side, row);
      if (!map) return;
      var before = rowScoreWith(state, side, row);
      var after = rowScoreWith(state, side, row, { transforms: map });
      var gain = after - before;
      if (gain > 0 && (!best || gain > best.gain)) best = { side: side, row: row, gain: gain };
    });
    return best;
  }

  function bestMardroemeGain(state, side) {
    var best = bestMardroeme(state, side);
    return best ? best.gain : 0;
  }

  function strongestKilledOnRow(state, boardSide, rowName) {
    var row = state.rows[boardSide][rowName];
    var list = row.cards.filter(function (inst) {
      var c = cardOf(inst);
      return c && !c.special && !c.hero;
    }).map(function (inst) {
      return { inst: inst, value: E.valueForInst(state, inst) };
    });
    if (!list.length) return { total: 0, values: [] };
    var max = Math.max.apply(null, list.map(function (x) { return x.value; }));
    var values = list.filter(function (x) { return x.value === max; }).map(function (x) { return x.value; });
    return { total: values.reduce(function (a, b) { return a + b; }, 0), values: values };
  }

  function globalScorch(state, side, excludeUid) {
    var entries = [];
    SIDES.forEach(function (boardSide) {
      ROWS.forEach(function (row) {
        state.rows[boardSide][row].cards.forEach(function (inst) {
          var c = cardOf(inst);
          if (!c || c.special || c.hero) return;
          if (excludeUid && inst.uid === excludeUid) return;
          entries.push({ side: boardSide, value: E.valueForInst(state, inst) });
        });
      });
    });
    if (!entries.length) return 0;
    var max = Math.max.apply(null, entries.map(function (entry) { return entry.value; }));
    return entries.reduce(function (score, entry) {
      if (entry.value !== max) return score;
      return score + (entry.side === side ? -entry.value : entry.value);
    }, 0);
  }

  function bestSpecialScorch(state, side) {
    return Math.max(0, globalScorch(state, side, null));
  }

  function bestDecoyTarget(state, side) {
    var best = { inst: null, score: 0, spy: false, medic: false };
    SIDES.forEach(function (boardSide) {
      ROWS.forEach(function (row) {
        state.rows[boardSide][row].cards.forEach(function (inst) {
          var c = cardOf(inst);
          if (!c || c.special || c.hero || c.token) return;
          if (inst.owner !== side) return;
          var score = 1 + E.valueForInst(state, inst) * 0.35;
          if (isSpy(c)) score += 9;
          if (has(c, 'medic')) score += 3 + bestGraveValue(state, side) * 0.4;
          if (has(c, 'muster')) score += 2;
          if (score > best.score) {
            best = { inst: inst, score: score, spy: isSpy(c), medic: has(c, 'medic') };
          }
        });
      });
    });
    return best;
  }

  function spyBalance(state, side) {
    var opp = other(side);
    var gain = 0;
    SIDES.forEach(function (boardSide) {
      ROWS.forEach(function (row) {
        state.rows[boardSide][row].cards.forEach(function (inst) {
          var c = cardOf(inst);
          if (!c || !isSpy(c)) return;
          var value = E.valueForInst(state, inst);
          gain += boardSide === side ? value : -value;
        });
      });
    });
    return gain;
  }

  function agileMoveGain(state) {
    var gain = 0;
    SIDES.forEach(function (side) {
      ROWS.forEach(function (row) {
        state.rows[side][row].cards.forEach(function (inst) {
          var c = cardOf(inst);
          if (!c || c.row !== 'agile') return;
          var current = E.valueForInst(state, inst);
          var best = current;
          ['melee', 'ranged'].forEach(function (target) {
            if (target === row) return;
            var v = E.valueForCard(state, c, side, target, inst.uid);
            if (v > best + 0.001) best = v;
          });
          gain += Math.max(0, best - current);
        });
      });
    });
    return gain;
  }

  function graveValueOf(state, side, includeSpecials) {
    return state.graves[side].reduce(function (sum, inst) {
      var c = cardOf(inst);
      if (!c) return sum;
      if (c.special) return sum + (includeSpecials ? 6 : 0);
      return sum + c.strength + (c.hero ? 2 : 0);
    }, 0);
  }

  function cardOnBoardValue(state, inst) {
    var c = cardOf(inst);
    if (!c) return 0;
    if (c.special) return 5;
    return c.strength + (c.hero ? 2 : 0) + (has(c, 'medic') ? 3 : 0) + (isSpy(c) ? 4 : 0);
  }

  function bestGraveCard(state, side) {
    var best = null;
    state.graves[side].forEach(function (inst) {
      var value = cardOnBoardValue(state, inst);
      if (!best || value > best.value) best = { inst: inst, value: value };
    });
    return best;
  }

  function leaderThreat(state, side) {
    var rival = other(side);
    var leader = leaderOf(state, rival);
    if (!leader || leader.passive || state.usedLeaders[rival] || state.cancelledLeaders[rival]) return 0;
    var threat = {
      weather: 5,
      weatherChoose: 6,
      clearWeather: 2,
      destroyRow: 6,
      doubleRow: 6,
      peekHand: 2,
      stealGrave: 4,
      recoverGrave: 3,
      cancelLeader: 3,
      hope: 3,
      doubleSpies: 3,
      discardDraw: 2,
      shuffleGraves: 3
    };
    return threat[leader.action] || 0;
  }

  /* ------------------------------------------------------------------------
     Unit deployment scoring
     ------------------------------------------------------------------------ */

  function bestUnitRow(state, side, card) {
    if (card.row !== 'agile') return card.row;
    var boardSide = isSpy(card) ? other(side) : side;
    var best = null;
    ['melee', 'ranged'].forEach(function (row) {
      var before = rowScoreWith(state, boardSide, row);
      var after = rowScoreWith(state, boardSide, row, { extraCard: card });
      var gain = after - before;
      if (boardSide !== side) gain = -gain;
      if (!best || gain > best.gain) best = { row: row, gain: gain };
    });
    return best ? best.row : 'melee';
  }

  function unitPlayScore(state, side, card) {
    var row = bestUnitRow(state, side, card);
    var boardSide = isSpy(card) ? other(side) : side;
    var before = rowScoreWith(state, boardSide, row);
    var after = rowScoreWith(state, boardSide, row, { extraCard: card });
    var delta = after - before;
    var score = boardSide === side ? delta : -delta;

    if (isSpy(card)) {
      var draws = Math.min(2, state.decks[side].length);
      score += draws * deckDrawValue(state, side);
    }
    if (has(card, 'medic')) {
      score += Math.min(11, bestGraveValue(state, side) * 0.8);
    }
    if (has(card, 'muster')) {
      state.decks[side].forEach(function (inst) {
        var m = cardOf(inst);
        if (!m || m.special) return;
        if (m.name === card.name || (card.musterGroup && m.musterGroup === card.musterGroup)) {
          score += m.strength * 0.72;
        }
      });
    }
    if (has(card, 'summon') && card.summonName) {
      var summoned = 0;
      [state.hands[side], state.decks[side]].forEach(function (list) {
        list.forEach(function (inst) {
          var m = cardOf(inst);
          if (m && m.name === card.summonName) summoned += m.strength * 0.7;
        });
      });
      score += summoned;
    }
    if (has(card, 'scorch')) {
      if (card.scorch === 'row') {
        var enemyRow = state.rows[other(side)][row];
        var rowTotal = E.scoreRow(state, other(side), row);
        if (rowTotal >= 10) score += strongestKilledOnRow(state, other(side), row).total;
      } else if (card.scorch === 'global') {
        // The unit itself is excluded by the engine, so score the existing board.
        score += globalScorch(state, side, null);
      }
    }
    if (has(card, 'horn')) {
      var hornRow = state.rows[boardSide][row];
      if (!hornRow.horn && !hornRow.leaderDouble) {
        var hBefore = rowScoreWith(state, boardSide, row, { extraCard: card });
        var hAfter = rowScoreWith(state, boardSide, row, { extraCard: card, horn: true });
        score += boardSide === side ? (hAfter - hBefore) : -(hAfter - hBefore);
      }
    }
    if (has(card, 'mardroeme')) {
      var map = transformsForRow(state, boardSide, row);
      if (map) {
        var mBefore = rowScoreWith(state, boardSide, row, { extraCard: card });
        var mAfter = rowScoreWith(state, boardSide, row, { extraCard: card, transforms: map });
        score += boardSide === side ? (mAfter - mBefore) : -(mAfter - mBefore);
      }
    }
    return { score: score, row: row, target: card.row === 'agile' ? { row: row } : null };
  }

  /* ------------------------------------------------------------------------
     Leader scoring
     ------------------------------------------------------------------------ */

  function leaderOptionScore(state, side) {
    var leader = leaderOf(state, side);
    if (!leader) return { score: -1 };
    var check = E.canUseLeader(state, side);
    if (!check.ok) return { score: -1, reason: check.reason };
    var rival = other(side);
    var score = 0;
    var payload = null;

    switch (leader.action) {
      case 'weather':
        score = bestWeatherDelta(state, side, leader.weather);
        break;
      case 'weatherChoose': {
        var options = state.decks[side].filter(function (inst) {
          var c = cardOf(inst);
          return c && c.weather && c.special;
        });
        var best = { score: 0, inst: null };
        options.forEach(function (inst) {
          var delta = bestWeatherDelta(state, side, cardOf(inst).weather);
          if (delta > best.score) best = { score: delta, inst: inst };
        });
        score = best.score + 1;
        break;
      }
      case 'clearWeather':
        score = clearDelta(state, side);
        break;
      case 'destroyRow': {
        var targetSide = leader.target === 'enemy' ? rival : side;
        score = strongestKilledOnRow(state, targetSide, leader.row).total;
        break;
      }
      case 'doubleRow': {
        score = nonHeroRowValue(state, side, leader.row);
        break;
      }
      case 'peekHand':
        score = state.hands[rival].length <= 3 && state.round >= 2 ? 4 : 1;
        break;
      case 'stealGrave': {
        var stolen = bestGraveCard(state, rival);
        score = stolen ? stolen.value * 0.9 : 0;
        break;
      }
      case 'recoverGrave': {
        var recovered = bestGraveCard(state, side);
        score = recovered ? recovered.value * 0.75 : 0;
        break;
      }
      case 'cancelLeader':
        score = leaderThreat(state, side) * 1.4;
        break;
      case 'hope':
        score = agileMoveGain(state);
        break;
      case 'doubleSpies':
        score = spyBalance(state, side);
        break;
      case 'discardDraw': {
        var hand = state.hands[side].slice().sort(function (a, b) {
          return cardHandValue(state, side, a) - cardHandValue(state, side, b);
        });
        if (hand.length >= 2) {
          var worst = cardHandValue(state, side, hand[0]) + cardHandValue(state, side, hand[1]);
          score = Math.max(0, deckDrawValue(state, side) - worst);
        }
        break;
      }
      case 'shuffleGraves':
        score = graveValueOf(state, rival, true) - graveValueOf(state, side, true);
        break;
      default:
        score = 0;
    }

    return { score: score, leader: leader, payload: payload };
  }

  /* ------------------------------------------------------------------------
     Card actions
     ------------------------------------------------------------------------ */

  function findTargets(state, side, card) {
    if (card.special === 'horn') {
      var horn = hornTarget(state, side);
      return horn ? [{ side: side, row: horn.row, gain: horn.gain }] : [];
    }
    if (card.special === 'mardroeme') {
      var mard = bestMardroeme(state, side);
      return mard ? [{ side: side, row: mard.row, gain: mard.gain }] : [];
    }
    if (card.special === 'decoy') {
      var decoy = bestDecoyTarget(state, side);
      return decoy.inst ? [{ uid: decoy.inst.uid, score: decoy.score }] : [];
    }
    if (!card.special && card.row === 'agile') {
      var row = bestUnitRow(state, side, card);
      return [{ row: row }];
    }
    return [null];
  }

  function cardActionScore(state, side, inst) {
    var card = cardOf(inst);
    if (!card) return { score: -1, target: null };
    var target = null;

    if (card.special === 'weather') {
      return { score: bestWeatherDelta(state, side, card.weather), target: null };
    }
    if (card.special === 'clear') {
      return { score: clearDelta(state, side), target: null };
    }
    if (card.special === 'scorch') {
      return { score: bestSpecialScorch(state, side), target: null };
    }
    if (card.special === 'horn') {
      var horn = hornTarget(state, side);
      return horn ? { score: horn.gain, target: { side: side, row: horn.row } } : { score: -1 };
    }
    if (card.special === 'mardroeme') {
      var mard = bestMardroeme(state, side);
      return mard ? { score: mard.gain, target: { side: side, row: mard.row } } : { score: -1 };
    }
    if (card.special === 'decoy') {
      var decoy = bestDecoyTarget(state, side);
      return decoy.inst ? { score: decoy.score - 2, target: { uid: decoy.inst.uid } } : { score: -1 };
    }

    var unit = unitPlayScore(state, side, card);
    return { score: unit.score, target: unit.target };
  }

  function enumerateCards(state, side) {
    var actions = [];
    state.hands[side].forEach(function (inst) {
      var card = cardOf(inst);
      if (!card) return;
      if (state.action || state.pending) return;
      var check = E.canPlayCard(state, side, inst.uid, null);
      var action = cardActionScore(state, side, inst);
      if (!check.ok && card.special !== 'decoy' && !(card.row === 'agile')) {
        // Targeted specials report a false negative without a target; the
        // score above already produced a legal target when one exists.
      }
      if (action.score < 0) return;
      actions.push({
        type: 'play',
        uid: inst.uid,
        card: card,
        target: action.target,
        score: action.score
      });
    });
    return actions;
  }

  function handPotential(state, side) {
    var total = 0;
    state.hands[side].forEach(function (inst) {
      var card = cardOf(inst);
      if (!card) return;
      if (card.special) total += 5;
      else total += card.strength * 0.85;
    });
    return total;
  }

  function chooseAction(state, side) {
    if (!state) return { type: 'pass' };
    if (state.pending) return { type: 'pending' };
    if (state.phase !== 'playing' || state.turn !== side || state.passed[side]) {
      return { type: 'wait' };
    }

    var opp = other(side);
    var myScore = E.scoreSide(state, side);
    var oppScore = E.scoreSide(state, opp);
    var actions = enumerateCards(state, side);

    // If the opponent has passed, only take the table if a card can win it.
    if (state.passed[opp]) {
      if (myScore > oppScore) return { type: 'pass' };
      var winning = actions.filter(function (action) {
        return myScore + Math.max(0, action.score) > oppScore;
      }).sort(function (a, b) {
        return Math.max(0, a.score) - Math.max(0, b.score);
      });
      if (winning.length) return winning[0];
      if (myScore + handPotential(state, side) < oppScore) return { type: 'pass' };
    }

    if (!state.hands[side].length) return { type: 'pass' };

    actions.sort(function (a, b) { return b.score - a.score; });
    var bestCard = actions[0] || null;
    var bestScore = bestCard ? bestCard.score : 0;

    // A commander action is free card-wise, but still spends the turn.
    var leader = leaderOptionScore(state, side);
    if (leader.score >= 3 && leader.score + 1.5 >= bestScore) {
      return { type: 'leader', leader: leader.leader, score: leader.score };
    }

    if (bestCard) {
      return bestCard;
    }

    // No legal card effect: use the leader or yield the round.
    if (leader.score > 0) return { type: 'leader', leader: leader.leader, score: leader.score };
    return { type: 'pass' };
  }

  /* ------------------------------------------------------------------------
     Mulligan and choice resolution
     ------------------------------------------------------------------------ */

  function mulliganPlan(state, side) {
    var ms = state.mulligan[side];
    if (!ms || ms.done || ms.remaining <= 0) return [];
    var ranked = state.hands[side].map(function (inst) {
      return { uid: inst.uid, value: cardHandValue(state, side, inst), card: cardOf(inst) };
    }).sort(function (a, b) { return a.value - b.value; });

    var chosen = [];
    ranked.forEach(function (entry) {
      if (chosen.length >= ms.remaining) return;
      if (entry.card && entry.card.hero) return;
      if (entry.value >= 5.5) return;
      chosen.push(entry.uid);
    });
    return chosen;
  }

  function choosePending(state, side) {
    var pending = state.pending;
    if (!pending || pending.side !== side) return null;
    var options = pending.options || [];

    if (pending.type === 'medic') {
      var best = null;
      options.forEach(function (opt) {
        var inst = state.graves[side].filter(function (g) { return g.uid === opt.uid; })[0];
        if (!inst) return;
        var value = cardOnBoardValue(state, inst) + (has(cardOf(inst), 'medic') ? 3 : 0);
        if (!best || value > best.value) best = { uid: opt.uid, value: value };
      });
      return best ? { uid: best.uid } : { uid: options.length ? options[0].uid : null };
    }

    if (pending.type === 'leader-weather') {
      var weatherBest = { uid: null, delta: -Infinity };
      options.forEach(function (opt) {
        var delta = bestWeatherDelta(state, side, opt.weather || (G.CARDS[opt.cardId] && G.CARDS[opt.cardId].weather));
        if (delta > weatherBest.delta) weatherBest = { uid: opt.uid, delta: delta };
      });
      return weatherBest.uid ? { uid: weatherBest.uid } : { uid: options.length ? options[0].uid : null };
    }

    if (pending.type === 'leader-steal' || pending.type === 'leader-recover') {
      var bestCard = null;
      options.forEach(function (opt) {
        var c = G.CARDS[opt.cardId];
        var value = c ? (c.special ? 6 : c.strength + (c.hero ? 2 : 0) + (has(c, 'medic') ? 3 : 0)) : 0;
        if (!bestCard || value > bestCard.value) bestCard = { uid: opt.uid, value: value };
      });
      return bestCard ? { uid: bestCard.uid } : { uid: options.length ? options[0].uid : null };
    }

    if (pending.type === 'leader-discard') {
      var ranked = options.map(function (opt) {
        var c = G.CARDS[opt.cardId];
        return { uid: opt.uid, value: c ? (c.special ? 4 : c.strength) : 0 };
      }).sort(function (a, b) { return a.value - b.value; });
      return { uids: ranked.slice(0, 2).map(function (x) { return x.uid; }) };
    }

    return {};
  }

  AI.chooseAction = chooseAction;
  AI.choosePending = choosePending;
  AI.mulliganPlan = mulliganPlan;
  AI.cardHandValue = cardHandValue;
  AI.rowScoreWith = rowScoreWith;
  AI.sideScoreWith = sideScoreWith;
  AI.bestWeather = bestWeather;
  AI.factionOf = factionOf;
})();
