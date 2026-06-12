# Big Dog Board Prototype

A small Next.js + TypeScript classroom display prototype with a whiteboard, draggable math manipulatives, a locally saved student-response session, and a countdown timer.

## Run Locally

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Useful Checks

```bash
npm run typecheck
npm run build
```

## Prototype Notes

- Whiteboard snapshots can be saved in the current browser and exported as PNG files.
- Algebra tiles and fraction bars can be duplicated, deleted, and snapped to a grid.
- Question sessions are saved to `.data/question-sessions.json` for local prototype persistence.
- There is no login, database, account system, or cloud sync yet.
- The student join page works best when students are on the same running local server URL.
