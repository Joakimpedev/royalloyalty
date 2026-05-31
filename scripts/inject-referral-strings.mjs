// One-off: add `refer.youGet` and `refer.friendGets` keys to every locale
// bundle in app/lib/localization-defaults.ts, with the appropriate
// translation. Run with: node scripts/inject-referral-strings.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dirname, "..", "app", "lib", "localization-defaults.ts");

const T = {
  en: ["You'll get {points} points", "Your friend will get {points} points"],
  es: ["Recibirás {points} puntos", "Tu amigo recibirá {points} puntos"],
  fr: ["Tu recevras {points} points", "Ton ami recevra {points} points"],
  de: ["Du erhältst {points} Punkte", "Dein Freund erhält {points} Punkte"],
  it: ["Riceverai {points} punti", "Il tuo amico riceverà {points} punti"],
  ptBR: ["Você ganhará {points} pontos", "Seu amigo ganhará {points} pontos"],
  nl: ["Jij krijgt {points} punten", "Je vriend krijgt {points} punten"],
  pl: ["Otrzymasz {points} punktów", "Twój znajomy otrzyma {points} punktów"],
  nb: ["Du får {points} poeng", "Vennen din får {points} poeng"],
  sv: ["Du får {points} poäng", "Din vän får {points} poäng"],
  da: ["Du får {points} point", "Din ven får {points} point"],
  fi: ["Saat {points} pistettä", "Ystäväsi saa {points} pistettä"],
  ja: ["あなたは {points} ポイントを獲得します", "お友達は {points} ポイントを獲得します"],
  zhCN: ["您将获得 {points} 积分", "您的朋友将获得 {points} 积分"],
  cs: ["Získáš {points} bodů", "Tvůj přítel získá {points} bodů"],
  el: ["Θα λάβετε {points} πόντους", "Ο φίλος σας θα λάβει {points} πόντους"],
  tr: ["{points} puan kazanacaksın", "Arkadaşın {points} puan kazanacak"],
  is: ["Þú færð {points} stig", "Vinur þinn fær {points} stig"],
  hu: ["{points} pontot kapsz", "A barátod {points} pontot kap"],
  ro: ["Vei primi {points} puncte", "Prietenul tău va primi {points} puncte"],
  uk: ["Ви отримаєте {points} балів", "Ваш друг отримає {points} балів"],
  zhTW: ["您將獲得 {points} 點數", "您的朋友將獲得 {points} 點數"],
  ko: ["{points} 포인트를 받게 됩니다", "친구가 {points} 포인트를 받게 됩니다"],
  th: ["คุณจะได้รับ {points} คะแนน", "เพื่อนของคุณจะได้รับ {points} คะแนน"],
  vi: ["Bạn sẽ nhận được {points} điểm", "Bạn của bạn sẽ nhận được {points} điểm"],
  id: ["Anda akan mendapatkan {points} poin", "Teman Anda akan mendapatkan {points} poin"],
  hi: ["आपको {points} अंक मिलेंगे", "आपके मित्र को {points} अंक मिलेंगे"],
  tl: ["Makakakuha ka ng {points} puntos", "Ang iyong kaibigan ay makakakuha ng {points} puntos"],
  bn: ["আপনি {points} পয়েন্ট পাবেন", "আপনার বন্ধু {points} পয়েন্ট পাবে"],
  ta: ["நீங்கள் {points} புள்ளிகள் பெறுவீர்கள்", "உங்கள் நண்பர் {points} புள்ளிகள் பெறுவார்"],
  ar: ["ستحصل على {points} نقطة", "سيحصل صديقك على {points} نقطة"],
  he: ["תקבל {points} נקודות", "החבר שלך יקבל {points} נקודות"],
  ur: ["آپ کو {points} پوائنٹس ملیں گے", "آپ کے دوست کو {points} پوائنٹس ملیں گے"],
  ru: ["Вы получите {points} баллов", "Ваш друг получит {points} баллов"],
};

let src = readFileSync(FILE, "utf8");
const lines = src.split("\n");
const out = [];
let currentLang = null;
let inserted = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  out.push(line);

  // Detect bundle start: `const xx: Bundle = {`
  const m = /^const ([a-zA-Z]+): Bundle = \{$/.exec(line);
  if (m) {
    currentLang = m[1];
    continue;
  }

  // After the `"refer.copiedButton":` line, inject the new two keys.
  if (currentLang && /^\s*"refer\.copiedButton"\s*:/.test(line)) {
    const pair = T[currentLang];
    if (!pair) {
      console.warn("No translation map for " + currentLang + ", skipping.");
      continue;
    }
    // Match the leading indentation of the existing line for consistency.
    const indent = (line.match(/^(\s*)/) || [, "  "])[1];
    out.push(`${indent}"refer.youGet": ${JSON.stringify(pair[0])},`);
    out.push(`${indent}"refer.friendGets": ${JSON.stringify(pair[1])},`);
    inserted += 2;
  }
}

writeFileSync(FILE, out.join("\n"));
console.log(`Inserted ${inserted} keys across bundles.`);
