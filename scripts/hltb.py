"""One bounded batch over stdin/stdout; no HTTP server or account credentials."""
import json
import math
import sys
from urllib.parse import urlparse


def parse_detail(html, app_id, hltb_id):
    from bs4 import BeautifulSoup
    script = BeautifulSoup(html, 'html.parser').find('script', id='__NEXT_DATA__')
    if not script:
        raise ValueError('HLTB page format changed')
    rows = json.loads(script.string)['props']['pageProps']['game']['data']['game']
    if len(rows) != 1:
        raise ValueError('Ambiguous HLTB page')
    row = rows[0]
    if row.get('game_id') != hltb_id or row.get('game_type') != 'game':
        return None
    # Exact Steam mapping, including an explicit alternate edition; never name similarity alone.
    if app_id not in (row.get('profile_steam'), row.get('profile_steam_alt')):
        return None
    def hours(field):
        seconds, count = row.get(field), row.get(field + '_count')
        if not isinstance(seconds, (int,float)) or isinstance(seconds,bool) or not math.isfinite(seconds) or seconds <= 0:
            return None
        if not isinstance(count, (int,float)) or isinstance(count,bool) or not math.isfinite(count) or count <= 0:
            return None
        return round(seconds / 3600, 2) or None
    return {'id': hltb_id, 'mainHours': hours('comp_main'), 'extraHours': hours('comp_plus'), 'completionHours': hours('comp_100')}


def main():
    import requests
    from howlongtobeatpy import HowLongToBeat
    from howlongtobeatpy.HTMLRequests import HTMLRequests
    from fake_useragent import UserAgent
    payload = json.loads(sys.stdin.read(16001))
    if not isinstance(payload,list) or len(payload) > 8:
        raise ValueError('Invalid batch')
    for g in payload:
        if type(g.get('appId')) is not int or g['appId'] <= 0 or not isinstance(g.get('name'),str) or not 0 < len(g['name']) <= 300:
            raise ValueError('Invalid game')
    # Reuse public HTML and script responses within a batch; session init is never cached.
    original_send = requests.Session.send
    pages = {}
    request_count = 0
    def bounded_send(session, request, **kwargs):
        nonlocal request_count
        url = urlparse(request.url)
        if url.scheme != 'https' or url.hostname != 'howlongtobeat.com':
            raise ValueError('Unexpected HLTB destination')
        cached = request.method == 'GET' and not url.path.startswith('/api/')
        if cached and request.url in pages:
            return pages[request.url]
        request_count += 1
        if request_count > 90:
            raise ValueError('HLTB request limit')
        kwargs['timeout'] = 10
        response = original_send(session,request,**kwargs)
        # Stop the batch on access denial, rate limiting or outages; do not attempt fallbacks around them.
        response.raise_for_status()
        if len(response.content) > 5_000_000:
            raise ValueError('HLTB response too large')
        if cached:
            pages[request.url] = response
        return response
    requests.Session.send = bounded_send
    service = HowLongToBeat(input_minimum_similarity=0)
    results = []
    for game in payload:
        rows = service.search(game['name'])
        if rows is None:
            raise ValueError('HLTB search unavailable')
        matches = []
        # ponytail: three likely editions per query; unmatched games retain IGDB rather than guessing.
        for candidate in sorted(rows,key=lambda r:r.similarity,reverse=True)[:3]:
            ident = candidate.game_id
            if type(ident) is not int or ident <= 0:
                raise ValueError('Invalid HLTB identifier')
            response = requests.get('https://howlongtobeat.com/game/' + str(ident),
                headers=HTMLRequests.get_title_request_headers(UserAgent().random), timeout=10)
            match = parse_detail(response.text,game['appId'],ident)
            if match:
                matches.append(match)
        results.append({'appId':game['appId'], 'data':matches[0] if len(matches)==1 else None})
    print(json.dumps(results,allow_nan=False))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Never return upstream HTML, headers, tokens or tracebacks to Node/the browser.
        print(json.dumps({'error':'HowLongToBeat no está disponible o ha cambiado su formato.'}))
        sys.exit(1)
