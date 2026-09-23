/**
 * popup.js
 * ------------------------------------------------------------------
 * MVC: PopupView (DOM) + PopupController (منطق) + SiteListEditor (Composition).
 * DRY - Don't Repeat Yourself: یک کلاس SiteListEditor برای هر سه لیست
 * (customSites / rtlCustomSites / excludedPaths) استفاده می‌شود.
 */

class PopupView {
  constructor() {
    this.globalToggle = document.getElementById("globalToggle");
    this.fontSelect = document.getElementById("fontSelect");
    this.weightSelect = document.getElementById("weightSelect");
    this.customSitesSection = document.getElementById("customSitesSection");
    this.currentSiteLabel = document.getElementById("currentSiteLabel");
    this.currentSiteToggle = document.getElementById("currentSiteToggle");
    this.scopeRadios = Array.from(
      document.querySelectorAll('input[name="scope"]'),
    );

    this.rtlCustomSitesSection = document.getElementById(
      "rtlCustomSitesSection",
    );
    this.rtlCurrentSiteLabel = document.getElementById("rtlCurrentSiteLabel");
    this.rtlCurrentSiteToggle = document.getElementById("rtlCurrentSiteToggle");
    this.rtlScopeRadios = Array.from(
      document.querySelectorAll('input[name="rtlScope"]'),
    );
  }

  populateFontOptions(fonts, selectedFont) {
    this.fontSelect.innerHTML = fonts
      .map(
        (font) =>
          `<option value="${font}" ${selectedFont === font ? "selected" : ""}>${font}</option>`,
      )
      .join("");
  }

  setGlobalToggle(isEnabled) {
    this.globalToggle.checked = isEnabled;
  }

  setWeight(weight) {
    this.weightSelect.value = weight;
  }

  setScope(scope) {
    this.scopeRadios.forEach((radio) => {
      radio.checked = radio.value === scope;
    });
    this.customSitesSection.style.display =
      scope === "custom" ? "flex" : "none";
  }

  setRtlScope(scope) {
    this.rtlScopeRadios.forEach((radio) => {
      radio.checked = radio.value === scope;
    });
    this.rtlCustomSitesSection.style.display =
      scope === "custom" ? "flex" : "none";
  }

  setCurrentSiteLabel(hostname) {
    this.currentSiteLabel.textContent = hostname;
    this.rtlCurrentSiteLabel.textContent = hostname;
  }

  setCurrentSiteToggle(isEnabled) {
    this.currentSiteToggle.checked = Boolean(isEnabled);
  }

  setRtlCurrentSiteToggle(isEnabled) {
    this.rtlCurrentSiteToggle.checked = Boolean(isEnabled);
  }
}

/**
 * SiteListEditor
 * ------------------------------------------------------------------
 * یک لیست عمومی (اضافه/حذف آیتم) که با storage همگام می‌شود.
 * settingsKey تعیین می‌کند کدام آرایه در تنظیمات ویرایش شود
 * (customSites / rtlCustomSites / excludedPaths).
 *
 * @param {SettingsRepository} repository
 * @param {string} settingsKey
 * @param {{inputEl: HTMLInputElement, addBtnEl: HTMLButtonElement, listEl: HTMLUListElement}} elements
 * @param {Function} [onChange]
 */
class SiteListEditor {
  constructor(repository, settingsKey, elements, onChange) {
    this.repository = repository;
    this.settingsKey = settingsKey;
    this.inputEl = elements.inputEl;
    this.addBtnEl = elements.addBtnEl;
    this.listEl = elements.listEl;
    this.onChange = onChange;
  }

  async render() {
    var settings = await this.repository.getSettings();
    var sites = settings[this.settingsKey];

    this.listEl.innerHTML = "";
    sites.forEach((site) => {
      var li = document.createElement("li");
      li.innerHTML = `<span>${site}</span>`;

      var removeBtn = document.createElement("button");
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => this.remove(site));

      li.appendChild(removeBtn);
      this.listEl.appendChild(li);
    });
  }

  bindEvents() {
    this.addBtnEl.addEventListener("click", () => this.add());
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.add();
      }
    });
  }

  async add() {
    var value = this.inputEl.value.trim().toLowerCase();
    if (!value) {
      return;
    }

    var settings = await this.repository.getSettings();
    var list = settings[this.settingsKey];
    if (list.includes(value)) {
      return;
    }

    await this.repository.updateSettings({
      [this.settingsKey]: [...list, value],
    });

    this.inputEl.value = "";
    await this.render();
    this.onChange?.();
  }

  async remove(site) {
    var settings = await this.repository.getSettings();
    var list = settings[this.settingsKey];

    await this.repository.updateSettings({
      [this.settingsKey]: list.filter((s) => s !== site),
    });

    await this.render();
    this.onChange?.();
  }
}

class PopupController {
  constructor(repository, view) {
    this.repository = repository;
    this.view = view;
    this.activeTab = null;
    this.fontSiteEditor = null;
    this.rtlSiteEditor = null;
    this.excludedPathsEditor = null;
  }

  async init() {
    this.activeTab = await this.getActiveTab();
    var settings = await this.repository.getSettings();

    this.view.populateFontOptions(FontsCatalog, settings.selectedFont);
    this.view.setGlobalToggle(settings.isGloballyEnabled);
    this.view.setWeight(settings.fontWeight);
    this.view.setScope(settings.scope);
    this.view.setRtlScope(settings.rtlScope);

    this.fontSiteEditor = new SiteListEditor(
      this.repository,
      "customSites",
      {
        inputEl: document.getElementById("customSiteInput"),
        addBtnEl: document.getElementById("addSiteBtn"),
        listEl: document.getElementById("customSitesList"),
      },
      this.broadcastUpdate,
    );

    this.rtlSiteEditor = new SiteListEditor(
      this.repository,
      "rtlCustomSites",
      {
        inputEl: document.getElementById("rtlCustomSiteInput"),
        addBtnEl: document.getElementById("rtlAddSiteBtn"),
        listEl: document.getElementById("rtlCustomSitesList"),
      },
      this.broadcastUpdate,
    );

    // مسیرهای مستثنا (مثل google.com/maps) - اگر این عناصر در popup.html وجود نداشته باشند،
    // این بخش نادیده گرفته می‌شود بدون اینکه بقیه‌ی پاپ‌آپ را خراب کند.
    var excludedInput = document.getElementById("excludedPathInput");
    var excludedAddBtn = document.getElementById("excludedPathAddBtn");
    var excludedList = document.getElementById("excludedPathsList");

    if (excludedInput && excludedAddBtn && excludedList) {
      this.excludedPathsEditor = new SiteListEditor(
        this.repository,
        "excludedPaths",
        {
          inputEl: excludedInput,
          addBtnEl: excludedAddBtn,
          listEl: excludedList,
        },
        this.broadcastUpdate,
      );
    }

    await this.fontSiteEditor.render();
    await this.rtlSiteEditor.render();
    this.fontSiteEditor.bindEvents();
    this.rtlSiteEditor.bindEvents();

    if (this.excludedPathsEditor) {
      await this.excludedPathsEditor.render();
      this.excludedPathsEditor.bindEvents();
    }

    if (this.activeTab?.url) {
      var hostname = this.safeHostname(this.activeTab.url);
      this.view.setCurrentSiteLabel(hostname);
      this.view.setCurrentSiteToggle(settings.perSiteOverrides[hostname]);
      this.view.setRtlCurrentSiteToggle(settings.rtlPerSiteOverrides[hostname]);
    }

    this.bindEvents();
  }

  safeHostname(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  async getActiveTab() {
    var [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async notifyContentScript(tabId, message) {
    try {
      await chrome.tabs.sendMessage(tabId, message);
    } catch {
      // content script در این تب موجود نیست (مثلا chrome://) - قابل چشم‌پوشی
    }
  }

  bindEvents() {
    this.view.globalToggle.addEventListener("change", async (e) => {
      await this.repository.updateSettings({
        isGloballyEnabled: e.target.checked,
      });
      this.broadcastUpdate();
    });

    this.view.fontSelect.addEventListener("change", async (e) => {
      await this.repository.updateSettings({ selectedFont: e.target.value });
      this.broadcastUpdate();
    });

    this.view.weightSelect.addEventListener("change", async (e) => {
      await this.repository.updateSettings({ fontWeight: e.target.value });
      this.broadcastUpdate();
    });

    this.view.scopeRadios.forEach((radio) => {
      radio.addEventListener("change", async (e) => {
        if (!e.target.checked) return;
        await this.repository.updateSettings({ scope: e.target.value });
        this.view.setScope(e.target.value);
        this.broadcastUpdate();
      });
    });

    this.view.rtlScopeRadios.forEach((radio) => {
      radio.addEventListener("change", async (e) => {
        if (!e.target.checked) return;
        await this.repository.updateSettings({ rtlScope: e.target.value });
        this.view.setRtlScope(e.target.value);
        this.broadcastUpdate();
      });
    });

    this.view.currentSiteToggle.addEventListener("change", async (e) => {
      if (!this.activeTab?.id) return;
      await this.notifyContentScript(this.activeTab.id, {
        type: "TOGGLE_CURRENT_SITE",
        payload: { feature: "font", isEnabled: e.target.checked },
      });
    });

    this.view.rtlCurrentSiteToggle.addEventListener("change", async (e) => {
      if (!this.activeTab?.id) return;
      await this.notifyContentScript(this.activeTab.id, {
        type: "TOGGLE_CURRENT_SITE",
        payload: { feature: "rtl", isEnabled: e.target.checked },
      });
    });
  }

  broadcastUpdate = async () => {
    var tabs = await chrome.tabs.query({});
    tabs.forEach((tab) => {
      if (tab.id) {
        this.notifyContentScript(tab.id, { type: "SETTINGS_UPDATED" });
      }
    });
  };
}

document.addEventListener("DOMContentLoaded", () => {
  var controller = new PopupController(
    new SettingsRepository(),
    new PopupView(),
  );
  controller.init();
});
