// The game's name and mark, in one place: the boot screen (index.html keeps its own copy, it shows before
// any script), the menu, the bar on top, the "getting ready" card. RULDA ("at the wheel"): the exam ground
// now, the city later.
export const NAME = "RULDA";
export const TAGLINE = "Haydash simulyatori";

// a steering wheel: an amber rim, three spokes, a hub; `spin` adds the class that turns it
export const logo = (cls = "") => `<svg class="logo ${cls}" viewBox="0 0 100 100" aria-hidden="true">
  <circle class="lg-rim" cx="50" cy="50" r="40" fill="none" stroke="#f2b632" stroke-width="9"/>
  <path class="lg-spk" d="M50 50 L12 46 M50 50 L88 46 M50 50 L50 88" stroke="#eef0f2" stroke-width="8" stroke-linecap="round" fill="none"/>
  <circle class="lg-hub" cx="50" cy="50" r="12" fill="#eef0f2"/>
  <circle cx="50" cy="50" r="5" fill="#f2b632"/>
  <path d="M44 11 h12" stroke="#0b0c0e" stroke-width="4" stroke-linecap="round"/>
</svg>`;

// "getting ready" with the turning wheel: used wherever something loads
export const loader = text => `<div class="ld">${logo("spin")}<div class="ld-t">${text}<span class="ld-dots"><i></i><i></i><i></i></span></div></div>`;
