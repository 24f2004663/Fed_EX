import psycopg2
from psycopg2.extras import RealDictCursor
import datetime
import uuid
import sys
import argparse
import json
import os

# --- DATABASE CONNECTION ---
def get_db_connection():
    # Use DATABASE_URL from environment (passed by Worker)
    # Fallback to local default if running manually
    db_url = os.environ.get('DATABASE_URL', "postgresql://admin:adminpassword@localhost:5432/fedex_recovery")
    try:
        conn = psycopg2.connect(db_url)
        conn.autocommit = False # Manual commit
        return conn
    except Exception as e:
        print(f"[Allocation.py] DB Connection Failed: {e}")
        sys.exit(1)

# --- AGENCY DEFINITIONS (Source of Truth via DB) ---
def load_agencies():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Fetch only ACTIVE agencies (Soft delete handled by exclusion)
        cur.execute('SELECT * FROM "Agency" WHERE "status" = \'ACTIVE\'')
        rows = cur.fetchall()
        
        agencies = []
        for r in rows:
            # Fetch latest performance to derive score
            cur.execute('SELECT "recoveryRate" FROM "AgencyPerformance" WHERE "agencyId" = %s ORDER BY "month" DESC LIMIT 1', (r['id'],))
            perf = cur.fetchone()
            
            raw_score = 60.0 # Default fallback
            if perf:
                 raw_score = float(perf['recoveryRate'])
            
            norm_score = raw_score / 100.0
            
            # Determine Algo Status (Probationary vs Established) based on score/history
            # In new model, we can rely on score threshold
            algo_status = 'Established' if raw_score > 60 else 'Probationary'
            
            agencies.append({
                'id': r['id'],
                'name': r['name'],
                'score': norm_score,
                'totalCapacity': r['capacity'], 
                'status': algo_status
            })
            
        print(f"[Allocation.py] Loaded {len(agencies)} active agencies from DB.")
        return agencies
    except Exception as e:
        print(f"[Allocation.py] Failed to load agencies from DB: {e}")
        return []
    finally:
        cur.close()
        conn.close()

AGENCIES = load_agencies()

# --- HELPER: LOG AUDIT ---
def log_audit(cur, case_id, actor_id, action, details):
    log_id = str(uuid.uuid4())
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    cur.execute(
        'INSERT INTO "AuditLog" ("id", "caseId", "actorId", "action", "details", "timestamp") VALUES (%s, %s, %s, %s, %s, %s)',
        (log_id, case_id, actor_id, action, details, timestamp)
    )

# --- HELPER: GET CASE / LOAD ---
def get_agency_load(cur, agency_id):
    cur.execute(
        'SELECT COUNT(*) as count FROM "Case" WHERE "assignedToId" = %s AND "status" IN (\'ASSIGNED\', \'WIP\', \'PTP\')',
        (agency_id,)
    )
    return cur.fetchone()['count']

def get_agency_hp_load(cur, agency_id):
    cur.execute(
        'SELECT COUNT(*) as count FROM "Case" WHERE "assignedToId" = %s AND "priority" = \'HIGH\' AND "status" IN (\'ASSIGNED\', \'WIP\', \'PTP\')',
        (agency_id,)
    )
    return cur.fetchone()['count']

# --- ALGORITHM 1: INGESTION ---
def ingest_mock_data():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        print("[Allocation.py] Starting Ingestion with Agencies:", [a['name'] for a in AGENCIES])
        
        # 1. Clean Slate (Use correct table case/quotes for Postgres)
        cur.execute('DELETE FROM "AuditLog"')
        cur.execute('DELETE FROM "SLA"')
        cur.execute('DELETE FROM "Case"')
        cur.execute('DELETE FROM "Invoice"')
        cur.execute('DELETE FROM "User"')
        
        # 2. SEED USERS (Agencies & Manager)
        users_to_seed = []
        for ag in AGENCIES:
            users_to_seed.append((ag['id'], 'AGENCY', ag['name']))
            
        users_to_seed.append(('user-internal-mgr', 'MANAGER', 'FedEx Manager'))
        
        for uid, role, name in users_to_seed:
            email = f"{name.lower().replace(' ', '.')}@example.com"
            cur.execute(
                'INSERT INTO "User" ("id", "email", "name", "role") VALUES (%s, %s, %s, %s)',
                (uid, email, name, role)
            )

        # 3. Generate Queue
        num_cases = 20 # User requested strict cap at 20 invoices regardless of agency count
        raw_queue = []
        
        for i in range(num_cases):
            idx = i + 1
            score = 95 - (i * 2)
            if score < 20: score = 20
            
            amount = 50000.0 - (i * 1000)
            if amount < 1000: amount = 1000
            
            # Dynamic Priority Logic
            if score >= 85: p = 'HIGH'
            elif score >= 70: p = 'MEDIUM'
            else: p = 'LOW'

            due_date = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=30)).isoformat().split('T')[0]

            raw_queue.append({
                'id': f"case-{idx}",
                'invId': f"INV-2026-{str(idx).zfill(3)}",
                'amount': amount,
                'priority': p,
                'aiScore': float(score),
                'dueDate': due_date 
            })
            
        assignments = {} 

        # 4. Reserve for Probationary
        reserve_count = max(1, int(num_cases * 0.10))
        main_queue = list(raw_queue)
        newbies = [a for a in AGENCIES if a['status'] == 'Probationary']
        
        if newbies:
            booked = 0
            for i in range(len(main_queue) - 1, -1, -1):
                if booked >= reserve_count: break
                c = main_queue[i]
                if c['priority'] == 'MEDIUM':
                     target_newbie = newbies[booked % len(newbies)]
                     assignments[c['id']] = target_newbie['id']
                     booked += 1
                     main_queue.pop(i)

        # 5. Main Allocation
        sorted_agencies = sorted(AGENCIES, key=lambda x: x['score'], reverse=True)
        priority_map = {'HIGH': 0, 'MEDIUM': 1, 'LOW': 2}
        main_queue.sort(key=lambda x: priority_map[x['priority']])
        
        for case_item in main_queue:
            for agency in sorted_agencies:
                batch_assigned = sum(1 for cid, aid in assignments.items() if aid == agency['id'])
                if batch_assigned >= agency['totalCapacity']: 
                    continue
                
                # HP Threshold logic
                if case_item['priority'] == 'HIGH':
                    threshold = int(agency['totalCapacity'] * 0.75) if agency['score'] > 0.8 else (int(agency['totalCapacity'] * 0.40) if agency['score'] > 0.5 else 0)
                    batch_hp = 0
                    for cid, aid in assignments.items():
                        if aid == agency['id']:
                            c_p = next((x['priority'] for x in raw_queue if x['id'] == cid), 'LOW')
                            if c_p == 'HIGH':
                                batch_hp += 1

                    if batch_hp >= threshold:
                        continue
                
                assignments[case_item['id']] = agency['id']
                break
        
        # 6. Commit to DB
        now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
        
        for item in raw_queue:

            # Invoice
            cur.execute(
                'INSERT INTO "Invoice" ("id", "invoiceNumber", "amount", "currency", "dueDate", "customerID", "customerName", "region", "status", "createdAt", "updatedAt") VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)',
                (
                    str(uuid.uuid4()), 
                    item['invId'], 
                    item['amount'], 
                    "USD", 
                    f"{item['dueDate']}T00:00:00.000Z", 
                    f"CUST-{item['id']}", 
                    f"Mock Global {item['id']}", 
                    "NA", 
                    "OPEN", 
                    now, 
                    now
                )
            )
            
            # Fetch Invoice UUID
            cur.execute('SELECT "id" FROM "Invoice" WHERE "invoiceNumber" = %s', (item['invId'],))
            inv_row = cur.fetchone()
            
            assigned_agency_id = assignments.get(item['id'])
            status = 'ASSIGNED' if assigned_agency_id else 'QUEUED'
            sla_status = 'ACTIVE' if assigned_agency_id else 'PENDING'
            assigned_at = now if assigned_agency_id else None
            
            cur.execute(
                'INSERT INTO "Case" ("id", "invoiceId", "aiScore", "recoveryProbability", "priority", "status", "assignedToId", "assignedAt", "currentSLAStatus", "createdAt", "updatedAt") VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)',
                (
                    item['id'], 
                    inv_row['id'], 
                    item['aiScore'], 
                    item['aiScore']/100.0, 
                    item['priority'], 
                    status, 
                    assigned_agency_id, 
                    assigned_at, 
                    sla_status, 
                    now, 
                    now
                )
            )
            
            if assigned_agency_id:
                log_audit(cur, item['id'], 'SYSTEM', 'ASSIGNMENT', f"Initial allocation to {assigned_agency_id}")

        conn.commit()
        print("[Allocation.py] Ingestion Complete.")
        
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        cur.close()
        conn.close()


# --- ALGORITHM 2: REALLOCATION (Strict Swap) ---
def reallocate_case(case_id, rejected_by_agency_id):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Get Case
        cur.execute('SELECT * FROM "Case" WHERE "id" = %s', (case_id,))
        case_row = cur.fetchone()
        if not case_row: 
            print(f"Case {case_id} not found.")
            return
        priority = case_row['priority']
        
        print(f"[Allocation.py] Reallocating Case {case_id} (Priority: {priority})...")

        # RULE 1: Low Priority -> Queue
        if priority == 'LOW':
            cur.execute('UPDATE "Case" SET "status" = \'QUEUED\', "assignedToId" = NULL, "assignedAt" = NULL WHERE "id" = %s', (case_id,))
            log_audit(cur, case_id, 'SYSTEM', 'QUEUE_RETURN', 'Low priority rejection. Returned to Queue.')
            conn.commit()
            print("Action: Low Priority -> Queue")
            return 

        # RULE 2: High/Medium -> Search
        cur.execute('SELECT "actorId" FROM "AuditLog" WHERE "caseId" = %s AND "action" IN (\'REJECTION\', \'REJECTED\')', (case_id,))
        past_rejectors_rows = cur.fetchall()
        rejected_agency_ids = {r['actorId'] for r in past_rejectors_rows}
        rejected_agency_ids.add(rejected_by_agency_id)
        
        candidates = [a for a in AGENCIES if a['id'] not in rejected_agency_ids]
        candidates.sort(key=lambda x: x['score'], reverse=True)
            
        chosen_agency = None
        swap_case_id = None
        
        for cand in candidates:
            cand_id = cand['id']
            cand_cap = cand['totalCapacity']
            current_load = get_agency_load(cur, cand_id)
            
            if current_load < cand_cap:
                chosen_agency = cand
                break
            else:
                cur.execute(
                    'SELECT "id" FROM "Case" WHERE "assignedToId" = %s AND "priority" = \'LOW\' AND "status" IN (\'ASSIGNED\', \'WIP\') LIMIT 1',
                    (cand_id,)
                )
                low_case = cur.fetchone()
                
                if low_case:
                    chosen_agency = cand
                    swap_case_id = low_case['id']
                    break
        
        if chosen_agency:
            now_iso = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')

            if swap_case_id:
                cur.execute(
                    'UPDATE "Case" SET "status" = \'QUEUED\', "assignedToId" = NULL, "assignedAt" = NULL, "currentSLAStatus" = \'PENDING\' WHERE "id" = %s',
                    (swap_case_id,)
                )
                log_audit(cur, swap_case_id, 'SYSTEM', 'DISPLACEMENT', f"Displaced by High Priority Case {case_id}. Sent to Queue.")
                print(f"Action: Swapped out {swap_case_id}")
            
            cur.execute(
                'UPDATE "Case" SET "status" = \'ASSIGNED\', "assignedToId" = %s, "assignedAt" = %s, "currentSLAStatus" = \'ACTIVE\' WHERE "id" = %s',
                (chosen_agency['id'], now_iso, case_id)
            )
            
            details = f"Swapped into {chosen_agency['name']} (Displaced Low Case)." if swap_case_id else f"Reallocated to {chosen_agency['name']}."
            log_audit(cur, case_id, 'SYSTEM', 'REALLOCATION', details)
            print(f"Action: {details}")
        else:
            cur.execute('UPDATE "Case" SET "status" = \'QUEUED\', "assignedToId" = NULL WHERE "id" = %s', (case_id,))
            log_audit(cur, case_id, 'SYSTEM', 'QUEUE_WAIT', "All eligible agencies full or rejected. Queued.")
            print("Action: Agencies Full/Rejected -> Queue")

        conn.commit()

    except Exception as e:
        print(f"Error in reallocation: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        cur.close()
        conn.close()

# --- ALGORITHM 3: SLA CHECK ---
def check_sla_breaches():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        print("[Allocation.py] Checking SLA Breaches...")
        
        cur.execute('SELECT * FROM "Case" WHERE "status" = \'ASSIGNED\' AND "currentSLAStatus" = \'ACTIVE\'')
        rows = cur.fetchall()
        
        revoked_count = 0
        now_dt = datetime.datetime.now(datetime.timezone.utc)
        
        for row in rows:
            if not row['assignedAt']: continue
            
            try:
                assigned_at = row['assignedAt']
                # If assigned_at is string (it is in simple fetch), parse it
                if isinstance(assigned_at, str):
                     assigned_at = datetime.datetime.fromisoformat(assigned_at.replace('Z', '+00:00'))
            except ValueError:
                continue

            elapsed_hours = (now_dt - assigned_at).total_seconds() / 3600.0
            
            limit = 120 
            if row['priority'] == 'HIGH': limit = 24 
            elif row['priority'] == 'MEDIUM': limit = 72 
            
            if elapsed_hours > limit:
                cur.execute(
                    'UPDATE "Case" SET "status" = \'REVOKED\', "currentSLAStatus" = \'BREACHED\', "assignedToId" = NULL WHERE "id" = %s',
                    (row['id'],)
                )
                
                agency_name = "Unknown Agency"
                if row['assignedToId']:
                    ag = next((a for a in AGENCIES if a['id'] == row['assignedToId']), None)
                    if ag: agency_name = ag['name']
                
                log_audit(cur, row['id'], 'SYSTEM_DAEMON', 'SLA_BREACH', f"Offer revoked. Timeout > {limit}h. Agency {agency_name} penalized.")
                revoked_count += 1
                
        conn.commit()
        print(f"[Allocation.py] SLA Check Complete. Revoked: {revoked_count}")

    except Exception as e:
        print(f"Error in SLA Check: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        cur.close()
        conn.close()

# --- ALGORITHM 4: ALLOCATE EXISTING ---
def allocate_existing_cases():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        print("[Allocation.py] Fetching unassigned cases...")
        cur.execute('SELECT * FROM "Case" WHERE "status" IN (\'NEW\', \'QUEUED\') AND "assignedToId" IS NULL')
        rows = cur.fetchall()
        
        if not rows:
            print("[Allocation.py] No unassigned cases found.")
            return

        print(f"[Allocation.py] Found {len(rows)} unassigned cases. Running allocation...")
        
        # Convert to format needed by logic
        main_queue = []
        for r in rows:
            # We assume priority is set. If not, default to LOW.
            p = r['priority'] if r['priority'] in ['HIGH', 'MEDIUM', 'LOW'] else 'LOW'
            main_queue.append({
                'id': r['id'],
                'priority': p,
                'aiScore': float(r['aiScore']) if r['aiScore'] else 50.0
            })

        assignments = {}
        
        # Logic: Reserve for Probationary
        reserve_count = max(1, int(len(main_queue) * 0.10))
        queue_copy = list(main_queue) 
        newbies = [a for a in AGENCIES if a['status'] == 'Probationary']
        
        if newbies:
            booked = 0
            for i in range(len(queue_copy) - 1, -1, -1):
                if booked >= reserve_count: break
                c = queue_copy[i]
                if c['priority'] == 'MEDIUM':
                     target_newbie = newbies[booked % len(newbies)]
                     assignments[c['id']] = target_newbie['id']
                     booked += 1
                     queue_copy.pop(i)

        # Logic: Main Allocation
        sorted_agencies = sorted(AGENCIES, key=lambda x: x['score'], reverse=True)
        priority_map = {'HIGH': 0, 'MEDIUM': 1, 'LOW': 2}
        
        def get_prio(x):
            return priority_map.get(x['priority'], 2)

        queue_copy.sort(key=get_prio)
        
        for case_item in queue_copy:
            for agency in sorted_agencies:
                # Check current DB load + batch assignments
                current_db_load = get_agency_load(cur, agency['id'])
                batch_assigned = sum(1 for cid, aid in assignments.items() if aid == agency['id'])
                total_load = current_db_load + batch_assigned
                
                if total_load >= agency['totalCapacity']: 
                    continue
                
                # HP Threshold logic 
                if case_item['priority'] == 'HIGH':
                    threshold = int(agency['totalCapacity'] * 0.75) if agency['score'] > 0.8 else (int(agency['totalCapacity'] * 0.40) if agency['score'] > 0.5 else 0)
                    
                    current_hp_load = get_agency_hp_load(cur, agency['id'])
                    batch_hp = 0
                    for cid, aid in assignments.items():
                        if aid == agency['id']:
                            c_p = next((x['priority'] for x in main_queue if x['id'] == cid), 'LOW')
                            if c_p == 'HIGH':
                                batch_hp += 1
                    
                    if (current_hp_load + batch_hp) >= threshold:
                        continue
                
                assignments[case_item['id']] = agency['id']
                break

        # Commit Updates
        print(f"[Allocation.py] Committing {len(assignments)} assignments...")
        now_iso = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
        
        for cid, aid in assignments.items():
            cur.execute(
                'UPDATE "Case" SET "status" = \'ASSIGNED\', "assignedToId" = %s, "assignedAt" = %s, "currentSLAStatus" = \'ACTIVE\' WHERE "id" = %s',
                (aid, now_iso, cid)
            )
            log_audit(cur, cid, 'SYSTEM', 'ASSIGNMENT', f"Auto-allocated to {aid}")

        conn.commit()
        print("[Allocation.py] Allocation Complete.")

    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        cur.close()
        conn.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=['ingest', 'reallocate', 'check_sla', 'allocate'], required=True)
    parser.add_argument('--case_id')
    parser.add_argument('--rejected_by')
    
    args = parser.parse_args()
    
    if args.mode == 'ingest':
        ingest_mock_data()
    elif args.mode == 'reallocate':
        if not args.case_id or not args.rejected_by:
            print("Error: Reallocation requires --case_id and --rejected_by")
        else:
            reallocate_case(args.case_id, args.rejected_by)
    elif args.mode == 'check_sla':
        check_sla_breaches()
    elif args.mode == 'allocate':
        allocate_existing_cases()