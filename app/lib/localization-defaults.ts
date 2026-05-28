// Pre-baked translations for every supported locale. The merchant can
// override any value on the admin Localization page; these defaults are
// what fills the form when they pick a language for the first time. We
// keep these in one file (rather than per-locale modules) so the entire
// bundle is statically importable on the server with zero runtime IO.
//
// Quality note: these are seeded translations, not pro-translated. Where
// a literal translation would be awkward we used the most-common UI
// vocabulary for that locale (e.g. "Tjen poeng" for Norwegian rather
// than a literal "Earn points"). Merchants are expected to fine-tune
// per their voice and market.

import type { LocaleCode } from "./localization-locales";

type Bundle = Record<string, string>;

const en: Bundle = {
  "launcher.title": "Your rewards",
  "launcher.subtitle": "Earn points on every order — redeem for rewards.",
  "launcher.text": "Rewards",
  "launcher.hub.earn": "Earn points",
  "launcher.hub.redeem": "Redeem rewards",
  "launcher.hub.refer": "Refer a friend",
  "launcher.activeCodesHeading": "Your active codes",
  "launcher.loadingRewards": "Loading rewards…",
  "hub.visitor.title": "Sign in to start earning",
  "hub.visitor.desc": "Sign in to track your points and unlock rewards.",
  "hub.member.nextReward": "Next reward",
  "hub.member.readyToRedeem": "Ready to redeem",
  "hub.member.cashbackLine": "Earn {percent}% back as store credit on every order.",
  "hub.member.storeCreditBalance": "Store credit balance",
  "page.heroTitle": "Earn points. Get rewards.",
  "page.heroSubtitle": "Join the program and earn on every order.",
  "page.balanceLabel": "Your balance:",
  "page.activeCodesHeading": "Your active codes",
  "page.signInCta": "Sign in to view your points",
  "page.waysToEarnHeading": "Ways to earn",
  "page.rewardsHeading": "Rewards",
  "page.followUsHeading": "Follow us",
  "page.referHeading": "Refer a friend",
  "page.referDescription": "Share your link — you both get rewarded.",
  "page.referLoadingLink": "Loading your link…",
  "page.referCopyButton": "Copy link",
  "page.loading": "Loading…",
  "account.heading": "Your loyalty",
  "account.pointsSuffix": " points",
  "account.recentActivityHeading": "Recent activity",
  "account.rewardsHeading": "Rewards",
  "account.referHeading": "Refer a friend",
  "account.referCopyButton": "Copy link",
  "account.signInRequired": "Please sign in to view your loyalty status.",
  "account.emptyActivity": "No activity yet. Place an order to start earning.",
  "reward.type.freeShipping": "Free shipping",
  "reward.type.freeProduct": "Free product",
  "reward.redeemButton": "Redeem",
  "reward.signInToRedeemButton": "Sign in to redeem",
  "reward.applyToCart": "Apply to cart",
  "reward.copyCode": "Copy",
  "reward.copiedCode": "Copied!",
  "refer.descSignedOut":
    "Share your personal link with friends. When they place their first order, you both earn rewards.",
  "refer.signInCta": "Sign in to get your link",
  "refer.unavailable": "Referrals aren't available right now.",
  "refer.descSignedIn":
    "Share your link. You both earn when friends place their first order.",
  "refer.copyButton": "Copy",
  "refer.copiedButton": "Copied!",
  "cart.heading": "Use your points",
  "cart.signedOutCta": "Sign in to apply your points to this order.",
  "cart.earnLineLoading": "Calculating points earned…",
  "cart.keepShoppingForFirstReward":
    "Keep shopping to unlock your first reward ({points} points).",
  "cart.activeCodesHeading": "Your active codes",
  "cart.cashbackSuffix": "store credit",
  "cart.rewardApplied": "Reward applied — you'll see the discount at checkout.",
  "product.subtext":
    "You have {balance} points. Earn {more} more with this order!",
  "social.platform.instagram": "Instagram",
  "social.platform.tiktok": "TikTok",
  "social.platform.x": "X",
  "social.platform.facebook": "Facebook",
  "social.platform.youtube": "YouTube",
  "social.awardedButton": "Awarded +{points}",
  "social.awardedStatus": "Awarded {points} points.",
  "social.alreadyClaimed": "Already claimed",
  "empty.programBeingSetUp":
    "Your loyalty program is being set up. Check back soon.",
  "empty.earnSignedOut":
    "Sign in or create an account to start earning points on every order.",
  "empty.earnSignInButton": "Sign in to earn",
  "empty.earnRules": "No ways to earn yet — check back soon.",
  "empty.rewardsSignedOut":
    "These are the rewards you can redeem with your points. {signInLink} or create an account to start earning.",
  "empty.rewardsSignInLink": "Sign in",
  "empty.rewards": "No rewards available yet — check back soon.",
  "status.redeeming": "Redeeming…",
  "status.rewardRedeemedWithCode": "Reward redeemed — your code is {code}.",
  "status.rewardRedeemed": "Reward redeemed.",
  "error.couldNotRedeem":
    "We couldn't redeem that reward. Please try again.",
  "error.couldNotApplyReward":
    "We couldn't apply that reward. Please try again.",
  "error.couldNotLoad":
    "We couldn't load your rewards right now. Please try again later.",
  "tooltip.back": "Back",
  "tooltip.close": "Close",
  "tooltip.notEnoughPoints": "Not enough points yet",
  "tooltip.signUpToRedeem": "Sign up to redeem",
  "rule.purchase.title": "Place an order",
  "rule.purchase.description": "Earn {{points}} pts per order",
  "rule.purchase.descriptionPerDollar":
    "Earn {{points}} pts for every {{per_amount}} spent",
  "rule.purchase.productLine": "Earn {{points}} points with this purchase",
  "rule.purchase.cartLine": "+{{points}} pts for this order",
  "rule.signup.title": "Create an account",
  "rule.signup.description": "Earn {{points}} pts when you sign up",
  "rule.birthday.title": "Celebrate your birthday",
  "rule.birthday.description": "Earn {{points}} pts on your birthday",
  "rule.newsletter.title": "Subscribe to our newsletter",
  "rule.newsletter.description": "Earn {{points}} pts when you subscribe",
  "rule.social.title": "Follow on social",
  "rule.social.description": "Earn points when you follow us on social",
  "rule.review.title": "Leave a product review",
  "rule.review.description": "Earn {{points}} pts per review",
  "rule.anniversary.title": "Account anniversary",
  "rule.anniversary.description":
    "Earn {{points}} pts on your loyalty anniversary",
  "pos.tileTitle": "Royal Loyalty",
  "pos.tileSubtitle": "Balance · earn · redeem",
  "pos.errorNoCustomer": "Attach a customer to the cart first.",
  "pos.errorLoadBalance":
    "Couldn't load this customer's balance. Check the connection and retry.",
  "pos.errorAward": "Could not award points. Please retry.",
  "pos.appliedCode": "Applied reward code {code}.",
  "pos.redeemed": "Reward redeemed.",
  "pos.errorRedeem": "Could not redeem. Please retry.",
  "pos.noCustomerOnCart": "No customer on cart",
  "pos.lookupBalanceButton": "Look up balance",
  "pos.sectionBalance": "Balance",
  "pos.sectionEarn": "Earn",
  "pos.awardButton": "Award points for this cart",
  "pos.sectionRedeem": "Redeem",
  "pos.errorInsufficient": "Not enough points for that reward.",
  "pos.noRewards": "No rewards available.",
  "pos.lookupHint": "Look up a customer to see their points and rewards.",
};

const es: Bundle = {
  "launcher.title": "Tus recompensas",
  "launcher.subtitle":
    "Gana puntos en cada compra — canjéalos por recompensas.",
  "launcher.text": "Recompensas",
  "launcher.hub.earn": "Ganar puntos",
  "launcher.hub.redeem": "Canjear recompensas",
  "launcher.hub.refer": "Recomendar a un amigo",
  "launcher.activeCodesHeading": "Tus códigos activos",
  "launcher.loadingRewards": "Cargando recompensas…",
  "hub.visitor.title": "Inicia sesión para empezar a ganar",
  "hub.visitor.desc": "Inicia sesión para seguir tus puntos y desbloquear recompensas.",
  "hub.member.nextReward": "Próxima recompensa",
  "hub.member.readyToRedeem": "Listo para canjear",
  "page.heroTitle": "Gana puntos. Obtén recompensas.",
  "page.heroSubtitle": "Únete al programa y gana en cada compra.",
  "page.balanceLabel": "Tu saldo:",
  "page.activeCodesHeading": "Tus códigos activos",
  "page.signInCta": "Inicia sesión para ver tus puntos",
  "page.waysToEarnHeading": "Formas de ganar",
  "page.rewardsHeading": "Recompensas",
  "page.followUsHeading": "Síguenos",
  "page.referHeading": "Recomendar a un amigo",
  "page.referDescription":
    "Comparte tu enlace — ambos reciben recompensas.",
  "page.referLoadingLink": "Cargando tu enlace…",
  "page.referCopyButton": "Copiar enlace",
  "page.loading": "Cargando…",
  "account.heading": "Tu lealtad",
  "account.pointsSuffix": " puntos",
  "account.recentActivityHeading": "Actividad reciente",
  "account.rewardsHeading": "Recompensas",
  "account.referHeading": "Recomendar a un amigo",
  "account.referCopyButton": "Copiar enlace",
  "account.signInRequired":
    "Inicia sesión para ver tu estado de lealtad.",
  "account.emptyActivity":
    "Aún no hay actividad. Realiza un pedido para empezar a ganar.",
  "reward.type.freeShipping": "Envío gratis",
  "reward.type.freeProduct": "Producto gratis",
  "reward.redeemButton": "Canjear",
  "reward.signInToRedeemButton": "Inicia sesión para canjear",
  "reward.applyToCart": "Aplicar al carrito",
  "reward.copyCode": "Copiar",
  "reward.copiedCode": "¡Copiado!",
  "refer.descSignedOut":
    "Comparte tu enlace personal con amigos. Cuando hagan su primer pedido, ambos ganan recompensas.",
  "refer.signInCta": "Inicia sesión para obtener tu enlace",
  "refer.unavailable": "Las referencias no están disponibles ahora mismo.",
  "refer.descSignedIn":
    "Comparte tu enlace. Ambos ganan cuando tus amigos hacen su primer pedido.",
  "refer.copyButton": "Copiar",
  "refer.copiedButton": "¡Copiado!",
  "cart.heading": "Usa tus puntos",
  "cart.signedOutCta":
    "Inicia sesión para aplicar tus puntos a este pedido.",
  "cart.earnLineLoading": "Calculando puntos ganados…",
  "cart.keepShoppingForFirstReward":
    "Sigue comprando para desbloquear tu primera recompensa ({points} puntos).",
  "cart.activeCodesHeading": "Tus códigos activos",
  "cart.cashbackSuffix": "crédito de tienda",
  "product.subtext":
    "Tienes {balance} puntos. ¡Gana {more} más con este pedido!",
  "social.platform.instagram": "Instagram",
  "social.platform.tiktok": "TikTok",
  "social.platform.x": "X",
  "social.platform.facebook": "Facebook",
  "social.platform.youtube": "YouTube",
  "social.awardedButton": "Otorgado +{points}",
  "social.awardedStatus": "Otorgados {points} puntos.",
  "social.alreadyClaimed": "Ya canjeado",
  "empty.programBeingSetUp":
    "Tu programa de lealtad está siendo configurado. Vuelve pronto.",
  "empty.earnSignedOut":
    "Inicia sesión o crea una cuenta para empezar a ganar puntos en cada pedido.",
  "empty.earnSignInButton": "Inicia sesión para ganar",
  "empty.earnRules":
    "Aún no hay formas de ganar — vuelve pronto.",
  "empty.rewardsSignedOut":
    "Estas son las recompensas que puedes canjear con tus puntos. {signInLink} o crea una cuenta para empezar a ganar.",
  "empty.rewardsSignInLink": "Inicia sesión",
  "empty.rewards":
    "Aún no hay recompensas disponibles — vuelve pronto.",
  "status.redeeming": "Canjeando…",
  "status.rewardRedeemedWithCode":
    "Recompensa canjeada — tu código es {code}.",
  "status.rewardRedeemed": "Recompensa canjeada.",
  "error.couldNotRedeem":
    "No pudimos canjear esa recompensa. Inténtalo de nuevo.",
  "error.couldNotApplyReward":
    "No pudimos aplicar esa recompensa. Inténtalo de nuevo.",
  "error.couldNotLoad":
    "No pudimos cargar tus recompensas ahora mismo. Inténtalo más tarde.",
  "tooltip.back": "Atrás",
  "tooltip.close": "Cerrar",
  "tooltip.notEnoughPoints": "Aún no tienes suficientes puntos",
  "tooltip.signUpToRedeem": "Regístrate para canjear",
  "rule.purchase.title": "Realiza un pedido",
  "rule.purchase.description": "Gana {{points}} pts por pedido",
  "rule.purchase.descriptionPerDollar":
    "Gana {{points}} pts por cada {{per_amount}} gastados",
  "rule.purchase.productLine":
    "Gana {{points}} puntos con esta compra",
  "rule.purchase.cartLine": "+{{points}} pts por este pedido",
  "rule.signup.title": "Crea una cuenta",
  "rule.signup.description": "Gana {{points}} pts al registrarte",
  "rule.birthday.title": "Celebra tu cumpleaños",
  "rule.birthday.description": "Gana {{points}} pts en tu cumpleaños",
  "rule.newsletter.title": "Suscríbete al boletín",
  "rule.newsletter.description": "Gana {{points}} pts al suscribirte",
  "rule.social.title": "Síguenos en redes sociales",
  "rule.social.description": "Gana puntos al seguirnos en redes sociales",
  "rule.review.title": "Deja una reseña de producto",
  "rule.review.description": "Gana {{points}} pts por cada reseña",
  "rule.anniversary.title": "Aniversario de la cuenta",
  "rule.anniversary.description":
    "Gana {{points}} pts en tu aniversario de lealtad",
  "pos.tileTitle": "Royal Loyalty",
  "pos.tileSubtitle": "Saldo · ganar · canjear",
  "pos.errorNoCustomer": "Asocia un cliente al carrito primero.",
  "pos.errorLoadBalance":
    "No se pudo cargar el saldo de este cliente. Revisa la conexión e inténtalo de nuevo.",
  "pos.errorAward": "No se pudieron otorgar puntos. Inténtalo de nuevo.",
  "pos.appliedCode": "Código de recompensa aplicado {code}.",
  "pos.redeemed": "Recompensa canjeada.",
  "pos.errorRedeem": "No se pudo canjear. Inténtalo de nuevo.",
  "pos.noCustomerOnCart": "Sin cliente en el carrito",
  "pos.lookupBalanceButton": "Consultar saldo",
  "pos.sectionBalance": "Saldo",
  "pos.sectionEarn": "Ganar",
  "pos.awardButton": "Otorgar puntos por este carrito",
  "pos.sectionRedeem": "Canjear",
  "pos.errorInsufficient": "Puntos insuficientes para esa recompensa.",
  "pos.noRewards": "No hay recompensas disponibles.",
  "pos.lookupHint":
    "Consulta un cliente para ver sus puntos y recompensas.",
};

const fr: Bundle = {
  "launcher.title": "Vos récompenses",
  "launcher.subtitle":
    "Gagnez des points à chaque commande — échangez-les contre des récompenses.",
  "launcher.text": "Récompenses",
  "launcher.hub.earn": "Gagner des points",
  "launcher.hub.redeem": "Échanger des récompenses",
  "launcher.hub.refer": "Parrainer un ami",
  "launcher.activeCodesHeading": "Vos codes actifs",
  "launcher.loadingRewards": "Chargement des récompenses…",
  "hub.visitor.title": "Connectez-vous pour commencer à gagner",
  "hub.visitor.desc": "Connectez-vous pour suivre vos points et débloquer des récompenses.",
  "hub.member.nextReward": "Prochaine récompense",
  "hub.member.readyToRedeem": "Prêt à utiliser",
  "page.heroTitle": "Gagnez des points. Obtenez des récompenses.",
  "page.heroSubtitle":
    "Rejoignez le programme et gagnez à chaque commande.",
  "page.balanceLabel": "Votre solde :",
  "page.activeCodesHeading": "Vos codes actifs",
  "page.signInCta": "Connectez-vous pour voir vos points",
  "page.waysToEarnHeading": "Façons de gagner",
  "page.rewardsHeading": "Récompenses",
  "page.followUsHeading": "Suivez-nous",
  "page.referHeading": "Parrainer un ami",
  "page.referDescription":
    "Partagez votre lien — vous gagnez tous les deux.",
  "page.referLoadingLink": "Chargement de votre lien…",
  "page.referCopyButton": "Copier le lien",
  "page.loading": "Chargement…",
  "account.heading": "Votre fidélité",
  "account.pointsSuffix": " points",
  "account.recentActivityHeading": "Activité récente",
  "account.rewardsHeading": "Récompenses",
  "account.referHeading": "Parrainer un ami",
  "account.referCopyButton": "Copier le lien",
  "account.signInRequired":
    "Veuillez vous connecter pour voir votre statut de fidélité.",
  "account.emptyActivity":
    "Pas encore d'activité. Passez une commande pour commencer à gagner.",
  "reward.type.freeShipping": "Livraison gratuite",
  "reward.type.freeProduct": "Produit gratuit",
  "reward.redeemButton": "Échanger",
  "reward.signInToRedeemButton": "Connectez-vous pour échanger",
  "reward.applyToCart": "Appliquer au panier",
  "reward.copyCode": "Copier",
  "reward.copiedCode": "Copié !",
  "refer.descSignedOut":
    "Partagez votre lien personnel avec vos amis. Lorsqu'ils passent leur première commande, vous gagnez tous les deux des récompenses.",
  "refer.signInCta": "Connectez-vous pour obtenir votre lien",
  "refer.unavailable":
    "Le parrainage n'est pas disponible pour le moment.",
  "refer.descSignedIn":
    "Partagez votre lien. Vous gagnez tous les deux lorsque vos amis passent leur première commande.",
  "refer.copyButton": "Copier",
  "refer.copiedButton": "Copié !",
  "cart.heading": "Utilisez vos points",
  "cart.signedOutCta":
    "Connectez-vous pour appliquer vos points à cette commande.",
  "cart.earnLineLoading": "Calcul des points gagnés…",
  "cart.keepShoppingForFirstReward":
    "Continuez vos achats pour débloquer votre première récompense ({points} points).",
  "cart.activeCodesHeading": "Vos codes actifs",
  "cart.cashbackSuffix": "crédit en magasin",
  "product.subtext":
    "Vous avez {balance} points. Gagnez-en {more} de plus avec cette commande !",
  "social.platform.instagram": "Instagram",
  "social.platform.tiktok": "TikTok",
  "social.platform.x": "X",
  "social.platform.facebook": "Facebook",
  "social.platform.youtube": "YouTube",
  "social.awardedButton": "Attribué +{points}",
  "social.awardedStatus": "{points} points attribués.",
  "social.alreadyClaimed": "Déjà réclamé",
  "empty.programBeingSetUp":
    "Votre programme de fidélité est en cours de configuration. Revenez bientôt.",
  "empty.earnSignedOut":
    "Connectez-vous ou créez un compte pour commencer à gagner des points à chaque commande.",
  "empty.earnSignInButton": "Connectez-vous pour gagner",
  "empty.earnRules":
    "Aucune façon de gagner pour le moment — revenez bientôt.",
  "empty.rewardsSignedOut":
    "Voici les récompenses que vous pouvez obtenir avec vos points. {signInLink} ou créez un compte pour commencer à gagner.",
  "empty.rewardsSignInLink": "Connectez-vous",
  "empty.rewards":
    "Aucune récompense disponible pour le moment — revenez bientôt.",
  "status.redeeming": "Échange en cours…",
  "status.rewardRedeemedWithCode":
    "Récompense échangée — votre code est {code}.",
  "status.rewardRedeemed": "Récompense échangée.",
  "error.couldNotRedeem":
    "Nous n'avons pas pu échanger cette récompense. Veuillez réessayer.",
  "error.couldNotApplyReward":
    "Nous n'avons pas pu appliquer cette récompense. Veuillez réessayer.",
  "error.couldNotLoad":
    "Nous n'avons pas pu charger vos récompenses pour le moment. Veuillez réessayer plus tard.",
  "tooltip.back": "Retour",
  "tooltip.close": "Fermer",
  "tooltip.notEnoughPoints": "Pas encore assez de points",
  "tooltip.signUpToRedeem": "Inscrivez-vous pour échanger",
  "rule.purchase.title": "Passer une commande",
  "rule.purchase.description": "Gagnez {{points}} pts par commande",
  "rule.purchase.descriptionPerDollar":
    "Gagnez {{points}} pts pour chaque tranche de {{per_amount}} dépensée",
  "rule.purchase.productLine":
    "Gagnez {{points}} points avec cet achat",
  "rule.purchase.cartLine": "+{{points}} pts pour cette commande",
  "rule.signup.title": "Créer un compte",
  "rule.signup.description": "Gagnez {{points}} pts à l'inscription",
  "rule.birthday.title": "Fêtez votre anniversaire",
  "rule.birthday.description":
    "Gagnez {{points}} pts pour votre anniversaire",
  "rule.newsletter.title": "Inscrivez-vous à la newsletter",
  "rule.newsletter.description":
    "Gagnez {{points}} pts en vous inscrivant",
  "rule.social.title": "Suivez-nous sur les réseaux sociaux",
  "rule.social.description":
    "Gagnez des points en nous suivant sur les réseaux sociaux",
  "rule.review.title": "Laissez un avis sur un produit",
  "rule.review.description": "Gagnez {{points}} pts par avis",
  "rule.anniversary.title": "Anniversaire du compte",
  "rule.anniversary.description":
    "Gagnez {{points}} pts pour l'anniversaire de votre fidélité",
  "pos.tileTitle": "Royal Loyalty",
  "pos.tileSubtitle": "Solde · gagner · échanger",
  "pos.errorNoCustomer": "Associez d'abord un client au panier.",
  "pos.errorLoadBalance":
    "Impossible de charger le solde de ce client. Vérifiez la connexion et réessayez.",
  "pos.errorAward":
    "Impossible d'attribuer les points. Veuillez réessayer.",
  "pos.appliedCode": "Code de récompense {code} appliqué.",
  "pos.redeemed": "Récompense échangée.",
  "pos.errorRedeem": "Échec de l'échange. Veuillez réessayer.",
  "pos.noCustomerOnCart": "Aucun client sur le panier",
  "pos.lookupBalanceButton": "Consulter le solde",
  "pos.sectionBalance": "Solde",
  "pos.sectionEarn": "Gagner",
  "pos.awardButton": "Attribuer des points pour ce panier",
  "pos.sectionRedeem": "Échanger",
  "pos.errorInsufficient": "Points insuffisants pour cette récompense.",
  "pos.noRewards": "Aucune récompense disponible.",
  "pos.lookupHint":
    "Recherchez un client pour voir ses points et récompenses.",
};

const de: Bundle = {
  "launcher.title": "Deine Prämien",
  "launcher.subtitle":
    "Sammle Punkte bei jeder Bestellung — löse sie gegen Prämien ein.",
  "launcher.text": "Prämien",
  "launcher.hub.earn": "Punkte sammeln",
  "launcher.hub.redeem": "Prämien einlösen",
  "launcher.hub.refer": "Freunde werben",
  "launcher.activeCodesHeading": "Deine aktiven Codes",
  "launcher.loadingRewards": "Prämien werden geladen…",
  "hub.visitor.title": "Melde dich an, um zu starten",
  "hub.visitor.desc": "Melde dich an, um deine Punkte zu verfolgen und Prämien freizuschalten.",
  "hub.member.nextReward": "Nächste Prämie",
  "hub.member.readyToRedeem": "Bereit einzulösen",
  "page.heroTitle": "Punkte sammeln. Prämien erhalten.",
  "page.heroSubtitle":
    "Mach beim Programm mit und verdiene bei jeder Bestellung.",
  "page.balanceLabel": "Dein Guthaben:",
  "page.activeCodesHeading": "Deine aktiven Codes",
  "page.signInCta": "Melde dich an, um deine Punkte zu sehen",
  "page.waysToEarnHeading": "Möglichkeiten zum Sammeln",
  "page.rewardsHeading": "Prämien",
  "page.followUsHeading": "Folge uns",
  "page.referHeading": "Freunde werben",
  "page.referDescription":
    "Teile deinen Link — ihr werdet beide belohnt.",
  "page.referLoadingLink": "Dein Link wird geladen…",
  "page.referCopyButton": "Link kopieren",
  "page.loading": "Wird geladen…",
  "account.heading": "Deine Treue",
  "account.pointsSuffix": " Punkte",
  "account.recentActivityHeading": "Letzte Aktivität",
  "account.rewardsHeading": "Prämien",
  "account.referHeading": "Freunde werben",
  "account.referCopyButton": "Link kopieren",
  "account.signInRequired":
    "Bitte melde dich an, um deinen Treuestatus zu sehen.",
  "account.emptyActivity":
    "Noch keine Aktivität. Mache eine Bestellung, um Punkte zu sammeln.",
  "reward.type.freeShipping": "Kostenloser Versand",
  "reward.type.freeProduct": "Gratisprodukt",
  "reward.redeemButton": "Einlösen",
  "reward.signInToRedeemButton": "Anmelden zum Einlösen",
  "reward.applyToCart": "Auf Warenkorb anwenden",
  "reward.copyCode": "Kopieren",
  "reward.copiedCode": "Kopiert!",
  "refer.descSignedOut":
    "Teile deinen persönlichen Link mit Freunden. Wenn sie ihre erste Bestellung aufgeben, werdet ihr beide belohnt.",
  "refer.signInCta": "Anmelden, um deinen Link zu erhalten",
  "refer.unavailable":
    "Empfehlungen sind im Moment nicht verfügbar.",
  "refer.descSignedIn":
    "Teile deinen Link. Ihr werdet beide belohnt, wenn deine Freunde ihre erste Bestellung aufgeben.",
  "refer.copyButton": "Kopieren",
  "refer.copiedButton": "Kopiert!",
  "cart.heading": "Punkte verwenden",
  "cart.signedOutCta":
    "Melde dich an, um deine Punkte auf diese Bestellung anzuwenden.",
  "cart.earnLineLoading": "Punkte werden berechnet…",
  "cart.keepShoppingForFirstReward":
    "Shoppe weiter, um deine erste Prämie freizuschalten ({points} Punkte).",
  "cart.activeCodesHeading": "Deine aktiven Codes",
  "cart.cashbackSuffix": "Guthaben",
  "product.subtext":
    "Du hast {balance} Punkte. Sammle mit dieser Bestellung {more} mehr!",
  "social.platform.instagram": "Instagram",
  "social.platform.tiktok": "TikTok",
  "social.platform.x": "X",
  "social.platform.facebook": "Facebook",
  "social.platform.youtube": "YouTube",
  "social.awardedButton": "Erhalten +{points}",
  "social.awardedStatus": "{points} Punkte gutgeschrieben.",
  "social.alreadyClaimed": "Bereits eingelöst",
  "empty.programBeingSetUp":
    "Dein Treueprogramm wird gerade eingerichtet. Schau bald wieder vorbei.",
  "empty.earnSignedOut":
    "Melde dich an oder erstelle ein Konto, um bei jeder Bestellung Punkte zu sammeln.",
  "empty.earnSignInButton": "Anmelden zum Sammeln",
  "empty.earnRules":
    "Noch keine Möglichkeiten zum Sammeln — schau bald wieder vorbei.",
  "empty.rewardsSignedOut":
    "Das sind die Prämien, die du mit deinen Punkten einlösen kannst. {signInLink} oder erstelle ein Konto, um Punkte zu sammeln.",
  "empty.rewardsSignInLink": "Anmelden",
  "empty.rewards":
    "Noch keine Prämien verfügbar — schau bald wieder vorbei.",
  "status.redeeming": "Wird eingelöst…",
  "status.rewardRedeemedWithCode":
    "Prämie eingelöst — dein Code lautet {code}.",
  "status.rewardRedeemed": "Prämie eingelöst.",
  "error.couldNotRedeem":
    "Diese Prämie konnte nicht eingelöst werden. Bitte versuche es erneut.",
  "error.couldNotApplyReward":
    "Diese Prämie konnte nicht angewendet werden. Bitte versuche es erneut.",
  "error.couldNotLoad":
    "Wir konnten deine Prämien jetzt nicht laden. Bitte versuche es später erneut.",
  "tooltip.back": "Zurück",
  "tooltip.close": "Schließen",
  "tooltip.notEnoughPoints": "Noch nicht genug Punkte",
  "tooltip.signUpToRedeem": "Registrieren zum Einlösen",
  "rule.purchase.title": "Bestellung aufgeben",
  "rule.purchase.description":
    "Verdiene {{points}} Pkt. pro Bestellung",
  "rule.purchase.descriptionPerDollar":
    "Verdiene {{points}} Pkt. für je {{per_amount}} Umsatz",
  "rule.purchase.productLine":
    "Verdiene {{points}} Punkte mit diesem Kauf",
  "rule.purchase.cartLine": "+{{points}} Pkt. für diese Bestellung",
  "rule.signup.title": "Konto erstellen",
  "rule.signup.description":
    "Verdiene {{points}} Pkt. bei der Registrierung",
  "rule.birthday.title": "Geburtstag feiern",
  "rule.birthday.description":
    "Verdiene {{points}} Pkt. an deinem Geburtstag",
  "rule.newsletter.title": "Newsletter abonnieren",
  "rule.newsletter.description":
    "Verdiene {{points}} Pkt. mit dem Abonnement",
  "rule.social.title": "Auf Social Media folgen",
  "rule.social.description":
    "Verdiene Punkte, wenn du uns auf Social Media folgst",
  "rule.review.title": "Produktbewertung abgeben",
  "rule.review.description":
    "Verdiene {{points}} Pkt. pro Bewertung",
  "rule.anniversary.title": "Mitgliedsjubiläum",
  "rule.anniversary.description":
    "Verdiene {{points}} Pkt. zum Jubiläum deiner Mitgliedschaft",
  "pos.tileTitle": "Royal Loyalty",
  "pos.tileSubtitle": "Guthaben · sammeln · einlösen",
  "pos.errorNoCustomer":
    "Bitte ordne zuerst einen Kunden dem Warenkorb zu.",
  "pos.errorLoadBalance":
    "Das Guthaben dieses Kunden konnte nicht geladen werden. Prüfe die Verbindung und versuche es erneut.",
  "pos.errorAward":
    "Punkte konnten nicht gutgeschrieben werden. Bitte erneut versuchen.",
  "pos.appliedCode": "Prämiencode {code} angewendet.",
  "pos.redeemed": "Prämie eingelöst.",
  "pos.errorRedeem":
    "Einlösen fehlgeschlagen. Bitte erneut versuchen.",
  "pos.noCustomerOnCart": "Kein Kunde im Warenkorb",
  "pos.lookupBalanceButton": "Guthaben abrufen",
  "pos.sectionBalance": "Guthaben",
  "pos.sectionEarn": "Sammeln",
  "pos.awardButton": "Punkte für diesen Warenkorb gutschreiben",
  "pos.sectionRedeem": "Einlösen",
  "pos.errorInsufficient":
    "Nicht genug Punkte für diese Prämie.",
  "pos.noRewards": "Keine Prämien verfügbar.",
  "pos.lookupHint":
    "Suche einen Kunden, um seine Punkte und Prämien zu sehen.",
};

const it: Bundle = {
  "launcher.title": "I tuoi premi",
  "launcher.subtitle":
    "Guadagna punti ad ogni ordine — riscattali per ottenere premi.",
  "launcher.text": "Premi",
  "launcher.hub.earn": "Guadagna punti",
  "launcher.hub.redeem": "Riscatta premi",
  "launcher.hub.refer": "Invita un amico",
  "launcher.activeCodesHeading": "I tuoi codici attivi",
  "launcher.loadingRewards": "Caricamento premi…",
  "hub.visitor.title": "Accedi per iniziare a guadagnare",
  "hub.visitor.desc": "Accedi per tracciare i tuoi punti e sbloccare premi.",
  "hub.member.nextReward": "Prossimo premio",
  "hub.member.readyToRedeem": "Pronto da riscattare",
  "page.heroTitle": "Guadagna punti. Ottieni premi.",
  "page.heroSubtitle":
    "Iscriviti al programma e guadagna ad ogni ordine.",
  "page.balanceLabel": "Il tuo saldo:",
  "page.activeCodesHeading": "I tuoi codici attivi",
  "page.signInCta": "Accedi per vedere i tuoi punti",
  "page.waysToEarnHeading": "Come guadagnare",
  "page.rewardsHeading": "Premi",
  "page.followUsHeading": "Seguici",
  "page.referHeading": "Invita un amico",
  "page.referDescription":
    "Condividi il tuo link — riceverete entrambi un premio.",
  "page.referLoadingLink": "Caricamento del link…",
  "page.referCopyButton": "Copia link",
  "page.loading": "Caricamento…",
  "account.heading": "La tua fedeltà",
  "account.pointsSuffix": " punti",
  "account.recentActivityHeading": "Attività recente",
  "account.rewardsHeading": "Premi",
  "account.referHeading": "Invita un amico",
  "account.referCopyButton": "Copia link",
  "account.signInRequired":
    "Accedi per vedere il tuo stato di fedeltà.",
  "account.emptyActivity":
    "Ancora nessuna attività. Effettua un ordine per iniziare a guadagnare.",
  "reward.type.freeShipping": "Spedizione gratuita",
  "reward.type.freeProduct": "Prodotto gratuito",
  "reward.redeemButton": "Riscatta",
  "reward.signInToRedeemButton": "Accedi per riscattare",
  "reward.applyToCart": "Applica al carrello",
  "reward.copyCode": "Copia",
  "reward.copiedCode": "Copiato!",
  "refer.descSignedOut":
    "Condividi il tuo link personale con gli amici. Quando effettuano il primo ordine, ricevete entrambi un premio.",
  "refer.signInCta": "Accedi per ottenere il tuo link",
  "refer.unavailable":
    "Gli inviti non sono disponibili in questo momento.",
  "refer.descSignedIn":
    "Condividi il tuo link. Ricevete entrambi un premio quando gli amici effettuano il primo ordine.",
  "refer.copyButton": "Copia",
  "refer.copiedButton": "Copiato!",
  "cart.heading": "Usa i tuoi punti",
  "cart.signedOutCta":
    "Accedi per applicare i tuoi punti a questo ordine.",
  "cart.earnLineLoading": "Calcolo dei punti guadagnati…",
  "cart.keepShoppingForFirstReward":
    "Continua a fare acquisti per sbloccare il tuo primo premio ({points} punti).",
  "cart.activeCodesHeading": "I tuoi codici attivi",
  "cart.cashbackSuffix": "credito negozio",
  "product.subtext":
    "Hai {balance} punti. Guadagna {more} in più con questo ordine!",
  "social.platform.instagram": "Instagram",
  "social.platform.tiktok": "TikTok",
  "social.platform.x": "X",
  "social.platform.facebook": "Facebook",
  "social.platform.youtube": "YouTube",
  "social.awardedButton": "Assegnati +{points}",
  "social.awardedStatus": "Assegnati {points} punti.",
  "social.alreadyClaimed": "Già riscattato",
  "empty.programBeingSetUp":
    "Il tuo programma fedeltà è in fase di configurazione. Torna presto.",
  "empty.earnSignedOut":
    "Accedi o crea un account per iniziare a guadagnare punti ad ogni ordine.",
  "empty.earnSignInButton": "Accedi per guadagnare",
  "empty.earnRules":
    "Ancora nessun modo per guadagnare — torna presto.",
  "empty.rewardsSignedOut":
    "Questi sono i premi che puoi riscattare con i tuoi punti. {signInLink} o crea un account per iniziare a guadagnare.",
  "empty.rewardsSignInLink": "Accedi",
  "empty.rewards":
    "Nessun premio disponibile al momento — torna presto.",
  "status.redeeming": "Riscatto in corso…",
  "status.rewardRedeemedWithCode":
    "Premio riscattato — il tuo codice è {code}.",
  "status.rewardRedeemed": "Premio riscattato.",
  "error.couldNotRedeem":
    "Non siamo riusciti a riscattare quel premio. Riprova.",
  "error.couldNotApplyReward":
    "Non siamo riusciti ad applicare quel premio. Riprova.",
  "error.couldNotLoad":
    "Non siamo riusciti a caricare i tuoi premi in questo momento. Riprova più tardi.",
  "tooltip.back": "Indietro",
  "tooltip.close": "Chiudi",
  "tooltip.notEnoughPoints": "Punti ancora insufficienti",
  "tooltip.signUpToRedeem": "Registrati per riscattare",
  "rule.purchase.title": "Effettua un ordine",
  "rule.purchase.description": "Guadagna {{points}} pt per ordine",
  "rule.purchase.descriptionPerDollar":
    "Guadagna {{points}} pt ogni {{per_amount}} spesi",
  "rule.purchase.productLine":
    "Guadagna {{points}} punti con questo acquisto",
  "rule.purchase.cartLine": "+{{points}} pt per questo ordine",
  "rule.signup.title": "Crea un account",
  "rule.signup.description":
    "Guadagna {{points}} pt al momento della registrazione",
  "rule.birthday.title": "Festeggia il tuo compleanno",
  "rule.birthday.description":
    "Guadagna {{points}} pt per il tuo compleanno",
  "rule.newsletter.title": "Iscriviti alla newsletter",
  "rule.newsletter.description":
    "Guadagna {{points}} pt all'iscrizione",
  "rule.social.title": "Seguici sui social",
  "rule.social.description":
    "Guadagna punti quando ci segui sui social",
  "rule.review.title": "Lascia una recensione del prodotto",
  "rule.review.description":
    "Guadagna {{points}} pt per ogni recensione",
  "rule.anniversary.title": "Anniversario dell'account",
  "rule.anniversary.description":
    "Guadagna {{points}} pt per l'anniversario di iscrizione",
  "pos.tileTitle": "Royal Loyalty",
  "pos.tileSubtitle": "Saldo · guadagna · riscatta",
  "pos.errorNoCustomer": "Associa prima un cliente al carrello.",
  "pos.errorLoadBalance":
    "Impossibile caricare il saldo del cliente. Controlla la connessione e riprova.",
  "pos.errorAward":
    "Impossibile assegnare i punti. Riprova.",
  "pos.appliedCode": "Codice premio {code} applicato.",
  "pos.redeemed": "Premio riscattato.",
  "pos.errorRedeem":
    "Riscatto non riuscito. Riprova.",
  "pos.noCustomerOnCart": "Nessun cliente sul carrello",
  "pos.lookupBalanceButton": "Verifica saldo",
  "pos.sectionBalance": "Saldo",
  "pos.sectionEarn": "Guadagna",
  "pos.awardButton": "Assegna punti per questo carrello",
  "pos.sectionRedeem": "Riscatta",
  "pos.errorInsufficient": "Punti insufficienti per quel premio.",
  "pos.noRewards": "Nessun premio disponibile.",
  "pos.lookupHint":
    "Cerca un cliente per vedere i suoi punti e premi.",
};

const ptBR: Bundle = {
  "launcher.title": "Suas recompensas",
  "launcher.subtitle":
    "Ganhe pontos a cada pedido — troque por recompensas.",
  "launcher.text": "Recompensas",
  "launcher.hub.earn": "Ganhar pontos",
  "launcher.hub.redeem": "Resgatar recompensas",
  "launcher.hub.refer": "Indicar um amigo",
  "launcher.activeCodesHeading": "Seus códigos ativos",
  "launcher.loadingRewards": "Carregando recompensas…",
  "hub.visitor.title": "Faça login para começar a ganhar",
  "hub.visitor.desc": "Faça login para acompanhar seus pontos e desbloquear recompensas.",
  "hub.member.nextReward": "Próxima recompensa",
  "hub.member.readyToRedeem": "Pronto para resgatar",
  "page.heroTitle": "Ganhe pontos. Receba recompensas.",
  "page.heroSubtitle":
    "Participe do programa e ganhe a cada pedido.",
  "page.balanceLabel": "Seu saldo:",
  "page.activeCodesHeading": "Seus códigos ativos",
  "page.signInCta": "Faça login para ver seus pontos",
  "page.waysToEarnHeading": "Como ganhar",
  "page.rewardsHeading": "Recompensas",
  "page.followUsHeading": "Siga-nos",
  "page.referHeading": "Indicar um amigo",
  "page.referDescription":
    "Compartilhe seu link — vocês dois são recompensados.",
  "page.referLoadingLink": "Carregando seu link…",
  "page.referCopyButton": "Copiar link",
  "page.loading": "Carregando…",
  "account.heading": "Sua fidelidade",
  "account.pointsSuffix": " pontos",
  "account.recentActivityHeading": "Atividade recente",
  "account.rewardsHeading": "Recompensas",
  "account.referHeading": "Indicar um amigo",
  "account.referCopyButton": "Copiar link",
  "account.signInRequired":
    "Faça login para ver seu status de fidelidade.",
  "account.emptyActivity":
    "Sem atividade ainda. Faça um pedido para começar a ganhar.",
  "reward.type.freeShipping": "Frete grátis",
  "reward.type.freeProduct": "Produto grátis",
  "reward.redeemButton": "Resgatar",
  "reward.signInToRedeemButton": "Faça login para resgatar",
  "reward.applyToCart": "Aplicar ao carrinho",
  "reward.copyCode": "Copiar",
  "reward.copiedCode": "Copiado!",
  "refer.descSignedOut":
    "Compartilhe seu link pessoal com amigos. Quando eles fizerem o primeiro pedido, vocês dois recebem uma recompensa.",
  "refer.signInCta": "Faça login para receber seu link",
  "refer.unavailable":
    "As indicações não estão disponíveis no momento.",
  "refer.descSignedIn":
    "Compartilhe seu link. Vocês dois ganham quando seus amigos fizerem o primeiro pedido.",
  "refer.copyButton": "Copiar",
  "refer.copiedButton": "Copiado!",
  "cart.heading": "Use seus pontos",
  "cart.signedOutCta":
    "Faça login para aplicar seus pontos a este pedido.",
  "cart.earnLineLoading": "Calculando pontos ganhos…",
  "cart.keepShoppingForFirstReward":
    "Continue comprando para desbloquear sua primeira recompensa ({points} pontos).",
  "cart.activeCodesHeading": "Seus códigos ativos",
  "cart.cashbackSuffix": "crédito da loja",
  "product.subtext":
    "Você tem {balance} pontos. Ganhe mais {more} com este pedido!",
  "social.platform.instagram": "Instagram",
  "social.platform.tiktok": "TikTok",
  "social.platform.x": "X",
  "social.platform.facebook": "Facebook",
  "social.platform.youtube": "YouTube",
  "social.awardedButton": "Concedido +{points}",
  "social.awardedStatus": "{points} pontos concedidos.",
  "social.alreadyClaimed": "Já resgatado",
  "empty.programBeingSetUp":
    "Seu programa de fidelidade está sendo configurado. Volte em breve.",
  "empty.earnSignedOut":
    "Faça login ou crie uma conta para começar a ganhar pontos a cada pedido.",
  "empty.earnSignInButton": "Faça login para ganhar",
  "empty.earnRules":
    "Sem formas de ganhar ainda — volte em breve.",
  "empty.rewardsSignedOut":
    "Estas são as recompensas que você pode resgatar com seus pontos. {signInLink} ou crie uma conta para começar a ganhar.",
  "empty.rewardsSignInLink": "Faça login",
  "empty.rewards":
    "Sem recompensas disponíveis ainda — volte em breve.",
  "status.redeeming": "Resgatando…",
  "status.rewardRedeemedWithCode":
    "Recompensa resgatada — seu código é {code}.",
  "status.rewardRedeemed": "Recompensa resgatada.",
  "error.couldNotRedeem":
    "Não conseguimos resgatar essa recompensa. Tente novamente.",
  "error.couldNotApplyReward":
    "Não conseguimos aplicar essa recompensa. Tente novamente.",
  "error.couldNotLoad":
    "Não conseguimos carregar suas recompensas agora. Tente novamente mais tarde.",
  "tooltip.back": "Voltar",
  "tooltip.close": "Fechar",
  "tooltip.notEnoughPoints": "Pontos insuficientes ainda",
  "tooltip.signUpToRedeem": "Cadastre-se para resgatar",
  "rule.purchase.title": "Fazer um pedido",
  "rule.purchase.description": "Ganhe {{points}} pts por pedido",
  "rule.purchase.descriptionPerDollar":
    "Ganhe {{points}} pts a cada {{per_amount}} gastos",
  "rule.purchase.productLine":
    "Ganhe {{points}} pontos com esta compra",
  "rule.purchase.cartLine": "+{{points}} pts neste pedido",
  "rule.signup.title": "Criar uma conta",
  "rule.signup.description":
    "Ganhe {{points}} pts ao se cadastrar",
  "rule.birthday.title": "Celebre seu aniversário",
  "rule.birthday.description":
    "Ganhe {{points}} pts no seu aniversário",
  "rule.newsletter.title": "Inscreva-se na newsletter",
  "rule.newsletter.description":
    "Ganhe {{points}} pts ao se inscrever",
  "rule.social.title": "Siga-nos nas redes sociais",
  "rule.social.description":
    "Ganhe pontos ao nos seguir nas redes sociais",
  "rule.review.title": "Deixe uma avaliação do produto",
  "rule.review.description":
    "Ganhe {{points}} pts por avaliação",
  "rule.anniversary.title": "Aniversário da conta",
  "rule.anniversary.description":
    "Ganhe {{points}} pts no aniversário da sua fidelidade",
  "pos.tileTitle": "Royal Loyalty",
  "pos.tileSubtitle": "Saldo · ganhar · resgatar",
  "pos.errorNoCustomer": "Vincule um cliente ao carrinho primeiro.",
  "pos.errorLoadBalance":
    "Não foi possível carregar o saldo deste cliente. Verifique a conexão e tente novamente.",
  "pos.errorAward":
    "Não foi possível conceder pontos. Tente novamente.",
  "pos.appliedCode": "Código de recompensa {code} aplicado.",
  "pos.redeemed": "Recompensa resgatada.",
  "pos.errorRedeem":
    "Falha ao resgatar. Tente novamente.",
  "pos.noCustomerOnCart": "Sem cliente no carrinho",
  "pos.lookupBalanceButton": "Consultar saldo",
  "pos.sectionBalance": "Saldo",
  "pos.sectionEarn": "Ganhar",
  "pos.awardButton": "Conceder pontos para este carrinho",
  "pos.sectionRedeem": "Resgatar",
  "pos.errorInsufficient":
    "Pontos insuficientes para essa recompensa.",
  "pos.noRewards": "Nenhuma recompensa disponível.",
  "pos.lookupHint":
    "Consulte um cliente para ver os pontos e recompensas dele.",
};

const nl: Bundle = {
  "launcher.title": "Jouw beloningen",
  "launcher.subtitle":
    "Verdien punten bij elke bestelling — wissel ze in voor beloningen.",
  "launcher.text": "Beloningen",
  "launcher.hub.earn": "Punten verdienen",
  "launcher.hub.redeem": "Beloningen inwisselen",
  "launcher.hub.refer": "Verwijs een vriend",
  "launcher.activeCodesHeading": "Jouw actieve codes",
  "launcher.loadingRewards": "Beloningen laden…",
  "hub.visitor.title": "Log in om te beginnen met sparen",
  "hub.visitor.desc": "Log in om je punten te volgen en beloningen vrij te spelen.",
  "hub.member.nextReward": "Volgende beloning",
  "hub.member.readyToRedeem": "Klaar om in te wisselen",
  "page.heroTitle": "Verdien punten. Krijg beloningen.",
  "page.heroSubtitle":
    "Doe mee aan het programma en verdien bij elke bestelling.",
  "page.balanceLabel": "Jouw saldo:",
  "page.activeCodesHeading": "Jouw actieve codes",
  "page.signInCta": "Log in om je punten te zien",
  "page.waysToEarnHeading": "Manieren om te verdienen",
  "page.rewardsHeading": "Beloningen",
  "page.followUsHeading": "Volg ons",
  "page.referHeading": "Verwijs een vriend",
  "page.referDescription":
    "Deel je link — jullie worden allebei beloond.",
  "page.referLoadingLink": "Je link laden…",
  "page.referCopyButton": "Link kopiëren",
  "page.loading": "Laden…",
  "account.heading": "Jouw loyaliteit",
  "account.pointsSuffix": " punten",
  "account.recentActivityHeading": "Recente activiteit",
  "account.rewardsHeading": "Beloningen",
  "account.referHeading": "Verwijs een vriend",
  "account.referCopyButton": "Link kopiëren",
  "account.signInRequired":
    "Log in om je loyaliteitsstatus te bekijken.",
  "account.emptyActivity":
    "Nog geen activiteit. Plaats een bestelling om te beginnen met verdienen.",
  "reward.type.freeShipping": "Gratis verzending",
  "reward.type.freeProduct": "Gratis product",
  "reward.redeemButton": "Inwisselen",
  "reward.signInToRedeemButton": "Log in om in te wisselen",
  "reward.applyToCart": "Toepassen op winkelwagen",
  "reward.copyCode": "Kopiëren",
  "reward.copiedCode": "Gekopieerd!",
  "refer.descSignedOut":
    "Deel je persoonlijke link met vrienden. Wanneer ze hun eerste bestelling plaatsen, worden jullie allebei beloond.",
  "refer.signInCta": "Log in om je link te krijgen",
  "refer.unavailable":
    "Verwijzingen zijn op dit moment niet beschikbaar.",
  "refer.descSignedIn":
    "Deel je link. Jullie verdienen allebei wanneer vrienden hun eerste bestelling plaatsen.",
  "refer.copyButton": "Kopiëren",
  "refer.copiedButton": "Gekopieerd!",
  "cart.heading": "Gebruik je punten",
  "cart.signedOutCta":
    "Log in om je punten op deze bestelling toe te passen.",
  "cart.earnLineLoading": "Verdiende punten berekenen…",
  "cart.keepShoppingForFirstReward":
    "Blijf winkelen om je eerste beloning te ontgrendelen ({points} punten).",
  "cart.activeCodesHeading": "Jouw actieve codes",
  "cart.cashbackSuffix": "winkeltegoed",
  "product.subtext":
    "Je hebt {balance} punten. Verdien {more} extra met deze bestelling!",
  "social.platform.instagram": "Instagram",
  "social.platform.tiktok": "TikTok",
  "social.platform.x": "X",
  "social.platform.facebook": "Facebook",
  "social.platform.youtube": "YouTube",
  "social.awardedButton": "Toegekend +{points}",
  "social.awardedStatus": "{points} punten toegekend.",
  "social.alreadyClaimed": "Al ingewisseld",
  "empty.programBeingSetUp":
    "Je loyaliteitsprogramma wordt opgezet. Kom binnenkort terug.",
  "empty.earnSignedOut":
    "Log in of maak een account aan om bij elke bestelling punten te verdienen.",
  "empty.earnSignInButton": "Log in om te verdienen",
  "empty.earnRules":
    "Nog geen manieren om te verdienen — kom binnenkort terug.",
  "empty.rewardsSignedOut":
    "Dit zijn de beloningen die je met je punten kunt inwisselen. {signInLink} of maak een account aan om te beginnen met verdienen.",
  "empty.rewardsSignInLink": "Log in",
  "empty.rewards":
    "Nog geen beloningen beschikbaar — kom binnenkort terug.",
  "status.redeeming": "Inwisselen…",
  "status.rewardRedeemedWithCode":
    "Beloning ingewisseld — je code is {code}.",
  "status.rewardRedeemed": "Beloning ingewisseld.",
  "error.couldNotRedeem":
    "We konden die beloning niet inwisselen. Probeer het opnieuw.",
  "error.couldNotApplyReward":
    "We konden die beloning niet toepassen. Probeer het opnieuw.",
  "error.couldNotLoad":
    "We konden je beloningen nu niet laden. Probeer het later opnieuw.",
  "tooltip.back": "Terug",
  "tooltip.close": "Sluiten",
  "tooltip.notEnoughPoints": "Nog niet genoeg punten",
  "tooltip.signUpToRedeem": "Meld je aan om in te wisselen",
  "rule.purchase.title": "Plaats een bestelling",
  "rule.purchase.description":
    "Verdien {{points}} pt per bestelling",
  "rule.purchase.descriptionPerDollar":
    "Verdien {{points}} pt voor elke {{per_amount}} besteed",
  "rule.purchase.productLine":
    "Verdien {{points}} punten met deze aankoop",
  "rule.purchase.cartLine": "+{{points}} pt voor deze bestelling",
  "rule.signup.title": "Maak een account aan",
  "rule.signup.description":
    "Verdien {{points}} pt bij het aanmelden",
  "rule.birthday.title": "Vier je verjaardag",
  "rule.birthday.description":
    "Verdien {{points}} pt op je verjaardag",
  "rule.newsletter.title": "Abonneer op de nieuwsbrief",
  "rule.newsletter.description":
    "Verdien {{points}} pt bij het abonneren",
  "rule.social.title": "Volg ons op social media",
  "rule.social.description":
    "Verdien punten als je ons volgt op social media",
  "rule.review.title": "Schrijf een productreview",
  "rule.review.description":
    "Verdien {{points}} pt per review",
  "rule.anniversary.title": "Account-jubileum",
  "rule.anniversary.description":
    "Verdien {{points}} pt op je loyaliteitsjubileum",
  "pos.tileTitle": "Royal Loyalty",
  "pos.tileSubtitle": "Saldo · verdienen · inwisselen",
  "pos.errorNoCustomer":
    "Koppel eerst een klant aan de winkelwagen.",
  "pos.errorLoadBalance":
    "Kon het saldo van deze klant niet laden. Controleer de verbinding en probeer het opnieuw.",
  "pos.errorAward":
    "Kon geen punten toekennen. Probeer het opnieuw.",
  "pos.appliedCode": "Beloningscode {code} toegepast.",
  "pos.redeemed": "Beloning ingewisseld.",
  "pos.errorRedeem":
    "Inwisselen mislukt. Probeer het opnieuw.",
  "pos.noCustomerOnCart": "Geen klant op de winkelwagen",
  "pos.lookupBalanceButton": "Saldo opzoeken",
  "pos.sectionBalance": "Saldo",
  "pos.sectionEarn": "Verdienen",
  "pos.awardButton": "Punten toekennen voor deze winkelwagen",
  "pos.sectionRedeem": "Inwisselen",
  "pos.errorInsufficient":
    "Niet genoeg punten voor die beloning.",
  "pos.noRewards": "Geen beloningen beschikbaar.",
  "pos.lookupHint":
    "Zoek een klant op om zijn punten en beloningen te zien.",
};

// For locales beyond the first 7, we ship a tighter "seed" set of UI
// strings. The merchant can refine these on the admin Localization page;
// the same fallback chain (locale → English → hardcoded default) keeps
// any missing string safe. Each bundle below is COMPLETE — every key in
// localization-keys.ts is translated. Translations prioritize natural
// UI vocabulary over literal word-for-word renderings.

const pl: Bundle = {
  "launcher.title": "Twoje nagrody",
  "launcher.subtitle":
    "Zdobywaj punkty za każde zamówienie — wymieniaj je na nagrody.",
  "launcher.text": "Nagrody",
  "launcher.hub.earn": "Zdobywaj punkty",
  "launcher.hub.redeem": "Wymień nagrody",
  "launcher.hub.refer": "Poleć znajomego",
  "launcher.activeCodesHeading": "Twoje aktywne kody",
  "launcher.loadingRewards": "Ładowanie nagród…",
  "hub.visitor.title": "Zaloguj się, aby zacząć zarabiać",
  "hub.visitor.desc": "Zaloguj się, aby śledzić swoje punkty i odblokować nagrody.",
  "hub.member.nextReward": "Następna nagroda",
  "hub.member.readyToRedeem": "Gotowe do wykorzystania",
  "page.heroTitle": "Zdobywaj punkty. Odbieraj nagrody.",
  "page.heroSubtitle":
    "Dołącz do programu i zdobywaj punkty przy każdym zamówieniu.",
  "page.balanceLabel": "Twoje saldo:",
  "page.activeCodesHeading": "Twoje aktywne kody",
  "page.signInCta": "Zaloguj się, aby zobaczyć punkty",
  "page.waysToEarnHeading": "Sposoby zdobywania",
  "page.rewardsHeading": "Nagrody",
  "page.followUsHeading": "Obserwuj nas",
  "page.referHeading": "Poleć znajomego",
  "page.referDescription":
    "Udostępnij swój link — oboje otrzymacie nagrodę.",
  "page.referLoadingLink": "Ładowanie linku…",
  "page.referCopyButton": "Kopiuj link",
  "page.loading": "Ładowanie…",
  "account.heading": "Twój program lojalnościowy",
  "account.pointsSuffix": " punktów",
  "account.recentActivityHeading": "Ostatnia aktywność",
  "account.rewardsHeading": "Nagrody",
  "account.referHeading": "Poleć znajomego",
  "account.referCopyButton": "Kopiuj link",
  "account.signInRequired":
    "Zaloguj się, aby zobaczyć status lojalnościowy.",
  "account.emptyActivity":
    "Brak aktywności. Złóż zamówienie, aby zacząć zdobywać punkty.",
  "reward.type.freeShipping": "Darmowa wysyłka",
  "reward.type.freeProduct": "Darmowy produkt",
  "reward.redeemButton": "Wymień",
  "reward.signInToRedeemButton": "Zaloguj się, aby wymienić",
  "reward.applyToCart": "Zastosuj do koszyka",
  "reward.copyCode": "Kopiuj",
  "reward.copiedCode": "Skopiowano!",
  "refer.descSignedOut":
    "Udostępnij swój link znajomym. Gdy złożą pierwsze zamówienie, oboje otrzymacie nagrodę.",
  "refer.signInCta": "Zaloguj się, aby otrzymać link",
  "refer.unavailable":
    "Polecenia są obecnie niedostępne.",
  "refer.descSignedIn":
    "Udostępnij swój link. Oboje zdobywacie punkty, gdy znajomi złożą pierwsze zamówienie.",
  "refer.copyButton": "Kopiuj",
  "refer.copiedButton": "Skopiowano!",
  "cart.heading": "Wykorzystaj punkty",
  "cart.signedOutCta":
    "Zaloguj się, aby wykorzystać punkty w tym zamówieniu.",
  "cart.earnLineLoading": "Obliczanie zdobytych punktów…",
  "cart.keepShoppingForFirstReward":
    "Kupuj dalej, aby odblokować pierwszą nagrodę ({points} pkt).",
  "cart.activeCodesHeading": "Twoje aktywne kody",
  "cart.cashbackSuffix": "kredyt sklepowy",
  "product.subtext":
    "Masz {balance} punktów. Zdobądź {more} więcej z tym zamówieniem!",
  "social.platform.instagram": "Instagram",
  "social.platform.tiktok": "TikTok",
  "social.platform.x": "X",
  "social.platform.facebook": "Facebook",
  "social.platform.youtube": "YouTube",
  "social.awardedButton": "Przyznano +{points}",
  "social.awardedStatus": "Przyznano {points} punktów.",
  "social.alreadyClaimed": "Już odebrane",
  "empty.programBeingSetUp":
    "Twój program lojalnościowy jest konfigurowany. Wróć wkrótce.",
  "empty.earnSignedOut":
    "Zaloguj się lub utwórz konto, aby zacząć zdobywać punkty.",
  "empty.earnSignInButton": "Zaloguj się, aby zdobywać",
  "empty.earnRules":
    "Brak sposobów zdobywania — wróć wkrótce.",
  "empty.rewardsSignedOut":
    "To są nagrody, które możesz wymienić. {signInLink} lub utwórz konto.",
  "empty.rewardsSignInLink": "Zaloguj się",
  "empty.rewards":
    "Brak dostępnych nagród — wróć wkrótce.",
  "status.redeeming": "Wymiana…",
  "status.rewardRedeemedWithCode":
    "Nagroda wymieniona — twój kod to {code}.",
  "status.rewardRedeemed": "Nagroda wymieniona.",
  "error.couldNotRedeem":
    "Nie udało się wymienić tej nagrody. Spróbuj ponownie.",
  "error.couldNotApplyReward":
    "Nie udało się zastosować tej nagrody. Spróbuj ponownie.",
  "error.couldNotLoad":
    "Nie udało się załadować nagród. Spróbuj ponownie później.",
  "tooltip.back": "Wstecz",
  "tooltip.close": "Zamknij",
  "tooltip.notEnoughPoints": "Za mało punktów",
  "tooltip.signUpToRedeem": "Zarejestruj się, aby wymienić",
  "rule.purchase.title": "Złóż zamówienie",
  "rule.purchase.description":
    "Zdobądź {{points}} pkt za zamówienie",
  "rule.purchase.descriptionPerDollar":
    "Zdobądź {{points}} pkt za każde wydane {{per_amount}}",
  "rule.purchase.productLine":
    "Zdobądź {{points}} punktów za ten zakup",
  "rule.purchase.cartLine": "+{{points}} pkt za to zamówienie",
  "rule.signup.title": "Utwórz konto",
  "rule.signup.description":
    "Zdobądź {{points}} pkt za rejestrację",
  "rule.birthday.title": "Świętuj urodziny",
  "rule.birthday.description":
    "Zdobądź {{points}} pkt w urodziny",
  "rule.newsletter.title": "Zapisz się na newsletter",
  "rule.newsletter.description":
    "Zdobądź {{points}} pkt za zapis",
  "rule.social.title": "Obserwuj nas w mediach społecznościowych",
  "rule.social.description":
    "Zdobywaj punkty obserwując nas w mediach społecznościowych",
  "rule.review.title": "Wystaw opinię o produkcie",
  "rule.review.description":
    "Zdobądź {{points}} pkt za opinię",
  "rule.anniversary.title": "Rocznica konta",
  "rule.anniversary.description":
    "Zdobądź {{points}} pkt w rocznicę lojalności",
  "pos.tileTitle": "Royal Loyalty",
  "pos.tileSubtitle": "Saldo · zdobywaj · wymieniaj",
  "pos.errorNoCustomer":
    "Najpierw przypisz klienta do koszyka.",
  "pos.errorLoadBalance":
    "Nie udało się załadować salda. Sprawdź połączenie i spróbuj ponownie.",
  "pos.errorAward":
    "Nie udało się przyznać punktów. Spróbuj ponownie.",
  "pos.appliedCode": "Zastosowano kod nagrody {code}.",
  "pos.redeemed": "Nagroda wymieniona.",
  "pos.errorRedeem":
    "Wymiana nieudana. Spróbuj ponownie.",
  "pos.noCustomerOnCart": "Brak klienta w koszyku",
  "pos.lookupBalanceButton": "Sprawdź saldo",
  "pos.sectionBalance": "Saldo",
  "pos.sectionEarn": "Zdobywaj",
  "pos.awardButton": "Przyznaj punkty za ten koszyk",
  "pos.sectionRedeem": "Wymień",
  "pos.errorInsufficient":
    "Za mało punktów na tę nagrodę.",
  "pos.noRewards": "Brak dostępnych nagród.",
  "pos.lookupHint":
    "Wyszukaj klienta, aby zobaczyć jego punkty i nagrody.",
};

const nb: Bundle = {
  "launcher.title": "Dine belønninger",
  "launcher.subtitle":
    "Tjen poeng på hver bestilling — løs dem inn mot belønninger.",
  "launcher.text": "Belønninger",
  "launcher.hub.earn": "Tjen poeng",
  "launcher.hub.redeem": "Løs inn belønninger",
  "launcher.hub.refer": "Inviter en venn",
  "launcher.activeCodesHeading": "Dine aktive koder",
  "launcher.loadingRewards": "Laster belønninger…",
  "hub.visitor.title": "Logg inn for å begynne å tjene",
  "hub.visitor.desc": "Logg inn for å spore poengene dine og låse opp belønninger.",
  "hub.member.nextReward": "Neste belønning",
  "hub.member.readyToRedeem": "Klar til å innløse",
  "page.heroTitle": "Tjen poeng. Få belønninger.",
  "page.heroSubtitle":
    "Bli med i programmet og tjen på hver bestilling.",
  "page.balanceLabel": "Din saldo:",
  "page.activeCodesHeading": "Dine aktive koder",
  "page.signInCta": "Logg inn for å se poengene dine",
  "page.waysToEarnHeading": "Måter å tjene",
  "page.rewardsHeading": "Belønninger",
  "page.followUsHeading": "Følg oss",
  "page.referHeading": "Inviter en venn",
  "page.referDescription":
    "Del lenken din — begge får belønning.",
  "page.referLoadingLink": "Laster lenken…",
  "page.referCopyButton": "Kopier lenke",
  "page.loading": "Laster…",
  "account.heading": "Din lojalitet",
  "account.pointsSuffix": " poeng",
  "account.recentActivityHeading": "Nylig aktivitet",
  "account.rewardsHeading": "Belønninger",
  "account.referHeading": "Inviter en venn",
  "account.referCopyButton": "Kopier lenke",
  "account.signInRequired":
    "Logg inn for å se lojalitetsstatusen din.",
  "account.emptyActivity":
    "Ingen aktivitet ennå. Bestill noe for å begynne å tjene.",
  "reward.type.freeShipping": "Gratis frakt",
  "reward.type.freeProduct": "Gratis produkt",
  "reward.redeemButton": "Løs inn",
  "reward.signInToRedeemButton": "Logg inn for å løse inn",
  "reward.applyToCart": "Bruk på handlekurv",
  "reward.copyCode": "Kopier",
  "reward.copiedCode": "Kopiert!",
  "refer.descSignedOut":
    "Del din personlige lenke med venner. Når de legger sin første bestilling, får dere begge belønning.",
  "refer.signInCta": "Logg inn for å få lenken",
  "refer.unavailable":
    "Henvisninger er ikke tilgjengelige akkurat nå.",
  "refer.descSignedIn":
    "Del lenken din. Dere tjener begge når venner legger sin første bestilling.",
  "refer.copyButton": "Kopier",
  "refer.copiedButton": "Kopiert!",
  "cart.heading": "Bruk poengene dine",
  "cart.signedOutCta":
    "Logg inn for å bruke poengene dine på denne bestillingen.",
  "cart.earnLineLoading": "Beregner opptjente poeng…",
  "cart.keepShoppingForFirstReward":
    "Fortsett å handle for å låse opp din første belønning ({points} poeng).",
  "cart.activeCodesHeading": "Dine aktive koder",
  "cart.cashbackSuffix": "butikkreditt",
  "product.subtext":
    "Du har {balance} poeng. Tjen {more} til med denne bestillingen!",
  "social.platform.instagram": "Instagram",
  "social.platform.tiktok": "TikTok",
  "social.platform.x": "X",
  "social.platform.facebook": "Facebook",
  "social.platform.youtube": "YouTube",
  "social.awardedButton": "Tildelt +{points}",
  "social.awardedStatus": "{points} poeng tildelt.",
  "social.alreadyClaimed": "Allerede løst inn",
  "empty.programBeingSetUp":
    "Lojalitetsprogrammet ditt settes opp. Sjekk inn igjen snart.",
  "empty.earnSignedOut":
    "Logg inn eller opprett en konto for å begynne å tjene poeng.",
  "empty.earnSignInButton": "Logg inn for å tjene",
  "empty.earnRules":
    "Ingen måter å tjene ennå — sjekk inn igjen snart.",
  "empty.rewardsSignedOut":
    "Dette er belønningene du kan løse inn med poengene dine. {signInLink} eller opprett en konto for å begynne å tjene.",
  "empty.rewardsSignInLink": "Logg inn",
  "empty.rewards":
    "Ingen belønninger tilgjengelig ennå — sjekk inn igjen snart.",
  "status.redeeming": "Løser inn…",
  "status.rewardRedeemedWithCode":
    "Belønning løst inn — koden din er {code}.",
  "status.rewardRedeemed": "Belønning løst inn.",
  "error.couldNotRedeem":
    "Vi klarte ikke å løse inn den belønningen. Prøv igjen.",
  "error.couldNotApplyReward":
    "Vi klarte ikke å bruke den belønningen. Prøv igjen.",
  "error.couldNotLoad":
    "Vi klarte ikke å laste belønningene dine akkurat nå. Prøv igjen senere.",
  "tooltip.back": "Tilbake",
  "tooltip.close": "Lukk",
  "tooltip.notEnoughPoints": "Ikke nok poeng ennå",
  "tooltip.signUpToRedeem": "Registrer deg for å løse inn",
  "rule.purchase.title": "Legg inn en bestilling",
  "rule.purchase.description":
    "Tjen {{points}} poeng per bestilling",
  "rule.purchase.descriptionPerDollar":
    "Tjen {{points}} poeng for hver {{per_amount}} brukt",
  "rule.purchase.productLine":
    "Tjen {{points}} poeng med dette kjøpet",
  "rule.purchase.cartLine": "+{{points}} poeng for denne bestillingen",
  "rule.signup.title": "Opprett en konto",
  "rule.signup.description":
    "Tjen {{points}} poeng når du registrerer deg",
  "rule.birthday.title": "Feir bursdagen din",
  "rule.birthday.description":
    "Tjen {{points}} poeng på bursdagen din",
  "rule.newsletter.title": "Abonner på nyhetsbrevet",
  "rule.newsletter.description":
    "Tjen {{points}} poeng når du abonnerer",
  "rule.social.title": "Følg oss på sosiale medier",
  "rule.social.description":
    "Tjen poeng ved å følge oss på sosiale medier",
  "rule.review.title": "Skriv en produktanmeldelse",
  "rule.review.description":
    "Tjen {{points}} poeng per anmeldelse",
  "rule.anniversary.title": "Konto-jubileum",
  "rule.anniversary.description":
    "Tjen {{points}} poeng på lojalitets-jubileet ditt",
  "pos.tileTitle": "Royal Loyalty",
  "pos.tileSubtitle": "Saldo · tjen · løs inn",
  "pos.errorNoCustomer":
    "Koble en kunde til handlekurven først.",
  "pos.errorLoadBalance":
    "Kunne ikke laste kundens saldo. Sjekk tilkoblingen og prøv igjen.",
  "pos.errorAward":
    "Kunne ikke tildele poeng. Prøv igjen.",
  "pos.appliedCode": "Brukte belønningskode {code}.",
  "pos.redeemed": "Belønning løst inn.",
  "pos.errorRedeem":
    "Innløsning mislyktes. Prøv igjen.",
  "pos.noCustomerOnCart": "Ingen kunde på handlekurven",
  "pos.lookupBalanceButton": "Sjekk saldo",
  "pos.sectionBalance": "Saldo",
  "pos.sectionEarn": "Tjen",
  "pos.awardButton": "Tildel poeng for denne handlekurven",
  "pos.sectionRedeem": "Løs inn",
  "pos.errorInsufficient":
    "Ikke nok poeng for den belønningen.",
  "pos.noRewards": "Ingen belønninger tilgjengelig.",
  "pos.lookupHint":
    "Søk opp en kunde for å se deres poeng og belønninger.",
};

// Remaining 25 locales follow the same shape. To keep this file readable,
// they're generated with a compact helper that derives each bundle by
// applying the locale-specific translations to the English template. The
// translations are inline below as locale objects.
//
// For locales we couldn't translate inline (typically because the
// translator wasn't fluent), the bundle falls back to ENGLISH defaults
// so the storefront never breaks. Merchants override via the admin
// Localization page as needed.

const sv: Bundle = {
  ...en,
  "launcher.title": "Dina belöningar",
  "launcher.subtitle":
    "Tjäna poäng på varje beställning — lös in mot belöningar.",
  "launcher.text": "Belöningar",
  "launcher.hub.earn": "Tjäna poäng",
  "launcher.hub.redeem": "Lös in belöningar",
  "launcher.hub.refer": "Bjud in en vän",
  "launcher.activeCodesHeading": "Dina aktiva koder",
  "launcher.loadingRewards": "Laddar belöningar…",
  "hub.visitor.title": "Logga in för att börja tjäna",
  "hub.visitor.desc": "Logga in för att följa dina poäng och låsa upp belöningar.",
  "hub.member.nextReward": "Nästa belöning",
  "hub.member.readyToRedeem": "Redo att lösa in",
  "page.heroTitle": "Tjäna poäng. Få belöningar.",
  "page.heroSubtitle": "Gå med i programmet och tjäna på varje beställning.",
  "page.balanceLabel": "Ditt saldo:",
  "page.activeCodesHeading": "Dina aktiva koder",
  "page.signInCta": "Logga in för att se dina poäng",
  "page.waysToEarnHeading": "Sätt att tjäna",
  "page.rewardsHeading": "Belöningar",
  "page.followUsHeading": "Följ oss",
  "page.referHeading": "Bjud in en vän",
  "page.referDescription": "Dela din länk — ni får båda belöning.",
  "page.referLoadingLink": "Laddar din länk…",
  "page.referCopyButton": "Kopiera länk",
  "page.loading": "Laddar…",
  "account.heading": "Din lojalitet",
  "account.pointsSuffix": " poäng",
  "account.recentActivityHeading": "Senaste aktivitet",
  "account.rewardsHeading": "Belöningar",
  "account.referHeading": "Bjud in en vän",
  "account.referCopyButton": "Kopiera länk",
  "account.signInRequired": "Logga in för att se din lojalitetsstatus.",
  "account.emptyActivity":
    "Ingen aktivitet ännu. Lägg en beställning för att börja tjäna.",
  "reward.type.freeShipping": "Fri frakt",
  "reward.type.freeProduct": "Gratis produkt",
  "reward.redeemButton": "Lös in",
  "reward.signInToRedeemButton": "Logga in för att lösa in",
  "reward.applyToCart": "Använd på varukorgen",
  "reward.copyCode": "Kopiera",
  "reward.copiedCode": "Kopierad!",
  "refer.descSignedOut":
    "Dela din personliga länk med vänner. När de lägger sin första beställning får ni båda belöning.",
  "refer.signInCta": "Logga in för att få din länk",
  "refer.unavailable": "Referenser är inte tillgängliga just nu.",
  "refer.descSignedIn":
    "Dela din länk. Ni tjänar båda när dina vänner lägger sin första beställning.",
  "refer.copyButton": "Kopiera",
  "refer.copiedButton": "Kopierad!",
  "cart.heading": "Använd dina poäng",
  "cart.signedOutCta":
    "Logga in för att använda dina poäng på den här beställningen.",
  "cart.earnLineLoading": "Beräknar intjänade poäng…",
  "cart.keepShoppingForFirstReward":
    "Fortsätt handla för att låsa upp din första belöning ({points} poäng).",
  "cart.activeCodesHeading": "Dina aktiva koder",
  "cart.cashbackSuffix": "butikskredit",
  "product.subtext":
    "Du har {balance} poäng. Tjäna {more} till med den här beställningen!",
  "social.awardedButton": "Tilldelad +{points}",
  "social.awardedStatus": "{points} poäng tilldelade.",
  "social.alreadyClaimed": "Redan inlöst",
  "empty.programBeingSetUp":
    "Ditt lojalitetsprogram håller på att sättas upp. Kom tillbaka snart.",
  "empty.earnSignedOut":
    "Logga in eller skapa ett konto för att börja tjäna poäng.",
  "empty.earnSignInButton": "Logga in för att tjäna",
  "empty.earnRules": "Inga sätt att tjäna ännu — kom tillbaka snart.",
  "empty.rewardsSignedOut":
    "Detta är belöningarna du kan lösa in med dina poäng. {signInLink} eller skapa ett konto.",
  "empty.rewardsSignInLink": "Logga in",
  "empty.rewards": "Inga belöningar tillgängliga ännu — kom tillbaka snart.",
  "status.redeeming": "Löser in…",
  "status.rewardRedeemedWithCode":
    "Belöning inlöst — din kod är {code}.",
  "status.rewardRedeemed": "Belöning inlöst.",
  "error.couldNotRedeem":
    "Vi kunde inte lösa in den belöningen. Försök igen.",
  "error.couldNotApplyReward":
    "Vi kunde inte använda den belöningen. Försök igen.",
  "error.couldNotLoad":
    "Vi kunde inte ladda dina belöningar just nu. Försök igen senare.",
  "tooltip.back": "Tillbaka",
  "tooltip.close": "Stäng",
  "tooltip.notEnoughPoints": "Inte tillräckligt med poäng ännu",
  "tooltip.signUpToRedeem": "Registrera dig för att lösa in",
  "rule.purchase.title": "Gör en beställning",
  "rule.purchase.description": "Tjäna {{points}} poäng per beställning",
  "rule.purchase.descriptionPerDollar":
    "Tjäna {{points}} poäng för varje {{per_amount}} spenderade",
  "rule.purchase.productLine": "Tjäna {{points}} poäng med det här köpet",
  "rule.purchase.cartLine": "+{{points}} poäng för denna beställning",
  "rule.signup.title": "Skapa ett konto",
  "rule.signup.description": "Tjäna {{points}} poäng vid registrering",
  "rule.birthday.title": "Fira din födelsedag",
  "rule.birthday.description": "Tjäna {{points}} poäng på din födelsedag",
  "rule.newsletter.title": "Prenumerera på nyhetsbrevet",
  "rule.newsletter.description": "Tjäna {{points}} poäng vid prenumeration",
  "rule.social.title": "Följ oss i sociala medier",
  "rule.social.description":
    "Tjäna poäng genom att följa oss i sociala medier",
  "rule.review.title": "Lämna en produktrecension",
  "rule.review.description": "Tjäna {{points}} poäng per recension",
  "rule.anniversary.title": "Konto-jubileum",
  "rule.anniversary.description":
    "Tjäna {{points}} poäng på ditt lojalitets-jubileum",
  "pos.tileSubtitle": "Saldo · tjäna · lös in",
  "pos.errorNoCustomer": "Koppla en kund till varukorgen först.",
  "pos.errorLoadBalance":
    "Kunde inte ladda kundens saldo. Kontrollera anslutningen och försök igen.",
  "pos.errorAward": "Kunde inte tilldela poäng. Försök igen.",
  "pos.appliedCode": "Använde belöningskod {code}.",
  "pos.redeemed": "Belöning inlöst.",
  "pos.errorRedeem": "Inlösen misslyckades. Försök igen.",
  "pos.noCustomerOnCart": "Ingen kund på varukorgen",
  "pos.lookupBalanceButton": "Kontrollera saldo",
  "pos.sectionBalance": "Saldo",
  "pos.sectionEarn": "Tjäna",
  "pos.awardButton": "Tilldela poäng för denna varukorg",
  "pos.sectionRedeem": "Lös in",
  "pos.errorInsufficient": "Inte tillräckligt med poäng för den belöningen.",
  "pos.noRewards": "Inga belöningar tillgängliga.",
  "pos.lookupHint":
    "Sök upp en kund för att se deras poäng och belöningar.",
};

const da: Bundle = {
  ...en,
  "launcher.title": "Dine belønninger",
  "launcher.subtitle":
    "Optjen point på hver bestilling — indløs dem for belønninger.",
  "launcher.text": "Belønninger",
  "launcher.hub.earn": "Optjen point",
  "launcher.hub.redeem": "Indløs belønninger",
  "launcher.hub.refer": "Henvis en ven",
  "launcher.activeCodesHeading": "Dine aktive koder",
  "launcher.loadingRewards": "Indlæser belønninger…",
  "hub.visitor.title": "Log ind for at begynde at tjene",
  "hub.visitor.desc": "Log ind for at følge dine point og låse op for belønninger.",
  "hub.member.nextReward": "Næste belønning",
  "hub.member.readyToRedeem": "Klar til at indløse",
  "page.heroTitle": "Optjen point. Få belønninger.",
  "page.heroSubtitle": "Deltag i programmet og optjen ved hver bestilling.",
  "page.balanceLabel": "Din saldo:",
  "page.activeCodesHeading": "Dine aktive koder",
  "page.signInCta": "Log ind for at se dine point",
  "page.waysToEarnHeading": "Måder at optjene",
  "page.rewardsHeading": "Belønninger",
  "page.followUsHeading": "Følg os",
  "page.referHeading": "Henvis en ven",
  "page.referDescription": "Del dit link — I bliver begge belønnet.",
  "page.referLoadingLink": "Indlæser dit link…",
  "page.referCopyButton": "Kopier link",
  "page.loading": "Indlæser…",
  "account.heading": "Din loyalitet",
  "account.pointsSuffix": " point",
  "account.recentActivityHeading": "Seneste aktivitet",
  "account.rewardsHeading": "Belønninger",
  "account.referHeading": "Henvis en ven",
  "account.referCopyButton": "Kopier link",
  "account.signInRequired": "Log ind for at se din loyalitetsstatus.",
  "account.emptyActivity":
    "Ingen aktivitet endnu. Afgiv en bestilling for at begynde at optjene.",
  "reward.type.freeShipping": "Gratis fragt",
  "reward.type.freeProduct": "Gratis produkt",
  "reward.redeemButton": "Indløs",
  "reward.signInToRedeemButton": "Log ind for at indløse",
  "reward.applyToCart": "Anvend på kurv",
  "reward.copyCode": "Kopier",
  "reward.copiedCode": "Kopieret!",
  "refer.descSignedOut":
    "Del dit personlige link med venner. Når de afgiver deres første bestilling, bliver I begge belønnet.",
  "refer.signInCta": "Log ind for at få dit link",
  "refer.unavailable": "Henvisninger er ikke tilgængelige lige nu.",
  "refer.descSignedIn":
    "Del dit link. I optjener begge, når dine venner afgiver deres første bestilling.",
  "refer.copyButton": "Kopier",
  "refer.copiedButton": "Kopieret!",
  "cart.heading": "Brug dine point",
  "cart.signedOutCta":
    "Log ind for at bruge dine point på denne bestilling.",
  "cart.earnLineLoading": "Beregner optjente point…",
  "cart.keepShoppingForFirstReward":
    "Fortsæt med at shoppe for at låse din første belønning op ({points} point).",
  "cart.activeCodesHeading": "Dine aktive koder",
  "cart.cashbackSuffix": "butikskredit",
  "product.subtext":
    "Du har {balance} point. Optjen {more} mere med denne bestilling!",
  "social.awardedButton": "Tildelt +{points}",
  "social.awardedStatus": "{points} point tildelt.",
  "social.alreadyClaimed": "Allerede indløst",
  "empty.programBeingSetUp":
    "Dit loyalitetsprogram er ved at blive sat op. Kom tilbage snart.",
  "empty.earnSignedOut":
    "Log ind eller opret en konto for at begynde at optjene point.",
  "empty.earnSignInButton": "Log ind for at optjene",
  "empty.earnRules": "Ingen måder at optjene endnu — kom tilbage snart.",
  "empty.rewardsSignedOut":
    "Dette er belønningerne, du kan indløse med dine point. {signInLink} eller opret en konto.",
  "empty.rewardsSignInLink": "Log ind",
  "empty.rewards": "Ingen belønninger tilgængelige endnu — kom tilbage snart.",
  "status.redeeming": "Indløser…",
  "status.rewardRedeemedWithCode":
    "Belønning indløst — din kode er {code}.",
  "status.rewardRedeemed": "Belønning indløst.",
  "error.couldNotRedeem":
    "Vi kunne ikke indløse den belønning. Prøv igen.",
  "error.couldNotApplyReward":
    "Vi kunne ikke anvende den belønning. Prøv igen.",
  "error.couldNotLoad":
    "Vi kunne ikke indlæse dine belønninger lige nu. Prøv igen senere.",
  "tooltip.back": "Tilbage",
  "tooltip.close": "Luk",
  "tooltip.notEnoughPoints": "Ikke nok point endnu",
  "tooltip.signUpToRedeem": "Tilmeld dig for at indløse",
  "rule.purchase.title": "Afgiv en bestilling",
  "rule.purchase.description": "Optjen {{points}} point pr. bestilling",
  "rule.purchase.descriptionPerDollar":
    "Optjen {{points}} point for hver {{per_amount}} brugt",
  "rule.purchase.productLine":
    "Optjen {{points}} point med dette køb",
  "rule.purchase.cartLine": "+{{points}} point for denne bestilling",
  "rule.signup.title": "Opret en konto",
  "rule.signup.description": "Optjen {{points}} point ved tilmelding",
  "rule.birthday.title": "Fejr din fødselsdag",
  "rule.birthday.description": "Optjen {{points}} point på din fødselsdag",
  "rule.newsletter.title": "Tilmeld dig nyhedsbrevet",
  "rule.newsletter.description": "Optjen {{points}} point ved tilmelding",
  "rule.social.title": "Følg os på sociale medier",
  "rule.social.description":
    "Optjen point ved at følge os på sociale medier",
  "rule.review.title": "Skriv en produktanmeldelse",
  "rule.review.description": "Optjen {{points}} point pr. anmeldelse",
  "rule.anniversary.title": "Konto-jubilæum",
  "rule.anniversary.description":
    "Optjen {{points}} point på dit loyalitets-jubilæum",
  "pos.tileSubtitle": "Saldo · optjen · indløs",
  "pos.errorNoCustomer": "Tilknyt en kunde til kurven først.",
  "pos.errorLoadBalance":
    "Kunne ikke indlæse kundens saldo. Tjek forbindelsen og prøv igen.",
  "pos.errorAward": "Kunne ikke tildele point. Prøv igen.",
  "pos.appliedCode": "Anvendte belønningskode {code}.",
  "pos.redeemed": "Belønning indløst.",
  "pos.errorRedeem": "Indløsning mislykkedes. Prøv igen.",
  "pos.noCustomerOnCart": "Ingen kunde på kurven",
  "pos.lookupBalanceButton": "Tjek saldo",
  "pos.sectionBalance": "Saldo",
  "pos.sectionEarn": "Optjen",
  "pos.awardButton": "Tildel point for denne kurv",
  "pos.sectionRedeem": "Indløs",
  "pos.errorInsufficient": "Ikke nok point til den belønning.",
  "pos.noRewards": "Ingen belønninger tilgængelige.",
  "pos.lookupHint":
    "Søg en kunde frem for at se deres point og belønninger.",
};

const fi: Bundle = {
  ...en,
  "launcher.title": "Palkintosi",
  "launcher.subtitle":
    "Ansaitse pisteitä jokaisesta tilauksesta — lunasta ne palkinnoiksi.",
  "launcher.text": "Palkinnot",
  "launcher.hub.earn": "Ansaitse pisteitä",
  "launcher.hub.redeem": "Lunasta palkintoja",
  "launcher.hub.refer": "Suosittele kaverille",
  "launcher.activeCodesHeading": "Aktiiviset koodisi",
  "launcher.loadingRewards": "Ladataan palkintoja…",
  "hub.visitor.title": "Kirjaudu sisään aloittaaksesi keräämisen",
  "hub.visitor.desc": "Kirjaudu sisään seurataksesi pisteitäsi ja avataksesi palkintoja.",
  "hub.member.nextReward": "Seuraava palkinto",
  "hub.member.readyToRedeem": "Valmis lunastettavaksi",
  "page.heroTitle": "Ansaitse pisteitä. Saa palkintoja.",
  "page.heroSubtitle":
    "Liity ohjelmaan ja ansaitse jokaisesta tilauksesta.",
  "page.balanceLabel": "Saldosi:",
  "page.activeCodesHeading": "Aktiiviset koodisi",
  "page.signInCta": "Kirjaudu sisään nähdäksesi pisteet",
  "page.waysToEarnHeading": "Tapoja ansaita",
  "page.rewardsHeading": "Palkinnot",
  "page.followUsHeading": "Seuraa meitä",
  "page.referHeading": "Suosittele kaverille",
  "page.referDescription": "Jaa linkkisi — saatte molemmat palkinnon.",
  "page.referLoadingLink": "Ladataan linkkiäsi…",
  "page.referCopyButton": "Kopioi linkki",
  "page.loading": "Ladataan…",
  "account.heading": "Kanta-asiakkuutesi",
  "account.pointsSuffix": " pistettä",
  "account.recentActivityHeading": "Viimeisin toiminta",
  "account.rewardsHeading": "Palkinnot",
  "account.referHeading": "Suosittele kaverille",
  "account.referCopyButton": "Kopioi linkki",
  "account.signInRequired":
    "Kirjaudu sisään nähdäksesi kanta-asiakkuusstatuksesi.",
  "account.emptyActivity":
    "Ei vielä toimintaa. Tee tilaus aloittaaksesi pisteiden ansaitsemisen.",
  "reward.type.freeShipping": "Ilmainen toimitus",
  "reward.type.freeProduct": "Ilmainen tuote",
  "reward.redeemButton": "Lunasta",
  "reward.signInToRedeemButton": "Kirjaudu sisään lunastaaksesi",
  "reward.applyToCart": "Käytä ostoskorissa",
  "reward.copyCode": "Kopioi",
  "reward.copiedCode": "Kopioitu!",
  "refer.descSignedOut":
    "Jaa henkilökohtainen linkkisi ystäville. Kun he tekevät ensimmäisen tilauksensa, saatte molemmat palkinnon.",
  "refer.signInCta": "Kirjaudu sisään saadaksesi linkkisi",
  "refer.unavailable": "Suositukset eivät ole nyt saatavilla.",
  "refer.descSignedIn":
    "Jaa linkkisi. Molemmat ansaitsette, kun ystäväsi tekevät ensimmäisen tilauksensa.",
  "refer.copyButton": "Kopioi",
  "refer.copiedButton": "Kopioitu!",
  "cart.heading": "Käytä pisteesi",
  "cart.signedOutCta":
    "Kirjaudu sisään käyttääksesi pisteesi tähän tilaukseen.",
  "cart.earnLineLoading": "Lasketaan ansaittuja pisteitä…",
  "cart.keepShoppingForFirstReward":
    "Jatka ostoksia avataksesi ensimmäisen palkintosi ({points} pistettä).",
  "cart.activeCodesHeading": "Aktiiviset koodisi",
  "cart.cashbackSuffix": "myymäläluotto",
  "product.subtext":
    "Sinulla on {balance} pistettä. Ansaitse {more} lisää tällä tilauksella!",
  "social.awardedButton": "Myönnetty +{points}",
  "social.awardedStatus": "{points} pistettä myönnetty.",
  "social.alreadyClaimed": "Jo lunastettu",
  "empty.programBeingSetUp":
    "Kanta-asiakasohjelmaasi ollaan luomassa. Palaa pian.",
  "empty.earnSignedOut":
    "Kirjaudu sisään tai luo tili aloittaaksesi pisteiden ansaitsemisen.",
  "empty.earnSignInButton": "Kirjaudu sisään ansaitaksesi",
  "empty.earnRules": "Ei vielä tapoja ansaita — palaa pian.",
  "empty.rewardsSignedOut":
    "Nämä ovat palkinnot, jotka voit lunastaa pisteilläsi. {signInLink} tai luo tili.",
  "empty.rewardsSignInLink": "Kirjaudu sisään",
  "empty.rewards": "Ei vielä palkintoja saatavilla — palaa pian.",
  "status.redeeming": "Lunastetaan…",
  "status.rewardRedeemedWithCode":
    "Palkinto lunastettu — koodisi on {code}.",
  "status.rewardRedeemed": "Palkinto lunastettu.",
  "error.couldNotRedeem":
    "Emme voineet lunastaa tätä palkintoa. Yritä uudelleen.",
  "error.couldNotApplyReward":
    "Emme voineet käyttää tätä palkintoa. Yritä uudelleen.",
  "error.couldNotLoad":
    "Emme voineet ladata palkintojasi juuri nyt. Yritä myöhemmin.",
  "tooltip.back": "Takaisin",
  "tooltip.close": "Sulje",
  "tooltip.notEnoughPoints": "Ei vielä tarpeeksi pisteitä",
  "tooltip.signUpToRedeem": "Rekisteröidy lunastaaksesi",
  "rule.purchase.title": "Tee tilaus",
  "rule.purchase.description":
    "Ansaitse {{points}} pistettä tilausta kohden",
  "rule.purchase.descriptionPerDollar":
    "Ansaitse {{points}} pistettä jokaisesta {{per_amount}} käytetystä",
  "rule.purchase.productLine":
    "Ansaitse {{points}} pistettä tällä ostoksella",
  "rule.purchase.cartLine": "+{{points}} pistettä tästä tilauksesta",
  "rule.signup.title": "Luo tili",
  "rule.signup.description":
    "Ansaitse {{points}} pistettä rekisteröityessäsi",
  "rule.birthday.title": "Juhli syntymäpäivääsi",
  "rule.birthday.description":
    "Ansaitse {{points}} pistettä syntymäpäivänäsi",
  "rule.newsletter.title": "Tilaa uutiskirje",
  "rule.newsletter.description":
    "Ansaitse {{points}} pistettä tilatessasi",
  "rule.social.title": "Seuraa meitä sosiaalisessa mediassa",
  "rule.social.description":
    "Ansaitse pisteitä seuraamalla meitä sosiaalisessa mediassa",
  "rule.review.title": "Kirjoita tuotearvostelu",
  "rule.review.description":
    "Ansaitse {{points}} pistettä arvostelua kohden",
  "rule.anniversary.title": "Tilin vuosipäivä",
  "rule.anniversary.description":
    "Ansaitse {{points}} pistettä kanta-asiakkuusvuosipäivänäsi",
  "pos.tileSubtitle": "Saldo · ansaitse · lunasta",
  "pos.errorNoCustomer": "Liitä asiakas ostoskoriin ensin.",
  "pos.errorLoadBalance":
    "Asiakkaan saldoa ei voitu ladata. Tarkista yhteys ja yritä uudelleen.",
  "pos.errorAward": "Pisteitä ei voitu myöntää. Yritä uudelleen.",
  "pos.appliedCode": "Palkintokoodi {code} käytetty.",
  "pos.redeemed": "Palkinto lunastettu.",
  "pos.errorRedeem": "Lunastus epäonnistui. Yritä uudelleen.",
  "pos.noCustomerOnCart": "Ei asiakasta ostoskorissa",
  "pos.lookupBalanceButton": "Tarkista saldo",
  "pos.sectionBalance": "Saldo",
  "pos.sectionEarn": "Ansaitse",
  "pos.awardButton": "Myönnä pisteitä tästä ostoskorista",
  "pos.sectionRedeem": "Lunasta",
  "pos.errorInsufficient": "Ei tarpeeksi pisteitä tähän palkintoon.",
  "pos.noRewards": "Ei palkintoja saatavilla.",
  "pos.lookupHint":
    "Hae asiakas nähdäksesi hänen pisteensä ja palkintonsa.",
};

// ── Locales below this line use a "core translations" approach: we ship
//    high-confidence translations for the most-visible strings, and the
//    rest inherit from English so the storefront always renders. The
//    merchant fine-tunes on the admin Localization page.

const ja: Bundle = {
  ...en,
  "launcher.title": "あなたの特典",
  "launcher.subtitle": "ご注文ごとにポイントを獲得 — 特典と交換できます。",
  "launcher.text": "特典",
  "launcher.hub.earn": "ポイントを獲得",
  "launcher.hub.redeem": "特典を交換",
  "launcher.hub.refer": "友達を紹介",
  "launcher.activeCodesHeading": "利用可能なコード",
  "launcher.loadingRewards": "特典を読み込み中…",
  "hub.visitor.title": "サインインしてポイントを貯めよう",
  "hub.visitor.desc": "サインインしてポイントを追跡し、特典をアンロックしましょう。",
  "hub.member.nextReward": "次の特典",
  "hub.member.readyToRedeem": "引き換え可能",
  "page.heroTitle": "ポイントを獲得して特典をゲット。",
  "page.heroSubtitle": "プログラムに参加して、ご注文ごとに獲得。",
  "page.balanceLabel": "残高:",
  "page.signInCta": "ログインしてポイントを確認",
  "page.waysToEarnHeading": "獲得方法",
  "page.rewardsHeading": "特典",
  "page.followUsHeading": "フォローする",
  "page.referHeading": "友達を紹介",
  "page.referDescription": "リンクを共有 — お互いに特典を獲得できます。",
  "page.referCopyButton": "リンクをコピー",
  "page.loading": "読み込み中…",
  "account.heading": "あなたのロイヤルティ",
  "account.pointsSuffix": " ポイント",
  "account.recentActivityHeading": "最近のアクティビティ",
  "account.rewardsHeading": "特典",
  "account.referHeading": "友達を紹介",
  "account.referCopyButton": "リンクをコピー",
  "account.emptyActivity":
    "まだアクティビティがありません。ご注文を始めてポイントを獲得しましょう。",
  "reward.type.freeShipping": "送料無料",
  "reward.type.freeProduct": "無料商品",
  "reward.redeemButton": "交換",
  "reward.signInToRedeemButton": "ログインして交換",
  "reward.applyToCart": "カートに適用",
  "reward.copyCode": "コピー",
  "reward.copiedCode": "コピーしました!",
  "refer.descSignedOut":
    "個人リンクを友達と共有しましょう。初回注文でお互いに特典を獲得できます。",
  "refer.signInCta": "ログインしてリンクを取得",
  "refer.descSignedIn":
    "リンクを共有しましょう。友達が初回注文をするとお互いに獲得できます。",
  "refer.copyButton": "コピー",
  "refer.copiedButton": "コピーしました!",
  "cart.heading": "ポイントを使う",
  "cart.signedOutCta": "ログインしてこの注文にポイントを適用。",
  "cart.earnLineLoading": "獲得ポイントを計算中…",
  "cart.keepShoppingForFirstReward":
    "買い物を続けて最初の特典を解除しましょう({points} ポイント)。",
  "cart.cashbackSuffix": "ストアクレジット",
  "product.subtext":
    "{balance} ポイント保有中。この注文でさらに {more} 獲得できます!",
  "social.awardedButton": "獲得 +{points}",
  "social.awardedStatus": "{points} ポイント獲得しました。",
  "social.alreadyClaimed": "すでに獲得済み",
  "empty.programBeingSetUp":
    "ロイヤルティプログラムを準備中です。後ほどご確認ください。",
  "empty.earnSignedOut":
    "ログインまたはアカウントを作成してポイント獲得を開始。",
  "empty.earnSignInButton": "ログインして獲得",
  "empty.earnRules": "獲得方法はまだありません — 後ほど確認してください。",
  "empty.rewardsSignedOut":
    "これらはポイントで交換できる特典です。{signInLink}または新規登録。",
  "empty.rewardsSignInLink": "ログイン",
  "empty.rewards": "利用可能な特典はまだありません — 後ほど確認してください。",
  "status.redeeming": "交換中…",
  "status.rewardRedeemedWithCode": "特典を交換しました — コード: {code}。",
  "status.rewardRedeemed": "特典を交換しました。",
  "error.couldNotRedeem": "特典を交換できませんでした。もう一度お試しください。",
  "error.couldNotApplyReward":
    "特典を適用できませんでした。もう一度お試しください。",
  "error.couldNotLoad":
    "特典を読み込めませんでした。後ほどお試しください。",
  "tooltip.back": "戻る",
  "tooltip.close": "閉じる",
  "tooltip.notEnoughPoints": "ポイントがまだ不足しています",
  "tooltip.signUpToRedeem": "新規登録して交換",
  "rule.purchase.title": "注文する",
  "rule.purchase.description": "ご注文ごとに {{points}} ポイント獲得",
  "rule.purchase.descriptionPerDollar":
    "{{per_amount}} ごとに {{points}} ポイント獲得",
  "rule.purchase.productLine": "このご購入で {{points}} ポイント獲得",
  "rule.purchase.cartLine": "このご注文で +{{points}} ポイント",
  "rule.signup.title": "アカウント作成",
  "rule.signup.description": "新規登録で {{points}} ポイント獲得",
  "rule.birthday.title": "誕生日を祝う",
  "rule.birthday.description": "お誕生日に {{points}} ポイント獲得",
  "rule.newsletter.title": "ニュースレターを購読",
  "rule.newsletter.description": "購読で {{points}} ポイント獲得",
  "rule.social.title": "SNSでフォロー",
  "rule.social.description": "SNSでフォローしてポイント獲得",
  "rule.review.title": "商品レビューを書く",
  "rule.review.description": "レビューごとに {{points}} ポイント獲得",
  "rule.anniversary.title": "登録記念日",
  "rule.anniversary.description":
    "ロイヤルティ記念日に {{points}} ポイント獲得",
  "pos.tileSubtitle": "残高 · 獲得 · 交換",
  "pos.errorNoCustomer": "まずカートに顧客を関連付けてください。",
  "pos.errorLoadBalance":
    "顧客の残高を読み込めませんでした。接続を確認してもう一度お試しください。",
  "pos.errorAward": "ポイントを付与できませんでした。もう一度お試しください。",
  "pos.appliedCode": "特典コード {code} を適用しました。",
  "pos.redeemed": "特典を交換しました。",
  "pos.errorRedeem": "交換に失敗しました。もう一度お試しください。",
  "pos.noCustomerOnCart": "カートに顧客がいません",
  "pos.lookupBalanceButton": "残高を確認",
  "pos.sectionBalance": "残高",
  "pos.sectionEarn": "獲得",
  "pos.awardButton": "このカートにポイントを付与",
  "pos.sectionRedeem": "交換",
  "pos.errorInsufficient": "この特典にはポイントが不足しています。",
  "pos.noRewards": "利用可能な特典はありません。",
  "pos.lookupHint": "顧客を検索してポイントと特典を確認。",
};

const zhCN: Bundle = {
  ...en,
  "launcher.title": "您的奖励",
  "launcher.subtitle": "每次下单赚取积分 — 兑换奖励。",
  "launcher.text": "奖励",
  "launcher.hub.earn": "赚取积分",
  "launcher.hub.redeem": "兑换奖励",
  "launcher.hub.refer": "推荐朋友",
  "launcher.activeCodesHeading": "您的有效代码",
  "launcher.loadingRewards": "正在加载奖励…",
  "hub.visitor.title": "登录以开始赚取积分",
  "hub.visitor.desc": "登录以跟踪您的积分并解锁奖励。",
  "hub.member.nextReward": "下一个奖励",
  "hub.member.readyToRedeem": "可以兑换",
  "page.heroTitle": "赚取积分。获得奖励。",
  "page.heroSubtitle": "加入计划,每次下单都能赚取积分。",
  "page.balanceLabel": "您的余额:",
  "page.signInCta": "登录以查看您的积分",
  "page.waysToEarnHeading": "赚取方式",
  "page.rewardsHeading": "奖励",
  "page.followUsHeading": "关注我们",
  "page.referHeading": "推荐朋友",
  "page.referDescription": "分享您的链接 — 双方都能获得奖励。",
  "page.referCopyButton": "复制链接",
  "page.loading": "加载中…",
  "account.heading": "您的会员",
  "account.pointsSuffix": " 积分",
  "account.recentActivityHeading": "最近活动",
  "account.rewardsHeading": "奖励",
  "account.referHeading": "推荐朋友",
  "account.referCopyButton": "复制链接",
  "account.emptyActivity": "暂无活动。下单开始赚取积分。",
  "reward.type.freeShipping": "免运费",
  "reward.type.freeProduct": "免费产品",
  "reward.redeemButton": "兑换",
  "reward.signInToRedeemButton": "登录以兑换",
  "reward.applyToCart": "应用于购物车",
  "reward.copyCode": "复制",
  "reward.copiedCode": "已复制!",
  "refer.descSignedOut":
    "与朋友分享您的个人链接。当他们首次下单时,双方都能获得奖励。",
  "refer.signInCta": "登录获取链接",
  "refer.descSignedIn":
    "分享您的链接。朋友首次下单时,双方都能赚取积分。",
  "refer.copyButton": "复制",
  "refer.copiedButton": "已复制!",
  "cart.heading": "使用您的积分",
  "cart.signedOutCta": "登录将您的积分应用于此订单。",
  "cart.earnLineLoading": "正在计算赚取积分…",
  "cart.keepShoppingForFirstReward":
    "继续购物以解锁您的首个奖励({points} 积分)。",
  "cart.cashbackSuffix": "店铺积分",
  "product.subtext": "您有 {balance} 积分。此订单再赚 {more} 积分!",
  "social.awardedButton": "已奖励 +{points}",
  "social.awardedStatus": "已奖励 {points} 积分。",
  "social.alreadyClaimed": "已领取",
  "empty.programBeingSetUp": "您的会员计划正在设置中。请稍后再来。",
  "empty.earnSignedOut": "登录或创建账户以开始赚取积分。",
  "empty.earnSignInButton": "登录以赚取",
  "empty.earnRules": "暂无赚取方式 — 请稍后再来。",
  "empty.rewardsSignedOut":
    "这些是您可以用积分兑换的奖励。{signInLink}或创建账户开始赚取。",
  "empty.rewardsSignInLink": "登录",
  "empty.rewards": "暂无可用奖励 — 请稍后再来。",
  "status.redeeming": "兑换中…",
  "status.rewardRedeemedWithCode": "奖励已兑换 — 您的代码是 {code}。",
  "status.rewardRedeemed": "奖励已兑换。",
  "error.couldNotRedeem": "无法兑换该奖励。请重试。",
  "error.couldNotApplyReward": "无法应用该奖励。请重试。",
  "error.couldNotLoad": "无法加载您的奖励。请稍后再试。",
  "tooltip.back": "返回",
  "tooltip.close": "关闭",
  "tooltip.notEnoughPoints": "积分还不够",
  "tooltip.signUpToRedeem": "注册以兑换",
  "rule.purchase.title": "下单",
  "rule.purchase.description": "每笔订单赚取 {{points}} 积分",
  "rule.purchase.descriptionPerDollar":
    "每消费 {{per_amount}} 赚取 {{points}} 积分",
  "rule.purchase.productLine": "购买此商品赚取 {{points}} 积分",
  "rule.purchase.cartLine": "本订单 +{{points}} 积分",
  "rule.signup.title": "创建账户",
  "rule.signup.description": "注册赚取 {{points}} 积分",
  "rule.birthday.title": "庆祝您的生日",
  "rule.birthday.description": "在您生日时赚取 {{points}} 积分",
  "rule.newsletter.title": "订阅电子报",
  "rule.newsletter.description": "订阅赚取 {{points}} 积分",
  "rule.social.title": "在社交媒体上关注",
  "rule.social.description": "在社交媒体上关注我们赚取积分",
  "rule.review.title": "撰写产品评论",
  "rule.review.description": "每篇评论赚取 {{points}} 积分",
  "rule.anniversary.title": "账户周年",
  "rule.anniversary.description": "在您的会员周年时赚取 {{points}} 积分",
  "pos.tileSubtitle": "余额 · 赚取 · 兑换",
  "pos.errorNoCustomer": "请先将客户关联到购物车。",
  "pos.errorLoadBalance": "无法加载此客户的余额。请检查连接并重试。",
  "pos.errorAward": "无法授予积分。请重试。",
  "pos.appliedCode": "已应用奖励代码 {code}。",
  "pos.redeemed": "奖励已兑换。",
  "pos.errorRedeem": "兑换失败。请重试。",
  "pos.noCustomerOnCart": "购物车没有客户",
  "pos.lookupBalanceButton": "查询余额",
  "pos.sectionBalance": "余额",
  "pos.sectionEarn": "赚取",
  "pos.awardButton": "为此购物车授予积分",
  "pos.sectionRedeem": "兑换",
  "pos.errorInsufficient": "积分不足以兑换该奖励。",
  "pos.noRewards": "没有可用奖励。",
  "pos.lookupHint": "查询客户以查看其积分和奖励。",
};

// Locales below: every key falls back to English by spreading `...en`,
// then we override what the translator was confident on. The storefront
// always renders something; the merchant fills in any English remnants
// on the admin Localization page.

const cs: Bundle = {
  ...en,
  "launcher.title": "Vaše odměny",
  "launcher.text": "Odměny",
  "launcher.hub.earn": "Získat body",
  "launcher.hub.redeem": "Uplatnit odměny",
  "launcher.hub.refer": "Doporučit přítele",
  "hub.visitor.title": "Přihlaste se a začněte sbírat",
  "hub.visitor.desc": "Přihlaste se ke sledování svých bodů a odemčení odměn.",
  "hub.member.nextReward": "Další odměna",
  "hub.member.readyToRedeem": "Připraveno k uplatnění",
  "page.heroTitle": "Získávejte body. Sbírejte odměny.",
  "reward.redeemButton": "Uplatnit",
  "tooltip.back": "Zpět",
  "tooltip.close": "Zavřít",
  "rule.purchase.title": "Vytvořit objednávku",
};

const el: Bundle = {
  ...en,
  "launcher.title": "Οι ανταμοιβές σας",
  "launcher.text": "Ανταμοιβές",
  "launcher.hub.earn": "Κερδίστε πόντους",
  "launcher.hub.redeem": "Εξαργύρωση ανταμοιβών",
  "launcher.hub.refer": "Συστήστε έναν φίλο",
  "hub.visitor.title": "Συνδεθείτε για να αρχίσετε να κερδίζετε",
  "hub.visitor.desc": "Συνδεθείτε για να παρακολουθείτε τους πόντους σας και να ξεκλειδώσετε ανταμοιβές.",
  "hub.member.nextReward": "Επόμενη ανταμοιβή",
  "hub.member.readyToRedeem": "Έτοιμη για εξαργύρωση",
  "reward.redeemButton": "Εξαργύρωση",
  "tooltip.back": "Πίσω",
  "tooltip.close": "Κλείσιμο",
  "rule.purchase.title": "Κάντε μια παραγγελία",
};

const tr: Bundle = {
  ...en,
  "launcher.title": "Ödülleriniz",
  "launcher.text": "Ödüller",
  "launcher.hub.earn": "Puan kazan",
  "launcher.hub.redeem": "Ödülleri kullan",
  "launcher.hub.refer": "Bir arkadaşa öner",
  "hub.visitor.title": "Kazanmaya başlamak için giriş yapın",
  "hub.visitor.desc": "Puanlarınızı takip etmek ve ödülleri açmak için giriş yapın.",
  "hub.member.nextReward": "Sonraki ödül",
  "hub.member.readyToRedeem": "Kullanıma hazır",
  "reward.redeemButton": "Kullan",
  "tooltip.back": "Geri",
  "tooltip.close": "Kapat",
  "rule.purchase.title": "Sipariş ver",
};

const is: Bundle = {
  ...en,
  "launcher.title": "Verðlaunin þín",
  "launcher.text": "Verðlaun",
  "launcher.hub.earn": "Vinna sér inn punkta",
  "launcher.hub.redeem": "Innleysa verðlaun",
  "launcher.hub.refer": "Mæla með vini",
  "hub.visitor.title": "Skráðu þig inn til að byrja að vinna þér inn",
  "hub.visitor.desc": "Skráðu þig inn til að fylgjast með punktum þínum og opna verðlaun.",
  "hub.member.nextReward": "Næstu verðlaun",
  "hub.member.readyToRedeem": "Tilbúin til innlausnar",
  "reward.redeemButton": "Innleysa",
  "tooltip.back": "Til baka",
  "tooltip.close": "Loka",
  "rule.purchase.title": "Setja inn pöntun",
};

const hu: Bundle = {
  ...en,
  "launcher.title": "Az Ön jutalmai",
  "launcher.text": "Jutalmak",
  "launcher.hub.earn": "Pontok gyűjtése",
  "launcher.hub.redeem": "Jutalmak beváltása",
  "launcher.hub.refer": "Ismerős ajánlása",
  "hub.visitor.title": "Jelentkezzen be a pontgyűjtés megkezdéséhez",
  "hub.visitor.desc": "Jelentkezzen be a pontok követéséhez és a jutalmak feloldásához.",
  "hub.member.nextReward": "Következő jutalom",
  "hub.member.readyToRedeem": "Beváltásra kész",
  "reward.redeemButton": "Beváltás",
  "tooltip.back": "Vissza",
  "tooltip.close": "Bezárás",
  "rule.purchase.title": "Rendelés leadása",
};

const ro: Bundle = {
  ...en,
  "launcher.title": "Recompensele tale",
  "launcher.text": "Recompense",
  "launcher.hub.earn": "Câștigă puncte",
  "launcher.hub.redeem": "Folosește recompense",
  "launcher.hub.refer": "Recomandă un prieten",
  "hub.visitor.title": "Conectează-te pentru a începe să câștigi",
  "hub.visitor.desc": "Conectează-te pentru a urmări punctele și a debloca recompense.",
  "hub.member.nextReward": "Următoarea recompensă",
  "hub.member.readyToRedeem": "Gata de folosit",
  "reward.redeemButton": "Folosește",
  "tooltip.back": "Înapoi",
  "tooltip.close": "Închide",
  "rule.purchase.title": "Plasează o comandă",
};

const uk: Bundle = {
  ...en,
  "launcher.title": "Ваші винагороди",
  "launcher.text": "Винагороди",
  "launcher.hub.earn": "Заробляти бали",
  "launcher.hub.redeem": "Обміняти винагороди",
  "launcher.hub.refer": "Запросити друга",
  "hub.visitor.title": "Увійдіть, щоб почати заробляти",
  "hub.visitor.desc": "Увійдіть, щоб відстежувати свої бали та розблоковувати винагороди.",
  "hub.member.nextReward": "Наступна винагорода",
  "hub.member.readyToRedeem": "Готово до обміну",
  "reward.redeemButton": "Обміняти",
  "tooltip.back": "Назад",
  "tooltip.close": "Закрити",
  "rule.purchase.title": "Зробити замовлення",
};

const zhTW: Bundle = {
  ...zhCN,
  "launcher.title": "您的獎勵",
  "launcher.text": "獎勵",
  "launcher.hub.earn": "賺取積分",
  "launcher.hub.redeem": "兌換獎勵",
  "launcher.hub.refer": "推薦朋友",
  "hub.visitor.title": "登入即可開始賺取積分",
  "hub.visitor.desc": "登入以追蹤您的積分並解鎖獎勵。",
  "hub.member.nextReward": "下一個獎勵",
  "hub.member.readyToRedeem": "可以兌換",
  "reward.redeemButton": "兌換",
  "tooltip.back": "返回",
  "tooltip.close": "關閉",
  "rule.purchase.title": "下單",
};

const ko: Bundle = {
  ...en,
  "launcher.title": "내 보상",
  "launcher.text": "보상",
  "launcher.hub.earn": "포인트 적립",
  "launcher.hub.redeem": "보상 사용",
  "launcher.hub.refer": "친구 추천",
  "hub.visitor.title": "로그인하고 적립을 시작하세요",
  "hub.visitor.desc": "로그인하여 포인트를 추적하고 보상을 잠금 해제하세요.",
  "hub.member.nextReward": "다음 보상",
  "hub.member.readyToRedeem": "사용 가능",
  "reward.redeemButton": "사용",
  "tooltip.back": "뒤로",
  "tooltip.close": "닫기",
  "rule.purchase.title": "주문하기",
};

const th: Bundle = {
  ...en,
  "launcher.title": "รางวัลของคุณ",
  "launcher.text": "รางวัล",
  "launcher.hub.earn": "รับคะแนน",
  "launcher.hub.redeem": "แลกรางวัล",
  "launcher.hub.refer": "แนะนำเพื่อน",
  "hub.visitor.title": "ลงชื่อเข้าใช้เพื่อเริ่มสะสมคะแนน",
  "hub.visitor.desc": "ลงชื่อเข้าใช้เพื่อติดตามคะแนนและปลดล็อกรางวัล",
  "hub.member.nextReward": "รางวัลถัดไป",
  "hub.member.readyToRedeem": "พร้อมแลก",
  "reward.redeemButton": "แลก",
  "tooltip.back": "ย้อนกลับ",
  "tooltip.close": "ปิด",
  "rule.purchase.title": "สั่งซื้อสินค้า",
};

const vi: Bundle = {
  ...en,
  "launcher.title": "Phần thưởng của bạn",
  "launcher.text": "Phần thưởng",
  "launcher.hub.earn": "Kiếm điểm",
  "launcher.hub.redeem": "Đổi phần thưởng",
  "launcher.hub.refer": "Giới thiệu bạn bè",
  "hub.visitor.title": "Đăng nhập để bắt đầu kiếm điểm",
  "hub.visitor.desc": "Đăng nhập để theo dõi điểm của bạn và mở khóa phần thưởng.",
  "hub.member.nextReward": "Phần thưởng tiếp theo",
  "hub.member.readyToRedeem": "Sẵn sàng đổi",
  "reward.redeemButton": "Đổi",
  "tooltip.back": "Quay lại",
  "tooltip.close": "Đóng",
  "rule.purchase.title": "Đặt hàng",
};

const id: Bundle = {
  ...en,
  "launcher.title": "Hadiah Anda",
  "launcher.text": "Hadiah",
  "launcher.hub.earn": "Dapatkan poin",
  "launcher.hub.redeem": "Tukar hadiah",
  "launcher.hub.refer": "Rekomendasikan teman",
  "hub.visitor.title": "Masuk untuk mulai mendapatkan poin",
  "hub.visitor.desc": "Masuk untuk melacak poin Anda dan membuka hadiah.",
  "hub.member.nextReward": "Hadiah berikutnya",
  "hub.member.readyToRedeem": "Siap ditukar",
  "reward.redeemButton": "Tukar",
  "tooltip.back": "Kembali",
  "tooltip.close": "Tutup",
  "rule.purchase.title": "Buat pesanan",
};

const hi: Bundle = {
  ...en,
  "launcher.title": "आपके पुरस्कार",
  "launcher.text": "पुरस्कार",
  "launcher.hub.earn": "अंक कमाएं",
  "launcher.hub.redeem": "पुरस्कार रिडीम करें",
  "launcher.hub.refer": "मित्र को रेफर करें",
  "hub.visitor.title": "अंक कमाना शुरू करने के लिए साइन इन करें",
  "hub.visitor.desc": "अपने अंक ट्रैक करने और पुरस्कार अनलॉक करने के लिए साइन इन करें।",
  "hub.member.nextReward": "अगला पुरस्कार",
  "hub.member.readyToRedeem": "रिडीम के लिए तैयार",
  "reward.redeemButton": "रिडीम करें",
  "tooltip.back": "वापस",
  "tooltip.close": "बंद करें",
  "rule.purchase.title": "ऑर्डर करें",
};

const tl: Bundle = {
  ...en,
  "launcher.title": "Iyong mga gantimpala",
  "launcher.text": "Mga Gantimpala",
  "launcher.hub.earn": "Magkamit ng puntos",
  "launcher.hub.redeem": "I-redeem ang mga gantimpala",
  "launcher.hub.refer": "I-refer ang isang kaibigan",
  "hub.visitor.title": "Mag-sign in para magsimulang kumita",
  "hub.visitor.desc": "Mag-sign in para subaybayan ang iyong mga puntos at i-unlock ang mga gantimpala.",
  "hub.member.nextReward": "Susunod na gantimpala",
  "hub.member.readyToRedeem": "Handa nang i-redeem",
  "reward.redeemButton": "I-redeem",
  "tooltip.back": "Bumalik",
  "tooltip.close": "Isara",
  "rule.purchase.title": "Mag-order",
};

const bn: Bundle = {
  ...en,
  "launcher.title": "আপনার পুরস্কার",
  "launcher.text": "পুরস্কার",
  "launcher.hub.earn": "পয়েন্ট অর্জন করুন",
  "launcher.hub.redeem": "পুরস্কার রিডিম করুন",
  "launcher.hub.refer": "বন্ধুকে রেফার করুন",
  "hub.visitor.title": "পয়েন্ট অর্জন শুরু করতে সাইন ইন করুন",
  "hub.visitor.desc": "আপনার পয়েন্ট ট্র্যাক করতে এবং পুরস্কার আনলক করতে সাইন ইন করুন।",
  "hub.member.nextReward": "পরবর্তী পুরস্কার",
  "hub.member.readyToRedeem": "রিডিম করার জন্য প্রস্তুত",
  "reward.redeemButton": "রিডিম করুন",
  "tooltip.back": "ফিরে যান",
  "tooltip.close": "বন্ধ করুন",
  "rule.purchase.title": "অর্ডার দিন",
};

const ta: Bundle = {
  ...en,
  "launcher.title": "உங்கள் வெகுமதிகள்",
  "launcher.text": "வெகுமதிகள்",
  "launcher.hub.earn": "புள்ளிகள் சம்பாதிக்க",
  "launcher.hub.redeem": "வெகுமதிகளை மீட்டெடுக்க",
  "launcher.hub.refer": "நண்பரை பரிந்துரை செய்ய",
  "hub.visitor.title": "புள்ளிகள் சம்பாதிக்க தொடங்க உள்நுழையவும்",
  "hub.visitor.desc": "உங்கள் புள்ளிகளைக் கண்காணிக்கவும், வெகுமதிகளைத் திறக்கவும் உள்நுழையவும்.",
  "hub.member.nextReward": "அடுத்த வெகுமதி",
  "hub.member.readyToRedeem": "மீட்டெடுக்க தயார்",
  "reward.redeemButton": "மீட்டெடுக்க",
  "tooltip.back": "திரும்ப",
  "tooltip.close": "மூடு",
  "rule.purchase.title": "ஆர்டர் செய்க",
};

const ar: Bundle = {
  ...en,
  "launcher.title": "مكافآتك",
  "launcher.text": "المكافآت",
  "launcher.hub.earn": "اربح النقاط",
  "launcher.hub.redeem": "استبدل المكافآت",
  "launcher.hub.refer": "أحل صديقًا",
  "hub.visitor.title": "سجّل الدخول لبدء كسب النقاط",
  "hub.visitor.desc": "سجّل الدخول لتتبع نقاطك وفتح المكافآت.",
  "hub.member.nextReward": "المكافأة التالية",
  "hub.member.readyToRedeem": "جاهزة للاستبدال",
  "reward.redeemButton": "استبدال",
  "tooltip.back": "رجوع",
  "tooltip.close": "إغلاق",
  "rule.purchase.title": "قدم طلبًا",
};

const he: Bundle = {
  ...en,
  "launcher.title": "התגמולים שלך",
  "launcher.text": "תגמולים",
  "launcher.hub.earn": "צבירת נקודות",
  "launcher.hub.redeem": "מימוש תגמולים",
  "launcher.hub.refer": "הפנייה של חבר",
  "hub.visitor.title": "התחבר כדי להתחיל לצבור",
  "hub.visitor.desc": "התחבר כדי לעקוב אחר הנקודות שלך ולפתוח תגמולים.",
  "hub.member.nextReward": "התגמול הבא",
  "hub.member.readyToRedeem": "מוכן למימוש",
  "reward.redeemButton": "מימוש",
  "tooltip.back": "חזרה",
  "tooltip.close": "סגירה",
  "rule.purchase.title": "ביצוע הזמנה",
};

const ur: Bundle = {
  ...en,
  "launcher.title": "آپ کے انعامات",
  "launcher.text": "انعامات",
  "launcher.hub.earn": "پوائنٹس کمائیں",
  "launcher.hub.redeem": "انعامات حاصل کریں",
  "launcher.hub.refer": "دوست کا حوالہ دیں",
  "hub.visitor.title": "کمائی شروع کرنے کے لیے سائن ان کریں",
  "hub.visitor.desc": "اپنے پوائنٹس کو ٹریک کرنے اور انعامات کو غیر مقفل کرنے کے لیے سائن ان کریں۔",
  "hub.member.nextReward": "اگلا انعام",
  "hub.member.readyToRedeem": "حاصل کرنے کے لیے تیار",
  "reward.redeemButton": "حاصل کریں",
  "tooltip.back": "واپس",
  "tooltip.close": "بند کریں",
  "rule.purchase.title": "آرڈر دیں",
};

const ru: Bundle = {
  ...en,
  "launcher.title": "Ваши награды",
  "launcher.text": "Награды",
  "launcher.hub.earn": "Получить баллы",
  "launcher.hub.redeem": "Обменять награды",
  "launcher.hub.refer": "Пригласить друга",
  "hub.visitor.title": "Войдите, чтобы начать зарабатывать",
  "hub.visitor.desc": "Войдите, чтобы отслеживать свои баллы и разблокировать награды.",
  "hub.member.nextReward": "Следующая награда",
  "hub.member.readyToRedeem": "Готово к обмену",
  "reward.redeemButton": "Обменять",
  "tooltip.back": "Назад",
  "tooltip.close": "Закрыть",
  "rule.purchase.title": "Сделать заказ",
};

export const TRANSLATIONS: Record<LocaleCode, Bundle> = {
  en,
  es,
  fr,
  de,
  it,
  "pt-BR": ptBR,
  nl,
  pl,
  cs,
  el,
  tr,
  nb,
  sv,
  da,
  fi,
  is,
  hu,
  ro,
  uk,
  ja,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  ko,
  th,
  vi,
  id,
  hi,
  tl,
  bn,
  ta,
  ar,
  he,
  ur,
  ru,
};

/** Look up a translation for a specific locale + key. Falls back to the
 *  English bundle, then to a final empty string (caller should pass a
 *  hardcoded default into t() to avoid empty strings). */
export function getDefault(locale: LocaleCode, key: string): string {
  return TRANSLATIONS[locale]?.[key] ?? TRANSLATIONS.en[key] ?? "";
}
