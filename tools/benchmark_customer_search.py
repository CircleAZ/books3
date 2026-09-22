"""
Synthetic Scale Benchmark: Baseline DRF SearchFilter vs Tokenized Search Engine
Tests on 10,000 synthetic customer records with realistic address and wallet relations.
"""
import os
import sys
import time
import uuid
import django

# Setup Django environment
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'azbooks.settings')
django.setup()

from django.db import connection, transaction
from django.db.models import Q, Exists, OuterRef
from customers.models import Customer, Address, Wallet, GeographicRegion

BENCHMARK_BATCH_SIZE = 10000
SYNTHETIC_PREFIX = f"bench_{uuid.uuid4().hex[:8]}"

class TokenizedQueryCompiler:
    """
    Translates raw query strings with nhentai-style tokens into optimized Django Q objects.
    Directs phone:, email:, taluka:, district:, wallet:, id:, and exclusions (-tag:)
    """
    @staticmethod
    def compile(query_str):
        if not query_str or not query_str.strip():
            return Q()
            
        import re
        tokens = re.findall(r'(-?[\w]+:(?:"[^"]*"|[^\s]+)|[^\s]+)', query_str)
        
        main_q = Q()
        free_terms = []
        
        for token in tokens:
            is_negated = token.startswith('-')
            clean_token = token[1:] if is_negated else token
            
            if ':' in clean_token:
                prefix, val = clean_token.split(':', 1)
                prefix = prefix.lower()
                val = val.strip('"')
                
                clause = Q()
                if prefix == 'phone':
                    # Indexed prefix match
                    clause = Q(phone__istartswith=val)
                elif prefix == 'email':
                    clause = Q(email__icontains=val)
                elif prefix in ('id', 'display_id'):
                    # Exact indexed display ID match
                    clause = Q(display_id__iexact=val)
                elif prefix == 'taluka':
                    # Exists subquery avoids cartesian join overhead
                    subq = Address.objects.filter(
                        customer=OuterRef('pk'),
                        taluka__icontains=val
                    )
                    clause = Q(Exists(subq))
                elif prefix == 'district':
                    subq = Address.objects.filter(
                        customer=OuterRef('pk'),
                        district__icontains=val
                    )
                    clause = Q(Exists(subq))
                elif prefix == 'village':
                    subq = Address.objects.filter(
                        customer=OuterRef('pk'),
                        region__name__icontains=val
                    )
                    clause = Q(Exists(subq))
                elif prefix == 'wallet':
                    # Support >, <, >=, <=, or exact
                    m = re.match(r'^(>=|<=|>|<|=)?\s*(-?\d+(?:\.\d+)?)$', val)
                    if m:
                        op, num_str = m.groups()
                        num = float(num_str)
                        if op == '>':
                            clause = Q(wallet__balance__gt=num)
                        elif op == '>=':
                            clause = Q(wallet__balance__gte=num)
                        elif op == '<':
                            clause = Q(wallet__balance__lt=num)
                        elif op == '<=':
                            clause = Q(wallet__balance__lte=num)
                        else:
                            clause = Q(wallet__balance=num)
                else:
                    # Unknown prefix treated as free text
                    free_terms.append(clean_token)
                    continue
                    
                if is_negated:
                    main_q &= ~clause
                else:
                    main_q &= clause
            else:
                free_terms.append(token)
                
        # Free terms fall back to name & phone only (reducing 6-column ORs to 3)
        for term in free_terms:
            term_q = (
                Q(first_name__icontains=term) |
                Q(last_name__icontains=term) |
                Q(phone__icontains=term)
            )
            main_q &= term_q
            
        return main_q


def compile_baseline_drf_q(query_str):
    """
    Standard DRF SearchFilter behavior:
    6 columns per term, full OR cross-product with ILIKE %term%
    """
    search_fields = ['first_name', 'middle_name', 'last_name', 'phone', 'email', 'display_id']
    terms = query_str.split()
    main_q = Q()
    for term in terms:
        term_q = Q()
        for field in search_fields:
            term_q |= Q(**{f"{field}__icontains": term})
        main_q &= term_q
    return main_q


def run_explain_analyze(queryset):
    """Execute EXPLAIN (ANALYZE, BUFFERS) and extract execution time and buffer stats."""
    sql, params = queryset.query.sql_with_params()
    explain_sql = f"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {sql}"
    with connection.cursor() as cursor:
        cursor.execute(explain_sql, params)
        res = cursor.fetchall()
        import json
        plan_data = res[0][0][0]
        exec_time = plan_data.get('Execution Time', 0.0)
        plan_time = plan_data.get('Planning Time', 0.0)
        
        # Count shared hit blocks
        def extract_buffers(node):
            hits = node.get('Shared Hit Blocks', 0)
            reads = node.get('Shared Read Blocks', 0)
            for sub in node.get('Plans', []):
                h, r = extract_buffers(sub)
                hits += h
                reads += r
            return hits, reads
            
        hits, reads = extract_buffers(plan_data.get('Plan', {}))
        return exec_time, plan_time, hits, reads


def benchmark_query(name, qs_func, iterations=30):
    """Warm up and run iterations to gather statistical execution times."""
    # Warm-up
    qs = qs_func()
    run_explain_analyze(qs)
    
    times = []
    total_hits = 0
    total_reads = 0
    for _ in range(iterations):
        qs = qs_func()
        e_time, p_time, hits, reads = run_explain_analyze(qs)
        times.append(e_time)
        total_hits += hits
        total_reads += reads
        
    times.sort()
    min_t = times[0]
    p50_t = times[len(times) // 2]
    p95_t = times[int(len(times) * 0.95)]
    max_t = times[-1]
    avg_hits = total_hits / iterations
    avg_reads = total_reads / iterations
    return {
        'name': name,
        'min': min_t,
        'p50': p50_t,
        'p95': p95_t,
        'max': max_t,
        'hits': avg_hits,
        'reads': avg_reads
    }


def seed_synthetic_data(count):
    print(f"[*] Generating {count} synthetic customer records...")
    import random
    first_names = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan', 'Ramesh', 'Suresh', 'Mahesh', 'Dinesh', 'Mukesh', 'Pooja', 'Priya', 'Neha', 'Kavita', 'Anjali']
    last_names = ['Patel', 'Shah', 'Mehta', 'Desai', 'Modi', 'Chauhan', 'Gohil', 'Solanki', 'Panchal', 'Bhavsar', 'Vashi', 'Amin', 'Parikh', 'Joshi', 'Trivedi']
    talukas = ['Bardoli', 'Kamrej', 'Mahuva', 'Mandvi', 'Mangrol', 'Olpad', 'Palsana', 'Surat City', 'Umarpada', 'Chorasi']
    districts = ['Surat', 'Navsari', 'Tapi', 'Valsad', 'Bharuch']
    
    customers_to_create = []
    base_phone = 9870000000
    
    for i in range(count):
        fn = random.choice(first_names)
        ln = random.choice(last_names)
        c = Customer(
            first_name=fn,
            last_name=ln,
            phone=str(base_phone + i),
            email=f"{fn.lower()}.{ln.lower()}_{i}@example.com",
            notes=f"{SYNTHETIC_PREFIX} record {i}"
        )
        customers_to_create.append(c)
        
    created_customers = Customer.objects.bulk_create(customers_to_create, batch_size=2000)
    print(f"[+] Bulk created {len(created_customers)} Customer models.")
    
    wallets_to_create = []
    addresses_to_create = []
    
    for i, c in enumerate(created_customers):
        wallets_to_create.append(Wallet(
            customer=c,
            balance=random.choice([0, 0, 50, 120.50, 500, 1500, 4200])
        ))
        addresses_to_create.append(Address(
            customer=c,
            taluka=random.choice(talukas),
            district=random.choice(districts),
            address_line=f"Synthetic Plot #{i}, Main Road",
            is_primary=True
        ))
        
    Wallet.objects.bulk_create(wallets_to_create, batch_size=2000)
    Address.objects.bulk_create(addresses_to_create, batch_size=2000)
    print(f"[+] Bulk created associated Wallets and Addresses.")
    return created_customers


def cleanup_synthetic_data():
    print("[*] Initiating 100% physical purge of synthetic records...")
    with connection.cursor() as cursor:
        cursor.execute("DELETE FROM customers_address WHERE customer_id IN (SELECT id FROM customers_customer WHERE notes LIKE %s)", [f"{SYNTHETIC_PREFIX}%"])
        cursor.execute("DELETE FROM customers_wallet WHERE customer_id IN (SELECT id FROM customers_customer WHERE notes LIKE %s)", [f"{SYNTHETIC_PREFIX}%"])
        cursor.execute("DELETE FROM customers_customer WHERE notes LIKE %s", [f"{SYNTHETIC_PREFIX}%"])
        deleted_count = cursor.rowcount
    print(f"[+] Physically purged {deleted_count} synthetic customer rows and child relations. Database restored.")


def main():
    print("=" * 70)
    print("  BOOKS3 SEARCH SCALE BENCHMARK: BASELINE vs TOKENIZED ENGINE")
    print(f"  Target: {BENCHMARK_BATCH_SIZE} Records | Storage: Neon PostgreSQL")
    print("=" * 70)
    
    initial_count = Customer.objects.count()
    print(f"[i] Initial Customer Count: {initial_count}")
    
    try:
        seed_synthetic_data(BENCHMARK_BATCH_SIZE)
        total_customers = Customer.objects.count()
        print(f"[i] Benchmarking active on {total_customers} customer rows.\n")
        
        test_matrix = [
            {
                "label": "Scenario 1: Specific Phone Lookup ('9870000050')",
                "baseline_query": "9870000050",
                "token_query": "phone:9870000050",
            },
            {
                "label": "Scenario 2: Common Surname ('Patel')",
                "baseline_query": "Patel",
                "token_query": "Patel",
            },
            {
                "label": "Scenario 3: Multi-term Name ('Ramesh Patel')",
                "baseline_query": "Ramesh Patel",
                "token_query": "Ramesh Patel",
            },
            {
                "label": "Scenario 4: Relational Attribute ('taluka:Bardoli')",
                "baseline_query": "Bardoli",
                "token_query": "taluka:Bardoli",
            },
            {
                "label": "Scenario 5: Numeric Range ('wallet:>500')",
                "baseline_query": "wallet:>500",
                "token_query": "wallet:>500",
            },
            {
                "label": "Scenario 6: Hybrid Composite ('Patel taluka:Bardoli wallet:>500')",
                "baseline_query": "Patel Bardoli",
                "token_query": "Patel taluka:Bardoli wallet:>500",
            },
        ]
        
        results = []
        for test in test_matrix:
            print(f"[*] Running {test['label']}...")
            
            # 1. Baseline
            b_q = compile_baseline_drf_q(test['baseline_query'])
            b_qs_func = lambda: Customer.objects.filter(b_q, is_deleted=False)[:50]
            b_stats = benchmark_query(f"Baseline: {test['baseline_query']}", b_qs_func)
            
            # 2. Tokenized
            t_q = TokenizedQueryCompiler.compile(test['token_query'])
            t_qs_func = lambda: Customer.objects.filter(t_q, is_deleted=False)[:50]
            t_stats = benchmark_query(f"Tokenized: {test['token_query']}", t_qs_func)
            
            results.append({
                'label': test['label'],
                'baseline': b_stats,
                'tokenized': t_stats,
            })
            
        print("\n" + "=" * 90)
        print(f"{'SCENARIO':<35} | {'BASELINE P50':<14} | {'TOKENIZED P50':<14} | {'SPEEDUP / IMPACT':<20}")
        print("=" * 90)
        for r in results:
            b_p50 = r['baseline']['p50']
            t_p50 = r['tokenized']['p50']
            if t_p50 > 0:
                diff = ((b_p50 - t_p50) / b_p50) * 100
                speedup = f"{b_p50 / t_p50:.2f}x ({'+' if diff >= 0 else ''}{diff:.1f}%)"
            else:
                speedup = "N/A"
            print(f"{r['label'][:35]:<35} | {b_p50:>8.2f} ms     | {t_p50:>8.2f} ms     | {speedup}")
        print("=" * 90)
        
    finally:
        cleanup_synthetic_data()
        final_count = Customer.objects.count()
        print(f"[i] Final Customer Count: {final_count} (Must equal initial: {initial_count})")
        assert final_count == initial_count, "Database leakage detected!"

if __name__ == '__main__':
    main()
