# Chord Atlas — Static Guitar Chord & Lyrics Site

A fully static, JSON-driven guitar chord and lyrics library. No server, no database, no build step.

---

## Project Structure

```
chordsite/
├── index.html          ← Main page (hero + song cards + detail panel)
├── css/
│   └── style.css       ← All styles (dark theme, responsive)
├── js/
│   └── app.js          ← Song loading, filtering, detail panel, audio
├── data/
│   └── songs.json      ← ⭐ All song data lives here
├── images/
│   └── *.jpg / *.png   ← Cover images (referenced in songs.json)
├── audio/
│   └── *.mp3           ← Audio demo files (referenced in songs.json)
└── README.md
```

---

## How to Add a Song

Open `data/songs.json` and add a new object inside the `"songs": [ ... ]` array.

### Song Object Structure

```json
{
  "id": "unique-song-id",
  "title": "Song Title",
  "artist": "Artist Name",
  "genre": "Rock",
  "difficulty": "Beginner",
  "key": "G",
  "bpm": 120,
  "description": "Short description shown on the card.",
  "coverImage": "images/my-cover.jpg",
  "sections": [ ... ]
}
```

**difficulty** options: `Beginner` | `Intermediate` | `Advanced`

---

## Section Types

Each song has a `sections` array. You can mix and repeat any type in any order.

### Text Section
```json
{
  "type": "text",
  "heading": "About This Song",
  "content": "Plain paragraph text here."
}
```

### Chords Section
```json
{
  "type": "chords",
  "heading": "Chords Used",
  "content": "G | D | Em | C\n\nAdditional notes about the chords."
}
```
Chord names like `G`, `Am`, `F#m`, `Dsus4` are automatically highlighted.

### Lyrics Section
```json
{
  "type": "lyrics",
  "heading": "Verse 1",
  "content": "[G]Words of the [D]verse\n[Em]More lyrics [C]here"
}
```
Chord markers `[G]` `[Am]` etc. are highlighted in gold automatically.

### Audio Section
```json
{
  "type": "audio",
  "heading": "Demo Track – Verse",
  "description": "Strummed arrangement at 120 BPM.",
  "src": "audio/my-song-demo.mp3"
}
```
You can add **multiple audio sections** per song (e.g. verse, chorus, solo).

### Image Section
```json
{
  "type": "image",
  "heading": "Chord Diagram",
  "caption": "Optional caption text.",
  "src": "images/chord-diagram.png"
}
```

---

## Cover Images

Place `.jpg` or `.png` files in the `images/` folder. Reference them in the song's `"coverImage"` field.

If an image is missing or fails to load, the card displays the song's key as a placeholder symbol automatically.

---

## Audio Files

Place `.mp3` files in the `audio/` folder. If an audio file is missing, the player shows a notice instead of breaking.

---

## Filters

Genre and difficulty filters are generated **automatically** from the songs in `songs.json`. No code changes needed — add a new genre or difficulty and the filter button appears.

---

## Running Locally

Because `songs.json` is loaded via `fetch()`, you need a local HTTP server (browsers block `file://` fetch requests):

```bash
# Python 3
python3 -m http.server 8080

# Node (npx)
npx serve .
```

Then open: `http://localhost:8080`

---

## Deployment

Upload the entire `chordsite/` folder to any static host:
- GitHub Pages
- Netlify (drag & drop)
- Vercel
- Any web server

No build step required.
