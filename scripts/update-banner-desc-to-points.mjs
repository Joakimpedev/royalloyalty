// Update refer.bannerDesc across every bundle so it uses {points} not
// {amount} + "store credit". One pass: rewrites the value in place.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dirname, "..", "app", "lib", "localization-defaults.ts");

const T = {
  en: "Sign up to claim {points} points",
  es: "Regístrate para reclamar {points} puntos",
  fr: "Inscris-toi pour obtenir {points} points",
  de: "Registriere dich, um {points} Punkte zu erhalten",
  it: "Registrati per ricevere {points} punti",
  ptBR: "Cadastre-se para ganhar {points} pontos",
  nl: "Meld je aan en krijg {points} punten",
  pl: "Zarejestruj się, aby otrzymać {points} punktów",
  nb: "Registrer deg for å få {points} poeng",
  sv: "Registrera dig för att få {points} poäng",
  da: "Tilmeld dig for at få {points} point",
  fi: "Rekisteröidy ja saa {points} pistettä",
  ja: "アカウントを作成すると {points} ポイントがもらえます",
  zhCN: "注册账户即可获得 {points} 积分",
  cs: "Zaregistruj se a získej {points} bodů",
  el: "Εγγραφείτε για να λάβετε {points} πόντους",
  tr: "Hesap oluştur ve {points} puan kazan",
  is: "Skráðu þig til að fá {points} stig",
  hu: "Regisztrálj és kapj {points} pontot",
  ro: "Înregistrează-te pentru a primi {points} puncte",
  uk: "Зареєструйтеся, щоб отримати {points} балів",
  zhTW: "建立帳戶即可獲得 {points} 點數",
  ko: "계정을 만들고 {points} 포인트를 받으세요",
  th: "สมัครสมาชิกเพื่อรับ {points} คะแนน",
  vi: "Đăng ký để nhận {points} điểm",
  id: "Daftar untuk mendapatkan {points} poin",
  hi: "{points} अंक पाने के लिए साइन अप करें",
  tl: "Mag-sign up para makakuha ng {points} puntos",
  bn: "{points} পয়েন্ট পেতে সাইন আপ করুন",
  ta: "{points} புள்ளிகள் பெற பதிவு செய்யவும்",
  ar: "سجل للحصول على {points} نقطة",
  he: "הירשם כדי לקבל {points} נקודות",
  ur: "{points} پوائنٹس حاصل کرنے کے لیے سائن اپ کریں",
  ru: "Зарегистрируйтесь, чтобы получить {points} баллов",
};

let src = readFileSync(FILE, "utf8");
const lines = src.split("\n");
const out = [];
let currentLang = null;
let updated = 0;

for (const line of lines) {
  const startMatch = /^const ([a-zA-Z]+): Bundle = \{$/.exec(line);
  if (startMatch) currentLang = startMatch[1];
  if (
    currentLang &&
    /^\s*"refer\.bannerDesc"\s*:/.test(line) &&
    T[currentLang]
  ) {
    const indent = (line.match(/^(\s*)/) || [, "  "])[1];
    out.push(`${indent}"refer.bannerDesc": ${JSON.stringify(T[currentLang])},`);
    updated += 1;
  } else {
    out.push(line);
  }
}

writeFileSync(FILE, out.join("\n"));
console.log(`Updated ${updated} bundles.`);
