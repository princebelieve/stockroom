export function publicNavigation() {
  const legacy: Record<string,string> = { '#features':'features', '#how':'getting-started', '#install':'downloads', '#referrals':'referrals' }
  if (/^\/welcome(?:\.html)?\/?$/.test(location.pathname) && legacy[location.hash]) {
    const destination = new URL(`/${legacy[location.hash]}.html`, location.origin)
    destination.search = location.search
    location.replace(destination.href)
    return
  }
  const header = document.querySelector('header')
  if (!header) return
  header.innerHTML = `<a class="brand" href="/welcome.html" aria-label="Stockroom Business home"><img src="/logo.png" width="64" height="64" alt=""><span><strong>S. B. Ibhadode Technologies</strong><span>Stockroom Business</span></span></a><button id="landing-menu-toggle" class="menu-toggle" type="button" aria-label="Open navigation menu" aria-controls="main-nav" aria-expanded="false"><span aria-hidden="true">&#9776;</span><span>Menu</span></button><nav id="main-nav" aria-label="Main navigation"><a href="/welcome.html">Home</a><details class="landing-nav-group"><summary>Product</summary><div class="landing-subnav"><a href="/features.html">Features</a><a href="/workspaces.html">Business workspaces</a><a href="/hardware.html">Devices &amp; tested hardware</a></div></details><details class="landing-nav-group"><summary>Get started</summary><div class="landing-subnav"><a href="/getting-started.html">Setup &amp; training</a><a href="/downloads.html">Downloads &amp; installation</a><a href="/support.html">Support</a></div></details><details class="landing-nav-group"><summary>Referrals</summary><div class="landing-subnav"><a href="/referrals.html">How rewards work</a><a href="/visitor">Visitor referral link &amp; wallet</a></div></details><details class="landing-nav-group"><summary>Resources</summary><div class="landing-subnav"><a href="https://sbi.globalcreest.com/">About us</a><a href="/account-deletion">Close your account</a><a href="/privacy.html">Privacy policy</a><a href="/terms.html">Terms and conditions</a></div></details><a class="landing-signin" href="https://stockroom.globalcreest.com/?screen=signin">Owner / staff sign in</a><a class="landing-register" href="/getting-started.html">Register a business</a></nav>`
  const page = location.pathname.replace(/\.html$/, '').replace(/\/$/, '')
  document.querySelectorAll<HTMLAnchorElement>('nav a').forEach(link => {
    if (new URL(link.href).pathname.replace(/\.html$/, '') === page) link.setAttribute('aria-current', 'page')
  })
  const referral = new URLSearchParams(location.search).get('ref')
  if (referral && /^[a-f0-9]{32}$/.test(referral)) document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(link => {
    const url = new URL(link.href)
    if (url.origin === location.origin && /\/(welcome|features|workspaces|hardware|getting-started|downloads|referrals|support)(\.html)?$/.test(url.pathname)) { url.searchParams.set('ref', referral); link.href = url.href }
  })
}
