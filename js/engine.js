/* ==========================================================================
   GWENT — rules engine
   Pure state manipulation: dealing, mulligans, deployment, scoring, round flow.
   ========================================================================== */
(function () {
  'use strict';

  var G = window.GWENT;
  var Engine = G.Engine = {};

  var SIDES = ['player', 'enemy'];
  var WEATHER_TYPES = ['frost', 'fog', 'rain', 'storm'];

  function other(side) { return side === 'player' ? 'enemy' : 'player'; }
  Engine.other = other;

  function rand(state) {
    return (state && typeof state.random === 'function') ? state.random() : Math.random();
  }

  function randomOf(state, list) {
    if (!list || !list.length) return null;
    return list[Math.floor(rand(state) * list.length)];
  }

  function shuffle(state, list) {
    for (var i = list.length - 1; i > 0; i -= 1) {
      var j = Math.floor(rand(state) * (i + 1));
      var tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function cardOf(inst) {
    return inst ? G.CARDS[inst.cardId] : null;
  }

  function sideName(state, side) {
    return side === state.humanSide ? 'You' : 'Opponent';
  }

  // "You deploy" but "Opponent deploys": logs address one side directly.
  function sideVerb(state, side, verb) {
    return verb + (side === state.humanSide ? '' : 's');
  }

  function sideAction(state, side, verb) {
    return sideName(state, side) + ' ' + sideVerb(state, side, verb);
  }

  function factionOfSide(state, side) {
    return side === 'player' ? state.playerFaction : state.enemyFaction;
  }

  function leaderOfSide(state, side) {
    return G.LEADERS[side === 'player' ? state.playerLeaderId : state.enemyLeaderId];
  }

  function leaderEffectActive(state, effect) {
    return SIDES.some(function (side) {
      var leader = leaderOfSide(state, side);
      return leader && leader.passiveEffect === effect;
    });
  }

  function halfWeather(state) {
    return leaderEffectActive(state, 'halfWeather');
  }

  function randomRevive(state) {
    return leaderEffectActive(state, 'randomRevive');
  }

  function newRow(state) {
    return { cards: [], horn: false, mardroeme: false, leaderDouble: false };
  }

  function emit(state, type, payload) {
    if (state && typeof state.onEvent === 'function') {
      try { state.onEvent(type, payload || {}); } catch (err) { /* a broken listener must not stop the game */ }
    }
  }

  function log(state, side, text) {
    var entry = {
      seq: state.logSeq += 1,
      round: state.round,
      side: side || null,
      text: text
    };
    state.log.push(entry);
    if (state.log.length > 240) state.log.shift();
    return entry;
  }

  function toast(state, text, kind) {
    emit(state, 'toast', { text: text, kind: kind || 'info' });
  }

  function makeInstance(state, cardId, owner) {
    state.nextUid += 1;
    return {
      uid: 'g' + state.nextUid,
      cardId: cardId,
      owner: owner,
      zone: 'deck',
      row: null,
      boardSide: null,
      enteredRound: null
    };
  }

  function removeFrom(array, item) {
    var idx = array.indexOf(item);
    if (idx >= 0) array.splice(idx, 1);
    return idx >= 0;
  }

  function removeFromHand(state, side, inst) {
    return removeFrom(state.hands[side], inst);
  }

  function removeFromDeck(state, side, inst) {
    return removeFrom(state.decks[side], inst);
  }

  function removeFromGrave(state, side, inst) {
    return removeFrom(state.graves[side], inst);
  }

  function toHand(state, side, inst) {
    inst.zone = 'hand';
    inst.row = null;
    inst.boardSide = null;
    state.hands[side].push(inst);
  }

  function toGrave(state, side, inst) {
    var card = cardOf(inst);
    if (inst.zone === 'grave') return;
    inst.zone = 'grave';
    inst.row = null;
    inst.boardSide = null;
    if (card && card.token) {
      state.void.push(inst);
      return;
    }
    state.graves[side].push(inst);
  }

  function findOnBoard(state, uid) {
    for (var s = 0; s < SIDES.length; s += 1) {
      var side = SIDES[s];
      for (var r = 0; r < G.ROW_ORDER.length; r += 1) {
        var rowName = G.ROW_ORDER[r];
        var row = state.rows[side][rowName];
        for (var i = 0; i < row.cards.length; i += 1) {
          if (row.cards[i].uid === uid) {
            return { inst: row.cards[i], side: side, row: rowName, rowObj: row };
          }
        }
      }
    }
    return null;
  }

  function removeUnitFromBoard(state, inst) {
    var found = findOnBoard(state, inst.uid);
    if (!found) return null;
    found.rowObj.cards.splice(found.rowObj.cards.indexOf(inst), 1);
    inst.zone = 'limbo';
    inst.row = null;
    inst.boardSide = null;
    return found;
  }

  function isUnitCard(card) {
    return !!(card && !card.special);
  }

  function isNonHeroUnit(card) {
    return isUnitCard(card) && !card.hero;
  }

  function isSpy(card) {
    return !!(card && card.abilities && card.abilities.indexOf('spy') !== -1);
  }

  function hasAbility(card, ability) {
    return !!(card && card.abilities && card.abilities.indexOf(ability) !== -1);
  }

  function isAgile(card) {
    return !!(card && card.row === 'agile');
  }

  function drawCards(state, side, count, reason) {
    var drawn = [];
    for (var i = 0; i < count; i += 1) {
      if (!state.decks[side].length) break;
      var inst = state.decks[side].pop();
      inst.zone = 'hand';
      inst.row = null;
      inst.boardSide = null;
      state.hands[side].push(inst);
      drawn.push(inst);
    }
    if (drawn.length) {
      state.stats[side].drawn += drawn.length;
      log(state, side, sideAction(state, side, 'draw') + ' ' + drawn.length + (drawn.length === 1 ? ' card' : ' cards') + (reason ? ' (' + reason + ')' : '') + '.');
      emit(state, 'draw', { side: side, count: drawn.length, reason: reason || '', cards: drawn.map(function (c) { return c.cardId; }) });
    }
    return drawn;
  }

  /* ------------------------------------------------------------------------
     Weather
     ------------------------------------------------------------------------ */

  function weatherCardsOfType(state, type) {
    return state.weatherZone.filter(function (inst) {
      var card = cardOf(inst);
      return card && card.weather === type;
    });
  }

  function isWeatherActive(state, type) {
    return weatherCardsOfType(state, type).length > 0;
  }

  function weatherTypesForRow(state, row) {
    return WEATHER_TYPES.filter(function (type) {
      var weather = G.WEATHER[type];
      return isWeatherActive(state, type) && weather.rows.indexOf(row) !== -1;
    });
  }

  function weatherAffectsRow(state, row) {
    return weatherTypesForRow(state, row).length > 0;
  }

  function clearAllWeather(state) {
    var removed = state.weatherZone.slice();
    state.weatherZone.length = 0;
    removed.forEach(function (inst) {
      toGrave(state, inst.owner, inst);
    });
    return removed;
  }

  function addWeather(state, inst, type) {
    // One weather condition of each type can be active. The previous card is spent.
    weatherCardsOfType(state, type).forEach(function (old) {
      removeFrom(state.weatherZone, old);
      toGrave(state, old.owner, old);
    });
    inst.zone = 'weather';
    inst.row = null;
    inst.boardSide = null;
    state.weatherZone.push(inst);
    var weather = G.WEATHER[type];
    log(state, inst.owner, sideAction(state, inst.owner, 'invoke') + ' ' + weather.name + '.');
    emit(state, 'weather', { type: type, owner: inst.owner, cardId: inst.cardId });
    toast(state, weather.name, 'weather');
  }

  Engine.isWeatherActive = isWeatherActive;
  Engine.weatherTypesForRow = weatherTypesForRow;
  Engine.weatherAffectsRow = weatherAffectsRow;

  /* ------------------------------------------------------------------------
     Strength calculation
     ------------------------------------------------------------------------ */

  function sameNameCount(state, inst, boardSide, row) {
    var card = cardOf(inst);
    if (!card) return 0;
    return state.rows[boardSide][row].cards.filter(function (otherInst) {
      var otherCard = cardOf(otherInst);
      return otherCard && !otherCard.special && otherCard.name === card.name;
    }).length;
  }

  function moraleSources(state, boardSide, row, excludeUid) {
    return state.rows[boardSide][row].cards.filter(function (inst) {
      if (inst.uid === excludeUid) return false;
      return hasAbility(cardOf(inst), 'morale');
    }).length;
  }

  function valueForInst(state, inst) {
    var card = cardOf(inst);
    if (!card || card.special) return 0;
    var boardSide = inst.boardSide;
    var rowName = inst.row;
    var row = state.rows[boardSide] && state.rows[boardSide][rowName];
    if (!row) return 0;
    return valueForCard(state, card, boardSide, rowName, inst.uid);
  }

  /**
   * Evaluate a card as if it stood on a row. `excludeUid` is ignored for bond
   * counting and morale sources so an agile unit can be compared across rows.
   */
  function valueForCard(state, card, boardSide, rowName, excludeUid) {
    if (!card || card.special) return 0;
    var row = state.rows[boardSide][rowName];
    if (!row) return 0;
    var base = card.strength;
    var hero = !!card.hero;

    if (!hero && weatherAffectsRow(state, rowName)) {
      base = halfWeather(state) ? Math.ceil(base / 2) : 1;
    }

    if (isSpy(card) && state.flags.spyDouble) base *= 2;

    if (hasAbility(card, 'tightBond')) {
      var count = row.cards.filter(function (inst) {
        if (inst.uid === excludeUid) return false;
        var otherCard = cardOf(inst);
        return otherCard && !otherCard.special && otherCard.name === card.name;
      }).length;
      // The card being evaluated will stand on this row after placement.
      count += 1;
      base *= Math.max(1, count);
    }

    if (!hero) {
      var morale = row.cards.filter(function (inst) {
        if (inst.uid === excludeUid) return false;
        return hasAbility(cardOf(inst), 'morale');
      }).length;
      base += morale;
    }

    if (!hero && (row.horn || row.leaderDouble)) {
      base *= 2;
    } else if (hero && row.leaderDouble) {
      base *= 2;
    }

    return base;
  }

  function scoreRow(state, boardSide, rowName) {
    var row = state.rows[boardSide][rowName];
    if (!row) return 0;
    return row.cards.reduce(function (total, inst) {
      return total + valueForInst(state, inst);
    }, 0);
  }

  function scoreSide(state, side) {
    return G.ROW_ORDER.reduce(function (total, rowName) {
      return total + scoreRow(state, side, rowName);
    }, 0);
  }

  Engine.scoreRow = scoreRow;
  Engine.scoreSide = scoreSide;
  Engine.valueForInst = valueForInst;
  Engine.valueForCard = valueForCard;
  Engine.cardOf = cardOf;
  Engine.findOnBoard = findOnBoard;
  Engine.isSpy = isSpy;

  /* ------------------------------------------------------------------------
     Row targeting and choosing the best row
     ------------------------------------------------------------------------ */

  function rowsForCard(card) {
    if (!card) return [];
    if (card.special) return [];
    if (card.row === 'agile') return ['melee', 'ranged'];
    return [card.row];
  }

  function bestRowFor(state, card, boardSide, excludeUid) {
    var rows = rowsForCard(card);
    if (!rows.length) return null;
    var best = rows[0];
    var bestValue = -Infinity;
    rows.forEach(function (rowName) {
      var value = valueForCard(state, card, boardSide, rowName, excludeUid);
      // Prefer a row where the card receives no weather punishment.
      if (weatherAffectsRow(state, rowName) && !card.hero) value -= 0.15;
      if (value > bestValue) {
        bestValue = value;
        best = rowName;
      }
    });
    return best;
  }

  Engine.rowsForCard = rowsForCard;
  Engine.bestRowFor = bestRowFor;

  /* ------------------------------------------------------------------------
     Deployment helpers
     ------------------------------------------------------------------------ */

  function placeOnBoard(state, inst, boardSide, rowName) {
    inst.zone = 'board';
    inst.boardSide = boardSide;
    inst.row = rowName;
    inst.enteredRound = state.round;
    state.rows[boardSide][rowName].cards.push(inst);
    return inst;
  }

  function transformBerserkersOnRow(state, boardSide, rowName) {
    var row = state.rows[boardSide][rowName];
    var transformed = [];
    row.cards.forEach(function (inst) {
      var card = cardOf(inst);
      if (card && hasAbility(card, 'berserker') && card.transformInto) {
        inst.cardId = card.transformInto;
        transformed.push(inst);
        log(state, inst.owner, card.name + ' transforms into ' + cardOf(inst).name + '.');
        emit(state, 'transform', { uid: inst.uid, cardId: inst.cardId, side: inst.owner });
      }
    });
    return transformed;
  }

  function applyMardroeme(state, boardSide, rowName, sourceSide, cardSource) {
    var row = state.rows[boardSide][rowName];
    row.mardroeme = true;
    var transformed = transformBerserkersOnRow(state, boardSide, rowName);
    log(state, sourceSide || null, 'Mardroeme clings to the ' + (boardSide === 'player' ? 'player' : 'opponent') + ' ' + G.ROWS[rowName].short.toLowerCase() + ' row.');
    emit(state, 'mardroeme', { side: boardSide, row: rowName, transformed: transformed.length, source: cardSource || null });
    return transformed;
  }

  function applyHorn(state, boardSide, rowName, sourceSide) {
    var row = state.rows[boardSide][rowName];
    if (!row.horn && !row.leaderDouble) {
      row.horn = true;
      log(state, sourceSide || null, 'A Commander\'s Horn rings out over the ' + (boardSide === 'player' ? 'player' : 'opponent') + ' ' + G.ROWS[rowName].short.toLowerCase() + ' row.');
      emit(state, 'horn', { side: boardSide, row: rowName });
      return true;
    }
    return false;
  }

  function spawnToken(state, owner, boardSide, tokenId, reason) {
    var tokenCard = G.CARDS[tokenId];
    if (!tokenCard) return null;
    var token = makeInstance(state, tokenId, owner);
    var rowName = tokenCard.row === 'agile' ? bestRowFor(state, tokenCard, boardSide) : tokenCard.row;
    placeOnBoard(state, token, boardSide, rowName);
    log(state, owner, tokenCard.name + ' answers the call of the fallen.');
    emit(state, 'token', { cardId: tokenId, uid: token.uid, side: boardSide, row: rowName, reason: reason || '' });
    return token;
  }

  function triggerAvenger(state, inst, boardSide, reason) {
    var card = cardOf(inst);
    if (!card || !hasAbility(card, 'avenger') || !card.summonToken) return null;
    return spawnToken(state, inst.owner, boardSide, card.summonToken, reason);
  }

  function destroyUnit(state, inst, sourceSide, reason, options) {
    options = options || {};
    var card = cardOf(inst);
    if (!card || card.special) return false;
    if (card.hero && !options.ignoreHero) return false;
    var found = findOnBoard(state, inst.uid);
    if (!found) return false;
    var boardSide = found.side;
    var rowName = found.row;
    var wasAvenger = hasAbility(card, 'avenger') && card.summonToken;
    removeUnitFromBoard(state, inst);
    toGrave(state, inst.owner, inst);
    state.stats[inst.owner].unitsLost += 1;
    if (sourceSide && sourceSide !== 'system') state.stats[sourceSide].destroyed += 1;
    log(state, sourceSide && sourceSide !== 'system' ? sourceSide : null, card.name + ' is destroyed' + (reason ? ' — ' + reason : '') + '.');
    emit(state, 'destroy', { uid: inst.uid, cardId: inst.cardId, owner: inst.owner, side: boardSide, row: rowName, source: sourceSide || null, reason: reason || '' });
    toast(state, card.name + ' destroyed', 'danger');
    if (wasAvenger) {
      spawnToken(state, inst.owner, boardSide, card.summonToken, reason);
    }
    return true;
  }

  function destroyStrongestOnRow(state, boardSide, rowName, sourceSide) {
    var row = state.rows[boardSide][rowName];
    var candidates = row.cards.filter(function (inst) {
      var card = cardOf(inst);
      return card && !card.special && !card.hero;
    });
    if (!candidates.length) return [];
    var scored = candidates.map(function (inst) { return { inst: inst, value: valueForInst(state, inst) }; });
    var highest = Math.max.apply(null, scored.map(function (entry) { return entry.value; }));
    var targets = scored.filter(function (entry) { return entry.value === highest; }).map(function (entry) { return entry.inst; });
    var destroyed = [];
    targets.forEach(function (inst) {
      if (destroyUnit(state, inst, sourceSide, 'Scorch')) destroyed.push(inst);
    });
    return destroyed;
  }

  function destroyStrongestGlobal(state, sourceSide, excludeUid, requireThreshold) {
    var all = [];
    SIDES.forEach(function (side) {
      G.ROW_ORDER.forEach(function (rowName) {
        state.rows[side][rowName].cards.forEach(function (inst) {
          var card = cardOf(inst);
          if (!card || card.special || card.hero) return;
          if (excludeUid && inst.uid === excludeUid) return;
          all.push({ inst: inst, value: valueForInst(state, inst) });
        });
      });
    });
    if (!all.length) return [];
    var highest = Math.max.apply(null, all.map(function (entry) { return entry.value; }));
    if (requireThreshold && highest < requireThreshold) return [];
    var targets = all.filter(function (entry) { return entry.value === highest; }).map(function (entry) { return entry.inst; });
    var destroyed = [];
    targets.forEach(function (inst) {
      if (destroyUnit(state, inst, sourceSide, 'Scorch')) destroyed.push(inst);
    });
    return destroyed;
  }

  Engine.destroyStrongestOnRow = destroyStrongestOnRow;
  Engine.destroyStrongestGlobal = destroyStrongestGlobal;

  /* ------------------------------------------------------------------------
     Playing cards
     ------------------------------------------------------------------------ */

  function findHandCard(state, side, uid) {
    return state.hands[side].filter(function (inst) { return inst.uid === uid; })[0] || null;
  }

  function targetKind(card) {
    if (!card) return null;
    if (card.special === 'decoy') return 'friendly-unit';
    if (card.special === 'horn' || card.special === 'mardroeme') return 'any-row';
    if (!card.special && card.row === 'agile') return 'own-row';
    return null;
  }

  function validRow(row) {
    return row === 'melee' || row === 'ranged' || row === 'siege';
  }

  function rowTargetFrom(target) {
    if (!target) return null;
    if (target.side && validRow(target.row)) return { side: target.side, row: target.row };
    return null;
  }

  function decoyTarget(state, side, target) {
    if (!target || !target.uid) return null;
    var found = findOnBoard(state, target.uid);
    if (!found) return null;
    var card = cardOf(found.inst);
    if (!card || card.special || card.hero || card.token) return null;
    // Only a unit owned by the Decoy's player can be taken back. A spy that
    // crossed the lines is still its owner's card, so it may be recalled.
    if (found.inst.owner !== side) return null;
    return found;
  }

  function canPlayCard(state, side, uid, target) {
    if (!state || state.phase !== 'playing') return { ok: false, reason: 'The table is not ready for another card.' };
    if (state.turn !== side) return { ok: false, reason: 'It is not your turn.' };
    if (state.passed[side]) return { ok: false, reason: 'You have already passed this round.' };
    var inst = findHandCard(state, side, uid);
    if (!inst) return { ok: false, reason: 'That card is not in your hand.' };
    var card = cardOf(inst);
    if (!card) return { ok: false, reason: 'Unknown card.' };

    if (card.special === 'decoy') {
      var found = decoyTarget(state, side, target);
      if (!found) return { ok: false, reason: 'Choose a friendly non-hero unit to return to your hand.' };
      return { ok: true };
    }

    if (card.special === 'horn' || card.special === 'mardroeme') {
      var rowTarget = rowTargetFrom(target);
      if (!rowTarget) return { ok: false, reason: 'Choose a row for this card.' };
      if (rowTarget.side !== 'player' && rowTarget.side !== 'enemy') return { ok: false, reason: 'That row does not exist.' };
      var row = state.rows[rowTarget.side][rowTarget.row];
      if (!row) return { ok: false, reason: 'That row does not exist.' };
      if (card.special === 'horn' && (row.horn || row.leaderDouble)) return { ok: false, reason: 'That row is already doubled.' };
      if (card.special === 'mardroeme' && row.mardroeme) return { ok: false, reason: 'Mardroeme already clings to that row.' };
      return { ok: true };
    }

    if (card.special) {
      return { ok: true };
    }

    if (card.row === 'agile' && target && target.row && !validRow(target.row)) {
      return { ok: false, reason: 'Agile units may only deploy to close combat or ranged.' };
    }
    return { ok: true };
  }

  function determinePlacement(state, side, card, target) {
    var boardSide = isSpy(card) ? other(side) : side;
    var rowName;
    if (card.row === 'agile') {
      var requested = target && target.row;
      if (requested === 'melee' || requested === 'ranged') rowName = requested;
      else rowName = bestRowFor(state, card, boardSide);
    } else {
      rowName = card.row;
    }
    return { boardSide: boardSide, row: rowName };
  }

  function beginAction(state, side, source) {
    state.action = { side: side, source: source || 'card', queue: [], endTurn: true };
    state.pending = null;
    state.phase = 'playing';
  }

  function queueDeploy(state, inst) {
    if (state.action) state.action.queue.push(inst);
  }

  function finishAction(state) {
    var action = state.action;
    state.action = null;
    state.pending = null;
    if (state.phase === 'choosing') state.phase = 'playing';
    if (action && action.endTurn) advanceTurn(state);
  }

  function advanceTurn(state) {
    if (state.phase !== 'playing') return;
    if (state.passed.player && state.passed.enemy) {
      endRound(state);
      return;
    }
    var current = state.turn;
    var rival = other(current);
    if (state.passed[current]) state.turn = rival;
    else if (state.passed[rival]) state.turn = current;
    else state.turn = rival;

    if (state.passed[state.turn] && !state.passed[other(state.turn)]) {
      state.turn = other(state.turn);
    }
    state.phase = 'playing';
    emit(state, 'turn', { side: state.turn });
  }

  function pass(state, side) {
    if (state.phase !== 'playing') return { ok: false, reason: 'The round is not in progress.' };
    if (state.turn !== side) return { ok: false, reason: 'It is not your turn.' };
    if (state.passed[side]) return { ok: false, reason: 'You have already passed.' };
    state.passed[side] = true;
    state.stats[side].passes += 1;
    log(state, side, sideAction(state, side, 'pass') + ' the round.');
    emit(state, 'pass', { side: side });
    toast(state, sideName(state, side) + ' passed', 'info');
    if (state.passed.player && state.passed.enemy) {
      endRound(state);
    } else {
      state.turn = other(side);
      emit(state, 'turn', { side: state.turn });
    }
    return { ok: true };
  }

  function playCard(state, side, uid, target) {
    var check = canPlayCard(state, side, uid, target);
    if (!check.ok) return check;
    var inst = findHandCard(state, side, uid);
    var card = cardOf(inst);
    removeFromHand(state, side, inst);
    state.stats[side].played += 1;
    state.lastAction = { side: side, type: 'card', cardId: inst.cardId, uid: inst.uid };
    beginAction(state, side, 'card');

    if (card.special === 'frost' || card.special === 'fog' || card.special === 'rain' || card.special === 'storm') {
      addWeather(state, inst, card.weather);
      state.lastPlayedUid = null;
      finishAction(state);
      return { ok: true };
    }

    if (card.special === 'clear') {
      toGrave(state, side, inst);
      var cleared = clearAllWeather(state);
      log(state, side, sideAction(state, side, 'call') + ' clear weather across the battlefield.');
      emit(state, 'clearWeather', { owner: side, cleared: cleared.map(function (c) { return c.cardId; }) });
      toast(state, 'The skies clear', 'weather');
      state.lastPlayedUid = null;
      finishAction(state);
      return { ok: true };
    }

    if (card.special === 'scorch') {
      toGrave(state, side, inst);
      var burned = destroyStrongestGlobal(state, side, null, false);
      log(state, side, burned.length
        ? 'Scorch sears the strongest units from the battlefield.'
        : 'Scorch finds no worthy target.');
      emit(state, 'scorch', { side: side, destroyed: burned.map(function (c) { return c.cardId; }) });
      state.lastPlayedUid = null;
      finishAction(state);
      return { ok: true };
    }

    if (card.special === 'horn') {
      var hornTarget = rowTargetFrom(target);
      toGrave(state, side, inst);
      var horned = applyHorn(state, hornTarget.side, hornTarget.row, side);
      toast(state, horned ? 'The horn sounds' : 'That row is already doubled', 'score');
      state.lastPlayedUid = null;
      finishAction(state);
      return { ok: true };
    }

    if (card.special === 'mardroeme') {
      var mardTarget = rowTargetFrom(target);
      toGrave(state, side, inst);
      applyMardroeme(state, mardTarget.side, mardTarget.row, side, inst.cardId);
      toast(state, 'Mardroeme takes root', 'info');
      state.lastPlayedUid = null;
      finishAction(state);
      return { ok: true };
    }

    if (card.special === 'decoy') {
      var found = decoyTarget(state, side, target);
      var oldBoardSide = found.side;
      var oldRow = found.row;
      var oldOwner = found.inst.owner;
      removeUnitFromBoard(state, found.inst);
      toHand(state, oldOwner, found.inst);
      triggerAvenger(state, found.inst, oldBoardSide, 'Decoy');
      placeOnBoard(state, inst, oldBoardSide, oldRow);
      log(state, side, sideAction(state, side, 'set') + ' a Decoy and ' + sideVerb(state, side, 'return') + ' ' + cardOf(found.inst).name + ' to hand.');
      emit(state, 'decoy', { side: side, returned: found.inst.uid, row: oldRow });
      state.lastPlayedUid = null;
      finishAction(state);
      return { ok: true };
    }

    var placement = determinePlacement(state, side, card, target);
    placeOnBoard(state, inst, placement.boardSide, placement.row);
    state.lastPlayedUid = inst.uid;
    state.stats[side].deployed += 1;

    if (placement.boardSide === other(side)) {
      log(state, side, sideAction(state, side, 'slip') + ' ' + card.name + ' into the opponent\'s ' + G.ROWS[placement.row].short.toLowerCase() + ' row.');
    } else {
      log(state, side, sideAction(state, side, 'deploy') + ' ' + card.name + ' to the ' + G.ROWS[placement.row].short.toLowerCase() + ' row.');
    }
    emit(state, 'play', {
      side: side,
      uid: inst.uid,
      cardId: inst.cardId,
      boardSide: placement.boardSide,
      row: placement.row,
      spy: isSpy(card)
    });

    if (placement.row && state.rows[placement.boardSide][placement.row].mardroeme && hasAbility(card, 'berserker')) {
      transformBerserkersOnRow(state, placement.boardSide, placement.row);
    }

    queueDeploy(state, inst);
    processAction(state);
    return { ok: true };
  }

  /* ------------------------------------------------------------------------
     Deployment abilities
     ------------------------------------------------------------------------ */

  function moveFromDeckToBoard(state, owner, deckInst, reason) {
    var card = cardOf(deckInst);
    if (!card) return null;
    removeFromDeck(state, owner, deckInst);
    var boardSide = isSpy(card) ? other(owner) : owner;
    var rowName = card.row === 'agile' ? bestRowFor(state, card, boardSide) : card.row;
    placeOnBoard(state, deckInst, boardSide, rowName);
    if (rowName && state.rows[boardSide][rowName].mardroeme && hasAbility(card, 'berserker')) {
      transformBerserkersOnRow(state, boardSide, rowName);
    }
    queueDeploy(state, deckInst);
    return deckInst;
  }

  function muster(state, inst) {
    var card = cardOf(inst);
    if (!card) return [];
    var matches = state.decks[inst.owner].filter(function (candidate) {
      var otherCard = cardOf(candidate);
      if (!otherCard || otherCard.special || otherCard.token) return false;
      if (otherCard.name === card.name) return true;
      return !!(card.musterGroup && otherCard.musterGroup === card.musterGroup);
    });
    if (!matches.length) return [];
    var names = matches.map(function (candidate) { return cardOf(candidate).name; });
    log(state, inst.owner, 'Muster answers ' + card.name + ': ' + names.join(', ') + '.');
    matches.forEach(function (candidate) {
      moveFromDeckToBoard(state, inst.owner, candidate, 'muster');
    });
    emit(state, 'muster', { side: inst.owner, source: inst.cardId, cards: matches.map(function (candidate) { return candidate.cardId; }) });
    return matches;
  }

  function summon(state, inst) {
    var card = cardOf(inst);
    if (!card || !card.summonName) return [];
    var summoned = [];
    var handMatches = state.hands[inst.owner].filter(function (candidate) {
      var c = cardOf(candidate);
      return c && c.name === card.summonName;
    });
    handMatches.forEach(function (candidate) {
      removeFromHand(state, inst.owner, candidate);
      var boardSide = isSpy(cardOf(candidate)) ? other(inst.owner) : inst.owner;
      var rowName = cardOf(candidate).row === 'agile' ? bestRowFor(state, cardOf(candidate), boardSide) : cardOf(candidate).row;
      placeOnBoard(state, candidate, boardSide, rowName);
      queueDeploy(state, candidate);
      summoned.push(candidate);
    });
    var deckMatches = state.decks[inst.owner].filter(function (candidate) {
      var c = cardOf(candidate);
      return c && c.name === card.summonName;
    });
    deckMatches.forEach(function (candidate) {
      moveFromDeckToBoard(state, inst.owner, candidate, 'summon');
      summoned.push(candidate);
    });
    if (summoned.length) {
      log(state, inst.owner, card.name + ' summons ' + summoned.map(function (candidate) { return cardOf(candidate).name; }).join(', ') + '.');
      emit(state, 'summon', { side: inst.owner, source: inst.cardId, cards: summoned.map(function (candidate) { return candidate.cardId; }) });
    }
    return summoned;
  }

  function reviveUnit(state, owner, graveInst, sourceUid) {
    var card = cardOf(graveInst);
    if (!card) return false;
    removeFromGrave(state, owner, graveInst);
    var boardSide = isSpy(card) ? other(owner) : owner;
    var rowName = card.row === 'agile' ? bestRowFor(state, card, boardSide) : card.row;
    placeOnBoard(state, graveInst, boardSide, rowName);
    if (rowName && state.rows[boardSide][rowName].mardroeme && hasAbility(card, 'berserker')) {
      transformBerserkersOnRow(state, boardSide, rowName);
    }
    queueDeploy(state, graveInst);
    log(state, owner, sideAction(state, owner, 'revive') + ' ' + card.name + '.');
    emit(state, 'revive', { side: owner, uid: graveInst.uid, cardId: graveInst.cardId, sourceUid: sourceUid || null });
    return true;
  }

  function triggerDeployUnit(state, inst) {
    var card = cardOf(inst);
    if (!card || card.special || inst.zone !== 'board') return;

    if (hasAbility(card, 'spy')) {
      drawCards(state, inst.owner, 2, 'Spy');
    }

    if (hasAbility(card, 'medic')) {
      var eligible = state.graves[inst.owner].filter(function (graveInst) {
        var c = cardOf(graveInst);
        return c && !c.special && !c.hero && !c.token;
      });
      if (eligible.length) {
        if (randomRevive(state)) {
          var chosen = randomOf(state, eligible);
          log(state, inst.owner, 'Sowing Chaos chooses the revived unit at random.');
          reviveUnit(state, inst.owner, chosen, inst.uid);
        } else {
          state.pending = {
            side: inst.owner,
            type: 'medic',
            sourceUid: inst.uid,
            title: 'Field Medicine',
            lead: 'Choose a non-hero unit from your discard pile to revive.',
            options: eligible.map(function (graveInst) {
              var c = cardOf(graveInst);
              return { uid: graveInst.uid, cardId: graveInst.cardId, name: c.name, strength: c.strength, row: c.row, hero: c.hero };
            })
          };
          state.phase = 'choosing';
          return;
        }
      }
    }

    if (hasAbility(card, 'summon') && card.summonName) {
      summon(state, inst);
    }

    if (hasAbility(card, 'muster')) {
      muster(state, inst);
    }

    if (hasAbility(card, 'scorch')) {
      if (card.scorch === 'row') {
        var targetSide = other(inst.boardSide);
        var rowScore = scoreRow(state, targetSide, inst.row);
        if (rowScore >= 10) {
          var burned = destroyStrongestOnRow(state, targetSide, inst.row, inst.owner);
          if (burned.length) {
            log(state, inst.owner, card.name + '\'s Scorch burns the enemy ' + G.ROWS[inst.row].short.toLowerCase() + ' row.');
            emit(state, 'scorch', { side: inst.owner, row: inst.row, destroyed: burned.map(function (c) { return c.cardId; }) });
          }
        } else {
          log(state, inst.owner, card.name + ' finds no target worth burning.');
        }
      } else if (card.scorch === 'global') {
        var scorched = destroyStrongestGlobal(state, inst.owner, inst.uid, false);
        if (scorched.length) {
          log(state, inst.owner, card.name + ' unleashes a battlefield-wide Scorch.');
          emit(state, 'scorch', { side: inst.owner, destroyed: scorched.map(function (c) { return c.cardId; }) });
        }
      }
    }

    if (hasAbility(card, 'horn')) {
      applyHorn(state, inst.boardSide, inst.row, inst.owner);
    }

    if (hasAbility(card, 'mardroeme')) {
      applyMardroeme(state, inst.boardSide, inst.row, inst.owner, inst.cardId);
    }
  }

  function processAction(state) {
    if (!state.action) return;
    while (state.action.queue.length) {
      var inst = state.action.queue.shift();
      if (inst.zone !== 'board') continue;
      triggerDeployUnit(state, inst);
      if (state.pending) {
        state.phase = 'choosing';
        emit(state, 'choice', state.pending);
        return;
      }
    }
    finishAction(state);
  }

  Engine.targetKind = targetKind;
  Engine.canPlayCard = canPlayCard;
  Engine.playCard = playCard;
  Engine.pass = pass;
  Engine.findHandCard = findHandCard;

  /* ------------------------------------------------------------------------
     Leader abilities
     ------------------------------------------------------------------------ */

  function deckWeather(state, side, type) {
    return state.decks[side].filter(function (inst) {
      var card = cardOf(inst);
      return card && card.weather && (!type || card.weather === type);
    })[0] || null;
  }

  function boardHasSpy(state) {
    return SIDES.some(function (side) {
      return G.ROW_ORDER.some(function (rowName) {
        return state.rows[side][rowName].cards.some(function (inst) { return isSpy(cardOf(inst)); });
      });
    });
  }

  function boardHasAgile(state) {
    return SIDES.some(function (side) {
      return G.ROW_ORDER.some(function (rowName) {
        return state.rows[side][rowName].cards.some(function (inst) {
          return cardOf(inst) && cardOf(inst).row === 'agile';
        });
      });
    });
  }

  function canUseLeader(state, side) {
    if (!state || state.phase !== 'playing') return { ok: false, reason: 'The table is not ready for a leader.' };
    if (state.turn !== side) return { ok: false, reason: 'It is not your turn.' };
    if (state.passed[side]) return { ok: false, reason: 'You have already passed this round.' };
    var leader = leaderOfSide(state, side);
    if (!leader) return { ok: false, reason: 'No commander chosen.' };
    if (leader.passive) return { ok: false, reason: 'This commander\'s gift is passive.' };
    if (state.usedLeaders[side]) return { ok: false, reason: 'Your leader has already acted.' };
    if (state.cancelledLeaders[side]) return { ok: false, reason: 'Your leader ability was cancelled.' };
    var rival = other(side);

    switch (leader.action) {
      case 'weather': {
        if (!deckWeather(state, side, leader.weather)) {
          return { ok: false, reason: 'The required weather card is no longer in your deck.' };
        }
        return { ok: true };
      }
      case 'weatherChoose': {
        if (!deckWeather(state, side, null)) return { ok: false, reason: 'No weather cards remain in your deck.' };
        return { ok: true };
      }
      case 'clearWeather': {
        if (!state.weatherZone.length) return { ok: false, reason: 'No weather is active.' };
        return { ok: true };
      }
      case 'destroyRow': {
        var targetSide = leader.target === 'enemy' ? rival : side;
        var targetRow = state.rows[targetSide][leader.row];
        var hasPrey = targetRow.cards.some(function (inst) {
          var c = cardOf(inst);
          return c && !c.special && !c.hero;
        });
        if (!hasPrey) return { ok: false, reason: 'There is no non-hero unit in that row.' };
        if (scoreRow(state, targetSide, leader.row) < 10) {
          return { ok: false, reason: 'That row has not reached 10 strength.' };
        }
        return { ok: true };
      }
      case 'doubleRow': {
        var ownRow = state.rows[side][leader.row];
        if (ownRow.horn) return { ok: false, reason: 'A Commander\'s Horn already doubles that row.' };
        if (ownRow.leaderDouble) return { ok: false, reason: 'That row is already doubled.' };
        var hasUnits = ownRow.cards.some(function (inst) { return cardOf(inst) && !cardOf(inst).special; });
        if (!hasUnits) return { ok: false, reason: 'There are no units in that row.' };
        return { ok: true };
      }
      case 'peekHand': {
        if (!state.hands[rival].length) return { ok: false, reason: 'Your opponent\'s hand is empty.' };
        return { ok: true };
      }
      case 'stealGrave': {
        if (!state.graves[rival].length) return { ok: false, reason: 'The opponent\'s discard pile is empty.' };
        return { ok: true };
      }
      case 'recoverGrave': {
        if (!state.graves[side].length) return { ok: false, reason: 'Your discard pile is empty.' };
        return { ok: true };
      }
      case 'cancelLeader': {
        var enemyLeader = leaderOfSide(state, rival);
        if (!enemyLeader || enemyLeader.passive) return { ok: false, reason: 'Their commander has no active ability to cancel.' };
        if (state.usedLeaders[rival]) return { ok: false, reason: 'Their leader has already acted.' };
        if (state.cancelledLeaders[rival]) return { ok: false, reason: 'Their leader is already cancelled.' };
        return { ok: true };
      }
      case 'hope': {
        if (!boardHasAgile(state)) return { ok: false, reason: 'No agile units are on the battlefield.' };
        return { ok: true };
      }
      case 'doubleSpies': {
        if (!boardHasSpy(state)) return { ok: false, reason: 'No spies are on the battlefield.' };
        return { ok: true };
      }
      case 'discardDraw': {
        if (state.hands[side].length < 2) return { ok: false, reason: 'You need at least 2 cards in hand.' };
        return { ok: true };
      }
      case 'shuffleGraves': {
        if (!state.graves.player.length && !state.graves.enemy.length) {
          return { ok: false, reason: 'Both discard piles are empty.' };
        }
        return { ok: true };
      }
      default:
        return { ok: false, reason: 'That ability cannot be used right now.' };
    }
  }

  function moveAgileToOptimal(state) {
    var moved = 0;
    var snapshot = [];
    SIDES.forEach(function (side) {
      G.ROW_ORDER.forEach(function (rowName) {
        state.rows[side][rowName].cards.forEach(function (inst) {
          var card = cardOf(inst);
          if (card && card.row === 'agile') snapshot.push({ inst: inst, side: side, row: rowName });
        });
      });
    });
    snapshot.forEach(function (entry) {
      var card = cardOf(entry.inst);
      var options = ['melee', 'ranged'];
      var currentValue = valueForCard(state, card, entry.side, entry.row, entry.inst.uid);
      var best = entry.row;
      var bestValue = currentValue;
      options.forEach(function (rowName) {
        if (rowName === entry.row) return;
        var value = valueForCard(state, card, entry.side, rowName, entry.inst.uid);
        if (value > bestValue + 0.001) {
          bestValue = value;
          best = rowName;
        }
      });
      if (best !== entry.row) {
        removeUnitFromBoard(state, entry.inst);
        placeOnBoard(state, entry.inst, entry.side, best);
        moved += 1;
        log(state, entry.inst.owner, card.name + ' shifts to the ' + G.ROWS[best].short.toLowerCase() + ' row.');
        emit(state, 'move', { uid: entry.inst.uid, side: entry.side, row: best });
      }
    });
    return moved;
  }

  function useLeader(state, side, payload) {
    var check = canUseLeader(state, side);
    if (!check.ok) return check;
    var leader = leaderOfSide(state, side);
    var rival = other(side);
    state.usedLeaders[side] = true;
    state.stats[side].leaderUsed = true;
    state.lastAction = { side: side, type: 'leader', leaderId: leader.id };
    beginAction(state, side, 'leader');
    log(state, side, sideAction(state, side, 'invoke') + ' ' + leader.name + ' — ' + leader.ability + '.');
    emit(state, 'leader', { side: side, leaderId: leader.id, ability: leader.ability });
    toast(state, leader.ability, 'score');

    switch (leader.action) {
      case 'weather': {
        var weatherInst = deckWeather(state, side, leader.weather);
        removeFromDeck(state, side, weatherInst);
        addWeather(state, weatherInst, leader.weather);
        finishAction(state);
        return { ok: true };
      }
      case 'weatherChoose': {
        var candidates = state.decks[side].filter(function (inst) { return isUnitCard(cardOf(inst)) === false && cardOf(inst) && cardOf(inst).weather; });
        state.pending = {
          side: side,
          type: 'leader-weather',
          title: 'King of the Wild Hunt',
          lead: 'Choose a weather card from your deck to unleash.',
          options: candidates.map(function (inst) {
            var c = cardOf(inst);
            return { uid: inst.uid, cardId: inst.cardId, name: c.name, weather: c.weather };
          })
        };
        state.phase = 'choosing';
        emit(state, 'choice', state.pending);
        return { ok: true };
      }
      case 'clearWeather': {
        var cleared = clearAllWeather(state);
        log(state, side, sideAction(state, side, 'command') + ' the skies to clear.');
        emit(state, 'clearWeather', { owner: side, cleared: cleared.map(function (c) { return c.cardId; }) });
        toast(state, 'The skies clear', 'weather');
        finishAction(state);
        return { ok: true };
      }
      case 'destroyRow': {
        var targetSide = leader.target === 'enemy' ? rival : side;
        var destroyed = destroyStrongestOnRow(state, targetSide, leader.row, side);
        log(state, side, sideAction(state, side, 'mark') + ' ' + (destroyed.length ? destroyed.map(function (c) { return cardOf(c).name; }).join(', ') : 'no one') + ' for death.');
        emit(state, 'scorch', { side: side, row: leader.row, destroyed: destroyed.map(function (c) { return c.cardId; }) });
        finishAction(state);
        return { ok: true };
      }
      case 'doubleRow': {
        state.rows[side][leader.row].leaderDouble = true;
        log(state, side, sideAction(state, side, 'double') + ' the ' + G.ROWS[leader.row].short.toLowerCase() + ' row.');
        emit(state, 'doubleRow', { side: side, row: leader.row });
        toast(state, G.ROWS[leader.row].name + ' doubled', 'score');
        finishAction(state);
        return { ok: true };
      }
      case 'peekHand': {
        var handCopy = state.hands[rival].slice();
        shuffle(state, handCopy);
        var seen = handCopy.slice(0, 3);
        state.pending = {
          side: side,
          type: 'peek',
          title: 'The Spider\'s Web',
          lead: 'Three cards from your opponent\'s hand are laid bare.',
          options: seen.map(function (inst) {
            var c = cardOf(inst);
            return { uid: inst.uid, cardId: inst.cardId, name: c.name, strength: c.strength, row: c.row, hero: c.hero, special: c.special };
          })
        };
        state.phase = 'choosing';
        emit(state, 'choice', state.pending);
        return { ok: true };
      }
      case 'stealGrave': {
        state.pending = {
          side: side,
          type: 'leader-steal',
          title: 'Grave Robbery',
          lead: 'Take a card from your opponent\'s discard pile.',
          options: state.graves[rival].map(function (inst) {
            var c = cardOf(inst);
            return { uid: inst.uid, cardId: inst.cardId, name: c.name, strength: c.strength, row: c.row, special: c.special };
          })
        };
        state.phase = 'choosing';
        emit(state, 'choice', state.pending);
        return { ok: true };
      }
      case 'recoverGrave': {
        state.pending = {
          side: side,
          type: 'leader-recover',
          title: 'Bringer of Death',
          lead: 'Take a card from your own discard pile.',
          options: state.graves[side].map(function (inst) {
            var c = cardOf(inst);
            return { uid: inst.uid, cardId: inst.cardId, name: c.name, strength: c.strength, row: c.row, special: c.special };
          })
        };
        state.phase = 'choosing';
        emit(state, 'choice', state.pending);
        return { ok: true };
      }
      case 'cancelLeader': {
        state.cancelledLeaders[rival] = true;
        var enemyLeader = leaderOfSide(state, rival);
        log(state, side, sideAction(state, side, 'smother') + ' ' + enemyLeader.name + '\'s ' + enemyLeader.ability + ' before it can be used.');
        emit(state, 'cancelLeader', { side: side, target: rival, leaderId: enemyLeader.id });
        toast(state, 'Enemy leader cancelled', 'danger');
        finishAction(state);
        return { ok: true };
      }
      case 'hope': {
        var moved = moveAgileToOptimal(state);
        log(state, side, moved
          ? 'The Aen Seidhe reposition ' + moved + ' agile unit' + (moved === 1 ? '' : 's') + '.'
          : 'The agile units already stand where they are strongest.');
        toast(state, 'Agile lines redrawn', 'score');
        finishAction(state);
        return { ok: true };
      }
      case 'doubleSpies': {
        state.flags.spyDouble = true;
        log(state, side, 'Every spy on the table becomes twice as dangerous this round.');
        emit(state, 'doubleSpies', { side: side });
        toast(state, 'Spy strength doubled', 'score');
        finishAction(state);
        return { ok: true };
      }
      case 'discardDraw': {
        state.pending = {
          side: side,
          type: 'leader-discard',
          title: 'Destroyer of Worlds',
          lead: 'Discard 2 cards from your hand, then draw 1.',
          min: 2,
          max: 2,
          options: state.hands[side].map(function (inst) {
            var c = cardOf(inst);
            return { uid: inst.uid, cardId: inst.cardId, name: c.name, strength: c.strength, row: c.row, special: c.special };
          })
        };
        state.phase = 'choosing';
        emit(state, 'choice', state.pending);
        return { ok: true };
      }
      case 'shuffleGraves': {
        SIDES.forEach(function (graveSide) {
          var grave = state.graves[graveSide];
          grave.forEach(function (inst) {
            inst.zone = 'deck';
            inst.row = null;
            inst.boardSide = null;
            state.decks[graveSide].push(inst);
          });
          state.graves[graveSide] = [];
          shuffle(state, state.decks[graveSide]);
        });
        log(state, side, 'The dead are gathered and shuffled back into both decks.');
        emit(state, 'shuffleGraves', { side: side });
        toast(state, 'Discard piles reshuffled', 'info');
        finishAction(state);
        return { ok: true };
      }
      default:
        state.usedLeaders[side] = false;
        state.stats[side].leaderUsed = false;
        finishAction(state);
        return { ok: false, reason: 'That ability has no effect yet.' };
    }
  }

  function resolveChoice(state, side, payload) {
    var pending = state.pending;
    if (!pending) return { ok: false, reason: 'There is no choice awaiting an answer.' };
    if (pending.side !== side) return { ok: false, reason: 'That choice belongs to the other commander.' };

    if (pending.type === 'medic') {
      var graveInst = state.graves[side].filter(function (inst) { return inst.uid === payload.uid; })[0];
      if (!graveInst) return { ok: false, reason: 'That card is not in your discard pile.' };
      var c = cardOf(graveInst);
      if (!c || c.special || c.hero || c.token) return { ok: false, reason: 'That card cannot be revived.' };
      state.pending = null;
      state.phase = 'playing';
      reviveUnit(state, side, graveInst, pending.sourceUid);
      processAction(state);
      return { ok: true };
    }

    if (pending.type === 'leader-weather') {
      var weatherInst = state.decks[side].filter(function (inst) { return inst.uid === payload.uid; })[0];
      if (!weatherInst || !cardOf(weatherInst).weather) return { ok: false, reason: 'That weather card is not in your deck.' };
      removeFromDeck(state, side, weatherInst);
      state.pending = null;
      state.phase = 'playing';
      addWeather(state, weatherInst, cardOf(weatherInst).weather);
      finishAction(state);
      return { ok: true };
    }

    if (pending.type === 'leader-steal' || pending.type === 'leader-recover') {
      var fromSide = pending.type === 'leader-steal' ? other(side) : side;
      var taken = state.graves[fromSide].filter(function (inst) { return inst.uid === payload.uid; })[0];
      if (!taken) return { ok: false, reason: 'That card is no longer in the discard pile.' };
      removeFromGrave(state, fromSide, taken);
      toHand(state, side, taken);
      log(state, side, sideAction(state, side, 'take') + ' ' + cardOf(taken).name + ' from the ' + (fromSide === side ? 'discard pile' : 'enemy discard pile') + '.');
      state.pending = null;
      state.phase = 'playing';
      finishAction(state);
      return { ok: true };
    }

    if (pending.type === 'leader-discard') {
      var uids = payload.uids || [];
      if (uids.length !== 2) return { ok: false, reason: 'Choose exactly 2 cards to discard.' };
      var chosen = [];
      for (var i = 0; i < uids.length; i += 1) {
        var handInst = findHandCard(state, side, uids[i]);
        if (!handInst || chosen.indexOf(handInst) !== -1) return { ok: false, reason: 'Choose 2 different cards from your hand.' };
        chosen.push(handInst);
      }
      chosen.forEach(function (inst) {
        removeFromHand(state, side, inst);
        toGrave(state, side, inst);
        log(state, side, sideAction(state, side, 'discard') + ' ' + cardOf(inst).name + '.');
      });
      drawCards(state, side, 1, 'Destroyer of Worlds');
      state.pending = null;
      state.phase = 'playing';
      finishAction(state);
      return { ok: true };
    }

    if (pending.type === 'peek') {
      state.pending = null;
      state.phase = 'playing';
      finishAction(state);
      return { ok: true };
    }

    state.pending = null;
    state.phase = 'playing';
    finishAction(state);
    return { ok: true };
  }

  /* ------------------------------------------------------------------------
     Match setup, mulligans and round flow
     ------------------------------------------------------------------------ */

  function freshStats() {
    return {
      played: 0,
      deployed: 0,
      drawn: 0,
      mulligans: 0,
      unitsLost: 0,
      destroyed: 0,
      passes: 0,
      gemsLost: 0,
      revived: 0,
      roundsWon: 0,
      leaderUsed: false
    };
  }

  function validDeckIds(ids, faction) {
    var deck = (ids || []).filter(function (id) { return !!G.CARDS[id]; });
    if (!deck.length) deck = G.deckFor(faction);
    return deck;
  }

  function buildDeck(state, side, ids) {
    var list = ids.map(function (id) {
      return makeInstance(state, id, side);
    });
    return shuffle(state, list);
  }

  function openingHandSize(state, side) {
    var leader = leaderOfSide(state, side);
    return 10 + (leader && leader.passiveEffect === 'extraDraw' ? 1 : 0);
  }

  function dealOpeningHands(state) {
    SIDES.forEach(function (side) {
      var size = openingHandSize(state, side);
      for (var i = 0; i < size; i += 1) {
        if (!state.decks[side].length) break;
        var inst = state.decks[side].pop();
        inst.zone = 'hand';
        inst.row = null;
        inst.boardSide = null;
        state.hands[side].push(inst);
      }
      var leader = leaderOfSide(state, side);
      if (leader && leader.passiveEffect === 'extraDraw') {
        log(state, side, sideAction(state, side, 'receive') + ' an extra opening card from ' + leader.name + '\'s gift.');
      }
    });
  }

  /**
   * Create a complete match state. The match starts in the mulligan phase;
   * finishMulligan() flips the table over to the first round.
   *
   * config: {
   *   playerFaction, playerLeaderId, playerDeck,
   *   enemyFaction, enemyLeaderId, enemyDeck,
   *   starter: 'player'|'enemy' (optional; otherwise coin-flipped),
   *   random: function, onEvent: function
   * }
   */
  function createState(config) {
    config = config || {};
    var playerFaction = G.FACTIONS[config.playerFaction] ? config.playerFaction : 'northern';
    var enemyFaction = G.FACTIONS[config.enemyFaction] ? config.enemyFaction : null;
    if (!enemyFaction || enemyFaction === playerFaction) {
      enemyFaction = G.FACTION_ORDER.filter(function (id) { return id !== playerFaction; })[0] || 'nilfgaard';
    }

    var playerLeaderId = G.LEADERS[config.playerLeaderId] && G.LEADERS[config.playerLeaderId].faction === playerFaction
      ? config.playerLeaderId : G.defaultLeaderFor(playerFaction);
    var enemyLeaderId = G.LEADERS[config.enemyLeaderId] && G.LEADERS[config.enemyLeaderId].faction === enemyFaction
      ? config.enemyLeaderId : G.defaultLeaderFor(enemyFaction);

    var state = {
      phase: 'mulligan',
      round: 1,
      humanSide: 'player',
      playerFaction: playerFaction,
      enemyFaction: enemyFaction,
      playerLeaderId: playerLeaderId,
      enemyLeaderId: enemyLeaderId,
      random: typeof config.random === 'function' ? config.random : Math.random,
      onEvent: typeof config.onEvent === 'function' ? config.onEvent : null,
      nextUid: 0,
      decks: { player: [], enemy: [] },
      hands: { player: [], enemy: [] },
      graves: { player: [], enemy: [] },
      rows: {
        player: { melee: newRow(state), ranged: newRow(state), siege: newRow(state) },
        enemy: { melee: newRow(state), ranged: newRow(state), siege: newRow(state) }
      },
      weatherZone: [],
      void: [],
      passed: { player: false, enemy: false },
      gems: { player: 2, enemy: 2 },
      roundsWon: { player: 0, enemy: 0 },
      usedLeaders: { player: false, enemy: false },
      cancelledLeaders: { player: false, enemy: false },
      flags: { spyDouble: false },
      mulligan: {
        player: { remaining: 2, used: 0, done: false },
        enemy: { remaining: 2, used: 0, done: false }
      },
      stats: { player: freshStats(), enemy: freshStats() },
      log: [],
      logSeq: 0,
      action: null,
      pending: null,
      lastAction: null,
      lastPlayedUid: null,
      turn: null,
      starter: null,
      coin: null,
      roundStarter: null,
      matchOver: false,
      result: null,
      lastRound: null,
      roundHistory: [],
      roundKeep: { player: [], enemy: [] }
    };

    var starter = config.starter === 'player' || config.starter === 'enemy'
      ? config.starter
      : (state.random() < 0.5 ? 'player' : 'enemy');
    state.starter = starter;
    state.coin = starter;
    state.turn = starter;
    state.roundStarter = starter;

    state.decks.player = buildDeck(state, 'player', validDeckIds(config.playerDeck, playerFaction));
    state.decks.enemy = buildDeck(state, 'enemy', validDeckIds(config.enemyDeck, enemyFaction));
    dealOpeningHands(state);

    log(state, null, G.FACTIONS[playerFaction].name + ' face ' + G.FACTIONS[enemyFaction].name + ' across the tavern table.');
    var playerLeader = G.LEADERS[playerLeaderId];
    var enemyLeader = G.LEADERS[enemyLeaderId];
    var leaderName = function (leader) {
      return leader.name + (leader.epithet ? ', ' + leader.epithet : '');
    };
    log(state, null, leaderName(playerLeader) + ' meets ' + leaderName(enemyLeader) + '.');

    emit(state, 'matchStart', {
      playerFaction: playerFaction,
      enemyFaction: enemyFaction,
      playerLeaderId: playerLeaderId,
      enemyLeaderId: enemyLeaderId,
      starter: starter,
      humanSide: state.humanSide
    });
    emit(state, 'deal', {
      player: state.hands.player.length,
      enemy: state.hands.enemy.length
    });
    return state;
  }

  /**
   * Choose the opening player. Used for the Scoia'tael coin choice before the
   * first round. Once the first card is played the starter is locked.
   */
  function setStarter(state, side) {
    if (!state) return { ok: false, reason: 'No match in progress.' };
    if (side !== 'player' && side !== 'enemy') return { ok: false, reason: 'Unknown side.' };
    if (state.phase === 'playing') return { ok: false, reason: 'The first round has already begun.' };
    if (state.phase !== 'mulligan') return { ok: false, reason: 'The opening turn is already decided.' };
    state.starter = side;
    state.coin = side;
    state.turn = side;
    state.roundStarter = side;
    log(state, null, sideName(state, side) + ' will open the first round.');
    emit(state, 'starter', { side: side });
    return { ok: true };
  }

  /**
   * Swap one card during the one-time mulligan. The returned card is shuffled
   * back into the deck and a replacement is drawn. Up to two per player.
   */
  function mulliganCard(state, side, uid) {
    if (!state || state.phase !== 'mulligan') return { ok: false, reason: 'The mulligan is closed.' };
    var ms = state.mulligan[side];
    if (!ms) return { ok: false, reason: 'Unknown side.' };
    if (ms.done || ms.remaining <= 0) return { ok: false, reason: 'No mulligans remain.' };
    var inst = findHandCard(state, side, uid);
    if (!inst) return { ok: false, reason: 'That card is not in your hand.' };

    var oldCard = cardOf(inst);
    removeFromHand(state, side, inst);
    inst.zone = 'deck';
    inst.row = null;
    inst.boardSide = null;
    inst.enteredRound = null;
    state.decks[side].push(inst);
    shuffle(state, state.decks[side]);

    var replacement = state.decks[side].pop();
    if (replacement) {
      replacement.zone = 'hand';
      replacement.row = null;
      replacement.boardSide = null;
      state.hands[side].push(replacement);
      state.stats[side].drawn += 1;
    }

    ms.remaining -= 1;
    ms.used += 1;
    state.stats[side].mulligans += 1;
    if (ms.remaining <= 0) ms.done = true;

    if (side === state.humanSide) {
      log(state, side, 'You mulligan ' + oldCard.name + '.');
    } else {
      log(state, side, 'Opponent mulligans a card.');
    }
    emit(state, 'mulligan', {
      side: side,
      oldCardId: oldCard.id,
      remaining: ms.remaining,
      used: ms.used,
      done: ms.done
    });
    return { ok: true, oldCardId: oldCard.id, replacement: replacement ? replacement.cardId : null, remaining: ms.remaining };
  }

  /**
   * Lock in a side's hand. When both sides are ready, the first round begins
   * with the chosen starter and no further opening draws.
   */
  function finishMulligan(state, side) {
    if (!state) return { ok: false, reason: 'No match in progress.' };
    if (state.phase !== 'mulligan') {
      return { ok: true, started: state.phase === 'playing', alreadyStarted: true };
    }
    var ms = state.mulligan[side];
    if (!ms) return { ok: false, reason: 'Unknown side.' };
    ms.done = true;
    ms.remaining = 0;
    emit(state, 'mulliganDone', { side: side });

    if (!state.mulligan.player.done || !state.mulligan.enemy.done) {
      return { ok: true, started: false };
    }

    state.phase = 'playing';
    state.turn = state.starter;
    state.roundStarter = state.starter;
    log(state, null, 'Hands are locked. Round I begins.');
    emit(state, 'mulliganEnd', { starter: state.starter });
    emit(state, 'roundStart', {
      round: 1,
      starter: state.starter,
      gems: { player: state.gems.player, enemy: state.gems.enemy }
    });
    emit(state, 'turn', { side: state.turn });
    return { ok: true, started: true };
  }

  function roundScores(state) {
    return { player: scoreSide(state, 'player'), enemy: scoreSide(state, 'enemy') };
  }

  function determineMatchResult(state) {
    var p = state.gems.player;
    var e = state.gems.enemy;
    var winner;
    var reason;

    if (p <= 0 && e <= 0) {
      winner = 'draw';
      reason = 'Both commanders spent their last gem.';
    } else if (p <= 0) {
      winner = 'enemy';
      reason = 'The player\'s last gem is spent.';
    } else if (e <= 0) {
      winner = 'player';
      reason = 'The opponent\'s last gem is spent.';
    } else if (state.roundsWon.player !== state.roundsWon.enemy) {
      winner = state.roundsWon.player > state.roundsWon.enemy ? 'player' : 'enemy';
      reason = 'The third round is spent.';
    } else if (p !== e) {
      winner = p > e ? 'player' : 'enemy';
      reason = 'The third round is spent.';
    } else {
      winner = 'draw';
      reason = 'The third round is spent with no clear victor.';
    }

    return {
      winner: winner,
      reason: reason,
      gems: { player: p, enemy: e },
      roundsWon: { player: state.roundsWon.player, enemy: state.roundsWon.enemy },
      round: state.round
    };
  }

  /**
   * Score the finished round, spend gems, trigger faction passives, and either
   * close the match or leave the table waiting for startNextRound().
   */
  function endRound(state) {
    if (!state || state.phase !== 'playing') {
      return { ok: false, reason: 'The round cannot end right now.' };
    }

    state.action = null;
    state.pending = null;

    var scores = roundScores(state);
    var tie = scores.player === scores.enemy;
    var winner = scores.player > scores.enemy ? 'player'
      : scores.enemy > scores.player ? 'enemy' : 'tie';
    var tieBroken = false;

    if (tie) {
      var playerNilfgaard = state.playerFaction === 'nilfgaard';
      var enemyNilfgaard = state.enemyFaction === 'nilfgaard';
      if (playerNilfgaard !== enemyNilfgaard) {
        winner = playerNilfgaard ? 'player' : 'enemy';
        tieBroken = true;
      }
    }

    var gemsBefore = { player: state.gems.player, enemy: state.gems.enemy };
    var gemsLost = { player: false, enemy: false };

    if (winner === 'player') {
      state.gems.enemy = Math.max(0, state.gems.enemy - 1);
      gemsLost.enemy = true;
      state.roundsWon.player += 1;
      state.stats.player.roundsWon += 1;
      state.stats.enemy.gemsLost += 1;
    } else if (winner === 'enemy') {
      state.gems.player = Math.max(0, state.gems.player - 1);
      gemsLost.player = true;
      state.roundsWon.enemy += 1;
      state.stats.enemy.roundsWon += 1;
      state.stats.player.gemsLost += 1;
    } else {
      state.gems.player = Math.max(0, state.gems.player - 1);
      state.gems.enemy = Math.max(0, state.gems.enemy - 1);
      gemsLost.player = true;
      gemsLost.enemy = true;
      state.stats.player.gemsLost += 1;
      state.stats.enemy.gemsLost += 1;
    }

    var matchOver = state.gems.player <= 0 || state.gems.enemy <= 0 || state.round >= 3;
    var matchResult = matchOver ? determineMatchResult(state) : null;

    state.roundKeep = { player: [], enemy: [] };
    if (!matchOver) {
      SIDES.forEach(function (side) {
        if (factionOfSide(state, side) !== 'monsters') return;
        var candidates = [];
        G.ROW_ORDER.forEach(function (rowName) {
          state.rows[side][rowName].cards.forEach(function (inst) {
            var card = cardOf(inst);
            if (inst.owner === side && isNonHeroUnit(card) && !card.token) candidates.push(inst);
          });
        });
        if (!candidates.length) return;
        var kept = randomOf(state, candidates);
        if (!kept) return;
        state.roundKeep[side].push(kept.uid);
        log(state, side, sideAction(state, side, 'keep') + ' ' + cardOf(kept).name + ' on the battlefield.');
        emit(state, 'keep', {
          side: side,
          uid: kept.uid,
          cardId: kept.cardId
        });
      });
    }

    if (!matchOver && winner !== 'tie' && factionOfSide(state, winner) === 'northern') {
      drawCards(state, winner, 1, 'Northern Resolve');
    }

    if (winner === 'tie') {
      log(state, null, 'Round ' + state.round + ' ends ' + scores.player + '–' + scores.enemy +
        '. Both commanders lose a gem.');
    } else {
      log(state, winner, 'Round ' + state.round + ' ends ' + scores.player + '–' + scores.enemy +
        ' in ' + (winner === state.humanSide ? 'your favour.' : 'the opponent\'s favour.') +
        (tieBroken ? ' Nilfgaard claims the tie.' : '') +
        ' ' + sideAction(state, other(winner), 'lose') + ' a gem.');
    }

    var info = {
      round: state.round,
      scores: scores,
      winner: winner,
      tie: winner === 'tie',
      tieBroken: tieBroken,
      starter: state.roundStarter,
      gemsBefore: gemsBefore,
      gemsAfter: { player: state.gems.player, enemy: state.gems.enemy },
      gemsLost: gemsLost,
      matchOver: matchOver,
      keep: {
        player: state.roundKeep.player.slice(),
        enemy: state.roundKeep.enemy.slice()
      }
    };

    // Weather never survives a round. The cards that summoned it go to their
    // owners' discard piles before the next round is dealt.
    var clearedWeather = clearAllWeather(state);
    if (clearedWeather.length) {
      log(state, null, 'The skies clear as the round ends.');
      emit(state, 'clearWeather', {
        owner: null,
        cleared: clearedWeather.map(function (c) { return c.cardId; }),
        roundEnd: true
      });
    }

    state.lastRound = info;
    state.roundHistory.push(info);
    state.matchOver = matchOver;

    if (matchOver) {
      state.result = matchResult;
      state.phase = 'gameover';
      log(state, null, matchResult.winner === 'draw'
        ? 'The match ends in a draw. No banner flies over the table.'
        : sideAction(state, matchResult.winner, 'win') + ' the match.');
    } else {
      state.phase = 'roundEnd';
    }

    emit(state, 'roundEnd', info);
    if (matchOver) emit(state, 'matchEnd', matchResult);
    return { ok: true, round: info, match: matchResult };
  }

  function clearBoardForNextRound(state) {
    var keep = Object.create(null);
    SIDES.forEach(function (side) {
      (state.roundKeep[side] || []).forEach(function (uid) { keep[uid] = true; });
    });

    SIDES.forEach(function (side) {
      G.ROW_ORDER.forEach(function (rowName) {
        var row = state.rows[side][rowName];
        row.cards.slice().forEach(function (inst) {
          if (keep[inst.uid]) {
            inst.enteredRound = state.round;
            return;
          }
          removeUnitFromBoard(state, inst);
          toGrave(state, inst.owner, inst);
        });
        row.horn = false;
        row.mardroeme = false;
        row.leaderDouble = false;
      });
    });

    state.roundKeep = { player: [], enemy: [] };
  }

  function skelligeReturn(state, side) {
    var eligible = state.graves[side].filter(function (inst) {
      var card = cardOf(inst);
      return card && !card.special && !card.hero && !card.token;
    });
    if (!eligible.length) return [];

    shuffle(state, eligible);
    var chosen = eligible.slice(0, Math.min(2, eligible.length));
    chosen.forEach(function (inst) {
      var card = cardOf(inst);
      removeFromGrave(state, side, inst);
      var boardSide = isSpy(card) ? other(side) : side;
      var rowName = card.row === 'agile' ? bestRowFor(state, card, boardSide) : card.row;
      placeOnBoard(state, inst, boardSide, rowName);
      log(state, side, sideAction(state, side, 'return') + ' ' + card.name + ' from the grave.');
    });
    state.stats[side].revived += chosen.length;
    emit(state, 'skellige', {
      side: side,
      cards: chosen.map(function (inst) { return inst.cardId; })
    });
    toast(state, 'The fallen answer Skellige', 'score');
    return chosen;
  }

  /**
   * Pack the previous round away and deal the next one. Weather and row
   * effects were already cleared at round end; the winner of the last round
   * opens the next.
   */
  function startNextRound(state) {
    if (!state) return { ok: false, reason: 'No match in progress.' };
    if (state.phase !== 'roundEnd') return { ok: false, reason: 'The table is not ready for another round.' };
    if (state.matchOver) return { ok: false, reason: 'The match is over.' };
    var previous = state.lastRound;
    if (!previous) return { ok: false, reason: 'No finished round to follow.' };
    if (previous.round >= 3) return { ok: false, reason: 'There are no rounds left.' };

    state.round = previous.round + 1;
    clearBoardForNextRound(state);

    state.passed = { player: false, enemy: false };
    state.pending = null;
    state.action = null;
    state.lastAction = null;
    state.lastPlayedUid = null;
    state.flags = { spyDouble: false };

    var starter = previous.winner === 'tie'
      ? other(previous.starter || state.starter)
      : previous.winner;
    state.starter = starter;
    state.turn = starter;
    state.roundStarter = starter;
    state.phase = 'playing';

    if (state.round === 3) {
      SIDES.forEach(function (side) {
        if (factionOfSide(state, side) === 'skellige') skelligeReturn(state, side);
      });
    }

    log(state, null, 'Round ' + state.round + ' begins. ' + sideName(state, starter) + ' open' +
      (starter === state.humanSide ? '' : 's') + ' the play.');
    emit(state, 'roundStart', {
      round: state.round,
      starter: starter,
      gems: { player: state.gems.player, enemy: state.gems.enemy }
    });
    emit(state, 'turn', { side: state.turn });
    return { ok: true, round: state.round, starter: starter };
  }

  Engine.createState = createState;
  Engine.setStarter = setStarter;
  Engine.mulliganCard = mulliganCard;
  Engine.finishMulligan = finishMulligan;
  Engine.endRound = endRound;
  Engine.startNextRound = startNextRound;
  Engine.roundScores = roundScores;
  Engine.clearBoardForNextRound = clearBoardForNextRound;
  Engine.factionOfSide = factionOfSide;
  Engine.leaderOfSide = leaderOfSide;
  Engine.sideName = sideName;
  Engine.canUseLeader = canUseLeader;
  Engine.useLeader = useLeader;
  Engine.resolveChoice = resolveChoice;
  Engine.leaderEffectActive = leaderEffectActive;
})();
