// One-off: add the referral banner keys to every locale bundle.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dirname, "..", "app", "lib", "localization-defaults.ts");

// [title, desc with {amount}, cta, dismiss]
const T = {
  en: ["You've been referred", "Sign up to claim {amount} store credit on your next order", "Create account", "Dismiss"],
  es: ["Has sido recomendado", "Regístrate para reclamar {amount} de crédito de tienda en tu próximo pedido", "Crear cuenta", "Cerrar"],
  fr: ["Tu as été recommandé", "Inscris-toi pour obtenir {amount} de crédit en magasin sur ta prochaine commande", "Créer un compte", "Fermer"],
  de: ["Du wurdest empfohlen", "Registriere dich, um {amount} Guthaben für deine nächste Bestellung zu erhalten", "Konto erstellen", "Schließen"],
  it: ["Sei stato consigliato", "Registrati per ricevere {amount} di credito sul prossimo ordine", "Crea un account", "Chiudi"],
  ptBR: ["Você foi indicado", "Cadastre-se para ganhar {amount} em crédito da loja no seu próximo pedido", "Criar conta", "Fechar"],
  nl: ["Je bent doorverwezen", "Meld je aan en krijg {amount} winkeltegoed bij je volgende bestelling", "Account aanmaken", "Sluiten"],
  pl: ["Otrzymałeś polecenie", "Zarejestruj się, aby otrzymać {amount} kredytu sklepowego na następne zamówienie", "Utwórz konto", "Zamknij"],
  nb: ["Du har blitt henvist", "Registrer deg for å få {amount} i butikkredit på neste bestilling", "Opprett konto", "Lukk"],
  sv: ["Du har blivit hänvisad", "Registrera dig för att få {amount} i butikskredit på din nästa order", "Skapa konto", "Stäng"],
  da: ["Du er blevet henvist", "Tilmeld dig for at få {amount} i butikskredit på din næste ordre", "Opret konto", "Luk"],
  fi: ["Sinut on ohjattu meille", "Rekisteröidy ja saa {amount} myymäläluottoa seuraavaan tilaukseesi", "Luo tili", "Sulje"],
  ja: ["紹介されました", "アカウントを作成すると、次回の注文で {amount} のストアクレジットがもらえます", "アカウントを作成", "閉じる"],
  zhCN: ["您已被推荐", "注册账户以在下次订单中获得 {amount} 商店积分", "创建账户", "关闭"],
  cs: ["Byl jsi doporučen", "Zaregistruj se a získej {amount} kreditu obchodu na svou další objednávku", "Vytvořit účet", "Zavřít"],
  el: ["Σας προτείναμε", "Εγγραφείτε για να λάβετε {amount} σε πίστωση καταστήματος στην επόμενη παραγγελία σας", "Δημιουργία λογαριασμού", "Κλείσιμο"],
  tr: ["Bir arkadaşın seni davet etti", "Hesap oluştur ve bir sonraki siparişinde {amount} mağaza kredisi kazan", "Hesap oluştur", "Kapat"],
  is: ["Þér var vísað hingað", "Skráðu þig til að fá {amount} í verslunarinneign í næstu pöntun", "Stofna reikning", "Loka"],
  hu: ["Téged ajánlottak", "Regisztrálj, és kapj {amount} bolti kreditet a következő rendelésedhez", "Fiók létrehozása", "Bezárás"],
  ro: ["Ai fost recomandat", "Înregistrează-te pentru a primi {amount} credit magazin la următoarea comandă", "Creează cont", "Închide"],
  uk: ["Вас порекомендували", "Зареєструйтеся, щоб отримати {amount} магазинного кредиту на наступне замовлення", "Створити обліковий запис", "Закрити"],
  zhTW: ["您已被推薦", "建立帳戶即可在下次訂單中獲得 {amount} 商店積分", "建立帳戶", "關閉"],
  ko: ["추천을 받으셨습니다", "계정을 만들어 다음 주문 시 {amount}의 스토어 크레딧을 받으세요", "계정 만들기", "닫기"],
  th: ["คุณได้รับการแนะนำ", "สมัครสมาชิกเพื่อรับเครดิตร้านค้า {amount} สำหรับการสั่งซื้อครั้งถัดไป", "สร้างบัญชี", "ปิด"],
  vi: ["Bạn đã được giới thiệu", "Đăng ký để nhận {amount} tín dụng cửa hàng cho đơn hàng tiếp theo", "Tạo tài khoản", "Đóng"],
  id: ["Anda telah direferensikan", "Daftar untuk mendapatkan {amount} kredit toko untuk pesanan berikutnya", "Buat akun", "Tutup"],
  hi: ["आपको रेफ़र किया गया है", "अपने अगले ऑर्डर पर {amount} स्टोर क्रेडिट पाने के लिए साइन अप करें", "खाता बनाएं", "बंद करें"],
  tl: ["Naireferal ka", "Mag-sign up para makakuha ng {amount} na store credit sa susunod mong order", "Gumawa ng account", "Isara"],
  bn: ["আপনাকে রেফার করা হয়েছে", "পরবর্তী অর্ডারে {amount} স্টোর ক্রেডিট পেতে সাইন আপ করুন", "অ্যাকাউন্ট তৈরি করুন", "বন্ধ"],
  ta: ["நீங்கள் பரிந்துரைக்கப்பட்டுள்ளீர்கள்", "உங்கள் அடுத்த ஆர்டரில் {amount} கடை வரவைப் பெற பதிவு செய்யவும்", "கணக்கை உருவாக்கு", "மூடு"],
  ar: ["لقد تمت إحالتك", "سجل للحصول على رصيد متجر بقيمة {amount} في طلبك التالي", "إنشاء حساب", "إغلاق"],
  he: ["הופנית אלינו", "הירשם כדי לקבל {amount} בקרדיט חנות בהזמנה הבאה שלך", "צור חשבון", "סגור"],
  ur: ["آپ کا حوالہ دیا گیا ہے", "اگلے آرڈر پر {amount} اسٹور کریڈٹ حاصل کرنے کے لیے سائن اپ کریں", "اکاؤنٹ بنائیں", "بند کریں"],
  ru: ["Вас порекомендовали", "Зарегистрируйтесь, чтобы получить {amount} кредита магазина на следующий заказ", "Создать аккаунт", "Закрыть"],
};

let src = readFileSync(FILE, "utf8");
const lines = src.split("\n");
const out = [];
let currentLang = null;
let inserted = 0;
const insertedInBundle = new Set();

for (const line of lines) {
  const startMatch = /^const ([a-zA-Z]+): Bundle = \{$/.exec(line);
  if (startMatch) {
    currentLang = startMatch[1];
    insertedInBundle.clear();
  }
  out.push(line);
  if (
    currentLang &&
    !insertedInBundle.has(currentLang) &&
    /^\s*"refer\.friendGetsCredit"\s*:/.test(line)
  ) {
    const tx = T[currentLang];
    if (!tx) continue;
    const indent = (line.match(/^(\s*)/) || [, "  "])[1];
    out.push(`${indent}"refer.bannerTitle": ${JSON.stringify(tx[0])},`);
    out.push(`${indent}"refer.bannerDesc": ${JSON.stringify(tx[1])},`);
    out.push(`${indent}"refer.bannerCta": ${JSON.stringify(tx[2])},`);
    out.push(`${indent}"refer.bannerDismiss": ${JSON.stringify(tx[3])},`);
    insertedInBundle.add(currentLang);
    inserted += 4;
  }
}

writeFileSync(FILE, out.join("\n"));
console.log(`Inserted ${inserted} keys.`);
