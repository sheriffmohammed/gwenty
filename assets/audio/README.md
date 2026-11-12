# Optional Gwent sound pack

The game ships with synthesized Web Audio sounds and works with no audio files
at all. If you own Gwent recordings that you are allowed to use, drop MP3 files
into this folder to replace the synthesized effects. Missing files fall back to
the synthesized versions automatically.

## Naming convention

Use these exact file names (lowercase, `.mp3`):

| File | Played when |
|---|---|
| `click.mp3` | A button or interface control is pressed |
| `select.mp3` | A card is selected |
| `play.mp3` | A unit is deployed to a row |
| `deal.mp3` | Cards are dealt, drawn or summoned |
| `shuffle.mp3` | The deck is shuffled |
| `coin.mp3` | The coin is tossed |
| `coinLand.mp3` | The coin lands |
| `pass.mp3` | A player passes the round |
| `weather.mp3` | A weather card is played or the skies change |
| `leader.mp3` | A commander ability is used |
| `horn.mp3` | Commander's Horn is played |
| `mardroeme.mp3` | Mardroeme is played |
| `destroy.mp3` | A unit is destroyed or removed |
| `error.mp3` | An illegal action is attempted |
| `round.mp3` | A round begins or ends |
| `victory.mp3` | The player wins the match |
| `defeat.mp3` | The player loses the match |

## Notes

- Keep files short (usually under 3 seconds) and normalize them to a similar
  volume. The game plays pack sounds at 72% volume.
- Mono or stereo MP3 is fine; modern browsers decode both.
- Sound can be muted with the speaker button in the top bar. The setting is
  remembered in `localStorage`.
- Do not commit or redistribute audio you do not have the rights to use. The
  game is intentionally shipped without any copyrighted Witcher audio.
- The page must be reloaded after adding or replacing files.
