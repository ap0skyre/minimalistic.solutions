#!/usr/bin/env python3
"""
Static page builder for minimalistic.solutions.

Every source file in _build/pages/ starts with a JSON meta comment and is
built twice: English at /<out> and Polish at /pl/<out>. Content is written
bilingually (<span lang="en">..</span><span lang="pl">..</span>); each build
keeps only its own language, so every URL serves clean single-language HTML
with hreflang alternates (good for SEO).

Tokens inside page content:
  {{P}}     relative path to the home page of the current language
  {{A}}     relative path to the site root (assets)
  {{MAIL}}  contact e-mail      {{PLAY}}  Outlier on Google Play
  {{LOGIN}} team login URL

Run:  python _build/build.py        (requires: pip install beautifulsoup4)
"""
import datetime, json, pathlib, re
from bs4 import BeautifulSoup

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = ROOT / '_build' / 'pages'

SITE = 'https://minimalistic.solutions'
LOGIN = 'https://app.minimalistic.solutions/'
MAIL = 'empyreaninu@gmail.com'
PLAY_ID = 'com.project.outlier'
PLAY = {'en': f'https://play.google.com/store/apps/details?id={PLAY_ID}&amp;hl=en',
        'pl': f'https://play.google.com/store/apps/details?id={PLAY_ID}&amp;hl=pl'}
LANGS = ('en', 'pl')
TODAY = datetime.date.today().isoformat()


def L(en, pl):
    return f'<span lang="en">{en}</span><span lang="pl">{pl}</span>'


def url(lang, out):
    path = out.replace('index.html', '')
    return f'{SITE}/{"pl/" if lang == "pl" else ""}{path}'


def abspath(lang, out):
    return url(lang, out)[len(SITE):]


# ----------------------------------------------------------------------------
# Structured data
# ----------------------------------------------------------------------------
ORG = {'@type': 'Organization', '@id': f'{SITE}/#org', 'name': 'minimalistic.solutions',
       'url': f'{SITE}/', 'logo': f'{SITE}/assets/img/icon-512.png', 'email': MAIL}


def crumbs(lang, m):
    home = 'Home' if lang == 'en' else 'Strona główna'
    items = [(home, url(lang, 'index.html'))]
    if m.get('crumb'):
        items.append((m['crumb'].capitalize(), url(lang, f"{m['crumb']}/index.html")))
    if m['schema'] == 'doc':
        items.append((m[f'title_{lang}'].split(' | ')[0], url(lang, m['out'])))
    return {'@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i + 1, 'name': n, 'item': u} for i, (n, u) in enumerate(items)]}


def schema(lang, m):
    kind = m.get('schema')
    if not kind:
        return ''
    desc = m['desc'] if lang == 'en' else m['desc_pl']
    play = PLAY[lang].replace('&amp;', '&')
    graph = []
    if kind == 'home':
        graph += [ORG, {'@type': 'WebSite', '@id': f'{SITE}/#website', 'url': f'{SITE}/',
                        'name': 'minimalistic.solutions', 'inLanguage': ['en', 'pl'], 'publisher': {'@id': ORG['@id']}}]
    elif kind == 'outlier':
        shots = ['outlier', 'samurai', 'nexus', 'construct', 'outrun', 'eclipse', 'event']
        graph += [{'@type': 'MobileApplication', 'name': 'Outlier: RPG Fitness Tracker', 'url': url(lang, m['out']),
                   'operatingSystem': 'Android', 'applicationCategory': 'HealthApplication',
                   'description': desc, 'inLanguage': lang, 'installUrl': play, 'downloadUrl': play,
                   'image': f'{SITE}/assets/img/outlier/icon.webp',
                   'screenshot': [f'{SITE}/assets/img/outlier/theme-{s}.webp' for s in shots],
                   'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'USD'},
                   'publisher': ORG}, crumbs(lang, m)]
    elif kind == 'killswitch':
        graph += [{'@type': 'MobileApplication', 'name': 'Killswitch', 'url': url(lang, m['out']),
                   'operatingSystem': 'Android', 'applicationCategory': 'UtilitiesApplication',
                   'description': desc, 'inLanguage': lang, 'publisher': ORG}, crumbs(lang, m)]
    elif kind == 'doc':
        graph += [{'@type': 'WebPage', 'name': m[f'title_{lang}'].split(' | ')[0], 'url': url(lang, m['out']),
                   'description': desc, 'inLanguage': lang, 'publisher': ORG}, crumbs(lang, m)]
    data = json.dumps({'@context': 'https://schema.org', '@graph': graph}, ensure_ascii=False)
    return f'<script type="application/ld+json">{data}</script>'


# ----------------------------------------------------------------------------
# Shared chrome
# ----------------------------------------------------------------------------
def head(lang, m, A):
    title = m[f'title_{lang}']
    desc = m['desc'] if lang == 'en' else m.get('desc_pl', m['desc'])
    fav = m.get('favicon', 'favicon.svg')
    fav_type = 'image/svg+xml' if fav.endswith('.svg') else 'image/png'
    other = 'pl' if lang == 'en' else 'en'
    if m.get('noindex'):
        seo = '<meta name="robots" content="noindex">'
        alt = ''
    else:
        seo = (f'<link rel="canonical" href="{url(lang, m["out"])}">\n'
               f'<link rel="alternate" hreflang="en" href="{url("en", m["out"])}">\n'
               f'<link rel="alternate" hreflang="pl" href="{url("pl", m["out"])}">\n'
               f'<link rel="alternate" hreflang="x-default" href="{url("en", m["out"])}">\n'
               f'<meta property="og:url" content="{url(lang, m["out"])}">')
        alt = abspath(other, m['out'])
    return f'''<!DOCTYPE html>
<html lang="{lang}" data-lang="{lang}" data-alt="{alt}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{desc}">
{seo}
<meta name="theme-color" content="#0a0a0b">
<meta name="color-scheme" content="dark">
<meta property="og:type" content="website">
<meta property="og:site_name" content="minimalistic.solutions">
<meta property="og:locale" content="{'en_US' if lang == 'en' else 'pl_PL'}">
<meta property="og:locale:alternate" content="{'pl_PL' if lang == 'en' else 'en_US'}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="{SITE}/assets/img/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="minimalistic.solutions">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}">
<meta name="twitter:image" content="{SITE}/assets/img/og.png">
<link rel="icon" href="{A}favicon.ico" sizes="48x48">
<link rel="icon" href="{A}assets/img/{fav}" type="{fav_type}">
<link rel="apple-touch-icon" href="{A}apple-touch-icon.png">
<link rel="manifest" href="{A}site.webmanifest">
<link rel="preload" href="{A}assets/fonts/Archivo-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="{A}assets/fonts/JetBrainsMono-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="{A}assets/css/fonts.css">
<link rel="stylesheet" href="{A}assets/css/site.css">
<script>(function(){{var d=document.documentElement,l;d.classList.add('js');try{{l=localStorage.getItem('ms-lang')}}catch(e){{}}if(l&&l!==d.lang&&d.dataset.alt){{location.replace(d.dataset.alt+location.hash)}}}})();</script>
{schema(lang, m)}
</head>
<body class="{m.get('theme', '')}">
<a class="skip" href="#main">{L('Skip to content', 'Przejdź do treści')}</a>
<div class="crt" aria-hidden="true"></div>
'''


def lang_switch(lang, m):
    if m.get('noindex'):
        en, pl = '/', '/pl/'
    else:
        en, pl = abspath('en', m['out']), abspath('pl', m['out'])
    cur = lambda l: ' aria-current="true"' if l == lang else ''
    return (f'<nav class="lang" aria-label="Language / Język">'
            f'<a href="{en}" hreflang="en" data-set-lang="en"{cur("en")}>EN</a>'
            f'<a href="{pl}" hreflang="pl" data-set-lang="pl"{cur("pl")}>PL</a></nav>')


def topbar(lang, m, P):
    crumb = ''
    if m.get('crumb'):
        crumb = f'<span class="dim">/</span><span class="crumb">{m["crumb"]}</span>'
    active = m.get('active', '')

    def cur(k):
        return ' aria-current="page"' if k == active else ''

    links = [
        ('apps', f'{P}#apps', L('Apps', 'Aplikacje')),
        ('outlier', f'{P}outlier/', 'Outlier'),
        ('killswitch', f'{P}killswitch/', 'Killswitch'),
        ('contact', f'{P}#contact', L('Contact', 'Kontakt')),
    ]
    nav = ''.join(f'<li><a href="{h}"{cur(k)}>{t}</a></li>' for k, h, t in links)
    sheet = ''.join(f'<li><a href="{h}">{t}<small>{"&#8599;" if k in ("outlier", "killswitch") else "&#8600;"}</small></a></li>' for k, h, t in links)
    sw = lang_switch(lang, m)
    login = (f'<a class="btn btn--ghost" href="{LOGIN}" rel="nofollow">'
             f'<span class="t">{L("Login", "Zaloguj")}</span><span class="g" aria-hidden="true"><i>&#8599;</i></span></a>')
    return f'''<header class="topbar">
  <div class="wrap">
    <a class="brand" href="{P}" aria-label="minimalistic.solutions">
      <span class="brand-mark" aria-hidden="true"></span>
      <span><span class="full">minimalistic<span class="dim">.solutions</span></span><span class="short">m<span class="dim">.s</span></span>{crumb}</span>
    </a>
    <nav class="nav-wrap" aria-label="{'Main' if lang == 'en' else 'Główna'}"><ul class="nav">{nav}</ul></nav>
    <div class="bar-right">
      {sw}
      <div class="team">
        <span class="team-q">{L('Part of the team?', 'Jesteś w zespole?')}</span>
        {login}
      </div>
      <button class="menu-btn" type="button" aria-expanded="false" aria-controls="sheet" aria-label="{'Open menu' if lang == 'en' else 'Otwórz menu'}"><span></span><span></span><span></span></button>
    </div>
  </div>
</header>
<div class="sheet" id="sheet">
  <ul>{sheet}</ul>
  <div class="sheet-foot">
    <span class="mono-label">{L('Language', 'Język')}</span>
    {sw}
    <span class="mono-label">{L('Part of the team?', 'Jesteś w zespole?')}</span>
    <div>{login}</div>
  </div>
</div>
'''


def footer(lang, m, P, A):
    return f'''<footer class="footer">
  <div class="wrap">
    <div class="foot-grid">
      <div class="foot-brand">
        <a class="brand" href="{P}"><span class="brand-mark" aria-hidden="true"></span><span>minimalistic<span class="dim">.solutions</span></span></a>
        <p>{L('Independent Android studio. Focused apps, no ads, privacy policies written for humans.',
              'Niezależne studio aplikacji na Androida. Skupione aplikacje, zero reklam, polityki prywatności pisane dla ludzi.')}</p>
      </div>
      <div>
        <h2 class="foot-h">{L('Apps', 'Aplikacje')}</h2>
        <ul>
          <li><a href="{P}outlier/">Outlier</a></li>
          <li><a href="{P}killswitch/">Killswitch</a></li>
          <li><a href="{PLAY[lang]}" rel="noopener">{L('Outlier on Google Play', 'Outlier w Google Play')} &#8599;</a></li>
        </ul>
      </div>
      <div>
        <h2 class="foot-h">{L('Legal', 'Dokumenty')}</h2>
        <ul>
          <li><a href="{P}outlier/privacy-policy/">{L('Outlier privacy', 'Outlier: prywatność')}</a></li>
          <li><a href="{P}outlier/delete-account/">{L('Outlier account deletion', 'Outlier: usunięcie konta')}</a></li>
          <li><a href="{P}killswitch/privacy-policy/">{L('Killswitch privacy', 'Killswitch: prywatność')}</a></li>
        </ul>
      </div>
      <div>
        <h2 class="foot-h">Studio</h2>
        <ul>
          <li><a href="mailto:{MAIL}">{MAIL}</a></li>
          <li><a href="{LOGIN}" rel="nofollow">{L('Team login', 'Logowanie zespołu')} &#8599;</a></li>
        </ul>
      </div>
    </div>
    <div class="foot-word" aria-hidden="true">Minimalistic</div>
    <div class="foot-base">
      <span>&copy; <span data-year>{datetime.date.today().year}</span> minimalistic.solutions</span>
      <span>{L('No ads. No tracking.', 'Bez reklam. Bez śledzenia.')}</span>
    </div>
  </div>
</footer>
<script src="{A}assets/js/site.js" defer></script>
</body>
</html>
'''


def add_toc(body):
    def one(m):
        art, lang = m.group(0), m.group(1)
        items = re.findall(r'<section id="([^"]+)">\s*<h2>(.*?)</h2>', art, re.S)
        lis = ''.join(f'<li><a href="#{i}">{re.sub("<[^>]+>", "", t)}</a></li>' for i, t in items)
        label = 'Contents' if lang == 'en' else 'Spis treści'
        toc = (f'<nav class="toc" aria-label="{label}"><p class="mono-label" style="margin-bottom:14px">{label}</p>'
               f'<ol>{lis}</ol><!--BACK--></nav>')
        return art.replace('<!--TOC-->', toc)
    return re.sub(r'<div class="doc wrap" lang="(en|pl)">(.*?)</div><!--/doc-->', one, body, flags=re.S)


def keep_lang(html, lang):
    """Remove every element written for the other language, unwrap plain spans."""
    other = 'pl' if lang == 'en' else 'en'
    soup = BeautifulSoup(html, 'html.parser')
    for el in soup.find_all(attrs={'lang': other}):
        if el.name != 'html':
            el.decompose()
    for el in soup.find_all('span', attrs={'lang': lang}):
        if list(el.attrs) == ['lang']:
            el.unwrap()
    return str(soup)


def build():
    sitemap = []
    for f in sorted(PAGES.glob('*.html')):
        raw = f.read_text(encoding='utf-8')
        mm = re.match(r'\s*<!--(\{.*?\})-->\s*', raw, re.S)
        m = json.loads(mm.group(1))
        src = add_toc(raw[mm.end():])
        for lang in ([m['only']] if m.get('only') else LANGS):
            depth = m.get('depth', 0) + (1 if lang == 'pl' else 0)
            if m.get('absolute'):
                A = P = '/'
            else:
                A = '../' * depth
                P = A + ('pl/' if lang == 'pl' else '')
            body = src
            if m.get('back'):
                nm = m['back_name']
                body = body.replace('<!--BACK-->', f'<a class="back tlink" href="{m["back"]}">&lt; {L("Back to " + nm, "Wróć do: " + nm)}</a>')
            body = (body.replace('{{A}}', A).replace('{{P}}', P).replace('{{LOGIN}}', LOGIN)
                        .replace('{{MAIL}}', MAIL).replace('{{PLAY}}', PLAY[lang]))
            html = head(lang, m, A) + topbar(lang, m, P) + '<main id="main">\n' + body + '\n</main>\n' + footer(lang, m, P, A)
            html = keep_lang(html, lang)
            out = ROOT / (('pl/' if lang == 'pl' and not m.get('only') else '') + m['out'])
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(html, encoding='utf-8')
            print('built', out.relative_to(ROOT))
        if not m.get('noindex'):
            sitemap.append(m['out'])

    rows = []
    for out in sitemap:
        for lang in LANGS:
            alts = ''.join(f'\n    <xhtml:link rel="alternate" hreflang="{l}" href="{url(l, out)}"/>' for l in LANGS)
            alts += f'\n    <xhtml:link rel="alternate" hreflang="x-default" href="{url("en", out)}"/>'
            rows.append(f'  <url>\n    <loc>{url(lang, out)}</loc>\n    <lastmod>{TODAY}</lastmod>{alts}\n  </url>')
    (ROOT / 'sitemap.xml').write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
        + '\n'.join(rows) + '\n</urlset>\n', encoding='utf-8')
    print('sitemap.xml:', len(rows), 'urls')


if __name__ == '__main__':
    build()
