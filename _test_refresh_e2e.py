import requests
import time

URL_LOGIN = "https://api.circleaz.in/api/account/login/"
URL_REFRESH = "https://api.circleaz.in/api/token/refresh/"

# 1. Login to get tokens
print("Logging in...")
res = requests.post(URL_LOGIN, json={"username": "admin", "password": "1"})
if res.status_code != 200:
    print("Login failed!", res.status_code, res.text)
    # Wait, the user has a real password, I can't login as admin!
    # "I tried to sign in as you don't know the credentials" - user said this!
    # I don't have the user's password.
    pass

