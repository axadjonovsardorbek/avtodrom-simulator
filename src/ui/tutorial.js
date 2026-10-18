// Step-by-step starting drill: shows one step at a time and moves on only when the car
// really is in that state (belt on, engine running, gear in, handbrake off ...).

export function tutorialSteps(transmission) {
  const manual = transmission === "manual";
  const steps = [
    { id: "belt", title: "Xavfsizlik kamari", text: "Kamarni taqing.", key: "K", touch: "#tBelt", why: "Kamarsiz harakatlansangiz 5 ball jarima.", done: c => c.belt }
  ];
  if (manual) steps.push({ id: "clutch", title: "Ilashish pedali", text: "Ilashish pedalini oxirigacha bosib turing.", key: "Shift", touch: "[data-hold=clutch]", why: "Dvigatel o't olishi va uzatma qo'shish uchun ilashish bosilgan bo'lishi kerak.", done: c => c.clutch > 0.85 });
  steps.push({ id: "engine", title: "Dvigatel", text: "Dvigatelni o't oldiring.", key: "I", touch: "#tEng", why: manual ? "Pedalni qo'yib yubormang." : "Selektor P yoki N holatida bo'lishi kerak.", done: c => c.engineOn });
  steps.push(manual
    ? { id: "gear", title: "Uzatma", text: "1-uzatmani qo'shing.", key: "1", touch: "#tGear", why: "Ilashish bosilgan holda qo'shiladi. Aks holda uzatma g'ichirlaydi.", done: c => c.gear === 1 }
    : { id: "gear", title: "Selektor", text: "Selektorni D (oldinga) holatiga qo'ying.", key: "F", touch: "#tGear", why: "P: to'xtash, R: orqaga, N: neytral, D: oldinga.", done: c => c.gear === "D" });
  steps.push(
    { id: "hand", title: "Qo'l tormozi", text: "Qo'l tormozini tushiring.", key: "Space", touch: "#tHand", why: "Tormoz tushirilmasa mashina joyidan jilmaydi.", done: c => !c.handbrake },
    { id: "signal", title: "Burilish chirog'i", text: "Chap burilish chirog'ini yoqing.", key: "Q", touch: "#tSigL", why: "Start chizig'idan chiroqsiz o'tish 5 ball jarima.", done: c => c.sig === -1 },
    { id: "go", title: "Harakatni boshlash", text: manual ? "Ilashishni asta-sekin qo'yib yuboring va bir vaqtda gazni bosing." : "Gazni asta bosing.", key: manual ? "Shift ↑ + W" : "W", touch: manual ? "[data-hold=gas]" : "[data-hold=gas]",
      why: manual ? "Mashina silkina boshlagan paytda (ilashish nuqtasi) ilashishni to'xtating. Tez qo'yib yuborsangiz dvigatel o'chadi." : "Gazni silliq bosing.", done: c => c.odo > 1.5 }
  );
  return steps;
}

export class Tutorial {
  constructor(transmission) { this.steps = tutorialSteps(transmission); this.i = 0; this.finished = false; this.doneAt = 0; }
  // returns what the card should show; call every frame (cheap)
  tick(car, now = performance.now()) {
    while (this.i < this.steps.length && this.steps[this.i].done(car)) this.i++;
    if (this.i >= this.steps.length && !this.finished) { this.finished = true; this.doneAt = now; }
    const total = this.steps.length;
    if (this.finished) return { done: true, hide: now - this.doneAt > 9000, total };
    return { done: false, n: this.i + 1, total, step: this.steps[this.i] };
  }
}
