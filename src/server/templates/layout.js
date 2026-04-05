import { css } from './styles.js';

export function layout(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Project X — Scraper Dashboard</title>
  <style>${css}</style>
</head>
<body>
  <div class="container">
    ${body}
  </div>
</body>
</html>`;
}
