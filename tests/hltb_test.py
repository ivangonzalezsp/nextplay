"""Offline checks for the HTML boundary and subprocess batch validation."""
import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('hltb', Path(__file__).resolve().parents[1] / 'scripts' / 'hltb.py')
hltb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hltb)

assert hltb.search_queries('METAL GEAR SOLID: Peace Walker - Master Collection Version') == [
    'METAL GEAR SOLID: Peace Walker - Master Collection Version',
    'METAL GEAR SOLID: Peace Walker',
]
assert hltb.search_queries('A - B - C - D') == ['A - B - C - D', 'A']

row = {'game_id':7230,'game_type':'game','profile_steam':400,'profile_steam_alt':2012840,
       'comp_main':11230,'comp_main_count':8049,'comp_plus':0,'comp_plus_count':0,
       'comp_100':37886,'comp_100_count':1137}
def page(value):
    return '<script id="__NEXT_DATA__" type="application/json">'+json.dumps({'props':{'pageProps':{'game':{'data':{'game':[value]}}}}})+'</script>'

assert hltb.parse_detail(page(row),400,7230) == {'id':7230,'mainHours':3.12,'extraHours':None,'completionHours':10.52}
assert hltb.parse_detail(page(row),2012840,7230) is not None
assert hltb.parse_detail(page(row),620,7230) is None  # Same title never substitutes for a Steam ID.
assert hltb.parse_detail(page(row),400,9999) is None
assert hltb.parse_detail(page({**row,'game_type':'dlc'}),400,7230) is None
assert hltb.parse_detail(page({**row,'comp_main_count':0}),400,7230)['mainHours'] is None
assert hltb.parse_detail(page({**row,'comp_main':True}),400,7230)['mainHours'] is None
try:
    hltb.parse_detail('<html>Access denied</html>',400,7230)
    raise AssertionError('Unknown format must fail')
except ValueError:
    pass

import requests
from howlongtobeatpy.HowLongToBeat import HowLongToBeat

original_send = requests.Session.send
try:
    queries = []
    response = requests.Response()
    response.status_code = 200
    response._content = page(row).encode()
    response.encoding = 'utf-8'

    def search(self, query, *args, **kwargs):
        queries.append(query)
        return [] if len(queries) == 1 else [SimpleNamespace(game_id=7230, similarity=1)]

    def send(session, request, **kwargs):
        return response

    with patch('sys.stdin', io.StringIO('[{"appId":400,"name":"METAL GEAR SOLID: Peace Walker - Master Collection Version"}]')), patch('sys.stdout', io.StringIO()) as output, patch.object(HowLongToBeat, 'search', search), patch('fake_useragent.UserAgent', lambda: SimpleNamespace(random='test')), patch.object(requests.Session, 'send', send):
        hltb.main()
        assert queries == [
            'METAL GEAR SOLID: Peace Walker - Master Collection Version',
            'METAL GEAR SOLID: Peace Walker',
        ]
        assert json.loads(output.getvalue()) == [{'appId': 400, 'data': {'id': 7230, 'mainHours': 3.12, 'extraHours': None, 'completionHours': 10.52}}]

    requests.Session.send = original_send
    # The first denied request must stop the library, not retry or produce an empty match.
    response=requests.Response()
    response.status_code=403
    with patch('sys.stdin',io.StringIO('[{"appId":400,"name":"Portal"}]')), patch.object(requests.Session,'send',return_value=response) as send:
        try:
            hltb.main()
            raise AssertionError('Access denial must fail')
        except requests.HTTPError:
            assert send.call_count == 1
finally:
    requests.Session.send=original_send
print('HLTB: exact Steam IDs, unknown durations, format changes and access denial verified.')
