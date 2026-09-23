/**
 * UrlPatternMatcher
 * ------------------------------------------------------------------
 * Single Responsibility: تشخیص اینکه آیا آدرس فعلی صفحه (hostname + pathname)
 * با یکی از الگوهای استثنا (exclusion patterns) که کاربر وارد کرده مطابقت دارد یا نه.
 * الگوها می‌توانند به دو شکل باشند:
 *   - فقط دامنه:      "google.com"        => کل سایت مستثنا می‌شود
 *   - دامنه + مسیر:    "google.com/maps"   => فقط مسیرهایی که با /maps شروع می‌شوند
 */
class UrlPatternMatcher {
  /**
   * الگوی خام کاربر را به { hostname, pathPrefix } تبدیل می‌کند.
   * @param {string} pattern
   * @returns {{hostname: string, pathPrefix: string}}
   */
  static normalize(pattern) {
    var raw = pattern.trim().toLowerCase();
    raw = raw.replace(/^https?:\/\//, '');
    raw = raw.replace(/^www\./, '');
    if (raw.endsWith('/')) {
      raw = raw.slice(0, -1);
    }

    var slashIndex = raw.indexOf('/');
    if (slashIndex === -1) {
      return { hostname: raw, pathPrefix: '' };
    }
    return {
      hostname: raw.slice(0, slashIndex),
      pathPrefix: raw.slice(slashIndex),
    };
  }

  /**
   * @param {string} hostname آدرس دامنه فعلی صفحه (بدون www)
   * @param {string} pathname مسیر فعلی صفحه (مثلا /maps/place/...)
   * @param {string} pattern یک الگوی خام از تنظیمات
   * @returns {boolean}
   */
  static matchesOne(hostname, pathname, pattern) {
    var normalized = UrlPatternMatcher.normalize(pattern);
    if (!normalized.hostname) {
      return false;
    }

    var cleanHostname = hostname.replace(/^www\./, '');
    var hostMatches =
      cleanHostname === normalized.hostname ||
      cleanHostname.endsWith('.' + normalized.hostname);

    if (!hostMatches) {
      return false;
    }
    if (!normalized.pathPrefix) {
      return true;
    }
    return pathname.startsWith(normalized.pathPrefix);
  }

  /**
   * @param {string} hostname
   * @param {string} pathname
   * @param {string[]} patterns
   * @returns {boolean} true اگر آدرس فعلی باید مستثنا شود
   */
  static isExcluded(hostname, pathname, patterns) {
    var list = patterns || [];
    return list.some(function (pattern) {
      return UrlPatternMatcher.matchesOne(hostname, pathname, pattern);
    });
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.UrlPatternMatcher = UrlPatternMatcher;
}