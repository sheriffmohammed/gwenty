# Gwent — A Witcher's Card Game

A faithful, dependency-free browser recreation of the Gwent tavern game from *The Witcher 3: Wild Hunt*. Five factions, 22 commanders, 158 collectible cards, full card abilities, faction passives, weather, leader powers, and an AI opponent that plays the board instead of peeking at your hand.

Everything is plain HTML, CSS and JavaScript. There is no build step, package manager, or framework. All 162 card artworks and 22 commander portraits are bundled locally, so the game and its art work fully offline.

## Run it

Open `index.html` directly in a modern browser, or serve the folder with any static file server:

```powershell
# from D:\codes\gwent
python -m http.server 8000
# then visit http://localhost:8000
```

Google Fonts are loaded when online; the game falls back to local serif and condensed fonts when offline. Card visuals and sound are fully local, and cards fall back to the original SVG/CSS art if an image cannot be loaded.

## How to play

- **Choose a banner.** Pick a faction and one of its commanders. The opponent's faction and leader are drawn from the other four banners.
- **The coin decides the opening.** Scoia'tael may choose who starts instead; if both sides are Scoia'tael, the coin is used.
- **Mulligan.** Both sides draw ten cards. You may once redraw up to two cards, then lock your hand.
- **Play a round.** On your turn, play one card or pass. Click a card in hand to select it, then click a highlighted row, a valid unit, or the **Play card** button. Once you pass, you cannot play again that round.
- **Win two rounds.** Each commander starts with two gems. The loser of a round loses a gem; the match ends when a side has no gems or after three rounds.

### The table rules

- A normal tie costs both commanders a gem. Nilfgaard wins tied rounds instead.
- The winner of a round opens the next one. After a tie, the other commander opens.
- There are no ordinary card draws between rounds; the opening hand and mulligan are your pool for the match.
- Weather affects both sides and is **cleared at the end of every round**; the weather cards go to their owners' discard piles. Commander's Horns, Mardroeme and leader row effects are also cleared at round end.
- Strength is calculated in this order: **weather → Tight Bond → Morale → doubling**. A row can hold only one doubling effect.
- Heroes are immune to weather, Scorch, Decoy, Commander's Horn and Morale, and cannot be revived. A hero's Morale still buffs other units, and a hero Medic still deploys.
- Agile units choose close combat or ranged when deployed. Spies count for the opponent. Medics revive a unit from the discard pile. Decoys return a friendly non-hero unit to hand. Mardroeme transforms every Berserker on its row.
- A unit's Scorch burns its matching enemy row, and only when that row totals 10 or more.

The in-game **How to play** panel contains the full rules, ability glossary and faction passives. **The cards** opens the complete collection with faction, special and hero filters.

## The five banners

| Faction | Passive | Deck |
| --- | --- | --- |
| Northern Realms | **Northern Resolve** — draw a card after winning a round. | Banners of the North |
| Nilfgaardian Empire | **Imperial Supremacy** — win any round that ends in a tie. | Glory of the Great Sun |
| Scoia'tael | **Aen Seidhe** — choose who makes the first move. | Whispers of the Wood |
| Monsters | **Monstrous Brood** — keep one random non-hero unit on the battlefield after a round. | Terrors of the Dark |
| Skellige | **Isles Remember** — at the start of round 3, return two random non-hero units from the discard pile to the battlefield. | Storm and Salt |

Each faction has five commanders, except Skellige, which has two. Leader abilities include weather, row destruction, row doubling, hand peeking, grave theft, revival, discarding, spy support and passive effects. A commander ability can be used once per match unless it is marked passive.

## The opponent

The AI uses a different faction from you and evaluates only visible information: its own hand, both battlefields, weather, row totals, grave piles and spent leaders. It plans mulligans, values weather and clears, holds removal and Horns for profitable rows, considers Decoy and Mardroeme, and passes when a round is no longer worth contesting. It does not inspect your hand.

## The table

The battlefield is a warm wood-and-leather tabletop: carved row rails, brass row seals, a leather hand tray, and subdued grain that keeps card art and numbers legible. Deck and discard counts sit beside their piles, round gems and commander medallions frame each HUD, and each side's round total is placed consistently. The whole table — six rows, both HUDs and your hand — fits without page scrolling from wide desktop down to small portrait phones.

Cards are staged rather than teleported. Selecting a card lifts it from the hand; playing it arcs face-up to its row, and the impact puff lands before scores resolve. Scores count up from their previous values, weather veils only the affected rows, Commander's Horn sends a gold wave down its row, Scorch marks its targets before they burn away, Decoy lifts a unit and returns it to hand, and draws fly as card backs before revealing. Turn changes raise a centered faction banner while the board quiets for a beat, passing stamps the HUD and quiets the passed hand, and round and match results arrive as their own banners once the last effect settles. Effects stay localized and deliberately unequal: ordinary units get a short landing, while tide-turning abilities earn longer, brighter resolutions.

Hover or focus a hand card for a large preview with its artwork, power, row and full ability text. Keyboard hand navigation uses the same lift, shadow and preview. The table respects `prefers-reduced-motion`: travel and banners shorten, screen shake and large flashes are removed, and every state change remains explicit.

## Controls

| Action | Input |
| --- | --- |
| Select a card | Click / tap it in hand |
| Preview a card | Hover or focus it in hand |
| Navigate the hand | `←` / `→` and `Home` / `End` while a hand card is focused |
| Deploy to a row | Click a highlighted row |
| Play a non-targeted card | Click **Play card** |
| Choose a Decoy target | Click a highlighted friendly unit |
| Pass | Click the **Pass** seal |
| Lock mulligan | Click **Lock hand** |
| Open menu | Menu button in the top-left |
| Rules / collection / chronicle | Buttons on the title, setup and table |
| Inspect a pile | Click the deck, hand or discard counter in either HUD |
| View a commander | Click the leader medallion in either HUD |
| Toggle sound | Speaker button in the top-right |
| Close a dialog | `Escape`, the close button, or **Close** |

Dialogs trap keyboard focus while open and return focus when closed. Hand cards, targetable units and controls are keyboard-reachable; `Tab` and `Shift+Tab` cycle through dialog actions.

The layout adapts from wide desktop tables down to small portrait phones. On narrow screens the hand can be swiped sideways, while the current action seals remain fixed over its right edge.

## Sound

The game synthesizes its tavern sounds with the Web Audio API, so it needs no
audio files and works offline. You can optionally replace them with your own
recordings: put MP3 files named after the events (`play.mp3`, `deal.mp3`,
`weather.mp3`, and so on) into `assets/audio/`. See
[`assets/audio/README.md`](assets/audio/README.md) for the full list and rules.
Missing files automatically fall back to the synthesized sounds. No
copyrighted Witcher audio is bundled.

## Project layout

```
index.html            App shell, screens, overlays and inline SVG icon sprite
styles/
  tokens.css          Design tokens, fonts, global reset
  table.css           Table, HUD, rows, weather, hand and responsive layout
  cards.css           Card frames, art, badges and card states
  screens.css         Title and faction-selection screens
  overlays.css        Modals, coin, round and game-over overlays
  animations.css      Keyframes and motion
  tabletop.css        Wood-and-leather table, preview, FX and staged banners
js/
  data.js             Cards, abilities, factions, leaders, preset decks
  engine.js           Rules engine: turns, deployment, scoring, rounds
  ai.js               Move generation, hand evaluation and opponent decisions
  ui.js               Rendering, interaction, modals, sound and responsive UI
  tabletop.js         Hand preview, staged movement, effects and score reveals
  app.js              Match orchestration, timers and screen flow
assets/
  cards/              162 card artworks (WebP) and manifest.json
  leaders/            22 commander portraits (WebP)
  audio/              Optional user-supplied sound pack (see its README)
README.md
```

The scripts are classic namespaced scripts loaded in order: `data.js` → `engine.js` → `ai.js` → `ui.js` → `tabletop.js` → `app.js`. The shared namespace is `window.GWENT`.

Card art is not a gameplay dependency: if a file is missing or fails to load, the card keeps its SVG icon, faction gradient and engraved pattern.

## Credits

This is an unofficial, non-commercial fan tribute. *Gwent*, *The Witcher*, all card names, characters and lore belong to CD PROJEKT RED. Card and commander artwork is © CD PROJEKT RED and was sourced from [The Witcher Wiki](https://witcher.fandom.com/) for this fan project; see `assets/cards/manifest.json` for source pages. All code and the fallback SVG/CSS artwork are original to this project.
