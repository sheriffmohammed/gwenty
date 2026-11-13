/* ==========================================================================
   GWENT — application flow
   Setup, coin toss, mulligans, player actions, AI turns and round transitions.
   ========================================================================== */
(function () {
  'use strict';

  var G = window.GWENT;
  var E = G.Engine;
  var AI = G.AI;
  var UI = G.UI;

  var app = {
    setup: null,
    state: null,
    aiTimer: null,
    pendingTimer: null,
    mulliganTimer: null,
    overlayTimer: null,
    enemyMulliganRunning: false,
    roundOneAnnounced: false,
    roundShownFor: null,
    gameOverShown: false
  };

  function pick(list) {
    if (!list || !list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  function randomOpponentFaction(exclude) {
    var options = G.FACTION_ORDER.filter(function (id) { return id !== exclude; });
    return pick(options) || G.FACTION_ORDER[0];
  }

  function randomLeaderFor(faction) {
    var leaders = G.leadersFor(faction);
    return leaders.length ? pick(leaders).id : G.defaultLeaderFor(faction);
  }

  function createSetup(faction) {
    var chosen = G.FACTIONS[faction] ? faction : G.FACTION_ORDER[0];
    var opponent = randomOpponentFaction(chosen);
    return {
      faction: chosen,
      leaderId: G.defaultLeaderFor(chosen),
      opponentFaction: opponent,
      opponentLeaderId: randomLeaderFor(opponent)
    };
  }

  function cancelTimers() {
    if (app.aiTimer) window.clearTimeout(app.aiTimer);
    if (app.pendingTimer) window.clearTimeout(app.pendingTimer);
    if (app.mulliganTimer) window.clearTimeout(app.mulliganTimer);
    if (app.overlayTimer) window.clearTimeout(app.overlayTimer);
    app.aiTimer = null;
    app.pendingTimer = null;
    app.mulliganTimer = null;
    app.overlayTimer = null;
  }

  /* ------------------------------------------------------------------------
     Setup screen
     ------------------------------------------------------------------------ */

  function showSetup() {
    if (!app.setup) app.setup = createSetup('northern');
    UI.renderSetup(app.setup);
    UI.showScreen('setup');
  }

  function chooseFaction(faction) {
    if (!G.FACTIONS[faction] || !G.leadersFor(faction).length) return;
    if (!app.setup) app.setup = createSetup(faction);
    app.setup.faction = faction;
    app.setup.leaderId = G.defaultLeaderFor(faction);
    if (app.setup.opponentFaction === faction) {
      app.setup.opponentFaction = randomOpponentFaction(faction);
      app.setup.opponentLeaderId = randomLeaderFor(app.setup.opponentFaction);
    }
    UI.renderSetup(app.setup);
  }

  function chooseLeader(leaderId) {
    var leader = G.LEADERS[leaderId];
    if (!app.setup || !leader || leader.faction !== app.setup.faction) return;
    app.setup.leaderId = leaderId;
    UI.renderSetup(app.setup);
  }

  /* ------------------------------------------------------------------------
     Starting a match and the opening ceremony
     ------------------------------------------------------------------------ */

  function beginMatch() {
    if (!app.setup) app.setup = createSetup('northern');
    var setup = app.setup;
    if (!G.FACTIONS[setup.faction] || !G.FACTIONS[setup.opponentFaction]) return;
    if (setup.opponentFaction === setup.faction) {
      setup.opponentFaction = randomOpponentFaction(setup.faction);
      setup.opponentLeaderId = randomLeaderFor(setup.opponentFaction);
    }
    var playerLeader = G.LEADERS[setup.leaderId];
    if (!playerLeader || playerLeader.faction !== setup.faction) {
      setup.leaderId = G.defaultLeaderFor(setup.faction);
    }
    var enemyLeader = G.LEADERS[setup.opponentLeaderId];
    if (!enemyLeader || enemyLeader.faction !== setup.opponentFaction) {
      setup.opponentLeaderId = G.defaultLeaderFor(setup.opponentFaction);
    }

    cancelTimers();
    if (UI.motion && UI.motion.reset) UI.motion.reset();
    UI.closeModal(true);
    UI.hideCoin();
    UI.hideRound();
    UI.hideGameOver();
    UI.clearSelection(false);
    app.enemyMulliganRunning = false;
    app.roundOneAnnounced = false;
    app.roundShownFor = null;
    app.gameOverShown = false;

    var state;
    try {
      state = E.createState({
        playerFaction: setup.faction,
        playerLeaderId: setup.leaderId,
        playerDeck: G.deckFor(setup.faction),
        enemyFaction: setup.opponentFaction,
        enemyLeaderId: setup.opponentLeaderId,
        enemyDeck: G.deckFor(setup.opponentFaction),
        onEvent: handleEvent
      });
    } catch (err) {
      UI.toast('The table could not be prepared.', 'danger');
      return;
    }
    app.state = state;
    UI.showScreen('table');
    UI.renderTable(state);
    resolveOpening(state);
  }

  function resolveOpening(state) {
    var playerScoia = state.playerFaction === 'scoiatael';
    var enemyScoia = state.enemyFaction === 'scoiatael';
    if (playerScoia && !enemyScoia) {
      UI.openStartChoice(function (takeFirst) {
        if (app.state !== state) return;
        E.setStarter(state, takeFirst ? 'player' : 'enemy');
        presentCoin(state, takeFirst ? 'scoia-player-first' : 'scoia-player-second');
      });
      return;
    }
    if (enemyScoia && !playerScoia) {
      E.setStarter(state, 'player');
      presentCoin(state, 'scoia-enemy-yield');
      return;
    }
    presentCoin(state, playerScoia && enemyScoia ? 'scoia-both' : 'coin');
  }

  function coinCopy(state, mode) {
    var youOpen = state.starter === 'player';
    if (mode === 'scoia-player-first') {
      return {
        kicker: 'The Aen Seidhe choose',
        result: 'You take the opening move',
        detail: 'Your banner will play the first card of the match.'
      };
    }
    if (mode === 'scoia-player-second') {
      return {
        kicker: 'The Aen Seidhe choose',
        result: 'You yield the opening',
        detail: 'Your opponent plays first. You will answer their move.'
      };
    }
    if (mode === 'scoia-enemy-yield') {
      return {
        kicker: 'The Aen Seidhe choose',
        result: 'The elves yield the first move',
        detail: 'Their commander lets you open the play.'
      };
    }
    if (mode === 'scoia-both') {
      return {
        kicker: 'A coin between elves',
        result: youOpen ? 'The wolf shows its teeth' : 'The sun favours your rival',
        detail: 'Two Aen Seidhe banners — the coin alone decides who opens.'
      };
    }
    return {
      kicker: 'The coin is cast',
      result: youOpen ? 'The wolf shows its teeth' : 'The sun favours your rival',
      detail: youOpen
        ? 'You take the opening move. Choose your mulligans.'
        : 'Your opponent takes the opening move. Choose your mulligans.'
    };
  }

  function presentCoin(state, mode) {
    UI.showCoin(coinCopy(state, mode), function () {
      if (app.state !== state) return;
      startMulligans(state);
    });
  }

  function startMulligans(state) {
    UI.renderTable(state);
    UI.toast('You may redraw up to two cards, then lock your hand.', 'info');
    startEnemyMulligan();
  }

  /* ------------------------------------------------------------------------
     Mulligans
     ------------------------------------------------------------------------ */

  function startEnemyMulligan() {
    var state = app.state;
    if (!state || state.phase !== 'mulligan' || app.enemyMulliganRunning) return;
    app.enemyMulliganRunning = true;
    var plan = AI.mulliganPlan(state, 'enemy').slice();
    var index = 0;

    function finishEnemy() {
      if (app.state !== state) {
        app.enemyMulliganRunning = false;
        return;
      }
      if (state.phase === 'mulligan') E.finishMulligan(state, 'enemy');
      app.enemyMulliganRunning = false;
      afterMulligan(state);
    }

    function step() {
      app.mulliganTimer = null;
      if (app.state !== state) {
        app.enemyMulliganRunning = false;
        return;
      }
      if (state.phase !== 'mulligan') {
        app.enemyMulliganRunning = false;
        return;
      }
      if (index >= plan.length) {
        finishEnemy();
        return;
      }
      var result = E.mulliganCard(state, 'enemy', plan[index]);
      index += 1;
      if (result.ok) UI.renderTable(state);
      app.mulliganTimer = window.setTimeout(step, 620);
    }

    app.mulliganTimer = window.setTimeout(step, 700);
  }

  function afterMulligan(state) {
    if (app.state !== state) return;
    UI.renderTable(state);
    if (state.phase === 'playing' && !app.roundOneAnnounced) {
      app.roundOneAnnounced = true;
      UI.toast('Round I begins. ' + (state.turn === 'player' ? 'You have the opening move.' : 'Your opponent opens.'), 'info');
      if (state.turn === 'enemy') scheduleAI(950);
    }
  }

  function handleMulligan(uid) {
    var state = app.state;
    if (!state || state.phase !== 'mulligan' || state.mulligan.player.done) return;
    var result = E.mulliganCard(state, 'player', uid);
    if (!result.ok) {
      UI.toast(result.reason || 'That card cannot be mulliganed.', 'danger');
      return;
    }
    // Using the last redraw locks the hand automatically, so run the same
    // completion path as the explicit Lock hand button.
    if (state.mulligan.player.done) E.finishMulligan(state, 'player');
    UI.renderTable(state);
    UI.toast('You mulligan ' + G.CARDS[result.oldCardId].name + '.', 'info');
    if (state.phase === 'playing') {
      afterMulligan(state);
    } else if (state.mulligan.player.done) {
      UI.toast('Hand locked. Waiting for your opponent.', 'info');
      if (!app.enemyMulliganRunning) startEnemyMulligan();
    }
  }

  function handleFinishMulligan() {
    var state = app.state;
    if (!state || state.phase !== 'mulligan' || state.mulligan.player.done) return;
    E.finishMulligan(state, 'player');
    UI.renderTable(state);
    if (state.phase === 'playing') {
      afterMulligan(state);
    } else {
      UI.toast('Hand locked. Waiting for your opponent.', 'info');
      if (!app.enemyMulliganRunning) startEnemyMulligan();
    }
  }

  /* ------------------------------------------------------------------------
     Player actions
     ------------------------------------------------------------------------ */

  function handlePlayCard(uid, target) {
    var state = app.state;
    if (!state || state.phase !== 'playing') return false;
    if (state.turn !== 'player' || state.passed.player) return false;
    var inst = E.findHandCard(state, 'player', uid);
    if (UI.motion) {
      UI.motion.beginAction({
        type: 'play', side: 'player', uid: uid,
        cardId: inst ? inst.cardId : null, target: target || null
      });
    }
    var result = E.playCard(state, 'player', uid, target || null);
    if (!result.ok) {
      if (UI.motion) UI.motion.cancel();
      UI.toast(result.reason || 'That card cannot be played.', 'danger');
      UI.playSound('error');
      UI.clearSelection(true);
      return false;
    }
    UI.clearSelection(false);
    afterAction();
    return true;
  }

  function handlePass() {
    var state = app.state;
    if (!state || state.phase !== 'playing' || state.turn !== 'player' || state.passed.player) return;
    if (UI.motion) UI.motion.beginAction({ type: 'pass', side: 'player' });
    var result = E.pass(state, 'player');
    if (!result.ok) {
      if (UI.motion) UI.motion.cancel();
      UI.toast(result.reason || 'You cannot pass right now.', 'danger');
      return;
    }
    afterAction();
  }

  function handleUseLeader() {
    var state = app.state;
    if (!state) return;
    if (UI.motion) UI.motion.beginAction({ type: 'leader', side: 'player' });
    var result = E.useLeader(state, 'player');
    if (!result.ok) {
      if (UI.motion) UI.motion.cancel();
      UI.toast(result.reason || 'Your leader cannot act right now.', 'danger');
      UI.playSound('error');
      return;
    }
    afterAction();
  }

  function resolvePlayerChoice(payload) {
    var state = app.state;
    if (!state || state.phase !== 'choosing' || !state.pending || state.pending.side !== 'player') return false;
    if (UI.motion) UI.motion.beginAction({ type: 'choice', side: 'player' });
    var result = E.resolveChoice(state, 'player', payload);
    if (!result.ok) {
      if (UI.motion) UI.motion.cancel();
      UI.toast(result.reason || 'That choice cannot be made.', 'danger');
      UI.playSound('error');
      return false;
    }
    afterAction();
    return true;
  }

  /* ------------------------------------------------------------------------
     Shared post-action flow
     ------------------------------------------------------------------------ */

  function afterAction() {
    var state = app.state;
    if (!state) return;
    UI.renderTable(state, { justPlayedUid: state.lastPlayedUid });

    if (state.phase === 'choosing' && state.pending) {
      if (state.pending.side === 'player') {
        UI.openChoice(state.pending, resolvePlayerChoice);
      } else {
        window.setTimeout(function () {
          if (app.state === state && state.phase === 'choosing' &&
            state.pending && state.pending.side !== 'player') {
            UI.renderTable(state, { thinking: true });
          }
        }, 900);
        schedulePendingResolution(1400);
      }
      return;
    }
    if (state.phase === 'roundEnd' || state.phase === 'gameover') {
      scheduleRoundOverlay(state);
      return;
    }
    if (state.phase === 'playing' && state.turn === 'enemy') {
      scheduleAI(1500);
    }
  }

  function scheduleRoundOverlay(state) {
    if (!state || app.roundShownFor === state.round) return;
    app.roundShownFor = state.round;
    function show() {
      if (app.state !== state) return;
      if (state.phase !== 'roundEnd' && state.phase !== 'gameover') return;
      if (UI.isModalOpen()) {
        app.overlayTimer = window.setTimeout(show, 400);
        return;
      }
      if (state.lastRound) UI.showRound(state.lastRound, state);
    }
    app.overlayTimer = window.setTimeout(show, 1500);
  }

  function handleRoundContinue() {
    var state = app.state;
    if (!state) return;
    if (state.phase === 'gameover') {
      if (app.overlayTimer) window.clearTimeout(app.overlayTimer);
      app.overlayTimer = window.setTimeout(function () {
        app.overlayTimer = null;
        showGameOverNow();
      }, 1500);
      return;
    }
    if (state.phase !== 'roundEnd') return;
    if (UI.motion) UI.motion.beginAction({ type: 'roundStart', side: state.turn });
    var result = E.startNextRound(state);
    if (!result.ok) {
      if (UI.motion) UI.motion.cancel();
      UI.toast(result.reason || 'The next round cannot begin.', 'danger');
      return;
    }
    app.roundShownFor = null;
    UI.renderTable(state);
    UI.toast('Round ' + UI.roman(state.round) + ' begins. ' +
      (state.turn === 'player' ? 'You open the play.' : 'Your opponent opens.'), 'info');
    if (state.turn === 'enemy') scheduleAI(1600);
  }

  function showGameOverNow() {
    var state = app.state;
    if (!state || state.phase !== 'gameover' || app.gameOverShown) return;
    app.gameOverShown = true;
    UI.showGameOver(state.result, state);
  }

  /* ------------------------------------------------------------------------
     AI turns
     ------------------------------------------------------------------------ */

  function scheduleAI(delay) {
    if (app.aiTimer) window.clearTimeout(app.aiTimer);
    app.aiTimer = null;
    var state = app.state;
    if (!state || state.phase !== 'playing' || state.turn !== 'enemy') return;
    app.aiTimer = window.setTimeout(runAI, delay === undefined ? 1500 : delay);
  }

  function runAI() {
    app.aiTimer = null;
    var state = app.state;
    if (!state || state.phase !== 'playing' || state.turn !== 'enemy') return;
    if (UI.isModalOpen()) {
      scheduleAI(700);
      return;
    }

    var action = AI.chooseAction(state, 'enemy');
    if (!action || action.type === 'wait') return;
    if (action.type === 'pending') {
      if (state.phase === 'choosing') schedulePendingResolution(1000);
      return;
    }
    var intent = {
      type: action.type === 'play' ? 'play' : action.type === 'leader' ? 'leader' : 'pass',
      side: 'enemy'
    };
    if (action.type === 'play') {
      var handInst = E.findHandCard(state, 'enemy', action.uid);
      intent.uid = action.uid;
      intent.cardId = handInst ? handInst.cardId : null;
      intent.target = action.target || null;
    }
    if (UI.motion) UI.motion.beginAction(intent);
    var result;
    if (action.type === 'play') {
      result = E.playCard(state, 'enemy', action.uid, action.target);
      if (!result.ok) {
        result = E.pass(state, 'enemy');
      }
    } else if (action.type === 'leader') {
      result = E.useLeader(state, 'enemy');
      if (!result.ok) {
        result = E.pass(state, 'enemy');
      }
    } else if (action.type === 'pass') {
      result = E.pass(state, 'enemy');
    } else {
      result = E.pass(state, 'enemy');
    }

    if (result && !result.ok) {
      // The board should always offer a legal action. If it does not, yield
      // rather than leaving the table frozen.
      if (state.phase === 'playing' && state.turn === 'enemy' && !state.passed.enemy) {
        E.pass(state, 'enemy');
      }
    }
    afterAction();
  }

  function schedulePendingResolution(delay) {
    if (app.pendingTimer) window.clearTimeout(app.pendingTimer);
    var state = app.state;
    app.pendingTimer = window.setTimeout(function () {
      app.pendingTimer = null;
      if (app.state !== state || !state || state.phase !== 'choosing' ||
        !state.pending || state.pending.side !== 'enemy') return;
      if (UI.isModalOpen()) {
        schedulePendingResolution(700);
        return;
      }
      var payload = AI.choosePending(state, 'enemy');
      if (payload === null || payload === undefined) payload = {};
      if (UI.motion) UI.motion.beginAction({ type: 'choice', side: 'enemy' });
      var result = E.resolveChoice(state, 'enemy', payload);
      if (!result.ok) {
        var options = (state.pending && state.pending.options) || [];
        var fallback = {};
        if (state.pending && state.pending.type === 'leader-discard') {
          fallback = { uids: options.slice(0, 2).map(function (option) { return option.uid; }) };
        } else if (options.length) {
          fallback = { uid: options[0].uid };
        }
        result = E.resolveChoice(state, 'enemy', fallback);
      }
      if (!result.ok) {
        if (UI.motion) UI.motion.cancel();
        UI.toast(result.reason || 'Your opponent hesitates.', 'danger');
        return;
      }
      afterAction();
    }, delay === undefined ? 1200 : delay);
  }

  /* ------------------------------------------------------------------------
     Round and match conclusions
     ------------------------------------------------------------------------ */

  function handleGameRematch() {
    UI.hideGameOver();
    if (UI.motion) UI.motion.reset();
    app.gameOverShown = false;
    beginMatch();
  }

  function handleGameSetup() {
    cancelTimers();
    if (UI.motion) UI.motion.reset();
    UI.hideCoin();
    UI.hideRound();
    UI.hideGameOver();
    app.state = null;
    UI.state = null;
    UI.clearSelection(false);
    app.gameOverShown = false;
    if (app.setup) {
      app.setup.opponentFaction = randomOpponentFaction(app.setup.faction);
      app.setup.opponentLeaderId = randomLeaderFor(app.setup.opponentFaction);
    }
    showSetup();
  }

  function handleGameTitle() {
    cancelTimers();
    if (UI.motion) UI.motion.reset();
    UI.hideCoin();
    UI.hideRound();
    UI.hideGameOver();
    app.state = null;
    UI.state = null;
    UI.clearSelection(false);
    app.gameOverShown = false;
    UI.showScreen('title');
  }

  function handleRestart() {
    if (UI.motion) UI.motion.reset();
    UI.hideRound();
    UI.hideGameOver();
    app.gameOverShown = false;
    beginMatch();
  }

  function handleQuitToTitle() {
    cancelTimers();
    if (UI.motion) UI.motion.reset();
    UI.hideCoin();
    UI.hideRound();
    UI.hideGameOver();
    app.state = null;
    UI.state = null;
    UI.clearSelection(false);
    UI.showScreen('title');
  }

  /* ------------------------------------------------------------------------
     Engine events
     ------------------------------------------------------------------------ */

  function handleEvent(type, payload) {
    payload = payload || {};
    if (UI.motion) UI.motion.event(type, payload);
    switch (type) {
      case 'toast':
        UI.toast(payload.text, payload.kind);
        break;
      case 'play':
        UI.playSound('play');
        break;
      case 'deal':
      case 'mulligan':
        UI.playSound('deal');
        break;
      case 'muster':
      case 'summon':
        UI.playSound('deal');
        break;
      case 'weather':
        UI.playSound('weather');
        break;
      case 'clearWeather':
        if (!payload.roundEnd) UI.playSound('weather');
        break;
      case 'leader':
        UI.playSound('leader');
        break;
      case 'horn':
      case 'doubleRow':
        UI.playSound('horn');
        break;
      case 'mardroeme':
        UI.playSound('mardroeme');
        break;
      case 'scorch':
        UI.playSound('destroy');
        break;
      case 'revive':
        UI.playSound('select');
        break;
      case 'pass':
        UI.playSound('pass');
        break;
      case 'shuffleGraves':
        UI.playSound('shuffle');
        break;
      case 'roundEnd':
        UI.playSound('round');
        break;
      case 'matchEnd':
        if (payload.winner === 'player') UI.playSound('victory');
        else if (payload.winner === 'enemy') UI.playSound('defeat');
        break;
      case 'keep':
        if (payload.cardId && G.CARDS[payload.cardId]) {
          UI.toast(G.CARDS[payload.cardId].name + ' remains on the battlefield.', 'score');
        }
        break;
      default:
        break;
    }
  }

  /* ------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------ */

  UI.handlers = {
    titlePlay: showSetup,
    setupBack: function () { UI.showScreen('title'); },
    setupFaction: chooseFaction,
    setupLeader: chooseLeader,
    startMatch: beginMatch,
    mulligan: handleMulligan,
    finishMulligan: handleFinishMulligan,
    playCard: handlePlayCard,
    pass: handlePass,
    useLeader: handleUseLeader,
    resolveChoice: resolvePlayerChoice,
    roundContinue: handleRoundContinue,
    gameRematch: handleGameRematch,
    gameSetup: handleGameSetup,
    gameTitle: handleGameTitle,
    restart: handleRestart,
    quitToTitle: handleQuitToTitle,
    onModalClosed: function () {
      if (app.state && app.state.phase === 'playing' && app.state.turn === 'enemy' && !UI.isModalOpen()) {
        scheduleAI(600);
      }
    }
  };

  function boot() {
    UI.init();
    app.setup = createSetup('northern');
    UI.renderSetup(app.setup);
    UI.showScreen('title');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
