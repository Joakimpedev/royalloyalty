// One-off: add `refer.friendGetsCredit` to every locale bundle.
// {amount} is the formatted money value the client substitutes.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dirname, "..", "app", "lib", "localization-defaults.ts");

const T = {
  en: "Your friend will get {amount} store credit",
  es: "Tu amigo recibirá {amount} de crédito de tienda",
  fr: "Ton ami recevra {amount} de crédit en magasin",
  de: "Dein Freund erhält {amount} Guthaben",
  it: "Il tuo amico riceverà {amount} di credito del negozio",
  ptBR: "Seu amigo ganhará {amount} em crédito da loja",
  nl: "Je vriend krijgt {amount} winkeltegoed",
  pl: "Twój znajomy otrzyma {amount} kredytu sklepowego",
  nb: "Vennen din får {amount} i butikkredit",
  sv: "Din vän får {amount} i butikskredit",
  da: "Din ven får {amount} i butikskredit",
  fi: "Ystäväsi saa {amount} myymäläluottoa",
  ja: "お友達は {amount} のストアクレジットを受け取ります",
  zhCN: "您的朋友将获得 {amount} 商店积分",
  cs: "Tvůj přítel získá {amount} kreditu obchodu",
  el: "Ο φίλος σας θα λάβει {amount} σε πίστωση καταστήματος",
  tr: "Arkadaşın {amount} mağaza kredisi kazanacak",
  is: "Vinur þinn fær {amount} í verslunarinneign",
  hu: "A barátod {amount} bolti kreditet kap",
  ro: "Prietenul tău va primi {amount} credit magazin",
  uk: "Ваш друг отримає {amount} магазинного кредиту",
  zhTW: "您的朋友將獲得 {amount} 商店積分",
  ko: "친구가 {amount}의 스토어 크레딧을 받게 됩니다",
  th: "เพื่อนของคุณจะได้รับเครดิตร้านค้า {amount}",
  vi: "Bạn của bạn sẽ nhận được {amount} tín dụng cửa hàng",
  id: "Teman Anda akan mendapatkan {amount} kredit toko",
  hi: "आपके मित्र को {amount} स्टोर क्रेडिट मिलेगा",
  tl: "Ang iyong kaibigan ay makakakuha ng {amount} store credit",
  bn: "আপনার বন্ধু {amount} স্টোর ক্রেডিট পাবে",
  ta: "உங்கள் நண்பர் {amount} கடை வரவு பெறுவார்",
  ar: "سيحصل صديقك على رصيد متجر بقيمة {amount}",
  he: "החבר שלך יקבל {amount} בקרדיט חנות",
  ur: "آپ کے دوست کو {amount} اسٹور کریڈٹ ملے گا",
  ru: "Ваш друг получит {amount} кредита магазина",
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

  // Anchor right after refer.friendGetsDiscount (or refer.friendGets if
  // discount key absent in some bundle).
  if (
    currentLang &&
    (/^\s*"refer\.friendGetsDiscount"\s*:/.test(line) ||
      (!T._seen?.[currentLang] && /^\s*"refer\.friendGets"\s*:/.test(line)))
  ) {
    const txt = T[currentLang];
    if (!txt) continue;
    const indent = (line.match(/^(\s*)/) || [, "  "])[1];
    out.push(`${indent}"refer.friendGetsCredit": ${JSON.stringify(txt)},`);
    inserted += 1;
  }
}

writeFileSync(FILE, out.join("\n"));
console.log(`Inserted ${inserted} keys.`);
