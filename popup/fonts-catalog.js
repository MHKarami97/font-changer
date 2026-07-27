/**
 * FontsCatalog
 * لیست ثابتی از محبوب‌ترین فونت‌های گوگل (شامل فونت‌های فارسی).
 * در نسخه‌های بعدی می‌توان این را از Google Fonts Developer API
 * (https://developers.google.com/fonts/docs/developer_api) به صورت
 * داینامیک دریافت کرد (نیازمند API Key و لایه Caching جداگانه).
 */
const FontsCatalog = Object.freeze([
  "Vazirmatn",
  "Vazir",
  "Sahel",
  "Shabnam",
  "IRANSans",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Poppins",
  "Inter",
  "Noto Sans",
  "Noto Naskh Arabic",
  "Tajawal",
  "Cairo",
  "Rubik",
  "Merriweather",
  "Playfair Display"
]);

if (typeof globalThis !== "undefined") {
  globalThis.FontsCatalog = FontsCatalog;
}
