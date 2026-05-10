// Ticker data
const tickers = [
  { sym: 'S&P 500', val: '7,163.5', chg: '+64.9 (+0.91%)', dir: 'up' },
  { sym: 'NAS 100', val: '27,297.3', chg: '+502.0 (+1.87%)', dir: 'up' },
  { sym: 'BTC',     val: '77,641',  chg: '+175 (+0.23%)',  dir: 'up' },
  { sym: 'ETH',     val: '2,318.9', chg: '+3.0 (+0.13%)',  dir: 'up' },
  { sym: 'TRX',     val: '0.3246',  chg: '-0.0046 (-1.41%)', dir: 'down' },
  { sym: 'XRP',     val: '1.4342',  chg: '+0.00042 (+0.03%)', dir: 'up' },
  { sym: 'EUR/USD', val: '1.0942',  chg: '+0.0021 (+0.19%)', dir: 'up' },
  { sym: 'XAU',     val: '2,648.10', chg: '-12.40 (-0.47%)', dir: 'down' },
];

const track = document.getElementById('tickerTrack');
function buildTickerHTML() {
  return tickers.map(t => `<span class="t">${t.sym} <b>${t.val}</b> <span class="${t.dir}">${t.chg}</span></span>`).join('');
}
// Duplicate to allow infinite scroll
track.innerHTML = buildTickerHTML() + buildTickerHTML();

// Header scroll state
const header = document.getElementById('header');
window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 8);
});

// Mobile menu
document.getElementById('burger').addEventListener('click', () => {
  header.classList.toggle('open');
});
document.querySelectorAll('.nav a').forEach(a => a.addEventListener('click', () => header.classList.remove('open')));

// Reveal on scroll
const revealEls = document.querySelectorAll('.section, .hero__copy, .hero__card, .feature, .plan, .stat, .pro__panel');
revealEls.forEach(el => el.classList.add('reveal'));
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { threshold: 0.12 });
revealEls.forEach(el => io.observe(el));

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    if (id.length > 1) {
      const t = document.querySelector(id);
      if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }
  });
});

// Animate hero portfolio value
const valueEl = document.querySelector('.trade-card__value');
if (valueEl) {
  let v = 48000;
  setInterval(() => {
    v += (Math.random() - 0.45) * 60;
    const whole = Math.floor(v).toLocaleString();
    const cents = String(Math.floor((v % 1) * 100)).padStart(2, '0');
    valueEl.innerHTML = `$${whole}.<span class="muted">${cents}</span>`;
  }, 1800);
}
