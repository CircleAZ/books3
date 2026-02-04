# 🔥 TESTER FROM HELL - AZ Books Destruction Manual 🔥

> *"If it can be broken, I will find a way. If it can't be broken, I haven't tried hard enough yet."*

## Mission Statement

This test plan is designed by a **malicious tester mindset** - someone who actively tries to:
- 💀 Crash the application
- 🔓 Exploit security vulnerabilities  
- 🧨 Corrupt data integrity
- ⚡ Cause race conditions
- 📱 Break offline/PWA functionality
- 🎭 Abuse edge cases developers never imagined
- 💸 Manipulate financial calculations

## Test Categories

| Category | File | Danger Level |
|----------|------|--------------|
| Authentication & Authorization | [auth_hell.md](./auth_hell.md) | 🔴 CRITICAL |
| Input Validation Attacks | [input_hell.md](./input_hell.md) | 🔴 CRITICAL |
| Inventory Mayhem | [inventory_hell.md](./inventory_hell.md) | 🟠 HIGH |
| Order/POS Destruction | [orders_hell.md](./orders_hell.md) | 🔴 CRITICAL |
| Financial Exploits | [finance_hell.md](./finance_hell.md) | 🔴 CRITICAL |
| Customer Data Abuse | [customers_hell.md](./customers_hell.md) | 🟠 HIGH |
| Offline/PWA Chaos | [pwa_hell.md](./pwa_hell.md) | 🟠 HIGH |
| API Abuse | [api_hell.md](./api_hell.md) | 🔴 CRITICAL |
| Browser Testing Scenarios | [browser_tests.md](./browser_tests.md) | 🟠 HIGH |
| Concurrency Nightmares | [concurrency_hell.md](./concurrency_hell.md) | 🔴 CRITICAL |

## Quick Start

```bash
# Run browser tests (requires Chrome/Edge)
cd tester_from_hell
python run_browser_tests.py

# Run API attack suite
python api_attack_suite.py
```

## Philosophy

1. **Think like an attacker** - What would a malicious user do?
2. **Exploit trust assumptions** - Where does the system assume good faith?
3. **Race the system** - When two things happen simultaneously, what breaks?
4. **Boundary violations** - What happens at MAX_INT, MIN_INT, empty, null?
5. **State corruption** - Can I get the system into an impossible state?
6. **Timing attacks** - What if I'm faster/slower than expected?

---

*Remember: The goal isn't to pass tests. It's to BREAK things.*
