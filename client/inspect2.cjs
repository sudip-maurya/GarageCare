const fs = require('fs');
const p = 'src/pages/settings.css';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(/^\uFEFF/, '');
let t = s.replace(/\r\n/g, '\n');
if (!t.includes('set-panel-viewport')) {
  t += "\n/* Stable tab panel viewport + subtle directional slide (content only; tabs/sidebar/header stay fixed) */\n.set-page.set-page { overflow-x: clip; }\n.set-panel-viewport { min-width: 0; width: 100%; max-width: 100%; overflow: clip; }\n@supports not (overflow: clip) { .set-panel-viewport { overflow: hidden; } }\n.set-slide { min-width: 0; width: 100%; max-width: 100%; animation: set-slide-in 220ms ease both; will-change: transform, opacity; }\n.set-slide.from-right { --set-slide-from: 14px; }\n.set-slide.from-left { --set-slide-from: -14px; }\n@keyframes set-slide-in { from { opacity: 0; transform: translateX(var(--set-slide-from, 14px)); } to { opacity: 1; transform: translateX(0); } }\n";
}
t = t.replace("@media (prefers-reduced-motion: reduce) {\n  .set-page .set-card, .set-page .set-btn, .set-tabs .nav-link, .set-page .form-control { transition: none; }\n}", "@media (prefers-reduced-motion: reduce) {\n  .set-page .set-card, .set-page .set-btn, .set-tabs .nav-link, .set-page .form-control { transition: none; }\n  .set-slide { animation: none; }\n}");
t = t.replace(/\n/g, '\r\n');
fs.writeFileSync(p, t, 'utf8');
console.log('css patched, has viewport=' + t.includes('set-panel-viewport'));

