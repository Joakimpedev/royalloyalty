// One-off: add `refer.friendGetsDiscount` to every locale bundle in
// app/lib/localization-defaults.ts. {discount} is substituted client-side
// to "10% off" / "$5 off" / etc. Also keeps the existing refer.friendGets
// around for backward compatibility (unused after this change but harmless).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dirname, "..", "app", "lib", "localization-defaults.ts");

const T = {
  en: "Your friend will get {discount}",
  es: "Tu amigo recibirá {discount}",
  fr: "Ton ami recevra {discount}",
  de: "Dein Freund erhält {discount}",
  it: "Il tuo amico riceverà {discount}",
  ptBR: "Seu amigo ganhará {discount}",
  nl: "Je vriend krijgt {discount}",
  pl: "Twój znajomy otrzyma {discount}",
  nb: "Vennen din får {discount}",
  sv: "Din vän får {discount}",
  da: "Din ven får {discount}",
  fi: "Ystäväsi saa {discount}",
  ja: "お友達は {discount} を受け取ります",
  zhCN: "您的朋友将获得 {discount}",
  cs: "Tvůj přítel získá {discount}",
  el: "Ο φίλος σας θα λάβει {discount}",
  tr: "Arkadaşın {discount} kazanacak",
  is: "Vinur þinn fær {discount}",
  hu: "A barátod {discount} kedvezményt kap",
  ro: "Prietenul tău va primi {discount}",
  uk: "Ваш друг отримає {discount}",
  zhTW: "您的朋友將獲得 {discount}",
  ko: "친구가 {discount}을 받게 됩니다",
  th: "เพื่อนของคุณจะได้รับ {discount}",
  vi: "Bạn của bạn sẽ nhận được {discount}",
  id: "Teman Anda akan mendapatkan {discount}",
  hi: "आपके मित्र को {discount} मिलेगा",
  tl: "Ang iyong kaibigan ay makakakuha ng {discount}",
  bn: "আপনার বন্ধু {discount} পাবে",
  ta: "உங்கள் நண்பர் {discount} பெறுவார்",
  ar: "سيحصل صديقك على {discount}",
  he: "החבר שלך יקבל {discount}",
  ur: "آپ کے دوست کو {discount} ملے گا",
  ru: "Ваш друг получит {discount}",
};

let src = readFileSync(FILE, "utf8");
const lines = src.split("\n");
const out = [];
let currentLang = null;
let inserted = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  out.push(line);

  const m = /^const ([a-zA-Z]+): Bundle = \{$/.exec(line);
  if (m) {
    currentLang = m[1];
    continue;
  }

  if (currentLang && /^\s*"refer\.friendGets"\s*:/.test(line)) {
    const txt = T[currentLang];
    if (!txt) {
      console.warn("No translation for " + currentLang);
      continue;
    }
    const indent = (line.match(/^(\s*)/) || [, "  "])[1];
    out.push(`${indent}"refer.friendGetsDiscount": ${JSON.stringify(txt)},`);
    inserted += 1;
  }
}

// Handle zhTW which doesn't have refer.friendGets — append before closing }
// of zhTW bundle.
if (!out.some((l) => l.includes('"refer.friendGetsDiscount": "您的朋友將獲得'))) {
  const idx = out.findIndex((l) => l.includes('const zhTW: Bundle = {'));
  if (idx >= 0) {
    let j = idx + 1;
    while (j < out.length && !/^\};/.test(out[j])) j++;
    if (j < out.length) {
      out.splice(j, 0, `  "refer.friendGetsDiscount": "您的朋友將獲得 {discount}",`);
      inserted += 1;
    }
  }
}

writeFileSync(FILE, out.join("\n"));
console.log(`Inserted ${inserted} keys.`);
