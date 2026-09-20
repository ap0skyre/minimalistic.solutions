# minimalistic.solutions

Statyczna strona studia (GitHub Pages + Cloudflare). Bez frameworka i bez kroku budowania na serwerze.

## Struktura

```
index.html                         strona główna studia
outlier/                           strona Outliera
outlier/privacy-policy/            polityka prywatności Outliera (EN + PL)
outlier/delete-account/            usuwanie konta Outliera (EN + PL)
killswitch/                        strona Killswitcha (z działającym demo)
killswitch/privacy-policy/         polityka prywatności Killswitcha (EN + PL)
404.html
assets/css  assets/js  assets/fonts (fonty lokalnie, bez Google Fonts = RODO ok)
assets/img
_build/                            źródła stron + build.py (Jekyll pomija foldery z "_")
CNAME                              minimalistic.solutions
```

## Języki i SEO

Każda strona ma dwa adresy: angielski (`/outlier/`) i polski (`/pl/outlier/`), z `hreflang`,
`canonical`, danymi strukturalnymi (JSON-LD) i `sitemap.xml` generowanym automatycznie.
Wybór języka z przełącznika zapamiętuje się w przeglądarce.

Po wdrożeniu dodaj domenę w Google Search Console i zgłoś `https://minimalistic.solutions/sitemap.xml`.

## Edycja treści

Nie edytuj wygenerowanych `index.html` ręcznie. Treść jest w `_build/pages/*.html`,
a wspólny nagłówek, top bar i stopka w `_build/build.py`. Po zmianie uruchom:

```
pip install beautifulsoup4     # tylko raz
python _build/build.py
```

Języki: każdy tekst występuje dwa razy, `<span lang="en">…</span><span lang="pl">…</span>`.
Każdy język jest budowany jako osobna strona (/ i /pl/), z czystym HTML w jednym języku.

## Deploy na GitHub Pages

1. Utwórz repo (np. `minimalistic.solutions`) i wrzuć zawartość tego folderu do gałęzi `main`.
2. Settings → Pages → Source: *Deploy from a branch*, `main` / `/ (root)`.
3. Custom domain: `minimalistic.solutions` (plik `CNAME` już jest). Po wystawieniu certyfikatu zaznacz *Enforce HTTPS*.

## DNS w Cloudflare (na start wszystko jako „DNS only”, szara chmurka)

| Typ   | Nazwa | Wartość                |
|-------|-------|------------------------|
| A     | @     | 185.199.108.153        |
| A     | @     | 185.199.109.153        |
| A     | @     | 185.199.110.153        |
| A     | @     | 185.199.111.153        |
| AAAA  | @     | 2606:50c0:8000::153    |
| AAAA  | @     | 2606:50c0:8001::153    |
| AAAA  | @     | 2606:50c0:8002::153    |
| AAAA  | @     | 2606:50c0:8003::153    |
| CNAME | www   | TWOJLOGIN.github.io    |

Proxy (pomarańczową chmurkę) włączaj dopiero, gdy HTTPS na GitHubie działa. Tryb SSL w Cloudflare ustaw na **Full**, nigdy Flexible.

## Login zespołu (Raspberry Pi)

Przycisk „Login” w prawym górnym rogu prowadzi do `https://app.minimalistic.solutions/`.
Ta subdomena będzie wystawiona z Raspberry Pi przez **Cloudflare Tunnel** (`cloudflared`), bez otwierania portów w routerze.
Adres zmieniasz w jednym miejscu: `LOGIN` w `_build/build.py`.

## Po wdrożeniu: Play Console

Zaktualizuj w Play Console adresy, które dziś wskazują na `ap0skyre.github.io`:

- Outlier, polityka prywatności: `https://minimalistic.solutions/outlier/privacy-policy/`
- Outlier, usuwanie konta: `https://minimalistic.solutions/outlier/delete-account/`
- Killswitch, polityka prywatności: `https://minimalistic.solutions/killswitch/privacy-policy/`

Stare strony na `ap0skyre.github.io` zostaw włączone, dopóki Play Console nie zaakceptuje nowych adresów.
