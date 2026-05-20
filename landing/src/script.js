// OS detection: rewrite the hero primary CTA and pre-select the right download card.
(function () {
  const ua = navigator.userAgent;
  const platform = navigator.userAgentData?.platform || navigator.platform || '';

  let target = null;
  let label = 'Download';
  let sub = '';

  const isMac = /Mac|iPhone|iPad/i.test(ua) || /mac/i.test(platform);
  const isWin = /Windows/i.test(ua) || /win/i.test(platform);

  if (isMac) {
    // Apple Silicon detection is unreliable from UA. Default to arm64 since
    // anything sold since late 2020 is Apple Silicon. Older Intel Mac users
    // can use the "See all downloads" path.
    target = 'https://github.com/dtsoden/hash-markup/releases/latest/download/Hash-Markup-mac-arm64.dmg';
    label = 'Download for Mac';
    sub = 'Apple Silicon · also available for Intel below';
  } else if (isWin) {
    target = 'https://github.com/dtsoden/hash-markup/releases/latest/download/Hash-Markup-Setup-Windows.exe';
    label = 'Download for Windows';
    sub = '64-bit installer';
  } else {
    sub = 'Pick your platform below.';
  }

  const btn = document.getElementById('primary-download');
  const subEl = document.getElementById('primary-download-sub');
  if (target && btn) {
    btn.href = target;
    btn.textContent = label;
  }
  if (subEl) {
    subEl.textContent = sub;
  }
})();

// Footer year
document.getElementById('year').textContent = new Date().getFullYear();

// Fade-in on scroll. One observer, no library.
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    }
  },
  { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
);
document.querySelectorAll('section, .hero, .site-foot').forEach((el) => {
  el.classList.add('reveal');
  io.observe(el);
});
