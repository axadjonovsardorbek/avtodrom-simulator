// Official penalty table for the automated autodrome (B category).
// n = row number in the published table, pts = penalty points.
export const PEN = {
  belt:        { n: 1,  pts: 5,   text: "Xavfsizlik kamarini taqmadi" },
  startSignal: { n: 2,  pts: 5,   text: "Chapga burilish chirog'ini yoqmasdan \"Start\" chizig'ini kesib o'tdi" },
  startSigOff: { n: 3,  pts: 5,   text: "\"Start\" chizig'idan keyin 10 m masofada chap chiroqni o'chirmadi" },
  stopFar:     { n: 4,  pts: 5,   text: "\"To'xtash chizig'i\"dan oldin 1 metrdan ko'proq masofada to'xtadi" },
  turnSignal:  { n: 5,  pts: 5,   text: "Tegishli yo'nalishdagi burilish chirog'ini yoqmadi" },
  finishSignal:{ n: 7,  pts: 5,   text: "\"Finish\" chizig'idan oldin o'ngga burilish ishorasini yoqmadi" },
  speed20:     { n: 8,  pts: 5,   text: "Harakat tezligini 20 km/soatdan oshirdi (har 5 soniya uchun)" },
  greenSlow:   { n: 9,  pts: 10,  text: "Svetoforning ruxsat ishorasida chorrahadan o'tishga 30 soniyadan ko'p sarfladi" },
  start30:     { n: 10, pts: 25,  text: "\"Start\" ishorasidan keyin 30 soniya davomida harakatni boshlamadi" },
  stopLine:    { n: 11, pts: 20,  text: "\"To'xtash chizig'i\" oldida to'xtamadi yoki uni bosib o'tdi" },
  early3s:     { n: 12, pts: 20,  text: "To'xtagandan so'ng 3 soniya o'tmasdan harakatni boshladi" },
  hill30:      { n: 13, pts: 25,  text: "\"Estakada\"da to'xtagandan so'ng 30 soniya davomida harakatni boshlamadi" },
  hillBack:    { n: 14, pts: 20,  text: "\"Estakada\"da orqaga 0,3 metrdan ortiq siljidi" },
  ctrlLine:    { n: 15, pts: 20,  text: "Nazorat chizig'ini bosdi" },
  slow2min:    { n: 16, pts: 15,  text: "Mashqni bajarishga 2 daqiqadan ko'p vaqt sarfladi" },
  regLine:     { n: 17, pts: 20,  text: "G'ildiraklarni qayd etish chizig'iga qo'ymadi" },
  gear2:       { n: 18, pts: 25,  text: "Yo'lning tezlashish qismida ikkinchi uzatmani qo'shmadi" },
  alarm2s:     { n: 19, pts: 20,  text: "Ishora yonganidan so'ng 2 soniya ichida to'xtamadi" },
  hazardOn:    { n: 20, pts: 20,  text: "To'xtagandan so'ng 3 soniya ichida avariya ishorasini yoqmadi" },
  hazardOff:   { n: 21, pts: 10,  text: "Harakatni boshlashdan oldin avariya ishorasini o'chirmadi" },
  stall:       { n: 22, pts: 20,  text: "Dvigatelni o'chirib qo'ydi" },
  start40:     { n: 23, pts: 100, text: "\"Start\" ishorasidan keyin 40 soniya davomida harakatni boshlamadi" },
  redLight:    { n: 24, pts: 100, text: "Svetoforning taqiqlovchi ishorasida chorrahaga kirdi" },
  railStop:    { n: 25, pts: 50,  text: "Temir yo'l kesishmasidan to'xtamasdan o'tdi" },
  notDone:     { n: 27, pts: 100, text: "Sinov mashqlaridan birini bajarmadi" },
  offRoute:    { n: 28, pts: 100, text: "Belgilangan yo'nalishdan chetga chiqib ketdi" },
  reverse:     { n: 29, pts: 100, text: "Ko'zda tutilmagan joyda orqaga harakatlandi" },
  crash:       { n: 30, pts: 100, text: "To'siqqa yoki piyodaga urilib ketdi" },
  speed40:     { n: 31, pts: 100, text: "Harakat tezligini 40 km/soatdan oshirdi" }
};

// The exam is failed (and stopped) when the total exceeds this.
export const PASS_LIMIT = 100;
// The exam centre counts a 5 km/h measurement tolerance.
export const SPEED_TOL = 5;
