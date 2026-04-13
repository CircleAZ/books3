import urllib.request, json, sys
data = json.dumps({'username': 'admin', 'password': 'foo'}).encode('utf-8')
headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Origin': 'https://books.circleaz.in',
    'Referer': 'https://books.circleaz.in/login'
}
req = urllib.request.Request('https://api.circleaz.in/api/account/login/', data=data, headers=headers, method='POST')
try:
    print(urllib.request.urlopen(req).read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print(f'HTTP {e.code}')
    print(e.read().decode('utf-8'))
