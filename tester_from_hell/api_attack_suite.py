"""
api_attack_suite.py - API Security Testing Suite for AZ Books
Tests for SQL injection, XSS, auth bypass, rate limiting, and more.

Usage: python api_attack_suite.py --target http://localhost:8000
"""
import argparse, json, requests, time, sys
from concurrent.futures import ThreadPoolExecutor

class APIAttacker:
    def __init__(self, base_url, token=None):
        self.base_url = base_url.rstrip('/')
        self.token = token
        self.results = []
        
    def headers(self):
        h = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h
    
    def test(self, name, func):
        print(f"  🔄 {name}...", end="", flush=True)
        try:
            passed, detail = func()
            status = "✅ SAFE" if passed else "⚠️ VULNERABLE"
            print(f" {status} - {detail}")
            self.results.append({"test": name, "safe": passed, "detail": detail})
        except Exception as e:
            print(f" ❌ ERROR: {e}")
            self.results.append({"test": name, "error": str(e)})
    
    # ============ SQL INJECTION TESTS ============
    def test_sql_injection_search(self):
        payloads = ["' OR '1'='1", "'; DROP TABLE users;--", "1 UNION SELECT * FROM auth_user"]
        for p in payloads:
            r = requests.get(f"{self.base_url}/api/products/?search={p}", headers=self.headers())
            if "error" in r.text.lower() or "syntax" in r.text.lower():
                return False, f"SQL error exposed with: {p}"
        return True, "No SQL errors exposed"
    
    # ============ XSS TESTS ============
    def test_xss_storage(self):
        payload = "<script>alert('XSS')</script>"
        r = requests.post(f"{self.base_url}/api/products/", 
                         json={"name": payload, "price": 100}, headers=self.headers())
        if payload in r.text:
            return False, "XSS payload stored without sanitization"
        return True, "XSS payloads sanitized"
    
    # ============ AUTH TESTS ============
    def test_no_auth_access(self):
        endpoints = ["/api/products/", "/api/customers/", "/api/orders/"]
        for ep in endpoints:
            r = requests.get(f"{self.base_url}{ep}")
            if r.status_code == 200:
                return False, f"{ep} accessible without auth"
        return True, "Protected endpoints require auth"
    
    def test_token_manipulation(self):
        if not self.token:
            return True, "No token to test"
        # Try modified token
        bad_token = self.token[:-5] + "XXXXX"
        r = requests.get(f"{self.base_url}/api/products/", 
                        headers={"Authorization": f"Bearer {bad_token}"})
        if r.status_code == 200:
            return False, "Modified token accepted"
        return True, "Invalid tokens rejected"
    
    # ============ RATE LIMITING ============
    def test_rate_limiting(self):
        count = 0
        for _ in range(50):
            r = requests.get(f"{self.base_url}/api/products/", headers=self.headers())
            if r.status_code == 429:
                return True, f"Rate limited after {count} requests"
            count += 1
        return False, "No rate limiting detected after 50 requests"
    
    # ============ IDOR ============
    def test_idor(self):
        # Try accessing sequential IDs
        for i in range(1, 10):
            r = requests.get(f"{self.base_url}/api/orders/{i}/", headers=self.headers())
            if r.status_code == 200:
                data = r.json() if r.text else {}
                if data.get("customer_id"):  # Can see other users' orders
                    return False, f"Order {i} accessible - check authorization"
        return True, "IDOR test passed"
    
    # ============ MASS ASSIGNMENT ============
    def test_mass_assignment(self):
        r = requests.patch(f"{self.base_url}/api/users/me/",
                          json={"is_admin": True, "is_staff": True},
                          headers=self.headers())
        if r.status_code == 200:
            data = r.json() if r.text else {}
            if data.get("is_admin") or data.get("is_staff"):
                return False, "Admin privileges assigned via mass assignment"
        return True, "Protected fields cannot be mass-assigned"
    
    # ============ CONCURRENCY ============
    def test_race_condition(self):
        def make_request():
            return requests.post(f"{self.base_url}/api/orders/",
                               json={"product_id": "test", "quantity": 1},
                               headers=self.headers())
        
        with ThreadPoolExecutor(max_workers=10) as executor:
            results = list(executor.map(lambda _: make_request(), range(10)))
        
        success_count = sum(1 for r in results if r.status_code in [200, 201])
        return True, f"{success_count}/10 concurrent requests succeeded"
    
    def run_all(self):
        print("\n🔥 TESTER FROM HELL - API Attack Suite 🔥\n")
        
        tests = [
            ("SQL Injection - Search", self.test_sql_injection_search),
            ("XSS Storage", self.test_xss_storage),
            ("No Auth Access", self.test_no_auth_access),
            ("Token Manipulation", self.test_token_manipulation),
            ("Rate Limiting", self.test_rate_limiting),
            ("IDOR", self.test_idor),
            ("Mass Assignment", self.test_mass_assignment),
            ("Race Condition", self.test_race_condition),
        ]
        
        for name, func in tests:
            self.test(name, func)
        
        print("\n" + "="*50)
        safe = sum(1 for r in self.results if r.get("safe", False))
        print(f"Results: {safe}/{len(self.results)} tests passed")
        
        with open("api_attack_results.json", "w") as f:
            json.dump(self.results, f, indent=2)
        print("Results saved to api_attack_results.json")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", default="http://localhost:8000")
    parser.add_argument("--token", help="JWT token for authenticated tests")
    args = parser.parse_args()
    
    APIAttacker(args.target, args.token).run_all()

if __name__ == "__main__":
    main()
