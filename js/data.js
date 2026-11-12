/* ==========================================================================
   GWENT — card, faction and deck data
   A dependency-free recreation for The Witcher 3's tavern card game.
   ========================================================================== */
(function () {
  'use strict';

  var G = window.GWENT = window.GWENT || {};

  /* ------------------------------------------------------------------------
     Rows, abilities and weather
     ------------------------------------------------------------------------ */

  G.ROWS = {
    melee: { id: 'melee', name: 'Close Combat', short: 'Close', icon: 'i-sword', sub: 'Melee' },
    ranged: { id: 'ranged', name: 'Ranged', short: 'Ranged', icon: 'i-bow', sub: 'Missiles' },
    siege: { id: 'siege', name: 'Siege', short: 'Siege', icon: 'i-catapult', sub: 'Engines' }
  };
  G.ROW_ORDER = ['melee', 'ranged', 'siege'];

  G.ABILITIES = {
    tightBond: {
      name: 'Tight Bond', abbr: 'TB', icon: 'i-anvil',
      desc: 'If more than one card with the same name lies on this row, each one is multiplied by the number of copies present.'
    },
    morale: {
      name: 'Morale', abbr: 'Mor', icon: 'i-star',
      desc: 'Adds +1 strength to every other non-hero unit on the same row.'
    },
    medic: {
      name: 'Medic', abbr: 'Med', icon: 'i-cross',
      desc: 'When deployed, revive one non-hero unit from your discard pile and deploy it. Heroes cannot be revived.'
    },
    muster: {
      name: 'Muster', abbr: 'Mus', icon: 'i-paw',
      desc: 'When deployed, summon every card with the same name and every ally in its muster group from your deck.'
    },
    spy: {
      name: 'Spy', abbr: 'Spy', icon: 'i-eye',
      desc: 'Deploy this card to the opponent\'s battlefield and draw 2 cards. It counts toward the opponent\'s strength.'
    },
    scorch: {
      name: 'Scorch', abbr: 'Scorch', icon: 'i-flame',
      desc: 'Destroys the strongest non-hero unit or units. Row Scorch only burns the matching enemy row and needs a row total of 10 or more.'
    },
    horn: {
      name: 'Commander\'s Horn', abbr: 'Horn', icon: 'i-horn',
      desc: 'Doubles the strength of all non-hero units on its row. A row can carry only one doubling effect.'
    },
    agile: {
      name: 'Agile', abbr: 'Agi', icon: 'i-horse',
      desc: 'This unit may be deployed to either the close combat or the ranged row.'
    },
    berserker: {
      name: 'Berserker', abbr: 'Bers', icon: 'i-claw',
      desc: 'When Mardroeme is placed on its row, this unit transforms into a far stronger warrior.'
    },
    avenger: {
      name: 'Avenger', abbr: 'Avg', icon: 'i-skull',
      desc: 'When this card is removed from the battlefield, a token takes its place.'
    },
    summon: {
      name: 'Summon', abbr: 'Sum', icon: 'i-mask',
      desc: 'When deployed, summons the named allies from both your deck and your hand.'
    },
    mardroeme: {
      name: 'Mardroeme', abbr: 'Mard', icon: 'i-mushroom',
      desc: 'Transforms every Berserker on the chosen row. The effect remains on the row.'
    }
  };

  G.WEATHER = {
    frost: {
      id: 'frost', name: 'Biting Frost', icon: 'i-snow', rows: ['melee'],
      desc: 'All close combat units are reduced to 1 strength (heroes are immune).'
    },
    fog: {
      id: 'fog', name: 'Impenetrable Fog', icon: 'i-fog', rows: ['ranged'],
      desc: 'All ranged units are reduced to 1 strength (heroes are immune).'
    },
    rain: {
      id: 'rain', name: 'Torrential Rain', icon: 'i-rain', rows: ['siege'],
      desc: 'All siege units are reduced to 1 strength (heroes are immune).'
    },
    storm: {
      id: 'storm', name: 'Skellige Storm', icon: 'i-storm', rows: ['ranged', 'siege'],
      desc: 'All ranged and siege units are reduced to 1 strength (heroes are immune).'
    }
  };

  G.FACTIONS = {
    northern: {
      id: 'northern',
      name: 'Northern Realms',
      otype: 'Kingdom of the North',
      icon: 'i-crown',
      motto: 'By banner and blade.',
      passiveName: 'Northern Resolve',
      passive: 'Draw a card after winning a round.',
      passiveShort: 'Draw after winning a round',
      deckName: 'Banners of the North',
      leaderIds: ['nr-foltest-temerian', 'nr-foltest-lord', 'nr-foltest-medell', 'nr-foltest-siegemaster', 'nr-foltest-steelforged']
    },
    nilfgaard: {
      id: 'nilfgaard',
      name: 'Nilfgaardian Empire',
      otype: 'The Great Sun',
      icon: 'i-sun',
      motto: 'The sun rises over all.',
      passiveName: 'Imperial Supremacy',
      passive: 'Nilfgaard wins any round that ends in a tie.',
      passiveShort: 'Wins tied rounds',
      deckName: 'Glory of the Great Sun',
      leaderIds: ['ng-emhyr-emperor', 'ng-emhyr-majesty', 'ng-emhyr-invader', 'ng-emhyr-relentless', 'ng-emhyr-whiteflame']
    },
    scoiatael: {
      id: 'scoiatael',
      name: 'Scoia\'tael',
      otype: 'Aen Seidhe',
      icon: 'i-leaf',
      motto: 'The forest remembers.',
      passiveName: 'Aen Seidhe',
      passive: 'At the start of the match, choose who makes the first move.',
      passiveShort: 'Choose who starts',
      deckName: 'Whispers of the Wood',
      leaderIds: ['st-francesca-daisy', 'st-francesca-hope', 'st-francesca-pureblood', 'st-francesca-queen', 'st-francesca-beautiful']
    },
    monsters: {
      id: 'monsters',
      name: 'Monsters',
      otype: 'Terrors of the Wild',
      icon: 'i-skull',
      motto: 'The dark hungers.',
      passiveName: 'Monstrous Brood',
      passive: 'After each round, keep one random non-hero unit on the battlefield.',
      passiveShort: 'Keep a unit between rounds',
      deckName: 'Terrors of the Dark',
      leaderIds: ['mo-eredin-treacherous', 'mo-eredin-bringer', 'mo-eredin-redriders', 'mo-eredin-destroyer', 'mo-eredin-wildhunt']
    },
    skellige: {
      id: 'skellige',
      name: 'Skellige',
      otype: 'Clans of the Isles',
      icon: 'i-ship',
      motto: 'Iron, salt and storm.',
      passiveName: 'Isles Remember',
      passive: 'At the start of round 3, return 2 random non-hero units from your discard pile to the battlefield.',
      passiveShort: 'Graveyard returns in round 3',
      deckName: 'Storm and Salt',
      leaderIds: ['sk-crach', 'sk-bran']
    }
  };

  G.FACTION_ORDER = ['northern', 'nilfgaard', 'scoiatael', 'monsters', 'skellige'];

  /* ------------------------------------------------------------------------
     Leaders — five per faction, save for Skellige's two
     ------------------------------------------------------------------------ */

  G.LEADERS = {
    'nr-foltest-temerian': {
      id: 'nr-foltest-temerian', faction: 'northern', name: 'Foltest', epithet: 'King of Temeria',
      ability: 'Impenetrable Fog', icon: 'i-crown',
      desc: 'Play an Impenetrable Fog card from your deck. The fog settles over both battlefields.',
      action: 'weather', weather: 'fog', active: true
    },
    'nr-foltest-lord': {
      id: 'nr-foltest-lord', faction: 'northern', name: 'Foltest', epithet: 'Lord Commander of the North',
      ability: 'Clear Weather', icon: 'i-sun',
      desc: 'Clear every weather effect from the battlefield.',
      action: 'clearWeather', active: true
    },
    'nr-foltest-medell': {
      id: 'nr-foltest-medell', faction: 'northern', name: 'Foltest', epithet: 'Son of Medell',
      ability: 'Ranged Execution', icon: 'i-bow',
      desc: 'Destroy the strongest non-hero unit on the opponent\'s ranged row, provided that row\'s current total is 10 or higher.',
      action: 'destroyRow', target: 'enemy', row: 'ranged', active: true
    },
    'nr-foltest-siegemaster': {
      id: 'nr-foltest-siegemaster', faction: 'northern', name: 'Foltest', epithet: 'The Siegemaster',
      ability: 'Siege Master', icon: 'i-catapult',
      desc: 'Double the strength of your siege row for this round, unless a Commander\'s Horn is already present there.',
      action: 'doubleRow', target: 'self', row: 'siege', active: true
    },
    'nr-foltest-steelforged': {
      id: 'nr-foltest-steelforged', faction: 'northern', name: 'Foltest', epithet: 'The Steel-Forged',
      ability: 'Siege Execution', icon: 'i-tower',
      desc: 'Destroy the strongest non-hero unit on the opponent\'s siege row, provided that row\'s current total is 10 or higher.',
      action: 'destroyRow', target: 'enemy', row: 'siege', active: true
    },

    'ng-emhyr-emperor': {
      id: 'ng-emhyr-emperor', faction: 'nilfgaard', name: 'Emhyr var Emreis', epithet: 'Emperor of Nilfgaard',
      ability: 'The Spider\'s Web', icon: 'i-eye',
      desc: 'Look at 3 random cards in your opponent\'s hand.',
      action: 'peekHand', active: true
    },
    'ng-emhyr-majesty': {
      id: 'ng-emhyr-majesty', faction: 'nilfgaard', name: 'Emhyr var Emreis', epithet: 'His Imperial Majesty',
      ability: 'Torrential Rain', icon: 'i-rain',
      desc: 'Play a Torrential Rain card from your deck. The downpour drowns both siege rows.',
      action: 'weather', weather: 'rain', active: true
    },
    'ng-emhyr-invader': {
      id: 'ng-emhyr-invader', faction: 'nilfgaard', name: 'Emhyr var Emreis', epithet: 'Invader of the North',
      ability: 'Sowing Chaos', icon: 'i-mask',
      desc: 'Passive: every restore and Medic effect targets a random card instead of a chosen one — for both players.',
      action: 'passive', passiveEffect: 'randomRevive', passive: true
    },
    'ng-emhyr-relentless': {
      id: 'ng-emhyr-relentless', faction: 'nilfgaard', name: 'Emhyr var Emreis', epithet: 'The Relentless',
      ability: 'Grave Robbery', icon: 'i-dagger',
      desc: 'Take one card from the opponent\'s discard pile and add it to your hand.',
      action: 'stealGrave', active: true
    },
    'ng-emhyr-whiteflame': {
      id: 'ng-emhyr-whiteflame', faction: 'nilfgaard', name: 'Emhyr var Emreis', epithet: 'The White Flame',
      ability: 'Leader\'s Shadow', icon: 'i-flame',
      desc: 'Cancel the opponent\'s unused leader ability. Passive leaders cannot be cancelled.',
      action: 'cancelLeader', active: true
    },

    'st-francesca-daisy': {
      id: 'st-francesca-daisy', faction: 'scoiatael', name: 'Francesca Findabair', epithet: 'Daisy of the Valley',
      ability: 'Daisy of the Valley', icon: 'i-leaf',
      desc: 'Passive: draw one extra card at the start of the match.',
      action: 'passive', passiveEffect: 'extraDraw', passive: true
    },
    'st-francesca-hope': {
      id: 'st-francesca-hope', faction: 'scoiatael', name: 'Francesca Findabair', epithet: 'Hope of the Aen Seidhe',
      ability: 'Hope of the Aen Seidhe', icon: 'i-star',
      desc: 'Move every agile unit on the battlefield to whichever row gives it the greater strength.',
      action: 'hope', active: true
    },
    'st-francesca-pureblood': {
      id: 'st-francesca-pureblood', faction: 'scoiatael', name: 'Francesca Findabair', epithet: 'Pureblood Elf',
      ability: 'Biting Frost', icon: 'i-snow',
      desc: 'Play a Biting Frost card from your deck. The cold grips both close combat rows.',
      action: 'weather', weather: 'frost', active: true
    },
    'st-francesca-queen': {
      id: 'st-francesca-queen', faction: 'scoiatael', name: 'Francesca Findabair', epithet: 'Queen of Dol Blathanna',
      ability: 'Queen\'s Judgement', icon: 'i-dagger',
      desc: 'Destroy the strongest non-hero unit on the opponent\'s close combat row, provided that row\'s current total is 10 or higher.',
      action: 'destroyRow', target: 'enemy', row: 'melee', active: true
    },
    'st-francesca-beautiful': {
      id: 'st-francesca-beautiful', faction: 'scoiatael', name: 'Francesca Findabair', epithet: 'The Beautiful',
      ability: 'Arrow Storm', icon: 'i-bow',
      desc: 'Double the strength of your ranged row for this round, unless a Commander\'s Horn is already present there.',
      action: 'doubleRow', target: 'self', row: 'ranged', active: true
    },

    'mo-eredin-treacherous': {
      id: 'mo-eredin-treacherous', faction: 'monsters', name: 'Eredin', epithet: 'The Treacherous',
      ability: 'Treacherous Whispers', icon: 'i-eye',
      desc: 'Double the strength of all Spy cards on the battlefield for this round — for both players.',
      action: 'doubleSpies', active: true
    },
    'mo-eredin-bringer': {
      id: 'mo-eredin-bringer', faction: 'monsters', name: 'Eredin', epithet: 'Bringer of Death',
      ability: 'Bringer of Death', icon: 'i-skull',
      desc: 'Take one card from your own discard pile and add it to your hand.',
      action: 'recoverGrave', active: true
    },
    'mo-eredin-redriders': {
      id: 'mo-eredin-redriders', faction: 'monsters', name: 'Eredin', epithet: 'Commander of the Red Riders',
      ability: 'Red Riders', icon: 'i-claw',
      desc: 'Double the strength of your close combat row for this round, unless a Commander\'s Horn is already present there.',
      action: 'doubleRow', target: 'self', row: 'melee', active: true
    },
    'mo-eredin-destroyer': {
      id: 'mo-eredin-destroyer', faction: 'monsters', name: 'Eredin', epithet: 'Destroyer of Worlds',
      ability: 'Destroyer of Worlds', icon: 'i-flame',
      desc: 'Discard 2 cards from your hand, then draw 1 card from your deck.',
      action: 'discardDraw', active: true
    },
    'mo-eredin-wildhunt': {
      id: 'mo-eredin-wildhunt', faction: 'monsters', name: 'Eredin', epithet: 'King of the Wild Hunt',
      ability: 'King of the Wild Hunt', icon: 'i-storm',
      desc: 'Play any weather card from your deck.',
      action: 'weatherChoose', active: true
    },

    'sk-crach': {
      id: 'sk-crach', faction: 'skellige', name: 'Crach an Craite', epithet: '',
      ability: 'Raid the Fallen', icon: 'i-ship',
      desc: 'Shuffle both players\' discard piles into their decks.',
      action: 'shuffleGraves', active: true
    },
    'sk-bran': {
      id: 'sk-bran', faction: 'skellige', name: 'King Bran', epithet: '',
      ability: 'Winter\'s Bite', icon: 'i-bear',
      desc: 'Passive: weather halves the strength of affected units, rounded up, instead of reducing it to 1. This affects both sides.',
      action: 'passive', passiveEffect: 'halfWeather', passive: true
    }
  };

  /* ------------------------------------------------------------------------
     Card definitions
     ------------------------------------------------------------------------ */

  Object.keys(G.LEADERS).forEach(function (id) {
    if (!G.LEADERS[id].art) G.LEADERS[id].art = 'assets/leaders/' + id + '.webp';
  });

  var CARD_DEFS = [
    /* ------------------------------------------------------------------
       Northern Realms
       ------------------------------------------------------------------ */
    { id: 'nr-ballista', faction: 'northern', name: 'Ballista', strength: 6, row: 'siege', icon: 'i-catapult' },
    { id: 'nr-blue-stripes-commando', faction: 'northern', name: 'Blue Stripes Commando', strength: 4, row: 'melee', abilities: ['tightBond'] },
    { id: 'nr-catapult', faction: 'northern', name: 'Catapult', strength: 8, row: 'siege', abilities: ['tightBond'], icon: 'i-catapult' },
    { id: 'nr-crinfrid-reavers', faction: 'northern', name: 'Crinfrid Reavers Dragon Hunter', strength: 5, row: 'ranged', abilities: ['tightBond'], icon: 'i-bow' },
    { id: 'nr-dethmold', faction: 'northern', name: 'Dethmold', strength: 6, row: 'ranged', icon: 'i-mask' },
    { id: 'nr-dun-banner-medic', faction: 'northern', name: 'Dun Banner Medic', strength: 5, row: 'siege', abilities: ['medic'], icon: 'i-cross' },
    { id: 'nr-esterad-thyssen', faction: 'northern', name: 'Esterad Thyssen', strength: 10, row: 'melee', hero: true, icon: 'i-shield' },
    { id: 'nr-john-natalis', faction: 'northern', name: 'John Natalis', strength: 10, row: 'melee', hero: true, icon: 'i-crown' },
    { id: 'nr-kaedweni-siege-expert', faction: 'northern', name: 'Kaedweni Siege Expert', strength: 1, row: 'siege', abilities: ['morale'], icon: 'i-hammer' },
    { id: 'nr-keira-metz', faction: 'northern', name: 'Keira Metz', strength: 5, row: 'ranged', icon: 'i-flame' },
    { id: 'nr-philippa-eilhart', faction: 'northern', name: 'Philippa Eilhart', strength: 10, row: 'ranged', hero: true, icon: 'i-eye' },
    { id: 'nr-poor-infantry', faction: 'northern', name: 'Poor Fucking Infantry', strength: 1, row: 'melee', abilities: ['tightBond'], icon: 'i-sword' },
    { id: 'nr-prince-stennis', faction: 'northern', name: 'Prince Stennis', strength: 5, row: 'melee', abilities: ['spy'], icon: 'i-dagger' },
    { id: 'nr-redanian-foot-soldier', faction: 'northern', name: 'Redanian Foot Soldier', strength: 1, row: 'melee', icon: 'i-sword' },
    { id: 'nr-sabrina-glevissig', faction: 'northern', name: 'Sabrina Glevissig', strength: 4, row: 'ranged', icon: 'i-flame' },
    { id: 'nr-sheldon-skaggs', faction: 'northern', name: 'Sheldon Skaggs', strength: 4, row: 'ranged', icon: 'i-hammer' },
    { id: 'nr-siege-tower', faction: 'northern', name: 'Siege Tower', strength: 6, row: 'siege', icon: 'i-tower' },
    { id: 'nr-siegfried', faction: 'northern', name: 'Siegfried of Denesle', strength: 5, row: 'melee', icon: 'i-shield' },
    { id: 'nr-dijkstra', faction: 'northern', name: 'Sigismund Dijkstra', strength: 4, row: 'melee', abilities: ['spy'], icon: 'i-coins' },
    { id: 'nr-sile', faction: 'northern', name: 'Síle de Tansarville', strength: 5, row: 'ranged', icon: 'i-star' },
    { id: 'nr-thaler', faction: 'northern', name: 'Thaler', strength: 1, row: 'siege', abilities: ['spy'], icon: 'i-coins' },
    { id: 'nr-trebuchet', faction: 'northern', name: 'Trebuchet', strength: 6, row: 'siege', icon: 'i-catapult' },
    { id: 'nr-vernon-roche', faction: 'northern', name: 'Vernon Roche', strength: 10, row: 'melee', hero: true, icon: 'i-sword' },
    { id: 'nr-ves', faction: 'northern', name: 'Ves', strength: 5, row: 'melee', icon: 'i-dagger' },
    { id: 'nr-yarpen-zigrin', faction: 'northern', name: 'Yarpen Zigrin', strength: 2, row: 'melee', icon: 'i-anvil' },

    /* ------------------------------------------------------------------
       Nilfgaardian Empire
       ------------------------------------------------------------------ */
    { id: 'ng-albrich', faction: 'nilfgaard', name: 'Albrich', strength: 2, row: 'ranged', icon: 'i-flame' },
    { id: 'ng-assire', faction: 'nilfgaard', name: 'Assire var Anahid', strength: 6, row: 'ranged', icon: 'i-mask' },
    { id: 'ng-black-infantry-archer', faction: 'nilfgaard', name: 'Black Infantry Archer', strength: 10, row: 'ranged', icon: 'i-bow' },
    { id: 'ng-cahir', faction: 'nilfgaard', name: 'Cahir', strength: 6, row: 'melee', icon: 'i-shield' },
    { id: 'ng-cynthia', faction: 'nilfgaard', name: 'Cynthia', strength: 4, row: 'ranged', icon: 'i-mask' },
    { id: 'ng-etolian-archers', faction: 'nilfgaard', name: 'Etolian Auxiliary Archers', strength: 1, row: 'ranged', abilities: ['medic'], icon: 'i-cross' },
    { id: 'ng-fringilla', faction: 'nilfgaard', name: 'Fringilla Vigo', strength: 6, row: 'ranged', icon: 'i-flame' },
    { id: 'ng-fire-scorpion', faction: 'nilfgaard', name: 'Heavy Zerrikanian Fire Scorpion', strength: 10, row: 'siege', icon: 'i-catapult' },
    { id: 'ng-impera-brigade', faction: 'nilfgaard', name: 'Impera Brigade Guard', strength: 3, row: 'melee', abilities: ['tightBond'], icon: 'i-shield' },
    { id: 'ng-letho', faction: 'nilfgaard', name: 'Letho', strength: 10, row: 'melee', hero: true, icon: 'i-sword' },
    { id: 'ng-menno', faction: 'nilfgaard', name: 'Menno Coehoorn', strength: 10, row: 'melee', hero: true, abilities: ['medic'], icon: 'i-cross' },
    { id: 'ng-morteisen', faction: 'nilfgaard', name: 'Morteisen', strength: 3, row: 'melee', icon: 'i-sword' },
    { id: 'ng-morvran', faction: 'nilfgaard', name: 'Morvran Voorhis', strength: 10, row: 'siege', hero: true, icon: 'i-tower' },
    { id: 'ng-nausicaa-cavalry', faction: 'nilfgaard', name: 'Nausicaa Cavalry Rider', strength: 2, row: 'melee', abilities: ['tightBond'], icon: 'i-horse' },
    { id: 'ng-puttkammer', faction: 'nilfgaard', name: 'Puttkammer', strength: 3, row: 'ranged', icon: 'i-bow' },
    { id: 'ng-rainfarn', faction: 'nilfgaard', name: 'Rainfarn', strength: 4, row: 'melee', icon: 'i-sword' },
    { id: 'ng-renuald', faction: 'nilfgaard', name: 'Renuald aep Matsen', strength: 5, row: 'ranged', icon: 'i-bow' },
    { id: 'ng-rotten-mangonel', faction: 'nilfgaard', name: 'Rotten Mangonel', strength: 3, row: 'siege', icon: 'i-catapult' },
    { id: 'ng-shilard', faction: 'nilfgaard', name: 'Shilard Fitz-Oesterlen', strength: 7, row: 'melee', abilities: ['spy'], icon: 'i-eye' },
    { id: 'ng-siege-engineer', faction: 'nilfgaard', name: 'Siege Engineer', strength: 6, row: 'siege', icon: 'i-hammer' },
    { id: 'ng-siege-technician', faction: 'nilfgaard', name: 'Siege Technician', strength: 0, row: 'siege', abilities: ['medic'], icon: 'i-cross' },
    { id: 'ng-stefan-skellen', faction: 'nilfgaard', name: 'Stefan Skellen', strength: 9, row: 'melee', abilities: ['spy'], icon: 'i-eye' },
    { id: 'ng-sweers', faction: 'nilfgaard', name: 'Sweers', strength: 2, row: 'ranged', icon: 'i-bow' },
    { id: 'ng-tibor', faction: 'nilfgaard', name: 'Tibor Eggebracht', strength: 10, row: 'ranged', hero: true, icon: 'i-bow' },
    { id: 'ng-vanhemar', faction: 'nilfgaard', name: 'Vanhemar', strength: 4, row: 'ranged', icon: 'i-bow' },
    { id: 'ng-vattier', faction: 'nilfgaard', name: 'Vattier de Rideaux', strength: 4, row: 'melee', abilities: ['spy'], icon: 'i-eye' },
    { id: 'ng-vreemde', faction: 'nilfgaard', name: 'Vreemde', strength: 2, row: 'melee', icon: 'i-sword' },
    { id: 'ng-young-emissary', faction: 'nilfgaard', name: 'Young Emissary', strength: 5, row: 'melee', abilities: ['tightBond'], icon: 'i-sword' },

    /* ------------------------------------------------------------------
       Scoia'tael
       ------------------------------------------------------------------ */
    { id: 'st-barclay-els', faction: 'scoiatael', name: 'Barclay Els', strength: 6, row: 'agile', icon: 'i-sword' },
    { id: 'st-ciaran', faction: 'scoiatael', name: 'Ciaran', strength: 3, row: 'agile', icon: 'i-dagger' },
    { id: 'st-dennis-cranmer', faction: 'scoiatael', name: 'Dennis Cranmer', strength: 6, row: 'melee', icon: 'i-shield' },
    { id: 'st-dol-blathanna-archer', faction: 'scoiatael', name: 'Dol Blathanna Archer', strength: 4, row: 'ranged', icon: 'i-bow' },
    { id: 'st-dol-blathanna-scout', faction: 'scoiatael', name: 'Dol Blathanna Scout', strength: 6, row: 'agile', icon: 'i-leaf' },
    { id: 'st-dwarven-skirmisher', faction: 'scoiatael', name: 'Dwarven Skirmisher', strength: 3, row: 'melee', abilities: ['muster'], icon: 'i-hammer' },
    { id: 'st-eithne', faction: 'scoiatael', name: 'Eithné', strength: 10, row: 'ranged', hero: true, icon: 'i-eye' },
    { id: 'st-elven-skirmisher', faction: 'scoiatael', name: 'Elven Skirmisher', strength: 2, row: 'ranged', abilities: ['muster'], icon: 'i-bow' },
    { id: 'st-filavandrel', faction: 'scoiatael', name: 'Filavandrel', strength: 6, row: 'agile', icon: 'i-leaf' },
    { id: 'st-havekar-healer', faction: 'scoiatael', name: 'Havekar Healer', strength: 0, row: 'ranged', abilities: ['medic'], icon: 'i-cross' },
    { id: 'st-havekar-smuggler', faction: 'scoiatael', name: 'Havekar Smuggler', strength: 5, row: 'melee', abilities: ['muster'], icon: 'i-coins' },
    { id: 'st-ida-emean', faction: 'scoiatael', name: 'Ida Emean', strength: 6, row: 'ranged', icon: 'i-star' },
    { id: 'st-iorveth', faction: 'scoiatael', name: 'Iorveth', strength: 10, row: 'ranged', hero: true, icon: 'i-bow' },
    { id: 'st-isengrim', faction: 'scoiatael', name: 'Isengrim', strength: 10, row: 'melee', hero: true, abilities: ['morale'], icon: 'i-sword' },
    { id: 'st-mahakaman-defender', faction: 'scoiatael', name: 'Mahakaman Defender', strength: 5, row: 'melee', icon: 'i-anvil' },
    { id: 'st-milva', faction: 'scoiatael', name: 'Milva', strength: 10, row: 'ranged', abilities: ['morale'], icon: 'i-bow' },
    { id: 'st-riordain', faction: 'scoiatael', name: 'Riordain', strength: 1, row: 'ranged', icon: 'i-bow' },
    { id: 'st-saesenthessis', faction: 'scoiatael', name: 'Saesenthessis', strength: 10, row: 'ranged', hero: true, icon: 'i-dragon' },
    { id: 'st-schirru', faction: 'scoiatael', name: 'Schirrú', strength: 8, row: 'siege', abilities: ['scorch'], scorch: 'row', icon: 'i-flame' },
    { id: 'st-toruviel', faction: 'scoiatael', name: 'Toruviel', strength: 2, row: 'ranged', icon: 'i-dagger' },
    { id: 'st-vrihedd-recruit', faction: 'scoiatael', name: 'Vrihedd Brigade Recruit', strength: 4, row: 'ranged', icon: 'i-bow' },
    { id: 'st-vrihedd-veteran', faction: 'scoiatael', name: 'Vrihedd Brigade Veteran', strength: 5, row: 'agile', icon: 'i-sword' },
    { id: 'st-yaevinn', faction: 'scoiatael', name: 'Yaevinn', strength: 6, row: 'agile', icon: 'i-leaf' },

    /* ------------------------------------------------------------------
       Monsters
       ------------------------------------------------------------------ */
    { id: 'mo-arachas', faction: 'monsters', name: 'Arachas', strength: 4, row: 'melee', abilities: ['muster'], musterGroup: 'arachas', icon: 'i-claw' },
    { id: 'mo-arachas-behemoth', faction: 'monsters', name: 'Arachas Behemoth', strength: 6, row: 'siege', abilities: ['muster'], musterGroup: 'arachas', icon: 'i-paw' },
    { id: 'mo-botchling', faction: 'monsters', name: 'Botchling', strength: 4, row: 'melee', icon: 'i-skull' },
    { id: 'mo-celaeno-harpy', faction: 'monsters', name: 'Celaeno Harpy', strength: 2, row: 'agile', icon: 'i-bat' },
    { id: 'mo-cockatrice', faction: 'monsters', name: 'Cockatrice', strength: 2, row: 'ranged', icon: 'i-bat' },
    { id: 'mo-brewess', faction: 'monsters', name: 'Brewess', strength: 6, row: 'melee', abilities: ['muster'], musterGroup: 'crones', icon: 'i-mask' },
    { id: 'mo-weavess', faction: 'monsters', name: 'Weavess', strength: 6, row: 'melee', abilities: ['muster'], musterGroup: 'crones', icon: 'i-eye' },
    { id: 'mo-whispess', faction: 'monsters', name: 'Whispess', strength: 6, row: 'melee', abilities: ['muster'], musterGroup: 'crones', icon: 'i-mask' },
    { id: 'mo-draug', faction: 'monsters', name: 'Draug', strength: 10, row: 'melee', hero: true, icon: 'i-skull' },
    { id: 'mo-earth-elemental', faction: 'monsters', name: 'Earth Elemental', strength: 6, row: 'siege', icon: 'i-bear' },
    { id: 'mo-endrega', faction: 'monsters', name: 'Endrega', strength: 2, row: 'ranged', icon: 'i-claw' },
    { id: 'mo-fiend', faction: 'monsters', name: 'Fiend', strength: 6, row: 'melee', icon: 'i-claw' },
    { id: 'mo-fire-elemental', faction: 'monsters', name: 'Fire Elemental', strength: 6, row: 'siege', icon: 'i-flame' },
    { id: 'mo-foglet', faction: 'monsters', name: 'Foglet', strength: 2, row: 'melee', icon: 'i-fog' },
    { id: 'mo-forktail', faction: 'monsters', name: 'Forktail', strength: 5, row: 'melee', icon: 'i-bat' },
    { id: 'mo-frightener', faction: 'monsters', name: 'Frightener', strength: 5, row: 'melee', icon: 'i-eye' },
    { id: 'mo-gargoyle', faction: 'monsters', name: 'Gargoyle', strength: 2, row: 'ranged', icon: 'i-bat' },
    { id: 'mo-ghoul', faction: 'monsters', name: 'Ghoul', strength: 1, row: 'melee', abilities: ['muster'], musterGroup: 'ghouls', icon: 'i-skull' },
    { id: 'mo-grave-hag', faction: 'monsters', name: 'Grave Hag', strength: 5, row: 'ranged', icon: 'i-mask' },
    { id: 'mo-griffin', faction: 'monsters', name: 'Griffin', strength: 5, row: 'melee', icon: 'i-claw' },
    { id: 'mo-harpy', faction: 'monsters', name: 'Harpy', strength: 2, row: 'agile', icon: 'i-bat' },
    { id: 'mo-ice-giant', faction: 'monsters', name: 'Ice Giant', strength: 5, row: 'siege', icon: 'i-bear' },
    { id: 'mo-imlerith', faction: 'monsters', name: 'Imlerith', strength: 10, row: 'melee', hero: true, icon: 'i-skull' },
    { id: 'mo-kayran', faction: 'monsters', name: 'Kayran', strength: 8, row: 'agile', hero: true, abilities: ['morale'], icon: 'i-paw' },
    { id: 'mo-leshen', faction: 'monsters', name: 'Leshen', strength: 10, row: 'ranged', hero: true, icon: 'i-paw' },
    { id: 'mo-nekker', faction: 'monsters', name: 'Nekker', strength: 2, row: 'melee', abilities: ['muster'], musterGroup: 'nekkers', icon: 'i-claw' },
    { id: 'mo-plague-maiden', faction: 'monsters', name: 'Plague Maiden', strength: 5, row: 'melee', icon: 'i-mask' },
    { id: 'mo-toad', faction: 'monsters', name: 'Toad', strength: 7, row: 'ranged', abilities: ['scorch'], scorch: 'row', icon: 'i-claw' },
    { id: 'mo-bruxa', faction: 'monsters', name: 'Bruxa', strength: 4, row: 'melee', abilities: ['muster'], musterGroup: 'vampires', icon: 'i-bat' },
    { id: 'mo-ekimmara', faction: 'monsters', name: 'Ekimmara', strength: 4, row: 'melee', abilities: ['muster'], musterGroup: 'vampires', icon: 'i-bat' },
    { id: 'mo-fleder', faction: 'monsters', name: 'Fleder', strength: 4, row: 'melee', abilities: ['muster'], musterGroup: 'vampires', icon: 'i-bat' },
    { id: 'mo-garkain', faction: 'monsters', name: 'Garkain', strength: 4, row: 'melee', abilities: ['muster'], musterGroup: 'vampires', icon: 'i-bat' },
    { id: 'mo-katakan', faction: 'monsters', name: 'Katakan', strength: 5, row: 'melee', abilities: ['muster'], musterGroup: 'vampires', icon: 'i-bat' },
    { id: 'mo-werewolf', faction: 'monsters', name: 'Werewolf', strength: 5, row: 'melee', icon: 'i-paw' },
    { id: 'mo-wyvern', faction: 'monsters', name: 'Wyvern', strength: 2, row: 'ranged', icon: 'i-bat' },

    /* ------------------------------------------------------------------
       Skellige
       ------------------------------------------------------------------ */
    { id: 'sk-berserker', faction: 'skellige', name: 'Berserker', strength: 4, row: 'melee', abilities: ['berserker'], transformInto: 'sk-vildkaarl', icon: 'i-claw' },
    { id: 'sk-young-berserker', faction: 'skellige', name: 'Young Berserker', strength: 2, row: 'ranged', abilities: ['berserker'], transformInto: 'sk-young-vildkaarl', icon: 'i-claw' },
    { id: 'sk-birna-bran', faction: 'skellige', name: 'Birna Bran', strength: 2, row: 'melee', abilities: ['medic'], icon: 'i-cross' },
    { id: 'sk-blueboy-lugos', faction: 'skellige', name: 'Blueboy Lugos', strength: 6, row: 'melee', icon: 'i-sword' },
    { id: 'sk-cerys', faction: 'skellige', name: 'Cerys', strength: 10, row: 'melee', hero: true, abilities: ['summon'], summonName: 'Clan Drummond Shield Maiden', icon: 'i-shield' },
    { id: 'sk-brokvar-archer', faction: 'skellige', name: 'Clan Brokvar Archer', strength: 6, row: 'ranged', icon: 'i-bow' },
    { id: 'sk-dimun-pirate', faction: 'skellige', name: 'Clan Dimun Pirate', strength: 6, row: 'ranged', abilities: ['scorch'], scorch: 'global', icon: 'i-flame' },
    { id: 'sk-shield-maiden', faction: 'skellige', name: 'Clan Drummond Shield Maiden', strength: 4, row: 'melee', abilities: ['tightBond'], icon: 'i-shield' },
    { id: 'sk-heymaey-skald', faction: 'skellige', name: 'Clan Heymaey Skald', strength: 4, row: 'melee', icon: 'i-lute' },
    { id: 'sk-tordarroch-armorsmith', faction: 'skellige', name: 'Clan Tordarroch Armorsmith', strength: 4, row: 'melee', icon: 'i-anvil' },
    { id: 'sk-an-craite-warrior', faction: 'skellige', name: 'Clan an Craite Warrior', strength: 6, row: 'melee', abilities: ['tightBond'], icon: 'i-sword' },
    { id: 'sk-donar-an-hindar', faction: 'skellige', name: 'Donar an Hindar', strength: 4, row: 'melee', icon: 'i-sword' },
    { id: 'sk-draig-bon-dhu', faction: 'skellige', name: 'Draig Bon-Dhu', strength: 2, row: 'siege', abilities: ['horn'], icon: 'i-horn' },
    { id: 'sk-ermion', faction: 'skellige', name: 'Ermion', strength: 8, row: 'ranged', hero: true, abilities: ['mardroeme'], icon: 'i-mask' },
    { id: 'sk-hjalmar', faction: 'skellige', name: 'Hjalmar', strength: 10, row: 'ranged', hero: true, icon: 'i-bow' },
    { id: 'sk-holger-blackhand', faction: 'skellige', name: 'Holger Blackhand', strength: 4, row: 'siege', icon: 'i-hammer' },
    { id: 'sk-kambi', faction: 'skellige', name: 'Kambi', strength: 0, row: 'melee', abilities: ['avenger'], summonToken: 'sk-hemdall', icon: 'i-skull' },
    { id: 'sk-light-longship', faction: 'skellige', name: 'Light Longship', strength: 4, row: 'ranged', abilities: ['muster'], musterGroup: 'longships', icon: 'i-ship' },
    { id: 'sk-madman-lugos', faction: 'skellige', name: 'Madman Lugos', strength: 6, row: 'melee', icon: 'i-sword' },
    { id: 'sk-olaf', faction: 'skellige', name: 'Olaf', strength: 12, row: 'agile', abilities: ['morale'], icon: 'i-bear' },
    { id: 'sk-svanrige', faction: 'skellige', name: 'Svanrige', strength: 4, row: 'melee', icon: 'i-sword' },
    { id: 'sk-udalryk', faction: 'skellige', name: 'Udalryk', strength: 4, row: 'melee', icon: 'i-sword' },
    { id: 'sk-war-longship', faction: 'skellige', name: 'War Longship', strength: 6, row: 'siege', abilities: ['tightBond'], icon: 'i-ship' },

    /* ------------------------------------------------------------------
       Neutral
       ------------------------------------------------------------------ */
    { id: 'nt-geralt', faction: 'neutral', name: 'Geralt of Rivia', strength: 15, row: 'melee', hero: true, icon: 'i-wolf' },
    { id: 'nt-ciri', faction: 'neutral', name: 'Ciri', strength: 15, row: 'melee', hero: true, icon: 'i-star' },
    { id: 'nt-triss', faction: 'neutral', name: 'Triss Merigold', strength: 7, row: 'melee', hero: true, icon: 'i-flame' },
    { id: 'nt-yennefer', faction: 'neutral', name: 'Yennefer of Vengerberg', strength: 7, row: 'ranged', hero: true, abilities: ['medic'], icon: 'i-eye' },
    { id: 'nt-vesemir', faction: 'neutral', name: 'Vesemir', strength: 6, row: 'melee', icon: 'i-sword' },
    { id: 'nt-zoltan', faction: 'neutral', name: 'Zoltan Chivay', strength: 5, row: 'melee', icon: 'i-hammer' },
    { id: 'nt-regis', faction: 'neutral', name: 'Emiel Regis', strength: 5, row: 'melee', icon: 'i-bat' },
    { id: 'nt-roach', faction: 'neutral', name: 'Roach', strength: 3, row: 'melee', icon: 'i-horse' },
    { id: 'nt-olgierd', faction: 'neutral', name: 'Olgierd von Everec', strength: 6, row: 'agile', abilities: ['morale'], icon: 'i-dagger' },
    { id: 'nt-dandelion', faction: 'neutral', name: 'Dandelion', strength: 2, row: 'melee', abilities: ['horn'], icon: 'i-lute' },
    { id: 'nt-gaunter', faction: 'neutral', name: 'Gaunter O\'Dimm', strength: 2, row: 'siege', abilities: ['muster'], musterGroup: 'gaunter', icon: 'i-mask' },
    { id: 'nt-gaunter-darkness', faction: 'neutral', name: 'Gaunter: Darkness', strength: 4, row: 'ranged', abilities: ['muster'], musterGroup: 'gaunter', icon: 'i-eye' },
    { id: 'nt-cow', faction: 'neutral', name: 'Cow', strength: 0, row: 'ranged', abilities: ['avenger'], summonToken: 'nt-bovine', icon: 'i-bear' },
    { id: 'nt-mysterious-elf', faction: 'neutral', name: 'Mysterious Elf', strength: 0, row: 'melee', hero: true, abilities: ['spy'], icon: 'i-hood' },
    { id: 'nt-villentretenmerth', faction: 'neutral', name: 'Villentretenmerth', strength: 7, row: 'melee', abilities: ['scorch'], scorch: 'row', icon: 'i-dragon' },

    /* Specials ---------------------------------------------------------- */
    { id: 'nt-scorch', faction: 'neutral', name: 'Scorch', special: 'scorch', icon: 'i-flame' },
    { id: 'nt-decoy', faction: 'neutral', name: 'Decoy', special: 'decoy', icon: 'i-mask' },
    { id: 'nt-horn', faction: 'neutral', name: 'Commander\'s Horn', special: 'horn', icon: 'i-horn' },
    { id: 'nt-mardroeme', faction: 'neutral', name: 'Mardroeme', special: 'mardroeme', icon: 'i-mushroom' },
    { id: 'nt-frost', faction: 'neutral', name: 'Biting Frost', special: 'frost', weather: 'frost', icon: 'i-snow' },
    { id: 'nt-fog', faction: 'neutral', name: 'Impenetrable Fog', special: 'fog', weather: 'fog', icon: 'i-fog' },
    { id: 'nt-rain', faction: 'neutral', name: 'Torrential Rain', special: 'rain', weather: 'rain', icon: 'i-rain' },
    { id: 'nt-clear', faction: 'neutral', name: 'Clear Weather', special: 'clear', icon: 'i-sun' },
    { id: 'nt-storm', faction: 'neutral', name: 'Skellige Storm', special: 'storm', weather: 'storm', icon: 'i-storm' },

    /* Tokens and transformed cards -------------------------------------- */
    { id: 'nt-bovine', faction: 'neutral', name: 'Bovine Defense Force', strength: 8, row: 'ranged', token: true, icon: 'i-bear' },
    { id: 'sk-hemdall', faction: 'skellige', name: 'Hemdall', strength: 11, row: 'melee', hero: true, token: true, icon: 'i-shield' },
    { id: 'sk-vildkaarl', faction: 'skellige', name: 'Vildkaarl', strength: 14, row: 'melee', transformed: true, abilities: ['morale'], icon: 'i-claw' },
    { id: 'sk-young-vildkaarl', faction: 'skellige', name: 'Young Vildkaarl', strength: 8, row: 'ranged', transformed: true, abilities: ['tightBond'], icon: 'i-claw' }
  ];

  /* ------------------------------------------------------------------------
     Card construction and lookup helpers
     ------------------------------------------------------------------------ */

  var FACTION_ICON = {
    northern: 'i-crown',
    nilfgaard: 'i-sun',
    scoiatael: 'i-leaf',
    monsters: 'i-skull',
    skellige: 'i-ship',
    neutral: 'i-wolf'
  };

  var FACTION_ROW_ICON = {
    northern: { melee: 'i-sword', ranged: 'i-bow', siege: 'i-catapult', agile: 'i-horse' },
    nilfgaard: { melee: 'i-sword', ranged: 'i-bow', siege: 'i-tower', agile: 'i-horse' },
    scoiatael: { melee: 'i-dagger', ranged: 'i-bow', siege: 'i-catapult', agile: 'i-horse' },
    monsters: { melee: 'i-claw', ranged: 'i-bat', siege: 'i-skull', agile: 'i-paw' },
    skellige: { melee: 'i-sword', ranged: 'i-bow', siege: 'i-ship', agile: 'i-ship' },
    neutral: { melee: 'i-sword', ranged: 'i-bow', siege: 'i-catapult', agile: 'i-horse' }
  };

  var SPECIAL_ICON = {
    scorch: 'i-flame',
    horn: 'i-horn',
    decoy: 'i-mask',
    mardroeme: 'i-mushroom',
    clear: 'i-sun',
    frost: 'i-snow',
    fog: 'i-fog',
    rain: 'i-rain',
    storm: 'i-storm'
  };

  function unique(list) {
    return list.filter(function (item, index) { return list.indexOf(item) === index; });
  }

  function defineCards(defs) {
    var cards = {};
    defs.forEach(function (def) {
      var card = Object.assign({
        faction: 'neutral',
        strength: 0,
        row: null,
        hero: false,
        special: false,
        token: false,
        transformed: false,
        abilities: [],
        icon: null
      }, def);
      card.abilities = unique(card.abilities || []);
      if (card.row === 'agile' && card.abilities.indexOf('agile') === -1) {
        card.abilities.push('agile');
      }
      if (!card.icon) {
        if (card.special) {
          card.icon = SPECIAL_ICON[card.special] || FACTION_ICON[card.faction] || 'i-star';
        } else if (card.hero) {
          card.icon = FACTION_ICON[card.faction] || 'i-crown';
        } else {
          card.icon = (FACTION_ROW_ICON[card.faction] || FACTION_ROW_ICON.neutral)[card.row] || FACTION_ICON[card.faction] || 'i-star';
        }
      }
      card.isUnit = !card.special;
      if (!card.art) card.art = 'assets/cards/' + card.id + '.webp';
      cards[card.id] = card;
    });
    return cards;
  }

  function defineDecks(deckMap) {
    var decks = {};
    Object.keys(deckMap).forEach(function (faction) {
      decks[faction] = deckMap[faction].slice();
    });
    return decks;
  }

  /* ------------------------------------------------------------------------
     Preset tournament decks
     ------------------------------------------------------------------------ */

  var PRESET_DECKS = {
    northern: [
      'nr-ballista', 'nr-ballista',
      'nr-blue-stripes-commando', 'nr-blue-stripes-commando', 'nr-blue-stripes-commando',
      'nr-catapult', 'nr-catapult',
      'nr-crinfrid-reavers', 'nr-crinfrid-reavers',
      'nr-dun-banner-medic',
      'nr-esterad-thyssen',
      'nr-john-natalis',
      'nr-kaedweni-siege-expert',
      'nr-philippa-eilhart',
      'nr-poor-infantry', 'nr-poor-infantry',
      'nr-prince-stennis',
      'nr-redanian-foot-soldier',
      'nr-siege-tower',
      'nr-trebuchet', 'nr-trebuchet',
      'nr-vernon-roche',
      'nr-ves',
      'nr-yarpen-zigrin',
      'nt-geralt',
      'nt-yennefer',
      'nt-dandelion',
      'nt-olgierd',
      'nt-scorch',
      'nt-decoy',
      'nt-horn',
      'nt-fog',
      'nt-clear'
    ],
    nilfgaard: [
      'ng-assire',
      'ng-black-infantry-archer',
      'ng-cahir',
      'ng-etolian-archers',
      'ng-fringilla',
      'ng-fire-scorpion',
      'ng-impera-brigade', 'ng-impera-brigade',
      'ng-letho',
      'ng-menno',
      'ng-morteisen', 'ng-morteisen',
      'ng-morvran',
      'ng-nausicaa-cavalry', 'ng-nausicaa-cavalry',
      'ng-rainfarn',
      'ng-renuald',
      'ng-shilard',
      'ng-siege-technician',
      'ng-stefan-skellen',
      'ng-tibor',
      'ng-vanhemar',
      'ng-vattier',
      'ng-young-emissary', 'ng-young-emissary',
      'nt-ciri',
      'nt-triss',
      'nt-vesemir',
      'nt-gaunter',
      'nt-gaunter-darkness',
      'nt-scorch',
      'nt-decoy',
      'nt-horn',
      'nt-rain',
      'nt-clear'
    ],
    scoiatael: [
      'st-barclay-els',
      'st-ciaran',
      'st-dennis-cranmer',
      'st-dol-blathanna-archer', 'st-dol-blathanna-archer',
      'st-dol-blathanna-scout',
      'st-dwarven-skirmisher', 'st-dwarven-skirmisher', 'st-dwarven-skirmisher',
      'st-eithne',
      'st-elven-skirmisher', 'st-elven-skirmisher', 'st-elven-skirmisher',
      'st-filavandrel',
      'st-havekar-healer',
      'st-havekar-smuggler', 'st-havekar-smuggler',
      'st-ida-emean',
      'st-iorveth',
      'st-isengrim',
      'st-mahakaman-defender',
      'st-milva',
      'st-schirru',
      'st-vrihedd-recruit', 'st-vrihedd-recruit',
      'st-vrihedd-veteran',
      'st-yaevinn',
      'nt-yennefer',
      'nt-dandelion',
      'nt-olgierd',
      'nt-scorch',
      'nt-decoy',
      'nt-horn',
      'nt-frost',
      'nt-clear'
    ],
    monsters: [
      'mo-arachas', 'mo-arachas',
      'mo-arachas-behemoth', 'mo-arachas-behemoth',
      'mo-brewess', 'mo-weavess', 'mo-whispess',
      'mo-bruxa', 'mo-ekimmara', 'mo-fleder', 'mo-garkain', 'mo-katakan',
      'mo-ghoul',
      'mo-nekker', 'mo-nekker',
      'mo-toad',
      'mo-grave-hag',
      'mo-fiend',
      'mo-griffin',
      'mo-earth-elemental',
      'mo-fire-elemental',
      'mo-draug',
      'mo-imlerith',
      'mo-kayran',
      'mo-leshen',
      'nt-scorch',
      'nt-decoy',
      'nt-horn',
      'nt-mardroeme',
      'nt-frost',
      'nt-fog',
      'nt-rain',
      'nt-storm',
      'nt-clear'
    ],
    skellige: [
      'sk-berserker', 'sk-berserker',
      'sk-young-berserker', 'sk-young-berserker',
      'sk-birna-bran',
      'sk-blueboy-lugos',
      'sk-cerys',
      'sk-brokvar-archer', 'sk-brokvar-archer',
      'sk-dimun-pirate',
      'sk-shield-maiden', 'sk-shield-maiden', 'sk-shield-maiden',
      'sk-heymaey-skald',
      'sk-tordarroch-armorsmith',
      'sk-an-craite-warrior', 'sk-an-craite-warrior',
      'sk-donar-an-hindar',
      'sk-draig-bon-dhu',
      'sk-ermion',
      'sk-hjalmar',
      'sk-holger-blackhand',
      'sk-kambi',
      'sk-light-longship',
      'sk-madman-lugos',
      'sk-olaf',
      'sk-svanrige',
      'sk-war-longship',
      'nt-geralt',
      'nt-regis',
      'nt-dandelion',
      'nt-scorch',
      'nt-decoy',
      'nt-horn',
      'nt-mardroeme',
      'nt-clear'
    ]
  };

  /* ------------------------------------------------------------------------
     Public surface
     ------------------------------------------------------------------------ */

  G.CARDS = defineCards(CARD_DEFS);
  G.CARD_LIST = Object.keys(G.CARDS).map(function (id) { return G.CARDS[id]; });
  G.PRESET_DECKS = defineDecks(PRESET_DECKS);
  G._defineCards = defineCards;
  G._defineDecks = defineDecks;
  G._cardDefs = CARD_DEFS;
  G._FACTION_ICON = FACTION_ICON;

  G.getCard = function (id) {
    return G.CARDS[id] || null;
  };

  G.getLeader = function (id) {
    return G.LEADERS[id] || null;
  };

  G.getFaction = function (id) {
    return G.FACTIONS[id] || null;
  };

  G.leadersFor = function (faction) {
    var data = G.FACTIONS[faction];
    if (!data) return [];
    return data.leaderIds.map(function (id) { return G.LEADERS[id]; }).filter(Boolean);
  };

  G.deckFor = function (faction) {
    return (G.PRESET_DECKS[faction] || []).slice();
  };

  G.defaultLeaderFor = function (faction) {
    var leaders = G.leadersFor(faction);
    return leaders.length ? leaders[0].id : null;
  };

  G.isWeatherCard = function (card) {
    return !!(card && card.special && G.WEATHER[card.special]);
  };

  G.isSpecialCard = function (card) {
    return !!(card && card.special);
  };

  G.abilitiesOf = function (card) {
    if (!card) return [];
    return (card.abilities || []).map(function (id) { return G.ABILITIES[id]; }).filter(Boolean);
  };

  G.rowIcon = function (card) {
    if (!card) return 'i-star';
    if (card.special) return card.icon || 'i-star';
    if (card.row === 'agile') return 'i-horse';
    return (G.ROWS[card.row] || G.ROWS.melee).icon;
  };

  G.rowName = function (card) {
    if (!card) return '';
    if (card.row === 'agile') return 'Agile — Close or Ranged';
    return (G.ROWS[card.row] || {}).name || 'Special';
  };

  G.deckStats = function (ids) {
    var stats = {
      total: 0, units: 0, specials: 0, heroes: 0, weather: 0,
      rows: { melee: 0, ranged: 0, siege: 0, agile: 0 },
      rowBars: { melee: 0, ranged: 0, siege: 0 },
      names: []
    };
    (ids || []).forEach(function (id) {
      var card = G.CARDS[id];
      if (!card) return;
      stats.total += 1;
      stats.names.push(card.name);
      if (card.special) {
        stats.specials += 1;
        if (G.isWeatherCard(card)) stats.weather += 1;
        return;
      }
      stats.units += 1;
      if (card.hero) stats.heroes += 1;
      if (card.row === 'agile') {
        stats.rows.agile += 1;
        stats.rowBars.melee += 0.5;
        stats.rowBars.ranged += 0.5;
      } else if (stats.rows[card.row] !== undefined) {
        stats.rows[card.row] += 1;
        stats.rowBars[card.row] += 1;
      }
    });
    return stats;
  };

  G.uniqueCount = function (ids) {
    var seen = Object.create(null);
    var count = 0;
    (ids || []).forEach(function (id) {
      if (!seen[id]) { seen[id] = true; count += 1; }
    });
    return count;
  };

  G.cardsByName = (function () {
    var map = {};
    Object.keys(G.CARDS).forEach(function (id) {
      var name = G.CARDS[id].name;
      if (!map[name]) map[name] = [];
      map[name].push(G.CARDS[id]);
    });
    return map;
  })();

  G.cardsInMusterGroup = function (group, name) {
    return G.CARD_LIST.filter(function (card) {
      if (!card || card.token) return false;
      if (name && card.name === name) return true;
      return group && card.musterGroup === group;
    });
  };
})();
