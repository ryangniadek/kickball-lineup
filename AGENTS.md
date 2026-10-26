## Kickball lineup app

- The static app is in this directory. It uses `index.html`, `style.css`, and `app.js` without a build step.
- Keep lineup data in browser local storage. The app also exports and imports versioned JSON lineup files.
- Keep kicking sequences in numeric order, reading down each column before moving right, on screen and in print.
- Keep the print layout to one landscape page with both defenses, rotation partners beneath field spots, and the kicking order.
- Check JavaScript and rules with `node --check app.js && node helpers/check-lineup.cjs`.