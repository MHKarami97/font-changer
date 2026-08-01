/**
 * content.js
 * ------------------------------------------------------------------
 * نقطه ورود Content Script. مسئولیت‌ها بر اساس SRP بین چند کلاس تقسیم شده‌اند:
 *
 *   - GoogleFontLoader   : بارگذاری فونت از Google Fonts
 *   - IconFontDetector   : تشخیص و محافظت از المان‌هایی که از فونت آیکون
 *                          (Material Icons, Material Symbols, Google Symbols,
 *                          Font Awesome, ...) استفاده می‌کنند، حتی اگر داخل
 *                          Shadow DOM (مثل Google Maps) باشند
 *   - FontApplier        : اعمال فونت روی <html> با CSS Injection
 *   - DirectionApplier   : اجباری‌کردن جهت صفحه به RTL (ویژگی کاملاً مستقل)
 *   - FontChangerController / DirectionController : Orchestrator هرکدام
 *                          (Facade Pattern)
 *
 * نکته فنی مهم درباره Shadow DOM:
 * بسیاری از اپلیکیشن‌های مدرن گوگل (از جمله Google Maps) از Web Components
 * با Shadow DOM استفاده می‌کنند. طبق مشخصات استاندارد Shadow DOM، شیوه‌نامه‌های
 * (stylesheet) تزریق‌شده در سند اصلی (Light DOM) به داخل Shadow Tree نفوذ
 * نمی‌کنند، اما ویژگی‌های ارثی مثل font-family از طریق مرز Shadow به پایین
 * به ارث می‌رسند (Inheritance Across Shadow Boundary). به همین دلیل حتی
 * بدون نفوذ مستقیم CSS، آیکون‌های داخل Shadow DOM هم تحت تاثیر فونت جدید
 * قرار می‌گیرند. برای رفع کامل این مشکل، باید:
 *   ۱. به‌صورت بازگشتی به داخل Shadow Root های "open" نفوذ کرد (Shadow Root
 *      های "closed" به دلایل امنیتی از جاوااسکریپت صفحه/افزونه غیرقابل
 *      دسترسی هستند - این یک محدودیت پلتفرمی مرورگر است، نه باگ افزونه).
 *   ۲. به‌جای تکیه بر یک قانون CSS سراسری با `:not()`، فونت اصلیِ محاسبه‌شده
 *      (Computed Style) هر المان آیکونی را قبل از تغییر، به‌صورت
 *      inline style با `!important` روی خود همان المان قفل کرد. طبق قوانین
 *      Cascade در CSS، یک inline style با `!important` همیشه بر یک قانون
 *      `!important` در stylesheet خارجی اولویت دارد، پس این روش مستقل از
 *      Light/Shadow DOM بودن المان، تضمین‌شده کار می‌کند.
 */

class GoogleFontLoader {
  static #LINK_ID = "__font-changer-google-font-link__";

  load(fontFamily, weight = "400") {
    const existing = document.getElementById(GoogleFontLoader.#LINK_ID);
    if (existing) existing.remove();

    const link = document.createElement("link");
    link.id = GoogleFontLoader.#LINK_ID;
    link.rel = "stylesheet";
    const encodedFamily = fontFamily.trim().replace(/\s+/g, "+");
    link.href = `https://fonts.googleapis.com/css2?family=${encodedFamily}:wght@${weight}&display=swap`;
    (document.head || document.documentElement).appendChild(link);
  }

  remove() {
    const existing = document.getElementById(GoogleFontLoader.#LINK_ID);
    if (existing) existing.remove();
  }
}

/**
 * ShadowDomWalker
 * ------------------------------------------------------------------
 * مسئولیت واحد: پیمایش بازگشتی درخت DOM به‌همراه تمام Shadow Root های
 * قابل‌دسترسی (open) داخل آن. این کلاس به‌طور مستقل قابل تست و بازاستفاده
 * است (هم توسط IconFontDetector و هم در آینده برای هر قابلیت دیگری که
 * نیاز به عبور از مرز Shadow DOM دارد).
 */
class ShadowDomWalker {
  /**
   * @param {ParentNode} root
   * @param {(element: Element) => void} visit
   */
  static walk(root, visit) {
    if (!root) return;
    const elements = root.querySelectorAll ? root.querySelectorAll("*") : [];
    elements.forEach((el) => {
      visit(el);
      if (el.shadowRoot) {
        ShadowDomWalker.walk(el.shadowRoot, visit);
      }
    });
  }

  /**
   * جمع‌آوری تمام Shadow Root های قابل‌دسترسی (برای اتصال MutationObserver).
   * @param {ParentNode} root
   * @returns {ShadowRoot[]}
   */
  static collectShadowRoots(root) {
    const roots = [];
    ShadowDomWalker.walk(root, (el) => {
      if (el.shadowRoot) roots.push(el.shadowRoot);
    });
    return roots;
  }
}

/**
 * IconFontDetector
 * ------------------------------------------------------------------
 * تشخیص المان‌های آیکونی (بر اساس font-family محاسبه‌شده) در سراسر
 * Light DOM و Shadow DOM، و قفل‌کردن فونت اصلی آن‌ها با inline !important
 * تا با تغییر فونت سراسری صفحه دست‌نخورده باقی بمانند.
 */
class IconFontDetector {
  static #MARK_ATTRIBUTE = "data-fc-icon";

  static #ICON_FONT_KEYWORDS = [
    "material icons",
    "material symbols",
    "google symbols",
    "google material icons",
    "font awesome",
    "fontawesome",
    "glyphicons",
    "ionicons",
    "octicons",
    "feather",
    "bootstrap-icons",
    "iconfont",
    "dx-icons",
    "remixicon"
  ];

  #observers = [];
  #debounceTimer = null;

  /**
   * پیمایش کامل (Light DOM + Shadow DOM) و قفل‌کردن فونت اصلی آیکون‌ها.
   * باید پیش از تزریق قانون سراسری فونت اجرا شود.
   * @param {ParentNode} root
   */
  scan(root = document.body) {
    if (!root) return;
    ShadowDomWalker.walk(root, (el) => this.#lockIfIconFont(el));
  }

  /**
   * فعال‌سازی MutationObserver روی سند اصلی و تمام Shadow Root های موجود،
   * به‌همراه debounce برای جلوگیری از افت Performance روی سایت‌های پرتغییر
   * مثل Google Maps.
   */
  observe(root = document.documentElement) {
    this.disconnect();

    const attach = (targetRoot) => {
      const observer = new MutationObserver(() => this.#scheduleRescan(root));
      observer.observe(targetRoot, { childList: true, subtree: true });
      this.#observers.push(observer);
    };

    attach(root);
    ShadowDomWalker.collectShadowRoots(root).forEach(attach);
  }

  disconnect() {
    this.#observers.forEach((observer) => observer.disconnect());
    this.#observers = [];
    if (this.#debounceTimer) {
      clearTimeout(this.#debounceTimer);
      this.#debounceTimer = null;
    }
  }

  #scheduleRescan(root) {
    if (this.#debounceTimer) clearTimeout(this.#debounceTimer);
    this.#debounceTimer = setTimeout(() => {
      this.scan(root);
      // شادو روت‌های تازه اضافه‌شده را هم زیر نظر می‌گیریم
      this.observe(root);
    }, 200);
  }

  #lockIfIconFont(element) {
    if (!(element instanceof Element)) return;
    if (element.hasAttribute(IconFontDetector.#MARK_ATTRIBUTE)) return;

    const computedStyle = element.ownerDocument?.defaultView?.getComputedStyle(element);
    const computedFamily = computedStyle?.fontFamily?.toLowerCase() || "";
    const isIconFont = IconFontDetector.#ICON_FONT_KEYWORDS.some((keyword) =>
      computedFamily.includes(keyword)
    );

    if (isIconFont) {
      // قفل‌کردن فونت اصلی به‌صورت inline !important روی خود المان.
      // این روش مستقل از Light/Shadow DOM بودن، و مستقل از specificity
      // قانون سراسری فونت، همیشه اولویت دارد.
      element.style.setProperty("font-family", computedStyle.fontFamily, "important");
      element.setAttribute(IconFontDetector.#MARK_ATTRIBUTE, "true");
    }
  }
}

class FontApplier {
  static #STYLE_ID = "__font-changer-style__";

  apply(fontFamily) {
    let styleTag = document.getElementById(FontApplier.#STYLE_ID);
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = FontApplier.#STYLE_ID;
      (document.head || document.documentElement).appendChild(styleTag);
    }
    // المان‌های آیکونی از قبل توسط IconFontDetector با inline !important
    // قفل شده‌اند، پس این قانون سراسری روی آن‌ها بی‌اثر می‌ماند و نیازی به
    // انتخابگر :not() پیچیده نیست (که در Shadow DOM هم کار نمی‌کرد).
    styleTag.textContent = `
      html, body, * {
        font-family: "${fontFamily}", "Vazirmatn", "Tahoma", sans-serif !important;
      }
    `;
  }

  remove() {
    const styleTag = document.getElementById(FontApplier.#STYLE_ID);
    if (styleTag) styleTag.remove();
  }
}

/**
 * DirectionApplier
 * ------------------------------------------------------------------
 * قابلیت مستقل "اجبار جهت راست‌به‌چپ (RTL)".
 */
class DirectionApplier {
  static #STYLE_ID = "__font-changer-rtl-style__";
  static #ORIGINAL_DIR_ATTR = "data-fc-original-dir";
  static #NONE_MARKER = "__none__";

  apply() {
    const html = document.documentElement;

    if (!html.hasAttribute(DirectionApplier.#ORIGINAL_DIR_ATTR)) {
      const originalDir = html.getAttribute("dir") || DirectionApplier.#NONE_MARKER;
      html.setAttribute(DirectionApplier.#ORIGINAL_DIR_ATTR, originalDir);
    }

    html.setAttribute("dir", "rtl");

    let styleTag = document.getElementById(DirectionApplier.#STYLE_ID);
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = DirectionApplier.#STYLE_ID;
      (document.head || document.documentElement).appendChild(styleTag);
    }
    styleTag.textContent = `
      html, body {
        direction: rtl !important;
      }
    `;
  }

  remove() {
    const html = document.documentElement;

    if (html.hasAttribute(DirectionApplier.#ORIGINAL_DIR_ATTR)) {
      const originalDir = html.getAttribute(DirectionApplier.#ORIGINAL_DIR_ATTR);
      if (originalDir === DirectionApplier.#NONE_MARKER) {
        html.removeAttribute("dir");
      } else {
        html.setAttribute("dir", originalDir);
      }
      html.removeAttribute(DirectionApplier.#ORIGINAL_DIR_ATTR);
    }

    const styleTag = document.getElementById(DirectionApplier.#STYLE_ID);
    if (styleTag) styleTag.remove();
  }
}

class FontChangerController {
  #settingsRepository;
  #fontLoader;
  #fontApplier;
  #iconDetector;

  constructor(settingsRepository, fontLoader, fontApplier, iconDetector) {
    this.#settingsRepository = settingsRepository;
    this.#fontLoader = fontLoader;
    this.#fontApplier = fontApplier;
    this.#iconDetector = iconDetector;
  }

  async run() {
    const settings = await this.#settingsRepository.getSettings();
    const hostname = window.location.hostname;

    const perSiteOverride = settings.perSiteOverrides[hostname];
    const strategy = ScopeStrategyFactory.create(settings.scope, "customSites");

    let shouldApply;
    if (typeof perSiteOverride === "boolean") {
      shouldApply = perSiteOverride;
    } else {
      shouldApply =
        settings.isGloballyEnabled &&
        strategy.isApplicable(hostname, document, settings);
    }

    if (shouldApply) {
      // اسکن آیکون‌ها (Light + Shadow DOM) باید پیش از اعمال فونت انجام
      // شود تا Computed Style اصلی (قبل از override) خوانده شود.
      this.#iconDetector.scan(document.body);
      this.#iconDetector.observe(document.documentElement);
      this.#fontLoader.load(settings.selectedFont, settings.fontWeight);
      this.#fontApplier.apply(settings.selectedFont);
    } else {
      this.#iconDetector.disconnect();
      this.#fontLoader.remove();
      this.#fontApplier.remove();
    }
  }
}

class DirectionController {
  #settingsRepository;
  #directionApplier;

  constructor(settingsRepository, directionApplier) {
    this.#settingsRepository = settingsRepository;
    this.#directionApplier = directionApplier;
  }

  async run() {
    const settings = await this.#settingsRepository.getSettings();
    const hostname = window.location.hostname;

    const perSiteOverride = settings.rtlPerSiteOverrides[hostname];
    const strategy = ScopeStrategyFactory.create(settings.rtlScope, "rtlCustomSites");

    let shouldApply;
    if (typeof perSiteOverride === "boolean") {
      shouldApply = perSiteOverride;
    } else {
      shouldApply = strategy.isApplicable(hostname, document, settings);
    }

    if (shouldApply) {
      this.#directionApplier.apply();
    } else {
      this.#directionApplier.remove();
    }
  }
}

(function bootstrap() {
  const settingsRepository = new SettingsRepository();

  const fontController = new FontChangerController(
    settingsRepository,
    new GoogleFontLoader(),
    new FontApplier(),
    new IconFontDetector()
  );

  const directionController = new DirectionController(
    settingsRepository,
    new DirectionApplier()
  );

  const runAll = () => {
    fontController.run();
    directionController.run();
  };

  const start = () => {
    runAll();

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "TOGGLE_CURRENT_SITE") {
        const { feature, isEnabled } = message.payload;
        const hostname = window.location.hostname;

        const overrideUpdate =
          feature === "rtl"
            ? settingsRepository.setRtlPerSiteOverride(hostname, isEnabled)
            : settingsRepository.setPerSiteOverride(hostname, isEnabled);

        overrideUpdate.then(runAll).then(() => sendResponse({ ok: true }));
        return true; // async response
      }

      if (message?.type === "SETTINGS_UPDATED") {
        runAll();
      }
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
