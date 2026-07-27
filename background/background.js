/**
 * background.js (Service Worker - Manifest V3)
 * مسئولیت: نصب اولیه تنظیمات و باز کردن صفحه About در اولین نصب.
 */
importScripts("../lib/settings-repository.js");

chrome.runtime.onInstalled.addListener(async (details) => {
  const repository = new SettingsRepository();
  await repository.getSettings(); // مقداردهی اولیه در storage

  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("about/about.html") });
  }
});
