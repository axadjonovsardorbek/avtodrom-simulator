// The game's name and mark, in one place: the boot screen (index.html keeps its own copy, it shows before
// any script), the menu, the bar on top, the "getting ready" card. eAvtodrom: the exam ground now, the city later.
export const NAME = "eAvtodrom";
export const TAGLINE = "Haydash simulyatori";
// the name as shown in capitals, with its lowercase green "e"
export const WORDMARK = `<span class="we">e</span>AVTODROM`;

// the road that bends into an "e" (public/brand/mark.svg): two white edges (a wide stroke with its middle masked
// out, so any background shows through) and a green dashed centre line; `spin` sets the dashes running
export const ROAD = "M100 300 C196 206 318 324 414 236 C424 150 344 82 256 82 C156 82 82 160 82 256 C82 352 158 430 258 430 C322 430 368 402 402 358";
// each copy gets its own mask id: a page can hold several (one inside the hidden boot screen would break the rest)
let masks = 0;
export const logo = (cls = "", m = `eav-m${++masks}`) => `<svg class="logo ${cls}" viewBox="44 44 424 424" aria-hidden="true">
  <mask id="${m}" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512"><rect width="512" height="512" fill="#fff"/><path d="${ROAD}" fill="none" stroke="#000" stroke-width="54" stroke-linecap="round" stroke-linejoin="round"/></mask>
  <path class="lg-edge" d="${ROAD}" pathLength="100" mask="url(#${m})" fill="none" stroke="#fff" stroke-width="70" stroke-linecap="round" stroke-linejoin="round"/>
  <path class="lg-dash" d="${ROAD}" fill="none" stroke="#2ecc71" stroke-width="8" stroke-linecap="round" stroke-dasharray="26 22"/>
</svg>`;

// "getting ready" with the turning wheel: used wherever something loads
export const loader = text => `<div class="ld">${logo("spin")}<div class="ld-t">${text}<span class="ld-dots"><i></i><i></i><i></i></span></div></div>`;
