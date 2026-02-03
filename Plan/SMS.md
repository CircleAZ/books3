# Self-Hosted Android SMS Gateway (Production Specification)

**Status**: Final Technical Specification
**Goal**: Zero-cost, reliable SMS delivery using personal SIMs and Android devices.

---

## 1. Architecture Overview

*   **Gateway Nodes**: Android phones running Termux + Python Flask + Cloudflare Tunnel.
*   **Backend**: Django Application with a `MessageQueue` system.
*   **Communication**: Backend pushes requests to Cloudflare URLs; Phones execute SMS via Android API.
*   **Security**: API Key authentication for all requests.
*   **Reliability**: Heartbeat monitoring and automatic failover.

---

## 2. Android Node Setup (The Gateway)

**Prerequisites**:
*   Install **Termux** and **Termux:API** (F-Droid).
*   Install **Cloudflared** (Linux ARM64).
*   Grant SMS Permissions to Termux:API.

### 2.1 The Secured Python Script (`sms_node.py`)
Run this on every Android device.

```python
from flask import Flask, request, jsonify
import subprocess
import os

app = Flask(__name__)

# SECURITY: This key must match the one in Django settings
API_KEY = "az-books-secret-gateway-key-change-this"

def check_auth():
    """Verify API Key header"""
    auth_header = request.headers.get('X-API-Key')
    if auth_header != API_KEY:
        return False
    return True

@app.route('/send', methods=['POST'])
def send_sms():
    if not check_auth():
        return jsonify({"error": "Unauthorized"}), 401

    data = request.json
    phone = data.get('phone')
    message = data.get('message')

    if not phone or not message:
        return jsonify({"error": "Missing data"}), 400

    try:
        # Execute Termux SMS Command
        subprocess.run(['termux-sms-send', '-n', phone, message], check=True)
        return jsonify({"status": "sent"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/heartbeat', methods=['GET'])
def heartbeat():
    """Used by Backend to check if phone is alive"""
    if not check_auth():
        return jsonify({"error": "Unauthorized"}), 401
    
    # Optional: Get Battery Status via termux-battery-status
    return jsonify({"status": "online", "device": "SIM_NODE_1"}), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
```

### 2.2 Exposing to Internet
Run Cloudflare Tunnel to get a public URL:
```bash
cloudflared tunnel --url http://localhost:8080
# Output: https://sim1-random-name.trycloudflare.com
```

---

## 3. Backend Implementation (Django)

### 3.1 Database Schema (`MessageQueue`)
Replace simple counters with a robust queue.

*   **Model**: `MessageQueue`
    *   `id`: UUID (Primary Key)
    *   `phone_number`: String
    *   `content`: Text
    *   `status`: Enum (`PENDING`, `PROCESSING`, `SENT`, `FAILED`)
    *   `gateway_used`: String (e.g., "SIM_1")
    *   `attempts`: Integer (Default 0)
    *   `error_log`: Text (Optional)
    *   `created_at`: DateTime

### 3.2 Dispatcher Logic (Cron/Celery)
*   **Frequency**: Every 1 minute (or triggered by event).
*   **Logic**:
    1.  Fetch `PENDING` messages (limit 10).
    2.  **Load Balancing**: Select a Gateway using Round-Robin (0-90 msgs -> SIM 1, 91-180 -> SIM 2).
    3.  **Heartbeat Check**: Before sending, ping `/heartbeat`. If 404/Timeout, mark Gateway as `OFFLINE` and pick next.
    4.  **Send**: POST to `https://simX.../send` with `X-API-Key`.
    5.  **Update**: Set status to `SENT` or `FAILED` (increment attempts).

---

## 4. Anti-Blocking Strategy (Spintax)

**Rule**: Never send the exact same text 100 times. Use templates to vary content.

### 4.1 Template Logic
The system should randomly select a template from the list below when generating a message.

### 4.2 English Templates
1.  "Hi {name}, your order #{id} is confirmed! View receipt: {link}"
2.  "Hello {name}, thanks for shopping with AZ Books. Order #{id} is received. Receipt: {link}"
3.  "Order Update: #{id} for {name} has been placed. Details: {link}"

### 4.3 Gujarati Templates (Regional Focus)
1.  "નમસ્તે {name}, તમારો ઓર્ડર #{id} કન્ફર્મ થઈ ગયો છે! રસીદ જુઓ: {link}"
    *   *(Namaste {name}, tamaro order #{id} confirm thai gayo che! Receipt juo: {link})*
2.  "હેલો {name}, AZ Books માંથી ઓર્ડર કરવા બદલ આભાર. ઓર્ડર #{id} ની રસીદ: {link}"
    *   *(Hello {name}, AZ Books mathi order karva badal aabhar. Order #{id} ni receipt: {link})*
3.  "{name}, તમારા ઓર્ડર #{id} ની નોંધણી થઈ ગઈ છે. વિગતો: {link}"
    *   *({name}, tamara order #{id} ni nondhani thai gai che. Vigato: {link})*

---

## 5. Public Receipt View (New Requirement)
To keep SMS short and avoid file upload risks, we will send a **Public Link** instead of the full text/PDF.

*   **URL Structure**: `https://app.azbooks.in/r/{uuid}`
*   **Access**: Public (No login required).
*   **Content**:
    *   Store Logo & Header.
    *   Customer Name (Masked, e.g., "Jai***").
    *   Item List (Qty, Price).
    *   Totals, Taxes, Discounts.
    *   **"Download PDF" Button**.

---

## 6. Summary of Limits
*   **Daily Limit per SIM**: 90 SMS (Strict safety margin below 100).
*   **Delay**: Random 10-30s delay between messages in the dispatcher loop.
*   **Total Capacity (4 SIMs)**: 360 SMS / Day.